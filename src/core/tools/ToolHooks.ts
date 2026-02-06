/**
 * Tool Hooks
 *
 * Implements before/after hooks for tool execution.
 * Following OpenClaw pattern for tool call interception.
 *
 * Use cases:
 * - Logging and monitoring
 * - Parameter modification
 * - Permission checks
 * - Rate limiting
 * - Result transformation
 */

import { logger } from '../../utils/logger.js';
import type { Tool, ToolResult } from '../../tools/types.js';

/**
 * Tool call context
 */
export interface ToolCallContext {
  /** Tool call ID */
  callId: string;
  /** Tool name */
  toolName: string;
  /** Tool arguments */
  args: Record<string, any>;
  /** Session ID */
  sessionId: string;
  /** Run ID */
  runId?: string;
  /** User ID (if from social platform) */
  userId?: string;
  /** Channel (platform name) */
  channel?: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * Before tool call hook result
 */
export interface BeforeToolCallResult {
  /** Whether to proceed with the call */
  proceed: boolean;
  /** Modified arguments (optional) */
  modifiedArgs?: Record<string, any>;
  /** Reason for blocking (if proceed=false) */
  blockReason?: string;
  /** Custom result to return instead of executing (optional) */
  overrideResult?: any;
}

/**
 * After tool call hook context
 */
export interface AfterToolCallContext extends ToolCallContext {
  /** Tool result */
  result: any;
  /** Whether the call was an error */
  isError: boolean;
  /** Execution duration in ms */
  duration: number;
}

/**
 * After tool call hook result
 */
export interface AfterToolCallResult {
  /** Modified result (optional) */
  modifiedResult?: any;
  /** Additional metadata to attach */
  metadata?: Record<string, any>;
}

/**
 * Hook function types
 */
export type BeforeToolCallHook = (
  ctx: ToolCallContext
) => Promise<BeforeToolCallResult> | BeforeToolCallResult;

export type AfterToolCallHook = (
  ctx: AfterToolCallContext
) => Promise<AfterToolCallResult | void> | AfterToolCallResult | void;

/**
 * Registered hook
 */
interface RegisteredHook<T> {
  id: string;
  name: string;
  priority: number;
  hook: T;
}

/**
 * Tool Hooks Manager
 *
 * Manages before/after hooks for tool execution.
 */
export class ToolHooksManager {
  private beforeHooks: RegisteredHook<BeforeToolCallHook>[] = [];
  private afterHooks: RegisteredHook<AfterToolCallHook>[] = [];
  private hookIdCounter = 0;

  /**
   * Register a before tool call hook
   *
   * @param name - Hook name for logging
   * @param hook - Hook function
   * @param priority - Priority (higher runs first, default: 0)
   * @returns Hook ID for unregistering
   */
  onBeforeToolCall(
    name: string,
    hook: BeforeToolCallHook,
    priority: number = 0
  ): string {
    const id = `before-${++this.hookIdCounter}`;
    this.beforeHooks.push({ id, name, priority, hook });

    // Sort by priority (higher first)
    this.beforeHooks.sort((a, b) => b.priority - a.priority);

    logger.debug(`[ToolHooks] Registered before hook: ${name} (priority: ${priority})`);
    return id;
  }

  /**
   * Register an after tool call hook
   *
   * @param name - Hook name for logging
   * @param hook - Hook function
   * @param priority - Priority (higher runs first, default: 0)
   * @returns Hook ID for unregistering
   */
  onAfterToolCall(
    name: string,
    hook: AfterToolCallHook,
    priority: number = 0
  ): string {
    const id = `after-${++this.hookIdCounter}`;
    this.afterHooks.push({ id, name, priority, hook });

    // Sort by priority (higher first)
    this.afterHooks.sort((a, b) => b.priority - a.priority);

    logger.debug(`[ToolHooks] Registered after hook: ${name} (priority: ${priority})`);
    return id;
  }

  /**
   * Unregister a hook by ID
   */
  unregister(hookId: string): boolean {
    const beforeIndex = this.beforeHooks.findIndex(h => h.id === hookId);
    if (beforeIndex !== -1) {
      const removed = this.beforeHooks.splice(beforeIndex, 1)[0];
      logger.debug(`[ToolHooks] Unregistered before hook: ${removed.name}`);
      return true;
    }

    const afterIndex = this.afterHooks.findIndex(h => h.id === hookId);
    if (afterIndex !== -1) {
      const removed = this.afterHooks.splice(afterIndex, 1)[0];
      logger.debug(`[ToolHooks] Unregistered after hook: ${removed.name}`);
      return true;
    }

    return false;
  }

