/**
 * Memory File Watcher
 *
 * Watches memory directory for file changes and triggers index updates.
 * Uses polling since Android/Anode doesn't expose native fs.watch.
 *
 * Features:
 * - Polling-based file change detection
 * - Debounced index updates
 * - Add/modify/delete detection
 * - Configurable watch paths
 */

import { logger } from '../../utils/logger.js';

// Anode global file API
declare const file: {
  listFiles(path: string): Promise<Array<{
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    lastModified: number;
    extension: string;
  }>>;
  exists(path: string): boolean;
};

/**
 * File info snapshot
 */
interface FileSnapshot {
  path: string;
  name: string;
  size: number;
  lastModified: number;
}

/**
 * File change event
 */
export interface FileChangeEvent {
  type: 'add' | 'modify' | 'delete';
  path: string;
  name: string;
  timestamp: number;
}

/**
 * File watcher configuration
 */
export interface FileWatcherConfig {
  /** Directories to watch */
  watchPaths: string[];
  /** Polling interval in ms (default: 5000) */
  pollInterval: number;
  /** File extensions to watch (default: ['.md']) */
  extensions: string[];
  /** Debounce delay for batch events (default: 500) */
  debounceDelay: number;
  /** Enable recursive watching (default: true) */
  recursive: boolean;
}

const DEFAULT_CONFIG: FileWatcherConfig = {
  watchPaths: [],
  pollInterval: 5000,
  extensions: ['.md'],
  debounceDelay: 500,
  recursive: true,
};

/**
 * Memory File Watcher
 *
 * Polls directories for file changes and emits events.
 */
export class MemoryFileWatcher {
  private config: FileWatcherConfig;
  private snapshots: Map<string, FileSnapshot> = new Map();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pendingChanges: FileChangeEvent[] = [];
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private running: boolean = false;

  /** Event handlers */
  private onChangeHandlers: Array<(events: FileChangeEvent[]) => void> = [];
  private onErrorHandlers: Array<(error: Error) => void> = [];

  constructor(config?: Partial<FileWatcherConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start watching
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[FileWatcher] Already running');
      return;
    }

    // Take initial snapshot
    await this.takeSnapshot();

    // Start polling
    this.pollTimer = setInterval(() => {
      this.poll().catch(err => {
        this.emitError(err);
      });
    }, this.config.pollInterval);

