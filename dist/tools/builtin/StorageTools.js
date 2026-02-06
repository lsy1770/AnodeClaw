/**
 * Local Storage Tools
 *
 * Built-in tools for key-value storage using Anode storage
 * Based on anode-api.d.ts definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Get Storage Item Tool
 */
export const getStorageItemTool = {
    name: 'storage_get',
    description: 'Get an item from local storage by key',
    category: 'storage',
    permissions: ['storage:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'key',
            description: 'Storage key',
            schema: z.string(),
            required: true,
        },
        {
            name: 'defaultValue',
            description: 'Default value if key not found',
            schema: z.any(),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { key, defaultValue } = params;
            logger.debug(`Getting storage item: ${key}`);
            const value = await storage.getItem(key, defaultValue ?? null);
            return {
                success: true,
                output: {
                    key,
                    value,
                    found: value !== null && value !== defaultValue,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_GET_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get storage item',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Storage Item Tool
 */
export const setStorageItemTool = {
    name: 'storage_set',
    description: 'Set an item in local storage',
    category: 'storage',
    permissions: ['storage:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'key',
            description: 'Storage key',
            schema: z.string(),
            required: true,
        },
        {
            name: 'value',
            description: 'Value to store (can be any JSON-serializable value)',
            schema: z.any(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { key, value } = params;
            logger.debug(`Setting storage item: ${key}`);
            await storage.setItem(key, value);
            return {
                success: true,
                output: {
                    action: 'set',
                    key,
                    message: 'Storage item set successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_SET_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set storage item',
                    details: error,
                },
            };
        }
    },
};
/**
 * Remove Storage Item Tool
 */
export const removeStorageItemTool = {
    name: 'storage_remove',
    description: 'Remove an item from local storage',
    category: 'storage',
    permissions: ['storage:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'key',
            description: 'Storage key to remove',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { key } = params;
            logger.debug(`Removing storage item: ${key}`);
            await storage.removeItem(key);
            return {
                success: true,
                output: {
                    action: 'remove',
                    key,
                    message: 'Storage item removed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_REMOVE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to remove storage item',
                    details: error,
                },
            };
        }
    },
};
/**
 * Check Storage Key Tool
 */
export const hasStorageKeyTool = {
    name: 'storage_has',
    description: 'Check if a key exists in local storage',
    category: 'storage',
    permissions: ['storage:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'key',
            description: 'Storage key to check',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { key } = params;
            logger.debug(`Checking storage key: ${key}`);
            const exists = await storage.hasKey(key);
            return {
                success: true,
                output: {
                    key,
                    exists,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_HAS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to check storage key',
                    details: error,
                },
            };
        }
    },
};
/**
 * List Storage Keys Tool
 */
export const listStorageKeysTool = {
    name: 'storage_keys',
    description: 'List all keys in local storage',
    category: 'storage',
    permissions: ['storage:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Listing storage keys');
            // keys() is synchronous and returns a Set
            const keysSet = storage.keys();
            const keys = Array.from(keysSet);
            return {
                success: true,
                output: {
                    keys,
                    count: keys.length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_KEYS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to list storage keys',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get All Storage Tool
 */
export const getAllStorageTool = {
    name: 'storage_get_all',
    description: 'Get all items from local storage',
    category: 'storage',
    permissions: ['storage:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting all storage items');
            const all = await storage.getAll();
            return {
                success: true,
                output: {
                    items: all,
                    count: Object.keys(all || {}).length,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_GET_ALL_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get all storage items',
                    details: error,
                },
            };
        }
    },
};
/**
 * Clear Storage Tool
 */
export const clearStorageTool = {
    name: 'storage_clear',
    description: 'Clear all items from local storage',
    category: 'storage',
    permissions: ['storage:write'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Clearing all storage');
            await storage.clear();
            return {
                success: true,
                output: {
                    action: 'clear',
                    message: 'Storage cleared successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_CLEAR_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to clear storage',
                    details: error,
                },
            };
        }
    },
};
/**
 * All storage tools
 */
export const storageTools = [
    getStorageItemTool,
    setStorageItemTool,
    removeStorageItemTool,
    hasStorageKeyTool,
    listStorageKeysTool,
    getAllStorageTool,
    clearStorageTool,
];
