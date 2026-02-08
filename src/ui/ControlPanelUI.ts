/**
 * Control Panel - 基于 UIAPI 的原生 Android UI 配置面板
 *
 * 优化：layout 后通过 ui.findViewById 缓存所有 View 引用，
 * 事件回调和配置读写直接操作缓存引用，避免重复 findViewById。
 */

import { ConfigManager } from '../config/ConfigManager.js';
import { Config } from '../config/schema.js';
import { logger } from '../utils/logger.js';
import { ChatWindow } from './ChatWindow.js';
import { AgentManager } from '../core/AgentManager.js';
import { NotificationManager } from './NotificationManager.js';
import { SessionList } from './SessionList.js';

// 声明全局 ui API
declare const ui: {
  layout(xmlString: string): boolean;
  layoutAsync(xmlString: string): Promise<any>;
  on(viewId: string, eventType: string, callback: (event: any) => void): boolean;
  off(viewId: string, eventType: string): boolean;
  findViewById(viewId: string): any;
  getText(viewId: string): string;
  setText(viewId: string, text: string): boolean;
  setTextColor(viewId: string, color: string): boolean;
  setVisibility(viewId: string, visibility: string): boolean;
  setEnabled(viewId: string, enabled: boolean): boolean;
  attr(viewId: string, name: string, value: string): boolean;
  finish(): boolean;
  addView(parentId: string, xmlContent: string): boolean;
  removeView(viewId: string): boolean;
  
  setAttrs(viewId:string,attrsJson: string): boolean;
};



// 声明 globalApi (toast 等)
declare const globalApi: { toast(msg: string, duration?: string): void };

export interface ControlPanelConfig {
  configPath?: string;
}

/** All view IDs used in the UI */
const VIEW_IDS = [
  // Tabs
  'tab_ai', 'tab_channels', 'tab_advanced',
  // Tab content
  'content_ai', 'content_channels', 'content_advanced',
  // Action buttons
  'btn_save', 'btn_start_chat', 'btn_stop_chat',
  // Radio buttons
  'radio_anthropic', 'radio_openai', 'radio_gemini',
  // AI config fields
  'edit_api_key', 'edit_model', 'edit_max_tokens', 'edit_temperature',
  'edit_base_url', 'edit_system_prompt',
  // Advanced fields
  'edit_context_warning',
  // Checkboxes
  'check_telegram_enabled', 'check_qq_enabled', 'check_wechat_enabled',
  'check_discord_enabled', 'check_feishu_enabled', 'check_dingtalk_enabled',
  'check_auto_save', 'check_compression', 'check_notifications',
  // Social config fields
  'edit_telegram_token',
  'edit_qq_appid', 'edit_qq_token',
  'edit_discord_token',
  'edit_feishu_appid', 'edit_feishu_secret',
  'edit_dingtalk_appkey', 'edit_dingtalk_secret',
] as const;

type ViewId = typeof VIEW_IDS[number];

/** Checkbox IDs */
const CHECKBOX_IDS: ViewId[] = [
  'check_telegram_enabled', 'check_qq_enabled', 'check_wechat_enabled',
  'check_discord_enabled', 'check_feishu_enabled', 'check_dingtalk_enabled',
  'check_auto_save', 'check_compression', 'check_notifications',
];

/** Radio button IDs */
const RADIO_IDS: ViewId[] = ['radio_anthropic', 'radio_openai', 'radio_gemini'];

export class ControlPanel {
  private configManager: ConfigManager;
  private agentManager: AgentManager | null = null;
  private chatWindow: ChatWindow | null = null;
  private notificationManager: NotificationManager;
  private sessionList: SessionList | null = null;
  private isChatRunning = false;
  private currentTab: 'ai' | 'channels' | 'advanced' = 'ai';

  /** Cached view references — populated after layout */
  private v: Record<string, any> = {};

  /** Checkbox state tracking (UIAPI has no isChecked getter) */
  private checkboxStates: Map<string, boolean> = new Map();

  constructor(configManager: ConfigManager) {
    this.configManager = configManager;
    this.notificationManager = new NotificationManager();
  }

  // ==================================================
  // Lifecycle
  // ==================================================

