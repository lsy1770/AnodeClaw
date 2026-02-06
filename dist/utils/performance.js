/**
 * Performance Monitor
 *
 * Tracks performance metrics for the agent system.
 */
import { logger } from './logger.js';
/**
 * Performance timer for tracking operation durations
 */
export class PerformanceTimer {
    constructor(label) {
        this.label = label;
        this.startTime = Date.now();
    }
    /**
     * End the timer and log the duration
     */
    end() {
        const duration = Date.now() - this.startTime;
        logger.debug(`[Performance] ${this.label}: ${duration}ms`);
        return duration;
    }
    /**
     * Get current duration without ending
     */
    getDuration() {
        return Date.now() - this.startTime;
    }
}
/**
 * Performance Monitor class
 */
export class PerformanceMonitor {
    constructor() {
        this.requestTimes = [];
        this.toolExecutionTimes = [];
        this.requestCount = 0;
        this.toolExecutionCount = 0;
        this.startupTime = Date.now();
    }
    /**
     * Get singleton instance
     */
    static getInstance() {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }
    /**
     * Record a request
     */
    recordRequest(duration) {
        this.requestCount++;
        this.requestTimes.push(duration);
        // Keep only last 100 requests
        if (this.requestTimes.length > 100) {
            this.requestTimes.shift();
        }
    }
    /**
     * Record a tool execution
     */
    recordToolExecution(duration) {
        this.toolExecutionCount++;
        this.toolExecutionTimes.push(duration);
        // Keep only last 100 executions
        if (this.toolExecutionTimes.length > 100) {
            this.toolExecutionTimes.shift();
        }
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        const avgRequestTime = this.requestTimes.length > 0
            ? this.requestTimes.reduce((a, b) => a + b, 0) / this.requestTimes.length
            : 0;
        const avgToolTime = this.toolExecutionTimes.length > 0
            ? this.toolExecutionTimes.reduce((a, b) => a + b, 0) / this.toolExecutionTimes.length
            : 0;
        return {
            startupTime: Date.now() - this.startupTime,
            memoryUsage: process.memoryUsage(),
            requestCount: this.requestCount,
            averageResponseTime: avgRequestTime,
            toolExecutionCount: this.toolExecutionCount,
            averageToolExecutionTime: avgToolTime,
        };
    }
    /**
     * Log current metrics
     */
    logMetrics() {
        const metrics = this.getMetrics();
        const memMB = (metrics.memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
        logger.info('[Performance] Metrics:');
        logger.info(`  Uptime: ${(metrics.startupTime / 1000).toFixed(2)}s`);
        logger.info(`  Memory: ${memMB} MB`);
        logger.info(`  Requests: ${metrics.requestCount}`);
        logger.info(`  Avg Response Time: ${metrics.averageResponseTime.toFixed(2)}ms`);
        logger.info(`  Tool Executions: ${metrics.toolExecutionCount}`);
        logger.info(`  Avg Tool Time: ${metrics.averageToolExecutionTime.toFixed(2)}ms`);
    }
    /**
     * Reset all metrics
     */
    reset() {
        this.requestTimes = [];
        this.toolExecutionTimes = [];
        this.requestCount = 0;
        this.toolExecutionCount = 0;
    }
    /**
     * Start a performance timer
     */
    startTimer(label) {
        return new PerformanceTimer(label);
    }
}
// Export singleton instance
export const performanceMonitor = PerformanceMonitor.getInstance();
