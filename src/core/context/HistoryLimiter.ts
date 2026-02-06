/**
 * History Limiter
 *
 * Limits conversation history by number of user turns.
 * Following OpenClaw pattern for per-channel/per-user history limits.
 */

import { logger } from '../../utils/logger.js';

/**
 * Message for history limiting
 */
export interface LimitableMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any;
  timestamp: number;
  metadata?: Record<string, any>;
}

/**
 * History limit configuration
 */
export interface HistoryLimitConfig {
  /** Default limit for all channels (default: 50) */
  defaultLimit: number;
  /** Per-channel limits */
  channelLimits: Record<string, number>;
  /** Per-user limits (channel:userId format or just userId) */
  userLimits: Record<string, number>;
  /** Always preserve system messages (default: true) */
  preserveSystem: boolean;
  /** Always preserve marked important messages (default: true) */
  preserveImportant: boolean;
}

/**
 * Limit result
 */
export interface HistoryLimitResult {
  /** Limited messages */
  messages: LimitableMessage[];
  /** Whether any messages were removed */
  limited: boolean;
  /** Number of user turns kept */
  turnsKept: number;
  /** Number of messages removed */
  messagesRemoved: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: HistoryLimitConfig = {
  defaultLimit: 50,
  channelLimits: {},
  userLimits: {},
  preserveSystem: true,
  preserveImportant: true,
};

/**
 * History Limiter
 *
 * Limits history by user turns, preserving important content.
 */
export class HistoryLimiter {
  private config: HistoryLimitConfig;

  constructor(config?: Partial<HistoryLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Limit history to specified number of user turns
   *
   * @param messages - Messages to limit
   * @param limit - Number of user turns to keep (optional, uses config)
   * @param channel - Channel name for per-channel limits (optional)
   * @param userId - User ID for per-user limits (optional)
   * @returns Limited messages
   */
  limit(
    messages: LimitableMessage[],
    limit?: number,
    channel?: string,
    userId?: string
  ): HistoryLimitResult {
    const effectiveLimit = this.resolveLimit(limit, channel, userId);

    // Count user turns from the end
    const userTurnIndices: number[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        userTurnIndices.push(i);
      }
    }

    // If we're under the limit, return as-is
    if (userTurnIndices.length <= effectiveLimit) {
      return {
        messages,
        limited: false,
        turnsKept: userTurnIndices.length,
        messagesRemoved: 0,
      };
    }

    // Find the cutoff point (index of the oldest turn to keep)
    const cutoffIndex = userTurnIndices[effectiveLimit - 1];

    // Separate messages into to-drop and to-keep
    const toDrop = messages.slice(0, cutoffIndex);
    const toKeep = messages.slice(cutoffIndex);

    // Preserve system and important messages from dropped section
    const preserved: LimitableMessage[] = [];
    for (const msg of toDrop) {
      if (this.config.preserveSystem && msg.role === 'system') {
        preserved.push(msg);
      } else if (this.config.preserveImportant && msg.metadata?.important) {
        preserved.push(msg);
      }
    }

    // Combine preserved with kept messages
    const result = [...preserved, ...toKeep];
    const messagesRemoved = messages.length - result.length;

    if (messagesRemoved > 0) {
      logger.debug(
        `[HistoryLimiter] Limited to ${effectiveLimit} turns: ` +
          `removed ${messagesRemoved} messages, kept ${result.length}`
      );
    }

    return {
      messages: result,
      limited: messagesRemoved > 0,
      turnsKept: effectiveLimit,
      messagesRemoved,
    };
  }

  /**
   * Limit by message count (alternative to turn-based limiting)
   *
   * @param messages - Messages to limit
   * @param maxMessages - Maximum number of messages to keep
   * @returns Limited messages
   */
  limitByCount(
    messages: LimitableMessage[],
    maxMessages: number
  ): HistoryLimitResult {
    if (messages.length <= maxMessages) {
      return {
        messages,
        limited: false,
        turnsKept: this.countUserTurns(messages),
        messagesRemoved: 0,
      };
    }

    const cutoffIndex = messages.length - maxMessages;
    const toDrop = messages.slice(0, cutoffIndex);
    const toKeep = messages.slice(cutoffIndex);

    // Preserve system and important messages
    const preserved: LimitableMessage[] = [];
    for (const msg of toDrop) {
      if (this.config.preserveSystem && msg.role === 'system') {
        preserved.push(msg);
      } else if (this.config.preserveImportant && msg.metadata?.important) {
        preserved.push(msg);
      }
    }

    const result = [...preserved, ...toKeep];
    const messagesRemoved = messages.length - result.length;

    return {
      messages: result,
      limited: messagesRemoved > 0,
      turnsKept: this.countUserTurns(result),
      messagesRemoved,
    };
  }

  /**
   * Resolve effective limit based on priority
   * Priority: explicit limit > user limit > channel limit > default
   */
  private resolveLimit(limit?: number, channel?: string, userId?: string): number {
    // Explicit limit takes priority
    if (limit !== undefined) {
      return limit;
    }

    // Check user-specific limit
    if (userId) {
      // Check channel:userId format
      if (channel) {
        const channelUserKey = `${channel}:${userId}`;
        if (this.config.userLimits[channelUserKey] !== undefined) {
          return this.config.userLimits[channelUserKey];
        }
      }
      // Check userId only
      if (this.config.userLimits[userId] !== undefined) {
        return this.config.userLimits[userId];
      }
    }

    // Check channel-specific limit
    if (channel && this.config.channelLimits[channel] !== undefined) {
      return this.config.channelLimits[channel];
    }

    // Fall back to default
    return this.config.defaultLimit;
  }

  /**
   * Count user turns in messages
   */
  private countUserTurns(messages: LimitableMessage[]): number {
    return messages.filter(m => m.role === 'user').length;
  }

  /**
   * Set limit for a specific channel
   */
  setChannelLimit(channel: string, limit: number): void {
    this.config.channelLimits[channel] = limit;
  }

  /**
   * Set limit for a specific user
   *
   * @param userId - User ID
   * @param limit - Limit for this user
   * @param channel - Optional channel to scope the limit
   */
  setUserLimit(userId: string, limit: number, channel?: string): void {
    const key = channel ? `${channel}:${userId}` : userId;
    this.config.userLimits[key] = limit;
  }

  /**
   * Get effective limit for channel/user combination
   */
  getEffectiveLimit(channel?: string, userId?: string): number {
    return this.resolveLimit(undefined, channel, userId);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<HistoryLimitConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): HistoryLimitConfig {
    return { ...this.config };
  }
}

/**
 * Create history limiter with configuration
 */
export function createHistoryLimiter(config?: Partial<HistoryLimitConfig>): HistoryLimiter {
  return new HistoryLimiter(config);
}
