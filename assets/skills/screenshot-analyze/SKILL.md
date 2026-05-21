---
name: screenshot-analyze
description: >-
  截图与屏幕分析：截图、OCR识别、UI结构分析。
  适用场景：查看当前屏幕内容、识别文字、分析界面布局。
---

# 截图与分析指南

## 基本截图
1. 调用 `android_screenshot` 截取当前屏幕
2. 返回的图片会自动作为消息附件，可直接查看

## OCR 文字识别
1. 先截图获取当前屏幕
2. 调用 `ocr_recognize_screen` 识别屏幕文字
3. 返回识别到的文本内容和位置信息

## UI 结构分析
1. 调用 `android_dump_ui` 获取当前界面的 UI 树
2. 分析节点层次结构、属性（text, resource-id, clickable 等）
3. 找到目标元素的确切位置和属性

## 查找特定元素
- 文本查找: `android_find_text` — 按显示文本搜索
- ID查找: `android_find_by_id` — 按 resource-id 搜索
- 描述查找: `android_find_by_desc` — 按 content-description 搜索

## 分析流程建议
1. 先截图了解整体界面
2. 如需精确元素信息，用 `android_dump_ui`
3. 如需文本内容，用 OCR
4. 综合多种信息源得出结论

## 注意事项
- 截图会包含状态栏和导航栏
- OCR 对中文支持较好，但手写体/艺术字可能不准确
- UI dump 只能获取 Accessibility 可见的节点
- WebView 内的内容可能无法通过 UI dump 获取
