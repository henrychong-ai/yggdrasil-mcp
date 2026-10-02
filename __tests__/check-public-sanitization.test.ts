import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  contentFindings,
  forbiddenPathReason,
  ORGANISATION_NAME_HASHES,
  PRIVATE_EMAIL_HASHES,
  PRIVATE_IDENTIFIER_HASHES,
  RULE_IDS,
  scanRepository,
} from '../scripts/check-public-sanitization.mjs';

/**
 * Tests for the public-content gate.
 *
 * This file is itself scanned by the gate, so no forbidden sample is written
 * here literally: each one is assembled from fragments at run time.
 */

const checkerPath = resolve(process.cwd(), 'scripts/check-public-sanitization.mjs');

const SECRET_SCHEME = ['op:', '//'].join('');
const SECRET_REFERENCE = `${SECRET_SCHEME}Private-Vault/Some Item/credential`;
const PLACEHOLDER_REFERENCE = `${SECRET_SCHEME}your-vault/your-item/field`;
const HOME_PATH = `${['', 'Users', 'someone', 'repos', 'project'].join('/')}/`;
const ACCOUNT_HOST = ['acme-family', '1password', 'com'].join('.');
const TAILNET_HOST = ['build-box', 'tail-scale-name', 'ts', 'net'].join('.');
const SERVER_NAME = ['vps', '2'].join('-');
/** The public canary whose hash heads the built-in identifier list. */
const CANARY_IDENTIFIER = '0123456789abcdef'.repeat(2);
/** The public canary whose hash heads the built-in email list. */
const CANARY_EMAIL = ['private-canary', 'example.invalid'].join('@');
/** The public canary whose hash heads the built-in organisation-name list. */
const CANARY_ORGANISATION = ['gatecanary', 'orgname'].join('');
/** A made-up organisation name that is in no list. */
const UNLISTED_ORGANISATION = ['northwind', 'traders'].join('');
/** A 32-hex value that is in no list. */
const UNLISTED_IDENTIFIER = 'a1b2c3d4'.repeat(4);

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');
const rulesIn = (text: string, options?: Parameters<typeof contentFindings>[1]): string[] =>
  contentFindings(text, options).map((finding: { rule: string }) => finding.rule);

