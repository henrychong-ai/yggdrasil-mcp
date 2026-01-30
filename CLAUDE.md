# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yggdrasil-MCP** is a reasoning orchestration MCP server implementing Tree of Thoughts with multi-agent evaluation. It's a fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an enhanced feature roadmap. Version 0.7.1.

| Aspect        | Details                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| **Package**   | `yggdrasil-mcp`                                                                  |
| **npm**       | https://www.npmjs.com/package/yggdrasil-mcp                                      |
| **Origin**    | Fork of `@modelcontextprotocol/server-sequential-thinking`                       |
| **Upstream**  | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking |
| **Key Fix**   | Claude Code string coercion bug #3084                                            |
| **Tool Name** | `sequentialthinking`                                                             |
| **MCP Tool**  | `mcp__yggdrasil__sequentialthinking`                                             |

## Tech Stack

| Layer           | Technology                                             |
| --------------- | ------------------------------------------------------ |
| Language        | TypeScript 5.3.3                                       |
| Runtime         | Node.js >=18                                           |
| MCP SDK         | @modelcontextprotocol/sdk 1.25.2                       |
| Validation      | Zod 4.3.6                                              |
| Testing         | Vitest 4.0.18 + @vitest/coverage-v8                    |
| Linting         | ESLint 9.39.2 (flat config) + typescript-eslint 8.54.0 |
| Formatting      | Prettier 3.8.1                                         |
| Git Hooks       | Husky 9.1.7 + lint-staged 16.2.7                       |
| Package Manager | pnpm                                                   |
| CI/CD           | GitHub Actions (OIDC npm publish)                      |

### ESLint Plugin Stack (Full Lint Skill Compliance)

| Plugin                   | Purpose                                     |
| ------------------------ | ------------------------------------------- |
| typescript-eslint        | TypeScript strict + stylistic type checking |
| @stylistic/eslint-plugin | Code style rules                            |
| eslint-plugin-import     | Import ordering and validation              |
| eslint-plugin-unicorn    | Modern JavaScript patterns                  |
| eslint-plugin-sonarjs    | Bug detection, cognitive complexity         |
| eslint-plugin-promise    | Async/await patterns                        |
| eslint-plugin-n          | Node.js-specific rules                      |
| eslint-plugin-vitest     | Test file rules                             |
| eslint-config-prettier   | Disable conflicting rules                   |

## Development Commands

```bash
# Install dependencies
pnpm install

# Build (cleans dist/ first)
pnpm build

# Run tests with coverage
pnpm test

# Watch mode for tests
pnpm test:watch

# Lint (zero warnings allowed)
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Format with Prettier
pnpm format

# Check formatting
pnpm format:check

# Full quality check (lint + format + typecheck)
pnpm check

# TypeScript type checking
pnpm typecheck

# Watch mode for TypeScript
pnpm watch
```

## Project Structure

```
yggdrasil-mcp/
├── index.ts                 # MCP server entry point with string coercion fix
├── lib.ts                   # SequentialThinkingServer class
├── __tests__/
│   └── lib.test.ts          # Vitest test suite (14 tests)
├── dist/                    # Compiled output (npm package)
├── plans/
│   └── yggdrasil-roadmap.md # 5-phase feature roadmap
├── .github/
│   ├── workflows/
│   │   └── ci-cd.yml        # CI + npm publish on v* tags
│   └── dependabot.yml       # Weekly dependency updates
├── eslint.config.js         # ESLint 9 flat config (full plugin stack)
├── tsconfig.json            # TypeScript config (ES2022, NodeNext)
├── tsconfig.eslint.json     # TypeScript config for linting (includes tests)
├── vitest.config.ts         # Vitest configuration
├── .prettierrc              # Prettier configuration
├── .prettierignore          # Prettier ignore patterns
└── .husky/
    └── pre-commit           # lint-staged on commit
```

## String Coercion Fix (Critical)

**This is the key contribution of this fork.** Fixes Claude Code bug #3084 where MCP parameters are serialized as strings regardless of schema type.

### The Problem

Claude Code serializes all MCP tool parameters as strings:

- `nextThoughtNeeded: true` → `"true"` (string)
- `thoughtNumber: 5` → `"5"` (string)

