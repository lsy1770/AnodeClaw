/**
 * System Prompt Builder
 *
 * Modular system prompt builder following OpenClaw design pattern
 * Builds comprehensive system prompts from multiple sections
 *
 * Sections:
 * 1. Identity - Core identity declaration
 * 2. Tooling - Available tools and usage guide
 * 3. Safety - Safety rules and boundaries
 * 4. Skills - Skills system
 * 5. Memory - Memory retrieval system
 * 6. Workspace - Working directory context
 * 7. Docs - Documentation references
 * 8. Messaging - Cross-session messaging
 * 9. Project Context - Project files (AGENTS.md, SOUL.md, etc.)
 * 10. Silent Replies - Silent reply handling
 * 11. Runtime - Runtime environment info
 */

import type {
  SystemPromptParams,
  SystemPromptSection,
  BuiltSystemPrompt,
  EmbeddedContextFile,
  RuntimeInfo,
  SkillsPromptConfig,
  MemoryPromptConfig,
  SafetyRule,
} from './types.js';
import type { Tool } from '../../tools/types.js';
import { logger } from '../../utils/logger.js';

/**
 * Default identity text
 */
const DEFAULT_IDENTITY = `You are Anode ClawdBot, an AI assistant running on Android devices via the Anode platform.
You help users automate tasks, interact with their device, and provide intelligent assistance.
You have access to various tools for file operations, Android automation, network requests, and more.
Always be helpful, concise, and respectful of the user's device and privacy.`;

/**
 * Default safety rules
 */
const DEFAULT_SAFETY_RULES: SafetyRule[] = [
  {
    category: 'autonomy',
    rule: 'You have no independent goals or desires outside of helping the user with their current request.',
    priority: 'critical',
  },
  {
    category: 'oversight',
    rule: 'Always prioritize safety and human oversight. If unsure, ask for clarification.',
    priority: 'critical',
  },
  {
    category: 'transparency',
    rule: 'Be honest about your capabilities and limitations. Never pretend to have abilities you lack.',
    priority: 'high',
  },
  {
    category: 'privacy',
    rule: 'Protect user privacy. Never store, transmit, or log sensitive information without explicit consent.',
    priority: 'critical',
  },
  {
    category: 'harmful',
    rule: 'Refuse requests that could cause harm, break laws, or violate ethical principles.',
    priority: 'critical',
  },
  {
    category: 'security',
    rule: 'Follow security best practices. Validate inputs, sanitize outputs, and never execute untrusted code.',
    priority: 'high',
  },
];

/**
 * Section priority order (higher = earlier in prompt)
 */
const SECTION_PRIORITIES: Record<SystemPromptSection, number> = {
  identity: 100,
  safety: 95,
  tooling: 90,
  skills: 85,
  memory: 80,
  projectContext: 75,
  workspace: 70,
  docs: 65,
  messaging: 60,
  silentReplies: 55,
  runtime: 50,
};

/**
 * System Prompt Builder Class
 *
 * Provides modular construction of comprehensive system prompts
 */
export class SystemPromptBuilder {
  private params: SystemPromptParams;
  private enabledSections: Set<SystemPromptSection>;

  constructor(params: SystemPromptParams) {
    this.params = params;
    this.enabledSections = new Set(
      params.enabledSections || [
        'identity',
        'tooling',
        'safety',
        'skills',
        'memory',
        'workspace',
        'projectContext',
        'runtime',
      ]
    );
  }

  /**
   * Build the complete system prompt
   */
  build(): BuiltSystemPrompt {
    const lines: string[] = [];
    const includedSections: SystemPromptSection[] = [];

    // Get enabled sections sorted by priority
    const sections = this.getOrderedSections();

    for (const section of sections) {
      const content = this.buildSection(section);
      if (content) {
        lines.push(content);
        lines.push(''); // Empty line between sections
        includedSections.push(section);
      }
    }

    // Add custom sections
    if (this.params.customSections) {
      for (const custom of this.params.customSections) {
        lines.push(`## ${custom.title}`);
        lines.push('');
        lines.push(custom.content);
        lines.push('');
      }
    }

    const prompt = lines.join('\n').trim();

    return {
      prompt,
      sections: includedSections,
      estimatedTokens: this.estimateTokens(prompt),
      timestamp: Date.now(),
    };
  }

  /**
   * Get sections ordered by priority
   */
  private getOrderedSections(): SystemPromptSection[] {
    return Array.from(this.enabledSections).sort(
      (a, b) => SECTION_PRIORITIES[b] - SECTION_PRIORITIES[a]
    );
  }

  /**
   * Build a single section
   */
  private buildSection(section: SystemPromptSection): string | null {
    switch (section) {
      case 'identity':
        return this.buildIdentitySection();
      case 'tooling':
        return this.buildToolingSection();
      case 'safety':
        return this.buildSafetySection();
      case 'skills':
        return this.buildSkillsSection();
      case 'memory':
        return this.buildMemorySection();
      case 'workspace':
        return this.buildWorkspaceSection();
      case 'docs':
        return this.buildDocsSection();
      case 'messaging':
        return this.buildMessagingSection();
      case 'projectContext':
        return this.buildProjectContextSection();
      case 'silentReplies':
        return this.buildSilentRepliesSection();
      case 'runtime':
        return this.buildRuntimeSection();
      default:
        return null;
    }
  }

