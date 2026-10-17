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
$script:running=$false; $script:restart=$false
$script:detectedCc=''; $script:clipboardText=$null; $script:clipboardUntil=[DateTime]::MinValue
$form = New-Object Windows.Forms.Form
$form.Text = 'Strata Agent'; $form.StartPosition = 'CenterScreen'; $form.Size = New-Object Drawing.Size(780,390)
$form.MinimumSize = New-Object Drawing.Size(720,390); $form.AutoScaleMode = 'Dpi'
$form.Font = New-Object Drawing.Font('Segoe UI',10)
$flow = New-Object Windows.Forms.FlowLayoutPanel
$flow.Dock = 'Fill'; $flow.FlowDirection = 'TopDown'; $flow.WrapContents = $false; $flow.AutoScroll = $true; $flow.Padding = New-Object Windows.Forms.Padding(20)
$form.Controls.Add($flow)
function Label($text) { $c=New-Object Windows.Forms.Label; $c.Text=$text; $c.AutoSize=$true; $c.Margin=New-Object Windows.Forms.Padding(0,5,0,8); return $c }
function Button($text) { $c=New-Object Windows.Forms.Button; $c.Text=$text; $c.AutoSize=$true; $c.MinimumSize=New-Object Drawing.Size(100,34); return $c }
$title=Label 'Strata Agent  ·  本地 Claude 工具环境'; $title.Font=New-Object Drawing.Font('Segoe UI',14,[Drawing.FontStyle]::Bold); $flow.Controls.Add($title)
$model=New-Object Windows.Forms.ComboBox; $model.DropDownStyle='DropDownList'; $model.Width=690; $model.DisplayMember='name'; $model.ValueMember='id'; $model.AccessibleName='模型'; $flow.Controls.Add($model)
$options=New-Object Windows.Forms.FlowLayoutPanel; $options.AutoSize=$true; $options.Width=690
$uncensored=New-Object Windows.Forms.CheckBox; $uncensored.Text='uncensored 模式'; $uncensored.AutoSize=$true
$lan=New-Object Windows.Forms.CheckBox; $lan.Text='家庭局域网（本机验收后开放）'; $lan.AutoSize=$true; $lan.Enabled=$false
$options.Controls.AddRange(@($uncensored,$lan)); $flow.Controls.Add($options)
$tips=New-Object Windows.Forms.ToolTip; $tips.SetToolTip($uncensored,'使用兼容模型自带控制向量；不放宽文件或 shell 权限，也不保证不会拒答。')
$actions=New-Object Windows.Forms.FlowLayoutPanel; $actions.AutoSize=$true
$start=Button '启动'; $stop=Button '停止全部'; $cancel=Button '取消当前操作'; $cancel.Enabled=$false
$actions.Controls.AddRange(@($start,$stop,$cancel)); $flow.Controls.Add($actions)
$status=Label '正在准备工具…'; $status.MaximumSize=New-Object Drawing.Size(690,0); $flow.Controls.Add($status)
$resources=Label 'Strata ○    Claude 按需调用    GUI ○    LAN 关闭'; $flow.Controls.Add($resources)
$progressBar=New-Object Windows.Forms.ProgressBar; $progressBar.Width=690; $progressBar.Height=6; $progressBar.Style='Marquee'; $progressBar.Visible=$false; $flow.Controls.Add($progressBar)
$settingsToggle=Button '设置与依赖 ▸'; $flow.Controls.Add($settingsToggle)
$settings=New-Object Windows.Forms.FlowLayoutPanel; $settings.FlowDirection='TopDown'; $settings.WrapContents=$false; $settings.AutoSize=$true; $settings.Visible=$false
$flow.Controls.Add($settings)
$script:paths=@{}
foreach($spec in @(@('strataDirectory','Strata 安装目录'),@('modelDirectory','共享模型目录'),@('packConfig','已准备 runtime.json'),@('claudeEntry','Claude CLI 入口'),@('cloudDirectory','npm 共享安装位置'),@('ccSwitchPath','CC Switch 程序'))) {
  $row=New-Object Windows.Forms.FlowLayoutPanel; $row.AutoSize=$true
  $label=Label $spec[1]; $label.Width=160; $label.AutoSize=$false
  $text=New-Object Windows.Forms.TextBox; $text.Width=390; $text.AccessibleName=$spec[1]; $script:paths[$spec[0]]=$text
  $browse=Button '选择…'; $browse.Tag=@{key=$spec[0]; textbox=$text}
  $browse.Add_Click({
    $data=$this.Tag
    if($data.key -in @('packConfig','claudeEntry','ccSwitchPath')) { $picker=New-Object Windows.Forms.OpenFileDialog; $picker.Filter=switch($data.key){'packConfig'{'运行配置|runtime.json|JSON|*.json'} 'claudeEntry'{'官方 Claude CLI|cli.js;claude.exe'} 'ccSwitchPath'{'CC Switch|*.exe'}}; if($picker.ShowDialog() -eq 'OK'){$data.textbox.Text=$picker.FileName} }
    else { $picker=New-Object Windows.Forms.FolderBrowserDialog; if($picker.ShowDialog() -eq 'OK'){$data.textbox.Text=$picker.SelectedPath} }; $picker.Dispose()
  })
  $row.Controls.AddRange(@($label,$text,$browse)); $settings.Controls.Add($row)
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
$logToggle=Button '日志 ▸'; $flow.Controls.Add($logToggle)
$log=New-Object Windows.Forms.TextBox; $log.Multiline=$true; $log.ReadOnly=$true; $log.ScrollBars='Vertical'; $log.Width=690; $log.Height=150; $log.Visible=$false; $flow.Controls.Add($log)
function Add-Log([string]$message) { if($log.TextLength -gt 24000){$log.Text=$log.Text.Substring($log.TextLength-16000)}; $log.AppendText((Get-Date -Format 'HH:mm:ss')+' '+$message+[Environment]::NewLine); [Console]::WriteLine($message) }
function Get-Preferences {
  if(!$script:preferences){throw '请等待自动检测完成。'}
  $p=$script:preferences.PSObject.Copy(); $p.modelId=$model.SelectedItem.id; $p.uncensored=$uncensored.Checked; $p.lan=$false
  $p.strataPort=[int]$strataPort.Value; $p.guiPort=[int]$guiPort.Value; $p.openNative=$openNative.Checked; $p.openGui=$openGui.Checked
  $p.contextTokens=@(32768,65536,131072,262144)[$context.SelectedIndex]
  foreach($key in $script:paths.Keys){$p.$key=$script:paths[$key].Text.Trim()}
  if($p.modelDirectory){$p.modelRoot=''}
  return $p
}
function Send-Command($action,$extra=@{}) {
  if(!$script:child -or $script:preparing -or $script:child.HasExited){$status.Text='Controller 未就绪，请自动检测 / 重试。'; return}
  $script:nextId++; $command=@{id=$script:nextId; action=$action}; foreach($key in $extra.Keys){$command[$key]=$extra[$key]}
  $snapshot=if($script:preferences){Get-Preferences}else{$null}
  $script:pending[$script:nextId.ToString()]=@{action=$action; preferences=$snapshot}
  if($action -notin @('status','cancel','stop')){$script:operation=$action; $cancel.Enabled=$true; $progressBar.Visible=$true; $start.Enabled=$false; $detect.Enabled=$false; $install.Enabled=$false; $save.Enabled=$false}
  $script:writer.WriteLine(($command | ConvertTo-Json -Depth 10 -Compress)); $script:writer.Flush()
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
$settingsToggle.Add_Click({$settings.Visible=!$settings.Visible; $form.Height=if($settings.Visible){820}else{390}; $settingsToggle.Text=if($settings.Visible){'设置与依赖 ▾'}else{'设置与依赖 ▸'}})
$logToggle.Add_Click({$log.Visible=!$log.Visible; if($log.Visible){$form.Height=[Math]::Max($form.Height,600)}})
$detect.Add_Click({Prepare-Controller})
$save.Add_Click({try{Send-Command 'save' @{preferences=(Get-Preferences)}}catch{$status.Text=$_.Exception.Message}})
$install.Add_Click({try{Send-Command 'installationPlan' @{preferences=(Get-Preferences)}}catch{$status.Text=$_.Exception.Message}})
$start.Add_Click({try{if($script:running){$script:restart=$true; Send-Command 'stop'}else{Send-Command 'start' @{preferences=(Get-Preferences)}}}catch{$status.Text=$_.Exception.Message; $script:restart=$false}})
$stop.Add_Click({Send-Command 'stop'})
$cancel.Add_Click({$status.Text='正在取消并等待自有资源收尾…'; Send-Command 'cancel'})
$timer=New-Object Windows.Forms.Timer; $timer.Interval=100
$timer.Add_Tick({
  try {
    if($script:clipboardText -and [DateTime]::Now -ge $script:clipboardUntil){if([Windows.Forms.Clipboard]::ContainsText() -and [Windows.Forms.Clipboard]::GetText() -ceq $script:clipboardText){[Windows.Forms.Clipboard]::Clear()}; $script:clipboardText=$null}
    if(!$script:child){return}
    while($script:read -and $script:read.IsCompleted){
      $line=$script:read.Result
      if($null -eq $line){$script:read=$null; break}
      $script:read=$script:child.StandardOutput.ReadLineAsync()
      if($script:preparing){Add-Log $line; continue}
      $message=$line | ConvertFrom-Json
      if($message.event){
        if($message.message){$status.Text=$message.message; Add-Log $message.message}
        if($message.event -eq 'resources'){$r=$message.resources; $resources.Text=('可用 RAM {0:N1} GiB · 提交余量 {1:N1} GiB · 空闲显存 {2:N1} GiB' -f ($r.memoryAvailableBytes/1GB),($r.commitAvailableBytes/1GB),($r.vramAvailableBytes/1GB))}
        continue
      }
      $request=$script:pending[$message.id.ToString()]; $action=$request.action; $script:pending.Remove($message.id.ToString())
      $cancel.Enabled=$false; $progressBar.Visible=$false; $start.Enabled=$true; $detect.Enabled=$true; $install.Enabled=$true; $save.Enabled=$true
      if(!$message.ok){$status.Text=$message.message; Add-Log $message.message; $script:closing=$false; $script:restart=$false; continue}
      $result=$message.result
      if($action -eq 'start'){$script:running=$true; $start.Text='应用并重启'}
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
        $script:preferences=$result.preferences; $uncensored.Checked=$result.preferences.uncensored; $strataPort.Value=$result.preferences.strataPort; $guiPort.Value=$result.preferences.guiPort; $openNative.Checked=$result.preferences.openNative; $openGui.Checked=$result.preferences.openGui; $context.SelectedIndex=[array]::IndexOf(@(32768,65536,131072,262144),[int]$result.preferences.contextTokens); foreach($key in $script:paths.Keys){$script:paths[$key].Text=$result.preferences.$key}
      }
      if($action -eq 'doctor'){
        $d=$result.doctor; $script:detectedCc=$d.ccSwitch.path; $model.Items.Clear(); foreach($item in $d.models){[void]$model.Items.Add($item)}
        foreach($item in $model.Items){if($item.id -eq $script:preferences.modelId){$model.SelectedItem=$item}}
        $dependencyText.Text="Node $($d.node.version)`r`nnpm：$($d.npm.prefix) $($d.npmIssue)`r`nClaude $($d.claude.version) · $($d.claude.identity)`r`n$($d.claude.path)`r`nStrata $($d.strata.installedVersion) · 完整安装=$($d.strata.managedInstalled)`r`n$($d.strata.installDirectory)`r`n模型=$($d.strata.modelDirectory)`r`n完成 pack=$($d.pack)`r`nCC Switch：$($d.ccSwitch.identity)`r`nCloudCLI：$($d.cloud.stage)`r`nSDK：$($d.cloud.sdkDirectory)`r`n上下文：32K 待实测，262K 未放行"
        $status.Text='检测完成。启动链已接线；缺件请先确认安装，真实Agent工具尚待scratch验收。'; Add-Log $status.Text
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
        if($result.message){$status.Text=$result.message; Add-Log $result.message}
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
        $status.Text='Controller 已退出。自有 Job 子进程正在清理；可检测 / 重试。'; Add-Log $status.Text
        $script:job.Dispose(); $script:job=New-Object StrataAgentJob; $script:child=$null; $script:read=$null
      }
    }
  }catch{$status.Text=$_.Exception.Message; Add-Log $status.Text}
})
$form.Add_Shown({$timer.Start(); Prepare-Controller})
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
