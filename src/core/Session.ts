/**
 * Session class - manages conversation state with message tree structure
 *
 * Key features:
 * - Message tree for branching conversations
 * - Current leaf tracking for active conversation path
 * - Context building from root to current leaf
 * - Branch switching support
 * - Persistence via SessionStorage interface
 */

import type {
  Message,
  MessageRole,
  MessageContent,
  SessionOptions,
  SessionData,
  SessionStorage,
} from './types.js';
import { generateMessageId } from '../utils/id.js';
import { logger } from '../utils/logger.js';

// Re-export Message type for external use
export type { Message, MessageRole, MessageContent };

export class Session {
  /** Unique session identifier */
  public readonly sessionId: string;

  /** System prompt for this session */
  public systemPrompt: string;

  /** Model to use for this session */
  public model: string;

  /** Message tree (Map for O(1) lookup) */
  private messages: Map<string, Message>;

  /** Current leaf message ID (active conversation path) */
  private currentLeafId: string | null;

  /** Storage backend */
  private storage: SessionStorage;

  /** Session creation timestamp */
  public readonly createdAt: number;

  /** Last update timestamp */
  private updatedAt: number;

  constructor(options: SessionOptions) {
    this.sessionId = options.sessionId;
    this.systemPrompt = options.systemPrompt;
    this.model = options.model;
    this.messages = new Map();
    this.currentLeafId = null;
    this.storage = options.storage;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    logger.debug(`Session created: ${this.sessionId}`);
  }

  /**
   * Initialize session (load from storage if exists)
   */
  async initialize(): Promise<void> {
    const data = await this.storage.load();

    if (data) {
      logger.info(`Loading existing session: ${this.sessionId}`);
      this.systemPrompt = data.systemPrompt;
      this.model = data.model;
      this.messages = new Map(data.messages);
      this.currentLeafId = data.currentLeafId;
      this.updatedAt = data.updatedAt;
      logger.info(`Loaded ${this.messages.size} messages`);
    } else {
      logger.info(`Initializing new session: ${this.sessionId}`);
    }
  }

  /**
   * Add a message to the session
   *
   * The new message becomes a child of the current leaf
   *
   * @param msg - Message to add (without id, timestamp, parentId, children)
   * @returns The created message
   */
  addMessage(msg: {
    role: MessageRole;
    content: MessageContent;
    metadata?: Message['metadata'];
  }): Message {
    const message: Message = {
      id: generateMessageId(),
      role: msg.role,
      content: msg.content,
      timestamp: Date.now(),
      parentId: this.currentLeafId,
      children: [],
      metadata: msg.metadata,
    };

    // Add to parent's children
    if (this.currentLeafId) {
      const parent = this.messages.get(this.currentLeafId);
      if (parent) {
        parent.children.push(message.id);
      }
    }

    // Store message
    this.messages.set(message.id, message);

    // Update current leaf
    this.currentLeafId = message.id;
    this.updatedAt = Date.now();

    logger.debug(`Message added: ${message.id} (role: ${message.role})`);

    return message;
  }

  /**
   * Build conversation context from root to current leaf
   *
   * Returns array of messages following the path from root to current leaf
   * System prompt is included as the first message
   *
   * @returns Ordered array of messages (system + conversation path)
   */
  buildContext(): Message[] {
    const systemMessage: Message = {
      id: 'system',
      role: 'system',
      content: this.systemPrompt,
      timestamp: this.createdAt,
      parentId: null,
      children: [],
    };

    if (!this.currentLeafId) {
      return [systemMessage];
    }

    const path = this.getPathToRoot(this.currentLeafId);
    return [systemMessage, ...path.reverse()];
  }

  /**
   * Get path from a message to root
   *
   * @param messageId - Starting message ID
   * @returns Array of messages from messageId to root (not including system)
   */
  private getPathToRoot(messageId: string): Message[] {
    const path: Message[] = [];
    let currentId: string | null = messageId;

    while (currentId) {
      const message = this.messages.get(currentId);
      if (!message) {
        logger.warn(`Message not found in path: ${currentId}`);
        break;
      }
      path.push(message);
      currentId = message.parentId;
    }

    return path;
  }

  /**
   * Switch to a different branch (change current leaf)
   *
   * @param messageId - Message ID to switch to
   * @throws Error if message not found
   */
  switchBranch(messageId: string): void {
    if (!this.messages.has(messageId)) {
      throw new Error(`Cannot switch branch: Message not found: ${messageId}`);
    }

    this.currentLeafId = messageId;
    this.updatedAt = Date.now();

    logger.info(`Switched branch to message: ${messageId}`);
  }

  /**
   * Get a specific message by ID
   *
   * @param messageId - Message ID
   * @returns Message or undefined
   */
  getMessage(messageId: string): Message | undefined {
    return this.messages.get(messageId);
  }

  /**
   * Get all messages in the session
   *
   * @returns Array of all messages
   */
  getAllMessages(): Message[] {
    return Array.from(this.messages.values());
  }

  /**
   * Get message tree structure
   *
   * @returns Map of message ID to message
   */
  getMessageTree(): Map<string, Message> {
    return new Map(this.messages);
  }

  /**
   * Get current context size (number of messages in active path)
   */
  getContextSize(): number {
    return this.buildContext().length;
  }

  /**
   * Get total message count
   */
  getTotalMessageCount(): number {
    return this.messages.size;
  }

  /**
   * Get current leaf message ID
   */
  getCurrentLeafId(): string | null {
    return this.currentLeafId;
  }

  /**
   * Save session to storage
   */
  async save(): Promise<void> {
    const data: SessionData = {
      sessionId: this.sessionId,
      systemPrompt: this.systemPrompt,
      model: this.model,
      messages: Array.from(this.messages.entries()),
      currentLeafId: this.currentLeafId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };

    await this.storage.save(data);
    logger.info(`Session saved: ${this.sessionId}`);
  }

  /**
   * Delete this session
   */
  async delete(): Promise<void> {
    await this.storage.delete();
    logger.info(`Session deleted: ${this.sessionId}`);
  }

  /**
   * Export session as JSON
   */
  /**
   * Replace current conversation history with a new linear history
   * Used for context compression
   *
   * @param messages - New linear history (ordered)
   */
  replaceHistory(messages: Message[]): void {
    // Clear existing map (reset to new linear state)
    this.messages.clear();
    this.currentLeafId = null;

    let previousId: string | null = null;

    for (const msg of messages) {
      // Handle system prompt separately
      if (msg.role === 'system') {
        if (typeof msg.content === 'string') {
          this.systemPrompt = msg.content;
        }
        continue;
      }

      // Ensure ID exists (generate if missing)
      const id = msg.id && msg.id !== 'system' ? msg.id : generateMessageId();

      const newMsg: Message = {
        id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp || Date.now(),
        parentId: previousId,
        children: [],
        metadata: msg.metadata
      };

      // Link to parent
      if (previousId) {
        const parent = this.messages.get(previousId);
        if (parent) {
          parent.children.push(id);
        }
      }

      this.messages.set(id, newMsg);
      previousId = id;
    }

    this.currentLeafId = previousId;
    this.updatedAt = Date.now();
    logger.info(`[Session] History replaced with ${this.messages.size} messages (compressed)`);
  }

  toJSON(): SessionData {
    return {
      sessionId: this.sessionId,
      systemPrompt: this.systemPrompt,
      model: this.model,
      messages: Array.from(this.messages.entries()),
      currentLeafId: this.currentLeafId,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}
