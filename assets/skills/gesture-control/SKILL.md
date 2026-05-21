---
name: gesture-control
description: >-
  手势操作：滑动、长按、双击、缩放、拖拽。
  适用场景：翻页浏览、下拉刷新、地图缩放、拖动排序。
---

# 手势操作指南

## 基本点击
- 单击: `android_click(x, y)`
- 长按: `android_long_click(x, y)`

## 滑动操作
使用 `android_swipe` 工具：
- 参数: startX, startY, endX, endY, duration(ms)

### 常见滑动方向
| 操作 | startY vs endY | 说明 |
|------|---------------|------|
| 向上滚动 | startY > endY | 手指从下往上滑，内容上移 |
| 向下滚动 | startY < endY | 手指从上往下滑，内容下移 |
| 向左翻页 | startX > endX | 手指从右往左滑 |
| 向右翻页 | startX < endX | 手指从左往右滑 |

### 下拉刷新
```
startX = 屏幕宽度/2
startY = 屏幕高度 * 0.3
endX = startX
endY = 屏幕高度 * 0.7
duration = 500
```

### 快速滑动（惯性）
- duration 设为 100-200ms 可模拟快速滑动
- 快速滑动会产生惯性效果

## 缩放操作
使用 `android_pinch` 工具（如果可用）：
- 放大: pinch out（两指外扩）
- 缩小: pinch in（两指内缩）

如果没有专用工具，使用 `code_exec_async`：
```javascript
// 双指缩放
await auto.pinch(centerX, centerY, scale, duration);
```

## 拖拽操作
使用 `android_swipe` 模拟拖拽：
1. 确定起始元素的中心坐标
2. 确定目标位置坐标
3. 使用较长的 duration（800-1500ms）模拟缓慢拖动

## 复杂手势组合
通过 `code_exec_async` 使用 Automator API：
```javascript
// 自定义手势路径
await auto.gesture([
  { x: 100, y: 500, duration: 0 },    // 起始点
  { x: 200, y: 400, duration: 200 },  // 路径点
  { x: 300, y: 300, duration: 200 },  // 路径点
]);
```

## 注意事项
- 操作前用 `get_device_info` 获取屏幕尺寸以计算相对坐标
- 滑动 duration 过短可能不被识别
- 某些应用拦截手势事件，可能需要使用 Accessibility API
- 动画执行期间避免连续操作，适当等待
