# Changelog

All notable changes to this project are documented in this file.

## v1.2.4 (2026-05-27) — Install page icon → absolute URL on assets.henrychong.com

Tiny follow-up to v1.2.3: the install.html landing page referenced the icon via a relative path (`src="icon.png"`), which only resolves inside the .mcpb bundle. When the same install.html was served standalone from `packages.henrychong.com/yggdrasil-mcp/install.html`, the icon failed to load (no co-located icon.png on R2).

### Changed

- **`mcpb/install.html`** — `<img src="icon.png">` → `<img src="https://assets.henrychong.com/yggdrasil/yggdrasil-mcp-icon.png">`. Works on both surfaces:
  - **Standalone** (`packages.henrychong.com/yggdrasil-mcp/install.html`) — fetches the icon from the public R2 CDN.
  - **Inside .mcpb** — same absolute URL also works (browser doesn't care about absolute vs relative as long as the URL resolves).
- Uploaded `mcpb/icon.png` (256×256, 7.7 KB) to `assets.henrychong.com/yggdrasil/yggdrasil-mcp-icon.png` to match the existing `/yggdrasil/yggdrasil-mcp-logo*.png` naming convention.

## v1.2.3 (2026-05-27) — Install page typography update

Patched the MCPB install landing page (`mcpb/install.html`, served from `packages.henrychong.com/yggdrasil-mcp/install.html`) to use the Fusang Group canonical typography stack — **Inter Variable** (Latin sans) + **Maple Mono NL Variable** (mono for code/pre blocks), both self-hosted on `assets.fusang.co`. No CJK on this surface (English-only install flow).

### Changed

- **`mcpb/install.html`** — added `<link rel="preconnect" href="https://assets.fusang.co" crossorigin />`, four `@font-face` blocks (Inter roman + italic, Maple Mono NL roman + italic), body `font-family` chain now leads with Inter, `code, pre` block leads with Maple Mono NL and applies mandatory `font-feature-settings: 'cv01' 1, 'cv32' 1, 'cv33' 1, 'cv34' 1, 'cv35' 1, 'cv36' 1, 'cv37' 1` (cv01 tames Maple Mono NL v7.9's fancy `@` and broken-slash `$`; cv32–cv37 is the official "plain style" italic preset). Inter `font-optical-sizing: auto` set on `body`.
- Aligns the install landing page with the canonical Fusang Group brand typography (same stack as henrychong.com, fusang.co, blocktree.co, portcullis.group, etc.).

### Notes

- The install.html file is bundled into the `.mcpb` artefact at build time AND served separately from `packages.henrychong.com/yggdrasil-mcp/install.html`. Both surfaces pick up the new fonts via the next release.
- WOFF2-only delivery; no TTF fallback (universal browser support since IE11 EOL 2022).
- Single-layer fallback per font: Inter → system stack; Maple Mono NL → `ui-monospace` → system mono. No Google Fonts DR layer (matches `/brand-guidelines` font-hosting doctrine).

## v1.2.2 (2026-05-20) — Dependency & security sweep

Triaged all open Dependabot security alerts (4) and dependency PRs (10). Resolved the 4 security alerts, swept dev-deps to current, bumped GitHub Actions majors, and closed obsolete tracking PRs. Deferred TypeScript 6 major to a dedicated upgrade session.

### Security — Dependabot alerts resolved (4 → 0)

- **GHSA-q3j6-qgpj-74h6 + GHSA-v39h-62p7-jpjc** (HIGH): `fast-uri` → `^3.1.2`. Resolves both the path traversal (alert #34, ≤3.1.0) and host confusion (alert #35, ≤3.1.1) via percent-encoded authority delimiters. Pulled in transitively via `@modelcontextprotocol/sdk`. Landed via PR #37 merge.
- **GHSA-v2v4-37r5-5v8g** (MEDIUM): `ip-address` → `^10.1.1` (resolved to 10.2.0 via pnpm `overrides`). XSS in `Address6` HTML-emitting methods (alert #33). Transitive via `express-rate-limit → @modelcontextprotocol/sdk`; required `pnpm.overrides` because the direct dep range pinned 10.1.0.
- **GHSA-52f5-9888-hmc6** (LOW): `tmp` → `^0.2.4` (resolved to 0.2.5). Arbitrary temp file/dir write via symbolic link `dir` parameter (alert #37). Transitive via `external-editor → @inquirer/editor → @anthropic-ai/mcpb`; required `pnpm.overrides` to escape the legacy `0.0.33` resolution.

### Changed — dev-dependency sweep (batched, replaces PRs #41/#45/#46/#47/#48)

- `@biomejs/biome` 2.4.14 → 2.4.15 (patch)
- `semver` 7.7.4 → 7.8.0 (minor)
- `oxlint` 1.63.0 → 1.66.0 (minor)
- `@types/node` 25.6.1 → 25.9.1 (minor)
- `lint-staged` 16.4.0 → **17.0.5** (MAJOR — requires Node 22.22.1+ and Git 2.32.0+; both satisfied by `engines.node: >=24` and modern Git toolchains. Internal `commander` → `parseArgs` migration is no-op for consumers. `yaml` dependency now optional — we don't use it.)

### Changed — GitHub Actions majors (batched, replaces PRs #43/#44)

- `pnpm/action-setup` v4 → **v6** in all three jobs (`build`, `publish`, `release-mcpb`). v6 adds pnpm v11 support; CI green on PR confirms no input-format regressions for our usage.
- `softprops/action-gh-release` v2 → **v3** in the `release-mcpb` job. v3 migrates the action runtime from Node 20 to Node 24, matching the rest of our CI stack.

### Closed (no-op)

- **PR #38** (Henry's own `claude/confident-dijkstra-bym1P` branch targeting v1.1.5) closed as obsolete — repo is already at v1.2.1 and the proposed bumps are subsumed by this release.
- **PR #29** (`typescript` 5.9.3 → 6.0.3) closed with `defer` reasoning. CI was failing and the branch had merge conflicts; a TS major upgrade deserves its own focused session with test fixes, not a sweep. Dependabot will reopen on the next major refresh if still relevant.

### Notes

- All 4 Dependabot security alerts confirmed resolved on next-scan dismissal.
- `pnpm.overrides` is the load-bearing mechanism for the `ip-address` + `tmp` fixes — they sit deep enough in the tree that a top-level `pnpm up` cannot reach them without the override hint. The `rm -f pnpm-lock.yaml && pnpm install` re-resolve was required (pnpm's cached resolutions ignore newly-added overrides).
- CodeQL: 0 open alerts. Secret scanning: 0 open alerts.

---

## v1.2.1 (2026-05-20) — OIDC publish migration + hardening

Driven by Codex auto-PR-review + parallel `/simplify` + `/security-review` + `/codex` reviews on the OIDC migration branch. Substantive findings landed in this branch before merge; lower-priority findings documented for follow-up.

### Hardening — security

- **Cache-poisoning defense**: dropped `cache: 'pnpm'` from `publish` (has `id-token: write`) and `release-mcpb` (has `contents: write`) jobs. A pnpm cache populated by lower-trust PR workflows could leak malicious tarballs that execute via lifecycle scripts under elevated privileges on a later tagged release. Defense-in-depth: `pnpm install --frozen-lockfile --ignore-scripts` in both privileged jobs.
- **Pinned `@anthropic-ai/mcpb` to exact `2.1.2`** as devDep. `build-mcpb.sh` now invokes via `pnpm exec mcpb` (lockfile-resolved) instead of `npx -y @anthropic-ai/mcpb@^2.1.0` (live semver fetch at build time). Eliminates a supply-chain surface where a malicious 2.1.x patch could alter built artefacts.
- **Latest-pointer .sha256 sidecars** now reference `yggdrasil-mcp-latest.{mcpb,zip}` in body (was: copied versioned sidecar verbatim). `shasum -a 256 -c yggdrasil-mcp-latest.mcpb.sha256` after downloading the latest pointer now succeeds.

### Hardening — correctness

- **Cowork plugin pins runtime version**: `cowork-plugin/.mcp.json` source uses `npx -y yggdrasil-mcp` (resolves to `@latest` for local dev). `build-cowork-plugin.sh` substitutes to `yggdrasil-mcp@${VERSION}` at build time so the shipped `.zip` is reproducible — a `v1.2.1-rc.0` plugin won't accidentally run the stable npm `latest` after upload.

### Hardening — efficiency / cleanup

- **SHA256SUMS aggregation reuses build-script sidecars**: build scripts already emit per-artefact `.sha256` sidecars; the workflow's aggregate step now concats them instead of re-running `shasum`. Dropped redundant per-dir `dist-{mcpb,cowork}/SHA256SUMS` (byte-identical to existing sidecars).
- **Artefact paths derived from `$GITHUB_REF`** instead of fragile `ls` glob.
- **`r2_put` bash helper** consolidates 9× near-identical `aws s3 cp` calls. ~30 lines → ~12.

### Added — operations docs

- **`RELEASE_RUNBOOK.md`**: happy-path release procedure, per-channel verification commands, six failure-mode scenarios with concrete rollback steps (npm dist-tag rollback, R2 latest-pointer repoint, GitHub Release retraction, Fusang Cowork re-upload, OIDC config drift, emergency token fallback).

### Deferred (separate PRs)

- Redundant `pnpm build` across 3 jobs — artifact-passing refactor for marginal ($0.50/yr) savings, not blocking
- `release-mcpb: needs: [build, publish]` to serialize the two distribution legs — re-analysis: `.mcpb` is self-contained (bundles `dist/`); the `.zip` plugin's `npx -y yggdrasil-mcp@<version>` pin now eliminates the cross-channel divergence concern that motivated this finding. Partial-release scenarios are now covered by the `RELEASE_RUNBOOK.md` rollback procedures.
- `claude plugin validate --strict` in CI — requires claude CLI install pattern in CI, not blocking. Manifest validation tests already catch the common drift patterns.
- Pre-release detection via `semver.prerelease()` instead of `*-*` glob — the `*-*` pattern is industry-standard for npm publish workflows; adding `semver` devDep for marginal idiomatic gain not worth the cost.

### OIDC migration core (the original work)

Investigation during v1.2.0 release surfaced that `NPM_TOKEN` had been silently failing since ~v1.1.3 (2026-04-15); npm registry was stuck at v1.1.2 for ~5 weeks. Migrating to OIDC trusted publishing eliminates token rotation entirely. Tagging v1.2.1 (rather than retrying v1.2.0) because npm publish is immutable — v1.2.0 attempts cannot be re-issued.

`.github/workflows/ci-cd.yml` `publish` job:
- Authenticates to npm via OIDC trusted publisher (configured on npmjs.org) instead of `NODE_AUTH_TOKEN` / `NPM_TOKEN` secret
- Adds `--provenance` flag to `npm publish` → Sigstore-signed SLSA build attestation; "Verified" badge on npmjs.org package page
- Pre-release versions (containing `-`, e.g. `1.2.1-rc.0`) publish under `next` dist-tag instead of `latest` — protects `npm install yggdrasil-mcp` consumers
- Switched from `npm install` (with the `rm -rf node_modules && rm -f package-lock.json` anti-pattern that defeated lockfile integrity) to `pnpm install --frozen-lockfile --ignore-scripts`
- Removed redundant `chmod +x dist/*.js` step — `pnpm build` already handles it via `shx chmod +x dist/*.js`
- Eliminates the long-lived `NPM_TOKEN` secret. OIDC tokens are short-lived (≤1 hour), scoped to one workflow run, and validated against the Trusted Publisher config on npmjs.org
- npm package access switched to "Require two-factor authentication and disallow tokens (recommended)" — closes the attack vector entirely

### Sidebar — npm registry gap

v1.1.3, v1.1.4, and v1.2.0 had successful CI runs but failed silently at the npm publish step (auth error returned 404). npm registry consequently sat at v1.1.2 for the entire period. Functional MCP server logic was identical across 1.1.2 → 1.2.0 (no tool behaviour changes; packaging-only deltas), so downstream consumers were unaffected at runtime — just running on an older version string. v1.2.1 closes the gap.

---

## v1.2.0 (2026-05-20)

### Added — Multi-surface distribution to Claude Desktop, Cowork, and Code

Yggdrasil now ships in **two complementary formats** alongside the existing npm distribution:

1. **`.mcpb` (Claude Desktop Extension)** — one-click install in Claude Desktop. Distributed via Fusang Teams workspace allowlist (org admin upload) AND public download at `packages.henrychong.com`.
2. **`.zip` (Claude Code / Cowork plugin)** — bundled stdio MCP server packaged per Anthropic's plugin spec (`.claude-plugin/plugin.json` + `.mcp.json`). Distributed via Fusang Teams workspace plugin upload AND public download at `packages.henrychong.com`.
3. **npm (`npx -y yggdrasil-mcp`)** — unchanged, for Claude Code CLI / programmatic consumers.

Mobile / pure-web Cowork remain architecturally out of scope (stdio MCP cannot reach those surfaces).

### Repo changes

- New `mcpb/` directory: `manifest.json` (MCPB manifest_version 0.3), `icon.png`, `README.md`, `install.html` (external download page), `SLACK_POST.md` (Fusang + external launch copy)
- New `cowork-plugin/` directory: `.claude-plugin/plugin.json` (Anthropic plugin manifest), `.mcp.json` (stdio MCP config with `${CLAUDE_PLUGIN_ROOT}`), `README.md`
- New `scripts/build-mcpb.sh` — compile → stage → pack via `@anthropic-ai/mcpb@^2.1.0` → SHA256
- New `scripts/build-cowork-plugin.sh` — stages `.claude-plugin/plugin.json` + `.mcp.json` + `README.md` only (no bundled server runtime) → invalid-character pre-flight check → ZIP → assert <45 MB → SHA256. **Architecture matches Anthropic's reference plugins:** `.mcp.json` invokes `npx -y yggdrasil-mcp` at runtime; npm fetches the server on first use, auto-updates on each run. Resulting bundle is ~2.5 KB. The earlier attempt to bundle `server/dist/` + production `node_modules` was rejected by Cowork's plugin upload validator even with `--node-linker=hoisted` and full pnpm-metadata scrub, suggesting the validator rejects ALL paths under `node_modules/@*` not just pnpm-specific layouts — matches Anthropic's documented best practice of using `npx` / `uvx` rather than bundling
- New `pnpm` scripts: `build:mcpb`, `build:cowork-plugin`, `build:dist` (both), `validate:mcpb`
- Extended `.github/workflows/ci-cd.yml`: new `release-mcpb` job triggers on `v*` tags, builds **both** `.mcpb` and `.zip`, attaches to GitHub Release with combined `SHA256SUMS`, uploads versioned + `-latest` pointers + checksums to R2 (`packages` bucket on HC Personal Cloudflare)
- New `.github/dependabot.yml` ecosystem `github-actions` — weekly SHA-pinning of CI actions
- New tests: `__tests__/mcpb-manifest.test.ts` (17 assertions on MCPB manifest), `__tests__/cowork-plugin-manifest.test.ts` (16 assertions on plugin.json + `.mcp.json` + filesystem layout per Anthropic spec warning)

### Infrastructure provisioned (out-of-repo, in same session)

- R2 bucket `packages` on HC Personal CF account (APAC, Standard) — bound to `packages.henrychong.com` with TLS 1.2 min
- Bifrost vanity route `henrychong.com/yggdrasil-latest` → 302 → `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb`
- CORS rule applied uniformly to 10 public-bound R2 buckets on HC Personal account: GET-only, origins `*`, ExposeHeaders `[ETag]`, MaxAge 3600 (drift fix + future-proofing in same change)
- `/infra-hc` skill updated with R2 bucket / domain / CORS snapshots + narrative (Cloudflare write-back rule)

### Security

- `@anthropic-ai/mcpb` pinned to `^2.1.0` in `.mcpb` build script (defends against package hijack)
- `wrangler@4.93.0` added as devDep for local R2 operations
- Production install in both build scripts runs with `--ignore-scripts` (defends against malicious postinstall hooks)
- `SHA256SUMS` published alongside both `.mcpb` and `.zip` on both GitHub Release and R2 for tamper detection
- R2 token scoped to bucket `packages` ONLY at creation — single-bucket scope verified before save (limits blast radius on key leak; protects `files-sonjachong` medical PII and other family buckets)
- GitHub tag protection rule pending — will restrict `v*` tag creation to admin role
- Dependabot ecosystem `github-actions` added — weekly SHA-pin auto-bumps for CI workflow

### Distribution paths matrix

| Audience | Surface | Path | Mechanism |
|---|---|---|---|
| Fusang Teams members | Claude Desktop | A | Org admin uploads `.mcpb`; one-click install |
| Fusang Teams members | Claude Cowork (desktop) | B | Org admin uploads `.zip`; auto-install |
| External / community / Henry's Personal plan | Claude Desktop | C | Direct download from `packages.henrychong.com` |
| Henry's CLI | Claude Code | D | `npx -y yggdrasil-mcp` (unchanged) |

---

## v1.1.4 (2026-05-07)

### Dependencies

Routine minor/patch dependency bumps. Supersedes open Dependabot PRs #28, #32, #34, #35.

- `zod` 4.3.6 → 4.4.3 (supersedes Dependabot PR #35)
- `@biomejs/biome` 2.4.12 → 2.4.14 (supersedes Dependabot PR #32)
- `@types/node` 25.6.0 → 25.6.1
- `@vitest/coverage-v8` 4.1.4 → 4.1.5
- `vitest` 4.1.4 → 4.1.5
- `oxlint` 1.60.0 → 1.63.0 (supersedes Dependabot PR #34)
- `hono` override `>=4.12.12` → `>=4.12.14` — security fix for JSX SSR attribute name handling (GHSA-458j-xx4x-4375), supersedes Dependabot PR #28

Deferred (major versions, separate review required):

- `typescript` 5.9.3 → 6.0.3 (Dependabot PR #29)
- `lint-staged` 16.4.0 → 17.0.2

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
