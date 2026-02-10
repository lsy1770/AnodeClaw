<p align="center">
  <img src="assets/logo.png" alt="Anode ClawdBot" width="200" style="border-radius: 20px;" />
</p>

<h1 align="center">Anode ClawdBot</h1>

<p align="center">
  <strong>Android AI Agent System , running on ACS platform with Javet Node.js engine.</strong>
</p>

<p align="center">
  <a href="https://acs.yunxi668.cn"><img src="https://img.shields.io/badge/ACS-Official_Site-blue?style=flat-square&logo=android" alt="ACS Website" /></a>
  <img src="https://img.shields.io/badge/Platform-Android-3DDC84?style=flat-square&logo=android&logoColor=white" alt="Android" />
  <img src="https://img.shields.io/badge/Runtime-Node.js_18+-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/AI-Claude_%7C_DeepSeek_%7C_OpenAI-blueviolet?style=flat-square" alt="AI Models" />
  <img src="https://img.shields.io/badge/License-MIT-green?style=flat-square" alt="MIT License" />
</p>

<p align="center">
  <a href="https://acs.yunxi668.cn">Website</a> &middot;
  <a href="#features">Features</a> &middot;
  <a href="#quick-start">Quick Start</a> &middot;
  <a href="#social-adapters">Social Adapters</a>
</p>

---

## Features

- **Multi-Model Support**: Claude (Anthropic), DeepSeek, OpenAI-compatible APIs
- **Streaming Output**: Real-time response streaming with tool call support
- **Social Platform Integration**: Telegram, Discord, DingTalk, Feishu, QQ adapters
- **Tool System**: 17+ built-in tools for file ops, Android automation, network, device control
- **Plugin System**: Extensible architecture with example plugins
- **Lane Queue**: Serial/parallel task execution management
- **Memory System**: Semantic memory with vector search
- **Proactive Behavior**: AI-driven heartbeat suggestions, error alerts, task reminders
- **Safety Features**: Command classification, approval system, security utilities
- **Multimedia Messages**: Attachments flow from tools through UI and social platforms

## Quick Start

### Step 1: Install dependencies (on PC)

```bash
npm install
```

### Step 2: Build (on PC)

```bash
npm run build
```

This generates the `dist` directory containing compiled JS files and `assets/prompts`.

### Step 3: Copy to device

Copy the entire project folder to the ACS project path on your Android device, e.g.:

```
/sdcard/ACS/projects/anode-clawdbot/
```

### Step 4: Open terminal on device

Open the ACS terminal and cd into the project path:

```bash
cd /sdcard/ACS/projects/anode-clawdbot
```

### Step 5: Install runtime dependencies (on device)

```bash
npm install --ignore-scripts
```

> `--ignore-scripts` skips postinstall scripts to avoid build tool errors on the device.

### Step 6: Run

Open `dist/start-ui.js` in the ACS editor and click the Run button.

## Configuration

Copy and edit the config file:
```bash
cp assets/config.default.json config.json
```

Key configuration options:
- `model.provider`: "anthropic" | "deepseek" | "openai"
- `model.model`: Model name (e.g., "claude-sonnet-4-20250514")
- `model.apiKey`: API key (supports `${ENV_VAR}` syntax)
- `social.telegram.botToken`: Telegram bot token
- `social.telegram.broadcastChatId`: Default chat ID for proactive notifications
- `social.discord.botToken`: Discord bot token

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
| Image | resize_image, crop_image, rotate_image, flip_image, gaussian_blur, edge_detection |
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
