# Yggdrasil MCP

<p align="center">
  <img src="https://assets.henrychong.com/yggdrasil/yggdrasil-mcp-logo-readme.png" alt="Yggdrasil MCP Logo" width="600" />
</p>

[![npm version](https://img.shields.io/npm/v/yggdrasil-mcp.svg)](https://www.npmjs.com/package/yggdrasil-mcp)
[![CI](https://github.com/henrychong-ai/yggdrasil-mcp/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/henrychong-ai/yggdrasil-mcp/actions/workflows/ci-cd.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D24-green.svg)](https://nodejs.org/)

**Reasoning orchestration MCP server** — Tree of Thoughts with multi-agent evaluation.

A fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an ambitious roadmap for advanced reasoning capabilities.

## Why Yggdrasil?

In Norse mythology, Yggdrasil is the World Tree connecting all realms. This MCP embodies that metaphor:

- **Branches** = Different reasoning paths through possibility space
- **Roots** = Deep foundational analysis (first principles)
- **Connections** = Links between thoughts, revisions, and evaluations

## Key Features

### Current (v1.0.4)

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
- Cross-model verification
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

## Recommended: CLAUDE.md Configuration

After installing the MCP server, add the following to your `~/.claude/CLAUDE.md` (global instructions) to unlock quick-access triggerwords and ensure Claude Code can load the tools correctly.

### Why this matters

Yggdrasil tools are **deferred tools** in Claude Code — their full schemas are not loaded until explicitly fetched. Without the configuration below, Claude Code won't know how to invoke the tools or respond to shorthand triggers. Adding this block enables:

- **Shorthand triggers** (`s1`, `s2`, `s3`) for instant reasoning at different depth levels
- **Automatic ToolSearch** so Claude Code loads the tool schema before first use
- **Correct thought calibration** based on problem complexity

### Add to `~/.claude/CLAUDE.md`

Copy the following block into your `~/.claude/CLAUDE.md` file:

````markdown
## Structured Reasoning (Yggdrasil MCP)

### sequential_thinking — Reflective Problem-Solving

**MANDATORY Trigger:** When `s1`, `s2`, or `s3` appears ANYWHERE in user input:
1. Load via `ToolSearch` query `select:mcp__yggdrasil__sequential_thinking`
2. Invoke with appropriate `totalThoughts`
3. Complete the full chain before responding

**This is NOT optional internal reasoning — you MUST call the external MCP tool.**

| Trigger | totalThoughts | Use Case |
|---------|---------------|----------|
| **s1** | 3-5 | Quick analysis, simple decisions |
| **s2** | 6-10 | Detailed analysis, multi-factor problems |
| **s3** | 12-20 | Comprehensive analysis, complex systems |

### deep_planning — Multi-Phase Planning Sessions

Use for structured planning that needs to track state across phases:
`init → clarify → explore → evaluate → finalize`

Best for: Architecture decisions, multi-approach evaluation, implementation planning with scored trade-offs.

Both tools are deferred — load via `ToolSearch` before first use.
````

### ToolSearch (Recommended)

Yggdrasil tools are registered as **deferred tools** in Claude Code. This means their parameter schemas are not available until fetched via `ToolSearch`. The CLAUDE.md configuration above handles this automatically for the `s1`/`s2`/`s3` triggers, but if you want to invoke the tools directly, use:

```
ToolSearch query: "select:mcp__yggdrasil__sequential_thinking"
ToolSearch query: "select:mcp__yggdrasil__deep_planning"
```

This fetches the full schema and makes the tool callable for the rest of the session.

### Verification

After setup, test by typing `s1` followed by a question in Claude Code. You should see Claude Code automatically invoke `ToolSearch` and then call `sequential_thinking` with 3-5 thoughts.

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

## Tools: list_plans & get_plan

Retrieve saved `deep_planning` sessions.

- **`list_plans`** — List all saved sessions. Optional filters: `status` (`complete` or `in-progress`), `keyword` (search in problem text).
- **`get_plan`** — Retrieve a session by ID. Formats: `markdown` (default, finalized plans) or `jsonl` (full event log).

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

See [CHANGELOG.md](CHANGELOG.md) for the full version history.

## License

MIT License — see [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. All tests pass (`pnpm test`)
2. Linting passes (`pnpm lint`)
3. Code is formatted (`pnpm format`)
4. Version is incremented appropriately
