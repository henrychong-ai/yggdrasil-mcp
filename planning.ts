/**
 * Deep Planning Server — structured planning session management.
 *
 * Manages a phased planning workflow: init → clarify → explore → evaluate → finalize.
 * Designed to complement sequential_thinking by tracking planning session state
 * while the LLM uses sequential_thinking for deep reasoning between phases.
 */

import chalk from 'chalk';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface Clarification {
  question: string;
  answer?: string;
}

export interface Approach {
  branchId: string;
  name: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface EvaluationScores {
  feasibility: number;
  completeness: number;
  coherence: number;
  risk: number;
}

export interface Evaluation {
  branchId: string;
  scores: EvaluationScores;
  weightedScore: number;
  rationale: string;
  recommendation: 'pursue' | 'refine' | 'abandon';
}

export interface PlanStep {
  title: string;
  description: string;
  files?: string[];
  dependencies?: number[];
  complexity?: 'low' | 'medium' | 'high';
}

export interface PlanRisk {
  description: string;
  mitigation: string;
}

export type PlanPhase = 'init' | 'clarify' | 'explore' | 'evaluate' | 'finalize' | 'done';

export interface PlanningSession {
  sessionId: string;
  problem: string;
  context?: string;
  constraints: string[];
  phase: PlanPhase;
  clarifications: Clarification[];
  approaches: Approach[];
  evaluations: Evaluation[];
  selectedApproach?: string;
  steps: PlanStep[];
  risks: PlanRisk[];
  assumptions: string[];
  successCriteria: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DeepPlanningInput {
  phase: string;
  // Init fields
  problem?: string;
  context?: string;
  constraints?: string;
  // Clarify fields
  question?: string;
  answer?: string;
  // Explore fields
  branchId?: string;
  name?: string;
  description?: string;
  pros?: string;
  cons?: string;
  // Evaluate fields
  feasibility?: number;
  completeness?: number;
  coherence?: number;
  risk?: number;
  rationale?: string;
  recommendation?: string;
  // Finalize fields
  selectedBranch?: string;
  steps?: string;
  risks?: string;
  assumptions?: string;
  successCriteria?: string;
  format?: string;
}

export interface DeepPlanningOutput {
  sessionId: string;
  phase: string;
  status: 'ok' | 'error' | 'complete';
  approachCount: number;
  evaluationCount: number;
  validNextPhases: string[];
  message: string;
  plan?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_PHASES: PlanPhase[] = ['init', 'clarify', 'explore', 'evaluate', 'finalize'];

const VALID_TRANSITIONS: Record<string, PlanPhase[]> = {
  '': ['init'],
  init: ['clarify', 'explore'],
  clarify: ['clarify', 'explore'],
  explore: ['explore', 'evaluate', 'clarify'],
  evaluate: ['evaluate', 'explore', 'finalize'],
  finalize: [],
  done: ['init'],
};

const SCORE_WEIGHTS = {
  feasibility: 0.3,
  completeness: 0.25,
  coherence: 0.25,
  risk: 0.2,
} as const;

const VALID_RECOMMENDATIONS = ['pursue', 'refine', 'abandon'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseJsonStringArray(value: string | undefined, fieldName: string): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new TypeError(`${fieldName} must be a JSON array`);
    }
    return parsed.map(String);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError(`Invalid JSON for ${fieldName}`);
    }
    throw error;
  }
}

function parseJsonArray<T>(value: string | undefined, fieldName: string): T[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new TypeError(`${fieldName} must be a JSON array`);
    }
    return parsed as T[];
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new TypeError(`Invalid JSON for ${fieldName}`);
    }
    throw error;
  }
}

export function normalizePlanStep(raw: Record<string, unknown>, index: number): PlanStep {
  const rawTitle = raw.title ?? raw.action ?? raw.name ?? raw.step;
  const rawDescription = raw.description ?? raw.detail ?? raw.details ?? raw.info;

  return {
    title: typeof rawTitle === 'string' ? rawTitle : `Step ${String(index + 1)}`,
    description: typeof rawDescription === 'string' ? rawDescription : '',
    ...(raw.files ? { files: raw.files as string[] } : {}),
    ...(raw.dependencies ? { dependencies: raw.dependencies as number[] } : {}),
    ...(raw.complexity ? { complexity: raw.complexity as 'low' | 'medium' | 'high' } : {}),
  };
}

