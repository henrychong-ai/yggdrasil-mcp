# Release Runbook

Operational procedures for `yggdrasil-mcp` releases — happy path, failure modes, and rollback per distribution surface.

## Happy path

```bash
# 1. Bump version (package.json + index.ts + CHANGELOG.md per CLAUDE.md Version Policy)
# 2. Quality gate
pnpm check && pnpm test   # BOTH — check alone does NOT run the version-parity tests
rg --hidden -n "$(jq -r .version package.json)" package.json index.ts \
  mcpb/manifest.json cowork-plugin/.claude-plugin/plugin.json | wc -l  # must print 4
# 3. Tag + push (admin-only per the v* tag protection ruleset)
git tag v1.2.x && git push origin v1.2.x
# If the tag run FAILS: never move/reuse the tag — fix, bump the next patch,
# tag that, and mark the dead tag in CHANGELOG (precedent: v1.2.9).
# 4. CI does the rest — watch
gh run watch
```

CI fans out to two parallel jobs after the `build` job succeeds:

1. **`publish`** — npm publish via OIDC + SLSA provenance
2. **`release-mcpb`** — builds `.mcpb` + `.zip`, attaches to GitHub Release, uploads to R2

## Verification after CI

```bash
# npm
npm view yggdrasil-mcp@<version> version

# GitHub Release
gh release view v<version> --json url,assets

# R2 (versioned + latest pointers)
curl -sI https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-<version>.mcpb
curl -sI https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb
curl -s https://packages.henrychong.com/yggdrasil-mcp/SHA256SUMS

# Bifrost vanity redirect
curl -sI https://henrychong.com/yggdrasil-latest

# Local integrity check (after downloading)
shasum -a 256 -c yggdrasil-mcp-latest.mcpb.sha256

# The published bundle starts: extract, initialize, tools/list (run from the repo root)
pnpm verify:mcpb path/to/yggdrasil-mcp-<version>.mcpb
```

## Maintainer credentials

The R2 commands in this runbook (Scenario 4 and `scripts/r2-prune.sh`) read three environment variables and nothing else:

| Variable | What it is |
|---|---|
| `R2_ACCESS_KEY_ID` | Access key ID of an R2 S3-compatible key pair with object read, write and delete on the `packages` bucket |
| `R2_SECRET_ACCESS_KEY` | The matching secret access key |
| `CLOUDFLARE_ACCOUNT_ID` | The Cloudflare account that owns the bucket (32 hexadecimal characters) |

Where a maintainer keeps these is not recorded in this repository. Each maintainer has an untracked `.env.release.local` at the repo root (git-ignored by the `*.local` rule; start from the tracked template `.env.release.example`) that maps each variable to a reference into their own secret manager, never to a value. With 1Password, as one example:

```bash
# .env.release.local — untracked; references only
R2_ACCESS_KEY_ID=op://your-vault/your-item/access-key-id
R2_SECRET_ACCESS_KEY=op://your-vault/your-item/secret-access-key
CLOUDFLARE_ACCOUNT_ID=op://your-vault/your-item/account-id
```

Run every command that needs them as:

```bash
op run --env-file=.env.release.local -- <command>
```

`op run` resolves the references in memory for that one process. Nothing resolved is ever written to disk: do not `export` the values, do not paste them into a file, and do not replace the placeholders in `.env.release.example`. Any other secret manager works the same way, as long as it puts the three variables in the command's environment.

`pnpm public:check` (part of `pnpm check`, the pre-commit hook and CI) fails if a real reference, an account identifier or another private detail is written into a tracked file.

CI does not use this file. The `release-mcpb` job reads the same values from the repository's Actions secrets (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`).

## Failure modes — known and how to react

The four distribution channels are **not transactional** — they can land in inconsistent state if a job partially succeeds. The matrix below is the operator's response per scenario.

### Channel matrix

