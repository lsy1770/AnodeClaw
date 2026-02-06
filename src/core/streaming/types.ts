/**
 * Streaming Types
 *
 * Event-driven streaming response types following OpenClaw pattern.
 * Supports message streaming, tool execution events, and agent lifecycle.
 */

/**
 * Base streaming event
 */
export interface StreamEvent {
  type: StreamEventType;
  timestamp: number;
  runId?: string;
}

/**
 * Stream event types
 */
export type StreamEventType =
  // Message events
  | 'message_start'
  | 'message_update'
  | 'message_end'
  // Tool events
  | 'tool_execution_start'
  | 'tool_execution_update'
  | 'tool_execution_end'
  // Agent lifecycle events
  | 'agent_start'
  | 'agent_end'
  // Context management events
  | 'auto_compaction_start'
  | 'auto_compaction_end'
  // Error events
  | 'error';

/**
 * Message start event - LLM begins generating
 */
export interface MessageStartEvent extends StreamEvent {
  type: 'message_start';
  role: 'assistant';
  messageId: string;
}

/**
 * Message update event - Streaming token/chunk
 */
export interface MessageUpdateEvent extends StreamEvent {
  type: 'message_update';
  messageId: string;
  /** Update sub-type */
  updateType: 'text_delta' | 'text_start' | 'text_end' | 'thinking_delta';
  /** Incremental content */
  delta: string;
  /** Full accumulated content so far */
  accumulated?: string;
}

/**
 * Message end event - LLM finished generating
 */
export interface MessageEndEvent extends StreamEvent {
  type: 'message_end';
  messageId: string;
  /** Final complete content */
  content: string;
  /** Stop reason */
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
  /** Token usage */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

/**
 * Tool execution start event
 */
export interface ToolExecutionStartEvent extends StreamEvent {
  type: 'tool_execution_start';
  toolCallId: string;
  toolName: string;
  args: Record<string, any>;
}

/**
 * Tool execution update event (progress)
 */
export interface ToolExecutionUpdateEvent extends StreamEvent {
  type: 'tool_execution_update';
  toolCallId: string;
  toolName: string;
  /** Progress percentage 0-100 */
  progress?: number;
  /** Status message */
  status?: string;
}

/**
 * Tool execution end event
 */
export interface ToolExecutionEndEvent extends StreamEvent {
  type: 'tool_execution_end';
  toolCallId: string;
  toolName: string;
  result: any;
  isError: boolean;
  /** Execution duration in ms */
  duration: number;
}

/**
 * Agent start event
 */
export interface AgentStartEvent extends StreamEvent {
  type: 'agent_start';
  sessionId: string;
  runId: string;
}

/**
 * Agent end event
 */
export interface AgentEndEvent extends StreamEvent {
  type: 'agent_end';
  sessionId: string;
  runId: string;
  /** Total tokens used in this run */
  totalTokens?: {
    input: number;
    output: number;
  };
}

/**
 * Auto compaction start event
 */
export interface AutoCompactionStartEvent extends StreamEvent {
  type: 'auto_compaction_start';
  sessionId: string;
  reason: 'context_overflow' | 'threshold_reached' | 'manual';
  /** Current context usage ratio */
  usageRatio: number;
}

/**
 * Auto compaction end event
 */
export interface AutoCompactionEndEvent extends StreamEvent {
  type: 'auto_compaction_end';
  sessionId: string;
  /** Messages removed */
  messagesRemoved: number;
  /** New usage ratio after compaction */
  newUsageRatio: number;
  /** Summary generated */
  summaryGenerated: boolean;
}

/**
 * Error event
 */
export interface ErrorEvent extends StreamEvent {
  type: 'error';
  code: string;
  message: string;
  recoverable: boolean;
  details?: any;
}

/**
 * Union type for all stream events
 */
export type AnyStreamEvent =
  | MessageStartEvent
  | MessageUpdateEvent
  | MessageEndEvent
  | ToolExecutionStartEvent
  | ToolExecutionUpdateEvent
  | ToolExecutionEndEvent
  | AgentStartEvent
  | AgentEndEvent
  | AutoCompactionStartEvent
  | AutoCompactionEndEvent
  | ErrorEvent;

/**
 * Stream event handler function
 */
export type StreamEventHandler = (event: AnyStreamEvent) => void;

/**
 * Subscription result
 */
export interface StreamSubscription {
  /** Unsubscribe function */
  unsubscribe: () => void;
  /** Subscription ID */
  subscriptionId: string;
}

/**
 * Streaming state for tracking accumulated content
 */
export interface StreamingState {
  /** Accumulated assistant text */
  deltaBuffer: string;
  /** Block buffer for chunked sending */
  blockBuffer: string;
  /** Current message ID being streamed */
  currentMessageId: string | null;
  /** Tool call metadata by ID */
  toolMetaById: Map<string, ToolMeta>;
  /** All assistant texts collected */
  assistantTexts: string[];
  /** All tool metas collected */
  toolMetas: ToolMeta[];
  /** Is currently streaming */
  isStreaming: boolean;
}

/**
 * Tool metadata
 */
export interface ToolMeta {
  toolName: string;
  toolCallId: string;
  args: Record<string, any>;
  result?: any;
  isError?: boolean;
  duration?: number;
  startTime?: number;
}

/**
 * Streaming configuration
 */
export interface StreamingConfig {
  /** Enable streaming (default: true) */
  enabled: boolean;
  /** Buffer size before flushing to UI (default: 50 chars) */
  bufferFlushSize: number;
  /** Flush interval in ms (default: 100) */
  flushInterval: number;
  /** Enable thinking tag processing (default: true) */
  processThinkingTags: boolean;
  /** Block size for chunked message sending (default: 2000 chars) */
  blockSize: number;
}

/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  enabled: true,
  bufferFlushSize: 50,
  flushInterval: 100,
  processThinkingTags: true,
  blockSize: 2000,
};
