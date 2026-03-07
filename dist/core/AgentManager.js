/**
 * Agent Manager - Core orchestrator for Anode ClawdBot
 *
 * Manages:
 * - Session lifecycle
 * - Conversation flow
 * - Model API integration
 * - Tool execution (Phase 2)
 * - Context management
 */
import { Session } from './Session.js';
import { FileSessionStorage } from './FileSessionStorage.js';
import { ModelAPI, ModelAPIError, detectModelTokenLimit } from './ModelAPI.js';
import { generateSessionId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import { ToolRegistry, ToolExecutor, builtinTools, setMemorySystem, setSubAgentCoordinator } from '../tools/index.js';
import { LaneManager } from './lane/LaneManager.js';
import { ContextWindowGuard } from './context/ContextWindowGuard.js';
import { setCompressionModelAPI } from './context/CompressionStrategy.js';
import { ApprovalManager } from './safety/ApprovalManager.js';
import { HeartbeatManager, createStatusCheckTask, createCleanupTask } from './heartbeat/index.js';
import { SkillManager, builtinSkills } from '../skills/index.js';
import { SkillRetrieval } from '../skills/retrieval/SkillRetrieval.js';
import { PromptBuilder } from './prompts/PromptBuilder.js';
import { SystemPromptBuilder } from './prompts/SystemPromptBuilder.js';
import { MemoryStore } from './memory/MemoryStore.js';
import { ActivityLog } from './memory/ActivityLog.js';
import { ProactiveBehavior } from './proactive/ProactiveBehavior.js';
import { SocialAdapterManager, TelegramAdapter, QQAdapter, QQGuildAdapter, WeChatAdapter, DiscordAdapter, FeishuAdapter, DingTalkAdapter, } from '../social/index.js';
import { ToolUsageStrategy } from '../tools/ToolUsageStrategy.js';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { PluginLoader } from '../plugins/PluginLoader.js';
import { CalculatorPlugin, TranslatorPlugin, WeatherPlugin } from '../plugins/index.js';
import { SubAgentCoordinator } from './subagents/SubAgentCoordinator.js';
import { SnapshotGenerator } from './snapshot/SnapshotGenerator.js';
import { performanceMonitor } from '../utils/performance.js';
import { StreamingHandler } from './streaming/StreamingHandler.js';
import { getToolHooksManager } from './tools/ToolHooks.js';
import { EventBus } from './EventBus.js';
/**
 * Repair orphaned tool_use blocks in message history.
 *
 * When a streaming response is interrupted after tool_use blocks are emitted
 * but before tool_results are saved, the conversation history becomes corrupt
 * and every subsequent API call fails with:
 *   "An assistant message with tool_calls must be followed by tool messages"
 *
 * This function finds such orphaned blocks and inserts synthetic error
 * tool_result messages so the history remains valid.
 */
function sanitizeMessages(messages) {
    const result = [];
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        result.push(msg);
        if (msg.role !== 'assistant')
            continue;
        // Collect tool call ids from this assistant message.
        // Two storage formats exist:
        //   1. Anthropic format  — content blocks with { type: 'tool_use', id }
        //   2. OpenAI/streaming  — metadata.toolCalls array with { id }
        const toolUseIds = [];
        if (Array.isArray(msg.content)) {
            for (const block of msg.content) {
                if (block.type === 'tool_use' && block.id) {
                    toolUseIds.push(block.id);
                }
            }
        }
        const metaToolCalls = msg.metadata?.toolCalls;
        if (Array.isArray(metaToolCalls)) {
            for (const tc of metaToolCalls) {
                if (tc.id && !toolUseIds.includes(tc.id)) {
                    toolUseIds.push(tc.id);
                }
            }
        }
        if (toolUseIds.length === 0)
            continue;
        // Check what tool ids are covered by subsequent messages.
        const coveredIds = new Set();
        // Anthropic format: next user message with tool_result content blocks
        const next = messages[i + 1];
        if (next && next.role === 'user' && Array.isArray(next.content)) {
            for (const block of next.content) {
                if (block.type === 'tool_result' && block.tool_use_id) {
                    coveredIds.add(block.tool_use_id);
                }
            }
        }
        // OpenAI/streaming format: consecutive role:'tool' messages with metadata.tool_call_id
        let j = i + 1;
        while (j < messages.length && messages[j].role === 'tool') {
            const toolCallId = messages[j].metadata?.tool_call_id;
            if (toolCallId)
                coveredIds.add(toolCallId);
            j++;
        }
        // Insert synthetic role:'tool' messages for uncovered ids.
        // Using role:'tool' works for both converters:
        //   - convertMessagesToAnthropicFormat → wraps in user message with tool_result block
        //   - convertMessagesToOpenAIFormat    → keeps as { role:'tool', tool_call_id }
        const missing = toolUseIds.filter((id) => !coveredIds.has(id));
        if (missing.length > 0) {
            logger.warn(`[sanitizeMessages] Inserting ${missing.length} synthetic tool_result(s) for orphaned tool_use blocks`);
            for (const id of missing) {
                result.push({
                    role: 'tool',
                    content: 'Tool execution was interrupted.',
                    metadata: {
                        tool_call_id: id,
                        tool_name: 'unknown',
                        is_error: true,
                    },
                });
            }
        }
    }
    return result;
}
/**
 * Agent Manager Class
 *
 * The main interface for interacting with the AI agent
 */
