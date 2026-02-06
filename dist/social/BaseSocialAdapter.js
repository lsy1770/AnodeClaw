/**
 * Base Social Platform Adapter
 *
 * Abstract base class for social platform adapters
 */
import { logger } from '../utils/logger.js';
/**
 * Base adapter implementation
 */
export class BaseSocialAdapter {
    constructor() {
        this.messageHandlers = [];
        this._status = {
            connected: false,
            messageCount: 0,
        };
    }
    get initialized() {
        return this.config !== undefined;
    }
    get status() {
        return { ...this._status };
    }
    /**
     * Initialize the adapter
     */
    async initialize(config) {
        logger.info(`[${this.platformName}] Initializing adapter`);
        this.config = config;
        try {
            await this.connect();
            this._status.connected = true;
            this._status.lastConnected = Date.now();
            this._status.error = undefined;
            logger.info(`[${this.platformName}] Adapter initialized successfully`);
        }
        catch (error) {
            this._status.connected = false;
            this._status.error =
                error instanceof Error ? error.message : String(error);
            logger.error(`[${this.platformName}] Initialization failed:`, error);
            throw error;
        }
    }
    /**
     * Shutdown the adapter
     */
    async shutdown() {
        logger.info(`[${this.platformName}] Shutting down adapter`);
        try {
            await this.disconnect();
            this._status.connected = false;
            this.messageHandlers = [];
            logger.info(`[${this.platformName}] Adapter shut down successfully`);
        }
        catch (error) {
            logger.error(`[${this.platformName}] Shutdown failed:`, error);
            throw error;
        }
    }
    /**
     * Register message handler
     */
    onMessage(handler) {
        this.messageHandlers.push(handler);
    }
    /**
     * Emit message to handlers
     */
    async emitMessage(message) {
        this._status.messageCount = (this._status.messageCount || 0) + 1;
        for (const handler of this.messageHandlers) {
            try {
                await handler(message);
            }
            catch (error) {
                logger.error(`[${this.platformName}] Message handler error:`, error);
            }
        }
    }
}
