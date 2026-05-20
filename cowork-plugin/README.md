# Yggdrasil — Claude Code / Cowork Plugin

This directory is the source for the Yggdrasil **plugin** distribution — a `.zip` artefact that installs into Claude Code (via `--plugin-dir` / marketplace) and Claude Cowork (via Organization settings → Plugins → Upload a file).

Sibling distribution: the `.mcpb` produced from `../mcpb/` for one-click Claude Desktop install.

## Contents

| File | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Anthropic plugin manifest (name, version, author, homepage, etc.) |
| `.mcp.json` | MCP server config — declares the stdio `yggdrasil` server to Claude |
| `README.md` | This file |
| `server/` *(populated at build time)* | Compiled `dist/` + production `node_modules` + `package.json` |

## Building

From the repo root:

```bash
pnpm build:cowork-plugin
```

Produces `dist-cowork/yggdrasil-mcp-{version}.zip` with SHA256 sidecar.

The build script:
1. Runs `pnpm build` (compile TS to `dist/`)
2. Stages this directory into `build/cowork/`
3. Copies `dist/` + `package.json` + `pnpm-lock.yaml` into `build/cowork/server/`
4. **Installs prod deps with `--config.node-linker=hoisted`** — produces a flat npm-style `node_modules/`. This is **mandatory**: Cowork's plugin upload validator rejects `+` in paths, and pnpm's default `.pnpm/<pkg>+<peer>@<ver>/` content store contains exactly that.
5. Scrubs pnpm metadata that could still leak (`.pnpm/`, `.modules.yaml`, `.pnpm-workspace-state-v1.json`, `.bin/`)
6. Pre-flight check — fails the build if any `+`, `!`, or `?` characters appear in the staged tree
7. ZIPs `build/cowork/` → `dist-cowork/yggdrasil-mcp-{version}.zip`
8. Asserts size <45 MB (10% safety margin below the Cowork 50 MB hard limit)
9. Emits SHA256 alongside

Resulting bundle is ~4.7 MB. Bundles the same dependencies as the `.mcpb` (~12 MB) but the hoisted layout de-duplicates pnpm's per-peer-set copies.

## Local install (Claude Code)

```bash
claude --plugin-dir ./build/cowork
```

Then verify tools appear:

```
/help
```

You should see Yggdrasil tools listed under `yggdrasil:` namespace.

To pick up changes during development:

```
/reload-plugins
```

## Installing in Cowork (organisation distribution)

Org admin (Owner / Primary Owner) workflow:

1. Open Claude Desktop signed in to the target Teams / Enterprise workspace
2. `Organization settings → Plugins → Add plugins → Upload a file`
3. Drag `yggdrasil-mcp-{version}.zip` from the GitHub Release (or local `dist-cowork/`)
4. Choose provisioning: **Auto-install** distributes to all members immediately

End users see Yggdrasil tools without any further action.

## Plans directory

Default: `~/.claude/plans/`. Override via `YGGDRASIL_PLANS_DIR`. Plugin runs the same stdio server as the `.mcpb` distribution — both share the same persistence layer.

## Verifying integrity

```bash
shasum -a 256 ~/Downloads/yggdrasil-mcp-*.zip
# Compare against SHA256SUMS on GitHub Release or
# https://packages.henrychong.com/yggdrasil-mcp/SHA256SUMS
```
