# Strata Agent 启动器（开发中）

双击 `Start.cmd` 打开 Windows 小窗口，无需启动 Local Video Studio 或 ComfyUI。首次／源码更新后准备独立 controller，以后复用 `.runtime`。需要Node22.15+（当前验证24.16.0）；有仓库TypeScript时使用编译器，没有时使用Node内置转换器，不要求安装或打开Electron、不执行npx latest。内置转换不代替开发typecheck。

**localhost GUI/CLI闭环和262144原生容量已实测。** “启动”连接依赖预检→共享GPU租约→独立Strata加载→CloudCLI就绪/监听身份检查→按偏好开页，失败逆序回收。现机64GB/4090的独立scratch八轮覆盖文件、shell/git diff、Plan、权限拒绝、取消和resume；GUI实际按钮/一次许可及原CLI同session双向续聊通过。32K不足以容纳GUI完整工具多轮；64K→128K→262144逐档实测后，默认Strata262144，Claude客户端保守200000，设置折叠区保留各档。原生220K输入不是Claude220K工具会话，充分利用目标窗口另验；H3保持32K。具体耗时、失败和范围见[同一任务](../../docs/tasks/2026-10-17-strata-local-agent/TASK.md)。

主界面保留模型、uncensored、家庭局域网、启动和停止全部。局域网默认关闭并锁定到首次安全验收之后。“设置与依赖”自动回填发现的Strata、共享模型、完成pack、Claude和CC Switch，以及常规npm共享安装位置；空白pack表示尚未发现完成配置，启动时按需准备。手动选择保留，检测期间新编辑不会被迟到结果覆盖。可选择路径及端口、保存开页偏好；不创建第二套模型库。运行选择冻结，修改后用“应用并重启”，活跃/未知任务先确认；不修改H3设置。

模型列表新增Unsloth UD-Q4_K_XL（四分片111.33GB，128GB RAM档），与Studio共用catalog、权重和离线pack。选择另一模型会清空界面的旧pack路径以重新发现，不删除旧数据；Q4固定源和BF16兼容转换记录独立，视觉投影/MTP复用已有文件。按当前RAM/Windows提交/显存选择完整专家驻留或官方预算驻留，64K以上上下文另计host KV。Q4也支持关闭／自带ESP／社区sergqwer；日志记录模型、context、预算与向量身份，未确认向量载入则失败。本次只接入并做无GPU验证，Q4真实Agent能力/质量/性能未验，不自动下载权重、不更改原默认模型。

uncensored改为“关闭／自带·ESP／社区·sergqwer”下拉选择。旧版开启迁移为自带，不自动切到社区。自带使用4..44层483520bytes向量，社区使用8..33层267552bytes向量；切换后应用并重启，日志显示mode、向量id/hash及本次引擎确认。Strata推荐0.1.45；菜单“更新Strata”复用统一安装器，附小向量校验与来源/许可证说明，不下载主模型。受管理安装与Studio共用固定`strata/runtime`和同一解析，旧版路径不再固定具体引擎；更新成功后清理旧软件、暂存和下载包，过期自动pack重新发现。共享模型、用户数据和H3设置保留，手动目录不自动覆盖。两种投影均为实验功能，不保证去拒答或质量改善，也不放宽Claude文件/shell权限。

“自动检测／重试”读取统一catalog、受信receipt、模型文件和实时RAM／提交余量／显存。“安装缺失软件”先展示版本、目标、已知规模和未知依赖规模，明确确认后执行。Strata复用统一安装器；CloudCLI固定1.37.5、SDK0.3.165，已有兼容官方Claude>=2.1.165直接复用，否则在确认旧/新版本和影响后，通过标准npm更新共享Claude，不复制整套旧包和命令入口。请求npm省略可选包，但本机npm实际带入SDK平台CLI；保留标准依赖树，禁止回退该入口，不静默换harness。安装前重核官方稳定版/npm latest/安全公告和integrity，变化则停止。直接包下载先核固定SRI，已有常规安装不要求本工具receipt；SDK入口另核hash，不修改共享源码。仅保留安装日志，下载包收尾清理；成功后同时清理可核对计划的历史软件备份。npm失败/取消可能部分生效，复检后再重试标准安装；Claude/CC Switch配置和数据库不在软件清理范围。

主界面的“连接与帮助”菜单可打开原生管理页、复制本机密钥、打开本轮日志目录，以及更新/修复软件、打开本机数据位置；依赖详情右键也保留同一菜单。CloudCLI首次创建的是本机账号，无需Anthropic/Cloud登录。原生页提示“API key needed”时，从此菜单复制并粘贴到其认证框，不能将key填入地址栏。复用npm prefix中已有其他软件，不改共享目录ACL；未知同名包内容、npm link或正在使用的包拒绝更新，不自动降级更高版本。Node/Git/CC Switch的缺件自动安装向导仍待补，当前电脑已有；CC Switch是可选兼容入口，日常启动不需要打开它。

