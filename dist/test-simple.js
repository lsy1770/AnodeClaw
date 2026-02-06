/**
 * Anode ClawdBot - 简单功能测试
 *
 * 不使用 readline，适合在 Javet 环境中测试
 */
import { createClawdBot } from './main.js';
async function testBasicFunctionality() {
    console.log('========================================');
    console.log('  Anode ClawdBot - 基础功能测试');
    console.log('========================================\n');
    try {
        // 测试 1: 创建 ClawdBot 实例
        console.log('测试 1: 创建 ClawdBot 实例...');
        const bot = await createClawdBot();
        console.log('✅ ClawdBot 创建成功\n');
        // 测试 2: 创建会话
        console.log('测试 2: 创建会话...');
        const session = await bot.createSession({
            systemPrompt: 'You are a helpful AI assistant for testing purposes.',
        });
        console.log(`✅ 会话创建成功: ${session.sessionId}\n`);
        // 测试 3: 获取工具列表
        console.log('测试 3: 获取工具列表...');
        const tools = bot.getTools();
        console.log(`✅ 工具列表: ${tools.length} 个工具\n`);
        // 测试 4: 获取 Lane 状态
        console.log('测试 4: 获取 Lane 状态...');
        const laneStatus = bot.getLaneStatus();
        console.log(`✅ Lane 状态: ${Object.keys(laneStatus).length} 个 lane\n`);
        // 测试 5: 发送简单消息（可选 - 需要有效的 API Key）
        console.log('测试 5: 发送测试消息...');
        console.log('⚠️  跳过（需要配置 API Key）\n');
        // 测试 6: 清理资源
        console.log('测试 6: 清理资源...');
        await bot.shutdown();
        console.log('✅ 资源清理完成\n');
        console.log('========================================');
        console.log('  ✅ 所有基础测试通过！');
        console.log('========================================');
    }
    catch (error) {
        console.error('\n❌ 测试失败:');
        console.error(`错误类型: ${error.name}`);
        console.error(`错误信息: ${error.message}`);
        console.error(`\n堆栈跟踪:\n${error.stack}`);
        process.exit(1);
    }
}
// 运行测试
testBasicFunctionality();
