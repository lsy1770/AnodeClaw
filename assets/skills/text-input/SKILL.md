---
name: text-input
description: >-
  Android文本输入：设置焦点、输入文字、粘贴内容、清除文本。
  适用场景：在输入框中输入文字、填写表单、搜索内容。
---

# 文本输入指南

## 基本输入流程
1. 点击目标输入框使其获得焦点
2. 调用 `android_input_text` 输入文字
3. 用截图验证输入结果

## 点击输入框获取焦点
1. 用 `android_find_text` 或 `android_find_by_id` 定位输入框
2. 计算中心坐标并点击
3. 等待 300ms 确保键盘弹出

## 输入文字
- 使用 `android_input_text` 直接输入
- 注意：某些输入框可能需要先清除已有内容

## 清除已有文本
1. 长按输入框触发全选
2. 或使用 `android_press_key` 发送 Ctrl+A 全选
3. 然后输入新内容（会替换选中内容）
4. 或使用 `android_clear_text` 工具（如果可用）

## 粘贴内容
1. 使用 `code_exec_async` 设置剪贴板: `device.setClipboard("内容")`
2. 长按输入框
3. 在弹出菜单中点击"粘贴"

## 搜索框输入
1. 找到并点击搜索图标/搜索框
2. 输入搜索关键词
3. 按回车键: `android_press_key("enter")`

## 注意事项
- 中文输入通过 `android_input_text` 直接支持
- 密码框可能隐藏输入内容，但仍可正常输入
- 某些应用的自定义输入框可能不响应标准输入方法
- 输入完成后可能需要点击"确认"/"发送"按钮
