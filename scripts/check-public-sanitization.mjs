#!/usr/bin/env node
/**
 * Public-content gate: fails when a git-tracked file in this public repository
 * carries private operational detail. A new file is covered from the moment it is
 * staged: the pre-commit hook scans the index.
 *
 *   node scripts/check-public-sanitization.mjs            every tracked file, as it is in the
 *                                                         working tree (pnpm check, CI)
 *   node scripts/check-public-sanitization.mjs --staged   every file in the index: exactly what
 *                                                         the next commit would record (pre-commit)
 *
 * Exit codes: 0 clean, 1 findings, 2 could not run (not a git repository, bad argument).
 *
 * Exact private values are never written here. They are stored as SHA-256 hashes
 * and compared with the hash of every candidate token in a file. A finding
 * reports the file, the line and the rule, never the matched text, so a CI log
 * does not repeat what the gate caught.
 *
 * This file and its test are scanned like every other file: there is no exempt
 * path. The test builds its forbidden samples from fragments at run time.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Paths that must never be tracked, whatever they contain. */
const FORBIDDEN_PATHS = [
  { pattern: /(^|\/)\.claude\//, reason: 'local agent configuration' },
  { pattern: /(^|\/)plans\//, reason: 'local planning notes' },
  { pattern: /(^|\/)[^/]*\.local(\.[^/]*)?$/, reason: 'maintainer-local file' },
  {
    pattern: /(^|\/)\.env(\.[^/]+)?$/,
    except: /(^|\/)\.env(\.[^/]+)?\.(example|sample|template|dist)$/,
    reason: 'environment file (only a placeholder template may be tracked)',
  },
];

/**
 * SHA-256 of private identifiers: 32-character hexadecimal infrastructure IDs
 * (for example cloud account and zone IDs). To add one, hash it locally:
 *
 *   printf '%s' '<the 32 lowercase hex characters>' | shasum -a 256
 *
 * The first entry is a public test canary, sixteen hex digits written twice
 * (0123456789abcdef, then the same again). It lets the tests prove the default
 * list is the one the gate applies without any private value in the repository.
 */
export const PRIVATE_IDENTIFIER_HASHES = new Set([
  '3eb1bd439947eb762998e566ccc2e099c791118b2f40579cc4f7da2b5061b7f9',
  'f3fa5166288a577c5af1fb960aaa50e7365252518480a497f7e2fc3ea6e4d12c',
  '865fb999316b80ffffda4f0a746cc458036d4fb7da9d1eb50f734cd834658f41',
  '9f721e7157f02c539621b300b2f4489208e613b39f347374b0109e1d38428e45',
  'e18e115574130890f1fc6077374cc8c8e8abae3149eedd6899a2515a95c72115',
]);

/**
 * SHA-256 of private email addresses, lower-cased, with any "+tag" removed from
 * the local part. The first entry is a public test canary: the local part
 * "private-canary" at the reserved domain "example.invalid". The public author
 * address in package.json is not private and is not listed.
 */
export const PRIVATE_EMAIL_HASHES = new Set([
  '50d89b80e47642c318e283948281c088c85c5e40846df942760e841961e6fece',
  '0cdcd8fa651fb6301a819747f0631ab332135ba27570f086209c4a3d56458a93',
  'b8fef41fafbd6df8f95e67a3087cfe6947e09a0b2b89786c3d0ac5618dc9377b',
]);

const PLACEHOLDER_HOME_NAMES = new Set(['you', 'user', 'username', 'name', 'me', 'shared']);
const GENERIC_PASSWORD_MANAGER_HOSTS = new Set([
  'my',
  'www',
  'start',
  'support',
  'developer',
  'downloads',
]);

const isPlaceholderLabel = (label) => label.startsWith('your-') || label.startsWith('example');

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * Content rules. Each has a global pattern and an optional `flag(match, options)`
 * that decides whether a match is a finding (default: every match is).
 */
const CONTENT_RULES = [
  {
    id: 'home-path',
    message: 'personal home directory path (write a path relative to the repo, or a placeholder)',
    pattern: /\/Users\/([^/\s"'`<>$()[\]{}*\\]+)\//g,
    flag: (match) => {
      const name = match[1].toLowerCase();
      return !PLACEHOLDER_HOME_NAMES.has(name) && !name.startsWith('your');
    },
  },
  {
    id: 'secret-reference',
    message:
      'secret-manager reference that is not a placeholder (write it as op://your-vault/your-item/field)',
    pattern: /\bop:\/\/(?!your-)[a-z0-9_]/gi,
  },
  {
    id: 'password-manager-account',
    message: 'named password-manager account host',
    pattern: /\b([a-z0-9-]+)\.1password\.(?:com|eu|ca)\b/gi,
    flag: (match) => {
      const label = match[1].toLowerCase();
      return !GENERIC_PASSWORD_MANAGER_HOSTS.has(label) && !isPlaceholderLabel(label);
    },
  },
  {
    id: 'tailnet-host',
    message: 'tailnet host name',
    pattern: /\b([a-z0-9-]+)\.ts\.net\b/gi,
    flag: (match) => !isPlaceholderLabel(match[1].toLowerCase()),
  },
  {
    id: 'private-server',
    message: 'private server name',
    pattern: /\bvps-\d+\b/gi,
  },
  {
    id: 'private-email',
    message: 'private email address',
    pattern: /([a-z0-9._%+-]+)@([a-z0-9-]+(?:\.[a-z0-9-]+)+)/gi,
    flag: (match, options) => {
      const local = match[1].toLowerCase().replace(/\+.*$/, '');
      return options.emailHashes.has(sha256(`${local}@${match[2].toLowerCase()}`));
    },
  },
  {
    id: 'private-identifier',
    message: 'known private infrastructure identifier',
    pattern: /(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi,
    flag: (match, options) => options.identifierHashes.has(sha256(match[0].toLowerCase())),
  },
];

export const RULE_IDS = CONTENT_RULES.map((rule) => rule.id);

function lineOf(text, index) {
  let line = 1;
  for (let position = text.indexOf('\n'); position !== -1 && position < index; ) {
    line += 1;
    position = text.indexOf('\n', position + 1);
  }
  return line;
}

/**
 * Findings for one file's text: `{ rule, line, message }`, one per rule and line.
 * `options.identifierHashes` / `options.emailHashes` replace the built-in lists.
 */
export function contentFindings(text, options = {}) {
  const resolved = {
    identifierHashes: options.identifierHashes ?? PRIVATE_IDENTIFIER_HASHES,
    emailHashes: options.emailHashes ?? PRIVATE_EMAIL_HASHES,
  };
  const findings = [];
  const seen = new Set();
  for (const rule of CONTENT_RULES) {
    for (const match of text.matchAll(rule.pattern)) {
      if (rule.flag && !rule.flag(match, resolved)) continue;
      const line = lineOf(text, match.index);
      const key = `${rule.id}:${line}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({ rule: rule.id, line, message: rule.message });
    }
  }
  return findings.toSorted((a, b) => a.line - b.line);
}

/** The reason a path must not be tracked, or null. */
export function forbiddenPathReason(file) {
  for (const { pattern, except, reason } of FORBIDDEN_PATHS) {
    if (pattern.test(file) && !except?.test(file)) return reason;
  }
  return null;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 });
}

export function repositoryRoot(cwd = process.cwd()) {
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
}

/** Every git-tracked path (the index), relative to the repository root. */
export function trackedFiles(root) {
  const listing = git(root, ['ls-files', '--cached', '-z']).toString('utf8');
  return [...new Set(listing.split('\0').filter(Boolean))].toSorted();
}

/**
 * Content of one tracked file as a Buffer: from the index when `staged`, else from
 * the working tree. Null when there is nothing to scan (deleted in the working
 * tree, a directory or a submodule).
 */
function readTracked(root, file, staged) {
  if (staged) return git(root, ['cat-file', 'blob', `:${file}`]);
  try {
    return readFileSync(resolve(root, file));
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'EISDIR') return null;
    throw error;
  }
}

/**
 * Scans a repository's tracked files. Returns `{ files, findings }`; each finding
 * is one printable line. `staged` reads content from the index.
 */
export function scanRepository(root, { staged = false, ...options } = {}) {
  const files = trackedFiles(root);
  const findings = [];
  for (const file of files) {
    const reason = forbiddenPathReason(file);
    if (reason) {
      findings.push(`${file}: must not be tracked (${reason})`);
      continue;
    }
    let buffer;
    try {
      buffer = readTracked(root, file, staged);
    } catch {
      findings.push(`${file}: could not be read, so it could not be checked`);
      continue;
    }
    if (buffer === null || buffer.includes(0)) continue;
    for (const finding of contentFindings(buffer.toString('utf8'), options)) {
      findings.push(`${file}:${finding.line}: ${finding.message} [${finding.rule}]`);
    }
  }
  return { files, findings };
}

function main(argv) {
  const unknown = argv.filter((argument) => argument !== '--staged');
  if (unknown.length > 0) {
    console.error(`public:check: unknown argument ${unknown[0]} (the only option is --staged)`);
    return 2;
  }
  const staged = argv.includes('--staged');
  let result;
  try {
    result = scanRepository(repositoryRoot(), { staged });
  } catch (error) {
    console.error(`public:check: could not scan the repository (${error.message.split('\n')[0]})`);
    return 2;
  }
  const scope = staged ? 'staged' : 'tracked';
  if (result.findings.length > 0) {
    console.error(
      [
        `Public content check failed (${result.findings.length} finding(s), ${scope} files):`,
        ...result.findings.map((finding) => `- ${finding}`),
        '',
        'This repository is public. Keep private operational detail in untracked files',
        '(CLAUDE.local.md, .env.release.local) and use placeholders or environment',
        'variables in tracked ones. If a finding is wrong, fix the rule in',
        'scripts/check-public-sanitization.mjs in a reviewed commit; do not bypass the hook.',
      ].join('\n')
    );
    return 1;
  }
  console.log(`Public content check passed (${result.files.length} ${scope} files).`);
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