export class AgentManager {
    constructor(config) {
        /** Maps "platform:chatId" → sessionId for social message routing */
        this.socialSessions = new Map();
        this.config = config;
        this.sessions = new Map();
        // Initialize ModelAPI
        this.modelAPI = new ModelAPI(config.model.provider, config.model.apiKey, config.model.baseURL);
        // Enable AI-powered context compression
        setCompressionModelAPI(this.modelAPI, config.agent.summaryModel);
        // Initialize Tool System
        this.toolRegistry = new ToolRegistry();
        this.toolExecutor = new ToolExecutor(this.toolRegistry);
        // Initialize Lane Manager
        this.laneManager = new LaneManager();
        // Initialize Context Window Guard
        // Use agent.contextWindow (model's input capacity), NOT model.maxTokens (response output limit)
        let contextWindowTokens = config.agent.contextWindow || 200000;
        // 🔑 Auto-detect model-specific token limit
        const detectedLimit = detectModelTokenLimit(config.model.model);
        if (detectedLimit !== 128000) { // Only use detected limit if it's not the default
            logger.info(`[AgentManager] Detected model token limit: ${detectedLimit} (model: ${config.model.model})`);
            contextWindowTokens = Math.min(contextWindowTokens, detectedLimit);
        }
        // Sanity check: contextWindow should be the model's input context, not the output maxTokens
        // Common misconfiguration: setting contextWindow to the same value as model.maxTokens (e.g. 4096)
        if (contextWindowTokens <= 10000) {
            logger.warn(`[AgentManager] contextWindow is set to ${contextWindowTokens}, which seems too small. ` +
                `This should be the model's INPUT context capacity (e.g. 200000 for Claude), NOT the output maxTokens. ` +
                `Falling back to ${detectedLimit}. Check your config agent.contextWindow setting.`);
            contextWindowTokens = detectedLimit;
        }
        logger.info(`[AgentManager] Context window guard: maxTokens=${contextWindowTokens}, model.maxTokens(output)=${config.model.maxTokens}`);
        this.contextGuard = new ContextWindowGuard({
            maxTokens: contextWindowTokens,
            warningThreshold: 0.7,
            compressionThreshold: 0.85,
            minMessagesToKeep: 10,
            compressionRatio: 0.5,
        });
        // Initialize Approval Manager (use config.safety if available)
        const safetyConfig = config.safety || {};
        this.approvalManager = new ApprovalManager({
            enabled: safetyConfig.enabled !== false,
            requireApprovalFor: safetyConfig.requireApprovalFor || ['medium', 'high', 'critical'],
            trustMode: safetyConfig.trustMode || 'moderate',
            approvalTimeout: safetyConfig.approvalTimeout || 60000,
            approvalChatId: safetyConfig.approvalChatId,
            approvalPlatform: safetyConfig.approvalPlatform || 'telegram',
        });
        // Initialize Heartbeat Manager
        this.heartbeatManager = new HeartbeatManager({
            minInterval: 60_000,
            maxTasks: 50,
        });
        // Initialize Skill Manager
        this.skillManager = new SkillManager(this.toolRegistry, this.toolExecutor);
        // Initialize Skill Retrieval System
        this.skillRetrieval = new SkillRetrieval({
            workspaceDir: process.cwd(),
            config: this.config,
        });
        // Load skills in background
        this.skillRetrieval.refresh().then(() => {
            const skillsPrompt = this.skillRetrieval.buildSkillsPrompt();
            if (skillsPrompt) {
                this.promptBuilder.addSection('skills', skillsPrompt, 85);
            }
        }).catch(err => {
            logger.error('[AgentManager] Skill retrieval failed:', err);
        });
        // Initialize Identity/Prompt System
        this.promptBuilder = new PromptBuilder({
            identityFile: './prompts/IDENTITY.md',
            soulFile: './prompts/SOUL.md',
            agentsFile: './prompts/AGENTS.md',
            userFile: './prompts/USER.md',
            basePrompt: config.agent.defaultSystemPrompt,
            enableHotReload: false,
            reloadInterval: 60000,
        });
        // Register built-in tools
        this.registerBuiltinTools();
        // Register built-in skills
        this.registerBuiltinSkills();
        // Initialize prompt builder (async - load identity files)
        this.promptBuilder.initialize().catch(err => {
            logger.warn('[AgentManager] PromptBuilder initialization failed (identity files may not exist yet):', err);
        });
        // Initialize Memory Store (3-layer memory system)
        const memoryDir = config.storage.memoryDir || `${config.storage.sessionDir}/memories`;
        this.memoryStore = new MemoryStore({ memoryDir });
        this.memoryStore.initialize().catch(err => {
            logger.error('[AgentManager] MemoryStore initialization failed:', err);
        });
        this.activityLog = new ActivityLog(memoryDir);
        this.activityLog.initialize().catch(() => { });
        // Inject into MemoryTools
        setMemorySystem(this.memoryStore);
        // Initialize Proactive Behavior
        this.proactiveBehavior = new ProactiveBehavior(this.config.proactive ?? undefined, this.memoryStore, () => this.getActiveSessions());
        // Register AI insight generator for proactive behavior
        this.proactiveBehavior.setAIInsightGenerator(async (context) => {
            try {
                const response = await this.modelAPI.createMessage({
                    model: this.config.model.model,
                    messages: [
                        {
                            id: 'proactive-insight',
                            role: 'user',
                            content: context,
                            timestamp: Date.now(),
                            parentId: null,
                            children: [],
                        },
                    ],
                    maxTokens: 200,
                    temperature: 0.7,
                    systemPrompt: `You are an AI assistant analyzing user activity patterns.
Based on the activity summary provided, generate ONE brief, actionable insight or suggestion.
Focus on being helpful - suggest optimizations, remind about pending tasks, or offer assistance.
Keep your response under 200 characters. Be friendly and concise.
If there's nothing noteworthy, respond with an empty string.`,
                });
                return response.content;
            }
            catch (err) {
                logger.debug('[Proactive] AI insight request failed:', err);
                return null;
            }
        });
        // Initialize Social Manager
        this.socialManager = new SocialAdapterManager();
        this.registerSocialAdapters();
        this.proactiveBehavior.on('suggestions', async (suggestions) => {
            for (const s of suggestions) {
                logger.info(`[Proactive] [${s.priority}] ${s.title}: ${s.description.slice(0, 80)}`);
            }
            // System notification for high-priority items only (batch into one)
            const urgent = suggestions.filter(s => s.priority === 'high');
            if (urgent.length > 0 && typeof notification !== 'undefined') {
                try {
                    const title = urgent.length === 1 ? `🤖 ${urgent[0].title}` : `🤖 ${urgent.length} 条重要提醒`;
                    const body = urgent.map(s => s.description).join('\n').slice(0, 200);
                    await notification.show(title, body);
                }
                catch (e) {
                    logger.debug('[Proactive] System notification failed:', e);
                }
            }
        });
        // AI-synthesized proactive message → inject directly into active chat session
        this.proactiveBehavior.on('proactiveMessage', async (msg) => {
            await this.injectProactiveMessage(msg);
        });
        // Register default heartbeat tasks (now includes archival + proactive)
        this.registerDefaultHeartbeatTasks();
        // Start heartbeat
        this.heartbeatManager.start();
        // Initialize Plugin System
        this.pluginRegistry = new PluginRegistry(config.agent);
        this.pluginLoader = new PluginLoader('./plugins', {
            exists: async (p) => { return typeof file !== 'undefined' && file.exists ? file.exists(p) : false; },
            read: async (p, _enc) => { if (typeof file !== 'undefined' && file.readText) {
                return file.readText(p, 'UTF-8');
            } throw new Error('Anode file API not available'); },
            list: async (p) => { if (typeof file !== 'undefined' && file.listFiles) {
                const entries = await file.listFiles(p);
                return entries.map(e => ({ name: e.name, type: (e.isDirectory ? 'directory' : 'file') }));
            } throw new Error('Anode file API not available'); },
            write: async (p, content) => { if (typeof file !== 'undefined' && file.writeText) {
                await file.writeText(p, content, 'UTF-8');
                return;
            } throw new Error('Anode file API not available'); },
            delete: async (p) => { if (typeof file !== 'undefined' && file.delete) {
                await file.delete(p);
                return;
            } throw new Error('Anode file API not available'); },
            ensureDir: async (p) => { try {
                if (typeof file !== 'undefined' && file.createDirectory) {
                    await file.createDirectory(p);
                }
            }
            catch { /* may already exist */ } },
        });
        this.loadPlugins();
        // Register built-in plugins (Calculator, Translator, Weather)
        this.registerBuiltinPlugins().catch(err => {
            logger.warn('[AgentManager] Failed to register builtin plugins:', err);
        });
        // Initialize Sub-Agent Coordinator
        this.subAgentCoordinator = new SubAgentCoordinator(config.model.apiKey, config.model.baseURL);
        setSubAgentCoordinator(this.subAgentCoordinator);
        // Initialize Snapshot Generator
        this.snapshotGenerator = new SnapshotGenerator();
        // Initialize Streaming Handler
        this.streamingHandler = new StreamingHandler();
        // Initialize EventBus
        this.eventBus = EventBus.getInstance();
        // Initialize Tool Hooks Manager
        this.toolHooksManager = getToolHooksManager();
        this.registerDefaultToolHooks();
        // Register EventBus consumers
        this.registerEventBusConsumers();
        // Initialize Social - (Already initialized above)
        this.initializeSocial();
        // Connect social adapter to approval manager for Telegram approval flow
        this.approvalManager.setSocialAdapter(this.socialManager);
        logger.info('AgentManager initialized: tools, lanes, context, approval, heartbeat, skills, identity, social, memory, dailylog, semantic, proactive, plugins, subagents, snapshot');
    }
    /**
     * Register all built-in tools
     */
    registerBuiltinTools() {
        for (const tool of builtinTools) {
            this.toolRegistry.register(tool, 'builtin', true);
        }
        logger.info(`Registered ${builtinTools.length} built-in tools`);
    }
    /**
     * Register all built-in skills
     */
    registerBuiltinSkills() {
        for (const skill of builtinSkills) {
            this.skillManager.register(skill, 'builtin');
        }
        logger.info(`Registered ${builtinSkills.length} built-in skills`);
    }
    /**
     * Register default heartbeat tasks
     */
    registerDefaultHeartbeatTasks() {
        try {
            // Status check every 30 minutes
            this.heartbeatManager.register(createStatusCheckTask({
                batteryThreshold: 20,
                interval: 30 * 60 * 1000,
            }));
            // Data cleanup weekly
            this.heartbeatManager.register(createCleanupTask({
                sessionsDir: this.config.storage.sessionDir,
            }));
            // Daily log archival removed — replaced by context_checkpoint tool
            // Proactive behavior: full 15-min check + fast 2-min sensor check
            this.heartbeatManager.register(this.proactiveBehavior.createHeartbeatTask());
            this.heartbeatManager.register(this.proactiveBehavior.createFastHeartbeatTask());
            logger.info('Registered default heartbeat tasks');
        }
        catch (error) {
            logger.warn('Failed to register some heartbeat tasks:', error);
        }
    }
    /**
     * Load plugins from filesystem and register their tools
     */
    loadPlugins() {
        this.pluginLoader.loadAll().then(async (results) => {
            let loaded = 0;
            for (const [id, result] of results) {
                if (result.success && result.plugin) {
                    try {
                        await this.pluginRegistry.register(result.plugin);
                        // Register plugin tools into main tool registry
                        const pluginTools = result.plugin.getTools();
                        for (const tool of pluginTools) {
                            this.toolRegistry.register(tool, 'plugin', true);
                        }
                        loaded++;
                    }
                    catch (err) {
                        logger.error(`[Plugins] Failed to register plugin ${id}:`, err);
                    }
                }
            }
            logger.info(`[Plugins] ${loaded} plugins loaded and registered`);
        }).catch(err => {
            logger.warn('[Plugins] Plugin loading failed (plugins dir may not exist):', err);
        });
    }
    /**
     * Register built-in plugins (Calculator, Translator, Weather)
     * These are hardcoded plugins that don't need to be loaded from filesystem.
     */
    async registerBuiltinPlugins() {
        const builtinPlugins = [
            new CalculatorPlugin(),
            new TranslatorPlugin(),
            new WeatherPlugin(),
        ];
        let registered = 0;
        for (const plugin of builtinPlugins) {
            try {
                await this.pluginRegistry.register(plugin);
                // Register plugin tools into main tool registry
                const pluginTools = plugin.getTools();
                for (const tool of pluginTools) {
                    this.toolRegistry.register(tool, 'plugin', true);
                }
                registered++;
                logger.info(`[Plugins] Registered builtin plugin: ${plugin.metadata.id}`);
            }
            catch (err) {
                logger.error(`[Plugins] Failed to register builtin plugin ${plugin.metadata.id}:`, err);
            }
        }
        logger.info(`[Plugins] ${registered} builtin plugins registered`);
    }
    /**
     * Create a new session
     *
     * @param options - Session creation options
     * @returns Created session
     */
    async createSession(options = {}) {
        const sessionId = options.sessionId || generateSessionId();
        const model = options.model || this.config.model.model;
        logger.info(`Creating session: ${sessionId}`);
        // Build system prompt from identity files + default prompt
        let systemPrompt;
        if (options.systemPrompt) {
            // Explicit system prompt overrides identity system
            systemPrompt = options.systemPrompt;
        }
        else {
            try {
                // First get base prompt from PromptBuilder (IDENTITY.md, SOUL.md, etc.)
                const basePrompt = await this.promptBuilder.buildPrompt({
                    sessionId,
                    currentTime: new Date().toISOString(),
                    Current_Time: new Date().toISOString(),
                    Session_ID: sessionId,
                });
                // Build comprehensive system prompt with SystemPromptBuilder
                const allTools = this.toolRegistry.getAll();
                const toolSummaries = {};
                for (const tool of allTools) {
                    toolSummaries[tool.name] = tool.description;
                }
                // Get skill info
                const skillList = this.skillManager.list();
                const skillNames = skillList.map(s => s.id);
                const skillDescriptions = {};
                for (const skillInfo of skillList) {
                    skillDescriptions[skillInfo.id] = skillInfo.description;
                }
                // Build runtime info
                const runtimeInfo = {
                    agentName: 'ClawdBot',
                    agentVersion: '1.0.9',
                    platform: 'android',
                    model: model,
                    timestamp: Date.now(),
                    sessionId,
                };
                // Build full system prompt params
                const promptParams = {
                    workspaceDir: process.cwd(),
                    tools: allTools,
                    toolSummaries,
                    skills: {
                        skillNames,
                        skillDescriptions,
                        enabled: skillNames.length > 0,
                    },
                    memory: {
                        enabled: true,
                        maxMemories: 10,
                    },
                    runtime: runtimeInfo,
                    customIdentity: basePrompt.fullPrompt, // Use loaded identity files as base
                };
                const systemPromptBuilder = new SystemPromptBuilder(promptParams);
                const builtSystemPrompt = systemPromptBuilder.build();
                systemPrompt = builtSystemPrompt.prompt;
                logger.info(`[AgentManager] Built dynamic system prompt: ${builtSystemPrompt.estimatedTokens} tokens, ${builtSystemPrompt.sections.length} sections`);
            }
            catch (err) {
                logger.warn('[AgentManager] Dynamic prompt build failed, using fallback:', err);
                // Fallback to default if identity system fails
                systemPrompt = this.config.agent.defaultSystemPrompt;
            }
        }
        // Create storage
        const sessionPath = `${this.config.storage.sessionDir}/${sessionId}.json`;
        const storage = new FileSessionStorage(sessionPath);
        // Create session
        const session = new Session({
            sessionId,
            systemPrompt,
            model,
            storage,
        });
        // Initialize (load if exists)
        await session.initialize();
        // Store in memory
        this.sessions.set(sessionId, session);
        logger.info(`Session created: ${sessionId}`);
        return session;
    }
    /**
     * Load an existing session
     *
     * @param sessionId - Session ID to load
     * @returns Loaded session
     * @throws Error if session not found
     */
    async loadSession(sessionId) {
        // Check if already loaded
        if (this.sessions.has(sessionId)) {
            logger.debug(`Session already loaded: ${sessionId}`);
            return this.sessions.get(sessionId);
        }
        logger.info(`Loading session: ${sessionId}`);
        // Create storage and session
        const sessionPath = `${this.config.storage.sessionDir}/${sessionId}.json`;
        const storage = new FileSessionStorage(sessionPath);
        // Check if session exists
        const exists = await storage.exists();
        if (!exists) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        // Create and initialize session
        const session = new Session({
            sessionId,
            systemPrompt: '', // Will be loaded from storage
            model: '',
            storage,
        });
        await session.initialize();
        // Store in memory
        this.sessions.set(sessionId, session);
        logger.info(`Session loaded: ${sessionId}`);
        return session;
    }
    /**
     * Get a session by ID
     *
     * @param sessionId - Session ID
     * @returns Session or undefined
     */
    getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
    /**
     * Delete a session
     *
     * @param sessionId - Session ID to delete
     */
    async deleteSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (session) {
            // Trigger session memory hook
            try {
                const history = session.buildContext();
                // Filter out system prompt for summary
                const conversation = history.filter(m => m.role !== 'system');
                // Log session end to activity log
                await this.activityLog.logSession(sessionId, 'end', `${conversation.length} messages`);
            }
            catch (error) {
                logger.error(`[AgentManager] Failed to log session end for ${sessionId}`, error);
            }
            await session.delete();
            this.sessions.delete(sessionId);
            logger.info(`Session deleted: ${sessionId}`);
        }
    }
    /**
     * Send a message to the agent (using lane for serial execution)
     *
     * @param sessionId - Session ID
     * @param message - User message
     * @returns Agent response
     */
    async sendMessage(sessionId, message, attachments) {
        // Use lane system to serialize execution per session
        return this.laneManager.enqueue(sessionId, {
            id: `msg-${Date.now()}`,
            name: `sendMessage:${sessionId}`,
            priority: 'normal',
            timeout: 0, // No lane-level timeout for agent tasks (agents may run many tool iterations)
            execute: async () => {
                return this.processSendMessage(sessionId, message, attachments);
            },
        });
    }
    /**
     * Send a message with streaming support
     *
     * @param sessionId - Session ID
     * @param message - User message
     * @param onStream - Callback for streaming updates (delta, accumulated, done)
     * @returns Agent response
     */
    async sendMessageWithStreaming(sessionId, message, onStream, attachments) {
        // Use lane system to serialize execution per session
        return this.laneManager.enqueue(sessionId, {
            id: `msg-${Date.now()}`,
            name: `sendMessage:${sessionId}`,
            priority: 'normal',
            timeout: 0, // No lane-level timeout for agent tasks
            execute: async () => {
                return this.processSendMessageWithStreaming(sessionId, message, onStream, attachments);
            },
        });
    }
    /**
     * Internal method to process send message (called by lane)
     */
    async processSendMessage(sessionId, message, attachments) {
        const requestTimer = performanceMonitor.startTimer(`request:${sessionId}`);
        try {
            // Get or load session
            let session = this.sessions.get(sessionId);
            if (!session) {
                session = await this.loadSession(sessionId);
            }
            logger.info(`Processing message for session: ${sessionId}`);
            // 🔑 关键修复：在添加用户消息**之前**检查上下文窗口
            // 预估添加用户消息后的 token 数
            const userContent = await this.buildUserContent(message, attachments);
            const tempUserMessage = {
                id: generateId(), // 临时 ID，实际消息添加时会重新生成
                role: 'user',
                content: userContent,
                timestamp: Date.now(),
                parentId: null,
                children: [],
            };
            const currentMessages = session.buildContext();
            const messagesWithUser = [...currentMessages, tempUserMessage];
            const contextStatus = this.contextGuard.checkStatus(messagesWithUser);
            // 如果添加用户消息后会触发压缩，先压缩再添加
            if (contextStatus.needsCompression) {
                logger.info(`[AgentManager] Auto-compressing context BEFORE adding user message: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`);
                // Perform auto-compression on current messages
                const compressedMessages = await this.contextGuard.autoCompress(currentMessages);
                // Update session with compressed messages
                session.replaceHistory(compressedMessages);
                logger.info(`[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`);
                // Emit session:compress event
                this.eventBus.emit('session:compress', {
                    sessionId,
                    beforeCount: currentMessages.length,
                    afterCount: compressedMessages.length,
                });
                this.activityLog.logInfo(`Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`).catch(() => { });
            }
            // Now add user message (with multimodal content if attachments present)
            session.addMessage({
                role: 'user',
                content: userContent,
            });
            // Log user message
            this.activityLog.logSession(sessionId, 'start', message.slice(0, 80)).catch(() => { });
            // Tool execution loop (no iteration limit - on device, almost all actions are tool calls)
            let iteration = 0;
            let finalResponse = null;
            const accumulatedAttachments = [];
            while (true) {
                iteration++;
                logger.debug(`Tool loop iteration: ${iteration}`);
                // Build context
                const context = session.buildContext();
                logger.debug(`Context size: ${context.length} messages`);
                // Check context window
                if (context.length >= this.config.agent.contextWindowWarning) {
                    logger.warn('Context window approaching limit');
                }
                // Get system prompt from context
                const systemMessage = context.find((m) => m.role === 'system');
                let systemPrompt = systemMessage
                    ? typeof systemMessage.content === 'string'
                        ? systemMessage.content
                        : ''
                    : '';
                // Enrich system prompt with memory context (first iteration only)
                if (iteration === 1) {
                    try {
                        const memCtx = await this.memoryStore.getRelevantContext(message);
                        if (memCtx) {
                            systemPrompt = systemPrompt + '\n\n' + memCtx;
                            logger.debug('[MemoryStore] Injected relevant context into prompt');
                        }
                    }
                    catch (err) {
                        logger.debug('[MemoryStore] Context enrichment failed:', err);
                    }
                }
                // Filter out system message from messages, then repair any orphaned tool_use blocks
                let messages = sanitizeMessages(context.filter((m) => m.role !== 'system'));
                // Byte-size pre-check: base64 images have an extreme bytes/token ratio
                // (each ~500KB–2MB) while token-based compression triggers at 170k tokens.
                // 3–4 screenshots can exceed 6MB bytes with only ~15k tokens — well below
                // the compression threshold. Strip images proactively before the API call.
                messages = this.stripBase64ImagesIfNeeded(messages);
                // Decide whether to include tools (ToolUsageStrategy)
                const toolMode = this.config.agent.toolStrategy || 'auto';
                const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
                let tools;
                if (toolDecision.shouldIncludeTools) {
                    const registryTools = this.toolRegistry.toAnthropicFormat();
                    const skillTools = this.skillManager.toAnthropicFormat();
                    const allTools = [...registryTools, ...skillTools];
                    if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
                        // Filter tools by category
                        const allRegistered = this.toolRegistry.getAll();
                        const filteredNames = new Set();
                        for (const reg of allRegistered) {
                            if (toolDecision.toolFilter.includes(reg.category)) {
                                filteredNames.add(reg.name);
                            }
                        }
                        // Always include skill tools (they have skill_ prefix)
                        for (const st of skillTools) {
                            filteredNames.add(st.name);
                        }
                        tools = filteredNames.size > 0
                            ? allTools.filter((t) => filteredNames.has(t.name))
                            : allTools; // fallback to all if filter yields nothing
                    }
                    else {
                        tools = allTools;
                    }
                }
                else {
                    tools = undefined;
                    logger.debug(`[ToolStrategy] Excluding tools: ${toolDecision.reasoning}`);
                }
                // Call model API with tools
                const modelResponse = await this.modelAPI.createMessage({
                    model: session.model,
                    messages,
                    maxTokens: this.config.model.maxTokens,
                    temperature: this.config.model.temperature,
                    systemPrompt,
                    tools,
                });
                // Process response
                const response = await this.processResponse(session, modelResponse, accumulatedAttachments);
                // If it's a text response, we're done
                if (response.type === 'text') {
                    finalResponse = response;
                    break;
                }
                // If it's tool calls, execute them and continue loop
                if (response.type === 'tool_calls' && response.toolCalls) {
                    logger.info(`Executing ${response.toolCalls.length} tool calls`);
                    // Request approvals for dangerous tools
                    const approvedToolCalls = [];
                    const deniedToolCalls = [];
                    for (const toolCall of response.toolCalls) {
                        try {
                            // Request approval (returns immediately if tool is safe)
                            const approvalResponse = await this.approvalManager.requestApproval(toolCall.name, toolCall.input, session.sessionId, `Tool: ${toolCall.name}`);
                            if (approvalResponse.approved) {
                                approvedToolCalls.push(toolCall);
                            }
                            else {
                                deniedToolCalls.push(toolCall);
                                logger.warn(`Tool ${toolCall.name} denied by user: ${approvalResponse.reason || 'no reason'}`);
                            }
                        }
                        catch (error) {
                            // Timeout or other error - deny by default
                            deniedToolCalls.push(toolCall);
                            logger.error(`Approval failed for ${toolCall.name}:`, error);
                        }
                    }
                    // Execute approved tools with intelligent parallelization
                    const toolResults = await this.executeToolsWithParallelization(approvedToolCalls, deniedToolCalls, session);
                    // Add tool results to session as individual 'tool' messages
                    for (let i = 0; i < toolResults.length; i++) {
                        const toolCall = [...approvedToolCalls, ...deniedToolCalls][i];
                        const toolResult = toolResults[i];
                        // Accumulate attachments from tool results
                        if ('attachments' in toolResult && toolResult.attachments) {
                            accumulatedAttachments.push(...toolResult.attachments);
                        }
                        session.addMessage({
                            role: 'tool',
                            content: typeof toolResult.output === 'string'
                                ? toolResult.output
                                : JSON.stringify(toolResult.output ?? ''),
                            metadata: {
                                tool_call_id: toolCall.id,
                                tool_name: toolCall.name,
                                is_error: !toolResult.success,
                            },
                        });
                    }
                    // Continue loop to get next response
                    continue;
                }
                // If it's an error, break
                if (response.type === 'error') {
                    finalResponse = response;
                    break;
                }
            }
            // Record performance metrics
            const requestDuration = requestTimer.end();
            performanceMonitor.recordRequest(requestDuration);
            // Log response to activity log
            if (finalResponse && finalResponse.type === 'text') {
                const sessionSummary = message.slice(0, 100);
                this.activityLog.logSession(sessionId, 'end', sessionSummary).catch(() => { });
                // Proactive analysis after task completion
                this.proactiveBehavior.analyzeTaskCompletion(sessionSummary, 'success')
                    .catch(err => logger.debug('[Proactive] Post-task analysis failed:', err));
            }
            // Auto-save if enabled
            if (this.config.agent.autoSave) {
                await session.save();
            }
            return finalResponse;
        }
        catch (error) {
            this.activityLog.logError(error instanceof Error ? error.message : 'Unknown error in processSendMessage').catch(() => { });
            return this.handleError(error);
        }
    }
    /**
     * Internal method to process send message with streaming (called by lane)
     */
    async processSendMessageWithStreaming(sessionId, message, onStream, attachments) {
        const requestTimer = performanceMonitor.startTimer(`request:${sessionId}`);
        try {
            // Get or load session
            let session = this.sessions.get(sessionId);
            if (!session) {
                session = await this.loadSession(sessionId);
            }
            logger.info(`Processing message with streaming for session: ${sessionId}`);
            // Add user message (with multimodal content if attachments present)
            const userContent = await this.buildUserContent(message, attachments);
            session.addMessage({
                role: 'user',
                content: userContent,
            });
            // Log user message
            this.activityLog.logSession(sessionId, 'start', message.slice(0, 80)).catch(() => { });
            // Check context window and auto-compress if needed
            const currentMessages = session.buildContext();
            const contextStatus = this.contextGuard.checkStatus(currentMessages);
            if (contextStatus.needsCompression) {
                logger.info(`[AgentManager] Auto-compressing context: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`);
                const compressedMessages = await this.contextGuard.autoCompress(currentMessages);
                logger.info(`[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`);
                // Update session with compressed messages
                session.replaceHistory(compressedMessages);
                // Emit session:compress event
                this.eventBus.emit('session:compress', {
                    sessionId,
                    beforeCount: currentMessages.length,
                    afterCount: compressedMessages.length,
                });
                this.activityLog.logInfo(`Context compressed: ${currentMessages.length} → ${compressedMessages.length}`).catch(() => { });
            }
            // Tool execution loop (no iteration limit)
            let iteration = 0;
            let finalResponse = null;
            const accumulatedAttachments = [];
            while (true) {
                iteration++;
                logger.debug(`Tool loop iteration: ${iteration}`);
                // Build context
                const context = session.buildContext();
                logger.debug(`Context size: ${context.length} messages`);
                // Get system prompt
                const systemMessage = context.find((m) => m.role === 'system');
                let systemPrompt = systemMessage
                    ? typeof systemMessage.content === 'string'
                        ? systemMessage.content
                        : ''
                    : '';
                // Enrich with memory context (first iteration only)
                if (iteration === 1) {
                    try {
                        const memCtx = await this.memoryStore.getRelevantContext(message);
                        if (memCtx)
                            systemPrompt = systemPrompt + '\n\n' + memCtx;
                    }
                    catch (err) {
                        logger.debug('[MemoryStore] Context enrichment failed:', err);
                    }
                }
                // Filter out system message, then repair any orphaned tool_use blocks
                let messages = sanitizeMessages(context.filter((m) => m.role !== 'system'));
                // Byte-size pre-check (same reasoning as processSendMessage)
                messages = this.stripBase64ImagesIfNeeded(messages);
                // Get tools
                const toolMode = this.config.agent.toolStrategy || 'auto';
                const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
                let tools;
                if (toolDecision.shouldIncludeTools) {
                    const registryTools = this.toolRegistry.toAnthropicFormat();
                    const skillTools = this.skillManager.toAnthropicFormat();
                    const allTools = [...registryTools, ...skillTools];
                    if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
                        const allRegistered = this.toolRegistry.getAll();
                        const filteredNames = new Set();
                        for (const reg of allRegistered) {
                            if (toolDecision.toolFilter.includes(reg.category)) {
                                filteredNames.add(reg.name);
                            }
                        }
                        // Always include skill tools
                        for (const st of skillTools) {
                            filteredNames.add(st.name);
                        }
                        tools = filteredNames.size > 0
                            ? allTools.filter((t) => filteredNames.has(t.name))
                            : allTools;
                    }
                    else {
                        tools = allTools;
                    }
                }
                // Use streaming API
                let accumulatedText = '';
                let accumulatedReasoningContent = '';
                let toolCalls = [];
                let usage;
                const streamGenerator = this.modelAPI.createMessageStream({
                    model: session.model,
                    messages,
                    maxTokens: this.config.model.maxTokens,
                    temperature: this.config.model.temperature,
                    systemPrompt,
                    tools,
                }, this.streamingHandler);
                // Process stream chunks
                for await (const chunk of streamGenerator) {
                    if (chunk.type === 'text_delta' && chunk.delta) {
                        accumulatedText += chunk.delta;
                        // Call streaming callback
                        onStream(chunk.delta, accumulatedText, false);
                    }
                    else if (chunk.type === 'thinking_delta' && chunk.delta) {
                        // Accumulate reasoning content for DeepSeek reasoner
                        accumulatedReasoningContent += chunk.delta;
                    }
                    else if (chunk.type === 'tool_use_start' && chunk.toolCall) {
                        // Tool call detected - id and name are guaranteed on tool_use_start
                        toolCalls.push({
                            id: chunk.toolCall.id,
                            name: chunk.toolCall.name,
                            input: {},
                        });
                    }
                    else if (chunk.type === 'tool_use_delta') {
                        // Update tool input - delta contains the JSON fragment
                        const lastTool = toolCalls[toolCalls.length - 1];
                        if (lastTool && chunk.delta) {
                            // Accumulate JSON input
                            if (!lastTool._inputJson) {
                                lastTool._inputJson = '';
                            }
                            lastTool._inputJson += chunk.delta;
                        }
                    }
                    else if (chunk.type === 'tool_use_end') {
                        // Parse accumulated input JSON
                        const lastTool = toolCalls[toolCalls.length - 1];
                        if (lastTool && lastTool._inputJson) {
                            try {
                                lastTool.input = JSON.parse(lastTool._inputJson);
                            }
                            catch {
                                lastTool.input = {};
                            }
                            delete lastTool._inputJson;
                        }
                    }
                    else if (chunk.type === 'message_end' && chunk.usage) {
                        usage = {
                            inputTokens: chunk.usage.inputTokens ?? 0,
                            outputTokens: chunk.usage.outputTokens ?? 0,
                        };
                    }
                }
                // Signal streaming done for this iteration
                if (accumulatedText && toolCalls.length === 0) {
                    onStream('', accumulatedText, true);
                }
                // If we got tool calls, handle them
                if (toolCalls.length > 0) {
                    logger.info(`Tool calls detected: ${toolCalls.length} tools`);
                    // Add assistant message with tool calls
                    // Include reasoning_content for DeepSeek reasoner tool call loops
                    const metadata = {
                        toolCalls: toolCalls.map(tc => ({
                            id: tc.id,
                            name: tc.name,
                            input: tc.input,
                        })),
                    };
                    if (accumulatedReasoningContent) {
                        metadata.reasoning_content = accumulatedReasoningContent;
                    }
                    session.addMessage({
                        role: 'assistant',
                        content: accumulatedText || '',
                        metadata,
                    });
                    // Request approvals and execute tools
                    const approvedToolCalls = [];
                    const deniedToolCalls = [];
                    for (const toolCall of toolCalls) {
                        try {
                            const approvalResponse = await this.approvalManager.requestApproval(toolCall.name, toolCall.input, session.sessionId, `Tool: ${toolCall.name}`);
                            if (approvalResponse.approved) {
                                approvedToolCalls.push(toolCall);
                            }
                            else {
                                deniedToolCalls.push(toolCall);
                                logger.warn(`Tool ${toolCall.name} denied`);
                            }
                        }
                        catch (error) {
                            deniedToolCalls.push(toolCall);
                            logger.error(`Approval failed for ${toolCall.name}:`, error);
                        }
                    }
                    // Execute approved tools with intelligent parallelization
                    const toolResults = await this.executeToolsWithParallelization(approvedToolCalls, deniedToolCalls, session);
                    // Add tool results
                    for (let i = 0; i < toolResults.length; i++) {
                        const toolCall = [...approvedToolCalls, ...deniedToolCalls][i];
                        const toolResult = toolResults[i];
                        // Accumulate attachments from tool results
                        if ('attachments' in toolResult && toolResult.attachments) {
                            accumulatedAttachments.push(...toolResult.attachments);
                        }
                        session.addMessage({
                            role: 'tool',
                            content: typeof toolResult.output === 'string'
                                ? toolResult.output
                                : JSON.stringify(toolResult.output ?? ''),
                            metadata: {
                                tool_call_id: toolCall.id,
                                tool_name: toolCall.name,
                                is_error: !toolResult.success,
                            },
                        });
                    }
                    continue;
                }
                // Text response - we're done
                if (accumulatedText) {
                    session.addMessage({
                        role: 'assistant',
                        content: accumulatedText,
                        metadata: {
                            model: session.model,
                            tokens: usage ? usage.inputTokens + usage.outputTokens : undefined,
                            attachments: accumulatedAttachments.length > 0 ? accumulatedAttachments : undefined,
                        },
                    });
                    finalResponse = {
                        type: 'text',
                        content: accumulatedText,
                        usage,
                        attachments: accumulatedAttachments.length > 0 ? accumulatedAttachments : undefined,
                    };
                    break;
                }
            }
            // Record performance
            const requestDuration = requestTimer.end();
            performanceMonitor.recordRequest(requestDuration);
            // Log to activity log
            if (finalResponse && finalResponse.type === 'text') {
                this.activityLog.logSession(sessionId, 'end', message.slice(0, 80)).catch(() => { });
            }
            // Auto-save
            if (this.config.agent.autoSave) {
                await session.save();
            }
            return finalResponse;
        }
        catch (error) {
            onStream('', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
            this.activityLog.logError(error instanceof Error ? error.message : 'Unknown error in streaming').catch(() => { });
            return this.handleError(error);
        }
    }
    /**
     * Process model response
     *
     * @param session - Current session
     * @param modelResponse - Response from model API
     * @returns Agent response
     */
    async processResponse(session, modelResponse, attachments) {
        if (modelResponse.type === 'text') {
            // Simple text response
            session.addMessage({
                role: 'assistant',
                content: modelResponse.content,
                metadata: {
                    model: session.model,
                    tokens: modelResponse.usage?.inputTokens + modelResponse.usage?.outputTokens,
                    attachments: attachments?.length ? attachments : undefined,
                },
            });
            return {
                type: 'text',
                content: modelResponse.content,
                usage: modelResponse.usage,
                attachments: attachments?.length ? attachments : undefined,
            };
        }
        if (modelResponse.type === 'tool_calls') {
            // Tool calls detected - add assistant message with tool calls
            logger.info(`Tool calls detected: ${modelResponse.toolCalls.length} tools`);
            session.addMessage({
                role: 'assistant',
                content: modelResponse.content || '',
                metadata: {
                    model: session.model,
                    toolCalls: modelResponse.toolCalls,
                    reasoning_content: modelResponse.reasoningContent || undefined,
                },
            });
            return {
                type: 'tool_calls',
                content: modelResponse.content || 'Executing tools...',
                toolCalls: modelResponse.toolCalls,
                usage: modelResponse.usage,
            };
        }
        throw new Error('Unknown response type');
    }
    /**
     * Handle errors
     *
     * @param error - Error object
     * @returns Error response
     */
    /**
     * Strip base64 image blocks from messages when the estimated JSON body would
     * approach the ACS request-body hard limit (6 MB).
     *
     * WHY: Anthropic counts image tokens by dimensions (~1–5k tokens/image), but
     * each base64 screenshot is 500KB–2MB. Token-based compression (threshold:
     * 170k tokens) never fires when there are only 3–4 screenshots, yet bytes
     * can already exceed 6MB. Stripping happens before the API call, so the
     * reactive trimMessagesToBodyLimit() in ModelAPI is a last resort only.
     */
    stripBase64ImagesIfNeeded(messages) {
        const BYTE_THRESHOLD = 4 * 1024 * 1024; // 4 MB — comfortable margin under 6 MB
        const estimatedBytes = JSON.stringify(messages).length;
        if (estimatedBytes <= BYTE_THRESHOLD)
            return messages;
        logger.warn(`[AgentManager] Message body ~${Math.round(estimatedBytes / 1024)}KB exceeds 4MB, stripping base64 images before API call`);
        return messages.map((msg) => {
            if (!Array.isArray(msg.content))
                return msg;
            const stripped = msg.content.map((block) => {
                if (block?.type === 'image' && block?.source?.type === 'base64') {
                    return { type: 'text', text: '[image stripped to fit request size limit]' };
                }
                return block;
            });
            return { ...msg, content: stripped };
        });
    }
    handleError(error) {
        if (error instanceof ModelAPIError) {
            logger.error(`Model API error: ${error.code} - ${error.message}`);
            return {
                type: 'error',
                content: error.message,
                error: {
                    code: error.code,
                    message: error.message,
                },
            };
        }
        if (error instanceof Error) {
            logger.error(`Error: ${error.message}`);
            return {
                type: 'error',
                content: error.message,
                error: {
                    code: 'UNKNOWN_ERROR',
                    message: error.message,
                },
            };
        }
        logger.error('Unknown error occurred:', String(error));
        return {
            type: 'error',
            content: 'An unknown error occurred',
            error: {
                code: 'UNKNOWN_ERROR',
                message: 'An unknown error occurred',
            },
        };
    }
    /**
     * Get all active sessions
     *
     * @returns Array of session IDs
     */
    getActiveSessions() {
        return Array.from(this.sessions.keys());
    }
    /**
     * Test model API connection
     */
    async testConnection() {
        return this.modelAPI.testConnection();
    }
    /**
     * Get tool registry
     */
    getToolRegistry() {
        return this.toolRegistry;
    }
    /**
     * Get tool executor
     */
    getToolExecutor() {
        return this.toolExecutor;
    }
    /**
     * Get registered tools
     */
    getTools() {
        return this.toolRegistry.getAll();
    }
    /**
     * Enable/disable a tool
     */
    setToolEnabled(toolName, enabled) {
        if (enabled) {
            return this.toolRegistry.enable(toolName);
        }
        else {
            return this.toolRegistry.disable(toolName);
        }
    }
    /**
     * Get lane manager
     */
    getLaneManager() {
        return this.laneManager;
    }
    /**
     * Get all lane statuses
     */
    getLaneStatus() {
        return this.laneManager.getAllStatus();
    }
    /**
     * Cleanup idle lanes
     */
    cleanupIdleLanes() {
        this.laneManager.cleanupIdleLanes();
    }
    /**
     * Get context window guard
     */
    getContextGuard() {
        return this.contextGuard;
    }
    /**
     * Get context window status for a session
     */
    getContextStatus(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const messages = session.buildContext();
        return this.contextGuard.checkStatus(messages);
    }
    /**
     * Get approval manager
     */
    getApprovalManager() {
        return this.approvalManager;
    }
    /**
     * Submit approval for a pending request
     */
    submitApproval(requestId, approved, reason) {
        this.approvalManager.submitApproval({
            requestId,
            approved,
            timestamp: Date.now(),
            reason,
        });
    }
    /**
     * Get pending approval requests
     */
    getPendingApprovals() {
        return this.approvalManager.getPendingRequests();
    }
    // ===== Heartbeat API =====
    /**
     * Get heartbeat manager
     */
    getHeartbeatManager() {
        return this.heartbeatManager;
    }
    /**
     * Register a custom heartbeat task
     */
    registerHeartbeatTask(task) {
        this.heartbeatManager.register(task);
    }
    /**
     * List all heartbeat tasks
     */
    listHeartbeatTasks() {
        return this.heartbeatManager.list();
    }
    /**
     * Pause/resume a heartbeat task
     */
    setHeartbeatTaskEnabled(taskId, enabled) {
        if (enabled) {
            this.heartbeatManager.resume(taskId);
        }
        else {
            this.heartbeatManager.pause(taskId);
        }
    }
    // ===== Skills API =====
    /**
     * Get skill manager
     */
    getSkillManager() {
        return this.skillManager;
    }
    /**
     * Execute a skill by ID
     */
    async executeSkill(skillId, params = {}) {
        return this.skillManager.execute(skillId, params);
    }
    /**
     * List available skills
     */
    listSkills() {
        return this.skillManager.list();
    }
    /**
     * Search skills
     */
    searchSkills(query) {
        return this.skillManager.search(query);
    }
    // ===== Identity/Prompt API =====
    /**
     * Get prompt builder (identity system)
     */
    getPromptBuilder() {
        return this.promptBuilder;
    }
    /**
     * Rebuild the system prompt for a session using current identity files
     */
    async rebuildSessionPrompt(sessionId, variables) {
        const builtPrompt = await this.promptBuilder.buildPrompt({
            sessionId,
            currentTime: new Date().toISOString(),
            ...variables,
        });
        return builtPrompt.fullPrompt;
    }
    // ===== Social Platform API =====
    /**
     * Register all social platform adapters
     */
    registerSocialAdapters() {
        const adapters = [
            { platformName: 'telegram', displayName: 'Telegram', factory: () => new TelegramAdapter() },
            { platformName: 'discord', displayName: 'Discord', factory: () => new DiscordAdapter() },
            { platformName: 'feishu', displayName: '飞书', factory: () => new FeishuAdapter() },
            { platformName: 'dingtalk', displayName: '钉钉', factory: () => new DingTalkAdapter() },
            { platformName: 'qq', displayName: 'QQ', factory: () => new QQAdapter() },
            { platformName: 'qq-guild', displayName: 'QQ Guild', factory: () => new QQGuildAdapter() },
            { platformName: 'wechat', displayName: '微信', factory: () => new WeChatAdapter() },
        ];
        for (const reg of adapters) {
            this.socialManager.registerAdapter(reg);
        }
        logger.info(`[Social] Registered ${adapters.length} platform adapters`);
    }
    /**
     * Initialize social adapters from config (async, non-blocking)
     */
    initializeSocial() {
        const socialConfig = this.config.social;
        if (!socialConfig) {
            logger.info('[Social] No social config found, skipping');
            return;
        }
        // Map app config fields → PlatformConfig format
        const platforms = {};
        if (socialConfig.telegram) {
            platforms['telegram'] = {
                enabled: socialConfig.telegram.enabled ?? false,
                token: socialConfig.telegram.botToken,
            };
        }
        if (socialConfig.feishu) {
            platforms['feishu'] = {
                enabled: socialConfig.feishu.enabled ?? false,
                appId: socialConfig.feishu.appId,
                appSecret: socialConfig.feishu.appSecret,
            };
        }
        if (socialConfig.dingtalk) {
            platforms['dingtalk'] = {
                enabled: socialConfig.dingtalk.enabled ?? false,
                appId: socialConfig.dingtalk.appKey,
                appSecret: socialConfig.dingtalk.appSecret,
            };
        }
        if (socialConfig.qq) {
            platforms['qq'] = {
                enabled: socialConfig.qq.enabled ?? false,
                appId: socialConfig.qq.appId,
                token: socialConfig.qq.token,
            };
        }
        // if (socialConfig.wechat) {
        //   platforms['wechat'] = {
        //     enabled: socialConfig.wechat.enabled ?? false,
        //   };
        // }
        if (socialConfig.discord) {
            platforms['discord'] = {
                enabled: socialConfig.discord.enabled ?? false,
                token: socialConfig.discord.botToken,
            };
        }
        // Check if any platform is enabled
        const enabledCount = Object.values(platforms).filter(p => p.enabled).length;
        if (enabledCount === 0) {
            logger.info('[Social] No social platforms enabled');
            return;
        }
        logger.info(`[Social] Initializing ${enabledCount} enabled platform(s)...`);
        // Register configured default broadcast channels
        const broadcastConfigs = [
            ['telegram', socialConfig.telegram],
            ['qq', socialConfig.qq],
            ['discord', socialConfig.discord],
            ['feishu', socialConfig.feishu],
            ['dingtalk', socialConfig.dingtalk],
        ];
        for (const [name, cfg] of broadcastConfigs) {
            if (cfg?.broadcastChatId) {
                this.socialManager.setDefaultChannel(name, cfg.broadcastChatId);
            }
        }
        // Initialize asynchronously — don't block constructor
        this.socialManager.initialize({
            platforms,
            messageHandler: async (message) => {
                await this.handleSocialMessage(message);
            },
        }).then(() => {
            logger.info('[Social] Social platform initialization complete');
        }).catch(err => {
            logger.error('[Social] Social platform initialization failed:', err);
        });
    }
    /**
     * Build user message content, converting attachments to multimodal content blocks.
     * For Anthropic provider, images are downloaded to base64.
     */
    async buildUserContent(message, attachments) {
        if (!attachments?.length)
            return message;
        const contentBlocks = [];
        if (message) {
            contentBlocks.push({ type: 'text', text: message });
        }
        const isAnthropic = this.config.model.provider === 'anthropic';
        for (const att of attachments) {
            if (att.type === 'image') {
                if (att.url) {
                    if (isAnthropic) {
                        // Anthropic requires base64 — download the image
                        try {
                            const result = await this.modelAPI.downloadToBase64(att.url);
                            if (result) {
                                contentBlocks.push({
                                    type: 'image',
                                    source: {
                                        type: 'base64',
                                        media_type: result.media_type,
                                        data: result.data,
                                    },
                                });
                            }
                            else {
                                logger.warn(`[AgentManager] Failed to download image for Anthropic, degrading to text: ${att.url}`);
                                contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.url} (download failed)]` });
                            }
                        }
                        catch (err) {
                            logger.warn('[AgentManager] Image download error:', err);
                            contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.url} (error)]` });
                        }
                    }
                    else {
                        // OpenAI/Gemini support URL images directly
                        contentBlocks.push({
                            type: 'image',
                            source: {
                                type: 'url',
                                media_type: att.mimeType || 'image/jpeg',
                                data: att.url,
                            },
                        });
                    }
                }
                else if (att.localPath) {
                    // Local file — read as base64
                    try {
                        const base64Data = await this.readFileAsBase64(att.localPath);
                        if (base64Data) {
                            contentBlocks.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: att.mimeType || 'image/jpeg',
                                    data: base64Data,
                                },
                            });
                        }
                        else {
                            contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.localPath} (failed to read)]` });
                        }
                    }
                    catch (err) {
                        logger.warn('[AgentManager] Failed to read image file:', err);
                        contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.localPath} (error)]` });
                    }
                }
            }
            else {
                // Non-image files (video, audio, file) — degrade to text description
                contentBlocks.push({
                    type: 'file',
                    source: {
                        type: 'url',
                        url: att.url || att.localPath,
                        filename: att.filename,
                        mimeType: att.mimeType,
                    },
                });
            }
        }
        return contentBlocks.length > 0 ? contentBlocks : message;
    }
    /**
     * Read a local file as base64 string (uses Anode FileAPI)
     */
    async readFileAsBase64(path) {
        try {
            // Use Node.js fs for reading binary files
            const fs = await import('fs/promises');
            const buffer = await fs.readFile(path);
            return buffer.toString('base64');
        }
        catch (error) {
            logger.warn(`[AgentManager] Failed to read file as base64: ${path}`, error);
            return null;
        }
    }
    /**
     * Convert MediaAttachments to SocialAttachments for platform sending
     */
    convertToSocialAttachments(attachments) {
        if (!attachments?.length)
            return undefined;
        return attachments.map(att => ({
            type: att.type,
            url: att.localPath,
            filename: att.filename,
            mimeType: att.mimeType,
        }));
    }
    /**
     * Handle incoming social platform message → route to agent → reply with streaming
     */
    async handleSocialMessage(message) {
        const chatKey = `${message.platform}:${message.chatId}`;
        try {
            // Skip messages with no text and no attachments
            if ((!message.text || message.text.trim() === '') && !message.attachments?.length) {
                logger.debug(`[Social] Ignoring empty message from ${chatKey}`);
                return;
            }
            // Check for approval commands (/approve or /deny)
            if (message.text?.startsWith('/approve ') || message.text?.startsWith('/deny ')) {
                const handled = this.approvalManager.handleApprovalCommand(message);
                if (handled) {
                    logger.info(`[Social] Handled approval command from ${message.username}`);
                    return;
                }
            }
            logger.info(`[Social] Message from ${message.platform}/${message.username}: ${(message.text || '').substring(0, 80)}${message.attachments?.length ? ` [+${message.attachments.length} attachments]` : ''}`);
            // Convert SocialAttachment[] → MediaAttachment[]
            const incomingAttachments = message.attachments?.map(att => ({
                type: att.type,
                localPath: '',
                url: att.url,
                filename: att.filename,
                mimeType: att.mimeType,
            }));
            // Allow media-only messages (no text but has attachments)
            const messageText = message.text || (incomingAttachments?.length ? '' : '');
            // Get or create session for this chat
            let sessionId = this.socialSessions.get(chatKey);
            if (!sessionId) {
                const session = await this.createSession();
                sessionId = session.sessionId;
                this.socialSessions.set(chatKey, sessionId);
                logger.info(`[Social] Created session ${sessionId} for ${chatKey}`);
            }
            // Check if streaming is enabled (default: true)
            const streamingEnabled = this.config.streaming?.enabled !== false;
            if (streamingEnabled) {
                // Streaming mode: send placeholder, then edit with updates
                let sentMessageId;
                let lastUpdateTime = 0;
                const UPDATE_INTERVAL = 1000; // Telegram rate limit: ~1 edit per second
                try {
                    // Send initial placeholder
                    sentMessageId = await this.socialManager.sendMessageWithId(message.platform, {
                        chatId: message.chatId,
                        text: '思考中...',
                        replyTo: message.messageId,
                    });
                }
                catch (err) {
                    logger.debug('[Social] sendMessageWithId not supported, falling back to non-streaming');
                }
                if (sentMessageId) {
                    // Use streaming with periodic message edits
                    const response = await this.sendMessageWithStreaming(sessionId, messageText, async (delta, accumulated, done) => {
                        const now = Date.now();
                        // Throttle updates to avoid rate limits
                        if (done || (now - lastUpdateTime >= UPDATE_INTERVAL && accumulated.length > 0)) {
                            lastUpdateTime = now;
                            try {
                                // Show typing indicator with partial content
                                const displayText = done
                                    ? accumulated
                                    : accumulated + ' ▌';
                                await this.socialManager.editMessage(message.platform, message.chatId, sentMessageId, displayText || '...');
                            }
                            catch (err) {
                                // Ignore edit errors (message might be deleted, etc.)
                                logger.debug('[Social] Message edit failed:', err);
                            }
                        }
                    }, incomingAttachments);
                    // Log completion
                    if (response.type === 'text') {
                        logger.info(`[Social] Replied (streaming) to ${chatKey}: ${response.content.substring(0, 80)}`);
                        // Send attachments as a separate message (text was already streamed via edits)
                        const socialAttachments = this.convertToSocialAttachments(response.attachments);
                        if (socialAttachments?.length) {
                            await this.socialManager.sendMessage(message.platform, {
                                chatId: message.chatId,
                                text: '',
                                attachments: socialAttachments,
                            });
                        }
                    }
                }
                else {
                    // Fallback: non-streaming
                    const response = await this.sendMessage(sessionId, messageText, incomingAttachments);
                    if (response.type === 'text' && response.content) {
                        await this.socialManager.sendMessage(message.platform, {
                            chatId: message.chatId,
                            text: response.content,
                            replyTo: message.messageId,
                            attachments: this.convertToSocialAttachments(response.attachments),
                        });
                        logger.info(`[Social] Replied to ${chatKey}: ${response.content.substring(0, 80)}`);
                    }
                    else if (response.type === 'error') {
                        await this.socialManager.sendMessage(message.platform, {
                            chatId: message.chatId,
                            text: `Error: ${response.content}`,
                            replyTo: message.messageId,
                        });
                    }
                }
            }
            else {
                // Non-streaming mode
                const response = await this.sendMessage(sessionId, messageText, incomingAttachments);
                if (response.type === 'text' && response.content) {
                    await this.socialManager.sendMessage(message.platform, {
                        chatId: message.chatId,
                        text: response.content,
                        replyTo: message.messageId,
                        attachments: this.convertToSocialAttachments(response.attachments),
                    });
                    logger.info(`[Social] Replied to ${chatKey}: ${response.content.substring(0, 80)}`);
                }
                else if (response.type === 'error') {
                    await this.socialManager.sendMessage(message.platform, {
                        chatId: message.chatId,
                        text: `Error: ${response.content}`,
                        replyTo: message.messageId,
                    });
                }
            }
        }
        catch (error) {
            logger.error(`[Social] Error handling message from ${chatKey}:`, error);
            try {
                await this.socialManager.sendMessage(message.platform, {
                    chatId: message.chatId,
                    text: `抱歉，处理消息时出错: ${error.message}`,
                    replyTo: message.messageId,
                });
            }
            catch {
                // Ignore send errors
            }
        }
    }
    /**
     * Get social adapter manager
     */
    getSocialManager() {
        return this.socialManager;
    }
    /**
     * Get social platform status
     */
    getSocialStatus() {
        return this.socialManager.getStatus();
    }
    // ===== Memory System API =====
    /**
     * Get memory system
     */
    getMemoryStore() { return this.memoryStore; }
    getActivityLog() { return this.activityLog; }
    /**
     * Get proactive behavior engine
     */
    getProactiveBehavior() {
        return this.proactiveBehavior;
    }
    /**
     * Inject an AI-synthesized proactive message into the most recently active
     * chat session so the user sees it in the chat UI without having to ask.
     * Also sends a system notification as a heads-up.
     */
    async injectProactiveMessage(msg) {
        // 1. System notification (always, so user is alerted even with chat closed)
        if (typeof notification !== 'undefined') {
            try {
                await notification.show('🤖 助手主动提醒', msg.slice(0, 160));
            }
            catch { /* silent */ }
        }
        // 2. Inject into the most recently active session
        try {
            const activeSessions = this.getActiveSessions();
            if (activeSessions.length === 0)
                return;
            const targetId = activeSessions[activeSessions.length - 1];
            const session = this.sessions.get(targetId);
            if (!session)
                return;
            const content = `> 🤖 **主动提醒**\n\n${msg}`;
            session.addMessage({ role: 'assistant', content });
            await session.save();
            // Notify UI layer
            this.eventBus.emit('proactiveMessage', { sessionId: targetId, content });
            logger.info(`[Proactive] Injected message into session ${targetId.slice(0, 8)}`);
            // 3. Also broadcast to social channels if configured
            if (this.socialManager) {
                this.socialManager.broadcast(`🤖 ${msg}`).catch(() => { });
            }
        }
        catch (e) {
            logger.debug('[Proactive] injectProactiveMessage failed:', e);
        }
    }
    // ===== Plugin System API =====
    /**
     * Get plugin registry
     */
    getPluginRegistry() {
        return this.pluginRegistry;
    }
    /**
     * Get plugin loader
     */
    getPluginLoader() {
        return this.pluginLoader;
    }
    // ===== Sub-Agent API =====
    /**
     * Get sub-agent coordinator
     */
    getSubAgentCoordinator() {
        return this.subAgentCoordinator;
    }
    // ===== Snapshot API =====
    /**
     * Get snapshot generator
     */
    getSnapshotGenerator() {
        return this.snapshotGenerator;
    }
    // ===== Performance API =====
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return performanceMonitor.getMetrics();
    }
    // ===== Session Export/Import API =====
    /**
     * Export a session to a portable JSON file
     * @returns Path to the exported file
     */
    async exportSession(sessionId, exportPath) {
        const session = this.sessions.get(sessionId);
        if (!session) {
            throw new Error(`Session not found: ${sessionId}`);
        }
        const sessionPath = `${this.config.storage.sessionDir}/${sessionId}.json`;
        const storage = new FileSessionStorage(sessionPath);
        return storage.exportSession(exportPath);
    }
    /**
     * Import a session from an exported file
     * @returns The imported Session (loaded and stored in memory)
     */
    async importSession(importPath, targetSessionId) {
        const sessionId = targetSessionId || generateSessionId();
        const sessionPath = `${this.config.storage.sessionDir}/${sessionId}.json`;
        const storage = new FileSessionStorage(sessionPath);
        await storage.importSession(importPath);
        // Load the imported session
        return this.loadSession(sessionId);
    }
    /**
     * List all saved sessions (including not loaded ones)
     */
    async listAllSessions() {
        return FileSessionStorage.listSessions(this.config.storage.sessionDir);
    }
    // ===== Tool Hooks =====
    /**
     * Register default tool hooks (memory-logger, screenshot-ocr hint)
     */
    registerDefaultToolHooks() {
        // After-hook: log tool executions to DailyLog
        this.toolHooksManager.onAfterToolCall('memory-logger', async (ctx) => {
            try {
                await this.activityLog.logTool(ctx.toolName, ctx.duration, ctx.isError);
            }
            catch (err) {
                logger.debug('[ToolHook:memory-logger] Failed to log:', err);
            }
        }, 0);
        // After-hook: screenshot-ocr hint — append OCR suggestion when screenshot is taken
        this.toolHooksManager.onAfterToolCall('screenshot-ocr-hint', async (ctx) => {
            if ((ctx.toolName === 'android_screenshot' || ctx.toolName === 'android_take_screenshot') &&
                !ctx.isError) {
                return {
                    metadata: {
                        hint: 'Screenshot taken. Consider using ocr_recognize_screen to read the screen content.',
                    },
                };
            }
            return undefined;
        }, -10);
        const counts = this.toolHooksManager.getHookCounts();
        logger.info(`[AgentManager] Registered ${counts.before} before hooks, ${counts.after} after hooks`);
    }
    // ===== EventBus Consumers =====
    /**
     * Register EventBus consumers for cross-system coordination
     */
    registerEventBusConsumers() {
        // tool:after → log to DailyLog
        this.eventBus.on('tool:after', async (data) => {
            try {
                await this.activityLog.logTool(data.toolName, data.duration, false);
            }
            catch (err) {
                // silent
            }
        });
        // session:compress → log compression event
        this.eventBus.on('session:compress', async (data) => {
            try {
                await this.activityLog.logInfo(`Context compressed: ${data.beforeCount} → ${data.afterCount} (${data.sessionId.slice(0, 8)})`);
            }
            catch (err) {
                // silent
            }
        });
        // memory:saved → log memory event
        this.eventBus.on('memory:saved', async (data) => {
            try {
                await this.activityLog.logMemory(data.title, data.tags);
            }
            catch (err) {
                // silent
            }
        });
        logger.info('[AgentManager] EventBus consumers registered');
    }
    // ===== Tool Execution with Parallelization =====
    /**
     * Execute tools with intelligent parallelization
     * Groups tools by their parallelizable property and executes accordingly
     *
     * @param approvedToolCalls - Tools approved for execution
     * @param deniedToolCalls - Tools denied by approval manager
     * @param session - Current session
     * @returns Array of tool results in original order
     */
    async executeToolsWithParallelization(approvedToolCalls, deniedToolCalls, session) {
        // Separate tools into parallelizable and serial
        const parallelizable = [];
        const serial = [];
        for (let i = 0; i < approvedToolCalls.length; i++) {
            const toolCall = approvedToolCalls[i];
            const tool = this.toolRegistry.get(toolCall.name);
            // Check if tool is parallelizable (default to true if not specified)
            const isParallelizable = tool?.parallelizable !== false;
            if (isParallelizable) {
                parallelizable.push({ toolCall, index: i });
            }
            else {
                serial.push({ toolCall, index: i });
            }
        }
        logger.info(`[AgentManager] Tool execution plan: ${parallelizable.length} parallelizable, ${serial.length} serial (total: ${approvedToolCalls.length})`);
        // Create array to store results in original order
        const results = new Array(approvedToolCalls.length + deniedToolCalls.length).fill(null);
        // 1. Execute parallelizable tools in parallel
        if (parallelizable.length > 0) {
            logger.debug(`[AgentManager] Executing ${parallelizable.length} parallelizable tools concurrently`);
            const parallelResults = await Promise.all(parallelizable.map(({ toolCall }) => this.executeToolWithHooks(toolCall, session)));
            // Store results in correct positions
            for (let i = 0; i < parallelizable.length; i++) {
                results[parallelizable[i].index] = parallelResults[i];
            }
        }
        // 2. Execute serial tools one by one
        if (serial.length > 0) {
            logger.debug(`[AgentManager] Executing ${serial.length} serial tools sequentially`);
            for (const { toolCall, index } of serial) {
                const result = await this.executeToolWithHooks(toolCall, session);
                results[index] = result;
            }
        }
        // 3. Add denied tool results at the end
        for (let i = 0; i < deniedToolCalls.length; i++) {
            results[approvedToolCalls.length + i] = {
                success: false,
                output: null,
                error: {
                    code: 'APPROVAL_DENIED',
                    message: 'Tool execution denied by user or approval timeout',
                },
            };
        }
        // Filter out any null results (shouldn't happen, but for type safety)
        return results.filter((r) => r !== null);
    }
    /**
     * Execute a single tool with hooks and event handling
     *
     * @param toolCall - Tool call to execute
     * @param session - Current session
     * @returns Tool execution result
     */
    async executeToolWithHooks(toolCall, session) {
        const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);
        try {
            // Emit tool:before event
            this.eventBus.emit('tool:before', {
                toolName: toolCall.name,
                args: toolCall.input,
                sessionId: session.sessionId,
            });
            let result;
            // Route skill_* calls to SkillManager
            if (toolCall.name.startsWith('skill_')) {
                const skillId = toolCall.name.replace('skill_', '');
                const skillResult = await this.skillManager.execute(skillId, toolCall.input);
                result = {
                    success: skillResult.success,
                    output: skillResult.output != null
                        ? (typeof skillResult.output === 'string' ? skillResult.output : JSON.stringify(skillResult.output))
                        : skillResult.error || 'Skill completed',
                    error: skillResult.error
                        ? {
                            code: 'SKILL_ERROR',
                            message: skillResult.error,
                        }
                        : undefined,
                };
            }
            else {
                // Execute before hooks
                const hookCtx = {
                    callId: toolCall.id,
                    toolName: toolCall.name,
                    args: toolCall.input,
                    sessionId: session.sessionId,
                    timestamp: Date.now(),
                };
                const beforeResult = await this.toolHooksManager.executeBefore(hookCtx);
                if (!beforeResult.proceed) {
                    result = {
                        success: beforeResult.overrideResult !== undefined,
                        output: beforeResult.overrideResult ?? beforeResult.blockReason ?? 'Blocked by hook',
                        error: beforeResult.overrideResult === undefined
                            ? {
                                code: 'HOOK_BLOCKED',
                                message: beforeResult.blockReason || 'Blocked by hook',
                            }
                            : undefined,
                    };
                }
                else {
                    const effectiveInput = beforeResult.modifiedArgs || toolCall.input;
                    result = await this.toolExecutor.execute({ ...toolCall, input: effectiveInput }, { context: { sessionId: session.sessionId } });
                }
                // Execute after hooks
                const afterCtx = {
                    ...hookCtx,
                    result: result.output,
                    isError: !result.success,
                    duration: Date.now() - hookCtx.timestamp,
                };
                const afterResult = await this.toolHooksManager.executeAfter(afterCtx);
                if (afterResult.modifiedResult !== undefined) {
                    result.output = afterResult.modifiedResult;
                }
            }
            // Emit tool:after event
            const toolDuration = toolTimer.end();
            this.eventBus.emit('tool:after', {
                toolName: toolCall.name,
                args: toolCall.input,
                result: result.output,
                duration: toolDuration,
                sessionId: session.sessionId,
            });
            // Record tool execution performance
            performanceMonitor.recordToolExecution(toolDuration);
            // Update approval record with execution result
            this.approvalManager.updateExecutionResult(toolCall.id, {
                success: result.success,
                output: result.output,
                error: result.error
                    ? typeof result.error === 'string'
                        ? result.error
                        : JSON.stringify(result.error)
                    : undefined,
            });
            return result;
        }
        catch (error) {
            toolTimer.end(); // ensure timer is stopped
            logger.error(`Tool execution failed for ${toolCall.name}:`, error);
            return {
                success: false,
                output: null,
                error: {
                    code: 'EXECUTION_ERROR',
                    message: error instanceof Error ? error.message : 'Unknown error',
                    details: error,
                },
            };
        }
    }
    // ===== Shutdown =====
    /**
     * Graceful shutdown of all systems
     */
    async shutdown() {
        await this.socialManager.shutdown();
        this.heartbeatManager.shutdown();
        this.laneManager.shutdown();
        this.promptBuilder.destroy();
        this.subAgentCoordinator.removeAllListeners();
        this.proactiveBehavior.removeAllListeners();
        this.toolHooksManager.clear();
        this.eventBus.removeAllListeners();
        await this.pluginRegistry.destroyAll();
        logger.info('AgentManager shutdown complete');
    }
}