describe('contentFindings', () => {
  it('accepts ordinary public content', () => {
    const text = [
      'Download from https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb',
      'Vanity link: https://henrychong.com/yggdrasil-latest',
      'Author: Henry Chong <henrychong-ai@gmail.com>',
      'Questions: support@npmjs.com',
      `R2_ACCESS_KEY_ID=${PLACEHOLDER_REFERENCE}`,
      'WORKDIR /home/node/app',
      'sha256 3eb1bd439947eb762998e566ccc2e099c791118b2f40579cc4f7da2b5061b7f9',
      `account ${UNLISTED_IDENTIFIER}`,
      'import { thing } from "./lib.ts";',
    ].join('\n');
    expect(contentFindings(text)).toEqual([]);
  });

  it('flags a personal home path and reports its line, not its text', () => {
    const findings = contentFindings(`first line\ncd ${HOME_PATH}\n`);
    expect(findings).toEqual([
      { rule: 'home-path', line: 2, message: expect.stringContaining('home directory') },
    ]);
    expect(JSON.stringify(findings)).not.toContain('someone');
  });

  it.each([
    '/Users/<name>/project/',
    '/Users/you/project/',
    '/Users/YOUR_USERNAME/project/',
    '/Users/$USER/project/',
    '/Users/username/Library/',
  ])('accepts the placeholder home path %s', (path) => {
    expect(rulesIn(`see ${path}`)).toEqual([]);
  });

  it('flags a secret-manager reference that is not a placeholder', () => {
    expect(rulesIn(`KEY=${SECRET_REFERENCE}`)).toEqual(['secret-reference']);
    expect(rulesIn(`read '${SECRET_SCHEME}Engineering/item/field'`)).toEqual(['secret-reference']);
  });

  it('accepts placeholder references and a bare mention of the scheme', () => {
    expect(rulesIn(`KEY=${PLACEHOLDER_REFERENCE}`)).toEqual([]);
    expect(rulesIn(`KEY=${SECRET_SCHEME}Your-Vault/Item/field`)).toEqual([]);
    expect(rulesIn(`references start with \`${SECRET_SCHEME}\` followed by a vault`)).toEqual([]);
    expect(rulesIn(`${SECRET_SCHEME}<vault>/<item>/<field>`)).toEqual([]);
  });

  it('flags a named password-manager account host but not the generic ones', () => {
    expect(rulesIn(`op --account ${ACCOUNT_HOST} read`)).toEqual(['password-manager-account']);
    expect(rulesIn('sign in at my.1password.com or see developer.1password.com')).toEqual([]);
    expect(rulesIn('op --account your-account.1password.com read')).toEqual([]);
  });

  it('flags a tailnet host name but not a placeholder', () => {
    expect(rulesIn(`ssh root@${TAILNET_HOST}`)).toEqual(['tailnet-host']);
    expect(rulesIn(`https://${TAILNET_HOST.toUpperCase()}/dashboards/`)).toEqual(['tailnet-host']);
    expect(rulesIn('https://host.your-tailnet.ts.net/')).toEqual([]);
  });

  it('flags a private server name', () => {
    expect(rulesIn(`deploy to ${SERVER_NAME} tonight`)).toEqual(['private-server']);
    expect(rulesIn(`deploy to ${SERVER_NAME.toUpperCase()}`)).toEqual(['private-server']);
    expect(rulesIn('the vps-provider docs')).toEqual([]);
  });

  it('flags a hashed identifier wherever it appears in a line', () => {
    expect(rulesIn(`ACCOUNT_ID=${CANARY_IDENTIFIER}`)).toEqual(['private-identifier']);
    expect(rulesIn(`https://${CANARY_IDENTIFIER}.r2.cloudflarestorage.com`)).toEqual([
      'private-identifier',
    ]);
    expect(rulesIn(`id: "${CANARY_IDENTIFIER.toUpperCase()}"`)).toEqual(['private-identifier']);
  });

  it('does not treat part of a longer hex string as an identifier', () => {
    expect(rulesIn(`digest ${CANARY_IDENTIFIER}${CANARY_IDENTIFIER}`)).toEqual([]);
    expect(rulesIn(`digest ${CANARY_IDENTIFIER}0`)).toEqual([]);
  });

  it('flags an identifier from a supplied hash list and nothing else', () => {
    const identifierHashes = new Set([sha256(UNLISTED_IDENTIFIER)]);
    expect(rulesIn(`id ${UNLISTED_IDENTIFIER}`, { identifierHashes })).toEqual([
      'private-identifier',
    ]);
    expect(rulesIn(`id ${CANARY_IDENTIFIER}`, { identifierHashes })).toEqual([]);
  });

  it('flags a hashed email address, ignoring case and a +tag', () => {
    const [local, domain] = CANARY_EMAIL.split('@') as [string, string];
    expect(rulesIn(`mail ${CANARY_EMAIL}`)).toEqual(['private-email']);
    expect(rulesIn(`mail <${CANARY_EMAIL.toUpperCase()}>`)).toEqual(['private-email']);
    expect(rulesIn(`mail ${local}+alerts@${domain}`)).toEqual(['private-email']);
    expect(rulesIn(`mail someone-else@${domain}`)).toEqual([]);
  });

  it('flags a hashed organisation name in any letter case', () => {
    const titleCase = `${CANARY_ORGANISATION[0]?.toUpperCase()}${CANARY_ORGANISATION.slice(1)}`;
    expect(rulesIn(`uploaded to the ${CANARY_ORGANISATION} workspace`)).toEqual([
      'organisation-name',
    ]);
    expect(rulesIn(`${titleCase} Group typography`)).toEqual(['organisation-name']);
    expect(rulesIn(CANARY_ORGANISATION.toUpperCase())).toEqual(['organisation-name']);
  });

  it('finds an organisation name inside a longer token, split on anything but a letter', () => {
    expect(rulesIn(`https://assets.${CANARY_ORGANISATION}.co/fonts/a.woff2`)).toEqual([
      'organisation-name',
    ]);
    expect(rulesIn(`the ${CANARY_ORGANISATION}-internal channel`)).toEqual(['organisation-name']);
    expect(rulesIn(`${CANARY_ORGANISATION}_teams and ${CANARY_ORGANISATION}2`)).toEqual([
      'organisation-name',
    ]);
    expect(rulesIn(`ops@${CANARY_ORGANISATION}.example`)).toEqual(['organisation-name']);
  });

  it('matches whole runs of letters only, so a longer word is not a finding', () => {
    expect(rulesIn(`${CANARY_ORGANISATION}s`)).toEqual([]);
    expect(rulesIn(`pre${CANARY_ORGANISATION}`)).toEqual([]);
    expect(rulesIn('gatecanary orgname, as two words')).toEqual([]);
  });

  it('flags an organisation name from a supplied hash list and nothing else', () => {
    const organisationHashes = new Set([sha256(UNLISTED_ORGANISATION)]);
    expect(rulesIn(`built for ${UNLISTED_ORGANISATION}`, { organisationHashes })).toEqual([
      'organisation-name',
    ]);
    expect(rulesIn(`built for ${CANARY_ORGANISATION}`, { organisationHashes })).toEqual([]);
    expect(rulesIn(`built for ${UNLISTED_ORGANISATION}`)).toEqual([]);
  });

  it('reports an organisation name by line and rule, never by its text', () => {
    const findings = contentFindings(`first line\nthe ${CANARY_ORGANISATION} team\n`);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'organisation-name', line: 2 });
    expect(JSON.stringify(findings)).not.toContain(CANARY_ORGANISATION);
  });

  it('reports one finding per rule and line, in line order', () => {
    const text = [
      `${SERVER_NAME} and ${SERVER_NAME} again`,
      'clean',
      `${SECRET_REFERENCE} on ${TAILNET_HOST}`,
    ].join('\n');
    expect(
      contentFindings(text).map(({ rule, line }: { rule: string; line: number }) => [rule, line])
    ).toEqual([
      ['private-server', 1],
      ['secret-reference', 3],
      ['tailnet-host', 3],
    ]);
  });

  it('stores only hashes: 64 hex characters each, never a raw value', () => {
    for (const hash of [
      ...PRIVATE_IDENTIFIER_HASHES,
      ...PRIVATE_EMAIL_HASHES,
      ...ORGANISATION_NAME_HASHES,
    ]) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(ORGANISATION_NAME_HASHES.has(sha256(CANARY_ORGANISATION))).toBe(true);
    expect(ORGANISATION_NAME_HASHES.size).toBeGreaterThan(1);
    expect(PRIVATE_IDENTIFIER_HASHES.has(sha256(CANARY_IDENTIFIER))).toBe(true);
    expect(PRIVATE_IDENTIFIER_HASHES.size).toBeGreaterThan(1);
    expect(PRIVATE_EMAIL_HASHES.has(sha256(CANARY_EMAIL))).toBe(true);
    expect(PRIVATE_EMAIL_HASHES.size).toBeGreaterThan(1);
    expect(RULE_IDS).toEqual([
      'home-path',
      'secret-reference',
      'password-manager-account',
      'tailnet-host',
      'private-server',
      'private-email',
      'private-identifier',
      'organisation-name',
    ]);
  });
});

