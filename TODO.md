# Yggdrasil-MCP TODO

## P1 - High Priority

_None currently_

---

## P2 - Medium Priority

_None currently_

---

## P3 - Low Priority

_None yet_

---

## Completed

### Expand Test Coverage to 90%+

**Status**: ✅ Completed
**Created**: 2025-01-30
**Completed**: 2025-01-31

Coverage now at 98%+ (37 tests across lib.ts and coercion.ts). 90% threshold enforced in CI.

---

### Implement Full Ironclad Stack

**Status**: ✅ Completed
**Created**: 2025-01-30
**Completed**: 2025-01-30

Implemented TypeScript ironclad stack with:

**Linting:**

- ✅ ESLint 9.x with flat config (`eslint.config.js`)
- ✅ typescript-eslint 8.x
- ✅ Prettier 3.x
- ✅ eslint-config-prettier
- ✅ eslint-plugin-vitest for test files
- ✅ Scripts: `lint`, `lint:fix`, `format`, `format:check`, `fix`, `typecheck`

**Testing:**

- ✅ Vitest 4.0.18 (upgraded from 2.1.8)
- ✅ @vitest/coverage-v8 4.0.18
- ✅ Fixed esbuild security vulnerability (GHSA-67mh-4wv8-2f99)

**Git Hooks:**

- ✅ Husky 9.x
- ✅ lint-staged 16.x
- ✅ Pre-commit: runs eslint --fix and prettier --write on staged .ts files

**CI Integration:**

- ✅ Lint step added to GitHub Actions
- ✅ Type check step added
- ✅ CI fails on lint errors

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

Created `.github/workflows/ci-cd.yml` with:

- Build and test on all branches (Node 20.x, 22.x, 24.x)
- Publish to npm on v* tags
- NPM_TOKEN authentication (unscoped packages require explicit token)

Also added:

- `.github/dependabot.yml` for weekly dependency updates
- `semver` dev dependency for version comparison
- Fixed build script to clean dist/ before compiling
