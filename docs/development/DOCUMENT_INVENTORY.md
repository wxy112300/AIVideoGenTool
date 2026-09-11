# 文档分类盘点

盘点日期：2026-09-07（初始快照）。盘点开始时的 `docs/**/*.md` 快照共 58 份；期间新建的 `docs/README.md` 以及本轮新治理/tasks 文档均排除在表外，`docs/development/**` 也不计入。表中“已声明状态”只记录文档开头或必要片段的自述，不代表本次确认其完成，也不代表活跃任务的拥有权或任何运行验证。本轮已实际移动 27 份文档；当前入口以 `docs/README.md`、`docs/tasks/README.md`、`docs/research/README.md` 和 `docs/archive/README.md` 为准。

类别仅用于导航：`contract` 是当前边界/不变量，`runbook` 是操作或验证步骤，`plan` 是实施计划，`research` 是调查/指南，`evidence` 是证据或基线，`archive` 是历史材料，`index` 是入口或目录。

| 文档 | 类别 | 已声明状态 | 建议 | 风险 |
|---|---|---|---|---|
| [ADR 0001](../ADR/0001-staged-headless-application-boundary.md) | contract | Accepted for modularization | current reference | 关联已归档计划且含 accepted residual；需与当前边界和实现同步。 |
| [Electron API smoke runbook](../AGENT_ELECTRON_API_RUNBOOK.md) | runbook | unknown | keep | 未见开头状态；步骤可能依赖当前 Electron API，需单独复核。 |
| [Agent Start Here](../AGENT_START_HERE.md) | index | unknown | current reference | 是主要导航入口；若分类或链接过期会把代理带入历史方案。 |
| [ALLinONE H3 adoption plan](../archive/h3-adoption/ALLINONE_H3_ADOPTION_PLAN.md) | archive | 多个 Phase 自称已完成；保留为历史总览 | keep | 当前 H3 状态由高分辨率 TASK、Workflow Contract 与研究/证据入口决定。 |
| [Architecture Contract](../ARCHITECTURE_CONTRACT.md) | contract | unknown | current reference | 契约正文与当前模块边界需持续对照实现和证据。 |
| [archive README](../archive/README.md) | index | 归档说明 | keep | 主题归档入口列出历史来源，当前任务状态仍从 TASK 进入。 |
| [Apple HIG UX improvement plan](../archive/ux-ui/APPLE_HIG_UX_IMPROVEMENT_PLAN.md) | archive | planning draft / historical research | keep | 明确不是当前视觉方向，但仍在较深目录外可被搜索命中。 |
| [UX/UI archive README](../archive/ux-ui/README.md) | index | P00–P20 已完成；UI/UX 主线已收口 | keep | 历史完成状态与当前 renderer 证据需保持一致。 |
| [UX/UI baseline manifest](../archive/ux-ui/UX_UI_BASELINE_MANIFEST.md) | archive | historical / superseded | keep | 重复标题和历史 prototype 术语可能被误当作当前基线。 |
| [UX/UI CSS metrics baseline](../archive/ux-ui/UX_UI_CSS_METRICS_BASELINE.md) | archive | unknown | keep | 未见开头状态；指标可能已被后续 P20/当前 CSS 取代。 |
| [UX/UI incremental implementation plan](../archive/ux-ui/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md) | archive | 已完成，P20/G18 收口 | keep | 详细完成叙述很容易被当成当前执行计划；生产事实需以代码和现行合同为准。 |
| [UX/UI Luna execution guide](../archive/ux-ui/UX_UI_LUNA_EXECUTION_GUIDE.md) | archive | 配套使用（未见独立完成状态） | keep | 仍含模型派发语境，可能与新的 Astra/Sol/Luna 治理流程冲突。 |
| [P01 renderer proposal](../archive/ux-ui/UX_UI_P01_RENDERER_PROPOSAL.md) | archive | approved as source direction | keep | 旧 phase 批准不等于当前产品决策，需防止被单独引用。 |
| [P01 visual proposal](../archive/ux-ui/UX_UI_P01_VISUAL_PROPOSAL.md) | archive | superseded / historical | keep | 文件明确降级，但旧视觉 token 仍可能被全文搜索采纳。 |
| [P07 renderer proposal](../archive/ux-ui/UX_UI_P07_RENDERER_PROPOSAL.md) | archive | approved（G08） | keep | phase 批准记录与当前 CSS/renderer 可能脱节。 |
| [P09 renderer proposal](../archive/ux-ui/UX_UI_P09_RENDERER_PROPOSAL.md) | archive | approved（G10），局部修正已记录 | keep | 历史 Queue 构图与后续实现演进混在同一文件。 |
| [P11 renderer proposal](../archive/ux-ui/UX_UI_P11_RENDERER_PROPOSAL.md) | archive | verified/integrated | keep | 已集成的历史 phase 仍可能被误作待办。 |
| [P15 renderer proposal](../archive/ux-ui/UX_UI_P15_RENDERER_PROPOSAL.md) | archive | verified/integrated | keep | 版本号和 phase 记录是历史审计信息，不是当前入口。 |
| [P16 renderer proposal](../archive/ux-ui/UX_UI_P16_RENDERER_PROPOSAL.md) | archive | evidence complete / G15 approved / P17 implemented | keep | 旧 Settings 结构决策需与现行 UX contract 对照后再引用。 |
| [P18 settings copy inventory](../archive/ux-ui/UX_UI_P18_SETTINGS_COPY_INVENTORY.md) | archive | historical inventory | keep | 文案/状态字段可能随本地化和 Settings 变化而过期。 |
| [P19 CSS owner map](../archive/ux-ui/UX_UI_P19_CSS_OWNER_MAP.md) | archive | UI/UX line closed at v0.41.3 | keep | owner map 强依赖旧 CSS import/order，不能作为当前唯一事实。 |
| [Change Verification](../CHANGE_VERIFICATION.md) | runbook | unknown | current reference | 新增文档，未见独立状态；需与实际可运行检查持续对齐。 |
| [Cloud implementation status](../archive/legacy-handoff/CLOUD_IMPLEMENTATION_STATUS.md) | archive | 明确标为历史说明，不代表 2026-07-24 后实际完成度 | keep | 旧云端/本机边界仅供追溯，当前接续从 TASK 与契约进入。 |
| [Dependencies and setup](../DEPENDENCIES_AND_SETUP.md) | runbook | unknown | current reference | 当前依赖、版本和修复流程变化快；需以真实扫描/安装结果复核。 |
| [H3 community guide research](../research/h3/H3_COMMUNITY_GUIDE_RESEARCH.md) | research | 社区来源和经验数据；非产品契约 | keep | 来源时效短，必须与当前 TASK/契约分开使用。 |
| [H3 long-video P0 evidence](../tasks/2026-09-07-h3-long-video/evidence/H3_LONG_VIDEO_P0_EVIDENCE.md) | evidence | runtime/core/schema 基线已完成；真实 workflow/生成未完成 | current reference | 静态基线不能证明 Native long-video runtime-ready，且依赖 ComfyUI 环境。 |
| [H3 Memory 路线撤回说明](../archive/h3-memory/README.md) | archive | 失败路线已撤回；旧长计划已删除 | current boundary | 旧字段只读兼容，不能重新成为当前实施入口。 |
| [H3 Native Masked AV long-video plan](../archive/h3-long-video/H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md) | archive | Native Masked AV 尚未实现、无真实生成证据 | keep | 与 P0 evidence 和 ComfyUI 版本状态耦合；由长视频 TASK 接续。 |
| [H3 P0 evidence baseline](../tasks/2026-09-07-h3-long-video/evidence/H3_P0_EVIDENCE_BASELINE.md) | evidence | 记录 Phase 0 范围与基线 | current reference | 证据基线不能替代运行时完成度。 |
| [H3 prompt writing guide](../research/h3/H3_PROMPT_WRITING_GUIDE.md) | research | 社区提示词总结；非默认策略 | keep | 不直接升级为模型/工作流契约。 |
| [History performance optimization plan](../archive/history-performance/HISTORY_PERFORMANCE_OPTIMIZATION_PLAN.md) | archive | 已实施并收口；严格指标残差保留 | keep | 接受项与未技术通过的指标由 research/history 证据区分。 |
| [Image edit model research](../research/image-edit/IMAGE_EDIT_MODEL_RESEARCH.md) | research | Klein 已接入；真实权重下载和两模型 GPU smoke test 待完成 | current reference | “已接入”不等于真实运行就绪，GPU/权重证据仍缺。 |
| [Image workspace implementation plan](../archive/image-workspace/IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md) | archive | 交互/真实图片闭环完成；独立 AI 放大待完成 | keep | 混合范围由图片工作台 TASK 接续，不把放大能力视为完成。 |
| [Local Codex handoff](../archive/h3-adoption/LOCAL_CODEX_HANDOFF.md) | archive | H3 V3 handoff 的历史接续记录 | keep | 强依赖某次 session 和未提交状态，当前接续由 H3 TASK 承担。 |
| [Localization Contract](../LOCALIZATION_CONTRACT.md) | contract | unknown | current reference | 未见状态；应确认本地化规则仍覆盖当前 renderer/文档入口。 |
| [Long-video capability enhancement plan](../archive/h3-long-video/LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md) | archive | Draft；未声称 Native runtime-ready | keep | 历史总计划与多个 H3 子方案的关系由长视频 TASK 统一收口。 |
| [Model Catalog Design](../MODEL_CATALOG_DESIGN.md) | contract | unknown | current reference | 设计文档未标当前/历史，catalog 真相源变化时有漂移风险。 |
| [Headless service/Web API rearchitecture](../archive/modular-architecture/2026.8.31-headless-service-web-api-rearchitecture.md) | archive | Completed（含 accepted residual） | keep | 已收口架构计划；当前边界以 Architecture Contract 为准。 |
| [X-MinimaxH3 adoption v1](../archive/h3-adoption/2026.8.31-x-minimaxh3-feature-adoption.md) | archive | Superseded | keep | 已由后续 H3 恢复/当前 TASK 取代。 |
| [X-MinimaxH3 adoption v2](../archive/h3-adoption/2026.9.1-x-minimaxh3-feature-adoption-v2.md) | archive | Superseded / historical implementation draft | keep | 已被 V3 与当前 H3 TASK 取代。 |
| [H3 V3 recovery handoff](../archive/h3-adoption/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3-handoff.md) | archive | WP2 Gate 未完成；WP4–WP8 不得声称完成 | keep | handoff 依赖历史未提交工作区，当前接续由 TASK 承担。 |
| [H3 V3 recovery plan](../archive/h3-adoption/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3.md) | archive | Partially completed / retained as recovery history | keep | 目标代理和逐 Gate 要求保留为历史，当前状态由 TASK 承担。 |
| [DLSS5 dual-provider integration](../archive/dlss5/2026.9.4-dlss5-dual-provider-parallel-integration.md) | archive | Retired；HECer/AetherScale 均淘汰 | keep | 历史实施参考；当前不再作为 provider 或任务入口。 |
| [ComfyUI settings rearchitecture](../archive/comfyui-settings/2026.8.27-comfyui-settings-rearchitecture.md) | archive | Archived；WP-00–WP-06 完成 | keep | 统一归入 `archive/**`，旧 `Plan/archive` 路径不再作为入口。 |
| [AD-01 H3 runtime/ComfyUI investigation](../research/h3/2026.8.31-ad01-x-minimaxh3-runtime-comfyui-investigation.md) | research | Static validated | keep | 归属已被取代的 adoption 计划；作为研究证据保留。 |
| [WP-C03 History detail source of truth](../research/history/2026.8.31-wp-c03-history-detail-source-of-truth.md) | research | 记录 harness 已淘汰结构 | keep | 历史边界与当前 History 契约分开。 |
| [WP-01/WP-P00 performance baseline](../research/history/2026.8.31-wp01-wpp00-boundary-performance-baseline.md) | research | 历史 baseline | keep | 性能结论依赖当时边界；与 C04/History 最新证据关联。 |
| [WP-C04 Electron performance evidence](../research/history/2026.9.1-wp-c04-electron-performance-evidence.md) | research | Completed，严格性能预算残差未技术通过 | current reference | 用户接受项不能被改写成自动化性能通过，记录含历史机器路径。 |
| [H3 1080p/1440p integration research](../research/h3/2026.9.2-h3-1080-1440-integration-research.md) | research | 当前实施决策输入；不代表已产品化 | current reference | 调研结论与当前 H3 TASK 的 Gate 绑定。 |
| [DLSS5 upscale integration research](../archive/dlss5/2026.9.3-dlss5-upscale-integration-plan.md) | archive | Retired / historical static research | keep | 旧候选路线不重新成为执行入口。 |
| [Product Requirements](../PRODUCT_REQUIREMENTS.md) | contract | unknown | current reference | 根需求未标版本/状态，可能与当前图片、队列和模型边界不完全一致。 |
| [Prompt Pack Design](../PROMPT_PACK_DESIGN.md) | contract | unknown | current reference | 设计规则未标状态，需检查与当前 defaults/persistence 的一致性。 |
| [Renderer modularization plan](../archive/modular-architecture/RENDERER_MODULARIZATION_PLAN.md) | archive | Superseded / historical architecture plan | keep | 当前模块边界以 Architecture Contract 和已收口计划为准。 |
| [UX Contract](../UX_CONTRACT.md) | contract | unknown | current reference | 当前 renderer source-of-truth 规则清晰，但未显式版本/状态。 |
| [P20 renderer QA report](../UX_UI_P20_QA_REPORT.md) | evidence | P20/G18 自动化交付与最终验收已完成 | current reference | 旧版本号与当前 renderer 会继续变化，不能替代新 UI smoke。 |
| [UX/UI renderer baseline](../UX_UI_RENDERER_BASELINE.md) | evidence | verified；当前 UI 唯一视觉基线 | current reference | 截图基线绑定旧版本和固定 fixture，后续 CSS 变更需重新生成。 |
| [Video Extend design](../VIDEO_EXTENSION_DESIGN.md) | contract | unknown | current reference | 设计边界未标状态，需确认与当前图片/视频历史结构一致。 |
| [Workflow Contract](../WORKFLOW_CONTRACT.md) | contract | unknown | current reference | 工作流合同频繁随模型/节点更新，需把静态规则与真实 schema 证据分开。 |

## 需要优先治理的信号

1. 初始快照中的 `Plan/active` 同时包含多种状态；本轮已将确定收口/被替代的入口移入 `archive/**`，当前未完成事项只从明确的 TASK 进入。
2. H3 高分辨率、H3 长视频、图片工作台各保留一个当前 TASK；旧长计划只保留历史事实、停止条件和替代链接。
3. `docs/archive/**` 是本轮统一的历史入口；`docs/archive/ux-ui` 继续作为既有 UI/UX 历史子目录，旧 `Plan/archive` 文件已迁入主题 archive。
4. evidence、research、静态 schema 检查和真实 GPU/ComfyUI 生成证据仍分层记录；任何“已接入”“verified”不替代运行验证。
5. 当前入口的状态、证据和下一步已在 TASK/契约/Research 索引中分开；DLSS5 的 HECer SR 与 AetherScale 历史材料已集中到 `docs/archive/dlss5/`。

结论：本表保留初始 58 份文档的分类基线和风险事实，不是实时任务数据库；本轮物理移动、当前入口和状态以链接到的 TASK、契约、Research/Evidence、Archive 为准。
