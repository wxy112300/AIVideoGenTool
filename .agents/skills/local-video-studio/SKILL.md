---
name: local-video-studio
description: 在 Local Video Studio 仓库修改或测试 Create、Prompt、Extend、History、Upscale、Settings 和 ComfyUI 运行链路时使用。按用户旅程定位实现，操作真实 Electron AppApi，并分层验证 UI 入队与实际输出。
---

# Local Video Studio：先走通用户路径

命令从包含 `scripts/app-harness.mjs` 的仓库根执行。遵守根 AGENTS 的授权、资源归属和验证分级，不改变用户要求的范围。

## 先用小地图，不先读全库

1. `git status --short`，读目标 diff；跨阶段任务先恢复其 TASK。
2. `npm.cmd run harness:app -- list`，选受影响旅程，再运行 `npm.cmd run harness:app -- guide <id>`，获取源码入口、focused 命令和邻接验收项。
3. 读 [流程图](../../../docs/runbooks/PRODUCT_JOURNEYS.md) 的总图和本次章节。串起“用户入口 → 输入/模式 → 按钮门槛 → AppApi → queue snapshot → runtime → History/回流”，只读这条路径必要源码。模型版本/文件以 catalog 为准。

## 操作入口

- 服务诊断：`npm.cmd run harness:comfy -- probe-prompt-writer` / `scan`，不穿 renderer/IPC。
- 真实应用：Electron renderer 有 `window.studio`，签名在 `src/types.ts` 的 `AppApi`。通过 loopback CDP 使用 [应用 runbook](../../../docs/AGENT_ELECTRON_API_RUNBOOK.md)。不是公开 HTTP API；不要另写临时 IPC 或绕过应用直发 `/prompt`。
- `npm.cmd run harness:app -- inspect --port 9333` 返回实际 UI 入队门槛、runtime、task IDs。额外操作按 AppApi 签名用 `window.studio.method(...)`，保留方法宿主。
- 首次实跑可直接复用 runbook 的 `launch-create-smoke.mjs → prepare-create-smoke.mjs → verify-video-smoke.mjs`：隔离空状态、真实键盘/按钮、History 播放/返回与媒体时长校验。启动器打印实际端口；仅该最小 H3 T2V fixture 使用 prepare，别拿它覆盖用户草稿。

## runtime 离线时要会启动

真实 runtime 验证在授权范围内、资源归属确定时：

```powershell
npm.cmd run harness:app -- start-comfy --port 9333 --timeout 180000
npm.cmd run harness:app -- scan --port 9333 --timeout 180000
```

`start-comfy` 调用应用的 `startLocalService("comfy", settings)` 并检查 ready。不要仅因尚未运行就结束验收；启动失败后报告日志、选中 core/data/Python、端口与下一步。文件扫描、schema、graph、真实输出各自报告。remote 只连接；不要另起 `main.py` 冒充应用生命周期成功。

## UI 修改要验证用户真的能提交

准备隔离 state/素材，走 **缺输入 → 可见阻塞原因 → 补齐 → 真实可用按钮 → 点击 → 新 task/operation ID**。Create/Upscale 按实际 disabled 门槛验证；Prompt 可点击但提示缺输入时，须确认没有模型请求。不要移除 disabled、直接调 handler 或仅 `AppApi.enqueue` 来证明 UI 可用。

```powershell
npm.cmd run test:journeys
npm.cmd run harness:app -- enqueue-ui --port 9333
```

`enqueue-ui` 点击可见 Create/Upscale 按钮并等待新任务，不自动生成。直接 AppApi 提交用于业务/IPC 诊断时单独标注证据层。

按修改选邻接分支：

- 输入/模型：FL2VA 的 T2VA/I2VA/L2VA/FL2VA、R2V 空槽、另一 Create 模式恢复。
- 增强：媒体+空文本、明确指令、全空、Extend 边界、异步切页回写、取消/占用；请求正确与文本质量分开验。
- Extend/AV：Motion Context 无/有 latent；Continuum bootstrap/managed；checking→missing→available；History 继续/重生成/从这里继续。

