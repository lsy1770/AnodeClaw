/**
 * Control Panel - Material Design 风格的主控制面板
 *
 * 功能：
 * - AI Provider 配置（Anthropic, OpenAI, Gemini）
 * - API Key 和模型参数设置
 * - 系统提示词配置
 * - 启动/停止聊天窗口
 * - 配置保存和加载
 */

import { ConfigManager } from '../config/ConfigManager.js';
import { Config } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { ChatWindow } from './ChatWindow.js';
import { AgentManager } from '../core/AgentManager.js';

declare const floatingWindow: {
  create(layoutXml: string): any;
  show(): void;
  hide(): void;
  close(): void;
  setSize(width: number, height: number): void;
  setPosition(x: number, y: number): void;
  on(event: string, callback: (data: any) => void): boolean;
  findView(id: string): any;
  setText(view: any, text: string): void;
  getText(view: any): string;
  setChecked(view: any, checked: boolean): void;
  isChecked(view: any): boolean;
  setVisibility(view: any, visible: boolean): void;
  addView(xml: string): void;
};

export interface ControlPanelConfig {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
}

export class ControlPanel {
  private configManager: ConfigManager;
  private agentManager: AgentManager | null = null;
  private chatWindow: ChatWindow | null = null;
  private isVisible: boolean = false;
  private isChatRunning: boolean = false;

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * 显示控制面板
   */
  async show(config: ControlPanelConfig = {}): Promise<void> {
    if (this.isVisible) {
      logger.debug('Control panel already visible');
      return;
    }

    const xml = this.createMainLayout();

    floatingWindow.create(xml);
    floatingWindow.setSize(config.width ?? 800, config.height ?? 1200);
    floatingWindow.setPosition(config.x ?? 50, config.y ?? 50);

    // 加载当前配置到 UI
    await this.loadConfigToUI();

    // 设置事件监听
    this.setupEventListeners();

    floatingWindow.show();
    this.isVisible = true;

    logger.info('Control panel shown');

    // 检查是否需要自动打开聊天窗口
    const appConfig = this.configManager.get();
    if (appConfig.ui?.floatingWindow?.autoOpen) {
      logger.info('Auto-opening chat window based on config');
      // 延迟启动，确保控制面板完全显示
      setTimeout(() => this.handleStartChat(), 500);
    }
  }

  /**
   * 隐藏控制面板
   */
  hide(): void {
    if (!this.isVisible) {
      return;
    }

    floatingWindow.hide();
    this.isVisible = false;

    logger.info('Control panel hidden');
  }

  /**
   * 关闭控制面板
   */
  close(): void {
    if (!this.isVisible) {
      return;
    }

    // 如果聊天窗口在运行，先关闭
    if (this.chatWindow) {
      this.chatWindow.close();
    }

    floatingWindow.close();
    this.isVisible = false;

    logger.info('Control panel closed');
  }