export function calculateWeightedScore(scores: EvaluationScores): number {
  const raw =
    scores.feasibility * SCORE_WEIGHTS.feasibility +
    scores.completeness * SCORE_WEIGHTS.completeness +
    scores.coherence * SCORE_WEIGHTS.coherence +
    (10 - scores.risk) * SCORE_WEIGHTS.risk;
  return Math.round(raw * 100) / 100;
}

// ─── Markdown Section Builders ───────────────────────────────────────────────

function buildHeaderSection(session: PlanningSession, selectedName: string): string[] {
  const lines = [`# Plan: ${selectedName}`, '', '## Problem', session.problem, ''];

  if (session.context) {
    lines.push('## Context', session.context, '');
  }

  if (session.constraints.length > 0) {
    lines.push('## Constraints', ...session.constraints.map((c) => `- ${c}`), '');
  }

  if (session.clarifications.length > 0) {
    lines.push(
      '## Clarifications',
      '',
      '| Question | Answer |',
      '|----------|--------|',
      ...session.clarifications.map((c) => `| ${c.question} | ${c.answer ?? 'Pending'} |`),
      ''
    );
  }

  return lines;
}

function buildSelectedApproachSection(
  selected: Approach | undefined,
  selectedEval: Evaluation | undefined
): string[] {
  const lines = [`## Selected Approach: ${selected?.name ?? 'N/A'}`, ''];

  if (selectedEval) {
    lines.push(
      `**Score:** ${selectedEval.weightedScore.toFixed(2)}/10`,
      `**Rationale:** ${selectedEval.rationale}`,
      `**Recommendation:** ${selectedEval.recommendation}`,
      '',
      '| Criterion | Score |',
      '|-----------|-------|',
      `| Feasibility | ${selectedEval.scores.feasibility}/10 |`,
      `| Completeness | ${selectedEval.scores.completeness}/10 |`,
      `| Coherence | ${selectedEval.scores.coherence}/10 |`,
      `| Risk | ${selectedEval.scores.risk}/10 |`,
      ''
    );
  }

  if (selected?.pros && selected.pros.length > 0) {
    lines.push('**Pros:**', ...selected.pros.map((p) => `- ${p}`), '');
  }

  if (selected?.cons && selected.cons.length > 0) {
    lines.push('**Cons:**', ...selected.cons.map((c) => `- ${c}`), '');
  }

  return lines;
}

function buildRejectedSection(rejected: Approach[], evaluations: Evaluation[]): string[] {
  if (rejected.length === 0) return [];

  const lines = ['## Rejected Approaches', ''];
  for (const r of rejected) {
    const rEval = evaluations.find((e) => e.branchId === r.branchId);
    lines.push(`### ${r.name}`);
    if (rEval) {
      lines.push(
        `**Score:** ${rEval.weightedScore.toFixed(2)}/10 | **Recommendation:** ${rEval.recommendation}`,
        `**Rationale:** ${rEval.rationale}`
      );
    }
    lines.push('');
  }

  return lines;
}

function buildStepsSection(steps: PlanStep[]): string[] {
  if (steps.length === 0) return [];

  const lines = ['## Implementation Steps', ''];
  for (const [index, step] of steps.entries()) {
    lines.push(`### Step ${String(index + 1)}: ${step.title}`, step.description);
    if (step.files && step.files.length > 0) {
      lines.push(`- **Files:** ${step.files.join(', ')}`);
    }
    if (step.dependencies && step.dependencies.length > 0) {
      lines.push(`- **Depends on:** Step ${step.dependencies.join(', Step ')}`);
    }
    if (step.complexity) {
      lines.push(`- **Complexity:** ${step.complexity}`);
    }
    lines.push('');
  }

  return lines;
}

