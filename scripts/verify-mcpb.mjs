#!/usr/bin/env node
/**
 * Bundle check: proves that a packed `.mcpb` works the way an installer will use it.
 *
 *   node scripts/verify-mcpb.mjs [bundle.mcpb] [--forbid-path <absolute path>]...
 *
 * With no bundle argument it checks dist-mcpb/yggdrasil-mcp-<version>.mcpb, where
 * <version> comes from ./package.json. `scripts/build-mcpb.sh` runs it on every
 * build and deletes the bundle if it fails; it also works on a downloaded
 * release file.
 *
 * What it does:
 *   1. Extracts the archive with `unzip` into a new temporary directory that has
 *      no node_modules directory above it, so only the bundle's own files can
 *      satisfy an import.
 *   2. Checks the extracted files: no environment or maintainer-local file, no
 *      pnpm install state or command shim (both record paths of the build
 *      machine), no file containing a --forbid-path value, every production
 *      dependency present and no devDependency installed.
 *   3. Starts the server exactly as the manifest's `mcp_config` says, with a
 *      minimal environment (no NODE_PATH, no NODE_OPTIONS, an empty HOME), and
 *      completes an MCP `initialize` and `tools/list` over stdio. The reported
 *      version must equal the manifest version and every tool the manifest
 *      declares must be served.
 *
 * Exit codes: 0 the bundle passed, 1 the bundle has a problem, 2 the check could
 * not run (bad argument, missing file, no `unzip`, no isolated temporary directory).
 */
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, parse, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_TIMEOUT_MS = 30_000;
const PROTOCOL_VERSION = '2025-06-18';
const STDERR_EXCERPT_LINES = 12;
const KILL_GRACE_MS = 5000;

/** Raised when the check itself cannot run; the bundle is neither passed nor failed. */
export class CannotVerifyError extends Error {}

/**
 * Why a bundle entry must not be there, or null when its name is acceptable.
 * `entry` is a path relative to the bundle root, with `/` separators.
 */
export function forbiddenEntryReason(entry) {
  const segments = entry.split('/');
  const name = segments.at(-1) ?? '';
  if (segments.includes('.bin')) {
    return 'command shim (embeds absolute paths of the build machine)';
  }
  if (name === '.modules.yaml' || /^\.pnpm-workspace-state.*\.json$/.test(name)) {
    return 'pnpm install state (records the package store path of the build machine)';
  }
  if (name === '.env' || name.startsWith('.env.')) return 'environment file';
  if (/\.local(\.[^/]*)?$/.test(name)) return 'maintainer-local file';
  return null;
}

/** Every file under `root`, as sorted `/`-separated paths relative to it. */
function listFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (lstatSync(path).isDirectory()) pending.push(path);
      else files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files.toSorted();
}

