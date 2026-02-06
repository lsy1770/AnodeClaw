/**
 * Heartbeat Manager
 *
 * Manages scheduled tasks with interval, cron, and one-time execution.
 * Integrates with LaneManager for task execution isolation.
 */
import { logger } from '../../utils/logger.js';
/**
 * Simple cron parser - supports: "minute hour day month weekday"
 * Supports: *, specific values, ranges (1-5), step (star/5)
 */
function parseCronField(field, current, max) {
    if (field === '*')
        return true;
    // Step value: */5
    if (field.startsWith('*/')) {
        const step = parseInt(field.slice(2), 10);
        return current % step === 0;
    }
    // Range: 1-5
    if (field.includes('-')) {
        const [start, end] = field.split('-').map(Number);
        return current >= start && current <= end;
    }
    // Comma list: 1,3,5
    if (field.includes(',')) {
        return field.split(',').map(Number).includes(current);
    }
    // Exact match
    return parseInt(field, 10) === current;
}
function matchesCron(cronExpr) {
    const parts = cronExpr.trim().split(/\s+/);
    if (parts.length !== 5)
        return false;
    const now = new Date();
    const [minute, hour, day, month, weekday] = parts;
    return (parseCronField(minute, now.getMinutes(), 59) &&
        parseCronField(hour, now.getHours(), 23) &&
        parseCronField(day, now.getDate(), 31) &&
        parseCronField(month, now.getMonth() + 1, 12) &&
        parseCronField(weekday, now.getDay(), 6));
}
function getNextCronExecution(cronExpr) {
    // Simple estimation: check every minute for next 24 hours
    const now = Date.now();
    const oneMinute = 60 * 1000;
    for (let i = 1; i <= 1440; i++) {
        const checkTime = new Date(now + i * oneMinute);
        const parts = cronExpr.trim().split(/\s+/);
        if (parts.length !== 5)
            return now + oneMinute;
        const [minute, hour, day, month, weekday] = parts;
        if (parseCronField(minute, checkTime.getMinutes(), 59) &&
            parseCronField(hour, checkTime.getHours(), 23) &&
            parseCronField(day, checkTime.getDate(), 31) &&
            parseCronField(month, checkTime.getMonth() + 1, 12) &&
            parseCronField(weekday, checkTime.getDay(), 6)) {
            return checkTime.getTime();
        }
    }
    return now + 24 * 60 * oneMinute;
}
export class HeartbeatManager {
    constructor(options = {}) {
        this.tasks = new Map();
        this.taskStates = new Map();
        this.timers = new Map();
        this.cronChecker = null;
        this.running = false;
        this.options = {
            minInterval: options.minInterval ?? 60_000, // 1 minute
            maxTasks: options.maxTasks ?? 50,
            persistencePath: options.persistencePath ?? 'data/heartbeat/tasks.json',
        };
        logger.info('[Heartbeat] Manager initialized');
    }
    /**
     * Register a new scheduled task
     */
    register(config) {
        if (this.tasks.size >= this.options.maxTasks) {
            throw new Error(`Maximum task limit reached (${this.options.maxTasks})`);
        }
        if (this.tasks.has(config.id)) {
            throw new Error(`Task with id "${config.id}" already exists`);
        }
        // Validate interval
        if (config.schedule.type === 'interval') {
            const interval = config.schedule.interval ?? 0;
            if (interval < this.options.minInterval) {
                throw new Error(`Interval ${interval}ms is below minimum (${this.options.minInterval}ms)`);
            }
        }
        this.tasks.set(config.id, config);
        const state = {
            id: config.id,
            name: config.name,
            description: config.description,
            schedule: config.schedule,
            enabled: config.enabled,
            executionCount: 0,
            status: config.enabled ? 'idle' : 'paused',
        };
        // Calculate next execution
        state.nextExecution = this.calculateNextExecution(config.schedule);
        this.taskStates.set(config.id, state);
        // If manager is running and task is enabled, schedule it
        if (this.running && config.enabled) {
            this.scheduleTask(config);
        }
        logger.info(`[Heartbeat] Registered task: ${config.name} (${config.id})`);
    }
    /**
     * Unregister a task
     */
    unregister(taskId) {
        this.cancelTimer(taskId);
        this.tasks.delete(taskId);
        this.taskStates.delete(taskId);
        logger.info(`[Heartbeat] Unregistered task: ${taskId}`);
    }
    /**
     * Start the heartbeat manager
     */
    start() {
        if (this.running)
            return;
        this.running = true;
        // Schedule all enabled tasks
        for (const [id, config] of this.tasks) {
            if (config.enabled) {
                this.scheduleTask(config);
            }
        }
        // Start cron checker (checks every 60 seconds)
        this.cronChecker = setInterval(() => this.checkCronTasks(), 60_000);
        logger.info(`[Heartbeat] Started with ${this.tasks.size} tasks`);
    }
    /**
     * Stop the heartbeat manager
     */
    stop() {
        if (!this.running)
            return;
        this.running = false;
        // Cancel all timers
        for (const taskId of this.timers.keys()) {
            this.cancelTimer(taskId);
        }
        // Stop cron checker
        if (this.cronChecker) {
            clearInterval(this.cronChecker);
            this.cronChecker = null;
        }
        logger.info('[Heartbeat] Stopped');
    }
    /**
     * Pause a specific task
     */
    pause(taskId) {
        const state = this.taskStates.get(taskId);
        if (!state)
            throw new Error(`Task "${taskId}" not found`);
        this.cancelTimer(taskId);
        state.status = 'paused';
        state.enabled = false;
        const config = this.tasks.get(taskId);
        if (config)
            config.enabled = false;
        logger.info(`[Heartbeat] Paused task: ${taskId}`);
    }
    /**
     * Resume a paused task
     */
    resume(taskId) {
        const state = this.taskStates.get(taskId);
        const config = this.tasks.get(taskId);
        if (!state || !config)
            throw new Error(`Task "${taskId}" not found`);
        state.status = 'idle';
        state.enabled = true;
        config.enabled = true;
        if (this.running) {
            this.scheduleTask(config);
        }
        logger.info(`[Heartbeat] Resumed task: ${taskId}`);
    }
    /**
     * List all tasks with their states
     */
    list() {
        return Array.from(this.taskStates.values());
    }
    /**
     * Get a specific task state
     */
    getTask(taskId) {
        return this.taskStates.get(taskId);
    }
    /**
     * Manually trigger a task
     */
    async trigger(taskId) {
        const config = this.tasks.get(taskId);
        if (!config)
            throw new Error(`Task "${taskId}" not found`);
        await this.executeTask(config);
    }
    /**
     * Get manager status
     */
    getStatus() {
        return {
            running: this.running,
            totalTasks: this.tasks.size,
            activeTasks: Array.from(this.taskStates.values()).filter(s => s.status === 'idle' || s.status === 'running').length,
            pausedTasks: Array.from(this.taskStates.values()).filter(s => s.status === 'paused').length,
        };
    }
    /**
     * Shutdown and clean up
     */
    shutdown() {
        this.stop();
        this.tasks.clear();
        this.taskStates.clear();
        logger.info('[Heartbeat] Shutdown complete');
    }
    // --- Private methods ---
    scheduleTask(config) {
        // Cancel existing timer if any
        this.cancelTimer(config.id);
        const { schedule } = config;
        switch (schedule.type) {
            case 'interval': {
                const interval = schedule.interval;
                const timer = setInterval(() => this.executeTask(config), interval);
                this.timers.set(config.id, timer);
                break;
            }
            case 'once': {
                const delay = (schedule.time ?? 0) - Date.now();
                if (delay > 0) {
                    const timer = setTimeout(async () => {
                        await this.executeTask(config);
                        // Mark as completed
                        const state = this.taskStates.get(config.id);
                        if (state)
                            state.status = 'completed';
                        this.timers.delete(config.id);
                    }, delay);
                    this.timers.set(config.id, timer);
                }
                else {
                    logger.warn(`[Heartbeat] Task "${config.id}" schedule time has passed, executing immediately`);
                    this.executeTask(config).then(() => {
                        const state = this.taskStates.get(config.id);
                        if (state)
                            state.status = 'completed';
                    });
                }
                break;
            }
            case 'cron':
                // Cron tasks are handled by the cron checker
                break;
        }
    }
    checkCronTasks() {
        for (const [id, config] of this.tasks) {
            if (!config.enabled || config.schedule.type !== 'cron')
                continue;
            if (!config.schedule.cron)
                continue;
            const state = this.taskStates.get(id);
            if (!state || state.status === 'running')
                continue;
            if (matchesCron(config.schedule.cron)) {
                this.executeTask(config);
            }
        }
    }
    async executeTask(config) {
        const state = this.taskStates.get(config.id);
        if (!state)
            return;
        if (state.status === 'running') {
            logger.warn(`[Heartbeat] Task "${config.id}" is already running, skipping`);
            return;
        }
        state.status = 'running';
        try {
            logger.debug(`[Heartbeat] Executing task: ${config.name}`);
            await config.handler();
            state.lastExecuted = Date.now();
            state.executionCount++;
            state.lastError = undefined;
            state.nextExecution = this.calculateNextExecution(config.schedule);
            logger.debug(`[Heartbeat] Task "${config.name}" completed (count: ${state.executionCount})`);
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            state.lastError = errMsg;
            logger.error(`[Heartbeat] Task "${config.name}" failed: ${errMsg}`);
            if (config.onError && error instanceof Error) {
                try {
                    config.onError(error);
                }
                catch {
                    // Ignore error in error handler
                }
            }
        }
        finally {
            if (state.status === 'running') {
                state.status = config.schedule.type === 'once' ? 'completed' : 'idle';
            }
        }
    }
    calculateNextExecution(schedule) {
        const now = Date.now();
        switch (schedule.type) {
            case 'interval':
                return now + (schedule.interval ?? 0);
            case 'once':
                return schedule.time;
            case 'cron':
                return schedule.cron ? getNextCronExecution(schedule.cron) : undefined;
            default:
                return undefined;
        }
    }
    cancelTimer(taskId) {
        const timer = this.timers.get(taskId);
        if (timer) {
            clearInterval(timer);
            clearTimeout(timer);
            this.timers.delete(taskId);
        }
    }
}