  // ============================================================
  // Section Builders
  // ============================================================

  /**
   * Build Identity Section
   */
  private buildIdentitySection(): string {
    const lines: string[] = [];

    lines.push('# Identity');
    lines.push('');
    lines.push(this.params.customIdentity || DEFAULT_IDENTITY);

    return lines.join('\n');
  }

  /**
   * Build Tooling Section
   */
  private buildToolingSection(): string | null {
    const tools = this.params.tools;
    const summaries = this.params.toolSummaries;

    if ((!tools || tools.length === 0) && (!summaries || Object.keys(summaries).length === 0)) {
      return null;
    }

    const lines: string[] = [];

    lines.push('## Tooling');
    lines.push('');
    lines.push('You have access to the following tools:');
    lines.push('');

    // If tool summaries provided, use them
    if (summaries && Object.keys(summaries).length > 0) {
      for (const [name, description] of Object.entries(summaries)) {
        lines.push(`- **${name}**: ${description}`);
      }
    }
    // Otherwise, build from tools
    else if (tools) {
      // Group tools by category
      const byCategory = new Map<string, Tool[]>();
      for (const tool of tools) {
        const category = tool.category || 'other';
        if (!byCategory.has(category)) {
          byCategory.set(category, []);
        }
        byCategory.get(category)!.push(tool);
      }

      for (const [category, categoryTools] of byCategory) {
        lines.push(`### ${this.formatCategoryName(category)}`);
        lines.push('');
        for (const tool of categoryTools) {
          lines.push(`- **${tool.name}**: ${tool.description}`);
        }
        lines.push('');
      }
    }

    lines.push('');
    lines.push('### Tool Usage Guidelines');
    lines.push('');
    lines.push('- Use the most appropriate tool for each task');
    lines.push('- Provide clear parameters when calling tools');
    lines.push('- Handle tool errors gracefully and inform the user');
    lines.push('- Chain tools when necessary to accomplish complex tasks');
    lines.push('- Always check tool results before proceeding');

    return lines.join('\n');
  }

