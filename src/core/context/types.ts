/**
 * Context Window Guard - Types
 *
 * Type definitions for context window management
 */

import type { Message } from '../Session.js';

/**
 * Token usage information
 */
export interface TokenUsage {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  timestamp: number;
}

/**
 * Context window configuration
 */
export interface ContextWindowConfig {
  maxTokens: number; // Maximum context window size
  warningThreshold: number; // Percentage (0-1) to trigger warning
  compressionThreshold: number; // Percentage (0-1) to trigger compression
  minMessagesToKeep: number; // Minimum messages to keep uncompressed
  compressionRatio: number; // Target compression ratio (0-1)
}

/**
 * Context window status
 */
export interface ContextWindowStatus {
  currentTokens: number;
  maxTokens: number;
  usagePercentage: number;
  needsCompression: boolean;
  needsWarning: boolean;
  compressibleMessages: number;
  estimatedTokensAfterCompression: number;
}

/**
 * Compression result
 */
export interface CompressionResult {
  originalMessages: Message[];
  compressedMessages: Message[];
  summary: string;
  tokensSaved: number;
  compressionRatio: number;
  timestamp: number;
}

/**
 * Compression strategy
 */
export type CompressionStrategy = 'summary' | 'prune' | 'hybrid';

/**
 * Compression options
 */
export interface CompressionOptions {
  strategy: CompressionStrategy;
  targetTokens?: number;
  preserveRecent?: number; // Number of recent messages to preserve
  preserveImportant?: boolean; // Preserve messages marked as important
  generateSummary?: boolean; // Generate AI summary
}
