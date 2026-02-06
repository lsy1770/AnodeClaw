/**
 * Compaction Safeguard
 *
 * Preserves important information before context compaction.
 * Following OpenClaw pattern for session_before_compact event handling.
 *
 * Captures:
 * - File operation summary (reads, writes, creates)
 * - Tool failure records
 * - Key decisions and outcomes
 */

import { logger } from '../../utils/logger.js';
import { StagedSummarizer, type SummarizableMessage } from './StagedSummarizer.js';

/**
 * Message for safeguard processing
 */
export interface SafeguardMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | any;
  timestamp: number;
  metadata?: {
    toolCalls?: Array<{
      id: string;
      name: string;
      input: Record<string, any>;
    }>;
    tool_call_id?: string;
    is_error?: boolean;
    [key: string]: any;
  };
}

/**
 * File operation record
 */
export interface FileOperation {
  type: 'read' | 'write' | 'create' | 'delete' | 'edit';
  path: string;
  timestamp: number;
  success: boolean;
}

/**
 * Tool failure record
 */
export interface ToolFailure {
  toolName: string;
  toolCallId: string;
  error: string;
  args: Record<string, any>;
  timestamp: number;
}

/**
 * Compaction safeguard result
 */
export interface CompactionSafeguardResult {
  /** Additional history to prepend after compaction */
  additionalHistory: string;
  /** File operations summary */
  fileSummary: string;
  /** Tool failures summary */
  failureSummary: string;
  /** Dropped messages summary (if summarization used) */
  droppedSummary: string;
  /** Number of messages that will be dropped */
  droppedCount: number;
}

/**
 * Safeguard configuration
 */
export interface CompactionSafeguardConfig {
  /** Maximum history share for old messages (default: 0.5) */
  maxHistoryShare: number;
  /** Minimum messages to trigger summarization (default: 10) */
  minMessagesForSummary: number;
  /** File tools to track */
  fileTools: string[];
  /** Use staged summarizer for dropped messages */
  useStagedSummarizer: boolean;
  /** Summary generator function (optional) */
  generateSummary?: (messages: SummarizableMessage[]) => Promise<string>;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CompactionSafeguardConfig = {
  maxHistoryShare: 0.5,
  minMessagesForSummary: 10,
  fileTools: ['read_file', 'write_file', 'edit_file', 'create_file', 'delete_file', 'file_read', 'file_write'],
  useStagedSummarizer: true,
};

/**
 * Compaction Safeguard
 *
 * Ensures important context is preserved during compaction.
 */
export class CompactionSafeguard {
  private config: CompactionSafeguardConfig;
  private summarizer: StagedSummarizer;

  constructor(config?: Partial<CompactionSafeguardConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.summarizer = new StagedSummarizer({
      generateSummary: this.config.generateSummary,
    });
  }

  /**
   * Process messages before compaction
   *
   * @param messages - All messages in the session
   * @param messagesToDrop - Messages that will be dropped
   * @returns Safeguard result with additional history
   */
  async beforeCompact(
    messages: SafeguardMessage[],
    messagesToDrop: SafeguardMessage[]
  ): Promise<CompactionSafeguardResult> {
    logger.debug(
      `[CompactionSafeguard] Processing ${messages.length} messages, ${messagesToDrop.length} to drop`
    );

    // 1. Compute file operations summary
    const fileSummary = this.computeFileSummary(messages);

    // 2. Collect tool failures
    const failureSummary = this.collectToolFailures(messages);

    // 3. Generate summary of dropped messages
    let droppedSummary = '';
    if (
      messagesToDrop.length >= this.config.minMessagesForSummary &&
      this.config.useStagedSummarizer
    ) {
      droppedSummary = await this.summarizeDroppedMessages(messagesToDrop);
    }

    // 4. Combine into additional history
    const additionalHistory = this.combineHistorySections(
      fileSummary,
      failureSummary,
      droppedSummary
    );

    return {
      additionalHistory,
      fileSummary,
      failureSummary,
      droppedSummary,
      droppedCount: messagesToDrop.length,
    };
  }

  /**
   * Compute file operations summary
   */
  computeFileSummary(messages: SafeguardMessage[]): string {
    const operations: FileOperation[] = [];

    for (const msg of messages) {
      // Check assistant messages for tool calls
      if (msg.role === 'assistant' && msg.metadata?.toolCalls) {
        for (const toolCall of msg.metadata.toolCalls) {
          if (this.isFileTool(toolCall.name)) {
            const op = this.extractFileOperation(toolCall);
            if (op) operations.push(op);
          }
        }
      }

      // Check tool results for success/failure
      if (msg.role === 'tool' && msg.metadata?.tool_call_id) {
        // Find most recent operation that's still marked as default success
        const relatedOp = operations.find(
          op => op.timestamp <= msg.timestamp
        );
        if (relatedOp && msg.metadata.is_error) {
          relatedOp.success = false;
        }
      }
    }

    if (operations.length === 0) {
      return '';
    }

    // Group by type
    const byType = new Map<string, string[]>();
    for (const op of operations) {
      if (!byType.has(op.type)) {
        byType.set(op.type, []);
      }
      byType.get(op.type)!.push(op.path);
    }

    const lines: string[] = ['## File Operations'];

    if (byType.has('read')) {
      const paths = [...new Set(byType.get('read')!)];
      lines.push(`**Read (${paths.length}):** ${paths.slice(0, 10).join(', ')}${paths.length > 10 ? '...' : ''}`);
    }

    if (byType.has('write') || byType.has('edit')) {
      const paths = [...new Set([
        ...(byType.get('write') || []),
        ...(byType.get('edit') || []),
      ])];
      lines.push(`**Modified (${paths.length}):** ${paths.slice(0, 10).join(', ')}${paths.length > 10 ? '...' : ''}`);
    }

    if (byType.has('create')) {
      const paths = [...new Set(byType.get('create')!)];
      lines.push(`**Created (${paths.length}):** ${paths.join(', ')}`);
    }

    if (byType.has('delete')) {
      const paths = [...new Set(byType.get('delete')!)];
      lines.push(`**Deleted (${paths.length}):** ${paths.join(', ')}`);
    }

    return lines.join('\n');
  }

