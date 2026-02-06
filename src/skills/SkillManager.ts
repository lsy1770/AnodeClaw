/**
 * Skill Manager
 *
 * Manages skill registration, execution, and lifecycle.
 * Skills are high-level automation workflows composed of multiple tool calls.
 */

import { logger } from '../utils/logger.js';
import type { ToolExecutor } from '../tools/ToolExecutor.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type {
  Skill,
  SkillResult,
  SkillRegistration,
  SkillContext,
  SkillParameter,
} from './types.js';

export class SkillManager {
  private skills: Map<string, SkillRegistration> = new Map();
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;

  constructor(toolRegistry: ToolRegistry, toolExecutor: ToolExecutor) {
    this.toolRegistry = toolRegistry;
    this.toolExecutor = toolExecutor;
    logger.info('[SkillManager] Initialized');
  }

  /**
   * Register a skill
   */
  register(skill: Skill, source: 'builtin' | 'plugin' | 'user' = 'builtin'): void {
    if (this.skills.has(skill.id)) {
      logger.warn(`[SkillManager] Skill "${skill.id}" already exists, replacing`);
    }

    // Validate required tools exist
    if (skill.requiredTools) {
      for (const toolName of skill.requiredTools) {
        if (!this.toolRegistry.get(toolName)) {
          logger.warn(`[SkillManager] Skill "${skill.id}" requires tool "${toolName}" which is not registered`);
        }
      }
    }

    this.skills.set(skill.id, {
      skill,
      enabled: true,
      registeredAt: Date.now(),
      source,
      executionCount: 0,
    });

    logger.info(`[SkillManager] Registered skill: ${skill.name} (${skill.id})`);
  }

  /**
   * Unregister a skill
   */
  unregister(skillId: string): boolean {
    const existed = this.skills.delete(skillId);
    if (existed) {
      logger.info(`[SkillManager] Unregistered skill: ${skillId}`);
    }
    return existed;
  }

  /**
   * Execute a skill
   */
  async execute(skillId: string, params: Record<string, any> = {}): Promise<SkillResult> {
    const startTime = Date.now();
    const registration = this.skills.get(skillId);

    if (!registration) {
      return {
        success: false,
        skillId,
        stepResults: {},
        error: `Skill "${skillId}" not found`,
        duration: 0,
      };
    }

    if (!registration.enabled) {
      return {
        success: false,
        skillId,
        stepResults: {},
        error: `Skill "${skillId}" is disabled`,
        duration: 0,
      };
    }

    const { skill } = registration;

    // Validate parameters
    const paramError = this.validateParams(skill.parameters, params);
    if (paramError) {
      return {
        success: false,
        skillId,
        stepResults: {},
        error: paramError,
        duration: 0,
      };
    }

    // Apply defaults
    const resolvedParams = this.applyDefaults(skill.parameters, params);

    // Create execution context
    const context: SkillContext = {
      params: resolvedParams,
      results: {},
      state: {},
    };

    const stepResults: SkillResult['stepResults'] = {};
    let lastOutput: any = undefined;
    let failed = false;

    logger.info(`[SkillManager] Executing skill: ${skill.name} (${skill.id})`);

    // Execute steps sequentially
    for (const step of skill.steps) {
      const stepStart = Date.now();

      // Check condition
      if (step.condition && !step.condition(context)) {
        stepResults[step.name] = {
          success: true,
          skipped: true,
          duration: 0,
        };
        logger.debug(`[SkillManager] Step "${step.name}" skipped (condition)`);
        continue;
      }

      // Apply delay
      if (step.delay && step.delay > 0) {
        await this.sleep(step.delay);
      }

      // Execute step with retries
      const maxRetries = step.retries ?? 0;
      let stepSuccess = false;
      let stepOutput: any = undefined;
      let stepError: string | undefined;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (step.handler) {
            // Custom handler
            stepOutput = await step.handler(context);
            stepSuccess = true;
          } else if (step.tool) {
            // Tool call
            const resolvedToolParams = this.resolveParams(step.params || {}, context);
            const toolResult = await this.toolExecutor.execute(
              {
                id: `${skillId}:${step.name}:${attempt}`,
                name: step.tool,
                input: resolvedToolParams,
              }
            );

            stepSuccess = toolResult.success;
            stepOutput = toolResult.output;
            if (!toolResult.success) {
              stepError = toolResult.error?.message;
            }
          }

          if (stepSuccess) break;
        } catch (error) {
          stepError = error instanceof Error ? error.message : String(error);
          if (attempt < maxRetries) {
            logger.warn(`[SkillManager] Step "${step.name}" failed (attempt ${attempt + 1}/${maxRetries + 1}): ${stepError}`);
            await this.sleep(1000 * (attempt + 1)); // Exponential backoff
          }
        }
      }

      const stepDuration = Date.now() - stepStart;
      stepResults[step.name] = {
        success: stepSuccess,
        output: stepOutput,
        error: stepError,
        duration: stepDuration,
      };