- Managed 正向：先有真实accepted/receipt再从History实际Continue、缺prompt恢复、鼠标入队；`managed-history-audit.mjs`只审计真实完成/播放及owner/alias/registry，可重启复用。API真实首段仅作夹具、不算UI入口，bootstrap不可代替。官方真实根为 `h3_continuum/runs`，旧 `h3-continuum/runs` 仍兼容；Videos不是Run根。复用段可重新封装，检查receipt实际payload登记和tensor hash，不仅看旧assetId。`comfy-ui.ts`确认保护schema并传冻结head/accepted到下游receipt，`managed_prefix_guard.py`定位实际注册的官方sampler命名空间，在官方Run锁内拒绝过期head或不完整/不兼容前缀，再允许写manifest；不能仅挂到bridge模块，不能改采样身份/hash。真实旧Run前置拒绝与兼容2→3通过，不推广为任意后续失败/崩溃回滚。默认物理隔离，实库必须有用户明确授权、备份及影响核对。
- 设置/加速：新草稿默认；四项 H3 加速设置保存立即更新 waiting，claim 解析、running 冻结；缺节点恢复与 AV/Spectrum/LoRA 快照。
- Prompt 设置：`settings-prompt-smoke.mjs` 复用真实 Settings/增强按钮和重启审计；`--resident` 先真实加载旧模型，`--history` 保护单作品物理副本，两者分开执行。当前 provider 固定 ComfyUI、旧 LM Studio 字段忽略；保存模型不立即卸载旧租约，下一请求从保存设置比较/切换。`EnhanceRequest.modelId` 是生成模型，日志 `promptModelId`/`promptBackend` 才能证明路由。空输入可点击但通知阻塞；API 只准备草稿，真实推理、版本写回与质量分别报告。
- 设置证据选择：先看 [探针表](../../../docs/AGENT_ELECTRON_API_RUNBOOK.md#settings-probes)，只执行本次改变影响的边。`settings-running-smoke.mjs` 必须真实 Queue 开始并在保存前后仍为 running；禁止工厂伪造状态。Attention 的 UI/GPU 与其他三项/failed 的服务测试分开；重启仅应用明确旧内存归一化和实际 stat 大小，其余字段严格比较。旧报告仅对应原文件状态，覆盖/待办只由 TASK 维护。
- History/Upscale：准确 source version、返回父页、播放、派生版本和重启恢复。
- 资产保存/检查/转移/删除：`guide assets` → [资产地图](../../../docs/runbooks/ASSET_LIFECYCLE.md)。按 task/version 查文件并区分 owner/alias；图片库不覆盖视频，归档不等于删除，改目录不等于完整迁移。删除/转移用物理文件也隔离的 fixture；共享引用、原图、run owner 的保护分别验证。

先确认隔离队列只有本次任务；`start-queue` 处理全部 eligible waiting 项。用返回 ID 跟踪：

```powershell
npm.cmd run harness:app -- start-queue --port 9333
npm.cmd run harness:app -- wait-task --task <id> --port 9333 --timeout 600000
```

成功任务可能已移出 queue，按 History 的 task/version 找输出。wait-task 验文件存在/非空，仍需读取/播放与尺寸音轨检查。超时不代表已取消；先 inspect，别盲目重提。

后台 Electron 的 RAF/播放器挂载会节流；UI smoke 使用 focus emulation 时记录该条件。输出时长/帧数须与实际解码核对，不能用请求值自证正确；已知失败留在任务记录，不放宽断言。

## 交付与维护

执行 [验证分级](../../../docs/CHANGE_VERIFICATION.md)。`test:journeys` 是生产 DOM + 合成端口，`verify` 不运行 GPU，都不代替真实 AppApi/生成。说明每条旅程通过到哪层、阻塞/未运行部分和本次 Electron/ComfyUI/端口如何清理。只清理本次拥有资源。

隔离副本收尾复用 `close-fixture-smoke.mjs`：检查匹配 launch/state、停止队列、空闲 Prompt、本地 app ownership 后，经 AppApi 停服务，再请求 JS 关闭并复核 PID/监听。直接 `window.close()` 可能跳过原生退出钩子并遗留 Python；不能用 JS 关闭或该清理 helper 证明原生窗口退出生命周期。

正常窗口退出可用自有Electron主进程 `.CloseMainWindow()` 发送系统关闭请求，无需依赖鼠标命中标题栏×。先核对PID、准确标题、非零窗口句柄，queue/Prompt空闲、无未保存设置及本地ready/app归属；隐藏窗口用现有同profile second-instance show/focus显示并再次核对。不要预停runtime、JS关闭或由测试强杀；按同PID/session日志要求close-requested→shutdown→owned-comfy-stopped→closed，复核自有Python/CDP/8188退出和持久化保护。应用内部会终止自有ComfyUI树，子进程已退出告警不等同残留。配方见runbook；空闲正常退出已验，活动任务/未保存设置/remote仍未验。

新增测试须回答“哪种用户可见错误会使它失败”；保留有用途的协议/快照/hash 完整性测试，不用计数代表用户可用性。改变流程边时同步场景图和 `scripts/harness/journeys.mjs`，不再建一份 catalog 或状态台账。