  async show(config: ControlPanelConfig = {}): Promise<void> {
    const xml = this.createMainLayout();

    const success = ui.layout(xml);
    if (!success) {
      throw new Error('Failed to load UI layout');
    }

    // 等待 Android view 树完成 measure/layout pass
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    // 缓存所有 View 引用
    this.cacheViews();

    // 加载当前配置到 UI
    this.loadConfigToUI();

    // 设置 18 个事件监听
    const count = this.setupEventListeners();
    if (count === 0) {
      logger.warn('[ControlPanel] 0 events registered, retrying...');
      await new Promise<void>((resolve) => setTimeout(resolve, 500));
      this.cacheViews();
      const retry = this.setupEventListeners();
      logger.info(`[ControlPanel] Retry: ${retry} events registered`);
    }

    logger.info('[ControlPanel] shown');
  }

  close(): void {
    if (this.chatWindow) {
      this.chatWindow.close();
    }
    this.sessionList?.close();
    this.sessionList = null;
    this.notificationManager.shutdown().catch(() => {});
    if (this.agentManager) {
      this.agentManager.shutdown().catch(() => {});
      this.agentManager = null;
    }
    ui.finish();
    logger.info('[ControlPanel] closed');
  }

  // ==================================================
  // View cache — 一次性 findViewById, 后续直接用引用
  // ==================================================

  private cacheViews(): void {
    let found = 0;
    let missing = 0;

    for (const id of VIEW_IDS) {
      const view = ui.findViewById(id);
      if (view) {
        this.v[id] = view;
        found++;
      } else {
        logger.warn(`[ControlPanel] view not found: '${id}'`);
        missing++;
      }
    }

    logger.info(`[ControlPanel] cacheViews: ${found} found, ${missing} missing`);
  }

  // ==================================================
  // Event listeners — 18 events total
  // ==================================================

  private setupEventListeners(): number {
    let count = 0;

    const bind = (id: ViewId, handler: () => void): void => {
      const ok = ui.on(id, 'click', function() { handler(); });
      if (ok) {
        count++;
      } else {
        logger.warn(`[ControlPanel] ui.on('${id}','click') returned false`);
      }
    };

    // 3 tab switches
    bind('tab_ai', () => this.switchTab('ai'));
    bind('tab_channels', () => this.switchTab('channels'));
    bind('tab_advanced', () => this.switchTab('advanced'));

    // 1 save
    bind('btn_save', () => this.handleSaveConfig());

    // 2 chat start/stop
    bind('btn_start_chat', () => this.handleStartChat());
    bind('btn_stop_chat', () => this.handleStopChat());

    // 9 checkboxes
    for (const id of CHECKBOX_IDS) {
      bind(id, () => {
        const prev = this.checkboxStates.get(id) ?? false;
        this.checkboxStates.set(id, !prev);
        logger.debug(`[ControlPanel] ${id} → ${!prev}`);
      });
    }

    // 3 radio buttons
    bind('radio_anthropic', () => this.setProviderRadio('anthropic'));
    bind('radio_openai', () => this.setProviderRadio('openai'));
    bind('radio_gemini', () => this.setProviderRadio('gemini'));

    logger.info(`[ControlPanel] ${count}/18 events registered`);
    return count;
  }

  // ==================================================
  // Helpers — use cached view references
  // ==================================================

  private setProviderRadio(provider: 'anthropic' | 'openai' | 'gemini'): void {
    this.checkboxStates.set('radio_anthropic', provider === 'anthropic');
    this.checkboxStates.set('radio_openai', provider === 'openai');
    this.checkboxStates.set('radio_gemini', provider === 'gemini');
  }

  private setCheckboxState(id: string, checked: boolean): void {
    this.checkboxStates.set(id, checked);
    this.v[id]?.attr?.('checked', checked ? 'true' : 'false');
  }

  private getCheckboxState(id: string): boolean {
    // Try to read actual UI state first, fallback to cached state
    const view = this.v[id];
    let result = false;
    let source = 'default';

    if (view) {
      // Try different methods to get checkbox state
      if (typeof view.isChecked === 'function') {
        result = view.isChecked();
        source = 'view.isChecked()';
      } else if (typeof view.attr === 'function') {
        const checked = view.attr('checked');
        if (checked !== undefined && checked !== null) {
          result = checked === true || checked === 'true';
          source = `view.attr('checked')=${checked}`;
        }
      }
    }

    // Final fallback to cached state
    if (source === 'default') {
      result = this.checkboxStates.get(id) ?? false;
      source = 'checkboxStates Map';
    }

    logger.debug(`[ControlPanel] getCheckboxState('${id}') = ${result} (source: ${source})`);
    return result;
  }

