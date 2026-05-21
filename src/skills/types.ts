/**
 * Skills System - Types
 *
 * Progressive Disclosure Skills: Markdown-based skill instructions
 * that the AI loads on-demand via read_file.
 */

import { z } from 'zod';

/**
 * YAML frontmatter schema for SKILL.md files
 */
export const SkillFrontmatterSchema = z.object({
  name: z.string().min(1).max(64).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  description: z.string().min(1).max(1024),
  version: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

/**
 * Lightweight skill index entry (kept in memory)
 */
export interface SkillEntry {
  /** Skill name (lowercase + hyphens) */
  name: string;
  /** Short description for AI matching */
  description: string;
  /** Skill directory path (contains SKILL.md and optional subdirs) */
  dirPath: string;
  /** Full path to SKILL.md */
  skillFilePath: string;
  /** Where this skill came from */
  source: 'bundled' | 'workspace';
}

/**
 * Skills configuration
 */
export interface SkillsConfig {
  /** Enable/disable the skill system */
  enabled: boolean;
  /** Directory for bundled skills (shipped with app) */
  bundledDir: string;
  /** Directory for user/workspace skills (overrides bundled) */
  workspaceDir: string;
}
