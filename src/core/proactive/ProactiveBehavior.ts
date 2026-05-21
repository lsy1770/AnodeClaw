/**
 * Proactive Behavior - AI-driven environmental intelligence.
 *
 * The assistant periodically inspects device context and only surfaces
 * proactive reminders when there is a concrete, actionable reason.
 */

import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
import type { MemoryStore } from '../memory/MemoryStore.js';
import type { HeartbeatTaskConfig } from '../heartbeat/types.js';

declare const image: {
  captureScreenWithAccessibility(displayId?: number, timeoutMs?: number): Promise<any>;
  isAccessibilityScreenshotSupported?(): Promise<boolean>;
};

declare const ocr: {
  init(): Promise<boolean>;
  isInitialized(): boolean;
  recognizeText(bitmap: any, confidence?: number): Promise<string>;
};

declare const notificationListener: {
  readonly isEnabled: boolean;
  readonly isConnected: boolean;
  getActiveNotifications(): Promise<Array<{
    packageName: string;
    appName: string;
    title: string | null;
    text: string | null;
    subText: string | null;
    time: number;
    key: string;
    id: number;
  }>>;
};

declare const device: {
  getBatteryInfo(): Promise<{ level: number; isCharging: boolean }>;
  isScreenOn(): boolean;
};

export interface ProactiveSuggestion {
  type: 'follow-up' | 'optimization' | 'warning' | 'reminder' | 'insight' | 'notification';
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  timestamp: number;
}

export type AIInsightGenerator = (context: string) => Promise<string | null>;

export interface ProactiveBehaviorConfig {
  enabled: boolean;
  checkInterval: number;
  fastCheckInterval: number;
  quietHoursStart: number;
  quietHoursEnd: number;
  repeatThreshold: number;
  idleSessionTimeout: number;
  minAIInterval: number;
  batteryThreshold: number;
  watchedPackages: string[];
  maxScreenTextChars: number;
}

interface EnvironmentSnapshot {
  screenText: string;
  screenOn: boolean;
  notifications: Array<{ app: string; title: string; body: string; key: string; time: number }>;
  battery: { level: number; isCharging: boolean } | null;
  taskSummary: string | null;
  taskNextSteps: string[];
  recentMemories: Array<{ title: string; snippet: string }>;
  timestamp: number;
}

const DEFAULT_WATCHED_PACKAGES = [
  'com.tencent.mm',
  'com.tencent.mobileqq',
  'org.telegram.messenger',
  'com.whatsapp',
  'com.android.mms',
  'com.android.phone',
];

const DEFAULT_CONFIG: ProactiveBehaviorConfig = {
  enabled: true,
  checkInterval: 15 * 60 * 1000,
  fastCheckInterval: 3 * 60 * 1000,
  quietHoursStart: 23,
  quietHoursEnd: 7,
  repeatThreshold: 5,
  idleSessionTimeout: 2 * 60 * 60 * 1000,
  minAIInterval: 5 * 60 * 1000,
  batteryThreshold: 20,
  watchedPackages: DEFAULT_WATCHED_PACKAGES,
  maxScreenTextChars: 800,
};

export class ProactiveBehavior extends EventEmitter {
  private config: ProactiveBehaviorConfig;
  private memoryStore: MemoryStore;
  private getActiveSessions: () => string[];
  private aiGenerator: AIInsightGenerator | null = null;

  private seenNotificationKeys: Set<string> = new Set();
  private lastScreenHash = '';
  private lastAICallTime = 0;
  private lastBatteryAlertLevel = 100;
  private lastDeliveredAt = 0;
  private accessibilityScreenshotSupported: boolean | null = null;
  private loggedAccessibilityScreenshotUnsupported = false;

  private recentMessages: Map<string, number> = new Map();
  private readonly MESSAGE_COOLDOWN = 2 * 60 * 60 * 1000;
  private readonly MIN_DELIVERY_INTERVAL = 30 * 60 * 1000;

