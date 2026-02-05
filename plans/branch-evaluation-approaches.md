# Branch Evaluation Approaches

**Created:** 2026-01-31
**Status:** Planning
**Target Version:** v1.2.0 (Criteria-Based), v2.0.0 (Multi-Agent), v2.5.0 (MCTS)

---

## Overview

The current yggdrasil-mcp implementation tracks branches but doesn't evaluate them. This document outlines six approaches for creating competing branches and evaluating which path is superior, with implementation recommendations.

### Current State (v0.7.0)

```typescript
// Current minimal structure
branches: Record<string, ThoughtData[]>;
```

Branches are recorded when `branchFromThought` and `branchId` are provided, but there's no mechanism to:

- Compare branch outcomes
- Select the best path
- Merge insights back

---

## The Six Approaches

### 1. Self-Evaluation

**How it works:** The same agent that created branches reviews all paths and scores them - like a writer editing their own work.

```
Agent creates branches → Agent calls getBranches → Agent scores each → Agent selects winner
```

#### Pros

| Advantage         | Description                                            |
| ----------------- | ------------------------------------------------------ |
| Simple            | No external dependencies, single agent, single session |
| Context preserved | Agent has full context of why branches were created    |
| Fast              | No network calls to external models                    |
| Cheap             | No additional API calls beyond the single session      |
| Coherent          | Same "voice" throughout reasoning                      |

#### Cons

| Disadvantage      | Description                                   |
| ----------------- | --------------------------------------------- |
| Confirmation bias | Agent tends to favor its first instinct       |
| Blind spots       | Same model has same weaknesses throughout     |
| Anchoring         | Early reasoning influences later evaluation   |
| Sunk cost         | May favor branches where more tokens invested |
| Overconfidence    | Models often overrate their own reasoning     |

#### Best Use Cases

- Low-stakes decisions
- Time-sensitive analysis
- Cost-constrained scenarios
- Problems with clear objective criteria

#### Mitigation Strategies

1. Force explicit criteria definition before evaluation
2. Require devil's advocate step against preferred choice
3. Temporal separation - complete all branches, pause, then evaluate
4. Mandate quantitative scoring (no vague "feels better")

---

### 2. Multi-Agent Debate

**How it works:** Multiple different models (e.g., Claude + GPT-5.2 via Codex) independently evaluate branches without seeing each other's scores. Results are then aggregated.

```
Branch data → Evaluator A (Claude) → Score A
           → Evaluator B (Codex)  → Score B
                                  → Aggregation → Winner
```

#### Pros

| Advantage              | Description                                                |
| ---------------------- | ---------------------------------------------------------- |
| Diverse perspectives   | Different models have different training and failure modes |
| Reduces bias           | Claude might miss what GPT catches, and vice versa         |
| Higher confidence      | Agreement between independent evaluators is strong signal  |
| Catches more errors    | Ensemble approaches empirically outperform single models   |
| Disagreement is signal | Strong disagreement flags genuinely difficult decisions    |

#### Cons

| Disadvantage           | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| Latency                | Multiple API calls add seconds to minutes            |
| Cost                   | 2-3x token usage for evaluation phase                |
| Context loss           | External evaluators don't have full creation context |
| Aggregation complexity | How to handle disagreements?                         |
| Correlated failures    | Models may share training data and blind spots       |
| Translation errors     | Packaging context for external model may lose nuance |

#### Best Use Cases

- High-stakes decisions
- Security-sensitive code review
- Complex architectural choices
- When budget allows

#### Aggregation Strategies

| Strategy                | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| Unanimous               | All evaluators must agree (conservative, high confidence) |
| Majority vote           | Simple, works with odd number of evaluators               |
| Weighted by capability  | Trust Opus more than Haiku                                |
| Confidence-weighted     | Higher confidence scores weigh more                       |
| Disagreement escalation | Auto-flag for human when spread exceeds threshold         |

---

### 3. Criteria-Based Scoring Matrix

