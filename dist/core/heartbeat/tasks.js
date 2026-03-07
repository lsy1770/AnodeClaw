/**
 * Built-in Heartbeat Tasks
 *
 * Factory functions for common scheduled tasks
 */
import { logger } from '../../utils/logger.js';
/**
 * Create a battery/device status check task
 */
export function createStatusCheckTask(options = {}) {
    const { batteryThreshold = 20, interval = 30 * 60 * 1000, onLowBattery, } = options;
    return {
        id: 'builtin:status-check',
        name: 'Device Status Check',
        description: `Checks battery and device status every ${Math.round(interval / 60000)} minutes`,
        schedule: { type: 'interval', interval },
        enabled: true,
        handler: async () => {
            try {
                const batteryInfo = await device.getBatteryInfo();
                logger.debug(`[StatusCheck] Battery: ${batteryInfo.level}%, charging: ${batteryInfo.isCharging}`);
                if (batteryInfo.level < batteryThreshold && !batteryInfo.isCharging) {
                    logger.warn(`[StatusCheck] Low battery: ${batteryInfo.level}%`);
                    await ui.showToast(`Low battery: ${batteryInfo.level}%`, 3500);
                    if (onLowBattery) {
                        onLowBattery(batteryInfo.level);
                    }
                }
            }
            catch (error) {
                logger.error('[StatusCheck] Failed to check device status:', error);
            }
        },
        onError: (error) => {
            logger.error('[StatusCheck] Task error:', error.message);
        },
    };
}
/**
 * Create a reminder task (one-time)
 */
export function createReminderTask(options) {
    const { id, message, time, onRemind } = options;
    return {
        id: `reminder:${id}`,
        name: `Reminder: ${message.slice(0, 30)}`,
        description: message,
        schedule: { type: 'once', time },
        enabled: true,
        handler: async () => {
            logger.info(`[Reminder] ${message}`);
            await ui.showToast(message, 3500);
            if (onRemind) {
                onRemind(message);
            }
        },
    };
}
/**
 * Create a data cleanup task
 */
export function createCleanupTask(options = {}) {
    const { sessionsDir = 'data/sessions', maxAge = 30 * 24 * 60 * 60 * 1000, // 30 days
    cron = '0 3 * * 0', // Sunday 3 AM
     } = options;
    return {
        id: 'builtin:cleanup',
        name: 'Data Cleanup',
        description: 'Cleans up old session data and logs',
        schedule: { type: 'cron', cron },
        enabled: true,
        handler: async () => {
            logger.info('[Cleanup] Starting data cleanup...');
            const now = Date.now();
            let cleaned = 0;
            try {
                if (!file.exists(sessionsDir)) {
                    logger.debug('[Cleanup] Sessions directory does not exist, skipping');
                    return;
                }
                const files = await file.listFiles(sessionsDir);
                for (const f of files) {
                    if (!f.isDirectory && (now - f.lastModified > maxAge)) {
                        try {
                            await file.delete(f.path);
                            cleaned++;
                        }
                        catch (e) {
                            logger.warn(`[Cleanup] Failed to delete: ${f.path}`);
                        }
                    }
                }
                logger.info(`[Cleanup] Cleaned up ${cleaned} old files`);
            }
            catch (error) {
                logger.error('[Cleanup] Cleanup failed:', error);
            }
        },
    };
}
// createDailyLogArchivalTask removed — daily log replaced by ActivityLog + context_checkpoint
