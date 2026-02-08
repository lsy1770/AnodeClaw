/**
 * Chat Window - Main conversation interface
 *
 * Floating window-based chat interface for user interactions
 */

import type { AgentManager } from '../core/AgentManager.js';
import type { MessageDisplay } from './types.js';
import { createMessageBubble, createMediaCard, createThinkingIndicator, generateViewId } from './utils.js';
import { logger } from '../utils/logger.js';

// Declare global FloatingWindowAPI
// Actual signature: on(viewId, eventType, callback) — matches NotificationManager pattern
declare const floatingWindow: {
  create(layoutXml: string): any;
  show(): void;
  hide(): void;
  close(): void;
  setSize(width: number, height: number): void;
  setPosition(x: number, y: number): void;
  setFocusable(focusable: boolean): void;
  setTouchable(touchable: boolean): void;
  isCreated(): boolean;
  addView(xmlString: string): any;
  removeView(viewId: string): any;
  findView(id: string): any | null;
  setText(view: any, text: string): void;
  getText(view: any): string;
  on(eventType: string, callback: (event: any) => void): boolean;
  onView(viewId: string, eventType: string, callback: (event: any) => void): boolean;
};

/**
 * Chat Window Configuration
 */
export interface ChatWindowConfig {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * Chat Window Class
 *
 * Main UI component for AI conversation
 */
export class ChatWindow {
  private agentManager: AgentManager;
  private currentSessionId: string | null = null;
  private isVisible: boolean = false;
  private messageViewIds: string[] = [];

  // Event handlers
  private onSessionChangeCallback?: (sessionId: string) => void;
  private onSettingsCallback?: () => void;

  constructor(agentManager: AgentManager) {
    this.agentManager = agentManager;
  }

