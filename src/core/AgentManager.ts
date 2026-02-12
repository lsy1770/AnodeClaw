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
import type { Config } from '../config/schema.js';
import type { MediaAttachment, MessageContent, Message } from './types.js';
import { generateSessionId } from '../utils/id.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import { ToolRegistry, ToolExecutor, builtinTools, setMemorySystem, setSubAgentCoordinator } from '../tools/index.js';
import type { ToolCall as ToolCallType } from '../tools/types.js';
import { LaneManager } from './lane/LaneManager.js';
import type { Task } from './lane/types.js';
import { ContextWindowGuard } from './context/ContextWindowGuard.js';
import { setCompressionModelAPI } from './context/CompressionStrategy.js';
import type { ContextWindowConfig } from './context/types.js';
import { ApprovalManager } from './safety/ApprovalManager.js';
import type { SafetyConfig, ApprovalRequest } from './safety/types.js';
import { HeartbeatManager, createStatusCheckTask, createCleanupTask, createDailyLogArchivalTask } from './heartbeat/index.js';
import type { HeartbeatTaskConfig, HeartbeatTaskState } from './heartbeat/types.js';
import { SkillManager, builtinSkills } from '../skills/index.js';
import { SkillRetrieval } from '../skills/retrieval/SkillRetrieval.js';
import type { SkillResult } from '../skills/types.js';
import { PromptBuilder } from './prompts/PromptBuilder.js';
import { SystemPromptBuilder } from './prompts/SystemPromptBuilder.js';
import type { PromptConfig, PromptVariables, SystemPromptParams, RuntimeInfo } from './prompts/types.js';
// Social imports removed (duplicates)
import type { SocialMessage, SocialAttachment, OutgoingMessage, PlatformConfig } from '../social/types.js';
import { MemorySystem } from './memory/MemorySystem.js';
import type { SessionLogEntry } from './memory/types.js';
import { DailyLogManager } from './memory/DailyLogManager.js';
import type { DailySessionEntry } from './memory/DailyLogManager.js';
import { SemanticMemory } from './memory/SemanticMemory.js';
import { SessionMemoryHook, SessionSummary, createEmptySessionSummary } from './memory/SessionMemoryHook.js';
import { MemoryFlushManager, FlushableContext } from './memory/MemoryFlush.js';
import { ProactiveBehavior } from './proactive/ProactiveBehavior.js';
import type { ProactiveSuggestion } from './proactive/ProactiveBehavior.js';
import {
  SocialAdapterManager,
  TelegramAdapter,
  QQAdapter,
  QQGuildAdapter,
  WeChatAdapter,
  DiscordAdapter,
  FeishuAdapter,
  DingTalkAdapter,
} from '../social/index.js';
import { ToolUsageStrategy } from '../tools/ToolUsageStrategy.js';
import type { ToolStrategyMode } from '../tools/ToolUsageStrategy.js';
import { PluginRegistry } from '../plugins/PluginRegistry.js';
import { PluginLoader } from '../plugins/PluginLoader.js';
import { CalculatorPlugin, TranslatorPlugin, WeatherPlugin } from '../plugins/index.js';
import { SubAgentCoordinator } from './subagents/SubAgentCoordinator.js';
import { SnapshotGenerator } from './snapshot/SnapshotGenerator.js';
import { performanceMonitor } from '../utils/performance.js';
import { SecurityUtils } from '../utils/security.js';
import { StreamingHandler } from './streaming/StreamingHandler.js';
import type { ModelStreamChunk } from './ModelAPI.js';
import { getToolHooksManager, ToolHooksManager } from './tools/ToolHooks.js';
import type { ToolCallContext, AfterToolCallContext } from './tools/ToolHooks.js';
import { EventBus } from './EventBus.js';

// Anode global file API (based on FileAPI.kt actual method signatures)
declare const file: {
  readText(path: string, charset?: string): Promise<string>;
  writeText(path: string, content: string, charset?: string): Promise<boolean>;
  exists(path: string): boolean;
  isDirectory(path: string): boolean;
  delete(path: string): Promise<boolean>;
  createDirectory(path: string): Promise<boolean>;
  listFiles(path: string): Promise<Array<{ name: string; path: string; size: number; isDirectory: boolean; lastModified: number; extension: string }>>;
};

// Anode global notification API
declare const notification: {
  show(title: string, content: string, options?: any): Promise<number>;
};

/**
 * Agent response types
 */
export type AgentResponseType = 'text' | 'tool_calls' | 'error';

/**
 * Agent response structure
 */
export interface AgentResponse {
  type: AgentResponseType;
  content: string;
  toolCalls?: any[];
  error?: {
    code: string;
    message: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  attachments?: MediaAttachment[];
}

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  sessionId?: string;
  systemPrompt?: string;
  model?: string;
}

/**
 * Streaming update callback
 */
export type StreamingCallback = (delta: string, accumulated: string, done: boolean) => void;

/**
 * Agent Manager Class
 *
 * The main interface for interacting with the AI agent
 */
