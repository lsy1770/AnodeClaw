/**
 * Anode ClawdBot - 控制面板启动脚本
 *
 * 使用方式：
 * node start-ui.js
 *
 * 这将启动主控制面板，提供完整的配置和控制功能
 */
import { ConfigManager } from './config/ConfigManager.js';
import { logger } from './utils/logger.js';
import { ControlPanel } from './ui/ControlPanelUI.js'; // 使用新的 UIAPI 版本
async function startUI() {
    console.log('========================================');
    console.log('  Anode ClawdBot - Control Panel');
    console.log('========================================\n');
    try {
        // 1. 检查 UIAPI 是否可用
        console.log('[DEBUG] 步骤 1: 检查 UIAPI...');
        console.log(`[DEBUG] typeof ui = ${typeof ui}`);
        if (typeof ui === 'undefined') {
            console.log('\n⚠️  注意: UI 模式需要在 Android 设备上运行');
            console.log('UIAPI 仅在 Anode 平台上可用\n');
            console.log('当前环境信息:');
            console.log(`  Node 版本: ${process.version}`);
            console.log(`  平台: ${process.platform}`);
            console.log(`  架构: ${process.arch}\n`);
            console.log('要测试 ClawdBot 核心功能，请运行:');
            console.log('  node main.js          # CLI 模式');
            console.log('  node test-agent.js    # 基础测试\n');
            console.log('ℹ️  Running in non-Android environment');
            console.log('UI features are disabled.\n');
            process.exit(0);
        }
        console.log('[DEBUG] ✅ UIAPI 可用');
        // 2. 加载配置
        console.log('[DEBUG] 步骤 2: 加载配置...');
        logger.info('Loading configuration...');
        const configManager = new ConfigManager();
        // 优先使用环境变量 CLAWDBOT_CONFIG
        // 否则尝试当前目录下的 config.json
        // 最后使用默认配置 assets/config.default.json
        const configPath = process.env.CLAWDBOT_CONFIG || './config.json';
        try {
            await configManager.load(configPath);
            console.log(`[DEBUG] 配置已加载: ${configPath}`);
        }
        catch (error) {
            console.log('[DEBUG] 配置文件不存在，使用默认配置');
            await configManager.loadDefault();
            console.log('[DEBUG] 默认配置已加载: ./assets/config.default.json');
        }
        logger.info('Configuration loaded');
        // 3. 创建并显示控制面板
        console.log('[DEBUG] 步骤 3: 创建控制面板...');
        logger.info('Creating control panel...');
        const controlPanel = new ControlPanel(configManager);
        console.log('[DEBUG] 控制面板实例已创建');
        console.log('[DEBUG] 步骤 4: 显示控制面板...');
        await controlPanel.show({});
        console.log('[DEBUG] 控制面板已显示');
        console.log('✅ Control panel displayed!');
        console.log('========================================');
        console.log('  Anode ClawdBot Control Panel Started');
        console.log('  使用控制面板配置并启动聊天窗口');
        console.log('========================================\n');
        // 5. 设置信号处理
        console.log('[DEBUG] 步骤 5: 设置信号处理...');
        process.on('SIGINT', async () => {
            console.log('\n\nShutting down...');
            controlPanel.close();
            process.exit(0);
        });
        // 6. 保持进程运行
        console.log('[DEBUG] 步骤 6: 进入事件循环（保持运行）...');
        console.log('[DEBUG] 程序将保持运行，等待用户交互...\n');
        // 使用 setInterval 保持进程活跃
        setInterval(() => {
            // 每 60 秒输出一次心跳，证明程序还在运行
            console.log(`[HEARTBEAT] ${new Date().toISOString()} - Control panel is running...`);
        }, 60000);
        // 永远不会 resolve 的 Promise
        await new Promise(() => { });
    }
    catch (error) {
        console.error('[DEBUG] ❌ 捕获到错误！');
        console.error(`[DEBUG] 错误类型: ${error?.constructor?.name}`);
        console.error(`[DEBUG] 错误消息: ${error.message}`);
        logger.error('Failed to start control panel', { error: error.message });
        console.error('\n❌ Failed to start Anode ClawdBot Control Panel');
        console.error(error.message);
        if (error instanceof Error && error.stack) {
            console.error('\nStack trace:');
            console.error(error.stack);
        }
        console.error('\nPlease check:');
        console.error('  1. Configuration file exists and is valid');
        console.error('  2. API keys are configured correctly');
        console.error('  3. Required permissions are granted');
        console.error('  4. Running on Android device with Anode\n');
        process.exit(1);
    }
}
// 启动UI
console.log('[DEBUG] 开始执行 startUI()...');
startUI().catch(error => {
    console.error('[DEBUG] startUI() 未捕获的 Promise 拒绝:');
    console.error(error);
    process.exit(1);
});
