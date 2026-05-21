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
  attachments?: Array<{
    type: 'image' | 'video' | 'audio' | 'file';
    localPath: string;
    filename?: string;
    mimeType?: string;
  }>;
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
  category?: 'file' | 'android' | 'network' | 'device' | 'ui' | 'system' | 'custom' | 'app' | 'media' | 'image' | 'storage' | 'notification' | 'ocr' | 'utility';

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
            ...zodToJsonSchema(param.schema),
            description: param.description,
          },
        ])
      ),
      required: tool.parameters.filter((p) => p.required).map((p) => p.name),
    },
  };
}

/**
 * Convert a Zod schema into a JSON schema fragment compatible with tool calling.
 */
function zodToJsonSchema(schema: z.ZodType<any>): Record<string, any> {
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodNullable) {
    return zodToJsonSchema(schema._def.innerType);
  }

  if (schema instanceof z.ZodEffects) {
    return zodToJsonSchema(schema._def.schema);
  }

  if (schema instanceof z.ZodString) {
    return { type: 'string' };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: 'number' };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: 'boolean' };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options };
  }

  if (schema instanceof z.ZodNativeEnum) {
    const values = Object.values(schema.enum).filter((value) => typeof value === 'string' || typeof value === 'number');
    const valueType = values.every((value) => typeof value === 'number') ? 'number' : 'string';
    return { type: valueType, enum: values };
  }

  if (schema instanceof z.ZodLiteral) {
    const value = schema._def.value;
    return {
      type: typeof value === 'number' ? 'number' : typeof value === 'boolean' ? 'boolean' : 'string',
      enum: [value],
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema._def.type),
    };
  }

  if (schema instanceof z.ZodTuple) {
    return {
      type: 'array',
      items: schema.items.map((item: z.ZodType<any>) => zodToJsonSchema(item)),
      minItems: schema.items.length,
      maxItems: schema.items.length,
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const entries = Object.entries(shape);

    return {
      type: 'object',
      properties: Object.fromEntries(
        entries.map(([key, value]) => [key, zodToJsonSchema(value as z.ZodType<any>)])
      ),
      required: entries
        .filter(([, value]) => !(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault))
        .map(([key]) => key),
    };
  }

  if (schema instanceof z.ZodRecord) {
    const valueType = (schema._def as any).valueType || z.any();
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(valueType),
    };
  }

  if (schema instanceof z.ZodUnion) {
    return {
      anyOf: schema._def.options.map((option: z.ZodType<any>) => zodToJsonSchema(option)),
    };
  }

  if (schema instanceof z.ZodAny || schema instanceof z.ZodUnknown) {
    return {};
  }

  return { type: 'string' };
}