| Channel | Where it lives | What ships | Cache TTL |
|---|---|---|---|
| npm | `npmjs.org/package/yggdrasil-mcp` | Compiled `dist/` + manifest source | Immutable (versioned), `latest` dist-tag mutable |
| GitHub Release | `github.com/henrychong-ai/yggdrasil-mcp/releases/tag/v<version>` | `.mcpb` + `.zip` + `SHA256SUMS` + sidecars | Immutable |
| R2 versioned | `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-<version>.{mcpb,zip}` | `.mcpb`, `.zip` | `max-age=31536000, immutable` |
| R2 `latest` pointer | `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.{mcpb,zip}` | Identical bytes to current versioned | `max-age=300` (5 min) |
| Fusang Cowork plugin | Org Settings → Plugins (auto-install) | The `.zip` artefact | Anthropic-managed |
| Fusang Desktop extension | Org Settings → Connectors → Desktop | The `.mcpb` artefact | Anthropic-managed |

### Scenario 1: `publish` (npm) fails, `release-mcpb` succeeds

**Symptom:** `npm view yggdrasil-mcp` shows previous version; GitHub Release + R2 show new version; Cowork plugin runtime falls back to npm `@latest` (which is now stale).

**Fix:**
```bash
# Re-run only the failed publish job (uses workflow from original tag commit)
gh run rerun <run-id> --failed --repo henrychong-ai/yggdrasil-mcp
```

If the npm publish is broken due to OIDC config drift (Trusted Publisher revoked, etc.), reconfigure on npmjs.org → Trusted Publishers, then re-run.

### Scenario 2: `release-mcpb` fails, `publish` succeeds

**Symptom:** npm has new version; GitHub Release missing or incomplete; R2 `latest` still points at old version.

If the step that failed is "Build .mcpb bundle" with "Bundle check failed", the bundle itself is at fault and a re-run will fail the same way: nothing was uploaded. Reproduce with `pnpm build:mcpb`, fix, and ship the next patch version (see `mcpb/README.md` → "Bundle check").

**Fix:** re-run failed job. Subsequent run is idempotent — R2 PUTs overwrite, GitHub Release assets de-dup by filename, `softprops/action-gh-release` won't duplicate the release.

```bash
gh run rerun <run-id> --failed --repo henrychong-ai/yggdrasil-mcp
```

### Scenario 3: npm dist-tag pointing at a bad version

```bash
# Demote a stable version (without unpublishing — unpublish is permanent on npm)
npm dist-tag rm yggdrasil-mcp latest
npm dist-tag add yggdrasil-mcp@<previous-version> latest

# Verify
npm dist-tags ls yggdrasil-mcp
```

Note: npm requires 2FA / OIDC for dist-tag operations on Trusted-Publisher packages. Run from a 2FA-authenticated `npm login` session on Henry's laptop.

### Scenario 4: R2 `latest` pointer points at a bad version

Needs the AWS CLI and the variables from "Maintainer credentials".

```bash
# Get the previous version's SHA256
export PREV=1.2.1
curl -s "https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-${PREV}.mcpb.sha256"

# Repoint -latest to the previous version: server-side copy versioned → latest.
# The single quotes matter: the variables are expanded by the inner shell, after
# `op run` has put them in its environment.
op run --env-file=.env.release.local -- bash -c '
  AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" AWS_DEFAULT_REGION=auto \
    aws s3 cp "s3://packages/yggdrasil-mcp/yggdrasil-mcp-${PREV}.mcpb" \
              "s3://packages/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb" \
              --endpoint-url "https://${CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com" \
              --content-type application/zip --cache-control "public, max-age=300"
'

# Same for .zip + sidecars; regenerate latest sidecar with correct filename ref
# (see ci-cd.yml release-mcpb job for exact pattern)
```

R2 cache TTL is 5 minutes — propagation is fast.

### Scenario 5: Bad release that needs to be retracted entirely

Sequential steps in this order:

1. **npm:** repoint dist-tag (see Scenario 3). Do NOT `npm unpublish` (permanent within 72h, still leaves a tombstone, breaks consumers who already pulled).
2. **R2 latest:** repoint to previous good version (see Scenario 4).
3. **GitHub Release:** mark as pre-release / draft, or delete:
   ```bash
   gh release edit v<bad-version> --draft
   # or
   gh release delete v<bad-version>
   ```
4. **Tag:** delete locally + remotely (tag protection rule allows admin bypass):
   ```bash
   git tag -d v<bad-version>
   git push origin --delete tag v<bad-version>
   ```
5. **Fusang Cowork:** re-upload the previous `.zip` to `Organization settings → Plugins`; previous plugin overwrites the new one. Provisioning preference (auto-install) stays.
6. **Fusang Desktop:** re-upload the previous `.mcpb` to `Organization settings → Connectors → Desktop`.
7. **Verify all:** run the verification commands at the top of this doc.

### Scenario 6: OIDC publish fails repeatedly (Trusted Publisher config drift)

1. Verify Trusted Publisher config on `https://www.npmjs.com/package/yggdrasil-mcp/access` → Trusted Publishers tab
2. Expected entry: GitHub Actions / `henrychong-ai/yggdrasil-mcp` / `ci-cd.yml` / no environment
3. If misconfigured: delete + re-create with correct fields
4. Re-run failed CI job

**Emergency token fallback** if OIDC must be bypassed (e.g. urgent hotfix at 2am, npm OIDC outage):

1. Switch npm package access (`/access` page) from "Require 2FA and disallow tokens" → "Require 2FA or granular access token with bypass 2fa enabled"
2. Generate a new Classic Automation token at `npmjs.org/settings/<user>/tokens`
3. `gh secret set NPM_TOKEN --repo henrychong-ai/yggdrasil-mcp --body <token>`
4. Revert the OIDC migration in workflow (temporary): re-add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` to `npm publish` step
5. Tag + publish + verify
6. **Restore OIDC** ASAP — revoke the emergency token, re-apply "Require 2FA and disallow tokens", revert the workflow change

## Pre-release workflow (rc / beta / alpha)

Pre-release versions (any semver containing `-`, e.g. `1.2.1-rc.0`) auto-publish under npm dist-tag `next` instead of `latest`. Consumers running `npm install yggdrasil-mcp` keep getting the stable `latest` tag; only opt-in `npm install yggdrasil-mcp@next` gets the pre-release.

Build artefacts:
- `.mcpb` and `.zip` still ship to R2 + GitHub Release with the full version string (`yggdrasil-mcp-1.2.1-rc.0.{mcpb,zip}`)
- The `-latest.{mcpb,zip}` pointers on R2 are STILL updated by every release including pre-releases — be careful: if you tag a pre-release, the public `henrychong.com/yggdrasil-latest` vanity redirect will start pointing at the pre-release until the next stable tag

## R2 retention (manual prune on release)

Per the policy in `CLAUDE.md` → "R2 Retention Policy": after a successful release upload, prune versioned R2 artefacts older than 90 days. Always retain the latest version's artefacts regardless of age. Never touch `latest.*` pointers or `SHA256SUMS` aggregations. The pruned artefacts remain available via GitHub Release (`github.com/henrychong-ai/yggdrasil-mcp/releases/download/vX.Y.Z/...`).

The procedure is `scripts/r2-prune.sh`. Run it AFTER a successful release (the latest pointer has been repointed), from the repo root, on the checkout of the released version. It needs the variables from "Maintainer credentials".

```bash
# 1. Dry run: lists the prefix and prints the prune candidates. Deletes nothing.
op run --env-file=.env.release.local -- scripts/r2-prune.sh

