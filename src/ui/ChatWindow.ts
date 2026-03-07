/**
 * Chat Window - Agent Process Monitor
 *
 * Floating window that shows the agent's real-time thinking and task execution process.
 * - Process log: real-time tool events (tool:before / tool:after / tool:error)
 * - AI output: character-by-character streaming via sendMessageWithStreaming
 * - Status bar: current phase + iteration counter
 */

import type { AgentManager, StreamingCallback } from '../core/AgentManager.js';
import type { Config } from '../config/schema.js';
import { EventBus } from '../core/EventBus.js';
import { generateViewId, escapeXml } from './utils.js';
import { logger } from '../utils/logger.js';

// Declare global FloatingWindowAPI
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
  addViewToParent(parentId: string, xmlString: string): any;
  removeView(viewId: string): any;
  findView(id: string): any | null;
  setText(view: any, text: string): void;
  getText(view: any): string;
  on(viewId: string, eventType: string, callback: (event: any) => void): boolean;
  onView(viewId: string, eventType: string, callback: (event: any) => void): boolean;
  onWindow(eventType: string, callback: (event: any) => void): boolean;
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

/** Active panel */
type ActivePanel = 'monitor' | 'settings';

/**
 * Chat Window - Agent Process Monitor
 *
 * Main UI showing agent's real-time thinking process and streaming output.
 */
export class ChatWindow {
  private agentManager: AgentManager;
  private config: Config;
  private currentSessionId: string | null = null;
  private isVisible: boolean = false;
  private activePanel: ActivePanel = 'monitor';

  // Process state
  private isProcessing: boolean = false;
  private iterationCount: number = 0;
  private logViewIds: string[] = [];
  private streamingAccum: string = '';
  private streamingLastUpdate: number = 0;
  private readonly STREAM_THROTTLE_MS = 120;

  // Callback for config save
  private onConfigSaveCallback?: (config: Config) => void;

  // EventBus handlers (saved for cleanup)
  private readonly toolBeforeHandler: (data: any) => void;
  private readonly toolAfterHandler: (data: any) => void;
  private readonly toolErrorHandler: (data: any) => void;
  private readonly messageAssistantHandler: (data: any) => void;

  constructor(agentManager: AgentManager, config: Config) {
    this.agentManager = agentManager;
    this.config = config;

    this.toolBeforeHandler = (data) => this.onToolBefore(data);
    this.toolAfterHandler = (data) => this.onToolAfter(data);
    this.toolErrorHandler = (data) => this.onToolError(data);
    this.messageAssistantHandler = (data) => this.onMessageAssistant(data);
  }

  // ==================================================
  // Lifecycle
  // ==================================================

  async show(config: ChatWindowConfig = {}): Promise<void> {
    if (this.isVisible) {
      floatingWindow.show();
      return;
    }

    floatingWindow.create(this.createMainLayout());
    floatingWindow.setSize(config.width ?? 700, config.height ?? 1000);
    floatingWindow.setPosition(config.x ?? 50, config.y ?? 100);
    floatingWindow.setTouchable(true);

    this.setupEventListeners();
    this.subscribeToEventBus();

    floatingWindow.show();
    this.isVisible = true;

    await this.initializeSession();
    this.setStatus('空闲', false);

    logger.info('[ChatWindow] Agent process monitor shown');
  }

  hide(): void {
    if (!this.isVisible) return;
    floatingWindow.hide();
    this.isVisible = false;
    logger.info('[ChatWindow] Hidden');
  }

  close(): void {
    if (!this.isVisible) return;
    this.unsubscribeFromEventBus();
    floatingWindow.close();
    this.isVisible = false;
    logger.info('[ChatWindow] Closed');
  }

