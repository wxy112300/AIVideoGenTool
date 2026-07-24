[CmdletBinding()]
param(
  [string]$ComfyRoot = "C:\Users\Alice\Documents\ComfyUI",
  [string]$ComfyUrl = "http://127.0.0.1:8188",
  [string]$LmStudioUrl = "http://127.0.0.1:1234/v1"
)

$checks = [System.Collections.Generic.List[object]]::new()

function Add-Check {
  param(
    [string]$Name,
    [bool]$Ok,
    [string]$Detail,
    [bool]$Required = $false
  )
  $script:checks.Add([pscustomobject]@{
    Name = $Name
    Status = if ($Ok) { "OK" } elseif ($Required) { "MISSING" } else { "OPTIONAL" }
    Detail = $Detail
  })
}

function Get-CommandVersion {
  param([string]$Command, [string[]]$Arguments = @("--version"))
  $resolved = Get-Command $Command -ErrorAction SilentlyContinue
  if (-not $resolved) { return $null }
  try {
    return ((& $resolved.Source @Arguments 2>&1 | Select-Object -First 1) -join "").Trim()
  } catch {
    return "found at $($resolved.Source)"
  }
}

$nodeVersion = Get-CommandVersion "node"
$npmVersion = Get-CommandVersion "npm"
$gitVersion = Get-CommandVersion "git"
$ffmpegVersion = Get-CommandVersion "ffmpeg" @("-version")
$gpuInfo = Get-CommandVersion "nvidia-smi" @("--query-gpu=name,driver_version,memory.total", "--format=csv,noheader")

$nodeMajor = if ($nodeVersion -match "v(\d+)") { [int]$Matches[1] } else { 0 }
Add-Check "Node.js 22+" ($nodeMajor -ge 22) ($nodeVersion ?? "not found") $true
Add-Check "npm" ([bool]$npmVersion) ($npmVersion ?? "not found") $true
Add-Check "Git" ([bool]$gitVersion) ($gitVersion ?? "not found")
Add-Check "FFmpeg" ([bool]$ffmpegVersion) ($ffmpegVersion ?? "not found; needed for partial-video and post-processing")
Add-Check "NVIDIA GPU" ([bool]$gpuInfo) ($gpuInfo ?? "nvidia-smi not found; GPU execution is handled by ComfyUI")

$portablePython = Join-Path (Split-Path $ComfyRoot -Parent) "python_embeded\python.exe"
$desktopPython = Join-Path $ComfyRoot ".venv\Scripts\python.exe"
$pythonCommand = Get-Command "python" -ErrorAction SilentlyContinue
$pythonPath =
  if (Test-Path $portablePython) { $portablePython }
  elseif (Test-Path $desktopPython) { $desktopPython }
  elseif ($pythonCommand) { $pythonCommand.Source }
  else { $null }
Add-Check "ComfyUI Python" ([bool]$pythonPath) ($pythonPath ?? "not found; Portable/Desktop may manage Python elsewhere")

$modelPath = Join-Path $ComfyRoot "models"
Add-Check "ComfyUI models" (Test-Path $modelPath) $modelPath
if (Test-Path $modelPath) {
  foreach ($folder in @("checkpoints", "diffusion_models", "unet", "text_encoders", "vae", "loras")) {
    $candidate = Join-Path $modelPath $folder
    $count = if (Test-Path $candidate) {
      @(Get-ChildItem $candidate -File -Recurse -ErrorAction SilentlyContinue).Count
    } else { 0 }
    Add-Check "models\$folder" ($count -gt 0) "$count files"
  }
}

$lmStudioCandidates = @(
  (Join-Path $env:LOCALAPPDATA "Programs\LM Studio\LM Studio.exe"),
  (Join-Path $env:LOCALAPPDATA "LM-Studio\LM Studio.exe")
)
$lmStudioExe = $lmStudioCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
Add-Check "LM Studio app" ([bool]$lmStudioExe) ($lmStudioExe ?? "standard install path not found")

try {
  $stats = Invoke-RestMethod -Uri "$($ComfyUrl.TrimEnd('/'))/system_stats" -TimeoutSec 4
  Add-Check "ComfyUI API" $true "$ComfyUrl reachable"
} catch {
  Add-Check "ComfyUI API" $false "$ComfyUrl not reachable (start ComfyUI before integration tests)"
}

try {
  $models = Invoke-RestMethod -Uri "$($LmStudioUrl.TrimEnd('/'))/models" -TimeoutSec 4
  $modelIds = @($models.data | ForEach-Object { $_.id }) -join ", "
  Add-Check "LM Studio API" $true ($(if ($modelIds) { $modelIds } else { "$LmStudioUrl reachable; no model loaded" }))
} catch {
  Add-Check "LM Studio API" $false "$LmStudioUrl not reachable (load a model and start the local server)"
}

$checks | Format-Table -AutoSize -Wrap

$requiredFailures = @($checks | Where-Object { $_.Status -eq "MISSING" })
if ($requiredFailures.Count -gt 0) {
  Write-Error "Required desktop development dependencies are missing."
  exit 1
}

Write-Host "`nDesktop development prerequisites are ready. Optional GPU-service checks may be completed on the local 4090 machine."
