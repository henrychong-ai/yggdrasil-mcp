# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yggdrasil-MCP** is a reasoning orchestration MCP server implementing Tree of Thoughts with multi-agent evaluation. It's a fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an enhanced feature roadmap. Version 1.0.3.

| Aspect        | Details                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| **Package**   | `yggdrasil-mcp`                                                                  |
| **npm**       | https://www.npmjs.com/package/yggdrasil-mcp                                      |
| **Origin**    | Fork of `@modelcontextprotocol/server-sequential-thinking`                       |
| **Upstream**  | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking |
| **Version**   | 1.0.3                                                                            |
| **Key Fix**   | Claude Code string coercion bug #3084                                            |
| **Tool Name** | `sequential_thinking`                                                            |
| **MCP Tool**  | `mcp__yggdrasil__sequential_thinking`                                            |

## Tech Stack

| Layer           | Technology                                             |
| --------------- | ------------------------------------------------------ |
| Language        | TypeScript 5.9.3                                       |
| Runtime         | Node.js 24                                             |
| MCP SDK         | @modelcontextprotocol/sdk 1.27.1                       |
| Validation      | Zod 4.3.6                                              |
| Testing         | Vitest 4.0.18 + @vitest/coverage-v8                    |
| Linting         | Oxlint 1.51.0 (Rust-based, 668 built-in rules)         |
| Formatting      | Biome 2.4.5 (linter disabled, Prettier-compatible)      |
| Git Hooks       | Husky 9.1.7 + lint-staged 16.2.7                       |
| Package Manager | pnpm                                                   |
| CI/CD           | GitHub Actions (npm publish on v* tags)                 |

### Oxlint Plugin Stack (Zero npm Dependencies)

| Plugin (built-in) | Purpose                                |
| ----------------- | -------------------------------------- |
| eslint (core)     | ~200 core JavaScript rules             |
| typescript        | ~90 TypeScript rules                   |
| unicorn           | ~100 modern JavaScript patterns        |
| oxc (deepscan)    | ~30 bug detection rules                |
| import            | Import validation (sorting via Biome)  |
| promise           | Async/await patterns                   |
| node              | Node.js-specific rules                 |
| vitest            | Test file rules                        |

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

# Lint with Oxlint (zero warnings allowed)
pnpm lint

# Lint with auto-fix
pnpm lint:fix

# Format with Biome
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
├── index.ts                 # MCP server entry point, tool registration
├── lib.ts                   # SequentialThinkingServer class
├── planning.ts              # DeepPlanningServer class (structured planning sessions)
├── persistence.ts           # Hybrid JSONL + Markdown persistence layer
├── coercion.ts              # Safe type coercion helpers (boolean, number, score)
├── __tests__/
│   ├── lib.test.ts          # Sequential thinking test suite (14 tests)
│   ├── planning.test.ts     # Deep planning test suite (75 tests)
│   ├── persistence.test.ts  # Persistence layer test suite (37 tests)
│   └── coercion.test.ts     # Coercion test suite (28 tests)
├── dist/                    # Compiled output (npm package)
├── plans/                   # Implementation plans (gitignored)
├── .claude/
│   └── settings.json        # Claude Code project settings (gitignored)
├── .github/
│   ├── workflows/
│   │   └── ci-cd.yml        # CI + npm publish on v* tags
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.md    # Bug report template
│   │   ├── feature_request.md # Feature request template
│   │   └── config.yml       # Template chooser config
│   ├── PULL_REQUEST_TEMPLATE.md # PR checklist
│   └── dependabot.yml       # Weekly dependency updates
├── CHANGELOG.md             # Full version history
├── CONTRIBUTING.md          # Contribution guidelines
├── CODE_OF_CONDUCT.md       # Contributor Covenant v2.1
├── SECURITY.md              # Vulnerability reporting policy
├── oxlint.json              # Oxlint config (8 native plugins, zero npm deps)
├── biome.json               # Biome formatter config (linter disabled)
├── tsconfig.json            # TypeScript config (ES2024, NodeNext)
├── vitest.config.ts         # Vitest configuration
├── .node-version            # Node.js version (24)
├── LICENSE                  # MIT (Anthropic + Henry Chong)
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

## deep_planning Tool

Structured planning tool that manages multi-phase planning sessions. Complements `sequential_thinking` by tracking planning state while the LLM reasons deeply between phases.

### Workflow

```
init → clarify* → explore+ → evaluate+ → finalize → done
```

### Phase Parameters

| Phase        | Required Fields    | Optional Fields                                                                          |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------- |
| **init**     | `problem`          | `context`, `constraints` (JSON array string)                                             |
| **clarify**  | `question`         | `answer`                                                                                 |
| **explore**  | `branchId`, `name` | `description`, `pros`, `cons` (JSON array strings)                                       |
| **evaluate** | `branchId`         | `feasibility`, `completeness`, `coherence`, `risk` (0-10), `rationale`, `recommendation` |
| **finalize** | `selectedBranch`   | `steps`, `risks` (JSON array strings), `assumptions`, `successCriteria`, `format`        |

### Evaluation Scoring

Weighted score calculation: `feasibility*0.3 + completeness*0.25 + coherence*0.25 + (10-risk)*0.2`

### Output

Each call returns: `sessionId`, `phase`, `status`, `approachCount`, `evaluationCount`, `validNextPhases`, `message`, and optionally `plan` (in finalize phase).

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
| **Lint-Format-Typecheck-Test-Build** | All pushes, PRs | 24.x |
| **Publish to npm** | Tags matching v\* | 24.x             |

### npm Publishing

- **Trigger**: Only on version tags (e.g., `v1.0.0`)
- **Authentication**: NPM_TOKEN secret (unscoped packages require explicit token, not OIDC)
- **Version Check**: Tag must match `package.json` version

## Configuration

### Environment Variables

| Variable                  | Default | Purpose                        |
| ------------------------- | ------- | ------------------------------ |
| `DISABLE_THOUGHT_LOGGING` | `false` | Suppress stderr thought output |

### Test Coverage

| File           | Coverage                          |
| -------------- | --------------------------------- |
| coercion.ts    | 100%                              |
| lib.ts         | ~97%                              |
| planning.ts    | ~97%                              |
| persistence.ts | ~97%                              |
| index.ts       | Excluded (MCP server bootstrap)   |
| **Target**     | **90%+ overall** (enforced in CI) |

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
3. `CHANGELOG.md` - New changelog entry

## Version History

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## Roadmap

See `plans/20260130-yggdrasil-roadmap.md` for the 5-phase roadmap:

1. ~~**v1.0** - Core enhancements~~ (complete)
2. **v1.1** - Differentiation (Mermaid export, thought history retrieval)
3. **v1.2** - Self-evaluation tools
4. **v2.0** - Multi-agent evaluation (cross-model verification)
5. **v2.5** - Advanced orchestration (n8n, MCTS)

## Troubleshooting

### Pre-commit Hook Failures

If lint-staged fails:

1. Run `pnpm lint:fix` to auto-fix issues
2. Run `pnpm format` to format files
3. Stage fixed files and commit again

### npm Publish Skipped

If CI shows "publish skipped - version not higher":

- Increment version in `package.json`
- Also update version in `index.ts` (MCP server version)
