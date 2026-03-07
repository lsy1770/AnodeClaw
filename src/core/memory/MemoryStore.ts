/**
 * MemoryStore — 3-Layer Memory System
 *
 * Layer 1: Working Memory  (runtime LRU cache, max 20 entries)
 * Layer 2: Task State      ({memoryDir}/task-state.json, structured JSON)
 * Layer 3: Knowledge Base  ({memoryDir}/entries/{id}.json + index.json)
 *
 * Single search entry point: search() queries L2 + L3 and merges results.
 * Context injection: getRelevantContext(query) returns formatted string for system prompt.
 */

import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { MemoryIndex } from './MemoryIndex.js';
import type { MemoryEntry, TaskState, SearchQuery, SearchResult } from './types.js';

// Anode FileAPI — method names match FileAPI.kt @V8Function annotations exactly
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<void>;
  exists(path: string): boolean;               // sync — no await needed
  createDirectory(path: string): Promise<void>;
  listFiles(path: string): Promise<Array<{ name: string; path: string; isFile: boolean; isDirectory: boolean }>>;
  delete(path: string): Promise<void>;
};

export interface MemoryStoreConfig {
  memoryDir: string;
}

const LRU_MAX = 20;
const INDEX_FILE = 'index.json';
const TASK_STATE_FILE = 'task-state.json';
const ENTRIES_DIR = 'entries';

export class MemoryStore {
  private memoryDir: string;
  private entriesDir: string;
  private indexPath: string;
  private taskStatePath: string;

  // Layer 1: LRU cache (entry id → entry)
  private cache: Map<string, MemoryEntry> = new Map();
  // Layer 3 index
  private index: MemoryIndex = new MemoryIndex();
  private indexDirty = false;

  constructor(config: MemoryStoreConfig) {
    this.memoryDir   = config.memoryDir;
    this.entriesDir  = `${config.memoryDir}/${ENTRIES_DIR}`;
    this.indexPath   = `${config.memoryDir}/${INDEX_FILE}`;
    this.taskStatePath = `${config.memoryDir}/${TASK_STATE_FILE}`;
  }

  // ===========================================================
  // Lifecycle
  // ===========================================================

  async initialize(): Promise<void> {
    await this.ensureDirs();
    await this.loadIndex();
    logger.info(`[MemoryStore] Ready (${this.index.size} entries indexed)`);
  }

  private async ensureDirs(): Promise<void> {
    if (typeof file === 'undefined') return;
    try {
      if (!file.exists(this.memoryDir))  await file.createDirectory(this.memoryDir);
      if (!file.exists(this.entriesDir)) await file.createDirectory(this.entriesDir);
    } catch (err) {
      logger.warn('[MemoryStore] ensureDirs failed:', err);
    }
  }

  // ===========================================================
  // Layer 2: Task State
  // ===========================================================

  async saveTaskState(state: Omit<TaskState, 'checkpointId' | 'savedAt'>): Promise<TaskState> {
    const full: TaskState = {
      ...state,
      checkpointId: generateId('cp'),
      savedAt: Date.now(),
    };
    await this.writeJson(this.taskStatePath, full);
    logger.debug('[MemoryStore] Task state saved:', full.taskSummary.slice(0, 50));
    return full;
  }

  async loadTaskState(): Promise<TaskState | null> {
    return await this.readJson<TaskState>(this.taskStatePath);
  }

  // ===========================================================
  // Layer 3: Knowledge Base
  // ===========================================================

  /** Create a new memory entry */
  createEntry(
    title: string,
    content: string,
    options?: { tags?: string[]; importance?: 'low' | 'medium' | 'high' }
  ): MemoryEntry {
    return {
      id: generateId('mem'),
      title,
      content,
      tags: options?.tags ?? [],
      importance: options?.importance ?? 'medium',
      timestamp: Date.now(),
    };
  }

  /** Save a memory entry (Layer 3 + cache + index) */
  async save(entry: MemoryEntry): Promise<void> {
    await this.writeJson(`${this.entriesDir}/${entry.id}.json`, entry);
    this.cacheSet(entry);
    this.index.add(entry);
    this.indexDirty = true;
    await this.flushIndex();
    logger.debug(`[MemoryStore] Saved: "${entry.title}" [${entry.tags.join(', ')}]`);
  }

  /** Shortcut: create + save */
  async createMemory(
    title: string,
    content: string,
    options?: { tags?: string[]; importance?: 'low' | 'medium' | 'high' }
  ): Promise<MemoryEntry> {
    const entry = this.createEntry(title, content, options);
    await this.save(entry);
    return entry;
  }

  /** Load a single entry (cache → disk) */
  async load(id: string): Promise<MemoryEntry | null> {
    if (this.cache.has(id)) {
      const entry = this.cache.get(id)!;
      this.cacheSet({ ...entry, lastAccessed: Date.now() });
      return entry;
    }
    const entry = await this.readJson<MemoryEntry>(`${this.entriesDir}/${id}.json`);
    if (entry) this.cacheSet(entry);
    return entry;
  }

