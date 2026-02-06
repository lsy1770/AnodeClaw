/**
 * Context Pruner
 *
 * Implements OpenClaw-style two-level context pruning:
 * - Soft Trim (30% threshold): Trim tool results keeping head/tail
 * - Hard Clear (50% threshold): Replace old tool results with placeholder
 *
 * This is a real-time pruning mechanism that runs on every agent iteration,
 * separate from the full compression strategy.
 */
import { logger } from '../../utils/logger.js';
/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
    softTrimRatio: 0.3,
    hardClearRatio: 0.5,
    softTrim: {
        maxChars: 4000,
        headChars: 1500,
        tailChars: 1500,
        placeholder: '\n\n[... middle content trimmed ...]\n\n',
    },
    hardClear: {
        enabled: true,
        placeholder: '[Old tool result content cleared]',
    },
    minPrunableToolChars: 50000,
    charsPerToken: 4,
    imageCharEstimate: 8000,
};
/**
 * Context Pruner
 *
 * Real-time pruning of tool results to manage context window.
 */
export class ContextPruner {
    constructor(config) {
        this.config = {
            ...DEFAULT_CONFIG,
            ...config,
            softTrim: { ...DEFAULT_CONFIG.softTrim, ...config?.softTrim },
            hardClear: { ...DEFAULT_CONFIG.hardClear, ...config?.hardClear },
        };
    }
    /**
     * Prune messages based on context usage ratio
     *
     * @param messages - Messages to potentially prune
     * @param currentTokens - Current estimated token count
     * @param maxTokens - Maximum allowed tokens
     * @returns Pruned messages and statistics
     */
    prune(messages, currentTokens, maxTokens) {
        const ratio = currentTokens / maxTokens;
        // No pruning needed
        if (ratio < this.config.softTrimRatio) {
            return {
                messages,
                pruned: false,
                softTrimCount: 0,
                hardClearCount: 0,
                charsSaved: 0,
                tokensSaved: 0,
            };
        }
        logger.debug(`[ContextPruner] Pruning triggered at ${(ratio * 100).toFixed(1)}% usage`);
        // Create a copy for modification
        const prunedMessages = messages.map(m => ({ ...m }));
        let softTrimCount = 0;
        let hardClearCount = 0;
        let charsSaved = 0;
        // Determine pruning level
        const useHardClear = ratio >= this.config.hardClearRatio && this.config.hardClear.enabled;
        // Find first user message index (protect bootstrap content before it)
        const firstUserIndex = prunedMessages.findIndex(m => m.role === 'user');
        const protectedIndex = firstUserIndex > 0 ? firstUserIndex : 0;
        // Process tool results
        for (let i = protectedIndex; i < prunedMessages.length; i++) {
            const msg = prunedMessages[i];
            // Only process tool results
            if (msg.role !== 'tool')
                continue;
            // Skip already pruned messages
            if (msg.metadata?.pruned)
                continue;
            // Get content as string
            const content = this.getContentString(msg.content);
            const originalLength = content.length;
            // Check if content is prunable (large enough)
            if (originalLength < this.config.softTrim.maxChars)
                continue;
            if (useHardClear) {
                // Hard clear: replace with placeholder
                msg.content = this.config.hardClear.placeholder;
                msg.metadata = {
                    ...msg.metadata,
                    pruned: true,
                    originalLength,
                    pruneType: 'hard_clear',
                };
                hardClearCount++;
                charsSaved += originalLength - this.config.hardClear.placeholder.length;
            }
            else {
                // Soft trim: keep head and tail
                const trimmed = this.softTrimContent(content);
                msg.content = trimmed;
                msg.metadata = {
                    ...msg.metadata,
                    pruned: true,
                    originalLength,
                    pruneType: 'soft_trim',
                };
                softTrimCount++;
                charsSaved += originalLength - trimmed.length;
            }
        }
        const tokensSaved = Math.floor(charsSaved / this.config.charsPerToken);
        if (softTrimCount > 0 || hardClearCount > 0) {
            logger.info(`[ContextPruner] Pruned ${softTrimCount} soft-trimmed, ${hardClearCount} hard-cleared, ` +
                `saved ~${tokensSaved} tokens`);
        }
        return {
            messages: prunedMessages,
            pruned: softTrimCount > 0 || hardClearCount > 0,
            softTrimCount,
            hardClearCount,
            charsSaved,
            tokensSaved,
        };
    }
    /**
     * Soft trim content: keep head and tail, remove middle
     */
    softTrimContent(content) {
        const { headChars, tailChars, placeholder } = this.config.softTrim;
        if (content.length <= headChars + tailChars + placeholder.length) {
            return content; // No benefit from trimming
        }
        const head = content.slice(0, headChars);
        const tail = content.slice(-tailChars);
        return head + placeholder + tail;
    }
    /**
     * Get content as string
     */
    getContentString(content) {
        if (typeof content === 'string') {
            return content;
        }
        if (Array.isArray(content)) {
            return content
                .map(block => {
                if (block.type === 'text')
                    return block.text || '';
                if (block.type === 'image')
                    return '[IMAGE]';
                return JSON.stringify(block);
            })
                .join('\n');
        }
        return JSON.stringify(content);
    }
    /**
     * Estimate message characters (for ratio calculation)
     */
    estimateMessageChars(message) {
        const content = message.content;
        if (typeof content === 'string') {
            return content.length;
        }
        if (Array.isArray(content)) {
            let chars = 0;
            for (const block of content) {
                if (block.type === 'text') {
                    chars += (block.text || '').length;
                }
                else if (block.type === 'image' || block.type === 'image_url') {
                    chars += this.config.imageCharEstimate;
                }
                else if (block.type === 'tool_use') {
                    chars += JSON.stringify(block.input || {}).length;
                }
                else if (block.type === 'tool_result') {
                    chars += (block.content || '').length;
                }
                else {
                    chars += JSON.stringify(block).length;
                }
            }
            return chars;
        }
        return JSON.stringify(content).length;
    }
    /**
     * Estimate total characters for messages
     */
    estimateTotalChars(messages) {
        return messages.reduce((sum, msg) => sum + this.estimateMessageChars(msg), 0);
    }
    /**
     * Calculate prunable characters (tool results that can be pruned)
     */
    calculatePrunableChars(messages) {
        let prunableChars = 0;
        for (const msg of messages) {
            if (msg.role !== 'tool')
                continue;
            if (msg.metadata?.pruned)
                continue;
            const chars = this.estimateMessageChars(msg);
            if (chars >= this.config.softTrim.maxChars) {
                prunableChars += chars;
            }
        }
        return prunableChars;
    }
    /**
     * Check if pruning would help (enough prunable content)
     */
    canPrune(messages) {
        const prunableChars = this.calculatePrunableChars(messages);
        return prunableChars >= this.config.minPrunableToolChars;
    }
    /**
     * Update configuration
     */
    setConfig(config) {
        this.config = {
            ...this.config,
            ...config,
            softTrim: { ...this.config.softTrim, ...config?.softTrim },
            hardClear: { ...this.config.hardClear, ...config?.hardClear },
        };
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
}
/**
 * Create context pruner with configuration
 */
export function createContextPruner(config) {
    return new ContextPruner(config);
}
