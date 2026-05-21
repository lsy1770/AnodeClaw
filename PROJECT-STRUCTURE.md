# 📁 Anode ClawdBot v1.0.9 - 项目结构概览

**状态**: ✅ 生产就绪（Material 控制面板完成）
**版本**: v1.0.9
**更新**: 2026-02-04

> ⚠️ **重要更新 - UI API 修复完成**:
> - ✅ V8ValueError 已修复 → [V8 修复报告](docs/reports/V8-ERROR-FIX-REPORT.md)
> - ✅ API 名称已修正（`file` 而不是 `FileAPI`）→ [API 修复报告](docs/reports/API-PATH-FIX-COMPLETION-REPORT.md)
> - ✅ Javet 兼容性已修复（ES6 模块）→ [Javet 兼容性报告](docs/reports/JAVET-COMPATIBILITY-FINAL-REPORT.md)
> - ✅ **直接使用全局 API**（最终解决方案）→ [全局 API 修复报告](docs/reports/GLOBAL-API-FIX-FINAL.md)
> - ✅ **正确的 @V8Function 函数名** → [API 函数修复报告](docs/reports/API-FUNCTIONS-FIX-v1.0.6.md)
> - ✅ **所有 UI 组件 API 修复** → [UI API 修复完成报告](docs/reports/UI-API-FIX-COMPLETION-REPORT.md) ⭐
> - ✅ **TypeScript 编译输出结构修复** → [编译修复报告](docs/reports/TSCONFIG-FIX-AND-COMPILATION-REPORT.md)
> - ✅ **动态导入 (Dynamic Import) 修复** → [动态导入修复报告](docs/reports/DYNAMIC-IMPORT-FIX.md) 🔥
> - 📝 使用 `declare const file` + 直接访问全局变量
> - 📝 不依赖 acs-core 模块，更简单可靠
> - 📝 使用正确的 API 函数名（`file.readText`, `file.writeText`, `floatingWindow.create`, 等）
> - 📝 100% Javet 兼容
> - 🎯 **可在 Android 设备上运行**
> - 🎨 **UI 组件就绪**（ChatWindow, SessionList, SettingsPanel）

---

## 📂 根目录结构（简洁清晰）

```
AnodeClawd/
├── 📦 src/              555 KB    # TypeScript 源代码（81个文件）
├── 🎁 dist/             539 KB    # 编译产物（81个JS文件）
├── 📚 docs/             421 KB    # 文档中心（20个文档，已分类）
├── 🔧 scripts/          8 KB      # 工具脚本（已归类）
├── 🎨 assets/                     # 资源文件
├── 🧪 tests/                      # 测试文件
├── 📦 node_modules/               # 依赖包
├── 📄 package.json                # 项目配置
├── ⚙️  tsconfig.json              # TypeScript配置
├── ⚙️  tsconfig.build.json        # 构建配置
├── 🚫 .gitignore                  # Git忽略
├── 🤖 CLAUDE.md                   # Claude指南
└── 📖 README.md                   # 项目总览
```

## ✅ 关键入口文件

### 生产环境
- **dist/cli.js** (263 B) - CLI 模式启动入口 ⭐ 推荐
- **dist/main.js** (7.5 KB) - 核心 API 模块
- **dist/start-ui.js** (3.2 KB) - UI 模式启动脚本
- **dist/index.js** (3.5 KB) - API 导出模块

### 测试验证
- **dist/test-simple.js** (2.2 KB) - 简化功能测试 ⭐ 首次测试推荐
- **dist/test-agent.js** (3.1 KB) - 系统功能测试
- **dist/test-anode-apis.js** (5.7 KB) - API测试

## 📚 文档中心 (docs/)

