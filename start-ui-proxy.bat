@echo off
setlocal

cd /d "%~dp0"

if not "%~1"=="" set "PROXY_URL=%~1"
if not defined PROXY_URL if defined LOCAL_VIDEO_STUDIO_PROXY set "PROXY_URL=%LOCAL_VIDEO_STUDIO_PROXY%"
if defined PROXY_URL goto proxy_ready

set "PROXY_URL=http://127.0.0.1:7890"
set /p "PROXY_INPUT=Proxy URL [%PROXY_URL%]: "
if defined PROXY_INPUT set "PROXY_URL=%PROXY_INPUT%"

:proxy_ready
set "LOCAL_NO_PROXY=localhost,127.0.0.1,::1"
if defined NO_PROXY set "LOCAL_NO_PROXY=%LOCAL_NO_PROXY%,%NO_PROXY%"

set "HTTP_PROXY=%PROXY_URL%"
set "HTTPS_PROXY=%PROXY_URL%"
set "ALL_PROXY=%PROXY_URL%"
set "http_proxy=%PROXY_URL%"
set "https_proxy=%PROXY_URL%"
set "all_proxy=%PROXY_URL%"
set "NO_PROXY=%LOCAL_NO_PROXY%"
set "no_proxy=%LOCAL_NO_PROXY%"

set "npm_config_proxy=%PROXY_URL%"
set "npm_config_https_proxy=%PROXY_URL%"
set "npm_config_noproxy=%LOCAL_NO_PROXY%"
set "PIP_PROXY=%PROXY_URL%"

set "ELECTRON_GET_USE_PROXY=1"
set "GLOBAL_AGENT_HTTP_PROXY=%PROXY_URL%"
set "GLOBAL_AGENT_HTTPS_PROXY=%PROXY_URL%"
set "GLOBAL_AGENT_NO_PROXY=%LOCAL_NO_PROXY%"

echo [INFO] Proxy enabled for npm, Electron downloads, and child processes.
echo [INFO] Local services bypass the proxy.
echo.

call "%~dp0start-ui.bat"
exit /b %ERRORLEVEL%