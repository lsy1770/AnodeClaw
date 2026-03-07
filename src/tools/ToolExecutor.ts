/**
 * Tool Executor
 *
 * Handles tool execution with:
 * - Parameter validation
 * - Timeout protection
 * - Error handling
 * - Permission checks
 * - Execution logging
 */

import type {
  Tool,
  ToolCall,
  ToolResult,
  ToolExecutionOptions,
  ToolContext,
} from './types.js';
import { ToolRegistry } from './ToolRegistry.js';
import { logger } from '../utils/logger.js';
import { SecurityUtils } from '../utils/security.js';

// Timer API global (for proper setTimeout in Anode environment)
declare const timer: {
  setTimeout(callback: string, delay: number): Promise<string>;
  clearTimeout(taskId: string): Promise<boolean>;
};

/**
 * Tool execution error
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public code: string,
    public toolName: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

/**
 * Tool Executor Class
 */
export class ToolExecutor {
  private registry: ToolRegistry;
  private defaultTimeout: number;
  private executionCount: number;

  constructor(registry: ToolRegistry, defaultTimeout: number = 10000) {  // 10s timeout for faster debugging
    this.registry = registry;
    this.defaultTimeout = defaultTimeout;
    this.executionCount = 0;
    logger.info('ToolExecutor initialized');
  }