  /** Read text from cached view (fallback to ui.getText) */
  private readText(id: string): string {
    const view = this.v[id];
    if (view && typeof view.getText === 'function') return view.getText();
    return ui.getText(id);
  }

  /** Write text to cached view (fallback to ui.setText) */
  private writeText(id: string, text: string): void {
    const view = this.v[id];
    if (view && typeof view.setText === 'function') {
      view.setText(text);
    } else {
      ui.setText(id, text);
    }
  }

  // ==================================================
  // Tab switching — use cached tab & content views
  // ==================================================



  private switchTab(tab: 'ai' | 'channels' | 'advanced') {
    this.currentTab = tab;
    // 🚀 不要在这里循环调用 6 次 JNI！合并成一个批量操作
    const updates = {};
    ['ai', 'channels', 'advanced'].forEach(t => {
        const isActive = (t === tab);
        // 如果底层支持 setAttrs，则合并调用
        ui.setAttrs(`content_${t}`, JSON.stringify({
            visibility: isActive ? 'visible' : 'gone'
        }));
    });
}

  // ==================================================
  // Config ↔ UI
  // ==================================================

  private loadConfigToUI(): void {
    try {
      const config = this.configManager.get();

      // AI Provider
      const provider = config.model.provider || 'anthropic';
      this.setProviderRadio(provider as 'anthropic' | 'openai' | 'gemini');
      this.v[`radio_${provider}`]?.attr?.('checked', 'true');

      // AI fields
      this.writeText('edit_api_key', config.model.apiKey || '');
      this.writeText('edit_model', config.model.model);
      this.writeText('edit_max_tokens', config.model.maxTokens.toString());
      this.writeText('edit_temperature', config.model.temperature.toString());
      if (config.model.baseURL) {
        this.writeText('edit_base_url', config.model.baseURL);
      }
      this.writeText('edit_system_prompt', config.agent.defaultSystemPrompt);

      // Advanced
      this.writeText('edit_context_warning', config.agent.contextWindowWarning.toString());
      this.setCheckboxState('check_auto_save', config.agent.autoSave !== false);
      this.setCheckboxState('check_compression', config.agent.compressionEnabled !== false);
      this.setCheckboxState('check_notifications', config.ui?.notifications?.enabled !== false);

      // Social platforms
      if (config.social) {
        if (config.social.telegram) {
          this.setCheckboxState('check_telegram_enabled', config.social.telegram.enabled ?? false);
          if (config.social.telegram.botToken) this.writeText('edit_telegram_token', config.social.telegram.botToken);
        }
        if (config.social.qq) {
          this.setCheckboxState('check_qq_enabled', config.social.qq.enabled ?? false);
          if (config.social.qq.appId) this.writeText('edit_qq_appid', config.social.qq.appId);
          if (config.social.qq.token) this.writeText('edit_qq_token', config.social.qq.token);
        }
        if (config.social.wechat) {
          this.setCheckboxState('check_wechat_enabled', config.social.wechat.enabled ?? false);
        }
        if (config.social.discord) {
          this.setCheckboxState('check_discord_enabled', config.social.discord.enabled ?? false);
          if (config.social.discord.botToken) this.writeText('edit_discord_token', config.social.discord.botToken);
        }
        if (config.social.feishu) {
          this.setCheckboxState('check_feishu_enabled', config.social.feishu.enabled ?? false);
          if (config.social.feishu.appId) this.writeText('edit_feishu_appid', config.social.feishu.appId);
          if (config.social.feishu.appSecret) this.writeText('edit_feishu_secret', config.social.feishu.appSecret);
        }
        if (config.social.dingtalk) {
          this.setCheckboxState('check_dingtalk_enabled', config.social.dingtalk.enabled ?? false);
          if (config.social.dingtalk.appKey) this.writeText('edit_dingtalk_appkey', config.social.dingtalk.appKey);
          if (config.social.dingtalk.appSecret) this.writeText('edit_dingtalk_secret', config.social.dingtalk.appSecret);
        }
      }

      logger.info('[ControlPanel] config → UI loaded');
    } catch (error) {
      logger.error('[ControlPanel] loadConfigToUI failed', { error: (error as Error).message });
    }
  }

