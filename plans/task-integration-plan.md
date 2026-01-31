# Claude Code Task Integration Plan

**Created:** 2026-01-31
**Status:** Planning
**Target Versions:** v1.3.0 (Basic), v1.4.0 (generateTasks), v2.0.0 (Bidirectional)

---

## Executive Summary

This plan outlines the integration between Yggdrasil's reasoning capabilities and Claude Code's Task management system. The goal is to create a **reasoning-first task management** approach where tasks are systematically derived from structured thinking rather than created ad-hoc.

**Key Value Proposition:**
- Every task has a traceable reasoning trail
- Task failures trigger structured analysis
- Complex work is broken down systematically
- Full auditability of decision-making

---

## Current State Analysis

### Claude Code Tasks

| Feature | Description |
|---------|-------------|
| **Tools** | TaskCreate, TaskUpdate, TaskList, TaskGet |
| **Status Flow** | pending → in_progress → completed |
| **Dependencies** | blockedBy/blocks relationships |
| **Display** | Ctrl+T task list, spinner with activeForm |
| **Persistence** | Session-persistent, survives context compaction |

### Yggdrasil (sequentialthinking)

| Feature | Description |
|---------|-------------|
| **Purpose** | Structured reasoning with branching |
| **Branching** | branchFromThought, branchId |
| **Revision** | isRevision, revisesThought |
| **State** | In-memory only (currently) |
| **Output** | Formatted thought boxes |

### Conceptual Comparison

| Aspect | Tasks | Thoughts |
|--------|-------|----------|
| **Purpose** | WHAT to do (execution) | HOW to think (reasoning) |
| **Granularity** | Action-oriented | Analysis-oriented |
| **Dependencies** | Explicit (blockedBy) | Implicit (sequence) |
| **Branching** | No native support | Native support |
| **Parallelism** | Can run parallel | Sequential by design |

---

## Integration Opportunities

### 1. Tasks as Yggdrasil Output

Convert thinking conclusions into actionable tasks:

```
User: "Plan the auth system refactoring"

Yggdrasil:
  Thought 1: Audit existing auth touchpoints
  Thought 2: Design new schema based on audit
  Thought 3: Implement database migrations
  Thought 4: Update API endpoints
  Thought 5: Write integration tests

→ Auto-generate Tasks:
  Task 1: "Audit auth touchpoints"
  Task 2: "Design new schema" (blockedBy: [1])
  Task 3: "Implement migrations" (blockedBy: [2])
  Task 4: "Update API endpoints" (blockedBy: [3])
  Task 5: "Write integration tests" (blockedBy: [4])
```

### 2. Branch → Task Mapping

Map reasoning branches to parallel task investigations:

```
Yggdrasil branching:
  Main: "How to implement caching?"
  Branch A: "Redis approach"
  Branch B: "In-memory LRU"
  Branch C: "CDN edge caching"

→ Parallel Tasks:
  Task A: "Investigate Redis" (in_progress)
  Task B: "Investigate LRU" (in_progress)
  Task C: "Investigate CDN" (in_progress)

→ After evaluation:
  Task D: "Implement Redis caching" (winner)
```

### 3. Dependency Inference

Extract implicit dependencies from thought language:

```typescript
// Thought chain
thoughts = [
  { n: 1, thought: "First, audit existing code" },
  { n: 2, thought: "Then, design new schema based on audit" },
  { n: 3, thought: "After schema, implement migrations" },
]

// Dependency keywords detected
keywords = ["first", "then", "based on", "after"]

// Auto-generated dependencies
Task 1: "Audit code"
Task 2: "Design schema" (blockedBy: [1])
Task 3: "Implement migrations" (blockedBy: [2])
```

### 4. Yggdrasil as Task Decomposition Engine

Use Yggdrasil systematically for breaking down complex tasks:

```
User: "Implement user authentication"

Step 1: Yggdrasil analyzes
  - What are the components?
  - What are the dependencies?
  - What are the risks?
  - What's the optimal order?

Step 2: Convert to Tasks
  - Each conclusion → Task
  - Dependency analysis → blockedBy
  - Risk assessment → priority

Step 3: Execute with tracking
  - Tasks show in Ctrl+T
  - activeForm shows current action
  - Progress visible to user
```

### 5. Bidirectional Flow

Tasks can trigger Yggdrasil analysis:

