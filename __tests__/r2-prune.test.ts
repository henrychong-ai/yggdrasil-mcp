import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * Runs `scripts/r2-prune.sh` against generated ListObjectsV2 XML.
 *
 * Offline tests use `--list-file`, which needs no network and no credentials.
 * Online-path tests put a fake `curl` first on PATH: it serves a fixture listing,
 * answers DELETE with a scripted status, and records every call, so the delete
 * loop is exercised without a request ever leaving the machine.
 */

const scriptPath = resolve(process.cwd(), 'scripts/r2-prune.sh');
const packagePath = resolve(process.cwd(), 'package.json');
const CURRENT = (JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string }).version;

// With --today 2026-10-02 the cutoff is 2026-07-04 (90 days earlier).
const TODAY = '2026-10-02';
const OLD = '2026-07-03T23:59:59.000Z'; // the day before the cutoff: a candidate
const EDGE = '2026-07-04T00:00:00.000Z'; // the cutoff day itself: kept
const YOUNG = '2026-09-20T08:00:00.000Z';

const PREFIX = 'yggdrasil-mcp/';
const FAKE_ACCOUNT = 'a1b2c3d4'.repeat(4);
const FAKE_KEY_ID = 'test-access-key-id';
const FAKE_SECRET = 'test-secret-access-key';
const ENDPOINT = `https://${FAKE_ACCOUNT}.r2.cloudflarestorage.com/packages`;

type ListedObject = readonly [key: string, lastModified: string];

function artefactSet(version: string, lastModified: string): ListedObject[] {
  return ['mcpb', 'mcpb.sha256', 'zip', 'zip.sha256'].map(
    (extension) => [`${PREFIX}yggdrasil-mcp-${version}.${extension}`, lastModified] as const
  );
}

function listing(objects: readonly ListedObject[], isTruncated: string | null = 'false'): string {
  const contents = objects
    .map(
      ([key, lastModified]) =>
        `<Contents><Key>${key}</Key><Size>1024</Size>` +
        `<LastModified>${lastModified}</LastModified><ETag>"etag"</ETag></Contents>`
    )
    .join('');
  const truncated = isTruncated === null ? '' : `<IsTruncated>${isTruncated}</IsTruncated>`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">' +
    `<Name>packages</Name><Prefix>${PREFIX}</Prefix>${contents}${truncated}` +
    `<KeyCount>${objects.length}</KeyCount><MaxKeys>1000</MaxKeys></ListBucketResult>`
  );
}

