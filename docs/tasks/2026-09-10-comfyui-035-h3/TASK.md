# ComfyUI 0.35.0 与 H3 升级调查

- Status: done（调查阶段）；更新范围待用户讨论。
- Updated: 2026-09-10
- Owner: 当前线程，调查结束后不持有共享文件或运行资源。
- Scope / Authority: 用户要求先检查发布内容、现有工作流/节点/加速策略，再讨论更新。本阶段只读调查并保存证据，不实施升级。
- Baseline: 应用 HEAD `79c1d6c`，工作区已有大量未提交工作；以读到的当前 TypeScript、API JSON 和契约为准。
- Execution: direct；新增子 agent 0。

## Resume

- 官方稳定标签 `v0.35.0` 对应 `40c4fcdf513a4523e39d54a9d391908af8df8171`，发布于 2026-09-09 19:55 UTC。
- 本机实际核心已经是 `v0.35.0-6-ga7b1d39d`，核心 Git 工作区干净；软件通用推荐仍为 `0.33.1`，Motion Context 推荐 `0.34.0`，Continuum 元数据推荐 `0.34.2`。安装状态与软件推荐应分别处理。
- 主要收益候选：原生内存编译器与 offload、原生 BlockSparseAttention、mask 正确性修复；PDD、FastH3/VSA、Fun Union、轻量参考输入属于另行选择的能力扩展。
- 优先建议：0.35.0 兼容与现有行为回归 → H3 专属原生运行配置对照 → 单独验证稀疏注意力 → 再决定新增模型/控制能力。
- 不应把当前 standard 禁用 async offload 等同于禁用 Comfy Compiler；新核心可能已自动启用内存编译层，但预取受到应用参数限制。
- Spectrum 保留推荐 `0.2.24`；需讨论为 PDD-capable 新核心增加条件兼容下限，不能仅沿用普通旧核心的 `0.2.1` 下限。
- 详细来源、接口差异与建议验证顺序：[调查证据](evidence/upgrade-research.md)。下一步在此任务续接用户的更新决定，不重复建立主题计划。

## Evidence / handoff

- 已做：发布/API/tag 源码核对；应用当前 graph、patch chain、runtime policy、catalog 与相关 diff 检查；Desktop 安装记录、实际核心/节点 Git revision、Python 包目录只读检查。
- `GET /system_stats` 在应用配置的 loopback endpoint 连接失败；本轮没有启动服务，因此没有 `/object_info`、内核执行或真实输出证据。
- 未运行：pip/Git 更新、Python 原生导入探针、应用构建、Vitest、GPU 生成、性能/画质对照和回退演练。
- 修改仅限本目录 TASK 和证据；不修改共享索引、契约、CHANGELOG、版本、工作流或任何已有实现。
- 文档验收：检查新增文件、相对链接和事实/建议分层；没有申请占用 dist、Electron、ComfyUI 或 GPU，无进程需清理。
- 版本影响：本轮仅研究，无产品版本或 Unreleased 变化。未来纯推荐/兼容修正按 patch；新增可选后端或生成能力按 minor 评估。
- Token usage: unknown。