**How it works:** Define explicit evaluation dimensions with weights. Score each branch on each dimension independently. Select by weighted sum or Pareto optimization.

```typescript
criteria = {
  correctness: 0.4,     // Does it solve the problem?
  efficiency: 0.2,      // How many steps/resources?
  maintainability: 0.2, // Can it be understood/modified?
  risk: 0.2             // What if we're wrong?
}

Branch A: [8, 6, 7, 9] → weighted = 7.4
Branch B: [7, 9, 8, 5] → weighted = 7.1
→ Select Branch A
```

#### Pros

| Advantage    | Description                                           |
| ------------ | ----------------------------------------------------- |
| Transparent  | Can explain exactly why Branch A beat Branch B        |
| Debuggable   | Can identify which criterion was misjudged            |
| Customizable | Different problems can use different criteria weights |
| Reduces bias | Forces structured thinking rather than gut feel       |
| Comparable   | Numeric scores enable tracking over time              |
| Composable   | Works with both self-eval and multi-agent             |
| Auditable    | Creates paper trail for decision rationale            |

#### Cons

| Disadvantage            | Description                                      |
| ----------------------- | ------------------------------------------------ |
| Criteria design is hard | Wrong criteria = wrong selection                 |
| Weight subjectivity     | Why 0.4 vs 0.5? Often arbitrary                  |
| Dimension collapse      | Rich qualitative differences reduced to numbers  |
| Gaming                  | Agent may optimize for score rather than quality |
| Missing dimensions      | Important factors not in criteria get ignored    |
| False precision         | 7.2 vs 7.4 suggests precision that doesn't exist |

#### Best Use Cases

- Problems with well-understood quality dimensions
- Repeatable decision types
- When auditability is required

---

### 4. MCTS (Monte Carlo Tree Search) Adaptation

**How it works:** Borrows from game AI (AlphaGo). Treats reasoning as a tree search problem. Each thought is a node, branches are edges.

**Algorithm:**

1. **Selection** - From root, pick child nodes using UCB1 formula (balances exploration vs exploitation)
2. **Expansion** - Add new thought node to promising branch
3. **Simulation** - Quick "rollout" to terminal state
4. **Backpropagation** - Update win/loss statistics up the tree

Repeat many times, then select most-visited or highest-value path.

```
        Root
       /    \
      A      B  ← Selection (UCB1 picks B)
     / \      \
   A1  A2     B1 ← Expansion (add B1)
                 ← Simulation (rollout B1 to end)
                 ← Backprop (update B, Root with result)

Repeat 100+ times, select most-visited path
```

#### Pros

| Advantage                   | Description                                       |
| --------------------------- | ------------------------------------------------- |
| Mathematically principled   | UCB1 provides theoretical guarantees              |
| Handles uncertainty         | Naturally explores uncertain branches more        |
| Anytime algorithm           | Can stop early, improves with more compute        |
| Proven at scale             | Powers AlphaGo, AlphaFold                         |
| Discovers non-obvious paths | Exploration term finds counterintuitive solutions |
| Self-improving              | More rollouts = better estimates                  |

#### Cons

| Disadvantage              | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| Expensive                 | Each rollout is an LLM call; 100 rollouts = 100x cost |
| Requires value function   | Scoring terminal states is itself hard                |
| High latency              | Sequential rollouts take time                         |
| Overkill                  | Massive overhead when 2-3 branches would suffice      |
| Implementation complexity | Significantly more code than simpler approaches       |
| Tuning required           | UCB1 constant, rollout depth, simulation policy       |

#### Best Use Cases

- Complex multi-step planning
- High compute budget available
- Problems resembling game trees

---

### 5. Adversarial Evaluation

**How it works:** Structured debate format. For each branch, one agent argues FOR (defender) and another argues AGAINST (prosecutor). The branch surviving strongest criticism wins.

