@echo off
REM Anode ClawdBot 部署脚本 (Windows)
REM 使用 adb 上传文件到 Android 设备

setlocal

REM 配置
set ADB=D:\scrcpy-win64-v3.3.1\adb.exe
set TARGET_DIR=/sdcard/ACS/.anode-clawdbot

echo ==========================================
echo   Anode ClawdBot 部署脚本
echo ==========================================
echo.

REM 检查设备连接
echo 1. 检查设备连接...
"%ADB%" devices
echo.

REM 输入设备 ID
set /p DEVICE_ID="请输入设备 ID (例如: 9c9097ab): "

if "%DEVICE_ID%"=="" (
    echo 错误: 未输入设备 ID
    pause
    exit /b 1
)

REM 创建目标目录
echo.
echo 2. 创建目标目录...
"%ADB%" -s %DEVICE_ID% shell "mkdir -p %TARGET_DIR%"

REM 上传 dist 目录
echo.
echo 3. 上传 dist 目录 (74个文件, 484KB)...
"%ADB%" -s %DEVICE_ID% push dist %TARGET_DIR%/

REM 上传 package.json
echo.
echo 4. 上传 package.json...
"%ADB%" -s %DEVICE_ID% push package.json %TARGET_DIR%/

REM 上传 assets 目录
echo.
echo 5. 上传 assets 目录...
"%ADB%" -s %DEVICE_ID% push assets %TARGET_DIR%/

REM 创建配置文件
echo.
echo 6. 复制默认配置...
"%ADB%" -s %DEVICE_ID% shell "cp %TARGET_DIR%/assets/config.default.json %TARGET_DIR%/config.json 2>/dev/null || true"

REM 验证上传
echo.
echo 7. 验证上传...
"%ADB%" -s %DEVICE_ID% shell "ls -lh %TARGET_DIR%/"

echo.
echo ==========================================
echo   部署完成！
echo ==========================================
echo.
echo 目标路径: %TARGET_DIR%
echo.
echo 启动命令:
echo   node %TARGET_DIR%/dist/start-ui.js
echo.
echo 首次使用需要配置 API Key：
echo   编辑 %TARGET_DIR%/config.json
echo.

pause
