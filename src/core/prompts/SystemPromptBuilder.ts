/**
 * System Prompt Builder
 *
 * Builds lean system prompts. Tool definitions are already sent to the model
 * via the API `tools` parameter — do NOT repeat them here.
 *
 * Sections (lean):
 * 1. identity    - Who the agent is
 * 2. safety      - Critical behavioral rules
 * 3. tooling     - Behavioral hints only (no tool list, no examples)
 * 4. skills      - Available slash-command skills
 * 5. memory      - Memory & checkpoint guidance
 * 6. projectContext - Embedded context files (AGENTS.md, etc.)
 * 7. workspace   - Working directory
 * 8. runtime     - Device/session info
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

const DEFAULT_IDENTITY = `You are Anode ClawdBot, an AI assistant running on Android via the Anode platform.
You help users automate tasks, interact with their device, and provide intelligent assistance.
Be helpful, concise, and respectful of the user's device and privacy.`;

const DEFAULT_SAFETY_RULES: SafetyRule[] = [
  { category: 'autonomy', rule: 'Only act on the user\'s current request — no independent goals.', priority: 'critical' },
  { category: 'oversight', rule: 'Prioritize safety and human oversight. When unsure, ask.', priority: 'critical' },
  { category: 'privacy', rule: 'Never store or transmit sensitive data without explicit consent.', priority: 'critical' },
  { category: 'harmful', rule: 'Refuse harmful, illegal, or unethical requests.', priority: 'critical' },
  { category: 'transparency', rule: 'Be honest about capabilities and limitations.', priority: 'high' },
  { category: 'security', rule: 'Validate inputs and never execute untrusted code.', priority: 'high' },
];

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

export class SystemPromptBuilder {
  private params: SystemPromptParams;
  private enabledSections: Set<SystemPromptSection>;

  constructor(params: SystemPromptParams) {
    this.params = params;
    this.enabledSections = new Set(
      params.enabledSections || ['identity', 'safety', 'tooling', 'memory', 'workspace', 'projectContext', 'runtime']
    );
  }

  build(): BuiltSystemPrompt {
    const lines: string[] = [];
    const includedSections: SystemPromptSection[] = [];

    for (const section of this.getOrderedSections()) {
      const content = this.buildSection(section);
      if (content) {
        lines.push(content, '');
        includedSections.push(section);
      }
    }

    if (this.params.customSections) {
      for (const custom of this.params.customSections) {
        lines.push(`## ${custom.title}`, '', custom.content, '');
      }
    }

    const prompt = lines.join('\n').trim();
    return {
      prompt,
      sections: includedSections,
      estimatedTokens: Math.ceil(prompt.length / 4),
      timestamp: Date.now(),
    };
  }

  private getOrderedSections(): SystemPromptSection[] {
    return Array.from(this.enabledSections).sort(
      (a, b) => SECTION_PRIORITIES[b] - SECTION_PRIORITIES[a]
    );
  }

  private buildSection(section: SystemPromptSection): string | null {
    switch (section) {
      case 'identity':      return this.buildIdentitySection();
      case 'safety':        return this.buildSafetySection();
      case 'tooling':       return this.buildToolingSection();
      case 'skills':        return this.buildSkillsSection();
      case 'memory':        return this.buildMemorySection();
      case 'workspace':     return this.buildWorkspaceSection();
      case 'projectContext':return this.buildProjectContextSection();
      case 'runtime':       return this.buildRuntimeSection();
      // Removed: docs, messaging, silentReplies (unused for Android local agent)
      default:              return null;
    }
  }

  private buildIdentitySection(): string {
    return `# Identity\n\n${this.params.customIdentity || DEFAULT_IDENTITY}`;
  }

  private buildSafetySection(): string {
    const rules = DEFAULT_SAFETY_RULES;
    const critical = rules.filter(r => r.priority === 'critical').map(r => `- ${r.rule}`).join('\n');
    const high = rules.filter(r => r.priority === 'high').map(r => `- ${r.rule}`).join('\n');
    const custom = this.params.customSafetyRules?.length
      ? '\n\n### Additional Rules\n\n' + this.params.customSafetyRules.map(r => `- ${r}`).join('\n')
      : '';
    return `## Safety\n\n${critical}\n\n### Guidelines\n\n${high}${custom}`;
  }

  /**
   * Tooling: behavioral hints only.
   * Tool definitions (names, params, descriptions) are already sent via API tools parameter.
   */
  private buildToolingSection(): string | null {
    return `## Tool Usage

- Prefer parallel tool calls for independent operations
- Check tool results before proceeding to the next step
- On tool failure, report the error and try an alternative approach
- Use \`code_exec_async\` to access Anode globals (auto, device, file, net, etc.)
- Use sub-agents (\`create_subagent\` / \`delegate_subagent_task\`) only for genuinely parallel or specialized workloads`;
  }

  private buildSkillsSection(): string | null {
    const skills = this.params.skills;
    if (!skills?.enabled || skills.skillNames.length === 0) return null;

    const list = skills.skillNames
      .map(name => `- **/${name}**: ${skills.skillDescriptions[name] || ''}`)
      .join('\n');
    return `## Skills\n\nTrigger with \`/command\`:\n\n${list}`;
  }

  private buildMemorySection(): string | null {
    const memory = this.params.memory;
    if (!memory?.enabled) return null;

    const relevant = memory.relevantMemories?.length
      ? '\n\n### Recalled\n\n' + memory.relevantMemories.map(m => `> ${m}`).join('\n')
      : '';

    return `## Memory & Checkpoints${relevant}

### Rules
- Call \`context_checkpoint\` at task start and every ~10 tool calls on long tasks
- If context seems truncated, call \`memory_search\` with "checkpoint task-state" to recover
- Save user preferences and critical facts via \`memory_save\` (importance: high)
- Never persist sensitive data (passwords, tokens, PII)`;
  }

  private buildWorkspaceSection(): string {
    return `## Workspace\n\nWorking directory: \`${this.params.workspaceDir}\``;
  }

  private buildProjectContextSection(): string | null {
    const files = this.params.contextFiles;
    if (!files?.length) return null;

    const sections = files.map(f => `### ${f.path}\n\n${f.content}`).join('\n\n');
    return `## Project Context\n\n${sections}`;
  }

  private buildRuntimeSection(): string | null {
    const r = this.params.runtime;
    if (!r) return null;

    const info = [
      `- Agent: ${r.agentName} v${r.agentVersion}`,
      `- Platform: ${r.platform}`,
      r.androidVersion ? `- Android: ${r.androidVersion}` : null,
      r.deviceModel   ? `- Device: ${r.deviceModel}` : null,
      `- Model: ${r.model}`,
      `- Time: ${new Date(r.timestamp).toISOString()}`,
      r.sessionId     ? `- Session: ${r.sessionId}` : null,
    ].filter(Boolean).join('\n');

    return `## Runtime\n\n${info}`;
  }

  // Public API
  enableSection(section: SystemPromptSection): void  { this.enabledSections.add(section); }
  disableSection(section: SystemPromptSection): void { this.enabledSections.delete(section); }
  isSectionEnabled(section: SystemPromptSection): boolean { return this.enabledSections.has(section); }
  updateParams(params: Partial<SystemPromptParams>): void { this.params = { ...this.params, ...params }; }
}

export function buildSystemPrompt(params: SystemPromptParams): BuiltSystemPrompt {
  return new SystemPromptBuilder(params).build();
}

export function buildMinimalPrompt(workspaceDir: string, identity?: string): string {
  return [identity || DEFAULT_IDENTITY, '', `Working directory: ${workspaceDir}`].join('\n');
}

export function getDefaultIdentity(): string { return DEFAULT_IDENTITY; }
export function getDefaultSafetyRules(): SafetyRule[] { return [...DEFAULT_SAFETY_RULES]; }
