/**
 * Streaming Handler
 *
 * Event-driven streaming response handler following OpenClaw pattern.
 * Manages:
 * - Event subscription and dispatch
 * - Message accumulation
 * - Tool execution tracking
 * - Agent lifecycle events
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { DeltaBuffer, createDeltaBuffer } from './DeltaBuffer.js';
import type {
  AnyStreamEvent,
  StreamEventHandler,
  StreamSubscription,
  StreamingState,
  StreamingConfig,
  ToolMeta,
  MessageStartEvent,
  MessageUpdateEvent,
  MessageEndEvent,
  ToolExecutionStartEvent,
  ToolExecutionUpdateEvent,
  ToolExecutionEndEvent,
  AgentStartEvent,
  AgentEndEvent,
  AutoCompactionStartEvent,
  AutoCompactionEndEvent,
  ErrorEvent,
} from './types.js';
import { DEFAULT_STREAMING_CONFIG } from './types.js';

/**
 * Streaming Handler
 *
 * Central hub for streaming event management.
 */
export class StreamingHandler extends EventEmitter {
  private config: StreamingConfig;
  private state: StreamingState;
  private deltaBuffer: DeltaBuffer;
  private subscriptions: Map<string, StreamEventHandler> = new Map();
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private currentRunId: string | null = null;

