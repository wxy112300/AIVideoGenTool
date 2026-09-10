# Agent Start Here

代码地图，不是全量阅读清单。工作分类见 [文档入口](README.md)，跨阶段任务用 [单 agent 优先流程](development/WORKFLOW.md)。先检查当前 diff，再进入目标路径；旧计划不代表当前实现状态。

## 请求 → 契约 → 代码

| 请求 | 必要契约/参考 | 实现入口 |
| --- | --- | --- |
| Queue、历史、持久化、路径、IPC | [Architecture](ARCHITECTURE_CONTRACT.md) | `src/core/queue*.ts`、`electron/queue-*.ts`、`electron/store.ts`、`src/types.ts` |
| 应用生命周期、运行时 | Architecture | `electron/application-runtime.ts`、`electron/services/`、`electron/ports/`、`electron/*-ipc.ts` |
| Renderer 交互/布局 | [UX](UX_CONTRACT.md) | `src/renderer/pages/`、`src/styles/`、`src/renderer/render-coordinator.ts` |
| History 媒体调度/滚动性能 | UX；按需查 [性能证据](research/history/2026.9.1-wp-c04-electron-performance-evidence.md) | `src/renderer/pages/history/`、render coordinator |
| 模型、LoRA、节点 | [Workflow](WORKFLOW_CONTRACT.md) | `src/core/catalog/models/`、`catalog/loras/`、`catalog/dependencies/` |
| 视频 graph/参数 | Workflow | `src/core/workflow.ts`、`video-policy.ts`、`workflows/` |
| 新图片编辑模型 | Workflow + UX（有 UI 变化时） | `src/core/image-workflow.ts`、image draft/queue/history 模块、catalog |
| Extend / 长视频 | Workflow；先找对应 [TASK](tasks/README.md) | `src/core/` 的 extension/artifact helpers、`electron/queue-*`、`electron/services/extension-media.ts` |
| Prompt 增强 | [Prompt Pack](PROMPT_PACK_DESIGN.md) + Workflow | `src/core/prompts/`、`src/renderer/prompt-packs.ts`、prompt services/catalog |
| 环境/节点安装升级 | [Dependencies](DEPENDENCIES_AND_SETUP.md) | `electron/services/environment.ts`、dependency scanner/installer、`src/infrastructure/dependency-node-adapters.ts`、Settings controllers |
| DLSS5 历史归档 | [DLSS5 archive](archive/dlss5/README.md) | 旧 ID/兼容卸载、保留的 upscale 面板接缝；新 provider 需另建任务 |
| 真实 Electron 验收 | [API runbook](AGENT_ELECTRON_API_RUNBOOK.md) + Architecture | preload `window.studio`、typed AppApi、loopback CDP、`scripts/capture-c04-electron-evidence.mjs` |
| 文档/agent 流程 | [Document policy](development/DOCUMENT_POLICY.md) | AGENTS、docs 入口、对应 TASK；不运行 GPU |

路径以仓库根为基准；表中缩写与通配符需先用 `rg --files` 定位，不猜文件存在。

## 单一事实来源

- 组件文件名、下载路径、兼容性：catalog；不复制到手工维护的第二张模型清单。节点优先级由 `customNodeCatalog` 的 `priority` 定义。
- 持久化默认值/迁移：`src/core/defaults.ts`、`electron/store.ts`、`src/types.ts`。新任务沿用旧 ID，替代须设计迁移。
- 队列快照：`src/core/queue-task-factory.ts`；执行与副作用：`electron/queue-executor.ts`、`queue-execution-side-effects.ts`、`queue-worker.ts`。
- 应用服务图：`electron/application-runtime.ts` 不引入 Electron globals；`electron/main.ts` 是 Electron composition root。
- Renderer：`src/renderer/entry.ts` 是 preload 入口，`studio-client.ts` 和 context 向页面传能力；页面不直接读 preload global。
- 当前功能约束：架构/UX/工作流契约。当前任务下一步：TASK。历史实验结果：带日期与版本的 evidence。

## 进入运行时前

模型接入按 [Workflow 的 Integration Checklist](WORKFLOW_CONTRACT.md#model-integration-checklist)完成 UI、snapshot、adapter、文件/节点扫描、执行、错误、取消/恢复和历史闭环。
包文件存在、schema 通过、真实输出成功分别报告。

`npm.cmd ci` 只安装本仓库应用依赖；ComfyUI 核心、选定 Python、注册 custom node、模型权重是独立层。检查实际选中实例，不能把另一个 data 目录的安装结果当作成功。Settings 安装/卸载行为与备份策略见 Dependencies。

真实 app smoke 按 API runbook 运行；原始 ComfyUI 请求只证明下层服务，不能证明 UI/IPC/queue/history 全链路。构建、运行与 cleanup 要先协调资源。验证命令和回归范围统一见 [CHANGE_VERIFICATION](CHANGE_VERIFICATION.md)，此处不重复维护。

## 历史资料

全量分类见 [DOCUMENT_INVENTORY](development/DOCUMENT_INVENTORY.md)，默认不读；已归档内容见 [archive](archive/README.md)。
图片、H3 Native/长视频、旧 recovery handoff 均含不同日期的实现状态。只有任务需要其证据时按章节引用；不要从旧版本号、旧 CPU VAE 或旧 phase 清单恢复当前策略。