  onConfigSave(callback: (config: Config) => void): void {
    this.onConfigSaveCallback = callback;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  // ==================================================
  // EventBus
  // ==================================================

  private subscribeToEventBus(): void {
    const bus = EventBus.getInstance();
    bus.on('tool:before', this.toolBeforeHandler);
    bus.on('tool:after', this.toolAfterHandler);
    bus.on('tool:error', this.toolErrorHandler);
    bus.on('message:assistant', this.messageAssistantHandler);
  }

  private unsubscribeFromEventBus(): void {
    const bus = EventBus.getInstance();
    bus.off('tool:before', this.toolBeforeHandler);
    bus.off('tool:after', this.toolAfterHandler);
    bus.off('tool:error', this.toolErrorHandler);
    bus.off('message:assistant', this.messageAssistantHandler);
  }

  private onToolBefore(data: { toolName: string; args: Record<string, any> }): void {
    if (!this.isVisible) return;
    this.addLogLine(`🔧 ${data.toolName}(${this.formatArgs(data.args)})`, '#80CBC4');
    this.setStatus(`执行: ${data.toolName}`, true);
  }

  private onToolAfter(data: { toolName: string; duration: number }): void {
    if (!this.isVisible) return;
    this.addLogLine(`   ✓ 成功 (${data.duration}ms)`, '#81C784');
    if (this.isProcessing) this.setStatus('思考中...', true);
  }

  private onToolError(data: { toolName: string; error: any }): void {
    if (!this.isVisible) return;
    const errStr = String(data.error?.message || data.error).substring(0, 80);
    this.addLogLine(`   ✗ 失败: ${errStr}`, '#EF9A9A');
    if (this.isProcessing) this.setStatus('思考中...', true);
  }

  private onMessageAssistant(_data: { sessionId: string; content: string }): void {
    if (!this.isVisible || !this.isProcessing) return;
    // Each assistant message marks the end of one reasoning iteration
    this.iterationCount++;
    this.updateIterationView();
    this.addLogLine(`── 第 ${this.iterationCount} 轮 ──`, '#555555');
  }

  // ==================================================
  // Layout
  // ==================================================

  private createMainLayout(): string {
    return `<FrameLayout xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent">

    <!-- ===== Monitor Panel ===== -->
    <LinearLayout
        android:id="@+id/monitor_panel"
        android:layout_width="match_parent"
        android:layout_height="match_parent"
        android:orientation="vertical"
        android:background="#CC1A1A1A"
        android:visibility="visible">

        <!-- Toolbar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="44dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#DD242424"
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
                android:id="@+id/btn_new_session"
                android:layout_width="36dp"
                android:layout_height="36dp"
                android:text="🔄"
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

        <!-- Status Bar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="28dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#DD1E1E1E"
            android:paddingStart="12dp"
            android:paddingEnd="12dp">

            <TextView
                android:id="@+id/status_dot"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="○"
                android:textSize="12sp"
                android:textColor="#888888"/>

            <TextView
                android:id="@+id/status_text"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text=" 空闲"
                android:textSize="12sp"
                android:textColor="#888888"
                android:layout_marginStart="4dp"/>

            <TextView
                android:id="@+id/iteration_text"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text=""
                android:textSize="11sp"
                android:textColor="#555555"/>
        </LinearLayout>

        <!-- Process Log Header -->
        <TextView
            android:layout_width="match_parent"
            android:layout_height="22dp"
            android:text="  进程日志"
            android:textSize="11sp"
            android:textColor="#555555"
            android:gravity="center_vertical"
            android:background="#DD191919"/>

        <!-- Process Log -->
        <ScrollView
            android:id="@+id/scroll_log"
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="35"
            android:background="#CC111111"
            android:scrollbars="vertical">

            <LinearLayout
                android:id="@+id/log_container"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:paddingStart="10dp"
                android:paddingEnd="10dp"
                android:paddingTop="6dp"
                android:paddingBottom="6dp"/>
        </ScrollView>

        <!-- AI Output Header -->
        <TextView
            android:layout_width="match_parent"
            android:layout_height="22dp"
            android:text="  AI 输出"
            android:textSize="11sp"
            android:textColor="#555555"
            android:gravity="center_vertical"
            android:background="#DD191919"/>

        <!-- AI Output (streaming) -->
        <ScrollView
            android:id="@+id/scroll_output"
            android:layout_width="match_parent"
            android:layout_height="0dp"
            android:layout_weight="40"
            android:background="#CC0F0F0F"
            android:scrollbars="vertical"
            android:padding="10dp">

            <TextView
                android:id="@+id/output_text"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:text=""
                android:textSize="13sp"
                android:textColor="#DDDDDD"
                android:fontFamily="monospace"
                android:lineSpacingMultiplier="1.35"/>
        </ScrollView>

        <!-- Input Area -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="horizontal"
            android:padding="8dp"
            android:background="#CC2A2A2A"
            android:gravity="center_vertical">

            <EditText
                android:id="@+id/input_message"
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:hint="输入任务..."
                android:textColor="#EAEAEA"
                android:textColorHint="#666666"
                android:padding="10dp"
                android:maxLines="3"
                android:inputType="textMultiLine"
                android:background="#CC363636"/>

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

    <!-- ===== Settings Panel ===== -->
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

                <LinearLayout
                    android:layout_width="match_parent"
                    android:layout_height="1dp"
                    android:background="#444444"
                    android:layout_marginTop="24dp"
                    android:layout_marginBottom="16dp"/>

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

  private setupEventListeners(): void {
    floatingWindow.on('btn_send', 'click', () => this.handleSendMessage());
    floatingWindow.on('btn_close', 'click', () => this.hide());
    floatingWindow.on('btn_settings', 'click', () => this.showPanel('settings'));
    floatingWindow.on('btn_new_session', 'click', () => this.handleNewSession());

    floatingWindow.on('input_message', 'click', () => {
      floatingWindow.setFocusable(true);
      try {
        const v = floatingWindow.findView('input_message');
        if (v?.requestFocus) v.requestFocus();
      } catch (_) {}
    });

    floatingWindow.on('input_message', 'editorAction', (event: any) => {
      if (event?.actionId === 6) this.handleSendMessage();
    });

    floatingWindow.on('btn_back_settings', 'click', () => this.showPanel('monitor'));
    floatingWindow.on('btn_save_settings', 'click', () => this.handleSaveSettings());
  }

  // ==================================================
  // Panel switching
  // ==================================================

  private showPanel(panel: ActivePanel): void {
    this.activePanel = panel;
    const ids: Record<ActivePanel, string> = {
      monitor: 'monitor_panel',
      settings: 'settings_panel',
    };
    for (const [key, viewId] of Object.entries(ids)) {
      const view = floatingWindow.findView(viewId);
      if (view && typeof view.setVisibility === 'function') {
        view.setVisibility(key === panel ? 0 : 8);
      }
    }
    if (panel === 'settings') this.populateSettings();
  }

  // ==================================================
  // Process log
  // ==================================================

  private addLogLine(text: string, color: string = '#CCCCCC'): void {
    if (!this.isVisible) return;
    const viewId = generateViewId();
    this.logViewIds.push(viewId);
    floatingWindow.addViewToParent('log_container', `<TextView
    android:id="@+id/${viewId}"
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:text="${escapeXml(text)}"
    android:textSize="11sp"
    android:textColor="${color}"
    android:fontFamily="monospace"
    android:paddingTop="1dp"
    android:paddingBottom="1dp"/>`);
    this.scrollViewToBottom('scroll_log');
  }

  private clearLog(): void {
    for (const viewId of this.logViewIds) {
      try { floatingWindow.removeView(viewId); } catch (_) {}
    }
    this.logViewIds = [];
  }

  // ==================================================
  // Status bar
  // ==================================================

  private setStatus(text: string, busy: boolean): void {
    try {
      const dot = floatingWindow.findView('status_dot');
      const statusView = floatingWindow.findView('status_text');
      if (dot) floatingWindow.setText(dot, busy ? '●' : '○');
      if (statusView) floatingWindow.setText(statusView, ` ${text}`);
    } catch (_) {}
  }

  private updateIterationView(): void {
    try {
      const iterView = floatingWindow.findView('iteration_text');
      if (iterView && this.iterationCount > 0) {
        floatingWindow.setText(iterView, `第 ${this.iterationCount} 轮`);
      }
    } catch (_) {}
  }

  // ==================================================
  // Streaming output
  // ==================================================

  private updateStreamingOutput(accumulated: string, done: boolean): void {
    const now = Date.now();
    if (!done && now - this.streamingLastUpdate < this.STREAM_THROTTLE_MS) return;
    this.streamingLastUpdate = now;
    this.streamingAccum = accumulated;

    try {
      const outputView = floatingWindow.findView('output_text');
      if (outputView) {
        floatingWindow.setText(outputView, done ? accumulated : accumulated + '▊');
      }
      this.scrollViewToBottom('scroll_output');
    } catch (_) {}
  }

  private scrollViewToBottom(scrollViewId: string): void {
    try {
      const sv = floatingWindow.findView(scrollViewId);
      if (sv?.fullScroll) sv.fullScroll(130); // View.FOCUS_DOWN
    } catch (_) {}
  }

  // ==================================================
  // Send message
  // ==================================================

  private async handleSendMessage(): Promise<void> {
    if (this.isProcessing) {
      logger.debug('[ChatWindow] Already processing, ignoring');
      return;
    }

    try {
      const inputView = floatingWindow.findView('input_message');
      if (!inputView) return;

      const message = floatingWindow.getText(inputView);
      if (!message?.trim()) return;

      floatingWindow.setText(inputView, '');
      floatingWindow.setFocusable(false);

      this.isProcessing = true;
      this.iterationCount = 0;
      this.streamingAccum = '';
      this.streamingLastUpdate = 0;

      // Clear output area
      try {
        const outputView = floatingWindow.findView('output_text');
        if (outputView) floatingWindow.setText(outputView, '');
      } catch (_) {}

      this.addLogLine(`▶ ${message.substring(0, 100)}`, '#AAAAAA');
      this.setStatus('思考中...', true);
      this.updateIterationView();

      const onStream: StreamingCallback = (_delta, accumulated, done) => {
        this.updateStreamingOutput(accumulated, done);
      };

      try {
        await this.agentManager.sendMessageWithStreaming(
          this.currentSessionId!,
          message,
          onStream
        );
        // Ensure final text is shown without cursor
        this.updateStreamingOutput(this.streamingAccum, true);
        this.setStatus('完成', false);
        this.addLogLine('✔ 任务完成', '#81C784');
      } catch (error) {
        const errMsg = ((error as Error).message || String(error)).substring(0, 120);
        this.addLogLine(`✘ 错误: ${errMsg}`, '#EF9A9A');
        try {
          const outputView = floatingWindow.findView('output_text');
          if (outputView) floatingWindow.setText(outputView, `处理出错:\n${errMsg}`);
        } catch (_) {}
        this.setStatus('出错', false);
      }

      this.isProcessing = false;
    } catch (error) {
      this.isProcessing = false;
      logger.error('[ChatWindow] handleSendMessage error:', error);
    }
  }

  // ==================================================
  // Session management
  // ==================================================

  private async initializeSession(): Promise<void> {
    try {
      const activeSessions = this.agentManager.getActiveSessions();
      if (activeSessions.length > 0) {
        this.currentSessionId = activeSessions[0];
      } else {
        const session = await this.agentManager.createSession({});
        this.currentSessionId = session.sessionId;
      }
      logger.info(`[ChatWindow] Session: ${this.currentSessionId}`);
    } catch (error) {
      logger.error('[ChatWindow] initializeSession error:', error);
    }
  }

  private async handleNewSession(): Promise<void> {
    if (this.isProcessing) return;
    try {
      const session = await this.agentManager.createSession({});
      this.currentSessionId = session.sessionId;
      this.iterationCount = 0;
      this.clearLog();
      try {
        const outputView = floatingWindow.findView('output_text');
        if (outputView) floatingWindow.setText(outputView, '');
        const iterView = floatingWindow.findView('iteration_text');
        if (iterView) floatingWindow.setText(iterView, '');
      } catch (_) {}
      this.setStatus('空闲', false);
      logger.info(`[ChatWindow] New session: ${session.sessionId}`);
    } catch (error) {
      logger.error('[ChatWindow] handleNewSession error:', error);
    }
  }

  // ==================================================
  // Settings
  // ==================================================

  private populateSettings(): void {
    try {
      const providerView = floatingWindow.findView('settings_provider');
      if (providerView) floatingWindow.setText(providerView, this.config.model.provider || 'anthropic');

      const modelView = floatingWindow.findView('settings_model');
      if (modelView) floatingWindow.setText(modelView, this.config.model.model);

      const maxTokensView = floatingWindow.findView('settings_max_tokens');
      if (maxTokensView) floatingWindow.setText(maxTokensView, this.config.model.maxTokens.toString());

      const tempView = floatingWindow.findView('settings_temperature');
      if (tempView) floatingWindow.setText(tempView, this.config.model.temperature.toString());
    } catch (error) {
      logger.error('[ChatWindow] populateSettings error:', error);
    }
  }

  private handleSaveSettings(): void {
    try {
      const modelView = floatingWindow.findView('settings_model');
      const model = modelView ? floatingWindow.getText(modelView) : '';
      if (model) this.config.model.model = model;

      const maxTokensView = floatingWindow.findView('settings_max_tokens');
      const maxTokensStr = maxTokensView ? floatingWindow.getText(maxTokensView) : '';
      if (maxTokensStr) {
        const maxTokens = parseInt(maxTokensStr, 10);
        if (!isNaN(maxTokens) && maxTokens > 0) this.config.model.maxTokens = maxTokens;
      }

      const tempView = floatingWindow.findView('settings_temperature');
      const tempStr = tempView ? floatingWindow.getText(tempView) : '';
      if (tempStr) {
        const temp = parseFloat(tempStr);
        if (!isNaN(temp) && temp >= 0) this.config.model.temperature = temp;
      }

      this.onConfigSaveCallback?.(this.config);
      this.showPanel('monitor');
      logger.info('[ChatWindow] Settings saved');
    } catch (error) {
      logger.error('[ChatWindow] handleSaveSettings error:', error);
    }
  }

  // ==================================================
  // Helpers
  // ==================================================

  private formatArgs(args: Record<string, any>): string {
    try {
      return Object.entries(args)
        .slice(0, 2)
        .map(([k, v]) => `${k}=${String(v).substring(0, 25)}`)
        .join(', ');
    } catch {
      return '';
    }
  }
}
