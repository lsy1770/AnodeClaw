/**
 * Configuration Manager for Anode ClawdBot
 *
 * Handles loading, validation, and management of application configuration.
 * Supports:
 * - JSON5 format with environment variable substitution
 * - $include directives to merge external config files
 * - Polling-based hot reload with change listeners
 */
import JSON5Lib from 'json5';
const JSON5 = JSON5Lib;
import { ConfigSchema } from './schema.js';
import { logger } from '../utils/logger.js';
/**
 * Configuration Manager Class
 *
 * Loads configuration from JSON5 files with environment variable substitution.
 * Supports $include directives and polling-based hot reload.
 */
export class ConfigManager {
    constructor() {
        this.config = null;
        this.configPath = null;
        /** Change listeners */
        this.changeListeners = [];
        /** Hot reload polling state */
        this.pollTimer = null;
        this.lastFileContent = null;
    }
    /**
     * Load configuration from a file
     *
     * @param path - Path to configuration file (JSON5 format)
     * @throws Error if file cannot be read or validation fails
     */
    async load(path) {
        try {
            logger.info(`Loading configuration from: ${path}`);
            // Read configuration file
            const content = await this.readFile(path);
            // Parse JSON5
            let raw = JSON5.parse(content);
            logger.debug('Configuration file parsed successfully');
            // Process $include directives
            raw = await this.processIncludes(raw, path);
            // Substitute environment variables
            const substituted = this.substituteEnvVars(raw);
            logger.debug('Environment variables substituted');
            // Validate with Zod schema
            const validated = ConfigSchema.parse(substituted);
            logger.info('Configuration validated successfully');
            // Store configuration and snapshot for hot reload
            this.config = validated;
            this.configPath = path;
            this.lastFileContent = content;
            return validated;
        }
        catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to load configuration: ${error.message}`);
                throw new Error(`Configuration loading failed: ${error.message}`);
            }
            throw error;
        }
    }
    /**
     * Load configuration from default location
     */
    async loadDefault() {
        const defaultPath = this.getDefaultConfigPath();
        return this.load(defaultPath);
    }
    /**
     * Get the current configuration
     *
     * @throws Error if configuration has not been loaded
     */
    get() {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
        return this.config;
    }
    /**
     * Get a specific configuration section
     */
    getModel() {
        return this.get().model;
    }
    getStorage() {
        return this.get().storage;
    }
    getAgent() {
        return this.get().agent;
    }
    getUI() {
        return this.get().ui;
    }
    /**
     * Update configuration at runtime
     *
     * @param updates - Partial configuration updates
     */
    update(updates) {
        if (!this.config) {
            throw new Error('Configuration not loaded. Call load() first.');
        }
        const oldConfig = this.config;
        const updated = { ...this.config, ...updates };
        const validated = ConfigSchema.parse(updated);
        this.config = validated;
        logger.info('Configuration updated');
        // Notify listeners
        this.notifyListeners(validated, oldConfig);
        return validated;
    }
    /**
     * Save current configuration to file
     *
     * @param path - Optional path (defaults to original load path)
     */
    async save(path) {
        if (!this.config) {
            throw new Error('No configuration to save');
        }
        const savePath = path || this.configPath;
        if (!savePath) {
            throw new Error('No configuration path specified');
        }
        try {
            const content = JSON.stringify(this.config, null, 2);
            await this.writeFile(savePath, content);
            logger.info(`Configuration saved to: ${savePath}`);
        }
        catch (error) {
            if (error instanceof Error) {
                logger.error(`Failed to save configuration: ${error.message}`);
                throw new Error(`Configuration save failed: ${error.message}`);
            }
            throw error;
        }
    }
    /**
     * Register a change listener
     *
     * @param listener - Callback invoked when config changes (hot reload or update())
     * @returns Unsubscribe function
     */
    onChange(listener) {
        this.changeListeners.push(listener);
        return () => {
            const idx = this.changeListeners.indexOf(listener);
            if (idx >= 0)
                this.changeListeners.splice(idx, 1);
        };
    }
    /**
     * Start polling the config file for changes
     *
     * Uses interval-based polling since Android/Anode may not support
     * native file watchers. On change, reloads config and notifies listeners.
     *
     * @param intervalMs - Polling interval in milliseconds (default 5000)
     */
    startWatching(intervalMs = 5000) {
        if (this.pollTimer) {
            logger.warn('[ConfigManager] Already watching for changes');
            return;
        }
        if (!this.configPath) {
            logger.warn('[ConfigManager] No config path to watch. Call load() first.');
            return;
        }
        logger.info(`[ConfigManager] Watching config file for changes (interval: ${intervalMs}ms)`);
        this.pollTimer = setInterval(async () => {
            try {
                await this.checkForChanges();
            }
            catch (error) {
                logger.error('[ConfigManager] Error checking for config changes:', error);
            }
        }, intervalMs);
    }
    /**
     * Stop polling for config file changes
     */
    stopWatching() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
            logger.info('[ConfigManager] Stopped watching config file');
        }
    }
    /**
     * Check if the config file has changed and reload if needed
     */
    async checkForChanges() {
        if (!this.configPath)
            return;
        try {
            const currentContent = await this.readFile(this.configPath);
            if (currentContent !== this.lastFileContent) {
                logger.info('[ConfigManager] Config file changed, reloading...');
                const oldConfig = this.config;
                // Reload the config (this updates lastFileContent too)
                await this.load(this.configPath);
                // Notify listeners if config actually changed
                if (oldConfig && this.config) {
                    this.notifyListeners(this.config, oldConfig);
                }
            }
        }
        catch (error) {
            // File may be temporarily unavailable during write; skip this cycle
            logger.debug(`[ConfigManager] Could not read config file: ${error.message}`);
        }
    }
    /**
     * Notify all change listeners
     */
    notifyListeners(newConfig, oldConfig) {
        for (const listener of this.changeListeners) {
            try {
                listener(newConfig, oldConfig);
            }
            catch (error) {
                logger.error('[ConfigManager] Change listener error:', error);
            }
        }
    }
    /**
     * Process $include directives in the config object
     *
     * Supports:
     * - "$include": "path/to/file.json5"  (single file)
     * - "$include": ["path/a.json5", "path/b.json5"]  (multiple files, merged left-to-right)
     *
     * Included files are deep-merged under the current object.
     * The include is processed before any other keys, so local keys override included values.
     * Nested $include directives in included files are also processed (max depth 5).
     *
     * @param obj - Parsed config object
     * @param basePath - Path of the file containing this object (for resolving relative paths)
     * @param depth - Current inclusion depth (to prevent infinite loops)
     * @returns Processed object with includes merged
     */
    async processIncludes(obj, basePath, depth = 0) {
        if (depth > 5) {
            logger.warn('[ConfigManager] Max $include depth (5) exceeded, skipping further includes');
            return obj;
        }
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj;
        }
        let result = { ...obj };
        // Process $include at this level
        if ('$include' in result) {
            const includeValue = result['$include'];
            delete result['$include'];
            const paths = Array.isArray(includeValue) ? includeValue : [includeValue];
            const baseDir = this.dirname(basePath);
            for (const includePath of paths) {
                if (typeof includePath !== 'string') {
                    logger.warn(`[ConfigManager] Invalid $include value (expected string): ${includePath}`);
                    continue;
                }
                const resolvedPath = this.resolvePath(baseDir, includePath);
                try {
                    const content = await this.readFile(resolvedPath);
                    let included = JSON5.parse(content);
                    // Recursively process includes in the included file
                    included = await this.processIncludes(included, resolvedPath, depth + 1);
                    // Deep-merge: included values are the base, local keys override
                    result = this.deepMerge(included, result);
                    logger.debug(`[ConfigManager] Included: ${resolvedPath}`);
                }
                catch (error) {
                    logger.warn(`[ConfigManager] Failed to include ${resolvedPath}: ${error.message}`);
                }
            }
        }
        // Recursively process $include in nested objects
        for (const key of Object.keys(result)) {
            if (result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
                result[key] = await this.processIncludes(result[key], basePath, depth);
            }
        }
        return result;
    }
    /**
     * Deep merge two objects. Values in `override` take precedence.
     */
    deepMerge(base, override) {
        if (base === null || typeof base !== 'object' || Array.isArray(base)) {
            return override;
        }
        if (override === null || typeof override !== 'object' || Array.isArray(override)) {
            return override;
        }
        const result = { ...base };
        for (const key of Object.keys(override)) {
            if (key in result &&
                result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key]) &&
                override[key] !== null && typeof override[key] === 'object' && !Array.isArray(override[key])) {
                result[key] = this.deepMerge(result[key], override[key]);
            }
            else {
                result[key] = override[key];
            }
        }
        return result;
    }
    /**
     * Substitute environment variables in configuration object
     *
     * Replaces ${VAR_NAME} with process.env.VAR_NAME
     * Supports nested objects and arrays
     *
     * @param obj - Object to process
     * @returns Object with environment variables substituted
     */
    substituteEnvVars(obj) {
        if (typeof obj === 'string') {
            // Replace ${VAR_NAME} with environment variable
            return obj.replace(/\$\{([^}]+)\}/g, (match, varName) => {
                const value = process.env[varName];
                if (value === undefined) {
                    logger.warn(`Environment variable not found: ${varName}`);
                    return match; // Keep original if not found
                }
                logger.debug(`Substituted ${varName}`);
                return value;
            });
        }
        if (Array.isArray(obj)) {
            return obj.map((item) => this.substituteEnvVars(item));
        }
        if (obj !== null && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.substituteEnvVars(value);
            }
            return result;
        }
        return obj;
    }
    /**
     * Read file content using Anode file API with Node.js fallback
     */
    async readFile(path) {
        if (typeof file !== 'undefined' && file.readText) {
            return file.readText(path, 'UTF-8');
        }
        throw new Error('Anode file API not available');
    }
    /**
     * Write file content using Anode file API with Node.js fallback
     */
    async writeFile(path, content) {
        if (typeof file !== 'undefined' && file.writeText) {
            await file.writeText(path, content, 'UTF-8');
            return;
        }
        throw new Error('Anode file API not available');
    }
    /**
     * Get directory name from a file path
     */
    dirname(filePath) {
        const sep = filePath.includes('\\') ? '\\' : '/';
        const lastSep = filePath.lastIndexOf(sep);
        return lastSep >= 0 ? filePath.substring(0, lastSep) : '.';
    }
    /**
     * Resolve a relative path against a base directory
     */
    resolvePath(baseDir, relativePath) {
        // If the path is already absolute, return as-is
        if (relativePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(relativePath)) {
            return relativePath;
        }
        const sep = baseDir.includes('\\') ? '\\' : '/';
        return baseDir + sep + relativePath;
    }
    /**
     * Get default configuration path
     */
    getDefaultConfigPath() {
        // Check environment variable first
        const envPath = process.env.CLAWDBOT_CONFIG;
        if (envPath) {
            return envPath;
        }
        // Default to assets directory
        return './assets/config.default.json';
    }
    /**
     * Shutdown: stop watching and clear listeners
     */
    shutdown() {
        this.stopWatching();
        this.changeListeners.length = 0;
    }
}
// Export singleton instance
export const configManager = new ConfigManager();
