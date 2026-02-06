/**
 * WeChat Adapter
 *
 * Adapter for WeChat using wechaty
 * Install: npm install wechaty wechaty-puppet-wechat
 */
import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
// import { WechatyBuilder, type Wechaty, type Contact, type Room, type Message } from 'wechaty';
// import { FileBox } from 'file-box';
/**
 * WeChat adapter using Wechaty
 * TEMPORARILY DISABLED
 */
export class WeChatAdapter extends BaseSocialAdapter {
    constructor() {
        super(...arguments);
        this.platformName = 'wechat';
        this.displayName = 'WeChat';
        // private async handleWeChatMessage(msg: Message): Promise<void> { ... }
    }
    // private bot?: Wechaty;
    /**
     * Connect to WeChat
     */
    async connect() {
        logger.warn(`[${this.platformName}] WeChat adapter is currently disabled.`);
        // Disabled
    }
    /**
     * Disconnect from WeChat
     */
    async disconnect() {
        // No-op
    }
    /**
     * Send message
     */
    async sendMessage(message) {
        throw new Error('WeChat is disabled');
    }
    /**
     * Get bot info
     */
    async getBotInfo() {
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
    async getChatInfo(chatId) {
        return {
            id: chatId,
            type: 'private',
            platform: this.platformName,
        };
    }
}