```typescript
if (taskComplexity > threshold || taskFails) {
  await callTool("sequentialthinking", {
    thought: `Task "${task.subject}" needs analysis...`,
    sessionId: task.id,
  });
}
```

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER REQUEST                          │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              YGGDRASIL LAYER (Reasoning)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Sequential   │  │  Branching   │  │  Evaluation  │  │
│  │  Thinking    │→ │  & Revision  │→ │  & Selection │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                         │                               │
│                    generateTasks                        │
│                         │                               │
└─────────────────────────┼───────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│               TASK LAYER (Execution)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  TaskCreate  │→ │  TaskUpdate  │→ │   Complete   │  │
│  │  (pending)   │  │ (in_progress)│  │  (completed) │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                                                         │
│  User sees: Ctrl+T task list, spinner with activeForm   │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: v1.3.0 - Basic Task Integration

**Effort:** 2-3 days
**Breaking Changes:** None (all new params are optional)

**New Parameters for sequentialthinking:**

```typescript
{
  // Existing params...
  thought: string,
  nextThoughtNeeded: boolean,
  thoughtNumber: number,
  totalThoughts: number,

  // NEW: Task integration (optional)
  createTask?: boolean,           // Generate task from this thought
  taskSubject?: string,           // Override auto-generated subject
  taskBlockedBy?: number[],       // Thought numbers this depends on
}
```

**Behavior:**
- If `createTask: true`, call TaskCreate after recording thought
- Auto-generate subject from thought content (first sentence)
- Auto-generate activeForm (e.g., "Analyzing authentication flow")
- Map thought dependencies to task blockedBy

**Implementation:**
1. Add optional params to Zod schema
2. Extract subject/activeForm from thought text
3. Call TaskCreate when createTask is true
4. Store thought→task mapping in memory

---

### Phase 2: v1.4.0 - generateTasks Tool

**Effort:** 1 week
**New Tool:** generateTasks

**Input Schema:**

```typescript
interface GenerateTasksInput {
  mode: 'all' | 'conclusions' | 'branch' | 'actionable';
  branchId?: string;
  sessionId?: string;
  autoStart?: boolean;           // Start first unblocked task
  parallel?: boolean;            // Allow parallel task creation
  dependencyInference?: 'strict' | 'loose' | 'none';
  minConfidence?: number;        // Only thoughts above this confidence
}
```

**Output Schema:**

```typescript
interface GenerateTasksOutput {
  tasksCreated: number;
  tasks: Array<{
    id: string;
    subject: string;
    description: string;
    activeForm: string;
    blockedBy: string[];
    sourceThoughts: number[];
    estimatedComplexity: 'low' | 'medium' | 'high';
  }>;
  dependencyGraph: Record<string, string[]>;
  parallelGroups: string[][];
  warnings?: string[];
}
```

**Dependency Inference Logic:**

```typescript
const dependencyKeywords = {
  strict: ['after', 'then', 'once', 'when complete', 'based on', 'requires'],
  loose: ['first', 'before', 'next', 'finally', 'following'],
};

function inferDependencies(thoughts: ThoughtData[], mode: string): DependencyGraph {
  // Analyze thought text for keywords
  // Build dependency graph
  // Detect parallel opportunities (no keyword connection)
}
```

---

### Phase 3: v1.5.0 - Session Linking

**Effort:** 1 week
**Feature:** Unified session context

**UnifiedSession Structure:**

```typescript
interface UnifiedSession {
  sessionId: string;
  createdAt: Date;
  updatedAt: Date;

  // Yggdrasil layer
  thinking: {
    thoughts: ThoughtData[];
    branches: Record<string, ThoughtData[]>;
    evaluations: BranchEvaluation[];
    selectedBranch?: string;
  };

  // Task layer
  execution: {
    tasks: Task[];
    completedCount: number;
    inProgressCount: number;
    blockedCount: number;
  };

  // Cross-references (bidirectional)
  links: {
    thoughtToTask: Map<number, string>;
    taskToThoughts: Map<string, number[]>;
    branchToTasks: Map<string, string[]>;
  };

  // Metadata
  meta: {
    problem?: string;
    outcome?: string;
    totalTokens?: number;
  };
}
```

**New Tools:**

- `getSession(sessionId)` - Get unified session
- `exportSession(sessionId, format)` - Export as Markdown/JSON
- `linkThoughtToTask(thoughtNumber, taskId)` - Manual linking

---

### Phase 4: v2.0.0 - Bidirectional Flow

**Effort:** 2 weeks
**Feature:** Tasks trigger Yggdrasil analysis

