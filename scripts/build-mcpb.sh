#!/usr/bin/env bash
# Build Yggdrasil MCPB (.mcpb) bundle for Claude Desktop distribution.
#
# Output: dist-mcpb/yggdrasil-mcp-{version}.mcpb (+ .sha256 sidecar)
#
# Security:
#   - @anthropic-ai/mcpb is an exact devDependency (defends against package hijack)
#   - --ignore-scripts during prod install (defends against malicious postinstall)
#   - SHA256 emitted for tamper-detection downstream
#
# Layout: production dependencies are installed with pnpm's hoisted node linker,
# which writes a flat node_modules of real directories. `mcpb pack` stores every
# symlink as a copy of its target, so pnpm's default (symlinked) layout came out
# of the archive with each package cut off from its own dependencies, and the
# server exited at start-up with ERR_MODULE_NOT_FOUND. scripts/verify-mcpb.mjs
# extracts the packed bundle and starts it, and this build fails if that fails.
set -euo pipefail

# @anthropic-ai/mcpb is pinned as an exact devDependency in package.json + locked by
# pnpm-lock.yaml. We invoke via `pnpm exec mcpb` to use the lockfile-resolved version
# rather than `npx -y @anthropic-ai/mcpb@<range>` which fetches live at build time and
# allows minor/patch CLI drift to affect artefact reproducibility.
MCPB_CMD="pnpm exec mcpb"

VERSION="$(node -p "require('./package.json').version")"
BUILD_DIR="build/mcpb"
OUT_DIR="dist-mcpb"
OUT="${OUT_DIR}/yggdrasil-mcp-${VERSION}.mcpb"

echo "Building Yggdrasil MCPB v${VERSION}"

rm -rf "${BUILD_DIR}" "${OUT_DIR}"
mkdir -p "${BUILD_DIR}/server" "${OUT_DIR}"

echo "→ Compiling TypeScript"
pnpm build

echo "→ Staging server bundle"
cp -R dist "${BUILD_DIR}/server/dist"
cp package.json "${BUILD_DIR}/server/package.json"
cp pnpm-lock.yaml "${BUILD_DIR}/server/pnpm-lock.yaml"

echo "→ Installing production dependencies"
(
  cd "${BUILD_DIR}/server"
  pnpm install --prod --frozen-lockfile --ignore-scripts \
    --config.node-linker=hoisted --config.confirmModulesPurge=false
)

echo "→ Removing install metadata that records this machine's paths"
# pnpm's state files name the package store directory, and its command shims
# embed absolute paths. The server imports packages and runs none of their
# commands, so neither is needed in the bundle.
rm -f "${BUILD_DIR}/server/node_modules/.modules.yaml" \
  "${BUILD_DIR}/server/node_modules/.pnpm-workspace-state-v1.json"
find "${BUILD_DIR}/server/node_modules" -type d -name .bin -prune -exec rm -rf {} +

echo "→ Copying manifest + icon"
cp mcpb/manifest.json "${BUILD_DIR}/manifest.json"
cp mcpb/icon.png "${BUILD_DIR}/icon.png"

echo "→ Validating source manifest"
${MCPB_CMD} validate "${BUILD_DIR}/manifest.json"

echo "→ Packing .mcpb"
${MCPB_CMD} pack "${BUILD_DIR}" "${OUT}"

echo "→ Inspecting packed .mcpb"
${MCPB_CMD} info "${OUT}"

echo "→ Verifying the packed .mcpb starts from a clean extraction"
if ! node scripts/verify-mcpb.mjs "${OUT}" --forbid-path "${PWD}/${BUILD_DIR}"; then
  rm -f "${OUT}"
  echo "ERROR: ${OUT} failed verification and was removed" >&2
  exit 1
fi

echo "→ Computing SHA256"
( cd "${OUT_DIR}" && shasum -a 256 "$(basename "${OUT}")" | tee "$(basename "${OUT}").sha256" )

echo ""
echo "Built: ${OUT}"
echo "Size:  $(ls -lh "${OUT}" | awk '{print $5}')"
