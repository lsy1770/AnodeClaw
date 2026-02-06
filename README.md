# Anode ClawdBot

Android AI Agent System, running on Anode platform with Javet Node.js engine.

## Features

- **Multi-Model Support**: Claude (Anthropic), DeepSeek, OpenAI-compatible APIs
- **Streaming Output**: Real-time response streaming with tool call support
- **Social Platform Integration**: Telegram, Discord, DingTalk, Feishu, QQ adapters
- **Tool System**: 17+ built-in tools for file ops, Android automation, network, device control
- **Plugin System**: Extensible architecture with example plugins
- **Lane Queue**: Serial/parallel task execution management
- **Memory System**: Semantic memory with vector search
- **Safety Features**: Command classification, approval system, security utilities

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Set API key
export ANTHROPIC_API_KEY=your-key

# Run
node dist/main.js
```

## Configuration

Copy and edit the config file:
```bash
cp assets/config.default.json config.json
```

Key configuration options:
- `model.provider`: "anthropic" | "deepseek" | "openai"
- `model.model`: Model name (e.g., "claude-sonnet-4-20250514")
- `model.apiKey`: API key (supports `${ENV_VAR}` syntax)
- `social.telegram.token`: Telegram bot token
- `social.discord.token`: Discord bot token

## Project Structure

```
src/
├── core/           # Agent manager, session, model API, streaming
├── config/         # Configuration management
├── tools/          # Tool system and built-in tools
├── ui/             # FloatingWindow-based UI components
├── plugins/        # Plugin system
├── social/         # Social platform adapters
├── skills/         # Built-in skills (summarize, etc.)
└── utils/          # Logger, security, performance utilities
```

## Built-in Tools

| Category | Tools |
|----------|-------|
| File | read_file, write_file, list_files, delete_file, file_exists |
| Android | android_click, android_swipe, android_find_text, android_input_text, android_screenshot |
| Network | http_request, http_get, http_post, download_file, upload_file |
| Device | get_device_info, get_battery_info, show_toast, get_current_app |

## Social Adapters

- **Telegram**: Full bot API support with polling
- **Discord**: discord.js integration with DM and mention handling
- **DingTalk**: Stream SDK for enterprise messaging
- **Feishu**: Lark/Feishu bot integration
- **QQ**: QQ official bot API

## Technology Stack

- **Runtime**: Javet Node.js Engine (Android)
- **Language**: TypeScript (ES2021)
- **AI SDK**: @anthropic-ai/sdk, openai
- **Validation**: Zod
- **Config**: JSON5

## License

MIT
