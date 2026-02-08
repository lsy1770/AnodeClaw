/**
 * Social Platform Adapter Manager
 *
 * Manages all social platform adapters and routes messages
 */

import { logger } from '../utils/logger.js';
import type {
  SocialPlatformAdapter,
  AdapterRegistration,
  PlatformConfig,
  SocialMessage,
  OutgoingMessage,
  MessageHandler,
} from './types.js';

/**
 * Social adapter manager configuration
 */
export interface SocialAdapterManagerConfig {
  platforms: Record<string, PlatformConfig>;
  messageHandler?: MessageHandler;
}

/**
 * Social adapter manager
 */
export class SocialAdapterManager {
  private adapters: Map<string, SocialPlatformAdapter> = new Map();
  private adapterRegistry: Map<string, AdapterRegistration> = new Map();
  private globalMessageHandler?: MessageHandler;
  private platformMessageHandlers: Map<string, MessageHandler[]> = new Map();
  private lastActiveChannels: Map<string, string> = new Map();
  private defaultBroadcastChannels: Map<string, string> = new Map();

  /**
   * Register an adapter
   * @param registration Adapter registration
   */
  registerAdapter(registration: AdapterRegistration): void {
    logger.info(
      `[SocialAdapter] Registering adapter: ${registration.displayName}`
    );

    if (this.adapterRegistry.has(registration.platformName)) {
      logger.warn(
        `[SocialAdapter] Adapter ${registration.platformName} is already registered, overwriting`
      );
    }

    this.adapterRegistry.set(registration.platformName, registration);
  }

  /**
   * Initialize adapters based on configuration
   * @param config Manager configuration
   */
  async initialize(config: SocialAdapterManagerConfig): Promise<void> {
    logger.info('[SocialAdapter] Initializing social platform adapters');

    this.globalMessageHandler = config.messageHandler;

    for (const [platformName, platformConfig] of Object.entries(
      config.platforms
    )) {
      if (!platformConfig.enabled) {
        logger.info(`[SocialAdapter] Platform ${platformName} is disabled`);
        continue;
      }

      const registration = this.adapterRegistry.get(platformName);
      if (!registration) {
        logger.warn(
          `[SocialAdapter] No adapter registered for platform: ${platformName}`
        );
        continue;
      }

      try {
        logger.info(
          `[SocialAdapter] Initializing ${registration.displayName}`
        );

        // Create adapter instance
        const adapter = registration.factory();

        // Initialize adapter
        await adapter.initialize(platformConfig);

        // Register message handler
        adapter.onMessage(async (message: SocialMessage) => {
          await this.handleMessage(message);
        });

        // Store adapter
        this.adapters.set(platformName, adapter);

        logger.info(
          `[SocialAdapter] ${registration.displayName} initialized successfully`
        );
      } catch (error) {
        logger.error(
          `[SocialAdapter] Failed to initialize ${registration.displayName}:`,
          error
        );
      }
    }

    logger.info(
      `[SocialAdapter] Initialized ${this.adapters.size} adapters`
    );
  }

  /**
   * Shutdown all adapters
   */
  async shutdown(): Promise<void> {
    logger.info('[SocialAdapter] Shutting down all adapters');

    for (const [platformName, adapter] of this.adapters.entries()) {
      try {
        await adapter.shutdown();
        logger.info(`[SocialAdapter] ${platformName} shut down successfully`);
      } catch (error) {
        logger.error(
          `[SocialAdapter] Failed to shutdown ${platformName}:`,
          error
        );
      }
    }

    this.adapters.clear();
    this.platformMessageHandlers.clear();
  }

  /**
   * Get adapter by platform name
   * @param platformName Platform name
   */
  getAdapter(platformName: string): SocialPlatformAdapter | undefined {
    return this.adapters.get(platformName);
  }

  /**
   * Get all active adapters
  getAdapters(): SocialPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Set default broadcast channel for a platform
   * Used by proactive messages when no user has messaged yet
   */
  setDefaultChannel(platformName: string, chatId: string): void {
    this.defaultBroadcastChannels.set(platformName, chatId);
    logger.info(`[SocialAdapter] Default broadcast channel for ${platformName}: ${chatId}`);
  }

