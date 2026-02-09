#!/bin/bash
# Anode ClawdBot 部署脚本
# 使用 adb 上传文件到 Android 设备

# 配置
ADB="D:/scrcpy-win64-v3.3.1/adb.exe"
TARGET_DIR="/sdcard/ACS/.anode-clawdbot"

echo "=========================================="
echo "  Anode ClawdBot 部署脚本"
echo "=========================================="
echo ""

# 检查设备连接
echo "1. 检查设备连接..."
"$ADB" devices
echo ""

# 读取设备 ID
read -p "请输入设备 ID (例如: 9c9097ab): " DEVICE_ID

if [ -z "$DEVICE_ID" ]; then
    echo "错误: 未输入设备 ID"
    exit 1
fi

# 创建目标目录
echo ""
echo "2. 创建目标目录..."
"$ADB" -s "$DEVICE_ID" shell "mkdir -p $TARGET_DIR"

# 上传 dist 目录
echo ""
echo "3. 上传 dist 目录 (74个文件, 484KB)..."
"$ADB" -s "$DEVICE_ID" push dist "$TARGET_DIR/"

# 上传 package.json
echo ""
echo "4. 上传 package.json..."
"$ADB" -s "$DEVICE_ID" push package.json "$TARGET_DIR/"

# 上传 assets 目录
echo ""
echo "5. 上传 assets 目录..."
"$ADB" -s "$DEVICE_ID" push assets "$TARGET_DIR/"

# 验证上传
echo ""
echo "6. 验证上传..."
"$ADB" -s "$DEVICE_ID" shell "ls -lh $TARGET_DIR/"

echo ""
echo "=========================================="
echo "  部署完成！"
echo "=========================================="
echo ""
echo "目标路径: $TARGET_DIR"
echo ""
echo "启动命令:"
echo "  node $TARGET_DIR/dist/start-ui.js"
echo ""
