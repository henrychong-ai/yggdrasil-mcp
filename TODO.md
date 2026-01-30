# Yggdrasil-MCP TODO

## P1 - High Priority

### Implement Full Ironclad Stack (Lint, Test, Coverage)
**Status**: Pending
**Created**: 2025-01-30

Implement comprehensive code quality infrastructure matching mcp-neo4j-knowledge-graph standards.

**Linting:**
- [ ] ESLint with typescript-eslint
- [ ] Prettier for formatting
- [ ] eslint-config-prettier to avoid conflicts
- [ ] Add `lint`, `lint:fix`, `format`, `fix` scripts

**Testing:**
- [ ] Expand vitest test coverage
- [ ] Add unit tests for string coercion logic
- [ ] Add integration tests for MCP tool registration
- [ ] Target: 80%+ coverage

**Git Hooks:**
- [ ] Husky for git hooks
- [ ] lint-staged for pre-commit checks
- [ ] Run lint + format on staged files

**CI Integration:**
- [ ] Add lint step to GitHub Actions workflow
- [ ] Fail CI on lint errors
- [ ] Add coverage reporting

**Reference:** See `mcp-neo4j-knowledge-graph` repo for implementation patterns.

---

### Configure NPM_TOKEN GitHub Secret
**Status**: Pending
**Created**: 2025-01-30

Add NPM_TOKEN secret to enable automated publishing via GitHub Actions.

**Steps:**

1. **Get npm token from 1Password:**
   ```bash
   op read "[REDACTED]" [REDACTED]
   ```

2. **Add secret to GitHub repo:**
   - Go to: https://github.com/henrychong-ai/yggdrasil-mcp/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: (paste token from step 1)
   - Click "Add secret"

3. **Test by pushing a version bump to main:**
   - Update version in package.json (e.g., 0.6.3 → 0.6.4)
   - Push to main
   - Check Actions tab for successful publish

---

## P2 - Medium Priority

*None yet*

---

## P3 - Low Priority

*None yet*

---

## Completed

### Initial npm Publish
**Status**: ✅ Completed
**Created**: 2025-01-30
**Completed**: 2025-01-30

Published `yggdrasil-mcp@0.6.3` to npm registry.
- Package: https://www.npmjs.com/package/yggdrasil-mcp
- Install: `npx -y yggdrasil-mcp`

### GitHub Action for npm Publishing
**Status**: ✅ Completed
**Created**: 2025-01-30
**Completed**: 2025-01-30

Created `.github/workflows/ci-publish.yml` with:
- Build and test on all branches (Node 20.x, 22.x)
- Auto-publish to npm on main branch push
- Version comparison (only publishes if version > published)
- npm OIDC provenance attestation (`--provenance` flag)
- NPM_TOKEN secret for authentication

Also added:
- `.github/dependabot.yml` for weekly dependency updates
- `semver` dev dependency for version comparison
- Fixed build script to clean dist/ before compiling
