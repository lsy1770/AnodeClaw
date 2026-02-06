/**
 * Anode ClawdBot Entry Point
 *
 * Android AI Agent System powered by Claude
 */
import { logger } from './utils/logger.js';
import { ConfigManager } from './config/ConfigManager.js';
import { AgentManager } from './core/AgentManager.js';
// Export all modules
export * from './core/index.js';
export * from './config/index.js';
export * as Tools from './tools/index.js';
export * as UI from './ui/index.js';
export * as Plugins from './plugins/index.js';
export * as Social from './social/index.js';
export * from './utils/logger.js';
async function main() {
    logger.info('=== Anode ClawdBot Starting ===');
    logger.info('Version: 1.0.0');
    logger.info('Status: Production Ready');
    try {
        // Load configuration
        logger.info('Loading configuration...');
        const configManager = new ConfigManager();
        await configManager.load('./assets/config.default.json');
        const config = configManager.get();
        logger.info('Configuration loaded successfully');
        // Initialize AgentManager
        logger.info('Initializing Agent Manager...');
        new AgentManager(config);
        logger.info('Agent Manager initialized');
        // All phases complete!
        logger.info('=== Anode ClawdBot v1.0.0 Ready ===');
        logger.info('Available features:');
        logger.info('  [Phase 1] Configuration management with JSON5');
        logger.info('  [Phase 1] Session management with message tree');
        logger.info('  [Phase 1] Model API integration (Claude)');
        logger.info('  [Phase 1] Agent orchestration');
        logger.info('  [Phase 1] File-based persistence');
        logger.info('  [Phase 2] Tool system with 17 built-in tools');
        logger.info('  [Phase 2] Tool execution loop and parallel execution');
        logger.info('  [Phase 3] ChatWindow UI (FloatingWindow-based)');
        logger.info('  [Phase 3] SessionList UI');
        logger.info('  [Phase 3] SettingsPanel UI');
        logger.info('  [Phase 3] NotificationManager');
        logger.info('  [Phase 4] Plugin system with loader and registry');
        logger.info('  [Phase 4] 3 example plugins (Weather, Translator, Calculator)');
        logger.info('  [Phase 4] Plugin management UI');
        logger.info('  [Phase 5] Performance monitoring and optimization');
        logger.info('  [Phase 5] Security utilities and validation');
        logger.info('  [Phase 5] Complete documentation');
        logger.info('  [Social] Social platform integration (Telegram, Feishu, DingTalk, QQ, WeChat)');
        logger.info('  [Social] Multi-platform adapter framework');
        logger.info('Initialization successful');
        // Example usage (uncomment to test with real API key):
        /*
        logger.info('Creating test session...');
        const session = await agentManager.createSession();
        logger.info(`Session created: ${session.sessionId}`);
    
        logger.info('Sending test message...');
        const response = await agentManager.sendMessage(
          session.sessionId,
          'Hello! Can you introduce yourself?'
        );
        logger.info('Response:', response.content);
        */
    }
    catch (error) {
        logger.error('Initialization failed:', error);
        throw error;
    }
}
// Export main function for external use
export { main };
