@echo off
setlocal

cd /d "%~dp0"

if not exist "package.json" (
  echo [ERROR] package.json was not found in:
  echo         %CD%
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo         Install Node.js 22 or newer, then run this file again.
  pause
  exit /b 1
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found in PATH.
  echo         Repair the Node.js installation, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\.package-lock.json" (
  echo [INFO] Installing project dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo [ERROR] Dependency installation failed.
    pause
    exit /b 1
  )
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [INFO] Downloading the Electron runtime for first launch...
  node "node_modules\electron\install.js"
  if errorlevel 1 (
    echo [ERROR] Electron runtime installation failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting Local Video Studio...
echo [INFO] Keep this window open while developing. Press Ctrl+C to stop.
echo.

call npm.cmd run dev
set "EXIT_CODE=%ERRORLEVEL%"

if not "%EXIT_CODE%"=="0" (
  echo.
  echo [ERROR] Local Video Studio exited with code %EXIT_CODE%.
  pause
)

exit /b %EXIT_CODE%
