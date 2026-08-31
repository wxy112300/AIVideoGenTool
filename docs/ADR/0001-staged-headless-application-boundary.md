# ADR-0001：先建立模块化且流畅的应用边界，延后前后端分离设计

状态：Accepted for modularization
日期：2026-08-31
决策起始提交：`b7182fa020695a3e9e56a45eb5ad61fc79bf6ebd`
关联计划：`docs/Plan/active/2026.8.31-headless-service-web-api-rearchitecture.md`

## Context

Local Video Studio 当前是 Electron desktop application。应用拥有创建、不可变队列快照、历史元数据、环境发现以及由应用启动的本地进程；ComfyUI 负责模型执行。

当前已有可复用基础：

- `src/core/` 包含大量无 Electron global 的确定性领域逻辑；
- queue executor、ComfyUI client、environment 和 runtime services 多数已是 Node/TypeScript 模块；
- `JsonStore` 已有旧数据迁移和进程内串行持久化；
- renderer 已通过 preload 暴露的 `AppApi` 访问 privileged operations。

主要问题是 `electron/main.ts` 同时承担 composition、application orchestration、event delivery、process lifetime、paths、IPC 和 window lifecycle；`src/main.ts` 也同时承担 renderer composition 与跨页面协调。启动在创建窗口前串行等待多项初始化，renderer 的普通刷新会重建整页 DOM；History 已有媒体调度和布局回流的明确性能证据。

如果现在直接增加 Headless 或 HTTP，只会把现有混乱边界复制到新入口，并扩大回归和安全面。当前没有证据要求提前确定 REST、SSE、WebSocket、asset registry、认证或 LAN 模型。

## Decision

### 1. 当前目标是健康的模块化单体

本轮负责在 Electron 内建立清晰的 domain、application、ports、infrastructure 和 platform adapter 边界，并修复测量确认的高影响启动与 renderer 热点。架构健康与性能 Gate 通过即完成，不要求 standalone process、HTTP server 或 browser。

### 2. 使用分阶段抽取，不做 Big-Bang Rewrite

先用 characterization tests 固定可观察行为，再逐个抽取 paths、events、queue、history、draft、settings、prompt、environment、media 和 lifecycle services。每个工作包保持 Electron 行为不变、独立验证并可整包回退。

### 3. Application Services 先于 Runtime Composition

禁止把 `electron/main.ts` 整体搬进新的 Runtime。Embedded `ApplicationRuntime` 只能组装已经存在且有 consumer/tests 的 services，不承载新的业务逻辑。

### 4. 继续保持唯一状态与重资源所有者

当前进程中只能有一个组件拥有：

- state repository 写入；
- queue worker 与 heavy GPU arbitration；
- prompt model lease；
- app-owned local ComfyUI lifetime。

本轮不实现跨进程 ownership 或 data-directory lock，但边界不得妨碍未来增加它们。

### 5. Electron Compatibility 优先

重构期间 Electron 仍是唯一入口。preload IPC channel、payload、return、event、persisted state、media path、workflow 和退出行为保持不变。Electron adapter 逐步变薄，但现有功能始终可用。

### 6. 首轮继续使用 JsonStore

建立最小 `StateRepository` port，但不同时迁移数据库。SQLite 只有在出现已测量的事务、索引或数据规模需求时另立 ADR/Plan。

### 7. Renderer 只做依赖和装配拆分

Renderer client contract 按 application、events、assets/media 和 host capabilities 分区，目的在于降低 `src/main.ts` 与页面耦合、提高测试性。本轮不实现 browser adapter 或 browser fallback。

### 8. Headless/API/Browser/LAN 全部延后

这些能力不是本 ADR 的实施决定。架构健康 Gate 通过后，只有用户明确批准才新建 Plan，并根据届时真实边界重新决定：

- embedded 与 standalone process ownership；
- data-directory lock 和 lifecycle；
- API transport 与 event delivery；
- asset/media identity；
- authentication、authorization 与 LAN security。

本 ADR 不预先选择 REST、SSE、WebSocket、TLS 或 token scope。

### 9. 性能优化服从模块边界和行为兼容

- 先建立 cold/warm startup、first usable render、Long Task、render count 和 History 500 条基线；
- 启动区分首屏必需与可延后任务，但 migration、state consistency 和 lifecycle ownership 不得被异步化破坏；
- 优先删除无效整页刷新、屏外媒体工作和布局读写交错；
- 每个性能改动保持现有 Electron 入口可运行，可独立验证和回退；
- 动画与 skeleton 只能改善反馈，不能替代主线程和启动关键路径修复。

## Required Gates

- M0：Plan、ADR、characterization 和 verify baseline 固定；
- M3：backend application modules 不依赖 Electron，IPC 只做 adapter，桌面行为等价；
- M4：renderer 页面依赖窄 interfaces，preload 与 UX 行为等价；
- M5：两个 main 文件成为 composition/platform entry，ownership 清晰；启动、History 和高频交互有前后性能证据；完整验证通过。

任何 Gate 未通过都不能用“以后前后端分离时再补”绕过。

## Contract Timing

`docs/ARCHITECTURE_CONTRACT.md` 只描述已经实现并验证的当前事实：

- WP-00 不把未来 Headless/HTTP ownership 写成当前事实；
- 每个模块化 checkpoint 通过后，再更新对应 ownership map；
- M5 同步更新 `docs/AGENT_START_HERE.md` 的 source map；
- 未来若批准 standalone 或 network capability，再以新的 ADR/Plan 更新 process/trust boundary。

## Consequences

正面结果：

- 工作集中在已经造成修改成本的真实耦合；
- 每一步保持桌面功能可用并可定位回归；
- queue/GPU/process/state ownership 更明确；
- 未来可以选择 Headless 或继续保持桌面应用，不被当前猜测锁定。

成本与限制：

- 前置模块化会产生多个 Patch 工作包；
- 迁移期需要维护 Electron compatibility adapters；
- `electron/main.ts` 和 `src/main.ts` 是串行 hotspot；
- 每个 checkpoint 都需要 focused tests、full verify 和适用 Electron smoke。

## Non-goals

本 ADR 不授权：

- standalone daemon、HTTP、Browser、Agent/CLI/MCP 或 LAN；
- SQLite、微服务、CQRS、事件溯源或插件架构；
- renderer framework 重写；
- 修改 model/workflow/GPU policy；
- 删除 Electron IPC fallback 或旧 state/history/media compatibility；
- 为未来网络能力提前创建未使用 abstraction。
