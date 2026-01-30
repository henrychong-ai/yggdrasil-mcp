# Yggdrasil-MCP Improvement Roadmap

**Created:** 2026-01-30
**Updated:** 2026-01-30
**Status:** Planning (5-phase roadmap with multi-agent evaluation)
**Based on:** Comprehensive analysis of official @modelcontextprotocol/server-sequential-thinking

---

## Current State

| Aspect | Status |
|--------|--------|
| Core tool | `sequentialthinking` with branching/revision |
| String coercion | Fixed (our contribution) |
| State | In-memory only, lost on restart |
| Retrieval | Cannot query past thoughts |
| Tools | Single tool only |
| Metadata | Basic fields only |

---

## Improvement Categories

### 1. New Tools (High Priority)

| Tool | Purpose | Effort |
|------|---------|--------|
| `get_thought_history` | Retrieve all thoughts in session | Low |
| `get_thought` | Get specific thought by number | Low |
| `get_branch` | Get all thoughts in a branch | Low |
| `summarize_thinking` | Generate summary of thought chain | Medium |
| `clear_session` | Reset state for new problem | Low |
| `compare_branches` | Compare outcomes of different branches | Medium |

### 2. Enhanced Metadata

| Field | Type | Purpose |
|-------|------|---------|
| `timestamp` | ISO string | When thought was created |
| `tags` | string[] | Categorize: "hypothesis", "evidence", "conclusion", "question" |
| `confidence` | 0-1 float | Express certainty level |
| `sessionId` | string | Group related thought chains |

### 3. Persistence Layer

```
Options:
├── JSONL file (simple, portable)
├── SQLite (queryable, single file)
└── Memory-only with export (current + export tool)
```

**Recommendation**: JSONL with configurable path via env var `YGGDRASIL_DATA_PATH`

### 4. Output Formats

| Format | Use Case |
|--------|----------|
| JSON | Default, programmatic |
| Markdown | Human-readable summary |
| Mermaid | Visual flowchart of thought progression |
| Tree | ASCII tree view of branches |

### 5. Thinking Frameworks

| Framework | Structure |
|-----------|-----------|
| `first-principles` | Assumptions → Fundamentals → Build up |
| `5-whys` | Problem → Why? (×5) → Root cause |
| `hypothesis-testing` | Hypothesis → Evidence → Test → Conclude |
| `pros-cons` | Option → Pros → Cons → Weigh → Decide |
| `design-thinking` | Empathize → Define → Ideate → Prototype → Test |

### 6. Validation & Quality

- Detect circular reasoning (repeating earlier thoughts)
- Warn on premature conclusion
- Flag unresolved branch divergence
- Suggest consolidation when branches > 5

### 7. Multi-Agent Branch Evaluation (Differentiating Feature)

**Vision**: Transform Yggdrasil from "sequential thinking with fixes" into a **reasoning orchestration framework**.

#### Architecture Options

| Approach | Independence | Latency | Best For |
|----------|--------------|---------|----------|
| **MCP Self-Eval** | None (same context) | Minimal | Quick validation |
| **Claude Task Tool** | High (isolated agent) | Moderate | Deep analysis |
| **Codex Integration** | Very High (GPT-5.2) | Higher | Cross-model verification |
| **n8n Orchestration** | Configurable | Variable | Complex pipelines |

#### New Tools for Evaluation

| Tool | Purpose | Effort |
|------|---------|--------|
| `evaluate_branch` | Score a branch on multiple criteria | Medium |
| `compare_branches` | Side-by-side comparison with recommendation | Medium |
| `spawn_evaluator` | Trigger external evaluation (Codex/Task) | High |
| `aggregate_evaluations` | Combine multiple evaluator scores | Medium |

#### Branch Selection Algorithms

| Algorithm | Description |
|-----------|-------------|
| **Max Score** | Highest total score wins |
| **Weighted Voting** | Criteria weighted by importance |
| **MCTS-Style** | Iterative expansion of promising branches |
| **Risk-Adjusted** | Penalize high-variance branches |
| **Consensus** | Multiple evaluators must agree |

#### Evaluation Criteria

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Feasibility | 0.25 | Can this be implemented/executed? |
| Completeness | 0.20 | Does it address all aspects? |
| Coherence | 0.20 | Is the logic sound throughout? |
| Novelty | 0.15 | Does it offer unique insights? |
| Convergence | 0.10 | Does it lead to actionable conclusion? |
| Risk | 0.10 | What could go wrong? |

---

## Recommended Roadmap

### Phase 1: Core Enhancements (v1.0)

- [x] String coercion fix
- [ ] Add `get_thought_history` tool
- [ ] Add `clear_session` tool
- [ ] Add `timestamp` field
- [ ] Add `tags` field (optional)
- [ ] Add `confidence` field (optional)
- [ ] Add `sessionId` parameter

