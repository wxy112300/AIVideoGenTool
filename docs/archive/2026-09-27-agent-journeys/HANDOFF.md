# Harness / Agent Skill 交接入口

- 类型：已验收任务的历史交接索引；状态：archived；更新：2026-10-08。原计划已关闭，不作为新任务默认入口；当前操作从runbook/Skill开始，历史范围查TASK。
- 状态与剩余范围的唯一权威：[TASK 的 Resume / 阶段表](TASK.md)。本文件不另维护进度台账；旧阶段负结果按日期保留，不覆盖最新完成记录。
- 执行期Git快照：`main` / `faac011`及大量未提交工作；归档时用户授权将全部当前改动随0.64.3提交推送。历史快照不是后续基线；先检查git状态，不按本文件推断所有权。

## 先读这些，复核最终保护与收尾证据

1. 根 [AGENTS](../../../AGENTS.md) 和仓库 [local-video-studio Skill](../../../.agents/skills/local-video-studio/SKILL.md)。
2. [TASK](TASK.md) 的 Resume、正常系统关闭与旧Run保护最新增量及剩余表；所有限定交付已完成，6B与已验证managed闭环不用重做。
3. [产品旅程图](../../runbooks/PRODUCT_JOURNEYS.md) 的 Settings 分支、[AppApi 操作手册](../../AGENT_ELECTRON_API_RUNBOOK.md) 和相关验证分级；需要文件归属时读 [资产地图](../../runbooks/ASSET_LIFECYCLE.md)，继续 5F 时才读 Continuum 分支。
4. 当前无剩余必交付项。后续修改先选择受影响的旅程；空闲原生退出复验按runbook的正常系统关闭路径，核对同session日志/PID/监听。旧Run保护、managed/GPU、6B均不要重跑；实库授权/备份见TASK，不复扫旧19份夹具。

目标始终是用户能否完成操作：UI 门槛 → 实际按钮 → AppApi → 持久化/物理文件 → 重启 → History 回流。单测数量、hash 相等或 API 请求返回，均不能单独证明整条旅程可用；hash 仍用于复制完整性与原文件保护。

## 已完成部分的定位

| 已完成范围 | 修改/证据入口 |
| --- | --- |
| 架构/旅程图、Skill、真实 Electron Harness；Create、Motion Context、Continuum bootstrap 限定实跑 | [产品旅程图](../../runbooks/PRODUCT_JOURNEYS.md)、TASK 对应阶段；`scripts/app-harness.mjs`、`scripts/harness/` |
| 5A 新视频 History 时长修复 | `electron/services/video-output-duration.ts`、`queue-execution-side-effects.ts`、`electron/queue-history.ts`；不批量回填旧记录 |
| 5C 迁移草稿/AV 引用及重启修复 | `src/infrastructure/video-history-migration.ts`、`settings-service.ts`；`src/core/native-av-artifact-paths.ts` 供 History 恢复及 AV inspection 共用 |
| 5D AV 辅助删除完整闭环 | `scripts/harness/asset-delete-smoke.mjs`；共享草稿阻塞→真实清空→删除 AV→重启，MP4/身份保留，AV/owner 清理正确，History 播放/返回通过；生产删除逻辑未改 |
| 5E-1 整作品删除限定闭环 | 同脚本增加 `--whole-asset`，共享草稿阻塞→清空→删除 MP4/AV/记录→重启空列表通过；本步只覆盖单版本/canonical AV/空 queue，多版本与 queue 保护见下一行 |
| 5E-2 多版本删除限定闭环 | `version-delete-smoke.mjs`：waiting queue 保护→真实移除任务→删除默认版本→剩余原始版本重启播放；共用 MP4 的两个版本互相保护并跨重启保留。合成版本/工厂任务，不算 Upscale 生成证据 |
| 5F-1 managed 来源门槛与恢复 | `probe-managed-entry-smoke.mjs`：缺视频/缺 accepted Run 前缀阻塞，真实键盘改 Motion Context 后鼠标入队。该步没有 managed 生成；正向闭环见下一行 |
| 5F-2 当前环境真实 managed 续写/旧Run保护 | `managed-history-audit.mjs`；History实际1→2→8秒与保护后2→3→12秒。`comfy-ui.ts`绑定冻结前缀；`comfy_nodes/LocalVideoStudio-H3/managed_prefix_guard.py`在实际注册的官方sampler命名空间/Run锁内、写manifest前拒绝不兼容旧Run；源码入口、最终验证/重启/原生退出均查TASK最新增量 |
| 5G-1 图片库归档/清理保护/重启 | `image-library-smoke.mjs`：UI 归档保留外部原图，旧孤儿选择中新引用受到保护，仅真正孤儿被删；--audit 核对重启引用与文件。2 文件/10 项 focused、typecheck 通过 |