  private async handleSaveConfig(): Promise<void> {
    try {
      const config = this.configManager.get();

      // Provider
      if (this.getCheckboxState('radio_openai')) config.model.provider = 'openai';
      else if (this.getCheckboxState('radio_gemini')) config.model.provider = 'gemini';
      else config.model.provider = 'anthropic';

      // AI fields — read from cached views
      config.model.apiKey = this.readText('edit_api_key');
      const model = this.readText('edit_model');
      if (model) config.model.model = model;
      const maxTok = this.readText('edit_max_tokens');
      if (maxTok) config.model.maxTokens = parseInt(maxTok, 10);
      const temp = this.readText('edit_temperature');
      if (temp) config.model.temperature = parseFloat(temp);
      const baseUrl = this.readText('edit_base_url');
      config.model.baseURL = baseUrl?.trim() || undefined;
      const prompt = this.readText('edit_system_prompt');
      if (prompt) config.agent.defaultSystemPrompt = prompt;
      const ctxWarn = this.readText('edit_context_warning');
      if (ctxWarn) config.agent.contextWindowWarning = parseInt(ctxWarn, 10);

      // Advanced checkboxes
      config.agent.autoSave = this.getCheckboxState('check_auto_save');
      config.agent.compressionEnabled = this.getCheckboxState('check_compression');
      if (!config.ui) {
        config.ui = { theme: 'auto', floatingWindow: { width: 700, height: 1000, x: 50, y: 100, autoOpen: false }, notifications: { enabled: true, showProgress: true } };
      }
      if (config.ui.notifications) {
        config.ui.notifications.enabled = this.getCheckboxState('check_notifications');
      }

      // Social - always save enabled state, even if token is empty
      if (!config.social) config.social = {};

      // Telegram
      const tgEnabled = this.getCheckboxState('check_telegram_enabled');
      const tgToken = this.readText('edit_telegram_token');
      config.social.telegram = { enabled: tgEnabled, botToken: tgToken || undefined };

      // QQ
      const qqEnabled = this.getCheckboxState('check_qq_enabled');
      const qqId = this.readText('edit_qq_appid');
      const qqTok = this.readText('edit_qq_token');
      config.social.qq = { enabled: qqEnabled, appId: qqId || undefined, token: qqTok || undefined };

      // WeChat
      config.social.wechat = { enabled: this.getCheckboxState('check_wechat_enabled') };

      // Discord
      const dcEnabled = this.getCheckboxState('check_discord_enabled');
      const dcTok = this.readText('edit_discord_token');
      config.social.discord = { enabled: dcEnabled, botToken: dcTok || undefined };

      // Feishu
      const fsEnabled = this.getCheckboxState('check_feishu_enabled');
      const fsId = this.readText('edit_feishu_appid');
      const fsSec = this.readText('edit_feishu_secret');
      config.social.feishu = { enabled: fsEnabled, appId: fsId || undefined, appSecret: fsSec || undefined };

      // DingTalk
      const dtEnabled = this.getCheckboxState('check_dingtalk_enabled');
      const dtKey = this.readText('edit_dingtalk_appkey');
      const dtSec = this.readText('edit_dingtalk_secret');
      config.social.dingtalk = { enabled: dtEnabled, appKey: dtKey || undefined, appSecret: dtSec || undefined };

      logger.info('[ControlPanel] Saving social config:', {
        telegram: config.social.telegram?.enabled,
        qq: config.social.qq?.enabled,
        wechat: config.social.wechat?.enabled,
        discord: config.social.discord?.enabled,
        feishu: config.social.feishu?.enabled,
        dingtalk: config.social.dingtalk?.enabled,
      });

      await this.configManager.save();
      logger.info('[ControlPanel] config saved');
      globalApi.toast('配置保存成功',"long");
    } catch (error) {
      logger.error('[ControlPanel] save failed', { error: (error as Error).message });
      globalApi.toast('配置保存失败: ' + (error as Error).message,"long");
    }
  }

  // ==================================================
  // Chat window
  // ==================================================

