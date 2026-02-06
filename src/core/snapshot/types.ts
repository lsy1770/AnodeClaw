/**
 * Semantic Snapshot Tool - Types
 *
 * Type definitions for codebase snapshot and analysis
 */

/**
 * File type classifications
 */
export type FileType =
  | 'typescript'
  | 'javascript'
  | 'json'
  | 'markdown'
  | 'xml'
  | 'config'
  | 'text'
  | 'unknown';

/**
 * Code entity types
 */
export type EntityType =
  | 'class'
  | 'interface'
  | 'function'
  | 'variable'
  | 'constant'
  | 'type'
  | 'enum'
  | 'import'
  | 'export';

/**
 * Code entity
 */
export interface CodeEntity {
  type: EntityType;
  name: string;
  line: number;
  signature?: string;
  modifiers?: string[];
  docComment?: string;
}

/**
 * File analysis result
 */
export interface FileAnalysis {
  path: string;
  type: FileType;
  lines: number;
  size: number;
  entities: CodeEntity[];
  imports: string[];
  exports: string[];
  dependencies: string[];
  summary: string;
  lastModified: number;
}

/**
 * Directory structure node
 */
export interface DirectoryNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DirectoryNode[];
  analysis?: FileAnalysis;
}

/**
 * Codebase snapshot
 */
export interface CodebaseSnapshot {
  id: string;
  rootPath: string;
  timestamp: number;
  structure: DirectoryNode;
  fileCount: number;
  totalLines: number;
  totalSize: number;
  analyses: Map<string, FileAnalysis>;
  summary: string;
  metadata: {
    language: string;
    framework?: string;
    dependencies?: Record<string, string>;
    [key: string]: any;
  };
}

/**
 * Snapshot options
 */
export interface SnapshotOptions {
  includePaths?: string[]; // Patterns to include
  excludePaths?: string[]; // Patterns to exclude
  maxDepth?: number; // Maximum directory depth
  maxFileSize?: number; // Maximum file size to analyze (bytes)
  analyzeContent?: boolean; // Perform deep content analysis
  generateSummaries?: boolean; // Generate AI summaries
}

/**
 * Search query for code search
 */
export interface CodeSearchQuery {
  query: string;
  fileTypes?: FileType[];
  entityTypes?: EntityType[];
  paths?: string[];
  caseSensitive?: boolean;
  regex?: boolean;
  limit?: number;
}

/**
 * Search result
 */
export interface CodeSearchResult {
  file: string;
  entity?: CodeEntity;
  line: number;
  snippet: string;
  relevance: number;
}
