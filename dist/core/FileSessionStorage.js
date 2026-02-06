/**
 * File-based session storage implementation
 *
 * Stores session data as JSON files in the filesystem
 * Uses Anode global file API when available, falls back to Node.js fs
 */
import { logger } from '../utils/logger.js';
export class FileSessionStorage {
    constructor(filePath) {
        this.filePath = filePath;
    }
    /**
     * Load session data from file
     *
     * @returns Session data or null if file doesn't exist
     */
    async load() {
        try {
            const exists = this.fileExists(this.filePath);
            if (!exists) {
                logger.debug(`Session file not found: ${this.filePath}`);
                return null;
            }
            const content = await this.readFile(this.filePath);
            const data = JSON.parse(content);
            logger.debug(`Session loaded from: ${this.filePath}`);
            return data;
        }
        catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to load session: ${error.message}`);
                throw new Error(`Session load failed: ${error.message}`);
            }
            throw error;
        }
    }
    /**
     * Save session data to file
     *
     * @param data - Session data to save
     */
    async save(data) {
        try {
            // Ensure directory exists
            await this.ensureDirectory(this.filePath);
            // Serialize and save
            const content = JSON.stringify(data, null, 2);
            await this.writeFile(this.filePath, content);
            logger.debug(`Session saved to: ${this.filePath}`);
        }
        catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to save session: ${error.message}`);
                throw new Error(`Session save failed: ${error.message}`);
            }
            throw error;
        }
    }
    /**
     * Check if session file exists
     */
    async exists() {
        return this.fileExists(this.filePath);
    }
    /**
     * Delete session file
     */
    async delete() {
        try {
            const exists = this.fileExists(this.filePath);
            if (exists) {
                await this.deleteFile(this.filePath);
                logger.debug(`Session file deleted: ${this.filePath}`);
            }
        }
        catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to delete session: ${error.message}`);
                throw new Error(`Session delete failed: ${error.message}`);
            }
            throw error;
        }
    }
    /**
     * Get file path
     */
    getFilePath() {
        return this.filePath;
    }
    /**
     * Export session to a portable JSON format
     *
     * @param exportPath - Path to write the export file (optional, defaults to {sessionDir}/{id}.export.json)
     * @returns Path to the exported file
     */
    async exportSession(exportPath) {
        const data = await this.load();
        if (!data) {
            throw new Error(`No session data to export at: ${this.filePath}`);
        }
        const targetPath = exportPath || this.filePath.replace(/\.json$/, '.export.json');
        // Build metadata from messages
        const messages = data.messages.map(([, msg]) => msg);
        const timestamps = messages.map(m => m.timestamp).filter(t => t > 0);
        const exportData = {
            version: 1,
            exportedAt: Date.now(),
            session: data,
            metadata: {
                messageCount: messages.length,
                firstMessageAt: timestamps.length > 0 ? Math.min(...timestamps) : undefined,
                lastMessageAt: timestamps.length > 0 ? Math.max(...timestamps) : undefined,
            },
        };
        await this.ensureDirectory(targetPath);
        await this.writeFile(targetPath, JSON.stringify(exportData, null, 2));
        logger.info(`Session exported to: ${targetPath} (${messages.length} messages)`);
        return targetPath;
    }
    /**
     * Import session from an export file
     *
     * @param importPath - Path to the export file
     * @param overwrite - Whether to overwrite existing session (default false)
     * @returns The imported SessionData
     */
    async importSession(importPath, overwrite = false) {
        if (!overwrite) {
            const exists = this.fileExists(this.filePath);
            if (exists) {
                throw new Error(`Session already exists at: ${this.filePath}. Set overwrite=true to replace.`);
            }
        }
        const content = await this.readFile(importPath);
        let data;
        try {
            const parsed = JSON.parse(content);
            // Handle both export format and raw SessionData
            if (parsed.version === 1 && parsed.session) {
                // Export format
                const exportData = parsed;
                data = exportData.session;
                logger.info(`Importing session from export (${exportData.metadata?.messageCount || 0} messages, ` +
                    `exported at ${new Date(exportData.exportedAt).toISOString()})`);
            }
            else if (parsed.sessionId && parsed.messages) {
                // Raw SessionData format
                data = parsed;
            }
            else {
                throw new Error('Unrecognized session format');
            }
        }
        catch (error) {
            if (error instanceof Error && error.message === 'Unrecognized session format') {
                throw error;
            }
            throw new Error(`Failed to parse import file: ${error.message}`);
        }
        // Update timestamps
        data.updatedAt = Date.now();
        // Save to our file path
        await this.save(data);
        logger.info(`Session imported from: ${importPath} → ${this.filePath}`);
        return data;
    }
    /**
     * List all session files in a directory
     *
     * @param sessionDir - Directory to scan
     * @returns Array of session file info
     */
    static async listSessions(sessionDir) {
        const results = [];
        try {
            let files;
            if (typeof file !== 'undefined' && file.listFiles) {
                const entries = await file.listFiles(sessionDir);
                files = entries.map(e => e.name);
            }
            else {
                throw new Error('Anode file API not available');
            }
            for (const f of files) {
                if (!f.endsWith('.json') || f.endsWith('.export.json'))
                    continue;
                const fullPath = sessionDir.endsWith('/') || sessionDir.endsWith('\\')
                    ? `${sessionDir}${f}`
                    : `${sessionDir}/${f}`;
                try {
                    const storage = new FileSessionStorage(fullPath);
                    const data = await storage.load();
                    if (data) {
                        results.push({
                            id: data.sessionId,
                            path: fullPath,
                            createdAt: data.createdAt,
                            updatedAt: data.updatedAt,
                            messageCount: data.messages.length,
                        });
                    }
                }
                catch {
                    // Skip files that can't be parsed
                    logger.debug(`Skipping non-session file: ${f}`);
                }
            }
            // Sort by updatedAt descending
            results.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }
        catch (error) {
            logger.error(`Failed to list sessions in ${sessionDir}: ${error.message}`);
        }
        return results;
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
    async ensureDirectory(filePath) {
        const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
        const dir = lastSlash > 0 ? filePath.substring(0, lastSlash) : '.';
        try {
            if (typeof file !== 'undefined' && file.createDirectory) {
                await file.createDirectory(dir);
                return;
            }
        }
        catch {
            // Directory may already exist
        }
    }
}
