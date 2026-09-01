# Agent-controlled Electron Application API Smoke Runbook

本文记录 Agent 如何操作 Local Video Studio 的真实应用功能，以及如何把结果区分为静态、合成和真实运行时证据。它描述的是当前已经存在的本机测试/操作桥接，不是一个新增加的公共 HTTP、Headless、Browser 或 LAN API。

## 1. 当前边界

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

先在仓库根目录构建当前 renderer，再用显式 loopback remote-debugging 端口启动生产 Electron：

```powershell
npm.cmd run build
node_modules\.bin\electron.cmd --remote-debugging-port=9333 .
```

启动参数只应由 Agent/测试显式加入，不能写入产品默认启动命令。测试结束后必须关闭本次启动的 Electron，并确认 `9333` 和应用配置的 ComfyUI 端口没有残留监听。

如果测试主机的 Chromium sandbox/GPU 不能启动，可以临时使用隔离测试开关：

```powershell
node_modules\.bin\electron.cmd --remote-debugging-port=9333 --no-sandbox --disable-gpu --disable-gpu-compositing --in-process-gpu .
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

- task 状态从 waiting/running 到 completed，不能只看按钮文字或 queue 数量；
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
