# 用户旅程、Harness 与 Agent Skill

- 类型：已验收任务归档；状态：archived / complete，用户于2026-10-08验收通过并要求关闭归档；6个Phase、旧Run前置保护与空闲原生退出均按限定边界交付。
- 范围：从当前 renderer、AppApi、queue/runtime/history 建立操作地图，补可执行场景与项目 Skill；不改变模型策略或持久化契约。
- 权威：用户本轮要求；[开发入口](../../README.md)、[验证契约](../../CHANGE_VERIFICATION.md)。

## Resume

用户验收后归档至本目录，原执行计划关闭，历史证据与未覆盖边界保留。当前操作以runbook/Skill为入口，本文件仅用于追溯。发布收尾按用户授权将当前全部源码/文档/测试改动纳入0.64.3 patch；不上传temp日志、媒体、模型或真实用户数据。

归档/发布验证（2026-10-08）：package/lockfile/README/CHANGELOG对齐0.64.3；15份文档171本地链接/25锚点通过，无旧任务路径引用。发布build含typecheck通过，构建前后候选源码状态不变；复用已验收的1769项verify、Python9项及真实UI/GPU证据，不重复生成。当前115个源码/测试/文档候选经文件类型/体积及凭据检查，忽略的temp媒体与日志保留本机；远端main在提交前与HEAD一致，无需合并或强推。

交接更新（2026-10-08）：先读本节与 [HANDOFF](HANDOFF.md)。用户明确允许读取真实 History 并将测试结果写入实库。任务按约定边界全部完成，勿重做 6B、已通过的 managed/GPU 检查或扫描旧19份夹具。旧 Run 不兼容在官方锁内、写 manifest 前拒绝，真实 task 6b424f0a 的原 Run16文件/8registry/History 保留，无手动恢复；兼容来源实际 UI managed 2→3、12秒成片/播放/重启及5个物理 owner/alias/registry 核对、最终 verify 通过。最后的退出证据已补齐：空闲 app-owned ComfyUI 下向自有 Electron 主窗口发送正常系统关闭请求，进入 close-requested→shutdown→owned-comfy-stopped→closed；App/Python/端口退出，129份 History、设置及草稿严格保留。证据见最新增量；不要求鼠标命中标题栏 × 才能证明正常退出生命周期。活动任务退出、remote、全部模型组合和任意后续失败回滚仍未覆盖，不能将任务完成写成产品全绿。

已完成的保护实现：`comfy-ui.ts`检查节点schema并给下游receipt附冻结head/accepted；`managed_prefix_guard.py`预载实际注册的官方sampler命名空间并在只读前缀检查后、写revision前拒绝不兼容来源。保持官方采样class/graph/hash资格，不改公共包源码。保护覆盖此前置拒绝，不扩大为任意后续错误/崩溃事务回滚。此前手动恢复的失败证据按日期保留，由下方最新增量覆盖当前结论。

整体交付：旅程图、仓库 Skill、真实 Electron Harness 已连接用户入口、AppApi、runtime 与 History；Create、Motion Context、Continuum bootstrap/managed、Upscale 和设置均有明确分层的限定证据。[资产生命周期地图](../../runbooks/ASSET_LIFECYCLE.md) 覆盖落盘、检查、迁移和删除；迁移引用、图片库清理保护、新成片时长及旧 Run 前置保护已修复。旧历史/既有损坏记录未批量改写。没有剩余必交付项；历史“待做/缺来源”按下方日期解释，不作为当前待办。后续修改从 [运行手册](../../AGENT_ELECTRON_API_RUNBOOK.md) 选受影响路径，大日志仍先过滤或交一个 Luna 有界摘要。

## 分阶段范围与成本

### 最终复核：导航与完成状态收口（2026-10-08）

- 核对最新生产差异与官方 RunStorage 调用位置：注册 sampler 对应模块已挂保护，官方锁内的前缀检查早于 revision/manifest 写入；未发现新的阻塞性功能缺陷。一个既有 Luna 有界复核最终日志/报告，确认旧 Run 拒绝且文件保留、兼容 task 61fcb45b 的 2→3/12秒媒体/播放/重启、6B-5/6/7 与原生关闭证据对应；历史失败记录未被抹去。
- 修正两处 Agent 入口遗漏：Extend guide 补 comfy-ui/managed_prefix_guard 与 TS/Python 检查；HANDOFF 去掉过期“待真实来源”和“最新1764项”表述，修复被空行打断的完成表。Resume 改为当前完成摘要，历史调查保留在分阶段记录。
- 本轮只改导航/文档，patch级。app-harness 9/9、脚本语法、guide、6份文档59本地链接/16锚点通过；隔离 TypeScript 编译通过，283份 JS 与现有 dist 内容一致（只忽略CRLF），两个 Python 源文件与打包/已安装副本一致。复用同生产输入的最终1769项 verify、Python9项和真实GPU证据，不重复全量或生成。证据在 temp/final-review-20261008/。
- 无生产语义、用户数据或版本修改，未启动 Electron/ComfyUI/GPU，未 stage/commit。开工/收尾前账号共享5h剩90%→62%、周剩80%→76%；不视为本任务独占成本，未使用重置卡。全部约定交付仍为完成；活动任务退出、remote、长链/所有模型组合与任意后续失败回滚保持未验证边界。

### 最新增量：正常系统关闭触发真实退出（2026-10-08）

- 复用实库启动器与现有 AppApi 审计，启动前确认无外部 Electron/Python/8188；真实 profile 129份 History，queue/Prompt 空闲。通过应用启动 ComfyUI 至 ready/app，记录自有 Electron PID59364/CDP6470 与 Python49540→17284。
- Harness 的隐藏窗口初始没有 MainWindowHandle，因此未发送关闭；利用应用现有 second-instance show/focus 显示同一主窗口，再核对 PID、electron 名称、准确标题与非零窗口句柄。`System.Diagnostics.Process.CloseMainWindow()` 返回 true，未预先调用停止 API、JS close 或由测试强杀进程。
- 同一 PID/session 日志依次为 Window.CloseRequested（HasRunningTask=false）→App.Shutdown→App.OwnedComfyStopped→Window.Closed；应用正常退出自行终止自有 ComfyUI 进程树。保留子进程已被父树终止后的 not-found/ESRCH 告警，不将它误记为残留或声称未使用应用内部进程终止策略。
- `temp/phase-native-close-20261008/native-close-audit.json`、`close-request.json`、`shutdown-events.json`、`resources-after.json` 为决定性证据：App59364/Python49540/17284 已退出，CDP6470/Comfy8188 无监听；关闭后 settings、draft、imageToVideoDraft、videoExtensionDraft、imageDraft、history、imageHistory、queue 与 AppApi 关闭前状态严格相等，129份 History 保留。原始 state/失败诊断/媒体不删除。
- 本次只补退出证据与文档，patch级，不改生产逻辑/版本，不重复相同生产状态已通过的1769项 verify、Python9项与GPU。guide settings-runtime 已运行；6份文档59本地链接/16锚点、脚本语法与 scoped diff 检查通过，doc-validation.json保留结果。最终无本次App/Python（含子进程5024）/端口残留，GPU利用率0%/1774MiB显示基线。所有限定交付完成；不是标题栏鼠标命中测试，也不涵盖活动任务/未保存设置/remote退出或任意崩溃恢复。
- 实时额度：开工5h/周已用1%/18%，中途8%/20%，收尾9%/20%（余91%/80%）；保留余量，未因自然恢复扩大范围。用户未明确要求时不得使用额度重置，不汇报未用卡数量。

### 最新增量：旧 Run 前置保护与真实兼容 2→3（2026-10-08）

- 本轮沿用已授权实库，先确认空闲/无外部Python/8188，并备份128作品状态、两个Run22文件和11registry。未重做6B、未扫描旧19夹具、未新增子Agent或消费reset credit。
- 第一版只挂到bridge模块，实际官方sampler延迟导入另一namespace，因此50ba99df任务开始采样；经AppApi取消，head未推进但project元数据变化已备份恢复。取消留下的本次.lock在确认自有PID51212死亡/无Python后备份并清理；下一次锁阻塞的失败报告也保留，不记为保护成功。真实运行揭示的问题不能被focused绿灯掩盖。
- 最终实现从ComfyUI实际注册的H3ContinuumSamplerV38定位/预载RunStorage模块，在其官方锁内检查任务head、官方完整前缀资格及数量；返回的是同一官方prefix/tensor，未更改采样身份/graph/hash。旧节点缺保护schema时提交前给出更新节点/重启提示；public源码、accepted数据、原有ID/IPC/persisted schema均未改。
- 最终集成旧来源task **6b424f0a-18c1-4791-8cfd-9de93b616395**、Comfy **b6e17280-fd59-4783-a36e-5a1a6841d3ee**：实际History Continue、空prompt disabled、键盘恢复、鼠标enqueue/QueueStart后在sampler0/20拒绝不兼容prefix。原head d1c25201ebfb04e2、Run16文件/8registry、129作品/图片History不变，无手动恢复。`temp/phase5f2-prefix-guard-20261008/old-final-ui.json`、`old-final-guard-audit.json`为决定性证据；早期失败/取消保留。
- 最终保护后的兼容来源task **61fcb45b-9c1e-4594-b405-f4c4b79632bf**，真实UI续写accepted2→3；asset **92f8a372-2379-49b5-acab-1a3d1e6b953d** / version **0a6309b8-e1ba-4c2d-9770-17a2b5d3673a**，head **5cf286e90133aa53**，receipt reused2/generated1/requested3/freshFallback=false。12秒864×480/24fps/288帧H264+12秒AAC完整decode；实际History播放/返回，5个物理owner及aliases/registry、旧6Run文件除project与3registry保护核对通过。`current-ui.json`、`current-output.json`、`current-media-probe.json`、`current-managed/managed-history.json`。
- 原128作品/所有草稿/Settings/图片History严格保留，新增一份真实生成作品及本次failed/cancelled记录；`final-before-restart.json`。通过应用installCustomNode更新内置H3包，旧包由应用备份；不bump版本。最终Python9项、TS2文件67项focused通过；最终 `verify-final.log` 为195文件1769项（189/1687 + 6/82）、typechecked clean build、20项contrast通过。
- 新构建真实profile重启PID69024/CDP10292，`restart-state-comparison.json`核对settings、draft/两种保存草稿/imageDraft、129份History、图片History、queue严格相等；仅应用生产normalizeH3MemoryOptions的旧字段归一化。`current-managed/managed-history-restart.json`再验实际解码播放/返回、receipt与5个物理owner/alias/registry；`original-final-integrity.json`再次核对最初原Run14文件/8registry/16owner-alias字节一致。该拒绝保护不涵盖之后任意decode/保存失败或崩溃回滚，长链、Regenerate/Take、真实用户Run删除/迁移、其他模型和画质/性能均未扩大覆盖。
- 原生工具本轮初始化一次仍返回trusted Node process exited unexpectedly，未选窗口/执行原生动作；准备空闲窗口和app-owned ComfyUI后请求用户点击×，未获反馈。随后按授权AppApi停自有runtime并JS关闭，`native-close-blocked.json`明确未验证，不搭自写UIA/PInvoke替代。PID29560/69024及native试验自有Python23148/66088均退出，CDP7711/10292/Comfy8188无监听、Python为空、GPU0%/1676MiB显示基线，`resource-final.json`。
- 6份文档58本地链接/16锚点、guide extend、scoped diff/空白检查通过；Skill、runbook、旅程图、资产地图、Unreleased同步。patch级，保留全部其他dirty工作、原媒体和本机原始失败/备份夹具，无reset/clean/stash/stage/commit/version bump。本轮实时5h使用37%→63%（余37%）、周14%→18%（余82%），账号共享额度不当作本树独占成本；未消费reset credit。其余交付无需重跑，只剩原生关闭的工具/人工动作证据。

