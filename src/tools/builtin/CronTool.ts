/**
 * Cron Scheduler Tool
 *
 * A cron-like task scheduler built on top of ACS Timer API
 * Supports standard cron expressions for flexible task scheduling
 *
 * Cron Expression Format:
 * ┌───────────── minute (0 - 59)
 * │ ┌───────────── hour (0 - 23)
 * │ │ ┌───────────── day of month (1 - 31)
 * │ │ │ ┌───────────── month (1 - 12)
 * │ │ │ │ ┌───────────── day of week (0 - 6) (Sunday = 0)
 * │ │ │ │ │
 * │ │ │ │ │
 * * * * * *
 *
 * Examples:
 * - "0 0 * * *"      = Every day at midnight
 * - "30 9 * * 1-5"   = 9:30 AM on weekdays
 * - "0 0-23/2 * * *" = Every 2 hours
 * - "15,45 * * * *"  = At 15 and 45 minutes of every hour
 * - "0 0 1 * *"      = First day of every month at midnight
 */

import { z } from 'zod';
import type { Tool, ToolResult } from '../types.js';
import { logger } from '../../utils/logger.js';

// Timer API global (assumed to be available in Anode environment)
declare const timer: {
  scheduleTask(options: {
    callback: string;
    triggerTime: number;
    exact?: boolean;
    allowWhileIdle?: boolean;
  }): Promise<string>;
  cancelTask(taskId: string): Promise<boolean>;
  listTasks(): Promise<Array<{
    id: string;
    type: string;
    delay: number;
    createdAt: number;
  }>>;
};

// File API for persistence
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<boolean>;
  exists(path: string): boolean;  // Note: exists is synchronous, not Promise
};

/**
 * Parse cron expression and return next execution time
 */
