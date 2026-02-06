#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import {
  booleanSchema,
  numberSchema,
  optionalBooleanSchema,
  optionalNumberSchema,
  optionalScoreSchema,
} from './coercion.js';
import { SequentialThinkingServer } from './lib.js';
import { DeepPlanningServer } from './planning.js';

const server = new McpServer({
  name: 'sequential-thinking-server',
  version: '0.8.2',
});

const thinkingServer = new SequentialThinkingServer();

server.registerTool(
  'sequential_thinking',
  {
    title: 'Sequential Thinking',
    description: `A detailed tool for dynamic and reflective problem-solving through thoughts.
This tool helps analyze problems through a flexible thinking process that can adapt and evolve.
Each thought can build on, question, or revise previous insights as understanding deepens.

When to use this tool:
- Breaking down complex problems into steps
- Planning and design with room for revision
- Analysis that might need course correction
- Problems where the full scope might not be clear initially
- Problems that require a multi-step solution
- Tasks that need to maintain context over multiple steps
- Situations where irrelevant information needs to be filtered out

Key features:
- You can adjust total_thoughts up or down as you progress
- You can question or revise previous thoughts
- You can add more thoughts even after reaching what seemed like the end
- You can express uncertainty and explore alternative approaches
- Not every thought needs to build linearly - you can branch or backtrack
- Generates a solution hypothesis
- Verifies the hypothesis based on the Chain of Thought steps
- Repeats the process until satisfied
- Provides a correct answer

Parameters explained:
- thought: Your current thinking step, which can include:
  * Regular analytical steps
  * Revisions of previous thoughts
  * Questions about previous decisions
  * Realizations about needing more analysis
  * Changes in approach
  * Hypothesis generation
  * Hypothesis verification
- nextThoughtNeeded: True if you need more thinking, even if at what seemed like the end
- thoughtNumber: Current number in sequence (can go beyond initial total if needed)
- totalThoughts: Current estimate of thoughts needed (can be adjusted up/down)
- isRevision: A boolean indicating if this thought revises previous thinking
- revisesThought: If is_revision is true, which thought number is being reconsidered
- branchFromThought: If branching, which thought number is the branching point
- branchId: Identifier for the current branch (if any)
- needsMoreThoughts: If reaching end but realizing more thoughts needed

You should:
1. Start with an initial estimate of needed thoughts, but be ready to adjust
2. Feel free to question or revise previous thoughts
3. Don't hesitate to add more thoughts if needed, even at the "end"
4. Express uncertainty when present
5. Mark thoughts that revise previous thinking or branch into new paths
6. Ignore information that is irrelevant to the current step
7. Generate a solution hypothesis when appropriate
8. Verify the hypothesis based on the Chain of Thought steps
9. Repeat the process until satisfied with the solution
10. Provide a single, ideally correct answer as the final output
11. Only set nextThoughtNeeded to false when truly done and a satisfactory answer is reached`,
    inputSchema: {
      thought: z.string().describe('Your current thinking step'),
      nextThoughtNeeded: booleanSchema.describe('Whether another thought step is needed'),
      thoughtNumber: numberSchema.describe('Current thought number (numeric value, e.g., 1, 2, 3)'),
      totalThoughts: numberSchema.describe(
        'Estimated total thoughts needed (numeric value, e.g., 5, 10)'
      ),
      isRevision: optionalBooleanSchema.describe('Whether this revises previous thinking'),
      revisesThought: optionalNumberSchema.describe('Which thought is being reconsidered'),
      branchFromThought: optionalNumberSchema.describe('Branching point thought number'),
      branchId: z.string().optional().describe('Branch identifier'),
      needsMoreThoughts: optionalBooleanSchema.describe('If more thoughts are needed'),
    },
    outputSchema: {
      thoughtNumber: z.number(),
      totalThoughts: z.number(),
      nextThoughtNeeded: z.boolean(),
      branches: z.array(z.string()),
      thoughtHistoryLength: z.number(),
    },
  },
  (args) => {
    const result = thinkingServer.processThought(args);

    if (result.isError) {
      return result;
    }

    // Parse the JSON response to get structured content
    const parsedContent = JSON.parse(result.content[0].text) as Record<string, unknown>;

    return {
      content: result.content,
      structuredContent: parsedContent,
    };
  }
);

const planningServer = new DeepPlanningServer();

server.registerTool(
  'deep_planning',
  {
    title: 'Deep Planning',
    description: `A structured planning tool that manages multi-phase planning sessions.
Complements sequential_thinking by tracking planning state while the LLM reasons deeply.

Workflow: init → clarify → explore → evaluate → finalize
- init: Define the problem, context, and constraints
- clarify: Record clarifying questions and answers (repeatable)
- explore: Record approach branches with pros/cons (repeatable)
- evaluate: Score approaches on feasibility, completeness, coherence, risk (repeatable)
- finalize: Select best approach and generate structured implementation plan

Each phase returns valid next phases to guide the workflow.
Complex fields (pros, cons, steps, risks, constraints) are passed as JSON strings.

Use sequential_thinking for deep reasoning between phases.
Use deep_planning to record conclusions and track planning state.`,
    inputSchema: {
      phase: z
        .enum(['init', 'clarify', 'explore', 'evaluate', 'finalize'])
        .describe('Current planning phase'),
      // Init fields
      problem: z.string().optional().describe('Problem statement (required for init)'),
      context: z.string().optional().describe('Additional background context'),
      constraints: z.string().optional().describe('JSON array of constraint strings'),
      // Clarify fields
      question: z.string().optional().describe('Clarifying question (required for clarify)'),
      answer: z.string().optional().describe('Answer to the clarifying question'),
      // Explore fields
      branchId: z
        .string()
        .optional()
        .describe('Unique approach identifier (required for explore/evaluate)'),
      name: z.string().optional().describe('Short approach name (required for explore)'),
      description: z.string().optional().describe('Detailed approach description'),
      pros: z.string().optional().describe('JSON array of advantage strings'),
      cons: z.string().optional().describe('JSON array of disadvantage strings'),
      // Evaluate fields
      feasibility: optionalScoreSchema.describe('Feasibility score 0-10'),
      completeness: optionalScoreSchema.describe('Completeness score 0-10'),
      coherence: optionalScoreSchema.describe('Coherence score 0-10'),
      risk: optionalScoreSchema.describe('Risk score 0-10 (lower is better)'),
      rationale: z.string().optional().describe('Reasoning for evaluation scores'),
      recommendation: z.string().optional().describe('pursue, refine, or abandon'),
      // Finalize fields
      selectedBranch: z
        .string()
        .optional()
        .describe('Branch ID of chosen approach (required for finalize)'),
      steps: z.string().optional().describe('JSON array of implementation step objects'),
      risks: z
        .string()
        .optional()
        .describe('JSON array of risk objects with description and mitigation'),
      assumptions: z.string().optional().describe('JSON array of assumption strings'),
      successCriteria: z.string().optional().describe('JSON array of success criteria strings'),
      format: z.string().optional().describe('Output format: markdown (default) or json'),
    },
  },
  (args) => planningServer.processPlanningStep(args)
);

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Sequential Thinking MCP Server running on stdio');
}

await runServer().catch((error: unknown) => {
  console.error('Fatal error running server:', error);
  process.exit(1);
});