  /**
   * Execute a tool call
   *
   * @param toolCall - Tool call from AI
   * @param options - Execution options
   * @returns Tool result
   */
  async execute(toolCall: ToolCall, options?: ToolExecutionOptions): Promise<ToolResult> {
    const startTime = Date.now();
    this.executionCount++;

    logger.info(`Executing tool: ${toolCall.name} (call ID: ${toolCall.id})`);
    logger.debug(`[ToolExecutor] Step 1: Starting execution`);

    try {
      // Get tool from registry
      logger.debug(`[ToolExecutor] Step 2: Getting tool from registry`);
      const tool = this.registry.get(toolCall.name);
      if (!tool) {
        throw new ToolExecutionError(
          `Tool not found: ${toolCall.name}`,
          'TOOL_NOT_FOUND',
          toolCall.name
        );
      }

      // Check permissions
      logger.debug(`[ToolExecutor] Step 3: Checking permissions`);
      if (tool.permissions && options?.context?.permissions) {
        this.checkPermissions(tool, options.context);
      }

      // Validate parameters
      logger.debug(`[ToolExecutor] Step 4: Validating parameters`);
      await this.validateParameters(tool, toolCall.input);

      // Security checks: path validation and input sanitization
      logger.debug(`[ToolExecutor] Step 5: Security checks`);
      this.performSecurityChecks(tool, toolCall.input);

      // Execute tool directly (Promise.race causes issues in Anode environment)
      logger.debug(`[ToolExecutor] Step 6: Calling tool.execute()`);
      const result = await tool.execute(toolCall.input, options);
      logger.debug(`[ToolExecutor] Step 7: tool.execute() returned`);

      // Add metadata
      const duration = Date.now() - startTime;
      result.metadata = {
        ...result.metadata,
        duration,
        toolName: tool.name,
        timestamp: Date.now(),
      };

      if (result.success) {
        logger.info(`Tool executed successfully: ${toolCall.name} (${duration}ms)`);
      } else {
        logger.warn(`Tool returned failure: ${toolCall.name} (${duration}ms) — ${result.error?.message ?? 'no message'}`);
      }

      // Debug: Log result for troubleshooting
      let outputPreview: string;
      if (result.output !== undefined && result.output !== null) {
        outputPreview = typeof result.output === 'string' ? result.output.slice(0, 200) : JSON.stringify(result.output).slice(0, 200);
      } else if (!result.success && result.error) {
        outputPreview = `[error] ${result.error.code}: ${result.error.message}`;
      } else {
        outputPreview = '(no output)';
      }
      logger.debug(`Tool result: ${outputPreview}${outputPreview.length >= 200 ? '...' : ''}`);

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Tool execution failed: ${toolCall.name}`, error);

      return this.createErrorResult(error, toolCall.name, duration);
    }
  }

  /**
   * Execute multiple tool calls in parallel
   *
   * @param toolCalls - Array of tool calls
   * @param options - Execution options
   * @returns Array of tool results
   */
  async executeMany(
    toolCalls: ToolCall[],
    options?: ToolExecutionOptions
  ): Promise<ToolResult[]> {
    logger.info(`Executing ${toolCalls.length} tools in parallel`);

    const results = await Promise.all(
      toolCalls.map((toolCall) => this.execute(toolCall, options))
    );

    return results;
  }

  /**
   * Validate tool parameters
   */
  private async validateParameters(tool: Tool, params: Record<string, any>): Promise<void> {
    // Check required parameters
    for (const param of tool.parameters) {
      if (param.required && !(param.name in params)) {
        throw new ToolExecutionError(
          `Missing required parameter: ${param.name}`,
          'MISSING_PARAMETER',
          tool.name,
          { parameter: param.name }
        );
      }
    }

    // Validate with Zod schemas
    for (const param of tool.parameters) {
      if (param.name in params) {
        try {
          param.schema.parse(params[param.name]);
        } catch (error) {
          throw new ToolExecutionError(
            `Invalid parameter: ${param.name}`,
            'INVALID_PARAMETER',
            tool.name,
            { parameter: param.name, error }
          );
        }
      }
    }

    // Custom validation if provided
    if (tool.validate) {
      const valid = await tool.validate(params);
      if (!valid) {
        throw new ToolExecutionError(
          'Parameter validation failed',
          'VALIDATION_FAILED',
          tool.name
        );
      }
    }
  }

  /**
   * Check if context has required permissions
   */
  private checkPermissions(tool: Tool, context: ToolContext): void {
    if (!tool.permissions || tool.permissions.length === 0) {
      return;
    }

    const userPermissions = context.permissions || [];

    for (const required of tool.permissions) {
      if (!userPermissions.includes(required)) {
        throw new ToolExecutionError(
          `Missing permission: ${required}`,
          'PERMISSION_DENIED',
          tool.name,
          { required, available: userPermissions }
        );
      }
    }
  }

  /**
   * Execute tool with timeout protection using Promise.race
   *
   * Uses Promise.race + setTimeout for clean timeout handling
   */
  private async executeWithTimeout(
    tool: Tool,
    params: Record<string, any>,
    timeout: number,
    options?: ToolExecutionOptions
  ): Promise<ToolResult> {
    logger.debug(`[executeWithTimeout] Starting: ${tool.name}, timeout: ${timeout}ms`);

    // Create timeout promise
    const timeoutPromise = new Promise<ToolResult>((_, reject) => {
      setTimeout(() => {
        logger.warn(`[executeWithTimeout] TIMEOUT triggered for ${tool.name} after ${timeout}ms`);
        reject(
          new ToolExecutionError(
            `Tool execution timeout after ${timeout}ms`,
            'TIMEOUT',
            tool.name
          )
        );
      }, timeout);
    });

    logger.debug(`[executeWithTimeout] Starting Promise.race for ${tool.name}`);

    // Race between tool execution and timeout
    const result = await Promise.race([
      tool.execute(params, options),
      timeoutPromise
    ]);

    logger.debug(`[executeWithTimeout] Promise.race resolved for ${tool.name}`);
    return result;
  }

  /**
   * Create error result
   */
  private createErrorResult(error: any, toolName: string, duration: number): ToolResult {
    if (error instanceof ToolExecutionError) {
      return {
        success: false,
        error: {
          code: error.code,
          message: error.message,
          details: error.details,
        },
        metadata: {
          duration,
          toolName,
          timestamp: Date.now(),
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : 'An unknown error occurred',
        details: error,
      },
      metadata: {
        duration,
        toolName,
        timestamp: Date.now(),
      },
    };
  }

  /**
   * Perform security checks on tool parameters
   */
  private performSecurityChecks(tool: Tool, params: Record<string, any>): void {
    // File-related tools: validate paths
    const pathParams = ['path', 'filePath', 'file_path', 'source', 'destination', 'dir', 'directory'];
    for (const paramName of pathParams) {
      if (typeof params[paramName] === 'string') {
        const validation = SecurityUtils.validatePath(params[paramName]);
        if (!validation.valid) {
          throw new ToolExecutionError(
            `Security check failed for parameter '${paramName}': ${validation.error}`,
            'SECURITY_PATH_VALIDATION',
            tool.name,
            { parameter: paramName, path: params[paramName] }
          );
        }
        // Use the normalized path
        if (validation.normalized) {
          params[paramName] = validation.normalized;
        }
      }
    }

    // Sanitize string inputs that could contain injection
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && !pathParams.includes(key)) {
        if (SecurityUtils.containsCodeInjection(value)) {
          logger.warn(`[Security] Potential code injection detected in parameter '${key}' of tool '${tool.name}'`);
        }
      }
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    executionCount: number;
  } {
    return {
      executionCount: this.executionCount,
    };
  }
}
