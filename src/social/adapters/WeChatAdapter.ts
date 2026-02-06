/**
 * WeChat Adapter
 *
 * Adapter for WeChat using wechaty
 * Install: npm install wechaty wechaty-puppet-wechat
 */

import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
import type {
  SocialMessage,
  OutgoingMessage,
  BotInfo,
  ChatInfo,
} from '../types.js';
// import { WechatyBuilder, type Wechaty, type Contact, type Room, type Message } from 'wechaty';
// import { FileBox } from 'file-box';


/**
 * WeChat adapter using Wechaty
 * TEMPORARILY DISABLED
 */
export class WeChatAdapter extends BaseSocialAdapter {
  readonly platformName = 'wechat';
  readonly displayName = 'WeChat';

  // private bot?: Wechaty;

  /**
   * Connect to WeChat
   */
  protected async connect(): Promise<void> {
    logger.warn(`[${this.platformName}] WeChat adapter is currently disabled.`);
    // Disabled
  }

  /**
   * Disconnect from WeChat
   */
  protected async disconnect(): Promise<void> {
    // No-op
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    throw new Error('WeChat is disabled');
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<BotInfo> {
    return {
      id: 'disabled',
      username: 'Disabled',
      displayName: 'Disabled',
      platform: this.platformName,
    };
  }

  /**
   * Get chat info
   */
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    return {
      id: chatId,
      type: 'private',
      platform: this.platformName,
    };
  }

  // private async handleWeChatMessage(msg: Message): Promise<void> { ... }
}

