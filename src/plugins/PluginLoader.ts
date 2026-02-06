/**
 * Plugin Loader
 *
 * Loads and validates plugins from the filesystem.
 */

import { logger } from '../utils/logger.js';
import { Plugin, PluginLoadResult, PluginMetadata } from './types.js';

/**
 * File API interface for plugin loader
 */
export interface FileAPI {
  exists(path: string): Promise<boolean>;
  read(path: string, encoding: string): Promise<string>;
  list(path: string): Promise<Array<{ name: string; type: 'file' | 'directory' }>>;
  write(path: string, content: string, encoding: string): Promise<void>;
  delete(path: string): Promise<void>;
  ensureDir(path: string): Promise<void>;
}

/**
 * Plugin Loader class
 */
export class PluginLoader {
  private pluginDir: string;
  private fileAPI: FileAPI;

  constructor(pluginDir: string, fileAPI: FileAPI) {
    this.pluginDir = pluginDir;
    this.fileAPI = fileAPI;

    logger.info(`[PluginLoader] Initialized with plugin directory: ${pluginDir}`);
  }

  /**
   * Load a plugin from directory
   */
  async load(pluginId: string): Promise<PluginLoadResult> {
    const pluginPath = `${this.pluginDir}/${pluginId}`;

    try {
      // Check if plugin directory exists
      const exists = await this.fileAPI.exists(pluginPath);
      if (!exists) {
        return {
          success: false,
          error: `Plugin directory not found: ${pluginPath}`,
        };
      }

      // Load plugin metadata
      const metadataPath = `${pluginPath}/plugin.json`;
      const metadataExists = await this.fileAPI.exists(metadataPath);

      if (!metadataExists) {
        return {
          success: false,
          error: `Plugin metadata not found: ${metadataPath}`,
        };
      }

      const metadataContent = await this.fileAPI.read(metadataPath, 'utf-8');
      const metadata: PluginMetadata = JSON.parse(metadataContent);

      // Validate metadata
      const validationError = this.validateMetadata(metadata);
      if (validationError) {
        return {
          success: false,
          error: validationError,
        };
      }

      // Load plugin entry point
      const entryPath = `${pluginPath}/index.js`;
      const entryExists = await this.fileAPI.exists(entryPath);

      if (!entryExists) {
        return {
          success: false,
          error: `Plugin entry point not found: ${entryPath}`,
        };
      }

      // Import plugin module
      // Note: Dynamic import() is not supported on Javet.
      // Plugins must be statically imported or loaded via a different mechanism.
      let pluginModule: any;
      try {
        pluginModule = await import(entryPath);
      } catch (importError) {
        return {
          success: false,
          error: `Failed to import plugin module (dynamic import may not be supported on this runtime): ${(importError as Error).message}`,
        };
      }

      // Get plugin class or factory
      const PluginClass = pluginModule.default || pluginModule.Plugin;
      if (!PluginClass) {
        return {
          success: false,
          error: 'Plugin must export a default class or Plugin class',
        };
      }

      // Create plugin instance
      const plugin: Plugin = new PluginClass();

      // Verify plugin implements required interface
      if (!this.isValidPlugin(plugin)) {
        return {
          success: false,
          error: 'Plugin does not implement required interface',
        };
      }

      // Verify metadata matches
      if (plugin.metadata.id !== metadata.id) {
        return {
          success: false,
          error: `Plugin ID mismatch: ${plugin.metadata.id} !== ${metadata.id}`,
        };
      }

      logger.info(
        `[PluginLoader] Loaded plugin: ${plugin.metadata.name} v${plugin.metadata.version}`
      );

      return {
        success: true,
        plugin,
      };
    } catch (error) {
      logger.error(`[PluginLoader] Failed to load plugin ${pluginId}:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Load all plugins from directory
   */
  async loadAll(): Promise<Map<string, PluginLoadResult>> {
    const results = new Map<string, PluginLoadResult>();

    try {
      // Ensure plugin directory exists
      const exists = await this.fileAPI.exists(this.pluginDir);
      if (!exists) {
        logger.warn(`[PluginLoader] Plugin directory does not exist: ${this.pluginDir}`);
        return results;
      }

      // List plugin directories
      // Filter by type AND skip entries with file extensions (e.g. .js, .ts)
      // since Javet may not reliably report isDirectory as a boolean property
      const entries = await this.fileAPI.list(this.pluginDir);
      const pluginDirs = entries.filter(
        (entry) => entry.type === 'directory' && !entry.name.includes('.')
      );

      logger.info(`[PluginLoader] Found ${pluginDirs.length} plugin directories`);

      // Load each plugin
      for (const dir of pluginDirs) {
        const result = await this.load(dir.name);
        results.set(dir.name, result);

        if (result.success) {
          logger.info(`[PluginLoader] ✓ ${dir.name}`);
        } else {
          logger.warn(`[PluginLoader] ✗ ${dir.name}: ${result.error}`);
        }
      }
    } catch (error) {
      logger.error(`[PluginLoader] Failed to load plugins:`, error);
    }

    return results;
  }

  /**
   * Validate plugin metadata
   */
  private validateMetadata(metadata: PluginMetadata): string | null {
    if (!metadata.id || typeof metadata.id !== 'string') {
      return 'Invalid or missing plugin ID';
    }

    if (!metadata.name || typeof metadata.name !== 'string') {
      return 'Invalid or missing plugin name';
    }

    if (!metadata.version || typeof metadata.version !== 'string') {
      return 'Invalid or missing plugin version';
    }

    // Validate semver format
    if (!/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/.test(metadata.version)) {
      return 'Invalid version format (must be semver)';
    }

    if (!metadata.description || typeof metadata.description !== 'string') {
      return 'Invalid or missing plugin description';
    }

    if (!metadata.author || typeof metadata.author !== 'string') {
      return 'Invalid or missing plugin author';
    }

    if (!Array.isArray(metadata.permissions)) {
      return 'Invalid or missing plugin permissions';
    }

    return null;
  }

  /**
   * Check if object is a valid plugin
   */
  private isValidPlugin(obj: any): obj is Plugin {
    return (
      obj &&
      typeof obj === 'object' &&
      'metadata' in obj &&
      typeof obj.init === 'function' &&
      typeof obj.destroy === 'function' &&
      typeof obj.getTools === 'function'
    );
  }

  /**
   * Get plugin directory path
   */
  getPluginDir(): string {
    return this.pluginDir;
  }

  /**
   * Get plugin path
   */
  getPluginPath(pluginId: string): string {
    return `${this.pluginDir}/${pluginId}`;
  }

  /**
   * Check if plugin exists
   */
  async exists(pluginId: string): Promise<boolean> {
    const pluginPath = this.getPluginPath(pluginId);
    return await this.fileAPI.exists(pluginPath);
  }

  /**
   * Create plugin directory structure
   */
  async createPluginDir(pluginId: string): Promise<void> {
    const pluginPath = this.getPluginPath(pluginId);
    await this.fileAPI.ensureDir(pluginPath);
    logger.info(`[PluginLoader] Created plugin directory: ${pluginPath}`);
  }

  /**
   * Delete plugin directory
   */
  async deletePlugin(pluginId: string): Promise<void> {
    const pluginPath = this.getPluginPath(pluginId);
    const exists = await this.fileAPI.exists(pluginPath);

    if (!exists) {
      throw new Error(`Plugin directory not found: ${pluginPath}`);
    }

    // Delete directory recursively
    await this.fileAPI.delete(pluginPath);
    logger.info(`[PluginLoader] Deleted plugin directory: ${pluginPath}`);
  }
}