function buildFooterSection(session: PlanningSession): string[] {
  const lines: string[] = [];

  if (session.risks.length > 0) {
    lines.push(
      '## Risks',
      '',
      '| Risk | Mitigation |',
      '|------|------------|',
      ...session.risks.map((r) => `| ${r.description} | ${r.mitigation} |`),
      ''
    );
  }

  if (session.assumptions.length > 0) {
    lines.push('## Assumptions', ...session.assumptions.map((a) => `- ${a}`), '');
  }

  if (session.successCriteria.length > 0) {
    lines.push('## Success Criteria', ...session.successCriteria.map((c) => `- [ ] ${c}`), '');
  }

  return lines;
}

// ─── Server ──────────────────────────────────────────────────────────────────

export class DeepPlanningServer {
  private session: PlanningSession | null = null;
  private disableLogging: boolean;

  constructor() {
    this.disableLogging = (process.env.DISABLE_THOUGHT_LOGGING ?? '').toLowerCase() === 'true';
  }

  private log(message: string): void {
    if (!this.disableLogging) {
      console.error(message);
    }
  }

  private getValidNextPhases(): PlanPhase[] {
    const currentPhase = this.session?.phase ?? '';
    return VALID_TRANSITIONS[currentPhase] ?? [];
  }

  private makeOutput(
    status: 'ok' | 'error' | 'complete',
    message: string,
    plan?: string
  ): DeepPlanningOutput {
    return {
      sessionId: this.session?.sessionId ?? '',
      phase: this.session?.phase ?? '',
      status,
      approachCount: this.session?.approaches.length ?? 0,
      evaluationCount: this.session?.evaluations.length ?? 0,
      validNextPhases: this.getValidNextPhases(),
      message,
      ...(plan !== undefined && { plan }),
    };
  }

  private validateTransition(requestedPhase: string): string | null {
    if (!VALID_PHASES.includes(requestedPhase as PlanPhase)) {
      return `Invalid phase: "${requestedPhase}". Valid phases: ${VALID_PHASES.join(', ')}`;
    }

    if (requestedPhase !== 'init' && !this.session) {
      return 'No active planning session. Call with phase "init" first.';
    }

    // init is always valid — it creates a fresh session regardless of current state
    if (requestedPhase === 'init') {
      return null;
    }

    const validNext = this.getValidNextPhases();
    if (!validNext.includes(requestedPhase as PlanPhase)) {
      const currentPhase = this.session?.phase ?? '(none)';
      return `Cannot transition from "${currentPhase}" to "${requestedPhase}". Valid next phases: ${validNext.join(', ')}`;
    }

    return null;
  }

  // ─── Phase Handlers ──────────────────────────────────────────────────────

  private handleInit(input: DeepPlanningInput): DeepPlanningOutput {
    if (!input.problem) {
      return this.makeOutput('error', 'Phase "init" requires a "problem" field.');
    }

    const sessionId = `dp-${Date.now().toString(36)}`;
    const now = new Date().toISOString();

    this.session = {
      sessionId,
      problem: input.problem,
      context: input.context,
      constraints: parseJsonStringArray(input.constraints, 'constraints'),
      phase: 'init',
      clarifications: [],
      approaches: [],
      evaluations: [],
      steps: [],
      risks: [],
      assumptions: [],
      successCriteria: [],
      createdAt: now,
      updatedAt: now,
    };

    this.log(chalk.blue(`\n📋 Planning session started: ${sessionId}`));
    this.log(chalk.blue(`   Problem: ${input.problem}`));

    return this.makeOutput(
      'ok',
      `Planning session "${sessionId}" created. Define your problem further with "clarify" or start exploring approaches with "explore".`
    );
  }

  private handleClarify(session: PlanningSession, input: DeepPlanningInput): DeepPlanningOutput {
    if (!input.question) {
      return this.makeOutput('error', 'Phase "clarify" requires a "question" field.');
    }

    session.clarifications.push({
      question: input.question,
      answer: input.answer,
    });
    session.phase = 'clarify';
    session.updatedAt = new Date().toISOString();

    this.log(chalk.yellow(`   ❓ Clarification: ${input.question}`));
    if (input.answer) {
      this.log(chalk.yellow(`   💬 Answer: ${input.answer}`));
    }

    return this.makeOutput(
      'ok',
      `Clarification recorded (${session.clarifications.length} total). Continue clarifying or start exploring approaches.`
    );
  }

