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
export {
  TextChunker,
  createChunker,
  chunkText,
  type TextChunk,
  type ChunkConfig,
} from './TextChunker.js';
export {
  ChunkedVectorIndex,
  type DocumentMeta,
  type ChunkSearchResult,
  type DocumentSearchResult,
  type ChunkedIndexConfig,
} from './ChunkedVectorIndex.js';
export {
  VectorStore,
  type VectorEntry,
  type VectorMetadata,
  type VectorStoreSearchResult,
  type VectorStoreConfig,
} from './VectorStore.js';

// Embedding providers
export {
  EmbeddingManager,
  OpenAIEmbeddingProvider,
  GeminiEmbeddingProvider,
  LocalEmbeddingProvider,
  createEmbeddingManager,
  type EmbeddingProvider,
  type EmbeddingResult,
  type BatchEmbeddingResult,
  type EmbeddingProviderConfig,
} from './EmbeddingProvider.js';

// Hybrid search
export {
  HybridSearchIndex,
  BM25Index,
  createHybridSearch,
  type HybridDocument,
  type HybridSearchResult,
  type HybridSearchConfig,
} from './HybridSearch.js';

// Session memory hook
export {
  SessionMemoryHook,
  createSessionMemoryHook,
  createEmptySessionSummary,
  type SessionSummary,
  type SessionMemoryHookConfig,
} from './SessionMemoryHook.js';

// File watcher
export {
  MemoryFileWatcher,
  IndexSyncManager,
  createMemoryFileWatcher,
  type FileChangeEvent,
  type FileWatcherConfig,
} from './FileWatcher.js';

// Memory flush
export {
  MemoryFlushManager,
  createMemoryFlush,
  type FlushableContext,
  type FlushMessage,
  type MemoryCandidate,
  type FlushResult,
  type MemoryFlushConfig,
} from './MemoryFlush.js';

// Semantic memory
export {
  SemanticMemory,
  type ContextSource,
  type RelevantContext,
  type SemanticMemoryConfig,
} from './SemanticMemory.js';

// Daily logs
export {
  DailyLogManager,
  type DailyLog,
  type DailySessionEntry,
} from './DailyLogManager.js';

// Main memory system
export { MemorySystem, type MemorySystemConfig } from './MemorySystem.js';
