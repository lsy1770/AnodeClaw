/**
 * Streaming Types
 *
 * Event-driven streaming response types following OpenClaw pattern.
 * Supports message streaming, tool execution events, and agent lifecycle.
 */
/**
 * Default streaming configuration
 */
export const DEFAULT_STREAMING_CONFIG = {
    enabled: true,
    bufferFlushSize: 50,
    flushInterval: 100,
    processThinkingTags: true,
    blockSize: 2000,
};
