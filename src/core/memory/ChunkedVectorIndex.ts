/**
 * Chunked Vector Index
 *
 * Vector index that stores and searches document chunks.
 * Supports chunk-level retrieval with source document tracking.
 */

import { logger } from '../../utils/logger.js';
import { VectorIndex } from './VectorIndex.js';
import { TextChunker, TextChunk, ChunkConfig } from './TextChunker.js';

/**
 * Document metadata stored alongside chunks
 */
export interface DocumentMeta {
  id: string;
  title?: string;
  type: 'memory' | 'daily-log' | 'session-summary' | 'file';
  path?: string;
  chunkIds: string[];
  totalChunks: number;
  timestamp: number;
}

/**
 * Chunk search result with source info
 */
export interface ChunkSearchResult {
  /** Chunk ID */
  chunkId: string;
  /** Source document ID */
  sourceId: string;
  /** Source document title */
  sourceTitle?: string;
  /** Source document type */
  sourceType: 'memory' | 'daily-log' | 'session-summary' | 'file';
  /** Chunk index within document */
  chunkIndex: number;
  /** Total chunks in document */
  totalChunks: number;
  /** Chunk content */
  content: string;
  /** Similarity score (0-1) */
  score: number;
  /** Character range in original document */
  charRange: { start: number; end: number };
}

/**
 * Aggregated document search result
 */
export interface DocumentSearchResult {
  /** Document ID */
  id: string;
  /** Document title */
  title?: string;
  /** Document type */
  type: 'memory' | 'daily-log' | 'session-summary' | 'file';
  /** Best matching chunk */
  bestChunk: ChunkSearchResult;
  /** All matching chunks for this document */
  matchingChunks: ChunkSearchResult[];
  /** Aggregated score (max of chunk scores) */
  score: number;
  /** Average score across matching chunks */
  avgScore: number;
}

/**
 * Chunked Vector Index Configuration
 */
export interface ChunkedIndexConfig extends Partial<ChunkConfig> {
  /** Maximum results per search (default: 10) */
  maxResults?: number;
  /** Minimum score threshold (default: 0.05) */
  minScore?: number;
  /** Aggregate by document (default: true) */
  aggregateByDocument?: boolean;
}

const DEFAULT_INDEX_CONFIG: ChunkedIndexConfig = {
  maxResults: 10,
  minScore: 0.05,
  aggregateByDocument: true,
};

/**
 * Chunked Vector Index Class
 *
 * Indexes documents at chunk level for better retrieval precision.
 */
export class ChunkedVectorIndex {
  private index: VectorIndex;
  private chunker: TextChunker;
  private config: Required<ChunkedIndexConfig>;

  /** Document metadata by document ID */
  private documents: Map<string, DocumentMeta> = new Map();

  /** Chunk data by chunk ID */
  private chunks: Map<string, TextChunk> = new Map();

  constructor(config?: ChunkedIndexConfig) {
    this.config = {
      ...DEFAULT_INDEX_CONFIG,
      ...config,
    } as Required<ChunkedIndexConfig>;

    this.index = new VectorIndex();
    this.chunker = new TextChunker({
      chunkSize: config?.chunkSize,
      overlap: config?.overlap,
      charsPerToken: config?.charsPerToken,
      minChunkSize: config?.minChunkSize,
    });
  }

  /**
   * Add a document to the index
   *
   * @param id - Document ID
   * @param content - Document content
   * @param options - Document metadata
   */
  add(
    id: string,
    content: string,
    options?: {
      title?: string;
      type?: 'memory' | 'daily-log' | 'session-summary' | 'file';
      path?: string;
    }
  ): void {
    // Remove existing document if present
    if (this.documents.has(id)) {
      this.remove(id);
    }

    // Chunk the document
    const textChunks = this.chunker.chunk(content, id);

    // Store document metadata
    const docMeta: DocumentMeta = {
      id,
      title: options?.title,
      type: options?.type || 'memory',
      path: options?.path,
      chunkIds: textChunks.map(c => c.id),
      totalChunks: textChunks.length,
      timestamp: Date.now(),
    };
    this.documents.set(id, docMeta);

    // Index each chunk
    for (const chunk of textChunks) {
      this.chunks.set(chunk.id, chunk);
      this.index.add(chunk.id, chunk.content);
    }

    logger.debug(`[ChunkedIndex] Added document "${id}" with ${textChunks.length} chunks`);
  }

  /**
   * Remove a document and all its chunks
   */
  remove(id: string): boolean {
    const docMeta = this.documents.get(id);
    if (!docMeta) {
      return false;
    }

    // Remove all chunks
    for (const chunkId of docMeta.chunkIds) {
      this.chunks.delete(chunkId);
      this.index.remove(chunkId);
    }

    // Remove document metadata
    this.documents.delete(id);

    logger.debug(`[ChunkedIndex] Removed document "${id}"`);
    return true;
  }

