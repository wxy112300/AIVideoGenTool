# 开发 harness 与文档治理

- Status: done
- Updated: 2026-09-07
- Owner: 当前用户任务负责人（Astra）；Luna 仅负责明确的调查/文档工作包
- Route: documentation / workflow design
- Scope: 定义混合 agent 流程、文档分类和可恢复交接；保留产品契约、业务代码、旧证据与并行任务。
- Baseline: 用户工作树已含多个未提交产品变更；本任务接续此前 AGENTS、Agent Start Here、Change Verification 修改。
- Authority: 用户要求高级 agent 规划、Luna 大量数据处理/明确执行；减少上下文浪费。

## Resume

- 问题：事实、计划、证据与历史混写；active 目录不能表达真实状态；重复全量阅读/实验占用高级模型上下文。
- 决定：小修短路径 + 标准混合流程；一个 TASK 管当前状态，契约管产品事实，evidence 管来源与实验。
- 已落地：docs 首页、工作流、模板、文档生命周期、58 份旧文档分类、代码地图、DLSS5 阻塞接续卡及精简 AGENTS。
- 验收完成：本次链接/命令/差异与六类任务流程走读通过；物理归档和实际成本测量仍是后续工作。
- 不做：全局模型配置、自动调度器、旧文档批量移动/删除、产品功能变更、GPU 试验。
- 后续：新任务按新路由执行；候选历史文档按归属和替代证据逐项迁移。

## Plan and ownership

| 包 | 执行者 | 允许写文件 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| D1 旧文档盘点 | Luna | DOCUMENT_INVENTORY.md | 全量58份分类与链接，误读修正 | done |
| D2 DLSS5 阻塞抽取 | Luna 只读 | 无 | provider 分离、证据与最小解锁试验 | done |
| D3 流程设计/集成 | Astra | AGENTS、README、Agent Start Here、docs首页、development流程/模板/政策、tasks、changelog本任务条目 | 入口/职责/证据/生命周期一致，产品代码不改 | done |

## Resources

只使用只读调查、文档编辑与文档校验。未占用 dist 构建、GPU、ComfyUI/端口/userData。
已有其他业务与契约变更保持原样；CHANGELOG 只改本任务条目。旧文档未移除，避免影响并行任务的路径引用。

## Evidence and acceptance

- 文档库存是开始时 58 份 Markdown 快照，不是所有运行中任务清单。
- Luna 提供两份有界交接；主审纠正了把架构流程图中的 Creation draft 误判为文档状态的问题，并复核 DLSS5 关键源码。这说明摘要需要主审，不是自动权威。
- 文档校验：Node 脚本检查 13 份文档、139 个本地链接、8 个锚点、13 处 npm script 引用，无失败；库存 58 行覆盖旧文档 58 份。git diff --check 通过，新增文件检查无冲突标记；本次未运行应用测试、构建或 GPU。
- 六类请求经 Luna 只读走读与主审；补齐实际选模/usage 字段、升级回退与 prompt 证据位置、DLSS5 当前 schema/worker/媒体证据要求。
- 实际 token/费用：unknown；不以字符数或模型名称推断节省比例。
- 版本影响：patch 级开发文档变更，记 Unreleased，不单独 bump。
- 接续只读：本摘要 → docs 首页 → 目标 TASK/流程章节；原始调查按需定位。
