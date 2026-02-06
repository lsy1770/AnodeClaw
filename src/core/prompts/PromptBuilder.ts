/**
 * Prompt Builder
 *
 * Dynamically builds system prompts from multiple sources
 */

import type {
  PromptConfig,
  PromptSection,
  PromptVariables,
  BuiltPrompt,
  PromptSource,
} from './types.js';
import { PromptLoader } from './PromptLoader.js';
import { logger } from '../../utils/logger.js';

/**
 * Prompt Builder Class
 */
export class PromptBuilder {
  private config: Required<PromptConfig>;
  private loader: PromptLoader;
  private sections: Map<PromptSource, PromptSection> = new Map();
  private reloadTimer?: NodeJS.Timeout;

  constructor(config: Partial<PromptConfig> = {}) {
    this.config = {
      identityFile: config.identityFile || './prompts/IDENTITY.md',
      soulFile: config.soulFile || './prompts/SOUL.md',
      agentsFile: config.agentsFile || './prompts/AGENTS.md',
      userFile: config.userFile || './prompts/USER.md',
      basePrompt: config.basePrompt || 'You are a helpful AI assistant.',
      enableHotReload: config.enableHotReload || false,
      reloadInterval: config.reloadInterval || 60000, // 1 minute default
    };

    this.loader = new PromptLoader();

    logger.info('[PromptBuilder] Initialized', this.config);
  }

  /**
   * Initialize and load all prompt sources
   */
  async initialize(): Promise<void> {
    logger.info('[PromptBuilder] Loading prompt sources...');

    // Load all configured prompt files
    const files = new Map<PromptSource, string>([
      ['identity', this.config.identityFile],
      ['soul', this.config.soulFile],
      ['agents', this.config.agentsFile],
      ['user', this.config.userFile],
    ]);

    const loaded = await this.loader.loadMultiple(files);

    // Create sections from loaded content
    const priorities: Record<PromptSource, number> = {
      soul: 100, // Highest priority - core personality
      identity: 90, // Identity and role
      agents: 80, // Agent capabilities
      user: 70, // User preferences
      context: 60, // Runtime context
    };

    for (const [source, content] of loaded.entries()) {
      this.sections.set(source, {
        source,
        content,
        priority: priorities[source],
        enabled: true,
      });
    }

    logger.info(
      `[PromptBuilder] Loaded ${this.sections.size} prompt sections`
    );

    // Start hot reload if enabled
    if (this.config.enableHotReload) {
      this.startHotReload();
    }
  }

  /**
   * Build final system prompt
   *
   * @param variables - Template variables to substitute
   * @param contextPrompt - Optional runtime context
   * @returns Built prompt
   */
  async buildPrompt(
    variables: PromptVariables = {},
    contextPrompt?: string
  ): Promise<BuiltPrompt> {
    // Add context section if provided
    if (contextPrompt) {
      this.sections.set('context', {
        source: 'context',
        content: contextPrompt,
        priority: 60,
        enabled: true,
      });
    }

    // Sort sections by priority (descending)
    const sortedSections = Array.from(this.sections.values())
      .filter((s) => s.enabled)
      .sort((a, b) => b.priority - a.priority);

    // Build full prompt
    const parts: string[] = [];

    // Add base prompt first
    parts.push(this.config.basePrompt);

    // Add all sections
    for (const section of sortedSections) {
      parts.push('');
      parts.push(`# ${this.getSourceTitle(section.source)}`);
      parts.push('');
      parts.push(this.substituteVariables(section.content, variables));
    }

    const fullPrompt = parts.join('\n');

    return {
      fullPrompt,
      sections: sortedSections,
      variables,
      timestamp: Date.now(),
    };
  }

  /**
   * Get title for a prompt source
   */
  private getSourceTitle(source: PromptSource): string {
    const titles: Record<PromptSource, string> = {
      identity: 'Identity & Role',
      soul: 'Core Personality',
      agents: 'Agent Capabilities',
      user: 'User Preferences',
      context: 'Current Context',
    };

    return titles[source] || source.toUpperCase();
  }

  /**
   * Substitute template variables in content
   *
   * @param content - Content with template variables
   * @param variables - Variables to substitute
   * @returns Content with variables substituted
   */
  private substituteVariables(content: string, variables: PromptVariables): string {
    let result = content;

    // Substitute {{variable}} patterns
    for (const [key, value] of Object.entries(variables)) {
      const pattern = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(pattern, String(value));
    }

    return result;
  }

  /**
   * Reload all prompt sources
   */
  async reload(): Promise<void> {
    logger.info('[PromptBuilder] Reloading prompt sources...');

    // Clear loader cache
    this.loader.clearCache();

    // Reload
    await this.initialize();
  }

  /**
   * Start hot reload timer
   */
  private startHotReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
    }

    this.reloadTimer = setInterval(async () => {
      try {
        await this.reload();
      } catch (error) {
        logger.error('[PromptBuilder] Hot reload failed:', error);
      }
    }, this.config.reloadInterval);

    logger.info(
      `[PromptBuilder] Hot reload enabled (interval: ${this.config.reloadInterval}ms)`
    );
  }

  /**
   * Stop hot reload
   */
  stopHotReload(): void {
    if (this.reloadTimer) {
      clearInterval(this.reloadTimer);
      this.reloadTimer = undefined;
      logger.info('[PromptBuilder] Hot reload stopped');
    }
  }

  /**
   * Enable/disable a prompt section
   */
  setSectionEnabled(source: PromptSource, enabled: boolean): void {
    const section = this.sections.get(source);
    if (section) {
      section.enabled = enabled;
      logger.info(
        `[PromptBuilder] Section '${source}' ${enabled ? 'enabled' : 'disabled'}`
      );
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PromptConfig> {
    return { ...this.config };
  }

  /**
   * Get all sections
   */
  getSections(): PromptSection[] {
    return Array.from(this.sections.values());
  }

  /**
   * Add or update a prompt section dynamically
   */
  addSection(source: string, content: string, priority: number): void {
    this.sections.set(source as any, {
      source: source as any,
      content,
      priority,
      enabled: true,
    });
    logger.info(`[PromptBuilder] Added dynamic section '${source}'`);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.stopHotReload();
    this.sections.clear();
    this.loader.clearCache();
    logger.info('[PromptBuilder] Destroyed');
  }
}