  /**
   * Broadcast a message to all connected platforms
   * Uses configured default channel or last active channel
   */
  async broadcast(text: string): Promise<void> {
    logger.info(`[SocialAdapter] Broadcasting: ${text.substring(0, 50)}...`);
    const promises: Promise<void>[] = [];

    for (const [platform, adapter] of this.adapters.entries()) {
      if (!adapter.status.connected) continue;

      // Determine target chat ID: last active channel → configured default
      const chatId = this.lastActiveChannels.get(platform)
        || this.defaultBroadcastChannels.get(platform);

      if (chatId) {
        promises.push(
          adapter.sendMessage({
            chatId,
            text
          }).catch(err => {
            logger.error(`[SocialAdapter] Broadcast failed for ${platform}:`, err);
          })
        );
      } else {
        logger.debug(`[SocialAdapter] No broadcast target for ${platform} (set broadcastChatId in config)`);
      }
    }

    await Promise.all(promises);
  }

  /**
   * Send a message to a platform
   * @param platformName Platform name
   * @param message Outgoing message
   */
  async sendMessage(
    platformName: string,
    message: OutgoingMessage
  ): Promise<void> {
    const adapter = this.adapters.get(platformName);
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platformName}`);
    }

    await adapter.sendMessage(message);
  }

  /**
   * Send a message and return the message ID (for streaming updates)
   * @param platformName Platform name
   * @param message Outgoing message
   * @returns Message ID
   */
  async sendMessageWithId(
    platformName: string,
    message: OutgoingMessage
  ): Promise<string | undefined> {
    const adapter = this.adapters.get(platformName) as any;
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platformName}`);
    }

    // Check if adapter supports sendMessageWithId
    if (typeof adapter.sendMessageWithId === 'function') {
      return adapter.sendMessageWithId(message);
    }

    // Fallback: send normally and return undefined
    await adapter.sendMessage(message);
    return undefined;
  }

  /**
   * Edit an existing message (for streaming updates)
   * @param platformName Platform name
   * @param chatId Chat ID
   * @param messageId Message ID to edit
   * @param text New message text
   */
  async editMessage(
    platformName: string,
    chatId: string,
    messageId: string,
    text: string
  ): Promise<void> {
    const adapter = this.adapters.get(platformName) as any;
    if (!adapter) {
      throw new Error(`No adapter found for platform: ${platformName}`);
    }

    // Check if adapter supports editMessage
    if (typeof adapter.editMessage === 'function') {
      await adapter.editMessage(chatId, messageId, text);
    } else {
      logger.debug(`[SocialAdapter] ${platformName} does not support message editing`);
    }
  }

  /**
   * Register a message handler for a specific platform
   * @param platformName Platform name
   * @param handler Message handler
   */
  onPlatformMessage(platformName: string, handler: MessageHandler): void {
    if (!this.platformMessageHandlers.has(platformName)) {
      this.platformMessageHandlers.set(platformName, []);
    }

    this.platformMessageHandlers.get(platformName)!.push(handler);
  }

  /**
   * Handle incoming message
   * @param message Incoming message
   */
  private async handleMessage(message: SocialMessage): Promise<void> {
    logger.info(
      `[SocialAdapter] Received message from ${message.platform}: ${message.text.substring(0, 50)}...`
    );

    // Track last active channel for this platform
    this.lastActiveChannels.set(message.platform, message.chatId);

    try {
      // Call platform-specific handlers
      const platformHandlers =
        this.platformMessageHandlers.get(message.platform) || [];
      for (const handler of platformHandlers) {
        try {
          await handler(message);
        } catch (error) {
          logger.error(
            `[SocialAdapter] Platform handler error for ${message.platform}:`,
            error
          );
        }
      }

      // Call global handler
      if (this.globalMessageHandler) {
        await this.globalMessageHandler(message);
      }
    } catch (error) {
      logger.error('[SocialAdapter] Message handling error:', error);
    }
  }

  /**
   * Get status of all platforms
   */
  getStatus(): Record<string, any> {
    const status: Record<string, any> = {};

    for (const [platformName, adapter] of this.adapters.entries()) {
      status[platformName] = {
        displayName: adapter.displayName,
        initialized: adapter.initialized,
        status: adapter.status,
      };
    }

    return status;
  }

  /**
   * Check if a platform is connected
   * @param platformName Platform name
   */
  isConnected(platformName: string): boolean {
    const adapter = this.adapters.get(platformName);
    return adapter ? adapter.status.connected : false;
  }
}