export class AgentManager {
  private sessions: Map<string, Session>;
  private modelAPI: ModelAPI;
  private config: Config;
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private laneManager: LaneManager;
  private contextGuard: ContextWindowGuard;
  private approvalManager: ApprovalManager;
  private heartbeatManager: HeartbeatManager;
  private skillManager: SkillManager;
  private skillRetrieval: SkillRetrieval;
  private promptBuilder: PromptBuilder;
  private socialManager: SocialAdapterManager;
  /** Maps "platform:chatId" → sessionId for social message routing */
  private socialSessions: Map<string, string> = new Map();
  private memorySystem: MemorySystem;
  private dailyLogManager: DailyLogManager;
  private semanticMemory: SemanticMemory;
  private proactiveBehavior: ProactiveBehavior;
  private pluginRegistry: PluginRegistry;
  private pluginLoader: PluginLoader;
  private subAgentCoordinator: SubAgentCoordinator;
  private snapshotGenerator: SnapshotGenerator;
  private streamingHandler: StreamingHandler;
  private sessionMemoryHook: SessionMemoryHook;
  private memoryFlushManager: MemoryFlushManager;
  private toolHooksManager: ToolHooksManager;
  private eventBus: EventBus;

  constructor(config: Config) {
    this.config = config;
    this.sessions = new Map();

    // Initialize ModelAPI
    this.modelAPI = new ModelAPI(
      config.model.provider,
      config.model.apiKey,
      config.model.baseURL
    );

    // Enable AI-powered context compression
    setCompressionModelAPI(this.modelAPI, (config.agent as any).summaryModel);

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
      logger.info(
        `[AgentManager] Detected model token limit: ${detectedLimit} (model: ${config.model.model})`
      );
      contextWindowTokens = Math.min(contextWindowTokens, detectedLimit);
    }

