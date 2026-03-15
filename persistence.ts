/**
 * Persistence layer for deep_planning sessions.
 *
 * Implements hybrid JSONL event log + Markdown export with a lightweight JSON index.
 * Zero external dependencies — uses only Node.js built-ins (node:crypto, node:fs, node:path, node:os).
 *
 * Storage location resolves from Claude Code's plansDirectory setting:
 * 1. YGGDRASIL_PLANS_DIR env var (explicit override)
 * 2. Project .claude/settings.json → plansDirectory
 * 3. ~/.claude.json → plansDirectory
 * 4. ~/.claude/plans/ (CC default fallback)
 */

import { randomBytes } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { appendFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';

import type { PlanningSession } from './planning.js';

// ─── Base62 ID Generation ────────────────────────────────────────────────────

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically random Base62 string.
 * Uses node:crypto (zero deps). 8 chars = 47.6 bits of entropy (~218 trillion combinations).
 * Modulo bias is 0.8% — negligible for session IDs.
 */
export function generateId(size = 8): string {
  return Array.from(randomBytes(size), (b) => BASE62[b % 62]).join('');
}

// ─── Kebab-Case Sanitization ────────────────────────────────────────────────

/**
 * Sanitize a string to kebab-case for use in filenames.
 * Lowercase, strip non-alphanum except hyphens, collapse multiples, trim, max 60 chars.
 */
export function toKebabCase(input: string, maxLength = 60): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-\s]/g, '')
    .replace(/[\s]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
}

/** Regex to detect descriptive session IDs: dp-YYYYMMDD-{name} */
export const DESCRIPTIVE_SESSION_RE = /^dp-\d{8}-/;

/**
 * Derive the Markdown export filename from a session ID.
 * Descriptive: dp-YYYYMMDD-name → YYYYMMDD-name.md (strip dp- prefix)
 * Random:      dp-kR3xT9vW     → YYYYMMDD-dp-kR3xT9vW.md (legacy behavior)
 */
export function deriveMarkdownFilename(sessionId: string, datePrefix: string): string {
  return DESCRIPTIVE_SESSION_RE.test(sessionId)
    ? `${sessionId.slice(3)}.md`
    : `${datePrefix}-${sessionId}.md`;
}

// ─── Plans Index ─────────────────────────────────────────────────────────────

export interface PlanIndexEntry {
  problem: string;
  name?: string;
  createdAt: string;
  finalizedAt: string | null;
  selectedBranch: string | null;
  phase: string;
  filePaths: {
    jsonl: string;
    markdown: string | null;
  };
}

export type PlansIndex = Partial<Record<string, PlanIndexEntry>>;

// ─── Directory Resolution ────────────────────────────────────────────────────

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    const content = readFileSync(filePath, 'utf8');
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Resolve the plans directory following Claude Code's plansDirectory convention.
 *
 * Resolution order:
 * 1. YGGDRASIL_PLANS_DIR env var (explicit override, highest priority)
 * 2. Project .claude/settings.json → plansDirectory (repo-local CC setting)
 * 3. ~/.claude.json → plansDirectory (global CC setting)
 * 4. ~/.claude/plans/ (CC default fallback)
 */
export function resolvePlansDirectory(projectRoot?: string): string {
  // 1. Env var override
  const envDir = process.env.YGGDRASIL_PLANS_DIR;
  if (envDir) return envDir;

  // 2. Project-level CC setting
  if (projectRoot) {
    const projectSettings = readJsonSafe(path.join(projectRoot, '.claude', 'settings.json'));
    const plansDir = projectSettings?.plansDirectory;
    if (typeof plansDir === 'string') {
      return path.resolve(projectRoot, plansDir);
    }
  }

  // 3. Global CC setting
  const globalConfig = readJsonSafe(path.join(homedir(), '.claude.json'));
  const globalPlansDir = globalConfig?.plansDirectory;
  if (typeof globalPlansDir === 'string') return globalPlansDir;

  // 4. CC default
  return path.join(homedir(), '.claude', 'plans');
}

