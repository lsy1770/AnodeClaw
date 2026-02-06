/**
 * Plugin Registry
 *
 * Manages plugin lifecycle, registration, and access.
 */
import { logger } from '../utils/logger.js';
/**
 * Plugin Registry class
 */
export class PluginRegistry {
    constructor(config) {
        this.plugins = new Map();
        this.eventListeners = new Map();
        this.config = config;
        this.pluginConfigs = new Map();
        logger.info('[PluginRegistry] Initialized');
    }
    /**
     * Register a plugin
     */
    async register(plugin, pluginConfig) {
        const pluginId = plugin.metadata.id;
        if (this.plugins.has(pluginId)) {
            throw new Error(`Plugin already registered: ${pluginId}`);
        }
        // Validate permissions
        this.validatePermissions(plugin.metadata.permissions);
        // Create plugin context
        const config = pluginConfig || {
            pluginId,
            enabled: true,
            settings: {},
        };
        const context = {
            config: this.config,
            pluginConfig: config,
            log: (level, message) => {
                logger[level](`[Plugin:${pluginId}] ${message}`);
            },
            hasPermission: (permission) => {
                return plugin.metadata.permissions.includes(permission);
            },
        };
        // Initialize plugin
        try {
            await plugin.init(context);
            // Store plugin entry
            const entry = {
                plugin,
                context,
                enabled: config.enabled,
                loadedAt: Date.now(),
            };
            this.plugins.set(pluginId, entry);
            this.pluginConfigs.set(pluginId, config);
            logger.info(`[PluginRegistry] Registered plugin: ${plugin.metadata.name} v${plugin.metadata.version}`);
            // Emit event
            await this.emitEvent({
                type: 'plugin:loaded',
                pluginId,
                timestamp: Date.now(),
                data: { metadata: plugin.metadata },
            });
        }
        catch (error) {
            logger.error(`[PluginRegistry] Failed to register plugin ${pluginId}:`, error);
            await this.emitEvent({
                type: 'plugin:error',
                pluginId,
                timestamp: Date.now(),
                data: { error: error instanceof Error ? error.message : String(error) },
            });
            throw error;
        }
    }
    /**
     * Unregister a plugin
     */
    async unregister(pluginId) {
        const entry = this.plugins.get(pluginId);
        if (!entry) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }
        try {
            // Destroy plugin
            await entry.plugin.destroy();
            // Remove from registry
            this.plugins.delete(pluginId);
            this.pluginConfigs.delete(pluginId);
            logger.info(`[PluginRegistry] Unregistered plugin: ${pluginId}`);
            // Emit event
            await this.emitEvent({
                type: 'plugin:unloaded',
                pluginId,
                timestamp: Date.now(),
            });
        }
        catch (error) {
            logger.error(`[PluginRegistry] Failed to unregister plugin ${pluginId}:`, error);
            throw error;
        }
    }
    /**
     * Enable a plugin
     */
    async enable(pluginId) {
        const entry = this.plugins.get(pluginId);
        if (!entry) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }
        if (entry.enabled) {
            return; // Already enabled
        }
        entry.enabled = true;
        const config = this.pluginConfigs.get(pluginId);
        config.enabled = true;
        logger.info(`[PluginRegistry] Enabled plugin: ${pluginId}`);
        await this.emitEvent({
            type: 'plugin:enabled',
            pluginId,
            timestamp: Date.now(),
        });
    }
    /**
     * Disable a plugin
     */
    async disable(pluginId) {
        const entry = this.plugins.get(pluginId);
        if (!entry) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }
        if (!entry.enabled) {
            return; // Already disabled
        }
        entry.enabled = false;
        const config = this.pluginConfigs.get(pluginId);
        config.enabled = false;
        logger.info(`[PluginRegistry] Disabled plugin: ${pluginId}`);
        await this.emitEvent({
            type: 'plugin:disabled',
            pluginId,
            timestamp: Date.now(),
        });
    }
    /**
     * Get a plugin by ID
     */
    get(pluginId) {
        return this.plugins.get(pluginId)?.plugin;
    }
    /**
     * Get all registered plugins
     */
    getAll() {
        return Array.from(this.plugins.values()).map((entry) => entry.plugin);
    }
    /**
     * Get all enabled plugins
     */
    getEnabled() {
        return Array.from(this.plugins.values())
            .filter((entry) => entry.enabled)
            .map((entry) => entry.plugin);
    }
    /**
     * Get all tools from enabled plugins
     */
    getTools() {
        const tools = [];
        for (const entry of this.plugins.values()) {
            if (entry.enabled) {
                try {
                    const pluginTools = entry.plugin.getTools();
                    tools.push(...pluginTools);
                }
                catch (error) {
                    logger.error(`[PluginRegistry] Failed to get tools from plugin ${entry.plugin.metadata.id}:`, error);
                }
            }
        }
        return tools;
    }
    /**
     * Update plugin configuration
     */
    async updateConfig(pluginId, settings) {
        const entry = this.plugins.get(pluginId);
        if (!entry) {
            throw new Error(`Plugin not found: ${pluginId}`);
        }
        // Validate configuration if plugin provides validator
        if (entry.plugin.validateConfig) {
            const result = entry.plugin.validateConfig(settings);
            if (result !== true) {
                throw new Error(typeof result === 'string' ? result : 'Invalid configuration');
            }
        }
        // Update configuration
        const config = this.pluginConfigs.get(pluginId);
        config.settings = settings;
        entry.context.pluginConfig = config;
        logger.info(`[PluginRegistry] Updated config for plugin: ${pluginId}`);
    }
    /**
     * Get plugin configuration
     */
    getConfig(pluginId) {
        return this.pluginConfigs.get(pluginId);
    }
    /**
     * Check if plugin is registered
     */
    has(pluginId) {
        return this.plugins.has(pluginId);
    }
    /**
     * Check if plugin is enabled
     */
    isEnabled(pluginId) {
        return this.plugins.get(pluginId)?.enabled ?? false;
    }
    /**
     * Get plugin count
     */
    count() {
        return this.plugins.size;
    }
    /**
     * Get enabled plugin count
     */
    countEnabled() {
        return Array.from(this.plugins.values()).filter((entry) => entry.enabled).length;
    }
    /**
     * Add event listener
     */
    on(eventType, listener) {
        if (!this.eventListeners.has(eventType)) {
            this.eventListeners.set(eventType, []);
        }
        this.eventListeners.get(eventType).push(listener);
    }
    /**
     * Remove event listener
     */
    off(eventType, listener) {
        const listeners = this.eventListeners.get(eventType);
        if (!listeners)
            return;
        const index = listeners.indexOf(listener);
        if (index !== -1) {
            listeners.splice(index, 1);
        }
    }
    /**
     * Emit event
     */
    async emitEvent(event) {
        const listeners = this.eventListeners.get(event.type);
        if (!listeners)
            return;
        for (const listener of listeners) {
            try {
                await listener(event);
            }
            catch (error) {
                logger.error(`[PluginRegistry] Event listener error:`, error);
            }
        }
    }
    /**
     * Validate permissions
     */
    validatePermissions(permissions) {
        const validPermissions = [
            'file:read',
            'file:write',
            'file:delete',
            'network:http',
            'network:download',
            'android:ui',
            'android:device',
            'android:system',
            'config:read',
            'config:write',
        ];
        for (const permission of permissions) {
            if (!validPermissions.includes(permission)) {
                throw new Error(`Invalid permission: ${permission}`);
            }
        }
    }
    /**
     * Destroy all plugins
     */
    async destroyAll() {
        const pluginIds = Array.from(this.plugins.keys());
        for (const pluginId of pluginIds) {
            try {
                await this.unregister(pluginId);
            }
            catch (error) {
                logger.error(`[PluginRegistry] Failed to destroy plugin ${pluginId}:`, error);
            }
        }
        logger.info('[PluginRegistry] All plugins destroyed');
    }
}