  /**
   * Collect tool failures
   */
  collectToolFailures(messages: SafeguardMessage[]): string {
    const failures: ToolFailure[] = [];

    for (const msg of messages) {
      if (msg.role === 'tool' && msg.metadata?.is_error) {
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        failures.push({
          toolName: 'unknown', // Would need to correlate with assistant message
          toolCallId: msg.metadata.tool_call_id || '',
          error: content.slice(0, 200),
          args: {},
          timestamp: msg.timestamp,
        });
      }
    }

    if (failures.length === 0) {
      return '';
    }

    const lines: string[] = ['## Tool Failures'];
    const recentFailures = failures.slice(-5); // Last 5 failures

    for (const failure of recentFailures) {
      lines.push(`- ${failure.error}`);
    }

    if (failures.length > 5) {
      lines.push(`(${failures.length - 5} earlier failures omitted)`);
    }

    return lines.join('\n');
  }

  /**
   * Summarize dropped messages
   */
  private async summarizeDroppedMessages(messages: SafeguardMessage[]): Promise<string> {
    try {
      const result = await this.summarizer.summarize(messages as SummarizableMessage[]);
      return `## Dropped History Summary\n\n${result.summary}`;
    } catch (error) {
      logger.error('[CompactionSafeguard] Failed to summarize dropped messages:', error);
      return `## Dropped History\n\n${messages.length} messages were removed from history.`;
    }
  }

  /**
   * Combine history sections
   */
  private combineHistorySections(
    fileSummary: string,
    failureSummary: string,
    droppedSummary: string
  ): string {
    const sections = [fileSummary, failureSummary, droppedSummary].filter(s => s.length > 0);

    if (sections.length === 0) {
      return '';
    }

    return ['# Compaction Context', '', ...sections].join('\n');
  }

  /**
   * Check if tool is a file operation tool
   */
  private isFileTool(toolName: string): boolean {
    return this.config.fileTools.some(
      ft => toolName.toLowerCase().includes(ft.toLowerCase())
    );
  }

  /**
   * Extract file operation from tool call
   */
  private extractFileOperation(toolCall: {
    name: string;
    input: Record<string, any>;
  }): FileOperation | null {
    const name = toolCall.name.toLowerCase();
    const input = toolCall.input;

    let type: FileOperation['type'] = 'read';
    let path = '';

    if (name.includes('read')) {
      type = 'read';
      path = input.path || input.file_path || input.filename || '';
    } else if (name.includes('write')) {
      type = 'write';
      path = input.path || input.file_path || input.filename || '';
    } else if (name.includes('edit')) {
      type = 'edit';
      path = input.path || input.file_path || input.filename || '';
    } else if (name.includes('create')) {
      type = 'create';
      path = input.path || input.file_path || input.filename || '';
    } else if (name.includes('delete')) {
      type = 'delete';
      path = input.path || input.file_path || input.filename || '';
    }

    if (!path) {
      return null;
    }

    return {
      type,
      path,
      timestamp: Date.now(),
      success: true, // Will be updated when tool result is processed
    };
  }

  /**
   * Calculate messages to drop based on history share
   *
   * @param messages - All messages
   * @param currentTokens - Current token count
   * @param maxTokens - Maximum allowed tokens
   * @returns Messages to drop
   */
  calculateDroppedMessages(
    messages: SafeguardMessage[],
    currentTokens: number,
    maxTokens: number
  ): SafeguardMessage[] {
    const newContentTokens = currentTokens; // Simplified - in practice would calculate new content separately
    const historyBudget = maxTokens * this.config.maxHistoryShare;

    if (newContentTokens <= historyBudget) {
      return []; // No need to drop
    }

    // Calculate how many messages to drop (simple approximation)
    const tokensToFree = newContentTokens - historyBudget;
    const avgTokensPerMessage = currentTokens / messages.length;
    const messagesToDrop = Math.ceil(tokensToFree / avgTokensPerMessage);

    // Drop from the beginning, but preserve system messages
    const droppable = messages.filter(m => m.role !== 'system');
    return droppable.slice(0, Math.min(messagesToDrop, droppable.length));
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<CompactionSafeguardConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.generateSummary) {
      this.summarizer.setConfig({ generateSummary: config.generateSummary });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): CompactionSafeguardConfig {
    return { ...this.config };
  }
}

/**
 * Create compaction safeguard with configuration
 */
export function createCompactionSafeguard(
  config?: Partial<CompactionSafeguardConfig>
): CompactionSafeguard {
  return new CompactionSafeguard(config);
}
