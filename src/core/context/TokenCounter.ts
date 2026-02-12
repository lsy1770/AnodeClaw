/**
 * Token Counter
 *
 * Utility for estimating token counts in messages
 */

import type { Message } from '../Session.js';
import type { TokenUsage } from './types.js';

/**
 * Token Counter Class
 *
 * Provides token counting capabilities for context management
 */
export class TokenCounter {
  // Approximate tokens per character ratio
  // Claude typically uses ~4 characters per token for English
  private static readonly CHARS_PER_TOKEN = 4;

  /**
   * Estimate token count for a string
   *
   * @param text - Text to count tokens for
   * @returns Estimated token count
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;

    // Basic estimation: characters / 4
    const charCount = text.length;
    const baseTokens = Math.ceil(charCount / this.CHARS_PER_TOKEN);

    // Add overhead for message structure
    const overhead = 4; // Role, formatting, etc.

    return baseTokens + overhead;
  }

  // Approximate token cost per image in the API (Anthropic charges ~1600 tokens for a typical image)
  private static readonly TOKENS_PER_IMAGE = 1600;

  /**
   * Estimate tokens for a message
   *
   * @param message - Message to count tokens for
   * @returns Estimated token count
   */
  static estimateMessageTokens(message: Message): number {
    let tokens = 0;

    // Count content tokens
    if (typeof message.content === 'string') {
      tokens += this.estimateTokens(message.content);
    } else if (Array.isArray(message.content)) {
      tokens += this.estimateMultimodalTokens(message.content);
    }

    // Add role overhead
    tokens += 4;

    // Add metadata overhead if present (exclude large binary fields)
    if (message.metadata) {
      const metaCopy = { ...message.metadata };
      delete metaCopy.attachments; // Don't count attachment metadata twice
      tokens += Math.ceil(JSON.stringify(metaCopy).length / this.CHARS_PER_TOKEN);
    }

    return tokens;
  }

  /**
   * Estimate tokens for multimodal content arrays.
   * Handles image blocks with fixed per-image cost instead of stringifying base64 data.
   */
  static estimateMultimodalTokens(content: any[]): number {
    let tokens = 0;

    for (const block of content) {
      if (block.type === 'image') {
        // Images have a fixed token cost in the API, regardless of base64 string length
        tokens += this.TOKENS_PER_IMAGE;
      } else if (block.type === 'text') {
        tokens += this.estimateTokens(block.text || '');
      } else if (block.type === 'tool_use' || block.type === 'tool_result') {
        tokens += this.estimateTokens(JSON.stringify(block));
      } else if (block.type === 'file') {
        // Files degrade to text descriptions, estimate a small overhead
        tokens += 50;
      } else {
        // Fallback: stringify other block types
        tokens += this.estimateTokens(JSON.stringify(block));
      }
    }

    return tokens;
  }

  /**
   * Estimate total tokens for an array of messages
   *
   * @param messages - Messages to count tokens for
   * @returns Estimated total token count
   */
  static estimateMessagesTokens(messages: Message[]): number {
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
  static createUsage(promptTokens: number, completionTokens: number = 0): TokenUsage {
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
  static calculateUsagePercentage(currentTokens: number, maxTokens: number): number {
    if (maxTokens <= 0) return 0;
    return Math.min(currentTokens / maxTokens, 1);
  }
}
