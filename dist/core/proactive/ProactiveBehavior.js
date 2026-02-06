/**
 * Proactive Behavior
 *
 * Heuristic suggestion engine that analyzes daily logs, error patterns,
 * and task history to generate actionable suggestions. Runs as a heartbeat
 * task and after task completion — no model API calls required.
 */
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
const DEFAULT_CONFIG = {
    enabled: true,
    checkInterval: 15 * 60 * 1000,
    quietHoursStart: 23,
    quietHoursEnd: 7,
    repeatThreshold: 5,
    idleSessionTimeout: 2 * 60 * 60 * 1000,
};
/**
 * ProactiveBehavior Class
 *
 * Emits a `'suggestions'` event with an array of ProactiveSuggestion
 * whenever new suggestions are generated.
 */
export class ProactiveBehavior extends EventEmitter {
    constructor(config, memorySystem, dailyLogManager, getActiveSessions) {
        super();
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.memorySystem = memorySystem;
        this.dailyLogManager = dailyLogManager;
        this.getActiveSessions = getActiveSessions;
    }
    /**
     * Run all heuristic checks and return suggestions
     */
    async check() {
        if (!this.config.enabled)
            return [];
        if (this.isQuietHours()) {
            logger.debug('[Proactive] Quiet hours — skipping checks');
            return [];
        }
        const suggestions = [];
        try {
            const [pending, repeated, idle, errors] = await Promise.all([
                this.checkPendingTasks(),
                this.checkRepeatedPatterns(),
                this.checkIdleSessions(),
                this.checkErrorPatterns(),
            ]);
            suggestions.push(...pending, ...repeated, ...idle, ...errors);
        }
        catch (err) {
            logger.warn('[Proactive] Check failed:', err);
        }
        if (suggestions.length > 0) {
            this.emit('suggestions', suggestions);
            logger.info(`[Proactive] Generated ${suggestions.length} suggestion(s)`);
        }
        return suggestions;
    }
    /**
     * Analyze a completed task and return follow-up suggestions
     */
    async analyzeTaskCompletion(task, result) {
        if (!this.config.enabled)
            return [];
        const suggestions = [];
        if (result === 'failure') {
            suggestions.push({
                type: 'follow-up',
                title: 'Task failed',
                description: `The task "${task.slice(0, 60)}" failed. Consider retrying or investigating the error.`,
                priority: 'medium',
                timestamp: Date.now(),
            });
        }
        if (result === 'success') {
            // Check if user frequently runs similar tasks — suggest automation
            try {
                const recentLogs = await this.dailyLogManager.getRecentLogs(7);
                const allCompleted = recentLogs.flatMap(l => l.tasksCompleted);
                const similar = allCompleted.filter(t => this.textSimilarity(t, task) > 0.5);
                if (similar.length >= this.config.repeatThreshold) {
                    suggestions.push({
                        type: 'optimization',
                        title: 'Repeated task detected',
                        description: `"${task.slice(0, 40)}" has been completed ${similar.length} times recently. Consider automating it.`,
                        priority: 'low',
                        timestamp: Date.now(),
                    });
                }
            }
            catch {
                // non-critical
            }
        }
        if (suggestions.length > 0) {
            this.emit('suggestions', suggestions);
        }
        return suggestions;
    }
    /**
     * Create a heartbeat task config for periodic proactive checks
     */
    createHeartbeatTask() {
        return {
            id: 'builtin:proactive-check',
            name: 'Proactive Behavior Check',
            description: 'Periodically checks for pending tasks, repeated patterns, idle sessions, and error patterns',
            schedule: {
                type: 'interval',
                interval: this.config.checkInterval,
            },
            enabled: this.config.enabled,
            handler: async () => {
                await this.check();
            },
            onError: (error) => {
                logger.error('[Proactive] Heartbeat task error:', error.message);
            },
        };
    }
    // ===== Heuristic check methods =====
    /**
     * Check for pending tasks and generate reminders
     */
    async checkPendingTasks() {
        const suggestions = [];
        try {
            const pending = await this.dailyLogManager.getPendingTasks();
            if (pending.length > 0) {
                suggestions.push({
                    type: 'reminder',
                    title: `${pending.length} pending task(s)`,
                    description: `You have ${pending.length} pending task(s): ${pending.slice(0, 3).join(', ')}${pending.length > 3 ? '...' : ''}`,
                    priority: pending.length >= 5 ? 'high' : 'medium',
                    timestamp: Date.now(),
                });
            }
        }
        catch (err) {
            logger.debug('[Proactive] checkPendingTasks failed:', err);
        }
        return suggestions;
    }
    /**
     * Check for repeated patterns in recent activity
     */
    async checkRepeatedPatterns() {
        const suggestions = [];
        try {
            const recentLogs = await this.dailyLogManager.getRecentLogs(7);
            const allCompleted = recentLogs.flatMap(l => l.tasksCompleted);
            // Count similar tasks
            const taskCounts = new Map();
            for (const task of allCompleted) {
                const normalized = task.toLowerCase().trim();
                // Group similar tasks
                let foundKey = false;
                for (const [key, count] of taskCounts) {
                    if (this.textSimilarity(key, normalized) > 0.6) {
                        taskCounts.set(key, count + 1);
                        foundKey = true;
                        break;
                    }
                }
                if (!foundKey) {
                    taskCounts.set(normalized, 1);
                }
            }
            for (const [task, count] of taskCounts) {
                if (count >= this.config.repeatThreshold) {
                    suggestions.push({
                        type: 'optimization',
                        title: 'Repeated task pattern',
                        description: `"${task.slice(0, 50)}" has been done ${count} times this week. Consider creating an automation or macro.`,
                        priority: 'low',
                        timestamp: Date.now(),
                    });
                }
            }
        }
        catch (err) {
            logger.debug('[Proactive] checkRepeatedPatterns failed:', err);
        }
        return suggestions;
    }
    /**
     * Check for idle sessions
     */
    async checkIdleSessions() {
        const suggestions = [];
        const activeSessions = this.getActiveSessions();
        if (activeSessions.length > 3) {
            suggestions.push({
                type: 'warning',
                title: 'Many active sessions',
                description: `${activeSessions.length} sessions are active. Consider closing unused sessions to free resources.`,
                priority: 'low',
                timestamp: Date.now(),
            });
        }
        return suggestions;
    }
    /**
     * Check for repeated error patterns
     */
    async checkErrorPatterns() {
        const suggestions = [];
        try {
            const todayLog = await this.dailyLogManager.getTodayLog();
            const errors = todayLog.errors;
            if (errors.length >= 3) {
                // Look for repeated error messages
                const errorCounts = new Map();
                for (const err of errors) {
                    // Strip timestamp prefix
                    const msg = err.replace(/^\d{2}:\d{2}:\s*/, '').toLowerCase().trim();
                    const normalized = msg.slice(0, 80);
                    errorCounts.set(normalized, (errorCounts.get(normalized) || 0) + 1);
                }
                for (const [errMsg, count] of errorCounts) {
                    if (count >= 2) {
                        suggestions.push({
                            type: 'warning',
                            title: 'Repeated error',
                            description: `Error "${errMsg.slice(0, 60)}" occurred ${count} times today. This may need investigation.`,
                            priority: 'high',
                            timestamp: Date.now(),
                        });
                    }
                }
            }
            if (errors.length >= 5) {
                suggestions.push({
                    type: 'warning',
                    title: 'High error rate',
                    description: `${errors.length} errors recorded today. System stability may be affected.`,
                    priority: 'high',
                    timestamp: Date.now(),
                });
            }
        }
        catch (err) {
            logger.debug('[Proactive] checkErrorPatterns failed:', err);
        }
        return suggestions;
    }
    // ===== Utility methods =====
    /**
     * Check if current time is within quiet hours
     */
    isQuietHours() {
        const hour = new Date().getHours();
        const { quietHoursStart, quietHoursEnd } = this.config;
        if (quietHoursStart <= quietHoursEnd) {
            // e.g., 23-7 wraps around midnight
            return hour >= quietHoursStart || hour < quietHoursEnd;
        }
        // e.g., 8-22 (quiet from 8 AM to 10 PM — unusual but supported)
        return hour >= quietHoursStart && hour < quietHoursEnd;
    }
    /**
     * Simple text similarity (Jaccard on word set)
     */
    textSimilarity(a, b) {
        const setA = new Set(a.toLowerCase().split(/\s+/));
        const setB = new Set(b.toLowerCase().split(/\s+/));
        let intersection = 0;
        for (const word of setA) {
            if (setB.has(word))
                intersection++;
        }
        const union = setA.size + setB.size - intersection;
        return union === 0 ? 0 : intersection / union;
    }
}
