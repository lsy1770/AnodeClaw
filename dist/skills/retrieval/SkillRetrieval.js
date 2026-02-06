import path from 'path';
import os from 'os';
import { SkillLoader } from './SkillLoader.js';
import { logger } from '../../utils/logger.js';
export class SkillRetrieval {
    constructor(config) {
        this.skills = new Map();
        this.config = config;
    }
    async refresh() {
        const { workspaceDir } = this.config;
        // Resolve directories
        // 2. Bundled - Assuming project root 'skills' or dist/skills
        // In dev: process.cwd()/skills
        const bundledDir = this.config.bundledSkillsDir || path.resolve(process.cwd(), 'skills');
        // 3. Managed (~/.config/openclaw/skills)
        const managedDir = this.config.managedSkillsDir || path.join(os.homedir(), '.config', 'openclaw', 'skills');
        // 4. Workspace
        const workspaceSkillsDir = path.join(workspaceDir, 'skills');
        logger.debug('[SkillRetrieval] Loading skills...');
        const bundled = await SkillLoader.loadSkillsFromDir(bundledDir, 'bundled');
        const managed = await SkillLoader.loadSkillsFromDir(managedDir, 'managed');
        const workspace = await SkillLoader.loadSkillsFromDir(workspaceSkillsDir, 'workspace');
        // Merge Strategy: Overwrite from source priority (Low to High)
        const merged = new Map();
        // 2. Bundled
        for (const skill of bundled)
            merged.set(skill.name, skill);
        // 3. Managed overrides Bundled
        for (const skill of managed)
            merged.set(skill.name, skill);
        // 4. Workspace overrides Managed
        for (const skill of workspace)
            merged.set(skill.name, skill);
        this.skills = merged;
        logger.info(`[SkillRetrieval] Loaded ${this.skills.size} skills (Bundled:${bundled.length}, Managed:${managed.length}, Workspace:${workspace.length})`);
    }
    /**
     * Get filtered skills based on eligibility
     */
    getAvailableSkills() {
        const platform = os.platform();
        return Array.from(this.skills.values()).filter(skill => this.isEligible(skill, platform));
    }
    /**
     * Build XML prompt section for skills
     */
    buildSkillsPrompt(readToolName = 'read_file') {
        const skills = this.getAvailableSkills();
        if (skills.length === 0)
            return '';
        let xml = '<available_skills>\n';
        for (const skill of skills) {
            // XML Escape description?
            const description = skill.description.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            xml += `  <skill>\n`;
            xml += `    <name>${skill.name}</name>\n`;
            xml += `    <description>${description}</description>\n`;
            xml += `    <location>${skill.location}</location>\n`;
            xml += `  </skill>\n`;
        }
        xml += '</available_skills>';
        return [
            "## Skills (mandatory)",
            "Before replying: scan <available_skills> <description> entries.",
            `- If exactly one skill clearly applies: read its SKILL.md at <location> with \`${readToolName}\`, then follow it.`,
            "- If multiple could apply: choose the most specific one, then read/follow it.",
            "- If none clearly apply: do not read any SKILL.md.",
            "Constraints: never read more than one skill up front; only read after selecting.",
            xml,
            ""
        ].join('\n');
    }
    isEligible(skill, platform) {
        const meta = skill.metadata.openclaw;
        if (!meta)
            return true; // No constraints usually implies allowed, or maybe disallowed? Assuming allowed.
        // 4. Always
        if (meta.always)
            return true;
        // 3. OS check
        if (meta.os && meta.os.length > 0) {
            const normalize = (p) => {
                if (p === 'win32')
                    return 'windows';
                if (p === 'darwin')
                    return 'macos';
                return p;
            };
            const normalizedPlatform = normalize(platform);
            const required = meta.os;
            // Check if current platform matches any required
            if (!required.includes(platform) && !required.includes(normalizedPlatform)) {
                return false;
            }
        }
        return true;
    }
}
