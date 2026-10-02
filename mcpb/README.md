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
2. Stages `dist/` + production `node_modules` + manifest + icon into `build/mcpb/`. The dependencies are installed with pnpm's hoisted node linker: a flat `node_modules` of real directories, with pnpm's state files and command shims removed
3. Validates the manifest via `@anthropic-ai/mcpb validate`
4. Packs `build/mcpb/` into `dist-mcpb/yggdrasil-mcp-{version}.mcpb` via `@anthropic-ai/mcpb pack`
5. Checks the packed file with `scripts/verify-mcpb.mjs` (below); a bundle that fails is deleted and the build stops
6. Computes SHA256 alongside the `.mcpb`

`@anthropic-ai/mcpb` is an **exact** devDependency, locked by `pnpm-lock.yaml` — do not allow it to float (defends against package hijack).

### Why the hoisted linker

`mcpb pack` stores every symlink as a copy of its target. pnpm's default layout is built from symlinks, so a bundle packed from it had each package copied to the top of `node_modules` without its own dependencies beside it, and the server exited at start-up with `ERR_MODULE_NOT_FOUND`. All ten published bundles, v1.2.0 to v1.2.12, have that fault. The hoisted layout has no symlinks to lose, and it holds one copy of each package, so the bundle is about 4 MB where it was 13 to 15 MB.

### Bundle check

```bash
pnpm verify:mcpb                              # the bundle just built, in dist-mcpb/
pnpm verify:mcpb path/to/yggdrasil-mcp.mcpb   # any bundle, e.g. a downloaded release
```

The check extracts the archive with `unzip` into a new temporary directory that has no `node_modules` above it, then:

- rejects an environment or `*.local` file, pnpm install state, a command shim, an installed devDependency and a missing production dependency;
- starts the server as the manifest's `mcp_config` says, with no `NODE_PATH` and an empty home directory, and completes an MCP `initialize` and `tools/list` over stdio. The reported version must equal the manifest version and every tool in the manifest must be served.

It proves that the extracted files run under Node on the build machine. It does not install the bundle into Claude Desktop.

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