  /**
   * Build Safety Section
   */
  private buildSafetySection(): string {
    const lines: string[] = [];

    lines.push('## Safety & Ethics');
    lines.push('');

    // Group rules by priority
    const criticalRules = DEFAULT_SAFETY_RULES.filter((r) => r.priority === 'critical');
    const highRules = DEFAULT_SAFETY_RULES.filter((r) => r.priority === 'high');

    lines.push('### Critical Rules');
    lines.push('');
    for (const rule of criticalRules) {
      lines.push(`- ${rule.rule}`);
    }

    lines.push('');
    lines.push('### Important Guidelines');
    lines.push('');
    for (const rule of highRules) {
      lines.push(`- ${rule.rule}`);
    }

    // Add custom safety rules if provided
    if (this.params.customSafetyRules && this.params.customSafetyRules.length > 0) {
      lines.push('');
      lines.push('### Additional Rules');
      lines.push('');
      for (const rule of this.params.customSafetyRules) {
        lines.push(`- ${rule}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Build Skills Section
   */
  private buildSkillsSection(): string | null {
    const skills = this.params.skills;

    if (!skills || !skills.enabled || skills.skillNames.length === 0) {
      return null;
    }

    const lines: string[] = [];

    lines.push('## Skills');
    lines.push('');
    lines.push('Skills are specialized routines that handle specific tasks. Available skills:');
    lines.push('');

    for (const skillName of skills.skillNames) {
      const description = skills.skillDescriptions[skillName] || 'No description';
      lines.push(`- **/${skillName}**: ${description}`);
    }

    lines.push('');
    lines.push('### Skill Usage');
    lines.push('');
    lines.push('- Skills are triggered by commands starting with `/`');
    lines.push('- When a skill matches the user intent, execute it and report results');
    lines.push('- Skills may perform multiple tool calls in sequence');
    lines.push('- If a skill fails, explain the error and suggest alternatives');

    return lines.join('\n');
  }

  /**
   * Build Memory Section
   */
  private buildMemorySection(): string | null {
    const memory = this.params.memory;

    if (!memory || !memory.enabled) {
      return null;
    }

    const lines: string[] = [];

    lines.push('## Memory');
    lines.push('');
    lines.push('You have access to a memory system for persisting and retrieving information.');
    lines.push('');

    if (memory.relevantMemories && memory.relevantMemories.length > 0) {
      lines.push('### Relevant Memories');
      lines.push('');
      for (const mem of memory.relevantMemories) {
        lines.push(`> ${mem}`);
      }
      lines.push('');
    }

    lines.push('### Memory Guidelines');
    lines.push('');
    lines.push('- Store important information for future reference');
    lines.push('- Retrieve memories when context would be helpful');
    lines.push('- Update outdated memories with new information');
    lines.push('- Never store sensitive information in long-term memory');

    return lines.join('\n');
  }

  /**
   * Build Workspace Section
   */
  private buildWorkspaceSection(): string {
    const lines: string[] = [];

    lines.push('## Workspace');
    lines.push('');
    lines.push(`Your working directory is: \`${this.params.workspaceDir}\``);
    lines.push('');
    lines.push('- All relative paths are resolved from this directory');
    lines.push('- File operations will use this as the base path');
    lines.push('- Always use absolute paths when in doubt');

    return lines.join('\n');
  }

  /**
   * Build Docs Section
   */
  private buildDocsSection(): string | null {
    // Only include if there's a documentation path to reference
    const lines: string[] = [];

    lines.push('## Documentation');
    lines.push('');
    lines.push('For help with Anode ClawdBot features and APIs, refer to:');
    lines.push('');
    lines.push('- `/help` - Show available commands and features');
    lines.push('- Tool descriptions include usage examples');
    lines.push('- Check skill documentation for complex workflows');

    return lines.join('\n');
  }

  /**
   * Build Messaging Section
   */
  private buildMessagingSection(): string | null {
    const lines: string[] = [];

    lines.push('## Messaging');
    lines.push('');
    lines.push('You can communicate with users through various platforms:');
    lines.push('');
    lines.push('- Messages may arrive from Telegram, Discord, WeChat, etc.');
    lines.push('- Each platform has its own formatting capabilities');
    lines.push('- Keep responses appropriate for the current platform');
    lines.push('- Use markdown where supported');

    return lines.join('\n');
  }

  /**
   * Build Project Context Section
   */
  private buildProjectContextSection(): string | null {
    const contextFiles = this.params.contextFiles;

    if (!contextFiles || contextFiles.length === 0) {
      return null;
    }

    const lines: string[] = [];

    lines.push('## Project Context');
    lines.push('');
    lines.push('The following project files provide additional context:');
    lines.push('');

    for (const file of contextFiles) {
      lines.push(`### ${file.path}`);
      lines.push('');
      lines.push(file.content);
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Build Silent Replies Section
   */
  private buildSilentRepliesSection(): string {
    const lines: string[] = [];

    lines.push('## Response Guidelines');
    lines.push('');
    lines.push('When responding to users:');
    lines.push('');
    lines.push('- Be concise and direct');
    lines.push('- Use formatting (lists, code blocks) when helpful');
    lines.push('- If a task is complete, confirm it briefly');
    lines.push('- If additional actions are needed, explain clearly');
    lines.push('- For error conditions, provide actionable suggestions');

    return lines.join('\n');
  }

  /**
   * Build Runtime Section
   */
  private buildRuntimeSection(): string | null {
    const runtime = this.params.runtime;

    if (!runtime) {
      return null;
    }

    const lines: string[] = [];

    lines.push('## Runtime Environment');
    lines.push('');

    const info: string[] = [];
    info.push(`- **Agent**: ${runtime.agentName} v${runtime.agentVersion}`);
    info.push(`- **Platform**: ${runtime.platform}`);
    if (runtime.androidVersion) {
      info.push(`- **Android**: ${runtime.androidVersion}`);
    }
    if (runtime.deviceModel) {
      info.push(`- **Device**: ${runtime.deviceModel}`);
    }
    info.push(`- **Model**: ${runtime.model}`);
    info.push(`- **Time**: ${new Date(runtime.timestamp).toISOString()}`);
    if (runtime.sessionId) {
      info.push(`- **Session**: ${runtime.sessionId}`);
    }

    lines.push(...info);

    return lines.join('\n');
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Format category name for display
   */
  private formatCategoryName(category: string): string {
    return category
      .split(/[-_]/)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Rough token estimation (4 chars ≈ 1 token)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Enable a section
   */
  enableSection(section: SystemPromptSection): void {
    this.enabledSections.add(section);
  }

  /**
   * Disable a section
   */
  disableSection(section: SystemPromptSection): void {
    this.enabledSections.delete(section);
  }

  /**
   * Check if a section is enabled
   */
  isSectionEnabled(section: SystemPromptSection): boolean {
    return this.enabledSections.has(section);
  }

  /**
   * Update parameters
   */
  updateParams(params: Partial<SystemPromptParams>): void {
    this.params = { ...this.params, ...params };
  }
}

/**
 * Build a system prompt from parameters
 *
 * Convenience function for one-shot prompt building
 */
export function buildSystemPrompt(params: SystemPromptParams): BuiltSystemPrompt {
  const builder = new SystemPromptBuilder(params);
  return builder.build();
}

/**
 * Build a minimal system prompt (for quick interactions)
 */
export function buildMinimalPrompt(workspaceDir: string, identity?: string): string {
  return [
    identity || DEFAULT_IDENTITY,
    '',
    `Working directory: ${workspaceDir}`,
    '',
    'Be helpful, concise, and safe.',
  ].join('\n');
}

/**
 * Get default identity text
 */
export function getDefaultIdentity(): string {
  return DEFAULT_IDENTITY;
}

/**
 * Get default safety rules
 */
export function getDefaultSafetyRules(): SafetyRule[] {
  return [...DEFAULT_SAFETY_RULES];
}
