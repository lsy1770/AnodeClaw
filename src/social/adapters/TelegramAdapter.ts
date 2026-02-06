/**
 * Telegram Adapter
 *
 * Adapter for Telegram using node-telegram-bot-api
 * Install: npm install node-telegram-bot-api @types/node-telegram-bot-api
 */

import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
import type {
  SocialMessage,
  OutgoingMessage,
  BotInfo,
  ChatInfo,
} from '../types.js';
import TelegramBotLib from 'node-telegram-bot-api';
// CJS-safe: ensure we get the constructor even if Javet wraps the default export
const TelegramBot = TelegramBotLib as any;

/**
 * Telegram adapter
 */
export class TelegramAdapter extends BaseSocialAdapter {
  readonly platformName = 'telegram';
  readonly displayName = 'Telegram';

  private bot?: any;

  /**
   * Connect to Telegram
   */
  protected async connect(): Promise<void> {
    if (!this.config?.token) {
      throw new Error('Telegram bot token is required');
    }

    let bot: any;
    try {
      // Create bot instance
      bot = new TelegramBot(this.config.token, {
        polling: this.config.options?.polling !== false,
      });
    } catch (error) {
      logger.error(
        `[${this.platformName}] Failed to create TelegramBot instance. ` +
        `Ensure node-telegram-bot-api is installed: npm install node-telegram-bot-api`,
        error
      );
      throw new Error(
        'Failed to create TelegramBot instance. Is node-telegram-bot-api installed?'
      );
    }

    this.bot = bot;

    // Listen for polling errors (fires when polling fails, e.g. invalid token, network)
    this.bot.on('polling_error', (error: any) => {
      logger.error(`[${this.platformName}] Polling error:`, error);
    });

    // Listen for general errors
    this.bot.on('error', (error: any) => {
      logger.error(`[${this.platformName}] Bot error:`, error);
    });

    // Setup message handler
    this.bot.on('message', (msg: any) => {
      this.handleTelegramMessage(msg);
    });

    // Validate token and log bot identity
    try {
      const me = await this.bot.getMe();
      logger.info(
        `[${this.platformName}] Bot connected as @${me.username} (${me.id})`
      );
    } catch (error) {
      logger.error(
        `[${this.platformName}] Failed to validate bot token via getMe():`,
        error
      );
      // Clean up on validation failure
      try {
        await this.bot.stopPolling();
      } catch (_) { /* ignore cleanup errors */ }
      this.bot = undefined;
      throw new Error(
        'Telegram bot token validation failed. Check your token and network connectivity.'
      );
    }
  }

  /**
   * Disconnect from Telegram
   */
  protected async disconnect(): Promise<void> {
    if (this.bot) {
      await this.bot.stopPolling();
      this.bot = undefined;
    }
  }

  /**
   * Send message and return message ID (for streaming updates)
   */
  async sendMessageWithId(message: OutgoingMessage): Promise<string> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      const options: any = {
        ...message.options,
      };

      if (message.replyTo) {
        options.reply_to_message_id = message.replyTo;
      }

      const sentMessage = await this.bot.sendMessage(message.chatId, message.text, options);
      return String(sentMessage.message_id);
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to send message:`, error);
      throw error;
    }
  }

  /**
   * Edit existing message (for streaming updates)
   */
  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      await this.bot.editMessageText(text, {
        chat_id: chatId,
        message_id: parseInt(messageId, 10),
      });
    } catch (error: any) {
      // Ignore "message is not modified" error (same content)
      if (error?.response?.body?.description?.includes('message is not modified')) {
        return;
      }
      logger.error(`[${this.platformName}] Failed to edit message:`, error);
      throw error;
    }
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    try {
      const options: any = {
        ...message.options,
      };

      if (message.replyTo) {
        options.reply_to_message_id = message.replyTo;
      }

      await this.bot.sendMessage(message.chatId, message.text, options);

      // Send attachments if any
      if (message.attachments && message.attachments.length > 0) {
        for (const attachment of message.attachments) {
          switch (attachment.type) {
            case 'image':
              await this.bot.sendPhoto(message.chatId, attachment.url, options);
              break;
            case 'file':
              await this.bot.sendDocument(
                message.chatId,
                attachment.url,
                options
              );
              break;
            case 'audio':
              await this.bot.sendAudio(message.chatId, attachment.url, options);
              break;
            case 'video':
              await this.bot.sendVideo(message.chatId, attachment.url, options);
              break;
          }
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
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    const me = await this.bot.getMe();

    return {
      id: String(me.id),
      username: me.username || me.first_name || 'TelegramBot',
      displayName: me.first_name,
      platform: this.platformName,
    };
  }

  /**
   * Get chat info
   */
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized');
    }

    const chat = await this.bot.getChat(chatId);

    return {
      id: String(chat.id),
      type: chat.type === 'private' ? 'private' : 'group',
      title: chat.title || `${chat.first_name || ''} ${chat.last_name || ''}`.trim(),
      memberCount: (chat as any).members_count,
      platform: this.platformName,
    };
  }

  /**
   * Handle Telegram message
   */
  private async handleTelegramMessage(msg: any): Promise<void> {
    try {
      const message: SocialMessage = {
        messageId: String(msg.message_id),
        chatId: String(msg.chat.id),
        userId: String(msg.from.id),
        username: msg.from.username || msg.from.first_name || 'unknown',
        text: msg.text || msg.caption || '',
        timestamp: msg.date * 1000,
        platform: this.platformName,
        replyTo: msg.reply_to_message
          ? String(msg.reply_to_message.message_id)
          : undefined,
        attachments: this.extractAttachments(msg),
      };

      await this.emitMessage(message);
    } catch (error) {
      logger.error(
        `[${this.platformName}] Error handling message:`,
        error
      );
    }
  }

  /**
   * Extract attachments from Telegram message
   */
  private extractAttachments(msg: any): any[] {
    const attachments: any[] = [];

    if (msg.photo && msg.photo.length > 0) {
      const photo = msg.photo[msg.photo.length - 1];
      attachments.push({
        type: 'image',
        url: photo.file_id, // Will need to use getFile to get actual URL
      });
    }

    if (msg.document) {
      attachments.push({
        type: 'file',
        url: msg.document.file_id,
        filename: msg.document.file_name,
        size: msg.document.file_size,
        mimeType: msg.document.mime_type,
      });
    }

    if (msg.audio) {
      attachments.push({
        type: 'audio',
        url: msg.audio.file_id,
        filename: msg.audio.file_name,
      });
    }

    if (msg.video) {
      attachments.push({
        type: 'video',
        url: msg.video.file_id,
      });
    }

    return attachments;
  }
}