  private async handleStartChat(): Promise<void> {
    if (this.isChatRunning) return;

    try {
      // Save UI changes to config before starting chat
      await this.handleSaveConfig();

      const config = this.configManager.get();
      logger.info('[ControlPanel] Starting chat with provider:', config.model.provider);
      this.agentManager = new AgentManager(config);
      this.chatWindow = new ChatWindow(this.agentManager);
      await this.chatWindow.show();
      this.isChatRunning = true;

      // Initialize SessionList for session management
      this.sessionList = new SessionList(this.agentManager);
      this.sessionList.onSessionSelect((sessionId) => {
        logger.info(`[ControlPanel] Session selected: ${sessionId}`);
        // Could switch ChatWindow to this session in the future
      });
      this.sessionList.onNewSession(async () => {
        if (this.agentManager) {
          const session = await this.agentManager.createSession({});
          logger.info(`[ControlPanel] New session created: ${session.sessionId}`);
          this.sessionList?.refresh();
        }
      });
      this.sessionList.onDeleteSession((sessionId) => {
        logger.info(`[ControlPanel] Session deleted: ${sessionId}`);
      });

      // Show notification if enabled
      if (config.ui?.notifications?.enabled !== false) {
        this.notificationManager.onShowWindow(() => {
          // Re-show chat window if hidden
          this.chatWindow?.show();
        });
        this.notificationManager.onQuickMessage(async (message) => {
          if (this.agentManager) {
            const sessions = this.agentManager.getActiveSessions();
            if (sessions.length > 0) {
              const response = await this.agentManager.sendMessage(sessions[0], message);
              if (response.type === 'text') {
                this.notificationManager.update(response.content.substring(0, 100));
              }
            }
          }
        });
        this.notificationManager.show().catch(err => {
          logger.warn('[ControlPanel] Notification show failed:', err);
        });
      }

      // 切换按钮 — use cached views
      this.v['btn_start_chat']?.setVisibility?.('gone');
      this.v['btn_stop_chat']?.setVisibility?.('visible');

      logger.info('[ControlPanel] chat started');
      globalApi.toast('聊天窗口已启动',"long");
    } catch (error) {
      logger.error('[ControlPanel] start chat failed', { error: (error as Error).message });
      globalApi.toast('启动失败: ' + (error as Error).message,"long");
    }
  }

  private handleStopChat(): void {
    if (!this.isChatRunning) return;

    try {
      this.chatWindow?.close();
      this.chatWindow = null;
      this.sessionList?.close();
      this.sessionList = null;
      this.notificationManager.hide().catch(() => {});
      if (this.agentManager) {
        this.agentManager.shutdown().catch(err => {
          logger.warn('[ControlPanel] AgentManager shutdown error:', err);
        });
      }
      this.agentManager = null;
      this.isChatRunning = false;

      this.v['btn_start_chat']?.setVisibility?.('visible');
      this.v['btn_stop_chat']?.setVisibility?.('gone');

      logger.info('[ControlPanel] chat stopped');
    } catch (error) {
      logger.error('[ControlPanel] stop chat failed', { error: (error as Error).message });
    }
  }

  // ==================================================
  // XML Layout (unchanged)
  // ==================================================

