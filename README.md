# Yggdrasil MCP

[![npm version](https://img.shields.io/npm/v/yggdrasil-mcp.svg)](https://www.npmjs.com/package/yggdrasil-mcp)
[![CI](https://github.com/henrychong-ai/yggdrasil-mcp/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/henrychong-ai/yggdrasil-mcp/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Reasoning orchestration MCP server** — Tree of Thoughts with multi-agent evaluation.

A fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an ambitious roadmap for advanced reasoning capabilities.

## Why Yggdrasil?

In Norse mythology, Yggdrasil is the World Tree connecting all realms. This MCP embodies that metaphor:

- **Branches** = Different reasoning paths through possibility space
- **Roots** = Deep foundational analysis (first principles)
- **Connections** = Links between thoughts, revisions, and evaluations

## Key Features

### Current (v0.9.3)

- **deep_planning tool** — Structured multi-phase planning sessions (init → clarify → explore → evaluate → finalize)
- **Session resumption** — Resume planning sessions by ID with JSONL persistence
- **Hybrid persistence** — JSONL event log + Markdown plan export for deep_planning
- **String coercion fix** — Fixes Claude Code bug #3084 where MCP parameters are incorrectly serialized as strings
- **Oxlint + Biome** — 50-100x faster linting, zero-config formatting
- Break down complex problems into manageable steps
- Revise and refine thoughts as understanding deepens
- Branch into alternative paths of reasoning
- Adjust the total number of thoughts dynamically
- Generate and verify solution hypotheses

### Roadmap

See the [CLAUDE.md](CLAUDE.md) version history for details. The 5-phase roadmap includes:

- Thought history retrieval and persistence (JSONL)
- Mermaid diagram export
- Branch evaluation with multi-agent support
- Codex/GPT-5.2 cross-model verification
- n8n workflow integration

## Installation

### Claude Code

```bash
claude mcp add --scope user yggdrasil "npx -y yggdrasil-mcp"
```

Or add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "yggdrasil": {
      "command": "npx",
      "args": ["-y", "yggdrasil-mcp"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "yggdrasil": {
      "command": "npx",
      "args": ["-y", "yggdrasil-mcp"]
    }
  }
}
```

### Local Development

```json
{
  "mcpServers": {
    "yggdrasil": {
      "command": "node",
      "args": ["/path/to/yggdrasil-mcp/dist/index.js"]
    }
  }
}
```

## Tool: sequential_thinking

Facilitates a detailed, step-by-step thinking process for problem-solving and analysis.

### Parameters

#### Required

| Parameter           | Type    | Description                            |
| ------------------- | ------- | -------------------------------------- |
| `thought`           | string  | The current thinking step              |
| `nextThoughtNeeded` | boolean | Whether another thought step is needed |
| `thoughtNumber`     | integer | Current thought number (≥1)            |
| `totalThoughts`     | integer | Estimated total thoughts needed (≥1)   |

#### Optional

| Parameter           | Type    | Description                            |
| ------------------- | ------- | -------------------------------------- |
| `isRevision`        | boolean | Whether this revises previous thinking |
| `revisesThought`    | integer | Which thought is being reconsidered    |
| `branchFromThought` | integer | Branching point thought number         |
| `branchId`          | string  | Branch identifier                      |
| `needsMoreThoughts` | boolean | If more thoughts are needed            |

### Output

```json
{
  "thoughtNumber": 3,
  "totalThoughts": 5,
  "nextThoughtNeeded": true,
  "branches": ["branch-a"],
  "thoughtHistoryLength": 3
}
```

## Tool: deep_planning

Structured planning tool that manages multi-phase planning sessions. Complements `sequential_thinking` by tracking state while the LLM reasons deeply between phases.

### Workflow

```
init → clarify* → explore+ → evaluate+ → finalize → done
```

### Parameters

| Parameter         | Type   | Phases           | Description                                          |
| ----------------- | ------ | ---------------- | ---------------------------------------------------- |
| `phase`           | enum   | All              | `init`, `clarify`, `explore`, `evaluate`, `finalize` |
| `problem`         | string | init             | Problem statement                                    |
| `context`         | string | init             | Additional background                                |
| `constraints`     | string | init             | JSON array of constraint strings                     |
| `question`        | string | clarify          | Clarifying question                                  |
| `answer`          | string | clarify          | Answer to the question                               |
| `branchId`        | string | explore/evaluate | Unique approach identifier                           |
| `name`            | string | explore          | Short approach name                                  |
| `description`     | string | explore          | Detailed approach description                        |
| `pros`/`cons`     | string | explore          | JSON arrays of strings                               |
| `feasibility`     | number | evaluate         | Score 0-10                                           |
| `completeness`    | number | evaluate         | Score 0-10                                           |
| `coherence`       | number | evaluate         | Score 0-10                                           |
| `risk`            | number | evaluate         | Score 0-10 (lower is better)                         |
| `rationale`       | string | evaluate         | Reasoning for scores                                 |
| `recommendation`  | string | evaluate         | `pursue`, `refine`, or `abandon`                     |
| `selectedBranch`  | string | finalize         | Branch ID of chosen approach                         |
| `steps`           | string | finalize         | JSON array of step objects                           |
| `risks`           | string | finalize         | JSON array of risk objects                           |
| `assumptions`     | string | finalize         | JSON array of strings                                |
| `successCriteria` | string | finalize         | JSON array of strings                                |
| `format`          | string | finalize         | `markdown` (default) or `json`                       |

### Output

```json
{
  "sessionId": "dp-abc123",
  "phase": "explore",
  "status": "ok",
  "approachCount": 2,
  "evaluationCount": 0,
  "validNextPhases": ["explore", "evaluate", "clarify"],
  "message": "Approach recorded..."
}
```

## Use Cases

Yggdrasil is designed for:

- **Complex problem decomposition** — Break down multi-step problems
- **Iterative planning** — Design with room for revision
- **Course correction** — Analysis that adapts as understanding deepens
- **Scope discovery** — Problems where the full scope isn't clear initially
- **Context maintenance** — Tasks requiring state across multiple steps
- **Information filtering** — Situations where irrelevant details need filtering

## Configuration

### Environment Variables

| Variable                  | Default | Description                    |
| ------------------------- | ------- | ------------------------------ |
| `DISABLE_THOUGHT_LOGGING` | `false` | Suppress stderr thought output |

## The String Coercion Fix

This fork addresses a critical bug in Claude Code (#3084) where MCP parameters are serialized as strings regardless of their schema type.

### The Problem

```typescript
// Claude Code sends:
{ nextThoughtNeeded: "true", thoughtNumber: "5" }

// Instead of:
{ nextThoughtNeeded: true, thoughtNumber: 5 }
```

Using `z.coerce.boolean()` is **dangerous**:

```typescript
z.coerce.boolean().parse('false'); // Returns TRUE! (non-empty string = truthy)
```

### Our Solution

```typescript
// Safe coercion that correctly handles "false" → false
const coerceBoolean = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  throw new Error(`Cannot coerce "${val}" to boolean`);
};

// Applied via z.preprocess (NOT z.coerce)
const booleanSchema = z.preprocess(coerceBoolean, z.boolean());
```

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Format
pnpm format

# Full quality check
pnpm check

# Watch mode
pnpm watch
```

### Requirements

- Node.js >=24
- pnpm (corepack-managed via `packageManager` field)

## Upstream

This is a fork of [@modelcontextprotocol/server-sequential-thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking).

We periodically sync relevant changes from upstream while maintaining our string coercion fix and additional features.

## Changelog

### v0.9.3 (2026-02-19)

- **Public release** — Repository made public on GitHub
- CI/CD aligned with skill specs: action upgrades, concurrency, timeouts, permissions
- Biome VCS integration, lint-staged fixes

### v0.9.2 (2026-02-13)

- **Migrate lint stack** from ESLint+Prettier to Oxlint+Biome (50-100x faster)

### v0.9.1 (2026-02-11)

- **Session resumption** for `deep_planning` — switch between multiple planning sessions by ID

### v0.9.0 (2026-02-07)

- **Hybrid persistence** — JSONL event log + Markdown export for `deep_planning`
- `list_plans` and `get_plan` MCP tools for plan retrieval
- 147 tests, 97%+ coverage

### v0.8.0–v0.8.2 (2026-02-06)

- **New tool: `deep_planning`** — Structured multi-phase planning sessions
- Step field normalization, session restart fixes
- 108 tests, 97%+ coverage

### v0.7.0–v0.7.5 (2026-01-31 – 2026-02-06)

- Tool rename to `sequential_thinking`, full lint compliance, 90%+ coverage enforcement
- CI/CD pipeline, LICENSE, community files, security fixes

### v0.6.3 (2026-01-30)

- **Initial fork release** — Critical fix for Claude Code string coercion bug #3084

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Please ensure:

1. All tests pass (`pnpm test`)
2. Linting passes (`pnpm lint`)
3. Code is formatted (`pnpm format`)
4. Version is incremented appropriately
