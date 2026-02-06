/**
 * App Management Tools
 *
 * Built-in tools for app management using Anode AppApi
 * Based on anode-api.d.ts definitions
 */

import { z } from 'zod';
import type { Tool, ToolResult, ToolExecutionOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

// Anode AppApi global (actual global name is 'app')
declare const app: {
  openUrl(url: string): Promise<any>;
  openSchema(schema: string): Promise<any>;
  uninstall(packageName: string): void;
  getInstalledApps(): Promise<any[]>;
  getPackageName(appName: string): Promise<string>;
  openApp(name: string): Promise<any>;
  isPackageInstalled(packageName: string): boolean;
  openAppByPackageName(packageName: string): Promise<any>;
  getAppVersion(packageName: string): Promise<string>;
  installApp(packageName: string): Promise<any>;
  uninstallApp(packageName: string): Promise<any>;
  isPackageInstalledAsync(packageName: string): Promise<boolean>;
  checkSelfPermission(permission: string): Promise<any>;
  requestPermission(permission: string): void;
};

/**
 * Open URL Tool
 */
export const openUrlTool: Tool = {
  name: 'open_url',
  description: 'Open a URL in the default browser',
  category: 'app',
  permissions: ['app:launch'],
  parallelizable: false,

  parameters: [
    {
      name: 'url',
      description: 'URL to open',
      schema: z.string().url(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { url } = params;

      logger.debug(`Opening URL: ${url}`);

      await app.openUrl(url);

      return {
        success: true,
        output: {
          action: 'open_url',
          url,
          message: 'URL opened successfully',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'OPEN_URL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to open URL',
          details: error,
        },
      };
    }
  },
};

/**
 * Open Schema Tool
 */
export const openSchemaTool: Tool = {
  name: 'open_schema',
  description: 'Open a URI schema (e.g., tel:, mailto:, intent:)',
  category: 'app',
  permissions: ['app:launch'],
  parallelizable: false,

  parameters: [
    {
      name: 'schema',
      description: 'URI schema to open (e.g., "tel:123456", "mailto:test@example.com")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { schema } = params;

      logger.debug(`Opening schema: ${schema}`);

      await app.openSchema(schema);

      return {
        success: true,
        output: {
          action: 'open_schema',
          schema,
          message: 'Schema opened successfully',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'OPEN_SCHEMA_FAILED',
          message: error instanceof Error ? error.message : 'Failed to open schema',
          details: error,
        },
      };
    }
  },
};

/**
 * Open App Tool
 */
export const openAppTool: Tool = {
  name: 'open_app',
  description: 'Open an app by its name',
  category: 'app',
  permissions: ['app:launch'],
  parallelizable: false,

  parameters: [
    {
      name: 'name',
      description: 'App name to open (e.g., "WeChat", "Chrome")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { name } = params;

      logger.debug(`Opening app: ${name}`);

      await app.openApp(name);

      return {
        success: true,
        output: {
          action: 'open_app',
          name,
          message: `App "${name}" opened successfully`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'OPEN_APP_FAILED',
          message: error instanceof Error ? error.message : 'Failed to open app',
          details: error,
        },
      };
    }
  },
};

/**
 * Open App by Package Name Tool
 */
export const openAppByPackageTool: Tool = {
  name: 'open_app_by_package',
  description: 'Open an app by its package name',
  category: 'app',
  permissions: ['app:launch'],
  parallelizable: false,

  parameters: [
    {
      name: 'packageName',
      description: 'Package name (e.g., "com.tencent.mm")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { packageName } = params;

      logger.debug(`Opening app by package: ${packageName}`);

      await app.openAppByPackageName(packageName);

      return {
        success: true,
        output: {
          action: 'open_app_by_package',
          packageName,
          message: `App "${packageName}" opened successfully`,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'OPEN_APP_FAILED',
          message: error instanceof Error ? error.message : 'Failed to open app',
          details: error,
        },
      };
    }
  },
};

/**
 * Get Installed Apps Tool
 */
export const getInstalledAppsTool: Tool = {
  name: 'get_installed_apps',
  description: 'Get a list of all installed apps',
  category: 'app',
  permissions: ['app:read'],
  parallelizable: true,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
    try {
      logger.debug('Getting installed apps');

      const apps = await app.getInstalledApps();

      return {
        success: true,
        output: {
          apps,
          count: apps.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_APPS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get installed apps',
          details: error,
        },
      };
    }
  },
};

/**
 * Check App Installed Tool
 */
export const isAppInstalledTool: Tool = {
  name: 'is_app_installed',
  description: 'Check if an app is installed by package name',
  category: 'app',
  permissions: ['app:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'packageName',
      description: 'Package name to check',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { packageName } = params;

      logger.debug(`Checking if app is installed: ${packageName}`);

      // isPackageInstalled is synchronous
      const isInstalled = app.isPackageInstalled(packageName);

      return {
        success: true,
        output: {
          packageName,
          isInstalled,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECK_APP_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check app installation',
          details: error,
        },
      };
    }
  },
};

