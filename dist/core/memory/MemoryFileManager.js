/**
 * Memory File Manager
 *
 * Manages markdown-format memory files with TF-IDF vector search.
 * Uses Anode global file API when available, falls back to Node.js fs.
 *
 * Supports multiple memory sources (following OpenClaw pattern):
 * - MEMORY.md: Main memory file at workspace root
 * - memory/*.md: Category-based memory files
 * - memory/daily/*.md: Daily log files (auto-generated)
 */
import { logger } from '../../utils/logger.js';
import { generateId } from '../../utils/id.js';
import { VectorIndex } from './VectorIndex.js';
/**
 * Memory File Manager Class
 */
export class MemoryFileManager {
    constructor(memoryDir) {
        this.memoryDir = memoryDir;
        /** Vector index for semantic search */
        this.vectorIndex = new VectorIndex();
        this.indexBuilt = false;
        // Derive workspace dir from memory dir (go up from ./data/memory to ./)
        this.workspaceDir = memoryDir.replace(/\/data\/memory$/, '').replace(/\\data\\memory$/, '') || '.';
    }
    /**
     * Ensure memory directory exists
     */
    async initialize() {
        await this.ensureDir();
        // Create MEMORY.md template if it doesn't exist
        await this.ensureMainMemoryFile();
        // Pre-build index during initialization
        await this.buildIndex();
    }
    async ensureDir() {
        try {
            if (typeof file !== 'undefined' && file.createDirectory) {
                logger.debug(`[Memory] Creating directory: ${this.memoryDir}`);
                await file.createDirectory(this.memoryDir);
                if (file.exists && !file.exists(this.memoryDir)) {
                    logger.warn(`[Memory] Directory check failed: ${this.memoryDir}. Attempting parent creation.`);
                    const parent = this.memoryDir.substring(0, this.memoryDir.lastIndexOf('/'));
                    if (parent && parent.length > 0) {
                        try {
                            await file.createDirectory(parent);
                            await file.createDirectory(this.memoryDir);
                        }
                        catch (err) {
                            logger.error('[Memory] Recursive creation failed:', err);
                        }
                    }
                }
            }
        }
        catch (e) {
            logger.error(`[Memory] ensureDir failed`, e);
        }
    }
    /**
     * Ensure MEMORY.md exists at workspace root
     * Creates a template file if it doesn't exist
     */
    async ensureMainMemoryFile() {
        const memoryPath = `${this.workspaceDir}/MEMORY.md`;
        try {
            if (!this.fileExists(memoryPath)) {
                const template = this.createMemoryTemplate();
                await this.writeFile(memoryPath, template);
                logger.info(`[Memory] Created MEMORY.md template at ${memoryPath}`);
            }
        }
        catch (err) {
            logger.warn(`[Memory] Failed to create MEMORY.md:`, err);
        }
    }
    /**
     * Create MEMORY.md template content
     */
    createMemoryTemplate() {
        const now = new Date().toISOString().slice(0, 10);
        return `# Long-Term Memory

> This file is automatically maintained by ClawdBot. You can also edit it manually.
> Last updated: ${now}

## User Preferences


## Important Decisions


## Project Context


## Key Information

`;
    }
    /**
     * Append an important memory to MEMORY.md
     * Called when saving high-importance memories
     */
    async appendToMainMemory(title, content) {
        const memoryPath = `${this.workspaceDir}/MEMORY.md`;
        try {
            let existing = '';
            if (this.fileExists(memoryPath)) {
                existing = await this.readFile(memoryPath);
            }
            else {
                existing = this.createMemoryTemplate();
            }
            // Append new memory under "Key Information" section
            const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const newEntry = `\n### ${title}\n*Added: ${timestamp}*\n\n${content}\n`;
            // Find "Key Information" section and append there
            const keyInfoIndex = existing.indexOf('## Key Information');
            if (keyInfoIndex !== -1) {
                const insertPos = existing.indexOf('\n', keyInfoIndex) + 1;
                existing = existing.slice(0, insertPos) + newEntry + existing.slice(insertPos);
            }
            else {
                // If section not found, append at end
                existing += newEntry;
            }
            // Update "Last updated" timestamp
            existing = existing.replace(/Last updated: \d{4}-\d{2}-\d{2}/, `Last updated: ${new Date().toISOString().slice(0, 10)}`);
            await this.writeFile(memoryPath, existing);
            logger.info(`[Memory] Appended to MEMORY.md: ${title}`);
            // Incrementally update the MEMORY_MAIN entry in the vector index
            // so new content is searchable without a full restart
            const indexText = `MEMORY Main Memory ${title} ${content} ${existing}`;
            this.vectorIndex.add('MEMORY_MAIN', indexText);
            logger.debug('[Memory] Updated MEMORY_MAIN in vector index');
        }
        catch (err) {
            logger.warn(`[Memory] Failed to append to MEMORY.md:`, err);
        }
    }
    /**
     * Build the vector index from all existing memory entries
     * Called lazily on first search if not already built.
     * @param force - Force rebuild even if already built
     */
    async buildIndex(force = false) {
        if (this.indexBuilt && !force)
            return;
        try {
            // Clear existing index if forcing rebuild
            if (force) {
                this.vectorIndex = new VectorIndex();
                this.indexBuilt = false;
            }
            const entries = await this.loadAllRaw();
            // Count sources for logging
            const sources = {
                main: 0,
                daily: 0,
                category: 0,
            };
            for (const entry of entries) {
                // Track source types
                if (entry.id === 'MEMORY_MAIN') {
                    sources.main++;
                }
                else if (entry.id.startsWith('daily_')) {
                    sources.daily++;
                }
                else {
                    sources.category++;
                }
                // Index title + content + tags for full semantic coverage
                const indexText = `${entry.title} ${entry.tags.join(' ')} ${entry.content}`;
                this.vectorIndex.add(entry.id, indexText);
            }
            this.indexBuilt = true;
            logger.info(`[Memory] Vector index built with ${this.vectorIndex.size} documents (main: ${sources.main}, daily: ${sources.daily}, category: ${sources.category})`);
        }
        catch (error) {
            logger.error('[Memory] Failed to build vector index:', error);
        }
    }
    /**
     * Invalidate the index to force rebuild on next search
     */
    invalidateIndex() {
        this.indexBuilt = false;
        logger.debug('[Memory] Index invalidated, will rebuild on next search');
    }
    /**
     * Save a memory entry
     */
    async save(entry) {
        try {
            await this.ensureDir();
            const filePath = `${this.memoryDir}/${entry.id}.md`;
            // Convert to markdown format
            const content = this.entryToMarkdown(entry);
            await this.writeFile(filePath, content);
            // Update vector index
            const indexText = `${entry.title} ${entry.tags.join(' ')} ${entry.content}`;
            this.vectorIndex.add(entry.id, indexText);
            logger.info(`[Memory] Saved entry: ${entry.title}`);
        }
        catch (error) {
            logger.error(`[Memory] Failed to save entry:`, error);
            throw error;
        }
    }
    /**
     * Load a memory entry by ID
     */
    async load(id) {
        try {
            const filePath = `${this.memoryDir}/${id}.md`;
            const exists = this.fileExists(filePath);
            if (!exists) {
                return null;
            }
            const content = await this.readFile(filePath);
            const entry = this.markdownToEntry(id, content);
            // Update last accessed time
            entry.lastAccessed = Date.now();
            await this.save(entry);
            return entry;
        }
        catch (error) {
            logger.error(`[Memory] Failed to load entry ${id}:`, error);
            return null;
        }
    }
    /**
     * Load all memory entries (without updating lastAccessed)
     * Scans all memory sources: MEMORY.md, memory/*.md, memory/daily/*.md
     */
    async loadAllRaw() {
        const entries = [];
        try {
            await this.ensureDir();
            // 1. Load MEMORY.md from workspace root
            const mainMemoryEntries = await this.loadMainMemoryFile();
            entries.push(...mainMemoryEntries);
            // 2. Recursively scan memory directory
            const memoryDirEntries = await this.scanDirectoryRecursive(this.memoryDir);
            entries.push(...memoryDirEntries);
            logger.debug(`[Memory] Loaded ${entries.length} entries from all sources`);
        }
        catch (error) {
            logger.error(`[Memory] Failed to load entries:`, error);
        }
        return entries;
    }
    /**
     * Load MEMORY.md main file from workspace root
     */
    async loadMainMemoryFile() {
        const entries = [];
        // Try MEMORY.md first, then memory.md as fallback
        const mainPaths = [
            `${this.workspaceDir}/MEMORY.md`,
            `${this.workspaceDir}/memory.md`,
        ];
        for (const mainPath of mainPaths) {
            if (this.fileExists(mainPath)) {
                try {
                    const content = await this.readFile(mainPath);
                    const entry = this.parseMainMemoryFile(mainPath, content);
                    if (entry) {
                        entries.push(entry);
                        logger.debug(`[Memory] Loaded main memory file: ${mainPath}`);
                    }
                    break; // Only load one main file
                }
                catch (err) {
                    logger.warn(`[Memory] Failed to parse main memory file ${mainPath}:`, err);
                }
            }
        }
        return entries;
    }
    /**
     * Parse MEMORY.md main file into a single memory entry
     */
    parseMainMemoryFile(filePath, content) {
        if (!content.trim())
            return null;
        // Extract title from first heading or use default
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const title = titleMatch ? titleMatch[1] : 'Main Memory';
        return {
            id: 'MEMORY_MAIN',
            title,
            content,
            tags: ['main', 'persistent'],
            timestamp: Date.now(),
            importance: 'high',
        };
    }
    /**
     * Recursively scan a directory for .md files
     */
    async scanDirectoryRecursive(dirPath) {
        const entries = [];
        try {
            if (typeof file === 'undefined' || !file.listFiles) {
                return entries;
            }
            const items = await file.listFiles(dirPath);
            logger.debug(`[Memory] Scanning ${dirPath}: found ${items.length} items`);
            for (const item of items) {
                // Debug: log the actual item properties
                // Note: isDirectory might be a function in Anode API (runtime behavior differs from type declaration)
                const isDir = typeof item.isDirectory === 'function'
                    ? item.isDirectory()
                    : item.isDirectory;
                logger.debug(`[Memory] Item: name="${item.name}", isDirectory=${isDir}, ext="${item.extension}"`);
                // Construct proper path (don't trust item.path which may have wrong format)
                const itemPath = `${dirPath}/${item.name}`;
                // Check for .md files FIRST (files can't be directories)
                if (item.name.endsWith('.md')) {
                    try {
                        const content = await this.readFile(itemPath);
                        const isDailyLog = this.isDailyLogFile(item.name, dirPath);
                        logger.debug(`[Memory] Reading file: ${itemPath}, isDailyLog=${isDailyLog}`);
                        if (isDailyLog) {
                            // Parse as daily log format
                            const dailyEntries = this.parseDailyLogFile(itemPath, item.name, content);
                            logger.debug(`[Memory] Parsed daily log ${item.name}: ${dailyEntries.length} entries`);
                            entries.push(...dailyEntries);
                        }
                        else {
                            // Parse as regular memory entry
                            const id = item.name.replace('.md', '');
                            const entry = this.markdownToEntry(id, content);
                            entries.push(entry);
                        }
                    }
                    catch (err) {
                        logger.debug(`[Memory] Skipping unparseable file: ${itemPath}`, err);
                    }
                }
                else if (isDir) {
                    // Recursively scan subdirectories (only if not a .md file)
                    try {
                        const subEntries = await this.scanDirectoryRecursive(itemPath);
                        entries.push(...subEntries);
                    }
                    catch (err) {
                        logger.debug(`[Memory] Error scanning subdirectory ${itemPath}:`, err);
                    }
                }
            }
        }
        catch (error) {
            logger.debug(`[Memory] Error scanning directory ${dirPath}:`, error);
        }
        return entries;
    }
    /**
     * Check if a file is a daily log file
     */
    isDailyLogFile(fileName, dirPath) {
        // Check if in daily/ subdirectory
        if (dirPath.endsWith('/daily') || dirPath.endsWith('\\daily')) {
            return true;
        }
        // Check if filename matches YYYY-MM-DD pattern
        return /^\d{4}-\d{2}-\d{2}(-.+)?\.md$/.test(fileName);
    }
    /**
     * Parse daily log file into memory entries
     * Daily logs have a different format with sections like Sessions, Tasks, Insights
     */
    parseDailyLogFile(filePath, fileName, content) {
        const entries = [];
        // Extract date from filename
        const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : new Date().toISOString().slice(0, 10);
        // Parse sections
        const sections = this.parseDailyLogSections(content);
        // Create a combined entry for the entire daily log
        const combinedContent = this.formatDailyLogForSearch(date, sections);
        if (combinedContent.trim()) {
            entries.push({
                id: `daily_${date}`,
                title: `Daily Log - ${date}`,
                content: combinedContent,
                tags: ['daily', 'log', date],
                timestamp: new Date(date).getTime(),
                importance: 'medium',
            });
        }
        // Also create individual entries for sessions if they exist
        for (const session of sections.sessions) {
            entries.push({
                id: `daily_${date}_session_${session.id}`,
                title: `Session ${session.id} - ${date}`,
                content: `Time: ${session.timeRange}\nSummary: ${session.summary}\nResult: ${session.result}`,
                tags: ['daily', 'session', date],
                timestamp: new Date(date).getTime(),
                importance: 'low',
            });
        }
        return entries;
    }
    /**
     * Parse sections from daily log content
     */
    parseDailyLogSections(content) {
        const sections = {
            sessions: [],
            tasksCompleted: [],
            tasksPending: [],
            insights: [],
            errors: [],
        };
        const lines = content.split('\n');
        let currentSection = '';
        for (const line of lines) {
            const trimmed = line.trim();
            // Detect section headers
            if (trimmed.startsWith('## Sessions')) {
                currentSection = 'sessions';
                continue;
            }
            if (trimmed.startsWith('## Tasks Completed')) {
                currentSection = 'tasksCompleted';
                continue;
            }
            if (trimmed.startsWith('## Tasks Pending')) {
                currentSection = 'tasksPending';
                continue;
            }
            if (trimmed.startsWith('## Insights')) {
                currentSection = 'insights';
                continue;
            }
            if (trimmed.startsWith('## Errors') || trimmed.startsWith('## Warnings')) {
                currentSection = 'errors';
                continue;
            }
            if (trimmed.startsWith('## Conversation Summary')) {
                currentSection = 'conversation';
                continue;
            }
            if (trimmed.startsWith('# ')) {
                currentSection = '';
                continue;
            }
            // Skip empty lines and "(none)" markers
            if (!trimmed || trimmed === '- (none)')
                continue;
            // Parse list items
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                const item = trimmed.slice(2).trim();
                switch (currentSection) {
                    case 'sessions': {
                        // Parse session line: **HH:MM** Session <id>: <summary>
                        const sessionMatch = item.match(/^\*\*(.+?)\*\*\s+Session\s+(\S+):\s+(.+)$/);
                        if (sessionMatch) {
                            sections.sessions.push({
                                timeRange: sessionMatch[1],
                                id: sessionMatch[2],
                                summary: sessionMatch[3],
                                result: 'success',
                            });
                        }
                        break;
                    }
                    case 'tasksCompleted':
                        sections.tasksCompleted.push(item);
                        break;
                    case 'tasksPending':
                        sections.tasksPending.push(item);
                        break;
                    case 'insights':
                        sections.insights.push(item);
                        break;
                    case 'errors':
                        sections.errors.push(item);
                        break;
                }
            }
            // Handle conversation content (raw lines)
            if (currentSection === 'conversation' && trimmed) {
                sections.insights.push(trimmed);
            }
        }
        return sections;
    }
    /**
     * Format daily log sections for search indexing
     */
    formatDailyLogForSearch(date, sections) {
        const parts = [];
        if (sections.sessions.length > 0) {
            parts.push('Sessions:');
            for (const s of sections.sessions) {
                parts.push(`- ${s.timeRange} ${s.summary} (${s.result})`);
            }
        }
        if (sections.tasksCompleted.length > 0) {
            parts.push('Completed Tasks: ' + sections.tasksCompleted.join(', '));
        }
        if (sections.tasksPending.length > 0) {
            parts.push('Pending Tasks: ' + sections.tasksPending.join(', '));
        }
        if (sections.insights.length > 0) {
            parts.push('Insights/Conversation: ' + sections.insights.join(' '));
        }
        if (sections.errors.length > 0) {
            parts.push('Errors: ' + sections.errors.join(', '));
        }
        return parts.join('\n');
    }
    /**
     * Load all memory entries
     */
    async loadAll() {
        return this.loadAllRaw();
    }
    /**
     * Delete a memory entry
     */
    async delete(id) {
        try {
            const filePath = `${this.memoryDir}/${id}.md`;
            const exists = this.fileExists(filePath);
            if (exists) {
                await this.deleteFile(filePath);
                this.vectorIndex.remove(id);
                logger.info(`[Memory] Deleted entry: ${id}`);
                return true;
            }
            return false;
        }
        catch (error) {
            logger.error(`[Memory] Failed to delete entry ${id}:`, error);
            return false;
        }
    }
    /**
     * Search memory entries using combined keyword + vector similarity scoring
     */
    async search(query) {
        // Ensure vector index is built
        await this.buildIndex();
        const entries = await this.loadAllRaw();
        const entryMap = new Map(entries.map(e => [e.id, e]));
        const results = [];
        // Vector search scores (if keywords provided)
        const vectorScores = new Map();
        if (query.keywords && query.keywords.length > 0) {
            const queryText = query.keywords.join(' ');
            const vectorResults = this.vectorIndex.search(queryText, entries.length, 0.001);
            for (const vr of vectorResults) {
                vectorScores.set(vr.id, vr.score);
            }
        }
        for (const entry of entries) {
            let score = 0;
            const matchedFields = [];
            // Keyword matching (exact substring)
            if (query.keywords && query.keywords.length > 0) {
                for (const keyword of query.keywords) {
                    const lowerKeyword = keyword.toLowerCase();
                    if (entry.title.toLowerCase().includes(lowerKeyword)) {
                        score += 10;
                        matchedFields.push('title');
                    }
                    if (entry.content.toLowerCase().includes(lowerKeyword)) {
                        score += 5;
                        matchedFields.push('content');
                    }
                }
                // Add vector similarity score (scaled to 0-20 range)
                const vs = vectorScores.get(entry.id);
                if (vs) {
                    score += vs * 20;
                    if (!matchedFields.includes('semantic')) {
                        matchedFields.push('semantic');
                    }
                }
            }
            // Tag matching
            if (query.tags && query.tags.length > 0) {
                for (const tag of query.tags) {
                    if (entry.tags.includes(tag)) {
                        score += 15;
                        matchedFields.push('tags');
                    }
                }
            }
            // Time range filtering
            if (query.timeRange) {
                if (entry.timestamp >= query.timeRange.start &&
                    entry.timestamp <= query.timeRange.end) {
                    score += 2;
                }
                else {
                    continue; // Skip if outside time range
                }
            }
            // Importance filtering
            if (query.importance && entry.importance !== query.importance) {
                continue; // Skip if doesn't match importance
            }
            // Importance boost
            if (entry.importance === 'high')
                score *= 1.3;
            else if (entry.importance === 'low')
                score *= 0.8;
            if (score > 0) {
                results.push({ entry, score, matchedFields: [...new Set(matchedFields)] });
            }
        }
        // Sort by score (descending)
        results.sort((a, b) => b.score - a.score);
        // Apply limit
        if (query.limit && query.limit > 0) {
            return results.slice(0, query.limit);
        }
        return results;
    }
    /**
     * Semantic search using vector similarity only
     *
     * @param queryText - Natural language search query
     * @param limit - Maximum results (default 10)
     * @returns Search results ranked by semantic similarity
     */
    async semanticSearch(queryText, limit = 10) {
        await this.buildIndex();
        const vectorResults = this.vectorIndex.search(queryText, limit);
        const results = [];
        for (const vr of vectorResults) {
            const entry = await this.loadEntryRaw(vr.id);
            if (entry) {
                results.push({
                    entry,
                    score: vr.score,
                    matchedFields: ['semantic'],
                });
            }
        }
        return results;
    }
    /**
     * Load a single entry without updating lastAccessed
     */
    async loadEntryRaw(id) {
        try {
            const filePath = `${this.memoryDir}/${id}.md`;
            const exists = this.fileExists(filePath);
            if (!exists)
                return null;
            const content = await this.readFile(filePath);
            return this.markdownToEntry(id, content);
        }
        catch {
            return null;
        }
    }
    /**
     * Create a new memory entry
     */
    createEntry(title, content, options) {
        return {
            id: generateId(),
            title,
            content,
            tags: options?.tags || [],
            timestamp: Date.now(),
            importance: options?.importance || 'medium',
        };
    }
    /**
     * Convert entry to markdown
     */
    entryToMarkdown(entry) {
        const lines = [];
        lines.push(`# ${entry.title}`);
        lines.push('');
        lines.push(`**ID**: ${entry.id}`);
        lines.push(`**Created**: ${new Date(entry.timestamp).toISOString()}`);
        if (entry.lastAccessed) {
            lines.push(`**Last Accessed**: ${new Date(entry.lastAccessed).toISOString()}`);
        }
        lines.push(`**Importance**: ${entry.importance}`);
        lines.push(`**Tags**: ${entry.tags.join(', ')}`);
        lines.push('');
        lines.push('---');
        lines.push('');
        lines.push(entry.content);
        return lines.join('\n');
    }
    /**
     * Convert markdown to entry
     */
    markdownToEntry(id, markdown) {
        const lines = markdown.split('\n');
        let title = '';
        let timestamp = Date.now();
        let lastAccessed;
        let importance = 'medium';
        let tags = [];
        let contentStart = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('# ')) {
                title = line.substring(2).trim();
            }
            else if (line.startsWith('**Created**:')) {
                const dateStr = line.split(':').slice(1).join(':').trim();
                timestamp = new Date(dateStr).getTime();
            }
            else if (line.startsWith('**Last Accessed**:')) {
                const dateStr = line.split(':').slice(1).join(':').trim();
                lastAccessed = new Date(dateStr).getTime();
            }
            else if (line.startsWith('**Importance**:')) {
                importance = line.split(':')[1].trim();
            }
            else if (line.startsWith('**Tags**:')) {
                const tagsStr = line.split(':')[1].trim();
                tags = tagsStr ? tagsStr.split(',').map(t => t.trim()) : [];
            }
            else if (line === '---') {
                contentStart = i + 1;
                break;
            }
        }
        const content = lines.slice(contentStart).join('\n').trim();
        return {
            id,
            title,
            content,
            tags,
            timestamp,
            lastAccessed,
            importance,
        };
    }
    /**
     * Get statistics
     */
    async getStats() {
        const entries = await this.loadAllRaw();
        if (entries.length === 0) {
            return {
                totalEntries: 0,
                oldestEntry: 0,
                newestEntry: 0,
                storageSize: 0,
            };
        }
        const timestamps = entries.map(e => e.timestamp);
        // Estimate storage size from entry content lengths
        let storageSize = 0;
        for (const entry of entries) {
            storageSize += this.entryToMarkdown(entry).length;
        }
        return {
            totalEntries: entries.length,
            oldestEntry: Math.min(...timestamps),
            newestEntry: Math.max(...timestamps),
            storageSize,
        };
    }
    // ==========================================
    // File system abstraction layer
    // Uses Anode global file API (FileAPI.kt)
    // ==========================================
    async readFile(path) {
        if (typeof file !== 'undefined' && file.readText) {
            return file.readText(path, 'UTF-8');
        }
        throw new Error('Anode file API not available');
    }
    async writeFile(path, content) {
        logger.debug(`[Memory] Writing to file: ${path} (length: ${content.length})`);
        if (typeof file !== 'undefined' && file.writeText) {
            try {
                const result = await file.writeText(path, content, 'UTF-8');
                logger.debug(`[Memory] writeText result for ${path}: ${result}`);
                if (!result) {
                    throw new Error(`Write operation returned false for ${path}`);
                }
                return;
            }
            catch (e) {
                logger.error(`[Memory] Failed to write text to ${path}:`, e);
                throw e;
            }
        }
        throw new Error('Anode file API not available');
    }
    fileExists(path) {
        if (typeof file !== 'undefined' && file.exists) {
            return file.exists(path);
        }
        return false;
    }
    async deleteFile(path) {
        if (typeof file !== 'undefined' && file.delete) {
            await file.delete(path);
            return;
        }
        throw new Error('Anode file API not available');
    }
    async listDir(dirPath) {
        logger.debug(`[Memory] Listing files in directory: ${dirPath}`);
        if (typeof file !== 'undefined' && file.listFiles) {
            try {
                const entries = await file.listFiles(dirPath);
                logger.debug(`[Memory] Found ${entries.length} files in ${dirPath}: ${entries.map(e => e.name).join(', ')}`);
                return entries.map(e => e.name);
            }
            catch (error) {
                logger.error(`[Memory] Failed to list directory ${dirPath}:`, error);
                throw error;
            }
        }
        throw new Error('Anode file API not available');
    }
}
