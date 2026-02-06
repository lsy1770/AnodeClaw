/**
 * Hybrid Memory System - Types
 *
 * Types for JSONL storage and memory files
 */

import type { ToolCall, ToolResult } from '../../tools/types.js';

/**
 * Session log entry (JSONL format)
 */
export interface SessionLogEntry {
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string | ToolCall[] | ToolResult[];
  metadata?: {
    model?: string;
    tokens?: number;
    executionTime?: number;
    compressed?: boolean;
    [key: string]: any;
  };
}

/**
 * Memory file entry (Markdown format)
 */
export interface MemoryEntry {
  id: string;
  title: string;
  content: string;
  tags: string[];
  timestamp: number;
  lastAccessed?: number;
  importance: 'low' | 'medium' | 'high';
}

/**
 * Search query
 */
export interface SearchQuery {
  keywords?: string[];
  tags?: string[];
  timeRange?: {
    start: number;
    end: number;
  };
  importance?: 'low' | 'medium' | 'high';
  limit?: number;
}

/**
 * Search result
 */
export interface SearchResult {
  entry: MemoryEntry;
  score: number;
  matchedFields: string[];
}

/**
 * Memory statistics
 */
export interface MemoryStats {
  totalEntries: number;
  totalSessions: number;
  oldestEntry: number;
  newestEntry: number;
  storageSize: number; // in bytes
}
