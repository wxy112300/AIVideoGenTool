# 显存压力卡死 Watchdog
- Status: implementation complete; runtime smoke pending
- Updated / Owner: 2026-09-20 / implementation owner
- Scope / Authority: 为本地、应用管理的 ComfyUI 队列任务增加可关闭、可选 1/5/10/15 分钟的显存压力卡死检测；触发后重启 ComfyUI，并按现有重试次数重跑同一不可变任务快照，耗尽后标记失败并继续队列。详细设计与验收以 [PLAN](PLAN.md) 为准。
- Baseline: `a1dae3c`；建档前工作区干净。当前已有 VRAM telemetry watchdog、任务性能采样、无节点活动超时、ComfyUI 恢复和自动重试链，但没有把“无生产性进展 + WDDM/系统内存压力”组合成主动恢复条件。
- Execution: direct（交给 Luna 后由同一执行者按阶段实现和验证，不拆 agent）

## Resume
- 已确认 / 决定：不能按 `nvidia-smi` 的固定显存容量或单一百分比判定“爆显存”。采用持续窗口内的复合判定：任务无生产性进展是必要条件，同时要求 WDDM 共享显存/预算、主机 RAM/commit/page activity、采样延迟等至少两类相互独立的压力证据；任一有效进展会重置无进展计时。GPU 利用率只是弱活性信号，不能再无限延长压力卡死任务。
- 已确认 / 决定：新增一个 `0 | 1 | 5 | 10 | 15` 分钟设置，`0` 为关闭且默认值为关闭。启用后 watchdog 恢复次数复用 `autoRetryCount`，不依赖通用 `autoRetryFailedTasks` 开关；通用开关仍只控制其他可恢复错误。UI 将该选择器表述为共同的“恢复重试次数”。
- 已确认 / 决定：只有本地、应用管理的 ComfyUI 可执行 watchdog 重启。远程 endpoint 显示不可用且不主动中止远端 prompt；现有连接/服务超时仍照常处理。
- 已完成：纯状态机与压缩时间 trace fixture、`0 | 1 | 5 | 10 | 15` 设置/迁移/UI、claim-time policy、单一任务资源采样、Comfy productive-progress、图片/视频/SeedVR2 阶段边界、`memory-pressure-stall` 精确恢复、应用管理本地运行时检查、有限重试与诊断摘要均已落地；默认关闭，未修改现有普通 VRAM watchdog 的 abort 语义。
- 2026-09-22 用户反馈修订：将 `nvidia-smi` 专用显存余量接入 Watchdog 判定；余量 `< 1 GiB` 记录一次预警，`< 800 MiB` 进入持续卡死监测，恢复到 `>= 1 GiB` 后解除低余量状态。修正 Windows counter 的计算机名前缀匹配，并给 `nvidia-smi` 加 5 秒超时（PowerShell counter 采样保持 5 秒超时），避免采样器在驱动卡顿时永久占住检查循环。
- 下一步 / 限制：尚未取得真实近满正常 trace、共享显存/分页卡死 trace，也未做隔离 Electron + ComfyUI + GPU smoke；直接专用显存信号来自 `nvidia-smi`，WDDM adapter LUID/Budget helper 仍未加入。真实样本前不宣称阈值跨机器验证。

## Implementation and resources
- 修改范围 / 保留行为：预计涉及 `src/core/vram-stall-watchdog.ts`（新纯状态机）、`electron/services/performance.ts`、`electron/services/vram-watchdog.ts` 或新的任务采样协调器、`electron/services/comfy-ui.ts`、`electron/queue-executor.ts`、`electron/queue-recovery.ts`、`src/core/recovery.ts`、Settings types/defaults/store/form/page/i18n 及相邻测试。复用既有 QueueTask ID、不可变执行参数、`automaticRetryAttempt`、本地 ComfyUI 生命周期、pause boundary 和 history 身份。
- 必要步骤（不自动拆成agent）：完成 trace 驱动判定器；扩充低开销 Windows 压力采样；加入设置/迁移/UI；在任务 claim 时冻结 watchdog 策略；把触发映射到唯一的 `memory-pressure-stall` 恢复分类；恢复成功后重排原任务，达到上限后保留失败并继续下一项；写入结构化诊断。
- 文件、build/GPU/服务归属和释放：单一实现者拥有上述重叠文件。单元测试不启动 ComfyUI/GPU；真实验证必须使用隔离 state/media，且只停止本次应用管理的本地 ComfyUI 进程树。不得杀远程服务、其他任务的 ComfyUI 或宽泛 `python.exe`/GPU 进程。
- 验收：健康高显存任务、长节点、编码/保存、遥测缺失、远程 endpoint 均不得误触发；模拟卡死在所选窗口到期后只恢复一次；重启成功按同一 task ID/快照重试；达到 N 次后失败并继续下一任务；重启失败则停止队列并给出可操作错误；暂停边界、取消、关闭应用和重启恢复保持一致。执行 focused Vitest + `npm.cmd run verify`；可用时补真实近满与压力 trace/replay 以及隔离 Electron smoke。

## Evidence / handoff
- 关键结论及来源/版本/证据路径：代码现状与外部来源记录在 PLAN 的“调查结论”和“信号模型”。Microsoft 的 DXGI 文档说明 `CurrentUsage > Budget` 可导致 stutter/performance penalty；Windows 内存文档说明应结合 available/commit 与 paging activity，不能把单个计数器当充分条件；NVIDIA 的 oversubscription 资料说明超额工作集可能产生页迁移和数量级性能下降。
- 实际命令、结果、对应文件状态：本轮修订已通过 `npm.cmd run typecheck`、Watchdog/Settings/Store focused Vitest（3 files / 53 tests）、`git diff --check`、`node --check src/core/vram-stall-watchdog.js`；完整 `npm.cmd run verify` 通过（unit 182 files / 1635 tests，integration 6 files / 82 tests，build 与 `verify:ux-ui-contrast` 均通过）。另用当前 Windows 机器实测 suffix counter 匹配：Committed/Commit Limit/Pages Input/Output/Page Faults 均能得到 1 个匹配样本。
- 可复用检查 / 必须补的验证：`tests/vram-stall-watchdog.test.ts` 覆盖健康近满、GPU busy、复合压力、瞬时尖峰、重复进展、遥测断档、attempt guard、非目标 adapter；`tests/queue-recovery.test.ts` 新增 watchdog 独立重试、强制停止/重启、远程/外部 runtime fail-open；完整 verify 已覆盖集成构建。仍需真实 trace replay 与隔离运行时 smoke。
- 未运行项、限制、清理：未采集用户机器真实爆显存 trace，未启动 ComfyUI/Electron/GPU，不需要进程或 GPU 清理；完整测试期间出现的 jsdom `window.scrollTo` 非实现日志为既有测试环境噪声，测试结果通过。
- 实际模型/effort；可见usage与耗时：current model / unknown。
- 版本影响 / Unreleased：已在 `CHANGELOG.md` Unreleased 记录；属于默认关闭的 minor 行为，是否 bump 版本由发布负责人决定。
