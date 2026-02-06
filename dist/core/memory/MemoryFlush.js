/**
 * Memory Flush
 *
 * Triggers memory persistence before context window compression.
 * Ensures important context is saved to long-term memory before
 * it's lost during compaction.
 *
 * Following OpenClaw pattern for pre-compaction persistence.
 */
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
const DEFAULT_CONFIG = {
    enabled: true,
    flushThreshold: 0.8,
    minMessages: 5,
    maxMemoriesPerFlush: 5,
};
/**
 * Memory Flush Manager
 *
 * Handles pre-compaction memory persistence.
 */
export class MemoryFlushManager {
    constructor(config) {
        this.lastFlushTime = 0;
        this.flushCount = 0;
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Check if flush should be triggered
     */
    shouldFlush(contextUsage) {
        if (!this.config.enabled) {
            return false;
        }
        return contextUsage >= this.config.flushThreshold;
    }
    /**
     * Perform memory flush
     */
    async flush(context) {
        if (!this.config.enabled) {
            return {
                success: false,
                memoriesCreated: 0,
                candidatesFound: 0,
                reason: 'Flush disabled',
            };
        }
        if (context.messages.length < this.config.minMessages) {
            return {
                success: false,
                memoriesCreated: 0,
                candidatesFound: 0,
                reason: `Insufficient messages (${context.messages.length} < ${this.config.minMessages})`,
            };
        }
        logger.info(`[MemoryFlush] Starting flush (reason: ${context.reason})`);
        try {
            // Extract memory candidates
            let candidates;
            if (this.config.extractMemories) {
                // Use AI-assisted extraction
                candidates = await this.config.extractMemories(context);
            }
            else {
                // Use rule-based extraction
                candidates = this.extractCandidatesRuleBased(context);
            }
            logger.debug(`[MemoryFlush] Found ${candidates.length} candidates`);
            // Limit candidates
            const toSave = candidates.slice(0, this.config.maxMemoriesPerFlush);
            // Save memories
            let saved = 0;
            for (const candidate of toSave) {
                try {
                    const entry = {
                        id: generateId(),
                        title: candidate.title,
                        content: candidate.content,
                        tags: [...candidate.tags, 'auto-flush', context.reason],
                        timestamp: Date.now(),
                        importance: candidate.importance,
                    };
                    if (this.config.saveMemory) {
                        await this.config.saveMemory(entry);
                    }
                    saved++;
                }
                catch (error) {
                    logger.error('[MemoryFlush] Failed to save memory:', error);
                }
            }
            this.lastFlushTime = Date.now();
            this.flushCount++;
            logger.info(`[MemoryFlush] Completed: ${saved}/${candidates.length} memories saved`);
            return {
                success: true,
                memoriesCreated: saved,
                candidatesFound: candidates.length,
                reason: `Flush successful (${context.reason})`,
            };
        }
        catch (error) {
            logger.error('[MemoryFlush] Flush failed:', error);
            return {
                success: false,
                memoriesCreated: 0,
                candidatesFound: 0,
                reason: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            };
        }
    }
    /**
     * Rule-based memory extraction (fallback when no AI available)
     */
    extractCandidatesRuleBased(context) {
        const candidates = [];
        const messages = context.messages;
        // Extract decisions and conclusions
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            if (msg.role !== 'assistant')
                continue;
            const content = msg.content;
            // Look for decision patterns
            if (this.containsDecision(content)) {
                const title = this.extractDecisionTitle(content);
                candidates.push({
                    title: title || `Decision from session ${context.sessionId}`,
                    content: this.truncate(content, 500),
                    tags: ['decision'],
                    importance: 'medium',
                    sourceMessages: [i],
                });
            }
            // Look for learned facts
            if (this.containsFact(content)) {
                const title = this.extractFactTitle(content);
                candidates.push({
                    title: title || `Fact from session ${context.sessionId}`,
                    content: this.truncate(content, 500),
                    tags: ['fact'],
                    importance: 'low',
                    sourceMessages: [i],
                });
            }
            // Look for user preferences
            if (this.containsPreference(content)) {
                candidates.push({
                    title: 'User Preference',
                    content: this.truncate(content, 300),
                    tags: ['preference', 'user'],
                    importance: 'medium',
                    sourceMessages: [i],
                });
            }
        }
        // If no specific patterns found, create a summary
        if (candidates.length === 0 && messages.length >= this.config.minMessages) {
            const summary = this.createBasicSummary(context);
            if (summary) {
                candidates.push(summary);
            }
        }
        // Deduplicate similar candidates
        return this.deduplicateCandidates(candidates);
    }
    containsDecision(text) {
        const patterns = [
            /decided to/i,
            /the decision is/i,
            /we('ll| will)/i,
            /let's/i,
            /going to/i,
            /conclusion:/i,
            /决定/,
            /选择/,
        ];
        return patterns.some(p => p.test(text));
    }
    containsFact(text) {
        const patterns = [
            /learned that/i,
            /found out/i,
            /discovered/i,
            /the .+ is/i,
            /发现/,
            /了解到/,
        ];
        return patterns.some(p => p.test(text));
    }
    containsPreference(text) {
        const patterns = [
            /you (prefer|like|want)/i,
            /your preference/i,
            /you mentioned/i,
            /你喜欢/,
            /你偏好/,
        ];
        return patterns.some(p => p.test(text));
    }
    extractDecisionTitle(text) {
        // Try to extract a brief title from the decision
        const match = text.match(/decided to ([^.!?\n]{10,50})/i);
        if (match) {
            return `Decision: ${match[1].trim()}`;
        }
        return null;
    }
    extractFactTitle(text) {
        const match = text.match(/(learned|found|discovered) (?:that )?([^.!?\n]{10,50})/i);
        if (match) {
            return `Fact: ${match[2].trim()}`;
        }
        return null;
    }
    createBasicSummary(context) {
        // Create a basic summary from the last few messages
        const recentMessages = context.messages.slice(-10);
        const userMessages = recentMessages.filter(m => m.role === 'user');
        if (userMessages.length === 0) {
            return null;
        }
        // Extract main topics
        const topics = userMessages.map(m => this.extractTopic(m.content)).filter(Boolean);
        return {
            title: `Session Summary: ${topics[0] || 'Conversation'}`,
            content: `Topics discussed:\n${topics.map(t => `- ${t}`).join('\n')}`,
            tags: ['summary', 'auto-generated'],
            importance: 'low',
            sourceMessages: recentMessages.map((_, i) => context.messages.length - 10 + i),
        };
    }
    extractTopic(text) {
        // Simple topic extraction - first meaningful phrase
        const cleaned = text.replace(/^(hey|hi|hello|please|can you|could you)/i, '').trim();
        const firstSentence = cleaned.split(/[.!?\n]/)[0].trim();
        if (firstSentence.length > 5 && firstSentence.length < 100) {
            return firstSentence;
        }
        return null;
    }
    truncate(text, maxLength) {
        if (text.length <= maxLength) {
            return text;
        }
        return text.slice(0, maxLength - 3) + '...';
    }
    deduplicateCandidates(candidates) {
        const seen = new Set();
        return candidates.filter(c => {
            const key = c.title.toLowerCase() + c.content.slice(0, 100).toLowerCase();
            if (seen.has(key)) {
                return false;
            }
            seen.add(key);
            return true;
        });
    }
    /**
     * Get flush statistics
     */
    getStats() {
        return {
            flushCount: this.flushCount,
            lastFlushTime: this.lastFlushTime,
        };
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = { ...this.config, ...config };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
/**
 * Create memory flush manager with callbacks
 */
export function createMemoryFlush(saveMemory, extractMemories, config) {
    return new MemoryFlushManager({
        ...config,
        saveMemory,
        extractMemories,
    });
}
