/**
 * ActivityLog — Append-only activity log for user audit
 *
 * Records what the agent did in a human-readable rolling text file.
 * NOT used for agent recall — that's MemoryStore's job.
 *
 * File: {memoryDir}/activity.log
 * Format: [YYYY-MM-DD HH:MM:SS] CATEGORY | message
 */

import { logger } from '../../utils/logger.js';

// Anode FileAPI — charset must be passed explicitly (Javet doesn't apply Kotlin defaults)
declare const file: {
  appendText(path: string, content: string, charset: string): Promise<void>;
  exists(path: string): boolean;               // sync
  createDirectory(path: string): Promise<void>;
};

const MAX_LOG_BYTES = 512 * 1024; // 512 KB rolling limit (trim handled externally)

function timestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export class ActivityLog {
  private logPath: string;

  constructor(memoryDir: string) {
    this.logPath = `${memoryDir}/activity.log`;
  }

  async initialize(): Promise<void> {
    if (typeof file === 'undefined') return;
    try {
      // Ensure parent directory exists before first write
      const dir = this.logPath.substring(0, this.logPath.lastIndexOf('/'));
      if (dir && !file.exists(dir)) {
        await file.createDirectory(dir);
      }
      await file.appendText(this.logPath, '', 'UTF-8'); // ensure file exists
    } catch {
      // Non-fatal — log will be created on first write
    }
  }

  private async append(category: string, message: string): Promise<void> {
    const line = `[${timestamp()}] ${category.padEnd(8)} | ${message}\n`;
    try {
      if (typeof file !== 'undefined') {
        await file.appendText(this.logPath, line, 'UTF-8');
      }
    } catch (err) {
      logger.debug('[ActivityLog] Write failed:', err);
    }
  }

  async logSession(sessionId: string, event: 'start' | 'end', details?: string): Promise<void> {
    const short = sessionId.slice(0, 8);
    const detail = details ? ` — ${details}` : '';
    await this.append('SESSION', `${event.toUpperCase()} ${short}${detail}`);
  }

  async logTool(toolName: string, durationMs: number, isError: boolean): Promise<void> {
    const status = isError ? 'ERROR' : 'ok';
    await this.append('TOOL', `${toolName} (${durationMs}ms) → ${status}`);
  }

  async logMemory(title: string, tags: string[]): Promise<void> {
    await this.append('MEMORY', `saved: "${title}" [${tags.join(', ')}]`);
  }

  async logError(message: string): Promise<void> {
    await this.append('ERROR', message.slice(0, 200));
  }

  async logInfo(message: string): Promise<void> {
    await this.append('INFO', message.slice(0, 200));
  }
}
