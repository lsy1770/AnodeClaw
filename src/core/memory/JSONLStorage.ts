/**
 * JSONL Storage
 *
 * Stores session logs in JSONL format (one JSON object per line).
 * Uses Anode global file API when available, falls back to Node.js fs.
 */

import { logger } from '../../utils/logger.js';
import type { SessionLogEntry } from './types.js';

// Anode global file API (based on FileAPI.kt actual method signatures)
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<boolean>;
  appendText(path: string, content: string, charset?: string): Promise<boolean>;
  exists(path: string): boolean;
  createDirectory(path: string): Promise<boolean>;
};

/**
 * JSONL Storage Class
 */
export class JSONLStorage {
  constructor(private filePath: string) {}

  /**
   * Append a log entry
   */
  async append(entry: SessionLogEntry): Promise<void> {
    try {
      const line = JSON.stringify(entry) + '\n';

      // Ensure directory exists on first write
      const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
      if (dir) {
        try {
          await this.ensureDir(dir);
        } catch (dirError) {
          logger.warn(`[JSONL] ensureDir failed for ${dir}:`, dirError);
        }
      }

      // Use appendText for efficient append (creates file if it doesn't exist)
      await this.appendFile(this.filePath, line);

      logger.debug(`[JSONL] Appended entry to ${this.filePath}`);
    } catch (error) {
      // Try to extract cause from Java FileAPIException
      const cause = (error as any)?.cause;
      logger.error(`[JSONL] Failed to append to ${this.filePath}:`, error, cause ? `cause: ${cause}` : '');
      throw error;
    }
  }

  /**
   * Read all entries
   */
  async readAll(): Promise<SessionLogEntry[]> {
    try {
      const exists = this.fileExists(this.filePath);
      if (!exists) {
        return [];
      }

      const content = await this.readFile(this.filePath);
      const lines = content.trim().split('\n');

      const entries: SessionLogEntry[] = [];
      for (const line of lines) {
        if (line.trim()) {
          try {
            entries.push(JSON.parse(line));
          } catch (error) {
            logger.warn(`[JSONL] Failed to parse line: ${line}`);
          }
        }
      }

      return entries;
    } catch (error) {
      logger.error(`[JSONL] Failed to read all entries:`, error);
      throw error;
    }
  }

  /**
   * Read recent N entries
   */
  async readRecent(count: number): Promise<SessionLogEntry[]> {
    const all = await this.readAll();
    return all.slice(-count);
  }

  /**
   * Read entries by time range
   */
  async readByTimeRange(startTime: number, endTime: number): Promise<SessionLogEntry[]> {
    const all = await this.readAll();
    return all.filter(entry =>
      entry.timestamp >= startTime && entry.timestamp <= endTime
    );
  }

  /**
   * Compress old entries (summarize and remove)
   */
  async compressOldEntries(beforeTime: number, summary: string): Promise<void> {
    try {
      const all = await this.readAll();
      const kept = all.filter(entry => entry.timestamp >= beforeTime);

      // Add summary entry
      const summaryEntry: SessionLogEntry = {
        timestamp: beforeTime,
        role: 'system',
        content: `[Compressed History Summary]\n${summary}`,
        metadata: { compressed: true },
      };

      kept.unshift(summaryEntry);

      // Rewrite file
      const content = kept.map(entry => JSON.stringify(entry)).join('\n') + '\n';
      await this.writeFile(this.filePath, content);

      logger.info(`[JSONL] Compressed ${all.length - kept.length} old entries`);
    } catch (error) {
      logger.error(`[JSONL] Failed to compress entries:`, error);
      throw error;
    }
  }

  /**
   * Get total entry count
   */
  async getCount(): Promise<number> {
    const all = await this.readAll();
    return all.length;
  }

  /**
   * Clear all entries
   */
  async clear(): Promise<void> {
    try {
      await this.writeFile(this.filePath, '');
      logger.info(`[JSONL] Cleared all entries`);
    } catch (error) {
      logger.error(`[JSONL] Failed to clear entries:`, error);
      throw error;
    }
  }

  /**
   * Check if storage exists
   */
  async exists(): Promise<boolean> {
    return this.fileExists(this.filePath);
  }

  // ==========================================
  // File system abstraction layer
  // Uses Anode global file API (FileAPI.kt)
  // ==========================================

  private async readFile(path: string): Promise<string> {
    if (typeof file !== 'undefined' && file.readText) {
      return file.readText(path, 'UTF-8');
    }
    throw new Error('Anode file API not available');
  }

  private async writeFile(path: string, content: string): Promise<void> {
    if (typeof file !== 'undefined' && file.writeText) {
      await file.writeText(path, content, 'UTF-8');
      return;
    }
    throw new Error('Anode file API not available');
  }

  private async appendFile(path: string, content: string): Promise<void> {
    if (typeof file !== 'undefined' && file.appendText) {
      await file.appendText(path, content, 'UTF-8');
      return;
    }
    throw new Error('Anode file API not available');
  }

  private fileExists(path: string): boolean {
    if (typeof file !== 'undefined' && file.exists) {
      return file.exists(path);
    }
    return false;
  }

  private async ensureDir(dirPath: string): Promise<void> {
    if (typeof file !== 'undefined' && file.createDirectory) {
      try {
        await file.createDirectory(dirPath);
        logger.debug(`[JSONL] Directory ensured: ${dirPath}`);
      } catch (error) {
        // Directory may already exist — log but don't throw
        logger.debug(`[JSONL] createDirectory ${dirPath}:`, error);
      }
      return;
    }
    logger.warn('[JSONL] file.createDirectory not available');
  }
}
