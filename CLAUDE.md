# Yggdrasil-MCP

**Reasoning orchestration MCP server** - Tree of Thoughts with multi-agent evaluation.

Fork of Anthropic's `@modelcontextprotocol/server-sequential-thinking` with critical bug fixes and enhanced features.

## Project Overview

| Aspect       | Details                                                                          |
| ------------ | -------------------------------------------------------------------------------- |
| **Origin**   | Fork of `@modelcontextprotocol/server-sequential-thinking`                       |
| **Upstream** | https://github.com/modelcontextprotocol/servers/tree/main/src/sequentialthinking |
| **Key Fix**  | Claude Code string coercion bug #3084                                            |
| **MCP Name** | `yggdrasil` (was `st`)                                                           |
| **Tool**     | `mcp__yggdrasil__sequentialthinking`                                             |

## Upstream Monitoring Protocol

**IMPORTANT**: Periodically check the upstream Anthropic repository for changes that should be applied to this fork.

### When to Check

- When starting a new session in this repo
- Before implementing new features
- When user mentions "check upstream" or "sync with upstream"
- Monthly maintenance reviews

### How to Check

1. **Fetch upstream changes**:

   ```bash
   # View recent commits to upstream
   gh api repos/modelcontextprotocol/servers/commits \
     --jq '.[] | select(.commit.message | test("sequential"; "i")) | {sha: .sha[0:7], date: .commit.author.date[0:10], message: .commit.message | split("\n")[0]}'
   ```

2. **Compare specific file**:

   ```bash
   # Fetch current upstream index.ts
   curl -s "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/sequentialthinking/index.ts" -o /tmp/upstream-st.ts

   # Compare with our version
   diff -u /tmp/upstream-st.ts index.ts
   ```

3. **Check upstream package.json version**:
   ```bash
   curl -s "https://raw.githubusercontent.com/modelcontextprotocol/servers/main/src/sequentialthinking/package.json" | jq '.version'
   ```

### What to Look For

| Change Type      | Action                                   |
| ---------------- | ---------------------------------------- |
| Bug fixes        | Apply if not already fixed differently   |
| New parameters   | Evaluate and add with string coercion    |
| Schema changes   | Update our schemas, maintain coercion    |
| New features     | Assess fit with roadmap, adapt as needed |
| Breaking changes | Document in changelog, evaluate impact   |

### Applying Upstream Changes

1. **Never blindly copy** - upstream lacks our string coercion fix
2. **Apply changes selectively** - maintain our `z.preprocess` wrappers
3. **Test thoroughly** - our fix addresses Claude Code bug #3084
4. **Document** - note upstream version synced to in commit message

## Key Files

| File                         | Purpose                                  |
| ---------------------------- | ---------------------------------------- |
| `index.ts`                   | Main MCP server with string coercion fix |
| `lib.ts`                     | Shared utilities                         |
| `plans/yggdrasil-roadmap.md` | 5-phase improvement roadmap              |
| `__tests__/`                 | Test suite                               |

## String Coercion Fix (Critical)

Our key contribution - fixes Claude Code bug #3084 where MCP parameters are serialized as strings:

```typescript
// Safe coercion that properly handles "false" → false
const coerceBoolean = (val: unknown): boolean => {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const lower = val.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }
  throw new Error(`Cannot coerce "${val}" to boolean`);
};

// Applied via z.preprocess, NOT z.coerce (which treats "false" as truthy)
const booleanSchema = z.preprocess(coerceBoolean, z.boolean());
```

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Watch mode
pnpm watch
```

## Roadmap

See `plans/yggdrasil-roadmap.md` for the 5-phase roadmap:

1. **v1.0** - Core enhancements (current)
2. **v1.1** - Differentiation (persistence, Mermaid)
3. **v1.2** - Self-evaluation tools
4. **v2.0** - Multi-agent evaluation (Codex integration)
5. **v2.5** - Advanced orchestration (n8n, MCTS)
