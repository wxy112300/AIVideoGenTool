# 长视频模式：Strata 编排与 Continuum 自动续接

- 类型：Task；Status: done（本轮研究与新计划交付完成；功能未实施）。
- Updated / Owner: 2026-10-18 / 当前 agent；Execution: direct，新增子 agent 0。
- Scope / Authority: 用户要求结合当前工具、操作设计与在线资料评估长视频功能并新建 plan；本轮仅只读研究和文档，不安装、下载权重、运行推理或改变产品契约。
- Baseline: `475722c2c231da2aa8782d66e6c03d22a5913809`，应用 `0.66.0`；工作区已有 LAN History、Strata Agent 等未提交改动，保留。
- 权威：当前 [Architecture](../../ARCHITECTURE_CONTRACT.md)、[UX](../../UX_CONTRACT.md)、[Workflow](../../WORKFLOW_CONTRACT.md)。下述方案是提案，尚未替代产品契约。

## Resume

- 推荐：Create 增加独立“长视频”模式；一张图＋整片描述＋目标时长，由 Strata 分层规划，一次入队为一个作品，内部逐段生成、检查点恢复和自动合成。
- 单镜头使用一个 Continuum Run 内的连续 AV；多镜头按镜头/连续区间使用独立 Run。Qwen 2.1 作为可选分镜图服务，优先用于换镜头，不在每个续接边界强插新图。
- 已查上限：固定 3.9.1 与候选 3.9.8 的公开 Sampler 最多 16 段；段长共享。5–15s 为上游推荐范围，接口可接受 4–30s。16×15s≈4min；16×30s≈8min 仅为接口算术范围，不是质量/资源保证。2min 可规划约 12×10s；实际帧数须由图与 assembly plan 决定。
- 2026-10-18用户明确分开两项功能：[原生单次30s](../2026-10-18-h3-native-30s/TASK.md)已独立调查，取得原始30s/42s workflow并追踪排除时间拼接；原生现有Create放开上限不等待本长片模式，资料/实施/验收由该任务维护。已从本PLAN的P0移出原生30s实验，未来仅消费其已验证profile；本轮无GPU。
- 当前缺口：用户没有从图新建 managed Run 的正式入口；没有长片结构化 planner、依赖编排、单作品聚合和完整长片恢复闭环。现有 Extend managed 前缀保护必须保留。
- 实施顺序与验收见 [PLAN](PLAN.md)；现状、上限、社区方案和固定来源见 [研究证据](evidence/research.md)。研究已完成，下一步是实施 P0，不是再搜一轮泛资料。
- 优先关闭两个工程风险：Strata 当前仅有受限的单段增强证据；当前 Continuum 图可能反复解码前缀，长片不能只靠把段数拉大。P0 决定沿用 3.9.1 或采用经过验证的 3.9.8 adapter。

## Implementation and resources

- 本轮拥有：本任务目录、`docs/tasks/README.md` 中本任务链接；未修改运行代码、模型 catalog、现行契约、CHANGELOG 或版本。
- 后续实施要按实际改动更新类型/迁移、Queue/History、工作流契约、用户旅程和 Unreleased；预计 minor 功能，尚未发生版本变更。
- 本轮无 Electron、ComfyUI、GPU、端口、用户 state 或媒体资源归属，无需服务清理。

## Evidence / handoff

- 实际检查：初始 `git status --short` / `git diff --stat`、受影响当前 TS 与文档、`npm.cmd run harness:app -- list` / `guide extend`、官方源码/模型卡/社区作者仓库与 GitHub 固定 revision。
- 文档验收：2026-10-18，本任务3份文档及任务索引的本地链接/空白检查通过，`git diff --check`通过；索引仅新增1行，保持CRLF，无本任务意外删除。检查源码路径及命令一致性；并发Strata/History改动保留，不归入本任务交付。
- 未运行：build、verify、模型加载、schema 探针、视频生成、质量/速度 A/B；本轮不把源码能力当成本机 runtime 成功。
- 执行环境的普通沙箱进程中途出现 `helper_unknown_error: setup refresh had errors`；随后通过已批准的只读命令继续调查，未发生自动审批拒绝。
- 实际模型/effort、token usage：工具未提供可靠统计，unknown。
