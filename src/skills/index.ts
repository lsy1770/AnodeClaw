/**
 * Skills System - Progressive Disclosure
 *
 * Skills are Markdown instruction files that the AI loads on-demand.
 * Only name + description are kept in memory; full content is read when needed.
 */

export { SkillStore } from './SkillStore.js';
export { SkillFrontmatterSchema } from './types.js';
export type { SkillEntry, SkillFrontmatter, SkillsConfig } from './types.js';
