/**
 * Proactive Behavior — AI-Driven Environmental Intelligence
 *
 * The agent actively perceives its Android environment and synthesizes
 * everything with the AI model to decide what's worth telling the user.
 *
 * Sensor pipeline (runs every N minutes):
 *   Screen OCR → Notifications → Device state → Task state → Memories
 *             ↓ (all fed into one prompt)
 *         AI analysis
 *             ↓
 *   Inject into chat / system notification
 *
 * Design principles:
 * - AI does the heavy lifting — no hand-coded heuristics for "what matters"
 * - Screen content is read via OCR (PP-OCRv3, silent capture)
 * - Only trigger AI call when something has actually changed
 * - Prevent spam via per-topic cooldowns and minimum intervals
 */
import { EventEmitter } from 'events';
import { logger } from '../../utils/logger.js';
const DEFAULT_WATCHED_PACKAGES = [
    'com.tencent.mm', // WeChat
    'com.tencent.mobileqq', // QQ
    'org.telegram.messenger', // Telegram
    'com.whatsapp', // WhatsApp
    'com.android.mms', // SMS
    'com.android.phone', // Phone
];
const DEFAULT_CONFIG = {
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
// ─── Class ───────────────────────────────────────────────────────────────────
export class ProactiveBehavior extends EventEmitter {
    constructor(config, memoryStore, getActiveSessions) {
        super();
        // AI generator provided by AgentManager
        this.aiGenerator = null;
        // Dedup state
        this.seenNotificationKeys = new Set();
        this.lastScreenHash = '';
        this.lastAICallTime = 0;
        this.lastBatteryAlertLevel = 100;
        // Per-topic cooldown to prevent repeated identical messages
        this.recentMessages = new Map();
        this.MESSAGE_COOLDOWN = 30 * 60 * 1000; // 30 min
        this.config = { ...DEFAULT_CONFIG, ...config };
        this.memoryStore = memoryStore;
        this.getActiveSessions = getActiveSessions;
    }
    setAIInsightGenerator(generator) {
        this.aiGenerator = generator;
        logger.info('[Proactive] AI generator registered');
    }
    // ─── Public API ──────────────────────────────────────────────────────────
    /**
     * Fast sensor check (every 3 min).
     * Gathers environment, runs AI synthesis if something changed.
     */
    async fastCheck() {
        if (!this.config.enabled || this.isQuietHours())
            return;
        try {
            const snap = await this.gatherSnapshot();
            await this.synthesizeAndDeliver(snap);
        }
        catch (err) {
            logger.warn('[Proactive] fastCheck error:', err);
        }
    }
    /**
     * Full check (every 15 min) — same as fast but always includes memory analysis
     * even if screen hasn't changed.
     */
    async check() {
        if (!this.config.enabled || this.isQuietHours())
            return [];
        try {
            const snap = await this.gatherSnapshot();
            const msg = await this.synthesizeAndDeliver(snap, /* forceAI */ true);
            if (!msg)
                return [];
            return [{
                    type: 'insight',
                    title: '主动提醒',
                    description: msg,
                    priority: 'medium',
                    timestamp: Date.now(),
                }];
        }
        catch (err) {
            logger.warn('[Proactive] check error:', err);
            return [];
        }
    }
    /**
     * After task completion — quick AI summary based on what happened.
     */
    async analyzeTaskCompletion(task, result) {
        if (!this.config.enabled)
            return [];
        const prompt = `## 任务完成通知\n` +
            `任务："${task.slice(0, 100)}"\n` +
            `结果：${result === 'success' ? '✅ 成功' : '❌ 失败'}\n\n` +
            `请用一句话告知用户任务结果，并根据结果给出下一步建议（如果失败，建议排查方向）。` +
            `如果结果对用户没有实际价值，回复 NO_MESSAGE。`;
        const msg = await this.callAI(prompt);
        if (!msg)
            return [];
        const suggestion = {
            type: result === 'success' ? 'follow-up' : 'warning',
            title: result === 'success' ? '任务完成' : '任务失败',
            description: msg,
            priority: result === 'success' ? 'low' : 'medium',
            timestamp: Date.now(),
        };
        this.emit('suggestions', [suggestion]);
        return [suggestion];
    }
    // ─── Heartbeat factories ─────────────────────────────────────────────────
    createHeartbeatTask() {
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
    createFastHeartbeatTask() {
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
    // ─── Core: gather → synthesize → deliver ─────────────────────────────────
    /**
     * Collect all sensors in parallel.
     */
    async gatherSnapshot() {
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
        // Sync the seen-notification set: remove dismissed ones
        const currentKeys = new Set(rawNotifs.map(n => n.key));
        for (const k of this.seenNotificationKeys) {
            if (!currentKeys.has(k))
                this.seenNotificationKeys.delete(k);
        }
        // Only surface NEW notifications
        const newNotifs = rawNotifs.filter(n => !this.seenNotificationKeys.has(n.key));
        for (const n of newNotifs)
            this.seenNotificationKeys.add(n.key);
        const notifications = newNotifs.map(n => ({
            app: n.appName || n.packageName.split('.').pop() || n.packageName,
            title: n.title ?? '',
            body: (n.text ?? n.subText ?? '').slice(0, 100),
            key: n.key,
            time: n.time,
        }));
        let screenOn = true;
        try {
            if (typeof device !== 'undefined')
                screenOn = device.isScreenOn();
        }
        catch { /* ignore */ }
        return {
            screenText,
            screenOn,
            notifications,
            battery,
            taskSummary: task?.taskSummary ?? null,
            taskNextSteps: task?.nextSteps ?? [],
            recentMemories: mems.map(r => ({
                title: r.entry.title,
                snippet: r.entry.content.slice(0, 120),
            })),
            timestamp: Date.now(),
        };
    }
    /**
     * Decide whether to run AI, build prompt, call AI, deliver result.
     * Returns the message delivered (or null).
     */
    async synthesizeAndDeliver(snap, forceAI = false) {
        if (!this.aiGenerator)
            return null;
        // Determine if something changed since last check
        const screenHash = snap.screenText.slice(0, 200);
        const hasNewNotifs = snap.notifications.length > 0;
        const screenChanged = screenHash !== this.lastScreenHash;
        const hasLowBattery = snap.battery && !snap.battery.isCharging
            && snap.battery.level < this.config.batteryThreshold
            && snap.battery.level <= this.lastBatteryAlertLevel - 5;
        if (hasLowBattery && snap.battery) {
            this.lastBatteryAlertLevel = snap.battery.level;
        }
        const somethingChanged = hasNewNotifs || screenChanged || hasLowBattery || forceAI;
        if (!somethingChanged) {
            logger.debug('[Proactive] Nothing changed, skipping AI call');
            return null;
        }
        // Rate-limit AI calls
        const now = Date.now();
        if (now - this.lastAICallTime < this.config.minAIInterval && !forceAI) {
            logger.debug('[Proactive] AI rate-limited');
            return null;
        }
        this.lastScreenHash = screenHash;
        const prompt = this.buildPrompt(snap);
        const msg = await this.callAI(prompt);
        if (!msg)
            return null;
        // Dedup: don't send nearly identical messages within cooldown
        const msgKey = msg.slice(0, 60);
        if (this.recentMessages.has(msgKey)) {
            const lastSent = this.recentMessages.get(msgKey);
            if (now - lastSent < this.MESSAGE_COOLDOWN) {
                logger.debug('[Proactive] Duplicate message suppressed');
                return null;
            }
        }
        this.recentMessages.set(msgKey, now);
        // Clean expired cooldowns
        for (const [k, t] of this.recentMessages) {
            if (now - t > this.MESSAGE_COOLDOWN)
                this.recentMessages.delete(k);
        }
        // Deliver
        this.emit('proactiveMessage', msg);
        this.emit('suggestions', [{
                type: 'insight',
                title: '主动提醒',
                description: msg,
                priority: hasNewNotifs || hasLowBattery ? 'high' : 'medium',
                timestamp: now,
            }]);
        logger.info('[Proactive] Delivered proactive message');
        return msg;
    }
    // ─── Prompt builder ───────────────────────────────────────────────────────
    buildPrompt(snap) {
        const sections = [];
        sections.push('你是用户Android手机上的智能助手，正在后台主动感知设备环境。\n' +
            '请根据以下实时信息，判断是否有需要主动告知用户的内容。\n' +
            '**重要规则**：只在有真正有用、用户希望知道的信息时才发送消息；如无必要，回复 NO_MESSAGE。\n');
        // Screen
        if (snap.screenOn && snap.screenText.trim()) {
            const text = snap.screenText.slice(0, this.config.maxScreenTextChars);
            sections.push(`## 当前屏幕内容（OCR）\n${text}`);
        }
        else if (!snap.screenOn) {
            sections.push('## 当前屏幕\n屏幕已关闭（息屏状态）');
        }
        // Notifications
        if (snap.notifications.length > 0) {
            const lines = snap.notifications.slice(0, 5).map(n => `• [${n.app}]${n.title ? ` ${n.title}：` : ' '}${n.body}`);
            if (snap.notifications.length > 5)
                lines.push(`  …及其他 ${snap.notifications.length - 5} 条`);
            sections.push(`## 新收到的消息通知\n${lines.join('\n')}`);
        }
        // Battery
        if (snap.battery) {
            const status = snap.battery.isCharging ? '充电中' : '未充电';
            sections.push(`## 设备状态\n电量：${snap.battery.level}%（${status}）`);
        }
        // Current task
        if (snap.taskSummary) {
            const steps = snap.taskNextSteps.length > 0
                ? `\n待处理：${snap.taskNextSteps.slice(0, 3).join('、')}`
                : '';
            sections.push(`## 当前任务\n${snap.taskSummary.slice(0, 200)}${steps}`);
        }
        // Recent memories
        if (snap.recentMemories.length > 0) {
            const lines = snap.recentMemories.map(m => `• ${m.title}：${m.snippet}`);
            sections.push(`## 近期记忆摘要\n${lines.join('\n')}`);
        }
        sections.push('---\n' +
            '## 分析要点\n' +
            '请综合以上信息，考虑以下几类情况：\n' +
            '1. **消息回复**：有未读消息需要用户关注或回复？\n' +
            '2. **屏幕内容**：屏幕上有验证码、弹窗、需要操作的内容？\n' +
            '3. **任务进展**：当前任务有可以继续的步骤，或需要总结的进展？\n' +
            '4. **设备状态**：低电量或其他需要用户注意的设备状态？\n' +
            '5. **主动建议**：根据用户的历史习惯和当前情境，有什么实用的主动建议？\n\n' +
            '如果有值得通知的内容，请输出一条**简洁、直接、有行动建议**的中文消息（不超过150字）。\n' +
            '消息要像一个贴心助手说话的语气，而不是系统通知。\n' +
            '如果没有值得通知的内容，只输出：NO_MESSAGE');
        return sections.join('\n\n');
    }
    // ─── Sensors ──────────────────────────────────────────────────────────────
    async captureScreenText() {
        if (typeof image === 'undefined' || typeof ocr === 'undefined')
            return '';
        try {
            // Initialize OCR if needed (PP-OCRv3)
            if (!ocr.isInitialized()) {
                await ocr.init();
            }
            const bitmap = await image.captureScreenWithAccessibility(0, 4000);
            if (!bitmap)
                return '';
            const text = await ocr.recognizeText(bitmap, 0.5);
            // Normalize: collapse blank lines, trim
            return (text ?? '')
                .split('\n')
                .map(l => l.trim())
                .filter(l => l.length > 0)
                .join('\n');
        }
        catch (err) {
            logger.debug('[Proactive] OCR failed:', err);
            return '';
        }
    }
    async getWatchedNotifications() {
        if (typeof notificationListener === 'undefined')
            return [];
        if (!notificationListener.isEnabled || !notificationListener.isConnected)
            return [];
        if (this.config.watchedPackages.length === 0)
            return [];
        try {
            const all = await notificationListener.getActiveNotifications();
            const watched = new Set(this.config.watchedPackages);
            return all.filter(n => watched.has(n.packageName));
        }
        catch {
            return [];
        }
    }
    async getBattery() {
        if (typeof device === 'undefined')
            return null;
        try {
            return await device.getBatteryInfo();
        }
        catch {
            return null;
        }
    }
    // ─── AI call ──────────────────────────────────────────────────────────────
    async callAI(prompt) {
        if (!this.aiGenerator)
            return null;
        try {
            this.lastAICallTime = Date.now();
            logger.info('[Proactive] Calling AI for environmental analysis…');
            const raw = await this.aiGenerator(prompt);
            if (!raw || raw.trim() === 'NO_MESSAGE')
                return null;
            return raw.trim();
        }
        catch (err) {
            logger.warn('[Proactive] AI call failed:', err);
            return null;
        }
    }
    // ─── Utilities ────────────────────────────────────────────────────────────
    isQuietHours() {
        const hour = new Date().getHours();
        const { quietHoursStart, quietHoursEnd } = this.config;
        if (quietHoursStart <= quietHoursEnd)
            return hour >= quietHoursStart && hour < quietHoursEnd;
        return hour >= quietHoursStart || hour < quietHoursEnd;
    }
}
