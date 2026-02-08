/**
 * Configuration schema and types for Anode ClawdBot
 */
import { z } from 'zod';
/**
 * Model configuration schema
 */
export const ModelConfigSchema = z.object({
    provider: z.enum(['anthropic', 'openai', 'gemini']).default('anthropic'),
    model: z.string().default('claude-sonnet-4-5-20250929'),
    apiKey: z.string(),
    baseURL: z.string().optional(),
    maxTokens: z.number().int().positive().default(4096),
    temperature: z.number().min(0).max(2).default(1.0),
});
/**
 * Storage configuration schema
 */
export const StorageConfigSchema = z.object({
    sessionDir: z.string().default('./data/sessions'),
    memoryDir: z.string().default('./data/memory'),
    maxSessionSize: z.number().int().positive().default(10485760), // 10MB
    compressionEnabled: z.boolean().default(true),
});
/**
 * Agent configuration schema
 */
export const AgentConfigSchema = z.object({
    defaultSystemPrompt: z.string().default('You are a helpful AI assistant running on an Android device. You have access to various tools to help users automate tasks and interact with their device.'),
    contextWindowWarning: z.number().int().positive().default(3500),
    contextWindowMax: z.number().int().positive().default(4000),
    compressionEnabled: z.boolean().default(true),
    autoSave: z.boolean().default(true),
    toolStrategy: z.enum(['always', 'auto', 'off']).default('auto'),
});
/**
 * UI configuration schema
 */
export const UIConfigSchema = z.object({
    theme: z.enum(['light', 'dark', 'auto']).default('auto'),
    floatingWindow: z.object({
        width: z.number().int().positive().default(700),
        height: z.number().int().positive().default(1000),
        x: z.number().int().default(50),
        y: z.number().int().default(100),
        autoOpen: z.boolean().default(false), // 启动时是否自动打开聊天窗口
    }),
    notifications: z.object({
        enabled: z.boolean().default(true),
        showProgress: z.boolean().default(true),
    }),
});
/**
 * Social platform configuration schema
 */
export const SocialPlatformConfigSchema = z.object({
    telegram: z.object({
        enabled: z.boolean().default(false),
        botToken: z.string().optional(),
        broadcastChatId: z.string().optional(),
    }).optional(),
    qq: z.object({
        enabled: z.boolean().default(false),
        appId: z.string().optional(),
        token: z.string().optional(),
        broadcastChatId: z.string().optional(),
    }).optional(),
    wechat: z.object({
        enabled: z.boolean().default(false),
        // Wechaty 自动登录，无需额外配置
    }).optional(),
    discord: z.object({
        enabled: z.boolean().default(false),
        botToken: z.string().optional(),
        broadcastChatId: z.string().optional(),
    }).optional(),
    feishu: z.object({
        enabled: z.boolean().default(false),
        appId: z.string().optional(),
        appSecret: z.string().optional(),
        broadcastChatId: z.string().optional(),
    }).optional(),
    dingtalk: z.object({
        enabled: z.boolean().default(false),
        appKey: z.string().optional(),
        appSecret: z.string().optional(),
        broadcastChatId: z.string().optional(),
    }).optional(),
});
/**
 * Proactive behavior configuration schema
 */
export const ProactiveConfigSchema = z.object({
    enabled: z.boolean().default(true),
    checkInterval: z.number().int().positive().default(900000), // 15 min
    quietHoursStart: z.number().int().min(0).max(23).default(23),
    quietHoursEnd: z.number().int().min(0).max(23).default(7),
    repeatThreshold: z.number().int().positive().default(5),
    idleSessionTimeout: z.number().int().positive().default(7200000), // 2h
}).optional();
/**
 * Memory configuration schema
 */
export const MemoryConfigSchema = z.object({
    enabled: z.boolean().default(true),
    useVectorSearch: z.boolean().default(true),
});
/**
 * Main configuration schema
 */
export const ConfigSchema = z.object({
    model: ModelConfigSchema,
    storage: StorageConfigSchema,
    agent: AgentConfigSchema,
    ui: UIConfigSchema.optional(), // UI 配置是可选的（CLI 模式不需要）
    memory: MemoryConfigSchema.optional(), // 记忆系统配置（可选）
    social: SocialPlatformConfigSchema.optional(), // 社交平台配置（可选）
    proactive: ProactiveConfigSchema, // 主动行为配置（可选）
});
