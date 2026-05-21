# Yggdrasil — Claude Code / Cowork Plugin

This directory is the source for the Yggdrasil **plugin** distribution — a `.zip` artefact that installs into Claude Code (via `--plugin-dir` / marketplace) and Claude Cowork (via Organization settings → Plugins → Upload a file).

Sibling distribution: the `.mcpb` produced from `../mcpb/` for one-click Claude Desktop install.

## Architecture

The plugin invokes Yggdrasil via `npx -y yggdrasil-mcp` — it does **not** bundle the server runtime. This matches Anthropic's [own reference plugins](https://github.com/anthropics/claude-code/tree/main/plugins) and the canonical example in the [plugins reference](https://code.claude.com/docs/en/plugins-reference) MCP servers section.

Trade-offs:

| | npx (current) | Bundled server (rejected) |
|---|---|---|
| ZIP size | ~2.5 KB | ~4.7 MB |
| Auto-updates | Yes (npx pulls latest yggdrasil-mcp from npm) | No (re-upload required for new version) |
| Cowork validator | Accepts | Rejects (npm-style node_modules paths trip the validator) |
| Network at first run | Required (npm registry) | No |
| Reproducibility | Floating (`yggdrasil-mcp@latest`) | Pinned to ZIP contents |
| Anthropic-recommended | Yes (per plugins-reference) | Not used by any official reference plugin |

If reproducibility on a specific version matters, change `cowork-plugin/.mcp.json` to pin: `args: ["-y", "yggdrasil-mcp@1.2.3"]`.

## Contents

| File | Purpose |
|---|---|
| `.claude-plugin/plugin.json` | Anthropic plugin manifest (name, version, author, homepage, etc.) |
| `.mcp.json` | MCP server config — declares the `yggdrasil` server to Claude via `npx -y yggdrasil-mcp` |
| `README.md` | This file |

## Building

From the repo root:

```bash
pnpm build:cowork-plugin
```

Produces `dist-cowork/yggdrasil-mcp-{version}.zip` (~2.5 KB) with SHA256 sidecar.

The build script:
1. Stages `.claude-plugin/plugin.json` + `.mcp.json` + `README.md` into `build/cowork/`
2. Pre-flight check — fails the build if any `+`, `!`, `?`, or `@` characters appear in any staged path (Cowork validator hardening)
3. ZIPs `build/cowork/` → `dist-cowork/yggdrasil-mcp-{version}.zip`
4. Asserts size <45 MB (well under Cowork's 50 MB hard limit; actual is ~2.5 KB)
5. Emits SHA256

## Local install (Claude Code)

```bash
claude --plugin-dir ./build/cowork
```

Then verify tools appear:

```
/help
```

You should see Yggdrasil tools listed under `yggdrasil:` namespace (e.g. `yggdrasil:sequential_thinking`).

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

End users see Yggdrasil tools without any further action — Cowork invokes `npx -y yggdrasil-mcp` on their machine, which fetches from npm on first use and caches thereafter.

## Plans directory

Default: `~/.claude/plans/`. Override via `YGGDRASIL_PLANS_DIR`. Plugin runs the same stdio server as the `.mcpb` distribution — both share the same persistence layer.

## Verifying integrity

```bash
shasum -a 256 ~/Downloads/yggdrasil-mcp-*.zip
# Compare against SHA256SUMS on GitHub Release or
# https://packages.henrychong.com/yggdrasil-mcp/SHA256SUMS
```