  /**
   * 创建 Material Design 主布局
   */
  private createMainLayout(): string {
    return `<ScrollView xmlns:android="http://schemas.android.com/apk/res/android"
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:background="#FAFAFA"
    android:fillViewport="true">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="vertical">

        <!-- App Bar -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="64dp"
            android:orientation="horizontal"
            android:gravity="center_vertical"
            android:background="#6200EA"
            android:elevation="4dp"
            android:paddingStart="16dp"
            android:paddingEnd="16dp">

            <TextView
                android:layout_width="0dp"
                android:layout_height="wrap_content"
                android:layout_weight="1"
                android:text="Anode ClawdBot"
                android:textSize="20sp"
                android:textColor="#FFFFFF"
                android:textStyle="bold"/>

            <ImageButton
                android:id="@+id/btn_minimize"
                android:layout_width="40dp"
                android:layout_height="40dp"
                android:background="?attr/selectableItemBackgroundBorderless"
                android:contentDescription="最小化"/>

            <ImageButton
                android:id="@+id/btn_close"
                android:layout_width="40dp"
                android:layout_height="40dp"
                android:background="?attr/selectableItemBackgroundBorderless"
                android:layout_marginStart="8dp"
                android:contentDescription="关闭"/>
        </LinearLayout>

        <!-- Status Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#FFFFFF"
            android:elevation="2dp"
            android:layout_margin="16dp"
            android:padding="16dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="状态"
                android:textSize="16sp"
                android:textColor="#6200EA"
                android:textStyle="bold"
                android:layout_marginBottom="12dp"/>

            <TextView
                android:id="@+id/txt_status"
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="● 未启动"
                android:textSize="14sp"
                android:textColor="#666666"/>
        </LinearLayout>

        <!-- AI Provider Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#FFFFFF"
            android:elevation="2dp"
            android:layout_marginStart="16dp"
            android:layout_marginEnd="16dp"
            android:layout_marginBottom="16dp"
            android:padding="16dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="AI Provider"
                android:textSize="16sp"
                android:textColor="#6200EA"
                android:textStyle="bold"
                android:layout_marginBottom="12dp"/>

            <!-- Provider Selection -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="提供商"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="8dp"/>

            <RadioGroup
                android:id="@+id/radio_provider"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:layout_marginTop="8dp">

                <RadioButton
                    android:id="@+id/radio_anthropic"
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="Anthropic"
                    android:checked="true"/>

                <RadioButton
                    android:id="@+id/radio_openai"
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="OpenAI"/>

                <RadioButton
                    android:id="@+id/radio_gemini"
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="Gemini"/>
            </RadioGroup>

            <!-- API Key -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="API Key"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_api_key"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="输入 API Key"
                android:inputType="textPassword"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:layout_marginTop="8dp"/>

            <!-- Model Name -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="模型"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_model"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="claude-sonnet-4-5-20250929"
                android:inputType="text"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:layout_marginTop="8dp"/>

            <!-- Base URL (optional) -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Base URL（可选）"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_base_url"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="https://api.anthropic.com"
                android:inputType="textUri"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:layout_marginTop="8dp"/>

            <!-- Max Tokens -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Max Tokens"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_max_tokens"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="4096"
                android:inputType="number"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:layout_marginTop="8dp"/>

            <!-- Temperature -->
            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="Temperature (0.0 - 2.0)"
                android:textSize="12sp"
                android:textColor="#999999"
                android:layout_marginTop="16dp"/>

            <EditText
                android:id="@+id/edit_temperature"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:hint="1.0"
                android:inputType="numberDecimal"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:layout_marginTop="8dp"/>
        </LinearLayout>

        <!-- System Prompt Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#FFFFFF"
            android:elevation="2dp"
            android:layout_marginStart="16dp"
            android:layout_marginEnd="16dp"
            android:layout_marginBottom="16dp"
            android:padding="16dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="系统提示词"
                android:textSize="16sp"
                android:textColor="#6200EA"
                android:textStyle="bold"
                android:layout_marginBottom="12dp"/>

            <EditText
                android:id="@+id/edit_system_prompt"
                android:layout_width="match_parent"
                android:layout_height="120dp"
                android:hint="输入系统提示词..."
                android:inputType="textMultiLine"
                android:gravity="top"
                android:padding="12dp"
                android:background="#F5F5F5"
                android:scrollbars="vertical"/>
        </LinearLayout>

        <!-- Advanced Settings Card -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:background="#FFFFFF"
            android:elevation="2dp"
            android:layout_marginStart="16dp"
            android:layout_marginEnd="16dp"
            android:layout_marginBottom="16dp"
            android:padding="16dp">

            <TextView
                android:layout_width="wrap_content"
                android:layout_height="wrap_content"
                android:text="高级设置"
                android:textSize="16sp"
                android:textColor="#6200EA"
                android:textStyle="bold"
                android:layout_marginBottom="12dp"/>

            <!-- Context Window Warning -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:layout_marginTop="8dp">

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="上下文窗口警告阈值"
                    android:textSize="14sp"
                    android:textColor="#333333"/>

                <EditText
                    android:id="@+id/edit_context_warning"
                    android:layout_width="100dp"
                    android:layout_height="wrap_content"
                    android:hint="3500"
                    android:inputType="number"
                    android:padding="8dp"
                    android:textSize="14sp"
                    android:background="#F5F5F5"/>
            </LinearLayout>

            <!-- Auto Save -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="16dp">

                <CheckBox
                    android:id="@+id/check_auto_save"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="true"/>

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="自动保存会话"
                    android:textSize="14sp"
                    android:textColor="#333333"
                    android:layout_marginStart="8dp"/>
            </LinearLayout>

            <!-- Compression -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="12dp">

                <CheckBox
                    android:id="@+id/check_compression"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="true"/>

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="启用上下文压缩"
                    android:textSize="14sp"
                    android:textColor="#333333"
                    android:layout_marginStart="8dp"/>
            </LinearLayout>

            <!-- Notifications -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="12dp">

                <CheckBox
                    android:id="@+id/check_notifications"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="true"/>

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="启用通知"
                    android:textSize="14sp"
                    android:textColor="#333333"
                    android:layout_marginStart="8dp"/>
            </LinearLayout>

            <!-- Auto Open Chat Window -->
            <LinearLayout
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="horizontal"
                android:gravity="center_vertical"
                android:layout_marginTop="12dp">

                <CheckBox
                    android:id="@+id/check_auto_open_chat"
                    android:layout_width="wrap_content"
                    android:layout_height="wrap_content"
                    android:checked="false"/>

                <TextView
                    android:layout_width="0dp"
                    android:layout_height="wrap_content"
                    android:layout_weight="1"
                    android:text="启动时自动打开聊天窗口"
                    android:textSize="14sp"
                    android:textColor="#333333"
                    android:layout_marginStart="8dp"/>
            </LinearLayout>
        </LinearLayout>

        <!-- Action Buttons -->
        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical"
            android:padding="16dp">

            <!-- Save Config Button -->
            <Button
                android:id="@+id/btn_save_config"
                android:layout_width="match_parent"
                android:layout_height="56dp"
                android:text="保存配置"
                android:textSize="16sp"
                android:textColor="#FFFFFF"
                android:background="#2196F3"
                android:elevation="2dp"
                android:layout_marginBottom="12dp"/>

            <!-- Start Chat Button -->
            <Button
                android:id="@+id/btn_start_chat"
                android:layout_width="match_parent"
                android:layout_height="56dp"
                android:text="启动聊天窗口"
                android:textSize="16sp"
                android:textColor="#FFFFFF"
                android:background="#4CAF50"
                android:elevation="2dp"
                android:layout_marginBottom="12dp"/>

            <!-- Stop Chat Button -->
            <Button
                android:id="@+id/btn_stop_chat"
                android:layout_width="match_parent"
                android:layout_height="56dp"
                android:text="停止聊天窗口"
                android:textSize="16sp"
                android:textColor="#FFFFFF"
                android:background="#F44336"
                android:elevation="2dp"
                android:visibility="gone"/>
        </LinearLayout>

        <!-- Footer -->
        <TextView
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:text="Anode ClawdBot v1.0.8"
            android:textSize="12sp"
            android:textColor="#999999"
            android:gravity="center"
            android:padding="16dp"/>
    </LinearLayout>
</ScrollView>`;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    const success = floatingWindow.on('click', (event: any) => {
      try {
        switch (event.viewId) {
          case 'btn_close':
            this.close();
            break;
          case 'btn_minimize':
            this.hide();
            break;
          case 'btn_save_config':
            this.handleSaveConfig();
            break;
          case 'btn_start_chat':
            this.handleStartChat();
            break;
          case 'btn_stop_chat':
            this.handleStopChat();
            break;
        }
      } catch (error) {
        logger.error('Event handler error', { error: (error as Error).message });
      }
    });

    if (!success) {
      logger.error('Failed to register click event listener');
    }
  }

