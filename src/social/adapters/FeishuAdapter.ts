/**
 * Feishu/Lark Adapter
 *
 * Adapter for Feishu/Lark using @larksuiteoapi/node-sdk
 * Install: npm install @larksuiteoapi/node-sdk
 */

import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
import type {
  SocialMessage,
  OutgoingMessage,
  BotInfo,
  ChatInfo,
} from '../types.js';
// @larksuiteoapi/node-sdk 是 CJS 包，不能用命名导入
import LarkSDK from '@larksuiteoapi/node-sdk';
const { Client, WSClient, AppType, Domain, EventDispatcher } = LarkSDK as any;

/**
 * Feishu/Lark adapter
 */
export class FeishuAdapter extends BaseSocialAdapter {
  readonly platformName = 'feishu';
  readonly displayName = 'Feishu/Lark';

  private client?: InstanceType<typeof Client>;
  private eventDispatcher?: InstanceType<typeof EventDispatcher>;
  private wsClient?: InstanceType<typeof WSClient>;

  /**
   * Connect to Feishu
   */
  protected async connect(): Promise<void> {
    if (!this.config?.appId || !this.config?.appSecret) {
      throw new Error('Feishu app ID and app secret are required');
    }

    try {
      // Create client instance
      this.client = new Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        appType: AppType.SelfBuild,
        domain: this.config.options?.domain || Domain.Feishu,
      });

      // Create event dispatcher for handling callbacks
      this.eventDispatcher = new EventDispatcher({
        encryptKey: this.config.options?.encryptKey,
      }).register({
        'im.message.receive_v1': async (data: any) => {
          await this.handleFeishuMessage(data);
        },
      });

      logger.info(`[${this.platformName}] Connected to Feishu/Lark`);

      // Start WebSocket long connection so Feishu server can push events to us
      // (No public IP needed — the SDK connects outbound to Feishu's servers)
      this.wsClient = new WSClient(this.client);
      this.wsClient.start({ eventDispatcher: this.eventDispatcher });
      logger.info(`[${this.platformName}] WebSocket long connection started`);
    } catch (error) {
      logger.error(
        `[${this.platformName}] Failed to load @larksuiteoapi/node-sdk. Install it with: npm install @larksuiteoapi/node-sdk`
      );
      throw new Error(
        '@larksuiteoapi/node-sdk package not found. Please install it first.'
      );
    }
  }

  /**
   * Disconnect from Feishu
   */
  protected async disconnect(): Promise<void> {
    try { (this.wsClient as any)?.stop?.(); } catch { /* ignore */ }
    this.wsClient = undefined;
    this.client = undefined;
    this.eventDispatcher = undefined;
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    await this.sendMessageWithId(message);
  }

  /**
   * Send message and return the message_id (enables streaming updates via editMessage)
   */
  async sendMessageWithId(message: OutgoingMessage): Promise<string> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      // NOTE: receive_id_type is a query param, everything else is body (data).
      // Passing a flat object causes 400 "receive_id_type is required".
      const res: any = await this.client.im.message.create({
        params: { receive_id_type: 'chat_id' },
        data: {
          receive_id: message.chatId,
          msg_type: 'text',
          content: JSON.stringify({ text: message.text || '' }),
        },
      });

      const messageId: string = res?.data?.message_id || '';

      // Send attachments if any
      if (message.attachments?.length) {
        for (const attachment of message.attachments) {
          await this.client.im.message.create({
            params: { receive_id_type: 'chat_id' },
            data: {
              receive_id: message.chatId,
              msg_type: attachment.type === 'image' ? 'image' : 'file',
              content: JSON.stringify({
                [attachment.type === 'image' ? 'image_key' : 'file_key']: attachment.url,
              }),
            },
          });
        }
      }

      return messageId;
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Edit an existing message (for streaming progressive updates)
   */
  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    if (!this.client || !messageId) return;
    try {
      await this.client.im.message.update({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (error) {
      logger.debug(`[${this.platformName}] Failed to edit message:`, error);
    }
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<BotInfo> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      const res = await this.client.application.v6.application.get();

      return {
        id: (res.data as any)?.app?.app_id || 'unknown',
        username: (res.data as any)?.app?.app_name || 'Feishu Bot',
        displayName: (res.data as any)?.app?.app_name || 'Feishu Bot',
        platform: this.platformName,
      };
    } catch (error) {
      logger.warn(`[${this.platformName}] Failed to get bot info:`, error);
      return {
        id: this.config?.appId || 'unknown',
        username: 'Feishu Bot',
        displayName: 'Feishu Bot',
        platform: this.platformName,
      };
    }
  }

  /**
   * Get chat info
   */
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      const res = await this.client.im.chat.get({
        chat_id: chatId,
      } as any);

      return {
        id: (res.data as any)?.chat_id || chatId,
        type: (res.data as any)?.chat_mode === 'p2p' ? 'private' : 'group',
        title: (res.data as any)?.name || 'Unnamed Chat',
        memberCount: (res.data as any)?.member_user_count,
        platform: this.platformName,
      };
    } catch (error) {
      logger.warn(`[${this.platformName}] Failed to get chat info:`, error);
      return {
        id: chatId,
        type: 'group',
        platform: this.platformName,
      };
    }
  }

  /**
   * Handle Feishu message event.
   * With WSClient long-connection mode the SDK passes the event payload directly,
   * so `data` IS the event (structure: { sender, message }) — there is no outer
   * `data.event` wrapper like in webhook mode.
   */
  private async handleFeishuMessage(data: any): Promise<void> {
    try {
      const msg = data?.message;
      const sender = data?.sender;

      if (!msg || !sender) {
        logger.warn(`[${this.platformName}] Unexpected event shape:`, JSON.stringify(data).slice(0, 200));
        return;
      }

      const message: SocialMessage = {
        messageId: msg.message_id,
        chatId: msg.chat_id,
        userId: sender.sender_id?.user_id || sender.sender_id?.open_id || sender.sender_id?.union_id || 'unknown',
        username: sender.sender_id?.user_id || sender.sender_id?.open_id || 'unknown',
        text: this.extractTextContent(msg),
        timestamp: Number(msg.create_time),
        platform: this.platformName,
        replyTo: msg.parent_id,
      };

      await this.emitMessage(message);
    } catch (error) {
      logger.error(`[${this.platformName}] Error handling message:`, error);
    }
  }

  /**
   * Extract text content from message
   */
  private extractTextContent(message: any): string {
    try {
      const content = JSON.parse(message.content);
      return content.text || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * Get event dispatcher (for webhook setup)
   */
  getEventDispatcher(): any {
    return this.eventDispatcher;
  }
}
