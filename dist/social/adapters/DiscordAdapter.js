/**
 * Discord Adapter
 *
 * Adapter for Discord using discord.js
 * Install: npm install discord.js
 */
import { Script, constants } from 'node:vm';
import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import { logger } from '../../utils/logger.js';
// Dynamic import helper using vm.Script (works in Javet)
async function dynamicImport(moduleName) {
    const script = new Script(`import("${moduleName}")`, { importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER });
    return script.runInThisContext();
}
// Lazy load discord.js
let DiscordJS = null;
let loadPromise = null;
async function getDiscordJS() {
    if (DiscordJS !== null) {
        return DiscordJS;
    }
    if (loadPromise) {
        return loadPromise;
    }
    loadPromise = (async () => {
        try {
            const mod = await dynamicImport('discord.js');
            // Handle ESM default export wrapper
            DiscordJS = mod.default || mod;
            logger.debug(`[discord] discord.js loaded, keys: ${Object.keys(DiscordJS).slice(0, 10).join(', ')}`);
            return DiscordJS;
        }
        catch (err) {
            logger.error(`[discord] Failed to load discord.js:`, err);
            DiscordJS = undefined;
            return undefined;
        }
    })();
    return loadPromise;
}
/**
 * Discord adapter
 */
export class DiscordAdapter extends BaseSocialAdapter {
    constructor() {
        super(...arguments);
        this.platformName = 'discord';
        this.displayName = 'Discord';
    }
    /**
     * Connect to Discord
     */
    async connect() {
        if (!this.config?.token) {
            throw new Error('Discord bot token is required');
        }
        const discordLib = await getDiscordJS();
        if (!discordLib || !discordLib.Client) {
            throw new Error('discord.js not available. Install: npm install discord.js');
        }
        const { Client, GatewayIntentBits, Partials } = discordLib;
        try {
            this.client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.MessageContent,
                    GatewayIntentBits.DirectMessages,
                    GatewayIntentBits.GuildMembers,
                ],
                partials: [
                    Partials.Channel,
                    Partials.Message,
                ],
            });
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to create Discord client.`, error);
            throw new Error('Failed to create Discord client');
        }
        this.client.on('error', (error) => {
            logger.error(`[${this.platformName}] Client error:`, error);
        });
        this.client.on('warn', (info) => {
            logger.warn(`[${this.platformName}] Warning:`, info);
        });
        this.client.on('ready', () => {
            this.botUser = this.client.user;
            logger.info(`[${this.platformName}] Bot connected as ${this.botUser?.tag} (${this.botUser?.id})`);
        });
        this.client.on('messageCreate', async (message) => {
            await this.handleDiscordMessage(message);
        });
        try {
            await this.client.login(this.config.token);
            logger.info(`[${this.platformName}] Successfully logged in`);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to login:`, error);
            this.client = undefined;
            throw new Error('Discord login failed. Check your token and network connectivity.');
        }
    }
    async disconnect() {
        if (this.client) {
            await this.client.destroy();
            this.client = undefined;
            this.botUser = undefined;
        }
    }
    async sendMessageWithId(message) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }
        try {
            const channel = await this.client.channels.fetch(message.chatId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel ${message.chatId} not found or not text-based`);
            }
            const options = { content: message.text };
            if (message.replyTo) {
                options.reply = { messageReference: message.replyTo };
            }
            if (message.attachments && message.attachments.length > 0) {
                options.files = message.attachments.map((att) => ({
                    attachment: att.url,
                    name: att.filename || 'file',
                }));
            }
            const sentMessage = await channel.send(options);
            return sentMessage.id;
        }
        catch (error) {
            logger.error(`[${this.platformName}] Failed to send message:`, error);
            throw error;
        }
    }
    async editMessage(chatId, messageId, text) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }
        try {
            const channel = await this.client.channels.fetch(chatId);
            if (!channel || !channel.isTextBased()) {
                throw new Error(`Channel ${chatId} not found or not text-based`);
            }
            const message = await channel.messages.fetch(messageId);
            await message.edit(text);
        }
        catch (error) {
            if (error?.code === 10008)
                return;
            logger.error(`[${this.platformName}] Failed to edit message:`, error);
            throw error;
        }
    }
    async sendMessage(message) {
        await this.sendMessageWithId(message);
    }
    async getBotInfo() {
        if (!this.client || !this.botUser) {
            throw new Error('Discord client not initialized');
        }
        return {
            id: this.botUser.id,
            username: this.botUser.username,
            displayName: this.botUser.displayName || this.botUser.username,
            platform: this.platformName,
        };
    }
    async getChatInfo(chatId) {
        if (!this.client) {
            throw new Error('Discord client not initialized');
        }
        const channel = await this.client.channels.fetch(chatId);
        if (!channel) {
            throw new Error(`Channel ${chatId} not found`);
        }
        const isDM = channel.type === 1;
        const isGroup = channel.type === 0 || channel.type === 2;
        return {
            id: channel.id,
            type: isDM ? 'private' : 'group',
            title: channel.name || 'Direct Message',
            memberCount: isGroup ? channel.members?.size : undefined,
            platform: this.platformName,
        };
    }
    async handleDiscordMessage(msg) {
        try {
            if (msg.author.bot)
                return;
            const isDM = msg.channel.type === 1;
            const isMentioned = this.client?.user ? msg.mentions.has(this.client.user) : false;
            logger.debug(`[${this.platformName}] Message received: isDM=${isDM}, isMentioned=${isMentioned}, ` +
                `channelType=${msg.channel.type}, from=${msg.author.username}`);
            const respondToAll = this.config?.options?.respondToAll === true;
            if (!isDM && !isMentioned && !respondToAll) {
                logger.debug(`[${this.platformName}] Ignoring message (not DM/mention)`);
                return;
            }
            let text = msg.content;
            if (isMentioned && this.botUser) {
                text = text.replace(new RegExp(`<@!?${this.botUser.id}>`, 'g'), '').trim();
            }
            logger.info(`[${this.platformName}] Processing message: "${text.substring(0, 50)}..."`);
            const message = {
                messageId: msg.id,
                chatId: msg.channel.id,
                userId: msg.author.id,
                username: msg.author.username,
                text: text,
                timestamp: msg.createdTimestamp,
                platform: this.platformName,
                replyTo: msg.reference?.messageId,
                attachments: this.extractAttachments(msg),
                metadata: {
                    guildId: msg.guild?.id,
                    guildName: msg.guild?.name,
                    channelName: msg.channel.name,
                    isDM,
                    isMentioned,
                },
            };
            await this.emitMessage(message);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Error handling message:`, error);
        }
    }
    extractAttachments(msg) {
        const attachments = [];
        if (msg.attachments && msg.attachments.size > 0) {
            for (const [, attachment] of msg.attachments) {
                const contentType = attachment.contentType || '';
                let type = 'file';
                if (contentType.startsWith('image/'))
                    type = 'image';
                else if (contentType.startsWith('audio/'))
                    type = 'audio';
                else if (contentType.startsWith('video/'))
                    type = 'video';
                attachments.push({
                    type,
                    url: attachment.url,
                    filename: attachment.name,
                    size: attachment.size,
                    mimeType: contentType,
                });
            }
        }
        if (msg.embeds && msg.embeds.length > 0) {
            for (const embed of msg.embeds) {
                if (embed.image)
                    attachments.push({ type: 'image', url: embed.image.url });
                if (embed.video)
                    attachments.push({ type: 'video', url: embed.video.url });
            }
        }
        return attachments;
    }
}