```
docs/
├── README.md                     # 📖 文档索引
├── user/                         # 👤 用户文档（2个）
│   ├── QUICKSTART.md
│   └── USER-GUIDE.md
├── development/                  # 🔧 开发文档（4个）
│   ├── ACS-ClawdBot-Development-Plan.md
│   ├── PLUGIN-DEVELOPMENT-GUIDE.md
│   ├── MCP-DEPLOYMENT-GUIDE.md
│   └── TESTING-DEPLOYMENT-GUIDE.md
├── design/                       # 📐 设计文档（3个）
│   ├── Advanced-Features-Design.md
│   ├── Operational-Patterns-Design.md
│   └── OpenClaw.md
├── reports/                      # 📊 项目报告（7个）
│   ├── PROJECT-COMPLETION-REPORT.md
│   ├── DEPLOYMENT-STATUS-REPORT.md
│   ├── PROJECT-STATUS.md
│   ├── SOCIAL-INTEGRATION-SUMMARY.md
│   ├── FILE-MANIFEST.md
│   ├── PROJECT-CLEANUP-REPORT.md
│   └── SOCIAL-PLATFORM-INTEGRATION.md
└── phases/                       # 📅 阶段总结（6个）
    ├── PHASE1-SUMMARY.md
    ├── PHASE2-SUMMARY.md
    ├── PHASE3-SUMMARY.md
    ├── PHASE4-SUMMARY.md
    ├── PHASE5-PLAN.md
    └── PHASE5-SUMMARY.md
```

## 🔧 工具脚本 (scripts/)

```
scripts/
├── deployment/                   # 部署脚本
│   ├── deploy-and-test.js
│   ├── deploy-files.cjs
│   ├── deploy-test-only.cjs
│   ├── deploy-to-device.sh
│   └── mcp-deploy.sh
├── mcp/                          # MCP工具
│   ├── inspect-code-tools.cjs
│   ├── inspect-tool-schemas.cjs
│   ├── list-mcp-tools.cjs
│   ├── test-connection.cjs
│   ├── test-mcp-connection.js
│   └── verify-deployment.cjs
└── testing/                      # 测试脚本
    └── quick-test.cjs
```

## 📦 源代码结构 (src/)

```
src/ (81个TypeScript文件)
├── core/                         # 核心系统
│   ├── AgentManager.ts           # Agent协调器
│   ├── Session.ts                # 会话管理
│   ├── ModelAPI.ts               # 模型API
│   ├── FileSessionStorage.ts     # 文件存储
│   ├── context/                  # 上下文管理（5个）
│   ├── lane/                     # Lane队列系统（4个）
│   ├── memory/                   # 记忆系统（4个）
│   ├── prompts/                  # 提示词系统（4个）
│   ├── safety/                   # 安全系统（5个）
│   ├── snapshot/                 # 快照工具（5个）
│   └── subagents/                # 子代理系统（4个）
├── tools/                        # 工具系统
│   ├── ToolRegistry.ts           # 工具注册表
│   ├── ToolExecutor.ts           # 工具执行器
│   └── builtin/                  # 内置工具（17个）
├── ui/                           # 用户界面
│   ├── ChatWindow.ts             # 聊天窗口
│   ├── SessionList.ts            # 会话列表
│   ├── SettingsPanel.ts          # 设置面板
│   └── NotificationManager.ts    # 通知管理
├── social/                       # 社交平台（10个文件）
│   ├── SocialAdapterManager.ts   # 适配器管理
│   ├── BaseSocialAdapter.ts      # 基础适配器
│   └── adapters/                 # 平台适配器（5个）
│       ├── TelegramAdapter.ts
│       ├── WeChatAdapter.ts
│       ├── FeishuAdapter.ts
│       ├── DingTalkAdapter.ts
│       └── QQAdapter.ts
├── plugins/                      # 插件系统
│   ├── PluginRegistry.ts
│   ├── PluginLoader.ts
│   └── builtin/                  # 示例插件（3个）
├── config/                       # 配置系统
│   ├── ConfigManager.ts
│   └── schema.ts
├── utils/                        # 工具函数
│   ├── logger.ts
│   ├── id.ts
│   ├── security.ts
│   └── performance.ts
├── main.ts                       ✅ 主入口
├── start-ui.ts                   ✅ UI启动
└── index.ts                      ✅ 模块导出
```

## 📊 项目统计

