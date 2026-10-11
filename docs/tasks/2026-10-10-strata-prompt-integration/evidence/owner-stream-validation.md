# Strata P1c：应用 owner、互斥与流式后台

日期：2026-10-11。版本影响：minor 未发布增量，应用仍为 0.65.0。执行：当前 agent，子 agent 0；全树 token/费用 unknown。

## 范围与产品边界

- `ApplicationRuntime` 创建唯一 `StrataRuntimeOwner`，RuntimeAdmin 和 Lifecycle/Prompt 共用；无 Electron globals、公开 HTTP/IPC、持久化 lease 或新增设置/按钮。
- CPU 准备、文本请求、软件安装/卸载同步占用同一操作锁。存在自有 PID（包括 unloaded/lazy 或停止失败）时拒绝软件变更；退出取消 owner，并传递到既有安装取消上下文，等待子树退出和恢复处理。
- `startPrepared` 复查源文件事实、pack/tokenizer、配置与完成记录后启动，绑定经过验证的 model ID；不重 hash/pack，不自动执行。完整 SHA 与官方工具仍在初次准备阶段完成，复用阶段不是第二次全量 hash。
- 文本适配只访问本次拥有的 loopback 服务，临时 Bearer、禁止 redirect；POST `/v1/chat/completions`，显式预算/温度、非 Thinking。SSE 支持跨块 UTF-8/CRLF/keep-alive；忽略 reasoning，仅正文为 provisional delta，正常 stop + DONE + 非空文本后才返回完整结果。length/拒绝/工具/错误/断流拒绝部分结果；每条消息与累计正文有内存安全上限。
- 请求默认总超时 10 分钟；取消、超时或协议失败等待自有树退出，不以 HTTP disconnect 代表 GPU 已释放。停止失败保留 PID/error/占用，退出清理结果失败可重试。外部端口和远程 ComfyUI 不接管、不终止。
- 原 Prompt 和队列的 handoff 先等待 Strata 停止；Strata 请求先释放原 ComfyUI Prompt/cache，释放确认失败不发送请求。原 Prompt 释放按钮不能误取消 Strata 软件操作，停止失败不能报成已释放。
- catalog 仍为 locked，`AppApi.enhancePrompt` 没有 Strata 路由；本阶段没有 Prompt Pack/视觉构造、renderer 流式版本写回或 GPU 推理结论。原模型/默认设置/queue/history/共享模型目录保持，用户权重未读取/hash/加载/下载。

## 自动检查

最终源码：新增 owner/parser/服务请求与接线；原有独立工作保持不动。聚焦 8 文件最初 91 项通过，随后加 2 项 owner/GPU handoff 与真实 admin 安装取消上下文检查，完整 gate 覆盖最终状态。

`npm.cmd run verify` 最终通过：206 文件 /1860 unit，6 文件 /86 integration，typecheck、clean renderer/Electron build、20 text contrast pairs。日志在忽略目录 `temp/strata-phase-c-validation/verify-release-guard.log`。没有用户 Electron 在 clean build 时运行；没有终止其他任务进程。

中途一组历史服务测试发生共享 temp logger 的 EPERM；没有修改或手动删除旧日志，改用本阶段隔离 TEMP/TMP 后聚焦通过。第一次 full gate 的旧 DLSS5 合成安装一项失败，短隔离路径复查15项通过，后续完整 gate 全过；没有改 DLSS5 实现或放宽断言。这些首次失败不算通过证据。jsdom `window.scrollTo` 既有诊断不影响最终测试结果。

## 固定 upstream 真实 HTTP（非模型）

使用用户已安装 v0.1.41 / `fb58e0dbc8399662c0e47c76578c6e878b14f6cf` 的独立 Python 和生产 `StrataService` 进程适配。`--engine mock`，无 CUDA 引擎/模型调用、无 pip/下载。

`temp/strata-phase-c-HpdOpH/http-result.json`：

| 情况 | 实际结果 | 自有 PID /端口 |
| --- | --- | --- |
| 完整 SSE | 正文 `Camera moves forward.`，21字符；成功后正常 stop | 45440 /2997 |
| 收到首正文后取消 | 1字符 provisional，不返回成功结果；等待进程退出 | 54400 /3009 |
| 1ms请求超时 | 0字符，不返回成功结果；等待进程退出 | 58476 /3021 |

这些输出是固定脚本，不证明 Qwen 输出质量、token 性能或实际大模型取消。

## 生产 Electron 原生窗口关闭

忽略目录 test-only bootstrap 仅在生产 `ApplicationRuntime.start` 完成后调用其内部 `services.strata.startPrepared`；使用 P1b 真实官方 CPU 工具生成的微型 GGUF pack/config。未替换 owner/准备验证/启动/清理实现，未新增 IPC 或修改生产 `main.ts` close hook。生产 renderer/preload/main 运行，配置远程不可用 ComfyUI，以验证 Strata 清理与 ComfyUI 是否本地相互独立。

最终 `temp/strata-phase-c-5Yev04/result.json`：Electron PID14380；lazy Strata Python PID59380 /端口3089；CDP3090；`modelLoaded=false`。等待 renderer 加载/可见真实句柄后，准确 PID/title 的 PowerShell `.CloseMainWindow()` 返回 True。没有预停服务、JS window.close 或强杀。

按相同 PID/session 日志：

`Window.CloseRequested → App.Shutdown → App.OwnedComfyStopSkipped（remote） → App.OwnedStrataStopped → Window.Closed`。

随后 PID59380 与 Electron 均不存在，3089/3090 不监听，关闭前后整个隔离持久化 state 严格相等。未连接或终止真实远程服务。此证据是 idle/lazy 原生退出，不覆盖实际 GPU 驻留、活动生成/安装的原生确认 UI（它们目前为服务测试）或未保存设置确认。

首次探针太早检查窗口句柄失败，不计原生退出通过；第二次原生退出资源清理通过，但新建 fixture 的空 workflow 被 renderer 初始选择补齐，严格 state 比较失败，不放宽断言。最终 fixture 在启动前填入同一 bundled workflow 后全量 state 比较通过；只重跑 native 分支，复用已完成 HTTP 证据。失败 fixture 进程/端口也已复核退出。

## 资源与未验项

本阶段自有 mock Python、lazy Python、Electron/CDP 和监听全部退出；tiny fixture/报告/失败资料留在 gitignored temp 供核对。没卸载用户软件、没重启 ComfyUI、没移动共享权重、没启动 GPU、没新增模型下载或 MTP。

剩余：真实 UI/Prompt operation 路由与视觉/Extend 请求、资源预检策略、实际完整权重 hash/pack、Qwen GPU 加载、取消/卸载/队列交接和质量/性能。详见 [TASK](../TASK.md) 的 P2。
