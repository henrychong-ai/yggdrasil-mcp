import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  generateId,
  PersistenceManager,
  type PlanIndexEntry,
  type PlansIndex,
  resolvePlansDirectory,
} from '../persistence.js';
import type { PlanningSession } from '../planning.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeSession(overrides: Partial<PlanningSession> = {}): PlanningSession {
  return {
    sessionId: 'dp-testABCD',
    problem: 'Test problem',
    constraints: [],
    phase: 'init',
    clarifications: [],
    approaches: [],
    evaluations: [],
    steps: [],
    risks: [],
    assumptions: [],
    successCriteria: [],
    createdAt: '2026-02-06T10:00:00.000Z',
    updatedAt: '2026-02-06T10:00:00.000Z',
    ...overrides,
  };
}

function makeIndexEntry(overrides: Partial<PlanIndexEntry> = {}): PlanIndexEntry {
  return {
    problem: 'Test problem',
    createdAt: '2026-02-06T10:00:00.000Z',
    finalizedAt: null,
    selectedBranch: null,
    phase: 'init',
    filePaths: {
      jsonl: 'dp-testABCD.jsonl',
      markdown: null,
    },
    ...overrides,
  };
}

// ─── generateId ──────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('should generate an 8-character string by default', () => {
    const id = generateId();
    expect(id).toHaveLength(8);
  });

  it('should generate a custom-length string', () => {
    expect(generateId(4)).toHaveLength(4);
    expect(generateId(16)).toHaveLength(16);
  });

  it('should only contain Base62 characters', () => {
    const base62Regex = /^[A-Za-z0-9]+$/;
    for (let i = 0; i < 100; i++) {
      expect(generateId()).toMatch(base62Regex);
    }
  });

  it('should generate unique IDs', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateId()));
    expect(ids.size).toBe(1000);
  });
});

// ─── resolvePlansDirectory ───────────────────────────────────────────────────

describe('resolvePlansDirectory', () => {
  beforeEach(() => {
    vi.stubEnv('YGGDRASIL_PLANS_DIR', '');
  });

  it('should use YGGDRASIL_PLANS_DIR env var when set', () => {
    vi.stubEnv('YGGDRASIL_PLANS_DIR', '/custom/plans');
    expect(resolvePlansDirectory()).toBe('/custom/plans');
  });

  it('should fall back to ~/.claude/plans/ when no settings found', () => {
    const result = resolvePlansDirectory('/nonexistent/project');
    // Should end with .claude/plans since the project/global settings won't exist
    expect(result).toContain('.claude');
    expect(result).toContain('plans');
  });

  it('should prioritise env var over project settings', () => {
    vi.stubEnv('YGGDRASIL_PLANS_DIR', '/env/override');
    expect(resolvePlansDirectory('/some/project')).toBe('/env/override');
  });
});

// ─── PersistenceManager ──────────────────────────────────────────────────────