**Task → Yggdrasil Triggers:**

| Trigger | Action |
|---------|--------|
| Task complexity > threshold | Spawn decomposition analysis |
| Task fails | Analyze failure, propose alternatives |
| Task blocked > timeout | Investigate blockers |
| Decision needed | Branch evaluation |

**Implementation:**

```typescript
async function onTaskEvent(event: TaskEvent) {
  if (event.type === 'failed') {
    await callTool("sequentialthinking", {
      thought: `Task "${event.task.subject}" failed. Analyzing...`,
      sessionId: event.task.id,
      thoughtNumber: 1,
      totalThoughts: 5,
    });
  }

  if (event.type === 'complexity_detected') {
    // Create branches for alternative approaches
    await createAlternativeBranches(event.task);
  }
}
```

**Codex Integration:**

```typescript
async function evaluateTaskPlan(tasks: Task[]): Promise<Evaluation> {
  const prompt = `Evaluate this task plan:\n${JSON.stringify(tasks)}`;

  return await callTool("mcp__codex__codex", {
    prompt,
    config: { model: 'gpt-5.2-codex' },
  });
}
```

---

### Phase 5: v2.5.0 - Full Orchestration

**Effort:** 3+ weeks
**Features:** Advanced orchestration

**n8n Workflow Integration:**

```typescript
interface WorkflowConfig {
  trigger: 'task_complete' | 'branch_selected' | 'session_end';
  webhookUrl: string;
  payload: 'full_session' | 'summary' | 'custom';
}

// Yggdrasil calls n8n webhook on events
async function triggerWorkflow(config: WorkflowConfig, session: UnifiedSession) {
  await fetch(config.webhookUrl, {
    method: 'POST',
    body: JSON.stringify(formatPayload(session, config.payload)),
  });
}
```

**MCTS for Task Ordering:**

```typescript
interface MCTSConfig {
  simulations: number;       // Number of rollouts
  explorationConstant: number; // UCB1 tuning
  maxDepth: number;          // Max task chain length
}

async function optimizeTaskOrder(tasks: Task[], config: MCTSConfig): Promise<Task[]> {
  // Run MCTS to find optimal execution order
  // Consider: dependencies, parallelism, resource constraints
}
```

**Parallel Execution:**

```typescript
interface ParallelConfig {
  maxConcurrent: number;
  resourceLimits: Record<string, number>;
  failurePolicy: 'stop_all' | 'continue' | 'retry';
}

async function executeParallel(group: Task[], config: ParallelConfig) {
  // Execute independent tasks concurrently
  // Respect resource limits
  // Handle failures per policy
}
```

---

## Benefits & Success Metrics

### Benefits

| Benefit | Description |
|---------|-------------|
| **Traceability** | Every task has reasoning trail |
| **Visibility** | User sees thinking + doing |
| **Adaptability** | Failures trigger analysis |
| **Auditability** | Complete decision record |
| **Resumability** | Task list persists |
| **Parallelism** | Independent tasks run simultaneously |
| **Dependencies** | Explicit blocking prevents errors |
| **Progress** | Real-time status via task display |

### Success Metrics

| Metric | Target |
|--------|--------|
| Task completion rate | > 95% |
| Dependency accuracy | > 90% inferred correctly |
| User satisfaction | Positive feedback on traceability |
| Performance | < 100ms overhead per thought |
| Adoption | Used in > 50% of complex tasks |

---

## Dependencies & Risks

### Dependencies

| Dependency | Status | Risk |
|------------|--------|------|
| Claude Code Task API | Internal, undocumented | May change |
| Yggdrasil persistence (v1.1) | Planned | Required for session linking |
| Codex MCP (v2.0) | Available | External dependency |
| n8n integration (v2.5) | Planned | Complex setup |

### Risks

| Risk | Mitigation |
|------|------------|
| Task API changes | Abstract behind interface |
| Performance overhead | Lazy evaluation, caching |
| Complexity creep | Phased rollout, feature flags |
| User confusion | Clear documentation, gradual disclosure |

---

## References

- [yggdrasil-roadmap.md](./yggdrasil-roadmap.md) - 5-phase feature roadmap
- [branch-evaluation-approaches.md](./branch-evaluation-approaches.md) - Evaluation strategies
- [Claude Code Documentation](https://docs.anthropic.com/claude-code) - Task system reference
- [MCP Specification](https://modelcontextprotocol.io/) - Protocol details
