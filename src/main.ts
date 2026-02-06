/**
 * Anode ClawdBot - 生产环境主入口
 *
 * 使用方式：
 * 1. 命令行模式：node main.js
 * 2. API模式：import { createClawdBot } from './main.js'
 */

import { AgentManager } from './core/AgentManager.js';
import { ConfigManager } from './config/ConfigManager.js';
import { logger } from './utils/logger.js';
import readline from 'readline';

// Anode global file API
declare const file: {
  createDirectory(path: string): Promise<boolean>;
};

/**
 * 确保所有必要的数据目录存在
 */
async function ensureDataDirectories(config: any): Promise<void> {
  const dirs = [
    config.storage.sessionDir,                    // ./data/sessions
    `${config.storage.sessionDir}/logs`,           // ./data/sessions/logs
    config.storage.memoryDir,                      // ./data/memory
    `${config.storage.memoryDir}/daily`,           // ./data/memory/daily
  ];

  if (typeof file === 'undefined' || !file.createDirectory) {
    logger.warn('[Init] file.createDirectory not available, skipping directory creation');
    return;
  }

  for (const dir of dirs) {
    try {
      await file.createDirectory(dir);
      logger.debug(`[Init] Directory ensured: ${dir}`);
    } catch {
      // Directory may already exist
    }
  }
  logger.info('[Init] Data directories ready');
}

/**
 * 创建ClawdBot实例
 */
async function createClawdBot(configPath: string | null = null) {
  try {
    // 1. 加载配置
    logger.info('Loading configuration...');
    const configManager = new ConfigManager();
    const configFile = configPath || './config.json';
    const config = await configManager.load(configFile);

    logger.info('Configuration loaded', {
      provider: config.model.provider,
      model: config.model.model,
    });

    // 2. 创建必要的数据目录
    await ensureDataDirectories(config);

    // 3. 初始化AgentManager
    logger.info('Initializing AgentManager...');
    const agentManager = new AgentManager(config);

    logger.info('ClawdBot initialized successfully', {
      tools: agentManager.getTools().length,
      lanes: Object.keys(agentManager.getLaneStatus()).length,
    });

    return {
      agentManager,
      config,

      /**
       * 创建新会话
       */
      async createSession(options: any = {}) {
        return await agentManager.createSession(options);
      },

      /**
       * 发送消息
       */
      async sendMessage(sessionId: string, message: string) {
        return await agentManager.sendMessage(sessionId, message);
      },

      /**
       * 加载现有会话
       */
      async loadSession(sessionId: string) {
        return await agentManager.loadSession(sessionId);
      },

      /**
       * 获取会话
       */
      getSession(sessionId: string) {
        return agentManager.getSession(sessionId);
      },

      /**
       * 删除会话
       */
      async deleteSession(sessionId: string) {
        return await agentManager.deleteSession(sessionId);
      },

      /**
       * 获取工具列表
       */
      getTools() {
        return agentManager.getTools();
      },

      /**
       * 获取Lane状态
       */
      getLaneStatus() {
        return agentManager.getLaneStatus();
      },

      /**
       * 清理资源
       */
      async shutdown() {
        logger.info('Shutting down ClawdBot...');
        logger.info('ClawdBot shutdown complete');
      },
    };
  } catch (error) {
    logger.error('Failed to initialize ClawdBot', { error: (error as Error).message });
    throw error;
  }
}

/**
 * 命令行交互模式
 */
async function runCLI() {
  console.log('========================================');
  console.log('  Anode ClawdBot - CLI Mode');
  console.log('========================================\n');

  try {
    // 创建ClawdBot实例
    const bot = await createClawdBot();

    // 创建新会话
    console.log('Creating new session...');
    const session = await bot.createSession({
      systemPrompt: 'You are a helpful AI assistant running on Android via Anode platform.',
    });
    console.log(`Session created: ${session.sessionId}\n`);

    // 创建readline接口
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'You: ',
    });

    console.log('Type your message and press Enter. Type "exit" to quit.\n');
    rl.prompt();

    rl.on('line', async (line: string) => {
      const input = line.trim();

      // 处理退出命令
      if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log('\nShutting down...');
        await bot.shutdown();
        rl.close();
        process.exit(0);
        return;
      }

      // 处理特殊命令
      if (input.startsWith('/')) {
        await handleCommand(input, bot, session);
        rl.prompt();
        return;
      }

      // 跳过空输入
      if (!input) {
        rl.prompt();
        return;
      }

      try {
        // 发送消息
        console.log('\nAssistant: (thinking...)\n');
        const response = await bot.sendMessage(session.sessionId, input);

        console.log(`Assistant: ${response.content}\n`);
      } catch (error) {
        console.error(`\n❌ Error: ${(error as Error).message}\n`);
      }

      rl.prompt();
    });

    rl.on('close', async () => {
      console.log('\nGoodbye!');
      await bot.shutdown();
      process.exit(0);
    });

    // 处理中断信号
    process.on('SIGINT', async () => {
      console.log('\n\nReceived SIGINT, shutting down...');
      await bot.shutdown();
      rl.close();
      process.exit(0);
    });
  } catch (error) {
    console.error('Failed to start CLI:', (error as Error).message);
    console.error((error as Error).stack);
    process.exit(1);
  }
}

/**
 * 处理命令
 */
async function handleCommand(cmd: string, bot: any, session: any) {
  const parts = cmd.slice(1).split(' ');
  const command = parts[0].toLowerCase();

  switch (command) {
    case 'help':
      console.log('\nAvailable commands:');
      console.log('  /help      - Show this help');
      console.log('  /tools     - List available tools');
      console.log('  /status    - Show system status');
      console.log('  exit       - Exit the program\n');
      break;

    case 'tools':
      const tools = bot.getTools();
      console.log(`\nAvailable tools (${tools.length}):`);
      for (const tool of tools) {
        console.log(`  - ${tool.name}: ${tool.description}`);
      }
      console.log();
      break;

    case 'status':
      const laneStatus = bot.getLaneStatus();
      console.log('\nSystem Status:');
      console.log(`  Session: ${session.sessionId}`);
      console.log(`  Tools: ${bot.getTools().length} registered`);
      console.log(`  Lanes: ${Object.keys(laneStatus).length} active`);
      console.log();
      break;

    default:
      console.log(`\nUnknown command: ${command}`);
      console.log('Type /help for available commands\n');
  }
}

/**
 * 主函数
 */
async function main() {
  // 检查命令行参数
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log('Anode ClawdBot - AI Agent System for Android\n');
    console.log('Usage:');
    console.log('  node main.js              Run in CLI mode');
    console.log('  node main.js --config <path>  Use custom config file');
    console.log('  node main.js --help       Show this help\n');
    console.log('For API usage, import createClawdBot from this module.');
    return;
  }

  // 运行CLI模式
  await runCLI();
}

// 导出 createClawdBot 和 main 函数供外部调用
// createClawdBot: 创建 ClawdBot 实例的工厂函数（用于 API 模式）
// main: CLI 模式入口函数
export { createClawdBot, main };
