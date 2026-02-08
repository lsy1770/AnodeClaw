/**
 * Memory System
 *
 * Unified memory system combining JSONL storage and memory files
 */
import { logger } from '../../utils/logger.js';
import { JSONLStorage } from './JSONLStorage.js';
import { MemoryFileManager } from './MemoryFileManager.js';
/**
 * Memory System Class
 */
export class MemorySystem {
    constructor(config) {
        this.sessionLogs = new Map();
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
    async initialize() {
        await this.memoryFiles.initialize();
    }
    /**
     * Get or create JSONL storage for a session
     */
    getSessionLog(sessionId) {
        if (!this.sessionLogs.has(sessionId)) {
            const logPath = `${this.config.sessionLogsDir}/${sessionId}.jsonl`;
            this.sessionLogs.set(sessionId, new JSONLStorage(logPath));
        }
        return this.sessionLogs.get(sessionId);
    }
    /**
     * Append session log entry
     */
    async appendLog(sessionId, entry) {
        const log = this.getSessionLog(sessionId);
        await log.append(entry);
        // Check if compression is needed
        await this.checkCompression(sessionId);
    }
    /**
     * Read session logs
     */
    async readLogs(sessionId, options) {
        const log = this.getSessionLog(sessionId);
        if (options?.recent) {
            return await log.readRecent(options.recent);
        }
        else if (options?.timeRange) {
            return await log.readByTimeRange(options.timeRange.start, options.timeRange.end);
        }
        else {
            return await log.readAll();
        }
    }
    /**
     * Check if compression is needed
     */
    async checkCompression(sessionId) {
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
    async compressLogs(sessionId, summary) {
        const log = this.getSessionLog(sessionId);
        const compressionTime = Date.now() - this.config.compressionAge;
        await log.compressOldEntries(compressionTime, summary);
        logger.info(`[MemorySystem] Compressed logs for session ${sessionId}`);
    }
    /**
     * Save a memory entry
     */
    async saveMemory(entry) {
        await this.memoryFiles.save(entry);
    }
    /**
     * Create and save a memory entry
     * High-importance memories are also appended to MEMORY.md for persistence
     */
    async createMemory(title, content, options) {
        const entry = this.memoryFiles.createEntry(title, content, options);
        await this.memoryFiles.save(entry);
        // Auto-append high-importance memories to MEMORY.md
        if (options?.importance === 'high') {
            await this.appendToMainMemory(title, content);
        }
        return entry;
    }
    /**
     * Append important information to MEMORY.md main memory file
     * Called automatically for high-importance memories
     */
    async appendToMainMemory(title, content) {
        await this.memoryFiles.appendToMainMemory(title, content);
    }
    /**
     * Load a memory entry
     */
    async loadMemory(id) {
        return await this.memoryFiles.load(id);
    }
    /**
     * Load all memory entries
     */
    async loadAllMemories() {
        return await this.memoryFiles.loadAll();
    }
    /**
     * Delete a memory entry
     */
    async deleteMemory(id) {
        return await this.memoryFiles.delete(id);
    }
    /**
     * Search memories
     */
    async searchMemories(query) {
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
    async semanticSearch(queryText, limit = 10) {
        return await this.memoryFiles.semanticSearch(queryText, limit);
    }
    /**
     * Get memory system statistics
     */
    async getStats() {
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
    async clearSessionLogs(sessionId) {
        const log = this.getSessionLog(sessionId);
        await log.clear();
        this.sessionLogs.delete(sessionId);
    }
    /**
     * Clear all memories
     */
    async clearAllMemories() {
        const entries = await this.memoryFiles.loadAll();
        for (const entry of entries) {
            await this.memoryFiles.delete(entry.id);
        }
        logger.info('[MemorySystem] Cleared all memories');
    }
    /**
     * Rebuild the memory index
     * Call this after adding new memory files or when search results seem stale
     */
    async rebuildIndex() {
        await this.memoryFiles.buildIndex(true);
        logger.info('[MemorySystem] Memory index rebuilt');
    }
    /**
     * Invalidate the memory index
     * The index will be rebuilt on next search
     */
    invalidateIndex() {
        this.memoryFiles.invalidateIndex();
    }
}
