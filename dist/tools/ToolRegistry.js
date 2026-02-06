/**
 * Tool Registry
 *
 * Central registry for all tools (built-in and plugins)
 * Manages tool registration, lookup, and lifecycle
 */
import { toolToAnthropicFormat } from './types.js';
import { logger } from '../utils/logger.js';
export class ToolRegistry {
    constructor() {
        this.tools = new Map();
        logger.info('ToolRegistry initialized');
    }
    /**
     * Register a tool
     *
     * @param tool - Tool to register
     * @param source - Tool source ('builtin' or 'plugin')
     * @param enabled - Whether tool is enabled by default
     */
    register(tool, source = 'builtin', enabled = true) {
        if (this.tools.has(tool.name)) {
            logger.warn(`Tool already registered: ${tool.name}, replacing...`);
        }
        const registration = {
            tool,
            enabled,
            registeredAt: Date.now(),
            source,
        };
        this.tools.set(tool.name, registration);
        logger.info(`Tool registered: ${tool.name} (source: ${source})`);
    }
    /**
     * Unregister a tool
     *
     * @param name - Tool name
     */
    unregister(name) {
        const existed = this.tools.delete(name);
        if (existed) {
            logger.info(`Tool unregistered: ${name}`);
        }
        return existed;
    }
    /**
     * Get a tool by name
     *
     * @param name - Tool name
     * @returns Tool or undefined
     */
    get(name) {
        const registration = this.tools.get(name);
        return registration?.enabled ? registration.tool : undefined;
    }
    /**
     * Get all registered tools
     *
     * @param includeDisabled - Whether to include disabled tools
     * @returns Array of tools
     */
    getAll(includeDisabled = false) {
        const tools = [];
        for (const registration of this.tools.values()) {
            if (includeDisabled || registration.enabled) {
                tools.push(registration.tool);
            }
        }
        return tools;
    }
    /**
     * Get tools by category
     *
     * @param category - Tool category
     * @returns Array of tools
     */
    getByCategory(category) {
        return this.getAll().filter((tool) => tool.category === category);
    }
    /**
     * Enable a tool
     *
     * @param name - Tool name
     */
    enable(name) {
        const registration = this.tools.get(name);
        if (registration) {
            registration.enabled = true;
            logger.info(`Tool enabled: ${name}`);
            return true;
        }
        return false;
    }
    /**
     * Disable a tool
     *
     * @param name - Tool name
     */
    disable(name) {
        const registration = this.tools.get(name);
        if (registration) {
            registration.enabled = false;
            logger.info(`Tool disabled: ${name}`);
            return true;
        }
        return false;
    }
    /**
     * Check if a tool exists and is enabled
     *
     * @param name - Tool name
     */
    isEnabled(name) {
        const registration = this.tools.get(name);
        return registration?.enabled ?? false;
    }
    /**
     * Get tool count
     */
    count() {
        return this.tools.size;
    }
    /**
     * Get enabled tool count
     */
    enabledCount() {
        return this.getAll(false).length;
    }
    /**
     * Clear all tools
     */
    clear() {
        this.tools.clear();
        logger.info('All tools cleared from registry');
    }
    /**
     * Get tool names
     */
    getNames() {
        return Array.from(this.tools.keys());
    }
    /**
     * Export tools in Anthropic format for AI
     */
    toAnthropicFormat() {
        return this.getAll().map((tool) => toolToAnthropicFormat(tool));
    }
    /**
     * Get registry statistics
     */
    getStats() {
        const stats = {
            total: this.tools.size,
            enabled: 0,
            disabled: 0,
            bySource: {},
            byCategory: {},
        };
        for (const registration of this.tools.values()) {
            if (registration.enabled) {
                stats.enabled++;
            }
            else {
                stats.disabled++;
            }
            // Count by source
            stats.bySource[registration.source] = (stats.bySource[registration.source] || 0) + 1;
            // Count by category
            if (registration.tool.category) {
                stats.byCategory[registration.tool.category] =
                    (stats.byCategory[registration.tool.category] || 0) + 1;
            }
        }
        return stats;
    }
}
// Singleton instance
export const toolRegistry = new ToolRegistry();
