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
 * Typed EventBus singleton
 */
export class EventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(50);
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
            logger.info('[EventBus] Singleton created');
        }
        return EventBus.instance;
    }
    /**
     * Typed emit
     */
    emit(event, data) {
        logger.debug(`[EventBus] ${String(event)}`);
        return super.emit(event, data);
    }
    /**
     * Typed on
     */
    on(event, listener) {
        return super.on(event, listener);
    }
    /**
     * Typed once
     */
    once(event, listener) {
        return super.once(event, listener);
    }
    /**
     * Typed off
     */
    off(event, listener) {
        return super.off(event, listener);
    }
    /**
     * Reset singleton (for testing)
     */
    static reset() {
        if (EventBus.instance) {
            EventBus.instance.removeAllListeners();
            EventBus.instance = null;
        }
    }
}
EventBus.instance = null;
