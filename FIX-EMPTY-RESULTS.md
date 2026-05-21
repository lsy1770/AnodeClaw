## 修复 android_find_interactive_elements 返回空结果

### 问题
工具返回空的 elements 数组，即使界面上有可点击元素。

### 根本原因
可能有窗口过滤器阻止了访问某些窗口的UI元素。

### 修复方案
在 `android_find_interactive_elements` 工具的 execute 方法开头添加：

```typescript
// 在 line 1990 之后添加
logger.debug('Finding interactive elements');

// ADD THIS:
try {
  await auto.clearWindowFilter();
  logger.debug('Window filter cleared');
} catch (e) {
  logger.warn('Failed to clear window filter:', e);
}

logger.debug('Using optimized selector-based search...');
```

### 同样修复其他查找工具

1. **android_describe_screen** (line ~2085)
2. **android_get_layout** (line ~1830)
3. **android_find_text** (line ~372)

在每个工具的 execute 开头都添加 `await auto.clearWindowFilter()`。

### 测试方法

运行 `diagnose-empty-results.js` 查看：
1. 空selector能返回多少节点
2. 清除filter前后的差异
3. 各个selector的返回结果
