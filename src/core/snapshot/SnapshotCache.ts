/**
 * Snapshot Cache
 *
 * Caches codebase snapshots for reuse
 */

import type { CodebaseSnapshot } from './types.js';
import { logger } from '../../utils/logger.js';

/**
 * Snapshot Cache Class
 */
export class SnapshotCache {
  private cache: Map<string, CodebaseSnapshot> = new Map();
  private maxSize: number;
  private maxAge: number; // milliseconds

  constructor(options: { maxSize?: number; maxAge?: number } = {}) {
    this.maxSize = options.maxSize || 10;
    this.maxAge = options.maxAge || 30 * 60 * 1000; // 30 minutes default
  }

  /**
   * Get snapshot from cache
   *
   * @param rootPath - Root path of codebase
   * @returns Cached snapshot or null
   */
  get(rootPath: string): CodebaseSnapshot | null {
    const snapshot = this.cache.get(rootPath);

    if (!snapshot) {
      return null;
    }

    // Check if snapshot is expired
    const age = Date.now() - snapshot.timestamp;
    if (age > this.maxAge) {
      logger.debug(`[SnapshotCache] Snapshot expired for ${rootPath}`);
      this.cache.delete(rootPath);
      return null;
    }

    logger.debug(`[SnapshotCache] Cache hit for ${rootPath}`);
    return snapshot;
  }

  /**
   * Store snapshot in cache
   *
   * @param snapshot - Snapshot to cache
   */
  set(snapshot: CodebaseSnapshot): void {
    // Enforce size limit
    if (this.cache.size >= this.maxSize) {
      // Remove oldest snapshot
      const oldestKey = Array.from(this.cache.entries()).sort(
        (a, b) => a[1].timestamp - b[1].timestamp
      )[0][0];

      this.cache.delete(oldestKey);
      logger.debug(`[SnapshotCache] Evicted ${oldestKey} (size limit)`);
    }

    this.cache.set(snapshot.rootPath, snapshot);
    logger.debug(`[SnapshotCache] Cached snapshot for ${snapshot.rootPath}`);
  }

  /**
   * Check if snapshot exists in cache
   */
  has(rootPath: string): boolean {
    return this.get(rootPath) !== null;
  }

  /**
   * Clear snapshot from cache
   */
  delete(rootPath: string): boolean {
    const deleted = this.cache.delete(rootPath);
    if (deleted) {
      logger.debug(`[SnapshotCache] Removed ${rootPath} from cache`);
    }
    return deleted;
  }

  /**
   * Clear all cached snapshots
   */
  clear(): void {
    this.cache.clear();
    logger.info('[SnapshotCache] Cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      snapshots: Array.from(this.cache.values()).map((s) => ({
        rootPath: s.rootPath,
        timestamp: s.timestamp,
        age: Date.now() - s.timestamp,
        fileCount: s.fileCount,
      })),
    };
  }
}
