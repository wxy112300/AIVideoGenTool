@echo off
start "" powershell.exe -NoLogo -NoProfile -STA -WindowStyle Hidden -File "%~dp0Export-Diagnostics.ps1" -ShowResult