```
Branch A:
  Defender: "A handles edge cases elegantly..."
  Prosecutor: "But A has O(n²) complexity which fails at scale..."
  Defender: "The n is bounded by user count which..."

Branch B:
  Defender: "B is O(n log n) and handles..."
  Prosecutor: "But B requires additional memory..."

Judge: Branch B survives criticism better → Select B
```

#### Pros

| Advantage                  | Description                                          |
| -------------------------- | ---------------------------------------------------- |
| Surfaces weaknesses        | Prosecutor incentivized to find flaws                |
| Stress-tests reasoning     | Good ideas survive scrutiny                          |
| Mimics real-world review   | Legal, academic, code review use adversarial process |
| Generates counterarguments | Useful even if branch is selected                    |

#### Cons

| Disadvantage                      | Description                         |
| --------------------------------- | ----------------------------------- |
| Favors defensible over innovative | Safe mediocre beats risky brilliant |
| Eloquence over substance          | Better-argued weak idea might win   |
| 2-3x cost                         | Need multiple agents per branch     |
| Unproductive debate               | Agents may talk past each other     |

#### Best Use Cases

- High-stakes decisions
- Security review
- When robustness matters more than novelty

---

### 6. Execution-Based Validation

**How it works:** For executable domains (code, SQL, configs), actually run the proposed solutions and measure results.

```
Branch A: "Use quicksort"  → Implement → Run benchmark → 45ms
Branch B: "Use mergesort"  → Implement → Run benchmark → 52ms
→ Select Branch A (measurably faster)
```

#### Pros

| Advantage           | Description                                     |
| ------------------- | ----------------------------------------------- |
| Ground truth        | Measuring, not reasoning about quality          |
| Objective           | Test pass/fail, performance numbers don't lie   |
| Catches subtle bugs | Reasoning might miss edge cases execution finds |

#### Cons

| Disadvantage         | Description                         |
| -------------------- | ----------------------------------- |
| Domain-limited       | Only works for executable artifacts |
| Security risk        | Running untrusted code              |
| Time/cost            | Need sandbox, compute resources     |
| Test quality matters | Bad tests = bad signal              |

#### Best Use Cases

- Code generation
- Algorithm selection
- Performance optimization
- Any testable output

---

## Comparison Matrix

| Approach         | Cost      | Latency   | Bias Reduction | Complexity | Best Domain          |
| ---------------- | --------- | --------- | -------------- | ---------- | -------------------- |
| Self-Evaluation  | Low       | Low       | Low            | Low        | Quick decisions      |
| Multi-Agent      | High      | High      | High           | Medium     | High-stakes          |
| Criteria Scoring | Low       | Low       | Medium         | Low        | Auditable decisions  |
| MCTS             | Very High | Very High | High           | High       | Complex planning     |
| Adversarial      | High      | High      | Medium-High    | Medium     | Security/robustness  |
| Execution-Based  | Medium    | Medium    | Very High      | Medium     | Code/testable output |

---

## Recommended Implementation Order

### Why Criteria-Based First

| Factor                  | Reasoning                                                                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Foundation**          | Every other approach needs a scoring structure. Multi-agent? Agents need criteria. MCTS? Need value function. Adversarial? Judge needs framework. |
| **Low complexity**      | Just data structures + 3-4 new tools. No external dependencies.                                                                                   |
| **Immediate value**     | Even with self-evaluation, explicit criteria beats gut feel.                                                                                      |
| **Debuggable**          | When something goes wrong, you can see which criterion was misjudged.                                                                             |
| **Composable**          | Becomes the "scoring language" for all future approaches.                                                                                         |
| **Aligns with roadmap** | v1.2 is "self-evaluation tools" - this is exactly that.                                                                                           |

### Implementation Phases

