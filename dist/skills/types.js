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
