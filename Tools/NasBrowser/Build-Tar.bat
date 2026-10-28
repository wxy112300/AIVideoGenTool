@echo off
chcp 65001 >nul
setlocal EnableExtensions DisableDelayedExpansion
title NAS Browser - Build Docker TAR

pushd "%~dp0..\.."
if errorlevel 1 (
  echo [ERROR] Cannot open the repository directory.
  if /i not "%~1"=="--no-pause" pause
  exit /b 1
)

set "NAS_IMAGE=local-video-studio-nas:local"
set "NAS_TAR=%~dp0local-video-studio-nas.tar"
set "NAS_PARTIAL=%~dp0local-video-studio-nas.tar.partial"
set "NAS_EXIT=1"

where node >nul 2>&1
if errorlevel 1 goto missing_node
call node -e "const [major,minor]=process.versions.node.split('.').map(Number);if(major<22 || (major===22 && minor<13))process.exit(1)"
if errorlevel 1 goto missing_node

where docker >nul 2>&1
if errorlevel 1 goto missing_docker
call docker info >nul 2>&1
if errorlevel 1 goto unavailable_docker
call docker info --format "{{.OSType}}" | findstr /x /c:"linux" >nul
if errorlevel 1 goto unavailable_docker

if exist "node_modules\vite\package.json" goto build_service
where npm.cmd >nul 2>&1
if errorlevel 1 goto missing_npm
echo Installing repository dependencies...
call npm.cmd ci
if errorlevel 1 goto failed

:build_service
echo.
echo [1/4] Building NAS Browser...
call node Tools/NasBrowser/build.mjs
if errorlevel 1 goto failed

echo.
echo [2/4] Building linux/amd64 Docker image...
call docker build --platform linux/amd64 -t "%NAS_IMAGE%" Tools/NasBrowser
if errorlevel 1 goto failed

echo.
echo [3/4] Checking Node SQLite inside the image...
call docker run --rm --network none --entrypoint node "%NAS_IMAGE%" -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ready (id INTEGER)');db.close();console.log('Node SQLite OK')"
if errorlevel 1 goto failed

echo.
echo [4/4] Exporting Docker image...
call docker save -o "%NAS_PARTIAL%" "%NAS_IMAGE%"
if errorlevel 1 goto failed
call node -e "const fs=require('node:fs');const [source,target]=process.argv.slice(1);if(!fs.statSync(source).size)throw new Error('Empty Docker archive');fs.renameSync(source,target)" "%NAS_PARTIAL%" "%NAS_TAR%"
if errorlevel 1 goto failed

echo.
echo [OK] TAR created:
echo "%NAS_TAR%"
echo Import this file using DSM Docker - Image - Add from file.
echo Actual DSM kernel and Docker compatibility still require a NAS startup check.
set "NAS_EXIT=0"
goto finish

:missing_node
echo [ERROR] Node.js 22.13 or newer is required. Install it and reopen this script.
goto finish

:missing_docker
echo [ERROR] Docker CLI was not found. Install Docker Desktop, then start it in Linux containers mode.
echo Alternatively, use the NAS-side build steps in README.md.
goto finish

:unavailable_docker
echo [ERROR] A running Linux Docker engine is required. Start Docker Desktop and select Linux containers.
goto finish

:missing_npm
echo [ERROR] npm.cmd was not found. Install Node.js with npm, then reopen this script.
goto finish

:failed
echo.
echo [ERROR] Build or export failed. See the error above. Any previous completed TAR is preserved.

:finish
popd
if /i not "%~1"=="--no-pause" pause
exit /b %NAS_EXIT%
