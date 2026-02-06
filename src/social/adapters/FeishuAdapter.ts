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
const { Client, AppType, Domain, EventDispatcher } = LarkSDK as any;

/**
 * Feishu/Lark adapter
 */
export class FeishuAdapter extends BaseSocialAdapter {
  readonly platformName = 'feishu';
  readonly displayName = 'Feishu/Lark';

  private client?: InstanceType<typeof Client>;
  private eventDispatcher?: InstanceType<typeof EventDispatcher>;

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
    this.client = undefined;
    this.eventDispatcher = undefined;
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      const params: any = {
        receive_id_type: 'chat_id',
        receive_id: message.chatId,
        msg_type: 'text',
        content: JSON.stringify({ text: message.text }),
      };

      await this.client.im.message.create(params);

      // Send attachments if any
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          const imageParams: any = {
            receive_id_type: 'chat_id',
            receive_id: message.chatId,
            msg_type: attachment.type === 'image' ? 'image' : 'file',
            content: JSON.stringify({
              [attachment.type === 'image' ? 'image_key' : 'file_key']: attachment.url,
            }),
          };

          await this.client.im.message.create(imageParams);
        }
      }
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to send message:`, error);
      throw error;
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
   * Handle Feishu message event
   */
  private async handleFeishuMessage(data: any): Promise<void> {
    try {
      const event = data.event;

      const message: SocialMessage = {
        messageId: event.message.message_id,
        chatId: event.message.chat_id,
        userId: event.sender.sender_id.user_id,
        username: event.sender.sender_id.user_id,
        text: this.extractTextContent(event.message),
        timestamp: Number(event.message.create_time),
        platform: this.platformName,
        replyTo: event.message.parent_id,
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
