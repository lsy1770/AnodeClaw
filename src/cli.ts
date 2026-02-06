/**
 * Anode ClawdBot - CLI 启动入口
 *
 * 使用方式：
 * node dist/cli.js
 */

import { main } from './main.js';

// 启动 CLI 模式
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
