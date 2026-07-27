# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Yggdrasil-MCP** is a reasoning orchestration MCP server implementing Tree of Thoughts with multi-agent evaluation. It's a fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an enhanced feature roadmap. Current version: see `package.json` / `CHANGELOG.md` (v1.2.0 added Claude Desktop Extension `.mcpb` distribution).

| Aspect        | Details                                                                          |
| ------------- | -------------------------------------------------------------------------------- |
| **Package**   | `yggdrasil-mcp`                                                                  |
| **npm**       | https://www.npmjs.com/package/yggdrasil-mcp                                      |
| **Origin**    | Fork of `@modelcontextprotocol/server-sequential-thinking`                       |
| **Upstream**  | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking |
| **Key Fix**   | Claude Code string coercion bug #3084                                            |
| **Tools**     | `sequential_thinking`, `deep_planning`, `list_plans`, `get_plan`, `promote_plan`, `archive_plans` |
| **Distribution** | npm (`npx -y yggdrasil-mcp`) for Claude Code; `.mcpb` via `packages.henrychong.com/yggdrasil-mcp/` for Claude Desktop |

## Tech Stack

| Layer           | Technology                                             |
| --------------- | ------------------------------------------------------ |
| Language        | TypeScript                                             |
| Runtime         | Node.js 24                                             |
| MCP SDK         | @modelcontextprotocol/sdk                              |
| Validation      | Zod                                                    |
| Testing         | Vitest + @vitest/coverage-v8                           |
| Linting         | Oxlint (Rust-based, 668 built-in rules)                |
| Formatting      | Biome (linter disabled, Prettier-compatible)            |
| Git Hooks       | Husky + lint-staged                                    |
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

# Build .mcpb (Claude Desktop Extension)
pnpm build:mcpb

# Build .zip (Claude Code / Cowork plugin) — uses hoisted node_modules layout
pnpm build:cowork-plugin

# Build BOTH distribution artefacts
pnpm build:dist

# Validate the MCPB manifest source
pnpm validate:mcpb
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
│   ├── lib.test.ts                 # Sequential thinking test suite
│   ├── planning.test.ts            # Deep planning test suite
│   ├── persistence.test.ts         # Persistence layer test suite
│   ├── coercion.test.ts            # Coercion test suite
│   └── mcpb-manifest.test.ts       # MCPB manifest validation suite
├── mcpb/                    # Claude Desktop Extension assets
│   ├── manifest.json        # MCPB manifest (manifest_version 0.3)
│   ├── icon.png             # 256x256 icon
│   ├── README.md            # MCPB build + install docs
│   ├── install.html         # End-user install page (served from R2)
│   └── SLACK_POST.md        # Launch announcement templates (Fusang + external)
├── cowork-plugin/           # Claude Code / Cowork plugin assets
│   ├── .claude-plugin/
│   │   └── plugin.json      # Anthropic plugin manifest
│   ├── .mcp.json            # MCP server config (stdio, ${CLAUDE_PLUGIN_ROOT})
│   └── README.md            # Plugin build + install docs
├── scripts/
│   ├── build-mcpb.sh         # .mcpb bundle build (pinned @anthropic-ai/mcpb)
│   └── build-cowork-plugin.sh # Cowork/Code plugin ZIP build
├── dist/                    # Compiled TypeScript output (npm package)
├── dist-mcpb/               # Built .mcpb bundles (gitignored)
├── dist-cowork/             # Built plugin ZIPs (gitignored)
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
| **init**     | `problem`          | `planName`, `context`, `constraints` (JSON array string)                                 |
| **clarify**  | `question`         | `answer`                                                                                 |
| **explore**  | `branchId`, `name` | `description`, `pros`, `cons` (JSON array strings)                                       |
| **evaluate** | `branchId`         | `feasibility`, `completeness`, `coherence`, `risk` (0-10), `rationale`, `recommendation` |
| **finalize** | `selectedBranch`   | `steps`, `risks` (JSON array strings), `assumptions`, `successCriteria`, `format`        |

### Evaluation Scoring

Weighted score calculation: `feasibility*0.3 + completeness*0.25 + coherence*0.25 + (10-risk)*0.2`

### Output

Each call returns: `sessionId`, `phase`, `status`, `approachCount`, `evaluationCount`, `validNextPhases`, `message`, and optionally `plan` (in finalize phase).

### Descriptive Naming (v1.1.0)

Pass `planName` during init to generate human-readable session IDs:

- `planName: "auth-refactor"` → session ID `dp-20260315-auth-refactor`, markdown file `20260315-auth-refactor.md`
- No `planName` → random ID `dp-kR3xT9vW`, markdown file `20260315-dp-kR3xT9vW.md`

Duplicate names on the same day are rejected. Names are sanitized to kebab-case (max 60 chars).

