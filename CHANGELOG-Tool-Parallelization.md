# Tool Parallelization Implementation - 2026-02-26

## 问题描述

之前所有工具都通过 `Promise.all` 无条件并行执行，忽略了工具的 `parallelizable` 属性。这导致：

1. **竞态条件**：Android 操作（点击、滑动）应该串行执行但却并行执行
2. **性能问题**：耗时工具（如 `android_find_text` 30秒）阻塞其他操作
3. **资源冲突**：多个工具同时操作 Android UI，造成冲突

## 解决方案

实施了基于 `parallelizable` 属性的智能工具调度系统。

### 核心改动

#### 1. 新增 `executeToolsWithParallelization` 方法

**位置**: `src/core/AgentManager.ts:2488-2552`

**功能**：
- 将工具分为可并行和必须串行两组
- 可并行工具使用 `Promise.all` 并发执行
- 串行工具按顺序逐个执行
- 保持结果顺序与原始工具调用顺序一致

**关键逻辑**：
```typescript
// 检查工具是否可并行（默认为 true）
const isParallelizable = tool?.parallelizable !== false;

// 1. 并行执行可并行工具
const parallelResults = await Promise.all(
  parallelizable.map(({ toolCall }) => this.executeToolWithHooks(toolCall, session))
);

// 2. 串行执行必须串行的工具
for (const { toolCall, index } of serial) {
  const result = await this.executeToolWithHooks(toolCall, session);
  results[index] = result;
}
```

#### 2. 新增 `executeToolWithHooks` 方法

**位置**: `src/core/AgentManager.ts:2554-2640`

**功能**：
- 封装单个工具的执行逻辑（含 hooks、事件、性能监控）
- 处理 skill 调用和普通工具调用
- 统一错误处理和返回格式

#### 3. 修改工具执行入口

**位置**：
- 非 streaming：`src/core/AgentManager.ts:1060-1065`
- Streaming：`src/core/AgentManager.ts:1432-1437`

**改动**：
```typescript
// 旧代码（错误）
const toolResults = await Promise.all([
  ...approvedToolCalls.map(async (toolCall) => { /* 执行逻辑 */ })
]);

// 新代码（正确）
const toolResults = await this.executeToolsWithParallelization(
  approvedToolCalls,
  deniedToolCalls,
  session
);
```

#### 4. 类型修复

**位置**: `src/core/AgentManager.ts:21`

**改动**：添加 `ToolResult` 类型导入
```typescript
import type { ToolCall as ToolCallType, ToolResult } from '../tools/types.js';
```

修复了错误返回格式，确保 `error` 字段符合类型定义：
```typescript
error: {
  code: 'ERROR_CODE',
  message: 'Error message',
  details?: any
}
```

## 影响的工具类型

### 必须串行执行 (parallelizable: false)

**Android 操作类**：
- `android_click`
- `android_swipe`
- `android_long_click`
- `android_click_element`
- `android_long_click_element`
- `android_input_text_to_element`
- `android_scroll_element`
- `android_expand_element`
- `android_collapse_element`
- `android_focus_element`

**应用操作类**：
- `app_launch`
- `app_force_stop`
- `app_clear_data`
- `app_grant_permission`
- `app_revoke_permission`

**多媒体操作类**：
- `media_play_video`
- `media_pause_video`
- `media_stop_video`
- `media_record_video`
- `media_take_photo`

### 可并行执行 (parallelizable: true)

**信息查询类**：
- `android_find_text`
- `android_find_id`
- `android_get_layout_tree`
- `device_*` 系列（所有设备信息查询）
- `app_get_info`
- `app_list_installed`

**文件操作类**：
- `file_read`
- `file_list`
- `file_exists`

**网络请求类**：
- `network_http_request`
- `network_download_file`

## 性能优化示例

### 场景 1: 混合操作

**工具调用**：
1. `android_screenshot` (可并行)
2. `android_find_text` (可并行, 30秒)
3. `android_click_element` (串行)

**旧行为（错误）**：
```
Time 0s:  所有3个工具同时启动（Promise.all）
Time 30s: 全部完成
风险: click 可能与 find_text 冲突
```

**新行为（正确）**：
```
Time 0s:  screenshot 和 find_text 并行启动
Time 5s:  screenshot 完成
Time 30s: find_text 完成
Time 30s: click_element 开始执行（等待前面完成）
Time 31s: click_element 完成
总耗时: 31秒，无竞态条件
```

### 场景 2: 纯并行操作

**工具调用**：
1. `file_read /path/a.txt` (可并行)
2. `file_read /path/b.txt` (可并行)
3. `device_get_info` (可并行)

**行为**：
```
Time 0s:  所有3个工具同时启动
Time 0.5s: 全部完成
总耗时: 0.5秒（最慢的工具时间）
```

### 场景 3: 纯串行操作

**工具调用**：
1. `android_click_element` (串行)
2. `android_swipe` (串行)
3. `android_input_text` (串行)

**行为**：
```
Time 0s:  click 开始
Time 1s:  click 完成，swipe 开始
Time 2s:  swipe 完成，input 开始
Time 3s:  input 完成
总耗时: 3秒（所有工具时间总和）
```

## 验证测试

### 测试建议

1. **基本并行测试**：
   ```typescript
   // 3个文件读取应该并行
   await agent.sendMessage('Read files a.txt, b.txt, c.txt');
   ```

2. **串行测试**：
   ```typescript
   // Android操作应该按顺序执行
   await agent.sendMessage('Click button, then swipe up, then type "hello"');
   ```

3. **混合测试**：
   ```typescript
   // 查询并行，操作串行
   await agent.sendMessage('Get device info and find "Login" button, then click it');
   ```

### 预期日志

启用日志后应该看到：
```
[AgentManager] Tool execution plan: 2 parallelizable, 1 serial (total: 3)
[AgentManager] Executing 2 parallelizable tools concurrently
[AgentManager] Executing 1 serial tools sequentially
```

## 相关文件

- `src/core/AgentManager.ts` - 主要改动
- `src/tools/types.ts` - 工具类型定义
- `src/tools/builtin/*.ts` - 各工具的 `parallelizable` 配置
- `TOOL-EXECUTION-OPTIMIZATION.md` - 详细设计文档

## 向后兼容性

✅ **完全向后兼容**

- 旧代码中工具定义无需修改
- 未指定 `parallelizable` 的工具默认为 `true`（可并行）
- 现有行为不变（已标记 `parallelizable: false` 的工具现在能正确串行执行）

## 后续优化建议

1. **优先级队列**：为工具添加优先级支持（urgent/high/normal/low）
2. **Lane 系统集成**：考虑使用现有的 Lane 队列系统进行更细粒度的调度
3. **动态并发度**：根据系统负载动态调整并行工具数量
4. **工具依赖图**：支持显式声明工具间的依赖关系

## 总结

这次改动：
- ✅ 修复了工具执行的竞态条件问题
- ✅ 优化了性能（混合场景下）
- ✅ 保持了向后兼容性
- ✅ 代码更清晰、易维护
- ✅ 为未来优化奠定基础