describe('PersistenceManager', () => {
  let tempDir: string;
  let pm: PersistenceManager;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), 'ygg-test-'));
    vi.stubEnv('YGGDRASIL_PLANS_DIR', tempDir);
    pm = new PersistenceManager();
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(tempDir, { recursive: true, force: true });
  });

  // ─── getPlansDir ────────────────────────────────────────────────────────

  describe('getPlansDir', () => {
    it('should return the resolved plans directory', () => {
      expect(pm.getPlansDir()).toBe(tempDir);
    });
  });

  // ─── appendEvent ────────────────────────────────────────────────────────

  describe('appendEvent', () => {
    it('should create a JSONL file with one event', async () => {
      const session = makeSession();
      await pm.appendEvent(session);

      const content = await readFile(path.join(tempDir, 'dp-testABCD.jsonl'), 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(1);

      const event = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('phase', 'init');
      expect(event).toHaveProperty('session');
    });

    it('should append multiple events to the same file', async () => {
      const session = makeSession();
      await pm.appendEvent(session);

      session.phase = 'clarify';
      session.updatedAt = '2026-02-06T10:01:00.000Z';
      await pm.appendEvent(session);

      session.phase = 'explore';
      session.updatedAt = '2026-02-06T10:02:00.000Z';
      await pm.appendEvent(session);

      const content = await readFile(path.join(tempDir, 'dp-testABCD.jsonl'), 'utf8');
      const lines = content.trim().split('\n');
      expect(lines).toHaveLength(3);
    });

    it('should handle write errors gracefully (log, not throw)', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      // Use a path that cannot be written to
      vi.stubEnv('YGGDRASIL_PLANS_DIR', '/nonexistent/impossible/path');
      const badPm = new PersistenceManager();

      // Should not throw
      await badPm.appendEvent(makeSession());
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[yggdrasil]'));
      consoleSpy.mockRestore();
    });
  });

  // ─── writeMarkdownPlan ──────────────────────────────────────────────────

  describe('writeMarkdownPlan', () => {
    it('should write Markdown file with date prefix', async () => {
      const session = makeSession({ createdAt: '2026-02-06T10:00:00.000Z' });
      await pm.writeMarkdownPlan(session, '# Test Plan\n\nContent here');

      const filename = '20260206-dp-testABCD.md';
      const content = await readFile(path.join(tempDir, filename), 'utf8');
      expect(content).toBe('# Test Plan\n\nContent here');
    });

    it('should handle write errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      vi.stubEnv('YGGDRASIL_PLANS_DIR', '/nonexistent/impossible/path');
      const badPm = new PersistenceManager();

      await badPm.writeMarkdownPlan(makeSession(), '# Test');
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[yggdrasil]'));
      consoleSpy.mockRestore();
    });
  });

  // ─── readIndex / updateIndex ────────────────────────────────────────────

  describe('index operations', () => {
    it('should return empty object when index does not exist', async () => {
      const index = await pm.readIndex();
      expect(index).toEqual({});
    });

    it('should write and read back an index entry', async () => {
      const entry = makeIndexEntry();
      await pm.updateIndex('dp-testABCD', entry);

      const index = await pm.readIndex();
      expect(index['dp-testABCD']).toEqual(entry);
    });

    it('should update an existing index entry', async () => {
      const entry = makeIndexEntry();
      await pm.updateIndex('dp-testABCD', entry);

      const updated = makeIndexEntry({
        phase: 'done',
        finalizedAt: '2026-02-06T11:00:00.000Z',
        selectedBranch: 'branch-a',
        filePaths: { jsonl: 'dp-testABCD.jsonl', markdown: '20260206-dp-testABCD.md' },
      });
      await pm.updateIndex('dp-testABCD', updated);

      const index = await pm.readIndex();
      expect(index['dp-testABCD']?.phase).toBe('done');
      expect(index['dp-testABCD']?.finalizedAt).toBe('2026-02-06T11:00:00.000Z');
    });

    it('should handle multiple sessions in the index', async () => {
      await pm.updateIndex('dp-session1', makeIndexEntry({ problem: 'Problem 1' }));
      await pm.updateIndex('dp-session2', makeIndexEntry({ problem: 'Problem 2' }));
      await pm.updateIndex('dp-session3', makeIndexEntry({ problem: 'Problem 3' }));

      const index = await pm.readIndex();
      expect(Object.keys(index)).toHaveLength(3);
    });

    it('should handle corrupted index file', async () => {
      await writeFile(path.join(tempDir, 'yggdrasil-plans-index.json'), 'not json', 'utf8');
      const index = await pm.readIndex();
      expect(index).toEqual({});
    });
  });

  // ─── listPlans ──────────────────────────────────────────────────────────

  describe('listPlans', () => {
    beforeEach(async () => {
      await pm.updateIndex(
        'dp-session1',
        makeIndexEntry({
          problem: 'Auth system',
          createdAt: '2026-02-06T08:00:00.000Z',
          phase: 'done',
          finalizedAt: '2026-02-06T09:00:00.000Z',
        })
      );
      await pm.updateIndex(
        'dp-session2',
        makeIndexEntry({
          problem: 'Cache layer',
          createdAt: '2026-02-06T10:00:00.000Z',
          phase: 'explore',
        })
      );
      await pm.updateIndex(
        'dp-session3',
        makeIndexEntry({
          problem: 'Database migration',
          createdAt: '2026-02-06T12:00:00.000Z',
          phase: 'done',
          finalizedAt: '2026-02-06T13:00:00.000Z',
        })
      );
    });

    it('should list all plans sorted by createdAt descending', async () => {
      const plans = await pm.listPlans();
      expect(plans).toHaveLength(3);
      expect(plans[0].sessionId).toBe('dp-session3');
      expect(plans[1].sessionId).toBe('dp-session2');
      expect(plans[2].sessionId).toBe('dp-session1');
    });

    it('should filter by status: complete', async () => {
      const plans = await pm.listPlans({ status: 'complete' });
      expect(plans).toHaveLength(2);
      expect(plans.every((p) => p.phase === 'done')).toBe(true);
    });

    it('should filter by status: in-progress', async () => {
      const plans = await pm.listPlans({ status: 'in-progress' });
      expect(plans).toHaveLength(1);
      expect(plans[0].sessionId).toBe('dp-session2');
    });

    it('should filter by keyword', async () => {
      const plans = await pm.listPlans({ keyword: 'cache' });
      expect(plans).toHaveLength(1);
      expect(plans[0].problem).toBe('Cache layer');
    });

    it('should be case-insensitive for keyword search', async () => {
      const plans = await pm.listPlans({ keyword: 'AUTH' });
      expect(plans).toHaveLength(1);
      expect(plans[0].problem).toBe('Auth system');
    });

    it('should combine status and keyword filters', async () => {
      const plans = await pm.listPlans({ status: 'complete', keyword: 'database' });
      expect(plans).toHaveLength(1);
      expect(plans[0].problem).toBe('Database migration');
    });

    it('should return empty array when no plans match', async () => {
      const plans = await pm.listPlans({ keyword: 'nonexistent' });
      expect(plans).toHaveLength(0);
    });
  });

  // ─── getPlan ────────────────────────────────────────────────────────────

  describe('getPlan', () => {
    it('should return not found for non-existent session', async () => {
      const result = await pm.getPlan('dp-nonexistent');
      expect(result.found).toBe(false);
      expect(result.content).toContain('No plan found');
    });

    it('should return JSONL content when requested', async () => {
      // Write a JSONL file and index entry
      const session = makeSession();
      await pm.appendEvent(session);
      await pm.updateIndex('dp-testABCD', makeIndexEntry());

      const result = await pm.getPlan('dp-testABCD', 'jsonl');
      expect(result.found).toBe(true);
      expect(result.format).toBe('jsonl');

      const event = JSON.parse(result.content.trim()) as Record<string, unknown>;
      expect(event).toHaveProperty('session');
    });

    it('should return Markdown content when available', async () => {
      const session = makeSession({ phase: 'done' });
      const mdContent = '# Test Plan\n\nThis is a plan.';
      await pm.appendEvent(session);
      await pm.writeMarkdownPlan(session, mdContent);
      await pm.updateIndex(
        'dp-testABCD',
        makeIndexEntry({
          phase: 'done',
          filePaths: { jsonl: 'dp-testABCD.jsonl', markdown: '20260206-dp-testABCD.md' },
        })
      );

      const result = await pm.getPlan('dp-testABCD', 'markdown');
      expect(result.found).toBe(true);
      expect(result.format).toBe('markdown');
      expect(result.content).toBe(mdContent);
    });

    it('should fall back to JSONL when Markdown not available', async () => {
      const session = makeSession({ phase: 'explore' });
      await pm.appendEvent(session);
      await pm.updateIndex(
        'dp-testABCD',
        makeIndexEntry({
          phase: 'explore',
          filePaths: { jsonl: 'dp-testABCD.jsonl', markdown: null },
        })
      );

      const result = await pm.getPlan('dp-testABCD', 'markdown');
      expect(result.found).toBe(true);
      expect(result.format).toBe('jsonl');
    });

    it('should handle file read errors gracefully', async () => {
      // Index entry exists but JSONL file is missing
      await pm.updateIndex(
        'dp-ghost',
        makeIndexEntry({ filePaths: { jsonl: 'dp-ghost.jsonl', markdown: null } })
      );

      const result = await pm.getPlan('dp-ghost', 'jsonl');
      expect(result.found).toBe(false);
      expect(result.content).toContain('Failed to read plan file');
    });
  });

  // ─── rebuildIndex ───────────────────────────────────────────────────────

  describe('rebuildIndex', () => {
    it('should rebuild index from JSONL files', async () => {
      // Write two JSONL session files directly
      const session1 = makeSession({
        sessionId: 'dp-rebuild1',
        problem: 'Rebuild test 1',
        phase: 'done',
        selectedApproach: 'branch-a',
      });
      const session2 = makeSession({
        sessionId: 'dp-rebuild2',
        problem: 'Rebuild test 2',
        phase: 'explore',
      });

      const event1Init = JSON.stringify({
        timestamp: '2026-02-06T10:00:00.000Z',
        phase: 'init',
        session: { ...session1, phase: 'init' },
      });
      const event1Done = JSON.stringify({
        timestamp: '2026-02-06T10:05:00.000Z',
        phase: 'done',
        session: session1,
      });
      await writeFile(
        path.join(tempDir, 'dp-rebuild1.jsonl'),
        event1Init + '\n' + event1Done + '\n',
        'utf8'
      );

      const event2Init = JSON.stringify({
        timestamp: '2026-02-06T11:00:00.000Z',
        phase: 'init',
        session: session2,
      });
      await writeFile(path.join(tempDir, 'dp-rebuild2.jsonl'), event2Init + '\n', 'utf8');

      const index = await pm.rebuildIndex();

      expect(index['dp-rebuild1']).toBeDefined();
      expect(index['dp-rebuild1']?.problem).toBe('Rebuild test 1');
      expect(index['dp-rebuild1']?.phase).toBe('done');
      expect(index['dp-rebuild1']?.selectedBranch).toBe('branch-a');

      expect(index['dp-rebuild2']).toBeDefined();
      expect(index['dp-rebuild2']?.problem).toBe('Rebuild test 2');
      expect(index['dp-rebuild2']?.phase).toBe('explore');
    });

    it('should detect existing Markdown files', async () => {
      const session = makeSession({
        sessionId: 'dp-withmd',
        problem: 'Has markdown',
        phase: 'done',
        createdAt: '2026-02-06T10:00:00.000Z',
      });

      const event = JSON.stringify({
        timestamp: '2026-02-06T10:00:00.000Z',
        phase: 'done',
        session,
      });
      await writeFile(path.join(tempDir, 'dp-withmd.jsonl'), event + '\n', 'utf8');
      await writeFile(path.join(tempDir, '20260206-dp-withmd.md'), '# Plan', 'utf8');

      const index = await pm.rebuildIndex();
      expect(index['dp-withmd']?.filePaths.markdown).toBe('20260206-dp-withmd.md');
    });

    it('should skip corrupted JSONL files', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

      await writeFile(path.join(tempDir, 'dp-corrupt.jsonl'), 'not valid json\n', 'utf8');

      const validSession = makeSession({ sessionId: 'dp-valid', problem: 'Valid session' });
      const validEvent = JSON.stringify({
        timestamp: '2026-02-06T10:00:00.000Z',
        phase: 'init',
        session: validSession,
      });
      await writeFile(path.join(tempDir, 'dp-valid.jsonl'), validEvent + '\n', 'utf8');

      const index = await pm.rebuildIndex();
      expect(index['dp-valid']).toBeDefined();
      expect(index['dp-corrupt']).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('dp-corrupt'));

      consoleSpy.mockRestore();
    });

    it('should persist rebuilt index to disk', async () => {
      const session = makeSession({ sessionId: 'dp-persisted' });
      const event = JSON.stringify({
        timestamp: '2026-02-06T10:00:00.000Z',
        phase: 'init',
        session,
      });
      await writeFile(path.join(tempDir, 'dp-persisted.jsonl'), event + '\n', 'utf8');

      await pm.rebuildIndex();

      // Read index directly from disk
      const indexContent = await readFile(path.join(tempDir, 'yggdrasil-plans-index.json'), 'utf8');
      const index = JSON.parse(indexContent) as PlansIndex;
      expect(index['dp-persisted']).toBeDefined();
    });

    it('should return empty object when plans directory is empty', async () => {
      const index = await pm.rebuildIndex();
      expect(index).toEqual({});
    });

    it('should handle non-existent plans directory', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
      vi.stubEnv('YGGDRASIL_PLANS_DIR', '/nonexistent/impossible/path');
      const badPm = new PersistenceManager();

      const index = await badPm.rebuildIndex();
      expect(index).toEqual({});
      consoleSpy.mockRestore();
    });
  });

  // ─── Integration: Full Session Persistence ──────────────────────────────

  describe('full session persistence', () => {
    it('should persist a complete planning session lifecycle', async () => {
      const sessionId = 'dp-lifecycle';

      // Phase 1: Init
      const initSession = makeSession({ sessionId, problem: 'Lifecycle test' });
      await pm.appendEvent(initSession);
      await pm.updateIndex(sessionId, makeIndexEntry({ problem: 'Lifecycle test' }));

      // Phase 2: Explore
      initSession.phase = 'explore';
      initSession.approaches = [
        { branchId: 'a', name: 'Approach A', description: 'Desc A', pros: [], cons: [] },
      ];
      await pm.appendEvent(initSession);

      // Phase 3: Evaluate
      initSession.phase = 'evaluate';
      initSession.evaluations = [
        {
          branchId: 'a',
          scores: { feasibility: 8, completeness: 7, coherence: 9, risk: 2 },
          weightedScore: 8,
          rationale: 'Good approach',
          recommendation: 'pursue',
        },
      ];
      await pm.appendEvent(initSession);

      // Phase 4: Finalize
      initSession.phase = 'done';
      initSession.selectedApproach = 'a';
      initSession.updatedAt = '2026-02-06T11:00:00.000Z';
      await pm.appendEvent(initSession);
      await pm.writeMarkdownPlan(initSession, '# Lifecycle Plan\n\nContent');
      await pm.updateIndex(sessionId, {
        problem: 'Lifecycle test',
        createdAt: initSession.createdAt,
        finalizedAt: initSession.updatedAt,
        selectedBranch: 'a',
        phase: 'done',
        filePaths: {
          jsonl: `${sessionId}.jsonl`,
          markdown: `20260206-${sessionId}.md`,
        },
      });

      // Verify JSONL has 4 events
      const jsonlContent = await readFile(path.join(tempDir, `${sessionId}.jsonl`), 'utf8');
      const events = jsonlContent.trim().split('\n');
      expect(events).toHaveLength(4);

      // Verify Markdown exists
      const mdContent = await readFile(path.join(tempDir, `20260206-${sessionId}.md`), 'utf8');
      expect(mdContent).toBe('# Lifecycle Plan\n\nContent');

      // Verify index
      const index = await pm.readIndex();
      expect(index[sessionId]?.phase).toBe('done');
      expect(index[sessionId]?.finalizedAt).toBe('2026-02-06T11:00:00.000Z');

      // Verify retrieval via getPlan
      const mdResult = await pm.getPlan(sessionId, 'markdown');
      expect(mdResult.found).toBe(true);
      expect(mdResult.content).toBe('# Lifecycle Plan\n\nContent');

      const jsonlResult = await pm.getPlan(sessionId, 'jsonl');
      expect(jsonlResult.found).toBe(true);
      expect(jsonlResult.content).toContain('"phase":"init"');

      // Verify listing
      const plans = await pm.listPlans({ status: 'complete' });
      expect(plans).toHaveLength(1);
      expect(plans[0].problem).toBe('Lifecycle test');
    });
  });
});
