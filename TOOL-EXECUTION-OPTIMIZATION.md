# 工具执行优化方案

## 问题概述

当前工具执行存在以下问题：
1. **忽略 parallelizable 标记**：所有工具都通过 `Promise.all` 并行执行
2. **无优先级调度**：工具按FIFO顺序执行，无法处理紧急任务
3. **Lane系统未被使用**：Lane队列系统只用于消息级别，工具执行没有使用

## 修复方案

### 方案一：基于 parallelizable 的智能调度（推荐）

**原理**：根据工具的 `parallelizable` 属性分组执行

**实现步骤**：

1. **修改 AgentManager.ts 中的工具执行逻辑**

```typescript
// 在 AgentManager.ts ~1147 行附近修改

// 当前代码（错误）：
const toolResults = await Promise.all([
  ...approvedToolCalls.map(async (toolCall) => {
    result = await this.toolExecutor.execute(...)
  })
]);

// 修改为（正确）：
const toolResults = await this.executeToolsWithParallelization(
  approvedToolCalls,
  deniedToolCalls,
  session
);
```

2. **新增智能执行方法**

```typescript
/**
 * 智能执行工具：根据 parallelizable 属性分组
 */
private async executeToolsWithParallelization(
  approvedToolCalls: ToolCallType[],
  deniedToolCalls: ToolCallType[],
  session: Session
): Promise<ToolResult[]> {
  // 分组：可并行 vs 必须串行
  const parallelizable: ToolCallType[] = [];
  const serial: ToolCallType[] = [];

  for (const toolCall of approvedToolCalls) {
    const tool = this.toolRegistry.get(toolCall.name);
    if (tool && tool.parallelizable !== false) {
      parallelizable.push(toolCall);
    } else {
      serial.push(toolCall);
    }
  }

  logger.info(
    `Tool execution plan: ${parallelizable.length} parallel, ${serial.length} serial`
  );

  const results: ToolResult[] = [];

  // 1. 并行执行可并行的工具
  if (parallelizable.length > 0) {
    const parallelResults = await Promise.all(
      parallelizable.map((toolCall) => this.executeToolWithHooks(toolCall, session))
    );
    results.push(...parallelResults);
  }

  // 2. 串行执行必须串行的工具
  for (const toolCall of serial) {
    const result = await this.executeToolWithHooks(toolCall, session);
    results.push(result);
  }

  // 3. 添加被拒绝的工具结果
  const deniedResults = deniedToolCalls.map(() => ({
    success: false,
    output: null,
    error: 'Tool execution denied by user or approval timeout',
  }));
  results.push(...deniedResults);

  return results;
}

/**
 * 执行单个工具并调用hooks
 */
private async executeToolWithHooks(
  toolCall: ToolCallType,
  session: Session
): Promise<ToolResult> {
  const toolTimer = performanceMonitor.startTimer(`tool:${toolCall.name}`);

  try {
    this.eventBus.emit('tool:before', {
      toolName: toolCall.name,
      args: toolCall.input,
      sessionId: session.sessionId,
    });

    let result: ToolResult;

    // Execute before hooks
    const hookCtx: BeforeToolCallContext = {
      toolName: toolCall.name,
      args: toolCall.input,
      sessionId: session.sessionId,
      timestamp: Date.now(),
    };
    const beforeResult = await this.toolHooksManager.executeBefore(hookCtx);

    if (!beforeResult.proceed) {
      result = {
        success: beforeResult.overrideResult !== undefined,
        output: beforeResult.overrideResult ?? beforeResult.blockReason ?? 'Blocked by hook',
        error: beforeResult.overrideResult === undefined ? beforeResult.blockReason : undefined,
      };
    } else {
      const effectiveInput = beforeResult.modifiedArgs || toolCall.input;
      result = await this.toolExecutor.execute(
        { ...toolCall, input: effectiveInput },
        { context: { sessionId: session.sessionId } }
      );
    }

    // Execute after hooks
    const afterCtx: AfterToolCallContext = {
      ...hookCtx,
      result: result.output,
      isError: !result.success,
      duration: Date.now() - hookCtx.timestamp,
    };
    const afterResult = await this.toolHooksManager.executeAfter(afterCtx);
    if (afterResult.modifiedResult !== undefined) {
      result.output = afterResult.modifiedResult;
    }

    // Emit events
    const toolDuration = toolTimer.end();
    this.eventBus.emit('tool:after', {
      toolName: toolCall.name,
      args: toolCall.input,
      result: result.output,
      duration: toolDuration,
      sessionId: session.sessionId,
    });

    performanceMonitor.recordToolExecution(toolDuration);

    // Update approval record
    this.approvalManager.updateExecutionResult(toolCall.id, {
      success: result.success,
      output: result.output,
      error: result.error
        ? typeof result.error === 'string'
          ? result.error
          : JSON.stringify(result.error)
        : undefined,
    });

    return result;
  } catch (error) {
    toolTimer.end();
    logger.error(`Tool execution failed for ${toolCall.name}:`, error);
    return {
      success: false,
      output: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
```