// ─── Persistence Manager ─────────────────────────────────────────────────────

const INDEX_FILENAME = 'yggdrasil-plans-index.json';

export class PersistenceManager {
  private plansDir: string;
  private dirCreated = false;
  private pendingWrites: Promise<void>[] = [];

  constructor(projectRoot?: string) {
    this.plansDir = resolvePlansDirectory(projectRoot);
  }

  /** Ensure the plans directory exists. Called lazily on first write. */
  private async ensureDir(): Promise<void> {
    if (this.dirCreated) return;
    await mkdir(this.plansDir, { recursive: true });
    this.dirCreated = true;
  }

  /** Get the resolved plans directory path. */
  public getPlansDir(): string {
    return this.plansDir;
  }

  /**
   * Check if a session ID already exists (in index or on disk as JSONL).
   * Synchronous to avoid converting handleInit to async.
   */
  public sessionExists(sessionId: string): boolean {
    try {
      const content = readFileSync(path.join(this.plansDir, INDEX_FILENAME), 'utf8');
      const index = JSON.parse(content) as PlansIndex;
      if (index[sessionId]) return true;
    } catch {
      /* index missing/corrupt — fall through to file check */
    }
    return existsSync(path.join(this.plansDir, `${sessionId}.jsonl`));
  }

  /**
   * Track a fire-and-forget write promise.
   * Tracked writes are awaited by flush() before session loads.
   */
  public track(p: Promise<void>): void {
    this.pendingWrites.push(p);
    const cleanup = (): undefined => {
      this.pendingWrites = this.pendingWrites.filter((w) => w !== p);
      return undefined;
    };
    void p.then(cleanup, cleanup);
  }

  /** Await all pending fire-and-forget writes. */
  public async flush(): Promise<void> {
    await Promise.allSettled(this.pendingWrites);
    this.pendingWrites = [];
  }

  // ─── JSONL Event Writer ──────────────────────────────────────────────────

