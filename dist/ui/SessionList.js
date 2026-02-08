/**
 * Session List - Session management UI
 *
 * Floating window for viewing and managing conversation sessions
 */
import { createSessionListItem } from './utils.js';
import { logger } from '../utils/logger.js';
/**
 * Session List Class
 *
 * UI component for session management
 */
export class SessionList {
    constructor(agentManager) {
        this.isVisible = false;
        this.sessions = [];
        this.agentManager = agentManager;
    }
    /**
     * Show the session list
     */
    async show(config = {}) {
        if (this.isVisible) {
            logger.debug('Session list already visible');
            return;
        }
        // Load sessions
        await this.loadSessions();
        const xml = this.createLayout();
        // Create floating window with correct API pattern
        floatingWindow.create(xml);
        floatingWindow.setSize(config.width ?? 600, config.height ?? 800);
        floatingWindow.setPosition(config.x ?? 100, config.y ?? 150);
        // Setup event listeners
        this.setupEventListeners();
        // Show window (no parameters)
        floatingWindow.show();
        this.isVisible = true;
        // Populate session list
        this.populateSessionList();
        logger.info('Session list shown');
    }
    /**
     * Hide the session list
     */
    hide() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.hide(); // No parameters
        this.isVisible = false;
        logger.info('Session list hidden');
    }
    /**
     * Close the session list
     */
    close() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.close(); // No parameters
        this.isVisible = false;
        logger.info('Session list closed');
    }
    /**
     * Set session select callback
     */
    onSessionSelect(callback) {
        this.onSessionSelectCallback = callback;
    }
    /**
     * Set new session callback
     */
    onNewSession(callback) {
        this.onNewSessionCallback = callback;
    }
    /**
     * Set delete session callback
     */
    onDeleteSession(callback) {
        this.onDeleteSessionCallback = callback;
    }
    /**
     * Refresh session list
     */
    async refresh() {
        await this.loadSessions();
        this.populateSessionList();
    }
    /**
     * Create layout XML
     */
    createLayout() {
        return `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#CC1E1E1E">

    <!-- Top Toolbar -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="44dp"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:background="#DD2A2A2A"
        android:paddingStart="12dp"
        android:paddingEnd="8dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="会话列表"
            android:textSize="14sp"
            android:textColor="#80CBC4"
            android:textStyle="bold"/>

        <Button
            android:id="@+id/btn_new_session"
            android:layout_width="36dp"
            android:layout_height="36dp"
            android:text="＋"
            android:textSize="18sp"
            android:textColor="#EAEAEA"
            android:background="#00000000"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>

        <Button
            android:id="@+id/btn_close"
            android:layout_width="36dp"
            android:layout_height="36dp"
            android:text="✕"
            android:textSize="16sp"
            android:textColor="#EAEAEA"
            android:background="#00000000"
            android:layout_marginStart="4dp"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>
    </LinearLayout>

    <!-- Session List ScrollView -->
    <ScrollView
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:scrollbars="vertical">

        <LinearLayout
            android:id="@+id/session_list_container"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"/>
    </ScrollView>

    <!-- Empty State (initially hidden) -->
    <LinearLayout
        android:id="@+id/empty_state"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:orientation="vertical"
        android:gravity="center"
        android:visibility="gone">

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="暂无会话"
            android:textSize="16sp"
            android:textColor="#AAAAAA"/>

        <Button
            android:id="@+id/btn_create_first"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="创建新会话"
            android:textColor="#80CBC4"
            android:background="#00000000"
            android:layout_marginTop="16dp"/>
    </LinearLayout>
</LinearLayout>`;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Click events - on() returns boolean, not Promise
        const clickSuccess = floatingWindow.on('click', (event) => {
            try {
                if (event.viewId === 'btn_close') {
                    this.hide();
                }
                else if (event.viewId === 'btn_new_session' || event.viewId === 'btn_create_first') {
                    if (this.onNewSessionCallback) {
                        this.onNewSessionCallback();
                    }
                }
                else if (event.viewId.startsWith('session_')) {
                    // Session item clicked
                    const sessionId = event.viewId.replace('session_', '');
                    if (this.onSessionSelectCallback) {
                        this.onSessionSelectCallback(sessionId);
                    }
                }
                else if (event.viewId.startsWith('delete_')) {
                    // Delete button clicked
                    const sessionId = event.viewId.replace('delete_', '');
                    this.handleDeleteSession(sessionId);
                }
            }
            catch (error) {
                logger.error('Error handling click event:', error);
            }
        });
        if (!clickSuccess) {
            logger.error('Failed to register click event listener');
        }
        // Long click events for session options
        const longClickSuccess = floatingWindow.on('longClick', (event) => {
            if (event.viewId.startsWith('session_')) {
                const sessionId = event.viewId.replace('session_', '');
                this.showSessionOptions(sessionId);
            }
        });
        if (!longClickSuccess) {
            logger.error('Failed to register longClick event listener');
        }
    }
    /**
     * Load sessions from agent manager
     */
    async loadSessions() {
        try {
            const sessionIds = this.agentManager.getActiveSessions();
            this.sessions = [];
            for (const sessionId of sessionIds) {
                const session = this.agentManager.getSession(sessionId);
                if (!session) {
                    continue;
                }
                // Get session info
                const messages = session.getMessageTree();
                const messageCount = messages.size;
                // Get last message
                let lastMessage = '';
                let lastUpdated = Date.now();
                // Get context to find last message
                const context = session.buildContext();
                if (context.length > 0) {
                    const lastMsg = context[context.length - 1];
                    if (lastMsg && lastMsg.role !== 'system') {
                        lastMessage = typeof lastMsg.content === 'string'
                            ? lastMsg.content
                            : JSON.stringify(lastMsg.content);
                        lastUpdated = lastMsg.timestamp;
                    }
                }
                this.sessions.push({
                    sessionId,
                    title: `会话 ${sessionId.substring(0, 8)}`,
                    lastMessage,
                    lastUpdated,
                    messageCount,
                });
            }
            // Sort by last updated (most recent first)
            this.sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
        }
        catch (error) {
            logger.error('Error loading sessions:', error);
        }
    }
    /**
     * Populate session list in UI
     */
    populateSessionList() {
        if (this.sessions.length === 0) {
            // Show empty state
            // This would need FloatingWindowAPI support for visibility changes
            logger.debug('No sessions to display');
            return;
        }
        // Clear existing items (would need API support for clearing container)
        // Add session items
        for (const session of this.sessions) {
            const itemXml = createSessionListItem(session);
            // Use addView instead of appendView
            floatingWindow.addView(itemXml);
        }
    }
    /**
     * Handle delete session
     */
    async handleDeleteSession(sessionId) {
        try {
            // Confirm deletion (would need dialog support)
            logger.info(`Deleting session: ${sessionId}`);
            // Delete from agent manager
            await this.agentManager.deleteSession(sessionId);
            // Refresh list
            await this.refresh();
            // Notify callback
            if (this.onDeleteSessionCallback) {
                this.onDeleteSessionCallback(sessionId);
            }
        }
        catch (error) {
            logger.error('Error deleting session:', error);
        }
    }
    /**
     * Show session options (long press menu)
     */
    showSessionOptions(sessionId) {
        // This would need dialog/menu support from FloatingWindowAPI
        logger.debug(`Show options for session: ${sessionId}`);
    }
}
