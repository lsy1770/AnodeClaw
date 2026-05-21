# 🚀 Deployment and Testing Checklist

**Version**: v1.0.6
**Date**: 2026-02-04
**Status**: Ready for Android Device Testing

---

## ✅ Pre-Deployment Verification

### Compilation Status
- ✅ TypeScript compilation successful (no errors)
- ✅ All files use ES6 modules (import/export)
- ✅ Using global API declarations (`declare const file`)
- ✅ No acs-core imports (直接访问全局)
- ✅ No dynamic imports (`await import()`)
- ✅ No CommonJS (`require`/`exports`)
- ✅ All paths are relative (`./config.json`, `./data/`)
- ✅ Using correct Anode API names (`file.readText`, `file.writeText`, etc.)
- ✅ **正确的 API 函数名** (基于 FileAPI.kt @V8Function 注解)

### Files Ready for Deployment

**Core Files**:
```
dist/
├── main.js              ✅ Main entry point
├── cli.js               ✅ CLI mode entry
├── start-ui.js          ✅ UI mode entry
├── test-simple.js       ✅ Simple test (recommended for first test)
├── index.js             ✅ API exports
└── core/, tools/, config/, utils/  ✅ All modules
```

**Configuration Template**:
```
config.json             ⚠️ Need to create on device
```

---

## 📱 Deployment Steps

### 1. Prepare Target Directory on Android Device

```bash
# Connect to your device via ADB or terminal
# Create the working directory
mkdir -p /sdcard/ACS/clawdbot/data/sessions
mkdir -p /sdcard/ACS/clawdbot/data/memory
```

### 2. Deploy Files

You can use one of these methods:

**Method A: Using acs-android MCP Tool** (Recommended):
```javascript
// Use MCP tool to write files to:
// Server: acs-android (192.168.31.102:8765)
// Target: /sdcard/ACS/clawdbot/
```

**Method B: Manual ADB Push**:
```bash
cd D:\ACS-C\AnodeClawd
adb push dist/ /sdcard/ACS/clawdbot/dist/
```

**Method C: Copy via File Manager**:
- Copy entire `dist/` folder to device
- Place in `/sdcard/ACS/clawdbot/`

### 3. Create Configuration File

Create `/sdcard/ACS/clawdbot/config.json`:

```json
{
  "model": {
    "provider": "anthropic",
    "model": "claude-sonnet-4-5",
    "apiKey": "sk-ant-api03-YOUR_API_KEY_HERE",
    "maxTokens": 4096,
    "temperature": 0.7
  },
  "storage": {
    "sessionDir": "./data/sessions",
    "memoryDir": "./data/memory",
    "maxSessionSize": 10485760,
    "compressionEnabled": true
  },
  "agent": {
    "defaultSystemPrompt": "You are a helpful AI assistant running on Android via Anode platform.",
    "contextWindowWarning": 180000,
    "compressionEnabled": true,
    "compressionTrigger": 200000
  },
  "tools": {
    "enabled": ["read_file", "write_file", "list_files"],
    "approvalRequired": ["delete_file", "android_click"],
    "timeout": 30000,
    "parallelizationEnabled": false
  },
  "lane": {
    "defaultLane": "serial",
    "maxConcurrency": 1,
    "queueStrategy": "fifo"
  },
  "logging": {
    "level": "info",
    "pretty": true
  }
}
```

**⚠️ Important**: Replace `YOUR_API_KEY_HERE` with your actual API key!

---

## 🧪 Testing Procedure

### Test 1: Simple Initialization Test (Recommended First)

```bash
cd /sdcard/ACS/clawdbot
node ./dist/test-simple.js
```

**Expected Output**:
```
========================================
  Anode ClawdBot - Simple Test
========================================

测试 1: 创建 ClawdBot 实例...
[ClawdBot] [INFO] Loading configuration...
[ClawdBot] [INFO] Loading configuration from: ./config.json
[ClawdBot] [INFO] Configuration loaded {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5'
}
[ClawdBot] [INFO] Initializing AgentManager...
[ClawdBot] [INFO] ClawdBot initialized successfully {
  tools: 17,
  lanes: 1
}
✅ ClawdBot 创建成功

测试 2: 创建会话...
✅ 会话创建成功

测试 3: 列出工具...
✅ 找到 17 个工具

测试 4: 检查 Lane 状态...
✅ Lane 状态正常

测试 5: 保存会话...
✅ 会话保存成功

测试 6: 关闭...
✅ 清理完成

========================================
  All tests passed! ✅
========================================
```

### Test 2: UI Mode Test

```bash
cd /sdcard/ACS/clawdbot
node ./dist/start-ui.js
```

**Expected Output**:
```
========================================
  Anode ClawdBot - Starting UI
========================================

[ClawdBot] [INFO] Initializing ClawdBot...
[ClawdBot] [INFO] Loading configuration...
[ClawdBot] [INFO] Configuration loaded
[ClawdBot] [INFO] ClawdBot initialized

⚠️  注意: UI 模式需要在 Android 设备上运行
FloatingWindowAPI 仅在 Anode 平台上可用

当前环境信息:
  Node 版本: v18.x.x
  平台: android
  架构: arm64

✅ UI components loaded (Android environment)
Chat window will be displayed shortly...
```

### Test 3: CLI Mode Test

