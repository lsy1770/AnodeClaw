/**
 * DingTalk Adapter
 *
 * Adapter for DingTalk using dingtalk-stream-sdk-nodejs
 * Install: npm install dingtalk-stream-sdk-nodejs
 */
import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
// dingtalk-stream-sdk-nodejs 是 CJS 包，不能用命名导入，用默认导入取 module.exports
import DingTalkSDK from 'dingtalk-stream-sdk-nodejs';
const { Client } = DingTalkSDK;
/**
 * DingTalk adapter
 */
export class DingTalkAdapter extends BaseSocialAdapter {
    constructor() {
        super(...arguments);
        this.platformName = 'dingtalk';
        this.displayName = 'DingTalk';
    }
    /**
     * Connect to DingTalk
     */
    async connect() {
        if (!this.config?.appId || !this.config?.appSecret) {
            throw new Error('DingTalk app ID and app secret are required');
        }
        try {
            // Create client
            this.client = new Client({
                clientId: this.config.appId,
                clientSecret: this.config.appSecret,
            });
            // Register callback for bot messages
            const onBotMessage = async (data) => {
                await this.handleDingTalkMessage(data);
            };
            // Register message callback
            this.client.registerCallbackListener('onBotMessage', onBotMessage);
            // Start stream connection
            await this.client.connect();
            logger.info(`[${this.platformName}] Connected to DingTalk`);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to load dingtalk-stream-sdk-nodejs. Install it with: npm install dingtalk-stream-sdk-nodejs`);
            throw new Error('dingtalk-stream-sdk-nodejs package not found. Please install it first.');
        }
    }
    /**
     * Disconnect from DingTalk
     */
    async disconnect() {
        if (this.client) {
            await this.client.disconnect();
            this.client = undefined;
        }
    }
    /**
     * Send message
     */
    async sendMessage(message) {
        if (!this.client) {
            throw new Error('DingTalk client not initialized');
        }
        try {
            // Use DingTalk robot webhook or server API to send message
            // This would require additional setup with webhook URL
            const webhookUrl = this.config?.webhookUrl;
            if (!webhookUrl) {
                throw new Error('DingTalk webhook URL is required for sending messages');
            }
            // Send message via webhook
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    msgtype: 'text',
                    text: {
                        content: message.text,
                    },
                    at: message.options?.at || {},
                }),
            });
            if (!response.ok) {
                throw new Error(`Failed to send message: ${response.statusText}`);
            }
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to send message:`, error);
            throw error;
        }
    }
    /**
     * Get bot info
     */
    async getBotInfo() {
        return {
            id: this.config?.appId || 'unknown',
            username: 'DingTalk Bot',
            displayName: 'DingTalk Bot',
            platform: this.platformName,
        };
    }
    /**
     * Get chat info
     */
    async getChatInfo(chatId) {
        // DingTalk chat info would require additional API calls
        return {
            id: chatId,
            type: 'group',
            platform: this.platformName,
        };
    }
    /**
     * Handle DingTalk message
     */
    async handleDingTalkMessage(data) {
        try {
            const message = {
                messageId: data.msgId || String(Date.now()),
                chatId: data.conversationId || data.chatbotUserId,
                userId: data.senderStaffId || data.senderId,
                username: data.senderNick,
                text: data.text?.content || '',
                timestamp: data.createAt || Date.now(),
                platform: this.platformName,
            };
            await this.emitMessage(message);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Error handling message:`, error);
        }
    }
}
