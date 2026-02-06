# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Anode ClawdBot** is an AI Agent system designed for Android that runs on the Javet Node.js engine within the ACS (Android Code Studio) platform. This project takes architectural inspiration from ClawdBot but is specifically redesigned for Android automation.

**Current Status**: Planning/Design phase - no implementation code exists yet. The repository contains comprehensive design documents.

**Key Design Documents**:
- `ACS-ClawdBot-Development-Plan.md` - Main development roadmap and architecture
- `Advanced-Features-Design.md` - Advanced features (Lane queues, memory systems, sub-agents)
- `Operational-Patterns-Design.md` - Behavioral patterns and identity system
- `OpenClaw.md` - ClawdBot architecture analysis (reference only)

## Architecture

### Core Philosophy
- **Reference, not port** - Learn from ClawdBot's architecture but redesign for Android
- **Anode-first** - Leverage ACS native API capabilities
- **Android native** - Focus on Android platform features and UX
- **Simple & efficient** - Avoid over-engineering, focus on core functionality

### System Architecture (3 Layers)

1. **User Interface Layer**
   - FloatingWindowAPI-based chat interface
   - Notification bar quick access
   - Session list and settings panels

2. **Core Engine Layer**
   - **Agent Manager**: Session management, conversation handling, model interaction
   - **Tool System**: Unified tool interface, registry, plugin support
   - **Config Manager**: JSON5-based configuration with environment variable substitution

3. **Anode Capabilities Layer**
   - AutomatorAPI (Android Accessibility automation)
   - UIAPI (Android native UI)
   - FloatingWindowAPI (floating windows)
   - FileAPI, NetworkAPI, DeviceAPI, ImageAPI, MediaAPI
   - Code, etc

### debug Tool
- I design a mcp tool ,it can connect Anode to debug、write、delete file 
- it's name call acs-android
- parameter：服务器名称
```
acs-android
命令
node
参数
1 项
C:\Users\17706\AppData\Roaming\npm\node_modules\@anthropic\acs-mcp-client\bin\acs-mcp.js

添加参数
自动启动
启用自动启动

环境变量
2 项
ACS_HOST
192.168.31.102

ACS_PORT
8765

添加环境变量
执行命令
node C:\Users\17706\AppData\Roaming\npm\node_modules\@anthropic\acs-mcp-client\bin\acs-mcp.js  

```

### Key Components

**Session Management**:
- Message tree structure (supports branching/regeneration)
- File-based persistence (JSON format)
- Context management with pruning and compression

**Tool System**:
- 18+ built-in tools planned (file ops, Android automation, network, UI, device info)
- Plugin architecture for third-party extensions
- Permission control and execution strategies

**Lane Queue System** (Advanced):
- Serial-by-default execution model to avoid race conditions
- Parallel lane for independent tasks
- Per-session lanes for isolation

## Development Roadmap

The project follows a 6-phase development plan (12-16 weeks):

1. **Phase 1** (2-3 weeks): Core architecture - Agent Manager, Session management
2. **Phase 2** (3-4 weeks): Tool system - 18+ built-in tools
3. **Phase 3** (2-3 weeks): UI development - FloatingWindow-based interface
4. **Phase 4** (1-2 weeks): Plugin system
5. **Phase 5** (2-3 weeks): Optimization and testing
6. **Phase 6** (1 week): Packaging and ACS platform integration

## Code Modification Principles

- When modifying existing files, first check the existing patterns and styles of the codebase
- Reuse existing services and utility functions as much as possible to avoid duplicate code
- Follow the project's existing error handling and logging patterns

## Development Workflow

- Feature Development: Always start by understanding the existing code and reusing existing services and patterns
- Code Review: Focus on security (encrypted storage), performance (asynchronous processing), and error handling
- Pre-deployment Checks: Run lint → test functionality → check logs → build
- Documentation Management: Established documents must be categorized and stored strictly according to the organization under the docs folder. Random placement of documents is prohibited

## UnderStand Anode Design System
- Combine Anode System and Code to develop
- Anode code in D:\ACS-C\ACS_GooglePlay (this is a branch,main branch in D:\ACS-C\ACS,just someWhere is diffrent)

## Technology Stack

