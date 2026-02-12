/**
 * Chat Window - Main conversation interface
 *
 * Floating window-based chat interface with embedded session list and settings panels.
 * All panels share a single floatingWindow instance to avoid conflicts.
 */
import { createMessageBubble, createThinkingIndicator, generateViewId, escapeXml, formatTimestamp } from './utils.js';
import { logger } from '../utils/logger.js';
/**
 * Chat Window Class
 *
 * Main UI component for AI conversation with embedded session list and settings panels.
 * Uses a single floatingWindow instance — panels are toggled via visibility.
 */
export class ChatWindow {
    constructor(agentManager, config) {
        this.currentSessionId = null;
        this.isVisible = false;
        this.messageViewIds = [];
        this.sessionItemViewIds = [];
        this.activePanel = 'chat';
        this.agentManager = agentManager;
        this.config = config;
    }
    /**
     * Show the chat window
     */
    async show(config = {}) {
        if (this.isVisible) {
            logger.debug('Chat window already visible');
            floatingWindow.show();
            return;
        }
        const xml = this.createMainLayout();
        floatingWindow.create(xml);
        floatingWindow.setSize(config.width ?? 700, config.height ?? 1000);
        floatingWindow.setPosition(config.x ?? 50, config.y ?? 100);
        floatingWindow.setTouchable(true);
        this.setupEventListeners();
        floatingWindow.show();
        this.isVisible = true;
        await this.initializeSession();
        logger.info('Chat window shown');
    }
    /**
     * Hide the chat window (keeps state)
     */
    hide() {
        if (!this.isVisible)
            return;
        floatingWindow.hide();
        this.isVisible = false;
        logger.info('Chat window hidden');
    }
    /**
     * Close the chat window (destroys state)
     */
    close() {
        if (!this.isVisible)
            return;
        floatingWindow.close();
        this.isVisible = false;
        logger.info('Chat window closed');
    }
    /**
     * Set callback for when config is saved from settings panel
     */
    onConfigSave(callback) {
        this.onConfigSaveCallback = callback;
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
        this.clearMessages();
        await this.loadSessionHistory();
        this.showPanel('chat');
        logger.info(`Switched to session: ${sessionId}`);
    }
    // ==================================================
    // Panel switching — uses View.setVisibility()
    // ==================================================
    /**
     * Switch to the specified panel.
     * View.VISIBLE = 0, View.GONE = 8
     */
    showPanel(panel) {
        this.activePanel = panel;
        const panels = {
            chat: 'chat_panel',
            sessions: 'session_panel',
            settings: 'settings_panel',
        };
        for (const [key, viewId] of Object.entries(panels)) {
            const view = floatingWindow.findView(viewId);
            if (view && typeof view.setVisibility === 'function') {
                view.setVisibility(key === panel ? 0 : 8);
            }
        }
        // Populate panel data when switching to it
        if (panel === 'sessions') {
            this.populateSessionList();
        }
        else if (panel === 'settings') {
            this.populateSettings();
        }
    }
    // ==================================================
    // Layout
    // ==================================================
    createMainLayout() {
        return `<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <!-- ===== Chat Panel (default visible) ===== -->
    <LinearLayout
        android:id="@+id/chat_panel"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:background="#CC1E1E1E"
        android:visibility="visible">

        <!-- Chat Toolbar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="44dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#DD2A2A2A"
            android:paddingStart="12dp"
            android:paddingEnd="8dp">

            <TextView
                android:id="@+id/title"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="Anode ClawdBot"
                android:textSize="14sp"
                android:textColor="#80CBC4"
                android:textStyle="bold"/>

            <Button
                android:id="@+id/btn_sessions"
                android:layout_width="36dp"
                android:layout_height="36dp"
                android:text="📋"
                android:textSize="16sp"
                android:textColor="#EAEAEA"
                android:background="#00000000"
                android:minWidth="0dp"
                android:minHeight="0dp"
                android:padding="0dp"/>

            <Button
                android:id="@+id/btn_settings"
                android:layout_width="36dp"
                android:layout_height="36dp"
                android:text="⚙️"
                android:textSize="16sp"
                android:textColor="#EAEAEA"
                android:background="#00000000"
                android:layout_marginStart="2dp"
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
                android:layout_marginStart="2dp"
                android:minWidth="0dp"
                android:minHeight="0dp"
                android:padding="0dp"/>
        </LinearLayout>

        <!-- Message ScrollView -->
        <ScrollView
            android:id="@+id/scroll_messages"
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"
            android:padding="12dp"
            android:background="#00000000"
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
            android:background="#CC303030"
            android:gravity="center_vertical">

            <EditText
                android:id="@+id/input_message"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:hint="输入消息..."
                android:textColor="#EAEAEA"
                android:textColorHint="#888888"
                android:padding="12dp"
                android:maxLines="4"
                android:inputType="textMultiLine"
                android:background="#CC3E3E3E"/>

            <Button
                android:id="@+id/btn_send"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="发送"
                android:textColor="#80CBC4"
                android:background="#00000000"
                android:layout_marginStart="8dp"/>
        </LinearLayout>
    </LinearLayout>

    <!-- ===== Session List Panel (hidden) ===== -->
    <LinearLayout
        android:id="@+id/session_panel"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:background="#CC1E1E1E"
        android:visibility="gone">

        <!-- Session Toolbar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="44dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#DD2A2A2A"
            android:paddingStart="12dp"
            android:paddingEnd="8dp">

            <Button
                android:id="@+id/btn_back_sessions"
                android:layout_width="36dp"
                android:layout_height="36dp"
                android:text="←"
                android:textSize="18sp"
                android:textColor="#EAEAEA"
                android:background="#00000000"
                android:minWidth="0dp"
                android:minHeight="0dp"
                android:padding="0dp"/>

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="会话列表"
                android:textSize="14sp"
                android:textColor="#80CBC4"
                android:textStyle="bold"
                android:layout_marginStart="8dp"/>

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
        </LinearLayout>

        <!-- Session List -->
        <ScrollView
            android:id="@+id/scroll_sessions"
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

        <!-- Empty state -->
        <LinearLayout
            android:id="@+id/session_empty_state"
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
    </LinearLayout>

    <!-- ===== Settings Panel (hidden) ===== -->
    <LinearLayout
        android:id="@+id/settings_panel"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:background="#CC1E1E1E"
        android:visibility="gone">

        <!-- Settings Toolbar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="44dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#DD2A2A2A"
            android:paddingStart="12dp"
            android:paddingEnd="8dp">

            <Button
                android:id="@+id/btn_back_settings"
                android:layout_width="36dp"
                android:layout_height="36dp"
                android:text="←"
                android:textSize="18sp"
                android:textColor="#EAEAEA"
                android:background="#00000000"
                android:minWidth="0dp"
                android:minHeight="0dp"
                android:padding="0dp"/>

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="设置"
                android:textSize="14sp"
                android:textColor="#80CBC4"
                android:textStyle="bold"
                android:layout_marginStart="8dp"/>

            <Button
                android:id="@+id/btn_save_settings"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="保存"
                android:textSize="14sp"
                android:textColor="#80CBC4"
                android:background="#00000000"
                android:minWidth="0dp"
                android:minHeight="0dp"/>
        </LinearLayout>

        <!-- Settings Content -->
        <ScrollView
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="1"
            android:padding="16dp">

            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical">

                <!-- Model Settings -->
                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="模型设置"
                    android:textSize="16sp"
                    android:textStyle="bold"
                    android:textColor="#80CBC4"
                    android:layout_marginBottom="8dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="AI 提供商"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="8dp"/>
                <TextView
                    android:id="@+id/settings_provider"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:text=""
                    android:textSize="14sp"
                    android:textColor="#EAEAEA"
                    android:padding="12dp"
                    android:background="#CC303030"
                    android:layout_marginTop="4dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="模型"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="16dp"/>
                <EditText
                    android:id="@+id/settings_model"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:hint="模型名称"
                    android:textColor="#EAEAEA"
                    android:textColorHint="#888888"
                    android:inputType="text"
                    android:background="#CC303030"
                    android:padding="12dp"
                    android:layout_marginTop="4dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="最大 Token 数"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="16dp"/>
                <EditText
                    android:id="@+id/settings_max_tokens"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:hint="8192"
                    android:textColor="#EAEAEA"
                    android:textColorHint="#888888"
                    android:inputType="number"
                    android:background="#CC303030"
                    android:padding="12dp"
                    android:layout_marginTop="4dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="Temperature"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="16dp"/>
                <EditText
                    android:id="@+id/settings_temperature"
                    android:layout_width="match_parent"
                    android:layout_height="wrap_content"
                    android:hint="1.0"
                    android:textColor="#EAEAEA"
                    android:textColorHint="#888888"
                    android:inputType="numberDecimal"
                    android:background="#CC303030"
                    android:padding="12dp"
                    android:layout_marginTop="4dp"/>

                <!-- Divider -->
                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="1dp"
                    android:background="#444444"
                    android:layout_marginTop="24dp"
                    android:layout_marginBottom="16dp"/>

                <!-- About -->
                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="关于"
                    android:textSize="16sp"
                    android:textStyle="bold"
                    android:textColor="#80CBC4"
                    android:layout_marginBottom="8dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="Anode ClawdBot v0.2.0"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="8dp"/>

                <TextView
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:text="Android AI Agent System"
                    android:textSize="14sp"
                    android:textColor="#AAAAAA"
                    android:layout_marginTop="4dp"/>
            </LinearLayout>
        </ScrollView>
    </LinearLayout>

</FrameLayout>`;
    }
    // ==================================================
    // Event listeners
    // ==================================================
    setupEventListeners() {
        logger.debug('[ChatWindow] Setting up event listeners');
        // --- Chat panel ---
        floatingWindow.on('btn_send', 'click', () => {
            logger.debug('[ChatWindow] btn_send clicked');
            this.handleSendMessage();
        });
        floatingWindow.on('btn_close', 'click', () => {
            logger.debug('[ChatWindow] btn_close clicked');
            this.hide();
        });
        floatingWindow.on('btn_sessions', 'click', () => {
            logger.info('[ChatWindow] btn_sessions clicked → show session panel');
            this.showPanel('sessions');
        });
        floatingWindow.on('btn_settings', 'click', () => {
            logger.info('[ChatWindow] btn_settings clicked → show settings panel');
            this.showPanel('settings');
        });
        floatingWindow.on('input_message', 'click', () => {
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
        // 🔑 使用 editorAction 事件处理 Enter 键发送
        floatingWindow.on('input_message', 'editorAction', (event) => {
            logger.debug('[ChatWindow] editorAction:', event);
            if (event?.actionId === 6) { // IME_ACTION_DONE
                this.handleSendMessage();
            }
        });
        // --- Session panel ---
        floatingWindow.on('btn_back_sessions', 'click', () => {
            logger.debug('[ChatWindow] btn_back_sessions clicked');
            this.showPanel('chat');
        });
        floatingWindow.on('btn_new_session', 'click', () => {
            logger.info('[ChatWindow] btn_new_session clicked');
            this.handleNewSession();
        });
        floatingWindow.on('btn_create_first', 'click', () => {
            logger.info('[ChatWindow] btn_create_first clicked');
            this.handleNewSession();
        });
        // --- Settings panel ---
        floatingWindow.on('btn_back_settings', 'click', () => {
            logger.debug('[ChatWindow] btn_back_settings clicked');
            this.showPanel('chat');
        });
        floatingWindow.on('btn_save_settings', 'click', () => {
            logger.info('[ChatWindow] btn_save_settings clicked');
            this.handleSaveSettings();
        });
        logger.debug('[ChatWindow] Event listeners setup complete');
    }
    // ==================================================
    // Chat operations
    // ==================================================
    async handleSendMessage() {
        try {
            const inputView = floatingWindow.findView('input_message');
            if (!inputView) {
                logger.error('Input view not found');
                return;
            }
            const message = floatingWindow.getText(inputView);
            if (!message || message.trim() === '')
                return;
            floatingWindow.setText(inputView, '');
            floatingWindow.setFocusable(false);
            this.appendMessage({
                id: generateViewId(),
                role: 'user',
                content: message,
                timestamp: Date.now(),
            });
            const thinkingId = generateViewId();
            this.appendThinking(thinkingId);
            try {
                const response = await this.agentManager.sendMessage(this.currentSessionId, message);
                this.removeThinking(thinkingId);
                this.appendMessage({
                    id: generateViewId(),
                    role: 'assistant',
                    content: response.content,
                    timestamp: Date.now(),
                    attachments: response.attachments,
                });
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
    appendMessage(message) {
        const messageBubble = createMessageBubble({
            role: message.role,
            content: message.content,
        }, message.id, message.attachments);
        this.messageViewIds.push(message.id);
        // 🔑 使用 addViewToParent 将消息添加到 messages_container
        floatingWindow.addViewToParent('messages_container', messageBubble);
        logger.debug(`[ChatWindow] Message ${message.id} added to messages_container`);
    }
    appendThinking(indicatorId) {
        floatingWindow.addViewToParent('messages_container', createThinkingIndicator(indicatorId));
        logger.debug(`[ChatWindow] Thinking indicator ${indicatorId} added`);
    }
    removeThinking(indicatorId) {
        floatingWindow.removeView(indicatorId);
    }
    clearMessages() {
        for (const viewId of this.messageViewIds) {
            try {
                floatingWindow.removeView(viewId);
            }
            catch (_) { }
        }
        this.messageViewIds = [];
    }
    scrollToBottom() {
        try {
            const scrollView = floatingWindow.findView('scroll_messages');
            if (scrollView && scrollView.fullScroll) {
                scrollView.fullScroll(130); // View.FOCUS_DOWN
            }
        }
        catch (error) {
            logger.debug('ScrollToBottom failed:', error);
        }
    }
    // ==================================================
    // Session operations (embedded)
    // ==================================================
    async initializeSession() {
        try {
            const activeSessions = this.agentManager.getActiveSessions();
            if (activeSessions.length > 0) {
                this.currentSessionId = activeSessions[0];
                await this.loadSessionHistory();
            }
            else {
                const session = await this.agentManager.createSession({});
                this.currentSessionId = session.sessionId;
            }
            logger.info(`Initialized with session: ${this.currentSessionId}`);
        }
        catch (error) {
            logger.error('Error initializing session:', error);
        }
    }
    async loadSessionHistory() {
        if (!this.currentSessionId)
            return;
        try {
            const session = this.agentManager.getSession(this.currentSessionId);
            if (!session) {
                logger.warn(`Session not found: ${this.currentSessionId}`);
                return;
            }
            const context = session.buildContext();
            for (const msg of context) {
                if (msg.role === 'system')
                    continue;
                if (msg.role === 'user' || msg.role === 'assistant') {
                    this.appendMessage({
                        id: generateViewId(),
                        role: msg.role,
                        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
                        timestamp: msg.timestamp,
                        attachments: msg.metadata?.attachments,
                    });
                }
            }
            this.scrollToBottom();
        }
        catch (error) {
            logger.error('Error loading session history:', error);
        }
    }
    async handleNewSession() {
        try {
            const session = await this.agentManager.createSession({});
            this.currentSessionId = session.sessionId;
            this.clearMessages();
            this.showPanel('chat');
            logger.info(`New session created: ${session.sessionId}`);
        }
        catch (error) {
            logger.error('Error creating new session:', error);
        }
    }
    /**
     * Populate the embedded session list panel with current sessions
     */
    populateSessionList() {
        // Clear previous session items
        for (const viewId of this.sessionItemViewIds) {
            try {
                floatingWindow.removeView(viewId);
            }
            catch (_) { }
        }
        this.sessionItemViewIds = [];
        try {
            const sessionIds = this.agentManager.getActiveSessions();
            if (sessionIds.length === 0) {
                // Show empty state, hide list
                const emptyView = floatingWindow.findView('session_empty_state');
                const listView = floatingWindow.findView('scroll_sessions');
                if (emptyView)
                    emptyView.setVisibility(0);
                if (listView)
                    listView.setVisibility(8);
                return;
            }
            // Hide empty state, show list
            const emptyView = floatingWindow.findView('session_empty_state');
            const listView = floatingWindow.findView('scroll_sessions');
            if (emptyView)
                emptyView.setVisibility(8);
            if (listView)
                listView.setVisibility(0);
            // Collect session info
            const sessions = [];
            for (const sessionId of sessionIds) {
                const session = this.agentManager.getSession(sessionId);
                if (!session)
                    continue;
                let lastMessage = '';
                let lastUpdated = Date.now();
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
                sessions.push({
                    sessionId,
                    title: `会话 ${sessionId.substring(0, 8)}`,
                    lastMessage,
                    lastUpdated,
                    messageCount: session.getMessageTree().size,
                });
            }
            sessions.sort((a, b) => b.lastUpdated - a.lastUpdated);
            // Add session items. Highlight the current session.
            for (const s of sessions) {
                const isCurrent = s.sessionId === this.currentSessionId;
                const itemId = `session_${s.sessionId}`;
                this.sessionItemViewIds.push(itemId);
                const timeStr = formatTimestamp(s.lastUpdated);
                const preview = s.lastMessage ? escapeXml(s.lastMessage.substring(0, 50)) : '暂无消息';
                const bgColor = isCurrent ? '#CC37474F' : '#CC1E1E1E';
                const itemXml = `
<LinearLayout
    android:id="${itemId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:padding="16dp"
    android:background="${bgColor}"
    android:clickable="true">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="${escapeXml(s.title)}"
            android:textSize="16sp"
            android:textColor="#EAEAEA"
            android:textStyle="bold"/>

        <TextView
            android:layout_width="wrap_content"
            android:layout_height="wrap_content"
            android:text="${timeStr}"
            android:textSize="12sp"
            android:textColor="#AAAAAA"/>
    </LinearLayout>

    <TextView
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:text="${preview}"
        android:textSize="14sp"
        android:textColor="#AAAAAA"
        android:layout_marginTop="4dp"
        android:maxLines="2"
        android:ellipsize="end"/>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="1dp"
        android:background="#444444"
        android:layout_marginTop="16dp"/>
</LinearLayout>`;
                floatingWindow.addViewToParent('session_list_container', itemXml);
                // 🔑 为每个动态添加的 session item 注册点击事件
                const sessionId = s.sessionId;
                floatingWindow.on(itemId, 'click', () => {
                    logger.info(`[ChatWindow] Session item clicked: ${sessionId}`);
                    this.switchSession(sessionId);
                });
            }
        }
        catch (error) {
            logger.error('Error populating session list:', error);
        }
    }
    // ==================================================
    // Settings operations (embedded)
    // ==================================================
    /**
     * Populate settings fields with current config values
     */
    populateSettings() {
        try {
            const providerView = floatingWindow.findView('settings_provider');
            if (providerView) {
                floatingWindow.setText(providerView, this.config.model.provider || 'anthropic');
            }
            const modelView = floatingWindow.findView('settings_model');
            if (modelView) {
                floatingWindow.setText(modelView, this.config.model.model);
            }
            const maxTokensView = floatingWindow.findView('settings_max_tokens');
            if (maxTokensView) {
                floatingWindow.setText(maxTokensView, this.config.model.maxTokens.toString());
            }
            const tempView = floatingWindow.findView('settings_temperature');
            if (tempView) {
                floatingWindow.setText(tempView, this.config.model.temperature.toString());
            }
        }
        catch (error) {
            logger.error('Error populating settings:', error);
        }
    }
    /**
     * Save settings from the embedded settings panel
     */
    handleSaveSettings() {
        try {
            const modelView = floatingWindow.findView('settings_model');
            const model = modelView ? floatingWindow.getText(modelView) : '';
            if (model)
                this.config.model.model = model;
            const maxTokensView = floatingWindow.findView('settings_max_tokens');
            const maxTokensStr = maxTokensView ? floatingWindow.getText(maxTokensView) : '';
            if (maxTokensStr) {
                const maxTokens = parseInt(maxTokensStr, 10);
                if (!isNaN(maxTokens) && maxTokens > 0)
                    this.config.model.maxTokens = maxTokens;
            }
            const tempView = floatingWindow.findView('settings_temperature');
            const tempStr = tempView ? floatingWindow.getText(tempView) : '';
            if (tempStr) {
                const temp = parseFloat(tempStr);
                if (!isNaN(temp) && temp >= 0)
                    this.config.model.temperature = temp;
            }
            if (this.onConfigSaveCallback) {
                this.onConfigSaveCallback(this.config);
            }
            logger.info('Settings saved from floating window');
            this.showPanel('chat');
        }
        catch (error) {
            logger.error('Error saving settings:', error);
        }
    }
}
