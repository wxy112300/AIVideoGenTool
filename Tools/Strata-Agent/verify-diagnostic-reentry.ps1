# Exercise the production completion function with a real nested WinForms modal message loop.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
$tokens=$null; $errors=$null
$source=[Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'strata-agent.ps1'),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Launcher syntax errors'}
$function=$source.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Receive-DiagnosticExport'},$true)
Invoke-Expression $function.Extent.Text
$script:shown=0; $script:disposed=0; $script:ticks=0
$script:status=[pscustomobject]@{Text=''}; $script:exportDiagnostics=[pscustomobject]@{Enabled=$false}
$script:diagnosticProcess=[pscustomobject]@{HasExited=$true}
$script:diagnosticProcess | Add-Member -MemberType ScriptMethod -Name Dispose -Value {$script:disposed++}
$script:diagnosticOutput=[pscustomobject]@{IsCompleted=$true; Result='{"ok":true,"file":"fixture-report.json","directory":"fixture","issues":[]}'}
function Add-Log($message) {}
function Show-DiagnosticResult($result) {
  $script:shown++
  if($script:shown -gt 1){throw 'Completion reentered while modal dialog was open'}
  $modal=New-Object Windows.Forms.Form; $modal.Text='Diagnostic reentry test'; $modal.ShowInTaskbar=$false
  $close=New-Object Windows.Forms.Timer; $close.Interval=250; $close.Add_Tick({$modal.Close()})
  $poll=New-Object Windows.Forms.Timer; $poll.Interval=10; $poll.Add_Tick({$script:ticks++; Receive-DiagnosticExport})
  try {$close.Start(); $poll.Start(); [void]$modal.ShowDialog()}finally{$close.Stop(); $poll.Stop(); $close.Dispose(); $poll.Dispose(); $modal.Dispose()}
}
Receive-DiagnosticExport
Receive-DiagnosticExport
if($script:shown -ne 1 -or $script:disposed -ne 1 -or $script:diagnosticProcess -or $script:ticks -lt 2 -or !$exportDiagnostics.Enabled){throw 'Completion was not consumed exactly once'}
[pscustomobject]@{passed=$true; dialogs=$script:shown; nestedTimerTicks=$script:ticks; processDisposed=$script:disposed; gpuLoaded=$false} | ConvertTo-Json -Compress
