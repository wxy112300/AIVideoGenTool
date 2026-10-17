$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'StrataAgentJob.cs')
$job=New-Object StrataAgentJob
$child=$null
$gateWriter=$null
try {
  $psi=New-Object Diagnostics.ProcessStartInfo
  $psi.FileName=$env:STRATA_NODE
  $loader=Join-Path $PSScriptRoot 'cloudcli-loader.mjs'
  $loaderUri=([Uri]$loader).AbsoluteUri
  $entry=Join-Path $env:STRATA_CLOUD_PACKAGE 'dist-server\server\index.js'
  $psi.Arguments='--import "'+$loaderUri+'" "'+$entry+'"'
  $psi.WorkingDirectory=$env:STRATA_CLOUD_PACKAGE
  $child=[StrataAgentJob]::StartSilent($psi)
  $job.Add($child)
  # Loader cannot import upstream/start descendants before the nested Job owns it.
  $gateWriter=New-Object IO.StreamWriter($child.StandardInput.BaseStream,(New-Object Text.UTF8Encoding($false)))
  $gateWriter.NewLine="`n"
  $gateWriter.WriteLine('strata-job-ready'); $gateWriter.Flush()
  [Console]::WriteLine(('{"pid":'+$child.Id+'}'))
  $stop=[Console]::In.ReadLineAsync()
  while(!$child.HasExited -and !$stop.IsCompleted){[Threading.Thread]::Sleep(100)}
} finally {
  $job.Dispose()
  if($gateWriter){try{$gateWriter.Dispose()}catch{}}
  if($child){[void]$child.WaitForExit(10000); $child.Dispose()}
}