  /** Load all entries from disk */
  async loadAll(): Promise<MemoryEntry[]> {
    if (typeof file === 'undefined') return [];
    try {
      const files = await file.listFiles(this.entriesDir);
      const entries: MemoryEntry[] = [];
      for (const f of files) {
        if (!f.isFile || !f.name.endsWith('.json')) continue;
        const id = f.name.replace('.json', '');
        const entry = await this.load(id);
        if (entry) entries.push(entry);
      }
      return entries;
    } catch {
      return [];
    }
  }

  /** Delete a memory entry */
  async delete(id: string): Promise<boolean> {
    try {
      if (typeof file !== 'undefined') {
        await file.delete(`${this.entriesDir}/${id}.json`);
      }
      this.cache.delete(id);
      this.index.remove(id);
      this.indexDirty = true;
      await this.flushIndex();
      return true;
    } catch {
      return false;
    }
  }

  // ===========================================================
  // Search (L2 + L3 unified)
  // ===========================================================

  /** Search knowledge base by keyword + tags */
  async search(queryText: string, options?: { tags?: string[]; limit?: number; importance?: 'low' | 'medium' | 'high' }): Promise<SearchResult[]> {
    const limit = options?.limit ?? 5;
    const hits = this.index.search(queryText, options?.tags, limit * 2);

    const results: SearchResult[] = [];
    for (const hit of hits) {
      const entry = await this.load(hit.id);
      if (!entry) continue;
      if (options?.importance && entry.importance !== options.importance) continue;
      results.push({ entry, score: hit.score, matchedFields: hit.matchedFields });
    }

    return results.slice(0, limit);
  }

  /**
   * Get formatted context string for system prompt injection.
   * Searches L2 (task state) + L3 (knowledge base).
   */
  async getRelevantContext(query: string, limit = 5): Promise<string> {
    const parts: string[] = [];

    // L2: task state (always include if exists)
    try {
      const state = await this.loadTaskState();
      if (state) {
        const age = Math.round((Date.now() - state.savedAt) / 60000);
        parts.push(
          `### Current Task (checkpoint ${age}m ago)\n` +
          `**Task**: ${state.taskSummary}\n` +
          (state.requirements.length ? `**Requirements**: ${state.requirements.join('; ')}\n` : '') +
          (state.progress ? `**Progress**: ${state.progress}\n` : '') +
          (state.nextSteps.length ? `**Next**: ${state.nextSteps.join('; ')}\n` : '') +
          (Object.keys(state.importantFacts).length
            ? `**Facts**: ${Object.entries(state.importantFacts).map(([k, v]) => `${k}=${v}`).join(', ')}`
            : '')
        );
      }
    } catch { /* non-fatal */ }

    // L3: relevant knowledge
    try {
      const results = await this.search(query, { limit });
      if (results.length > 0) {
        const items = results.map(r =>
          `- **${r.entry.title}**: ${r.entry.content.slice(0, 300)}${r.entry.content.length > 300 ? '…' : ''}`
        ).join('\n');
        parts.push(`### Relevant Memories\n${items}`);
      }
    } catch { /* non-fatal */ }

    return parts.length > 0 ? parts.join('\n\n') : '';
  }

  // ===========================================================
  // Index persistence
  // ===========================================================

  private async loadIndex(): Promise<void> {
    const data = await this.readJson<ReturnType<MemoryIndex['serialize']>>(this.indexPath);
    if (data) {
      this.index.deserialize(data);
    } else {
      // Cold start: rebuild from disk
      const entries = await this.loadAll();
      this.index.rebuild(entries);
      await this.flushIndex();
    }
  }

  private async flushIndex(): Promise<void> {
    if (!this.indexDirty) return;
    await this.writeJson(this.indexPath, this.index.serialize());
    this.indexDirty = false;
  }

  // ===========================================================
  // LRU cache helpers
  // ===========================================================

  private cacheSet(entry: MemoryEntry): void {
    this.cache.delete(entry.id); // re-insert at end (most recently used)
    this.cache.set(entry.id, entry);
    if (this.cache.size > LRU_MAX) {
      // Evict oldest (first key in insertion-order Map)
      this.cache.delete(this.cache.keys().next().value!);
    }
  }

  // ===========================================================
  // File helpers
  // ===========================================================

  private async writeJson(path: string, data: unknown): Promise<void> {
    if (typeof file === 'undefined') return;
    await file.writeText(path, JSON.stringify(data, null, 2));
  }

  private async readJson<T>(path: string): Promise<T | null> {
    if (typeof file === 'undefined') return null;
    try {
      if (!file.exists(path)) return null;
      const text = await file.readText(path);
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }
}
