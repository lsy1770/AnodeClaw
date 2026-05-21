/**
 * Lane Manager
 *
 * Manages multiple lanes for serial and parallel task execution
 */
import { logger } from '../../utils/logger.js';
import { Lane } from './Lane.js';
export class LaneManager {
    constructor() {
        this.lanes = new Map();
        // Create parallel lane for independent tasks (e.g., cron jobs)
        this.parallelLane = new Lane('parallel', { concurrency: 10 });
        logger.info('[LaneManager] Initialized with parallel lane');
    }
    /**
     * Get or create a lane
     */
    getOrCreateLane(laneId) {
        if (!this.lanes.has(laneId)) {
            const lane = new Lane(laneId);
            this.lanes.set(laneId, lane);
            logger.info(`[LaneManager] Created new lane: ${laneId}`);
        }
        return this.lanes.get(laneId);
    }
    /**
     * Enqueue task in a specific lane (serial execution)
     */
    async enqueue(laneId, task) {
        const lane = this.getOrCreateLane(laneId);
        return lane.enqueue(task);
    }
    /**
     * Enqueue task in parallel lane
     */
    async enqueueParallel(task) {
        return this.parallelLane.enqueue(task);
    }
    /**
     * Get status of all lanes
     */
    getAllStatus() {
        const lanesStatus = Array.from(this.lanes.values()).map(lane => lane.getStatus());
        return {
            serialLanes: lanesStatus,
            parallelLane: this.parallelLane.getStatus(),
            totalLanes: this.lanes.size + 1,
        };
    }
    /**
     * Get status of a specific lane
     */
    getLaneStatus(laneId) {
        const lane = this.lanes.get(laneId);
        return lane ? lane.getStatus() : null;
    }
    /**
     * Clear a specific lane
     */
    clearLane(laneId) {
        const lane = this.lanes.get(laneId);
        if (lane) {
            lane.clear();
        }
    }
    /**
     * Clear all lanes
     */
    clearAll() {
        for (const lane of this.lanes.values()) {
            lane.clear();
        }
        this.parallelLane.clear();
        logger.info('[LaneManager] All lanes cleared');
    }
    /**
     * Cleanup idle lanes
     */
    cleanupIdleLanes() {
        const toDelete = [];
        for (const [laneId, lane] of this.lanes.entries()) {
            const status = lane.getStatus();
            if (!status.running && status.queueLength === 0) {
                toDelete.push(laneId);
            }
        }
        for (const laneId of toDelete) {
            this.lanes.delete(laneId);
            logger.info(`[LaneManager] Cleaned up idle lane: ${laneId}`);
        }
        if (toDelete.length > 0) {
            logger.info(`[LaneManager] Cleaned up ${toDelete.length} idle lanes`);
        }
    }
    /**
     * Get number of active lanes
     */
    get activeLaneCount() {
        return this.lanes.size;
    }
    /**
     * Check if a lane exists
     */
    hasLane(laneId) {
        return this.lanes.has(laneId);
    }
    /**
     * Shutdown all lanes
     */
    shutdown() {
        this.clearAll();
        this.lanes.clear();
        logger.info('[LaneManager] Shutdown complete');
    }
}