/** Directories above `start` (inclusive) that hold a node_modules directory. */
function moduleDirectoriesAbove(start) {
  const found = [];
  let directory = start;
  for (;;) {
    if (existsSync(join(directory, 'node_modules'))) found.push(directory);
    const parent = dirname(directory);
    if (parent === directory) return found;
    directory = parent;
  }
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** The directory of the nearest package.json at or above the entry point, inside the bundle. */
function packageDirectoryOf(root, entryPoint) {
  let directory = dirname(resolve(root, entryPoint));
  while (directory.startsWith(root)) {
    if (existsSync(join(directory, 'package.json'))) return directory;
    if (directory === root) return null;
    directory = dirname(directory);
  }
  return null;
}

/** Problems with what the bundle contains (step 2 of the header). */
function contentProblems(root, files, manifest, forbiddenPaths) {
  const problems = [];
  for (const file of files) {
    const reason = forbiddenEntryReason(file);
    if (reason !== null) problems.push(`${file}: must not be in the bundle (${reason})`);
  }

  const needles = forbiddenPaths.map((path) => Buffer.from(path, 'utf8'));
  if (needles.length > 0) {
    for (const file of files) {
      const stat = lstatSync(join(root, file));
      if (!stat.isFile()) continue;
      const content = readFileSync(join(root, file));
      if (needles.some((needle) => content.includes(needle))) {
        problems.push(`${file}: contains a path of the build machine (--forbid-path)`);
      }
    }
  }

  const entryPoint = manifest?.server?.entry_point;
  if (typeof entryPoint !== 'string' || !existsSync(join(root, entryPoint))) {
    problems.push('manifest.json: server.entry_point does not name a file in the bundle');
    return problems;
  }
  const packageDirectory = packageDirectoryOf(root, entryPoint);
  if (packageDirectory === null) {
    problems.push(`${entryPoint}: no package.json at or above the entry point`);
    return problems;
  }
  const packageJson = readJson(join(packageDirectory, 'package.json'));
  const where = relative(root, packageDirectory).split(sep).join('/') || '.';
  for (const name of Object.keys(packageJson.dependencies ?? {})) {
    if (!existsSync(join(packageDirectory, 'node_modules', name, 'package.json'))) {
      problems.push(`${where}/node_modules/${name}: production dependency is missing`);
    }
  }
  for (const name of Object.keys(packageJson.devDependencies ?? {})) {
    if (existsSync(join(packageDirectory, 'node_modules', name))) {
      problems.push(`${where}/node_modules/${name}: devDependency must not be in the bundle`);
    }
  }
  return problems;
}

/**
 * Start the bundled server as the manifest describes and complete `initialize`
 * and `tools/list`. Resolves to the problems found and what the server reported.
 */
async function startUpProblems(root, manifest, workDirectory, timeoutMs) {
  const config = manifest?.server?.mcp_config;
  if (config?.command !== 'node' || !Array.isArray(config.args)) {
    return {
      problems: ['manifest.json: server.mcp_config must run "node" with an args array'],
    };
  }
  const args = config.args.map((argument) => String(argument).replaceAll('${__dirname}', root));
  const directories = {
    cwd: join(workDirectory, 'cwd'),
    home: join(workDirectory, 'home'),
    plans: join(workDirectory, 'plans'),
  };
  for (const directory of Object.values(directories)) mkdirSync(directory);

  // A minimal environment: nothing here can add a module search path.
  const child = spawn(process.execPath, args, {
    cwd: directories.cwd,
    env: {
      PATH: process.env['PATH'] ?? '',
      HOME: directories.home,
      USERPROFILE: directories.home,
      YGGDRASIL_PLANS_DIR: directories.plans,
      DISABLE_THOUGHT_LOGGING: 'true',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  let stdout = '';
  const waiting = new Map();
  let exited = null;
  // 'close' (not 'exit'): it fires once stdout and stderr have been read to the end.
  const exit = new Promise((resolveExit) => {
    child.once('error', (error) => {
      exited ??= { reason: `could not be started (${error.message})` };
      resolveExit();
    });
    child.once('close', (code, signal) => {
      exited ??= { reason: `exited with ${signal === null ? `code ${code}` : `signal ${signal}`}` };
      resolveExit();
    });
  });
  void exit.then(() => {
    for (const settle of waiting.values()) settle(null);
    waiting.clear();
    return undefined;
  });
  child.stdin.on('error', () => {
    // The server closed its end first; the exit handler reports why.
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    for (;;) {
      const end = stdout.indexOf('\n');
      if (end === -1) return;
      const line = stdout.slice(0, end).trim();
      stdout = stdout.slice(end + 1);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // not a JSON-RPC line
      }
      const settle = waiting.get(message?.id);
      if (settle !== undefined) {
        waiting.delete(message.id);
        settle(message);
      }
    }
  });

  const deadline = Date.now() + timeoutMs;
  let nextId = 0;
  const send = (message) => {
    if (exited === null) child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);
  };
  /** Resolves to the response, or to a string saying why there is none. */
  const request = async (method, params) => {
    nextId += 1;
    const id = nextId;
    let timer;
    const response = await new Promise((settle) => {
      if (exited !== null) {
        settle(null);
        return;
      }
      waiting.set(id, settle);
      timer = setTimeout(() => settle(undefined), Math.max(deadline - Date.now(), 0));
      send({ id, method, params });
    });
    clearTimeout(timer);
    waiting.delete(id);
    if (response === undefined) {
      return `the server did not answer "${method}" within ${timeoutMs} ms`;
    }
    if (response === null) return `the server ${exited.reason} before answering "${method}"`;
    if (response.error !== undefined) {
      return `"${method}" returned an error: ${JSON.stringify(response.error)}`;
    }
    return response;
  };

  const problems = [];
  const report = {};
  try {
    const initialized = await request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'verify-mcpb', version: '1.0.0' },
    });
    if (typeof initialized === 'string') {
      problems.push(initialized);
      return { problems, stderr };
    }
    const serverInfo = initialized.result?.serverInfo;
    if (typeof serverInfo?.name !== 'string') {
      problems.push('"initialize" returned no serverInfo');
    } else {
      report.server = `${serverInfo.name} ${serverInfo.version}`;
      if (manifest.version !== undefined && serverInfo.version !== manifest.version) {
        problems.push(
          `the server reports version ${serverInfo.version} but the manifest says ${manifest.version}`
        );
      }
    }
    send({ method: 'notifications/initialized' });

    const listed = await request('tools/list', {});
    if (typeof listed === 'string') {
      problems.push(listed);
      return { problems, stderr };
    }
    const tools = Array.isArray(listed.result?.tools)
      ? listed.result.tools.map((tool) => tool?.name)
      : [];
    report.tools = tools;
    if (tools.length === 0) problems.push('"tools/list" returned no tools');
    const declared = Array.isArray(manifest.tools) ? manifest.tools.map((tool) => tool?.name) : [];
    for (const name of declared) {
      if (!tools.includes(name)) {
        problems.push(`the manifest declares the tool "${name}" but the server does not serve it`);
      }
    }
    return { problems, report, stderr };
  } finally {
    if (exited === null) {
      child.stdin.end();
      child.kill();
      const forced = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS);
      await exit;
      clearTimeout(forced);
    }
  }
}

