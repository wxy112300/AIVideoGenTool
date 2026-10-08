# Agent-controlled Electron Application API Smoke Runbook

本文记录 Agent 如何操作 Local Video Studio 的真实应用功能，以及如何把结果区分为静态、合成和真实运行时证据。它描述的是当前已经存在的本机测试/操作桥接，不是一个新增加的公共 HTTP、Headless、Browser 或 LAN API。

## 1. 当前边界

类型：运行手册；状态：current；更新：2026-09-28。用户路径与分支见 [流程图](runbooks/PRODUCT_JOURNEYS.md)，方法签名以 AppApi 为准。

先用 `npm.cmd run harness:app -- list` / `guide <id>` 选场景。启动下文的隔离 Electron/CDP 后（Node 22+），按需要使用：

```powershell
npm.cmd run harness:app -- inspect --port 9333
npm.cmd run harness:app -- start-comfy --port 9333 --timeout 180000
npm.cmd run harness:app -- scan --port 9333 --timeout 180000
npm.cmd run harness:app -- enqueue-ui --port 9333
npm.cmd run harness:app -- start-queue --port 9333
npm.cmd run harness:app -- wait-task --task <返回的taskId> --port 9333 --timeout 600000
```

- 先在页面准备输入。`enqueue-ui` 点击实际启用的 Create/Upscale 按钮，等待恰好一个新增 task；禁用或超时为非零退出，不绕开 UI 校验。
- `start-comfy` 调用应用生命周期并检查 ready。离线扫描不足以完成 runtime 验收；启动前协调资源归属，remote endpoint 只连接。
- `enqueue-ui` 要求队列停止，避免立即执行。`start-queue` 会启动全部 eligible waiting 项，须使用只包含本次任务的隔离 queue。
- `wait-task` 按 task ID 查 queue/History 并验媒体路径存在、非空；仍需另验播放、尺寸、音轨和质量。超时不取消应用操作，重试前 inspect。
- `--output temp/<case>.json` 保存精简结果或错误；多 Studio 页面用 `--target <CDP id>`。不会自动安装、重启、删除或重提任务。
- `test:journeys` 是生产 DOM + 合成端口；`harness:comfy` 是服务诊断；`harness:app` 走真实 AppApi。分别记录证据层，不能互相替代。

真实应用路径如下：

```text
Agent / CDP（仅 loopback）
  -> 真实 Electron renderer 的 window.studio
  -> preload IPC
  -> Electron adapters / ApplicationRuntime / application services
  -> ComfyUI 与持久化 state、queue、history、media
```

相关代码边界：

- [`src/types.ts`](../src/types.ts) 的 `AppApi` 是应用操作的类型契约。
- [`electron/preload.cts`](../electron/preload.cts) 将 IPC 方法组成 `window.studio`；它是受控的 Electron preload API，不是远程网络服务。
- [`src/renderer/entry.ts`](../src/renderer/entry.ts) 是生产 renderer 读取 `window.studio` 的唯一入口。
- [`src/renderer/studio-client.ts`](../src/renderer/studio-client.ts) 将 preload 能力投影为 renderer capability views，页面模块不应重新读取全局。
- [`electron/application-runtime.ts`](../electron/application-runtime.ts) 是嵌入式应用组合根，没有 Electron、HTTP server、daemon 或 LAN 监听策略。

因此，Agent 可以通过真实 renderer 上的 `window.studio` 调用现有界面背后的应用能力，但不能据此声称产品已经拥有公开 API。未来若要提供 HTTP/SSE/WebSocket、独立 Headless 或 LAN API，必须另立契约、鉴权、生命周期和兼容性设计。

## 2. 选择正确的操作层

按证据目标选择入口：

| 目标 | 推荐入口 | 能证明什么 |
| --- | --- | --- |
| 依赖、节点、Prompt Writer、服务诊断 | `npm.cmd run harness:comfy -- ...` | ComfyUI 服务和应用服务接口，不包含真实 renderer/preload/UI 状态 |
| 真实界面功能和应用链路 | packaged Electron + loopback CDP + `window.studio` | renderer、preload、IPC、应用服务、队列、ComfyUI、history/output 的实际闭环 |
| 焦点、键盘、拖放、布局、可见 loading/error 状态 | 浏览器/桌面 DOM 自动化 | 用户可见交互和视觉证据；不应替代应用 API 的业务调用验证 |
| 底层 ComfyUI 节点探针 | ComfyUI `/object_info` 或 `/system_stats` | ComfyUI runtime 状态；不能单独证明 Local Video Studio 的队列和 history 正常 |

服务诊断优先使用现有 harness；只有需要穿过真实 renderer/preload/IPC，或需要验证界面功能与持久化结果时，才使用本手册的 CDP 桥接。

## 3. 启动真实应用

### 3.1 packaged 路径（首选）

先确认没有其他任务使用配置的 ComfyUI 安装/端口/GPU 或正在构建，再构建当前 renderer。最小 Create smoke 使用隔离启动器：

```powershell
npm.cmd run build
node scripts/harness/launch-create-smoke.mjs
```

