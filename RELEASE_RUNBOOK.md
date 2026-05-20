# Release Runbook

Operational procedures for `yggdrasil-mcp` releases — happy path, failure modes, and rollback per distribution surface.

## Happy path

```bash
# 1. Bump version (package.json + index.ts + CHANGELOG.md per CLAUDE.md Version Policy)
# 2. Quality gate
pnpm check && pnpm test
# 3. Tag + push (admin-only per the v* tag protection ruleset)
git tag v1.2.x && git push origin v1.2.x
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
```

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

```bash
# Get the previous version's SHA256
PREV=1.2.1
curl -s "https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-${PREV}.mcpb.sha256"

# Repoint -latest to the previous version (using R2 token from 1Password)
AKID=$(op --account my.1password.com read 'op://Technology/Cloudflare - HC/packages R2 API Key/w5p4vnlxigx22bzrscj4ohc74a' | tr -d '\n\r')
SECRET=$(op --account my.1password.com read 'op://Technology/Cloudflare - HC/packages R2 API Key/qavrprw6327kzvpulzqzwk5yau' | tr -d '\n\r')
ACCOUNT_ID=32882cce864ab5c754075741115ca269

# Server-side copy versioned → latest
AWS_ACCESS_KEY_ID="$AKID" AWS_SECRET_ACCESS_KEY="$SECRET" AWS_DEFAULT_REGION=auto \
  aws s3 cp "s3://packages/yggdrasil-mcp/yggdrasil-mcp-${PREV}.mcpb" \
            "s3://packages/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb" \
            --endpoint-url "https://${ACCOUNT_ID}.r2.cloudflarestorage.com" \
            --content-type application/zip --cache-control "public, max-age=300"

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

```bash
# Run AFTER a successful release (latest pointer has been repointed).
# Working dir: yggdrasil-mcp repo root.
# Tool choice: curl + AWS SigV4 (curl built-in `--aws-sigv4`, no `aws` CLI required) for
# listing via the S3-compatible API; wrangler for delete. Both satisfy the repo's
# "prefer CF MCP / curl+API / wrangler over AWS CLI" tool-selection rule.
set -euo pipefail

# S3-compatible credentials for the LIST call
AKID=$(op --account my.1password.com read 'op://Technology/Cloudflare - HC/packages R2 API Key/w5p4vnlxigx22bzrscj4ohc74a' | tr -d '\n\r')
SECRET=$(op --account my.1password.com read 'op://Technology/Cloudflare - HC/packages R2 API Key/qavrprw6327kzvpulzqzwk5yau' | tr -d '\n\r')

# CF account-scoped API token for wrangler (R2 Edit scope on `packages` bucket)
# Stopgap: ADMIN_API_KEY works. Follow-up: issue a scoped "packages R2 Edit" token.
export CLOUDFLARE_API_TOKEN=$(op --account my.1password.com read 'op://Technology/Cloudflare - HC/API Tokens/ADMIN_API_KEY' | tr -d '\n\r')

ACCOUNT_ID=32882cce864ab5c754075741115ca269
S3_ENDPOINT="https://${ACCOUNT_ID}.r2.cloudflarestorage.com"
BUCKET=packages
PREFIX=yggdrasil-mcp/

# Anchor values (always-keep)
CURRENT=$(node -p "require('./package.json').version")
CUTOFF_DATE=$(date -v-90d +%Y-%m-%d)   # macOS. Linux: date -d "90 days ago" +%Y-%m-%d

echo "Current latest version (always kept): $CURRENT"
echo "Cutoff date (anything older is a prune candidate): $CUTOFF_DATE"
echo ""

# 1. LIST objects via S3-compatible API + SigV4 (curl, not `aws` CLI)
#    Returns S3 XML; parse with python's stdlib xml.etree.
LIST_XML=$(curl -s --aws-sigv4 "aws:amz:auto:s3" \
  --user "${AKID}:${SECRET}" \
  "${S3_ENDPOINT}/${BUCKET}/?list-type=2&prefix=${PREFIX}")

# 2. DRY RUN — show prune candidates
echo "=== Prune candidates (DRY RUN) ==="
echo "$LIST_XML" | python3 - "$CUTOFF_DATE" "$CURRENT" <<'PY'
import sys, xml.etree.ElementTree as ET
cutoff, current = sys.argv[1], sys.argv[2]
ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
root = ET.fromstring(sys.stdin.read())
for obj in root.findall("s3:Contents", ns):
    key = obj.findtext("s3:Key", default="", namespaces=ns)
    last_modified = obj.findtext("s3:LastModified", default="", namespaces=ns)[:10]  # YYYY-MM-DD
    name = key.rsplit("/", 1)[-1]
    if "latest" in name or "SHA256SUMS" in name:
        continue
    if f"-{current}." in name:
        continue
    if last_modified >= cutoff:
        continue
    print(f"  PRUNE: {key}  (uploaded {last_modified})")
PY

# 3. After reviewing the list, execute the deletes. Uncomment to run:
# echo "$LIST_XML" | python3 - "$CUTOFF_DATE" "$CURRENT" <<'PY' | while IFS= read -r key; do
# import sys, xml.etree.ElementTree as ET
# cutoff, current = sys.argv[1], sys.argv[2]
# ns = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}
# root = ET.fromstring(sys.stdin.read())
# for obj in root.findall("s3:Contents", ns):
#     key = obj.findtext("s3:Key", default="", namespaces=ns)
#     last_modified = obj.findtext("s3:LastModified", default="", namespaces=ns)[:10]
#     name = key.rsplit("/", 1)[-1]
#     if "latest" in name or "SHA256SUMS" in name: continue
#     if f"-{current}." in name: continue
#     if last_modified >= cutoff: continue
#     print(key)
# PY
#   [ -n "$key" ] || continue
#   pnpm exec wrangler r2 object delete "${BUCKET}/${key}" --remote
# done
```

**Notes:**

- Always start with the DRY RUN. Inspect the candidate list. Surprises (e.g. a hand-uploaded test artefact) should be investigated, not auto-deleted.
- The filter is intentionally conservative: it excludes anything containing `latest` or `SHA256SUMS`, and anchors on `-<CURRENT>.` so the current version's full asset set (`.mcpb`, `.zip`, `.mcpb.sha256`, `.zip.sha256`) is preserved.
- Pre-release artefacts (`-rc.0`, `-beta.1`) WILL be pruned by this filter once they age past 90 days. That is intentional — pre-releases are transient.
- **Tool choice**: `curl --aws-sigv4` for the LIST call (S3-style auth via curl built-in, no `aws` CLI installed). `wrangler r2 object delete --remote` for the DELETE calls. Both satisfy the repo's "no AWS CLI for R2" rule. The remaining `aws s3 cp` calls in Scenario 4 and `ci-cd.yml`'s `release-mcpb` job are tracked for a coupled cleanup PR (see CI-automation plan for the prune step).
- **`CLOUDFLARE_API_TOKEN` scope**: stopgap uses `ADMIN_API_KEY` (broad). Follow-up: issue a scoped "packages R2 Edit" CF API token, reference path TBD in path-registry.

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

# 4. Local artefact smoke test (optional but recommended for major releases)
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
