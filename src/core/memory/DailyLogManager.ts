/**
 * Daily Log Manager
 *
 * Manages daily markdown log files with structured sections for sessions,
 * tasks, insights, and errors. Files stored at {memoryDir}/daily/YYYY-MM-DD.md.
 */

import { logger } from '../../utils/logger.js';

// Anode global file API (based on FileAPI.kt actual method signatures)
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<boolean>;
  exists(path: string): boolean;
  delete(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<boolean>;
  listFiles(path: string): Promise<Array<{
    name: string;
    path: string;
    size: number;
    isDirectory: boolean;
    lastModified: number;
    extension: string;
  }>>;
};

/**
 * A single session entry in the daily log
 */
export interface DailySessionEntry {
  id: string;
  timeRange: string;
  summary: string;
  result: 'success' | 'failure' | 'partial';
}

/**
 * Parsed daily log structure
 */
export interface DailyLog {
  date: string;
  sessions: DailySessionEntry[];
  tasksCompleted: string[];
  tasksPending: string[];
  insights: string[];
  errors: string[];
}

/**
 * File API abstraction — uses Anode's global file API.
 */
function readTextFile(path: string): Promise<string> {
  if (typeof file !== 'undefined' && file.readText) {
    return file.readText(path, 'UTF-8');
  }
  throw new Error('Anode file API not available');
}

function writeTextFile(path: string, content: string): Promise<boolean> {
  if (typeof file !== 'undefined' && file.writeText) {
    return file.writeText(path, content, 'UTF-8');
  }
  throw new Error('Anode file API not available');
}

function fileExists(path: string): boolean {
  if (typeof file !== 'undefined' && file.exists) {
    return file.exists(path);
  }
  return false;
}

async function ensureDir(path: string): Promise<void> {
  if (typeof file !== 'undefined' && file.createDirectory) {
    try {
      await file.createDirectory(path);
    } catch {
      // Directory may already exist
    }
    return;
  }
  logger.warn('[DailyLog] file.createDirectory not available');
}

async function listDir(path: string): Promise<string[]> {
  if (typeof file !== 'undefined' && file.listFiles) {
    const entries = await file.listFiles(path);
    return entries.filter(e => !e.isDirectory).map(e => e.name);
  }
  throw new Error('Anode file API not available');
}

/**
 * Format current time as HH:MM
 */
function timeNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Format a date as YYYY-MM-DD
 */
function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * DailyLogManager Class
 */
export class DailyLogManager {
  private dailyDir: string;
  /** In-memory cache of today's log */
  private cachedLog: DailyLog | null = null;
  private cachedDate: string = '';

  constructor(memoryDir: string) {
    this.dailyDir = `${memoryDir}/daily`;
  }

  /**
   * Ensure the daily directory exists
   */
  async initialize(): Promise<void> {
    await ensureDir(this.dailyDir);
    logger.debug('[DailyLog] Initialized daily log directory');
  }

  /**
   * Get today's date string
   */
  private today(): string {
    return formatDate(new Date());
  }

  /**
   * Get the file path for a given date
   */
  private pathFor(date: string): string {
    return `${this.dailyDir}/${date}.md`;
  }

  /**
   * Invalidate cache if date has changed
   */
  private checkCacheValidity(): void {
    if (this.cachedDate !== this.today()) {
      this.cachedLog = null;
      this.cachedDate = '';
    }
  }

  /**
   * Log a session entry to today's log
   */
  async logSession(entry: DailySessionEntry): Promise<void> {
    const log = await this.getTodayLog();
    log.sessions.push(entry);
    await this.writeDailyLog(log);
  }

  /**
   * Log a completed task
   */
  async logTaskCompleted(task: string): Promise<void> {
    const log = await this.getTodayLog();
    log.tasksCompleted.push(task);
    // Remove from pending if present
    log.tasksPending = log.tasksPending.filter(t => t !== task);
    await this.writeDailyLog(log);
  }

  /**
   * Log a pending task
   */
  async logTaskPending(task: string): Promise<void> {
    const log = await this.getTodayLog();
    if (!log.tasksPending.includes(task)) {
      log.tasksPending.push(task);
    }
    await this.writeDailyLog(log);
  }

  /**
   * Log an insight
   */
  async logInsight(insight: string): Promise<void> {
    const log = await this.getTodayLog();
    log.insights.push(insight);
    await this.writeDailyLog(log);
  }

  /**
   * Log an error
   */
  async logError(error: string): Promise<void> {
    const log = await this.getTodayLog();
    log.errors.push(`${timeNow()}: ${error}`);
    await this.writeDailyLog(log);
  }

  /**
   * Get today's log (from cache or disk)
   */
  async getTodayLog(): Promise<DailyLog> {
    this.checkCacheValidity();
    if (this.cachedLog) {
      return this.cachedLog;
    }

    const date = this.today();
    const log = await this.loadOrCreateLog(date);
    this.cachedLog = log;
    this.cachedDate = date;
    return log;
  }

  /**
   * Get log for a specific date
   */
  async getLogByDate(date: string): Promise<DailyLog> {
    return this.loadOrCreateLog(date);
  }

  /**
   * Get recent logs (last N days)
   */
  async getRecentLogs(days: number): Promise<DailyLog[]> {
    const logs: DailyLog[] = [];
    const now = new Date();

    for (let i = 0; i < days; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const date = formatDate(d);
      const path = this.pathFor(date);

      if (fileExists(path)) {
        try {
          const log = await this.parseLogFile(date, await readTextFile(path));
          logs.push(log);
        } catch (err) {
          logger.warn(`[DailyLog] Failed to parse log for ${date}:`, err);
        }
      }
    }

    return logs;
  }