### 最新增量：5F-2 真实 History 授权测试与 managed 续写（2026-10-08）

- 只读实库126作品/137版本筛出5个 accepted 候选，只有 lvs-09c819cd-f55 的最新40d6190b版本匹配 d1c25201ebfb04e2 head。真实 resolver 使用 Comfy output 根，Videos 是成片子目录；首次手工检查错误根的负结果不属生产缺陷。备份状态、完整Run14文件/137MiB和8份registry后启动自有真实profile，未删原始媒体。
- 旧来源真实 Continue/空提示词阻塞/补齐/鼠标入队 task 3fb042dc-3180-4c86-a90e-0f7a57c935b1，执行目标4、来源快照仍target3、15秒/seed19318。真实GPU后 receipt 节点拒绝；官方 report 0 reused/1 generated/4 requested，旧采样契约含Sol-Attn与不同Core VAE code hash。失败推进磁盘head至4cc05d16da85a1d3，原Run14文件/8registry/16owner-alias核对后，从真实备份恢复旧project head；failed-project/failed-revision和失败queue留存。未伪造accepted、放宽校验或恢复/替换公共Core。
- 为独立验证当前链，现有AppApi enqueueExtension只准备新的managed首段夹具：2秒被已有至少4秒校验拒绝，4秒/seed42实际 task6f65093b-42fc-430d-bf44-c733ff406447完成，run lvs-f9455448-d2f、asset d691d571-7b34-4716-9bfe-4a617554e306/version05fdc173-b71f-410c-9091-eaa30d9894b8。accepted=1由真实receipt产生；此API准备不证明普通用户首次managed入口，不是bootstrap。
- 从该真实History版本鼠标Continue，空提示词阻塞、实际键盘补文本、鼠标enqueue和Queue Start，task33ed99fd-1819-4028-b37b-66003d0c6b87真实完成。receipt revision5fc0b2a033d7d65c、reused1/generated1/requested2/freshFallback=false；asset41dc1c7e-54a0-4861-9594-b39460ba7557/version516dc23b-0a6d-4b12-ae14-fa9825307955。H264864×480/24fps/192帧/8秒、AAC8秒，完整解码和History播放/返回、重启同一身份通过。
- 新 managed-history-audit 复用CDP/fixture-ui，检查不可变前缀、firstFrameSource、receipt、旧Run文件/registry、实际播放和单版本AV删除按钮不存在；不调用删除。官方复用段重新封装会产生不同payload hash，但本次video/audio tensor hash一致；核对全部3物理owner/3hardlink alias/3registry及生产库存6条valid。初次探针漏读重新封装registry导致假legacy，已补receipt实际payload登记，原失败报告保留。
- 生产库存原仅扫描h3-continuum/runs，漏掉真实h3_continuum/runs；新增双布局回归先red（现代布局owner误报missing），修复后2文件17项focused通过。完整verify195文件1768项、typechecked build与20对contrast通过；新构建重启审计通过，无版本bump/stage/commit。审计只接受store既有History/failed queue旧内存三字段归一化，其余草稿/设置/History/queue严格一致。
- 证据根temp/phase5f2-real-history-20261008：restoration、original-owner-alias-integrity、first-managed-output、current-managed/ui-enqueue/task-output/managed-history-final/real-inventory/media-probe、restart-state-comparison、verify.log；初始失败与原夹具保留。真实History从126到128，两个测试作品及一条失败任务保留；用户活动/两种保存草稿已还原。收尾资源/额度见本增量末段。
- 新未完成项：旧Run采样契约不兼容时，公共节点可在应用拒绝receipt之前推进官方head；本轮仅手动备份恢复，未实现生产自动保护。需要独立确定官方严格恢复/事务保护方案，不能伪造accepted或强放宽hash。原生窗口生命周期仍未验；长链、Regenerate/Take、迁移/删除真实用户Run、质量/性能未扩大覆盖。
- 收尾：PID72592/8024、CDP14765/3809及Comfy8188无残留，Python进程为空、GPU0%/1617MiB显示基线；API清理不证明原生窗口关闭。original-final-integrity再次确认原Run14文件/8registry与备份字节一致，16owner-alias保留。6份文档58本地链接/16锚点、guide extend、脚本语法/help、tracked与新脚本空白检查通过，目标diff无删除。patch级；完整verify后仅改Harness/文档和恢复CRLF，没有生产语义变化，不重复GPU/full verify。
- 成本：复用既有Luna一次有限只读UI路径摘要，父级备份/操作不重叠；无新子agent/孙agent。账号共享实时5h/周已用1%/9%→11%/10%→15%/11%→24%/12%→35%/14%，最终剩65%/86%；两张重置卡未使用。新增生产head保护仍未完成，整体不标complete。

### 最新增量：6B-7 单作品 Prompt 保存/增强/重启（2026-10-07）

- 从本轮 6B-6 的真实单作品，经现有 asset-source-state 复制 MP4/canonical AV 到 temp/create-smoke-XxvCoZ；原始 PYpZPq 保留。settings-prompt-smoke 的 --history 要求物理隔离、单版本 canonical AV、空 queue，与 --resident 分开。不运行 prepare、不新增视频任务；AppApi 仅准备两种合法版本草稿，Settings 保存和增强为真实按钮/键盘。
- 实际 4B→2B，空输入通知阻塞且无请求，补文本点击后 operation 098c08ab-acb2-4c27-b158-3b08ccb7bc78 / native-text-generate 完成，339字符追加新版本；原版本/草稿/History 保留。settings-prompt-history、prompt-runtime-evidence、settings-prompt-history-after-restart 均通过；history-after-prompt/history-after-restart 实际解码播放/返回同一 asset/version。source-integrity.json 补充 MP4/AV manifest/payload 与原始三文件字节一致，只作物理完整性证据，不代替 UI/播放。
- task 9e553c2b-b1a1-4a97-898d-8c92675dfc07、asset 220b5f1b-5d8d-4726-b2b1-e9d1223f633b、version e1aea7c9-a896-4a88-80be-ede686210ed4 沿用真实来源；未生成新视频/新 History。PID70132/40560、CDP5376/6247 与本次后端已清理。一次播放命令自动审批超时未执行，按提示仅重试一次成功；没有未完成的审批操作。
- 只扩一条非空 History、文本、官方 storyboard、单作品输入；不证明多作品、多版本删除、Prompt 请求运行中保存、媒体/Pack/auto seed、取消/跨模式、质量或性能。

### 最新增量：6B-6 真实 running Attention 与成片（2026-10-07）

- 新隔离 temp/create-smoke-PYpZPq，prepare-create-smoke 缺输入/补齐/真实入队 task 9e553c2b-b1a1-4a97-898d-8c92675dfc07；应用 start-comfy ownership=app。settings-running-smoke 复用 CDP/fixture-ui/taskEvidence，实际 Queue Start 后才观察 running；真实保存 pytorch→sage-triton 前后均为 running，执行输入/策略与草稿严格保留。本次 task-started 仍为 pytorch，Comfy prompt 1d73e4f7-8d37-438e-928e-c689b798f7fc，真实完成后进入 History。
- 实际 864×480、39帧/24fps、1.625秒 MP4；history/history-after-restart 实际播放/返回，元数据匹配。settings-running-accepted 与 settings-running-restart-accepted 通过，保存设置为 sage-triton、执行仍为 pytorch、作品/版本/草稿跨重启保留。runtime-evidence.json 保存限定操作记录；不以 API output 数组替代播放或文件证据。
- Harness 首次收尾误读不存在的 outputPresent（settings-running.json 保留）；改为既有 outputs，--finish 只复用已经记录的 runningTask/afterSaveTask，不重提或重跑 GPU。队列完成瞬间可能还为 running，稍后自行停止；修正探针仅在仍运行且无 eligible 任务时通过真实 Queue 按钮停止，本例 finish 时已停止，没有宣称额外点击。首次重启报告仅差旧内存三字段和 AV 大小，按 store.ts 的 normalizeH3MemoryOptions(off) 与 history-query-service.restoreHistoryFileSizes 的实际 stat 审计；已有大小变化仍拒绝、所有身份/路径/其他字段严格比较，没有修改生产归一化或任意忽略字段。
- PID14716/69024、CDP3769/4723 与本次后端退出；只在隔离数据保存设置，没有操作用户 queue/媒体。新增真实证据仅 Attention running/生成/重启；其他三项、failed、取消或运行中重启没有获得真实验证。

### 最新增量：6B-5 Prompt 已驻留模型切换（2026-10-07）

- temp/create-smoke-4Yqc1H 的真实 UI task 21690722-bd68-44bc-abb0-a2bbfdfabcda 始终 waiting；--resident 点击 Prompt runtime 按钮实际加载旧 Qwen3.5 2B，再真实保存 4B。保存前/后均 resident=2B；补文本后实际增强 operation 97f379cf-5764-4498-84d8-b52d5e8cb978 / native-text-generate 成功，resident=4B，1082字符追加新版本。settings-prompt-resident、prompt-runtime-evidence、settings-prompt-resident-after-restart 均通过，草稿/旧版本/等待任务完整保留；未生成视频/History。
- 当前路径为 settings-service.save → store.promptModelId → prompt-application-service.beginPromptRuntimeLease 比较旧 lease → 不匹配时 releaseRuntime → 新模型请求。保存本身不立即卸载旧模型；日志 generationModelId/EnhanceRequest.modelId 仍是 H3 FL2VA，不等同 Prompt 模型。只证明这一对已安装 native 模型，不推广到其他后端/输入。
- PID36084/40716、CDP2836/3465、本次 app-owned ComfyUI 通过现有 helper 清理并复核。原生窗口关闭拟用 computer-use，两次 @oai/sky 初始化均因 trusted Node process exited unexpectedly 重置，未选窗口或执行 UI；native-close-blocked.json 保留工具诊断，不用自写 UIA/JS 关闭冒充原生退出。
- 5F-2 有界路线复核由一个既有 Luna 完成，并一次纠正初稿结论：history-artifact-service.ts:196–202 要已有 acceptedChunks，Create view-model 的 available 门槛不允许普通视频首次 managed；queue 工厂的 pending sequence 不是合格来源/可达用户路径。未重扫旧19份、未为缺来源启动 GPU。已请求新增真实来源路径，未收到时保留缺口。