## Plan Management Tools (v1.1.0)

### list_plans

List saved plans with unified view of Yggdrasil plans and Claude Code orphans.

| Parameter | Type   | Description                                              |
| --------- | ------ | -------------------------------------------------------- |
| `status`  | enum   | `complete` or `in-progress` (Yggdrasil only)             |
| `keyword` | string | Case-insensitive search in title/problem text            |
| `source`  | enum   | `yggdrasil` (default), `cc` (Claude Code orphans), `all` |
| `limit`   | number | Max results (default 20, max 50)                         |
| `offset`  | number | Skip first N results (default 0)                         |

### get_plan

Retrieve a saved session by ID. Formats: `markdown` (default) or `jsonl` (full event log).

### promote_plan

Promote a Claude Code plan file to the Yggdrasil index. Renames to `YYYYMMDD-{name}.md` format.

| Parameter  | Type   | Description                                           |
| ---------- | ------ | ----------------------------------------------------- |
| `filename` | string | Current CC plan filename (e.g., `silly-parrot.md`)    |
| `name`     | string | Descriptive name (sanitized to kebab-case)            |

### archive_plans

Move old plans to `archive/YYYY/` subdirectory. Default mode is dry run (preview only).

| Parameter    | Type    | Description                                            |
| ------------ | ------- | ------------------------------------------------------ |
| `olderThan`  | number  | Archive plans older than N days                        |
| `sessionIds` | string  | JSON array of specific session IDs                     |
| `source`     | enum    | `yggdrasil`, `cc`, `promoted`, `all`                   |
| `dryRun`     | boolean | Preview mode (default: true)                           |

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
| **Gitleaks & Lint-Format-Typecheck-Test-Build** | All pushes, PRs, tags | 24.x |
| **Publish to npm** | Tags matching `v*` | 24.x             |
| **Build & Release Claude Desktop Extension (.mcpb)** | Tags matching `v*` | 24.x |

### npm Publishing

- **Trigger**: Only on version tags (e.g., `v1.2.2`).
- **Authentication**: **OIDC trusted publisher** (configured on npmjs.org as of v1.2.1) — no `NPM_TOKEN` secret in the repo. The `publish` job declares `id-token: write` permissions and authenticates via the short-lived OIDC token validated by npmjs.org.
- **Provenance**: `npm publish --provenance` emits a Sigstore-signed SLSA build attestation; the npmjs.org package page shows the "Verified" badge.
- **Dist-tag handling**: stable releases (`X.Y.Z`) publish under `latest`. Pre-releases (any semver containing `-`, e.g. `1.2.1-rc.0`) publish under `next` instead — protects `npm install yggdrasil-mcp` consumers from accidentally getting pre-release code.
- **Version Check**: Tag must match `package.json` version (verified by the workflow before publish).
- **Install discipline (privileged jobs)**: `pnpm install --frozen-lockfile --ignore-scripts` (no lifecycle scripts under elevated permissions). `cache: 'pnpm'` deliberately dropped from `publish` + `release-mcpb` jobs (cache-poisoning defense — see v1.2.1 changelog).

## R2 Retention Policy (packages.henrychong.com)

On every release that uploads to `packages.henrychong.com/yggdrasil-mcp/`:

1. **Prune versioned artefacts older than 90 days** from the upload date of the new release: `yggdrasil-mcp-X.Y.Z.{mcpb,zip}` and their `.sha256` sidecars.
2. **Always retain the latest version's artefacts**, regardless of age. If every version on R2 is >90 days old, prune all except the latest.
3. **Out of scope — never prune**: `yggdrasil-mcp-latest.{mcpb,zip}`, `yggdrasil-mcp-latest.*.sha256`, any `SHA256SUMS` aggregation files.
4. **Sequence**: prune AFTER the new upload + latest-pointer repoint succeeds. Atomic-add-then-prune; never prune-then-add.
5. **Durable archive**: GitHub Release assets retain all versions indefinitely (`github.com/henrychong-ai/yggdrasil-mcp/releases/download/vX.Y.Z/...`). That is the canonical pin URL for consumers who need a specific historical version; `packages.henrychong.com` is the recency-bounded mirror.
6. **Implementation**: manual today. `RELEASE_RUNBOOK.md` carries the concrete prune commands. CI-automated step in the `release-mcpb` job is a follow-up.

**Rationale**: bounds R2 storage growth, reduces stable-URL exposure to old known-bad versions, preserves comfortable rollback window. The "keep latest" floor + GitHub Release fallback make this a one-way door we can always unwind from.

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

The version string is duplicated in **four** files — all must move together or the published artefacts disagree with each other:

