#!/usr/bin/env bash
# Build Yggdrasil as a Claude Code / Cowork plugin (.zip).
#
# Architecture: the plugin invokes `npx -y yggdrasil-mcp` at runtime — it does NOT bundle
# the server. This matches Anthropic's own reference plugins (anthropics/claude-code/plugins/*)
# and avoids tripping Cowork's plugin upload path validator which is stricter than the
# published spec suggests (rejects bundled node_modules trees with @-scoped paths even
# after pnpm's content store is flattened with --node-linker=hoisted).
#
# Output: dist-cowork/yggdrasil-mcp-{version}.zip + .sha256 sidecar
# Expected size: <10 KB (just .claude-plugin/plugin.json + .mcp.json + README.md)
#
# Spec reference: https://code.claude.com/docs/en/plugins-reference
# Cowork upload: Org settings → Plugins → Add plugins → Upload a file (max 50 MB)
set -euo pipefail

VERSION="$(node -p "require('./package.json').version")"
BUILD_DIR="build/cowork"
OUT_DIR="dist-cowork"
OUT="${OUT_DIR}/yggdrasil-mcp-${VERSION}.zip"
SIZE_LIMIT_MB=45

echo "Building Yggdrasil Cowork/Code plugin v${VERSION}"

rm -rf "${BUILD_DIR}" "${OUT_DIR}"
mkdir -p "${BUILD_DIR}/.claude-plugin" "${OUT_DIR}"

echo "→ Staging plugin manifest + MCP config + README"
cp cowork-plugin/.claude-plugin/plugin.json "${BUILD_DIR}/.claude-plugin/plugin.json"
cp cowork-plugin/README.md "${BUILD_DIR}/README.md"

# Pin .mcp.json's `npx -y yggdrasil-mcp` to the exact version of this build.
# The committed source cowork-plugin/.mcp.json uses the unpinned package name so
# local dev (`claude --plugin-dir cowork-plugin/`) picks up whatever's on npm.
# Built artefacts must pin to avoid version drift between plugin metadata and runtime:
# without this, a v1.2.1-rc.0 plugin would still execute the npm `latest` (stable) tag.
node -e "
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync('cowork-plugin/.mcp.json', 'utf8'));
const args = cfg.mcpServers.yggdrasil.args;
const idx = args.indexOf('yggdrasil-mcp');
if (idx === -1) { console.error('ERROR: yggdrasil-mcp not found in .mcp.json args'); process.exit(1); }
args[idx] = 'yggdrasil-mcp@${VERSION}';
fs.writeFileSync('${BUILD_DIR}/.mcp.json', JSON.stringify(cfg, null, 2) + '\n');
console.log('  pinned to yggdrasil-mcp@${VERSION}');
"

echo "→ Verifying no invalid characters in any staged path"
INVALID=$(find "${BUILD_DIR}" \( -name '*+*' -o -name '*\!*' -o -name '*\?*' -o -name '*@*' \) 2>/dev/null | head -5)
if [ -n "$INVALID" ]; then
  echo "ERROR: found paths with characters Cowork may reject:" >&2
  echo "$INVALID" >&2
  exit 1
fi

echo "→ Creating ZIP"
(
  cd "${BUILD_DIR}"
  zip -qr "../../${OUT}" \
    .claude-plugin \
    .mcp.json \
    README.md
)

echo "→ Verifying size (limit ${SIZE_LIMIT_MB} MB)"
SIZE_BYTES=$(/usr/bin/stat -f%z "${OUT}" 2>/dev/null || /usr/bin/stat -c%s "${OUT}")
SIZE_MB=$((SIZE_BYTES / 1024 / 1024))
if [ "${SIZE_MB}" -gt "${SIZE_LIMIT_MB}" ]; then
  echo "ERROR: Plugin ZIP is ${SIZE_MB} MB, exceeds ${SIZE_LIMIT_MB} MB safety limit" >&2
  exit 1
fi

echo "→ Computing SHA256"
( cd "${OUT_DIR}" && shasum -a 256 "$(basename "${OUT}")" | tee "$(basename "${OUT}").sha256" )

echo ""
echo "Built: ${OUT}"
echo "Size:  $(ls -lh "${OUT}" | awk '{print $5}')"
echo "Install locally: claude --plugin-dir ./${BUILD_DIR}"
echo ""
echo "Runtime: plugin invokes 'npx -y yggdrasil-mcp' — requires npm/npx on user PATH."
echo "         Claude Desktop bundles Node which includes npm; Cowork inherits this."
