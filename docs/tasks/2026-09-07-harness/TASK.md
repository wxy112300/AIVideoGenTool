# 开发 harness 与文档治理

- Status: done
- Updated: 2026-09-07
- Owner: 当前用户任务负责人（Astra）；Luna 仅负责明确的调查/文档工作包
- Route: documentation / workflow design
- Scope: 定义混合 agent 流程、文档分类和可恢复交接；本批次实际整理历史计划、研究、证据与当前 TASK 入口，不触碰产品契约和业务代码。
- Baseline: 用户工作树已含多个未提交产品变更；本任务接续此前 AGENTS、Agent Start Here、Change Verification 修改。
- Authority: 用户要求高级 agent 规划、Luna 大量数据处理/明确执行；减少上下文浪费。

## Resume

- 问题：事实、计划、证据与历史混写；active 目录不能表达真实状态；重复全量阅读/实验占用高级模型上下文。
- 决定：小修短路径 + 标准混合流程；一个 TASK 管当前状态，契约管产品事实，evidence 管来源与实验。
- 已落地：docs 首页、工作流、模板、文档生命周期、初始 58 份文档分类、代码地图、DLSS5 历史归档卡及精简 AGENTS。
- 本批次完成：实际移动 27 份文档，新增 H3 高分辨率/H3 长视频/图片工作台 3 个当前 TASK，新增 Research 索引和长视频 evidence 入口，修复受影响链接。
- 不做：全局模型配置、自动调度器、产品功能变更、GPU/ComfyUI 试验、依赖安装；不删除历史证据。
- 后续：只从 3 个新 TASK 接续；needs-review 项按各 TASK 的证据门槛处理，DLSS5 改由主题 archive 保留历史。

## Plan and ownership

| 包 | 执行者 | 允许写文件 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| D1 旧文档盘点 | Luna | DOCUMENT_INVENTORY.md | 全量58份分类与链接，误读修正 | done |
| D2 DLSS5 阻塞抽取 | Luna 只读 | 无 | provider 分离、证据与最小解锁试验 | done |
| D3 流程设计/集成 | Astra | AGENTS、README、Agent Start Here、docs首页、development流程/模板/政策、tasks、changelog本任务条目 | 入口/职责/证据/生命周期一致，产品代码不改 | done |
| D4 文档迁移/归档 | Astra | 主题 archive/research/task evidence、索引、反向链接、CHANGELOG | 27 份移动映射、状态入口、旧路径和链接校验 | done |

## Resources

只使用只读调查、文档编辑与文档校验。未占用 dist 构建、GPU、ComfyUI/端口/userData。
已有其他业务与契约变更保持原样；CHANGELOG 只改本任务条目。历史原始证据未删除；必要旧入口已改为当前 TASK/契约链接，不保留第二份完整权威文档。

## 2026-09-07 文档清理批次

状态：done（本轮本地文档维护）；不代表下列 needs-review 功能已经运行验收。

| 来源范围 | 当前归属 | 结果 |
| --- | --- | --- |
| H3 adoption v1/v2/v3、恢复 handoff、Local handoff | `docs/archive/h3-adoption/` | v1/v2 superseded；v3/handoff 保留恢复历史；当前从高分辨率 TASK 进入 |
| H3 Memory、Native AV、长视频总计划 | `docs/archive/h3-memory/`、`docs/archive/h3-long-video/` | Memory withdrawn；Native/长视频保留历史边界；当前从长视频 TASK 进入 |
| H3 社区/运行/1080-1440 研究 | `docs/research/h3/` | 研究与产品契约分离；当前决策从高分辨率 TASK 进入 |
| History 计划与 WP-C03/WP-01/C04 记录 | `docs/archive/history-performance/`、`docs/research/history/` | 已接受收口与尚未技术通过的性能证据分开 |
| 模块化、Settings、云端 handoff | 对应 `docs/archive/modular-architecture/`、`docs/archive/comfyui-settings/`、`docs/archive/legacy-handoff/` | 已完成/被替代/历史交接统一归档；当前架构以契约为准 |
| 图片工作台计划与模型研究 | `docs/archive/image-workspace/`、`docs/research/image-edit/` | 混合长计划归档；独立 AI 放大保留 needs-review |
| DLSS5 旧计划/调查 | `docs/archive/dlss5/` | HECer SR 与 AetherScale 均已淘汰；仅保留历史证据和停止条件 |
| H3 P0 文件 | `docs/tasks/2026-09-07-h3-long-video/evidence/` | 保留静态基线，不把它升级为 Native runtime 完成证据 |

明确收口的历史计划：7 份（H3 adoption v1、v2；H3 Memory；History performance；Renderer modularization；Headless rearchitecture；ComfyUI Settings；H3 v3 为 partially completed history，不计入 done）。

尚待判断的具体入口及缺失证据：

- `docs/tasks/2026-09-07-h3-high-resolution/TASK.md`：1440p learned Upscale 的质量/组合证据，以及 native 1440p 失败边界；本轮不重跑 GPU。
- `docs/tasks/2026-09-07-h3-long-video/TASK.md`：真实 workflow/生成、取消清理和长批次媒体证据；当前只有静态/core/schema 基线。
- `docs/tasks/2026-09-07-image-workspace/TASK.md`：独立 AI 放大实现与真实模型 smoke；旧 CPU VAE 仅是历史事实。
- `docs/archive/dlss5/TASK.md`：HECer wrapper 外部资产与 AetherScale carrier/feature-18 的历史阻塞记录；不再作为当前执行入口。

下一步：接手 agent 只需读取相应 TASK、当前契约和已链接 Research/Evidence；不从已归档长计划重新建立执行入口。

## Evidence and acceptance

- 文档库存是开始时 58 份 Markdown 快照，不是所有运行中任务清单。
- Luna 提供两份有界交接；主审纠正了把架构流程图中的 Creation draft 误判为文档状态的问题，并复核 DLSS5 关键源码。这说明摘要需要主审，不是自动权威。
- 文档校验：Markdown 检查覆盖 74 份文档、451 个链接、9 个章节锚点，无失败；旧路径搜索仅剩 3 处历史命令输出并已注明快照范围。`git diff --check` 通过，新增文件无冲突标记；本次未运行应用测试、构建、依赖安装或 GPU。
- 六类请求经 Luna 只读走读与主审；补齐实际选模/usage 字段、升级回退与 prompt 证据位置、DLSS5 当前 schema/worker/媒体证据要求。
- 实际 token/费用：unknown；不以字符数或模型名称推断节省比例。
- 版本影响：patch 级开发文档变更，记 Unreleased，不单独 bump。
- 接续只读：本摘要 → docs 首页 → 目标 TASK/流程章节；原始调查按需定位。
