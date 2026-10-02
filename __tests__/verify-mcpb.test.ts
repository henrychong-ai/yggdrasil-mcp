import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CannotVerifyError, forbiddenEntryReason, verifyBundle } from '../scripts/verify-mcpb.mjs';

/**
 * Tests for the bundle check, against small bundles assembled here with `zip`.
 *
 * The real `.mcpb` is not built: each fixture is a manifest, a few lines of
 * dependency-free server code that answers `initialize` and `tools/list`, and
 * two tiny packages. "dep-a" imports "dep-b", so a fixture can reproduce the
 * layout that once shipped: a package copied to the top of node_modules with
 * its own dependency left behind in pnpm's virtual store.
 */

const scriptPath = resolve(process.cwd(), 'scripts/verify-mcpb.mjs');
const VERSION = '9.8.7';
const TOOLS = ['alpha', 'beta'];

/** Server stub. It can only start if "dep-a" and, through it, "dep-b" resolve. */
const serverSource = (behaviour: string): string =>
  [
    "import { createInterface } from 'node:readline';",
    "import { toolNames } from 'dep-a';",
    'if (process.env.NODE_PATH !== undefined || process.env.NODE_OPTIONS !== undefined) {',
    "  console.error('unexpected module search path in the environment');",
    '  process.exit(42);',
    '}',
    `const behaviour = ${JSON.stringify(behaviour)};`,
    "const reply = (id, result) => console.log(JSON.stringify({ jsonrpc: '2.0', id, result }));",
    "createInterface({ input: process.stdin }).on('line', (line) => {",
    '  const message = JSON.parse(line);',
    "  if (behaviour === 'silent') return;",
    "  if (message.method === 'initialize') {",
    '    reply(message.id, {',
    '      protocolVersion: message.params.protocolVersion,',
    '      capabilities: { tools: {} },',
    `      serverInfo: { name: 'fixture-server', version: behaviour === 'old-version' ? '0.0.1' : '${VERSION}' },`,
    '    });',
    "  } else if (message.method === 'tools/list') {",
    "    const names = behaviour === 'missing-tool' ? toolNames.slice(0, 1) : toolNames;",
    "    reply(message.id, { tools: names.map((name) => ({ name, inputSchema: { type: 'object' } })) });",
    '  }',
    '});',
  ].join('\n');

interface FixtureOptions {
  /** `flat`: every package at the top of node_modules. `virtual-store`: the broken layout. */
  layout?: 'flat' | 'virtual-store';
  behaviour?: 'ok' | 'silent' | 'old-version' | 'missing-tool';
  /** Extra files, as paths relative to the bundle root. */
  extraFiles?: Record<string, string>;
  /** Leave out a file the default fixture has. */
  omit?: string[];
  manifest?: Record<string, unknown>;
}

let workDir: string;

function writeFile(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

const packageOf = (packageName: string): string =>
  JSON.stringify({ name: packageName, version: '1.0.0', type: 'module', main: 'index.js' });

/** Assemble a bundle directory, zip it and return the path of the `.mcpb`. */
function makeBundle(name: string, options: FixtureOptions = {}): string {
  const root = join(workDir, name);
  const depA = "import { names } from 'dep-b';\nexport const toolNames = names;\n";
  const depB = `export const names = ${JSON.stringify(TOOLS)};\n`;
  const files: Record<string, string> = {
    'manifest.json': JSON.stringify({
      name: 'fixture',
      version: VERSION,
      server: {
        type: 'node',
        entry_point: 'server/dist/index.js',
        mcp_config: { command: 'node', args: ['${__dirname}/server/dist/index.js'] },
      },
      tools: TOOLS.map((tool) => ({ name: tool })),
      ...options.manifest,
    }),
    'server/package.json': JSON.stringify({
      name: 'fixture',
      type: 'module',
      dependencies: { 'dep-a': '1.0.0' },
      devDependencies: { 'dev-tool': '1.0.0' },
    }),
    'server/dist/index.js': serverSource(options.behaviour ?? 'ok'),
    'server/node_modules/dep-a/package.json': packageOf('dep-a'),
    'server/node_modules/dep-a/index.js': depA,
  };
  if (options.layout === 'virtual-store') {
    // What packing pnpm's symlinked layout produced: "dep-a" is copied to the top
    // level, and "dep-b" exists only beside the virtual-store copy of "dep-a".
    const store = 'server/node_modules/.pnpm/dep-a@1.0.0/node_modules';
    files[`${store}/dep-a/package.json`] = packageOf('dep-a');
    files[`${store}/dep-a/index.js`] = depA;
    files[`${store}/dep-b/package.json`] = packageOf('dep-b');
    files[`${store}/dep-b/index.js`] = depB;
  } else {
    files['server/node_modules/dep-b/package.json'] = packageOf('dep-b');
    files['server/node_modules/dep-b/index.js'] = depB;
  }
  Object.assign(files, options.extraFiles);
  for (const path of options.omit ?? []) delete files[path];

  for (const [path, content] of Object.entries(files)) writeFile(root, path, content);
  const bundle = join(workDir, `${name}.mcpb`);
  execFileSync('zip', ['-q', '-r', bundle, '.'], { cwd: root });
  return bundle;
}

const tempRoot = (): string => join(workDir, 'tmp');

/** Run the script as a command, with its temporary directory inside the test's. */
const run = (args: string[]) =>
  spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: { ...process.env, TMPDIR: tempRoot() },
  });