  private handleExplore(session: PlanningSession, input: DeepPlanningInput): DeepPlanningOutput {
    if (!input.branchId || !input.name) {
      return this.makeOutput('error', 'Phase "explore" requires "branchId" and "name" fields.');
    }

    const existing = session.approaches.find((a) => a.branchId === input.branchId);
    if (existing) {
      return this.makeOutput('error', `Approach with branchId "${input.branchId}" already exists.`);
    }

    session.approaches.push({
      branchId: input.branchId,
      name: input.name,
      description: input.description ?? '',
      pros: parseJsonStringArray(input.pros, 'pros'),
      cons: parseJsonStringArray(input.cons, 'cons'),
    });
    session.phase = 'explore';
    session.updatedAt = new Date().toISOString();

    this.log(chalk.green(`   🌿 Approach: ${input.name} (${input.branchId})`));

    return this.makeOutput(
      'ok',
      `Approach "${input.name}" recorded (${session.approaches.length} total). Explore more approaches or start evaluating.`
    );
  }

  private handleEvaluate(session: PlanningSession, input: DeepPlanningInput): DeepPlanningOutput {
    if (!input.branchId) {
      return this.makeOutput('error', 'Phase "evaluate" requires a "branchId" field.');
    }

    const approach = session.approaches.find((a) => a.branchId === input.branchId);
    if (!approach) {
      const available = session.approaches.map((a) => a.branchId).join(', ');
      return this.makeOutput(
        'error',
        `No approach found with branchId "${input.branchId}". Available: ${available}`
      );
    }

    const existing = session.evaluations.find((e) => e.branchId === input.branchId);
    if (existing) {
      return this.makeOutput(
        'error',
        `Evaluation for branchId "${input.branchId}" already exists.`
      );
    }

    const scores: EvaluationScores = {
      feasibility: input.feasibility ?? 5,
      completeness: input.completeness ?? 5,
      coherence: input.coherence ?? 5,
      risk: input.risk ?? 5,
    };

    const recommendation = input.recommendation ?? 'refine';
    if (!VALID_RECOMMENDATIONS.includes(recommendation as (typeof VALID_RECOMMENDATIONS)[number])) {
      return this.makeOutput(
        'error',
        `Invalid recommendation: "${recommendation}". Must be: ${VALID_RECOMMENDATIONS.join(', ')}`
      );
    }

    const weightedScore = calculateWeightedScore(scores);

    session.evaluations.push({
      branchId: input.branchId,
      scores,
      weightedScore,
      rationale: input.rationale ?? '',
      recommendation: recommendation as 'pursue' | 'refine' | 'abandon',
    });
    session.phase = 'evaluate';
    session.updatedAt = new Date().toISOString();

    this.log(
      chalk.cyan(
        `   📊 Evaluated: ${approach.name} → ${weightedScore.toFixed(2)}/10 (${recommendation})`
      )
    );

    return this.makeOutput(
      'ok',
      `Evaluation for "${approach.name}" recorded (score: ${weightedScore.toFixed(2)}/10, ${session.evaluations.length} total). Evaluate more or finalize.`
    );
  }

  private handleFinalize(session: PlanningSession, input: DeepPlanningInput): DeepPlanningOutput {
    if (!input.selectedBranch) {
      return this.makeOutput('error', 'Phase "finalize" requires a "selectedBranch" field.');
    }

    const approach = session.approaches.find((a) => a.branchId === input.selectedBranch);
    if (!approach) {
      const available = session.approaches.map((a) => a.branchId).join(', ');
      return this.makeOutput(
        'error',
        `No approach found with branchId "${input.selectedBranch}". Available: ${available}`
      );
    }

    session.selectedApproach = input.selectedBranch;
    const rawSteps = parseJsonArray<Record<string, unknown>>(input.steps, 'steps');
    session.steps = rawSteps.map((raw, i) => normalizePlanStep(raw, i));
    session.risks = parseJsonArray<PlanRisk>(input.risks, 'risks');
    session.assumptions = parseJsonStringArray(input.assumptions, 'assumptions');
    session.successCriteria = parseJsonStringArray(input.successCriteria, 'successCriteria');
    session.phase = 'done';
    session.updatedAt = new Date().toISOString();

    const format = input.format ?? 'markdown';
    const plan =
      format === 'json' ? this.generateJsonPlan(session) : this.generateMarkdownPlan(session);

    this.log(chalk.magenta(`\n✅ Plan finalized: ${approach.name}`));

    return this.makeOutput('complete', `Plan finalized with approach "${approach.name}".`, plan);
  }

