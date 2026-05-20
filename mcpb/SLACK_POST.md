# Slack post template — Yggdrasil .mcpb launch

> Post in the Fusang #general (or appropriate team) channel after the first GitHub Release with `.mcpb` artefact lands and `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb` returns a 200.

---

🌳 *New: Yggdrasil reasoning tools for Claude Desktop*

Yggdrasil is a one-click Claude Desktop extension that gives Claude structured reasoning superpowers — step-by-step problem-solving, multi-phase planning, and plan management. Particularly useful for analytical work, debugging deep problems, and architecture decisions.

*Install (3 steps):*
1. Download → https://packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb
2. Double-click the file → Claude Desktop opens install dialog → click *Install*
3. Restart Claude Desktop

*Try it:* ask Claude
> use sequential_thinking with 5 thoughts to analyse [your problem]

*Requires:* Claude Desktop 1.8000 or later (please update if install fails).

*Verify download integrity (optional):*
```
shasum -a 256 ~/Downloads/yggdrasil-mcp-latest.mcpb
```
Compare against → https://packages.henrychong.com/yggdrasil-mcp/SHA256SUMS

*Open-source MIT* → https://github.com/henrychong-ai/yggdrasil-mcp
- Reads/writes `~/.claude/plans/` for plan persistence
- Makes no network calls

*Bugs / feedback* → https://github.com/henrychong-ai/yggdrasil-mcp/issues

---

## Posting checklist

- [ ] Verify `packages.henrychong.com/yggdrasil-mcp/yggdrasil-mcp-latest.mcpb` returns 200 OK
- [ ] Verify `packages.henrychong.com/yggdrasil-mcp/SHA256SUMS` returns 200 OK
- [ ] Confirm SHA256SUMS contains the expected hash for v1.2.0
- [ ] Smoke-tested locally on Henry's Mac (sequential_thinking + deep_planning both work)
- [ ] Slack post scheduled or sent in the right channel