5G-2 修复与证据入口：`electron/services/image-asset-library-service.ts`、`electron/ports/image-asset-library.ts`、`src/infrastructure/image-asset-library.ts`；`image-library-smoke.mjs --during-cleanup` 及 `--audit`。当时生产状态通过 1764 项 verify；最终集成 1769 项 verify 及 Python 9 项见 TASK 最新保护增量。

历史 5D 基线为 **2026-10-03 build/typecheck + 4 文件/50 项 focused + 真实 5D 闭环**；5E-1 只改 Harness/文档，新增真实整作品删除/重启及 AV-only 回归、2 文件/12 项 Harness 检查通过。5C 的 1752 项全量 verify 是先前文件状态的证据。新产品修改按验证分级重新选择检查。

5E-2 仅改 Harness/测试/文档：5 文件/52 项 focused 与 typecheck 通过，两个真实场景及重启审计、独立 MP4 场景剩余版本播放/返回通过，旧整作品脚本只读回归通过。复用同一生产 build，未再运行全量 verify/GPU。

5F-1 补充真实 source gate 和恢复证据，4 文件/36 项 focused、typecheck 通过；没有生产代码或 GPU 修改。不要把最初“没有 selector”的判断继续当缺陷：`history-artifact-service.ts` 明确禁止新建 Run 冒充已有前缀续写。

## 6B 已限定收口：按证据边界复用

