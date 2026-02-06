/**
 * Plugin System Type Definitions
 *
 * This module defines the core types and interfaces for the plugin system,
 * including plugin metadata, lifecycle, permissions, and configuration.
 */

import { Tool } from '../tools/types.js';
import { AgentConfig } from '../config/schema.js';

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  /** Unique plugin identifier */
  id: string;
  /** Plugin display name */
  name: string;
  /** Plugin version (semver format) */
  version: string;
  /** Plugin description */
  description: string;
  /** Plugin author */
  author: string;
  /** Plugin license */
  license?: string;
  /** Plugin homepage URL */
  homepage?: string;
  /** Required permissions */
  permissions: PluginPermission[];
  /** Plugin dependencies (other plugin IDs) */
  dependencies?: string[];
}

/**
 * Plugin permission types
 */
export type PluginPermission =
  | 'file:read' // Read files
  | 'file:write' // Write files
  | 'file:delete' // Delete files
  | 'network:http' // HTTP requests
  | 'network:download' // Download files
  | 'android:ui' // Android UI automation
  | 'android:device' // Device information
  | 'android:system' // System operations
  | 'config:read' // Read configuration
  | 'config:write'; // Write configuration

/**
 * Plugin configuration schema
 */
export interface PluginConfig {
  /** Plugin ID */
  pluginId: string;
  /** Whether plugin is enabled */
  enabled: boolean;
  /** Plugin-specific configuration */
  settings: Record<string, any>;
}

/**
 * Plugin context provided to plugins
 */
export interface PluginContext {
  /** Agent configuration (read-only) */
  readonly config: Readonly<AgentConfig>;
  /** Plugin configuration */
  pluginConfig: PluginConfig;
  /** Logger function */
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Check if plugin has permission */
  hasPermission: (permission: PluginPermission) => boolean;
}

/**
 * Plugin lifecycle interface
 */
export interface Plugin {
  /** Plugin metadata */
  readonly metadata: PluginMetadata;

  /**
   * Initialize the plugin
   * Called when plugin is loaded
   */
  init(context: PluginContext): Promise<void>;

  /**
   * Destroy the plugin
   * Called when plugin is unloaded or application exits
   */
  destroy(): Promise<void>;

  /**
   * Get tools provided by this plugin
   * @returns Array of tools
   */
  getTools(): Tool[];

  /**
   * Get plugin configuration schema
   * Used for UI generation
   */
  getConfigSchema?(): PluginConfigSchema;

  /**
   * Validate plugin configuration
   * Called before saving configuration
   */
  validateConfig?(config: Record<string, any>): boolean | string;
}

/**
 * Plugin configuration schema for UI generation
 */
export interface PluginConfigSchema {
  /** Schema fields */
  fields: PluginConfigField[];
}

/**
 * Plugin configuration field definition
 */
export interface PluginConfigField {
  /** Field key */
  key: string;
  /** Field label */
  label: string;
  /** Field type */
  type: 'string' | 'number' | 'boolean' | 'select' | 'password';
  /** Field description */
  description?: string;
  /** Default value */
  defaultValue?: any;
  /** Required field */
  required?: boolean;
  /** Options for select type */
  options?: Array<{ label: string; value: string | number }>;
  /** Validation pattern (regex) for string type */
  pattern?: string;
  /** Minimum value for number type */
  min?: number;
  /** Maximum value for number type */
  max?: number;
}

/**
 * Plugin load result
 */
export interface PluginLoadResult {
  /** Whether load succeeded */
  success: boolean;
  /** Plugin instance (if successful) */
  plugin?: Plugin;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Plugin registry entry
 */
export interface PluginRegistryEntry {
  /** Plugin instance */
  plugin: Plugin;
  /** Plugin context */
  context: PluginContext;
  /** Whether plugin is enabled */
  enabled: boolean;
  /** Load timestamp */
  loadedAt: number;
}

/**
 * Plugin event types
 */
export type PluginEventType =
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'plugin:enabled'
  | 'plugin:disabled'
  | 'plugin:error';

/**
 * Plugin event
 */
export interface PluginEvent {
  /** Event type */
  type: PluginEventType;
  /** Plugin ID */
  pluginId: string;
  /** Event timestamp */
  timestamp: number;
  /** Additional event data */
  data?: any;
}

/**
 * Plugin event listener
 */
export type PluginEventListener = (event: PluginEvent) => void | Promise<void>;
