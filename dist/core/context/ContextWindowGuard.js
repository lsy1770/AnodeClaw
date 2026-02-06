/**
 * Context Window Guard
 *
 * Monitors and manages context window usage, automatically compressing
 * conversation history when approaching limits
 */
import { TokenCounter } from './TokenCounter.js';
import { CompressionStrategyHandler } from './CompressionStrategy.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';
/**
 * Context Window Guard Class
 *
 * Monitors context window usage and automatically compresses when needed
 */
export class ContextWindowGuard extends EventEmitter {
    constructor(config = {}) {
        super();
        this.compressionInProgress = false;
        // Set defaults
        this.config = {
            maxTokens: config.maxTokens || 200000, // Claude Sonnet 4.5 default
            warningThreshold: config.warningThreshold || 0.7, // 70%
            compressionThreshold: config.compressionThreshold || 0.85, // 85%
            minMessagesToKeep: config.minMessagesToKeep || 10,
            compressionRatio: config.compressionRatio || 0.5, // Target 50% reduction
        };
        logger.info('[ContextWindowGuard] Initialized', this.config);
    }
    /**
     * Check context window status
     *
     * @param messages - Current conversation messages
     * @returns Status information
     */
    checkStatus(messages) {
        const currentTokens = TokenCounter.estimateMessagesTokens(messages);
        const usagePercentage = TokenCounter.calculateUsagePercentage(currentTokens, this.config.maxTokens);
        const needsWarning = usagePercentage >= this.config.warningThreshold;
        const needsCompression = usagePercentage >= this.config.compressionThreshold;
        // Calculate compressible messages (all except recent ones to keep)
        const compressibleMessages = Math.max(0, messages.length - this.config.minMessagesToKeep);
        // Estimate tokens after compression
        const targetReduction = Math.ceil(currentTokens * (1 - this.config.compressionRatio));
        const estimatedTokensAfterCompression = Math.max(currentTokens - targetReduction, currentTokens * 0.3 // Never compress below 30% of current
        );
        const status = {
            currentTokens,
            maxTokens: this.config.maxTokens,
            usagePercentage,
            needsCompression,
            needsWarning,
            compressibleMessages,
            estimatedTokensAfterCompression,
        };
        // Emit events
        if (needsCompression) {
            logger.warn(`[ContextWindowGuard] Compression needed: ${currentTokens}/${this.config.maxTokens} tokens (${Math.round(usagePercentage * 100)}%)`);
            this.emit('compressionNeeded', status);
        }
        else if (needsWarning) {
            logger.warn(`[ContextWindowGuard] Warning threshold reached: ${currentTokens}/${this.config.maxTokens} tokens (${Math.round(usagePercentage * 100)}%)`);
            this.emit('warning', status);
        }
        return status;
    }
    /**
     * Automatically compress messages if needed
     *
     * @param messages - Current conversation messages
     * @param options - Compression options (optional)
     * @returns Compressed messages or original if no compression needed
     */
    async autoCompress(messages, options) {
        // Check if compression is needed
        const status = this.checkStatus(messages);
        if (!status.needsCompression) {
            return messages;
        }
        if (this.compressionInProgress) {
            logger.warn('[ContextWindowGuard] Compression already in progress, skipping');
            return messages;
        }
        try {
            this.compressionInProgress = true;
            // Prepare compression options
            const compressionOptions = {
                strategy: options?.strategy || 'hybrid',
                preserveRecent: options?.preserveRecent || this.config.minMessagesToKeep,
                preserveImportant: options?.preserveImportant !== false, // Default true
                generateSummary: options?.generateSummary !== false, // Default true
                targetTokens: this.config.maxTokens * this.config.compressionRatio,
            };
            logger.info('[ContextWindowGuard] Starting compression', compressionOptions);
            // Perform compression
            const result = await CompressionStrategyHandler.compress(messages, compressionOptions);
            // Emit completion event
            this.emit('compressionComplete', result);
            logger.info(`[ContextWindowGuard] Compression complete: ` +
                `${messages.length} → ${result.compressedMessages.length} messages, ` +
                `saved ${result.tokensSaved} tokens`);
            return result.compressedMessages;
        }
        catch (error) {
            logger.error('[ContextWindowGuard] Compression failed:', error);
            this.emit('error', error);
            return messages; // Return original on error
        }
        finally {
            this.compressionInProgress = false;
        }
    }
    /**
     * Manually compress messages
     *
     * @param messages - Messages to compress
     * @param options - Compression options
     * @returns Compression result
     */
    async compressMessages(messages, options) {
        try {
            logger.info('[ContextWindowGuard] Manual compression requested', options);
            const result = await CompressionStrategyHandler.compress(messages, options);
            this.emit('compressionComplete', result);
            return result;
        }
        catch (error) {
            logger.error('[ContextWindowGuard] Manual compression failed:', error);
            this.emit('error', error);
            throw error;
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }
    /**
     * Update configuration
     *
     * @param config - Partial configuration to update
     */
    updateConfig(config) {
        this.config = {
            ...this.config,
            ...config,
        };
        logger.info('[ContextWindowGuard] Configuration updated', this.config);
    }
    /**
     * Calculate estimated tokens for messages
     *
     * @param messages - Messages to estimate
     * @returns Estimated token count
     */
    estimateTokens(messages) {
        return TokenCounter.estimateMessagesTokens(messages);
    }
    /**
     * Check if compression is currently in progress
     */
    isCompressing() {
        return this.compressionInProgress;
    }
}