启动器只复制当前用户的 settings（可传入指定 state 文件），新建空 queue/History、空 prompt、H3 FL2VA 1 秒 480p 草稿；userData、媒体目录和日志放在 gitignored `temp/create-smoke-*`。它拒绝已占用的本地 ComfyUI 端口，关闭自动重试，不入队、不下载模型。启动本身可能触发应用生命周期，先确认资源归属。实际 CDP 端口、PID 和目录打印在终端并保存于 `launch.json`，下文的 9333 都应替换为它。

启动参数只应由 Agent/测试显式加入，不能写入产品默认启动命令。测试结束后运行 `node scripts/harness/close-fixture-smoke.mjs <fixture-dir> --port <port> --output <cleanup.json>`，再等待记录的 PID/CDP/ComfyUI 监听退出。它只接受匹配 launch/state、停止队列、空闲 Prompt 和本地应用拥有的运行时，先经 AppApi 停止 ComfyUI，再请求 CDP `window.close()`；外部/remote 运行时拒绝清理。JS 关闭可绕过原生 close hook，曾留下本次 Python 包装进程，不能把它记作原生退出生命周期通过。超时先检查队列和进程归属；必要时只取消本次 task（`window.studio.cancelTask(id)`），不要杀外部进程或删除用户媒体。

正常窗口退出验收另走系统关闭请求：确认本次主PID/准确标题/非零MainWindowHandle，queue与Prompt空闲、无未保存设置，ComfyUI为本地ready/app后，用PowerShell `Get-Process -Id <owned-main-pid>` 取得进程，调用其 `.CloseMainWindow()` 并要求返回true。若Harness隐藏窗口没有句柄，使用应用现有同profile second-instance show/focus显示同一窗口，再复核身份；不终止已有实例或新增关闭IPC。不要提前停runtime或JS关闭，否则不能证明退出链。按该PID与session筛选日志，要求 `Window.CloseRequested → App.Shutdown → App.OwnedComfyStopped → Window.Closed`，随后检查自有Python子树、CDP/8188监听均退出，并比较关闭前后持久化状态。日志是格式化文本，不是逐行JSON；应用退出内部会终止自有ComfyUI进程树，父树先退出可留下子进程not-found告警，应以资源复核判断。2026-10-08的129作品/草稿保护与正常退出已验，证据见任务最新增量；不涵盖标题栏鼠标命中、活动任务、未保存设置或remote退出。

### 最小 Create → History 可重复步骤

使用启动器打印的端口和目录替换占位值：

```powershell
node scripts/app-harness.mjs start-comfy --port <port> --timeout 180000
node scripts/app-harness.mjs scan --port <port> --timeout 180000 --output <run-dir>/scan.json
node scripts/harness/prepare-create-smoke.mjs --port <port> --output <run-dir>/ui-enqueue.json
node scripts/app-harness.mjs start-queue --port <port>
node scripts/harness/verify-video-smoke.mjs --port <port> --task <返回的taskId> --timeout 900000 --output <run-dir>/history.json
```

- prepare 对空 fixture 验证缺 prompt 禁用 → CDP 键盘输入 → 实际按钮点击 → T2VA workflow/task ID → 编辑草稿不改变任务快照。只入队；失败时先检查报告中的 task ID，不要重复提交。
- verify 按 task ID 等待真实文件，点击对应 History 卡片、播放器控件和返回按钮，要求解码帧推进，并比较 History 尺寸/时长与实际媒体。单项失败返回非零且保留已通过证据。它不启动队列。
- 在隔离草稿上给 verify 添加 `--continue-source`，还会点击 History 的 Continue，核对源 asset/version、解码时长和完整裁剪终点；此选项会改变草稿，但不入队。用它同时防止“History 错误被源播放器自动纠正掩盖”，不要仅看 Extend 正常就跳过入库检查。
- 两个 UI 脚本在本次 CDP 会话启用 focus emulation：后台窗口的 RAF/逐帧播放器挂载会被节流；记录此测试条件，不能把后台占位当成播放器失败。入队返回 ID 后仍等待真实按钮恢复。
- 用 ffprobe 检查音轨/FPS/帧数，用 ffmpeg 完整解码；脚本播放通过不等于声音/内容质量已人工验收。不要把草稿请求时长当作输出时长。
- 真实证据、修复与未覆盖边界保留在[已验收任务归档](archive/2026-09-27-agent-journeys/TASK.md)，按日期区分历史失败与后续修复，不放宽阈值制造通过。

### Motion Context 与单任务资产清单

Bootstrap 入队小步可复用下面的单源隔离启动器，再执行：

```powershell
node scripts/harness/prepare-bootstrap-smoke.mjs <prior-create-dir>/user-data/studio-state.json --port <port> --output <run-dir>/bootstrap-enqueue.json
```

它显式建立 bootstrap fixture 和非空提示词，检查缺 AV 的真实阻塞，再复制 FL2VA AV pair 并通过 AppApi.saveDraft 设置输入，最后点击实际入队按钮。原生文件选择器未验；不启动队列/GPU。记录的 workflow 路径不代替生成验证。切 Continuum 不保证自动进入 bootstrap，必须检查 mode。若只做此小步，保存快照、取消本次 task 并正常关闭；真实执行属于后续步骤。

