/**
 * Memory Tools
 *
 * Agent tools for interacting with MemoryStore (3-layer memory system).
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';
import type { MemoryStore } from '../../core/memory/MemoryStore.js';

let store: MemoryStore | null = null;

export function setMemoryStore(instance: MemoryStore): void {
  store = instance;
  logger.info('[MemoryTools] MemoryStore instance set');
}

// Backward-compat alias used by AgentManager
export { setMemoryStore as setMemorySystem };

function getStore(): MemoryStore {
  if (!store) throw new Error('MemoryStore not initialized. Call setMemoryStore() first.');
  return store;
}

// ─── memory_search ────────────────────────────────────────────────────────────

export const memorySearchTool: Tool = {
  name: 'memory_search',
  description: 'Search the knowledge base for relevant memories by keyword and tags.',
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    { name: 'query',      description: 'Natural language search query',                                     schema: z.string(),                          required: true },
    { name: 'limit',      description: 'Max results (default 5, max 20)',                                   schema: z.number().min(1).max(20),            required: false, default: 5 },
    { name: 'tags',       description: 'Filter: results must match at least one tag',                       schema: z.array(z.string()),                  required: false },
    { name: 'importance', description: 'Filter by importance level',                                        schema: z.enum(['low', 'medium', 'high']),    required: false },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const { query, limit = 5, tags, importance } = params;
      const results = await getStore().search(query, { tags, limit, importance });
      return {
        success: true,
        output: {
          query,
          totalResults: results.length,
          results: results.map(r => ({
            id: r.entry.id,
            title: r.entry.title,
            content: r.entry.content.slice(0, 500) + (r.entry.content.length > 500 ? '…' : ''),
            tags: r.entry.tags,
            importance: r.entry.importance,
            relevance: Math.round(r.score),
            matchedFields: r.matchedFields,
            timestamp: r.entry.timestamp,
          })),
        },
        metadata: { duration: Date.now() - t, toolName: 'memory_search', timestamp: Date.now() },
      };
    } catch (error) {
      return { success: false, error: { code: 'MEMORY_SEARCH_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'memory_search', timestamp: Date.now() } };
    }
  },
};

// ─── memory_get ───────────────────────────────────────────────────────────────

export const memoryGetTool: Tool = {
  name: 'memory_get',
  description: 'Get the full content of a specific memory entry by ID.',
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    { name: 'id', description: 'Memory entry ID', schema: z.string(), required: true },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const entry = await getStore().load(params.id);
      if (!entry) return { success: false, error: { code: 'MEMORY_NOT_FOUND', message: `Memory "${params.id}" not found` }, metadata: { duration: Date.now() - t, toolName: 'memory_get', timestamp: Date.now() } };
      return {
        success: true,
        output: { ...entry, formattedDate: new Date(entry.timestamp).toISOString() },
        metadata: { duration: Date.now() - t, toolName: 'memory_get', timestamp: Date.now() },
      };
    } catch (error) {
      return { success: false, error: { code: 'MEMORY_GET_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'memory_get', timestamp: Date.now() } };
    }
  },
};

// ─── memory_save ──────────────────────────────────────────────────────────────

export const memorySaveTool: Tool = {
  name: 'memory_save',
  description: 'Save a new memory entry. Use importance=high for critical facts the agent must always recall.',
  category: 'system',
  permissions: ['memory:write'],
  parallelizable: false,

  parameters: [
    { name: 'title',      description: 'Descriptive title',                                                 schema: z.string(),                          required: true },
    { name: 'content',    description: 'Content to remember',                                               schema: z.string(),                          required: true },
    { name: 'tags',       description: 'Tags for categorization',                                           schema: z.array(z.string()),                  required: false, default: [] },
    { name: 'importance', description: 'low | medium (default) | high',                                     schema: z.enum(['low', 'medium', 'high']),    required: false, default: 'medium' },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const { title, content, tags = [], importance = 'medium' } = params;
      const entry = await getStore().createMemory(title, content, { tags, importance });
      return {
        success: true,
        output: { id: entry.id, title: entry.title, tags: entry.tags, importance: entry.importance, message: `Saved: "${title}"` },
        metadata: { duration: Date.now() - t, toolName: 'memory_save', timestamp: Date.now() },
      };
    } catch (error) {
      return { success: false, error: { code: 'MEMORY_SAVE_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'memory_save', timestamp: Date.now() } };
    }
  },
};

// ─── memory_delete ────────────────────────────────────────────────────────────

export const memoryDeleteTool: Tool = {
  name: 'memory_delete',
  description: 'Delete a memory entry by ID. Cannot be undone.',
  category: 'system',
  permissions: ['memory:delete'],
  parallelizable: false,

  parameters: [
    { name: 'id', description: 'Memory entry ID to delete', schema: z.string(), required: true },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const ok = await getStore().delete(params.id);
      if (!ok) return { success: false, error: { code: 'MEMORY_NOT_FOUND', message: `Memory "${params.id}" not found` }, metadata: { duration: Date.now() - t, toolName: 'memory_delete', timestamp: Date.now() } };
      return { success: true, output: { id: params.id, deleted: true }, metadata: { duration: Date.now() - t, toolName: 'memory_delete', timestamp: Date.now() } };
    } catch (error) {
      return { success: false, error: { code: 'MEMORY_DELETE_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'memory_delete', timestamp: Date.now() } };
    }
  },
};

// ─── memory_list ──────────────────────────────────────────────────────────────

export const memoryListTool: Tool = {
  name: 'memory_list',
  description: 'List all memory entries with optional tag/importance filtering.',
  category: 'system',
  permissions: ['memory:read'],
  parallelizable: true,

  parameters: [
    { name: 'tags',       description: 'Filter by tags',             schema: z.array(z.string()),            required: false },
    { name: 'importance', description: 'Filter by importance level', schema: z.enum(['low', 'medium', 'high']), required: false },
    { name: 'limit',      description: 'Max entries (default 20)',   schema: z.number().min(1).max(100),      required: false, default: 20 },
    { name: 'sortBy',     description: 'timestamp | title',          schema: z.enum(['timestamp', 'title']),  required: false, default: 'timestamp' },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const { tags, importance, limit = 20, sortBy = 'timestamp' } = params;
      let entries = await getStore().loadAll();

      if (tags?.length)  entries = entries.filter(e => tags.some((tag: string) => e.tags.includes(tag)));
      if (importance)    entries = entries.filter(e => e.importance === importance);

      entries.sort((a, b) => sortBy === 'title' ? a.title.localeCompare(b.title) : b.timestamp - a.timestamp);

      const result = entries.slice(0, limit).map(e => ({
        id: e.id, title: e.title, tags: e.tags, importance: e.importance,
        timestamp: e.timestamp, formattedDate: new Date(e.timestamp).toISOString(),
        preview: e.content.slice(0, 100) + (e.content.length > 100 ? '…' : ''),
      }));

      return { success: true, output: { totalCount: entries.length, returnedCount: result.length, entries: result }, metadata: { duration: Date.now() - t, toolName: 'memory_list', timestamp: Date.now() } };
    } catch (error) {
      return { success: false, error: { code: 'MEMORY_LIST_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'memory_list', timestamp: Date.now() } };
    }
  },
};

// ─── context_checkpoint ───────────────────────────────────────────────────────

export const contextCheckpointTool: Tool = {
  name: 'context_checkpoint',
  description: `Save a structured checkpoint of the current task state.

CALL THIS PROACTIVELY:
- After receiving a complex multi-step task
- Every ~10 tool calls on long tasks
- When context is getting long (prevents forgetting requirements)
- After completing a major phase

To recover after context loss: call memory_search with "checkpoint task-state".`,
  category: 'system',
  permissions: ['memory:write'],
  parallelizable: false,

  parameters: [
    { name: 'task_summary',    description: 'Brief description of the overall task',                        schema: z.string(),              required: true },
    { name: 'requirements',    description: 'Key requirements and constraints to follow',                   schema: z.array(z.string()),      required: true },
    { name: 'progress',        description: 'What has already been completed',                              schema: z.string(),              required: false, default: '' },
    { name: 'next_steps',      description: 'What still needs to be done',                                  schema: z.array(z.string()),      required: false, default: [] },
    { name: 'important_facts', description: 'Critical key=value facts discovered (paths, IDs, settings)',  schema: z.record(z.string()),    required: false, default: {} },
  ],

  async execute(params): Promise<ToolResult> {
    const t = Date.now();
    try {
      const { task_summary, requirements, progress = '', next_steps = [], important_facts = {} } = params;
      const state = await getStore().saveTaskState({ taskSummary: task_summary, requirements, progress, nextSteps: next_steps, importantFacts: important_facts });
      return {
        success: true,
        output: { checkpointId: state.checkpointId, message: 'Task state saved. Will be auto-injected into next prompt.' },
        metadata: { duration: Date.now() - t, toolName: 'context_checkpoint', timestamp: Date.now() },
      };
    } catch (error) {
      return { success: false, error: { code: 'CHECKPOINT_FAILED', message: String(error) }, metadata: { duration: Date.now() - t, toolName: 'context_checkpoint', timestamp: Date.now() } };
    }
  },
};

export const memoryTools: Tool[] = [
  memorySearchTool,
  memoryGetTool,
  memorySaveTool,
  memoryDeleteTool,
  memoryListTool,
  contextCheckpointTool,
];