```
v1.2.0 - Criteria-Based Scoring (FIRST)
├── Define BranchScore interface (foundation everything builds on)
├── getBranches tool (expose branch data)
├── scoreBranch tool (record scores + reasoning)
├── selectBranch tool (declare winner)
└── synthesizeBranches tool (merge insights from multiple paths)

v2.0.0 - Multi-Agent (builds on v1.2)
├── Same criteria schema, different evaluators
├── Add Codex MCP integration
└── Aggregation logic for disagreements

v2.5.0 - MCTS (builds on v2.0)
├── Criteria scores become value function
├── Add orchestration layer (n8n)
└── Rollout/backprop logic
```

### What NOT to Build First

| Approach        | Why Not First                                   |
| --------------- | ----------------------------------------------- |
| Multi-Agent     | Adds external dependencies before core is solid |
| MCTS            | Massive complexity for uncertain payoff         |
| Adversarial     | Requires multi-agent infrastructure first       |
| Execution-Based | Domain-limited, requires sandbox integration    |

---

## Key Insight: Synthesis > Selection

Sometimes the answer isn't picking one branch but combining multiple. Example: Branch A has better error handling, Branch B has cleaner architecture. Optimal solution combines both.

The `synthesizeBranches` tool is more powerful than simple winner-take-all but requires more sophisticated merging logic.

---

## Proposed Data Structures

### Enhanced Branch Structure

```typescript
interface Branch {
  id: string;
  parentThought: number;
  thoughts: ThoughtData[];
  scores: BranchScore[];
  status: 'exploring' | 'complete' | 'abandoned' | 'selected';
  metadata: {
    createdAt: Date;
    evaluators: string[];
    finalScore?: number;
  };
}
```

### BranchScore Interface

```typescript
interface BranchScore {
  evaluator: string; // Who scored (e.g., "claude-self", "codex-gpt5")
  timestamp: Date;
  criteria: {
    coherence: number; // 0-10: Does reasoning follow logically?
    completeness: number; // 0-10: Are edge cases covered?
    efficiency: number; // 0-10: Steps/resources to solution?
    confidence: number; // 0-10: How certain is this correct?
    risk: number; // 0-10: Reversibility if wrong?
  };
  overall: number; // Weighted or computed overall score
  reasoning: string; // Explanation for scores
}
```

---

## New Tools Required (v1.2.0)

### 1. `getBranches`

Retrieve all branch data for evaluation.

**Input:** None (returns all branches) or `branchId` for specific branch

**Output:**

```typescript
{
  branches: Branch[];
  mainPath: ThoughtData[];
  totalThoughts: number;
}
```

### 2. `scoreBranch`

Record evaluation score with criteria breakdown.

**Input:**

```typescript
{
  branchId: string;
  evaluator: string;
  criteria: {
    coherence: number;
    completeness: number;
    efficiency: number;
    confidence: number;
    risk: number;
  }
  reasoning: string;
}
```

### 3. `selectBranch`

Declare winner and reasoning.

**Input:**

```typescript
{
  selectedBranchId: string;
  reasoning: string;
  alternativesConsidered: string[];
}
```

### 4. `synthesizeBranches`

Merge insights from multiple branches into unified conclusion.

**Input:**

```typescript
{
  branchIds: string[];
  synthesisStrategy: 'best-of-each' | 'weighted-merge' | 'custom';
  reasoning: string;
}
```

---

## Branch Creation Triggers

Currently branch creation is left to agent intuition. Consider adding heuristic triggers:

| Trigger               | Description                                                 |
| --------------------- | ----------------------------------------------------------- |
| Uncertainty threshold | If confidence drops below X%, create branch for alternative |
| Decision points       | Explicit "this OR that" detected in reasoning               |
| User-requested        | `/branch here` command                                      |
| Failure recovery      | If branch hits dead end, auto-fork from last viable point   |

---

## References

- [yggdrasil-roadmap.md](./yggdrasil-roadmap.md) - 5-phase feature roadmap
- [Tree of Thoughts paper](https://arxiv.org/abs/2305.10601) - Academic foundation
- [MCTS in AlphaGo](https://www.nature.com/articles/nature16961) - MCTS at scale
- Upstream: `@modelcontextprotocol/server-sequential-thinking`
