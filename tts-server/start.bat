@echo off
chcp 65001 >nul
echo ================================================
echo   Local TTS Server - 一键启动
echo   http://localhost:8880
echo ================================================
echo.

cd /d "%~dp0"

:: 检查 Python
python --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 Python，请先安装 Python 3.10+
    pause
    exit /b 1
)

:: 检查依赖
python -c "import fastapi" >nul 2>&1
if errorlevel 1 (
    echo [安装依赖] 首次运行，正在安装...
    pip install -r requirements.txt
    echo.
)

:: 检查 Kokoro 模型文件
if not exist "models\kokoro-v1.0.onnx" (
    echo [提示] Kokoro 模型文件未找到。
    echo 请下载: https://github.com/thewh1teagle/kokoro-onnx/releases
    echo 将 kokoro-v1.0.onnx 和 voices-v1.0.bin 放入 models\ 目录
    echo.
    echo 仍可启动服务（其他引擎可用），按任意键继续...
    pause >nul
)

:: 启动服务
echo [启动] TTS Server on :8880
python main.py
pause
