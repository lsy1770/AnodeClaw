---
name: app-management
description: >-
  Android应用管理：启动、切换、关闭应用，查看运行状态。
  适用场景：打开指定应用、切换到后台应用、管理应用进程。
---

# 应用管理指南

## 启动应用
1. 使用 `code_exec_async` 执行 `await app.launch("com.example.package")`
2. 等待 2-3 秒让应用加载
3. 用 `get_current_app` 验证是否成功启动
4. 如果失败，检查包名是否正确

## 获取当前应用信息
- 调用 `get_current_app` 获取当前前台应用的包名和 Activity

## 切换应用
1. 先调用 `get_current_app` 确认当前不在目标应用
2. 如果不在，使用 `app.launch()` 启动目标应用
3. 已在后台的应用会直接恢复，不会重新创建

## 通过最近任务切换
1. 调用 `android_press_recent` 打开最近任务
2. 用 `android_screenshot` 查看任务列表
3. 找到目标应用缩略图并点击

## 关闭应用
- 使用 `code_exec_async` 执行 `await app.forceStop("com.example.package")`
- 或通过最近任务界面向上滑动移除

## 安装/卸载
- 安装 APK: `code_exec_async` 中使用 `await app.installApk("/path/to/app.apk")`
- 卸载: `code_exec_async` 中使用 `await app.uninstall("com.example.package")`

## 常见包名参考
| 应用 | 包名 |
|------|------|
| 微信 | com.tencent.mm |
| QQ | com.tencent.mobileqq |
| 支付宝 | com.eg.android.AlipayGphone |
| 淘宝 | com.taobao.taobao |
| 抖音 | com.ss.android.ugc.aweme |
| 设置 | com.android.settings |
| Chrome | com.android.chrome |
| 文件管理 | com.android.documentsui |
