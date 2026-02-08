/**
 * Proactive Behavior
 *
 * AI-driven suggestion engine that analyzes daily logs, task history,
 * and context to generate actionable insights. Combines heuristic checks
 * with optional AI-powered analysis for deeper insights.
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import type { DailyLogManager } from '../memory/DailyLogManager.js';
import type { MemorySystem } from '../memory/MemorySystem.js';
import type { HeartbeatTaskConfig } from '../heartbeat/types.js';

/**
 * A proactive suggestion emitted by the engine
 */
export interface ProactiveSuggestion {
  type: 'follow-up' | 'optimization' | 'warning' | 'reminder' | 'insight';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

/**
 * AI insight generator callback type
 */
export type AIInsightGenerator = (context: string) => Promise<string | null>;

/**
 * ProactiveBehavior configuration
 */
export interface ProactiveBehaviorConfig {
  /** Enable/disable proactive checks */
  enabled: boolean;
  /** Heartbeat check interval in ms (default: 15 min) */
  checkInterval: number;
  /** Quiet hours — skip checks during this window */
  quietHoursStart: number;  // hour 0-23
  quietHoursEnd: number;    // hour 0-23
  /** Threshold for "repeated pattern" detection */
  repeatThreshold: number;
  /** Idle session timeout in ms (default: 2h) */
  idleSessionTimeout: number;
}

const DEFAULT_CONFIG: ProactiveBehaviorConfig = {
  enabled: true,
  checkInterval: 15 * 60 * 1000,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  repeatThreshold: 5,
  idleSessionTimeout: 2 * 60 * 60 * 1000,
};

/**
 * ProactiveBehavior Class
 *
 * Emits a `'suggestions'` event with an array of ProactiveSuggestion
 * whenever new suggestions are generated.
 */
export class ProactiveBehavior extends EventEmitter {
  private config: ProactiveBehaviorConfig;
  private memorySystem: MemorySystem;
  private dailyLogManager: DailyLogManager;
  private getActiveSessions: () => string[];
  /** Track recently sent notifications to prevent spam */
  private recentNotifications: Map<string, number> = new Map();
  /** Cooldown period for notifications (1 hour) */
  private readonly NOTIFICATION_COOLDOWN = 60 * 60 * 1000;
  /** Optional AI insight generator callback */
  private aiInsightGenerator: AIInsightGenerator | null = null;
  /** Last AI insight timestamp (to rate limit AI calls) */
  private lastAIInsightTime: number = 0;
  /** Minimum interval between AI insight calls (1 hour) */
  private readonly AI_INSIGHT_INTERVAL = 60 * 60 * 1000;

  constructor(
    config: Partial<ProactiveBehaviorConfig> | undefined,
    memorySystem: MemorySystem,
    dailyLogManager: DailyLogManager,
    getActiveSessions: () => string[],
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memorySystem = memorySystem;
    this.dailyLogManager = dailyLogManager;
    this.getActiveSessions = getActiveSessions;
  }

  /**
   * Set the AI insight generator callback
   * This is called by AgentManager after initialization
   */
  setAIInsightGenerator(generator: AIInsightGenerator): void {
    this.aiInsightGenerator = generator;
    logger.info('[Proactive] AI insight generator registered');
  }

  /**
   * Run all heuristic checks and return suggestions
   */
  async check(): Promise<ProactiveSuggestion[]> {
    if (!this.config.enabled) return [];
    if (this.isQuietHours()) {
      logger.debug('[Proactive] Quiet hours — skipping checks');
      return [];
    }

    let suggestions: ProactiveSuggestion[] = [];

    try {
      // Run heuristic checks in parallel
      const [pending, repeated, idle, errors] = await Promise.all([
        this.checkPendingTasks(),
        this.checkRepeatedPatterns(),
        this.checkIdleSessions(),
        this.checkErrorPatterns(),
      ]);

      suggestions.push(...pending, ...repeated, ...idle, ...errors);

      // Try to generate AI insights (rate-limited internally)
      const aiInsights = await this.generateAIInsights();
      suggestions.push(...aiInsights);

      // Deduplicate - filter out recently sent notifications
      suggestions = this.deduplicateSuggestions(suggestions);
    } catch (err) {
      logger.warn('[Proactive] Check failed:', err);
    }

    if (suggestions.length > 0) {
      this.emit('suggestions', suggestions);
      logger.info(`[Proactive] Generated ${suggestions.length} suggestion(s)`);
    }

    return suggestions;
  }

