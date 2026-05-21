/**
 * Feishu/Lark Adapter
 *
 * Adapter for Feishu/Lark using @larksuiteoapi/node-sdk
 * Install: npm install @larksuiteoapi/node-sdk
 */

import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import LarkSDK from '@larksuiteoapi/node-sdk';
import { BaseSocialAdapter } from '../BaseSocialAdapter.js';
import type {
  SocialAttachment,
  SocialMessage,
  OutgoingMessage,
  BotInfo,
  ChatInfo,
} from '../types.js';
import { logger } from '../../utils/logger.js';

const { Client, WSClient, AppType, Domain, EventDispatcher } = LarkSDK as any;

/**
 * Feishu/Lark adapter
 */
export class FeishuAdapter extends BaseSocialAdapter {
  readonly platformName = 'feishu';
  readonly displayName = 'Feishu/Lark';

  private client?: InstanceType<typeof Client>;
  private eventDispatcher?: InstanceType<typeof EventDispatcher>;
  private wsClient?: InstanceType<typeof WSClient>;

  /**
   * Connect to Feishu
   */
  protected async connect(): Promise<void> {
    if (!this.config?.appId || !this.config?.appSecret) {
      throw new Error('Feishu app ID and app secret are required');
    }

    try {
      this.client = new Client({
        appId: this.config.appId,
        appSecret: this.config.appSecret,
        appType: AppType.SelfBuild,
        domain: this.config.options?.domain || Domain.Feishu,
      });

      this.eventDispatcher = new EventDispatcher({
        encryptKey: this.config.options?.encryptKey,
      }).register({
        'im.message.receive_v1': async (data: any) => {
          await this.handleFeishuMessage(data);
        },
        'im.message.message_read_v1': async () => {
          // Ignore read receipts to avoid noisy SDK warnings.
        },
      });

      logger.info(`[${this.platformName}] Connected to Feishu/Lark`);

      this.wsClient = new WSClient(this.client);
      this.wsClient.start({ eventDispatcher: this.eventDispatcher });
      logger.info(`[${this.platformName}] WebSocket long connection started`);
    } catch (error) {
      logger.error(
        `[${this.platformName}] Failed to load @larksuiteoapi/node-sdk. Install it with: npm install @larksuiteoapi/node-sdk`
      );
      throw new Error(
        '@larksuiteoapi/node-sdk package not found. Please install it first.'
      );
    }
  }

  /**
   * Disconnect from Feishu
   */
  protected async disconnect(): Promise<void> {
    try {
      (this.wsClient as any)?.stop?.();
    } catch {
      // Ignore shutdown failures.
    }
    this.wsClient = undefined;
    this.client = undefined;
    this.eventDispatcher = undefined;
  }

  /**
   * Send message
   */
  async sendMessage(message: OutgoingMessage): Promise<void> {
    await this.sendMessageWithId(message);
  }

  /**
   * Send message and return the first emitted message_id.
   * This keeps streaming placeholders working while still allowing
   * text + image/file messages to be sent sequentially.
   */
  async sendMessageWithId(message: OutgoingMessage): Promise<string> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      let firstMessageId = '';
      const text = message.text ?? '';

      if (text.trim()) {
        firstMessageId = await this.createMessage(message.chatId, 'text', {
          text,
        });
      }

      if (message.attachments?.length) {
        for (const attachment of message.attachments) {
          const attachmentMessageId = await this.sendAttachmentMessage(
            message.chatId,
            attachment
          );
          if (!firstMessageId) {
            firstMessageId = attachmentMessageId;
          }
        }
      }

