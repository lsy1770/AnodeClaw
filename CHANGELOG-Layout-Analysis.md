# AndroidTools 布局分析功能添加说明

## 新增功能概述

针对用户提出的问题：**"agent 如何去筛选和操作控件？应该有一个类似布局分析的工具；能输出当前屏幕上的控件集合"**

我们添加了 3 个核心的布局分析工具，让 Agent 能够理解和分析 Android 界面。

## 新增的 3 个工具

### 1. `android_describe_screen` - 屏幕描述工具 ⭐ 推荐首选

**功能**：快速获取当前屏幕的高层次概览

**返回内容**：
- 当前应用信息（包名、Activity）
- 窗口信息
- 可交互元素列表（最多30个）
- 文本内容（最多20个）
- 屏幕摘要

**使用场景**：
- Agent 刚进入新页面，需要快速了解当前上下文
- 需要知道"我在哪里"和"能做什么"
- 大多数情况的首选工具

**优势**：
- ⚡ 速度最快（限制返回数量）
- 📊 信息精炼（只返回最重要的内容）
- 🎯 易于理解（结构化的摘要）

---

### 2. `android_find_interactive_elements` - 查找可交互元素

**功能**：专门查找所有可点击、可滚动、可编辑的元素

**参数**：
- `visibleOnly` - 只返回可见元素（默认：true）
- `includeText` - 包含仅有文本的元素（默认：false）

**返回内容**：
- 所有交互元素的扁平列表
- 按类型分组（clickable、scrollable、editable）
- 统计信息（总数、各类型数量）

**使用场景**：
- 需要完整的可交互元素列表
- 要找到所有按钮、输入框、可滚动列表
- `android_describe_screen` 返回的元素不够时

**优势**：
- 🔍 专注交互元素（过滤掉不可操作的）
- 📋 分组展示（快速定位特定类型）
- 📈 完整列表（不限制数量，但分组显示时有限制）

---

### 3. `android_get_layout` - 获取完整布局树

**功能**：获取完整的 UI 层次结构树

**参数**：
- `visibleOnly` - 只包含可见元素（默认：true）
- `interactiveOnly` - 只包含可交互元素（默认：false）
- `maxDepth` - 最大遍历深度（默认：50）
- `format` - 输出格式：'tree'（树形）或 'flat'（扁平列表）

**返回内容**：
- 完整的控件层次树（tree 模式）
- 或扁平化的元素列表（flat 模式）
- 每个节点的所有属性

**使用场景**：
- 需要深入分析界面结构
- 需要了解控件的父子关系
- 需要通过深度或边界定位元素
- 复杂界面的深度分析

**优势**：
- 🌳 完整层次（保留父子关系）
- 🔧 灵活格式（tree 或 flat）
- 📐 详细属性（bounds、depth 等）

---

## 技术实现

### 核心函数

#### `traverseNode()` - 节点遍历函数

```typescript
function traverseNode(
  node: any,
  options: {
    visibleOnly?: boolean;
    interactiveOnly?: boolean;
    maxDepth?: number;
    currentDepth?: number;
    includeChildren?: boolean;
  }
): any
```

**功能**：
- 递归遍历控件树
- 应用过滤条件（可见性、交互性）
- 提取节点属性
- 限制遍历深度

**过滤逻辑**：
```typescript
// 可见性过滤
if (visibleOnly && !isVisible) {
  return null;
}

// 交互性过滤
if (interactiveOnly && !isClickable && !isScrollable && !isEditable) {
  return null;
}
```

#### `flattenNodeTree()` - 树扁平化函数

```typescript
function flattenNodeTree(node: any, result: any[] = []): any[]
```

**功能**：
- 将树形结构转换为扁平列表
- 便于遍历和搜索
- 计算总节点数

---

### 节点属性提取

每个工具都会提取以下属性：

