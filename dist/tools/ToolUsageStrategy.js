/**
 * Tool Usage Strategy
 *
 * Client-side heuristic to decide whether to include the tools array
 * in model API calls. Saves tokens on pure knowledge/code questions
 * where tools are unnecessary.
 */
import { logger } from '../utils/logger.js';
/**
 * Keyword → tool category mapping
 */
const CATEGORY_KEYWORDS = {
    file: ['文件', '读取', '写入', '保存', '删除文件', '目录', '文件夹',
        'file', 'read', 'write', 'save', 'delete file', 'directory', 'folder', 'path'],
    android: ['点击', '滑动', '截图', '屏幕', '应用', '安装', '卸载', '自动化',
        'click', 'tap', 'swipe', 'screenshot', 'screen', 'app', 'install', 'uninstall', 'automate'],
    network: ['网络', '请求', '下载', '上传', 'http', 'fetch', 'download', 'upload', 'url', 'api'],
    device: ['设备', '电池', '音量', '亮度', '状态',
        'device', 'battery', 'volume', 'brightness', 'status'],
    ui: ['界面', '窗口', '弹窗', '通知', 'toast', 'window', 'dialog', 'notification', 'ui'],
};
/**
 * Action keywords that indicate tools should be included
 */
const ACTION_KEYWORDS = [
    // Chinese
    '帮我', '执行', '运行', '创建', '删除', '修改', '打开', '关闭',
    '发送', '获取', '查找', '搜索', '安装', '卸载', '点击', '截图',
    '滑动', '输入', '读取', '写入', '下载', '上传', '复制', '移动',
    '重命名', '启动', '停止', '设置', '操作',
    // English
    'create', 'delete', 'remove', 'run', 'execute', 'open', 'close',
    'send', 'get', 'find', 'search', 'install', 'uninstall', 'click',
    'screenshot', 'swipe', 'type', 'read', 'write', 'download', 'upload',
    'copy', 'move', 'rename', 'start', 'stop', 'set', 'modify', 'update',
    'list files', 'show files', 'check battery',
];
/**
 * Knowledge-only patterns — exclude tools when these are the primary intent
 */
const KNOWLEDGE_PATTERNS = [
    // Chinese
    /^(什么是|为什么|解释一下|介绍一下|请问|谁是|怎么理解|什么叫)/,
    /^(.*的意思|.*的区别|.*的概念|.*是什么)/,
    /^(讲讲|说说|聊聊|谈谈)/,
    // English
    /^(what is|what are|why|explain|describe|who is|how does|what does)/i,
    /^(tell me about|can you explain|define|meaning of)/i,
    /\?(what|why|how|who|when|where|which)\b/i,
];
/**
 * Code example patterns — exclude tools
 */
const CODE_PATTERNS = [
    // Chinese
    /代码示例/, /如何实现/, /怎么写/, /代码怎么/, /给我.*代码/,
    /写一个.*函数/, /写一个.*类/, /实现.*算法/,
    // English
    /code example/i, /how to implement/i, /how to write/i,
    /write a.*function/i, /write a.*class/i, /implement.*algorithm/i,
    /show me.*code/i, /sample code/i,
];
export class ToolUsageStrategy {
    /**
     * Analyze a user message and decide whether to include tools
     */
    static analyzeMessage(message, mode = 'auto') {
        // Mode overrides
        if (mode === 'always') {
            return { shouldIncludeTools: true, reasoning: 'Mode set to always' };
        }
        if (mode === 'off') {
            return { shouldIncludeTools: false, reasoning: 'Mode set to off' };
        }
        const trimmed = message.trim();
        // Empty or very short messages — include tools as safe fallback
        if (trimmed.length < 2) {
            return { shouldIncludeTools: true, reasoning: 'Message too short to analyze' };
        }
        // Check action keywords first (higher priority)
        const lowerMessage = trimmed.toLowerCase();
        for (const keyword of ACTION_KEYWORDS) {
            if (lowerMessage.includes(keyword.toLowerCase())) {
                const categories = ToolUsageStrategy.inferToolCategories(lowerMessage);
                logger.debug(`[ToolStrategy] Action keyword "${keyword}" detected, categories: ${categories.join(',') || 'all'}`);
                return {
                    shouldIncludeTools: true,
                    reasoning: `Action keyword detected: "${keyword}"`,
                    toolFilter: categories.length > 0 ? categories : undefined,
                };
            }
        }
        // Check knowledge-only patterns
        for (const pattern of KNOWLEDGE_PATTERNS) {
            if (pattern.test(trimmed)) {
                logger.debug(`[ToolStrategy] Knowledge pattern matched, excluding tools`);
                return {
                    shouldIncludeTools: false,
                    reasoning: 'Knowledge question detected — tools not needed',
                };
            }
        }
        // Check code example patterns
        for (const pattern of CODE_PATTERNS) {
            if (pattern.test(trimmed)) {
                logger.debug(`[ToolStrategy] Code pattern matched, excluding tools`);
                return {
                    shouldIncludeTools: false,
                    reasoning: 'Code example request detected — tools not needed',
                };
            }
        }
        // Default: include tools (safe fallback)
        return {
            shouldIncludeTools: true,
            reasoning: 'No exclusion pattern matched — including tools as fallback',
        };
    }
    /**
     * Infer which tool categories are relevant based on message keywords
     */
    static inferToolCategories(message) {
        const lower = message.toLowerCase();
        const matched = [];
        for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
            for (const keyword of keywords) {
                if (lower.includes(keyword.toLowerCase())) {
                    if (!matched.includes(category)) {
                        matched.push(category);
                    }
                    break;
                }
            }
        }
        return matched;
    }
}