  // ─── Plan Generation ─────────────────────────────────────────────────────

  private generateMarkdownPlan(session: PlanningSession): string {
    const selected = session.approaches.find((a) => a.branchId === session.selectedApproach);
    const selectedEval = session.evaluations.find((e) => e.branchId === session.selectedApproach);
    const rejected = session.approaches.filter((a) => a.branchId !== session.selectedApproach);

    return [
      ...buildHeaderSection(session, selected?.name ?? 'Untitled'),
      ...buildSelectedApproachSection(selected, selectedEval),
      ...buildRejectedSection(rejected, session.evaluations),
      ...buildStepsSection(session.steps),
      ...buildFooterSection(session),
    ].join('\n');
  }

  private generateJsonPlan(session: PlanningSession): string {
    const selected = session.approaches.find((a) => a.branchId === session.selectedApproach);
    const selectedEval = session.evaluations.find((e) => e.branchId === session.selectedApproach);
    const rejected = session.approaches
      .filter((a) => a.branchId !== session.selectedApproach)
      .map((a) => {
        const aEval = session.evaluations.find((e) => e.branchId === a.branchId);
        return {
          name: a.name,
          branchId: a.branchId,
          score: aEval?.weightedScore,
          recommendation: aEval?.recommendation,
          rationale: aEval?.rationale,
        };
      });

    return JSON.stringify(
      {
        title: selected?.name ?? 'Untitled',
        problem: session.problem,
        context: session.context,
        constraints: session.constraints,
        clarifications: session.clarifications,
        selectedApproach: {
          name: selected?.name,
          branchId: session.selectedApproach,
          score: selectedEval?.weightedScore,
          rationale: selectedEval?.rationale,
        },
        rejectedApproaches: rejected,
        steps: session.steps,
        risks: session.risks,
        assumptions: session.assumptions,
        successCriteria: session.successCriteria,
      },
      null,
      2
    );
  }

  // ─── Main Entry Point ────────────────────────────────────────────────────

  public processPlanningStep(input: DeepPlanningInput): {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
  } {
    try {
      const transitionError = this.validateTransition(input.phase);
      if (transitionError) {
        const errorOutput: DeepPlanningOutput = {
          sessionId: this.session?.sessionId ?? '',
          phase: this.session?.phase ?? '',
          status: 'error',
          approachCount: this.session?.approaches.length ?? 0,
          evaluationCount: this.session?.evaluations.length ?? 0,
          validNextPhases: this.getValidNextPhases(),
          message: transitionError,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(errorOutput, null, 2) }],
          isError: true,
        };
      }

      let output: DeepPlanningOutput;

      if (input.phase === 'init') {
        output = this.handleInit(input);
      } else if (this.session) {
        const session = this.session;

        switch (input.phase as PlanPhase) {
          case 'clarify': {
            output = this.handleClarify(session, input);
            break;
          }
          case 'explore': {
            output = this.handleExplore(session, input);
            break;
          }
          case 'evaluate': {
            output = this.handleEvaluate(session, input);
            break;
          }
          case 'finalize': {
            output = this.handleFinalize(session, input);
            break;
          }
          default: {
            output = this.makeOutput('error', `Unhandled phase: ${input.phase}`);
            break;
          }
        }
      } else {
        // Unreachable: validateTransition rejects non-init calls without a session
        output = this.makeOutput('error', 'No active planning session.');
      }

      if (output.status === 'error') {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
          isError: true,
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(output, null, 2) }],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                error: error instanceof Error ? error.message : String(error),
                status: 'failed',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }
  }
}
