---
name: screen-navigation
description: >-
  Android屏幕交互：查找UI元素并点击、滚动查找、手势操作。
  适用场景：找到并点击按钮、滚动页面查找文本、导航到指定界面。
---

# 屏幕交互操作指南

## 查找并点击元素
1. 调用 `android_find_text` 查找目标文本
2. 从返回的 nodes 中取 bounds
3. 计算中心坐标: x = (left + right) / 2, y = (top + bottom) / 2
4. 调用 `android_click(x, y)`

## 滚动查找
如果 `android_find_text` 找不到目标：
1. 调用 `android_swipe` 向上滑动（startY > endY，模拟手指上滑）
2. 等待 500ms（用 `code_exec_async` 执行 `await new Promise(r => setTimeout(r, 500))`）
3. 再次调用 `android_find_text`
4. 重复最多 5 次
5. 如果仍找不到，向相反方向滚动尝试

## 通过ID/描述查找
- 当知道元素的 resource-id 时，优先使用 `android_find_by_id`
- 当知道元素的 content-description 时，使用 `android_find_by_desc`
- 这些方法比文本查找更精确

## 处理列表/RecyclerView
- 先尝试直接查找目标项
- 如果不在可见区域，使用 `android_scroll` 在列表容器上滚动
- 每次滚动后检查是否到达列表末尾（前后两次查找结果相同）

## 注意事项
- 每步操作后用 `android_screenshot` 验证结果
- 如果元素不可点击，尝试点击其父容器区域
- 坐标超出屏幕范围时需要先滚动
- 对话框/弹窗优先处理（可能覆盖目标元素）
