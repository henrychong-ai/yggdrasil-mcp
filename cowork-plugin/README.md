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
3. Copies `dist/` + production `node_modules` + `package.json` into `build/cowork/server/`
4. ZIPs `build/cowork/` → `dist-cowork/yggdrasil-mcp-{version}.zip`
5. Asserts size <45 MB (Cowork limit is 50 MB)
6. Emits SHA256 alongside

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
