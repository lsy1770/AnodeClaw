/**
 * 测试 XML 生成 - 不依赖 UIAPI
 * 用于验证 ControlPanel 生成的 XML 是否有效
 */

import { ControlPanel } from './ui/ControlPanelUI.js';

console.log('========================================');
console.log('  测试 ControlPanel XML 生成');
console.log('========================================\n');

try {
    // 创建一个模拟的 configManager
    const mockConfigManager = {
        get: () => ({
            model: {
                provider: 'anthropic',
                apiKey: '',
                model: 'claude-sonnet-4-5-20250929',
                maxTokens: 4096,
                temperature: 1.0
            },
            agent: {
                defaultSystemPrompt: '你是一个有用的助手',
                contextWindowWarning: 3500
            },
            social: {}
        }),
        save: async () => {}
    };

    const panel = new ControlPanel(mockConfigManager);

    console.log('1. 测试主布局生成...');
    const mainXml = panel.createMainLayout();
    console.log(`✅ 主布局 XML 长度: ${mainXml.length} 字符\n`);

    console.log('2. 测试 AI 配置区域...');
    const aiXml = panel.createAIConfigSection();
    console.log(`✅ AI 配置 XML 长度: ${aiXml.length} 字符\n`);

    console.log('3. 测试渠道配置区域...');
    const channelsXml = panel.createChannelsConfigSection();
    console.log(`✅ 渠道配置 XML 长度: ${channelsXml.length} 字符\n`);

    console.log('4. 测试高级设置区域...');
    const advancedXml = panel.createAdvancedConfigSection();
    console.log(`✅ 高级设置 XML 长度: ${advancedXml.length} 字符\n`);

    // 验证 XML 基本格式
    console.log('5. 验证 XML 格式...');
    if (!mainXml.trim().startsWith('<')) {
        console.error('❌ XML 不以 < 开头！');
        process.exit(1);
    }

    if (!mainXml.includes('</LinearLayout>')) {
        console.error('❌ XML 缺少根闭合标签！');
        process.exit(1);
    }

    // 检查是否有未闭合的标签
    const openTags = (mainXml.match(/<(?!\/)[^>]+>/g) || []).length;
    const closeTags = (mainXml.match(/<\/[^>]+>/g) || []).length;
    const selfClosingTags = (mainXml.match(/<[^>]+\/>/g) || []).length;

    console.log(`   开标签: ${openTags}`);
    console.log(`   闭标签: ${closeTags}`);
    console.log(`   自闭标签: ${selfClosingTags}`);

    if (openTags !== closeTags) {
        console.warn(`⚠️  开标签和闭标签数量不匹配！这可能导致解析失败。`);
    }

    console.log('\n6. 输出完整 XML:');
    console.log('========================================');
    console.log(mainXml);
    console.log('========================================\n');

    console.log('✅ XML 生成测试完成！');
    console.log('如果上面的 XML 看起来正确，问题可能在 Android 端的解析。');

} catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
}
