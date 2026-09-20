# 显存压力卡死 Watchdog 实施计划

- Type: implementation plan
- Status: proposed; ready for implementation
- Date: 2026-09-20
- Scope: Windows + NVIDIA/WDDM 下，应用管理的本地 ComfyUI 队列任务发生显存超额、共享内存/分页抖动且长期没有生产性进展时，自动恢复并有界重试。
- Authority: 当前摘要以 [TASK](TASK.md) 为准；Queue、进程、Settings 与远程服务边界以 [Architecture Contract](../../ARCHITECTURE_CONTRACT.md) 为准；GPU/runtime 策略以 [Workflow Contract](../../WORKFLOW_CONTRACT.md) 为准。

## 1. 目标与非目标

目标行为：

1. 设置 → 性能与加速新增“显存卡死保护”：关闭（默认）、5 分钟、10 分钟、15 分钟。
2. 只在一个队列任务已经提交到应用管理的本地 ComfyUI 后监测。
3. 不能因为专用显存接近容量就触发；只有“持续无生产性进展”和“持续的显存超额/系统内存压力证据”同时成立才触发。
4. 第一次触发时结束当前执行、精确重启本地 ComfyUI、确认服务就绪，再用原 task ID 和原不可变执行快照重试。
5. watchdog 重试次数复用现有 `autoRetryCount`（含义为原始尝试之后最多再试 N 次）。达到上限后保留任务为 `failed`，Queue 继续领取下一项。
6. 每次候选、解除、触发、重启、重试和耗尽都留下结构化日志；失败任务保留足以解释判定的性能摘要。

非目标：

- 不预测普通任务还要运行多久，也不因“很慢”或 ETA 超长杀任务。
- 不用 24 GB、23.x GB、95% 等单个固定容量值定义 OOM；不同显卡和 WDDM budget 必须自适应。
- 不替代 ComfyUI 明确返回的 CUDA OOM/illegal access 处理；这些继续走现有错误分类。
- 不控制远程 ComfyUI，不终止其他程序或整机 GPU workload，不自动降低用户工作流质量、分辨率、VAE 或 attention。
- 第一版不承诺 AMD/Intel GPU；无 NVIDIA/WDDM 可用遥测时 fail open，只保留现有服务超时。

## 2. 调查结论：当前为什么会卡住

### 2.1 已有能力

- `electron/services/vram-watchdog.ts` 每秒调用 `nvidia-smi`，记录专用显存、GPU 利用率和温度；`src/core/vram-watchdog.ts` 计算动态安全余量，但 `shouldAbort` 被明确固定为 `false`，目前只是 telemetry。
- `electron/services/performance.ts` 已收集 CPU、RAM、专用显存、GPU 温度，并通过 Windows `GPU Adapter Memory(*)\\Shared Usage` 取得共享 GPU 内存；任务摘要已经保存 shared-GPU peak。
- `electron/services/comfy-ui.ts::waitForTask` 有“无节点活动”超时。H3/SeedVR2/DLSS 等可放宽到 90 分钟；只要 `isComputeActive()` 看见近 10 秒 GPU 利用率至少 10%，它就重置 deadline。
- `electron/queue-recovery.ts` 已能将明确 CUDA OOM、CUDA context failure、服务中断和 `TaskStalledError` 分类，重启本地 ComfyUI，并通过 `automaticRetryAttempt` + `autoRetryCount` 重排同一任务。达到上限会保持失败并继续 Queue；恢复本身失败才停止 Queue。

### 2.2 缺口

发生 WDDM 显存超额或页迁移抖动时，GPU 往往仍有利用率，因此当前 `isComputeActive()` 会持续把它当作健康计算；同时 VRAM telemetry 又永不 abort。结果是 service/history 仍能响应、GPU 仍“忙”、节点却长期没有实际推进，现有两个保护条件互相留下空档。

专用显存数值也不是可靠边界。Windows 以动态 Budget 管理显存；Microsoft 明确说明 `CurrentUsage > Budget` 时，OS 为公平分配内存的后台活动可能造成 stutter/性能惩罚。[DXGI_QUERY_VIDEO_MEMORY_INFO](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/ns-dxgi1_4-dxgi_query_video_memory_info) 因此，23.x/24 GB 只能是现象，不是跨机器规则。