/**
 * Get App Version Tool
 */
export const getAppVersionTool: Tool = {
  name: 'get_app_version',
  description: 'Get the version of an installed app',
  category: 'app',
  permissions: ['app:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'packageName',
      description: 'Package name of the app',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { packageName } = params;

      logger.debug(`Getting app version: ${packageName}`);

      const version = await app.getAppVersion(packageName);

      return {
        success: true,
        output: {
          packageName,
          version,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_VERSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get app version',
          details: error,
        },
      };
    }
  },
};

/**
 * Get Package Name Tool
 */
export const getPackageNameTool: Tool = {
  name: 'get_package_name',
  description: 'Get the package name of an app by its display name',
  category: 'app',
  permissions: ['app:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'appName',
      description: 'Display name of the app (e.g., "WeChat")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { appName } = params;

      logger.debug(`Getting package name for: ${appName}`);

      const packageName = await app.getPackageName(appName);

      return {
        success: true,
        output: {
          appName,
          packageName,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'GET_PACKAGE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to get package name',
          details: error,
        },
      };
    }
  },
};

/**
 * Install App Tool
 */
export const installAppTool: Tool = {
  name: 'install_app',
  description: 'Install an app from APK file path or trigger installation',
  category: 'app',
  permissions: ['app:install'],
  parallelizable: false,

  parameters: [
    {
      name: 'packageName',
      description: 'Package name or APK path to install',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { packageName } = params;

      logger.debug(`Installing app: ${packageName}`);

      await app.installApp(packageName);

      return {
        success: true,
        output: {
          action: 'install_app',
          packageName,
          message: 'App installation initiated',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'INSTALL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to install app',
          details: error,
        },
      };
    }
  },
};

/**
 * Uninstall App Tool
 */
export const uninstallAppTool: Tool = {
  name: 'uninstall_app',
  description: 'Uninstall an app by package name',
  category: 'app',
  permissions: ['app:uninstall'],
  parallelizable: false,

  parameters: [
    {
      name: 'packageName',
      description: 'Package name of the app to uninstall',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { packageName } = params;

      logger.debug(`Uninstalling app: ${packageName}`);

      await app.uninstallApp(packageName);

      return {
        success: true,
        output: {
          action: 'uninstall_app',
          packageName,
          message: 'App uninstallation initiated',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UNINSTALL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to uninstall app',
          details: error,
        },
      };
    }
  },
};

/**
 * Check Permission Tool
 */
export const checkPermissionTool: Tool = {
  name: 'check_permission',
  description: 'Check if the app has a specific permission',
  category: 'app',
  permissions: ['app:read'],
  parallelizable: true,

  parameters: [
    {
      name: 'permission',
      description: 'Android permission to check (e.g., "android.permission.CAMERA")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { permission } = params;

      logger.debug(`Checking permission: ${permission}`);

      const result = await app.checkSelfPermission(permission);

      return {
        success: true,
        output: {
          permission,
          granted: result === 0, // PackageManager.PERMISSION_GRANTED = 0
          result,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CHECK_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to check permission',
          details: error,
        },
      };
    }
  },
};

/**
 * Request Permission Tool
 */
export const requestPermissionTool: Tool = {
  name: 'request_permission',
  description: 'Request a specific Android permission',
  category: 'app',
  permissions: ['app:permission'],
  parallelizable: false,

  parameters: [
    {
      name: 'permission',
      description: 'Android permission to request (e.g., "android.permission.CAMERA")',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { permission } = params;

      logger.debug(`Requesting permission: ${permission}`);

      // requestPermission is synchronous (void)
      app.requestPermission(permission);

      return {
        success: true,
        output: {
          action: 'request_permission',
          permission,
          message: 'Permission request initiated',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'REQUEST_PERMISSION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to request permission',
          details: error,
        },
      };
    }
  },
};

/**
 * All app tools
 */
export const appTools: Tool[] = [
  openUrlTool,
  openSchemaTool,
  openAppTool,
  openAppByPackageTool,
  getInstalledAppsTool,
  isAppInstalledTool,
  getAppVersionTool,
  getPackageNameTool,
  installAppTool,
  uninstallAppTool,
  checkPermissionTool,
  requestPermissionTool,
];