  /**
   * 加载配置到 UI
   */
  private async loadConfigToUI(): Promise<void> {
    try {
      const config = this.configManager.get();

      // Provider
      const providerMap: { [key: string]: string } = {
        'anthropic': 'radio_anthropic',
        'openai': 'radio_openai',
        'gemini': 'radio_gemini'
      };
      const radioId = providerMap[config.model.provider] || 'radio_anthropic';
      const radioView = floatingWindow.findView(radioId);
      if (radioView) {
        floatingWindow.setChecked(radioView, true);
      }

      // API Key
      const apiKeyView = floatingWindow.findView('edit_api_key');
      if (apiKeyView) {
        floatingWindow.setText(apiKeyView, config.model.apiKey || '');
      }

      // Model
      const modelView = floatingWindow.findView('edit_model');
      if (modelView) {
        floatingWindow.setText(modelView, config.model.model);
      }

      // Base URL
      if (config.model.baseURL) {
        const baseUrlView = floatingWindow.findView('edit_base_url');
        if (baseUrlView) {
          floatingWindow.setText(baseUrlView, config.model.baseURL);
        }
      }

      // Max Tokens
      const maxTokensView = floatingWindow.findView('edit_max_tokens');
      if (maxTokensView) {
        floatingWindow.setText(maxTokensView, config.model.maxTokens.toString());
      }

      // Temperature
      const temperatureView = floatingWindow.findView('edit_temperature');
      if (temperatureView) {
        floatingWindow.setText(temperatureView, config.model.temperature.toString());
      }

      // System Prompt
      const systemPromptView = floatingWindow.findView('edit_system_prompt');
      if (systemPromptView) {
        floatingWindow.setText(systemPromptView, config.agent.defaultSystemPrompt);
      }

      // Context Warning
      const contextWarningView = floatingWindow.findView('edit_context_warning');
      if (contextWarningView) {
        floatingWindow.setText(contextWarningView, config.agent.contextWindowWarning.toString());
      }

      // Checkboxes
      const autoSaveView = floatingWindow.findView('check_auto_save');
      if (autoSaveView) {
        floatingWindow.setChecked(autoSaveView, config.agent.autoSave);
      }

      const compressionView = floatingWindow.findView('check_compression');
      if (compressionView) {
        floatingWindow.setChecked(compressionView, config.agent.compressionEnabled);
      }

      const notificationsView = floatingWindow.findView('check_notifications');
      if (notificationsView && config.ui) {
        floatingWindow.setChecked(notificationsView, config.ui.notifications.enabled);
      }

      // Auto Open Chat Window
      const autoOpenChatView = floatingWindow.findView('check_auto_open_chat');
      if (autoOpenChatView && config.ui) {
        floatingWindow.setChecked(autoOpenChatView, config.ui.floatingWindow?.autoOpen ?? false);
      }

      logger.info('Config loaded to UI');
    } catch (error) {
      logger.error('Failed to load config to UI', { error: (error as Error).message });
    }
  }

