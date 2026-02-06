/**
 * Skill Manager
 *
 * Manages skill registration, execution, and lifecycle.
 * Skills are high-level automation workflows composed of multiple tool calls.
 */
import { logger } from '../utils/logger.js';
export class SkillManager {
    constructor(toolRegistry, toolExecutor) {
        this.skills = new Map();
        this.toolRegistry = toolRegistry;
        this.toolExecutor = toolExecutor;
        logger.info('[SkillManager] Initialized');
    }
    /**
     * Register a skill
     */
    register(skill, source = 'builtin') {
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
    unregister(skillId) {
        const existed = this.skills.delete(skillId);
        if (existed) {
            logger.info(`[SkillManager] Unregistered skill: ${skillId}`);
        }
        return existed;
    }
    /**
     * Execute a skill
     */
    async execute(skillId, params = {}) {
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
        const context = {
            params: resolvedParams,
            results: {},
            state: {},
        };
        const stepResults = {};
        let lastOutput = undefined;
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
            let stepOutput = undefined;
            let stepError;
            for (let attempt = 0; attempt <= maxRetries; attempt++) {
                try {
                    if (step.handler) {
                        // Custom handler
                        stepOutput = await step.handler(context);
                        stepSuccess = true;
                    }
                    else if (step.tool) {
                        // Tool call
                        const resolvedToolParams = this.resolveParams(step.params || {}, context);
                        const toolResult = await this.toolExecutor.execute({
                            id: `${skillId}:${step.name}:${attempt}`,
                            name: step.tool,
                            input: resolvedToolParams,
                        });
                        stepSuccess = toolResult.success;
                        stepOutput = toolResult.output;
                        if (!toolResult.success) {
                            stepError = toolResult.error?.message;
                        }
                    }
                    if (stepSuccess)
                        break;
                }
                catch (error) {
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
            }
            else {
                logger.debug(`[SkillManager] Step "${step.name}" completed (${stepDuration}ms)`);
            }
        }
        registration.executionCount++;
        const totalDuration = Date.now() - startTime;
        const result = {
            success: !failed,
            skillId,
            stepResults,
            output: lastOutput,
            error: failed ? `Skill failed at step execution` : undefined,
            duration: totalDuration,
        };
        logger.info(`[SkillManager] Skill "${skill.name}" ${failed ? 'FAILED' : 'completed'} (${totalDuration}ms)`);
        return result;
    }
    /**
     * Get a skill by ID
     */
    get(skillId) {
        const reg = this.skills.get(skillId);
        return reg?.enabled ? reg.skill : undefined;
    }
    /**
     * List all skills
     */
    list() {
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
    getByCategory(category) {
        return Array.from(this.skills.values())
            .filter(r => r.enabled && r.skill.category === category)
            .map(r => r.skill);
    }
    /**
     * Search skills by tag or name
     */
    search(query) {
        const q = query.toLowerCase();
        return Array.from(this.skills.values())
            .filter(r => {
            const s = r.skill;
            return (r.enabled &&
                (s.name.toLowerCase().includes(q) ||
                    s.description.toLowerCase().includes(q) ||
                    s.tags?.some(t => t.toLowerCase().includes(q))));
        })
            .map(r => r.skill);
    }
    /**
     * Enable/disable a skill
     */
    setEnabled(skillId, enabled) {
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
    toAnthropicFormat() {
        return Array.from(this.skills.values())
            .filter(r => r.enabled)
            .map(r => ({
            name: `skill_${r.skill.id}`,
            description: `[Skill] ${r.skill.description}`,
            input_schema: {
                type: 'object',
                properties: Object.fromEntries(r.skill.parameters.map(p => [
                    p.name,
                    {
                        type: p.type,
                        description: p.description,
                        ...(p.enum ? { enum: p.enum } : {}),
                    },
                ])),
                required: r.skill.parameters.filter(p => p.required).map(p => p.name),
            },
        }));
    }
    // --- Private helpers ---
    validateParams(paramDefs, params) {
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
    applyDefaults(paramDefs, params) {
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
    resolveParams(params, context) {
        const resolved = {};
        for (const [key, value] of Object.entries(params)) {
            if (typeof value === 'string' && value.includes('${')) {
                resolved[key] = value.replace(/\$\{([^}]+)\}/g, (_, path) => {
                    const parts = path.split('.');
                    let current = context;
                    // First check if it's a param reference
                    if (parts[0] === 'params') {
                        current = context.params;
                        parts.shift();
                    }
                    else if (parts[0] === 'state') {
                        current = context.state;
                        parts.shift();
                    }
                    else {
                        // Otherwise it's a step result reference
                        current = context.results;
                    }
                    for (const part of parts) {
                        if (current && typeof current === 'object') {
                            current = current[part];
                        }
                        else {
                            return '';
                        }
                    }
                    return current !== undefined ? String(current) : '';
                });
            }
            else {
                resolved[key] = value;
            }
        }
        return resolved;
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
