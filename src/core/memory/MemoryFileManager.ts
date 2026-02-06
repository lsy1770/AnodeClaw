/**
 * Memory File Manager
 *
 * Manages markdown-format memory files with TF-IDF vector search.
 * Uses Anode global file API when available, falls back to Node.js fs.
 */

import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { VectorIndex } from './VectorIndex.js';
import type { MemoryEntry, SearchQuery, SearchResult } from './types.js';

// Anode global file API (based on FileAPI.kt actual method signatures)
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<boolean>;
  exists(path: string): boolean;
  delete(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<boolean>;
  listFiles(path: string): Promise<Array<{ name: string; path: string; size: number; isDirectory: boolean; lastModified: number; extension: string }>>;
};

/**
 * Memory File Manager Class
 */
export class MemoryFileManager {
  /** Vector index for semantic search */
  private vectorIndex: VectorIndex = new VectorIndex();
  private indexBuilt: boolean = false;

  constructor(private memoryDir: string) { }

  /**
   * Ensure memory directory exists
   */
  async initialize(): Promise<void> {
    await this.ensureDir();
    // Pre-build index during initialization
    await this.buildIndex();
  }

  private async ensureDir(): Promise<void> {
    try {
      if (typeof file !== 'undefined' && file.createDirectory) {
        logger.debug(`[Memory] Creating directory: ${this.memoryDir}`);
        await file.createDirectory(this.memoryDir);

        if (file.exists && !file.exists(this.memoryDir)) {
          logger.warn(`[Memory] Directory check failed: ${this.memoryDir}. Attempting parent creation.`);
          const parent = this.memoryDir.substring(0, this.memoryDir.lastIndexOf('/'));
          if (parent && parent.length > 0) {
            try {
              await file.createDirectory(parent);
              await file.createDirectory(this.memoryDir);
            } catch (err) {
              logger.error('[Memory] Recursive creation failed:', err);
            }
          }
        }
      }
    } catch (e) {
      logger.error(`[Memory] ensureDir failed`, e);
    }
  }

  /**
   * Build the vector index from all existing memory entries
   * Called lazily on first search if not already built.
   */
  async buildIndex(): Promise<void> {
    if (this.indexBuilt) return;

    try {
      const entries = await this.loadAllRaw();

      for (const entry of entries) {
        // Index title + content + tags for full semantic coverage
        const indexText = `${entry.title} ${entry.tags.join(' ')} ${entry.content}`;
        this.vectorIndex.add(entry.id, indexText);
      }

      this.indexBuilt = true;
      logger.info(`[Memory] Vector index built with ${this.vectorIndex.size} documents`);
    } catch (error) {
      logger.error('[Memory] Failed to build vector index:', error);
    }
  }

  /**
   * Save a memory entry
   */
  async save(entry: MemoryEntry): Promise<void> {
    try {
      await this.ensureDir();

      const filePath = `${this.memoryDir}/${entry.id}.md`;

      // Convert to markdown format
      const content = this.entryToMarkdown(entry);

      await this.writeFile(filePath, content);

      // Update vector index
      const indexText = `${entry.title} ${entry.tags.join(' ')} ${entry.content}`;
      this.vectorIndex.add(entry.id, indexText);

      logger.info(`[Memory] Saved entry: ${entry.title}`);
    } catch (error) {
      logger.error(`[Memory] Failed to save entry:`, error);
      throw error;
    }
  }

  /**
   * Load a memory entry by ID
   */
  async load(id: string): Promise<MemoryEntry | null> {
    try {
      const filePath = `${this.memoryDir}/${id}.md`;
      const exists = this.fileExists(filePath);

      if (!exists) {
        return null;
      }

      const content = await this.readFile(filePath);
      const entry = this.markdownToEntry(id, content);

      // Update last accessed time
      entry.lastAccessed = Date.now();
      await this.save(entry);

      return entry;
    } catch (error) {
      logger.error(`[Memory] Failed to load entry ${id}:`, error);
      return null;
    }
  }

  /**
   * Load all memory entries (without updating lastAccessed)
   */
  private async loadAllRaw(): Promise<MemoryEntry[]> {
    try {
      await this.ensureDir();

      const files = await this.listDir(this.memoryDir);
      const entries: MemoryEntry[] = [];

      for (const f of files) {
        if (f.endsWith('.md')) {
          const id = f.replace('.md', '');
          try {
            const filePath = `${this.memoryDir}/${id}.md`;
            const content = await this.readFile(filePath);
            entries.push(this.markdownToEntry(id, content));
          } catch {
            logger.debug(`[Memory] Skipping unparseable entry: ${f}`);
          }
        }
      }

      return entries;
    } catch (error) {
      logger.error(`[Memory] Failed to load entries:`, error);
      return [];
    }
  }

