# 开发文档入口

用途：先判断本次工作需要什么，再打开对应材料。这里是分类导航，不保存任务状态或模型安装清单。

## 从请求进入

| 你要做的事 | 最小入口 | 执行路线 |
| --- | --- | --- |
| 修 bug | [代码地图](AGENT_START_HERE.md) → 受影响模块/测试 | [短路径](development/WORKFLOW.md#bug-fix) |
| 调查/接入新节点、图像编辑模型 | [工作流契约](WORKFLOW_CONTRACT.md) | [接入](development/WORKFLOW.md#integration) |
| 升级已有节点、插件、工作流 | catalog 当前 revision + [环境约定](DEPENDENCIES_AND_SETUP.md) | [升级](development/WORKFLOW.md#upgrade) |
| 研究 prompt 增强 | [Prompt Pack 边界](PROMPT_PACK_DESIGN.md) | [对照实验](development/WORKFLOW.md#prompt) |
| Extend、长视频 | [H3 长视频 TASK](tasks/2026-09-07-h3-long-video/TASK.md) + 工作流契约 + 当前 adapter/queue/artifact 代码 | [探索方案](development/WORKFLOW.md#extension) |
| 继续被卡方案 | [任务入口](tasks/README.md) → 对应 TASK | [阻塞恢复](development/WORKFLOW.md#blocked) |
| 整理开发文档 | [文档职责](development/DOCUMENT_POLICY.md) + [全量旧文档盘点](development/DOCUMENT_INVENTORY.md) | 有界迁移、保留证据 |

常规任务不需要读完全表、全量盘点或整套历史计划。默认当前 agent 直接完成；仅满足成本与树上限条件时委派，从指定路径/章节开始。

## 分类与分工

| 类别 | 回答的问题 | 权威入口 / 新文档位置 | 维护者 |
| --- | --- | --- | --- |
| 项目规则 | 必须保持什么、如何协作？ | 根 [AGENTS.md](../AGENTS.md) | 任务负责人，涉及规则变更时审阅 |
| 产品契约 | 产品承诺和边界是什么？ | 下方契约列表；现有路径保留 | 当前任务执行者；不明确的产品变更按授权处理 |
| 开发流程 | 怎样从请求做到验收？ | [development/WORKFLOW.md](development/WORKFLOW.md) | 当前任务执行者 |
| 操作手册 | 如何重复执行某项检查？ | 环境、验证、Electron runbook；新内容用 `docs/runbooks/` | 执行者维护，负责人验收 |
| 任务/计划 | 此次目标、决定、下一步是什么？ | `docs/tasks/<date>-<topic>/TASK.md` | 每个任务唯一负责人 |
| 研究与证据 | 根据什么做出判断？ | 同一任务的可选 `evidence/`；长期研究用 `docs/research/` | 当前执行者收集与判断 |
| 架构决策 | 为什么选择这条长期路线？ | `docs/ADR/` | 当前任务执行者 |
| 历史 | 当时做了什么？ | [archive](archive/README.md)；不再新增 `Plan/archive` | 当前执行者按明确清单整理 |

新目录按实际需要创建，不生成空目录或每任务全套文件。分类中的“维护者”是职责，不授予任何任务对其他正在工作 agent 的控制权。

## 当前产品约束与操作入口

- [Architecture](ARCHITECTURE_CONTRACT.md)：状态、IPC、队列、历史、进程。
- [UX](UX_CONTRACT.md)：当前 renderer 交互与验收；[本地化](LOCALIZATION_CONTRACT.md)仅在涉及语言时读。
- [Workflow](WORKFLOW_CONTRACT.md)：模型、节点、参数与 GPU 策略。
- [环境与依赖](DEPENDENCIES_AND_SETUP.md)：安装与维护。
- [验证分级](CHANGE_VERIFICATION.md)：按变更选检查；[真实 Electron 操作](AGENT_ELECTRON_API_RUNBOOK.md)仅在运行验收时读。
- [Prompt Pack](PROMPT_PACK_DESIGN.md)：prompt 资产边界。社区写作指南是候选思路，不自动成为默认策略。
- [Research 与 Evidence](research/README.md)：有来源、日期和验证范围的研究/实验记录。
- [Task 入口](tasks/README.md)：当前状态、阻塞条件和下一步的唯一入口。

## 旧文档如何使用

旧 `Plan/active`、顶层 `*_PLAN.md` 的名字或“Active”标题不证明现在有人执行，也不证明代码缺失。完整分类见盘点；进入某主题先用当前代码和最新契约核对，必要时建立一个 TASK 接续。

已知风险：图片计划含旧版本/CPU VAE 状态；Native/长视频多份方案并存；H3 历史恢复 handoff 与较晚契约的验收日期不同。旧记录中的用户停止指令和安全事件须按时间、目标和后续授权核对，不能随归档一并丢弃，也不能不分范围地变成所有未来任务的永久禁令。

本轮已按 [迁移规则](development/DOCUMENT_POLICY.md#migration)完成主题归档和研究迁移；旧长计划保留在 archive，当前工作只从 TASK、契约或 Research 入口进入。
