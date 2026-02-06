/**
 * Social Platform Integration Types
 *
 * Defines interfaces for social platform adapters
 */

/**
 * Message from social platform
 */
export interface SocialMessage {
  messageId: string;
  chatId: string;
  userId: string;
  username?: string;
  text: string;
  timestamp: number;
  platform: string;
  replyTo?: string;
  attachments?: SocialAttachment[];
  /** Platform-specific metadata */
  metadata?: Record<string, any>;
}

/**
 * Message attachment
 */
export interface SocialAttachment {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  filename?: string;
  size?: number;
  mimeType?: string;
}

/**
 * Message to send
 */
export interface OutgoingMessage {
  chatId: string;
  text: string;
  replyTo?: string;
  attachments?: SocialAttachment[];
  options?: Record<string, any>;
}

/**
 * Message handler callback
 */
export type MessageHandler = (message: SocialMessage) => Promise<void>;

/**
 * Platform configuration
 */
export interface PlatformConfig {
  enabled: boolean;
  token?: string;
  appId?: string;
  appSecret?: string;
  webhookUrl?: string;
  options?: Record<string, any>;
}

/**
 * Platform status
 */
export interface PlatformStatus {
  connected: boolean;
  lastConnected?: number;
  error?: string;
  messageCount?: number;
}

/**
 * Social platform adapter interface
 */
export interface SocialPlatformAdapter {
  /** Platform name (telegram, feishu, dingtalk, qq, wechat) */
  readonly platformName: string;

  /** Platform display name */
  readonly displayName: string;

  /** Whether the adapter is initialized */
  readonly initialized: boolean;

  /** Platform status */
  readonly status: PlatformStatus;

  /**
   * Initialize the adapter
   * @param config Platform configuration
   */
  initialize(config: PlatformConfig): Promise<void>;

  /**
   * Shutdown the adapter
   */
  shutdown(): Promise<void>;

  /**
   * Send a message
   * @param message Message to send
   */
  sendMessage(message: OutgoingMessage): Promise<void>;

  /**
   * Register message handler
   * @param handler Message handler callback
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Get bot info
   */
  getBotInfo(): Promise<BotInfo>;

  /**
   * Get chat info
   * @param chatId Chat ID
   */
  getChatInfo(chatId: string): Promise<ChatInfo>;
}

/**
 * Bot information
 */
export interface BotInfo {
  id: string;
  username: string;
  displayName: string;
  platform: string;
}

/**
 * Chat information
 */
export interface ChatInfo {
  id: string;
  type: 'private' | 'group' | 'channel';
  title?: string;
  memberCount?: number;
  platform: string;
}

/**
 * Adapter factory function
 */
export type AdapterFactory = () => SocialPlatformAdapter;

/**
 * Adapter registration
 */
export interface AdapterRegistration {
  platformName: string;
  displayName: string;
  factory: AdapterFactory;
  requiredPackages?: string[];
  configSchema?: Record<string, any>;
}
