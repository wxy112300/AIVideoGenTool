# P09 当前 renderer 的 Queue 任务优先构图提案

状态：`proposed`，等待 G10 人工/强模型批准。本文只基于当前 `src/renderer/`、`src/styles/`、当前 renderer manifest 和真实 Vite/Electron fixture；不使用 `prototypes/` 的旧设计，也不在本 package 修改生产 renderer。

更新日期：2026-08-20；当前 package version：`0.31.4`。

## 1. Source map 与 preserve list

Queue 当前由以下生产 surface 组成：

- 页面层级：`src/renderer/pages/queue/page.ts`；
- 任务卡与运行态：`src/renderer/pages/queue/card.ts`、`live-status.ts`、`controller.ts`；
- 当前 cascade：`src/styles/01-foundation.css`、`src/styles/02-visual-refresh.css`、`src/styles/05-density-refinement.css`；
- 运行态数据通过现有 `AppState.queue`、`queueLifecycle`、`ComfyRuntimeState` 和 performance metrics 进入 renderer。

必须保持：

1. 一个逻辑任务只渲染一张 queue card；running task 不在其他区域重复出现；
2. queue 顺序、waiting/running/failed/cancelled 状态、pause/resume/cancel/retry/edit/duplicate/remove/reorder 语义不变；
3. queue primary action、live preview 开关、ComfyUI ownership/status 和 operation feedback 的现有 IPC/payload 不变；
4. telemetry/live preview 刷新继续走局部 DOM patch，不重建焦点中的表单或整张运行卡；
5. 错误文案、recoverable action、任务快照和 History 输出元数据保持一致；
6. 760px 以下 topbar normal flow、P05 sticky heading 和全局通知层级保持现状。

## 2. Current renderer evidence

manifest fixture `queue-mixed` 目前覆盖 `1440×900`、`1280×800`、`900×800`、`760×800` 及 `1121/1120/901/900/761/760` 断点。它是合成的 waiting + failed queue，manifest 已明确标注：真实 running state 仍待 runtime smoke。

当前画面观察：

- 1440px：heading 同时承载 queue count、ComfyUI 状态、ETA/elapsed、live preview 和开始按钮；四张 CPU/RAM/GPU/VRAM 卡先于“执行队列”，waiting card 与“需要处理” failed card 分成两个 section；
- 900px：performance cards 变为 2×2，task preview/card 内容保持双列，操作按钮移动到整行，主要动作仍可达；长页面中 failed section 位于 waiting 内容之后；
- 当前 baseline 没有证明 running card 的真实 preview、stage/progress、elapsed、pause/cancel 和 live telemetry 刷新，不能把 synthetic `queue-mixed` 当作 live running approval；
- telemetry 目前在 active task 之前，用户进入 Queue 后首先看到环境数字而不是正在执行的任务；empty state 仍可直接进入 Create，但不需要四张完整 telemetry 卡占据主体。

证据边界：标准 capture harness 的 route-after-load DOM wait race 仍需在 G10 前用隔离 renderer smoke 重新取证；截图是当前 renderer 的结构证据，不等价于真实 ComfyUI 生成成功。

## 3. Proposed composition

### 1280px 以上

保留当前 heading 的操作位置，但将“当前 active task”提升为 heading 后的第一个主体：

```text
Queue heading + primary action
→ operation/status feedback（仅在可见时）
→ expanded active task（preview / stage / total + local progress / elapsed / ETA / pause-cancel）
→ compact key telemetry（CPU / GPU / VRAM，次要信息可展开）
→ pending queue
→ failed/cancelled recovery section
```

没有 running task 时，保留 compact environment status 和 pending queue；不要渲染一个看起来像“正在执行”的空 expanded card。失败任务继续保留 error summary 和 retry/recovery action，但不抢 active task 的主层级。

### 901–1120px 与 900px

- heading 保留 title/count/runtime 与 primary action 的关系；ETA/elapsed 允许换行但不能挤压主按钮；
- running card 采用单主阅读列：preview、任务名/status、总进度和局部 stage 先于低频 telemetry；pause/cancel/recovery 始终在首屏或紧邻任务主体；
- CPU/RAM/GPU/VRAM 进入 active task 的紧凑 evidence strip，不能让 2×2 telemetry 把 running task 推出首屏；
- pending task 保持 compact card，操作按钮在卡片尾部换行，failed/cancelled 只显示必要的错误与恢复入口；
- 不用负 margin、隐藏横向滚动或 CSS `order` 制造 Tab 顺序与视觉顺序分离。

### 760px 以下

- heading 进入当前 normal-flow 规则；primary action 和 queue status 仍在 title 后可达；
- active task 完整单列，preview 使用受控高度，progress/status/主要控制优先；telemetry 变为可折叠或紧凑列表；
- pending/failed cards 的 metadata 可换行，按钮不超出 viewport；长错误可以滚动但必须保留 retry/locate/log 等恢复入口。

## 4. States and interaction order

G10/P10 必须分别检查：running、paused、failed、recoverable、empty、multiple pending 六种状态。视觉与 DOM 顺序应保持：

```text
heading → operation status → active task → key telemetry → pending tasks → attention/recovery
```

需要保留的行为证据：

- running 期间 preview/elapsed/stage 更新不抢焦点、不重建 Prompt 或 queue 编辑表单；
- pause/resume/cancel 的 busy 与失败状态可读，并不会让主 action 产生重复提交；
- retry/edit/duplicate/remove/reorder 只作用于对应 task；
- 多个 waiting task 不因 telemetry 刷新改变顺序或卡片高度；
- queue 结束后的完成通知与 error 通知遵循 P06 的持久/恢复策略；
- 键盘可以到达 primary action、preview toggle、task controls 和 recovery action，Tab 顺序与视觉顺序一致。

## 5. G10 approval checklist

G10 只有在以下 evidence 齐全后才可标记 `approved`：

1. 六种 queue state 在 `1440×900`、`1280×800`、`900×800`、`760×800` 以及 `1121/1120/901/900/761/760` 断点有当前 renderer 截图或 DOM diagnose；
2. 至少一次真实或隔离 mock-preload running smoke 证明 active task 首先出现，包含 progress、preview、elapsed、pause/cancel 和 telemetry 更新；
3. 900×800 首屏可见 active task 的状态、主要 progress 和 pause/cancel/recovery context，不被四张 telemetry 卡隔开；
4. empty state 不伪装 running；failed/recoverable state 有可达恢复路径；
5. `document.documentElement.scrollWidth === document.documentElement.clientWidth`，并记录最宽元素；
6. queue controls、live DOM patch、focused inputs、notification completion/error 和 `npm.cmd run verify` 通过。

## 6. Non-goals for P09

- 不修改 queue state machine、估时算法、ComfyUI API、pause/cancel IPC、preview 开关语义或 task/history schema；
- 不把旧 prototype 的 queue 构图、配色或文案作为候选实现；
- 不在 G10 前修改 `src/renderer/pages/queue/` 或 Queue-owned CSS；
- 不把 synthetic waiting + failed fixture 当作 live running 证据。
