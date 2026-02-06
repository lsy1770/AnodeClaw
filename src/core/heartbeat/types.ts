/**
 * Heartbeat System - Types
 *
 * Type definitions for the scheduled task / heartbeat system
 */

export type ScheduleType = 'interval' | 'cron' | 'once';

export interface HeartbeatSchedule {
  type: ScheduleType;
  /** Interval in milliseconds (for 'interval' type) */
  interval?: number;
  /** Cron expression (for 'cron' type), format: "minute hour day month weekday" */
  cron?: string;
  /** Specific time (for 'once' type) */
  time?: number; // timestamp
}

export interface HeartbeatTaskConfig {
  id: string;
  name: string;
  description?: string;
  schedule: HeartbeatSchedule;
  enabled: boolean;
  /** Task handler function */
  handler: () => Promise<void>;
  /** Callback on task error */
  onError?: (error: Error) => void;
}

export interface HeartbeatTaskState {
  id: string;
  name: string;
  description?: string;
  schedule: HeartbeatSchedule;
  enabled: boolean;
  lastExecuted?: number;    // timestamp
  nextExecution?: number;   // timestamp
  executionCount: number;
  lastError?: string;
  status: 'idle' | 'running' | 'paused' | 'completed';
}

export interface HeartbeatManagerOptions {
  /** Minimum allowed interval in ms (default: 60000 = 1 min) */
  minInterval?: number;
  /** Maximum number of tasks (default: 50) */
  maxTasks?: number;
  /** Persistence file path */
  persistencePath?: string;
}