跨阶段恢复用 `node scripts/harness/launch-create-smoke.mjs --resume <prior-smoke-dir>`。只接受当前仓库 `temp/create-smoke-*` 与匹配的 launch.json，拒绝仍存活的旧 PID、占用的端口和保存为运行中的队列；保留原 state、输出和 task ID，重新打印 CDP 端口。检查唯一目标任务及其输入文件后，通过同一 CDP client 执行 `window.studio.resetTask(taskId)` 将已取消任务恢复等待，再运行 start-comfy → start-queue → verify-video-smoke → inspect-task-assets。恢复任务不是新的 UI 入队证据，应关联之前的按钮点击报告；不要重复 prepare 或盲目提交。

长时间运行将 `--output` 保存到测试目录，并把 stdout 重定向到 `$null`；最终只读结构化报告。异常再截取首个错误及邻近上下文，避免把整份日志放进 Agent 上下文。用户明确要求时，可由一个 Luna 只读日志、返回终态与证据位置；主 Agent 负责资源和结果验收。

复用一次成功 Create smoke 的单视频 state。启动器只接收带 launch.json 的测试目录，复制 MP4 并按 ffprobe 的实际时长建立来源；不导入其 AV/latent，专测视频上下文 fallback，不修改原证据：

```powershell
node scripts/harness/launch-create-smoke.mjs --motion-source-state <prior-smoke-dir>/user-data/studio-state.json
node scripts/app-harness.mjs start-comfy --port <port> --timeout 180000
node scripts/harness/prepare-motion-smoke.mjs --port <port> --output <run-dir>/ui-enqueue.json
node scripts/app-harness.mjs start-queue --port <port>
node scripts/harness/verify-video-smoke.mjs --port <port> --task <task-id> --timeout 900000 --output <run-dir>/history.json
node scripts/harness/inspect-task-assets.mjs --port <port> --task <task-id> --output <run-dir>/assets.json
```

prepare-motion 验证缺视频阻塞→History 详情就绪→继续创作→实际源视频时长/Slot 1/R2V/off Spectrum→实际按钮入队及来源身份。等待详情播放器挂载后再点击，不能只等到 HTML 按钮出现。只入队、不自动执行 GPU；失败带 task ID 时先 inspect，勿重复提交。

inspect-task-assets 是只读视频任务清单，将 media、AV payload/manifest、owner/alias、Motion Context 路径按物理路径归并，核对存在/非空；它不替代 schema 检查，也不授权清理这些文件。[资产地图](runbooks/ASSET_LIFECYCLE.md) 解释图片库检查、目录迁移和各类删除。最终按前述正常关闭流程检查本次进程与端口。

目录迁移使用 `launch-create-smoke.mjs --asset-source-state <prior-smoke-state.json>` 和 `asset-migration-smoke.mjs <fixture-dir> --migrate --port <port>`，具体重启/审计步骤见上述资产地图。它复制真实测试媒体和 AV，保留身份及草稿引用，在隔离输出根内点击 Settings 的迁移选项。Phase 5C 已修复并实跑 canonical AV 迁移；重启后先核对原草稿播放器和 `inspectVideoExtensionSource(draft)` 为 available，再验证 History 播放/返回。迁移 UI completed 不等于所有引用已更新，不能放宽断言或先重选 History 来源来掩盖旧草稿问题。

AV 辅助删除复用全新的 --asset-source-state 副本，运行 `asset-delete-smoke.mjs <fixture-dir> --delete --port <port>`，通过真实鼠标和确认按钮验证共享草稿阻塞→清空→删除；加 `--whole-asset` 则删除副本的整个作品，检查记录/MP4/AV 移除及自动回历史列表。正常关闭并 resume 后省略 --delete，按 baseline 保存的种类验证持久化结果。脚本识别实际 `#app-flash` 错误通知；AV-only 保留视频，整作品模式不可再运行原 task 的播放检查。仅支持单作品/单版本/canonical AV/空队列；多版本/queue 共享保护及 managed owner 另行验收，详情见资产地图。

