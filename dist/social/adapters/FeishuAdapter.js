/**
 * Feishu/Lark Adapter
 *
 * Adapter for Feishu/Lark using @larksuiteoapi/node-sdk
 * Install: npm install @larksuiteoapi/node-sdk
 */
import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
// @larksuiteoapi/node-sdk 是 CJS 包，不能用命名导入
import LarkSDK from '@larksuiteoapi/node-sdk';
const { Client, AppType, Domain, EventDispatcher } = LarkSDK;
/**
 * Feishu/Lark adapter
 */
export class FeishuAdapter extends BaseSocialAdapter {
    constructor() {
        super(...arguments);
        this.platformName = 'feishu';
        this.displayName = 'Feishu/Lark';
    }
    /**
     * Connect to Feishu
     */
    async connect() {
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
                'im.message.receive_v1': async (data) => {
                    await this.handleFeishuMessage(data);
                },
            });
            logger.info(`[${this.platformName}] Connected to Feishu/Lark`);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to load @larksuiteoapi/node-sdk. Install it with: npm install @larksuiteoapi/node-sdk`);
            throw new Error('@larksuiteoapi/node-sdk package not found. Please install it first.');
        }
    }
    /**
     * Disconnect from Feishu
     */
    async disconnect() {
        this.client = undefined;
        this.eventDispatcher = undefined;
    }
    /**
     * Send message
     */
    async sendMessage(message) {
        if (!this.client) {
            throw new Error('Feishu client not initialized');
        }
        try {
            const params = {
                receive_id_type: 'chat_id',
                receive_id: message.chatId,
                msg_type: 'text',
                content: JSON.stringify({ text: message.text }),
            };
            await this.client.im.message.create(params);
            // Send attachments if any
            if (message.attachments && message.attachments.length > 0) {
                for (const attachment of message.attachments) {
                    const imageParams = {
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
        if (!this.client) {
            throw new Error('Feishu client not initialized');
        }
        try {
            const res = await this.client.application.v6.application.get();
            return {
                id: res.data?.app?.app_id || 'unknown',
                username: res.data?.app?.app_name || 'Feishu Bot',
                displayName: res.data?.app?.app_name || 'Feishu Bot',
                platform: this.platformName,
            };
        }
        catch (error) {
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
    async getChatInfo(chatId) {
        if (!this.client) {
            throw new Error('Feishu client not initialized');
        }
        try {
            const res = await this.client.im.chat.get({
                chat_id: chatId,
            });
            return {
                id: res.data?.chat_id || chatId,
                type: res.data?.chat_mode === 'p2p' ? 'private' : 'group',
                title: res.data?.name || 'Unnamed Chat',
                memberCount: res.data?.member_user_count,
                platform: this.platformName,
            };
        }
        catch (error) {
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
    async handleFeishuMessage(data) {
        try {
            const event = data.event;
            const message = {
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
        }
        catch (error) {
            logger.error(`[${this.platformName}] Error handling message:`, error);
        }
    }
    /**
     * Extract text content from message
     */
    extractTextContent(message) {
        try {
            const content = JSON.parse(message.content);
            return content.text || '';
        }
        catch (error) {
            return '';
        }
    }
    /**
     * Get event dispatcher (for webhook setup)
     */
    getEventDispatcher() {
        return this.eventDispatcher;
    }
}
