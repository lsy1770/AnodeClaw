/**
 * Utility Tools
 *
 * Basic utility tools for time, string, math, logic operations
 * Essential for agent automation workflows
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
// ========== TIME/DATE TOOLS ==========
/**
 * Get Current Time Tool
 */
export const getCurrentTimeTool = {
    name: 'get_current_time',
    description: 'Get the current date and time in various formats (ISO, timestamp, formatted string, etc.)',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'format',
            description: 'Output format: iso (ISO 8601), timestamp (Unix milliseconds), datetime (readable), date (date only), time (time only), custom (custom format string)',
            schema: z.enum(['iso', 'timestamp', 'datetime', 'date', 'time', 'custom']),
            required: false,
            default: 'iso',
        },
        {
            name: 'customFormat',
            description: 'Custom format string (e.g., "YYYY-MM-DD HH:mm:ss"). Only used when format is "custom".',
            schema: z.string(),
            required: false,
        },
        {
            name: 'timezone',
            description: 'Timezone offset in hours (e.g., +8 for Beijing). Default: local timezone',
            schema: z.number().min(-12).max(14),
            required: false,
        },
    ],
    async execute(params) {
        try {
            const { format = 'iso', customFormat, timezone } = params;
            const now = new Date();
            // Apply timezone if specified
            if (timezone !== undefined) {
                const localOffset = now.getTimezoneOffset() / 60;
                const targetOffset = timezone - localOffset;
                now.setHours(now.getHours() + targetOffset);
            }
            let output;
            switch (format) {
                case 'iso':
                    output = now.toISOString();
                    break;
                case 'timestamp':
                    output = now.getTime().toString();
                    break;
                case 'datetime':
                    output = now.toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false
                    });
                    break;
                case 'date':
                    output = now.toLocaleDateString('zh-CN');
                    break;
                case 'time':
                    output = now.toLocaleTimeString('zh-CN', { hour12: false });
                    break;
                case 'custom':
                    if (!customFormat) {
                        return {
                            success: false,
                            error: {
                                code: 'INVALID_PARAMS',
                                message: 'customFormat is required when format is "custom"',
                            },
                        };
                    }
                    // Simple format replacement
                    output = customFormat
                        .replace('YYYY', now.getFullYear().toString())
                        .replace('MM', (now.getMonth() + 1).toString().padStart(2, '0'))
                        .replace('DD', now.getDate().toString().padStart(2, '0'))
                        .replace('HH', now.getHours().toString().padStart(2, '0'))
                        .replace('mm', now.getMinutes().toString().padStart(2, '0'))
                        .replace('ss', now.getSeconds().toString().padStart(2, '0'));
                    break;
                default:
                    output = now.toISOString();
            }
            return {
                success: true,
                output: {
                    time: output,
                    timestamp: now.getTime(),
                    iso: now.toISOString(),
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_TIME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get current time',
                    details: error,
                },
            };
        }
    },
};
/**
 * Sleep/Wait Tool
 */
export const sleepTool = {
    name: 'sleep',
    description: 'Wait/sleep for a specified duration in milliseconds. Useful for adding delays between operations.',
    category: 'utility',
    permissions: [],
    parallelizable: false,
    parameters: [
        {
            name: 'duration',
            description: 'Sleep duration in milliseconds (max: 60000ms = 1 minute)',
            schema: z.number().int().min(0).max(60000),
            required: true,
        },
    ],
    async execute(params) {
        try {
            const { duration } = params;
            logger.debug(`Sleeping for ${duration}ms`);
            await new Promise(resolve => setTimeout(resolve, duration));
            return {
                success: true,
                output: {
                    slept: duration,
                    message: `Slept for ${duration}ms`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SLEEP_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to sleep',
                    details: error,
                },
            };
        }
    },
};
/**
 * Calculate Time Tool
 */
