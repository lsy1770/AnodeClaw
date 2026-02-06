/**
 * Lane Queue System - Types
 *
 * Task queue management system with serial-by-default execution
 */

export type TaskPriority = 'high' | 'normal' | 'low';

export interface Task<T = any> {
  id: string;
  name: string;
  priority: TaskPriority;
  execute: () => Promise<T>;
  onSuccess?: (result: T) => void;
  onError?: (error: Error) => void;
  timeout?: number; // Timeout in milliseconds
  retries?: number; // Number of retries
}

export interface LaneOptions {
  concurrency?: number; // Concurrency level (1 = serial)
  maxQueueSize?: number; // Maximum queue length
  timeoutMs?: number; // Default timeout
}

export interface TaskResult<T = any> {
  taskId: string;
  success: boolean;
  result?: T;
  error?: Error;
  executionTime: number; // Execution time in milliseconds
}

export interface LaneStatus {
  id: string;
  queueLength: number;
  running: boolean;
  currentTask: {
    id: string;
    name: string;
  } | null;
}
