/**
 * Text Chunker
 *
 * Splits text into overlapping chunks for efficient vector indexing.
 * Follows OpenClaw pattern: 400 tokens chunk size, 80 tokens overlap.
 */

import { logger } from '../../utils/logger.js';

/**
 * Chunk configuration
 */
export interface ChunkConfig {
  /** Target chunk size in tokens (default: 400) */
  chunkSize: number;
  /** Overlap between chunks in tokens (default: 80) */
  overlap: number;
  /** Approximate characters per token (default: 4) */
  charsPerToken: number;
  /** Minimum chunk size to keep (default: 50 tokens) */
  minChunkSize: number;
}

/**
 * A text chunk with metadata
 */
export interface TextChunk {
  /** Unique chunk ID (e.g., "doc:memory-abc:chunk-0") */
  id: string;
  /** Source document ID */
  sourceId: string;
  /** Chunk index within document */
  index: number;
  /** Chunk text content */
  content: string;
  /** Start character position in original text */
  startChar: number;
  /** End character position in original text */
  endChar: number;
  /** Estimated token count */
  tokenCount: number;
  /** Total chunks in document */
  totalChunks: number;
}

/**
 * Default chunk configuration
 */
const DEFAULT_CONFIG: ChunkConfig = {
  chunkSize: 400,
  overlap: 80,
  charsPerToken: 4,
  minChunkSize: 50,
};

/**
 * Text Chunker Class
 *
 * Handles splitting text into overlapping chunks for vector indexing.
 */
export class TextChunker {
  private config: ChunkConfig;

  constructor(config?: Partial<ChunkConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Estimate token count for text
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / this.config.charsPerToken);
  }

  /**
   * Split text into overlapping chunks
   *
   * @param text - Text to chunk
   * @param sourceId - Source document ID
   * @returns Array of text chunks
   */
  chunk(text: string, sourceId: string): TextChunk[] {
    const estimatedTokens = this.estimateTokens(text);

    // If text is small enough, return as single chunk
    if (estimatedTokens <= this.config.chunkSize) {
      return [{
        id: `${sourceId}:chunk-0`,
        sourceId,
        index: 0,
        content: text,
        startChar: 0,
        endChar: text.length,
        tokenCount: estimatedTokens,
        totalChunks: 1,
      }];
    }

    const chunks: TextChunk[] = [];
    const chunkChars = this.config.chunkSize * this.config.charsPerToken;
    const overlapChars = this.config.overlap * this.config.charsPerToken;
    const stepChars = chunkChars - overlapChars;

    let startPos = 0;
    let chunkIndex = 0;

    while (startPos < text.length) {
      let endPos = Math.min(startPos + chunkChars, text.length);

      // Try to break at a sentence or paragraph boundary
      if (endPos < text.length) {
        endPos = this.findBestBreakPoint(text, startPos, endPos);
      }

      const chunkContent = text.slice(startPos, endPos);
      const tokenCount = this.estimateTokens(chunkContent);

      // Only add chunk if it meets minimum size
      if (tokenCount >= this.config.minChunkSize || startPos === 0) {
        chunks.push({
          id: `${sourceId}:chunk-${chunkIndex}`,
          sourceId,
          index: chunkIndex,
          content: chunkContent,
          startChar: startPos,
          endChar: endPos,
          tokenCount,
          totalChunks: 0, // Will be updated after all chunks are created
        });
        chunkIndex++;
      }

      // Move to next chunk position
      startPos = startPos + stepChars;

      // Don't create tiny trailing chunks
      if (text.length - startPos < this.config.minChunkSize * this.config.charsPerToken) {
        break;
      }
    }

    // Handle remaining text
    if (startPos < text.length && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      const remaining = text.slice(lastChunk.endChar);
      if (remaining.trim().length > 0) {
        // Extend last chunk to include remaining text
        lastChunk.content = text.slice(lastChunk.startChar);
        lastChunk.endChar = text.length;
        lastChunk.tokenCount = this.estimateTokens(lastChunk.content);
      }
    }

    // Update totalChunks in all chunks
    for (const chunk of chunks) {
      chunk.totalChunks = chunks.length;
    }

    logger.debug(`[Chunker] Split "${sourceId}" into ${chunks.length} chunks`);

    return chunks;
  }

  /**
   * Find the best break point near the target position
   * Prefers: paragraph > sentence > clause > word
   */
  private findBestBreakPoint(text: string, startPos: number, targetEndPos: number): number {
    const searchWindow = Math.min(100, targetEndPos - startPos);
    const searchStart = targetEndPos - searchWindow;
    const searchText = text.slice(searchStart, targetEndPos);

    // Look for paragraph break (double newline)
    const paragraphBreak = searchText.lastIndexOf('\n\n');
    if (paragraphBreak !== -1) {
      return searchStart + paragraphBreak + 2;
    }

    // Look for sentence break (. ! ?)
    const sentenceBreakMatch = searchText.match(/[.!?]\s+(?=[A-Z])/g);
    if (sentenceBreakMatch) {
      const lastMatch = searchText.lastIndexOf(sentenceBreakMatch[sentenceBreakMatch.length - 1]);
      if (lastMatch !== -1) {
        return searchStart + lastMatch + sentenceBreakMatch[sentenceBreakMatch.length - 1].length;
      }
    }

    // Look for clause break (newline, semicolon, colon)
    const clauseBreaks = ['\n', '; ', ': ', ', '];
    for (const breaker of clauseBreaks) {
      const breakPoint = searchText.lastIndexOf(breaker);
      if (breakPoint !== -1) {
        return searchStart + breakPoint + breaker.length;
      }
    }

    // Fall back to word break (space)
    const spaceBreak = searchText.lastIndexOf(' ');
    if (spaceBreak !== -1) {
      return searchStart + spaceBreak + 1;
    }

    // No good break found, use target position
    return targetEndPos;
  }

  /**
   * Merge chunks back into original text (for verification)
   */
  mergeChunks(chunks: TextChunk[]): string {
    if (chunks.length === 0) return '';
    if (chunks.length === 1) return chunks[0].content;

    // Sort by index
    const sorted = [...chunks].sort((a, b) => a.index - b.index);

    // Use start/end positions to reconstruct
    let result = sorted[0].content;

    for (let i = 1; i < sorted.length; i++) {
      const prevChunk = sorted[i - 1];
      const currChunk = sorted[i];

      // Calculate overlap
      const overlapStart = currChunk.startChar;
      const overlapEnd = prevChunk.endChar;

      if (overlapStart >= overlapEnd) {
        // No overlap, just append
        result += currChunk.content;
      } else {
        // Remove overlapping part from current chunk
        const overlapLength = overlapEnd - overlapStart;
        result += currChunk.content.slice(overlapLength);
      }
    }

    return result;
  }

  /**
   * Get configuration
   */
  getConfig(): ChunkConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ChunkConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a default chunker instance
 */
export function createChunker(config?: Partial<ChunkConfig>): TextChunker {
  return new TextChunker(config);
}

/**
 * Convenience function to chunk text with default settings
 */
export function chunkText(text: string, sourceId: string): TextChunk[] {
  const chunker = new TextChunker();
  return chunker.chunk(text, sourceId);
}