- **最新先读 6B-5/6/7**：[TASK覆盖矩阵](TASK.md#settings-coverage) 是已完成/未覆盖的唯一状态入口；[设置探针表](../../AGENT_ELECTRON_API_RUNBOOK.md#settings-probes) 选择方法。新增驻留模型切换、真实 running Attention 与单作品 Prompt 保护已收口；不重做旧闭环或自动扩全部组合。
- **Prompt 入口**：settings-prompt-smoke 的默认/--resident/--history 各有边界；当前 provider 固定 ComfyUI，日志 promptModelId/promptBackend 才是路由，request.modelId 是生成模型。保存不立即卸载旧驻留租约，下一请求比较/切换；非空 History 已补单作品保护，Prompt 请求运行中保存仍未验。

- **H3 设置入口**：6B-2 settings-queue 验 waiting 即时更新；6B-6 settings-running 验真实 running 保存/成片/播放/重启。其他三项与 failed 仍为服务测试。finish 仅接着核对已记录的真实 running-save，不重提；重启差异只按明确内存兼容/实际 stat 比较。

- **6B-1 已收口**：video/R2V 禁用 Spectrum；旧 fixture 继承 I2V balanced，启动归一化 off 是预期行为。合法 extension 的 temp/create-smoke-4KAJjN/settings-save/settings-after-restart 均通过，严格完整草稿比较未放宽；旧失败保留，不重跑默认值保护。

- 后续改设置先查额度、目标diff和探针边界；已有相同输入检查不重复，生产输入或目标改变时才重验。剩余设置组合/Prompt运行中/媒体/质量缺口如实保留，不自动扩成新阶段。
- 清理用 close-fixture-smoke.mjs，先 AppApi 停本次 app-owned ComfyUI，再 JS close 并复核资源。直接 window.close 曾绕过原生 close hook，残留本次 Python；最新 cleanup-api.json 的 API清理通过，不是原生退出验收。
- 早期原生UI工具初始化失败诊断保留；最新已通过自有主窗口 CloseMainWindow 正常系统关闭，完整Electron退出链/自有ComfyUI退出及129作品/草稿保留见 temp/phase-native-close-20261008/native-close-audit.json。API/JS清理仍不等同该证据；活动任务/remote退出未验。
- Skill/知识库已收口。6A 仅真实生成 SeedVR2 native INT8 短片，普通 SeedVR2 只有控件切换；H3 native、其他 provider、长片中断恢复与画质不算通过。实际缺陷按分级修复，不改保护来适配夹具。
- 6A 本机证据：temp/create-smoke-kck6xb/ 下 upscale-enqueue、upscale-history、upscale-audit、upscale-after-restart、upscale-restart-playback 和 upscale-media-probe；完整配方见 runbook 的 upscale-smoke。73 项 focused + 9 项 Harness 检查通过，未改生产/重复 verify。既有退出清理 ESRCH 告警保留，实际进程端口已退出。
- 5G-2 当时生产状态通过 14 项 focused 与 1764 项全量 verify（含 build/typecheck/contrast），以及真实并发清理/模式切换/重启；最终集成验证见 TASK。temp/phase5g2/verify-final.log 和 temp/create-smoke-l1HW0X/{image-library-concurrent,after-restart}.json 为本机证据。
- 图片清理复跑用新空副本加 --during-cleanup；重启用 --audit 指向成功报告。AppApi 准备输入后，单独验证 renderer 模式切换前先 reload。只读摘要，保留失败报告，不重复已有完整检查。

## 5F-2 复验前提（已完成，按需复用）

- 原 19 份隔离样例缺 accepted 来源是历史阻塞，已由后续真实 Run 证据解决；不重扫旧样例。正向 managed、旧 Run 前置拒绝、重启与原生关闭的最终证据均从 TASK 最新增量定位。
- 修改 managed 保护时运行 `guide extend`：TS 检查绑定的冻结 head/accepted 和 schema，另运行 `python -B tests/python/test_h3_managed_prefix_guard.py`。focused 不代替真实来源、按钮、生成或文件保护证据。
- 复验仍需真实 accepted/receipt、firstFrameSource 和 run project/manifest/payload；不伪造前缀或放宽资格。默认使用物理隔离来源及独立 userData；实库操作须符合用户明确授权、备份和影响范围。
- 真实路径为 History Continue → 缺输入/恢复 → 按钮入队 → 应用启动 ComfyUI → 最小生成 → History 播放/返回 → 重启；核对作品/版本、owner/alias/registry。失败后核对磁盘，不把报错等同未写入；前置拒绝保护不保证任意后续失败回滚。

## 可复用的本机素材与报告

这些 `temp/` 路径是 gitignored 的本机证据，换机可能不存在；接手先确认，不能当作已提交资产。只读或复制来源，勿迁移/删除原始 fixture。

| 路径 | 用途 |
| --- | --- |
| `temp/create-smoke-A9HzP5/user-data/studio-state.json` | 未损坏的单作品/视频/原生 AV 来源；优先从它创建全新副本 |
| `temp/create-smoke-pxRGrI/` | 5C 迁移成功与重启/原草稿/History 证据 |
| `temp/create-smoke-PukuZF/` | 5D 成功删除后的状态：deletion、after-restart-final、history-after-restart、acceptance-summary JSON；AV 已有意删除，不能作完整 AV 来源 |
| `temp/create-smoke-WhZQ2j/`、`temp/create-smoke-ZtPTtI/` | 5E-1 整作品删除/重启、AV-only 回归；文件已经有意删除，勿当完整来源 |
| `temp/create-smoke-kY0zhD/`、`temp/create-smoke-jaQdEe/` | 5E-2 独立版本删除/重启播放与共用文件保护/重启；deletion 或 protection、after-restart、source-integrity JSON |
| `temp/phase5e2/` | 5E-2 focused/typecheck/真实场景日志；DDSNmg 首次操作超时证据保留，最终成功使用新副本 |
| `temp/create-smoke-grE0YE/`、`temp/create-smoke-Z11HHl/` | 5F-1 成功的来源保护/恢复报告与首次错误成功预期的失败报告；均无 managed 生成，不是 accepted run 来源 |
| `temp/phase5f/` | focused-final、typecheck 与 entry-final 日志；只读摘要即可 |
| `temp/create-smoke-yivWks/`、`temp/phase5g1/` | 图片库成功报告 image-library-retry.json、image-library-after-restart-final.json；focused-final/typecheck 和 UI 日志。不要重复创建 baseline 或清理；只读审计用 --audit 指向成功报告 |
| `temp/phase5g2/`、`temp/create-smoke-l1HW0X/` | 最新 focused-final、verify-final 日志及 image-library-concurrent、after-restart 报告；长文本先过滤或交给 Luna 摘要 |

`asset-delete-smoke --delete` 保存 baseline 后拒绝重复执行。复查已删状态应省略 --delete；完整重跑应新建物理副本。迁移审计要求所有文件存在，不能用于判断有意删除 AV 的状态是否正常。

`version-delete-smoke --exercise` 同样只执行一次，重启省略 --exercise。共用 MP4 会被另一个 History 版本阻止，不能仅根据 unlink 列表过滤推断只移除记录。共享鼠标 helper 会等待布局稳定及无遮挡；避免重复选择已经选中的版本导致确认点击时布局仍在切换。

## 不要重复踩的坑

- 实际应用 API 是 Electron renderer 的 `window.studio`，不是公开 HTTP API；通过 loopback CDP 操作，不新增临时 IPC。
- 删除 Harness 读取 `#app-flash.visible[data-kind=error] [data-flash-message]`。旧 `.toast` 观察器造成假超时，已经修复，不再重启此调查。
- 使用实际可见、无遮挡控件；删除脚本已有鼠标输入 helper。等待详情媒体可读，后台窗口启用 CDP focus emulation，并在证据中注明；不绕过 disabled 或直接调 handler 证明 UI 可用。
- 迁移后先验原草稿，再点 History Continue；重选来源可能掩盖坏引用。清空活动草稿后也要核对对应非活动草稿。
- 仅隔离 state 不够：媒体、AV owner/alias、来源路径也须物理隔离。`--asset-source-state` 会检查归属；不直接用真实用户资产测试迁移/删除。
- 当前工作区还包含其他 LoRA、图片工作流、队列、类型等未提交改动。保留，勿 reset/clean/stash/stage/commit 或覆盖别人的工作；本任务未 bump/提交。
- 最近实跑的测试窗口已正常关闭，ComfyUI 未启动；这是历史事实。接手重新确认进程、端口、dist 与 GPU 归属，勿杀外部进程。未来 GPU 验收离线时应从应用启动 ComfyUI；5E 本身无需 GPU。
- 用户要求控制每个小步成本、期间查 5h 额度，不授权消费 reset credit。当前主 agent 直接负责实现/验收；大量源码/日志可按用户授权交给一个 Luna 有界筛查，父级只读定位片段和结果，不重复展开。遵守当前 AGENTS 的树上限，不开监督链。
- 若 exec 遇到 setup refresh 错误或 apply_patch 遇到 reparse point，按实际工具错误申请所需执行权限；仍使用补丁并保留 CRLF。不要因此重写整文件或覆盖无关 diff。

剩余交付只更新 [TASK](TASK.md)：managed及旧Run前置保护的最终verify/重启、空闲正常系统关闭均已验，无剩余必交付项。测试资源已清理，未覆盖组合以最新Resume为准。