  constructor(config?: Partial<StreamingConfig>) {
    super();
    this.config = { ...DEFAULT_STREAMING_CONFIG, ...config };
    this.state = this.createInitialState();
    this.deltaBuffer = createDeltaBuffer(this.config.blockSize);

    // Start flush timer if streaming is enabled
    if (this.config.enabled && this.config.flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  /**
   * Create initial streaming state
   */
  private createInitialState(): StreamingState {
    return {
      deltaBuffer: '',
      blockBuffer: '',
      currentMessageId: null,
      toolMetaById: new Map(),
      assistantTexts: [],
      toolMetas: [],
      isStreaming: false,
    };
  }

  /**
   * Reset state for new run
   */
  reset(): void {
    this.state = this.createInitialState();
    this.deltaBuffer.clear();
    this.currentRunId = null;
  }

  /**
   * Subscribe to stream events
   */
  subscribe(handler: StreamEventHandler): StreamSubscription {
    const subscriptionId = generateId();
    this.subscriptions.set(subscriptionId, handler);

    return {
      unsubscribe: () => {
        this.subscriptions.delete(subscriptionId);
      },
      subscriptionId,
    };
  }

  /**
   * Dispatch event to all subscribers
   */
  private dispatch(event: AnyStreamEvent): void {
    // Emit on EventEmitter for internal listeners
    this.emit(event.type, event);
    this.emit('event', event);

    // Call all subscription handlers
    for (const handler of this.subscriptions.values()) {
      try {
        handler(event);
      } catch (error) {
        logger.error('[StreamingHandler] Handler error:', error);
      }
    }
  }

  /**
   * Start flush timer for periodic buffer flush
   */
  private startFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flushTimer = setInterval(() => {
      if (this.state.isStreaming && this.deltaBuffer.getLength() >= this.config.bufferFlushSize) {
        this.flushBuffer();
      }
    }, this.config.flushInterval);
  }

  /**
   * Stop flush timer
   */
  private stopFlushTimer(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Flush buffer content
   */
  private flushBuffer(): void {
    const content = this.deltaBuffer.getContent();
    if (content && this.state.currentMessageId) {
      this.state.deltaBuffer = content;
    }
  }

  // ===== Event Emission Methods =====

  /**
   * Emit agent start event
   */
  emitAgentStart(sessionId: string, runId: string): void {
    this.currentRunId = runId;
    this.reset();

    const event: AgentStartEvent = {
      type: 'agent_start',
      timestamp: Date.now(),
      runId,
      sessionId,
    };

    logger.debug(`[StreamingHandler] Agent start: ${runId}`);
    this.dispatch(event);
  }

  /**
   * Emit agent end event
   */
  emitAgentEnd(
    sessionId: string,
    runId: string,
    totalTokens?: { input: number; output: number }
  ): void {
    const event: AgentEndEvent = {
      type: 'agent_end',
      timestamp: Date.now(),
      runId,
      sessionId,
      totalTokens,
    };

    logger.debug(`[StreamingHandler] Agent end: ${runId}`);
    this.dispatch(event);

    this.currentRunId = null;
  }

  /**
   * Emit message start event
   */
  emitMessageStart(messageId: string): void {
    this.state.currentMessageId = messageId;
    this.state.isStreaming = true;
    this.deltaBuffer.clear();

    const event: MessageStartEvent = {
      type: 'message_start',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      role: 'assistant',
      messageId,
    };

    logger.debug(`[StreamingHandler] Message start: ${messageId}`);
    this.dispatch(event);
  }

  /**
   * Emit message update event (streaming token)
   */
  emitMessageUpdate(
    messageId: string,
    delta: string,
    updateType: 'text_delta' | 'text_start' | 'text_end' | 'thinking_delta' = 'text_delta'
  ): void {
    // Append to buffer
    this.deltaBuffer.append(delta);
    this.state.deltaBuffer = this.deltaBuffer.getContent();

    const event: MessageUpdateEvent = {
      type: 'message_update',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      messageId,
      updateType,
      delta,
      accumulated: this.state.deltaBuffer,
    };

    this.dispatch(event);
  }

  /**
   * Emit message end event
   */
  emitMessageEnd(
    messageId: string,
    content: string,
    stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence',
    usage?: { inputTokens: number; outputTokens: number }
  ): void {
    this.state.isStreaming = false;

    // Final deduplication
    this.deltaBuffer.appendDedup(content);
    this.state.deltaBuffer = content;

    // Process thinking tags if enabled
    let finalContent = content;
    if (this.config.processThinkingTags) {
      const { content: cleanContent } = this.deltaBuffer.extractThinking();
      if (cleanContent) {
        finalContent = cleanContent;
      }
    }

    // Add to assistant texts
    if (finalContent) {
      this.state.assistantTexts.push(finalContent);
    }

    const event: MessageEndEvent = {
      type: 'message_end',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      messageId,
      content: finalContent,
      stopReason,
      usage,
    };

    logger.debug(`[StreamingHandler] Message end: ${messageId} (${stopReason})`);
    this.dispatch(event);

    this.state.currentMessageId = null;
  }

  /**
   * Emit tool execution start event
   */
  emitToolStart(toolCallId: string, toolName: string, args: Record<string, any>): void {
    const meta: ToolMeta = {
      toolName,
      toolCallId,
      args,
      startTime: Date.now(),
    };
    this.state.toolMetaById.set(toolCallId, meta);

    const event: ToolExecutionStartEvent = {
      type: 'tool_execution_start',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      toolCallId,
      toolName,
      args,
    };

    logger.debug(`[StreamingHandler] Tool start: ${toolName} (${toolCallId})`);
    this.dispatch(event);
  }

  /**
   * Emit tool execution update event
   */
  emitToolUpdate(toolCallId: string, toolName: string, progress?: number, status?: string): void {
    const event: ToolExecutionUpdateEvent = {
      type: 'tool_execution_update',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      toolCallId,
      toolName,
      progress,
      status,
    };

    this.dispatch(event);
  }

  /**
   * Emit tool execution end event
   */
  emitToolEnd(toolCallId: string, toolName: string, result: any, isError: boolean = false): void {
    const meta = this.state.toolMetaById.get(toolCallId);
    const duration = meta?.startTime ? Date.now() - meta.startTime : 0;

    // Update meta
    if (meta) {
      meta.result = result;
      meta.isError = isError;
      meta.duration = duration;
      this.state.toolMetas.push(meta);
    }

    const event: ToolExecutionEndEvent = {
      type: 'tool_execution_end',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      toolCallId,
      toolName,
      result,
      isError,
      duration,
    };

    logger.debug(`[StreamingHandler] Tool end: ${toolName} (${toolCallId}) [${duration}ms]`);
    this.dispatch(event);
  }

  /**
   * Emit auto compaction start event
   */
  emitCompactionStart(
    sessionId: string,
    reason: 'context_overflow' | 'threshold_reached' | 'manual',
    usageRatio: number
  ): void {
    const event: AutoCompactionStartEvent = {
      type: 'auto_compaction_start',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      sessionId,
      reason,
      usageRatio,
    };

    logger.info(`[StreamingHandler] Compaction start: ${reason} (${(usageRatio * 100).toFixed(1)}%)`);
    this.dispatch(event);
  }

  /**
   * Emit auto compaction end event
   */
  emitCompactionEnd(
    sessionId: string,
    messagesRemoved: number,
    newUsageRatio: number,
    summaryGenerated: boolean
  ): void {
    const event: AutoCompactionEndEvent = {
      type: 'auto_compaction_end',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      sessionId,
      messagesRemoved,
      newUsageRatio,
      summaryGenerated,
    };

    logger.info(
      `[StreamingHandler] Compaction end: removed ${messagesRemoved} messages, ` +
        `new usage ${(newUsageRatio * 100).toFixed(1)}%`
    );
    this.dispatch(event);
  }

  /**
   * Emit error event
   */
  emitError(code: string, message: string, recoverable: boolean = false, details?: any): void {
    const event: ErrorEvent = {
      type: 'error',
      timestamp: Date.now(),
      runId: this.currentRunId || undefined,
      code,
      message,
      recoverable,
      details,
    };

    logger.error(`[StreamingHandler] Error: ${code} - ${message}`);
    this.dispatch(event);
  }

  // ===== State Accessors =====

  /**
   * Get current streaming state
   */
  getState(): Readonly<StreamingState> {
    return { ...this.state };
  }

  /**
   * Get accumulated assistant texts
   */
  getAssistantTexts(): string[] {
    return [...this.state.assistantTexts];
  }

  /**
   * Get tool metas
   */
  getToolMetas(): ToolMeta[] {
    return [...this.state.toolMetas];
  }

  /**
   * Get current delta buffer content
   */
  getCurrentContent(): string {
    return this.state.deltaBuffer;
  }

  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this.state.isStreaming;
  }

  /**
   * Get current run ID
   */
  getRunId(): string | null {
    return this.currentRunId;
  }

  /**
   * Destroy handler and cleanup
   */
  destroy(): void {
    this.stopFlushTimer();
    this.subscriptions.clear();
    this.removeAllListeners();
    this.reset();
  }
}

/**
 * Create streaming handler with configuration
 */
export function createStreamingHandler(config?: Partial<StreamingConfig>): StreamingHandler {
  return new StreamingHandler(config);
}