export const calculateTimeTool = {
    name: 'calculate_time',
    description: 'Calculate time by adding or subtracting days/hours/minutes from a base time',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'baseTime',
            description: 'Base time (ISO string or timestamp). Default: current time',
            schema: z.union([z.string(), z.number()]),
            required: false,
        },
        {
            name: 'days',
            description: 'Days to add (negative to subtract)',
            schema: z.number(),
            required: false,
            default: 0,
        },
        {
            name: 'hours',
            description: 'Hours to add (negative to subtract)',
            schema: z.number(),
            required: false,
            default: 0,
        },
        {
            name: 'minutes',
            description: 'Minutes to add (negative to subtract)',
            schema: z.number(),
            required: false,
            default: 0,
        },
        {
            name: 'seconds',
            description: 'Seconds to add (negative to subtract)',
            schema: z.number(),
            required: false,
            default: 0,
        },
    ],
    async execute(params) {
        try {
            const { baseTime, days = 0, hours = 0, minutes = 0, seconds = 0 } = params;
            let base;
            if (baseTime === undefined) {
                base = new Date();
            }
            else if (typeof baseTime === 'number') {
                base = new Date(baseTime);
            }
            else {
                base = new Date(baseTime);
            }
            if (isNaN(base.getTime())) {
                return {
                    success: false,
                    error: {
                        code: 'INVALID_TIME',
                        message: 'Invalid base time format',
                    },
                };
            }
            // Calculate new time
            const result = new Date(base.getTime());
            result.setDate(result.getDate() + days);
            result.setHours(result.getHours() + hours);
            result.setMinutes(result.getMinutes() + minutes);
            result.setSeconds(result.getSeconds() + seconds);
            return {
                success: true,
                output: {
                    original: base.toISOString(),
                    result: result.toISOString(),
                    timestamp: result.getTime(),
                    diff: {
                        days,
                        hours,
                        minutes,
                        seconds,
                        totalMs: result.getTime() - base.getTime(),
                    },
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CALCULATE_TIME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to calculate time',
                    details: error,
                },
            };
        }
    },
};
// ========== STRING TOOLS ==========
/**
 * String Manipulation Tool
 */
export const stringManipulateTool = {
    name: 'string_manipulate',
    description: 'Perform string operations: trim, uppercase, lowercase, replace, substring, split, join',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'input',
            description: 'Input string',
            schema: z.string(),
            required: true,
        },
        {
            name: 'operation',
            description: 'Operation to perform',
            schema: z.enum(['trim', 'uppercase', 'lowercase', 'replace', 'substring', 'split', 'length', 'reverse']),
            required: true,
        },
        {
            name: 'find',
            description: 'String to find (for replace operation)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'replaceWith',
            description: 'String to replace with (for replace operation)',
            schema: z.string(),
            required: false,
        },
        {
            name: 'start',
            description: 'Start index (for substring operation)',
            schema: z.number().int().min(0),
            required: false,
        },
        {
            name: 'end',
            description: 'End index (for substring operation)',
            schema: z.number().int(),
            required: false,
        },
        {
            name: 'separator',
            description: 'Separator (for split operation)',
            schema: z.string(),
            required: false,
        },
    ],
    async execute(params) {
        try {
            const { input, operation, find, replaceWith, start, end, separator } = params;
            let result;
            switch (operation) {
                case 'trim':
                    result = input.trim();
                    break;
                case 'uppercase':
                    result = input.toUpperCase();
                    break;
                case 'lowercase':
                    result = input.toLowerCase();
                    break;
                case 'replace':
                    if (find === undefined) {
                        return {
                            success: false,
                            error: { code: 'INVALID_PARAMS', message: 'find parameter is required for replace operation' },
                        };
                    }
                    result = input.replace(new RegExp(find, 'g'), replaceWith || '');
                    break;
                case 'substring':
                    if (start === undefined) {
                        return {
                            success: false,
                            error: { code: 'INVALID_PARAMS', message: 'start parameter is required for substring operation' },
                        };
                    }
                    result = input.substring(start, end);
                    break;
                case 'split':
                    result = input.split(separator || '');
                    break;
                case 'length':
                    result = input.length;
                    break;
                case 'reverse':
                    result = input.split('').reverse().join('');
                    break;
                default:
                    return {
                        success: false,
                        error: { code: 'INVALID_OPERATION', message: `Unknown operation: ${operation}` },
                    };
            }
            return {
                success: true,
                output: {
                    operation,
                    input,
                    result,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STRING_MANIPULATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to manipulate string',
                    details: error,
                },
            };
        }
    },
};
/**
 * Regex Match Tool
 */
export const regexMatchTool = {
    name: 'regex_match',
    description: 'Match a string against a regular expression pattern',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'input',
            description: 'Input string to match',
            schema: z.string(),
            required: true,
        },
        {
            name: 'pattern',
            description: 'Regular expression pattern',
            schema: z.string(),
            required: true,
        },
        {
            name: 'flags',
            description: 'Regex flags (g=global, i=case-insensitive, m=multiline)',
            schema: z.string(),
            required: false,
            default: '',
        },
    ],
    async execute(params) {
        try {
            const { input, pattern, flags = '' } = params;
            const regex = new RegExp(pattern, flags);
            const matches = input.match(regex);
            return {
                success: true,
                output: {
                    matched: matches !== null,
                    matches: matches || [],
                    count: matches ? matches.length : 0,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'REGEX_MATCH_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to match regex',
                    details: error,
                },
            };
        }
    },
};
// ========== MATH TOOLS ==========
/**
 * Calculate Tool
 */
