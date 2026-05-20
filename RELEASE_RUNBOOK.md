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
PREV=1.2.0
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
