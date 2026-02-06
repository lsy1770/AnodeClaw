/**
 * Token Counter
 *
 * Utility for estimating token counts in messages
 */
/**
 * Token Counter Class
 *
 * Provides token counting capabilities for context management
 */
export class TokenCounter {
    /**
     * Estimate token count for a string
     *
     * @param text - Text to count tokens for
     * @returns Estimated token count
     */
    static estimateTokens(text) {
        if (!text)
            return 0;
        // Basic estimation: characters / 4
        const charCount = text.length;
        const baseTokens = Math.ceil(charCount / this.CHARS_PER_TOKEN);
        // Add overhead for message structure
        const overhead = 4; // Role, formatting, etc.
        return baseTokens + overhead;
    }
    /**
     * Estimate tokens for a message
     *
     * @param message - Message to count tokens for
     * @returns Estimated token count
     */
    static estimateMessageTokens(message) {
        let tokens = 0;
        // Count content tokens
        if (typeof message.content === 'string') {
            tokens += this.estimateTokens(message.content);
        }
        else if (Array.isArray(message.content)) {
            // Tool calls or results
            tokens += this.estimateTokens(JSON.stringify(message.content));
        }
        // Add role overhead
        tokens += 4;
        // Add metadata overhead if present
        if (message.metadata) {
            tokens += Math.ceil(JSON.stringify(message.metadata).length / this.CHARS_PER_TOKEN);
        }
        return tokens;
    }
    /**
     * Estimate total tokens for an array of messages
     *
     * @param messages - Messages to count tokens for
     * @returns Estimated total token count
     */
    static estimateMessagesTokens(messages) {
        let total = 0;
        for (const message of messages) {
            total += this.estimateMessageTokens(message);
        }
        // Add conversation overhead
        const conversationOverhead = 10;
        return total + conversationOverhead;
    }
    /**
     * Create token usage object
     *
     * @param promptTokens - Tokens in prompt
     * @param completionTokens - Tokens in completion
     * @returns TokenUsage object
     */
    static createUsage(promptTokens, completionTokens = 0) {
        return {
            totalTokens: promptTokens + completionTokens,
            promptTokens,
            completionTokens,
            timestamp: Date.now(),
        };
    }
    /**
     * Calculate percentage of context window used
     *
     * @param currentTokens - Current token count
     * @param maxTokens - Maximum tokens allowed
     * @returns Usage percentage (0-1)
     */
    static calculateUsagePercentage(currentTokens, maxTokens) {
        if (maxTokens <= 0)
            return 0;
        return Math.min(currentTokens / maxTokens, 1);
    }
}
// Approximate tokens per character ratio
// Claude typically uses ~4 characters per token for English
TokenCounter.CHARS_PER_TOKEN = 4;
