/**
 * Tool System Types and Interfaces
 *
 * Defines the core types for the Anode ClawdBot tool system
 */
import { z } from 'zod';
/**
 * Convert Tool to Anthropic tool format
 */
export function toolToAnthropicFormat(tool) {
    return {
        name: tool.name,
        description: tool.description,
        input_schema: {
            type: 'object',
            properties: Object.fromEntries(tool.parameters.map((param) => [
                param.name,
                {
                    ...zodToJsonSchema(param.schema),
                    description: param.description,
                },
            ])),
            required: tool.parameters.filter((p) => p.required).map((p) => p.name),
        },
    };
}
/**
 * Convert a Zod schema into a JSON schema fragment compatible with tool calling.
 */
function zodToJsonSchema(schema) {
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
            items: schema.items.map((item) => zodToJsonSchema(item)),
            minItems: schema.items.length,
            maxItems: schema.items.length,
        };
    }
    if (schema instanceof z.ZodObject) {
        const shape = schema.shape;
        const entries = Object.entries(shape);
        return {
            type: 'object',
            properties: Object.fromEntries(entries.map(([key, value]) => [key, zodToJsonSchema(value)])),
            required: entries
                .filter(([, value]) => !(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault))
                .map(([key]) => key),
        };
    }
    if (schema instanceof z.ZodRecord) {
        const valueType = schema._def.valueType || z.any();
        return {
            type: 'object',
            additionalProperties: zodToJsonSchema(valueType),
        };
    }
    if (schema instanceof z.ZodUnion) {
        return {
            anyOf: schema._def.options.map((option) => zodToJsonSchema(option)),
        };
    }
    if (schema instanceof z.ZodAny || schema instanceof z.ZodUnknown) {
        return {};
    }
    return { type: 'string' };
}
