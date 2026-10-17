@echo off
start "" powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -File "%~dp0strata-agent.ps1"