  /**
   * Analyze a completed task and return follow-up suggestions
   */
  async analyzeTaskCompletion(task: string, result: 'success' | 'failure'): Promise<ProactiveSuggestion[]> {
    if (!this.config.enabled) return [];

    const suggestions: ProactiveSuggestion[] = [];

    if (result === 'failure') {
      suggestions.push({
        type: 'follow-up',
        title: 'Task failed',
        description: `The task "${task.slice(0, 60)}" failed. Consider retrying or investigating the error.`,
        priority: 'medium',
        timestamp: Date.now(),
      });
    }

    if (result === 'success') {
      // Check if user frequently runs similar tasks — suggest automation
      try {
        const recentLogs = await this.dailyLogManager.getRecentLogs(7);
        const allCompleted = recentLogs.flatMap(l => l.tasksCompleted);
        const similar = allCompleted.filter(t => this.textSimilarity(t, task) > 0.5);

        if (similar.length >= this.config.repeatThreshold) {
          suggestions.push({
            type: 'optimization',
            title: 'Repeated task detected',
            description: `"${task.slice(0, 40)}" has been completed ${similar.length} times recently. Consider automating it.`,
            priority: 'low',
            timestamp: Date.now(),
          });
        }
      } catch {
        // non-critical
      }
    }

    if (suggestions.length > 0) {
      this.emit('suggestions', suggestions);
    }

    return suggestions;
  }

  /**
   * Create a heartbeat task config for periodic proactive checks
   */
  createHeartbeatTask(): HeartbeatTaskConfig {
    return {
      id: 'builtin:proactive-check',
      name: 'Proactive Behavior Check',
      description: 'Periodically checks for pending tasks, repeated patterns, idle sessions, and error patterns',
      schedule: {
        type: 'interval',
        interval: this.config.checkInterval,
      },
      enabled: this.config.enabled,
      handler: async () => {
        await this.check();
      },
      onError: (error) => {
        logger.error('[Proactive] Heartbeat task error:', error.message);
      },
    };
  }

  // ===== Heuristic check methods =====

  /**
   * Check for pending tasks and generate reminders
   */
  private async checkPendingTasks(): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      const pending = await this.dailyLogManager.getPendingTasks();
      if (pending.length > 0) {
        suggestions.push({
          type: 'reminder',
          title: `${pending.length} pending task(s)`,
          description: `You have ${pending.length} pending task(s): ${pending.slice(0, 3).join(', ')}${pending.length > 3 ? '...' : ''}`,
          priority: pending.length >= 5 ? 'high' : 'medium',
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.debug('[Proactive] checkPendingTasks failed:', err);
    }

    return suggestions;
  }

  /**
   * Check for repeated patterns in recent activity
   */
  private async checkRepeatedPatterns(): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      const recentLogs = await this.dailyLogManager.getRecentLogs(7);
      const allCompleted = recentLogs.flatMap(l => l.tasksCompleted);

      // Count similar tasks
      const taskCounts = new Map<string, number>();
      for (const task of allCompleted) {
        const normalized = task.toLowerCase().trim();
        // Group similar tasks
        let foundKey = false;
        for (const [key, count] of taskCounts) {
          if (this.textSimilarity(key, normalized) > 0.6) {
            taskCounts.set(key, count + 1);
            foundKey = true;
            break;
          }
        }
        if (!foundKey) {
          taskCounts.set(normalized, 1);
        }
      }

      for (const [task, count] of taskCounts) {
        if (count >= this.config.repeatThreshold) {
          suggestions.push({
            type: 'optimization',
            title: 'Repeated task pattern',
            description: `"${task.slice(0, 50)}" has been done ${count} times this week. Consider creating an automation or macro.`,
            priority: 'low',
            timestamp: Date.now(),
          });
        }
      }
    } catch (err) {
      logger.debug('[Proactive] checkRepeatedPatterns failed:', err);
    }