**Runtime**: Javet Node.js Engine (Node.js 18+/20+),also have mininal terminal ,include npm and libnode.so file ,it can run npm and nodejs in terminal ,but no i18 support
**Key Point File**:[text](../ACS_GooglePlay/nodeNative/src/main/java/com/yunxi/Nodejs/engine/LoopScriptEngine.kt) [text](../ACS_GooglePlay/nodeNative/src/main/java/com/yunxi/Nodejs/engine/ModuleResolver.kt) [text](../ACS_GooglePlay/nodeNative/src/main/java/com/yunxi/Nodejs/engine/NodeJsEngine.kt)[text](../ACS_GooglePlay/app/src/main/java/com/yunxi/model/TerminalModel.kt)、[text](../ACS_GooglePlay/nodeNative/src/main/java/com/yunxi/Nodejs/api)、[text](../ACS_GooglePlay/nodeNative/src/main/java/com/yunxi/Nodejs/engine/ScriptRuntime.kt)
**Language**: TypeScript/JavaScript (target: ES2021)
**Platform**: Android (arm64-v8a)
**UI**: Android Native XML + FloatingWindow(reuse native expose js layer api)
**Automation**: Android Accessibility Service

**Core Dependencies** (minimal):
```json
{
  "@anthropic-ai/sdk": "^0.20.0",
  "openai": "^4.0.0",
  "zod": "^3.22.0",
  "json5": "^2.2.3"
}
```

**External APIs** (provided by ACS):
- AutomatorAPI, UIAPI, FloatingWindowAPI
- FileAPI, NetworkAPI, DeviceAPI
- ImageAPI, MediaAPI

## Planned Project Structure

```
anode-clawdbot/
├─ src/
│  ├─ core/           # Agent manager, session, model API, context
│  ├─ tools/          # Tool system, registry, built-in tools, plugins
│  ├─ ui/             # Chat window, session list, settings, notifications
│  ├─ config/         # Configuration loading and management
│  ├─ utils/          # Logger, ID generation, XML helpers
│  └─ index.ts        # Entry point
├─ assets/            # Default config, system prompts, icons
├─ plugins/           # Example plugins (weather, translator, calculator)
├─ docs/              # User guide, developer guide, API reference
├─ tests/             # Unit and integration tests
├─ project.json       # ACS project configuration
├─ package.json
├─ tsconfig.json
└─ README.md
```

## Key Design Decisions

### Why Not Port ClawdBot?
ClawdBot is desktop-focused with multi-channel support, heavy dependencies, and includes many Android-inappropriate features (Playwright, message channels, etc.). A clean redesign allows:
- Simpler architecture focused on Android
- Full utilization of Anode native capabilities
- Lightweight dependencies
- Better performance and UX

### Why Floating Window UI?
- Matches AI assistant use case (always accessible)
- Doesn't interrupt current user operations
- Can work alongside other apps
- More flexible interaction model

### Tool System Principles
- Unified interface for all tools
- Permission checks before execution
- Detailed error information without breaking main flow
- Support for both built-in and plugin tools

### Session Management Strategy
- Message tree structure for branching conversations
- Auto-save after each interaction
- JSON format with optional compression
- Export/import support

## Important Considerations

### When Implementing Code

1. **TypeScript strict mode** - All code should use strict TypeScript
2. **Error handling** - Tool failures should not break the conversation flow
3. **Security** - Path sanitization, permission checks, input validation
4. **Anode API usage** - Use native APIs (AutomatorAPI, FileAPI, etc.) instead of Node.js equivalents
5. **Memory efficiency** - This runs on mobile devices, be mindful of memory usage

### Testing Strategy

- **Unit tests**: Use Vitest, mock Anode APIs, target 80%+ coverage
- **Integration tests**: Full conversation flows, tool chains, UI interactions
- **Real device testing**: Multi-device compatibility, performance, stability

### Design Patterns to Follow

1. **Lane Queue System** - Default to serial execution, explicit parallelization only when safe
2. **Memory System** - Hybrid short/long-term memory with semantic search
3. **Context Window Guard** - Automatic pruning and compression
4. **Identity System** - AGENTS.md, SOUL.md, IDENTITY.md, USER.md for personality and preferences
5. **Proactive Behavior** - Heartbeat system for status checks and helpful suggestions

## When Starting Implementation

1. **Begin with Phase 1** - Focus on core Agent Manager and Session management first
2. **Use design documents as spec** - The design docs are comprehensive and should guide implementation
3. **Test incrementally** - Each component should have tests before moving to next phase
4. **Keep dependencies minimal** - Only add dependencies that are truly necessary
5. **Document as you go** - Keep API documentation current with implementation

## Notes for Future Development

- This is a **brand new project** being designed from scratch
- Learn from ClawdBot's patterns but don't copy code directly
- Focus on Android-specific capabilities and constraints
- The Anode platform provides unique APIs not available in standard Node.js
- Target audience is technical users familiar with Android automation