/** The first lines the server wrote to stderr: a Node start-up error leads with its cause. */
function stderrExcerpt(stderr) {
  const lines = stderr.trim().split('\n').filter(Boolean);
  return lines.slice(0, STDERR_EXCERPT_LINES).map((line) => `    ${line}`);
}

/**
 * Check one bundle. Resolves to `{ problems, files, server, tools }`; an empty
 * `problems` array means the bundle passed. Throws CannotVerifyError when the
 * check cannot run.
 *
 * Options: `forbiddenPaths` (strings no bundled file may contain), `timeoutMs`
 * (for the whole start-up exchange), `tempRoot` (where the temporary directory
 * is made; default the system temporary directory).
 */
export async function verifyBundle(bundlePath, options = {}) {
  const forbiddenPaths = (options.forbiddenPaths ?? []).filter((path) => path.length > 0);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const bundle = resolve(bundlePath);
  if (!existsSync(bundle) || !lstatSync(bundle).isFile()) {
    throw new CannotVerifyError(`no bundle file at ${bundlePath}`);
  }
  const tempRoot = realpathSync(options.tempRoot ?? tmpdir());
  const shadowing = moduleDirectoriesAbove(tempRoot);
  if (shadowing.length > 0) {
    throw new CannotVerifyError(
      `${shadowing[0]} has a node_modules directory, so the bundle would not be tested in isolation; set TMPDIR to a directory with no node_modules above it`
    );
  }

  const workDirectory = mkdtempSync(join(tempRoot, 'yggdrasil-mcpb-verify-'));
  try {
    const root = join(workDirectory, 'bundle');
    mkdirSync(root);
    const unzip = spawnSync('unzip', ['-q', '-o', bundle, '-d', root], { encoding: 'utf8' });
    if (unzip.error !== undefined) {
      throw new CannotVerifyError(`could not run unzip (${unzip.error.message})`);
    }
    if (unzip.status !== 0) {
      return {
        problems: [`unzip could not extract the archive (exit ${unzip.status})`],
        files: 0,
      };
    }

    const files = listFiles(root);
    if (!files.includes('manifest.json')) {
      return { problems: ['manifest.json: missing from the bundle'], files: files.length };
    }
    let manifest;
    try {
      manifest = readJson(join(root, 'manifest.json'));
    } catch {
      return { problems: ['manifest.json: not valid JSON'], files: files.length };
    }

    const problems = contentProblems(root, files, manifest, forbiddenPaths);
    const entryPoint = manifest?.server?.entry_point;
    if (typeof entryPoint !== 'string' || !existsSync(join(root, entryPoint))) {
      return { problems, files: files.length };
    }
    const startUp = await startUpProblems(root, manifest, workDirectory, timeoutMs);
    for (const problem of startUp.problems) {
      problems.push(`start-up: ${problem}`);
    }
    if (startUp.problems.length > 0 && startUp.stderr) {
      problems.push('start-up: the server wrote to stderr:', ...stderrExcerpt(startUp.stderr));
    }
    return {
      problems,
      files: files.length,
      server: startUp.report?.server,
      tools: startUp.report?.tools,
    };
  } finally {
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

function defaultBundlePath() {
  const { version } = readJson(resolve('package.json'));
  return join('dist-mcpb', `yggdrasil-mcp-${version}.mcpb`);
}

async function main(argv) {
  const forbiddenPaths = [];
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--forbid-path') {
      const value = argv[index + 1];
      if (value === undefined || parse(value).root === '') {
        console.error('verify-mcpb: --forbid-path needs an absolute path');
        return 2;
      }
      forbiddenPaths.push(value);
      index += 1;
    } else if (argument.startsWith('-')) {
      console.error(`verify-mcpb: unknown option ${argument}`);
      return 2;
    } else {
      positional.push(argument);
    }
  }
  if (positional.length > 1) {
    console.error('verify-mcpb: give at most one bundle file');
    return 2;
  }

  let bundlePath;
  let result;
  try {
    bundlePath = positional[0] ?? defaultBundlePath();
    result = await verifyBundle(bundlePath, { forbiddenPaths });
  } catch (error) {
    const reason = error instanceof Error ? error.message.split('\n')[0] : String(error);
    console.error(`verify-mcpb: could not check the bundle (${reason})`);
    return 2;
  }
  if (result.problems.length > 0) {
    console.error(
      [
        `Bundle check failed for ${bundlePath}:`,
        ...result.problems.map((problem) =>
          problem.startsWith('    ') ? problem : `- ${problem}`
        ),
      ].join('\n')
    );
    return 1;
  }
  console.log(
    `Bundle check passed for ${bundlePath}: ${result.files} files; started from a clean extraction as ${result.server}; tools: ${result.tools.join(', ')}`
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
