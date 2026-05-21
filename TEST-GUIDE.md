# Android Tools 测试指南

本目录包含Android控件工具的测试文件，用于验证所有Android自动化功能。

## 文件列表

### 1. test-android-tools-quick.js（快速测试）

**用途**：快速验证基本功能是否正常

**测试内容**：
- ✅ 无障碍服务状态
- ✅ 当前应用信息获取
- ✅ 交互元素查找性能
- ✅ 元素属性访问正确性

**运行时间**：约10-20秒

**使用方法**：
```bash
# 1. 打开任意应用（例如微信、设置）
# 2. 在ACS中打开 test-android-tools-quick.js
# 3. 点击运行按钮
```

**预期输出**：
```
=== 开始快速测试 ===

1️⃣ 检查无障碍服务...
   无障碍服务: ✅ 已启用

2️⃣ 获取当前应用信息...
   包名: com.tencent.mm
   Activity: .ui.LauncherUI

3️⃣ 查找交互元素（性能测试）...
   可点击: 45 个
   可滚动: 3 个
   可编辑: 0 个
   耗时: 2341ms ✅ 正常

4️⃣ 测试元素属性访问...
   示例元素:
     - text: 微信
     - className: android.widget.TextView
     - clickable: true (属性，非方法)
     - visible: true
     - bounds: {"left":100,"top":200,...}

=== 测试完成 ===
✅ 全部检查通过
```

---

### 2. test-android-tools.js（完整测试套件）

**用途**：全面测试所有Android工具功能

**测试内容**：
- 基础手势测试（服务状态、屏幕状态、应用信息）
- 元素查找测试（文本、ID、clickable、scrollable、editable）
- 布局工具测试（性能优化验证）
- 节点方法测试（click、setText等方法存在性）
- 窗口信息测试
- Selector链式调用测试
- 性能测试（各种查询场景的性能基准）

**运行时间**：约2-5分钟

**使用方法**：
```bash
# 1. 打开一个复杂的应用（推荐：微信、淘宝、设置）
# 2. 在ACS中打开 test-android-tools.js
# 3. 可选：编辑CONFIG配置
# 4. 点击运行按钮
```

**配置选项**：
```javascript
const CONFIG = {
  verbose: true,           // 显示详细日志
  testDelay: 1000,        // 测试间隔（ms）
  saveResults: true,      // 保存结果到文件
  resultsPath: '/sdcard/ACS/android-tools-test-results.json',
};
```

**预期输出**：
```
========================================
   Android Tools 测试套件
========================================

=== 测试基础手势 ===

📋 Running: 检查无障碍服务状态
✅ ✓ 检查无障碍服务状态 (123ms)

📋 Running: 获取屏幕状态
✅ ✓ 获取屏幕状态 (45ms)

...

=== 测试报告 ===

📋 总计: 25 个测试
✅ 通过: 24 个
❌ 失败: 1 个
📋 通过率: 96.0%

按类别统计:
  基础: 3/3 (100%)
  元素查找: 5/5 (100%)
  布局分析: 3/3 (100%)
  性能: 3/4 (75%)

性能统计:
  平均耗时: 1234ms
  最长耗时: 4567ms

总耗时: 67.5秒

测试完成！
```

---

## 测试环境要求

### 必需
- ✅ ACS应用已安装
- ✅ 无障碍服务已启用
- ✅ 有一个可测试的应用打开

### 推荐配置
- 📱 Android 8.0+
- 💾 足够的存储空间（用于保存测试结果）

---

## 常见问题

### Q: 测试超时或失败？

**A**: 检查以下几点：
1. 无障碍服务是否启用？运行 `auto.isEnabled()` 检查
2. 当前应用是否太复杂？尝试在简单应用（如设置）中测试
3. 设备性能是否足够？复杂UI可能需要更长时间

### Q: 性能测试显示"D"等级？

**A**: 这表明查询较慢。可能原因：
- 当前应用UI非常复杂（节点数>200）
- 设备性能较低
- 需要优化查询方式（使用更限制性的selector）

### Q: 元素属性访问测试失败？

**A**: 检查代码是否错误地将属性当方法调用：
```typescript
// ❌ 错误
node.clickable()  // clickable是属性，不是方法

// ✅ 正确
node.clickable    // 直接访问属性
```

### Q: 如何测试特定工具？

**A**: 修改 `test-android-tools.js` 并注释掉不需要的测试：
```javascript
async function main() {
  // await testBasicGestures();     // 注释掉不需要的
  await testElementSearch();        // 只运行这个
  // await testLayoutTools();
  // ...
}
```

---

## 性能基准

基于中端设备（骁龙660）的测试结果：

| 操作 | 简单UI (<50节点) | 复杂UI (100-200节点) | 超复杂UI (>200节点) |
|------|------------------|---------------------|-------------------|
| findAll(clickable) | 500-1000ms | 1500-3000ms | 3000-5000ms |
| findAll(空selector) | 2000-4000ms | 5000-10000ms | 10000-20000ms |
| 并行3个selector | 800-1500ms | 2000-4000ms | 4000-8000ms |

**性能等级**：
- **A级**: <3秒（优秀）
- **B级**: 3-5秒（良好）
- **C级**: 5-10秒（可接受）
- **D级**: >10秒（需优化）

---

## 解读测试结果

### 成功示例（results.json）
```json
{
  "summary": {
    "total": 25,
    "passed": 25,
    "failed": 0,
    "passRate": 100
  },
  "performance": {
    "avgDuration": 1234,
    "maxDuration": 4567,
    "slowTests": []
  }
}
```

### 失败示例
```json
{
  "name": "查找可点击元素",
  "passed": false,
  "error": "Tool execution timeout after 30000ms",
  "duration": 30001
}
```

**失败原因分析**：
- 超时 → UI太复杂或查询方式不当
- 属性访问错误 → 代码错误地调用了属性当方法
- 服务未启用 → 无障碍服务未开启

---

## 贡献测试用例

如果您发现bug或想添加新的测试用例，请：

1. Fork项目
2. 在 `test-android-tools.js` 中添加测试
3. 确保遵循现有的测试模式
4. 提交PR

测试函数模板：
```javascript
await runTest('测试名称', '类别', async () => {
  // 测试逻辑
  const result = await someFunction();

  // 验证
  if (!result) {
    throw new Error('测试失败原因');
  }

  // 返回结果
  return { ...result };
});
```

---

## 技术支持

- 📚 文档：https://doc.yunxi668.cn
- 🌐 ACS官网：https://acs.yunxi668.cn
- 📝 Issue：提交到项目GitHub

---

## 更新日志

### 2026-02-27
- ✅ 创建测试套件
- ✅ 添加性能测试
- ✅ 优化布局查询测试
- ✅ 验证属性访问正确性

---

**最后更新**: 2026-02-27
**版本**: 1.0.0
