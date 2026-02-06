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
import { ModelAPI, ModelAPIError } from './ModelAPI.js';
import { generateSessionId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { ToolRegistry, ToolExecutor, builtinTools, setMemorySystem, setSubAgentCoordinator } from '../tools/index.js';
import { LaneManager } from './lane/LaneManager.js';
import { ContextWindowGuard } from './context/ContextWindowGuard.js';
import { setCompressionModelAPI } from './context/CompressionStrategy.js';
import { ApprovalManager } from './safety/ApprovalManager.js';
import { HeartbeatManager, createStatusCheckTask, createCleanupTask, createDailyLogArchivalTask } from './heartbeat/index.js';
import { SkillManager, builtinSkills } from '../skills/index.js';
import { SkillRetrieval } from '../skills/retrieval/SkillRetrieval.js';
import { PromptBuilder } from './prompts/PromptBuilder.js';
import { SystemPromptBuilder } from './prompts/SystemPromptBuilder.js';
import { MemorySystem } from './memory/MemorySystem.js';
import { DailyLogManager } from './memory/DailyLogManager.js';
import { SemanticMemory } from './memory/SemanticMemory.js';
import { SessionMemoryHook, createEmptySessionSummary } from './memory/SessionMemoryHook.js';
import { MemoryFlushManager } from './memory/MemoryFlush.js';
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
        this.contextGuard = new ContextWindowGuard({
            maxTokens: config.model.maxTokens,
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
        // Initialize Memory System
        this.memorySystem = new MemorySystem({
            sessionLogsDir: `${config.storage.sessionDir}/logs`,
            memoryFilesDir: config.storage.memoryDir || `${config.storage.sessionDir}/memories`,
        });
        // Initialize memory system directories
        this.memorySystem.initialize().catch(err => {
            logger.error('[AgentManager] MemorySystem initialization failed:', err);
        });
        // Inject memory system instance into MemoryTools
        setMemorySystem(this.memorySystem);
        // Initialize Daily Log Manager
        this.dailyLogManager = new DailyLogManager(config.storage.memoryDir || `${config.storage.sessionDir}/memories`);
        this.dailyLogManager.initialize().catch(err => {
            logger.warn('[AgentManager] DailyLogManager initialization failed:', err);
        });
        // Initialize Semantic Memory
        this.semanticMemory = new SemanticMemory(this.memorySystem, this.dailyLogManager);
        this.semanticMemory.initialize().catch(err => {
            logger.warn('[AgentManager] SemanticMemory initialization failed:', err);
        });
        // Initialize Session Memory Hook (Automatic Session Summary)
        this.sessionMemoryHook = new SessionMemoryHook({
            enabled: config.memory?.enabled ?? true,
            onMemorySave: async (entry) => {
                try {
                    // Save to persistent memory
                    await this.memorySystem.saveMemory(entry);
                    // Log to daily log as an insight
                    await this.dailyLogManager.logInsight(`Session summary saved: "${entry.title}"`);
                }
                catch (error) {
                    logger.error('[AgentManager] Failed to save session memory:', error);
                }
            }
        });
        // Initialize Memory Flush Manager (Context Compaction Persistence)
        this.memoryFlushManager = new MemoryFlushManager({
            enabled: config.memory?.enabled ?? true,
            saveMemory: async (entry) => {
                try {
                    await this.memorySystem.saveMemory(entry);
                    await this.dailyLogManager.logInsight(`Context flushed to memory: "${entry.title}"`);
                }
                catch (error) {
                    logger.error('[AgentManager] Failed to save flush memory:', error);
                }
            }
        });
        // Initialize Proactive Behavior
        this.proactiveBehavior = new ProactiveBehavior(this.config.proactive ?? undefined, this.memorySystem, this.dailyLogManager, () => this.getActiveSessions());
        // Initialize Social Manager
        this.socialManager = new SocialAdapterManager();
        this.registerSocialAdapters();
        if (config.social) {
            this.socialManager.initialize({
                platforms: config.social
            }).catch(err => logger.error('[AgentManager] SocialManager init failed:', err));
        }
        this.proactiveBehavior.on('suggestions', async (suggestions) => {
            for (const s of suggestions) {
                logger.info(`[Proactive] [${s.priority}] ${s.title}: ${s.description}`);
                // Send push notification for medium/high priority suggestions
                if ((s.priority === 'high' || s.priority === 'medium') && typeof notification !== 'undefined') {
                    try {
                        await notification.show(`🤖 ${s.title}`, s.description);
                        logger.info(`[Proactive] Notification sent: ${s.title}`);
                    }
                    catch (e) {
                        logger.error('[Proactive] Notification failed', e);
                    }
                }
                // Broadcast to social channels
                if (this.socialManager && (s.priority === 'high' || s.priority === 'medium')) {
                    this.socialManager.broadcast(`🤖 [${s.title}]\n${s.description}`).catch(err => {
                        logger.error('[Proactive] Social broadcast failed', err);
                    });
                }
            }
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
            // Daily log archival at midnight
            this.heartbeatManager.register(createDailyLogArchivalTask({
                dailyLogManager: this.dailyLogManager,
                memorySystem: this.memorySystem,
            }));
            // Proactive behavior periodic check
            this.heartbeatManager.register(this.proactiveBehavior.createHeartbeatTask());
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
                    workspaceDir: this.config.storage.sessionDir,
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
                const startTime = session.createdAt || Date.now();
                const summary = createEmptySessionSummary(sessionId, startTime);
                // Populate summary with conversation text
                const messages = conversation.map(msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : '[Complex Content]'}`).join('\n\n');
                summary.summaryText = messages.slice(0, 5000); // Limit size
                summary.topics = ['Session Archive']; // Basic topic
                // Use hook to process and save
                await this.sessionMemoryHook.onSessionEnd(summary, conversation.length);
            }
            catch (error) {
                logger.error(`[AgentManager] Failed to run memory hook for session ${sessionId}`, error);
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
    async sendMessage(sessionId, message) {
        // Use lane system to serialize execution per session
        return this.laneManager.enqueue(sessionId, {
            id: `msg-${Date.now()}`,
            name: `sendMessage:${sessionId}`,
            priority: 'normal',
            execute: async () => {
                return this.processSendMessage(sessionId, message);
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
    async sendMessageWithStreaming(sessionId, message, onStream) {
        // Use lane system to serialize execution per session
        return this.laneManager.enqueue(sessionId, {
            id: `msg-${Date.now()}`,
            name: `sendMessage:${sessionId}`,
            priority: 'normal',
            execute: async () => {
                return this.processSendMessageWithStreaming(sessionId, message, onStream);
            },
        });
    }
    /**
     * Internal method to process send message (called by lane)
     */
    async processSendMessage(sessionId, message) {
        const requestTimer = performanceMonitor.startTimer(`request:${sessionId}`);
        try {
            // Get or load session
            let session = this.sessions.get(sessionId);
            if (!session) {
                session = await this.loadSession(sessionId);
            }
            logger.info(`Processing message for session: ${sessionId}`);
            // Add user message
            session.addMessage({
                role: 'user',
                content: message,
            });
            // Log to memory system
            this.memorySystem.appendLog(sessionId, {
                timestamp: Date.now(),
                role: 'user',
                content: message,
            }).catch(err => logger.debug('[Memory] Log append failed:', err));
            // Check context window and auto-compress if needed
            const currentMessages = session.buildContext();
            const contextStatus = this.contextGuard.checkStatus(currentMessages);
            if (contextStatus.needsCompression) {
                // Pre-compression memory flush
                const usageRatio = contextStatus.currentTokens / contextStatus.maxTokens;
                if (this.memoryFlushManager.shouldFlush(usageRatio)) {
                    logger.info(`[AgentManager] Triggering memory flush (usage: ${(usageRatio * 100).toFixed(1)}%)`);
                    const flushContext = {
                        sessionId: sessionId,
                        messages: currentMessages.map(m => ({
                            role: m.role,
                            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                            timestamp: m.timestamp,
                            metadata: m.metadata
                        })),
                        contextUsage: usageRatio,
                        reason: contextStatus.needsCompression ? 'compression' : 'threshold'
                    };
                    await this.memoryFlushManager.flush(flushContext).catch(err => {
                        logger.error('[AgentManager] Memory flush failed:', err);
                    });
                }
                logger.info(`[AgentManager] Auto-compressing context: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`);
                // Perform auto-compression
                const compressedMessages = await this.contextGuard.autoCompress(currentMessages);
                // Update session with compressed messages
                session.replaceHistory(compressedMessages);
                logger.info(`[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`);
            }
            // Tool execution loop (max iterations to prevent infinite loops)
            // Configurable via agent.maxToolIterations, default 20
            const maxIterations = this.config.agent.maxToolIterations || 20;
            let iteration = 0;
            let finalResponse = null;
            while (iteration < maxIterations) {
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
                // Enrich system prompt with semantic memory context (first iteration only)
                if (iteration === 1) {
                    try {
                        const relevantCtx = await this.semanticMemory.getRelevantContext(message);
                        if (relevantCtx.content) {
                            systemPrompt = systemPrompt + '\n\n' + relevantCtx.content;
                            logger.debug(`[SemanticMemory] Injected ${relevantCtx.sources.length} relevant context(s) into prompt`);
                        }
                    }
                    catch (err) {
                        logger.debug('[SemanticMemory] Context enrichment failed:', err);
                    }
                }
                // Filter out system message from messages
                const messages = context.filter((m) => m.role !== 'system');
                // Decide whether to include tools (ToolUsageStrategy)
                const toolMode = this.config.agent.toolStrategy || 'auto';
                const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
                let tools;
                if (toolDecision.shouldIncludeTools) {
                    const allTools = this.toolRegistry.toAnthropicFormat();
                    if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
                        // Filter tools by category
                        const allRegistered = this.toolRegistry.getAll();
                        const filteredNames = new Set();
                        for (const reg of allRegistered) {
                            if (toolDecision.toolFilter.includes(reg.category)) {
                                filteredNames.add(reg.name);
                            }
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
                const response = await this.processResponse(session, modelResponse);
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
                    // Execute approved tools in parallel
                    const toolResults = await Promise.all([
                        ...approvedToolCalls.map(async (toolCall) => {
                            const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);
                            try {
                                const result = await this.toolExecutor.execute(toolCall, {
                                    context: {
                                        sessionId: session.sessionId,
                                    },
                                });
                                // Record tool execution performance
                                const toolDuration = toolTimer.end();
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
                                    error: error instanceof Error ? error.message : 'Unknown error',
                                };
                            }
                        }),
                        // Add denial results for denied tools
                        ...deniedToolCalls.map((toolCall) => {
                            return Promise.resolve({
                                success: false,
                                output: null,
                                error: 'Tool execution denied by user or approval timeout',
                            });
                        }),
                    ]);
                    // Add tool results to session as individual 'tool' messages
                    for (let i = 0; i < toolResults.length; i++) {
                        const toolCall = [...approvedToolCalls, ...deniedToolCalls][i];
                        session.addMessage({
                            role: 'tool',
                            content: typeof toolResults[i].output === 'string'
                                ? toolResults[i].output
                                : JSON.stringify(toolResults[i].output ?? ''),
                            metadata: {
                                tool_call_id: toolCall.id,
                                tool_name: toolCall.name,
                                is_error: !toolResults[i].success,
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
            if (iteration >= maxIterations) {
                logger.warn('Tool loop exceeded max iterations');
                finalResponse = {
                    type: 'error',
                    content: 'Tool execution loop exceeded maximum iterations',
                    error: {
                        code: 'MAX_ITERATIONS',
                        message: 'Too many tool calls',
                    },
                };
            }
            // Record performance metrics
            const requestDuration = requestTimer.end();
            performanceMonitor.recordRequest(requestDuration);
            // Log assistant response to memory
            if (finalResponse && finalResponse.type === 'text') {
                this.memorySystem.appendLog(sessionId, {
                    timestamp: Date.now(),
                    role: 'assistant',
                    content: finalResponse.content,
                    metadata: { tokens: finalResponse.usage?.inputTokens, executionTime: requestDuration },
                }).catch(err => logger.debug('[Memory] Log append failed:', err));
                // Log session to daily log
                const sessionSummary = message.slice(0, 100);
                this.dailyLogManager.logSession({
                    id: sessionId.slice(0, 8),
                    timeRange: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                    summary: sessionSummary,
                    result: 'success',
                }).catch(err => logger.debug('[DailyLog] Session log failed:', err));
                // Incrementally index new user message for semantic search
                this.semanticMemory.addToIndex(`msg:${sessionId}:${Date.now()}`, message, 'session-summary', `User message in ${sessionId.slice(0, 8)}`).catch(err => logger.debug('[SemanticMemory] Indexing failed:', err));
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
            // Log error to daily log
            this.dailyLogManager.logError(error instanceof Error ? error.message : 'Unknown error in processSendMessage').catch(() => { });
            return this.handleError(error);
        }
    }
    /**
     * Internal method to process send message with streaming (called by lane)
     */
    async processSendMessageWithStreaming(sessionId, message, onStream) {
        const requestTimer = performanceMonitor.startTimer(`request:${sessionId}`);
        try {
            // Get or load session
            let session = this.sessions.get(sessionId);
            if (!session) {
                session = await this.loadSession(sessionId);
            }
            logger.info(`Processing message with streaming for session: ${sessionId}`);
            // Add user message
            session.addMessage({
                role: 'user',
                content: message,
            });
            // Log to memory system
            this.memorySystem.appendLog(sessionId, {
                timestamp: Date.now(),
                role: 'user',
                content: message,
            }).catch(err => logger.debug('[Memory] Log append failed:', err));
            // Check context window and auto-compress if needed
            const currentMessages = session.buildContext();
            const contextStatus = this.contextGuard.checkStatus(currentMessages);
            if (contextStatus.needsCompression) {
                // Pre-compression memory flush
                const usageRatio = contextStatus.currentTokens / contextStatus.maxTokens;
                if (this.memoryFlushManager.shouldFlush(usageRatio)) {
                    logger.info(`[AgentManager] Triggering memory flush (usage: ${(usageRatio * 100).toFixed(1)}%)`);
                    const flushContext = {
                        sessionId: sessionId,
                        messages: currentMessages.map(m => ({
                            role: m.role,
                            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                            timestamp: m.timestamp,
                            metadata: m.metadata
                        })),
                        contextUsage: usageRatio,
                        reason: contextStatus.needsCompression ? 'compression' : 'threshold'
                    };
                    await this.memoryFlushManager.flush(flushContext).catch(err => {
                        logger.error('[AgentManager] Memory flush failed:', err);
                    });
                }
                logger.info(`[AgentManager] Auto-compressing context: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`);
                const compressedMessages = await this.contextGuard.autoCompress(currentMessages);
                logger.info(`[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`);
            }
            // Tool execution loop
            const maxIterations = this.config.agent.maxToolIterations || 20;
            let iteration = 0;
            let finalResponse = null;
            while (iteration < maxIterations) {
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
                // Enrich with semantic memory (first iteration only)
                if (iteration === 1) {
                    try {
                        const relevantCtx = await this.semanticMemory.getRelevantContext(message);
                        if (relevantCtx.content) {
                            systemPrompt = systemPrompt + '\n\n' + relevantCtx.content;
                        }
                    }
                    catch (err) {
                        logger.debug('[SemanticMemory] Context enrichment failed:', err);
                    }
                }
                // Filter out system message
                const messages = context.filter((m) => m.role !== 'system');
                // Get tools
                const toolMode = this.config.agent.toolStrategy || 'auto';
                const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
                let tools;
                if (toolDecision.shouldIncludeTools) {
                    const allTools = this.toolRegistry.toAnthropicFormat();
                    if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
                        const allRegistered = this.toolRegistry.getAll();
                        const filteredNames = new Set();
                        for (const reg of allRegistered) {
                            if (toolDecision.toolFilter.includes(reg.category)) {
                                filteredNames.add(reg.name);
                            }
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
                    // Execute approved tools
                    const toolResults = await Promise.all([
                        ...approvedToolCalls.map(async (toolCall) => {
                            const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);
                            try {
                                const result = await this.toolExecutor.execute(toolCall, {
                                    context: { sessionId: session.sessionId },
                                });
                                toolTimer.end();
                                performanceMonitor.recordToolExecution(toolTimer.end());
                                this.approvalManager.updateExecutionResult(toolCall.id, {
                                    success: result.success,
                                    output: result.output,
                                    error: result.error ? JSON.stringify(result.error) : undefined,
                                });
                                return result;
                            }
                            catch (error) {
                                toolTimer.end();
                                logger.error(`Tool execution failed for ${toolCall.name}:`, error);
                                return {
                                    success: false,
                                    output: null,
                                    error: error instanceof Error ? error.message : 'Unknown error',
                                };
                            }
                        }),
                        ...deniedToolCalls.map(() => Promise.resolve({
                            success: false,
                            output: null,
                            error: 'Tool execution denied',
                        })),
                    ]);
                    // Add tool results
                    for (let i = 0; i < toolResults.length; i++) {
                        const toolCall = [...approvedToolCalls, ...deniedToolCalls][i];
                        session.addMessage({
                            role: 'tool',
                            content: typeof toolResults[i].output === 'string'
                                ? toolResults[i].output
                                : JSON.stringify(toolResults[i].output ?? ''),
                            metadata: {
                                tool_call_id: toolCall.id,
                                tool_name: toolCall.name,
                                is_error: !toolResults[i].success,
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
                        },
                    });
                    finalResponse = {
                        type: 'text',
                        content: accumulatedText,
                        usage,
                    };
                    break;
                }
            }
            if (iteration >= maxIterations) {
                logger.warn('Tool loop exceeded max iterations');
                onStream('', 'Tool execution loop exceeded maximum iterations', true);
                finalResponse = {
                    type: 'error',
                    content: 'Tool execution loop exceeded maximum iterations',
                    error: { code: 'MAX_ITERATIONS', message: 'Too many tool calls' },
                };
            }
            // Record performance
            const requestDuration = requestTimer.end();
            performanceMonitor.recordRequest(requestDuration);
            // Log to memory
            if (finalResponse && finalResponse.type === 'text') {
                this.memorySystem.appendLog(sessionId, {
                    timestamp: Date.now(),
                    role: 'assistant',
                    content: finalResponse.content,
                    metadata: { executionTime: requestDuration },
                }).catch(() => { });
                this.dailyLogManager.logSession({
                    id: sessionId.slice(0, 8),
                    timeRange: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
                    summary: message.slice(0, 100),
                    result: 'success',
                }).catch(() => { });
            }
            // Auto-save
            if (this.config.agent.autoSave) {
                await session.save();
            }
            return finalResponse;
        }
        catch (error) {
            onStream('', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
            this.dailyLogManager.logError(error instanceof Error ? error.message : 'Unknown error in streaming').catch(() => { });
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
    async processResponse(session, modelResponse) {
        if (modelResponse.type === 'text') {
            // Simple text response
            session.addMessage({
                role: 'assistant',
                content: modelResponse.content,
                metadata: {
                    model: session.model,
                    tokens: modelResponse.usage?.inputTokens + modelResponse.usage?.outputTokens,
                },
            });
            return {
                type: 'text',
                content: modelResponse.content,
                usage: modelResponse.usage,
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
        logger.error('Unknown error occurred');
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
     * Handle incoming social platform message → route to agent → reply with streaming
     */
    async handleSocialMessage(message) {
        const chatKey = `${message.platform}:${message.chatId}`;
        try {
            // Skip empty messages
            if (!message.text || message.text.trim() === '') {
                logger.debug(`[Social] Ignoring empty message from ${chatKey}`);
                return;
            }
            // Check for approval commands (/approve or /deny)
            if (message.text.startsWith('/approve ') || message.text.startsWith('/deny ')) {
                const handled = this.approvalManager.handleApprovalCommand(message);
                if (handled) {
                    logger.info(`[Social] Handled approval command from ${message.username}`);
                    return;
                }
            }
            logger.info(`[Social] Message from ${message.platform}/${message.username}: ${message.text.substring(0, 80)}`);
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
                    const response = await this.sendMessageWithStreaming(sessionId, message.text, async (delta, accumulated, done) => {
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
                    });
                    // Log completion
                    if (response.type === 'text') {
                        logger.info(`[Social] Replied (streaming) to ${chatKey}: ${response.content.substring(0, 80)}`);
                    }
                }
                else {
                    // Fallback: non-streaming
                    const response = await this.sendMessage(sessionId, message.text);
                    if (response.type === 'text' && response.content) {
                        await this.socialManager.sendMessage(message.platform, {
                            chatId: message.chatId,
                            text: response.content,
                            replyTo: message.messageId,
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
                const response = await this.sendMessage(sessionId, message.text);
                if (response.type === 'text' && response.content) {
                    await this.socialManager.sendMessage(message.platform, {
                        chatId: message.chatId,
                        text: response.content,
                        replyTo: message.messageId,
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
    getMemorySystem() {
        return this.memorySystem;
    }
    /**
     * Get daily log manager
     */
    getDailyLogManager() {
        return this.dailyLogManager;
    }
    /**
     * Get semantic memory
     */
    getSemanticMemory() {
        return this.semanticMemory;
    }
    /**
     * Get proactive behavior engine
     */
    getProactiveBehavior() {
        return this.proactiveBehavior;
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
        await this.pluginRegistry.destroyAll();
        logger.info('AgentManager shutdown complete');
    }
}
