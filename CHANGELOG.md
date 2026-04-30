# Changelog

All notable changes to this project are documented in this file.

## v1.1.4 (2026-04-30)

### Dependencies

Routine minor/patch dependency bumps. No vulnerabilities reported by `pnpm audit`. Addresses open Dependabot PRs #28, #31, #32.

- `zod` 4.3.6 → 4.4.1
- `@biomejs/biome` 2.4.12 → 2.4.13 (Dependabot #32)
- `@vitest/coverage-v8` 4.1.4 → 4.1.5
- `oxlint` 1.60.0 → 1.62.0 (supersedes Dependabot #31 → 1.61.0)
- `vitest` 4.1.4 → 4.1.5
- `hono` override `>=4.12.12` → `>=4.12.14` (Dependabot #28 — bumps transitive `hono` and `postcss` 8.5.9 → 8.5.10 in lockfile)

Deferred (major version, requires separate review):

- `typescript` 5.9.3 → 6.0.3 (Dependabot #29) — TypeScript 6.x is a major release; defer pending compat review

---

## v1.1.3 (2026-04-15)

### Dependencies

Routine minor/patch dependency bumps. No vulnerabilities reported by `pnpm audit`.

- `@modelcontextprotocol/sdk` 1.28.0 → 1.29.0
- `@biomejs/biome` 2.4.9 → 2.4.12
- `@types/node` 25.5.0 → 25.6.0
- `@vitest/coverage-v8` 4.1.2 → 4.1.4
- `oxlint` 1.57.0 → 1.60.0
- `vitest` 4.1.2 → 4.1.4

Deferred (major version, requires separate review):

- `typescript` 5.9.3 → 6.0.2

---

## v1.1.2 (2026-04-12)

### Fixed
- Fix time-bomb test failures in `archivePlans` — replace hardcoded fixture dates with `Date.now()` offsets so tests don't fail as calendar time advances

### CI
- Add gitleaks secret scanning to CI pipeline (fail-fast before install)

---

## v1.1.1 (2026-04-11)

**Security patches — dependabot advisories resolved**

### Security

All patches applied via `pnpm.overrides` (vulnerable packages are transitive-only).

- **hono 4.12.7 → 4.12.12** (via `@hono/node-server` → `@modelcontextprotocol/sdk`) — 5 advisories: cookie prefix bypass (GHSA-r5rp-j6wh-rvv4), cookie name validation in `setCookie()`, IPv4-mapped IPv6 `ipRestriction()` bypass, `serveStatic` repeated-slash middleware bypass, `toSSG()` path traversal
- **@hono/node-server 1.19.11 → 1.19.13** — `serveStatic` middleware bypass
- **vite 7.3.1 → 7.3.2** (via `vitest`) — WebSocket arbitrary file read, `server.fs.deny` query bypass, optimized deps `.map` path traversal
- **picomatch 2.3.1 → 2.3.2 and 4.0.3 → 4.0.4** — ReDoS via extglob quantifiers and method injection in POSIX character classes
- **path-to-regexp 8.3.0 → 8.4.2** (via `express` → `@modelcontextprotocol/sdk`) — DoS via sequential optional groups and multiple wildcards
- **yaml 2.8.2 → 2.8.3** — stack overflow via deeply nested YAML collections

### Dependencies

- Added `pnpm.overrides` entries for `hono`, `@hono/node-server`, `vite`, `picomatch` (with nested `micromatch>picomatch ^2.3.2` for shelljs/fast-glob compat), `path-to-regexp`, and `yaml` to force patched versions across the dependency tree

---

## v1.1.0 (2026-03-15)

**Feature: Symbiotic Plans Integration**

- Add descriptive naming for `deep_planning` sessions: optional `planName` parameter generates `dp-YYYYMMDD-{name}` session IDs
- Clean markdown filenames: `YYYYMMDD-{name}.md` for descriptive plans (strips `dp-` prefix)
- Duplicate name detection: reject collisions on init with clear error message
- Enhanced `list_plans`: pagination (`limit`/`offset`), source filter (`yggdrasil`/`cc`/`all`), Claude Code orphan discovery with title extraction
- New `promote_plan` tool: rename CC plan files to `YYYYMMDD-{name}.md` and add to Yggdrasil index
- New `archive_plans` tool: move old plans to `archive/YYYY/` subdirectory with dry-run support
- Add `toKebabCase()` and `deriveMarkdownFilename()` utilities for filename sanitization
- Add `sessionExists()` for sync duplicate detection
- Add `name` field to `PlanIndexEntry` for display
- Add `optionalNonNegativeNumberSchema` to coercion module
- Path traversal protection for `promote_plan` input validation
- Guaranteed index persistence via `writeIndexStrict()` for `promote_plan`/`archive_plans`
- Backward compatible: existing sessions and random ID format unchanged
- 206 tests (52 new), 97%+ coverage maintained

## v1.0.5 (2026-03-15)

**Dependency updates**

- Update devDependencies:
  - @biomejs/biome 2.4.6 → 2.4.7
  - vitest 4.0.18 → 4.1.0
  - @vitest/coverage-v8 4.0.18 → 4.1.0
  - lint-staged 16.3.3 → 16.4.0
  - oxlint 1.51.0 → 1.55.0 (via Dependabot #14)
  - @types/node 25.4.0 → 25.5.0 (via Dependabot #15)
  - pnpm 10.30.0 → 10.32.1
- Close Dependabot PRs #14, #15
- 154 tests, 97%+ coverage

## v1.0.4 (2026-03-11)

**Dependency updates — security fixes for hono ecosystem**

- Fix 4 security vulnerabilities in transitive hono dependencies:
  - Authorization bypass in Serve Static Middleware (GHSA-wc8c-qw6v-h7f6)
  - SSE Control Field Injection (GHSA-p6xx-57qc-3wxr)
  - Cookie Attribute Injection in setCookie() (GHSA-5pq2-9x2x-5p6w)
  - Middleware Bypass in Serve Static (GHSA-q5qw-h33p-qvwr)
- Update transitive deps: hono 4.11.10 → 4.12.7, @hono/node-server 1.19.9 → 1.19.11
- Update devDependencies:
  - @biomejs/biome 2.4.5 → 2.4.6
  - @types/node 24.11.0 → 25.4.0
  - lint-staged 16.2.7 → 16.3.3
- Close 4 Dependabot PRs (#10–#13) superseded by direct updates
- 154 tests, 97%+ coverage

## v1.0.3 (2026-03-04)

**Dependency updates and README logo**

- Update all dependencies to latest:
  - @modelcontextprotocol/sdk 1.26.0 → 1.27.1
  - @biomejs/biome 2.4.2 → 2.4.5
  - @types/node 24.10.13 → 24.11.0
  - oxlint 1.48.0 → 1.51.0
- Add project logo to README (hosted on assets.henrychong.com CDN)
- Close 4 Dependabot PRs (#5–#8) superseded by direct updates
- 154 tests, 97%+ coverage

## v1.0.2 (2026-03-04)

**Security fix**

- Fix rollup CVE-2026-27606 (high — arbitrary file write via path traversal)
- Bump transitive rollup dependency 4.57.1 → 4.59.0 via lockfile update
- Resolve last open Dependabot alert (#9)

## v1.0.1 (2026-02-19)

**Documentation fixes**

- Fix Tech Stack: "OIDC npm publish" → "npm publish on v* tags" (was incorrect)
- Fix roadmap file path to use YYYYMMDD-prefixed filename
- Mark v1.0 roadmap phase as complete
- Update roadmap: remove stale model references
- README: add Node.js version badge
- README: document `list_plans` and `get_plan` tools (were missing)
- README: link Contributing section to CONTRIBUTING.md

## v1.0.0 (2026-02-19)

**Stable release — all dependencies updated to latest**

- Bump to v1.0.0 (stable API, production-ready)
- Update all dependencies to latest versions:
  - chalk 5.3.0 → 5.6.2
  - @biomejs/biome 2.3.15 → 2.4.2
  - oxlint 1.47.0 → 1.48.0
  - semver 7.7.3 → 7.7.4
  - shx 0.3.4 → 0.4.0
- Resolves Dependabot security alerts (ajv CVE-2025-69873, qs)
- Close Dependabot PR #1 (superseded by full update)
- Reorder CI steps: lint → format → typecheck → test → build (fail-fast)
- Rename CI job to "Lint-Format-Typecheck-Test-Build"
- 154 tests, 97%+ coverage

## v0.9.4 (2026-02-19)

**Switch to Node 24 only + ES2024 target**

- Update TypeScript target from ES2022 to ES2024
- Drop Node 20/22 support, require Node >=24
- Remove CI build matrix (was 20.x/22.x/24.x, now 24.x only)
- Upgrade @types/node from ^22 to ^24
- No source code changes required

## v0.9.3 (2026-02-19)

**Public release preparation and CI/CD alignment**

- Make repository public on GitHub (henrychong-ai/yggdrasil-mcp)
- Upgrade GitHub Actions: checkout v4→v6, setup-node v4→v6
- Add concurrency group, job timeouts, top-level permissions, workflow_dispatch
- Use `pnpm install --frozen-lockfile` in CI
- Narrow PR trigger to main branch only
- Add Biome VCS integration block for gitignore-aware CI
- Fix lint-staged: remove md/yml/yaml from biome glob (unsupported formats)
- Move plans directory from `.claude/plans/` to `plans/` at repo root
- Untrack TODO.md from git (gitignore now effective)
- Update project structure in CLAUDE.md

## v0.9.2 (2026-02-13)

**Migrate lint stack from ESLint+Prettier to Oxlint+Biome**

- Replace ESLint 9 (flat config + 9 plugins) with Oxlint (668 built-in rules, 8 native plugins)
- Replace Prettier with Biome formatter (linter disabled, Prettier-compatible settings)
- Remove 12 lint/format devDependencies, add 2 (oxlint, @biomejs/biome)
- Delete `eslint.config.js`, `.prettierrc`, `.prettierignore`, `tsconfig.eslint.json`
- Create `oxlint.json` (plugins: import, promise, node, vitest)
- Create `biome.json` (format + import sorting, linter disabled)
- Update package.json scripts and lint-staged config
- Add `pnpm format:check` step to CI workflow
- 50-100x faster linting, 25x faster formatting

## v0.9.1 (2026-02-11)

**Feature: Session Resumption for deep_planning**

- Add `sessionId` parameter to `deep_planning` tool for switching between multiple planning sessions
- Add `tryResumeSession()` method to `DeepPlanningServer` for loading sessions from JSONL persistence
- Add `loadSession()` method to `PersistenceManager` for reading session state from disk
- Add write-tracking (`track()` + `flush()`) to `PersistenceManager` for race-condition-safe session loading
- Change `processPlanningStep` from sync to async to support disk-based session loading
- Convert fire-and-forget persistence writes to tracked writes (flushed before session loads)
- Backward compatible: `sessionId` is optional, existing workflows unchanged
- 7 new session resumption tests (154 total, 97%+ coverage)

## v0.9.0 (2026-02-07)

**Feature: Hybrid JSONL + Markdown Persistence for deep_planning**

- Add `persistence.ts` module with zero-dependency persistence layer
- Session IDs now use 8-char Base62 cryptographic random IDs (`crypto.randomBytes`)
- Plans directory resolves from CC `plansDirectory` setting chain: env var → project settings → global settings → `~/.claude/plans/`
- JSONL event log appended on every phase transition (crash-safe incremental persistence)
- Markdown plan exported on finalize with `YYYYMMDD-{sessionId}.md` naming
- Atomic JSON index (`yggdrasil-plans-index.json`) for fast listing with write-to-tmp + rename
- Add `list_plans` MCP tool: filter by status (complete/in-progress), keyword search
- Add `get_plan` MCP tool: retrieve by sessionId in markdown or jsonl format
- Index rebuild from JSONL files when index is corrupted or missing
- Fire-and-forget persistence: async writes never block MCP responses
- 37 new persistence tests (147 total, 97%+ coverage)

## v0.8.2 (2026-02-06)

**Fix: Allow session restart in deep_planning**

- Fix `init` being rejected after a completed session (`done` → `init` transition blocked)
- Allow `init` from any state — it always creates a fresh session regardless of current phase
- Add `'init'` to `done` valid transitions for UX guidance in `validNextPhases` output
- 4 new session restart tests, 1 updated test (108 total)

## v0.8.1 (2026-02-06)

**Fix: Step field normalization in deep_planning**

- Fix finalize phase rendering "Step N: undefined" when step objects use non-canonical field names
- Add `normalizePlanStep()` helper that maps common aliases: `action`→`title`, `detail`→`description`, `name`→`title`, `details`/`info`→`description`
- Falls back to "Step N" / "" when no recognized field is present
- 8 new tests for step normalization (101 total)

## v0.8.0 (2026-02-06)

**New Tool: deep_planning**

- Add `deep_planning` MCP tool for structured multi-phase planning sessions
- Planning workflow: init → clarify → explore → evaluate → finalize
- Weighted evaluation scoring (feasibility, completeness, coherence, risk)
- Markdown and JSON plan output formats
- Add `optionalScoreSchema` to coercion utilities for 0-10 score fields
- Add `DeepPlanningServer` class in new `planning.ts` module
- 51 new tests for planning engine (93 total, 97%+ coverage)

## v0.7.5 (2026-02-06)

**Tool Rename**

- Rename MCP tool from `sequentialthinking` to `sequential_thinking` for ecosystem alignment
- 90%+ of public MCP servers use snake_case naming convention
- Move plans to `.claude/plans/` directory with `plansDirectory` setting
- Add `.claude/` and `TODO.md` to `.gitignore`

## v0.7.4 (2026-02-05)

**Security Fix**

- Fix @isaacs/brace-expansion vulnerability (CVE-2026-25547) via pnpm override to 5.0.1

## v0.7.3 (2026-02-05)

**Security Fix + Public Release Preparation**

- Fix @modelcontextprotocol/sdk vulnerability (CVE-2026-25536) - upgrade to 1.26.0
- Add community files: CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md
- Add GitHub issue templates (bug report, feature request)
- Add pull request template with checklist
- Enhance .gitignore with comprehensive patterns
- Remove unused yargs dependency
- Rewrite git history: change author email, redact 1Password references

## v0.7.2 (2026-01-31)

**Documentation & Scaffolding**

- Add LICENSE (MIT with Anthropic + Henry Chong dual copyright)
- Add `.node-version` (24) and `packageManager` field
- Add `exports` field for modern ESM
- Add task integration plan to roadmap
- Update TODO.md with completed items

## v0.7.1 (2026-01-31)

**CI/CD Improvements**

- Upgrade pnpm from 9 to 10
- Use Node 24.x (current LTS) for npm publish
- Rename workflow to `ci-cd.yml` for consistency

## v0.7.0 (2026-01-31)

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

## v0.6.3 (2026-01-30)

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
