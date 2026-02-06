/**
 * Memory System - Barrel Export
 *
 * Unified memory system with chunking, vector search, and hybrid retrieval.
 */
// Core types
export * from './types.js';
// Storage
export { JSONLStorage } from './JSONLStorage.js';
export { MemoryFileManager } from './MemoryFileManager.js';
// Vector indexing
export { VectorIndex } from './VectorIndex.js';
export { TextChunker, createChunker, chunkText, } from './TextChunker.js';
export { ChunkedVectorIndex, } from './ChunkedVectorIndex.js';
export { VectorStore, } from './VectorStore.js';
// Embedding providers
export { EmbeddingManager, OpenAIEmbeddingProvider, GeminiEmbeddingProvider, LocalEmbeddingProvider, createEmbeddingManager, } from './EmbeddingProvider.js';
// Hybrid search
export { HybridSearchIndex, BM25Index, createHybridSearch, } from './HybridSearch.js';
// Session memory hook
export { SessionMemoryHook, createSessionMemoryHook, createEmptySessionSummary, } from './SessionMemoryHook.js';
// File watcher
export { MemoryFileWatcher, IndexSyncManager, createMemoryFileWatcher, } from './FileWatcher.js';
// Memory flush
export { MemoryFlushManager, createMemoryFlush, } from './MemoryFlush.js';
// Semantic memory
export { SemanticMemory, } from './SemanticMemory.js';
// Daily logs
export { DailyLogManager, } from './DailyLogManager.js';
// Main memory system
export { MemorySystem } from './MemorySystem.js';
