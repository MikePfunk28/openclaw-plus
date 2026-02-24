@echo off
:: OpenClaw Plus Auto-Start Uninstaller for Windows

set "TASK_NAME=OpenClawPlus"

echo Removing OpenClaw Plus auto-start...

schtasks /delete /tn "%TASK_NAME%" /f 2>nul

if %errorlevel% equ 0 (
    echo Success! Auto-start removed.
) else (
    echo Task not found or already removed.
)

pause
