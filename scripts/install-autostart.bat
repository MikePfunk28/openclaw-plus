@echo off
:: OpenClaw Plus Auto-Start Installer for Windows
:: Run as Administrator

set "PROJECT_DIR=M:\betterAI"
set "TASK_NAME=OpenClawPlus"

echo Installing OpenClaw Plus auto-start...

:: Create the task to run at login
schtasks /create /tn "%TASK_NAME%" /tr "wscript.exe \"%PROJECT_DIR%\scripts\start-hidden.vbs\"" /sc onlogon /rl highest /f

if %errorlevel% equ 0 (
    echo Success! OpenClaw Plus will start automatically on login.
    echo.
    echo To start now without rebooting, run:
    echo   schtasks /run /tn "%TASK_NAME%"
    echo.
    echo To remove auto-start, run:
    echo   schtasks /delete /tn "%TASK_NAME%" /f
) else (
    echo Failed to create scheduled task. Try running as Administrator.
)

pause