const FAKE_CURL = [
  '#!/usr/bin/env bash',
  '# Test double for curl: never opens a connection.',
  'set -u',
  'cat > "$FAKE_DIR/stdin.$$"',
  'cat "$FAKE_DIR/stdin.$$" >> "$FAKE_DIR/stdin.log"',
  'printf "%s\\n" "$*" >> "$FAKE_DIR/argv.log"',
  'method=GET',
  'out=/dev/null',
  'url=""',
  'while [ $# -gt 0 ]; do',
  '  case "$1" in',
  '    -o) out="$2"; shift 2 ;;',
  '    -X) method="$2"; shift 2 ;;',
  '    -w | --config | --aws-sigv4 | --connect-timeout | --max-time) shift 2 ;;',
  '    -*) shift ;;',
  '    *) url="$1"; shift ;;',
  '  esac',
  'done',
  'printf "%s %s\\n" "$method" "$url" >> "$FAKE_DIR/calls.log"',
  'if [ -n "${FAKE_CURL_EXIT:-}" ]; then',
  '  echo "curl: (7) simulated connection failure" >&2',
  '  exit "$FAKE_CURL_EXIT"',
  'fi',
  'if [ "$method" = DELETE ]; then',
  '  case "$url" in',
  '    *"${FAKE_DELETE_FAIL:-<none>}") printf 500 ;;',
  '    *) printf 204 ;;',
  '  esac',
  '  exit 0',
  'fi',
  'if grep -q "^DELETE " "$FAKE_DIR/calls.log" && [ -f "$FAKE_DIR/after.xml" ]; then',
  '  cp "$FAKE_DIR/after.xml" "$out"',
  'else',
  '  cp "$FAKE_DIR/listing.xml" "$out"',
  'fi',
  'printf "%s" "${FAKE_LIST_CODE:-200}"',
  '',
].join('\n');

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'r2-prune-test-'));
  writeFileSync(join(workDir, 'curl'), FAKE_CURL);
  chmodSync(join(workDir, 'curl'), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const CREDENTIALS = {
  R2_ACCESS_KEY_ID: FAKE_KEY_ID,
  R2_SECRET_ACCESS_KEY: FAKE_SECRET,
  CLOUDFLARE_ACCOUNT_ID: FAKE_ACCOUNT,
};

type RunResult = { status: number | null; stdout: string; stderr: string };

/** Runs the script with the fake curl first on PATH and no inherited credentials. */
function run(args: readonly string[], extraEnv: Record<string, string> = {}): RunResult {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined) env[name] = value;
  }
  delete env['R2_ACCESS_KEY_ID'];
  delete env['R2_SECRET_ACCESS_KEY'];
  delete env['CLOUDFLARE_ACCOUNT_ID'];
  const result = spawnSync('bash', [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...env,
      ...extraEnv,
      FAKE_DIR: workDir,
      PATH: `${workDir}:${process.env['PATH'] ?? ''}`,
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function writeListing(xml: string, name = 'listing.xml'): string {
  const path = join(workDir, name);
  writeFileSync(path, xml);
  return path;
}

function offline(objects: readonly ListedObject[], isTruncated: string | null = 'false') {
  return run(['--list-file', writeListing(listing(objects, isTruncated)), '--today', TODAY]);
}

function pruneKeys(stdout: string): string[] {
  return [...stdout.matchAll(/^ {2}PRUNE: (\S+) /gm)].map((match) => match[1] ?? '');
}

function curlCalls(): string[] {
  const log = join(workDir, 'calls.log');
  return existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n') : [];
}

const LIST_CALL = `GET ${ENDPOINT}/?list-type=2&prefix=${PREFIX}`;

/** A bucket prefix with one of everything the selection has to tell apart. */
const BUCKET: readonly ListedObject[] = [
  ...artefactSet('0.9.0', OLD), // old release: all four files are candidates
  ...artefactSet(CURRENT, OLD), // current version: kept whatever its age
  ...artefactSet('0.9.1', YOUNG), // inside the retention window: kept
  [`${PREFIX}yggdrasil-mcp-0.9.2.mcpb`, EDGE], // uploaded on the cutoff day: kept
  [`${PREFIX}yggdrasil-mcp-0.9.3-rc.0.mcpb`, OLD], // old pre-release: candidate
  [`${PREFIX}yggdrasil-mcp-0.9.3-beta-1.zip.sha256`, OLD], // hyphenated pre-release id: candidate
  [`${PREFIX}yggdrasil-mcp-${CURRENT}-rc.0.zip`, OLD], // pre-release of the current version: candidate
  [`${PREFIX}yggdrasil-mcp-0.9.4-rc.0.zip`, YOUNG], // young pre-release: kept
  [`${PREFIX}yggdrasil-mcp-latest.mcpb`, OLD],
  [`${PREFIX}yggdrasil-mcp-latest.mcpb.sha256`, OLD],
  [`${PREFIX}yggdrasil-mcp-latest.zip`, OLD],
  [`${PREFIX}yggdrasil-mcp-latest.zip.sha256`, OLD],
  [`${PREFIX}yggdrasil-mcp-0.9.5-latest.zip`, OLD], // "latest" anywhere in the name: kept
  [`${PREFIX}SHA256SUMS`, OLD],
  [`${PREFIX}yggdrasil-mcp-0.9.0.SHA256SUMS.zip`, OLD],
  [`${PREFIX}install.html`, OLD],
  [`${PREFIX}notes.txt`, OLD],
  [`${PREFIX}yggdrasil-mcp-0.9.0.tar.gz`, OLD], // not a release artefact extension
  [`${PREFIX}yggdrasil-mcp-0.9.0.mcpb.bak`, OLD],
  [`${PREFIX}yggdrasil-mcp-0.9.zip`, OLD], // not a full semver
  [`${PREFIX}yggdrasil-mcp-0.9.0`, OLD],
  [`${PREFIX}archive/yggdrasil-mcp-0.9.0.zip`, OLD], // nested below the prefix
  ['other-project/yggdrasil-mcp-0.9.0.zip', OLD], // another prefix entirely
];

const EXPECTED_CANDIDATES = [
  `${PREFIX}yggdrasil-mcp-0.9.0.mcpb`,
  `${PREFIX}yggdrasil-mcp-0.9.0.mcpb.sha256`,
  `${PREFIX}yggdrasil-mcp-0.9.0.zip`,
  `${PREFIX}yggdrasil-mcp-0.9.0.zip.sha256`,
  `${PREFIX}yggdrasil-mcp-0.9.3-rc.0.mcpb`,
  `${PREFIX}yggdrasil-mcp-0.9.3-beta-1.zip.sha256`,
  `${PREFIX}yggdrasil-mcp-${CURRENT}-rc.0.zip`,
];

describe('r2-prune.sh selection (offline, --list-file)', () => {
  it('selects exactly the old versioned artefacts and their sidecars', () => {
    const result = offline(BUCKET);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(pruneKeys(result.stdout)).toEqual(EXPECTED_CANDIDATES);
    expect(result.stdout).toContain(`=== Prune candidates (${EXPECTED_CANDIDATES.length}) ===`);
    expect(result.stdout).toContain(`=== Objects under ${PREFIX} (${BUCKET.length}) ===`);
  });

  it('keeps the current version however old it is', () => {
    const result = offline([...artefactSet(CURRENT, '2020-01-01T00:00:00.000Z')]);
    expect(result.status).toBe(0);
    expect(pruneKeys(result.stdout)).toEqual([]);
    expect(result.stdout).toContain(`Current version (always kept): ${CURRENT}`);
  });

  it('prunes every other version when all of them are past the cutoff', () => {
    const result = offline([
      ...artefactSet('0.8.0', OLD),
      ...artefactSet('0.9.0', OLD),
      ...artefactSet(CURRENT, OLD),
    ]);
    expect(result.status).toBe(0);
    expect(pruneKeys(result.stdout)).toEqual(
      [...artefactSet('0.8.0', OLD), ...artefactSet('0.9.0', OLD)].map(([key]) => key)
    );
  });

  it.each([
    ['a latest pointer', `${PREFIX}yggdrasil-mcp-latest.mcpb`],
    ['a latest sidecar', `${PREFIX}yggdrasil-mcp-latest.zip.sha256`],
    ['the checksum aggregate', `${PREFIX}SHA256SUMS`],
    ['the install page', `${PREFIX}install.html`],
  ])('never selects %s', (_label, key) => {
    const result = offline([...artefactSet(CURRENT, OLD), [key, '2019-01-01T00:00:00.000Z']]);
    expect(result.status).toBe(0);
    expect(pruneKeys(result.stdout)).toEqual([]);
  });

  it('keeps an object uploaded on the cutoff day and prunes one from the day before', () => {
    const result = offline([
      ...artefactSet(CURRENT, YOUNG),
      [`${PREFIX}yggdrasil-mcp-0.9.1.zip`, EDGE],
      [`${PREFIX}yggdrasil-mcp-0.9.0.zip`, OLD],
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Cutoff (UTC): 2026-07-04;');
    expect(pruneKeys(result.stdout)).toEqual([`${PREFIX}yggdrasil-mcp-0.9.0.zip`]);
  });

  it('uses the real date when --today is not given', () => {
    const now = new Date().toISOString();
    const result = run([
      '--list-file',
      writeListing(
        listing([
          ...artefactSet(CURRENT, now),
          [`${PREFIX}yggdrasil-mcp-0.9.1.zip`, now],
          [`${PREFIX}yggdrasil-mcp-0.9.0.zip`, '2001-01-01T00:00:00.000Z'],
        ])
      ),
    ]);
    expect(result.status).toBe(0);
    expect(pruneKeys(result.stdout)).toEqual([`${PREFIX}yggdrasil-mcp-0.9.0.zip`]);
  });

  it('needs no credentials and makes no request', () => {
    const result = offline(BUCKET);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('OFFLINE:');
    expect(curlCalls()).toEqual([]);
  });
});

describe('r2-prune.sh refuses an unusable listing', () => {
  it('fails on a truncated listing and selects nothing', () => {
    const result = offline(BUCKET, 'true');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('truncated');
    expect(pruneKeys(result.stdout)).toEqual([]);
  });

  it('fails when the listing does not say whether it is complete', () => {
    const result = offline(BUCKET, null);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('truncated');
    expect(pruneKeys(result.stdout)).toEqual([]);
  });

  it('fails on an S3 error document', () => {
    const path = writeListing(
      '<?xml version="1.0" encoding="UTF-8"?><Error><Code>AccessDenied</Code>' +
        '<Message>Access Denied</Message></Error>'
    );
    const result = run(['--list-file', path, '--today', TODAY]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not a ListObjectsV2 result');
    expect(result.stderr).toContain('AccessDenied');
  });

  it.each([
    ['an empty file', ''],
    ['text that is not XML', 'Bad Gateway'],
    ['XML cut off mid-document', listing(BUCKET).slice(0, 400)],
  ])('fails on %s', (_label, body) => {
    const result = run(['--list-file', writeListing(body), '--today', TODAY]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not readable XML');
    expect(pruneKeys(result.stdout)).toEqual([]);
  });

  it('fails when an object has no usable LastModified instead of treating it as old', () => {
    const result = offline([
      ...artefactSet(CURRENT, YOUNG),
      [`${PREFIX}yggdrasil-mcp-0.9.0.zip`, ''],
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unreadable LastModified');
    expect(pruneKeys(result.stdout)).toEqual([]);
  });

  it('fails when the package.json version has no artefact in the listing', () => {
    const result = offline([...artefactSet('0.9.0', OLD), ...artefactSet('0.9.1', YOUNG)]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`no artefact for the package.json version (${CURRENT})`);
    expect(pruneKeys(result.stdout)).toEqual([]);
  });
});

describe('r2-prune.sh arguments and environment', () => {
  it('refuses --apply with --list-file and makes no request', () => {
    const path = writeListing(listing(BUCKET));
    const result = run(['--apply', '--list-file', path, '--today', TODAY], CREDENTIALS);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--apply cannot be combined with --list-file');
    expect(result.stdout).toBe('');
    expect(curlCalls()).toEqual([]);
  });

  it('refuses --today without --list-file', () => {
    const result = run(['--today', TODAY], CREDENTIALS);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('--today is only accepted together with --list-file');
    expect(curlCalls()).toEqual([]);
  });

  it('refuses an unknown argument', () => {
    const result = run(['--delete'], CREDENTIALS);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
    expect(curlCalls()).toEqual([]);
  });

  it.each(['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'CLOUDFLARE_ACCOUNT_ID'] as const)(
    'exits non-zero naming %s when it is missing',
    (name) => {
      writeListing(listing(BUCKET));
      const env: Record<string, string> = { ...CREDENTIALS };
      delete env[name];
      for (const args of [[], ['--apply']]) {
        const result = run(args, env);
        expect(result.status).toBe(2);
        expect(result.stderr).toContain(`missing environment variable(s): ${name}`);
      }
      expect(curlCalls()).toEqual([]);
    }
  );

  it('rejects an account ID that is not 32 hex characters without echoing it', () => {
    writeListing(listing(BUCKET));
    const bad = 'attacker.example/path';
    const result = run(['--apply'], { ...CREDENTIALS, CLOUDFLARE_ACCOUNT_ID: bad });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('CLOUDFLARE_ACCOUNT_ID is not 32 lowercase hexadecimal');
    expect(result.stderr + result.stdout).not.toContain(bad);
    expect(curlCalls()).toEqual([]);
  });

  it('rejects an unresolved secret reference without echoing it', () => {
    writeListing(listing(BUCKET));
    const reference = 'op://your-vault/your-item/secret-access-key';
    const result = run([], { ...CREDENTIALS, R2_SECRET_ACCESS_KEY: reference });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('R2_SECRET_ACCESS_KEY contains unexpected characters');
    expect(result.stderr + result.stdout).not.toContain(reference);
    expect(curlCalls()).toEqual([]);
  });
});

describe('r2-prune.sh online path (fake curl)', () => {
  it('dry run lists once and deletes nothing', () => {
    writeListing(listing(BUCKET));
    const result = run([], CREDENTIALS);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(curlCalls()).toEqual([LIST_CALL]);
    expect(result.stdout).toContain('DRY RUN: nothing deleted.');
  });

  it('passes the key pair on stdin, never in the argument list or the output', () => {
    writeListing(listing(BUCKET));
    const result = run([], CREDENTIALS);
    expect(result.status).toBe(0);
    const argv = readFileSync(join(workDir, 'argv.log'), 'utf8');
    expect(argv).toContain('--aws-sigv4 aws:amz:auto:s3');
    expect(argv).not.toContain(FAKE_SECRET);
    expect(argv).not.toContain(FAKE_KEY_ID);
    expect(readFileSync(join(workDir, 'stdin.log'), 'utf8')).toBe(
      `user = "${FAKE_KEY_ID}:${FAKE_SECRET}"\n`
    );
    expect(result.stdout + result.stderr).not.toContain(FAKE_SECRET);
  });

  it('--apply deletes exactly the candidates, in order, then lists again', () => {
    const before = [
      ...artefactSet('0.9.0', OLD),
      ...artefactSet(CURRENT, OLD),
      [`${PREFIX}install.html`, OLD] as const,
      [`${PREFIX}yggdrasil-mcp-latest.mcpb`, OLD] as const,
    ];
    writeListing(listing(before));
    writeListing(listing(before.slice(4)), 'after.xml');
    const result = run(['--apply'], CREDENTIALS);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(curlCalls()).toEqual([
      LIST_CALL,
      ...artefactSet('0.9.0', OLD).map(([key]) => `DELETE ${ENDPOINT}/${key}`),
      LIST_CALL,
    ]);
    expect(result.stdout).toContain('Deleted 4 object(s).');
    expect(result.stdout).toContain('No prune candidates remain.');
  });

  it('--apply stops at the first delete that does not return 204', () => {
    writeListing(listing([...artefactSet('0.9.0', OLD), ...artefactSet(CURRENT, OLD)]));
    const keys = artefactSet('0.9.0', OLD).map(([key]) => key);
    const result = run(['--apply'], { ...CREDENTIALS, FAKE_DELETE_FAIL: keys[1] ?? '' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`DELETE returned HTTP 500 for ${keys[1]}, expected 204`);
    expect(result.stderr).toContain('stopped after 1 delete(s)');
    expect(curlCalls()).toEqual([
      LIST_CALL,
      `DELETE ${ENDPOINT}/${keys[0]}`,
      `DELETE ${ENDPOINT}/${keys[1]}`,
    ]);
  });

  it('--apply with no candidates deletes nothing', () => {
    writeListing(listing([...artefactSet(CURRENT, OLD), ...artefactSet('0.9.1', YOUNG)]));
    const result = run(['--apply'], CREDENTIALS);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Nothing to delete.');
    expect(curlCalls()).toEqual([LIST_CALL]);
  });

  it('--apply deletes nothing when the listing is truncated', () => {
    writeListing(listing(BUCKET, 'true'));
    const result = run(['--apply'], CREDENTIALS);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('truncated');
    expect(curlCalls()).toEqual([LIST_CALL]);
  });

  it('--apply deletes nothing when the listing is not HTTP 200', () => {
    writeListing(listing(BUCKET));
    const result = run(['--apply'], { ...CREDENTIALS, FAKE_LIST_CODE: '403' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('listing returned HTTP 403, expected 200');
    expect(curlCalls()).toEqual([LIST_CALL]);
  });

  it('--apply deletes nothing when curl itself fails', () => {
    writeListing(listing(BUCKET));
    const result = run(['--apply'], { ...CREDENTIALS, FAKE_CURL_EXIT: '7' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('listing request failed');
    expect(curlCalls()).toEqual([LIST_CALL]);
  });

  it('--apply fails when candidates are still listed after the deletes', () => {
    // No after.xml: the second listing repeats the first, as if the deletes had no effect.
    writeListing(listing([...artefactSet('0.9.0', OLD), ...artefactSet(CURRENT, OLD)]));
    const result = run(['--apply'], CREDENTIALS);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('candidates are still listed after the deletes');
  });
});