  constructor(
    config: Partial<ProactiveBehaviorConfig> | undefined,
    memoryStore: MemoryStore,
    getActiveSessions: () => string[],
  ) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryStore = memoryStore;
    this.getActiveSessions = getActiveSessions;
  }

  setAIInsightGenerator(generator: AIInsightGenerator): void {
    this.aiGenerator = generator;
    logger.info('[Proactive] AI generator registered');
  }

  async fastCheck(): Promise<void> {
    if (!this.config.enabled || this.isQuietHours()) return;
    try {
      const snap = await this.gatherSnapshot();
      await this.synthesizeAndDeliver(snap);
    } catch (err) {
      logger.warn('[Proactive] fastCheck error:', err);
    }
  }

  async check(): Promise<ProactiveSuggestion[]> {
    if (!this.config.enabled || this.isQuietHours()) return [];
    try {
      const snap = await this.gatherSnapshot();
      const msg = await this.synthesizeAndDeliver(snap, true);
      if (!msg) return [];
      return [{
        type: 'insight',
        title: '主动提醒',
        description: msg,
        priority: 'medium',
        timestamp: Date.now(),
      }];
    } catch (err) {
      logger.warn('[Proactive] check error:', err);
      return [];
    }
  }

  async analyzeTaskCompletion(task: string, result: 'success' | 'failure'): Promise<ProactiveSuggestion[]> {
    if (!this.config.enabled) return [];

    const prompt = [
      'You are deciding whether a background follow-up is actually useful to the user.',
      `Task summary: ${task.slice(0, 120)}`,
      `Result: ${result}`,
      '',
      'Rules:',
      '- Only respond if there is a concrete next step, risk, or outcome worth notifying.',
      '- Do not send praise, filler, or generic encouragement.',
      '- If the result is routine and does not need user attention, reply exactly NO_MESSAGE.',
      '- If you do reply, output exactly one concise Chinese sentence under 50 characters.',
      '- Focus on the next action or specific outcome.',
    ].join('\n');

    const msg = await this.callAI(prompt);
    if (!msg) return [];

    const suggestion: ProactiveSuggestion = {
      type: result === 'success' ? 'follow-up' : 'warning',
      title: '主动提醒',
      description: msg,
      priority: result === 'success' ? 'low' : 'medium',
      timestamp: Date.now(),
    };
    this.emit('suggestions', [suggestion]);
    return [suggestion];
  }

  createHeartbeatTask(): HeartbeatTaskConfig {
    return {
      id: 'builtin:proactive-check',
      name: 'Proactive Full Check',
      description: 'AI-driven full environment analysis every 15 min',
      schedule: { type: 'interval', interval: this.config.checkInterval },
      enabled: this.config.enabled,
      handler: async () => { await this.check(); },
      onError: (e) => logger.error('[Proactive] full check error:', e.message),
    };
  }

  createFastHeartbeatTask(): HeartbeatTaskConfig {
    return {
      id: 'builtin:proactive-fast',
      name: 'Proactive Fast Sensor Check',
      description: 'Screen OCR + notifications + battery check every 3 min',
      schedule: { type: 'interval', interval: this.config.fastCheckInterval },
      enabled: this.config.enabled,
      handler: async () => { await this.fastCheck(); },
      onError: (e) => logger.error('[Proactive] fast check error:', e.message),
    };
  }

  private hasActionableScreenSignal(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return false;

    return [
      /验证码|verification code|auth code|otp|code[:：]?\s*\d{4,8}/i,
      /登录|login|支付|payment|确认|confirm|授权|permission/i,
      /错误|失败|异常|error|failed|warning|risk/i,
      /会议|meeting|日程|calendar|提醒|deadline|due/i,
      /快递|外卖|航班|train|delivery|arriv/i,
    ].some((pattern) => pattern.test(normalized));
  }

  private hasMeaningfulContext(snap: EnvironmentSnapshot): boolean {
    return Boolean(
      snap.taskSummary ||
      snap.taskNextSteps.length > 0 ||
      snap.recentMemories.length > 0 ||
      this.hasActionableScreenSignal(snap.screenText)
    );
  }

  private normalizeSuggestionMessage(message: string): string {
    return message
      .replace(/^[>#*`\s]+/g, '')
      .replace(/\s+/g, ' ')

      .trim();
  }

  private buildMessageKey(message: string): string {
    return this.normalizeSuggestionMessage(message)
      .toLowerCase()
      .replace(/[0-9]+/g, '#')
      .replace(/[^\p{L}\p{N}#]+/gu, '')
      .slice(0, 80);
  }

  private isLowValueMessage(message: string): boolean {
    const normalized = this.normalizeSuggestionMessage(message);
    if (!normalized || normalized.length < 8) {
      return true;
    }

    return [
      /^(如果需要|需要我|你可以随时|有需要的话)/,
      /^(看起来|目前|现在)(你)?(可以|适合|建议)/,
      /^(记得|别忘了)(保持|留意|关注)/,
      /^(好的|收到|明白了|知道了)$/,
      /(保持专注|继续加油|注意休息)/,
    ].some((pattern) => pattern.test(normalized));
  }

  private async gatherSnapshot(): Promise<EnvironmentSnapshot> {
    const [screenResult, notifResult, batteryResult, taskResult, memResult] = await Promise.allSettled([
      this.captureScreenText(),
      this.getWatchedNotifications(),
      this.getBattery(),
      this.memoryStore.loadTaskState(),
      this.memoryStore.search('recent task memory', { limit: 4 }),
    ]);

    const screenText = screenResult.status === 'fulfilled' ? screenResult.value : '';
    const rawNotifs = notifResult.status === 'fulfilled' ? notifResult.value : [];
    const battery = batteryResult.status === 'fulfilled' ? batteryResult.value : null;
    const task = taskResult.status === 'fulfilled' ? taskResult.value : null;
    const mems = memResult.status === 'fulfilled' ? memResult.value : [];

    const currentKeys = new Set(rawNotifs.map((n) => n.key));
    for (const key of this.seenNotificationKeys) {
      if (!currentKeys.has(key)) this.seenNotificationKeys.delete(key);
    }

    const newNotifs = rawNotifs.filter((n) => !this.seenNotificationKeys.has(n.key));
    for (const notif of newNotifs) this.seenNotificationKeys.add(notif.key);

    const notifications = newNotifs.map((n) => ({
      app: n.appName || n.packageName.split('.').pop() || n.packageName,
      title: n.title ?? '',
      body: (n.text ?? n.subText ?? '').slice(0, 100),
      key: n.key,
      time: n.time,
    }));

    let screenOn = true;
    try {
      if (typeof device !== 'undefined') screenOn = device.isScreenOn();
    } catch {
      // ignore device read failures
    }

    return {
      screenText,
      screenOn,
      notifications,
      battery,
      taskSummary: task?.taskSummary ?? null,
      taskNextSteps: task?.nextSteps ?? [],
      recentMemories: mems.map((r) => ({
        title: r.entry.title,
        snippet: r.entry.content.slice(0, 120),
      })),
      timestamp: Date.now(),
    };
  }

  private async synthesizeAndDeliver(
    snap: EnvironmentSnapshot,
    forceAI = false,
  ): Promise<string | null> {
    if (!this.aiGenerator) return null;

    const screenHash = snap.screenText.slice(0, 200);
    const hasNewNotifs = snap.notifications.length > 0;
    const screenChanged = screenHash !== this.lastScreenHash;
    const hasLowBattery = Boolean(
      snap.battery &&
      !snap.battery.isCharging &&
      snap.battery.level < this.config.batteryThreshold &&
      snap.battery.level <= this.lastBatteryAlertLevel - 5
    );

    if (hasLowBattery && snap.battery) {
      this.lastBatteryAlertLevel = snap.battery.level;
    }

    const actionableScreen = screenChanged && this.hasActionableScreenSignal(snap.screenText);
    const meaningfulContext = this.hasMeaningfulContext(snap);
    const somethingChanged = hasNewNotifs || actionableScreen || hasLowBattery || (forceAI && meaningfulContext);
    if (!somethingChanged) {
      logger.debug('[Proactive] Nothing actionable changed, skipping AI call');
      return null;
    }

    const now = Date.now();
    if (now - this.lastAICallTime < this.config.minAIInterval && !forceAI) {
      logger.debug('[Proactive] AI rate-limited');
      return null;
    }

    const priority: ProactiveSuggestion['priority'] = hasNewNotifs || hasLowBattery || actionableScreen
      ? 'high'
      : 'medium';

    if (priority !== 'high' && now - this.lastDeliveredAt < this.MIN_DELIVERY_INTERVAL) {
      logger.debug('[Proactive] Delivery interval suppressing non-urgent suggestion');
      return null;
    }

    this.lastScreenHash = screenHash;

    const prompt = this.buildPrompt(snap);
    const rawMessage = await this.callAI(prompt);
    if (!rawMessage) return null;

    const message = this.normalizeSuggestionMessage(rawMessage);
    if (this.isLowValueMessage(message)) {
      logger.debug('[Proactive] Low-value message suppressed');
      return null;
    }

    const msgKey = this.buildMessageKey(message);
    const lastSent = this.recentMessages.get(msgKey);
    if (lastSent && now - lastSent < this.MESSAGE_COOLDOWN) {
      logger.debug('[Proactive] Duplicate message suppressed');
      return null;
    }

    this.recentMessages.set(msgKey, now);
    for (const [key, timestamp] of this.recentMessages) {
      if (now - timestamp > this.MESSAGE_COOLDOWN) this.recentMessages.delete(key);
    }

    this.lastDeliveredAt = now;

    this.emit('proactiveMessage', message);
    this.emit('suggestions', [{
      type: 'insight',
      title: '主动提醒',
      description: message,
      priority,
      timestamp: now,
    }] satisfies ProactiveSuggestion[]);

    logger.info('[Proactive] Delivered proactive message');
    return message;
  }

  private buildPrompt(snap: EnvironmentSnapshot): string {
    const sections: string[] = [];

    sections.push([
      'You are a background assistant on the user\'s Android device.',
      'Decide whether there is something genuinely worth interrupting the user about.',
      'Reply with exactly NO_MESSAGE unless there is a concrete, time-sensitive, actionable suggestion.',
      'Never send generic productivity tips, motivation, greetings, or repeated reminders.',
      'If you do send a message, output exactly one concise Chinese sentence under 50 characters.',
      'The sentence must include a concrete action, object, or reason.',
    ].join('\n'));

    if (snap.screenOn && snap.screenText.trim()) {
      sections.push(`## Current screen (OCR)\n${snap.screenText.slice(0, this.config.maxScreenTextChars)}`);
    } else if (!snap.screenOn) {
      sections.push('## Current screen\nScreen is off');
    }

    if (snap.notifications.length > 0) {
      const lines = snap.notifications.slice(0, 5).map((n) =>
        `- [${n.app}] ${n.title || '(no title)'} ${n.body}`.trim()
      );
      if (snap.notifications.length > 5) {
        lines.push(`- ...and ${snap.notifications.length - 5} more notifications`);
      }
      sections.push(`## New notifications\n${lines.join('\n')}`);
    }

    if (snap.battery) {
      sections.push(`## Device state\nBattery: ${snap.battery.level}%\nCharging: ${snap.battery.isCharging ? 'yes' : 'no'}`);
    }

    if (snap.taskSummary) {
      const nextSteps = snap.taskNextSteps.length > 0
        ? `\nNext steps: ${snap.taskNextSteps.slice(0, 3).join(' | ')}`
        : '';
      sections.push(`## Active task\n${snap.taskSummary.slice(0, 200)}${nextSteps}`);
    }

    if (snap.recentMemories.length > 0) {
      const lines = snap.recentMemories.map((m) => `- ${m.title}: ${m.snippet}`);
      sections.push(`## Recent memories\n${lines.join('\n')}`);
    }

    sections.push([
      'Only interrupt for cases like:',
      '1. A message likely needs a timely reply.',
      '2. The screen shows a verification code, confirmation, failure, or blocked step.',
      '3. A task has a clear next step the user may forget.',
      '4. Battery is low and may affect an ongoing task.',
      '',
      'Suppress messages for cases like:',
      '- vague observations',
      '- repeated reminders',
      '- generic "I can help" statements',
      '- advice without a clear action',
      '',
      'Output exactly one line: either NO_MESSAGE or the Chinese reminder.',
    ].join('\n'));

    return sections.join('\n\n');
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private isAccessibilityScreenshotUnsupportedError(error: unknown): boolean {
    const message = this.getErrorMessage(error).toLowerCase();
    return /android 11 or higher|accessibility screenshot requires|accessibility screenshot .*supported|not supported/.test(message);
  }

  private markAccessibilityScreenshotUnsupported(reason?: unknown): void {
    this.accessibilityScreenshotSupported = false;
    if (this.loggedAccessibilityScreenshotUnsupported) return;

    this.loggedAccessibilityScreenshotUnsupported = true;
    logger.info('[Proactive] Accessibility screenshot unavailable; skipping proactive OCR on this device');
    if (reason) {
      logger.debug('[Proactive] Accessibility screenshot unsupported reason:', reason);
    }
  }

  private async canUseAccessibilityScreenshot(): Promise<boolean> {
    if (this.accessibilityScreenshotSupported !== null) {
      return this.accessibilityScreenshotSupported;
    }

    if (typeof image.isAccessibilityScreenshotSupported !== 'function') {
      this.accessibilityScreenshotSupported = true;
      return true;
    }

    try {
      const supported = await image.isAccessibilityScreenshotSupported();
      this.accessibilityScreenshotSupported = supported;
      if (!supported) {
        this.markAccessibilityScreenshotUnsupported();
      }
      return supported;
    } catch (error) {
      logger.debug('[Proactive] Failed to query accessibility screenshot support:', error);
      this.accessibilityScreenshotSupported = true;
      return true;
    }
  }

  private async captureScreenText(): Promise<string> {
    if (typeof image === 'undefined' || typeof ocr === 'undefined') return '';

    try {
      if (!(await this.canUseAccessibilityScreenshot())) {
        return '';
      }

      if (!ocr.isInitialized()) {
        await ocr.init();
      }

      const bitmap = await image.captureScreenWithAccessibility(0, 4000);
      if (!bitmap) return '';

      const text = await ocr.recognizeText(bitmap, 0.5);
      return (text ?? '')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join('\n');
    } catch (err) {
      if (this.isAccessibilityScreenshotUnsupportedError(err)) {
        this.markAccessibilityScreenshotUnsupported(err);
        return '';
      }
      logger.debug('[Proactive] OCR failed:', err);
      return '';
    }
  }

  private async getWatchedNotifications() {
    if (typeof notificationListener === 'undefined') return [];
    if (!notificationListener.isEnabled || !notificationListener.isConnected) return [];
    if (this.config.watchedPackages.length === 0) return [];

    try {
      const all = await notificationListener.getActiveNotifications();
      const watched = new Set(this.config.watchedPackages);
      return all.filter((n) => watched.has(n.packageName));
    } catch {
      return [];
    }
  }

  private async getBattery(): Promise<{ level: number; isCharging: boolean } | null> {
    if (typeof device === 'undefined') return null;
    try {
      return await device.getBatteryInfo();
    } catch {
      return null;
    }
  }

  private async callAI(prompt: string): Promise<string | null> {
    if (!this.aiGenerator) return null;
    try {
      this.lastAICallTime = Date.now();
      logger.info('[Proactive] Calling AI for environmental analysis');
      const raw = await this.aiGenerator(prompt);
      if (!raw || raw.trim() === 'NO_MESSAGE') return null;
      return raw.trim();
    } catch (err) {
      logger.warn('[Proactive] AI call failed:', err);
      return null;
    }
  }

  private isQuietHours(): boolean {
    const hour = new Date().getHours();
    const { quietHoursStart, quietHoursEnd } = this.config;
    if (quietHoursStart <= quietHoursEnd) return hour >= quietHoursStart && hour < quietHoursEnd;
    return hour >= quietHoursStart || hour < quietHoursEnd;
  }
}
