/**
 * Staged Summarizer
 *
 * Implements OpenClaw-style staged summarization for context compaction.
 * Splits messages into chunks, generates summaries for each, then merges.
 *
 * This is more effective than single-pass summarization for large contexts.
 */
import { logger } from '../../utils/logger.js';
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    defaultParts: 2,
    maxChunkTokens: 4000,
    charsPerToken: 4,
};
/**
 * Staged Summarizer
 *
 * Splits messages and generates summaries in stages.
 */
export class StagedSummarizer {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }
    /**
     * Generate staged summary of messages
     *
     * @param messages - Messages to summarize
     * @param parts - Number of parts to split into (optional)
     * @returns Summary result
     */
    async summarize(messages, parts) {
        const numParts = parts || this.config.defaultParts;
        const originalTokens = this.estimateTokens(messages);
        logger.debug(`[StagedSummarizer] Summarizing ${messages.length} messages in ${numParts} parts`);
        // Split messages by token share
        const chunks = this.splitMessagesByTokenShare(messages, numParts);
        // Generate summary for each chunk
        const partSummaries = [];
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            logger.debug(`[StagedSummarizer] Processing part ${i + 1}/${chunks.length} (${chunk.length} messages)`);
            const summary = await this.generateChunkSummary(chunk);
            partSummaries.push(summary);
        }
        // Merge summaries
        const mergedSummary = this.mergeSummaries(partSummaries);
        const summaryTokens = Math.ceil(mergedSummary.length / this.config.charsPerToken);
        logger.info(`[StagedSummarizer] Generated summary: ${originalTokens} → ${summaryTokens} tokens`);
        return {
            summary: mergedSummary,
            partSummaries,
            summarizedMessages: messages.length,
            originalTokens,
            summaryTokens,
        };
    }
    /**
     * Split messages by token share (equal token distribution)
     */
    splitMessagesByTokenShare(messages, parts) {
        if (messages.length === 0)
            return [];
        if (parts <= 1)
            return [messages];
        const totalTokens = this.estimateTokens(messages);
        const targetTokensPerPart = Math.ceil(totalTokens / parts);
        const chunks = [];
        let currentChunk = [];
        let currentTokens = 0;
        for (const message of messages) {
            const msgTokens = this.estimateMessageTokens(message);
            // If adding this message exceeds target, start new chunk
            if (currentTokens + msgTokens > targetTokensPerPart && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentTokens = 0;
            }
            currentChunk.push(message);
            currentTokens += msgTokens;
        }
        // Don't forget the last chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        return chunks;
    }
    /**
     * Split messages by maximum tokens per chunk
     */
    chunkMessagesByMaxTokens(messages, maxTokens) {
        if (messages.length === 0)
            return [];
        const chunks = [];
        let currentChunk = [];
        let currentTokens = 0;
        for (const message of messages) {
            const msgTokens = this.estimateMessageTokens(message);
            // Handle oversized message (single message exceeds max)
            if (msgTokens > maxTokens) {
                // Push current chunk if not empty
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentTokens = 0;
                }
                // Put oversized message in its own chunk
                chunks.push([message]);
                continue;
            }
            // If adding this message exceeds max, start new chunk
            if (currentTokens + msgTokens > maxTokens && currentChunk.length > 0) {
                chunks.push(currentChunk);
                currentChunk = [];
                currentTokens = 0;
            }
            currentChunk.push(message);
            currentTokens += msgTokens;
        }
        // Don't forget the last chunk
        if (currentChunk.length > 0) {
            chunks.push(currentChunk);
        }
        return chunks;
    }
    /**
     * Generate summary for a chunk of messages
     */
    async generateChunkSummary(messages) {
        // Use custom generator if provided
        if (this.config.generateSummary) {
            return this.config.generateSummary(messages);
        }
        // Fallback: naive extraction
        return this.naiveSummary(messages);
    }
    /**
     * Naive summary generation (fallback when no AI available)
     */
    naiveSummary(messages) {
        const userMessages = messages.filter(m => m.role === 'user');
        const assistantMessages = messages.filter(m => m.role === 'assistant');
        const toolMessages = messages.filter(m => m.role === 'tool');
        const lines = [];
        // Extract key topics from user messages
        const topics = userMessages
            .map(m => {
            const content = this.getContentString(m.content);
            const firstLine = content.split('\n')[0].slice(0, 100);
            return firstLine;
        })
            .filter(t => t.length > 10)
            .slice(0, 3);
        if (topics.length > 0) {
            lines.push('Topics discussed:');
            topics.forEach(t => lines.push(`- ${t}`));
        }
        // Count tool usage
        if (toolMessages.length > 0) {
            lines.push(`\nTool executions: ${toolMessages.length}`);
        }
        // Summary stats
        lines.push(`\nConversation: ${userMessages.length} user messages, ${assistantMessages.length} assistant responses`);
        return lines.join('\n');
    }
    /**
     * Merge multiple summaries into one
     */
    mergeSummaries(summaries) {
        if (summaries.length === 0)
            return '';
        if (summaries.length === 1)
            return summaries[0];
        const lines = ['## Conversation History Summary\n'];
        summaries.forEach((summary, i) => {
            lines.push(`### Part ${i + 1}`);
            lines.push(summary);
            lines.push('');
        });
        return lines.join('\n').trim();
    }
    /**
     * Estimate tokens for a message
     */
    estimateMessageTokens(message) {
        const content = this.getContentString(message.content);
        return Math.ceil(content.length / this.config.charsPerToken);
    }
    /**
     * Estimate total tokens for messages
     */
    estimateTokens(messages) {
        return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
    }
    /**
     * Get content as string
     */
    getContentString(content) {
        if (typeof content === 'string')
            return content;
        if (Array.isArray(content)) {
            return content
                .map(block => {
                if (typeof block === 'string')
                    return block;
                if (block.type === 'text')
                    return block.text || '';
                return JSON.stringify(block);
            })
                .join('\n');
        }
        return JSON.stringify(content);
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
 * Create staged summarizer with configuration
 */
export function createStagedSummarizer(config) {
    return new StagedSummarizer(config);
}