1. `package.json` — package version
2. `index.ts` — MCP server version (`McpServer({ version: ... })`, line ~20)
3. `mcpb/manifest.json` — MCPB bundle version (`"version"`, line ~5)
4. `cowork-plugin/.claude-plugin/plugin.json` — Cowork plugin version (`"version"`, line ~4)

Plus `CHANGELOG.md` — new entry.

⚠️ **Do not bump these by JSON round-trip** (`json.load` → `json.dump`). Python's `json.dump` defaults to `ensure_ascii=True`, which rewrites the em-dashes and arrows in `mcpb/manifest.json`'s `display_name` / `long_description` as `—` / `→` escapes, and its indentation differs from Biome's — producing a large spurious diff that `format:check` then rejects. Use targeted string replacement instead.

## Dependency Maintenance

**pnpm overrides do NOT apply to auto-installed peers.** `vite` reaches the tree only as an auto-installed peer of `vitest`, so a `pnpm.overrides.vite` entry is silently ignored — resolution stays put even after deleting `pnpm-lock.yaml` and purging the pnpm metadata cache. Any transitive that arrives only as an auto-installed peer must be declared as a **direct devDependency** for its override to bind. Symptom: one override does nothing while every other override in the same block applies.

**Bound every override that shadows an exact upstream pin.** `miniflare` pins `undici` at exactly `7.28.0`; an unbounded `undici: ">=7.28.0"` override floated the tree to undici **8.9.0** — a transitive major outside miniflare's expectation, with no error. Prefer `>=X <MAJOR+1` for any override on a package the tooling pins precisely (`undici`, `fast-uri`, `sharp`).

**Overrides pinning a transitive major need the parent's declared range checked first.** `@hono/node-server >=2.0.5` is only legitimate from MCP SDK 1.30.0, which widened its range to `^1.19.9 || ^2.0.5`.

**`wrangler` is NOT an unused devDependency.** It has no config file and no `package.json` script, but `RELEASE_RUNBOOK.md` invokes `pnpm exec wrangler r2 object delete` for R2 release operations. Do not prune it as dead weight — it is also the transitive source of the `sharp` and `undici` advisories, so those need overrides rather than removal.

After any override change, regenerate the lockfile and confirm with `pnpm install --frozen-lockfile`.

## Version History

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## Roadmap

See `plans/20260130-yggdrasil-roadmap.md` for the 5-phase roadmap:

1. ~~**v1.0** - Core enhancements~~ (complete)
2. ~~**v1.1** - Symbiotic plans integration, descriptive naming, plan lifecycle tools~~ (complete)
3. ~~**v1.2** - Claude Desktop Extension (`.mcpb`) distribution via `packages.henrychong.com`~~ (complete)
4. **v1.3** - Differentiation (Mermaid export, thought history retrieval, self-evaluation)
5. **v2.0** - Multi-agent evaluation (cross-model verification)
6. **v2.5** - Advanced orchestration (n8n, MCTS)

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

### Cowork plugin upload rejected — "invalid characters in path"

Anthropic's Cowork plugin upload validator rejects bundled `node_modules/` trees, even with pnpm's content store flattened via `--node-linker=hoisted`. Tested rejections include paths containing `+` (pnpm peer-dep encoding) **and** standard npm scope paths like `node_modules/@modelcontextprotocol/sdk/...`. The validator appears to reject any nested package metadata, not just pnpm-specific layouts.

**Architecture: use `npx -y` not bundled server.** Matches Anthropic's [reference plugins](https://github.com/anthropics/claude-code/tree/main/plugins) and the canonical example in their [plugins-reference docs](https://code.claude.com/docs/en/plugins-reference#mcp-servers).

`cowork-plugin/.mcp.json`:
```json
{
  "mcpServers": {
    "yggdrasil": {
      "command": "npx",
      "args": ["-y", "yggdrasil-mcp"]
    }
  }
}
```

The plugin ZIP contains only the manifest + `.mcp.json` + README (~2.5 KB total). The server runtime is fetched from npm at first invocation and cached locally.

The `scripts/build-cowork-plugin.sh` script enforces this with a pre-flight `find` check that fails the build if any `+`, `!`, `?`, or `@` characters appear in any staged path. If you see the upload rejected anyway, re-inspect the ZIP:

```bash
unzip -l dist-cowork/yggdrasil-mcp-*.zip | awk '{print $NF}' | grep -oE '[^a-zA-Z0-9./_-]' | sort -u
# Should be empty — any output indicates a build-script regression
```

### .mcpb vs .zip architectural difference

The `.mcpb` (Claude Desktop) **does** bundle `node_modules/` because the MCPB installer doesn't perform the same path-character validation Cowork does. Result: `.mcpb` is ~12 MB while the Cowork `.zip` is ~2.5 KB. The two formats serve different surfaces with different validator strictness.
