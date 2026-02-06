/**
 * Tool System Types and Interfaces
 *
 * Defines the core types for the Anode ClawdBot tool system
 */

import { z } from 'zod';

/**
 * Tool parameter definition using Zod schema
 */
export interface ToolParameter {
  name: string;
  description: string;
  schema: z.ZodType<any>;
  required: boolean;
  default?: any;
}

/**
 * Tool execution context
 * Contains information about the execution environment
 */
export interface ToolContext {
  sessionId: string;
  userId?: string;
  permissions?: string[];
  workingDirectory?: string;
  [key: string]: any;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  output?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    duration?: number;
    toolName?: string;
    timestamp?: number;
    [key: string]: any;
  };
}

/**
 * Tool execution options
 */
export interface ToolExecutionOptions {
  timeout?: number;
  retries?: number;
  context?: ToolContext;
  [key: string]: any;
}

/**
 * Tool definition
 */
export interface Tool {
  /** Unique tool name (used by AI to call the tool) */
  name: string;

  /** Human-readable description for AI */
  description: string;

  /** Tool parameters */
  parameters: ToolParameter[];

  /** Required permissions */
  permissions?: string[];

  /** Tool category */
  category?: 'file' | 'android' | 'network' | 'device' | 'ui' | 'system' | 'custom' | 'app' | 'media' | 'image' | 'storage' | 'notification';

  /** Whether tool can be run in parallel */
  parallelizable?: boolean;

  /** Execute the tool */
  execute(params: Record<string, any>, options?: ToolExecutionOptions): Promise<ToolResult>;

  /** Validate parameters before execution */
  validate?(params: Record<string, any>): Promise<boolean>;

  /** Optional cleanup after execution */
  cleanup?(): Promise<void>;
}

/**
 * Tool registration info
 */
export interface ToolRegistration {
  tool: Tool;
  enabled: boolean;
  registeredAt: number;
  source: 'builtin' | 'plugin';
}

/**
 * Tool call from AI (matches Anthropic format)
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Tool call result for AI
 */
export interface ToolCallResult {
  toolCallId: string;
  output: any;
  isError: boolean;
}

/**
 * Convert Tool to Anthropic tool format
 */
export function toolToAnthropicFormat(tool: Tool): any {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map((param) => [
          param.name,
          {
            type: getZodType(param.schema),
            description: param.description,
          },
        ])
      ),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    },
  };
}

/**
 * Get JSON schema type from Zod schema
 */
function getZodType(schema: z.ZodType<any>): string {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return 'array';
  if (schema instanceof z.ZodObject) return 'object';
  return 'string';
}
