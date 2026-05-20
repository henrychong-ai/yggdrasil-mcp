#!/usr/bin/env bash
# Build Yggdrasil as a Claude Code / Cowork plugin (.zip).
#
# Output: dist-cowork/yggdrasil-mcp-{version}.zip + .sha256 sidecar
#
# Spec reference: https://code.claude.com/docs/en/plugins-reference
# Cowork upload: Org settings → Plugins → Add plugins → Upload a file (max 50 MB)
#
# Security: --ignore-scripts during prod install (defends against malicious postinstall)
set -euo pipefail

VERSION="$(node -p "require('./package.json').version")"
BUILD_DIR="build/cowork"
OUT_DIR="dist-cowork"
OUT="${OUT_DIR}/yggdrasil-mcp-${VERSION}.zip"
SIZE_LIMIT_MB=45  # Cowork hard limit is 50 MB; we cap at 45 for safety margin

echo "Building Yggdrasil Cowork/Code plugin v${VERSION}"

rm -rf "${BUILD_DIR}" "${OUT_DIR}"
mkdir -p "${BUILD_DIR}/.claude-plugin" "${BUILD_DIR}/server" "${OUT_DIR}"

echo "→ Compiling TypeScript"
pnpm build

echo "→ Staging plugin manifest + MCP config + README"
cp cowork-plugin/.claude-plugin/plugin.json "${BUILD_DIR}/.claude-plugin/plugin.json"
cp cowork-plugin/.mcp.json "${BUILD_DIR}/.mcp.json"
cp cowork-plugin/README.md "${BUILD_DIR}/README.md"

echo "→ Staging server bundle"
cp -R dist "${BUILD_DIR}/server/dist"
cp package.json "${BUILD_DIR}/server/package.json"
cp pnpm-lock.yaml "${BUILD_DIR}/server/pnpm-lock.yaml"

echo "→ Installing production dependencies"
(
  cd "${BUILD_DIR}/server"
  pnpm install --prod --frozen-lockfile --ignore-scripts --config.confirmModulesPurge=false
)

echo "→ Creating ZIP"
(
  cd "${BUILD_DIR}"
  # Top-level files at archive root (per Anthropic plugin spec; not a wrapper directory)
  zip -qr "../../${OUT}" \
    .claude-plugin \
    .mcp.json \
    README.md \
    server
)

echo "→ Verifying size (limit ${SIZE_LIMIT_MB} MB)"
SIZE_BYTES=$(/usr/bin/stat -f%z "${OUT}" 2>/dev/null || /usr/bin/stat -c%s "${OUT}")
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
if [ "${SIZE_MB}" -gt "${SIZE_LIMIT_MB}" ]; then
  echo "ERROR: Plugin ZIP is ${SIZE_MB} MB, exceeds ${SIZE_LIMIT_MB} MB safety limit (Cowork hard limit 50 MB)" >&2
  exit 1
fi

echo "→ Computing SHA256"
( cd "${OUT_DIR}" && shasum -a 256 "$(basename "${OUT}")" | tee "$(basename "${OUT}").sha256" )

echo ""
echo "Built: ${OUT}"
echo "Size:  ${SIZE_MB} MB ($(ls -lh "${OUT}" | awk '{print $5}'))"
echo "Install locally: claude --plugin-dir ./${BUILD_DIR}"
