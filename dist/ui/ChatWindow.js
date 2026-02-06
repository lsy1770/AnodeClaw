/**
 * Chat Window - Main conversation interface
 *
 * Floating window-based chat interface for user interactions
 */
import { createMessageBubble, createThinkingIndicator, generateViewId } from './utils.js';
import { logger } from '../utils/logger.js';
/**
 * Chat Window Class
 *
 * Main UI component for AI conversation
 */
export class ChatWindow {
    constructor(agentManager) {
        this.currentSessionId = null;
        this.isVisible = false;
        this.messageViewIds = [];
        this.agentManager = agentManager;
    }
    /**
     * Show the chat window
     */
    async show(config = {}) {
        if (this.isVisible) {
            logger.debug('Chat window already visible');
            return;
        }
        const xml = this.createMainLayout();
        // Create floating window with correct API pattern
        floatingWindow.create(xml);
        floatingWindow.setSize(config.width ?? 700, config.height ?? 1000);
        floatingWindow.setPosition(config.x ?? 50, config.y ?? 100);
        floatingWindow.setFocusable(false);
        floatingWindow.setTouchable(true);
        // Setup event listeners
        this.setupEventListeners();
        // Show window (no parameters)
        floatingWindow.show();
        this.isVisible = true;
        // Initialize session
        await this.initializeSession();
        logger.info('Chat window shown');
    }
    /**
     * Hide the chat window
     */
    hide() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.setFocusable(false);
        floatingWindow.hide();
        this.isVisible = false;
        logger.info('Chat window hidden');
    }
    /**
     * Close the chat window
     */
    close() {
        if (!this.isVisible) {
            return;
        }
        floatingWindow.setFocusable(false);
        floatingWindow.close();
        this.isVisible = false;
        logger.info('Chat window closed');
    }
    /**
     * Set session change callback
     */
    onSessionChange(callback) {
        this.onSessionChangeCallback = callback;
    }
    /**
     * Set settings callback
     */
    onSettings(callback) {
        this.onSettingsCallback = callback;
    }
    /**
     * Get current session ID
     */
    getCurrentSessionId() {
        return this.currentSessionId;
    }
    /**
     * Switch to a different session
     */
    async switchSession(sessionId) {
        this.currentSessionId = sessionId;
        // Clear current messages
        this.clearMessages();
        // Load session history
        await this.loadSessionHistory();
        logger.info(`Switched to session: ${sessionId}`);
    }
    /**
     * Create main layout XML
     */
    createMainLayout() {
        return `<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#FFFFFF">

    <!-- Top Toolbar -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:background="#2196F3"
        android:paddingStart="16dp"
        android:paddingEnd="16dp">

        <TextView
            android:id="@+id/title"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="Anode ClawdBot"
            android:textSize="18sp"
            android:textColor="#FFFFFF"
            android:textStyle="bold"/>

        <TextView
      android:id="@+id/btn_sessions"
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:gravity="center"
      android:text="📋"
      android:textSize="20sp"
      android:background="#00000000"
      android:clickable="true"/>

  <TextView
      android:id="@+id/btn_settings"
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:gravity="center"
      android:text="⚙️"
      android:textSize="20sp"
      android:background="#00000000"
      android:layout_marginStart="8dp"
      android:clickable="true"/>

  <TextView
      android:id="@+id/btn_close"
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:gravity="center"
      android:text="✕"
      android:textSize="20sp"
      android:textColor="#FFFFFF"
      android:background="#00000000"
      android:layout_marginStart="8dp"
      android:clickable="true"/>
    </LinearLayout>

    <!-- Message ScrollView -->
    <ScrollView
        android:id="@+id/scroll_messages"
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:padding="16dp"
        android:scrollbars="vertical">

        <LinearLayout
            android:id="@+id/messages_container"
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"/>
    </ScrollView>

    <!-- Input Area -->
    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:padding="8dp"
        android:background="#F5F5F5"
        android:gravity="center_vertical">

        <EditText
            android:id="@+id/input_message"
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:hint="输入消息..."
            android:padding="12dp"
            android:maxLines="4"
            android:inputType="textMultiLine"/>

        <Button
            android:id="@+id/btn_send"
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="发送"
            android:layout_marginStart="8dp"/>
    </LinearLayout>
</LinearLayout>`;
    }
    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Per-view click handlers using on(viewId, eventType, callback) pattern
        floatingWindow.onView('btn_send', 'click', () => {
            console.log('Send button listener registered:');
            this.handleSendMessage();
        });
        floatingWindow.onView('btn_close', 'click', () => {
            this.hide();
        });
        floatingWindow.onView('btn_sessions', 'click', () => {
            if (this.onSessionChangeCallback) {
                this.onSessionChangeCallback(this.currentSessionId);
            }
        });
        floatingWindow.onView('btn_settings', 'click', () => {
            if (this.onSettingsCallback) {
                this.onSettingsCallback();
            }
        });
        // Input field: toggle focusable on tap so keyboard can open
        floatingWindow.onView('input_message', 'click', () => {
            floatingWindow.setFocusable(true);
            try {
                const inputView = floatingWindow.findView('input_message');
                if (inputView && inputView.requestFocus) {
                    inputView.requestFocus();
                }
            }
            catch (error) {
                logger.debug('Error requesting focus on input:', error);
            }
        });
        // Editor action (Enter key) on input
        floatingWindow.onView('input_message', 'editorAction', (event) => {
            if (event.actionId === 6) {
                // IME_ACTION_DONE
                this.handleSendMessage();
            }
        });
    }
    /**
     * Handle send message
     */
    async handleSendMessage() {
        try {
            // Get input text using findView + getText pattern
            const inputView = floatingWindow.findView('input_message');
            if (!inputView) {
                logger.error('Input view not found');
                return;
            }
            const message = floatingWindow.getText(inputView);
            if (!message || message.trim() === '') {
                return;
            }
            // Clear input using findView + setText pattern
            floatingWindow.setText(inputView, '');
            // Release focus back to underlying app after sending
            floatingWindow.setFocusable(false);
            // Display user message
            this.appendMessage({
                id: generateViewId(),
                role: 'user',
                content: message,
                timestamp: Date.now(),
            });
            // Show thinking indicator
            const thinkingId = generateViewId();
            this.appendThinking(thinkingId);
            try {
                // Send to agent
                const response = await this.agentManager.sendMessage(this.currentSessionId, message);
                // Remove thinking indicator
                this.removeThinking(thinkingId);
                // Display AI response
                this.appendMessage({
                    id: generateViewId(),
                    role: 'assistant',
                    content: response.content,
                    timestamp: Date.now(),
                });
                // Scroll to bottom
                this.scrollToBottom();
            }
            catch (error) {
                this.removeThinking(thinkingId);
                this.appendMessage({
                    id: generateViewId(),
                    role: 'assistant',
                    content: `错误: ${error.message}`,
                    timestamp: Date.now(),
                });
            }
        }
        catch (error) {
            logger.error('Error handling send message:', error);
        }
    }
    /**
     * Append message to UI
     */
    appendMessage(message) {
        const messageBubble = createMessageBubble({
            role: message.role,
            content: message.content,
        }, message.id);
        // Track message view IDs for clearMessages
        this.messageViewIds.push(message.id);
        // Use addView instead of appendView
        floatingWindow.addView(messageBubble);
    }
    /**
     * Append thinking indicator
     */
    appendThinking(indicatorId) {
        const indicator = createThinkingIndicator(indicatorId);
        // Use addView instead of appendView
        floatingWindow.addView(indicator);
    }
    /**
     * Remove thinking indicator
     */
    removeThinking(indicatorId) {
        floatingWindow.removeView(indicatorId);
    }
    /**
     * Clear all messages
     */
    clearMessages() {
        for (const viewId of this.messageViewIds) {
            try {
                floatingWindow.removeView(viewId);
            }
            catch (error) {
                logger.debug(`Failed to remove message view ${viewId}:`, error);
            }
        }
        this.messageViewIds = [];
        logger.debug('Messages cleared');
    }
    /**
     * Scroll to bottom
     */
    scrollToBottom() {
        try {
            const scrollView = floatingWindow.findView('scroll_messages');
            if (scrollView && scrollView.fullScroll) {
                // View.FOCUS_DOWN = 130
                scrollView.fullScroll(130);
            }
        }
        catch (error) {
            logger.debug('ScrollToBottom not supported or failed:', error);
        }
    }
    /**
     * Initialize session
     */
    async initializeSession() {
        try {
            // Try to load most recent session or create new one
            const activeSessions = this.agentManager.getActiveSessions();
            if (activeSessions.length > 0) {
                // Use the first active session
                this.currentSessionId = activeSessions[0];
                await this.loadSessionHistory();
            }
            else {
                // Create new session
                const session = await this.agentManager.createSession({});
                this.currentSessionId = session.sessionId;
            }
            logger.info(`Initialized with session: ${this.currentSessionId}`);
        }
        catch (error) {
            logger.error('Error initializing session:', error);
        }
    }
    /**
     * Load session history
     */
    async loadSessionHistory() {
        if (!this.currentSessionId) {
            return;
        }
        try {
            const session = this.agentManager.getSession(this.currentSessionId);
            if (!session) {
                logger.warn(`Session not found: ${this.currentSessionId}`);
                return;
            }
            // Get message tree
            const context = session.buildContext();
            // Display messages (skip system message)
            for (const msg of context) {
                if (msg.role === 'system') {
                    continue;
                }
                if (msg.role === 'user' || msg.role === 'assistant') {
                    this.appendMessage({
                        id: generateViewId(),
                        role: msg.role,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                        timestamp: msg.timestamp,
                    });
                }
            }
            this.scrollToBottom();
        }
        catch (error) {
            logger.error('Error loading session history:', error);
        }
    }
}