describe('forbiddenPathReason', () => {
  it.each([
    'CLAUDE.local.md',
    '.env.release.local',
    'docs/notes.local',
    '.env',
    '.env.release',
    'sub/.env.production',
    '.claude/settings.json',
    'plans/20260130-roadmap.md',
  ])('rejects %s', (file) => {
    expect(forbiddenPathReason(file)).not.toBeNull();
  });

  it.each([
    '.env.release.example',
    '.env.example',
    'CLAUDE.md',
    'scripts/r2-prune.sh',
    'localhost.md',
    'mcpb/install.html',
  ])('accepts %s', (file) => {
    expect(forbiddenPathReason(file)).toBeNull();
  });
});

/** The environment without GIT_* variables: a hook-provided GIT_DIR must not redirect these calls. */
function gitEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !name.startsWith('GIT_')) env[name] = value;
  }
  return env;
}

describe('the gate on a git repository', () => {
  let repo: string;

  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: repo, env: gitEnv(), stdio: 'pipe' });
  };
  const write = (file: string, content: string): void => {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), content);
  };
  const runGate = (...args: string[]) => {
    const result = spawnSync('node', [checkerPath, ...args], {
      cwd: repo,
      env: gitEnv(),
      encoding: 'utf8',
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  };

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'public-check-test-'));
    git('init', '--quiet');
    write('README.md', '# Example\n\nDownloads: https://packages.henrychong.com/example/\n');
    write('RELEASE_RUNBOOK.md', `# Runbook\n\nR2_ACCESS_KEY_ID=${PLACEHOLDER_REFERENCE}\n`);
    git('add', '.');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('passes a clean repository in both modes', () => {
    for (const args of [[], ['--staged']]) {
      const result = runGate(...args);
      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Public content check passed (2 ');
    }
  });

  it('fails when a secret-manager path is added back to a tracked file', () => {
    write('RELEASE_RUNBOOK.md', `# Runbook\n\nKEY=$(op read '${SECRET_REFERENCE}')\n`);
    const result = runGate();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RELEASE_RUNBOOK.md:3:');
    expect(result.stderr).toContain('[secret-reference]');
    expect(result.stderr).not.toContain('Private-Vault');
  });

  it('fails when a hashed account identifier is added back to a tracked file', () => {
    write('RELEASE_RUNBOOK.md', `# Runbook\n\nACCOUNT_ID=${CANARY_IDENTIFIER}\n`);
    const result = runGate();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('RELEASE_RUNBOOK.md:3:');
    expect(result.stderr).toContain('[private-identifier]');
    expect(result.stderr).not.toContain(CANARY_IDENTIFIER);
  });

  it('fails on a hashed email address in a tracked file', () => {
    write('README.md', `# Example\n\nContact ${CANARY_EMAIL}\n`);
    const result = runGate();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md:3:');
    expect(result.stderr).toContain('[private-email]');
  });

  it('covers a new file from the moment it is staged', () => {
    write('notes/ops.md', `host: ${TAILNET_HOST}\n`);
    // Untracked: not yet part of what the repository publishes.
    expect(runGate().status).toBe(0);
    git('add', 'notes/ops.md');
    for (const args of [[], ['--staged']]) {
      const result = runGate(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('notes/ops.md:1:');
      expect(result.stderr).toContain('[tailnet-host]');
    }
  });

  it('leaves ignored files alone', () => {
    write('.gitignore', '*.local\nCLAUDE.local.md\n');
    write('CLAUDE.local.md', `ssh ${SERVER_NAME}\n${SECRET_REFERENCE}\n`);
    write('.env.release.local', `R2_ACCESS_KEY_ID=${SECRET_REFERENCE}\n`);
    git('add', '.gitignore');
    expect(runGate().status).toBe(0);
    expect(runGate('--staged').status).toBe(0);
  });

  it('fails when a maintainer-local file is force-added', () => {
    write('.gitignore', '*.local\nCLAUDE.local.md\n');
    write('CLAUDE.local.md', 'nothing private in the content\n');
    git('add', '.gitignore');
    git('add', '--force', 'CLAUDE.local.md');
    for (const args of [[], ['--staged']]) {
      const result = runGate(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('CLAUDE.local.md: must not be tracked');
    }
  });

  it('--staged checks what the commit would record, not the working tree', () => {
    // Staged content is private, working tree has since been cleaned: the commit is still bad.
    write('RELEASE_RUNBOOK.md', `# Runbook\n\nssh ${SERVER_NAME}\n`);
    git('add', 'RELEASE_RUNBOOK.md');
    write('RELEASE_RUNBOOK.md', '# Runbook\n\nssh the-build-host\n');
    expect(runGate().status).toBe(0);
    const staged = runGate('--staged');
    expect(staged.status).toBe(1);
    expect(staged.stderr).toContain('RELEASE_RUNBOOK.md:3:');
    expect(staged.stderr).toContain('[private-server]');
  });

  it('--staged ignores private text that is in the working tree but not staged', () => {
    write('README.md', `# Example\n\nscratch: ${HOME_PATH}\n`);
    expect(runGate().status).toBe(1);
    expect(runGate('--staged').status).toBe(0);
  });

  it('skips binary files and tracked files deleted from the working tree', () => {
    writeFileSync(join(repo, 'icon.bin'), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    git('add', 'icon.bin');
    rmSync(join(repo, 'README.md'));
    const result = runGate();
    expect(result.status).toBe(0);
    expect(scanRepository(repo).findings).toEqual([]);
  });

  it('exits 2 outside a git repository and on an unknown argument', () => {
    const outside = mkdtempSync(join(tmpdir(), 'public-check-nogit-'));
    try {
      const result = spawnSync('node', [checkerPath], {
        cwd: outside,
        env: { ...gitEnv(), GIT_CEILING_DIRECTORIES: dirname(outside) },
        encoding: 'utf8',
      });
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('could not scan the repository');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
    const unknown = runGate('--fix');
    expect(unknown.status).toBe(2);
    expect(unknown.stderr).toContain('unknown argument');
  });
});

describe('this repository', () => {
  it('passes its own gate', () => {
    const { files, findings } = scanRepository(process.cwd());
    expect(findings).toEqual([]);
    expect(files).toContain('RELEASE_RUNBOOK.md');
    expect(files).toContain('scripts/check-public-sanitization.mjs');
    expect(files).toContain('__tests__/check-public-sanitization.test.ts');
  });
});
