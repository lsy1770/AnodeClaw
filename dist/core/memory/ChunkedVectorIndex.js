/**
 * Chunked Vector Index
 *
 * Vector index that stores and searches document chunks.
 * Supports chunk-level retrieval with source document tracking.
 */
import { logger } from '../../utils/logger.js';
import { VectorIndex } from './VectorIndex.js';
import { TextChunker } from './TextChunker.js';
const DEFAULT_INDEX_CONFIG = {
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
    constructor(config) {
        /** Document metadata by document ID */
        this.documents = new Map();
        /** Chunk data by chunk ID */
        this.chunks = new Map();
        this.config = {
            ...DEFAULT_INDEX_CONFIG,
            ...config,
        };
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
    add(id, content, options) {
        // Remove existing document if present
        if (this.documents.has(id)) {
            this.remove(id);
        }
        // Chunk the document
        const textChunks = this.chunker.chunk(content, id);
        // Store document metadata
        const docMeta = {
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
    remove(id) {
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
    searchChunks(query, limit, minScore) {
        const maxResults = limit ?? this.config.maxResults;
        const threshold = minScore ?? this.config.minScore;
        const vectorResults = this.index.search(query, maxResults * 2, threshold);
        const results = [];
        for (const vr of vectorResults) {
            const chunk = this.chunks.get(vr.id);
            if (!chunk)
                continue;
            const docMeta = this.documents.get(chunk.sourceId);
            if (!docMeta)
                continue;
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
    searchDocuments(query, limit, minScore) {
        const maxResults = limit ?? this.config.maxResults;
        const threshold = minScore ?? this.config.minScore;
        // Get chunk results (more than needed for aggregation)
        const chunkResults = this.searchChunks(query, maxResults * 3, threshold);
        // Group by document
        const byDocument = new Map();
        for (const cr of chunkResults) {
            if (!byDocument.has(cr.sourceId)) {
                byDocument.set(cr.sourceId, []);
            }
            byDocument.get(cr.sourceId).push(cr);
        }
        // Create document results
        const docResults = [];
        for (const [docId, chunks] of byDocument) {
            const docMeta = this.documents.get(docId);
            if (!docMeta)
                continue;
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
    getChunk(chunkId) {
        return this.chunks.get(chunkId);
    }
    /**
     * Get all chunks for a document
     */
    getDocumentChunks(docId) {
        const docMeta = this.documents.get(docId);
        if (!docMeta)
            return [];
        return docMeta.chunkIds
            .map(id => this.chunks.get(id))
            .filter((c) => c !== undefined)
            .sort((a, b) => a.index - b.index);
    }
    /**
     * Reconstruct document content from chunks
     */
    getDocumentContent(docId) {
        const chunks = this.getDocumentChunks(docId);
        if (chunks.length === 0)
            return null;
        return this.chunker.mergeChunks(chunks);
    }
    /**
     * Get document metadata
     */
    getDocument(docId) {
        return this.documents.get(docId);
    }
    /**
     * Check if document exists
     */
    hasDocument(docId) {
        return this.documents.has(docId);
    }
    /**
     * Get all document IDs
     */
    getDocumentIds() {
        return Array.from(this.documents.keys());
    }
    /**
     * Get index statistics
     */
    getStats() {
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
    clear() {
        this.documents.clear();
        this.chunks.clear();
        this.index.clear();
        logger.debug('[ChunkedIndex] Cleared all data');
    }
    /**
     * Get the underlying chunker for configuration
     */
    getChunker() {
        return this.chunker;
    }
}