```typescript
{
  text: string | null;              // 文本内容
  id: string | null;                // 资源ID
  className: string | null;         // 类名
  contentDescription: string | null;// 内容描述
  bounds: Rect;                     // 屏幕坐标
  isClickable: boolean;             // 可点击
  isLongClickable: boolean;         // 可长按
  isScrollable: boolean;            // 可滚动
  isEditable: boolean;              // 可编辑
  isEnabled: boolean;               // 已启用
  isVisible: boolean;               // 可见
  depth: number;                    // 树深度
}
```

---

## 使用流程

### 推荐的 Agent 工作流

```
┌─────────────────────────────────────┐
│  Step 1: 了解屏幕                    │
│  调用 android_describe_screen()      │
│  获取屏幕概览和可交互元素             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Step 2: 定位目标元素                │
│  从 interactiveElements 中选择       │
│  或调用 android_find_interactive_    │
│  elements() 获取完整列表             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  Step 3: 执行操作                    │
│  使用 android_click_element,         │
│  android_input_text_to_element 等    │
└─────────────────────────────────────┘
```

---

## 工具对比表

| 特性 | describe_screen | find_interactive_elements | get_layout |
|------|-----------------|---------------------------|------------|
| **速度** | ⚡⚡⚡ 最快 | ⚡⚡ 较快 | ⚡ 较慢 |
| **详细程度** | 中等 | 详细 | 非常详细 |
| **元素数量** | 限制（30个交互+20个文本） | 不限制（分组显示时有限制） | 不限制 |
| **层次结构** | ❌ 无 | ❌ 无（扁平列表） | ✅ 有（tree模式） |
| **分组显示** | ✅ 交互/文本分开 | ✅ 按类型分组 | ❌ 无 |
| **适用场景** | 快速了解屏幕 | 完整交互元素列表 | 深度分析 |

---

## 代码修改

### 文件：`src/tools/builtin/AndroidTools.ts`

#### 新增函数（2个）

1. **`traverseNode()`** - 节点遍历和过滤
2. **`flattenNodeTree()`** - 树结构扁平化

#### 新增工具（3个）

1. **`androidDescribeScreenTool`** - 屏幕描述
2. **`androidFindInteractiveElementsTool`** - 查找可交互元素
3. **`androidGetLayoutTool`** - 获取布局树

#### 更新工具导出数组

重新组织了 `androidTools` 数组，按功能分类：

```typescript
export const androidTools: Tool[] = [
  // ========== LAYOUT ANALYSIS & DISCOVERY ==========
  androidDescribeScreenTool,
  androidGetLayoutTool,
  androidFindInteractiveElementsTool,

  // ========== ELEMENT-BASED OPERATIONS ==========
  androidClickElementTool,
  // ...

  // 其他分类...
];
```

---

## 性能优化

### 1. 限制返回数量

- `android_describe_screen`:
  - 交互元素：最多 30 个
  - 文本元素：最多 20 个

- `android_find_interactive_elements`:
  - 分组显示：clickable 20个，scrollable/editable 各10个
  - 完整列表：不限制

### 2. 深度限制

- 默认 `maxDepth = 50`
- 防止过深的树结构导致性能问题
- 用户可自定义

### 3. 可见性过滤

- 默认 `visibleOnly = true`
- 跳过不可见元素，减少处理量
- 提高结果相关性

### 4. 交互性过滤

- `interactiveOnly` 选项
- 只处理可点击/滚动/编辑的元素
- 减少噪音数据

---

## 实际使用示例

### 示例 1：登录流程

```javascript
// 1. 了解登录页面
const screen = await android_describe_screen();
console.log(screen.summary);
// "Screen in com.example.app (.LoginActivity) with 5 interactive elements"

console.log(screen.interactiveElements.elements);
// [
//   { text: "用户名", id: "...:id/username", isEditable: true },
//   { text: "密码", id: "...:id/password", isEditable: true },
//   { text: "登录", id: "...:id/login_btn", isClickable: true }
// ]

// 2. 输入用户名
await android_input_text_to_element({
  id: "com.example.app:id/username",
  inputText: "user@example.com"
});

// 3. 输入密码
await android_input_text_to_element({
  id: "com.example.app:id/password",
  inputText: "password123"
});

// 4. 点击登录
await android_click_element({ text: "登录" });
```

