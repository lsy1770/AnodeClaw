/**
 * QQ Adapter
 *
 * Adapter for QQ using go-cqhttp (OneBot v11 protocol) via WebSocket.
 * Requires go-cqhttp service running and accessible.
 *
 * For QQ Guild Bot (QQ频道): See QQGuildAdapter below.
 * For QQ personal/group chat: Use this adapter with go-cqhttp.
 *
 * go-cqhttp setup: https://docs.go-cqhttp.org/
 * Config: Set ws_reverse_url or use forward WS connection.
 */

import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
import type {
  SocialMessage,
  OutgoingMessage,
  BotInfo,
  ChatInfo,
} from '../types.js';
// qq-guild-bot / ws 是 CJS 包，不能用命名导入
import QQGuildSDK from 'qq-guild-bot';
const { createOpenAPI, createWebsocket } = QQGuildSDK as any;
import WS from 'ws';
const { WebSocket } = WS as any;

/**
 * QQ Adapter (OneBot v11 / go-cqhttp)
 *
 * Connects to go-cqhttp via WebSocket and handles
 * private messages, group messages, and basic operations.
 */
export class QQAdapter extends BaseSocialAdapter {
  readonly platformName = 'qq';
  readonly displayName = 'QQ';

  private ws?: any;
  private botQQ?: string;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private apiCallbacks: Map<string, { resolve: (v: any) => void; reject: (e: Error) => void }> = new Map();
  private nextEcho = 0;

