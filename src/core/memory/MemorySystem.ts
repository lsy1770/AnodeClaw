/**
 * Memory System
 *
 * Unified memory system combining JSONL storage and memory files
 */

import { logger } from '../../utils/logger.js';
import { JSONLStorage } from './JSONLStorage.js';
import { MemoryFileManager } from './MemoryFileManager.js';
import type {
  SessionLogEntry,
  MemoryEntry,
  SearchQuery,
  SearchResult,
  MemoryStats,
} from './types.js';

/**
 * Memory System Configuration
 */
export interface MemorySystemConfig {
  sessionLogsDir: string;
  memoryFilesDir: string;
  compressionThreshold?: number; // Number of entries before compression
  compressionAge?: number; // Age in ms before entries can be compressed
}

/**
 * Memory System Class
 */
export class MemorySystem {
  private sessionLogs: Map<string, JSONLStorage> = new Map();
  private memoryFiles: MemoryFileManager;
  private config: Required<MemorySystemConfig>;

  constructor(config: MemorySystemConfig) {
    this.config = {
      ...config,
      compressionThreshold: config.compressionThreshold || 1000,
      compressionAge: config.compressionAge || 7 * 24 * 60 * 60 * 1000, // 7 days
    };

    this.memoryFiles = new MemoryFileManager(config.memoryFilesDir);

    logger.info('[MemorySystem] Initialized');
  }

  /**
   * Initialize memory system (create directories, build index)
   */
  async initialize(): Promise<void> {
    await this.memoryFiles.initialize();
  }

  /**
   * Get or create JSONL storage for a session
   */
  private getSessionLog(sessionId: string): JSONLStorage {
    if (!this.sessionLogs.has(sessionId)) {
      const logPath = `${this.config.sessionLogsDir}/${sessionId}.jsonl`;
      this.sessionLogs.set(sessionId, new JSONLStorage(logPath));
    }
    return this.sessionLogs.get(sessionId)!;
  }

  /**
   * Append session log entry
   */
  async appendLog(sessionId: string, entry: SessionLogEntry): Promise<void> {
    const log = this.getSessionLog(sessionId);
    await log.append(entry);

    // Check if compression is needed
    await this.checkCompression(sessionId);
  }

  /**
   * Read session logs
   */
  async readLogs(sessionId: string, options?: {
    recent?: number;
    timeRange?: { start: number; end: number };
  }): Promise<SessionLogEntry[]> {
    const log = this.getSessionLog(sessionId);

    if (options?.recent) {
      return await log.readRecent(options.recent);
    } else if (options?.timeRange) {
      return await log.readByTimeRange(options.timeRange.start, options.timeRange.end);
    } else {
      return await log.readAll();
    }
  }

  /**
   * Check if compression is needed
   */
  private async checkCompression(sessionId: string): Promise<void> {
    const log = this.getSessionLog(sessionId);
    const count = await log.getCount();

    if (count > this.config.compressionThreshold) {
      logger.info(`[MemorySystem] Session ${sessionId} has ${count} entries, compression recommended`);
      // Note: Actual compression should be triggered by AI to generate summary
    }
  }

  /**
   * Compress old session logs (with AI-generated summary)
   */
  async compressLogs(sessionId: string, summary: string): Promise<void> {
    const log = this.getSessionLog(sessionId);
    const compressionTime = Date.now() - this.config.compressionAge;
    await log.compressOldEntries(compressionTime, summary);

    logger.info(`[MemorySystem] Compressed logs for session ${sessionId}`);
  }

  /**
   * Save a memory entry
   */
  async saveMemory(entry: MemoryEntry): Promise<void> {
    await this.memoryFiles.save(entry);
  }

  /**
   * Create and save a memory entry
   */
  async createMemory(
    title: string,
    content: string,
    options?: {
      tags?: string[];
      importance?: 'low' | 'medium' | 'high';
    }
  ): Promise<MemoryEntry> {
    const entry = this.memoryFiles.createEntry(title, content, options);
    await this.memoryFiles.save(entry);
    return entry;
  }

  /**
   * Load a memory entry
   */
  async loadMemory(id: string): Promise<MemoryEntry | null> {
    return await this.memoryFiles.load(id);
  }

  /**
   * Load all memory entries
   */
  async loadAllMemories(): Promise<MemoryEntry[]> {
    return await this.memoryFiles.loadAll();
  }

  /**
   * Delete a memory entry
   */
  async deleteMemory(id: string): Promise<boolean> {
    return await this.memoryFiles.delete(id);
  }

  /**
   * Search memories
   */
  async searchMemories(query: SearchQuery): Promise<SearchResult[]> {
    return await this.memoryFiles.search(query);
  }

  /**
   * Semantic search - find memories by natural language query
   *
   * Uses TF-IDF vector similarity for relevance ranking.
   * Better for broad or fuzzy queries compared to exact keyword search.
   *
   * @param queryText - Natural language search text
   * @param limit - Maximum results (default 10)
   * @returns Search results ranked by semantic similarity
   */
  async semanticSearch(queryText: string, limit: number = 10): Promise<SearchResult[]> {
    return await this.memoryFiles.semanticSearch(queryText, limit);
  }

  /**
   * Get memory system statistics
   */
  async getStats(): Promise<MemoryStats> {
    const memoryStats = await this.memoryFiles.getStats();

    // Count total sessions
    let totalSessions = this.sessionLogs.size;

    return {
      totalEntries: memoryStats.totalEntries,
      totalSessions,
      oldestEntry: memoryStats.oldestEntry,
      newestEntry: memoryStats.newestEntry,
      storageSize: memoryStats.storageSize,
    };
  }

  /**
   * Clear session logs (for a specific session)
   */
  async clearSessionLogs(sessionId: string): Promise<void> {
    const log = this.getSessionLog(sessionId);
    await log.clear();
    this.sessionLogs.delete(sessionId);
  }

  /**
   * Clear all memories
   */
  async clearAllMemories(): Promise<void> {
    const entries = await this.memoryFiles.loadAll();
    for (const entry of entries) {
      await this.memoryFiles.delete(entry.id);
    }
    logger.info('[MemorySystem] Cleared all memories');
  }
}
