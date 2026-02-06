/**
 * Semantic Memory
 *
 * Orchestration layer over VectorIndex — indexes MemoryEntries, DailyLogs,
 * and session summaries for system prompt enrichment via TF-IDF similarity search.
 */
import { logger } from '../../utils/logger.js';
import { VectorIndex } from './VectorIndex.js';
const DEFAULT_CONFIG = {
    maxContextLength: 2000,
    maxResults: 5,
    minScore: 0.05,
    dailyLogDays: 30,
};
/**
 * SemanticMemory Class
 */
export class SemanticMemory {
    constructor(memorySystem, dailyLogManager, config) {
        this.initialized = false;
        /**
         * Map of indexed document IDs to their type (for source tracking)
         */
        this.docTypes = new Map();
        /**
         * Map of indexed document IDs to a snippet of their content
         */
        this.docSnippets = new Map();
        /**
         * Map of indexed document IDs to their title
         */
        this.docTitles = new Map();
        this.memorySystem = memorySystem;
        this.dailyLogManager = dailyLogManager;
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.index = new VectorIndex();
    }
    /**
     * Build the initial index from all available sources
     */
    async initialize() {
        if (this.initialized)
            return;
        try {
            await this.rebuildIndex();
            this.initialized = true;
            logger.info(`[SemanticMemory] Initialized with ${this.index.size} documents`);
        }
        catch (err) {
            logger.warn('[SemanticMemory] Initialization failed (will lazy-init later):', err);
        }
    }
    /**
     * Query the index and return formatted context for system prompt injection
     */
    async getRelevantContext(query, limit) {
        if (!this.initialized) {
            await this.initialize();
        }
        const maxResults = limit ?? this.config.maxResults;
        const hits = this.index.search(query, maxResults, this.config.minScore);
        if (hits.length === 0) {
            return { content: '', sources: [] };
        }
        const sources = [];
        const parts = [];
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
    async addToIndex(id, content, type, title) {
        this.index.add(id, content);
        this.docTypes.set(id, type);
        this.docSnippets.set(id, content.slice(0, 300));
        this.docTitles.set(id, title || id);
    }
    /**
     * Remove a document from the index
     */
    removeFromIndex(id) {
        this.index.remove(id);
        this.docTypes.delete(id);
        this.docSnippets.delete(id);
        this.docTitles.delete(id);
    }
    /**
     * Rebuild the entire index from scratch
     */
    async rebuildIndex() {
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
        }
        catch (err) {
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
        }
        catch (err) {
            logger.warn('[SemanticMemory] Failed to index daily logs:', err);
        }
        logger.info(`[SemanticMemory] Index rebuilt with ${this.index.size} documents`);
    }
    /**
     * Summarize a daily log into a flat text for indexing
     */
    summarizeDailyLog(log) {
        const parts = [];
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
    get size() {
        return this.index.size;
    }
}