  /**
   * Get pending tasks from the most recent log that has them
   */
  async getPendingTasks(): Promise<string[]> {
    const log = await this.getTodayLog();
    if (log.tasksPending.length > 0) return log.tasksPending;

    // Check yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yLog = await this.getLogByDate(formatDate(yesterday));
    return yLog.tasksPending;
  }

  /**
   * Load or create a daily log for a date
   */
  private async loadOrCreateLog(date: string): Promise<DailyLog> {
    const path = this.pathFor(date);

    if (fileExists(path)) {
      try {
        const content = await readTextFile(path);
        return this.parseLogFile(date, content);
      } catch (err) {
        logger.warn(`[DailyLog] Failed to read log for ${date}, creating new:`, err);
      }
    }

    return this.createEmptyLog(date);
  }

  /**
   * Create an empty DailyLog
   */
  private createEmptyLog(date: string): DailyLog {
    return {
      date,
      sessions: [],
      tasksCompleted: [],
      tasksPending: [],
      insights: [],
      errors: [],
    };
  }

  /**
   * Serialize and write a DailyLog to disk
   */
  private async writeDailyLog(log: DailyLog): Promise<void> {
    const content = this.serializeLog(log);
    const path = this.pathFor(log.date);

    await ensureDir(this.dailyDir);
    await writeTextFile(path, content);

    // Update cache
    if (log.date === this.today()) {
      this.cachedLog = log;
      this.cachedDate = log.date;
    }
  }

  /**
   * Serialize a DailyLog to markdown
   */
  private serializeLog(log: DailyLog): string {
    const lines: string[] = [];

    lines.push(`# Daily Log - ${log.date}`);
    lines.push('');

    // Sessions
    lines.push('## Sessions');
    if (log.sessions.length === 0) {
      lines.push('- (none)');
    } else {
      for (const s of log.sessions) {
        lines.push(`- **${s.timeRange}** Session ${s.id}: ${s.summary}`);
        lines.push(`  - Result: ${s.result}`);
      }
    }
    lines.push('');

    // Tasks Completed
    lines.push('## Tasks Completed');
    if (log.tasksCompleted.length === 0) {
      lines.push('- (none)');
    } else {
      for (const t of log.tasksCompleted) {
        lines.push(`- ${t}`);
      }
    }
    lines.push('');

    // Tasks Pending
    lines.push('## Tasks Pending');
    if (log.tasksPending.length === 0) {
      lines.push('- (none)');
    } else {
      for (const t of log.tasksPending) {
        lines.push(`- ${t}`);
      }
    }
    lines.push('');

    // Insights
    lines.push('## Insights');
    if (log.insights.length === 0) {
      lines.push('- (none)');
    } else {
      for (const i of log.insights) {
        lines.push(`- ${i}`);
      }
    }
    lines.push('');

    // Errors/Warnings
    lines.push('## Errors/Warnings');
    if (log.errors.length === 0) {
      lines.push('- (none)');
    } else {
      for (const e of log.errors) {
        lines.push(`- ${e}`);
      }
    }
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Parse a markdown log file back into DailyLog
   */
  private parseLogFile(date: string, content: string): DailyLog {
    const log = this.createEmptyLog(date);
    const lines = content.split('\n');

    let currentSection = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Detect section headers
      if (trimmed.startsWith('## Sessions')) {
        currentSection = 'sessions';
        continue;
      }
      if (trimmed.startsWith('## Tasks Completed')) {
        currentSection = 'tasksCompleted';
        continue;
      }
      if (trimmed.startsWith('## Tasks Pending')) {
        currentSection = 'tasksPending';
        continue;
      }
      if (trimmed.startsWith('## Insights')) {
        currentSection = 'insights';
        continue;
      }
      if (trimmed.startsWith('## Errors') || trimmed.startsWith('## Warnings')) {
        currentSection = 'errors';
        continue;
      }
      if (trimmed.startsWith('# ')) {
        currentSection = '';
        continue;
      }

      // Skip empty lines and "(none)" markers
      if (!trimmed || trimmed === '- (none)') continue;

      // Parse list items
      if (trimmed.startsWith('- ')) {
        const item = trimmed.slice(2).trim();

        switch (currentSection) {
          case 'sessions': {
            // Parse session line: **HH:MM** Session <id>: <summary>
            const sessionMatch = item.match(/^\*\*(.+?)\*\*\s+Session\s+(\S+):\s+(.+)$/);
            if (sessionMatch) {
              log.sessions.push({
                timeRange: sessionMatch[1],
                id: sessionMatch[2],
                summary: sessionMatch[3],
                result: 'success', // default; will be overridden by sub-item
              });
            }
            break;
          }
          case 'tasksCompleted':
            log.tasksCompleted.push(item);
            break;
          case 'tasksPending':
            log.tasksPending.push(item);
            break;
          case 'insights':
            log.insights.push(item);
            break;
          case 'errors':
            log.errors.push(item);
            break;
        }
      }

      // Parse session result sub-items
      if (trimmed.startsWith('- Result:') && currentSection === 'sessions' && log.sessions.length > 0) {
        const resultMatch = trimmed.match(/Result:\s*(success|failure|partial)/);
        if (resultMatch) {
          log.sessions[log.sessions.length - 1].result = resultMatch[1] as 'success' | 'failure' | 'partial';
        }
      }
    }

    return log;
  }

  /**
   * Get all daily log files (sorted by date descending)
   */
  async listLogDates(): Promise<string[]> {
    try {
      const files = await listDir(this.dailyDir);
      return files
        .filter(f => f.endsWith('.md'))
        .map(f => f.replace('.md', ''))
        .sort((a, b) => b.localeCompare(a));
    } catch {
      return [];
    }
  }
}