  /**
   * Show the chat window
   */
  async show(config: ChatWindowConfig = {}): Promise<void> {
    if (this.isVisible) {
      logger.debug('Chat window already visible');
      return;
    }

    const xml = this.createMainLayout();

    // Create floating window with correct API pattern
    floatingWindow.create(xml);
    floatingWindow.setSize(config.width ?? 700, config.height ?? 1000);
    floatingWindow.setPosition(config.x ?? 50, config.y ?? 100);
    floatingWindow.setTouchable(true);
    // Don't set focusable here - let the click handler manage it for keyboard

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
  hide(): void {
    if (!this.isVisible) {
      return;
    }

    floatingWindow.hide();
    this.isVisible = false;

    logger.info('Chat window hidden');
  }

  /**
   * Close the chat window
   */
  close(): void {
    if (!this.isVisible) {
      return;
    }

    floatingWindow.close();
    this.isVisible = false;

    logger.info('Chat window closed');
  }

  /**
   * Set session change callback
   */
  onSessionChange(callback: (sessionId: string) => void): void {
    this.onSessionChangeCallback = callback;
  }

  /**
   * Set settings callback
   */
  onSettings(callback: () => void): void {
    this.onSettingsCallback = callback;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Switch to a different session
   */
  async switchSession(sessionId: string): Promise<void> {
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
  private createMainLayout(): string {
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

        <Button
            android:id="@+id/btn_sessions"
            android:layout_width="44dp"
            android:layout_height="44dp"
            android:text="📋"
            android:textSize="18sp"
            android:background="#00000000"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>

        <Button
            android:id="@+id/btn_settings"
            android:layout_width="44dp"
            android:layout_height="44dp"
            android:text="⚙️"
            android:textSize="18sp"
            android:background="#00000000"
            android:layout_marginStart="4dp"
            android:minWidth="0dp"
            android:minHeight="0dp"
            android:padding="0dp"/>

        <Button
            android:id="@+id/btn_close"
            android:layout_width="44dp"
            android:layout_height="44dp"
            android:text="✕"
            android:textSize="18sp"
            android:textColor="#FFFFFF"
            android:background="#00000000"
            android:layout_marginStart="4dp"
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
  private setupEventListeners(): void {
    // Use onView for per-button click handlers
    const sendSuccess = floatingWindow.onView('btn_send', 'click', () => {
      logger.debug('[ChatWindow] btn_send clicked');
      this.handleSendMessage();
    });
    logger.debug(`[ChatWindow] btn_send listener: ${sendSuccess}`);

    const closeSuccess = floatingWindow.onView('btn_close', 'click', () => {
      logger.debug('[ChatWindow] btn_close clicked');
      this.hide();
    });
    logger.debug(`[ChatWindow] btn_close listener: ${closeSuccess}`);

    const sessionsSuccess = floatingWindow.onView('btn_sessions', 'click', () => {
      logger.info('[ChatWindow] btn_sessions clicked');
      if (this.onSessionChangeCallback) {
        this.onSessionChangeCallback(this.currentSessionId!);
      }
    });
    logger.debug(`[ChatWindow] btn_sessions listener: ${sessionsSuccess}`);

    const settingsSuccess = floatingWindow.onView('btn_settings', 'click', () => {
      logger.info('[ChatWindow] btn_settings clicked');
      if (this.onSettingsCallback) {
        this.onSettingsCallback();
      }
    });
    logger.debug(`[ChatWindow] btn_settings listener: ${settingsSuccess}`);

    // Input field: toggle focusable on tap so keyboard can open
    floatingWindow.onView('input_message', 'click', () => {
      floatingWindow.setFocusable(true);
      try {
        const inputView = floatingWindow.findView('input_message');
        if (inputView && inputView.requestFocus) {
          inputView.requestFocus();
        }
      } catch (error) {
        logger.debug('Error requesting focus on input:', error);
      }
    });

    // Editor action (Enter key) on input
    floatingWindow.onView('input_message', 'editorAction', (event: any) => {
      if (event.actionId === 6) {
        // IME_ACTION_DONE
        this.handleSendMessage();
      }
    });
  }

  /**
   * Handle send message
   */
  private async handleSendMessage(): Promise<void> {
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
        const response = await this.agentManager.sendMessage(
          this.currentSessionId!,
          message
        );

        // Remove thinking indicator
        this.removeThinking(thinkingId);

        // Display AI response
        this.appendMessage({
          id: generateViewId(),
          role: 'assistant',
          content: response.content,
          timestamp: Date.now(),
          attachments: response.attachments,
        });

        // Scroll to bottom
        this.scrollToBottom();
      } catch (error) {
        this.removeThinking(thinkingId);
        this.appendMessage({
          id: generateViewId(),
          role: 'assistant',
          content: `错误: ${(error as Error).message}`,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      logger.error('Error handling send message:', error);
    }
  }

  /**
   * Append message to UI
   */
  private appendMessage(message: MessageDisplay): void {
    const messageBubble = createMessageBubble({
      role: message.role,
      content: message.content,
    }, message.id, message.attachments);

    // Track message view IDs for clearMessages
    this.messageViewIds.push(message.id);

    // Use addView instead of appendView
    floatingWindow.addView(messageBubble);
  }

  /**
   * Append thinking indicator
   */
  private appendThinking(indicatorId: string): void {
    const indicator = createThinkingIndicator(indicatorId);
    // Use addView instead of appendView
    floatingWindow.addView(indicator);
  }

  /**
   * Remove thinking indicator
   */
  private removeThinking(indicatorId: string): void {
    floatingWindow.removeView(indicatorId);
  }

  /**
   * Clear all messages
   */
  private clearMessages(): void {
    for (const viewId of this.messageViewIds) {
      try {
        floatingWindow.removeView(viewId);
      } catch (error) {
        logger.debug(`Failed to remove message view ${viewId}:`, error);
      }
    }
    this.messageViewIds = [];
    logger.debug('Messages cleared');
  }

  /**
   * Scroll to bottom
   */
  private scrollToBottom(): void {
    try {
      const scrollView = floatingWindow.findView('scroll_messages');
      if (scrollView && scrollView.fullScroll) {
        // View.FOCUS_DOWN = 130
        scrollView.fullScroll(130);
      }
    } catch (error) {
      logger.debug('ScrollToBottom not supported or failed:', error);
    }
  }

  /**
   * Initialize session
   */
  private async initializeSession(): Promise<void> {
    try {
      // Try to load most recent session or create new one
      const activeSessions = this.agentManager.getActiveSessions();

      if (activeSessions.length > 0) {
        // Use the first active session
        this.currentSessionId = activeSessions[0];
        await this.loadSessionHistory();
      } else {
        // Create new session
        const session = await this.agentManager.createSession({});
        this.currentSessionId = session.sessionId;
      }

      logger.info(`Initialized with session: ${this.currentSessionId}`);
    } catch (error) {
      logger.error('Error initializing session:', error);
    }
  }

  /**
   * Load session history
   */
  private async loadSessionHistory(): Promise<void> {
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
            attachments: msg.metadata?.attachments,
          });
        }
      }

      this.scrollToBottom();
    } catch (error) {
      logger.error('Error loading session history:', error);
    }
  }
}
