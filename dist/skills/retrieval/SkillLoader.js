import fs from 'fs/promises';
import path from 'path';
import yaml from 'js-yaml';
import { logger } from '../../utils/logger.js';
export class SkillLoader {
    static async loadSkillsFromDir(dir, source) {
        const skills = [];
        try {
            // Check if dir exists
            try {
                await fs.access(dir);
            }
            catch {
                return []; // Dir doesn't exist
            }
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const skillDir = path.join(dir, entry.name);
                    const skillFile = path.join(skillDir, 'SKILL.md');
                    try {
                        await fs.access(skillFile);
                        const content = await fs.readFile(skillFile, 'utf-8');
                        const parsed = this.parseSkillFile(content);
                        if (parsed) {
                            const name = parsed.metadata.name || entry.name;
                            if (name) {
                                skills.push({
                                    name,
                                    description: parsed.metadata.description || 'No description provided',
                                    location: skillFile,
                                    content: parsed.content,
                                    metadata: parsed.metadata,
                                    source
                                });
                            }
                        }
                    }
                    catch (e) {
                        // Not a skill directory or read error
                    }
                }
            }
        }
        catch (e) {
            logger.error(`[SkillLoader] Error loading from ${dir}:`, e);
        }
        return skills;
    }
    static parseSkillFile(fileContent) {
        // Match YAML frontmatter between --- and ---
        const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!match)
            return null;
        try {
            const metadata = yaml.load(match[1]);
            return {
                metadata: metadata,
                content: match[2].trim()
            };
        }
        catch (e) {
            logger.warn('[SkillLoader] YAML frontmatter parse error:', e);
            return null;
        }
    }
}
