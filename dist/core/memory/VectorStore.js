/**
 * Vector Store
 *
 * File-based persistent vector storage for the memory system.
 * Provides SQLite-like functionality using JSONL files for storage.
 *
 * Features:
 * - Persistent storage via JSONL files
 * - In-memory index for fast search
 * - Automatic loading on startup
 * - Chunked document support
 * - Metadata storage
 */
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { VectorIndex } from './VectorIndex.js';
import { TextChunker } from './TextChunker.js';
/**
 * Vector Store Class
 *
 * Provides persistent storage for vectors with TF-IDF search capabilities.
 */
export class VectorStore {
    /** Path to the main data file */
    get dataFilePath() {
        return `${this.config.storageDir}/vectors.jsonl`;
    }
    /** Path to the metadata file */
    get metaFilePath() {
        return `${this.config.storageDir}/meta.json`;
    }
    constructor(config) {
        this.entries = new Map();
        this.dirty = false;
        this.saveTimeout = null;
        this.initialized = false;
        this.config = {
            ...config,
            autoSave: config.autoSave ?? true,
            saveDebounce: config.saveDebounce ?? 1000,
            chunkConfig: config.chunkConfig ?? {},
        };
        this.index = new VectorIndex();
        this.chunker = new TextChunker(this.config.chunkConfig);
    }
    /**
     * Initialize the store - load from disk
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.ensureDir();
            await this.loadFromDisk();
            this.initialized = true;
            logger.info(`[VectorStore] Initialized with ${this.entries.size} entries`);
        }
        catch (error) {
            logger.warn('[VectorStore] Initialization failed, starting fresh:', error);
            this.initialized = true;
        }
    }
    /**
     * Add a document to the store
     */
    async add(content, metadata) {
        await this.ensureInitialized();
        const id = generateId();
        const now = Date.now();
        const entry = {
            id,
            content,
            metadata,
            createdAt: now,
            updatedAt: now,
        };
        this.entries.set(id, entry);
        this.index.add(id, content);
        this.markDirty();
        logger.debug(`[VectorStore] Added entry: ${id}`);
        return entry;
    }
    /**
     * Add a document with chunking
     */
    async addWithChunking(content, metadata) {
        await this.ensureInitialized();
        const sourceId = generateId();
        const chunks = this.chunker.chunk(content, sourceId);
        const entries = [];
        const now = Date.now();
        for (const chunk of chunks) {
            const entry = {
                id: chunk.id,
                content: chunk.content,
                metadata: {
                    ...metadata,
                    type: 'chunk',
                    sourceId,
                    chunkIndex: chunk.index,
                    totalChunks: chunk.totalChunks,
                    charRange: { start: chunk.startChar, end: chunk.endChar },
                },
                createdAt: now,
                updatedAt: now,
            };
            this.entries.set(entry.id, entry);
            this.index.add(entry.id, entry.content);
            entries.push(entry);
        }
        this.markDirty();
        logger.debug(`[VectorStore] Added document ${sourceId} with ${entries.length} chunks`);
        return entries;
    }
    /**
     * Update an existing entry
     */
    async update(id, content, metadata) {
        await this.ensureInitialized();
        const existing = this.entries.get(id);
        if (!existing) {
            return null;
        }
        const updated = {
            ...existing,
            content,
            metadata: { ...existing.metadata, ...metadata },
            updatedAt: Date.now(),
        };
        this.entries.set(id, updated);
        this.index.add(id, content); // Re-index
        this.markDirty();
        logger.debug(`[VectorStore] Updated entry: ${id}`);
        return updated;
    }
    /**
     * Delete an entry
     */
    async delete(id) {
        await this.ensureInitialized();
        if (!this.entries.has(id)) {
            return false;
        }
        this.entries.delete(id);
        this.index.remove(id);
        this.markDirty();
        logger.debug(`[VectorStore] Deleted entry: ${id}`);
        return true;
    }
    /**
     * Delete all chunks for a source document
     */
    async deleteBySourceId(sourceId) {
        await this.ensureInitialized();
        let count = 0;
        for (const [id, entry] of this.entries) {
            if (entry.metadata.sourceId === sourceId) {
                this.entries.delete(id);
                this.index.remove(id);
                count++;
            }
        }
        if (count > 0) {
            this.markDirty();
            logger.debug(`[VectorStore] Deleted ${count} entries for source: ${sourceId}`);
        }
        return count;
    }
    /**
     * Get an entry by ID
     */
    async get(id) {
        await this.ensureInitialized();
        return this.entries.get(id) || null;
    }
    /**
     * Get all entries for a source document
     */
    async getBySourceId(sourceId) {
        await this.ensureInitialized();
        return Array.from(this.entries.values())
            .filter(e => e.metadata.sourceId === sourceId)
            .sort((a, b) => (a.metadata.chunkIndex || 0) - (b.metadata.chunkIndex || 0));
    }
    /**
     * Search for similar entries
     */
    async search(query, options) {
        await this.ensureInitialized();
        const limit = options?.limit ?? 10;
        const minScore = options?.minScore ?? 0.05;
        // Get vector search results
        const vectorResults = this.index.search(query, limit * 3, minScore);
        // Filter and enrich results
        const results = [];
        for (const vr of vectorResults) {
            const entry = this.entries.get(vr.id);
            if (!entry)
                continue;
            // Apply filters
            if (options?.type && entry.metadata.type !== options.type)
                continue;
            if (options?.tags && options.tags.length > 0) {
                const entryTags = entry.metadata.tags || [];
                if (!options.tags.some(t => entryTags.includes(t)))
                    continue;
            }
            results.push({ entry, score: vr.score });
        }
        return results.slice(0, limit);
    }
    /**
     * List all entries with optional filtering
     */
    async list(options) {
        await this.ensureInitialized();
        let entries = Array.from(this.entries.values());
        if (options?.type) {
            entries = entries.filter(e => e.metadata.type === options.type);
        }
        // Sort by createdAt descending
        entries.sort((a, b) => b.createdAt - a.createdAt);
        const offset = options?.offset ?? 0;
        const limit = options?.limit ?? 100;
        return entries.slice(offset, offset + limit);
    }
    /**
     * Get store statistics
     */
    async getStats() {
        await this.ensureInitialized();
        const entries = Array.from(this.entries.values());
        const byType = {};
        let oldest = Infinity;
        let newest = 0;
        for (const entry of entries) {
            const type = entry.metadata.type || 'unknown';
            byType[type] = (byType[type] || 0) + 1;
            if (entry.createdAt < oldest)
                oldest = entry.createdAt;
            if (entry.createdAt > newest)
                newest = entry.createdAt;
        }
        return {
            totalEntries: entries.length,
            byType,
            oldestEntry: oldest === Infinity ? 0 : oldest,
            newestEntry: newest,
        };
    }
    /**
     * Force save to disk
     */
    async flush() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
            this.saveTimeout = null;
        }
        await this.saveToDisk();
    }
    /**
     * Clear all data
     */
    async clear() {
        this.entries.clear();
        this.index.clear();
        this.dirty = true;
        await this.saveToDisk();
        logger.info('[VectorStore] Cleared all data');
    }
    // ===== Private Methods =====
    async ensureInitialized() {
        if (!this.initialized) {
            await this.initialize();
        }
    }
    async ensureDir() {
        try {
            if (typeof file !== 'undefined' && file.createDirectory) {
                await file.createDirectory(this.config.storageDir);
            }
        }
        catch {
            // Directory may already exist
        }
    }
    markDirty() {
        this.dirty = true;
        if (this.config.autoSave) {
            if (this.saveTimeout) {
                clearTimeout(this.saveTimeout);
            }
            this.saveTimeout = setTimeout(() => {
                this.saveToDisk().catch(err => {
                    logger.error('[VectorStore] Auto-save failed:', err);
                });
            }, this.config.saveDebounce);
        }
    }
    async loadFromDisk() {
        if (typeof file === 'undefined' || !file.exists || !file.exists(this.dataFilePath)) {
            return;
        }
        try {
            const content = await file.readText(this.dataFilePath, 'UTF-8');
            const lines = content.split('\n').filter(line => line.trim());
            for (const line of lines) {
                try {
                    const entry = JSON.parse(line);
                    this.entries.set(entry.id, entry);
                    this.index.add(entry.id, entry.content);
                }
                catch {
                    logger.warn('[VectorStore] Skipping invalid entry line');
                }
            }
            logger.debug(`[VectorStore] Loaded ${this.entries.size} entries from disk`);
        }
        catch (error) {
            logger.error('[VectorStore] Failed to load from disk:', error);
            throw error;
        }
    }
    async saveToDisk() {
        if (!this.dirty)
            return;
        try {
            await this.ensureDir();
            // Build JSONL content
            const lines = [];
            for (const entry of this.entries.values()) {
                lines.push(JSON.stringify(entry));
            }
            const content = lines.join('\n');
            await file.writeText(this.dataFilePath, content, 'UTF-8');
            // Save metadata
            const meta = {
                version: 1,
                entryCount: this.entries.size,
                lastSaved: Date.now(),
            };
            await file.writeText(this.metaFilePath, JSON.stringify(meta, null, 2), 'UTF-8');
            this.dirty = false;
            logger.debug(`[VectorStore] Saved ${this.entries.size} entries to disk`);
        }
        catch (error) {
            logger.error('[VectorStore] Failed to save to disk:', error);
            throw error;
        }
    }
}