| 项目 | 数量/大小 |
|-----|----------|
| TypeScript 源文件 | 81 个 |
| 编译后 JS 文件 | 81 个 |
| 文档文件 | 20 个 |
| 总源代码量 | ~18,000+ 行 |
| 编译后代码 | ~4,400 行 |
| 源代码目录大小 | 555 KB |
| 编译产物大小 | 539 KB |
| 文档大小 | 421 KB |
| 脚本大小 | 8 KB |

## 🎯 功能清单

### 核心功能 ✅
- ✅ Agent Manager - AI代理协调
- ✅ Session Management - 会话管理（支持分支）
- ✅ Model API - Claude/OpenAI/Gemini集成
- ✅ Configuration System - JSON5配置系统

### 工具系统 ✅
- ✅ 17个内置工具（文件、Android、网络、设备）
- ✅ 工具注册表和执行器
- ✅ 插件系统支持

### 用户界面 ✅
- ✅ 悬浮窗聊天界面
- ✅ 会话列表管理
- ✅ 设置面板
- ✅ 通知管理

### 社交平台 ✅
- ✅ Telegram 适配器
- ✅ WeChat 适配器
- ✅ Feishu 适配器
- ✅ DingTalk 适配器
- ✅ QQ Guild 适配器

### 高级特性 ✅
- ✅ Lane Queue System - 串行任务执行
- ✅ Hybrid Memory System - 混合记忆系统
- ✅ Context Window Guard - 上下文窗口保护
- ✅ Safe Command Approval - 安全命令审批
- ✅ Semantic Snapshot Tool - 语义快照
- ✅ Dynamic System Prompts - 动态提示词
- ✅ Sub-Agent System - 多智能体协作

## 🚀 快速开始

### 1. 首次测试（推荐）
```bash
# 简化功能测试，不使用 readline，适合编辑器运行
node /sdcard/ACS/.anode-clawdbot/dist/test-simple.js
```

### 2. CLI 模式
```bash
# 命令行交互模式，需要 readline 支持
node /sdcard/ACS/.anode-clawdbot/dist/cli.js
```

### 3. UI 模式
```bash
# UI 悬浮窗模式（需要 Android 环境）
node /sdcard/ACS/.anode-clawdbot/dist/start-ui.js
```

### 4. API 集成
```javascript
import { createClawdBot } from '/sdcard/ACS/.anode-clawdbot/dist/main.js';
const bot = await createClawdBot();
const session = await bot.createSession({
  systemPrompt: 'You are a helpful assistant'
});
```

## 📖 更多信息

- **快速开始**: [docs/user/QUICKSTART.md](docs/user/QUICKSTART.md)
- **开发指南**: [docs/development/ACS-ClawdBot-Development-Plan.md](docs/development/ACS-ClawdBot-Development-Plan.md)
- **完成报告**: [docs/reports/PROJECT-COMPLETION-REPORT.md](docs/reports/PROJECT-COMPLETION-REPORT.md)
- **文档索引**: [docs/README.md](docs/README.md)

---

**项目状态**: 🎉 v1.0.9 生产就绪（Material 控制面板）
**最后更新**: 2026-02-04

## 🔄 版本历史

| 版本 | 主要更新 | 日期 |
|------|---------|------|
| v1.0.0 | 初始版本 | 2026-02-03 |
| v1.0.1 | V8ValueError 修复 | 2026-02-04 |
| v1.0.2 | CommonJS 尝试（失败） | 2026-02-04 |
| v1.0.3 | ES6 模块 + 全局变量检测 | 2026-02-04 |
| v1.0.4 | acs-core 模块导入（失败） | 2026-02-04 |
| v1.0.5 | **直接使用全局 API** ✅ | 2026-02-04 |
| v1.0.6 | **正确的 @V8Function 函数名** ✅ | 2026-02-04 |
| v1.0.7 | **所有 UI API 修复完成** ✅ | 2026-02-04 |
| v1.0.8 | **动态导入修复 + TypeScript 编译修复** ✅ | 2026-02-04 |
| v1.0.9 | **Material 控制面板 + 完整配置管理** ✅ | 2026-02-04 |