  /**
   * Connect to go-cqhttp via WebSocket
   */
  protected async connect(): Promise<void> {
    const wsUrl = this.config?.options?.wsUrl;
    if (!wsUrl) {
      throw new Error('QQ adapter requires wsUrl config (go-cqhttp WebSocket address, e.g. ws://127.0.0.1:6700)');
    }

    return new Promise<void>((resolve, reject) => {
      try {
        this.ws = new WebSocket(wsUrl as string);

        const connectTimeout = setTimeout(() => {
          reject(new Error('QQ WebSocket connection timeout'));
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectTimeout);
          logger.info(`[${this.platformName}] WebSocket connected to go-cqhttp`);
          // Request login info to get bot QQ number
          this.callAPI('get_login_info', {}).then((data) => {
            this.botQQ = String(data.user_id);
            logger.info(`[${this.platformName}] Logged in as QQ: ${this.botQQ} (${data.nickname})`);
            resolve();
          }).catch((err) => {
            logger.warn(`[${this.platformName}] Could not get login info: ${err.message}`);
            resolve(); // Still resolve - connection works, just can't get info
          });
        });

        this.ws.on('message', (raw: Buffer | string) => {
          this.handleWSMessage(raw);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          logger.warn(`[${this.platformName}] WebSocket closed: ${code} ${reason}`);
          this._status.connected = false;
          this.scheduleReconnect();
        });

        this.ws.on('error', (err: Error) => {
          logger.error(`[${this.platformName}] WebSocket error:`, err);
          clearTimeout(connectTimeout);
          if (!this._status.connected) {
            reject(err);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from go-cqhttp
   */
  protected async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = undefined;
    }

    // Reject all pending API calls
    for (const [, cb] of this.apiCallbacks) {
      cb.reject(new Error('Adapter disconnected'));
    }
    this.apiCallbacks.clear();
  }

  /**
   * Send message to QQ user or group
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('QQ WebSocket not connected');
    }

    const chatId = message.chatId;
    const isGroup = chatId.startsWith('group_');
    const id = isGroup ? chatId.replace('group_', '') : chatId;

    const action = isGroup ? 'send_group_msg' : 'send_private_msg';
    const params: Record<string, any> = isGroup
      ? { group_id: Number(id), message: message.text }
      : { user_id: Number(id), message: message.text };

    // Handle attachments (images)
    if (message.attachments && message.attachments.length > 0) {
      const segments: any[] = [{ type: 'text', data: { text: message.text } }];
      for (const att of message.attachments) {
        if (att.type === 'image') {
          segments.push({ type: 'image', data: { file: att.url } });
        }
      }
      params.message = segments;
    }

    await this.callAPI(action, params);
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<BotInfo> {
    try {
      const data = await this.callAPI('get_login_info', {});
      return {
        id: String(data.user_id),
        username: data.nickname || 'QQ Bot',
        displayName: data.nickname || 'QQ Bot',
        platform: this.platformName,
      };
    } catch {
      return {
        id: this.botQQ || 'unknown',
        username: 'QQ Bot',
        displayName: 'QQ Bot',
        platform: this.platformName,
      };
    }
  }

  /**
   * Get chat info
   */
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    const isGroup = chatId.startsWith('group_');
    const id = isGroup ? chatId.replace('group_', '') : chatId;

    if (isGroup) {
      try {
        const data = await this.callAPI('get_group_info', { group_id: Number(id) });
        return {
          id: chatId,
          type: 'group',
          title: data.group_name,
          memberCount: data.member_count,
          platform: this.platformName,
        };
      } catch {
        return { id: chatId, type: 'group', platform: this.platformName };
      }
    }

    try {
      const data = await this.callAPI('get_stranger_info', { user_id: Number(id) });
      return {
        id: chatId,
        type: 'private',
        title: data.nickname,
        platform: this.platformName,
      };
    } catch {
      return { id: chatId, type: 'private', platform: this.platformName };
    }
  }

  /**
   * Call go-cqhttp API via WebSocket
   */
  private callAPI(action: string, params: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const echo = String(++this.nextEcho);
      const timeout = setTimeout(() => {
        this.apiCallbacks.delete(echo);
        reject(new Error(`API call ${action} timed out`));
      }, 10000);

      this.apiCallbacks.set(echo, {
        resolve: (data) => {
          clearTimeout(timeout);
          resolve(data);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws.send(JSON.stringify({ action, params, echo }));
    });
  }

  /**
   * Handle incoming WebSocket message from go-cqhttp
   */
  private handleWSMessage(raw: Buffer | string): void {
    try {
      const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString());

      // API response (has echo field)
      if (data.echo !== undefined) {
        const cb = this.apiCallbacks.get(String(data.echo));
        if (cb) {
          this.apiCallbacks.delete(String(data.echo));
          if (data.status === 'ok' || data.retcode === 0) {
            cb.resolve(data.data);
          } else {
            cb.reject(new Error(`API error: ${data.msg || data.wording || 'unknown'}`));
          }
        }
        return;
      }

      // Event (message, notice, etc.)
      if (data.post_type === 'message') {
        this.handleQQMessage(data);
      } else if (data.post_type === 'meta_event') {
        if (data.meta_event_type === 'heartbeat') {
          logger.debug(`[${this.platformName}] Heartbeat received`);
        }
      }
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to parse WS message:`, error);
    }
  }

  /**
   * Handle QQ message event
   */
  private async handleQQMessage(data: any): Promise<void> {
    try {
      const isGroup = data.message_type === 'group';
      const chatId = isGroup ? `group_${data.group_id}` : String(data.user_id);

      // Extract plain text from CQ message or array format
      let text = '';
      if (typeof data.message === 'string') {
        // CQ code string format - extract text portions
        text = data.message.replace(/\[CQ:[^\]]+\]/g, '').trim();
      } else if (Array.isArray(data.message)) {
        // Array format
        text = data.message
          .filter((seg: any) => seg.type === 'text')
          .map((seg: any) => seg.data.text)
          .join('');
      } else {
        text = data.raw_message || '';
      }

      const message: SocialMessage = {
        messageId: String(data.message_id),
        chatId,
        userId: String(data.user_id),
        username: data.sender?.nickname || data.sender?.card || String(data.user_id),
        text,
        timestamp: data.time * 1000,
        platform: this.platformName,
        attachments: this.extractAttachments(data.message),
      };

      // For group messages, add metadata about the group
      if (isGroup) {
        (message as any).groupId = String(data.group_id);
        (message as any).groupName = data.sender?.card || undefined;
      }

      await this.emitMessage(message);
    } catch (error) {
      logger.error(`[${this.platformName}] Error handling QQ message:`, error);
    }
  }

  /**
   * Extract attachments from QQ message segments
   */
  private extractAttachments(message: any): any[] {
    if (!Array.isArray(message)) return [];

    const attachments: any[] = [];
    for (const seg of message) {
      if (seg.type === 'image') {
        attachments.push({
          type: 'image',
          url: seg.data.url || seg.data.file,
          filename: seg.data.file,
        });
      } else if (seg.type === 'record') {
        attachments.push({
          type: 'audio',
          url: seg.data.url || seg.data.file,
        });
      } else if (seg.type === 'video') {
        attachments.push({
          type: 'video',
          url: seg.data.url || seg.data.file,
        });
      }
    }
    return attachments;
  }

  /**
   * Schedule reconnect after disconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      logger.info(`[${this.platformName}] Attempting reconnect...`);
      try {
        await this.connect();
        this._status.connected = true;
        logger.info(`[${this.platformName}] Reconnected successfully`);
      } catch (error) {
        logger.error(`[${this.platformName}] Reconnect failed:`, error);
        this.scheduleReconnect();
      }
    }, 5000);
  }
}

/**
 * QQ Guild Adapter (For QQ频道)
 *
 * This adapter can be implemented using qq-guild-bot package
 * npm install qq-guild-bot
 */
export class QQGuildAdapter extends BaseSocialAdapter {
  readonly platformName = 'qq-guild';
  readonly displayName = 'QQ Guild';

  private client?: any;

  /**
   * Connect to QQ Guild
   */
  protected async connect(): Promise<void> {
    if (!this.config?.appId || !this.config?.token) {
      throw new Error('QQ Guild app ID and token are required');
    }

    try {
      // Create OpenAPI client
      const client = createOpenAPI({
        appID: this.config.appId,
        token: this.config.token,
      });

      // Create WebSocket client
      this.client = createWebsocket({
        appID: this.config.appId,
        token: this.config.token,
        intents: ['GUILDS', 'GUILD_MEMBERS'] as any,
      });

      // Register message handler
      this.client.on('MESSAGE_CREATE', (data: any) => {
        this.handleQQGuildMessage(data);
      });

      logger.info(`[${this.platformName}] Connected to QQ Guild`);
    } catch (error) {
      logger.error(
        `[${this.platformName}] Failed to load qq-guild-bot. Install it with: npm install qq-guild-bot`
      );
      throw new Error(
        'qq-guild-bot package not found. Please install it first.'
      );
    }
  }

  /**
   * Disconnect from QQ Guild
   */
  protected async disconnect(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = undefined;
    }
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('QQ Guild client not initialized');
    }

    try {
      await this.client.sendMessage(message.chatId, {
        content: message.text,
        msg_id: message.replyTo,
      });
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<BotInfo> {
    if (!this.client || !this.client.user) {
      return {
        id: this.config?.appId || 'unknown',
        username: 'QQ Guild Bot',
        displayName: 'QQ Guild Bot',
        platform: this.platformName,
      };
    }

    return {
      id: this.client.user.id,
      username: this.client.user.username,
      displayName: this.client.user.username,
      platform: this.platformName,
    };
  }

  /**
   * Get chat info
   */
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    return {
      id: chatId,
      type: 'channel',
      platform: this.platformName,
    };
  }

  /**
   * Handle QQ Guild message
   */
  private async handleQQGuildMessage(data: any): Promise<void> {
    try {
      const message: SocialMessage = {
        messageId: data.id,
        chatId: data.channel_id,
        userId: data.author.id,
        username: data.author.username,
        text: data.content,
        timestamp: new Date(data.timestamp).getTime(),
        platform: this.platformName,
      };

      await this.emitMessage(message);
    } catch (error) {
      logger.error(`[${this.platformName}] Error handling message:`, error);
    }
  }
}
