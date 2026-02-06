/**
 * Calculator Plugin
 *
 * Provides mathematical calculation tools.
 * This is an example plugin demonstrating the plugin system.
 */

import {
  Plugin,
  PluginMetadata,
  PluginContext,
  PluginConfigSchema,
} from '../types.js';
import { Tool, ToolResult } from '../../tools/types.js';
import { z } from 'zod';

/**
 * Calculator Plugin implementation
 */
export default class CalculatorPlugin implements Plugin {
  readonly metadata: PluginMetadata = {
    id: 'calculator',
    name: 'Calculator Plugin',
    version: '1.0.0',
    description: 'Perform mathematical calculations and evaluations',
    author: 'Anode ClawdBot Team',
    license: 'MIT',
    permissions: [],
  };

  private context!: PluginContext;

  async init(context: PluginContext): Promise<void> {
    this.context = context;
    context.log('info', 'Calculator plugin initialized');
  }

  async destroy(): Promise<void> {
    this.context.log('info', 'Calculator plugin destroyed');
  }

  getTools(): Tool[] {
    return [
      {
        name: 'calculate',
        description:
          'Evaluate a mathematical expression (supports +, -, *, /, ^, sqrt, sin, cos, tan, log, etc.)',
        parameters: [
          {
            name: 'expression',
            description: 'Mathematical expression to evaluate (e.g., "2 + 3 * 4", "sqrt(16)", "sin(PI/2)")',
            schema: z.string().min(1),
            required: true,
          },
        ],
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
          try {
            const result = await this.calculate(params);
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'CALCULATION_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
      {
        name: 'convert_units',
        description: 'Convert between units (length, weight, temperature, etc.)',
        parameters: [
          {
            name: 'value',
            description: 'Value to convert',
            schema: z.number(),
            required: true,
          },
          {
            name: 'fromUnit',
            description: 'Source unit (e.g., "km", "lb", "c")',
            schema: z.string(),
            required: true,
          },
          {
            name: 'toUnit',
            description: 'Target unit (e.g., "mi", "kg", "f")',
            schema: z.string(),
            required: true,
          },
        ],
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
          try {
            const result = await this.convertUnits(params);
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'CONVERSION_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
      {
        name: 'percentage',
        description: 'Calculate percentages',
        parameters: [
          {
            name: 'value',
            description: 'Base value',
            schema: z.number(),
            required: true,
          },
          {
            name: 'percent',
            description: 'Percentage',
            schema: z.number(),
            required: true,
          },
          {
            name: 'operation',
            description: 'Operation: "of" (X% of Y), "increase" (increase Y by X%), "decrease" (decrease Y by X%)',
            schema: z.enum(['of', 'increase', 'decrease']).optional(),
            required: false,
          },
        ],
        execute: async (params: Record<string, any>): Promise<ToolResult> => {
          try {
            const result = await this.percentage(params);
            return {
              success: true,
              output: result,
            };
          } catch (error) {
            return {
              success: false,
              error: {
                code: 'PERCENTAGE_ERROR',
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        },
      },
    ];
  }

  getConfigSchema(): PluginConfigSchema {
    return {
      fields: [
        {
          key: 'precision',
          label: 'Decimal Precision',
          type: 'number',
          description: 'Number of decimal places in results',
          defaultValue: 4,
          min: 0,
          max: 10,
        },
        {
          key: 'angleUnit',
          label: 'Angle Unit',
          type: 'select',
          description: 'Unit for trigonometric functions',
          defaultValue: 'radians',
          options: [
            { label: 'Radians', value: 'radians' },
            { label: 'Degrees', value: 'degrees' },
          ],
        },
      ],
    };
  }

  /**
   * Calculate mathematical expression
   */
  private async calculate(params: Record<string, any>): Promise<string> {
    // Validate parameters
    const schema = z.object({
      expression: z.string().min(1),
    });

    const parsed = schema.parse(params);
    const precision = this.context.pluginConfig.settings.precision || 4;

    try {
      // Sanitize expression - remove dangerous patterns
      const sanitized = this.sanitizeExpression(parsed.expression);

      // Replace mathematical constants
      let expr = sanitized
        .replace(/PI/gi, String(Math.PI))
        .replace(/E\b/gi, String(Math.E));

      // Replace mathematical functions
      expr = expr
        .replace(/sqrt\(([^)]+)\)/gi, 'Math.sqrt($1)')
        .replace(/abs\(([^)]+)\)/gi, 'Math.abs($1)')
        .replace(/sin\(([^)]+)\)/gi, 'Math.sin($1)')
        .replace(/cos\(([^)]+)\)/gi, 'Math.cos($1)')
        .replace(/tan\(([^)]+)\)/gi, 'Math.tan($1)')
        .replace(/log\(([^)]+)\)/gi, 'Math.log10($1)')
        .replace(/ln\(([^)]+)\)/gi, 'Math.log($1)')
        .replace(/\^/g, '**');

      // Evaluate expression
      // eslint-disable-next-line no-eval
      const result = eval(expr);

      if (typeof result !== 'number' || !isFinite(result)) {
        throw new Error('Invalid result');
      }

      const rounded = Number(result.toFixed(precision));

      this.context.log('info', `Calculated: ${parsed.expression} = ${rounded}`);

      return JSON.stringify(
        {
          expression: parsed.expression,
          result: rounded,
          formatted: this.formatNumber(rounded),
        },
        null,
        2
      );
    } catch (error) {
      this.context.log('error', `Calculation failed: ${error}`);
      return JSON.stringify({
        error: 'Invalid mathematical expression',
        expression: parsed.expression,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Convert units
   */
  private async convertUnits(params: Record<string, any>): Promise<string> {
    // Validate parameters
    const schema = z.object({
      value: z.number(),
      fromUnit: z.string(),
      toUnit: z.string(),
    });

    const parsed = schema.parse(params);
    const precision = this.context.pluginConfig.settings.precision || 4;

    try {
      const result = this.performUnitConversion(
        parsed.value,
        parsed.fromUnit.toLowerCase(),
        parsed.toUnit.toLowerCase()
      );

      const rounded = Number(result.toFixed(precision));

      this.context.log(
        'info',
        `Converted: ${parsed.value} ${parsed.fromUnit} = ${rounded} ${parsed.toUnit}`
      );

      return JSON.stringify(
        {
          value: parsed.value,
          fromUnit: parsed.fromUnit,
          toUnit: parsed.toUnit,
          result: rounded,
          formatted: `${this.formatNumber(rounded)} ${parsed.toUnit}`,
        },
        null,
        2
      );
    } catch (error) {
      this.context.log('error', `Unit conversion failed: ${error}`);
      return JSON.stringify({
        error: 'Unit conversion failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Calculate percentage
   */
  private async percentage(params: Record<string, any>): Promise<string> {
    // Validate parameters
    const schema = z.object({
      value: z.number(),
      percent: z.number(),
      operation: z.enum(['of', 'increase', 'decrease']).optional(),
    });

    const parsed = schema.parse(params);
    const operation = parsed.operation || 'of';
    const precision = this.context.pluginConfig.settings.precision || 4;

    let result: number;
    let description: string;

    switch (operation) {
      case 'of':
        result = (parsed.value * parsed.percent) / 100;
        description = `${parsed.percent}% of ${parsed.value}`;
        break;
      case 'increase':
        result = parsed.value * (1 + parsed.percent / 100);
        description = `${parsed.value} increased by ${parsed.percent}%`;
        break;
      case 'decrease':
        result = parsed.value * (1 - parsed.percent / 100);
        description = `${parsed.value} decreased by ${parsed.percent}%`;
        break;
    }

    const rounded = Number(result.toFixed(precision));

    this.context.log('info', `${description} = ${rounded}`);

    return JSON.stringify(
      {
        operation,
        value: parsed.value,
        percent: parsed.percent,
        result: rounded,
        description: `${description} = ${this.formatNumber(rounded)}`,
      },
      null,
      2
    );
  }

  /**
   * Sanitize mathematical expression
   */
  private sanitizeExpression(expr: string): string {
    // Remove dangerous patterns
    const dangerous = [
      /require\(/gi,
      /import\(/gi,
      /eval\(/gi,
      /Function\(/gi,
      /\bprocess\b/gi,
      /\bglobal\b/gi,
      /\b__dirname\b/gi,
      /\b__filename\b/gi,
    ];

    for (const pattern of dangerous) {
      if (pattern.test(expr)) {
        throw new Error('Dangerous pattern detected in expression');
      }
    }

    return expr;
  }

  /**
   * Perform unit conversion
   */
  private performUnitConversion(value: number, from: string, to: string): number {
    // Length conversions
    const lengthToMeters: Record<string, number> = {
      m: 1,
      km: 1000,
      cm: 0.01,
      mm: 0.001,
      mi: 1609.34,
      yd: 0.9144,
      ft: 0.3048,
      in: 0.0254,
    };

    if (lengthToMeters[from] && lengthToMeters[to]) {
      return (value * lengthToMeters[from]) / lengthToMeters[to];
    }

    // Weight conversions
    const weightToKg: Record<string, number> = {
      kg: 1,
      g: 0.001,
      mg: 0.000001,
      lb: 0.453592,
      oz: 0.0283495,
      ton: 1000,
    };

    if (weightToKg[from] && weightToKg[to]) {
      return (value * weightToKg[from]) / weightToKg[to];
    }

    // Temperature conversions
    if (from === 'c' && to === 'f') return (value * 9) / 5 + 32;
    if (from === 'f' && to === 'c') return ((value - 32) * 5) / 9;
    if (from === 'c' && to === 'k') return value + 273.15;
    if (from === 'k' && to === 'c') return value - 273.15;
    if (from === 'f' && to === 'k') return ((value - 32) * 5) / 9 + 273.15;
    if (from === 'k' && to === 'f') return ((value - 273.15) * 9) / 5 + 32;

    throw new Error(`Unsupported unit conversion: ${from} to ${to}`);
  }

  /**
   * Format number with thousands separators
   */
  private formatNumber(num: number): string {
    return num.toLocaleString('en-US', {
      maximumFractionDigits: this.context.pluginConfig.settings.precision || 4,
    });
  }
}