export const calculateTool = {
    name: 'calculate',
    description: 'Perform mathematical calculations: add, subtract, multiply, divide, modulo, power, etc.',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'operation',
            description: 'Math operation to perform',
            schema: z.enum(['add', 'subtract', 'multiply', 'divide', 'modulo', 'power', 'sqrt', 'abs', 'round', 'floor', 'ceil', 'min', 'max']),
            required: true,
        },
        {
            name: 'a',
            description: 'First number (or the only number for unary operations)',
            schema: z.number(),
            required: true,
        },
        {
            name: 'b',
            description: 'Second number (for binary operations)',
            schema: z.number(),
            required: false,
        },
        {
            name: 'numbers',
            description: 'Array of numbers (for min/max operations)',
            schema: z.array(z.number()),
            required: false,
        },
    ],
    async execute(params) {
        try {
            const { operation, a, b, numbers } = params;
            let result;
            switch (operation) {
                case 'add':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for add' } };
                    }
                    result = a + b;
                    break;
                case 'subtract':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for subtract' } };
                    }
                    result = a - b;
                    break;
                case 'multiply':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for multiply' } };
                    }
                    result = a * b;
                    break;
                case 'divide':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for divide' } };
                    }
                    if (b === 0) {
                        return { success: false, error: { code: 'DIVISION_BY_ZERO', message: 'Cannot divide by zero' } };
                    }
                    result = a / b;
                    break;
                case 'modulo':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for modulo' } };
                    }
                    result = a % b;
                    break;
                case 'power':
                    if (b === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'b parameter required for power' } };
                    }
                    result = Math.pow(a, b);
                    break;
                case 'sqrt':
                    result = Math.sqrt(a);
                    break;
                case 'abs':
                    result = Math.abs(a);
                    break;
                case 'round':
                    result = Math.round(a);
                    break;
                case 'floor':
                    result = Math.floor(a);
                    break;
                case 'ceil':
                    result = Math.ceil(a);
                    break;
                case 'min':
                    if (!numbers || numbers.length === 0) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'numbers array required for min' } };
                    }
                    result = Math.min(...numbers);
                    break;
                case 'max':
                    if (!numbers || numbers.length === 0) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'numbers array required for max' } };
                    }
                    result = Math.max(...numbers);
                    break;
                default:
                    return {
                        success: false,
                        error: { code: 'INVALID_OPERATION', message: `Unknown operation: ${operation}` },
                    };
            }
            return {
                success: true,
                output: {
                    operation,
                    result,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CALCULATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to calculate',
                    details: error,
                },
            };
        }
    },
};
/**
 * Random Number Tool
 */
export const randomNumberTool = {
    name: 'random_number',
    description: 'Generate a random number within a specified range',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'min',
            description: 'Minimum value (inclusive)',
            schema: z.number(),
            required: false,
            default: 0,
        },
        {
            name: 'max',
            description: 'Maximum value (exclusive for float, inclusive for int)',
            schema: z.number(),
            required: false,
            default: 1,
        },
        {
            name: 'type',
            description: 'Type of random number: int (integer) or float (decimal)',
            schema: z.enum(['int', 'float']),
            required: false,
            default: 'int',
        },
    ],
    async execute(params) {
        try {
            const { min = 0, max = 1, type = 'int' } = params;
            let result;
            if (type === 'int') {
                result = Math.floor(Math.random() * (max - min + 1)) + min;
            }
            else {
                result = Math.random() * (max - min) + min;
            }
            return {
                success: true,
                output: {
                    result,
                    min,
                    max,
                    type,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'RANDOM_NUMBER_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to generate random number',
                    details: error,
                },
            };
        }
    },
};
// ========== LOGIC TOOLS ==========
/**
 * Conditional Tool
 */
export const conditionalTool = {
    name: 'conditional',
    description: 'Evaluate a condition and return true/false. Supports equals, not_equals, greater_than, less_than, contains, etc.',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'operation',
            description: 'Comparison operation',
            schema: z.enum(['equals', 'not_equals', 'greater_than', 'less_than', 'greater_or_equal', 'less_or_equal', 'contains', 'starts_with', 'ends_with', 'is_empty', 'is_null']),
            required: true,
        },
        {
            name: 'value1',
            description: 'First value',
            schema: z.any(),
            required: true,
        },
        {
            name: 'value2',
            description: 'Second value (not needed for is_empty, is_null)',
            schema: z.any(),
            required: false,
        },
    ],
    async execute(params) {
        try {
            const { operation, value1, value2 } = params;
            let result;
            switch (operation) {
                case 'equals':
                    result = value1 === value2;
                    break;
                case 'not_equals':
                    result = value1 !== value2;
                    break;
                case 'greater_than':
                    result = value1 > value2;
                    break;
                case 'less_than':
                    result = value1 < value2;
                    break;
                case 'greater_or_equal':
                    result = value1 >= value2;
                    break;
                case 'less_or_equal':
                    result = value1 <= value2;
                    break;
                case 'contains':
                    result = String(value1).includes(String(value2));
                    break;
                case 'starts_with':
                    result = String(value1).startsWith(String(value2));
                    break;
                case 'ends_with':
                    result = String(value1).endsWith(String(value2));
                    break;
                case 'is_empty':
                    result = value1 === '' || value1 === null || value1 === undefined;
                    break;
                case 'is_null':
                    result = value1 === null || value1 === undefined;
                    break;
                default:
                    return {
                        success: false,
                        error: { code: 'INVALID_OPERATION', message: `Unknown operation: ${operation}` },
                    };
            }
            return {
                success: true,
                output: {
                    result,
                    operation,
                    value1,
                    value2,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CONDITIONAL_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to evaluate condition',
                    details: error,
                },
            };
        }
    },
};
// ========== COLLECTION TOOLS ==========
/**
 * Array Manipulation Tool
 */
