/**
 * Sub-Agent
 *
 * Represents an individual sub-agent with specific role and capabilities
 */

import type { SubAgentConfig, AgentTask, AgentTaskResult, AgentStatus } from './types.js';
import { ModelAPI } from '../ModelAPI.js';
import { logger } from '../../utils/logger.js';
import { EventEmitter } from 'events';

/**
 * Sub-Agent Class
 */
export class SubAgent extends EventEmitter {
  private config: SubAgentConfig;
  private modelAPI: ModelAPI;
  private status: AgentStatus = 'idle';
  private currentTask?: AgentTask;
  private completedTasks: number = 0;
  private failedTasks: number = 0;
  private totalTokens: number = 0;
  private createdAt: number;
  private lastActivity: number;

  constructor(config: SubAgentConfig, apiKey: string, baseURL?: string) {
    super();
    this.config = config;
    this.modelAPI = new ModelAPI('anthropic', apiKey, baseURL);
    this.createdAt = Date.now();
    this.lastActivity = Date.now();

    logger.info(`[SubAgent:${config.id}] Created: ${config.name} (${config.role})`);
  }

  /**
   * Execute a task
   *
   * @param task - Task to execute
   * @returns Task result
   */
  async executeTask(task: AgentTask): Promise<AgentTaskResult> {
    const startTime = Date.now();

    logger.info(
      `[SubAgent:${this.config.id}] Starting task ${task.id}: ${task.instruction}`
    );

    this.status = 'working';
    this.currentTask = task;
    this.lastActivity = Date.now();

    this.emit('taskStart', { agent: this.config.id, task });

    try {
      // Build context from task
      const messages = [
        {
          id: `task-${task.id}`,
          role: 'user' as const,
          content: this.buildTaskPrompt(task),
          timestamp: Date.now(),
          parentId: null,
          children: [],
        },
      ];

      // Call model
      const response = await this.modelAPI.createMessage({
        model: this.config.model || 'claude-sonnet-4-5',
        messages,
        maxTokens: this.config.maxTokens || 4096,
        temperature: this.config.temperature || 0.7,
        systemPrompt: this.config.systemPrompt,
      });

      // Track tokens
      if (response.usage) {
        this.totalTokens += response.usage.inputTokens + response.usage.outputTokens;
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      const result: AgentTaskResult = {
        taskId: task.id,
        agentId: this.config.id,
        success: true,
        result: response.content,
        startTime,
        endTime,
        duration,
      };

      this.status = 'completed';
      this.currentTask = undefined;
      this.completedTasks++;
      this.lastActivity = Date.now();

      this.emit('taskComplete', { agent: this.config.id, task, result });

      logger.info(
        `[SubAgent:${this.config.id}] Task ${task.id} completed in ${duration}ms`
      );

      return result;
    } catch (error) {
      const endTime = Date.now();
      const duration = endTime - startTime;

      const result: AgentTaskResult = {
        taskId: task.id,
        agentId: this.config.id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        startTime,
        endTime,
        duration,
      };

      this.status = 'failed';
      this.currentTask = undefined;
      this.failedTasks++;
      this.lastActivity = Date.now();

      this.emit('taskFailed', { agent: this.config.id, task, error });

      logger.error(
        `[SubAgent:${this.config.id}] Task ${task.id} failed:`,
        error
      );

      return result;
    }
  }

  /**
   * Build task prompt from task and context
   */
  private buildTaskPrompt(task: AgentTask): string {
    const parts: string[] = [];

    parts.push(`# Task: ${task.instruction}`);
    parts.push('');

    if (task.context) {
      parts.push('## Context:');
      parts.push('');
      parts.push(typeof task.context === 'string' ? task.context : JSON.stringify(task.context, null, 2));
      parts.push('');
    }

    parts.push('## Instructions:');
    parts.push('');
    parts.push(task.instruction);

    return parts.join('\n');
  }

  /**
   * Get agent state
   */
  getState() {
    return {
      id: this.config.id,
      role: this.config.role,
      name: this.config.name,
      status: this.status,
      currentTask: this.currentTask,
      completedTasks: this.completedTasks,
      failedTasks: this.failedTasks,
      totalTokens: this.totalTokens,
      createdAt: this.createdAt,
      lastActivity: this.lastActivity,
    };
  }

  /**
   * Get agent configuration
   */
  getConfig(): Readonly<SubAgentConfig> {
    return { ...this.config };
  }

  /**
   * Check if agent is available for new tasks
   */
  isAvailable(): boolean {
    return this.status === 'idle' || this.status === 'completed';
  }

  /**
   * Reset agent state
   */
  reset(): void {
    this.status = 'idle';
    this.currentTask = undefined;
    logger.info(`[SubAgent:${this.config.id}] Reset`);
  }

  /**
   * Destroy agent and cleanup resources
   */
  destroy(): void {
    this.removeAllListeners();
    logger.info(`[SubAgent:${this.config.id}] Destroyed`);
  }
}
