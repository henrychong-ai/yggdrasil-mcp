#!/usr/bin/env bash
# Build Yggdrasil MCPB (.mcpb) bundle for Claude Desktop distribution.
#
# Output: dist-mcpb/yggdrasil-mcp-{version}.mcpb (+ .sha256 sidecar)
#
# Security:
#   - @anthropic-ai/mcpb pinned to ^2.1.0 (defends against package hijack)
#   - --ignore-scripts during prod install (defends against malicious postinstall)
#   - SHA256 emitted for tamper-detection downstream
set -euo pipefail

# Pin @anthropic-ai/mcpb; do not allow floating
MCPB_VERSION="^2.1.0"

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
  pnpm install --prod --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false
)

echo "→ Copying manifest + icon"
cp mcpb/manifest.json "${BUILD_DIR}/manifest.json"
cp mcpb/icon.png "${BUILD_DIR}/icon.png"

echo "→ Validating source manifest"
npx -y "@anthropic-ai/mcpb@${MCPB_VERSION}" validate "${BUILD_DIR}/manifest.json"

echo "→ Packing .mcpb"
npx -y "@anthropic-ai/mcpb@${MCPB_VERSION}" pack "${BUILD_DIR}" "${OUT}"

echo "→ Inspecting packed .mcpb"
npx -y "@anthropic-ai/mcpb@${MCPB_VERSION}" info "${OUT}"

echo "→ Computing SHA256"
( cd "${OUT_DIR}" && shasum -a 256 "$(basename "${OUT}")" | tee "$(basename "${OUT}").sha256" )

echo ""
echo "Built: ${OUT}"
echo "Size:  $(ls -lh "${OUT}" | awk '{print $5}')"
