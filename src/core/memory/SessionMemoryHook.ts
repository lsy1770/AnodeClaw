/**
 * Session Memory Hook
 *
 * Automatically converts session summaries to persistent memory entries.
 * Triggered when:
 * - A session ends
 * - /new command creates a new session
 * - Context window compression occurs
 *
 * Following OpenClaw pattern for session-to-memory conversion.
 */

import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import type { MemoryEntry } from './types.js';

/**
 * Session summary for memory conversion
 */
export interface SessionSummary {
  /** Session ID */
  sessionId: string;
  /** Session start time */
  startTime: number;
  /** Session end time */
  endTime: number;
  /** Main topics discussed */
  topics: string[];
  /** Key decisions made */
  decisions: string[];
  /** Tasks completed */
  tasksCompleted: string[];
  /** Tasks pending */
  tasksPending: string[];
  /** Important facts learned */
  facts: string[];
  /** User preferences noted */
  preferences: string[];
  /** Free-form summary text */
  summaryText: string;
  /** Suggested tags for memory */
  suggestedTags: string[];
  /** Importance level */
  importance: 'low' | 'medium' | 'high';
}

/**
 * Hook configuration
 */
export interface SessionMemoryHookConfig {
  /** Enable automatic memory creation (default: true) */
  enabled: boolean;
  /** Minimum session duration to create memory (default: 60000ms = 1 min) */
  minSessionDuration: number;
  /** Minimum turns to create memory (default: 3) */
  minTurns: number;
  /** Auto-generate tags from content (default: true) */
  autoTags: boolean;
  /** Memory save callback */
  onMemorySave?: (entry: MemoryEntry) => Promise<void>;
}

const DEFAULT_CONFIG: SessionMemoryHookConfig = {
  enabled: true,
  minSessionDuration: 60000,
  minTurns: 3,
  autoTags: true,
};

/**
 * Session Memory Hook
 *
 * Converts session summaries to memory entries.
 */
export class SessionMemoryHook {
  private config: SessionMemoryHookConfig;