### 方案二：使用Lane系统（适合复杂场景）

**原理**：利用现有的LaneManager，为不同工具类型创建不同lane

**实现步骤**：

1. **为Android工具创建专用Lane**

```typescript
// 在 AgentManager 构造函数中初始化
constructor(config: Config) {
  // ... existing code ...

  // 为Android工具创建串行lane
  this.androidLane = new Lane('android', { concurrency: 1 });

  // 为其他工具使用并行lane
  this.generalLane = new Lane('general', { concurrency: 5 });
}
```

2. **工具执行时根据类型选择Lane**

```typescript
private async executeToolInLane(toolCall: ToolCallType): Promise<ToolResult> {
  const tool = this.toolRegistry.get(toolCall.name);
  const lane = tool?.category === 'android'
    ? this.androidLane
    : this.generalLane;

  return lane.enqueue({
    id: toolCall.id,
    name: toolCall.name,
    execute: async () => {
      return this.toolExecutor.execute(toolCall, {
        context: { sessionId: this.currentSessionId }
      });
    }
  });
}
```

### 方案三：优先级队列（最完整但最复杂）

**原理**：基于工具优先级和parallelizable属性的混合调度

**新增类型**：

```typescript
// 在 types.ts 中添加
export interface Tool {
  // ... existing fields ...
  priority?: 'urgent' | 'high' | 'normal' | 'low'; // 新增优先级
}
```

**实现优先级队列**：

```typescript
class PriorityToolQueue {
  private urgentQueue: ToolCallType[] = [];
  private highQueue: ToolCallType[] = [];
  private normalQueue: ToolCallType[] = [];
  private lowQueue: ToolCallType[] = [];

  enqueue(toolCall: ToolCallType, priority: string) {
    switch (priority) {
      case 'urgent': this.urgentQueue.push(toolCall); break;
      case 'high': this.highQueue.push(toolCall); break;
      case 'low': this.lowQueue.push(toolCall); break;
      default: this.normalQueue.push(toolCall);
    }
  }

  dequeue(): ToolCallType | null {
    return this.urgentQueue.shift() ||
           this.highQueue.shift() ||
           this.normalQueue.shift() ||
           this.lowQueue.shift() ||
           null;
  }
}
```

## 推荐实施顺序

1. **立即实施：方案一（基于 parallelizable 的智能调度）**
   - 修复最明显的问题
   - 实现简单，风险低
   - 对现有代码改动最小

2. **中期优化：增强Lane使用**
   - 根据需求逐步迁移到Lane系统
   - 为特定工具类别创建专用lane

3. **长期规划：完整优先级系统**
   - 仅在确实需要时实施
   - 需要更多设计和测试

## 测试验证

修复后需要验证：

1. **Android工具串行执行**：多个点击/滑动操作按顺序执行，无冲突
2. **可并行工具并行执行**：文件读取、网络请求等同时进行
3. **性能提升**：整体执行时间减少（特别是混合场景）
4. **错误处理**：任何工具失败不影响其他工具

## 性能对比示例

**场景**：AI调用 3 个工具
- `android_screenshot` (可并行)
- `android_find_text` (可并行) - 需要30秒
- `android_click_element` (必须串行)

### 当前行为（错误）：
```
Time 0s:   所有3个工具同时启动（Promise.all）
Time 30s:  android_find_text 完成
Time 30s:  android_screenshot 完成
Time 30s:  android_click_element 完成（可能与find_text冲突！）
总耗时：30秒（但可能有竞态条件）
```

### 修复后（正确）：
```
Time 0s:   2个可并行工具同时启动（screenshot, find_text）
Time 5s:   screenshot 完成
Time 30s:  find_text 完成
Time 30s:  开始 click_element（等待前面完成）
Time 31s:  click_element 完成
总耗时：31秒（安全，无竞态）
```

## 相关文件

需要修改的文件：
- `src/core/AgentManager.ts` - 主要修改点
- `src/tools/types.ts` - 如果添加优先级
- `src/core/lane/LaneManager.ts` - 如果使用Lane系统

测试文件：
- 新增 `tests/tool-execution-parallelization.test.ts`
- 更新 `tests/agent-manager.test.ts`