主操作区固定，设置在下方滚动，展开不会强制把窗口增高到屏幕外。启动后每两秒读取服务存活、模型加载、GUI进程与当前请求的耗时/输出数量；短暂连接失败先显示检查中，连续三次失败报告失联，连接恢复后继续更新。模型引擎退出与Python HTTP退出分别显示；此检测不自动终止任务、重放工具或加载第二个模型。若需重启，确认停止全部后再启动，并在CloudCLI选择原Claude会话恢复。uncensored模式选择、对应向量载入、实际拒答效果是不同事实；不保证去除拒答，也不改变文件和shell权限。

“打开本轮服务 / 引擎日志目录”定位私有 `runs/<本轮ID>/`：`server.log`保留脱敏后的Python输出、异常和进程退出码，`engine.log`为原生引擎日志。私有`latest-run.json`索引使重开启动器后仍能找回最近日志/异常，不接管旧进程。操作/状态变化/资源保护原因及最近资源值记录在 `logs/<日期>.jsonl`；资源采样超过12秒不更新时标为最近值。资源保护停止的原因会保留，避免被普通“已停止”提示覆盖。日志仅留本机，可能含服务输出中的对话信息，分享前检查内容。上游90秒冻结检测与300秒无输出期限保持原值；遇到约两分钟掉线必须结合本轮日志判断，不能仅凭时间判为超时。

在发生故障的电脑点击“连接与帮助 → 导出诊断（本机，不自动上传）”；即使没有Node、服务已退出或启动器打不开，也可双击本目录的 `Export-Diagnostics.cmd`。报告保存到 `%LOCALAPPDATA%\Local Video Studio\strata-agent\diagnostics\<时间-ID>\diagnostics.json`，完成后显示路径并打开目录。只收集最近两份操作日志、最近三个run的engine/server日志（每份末256KiB）、经过校验的上下文/模式/端口及当前RAM/Windows提交余量/NVIDIA显存；不是崩溃瞬间采样。导出文件夹仅当前用户/SYSTEM可读，不联网、不解密token、不复制路由/运行配置/账号数据库/Claude sessions/权重；日志按凭证特征脱敏，但仍可能含对话内容，分享前检查。旧版只有`logs`和`runs/*/engine.log`时也可导出；没有保存过的Python输出无法事后恢复，报告会明确指出缺口。不要把整个数据目录发送出去。

普通Claude保留原Claude/CC Switch当前后端。本工具只给自己的GUI/CLI子进程设置本地BASE_URL、认证和model映射，清除该子进程的旧云路由冲突；不写全局/项目路由，不重设HOME或已有CLAUDE_CONFIG_DIR。复用现有sessions、MCP、skills、hooks和permissions；GUI只开放Claude provider，一次一个Agent任务或终端，禁止bypass、自动替换活跃任务和登录初始化命令。原生管理页初次可从菜单明确复制密钥，GUI首次创建的是本地账号，不登录Cloud。 共享软件与独立运行数据分离：默认使用现有npm prefix（Windows通常为`%APPDATA%/npm`），其他程序也可调用同一个claude/cloudcli。启动器仅在自己的进程忽略共享CloudCLI的.env、绑定已核对SDK和CLI，普通入口继续原有配置。

CC Switch默认只检测/打开，不导入、不选中provider、不接管代理、不写SQLite。可选“备份并复制备用配置”仅支持已核对的3.20.0 GUI JSON编辑器：明确确认后先做私有配置/SQLite在线一致性备份，再复制JSON，用户自行添加且保留原项为当前。若用户另行手动选中本地provider，服务停止后该项会不可用；不宣称它自动回原项。含token的deeplink禁止。

本机偏好、DPAPI token、日志、GUI数据库/附件和运行profile位于`%LOCALAPPDATA%/Local Video Studio/strata-agent`，协调记录在同级`resource-coordination`；不进Git。稳定token以CurrentUser DPAPI保存，运行时另用ACL受限的临时settings JSON供SDK/CLI读取，命令行只有文件路径，正常停止删除该文件；异常退出可能留下仍受ACL保护的临时文件。token不进URL/命令行/操作日志。剪贴板只经显式菜单使用，按内容匹配在60秒或关窗时清除。H3的32K策略、临时key和历史归属保留；Codex配置/凭证/provider不写。

跨进程资源请求通过命名管道和私有凭证认证，记录 PID、进程启动身份、epoch 和自有子进程。端口冲突、未知 owner、存活的崩溃遗留子进程均拒绝接管。Studio开始重型任务时申请同一租约；独立 Agent 默认要求用户在原窗口显式停止后交接，直到完整 harness 活动跟踪验收通过，不自动中止文件／shell任务。Studio仍有Comfy监听时，先在其所属窗口停止服务后重试；启动器不会替其杀进程。