### 示例 2：查找并点击列表项

```javascript
// 1. 查找所有可交互元素
const result = await android_find_interactive_elements();

// 2. 找到滚动列表
const scrollableList = result.groupedByType.scrollable[0];
console.log(`Found scrollable: ${scrollableList.className}`);

// 3. 在列表中查找目标
const targetExists = await android_exists({ text: "目标项目" });

if (!targetExists.exists) {
  // 4. 如果找不到，滚动列表
  await android_scroll_element({
    className: scrollableList.className,
    direction: "forward"
  });

  // 5. 再次查找
  await android_wait_for({ text: "目标项目", timeout: 3000 });
}

// 6. 点击目标
await android_click_element({ text: "目标项目" });
```

### 示例 3：复杂界面分析

```javascript
// 1. 获取完整布局（树形结构）
const layout = await android_get_layout({
  visibleOnly: true,
  maxDepth: 30,
  format: 'tree'
});

// 2. 分析根节点
console.log(`Root: ${layout.tree.className}`);
console.log(`Total elements: ${layout.count}`);

// 3. 查找特定深度的元素
const flatLayout = await android_get_layout({ format: 'flat' });
const depth2Elements = flatLayout.elements.filter(e => e.depth === 2);
console.log(`Elements at depth 2: ${depth2Elements.length}`);
```

---

## 与其他工具的配合

### 配合元素操作工具

```javascript
// 1. 用布局分析找到元素
const screen = await android_describe_screen();
const loginButton = screen.interactiveElements.elements.find(
  e => e.text === "登录"
);

// 2. 用元素操作工具执行操作
if (loginButton.isClickable) {
  await android_click_element({ text: "登录" });
}
```

### 配合查找工具

```javascript
// 1. 快速检查元素是否存在
const exists = await android_exists({ text: "设置" });

// 2. 如果不存在，用布局分析查看屏幕上有什么
if (!exists.exists) {
  const screen = await android_describe_screen();
  console.log("可用选项：", screen.interactiveElements.elements.map(e => e.text));
}
```

---

## 未来可能的改进

1. **缓存机制**
   - 缓存最近的布局分析结果
   - 减少重复遍历

2. **增量更新**
   - 只分析变化的部分
   - 提高性能

3. **智能筛选**
   - 基于 AI 的元素重要性评分
   - 自动过滤不相关元素

4. **可视化导出**
   - 导出为 XML（类似 uiautomatorviewer）
   - 导出为 HTML 可视化界面

5. **语义分析**
   - 识别常见 UI 模式（登录表单、设置列表等）
   - 提供语义化的描述

---

## 常见问题

### Q: 这些工具会让 Agent 响应变慢吗？

A: 根据工具选择：
- `android_describe_screen` 非常快（限制数量）
- `android_find_interactive_elements` 较快（只遍历交互元素）
- `android_get_layout` 较慢（完整遍历）

建议：先用快的工具，不够再用详细的工具。

### Q: 返回的元素太多，Agent 难以处理怎么办？

A: 使用过滤参数：
```javascript
// 只要可见且可交互的
await android_get_layout({
  visibleOnly: true,
  interactiveOnly: true
});

// 限制深度
await android_get_layout({ maxDepth: 10 });
```

### Q: 如何选择使用哪个工具？

A: 参考决策树：
```
需要快速了解屏幕？
  → android_describe_screen

需要所有可交互元素？
  → android_find_interactive_elements

需要完整层次结构？
  → android_get_layout
```

---

## 总结

通过添加这 3 个布局分析工具，Agent 现在可以：

✅ **理解当前界面** - 知道在哪个应用的哪个页面
✅ **发现可操作元素** - 找到所有按钮、输入框、列表
✅ **分析界面结构** - 理解控件的层次关系
✅ **智能选择操作** - 基于元素属性选择正确的操作方法
✅ **提高成功率** - 不再盲目点击坐标，而是基于元素操作

**推荐工作流**：
```
android_describe_screen → 选择元素 → android_click_element/android_input_text_to_element
```

详细使用指南请参考：`docs/Layout-Analysis-Tools.md`
