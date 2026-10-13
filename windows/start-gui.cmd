@echo off
REM 双击即可运行图形化启动器。
setlocal
cd /d "%~dp0.."
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-gui.ps1" %*
if errorlevel 1 (
  echo.
  echo [bridge] 启动失败，请查看上面的错误信息。
  pause
)
endlocal
