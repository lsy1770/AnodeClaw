/**
 * Core types for Anode ClawdBot sessions and messages
 */

/**
 * Message role types
 */
export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

/**
 * Tool call structure (for agent actions)
 */
export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, any>;
}

/**
 * Tool result structure
 */
export interface ToolResult {
  toolCallId: string;
  output: any;
  isError?: boolean;
}

/**
 * Media attachment for tool outputs (images, videos, audio, files)
 */
export interface MediaAttachment {
  type: 'image' | 'video' | 'audio' | 'file';
  localPath: string;
  filename?: string;
  mimeType?: string;
}

/**
 * Message content types
 */
export type MessageContent =
  | string
  | ToolCall[]
  | ToolResult[]
  | Array<{ type: 'text'; text: string } | { type: 'tool_use'; [key: string]: any }>;

/**
 * Message structure
 *
 * Messages form a tree structure where each message can have multiple children
 * This enables conversation branching and regeneration
 */
export interface Message {
  /** Unique message ID */
  id: string;

  /** Message role */
  role: MessageRole;

  /** Message content */
  content: MessageContent;

  /** Timestamp (Unix milliseconds) */
  timestamp: number;

  /** Parent message ID (null for root) */
  parentId: string | null;

  /** Child message IDs */
  children: string[];

  /** Optional metadata */
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
    [key: string]: any;
  };
}

/**
 * Session options
 */
export interface SessionOptions {
  sessionId: string;
  systemPrompt: string;
  model: string;
  storage: SessionStorage;
}

/**
 * Session data for persistence
 */
export interface SessionData {
  sessionId: string;
  systemPrompt: string;
  model: string;
  messages: Array<[string, Message]>;
  currentLeafId: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Session storage interface
 *
 * Abstraction for session persistence (file, database, etc.)
 */
export interface SessionStorage {
  /**
   * Load session data
   * @returns Session data or null if not found
   */
  load(): Promise<SessionData | null>;

  /**
   * Save session data
   */
  save(data: SessionData): Promise<void>;

  /**
   * Check if session exists
   */
  exists(): Promise<boolean>;

  /**
   * Delete session
   */
  delete(): Promise<void>;
}
