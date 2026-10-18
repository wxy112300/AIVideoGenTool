param([string]$DataDirectory=(Join-Path $env:LOCALAPPDATA 'Local Video Studio\strata-agent'), [switch]$ShowResult)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
# This exporter has no controller, Node, network, model, or token decryption dependency.
function Read-DiagnosticTail([string]$filename) {
  if(!(Test-Path -LiteralPath $filename -PathType Leaf)){return $null}
  if((Get-Item -LiteralPath $filename).Attributes -band [IO.FileAttributes]::ReparsePoint){return $null}
  $stream=New-Object IO.FileStream($filename,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  try {
    $length=[int][Math]::Min($stream.Length,262144)
    [void]$stream.Seek(-$length,[IO.SeekOrigin]::End)
    $bytes=New-Object byte[] $length; $offset=0
    while($offset -lt $length){$count=$stream.Read($bytes,$offset,$length-$offset); if(!$count){break}; $offset+=$count}
    $text=[Text.Encoding]::UTF8.GetString($bytes,0,$offset)
    # Stable local tokens are 64 hex characters. Don't read/decrypt the token file.
    $text=[regex]::Replace($text,'(?i)[a-f0-9]{64}','[redacted-hex]')
    $text=[regex]::Replace($text,'(?im)^.*(?:authorization|bearer\s|api[_-]?key|auth[_-]?token|access[_-]?token|password|cookie|secret).*$','[credential line omitted]')
    $text=[regex]::Replace($text,'(?i)\bsk-[a-z0-9_-]{12,}','[redacted-key]')
    $text=[regex]::Replace($text,'\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+','[redacted-jwt]')
    if($env:USERPROFILE){$text=$text.Replace($env:USERPROFILE,'%USERPROFILE%')}
    return $text
  } finally {$stream.Dispose()}
}
function Is-DiagnosticDirectory([string]$directory) {
  return (Test-Path -LiteralPath $directory -PathType Container) -and !((Get-Item -LiteralPath $directory).Attributes -band [IO.FileAttributes]::ReparsePoint)
}
try {
  $root=[IO.Path]::GetFullPath($DataDirectory)
  if(!(Is-DiagnosticDirectory $root)){throw '未找到普通数据目录；请核对当前Windows用户和数据位置。'}
  $logs=New-Object Collections.Generic.List[object]; $issues=New-Object Collections.Generic.List[string]
  function Add-DiagnosticLog([string]$file,[string]$relative) {
    try {$text=Read-DiagnosticTail $file; if($null -ne $text){$logs.Add([pscustomobject]@{file=$relative; tailLimitBytes=262144; text=$text})}}
    catch {$issues.Add('无法读取日志：'+$relative)}
  }
  $journal=Join-Path $root 'logs'
  if(Is-DiagnosticDirectory $journal){
    foreach($entry in @(Get-ChildItem -LiteralPath $journal -File -Filter '*.jsonl' | Sort-Object LastWriteTime -Descending | Select-Object -First 2)){
      Add-DiagnosticLog $entry.FullName ('logs/'+$entry.Name)
    }
  }
  $runs=Join-Path $root 'runs'
  if(Is-DiagnosticDirectory $runs){
    foreach($run in @(Get-ChildItem -LiteralPath $runs -Directory | Where-Object {!($_.Attributes -band [IO.FileAttributes]::ReparsePoint)} | Sort-Object LastWriteTime -Descending | Select-Object -First 3)){
      foreach($name in @('engine.log','server.log')){Add-DiagnosticLog (Join-Path $run.FullName $name) ('runs/'+$run.Name+'/'+$name)}
    }
  }
  if(!$logs.Count){$issues.Add('没有找到操作或引擎日志；请确认是否使用当前Windows用户运行过启动器。')}
  if(!@($logs | Where-Object {$_.file.EndsWith('/server.log')}).Count){$issues.Add('未找到server.log。旧版没有持久保存Python输出，不能从本报告恢复已经丢失的崩溃现场。')}
  $preferences=$null
  try {
    $source=Join-Path $root 'preferences.json'
    if((Test-Path -LiteralPath $source) -and !((Get-Item -LiteralPath $source).Attributes -band [IO.FileAttributes]::ReparsePoint)){
      $prefs=Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
      # Only scalar operating choices, never raw preferences, paths, env or credentials.
      $mode=if($prefs.uncensoredMode -in @('off','builtin','community')){[string]$prefs.uncensoredMode}elseif($prefs.uncensored -eq $true){'builtin'}else{'off'}
      $preferences=@{contextTokens=$null; uncensored=($mode -ne 'off'); uncensoredMode=$mode; strataPort=$null; guiPort=$null}
      if($prefs.contextTokens -is [int] -and $prefs.contextTokens -in @(32768,65536,131072,262144)){$preferences.contextTokens=$prefs.contextTokens}
      foreach($port in @('strataPort','guiPort')){if($prefs.$port -is [int] -and $prefs.$port -ge 1024 -and $prefs.$port -le 65535 -and $prefs.$port -ne 8080){$preferences[$port]=$prefs.$port}}
    }
  } catch {$issues.Add('偏好摘要不可读；未复制原配置。')}
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StrataDiagnosticMemory {
 [StructLayout(LayoutKind.Sequential)] public struct Status {
  public uint Length, Load;
  public ulong TotalPhysical, AvailablePhysical, TotalPageFile, AvailablePageFile, TotalVirtual, AvailableVirtual, Extended;
 }
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GlobalMemoryStatusEx(ref Status status);
 public static Status Read() { var s=new Status(); s.Length=(uint)Marshal.SizeOf(s); if(!GlobalMemoryStatusEx(ref s)) throw new Exception("Memory telemetry unavailable"); return s; }
}
'@
  $memory=$null
  try {$m=[StrataDiagnosticMemory]::Read(); $memory=@{totalRamBytes=$m.TotalPhysical; availableRamBytes=$m.AvailablePhysical; commitLimitBytes=$m.TotalPageFile; availableCommitBytes=$m.AvailablePageFile; sampledAt=[DateTime]::UtcNow.ToString('o')}}catch{$issues.Add('当前Windows RAM/提交余量不可读。')}
  $gpu=$null; $gpuProcess=$null
  try {
    $gpuCommand=Get-Command nvidia-smi.exe -ErrorAction Stop
    $psi=New-Object Diagnostics.ProcessStartInfo; $psi.FileName=$gpuCommand.Source
    $psi.Arguments='--query-gpu=name,driver_version,memory.total,memory.free --format=csv,noheader,nounits'
    $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
    $gpuProcess=[Diagnostics.Process]::Start($psi)
    $out=$gpuProcess.StandardOutput.ReadToEndAsync(); $err=$gpuProcess.StandardError.ReadToEndAsync()
    if(!$gpuProcess.WaitForExit(3000)){$gpuProcess.Kill(); [void]$gpuProcess.WaitForExit(3000); throw 'GPU probe timed out'}
    if($gpuProcess.ExitCode -ne 0){throw 'GPU probe failed'}
    $gpu=$out.Result.Trim()
  } catch {$issues.Add('当前NVIDIA显存探针不可用；不把未知值当成空闲。')}finally{if($gpuProcess){$gpuProcess.Dispose()}}
  $outputRoot=Join-Path $root 'diagnostics'
  if(Test-Path -LiteralPath $outputRoot){if(!(Is-DiagnosticDirectory $outputRoot)){throw '诊断目录不是普通目录。'}}else{[void][IO.Directory]::CreateDirectory($outputRoot)}
  $target=Join-Path $outputRoot ((Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N'))
  [void][IO.Directory]::CreateDirectory($target)
  $acl=New-Object Security.AccessControl.DirectorySecurity
  $acl.SetAccessRuleProtection($true,$false)
  foreach($sid in @([Security.Principal.WindowsIdentity]::GetCurrent().User,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))){
    $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'); $acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $target -AclObject $acl
  $report=[ordered]@{format='strata-agent-diagnostics-v1'; createdAt=[DateTime]::UtcNow.ToString('o');
    note='只写入本机，不自动上传。日志可能含对话信息，分享前请检查。当前资源读数不是崩溃瞬间读数。';
    excluded=@('token.dpapi','routes','exports','runtime.json','Claude sessions','CloudCLI auth database','credentials','weights');
    os=[Environment]::OSVersion.VersionString; memory=$memory; gpu=$gpu; preferences=$preferences; issues=@($issues.ToArray()); logs=@($logs.ToArray())}
  $filename=Join-Path $target 'diagnostics.json'
  [IO.File]::WriteAllText($filename,($report | ConvertTo-Json -Depth 8),(New-Object Text.UTF8Encoding($false)))
  if($ShowResult){
    Add-Type -AssemblyName System.Windows.Forms
    [void][Windows.Forms.MessageBox]::Show("诊断已保存：`r`n$filename`r`n`r`n日志可能含对话信息，分享前请检查；没有自动上传。`r`n$($issues -join "`r`n")",'Strata Agent 诊断')
    Start-Process explorer.exe -ArgumentList @($target)
  }
  [Console]::WriteLine((@{ok=$true; file=$filename; directory=$target; issues=@($issues.ToArray())} | ConvertTo-Json -Depth 4 -Compress))
} catch {
  if($ShowResult){Add-Type -AssemblyName System.Windows.Forms; [void][Windows.Forms.MessageBox]::Show($_.Exception.Message,'诊断导出失败')}
  [Console]::WriteLine((@{ok=$false; message=$_.Exception.Message} | ConvertTo-Json -Compress)); exit 1
}
