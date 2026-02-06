/**
 * Semantic Memory
 *
 * Orchestration layer over VectorIndex — indexes MemoryEntries, DailyLogs,
 * and session summaries for system prompt enrichment via TF-IDF similarity search.
 */

import { logger } from '../../utils/logger.js';
import { VectorIndex } from './VectorIndex.js';
import type { MemorySystem } from './MemorySystem.js';
import type { DailyLogManager, DailyLog } from './DailyLogManager.js';

/**
 * Source record for a search hit
 */
export interface ContextSource {
  id: string;
  type: 'memory' | 'daily-log' | 'session-summary';
  score: number;
  snippet: string;
}

/**
 * Formatted context ready for system prompt injection
 */
export interface RelevantContext {
  /** Formatted string to inject into system prompt */
  content: string;
  /** Sources that contributed to the context */
  sources: ContextSource[];
}

/**
 * SemanticMemory configuration
 */
export interface SemanticMemoryConfig {
  /** Maximum character length of the assembled context string */
  maxContextLength: number;
  /** Maximum number of results to consider */
  maxResults: number;
  /** Minimum similarity score (0–1) */
  minScore: number;
  /** Number of recent daily log days to index */
  dailyLogDays: number;
}

const DEFAULT_CONFIG: SemanticMemoryConfig = {
  maxContextLength: 2000,
  maxResults: 5,
  minScore: 0.05,
  dailyLogDays: 30,
};

/**
 * SemanticMemory Class
 */
export class SemanticMemory {
  private memorySystem: MemorySystem;
  private dailyLogManager: DailyLogManager;
  private config: SemanticMemoryConfig;
  private index: VectorIndex;
  private initialized = false;

  /**
   * Map of indexed document IDs to their type (for source tracking)
   */
  private docTypes: Map<string, 'memory' | 'daily-log' | 'session-summary'> = new Map();

  /**
   * Map of indexed document IDs to a snippet of their content
   */
  private docSnippets: Map<string, string> = new Map();

  /**
   * Map of indexed document IDs to their title
   */
  private docTitles: Map<string, string> = new Map();

  constructor(
    memorySystem: MemorySystem,
    dailyLogManager: DailyLogManager,
    config?: Partial<SemanticMemoryConfig>,
  ) {
    this.memorySystem = memorySystem;
    this.dailyLogManager = dailyLogManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.index = new VectorIndex();
  }

  /**
   * Build the initial index from all available sources
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.rebuildIndex();
      this.initialized = true;
      logger.info(`[SemanticMemory] Initialized with ${this.index.size} documents`);
    } catch (err) {
      logger.warn('[SemanticMemory] Initialization failed (will lazy-init later):', err);
    }
  }

  /**
   * Query the index and return formatted context for system prompt injection
   */
  async getRelevantContext(query: string, limit?: number): Promise<RelevantContext> {
    if (!this.initialized) {
      await this.initialize();
    }

    const maxResults = limit ?? this.config.maxResults;
    const hits = this.index.search(query, maxResults, this.config.minScore);

    if (hits.length === 0) {
      return { content: '', sources: [] };
    }

    const sources: ContextSource[] = [];
    const parts: string[] = [];
    let totalLength = 0;

    parts.push('## Relevant Memories');

    for (const hit of hits) {
      const type = this.docTypes.get(hit.id) || 'memory';
      const snippet = this.docSnippets.get(hit.id) || '';
      const title = this.docTitles.get(hit.id) || hit.id;
      const pct = Math.round(hit.score * 100);

      const section = `### ${title} (relevance: ${pct}%)\n${snippet}`;

      // Respect max context length
      if (totalLength + section.length > this.config.maxContextLength) {
        // Try to fit a truncated version
        const remaining = this.config.maxContextLength - totalLength;
        if (remaining > 60) {
          parts.push(section.slice(0, remaining) + '...');
          sources.push({ id: hit.id, type, score: hit.score, snippet: snippet.slice(0, 100) });
        }
        break;
      }

      parts.push(section);
      totalLength += section.length;
      sources.push({ id: hit.id, type, score: hit.score, snippet: snippet.slice(0, 100) });
    }

    return {
      content: parts.join('\n'),
      sources,
    };
  }

  /**
   * Add a single document to the index
   */
  async addToIndex(id: string, content: string, type: 'memory' | 'daily-log' | 'session-summary', title?: string): Promise<void> {
    this.index.add(id, content);
    this.docTypes.set(id, type);
    this.docSnippets.set(id, content.slice(0, 300));
    this.docTitles.set(id, title || id);
  }

  /**
   * Remove a document from the index
   */
  removeFromIndex(id: string): void {
    this.index.remove(id);
    this.docTypes.delete(id);
    this.docSnippets.delete(id);
    this.docTitles.delete(id);
  }

  /**
   * Rebuild the entire index from scratch
   */
  async rebuildIndex(): Promise<void> {
    this.index.clear();
    this.docTypes.clear();
    this.docSnippets.clear();
    this.docTitles.clear();

    // 1. Index all MemoryEntry files
    try {
      const memories = await this.memorySystem.loadAllMemories();
      for (const mem of memories) {
        const text = `${mem.title} ${mem.tags.join(' ')} ${mem.content}`;
        await this.addToIndex(`memory:${mem.id}`, text, 'memory', mem.title);
      }
      logger.debug(`[SemanticMemory] Indexed ${memories.length} memory entries`);
    } catch (err) {
      logger.warn('[SemanticMemory] Failed to index memory entries:', err);
    }

    // 2. Index recent daily logs
    try {
      const recentLogs = await this.dailyLogManager.getRecentLogs(this.config.dailyLogDays);
      for (const log of recentLogs) {
        const text = this.summarizeDailyLog(log);
        if (text.length > 10) {
          await this.addToIndex(`daily:${log.date}`, text, 'daily-log', `Daily Log ${log.date}`);
        }
      }
      logger.debug(`[SemanticMemory] Indexed ${recentLogs.length} daily logs`);
    } catch (err) {
      logger.warn('[SemanticMemory] Failed to index daily logs:', err);
    }

    logger.info(`[SemanticMemory] Index rebuilt with ${this.index.size} documents`);
  }

  /**
   * Summarize a daily log into a flat text for indexing
   */
  private summarizeDailyLog(log: DailyLog): string {
    const parts: string[] = [];

    if (log.sessions.length > 0) {
      parts.push('Sessions: ' + log.sessions.map(s => s.summary).join('; '));
    }
    if (log.tasksCompleted.length > 0) {
      parts.push('Completed: ' + log.tasksCompleted.join(', '));
    }
    if (log.tasksPending.length > 0) {
      parts.push('Pending: ' + log.tasksPending.join(', '));
    }
    if (log.insights.length > 0) {
      parts.push('Insights: ' + log.insights.join('; '));
    }
    if (log.errors.length > 0) {
      parts.push('Errors: ' + log.errors.join('; '));
    }

    return parts.join(' | ');
  }

  /**
   * Get the current index size
   */
  get size(): number {
    return this.index.size;
  }
}