function parseAndCalculateNext(cronExpression: string, fromTime: number = Date.now()): number | null {
  const parts = cronExpression.trim().split(/\s+/);

  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: "${cronExpression}". Expected 5 fields (minute hour day month weekday)`);
  }

  const [minuteStr, hourStr, dayStr, monthStr, weekdayStr] = parts;

  const current = new Date(fromTime);
  let next = new Date(fromTime);

  // Start from next minute
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Try to find next matching time within reasonable limit (max 2 years)
  const maxAttempts = 365 * 24 * 60 * 2; // 2 years in minutes
  let attempts = 0;

  while (attempts < maxAttempts) {
    const minute = next.getMinutes();
    const hour = next.getHours();
    const day = next.getDate();
    const month = next.getMonth() + 1; // 0-indexed to 1-indexed
    const weekday = next.getDay(); // 0 = Sunday

    if (
      matchesCronField(minuteStr, minute, 0, 59) &&
      matchesCronField(hourStr, hour, 0, 23) &&
      matchesCronField(dayStr, day, 1, 31) &&
      matchesCronField(monthStr, month, 1, 12) &&
      matchesCronField(weekdayStr, weekday, 0, 6)
    ) {
      return next.getTime();
    }

    // Move to next minute
    next.setMinutes(next.getMinutes() + 1);
    attempts++;
  }

  return null; // No match found within 2 years
}

/**
 * Check if a value matches a cron field
 */
function matchesCronField(field: string, value: number, min: number, max: number): boolean {
  // * matches all
  if (field === '*') return true;

  // Step values (e.g., */5)
  if (field.startsWith('*/')) {
    const step = parseInt(field.substring(2));
    return value % step === 0;
  }

  // Specific value (e.g., 5)
  if (/^\d+$/.test(field)) {
    return value === parseInt(field);
  }

  // List of values (e.g., 1,5,10)
  if (field.includes(',')) {
    const values = field.split(',').map(v => parseInt(v.trim()));
    return values.includes(value);
  }

  // Range (e.g., 1-5)
  if (field.includes('-')) {
    const [start, end] = field.split('-').map(v => parseInt(v.trim()));
    return value >= start && value <= end;
  }

  // Range with step (e.g., 1-10/2)
  if (field.includes('/') && field.includes('-')) {
    const [range, stepStr] = field.split('/');
    const [start, end] = range.split('-').map(v => parseInt(v.trim()));
    const step = parseInt(stepStr);
    return value >= start && value <= end && (value - start) % step === 0;
  }

  return false;
}

/**
 * Cron Add Tool - Add a new cron job
 */
export const cronAddTool: Tool = {
  name: 'cron_add',
  description: 'Add a new cron job with cron expression. Returns job ID. Example: "0 0 * * *" runs every day at midnight.',
  category: 'utility',
  permissions: ['scheduling:write'],
  parallelizable: true,

  parameters: [
    {
      name: 'name',
      description: 'Job name (unique identifier)',
      schema: z.string().min(1).max(100),
      required: true,
    },
    {
      name: 'cronExpression',
      description: 'Cron expression (5 fields: minute hour day month weekday). Example: "30 9 * * 1-5" = 9:30 AM on weekdays',
      schema: z.string().regex(/^[\d\*\-,\/]+\s+[\d\*\-,\/]+\s+[\d\*\-,\/]+\s+[\d\*\-,\/]+\s+[\d\*\-,\/]+$/),
      required: true,
    },
    {
      name: 'callback',
      description: 'JavaScript code to execute (as string)',
      schema: z.string().min(1),
      required: true,
    },
    {
      name: 'description',
      description: 'Optional job description',
      schema: z.string(),
      required: false,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { name, cronExpression, callback, description = '' } = params;

      logger.debug(`[cron_add] Step 1: Starting, name=${name}, expression=${cronExpression}`);

      // Validate cron expression by calculating next execution
      logger.debug(`[cron_add] Step 2: Parsing cron expression`);
      const nextTime = parseAndCalculateNext(cronExpression);
      if (!nextTime) {
        throw new Error(`Invalid cron expression: no matching time found within 2 years`);
      }
      logger.debug(`[cron_add] Step 3: Next execution time: ${new Date(nextTime).toISOString()}`);

      // Load existing jobs
      const cronFilePath = '/sdcard/ACS/cron_jobs.json';
      let jobs: any = {};
      try {
        logger.debug(`[cron_add] Step 4: Checking if file exists`);
        if (file.exists(cronFilePath)) {  // exists is synchronous
          logger.debug(`[cron_add] Step 5: Reading existing jobs`);
          const content = await file.readText(cronFilePath);  // readText instead of read
          jobs = JSON.parse(content);
          logger.debug(`[cron_add] Step 6: Loaded ${Object.keys(jobs).length} existing jobs`);
        } else {
          logger.debug(`[cron_add] Step 5: No existing jobs file, starting fresh`);
        }
      } catch (e) {
        logger.warn('[cron_add] Failed to load existing cron jobs, starting fresh', e);
      }

      // Check for duplicate name
      if (jobs[name]) {
        throw new Error(`Cron job "${name}" already exists. Use cron_update or cron_delete first.`);
      }

      // Create callback template (before creating job)
      logger.debug(`[cron_add] Step 7: Creating callback template`);

      // Store callback template in job metadata, so it can reconstruct itself
      // Timer callback must be self-contained (no require allowed)
      const callbackTemplate = `(async function() {
  try {
    const JOB_NAME = 'JOB_NAME_PLACEHOLDER';
    const cronFilePath = '/sdcard/ACS/cron_jobs.json';

    if (!file.exists(cronFilePath)) return;

    const jobs = JSON.parse(await file.readText(cronFilePath));
    const job = jobs[JOB_NAME];

    if (!job || !job.enabled) return;

    // Execute user callback
    eval(job.callback);

    // Update stats
    job.lastRun = Date.now();
    job.runCount = (job.runCount || 0) + 1;

    // Inline cron calculator
    function calcNext(expr) {
      const p = expr.split(/\\s+/);
      if (p.length !== 5) return null;

      let t = new Date(Date.now() + 60000);
      t.setSeconds(0, 0);

      function m(f, v) {
        if (f === '*') return true;
        if (f.startsWith('*/')) return v % +f.slice(2) === 0;
        if (/^\\d+$/.test(f)) return v === +f;
        if (f.includes(',')) return f.split(',').some(x => +x === v);
        if (f.includes('-')) {
          const [s, e] = f.split('-');
          return v >= +s && v <= +e;
        }
        return false;
      }

      for (let i = 0; i < 525600; i++) {
        if (m(p[0], t.getMinutes()) && m(p[1], t.getHours()) &&
            m(p[2], t.getDate()) && m(p[3], t.getMonth() + 1) &&
            m(p[4], t.getDay())) {
          return t.getTime();
        }
        t.setMinutes(t.getMinutes() + 1);
      }
      return null;
    }

    const next = calcNext(job.cronExpression);
    if (!next) return;

    job.nextRun = next;

    // Re-schedule using template from file
    job.timerTaskId = await timer.scheduleTask({
      callback: job.callbackTemplate.replace('JOB_NAME_PLACEHOLDER', JOB_NAME),
      triggerTime: next,
      exact: true,
      allowWhileIdle: true
    });

    await file.writeText(cronFilePath, JSON.stringify(jobs, null, 2));
  } catch (e) {
    console.error('[Cron]', e.message);
  }
})();`;

      // Create job entry
      logger.debug(`[cron_add] Step 8: Creating job entry`);
      const job: {
        name: string;
        cronExpression: string;
        callback: string;
        callbackTemplate: string;  // Template for self-rescheduling
        description: string;
        createdAt: number;
        enabled: boolean;
        nextRun: number;
        lastRun: number | null;
        runCount: number;
        timerTaskId: string | null;
      } = {
        name,
        cronExpression,
        callback,
        callbackTemplate,  // Store template for reconstruction
        description,
        createdAt: Date.now(),
        enabled: true,
        nextRun: nextTime,
        lastRun: null,
        runCount: 0,
        timerTaskId: null,
      };

      // Schedule the first execution
      logger.debug(`[cron_add] Step 9: Checking timer API availability`);
      logger.debug(`[cron_add] typeof timer = ${typeof timer}`);

      if (typeof timer === 'undefined') {
        throw new Error('Timer API is not available in this environment');
      }

      logger.debug(`[cron_add] Step 10: Scheduling first timer task`);
      const rescheduleCallback = callbackTemplate.replace('JOB_NAME_PLACEHOLDER', name);

      const timerTaskId = await timer.scheduleTask({
        callback: rescheduleCallback,
        triggerTime: nextTime,
        exact: true,
        allowWhileIdle: true,
      });

      logger.debug(`[cron_add] Step 11: Timer task scheduled, ID=${timerTaskId}`);
      job.timerTaskId = timerTaskId;

      // Save job
      logger.debug(`[cron_add] Step 12: Saving job to file`);
      jobs[name] = job;
      await file.writeText(cronFilePath, JSON.stringify(jobs, null, 2));  // writeText instead of write

      logger.info(`[cron_add] Step 13: SUCCESS - Cron job "${name}" added. Next run: ${new Date(nextTime).toISOString()}`);

      const result: ToolResult = {
        success: true,
        output: {
          jobName: name,
          cronExpression,
          nextRun: nextTime,
          nextRunFormatted: new Date(nextTime).toISOString(),
          timerTaskId,
          message: `Cron job "${name}" created successfully`,
        },
      };

      logger.debug(`[cron_add] Step 14: Returning result: ${JSON.stringify(result).substring(0, 200)}`);
      return result;
    } catch (error) {
      logger.error(`[cron_add] ERROR: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: {
          code: 'CRON_ADD_FAILED',
          message: error instanceof Error ? error.message : 'Failed to add cron job',
          details: error,
        },
      };
    }
  },
};