系统卡顿通常还伴随 shared GPU memory、RAM commit 和 paging 压力。Microsoft 的内存说明建议结合 Available、Committed 与 page output/read activity；单看 `Pages/sec` 或 Available RAM 都可能误判。[RAM、虚拟内存与 pagefile](https://learn.microsoft.com/en-us/troubleshoot/windows-server/performance/ram-virtual-memory-pagefile-management)、[64-bit Windows pagefile counters](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/how-to-determine-the-appropriate-page-file-size-for-64-bit-versions-of-windows)。NVIDIA 的 oversubscription 实验也显示页迁移/抖动表现取决于访问模式，性能差异可达数量级，不能仅从已分配显存推断是否仍在有效推进。[GPU memory oversubscription](https://developer.nvidia.com/blog/improving-gpu-memory-oversubscription-performance/)。

## 3. 产品与持久化契约

### 3.1 Settings

新增：

```ts
vramStallWatchdogMinutes: 0 | 5 | 10 | 15;
```

- `0` 表示关闭；默认 `0`，旧配置缺字段迁移为 `0`。
- 不再加第二个 boolean，避免 enabled 与 minutes 冲突。
- waiting task 在被 claim 时读取当前设置；claim 后把实际值写入该 QueueTask 的可选诊断字段，例如 `vramStallWatchdogMinutesApplied`，该次运行不再受 Settings 即时修改影响。旧 QueueTask 无字段时按 claim 时设置补齐。
- watchdog 启用即授权其自身的恢复和有界重试；它不依赖 `autoRetryFailedTasks`。`autoRetryFailedTasks` 继续控制 CUDA/服务等普通自动恢复。二者共同复用 `autoRetryCount`，因此设置页将选择器文案改成“恢复重试次数”，且只在两个功能都关闭时 disabled。
- 手动 retry 应保留现有语义，并清零 `automaticRetryAttempt`；同一次自动 retry 和应用重启后的 waiting task 不清零。

### 3.2 本地与远程边界

- 判定器可以是纯平台逻辑，但执行恢复前必须再次确认 endpoint 是本地且在应用管理范围。
- 远程 endpoint 的设置控件显示“仅适用于本地、由应用管理的 ComfyUI”，不得调用 interrupt、force-stop 或 restart；远程任务继续依靠现有连接和服务无响应错误。
- 恢复只能使用现有 runtime capability 精确停止/重启选中的 ComfyUI 安装或 listener，不新增宽泛 process kill。

### 3.3 Queue 与 History

- 重试不新建任务，不改变 prompt、seed、输入、workflow、模型选项、checkpoint、pause boundary 或 History identity。
- `automaticRetryAttempt` 是唯一重试计数源；不要再增加 watchdog 私有计数导致两个上限漂移。
- watchdog 触发错误使用稳定分类 `memory-pressure-stall`；它不是用户取消，也不是 CUDA context failure，不触发 H3 attention fallback。
- 失败摘要可为 `TaskPerformanceStats` 增加可选诊断对象，至少记录：触发时间、配置窗口、无进展秒数、有效/压力样本数、各信号峰值/最小值、最大采样延迟、遥测缺失项和恢复 attempt。旧 History 没有该字段仍正常显示。

## 4. 判定模型

实现一个与 I/O 无关、可用 fake clock/trace 驱动的 `evaluateVramStallWatchdog(state, event, policy)`。不要把判定散落在 30 秒日志、WebSocket handler 和 Queue catch 中。

### 4.1 生产性进展

以下任一事件更新 `lastProductiveProgressAt` 并清除当前候选窗口：

- Comfy `progress` 的 `(nodeId, value/max)` 单调前进；
- active node 改变或收到对应 `executed`；
- batch/piece/item 计数前进；
- 预览 sequence 前进（只作辅助，不能让重复同一帧续期）；
- 对应用自己执行的外部 heavy stage，阶段实现显式上报 checkpoint/progress。

这些不算生产性进展：

- `/history`、`/queue` 请求成功或 WebSocket ping；
- GPU utilization > 0；
- 同一 stage/progress 被重复发送；
- 仅温度、专用显存或日志时间变化。

编码、mux、文件复制等没有 GPU step 的阶段必须显式标记为非 watchdog GPU 阶段，或上报自己的 checkpoint；不能让 watchdog 覆盖整个任务生命周期后误杀 CPU/I/O 收尾。

### 4.2 压力证据族

使用任务开始后 30–60 秒的健康样本建立 rolling baseline；阈值按预算比例、主机比例、相对 baseline 和稳健趋势计算，不按显卡型号/容量表写死。每个样本带 `available`/`missing`，缺数据不按 0 处理。

建议证据族：

1. **WDDM 显存预算/超额（强信号）**：优先取得 DXGI local-segment `CurrentUsage` 与 `Budget`；`CurrentUsage >= Budget` 或持续超过预算为强证据。若第一版无法安全取得 DXGI，则使用系统级 Dedicated/Shared Usage 与任务 baseline 的变化，`nvidia-smi used/total` 只作为上下文。
2. **共享 GPU 内存迁移（强/中信号）**：Shared Usage 相对任务 baseline 明显抬升并保持，或在无进展期间持续增长。按 host RAM 比例及 baseline 的 median/MAD 判断；不要使用“超过固定 2 GB 即失败”。多 GPU 时必须选择 ComfyUI 实际 NVIDIA adapter，不能把所有 adapter/进程无条件求和后归因给当前任务。
3. **主机内存与 commit（中信号）**：Available physical memory 的相对比例持续很低、Committed/Commit Limit 接近上限，且 Pages Input/Output 或 hard-fault activity 高于任务健康 baseline。Available 低或 Pages/sec 高单独都不能触发。
4. **系统响应迟滞（辅助信号）**：主进程 monotonic sampler tick lateness、`nvidia-smi`/counter 调用耗时、Comfy API round-trip 的 rolling p95 明显恶化。它是“鼠标键盘也卡”的可观测代理，但不能监听用户键鼠，也不能作为唯一证据。
5. **GPU 仍忙但无产出（辅助信号）**：GPU utilization 持续非零可证明不是普通 idle，却不能证明健康；它只提高候选置信度，绝不重置 watchdog。

### 4.3 状态机与触发规则

状态：`disabled -> observing -> suspect -> triggered -> recovering -> observing | exhausted`。

- `observing`：prompt 已提交且当前 stage 允许 watchdog；收集 baseline/滚动样本。
- `suspect`：无生产性进展，同时至少一个强压力族或两个中/辅助族成立；记录 `suspectSince`。
- 只有在整个用户选择的 5/10/15 分钟窗口内，大部分有效样本持续满足以下条件才触发：无生产性进展一直成立；并且至少两个独立证据族成立，其中至少一个来自 WDDM/shared/host-memory 三个内存族。
- 任一生产性进展立即回到 `observing`。压力恢复到健康状态达到一个短 hysteresis（建议 60 秒）也取消 suspect，避免瞬时分配峰值累计到 5 分钟。
- 遥测不足、采样器失败、系统睡眠/唤醒造成大时间跳变时 fail open：结束本次 suspect，记录 telemetry gap，不触发。
- `triggered` 必须是一次性 CAS/guard；同一 attempt 只能发出一个 abort/recovery 请求。恢复后新 attempt 使用全新 detector state/baseline。
- 具体 ratio、MAD multiplier 和 sample quorum 先作为命名常量，必须由 trace fixture 锁定并在真实样本后校准；不可放进 Settings 让用户调一组难以解释的工程阈值。

## 5. 采样与性能设计

### 5.1 单一采样源

现有 task performance monitor、VRAM watchdog 和 30 秒日志不能继续各自重复拉取相同数据。建立一个任务级 sampler，将样本同时投递给：

- performance summary；
- 普通 warning/log；
- 纯 watchdog evaluator。

采样建议：`nvidia-smi` 1–2 秒、低成本 Node/os 指标 2 秒、WDDM/commit/page counters 5–10 秒；所有外部查询 single-flight、带 2–5 秒 timeout。watchdog 关闭时不启动新增的重型 Windows counter 采样。

### 5.2 Windows 指标实现顺序

1. 先复用 `os.totalmem/freemem` 和现有 Shared Usage，补充 Commit Limit/Committed、Pages Input/Output 等计数。
2. 优先用一个可终止、应用持有的长生命周期 counter reader（PDH helper 或 `typeperf` 子进程）批量输出，避免每 5 秒创建 PowerShell。
3. 若引入 native/DXGI helper，限定为只读、固定参数、固定输出 schema，并为 helper 缺失/失败提供 fail-open fallback；不要让 watchdog 成为应用启动前置条件。
4. 多 GPU adapter 映射必须用稳定标识（PCI bus/LUID/名称结合），写单元 fixture；不能默认取 `nvidia-smi` 第一行或将所有 `Shared Usage` 求和。

采样器停止条件：任务成功、失败、取消、恢复触发、Queue 停止或 app exit。确保 timer/child process/AbortController 都清理，不能因重试叠加多个 sampler。

## 6. 恢复流程

watchdog 触发时：

1. 原子地将当前 task stage 更新为“检测到持续显存/系统内存压力，正在恢复 ComfyUI”，保存触发诊断；停止该 attempt 的 sampler。
2. 通过 task AbortController 退出 `waitForTask`，抛出专用 `VramPressureStallError`，不要伪装成用户取消或普通 `TaskStalledError`。
3. `classifyFailureForRecovery` 返回 `memory-pressure-stall`：`recoverable=true`、`requiresRestart=true`、`forceStop=true`。压力下 HTTP interrupt/free-memory 可能本身卡住；直接走现有精确本地 process-tree stop + restart，且每一步有有界 timeout。
4. restart 成功并 readiness 检查通过后，复用 `nextAutomaticRetryAttempt`。watchdog 的 `enabled` 来自 applied watchdog policy；retry limit 来自 Settings 的 `autoRetryCount`。
5. 有额度：同一个 task 变回 `waiting`，清理旧 `comfyPromptId`/live progress，保留快照/checkpoint和 attempt 诊断；Queue running 状态与 pause boundary 沿用现有恢复实现。
6. 无额度：仍完成本次精确 stop/restart，以清除卡住的 prompt 并给下一任务一个干净 runtime；但不再重排当前任务。任务保持 `failed`，错误明确写“显存压力卡死保护已重启并重试 N 次，仍无进展，已跳过”；Queue 继续下一 waiting task。
7. restart 失败：不能假装下一任务可运行；Queue 停止并提示本地 ComfyUI 恢复失败。用户手动恢复后再继续。

取消、pause-after-current 和 app exit 优先于 watchdog。用户取消已经开始时，晚到的 watchdog trigger 必须被 epoch/task ownership guard 丢弃。

## 7. 分阶段实施

### Phase A — 纯状态机与 trace harness

- 新建 core 类型、事件、状态机和命名常量。
- 支持 JSON trace replay；测试使用 fake time，把 15 分钟压缩为毫秒级执行。
- 建立至少这些 fixture：健康近满且 step 前进、健康长节点但 shared/RAM 稳定、共享显存增长 + paging + 无进展、单次分配尖峰后恢复、遥测断档/睡眠、多 GPU 非目标 adapter 压力。
- 完成门：只有复合卡死 trace 触发；其他 fixture 不触发；同一 attempt 最多一个 trigger。

### Phase B — Settings、迁移与低开销采样

- 增加类型/default/store normalization/form/page/i18n 和 UI enablement 规则。
- 增加任务 claim-time applied policy 与旧 queue/state 兼容。
- 合并任务 sampler，补 Windows counters、adapter 选择、timeout/cleanup/telemetry gap。
- 完成门：旧 settings 加载为关闭；保存/重启保持 0/5/10/15；watchdog 关闭无新增重型采样；采样器生命周期没有泄漏。

### Phase C — Queue/Comfy 进展与恢复集成

- 从 `waitForTask` 输出明确的 productive-progress 事件，而不是根据 UI 百分比字符串反推。
- 为非 GPU 收尾 stage 建立 enable/disable boundary。
- 接入专用 error/recovery kind、force-stop/restart、统一 attempt 计数和 queue continuation。
- 保持 CUDA context 的 H3 attention fallback 独立；watchdog 不降级 attention。
- 完成门：模拟触发、恢复、N 次耗尽、restart 失败、取消竞态、pause boundary 和下一任务行为全部通过。

### Phase D — 产品验证与发布

- `npm.cmd run verify`。
- 按 [Electron API runbook](../../AGENT_ELECTRON_API_RUNBOOK.md) 用隔离 state/media 做本地 managed runtime smoke；确认远程 endpoint 不出现 stop/restart 调用。
- 在可控环境采集一条正常近满 trace 和一条压力卡死 trace，先 replay 后再允许真实自动恢复；记录 GPU/driver/WDDM、RAM/pagefile、workflow、阶段和采样缺失。
- 检查 Queue UI 的 detecting/restarting/retrying/exhausted 文案、日志和失败详情；不要求 renderer 在整机抖动期间始终流畅，但主进程应在系统恢复调度后完成动作。
- 更新 `CHANGELOG.md` Unreleased；默认仍为关闭，直到多机器证据足以另行决定默认策略。

## 8. 测试矩阵

### Core/evaluator

- 仅专用显存 98–100%，持续有 step：不触发。
- GPU utilization 高、无 step、但 shared/host memory 健康：不触发（由现有模型级 activity timeout 处理）。
- 无 step + shared 高于 baseline + commit/page pressure，持续窗口：触发。
- 无 step + sampler tick 严重延迟，但无内存族证据：不触发。
- 压力 4 分 59 秒后恢复或出现一步进展：5 分钟模式不触发并清零。
- 5/10/15 分钟精确边界、时间倒退、睡眠大跳变、missing/NaN、out-of-order sample。
- adapter A 正常、adapter B 压力，而任务绑定 A：不触发。

### Queue/recovery

- watchdog off：现有行为完全不变。
- watchdog on + `autoRetryFailedTasks=false`：watchdog 仍按 `autoRetryCount` 重试；普通 transient failure 不自动重试。
- 第 1..N 次恢复：task ID、执行快照、checkpoint、pause boundary 不变，attempt 递增，旧 prompt ID 清除。
- 第 N 次 retry 再次触发：仍 stop/restart 清理 runtime，但不再 retry 当前 task；task failed，下一 waiting task 开始。
- restart 失败：Queue 停止，错误可操作；不领取下一项。
- 取消与 trigger 同时发生：取消胜出，无自动重试。
- app restart：running task 按现有安全迁移恢复为 waiting，已消耗 attempt 不倒退。
- remote endpoint：零 interrupt/stop/restart 调用。

### UI/persistence

- 设置默认关闭、四个选项读写、旧 state migration、非法值归零。
- retry count 在“通用自动重试或 watchdog 任一开启”时可编辑。
- 中英文（及仓库要求的其他 locale）文案、键盘操作、保存后不失焦。
- Queue/History 对旧记录和新增诊断字段均兼容。

## 9. 交付门与回退

必须同时满足：

- focused tests + `npm.cmd run verify` 通过；
- 复合判定 trace 不误杀健康近满/长节点 fixture；
- 本地进程所有权、remote connection-only、单 heavy GPU stage 不被破坏；
- retry exhaustion 后 Queue 能前进，restart failure 时不会继续提交；
- 所有 timer/counter child/runtime 在 success/failure/cancel/exit 路径释放；
- 日志能回答“多久无进展、哪些信号成立、采样是否缺失、重启/重试第几次”。

回退方式是将设置保持/迁移为 `0` 并不启动 detector；不要删除 Queue/History 中已写入的可选诊断字段。若真实样本出现误杀，先默认关闭或在 evaluator 中 fail open，不移除现有 CUDA OOM/服务中断恢复链。

## 10. 实施时不要做的事

- 不把 `vramUsed / total >= 0.95`、`remaining < 768 MiB` 或 shared memory `>= 2 GiB` 直接变成 abort 条件。
- 不让 `GPU utilization >= 10%` 单独重置新的压力 watchdog。
- 不从 renderer 的动画/DOM 是否刷新判断系统卡死；判定和恢复必须由 main process 拥有。
- 不新建第二套 retry counter、第二套 Comfy process manager 或另一个 Queue worker。
- 不在压力触发后静默修改任务参数以“试着跑过”；重试必须复用原快照。
- 不为了验证而终止用户其他 ComfyUI/Python 进程或覆盖真实 state/history/media。
