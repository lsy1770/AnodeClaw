/**
 * Compression Strategy
 *
 * Implements different strategies for compressing conversation history
 */
import { TokenCounter } from './TokenCounter.js';
import { logger } from '../../utils/logger.js';
/** Optional AI model for generating summaries */
let _modelAPI = null;
let _summaryModel = 'claude-3-haiku-20240307';
/**
 * Set the ModelAPI instance for AI-powered compression
 */
export function setCompressionModelAPI(modelAPI, model) {
    _modelAPI = modelAPI;
    if (model)
        _summaryModel = model;
    logger.info('[Compression] AI-powered summarization enabled');
}
/**
 * Compression Strategy Handler
 */
export class CompressionStrategyHandler {
    /**
     * Compress messages using specified strategy
     *
     * @param messages - Messages to compress
     * @param options - Compression options
     * @returns Compression result
     */
    static async compress(messages, options) {
        const originalTokens = TokenCounter.estimateMessagesTokens(messages);
        let result;
        switch (options.strategy) {
            case 'summary':
                result = await this.summaryStrategy(messages, options);
                break;
            case 'prune':
                result = await this.pruneStrategy(messages, options);
                break;
            case 'hybrid':
                result = await this.hybridStrategy(messages, options);
                break;
            default:
                throw new Error(`Unknown compression strategy: ${options.strategy}`);
        }
        const compressedTokens = TokenCounter.estimateMessagesTokens(result.compressedMessages);
        result.tokensSaved = originalTokens - compressedTokens;
        result.compressionRatio = compressedTokens / originalTokens;
        logger.info(`[Compression] Strategy: ${options.strategy}, ` +
            `Tokens: ${originalTokens} → ${compressedTokens} ` +
            `(${Math.round(result.compressionRatio * 100)}% retained, ` +
            `${result.tokensSaved} saved)`);
        return result;
    }
    /**
     * Summary strategy: Generate AI summary of old messages
     *
     * @param messages - Messages to compress
     * @param options - Compression options
     * @returns Compression result
     */
    static async summaryStrategy(messages, options) {
        const preserveRecent = options.preserveRecent || 10;
        // Split into messages to compress and messages to keep
        const toCompress = messages.slice(0, -preserveRecent);
        const toKeep = messages.slice(-preserveRecent);
        // Generate summary (AI-powered when available, naive fallback)
        const summary = await this.generateSummary(toCompress);
        // Create summary message
        const summaryMessage = {
            id: `summary-${Date.now()}`,
            role: 'system',
            content: `[Compressed History Summary]\n\n${summary}`,
            timestamp: Date.now(),
            parentId: null,
            children: [],
            metadata: {
                compressed: true,
                originalMessageCount: toCompress.length,
            },
        };
        return {
            originalMessages: messages,
            compressedMessages: [summaryMessage, ...toKeep],
            summary,
            tokensSaved: 0, // Will be calculated by compress()
            compressionRatio: 0, // Will be calculated by compress()
            timestamp: Date.now(),
        };
    }
    /**
     * Prune strategy: Remove old messages, keep recent ones
     *
     * @param messages - Messages to compress
     * @param options - Compression options
     * @returns Compression result
     */
    static pruneStrategy(messages, options) {
        const preserveRecent = options.preserveRecent || 10;
        // Filter messages
        let toKeep = [];
        if (options.preserveImportant) {
            // Keep important messages
            const important = messages.filter((m) => m.metadata?.important || m.role === 'system');
            toKeep.push(...important);
        }
        // Add recent messages
        const recent = messages.slice(-preserveRecent);
        toKeep.push(...recent);
        // Deduplicate by ID
        const uniqueMessages = Array.from(new Map(toKeep.map((m) => [m.id, m])).values());
        // Sort by timestamp
        uniqueMessages.sort((a, b) => a.timestamp - b.timestamp);
        return Promise.resolve({
            originalMessages: messages,
            compressedMessages: uniqueMessages,
            summary: `Pruned ${messages.length - uniqueMessages.length} messages`,
            tokensSaved: 0, // Will be calculated by compress()
            compressionRatio: 0, // Will be calculated by compress()
            timestamp: Date.now(),
        });
    }
    /**
     * Hybrid strategy: Combine summary and pruning
     *
     * @param messages - Messages to compress
     * @param options - Compression options
     * @returns Compression result
     */
    static async hybridStrategy(messages, options) {
        const preserveRecent = options.preserveRecent || 15;
        const summaryBoundary = Math.floor(messages.length * 0.5);
        // Split into three parts:
        // 1. Old messages to summarize
        // 2. Middle messages to prune
        // 3. Recent messages to keep
        const toSummarize = messages.slice(0, summaryBoundary);
        const toPrune = messages.slice(summaryBoundary, -preserveRecent);
        const toKeep = messages.slice(-preserveRecent);
        // Summarize old messages
        const summary = await this.generateSummary(toSummarize);
        const summaryMessage = {
            id: `summary-${Date.now()}`,
            role: 'system',
            content: `[Compressed History Summary]\n\n${summary}`,
            timestamp: Date.now(),
            parentId: null,
            children: [],
            metadata: {
                compressed: true,
                originalMessageCount: toSummarize.length,
            },
        };
        // Prune middle messages (keep only important ones)
        const prunedMiddle = options.preserveImportant
            ? toPrune.filter((m) => m.metadata?.important || m.role === 'system')
            : [];
        // Combine all parts
        const compressedMessages = [summaryMessage, ...prunedMiddle, ...toKeep];
        return {
            originalMessages: messages,
            compressedMessages,
            summary,
            tokensSaved: 0, // Will be calculated by compress()
            compressionRatio: 0, // Will be calculated by compress()
            timestamp: Date.now(),
        };
    }
    /**
     * Generate AI summary of messages
     * Uses ModelAPI for AI-powered summarization, falls back to naive extraction.
     *
     * @param messages - Messages to summarize
     * @returns Summary text
     */
    static async generateSummary(messages) {
        // Attempt AI-powered summary if ModelAPI is available
        if (_modelAPI) {
            try {
                return await this.generateAISummary(messages);
            }
            catch (error) {
                logger.warn('[Compression] AI summary failed, falling back to naive extraction:', error);
            }
        }
        // Fallback: naive topic extraction
        return this.generateNaiveSummary(messages);
    }
    /**
     * Generate summary using AI model
     */
    static async generateAISummary(messages) {
        // Build a condensed representation of the conversation
        const conversationText = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .map(m => {
            const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            // Truncate very long messages
            const truncated = content.length > 500 ? content.slice(0, 500) + '...' : content;
            return `${m.role}: ${truncated}`;
        })
            .join('\n');
        const summaryRequest = {
            id: `summary-req-${Date.now()}`,
            role: 'user',
            content: `请用中文简要总结以下对话的关键内容、决策和重要信息。保留具体的技术细节、文件路径、代码片段等关键信息。\n\n对话内容：\n${conversationText}`,
            timestamp: Date.now(),
            parentId: null,
            children: [],
        };
        const response = await _modelAPI.createMessage({
            model: _summaryModel,
            messages: [summaryRequest],
            maxTokens: 1024,
            temperature: 0.3,
            systemPrompt: 'You are a conversation summarizer. Create concise but comprehensive summaries preserving key technical details, decisions, file paths, and code references. Respond in the same language as the conversation.',
        });
        if (response.content && typeof response.content === 'string') {
            logger.info(`[Compression] AI summary generated (${response.content.length} chars)`);
            return response.content;
        }
        throw new Error('AI summary returned empty content');
    }
    /**
     * Fallback: generate summary using naive topic extraction
     */
    static generateNaiveSummary(messages) {
        const userMessages = messages.filter((m) => m.role === 'user');
        const assistantMessages = messages.filter((m) => m.role === 'assistant');
        const topics = this.extractTopics(messages);
        return (`This conversation covered ${messages.length} messages over ${topics.length} topics:\n` +
            topics.map((topic, i) => `${i + 1}. ${topic}`).join('\n') +
            `\n\nUser asked ${userMessages.length} questions, assistant provided ${assistantMessages.length} responses.`);
    }
    /**
     * Extract topics from messages (simple keyword extraction)
     *
     * @param messages - Messages to analyze
     * @returns Array of topics
     */
    static extractTopics(messages) {
        const topics = [];
        for (const message of messages) {
            if (message.role === 'user' && typeof message.content === 'string') {
                // Extract first sentence as topic
                const firstSentence = message.content.split(/[.!?]/)[0].trim();
                if (firstSentence.length > 10 && firstSentence.length < 100) {
                    topics.push(firstSentence);
                }
            }
        }
        // Return up to 5 topics
        return topics.slice(0, 5);
    }
}
