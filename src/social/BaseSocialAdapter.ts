/**
 * Base Social Platform Adapter
 *
 * Abstract base class for social platform adapters
 */

import { logger } from '../utils/logger.js';
import type {
  SocialPlatformAdapter,
  PlatformConfig,
  PlatformStatus,
  SocialMessage,
  OutgoingMessage,
  MessageHandler,
  BotInfo,
  ChatInfo,
} from './types.js';

/**
 * Base adapter implementation
 */
export abstract class BaseSocialAdapter implements SocialPlatformAdapter {
  abstract readonly platformName: string;
  abstract readonly displayName: string;

  protected config?: PlatformConfig;
  protected messageHandlers: MessageHandler[] = [];
  protected _status: PlatformStatus = {
    connected: false,
    messageCount: 0,
  };

  get initialized(): boolean {
    return this.config !== undefined;
  }

  get status(): PlatformStatus {
    return { ...this._status };
  }

  /**
   * Initialize the adapter
   */
  async initialize(config: PlatformConfig): Promise<void> {
    logger.info(`[${this.platformName}] Initializing adapter`);

    this.config = config;

    try {
      await this.connect();
      this._status.connected = true;
      this._status.lastConnected = Date.now();
      this._status.error = undefined;

      logger.info(`[${this.platformName}] Adapter initialized successfully`);
    } catch (error) {
      this._status.connected = false;
      this._status.error =
        error instanceof Error ? error.message : String(error);

      logger.error(`[${this.platformName}] Initialization failed:`, error);
      throw error;
    }
  }

  /**
   * Shutdown the adapter
   */
  async shutdown(): Promise<void> {
    logger.info(`[${this.platformName}] Shutting down adapter`);

    try {
      await this.disconnect();
      this._status.connected = false;
      this.messageHandlers = [];

      logger.info(`[${this.platformName}] Adapter shut down successfully`);
    } catch (error) {
      logger.error(`[${this.platformName}] Shutdown failed:`, error);
      throw error;
    }
  }

  /**
   * Register message handler
   */
  onMessage(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }

  /**
   * Emit message to handlers
   */
  protected async emitMessage(message: SocialMessage): Promise<void> {
    this._status.messageCount = (this._status.messageCount || 0) + 1;

    for (const handler of this.messageHandlers) {
      try {
        await handler(message);
      } catch (error) {
        logger.error(
          `[${this.platformName}] Message handler error:`,
          error
        );
      }
    }
  }

  /**
   * Connect to platform (implemented by subclasses)
   */
  protected abstract connect(): Promise<void>;

  /**
   * Disconnect from platform (implemented by subclasses)
   */
  protected abstract disconnect(): Promise<void>;

  /**
   * Send message (implemented by subclasses)
   */
  abstract sendMessage(message: OutgoingMessage): Promise<void>;

  /**
   * Get bot info (implemented by subclasses)
   */
  abstract getBotInfo(): Promise<BotInfo>;

  /**
   * Get chat info (implemented by subclasses)
   */
  abstract getChatInfo(chatId: string): Promise<ChatInfo>;
}