# 2. After reviewing the candidates: delete them.
op run --env-file=.env.release.local -- scripts/r2-prune.sh --apply
```

**Notes:**

- **Last run: 2026-10-02 (v1.2.12 release).** Pruned 1.2.0 to 1.2.5 (24 files); kept 1.2.7, 1.2.10, 1.2.11, 1.2.12, the `latest` pointers, `SHA256SUMS` and `install.html`.
- Always start with the dry run. Inspect the candidate list. Surprises (e.g. a hand-uploaded test artefact) should be investigated, not auto-deleted.
- `--apply` takes a fresh listing and selects from it again; it prints the candidates before it deletes them. It stops at the first delete that does not return HTTP 204, and re-running it is safe: deleting an object that is already gone also returns 204.
- **A candidate is a versioned release file name and nothing else:** `yggdrasil-mcp-<semver>.(mcpb|zip)` and its `.sha256` sidecar, directly under the prefix. Before 2026-10-02 the filter matched everything under the prefix that was not `latest` or `SHA256SUMS`, and the dry run listed `install.html` as a candidate.
- The filter is intentionally conservative: it excludes anything containing `latest` or `SHA256SUMS`, it never selects the version in `package.json` (so the current version's full asset set — `.mcpb`, `.zip`, `.mcpb.sha256`, `.zip.sha256` — is preserved whatever its age), and it only selects objects uploaded before the cutoff, today (UTC) minus 90 days.
- Pre-release artefacts (`-rc.0`, `-beta.1`) WILL be pruned by this filter once they age past 90 days. That is intentional — pre-releases are transient.
- **The script refuses rather than guesses.** It exits non-zero, selecting nothing, when the listing is truncated (more than one page), is not a listing at all (an error document, an empty body, a non-200 response), has an object without a readable upload date, or holds no artefact for the `package.json` version (wrong checkout, or a version bumped but not released yet).
- **Tool choice**: `curl --aws-sigv4` (curl 7.75 or newer) for both the list and the delete calls, through R2's S3-compatible API with the one key pair. No `aws` CLI and no `wrangler` are involved, and no Cloudflare API token: an earlier version of this procedure deleted through `wrangler r2 object delete`, and that step never worked. The `aws s3 cp` calls in Scenario 4 and in `ci-cd.yml`'s `release-mcpb` job are the remaining uses of the AWS CLI.
- The key pair reaches `curl` on standard input, so it is in no argument list and in no file.
- **Testing the selection offline**: `scripts/r2-prune.sh --list-file <saved-listing.xml>` selects from a saved ListObjectsV2 response without credentials or network, and cannot be combined with `--apply`. `__tests__/r2-prune.test.ts` covers the selection and the delete loop this way.

## Sanity checks before tagging

```bash
# 1. main is clean
git status
git checkout main && git pull --ff-only

# 2. version triplet match: package.json, index.ts MCPServer version, CHANGELOG
node -p "require('./package.json').version"
grep "version:" index.ts | head -1
head -5 CHANGELOG.md

# 3. Quality gate
pnpm check && pnpm test

# 4. Local artefact build (optional but recommended for major releases).
#    build:mcpb ends with the bundle check: the packed .mcpb is extracted and the
#    server must answer initialize and tools/list, or the build fails.
pnpm build:dist
ls -lh dist-mcpb/ dist-cowork/

# 5. Tag protection bypass (Henry as admin)
git tag v<version>
git push origin v<version>
```

## Contact / escalation

- **npm registry issues:** support@npmjs.com
- **GitHub Actions issues:** github.com/community
- **Cloudflare R2 issues:** dash.cloudflare.com → Support
- **Anthropic admin issues (Fusang plugin upload):** support@anthropic.com (Teams plan)

## See also

- `mcpb/SLACK_POST.md` — launch announcement templates (Fusang internal + external)
- `CLAUDE.md` — Troubleshooting section covers Cowork upload validator + cache-poisoning rationale
- `.github/workflows/ci-cd.yml` — canonical workflow definition; inline comments explain non-obvious choices
