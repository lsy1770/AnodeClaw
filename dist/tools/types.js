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
                    type: getZodType(param.schema),
                    description: param.description,
                },
            ])),
            required: tool.parameters.filter((p) => p.required).map((p) => p.name),
        },
    };
}
/**
 * Get JSON schema type from Zod schema
 */
function getZodType(schema) {
    if (schema instanceof z.ZodString)
        return 'string';
    if (schema instanceof z.ZodNumber)
        return 'number';
    if (schema instanceof z.ZodBoolean)
        return 'boolean';
    if (schema instanceof z.ZodArray)
        return 'array';
    if (schema instanceof z.ZodObject)
        return 'object';
    return 'string';
}
