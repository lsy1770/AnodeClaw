/**
 * Notification Manager - System notification integration
 *
 * Provides quick access to the AI assistant through notification bar.
 * Uses Anode global `notification` API for system notifications
 * and `floatingWindow` API for quick message dialog.
 */
import { logger } from '../utils/logger.js';
/**
 * Notification Manager Class
 *
 * Manages persistent notification for quick AI access.
 * Integrates with Anode NotificationAPI and FloatingWindowAPI.
 */
export class NotificationManager {
    constructor() {
        this.notificationId = null;
        this.isActive = false;
        this.quickMsgWindowCreated = false;
    }
    /**
     * Show persistent notification with actions
     */
    async show() {
        if (this.isActive) {
            logger.debug('Notification already active');
            return;
        }
        // Check if notification permission is available
        if (typeof notification !== 'undefined' && !notification.isEnabled) {
            logger.warn('[NotificationManager] Notification permission not granted');
        }
        try {
            this.notificationId = await notification.show('Anode ClawdBot', '点击打开 AI 助手', {
                autoCancel: false,
                actions: [
                    { title: '打开' },
                    { title: '快速消息' },
                ],
            });
            this.isActive = true;
            logger.info(`[NotificationManager] Notification shown (id: ${this.notificationId})`);
        }
        catch (error) {
            logger.error('[NotificationManager] Failed to show notification:', error);
            throw error;
        }
    }
    /**
     * Hide notification
     */
    async hide() {
        if (this.notificationId === null || !this.isActive) {
            return;
        }
        try {
            await notification.cancel(this.notificationId);
            this.notificationId = null;
            this.isActive = false;
            logger.info('[NotificationManager] Notification hidden');
        }
        catch (error) {
            logger.error('[NotificationManager] Failed to hide notification:', error);
        }
    }
    /**
     * Update notification message text
     */
    async update(message) {
        if (this.notificationId === null || !this.isActive) {
            return;
        }
        try {
            // Re-show with updated content (Anode notification API updates via re-show)
            this.notificationId = await notification.show('Anode ClawdBot', message, {
                autoCancel: false,
                actions: [
                    { title: '打开' },
                    { title: '快速消息' },
                ],
            });
            logger.debug(`[NotificationManager] Updated: ${message}`);
        }
        catch (error) {
            logger.error('[NotificationManager] Failed to update notification:', error);
        }
    }
    /**
     * Show progress notification (for long-running tasks)
     */
    async showProgress(title, progress, max = 100) {
        try {
            if (this.notificationId !== null) {
                await notification.updateProgress(this.notificationId, progress, max);
            }
            else {
                this.notificationId = await notification.show(title, `${progress}/${max}`, {
                    progress,
                    autoCancel: false,
                });
            }
        }
        catch (error) {
            logger.error('[NotificationManager] Failed to show progress:', error);
        }
    }
    /**
     * Show a temporary notification message
     */
    async showMessage(title, message, duration = 3000) {
        try {
            const msgId = await notification.show(title, message, {
                autoCancel: true,
                bigText: message,
            });
            // Auto-cancel after duration
            if (duration > 0) {
                setTimeout(async () => {
                    try {
                        await notification.cancel(msgId);
                    }
                    catch {
                        // Ignore cancel errors (may already be dismissed)
                    }
                }, duration);
            }
            logger.info(`[NotificationManager] Message: ${title} - ${message}`);
        }
        catch (error) {
            // Fallback to toast if notification fails
            logger.warn('[NotificationManager] Notification failed, falling back to toast');
            try {
                ui.showToast(`${title}: ${message}`, duration);
            }
            catch {
                logger.error('[NotificationManager] Both notification and toast failed');
            }
        }
    }
    /**
     * Set callback for "open window" action
     */
    onShowWindow(callback) {
        this.onShowWindowCallback = callback;
    }
    /**
     * Set callback for quick message
     */
    onQuickMessage(callback) {
        this.onQuickMessageCallback = callback;
    }
    /**
     * Show quick message dialog using FloatingWindow
     */
    async showQuickMessageDialog() {
        if (typeof floatingWindow === 'undefined') {
            logger.warn('[NotificationManager] FloatingWindowAPI not available');
            return;
        }
        if (!floatingWindow.checkOverlayPermission()) {
            logger.warn('[NotificationManager] Overlay permission not granted');
            return;
        }
        try {
            // Create a small floating dialog for quick input
            const dialogXml = `
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:background="#FFFFFF"
    android:padding="16dp"
    android:elevation="8dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="快速消息"
        android:textSize="16sp"
        android:textColor="#6200EA"
        android:textStyle="bold"
        android:layout_marginBottom="12dp"/>

    <EditText
        android:id="@+id/quick_msg_input"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:hint="输入消息..."
        android:inputType="text"
        android:padding="12dp"
        android:background="#F5F5F5"
        android:singleLine="true"/>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:gravity="end"
        android:layout_marginTop="12dp">

        <Button
            android:id="@+id/quick_msg_cancel"
            android:layout_width="wrap_content"
            android:layout_height="36dp"
            android:text="取消"
            android:textColor="#666666"
            android:background="#EEEEEE"
            android:layout_marginRight="8dp"
            android:paddingLeft="16dp"
            android:paddingRight="16dp"/>

        <Button
            android:id="@+id/quick_msg_send"
            android:layout_width="wrap_content"
            android:layout_height="36dp"
            android:text="发送"
            android:textColor="#FFFFFF"
            android:background="#6200EA"
            android:paddingLeft="16dp"
            android:paddingRight="16dp"/>
    </LinearLayout>
</LinearLayout>`;
            floatingWindow.create(dialogXml);
            floatingWindow.setSize(350, 200);
            floatingWindow.setPosition(100, 300);
            floatingWindow.setFocusable(true);
            floatingWindow.setTouchable(true);
            floatingWindow.show();
            this.quickMsgWindowCreated = true;
            // Handle send
            floatingWindow.on('quick_msg_send', 'click', () => {
                const inputView = floatingWindow.findView('quick_msg_input');
                if (inputView) {
                    const text = floatingWindow.getText(inputView);
                    if (text && text.trim() && this.onQuickMessageCallback) {
                        this.onQuickMessageCallback(text.trim());
                    }
                }
                this.closeQuickMessageDialog();
            });
            // Handle cancel
            floatingWindow.on('quick_msg_cancel', 'click', () => {
                this.closeQuickMessageDialog();
            });
            logger.debug('[NotificationManager] Quick message dialog shown');
        }
        catch (error) {
            logger.error('[NotificationManager] Failed to show quick message dialog:', error);
        }
    }
    /**
     * Close quick message dialog
     */
    closeQuickMessageDialog() {
        if (this.quickMsgWindowCreated) {
            try {
                floatingWindow.close();
                this.quickMsgWindowCreated = false;
            }
            catch {
                // Ignore
            }
        }
    }
    /**
     * Shutdown - cancel all notifications and dialogs
     */
    async shutdown() {
        this.closeQuickMessageDialog();
        await this.hide();
        logger.info('[NotificationManager] Shutdown complete');
    }
}
