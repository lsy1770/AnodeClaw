/**
 * JSONL Storage
 *
 * Stores session logs in JSONL format (one JSON object per line).
 * Uses Anode global file API when available, falls back to Node.js fs.
 */
import { logger } from '../../utils/logger.js';
/**
 * JSONL Storage Class
 */
export class JSONLStorage {
    constructor(filePath) {
        this.filePath = filePath;
    }
    /**
     * Append a log entry
     */
    async append(entry) {
        try {
            const line = JSON.stringify(entry) + '\n';
            // Ensure directory exists on first write
            const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'));
            if (dir) {
                try {
                    await this.ensureDir(dir);
                }
                catch (dirError) {
                    logger.warn(`[JSONL] ensureDir failed for ${dir}:`, dirError);
                }
            }
            // Use appendText for efficient append (creates file if it doesn't exist)
            await this.appendFile(this.filePath, line);
            logger.debug(`[JSONL] Appended entry to ${this.filePath}`);
        }
        catch (error) {
            // Try to extract cause from Java FileAPIException
            const cause = error?.cause;
            logger.error(`[JSONL] Failed to append to ${this.filePath}:`, error, cause ? `cause: ${cause}` : '');
            throw error;
        }
    }
    /**
     * Read all entries
     */
    async readAll() {
        try {
            const exists = this.fileExists(this.filePath);
            if (!exists) {
                return [];
            }
            const content = await this.readFile(this.filePath);
            const lines = content.trim().split('\n');
            const entries = [];
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        entries.push(JSON.parse(line));
                    }
                    catch (error) {
                        logger.warn(`[JSONL] Failed to parse line: ${line}`);
                    }
                }
            }
            return entries;
        }
        catch (error) {
            logger.error(`[JSONL] Failed to read all entries:`, error);
            throw error;
        }
    }
    /**
     * Read recent N entries
     */
    async readRecent(count) {
        const all = await this.readAll();
        return all.slice(-count);
    }
    /**
     * Read entries by time range
     */
    async readByTimeRange(startTime, endTime) {
        const all = await this.readAll();
        return all.filter(entry => entry.timestamp >= startTime && entry.timestamp <= endTime);
    }
    /**
     * Compress old entries (summarize and remove)
     */
    async compressOldEntries(beforeTime, summary) {
        try {
            const all = await this.readAll();
            const kept = all.filter(entry => entry.timestamp >= beforeTime);
            // Add summary entry
            const summaryEntry = {
                timestamp: beforeTime,
                role: 'system',
                content: `[Compressed History Summary]\n${summary}`,
                metadata: { compressed: true },
            };
            kept.unshift(summaryEntry);
            // Rewrite file
            const content = kept.map(entry => JSON.stringify(entry)).join('\n') + '\n';
            await this.writeFile(this.filePath, content);
            logger.info(`[JSONL] Compressed ${all.length - kept.length} old entries`);
        }
        catch (error) {
            logger.error(`[JSONL] Failed to compress entries:`, error);
            throw error;
        }
    }
    /**
     * Get total entry count
     */
    async getCount() {
        const all = await this.readAll();
        return all.length;
    }
    /**
     * Clear all entries
     */
    async clear() {
        try {
            await this.writeFile(this.filePath, '');
            logger.info(`[JSONL] Cleared all entries`);
        }
        catch (error) {
            logger.error(`[JSONL] Failed to clear entries:`, error);
            throw error;
        }
    }
    /**
     * Check if storage exists
     */
    async exists() {
        return this.fileExists(this.filePath);
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
        if (typeof file !== 'undefined' && file.writeText) {
            await file.writeText(path, content, 'UTF-8');
            return;
        }
        throw new Error('Anode file API not available');
    }
    async appendFile(path, content) {
        if (typeof file !== 'undefined' && file.appendText) {
            await file.appendText(path, content, 'UTF-8');
            return;
        }
        throw new Error('Anode file API not available');
    }
    fileExists(path) {
        if (typeof file !== 'undefined' && file.exists) {
            return file.exists(path);
        }
        return false;
    }
    async ensureDir(dirPath) {
        if (typeof file !== 'undefined' && file.createDirectory) {
            try {
                await file.createDirectory(dirPath);
                logger.debug(`[JSONL] Directory ensured: ${dirPath}`);
            }
            catch (error) {
                // Directory may already exist — log but don't throw
                logger.debug(`[JSONL] createDirectory ${dirPath}:`, error);
            }
            return;
        }
        logger.warn('[JSONL] file.createDirectory not available');
    }
}
