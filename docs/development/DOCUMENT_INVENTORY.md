# 文档分类盘点

盘点日期：2026-09-07。盘点开始时的 `docs/**/*.md` 快照共 58 份；期间新建的 `docs/README.md` 以及本轮新治理/tasks 文档均排除在表外，`docs/development/**` 也不计入。表中“已声明状态”只记录文档开头或必要片段的自述，不代表本次确认其完成，也不代表活跃任务的拥有权或任何运行验证。旧文件本轮不移动、不删除。

类别仅用于导航：`contract` 是当前边界/不变量，`runbook` 是操作或验证步骤，`plan` 是实施计划，`research` 是调查/指南，`evidence` 是证据或基线，`archive` 是历史材料，`index` 是入口或目录。

| 文档 | 类别 | 已声明状态 | 建议 | 风险 |
|---|---|---|---|---|
| [ADR 0001](../ADR/0001-staged-headless-application-boundary.md) | contract | Accepted for modularization | current reference | 关联 active 计划且含 accepted residual；需与当前边界和实现同步。 |
| [Electron API smoke runbook](../AGENT_ELECTRON_API_RUNBOOK.md) | runbook | unknown | keep | 未见开头状态；步骤可能依赖当前 Electron API，需单独复核。 |
| [Agent Start Here](../AGENT_START_HERE.md) | index | unknown | current reference | 是主要导航入口；若分类或链接过期会把代理带入历史方案。 |
| [ALLinONE H3 adoption plan](../ALLINONE_H3_ADOPTION_PLAN.md) | plan | 多个 Phase 自称已完成（总状态未在开头明确） | review | 计划与当前 H3 代码/上游版本可能漂移，完成项不能替代运行证据。 |
| [Architecture Contract](../ARCHITECTURE_CONTRACT.md) | contract | unknown | current reference | 契约正文与当前模块边界需持续对照实现和证据。 |
| [archive README](../archive/README.md) | index | 归档说明 | keep | 归档入口称当前文档为默认入口，目录移动时链接易失效。 |
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
| [Cloud implementation status](../CLOUD_IMPLEMENTATION_STATUS.md) | evidence | 明确标为历史说明，不代表 2026-07-24 后实际完成度 | review | 根目录仍易被搜索命中，旧云端/本机边界会误导当前判断。 |
| [Dependencies and setup](../DEPENDENCIES_AND_SETUP.md) | runbook | unknown | current reference | 当前依赖、版本和修复流程变化快；需以真实扫描/安装结果复核。 |
| [H3 community guide research](../H3_COMMUNITY_GUIDE_RESEARCH.md) | research | unknown | keep | 社区来源和经验数据可能时效短，不应直接升级为产品合同。 |
| [H3 long-video P0 evidence](../H3_LONG_VIDEO_P0_EVIDENCE.md) | evidence | runtime/core/schema 基线已完成；真实 workflow/生成未完成 | current reference | 静态基线不能证明 Native long-video runtime-ready，且依赖 ComfyUI 环境。 |
| [H3 Memory Optimization integration plan](../H3_MEMORY_OPTIMIZATION_INTEGRATION_PLAN.md) | plan | 功能隐藏并强制关闭；保留实现历史 | review | 根目录长计划仍像当前实施合同，易把关闭功能重新当作可用能力。 |
| [H3 Native Masked AV long-video plan](../H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md) | plan | Native Masked AV 尚未实现、无真实生成证据 | review | 与 P0 evidence 和 ComfyUI 版本状态耦合，旧计划状态不能升级为当前权威。 |
| [H3 P0 evidence baseline](../H3_P0_EVIDENCE_BASELINE.md) | evidence | 未见总完成状态；记录 Phase 0 范围 | current reference | 证据基线与运行时完成度边界需显式保持，避免被当作功能验收。 |
| [H3 prompt writing guide](../H3_PROMPT_WRITING_GUIDE.md) | research | unknown | keep | 社区提示词总结不是模型/工作流契约，可能产生质量或安全误读。 |
| [History performance optimization plan](../HISTORY_PERFORMANCE_OPTIMIZATION_PLAN.md) | plan | 已实施并收口（Phase 0–5；Phase 6 已启用） | review | 已收口计划仍在根目录，剩余实测偏差需要有当前 evidence 入口。 |
| [Image edit model research](../IMAGE_EDIT_MODEL_RESEARCH.md) | research | Klein 已接入；真实权重下载和两模型 GPU smoke test 待完成 | review | “已接入”不等于真实运行就绪，GPU/权重证据仍缺。 |
| [Image workspace implementation plan](../IMAGE_WORKSPACE_IMPLEMENTATION_PLAN.md) | plan | 交互/真实图片闭环完成；独立 AI 放大待完成 | review | 长计划混合已实现和未实现范围，需防止把放大能力视为完成。 |
| [Local Codex handoff](../LOCAL_CODEX_HANDOFF.md) | runbook | H3 V3 handoff 指向当前未提交工作区；WP2/WP4–WP8 有未完成项 | review | 强依赖某次 session 和未提交状态，旧 handoff 不能升级为当前权威。 |
| [Localization Contract](../LOCALIZATION_CONTRACT.md) | contract | unknown | current reference | 未见状态；应确认本地化规则仍覆盖当前 renderer/文档入口。 |
| [Long-video capability enhancement plan](../LONG_VIDEO_CAPABILITY_ENHANCEMENT_PLAN.md) | plan | Draft；未声称 Native runtime-ready | review | 根目录总计划与多个 H3 子计划重叠，容易出现状态和责任分叉。 |
| [Model Catalog Design](../MODEL_CATALOG_DESIGN.md) | contract | unknown | current reference | 设计文档未标当前/历史，catalog 真相源变化时有漂移风险。 |
| [Headless service/Web API rearchitecture](../Plan/active/2026.8.31-headless-service-web-api-rearchitecture.md) | plan | Completed（含 accepted residual）；保留在 active 作审计记录 | review | 已完成计划留在 active 目录，Astra/Sol 可能继续接手已收口工作。 |
| [X-MinimaxH3 adoption v1](../Plan/active/2026.8.31-x-minimaxh3-feature-adoption.md) | plan | Superseded | archive candidate | 文件名/目录仍显示 active，正文已要求不再更新。 |
| [X-MinimaxH3 adoption v2](../Plan/active/2026.9.1-x-minimaxh3-feature-adoption-v2.md) | plan | Superseded / historical implementation draft | archive candidate | 已被 V3 取代却留在 active，容易与 V3 争夺权威。 |
| [H3 V3 recovery handoff](../Plan/active/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3-handoff.md) | runbook | WP2 Gate 未完成；WP4–WP8 不得声称完成 | review | handoff 依赖当前未提交工作区，旧 handoff 不能升级为当前权威。 |
| [H3 V3 recovery plan](../Plan/active/2026.9.2-h3-comfyui-two-pass-av-upscale-recovery-v3.md) | plan | Partially completed / retained as recovery history | review | 目标代理和逐 Gate 要求很具体；旧计划状态不能升级为当前权威。 |
| [DLSS5 dual-provider integration](../Plan/active/2026.9.4-dlss5-dual-provider-parallel-integration.md) | plan | Active / implementation-ready | current reference | 当前唯一明显 active 的实现计划之一，需与旧 DLSS5 调研及代码变更保持一致。 |
| [ComfyUI settings rearchitecture](../Plan/archive/2026.8.27-comfyui-settings-rearchitecture.md) | archive | Archived；WP-00–WP-06 完成 | keep | `Plan/archive` 与 `archive/**` 两套归档入口并存，发现路径不统一。 |
| [AD-01 H3 runtime/ComfyUI investigation](../Plan/investigation/2026.8.31-ad01-x-minimaxh3-runtime-comfyui-investigation.md) | research | Static validated | keep | 归属已被取代的 V2 计划；证据可保留但引用链需指向当前 V3。 |
| [WP-C03 History detail source of truth](../Plan/investigation/2026.8.31-wp-c03-history-detail-source-of-truth.md) | evidence | 未见总状态；记录 harness 已淘汰结构 | review | 明确指出测试 harness 与当前合同不符，继续使用会产生假阴/假阳。 |
| [WP-01/WP-P00 performance baseline](../Plan/investigation/2026.8.31-wp01-wpp00-boundary-performance-baseline.md) | research | unknown | keep | 性能结论依赖当时边界和测量；需与 C04/History 最新证据关联。 |
| [WP-C04 Electron performance evidence](../Plan/investigation/2026.9.1-wp-c04-electron-performance-evidence.md) | evidence | Completed，严格性能预算残差未技术通过 | current reference | 用户接受项不能被改写成自动化性能通过，且记录含机器临时路径。 |
| [H3 1080p/1440p integration research](../Plan/investigation/2026.9.2-h3-1080-1440-integration-research.md) | research | 当前实施决策输入；不代表已产品化 | current reference | 调研结论与 V3 实施 Gate 需绑定，否则会把提案误当能力。 |
| [DLSS5 upscale integration research](../Plan/investigation/2026.9.3-dlss5-upscale-integration-plan.md) | research | Proposed / static research only | keep | 已有后续 dual-provider active 计划，旧候选路线需避免重新成为执行入口。 |
| [Product Requirements](../PRODUCT_REQUIREMENTS.md) | contract | unknown | current reference | 根需求未标版本/状态，可能与当前图片、队列和模型边界不完全一致。 |
| [Prompt Pack Design](../PROMPT_PACK_DESIGN.md) | contract | unknown | current reference | 设计规则未标状态，需检查与当前 defaults/persistence 的一致性。 |
| [Renderer modularization plan](../RENDERER_MODULARIZATION_PLAN.md) | plan | unknown | review | 根目录计划未声明是否被 headless 重构计划取代或收口。 |
| [UX Contract](../UX_CONTRACT.md) | contract | unknown | current reference | 当前 renderer source-of-truth 规则清晰，但未显式版本/状态。 |
| [P20 renderer QA report](../UX_UI_P20_QA_REPORT.md) | evidence | P20/G18 自动化交付与最终验收已完成 | current reference | 旧版本号与当前 renderer 会继续变化，不能替代新 UI smoke。 |
| [UX/UI renderer baseline](../UX_UI_RENDERER_BASELINE.md) | evidence | verified；当前 UI 唯一视觉基线 | current reference | 截图基线绑定旧版本和固定 fixture，后续 CSS 变更需重新生成。 |
| [Video Extend design](../VIDEO_EXTENSION_DESIGN.md) | contract | unknown | current reference | 设计边界未标状态，需确认与当前图片/视频历史结构一致。 |
| [Workflow Contract](../WORKFLOW_CONTRACT.md) | contract | unknown | current reference | 工作流合同频繁随模型/节点更新，需把静态规则与真实 schema 证据分开。 |

## 需要优先治理的信号

1. `Plan/active` 同时包含 Active、Partially completed、Completed、Superseded 和 handoff 文档；目录名本身不能代表可接手任务。
2. 根目录仍有多份长计划把已完成、隐藏、待验证和未实现内容混写，尤其是 H3 Memory、Native AV、Image Workspace、History 和 Long-video 计划。
3. `docs/archive`、`docs/archive/ux-ui` 与 `docs/Plan/archive` 形成两套归档层级；历史 UX 文件虽有说明，仍容易被搜索结果当作当前依据。
4. evidence、research、静态 schema 检查和真实 GPU/ComfyUI 生成证据混在相近命名空间，不能用“已接入”“verified”替代运行验证。
5. 入口和契约文件的状态标记不统一（`unknown`、`verified`、`Completed` 并存），Astra/Sol 规划和 Luna 执行需要单独的当前 owner、证据和下一步字段。

结论：本表是导航建议与风险提示，不是对文档权威性、任务拥有权或实现完成度的最终认定。
