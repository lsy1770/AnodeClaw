/**
 * Delta Buffer
 *
 * Handles incremental text buffering for streaming responses.
 * Accumulates delta updates and provides utilities for:
 * - Text deduplication
 * - Thinking tag extraction
 * - Block splitting for chunked sending
 */
/**
 * Delta Buffer class
 *
 * Accumulates streaming text and handles deduplication.
 */
export class DeltaBuffer {
    constructor(blockSize = 2000) {
        this.buffer = '';
        this.thinkingBuffer = '';
        this.inThinkingBlock = false;
        this.blockSize = blockSize;
    }
    /**
     * Append delta to buffer
     * Handles deduplication if delta overlaps with existing content
     */
    append(delta) {
        if (!delta)
            return this.buffer;
        // Simple append - most common case
        this.buffer += delta;
        return this.buffer;
    }
    /**
     * Append with deduplication
     * Used when receiving text_end event with full content
     */
    appendDedup(fullContent) {
        if (!fullContent)
            return this.buffer;
        // If full content starts with our buffer, extract the delta
        if (fullContent.startsWith(this.buffer)) {
            const newDelta = fullContent.slice(this.buffer.length);
            this.buffer = fullContent;
            return newDelta;
        }
        // Otherwise just update buffer
        this.buffer = fullContent;
        return '';
    }
    /**
     * Get current buffer content
     */
    getContent() {
        return this.buffer;
    }
    /**
     * Get buffer length
     */
    getLength() {
        return this.buffer.length;
    }
    /**
     * Clear buffer
     */
    clear() {
        this.buffer = '';
        this.thinkingBuffer = '';
        this.inThinkingBlock = false;
    }
    /**
     * Extract and process thinking tags
     * Pattern: <think>...</think>
     */
    extractThinking() {
        const content = this.buffer;
        let thinking = '';
        let cleanContent = content;
        let isComplete = true;
        // Check for thinking tag patterns
        const thinkStartMatch = content.match(/<think>/i);
        const thinkEndMatch = content.match(/<\/think>/i);
        if (thinkStartMatch) {
            const startIdx = thinkStartMatch.index;
            if (thinkEndMatch) {
                // Complete thinking block
                const endIdx = thinkEndMatch.index;
                thinking = content.slice(startIdx + 7, endIdx); // 7 = "<think>".length
                cleanContent = content.slice(0, startIdx) + content.slice(endIdx + 8); // 8 = "</think>".length
                this.inThinkingBlock = false;
            }
            else {
                // Incomplete thinking block (still streaming)
                thinking = content.slice(startIdx + 7);
                cleanContent = content.slice(0, startIdx);
                isComplete = false;
                this.inThinkingBlock = true;
            }
            this.thinkingBuffer = thinking;
        }
        else if (this.inThinkingBlock && thinkEndMatch) {
            // End of thinking block that started in previous chunk
            const endIdx = thinkEndMatch.index;
            thinking = content.slice(0, endIdx);
            cleanContent = content.slice(endIdx + 8);
            this.inThinkingBlock = false;
            this.thinkingBuffer += thinking;
        }
        else if (this.inThinkingBlock) {
            // Still in thinking block
            thinking = content;
            cleanContent = '';
            isComplete = false;
            this.thinkingBuffer += content;
        }
        return {
            thinking: this.thinkingBuffer,
            content: cleanContent.trim(),
            isComplete,
        };
    }
    /**
     * Split buffer into blocks for chunked sending
     * Used for long messages that need to be sent in parts
     */
    splitBlocks(customBlockSize) {
        const size = customBlockSize || this.blockSize;
        const content = this.buffer;
        const blocks = [];
        let remainder = '';
        if (content.length <= size) {
            return { blocks: [], remainder: content };
        }
        // Split into complete blocks
        let pos = 0;
        while (pos + size <= content.length) {
            // Try to break at a natural boundary (newline, space, punctuation)
            let breakPos = pos + size;
            const chunk = content.slice(pos, breakPos);
            // Look for a good break point in the last 100 chars
            const searchStart = Math.max(0, chunk.length - 100);
            const searchArea = chunk.slice(searchStart);
            // Priority: paragraph > sentence > word
            let localBreak = searchArea.lastIndexOf('\n\n');
            if (localBreak === -1) {
                localBreak = searchArea.lastIndexOf('. ');
                if (localBreak !== -1)
                    localBreak += 1; // Include the period
            }
            if (localBreak === -1) {
                localBreak = searchArea.lastIndexOf(' ');
            }
            if (localBreak !== -1) {
                breakPos = pos + searchStart + localBreak + 1;
            }
            blocks.push(content.slice(pos, breakPos).trim());
            pos = breakPos;
        }
        // Remainder
        if (pos < content.length) {
            remainder = content.slice(pos);
        }
        return { blocks, remainder };
    }
    /**
     * Check if buffer has complete sentences ready to flush
     */
    hasCompleteSentence() {
        const content = this.buffer;
        // Check for sentence-ending punctuation followed by space or newline
        return /[.!?。！？]\s*$/.test(content) || content.includes('\n\n');
    }
    /**
     * Extract complete sentences, leaving incomplete part in buffer
     */
    flushCompleteSentences() {
        const content = this.buffer;
        // Find last sentence boundary
        const sentenceEnd = content.search(/[.!?。！？]\s*$/);
        if (sentenceEnd === -1) {
            // No complete sentence
            return '';
        }
        // Find the actual end position (after punctuation and whitespace)
        const match = content.match(/[.!?。！？]\s*$/);
        if (!match)
            return '';
        const endPos = content.length - match[0].length + 1;
        const flushed = content.slice(0, endPos).trim();
        this.buffer = content.slice(endPos);
        return flushed;
    }
    /**
     * Create a new buffer with same configuration
     */
    clone() {
        const newBuffer = new DeltaBuffer(this.blockSize);
        newBuffer.buffer = this.buffer;
        newBuffer.thinkingBuffer = this.thinkingBuffer;
        newBuffer.inThinkingBlock = this.inThinkingBlock;
        return newBuffer;
    }
}
/**
 * Create a new delta buffer
 */
export function createDeltaBuffer(blockSize) {
    return new DeltaBuffer(blockSize);
}