多版本删除另用 `launch-create-smoke.mjs --version-source-state <prior-smoke-state.json>`（独立 MP4 + waiting queue 引用）或 `--shared-version-source-state`（共用 MP4）。运行 `version-delete-smoke.mjs <fixture-dir> --exercise --port <port>`，关闭并 resume 后省略 --exercise 审计。已实跑 queue 阻塞→真实移除任务→删除默认版本→剩余版本播放/重启，以及共用文件的 History 引用阻塞。合成版本和工厂构造的等待任务仅用于删除保护，不能算 Upscale 入队/生成证据；流程与限制见 [资产地图](runbooks/ASSET_LIFECYCLE.md#多版本删除与-queue-保护)。

Managed 来源门槛探针：新建 `--asset-source-state` 副本，运行 `node scripts/harness/probe-managed-entry-smoke.mjs <fixture-dir> --port <port> --output <report.json>`。AppApi 只准备无 accepted prefix 的模式/输入；真实 source inspection 必须保持阻塞，再通过实际模型下拉键盘切换 Motion Context、鼠标入队得到 waiting task。脚本不启动队列；验收后从 Queue 移除该测试任务并关闭自有窗口。首次保存 baseline 后用新副本重跑，保留失败报告。此探针不是 managed 首次启动/生成成功，详见 [Extend 图](runbooks/PRODUCT_JOURNEYS.md#extend) 与 [managed 文件边界](runbooks/ASSET_LIFECYCLE.md#managed-run-的来源与文件边界)；无 accepted run 时不能靠 mode 标记或启动 ComfyUI 绕过来源门槛。

Managed 正向审计：明确授权实库测试后，先备份状态、所选Run的project/revisions、registry及引用来源，确认空闲queue/自有runtime；默认仍使用完整物理隔离副本。来源文件available只证明物理门槛，采样契约仍须执行验证。API可以真实生成managed首段作为夹具，accepted/receipt必须来自真实执行；不能宣称该首段是UI入口，也不能用bootstrap代替。随后必须从History指定版本实际Continue，验证空prompt阻塞→补齐→鼠标enqueue/task ID与Queue Start。

完成后运行 `node scripts/harness/managed-history-audit.mjs <evidence-directory> --port <port> --task <id> --output <report.json>`，输入app-before.json、enqueued-state.json和backup-manifest.json；复用同一目录/任务在重启后再审计，不重新生成。脚本核对receipt、前缀、全部实际payload登记、owner/alias hash与video/audio tensor、播放/返回和managed单版本AV删除按钮不存在，不删除用户文件。官方复用段可能重新封装，payload hash变化不等于tensor变化；不能只查逻辑chunk的assetId而遗漏receipt实际路径对应的新registry。

旧Run采样契约不兼容曾由官方节点生成新第一段并推进磁盘head，再被应用拒绝receipt。现有前置保护：`submitTask`确认receipt schema支持保护并附上任务冻结的accepted数/head；应用内置 `managed_prefix_guard.py`从ComfyUI实际注册的sampler定位官方RunStorage模块，在官方Run锁内校验当前head、官方原有完整前缀资格与数量。错误发生在创建revision/写manifest之前，旧Run真实拒绝已核对project/文件/registry/History未变化；兼容Run真实2→3与12秒播放通过。旧节点缺保护时明确阻止提交，按应用设置更新内置H3节点并重启；不改公共节点文件、采样graph identity或hash资格。检查点之后的其他错误/崩溃不在此前置保护承诺内，仍须核对磁盘与receipt，不能把API错误返回当作磁盘未变化。

保护逻辑 focused 检查：`python -B tests/python/test_h3_managed_prefix_guard.py` 与 `npx.cmd vitest run --config vite.config.ts tests/h3-continuum-managed.test.ts tests/comfy-ui.test.ts --reporter=dot`。Python端覆盖实际注册命名空间的延迟导入，避免仅保护native-state bridge的另一模块实例；真实运行证据仍按TASK记录，不以这些检查替代。

图片素材库：在空的 `launch-create-smoke.mjs <settings-source-state>` 副本中运行 `image-library-smoke.mjs <fixture-dir> --port <port> --output <fixture-dir>/image-library.json`，经真实按钮验证归档保留原图、旧孤儿勾选中新引用文件受到保护。正常关闭并 resume 后，追加 `--audit image-library.json` 只读检查持久化；详情与范围见 [图片库生命周期](runbooks/ASSET_LIFECYCLE.md#3-检查整理转移分别做什么)。等待 CDP 启动就绪，已有 baseline 时不重复归档/清理；没有 GPU 工作。

图片库并发场景在新副本追加 `--during-cleanup`：真实确认后的扫描期间保存新引用，验证清理保护、模式切换及重启。API 注入输入后，独立模式切换检查前先 reload 同步 renderer；详见图片库生命周期的 5G-2 说明。

<a id="settings-probes"></a>
### 选一条设置探针，按证据层判断结果

| 修改的问题 | 复用入口 | 应检查的用户结果 | 该入口的证据边界 |
| --- | --- | --- | --- |
| 默认模型保存是否覆盖已有内容 | `settings-draft-smoke.mjs` / `--audit` | 实际选择/保存后，活动及两种保存草稿完整不变；设置与草稿跨重启保留 | AppApi 准备草稿、UI 保存；不证明新建草稿默认或生成 |
| 加速设置何时改变 waiting | `prepare-create-smoke.mjs` → `settings-queue-smoke.mjs` / `--audit` | 实际 Attention 保存立即改变唯一 waiting 的策略，内容/草稿保留；重启审计 | 此脚本不执行 claim/GPU；其他三项和 failed 保护仍看服务测试 |
| running 是否冻结执行策略 | [settings-running-smoke](#settings-running-smoke) / `--finish` / `--audit` | 真实 Queue 开始→保存前后仍为 running→执行策略不变→实际成片/History/重启 | 只改 Attention；`--finish` 复用记录的真实 running-save，不补造状态或重提任务 |
| Prompt 模型何时生效 | [settings-prompt-smoke](#settings-prompt-smoke) / `--audit` | 实际模型保存、缺输入提示、补文本后增强；按 operationId 对应日志后端、新版本与重启 | 默认 2B；`--resident` 先真实加载旧模型再选 4B；`--history` 保护单作品物理副本。请求运行中保存、其他输入/Pack、取消/跨模式和质量另验 |
| 隔离资源如何退出 | `close-fixture-smoke.mjs` | 空闲/归属检查后经 AppApi 停本次 runtime，再关闭并复核 PID/监听 | API 清理与 JS 关闭；不能证明原生关闭、活动任务退出或 remote 生命周期 |
| 正常窗口关闭如何触发清理 | 自有主窗口 `.CloseMainWindow()`，见前述退出配方 | 系统关闭请求→Electron退出链→自有runtime/端口退出→持久化状态保留 | 已验空闲本地app-owned场景；不涵盖标题栏鼠标命中、活动任务、未保存设置或remote |

服务测试的通过不代替上述按钮路径。成功报告用于对应文件状态；复用前确认相关输入未变，变化后只重验受影响边。本机报告与已验收/未覆盖范围见[归档TASK覆盖矩阵](archive/2026-09-27-agent-journeys/TASK.md#settings-coverage)，本手册只维护重复执行的方法。

设置草稿保护探针：新空 fixture 运行 `node scripts/harness/settings-draft-smoke.mjs <fixture-dir> --port <port> --output <report.json>`，准备两种草稿后真实修改默认视频模型并保存。reload 后先通过 `scanEnvironment(settings, 'full')` 取得离线可用模型；此 API 必须传设置。已有 baseline 不重复准备，重启添加 `--audit`。真实保存与重启的完整草稿比较已通过；video/R2V fixture 必须使用 Spectrum off，不能继承 I2V balanced 后把预期启动归一化误判为保存丢值。此证据不包含新草稿初始化、等待任务策略或提示词运行时。

等待任务设置探针：在新空 fixture 先运行 `prepare-create-smoke.mjs --port <port> --output <fixture-dir>/ui-enqueue.json`，保留唯一 waiting 任务，再运行 `settings-queue-smoke.mjs <fixture-dir> --port <port> --output <report.json>`。脚本实际修改 Attention 并保存，验证策略立即更新、提示词/素材/seed/草稿不变；不启动队列。正常关闭、resume 后追加 `--audit`。恢复审计只对明确的旧 H3 内存兼容字段应用生产 normalizeH3MemoryOptions，其他任务字段严格比较；未创建的可选草稿按 JSON 缺省语义比较。此证据不包含运行中修改、claim 实跑或 GPU。

<a id="settings-running-smoke"></a>
### H3 运行中保存：真实 claim → 固定策略 → 成片 → 重启

新空 fixture 先运行 `prepare-create-smoke` 得到唯一真实 waiting task，再经应用启动 ComfyUI：

```powershell
node scripts/app-harness.mjs start-comfy --port <port> --timeout 180000
node scripts/harness/settings-running-smoke.mjs <fixture-dir> --port <port> --timeout 900000 --output <fixture-dir>/settings-running.json
node scripts/harness/verify-video-smoke.mjs --port <port> --task <task-id> --output <fixture-dir>/history.json
node scripts/harness/close-fixture-smoke.mjs <fixture-dir> --port <port> --output <fixture-dir>/cleanup.json
node scripts/harness/launch-create-smoke.mjs --resume <fixture-dir>
node scripts/harness/settings-running-smoke.mjs <fixture-dir> --audit --port <new-port> --output <fixture-dir>/settings-running-after-restart.json
```

探针点击真实 Queue Start，等待实际 running，再经 Settings 选择不同 Attention/保存。保存前后必须仍为 running，否则返回失败；比较既有执行输入与策略，进度/结果字段单独报告。随后等待同一 task 的真实输出；空队列若尚运行则通过真实按钮停止。超时或收尾检查失败后，只有已记录 runningTask/afterSaveTask 的副本可用 `--finish` 接着核对同一结果，不再启动或提交任务。保留首次失败报告，不能用 finish 冒充新的 UI 点击证据。

重启审计应用 `store.ts` 的旧 H3 内存默认，再按真实 stat 补 History 文件大小缓存；已有大小变化仍失败，所有路径/身份/其他内容严格比较。`verify-video-smoke` 单独证明实际解码/播放/返回。此脚本不验证其他三项加速设置、failed 状态、取消或运行中重启。

<a id="settings-prompt-smoke"></a>
### Prompt 设置：保存 → 下一次增强 → 新版本 → 重启

在新空 fixture 先运行上述 `prepare-create-smoke`，保留真实入队的唯一 waiting task 和 ui-enqueue.json，再运行：

```powershell
node scripts/harness/settings-prompt-smoke.mjs <fixture-dir> --port <port> --timeout 240000 --output <fixture-dir>/settings-prompt.json
node scripts/harness/close-fixture-smoke.mjs <fixture-dir> --port <port> --output <fixture-dir>/cleanup.json
node scripts/harness/launch-create-smoke.mjs --resume <fixture-dir>
node scripts/harness/settings-prompt-smoke.mjs <fixture-dir> --port <new-port> --audit --output <fixture-dir>/settings-prompt-after-restart.json
```

此脚本会真实推理，可能由应用自动启动本地 ComfyUI；先确认端口/GPU 归属。默认选择已安装 Qwen3.5 2B；不绕过缺文件的 disabled option、不下载模型。AppApi 准备两个带版本的编辑草稿；真实键盘选择模型/保存，完整比较草稿/版本/queue/History。真实增强按钮在无文本/无媒体时显示阻塞且不请求，键盘补文本后再次点击。用 operationId、promptModelId、promptBackend 与完成事件关联新版本；失败返回非零，不把路由成功写成推理通过。已有 baseline 不重复执行；--audit 只读比较最终内容与设置。

`--resident` 用默认的真实入队准备，先点击 Prompt runtime 按钮将旧选择模型实际加载，再保存 4B。记录保存前/后与增强后的驻留状态；不得预设保存会立即卸载。`--history` 与它分开：先 `launch-create-smoke --asset-source-state <单作品canonical-AV-smoke-state>` 复制物理素材，队列保持空，不运行 prepare、不提交视频任务。保存 2B/真实增强，严格保留 History、草稿、版本以及自有 MP4/AV 的路径/大小；重启须同样传 --history，再以原 taskId 运行 verify-video-smoke 检查作品副本可播放。

当前 provider 固定 ComfyUI，旧 promptRuntime/promptUseLmStudio/lmStudioModel 不参与外部路由。`EnhanceRequest.modelId` 是生成模型；服务每次读取保存的 promptModelId，在 `beginPromptRuntimeLease` 比较旧租约，不匹配时释放旧模型。实测 2B 已驻留→保存 4B 后仍为 2B→下一次增强成为 4B；单作品副本可验证保存/增强对文件与身份的保护。这些方法不自动证明请求运行中保存、其他输入/Pack/auto seed、取消/跨模式回写、画质或性能；当前完成状态只看 TASK。

<a id="upscale-smoke"></a>
### 最小视频 Upscale → 派生版本 → 重启

使用已成功生成、短边低于 720 的单版本测试视频，通过 `launch-create-smoke.mjs --asset-source-state <prior-smoke-state>` 建立新的物理隔离副本。离线 scan 确认 seedvr2-native-int8 文件可用，运行：

```powershell
node scripts/harness/upscale-smoke.mjs <fixture-dir> --port <port> --output <fixture-dir>/upscale-enqueue.json
node scripts/app-harness.mjs start-comfy --port <port> --timeout 180000
node scripts/app-harness.mjs scan --port <port> --output <fixture-dir>/scan-online.json
node scripts/app-harness.mjs start-queue --port <port>
node scripts/harness/verify-video-smoke.mjs --port <port> --task <enqueue-report-task-id> --output <fixture-dir>/upscale-history.json
node scripts/harness/upscale-smoke.mjs <fixture-dir> --port <port> --audit <fixture-dir>/upscale-enqueue.json --output <fixture-dir>/upscale-audit.json
```

先确认 online scan 中目标 runtimeReady/runtimeVerified，再启动唯一测试任务。脚本实际点击 History/放大/720p，键盘切换普通与原生 INT8，核对策略控件变化；暂时重命名**隔离副本 MP4**，确认实际按钮收到源缺失错误且队列为空，finally 恢复文件后再次点击得到唯一 task ID。首次 baseline 后禁止重复准备；失败保留报告，若进程异常终止，应按 baseline 检查 `.upscale-smoke-hold`，恢复副本后再用新 fixture。

审计要求同一 asset、新 upscale version、准确 sourceVersionId/defaultVersionId、源版本结构及 MP4/AV 字节不变、输出存在于隔离目录。另用 ffprobe/ffmpeg 检查尺寸/帧数/时长/音轨和完整解码。正常关闭、resume 后，用新端口重复 `--audit` 和播放检查，不重复入队。此为短片单次运行证据，不代表长片 checkpoint 恢复、其他模型或画质已验收。

如果测试主机的 Chromium sandbox/GPU 不能启动，可以临时使用隔离测试开关：

```powershell
node_modules\.bin\electron.cmd --remote-debugging-port=9333 --user-data-dir="<run-dir>\user-data" --no-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu .
```

这只能说明测试 renderer 能运行，不能作为正常生产 GPU、安全或性能路径的证据；记录中必须明确写出这些开关。

### 3.2 development 路径

需要验证 Vite development renderer 时，给 Vite 和 CDP 各使用明确、未占用的 loopback 端口：

```powershell
$env:VITE_DEV_SERVER_PORT="5187"
$env:C04_REMOTE_DEBUGGING_PORT="9333"
npm.cmd run dev
```

若开发端口收到 `EACCES`，先更换显式端口或改用 packaged 路径。端口权限问题不等于 ComfyUI runtime 失败，也不能通过只更换 CDP 端口来掩盖 Vite 仍争用固定端口的问题。

### 3.3 获取 renderer target

确认应用真的打开后，只连接 loopback CDP：

```powershell
curl.exe -L http://127.0.0.1:9333/json/list
```

在返回的 targets 中选择 `type` 为 `page` 且 URL 是 Local Video Studio renderer 的项，使用它的 `webSocketDebuggerUrl` 建立 CDP 会话。不要把调试端口暴露给 LAN，也不要把 `/json/list` 当作产品 API。

## 4. 通过 `window.studio` 调用应用能力

CDP 会话向目标 websocket 发送 `Runtime.evaluate`，并设置 `awaitPromise: true`、`returnByValue: true`。只返回小的结构化结果，不要把完整 state、日志、prompt、路径中的秘密或媒体 base64 写入聊天记录。

最小读取示例：

```json
{
  "id": 1,
  "method": "Runtime.evaluate",
  "params": {
    "expression": "window.studio.getState()",
    "awaitPromise": true,
    "returnByValue": true
  }
}
```

调用时保留方法的宿主对象，使用 `window.studio.method(...)`。不要把应用服务实例的方法通过对象展开、解构或裸函数传递；如果内部组合确实需要传递 class 方法，必须在组合边界显式 `bind`，或暴露带闭包的 adapter。此前 QueueRuntimeService 的 class method 被展开/解绑后出现 `undefined` 或丢失 `this`，说明这种错误必须由组合测试和实际 smoke 一起覆盖。

常用 `AppApi` 能力如下：

| 能力 | 方法 | 用途 |
| --- | --- | --- |
| 读取 | `getState()`、`getComfyRuntimeState()`、`getPromptRuntimeState()` | 读取队列、历史、draft 和 runtime 状态 |
| 环境 | `scanEnvironment(settings, scope)` | 离线文件/节点扫描或 runtime 检查；服务离线时不能把 `runtimeReady=false` 解释为文件缺失 |
| 服务 | `startLocalService("comfy", settings)`、`restartLocalService(...)`、`forceStopComfyProcesses(settings)` | 复用应用管理的本地 ComfyUI 生命周期和进程所有权 |
| 入队 | `enqueue(draft)`、`enqueueExtension(draft)`、`enqueueImageEdit(draft)`、`enqueueUpscale(request)` | 走应用的快照、校验和 queue 持久化路径 |
| 队列 | `startQueue()`、`continueQueue()`、`pauseQueue()`、`cancelTask(taskId)` 等 | 验证界面按钮背后的队列状态转换 |
| 媒体 | `readImage(path)`、`readHistoryCover(...)`、`showItemInFolder(path)` | 通过应用媒体 IPC 验证输出可读性和路径解析 |
| 事件 | `onStateChanged(...)`、`onComfyRuntimeStateChanged(...)`、`onTaskPreview(...)` | 长任务实时观察；回调取消函数要在会话结束时调用 |

方法的完整签名和参数类型以 `AppApi` 为准，不要从按钮文字、原型页面或 ComfyUI 节点显示名推断参数。

## 5. 真实最小生成流程

真实生成会修改队列、history 和 ComfyUI output，必须先确认测试范围。优先使用隔离的应用 state/media 目录；如果为了验证用户当前配置而使用真实目录，要保存初始数量、任务和路径，只提交用户明确允许的低风险任务，不删除原有数据。

### 5.1 准备

1. 阅读 [`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) 和 [`WORKFLOW_CONTRACT.md`](WORKFLOW_CONTRACT.md)，检查 `git status`，记录当前 package 版本、选中的 ComfyUI、Python、core revision 和端口。
2. 用 `getState()` 记录初始 `queue`、`imageHistory`、`history` 数量和 `settings`；用 `scanEnvironment(settings, "full")` 确认所选实例的文件与节点。离线扫描通过不代表 runtime 已 ready。
3. 选择扫描结果中完整可用、已有 API workflow 的最小 image profile。不要为了让测试通过而切换安装目录、下载权重、加入 `--cpu`、禁用 custom nodes 或修改用户设置。

### 5.2 启动并提交

先调用应用自己的 `startLocalService("comfy", settings)`，等待返回成功并检查 `getComfyRuntimeState()` 为 ready/app-owned。不要手动启动 `main.py` 后把它写成应用启动或队列 smoke。

再从当前 `state.imageDraft` 复制一个 draft，只修改测试所需字段，然后调用 `enqueueImageEdit(draft)`。记录返回 state 中新增 task 的 `taskId`，再调用 `startQueue()`。以当前实际 catalog/workflow 为准；下面只是一次已成功的证据样例，不是所有机器都应照抄的默认值：

```text
model: z-image-turbo
quality: turbo-8
size: 1024 x 1024, aspect 1:1
outputs: 1 PNG
seed: 42
prompt: A single red apple on a white table, clean studio lighting, centered composition.
references: none
```

### 5.3 观察完成

短任务可以每 1–2 秒通过 `getState()` 轮询；长任务更适合订阅 state/progress 事件。轮询必须有超时、按 task ID 过滤，并同时观察：

- task 从 waiting/running 到最终结果；成功任务可能已从活动 queue 移除，此时按 task ID 关联 History，不能只看按钮文字或 queue 数量；
- ComfyUI prompt ID、节点进度和错误信息；
- `queueRunning`、runtime phase、owned process 是否符合预期；
- history 是否新增了与本次 task 关联的记录。

历史数组的顺序不是可靠的“最新在末尾”契约。完成后必须使用 `version.taskId === taskId` 查找对应 image-history version；不能用 `imageHistory.at(-1)` 推断刚完成的结果。视频和图片 history 还要使用各自的身份字段与路径解析规则。

### 5.4 验证输出

真实闭环至少要满足：

1. ComfyUI 返回成功且没有 fallback、failed 或 cancelled 状态；
2. 应用 queue 回到 idle，task 的执行快照和 history 元数据一致；
3. 按 task ID 找到预期 history/project/version，模型、workflow、prompt、seed、尺寸和输出数量正确；
4. history 记录的精确输出路径存在且文件非空；
5. 通过 `readImage(path)` 或对应媒体 API 成功读取，必要时检查 MIME、尺寸或 hash；
6. 完成后能区分 app-owned runtime、外部/remote runtime 和残留进程。

某些 ComfyUI 配置会把文件写到 `output/Images`，而应用 source library 可能使用 `input/LocalVideoStudio`。不要仅凭目录名判定失败，应以 task ID、文件类型、尺寸和应用 history 路径解析结果关联。

## 6. 清理和证据记录

应用管理的 local ComfyUI 应由应用自己的 stop/close 路径清理。结束前检查 `getComfyRuntimeState()`、配置端口监听、owned PID 树和 Electron/CDP 测试进程。只有明确属于本次测试的 PID 才能精确停止；禁止使用宽泛 `taskkill`、递归删除 output 或清空 history。remote ComfyUI 不得被停止。

每次真实 smoke 至少记录：

```text
package / commit / OS / Electron / Node
selected ComfyUI root, core version/revision, Python, custom nodes
model / workflow / prompt classification / dimensions / seed / sampler
app taskId / ComfyUI promptId / start-end-duration
history project/version / exact output path / file size or hash
final queue/runtime state / process and port cleanup
flags, fallbacks, warnings, and any user-confirmed manual steps
```

报告时明确区分：

- `static validation passed`：类型、JSON、文件扫描或代码检查；
- `synthetic/fixture smoke passed`：mock state、fixture 或 current-renderer harness；
- `real application API smoke passed`：真实 Electron renderer 经 `window.studio` 走到应用服务；
- `real ComfyUI generation passed`：确实产生并读取了实际媒体；
- `manual UI evidence`：人工完成的焦点、布局或视觉操作。

一次 image smoke 只能证明这一条 image 闭环，不能自动推广为 H3 Prompt Writer、视频、所有模型、active-task close confirmation 或公共 API 已通过。

## 7. 常见失败与处理

| 现象 | 正确判断与处理 |
| --- | --- |
| offline scan 成功但 `runtimeReady=false` | 正常的离线/在线边界；启动服务后再做 runtime probe，不要标记模型文件缺失 |
| Vite `EACCES` | 换用显式可用的 Vite 端口或 packaged Electron；不要把 development 端口阻塞写成 ComfyUI 失败 |
| `startLocalService` 超时 | 保留精确日志、PID 和设置，确认没有偷偷切换安装或加入测试 flags；清理后再报告 runtime 未验证 |
| 队列看起来没变化 | 这是异步操作；按 task ID 轮询/订阅 state，不要只等待调用返回 |
| history 最后一项不是刚生成的 | 用 `version.taskId` 关联，不使用数组位置 |
| 直接调用 ComfyUI `/prompt` 成功 | 这是底层服务探针，不是 UI/application smoke；仍需通过 `window.studio` 验证入队、队列、history 和媒体读取 |
| 方法为 `undefined` 或 `this` 丢失 | 检查 class method 是否在组合时被展开/解绑；改为显式 bind 或闭包 adapter，并补调用级回归测试 |
| 使用 `--cpu`/禁用节点后成功 | 只说明隔离变量后的服务可用，不得当作当前选中正常 runtime 的通过证据 |

本手册与 [`AGENT_START_HERE.md`](AGENT_START_HERE.md)、[`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md)、[`DEPENDENCIES_AND_SETUP.md`](DEPENDENCIES_AND_SETUP.md) 一起维护；若接口变更，先更新 `AppApi`/preload 契约和测试，再更新本手册。

## 8. 已完成的实际样例（2026-09-01）

在 package `0.56.5`、选定 ComfyUI core `0.33.0` 的本机环境中，使用 packaged Electron、loopback CDP 和真实 `window.studio` 完成了一次最小 image 任务：

- `startLocalService("comfy", settings)` 成功，runtime 进入 app-owned ready；
- `enqueueImageEdit` 提交 `z-image-turbo`、1024×1024、8 steps、seed 42、单张 PNG；
- `startQueue` 后 ComfyUI 实际完成采样和解码，应用 task 回到 completed/queue idle；
- 通过 `version.taskId` 找到新增 history version，输出 PNG 非空，`readImage` 成功读取，画面与 prompt 相符；
- 应用随后释放并精确清理 app-owned ComfyUI 进程和端口。

这次样例证明的是一条真实 image renderer → preload/IPC → ApplicationRuntime/QueueService → ComfyUI → history/output 闭环；它不改变当前“没有公共 HTTP/Headless/LAN API”的架构结论。