```bash
cd /sdcard/ACS/clawdbot
node ./dist/cli.js
```

**Expected**: Interactive CLI prompt

---

## ❌ Known Issues That Should NOT Appear

### Fixed Issues (v1.0.6):
- ✅ ~~"A dynamic import callback was not specified"~~ - FIXED in v1.0.3
- ✅ ~~"exports is not defined"~~ - FIXED in v1.0.3
- ✅ ~~"V8ValueError: import.meta.url"~~ - FIXED in v1.0.1
- ✅ ~~Incorrect API names (FileAPI → file)~~ - FIXED in v1.0.1
- ✅ ~~Absolute paths (/sdcard)~~ - FIXED in v1.0.1
- ✅ ~~"ConfigManager requires Anode file API"~~ - FIXED in v1.0.4
- ✅ ~~"The requested module 'acs-core' does not provide an export named 'file'"~~ - FIXED in v1.0.5
- ✅ ~~"file.read is not a function"~~ - FIXED in v1.0.6 ⭐ (使用正确的 @V8Function 函数名)

### API 函数名参考 (v1.0.6)

**FileAPI 正确函数名**:
- ✅ `file.readText(path, charset?)` - 不是 `file.read()`
- ✅ `file.writeText(path, content, charset?)` - 不是 `file.write()`
- ✅ `file.listFiles(path)` - 不是 `file.list()` (返回 FileInfo[])
- ✅ `file.exists(path)` - **同步函数**，不返回 Promise
- ✅ `file.createDirectory(path)` - 不是 `file.mkdir()`
- ✅ `file.delete(path)` - 正确
- ✅ 完整 API 参考: `docs/API-REFERENCE.md`

### If You See These Errors:

**Error**: "file.xxx is not a function"
**Cause**: 使用了错误的 API 函数名
**Fix**:
1. 查看 `docs/API-REFERENCE.md` 获取正确的函数名
2. 确保使用 @V8Function 注解的函数名
3. 注意某些函数是同步的（如 `file.exists`），不返回 Promise

**Error**: "file is not defined"
**Cause**: Anode API not registered to global scope
**Fix**:
1. Ensure NodeJsEngine initialized successfully
2. Check ACS logs for "模块 file 初始化成功"
3. Verify you're running in ACS environment (not standard Node.js)

**Error**: "Cannot find module './config.json'"
**Cause**: config.json not in working directory
**Fix**: Create config.json in same directory as dist/

**Error**: "Invalid API key"
**Cause**: API key not configured or incorrect
**Fix**: Check config.json has valid `model.apiKey`

---

## 🔍 Verification Commands

### Check File Structure
```bash
cd /sdcard/ACS/clawdbot
ls -la
# Should see: dist/, data/, config.json

ls -la dist/
# Should see: main.js, cli.js, start-ui.js, core/, tools/, etc.
```

### Check acs-core Module
```bash
# Check if acs-core is installed
ls /sdcard/.acs/node_modules/acs-core/
# Should see package.json and module files

# Test acs-core import
node -e "import('acs-core').then(m => console.log('Exports:', Object.keys(m)))"
# Expected: Exports: [ 'file', 'auto', 'device', 'http', ... ]
```

### Check Config
```bash
cat /sdcard/ACS/clawdbot/config.json
# Verify JSON is valid and apiKey is set
```

### Test Config Loading with acs-core
```bash
node -e "
import('acs-core').then(async ({ file }) => {
  try {
    const content = await file.read('./config.json', 'utf-8');
    console.log('✅ Config loaded:', JSON.parse(content).model.provider);
  } catch (e) {
    console.error('❌ Error:', e.message);
  }
})
"
```

---

## 📊 Success Criteria

- [ ] test-simple.js runs without errors
- [ ] All 6 tests pass in test-simple.js
- [ ] Configuration loads successfully
- [ ] AgentManager initializes with 17 tools
- [ ] Session can be created
- [ ] Session can be saved to file
- [ ] No "dynamic import" errors
- [ ] No "exports is not defined" errors
- [ ] No V8ValueError errors

---

## 🐛 Troubleshooting

### Issue: "Cannot find module"
**Solution**: Ensure all paths are relative and working directory is `/sdcard/ACS/clawdbot/`

### Issue: "JSON5 parse error"
**Solution**: Check config.json syntax, ensure valid JSON

### Issue: "Network request failed"
**Solution**: Check internet connection, API key, and API endpoint

### Issue: "Permission denied"
**Solution**: Check ACS has required Android permissions

---

## 📝 Post-Testing Report

After testing, please report:

1. **Which test was run**: test-simple.js / start-ui.js / cli.js
2. **Result**: Success / Partial Success / Failed
3. **Output**: Copy the console output
4. **Errors**: Any error messages (full stack trace)
5. **Environment**:
   - Android version
   - ACS version
   - Node.js version (from `node --version`)
   - Device model

---

## 🎯 Next Steps After Successful Testing

Once all tests pass:

1. **Phase 2**: Implement remaining tools (Android automation, network, etc.)
2. **Phase 3**: Complete UI implementation
3. **Phase 4**: Add plugin system
4. **Phase 5**: Performance optimization

---

**Status**: Ready for deployment ✅
**Last Updated**: 2026-02-04
**Next Action**: Deploy to Android device and run test-simple.js
