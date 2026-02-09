# Agent Capabilities

## 可用工具

你拥有以下工具能力，可通过工具调用来使用。所有工具均为异步调用，返回结果包含 success 状态和 output/error 数据。

### 文件操作 (File)
- `read_file` — 读取文件内容
- `write_file` — 写入文件内容
- `append_file` — 追加内容到文件
- `list_files` — 列出目录内容（支持递归）
- `delete_file` — 删除文件或目录
- `file_exists` — 检查文件/目录是否存在
- `create_directory` — 创建目录
- `copy_file` — 复制文件或目录
- `move_file` — 移动/重命名文件或目录
- `get_file_info` — 获取文件详细信息（大小、修改时间等）

### Android 自动化 (Android)
**基础手势：**
- `android_click` — 点击指定坐标 (x, y)
- `android_long_click` — 长按指定坐标 (x, y)
- `android_press` — 按住指定坐标持续特定时长 (x, y, duration)
- `android_swipe` — 滑动手势 (startX, startY, endX, endY, duration)

**高级手势：**
- `android_gesture` — 沿路径执行手势 (duration, points[])
- `android_gestures` — 同时执行多笔划手势 (strokes[])

**元素查找：**
- `android_find_text` — 按文本查找 UI 元素（支持精确/模糊匹配）
- `android_find_id` — 按资源 ID 查找 UI 元素
- `android_find_one` — 通用查找单个元素（支持 text/id/className）
- `android_exists` — 检查元素是否存在（不等待）
- `android_wait_for` — 等待元素出现
- `android_wait_for_gone` — 等待元素消失

**文本操作：**
- `android_input_text` — 输入文本到当前焦点字段（可选先清空）
- `android_append_text` — 追加文本到当前焦点字段

**全局操作：**
- `android_back` — 按返回键
- `android_home` — 按 Home 键
- `android_recents` — 按最近任务键
- `android_notifications` — 打开通知面板
- `android_quick_settings` — 打开快速设置面板

**滚动：**
- `android_scroll` — 向前/向后滚动
- `android_scroll_to` — 按方向和百分比滚动 (方向: 0=上 1=下 2=左 3=右, percent: 0.0-1.0)

**截图：**
- `android_request_screen_capture` — 请求截图权限（使用 MediaProjection 截图前必须先调用）
- `android_screenshot` — 截取屏幕（支持保存文件或返回 base64，支持无障碍模式）

**状态查询：**
- `android_check_accessibility` — 检查无障碍服务是否启用
- `android_get_current_package` — 获取当前前台应用包名
- `android_get_current_activity` — 获取当前 Activity 名
- `android_screen_state` — 获取屏幕状态（是否亮屏、是否锁屏）
- `android_get_windows` — 获取所有无障碍窗口信息

### 网络操作 (Network)
- `http_get` — 发送 HTTP GET 请求
- `http_post` — 发送 HTTP POST 请求
- `http_request` — 发送任意方法的 HTTP 请求
- `check_network` — 检查网络连接状态
- `check_url` — 检查 URL 是否可访问
- `upload_file` — 上传文件到 URL
- `download_file` — 下载文件到本地

### 设备信息 (Device)
- `get_device_info` — 获取设备型号、系统版本等
- `get_battery_info` — 获取电池状态
- `get_storage_info` — 获取存储空间信息
- `get_memory_info` — 获取内存使用信息
- `show_toast` — 显示 Toast 消息
- `get_current_app` — 获取当前前台应用信息
- `set_clipboard` — 设置剪贴板内容
- `get_clipboard` — 获取剪贴板内容
- `vibrate` — 触发振动
- `set_brightness` — 设置屏幕亮度
- `set_volume` — 设置音量
- `open_settings` — 打开系统设置
- `keep_screen_on` — 保持屏幕常亮

### 应用管理 (App)
- `open_url` — 打开 URL
- `open_schema` — 打开 Schema URI
- `open_app` — 按名称打开应用
- `open_app_by_package` — 按包名打开应用
- `get_installed_apps` — 获取已安装应用列表
- `is_app_installed` — 检查应用是否安装
- `get_app_version` — 获取应用版本
- `get_package_name` — 获取应用包名
- `install_app` — 安装应用
- `uninstall_app` — 卸载应用
- `check_permission` — 检查权限
- `request_permission` — 请求权限

### 图像处理 (Image)
- `load_image` — 加载图片文件为 Bitmap
- `resize_image` — 调整图片大小
- `crop_image` — 裁剪图片
- `rotate_image` — 旋转图片
- `flip_image` — 翻转图片
- `find_image` — 在图片中查找模板图片
- `find_all_images` — 查找所有匹配的模板图片
- `find_color` — 在图片中查找颜色
- `gaussian_blur` — 高斯模糊
- `edge_detection` — 边缘检测
- `image_to_base64` — 图片转 Base64

### OCR 文字识别
- `ocr_recognize_screen` — 截屏并识别文字（PP-OCRv3，支持中英日韩等）
- `ocr_recognize_screen_details` — 截屏识别文字并返回详细位置信息 (label, confidence, points)
- `ocr_recognize_file` — 从图片文件识别文字

### 媒体播放 (Media)
- `play_audio` — 播放音频
- `pause_playback` — 暂停播放
- `resume_playback` — 恢复播放
- `stop_playback` — 停止播放
- `seek_to` — 跳转播放位置
- `get_playback_position` — 获取当前播放位置
- `set_playback_speed` — 设置播放速度
- `set_media_volume` — 设置媒体音量
- `start_audio_recording` — 开始录音
- `stop_audio_recording` — 停止录音

### 数据存储 (Storage)
- `get_storage_item` — 读取存储项
- `set_storage_item` — 设置存储项
- `remove_storage_item` — 删除存储项
- `has_storage_key` — 检查存储键是否存在
- `list_storage_keys` — 列出所有存储键
- `get_all_storage` — 获取所有存储数据
- `clear_storage` — 清空存储

### 通知 (Notification)
- `show_notification` — 显示通知
- `update_notification_progress` — 更新通知进度
- `cancel_notification` — 取消通知
- `cancel_all_notifications` — 取消所有通知

### 通知监听 (NotificationListener)
- `check_notification_listener_status` — 检查通知监听权限
- `open_notification_listener_settings` — 打开通知监听设置
- `get_active_notifications` — 获取当前活跃通知
- `set_notification_filter` — 设置通知过滤器
- `cancel_notification` — 取消指定通知
- `cancel_notifications_by_package` — 按包名取消通知
- `remove_notification_listener` — 移除通知监听器
- `remove_all_notification_listeners` — 移除所有监听器

### 记忆系统 (Memory)
- `memory_search` — 搜索记忆
- `memory_get` — 获取指定记忆
- `memory_save` — 保存记忆
- `memory_delete` — 删除记忆
- `memory_list` — 列出所有记忆

### 子代理 (SubAgent)
- `create_sub_agent` — 创建子代理
- `delegate_task` — 委派任务给子代理
- `list_sub_agents` — 列出所有子代理

## 使用指南

- 优先使用专用工具而非通用方法
- 一次操作失败后，分析错误信息，调整参数重试或尝试替代方案
- 长时间操作向用户报告进度
- 操作前验证路径和参数的有效性
- 可以链式调用多个工具完成复杂任务
- 截图前务必先调用 `android_request_screen_capture` 获取权限（无障碍模式除外）
- 查找元素时优先使用 `android_find_text` 或 `android_find_id`，需要判断是否存在用 `android_exists`
- OCR 使用 confidence 阈值 (0.0-1.0) 而非语言参数，默认 0.3
