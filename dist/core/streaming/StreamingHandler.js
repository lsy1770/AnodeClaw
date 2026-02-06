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
import { createDeltaBuffer } from './DeltaBuffer.js';
import { DEFAULT_STREAMING_CONFIG } from './types.js';
/**
 * Streaming Handler
 *
 * Central hub for streaming event management.
 */
export class StreamingHandler extends EventEmitter {
    constructor(config) {
        super();
        this.subscriptions = new Map();
        this.flushTimer = null;
        this.currentRunId = null;
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
    createInitialState() {
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
    reset() {
        this.state = this.createInitialState();
        this.deltaBuffer.clear();
        this.currentRunId = null;
    }
    /**
     * Subscribe to stream events
     */
    subscribe(handler) {
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
    dispatch(event) {
        // Emit on EventEmitter for internal listeners
        this.emit(event.type, event);
        this.emit('event', event);
        // Call all subscription handlers
        for (const handler of this.subscriptions.values()) {
            try {
                handler(event);
            }
            catch (error) {
                logger.error('[StreamingHandler] Handler error:', error);
            }
        }
    }
    /**
     * Start flush timer for periodic buffer flush
     */
    startFlushTimer() {
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
    stopFlushTimer() {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
            this.flushTimer = null;
        }
    }
    /**
     * Flush buffer content
     */
    flushBuffer() {
        const content = this.deltaBuffer.getContent();
        if (content && this.state.currentMessageId) {
            this.state.deltaBuffer = content;
        }
    }
    // ===== Event Emission Methods =====
    /**
     * Emit agent start event
     */
    emitAgentStart(sessionId, runId) {
        this.currentRunId = runId;
        this.reset();
        const event = {
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
    emitAgentEnd(sessionId, runId, totalTokens) {
        const event = {
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
    emitMessageStart(messageId) {
        this.state.currentMessageId = messageId;
        this.state.isStreaming = true;
        this.deltaBuffer.clear();
        const event = {
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
    emitMessageUpdate(messageId, delta, updateType = 'text_delta') {
        // Append to buffer
        this.deltaBuffer.append(delta);
        this.state.deltaBuffer = this.deltaBuffer.getContent();
        const event = {
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
    emitMessageEnd(messageId, content, stopReason, usage) {
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
        const event = {
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
    emitToolStart(toolCallId, toolName, args) {
        const meta = {
            toolName,
            toolCallId,
            args,
            startTime: Date.now(),
        };
        this.state.toolMetaById.set(toolCallId, meta);
        const event = {
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
    emitToolUpdate(toolCallId, toolName, progress, status) {
        const event = {
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
    emitToolEnd(toolCallId, toolName, result, isError = false) {
        const meta = this.state.toolMetaById.get(toolCallId);
        const duration = meta?.startTime ? Date.now() - meta.startTime : 0;
        // Update meta
        if (meta) {
            meta.result = result;
            meta.isError = isError;
            meta.duration = duration;
            this.state.toolMetas.push(meta);
        }
        const event = {
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
    emitCompactionStart(sessionId, reason, usageRatio) {
        const event = {
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
    emitCompactionEnd(sessionId, messagesRemoved, newUsageRatio, summaryGenerated) {
        const event = {
            type: 'auto_compaction_end',
            timestamp: Date.now(),
            runId: this.currentRunId || undefined,
            sessionId,
            messagesRemoved,
            newUsageRatio,
            summaryGenerated,
        };
        logger.info(`[StreamingHandler] Compaction end: removed ${messagesRemoved} messages, ` +
            `new usage ${(newUsageRatio * 100).toFixed(1)}%`);
        this.dispatch(event);
    }
    /**
     * Emit error event
     */
    emitError(code, message, recoverable = false, details) {
        const event = {
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
    getState() {
        return { ...this.state };
    }
    /**
     * Get accumulated assistant texts
     */
    getAssistantTexts() {
        return [...this.state.assistantTexts];
    }
    /**
     * Get tool metas
     */
    getToolMetas() {
        return [...this.state.toolMetas];
    }
    /**
     * Get current delta buffer content
     */
    getCurrentContent() {
        return this.state.deltaBuffer;
    }
    /**
     * Check if currently streaming
     */
    isStreaming() {
        return this.state.isStreaming;
    }
    /**
     * Get current run ID
     */
    getRunId() {
        return this.currentRunId;
    }
    /**
     * Destroy handler and cleanup
     */
    destroy() {
        this.stopFlushTimer();
        this.subscriptions.clear();
        this.removeAllListeners();
        this.reset();
    }
}
/**
 * Create streaming handler with configuration
 */
export function createStreamingHandler(config) {
    return new StreamingHandler(config);
}
