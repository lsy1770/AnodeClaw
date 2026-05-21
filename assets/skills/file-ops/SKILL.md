---
name: file-ops
description: >-
  文件操作：读写文件、创建目录、文件搜索、下载传输。
  适用场景：读取配置文件、保存数据、管理文件系统。
---

# 文件操作指南

## 读取文件
- 文本文件: `read_file` 工具，指定路径和编码（默认 utf-8）
- 检查存在: `file_exists` 工具

## 写入文件
- 写入文本: `write_file` 工具，指定路径和内容
- 追加内容: `append_file` 工具（如果可用），或读取后拼接再写入

## 目录操作
- 列出文件: `list_files` 工具，返回目录下所有文件和子目录
- 创建目录: 使用 `code_exec_async` 执行 `await file.createDirectory("/path/to/dir")`

## 文件搜索
- 按名称搜索: 使用 `list_files` 递归扫描目录
- 按内容搜索: 读取文件后在内容中匹配

## 删除文件
- 使用 `delete_file` 工具或 `code_exec_async` 执行 `await file.delete("/path")`
- 删除前务必确认路径正确

## 常用路径
| 位置 | 路径 |
|------|------|
| 内部存储根目录 | /sdcard/ |
| 下载目录 | /sdcard/Download/ |
| DCIM | /sdcard/DCIM/ |
| 应用数据 | /data/data/{package}/ |
| 工作目录 | ./ (项目根目录) |

## 注意事项
- Android 文件系统区分大小写
- /sdcard/ 通常可读写，/data/ 需要权限
- 大文件操作考虑分块读写
- 写入前确保目标目录存在