  /**
   * Load all memory entries
   */
  async loadAll(): Promise<MemoryEntry[]> {
    return this.loadAllRaw();
  }

  /**
   * Delete a memory entry
   */
  async delete(id: string): Promise<boolean> {
    try {
      const filePath = `${this.memoryDir}/${id}.md`;
      const exists = this.fileExists(filePath);

      if (exists) {
        await this.deleteFile(filePath);
        this.vectorIndex.remove(id);
        logger.info(`[Memory] Deleted entry: ${id}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error(`[Memory] Failed to delete entry ${id}:`, error);
      return false;
    }
  }

  /**
   * Search memory entries using combined keyword + vector similarity scoring
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    // Ensure vector index is built
    await this.buildIndex();

    const entries = await this.loadAllRaw();
    const entryMap = new Map(entries.map(e => [e.id, e]));
    const results: SearchResult[] = [];

    // Vector search scores (if keywords provided)
    const vectorScores = new Map<string, number>();
    if (query.keywords && query.keywords.length > 0) {
      const queryText = query.keywords.join(' ');
      const vectorResults = this.vectorIndex.search(queryText, entries.length, 0.001);
      for (const vr of vectorResults) {
        vectorScores.set(vr.id, vr.score);
      }
    }

    for (const entry of entries) {
      let score = 0;
      const matchedFields: string[] = [];

      // Keyword matching (exact substring)
      if (query.keywords && query.keywords.length > 0) {
        for (const keyword of query.keywords) {
          const lowerKeyword = keyword.toLowerCase();
          if (entry.title.toLowerCase().includes(lowerKeyword)) {
            score += 10;
            matchedFields.push('title');
          }
          if (entry.content.toLowerCase().includes(lowerKeyword)) {
            score += 5;
            matchedFields.push('content');
          }
        }

        // Add vector similarity score (scaled to 0-20 range)
        const vs = vectorScores.get(entry.id);
        if (vs) {
          score += vs * 20;
          if (!matchedFields.includes('semantic')) {
            matchedFields.push('semantic');
          }
        }
      }

      // Tag matching
      if (query.tags && query.tags.length > 0) {
        for (const tag of query.tags) {
          if (entry.tags.includes(tag)) {
            score += 15;
            matchedFields.push('tags');
          }
        }
      }

      // Time range filtering
      if (query.timeRange) {
        if (entry.timestamp >= query.timeRange.start &&
          entry.timestamp <= query.timeRange.end) {
          score += 2;
        } else {
          continue; // Skip if outside time range
        }
      }

      // Importance filtering
      if (query.importance && entry.importance !== query.importance) {
        continue; // Skip if doesn't match importance
      }

      // Importance boost
      if (entry.importance === 'high') score *= 1.3;
      else if (entry.importance === 'low') score *= 0.8;

      if (score > 0) {
        results.push({ entry, score, matchedFields: [...new Set(matchedFields)] });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    // Apply limit
    if (query.limit && query.limit > 0) {
      return results.slice(0, query.limit);
    }

    return results;
  }

  /**
   * Semantic search using vector similarity only
   *
   * @param queryText - Natural language search query
   * @param limit - Maximum results (default 10)
   * @returns Search results ranked by semantic similarity
   */
  async semanticSearch(queryText: string, limit: number = 10): Promise<SearchResult[]> {
    await this.buildIndex();

    const vectorResults = this.vectorIndex.search(queryText, limit);
    const results: SearchResult[] = [];

    for (const vr of vectorResults) {
      const entry = await this.loadEntryRaw(vr.id);
      if (entry) {
        results.push({
          entry,
          score: vr.score,
          matchedFields: ['semantic'],
        });
      }
    }

    return results;
  }

  /**
   * Load a single entry without updating lastAccessed
   */
  private async loadEntryRaw(id: string): Promise<MemoryEntry | null> {
    try {
      const filePath = `${this.memoryDir}/${id}.md`;
      const exists = this.fileExists(filePath);
      if (!exists) return null;
      const content = await this.readFile(filePath);
      return this.markdownToEntry(id, content);
    } catch {
      return null;
    }
  }

  /**
   * Create a new memory entry
   */
  createEntry(title: string, content: string, options?: {
    tags?: string[];
    importance?: 'low' | 'medium' | 'high';
  }): MemoryEntry {
    return {
      id: generateId(),
      title,
      content,
      tags: options?.tags || [],
      timestamp: Date.now(),
      importance: options?.importance || 'medium',
    };
  }

  /**
   * Convert entry to markdown
   */
  private entryToMarkdown(entry: MemoryEntry): string {
    const lines: string[] = [];

    lines.push(`# ${entry.title}`);
    lines.push('');
    lines.push(`**ID**: ${entry.id}`);
    lines.push(`**Created**: ${new Date(entry.timestamp).toISOString()}`);
    if (entry.lastAccessed) {
      lines.push(`**Last Accessed**: ${new Date(entry.lastAccessed).toISOString()}`);
    }
    lines.push(`**Importance**: ${entry.importance}`);
    lines.push(`**Tags**: ${entry.tags.join(', ')}`);
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(entry.content);

    return lines.join('\n');
  }

  /**
   * Convert markdown to entry
   */
  private markdownToEntry(id: string, markdown: string): MemoryEntry {
    const lines = markdown.split('\n');

    let title = '';
    let timestamp = Date.now();
    let lastAccessed: number | undefined;
    let importance: 'low' | 'medium' | 'high' = 'medium';
    let tags: string[] = [];
    let contentStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('# ')) {
        title = line.substring(2).trim();
      } else if (line.startsWith('**Created**:')) {
        const dateStr = line.split(':').slice(1).join(':').trim();
        timestamp = new Date(dateStr).getTime();
      } else if (line.startsWith('**Last Accessed**:')) {
        const dateStr = line.split(':').slice(1).join(':').trim();
        lastAccessed = new Date(dateStr).getTime();
      } else if (line.startsWith('**Importance**:')) {
        importance = line.split(':')[1].trim() as any;
      } else if (line.startsWith('**Tags**:')) {
        const tagsStr = line.split(':')[1].trim();
        tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
      } else if (line === '---') {
        contentStart = i + 1;
        break;
      }
    }

    const content = lines.slice(contentStart).join('\n').trim();

    return {
      id,
      title,
      content,
      tags,
      timestamp,
      lastAccessed,
      importance,
    };
  }

  /**
   * Get statistics
   */
  async getStats() {
    const entries = await this.loadAllRaw();

    if (entries.length === 0) {
      return {
        totalEntries: 0,
        oldestEntry: 0,
        newestEntry: 0,
        storageSize: 0,
      };
    }

    const timestamps = entries.map(e => e.timestamp);

    // Estimate storage size from entry content lengths
    let storageSize = 0;
    for (const entry of entries) {
      storageSize += this.entryToMarkdown(entry).length;
    }

    return {
      totalEntries: entries.length,
      oldestEntry: Math.min(...timestamps),
      newestEntry: Math.max(...timestamps),
      storageSize,
    };
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
    logger.debug(`[Memory] Writing to file: ${path} (length: ${content.length})`);
    if (typeof file !== 'undefined' && file.writeText) {
      try {
        const result = await file.writeText(path, content, 'UTF-8');
        logger.debug(`[Memory] writeText result for ${path}: ${result}`);
        if (!result) {
          throw new Error(`Write operation returned false for ${path}`);
        }
        return;
      } catch (e) {
        logger.error(`[Memory] Failed to write text to ${path}:`, e);
        throw e;
      }
    }
    throw new Error('Anode file API not available');
  }

  private fileExists(path: string): boolean {
    if (typeof file !== 'undefined' && file.exists) {
      return file.exists(path);
    }
    return false;
  }

  private async deleteFile(path: string): Promise<void> {
    if (typeof file !== 'undefined' && file.delete) {
      await file.delete(path);
      return;
    }
    throw new Error('Anode file API not available');
  }

  private async listDir(dirPath: string): Promise<string[]> {
    logger.debug(`[Memory] Listing files in directory: ${dirPath}`);
    if (typeof file !== 'undefined' && file.listFiles) {
      try {
        const entries = await file.listFiles(dirPath);
        logger.debug(`[Memory] Found ${entries.length} files in ${dirPath}: ${entries.map(e => e.name).join(', ')}`);
        return entries.map(e => e.name);
      } catch (error) {
        logger.error(`[Memory] Failed to list directory ${dirPath}:`, error);
        throw error;
      }
    }
    throw new Error('Anode file API not available');
  }
}