  /**
   * 保存配置
   */
  private async handleSaveConfig(): Promise<void> {
    try {
      const config = this.configManager.get();

      // 读取 Provider
      const anthropicView = floatingWindow.findView('radio_anthropic');
      const openaiView = floatingWindow.findView('radio_openai');
      const geminiView = floatingWindow.findView('radio_gemini');

      if (anthropicView && floatingWindow.isChecked(anthropicView)) {
        config.model.provider = 'anthropic';
      } else if (openaiView && floatingWindow.isChecked(openaiView)) {
        config.model.provider = 'openai';
      } else if (geminiView && floatingWindow.isChecked(geminiView)) {
        config.model.provider = 'gemini';
      }

      // API Key
      const apiKeyView = floatingWindow.findView('edit_api_key');
      if (apiKeyView) {
        config.model.apiKey = floatingWindow.getText(apiKeyView);
      }

      // Model
      const modelView = floatingWindow.findView('edit_model');
      if (modelView) {
        const modelText = floatingWindow.getText(modelView);
        if (modelText) {
          config.model.model = modelText;
        }
      }

      // Base URL
      const baseUrlView = floatingWindow.findView('edit_base_url');
      if (baseUrlView) {
        const baseUrl = floatingWindow.getText(baseUrlView);
        if (baseUrl) {
          config.model.baseURL = baseUrl;
        }
      }

      // Max Tokens
      const maxTokensView = floatingWindow.findView('edit_max_tokens');
      if (maxTokensView) {
        const maxTokensText = floatingWindow.getText(maxTokensView);
        if (maxTokensText) {
          config.model.maxTokens = parseInt(maxTokensText, 10);
        }
      }

      // Temperature
      const temperatureView = floatingWindow.findView('edit_temperature');
      if (temperatureView) {
        const tempText = floatingWindow.getText(temperatureView);
        if (tempText) {
          config.model.temperature = parseFloat(tempText);
        }
      }

      // System Prompt
      const systemPromptView = floatingWindow.findView('edit_system_prompt');
      if (systemPromptView) {
        const prompt = floatingWindow.getText(systemPromptView);
        if (prompt) {
          config.agent.defaultSystemPrompt = prompt;
        }
      }

      // Context Warning
      const contextWarningView = floatingWindow.findView('edit_context_warning');
      if (contextWarningView) {
        const warningText = floatingWindow.getText(contextWarningView);
        if (warningText) {
          config.agent.contextWindowWarning = parseInt(warningText, 10);
        }
      }

      // Checkboxes
      const autoSaveView = floatingWindow.findView('check_auto_save');
      if (autoSaveView) {
        config.agent.autoSave = floatingWindow.isChecked(autoSaveView);
      }

      const compressionView = floatingWindow.findView('check_compression');
      if (compressionView) {
        config.agent.compressionEnabled = floatingWindow.isChecked(compressionView);
      }

      const notificationsView = floatingWindow.findView('check_notifications');
      if (notificationsView && config.ui) {
        config.ui.notifications.enabled = floatingWindow.isChecked(notificationsView);
      }

      // Auto Open Chat Window
      const autoOpenChatView = floatingWindow.findView('check_auto_open_chat');
      if (autoOpenChatView && config.ui) {
        if (!config.ui.floatingWindow) {
          config.ui.floatingWindow = { x: 50, y: 100, width: 700, height: 1000, autoOpen: false };
        }
        (config.ui.floatingWindow as any).autoOpen = floatingWindow.isChecked(autoOpenChatView);
      }

      // 保存到文件
      await this.configManager.save();

      // 更新状态
      this.updateStatus('✅ 配置已保存');

      logger.info('Config saved successfully');
    } catch (error) {
      logger.error('Failed to save config', { error: (error as Error).message });
      this.updateStatus('❌ 配置保存失败: ' + (error as Error).message);
    }
  }

