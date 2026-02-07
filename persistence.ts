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
import { readFileSync, readdirSync, existsSync } from 'node:fs';
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

// ─── Plans Index ─────────────────────────────────────────────────────────────

export interface PlanIndexEntry {
  problem: string;
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
   * Filename: YYYYMMDD-{sessionId}.md (date prefix for chronological sorting).
   * Fire-and-forget: errors are logged to stderr, never thrown.
   */
  public async writeMarkdownPlan(session: PlanningSession, markdownContent: string): Promise<void> {
    try {
      await this.ensureDir();
      const datePrefix = session.createdAt.slice(0, 10).replaceAll('-', '');
      const filename = `${datePrefix}-${session.sessionId}.md`;
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

  // ─── Query Tools ──────────────────────────────────────────────────────────

  /**
   * List saved plans from the index.
   * Supports optional filters: status, keyword in problem text.
   */
  public async listPlans(filters?: {
    status?: 'complete' | 'in-progress';
    keyword?: string;
  }): Promise<({ sessionId: string } & PlanIndexEntry)[]> {
    const index = await this.readIndex();
    let entries = Object.entries(index)
      .filter((pair): pair is [string, PlanIndexEntry] => pair[1] !== undefined)
      .map(([sessionId, entry]) => ({
        sessionId,
        ...entry,
      }));

    if (filters?.status) {
      entries =
        filters.status === 'complete'
          ? entries.filter((e) => e.phase === 'done')
          : entries.filter((e) => e.phase !== 'done');
    }

    if (filters?.keyword) {
      const lower = filters.keyword.toLowerCase();
      entries = entries.filter((e) => e.problem.toLowerCase().includes(lower));
    }

    // Sort by createdAt descending (newest first)
    entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return entries;
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
          const mdFilename = `${datePrefix}-${sessionId}.md`;
          const mdExists = existsSync(path.join(this.plansDir, mdFilename));

          index[sessionId] = {
            problem: firstEvent.session.problem,
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
}