  private createMainLayout(): string {
    return `
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="match_parent"
    android:orientation="vertical"
    android:background="#FAFAFA">

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="56dp"
        android:orientation="horizontal"
        android:gravity="center_vertical"
        android:background="#6200EA"
        android:padding="16dp">

        <TextView
            android:layout_width="0dp"
            android:layout_height="wrap_content"
            android:layout_weight="1"
            android:text="Anode ClawdBot 配置"
            android:textSize="20sp"
            android:textColor="#FFFFFF"
            android:textStyle="bold"/>

        <Button
            android:id="@+id/btn_save"
            android:layout_width="wrap_content"
            android:layout_height="36dp"
            android:text="保存"
            android:textSize="14sp"
            android:textColor="#FFFFFF"
            android:background="#2196F3"
            android:paddingLeft="16dp"
            android:paddingRight="16dp"
            android:paddingTop="8dp"
            android:paddingBottom="8dp"/>
    </LinearLayout>

    <HorizontalScrollView
        android:layout_width="match_parent"
        android:layout_height="48dp"
        android:background="#FFFFFF">

        <LinearLayout
            android:layout_width="wrap_content"
            android:layout_height="match_parent"
            android:orientation="horizontal">

            <Button
                android:id="@+id/tab_ai"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:text="AI 配置"
                android:textSize="16sp"
                android:textColor="#6200EA"
                android:background="#FFFFFF"
                android:paddingLeft="24dp"
                android:paddingRight="24dp"
                android:paddingTop="12dp"
                android:paddingBottom="12dp"/>

            <Button
                android:id="@+id/tab_channels"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:text="渠道配置"
                android:textSize="16sp"
                android:textColor="#666666"
                android:background="#FFFFFF"
                android:paddingLeft="24dp"
                android:paddingRight="24dp"
                android:paddingTop="12dp"
                android:paddingBottom="12dp"/>

            <Button
                android:id="@+id/tab_advanced"
                android:layout_width="wrap_content"
                android:layout_height="match_parent"
                android:text="高级设置"
                android:textSize="16sp"
                android:textColor="#666666"
                android:background="#FFFFFF"
                android:paddingLeft="24dp"
                android:paddingRight="24dp"
                android:paddingTop="12dp"
                android:paddingBottom="12dp"/>
        </LinearLayout>
    </HorizontalScrollView>

    <ScrollView
        android:layout_width="match_parent"
        android:layout_height="0dp"
        android:layout_weight="1"
        android:fillViewport="true">

        <LinearLayout
            android:layout_width="match_parent"
            android:layout_height="wrap_content"
            android:orientation="vertical">

            <LinearLayout
                android:id="@+id/content_ai"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:visibility="visible">
                ${this.createAIConfigSection()}
            </LinearLayout>

            <LinearLayout
                android:id="@+id/content_channels"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:visibility="gone">
                ${this.createChannelsConfigSection()}
            </LinearLayout>

            <LinearLayout
                android:id="@+id/content_advanced"
                android:layout_width="match_parent"
                android:layout_height="wrap_content"
                android:orientation="vertical"
                android:visibility="gone">
                ${this.createAdvancedConfigSection()}
            </LinearLayout>
        </LinearLayout>
    </ScrollView>

    <LinearLayout
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal"
        android:padding="16dp"
        android:background="#FFFFFF">

        <Button
            android:id="@+id/btn_start_chat"
            android:layout_width="0dp"
            android:layout_height="56dp"
            android:layout_weight="1"
            android:text="启动聊天"
            android:textSize="16sp"
            android:textColor="#FFFFFF"
            android:background="#4CAF50"
            android:layout_marginRight="8dp"/>

        <Button
            android:id="@+id/btn_stop_chat"
            android:layout_width="0dp"
            android:layout_height="56dp"
            android:layout_weight="1"
            android:text="停止聊天"
            android:textSize="16sp"
            android:textColor="#FFFFFF"
            android:background="#F44336"
            android:visibility="gone"
            android:layout_marginLeft="8dp"/>
    </LinearLayout>
</LinearLayout>`;
  }

  private createAIConfigSection(): string {
    return `
<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:background="#FFFFFF"
    android:layout_margin="16dp"
    android:padding="16dp">

    <TextView
        android:layout_width="wrap_content"
        android:layout_height="wrap_content"
        android:text="AI Provider"
        android:textSize="16sp"
        android:textColor="#6200EA"
        android:textStyle="bold"
        android:layout_marginBottom="16dp"/>

    <RadioGroup
        android:id="@+id/radio_provider"
        android:layout_width="match_parent"
        android:layout_height="wrap_content"
        android:orientation="horizontal">

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

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="API Key" android:textSize="12sp" android:textColor="#999999" android:layout_marginTop="16dp"/>
    <EditText android:id="@+id/edit_api_key" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:hint="输入 API Key" android:inputType="textPassword" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="模型" android:textSize="12sp" android:textColor="#999999" android:layout_marginTop="16dp"/>
    <EditText android:id="@+id/edit_model" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:hint="claude-sonnet-4-5-20250929" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="Max Tokens" android:textSize="12sp" android:textColor="#999999" android:layout_marginTop="16dp"/>
    <EditText android:id="@+id/edit_max_tokens" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:hint="4096" android:inputType="number" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="Temperature (0.0-2.0)" android:textSize="12sp" android:textColor="#999999" android:layout_marginTop="16dp"/>
    <EditText android:id="@+id/edit_temperature" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:hint="1.0" android:inputType="numberDecimal" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="Base URL (可选，用于 DeepSeek/Kimi 等兼容平台)" android:textSize="12sp" android:textColor="#999999" android:layout_marginTop="16dp"/>
    <EditText android:id="@+id/edit_base_url" android:layout_width="match_parent" android:layout_height="wrap_content"
        android:hint="https://api.deepseek.com (可选)" android:inputType="textUri" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>
</LinearLayout>

<LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="vertical"
    android:background="#FFFFFF"
    android:layout_marginLeft="16dp"
    android:layout_marginRight="16dp"
    android:layout_marginBottom="16dp"
    android:padding="16dp">

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content"
        android:text="系统提示词" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold" android:layout_marginBottom="12dp"/>
    <EditText android:id="@+id/edit_system_prompt" android:layout_width="match_parent" android:layout_height="120dp"
        android:hint="输入系统提示词..." android:inputType="textMultiLine" android:gravity="top" android:padding="12dp" android:background="#F5F5F5" android:scrollbars="vertical"/>
</LinearLayout>`;
  }