  /**
   * 启动聊天窗口
   */
  private async handleStartChat(): Promise<void> {
    if (this.isChatRunning) {
      this.updateStatus('⚠️ 聊天窗口已在运行');
      return;
    }

    try {
      this.updateStatus('🚀 正在启动聊天窗口...');

      // 创建 AgentManager
      const config = this.configManager.get();
      this.agentManager = new AgentManager(config);

      // 创建 ChatWindow
      this.chatWindow = new ChatWindow(this.agentManager);

      // 显示聊天窗口
      const uiConfig = config.ui || {
        floatingWindow: { x: 50, y: 100, width: 700, height: 1000 }
      };

      await this.chatWindow.show({
        x: uiConfig.floatingWindow.x,
        y: uiConfig.floatingWindow.y,
        width: uiConfig.floatingWindow.width,
        height: uiConfig.floatingWindow.height,
      });

      this.isChatRunning = true;

      // 更新 UI
      this.updateStatus('● 聊天窗口运行中');
      this.toggleChatButtons(true);

      logger.info('Chat window started');
    } catch (error) {
      logger.error('Failed to start chat', { error: (error as Error).message });
      this.updateStatus('❌ 启动失败: ' + (error as Error).message);
      this.isChatRunning = false;
    }
  }

  /**
   * 停止聊天窗口
   */
  private handleStopChat(): void {
    if (!this.isChatRunning) {
      this.updateStatus('⚠️ 聊天窗口未运行');
      return;
    }

    try {
      if (this.chatWindow) {
        this.chatWindow.close();
        this.chatWindow = null;
      }

      this.agentManager = null;
      this.isChatRunning = false;

      // 更新 UI
      this.updateStatus('● 未启动');
      this.toggleChatButtons(false);

      logger.info('Chat window stopped');
    } catch (error) {
      logger.error('Failed to stop chat', { error: (error as Error).message });
      this.updateStatus('❌ 停止失败: ' + (error as Error).message);
    }
  }

  /**
   * 更新状态显示
   */
  private updateStatus(status: string): void {
    const statusView = floatingWindow.findView('txt_status');
    if (statusView) {
      floatingWindow.setText(statusView, status);
    }
  }

  /**
   * 切换聊天按钮显示
   */
  private toggleChatButtons(isRunning: boolean): void {
    const startBtn = floatingWindow.findView('btn_start_chat');
    const stopBtn = floatingWindow.findView('btn_stop_chat');

    if (startBtn && stopBtn) {
      floatingWindow.setVisibility(startBtn, !isRunning);
      floatingWindow.setVisibility(stopBtn, isRunning);
    }
  }
}