const check = (bundle: string, options: Record<string, unknown> = {}) =>
  verifyBundle(bundle, { tempRoot: tempRoot(), timeoutMs: 10_000, ...options });

beforeEach(() => {
  workDir = mkdtempSync(join(realpathSync(tmpdir()), 'verify-mcpb-test-'));
  mkdirSync(tempRoot());
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('forbiddenEntryReason', () => {
  it.each([
    'manifest.json',
    'server/dist/index.js',
    'server/node_modules/dep-a/package.json',
    'server/node_modules/dotenv/lib/env-options.js',
    'server/node_modules/pkg/localize.js',
  ])('accepts %s', (entry) => {
    expect(forbiddenEntryReason(entry)).toBeNull();
  });

  it.each([
    ['.env', 'environment file'],
    ['server/.env.production', 'environment file'],
    ['server/settings.local', 'maintainer-local file'],
    ['server/.env.release.local', 'environment file'],
    ['server/notes.local.md', 'maintainer-local file'],
    ['server/node_modules/.modules.yaml', 'pnpm install state'],
    ['server/node_modules/.pnpm-workspace-state-v1.json', 'pnpm install state'],
    ['server/node_modules/.bin/tool', 'command shim'],
    ['server/node_modules/pkg/node_modules/.bin/tool', 'command shim'],
  ])('rejects %s', (entry, reason) => {
    expect(forbiddenEntryReason(entry)).toContain(reason);
  });
});

describe('verifyBundle', () => {
  it('passes a bundle whose packages all sit at the top of node_modules', async () => {
    const result = await check(makeBundle('good'));
    expect(result.problems).toEqual([]);
    expect(result.server).toBe(`fixture-server ${VERSION}`);
    expect(result.tools).toEqual(TOOLS);
    expect(result.files).toBe(7);
  });

  it('fails the layout that shipped: a dependency left behind in the virtual store', async () => {
    const result = await check(makeBundle('virtual-store', { layout: 'virtual-store' }));
    const text = result.problems.join('\n');
    expect(text).toContain('start-up: the server exited with code 1 before answering "initialize"');
    expect(text).toContain('ERR_MODULE_NOT_FOUND');
    expect(text).toContain("Cannot find package 'dep-b'");
  });

  it('starts the server without the caller module search path', async () => {
    const before = process.env['NODE_PATH'];
    process.env['NODE_PATH'] = join(workDir, 'elsewhere');
    try {
      const result = await check(makeBundle('clean-env'));
      expect(result.problems).toEqual([]);
    } finally {
      if (before === undefined) delete process.env['NODE_PATH'];
      else process.env['NODE_PATH'] = before;
    }
  });

  it('refuses to run under a directory that has node_modules above it', async () => {
    const bundle = makeBundle('shadowed', { layout: 'virtual-store' });
    // A stray package here would satisfy the import the bundle cannot.
    writeFile(workDir, 'node_modules/dep-b/package.json', '{"name":"dep-b","type":"module"}');
    writeFile(workDir, 'node_modules/dep-b/index.js', "export const names = ['alpha', 'beta'];");
    await expect(check(bundle)).rejects.toThrow(CannotVerifyError);
    await expect(check(bundle)).rejects.toThrow(/node_modules directory/);
  });

  it('fails when a devDependency is installed in the bundle', async () => {
    const bundle = makeBundle('with-dev', {
      extraFiles: { 'server/node_modules/dev-tool/package.json': '{"name":"dev-tool"}' },
    });
    const result = await check(bundle);
    expect(result.problems).toEqual([
      'server/node_modules/dev-tool: devDependency must not be in the bundle',
    ]);
  });

  it('fails when a production dependency is missing', async () => {
    const bundle = makeBundle('no-dep', {
      omit: ['server/node_modules/dep-a/package.json', 'server/node_modules/dep-a/index.js'],
    });
    const result = await check(bundle);
    expect(result.problems[0]).toBe('server/node_modules/dep-a: production dependency is missing');
    expect(result.problems.join('\n')).toContain("Cannot find package 'dep-a'");
  });

  it.each([
    ['server/.env', 'environment file'],
    ['server/config.local', 'maintainer-local file'],
    ['server/node_modules/.modules.yaml', 'pnpm install state'],
    ['server/node_modules/.bin/dep-a', 'command shim'],
  ])('fails when the bundle contains %s', async (entry, reason) => {
    const result = await check(makeBundle('forbidden', { extraFiles: { [entry]: 'x' } }));
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]).toContain(`${entry}: must not be in the bundle (${reason}`);
  });

  it('fails when a bundled file contains a forbidden path, without printing it', async () => {
    const buildPath = join(workDir, 'build', 'staging');
    const bundle = makeBundle('leaky', {
      extraFiles: { 'server/node_modules/dep-a/shim.sh': `exec "${buildPath}/bin"\n` },
    });
    const result = await check(bundle, { forbiddenPaths: [buildPath] });
    expect(result.problems).toEqual([
      'server/node_modules/dep-a/shim.sh: contains a path of the build machine (--forbid-path)',
    ]);
    expect((await check(bundle)).problems).toEqual([]);
  });

  it('fails when the server version differs from the manifest version', async () => {
    const result = await check(makeBundle('old-version', { behaviour: 'old-version' }));
    expect(result.problems).toEqual([
      `start-up: the server reports version 0.0.1 but the manifest says ${VERSION}`,
    ]);
  });

  it('fails when a tool the manifest declares is not served', async () => {
    const result = await check(makeBundle('missing-tool', { behaviour: 'missing-tool' }));
    expect(result.problems).toEqual([
      'start-up: the manifest declares the tool "beta" but the server does not serve it',
    ]);
  });

  it('fails when the server does not answer in time', async () => {
    const result = await check(makeBundle('silent', { behaviour: 'silent' }), { timeoutMs: 1500 });
    expect(result.problems).toEqual([
      'start-up: the server did not answer "initialize" within 1500 ms',
    ]);
  });

  it('fails when the manifest does not start the server with node', async () => {
    const bundle = makeBundle('other-command', {
      manifest: {
        server: {
          type: 'node',
          entry_point: 'server/dist/index.js',
          mcp_config: { command: 'sh', args: ['-c', 'true'] },
        },
      },
    });
    const result = await check(bundle);
    expect(result.problems).toEqual([
      'start-up: manifest.json: server.mcp_config must run "node" with an args array',
    ]);
  });

  it('fails when the entry point is not in the bundle', async () => {
    const result = await check(makeBundle('no-entry', { omit: ['server/dist/index.js'] }));
    expect(result.problems).toEqual([
      'manifest.json: server.entry_point does not name a file in the bundle',
    ]);
  });

  it('fails when the archive has no manifest or cannot be extracted', async () => {
    const noManifest = await check(makeBundle('no-manifest', { omit: ['manifest.json'] }));
    expect(noManifest.problems).toEqual(['manifest.json: missing from the bundle']);

    const notAnArchive = join(workDir, 'broken.mcpb');
    writeFileSync(notAnArchive, 'this is not a zip archive');
    const broken = await check(notAnArchive);
    expect(broken.problems).toHaveLength(1);
    expect(broken.problems[0]).toMatch(/^unzip could not extract the archive \(exit \d+\)$/);
  });

  it('throws when there is no bundle file', async () => {
    await expect(check(join(workDir, 'absent.mcpb'))).rejects.toThrow(CannotVerifyError);
  });

  it('removes its temporary directory after a pass and after a failure', async () => {
    await check(makeBundle('tidy-pass'));
    await check(makeBundle('tidy-fail', { layout: 'virtual-store' }));
    expect(readdirSync(tempRoot())).toEqual([]);
  });
});

describe('command line', () => {
  it('exits 0 and names the server and tools for a good bundle', () => {
    const result = run([makeBundle('cli-good')]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Bundle check passed');
    expect(result.stdout).toContain(`fixture-server ${VERSION}; tools: alpha, beta`);
  });

  it('exits 1 and lists the problems for a bad bundle', () => {
    const result = run([makeBundle('cli-bad', { layout: 'virtual-store' })]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Bundle check failed');
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
  });

  it('exits 2 when it cannot run', () => {
    expect(run([join(workDir, 'absent.mcpb')]).status).toBe(2);
    expect(run(['--unknown']).status).toBe(2);
    expect(run([makeBundle('cli-relative'), '--forbid-path', 'relative/path']).status).toBe(2);
    expect(run(['one.mcpb', 'two.mcpb']).status).toBe(2);
  });
});
