/**
 * Code Execution Tools
 *
 * Tools for dynamic JavaScript code execution
 * Based on runtime.js from anode_clawd project
 *
 * Security Note: These tools execute arbitrary code. Use with caution.
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';

/**
 * Code Execution Tool (Synchronous)
 *
 * Execute arbitrary JavaScript code synchronously
 */
export const codeExecTool: Tool = {
  name: 'code_exec',
  description: 'Execute JavaScript code synchronously. Returns the result of the last expression or return statement. Use for simple calculations, data transformations, or quick operations.',
  category: 'utility',
  permissions: ['code:execute'],
  parallelizable: true,

  parameters: [
    {
      name: 'code',
      description: 'JavaScript code to execute. Can use return statement to return a value.',
      schema: z.string().min(1),
      required: true,
    },
    {
      name: 'context',
      description: 'Optional context variables to inject (as JSON object). These will be available as variables in the code.',
      schema: z.record(z.any()),
      required: false,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { code, context = {} } = params;

      logger.debug(`[code_exec] Executing code (${code.length} chars)`);

      // Inject context variables
      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);

      // Use Function constructor (safer than direct eval)
      const fn = new Function(...contextKeys, `
        "use strict";
        return (function() {
          ${code}
        })();
      `);

      const result = fn(...contextValues);

      logger.debug(`[code_exec] Execution successful`);

      return {
        success: true,
        output: {
          result,
          type: typeof result,
        },
      };
    } catch (error) {
      logger.error(`[code_exec] Execution failed:`, error);
      return {
        success: false,
        error: {
          code: 'EXEC_FAILED',
          message: error instanceof Error ? error.message : 'Code execution failed',
          details: {
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      };
    }
  },
};

/**
 * Code Execution Tool (Asynchronous)
 *
 * Execute JavaScript code with async/await support
 */
export const codeExecAsyncTool: Tool = {
  name: 'code_exec_async',
  description: 'Execute JavaScript code asynchronously with await support. Use for operations that involve promises, API calls, file I/O, or any async operations.',
  category: 'utility',
  permissions: ['code:execute'],
  parallelizable: true,

  parameters: [
    {
      name: 'code',
      description: 'JavaScript code to execute. Can use await and async operations.',
      schema: z.string().min(1),
      required: true,
    },
    {
      name: 'context',
      description: 'Optional context variables to inject (as JSON object)',
      schema: z.record(z.any()),
      required: false,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { code, context = {} } = params;

      logger.debug(`[code_exec_async] Executing async code (${code.length} chars)`);

      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);

      // Create async function
      const fn = new Function(...contextKeys, `
        "use strict";
        return (async function() {
          ${code}
        })();
      `);

      const result = await fn(...contextValues);

      logger.debug(`[code_exec_async] Execution successful`);

      return {
        success: true,
        output: {
          result,
          type: typeof result,
        },
      };
    } catch (error) {
      logger.error(`[code_exec_async] Execution failed:`, error);
      return {
        success: false,
        error: {
          code: 'EXEC_ASYNC_FAILED',
          message: error instanceof Error ? error.message : 'Async code execution failed',
          details: {
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      };
    }
  },
};

/**
 * Safe Code Execution Tool (with timeout)
 *
 * Execute code with timeout protection
 */
export const codeExecSafeTool: Tool = {
  name: 'code_exec_safe',
  description: 'Execute JavaScript code with timeout protection. Use when executing untrusted or potentially long-running code. Automatically terminates if execution exceeds timeout.',
  category: 'utility',
  permissions: ['code:execute'],
  parallelizable: true,

  parameters: [
    {
      name: 'code',
      description: 'JavaScript code to execute',
      schema: z.string().min(1),
      required: true,
    },
    {
      name: 'context',
      description: 'Optional context variables to inject',
      schema: z.record(z.any()),
      required: false,
    },
    {
      name: 'timeout',
      description: 'Timeout in milliseconds (default: 5000ms). Execution will be terminated if it exceeds this time.',
      schema: z.number().int().min(100).max(60000),
      required: false,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { code, context = {}, timeout = 5000 } = params;

      logger.debug(`[code_exec_safe] Executing code with ${timeout}ms timeout`);

      const contextKeys = Object.keys(context);
      const contextValues = Object.values(context);

      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(`Code execution timeout after ${timeout}ms`)), timeout);
      });

      // Create execution promise
      const execPromise = new Promise((resolve, reject) => {
        try {
          const fn = new Function(...contextKeys, `
            "use strict";
            return (async function() {
              ${code}
            })();
          `);

          resolve(fn(...contextValues));
        } catch (error) {
          reject(error);
        }
      });

      // Race between execution and timeout
      const result = await Promise.race([execPromise, timeoutPromise]);

      logger.debug(`[code_exec_safe] Execution successful`);

      return {
        success: true,
        output: {
          result,
          type: typeof result,
          executedWithinTimeout: true,
        },
      };
    } catch (error) {
      logger.error(`[code_exec_safe] Execution failed:`, error);

      const isTimeout = error instanceof Error && error.message.includes('timeout');

      return {
        success: false,
        error: {
          code: isTimeout ? 'EXEC_TIMEOUT' : 'EXEC_SAFE_FAILED',
          message: error instanceof Error ? error.message : 'Safe code execution failed',
          details: {
            stack: error instanceof Error ? error.stack : undefined,
            timeout: isTimeout,
          },
        },
      };
    }
  },
};

/**
 * Code Execution with Logs Capture
 *
 * Execute code and capture console output
 */
export const codeExecWithLogsTool: Tool = {
  name: 'code_exec_with_logs',
  description: 'Execute JavaScript code and capture all console output (log, info, warn, error). Useful for debugging or when you need to see intermediate outputs.',
  category: 'utility',
  permissions: ['code:execute'],
  parallelizable: true,

  parameters: [
    {
      name: 'code',
      description: 'JavaScript code to execute',
      schema: z.string().min(1),
      required: true,
    },
    {
      name: 'context',
      description: 'Optional context variables to inject',
      schema: z.record(z.any()),
      required: false,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { code, context = {} } = params;

      logger.debug(`[code_exec_with_logs] Executing code with log capture`);

      const logs: Array<{ level: string; args: any[] }> = [];
      const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
      };

      // Temporarily replace console methods
      console.log = (...args: any[]) => logs.push({ level: 'log', args });
      console.info = (...args: any[]) => logs.push({ level: 'info', args });
      console.warn = (...args: any[]) => logs.push({ level: 'warn', args });
      console.error = (...args: any[]) => logs.push({ level: 'error', args });

      try {
        const contextKeys = Object.keys(context);
        const contextValues = Object.values(context);

        const fn = new Function(...contextKeys, `
          "use strict";
          return (function() {
            ${code}
          })();
        `);

        const result = fn(...contextValues);

        return {
          success: true,
          output: {
            result,
            type: typeof result,
            logs,
            logCount: logs.length,
          },
        };
      } finally {
        // Restore original console
        Object.assign(console, originalConsole);
      }
    } catch (error) {
      logger.error(`[code_exec_with_logs] Execution failed:`, error);
      return {
        success: false,
        error: {
          code: 'EXEC_WITH_LOGS_FAILED',
          message: error instanceof Error ? error.message : 'Code execution with logs failed',
          details: {
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      };
    }
  },
};

/**
 * Export all code execution tools
 */
export const codeExecutionTools: Tool[] = [
  codeExecTool,
  codeExecAsyncTool,
  codeExecSafeTool,
  codeExecWithLogsTool,
];
