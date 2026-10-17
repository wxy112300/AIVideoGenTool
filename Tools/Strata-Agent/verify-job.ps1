# Real Windows Job lifecycle check. No window automation, model, network or user settings.
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'StrataAgentJob.cs')
$node=(Get-Command node.exe).Source
$job=New-Object StrataAgentJob
$process=$null
try {
  $script="const {spawn}=require('node:child_process');process.stdin.once('data',()=>{const p=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});console.log(p.pid);});setInterval(()=>{},1000);"
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$node; $psi.Arguments='-e "'+$script+'"'; $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true
  $psi.RedirectStandardInput=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
  $process=[Diagnostics.Process]::Start($psi)
  $job.Add($process)
  $process.StandardInput.WriteLine('spawn-owned-child'); $process.StandardInput.Flush()
  $read=$process.StandardOutput.ReadLineAsync()
  if(!$read.Wait(5000)){throw 'Owned child did not report its PID'}
  $childPid=[int]$read.Result
  $ownedChild=Get-Process -Id $childPid -ErrorAction Stop
  $identity=$ownedChild.StartTime.ToUniversalTime().Ticks
  $job.Dispose()
  if(!$process.WaitForExit(5000)){throw 'Job root survived handle close'}
  Wait-Process -Id $childPid -Timeout 5 -ErrorAction SilentlyContinue
  $remaining=Get-Process -Id $childPid -ErrorAction SilentlyContinue
  if($remaining -and $remaining.StartTime.ToUniversalTime().Ticks -eq $identity){throw 'Owned descendant survived Job close'}
  [pscustomobject]@{passed=$true; rootExited=$true; descendantExited=$true; gpuLoaded=$false} | ConvertTo-Json -Compress
} finally {
  $job.Dispose()
  if($process){$process.Dispose()}
}
