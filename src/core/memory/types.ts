/**
 * Memory System Types
 */

/** A single knowledge entry stored in the Knowledge Base (Layer 3) */
export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  importance: 'low' | 'medium' | 'high';
  timestamp: number;
  lastAccessed?: number;
}

/** Structured task state stored in Task State layer (Layer 2) */
export interface TaskState {
  checkpointId: string;
  taskSummary: string;
  requirements: string[];
  progress: string;
  nextSteps: string[];
  importantFacts: Record<string, string>;
  savedAt: number;
}

/** Search query */
export interface SearchQuery {
  keywords?: string[];
  tags?: string[];
  importance?: 'low' | 'medium' | 'high';
  limit?: number;
}

/** Search result with relevance score */
export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  matchedFields: string[];
}