      return firstMessageId;
    } catch (error) {
      logger.error(`[${this.platformName}] Failed to send message:`, error);
      throw error;
    }
  }

  private async createMessage(
    chatId: string,
    msgType: 'text' | 'image' | 'file',
    content: Record<string, string>
  ): Promise<string> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    const res: any = await this.client.im.message.create({
      params: { receive_id_type: 'chat_id' },
      data: {
        receive_id: chatId,
        msg_type: msgType,
        content: JSON.stringify(content),
      },
    });

    return res?.data?.message_id || '';
  }

  private async sendAttachmentMessage(
    chatId: string,
    attachment: SocialAttachment
  ): Promise<string> {
    if (attachment.type === 'image') {
      const imageKey = await this.resolveImageKey(attachment);
      return this.createMessage(chatId, 'image', { image_key: imageKey });
    }

    const fileKey = await this.resolveFileKey(attachment);
    return this.createMessage(chatId, 'file', { file_key: fileKey });
  }

  private async resolveImageKey(attachment: SocialAttachment): Promise<string> {
    const source = this.getAttachmentSource(attachment);
    if (!source) {
      throw new Error('Feishu image attachment is missing a source');
    }

    if (!(await this.shouldUploadAttachment(source))) {
      return source;
    }

    const image = await this.readAttachmentBytes(source);
    const res: any = await this.client!.im.image.create({
      data: {
        image_type: 'message',
        image,
      },
    });

    const imageKey = res?.image_key;
    if (!imageKey) {
      throw new Error(`Feishu image upload failed for ${source}`);
    }

    return imageKey;
  }

  private async resolveFileKey(attachment: SocialAttachment): Promise<string> {
    const source = this.getAttachmentSource(attachment);
    if (!source) {
      throw new Error('Feishu file attachment is missing a source');
    }

    if (!(await this.shouldUploadAttachment(source))) {
      return source;
    }

    const file = await this.readAttachmentBytes(source);
    const fileName = this.getAttachmentFilename(attachment, source);
    const fileType = this.getAttachmentFileType(fileName);
    const res: any = await this.client!.im.file.create({
      data: {
        file_type: fileType,
        file_name: fileName,
        file,
      },
    });

    const fileKey = res?.file_key;
    if (!fileKey) {
      throw new Error(`Feishu file upload failed for ${source}`);
    }

    return fileKey;
  }

  private getAttachmentSource(attachment: SocialAttachment): string | undefined {
    return attachment.localPath?.trim() || attachment.url?.trim() || undefined;
  }

  private getAttachmentFilename(
    attachment: SocialAttachment,
    source: string
  ): string {
    if (attachment.filename?.trim()) {
      return attachment.filename.trim();
    }

    if (this.isHttpUrl(source)) {
      try {
        const url = new URL(source);
        const basename = path.posix.basename(url.pathname);
        return basename || 'attachment';
      } catch {
        return 'attachment';
      }
    }

    return path.basename(source) || 'attachment';
  }

  private getAttachmentFileType(fileName: string): string {
    return path.extname(fileName).replace(/^\./, '').toLowerCase() || 'file';
  }

  private async shouldUploadAttachment(source: string): Promise<boolean> {
    if (this.isHttpUrl(source)) {
      return true;
    }

    if (await this.pathExists(source)) {
      return true;
    }

    return this.looksLikeLocalPath(source);
  }

  private looksLikeLocalPath(value: string): boolean {
    return (
      path.isAbsolute(value) ||
      value.startsWith('./') ||
      value.startsWith('.\\') ||
      value.startsWith('../') ||
      value.startsWith('..\\') ||
      value.includes('/') ||
      value.includes('\\') ||
      Boolean(path.extname(value))
    );
  }

  private async readAttachmentBytes(source: string): Promise<Buffer> {
    if (await this.pathExists(source)) {
      return fs.readFile(source);
    }

    if (this.isHttpUrl(source)) {
      const response = await fetch(source);
      if (!response.ok) {
        throw new Error(
          `Failed to download attachment from ${source}: HTTP ${response.status}`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    if (this.looksLikeLocalPath(source)) {
      throw new Error(`Attachment file not found: ${source}`);
    }

    throw new Error(`Attachment source is not a local path or URL: ${source}`);
  }

  private isHttpUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private async pathExists(value: string): Promise<boolean> {
    try {
      await fs.access(value);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Edit an existing message (for streaming progressive updates)
   */
  async editMessage(chatId: string, messageId: string, text: string): Promise<void> {
    if (!this.client || !messageId) return;
    try {
      await this.client.im.message.update({
        path: { message_id: messageId },
        data: {
          msg_type: 'text',
          content: JSON.stringify({ text }),
        },
      });
    } catch (error) {
      logger.debug(`[${this.platformName}] Failed to edit message:`, error);
    }
  }

  /**
   * Get bot info
   */
  async getBotInfo(): Promise<BotInfo> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      const res = await this.client.application.v6.application.get();

      return {
        id: (res.data as any)?.app?.app_id || 'unknown',
        username: (res.data as any)?.app?.app_name || 'Feishu Bot',
        displayName: (res.data as any)?.app?.app_name || 'Feishu Bot',
        platform: this.platformName,
      };
    } catch (error) {
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
  async getChatInfo(chatId: string): Promise<ChatInfo> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    try {
      const res = await this.client.im.chat.get({
        chat_id: chatId,
      } as any);

      return {
        id: (res.data as any)?.chat_id || chatId,
        type: (res.data as any)?.chat_mode === 'p2p' ? 'private' : 'group',
        title: (res.data as any)?.name || 'Unnamed Chat',
        memberCount: (res.data as any)?.member_user_count,
        platform: this.platformName,
      };
    } catch (error) {
      logger.warn(`[${this.platformName}] Failed to get chat info:`, error);
      return {
        id: chatId,
        type: 'group',
        platform: this.platformName,
      };
    }
  }

  /**
   * Handle Feishu message event.
   * With WSClient long-connection mode the SDK passes the event payload directly,
   * so `data` is the event (structure: { sender, message }).
   */
  private async handleFeishuMessage(data: any): Promise<void> {
    try {
      const msg = data?.message;
      const sender = data?.sender;

      if (!msg || !sender) {
        logger.warn(
          `[${this.platformName}] Unexpected event shape:`,
          JSON.stringify(data).slice(0, 200)
        );
        return;
      }

      if (sender.sender_type && sender.sender_type !== 'user') {
        logger.debug(
          `[${this.platformName}] Ignoring non-user event from sender_type=${sender.sender_type}`
        );
        return;
      }

      const extracted = await this.extractIncomingPayload(msg);

      const message: SocialMessage = {
        messageId: msg.message_id,
        chatId: msg.chat_id,
        userId:
          sender.sender_id?.user_id ||
          sender.sender_id?.open_id ||
          sender.sender_id?.union_id ||
          'unknown',
        username:
          sender.sender_id?.user_id || sender.sender_id?.open_id || 'unknown',
        text: extracted.text,
        timestamp: Number(msg.create_time),
        platform: this.platformName,
        replyTo: msg.parent_id,
        attachments: extracted.attachments,
        metadata: {
          messageType: msg.message_type,
        },
      };

      if (!message.text?.trim() && !message.attachments?.length) {
        logger.debug(
          `[${this.platformName}] Ignoring empty Feishu message ${message.messageId}`
        );
        return;
      }

      await this.emitMessage(message);
    } catch (error) {
      logger.error(`[${this.platformName}] Error handling message:`, error);
    }
  }

  /**
   * Extract text content from message
   */
  private extractTextContent(message: any): string {
    try {
      const content = this.parseMessageContent(message);
      return content.text || '';
    } catch {
      return '';
    }
  }

  private parseMessageContent(message: any): Record<string, any> {
    try {
      const rawContent = message?.content;
      if (typeof rawContent !== 'string' || !rawContent.trim()) {
        return {};
      }
      return JSON.parse(rawContent);
    } catch {
      return {};
    }
  }

  private async extractIncomingPayload(message: any): Promise<{
    text: string;
    attachments?: SocialAttachment[];
  }> {
    const content = this.parseMessageContent(message);

    switch (message?.message_type) {
      case 'image': {
        const imageKey = content.image_key;
        if (!imageKey) {
          return { text: '' };
        }

        return {
          text: '',
          attachments: [
            await this.downloadMessageAttachment(
              message,
              imageKey,
              'image',
              'image',
              content.file_name
            ),
          ],
        };
      }

      case 'file': {
        const fileKey = content.file_key;
        if (!fileKey) {
          return { text: '' };
        }

        return {
          text: '',
          attachments: [
            await this.downloadMessageAttachment(
              message,
              fileKey,
              'file',
              'file',
              content.file_name
            ),
          ],
        };
      }

      default:
        return {
          text: content.text || '',
        };
    }
  }

  private async downloadMessageAttachment(
    message: any,
    resourceKey: string,
    resourceType: string,
    attachmentType: SocialAttachment['type'],
    filenameHint?: string
  ): Promise<SocialAttachment> {
    if (!this.client) {
      throw new Error('Feishu client not initialized');
    }

    const resource: any = await this.client.im.messageResource.get({
      params: { type: resourceType },
      path: {
        message_id: message.message_id,
        file_key: resourceKey,
      },
    });

    const mimeType =
      this.extractHeaderValue(resource?.headers, 'content-type') ||
      this.defaultMimeTypeForAttachment(attachmentType, filenameHint);
    const finalFilename = this.buildDownloadedFilename(
      message.message_id,
      attachmentType,
      filenameHint,
      mimeType
    );
    const tempDir = path.join(tmpdir(), 'anode-clawdbot', 'feishu-media');
    await fs.mkdir(tempDir, { recursive: true });
    const localPath = path.join(tempDir, finalFilename);

    if (typeof resource?.writeFile === 'function') {
      await resource.writeFile(localPath);
    } else {
      throw new Error('Feishu message resource download does not expose writeFile');
    }

    return {
      type: attachmentType,
      url: localPath,
      localPath,
      filename: finalFilename,
      mimeType,
    };
  }

  private buildDownloadedFilename(
    messageId: string,
    attachmentType: SocialAttachment['type'],
    filenameHint: string | undefined,
    mimeType: string | undefined
  ): string {
    const hintedName = filenameHint?.trim()
      ? path.basename(filenameHint.trim())
      : `${attachmentType}-${messageId}`;
    const parsed = path.parse(hintedName);
    const safeBaseName = this.sanitizeFilename(parsed.name || `${attachmentType}-${messageId}`);
    const extension =
      parsed.ext ||
      this.extensionFromMimeType(mimeType) ||
      this.defaultExtensionForAttachment(attachmentType);
    return `${safeBaseName}-${Date.now()}${extension}`;
  }

  private sanitizeFilename(value: string): string {
    return value.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
  }

  private extractHeaderValue(headers: any, headerName: string): string | undefined {
    if (!headers) {
      return undefined;
    }

    if (typeof headers.get === 'function') {
      return headers.get(headerName) || headers.get(headerName.toLowerCase()) || undefined;
    }

    return (
      headers[headerName] ||
      headers[headerName.toLowerCase()] ||
      headers[headerName.toUpperCase()]
    );
  }

  private defaultMimeTypeForAttachment(
    attachmentType: SocialAttachment['type'],
    filenameHint?: string
  ): string {
    const extension = path.extname(filenameHint || '').replace(/^\./, '').toLowerCase();
    if (extension === 'png') return 'image/png';
    if (extension === 'gif') return 'image/gif';
    if (extension === 'webp') return 'image/webp';
    if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
    if (attachmentType === 'image') return 'image/png';
    return 'application/octet-stream';
  }

  private extensionFromMimeType(mimeType?: string): string | undefined {
    switch (mimeType) {
      case 'image/png':
        return '.png';
      case 'image/gif':
        return '.gif';
      case 'image/webp':
        return '.webp';
      case 'image/jpeg':
        return '.jpg';
      default:
        return undefined;
    }
  }

  private defaultExtensionForAttachment(
    attachmentType: SocialAttachment['type']
  ): string {
    if (attachmentType === 'image') {
      return '.png';
    }
    return '.bin';
  }

  /**
   * Get event dispatcher (for webhook setup)
   */
  getEventDispatcher(): any {
    return this.eventDispatcher;
  }
}