  private createChannelsConfigSection(): string {
    return `
<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_margin="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="Telegram" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_telegram_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <EditText android:id="@+id/edit_telegram_token" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="Bot Token" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="12dp"/>
</LinearLayout>

<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_marginLeft="16dp" android:layout_marginRight="16dp" android:layout_marginBottom="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="QQ Guild" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_qq_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <EditText android:id="@+id/edit_qq_appid" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="App ID" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="12dp"/>
    <EditText android:id="@+id/edit_qq_token" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="Token" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>
</LinearLayout>

<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_marginLeft="16dp" android:layout_marginRight="16dp" android:layout_marginBottom="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="微信" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_wechat_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <TextView android:layout_width="match_parent" android:layout_height="wrap_content" android:text="使用 Wechaty 自动登录" android:textSize="12sp" android:textColor="#666666" android:layout_marginTop="8dp"/>
</LinearLayout>

<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_marginLeft="16dp" android:layout_marginRight="16dp" android:layout_marginBottom="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="Discord" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_discord_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <EditText android:id="@+id/edit_discord_token" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="Bot Token" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="12dp"/>
</LinearLayout>

<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_marginLeft="16dp" android:layout_marginRight="16dp" android:layout_marginBottom="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="飞书" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_feishu_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <EditText android:id="@+id/edit_feishu_appid" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="App ID" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="12dp"/>
    <EditText android:id="@+id/edit_feishu_secret" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="App Secret" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>
</LinearLayout>

<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_marginLeft="16dp" android:layout_marginRight="16dp" android:layout_marginBottom="16dp" android:padding="16dp">
    <LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="horizontal" android:gravity="center_vertical">
        <TextView android:layout_width="0dp" android:layout_height="wrap_content" android:layout_weight="1" android:text="钉钉" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold"/>
        <CheckBox android:id="@+id/check_dingtalk_enabled" android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="启用"/>
    </LinearLayout>
    <EditText android:id="@+id/edit_dingtalk_appkey" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="App Key" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="12dp"/>
    <EditText android:id="@+id/edit_dingtalk_secret" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="App Secret" android:inputType="text" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>
</LinearLayout>`;
  }

  private createAdvancedConfigSection(): string {
    return `
<LinearLayout android:layout_width="match_parent" android:layout_height="wrap_content" android:orientation="vertical" android:background="#FFFFFF" android:layout_margin="16dp" android:padding="16dp">
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="高级设置" android:textSize="16sp" android:textColor="#6200EA" android:textStyle="bold" android:layout_marginBottom="16dp"/>

    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:text="上下文窗口警告阈值" android:textSize="14sp" android:textColor="#333333"/>
    <EditText android:id="@+id/edit_context_warning" android:layout_width="match_parent" android:layout_height="wrap_content" android:hint="3500" android:inputType="number" android:padding="12dp" android:background="#F5F5F5" android:layout_marginTop="8dp"/>

    <CheckBox android:id="@+id/check_auto_save" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="自动保存会话" android:layout_marginTop="16dp" android:checked="true"/>
    <CheckBox android:id="@+id/check_compression" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="启用上下文压缩" android:layout_marginTop="8dp" android:checked="true"/>
    <CheckBox android:id="@+id/check_notifications" android:layout_width="match_parent" android:layout_height="wrap_content" android:text="启用通知" android:layout_marginTop="8dp" android:checked="true"/>
</LinearLayout>`;
  }
}
