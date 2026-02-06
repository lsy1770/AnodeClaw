/**
 * Device Tools
 *
 * Built-in tools for device information and interaction
 * Based on anode-api.d.ts definitions
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Get Device Info Tool
 */
export const getDeviceInfoTool = {
    name: 'get_device_info',
    description: 'Get information about the Android device (model, brand, version, screen size, etc.)',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting device information');
            // getDeviceInfo is synchronous
            const deviceInfo = device.getDeviceInfo();
            return {
                success: true,
                output: deviceInfo,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get device info',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Battery Info Tool
 */
export const getBatteryInfoTool = {
    name: 'get_battery_info',
    description: 'Get battery status and level',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting battery information');
            // getBatteryInfo is synchronous
            const batteryInfo = device.getBatteryInfo();
            return {
                success: true,
                output: batteryInfo,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'BATTERY_INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get battery info',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Storage Info Tool
 */
export const getStorageInfoTool = {
    name: 'get_storage_info',
    description: 'Get storage (disk) information',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting storage information');
            // getStorageInfo is synchronous
            const storageInfo = device.getStorageInfo();
            return {
                success: true,
                output: storageInfo,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'STORAGE_INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get storage info',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Memory Info Tool
 */
export const getMemoryInfoTool = {
    name: 'get_memory_info',
    description: 'Get memory (RAM) information',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting memory information');
            // getMemoryInfo is synchronous
            const memoryInfo = device.getMemoryInfo();
            return {
                success: true,
                output: memoryInfo,
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'MEMORY_INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get memory info',
                    details: error,
                },
            };
        }
    },
};
/**
 * Show Toast Tool
 */
export const showToastTool = {
    name: 'show_toast',
    description: 'Show a toast message on the Android device',
    category: 'ui',
    permissions: ['ui:toast'],
    parallelizable: true,
    parameters: [
        {
            name: 'message',
            description: 'Message to display',
            schema: z.string(),
            required: true,
        },
        {
            name: 'duration',
            description: 'Toast duration: "short" or "long" (default: short)',
            schema: z.enum(['short', 'long']),
            required: false,
            default: 'short',
        },
    ],
    async execute(params, options) {
        try {
            const { message, duration = 'short' } = params;
            logger.debug(`Showing toast: "${message}" (${duration})`);
            // toast is synchronous and takes duration as string
            globalApi.toast(message, duration);
            return {
                success: true,
                output: {
                    action: 'show_toast',
                    message,
                    duration,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'TOAST_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to show toast',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Current App Tool
 */
export const getCurrentAppTool = {
    name: 'get_current_app',
    description: 'Get information about the currently running app',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting current app information');
            const packageName = await auto.getCurrentPackage();
            const activityName = await auto.getCurrentActivity();
            return {
                success: true,
                output: {
                    packageName: packageName || 'unknown',
                    activityName: activityName || 'unknown',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'APP_INFO_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get current app',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Clipboard Tool
 */
export const setClipboardTool = {
    name: 'set_clipboard',
    description: 'Set text content to clipboard',
    category: 'device',
    permissions: ['device:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'text',
            description: 'Text to copy to clipboard',
            schema: z.string(),
            required: true,
        },
        {
            name: 'label',
            description: 'Optional label for the clipboard content',
            schema: z.string(),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { text, label } = params;
            logger.debug(`Setting clipboard: "${text.substring(0, 50)}..."`);
            // setClipboard is synchronous
            globalApi.setClipboard(text, label);
            return {
                success: true,
                output: {
                    action: 'set_clipboard',
                    textLength: text.length,
                    label,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CLIPBOARD_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set clipboard',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Clipboard Tool
 */
export const getClipboardTool = {
    name: 'get_clipboard',
    description: 'Get text content from clipboard',
    category: 'device',
    permissions: ['device:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Getting clipboard content');
            // getClipboard is synchronous
            const content = globalApi.getClipboard();
            return {
                success: true,
                output: {
                    content: content || '',
                    hasContent: content !== null && content.length > 0,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CLIPBOARD_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get clipboard',
                    details: error,
                },
            };
        }
    },
};
/**
 * Vibrate Tool
 */
export const vibrateTool = {
    name: 'vibrate',
    description: 'Vibrate the device for a specified duration',
    category: 'device',
    permissions: ['device:interact'],
    parallelizable: true,
    parameters: [
        {
            name: 'duration',
            description: 'Vibration duration in milliseconds (default: 200)',
            schema: z.number().int().min(0).max(10000),
            required: false,
            default: 200,
        },
    ],
    async execute(params, options) {
        try {
            const { duration = 200 } = params;
            logger.debug(`Vibrating for ${duration}ms`);
            await device.vibrate(duration);
            return {
                success: true,
                output: {
                    action: 'vibrate',
                    duration,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'VIBRATE_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to vibrate',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Brightness Tool
 */
export const setBrightnessTool = {
    name: 'set_brightness',
    description: 'Set screen brightness (0-255)',
    category: 'device',
    permissions: ['device:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'brightness',
            description: 'Brightness level (0-255)',
            schema: z.number().int().min(0).max(255),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { brightness } = params;
            logger.debug(`Setting brightness to ${brightness}`);
            await device.setBrightness(brightness);
            return {
                success: true,
                output: {
                    action: 'set_brightness',
                    brightness,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'BRIGHTNESS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set brightness',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Volume Tool
 */
export const setVolumeTool = {
    name: 'set_volume',
    description: 'Set device volume',
    category: 'device',
    permissions: ['device:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'volume',
            description: 'Volume level',
            schema: z.number().int().min(0),
            required: true,
        },
        {
            name: 'streamType',
            description: 'Stream type (0=voice, 1=system, 2=ring, 3=music, 4=alarm, 5=notification)',
            schema: z.number().int().min(0).max(10),
            required: false,
            default: 3, // Music stream
        },
    ],
    async execute(params, options) {
        try {
            const { volume, streamType = 3 } = params;
            logger.debug(`Setting volume to ${volume} (stream: ${streamType})`);
            await device.setVolume(volume, streamType);
            return {
                success: true,
                output: {
                    action: 'set_volume',
                    volume,
                    streamType,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'VOLUME_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set volume',
                    details: error,
                },
            };
        }
    },
};
/**
 * Open Settings Tool
 */
export const openSettingsTool = {
    name: 'open_settings',
    description: 'Open Android settings screen',
    category: 'device',
    permissions: ['device:interact'],
    parallelizable: true,
    parameters: [
        {
            name: 'settingType',
            description: 'Type of settings to open (e.g., "wifi", "bluetooth", "display", "sound", "battery", "storage", "apps")',
            schema: z.string(),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { settingType } = params;
            logger.debug(`Opening settings: ${settingType || 'main'}`);
            // openSettings is synchronous
            globalApi.openSettings(settingType);
            return {
                success: true,
                output: {
                    action: 'open_settings',
                    settingType: settingType || 'main',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SETTINGS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to open settings',
                    details: error,
                },
            };
        }
    },
};
/**
 * Keep Screen On Tool
 */
export const keepScreenOnTool = {
    name: 'keep_screen_on',
    description: 'Keep the screen on or allow it to turn off',
    category: 'device',
    permissions: ['device:write'],
    parallelizable: true,
    parameters: [
        {
            name: 'enabled',
            description: 'Whether to keep the screen on (default: true)',
            schema: z.boolean(),
            required: false,
            default: true,
        },
    ],
    async execute(params, options) {
        try {
            const { enabled = true } = params;
            logger.debug(`Keep screen on: ${enabled}`);
            await device.keepScreenOn(enabled);
            return {
                success: true,
                output: {
                    action: 'keep_screen_on',
                    enabled,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'KEEP_SCREEN_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set keep screen on',
                    details: error,
                },
            };
        }
    },
};
/**
 * All device tools
 */
export const deviceTools = [
    getDeviceInfoTool,
    getBatteryInfoTool,
    getStorageInfoTool,
    getMemoryInfoTool,
    showToastTool,
    getCurrentAppTool,
    setClipboardTool,
    getClipboardTool,
    vibrateTool,
    setBrightnessTool,
    setVolumeTool,
    openSettingsTool,
    keepScreenOnTool,
];
