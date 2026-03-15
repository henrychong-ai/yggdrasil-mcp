import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deriveMarkdownFilename,
  extractMarkdownTitle,
  extractPlanName,
  generateId,
  PersistenceManager,
  type PlanIndexEntry,
  type PlansIndex,
  resolvePlansDirectory,
  toKebabCase,
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

// ─── toKebabCase ────────────────────────────────────────────────────────────

describe('toKebabCase', () => {
  it('should convert basic strings to kebab-case', () => {
    expect(toKebabCase('Auth Refactor')).toBe('auth-refactor');
  });

  it('should handle special characters', () => {
    expect(toKebabCase('Hello, World! (2026)')).toBe('hello-world-2026');
  });

  it('should collapse multiple hyphens', () => {
    expect(toKebabCase('foo---bar')).toBe('foo-bar');
  });

  it('should trim leading/trailing hyphens', () => {
    expect(toKebabCase('--hello--')).toBe('hello');
  });

  it('should enforce max length', () => {
    const long = 'a'.repeat(100);
    expect(toKebabCase(long, 10)).toHaveLength(10);
  });

  it('should return empty string for non-alphanum input', () => {
    expect(toKebabCase('!!!')).toBe('');
  });

  it('should handle already-kebab strings', () => {
    expect(toKebabCase('auth-refactor-plan')).toBe('auth-refactor-plan');
  });
});

// ─── deriveMarkdownFilename ─────────────────────────────────────────────────

describe('deriveMarkdownFilename', () => {
  it('should strip dp- prefix for descriptive session IDs', () => {
    expect(deriveMarkdownFilename('dp-20260315-auth-refactor', '20260315')).toBe(
      '20260315-auth-refactor.md'
    );
  });

  it('should keep dp- prefix for random session IDs', () => {
    expect(deriveMarkdownFilename('dp-kR3xT9vW', '20260315')).toBe('20260315-dp-kR3xT9vW.md');
  });
});

// ─── extractPlanName ────────────────────────────────────────────────────────

describe('extractPlanName', () => {
  it('should extract name from descriptive session ID', () => {
    expect(extractPlanName('dp-20260315-auth-refactor')).toBe('auth-refactor');
  });

  it('should return undefined for random session ID', () => {
    expect(extractPlanName('dp-kR3xT9vW')).toBeUndefined();
  });
});

// ─── extractMarkdownTitle ───────────────────────────────────────────────────