    this.running = true;
    logger.info(`[FileWatcher] Started watching ${this.config.watchPaths.length} paths`);
  }

  /**
   * Stop watching
   */
  stop(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.running = false;
    logger.info('[FileWatcher] Stopped');
  }

  /**
   * Add a watch path
   */
  addPath(path: string): void {
    if (!this.config.watchPaths.includes(path)) {
      this.config.watchPaths.push(path);
      logger.debug(`[FileWatcher] Added path: ${path}`);
    }
  }

  /**
   * Remove a watch path
   */
  removePath(path: string): void {
    const index = this.config.watchPaths.indexOf(path);
    if (index !== -1) {
      this.config.watchPaths.splice(index, 1);
      logger.debug(`[FileWatcher] Removed path: ${path}`);
    }
  }

  /**
   * Subscribe to change events
   */
  onChange(handler: (events: FileChangeEvent[]) => void): () => void {
    this.onChangeHandlers.push(handler);
    return () => {
      const index = this.onChangeHandlers.indexOf(handler);
      if (index !== -1) {
        this.onChangeHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to error events
   */
  onError(handler: (error: Error) => void): () => void {
    this.onErrorHandlers.push(handler);
    return () => {
      const index = this.onErrorHandlers.indexOf(handler);
      if (index !== -1) {
        this.onErrorHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Force a manual poll
   */
  async pollNow(): Promise<FileChangeEvent[]> {
    const changes = await this.poll();
    return changes;
  }

  /**
   * Get current file count
   */
  getWatchedFileCount(): number {
    return this.snapshots.size;
  }

  /**
   * Check if running
   */
  isRunning(): boolean {
    return this.running;
  }

  // ===== Private Methods =====

  private async poll(): Promise<FileChangeEvent[]> {
    const currentFiles = new Map<string, FileSnapshot>();
    const changes: FileChangeEvent[] = [];

    // Scan all watch paths
    for (const watchPath of this.config.watchPaths) {
      await this.scanDirectory(watchPath, currentFiles);
    }

    // Detect changes
    const now = Date.now();

    // Check for new and modified files
    for (const [path, current] of currentFiles) {
      const previous = this.snapshots.get(path);

      if (!previous) {
        // New file
        changes.push({
          type: 'add',
          path,
          name: current.name,
          timestamp: now,
        });
      } else if (
        current.lastModified !== previous.lastModified ||
        current.size !== previous.size
      ) {
        // Modified file
        changes.push({
          type: 'modify',
          path,
          name: current.name,
          timestamp: now,
        });
      }
    }

    // Check for deleted files
    for (const [path, previous] of this.snapshots) {
      if (!currentFiles.has(path)) {
        changes.push({
          type: 'delete',
          path,
          name: previous.name,
          timestamp: now,
        });
      }
    }

    // Update snapshots
    this.snapshots = currentFiles;

    // Emit changes if any
    if (changes.length > 0) {
      this.queueChanges(changes);
    }

    return changes;
  }

  private async scanDirectory(
    dirPath: string,
    results: Map<string, FileSnapshot>
  ): Promise<void> {
    try {
      if (typeof file === 'undefined' || !file.exists(dirPath)) {
        return;
      }

      const entries = await file.listFiles(dirPath);

      for (const entry of entries) {
        if (entry.isDirectory && this.config.recursive) {
          await this.scanDirectory(entry.path, results);
        } else if (!entry.isDirectory && this.matchesExtension(entry.name)) {
          results.set(entry.path, {
            path: entry.path,
            name: entry.name,
            size: entry.size,
            lastModified: entry.lastModified,
          });
        }
      }
    } catch (error) {
      logger.warn(`[FileWatcher] Failed to scan ${dirPath}:`, error);
    }
  }

  private matchesExtension(filename: string): boolean {
    if (this.config.extensions.length === 0) {
      return true;
    }

    const lowerName = filename.toLowerCase();
    return this.config.extensions.some(ext => lowerName.endsWith(ext.toLowerCase()));
  }

  private async takeSnapshot(): Promise<void> {
    this.snapshots.clear();
    for (const watchPath of this.config.watchPaths) {
      await this.scanDirectory(watchPath, this.snapshots);
    }
    logger.debug(`[FileWatcher] Initial snapshot: ${this.snapshots.size} files`);
  }

  private queueChanges(changes: FileChangeEvent[]): void {
    this.pendingChanges.push(...changes);

    // Debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const batch = [...this.pendingChanges];
      this.pendingChanges = [];
      this.emitChanges(batch);
    }, this.config.debounceDelay);
  }

  private emitChanges(events: FileChangeEvent[]): void {
    logger.debug(`[FileWatcher] Emitting ${events.length} change events`);
    for (const handler of this.onChangeHandlers) {
      try {
        handler(events);
      } catch (error) {
        logger.error('[FileWatcher] Handler error:', error);
      }
    }
  }

  private emitError(error: Error): void {
    logger.error('[FileWatcher] Error:', error);
    for (const handler of this.onErrorHandlers) {
      try {
        handler(error);
      } catch (e) {
        logger.error('[FileWatcher] Error handler error:', e);
      }
    }
  }
}

/**
 * Create a file watcher for memory directories
 */
export function createMemoryFileWatcher(
  memoryDir: string,
  config?: Partial<FileWatcherConfig>
): MemoryFileWatcher {
  return new MemoryFileWatcher({
    ...config,
    watchPaths: [memoryDir, ...(config?.watchPaths || [])],
  });
}

/**
 * Index sync helper - connects file watcher to index
 */
export class IndexSyncManager {
  private watcher: MemoryFileWatcher;
  private onAdd: (path: string) => Promise<void>;
  private onModify: (path: string) => Promise<void>;
  private onDelete: (path: string) => Promise<void>;
  private unsubscribe: (() => void) | null = null;

  constructor(
    watcher: MemoryFileWatcher,
    handlers: {
      onAdd: (path: string) => Promise<void>;
      onModify: (path: string) => Promise<void>;
      onDelete: (path: string) => Promise<void>;
    }
  ) {
    this.watcher = watcher;
    this.onAdd = handlers.onAdd;
    this.onModify = handlers.onModify;
    this.onDelete = handlers.onDelete;
  }

  /**
   * Start syncing
   */
  start(): void {
    this.unsubscribe = this.watcher.onChange(events => {
      this.processEvents(events);
    });
  }

  /**
   * Stop syncing
   */
  stop(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
  }

  private async processEvents(events: FileChangeEvent[]): Promise<void> {
    for (const event of events) {
      try {
        switch (event.type) {
          case 'add':
            await this.onAdd(event.path);
            break;
          case 'modify':
            await this.onModify(event.path);
            break;
          case 'delete':
            await this.onDelete(event.path);
            break;
        }
      } catch (error) {
        logger.error(`[IndexSync] Failed to process ${event.type} event for ${event.path}:`, error);
      }
    }
  }
}