  /**
   * Append a JSONL event line for the current session state.
   * Fire-and-forget: errors are logged to stderr, never thrown.
   */
  public async appendEvent(session: PlanningSession): Promise<void> {
    try {
      await this.ensureDir();
      const event = {
        timestamp: new Date().toISOString(),
        phase: session.phase,
        session,
      };
      const line = JSON.stringify(event) + '\n';
      await appendFile(path.join(this.plansDir, `${session.sessionId}.jsonl`), line, 'utf8');
    } catch (error) {
      console.error(
        `[yggdrasil] Failed to write JSONL event: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ─── Markdown Export ──────────────────────────────────────────────────────

  /**
   * Write the rendered Markdown plan to disk.
   * Descriptive sessions: YYYYMMDD-{name}.md (clean, no dp- prefix).
   * Random sessions: YYYYMMDD-dp-{random}.md (legacy behavior).
   * Fire-and-forget: errors are logged to stderr, never thrown.
   */
  public async writeMarkdownPlan(session: PlanningSession, markdownContent: string): Promise<void> {
    try {
      await this.ensureDir();
      const datePrefix = session.createdAt.slice(0, 10).replaceAll('-', '');
      const filename = deriveMarkdownFilename(session.sessionId, datePrefix);
      await writeFile(path.join(this.plansDir, filename), markdownContent, 'utf8');
    } catch (error) {
      console.error(
        `[yggdrasil] Failed to write Markdown plan: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // ─── Plans Index ──────────────────────────────────────────────────────────

  private get indexPath(): string {
    return path.join(this.plansDir, INDEX_FILENAME);
  }

  /** Read the plans index from disk. Returns empty object on failure. */
  public async readIndex(): Promise<PlansIndex> {
    try {
      const content = await readFile(this.indexPath, 'utf8');
      return JSON.parse(content) as PlansIndex;
    } catch {
      return {};
    }
  }

  /**
   * Write the plans index atomically (write to tmp, then rename).
   * Fire-and-forget: errors are logged to stderr, never thrown.
   */
  private async writeIndex(index: PlansIndex): Promise<void> {
    try {
      await this.ensureDir();
      const tmpPath = `${this.indexPath}.tmp`;
      await writeFile(tmpPath, JSON.stringify(index, null, 2) + '\n', 'utf8');
      await rename(tmpPath, this.indexPath);
    } catch (error) {
      console.error(
        `[yggdrasil] Failed to write plans index: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Add or update an entry in the plans index.
   * Called on init (create entry) and finalize (mark complete).
   */
  public async updateIndex(sessionId: string, entry: PlanIndexEntry): Promise<void> {
    const index = await this.readIndex();
    index[sessionId] = entry;
    await this.writeIndex(index);
  }

  // ─── Session Loading ────────────────────────────────────────────────────

  /**
   * Load a planning session from its JSONL event log.
   * Reads the last event line and returns the full session object.
   * Returns null if the session file doesn't exist or is corrupted.
   */
  public async loadSession(sessionId: string): Promise<PlanningSession | null> {
    try {
      // Ensure any fire-and-forget writes are flushed before reading
      await this.flush();
      const filePath = path.join(this.plansDir, `${sessionId}.jsonl`);
      const content = await readFile(filePath, 'utf8');
      const lines = content.trim().split('\n');
      const lastLine = lines.at(-1);
      if (!lastLine) return null;

      const event = JSON.parse(lastLine) as { session: PlanningSession };
      return event.session;
    } catch {
      return null;
    }
  }

  // ─── Query Tools ──────────────────────────────────────────────────────────

  /** Unified plan entry returned by listPlans. */
  public static readonly PLAN_SOURCES = ['yggdrasil', 'cc', 'promoted'] as const;

  /**
   * Scan for .md files in the plans directory not tracked in the Yggdrasil index (CC orphans).
   * Reads first 1KB of each file to extract a title from the first heading.
   */
  private scanCCOrphans(index: PlansIndex): Array<{
    filename: string;
    title: string;
    date: string;
    source: 'cc';
  }> {
    try {
      const files = readdirSync(this.plansDir);

      // Build set of all tracked markdown filenames
      const trackedMd = new Set<string>();
      for (const entry of Object.values(index)) {
        if (entry?.filePaths.markdown) {
          trackedMd.add(entry.filePaths.markdown);
        }
      }

      const orphans: Array<{ filename: string; title: string; date: string; source: 'cc' }> = [];

      for (const file of files) {
        if (!file.endsWith('.md') || trackedMd.has(file)) continue;

        try {
          const content = readFileSync(path.join(this.plansDir, file), {
            encoding: 'utf8',
          }).slice(0, 1024);

          // Extract title: first # heading or first non-empty line
          const headingMatch = content.match(/^#\s+(.+)$/m);
          const title = headingMatch
            ? headingMatch[1].trim()
            : (content.split('\n').find((l) => l.trim()) ?? file);

          // Extract date from YYYYMMDD- filename prefix or file mtime
          const dateMatch = file.match(/^(\d{8})-/);
          let date: string;
          if (dateMatch) {
            date = `${dateMatch[1].slice(0, 4)}-${dateMatch[1].slice(4, 6)}-${dateMatch[1].slice(6, 8)}`;
          } else {
            try {
              date = statSync(path.join(this.plansDir, file)).mtime.toISOString().slice(0, 10);
            } catch {
              date = new Date().toISOString().slice(0, 10);
            }
          }

          orphans.push({ filename: file, title, date, source: 'cc' });
        } catch {
          // Skip unreadable files
        }
      }

      return orphans.sort((a, b) => b.date.localeCompare(a.date));
    } catch {
      return [];
    }
  }

  /**
   * List saved plans with unified view of Yggdrasil plans and CC orphans.
   * Supports filters: status, keyword, source, and pagination via limit/offset.
   */
  public async listPlans(filters?: {
    status?: 'complete' | 'in-progress';
    keyword?: string;
    source?: 'yggdrasil' | 'cc' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<{
    total: number;
    offset: number;
    limit: number;
    plans: Array<{
      id: string;
      source: 'yggdrasil' | 'cc' | 'promoted';
      title: string;
      date: string;
      phase?: string;
      name?: string;
      filePaths?: { jsonl: string; markdown: string | null };
    }>;
  }> {
    const source = filters?.source ?? 'yggdrasil';
    const limit = Math.min(Math.max(filters?.limit ?? 20, 1), 50);
    const offset = Math.max(filters?.offset ?? 0, 0);
    const index = await this.readIndex();

    type PlanEntry = {
      id: string;
      source: 'yggdrasil' | 'cc' | 'promoted';
      title: string;
      date: string;
      phase?: string;
      name?: string;
      filePaths?: { jsonl: string; markdown: string | null };
      /** Full ISO timestamp for stable sorting. Not included in output. */
      _sortKey: string;
    };

    let allPlans: PlanEntry[] = [];

    // Yggdrasil plans from index
    if (source === 'yggdrasil' || source === 'all') {
      const yggEntries = Object.entries(index)
        .filter((pair): pair is [string, PlanIndexEntry] => pair[1] !== undefined)
        .map(([sessionId, entry]) => ({
          id: sessionId,
          source: (entry.phase === 'promoted' ? 'promoted' : 'yggdrasil') as
            | 'yggdrasil'
            | 'promoted',
          title: entry.name ?? entry.problem,
          date: entry.createdAt.slice(0, 10),
          phase: entry.phase,
          name: entry.name,
          filePaths: entry.filePaths,
          _sortKey: entry.createdAt,
        }));

      // Apply status filter (Yggdrasil only)
      if (filters?.status) {
        const filtered =
          filters.status === 'complete'
            ? yggEntries.filter((e) => e.phase === 'done')
            : yggEntries.filter((e) => e.phase !== 'done');
        allPlans.push(...filtered);
      } else {
        allPlans.push(...yggEntries);
      }
    }

    // CC orphans
    if (source === 'cc' || source === 'all') {
      const orphans = this.scanCCOrphans(index);
      allPlans.push(
        ...orphans.map((o) => ({
          id: o.filename,
          source: 'cc' as const,
          title: o.title,
          date: o.date,
          _sortKey: `${o.date}T00:00:00.000Z`,
        }))
      );
    }

    // Keyword filter
    if (filters?.keyword) {
      const lower = filters.keyword.toLowerCase();
      allPlans = allPlans.filter((e) => e.title.toLowerCase().includes(lower));
    }

    // Sort by full timestamp descending (newest first)
    allPlans.sort((a, b) => b._sortKey.localeCompare(a._sortKey));

    const total = allPlans.length;
    const paginated = allPlans.slice(offset, offset + limit);

    // Strip internal _sortKey from output
    return {
      total,
      offset,
      limit,
      plans: paginated.map(({ _sortKey: _, ...rest }) => rest),
    };
  }

  /**
   * Get a specific saved plan by sessionId.
   * Returns JSONL events or Markdown content based on format parameter.
   */
  public async getPlan(
    sessionId: string,
    format: 'jsonl' | 'markdown' = 'markdown'
  ): Promise<{ found: boolean; content: string; format: string }> {
    const index = await this.readIndex();
    const entry = index[sessionId];

    if (!entry) {
      return { found: false, content: `No plan found with sessionId "${sessionId}".`, format };
    }

    try {
      if (format === 'jsonl') {
        const content = await readFile(path.join(this.plansDir, entry.filePaths.jsonl), 'utf8');
        return { found: true, content, format: 'jsonl' };
      }

      if (entry.filePaths.markdown) {
        const content = await readFile(path.join(this.plansDir, entry.filePaths.markdown), 'utf8');
        return { found: true, content, format: 'markdown' };
      }

      // Markdown not available (session not finalized), fall back to JSONL
      const content = await readFile(path.join(this.plansDir, entry.filePaths.jsonl), 'utf8');
      return { found: true, content, format: 'jsonl' };
    } catch (error) {
      return {
        found: false,
        content: `Failed to read plan file: ${error instanceof Error ? error.message : String(error)}`,
        format,
      };
    }
  }

  /**
   * Rebuild the plans index by scanning JSONL files in the plans directory.
   * Used as a fallback when the index is corrupted or missing.
   */
  public async rebuildIndex(): Promise<PlansIndex> {
    try {
      const files = readdirSync(this.plansDir).filter((f) => f.endsWith('.jsonl'));
      const index: PlansIndex = {};

      for (const file of files) {
        try {
          const content = readFileSync(path.join(this.plansDir, file), 'utf8');
          const lines = content.trim().split('\n');
          if (lines.length === 0) continue;

          // Parse first line for init data
          const firstEvent = JSON.parse(lines[0]) as {
            session: PlanningSession;
          };
          // Parse last line for current state
          const lastLine = lines.at(-1);
          if (!lastLine) continue;
          const lastEvent = JSON.parse(lastLine) as {
            session: PlanningSession;
          };

          const sessionId = firstEvent.session.sessionId;
          const datePrefix = firstEvent.session.createdAt.slice(0, 10).replaceAll('-', '');
          const mdFilename = deriveMarkdownFilename(sessionId, datePrefix);
          const mdExists = existsSync(path.join(this.plansDir, mdFilename));

          // Extract name from descriptive sessionId (dp-YYYYMMDD-{name})
          const nameMatch = sessionId.match(/^dp-\d{8}-(.+)$/);

          index[sessionId] = {
            problem: firstEvent.session.problem,
            name: nameMatch ? nameMatch[1] : undefined,
            createdAt: firstEvent.session.createdAt,
            finalizedAt: lastEvent.session.phase === 'done' ? lastEvent.session.updatedAt : null,
            selectedBranch: lastEvent.session.selectedApproach ?? null,
            phase: lastEvent.session.phase,
            filePaths: {
              jsonl: file,
              markdown: mdExists ? mdFilename : null,
            },
          };
        } catch {
          // Skip corrupted files
          console.error(`[yggdrasil] Skipping corrupted JSONL file: ${file}`);
        }
      }

      await this.writeIndex(index);
      return index;
    } catch (error) {
      console.error(
        `[yggdrasil] Failed to rebuild index: ${error instanceof Error ? error.message : String(error)}`
      );
      return {};
    }
  }

  // ─── Plan Promotion ──────────────────────────────────────────────────────

  /**
   * Promote a CC-generated .md plan file: rename to YYYYMMDD-{name}.md and add to index.
   * Throws on validation errors (file not found, already tracked, collision).
   */
  public async promotePlan(
    filename: string,
    name: string
  ): Promise<{ oldFilename: string; newFilename: string; indexed: boolean }> {
    const filePath = path.join(this.plansDir, filename);

    if (!existsSync(filePath)) {
      throw new Error(`File "${filename}" not found in plans directory.`);
    }

    if (!filename.endsWith('.md')) {
      throw new Error(`File "${filename}" is not a Markdown file.`);
    }

    // Check not already in index
    const index = await this.readIndex();
    for (const entry of Object.values(index)) {
      if (entry?.filePaths.markdown === filename) {
        throw new Error(`File "${filename}" is already tracked in the Yggdrasil index.`);
      }
    }

    const kebabName = toKebabCase(name);
    if (!kebabName) {
      throw new Error('Name results in empty string after sanitization.');
    }

    // Get date from file mtime
    const stat = statSync(filePath);
    const datePrefix = stat.mtime.toISOString().slice(0, 10).replaceAll('-', '');

    const newFilename = `${datePrefix}-${kebabName}.md`;
    const newFilePath = path.join(this.plansDir, newFilename);

    // Collision check
    if (newFilename !== filename && existsSync(newFilePath)) {
      throw new Error(`Target filename "${newFilename}" already exists. Choose a different name.`);
    }

    // Extract title from first heading
    const content = readFileSync(filePath, 'utf8').slice(0, 1024);
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const problem = headingMatch ? headingMatch[1].trim() : kebabName;

    // Rename file
    if (newFilename !== filename) {
      await rename(filePath, newFilePath);
    }

    // Add to index
    const sessionId = `promoted-${datePrefix}-${kebabName}`;
    await this.updateIndex(sessionId, {
      problem,
      name: kebabName,
      createdAt: stat.mtime.toISOString(),
      finalizedAt: stat.mtime.toISOString(),
      selectedBranch: null,
      phase: 'promoted',
      filePaths: {
        jsonl: '',
        markdown: newFilename,
      },
    });

    return { oldFilename: filename, newFilename, indexed: true };
  }

  // ─── Plan Archiving ──────────────────────────────────────────────────────

  /**
   * Archive old plan files by moving them to archive/YYYY/ subdirectory.
   * Removes archived entries from the index. Default mode is dry run (preview only).
   */
  public async archivePlans(options: {
    olderThan?: number;
    sessionIds?: string[];
    source?: 'yggdrasil' | 'cc' | 'promoted' | 'all';
    dryRun?: boolean;
  }): Promise<{
    dryRun: boolean;
    archived: Array<{ sessionId: string; files: string[]; year: string }>;
    skipped: string[];
    totalFiles: number;
  }> {
    const dryRun = options.dryRun ?? true;
    const archived: Array<{ sessionId: string; files: string[]; year: string }> = [];
    const skipped: string[] = [];

    const index = await this.readIndex();
    const cutoffDate = options.olderThan
      ? new Date(Date.now() - options.olderThan * 86_400_000)
      : null;

    // Determine which entries to archive
    const candidates: Array<{ sessionId: string; entry: PlanIndexEntry }> = [];

    if (options.sessionIds) {
      for (const sid of options.sessionIds) {
        const entry = index[sid];
        if (entry) {
          candidates.push({ sessionId: sid, entry });
        } else {
          skipped.push(`${sid}: not found in index`);
        }
      }
    } else {
      for (const [sessionId, entry] of Object.entries(index)) {
        if (!entry) continue;

        // Source filter
        if (options.source && options.source !== 'all') {
          const entrySource = entry.phase === 'promoted' ? 'promoted' : 'yggdrasil';
          if (options.source !== entrySource) continue;
        }

        // Age filter
        if (cutoffDate && new Date(entry.createdAt) >= cutoffDate) continue;

        candidates.push({ sessionId, entry });
      }
    }

    let totalFiles = 0;

    for (const { sessionId, entry } of candidates) {
      const year = entry.createdAt.slice(0, 4);
      const archiveDir = path.join(this.plansDir, 'archive', year);
      const files: string[] = [];

      // Collect files to move
      if (entry.filePaths.jsonl) {
        const src = path.join(this.plansDir, entry.filePaths.jsonl);
        if (existsSync(src)) files.push(entry.filePaths.jsonl);
      }
      if (entry.filePaths.markdown) {
        const src = path.join(this.plansDir, entry.filePaths.markdown);
        if (existsSync(src)) files.push(entry.filePaths.markdown);
      }

      if (files.length === 0) {
        skipped.push(`${sessionId}: no files found on disk`);
        continue;
      }

      if (!dryRun) {
        await mkdir(archiveDir, { recursive: true });
        for (const file of files) {
          await rename(path.join(this.plansDir, file), path.join(archiveDir, file));
        }
        delete index[sessionId];
      }

      totalFiles += files.length;
      archived.push({ sessionId, files, year });
    }

    if (!dryRun && archived.length > 0) {
      await this.writeIndex(index);
    }

    return { dryRun, archived, skipped, totalFiles };
  }
}