Using `z.coerce.boolean()` is **dangerous** because it treats any non-empty string as truthy:

- `"false"` → `true` (WRONG!)
- `"0"` → `true` (WRONG!)

### Our Solution

```typescript
// Safe coercion that properly handles "false" → false
const coerceBoolean = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw new Error(`Cannot coerce "${String(val)}" to boolean`);
};

// Applied via z.preprocess, NOT z.coerce
const booleanSchema = z.preprocess(coerceBoolean, z.boolean());
```

### Schema Architecture

```typescript
// Required schemas
const booleanSchema = z.preprocess(coerceBoolean, z.boolean());
const numberSchema = z.preprocess(coerceNumber, z.number().int().min(1));

// Optional schemas: .optional() MUST be OUTSIDE z.preprocess()
// This is required for correct JSON Schema detection by MCP SDK
const optionalBooleanSchema = z
  .preprocess(
    (val) => (val === undefined || val === null ? undefined : coerceBoolean(val)),
    z.boolean()
  )
  .optional(); // ← OUTSIDE preprocess
```

## Tool Parameters

### Required

| Parameter           | Type    | Description                            |
| ------------------- | ------- | -------------------------------------- |
| `thought`           | string  | Current thinking step content          |
| `nextThoughtNeeded` | boolean | Whether another thought step is needed |
| `thoughtNumber`     | integer | Current thought number (≥1)            |
| `totalThoughts`     | integer | Estimated total thoughts needed (≥1)   |

### Optional

| Parameter           | Type    | Description                                |
| ------------------- | ------- | ------------------------------------------ |
| `isRevision`        | boolean | Whether this revises previous thinking     |
| `revisesThought`    | integer | Which thought number is being reconsidered |
| `branchFromThought` | integer | Branching point thought number             |
| `branchId`          | string  | Branch identifier                          |
| `needsMoreThoughts` | boolean | If more thoughts are needed                |

## Upstream Monitoring Protocol

**IMPORTANT**: Periodically check the upstream Anthropic repository for changes.

### When to Check

- When starting a new session in this repo
- Before implementing new features
- When user mentions "check upstream" or "sync with upstream"
- Monthly maintenance reviews

### How to Check

```bash
# View recent commits to upstream
gh api repos/modelcontextprotocol/servers/commits \
  --jq '.[] | select(.commit.message | test("sequential"; "i")) | {sha: .sha[0:7], date: .commit.author.date[0:10], message: .commit.message | split("\n")[0]}'

# Fetch current upstream index.ts
curl -s "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/sequentialthinking/index.ts" -o /tmp/upstream-st.ts

# Compare with our version
diff -u /tmp/upstream-st.ts index.ts

# Check upstream package.json version
curl -s "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/sequentialthinking/package.json" | jq '.version'
```

### Applying Upstream Changes

| Rule                   | Rationale                                 |
| ---------------------- | ----------------------------------------- |
| **Never blindly copy** | Upstream lacks our string coercion fix    |
| **Apply selectively**  | Maintain `z.preprocess` wrappers          |
| **Test thoroughly**    | Our fix addresses Claude Code bug #3084   |
| **Document**           | Note upstream version synced to in commit |

## CI/CD Pipeline

### GitHub Actions (`ci-cd.yml`)

| Job                | Trigger           | Node Versions    |
| ------------------ | ----------------- | ---------------- |
| **Build and Test** | All pushes, PRs   | 20.x, 22.x, 24.x |
| **Publish to npm** | Tags matching v*  | 24.x             |

### npm Publishing

- **Trigger**: Only on version tags (e.g., `v0.7.1`)
- **Authentication**: NPM_TOKEN secret (unscoped packages require explicit token, not OIDC)
- **Version Check**: Tag must match `package.json` version

## Configuration

### Environment Variables

| Variable                  | Default | Purpose                        |
| ------------------------- | ------- | ------------------------------ |
| `DISABLE_THOUGHT_LOGGING` | `false` | Suppress stderr thought output |

### Test Coverage

| File        | Coverage                          |
| ----------- | --------------------------------- |
| coercion.ts | 100%                              |
| lib.ts      | ~97%                              |
| index.ts    | Excluded (MCP server bootstrap)   |
| **Target**  | **90%+ overall** (enforced in CI) |

