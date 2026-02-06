/**
 * Notification Listener Tools
 *
 * Built-in tools for notification listening using Anode notificationListener
 * Based on NotificationListenerAPI.kt
 */
import { z } from 'zod';
import { logger } from '../../utils/logger.js';
/**
 * Check Notification Listener Status Tool
 */
export const checkNotificationListenerStatusTool = {
    name: 'check_notification_listener_status',
    description: 'Check if the notification listener service is enabled and connected',
    category: 'notification',
    permissions: ['notification:read'],
    parallelizable: true,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Checking notification listener status');
            // isEnabled and isConnected are synchronous properties
            const isEnabled = notificationListener.isEnabled;
            const isConnected = notificationListener.isConnected;
            const listenerCount = notificationListener.listenerCount;
            return {
                success: true,
                output: {
                    isEnabled,
                    isConnected,
                    listenerCount,
                    message: isEnabled
                        ? isConnected
                            ? 'Notification listener is enabled and connected'
                            : 'Notification listener is enabled but not connected'
                        : 'Notification listener is not enabled',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CHECK_STATUS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to check notification listener status',
                    details: error,
                },
            };
        }
    },
};
/**
 * Open Notification Listener Settings Tool
 */
export const openNotificationListenerSettingsTool = {
    name: 'open_notification_listener_settings',
    description: 'Open the notification listener settings page to enable the service',
    category: 'notification',
    permissions: ['notification:settings'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Opening notification listener settings');
            const result = await notificationListener.openSettings();
            return {
                success: true,
                output: {
                    action: 'open_settings',
                    opened: result,
                    message: result
                        ? 'Notification listener settings opened successfully'
                        : 'Failed to open notification listener settings',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'OPEN_SETTINGS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to open notification listener settings',
                    details: error,
                },
            };
        }
    },
};
/**
 * Get Active Notifications Tool
 */
export const getActiveNotificationsTool = {
    name: 'get_active_notifications',
    description: 'Get the list of currently active notifications, optionally filtered by package name',
    category: 'notification',
    permissions: ['notification:read'],
    parallelizable: true,
    parameters: [
        {
            name: 'packageName',
            description: 'Optional package name to filter notifications (e.g., "com.tencent.mm" for WeChat)',
            schema: z.string().optional(),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { packageName } = params;
            logger.debug(`Getting active notifications${packageName ? ` for ${packageName}` : ''}`);
            const notifications = packageName
                ? await notificationListener.getActiveNotificationsFiltered(packageName)
                : await notificationListener.getActiveNotifications();
            return {
                success: true,
                output: {
                    notifications,
                    count: notifications.length,
                    filter: packageName || null,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'GET_NOTIFICATIONS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to get active notifications',
                    details: error,
                },
            };
        }
    },
};
/**
 * Set Notification Filter Tool
 */
export const setNotificationFilterTool = {
    name: 'set_notification_filter',
    description: 'Set package name filter for notification listening. Only notifications from specified packages will be processed.',
    category: 'notification',
    permissions: ['notification:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'packageNames',
            description: 'Array of package names to monitor (e.g., ["com.tencent.mm", "com.tencent.mobileqq"]). Pass empty array or null to monitor all.',
            schema: z.array(z.string()).nullable().optional(),
            required: false,
        },
    ],
    async execute(params, options) {
        try {
            const { packageNames } = params;
            logger.debug(`Setting notification filter: ${packageNames ? JSON.stringify(packageNames) : 'all'}`);
            // setFilter is synchronous
            notificationListener.setFilter(packageNames || null);
            return {
                success: true,
                output: {
                    action: 'set_filter',
                    filter: packageNames || null,
                    message: packageNames && packageNames.length > 0
                        ? `Now monitoring notifications from: ${packageNames.join(', ')}`
                        : 'Now monitoring all notifications',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'SET_FILTER_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to set notification filter',
                    details: error,
                },
            };
        }
    },
};
/**
 * Cancel Notification Tool
 */
