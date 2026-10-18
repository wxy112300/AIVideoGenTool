param([switch]$Smoke)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
if ((New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  [void][Windows.Forms.MessageBox]::Show('请以普通用户启动。Claude 的文件和 shell 工具不能继承管理员权限。','Strata Agent')
  exit 1
}
[Windows.Forms.Application]::EnableVisualStyles()
Add-Type -Path (Join-Path $PSScriptRoot 'StrataAgentJob.cs')
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$created = $false
$mutex = New-Object Threading.Mutex($true, ('Local\StrataAgentLauncher-' + $sid), [ref]$created)
if (!$created) {
  $existing = [StrataAgentJob]::FindWindow($null, 'Strata Agent')
  if ($existing -ne [IntPtr]::Zero) { [void][StrataAgentJob]::ShowWindow($existing, 9); [void][StrataAgentJob]::SetForegroundWindow($existing) }
  $mutex.Dispose(); exit
}
$script:job = New-Object StrataAgentJob
$script:child = $null; $script:preparing = $false; $script:read = $null; $script:errors = $null; $script:writer = $null
$script:nextId = 0; $script:pending = @{}; $script:preferences = $null; $script:closing = $false; $script:allowClose = $false
$script:operation = ''; $script:node = ''
$script:running=$false; $script:restart=$false; $script:lastPoll=[DateTime]::MinValue; $script:lastReply=[DateTime]::MinValue
$script:lastLogs=$null; $script:lastFault=''
$script:activeStrataPort=43127; $script:activeGuiPort=43128
$script:diagnosticProcess=$null; $script:diagnosticOutput=$null; $script:diagnosticErrors=$null
$script:detectedCc=''; $script:clipboardText=$null; $script:clipboardUntil=[DateTime]::MinValue
$form = New-Object Windows.Forms.Form
$form.Text = 'Strata Agent'; $form.StartPosition = 'CenterScreen'; $form.Size = New-Object Drawing.Size(820,620)
$form.MinimumSize = New-Object Drawing.Size(720,540); $form.AutoScaleMode = 'Dpi'
$form.Font = New-Object Drawing.Font('Segoe UI',10)
$shell=New-Object Windows.Forms.TableLayoutPanel; $shell.Dock='Fill'; $shell.ColumnCount=1; $shell.RowCount=2
[void]$shell.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
[void]$shell.RowStyles.Add((New-Object Windows.Forms.RowStyle('AutoSize')))
[void]$shell.RowStyles.Add((New-Object Windows.Forms.RowStyle('Percent',100)))
$form.Controls.Add($shell)
$flow = New-Object Windows.Forms.FlowLayoutPanel
$flow.Dock = 'Fill'; $flow.FlowDirection = 'TopDown'; $flow.WrapContents = $false; $flow.AutoSize=$true; $flow.Padding = New-Object Windows.Forms.Padding(16,12,16,4)
$shell.Controls.Add($flow,0,0)
$details=New-Object Windows.Forms.FlowLayoutPanel; $details.Dock='Fill'; $details.FlowDirection='TopDown'; $details.WrapContents=$false; $details.AutoScroll=$true; $details.Padding=New-Object Windows.Forms.Padding(16,0,16,8)
$shell.Controls.Add($details,0,1)
function Label($text) { $c=New-Object Windows.Forms.Label; $c.Text=$text; $c.AutoSize=$true; $c.Margin=New-Object Windows.Forms.Padding(0,5,0,8); return $c }
function Button($text) { $c=New-Object Windows.Forms.Button; $c.Text=$text; $c.AutoSize=$true; $c.MinimumSize=New-Object Drawing.Size(100,34); return $c }
$title=Label 'Strata Agent  ·  本地 Claude 工具环境'; $title.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold); $flow.Controls.Add($title)
$intro=Label '选择模型和模式 → 启动 → 在 CloudCLI 聊天。更改运行选项后需停止并重新启动。'; $flow.Controls.Add($intro)
$model=New-Object Windows.Forms.ComboBox; $model.DropDownStyle='DropDownList'; $model.Width=690; $model.DisplayMember='name'; $model.ValueMember='id'; $model.AccessibleName='模型'; $flow.Controls.Add($model)
$options=New-Object Windows.Forms.FlowLayoutPanel; $options.AutoSize=$true; $options.Width=690
$uncensoredLabel=Label 'uncensored 模式'
$uncensored=New-Object Windows.Forms.ComboBox; $uncensored.DropDownStyle='DropDownList'; $uncensored.Width=180; $uncensored.AccessibleName='uncensored 模式'
[void]$uncensored.Items.AddRange(@('关闭','自带 · ESP','社区 · sergqwer')); $uncensored.SelectedIndex=0
$lan=New-Object Windows.Forms.CheckBox; $lan.Text='家庭局域网（本机验收后开放）'; $lan.AutoSize=$true; $lan.Enabled=$false
$options.Controls.AddRange(@($uncensoredLabel,$uncensored,$lan)); $flow.Controls.Add($options)
$tips=New-Object Windows.Forms.ToolTip; $tips.SetToolTip($uncensored,'关闭 / 自带 ESP / 社区 sergqwer；更换向量需停止并重启。不放宽文件或 shell 权限，也不保证不会拒答。')
$actions=New-Object Windows.Forms.FlowLayoutPanel; $actions.AutoSize=$true
$start=Button '启动'; $stop=Button '停止全部'; $cancel=Button '取消当前操作'; $cancel.Enabled=$false
$chat=Button '打开聊天'; $chat.Enabled=$false
$actions.Controls.AddRange(@($start,$stop,$cancel,$chat)); $flow.Controls.Add($actions)
$runtimeState=Label 'Strata：未启动 · 模型：未知 · GUI：未启动 · Claude：按需调用'; $flow.Controls.Add($runtimeState)
$status=Label '正在准备工具…'; $status.AutoSize=$false; $status.Height=54; $status.AutoEllipsis=$true; $flow.Controls.Add($status)
$resources=Label '资源：等待实时检测（RAM / Windows 提交余量 / 显存）'; $flow.Controls.Add($resources)
$connectionHelp=Label 'CloudCLI 首次创建的是本机账号；无需登录 Anthropic。Strata 原生页要求 API key 时，用“连接与帮助”复制密钥。'; $flow.Controls.Add($connectionHelp)
$progressBar=New-Object Windows.Forms.ProgressBar; $progressBar.Width=690; $progressBar.Height=6; $progressBar.Style='Marquee'; $progressBar.Visible=$false; $flow.Controls.Add($progressBar)
$toggles=New-Object Windows.Forms.FlowLayoutPanel; $toggles.AutoSize=$true
$settingsToggle=Button '设置与依赖 ▸'; $toggles.Controls.Add($settingsToggle); $flow.Controls.Add($toggles)
$settings=New-Object Windows.Forms.FlowLayoutPanel; $settings.FlowDirection='TopDown'; $settings.WrapContents=$false; $settings.AutoSize=$true; $settings.Visible=$false
$details.Controls.Add($settings)
$script:paths=@{}
foreach($spec in @(@('strataDirectory','Strata 安装目录'),@('modelDirectory','共享模型目录'),@('packConfig','已准备 runtime.json'),@('claudeEntry','Claude CLI 入口'),@('cloudDirectory','npm 共享安装位置'),@('ccSwitchPath','CC Switch 程序'))) {
  $row=New-Object Windows.Forms.TableLayoutPanel; $row.AutoSize=$true; $row.ColumnCount=3; $row.RowCount=1
  [void]$row.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute',160)))
  [void]$row.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent',100)))
  [void]$row.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('AutoSize')))
  $label=Label $spec[1]; $label.Width=160; $label.AutoSize=$false
  $text=New-Object Windows.Forms.TextBox; $text.Dock='Fill'; $text.AccessibleName=$spec[1]; $script:paths[$spec[0]]=$text
  $browse=Button '选择…'; $browse.Tag=@{key=$spec[0]; textbox=$text}
  $browse.Add_Click({
    $data=$this.Tag
    if($data.key -in @('packConfig','claudeEntry','ccSwitchPath')) { $picker=New-Object Windows.Forms.OpenFileDialog; $picker.Filter=switch($data.key){'packConfig'{'运行配置|runtime.json|JSON|*.json'} 'claudeEntry'{'官方 Claude CLI|cli.js;claude.exe'} 'ccSwitchPath'{'CC Switch|*.exe'}}; if($picker.ShowDialog() -eq 'OK'){$data.textbox.Text=$picker.FileName} }
    else { $picker=New-Object Windows.Forms.FolderBrowserDialog; if($picker.ShowDialog() -eq 'OK'){$data.textbox.Text=$picker.SelectedPath} }; $picker.Dispose()
  })
  $row.Controls.Add($label,0,0); $row.Controls.Add($text,1,0); $row.Controls.Add($browse,2,0); $settings.Controls.Add($row)
}
$advanced=New-Object Windows.Forms.FlowLayoutPanel; $advanced.AutoSize=$true
$advanced.Controls.Add((Label 'Strata 端口'))
$strataPort=New-Object Windows.Forms.NumericUpDown; $strataPort.Minimum=1024; $strataPort.Maximum=65535; $strataPort.Value=43127; $strataPort.Width=90; $advanced.Controls.Add($strataPort)
$advanced.Controls.Add((Label 'GUI 端口'))
$guiPort=New-Object Windows.Forms.NumericUpDown; $guiPort.Minimum=1024; $guiPort.Maximum=65535; $guiPort.Value=43128; $guiPort.Width=90; $advanced.Controls.Add($guiPort)
$openNative=New-Object Windows.Forms.CheckBox; $openNative.Text='打开原生页'; $openNative.Checked=$true; $openNative.AutoSize=$true; $advanced.Controls.Add($openNative)
$openGui=New-Object Windows.Forms.CheckBox; $openGui.Text='打开 GUI'; $openGui.Checked=$true; $openGui.AutoSize=$true; $advanced.Controls.Add($openGui)
$settings.Controls.Add($advanced)
$contextRow=New-Object Windows.Forms.FlowLayoutPanel; $contextRow.AutoSize=$true
$contextRow.Controls.Add((Label 'Agent 上下文'))
$context=New-Object Windows.Forms.ComboBox; $context.DropDownStyle='DropDownList'; $context.Width=390; $context.AccessibleName='Agent 上下文'
[void]$context.Items.Add('32K（仅基础工具；完整GUI容易超限）'); [void]$context.Items.Add('64K（GUI已实测）'); [void]$context.Items.Add('128K（80K长输入已实测）'); [void]$context.Items.Add('262144 tokens（220K已验；Claude保守200K）'); $context.DropDownWidth=530; $context.SelectedIndex=3
$contextRow.Controls.Add($context); $settings.Controls.Add($contextRow)
$dependencyActions=New-Object Windows.Forms.FlowLayoutPanel; $dependencyActions.AutoSize=$true
$detect=Button '自动检测 / 重试'; $install=Button '安装缺失软件'; $save=Button '保存设置'
$dependencyActions.Controls.AddRange(@($detect,$install,$save)); $settings.Controls.Add($dependencyActions)
$dependencyText=New-Object Windows.Forms.TextBox; $dependencyText.Multiline=$true; $dependencyText.ReadOnly=$true; $dependencyText.ScrollBars='Vertical'; $dependencyText.Width=690; $dependencyText.Height=165; $settings.Controls.Add($dependencyText)
$menu=New-Object Windows.Forms.ContextMenuStrip
$connectionMenu=Button '连接与帮助 ▾'; $toggles.Controls.Add($connectionMenu)
$connectionMenu.Add_Click({$menu.Show($connectionMenu,0,$connectionMenu.Height)})
$nativePage=$menu.Items.Add('打开 Strata 原生管理页'); $nativePage.Add_Click({if($script:running){Start-Process -FilePath ('http://127.0.0.1:'+$script:activeStrataPort)}else{$status.Text='请先启动本机服务，再打开管理页。'}})
$openLogs=$menu.Items.Add('打开本轮服务 / 引擎日志目录'); $openLogs.Add_Click({
  $location=if($script:lastLogs -and $script:lastLogs.server){Split-Path -Parent $script:lastLogs.server}else{Join-Path $env:LOCALAPPDATA 'Local Video Studio\strata-agent\logs'}
  if(Test-Path -LiteralPath $location){Start-Process explorer.exe -ArgumentList @($location)}else{$status.Text='尚未产生服务日志。启动后会保存 server.log 和 engine.log；操作失败请展开日志。'}
})
$exportDiagnostics=$menu.Items.Add('导出诊断（本机，不自动上传）'); $exportDiagnostics.Add_Click({
  if($script:diagnosticProcess){$status.Text='正在收集最近日志与当前资源，请稍候…'; return}
  try {
    $psi=New-Object Diagnostics.ProcessStartInfo; $psi.FileName='powershell.exe'
    $psi.Arguments='-NoProfile -NonInteractive -File "'+(Join-Path $PSScriptRoot 'Export-Diagnostics.ps1')+'"'
    $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
    $psi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false)
    $script:diagnosticProcess=[Diagnostics.Process]::Start($psi); $script:job.Add($script:diagnosticProcess)
    $script:diagnosticOutput=$script:diagnosticProcess.StandardOutput.ReadToEndAsync(); $script:diagnosticErrors=$script:diagnosticProcess.StandardError.ReadToEndAsync()
    $exportDiagnostics.Enabled=$false; $status.Text='正在导出最近日志与当前资源；不会启动模型或上传文件…'
  } catch {
    if($script:diagnosticProcess){if(!$script:diagnosticProcess.HasExited){$script:diagnosticProcess.Kill()}; $script:diagnosticProcess.Dispose(); $script:diagnosticProcess=$null}
    $status.Text='无法启动诊断导出，请双击工具目录中的 Export-Diagnostics.cmd。'; Add-Log $status.Text
  }
})
$openFolder=$menu.Items.Add('打开本机数据位置'); $openFolder.Add_Click({$location=Join-Path $env:LOCALAPPDATA 'Local Video Studio\strata-agent'; if(Test-Path -LiteralPath $location){Start-Process explorer.exe -ArgumentList @($location)} })
$updateStrata=$menu.Items.Add('更新 Strata（统一推荐版本）…'); $updateStrata.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences); mode='update'}}catch{$status.Text=$_.Exception.Message}})
$repairStrata=$menu.Items.Add('修复 Strata（先备份旧安装）…'); $repairStrata.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences); mode='repair'}}catch{$status.Text=$_.Exception.Message}})
$privateCli=$menu.Items.Add('安装或更新共享 Claude / CloudCLI…'); $privateCli.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences); mode='agentSoftware'}}catch{$status.Text=$_.Exception.Message}})
$repairPrivate=$menu.Items.Add('修复共享 Claude / CloudCLI（先备份）…'); $repairPrivate.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences); mode='repairAgentSoftware'}}catch{$status.Text=$_.Exception.Message}})
$openCc=$menu.Items.Add('打开 CC Switch（保持当前 provider）'); $openCc.Add_Click({if($script:detectedCc -and (Test-Path -LiteralPath $script:detectedCc)){Start-Process -FilePath $script:detectedCc}})
$ccExport=$menu.Items.Add('备份并复制 CC Switch 备用配置…'); $ccExport.Add_Click({
  if([Windows.Forms.MessageBox]::Show('日常启动无需切换CC Switch。此操作先备份，再复制含本机token的备用Claude配置（只支持已核对3.20.0的GUI JSON编辑器）。手动添加后请保留原provider为当前；若手动切到本地provider，服务停止后该provider会不可用。不会自动导入或改数据库。继续？','可选备用配置','YesNo','Warning') -eq 'Yes'){
    try{Send-Command 'ccSwitchBackup' @{preferences=(Get-Preferences); confirmed=$true}}catch{$status.Text=$_.Exception.Message}
  }
})
$copyToken=$menu.Items.Add('复制本机原生管理页密钥…'); $copyToken.Add_Click({
  if([Windows.Forms.MessageBox]::Show('将密钥复制到系统剪贴板60秒；仅粘贴到本机Strata原生页的认证框。密钥不会进入URL或日志。继续？','复制密钥','YesNo','Question') -eq 'Yes'){Send-Command 'copyToken' @{confirmed=$true}}
})
$dependencyText.ContextMenuStrip=$menu
$logToggle=Button '日志 ▸'; $toggles.Controls.Add($logToggle)
$log=New-Object Windows.Forms.TextBox; $log.Multiline=$true; $log.ReadOnly=$true; $log.ScrollBars='Vertical'; $log.Width=690; $log.Height=180; $log.Visible=$false; $details.Controls.Add($log)
function Resize-Content {
  $width=[Math]::Max(200,$flow.ClientSize.Width-$flow.Padding.Horizontal-8)
  foreach($control in @($model,$options,$actions,$toggles,$progressBar,$status)){$control.Width=$width}
  foreach($control in @($title,$intro,$runtimeState,$resources,$connectionHelp)){$control.MaximumSize=New-Object Drawing.Size($width,0)}
  $tips.SetToolTip($status,$status.Text)
  $detailWidth=[Math]::Max(200,$details.ClientSize.Width-$details.Padding.Horizontal-26)
  $settings.Width=$detailWidth; $settings.MaximumSize=New-Object Drawing.Size($detailWidth,0)
  foreach($control in $settings.Controls){$control.Width=$detailWidth-$control.Margin.Horizontal; $control.MaximumSize=New-Object Drawing.Size(($detailWidth-$control.Margin.Horizontal),0)}
  $log.Width=$detailWidth
}
$form.Add_ClientSizeChanged({Resize-Content})
function Add-Log([string]$message) { if($log.TextLength -gt 24000){$log.Text=$log.Text.Substring($log.TextLength-16000)}; $log.AppendText((Get-Date -Format 'HH:mm:ss')+' '+$message+[Environment]::NewLine); [Console]::WriteLine($message) }
function Get-Preferences {
  if(!$script:preferences){throw '请等待自动检测完成。'}
  $p=$script:preferences.PSObject.Copy(); if($model.SelectedItem){$p.modelId=$model.SelectedItem.id}; $p.uncensoredMode=@('off','builtin','community')[$uncensored.SelectedIndex]; $p.uncensored=$p.uncensoredMode -ne 'off'; $p.lan=$false
  $p.strataPort=[int]$strataPort.Value; $p.guiPort=[int]$guiPort.Value; $p.openNative=$openNative.Checked; $p.openGui=$openGui.Checked
  $p.contextTokens=@(32768,65536,131072,262144)[$context.SelectedIndex]
  foreach($key in $script:paths.Keys){$p.$key=$script:paths[$key].Text.Trim()}
  if($p.modelDirectory){$p.modelRoot=''}
  return $p
}
function Send-Command($action,$extra=@{}) {
  if(!$script:child -or $script:preparing -or $script:child.HasExited){$status.Text='Controller 未就绪，请自动检测 / 重试。'; return}
  $script:nextId++; $command=@{id=$script:nextId; action=$action}; foreach($key in $extra.Keys){$command[$key]=$extra[$key]}
  $snapshot=if($script:preferences -and $action -ne 'status'){Get-Preferences}else{$null}
  $script:pending[$script:nextId.ToString()]=@{action=$action; preferences=$snapshot}
  if($action -eq 'start'){$script:lastFault=''; $status.ForeColor=[Drawing.SystemColors]::ControlText; $status.Text='正在检查并启动所选组件…'}
  Update-Busy
  $script:writer.WriteLine(($command | ConvertTo-Json -Depth 10 -Compress)); $script:writer.Flush()
}
function Update-Busy {
  $work=@($script:pending.Values | Where-Object {$_.action -ne 'status'})
  $busy=$work.Count -gt 0
  $cancel.Enabled=$busy -and @($work | Where-Object {$_.action -notin @('stop','cancel')}).Count -gt 0
  $progressBar.Visible=$busy
  foreach($button in @($start,$detect,$install,$save)){$button.Enabled=!$busy}
}
function Start-Controller {
  $script:preparing=$false
  $entry=Join-Path $PSScriptRoot '.runtime\electron\services\strata-agent-controller.js'
  $psi=New-Object Diagnostics.ProcessStartInfo; $psi.FileName=$script:node
  $psi.Arguments='"'+$entry+'" --stdio --tool-directory "'+$PSScriptRoot+'"'
  $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardInput=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
  $psi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false); $psi.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
  $script:child=[Diagnostics.Process]::Start($psi)
  try{$script:job.Add($script:child)}catch{$script:child.Kill(); throw}
  $script:writer=New-Object IO.StreamWriter($script:child.StandardInput.BaseStream, (New-Object Text.UTF8Encoding($false)))
  $script:read=$script:child.StandardOutput.ReadLineAsync(); $script:errors=$script:child.StandardError.ReadToEndAsync()
  Send-Command 'doctor'
}
function Receive-DiagnosticExport {
    if($script:diagnosticProcess -and $script:diagnosticProcess.HasExited -and $script:diagnosticOutput.IsCompleted){
      try {
        $result=$script:diagnosticOutput.Result | ConvertFrom-Json
        if(!$result.ok){throw $result.message}
        $status.Text='诊断已保存：'+$result.file; Add-Log $status.Text
        [void][Windows.Forms.MessageBox]::Show(($status.Text+"`r`n日志可能含对话信息，分享前请检查；没有自动上传。`r`n"+($result.issues -join "`r`n")),'Strata Agent 诊断')
        Start-Process explorer.exe -ArgumentList @($result.directory)
      } catch {$status.Text='诊断导出失败；请核对数据目录权限，或运行 Export-Diagnostics.cmd 查看提示。'; Add-Log $status.Text}
      finally {$script:diagnosticProcess.Dispose(); $script:diagnosticProcess=$null; $exportDiagnostics.Enabled=$true}
    }
}
function Prepare-Controller {
  try {
    if($script:child -and !$script:child.HasExited){Send-Command 'doctor' @{preferences=(Get-Preferences)}; return}
    $candidate=Get-Command node.exe -ErrorAction SilentlyContinue
    if(!$candidate){$status.Text='缺少 Node 22.15+。请通过常规共享安装或官方安装包安装，再点击自动检测；不会创建专属运行时。'; return}
    $script:node=$candidate.Source; $status.Text='准备独立 controller（首次或源码更新后编译）…'
    $psi=New-Object Diagnostics.ProcessStartInfo; $psi.FileName=$script:node; $psi.Arguments='"'+(Join-Path $PSScriptRoot 'prepare.mjs')+'"'
    $psi.UseShellExecute=$false; $psi.CreateNoWindow=$true; $psi.RedirectStandardOutput=$true; $psi.RedirectStandardError=$true
    $psi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false); $psi.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
    $script:child=[Diagnostics.Process]::Start($psi); $script:job.Add($script:child); $script:preparing=$true
    $script:read=$script:child.StandardOutput.ReadLineAsync(); $script:errors=$script:child.StandardError.ReadToEndAsync()
  }catch{$status.Text=$_.Exception.Message; Add-Log $status.Text}
}
$settingsToggle.Add_Click({$settings.Visible=!$settings.Visible; $settingsToggle.Text=if($settings.Visible){'设置与依赖 ▾'}else{'设置与依赖 ▸'}; Resize-Content})
$logToggle.Add_Click({$log.Visible=!$log.Visible; $logToggle.Text=if($log.Visible){'日志 ▾'}else{'日志 ▸'}; Resize-Content})
$chat.Add_Click({if($script:running){Start-Process -FilePath ('http://127.0.0.1:'+$script:activeGuiPort)}})
$detect.Add_Click({Prepare-Controller})
$save.Add_Click({try{Send-Command 'save' @{preferences=(Get-Preferences)}}catch{$status.Text=$_.Exception.Message}})
$install.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences)}}catch{$status.Text=$_.Exception.Message}})
$start.Add_Click({try{if($script:running){$script:restart=$true; Send-Command 'stop'}else{Send-Command 'start' @{preferences=(Get-Preferences)}}}catch{$status.Text=$_.Exception.Message; $script:restart=$false}})
$stop.Add_Click({Send-Command 'stop'})
$cancel.Add_Click({$status.Text='正在取消并等待自有资源收尾…'; Send-Command 'cancel'})
$timer=New-Object Windows.Forms.Timer; $timer.Interval=100
$timer.Add_Tick({
  try {
    Receive-DiagnosticExport
    if($script:clipboardText -and [DateTime]::Now -ge $script:clipboardUntil){if([Windows.Forms.Clipboard]::ContainsText() -and [Windows.Forms.Clipboard]::GetText() -ceq $script:clipboardText){[Windows.Forms.Clipboard]::Clear()}; $script:clipboardText=$null}
    if(!$script:child){return}
    while($script:read -and $script:read.IsCompleted){
      $line=$script:read.Result
      if($null -eq $line){$script:read=$null; break}
      $script:read=$script:child.StandardOutput.ReadLineAsync()
      if($script:preparing){Add-Log $line; continue}
      $message=$line | ConvertFrom-Json
      if($message.event){
        if($message.message){if(!$script:lastFault){$status.Text=$message.message}; Add-Log $message.message}
        if($message.event -eq 'fault'){$script:lastFault=$message.message; $status.Text='故障：'+$message.message; $status.ForeColor=[Drawing.Color]::Firebrick; $log.Visible=$true}
        if($message.event -eq 'resources'){$r=$message.resources; $resources.Text=('可用 RAM {0:N1} GiB · 提交余量 {1:N1} GiB · 空闲显存 {2:N1} GiB' -f ($r.memoryAvailableBytes/1GB),($r.commitAvailableBytes/1GB),($r.vramAvailableBytes/1GB)); $resources.Tag=@{at=[DateTime]::Now; text=$resources.Text}}
        continue
      }
      $request=$script:pending[$message.id.ToString()]; $action=$request.action; $script:pending.Remove($message.id.ToString())
      if($action -eq 'status'){
        $script:lastReply=[DateTime]::Now
        if(!$message.ok){$runtimeState.Text='状态检测失败；请展开日志或重新检测。'; continue}
        $s=$message.result; $script:lastLogs=$s.logs; $r=$s.runtime
        $modelState=if($s.live -and $s.live.connection -eq 'online'){if($s.live.loaded){'已加载'}else{'已卸载 / 引擎退出'}}elseif($r.modelLoaded -eq $true){'已加载（等待探测）'}else{'未确认'}
        $connection=if($s.live){$s.live.connection}elseif($s.busy){'正在准备 / 加载（可取消）'}else{$r.phase}
        $guiState=if($s.gui.alive){'在线'}elseif($s.gui.owned){'已退出（待清理）'}else{'未运行'}
        $runtimeState.Text="Strata：$connection · 模型：$modelState · GUI：$guiState · Claude：按需调用"
        if($r.hostMemoryMode){$runtimeState.Text+=' · '+$r.hostMemoryMode}
        if($s.live.busy){$runtimeState.Text+="`r`n正在处理：$($s.live.elapsedSeconds) 秒 · 已生成 $($s.live.generatedTokens) tokens"}
        if($r.uncensored.requested){$vectorState=if($s.live.connection -eq 'online' -and $s.live.loaded -and $r.uncensored.vectorLoaded){'本轮启动载入校验通过'}else{'未加载 / 待确认'}; $runtimeState.Text+="`r`nuncensored：$($r.uncensored.mode) · $($r.uncensored.vectorId) · $vectorState"}
        $script:running=($null -ne $r.pid -or $s.gui.owned)
        $start.Text=if($script:running){'应用并重启'}else{'启动'}; $chat.Enabled=[bool]$s.gui.alive
        if($s.fault -and !$s.busy){$script:lastFault=$s.fault.message; $status.Text='上次异常：'+$s.fault.message; $status.ForeColor=[Drawing.Color]::Firebrick}
        continue
      }
      Update-Busy
      if(!$message.ok){$status.Text=$message.message; $status.ForeColor=[Drawing.Color]::Firebrick; Add-Log $message.message; $script:closing=$false; $script:restart=$false; continue}
      $result=$message.result
      if($action -eq 'start'){$script:running=$true; $script:lastFault=''; $status.ForeColor=[Drawing.SystemColors]::ControlText; $start.Text='应用并重启'; $script:activeStrataPort=[int]$request.preferences.strataPort; $script:activeGuiPort=[int]$request.preferences.guiPort}
      if($result.clipboardFile){
        $exportRoot=[IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Local Video Studio\strata-agent\exports'))+[IO.Path]::DirectorySeparatorChar
        $clipboardFile=[IO.Path]::GetFullPath($result.clipboardFile)
        if(!$clipboardFile.StartsWith($exportRoot,[StringComparison]::OrdinalIgnoreCase)){throw '剪贴板导出路径不属于本工具。'}
        try{$script:clipboardText=[IO.File]::ReadAllText($clipboardFile); [Windows.Forms.Clipboard]::SetText($script:clipboardText); $script:clipboardUntil=[DateTime]::Now.AddSeconds(60)}finally{Remove-Item -LiteralPath $clipboardFile -ErrorAction SilentlyContinue}
      }
      if($result.pages){foreach($page in $result.pages){$uri=[Uri]$page; if($uri.Scheme -eq 'http' -and $uri.Host -eq '127.0.0.1' -and !$uri.Query -and !$uri.Fragment){Start-Process -FilePath $uri.AbsoluteUri}}}
      if($result.preferences){
        # A slow scan/install must not overwrite edits made after its request.
        if($request.preferences -and $script:preferences){
          $current=Get-Preferences
          foreach($property in $result.preferences.PSObject.Properties){$key=$property.Name; if($current.$key -cne $request.preferences.$key){$result.preferences.$key=$current.$key}}
        }
        $script:preferences=$result.preferences; $uncensored.SelectedIndex=[array]::IndexOf(@('off','builtin','community'),[string]$result.preferences.uncensoredMode); $strataPort.Value=$result.preferences.strataPort; $guiPort.Value=$result.preferences.guiPort; $openNative.Checked=$result.preferences.openNative; $openGui.Checked=$result.preferences.openGui; $context.SelectedIndex=[array]::IndexOf(@(32768,65536,131072,262144),[int]$result.preferences.contextTokens); foreach($key in $script:paths.Keys){$script:paths[$key].Text=$result.preferences.$key}
      }
      if($action -eq 'doctor'){
        $d=$result.doctor; $script:detectedCc=$d.ccSwitch.path; $model.Items.Clear(); foreach($item in $d.models){[void]$model.Items.Add($item)}
        foreach($item in $model.Items){if($item.id -eq $script:preferences.modelId){$model.SelectedItem=$item}}
        $dependencyText.Text="Node $($d.node.version)`r`nnpm：$($d.npm.prefix) $($d.npmIssue)`r`nClaude $($d.claude.version) · $($d.claude.identity)`r`n$($d.claude.path)`r`nStrata $($d.strata.installedVersion) · 完整安装=$($d.strata.managedInstalled)`r`n$($d.strata.installDirectory)`r`n模型=$($d.strata.modelDirectory)`r`n完成 pack=$($d.pack)`r`nCC Switch：$($d.ccSwitch.identity)`r`nCloudCLI：$($d.cloud.stage)`r`nSDK：$($d.cloud.sdkDirectory)`r`n容量与本机当前资源、运行日志分别核对；32K 不足以容纳完整GUI多轮工具。"
        $status.Text='检测完成。选择已有模型后点击启动；缺件请展开“设置与依赖”安装。'; Add-Log $status.Text
        [Console]::WriteLine('[launcher] doctor-response-applied')
      } elseif($action -eq 'install'){
        Add-Log $result.message
        Send-Command 'doctor' @{preferences=(Get-Preferences)}
      } elseif($action -eq 'installationPlan'){
        $description=$result.message; foreach($item in $result.items){$description+="`r`n$($item.name) $($item.version)`r`n目标：$($item.target)`r`n$($item.impact)"}
        if($result.items.Count -and [Windows.Forms.MessageBox]::Show($description,'确认安装目标、规模与影响','YesNo','Question') -eq 'Yes'){Send-Command 'install' @{planId=$result.id; confirmed=$true}}
        else{$status.Text=$description}
      } elseif($action -eq 'stop' -and $result.requiresConfirmation){
        if([Windows.Forms.MessageBox]::Show($result.message,'停止活跃任务？','YesNo','Warning') -eq 'Yes'){Send-Command 'stop' @{confirmed=$true}}else{$script:closing=$false; $script:restart=$false}
      } else {
        if($result.message){if(!$script:lastFault){$status.Text=$result.message}; Add-Log $result.message}
        if($action -eq 'stop'){
          $script:running=$false; $start.Text='启动'
          if($script:closing){$script:allowClose=$true; $form.Close()}
          elseif($script:restart){$script:restart=$false; Send-Command 'start' @{preferences=(Get-Preferences)}}
        }
      }
    }
    if($script:child.HasExited){
      if($script:preparing){
        if($script:child.ExitCode -eq 0){Start-Controller}else{$status.Text='工具准备失败：'+$script:errors.Result; Add-Log $status.Text; $script:preparing=$false; $script:child=$null}
      }else{
        $status.Text='Controller 意外退出（退出码 '+$script:child.ExitCode+'）。自有 Job 正在清理；请查看日志并重新检测。'; $status.ForeColor=[Drawing.Color]::Firebrick; Add-Log $status.Text
        $script:job.Dispose(); $script:job=New-Object StrataAgentJob; $script:child=$null; $script:read=$null
        $script:pending.Clear(); $script:running=$false; $script:restart=$false; $script:closing=$false
        $start.Text='启动'; $chat.Enabled=$false; $cancel.Enabled=$false; $progressBar.Visible=$false; $start.Enabled=$true; $detect.Enabled=$true; $install.Enabled=$true; $save.Enabled=$true
        $runtimeState.Text='控制器已退出 · 自有服务待回收 / 已停止'
        $resources.Text='资源采样已停止；请检测 / 重试。'; $resources.Tag=$null
      }
    }
    if($script:child -and !$script:preparing -and !$script:child.HasExited -and ([DateTime]::Now-$script:lastPoll).TotalSeconds -ge 2 -and !@($script:pending.Values | Where-Object {$_.action -eq 'status'}).Count){
      $script:lastPoll=[DateTime]::Now; Send-Command 'status'
    }
    if($script:lastReply -ne [DateTime]::MinValue -and ([DateTime]::Now-$script:lastReply).TotalSeconds -gt 12){$runtimeState.Text='控制器超过12秒未返回状态；服务状态未知。可取消操作或查看日志。'}
    if($resources.Tag -and ([DateTime]::Now-$resources.Tag.at).TotalSeconds -gt 12){$resources.Text='最近采样（未更新）：'+$resources.Tag.text}
    if($tips.GetToolTip($status) -cne $status.Text){$tips.SetToolTip($status,$status.Text)}
  }catch{$status.Text=$_.Exception.Message; Add-Log $status.Text}
})
$form.Add_Shown({
  Resize-Content
  if($Smoke){
    # Component layout exercise, not a mouse/DPI or real Agent acceptance test.
    try {
      if($uncensored.Items.Count -ne 3){throw 'uncensored 三选一缺失'}
      foreach($index in 0..2){$uncensored.SelectedIndex=$index; if(!$uncensored.SelectedItem){throw 'uncensored 选项不可选择'}}
      [Console]::WriteLine('[modes] off / builtin / community selectable; no service launched')
      foreach($size in @(@(720,540),@(1000,720))){
        $runtimeState.Text="Strata：online · 模型：已加载 · GUI：在线 · Claude：按需调用 · file-read`r`n正在处理：142秒 · 已生成12000 tokens`r`nuncensored：控制向量已加载=True；不保证拒答消失"
        $status.Text='故障：Strata 连续三次无法连接。未终止或重放活跃任务；请查看服务日志，确认后停止并重新启动，可恢复原 Claude 会话。'
        $form.Size=New-Object Drawing.Size($size[0],$size[1]); Resize-Content; $form.PerformLayout(); [Windows.Forms.Application]::DoEvents()
        foreach($control in @($start,$stop,$cancel,$chat,$settingsToggle,$connectionMenu,$logToggle,$runtimeState,$resources)){
          $bounds=$form.RectangleToClient($control.RectangleToScreen($control.ClientRectangle))
          if(!$form.ClientRectangle.Contains($bounds)){throw "主控件被裁切：$($control.Text) $bounds"}
        }
        $settingsToggle.PerformClick(); $form.PerformLayout(); [Windows.Forms.Application]::DoEvents(); Resize-Content
        foreach($row in $settings.Controls){if($row.Right -gt $settings.ClientSize.Width){throw "设置行超出可用宽度：$($row.GetType().Name) right=$($row.Right) available=$($settings.ClientSize.Width)"}}
        $settingsToggle.PerformClick(); $logToggle.PerformClick(); $logToggle.PerformClick()
        [Console]::WriteLine("[layout] $($size[0])x$($size[1]) primary controls reachable; settings toggle / log toggle passed")
      }
      $bitmap=New-Object Drawing.Bitmap($form.Width,$form.Height); $form.DrawToBitmap($bitmap,(New-Object Drawing.Rectangle(0,0,$form.Width,$form.Height)))
      $filename=Join-Path ([IO.Path]::GetTempPath()) 'strata-agent-layout.png'; $bitmap.Save($filename); $bitmap.Dispose()
      [Console]::WriteLine('[layout] render='+$filename)
    } catch { [Console]::WriteLine('[layout] FAILED: '+$_.Exception.Message); $script:smokeFailed=$true }
    $script:allowClose=$true; $form.Close(); return
  }
  $timer.Start(); Prepare-Controller
})
$form.Add_FormClosing({
  if($script:allowClose -or !$script:child -or $script:preparing -or $script:child.HasExited){return}
  $_.Cancel=$true
  if(!$script:closing){$script:closing=$true; $status.Text='退出前停止本工具自有服务…'; Send-Command 'stop'}
})
try{[void]$form.ShowDialog()}finally{
  if($script:clipboardText -and [Windows.Forms.Clipboard]::ContainsText() -and [Windows.Forms.Clipboard]::GetText() -ceq $script:clipboardText){[Windows.Forms.Clipboard]::Clear()}
  $timer.Stop(); $timer.Dispose()
  if($script:child -and !$script:child.HasExited -and !$script:preparing){if($script:writer){$script:writer.Close()}; [void]$script:child.WaitForExit(3000)}
  $script:job.Dispose(); $mutex.ReleaseMutex(); $mutex.Dispose(); $form.Dispose()
}
if($script:smokeFailed){exit 1}