      // Store result in context
      context.results[step.name] = stepOutput;
      lastOutput = stepOutput;

      if (!stepSuccess) {
        logger.error(`[SkillManager] Step "${step.name}" failed: ${stepError}`);
        if (step.critical !== false) {
          // Critical step failed, abort skill
          failed = true;
          break;
        }
      } else {
        logger.debug(`[SkillManager] Step "${step.name}" completed (${stepDuration}ms)`);
      }
    }

    registration.executionCount++;
    const totalDuration = Date.now() - startTime;

    const result: SkillResult = {
      success: !failed,
      skillId,
      stepResults,
      output: lastOutput,
      error: failed ? `Skill failed at step execution` : undefined,
      duration: totalDuration,
    };

    logger.info(
      `[SkillManager] Skill "${skill.name}" ${failed ? 'FAILED' : 'completed'} (${totalDuration}ms)`
    );

    return result;
  }

  /**
   * Get a skill by ID
   */
  get(skillId: string): Skill | undefined {
    const reg = this.skills.get(skillId);
    return reg?.enabled ? reg.skill : undefined;
  }

  /**
   * List all skills
   */
  list(): Array<{
    id: string;
    name: string;
    description: string;
    category?: string;
    tags?: string[];
    enabled: boolean;
    executionCount: number;
  }> {
    return Array.from(this.skills.values()).map(reg => ({
      id: reg.skill.id,
      name: reg.skill.name,
      description: reg.skill.description,
      category: reg.skill.category,
      tags: reg.skill.tags,
      enabled: reg.enabled,
      executionCount: reg.executionCount,
    }));
  }

  /**
   * Get skills by category
   */
  getByCategory(category: string): Skill[] {
    return Array.from(this.skills.values())
      .filter(r => r.enabled && r.skill.category === category)
      .map(r => r.skill);
  }

  /**
   * Search skills by tag or name
   */
  search(query: string): Skill[] {
    const q = query.toLowerCase();
    return Array.from(this.skills.values())
      .filter(r => {
        const s = r.skill;
        return (
          r.enabled &&
          (s.name.toLowerCase().includes(q) ||
           s.description.toLowerCase().includes(q) ||
           s.tags?.some(t => t.toLowerCase().includes(q)))
        );
      })
      .map(r => r.skill);
  }

  /**
   * Enable/disable a skill
   */
  setEnabled(skillId: string, enabled: boolean): boolean {
    const reg = this.skills.get(skillId);
    if (reg) {
      reg.enabled = enabled;
      return true;
    }
    return false;
  }

  /**
   * Convert skills to Anthropic tool format (so AI can call them)
   */
  toAnthropicFormat(): any[] {
    return Array.from(this.skills.values())
      .filter(r => r.enabled)
      .map(r => ({
        name: `skill_${r.skill.id}`,
        description: `[Skill] ${r.skill.description}`,
        input_schema: {
          type: 'object',
          properties: Object.fromEntries(
            r.skill.parameters.map(p => [
              p.name,
              {
                type: p.type,
                description: p.description,
                ...(p.enum ? { enum: p.enum } : {}),
              },
            ])
          ),
          required: r.skill.parameters.filter(p => p.required).map(p => p.name),
        },
      }));
  }

  // --- Private helpers ---

  private validateParams(
    paramDefs: SkillParameter[],
    params: Record<string, any>
  ): string | null {
    for (const def of paramDefs) {
      if (def.required && !(def.name in params)) {
        return `Missing required parameter: ${def.name}`;
      }

      if (def.name in params) {
        const val = params[def.name];
        if (def.enum && !def.enum.includes(val)) {
          return `Invalid value for "${def.name}": must be one of ${def.enum.join(', ')}`;
        }
      }
    }
    return null;
  }

  private applyDefaults(
    paramDefs: SkillParameter[],
    params: Record<string, any>
  ): Record<string, any> {
    const result = { ...params };
    for (const def of paramDefs) {
      if (!(def.name in result) && def.default !== undefined) {
        result[def.name] = def.default;
      }
    }
    return result;
  }

  /**
   * Resolve template references in parameters.
   * Supports ${stepName.field} syntax to reference previous step results.
   */
  private resolveParams(
    params: Record<string, any>,
    context: SkillContext
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.includes('${')) {
        resolved[key] = value.replace(/\$\{([^}]+)\}/g, (_, path: string) => {
          const parts = path.split('.');
          let current: any = context;

          // First check if it's a param reference
          if (parts[0] === 'params') {
            current = context.params;
            parts.shift();
          } else if (parts[0] === 'state') {
            current = context.state;
            parts.shift();
          } else {
            // Otherwise it's a step result reference
            current = context.results;
          }

          for (const part of parts) {
            if (current && typeof current === 'object') {
              current = current[part];
            } else {
              return '';
            }
          }

          return current !== undefined ? String(current) : '';
        });
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
