@echo off
:: Start OpenClaw Plus Server
cd /d M:\betterAI
start "OpenClaw Plus" /min node server/index.mjs
echo OpenClaw Plus started on http://localhost:8787
timeout /t 2 >nul