#### 6B-5/6/7 共同收尾

- patch 级 Harness/导航/文档增量；未改生产代码、版本、持久化契约，未 stage/commit 或删除原夹具。复用2026-10-06构建，11个受影响生产输入无晚于构建的修改；未重复 typecheck/full verify。导航变化后 app-harness 1文件9项通过（temp/phase6b5-7/harness-focused.log）；三个脚本语法/两项help/官方guide命令通过。5份文档52本地链接、4唯一锚点、10源码/7测试入口与原CRLF通过（doc-validation.json）；七文件scoped diff无删除、git diff --check与两项未跟踪探针空白检查通过（scoped-review.json）。检查脚本的core.autocrlf=false曾误将CRLF当空白，已改用正常Git配置，不修改源文件行尾或全局配置。
- ffprobe 的 media-probe.json 确认 H264 864×480/24fps/39帧/1.625秒，AAC同长；原始与Prompt副本三文件物理内容一致。resource-final.json 确认六个自有PID及六个CDP/8188无残留，GPU利用率0%（显示内存1624MiB，不宣称全机零占用）。cleanup helper/API清理通过；原生窗口生命周期仍未验。所有temp证据/失败/原始素材保留，仅本机可用。
- 用户明确允许多步连续推进后执行这三步，未因额度自然恢复自行扩大范围。账号共享实时5h/周已用：开工0%/4%，过程中7%/5%→15%/7%→20%/7%，最终25%/8%（剩75%/92%）；未消费两张剩余重置卡。保留余量；仅剩5F-2须新增真实accepted来源，不继续堆设置排列组合冒充该交付。

### 最新增量：6B-4 覆盖汇总与知识库收口（2026-10-07）

- 默认草稿、Attention waiting、Prompt 下一次请求的六份 UI/重启报告，以及 cleanup-api.json 均存在且 ok=true。只读报告摘要，不重做已通过场景。6B-3 的 settings service/store/draft-defaults/H3 policy/Prompt service/model/controller/form 输入没有晚于报告的修改；6B-1/2 的证据保留其原检查状态，未借旧检查认证之后的无关改动。
- runbook 增加设置探针选择表（预期结果与证据边界），Skill 区分 disabled 与点击后反馈阻塞，guide 补齐 settings-service、prompt-application-service、prompt-models 及相邻服务测试入口。实际完成状态只在本 TASK 维护，没有新增顶层计划或第二份任务台账。
- 收尾检查：guide实际命令/语法与8个源码入口、7个测试文件存在性通过；导航输入变化后 app-harness 9项通过（temp/phase6b4/harness-focused.log）。5份文档50个本地链接、3个显式锚点通过（doc-validation.json），与本步快照的7文件diff及git diff --check通过；删除行仅是旧状态/入口文字替换，没有文件删除。未重复生产typecheck/full verify/真实运行。
- 本步只改文档/guide，patch级，不改生产代码、版本或持久化契约，不消费重置卡；无子 agent、Electron/ComfyUI/GPU 启动，无新资源需清理。实时5h/周已用：开工22%/3%，中途26%/4%，收尾27%/4%；剩余两张重置卡未使用。6B已按矩阵限定收口，5F-2的真实accepted来源仍是唯一交付前提。

<a id="settings-coverage"></a>
#### 设置覆盖矩阵：6B 按限定范围完成

| 范围 | 真实用户路径与持久化 | API / 执行层证据 | 明确未覆盖 |
| --- | --- | --- | --- |
| 默认视频模型保存 | 6B-1：实际选择 FL2VA→R2V/保存，活动及两种保存草稿完整保留；重启同样保留 | AppApi 准备合法编辑草稿；服务回归另覆盖 defaultVideoModel/promptModelId 保存保护 | 新建/清空草稿默认、图片/Extend 所有默认设置组合、原生选择器 |
| waiting 的 Attention 设置 | 6B-2：真实 Create 入队，sage-triton→pytorch 保存立即改策略；任务内容/草稿与重启保留 | 实际变化只有 attentionMode、h3ExecutionPolicy、updatedAt；没有执行该 waiting task | 同一 waiting 任务的后续执行没有在6B-2验证 |
| running 的 Attention 设置 | 6B-6：实际 Queue Start 后，保存前后仍为 running；pytorch 执行冻结，设置保存 sage-triton；成片/播放/重启 | 真实 ComfyUI 完成，同一 task→asset/version；旧内存/AV大小按明确恢复规则比较 | 其他三项、failed、取消/运行中重启 |
| 其余加速项与 failed | 没有真实应用状态变更证据 | 服务测试覆盖四项 waiting 更新及 running/terminal 排除；不推广 Attention UI 证据 | sparse/runtime/compiler 的真实保存/重启与 failed UI |
| Prompt 模型下一次请求 | 6B-3/5/7：真实模型保存、缺输入阻塞/恢复、增强/新版本/重启；已驻留2B→4B；单作品4B→2B保护/重启播放 | native-text-generate 真实推理；343/1082/339字符分别对应三次 operation。保存旧模型不卸载、下一请求切换；waiting或单作品快照保留 | 请求运行中保存、其他输入/Pack/auto seed、取消/异步切页、质量/性能；仅两对限定模型 |
| 隔离资源清理与正常退出 | 6B-3：AppApi停本次runtime后JS清理；最终原生正常系统关闭进入Electron退出链并清理自有ComfyUI，129作品/草稿保留 | cleanup-api.json；最新native-close-audit.json及同session关闭日志/PID/端口 | 标题栏鼠标命中、活动任务退出、未保存设置和remote生命周期；API成功不能代替退出后复核 |
| Upscale 邻接边界 | 6A：SeedVR2 native INT8 短片的缺文件恢复/按钮/派生History/播放/重启 | 当时实际39帧/1.625秒、480p→720p并解码成功；本步不重新运行 | 普通SeedVR2仅控件切换；H3 native、其他provider、长片恢复和画质 |

