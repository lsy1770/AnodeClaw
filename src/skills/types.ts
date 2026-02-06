/**
 * Skills System - Types
 *
 * A Skill is a high-level automation workflow composed of multiple tool calls.
 * Skills abstract complex multi-step operations into single callable units.
 */

import type { ToolResult } from '../tools/types.js';

/**
 * Skill parameter definition
 */
export interface SkillParameter {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  default?: any;
  enum?: any[];
}

/**
 * Skill step - a single action in a workflow
 */
export interface SkillStep {
  /** Step name for logging */
  name: string;
  /** Tool to call (or 'custom' for inline logic) */
  tool?: string;
  /** Tool parameters (can reference previous step results via ${stepName.output.field}) */
  params?: Record<string, any>;
  /** Custom handler for logic steps */
  handler?: (context: SkillContext) => Promise<any>;
  /** Condition to skip this step */
  condition?: (context: SkillContext) => boolean;
  /** Whether failure of this step should abort the whole skill */
  critical?: boolean;
  /** Retry count for this step */
  retries?: number;
  /** Delay before this step in ms */
  delay?: number;
}

/**
 * Skill execution context - passed between steps
 */
export interface SkillContext {
  /** Input parameters from the user/AI */
  params: Record<string, any>;
  /** Results from previous steps, keyed by step name */
  results: Record<string, any>;
  /** Shared state between steps */
  state: Record<string, any>;
  /** Session ID */
  sessionId?: string;
}

/**
 * Skill definition
 */
export interface Skill {
  /** Unique skill ID */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description for AI and users */
  description: string;
  /** Category for grouping */
  category?: string;
  /** Input parameters */
  parameters: SkillParameter[];
  /** Workflow steps */
  steps: SkillStep[];
  /** Required tool names (for validation) */
  requiredTools?: string[];
  /** Tags for searchability */
  tags?: string[];
  /** Version */
  version?: string;
}

/**
 * Skill execution result
 */
export interface SkillResult {
  success: boolean;
  skillId: string;
  /** Results from each step */
  stepResults: Record<string, {
    success: boolean;
    output?: any;
    error?: string;
    skipped?: boolean;
    duration: number;
  }>;
  /** Final output */
  output?: any;
  /** Error if skill failed */
  error?: string;
  /** Total execution duration */
  duration: number;
}

/**
 * Skill registration info
 */
export interface SkillRegistration {
  skill: Skill;
  enabled: boolean;
  registeredAt: number;
  source: 'builtin' | 'plugin' | 'user';
  executionCount: number;
}
