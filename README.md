# Yggdrasil MCP

**Reasoning orchestration framework** - Tree of Thoughts with multi-agent evaluation.

A fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and an ambitious roadmap for advanced reasoning capabilities.

## Why Yggdrasil?

In Norse mythology, Yggdrasil is the World Tree connecting all realms. This MCP embodies that metaphor:
- **Branches** = Different reasoning paths through possibility space
- **Roots** = Deep foundational analysis (first principles)
- **Connections** = Links between thoughts, revisions, and evaluations

## Key Features

### Current (v0.6.x)
- **String coercion fix** - Fixes Claude Code bug #3084 where MCP parameters are incorrectly serialized as strings
- Break down complex problems into manageable steps
- Revise and refine thoughts as understanding deepens
- Branch into alternative paths of reasoning
- Adjust the total number of thoughts dynamically
- Generate and verify solution hypotheses

### Roadmap
See [plans/yggdrasil-roadmap.md](plans/yggdrasil-roadmap.md) for the full 5-phase roadmap including:
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

Or run from local build:
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

### Claude Desktop

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

## Tool

### sequentialthinking

Facilitates a detailed, step-by-step thinking process for problem-solving and analysis.

**Inputs:**
- `thought` (string): The current thinking step
- `nextThoughtNeeded` (boolean): Whether another thought step is needed
- `thoughtNumber` (integer): Current thought number
- `totalThoughts` (integer): Estimated total thoughts needed
- `isRevision` (boolean, optional): Whether this revises previous thinking
- `revisesThought` (integer, optional): Which thought is being reconsidered
- `branchFromThought` (integer, optional): Branching point thought number
- `branchId` (string, optional): Branch identifier
- `needsMoreThoughts` (boolean, optional): If more thoughts are needed

## Usage

Yggdrasil is designed for:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `DISABLE_THOUGHT_LOGGING` | `false` | Suppress stderr thought output |

## Development

```bash
# Install dependencies
pnpm install

# Build
pnpm build

# Test
pnpm test

# Watch mode
pnpm watch
```

## String Coercion Fix

The critical fix in this fork addresses Claude Code bug #3084 where MCP parameters are serialized as strings regardless of schema type. We use safe `z.preprocess` coercion instead of `z.coerce`:

```typescript
// z.coerce.boolean() is DANGEROUS - treats "false" as truthy!
// Our safe implementation:
const coerceBoolean = (val: unknown): boolean => {
  if (typeof val === "boolean") return val;
  if (typeof val === "string") {
    if (val.toLowerCase() === "true") return true;
    if (val.toLowerCase() === "false") return false;
  }
  throw new Error(`Cannot coerce "${val}" to boolean`);
};
```

## Upstream

This is a fork of [@modelcontextprotocol/server-sequential-thinking](https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking).

We periodically sync relevant changes from upstream while maintaining our string coercion fix and additional features.

## License

MIT License - see LICENSE file for details.