## Version Policy

**MANDATORY:** Every git commit must increment the version number following semantic versioning:

| Change Type   | Version   | Examples                                        |
| ------------- | --------- | ----------------------------------------------- |
| **Patch (Z)** | x.y.**Z** | Bug fixes, typo corrections, minor improvements |
| **Minor (Y)** | x.**Y**.0 | New features, non-breaking enhancements         |
| **Major (X)** | **X**.0.0 | Breaking changes, architecture changes          |

**Files to Update:**

1. `package.json` - Package version
2. `index.ts` - MCP server version (line ~11)
3. `CLAUDE.md` - Version in Project Overview + changelog entry

## Version History

### v0.7.1 (2026-01-31)

**CI/CD Improvements**

- Upgrade pnpm from 9 to 10
- Use Node 24.x (current LTS) for npm publish
- Rename workflow to `ci-cd.yml` for consistency

---

### v0.7.0 (2026-01-31)

**Full Lint Skill Compliance + Test Infrastructure**

**New Features:**

- Full lint skill compliance with 6 additional ESLint plugins
- Strict TypeScript checking (strictTypeChecked + stylisticTypeChecked)
- 90% test coverage threshold enforced in CI
- Extracted `coercion.ts` module with comprehensive test suite (23 tests)
- Node 24.x added to CI test matrix

**Technical Changes:**

- `coercion.ts`: Extracted coercion helpers into testable module
- `eslint.config.js`: Full plugin stack (stylistic, import, unicorn, sonarjs, promise, n)
- `tsconfig.eslint.json`: Separate tsconfig for linting (includes test files)
- `vitest.config.ts`: Ironclad-compliant config with 90% thresholds, reporters, timeouts
- `package.json`: TypeScript ^5.7.0, `engines: >=18`, `check` script
- `.github/workflows/ci-cd.yml`: Node matrix expanded to 20.x, 22.x, 24.x

**Code Quality:**

- 37 tests total (14 lib.ts + 23 coercion.ts)
- 98%+ coverage across all metrics
- All strict TypeScript and ESLint rules passing

---

### v0.6.3 (2026-01-30)

**Initial Fork Release** — First published version to npm

Forked from `@modelcontextprotocol/server-sequential-thinking` v0.6.2 with critical fixes:

**Critical Bug Fix:**

- Fixed Claude Code bug #3084 where MCP parameters are serialized as strings
- Implemented safe `z.preprocess` coercion for boolean and number types
- `"false"` now correctly converts to `false` (was `true` with `z.coerce`)

**Infrastructure:**

- GitHub Actions CI/CD pipeline with OIDC npm publishing
- ESLint 9.x flat config with typescript-eslint
- Prettier 3.x formatting with pre-commit hooks (Husky + lint-staged)
- Vitest 4.x test framework (fixes esbuild vulnerability GHSA-67mh-4wv8-2f99)
- Dependabot weekly dependency updates

**Technical:**

- `coerceBoolean()` and `coerceNumber()` helper functions
- `booleanSchema`, `numberSchema` with `z.preprocess`
- `optionalBooleanSchema`, `optionalNumberSchema` with `.optional()` outside preprocess

## Roadmap

See `plans/yggdrasil-roadmap.md` for the 5-phase roadmap:

1. **v1.0** - Core enhancements (current)
2. **v1.1** - Differentiation (persistence, Mermaid)
3. **v1.2** - Self-evaluation tools
4. **v2.0** - Multi-agent evaluation (Codex integration)
5. **v2.5** - Advanced orchestration (n8n, MCTS)

## Troubleshooting

### ESLint Parsing Errors for Test Files

If you see "file was not found by the project service":

- Ensure `tsconfig.eslint.json` exists and includes test files
- ESLint config should use `project: './tsconfig.eslint.json'`

### Pre-commit Hook Failures

If lint-staged fails:

1. Run `pnpm lint:fix` to auto-fix issues
2. Run `pnpm format` to format files
3. Stage fixed files and commit again

### npm Publish Skipped

If CI shows "publish skipped - version not higher":

- Increment version in `package.json`
- Also update version in `index.ts` (MCP server version)
