import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  calculateWeightedScore,
  DeepPlanningServer,
  type DeepPlanningInput,
  type DeepPlanningOutput,
  type EvaluationScores,
  normalizePlanStep,
} from '../planning.js';

function parseOutput(
  result: ReturnType<DeepPlanningServer['processPlanningStep']>
): DeepPlanningOutput {
  return JSON.parse(result.content[0].text) as DeepPlanningOutput;
}

function initSession(
  server: DeepPlanningServer,
  overrides: Partial<DeepPlanningInput> = {}
): DeepPlanningOutput {
  return parseOutput(
    server.processPlanningStep({
      phase: 'init',
      problem: 'Test problem',
      ...overrides,
    })
  );
}

function addApproach(
  server: DeepPlanningServer,
  branchId: string,
  name: string,
  overrides: Partial<DeepPlanningInput> = {}
): DeepPlanningOutput {
  return parseOutput(
    server.processPlanningStep({
      phase: 'explore',
      branchId,
      name,
      ...overrides,
    })
  );
}

function evaluateApproach(
  server: DeepPlanningServer,
  branchId: string,
  overrides: Partial<DeepPlanningInput> = {}
): DeepPlanningOutput {
  return parseOutput(
    server.processPlanningStep({
      phase: 'evaluate',
      branchId,
      feasibility: 8,
      completeness: 7,
      coherence: 9,
      risk: 3,
      rationale: 'Test rationale',
      recommendation: 'pursue',
      ...overrides,
    })
  );
}

