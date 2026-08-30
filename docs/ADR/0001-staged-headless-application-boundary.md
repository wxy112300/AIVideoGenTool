# ADR-0001：渐进抽取 Application Boundary，再引入 Headless 与网络传输

状态：Accepted for staged implementation
日期：2026-08-31
决策起始提交：`b7182fa020695a3e9e56a45eb5ad61fc79bf6ebd`
关联计划：`docs/Plan/active/2026.8.31-headless-service-web-api-rearchitecture.md`

## Context

Local Video Studio 当前是 Electron desktop client。应用拥有创建、不可变队列快照、历史元数据、环境发现以及由应用启动的本地进程；ComfyUI 负责模型执行。

当前实现已有可复用基础：

- `src/core/` 包含大量无 Electron global 的确定性领域逻辑；
- queue executor、ComfyUI client、environment 和 runtime services 多数已是 Node/TypeScript 模块；
- `JsonStore` 已有旧数据迁移和进程内串行持久化；
- renderer 已通过 preload 暴露的 `AppApi` 访问 privileged operations。

主要问题是 `electron/main.ts` 同时承担 composition root、application orchestration、event delivery、process lifetime、paths、IPC handlers 和 window lifecycle。完整 backend 只能在 Electron ready 后启动，业务事件直接发送给单个窗口，renderer 的 `AppApi` 又混合业务命令、文件传输、主机原生能力和窗口生命周期。

如果直接把现有 IPC 映射为 HTTP，会保留错误的模块边界，并可能把任意路径、依赖安装、进程停止、历史删除和主机 shell 操作暴露给网络客户端。

## Decision

### 1. 使用分阶段模块化，不做 big-bang rewrite

先用 characterization tests 固定当前可观察行为，再逐个抽取 paths、events、queue、history、draft、settings、prompt、environment、media 和 lifecycle application services。每个工作包保持 Electron 行为不变、独立验证并可整包回退。

### 2. Application services 必须先于 StudioRuntime

禁止先把 `electron/main.ts` 的现有职责整体搬进新的 Runtime。完整 `StudioRuntime` 只负责组装已经 transport-neutral 的 services，并在所有 application seams 建立后才创建。

### 3. Backend 是唯一状态和重资源所有者

进入 standalone mode 后，只有一个 backend instance 可以：

- 写 state repository；
- 持有 queue worker；
- 仲裁 heavy GPU generation/post-processing；
- 管理 prompt model lease；
- 管理 app-owned local ComfyUI。

Electron、Browser、CLI、Agent 和 MCP adapter 都是 client。禁止 Electron embedded backend 与 standalone daemon 同时写同一 data directory。

### 4. Embedded compatibility 先于 standalone capability

前置重构期间 Electron 仍是唯一入口，preload IPC channel、payload、return、event name、persisted state 和窗口退出行为保持不变。只有 transport-neutral backend Gate 通过后，才增加独立 Node entrypoint。

### 5. 首个 Headless 版本继续使用 JsonStore

建立 `StateRepository` port，但不把 daemon 化、HTTP 化和数据库迁移放在同一阶段。`JsonStore` 继续负责兼容旧 `studio-state.json`；跨进程唯一性由 standalone 阶段的 data-directory lock 保证。SQLite 只有在出现已测量的事务、索引或数据规模需求时另立 ADR/Plan。

### 6. HTTP 晚于 Headless process

验证普通 Node process 可以在无窗口、无 IPC、无 HTTP 的条件下 load、recover、execute application commands、persist 和 stop 后，才增加网络传输。

网络能力按顺序交付：

1. loopback read-only foundation；
2. opaque asset registry 与 upload/import；
3. idempotent commands 与 revision control；
4. SSE event delivery；
5. HTTP media/history；
6. localhost browser；
7. Agent/CLI；
8. LAN hardening。

### 7. Browser 不继承 Electron 主机语义

Renderer client contract 分为 application commands/queries、events、assets/media 和 host capabilities。浏览器使用 upload/download 和 opaque asset/media IDs；Explorer、system player、native picker、window close 等能力由 platform adapter 显式支持或标记 unavailable。

### 8. LAN 默认关闭

API 默认只绑定 loopback 并要求认证。LAN 必须显式启用，并在发布前具备 pairing、可撤销 token、viewer/operator/admin scope、Origin/Host 防护、限额、审计以及 TLS 或可信代理/VPN 边界。普通 Agent/operator 默认没有 destructive 或 runtime-admin 权限。

## Required Gates

- C0：Plan、ADR、characterization 和全量 baseline 固定；
- C1：Electron 内部 application services 完成，功能行为等价；
- C2：backend modules 不 import Electron，IPC 只做 adapter，Node integration 可 load/recover/subscribe/command/persist/stop；
- R-Gate：renderer 不直接依赖 `window.studio`/宽 `AppApi`，Electron UX 行为等价；
- C3：独立 Headless process，无 HTTP；
- C4：受认证的 loopback API；
- C5：localhost browser 与 Agent/CLI；
- C6：LAN security/release。

任何 Gate 未通过都不能用“后续工作包补齐”绕过。

## Contract Timing

`docs/ARCHITECTURE_CONTRACT.md` 只描述已经实现并验证的当前事实：

- WP-00 不把未来 Headless/HTTP ownership 写入当前 contract；
- embedded application layer 实现并通过对应 checkpoint 后，再更新当前 ownership map；
- Headless process 验证通过后，再更新 system/process boundary；
- HTTP trust boundary 验证通过后，再更新 transport contract。

同一 checkpoint 还应同步更新 `docs/AGENT_START_HERE.md` 的 source map。

## Consequences

正面结果：

- 现有领域逻辑和 runtime integrations 可以复用；
- 每一步保持桌面功能可用，回归来源可定位；
- Electron、Browser 和 Agent 最终共享同一 application path；
- queue/GPU/process/state ownership 变得明确；
- LAN 不会直接继承现有 IPC 的本机信任假设。

成本与限制：

- 前置模块化会产生多个 Patch 工作包，Headless capability 不会立刻出现；
- 迁移期需要维护 Electron compatibility adapters；
- `electron/main.ts` 和 `src/main.ts` 是串行 hotspot，不能通过多 Agent 并发强行加速；
- 每个 checkpoint 都需要 focused tests、适用的 full verify 和人工 Electron smoke。

## Non-goals

本 ADR 不授权：

- 同时迁移 SQLite；
- 重写 renderer framework；
- 修改 model/workflow/GPU policy；
- 拆分微服务；
- 默认开放 LAN；
- 直接公开 ComfyUI API；
- 删除 Electron IPC fallback 或旧 state/history/media compatibility。
