@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  set "RAISEWISE_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
) else (
  set "RAISEWISE_NODE=node"
)
if not "%RAISEWISE_NODE%"=="node" if not exist "%RAISEWISE_NODE%" (
  echo Node.js 20 or newer is required. Install Node.js and try again.
  pause
  exit /b 1
)
echo RaiseWise local preview
echo Open http://127.0.0.1:4173 in your browser after the server starts.
echo Press Ctrl+C to stop.
"%RAISEWISE_NODE%" scripts\serve.mjs
pause
