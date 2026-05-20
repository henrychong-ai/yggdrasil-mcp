# Yggdrasil MCPB — Claude Desktop Extension

This directory contains the [MCPB](https://github.com/anthropics/mcpb) (MCP Bundle) packaging assets for Yggdrasil. Building this directory produces a `.mcpb` file that installs into Claude Desktop in one click.

## Contents

| File | Purpose |
|---|---|
| `manifest.json` | MCPB manifest declaring server entry point, tools, and runtime |
| `icon.png` | 256×256 icon shown in Claude Desktop's extensions list |
| `README.md` | This file |

## Building

From the repo root:

```bash
pnpm build:mcpb
```

The build script (`scripts/build-mcpb.sh`):

1. Builds the TypeScript sources (`pnpm build`)
2. Stages `dist/` + production `node_modules` + manifest + icon into `build/mcpb/`
3. Packs `build/mcpb/` into `dist-mcpb/yggdrasil-mcp-{version}.mcpb` via `@anthropic-ai/mcpb pack`
4. Validates via `@anthropic-ai/mcpb validate`
5. Computes SHA256 alongside the `.mcpb`

`@anthropic-ai/mcpb` is **pinned** to `^2.1.0` in the build script — do not allow it to float (defends against package hijack).

## Installation (end users)

1. Download the latest `.mcpb` from [Releases](https://github.com/henrychong-ai/yggdrasil-mcp/releases)
2. Double-click the file — Claude Desktop opens the install dialog
3. Click **Install** → restart Claude Desktop

Requires Claude Desktop 1.8000 or later (bundles Node.js 24+).

## Plans directory

By default, Yggdrasil persists planning sessions to `~/.claude/plans/`. Override by setting the `YGGDRASIL_PLANS_DIR` env var.

## Verifying integrity

After downloading, optionally compare the SHA256:

```bash
shasum -a 256 ~/Downloads/yggdrasil-mcp-*.mcpb
# Compare against the SHA256SUMS file on the GitHub Release page
```
