/**
 * Dynamic System Prompts - Types
 *
 * Type definitions for modular system prompt system
 * Following OpenClaw's modular design pattern
 */

import type { Tool } from '../../tools/types.js';

/**
 * Prompt source types (legacy, kept for backward compatibility)
 */
export type PromptSource = 'identity' | 'soul' | 'agents' | 'user' | 'context';

/**
 * System prompt section types
 */
export type SystemPromptSection =
  | 'identity'       // Core identity declaration
  | 'tooling'        // Available tools and usage guide
  | 'safety'         // Safety rules and boundaries
  | 'skills'         // Skills system
  | 'memory'         // Memory retrieval system
  | 'workspace'      // Working directory context
  | 'docs'           // Documentation references
  | 'messaging'      // Cross-session messaging
  | 'projectContext' // Project files (AGENTS.md, SOUL.md, etc.)
  | 'silentReplies'  // Silent reply handling
  | 'runtime';       // Runtime environment info

/**
 * Prompt section
 */
export interface PromptSection {
  source: PromptSource;
  content: string;
  priority: number; // Higher priority sections come first
  enabled: boolean;
}

/**
 * Prompt configuration
 */
export interface PromptConfig {
  identityFile?: string; // Path to IDENTITY.md
  soulFile?: string; // Path to SOUL.md
  agentsFile?: string; // Path to AGENTS.md
  userFile?: string; // Path to USER.md
  basePrompt?: string; // Base system prompt
  enableHotReload?: boolean; // Auto-reload files on change
  reloadInterval?: number; // Check interval (ms)
}

/**
 * Prompt template variables
 */
export interface PromptVariables {
  userName?: string;
  sessionId?: string;
  currentTime?: string;
  context?: string;
  [key: string]: any;
}

/**
 * Built prompt result
 */
export interface BuiltPrompt {
  fullPrompt: string;
  sections: PromptSection[];
  variables: PromptVariables;
  timestamp: number;
}

/**
 * Context file embedded in prompt
 */
export interface EmbeddedContextFile {
  path: string;
  content: string;
  type: 'identity' | 'soul' | 'agents' | 'user' | 'custom';
}

/**
 * Tool summary for system prompt
 */
export interface ToolSummary {
  name: string;
  description: string;
  category?: string;
}

/**
 * Runtime information for system prompt
 */
export interface RuntimeInfo {
  /** Agent name */
  agentName: string;
  /** Agent version */
  agentVersion: string;
  /** Host platform */
  platform: 'android' | 'anode';
  /** Android version (if available) */
  androidVersion?: string;
  /** Device model */
  deviceModel?: string;
  /** AI model being used */
  model: string;
  /** Current timestamp */
  timestamp: number;
  /** Session ID */
  sessionId?: string;
}

/**
 * Skills prompt configuration
 */
export interface SkillsPromptConfig {
  /** List of available skill names */
  skillNames: string[];
  /** Skill descriptions */
  skillDescriptions: Record<string, string>;
  /** Whether skills are enabled */
  enabled: boolean;
}

/**
 * Memory system prompt configuration
 */
export interface MemoryPromptConfig {
  /** Whether memory retrieval is enabled */
  enabled: boolean;
  /** Number of relevant memories to include */
  maxMemories?: number;
  /** Retrieved memories for context */
  relevantMemories?: string[];
}

/**
 * System prompt builder parameters
 */
export interface SystemPromptParams {
  /** Working directory path */
  workspaceDir: string;

  /** Available tools */
  tools?: Tool[];

  /** Tool summaries for prompt (name → description) */
  toolSummaries?: Record<string, string>;

  /** Skills configuration */
  skills?: SkillsPromptConfig;

  /** Memory configuration */
  memory?: MemoryPromptConfig;

  /** Context files to embed */
  contextFiles?: EmbeddedContextFile[];

  /** Runtime information */
  runtime?: RuntimeInfo;

  /** Custom identity text (overrides default) */
  customIdentity?: string;

  /** Custom safety rules */
  customSafetyRules?: string[];

  /** Enabled sections (default: all) */
  enabledSections?: SystemPromptSection[];

  /** Additional custom sections */
  customSections?: Array<{
    title: string;
    content: string;
    priority?: number;
  }>;
}

/**
 * Built system prompt result
 */
export interface BuiltSystemPrompt {
  /** Full system prompt text */
  prompt: string;

  /** Sections included */
  sections: SystemPromptSection[];

  /** Token estimate (rough) */
  estimatedTokens: number;

  /** Build timestamp */
  timestamp: number;
}

/**
 * Safety rule categories
 */
export type SafetyCategory =
  | 'autonomy'      // No independent goals
  | 'oversight'     // Human oversight
  | 'transparency'  // Honest about capabilities
  | 'privacy'       // User data protection
  | 'harmful'       // Refuse harmful requests
  | 'security';     // Security best practices

/**
 * Safety rule definition
 */
export interface SafetyRule {
  category: SafetyCategory;
  rule: string;
  priority: 'critical' | 'high' | 'medium';
}
