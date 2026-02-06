/**
 * Memory Tools
 *
 * Tools for Agent to interact with the memory system.
 * Implements memory_search and memory_get following OpenClaw pattern.
 */

import { z } from 'zod';
import type { Tool, ToolResult, ToolExecutionOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

// Memory system instance holder (set by AgentManager on startup)
let memorySystemInstance: any = null;

/**
 * Set the memory system instance for tools to use
 */
export function setMemorySystem(instance: any): void {
  memorySystemInstance = instance;
  logger.info('[MemoryTools] Memory system instance set');
}

/**
 * Get the memory system instance
 */
function getMemorySystem(): any {
  if (!memorySystemInstance) {
    throw new Error('Memory system not initialized. Call setMemorySystem() first.');
  }
  return memorySystemInstance;
}

/**
 * Memory Search Tool
 *
 * Search for relevant memories using semantic similarity and keyword matching.
 * Returns ranked results with relevance scores.
 */
export const memorySearchTool: Tool = {
  name: 'memory_search',
  description: `Search the memory system for relevant information. Uses hybrid search combining semantic similarity and keyword matching.

Use this tool when you need to:
- Find previously stored information
- Recall context from past conversations
- Look up user preferences or facts
- Search for related memories before answering questions

The search returns ranked results with relevance scores (0-100%).`,
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'query',
      description: 'Natural language search query. Be specific and descriptive for better results.',
      schema: z.string(),
      required: true,
    },
    {
      name: 'limit',
      description: 'Maximum number of results to return (default: 5, max: 20)',
      schema: z.number().min(1).max(20),
      required: false,
      default: 5,
    },
    {
      name: 'tags',
      description: 'Filter by tags (optional). Results must match at least one tag.',
      schema: z.array(z.string()),
      required: false,
    },
    {
      name: 'minScore',
      description: 'Minimum relevance score (0-1) to include in results (default: 0.1)',
      schema: z.number().min(0).max(1),
      required: false,
      default: 0.1,
    },
    {
      name: 'importance',
      description: 'Filter by importance level (low, medium, high)',
      schema: z.enum(['low', 'medium', 'high']),
      required: false,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const { query, limit = 5, tags, minScore = 0.1, importance } = params;

      logger.debug(`[memory_search] Query: "${query}", limit: ${limit}`);

      const memorySystem = getMemorySystem();

      // Build search query
      const searchQuery: any = {
        keywords: query.split(/\s+/).filter((w: string) => w.length > 2),
        limit,
      };

      if (tags && tags.length > 0) {
        searchQuery.tags = tags;
      }

      if (importance) {
        searchQuery.importance = importance;
      }

      // Execute search
      const results = await memorySystem.searchMemories(searchQuery);

      // Filter by minScore and format results
      const filteredResults = results
        .filter((r: any) => r.score >= minScore * 100) // Our scoring is 0-100+
        .slice(0, limit)
        .map((r: any) => ({
          id: r.entry.id,
          title: r.entry.title,
          content: r.entry.content.slice(0, 500) + (r.entry.content.length > 500 ? '...' : ''),
          tags: r.entry.tags,
          importance: r.entry.importance,
          relevance: Math.min(100, Math.round(r.score)),
          matchedFields: r.matchedFields,
          timestamp: r.entry.timestamp,
        }));

      const duration = Date.now() - startTime;

      return {
        success: true,
        output: {
          query,
          totalResults: filteredResults.length,
          results: filteredResults,
        },
        metadata: {
          duration,
          toolName: 'memory_search',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('[memory_search] Error:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_SEARCH_FAILED',
          message: error instanceof Error ? error.message : 'Failed to search memory',
          details: error,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_search',
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Memory Get Tool
 *
 * Get the full content of a specific memory entry by ID or path.
 */
export const memoryGetTool: Tool = {
  name: 'memory_get',
  description: `Get the full content of a specific memory entry by its ID.

Use this tool when:
- You found a relevant memory via memory_search and need the full content
- You know the specific memory ID you want to retrieve
- You need to read the complete details of a memory

Returns the complete memory entry including all metadata.`,
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'id',
      description: 'The memory entry ID to retrieve',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const { id } = params;

      logger.debug(`[memory_get] Retrieving memory: ${id}`);

      const memorySystem = getMemorySystem();
      const entry = await memorySystem.loadMemory(id);

      if (!entry) {
        return {
          success: false,
          error: {
            code: 'MEMORY_NOT_FOUND',
            message: `Memory with ID "${id}" not found`,
          },
          metadata: {
            duration: Date.now() - startTime,
            toolName: 'memory_get',
            timestamp: Date.now(),
          },
        };
      }

      return {
        success: true,
        output: {
          id: entry.id,
          title: entry.title,
          content: entry.content,
          tags: entry.tags,
          importance: entry.importance,
          timestamp: entry.timestamp,
          lastAccessed: entry.lastAccessed,
          formattedDate: new Date(entry.timestamp).toISOString(),
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_get',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('[memory_get] Error:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_GET_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get memory',
          details: error,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_get',
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Memory Save Tool
 *
 * Save a new memory entry to the system.
 */
export const memorySaveTool: Tool = {
  name: 'memory_save',
  description: `Save a new memory entry to the memory system.

Use this tool when:
- User asks you to remember something
- You discover important information that should be persisted
- You want to store context for future conversations

Guidelines:
- Use clear, descriptive titles
- Add relevant tags for easier searching
- Set appropriate importance level
- Keep content concise but complete`,
  category: 'system',
  permissions: ['memory:write'],
  parallelizable: false,

  parameters: [
    {
      name: 'title',
      description: 'A clear, descriptive title for the memory',
      schema: z.string(),
      required: true,
    },
    {
      name: 'content',
      description: 'The content to remember',
      schema: z.string(),
      required: true,
    },
    {
      name: 'tags',
      description: 'Tags for categorization and search (e.g., ["user-preference", "project"])',
      schema: z.array(z.string()),
      required: false,
      default: [],
    },
    {
      name: 'importance',
      description: 'Importance level: low (transient), medium (normal), high (critical)',
      schema: z.enum(['low', 'medium', 'high']),
      required: false,
      default: 'medium',
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const { title, content, tags = [], importance = 'medium' } = params;

      logger.debug(`[memory_save] Saving memory: "${title}"`);

      const memorySystem = getMemorySystem();
      const entry = await memorySystem.createMemory(title, content, { tags, importance });

      return {
        success: true,
        output: {
          id: entry.id,
          title: entry.title,
          tags: entry.tags,
          importance: entry.importance,
          timestamp: entry.timestamp,
          message: `Memory saved successfully: "${title}"`,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_save',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('[memory_save] Error:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_SAVE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to save memory',
          details: error,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_save',
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Memory Delete Tool
 *
 * Delete a memory entry by ID.
 */
export const memoryDeleteTool: Tool = {
  name: 'memory_delete',
  description: `Delete a memory entry from the system.

Use this tool when:
- User explicitly asks to forget something
- Information is outdated and should be removed
- A memory entry is no longer relevant

Note: This action cannot be undone.`,
  category: 'system',
  permissions: ['memory:delete'],
  parallelizable: false,

  parameters: [
    {
      name: 'id',
      description: 'The memory entry ID to delete',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const { id } = params;

      logger.debug(`[memory_delete] Deleting memory: ${id}`);

      const memorySystem = getMemorySystem();
      const success = await memorySystem.deleteMemory(id);

      if (!success) {
        return {
          success: false,
          error: {
            code: 'MEMORY_NOT_FOUND',
            message: `Memory with ID "${id}" not found or already deleted`,
          },
          metadata: {
            duration: Date.now() - startTime,
            toolName: 'memory_delete',
            timestamp: Date.now(),
          },
        };
      }

      return {
        success: true,
        output: {
          id,
          deleted: true,
          message: `Memory "${id}" deleted successfully`,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_delete',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('[memory_delete] Error:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_DELETE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to delete memory',
          details: error,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_delete',
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * Memory List Tool
 *
 * List all memory entries with optional filtering.
 */
export const memoryListTool: Tool = {
  name: 'memory_list',
  description: `List all memory entries in the system with optional filtering.

Use this tool when:
- You need an overview of stored memories
- You want to browse memories by tag or importance
- You need to find memories without a specific search query`,
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'tags',
      description: 'Filter by tags (optional)',
      schema: z.array(z.string()),
      required: false,
    },
    {
      name: 'importance',
      description: 'Filter by importance level',
      schema: z.enum(['low', 'medium', 'high']),
      required: false,
    },
    {
      name: 'limit',
      description: 'Maximum number of entries to return (default: 20)',
      schema: z.number().min(1).max(100),
      required: false,
      default: 20,
    },
    {
      name: 'sortBy',
      description: 'Sort by: timestamp (newest first) or title (alphabetical)',
      schema: z.enum(['timestamp', 'title']),
      required: false,
      default: 'timestamp',
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const { tags, importance, limit = 20, sortBy = 'timestamp' } = params;

      logger.debug(`[memory_list] Listing memories (limit: ${limit})`);

      const memorySystem = getMemorySystem();
      let entries = await memorySystem.loadAllMemories();

      // Apply filters
      if (tags && tags.length > 0) {
        entries = entries.filter((e: any) =>
          tags.some((tag: string) => e.tags.includes(tag))
        );
      }

      if (importance) {
        entries = entries.filter((e: any) => e.importance === importance);
      }

      // Sort
      if (sortBy === 'timestamp') {
        entries.sort((a: any, b: any) => b.timestamp - a.timestamp);
      } else {
        entries.sort((a: any, b: any) => a.title.localeCompare(b.title));
      }

      // Limit and format
      const result = entries.slice(0, limit).map((e: any) => ({
        id: e.id,
        title: e.title,
        tags: e.tags,
        importance: e.importance,
        timestamp: e.timestamp,
        formattedDate: new Date(e.timestamp).toISOString(),
        preview: e.content.slice(0, 100) + (e.content.length > 100 ? '...' : ''),
      }));

      return {
        success: true,
        output: {
          totalCount: entries.length,
          returnedCount: result.length,
          entries: result,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_list',
          timestamp: Date.now(),
        },
      };
    } catch (error) {
      logger.error('[memory_list] Error:', error);
      return {
        success: false,
        error: {
          code: 'MEMORY_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to list memories',
          details: error,
        },
        metadata: {
          duration: Date.now() - startTime,
          toolName: 'memory_list',
          timestamp: Date.now(),
        },
      };
    }
  },
};

/**
 * All memory tools
 */
export const memoryTools: Tool[] = [
  memorySearchTool,
  memoryGetTool,
  memorySaveTool,
  memoryDeleteTool,
  memoryListTool,
];
