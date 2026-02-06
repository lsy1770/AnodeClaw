/**
 * UI Types and Interfaces
 *
 * Type definitions for UI components.
 * Based on real Anode ACS API signatures from:
 * - FloatingWindowAPI.kt
 * - UIAPI.kt
 * - NotificationAPI.kt
 */

/**
 * Floating window configuration
 */
export interface WindowConfig {
  xml: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

/**
 * UI event types (supported by UIAPI and FloatingWindowAPI)
 */
export type UIEventType = 'click' | 'longClick' | 'touch' | 'textChanged' | 'editorAction' | 'focusChange';

/**
 * Floating window lifecycle events
 */
export type FloatingWindowEvent = 'show' | 'hide' | 'close' | 'move' | 'resize' | 'created';

/**
 * UI event data
 */
export interface UIEvent {
  type: UIEventType;
  viewId: string;
  value?: string;
  actionId?: number;
}

/**
 * Message display configuration
 */
export interface MessageDisplay {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

/**
 * Session info for list display
 */
export interface SessionInfo {
  sessionId: string;
  title: string;
  lastMessage?: string;
  lastUpdated: number;
  messageCount: number;
}

/**
 * Settings configuration
 */
export interface Settings {
  model: {
    provider: 'anthropic' | 'openai' | 'gemini';
    model: string;
    apiKey: string;
  };
  ui: {
    theme: 'light' | 'dark';
    fontSize: number;
  };
  tools: {
    [toolName: string]: boolean;
  };
}

/**
 * Floating Window API
 * Based on ACS FloatingWindowAPI.kt @V8Function signatures
 */
export interface FloatingWindowAPI {
  // Window lifecycle
  create(layoutXml: string): FloatingWindowAPI;
  show(): void;
  hide(): void;
  close(): void;
  isCreated(): boolean;

  // Size and position
  setSize(width: number, height: number): void;
  setPosition(x: number, y: number): void;

  // Window behavior
  setTouchable(touchable: boolean): void;
  setFocusable(focusable: boolean): void;
  checkOverlayPermission(): boolean;

  // View operations
  findView(id: string): any;
  setText(view: any, text: string): void;
  getText(view: any): string;
  addView(xmlString: string): FloatingWindowAPI;
  removeView(viewId: string): FloatingWindowAPI;

  // Events
  on(eventType: string, callback: (event: any) => void): boolean;
  on(viewId: string, eventType: string, callback: (event: any) => void): boolean;
  onView(viewId: string, eventType: string, callback: (event: any) => void): boolean;
  off(eventType: string): boolean;
  offView(viewId: string, eventType: string): boolean;
  once(eventType: string, callback: (event: any) => void): boolean;
  removeAllListeners(): number;

  // Execution
  run(callback: () => any): any;
}

/**
 * Notification API
 * Based on ACS NotificationAPI.kt @V8Function signatures
 */
export interface NotificationAPI {
  show(title: string, content: string, options?: {
    autoCancel?: boolean;
    bigText?: string;
    progress?: number | boolean;
    actions?: Array<{ title: string; onClick?: string }>;
    onClick?: string;
  }): Promise<number>;
  updateProgress(id: number, progress: number, max?: number): Promise<void>;
  cancel(id: number): Promise<void>;
  cancelAll(): Promise<void>;
  readonly isEnabled: boolean;
}
