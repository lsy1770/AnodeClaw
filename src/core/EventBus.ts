/**
 * EventBus - Central event dispatcher for cross-system coordination
 *
 * Provides typed events for decoupled communication between subsystems:
 * - Tool execution events (before/after/error)
 * - Session lifecycle events (start/end/compress)
 * - Message events (user/assistant)
 * - Memory events (saved)
 * - Agent state events (idle)
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * Typed event map
 */
export interface EventMap {
  'tool:before': { toolName: string; args: Record<string, any>; sessionId: string };
  'tool:after': { toolName: string; args: Record<string, any>; result: any; duration: number; sessionId: string };
  'tool:error': { toolName: string; args: Record<string, any>; error: any; sessionId: string };
  'session:start': { sessionId: string };
  'session:end': { sessionId: string; messageCount: number };
  'session:compress': { sessionId: string; beforeCount: number; afterCount: number };
  'message:user': { sessionId: string; content: string };
  'message:assistant': { sessionId: string; content: string };
  'memory:saved': { title: string; tags: string[] };
  'agent:idle': { sessionId: string; idleDuration: number };
}

/**
 * Typed EventBus singleton
 */
export class EventBus extends EventEmitter {
  private static instance: EventBus | null = null;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
      logger.info('[EventBus] Singleton created');
    }
    return EventBus.instance;
  }

  /**
   * Typed emit
   */
  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    logger.debug(`[EventBus] ${String(event)}`);
    return super.emit(event as string, data);
  }

  /**
   * Typed on
   */
  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event as string, listener);
  }

  /**
   * Typed once
   */
  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.once(event as string, listener);
  }

  /**
   * Typed off
   */
  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event as string, listener);
  }

  /**
   * Reset singleton (for testing)
   */
  static reset(): void {
    if (EventBus.instance) {
      EventBus.instance.removeAllListeners();
      EventBus.instance = null;
    }
  }
}