### Phase 2: Differentiation (v1.1)

- [ ] JSONL persistence layer
- [ ] Add `summarize_thinking` tool
- [ ] Mermaid diagram export
- [ ] Framework templates (first-principles, 5-whys)
- [ ] Expose branches as MCP Resources
- [ ] Add `get_branch_summary` tool

### Phase 3: Self-Evaluation (v1.2)

- [ ] Add `evaluate_branch` tool (structured scoring)
- [ ] Add `compare_branches` tool with recommendations
- [ ] Implement evaluation data structures
- [ ] Scoring criteria configuration
- [ ] Branch recommendation with rationale

### Phase 4: Multi-Agent Evaluation (v2.0)

- [ ] Codex MCP integration for GPT-5.2 evaluation
- [ ] Claude Code Task tool spawning support
- [ ] Multiple evaluator score aggregation
- [ ] Configurable evaluation strategies
- [ ] Cross-model verification mode

### Phase 5: Advanced Orchestration (v2.5)

- [ ] n8n workflow integration
- [ ] Parallel evaluation with configurable concurrency
- [ ] MCTS-style iterative branch refinement
- [ ] Tournament-based branch selection
- [ ] Multiple concurrent sessions
- [ ] Analytics and insights
- [ ] Circular reasoning detection

---

## Key Differentiators vs Official Package

| Feature | Official | Yggdrasil |
|---------|----------|-----------|
| String coercion | Broken | Fixed |
| Retrieve history | No | Yes |
| Persistence | No | JSONL |
| Summarization | No | Yes |
| Visual export | No | Mermaid |
| Frameworks | No | Built-in |
| Metadata | Basic | Extended |
| Branch evaluation | No | Self + Multi-agent |
| Cross-model verification | No | Codex/GPT-5.2 |
| MCP Resources | No | Branch exposure |
| Evaluation strategies | No | Configurable |

---

## Technical Implementation Notes

### New Tool Schemas

#### get_thought_history

```typescript
inputSchema: {
  sessionId: z.string().optional(),
  includeContent: z.boolean().optional().default(true),
  format: z.enum(["json", "markdown", "mermaid"]).optional().default("json")
}
```

#### clear_session

```typescript
inputSchema: {
  sessionId: z.string().optional(),
  confirm: z.boolean().describe("Must be true to clear")
}
```

#### summarize_thinking

```typescript
inputSchema: {
  sessionId: z.string().optional(),
  includeDecisions: z.boolean().optional().default(true),
  includeBranches: z.boolean().optional().default(true)
}
```

### Enhanced ThoughtData Interface

```typescript
interface ThoughtData {
  // Existing fields
  thought: string;
  thoughtNumber: number;
  totalThoughts: number;
  isRevision?: boolean;
  revisesThought?: number;
  branchFromThought?: number;
  branchId?: string;
  needsMoreThoughts?: boolean;
  nextThoughtNeeded: boolean;

  // New fields
  timestamp?: string;        // ISO 8601
  sessionId?: string;        // Group related chains
  tags?: string[];           // ["hypothesis", "evidence", etc.]
  confidence?: number;       // 0.0 - 1.0
}
```

### Persistence Format (JSONL)

```jsonl
{"type":"session","id":"abc123","started":"2026-01-30T08:00:00Z","problem":"..."}
{"type":"thought","sessionId":"abc123","thoughtNumber":1,"thought":"...","timestamp":"..."}
{"type":"thought","sessionId":"abc123","thoughtNumber":2,"thought":"...","timestamp":"..."}
{"type":"session_end","id":"abc123","ended":"2026-01-30T08:05:00Z","summary":"..."}
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `YGGDRASIL_DATA_PATH` | `./yggdrasil-data.jsonl` | Persistence file location |
| `YGGDRASIL_PERSIST` | `false` | Enable/disable persistence |
| `DISABLE_THOUGHT_LOGGING` | `false` | Suppress stderr output |

---

## Multi-Agent Evaluation Technical Notes

### MCP Resources for Branch Access

```typescript
// Expose branches as read-only MCP Resources
// Resource URIs:
//   yggdrasil://branches/{branchId}
//   yggdrasil://branches/{branchId}/summary
//   yggdrasil://branches/{branchId}/evaluation

interface BranchResource {
  uri: string;
  name: string;
  description: string;
  mimeType: "application/json";
}
```

### Branch Evaluation Schema

```typescript
interface BranchEvaluation {
  branchId: string;
  evaluatorId: string;           // "self" | "codex" | "claude-task-{id}"
  evaluatorModel?: string;       // "gpt-5.2-codex" | "claude-sonnet" etc.
  timestamp: string;
  scores: {
    feasibility: number;         // 0-10
    completeness: number;        // 0-10
    coherence: number;           // 0-10
    novelty: number;             // 0-10
    convergence: number;         // 0-10
    risk: number;                // 0-10 (lower is better)
  };
  weightedScore: number;         // Computed from weights
  rationale: string;
  recommendation: "pursue" | "abandon" | "refine" | "merge";
}