证据定位：6B-1 为 `temp/create-smoke-4KAJjN/settings-save.json` / `settings-after-restart.json`；6B-2 为 `temp/create-smoke-GW3Ae2/settings-queue.json` / `settings-queue-restart-accepted.json`；6B-3 为 `temp/create-smoke-rxlMNt/settings-prompt.json` / `settings-prompt-after-restart.json` / `prompt-runtime-evidence.json` / `cleanup-api.json`。6B-5 为 `temp/create-smoke-4Yqc1H/settings-prompt-resident.json` / `settings-prompt-resident-after-restart.json`；6B-6 为 `temp/create-smoke-PYpZPq/settings-running-accepted.json` / `settings-running-restart-accepted.json` / `history-after-restart.json`；6B-7 为 `temp/create-smoke-XxvCoZ/settings-prompt-history.json` / `settings-prompt-history-after-restart.json` / `history-after-restart.json` / `source-integrity.json`。各新副本另有 cleanup 前后报告。它们属于本机当时文件状态，temp 缺失或相关输入变化时不直接复用通过。6A 详情沿用阶段记录；方法见 [设置探针表](../../AGENT_ELECTRON_API_RUNBOOK.md#settings-probes)。

### 最新增量：6B-3 Prompt 设置、下一次请求与重启（2026-10-07）

- 当前路由：provider 固定 ComfyUI，旧 promptRuntime/promptUseLmStudio/lmStudioModel 不参与。Settings 保存 promptModelId；服务每次 enhance 从 store 读取。EnhanceRequest.modelId 是生成模型，日志 promptModelId/promptBackend 才是提示词后端；未用外部 API server/合成响应冒充推理。
- 新 settings-prompt-smoke.mjs 复用 launcher、CDP 与 fixture-ui；先由 prepare-create-smoke 真实 Create 入队，再用 AppApi 准备带版本的两种合法编辑草稿。实际键盘选择已安装 2B 并保存，严格比较全部草稿/版本/queue/空 History。真实增强按钮在无媒体/无文本时可点击，但显示“空 Prompt 自动起稿需要至少一份参考图片或视频”，且零 enhance-started；补文本后点击完成一次推理，既有版本保留，只追加新版本。
- 本机证据 temp/create-smoke-rxlMNt/{ui-enqueue,settings-prompt,prompt-runtime-evidence,settings-prompt-after-restart}.json。task 37c1e331-1198-4190-8deb-12b69abf1a1e 始终 waiting；operation 6af93e59-b182-4e9f-acdd-467523905c80，Comfy prompt 6a3adaa0-12f5-43c8-a5b9-b571670c8e66。官方 storyboard/T2VA/用户文本，343 字符非空输出写回新版本；应用自动启动 ComfyUI ownership=app，非直接 /prompt 提交。重启完整比较草稿/版本/等待任务（仅补明确生产旧内存兼容默认）通过；无视频生成/新 History、语义质量或性能保证。
- 实际 Harness 缺陷：runbook 的直接 window.close 只有 Window.Closed，未走 native close-requested/shutdown，留下本次 wrapper 65700→65588，并持有 CDP/8188，导致 resume 正确拒绝。记录归属到 cleanup-owned-processes.json 后只终止这两个自有 PID，旧报告/媒体保留。新增 close-fixture-smoke.mjs 检查匹配 launch/state、停止 queue、空闲 Prompt、本地 app ownership 后，经 AppApi forceStopComfyProcesses 再请求 JS close；实测重新应用启动→API清理成功，cleanup-start-comfy/cleanup-api.json 保留。此修复只涉及 Harness 指令，不宣称原生窗口退出已验。
- 4 文件/30 项 focused：prompt-models、prompt-environment-services、user-journeys、app-harness，日志 temp/phase6b3-focused.log；guide 更新后只重跑 app-harness 9 项，temp/phase6b3-harness-final.log。脚本语法/帮助通过，无生产修改，不重跑 typecheck/build/full verify。流程图、runbook、Skill、guide 与 Unreleased 已同步，patch 级，无版本 bump/提交。
- 一个 Luna 完成有界只读路由摘要（默认命令启动器 setup refresh 失败后一次纠正包获只读权限）；主 agent 只接手必要位置与真实操作。开工 5h/周已用7%/1%，中途14%/2%，收尾前20%/3%；账号共享额度，未消费剩余2张重置卡。最终 PID24772/34004、自有Python、CDP13245/14566 与8188 无残留，GPU利用率0%；waiting只留隔离副本，原始 fixture/用户数据未操作。
- 未覆盖：非空 History，旧 Prompt 模型已驻留时切换、增强运行中保存、其他模型/媒体/Pack/auto-seed、取消与跨模式异步写回、原生关闭、文本质量；running/failed H3 设置保护仍为服务测试。6B 剩覆盖汇总/知识库收口，5F-2 仍缺真实 accepted managed 来源，本轮不扩大范围。

### 最新增量：6B-2 等待任务加速设置（2026-10-05）

- 新 settings-queue-smoke.mjs 使用真实 Create UI 入队的唯一 waiting H3 task，再经 Settings 实际键盘/保存将 sage-triton 改为 pytorch。只有 attentionMode、h3ExecutionPolicy、updatedAt 变化，其他任务字段和草稿保持。已纠正流程图：四项加速设置保存时立即更新 waiting；不能统称只在 claim 生效。
- temp/create-smoke-GW3Ae2，task 570b8dcf-102b-46f6-97aa-f5cc1950e1fc；settings-queue.json 与 settings-queue-restart-accepted.json 通过。首次重启审计暴露恢复时补齐三项已退役 H3 内存兼容字段，按实际 normalizeH3MemoryOptions 比较；随后修复 undefined 可选草稿经 JSON 省略导致的审计假失败。旧报告保留，没有改生产或忽略任意字段。
- Luna 有界定位并跑3文件22项 focused，日志 temp/phase6b2-focused.log。running/failed 不变与 H3 upscale 嵌套策略保护是现有服务测试证据，本轮真实只覆盖 waiting 保存/重启；未启动 GPU。复用原生产构建，不重跑 verify。
- 自有 PID36992/71536/37960/40456、CDP13814/14047/14203/14294 已正常关闭；waiting 任务只留在隔离副本，不继续运行。剩余 6B 优先选择 Prompt 设置生效时机，再汇总覆盖；5F-2 仍待有效来源。
- 用户授权兑换最早到期卡；截止前最后尝试仍返回“Allow Codex to use resets”未开启。2026-10-04 23:40:46 UTC 查询确认已过期，可用卡3→2、无重置发生；当时5h剩9%、周剩10%。兑换未完成，不使用其他卡。已告知用户权限阻碍，停止扩展工作保留额度。

### 最新增量：6B-1 设置默认值与已有草稿（2026-10-05）

**收口结果（同日）**：`video-policy.ts` 对 video 输入的 R2V 禁用 Spectrum；`saveDraft` 保留传入快照，`store` 启动调用 `normalizeVideoDraft` 将不允许的值归一化为 off。旧 fixture 复制 I2V 的 balanced 后强改 video/ref2va，故不是设置保存覆盖草稿。仅修 Harness 的 extension 输入为 off/userSet=false，没有改生产或放宽完整对象比较。

新副本 `temp/create-smoke-4KAJjN/settings-save.json`、`settings-after-restart.json` 均通过；默认 FL2VA→R2V，活动及两种保存草稿跨重启完全相同。旧 rDh5pm 失败证据保留。PID66992/24072、CDP10722/10830 与 8188 已确认退出，无 GPU。复用上轮 8 项服务测试/typecheck，只做本次脚本语法、真实保存及重启验证；一个既有 Luna 有界只读定位，无新生产修改。开工实时 5h 已自然恢复为已用0%，重置卡仍3张、未消费。以下为此前调查记录，不能继续把重启差异视为未解决缺陷。

- 本轮限定无 GPU 小步骤。Luna 在 tests/draft-settings-services.test.ts 新增回归：defaultVideoModel/promptModelId 保存后，活动及两种保存草稿的 prompt/source/model 保留；单文件 8/8、typecheck 通过，未发现普通 SettingsService.save 覆盖草稿。原有迁移测试修改保留。
- 新 scripts/harness/settings-draft-smoke.mjs：空隔离 fixture，经 AppApi 准备两种编辑草稿，reload 后用 scanEnvironment(settings,'full') 恢复文件可用性；真实键盘改默认视频模型、实际保存按钮；baseline 防重入、--audit 只读重启核对。原生选择器/新草稿初始化/提示词请求/GPU 未验。
- temp/create-smoke-rDh5pm/settings-save-accepted.json 通过：默认 minimax_h3_fl2va→minimax_h3_ref2va，保存当时三个 draft 对象完全不变。settings-after-restart.json 失败：Spectrum balanced→off，其余报告未显示差异。视频测试草稿从图片模式对象复制，尚需区分模式归一化与产品缺陷；不要放宽断言或直接修改持久化策略。下一步先定位 core draft/default/store 归一化，然后用符合模式契约的新副本补齐重启。
- 前两次失败分别为 reload 后尚无模型扫描结果、scanEnvironment 漏传 settings；已修 Harness，失败报告保留，无 baseline 时才重试。源输入为 API fixture，设置变更为真实 UI。测试日志 temp/phase6b-typecheck.log、UI/重启摘要 temp/phase6b-*.log；服务回归日志由 Luna 留存。
- 未改生产、未启动 ComfyUI/GPU、未操作真实用户设置；正常关闭 PID43684/36500，CDP8686/9124。5h 从已用73%到93%，停止扩展范围、未用重置卡。6B 仍在进行，顶层剩余仍是 6B 与 5F-2 两项。

截至 2026-10-08：**6 个大 Phase、旧 Run 前置保护和空闲原生正常退出均按限定边界完成，无剩余必交付项**。6B 已按上方矩阵限定收口，未覆盖项没有被写成通过；不增加顶层主题。

| 小步 | 剩余交付 |
| --- | --- |
| 5F | 5F-1门槛/恢复与5F-2当前环境真实managed 1→2、History/重启、owner/alias/registry保护核对完成；首段API夹具不算UI入口 |
| 新增旧Run失败保护 | 已修复/最终真实拒绝通过：官方锁内完整前缀资格检查后、写revision之前拒绝；兼容2→3真实生成、History/重启和最终verify通过。不承诺其他后续错误的回滚 |
| 原生关闭证据 | 完成：CloseMainWindow正常关闭触发完整Electron退出链、自有ComfyUI清理、PID/端口退出及129作品/草稿严格保护。未预停API/JS/测试强杀；不扩大到活动任务或鼠标命中测试 |

这不是全模型排列组合或所有目录布局均已验证的承诺；每步明确真实覆盖与保留边界。

- Phase 4 分为小步 4A（源检查/真实入队）和 4B（GPU/History），总主题数仍为 6；用户明确希望剩余额度内完成一个小步。

- 用户 2026-09-28 要求控制每次 Phase 内容与 token。每阶段只处理一个交付主题或一条实际闭环；先限定范围，完成后记录证据/未验证项并交还用户。
- 用户继续明确要求：后续大量日志/文本筛查交给 Luna，主 agent 只读定位片段、简明结果和决定性证据。复用一个 Luna、无孙 agent；先用脚本过滤，限定读取范围/停止条件，避免父级再次展开同一材料。
- 总计仍为 6 个主题 Phase：1 地图/Skill/基础 Harness；2 Create→真实生成→History；3 Motion Context；4 Continuum bootstrap；5 Continuum managed/History 回流与资产管理；6 Upscale/设置联动。Phase 5 的真实迁移/删除以小步骤验收，不能一次扩成全库操作。
- Phase 1–3 已完成限定交付；Phase 2 的 History 元数据问题及 Phase 3 的迁移引用风险归 Phase 5，若影响前续阶段输入则提前处理。每阶段不一次跑所有模型。
- 复用已通过的相同文件状态检查；只读 TASK、目标图节、scoped diff 和必要实现。只在当前阶段需要真实闭环时构建/执行 GPU，不为文档编辑重复生成。

## 文件与资源

- Phase 1–4A 单 agent；Phase 4B 用户明确要求 Luna 读取日志，使用 1 个 Luna 子 agent、无孙 agent，仅做一次有限只读诊断，主 agent 维护和验收。维护新 harness、旅程测试、docs/runbooks、入口/验证文档、仓库 Skill、package scripts 和本条 changelog。
- 开始时已有修改：CHANGELOG、DEPENDENCIES_AND_SETUP、environment service/test、nodes catalog 的 TS/JS、Settings copy 的 TS/JS；保留这些工作，仅追加本任务 changelog。
- 任务列表检查未发现另一个运行中的本项目任务。运行前仍检查 dist/进程/端口；不停止外部进程。
- patch 级开发工具/文档改进，不单独 bump 版本；不下载模型、不修改真实用户设置、不自动清理用户媒体。

## 验收

- UI 测试必须点击真实启用按钮，修复缺失输入后观察恢复，并检查提交快照；不能用直接调 handler 绕过 disabled。
- CLI 提供 inspect、应用启动 ComfyUI、scan、UI enqueue 和按 task ID 跟踪；错误/超时返回非零，并保留阻塞原因。
- 流程图涵盖 FL2VA 的输入分支、R2V、prompt、Motion Context/Continuum、History 回流、Upscale 和 Settings 的生效时机。
- 未运行的 GPU 路线不得标为通过。

## Phase 1 验证证据（2026-09-28）

- `npm.cmd run test:journeys`：2 文件、15 检查通过。覆盖生产 Create 控件的禁用/恢复/点击、首尾帧→T2VA、R2V 空槽、prompt 请求、Motion Context/Continuum UI 切换，以及 harness 失败/身份关联边界；外部端口仍为 fixture。
- `npm.cmd run typecheck`：通过；`node --check` 两个新增 mjs：通过；`harness:app -- guide extend`：实际命令成功。
- `python -X utf8 .../skill-creator/scripts/quick_validate.py .agents/skills/local-video-studio`：通过，中文文件需要 UTF-8。Skill 已被当前会话自动发现。
- 文档检查：9 份入口/新文档、98 个本地链接、7 个场景锚点通过；`git diff --check` 通过。未删除或批量重写旧测试。
- 尚未验证：真实 CDP 连接/IPC/UI 入队、应用启动 ComfyUI、实际生成、播放/视觉、全部场景、full verify。不能宣称产品全链路通过。
- 没有启动 Electron/ComfyUI、占用 GPU、修改用户 state/media、安装依赖或运行清理构建。无新增常驻进程需要清理；未提交代码。
- 保留基线中的其他修改；CHANGELOG 仅追加本条。影响为 patch，不 bump 版本。
- 上轮文档补丁曾因自动审批额度不可用而未执行，恢复后已补齐。沙箱偶发 setup refresh / reparse 误报时使用获准的原生 apply_patch；没有绕过拒绝执行。

## Phase 2 真实证据（2026-09-28）

- 当前 production build/typecheck 成功；原有未提交业务改动保留，没有新增业务修改。使用正常 Electron 启动参数，无 no-sandbox/disable-gpu。初始无 Electron/ComfyUI 运行进程，GPU 空闲。
- `launch-create-smoke.mjs` 隔离 userData/日志/输出，仅复制 settings；未复制用户队列/历史。运行目录（gitignored，本机可用）为 `temp/create-smoke-n7yozh`；`launch.json`、`start-comfy.json`、`scan.json`、`generation.json`、`history-verification.json`、`media-probe.json` 和截图保留在其中，不提交机器路径/日志/媒体。
- AppApi `startLocalService` 把 stopped runtime 启动至 ready/ownership=app；实际 core/data/Python 沿用用户已配置安装。应用 scan/graph/真实执行分别取得证据，没有下载模型。
- 实际缺提示词禁用/原因可见→键盘输入→按钮点击→task `c58fbc90-ab3f-4838-9662-048887be1758`；无图片解析为 `minimax_h3_t2va_api.json`。后续草稿编辑不改变队列快照。实际策略为 20 steps、Spectrum balanced、原生 AV 保存；不能从初始草稿 off 推断执行策略。
- 单次 GPU 生成完成后活动队列移除任务，正确关联 asset `ba8b0807-31d5-42a2-a941-2134ecc1b496` / version `0c322274-d1be-4318-a058-db1e13f2da20`。非空 MP4 为 119617 bytes；ffprobe：H.264 864×480、24 fps、39 帧/1.625 秒，AAC 32 kHz stereo；ffmpeg 全片解码成功。没有人工评估声画质量或性能基准。
- 真实 History 卡片→详情→播放按钮→解码帧推进→返回原卡片成功。后台 RAF 会延迟播放器挂载，UI harness 显式记录 focus emulation。首次立即编辑的 smoke 超时保留；增加 focus emulation 和按钮恢复等待后，第二个空 fixture `temp/create-smoke-RsMPAH` 中完整 prepare 脚本通过，未再执行 GPU。
- 清理：第二个 fixture 的 waiting task 已用 AppApi 取消；两个 Electron 均正常关闭。最终检查本次 PID 已退出，9090/10295/8188 均无监听，没有 Electron/Python 残留。仅保留 gitignored 证据/媒体，未修改真实用户 state、安装依赖或下载模型。

### 明确失败，留给后续修复

收尾检查：`test:journeys` 2 文件/15 测试通过；5 个 harness mjs 语法检查、Skill validator、文档本地链接、scoped diff/check 通过。复用本阶段已通过的 build/typecheck；没有为了文档/工具改动重跑 GPU 或全量 verify。影响为 patch，未 bump/提交版本。

- **History 元数据不准确**：这次 1 秒请求产生 1.625 秒/39 帧媒体，History version.duration 却为 1，界面据此显示 24 帧。`verify-video-smoke.mjs` 已将“History 与播放器时长差不超过一帧”设为验收，当前样例明确失败；playback/return 证据仍保留。定位从 `electron/queue-execution-side-effects.ts` 的 version 创建/输出元数据来源开始，再检查 History 显示与 Extend trim 边界。不要放宽断言或用请求值替代实际值。
- 尚未覆盖：I2V/R2V 真实生成、提示词模型质量、Motion Context/Continuum、Upscale、设置组合、重启恢复及全量 verify。Phase 2 只交付一条实跑路径和真实失败探测，不代表全产品验收。

## Phase 3：Motion Context 与资产地图（2026-09-28）

- 用户新增：工作期间检查账号 5h 额度；理解一次任务保存什么/何处、资产库检查/转移和删除边界。开工已用 6%，实跑完成时已用 42%（账号共享用量，不能当成本任务独占 token）；没有使用 reset credit。
- 复用 Phase 2 的当前 production build，业务源码无新增修改，不重建或重复生成。资源检查无其他 Electron/Python 或 8188 listener；本次 run 为 gitignored `temp/create-smoke-gRChdv`，使用隔离 settings/userData/output，复制原测试 MP4，校正 fixture 来源时长为实测 1.625 秒，没有修改原记录来掩盖 Phase 2 缺陷。
- 新增 `prepare-motion-smoke.mjs`；缺视频真实禁用→History 详情/继续创作→来源 Slot/R2V→恢复按钮点击。初次过早点击详情按钮没有回流；改成等播放器/控件绑定就绪后完整复验成功。sourceAssetId/sourceVersionId 保留，trimEnd=1.625、生成段 1 秒、Spectrum off、无输入 latent，工作流 `minimax_h3_r2v_extend_api.json`。
- 真实 AppApi 启动 ComfyUI 至 ready/app ownership；唯一 task `909e0d24-1338-40f4-a19e-74356c10bc2d` 生成完成，对应 asset `1acfd294-8bc4-4cc7-bac3-257fb7758977` / version `592d8119-c51f-4a0b-a7aa-51779c14c7be`。History 播放/返回通过；ffprobe 视频 864×480/24fps/63 帧/2.625 秒，AAC stereo 32kHz/2.657 秒，ffmpeg 全片解码通过；一帧容差内的 History 时长检查通过，不代表人工声画质量评估。
- 单任务真实资产清单：MP4 279811 bytes；canonical AV payload 3453032 bytes；manifest 1772 bytes。payload 同时用于 JointAV、AV owner、Motion Context 路径，去重后共 3 个物理文件。续写资格 available / app-canonical。真实 `scanImageAssetLibrary` 返回图片引用/缺失/孤儿均 0，这不是“整个视频资产库为空”。
- 新增 `inspect-task-assets.mjs`，只读 task/version 文件证据；新增 ASSET_LIFECYCLE 的存储表、检查/归档/迁移/删除矩阵和 3 张流程图，接入 Skill、docs 和 `guide assets`。
- 针对性回归：7 文件/48 项通过，补充 History destructive service 33 项通过，共 81 项；不重复全量 verify。新代码只影响开发 harness/文档，patch 级，不 bump/提交。
- 本次 Electron PID 63376 已退出，5731/8188 无监听；保留本机 gitignored 报告与输出供后续复用，没有对真实用户资产执行整理、转移或删除。
- 收尾：typecheck、新增脚本语法、Skill validator、assets guide 和更新后的 harness 9 项复验通过（包含在上面的 81 项中，不重复计数）；本地链接/8 个旅程锚点和 scoped diff 检查通过。收尾额度检查已用 67%/余 33%，因此不展开 Phase 4。保留其他任务的预存修改。

### Phase 5 必须补的资产验收

- **代码审计风险，尚非实跑复现**：video-history-migration / SettingsService 规划与回写旧 file、JointAV pair、Motion 和 queue source 字段；未见对 draft、h3AvAsset owner/aliases、managed sequence/run 指针的同等处理。必须用隔离资产执行“迁移→重启→播放→Extend/AV inspection→删除保护”，再决定修复；不能因旧哈希复制测试通过宣布新资产迁移完整。
- 图片缺失输入恢复、归档后重编辑、扫描后新增引用不能被清理；视频单版本/整作品、JointAV-only、Motion-only、共享引用阻塞与部分删除失败；图片 source 保护/整项目不误删输入；Continuum run owner 不从单版本删除。只对物理文件也复制到测试目录的 fixture 执行。
- Phase 3 未实跑 latent-input Motion、长链、真实迁移/删除/清缓存；没有扩大模型矩阵。

## Phase 4A：bootstrap 入队门槛（2026-09-28）

- 新增 `prepare-bootstrap-smoke.mjs`。使用 Phase 2 FL2VA 的真实配对 AV，复制到新隔离目录；经 AppApi.saveDraft 设置 fixture 输入，原生文件选择器未测试。真实模型切换默认可能进入 managed，必须显式 bootstrap；不能拿空提示词导致的禁用冒充缺 AV 证据。
- 真实阻塞原因：“没有 AV latent。Continuum 不会自动回退到普通接续；请选择 AV 文件或切换接续模型。” 点击禁用按钮无任务；复制 payload/manifest、真实源检查恢复后点击实际按钮，task `e798cd42-3503-41fb-b679-cf68767b9991` 入队成功，mode=bootstrap、duration=5，来源 asset/version 保持 Phase 2 身份，workflow=`minimax_h3_continuum_v38_extend_api.json`。
- 本机证据在 gitignored `temp/create-smoke-suKfy3`：bootstrap-enqueue.json、queued-snapshot.json、测试 AV 副本及 user-data/studio-state.json。任务已取消，未启动 queue/ComfyUI/GPU；不能标为真实生成通过。4B 可复用这些 fixture 和快照，但先校验本机文件与额度。
- `test:journeys` 15 项通过，新脚本语法通过；TS/production 未改，复用 Phase 3 typecheck/build 证据。Electron PID 45096 已退出，8156/8188 无监听。额度开工已用 76%，实跑收尾已用 92%；没有重置 credit。影响为 patch，未提交或 bump。

## Phase 4B：bootstrap 真实生成与恢复（2026-09-28）

- 5h 窗口已刷新：开工已用 0%，运行中 24%，验收后 30%。这是账号共享额度，不等于本任务/子 agent 独占 token；具体全树 token 数不可用，没有使用 reset credit。用户要求日志由 Luna 读；仅一个 Luna 有限监看，返回终态/首个异常/证据位置，主 agent 不重复读取完整日志。
- 启动器增加 `--resume <prior-smoke-dir>`：限定本仓库隔离目录及匹配 manifest，拒绝旧 PID 存活、端口占用或保存为运行中的队列，保留 state/身份与输出。真实恢复原 fixture `temp/create-smoke-suKfy3`，通过 AppApi.resetTask 恢复 4A 已取消任务；未重新入队、未重跑 UI prepare。恢复前检查没有外部 Electron/ComfyUI 占用。
- 同一 task `e798cd42-3503-41fb-b679-cf68767b9991`，bootstrap/5 秒，AppApi 启动 ComfyUI 至 ready/app ownership 后执行成功；source asset/version 仍与 Phase 2 一致。新增 History asset `0aa370f1-9549-48a7-8747-2fbd3ac4f53b` / version `2e4548e2-68cb-42ea-a225-7b941dac7fdf`。本次仅一次 GPU 执行，不构建/下载/更改业务代码。
- 实际成片 H.264 864×480、24fps、159 帧/6.625 秒；AAC 32kHz stereo，音频/容器 6.657 秒。真实 History 卡片→播放解码帧推进→返回通过；History duration=6.625，与播放器在一帧容差内；ffmpeg 全片解码通过。没有人工声画质量或性能基准结论。
- 输出登记 3 个物理文件：MP4 663253 bytes、AV payload 6592360 bytes、manifest 1785 bytes；storageKind=app-canonical、continuationStatus=available。manifest role=extend-segment-clean-av，frameCount=141/contextFrames=22，与最终拼接成片 159 帧不同，不能互作元数据。未把 available 宣称为下一轮 AV 复用/managed 已成功。
- 证据均保留在该 gitignored fixture：resume.json、start-comfy.json、generation.json、history-verification.json、task-assets.json、media-probe.json。Luna 定位 `tmp/ai-video-gen-tool/logs/app-2026-09-28.log`：120 行实际模型调用，261 行成功，265 行 TaskComplete；267 行起有成功后退出码 1 / ESRCH 清理告警，随后 QueueRuntimeStopSucceeded。记录为清理阶段疑点，本阶段不把它升级为生成失败或修改 runtime 策略。
- 验证：15 项 journey 测试、typecheck、脚本语法通过；活跃 fixture 重复 resume 与非隔离目录 resume 均正确拒绝。只改开发工具/知识库，patch 级，未 bump/提交，不重复全量 verify。应用空队列后正常关闭，本次 Electron PID 64656 与 CDP 12562/Comfy 8188 的退出在收尾检查确认。没有操作真实用户资产的迁移、删除或设置。
- 尚未覆盖：原生 AV 文件选择器、bootstrap 输出再次续写、managed 长链及 run owner、迁移/删除、Upscale/设置矩阵。Phase 2 时长缺陷及 Phase 3 迁移风险仍未修复。

## Phase 5A：成片时长入库与 Continue（2026-09-28）

- Luna 只读定位与日志摘要；主 agent 修改/验收。根因在 `electron/queue-history.ts`：Create 直接保存请求时长，Extend 使用估算时长。最小接入处是 `electron/services/queue-execution-side-effects.ts`，旧记录中省略 services 的路径应以此为准。
- 新 `video-output-duration.ts` 对最终视频轨进行有 5 秒超时的 ffprobe，缺 stream.duration 时可由 nb_frames/avg_frame_rate 推导；不用音频/容器或 AV 片段时长。新 generation/extension 入库同时更新 asset/version duration，执行快照保持原请求。探针缺失/无效时保留旧估算路径并记录 video-duration-unavailable；Upscale 和已有 History 不批量改写，无持久化结构迁移。
- 新增 7 项行为回归，覆盖真实时长优先、音视频时长区分、帧数推导、缺文件回退及完成任务时快照不变；相邻 focused 为 3 文件/45 项通过。全量 verify 首次遇到 history-batch 测试写死 locale 排序，改为完整标签集合+数量断言，产品排序不变。复验 unit 185 文件/1658 项、integration 6 文件/82 项，共 1740 项通过；typecheck/build/contrast 通过。测试环境有 scrollTo 未实现噪音，未造成失败，不作产品问题。
- 新 build 的隔离实例 `temp/create-smoke-A9HzP5`；应用启动 ComfyUI，缺 prompt→输入→实际按钮 task `583c4368-ebc5-4ace-9762-18e8bc7e5406`。仅一次 GPU 生成：H.264 864×480/24fps/39 帧/1.625 秒，AAC 32kHz stereo/1.625 秒，MP4 119617 bytes，ffmpeg 全片解码成功。Luna 确认无时长回退告警。
- History asset `92aa1a56-ad4d-44ce-84e8-6201e58911a8` / version `718160a2-6b74-41be-84a8-dfb5373d1074` 均保存 duration=1.625。真实播放/返回通过；新增 harness `--continue-source` 点击 Continue 后核对 source IDs、sourceVideoDuration=1.625、trim=0..1.625，全部通过，不再入队或生成。
- 证据：该 fixture 的 ui-enqueue.json、history-verification.json、history-continue.json、media-probe.json；验证日志在 `temp/phase5a`，均 gitignored。本次空队列正常关闭 Electron PID 56000，收尾核对 CDP3298/Comfy8188 无监听。保留真实用户资产和其他预存改动。
- 额度开工已用 35%，完整检查前 53%，真实验收后 76%；账号共享用量，不能当作本树独占 token，没有消耗 reset credit。本阶段 patch 级，未 bump/提交。下一步只做 5B 的隔离迁移场景；旧数据回填、缺探针主机、真实 Extend 新入库和其他模型组合不宣称已实跑。

## Phase 5B：真实迁移与重启复现（2026-09-29）

- 5h 新窗口开工已用 1%，重启验收时 40%；共享额度不是本树独占 token，未消耗 reset credit。继续复用一个 Luna 只读接口/日志摘要；主 agent 只读关键片段，负责隔离、运行、验收。业务源码没有新增修改，无 GPU/ComfyUI 启动，无模型下载或构建。
- 新 copy-asset-fixture.mjs / launcher --asset-source-state 复制 Phase 5A 的 1 个作品/版本、3 个物理文件及草稿引用，拒绝外部路径、活动队列和 managed owner。源 fixture 未发现额外 registry JSON；本轮不声称覆盖独立 registry/run 迁移。明确设置为输出根+images 的受支持布局，不把默认测试目录的 singular image 路径推断混入产品迁移结果。
- 实跑目录 `temp/create-smoke-aZuVOn`；来源 task `583c4368-ebc5-4ace-9762-18e8bc7e5406`，asset `92aa1a56-ad4d-44ce-84e8-6201e58911a8` / version `718160a2-6b74-41be-84a8-dfb5373d1074` 身份未变。初始单文件审计与真实 History 播放通过；Settings→应用与路径→修改目录→保存→应用并迁移，progress completed、3 新文件内容不变、3 旧文件已清理。
- **真实失败**：迁移后 14 处字段引用失效：版本 h3AvAsset / h3ContinuationData.asset 的 ownerPath.absolutePath，以及活动 draft/videoExtensionDraft 中 sourceVideoPath、Motion owner/latent、Continuum artifact/path。重启后为 16 处：版本 artifact.manifest/payload.absolutePath 也回到旧位置；仍指向相同旧文件集合。具体规范化回退入口留给 5C 定位，不把推测写成根因结论。
- 重启后 MP4 的 History 播放/返回仍通过；保留原草稿进入 Create，#source-video readyState=0、MediaError code=4、物理源文件不存在。真实 AppApi.inspectVideoExtensionSource(draft) 返回 route=bootstrap/status=missing/reason=源视频文件不存在。没有先点击 History Continue 修复草稿，没有入队/GPU，也没有把 AV 的单独复用或删除资格标为已测试。
- 证据：migration.json、after-restart.json、before/after-history.json、draft-after-restart.json、extension-inspection.json、acceptance-summary.json。原 `temp/create-smoke-A9HzP5` 的 3 个源文件内容与复制前一致；只清理了迁移副本的旧文件。测试窗口正常关闭，最后 PID 62916 退出，12006/12384/12687/8188 无监听。
- 夹具路径保护及既有 Harness 首轮 12 项通过；最终 asset-migration-harness、video-history-migration、app-harness 相邻回归与 typecheck 通过。真实迁移审计按预期返回非零，不能计为产品通过。开发 Harness/文档 patch 级，未 bump/提交，不重跑无关全量 verify。
- 5C 验收门槛：新 fixture 同一路径迁移→重启，原草稿、History artifact、owner/aliases 均指向存在的新文件；身份不变、原来源不受损；播放与原草稿来源检查恢复。迁移不能在仍存在受支持旧引用时宣告完成并清理旧文件。

## Phase 5C：迁移引用与重启路径修复（2026-09-29）

- 迁移提交通过精确的计划源→目标映射更新 state 的 History、queue、各草稿及嵌套路径；保留身份、prompt、无关路径。原有显式引用处理继续填充仅有相对描述的文件，提交后才清理旧副本。没有改持久化结构或 IPC。
- 首轮新构建 `temp/create-smoke-ORXZ90` 的迁移审计通过，但重启仍有 History manifest/payload 两处失效。Luna 有限读取定位：HistoryQueryService 与 NativeAvArtifactService 都忽略已迁移 absolutePath，按共享 Comfy 输出根重算。新增共用安全解析，保留输出根内与描述一致的已记录 AV 地址；inspection 使用实际读取路径返回 artifact，manifest 内的缓存路径不作为权威。
- 最终 focused 6 文件/65 项通过；verify unit 188 文件/1670 项、integration 6 文件/82 项，共 1752 项通过；typecheck/build/20 组 contrast 通过。新增回归实际移动 AV pair，再执行 History 恢复与内容检查，另覆盖缺缓存恢复、目录/文件名越界及迁移消费者不改 prompt/身份。日志 `temp/phase5c/focused-paths.log`、`verify-paths.log` 由一个 Luna 摘要，主 agent 检查关键 diff 与真实结果。
- 最终 fixture `temp/create-smoke-pxRGrI` 从 Phase 5A 的 A9HzP5 复制；新构建经真实 Settings 按钮迁移→正常关闭→resume。task/asset/version 沿用 5A 身份；3 文件内容保留、旧副本移除，重启后 18 处已登记引用无缺失。原草稿视频 readyState=4/duration=1.625，真实 inspectVideoExtensionSource 返回 bootstrap/available；History 播放解码与返回通过，没有重建原草稿、入队或运行 GPU。
- 证据：migration.json、after-restart.json、draft-after-restart.json、history-after-restart.json、acceptance-summary.json。原 A9HzP5 三个文件 hash 与复制基线一致；本次 Electron 最终 PID 63116 正常退出，CDP 11527/12445/12536 与 Comfy8188 无监听。本次没有启动 ComfyUI；失败 fixture 与报告保留供对照，没有操作真实用户资产。
- 导航/文档收尾后，Harness 相邻 2 文件/12 项再次通过，脚本语法、链接/路径与 diff 格式检查通过；生产代码未再变化，复用上述 verify 与真实实例证据。
- 5C 前次额度耗尽后续验收；本次 5h 检查已用 36%，真实验收后 53%，最终 61%。账号共享用量不能当作本树独占 token，未使用 reset credit。patch 级修复，未 bump/提交；保留预存其他改动。真实 aliases、managed/registry、删除保护及其他目录布局尚未实跑，下一小步独立验收；已有损坏记录不自动批量改写。

## Phase 5D-1：AV 删除保护与未完成的自动闭环（2026-09-29）

- 用户允许再做一个小阶段；5h 开工 63%，运行中 82%，收尾前 95%，未使用 reset credit。沿用一个 Luna 有限只读定位 DOM/接口，主 agent 准备隔离副本和真实操作；没有修改产品源码、运行 GPU或下载模型。
- 真实 History `[data-delete-joint-av]`→`#accept-confirmation` 在 `temp/create-smoke-wwkBUu` 提示 JointAV 仍被 draft:draft、draft:video-extension-draft 引用，拒绝物理删除。对应 AV status 保持 available，来源视频仍在。保护文件校验不是完整删除验收。
- 新实验脚本 `scripts/harness/asset-delete-smoke.mjs` 限定仓库 temp/create-smoke-*、launcher manifest、空队列、canonical owner、无 aliases，并逐路径验证物理归属；预期通过实际清空草稿和 History 确认完成删除，支持重启只读检查。当前报告仍失败：wwkBUu、mf9HE9 等待确认控件超时；加入详情媒体就绪等待后 LlRhDz 到达确认阶段，但错误 toast 观察超时。两个 RAF 不能解决全部时序问题，尚无足够证据断言产品事件缺陷或纯 Harness 根因。
- 三个 fixture 的 deletion.json/delete-baseline.json/protection-files.json 保留失败和完整性证据；全部三个文件均与操作前一致，没有成功删除或重启后 missing 的证据。不要放宽断言、绕过 UI 或重复执行已写 baseline 的 --delete；优先用当前实例只读定位，需重新执行完整旅程时复制新 fixture。
- 本阶段未完成“解除引用→删除→重启”闭环。应用通过 window.close 正常退出；最终 PID 33424 与 CDP5898/6503/6653/Comfy8188 在收尾复查。仅开发工具草稿/任务记录，patch 级未 bump/提交；复用 5C 生产 build/verify，不重复全量检查。

## Phase 5D：AV 删除闭环完成（2026-10-03）

- 开工读取当前 diff；新增的 LoRA/图片/队列等其他工作保持原样。本轮仅修改删除 Harness 和知识库，不修改生产删除逻辑。重新 build/typecheck 当前工作区通过；focused history-services/history-delete/asset-migration-harness/app-harness 共 4 文件/50 项通过。一个 Luna 只读定位和日志摘要；没有重跑不相关的全量 verify/GPU。
- 确定原因：脚本观察 `.toast`，当前通知实际是 `#app-flash.visible[data-kind=error] [data-flash-message]`。CDP 支持 Promise，确认事件在 overlay 渲染后同步绑定；不再以两帧等待当作根因修复。现在使用可见、无遮挡按钮的真实鼠标事件，等待 History 媒体就绪，读取实际错误通知。早期确认超时未独立证明产品缺陷，最终端到端交互已通过。
- 新构建副本 `temp/create-smoke-PukuZF`：真实 History 删除确认被活动 draft 与 videoExtensionDraft 共享引用阻止，文件哈希/AV available 保留；真实 Create 清空草稿后再经 History 确认删除，manifest/payload 消失，MP4 内容、task/asset/version 身份保留。重启后 status=missing，AV owner、嵌套 owner、Motion path 和两份草稿来源均清除；以原草稿做只读来源检查返回 bootstrap/missing。History 实际播放解码/返回通过。没有重新入队/生成。
- 证据：deletion.json、delete-baseline.json、after-restart.json、after-restart-final.json、history-after-restart.json、acceptance-summary.json；构建/测试日志在 temp/phase5d。A9HzP5 原始三文件 hash 与复制基线一致。诊断副本 5ZcZbW 和先前失败报告保留，不伪造通过。
- 新 Harness 的成功删除与重启检查已验证，包括 owner/草稿清理断言；语法、文档链接与 scoped diff 格式检查通过。正常关闭所有本次测试窗口，最终 PID 42100 与 CDP9858/10102/10221/10498、Comfy8188 均无残留监听；没有启动 ComfyUI。patch 级未 bump/提交。
- 5h 开工 3%，实跑后 24%，最终审计时 34%；账号共享用量，非本树精确 token，未使用 reset credit。5D 完成，但不扩称单版本/整作品删除、queue/其他版本共享引用或 managed owner 已实跑。剩余两个大主题、五个小步以 Resume 下表为准。

## Phase 5E-1：整作品删除与持久化（2026-10-03）

- 用户要求查看剩余额度再推进，开工已用 55%，真实删除后 72%，收尾 86%；本步限定整作品删除的单版本/canonical AV/共享草稿场景。一个 Luna 只读定位与日志摘要，主 agent 修改 Harness 并验收；无生产源码修改、GPU或模型下载。
- `asset-delete-smoke.mjs --delete --whole-asset` 复用物理归属检查、真实鼠标和 app-flash 错误提示；baseline 保存删除种类，重启默认按记录种类只读检查，旧 AV baseline 无 kind 时仍按 AV-only 处理。没有放宽单作品/单版本/无 alias/空停止队列限制。
- 新副本 `temp/create-smoke-WhZQ2j`：真实“删除视频和记录”被 draft:draft/video-extension-draft 引用阻止，记录和文件内容保留；真实清空后再次确认，三个文件及 History 记录移除，详情自动回历史列表。重启默认审计通过，空列表可达，原来源检查为 bootstrap/missing/源视频文件不存在。没有把完成任务 queue 保留语义算作本次覆盖，fixture queue 本来为空。
- 相邻 AV-only 回归在独立新副本 `temp/create-smoke-ZtPTtI` 实跑通过：同样先阻止、清空后只删 AV，视频/身份保留。两个副本的来源 A9HzP5 三文件 hash 都与复制基线相同，证据在各自 deletion.json/source-integrity.json；整作品重启报告为 after-restart.json。详细日志位于 temp/phase5e。
- Harness focused 2 文件/12 项通过，语法及文档链接/格式检查通过。复用 5D 当前 build；检查 src/electron 的 TS/HTML/CSS/JSON 无晚于该 build 的输入，不重复全量 verify。未承诺全部未提交工作均通过全量测试。
- 正常关闭本次 PID 52368/13172/10208，CDP13816/13976/14054 和 Comfy8188 无监听。本轮 patch 级、未 bump/提交；保存其他 dirty 改动，未操作真实用户资产或消费 reset credit。5E 尚未全完成，下一步为 5E-2。

## Phase 5E-2：多版本删除、queue 保护与剩余版本回流（2026-10-04）

- 本步只改 Harness、测试与文档，生产删除逻辑无新增缺陷。使用一个 Luna 做有限源码定位和一次最终日志摘要，主 agent 检查决定性服务分支、实现并验收。5h 开工已用 14%，中途 49%/60%，收尾文档前 79%；账号共享用量，不是本树精确 token，未用 reset credit。
- 新增 `copy-version-fixture.mjs`、`version-delete-smoke.mjs` 与两种启动参数；从 A9HzP5 复制隔离媒体及 AV，再构造两个版本、清空草稿。独立文件模式用生产任务工厂加入一个 waiting Upscale 引用；共用文件模式 queue 为空。合成派生记录使用原视频副本，不算真实 Upscale 输出或 UI 入队证据。原有单作品/canonical AV 归属保护保持。
- `temp/create-smoke-kY0zhD`：真实切换两个版本，默认目标删除被 `queue:deac651c-6b3c-4a3d-b33b-021c9473ed8e` 阻止且所有文件/记录不变；真实 Queue 移除该任务，再删除成功，目标 MP4/版本移除，原始 MP4/AV 和身份保留，默认与当前播放自动回原始版本。重启 after-restart.json 通过，history-after-restart.json 验证 1.625 秒实际播放帧推进/返回。
- `temp/create-smoke-jaQdEe`：两个版本共用 MP4，删除提示精确另一个 `history:<asset>:<version>` 引用；两个版本、default、MP4/AV 保留，重启后媒体可读与文件完整性审计通过。这里未另做播放帧推进测试。共享服务先过滤 unlink 列表后仍对完整 referencePaths 检查 exclusivity，不能误记成“只删版本记录”。
- 两份 source-integrity.json 均核对 A9HzP5 原始三文件不变。首次 DDSNmg 已正确阻止共享删除并移除队列，但第二次确认因 UI 尚在切换而超时；失败报告保留。提取 `fixture-ui.mjs`，等待控件位置稳定/无遮挡并避免重复版本选择后，用新副本完整通过。旧整作品 WhZQ2j 只读回归 helper-regression.json 通过。
- focused：version-delete-harness、asset-migration-harness、history-delete、history-services、app-harness 共 5 文件/52 项通过；typecheck 通过。复用 2026-10-03 build，已检查 src/electron 生产输入无晚于 build 的变化；不重复 full verify/GPU，不宣称其他 dirty 修改均通过全量检查。新夹具两项测试验证物理副本、冻结队列引用、无额外 AV owner 与共享路径。
- 正常关闭本次 PID 14288/2548/56852/2420/63288/50772；对应 CDP9022/9502/9751/9896/10002/10137 与 Comfy8188 均无监听。未启动 ComfyUI、执行 GPU、下载模型或操作真实用户资产。patch 级，未 bump/提交，其他 dirty 改动保留。
- 5E 按限定场景收口；两个以上版本排序、运行中 queue、批量/部分失败、多版本整作品删除与 managed owner 尚未实跑。下一步 5F；余下四个小步以 Resume 为准。
- 收尾：6 个脚本语法、4 份文档共 32 个本地文件链接、launcher help、assets guide 新测试入口及 git diff --check 通过；相关流程图、runbook、HANDOFF 和 Unreleased 已补齐。最终 5h 已用 87%（剩余 13%），本轮至此结束。

## Phase 5F-1：managed 来源门槛与用户恢复（2026-10-04）

- 开工 5h 已用 2%，中途 34%/53%；未使用 reset credit。复用一个 Luna，先做有限入口地图，真实失败后一次纠正包确认 source guard、19 份 repo 隔离 state 和简明日志；没有新增子 agent/孙 agent。父级未展开大日志。
- 确认 build 仍为 2026-10-03，src/electron 生产输入无较新修改；初始无 Electron/Python，Comfy8188 空闲，4090 利用率 0%。只使用已构建应用，未启动 ComfyUI、执行 GPU、下载模型或更改生产代码。
- 初次在 `temp/create-smoke-Z11HHl` 显式设 managed mode、移除 bootstrap artifact，预期恢复入队，却真实失败。managed-prepare.json 保留：视频已读，但 `history-artifact-service.ts` 明确返回 missing/“没有已接受的 Continuum Run 前缀”。不是运行时离线问题，也不能用添加 mode 开关/直接 AppApi enqueue/空 sequence 来绕过。之前仅检查任务工厂能建立 pending sequence 的判断不完整，已纠正。
- 有限来源盘点：19 个 temp/create-smoke-* state 无 acceptedChunks>0；其中位于 fixture 内的 8 个 output roots 无 managed registry/run storage 文件。suKfy3 bootstrap 是 canonical AV，不含 managed sequence。没有读取/迁移真实用户 run；此结论仅限这些隔离样例，不代表机器上完全没有用户 managed 资产。
- 新增 `probe-managed-entry-smoke.mjs`，从严格 canonical 复制器创建全新 `temp/create-smoke-grE0YE`。AppApi 仅初始化输入；真实 UI 缺视频阻塞→补视频后无前缀仍阻塞→键盘选择 Motion Context→真实鼠标入队。task `13988f0e-ed31-4037-bbd7-dea627ee30f9` 是 R2V extension，source asset/version 与 A9HzP5 相同，workflow 为 minimax_h3_r2v_extend_api.json，实际快照 duration=5（模型切换后的值），无 managed sequence。没有把输入 fixture 的 duration=4 冒充任务值。
- managed-entry.json 保存精确 source inspection/disabled reason/task ID；cleanup.json 验证实际 Queue 移除等待任务、源与副本三文件一致。正常关闭 PID56016/57016，CDP4646/5641/Comfy8188 无监听；保留首次失败证据，未操作原始资产。focus emulation 已记录。
- UI 回归新增 managed missing→Motion Context 恢复→入队断言；现有 managed inspector 测试补无 sequence/零 acceptedChunks 拒绝，再保留 accepted source available 对照。最终 focused 4 文件/36 项与 typecheck 通过（基线为 35 项），日志 temp/phase5f；脚本/流程图/导航/资产文件边界同步更新，不重跑无关全量 verify。patch 级，未 bump/提交，其他 dirty 工作保留。
- 5F-1 完成，5F 整链未完成：5F-2 必须有真实已接受 sequence/receipt、run manifest/payload/project、owner/alias、registry sidecar 及原始 firstFrameSource 的完整物理副本。若新增 bootstrap→managed 转换会改变产品语义，先厘清当前支持范围；不可伪造 acceptedChunks 或放宽保护。仍剩 4 个小步的交付范围，5G 可独立推进。
- 收尾：2 个脚本语法/帮助、extend guide、5 份文档 41 个本地文件链接及 git diff --check 通过；本轮目标 diff 无意外删除，进程/端口复核为空。最终 5h 已用 63%，剩余 37%，属于账号共享额度；本小步结束，不展开 5G。

## Phase 5G-1：图片库归档、孤儿保护与重启（2026-10-04）

- 用户要求用剩余额度再做一点，开工 5h 已用 67%。同一个 Luna 有界读入口，并只修改 tests/image-asset-library.test.ts：旧扫描有两个孤儿，清理前一张加入 imageDraft 引用后必须保留，另一张删除。主 agent 负责真实 Electron/脚本/文档；无新增代理、无大日志回读。
- 新增 `image-library-smoke.mjs`：严格空队列/空 History、匹配 launcher 和物理根，所有 PNG 在隔离 fixture 内。AppApi 准备一个库外原图引用与两个库内孤儿；实际 Settings→整理归档复制到 sources/<sha256>.png 并更新草稿，原图字节保留。旧 UI 孤儿选择不刷新，AppApi 为其中一张新增 endImagePath，再两次点击清理按钮；新引用保留，仅另一孤儿删除。
- 最终样例 `temp/create-smoke-yivWks/image-library-retry.json` 全部通过，未运行 GPU/ComfyUI或修改生产代码。首次 zM9oXM 因设置未改动、保存按钮禁用而假超时，修正为启用才保存；第二次初连 CDP 未就绪 fetch failed，没有创建 baseline，等待就绪后重试成功。旧失败报告均保留，不误报为产品缺陷。
- 额度已用 94% 后，文档收尾被自动审批因用量耗尽拒绝执行。用户继续后额度窗口恢复到 1%，重试成功；本任务没有调用重置卡。恢复时确认生产输入仍未晚于 2026-10-03 build，复用构建和 2 文件/10 项 focused、typecheck 证据，没有重复全量 verify。
- 追加 `--audit <成功报告>`：resume 同一副本，只读核对活动 draft 与 imageToVideoDraft 引用、原图/归档图/新引用文件保留、已删孤儿不恢复，扫描无缺失/无孤儿。image-library-after-restart-final.json 通过；最初审计把 archiveCandidates 预期为 0 而失败，生产实现明确库内非 canonical 文件仍可待归档，修正为 managedReferences=2/archiveCandidates=1。旧报告保留，此为审计认知修正，不改生产计数。
- UI 报告注明 focus emulation 和 AppApi 输入准备，没有原生文件选择器/真实生成/视觉质量结论。首次 PID40876、最终 PID42788、重启 PID35120 均正常关闭；仅保留 gitignored fixture/日志，未改原始用户资产，patch 级未 bump/提交。
- 5G-1 已完成限定闭环；清理开始扫描之后新增引用的并发窗口尚未验证，不能把本次“操作前新增引用”推广到它。下一步 5G-2 在有限并发回归与旧目录布局中选一项，复现实际缺陷再修；仍剩 5F-2/5G-2/6A/6B 四个交付小步。
- 收尾：脚本语法/帮助、4 份文档 34 个本地文件链接、git diff --check 通过；测试目标 diff 仅新增 31 行回归。PID40876/42788/35120 与 CDP1985/2793/9817、Comfy8188 复核无残留。恢复后的 5h 已用 20%（剩余 80%），为账号共享用量；上次未执行的文档/交接已补齐。

## Phase 5G-2：并发清理与保存草稿保护（2026-10-04）

- 实际缺陷：service 在目录解析前取旧快照，清理扫描后也未重新取引用；referenceHandles 遗漏 imageToVideoDraft/videoExtensionDraft。新提交或非活动草稿中的图片可被误删。原实现的失败证据保留在 temp/phase5g2/{cleanup-red,cleanup-windows-red,saved-drafts-red}.log。
- 修复：内部 FS port 接收 getCurrentState；每个候选之间让出事件循环，随后同步检查最新引用与 unlink，中间无 await。队列开始运行即停止后续删除，已完成的删除不回滚。扫描/归档/清理纳入保存草稿，归档提交只更新相关路径，不覆盖无关字段。AppApi/IPC/持久化结构不变；不是外部文件系统锁。
- 最终 2 文件/14 项 focused 通过；temp/phase5g2/verify-final.log：unit 189 文件/1682 项、integration 6 文件/82 项，共 1764 项，typecheck/build/20 对 contrast 通过。包含目录解析、两文件间新引用、队列中途启动、保存草稿归档保护；旧哈希层级整理已有单测覆盖。
- image-library-smoke 增加 --during-cleanup：真实二次确认开始扫描后，经进度订阅/AppApi 提交新引用，断言 saved 且 cleaningBeforeSave=false。256 个隔离空目录提供异步扫描窗口，无生产测试钩子。随后 reload 同步 renderer，再实际切换模式验证非活动草稿保护/恢复；输入准备仍为 API，非原生选择器证据。
- 最终 temp/create-smoke-l1HW0X/image-library-concurrent.json 与 after-restart.json 通过：原图、归档图、新引用保留，真正孤儿删除。Mh5ssc 初次缺扫描进度，修复 report 转发后重跑 verify；eRg4ht 的 API 注入后视图未同步导致模式切换检查失败，修正 Harness reload，新副本完整通过。失败报告保留。
- 一个既有 Luna 有界复现/日志摘要，主 agent 实现并验收；5h 从约 24% 经 51%/68%/84% 到收尾 97%（共享账号），没有使用重置卡。未启动 ComfyUI/GPU、未改真实用户资产。PID13924/53736/41868/30184 及 CDP14199/14463/14629/14769、8188 已无进程/监听；保留隔离证据。patch 级，无 bump/提交。
- 5G 限定交付完成；真实覆盖平坦非标准命名与 canonical 路径，旧分层目录为单测证据，特殊权限/符号链接/外部写入未穷举。下一步 6A；剩 5F-2、6A、6B 三步。
- 2026-10-05 收尾：5h 窗口恢复为已用 1%，重置卡仍 3 张，未消费卡；保留原验证证据，不因文档收尾重跑全量测试。

## Phase 6A：最小原生 INT8 视频 Upscale（2026-10-05）

- 一个既有 Luna 有界读取生产入口/日志；主 agent 负责隔离资源、Harness 和实际操作。沿用 5G-2 已验证 build，无生产代码改动；4 文件/73 项 Upscale focused、1 文件/9 项 Harness 检查通过，未重复全量 verify。
- 新增 scripts/harness/upscale-smoke.mjs；仅接受匹配 launch.json 的单版本物理副本。真实 History→提升分辨率，键盘切换 seedvr2/seedvr2-native-int8 验证显存策略控件变化，选择 720p。临时移开副本 MP4，点击出现“源视频文件不存在”且零任务；finally 恢复后点击生成唯一 waiting task。已有 baseline 拒绝重做，--audit 为只读持久化核对。
- 本机 fixture temp/create-smoke-kck6xb；task 578844cc-8895-45dc-abda-ae4e0e2c5afa，asset 92aa1a56-ad4d-44ce-84e8-6201e58911a8，source version 718160a2-6b74-41be-84a8-dfb5373d1074，derived version b2acad3f-c16e-4672-8421-0e0e642c08d5。真实线上 scan：目标 available/runtimeReady/runtimeVerified 均 true；应用启动 ComfyUI，串行一个任务完成。
- 输出 H.264 1296×720、24fps、39 帧/1.625 秒，AAC 32kHz stereo/1.625 秒，ffmpeg 全片解码 exit 0。真实 History 播放帧推进、元数据/返回、同作品新增默认 upscale version 与准确 lineage 均通过。原 version 深比较及原 MP4/AV pair 哈希保留用于完整性；不以哈希代替播放或用户操作。
- 保存 upscale-enqueue、scan-online、upscale-history、upscale-audit、upscale-media-probe、upscale-after-restart、upscale-restart-playback JSON。重启审计/播放通过；focused/log 位于 temp/phase6a-focused.log 与 temp/phase6a/。首次临时诊断在点击后立即断开 CDP 导致误判弹窗未开；同一聚焦会话等待挂载后正常，不是产品入口缺陷。
- Luna 核对实际 SeedVR2Preprocess/TemporalChunk/Conditioning/TemporalMerge/SaveVideo，模型 seedvr2_3b_int8_convrot 与 seedvr2_ema_vae_fp16，VAE cuda:0，采样峰值约 14973 MiB；这是本机一次运行数据，不是性能保证。日志有切片规划但无中断/恢复证据，不宣称长片 checkpoint 已验。
- 成功后仍出现既有 Comfy 清理告警（exit 1、已退出 PID 的 taskkill、kill ESRCH），同 Phase 4B，未升级为输出失败或在本轮修改 runtime 策略；实际 PID54504/27088、CDP7002/8052、Comfy8188 均已退出。未修改真实用户资产/设置、未下载模型；patch 级工具文档，无版本 bump/提交。
- 5h 开始已用 7%，运行中 42%，重启验收后 56%，文档收尾 68%（剩余 32%）；未消费重置卡。脚本语法/帮助、缺 audit 参数拒绝、39 个本地文件链接及 git diff --check 通过，自有进程/端口再次确认退出。6A 限定闭环完成；H3 原生/其他 provider、长片恢复和视觉质量仍为明确覆盖缺口，由 6B 汇总，不新增顶层 Phase。下一步 6B；5F-2 继续等待有效来源。