describe('extractMarkdownTitle', () => {
  it('should extract first heading from markdown file', async () => {
    const td = await mkdtemp(path.join(tmpdir(), 'ygg-title-'));
    await writeFile(path.join(td, 'test.md'), '# My Title\nContent');
    expect(extractMarkdownTitle(path.join(td, 'test.md'), 'fallback')).toBe('My Title');
    await rm(td, { recursive: true });
  });

  it('should fall back to first non-empty line when no heading', async () => {
    const td = await mkdtemp(path.join(tmpdir(), 'ygg-title-'));
    await writeFile(path.join(td, 'test.md'), 'No heading here\nJust text');
    expect(extractMarkdownTitle(path.join(td, 'test.md'), 'fallback')).toBe('No heading here');
    await rm(td, { recursive: true });
  });

  it('should return fallback for nonexistent file', () => {
    expect(extractMarkdownTitle('/nonexistent/path.md', 'fallback')).toBe('fallback');
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
      const result = await pm.listPlans();
      expect(result.total).toBe(3);
      expect(result.plans).toHaveLength(3);
      expect(result.plans[0].id).toBe('dp-session3');
      expect(result.plans[1].id).toBe('dp-session2');
      expect(result.plans[2].id).toBe('dp-session1');
    });

    it('should filter by status: complete', async () => {
      const result = await pm.listPlans({ status: 'complete' });
      expect(result.total).toBe(2);
      expect(result.plans.every((p) => p.phase === 'done')).toBe(true);
    });

    it('should filter by status: in-progress', async () => {
      const result = await pm.listPlans({ status: 'in-progress' });
      expect(result.total).toBe(1);
      expect(result.plans[0].id).toBe('dp-session2');
    });

    it('should filter by keyword', async () => {
      const result = await pm.listPlans({ keyword: 'cache' });
      expect(result.total).toBe(1);
      expect(result.plans[0].title).toContain('Cache layer');
    });

    it('should be case-insensitive for keyword search', async () => {
      const result = await pm.listPlans({ keyword: 'AUTH' });
      expect(result.total).toBe(1);
      expect(result.plans[0].title).toContain('Auth system');
    });

    it('should combine status and keyword filters', async () => {
      const result = await pm.listPlans({ status: 'complete', keyword: 'database' });
      expect(result.total).toBe(1);
      expect(result.plans[0].title).toContain('Database migration');
    });

    it('should return empty array when no plans match', async () => {
      const result = await pm.listPlans({ keyword: 'nonexistent' });
      expect(result.total).toBe(0);
      expect(result.plans).toHaveLength(0);
    });
  });

  // ─── sessionExists ─────────────────────────────────────────────────────

  describe('sessionExists', () => {
    it('should return true when session is in the index', async () => {
      await pm.updateIndex('dp-existing', makeIndexEntry());
      expect(pm.sessionExists('dp-existing')).toBe(true);
    });

    it('should return true when JSONL file exists on disk', async () => {
      const session = makeSession({ sessionId: 'dp-onDisk' });
      await pm.appendEvent(session);
      expect(pm.sessionExists('dp-onDisk')).toBe(true);
    });

    it('should return false when session does not exist', () => {
      expect(pm.sessionExists('dp-nonexistent')).toBe(false);
    });
  });

  // ─── writeMarkdownPlan (descriptive naming) ───────────────────────────

  describe('writeMarkdownPlan (descriptive naming)', () => {
    it('should write YYYYMMDD-name.md for descriptive session IDs', async () => {
      const session = makeSession({ sessionId: 'dp-20260315-auth-refactor' });
      await pm.writeMarkdownPlan(session, '# Auth Plan');
      const content = await readFile(path.join(tempDir, '20260315-auth-refactor.md'), 'utf8');
      expect(content).toBe('# Auth Plan');
    });

    it('should write YYYYMMDD-dp-random.md for random session IDs', async () => {
      const session = makeSession({ sessionId: 'dp-kR3xT9vW' });
      await pm.writeMarkdownPlan(session, '# Random Plan');
      const content = await readFile(path.join(tempDir, '20260206-dp-kR3xT9vW.md'), 'utf8');
      expect(content).toBe('# Random Plan');
    });
  });

  // ─── listPlans (pagination & CC orphans) ──────────────────────────────

  describe('listPlans (pagination & CC orphans)', () => {
    beforeEach(async () => {
      // Add 5 Yggdrasil plans
      for (let i = 1; i <= 5; i++) {
        await pm.updateIndex(
          `dp-session${i}`,
          makeIndexEntry({
            problem: `Plan ${i}`,
            createdAt: `2026-02-0${i}T10:00:00.000Z`,
            phase: i <= 3 ? 'done' : 'explore',
            finalizedAt: i <= 3 ? `2026-02-0${i}T11:00:00.000Z` : null,
          })
        );
      }
      // Add 2 CC orphan .md files
      await writeFile(path.join(tempDir, 'silly-walking-parrot.md'), '# Parrot Plan\nSome content');
      await writeFile(path.join(tempDir, 'jazzy-cuddling-cat.md'), '# Cat Plan\nMore content');
    });

    it('should paginate with limit and offset', async () => {
      const page1 = await pm.listPlans({ limit: 2, offset: 0 });
      expect(page1.total).toBe(5);
      expect(page1.plans).toHaveLength(2);
      expect(page1.limit).toBe(2);
      expect(page1.offset).toBe(0);

      const page2 = await pm.listPlans({ limit: 2, offset: 2 });
      expect(page2.plans).toHaveLength(2);
      expect(page2.offset).toBe(2);
    });

    it('should discover CC orphans with source=all', async () => {
      const result = await pm.listPlans({ source: 'all' });
      expect(result.total).toBe(7); // 5 Yggdrasil + 2 CC orphans
      const ccPlans = result.plans.filter((p) => p.source === 'cc');
      expect(ccPlans.length).toBe(2);
    });

    it('should only return CC orphans with source=cc', async () => {
      const result = await pm.listPlans({ source: 'cc' });
      expect(result.total).toBe(2);
      expect(result.plans.every((p) => p.source === 'cc')).toBe(true);
    });

    it('should extract title from CC orphan heading', async () => {
      const result = await pm.listPlans({ source: 'cc' });
      const titles = result.plans.map((p) => p.title);
      expect(titles).toContain('Parrot Plan');
      expect(titles).toContain('Cat Plan');
    });

    it('should extract date from mtime for CC orphans without date prefix', async () => {
      await writeFile(path.join(tempDir, 'no-date-prefix.md'), '# No Date');
      const result = await pm.listPlans({ source: 'cc', keyword: 'no date' });
      expect(result.total).toBe(1);
      // Date should be extracted from mtime (today's date approximately)
      expect(result.plans[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should apply keyword filter to CC orphans', async () => {
      const result = await pm.listPlans({ source: 'all', keyword: 'parrot' });
      expect(result.total).toBe(1);
      expect(result.plans[0].title).toBe('Parrot Plan');
    });

    it('should cap limit at 50', async () => {
      const result = await pm.listPlans({ limit: 100 });
      expect(result.limit).toBe(50);
    });
  });

  // ─── promotePlan ──────────────────────────────────────────────────────

  describe('promotePlan', () => {
    it('should rename CC orphan and add to index', async () => {
      await writeFile(path.join(tempDir, 'silly-walking-parrot.md'), '# Auth Refactor\nContent');

      const result = await pm.promotePlan('silly-walking-parrot.md', 'auth-refactor');
      expect(result.oldFilename).toBe('silly-walking-parrot.md');
      expect(result.newFilename).toMatch(/^\d{8}-auth-refactor\.md$/);
      expect(result.indexed).toBe(true);

      // Verify index entry
      const index = await pm.readIndex();
      const entry = Object.values(index).find((e) => e?.phase === 'promoted');
      expect(entry).toBeDefined();
      expect(entry?.problem).toBe('Auth Refactor');
      expect(entry?.name).toBe('auth-refactor');
    });

    it('should throw if file not found', async () => {
      await expect(pm.promotePlan('nonexistent.md', 'test')).rejects.toThrow('not found');
    });

    it('should throw if not a markdown file', async () => {
      await writeFile(path.join(tempDir, 'test.jsonl'), 'data');
      await expect(pm.promotePlan('test.jsonl', 'test')).rejects.toThrow('not a Markdown');
    });

    it('should throw if already tracked in index', async () => {
      await writeFile(path.join(tempDir, 'tracked.md'), '# Tracked');
      await pm.updateIndex(
        'dp-tracked',
        makeIndexEntry({ filePaths: { jsonl: 'dp-tracked.jsonl', markdown: 'tracked.md' } })
      );
      await expect(pm.promotePlan('tracked.md', 'new-name')).rejects.toThrow('already tracked');
    });

    it('should throw if target filename already exists', async () => {
      await writeFile(path.join(tempDir, 'orphan.md'), '# Orphan');
      // Create a file that would collide
      const stat = await import('node:fs').then((m) => m.statSync(path.join(tempDir, 'orphan.md')));
      const datePrefix = stat.mtime.toISOString().slice(0, 10).replaceAll('-', '');
      await writeFile(path.join(tempDir, `${datePrefix}-my-name.md`), '# Existing');

      await expect(pm.promotePlan('orphan.md', 'my-name')).rejects.toThrow('already exists');
    });

    it('should throw if name sanitizes to empty', async () => {
      await writeFile(path.join(tempDir, 'orphan2.md'), '# Test');
      await expect(pm.promotePlan('orphan2.md', '!!!')).rejects.toThrow('empty string');
    });
  });

  // ─── archivePlans ─────────────────────────────────────────────────────

  describe('archivePlans', () => {
    beforeEach(async () => {
      // Create indexed plans with files
      const session1 = makeSession({ sessionId: 'dp-old1', createdAt: '2025-06-01T10:00:00.000Z' });
      await pm.appendEvent(session1);
      await pm.writeMarkdownPlan(session1, '# Old Plan 1');
      await pm.updateIndex(
        'dp-old1',
        makeIndexEntry({
          problem: 'Old plan 1',
          createdAt: '2025-06-01T10:00:00.000Z',
          phase: 'done',
          filePaths: { jsonl: 'dp-old1.jsonl', markdown: '20250601-dp-old1.md' },
        })
      );

      const session2 = makeSession({ sessionId: 'dp-new1', createdAt: '2026-03-01T10:00:00.000Z' });
      await pm.appendEvent(session2);
      await pm.updateIndex(
        'dp-new1',
        makeIndexEntry({
          problem: 'New plan 1',
          createdAt: '2026-03-01T10:00:00.000Z',
          phase: 'init',
          filePaths: { jsonl: 'dp-new1.jsonl', markdown: null },
        })
      );
    });

    it('should dry run by default (preview without moving)', async () => {
      const result = await pm.archivePlans({ olderThan: 30 });
      expect(result.dryRun).toBe(true);
      expect(result.archived.length).toBeGreaterThan(0);
      // Files should still exist in original location
      const { existsSync } = await import('node:fs');
      expect(existsSync(path.join(tempDir, 'dp-old1.jsonl'))).toBe(true);
    });

    it('should move files to archive/YYYY/ when dryRun=false', async () => {
      const result = await pm.archivePlans({ olderThan: 30, dryRun: false });
      expect(result.dryRun).toBe(false);
      expect(result.archived.length).toBeGreaterThan(0);

      const { existsSync } = await import('node:fs');
      // Old files moved
      expect(existsSync(path.join(tempDir, 'dp-old1.jsonl'))).toBe(false);
      expect(existsSync(path.join(tempDir, 'archive', '2025', 'dp-old1.jsonl'))).toBe(true);
      // New files not moved
      expect(existsSync(path.join(tempDir, 'dp-new1.jsonl'))).toBe(true);
    });

    it('should remove archived entries from index', async () => {
      await pm.archivePlans({ olderThan: 30, dryRun: false });
      const index = await pm.readIndex();
      expect(index['dp-old1']).toBeUndefined();
      expect(index['dp-new1']).toBeDefined();
    });

    it('should archive specific sessions by ID', async () => {
      const result = await pm.archivePlans({ sessionIds: ['dp-new1'], dryRun: false });
      expect(result.archived).toHaveLength(1);
      expect(result.archived[0].sessionId).toBe('dp-new1');
    });

    it('should skip sessions not found in index', async () => {
      const result = await pm.archivePlans({ sessionIds: ['dp-nonexistent'] });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toContain('not found');
    });

    it('should filter by source when archiving', async () => {
      // Add a promoted plan
      await pm.updateIndex(
        'promoted-20250601-old-promo',
        makeIndexEntry({
          problem: 'Promoted plan',
          createdAt: '2025-06-01T10:00:00.000Z',
          phase: 'promoted',
          filePaths: { jsonl: '', markdown: '20250601-old-promo.md' },
        })
      );
      await writeFile(path.join(tempDir, '20250601-old-promo.md'), '# Promoted');

      // Archive only promoted plans
      const result = await pm.archivePlans({ source: 'promoted', dryRun: true });
      expect(result.archived.every((a) => a.sessionId.startsWith('promoted-'))).toBe(true);
    });

    it('should skip sessions with no files on disk', async () => {
      await pm.updateIndex(
        'dp-ghost',
        makeIndexEntry({
          problem: 'Ghost',
          createdAt: '2025-01-01T10:00:00.000Z',
          filePaths: { jsonl: 'dp-ghost.jsonl', markdown: null },
        })
      );
      const result = await pm.archivePlans({ sessionIds: ['dp-ghost'] });
      expect(result.skipped).toHaveLength(1);
      expect(result.skipped[0]).toContain('no files');
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
      const result = await pm.listPlans({ status: 'complete' });
      expect(result.total).toBe(1);
      expect(result.plans[0].title).toContain('Lifecycle test');
    });
  });
});