  /**
   * Search for relevant chunks
   *
   * @param query - Search query
   * @param limit - Maximum results
   * @param minScore - Minimum similarity score
   */
  searchChunks(
    query: string,
    limit?: number,
    minScore?: number
  ): ChunkSearchResult[] {
    const maxResults = limit ?? this.config.maxResults;
    const threshold = minScore ?? this.config.minScore;

    const vectorResults = this.index.search(query, maxResults * 2, threshold);

    const results: ChunkSearchResult[] = [];

    for (const vr of vectorResults) {
      const chunk = this.chunks.get(vr.id);
      if (!chunk) continue;

      const docMeta = this.documents.get(chunk.sourceId);
      if (!docMeta) continue;

      results.push({
        chunkId: chunk.id,
        sourceId: chunk.sourceId,
        sourceTitle: docMeta.title,
        sourceType: docMeta.type,
        chunkIndex: chunk.index,
        totalChunks: chunk.totalChunks,
        content: chunk.content,
        score: vr.score,
        charRange: { start: chunk.startChar, end: chunk.endChar },
      });
    }

    return results.slice(0, maxResults);
  }

  /**
   * Search and aggregate results by document
   *
   * @param query - Search query
   * @param limit - Maximum documents to return
   * @param minScore - Minimum similarity score
   */
  searchDocuments(
    query: string,
    limit?: number,
    minScore?: number
  ): DocumentSearchResult[] {
    const maxResults = limit ?? this.config.maxResults;
    const threshold = minScore ?? this.config.minScore;

    // Get chunk results (more than needed for aggregation)
    const chunkResults = this.searchChunks(query, maxResults * 3, threshold);

    // Group by document
    const byDocument = new Map<string, ChunkSearchResult[]>();
    for (const cr of chunkResults) {
      if (!byDocument.has(cr.sourceId)) {
        byDocument.set(cr.sourceId, []);
      }
      byDocument.get(cr.sourceId)!.push(cr);
    }

    // Create document results
    const docResults: DocumentSearchResult[] = [];

    for (const [docId, chunks] of byDocument) {
      const docMeta = this.documents.get(docId);
      if (!docMeta) continue;

      // Sort chunks by score descending
      chunks.sort((a, b) => b.score - a.score);

      const scores = chunks.map(c => c.score);
      const maxScore = Math.max(...scores);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      docResults.push({
        id: docId,
        title: docMeta.title,
        type: docMeta.type,
        bestChunk: chunks[0],
        matchingChunks: chunks,
        score: maxScore,
        avgScore,
      });
    }

    // Sort by score descending
    docResults.sort((a, b) => b.score - a.score);

    return docResults.slice(0, maxResults);
  }

  /**
   * Get a specific chunk by ID
   */
  getChunk(chunkId: string): TextChunk | undefined {
    return this.chunks.get(chunkId);
  }

  /**
   * Get all chunks for a document
   */
  getDocumentChunks(docId: string): TextChunk[] {
    const docMeta = this.documents.get(docId);
    if (!docMeta) return [];

    return docMeta.chunkIds
      .map(id => this.chunks.get(id))
      .filter((c): c is TextChunk => c !== undefined)
      .sort((a, b) => a.index - b.index);
  }

  /**
   * Reconstruct document content from chunks
   */
  getDocumentContent(docId: string): string | null {
    const chunks = this.getDocumentChunks(docId);
    if (chunks.length === 0) return null;

    return this.chunker.mergeChunks(chunks);
  }

  /**
   * Get document metadata
   */
  getDocument(docId: string): DocumentMeta | undefined {
    return this.documents.get(docId);
  }

  /**
   * Check if document exists
   */
  hasDocument(docId: string): boolean {
    return this.documents.has(docId);
  }

  /**
   * Get all document IDs
   */
  getDocumentIds(): string[] {
    return Array.from(this.documents.keys());
  }

  /**
   * Get index statistics
   */
  getStats(): {
    documentCount: number;
    chunkCount: number;
    avgChunksPerDoc: number;
  } {
    const documentCount = this.documents.size;
    const chunkCount = this.chunks.size;
    const avgChunksPerDoc = documentCount > 0 ? chunkCount / documentCount : 0;

    return {
      documentCount,
      chunkCount,
      avgChunksPerDoc: Math.round(avgChunksPerDoc * 10) / 10,
    };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.documents.clear();
    this.chunks.clear();
    this.index.clear();
    logger.debug('[ChunkedIndex] Cleared all data');
  }

  /**
   * Get the underlying chunker for configuration
   */
  getChunker(): TextChunker {
    return this.chunker;
  }
}