export const arrayManipulateTool = {
    name: 'array_manipulate',
    description: 'Perform array operations: push, pop, slice, filter, map, find, includes, length, join, sort, reverse',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'array',
            description: 'Input array',
            schema: z.array(z.any()),
            required: true,
        },
        {
            name: 'operation',
            description: 'Operation to perform',
            schema: z.enum(['length', 'includes', 'slice', 'join', 'sort', 'reverse', 'first', 'last', 'unique']),
            required: true,
        },
        {
            name: 'value',
            description: 'Value to check (for includes)',
            schema: z.any(),
            required: false,
        },
        {
            name: 'start',
            description: 'Start index (for slice)',
            schema: z.number().int(),
            required: false,
        },
        {
            name: 'end',
            description: 'End index (for slice)',
            schema: z.number().int(),
            required: false,
        },
        {
            name: 'separator',
            description: 'Separator (for join)',
            schema: z.string(),
            required: false,
            default: ',',
        },
    ],
    async execute(params) {
        try {
            const { array, operation, value, start, end, separator = ',' } = params;
            let result;
            switch (operation) {
                case 'length':
                    result = array.length;
                    break;
                case 'includes':
                    if (value === undefined) {
                        return { success: false, error: { code: 'INVALID_PARAMS', message: 'value required for includes' } };
                    }
                    result = array.includes(value);
                    break;
                case 'slice':
                    result = array.slice(start, end);
                    break;
                case 'join':
                    result = array.join(separator);
                    break;
                case 'sort':
                    result = [...array].sort();
                    break;
                case 'reverse':
                    result = [...array].reverse();
                    break;
                case 'first':
                    result = array[0];
                    break;
                case 'last':
                    result = array[array.length - 1];
                    break;
                case 'unique':
                    result = Array.from(new Set(array));
                    break;
                default:
                    return {
                        success: false,
                        error: { code: 'INVALID_OPERATION', message: `Unknown operation: ${operation}` },
                    };
            }
            return {
                success: true,
                output: {
                    operation,
                    result,
                    originalLength: array.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'ARRAY_MANIPULATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to manipulate array',
                    details: error,
                },
            };
        }
    },
};
// ========== ENCODING TOOLS ==========
/**
 * Encode/Decode Tool
 */
export const encodeDecodeTool = {
    name: 'encode_decode',
    description: 'Encode or decode strings using Base64, URL encoding, etc.',
    category: 'utility',
    permissions: [],
    parallelizable: true,
    parameters: [
        {
            name: 'input',
            description: 'Input string',
            schema: z.string(),
            required: true,
        },
        {
            name: 'operation',
            description: 'Operation to perform',
            schema: z.enum(['base64_encode', 'base64_decode', 'url_encode', 'url_decode']),
            required: true,
        },
    ],
    async execute(params) {
        try {
            const { input, operation } = params;
            let result;
            switch (operation) {
                case 'base64_encode':
                    result = Buffer.from(input, 'utf-8').toString('base64');
                    break;
                case 'base64_decode':
                    result = Buffer.from(input, 'base64').toString('utf-8');
                    break;
                case 'url_encode':
                    result = encodeURIComponent(input);
                    break;
                case 'url_decode':
                    result = decodeURIComponent(input);
                    break;
                default:
                    return {
                        success: false,
                        error: { code: 'INVALID_OPERATION', message: `Unknown operation: ${operation}` },
                    };
            }
            return {
                success: true,
                output: {
                    operation,
                    input,
                    result,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'ENCODE_DECODE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to encode/decode',
                    details: error,
                },
            };
        }
    },
};
/**
 * All Utility Tools
 */
export const utilityTools = [
    // Time/Date
    getCurrentTimeTool,
    sleepTool,
    calculateTimeTool,
    // String
    stringManipulateTool,
    regexMatchTool,
    // Math
    calculateTool,
    randomNumberTool,
    // Logic
    conditionalTool,
    // Collections
    arrayManipulateTool,
    // Encoding
    encodeDecodeTool,
];
