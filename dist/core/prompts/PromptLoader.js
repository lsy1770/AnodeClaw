/**
 * Prompt Loader
 *
 * Loads prompt files from filesystem.
 * Uses Anode global file API when available, falls back to Node.js fs.
 */
import { logger } from '../../utils/logger.js';
/**
 * Prompt Loader Class
 */
export class PromptLoader {
    constructor() {
        this.fileCache = new Map();
    }
    /**
     * Load prompt from file
     *
     * @param filePath - Path to prompt file
     * @param source - Prompt source type
     * @returns Prompt content or null if not found
     */
    async load(filePath, source) {
        try {
            // Check if file exists
            const exists = this.fileExists(filePath);
            if (!exists) {
                logger.debug(`[PromptLoader] File not found: ${filePath}`);
                return null;
            }
            // Check cache (with 30s TTL for hot reload)
            const cached = this.fileCache.get(filePath);
            if (cached && Date.now() - cached.loadedAt < 30000) {
                logger.debug(`[PromptLoader] Using cached ${source} from ${filePath}`);
                return cached.content;
            }
            // Read file
            const content = await this.readFile(filePath);
            // Update cache
            this.fileCache.set(filePath, { content, loadedAt: Date.now() });
            logger.info(`[PromptLoader] Loaded ${source} from ${filePath}`);
            return content;
        }
        catch (error) {
            logger.error(`[PromptLoader] Failed to load ${source} from ${filePath}:`, error);
            return null;
        }
    }
    /**
     * Load multiple prompts
     *
     * @param files - Map of source to file path
     * @returns Map of source to content
     */
    async loadMultiple(files) {
        const results = new Map();
        for (const [source, filePath] of files.entries()) {
            const content = await this.load(filePath, source);
            if (content) {
                results.set(source, content);
            }
        }
        return results;
    }
    /**
     * Clear cache for a specific file or all files
     *
     * @param filePath - Optional file path to clear
     */
    clearCache(filePath) {
        if (filePath) {
            this.fileCache.delete(filePath);
            logger.debug(`[PromptLoader] Cleared cache for ${filePath}`);
        }
        else {
            this.fileCache.clear();
            logger.info('[PromptLoader] Cleared all cache');
        }
    }
    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            size: this.fileCache.size,
            files: Array.from(this.fileCache.keys()),
        };
    }
    // ==========================================
    // File system abstraction layer
    // ==========================================
    async readFile(path) {
        if (typeof file !== 'undefined' && file.readText) {
            return file.readText(path, 'UTF-8');
        }
        throw new Error('Anode file API not available');
    }
    fileExists(path) {
        if (typeof file !== 'undefined' && file.exists) {
            return file.exists(path);
        }
        return false;
    }
}
