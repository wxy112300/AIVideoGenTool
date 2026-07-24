[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [string]$ComfyRoot = "C:\Users\Alice\Documents\ComfyUI"
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot

Write-Host "1/3 Checking the local environment..."
& (Join-Path $PSScriptRoot "check-environment.ps1") -ComfyRoot $ComfyRoot

Write-Host "`n2/3 Installing Node dependencies..."
npm install

if (-not $SkipBuild) {
  Write-Host "`n3/3 Running tests and production build..."
  npm test
  npm run build
} else {
  Write-Host "`n3/3 Build skipped."
}

Write-Host "`nSetup complete. Run 'npm run dev' to launch Local Video Studio."