    return suggestions;
  }

  /**
   * Check for idle sessions
   */
  private async checkIdleSessions(): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];
    const activeSessions = this.getActiveSessions();

    if (activeSessions.length > 3) {
      suggestions.push({
        type: 'warning',
        title: 'Many active sessions',
        description: `${activeSessions.length} sessions are active. Consider closing unused sessions to free resources.`,
        priority: 'low',
        timestamp: Date.now(),
      });
    }

    return suggestions;
  }

  /**
   * Check for repeated error patterns
   */
  private async checkErrorPatterns(): Promise<ProactiveSuggestion[]> {
    const suggestions: ProactiveSuggestion[] = [];

    try {
      const todayLog = await this.dailyLogManager.getTodayLog();
      const errors = todayLog.errors;

      if (errors.length >= 3) {
        // Look for repeated error messages
        const errorCounts = new Map<string, number>();
        for (const err of errors) {
          const msg = err.replace(/^\d{2}:\d{2}:\s*/, '').toLowerCase().trim();
          const normalized = msg.slice(0, 80);
          errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
        }

        for (const [errMsg, count] of errorCounts) {
          if (count >= 2) {
            suggestions.push({
              type: 'warning',
              title: `Repeated error (x${count})`,
              description: `Error "${errMsg.slice(0, 60)}" occurred ${count} times today. This may need investigation.`,
              priority: 'high',
              timestamp: Date.now(),
            });
          }
        }
      }

      if (errors.length >= 5) {
        suggestions.push({
          type: 'warning',
          title: `High error rate (${errors.length})`,
          description: `${errors.length} errors recorded today. System stability may be affected.`,
          priority: 'high',
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      logger.debug('[Proactive] checkErrorPatterns failed:', err);
    }

    return suggestions;
  }

  /**
   * Generate AI-powered insights based on recent activity
   * Rate-limited to avoid excessive API calls
   */
  async generateAIInsights(): Promise<ProactiveSuggestion[]> {
    if (!this.aiInsightGenerator) {
      logger.debug('[Proactive] AI insight generator not available');
      return [];
    }

    // Rate limit AI calls
    const now = Date.now();
    if (now - this.lastAIInsightTime < this.AI_INSIGHT_INTERVAL) {
      logger.debug('[Proactive] AI insight rate limited, skipping');
      return [];
    }

    try {
      // Build context from recent activity
      const context = await this.buildAIContext();
      if (!context) {
        return [];
      }

      logger.info('[Proactive] Generating AI insights...');
      const insight = await this.aiInsightGenerator(context);
      this.lastAIInsightTime = now;

      if (!insight || insight.trim().length === 0) {
        return [];
      }

      // Parse the AI response into suggestions
      return this.parseAIInsight(insight);
    } catch (err) {
      logger.warn('[Proactive] AI insight generation failed:', err);
      return [];
    }
  }

  /**
   * Build context string for AI analysis
   */
  private async buildAIContext(): Promise<string | null> {
    try {
      const todayLog = await this.dailyLogManager.getTodayLog();
      const recentLogs = await this.dailyLogManager.getRecentLogs(3);

      // Skip if no meaningful activity
      if (todayLog.sessions.length === 0 && todayLog.tasksCompleted.length === 0) {
        return null;
      }

      const lines: string[] = [];
      lines.push('# Recent Activity Summary');
      lines.push('');

      // Today's activity
      lines.push('## Today');
      if (todayLog.sessions.length > 0) {
        lines.push(`Sessions: ${todayLog.sessions.length}`);
        for (const s of todayLog.sessions.slice(-3)) {
          lines.push(`- ${s.timeRange}: ${s.summary} (${s.result})`);
        }
      }
      if (todayLog.tasksCompleted.length > 0) {
        lines.push(`Completed tasks: ${todayLog.tasksCompleted.join(', ')}`);
      }
      if (todayLog.tasksPending.length > 0) {
        lines.push(`Pending tasks: ${todayLog.tasksPending.join(', ')}`);
      }
      if (todayLog.errors.length > 0) {
        lines.push(`Errors today: ${todayLog.errors.length}`);
      }

      // Recent patterns
      const allCompleted = recentLogs.flatMap(l => l.tasksCompleted);
      if (allCompleted.length > 0) {
        lines.push('');
        lines.push('## Recent Tasks (last 3 days)');
        lines.push(allCompleted.slice(-10).join(', '));
      }

      return lines.join('\n');
    } catch (err) {
      logger.debug('[Proactive] buildAIContext failed:', err);
      return null;
    }
  }

  /**
   * Parse AI response into ProactiveSuggestion array
   */
  private parseAIInsight(insight: string): ProactiveSuggestion[] {
    const suggestions: ProactiveSuggestion[] = [];

    const trimmed = insight.trim();
    if (trimmed) {
      // Use first sentence or first 60 chars as title for better dedup
      const firstSentence = trimmed.split(/[.!?。！？\n]/)[0]?.trim() || 'AI Insight';
      suggestions.push({
        type: 'insight',
        title: firstSentence.slice(0, 60),
        description: trimmed.slice(0, 500),
        priority: 'medium',
        timestamp: Date.now(),
      });
    }

    return suggestions;
  }

  /**
   * Deduplicate suggestions by checking recent notification history
   * Prevents the same notification from being sent within the cooldown period
   */
  private deduplicateSuggestions(suggestions: ProactiveSuggestion[]): ProactiveSuggestion[] {
    const now = Date.now();
    const result: ProactiveSuggestion[] = [];

    // Clean up expired entries
    for (const [key, timestamp] of this.recentNotifications) {
      if (now - timestamp > this.NOTIFICATION_COOLDOWN) {
        this.recentNotifications.delete(key);
      }
    }

    // Filter out recently sent notifications
    // Key includes type + title + description prefix to distinguish similar suggestions
    for (const suggestion of suggestions) {
      const descKey = suggestion.description.slice(0, 40);
      const key = `${suggestion.type}:${suggestion.title}:${descKey}`;

      if (!this.recentNotifications.has(key)) {
        result.push(suggestion);
        this.recentNotifications.set(key, now);
      } else {
        logger.debug(`[Proactive] Skipping duplicate notification: ${suggestion.title}`);
      }
    }

    return result;
  }

  // ===== Utility methods =====

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(): boolean {
    const hour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.config;

    if (quietHoursStart <= quietHoursEnd) {
      // Non-wrapping case, e.g., 8-22 (quiet from 8 AM to 10 PM)
      return hour >= quietHoursStart && hour < quietHoursEnd;
    }

    // Wrap-around case, e.g., 23-7 (quiet from 11 PM to 7 AM)
    return hour >= quietHoursStart || hour < quietHoursEnd;
  }

  /**
   * Simple text similarity (Jaccard on word set)
   */
  private textSimilarity(a: string, b: string): number {
    const setA = new Set(a.toLowerCase().split(/\s+/));
    const setB = new Set(b.toLowerCase().split(/\s+/));

    let intersection = 0;
    for (const word of setA) {
      if (setB.has(word)) intersection++;
    }

    const union = setA.size + setB.size - intersection;
    return union === 0 ? 0 : intersection / union;
  }
}
