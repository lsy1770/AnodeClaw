# AndroidTools.ts 修复说明

## 问题描述

之前的 AndroidTools.ts 实现存在一个严重问题：在找到 UI 控件后，是通过获取控件的 `bounds` 属性计算中心坐标，然后使用坐标点击的方式来操作控件。这种方式不够可靠，因为：

1. **不尊重控件状态**：没有检查控件是否真的可点击（`isClickable`）
2. **不利用原生方法**：Android Accessibility 控件本身就有 `click()`、`scroll()`、`collapse()` 等方法
3. **容易出错**：坐标点击可能因为控件移动、动画、屏幕滚动等原因失败

## 解决方案

### 新增基于控件方法的工具

添加了 7 个新的工具，直接使用 `AccessibilityNode` 的原生方法：

1. **android_click_element** - 找到元素并点击
   - 使用 `node.click()` 而不是坐标点击
   - 自动检查 `isClickable` 属性
   - 支持通过 text/id/className 查找
   - 支持超时等待

2. **android_long_click_element** - 找到元素并长按
   - 使用 `node.longClick()`
   - 检查 `isLongClickable` 属性

3. **android_input_text_to_element** - 找到元素并输入文本
   - 使用 `node.setText()` 或 `node.appendText()`
   - 检查 `isEditable` 属性
   - 支持清空现有文本

4. **android_scroll_element** - 滚动特定元素
   - 使用 `node.scrollForward()` 或 `node.scrollBackward()`
   - 检查 `isScrollable` 属性

5. **android_expand_element** - 展开元素
   - 使用 `node.expand()`
   - 用于展开可折叠的节点（如树形控件、下拉列表等）

6. **android_collapse_element** - 折叠元素
   - 使用 `node.collapse()`

7. **android_focus_element** - 聚焦元素
   - 使用 `node.focus()`
   - 用于将焦点设置到特定元素

### 工具选择策略

现在有两类工具：

1. **基于元素的工具（推荐 - 更可靠）**：
   - android_click_element, android_long_click_element, android_input_text_to_element
   - android_scroll_element, android_expand_element, android_collapse_element
   - 这些工具找到元素后使用其**原生方法**
   - 更可靠，因为尊重元素属性

2. **基于坐标的工具（遗留 - 仅在必要时使用）**：
   - android_click, android_long_click, android_swipe
   - 直接操作屏幕坐标
   - 仅在无法找到元素或用于手势交互时使用

### 技术细节

#### AccessibilityNode 的方法

从 `D:\ACS-C\ACS\automator\src\main\java\com\yunxi\automator\model\AccessibilityNode.kt` 中，控件支持以下方法：

```kotlin
// 基础操作
click(): Boolean
longClick(): Boolean
focus(): Boolean
clearFocus(): Boolean
select(): Boolean

// 文本操作
setText(text: String): Boolean
appendText(text: String): Boolean
clearText(): Boolean

// 滚动操作
scrollForward(): Boolean
scrollBackward(): Boolean

// 展开/折叠
expand(): Boolean
collapse(): Boolean

// 勾选操作
check(): Boolean
uncheck(): Boolean

// 关闭
dismiss(): Boolean

// 底层方法
performAction(action: Int): Boolean
performAction(action: Int, arguments: Bundle): Boolean
```

#### 线程安全

`AccessibilityNode` 的方法会自动处理线程切换：
- 使用 `runOnMainThreadBlocking` 确保 Accessibility 操作在主线程执行
- 从 V8 线程调用时会自动分派到主线程并等待结果

## 使用示例

### 之前的做法（不推荐）

```javascript
// 1. 找到按钮
const result = await android_find_text({ text: "登录" });
// 2. 获取坐标
const bounds = result.nodes[0].bounds;
const centerX = (bounds.left + bounds.right) / 2;
const centerY = (bounds.top + bounds.bottom) / 2;
// 3. 点击坐标
await android_click({ x: centerX, y: centerY });
```

### 现在的做法（推荐）

```javascript
// 一步完成：找到并点击
await android_click_element({ text: "登录", timeout: 5000 });
```

### 更多示例

```javascript
// 输入文本
await android_input_text_to_element({
  id: "com.example:id/username",
  inputText: "user@example.com",
  clearFirst: true
});

// 滚动列表
await android_scroll_element({
  className: "android.widget.ScrollView",
  direction: "forward"
});

// 展开下拉菜单
await android_expand_element({
  text: "更多选项"
});
```

## 兼容性

- 保留了所有旧的基于坐标的工具，确保向后兼容
- 新工具作为补充，提供更可靠的操作方式
- 建议逐步迁移到新的基于元素的工具

## 测试建议

1. 测试新的 element-based 工具是否能正确找到并操作控件
2. 验证超时机制是否正常工作
3. 检查属性检查（isClickable, isEditable 等）是否生效
4. 测试在控件不可用时的错误处理

## 文件修改

- **修改**: `src/tools/builtin/AndroidTools.ts`
  - 添加 7 个新工具
  - 更新文件头部注释，说明工具选择策略
  - 更新 `androidTools` 导出数组，按类别组织工具

## 下一步改进

可以考虑添加以下工具（如有需要）：
- android_check_element (勾选复选框)
- android_uncheck_element (取消勾选)
- android_select_element (选择)
- android_dismiss_element (关闭)
- android_clear_text_element (清除文本)

但目前已覆盖最常用的操作。