/**
 * Cron List Tool - List all cron jobs
 */
export const cronListTool: Tool = {
  name: 'cron_list',
  description: 'List all cron jobs with their status and next run times',
  category: 'utility',
  permissions: ['scheduling:read'],
  parallelizable: true,

  parameters: [],

  async execute(): Promise<ToolResult> {
    try {
      logger.debug('[cron_list] Step 1: Starting');
      const cronFilePath = '/sdcard/ACS/cron_jobs.json';

      logger.debug('[cron_list] Step 2: Checking if file exists');
      if (!file.exists(cronFilePath)) {  // exists is synchronous
        logger.debug('[cron_list] Step 3: No cron jobs file found');
        return {
          success: true,
          output: {
            jobs: [],
            count: 0,
            message: 'No cron jobs found',
          },
        };
      }

      logger.debug('[cron_list] Step 4: Reading jobs file');
      const content = await file.readText(cronFilePath);  // readText instead of read
      logger.debug(`[cron_list] Step 5: File content length: ${content.length}`);

      const jobs = JSON.parse(content);
      logger.debug(`[cron_list] Step 6: Parsed ${Object.keys(jobs).length} jobs`);

      const jobList = Object.values(jobs).map((job: any) => ({
        name: job.name,
        cronExpression: job.cronExpression,
        description: job.description,
        enabled: job.enabled,
        nextRun: job.nextRun,
        nextRunFormatted: new Date(job.nextRun).toISOString(),
        lastRun: job.lastRun,
        lastRunFormatted: job.lastRun ? new Date(job.lastRun).toISOString() : null,
        runCount: job.runCount,
        createdAt: job.createdAt,
      }));

      logger.debug(`[cron_list] Step 7: Returning ${jobList.length} jobs`);

      return {
        success: true,
        output: {
          jobs: jobList,
          count: jobList.length,
        },
      };
    } catch (error) {
      logger.error(`[cron_list] ERROR: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: {
          code: 'CRON_LIST_FAILED',
          message: error instanceof Error ? error.message : 'Failed to list cron jobs',
          details: error,
        },
      };
    }
  },
};

/**
 * Cron Delete Tool - Delete a cron job
 */
export const cronDeleteTool: Tool = {
  name: 'cron_delete',
  description: 'Delete a cron job by name',
  category: 'utility',
  permissions: ['scheduling:write'],
  parallelizable: false,

  parameters: [
    {
      name: 'name',
      description: 'Job name to delete',
      schema: z.string(),
      required: true,
    },
  ],

  async execute(params): Promise<ToolResult> {
    try {
      const { name } = params;
      logger.debug(`[cron_delete] Step 1: Starting, name=${name}`);

      const cronFilePath = '/sdcard/ACS/cron_jobs.json';

      logger.debug('[cron_delete] Step 2: Checking if file exists');
      if (!file.exists(cronFilePath)) {  // exists is synchronous
        throw new Error('No cron jobs found');
      }

      logger.debug('[cron_delete] Step 3: Reading jobs file');
      const content = await file.readText(cronFilePath);  // readText instead of read
      const jobs = JSON.parse(content);

      logger.debug(`[cron_delete] Step 4: Looking for job "${name}"`);
      if (!jobs[name]) {
        throw new Error(`Cron job "${name}" not found`);
      }

      // Cancel timer task if exists
      if (jobs[name].timerTaskId) {
        try {
          logger.debug(`[cron_delete] Step 5: Canceling timer task ${jobs[name].timerTaskId}`);
          await timer.cancelTask(jobs[name].timerTaskId);
        } catch (e) {
          logger.warn(`[cron_delete] Failed to cancel timer task: ${e}`);
        }
      }

      // Delete job
      logger.debug('[cron_delete] Step 6: Deleting job from object');
      delete jobs[name];

      logger.debug('[cron_delete] Step 7: Writing updated jobs to file');
      await file.writeText(cronFilePath, JSON.stringify(jobs, null, 2));  // writeText instead of write

      logger.info(`[cron_delete] Step 8: SUCCESS - Cron job "${name}" deleted`);

      return {
        success: true,
        output: {
          jobName: name,
          message: `Cron job "${name}" deleted successfully`,
        },
      };
    } catch (error) {
      logger.error(`[cron_delete] ERROR: ${error instanceof Error ? error.message : String(error)}`);
      return {
        success: false,
        error: {
          code: 'CRON_DELETE_FAILED',
          message: error instanceof Error ? error.message : 'Failed to delete cron job',
          details: error,
        },
      };
    }
  },
};

/**
 * Export all cron tools
 */
export const cronTools: Tool[] = [
  cronAddTool,
  cronListTool,
  cronDeleteTool,
];

// rescheduleJob function removed - rescheduling is now handled inline in callbackTemplate
