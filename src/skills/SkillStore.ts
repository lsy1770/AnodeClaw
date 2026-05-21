/**
 * SkillStore - Progressive Disclosure Skill Index
 *
 * Scans skill directories, parses YAML frontmatter (name + description only),
 * and builds a lightweight index. The AI reads full SKILL.md content on-demand.
 */

import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../utils/logger.js';
import { SkillFrontmatterSchema } from './types.js';
import type { SkillEntry, SkillsConfig } from './types.js';

export class SkillStore {
  private entries: Map<string, SkillEntry> = new Map();
  private config: SkillsConfig;

  constructor(config: SkillsConfig) {
    this.config = config;
  }

  /**
   * Load skill indices from bundled and workspace directories.
   * Workspace skills override bundled skills with the same name.
   */
  async load(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('[SkillStore] Skills system disabled');
      return;
    }

    this.entries.clear();

    // 1. Load bundled skills
    const bundledDir = path.resolve(this.config.bundledDir);
    const bundled = await this.scanDirectory(bundledDir, 'bundled');
    for (const entry of bundled) {
      this.entries.set(entry.name, entry);
    }

    // 2. Load workspace skills (override bundled)
    const workspaceDir = path.resolve(this.config.workspaceDir);
    const workspace = await this.scanDirectory(workspaceDir, 'workspace');
    for (const entry of workspace) {
      if (this.entries.has(entry.name)) {
        logger.info(`[SkillStore] Workspace skill "${entry.name}" overrides bundled`);
      }
      this.entries.set(entry.name, entry);
    }

    logger.info(
      `[SkillStore] Loaded ${this.entries.size} skills ` +
      `(bundled: ${bundled.length}, workspace: ${workspace.length})`
    );
  }

  /**
   * Get all skill entries
   */
  getAll(): SkillEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Get a skill entry by name
   */
  get(name: string): SkillEntry | undefined {
    return this.entries.get(name);
  }

  /**
   * Get the number of loaded skills
   */
  get size(): number {
    return this.entries.size;
  }

  /**
   * Build the system prompt section for skill discovery.
   * Returns null if no skills are loaded.
   */
  buildPromptSection(): string | null {
    if (this.entries.size === 0) return null;

    const rows = this.getAll()
      .map(e => `| ${e.name} | ${e.skillFilePath} | ${e.description} |`)
      .join('\n');

    return [
      'Before responding, scan the skills below. If a skill clearly matches the user\'s request:',
      '1. Read its SKILL.md file using `read_file` tool',
      '2. Follow the instructions inside to complete the task',
      '3. If the skill references files in templates/, examples/, or references/ subdirectories, read those as needed',
      '',
      'If the user explicitly requests a skill by name, always load and follow it.',
      '',
      '| Skill | Path | Description |',
      '|-------|------|-------------|',
      rows,
    ].join('\n');
  }

  // --- Private ---

  /**
   * Scan a directory for skill subdirectories containing SKILL.md
   */
  private async scanDirectory(dir: string, source: SkillEntry['source']): Promise<SkillEntry[]> {
    const results: SkillEntry[] = [];

    try {
      await fs.access(dir);
    } catch {
      // Directory does not exist; that is fine.
      return results;
    }

    let dirNames: string[];
    try {
      dirNames = await fs.readdir(dir);
    } catch (err) {
      logger.warn(`[SkillStore] Failed to read directory ${dir}:`, err);
      return results;
    }

    for (const name of dirNames) {
      const skillDir = path.join(dir, name);

      // Check if it's a directory
      try {
        const stat = await fs.stat(skillDir);
        if (!stat.isDirectory()) continue;
      } catch {
        continue;
      }

      const skillFile = path.join(skillDir, 'SKILL.md');

      try {
        const content = await fs.readFile(skillFile, 'utf-8');
        const frontmatter = this.parseFrontmatter(content);

        if (frontmatter) {
          results.push({
            name: frontmatter.name,
            description: frontmatter.description,
            dirPath: skillDir,
            skillFilePath: skillFile,
            source,
          });
        } else {
          logger.warn(`[SkillStore] Invalid frontmatter in ${skillFile}`);
        }
      } catch {
        // No SKILL.md in this directory; skip silently.
      }
    }

    return results;
  }

  /**
   * Parse YAML frontmatter from a SKILL.md file.
   * Only extracts name + description; ignores the body.
   */
  private parseFrontmatter(content: string): { name: string; description: string } | null {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return null;

    try {
      const raw = yaml.load(match[1]);
      const parsed = SkillFrontmatterSchema.safeParse(raw);

      if (parsed.success) {
        return {
          name: parsed.data.name,
          description: parsed.data.description,
        };
      }

      logger.warn(`[SkillStore] Frontmatter validation failed: ${parsed.error.message}`);
      return null;
    } catch (err) {
      logger.warn('[SkillStore] YAML parse error:', err);
      return null;
    }
  }
}