interface AggregatedEvaluation {
  branchId: string;
  evaluations: BranchEvaluation[];
  consensusScore: number;
  variance: number;
  finalRecommendation: string;
  selectedBy: "max_score" | "weighted_voting" | "consensus" | "mcts";
}
```

### evaluate_branch Tool Schema

```typescript
inputSchema: {
  branchId: z.string().describe("Branch to evaluate"),
  criteria: z.array(z.enum([
    "feasibility", "completeness", "coherence",
    "novelty", "convergence", "risk"
  ])).optional().default(["feasibility", "completeness", "coherence"]),
  weights: z.record(z.string(), z.number()).optional(),
  evaluationMode: z.enum(["self", "codex", "detailed"]).optional().default("self")
}
```

### compare_branches Tool Schema

```typescript
inputSchema: {
  branchIds: z.array(z.string()).min(2).describe("Branches to compare"),
  selectionAlgorithm: z.enum([
    "max_score", "weighted_voting", "risk_adjusted", "consensus"
  ]).optional().default("weighted_voting"),
  includeRationale: z.boolean().optional().default(true)
}
```

### Codex Integration Pattern

```typescript
async function evaluateWithCodex(branch: Branch): Promise<BranchEvaluation> {
  const prompt = `Evaluate this reasoning branch objectively:

## Branch: ${branch.id}
## Thoughts:
${branch.thoughts.map(t => `${t.thoughtNumber}. ${t.thought}`).join('\n')}

Score 0-10 on each criterion:
- Feasibility: Can this be implemented/executed?
- Completeness: Does it address all aspects?
- Coherence: Is the logic sound throughout?
- Novelty: Does it offer unique insights?
- Convergence: Does it lead to actionable conclusion?
- Risk: What could go wrong? (lower = better)

Return JSON: { scores: {...}, rationale: "...", recommendation: "pursue|abandon|refine|merge" }`;

  const result = await mcpClient.callTool('mcp__codex__codex', {
    prompt,
    config: { model: 'gpt-5.2-codex' }  // xhigh reasoning default
  });

  return parseCodexResponse(result, branch.id);
}
```

### Claude Code Task Tool Integration

```typescript
// For maximum isolation, spawn a dedicated agent per branch
async function evaluateWithTaskTool(branch: Branch): Promise<BranchEvaluation> {
  // This would be invoked by the calling Claude Code session
  // Yggdrasil provides the prompt template and data structure

  const taskPrompt = `Evaluate this reasoning branch from Yggdrasil MCP:

${JSON.stringify(branch, null, 2)}

Provide structured evaluation with scores and rationale.
Return your evaluation as JSON matching the BranchEvaluation interface.`;

  return {
    promptTemplate: taskPrompt,
    expectedSchema: 'BranchEvaluation',
    subagentType: 'general-purpose'
  };
}
```

---

## Migration Path

For users of the official package:

1. Replace `@modelcontextprotocol/server-sequential-thinking` with `yggdrasil-mcp`
2. Existing tool calls work unchanged (backward compatible)
3. New features are opt-in via additional parameters
4. No breaking changes to core `sequentialthinking` tool

---

## Success Metrics

- npm weekly downloads > 1,000
- GitHub stars > 50
- Positive feedback on string coercion fix
- Feature requests indicate real usage
- Contributions from community

---

## Unique Value Proposition

Yggdrasil positions itself not just as "sequential thinking with bug fixes" but as a **reasoning orchestration framework**:

1. **Tree of Thoughts Implementation**: Native branching with proper exploration
2. **Multi-Model Evaluation**: Claude generates, GPT-5.2 evaluates (via Codex)
3. **Ecosystem Integration**: Works with Claude Code Task tool, n8n, existing MCPs
4. **Configurable Strategies**: Choose evaluation algorithms that fit your use case
5. **MCP-Native**: Exposes branches as Resources for external tooling

### Why "Yggdrasil"?

In Norse mythology, Yggdrasil is the World Tree connecting all realms. For this MCP:
- **Branches** = Different reasoning paths through possibility space
- **Roots** = Deep foundational analysis (first principles)
- **Connections** = Links between thoughts, revisions, and evaluations
- **Thematic fit** = Pairs with "Bifrost" (the bridge) in Henry's MCP collection

### Target Users

1. **Power users** frustrated by official package limitations
2. **Developers** building complex reasoning pipelines
3. **Researchers** exploring Tree of Thoughts implementations
4. **Teams** needing auditable thought processes with persistence
