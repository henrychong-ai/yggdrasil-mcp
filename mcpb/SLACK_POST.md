# Slack post templates — Yggdrasil v1.2.0 launch

Two audiences, two scripts. Use one or the other depending on whether the channel is Fusang-internal or external/public.

---

## A. Fusang internal — Slack #general (or relevant channel)

**Pre-conditions:** Henry has uploaded `yggdrasil-mcp-1.2.0.mcpb` via `Organization settings → Connectors → Desktop` AND `yggdrasil-mcp-1.2.0.zip` via `Organization settings → Plugins → Upload a file` in the Fusang Teams workspace. Provisioning preference set to **Auto-install**.

```
🌳 New: Yggdrasil reasoning tools — auto-installed across our Claude workspace

You don't have to do anything — it's already there.

Where to find it:
• Claude Desktop → Extensions menu → "Yggdrasil — Reasoning Orchestration"
• Claude Cowork → Plugins → "yggdrasil-mcp"

What it does:
• `sequential_thinking` — step-by-step reasoning with revision and branching
• `deep_planning` — multi-phase planning sessions (init → clarify → explore → evaluate → finalize)
• Plan management — list / get / promote / archive

Try it: ask Claude
> use sequential_thinking with 5 thoughts to analyse [your problem]

Or kick off a structured plan:
> start a deep_planning session for [your initiative]

Particularly useful for: architecture decisions, debugging deep problems, deal structuring,
trade-off analysis, anything you'd reach for a whiteboard or "let me think about this" delay.

Open-source MIT → https://github.com/henrychong-ai/yggdrasil-mcp
Bugs / feedback → DM Henry or open issue in repo
```

### Posting checklist (Fusang)
- [ ] `.mcpb` uploaded to `Organization settings → Connectors → Desktop` in Fusang Teams workspace
- [ ] `.zip` uploaded to `Organization settings → Plugins` with **Auto-install** provisioning
- [ ] Spot-check on a second team member's machine — Extension + Plugin both appear without manual action
- [ ] Slack post scheduled or sent

---

## B. External / community — public Slack / Discord / X / personal LinkedIn

**Pre-conditions:** GitHub Release for v1.2.0 published; `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb` returns 200; `SHA256SUMS` reachable.

```
🌳 New: Yggdrasil reasoning tools for Claude Desktop

Yggdrasil is a one-click Claude Desktop extension giving Claude structured reasoning
superpowers — step-by-step problem-solving, multi-phase planning, and plan management.

Install (3 steps):
1. Download: https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb
2. Double-click the file → Claude Desktop opens install dialog → click "Install"
3. Restart Claude Desktop

Try it: ask Claude
> use sequential_thinking with 5 thoughts to analyse [your problem]

Requires Claude Desktop 1.8000+. Open-source MIT.

For Claude Code / Cowork users — there's also a plugin .zip at:
https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.zip
Install via `claude --plugin-dir yggdrasil-mcp-latest.zip` or upload to your Cowork org.

Verify integrity (optional):
shasum -a 256 ~/Downloads/yggdrasil-mcp-*.{mcpb,zip}
Compare against → https://packages.henrychong.com/yggdrasil-mcp/SHA256SUMS

Source / bugs → https://github.com/henrychong-ai/yggdrasil-mcp/issues
```

### Posting checklist (external)
- [ ] `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb` returns 200
- [ ] `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.zip` returns 200
- [ ] `packages.henrychong.com/yggdrasil-mcp/SHA256SUMS` returns 200
- [ ] GitHub Release published with both artefacts
- [ ] Vanity redirect `henrychong.com/yggdrasil-latest` → 302 to `.mcpb` works