describe('DeepPlanningServer', () => {
  let server: DeepPlanningServer;

  beforeEach(() => {
    vi.stubEnv('DISABLE_THOUGHT_LOGGING', 'true');
    server = new DeepPlanningServer();
  });

  // ─── Phase Transitions (Valid) ──────────────────────────────────────────

  describe('valid phase transitions', () => {
    it('should initialize a planning session', () => {
      const output = initSession(server);

      expect(output.status).toBe('ok');
      expect(output.sessionId).toMatch(/^dp-/);
      expect(output.phase).toBe('init');
      expect(output.validNextPhases).toContain('clarify');
      expect(output.validNextPhases).toContain('explore');
    });

    it('should transition from init to clarify', () => {
      initSession(server);
      const output = parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'What framework?',
          answer: 'Express',
        })
      );

      expect(output.status).toBe('ok');
      expect(output.phase).toBe('clarify');
    });

    it('should transition from init to explore', () => {
      initSession(server);
      const output = addApproach(server, 'branch-a', 'Approach A');

      expect(output.status).toBe('ok');
      expect(output.phase).toBe('explore');
      expect(output.approachCount).toBe(1);
    });

    it('should transition from explore to evaluate', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      const output = evaluateApproach(server, 'branch-a');

      expect(output.status).toBe('ok');
      expect(output.phase).toBe('evaluate');
      expect(output.evaluationCount).toBe(1);
    });

    it('should transition from evaluate to finalize', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'branch-a',
          steps: '[]',
        })
      );

      expect(output.status).toBe('complete');
      expect(output.plan).toBeDefined();
    });

    it('should allow revisiting clarify from explore', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'Follow-up question?',
        })
      );

      expect(output.status).toBe('ok');
      expect(output.phase).toBe('clarify');
    });

    it('should allow revisiting explore from evaluate', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const output = addApproach(server, 'branch-b', 'Approach B');

      expect(output.status).toBe('ok');
      expect(output.phase).toBe('explore');
      expect(output.approachCount).toBe(2);
    });
  });

  // ─── Phase Transitions (Invalid) ───────────────────────────────────────

  describe('invalid phase transitions', () => {
    it('should reject non-init calls without a session', () => {
      const result = server.processPlanningStep({ phase: 'clarify', question: 'test' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.status).toBe('error');
      expect(output.message).toContain('No active planning session');
    });

    it('should reject invalid phase names', () => {
      const result = server.processPlanningStep({ phase: 'invalid' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('Invalid phase');
    });

    it('should reject finalize directly after init', () => {
      initSession(server);
      const result = server.processPlanningStep({
        phase: 'finalize',
        selectedBranch: 'test',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('Cannot transition');
    });

    it('should reject evaluate directly after init', () => {
      initSession(server);
      const result = server.processPlanningStep({
        phase: 'evaluate',
        branchId: 'test',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('Cannot transition');
    });

    it('should reject init when session already exists', () => {
      initSession(server);
      const result = server.processPlanningStep({
        phase: 'init',
        problem: 'Another problem',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('Cannot transition');
    });
  });

  // ─── Init Phase ─────────────────────────────────────────────────────────

  describe('init phase', () => {
    it('should require problem field', () => {
      const result = server.processPlanningStep({ phase: 'init' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('requires a "problem" field');
    });

    it('should store context and constraints', () => {
      const output = initSession(server, {
        context: 'Backend app',
        constraints: '["must use TypeScript", "no external deps"]',
      });

      expect(output.status).toBe('ok');
    });
  });

  // ─── Clarify Phase ──────────────────────────────────────────────────────

  describe('clarify phase', () => {
    it('should require question field', () => {
      initSession(server);
      const result = server.processPlanningStep({ phase: 'clarify' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('requires a "question" field');
    });

    it('should record multiple clarifications', () => {
      initSession(server);

      parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'Q1?',
          answer: 'A1',
        })
      );

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'Q2?',
        })
      );

      expect(output.status).toBe('ok');
      expect(output.message).toContain('2 total');
    });
  });

  // ─── Explore Phase ──────────────────────────────────────────────────────

  describe('explore phase', () => {
    it('should require branchId and name', () => {
      initSession(server);
      const result = server.processPlanningStep({ phase: 'explore' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('requires "branchId" and "name"');
    });

    it('should reject duplicate branchId', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const result = server.processPlanningStep({
        phase: 'explore',
        branchId: 'branch-a',
        name: 'Duplicate',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('already exists');
    });

    it('should parse pros and cons as JSON arrays', () => {
      initSession(server);
      const output = addApproach(server, 'branch-a', 'Approach A', {
        pros: '["fast", "simple"]',
        cons: '["limited"]',
      });

      expect(output.status).toBe('ok');
      expect(output.approachCount).toBe(1);
    });

    it('should handle missing pros and cons', () => {
      initSession(server);
      const output = addApproach(server, 'branch-a', 'Approach A');

      expect(output.status).toBe('ok');
    });
  });

  // ─── Evaluate Phase ─────────────────────────────────────────────────────

  describe('evaluate phase', () => {
    it('should require branchId', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const result = server.processPlanningStep({ phase: 'evaluate' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('requires a "branchId"');
    });

    it('should reject evaluation of non-existent branch', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const result = server.processPlanningStep({
        phase: 'evaluate',
        branchId: 'non-existent',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('No approach found');
    });

    it('should reject duplicate evaluation', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const result = server.processPlanningStep({
        phase: 'evaluate',
        branchId: 'branch-a',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('already exists');
    });

    it('should reject invalid recommendation', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const result = server.processPlanningStep({
        phase: 'evaluate',
        branchId: 'branch-a',
        recommendation: 'invalid',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('Invalid recommendation');
    });

    it('should use default scores when not provided', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'evaluate',
          branchId: 'branch-a',
        })
      );

      expect(output.status).toBe('ok');
      expect(output.message).toContain('score:');
    });

    it('should calculate and report weighted score', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');

      const output = evaluateApproach(server, 'branch-a', {
        feasibility: 10,
        completeness: 10,
        coherence: 10,
        risk: 0,
      });

      // Perfect scores: (10*0.3) + (10*0.25) + (10*0.25) + (10-0)*0.2 = 3+2.5+2.5+2 = 10
      expect(output.status).toBe('ok');
      expect(output.message).toContain('10.00/10');
    });
  });

  // ─── Finalize Phase ─────────────────────────────────────────────────────

  describe('finalize phase', () => {
    it('should require selectedBranch', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const result = server.processPlanningStep({ phase: 'finalize' });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('requires a "selectedBranch"');
    });

    it('should reject non-existent selectedBranch', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const result = server.processPlanningStep({
        phase: 'finalize',
        selectedBranch: 'non-existent',
      });
      const output = parseOutput(result);

      expect(result.isError).toBe(true);
      expect(output.message).toContain('No approach found');
    });

    it('should generate markdown plan by default', () => {
      initSession(server, { problem: 'Auth system' });
      addApproach(server, 'passport', 'Passport.js', {
        description: 'Use Passport middleware',
        pros: '["mature"]',
        cons: '["complex config"]',
      });
      evaluateApproach(server, 'passport');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'passport',
          steps: '[{"title":"Install deps","description":"pnpm add passport"}]',
          risks: '[{"description":"Config errors","mitigation":"Document env vars"}]',
          assumptions: '["MongoDB configured"]',
          successCriteria: '["Users can login"]',
        })
      );

      expect(output.status).toBe('complete');
      expect(output.plan).toContain('# Plan: Passport.js');
      expect(output.plan).toContain('## Problem');
      expect(output.plan).toContain('Auth system');
      expect(output.plan).toContain('## Selected Approach');
      expect(output.plan).toContain('## Implementation Steps');
      expect(output.plan).toContain('Install deps');
      expect(output.plan).toContain('## Risks');
      expect(output.plan).toContain('## Assumptions');
      expect(output.plan).toContain('## Success Criteria');
    });

    it('should generate JSON plan when format is json', () => {
      initSession(server);
      addApproach(server, 'branch-a', 'Approach A');
      evaluateApproach(server, 'branch-a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'branch-a',
          format: 'json',
        })
      );

      expect(output.status).toBe('complete');
      const plan = JSON.parse(output.plan ?? '{}') as Record<string, unknown>;
      expect(plan).toHaveProperty('title', 'Approach A');
      expect(plan).toHaveProperty('problem', 'Test problem');
      expect(plan).toHaveProperty('selectedApproach');
      expect(plan).toHaveProperty('rejectedApproaches');
      expect(plan).toHaveProperty('steps');
      expect(plan).toHaveProperty('risks');
    });
  });

  // ─── Markdown Plan Sections ─────────────────────────────────────────────

  describe('markdown plan generation', () => {
    it('should include context and constraints when provided', () => {
      initSession(server, {
        problem: 'Auth',
        context: 'Express app',
        constraints: '["TypeScript only", "No external deps"]',
      });
      addApproach(server, 'a', 'Test Approach');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.plan).toContain('## Context');
      expect(output.plan).toContain('Express app');
      expect(output.plan).toContain('## Constraints');
      expect(output.plan).toContain('TypeScript only');
    });

    it('should include clarifications table', () => {
      initSession(server);
      parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'Which DB?',
          answer: 'PostgreSQL',
        })
      );
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.plan).toContain('## Clarifications');
      expect(output.plan).toContain('Which DB?');
      expect(output.plan).toContain('PostgreSQL');
    });

    it('should include rejected approaches', () => {
      initSession(server);
      addApproach(server, 'a', 'Winner');
      addApproach(server, 'b', 'Loser');
      evaluateApproach(server, 'a', { recommendation: 'pursue' });
      evaluateApproach(server, 'b', { recommendation: 'abandon', rationale: 'Too risky' });

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.plan).toContain('## Rejected Approaches');
      expect(output.plan).toContain('### Loser');
      expect(output.plan).toContain('Too risky');
    });

    it('should include evaluation scores table', () => {
      initSession(server);
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a', {
        feasibility: 9,
        completeness: 8,
        coherence: 7,
        risk: 2,
      });

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.plan).toContain('| Feasibility | 9/10 |');
      expect(output.plan).toContain('| Completeness | 8/10 |');
      expect(output.plan).toContain('| Coherence | 7/10 |');
      expect(output.plan).toContain('| Risk | 2/10 |');
    });

    it('should include step details with files, dependencies, and complexity', () => {
      initSession(server);
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
          steps: JSON.stringify([
            {
              title: 'Setup',
              description: 'Install deps',
              files: ['package.json'],
              dependencies: [1],
              complexity: 'low',
            },
          ]),
        })
      );

      expect(output.plan).toContain('### Step 1: Setup');
      expect(output.plan).toContain('Install deps');
      expect(output.plan).toContain('**Files:** package.json');
      expect(output.plan).toContain('**Depends on:** Step 1');
      expect(output.plan).toContain('**Complexity:** low');
    });

    it('should show pending clarifications', () => {
      initSession(server);
      parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'Unanswered?',
        })
      );
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.plan).toContain('Pending');
    });
  });

  // ─── JSON Plan Generation ──────────────────────────────────────────────

  describe('json plan generation', () => {
    it('should include rejected approaches with scores', () => {
      initSession(server);
      addApproach(server, 'a', 'Winner');
      addApproach(server, 'b', 'Loser');
      evaluateApproach(server, 'a');
      evaluateApproach(server, 'b', { recommendation: 'abandon' });

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
          format: 'json',
        })
      );

      const plan = JSON.parse(output.plan ?? '{}') as Record<string, unknown>;
      const rejected = plan.rejectedApproaches as Record<string, unknown>[];
      expect(rejected).toHaveLength(1);
      expect(rejected[0].name).toBe('Loser');
      expect(rejected[0].recommendation).toBe('abandon');
    });
  });

  // ─── calculateWeightedScore ─────────────────────────────────────────────

  describe('calculateWeightedScore', () => {
    it('should calculate perfect score as 10', () => {
      const scores: EvaluationScores = {
        feasibility: 10,
        completeness: 10,
        coherence: 10,
        risk: 0,
      };
      expect(calculateWeightedScore(scores)).toBe(10);
    });

    it('should calculate worst score as 0', () => {
      const scores: EvaluationScores = {
        feasibility: 0,
        completeness: 0,
        coherence: 0,
        risk: 10,
      };
      expect(calculateWeightedScore(scores)).toBe(0);
    });

    it('should calculate mid-range scores correctly', () => {
      const scores: EvaluationScores = {
        feasibility: 8,
        completeness: 7,
        coherence: 9,
        risk: 3,
      };
      // (8*0.3) + (7*0.25) + (9*0.25) + (10-3)*0.2 = 2.4+1.75+2.25+1.4 = 7.8
      expect(calculateWeightedScore(scores)).toBe(7.8);
    });

    it('should round to 2 decimal places', () => {
      const scores: EvaluationScores = {
        feasibility: 7,
        completeness: 6,
        coherence: 8,
        risk: 4,
      };
      // (7*0.3) + (6*0.25) + (8*0.25) + (10-4)*0.2 = 2.1+1.5+2.0+1.2 = 6.8
      expect(calculateWeightedScore(scores)).toBe(6.8);
    });

    it('should invert risk score (lower risk = higher contribution)', () => {
      const lowRisk: EvaluationScores = { feasibility: 5, completeness: 5, coherence: 5, risk: 1 };
      const highRisk: EvaluationScores = { feasibility: 5, completeness: 5, coherence: 5, risk: 9 };

      expect(calculateWeightedScore(lowRisk)).toBeGreaterThan(calculateWeightedScore(highRisk));
    });
  });

  // ─── Step Normalization ─────────────────────────────────────────────────

  describe('normalizePlanStep', () => {
    it('should pass through canonical title/description fields', () => {
      const step = normalizePlanStep({ title: 'Setup', description: 'Install deps' }, 0);
      expect(step.title).toBe('Setup');
      expect(step.description).toBe('Install deps');
    });

    it('should map action to title and detail to description', () => {
      const step = normalizePlanStep({ action: 'Deploy', detail: 'Push to prod' }, 0);
      expect(step.title).toBe('Deploy');
      expect(step.description).toBe('Push to prod');
    });

    it('should map name to title and details to description', () => {
      const step = normalizePlanStep({ name: 'Configure', details: 'Set env vars' }, 0);
      expect(step.title).toBe('Configure');
      expect(step.description).toBe('Set env vars');
    });

    it('should map step to title and info to description', () => {
      const step = normalizePlanStep({ step: 'Test', info: 'Run vitest' }, 0);
      expect(step.title).toBe('Test');
      expect(step.description).toBe('Run vitest');
    });

    it('should fall back to "Step N" when no title alias found', () => {
      const step = normalizePlanStep({ order: 1 }, 2);
      expect(step.title).toBe('Step 3');
      expect(step.description).toBe('');
    });

    it('should preserve optional fields (files, dependencies, complexity)', () => {
      const step = normalizePlanStep(
        { title: 'T', description: 'D', files: ['a.ts'], dependencies: [1], complexity: 'high' },
        0
      );
      expect(step.files).toEqual(['a.ts']);
      expect(step.dependencies).toEqual([1]);
      expect(step.complexity).toBe('high');
    });

    it('should prefer canonical fields over aliases', () => {
      const step = normalizePlanStep(
        {
          title: 'Canonical',
          action: 'Alias',
          description: 'Canonical Desc',
          detail: 'Alias Desc',
        },
        0
      );
      expect(step.title).toBe('Canonical');
      expect(step.description).toBe('Canonical Desc');
    });
  });

  describe('finalize with step aliases', () => {
    it('should render steps correctly when using action/detail field names', () => {
      initSession(server);
      addApproach(server, 'a', 'Approach A');
      evaluateApproach(server, 'a');

      const result = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
          steps: JSON.stringify([
            { order: 1, action: 'Set up Redis', detail: 'Use Upstash' },
            { order: 2, action: 'Add middleware', detail: 'Cache layer' },
          ]),
        })
      );

      expect(result.status).toBe('complete');
      expect(result.plan).toContain('### Step 1: Set up Redis');
      expect(result.plan).toContain('Use Upstash');
      expect(result.plan).toContain('### Step 2: Add middleware');
      expect(result.plan).toContain('Cache layer');
      expect(result.plan).not.toContain('undefined');
    });
  });

  // ─── Edge Cases ─────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('should handle invalid JSON for constraints gracefully', () => {
      const result = server.processPlanningStep({
        phase: 'init',
        problem: 'Test',
        constraints: 'not valid json',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle invalid JSON for pros gracefully', () => {
      initSession(server);

      const result = server.processPlanningStep({
        phase: 'explore',
        branchId: 'a',
        name: 'Test',
        pros: '{not an array}',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle invalid JSON for steps gracefully', () => {
      initSession(server);
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a');

      const result = server.processPlanningStep({
        phase: 'finalize',
        selectedBranch: 'a',
        steps: 'invalid json',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle non-array JSON for constraints', () => {
      const result = server.processPlanningStep({
        phase: 'init',
        problem: 'Test',
        constraints: '"just a string"',
      });

      expect(result.isError).toBe(true);
    });

    it('should handle empty finalize with no steps/risks', () => {
      initSession(server);
      addApproach(server, 'a', 'Test');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'a',
        })
      );

      expect(output.status).toBe('complete');
      expect(output.plan).not.toContain('## Implementation Steps');
      expect(output.plan).not.toContain('## Risks');
    });

    it('should handle finalize with no evaluation for selected branch', () => {
      initSession(server);
      addApproach(server, 'a', 'Test');
      // Skip evaluation — go straight from explore to evaluate then finalize
      // Actually we need to evaluate to reach finalize phase
      // But we can evaluate branch a, add branch b, then finalize with b (which has no eval)
      addApproach(server, 'b', 'Second');
      evaluateApproach(server, 'a');

      const output = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'b',
        })
      );

      expect(output.status).toBe('complete');
      // Should still generate plan even without scores for selected branch
      expect(output.plan).toContain('# Plan: Second');
    });
  });

  // ─── Logging ────────────────────────────────────────────────────────────

  describe('logging', () => {
    it('should suppress logging when DISABLE_THOUGHT_LOGGING is true', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      vi.stubEnv('DISABLE_THOUGHT_LOGGING', 'true');
      const silentServer = new DeepPlanningServer();

      initSession(silentServer);

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should log when DISABLE_THOUGHT_LOGGING is not set', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      vi.stubEnv('DISABLE_THOUGHT_LOGGING', '');
      const loggingServer = new DeepPlanningServer();

      initSession(loggingServer);

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  // ─── Full Workflow ──────────────────────────────────────────────────────

  describe('full workflow', () => {
    it('should complete a full planning session end-to-end', () => {
      // Init
      const initOutput = initSession(server, {
        problem: 'Implement caching layer',
        context: 'Node.js API server',
        constraints: '["Must support TTL", "Max 100MB memory"]',
      });
      expect(initOutput.status).toBe('ok');

      // Clarify
      const clarifyOutput = parseOutput(
        server.processPlanningStep({
          phase: 'clarify',
          question: 'What data types need caching?',
          answer: 'API responses and DB query results',
        })
      );
      expect(clarifyOutput.status).toBe('ok');

      // Explore approach 1
      const exploreA = addApproach(server, 'redis', 'Redis', {
        description: 'Use Redis as external cache',
        pros: '["Battle-tested", "Distributed"]',
        cons: '["External dependency", "Network latency"]',
      });
      expect(exploreA.approachCount).toBe(1);

      // Explore approach 2
      const exploreB = addApproach(server, 'lru', 'In-Memory LRU', {
        description: 'Use node-lru-cache',
        pros: '["No external deps", "Fast"]',
        cons: '["Single process", "Lost on restart"]',
      });
      expect(exploreB.approachCount).toBe(2);

      // Evaluate both
      const evalA = evaluateApproach(server, 'redis', {
        feasibility: 8,
        completeness: 9,
        coherence: 8,
        risk: 4,
        recommendation: 'pursue',
      });
      expect(evalA.evaluationCount).toBe(1);

      const evalB = evaluateApproach(server, 'lru', {
        feasibility: 9,
        completeness: 6,
        coherence: 7,
        risk: 6,
        recommendation: 'refine',
      });
      expect(evalB.evaluationCount).toBe(2);

      // Finalize
      const finalOutput = parseOutput(
        server.processPlanningStep({
          phase: 'finalize',
          selectedBranch: 'redis',
          steps: JSON.stringify([
            { title: 'Install Redis client', description: 'pnpm add ioredis', complexity: 'low' },
            {
              title: 'Create cache service',
              description: 'Build cache abstraction layer',
              files: ['src/cache.ts'],
              dependencies: [1],
              complexity: 'medium',
            },
          ]),
          risks: JSON.stringify([
            { description: 'Redis downtime', mitigation: 'Implement fallback to direct DB' },
          ]),
          assumptions: '["Redis server available", "Network is reliable"]',
          successCriteria: '["API response time < 50ms for cached", "Cache hit rate > 80%"]',
        })
      );

      expect(finalOutput.status).toBe('complete');
      expect(finalOutput.plan).toContain('# Plan: Redis');
      expect(finalOutput.plan).toContain('Implement caching layer');
      expect(finalOutput.plan).toContain('## Rejected Approaches');
      expect(finalOutput.plan).toContain('In-Memory LRU');
      expect(finalOutput.plan).toContain('Install Redis client');
      expect(finalOutput.plan).toContain('Redis downtime');
      expect(finalOutput.plan).toContain('Redis server available');
      expect(finalOutput.plan).toContain('API response time < 50ms');
    });
  });
});