export const cancelNotificationTool = {
    name: 'cancel_notification',
    description: 'Cancel (dismiss) a specific notification by its key',
    category: 'notification',
    permissions: ['notification:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'key',
            description: 'The notification key to cancel',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { key } = params;
            logger.debug(`Canceling notification: ${key}`);
            const result = await notificationListener.cancelNotification(key);
            return {
                success: true,
                output: {
                    action: 'cancel_notification',
                    key,
                    cancelled: result,
                    message: result
                        ? `Notification ${key} cancelled successfully`
                        : `Failed to cancel notification ${key}`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CANCEL_NOTIFICATION_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to cancel notification',
                    details: error,
                },
            };
        }
    },
};
/**
 * Cancel Notifications by Package Tool
 */
export const cancelNotificationsByPackageTool = {
    name: 'cancel_notifications_by_package',
    description: 'Cancel (dismiss) all notifications from a specific package',
    category: 'notification',
    permissions: ['notification:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'packageName',
            description: 'The package name whose notifications to cancel (e.g., "com.tencent.mm")',
            schema: z.string(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { packageName } = params;
            logger.debug(`Canceling notifications for package: ${packageName}`);
            const count = await notificationListener.cancelNotificationsByPackage(packageName);
            return {
                success: true,
                output: {
                    action: 'cancel_notifications_by_package',
                    packageName,
                    cancelledCount: count,
                    message: `Cancelled ${count} notification(s) from ${packageName}`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'CANCEL_NOTIFICATIONS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to cancel notifications by package',
                    details: error,
                },
            };
        }
    },
};
/**
 * Remove Notification Listener Tool
 */
export const removeNotificationListenerTool = {
    name: 'remove_notification_listener',
    description: 'Remove a specific notification listener by its ID',
    category: 'notification',
    permissions: ['notification:write'],
    parallelizable: false,
    parameters: [
        {
            name: 'listenerId',
            description: 'The listener ID to remove',
            schema: z.number(),
            required: true,
        },
    ],
    async execute(params, options) {
        try {
            const { listenerId } = params;
            logger.debug(`Removing notification listener: ${listenerId}`);
            // off is synchronous
            const result = notificationListener.off(listenerId);
            return {
                success: true,
                output: {
                    action: 'remove_listener',
                    listenerId,
                    removed: result,
                    message: result
                        ? `Listener ${listenerId} removed successfully`
                        : `Listener ${listenerId} not found`,
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'REMOVE_LISTENER_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to remove notification listener',
                    details: error,
                },
            };
        }
    },
};
/**
 * Remove All Notification Listeners Tool
 */
export const removeAllNotificationListenersTool = {
    name: 'remove_all_notification_listeners',
    description: 'Remove all registered notification listeners',
    category: 'notification',
    permissions: ['notification:write'],
    parallelizable: false,
    parameters: [],
    async execute(params, options) {
        try {
            logger.debug('Removing all notification listeners');
            // removeAllListeners is synchronous
            notificationListener.removeAllListeners();
            return {
                success: true,
                output: {
                    action: 'remove_all_listeners',
                    message: 'All notification listeners removed successfully',
                },
            };
        }
        catch (error) {
            return {
                success: false,
                error: {
                    code: 'REMOVE_ALL_LISTENERS_FAILED',
                    message: error instanceof Error ? error.message : 'Failed to remove all notification listeners',
                    details: error,
                },
            };
        }
    },
};
/**
 * All notification listener tools
 */
export const notificationListenerTools = [
    checkNotificationListenerStatusTool,
    openNotificationListenerSettingsTool,
    getActiveNotificationsTool,
    setNotificationFilterTool,
    cancelNotificationTool,
    cancelNotificationsByPackageTool,
    removeNotificationListenerTool,
    removeAllNotificationListenersTool,
];
