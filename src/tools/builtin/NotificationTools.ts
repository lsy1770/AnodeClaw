/**
 * Notification Tools
 *
 * Built-in tools for Android notifications using Anode notification
 * Based on anode-api.d.ts definitions
 */

import { z } from 'zod';
import type { Tool, ToolResult, ToolExecutionOptions } from '../types.js';
import { logger } from '../../utils/logger.js';

// Anode notification global (based on anode-api.d.ts)
declare const notification: {
  show(title: string, content: string, options?: Record<string, any> | null): Promise<number>;
  updateProgress(id: number, progress: number, max?: number): Promise<any>;
  cancel(id: number): Promise<any>;
  cancelAll(): Promise<any>;
};

/**
 * Show Notification Tool
 */
export const showNotificationTool: Tool = {
  name: 'show_notification',
  description: 'Show an Android notification',
  category: 'notification',
  permissions: ['notification:show'],
  parallelizable: true,

  parameters: [
    {
      name: 'title',
      description: 'Notification title',
      schema: z.string(),
      required: true,
    },
    {
      name: 'content',
      description: 'Notification content text',
      schema: z.string(),
      required: true,
    },
    {
      name: 'options',
      description: 'Additional notification options (priority, channelId, etc.)',
      schema: z.record(z.any()),
      required: false,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { title, content, options: notifOptions } = params;

      logger.debug(`Showing notification: ${title}`);

      const notificationId = await notification.show(title, content, notifOptions || null);

      return {
        success: true,
        output: {
          action: 'show_notification',
          notificationId,
          title,
          message: 'Notification shown successfully',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'SHOW_NOTIFICATION_FAILED',
          message: error instanceof Error ? error.message : 'Failed to show notification',
          details: error,
        },
      };
    }
  },
};

/**
 * Update Notification Progress Tool
 */
export const updateNotificationProgressTool: Tool = {
  name: 'update_notification_progress',
  description: 'Update the progress bar of a notification',
  category: 'notification',
  permissions: ['notification:show'],
  parallelizable: true,

  parameters: [
    {
      name: 'id',
      description: 'Notification ID (returned from show_notification)',
      schema: z.number().int(),
      required: true,
    },
    {
      name: 'progress',
      description: 'Current progress value',
      schema: z.number().int().min(0),
      required: true,
    },
    {
      name: 'max',
      description: 'Maximum progress value (default: 100)',
      schema: z.number().int().min(1),
      required: false,
      default: 100,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { id, progress, max = 100 } = params;

      logger.debug(`Updating notification ${id} progress: ${progress}/${max}`);

      await notification.updateProgress(id, progress, max);

      return {
        success: true,
        output: {
          action: 'update_progress',
          notificationId: id,
          progress,
          max,
          percent: Math.round((progress / max) * 100),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'UPDATE_PROGRESS_FAILED',
          message: error instanceof Error ? error.message : 'Failed to update notification progress',
          details: error,
        },
      };
    }
  },
};

/**
 * Cancel Notification Tool
 */
export const cancelNotificationTool: Tool = {
  name: 'cancel_notification',
  description: 'Cancel a specific notification by ID',
  category: 'notification',
  permissions: ['notification:cancel'],
  parallelizable: true,

  parameters: [
    {
      name: 'id',
      description: 'Notification ID to cancel',
      schema: z.number().int(),
      required: true,
    },
  ],

  async execute(params, options): Promise<ToolResult> {
    try {
      const { id } = params;

      logger.debug(`Canceling notification: ${id}`);

      await notification.cancel(id);

      return {
        success: true,
        output: {
          action: 'cancel_notification',
          notificationId: id,
          message: 'Notification canceled',
        },
      };
    } catch (error) {
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
 * Cancel All Notifications Tool
 */
export const cancelAllNotificationsTool: Tool = {
  name: 'cancel_all_notifications',
  description: 'Cancel all notifications from this app',
  category: 'notification',
  permissions: ['notification:cancel'],
  parallelizable: false,

  parameters: [],

  async execute(params, options): Promise<ToolResult> {
    try {
      logger.debug('Canceling all notifications');

      await notification.cancelAll();

      return {
        success: true,
        output: {
          action: 'cancel_all_notifications',
          message: 'All notifications canceled',
        },
      };
    } catch (error) {
      return {
        success: false,
        error: {
          code: 'CANCEL_ALL_FAILED',
          message: error instanceof Error ? error.message : 'Failed to cancel all notifications',
          details: error,
        },
      };
    }
  },
};

/**
 * All notification tools
 */
export const notificationTools: Tool[] = [
  showNotificationTool,
  updateNotificationProgressTool,
  cancelNotificationTool,
  cancelAllNotificationsTool,
];
