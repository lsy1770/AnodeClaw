/**
 * Social Platform Integration
 *
 * Main export file for social platform integration
 */
export * from './types.js';
export * from './BaseSocialAdapter.js';
export * from './SocialAdapterManager.js';
export * from './adapters/index.js';
// Re-export manager
export { SocialAdapterManager } from './SocialAdapterManager.js';
// Re-export all adapters
export { TelegramAdapter, DiscordAdapter, FeishuAdapter, DingTalkAdapter, QQAdapter, QQGuildAdapter, WeChatAdapter, } from './adapters/index.js';
