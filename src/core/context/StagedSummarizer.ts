/**
 * Staged Summarizer
 *
 * Implements OpenClaw-style staged summarization for context compaction.
 * Splits messages into chunks, generates summaries for each, then merges.
 *
 * This is more effective than single-pass summarization for large contexts.
 */

import { logger } from '../../utils/logger.js';
import { TokenCounter } from './TokenCounter.js';

/**
 * Message for summarization
 */
export interface SummarizableMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * Summarizer configuration
 */
export interface StagedSummarizerConfig {
  /** Number of parts to split messages into (default: 2) */
  defaultParts: number;
  /** Maximum tokens per chunk (default: 4000) */
  maxChunkTokens: number;
  /** Characters per token estimate (default: 4) */
  charsPerToken: number;
  /** Summary generation function */
  generateSummary?: (messages: SummarizableMessage[]) => Promise<string>;
}

/**
 * Summary result
 */
export interface StagedSummaryResult {
  /** Final merged summary */
  summary: string;
  /** Individual part summaries */
  partSummaries: string[];
  /** Messages that were summarized */
  summarizedMessages: number;
  /** Estimated tokens before summarization */
  originalTokens: number;
  /** Estimated tokens of summary */
  summaryTokens: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: StagedSummarizerConfig = {
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
  private config: StagedSummarizerConfig;

  constructor(config?: Partial<StagedSummarizerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate staged summary of messages
   *
   * @param messages - Messages to summarize
   * @param parts - Number of parts to split into (optional)
   * @returns Summary result
   */
  async summarize(
    messages: SummarizableMessage[],
    parts?: number
  ): Promise<StagedSummaryResult> {
    const numParts = parts || this.config.defaultParts;
    const originalTokens = this.estimateTokens(messages);

    logger.debug(
      `[StagedSummarizer] Summarizing ${messages.length} messages in ${numParts} parts`
    );

    // Split messages by token share
    const chunks = this.splitMessagesByTokenShare(messages, numParts);

    // Generate summary for each chunk
    const partSummaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      logger.debug(
        `[StagedSummarizer] Processing part ${i + 1}/${chunks.length} (${chunk.length} messages)`
      );

      const summary = await this.generateChunkSummary(chunk);
      partSummaries.push(summary);
    }

    // Merge summaries
    const mergedSummary = this.mergeSummaries(partSummaries);
    const summaryTokens = Math.ceil(mergedSummary.length / this.config.charsPerToken);

    logger.info(
      `[StagedSummarizer] Generated summary: ${originalTokens} → ${summaryTokens} tokens`
    );

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
  splitMessagesByTokenShare(
    messages: SummarizableMessage[],
    parts: number
  ): SummarizableMessage[][] {
    if (messages.length === 0) return [];
    if (parts <= 1) return [messages];

    const totalTokens = this.estimateTokens(messages);
    const targetTokensPerPart = Math.ceil(totalTokens / parts);

    const chunks: SummarizableMessage[][] = [];
    let currentChunk: SummarizableMessage[] = [];
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
  chunkMessagesByMaxTokens(
    messages: SummarizableMessage[],
    maxTokens: number
  ): SummarizableMessage[][] {
    if (messages.length === 0) return [];

    const chunks: SummarizableMessage[][] = [];
    let currentChunk: SummarizableMessage[] = [];
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
  private async generateChunkSummary(messages: SummarizableMessage[]): Promise<string> {
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
  private naiveSummary(messages: SummarizableMessage[]): string {
    const userMessages = messages.filter(m => m.role === 'user');
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const toolMessages = messages.filter(m => m.role === 'tool');

    const lines: string[] = [];

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
    lines.push(
      `\nConversation: ${userMessages.length} user messages, ${assistantMessages.length} assistant responses`
    );

    return lines.join('\n');
  }

  /**
   * Merge multiple summaries into one
   */
  private mergeSummaries(summaries: string[]): string {
    if (summaries.length === 0) return '';
    if (summaries.length === 1) return summaries[0];

    const lines: string[] = ['## Conversation History Summary\n'];

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
  private estimateMessageTokens(message: SummarizableMessage): number {
    const content = this.getContentString(message.content);
    return Math.ceil(content.length / this.config.charsPerToken);
  }

  /**
   * Estimate total tokens for messages
   */
  private estimateTokens(messages: SummarizableMessage[]): number {
    return messages.reduce((sum, m) => sum + this.estimateMessageTokens(m), 0);
  }

  /**
   * Get content as string
   */
  private getContentString(content: any): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map(block => {
          if (typeof block === 'string') return block;
          if (block.type === 'text') return block.text || '';
          return JSON.stringify(block);
        })
        .join('\n');
    }
    return JSON.stringify(content);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<StagedSummarizerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): StagedSummarizerConfig {
    return { ...this.config };
  }
}

/**
 * Create staged summarizer with configuration
 */
export function createStagedSummarizer(
  config?: Partial<StagedSummarizerConfig>
): StagedSummarizer {
  return new StagedSummarizer(config);
}