  constructor(config?: Partial<SessionMemoryHookConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if session meets criteria for memory creation
   */
  shouldCreateMemory(summary: SessionSummary, turnCount: number): boolean {
    if (!this.config.enabled) {
      return false;
    }

    const duration = summary.endTime - summary.startTime;
    if (duration < this.config.minSessionDuration) {
      logger.debug(`[SessionMemoryHook] Session too short: ${duration}ms`);
      return false;
    }

    if (turnCount < this.config.minTurns) {
      logger.debug(`[SessionMemoryHook] Too few turns: ${turnCount}`);
      return false;
    }

    // Check if there's meaningful content
    const hasContent =
      summary.topics.length > 0 ||
      summary.decisions.length > 0 ||
      summary.facts.length > 0 ||
      summary.summaryText.length > 50;

    if (!hasContent) {
      logger.debug('[SessionMemoryHook] Insufficient content for memory');
      return false;
    }

    return true;
  }

  /**
   * Convert session summary to memory entry
   */
  async createMemoryFromSession(summary: SessionSummary): Promise<MemoryEntry> {
    const title = this.generateTitle(summary);
    const content = this.generateContent(summary);
    const tags = this.generateTags(summary);

    const entry: MemoryEntry = {
      id: generateId(),
      title,
      content,
      tags,
      timestamp: Date.now(),
      importance: summary.importance,
    };

    // Call save callback if provided
    if (this.config.onMemorySave) {
      await this.config.onMemorySave(entry);
    }

    logger.info(`[SessionMemoryHook] Created memory: "${title}"`);
    return entry;
  }

  /**
   * Process session end event
   */
  async onSessionEnd(summary: SessionSummary, turnCount: number): Promise<MemoryEntry | null> {
    if (!this.shouldCreateMemory(summary, turnCount)) {
      return null;
    }

    return this.createMemoryFromSession(summary);
  }

  /**
   * Process /new command (create memory before new session)
   */
  async onNewSession(
    currentSummary: SessionSummary,
    turnCount: number
  ): Promise<MemoryEntry | null> {
    return this.onSessionEnd(currentSummary, turnCount);
  }

  /**
   * Generate title from session summary
   */
  private generateTitle(summary: SessionSummary): string {
    const date = new Date(summary.startTime);
    const dateStr = date.toISOString().split('T')[0];

    // Use first topic or decision as title base
    let titleBase = '';
    if (summary.topics.length > 0) {
      titleBase = summary.topics[0];
    } else if (summary.decisions.length > 0) {
      titleBase = summary.decisions[0];
    } else if (summary.tasksCompleted.length > 0) {
      titleBase = `Completed: ${summary.tasksCompleted[0]}`;
    } else {
      titleBase = 'Session Summary';
    }

    // Truncate if too long
    if (titleBase.length > 50) {
      titleBase = titleBase.slice(0, 47) + '...';
    }

    return `${dateStr}: ${titleBase}`;
  }

  /**
   * Generate content from session summary
   */
  private generateContent(summary: SessionSummary): string {
    const lines: string[] = [];

    // Time info
    const startDate = new Date(summary.startTime);
    const endDate = new Date(summary.endTime);
    const duration = Math.round((summary.endTime - summary.startTime) / 60000);
    lines.push(`**Session**: ${summary.sessionId}`);
    lines.push(`**Time**: ${startDate.toLocaleString()} - ${endDate.toLocaleTimeString()} (${duration} min)`);
    lines.push('');

    // Topics
    if (summary.topics.length > 0) {
      lines.push('## Topics');
      for (const topic of summary.topics) {
        lines.push(`- ${topic}`);
      }
      lines.push('');
    }

    // Summary text
    if (summary.summaryText) {
      lines.push('## Summary');
      lines.push(summary.summaryText);
      lines.push('');
    }

    // Decisions
    if (summary.decisions.length > 0) {
      lines.push('## Decisions');
      for (const decision of summary.decisions) {
        lines.push(`- ${decision}`);
      }
      lines.push('');
    }

    // Tasks
    if (summary.tasksCompleted.length > 0 || summary.tasksPending.length > 0) {
      lines.push('## Tasks');
      if (summary.tasksCompleted.length > 0) {
        lines.push('**Completed:**');
        for (const task of summary.tasksCompleted) {
          lines.push(`- ✓ ${task}`);
        }
      }
      if (summary.tasksPending.length > 0) {
        lines.push('**Pending:**');
        for (const task of summary.tasksPending) {
          lines.push(`- ○ ${task}`);
        }
      }
      lines.push('');
    }

    // Facts
    if (summary.facts.length > 0) {
      lines.push('## Key Facts');
      for (const fact of summary.facts) {
        lines.push(`- ${fact}`);
      }
      lines.push('');
    }

    // Preferences
    if (summary.preferences.length > 0) {
      lines.push('## User Preferences');
      for (const pref of summary.preferences) {
        lines.push(`- ${pref}`);
      }
      lines.push('');
    }

    return lines.join('\n').trim();
  }

  /**
   * Generate tags from session summary
   */
  private generateTags(summary: SessionSummary): string[] {
    const tags = new Set<string>();

    // Add suggested tags
    for (const tag of summary.suggestedTags) {
      tags.add(tag.toLowerCase());
    }

    if (!this.config.autoTags) {
      return Array.from(tags);
    }

    // Add session tag
    tags.add('session');

    // Extract keywords from topics
    for (const topic of summary.topics) {
      const words = topic.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length > 3 && !this.isStopWord(word)) {
          tags.add(word);
        }
      }
    }

    // Add task-related tags
    if (summary.tasksCompleted.length > 0) {
      tags.add('tasks');
    }
    if (summary.tasksPending.length > 0) {
      tags.add('pending');
    }

    // Add decision tag
    if (summary.decisions.length > 0) {
      tags.add('decisions');
    }

    // Add preference tag
    if (summary.preferences.length > 0) {
      tags.add('preferences');
    }

    return Array.from(tags).slice(0, 10); // Limit to 10 tags
  }

  /**
   * Check if word is a stop word
   */
  private isStopWord(word: string): boolean {
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'over', 'after',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'this', 'that', 'these', 'those', 'what', 'which', 'who', 'how',
    ]);
    return stopWords.has(word);
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<SessionMemoryHookConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): SessionMemoryHookConfig {
    return { ...this.config };
  }
}

/**
 * Create session memory hook with callback
 */
export function createSessionMemoryHook(
  onMemorySave: (entry: MemoryEntry) => Promise<void>,
  config?: Partial<SessionMemoryHookConfig>
): SessionMemoryHook {
  return new SessionMemoryHook({
    ...config,
    onMemorySave,
  });
}

/**
 * Generate session summary from conversation (helper for AI to use)
 */
export function createEmptySessionSummary(sessionId: string, startTime: number): SessionSummary {
  return {
    sessionId,
    startTime,
    endTime: Date.now(),
    topics: [],
    decisions: [],
    tasksCompleted: [],
    tasksPending: [],
    facts: [],
    preferences: [],
    summaryText: '',
    suggestedTags: [],
    importance: 'medium',
  };
}
