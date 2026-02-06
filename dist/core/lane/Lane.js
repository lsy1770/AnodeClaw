/**
 * Lane - Serial Task Queue
 *
 * Executes tasks serially by default to avoid race conditions
 */
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
export class Lane extends EventEmitter {
    constructor(id, options = {}) {
        super();
        this.id = id;
        this.queue = [];
        this.running = false;
        this.currentTask = null;
        this.options = {
            concurrency: options.concurrency || 1, // Default to serial
            maxQueueSize: options.maxQueueSize || 100,
            timeoutMs: options.timeoutMs || 300000, // 5 minutes
        };
    }
    /**
     * Enqueue a task
     */
    async enqueue(task) {
        // Check if queue is full
        if (this.queue.length >= this.options.maxQueueSize) {
            throw new Error(`Lane ${this.id} queue is full`);
        }
        // Add to queue
        this.queue.push(task);
        this.emit('task:queued', { taskId: task.id, queueLength: this.queue.length });
        logger.info(`[Lane:${this.id}] Task queued: ${task.name} (queue: ${this.queue.length})`);
        // Start processing if not running
        if (!this.running) {
            this.processQueue();
        }
        // Return promise that resolves when task completes
        return new Promise((resolve, reject) => {
            const originalSuccess = task.onSuccess;
            const originalError = task.onError;
            task.onSuccess = (result) => {
                originalSuccess?.(result);
                resolve(result);
            };
            task.onError = (error) => {
                originalError?.(error);
                reject(error);
            };
        });
    }
    /**
     * Process queue
     */
    async processQueue() {
        if (this.running)
            return;
        this.running = true;
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            await this.executeTask(task);
        }
        this.running = false;
        this.emit('queue:empty');
        logger.info(`[Lane:${this.id}] Queue empty`);
    }
    /**
     * Execute a single task
     */
    async executeTask(task) {
        this.currentTask = task;
        const startTime = Date.now();
        this.emit('task:start', { taskId: task.id, taskName: task.name });
        logger.info(`[Lane:${this.id}] Task started: ${task.name}`);
        try {
            // Execute task with timeout
            const result = await this.executeWithTimeout(task.execute(), task.timeout || this.options.timeoutMs);
            const executionTime = Date.now() - startTime;
            // Success callback
            task.onSuccess?.(result);
            this.emit('task:success', {
                taskId: task.id,
                result,
                executionTime,
            });
            logger.info(`[Lane:${this.id}] Task success: ${task.name} (${executionTime}ms)`);
        }
        catch (error) {
            const executionTime = Date.now() - startTime;
            // Retry logic
            if (task.retries && task.retries > 0) {
                task.retries--;
                this.queue.unshift(task); // Re-add to queue head
                this.emit('task:retry', {
                    taskId: task.id,
                    retriesLeft: task.retries,
                    error,
                });
                logger.warn(`[Lane:${this.id}] Task retry: ${task.name} (${task.retries} left)`);
                return;
            }
            // Error callback
            task.onError?.(error);
            this.emit('task:error', {
                taskId: task.id,
                error,
                executionTime,
            });
            logger.error(`[Lane:${this.id}] Task error: ${task.name}:`, error);
        }
        finally {
            this.currentTask = null;
        }
    }
    /**
     * Execute with timeout
     */
    executeWithTimeout(promise, timeoutMs) {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Task timeout')), timeoutMs)),
        ]);
    }
    /**
     * Get lane status
     */
    getStatus() {
        return {
            id: this.id,
            queueLength: this.queue.length,
            running: this.running,
            currentTask: this.currentTask ? {
                id: this.currentTask.id,
                name: this.currentTask.name,
            } : null,
        };
    }
    /**
     * Clear queue
     */
    clear() {
        this.queue = [];
        this.emit('queue:cleared');
        logger.info(`[Lane:${this.id}] Queue cleared`);
    }
    /**
     * Get queue length
     */
    get length() {
        return this.queue.length;
    }
    /**
     * Check if running
     */
    get isRunning() {
        return this.running;
    }
}
