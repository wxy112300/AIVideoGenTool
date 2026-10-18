# Actual Windows file/ACL/export test; temporary fixture, no GPU/model/controller.
$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('strata-diagnostics-test-'+[guid]::NewGuid().ToString('N'))
try {
  foreach($directory in @('logs','runs\test-run','routes','cloudcli-data')){[void][IO.Directory]::CreateDirectory((Join-Path $root $directory))}
  $key='a'*64
  [IO.File]::WriteAllText((Join-Path $root 'logs\2026-10-18.jsonl'),"resource-protection RAM=123 commit=456`nBearer $key`n")
  [IO.File]::WriteAllText((Join-Path $root 'runs\test-run\engine.log'),"CUDA out of memory`nopaque $key`n")
  [IO.File]::WriteAllText((Join-Path $root 'runs\test-run\runtime.json'),'MUST_NOT_EXPORT_RUNTIME')
  [IO.File]::WriteAllText((Join-Path $root 'token.dpapi'),'MUST_NOT_EXPORT_TOKEN')
  $tokenBefore=(Get-FileHash -LiteralPath (Join-Path $root 'token.dpapi')).Hash
  [IO.File]::WriteAllText((Join-Path $root 'routes\route.json'),'MUST_NOT_EXPORT_ROUTE')
  [IO.File]::WriteAllText((Join-Path $root 'cloudcli-data\auth.db'),'MUST_NOT_EXPORT_AUTH')
  [IO.File]::WriteAllText((Join-Path $root 'preferences.json'),'{"contextTokens":262144,"strataPort":43127,"guiPort":43128,"uncensored":true,"cloudDirectory":"MUST_NOT_EXPORT_PATH"}')
  $exporter=Join-Path $PSScriptRoot 'Export-Diagnostics.ps1'
  $raw=& powershell.exe -NoProfile -NonInteractive -File $exporter -DataDirectory $root
  if($LASTEXITCODE -ne 0){throw 'Exporter failed on old-version fixture'}
  $result=$raw | ConvertFrom-Json
  if(!$result.ok){throw $result.message}
  $text=[IO.File]::ReadAllText($result.file); $report=$text | ConvertFrom-Json
  if($text.Contains('MUST_NOT_EXPORT') -or $text.Contains($key)){throw 'Private files/token leaked into export'}
  if($text -notmatch 'CUDA out of memory' -or $text -notmatch 'resource-protection'){throw 'Useful failure evidence missing'}
  if($report.logs.Count -ne 2 -or !($report.issues -match 'server.log')){throw 'Old-version missing-output gap not reported'}
  if($report.preferences.contextTokens -ne 262144 -or !$report.memory.totalRamBytes){throw 'Runtime choices or actual machine RAM missing'}
  $acl=Get-Acl -LiteralPath $result.directory
  if(!$acl.AreAccessRulesProtected){throw 'Export directory did not receive a private ACL'}
  if((Get-FileHash -LiteralPath (Join-Path $root 'token.dpapi')).Hash -ne $tokenBefore){throw 'Unexpected fixture mutation'}
  [IO.File]::WriteAllText((Join-Path $root 'preferences.json'),'{"contextTokens":{"credential":"MUST_NOT_EXPORT_OBJECT"},"strataPort":"MUST_NOT_EXPORT_PORT"}')
  $secondRaw=& powershell.exe -NoProfile -NonInteractive -File $exporter -DataDirectory $root
  if($LASTEXITCODE -ne 0){throw 'Exporter failed on malformed preferences'}
  $second=$secondRaw | ConvertFrom-Json
  if([IO.File]::ReadAllText($second.file).Contains('MUST_NOT_EXPORT')){throw 'Unvalidated preferences leaked'}
  [pscustomobject]@{passed=$true; layer='actual local diagnostic export'; oldLogsFound=$true; missingServerLogExplained=$true; credentialsExcluded=$true; privateAcl=$true; gpuLoaded=$false} | ConvertTo-Json -Compress
} finally {
  $absolute=[IO.Path]::GetFullPath($root); $temporary=[IO.Path]::GetFullPath([IO.Path]::GetTempPath())
  if($absolute.StartsWith($temporary,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($absolute).StartsWith('strata-diagnostics-test-')){Remove-Item -LiteralPath $absolute -Recurse -Force -ErrorAction SilentlyContinue}
}