    // Sanity check: contextWindow should be the model's input context, not the output maxTokens
    // Common misconfiguration: setting contextWindow to the same value as model.maxTokens (e.g. 4096)
    if (contextWindowTokens <= 10000) {
      logger.warn(
        `[AgentManager] contextWindow is set to ${contextWindowTokens}, which seems too small. ` +
        `This should be the model's INPUT context capacity (e.g. 200000 for Claude), NOT the output maxTokens. ` +
        `Falling back to ${detectedLimit}. Check your config agent.contextWindow setting.`
      );
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
    const safetyConfig = (config as any).safety || {};
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
    this.dailyLogManager = new DailyLogManager(
      config.storage.memoryDir || `${config.storage.sessionDir}/memories`
    );
    this.dailyLogManager.initialize().catch(err => {
      logger.warn('[AgentManager] DailyLogManager initialization failed:', err);
    });

    // Initialize Semantic Memory
    this.semanticMemory = new SemanticMemory(
      this.memorySystem,
      this.dailyLogManager,
    );
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

          // Also append to MEMORY.md for medium/high importance
          if (entry.importance === 'high' || entry.importance === 'medium') {
            await this.memorySystem.appendToMainMemory(entry.title, entry.content);
          }

          // Log to daily log as an insight
          await this.dailyLogManager.logInsight(
            `Session summary saved: "${entry.title}"`
          );
        } catch (error) {
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

          // Also append to MEMORY.md for medium/high importance
          if (entry.importance === 'high' || entry.importance === 'medium') {
            await this.memorySystem.appendToMainMemory(entry.title, entry.content);
          }

          await this.dailyLogManager.logInsight(
            `Context flushed to memory: "${entry.title}"`
          );
        } catch (error) {
          logger.error('[AgentManager] Failed to save flush memory:', error);
        }
      }
    });

    // Initialize Proactive Behavior
    this.proactiveBehavior = new ProactiveBehavior(
      this.config.proactive ?? undefined,
      this.memorySystem,
      this.dailyLogManager,
      () => this.getActiveSessions(),
    );

    // Register AI insight generator for proactive behavior
    this.proactiveBehavior.setAIInsightGenerator(async (context: string) => {
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
      } catch (err) {
        logger.debug('[Proactive] AI insight request failed:', err);
        return null;
      }
    });

    // Initialize Social Manager
    this.socialManager = new SocialAdapterManager();
    this.registerSocialAdapters();

    this.proactiveBehavior.on('suggestions', async (suggestions: ProactiveSuggestion[]) => {
      for (const s of suggestions) {
        logger.info(`[Proactive] [${s.priority}] ${s.title}: ${s.description}`);

        // Send push notification for medium/high priority suggestions
        if ((s.priority === 'high' || s.priority === 'medium') && typeof notification !== 'undefined') {
          try {
            await notification.show(`🤖 ${s.title}`, s.description);
            logger.info(`[Proactive] Notification sent: ${s.title}`);
          } catch (e) {
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
      read: async (p, _enc) => { if (typeof file !== 'undefined' && file.readText) { return file.readText(p, 'UTF-8'); } throw new Error('Anode file API not available'); },
      list: async (p) => { if (typeof file !== 'undefined' && file.listFiles) { const entries = await file.listFiles(p); return entries.map(e => ({ name: e.name, type: (e.isDirectory ? 'directory' : 'file') as 'file' | 'directory' })); } throw new Error('Anode file API not available'); },
      write: async (p, content) => { if (typeof file !== 'undefined' && file.writeText) { await file.writeText(p, content, 'UTF-8'); return; } throw new Error('Anode file API not available'); },
      delete: async (p) => { if (typeof file !== 'undefined' && file.delete) { await file.delete(p); return; } throw new Error('Anode file API not available'); },
      ensureDir: async (p) => { try { if (typeof file !== 'undefined' && file.createDirectory) { await file.createDirectory(p); } } catch { /* may already exist */ } },
    });
    this.loadPlugins();

    // Register built-in plugins (Calculator, Translator, Weather)
    this.registerBuiltinPlugins().catch(err => {
      logger.warn('[AgentManager] Failed to register builtin plugins:', err);
    });

    // Initialize Sub-Agent Coordinator
    this.subAgentCoordinator = new SubAgentCoordinator(
      config.model.apiKey,
      config.model.baseURL
    );
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
  private registerBuiltinTools(): void {
    for (const tool of builtinTools) {
      this.toolRegistry.register(tool, 'builtin', true);
    }
    logger.info(`Registered ${builtinTools.length} built-in tools`);
  }

  /**
   * Register all built-in skills
   */
  private registerBuiltinSkills(): void {
    for (const skill of builtinSkills) {
      this.skillManager.register(skill, 'builtin');
    }
    logger.info(`Registered ${builtinSkills.length} built-in skills`);
  }

  /**
   * Register default heartbeat tasks
   */
  private registerDefaultHeartbeatTasks(): void {
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
      this.heartbeatManager.register(
        this.proactiveBehavior.createHeartbeatTask()
      );

      logger.info('Registered default heartbeat tasks');
    } catch (error) {
      logger.warn('Failed to register some heartbeat tasks:', error);
    }
  }
  /**
   * Load plugins from filesystem and register their tools
   */
  private loadPlugins(): void {
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
          } catch (err) {
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
  private async registerBuiltinPlugins(): Promise<void> {
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
      } catch (err) {
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
  async createSession(options: CreateSessionOptions = {}): Promise<Session> {
    const sessionId = options.sessionId || generateSessionId();
    const model = options.model || this.config.model.model;

    logger.info(`Creating session: ${sessionId}`);

    // Build system prompt from identity files + default prompt
    let systemPrompt: string;
    if (options.systemPrompt) {
      // Explicit system prompt overrides identity system
      systemPrompt = options.systemPrompt;
    } else {
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
        const toolSummaries: Record<string, string> = {};
        for (const tool of allTools) {
          toolSummaries[tool.name] = tool.description;
        }

        // Get skill info
        const skillList = this.skillManager.list();
        const skillNames = skillList.map(s => s.id);
        const skillDescriptions: Record<string, string> = {};
        for (const skillInfo of skillList) {
          skillDescriptions[skillInfo.id] = skillInfo.description;
        }

        // Build runtime info
        const runtimeInfo: RuntimeInfo = {
          agentName: 'ClawdBot',
          agentVersion: '1.0.9',
          platform: 'android',
          model: model,
          timestamp: Date.now(),
          sessionId,
        };

        // Build full system prompt params
        const promptParams: SystemPromptParams = {
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
      } catch (err) {
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
  async loadSession(sessionId: string): Promise<Session> {
    // Check if already loaded
    if (this.sessions.has(sessionId)) {
      logger.debug(`Session already loaded: ${sessionId}`);
      return this.sessions.get(sessionId)!;
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
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   *
   * @param sessionId - Session ID to delete
   */
  async deleteSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session) {
      // Trigger session memory hook
      try {
        const history = session.buildContext();
        // Filter out system prompt for summary
        const conversation = history.filter(m => m.role !== 'system');

        const startTime = (session as any).createdAt || Date.now();
        const summary = createEmptySessionSummary(sessionId, startTime);

        // Populate summary with conversation text
        const messages = conversation.map(
          msg => `${msg.role}: ${typeof msg.content === 'string' ? msg.content : '[Complex Content]'}`
        ).join('\n\n');

        summary.summaryText = messages.slice(0, 5000); // Limit size
        summary.topics = ['Session Archive']; // Basic topic

        // Use hook to process and save
        await this.sessionMemoryHook.onSessionEnd(summary, conversation.length);
      } catch (error) {
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
  async sendMessage(sessionId: string, message: string, attachments?: MediaAttachment[]): Promise<AgentResponse> {
    // Use lane system to serialize execution per session
    return this.laneManager.enqueue(sessionId, {
      id: `msg-${Date.now()}`,
      name: `sendMessage:${sessionId}`,
      priority: 'normal',
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
  async sendMessageWithStreaming(
    sessionId: string,
    message: string,
    onStream: StreamingCallback,
    attachments?: MediaAttachment[]
  ): Promise<AgentResponse> {
    // Use lane system to serialize execution per session
    return this.laneManager.enqueue(sessionId, {
      id: `msg-${Date.now()}`,
      name: `sendMessage:${sessionId}`,
      priority: 'normal',
      execute: async () => {
        return this.processSendMessageWithStreaming(sessionId, message, onStream, attachments);
      },
    });
  }

  /**
   * Internal method to process send message (called by lane)
   */
  private async processSendMessage(sessionId: string, message: string, attachments?: MediaAttachment[]): Promise<AgentResponse> {
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
      const tempUserMessage: Message = {
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
        // Pre-compression memory flush
        const usageRatio = contextStatus.currentTokens / contextStatus.maxTokens;
        if (this.memoryFlushManager.shouldFlush(usageRatio)) {
          logger.info(`[AgentManager] Triggering memory flush (usage: ${(usageRatio * 100).toFixed(1)}%)`);
          const flushContext: FlushableContext = {
            sessionId: sessionId,
            messages: currentMessages.map(m => ({
              role: m.role as any,
              content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
              timestamp: m.timestamp,
              metadata: m.metadata
            })),
            contextUsage: usageRatio,
            reason: 'compression'
          };
          await this.memoryFlushManager.flush(flushContext).catch(err => {
            logger.error('[AgentManager] Memory flush failed:', err);
          });
        }

        logger.info(
          `[AgentManager] Auto-compressing context BEFORE adding user message: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`
        );

        // Perform auto-compression on current messages
        const compressedMessages = await this.contextGuard.autoCompress(currentMessages);

        // Update session with compressed messages
        session.replaceHistory(compressedMessages);

        logger.info(
          `[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`
        );

        // Emit session:compress event
        this.eventBus.emit('session:compress', {
          sessionId,
          beforeCount: currentMessages.length,
          afterCount: compressedMessages.length,
        });

        // Trigger session memory hook
        try {
          const summary = createEmptySessionSummary(sessionId, Date.now());
          const compressedText = currentMessages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '[Complex]'}`)
            .join('\n');
          summary.summaryText = compressedText.slice(0, 3000);
          summary.topics = ['Context Compression'];
          await this.sessionMemoryHook.onSessionEnd(summary, currentMessages.length);
          logger.debug('[AgentManager] Session memory saved after context compression');
        } catch (err) {
          logger.debug('[AgentManager] Session memory hook after compression failed:', err);
        }
      }

      // Now add user message (with multimodal content if attachments present)
      session.addMessage({
        role: 'user',
        content: userContent,
      });

      // Log to memory system
      this.memorySystem.appendLog(sessionId, {
        timestamp: Date.now(),
        role: 'user',
        content: message,
      }).catch(err => logger.debug('[Memory] Log append failed:', err));

      // Tool execution loop (no iteration limit - on device, almost all actions are tool calls)
      let iteration = 0;
      let finalResponse: AgentResponse | null = null;
      const accumulatedAttachments: MediaAttachment[] = [];

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

        // Enrich system prompt with semantic memory context (first iteration only)
        if (iteration === 1) {
          try {
            const relevantCtx = await this.semanticMemory.getRelevantContext(message);
            if (relevantCtx.content) {
              systemPrompt = systemPrompt + '\n\n' + relevantCtx.content;
              logger.debug(`[SemanticMemory] Injected ${relevantCtx.sources.length} relevant context(s) into prompt`);
            }
          } catch (err) {
            logger.debug('[SemanticMemory] Context enrichment failed:', err);
          }

          // Inject persistent memories from MemorySystem
          try {
            const memories = await this.memorySystem.semanticSearch(message, 5);
            if (memories.length > 0) {
              const memoryContext = memories.map(m => `- **${m.entry.title}**: ${m.entry.content.slice(0, 300)}`).join('\n');
              systemPrompt += '\n\n## Relevant Memories\n' + memoryContext;
              logger.debug(`[MemorySystem] Injected ${memories.length} persistent memory(s) into prompt`);
            }
          } catch (err) {
            logger.debug('[MemorySystem] Memory search failed:', err);
          }
        }

        // Filter out system message from messages
        const messages = context.filter((m) => m.role !== 'system');

        // Decide whether to include tools (ToolUsageStrategy)
        const toolMode: ToolStrategyMode = (this.config.agent.toolStrategy as ToolStrategyMode) || 'auto';
        const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
        let tools: any[] | undefined;

        if (toolDecision.shouldIncludeTools) {
          const registryTools = this.toolRegistry.toAnthropicFormat();
          const skillTools = this.skillManager.toAnthropicFormat();
          const allTools = [...registryTools, ...skillTools];
          if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
            // Filter tools by category
            const allRegistered = this.toolRegistry.getAll();
            const filteredNames = new Set<string>();
            for (const reg of allRegistered) {
              if (toolDecision.toolFilter.includes((reg as any).category)) {
                filteredNames.add((reg as any).name);
              }
            }
            // Always include skill tools (they have skill_ prefix)
            for (const st of skillTools) {
              filteredNames.add(st.name);
            }
            tools = filteredNames.size > 0
              ? allTools.filter((t: any) => filteredNames.has(t.name))
              : allTools; // fallback to all if filter yields nothing
          } else {
            tools = allTools;
          }
        } else {
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
          const approvedToolCalls: ToolCallType[] = [];
          const deniedToolCalls: ToolCallType[] = [];

          for (const toolCall of response.toolCalls) {
            try {
              // Request approval (returns immediately if tool is safe)
              const approvalResponse = await this.approvalManager.requestApproval(
                toolCall.name,
                toolCall.input,
                session.sessionId,
                `Tool: ${toolCall.name}`
              );

              if (approvalResponse.approved) {
                approvedToolCalls.push(toolCall);
              } else {
                deniedToolCalls.push(toolCall);
                logger.warn(
                  `Tool ${toolCall.name} denied by user: ${approvalResponse.reason || 'no reason'}`
                );
              }
            } catch (error) {
              // Timeout or other error - deny by default
              deniedToolCalls.push(toolCall);
              logger.error(`Approval failed for ${toolCall.name}:`, error);
            }
          }

          // Execute approved tools in parallel
          const toolResults = await Promise.all([
            ...approvedToolCalls.map(async (toolCall: ToolCallType) => {
              const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);
              try {
                // Route skill_* calls to SkillManager
                let result;
                if (toolCall.name.startsWith('skill_')) {
                  const skillId = toolCall.name.replace('skill_', '');
                  const skillResult = await this.skillManager.execute(skillId, toolCall.input);
                  result = {
                    success: skillResult.success,
                    output: skillResult.output != null ? (typeof skillResult.output === 'string' ? skillResult.output : JSON.stringify(skillResult.output)) : skillResult.error || 'Skill completed',
                    error: skillResult.error,
                  };
                } else {
                  // Execute before hooks
                  const hookCtx: ToolCallContext = {
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
                      error: beforeResult.overrideResult === undefined ? beforeResult.blockReason : undefined,
                    };
                  } else {
                    const effectiveInput = beforeResult.modifiedArgs || toolCall.input;
                    result = await this.toolExecutor.execute({ ...toolCall, input: effectiveInput }, {
                      context: {
                        sessionId: session.sessionId,
                      },
                    });
                  }

                  // Execute after hooks
                  const afterCtx: AfterToolCallContext = {
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
              } catch (error) {
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
            ...deniedToolCalls.map((toolCall: ToolCallType) => {
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
            const toolResult = toolResults[i];

            // Accumulate attachments from tool results
            if ('attachments' in toolResult && toolResult.attachments) {
              accumulatedAttachments.push(...(toolResult as any).attachments);
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
        this.semanticMemory.addToIndex(
          `msg:${sessionId}:${Date.now()}`,
          message,
          'session-summary',
          `User message in ${sessionId.slice(0, 8)}`
        ).catch(err => logger.debug('[SemanticMemory] Indexing failed:', err));

        // Proactive analysis after task completion
        this.proactiveBehavior.analyzeTaskCompletion(sessionSummary, 'success')
          .catch(err => logger.debug('[Proactive] Post-task analysis failed:', err));
      }

      // Auto-save if enabled
      if (this.config.agent.autoSave) {
        await session.save();
      }

      return finalResponse!;
    } catch (error) {
      // Log error to daily log
      this.dailyLogManager.logError(
        error instanceof Error ? error.message : 'Unknown error in processSendMessage'
      ).catch(() => { });
      return this.handleError(error);
    }
  }

  /**
   * Internal method to process send message with streaming (called by lane)
   */
  private async processSendMessageWithStreaming(
    sessionId: string,
    message: string,
    onStream: StreamingCallback,
    attachments?: MediaAttachment[]
  ): Promise<AgentResponse> {
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
          const flushContext: FlushableContext = {
            sessionId: sessionId,
            messages: currentMessages.map(m => ({
              role: m.role as any,
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

        logger.info(
          `[AgentManager] Auto-compressing context: ${contextStatus.currentTokens}/${contextStatus.maxTokens} tokens`
        );
        const compressedMessages = await this.contextGuard.autoCompress(currentMessages);
        logger.info(
          `[AgentManager] Context compressed: ${currentMessages.length} → ${compressedMessages.length} messages`
        );

        // Update session with compressed messages
        session.replaceHistory(compressedMessages);

        // Emit session:compress event
        this.eventBus.emit('session:compress', {
          sessionId,
          beforeCount: currentMessages.length,
          afterCount: compressedMessages.length,
        });

        // Trigger session memory hook to save summary of compressed context
        try {
          const summary = createEmptySessionSummary(sessionId, Date.now());
          const compressedText = currentMessages
            .filter(m => m.role !== 'system')
            .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : '[Complex]'}`)
            .join('\n');
          summary.summaryText = compressedText.slice(0, 3000);
          summary.topics = ['Context Compression'];
          await this.sessionMemoryHook.onSessionEnd(summary, currentMessages.length);
        } catch (err) {
          logger.debug('[AgentManager] Session memory hook after compression failed:', err);
        }
      }

      // Tool execution loop (no iteration limit)
      let iteration = 0;
      let finalResponse: AgentResponse | null = null;
      const accumulatedAttachments: MediaAttachment[] = [];

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

        // Enrich with semantic memory (first iteration only)
        if (iteration === 1) {
          try {
            const relevantCtx = await this.semanticMemory.getRelevantContext(message);
            if (relevantCtx.content) {
              systemPrompt = systemPrompt + '\n\n' + relevantCtx.content;
            }
          } catch (err) {
            logger.debug('[SemanticMemory] Context enrichment failed:', err);
          }

          // Inject persistent memories from MemorySystem
          try {
            const memories = await this.memorySystem.semanticSearch(message, 5);
            if (memories.length > 0) {
              const memoryContext = memories.map(m => `- **${m.entry.title}**: ${m.entry.content.slice(0, 300)}`).join('\n');
              systemPrompt += '\n\n## Relevant Memories\n' + memoryContext;
              logger.debug(`[MemorySystem] Injected ${memories.length} persistent memory(s) into prompt`);
            }
          } catch (err) {
            logger.debug('[MemorySystem] Memory search failed:', err);
          }
        }

        // Filter out system message
        const messages = context.filter((m) => m.role !== 'system');

        // Get tools
        const toolMode: ToolStrategyMode = (this.config.agent.toolStrategy as ToolStrategyMode) || 'auto';
        const toolDecision = ToolUsageStrategy.analyzeMessage(message, toolMode);
        let tools: any[] | undefined;

        if (toolDecision.shouldIncludeTools) {
          const registryTools = this.toolRegistry.toAnthropicFormat();
          const skillTools = this.skillManager.toAnthropicFormat();
          const allTools = [...registryTools, ...skillTools];
          if (toolDecision.toolFilter && toolDecision.toolFilter.length > 0) {
            const allRegistered = this.toolRegistry.getAll();
            const filteredNames = new Set<string>();
            for (const reg of allRegistered) {
              if (toolDecision.toolFilter.includes((reg as any).category)) {
                filteredNames.add((reg as any).name);
              }
            }
            // Always include skill tools
            for (const st of skillTools) {
              filteredNames.add(st.name);
            }
            tools = filteredNames.size > 0
              ? allTools.filter((t: any) => filteredNames.has(t.name))
              : allTools;
          } else {
            tools = allTools;
          }
        }

        // Use streaming API
        let accumulatedText = '';
        let accumulatedReasoningContent = '';
        let toolCalls: ToolCallType[] = [];
        let usage: { inputTokens: number; outputTokens: number } | undefined;

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
          } else if (chunk.type === 'thinking_delta' && chunk.delta) {
            // Accumulate reasoning content for DeepSeek reasoner
            accumulatedReasoningContent += chunk.delta;
          } else if (chunk.type === 'tool_use_start' && chunk.toolCall) {
            // Tool call detected - id and name are guaranteed on tool_use_start
            toolCalls.push({
              id: chunk.toolCall.id!,
              name: chunk.toolCall.name!,
              input: {},
            });
          } else if (chunk.type === 'tool_use_delta') {
            // Update tool input - delta contains the JSON fragment
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool && chunk.delta) {
              // Accumulate JSON input
              if (!(lastTool as any)._inputJson) {
                (lastTool as any)._inputJson = '';
              }
              (lastTool as any)._inputJson += chunk.delta;
            }
          } else if (chunk.type === 'tool_use_end') {
            // Parse accumulated input JSON
            const lastTool = toolCalls[toolCalls.length - 1];
            if (lastTool && (lastTool as any)._inputJson) {
              try {
                lastTool.input = JSON.parse((lastTool as any)._inputJson);
              } catch {
                lastTool.input = {};
              }
              delete (lastTool as any)._inputJson;
            }
          } else if (chunk.type === 'message_end' && chunk.usage) {
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
          const metadata: Record<string, any> = {
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
          const approvedToolCalls: ToolCallType[] = [];
          const deniedToolCalls: ToolCallType[] = [];

          for (const toolCall of toolCalls) {
            try {
              const approvalResponse = await this.approvalManager.requestApproval(
                toolCall.name,
                toolCall.input,
                session.sessionId,
                `Tool: ${toolCall.name}`
              );

              if (approvalResponse.approved) {
                approvedToolCalls.push(toolCall);
              } else {
                deniedToolCalls.push(toolCall);
                logger.warn(`Tool ${toolCall.name} denied`);
              }
            } catch (error) {
              deniedToolCalls.push(toolCall);
              logger.error(`Approval failed for ${toolCall.name}:`, error);
            }
          }

          // Execute approved tools
          const toolResults = await Promise.all([
            ...approvedToolCalls.map(async (toolCall: ToolCallType) => {
              const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);
              try {
                let result;
                if (toolCall.name.startsWith('skill_')) {
                  const skillId = toolCall.name.replace('skill_', '');
                  const skillResult = await this.skillManager.execute(skillId, toolCall.input);
                  result = {
                    success: skillResult.success,
                    output: skillResult.output != null ? (typeof skillResult.output === 'string' ? skillResult.output : JSON.stringify(skillResult.output)) : skillResult.error || 'Skill completed',
                    error: skillResult.error,
                  };
                } else {
                  // Execute before hooks
                  const hookCtx: ToolCallContext = {
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
                      error: beforeResult.overrideResult === undefined ? beforeResult.blockReason : undefined,
                    };
                  } else {
                    const effectiveInput = beforeResult.modifiedArgs || toolCall.input;
                    result = await this.toolExecutor.execute({ ...toolCall, input: effectiveInput }, {
                      context: { sessionId: session.sessionId },
                    });
                  }

                  // Execute after hooks
                  const afterCtx: AfterToolCallContext = {
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

                const toolDuration = toolTimer.end();
                this.eventBus.emit('tool:after', {
                  toolName: toolCall.name,
                  args: toolCall.input,
                  result: result.output,
                  duration: toolDuration,
                  sessionId: session.sessionId,
                });
                performanceMonitor.recordToolExecution(toolDuration);
                this.approvalManager.updateExecutionResult(toolCall.id, {
                  success: result.success,
                  output: result.output,
                  error: result.error ? JSON.stringify(result.error) : undefined,
                });
                return result;
              } catch (error) {
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
            const toolResult = toolResults[i];

            // Accumulate attachments from tool results
            if ('attachments' in toolResult && toolResult.attachments) {
              accumulatedAttachments.push(...(toolResult as any).attachments);
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

      return finalResponse!;
    } catch (error) {
      onStream('', `Error: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
      this.dailyLogManager.logError(
        error instanceof Error ? error.message : 'Unknown error in streaming'
      ).catch(() => { });
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
  private async processResponse(session: Session, modelResponse: any, attachments?: MediaAttachment[]): Promise<AgentResponse> {
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
  private handleError(error: any): AgentResponse {
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
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Test model API connection
   */
  async testConnection(): Promise<boolean> {
    return this.modelAPI.testConnection();
  }

  /**
   * Get tool registry
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Get tool executor
   */
  getToolExecutor(): ToolExecutor {
    return this.toolExecutor;
  }

  /**
   * Get registered tools
   */
  getTools(): any[] {
    return this.toolRegistry.getAll();
  }

  /**
   * Enable/disable a tool
   */
  setToolEnabled(toolName: string, enabled: boolean): boolean {
    if (enabled) {
      return this.toolRegistry.enable(toolName);
    } else {
      return this.toolRegistry.disable(toolName);
    }
  }

  /**
   * Get lane manager
   */
  getLaneManager(): LaneManager {
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
  cleanupIdleLanes(): void {
    this.laneManager.cleanupIdleLanes();
  }

  /**
   * Get context window guard
   */
  getContextGuard(): ContextWindowGuard {
    return this.contextGuard;
  }

  /**
   * Get context window status for a session
   */
  getContextStatus(sessionId: string) {
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
  getApprovalManager(): ApprovalManager {
    return this.approvalManager;
  }

  /**
   * Submit approval for a pending request
   */
  submitApproval(requestId: string, approved: boolean, reason?: string): void {
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
  getPendingApprovals(): ApprovalRequest[] {
    return this.approvalManager.getPendingRequests();
  }

  // ===== Heartbeat API =====

  /**
   * Get heartbeat manager
   */
  getHeartbeatManager(): HeartbeatManager {
    return this.heartbeatManager;
  }

  /**
   * Register a custom heartbeat task
   */
  registerHeartbeatTask(task: HeartbeatTaskConfig): void {
    this.heartbeatManager.register(task);
  }

  /**
   * List all heartbeat tasks
   */
  listHeartbeatTasks(): HeartbeatTaskState[] {
    return this.heartbeatManager.list();
  }

  /**
   * Pause/resume a heartbeat task
   */
  setHeartbeatTaskEnabled(taskId: string, enabled: boolean): void {
    if (enabled) {
      this.heartbeatManager.resume(taskId);
    } else {
      this.heartbeatManager.pause(taskId);
    }
  }

  // ===== Skills API =====

  /**
   * Get skill manager
   */
  getSkillManager(): SkillManager {
    return this.skillManager;
  }

  /**
   * Execute a skill by ID
   */
  async executeSkill(skillId: string, params: Record<string, any> = {}): Promise<SkillResult> {
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
  searchSkills(query: string) {
    return this.skillManager.search(query);
  }

  // ===== Identity/Prompt API =====

  /**
   * Get prompt builder (identity system)
   */
  getPromptBuilder(): PromptBuilder {
    return this.promptBuilder;
  }

  /**
   * Rebuild the system prompt for a session using current identity files
   */
  async rebuildSessionPrompt(sessionId: string, variables?: PromptVariables): Promise<string> {
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
  private registerSocialAdapters(): void {
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
  private initializeSocial(): void {
    const socialConfig = this.config.social;
    if (!socialConfig) {
      logger.info('[Social] No social config found, skipping');
      return;
    }

    // Map app config fields → PlatformConfig format
    const platforms: Record<string, PlatformConfig> = {};

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
    const broadcastConfigs: [string, any][] = [
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
      messageHandler: async (message: SocialMessage) => {
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
  private async buildUserContent(message: string, attachments?: MediaAttachment[]): Promise<MessageContent> {
    if (!attachments?.length) return message;

    const contentBlocks: Array<any> = [];
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
              } else {
                logger.warn(`[AgentManager] Failed to download image for Anthropic, degrading to text: ${att.url}`);
                contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.url} (download failed)]` });
              }
            } catch (err) {
              logger.warn('[AgentManager] Image download error:', err);
              contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.url} (error)]` });
            }
          } else {
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
        } else if (att.localPath) {
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
            } else {
              contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.localPath} (failed to read)]` });
            }
          } catch (err) {
            logger.warn('[AgentManager] Failed to read image file:', err);
            contentBlocks.push({ type: 'text', text: `[Image: ${att.filename || att.localPath} (error)]` });
          }
        }
      } else {
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
  private async readFileAsBase64(path: string): Promise<string | null> {
    try {
      // Use Node.js fs for reading binary files
      const fs = await import('fs/promises');
      const buffer = await fs.readFile(path);
      return buffer.toString('base64');
    } catch (error) {
      logger.warn(`[AgentManager] Failed to read file as base64: ${path}`, error);
      return null;
    }
  }

  /**
   * Convert MediaAttachments to SocialAttachments for platform sending
   */
  private convertToSocialAttachments(attachments?: MediaAttachment[]): SocialAttachment[] | undefined {
    if (!attachments?.length) return undefined;
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
  private async handleSocialMessage(message: SocialMessage): Promise<void> {
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
      const incomingAttachments: MediaAttachment[] | undefined = message.attachments?.map(att => ({
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
      const streamingEnabled = (this.config as any).streaming?.enabled !== false;

      if (streamingEnabled) {
        // Streaming mode: send placeholder, then edit with updates
        let sentMessageId: string | undefined;
        let lastUpdateTime = 0;
        const UPDATE_INTERVAL = 1000; // Telegram rate limit: ~1 edit per second

        try {
          // Send initial placeholder
          sentMessageId = await this.socialManager.sendMessageWithId(message.platform, {
            chatId: message.chatId,
            text: '思考中...',
            replyTo: message.messageId,
          });
        } catch (err) {
          logger.debug('[Social] sendMessageWithId not supported, falling back to non-streaming');
        }

        if (sentMessageId) {
          // Use streaming with periodic message edits
          const response = await this.sendMessageWithStreaming(
            sessionId,
            messageText,
            async (delta, accumulated, done) => {
              const now = Date.now();
              // Throttle updates to avoid rate limits
              if (done || (now - lastUpdateTime >= UPDATE_INTERVAL && accumulated.length > 0)) {
                lastUpdateTime = now;
                try {
                  // Show typing indicator with partial content
                  const displayText = done
                    ? accumulated
                    : accumulated + ' ▌';
                  await this.socialManager.editMessage(
                    message.platform,
                    message.chatId,
                    sentMessageId!,
                    displayText || '...'
                  );
                } catch (err) {
                  // Ignore edit errors (message might be deleted, etc.)
                  logger.debug('[Social] Message edit failed:', err);
                }
              }
            },
            incomingAttachments,
          );

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
        } else {
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
          } else if (response.type === 'error') {
            await this.socialManager.sendMessage(message.platform, {
              chatId: message.chatId,
              text: `Error: ${response.content}`,
              replyTo: message.messageId,
            });
          }
        }
      } else {
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
        } else if (response.type === 'error') {
          await this.socialManager.sendMessage(message.platform, {
            chatId: message.chatId,
            text: `Error: ${response.content}`,
            replyTo: message.messageId,
          });
        }
      }
    } catch (error) {
      logger.error(`[Social] Error handling message from ${chatKey}:`, error);
      try {
        await this.socialManager.sendMessage(message.platform, {
          chatId: message.chatId,
          text: `抱歉，处理消息时出错: ${(error as Error).message}`,
          replyTo: message.messageId,
        });
      } catch {
        // Ignore send errors
      }
    }
  }

  /**
   * Get social adapter manager
   */
  getSocialManager(): SocialAdapterManager {
    return this.socialManager;
  }

  /**
   * Get social platform status
   */
  getSocialStatus(): Record<string, any> {
    return this.socialManager.getStatus();
  }

  // ===== Memory System API =====

  /**
   * Get memory system
   */
  getMemorySystem(): MemorySystem {
    return this.memorySystem;
  }

  /**
   * Get daily log manager
   */
  getDailyLogManager(): DailyLogManager {
    return this.dailyLogManager;
  }

  /**
   * Get semantic memory
   */
  getSemanticMemory(): SemanticMemory {
    return this.semanticMemory;
  }

  /**
   * Get proactive behavior engine
   */
  getProactiveBehavior(): ProactiveBehavior {
    return this.proactiveBehavior;
  }

  // ===== Plugin System API =====

  /**
   * Get plugin registry
   */
  getPluginRegistry(): PluginRegistry {
    return this.pluginRegistry;
  }

  /**
   * Get plugin loader
   */
  getPluginLoader(): PluginLoader {
    return this.pluginLoader;
  }

  // ===== Sub-Agent API =====

  /**
   * Get sub-agent coordinator
   */
  getSubAgentCoordinator(): SubAgentCoordinator {
    return this.subAgentCoordinator;
  }

  // ===== Snapshot API =====

  /**
   * Get snapshot generator
   */
  getSnapshotGenerator(): SnapshotGenerator {
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
  async exportSession(sessionId: string, exportPath?: string): Promise<string> {
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
  async importSession(importPath: string, targetSessionId?: string): Promise<Session> {
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
  private registerDefaultToolHooks(): void {
    // After-hook: log tool executions to DailyLog
    this.toolHooksManager.onAfterToolCall('memory-logger', async (ctx) => {
      try {
        await this.dailyLogManager.logInsight(
          `Tool: ${ctx.toolName} (${ctx.duration}ms) → ${ctx.isError ? 'error' : 'ok'}`
        );
      } catch (err) {
        logger.debug('[ToolHook:memory-logger] Failed to log:', err);
      }
    }, 0);

    // After-hook: screenshot-ocr hint — append OCR suggestion when screenshot is taken
    this.toolHooksManager.onAfterToolCall('screenshot-ocr-hint', async (ctx) => {
      if (
        (ctx.toolName === 'android_screenshot' || ctx.toolName === 'android_take_screenshot') &&
        !ctx.isError
      ) {
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
  private registerEventBusConsumers(): void {
    // tool:after → log to DailyLog
    this.eventBus.on('tool:after', async (data) => {
      try {
        await this.dailyLogManager.logInsight(
          `Tool: ${data.toolName} (${data.duration}ms)`
        );
      } catch (err) {
        // silent
      }
    });

    // session:compress → log compression event
    this.eventBus.on('session:compress', async (data) => {
      try {
        await this.dailyLogManager.logInsight(
          `Context compressed: ${data.beforeCount} → ${data.afterCount} messages (session ${data.sessionId.slice(0, 8)})`
        );
      } catch (err) {
        // silent
      }
    });

    // memory:saved → log memory event
    this.eventBus.on('memory:saved', async (data) => {
      try {
        await this.dailyLogManager.logInsight(
          `Memory saved: "${data.title}" [${data.tags.join(', ')}]`
        );
      } catch (err) {
        // silent
      }
    });

    logger.info('[AgentManager] EventBus consumers registered');
  }

  // ===== Shutdown =====

  /**
   * Graceful shutdown of all systems
   */
  async shutdown(): Promise<void> {
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