  /**
   * Execute before hooks
   *
   * @param ctx - Tool call context
   * @returns Combined result from all hooks
   */
  async executeBefore(ctx: ToolCallContext): Promise<BeforeToolCallResult> {
    let currentArgs = ctx.args;

    for (const registered of this.beforeHooks) {
      try {
        const result = await registered.hook({ ...ctx, args: currentArgs });

        // If any hook blocks, stop immediately
        if (!result.proceed) {
          logger.debug(
            `[ToolHooks] Call blocked by ${registered.name}: ${result.blockReason || 'no reason'}`
          );
          return result;
        }

        // If hook provides override result, return it
        if (result.overrideResult !== undefined) {
          logger.debug(`[ToolHooks] Call overridden by ${registered.name}`);
          return {
            proceed: false,
            overrideResult: result.overrideResult,
          };
        }

        // Apply modified args
        if (result.modifiedArgs) {
          currentArgs = result.modifiedArgs;
        }
      } catch (error) {
        logger.error(`[ToolHooks] Before hook ${registered.name} failed:`, error);
        // Continue with other hooks on error
      }
    }

    return { proceed: true, modifiedArgs: currentArgs };
  }

  /**
   * Execute after hooks
   *
   * @param ctx - After tool call context
   * @returns Combined result modifications
   */
  async executeAfter(ctx: AfterToolCallContext): Promise<AfterToolCallResult> {
    let currentResult = ctx.result;
    let combinedMetadata: Record<string, any> = {};

    for (const registered of this.afterHooks) {
      try {
        const hookResult = await registered.hook({ ...ctx, result: currentResult });

        if (hookResult) {
          // Apply modified result
          if (hookResult.modifiedResult !== undefined) {
            currentResult = hookResult.modifiedResult;
          }

          // Merge metadata
          if (hookResult.metadata) {
            combinedMetadata = { ...combinedMetadata, ...hookResult.metadata };
          }
        }
      } catch (error) {
        logger.error(`[ToolHooks] After hook ${registered.name} failed:`, error);
        // Continue with other hooks on error
      }
    }

    return {
      modifiedResult: currentResult !== ctx.result ? currentResult : undefined,
      metadata: Object.keys(combinedMetadata).length > 0 ? combinedMetadata : undefined,
    };
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.beforeHooks = [];
    this.afterHooks = [];
    logger.debug('[ToolHooks] All hooks cleared');
  }

  /**
   * Get hook counts
   */
  getHookCounts(): { before: number; after: number } {
    return {
      before: this.beforeHooks.length,
      after: this.afterHooks.length,
    };
  }
}

/**
 * Wrap a tool with hooks
 *
 * @param tool - Tool to wrap
 * @param hooksManager - Hooks manager instance
 * @param contextProvider - Function to provide additional context
 * @returns Wrapped tool
 */
export function wrapToolWithHooks(
  tool: Tool,
  hooksManager: ToolHooksManager,
  contextProvider?: () => Partial<ToolCallContext>
): Tool {
  const originalExecute = tool.execute.bind(tool);

  const wrappedExecute = async (
    params: Record<string, any>,
    options?: any
  ): Promise<ToolResult> => {
    const startTime = Date.now();
    const additionalCtx = contextProvider?.() || {};

    const ctx: ToolCallContext = {
      callId: `call_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      toolName: tool.name,
      args: params,
      sessionId: options?.sessionId || 'unknown',
      runId: options?.runId,
      timestamp: startTime,
      ...additionalCtx,
    };

    // Execute before hooks
    const beforeResult = await hooksManager.executeBefore(ctx);

    // If blocked, return appropriate result
    if (!beforeResult.proceed) {
      if (beforeResult.overrideResult !== undefined) {
        return {
          success: true,
          output: beforeResult.overrideResult,
        };
      }

      return {
        success: false,
        output: beforeResult.blockReason || 'Tool call blocked by hook',
        error: {
          code: 'BLOCKED_BY_HOOK',
          message: beforeResult.blockReason || 'Tool call blocked by hook',
        },
      };
    }

    // Execute tool with possibly modified args
    const effectiveArgs = beforeResult.modifiedArgs || params;
    let result: ToolResult;
    let isError = false;

    try {
      result = await originalExecute(effectiveArgs, options);
      isError = !result.success;
    } catch (error) {
      isError = true;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result = {
        success: false,
        output: errorMessage,
        error: {
          code: 'EXECUTION_ERROR',
          message: errorMessage,
        },
      };
    }

    const duration = Date.now() - startTime;

    // Execute after hooks
    const afterCtx: AfterToolCallContext = {
      ...ctx,
      args: effectiveArgs,
      result: result.output,
      isError,
      duration,
    };

    const afterResult = await hooksManager.executeAfter(afterCtx);

    // Apply modifications from after hooks
    if (afterResult.modifiedResult !== undefined) {
      result.output = afterResult.modifiedResult;
    }
    if (afterResult.metadata) {
      result.metadata = { ...result.metadata, ...afterResult.metadata };
    }

    return result;
  };

  return {
    ...tool,
    execute: wrappedExecute,
  };
}

// Global singleton instance
let _globalHooksManager: ToolHooksManager | null = null;

/**
 * Get or create global hooks manager
 */
export function getToolHooksManager(): ToolHooksManager {
  if (!_globalHooksManager) {
    _globalHooksManager = new ToolHooksManager();
  }
  return _globalHooksManager;
}

/**
 * Create a new hooks manager instance
 */
export function createToolHooksManager(): ToolHooksManager {
  return new ToolHooksManager();
}