窗口正常关闭走停止流程。Windows Job控制本工具controller和后代，GUI另有嵌套Job，关闭时回收CLI/终端/MCP后再停止自有Strata。GUI清理失败也继续尝试停自有模型，未确认资源保留租约并报错供重试，不杀未知进程。真实controller停止后自有GUI/引擎监听与租约回收通过；原生窗口鼠标关闭、DPI/焦点及完整交接旅程仍待验。停止不删共享权重、Strata安装、Claude sessions或CC Switch用户数据。

Agent原生页的加载走严格的before-load实时资源门禁；配置／VRAM修改和原生MCP被请求层拒绝，避免绕过启动器或让两套harness重复执行工具。原生采样、加载／卸载仍由上游接口处理；完整管理与冷重载尚未GPU验收。262144容量及220090-token原生输入已通过，不等于Claude已完整利用262144；不改分页文件。

Agent明确允许官方文件回读模式，显示实际模式与资源保护；H3保持独立32K和分模式保护，不继承Agent的较低RAM底线。H3文件页释放候选在长资料试验期间发生蓝屏后已回退关闭，根因未定，详见[H3实测证据](../../docs/tasks/2026-10-10-strata-prompt-integration/evidence/h3-residency-real-retest.md)。64GB机器不会只凭总RAM放行，实时检查可用RAM、Windows提交余量和显存；不自动改分页文件。CloudCLI只在本工具进程显示不大于本地窗口的token预算，不拿云模型200K/1M声明当成本机容量。首次本地账号的Git向导可点击“跳过Git全局配置”，不要求为聊天填写全局提交身份。

开发验证（均从仓库根运行）：

Agent运行资源监测由工具自动启动一个自有轻量Python子进程，复用所选Strata Python、Windows原生RAM/提交接口和已安装驱动的NVML；不在每秒轮询中启动PowerShell/WMI/nvidia-smi，不增加Claude常驻服务。准入、加载、运行读取新鲜结果；持续不可用仍显示原因并保护停止，真实低内存/提交/显存阈值不变。“停止全部”统一回收该监测进程，H3保持独立策略。

Agent预检、加载及运行监测采用三十秒资源采样宽限；单次请求三秒超时后继续退避重采样，不因三次失败提前停止，三十秒内恢复即继续。H3仍使用原三次、十二秒策略。没有新鲜样本时不刷新加载许可，八秒后拒绝新的冷加载，已有任务仍可在重测预算内恢复。明确的实际低资源仍立即保护，持续未知不会无限等待；这不是思考或回答时限。导出完成状态在打开模态提示前即消费，避免计时器重入反复弹窗。

```powershell
node Tools/Strata-Agent/prepare.mjs
npx.cmd vitest run --config vite.config.ts tests/strata-agent.test.ts tests/strata-agent-wiring.test.ts tests/strata-agent-controller.test.ts
# 只读审核固定版本源码包，不执行其中服务代码：
node Tools/Strata-Agent/verify-source.mjs <CloudCLI包目录> <Agent-SDK包目录>
```

以下P1进程/mock检查需确认测试资源归属；不代替GPU/Agent验收：

```powershell
node Tools/Strata-Agent/verify-lease.mjs
powershell.exe -NoProfile -File Tools/Strata-Agent/verify-job.ps1
node Tools/Strata-Agent/verify-http.mjs
node Tools/Strata-Agent/verify-monitor.mjs --long
node Tools/Strata-Agent/verify-monitor.mjs --crash
powershell.exe -NoProfile -File Tools/Strata-Agent/strata-agent.ps1 -Smoke
powershell.exe -NoProfile -File Tools/Strata-Agent/verify-diagnostics.ps1
powershell.exe -NoProfile -STA -File Tools/Strata-Agent/verify-diagnostic-reentry.ps1
node Tools/Strata-Agent/verify-resources.mjs <已安装Strata的Python绝对路径>
```

`verify-lease`使用临时协调目录，`verify-job`仅无GPU自有测试进程，`verify-http`使用已安装Strata的**CPU mock**。`verify-monitor --long`让实际Python HTTP/guard承载125秒脚本等待，验证监控与退出记录；仍没有真实模型、CLI或GPU。`-Smoke`只检查实际WinForms控件布局、折叠操作和渲染，不等同鼠标或系统高DPI验收。内部`engineValidation`只用于阶段验收；日用仍只有窗口的一次启动。已完成的真实scratch/GUI证据独立记录；262K完整Agent利用率、原生窗口/H3完整旅程和LAN继续按TASK验收。
