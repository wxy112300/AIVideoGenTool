# 任务、工作包与证据模板

跨会话、多 agent、运行时调查或多阶段任务，复制第一段到 `docs/tasks/YYYY-MM-DD-topic/TASK.md`。局部小修无需建档。删除不适用字段；不要为填表制造工作。

## TASK.md

```markdown
# <任务标题>
- Status: triage | investigating | ready | implementing | validating | blocked | done | superseded
- Updated: <日期>
- Owner: <任务/agent标识；没有执行者写 unassigned；模型不是身份>
- Route: bug | integration | upgrade | prompt | extension | blocked
- Scope: <目标及本次明确不涉及的边界>
- Baseline: <Git revision + 本次相关 dirty 文件/hash；上游 revision 如适用>
- Authority: <当前用户决定、契约章节；不是整份阅读清单>

## Resume（每阶段更新，尽量一屏）
- 已确认：
- 本次决定及原因：
- 已完成 / 尚未完成：
- 下一步最小动作：
- 不要重复：
- 阻塞 / 解锁条件：

## Plan and ownership
| 包 | 负责人/执行者 | 允许写文件 | 只读/禁止文件 | 依赖 | 验收 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| W1 | <owner / worker> | <精确范围> | <精确范围> | <无/W0> | <可观察结果> | ready |

## Resources
- worktree / build output:
- GPU / ComfyUI / ports / userData:
- 已确认持有者与释放条件（无则 unassigned，禁止推断资源空闲）:

## Evidence
| 结论 | 类别 | 来源/版本/日期 | 证据路径 | 限制/失效条件 |
| --- | --- | --- | --- | --- |
| <简短事实> | source/static/schema/runtime/quality | <精确来源> | <链接> | <不可外推的范围> |

## Acceptance / handoff
- 要通过的检查：
- 实际命令与结果：
- 未运行项与原因：
- 实际模型/effort及不可用替代（如有委派）：
- 可取得的usage/调用数/耗时（不可得写unknown）：
- preserved 行为 / 兼容性 / 清理：
- 版本影响：patch / minor / major；Unreleased 或版本号：
- 下一任只需读：
```

只保留一份当前状态；详细计划超出摘要需求时才增加 `PLAN.md`，TASK 链接章节，不复制状态。状态与产品集成程度是两件事：一次纯调查可 done，但产品 runtime 仍未验证。

## 发给 Luna 的工作包

```text
目标：<一个可验收交付>
模型：Luna；工具显式选本会话可用 ID，按需要选 effort
上下文：不继承完整会话；下面已列全部必要约束
先读：<TASK + 精确契约/源码章节>
基线：<当前 revision/dirty 注意事项，开工重读>
允许编辑：<独占文件/新文件>
禁止编辑：<共享类型/入口/其他任务文件>
输入与方法：<固定URL/revision，筛选范围，预期处理规模>
验收：<focused checks 或计数/hash对照>
停止/升级条件：<缺文件、schema冲突、资源被占、方案外变更>
资源：<只读 / 已协调的运行窗口与目录>
交付：短结论 + diff/证据路径 + 实际检查 + 反证/未完成 + 下一步
不要：回传完整日志、重复全量研究、递归派发、扩大范围
```

父 agent 按当前工具 schema 派发，不能把模型名称写在正文就当作实际选模。工作包缺必要信息时 worker 先完成独立部分，再提出具体缺口。

## evidence/<topic>.md（需要可复用调查时才创建）

```markdown
# <证据标题>
- Date / collector:
- Question:
- Source: <URL + release/commit；本机资料写文件/revision>
- Artifact: <size + SHA-256，未下载写未下载>
- Method: <实际命令/匹配范围/环境>
- Result: <关键匹配或明确计数的负结果>
- Counterevidence / limits:
- Invalidated by: <版本、hash、输入、环境等变化>
- Raw artifacts: <忽略目录下可复用位置；不可用则说明>
```

证据类别：source=文档/上游声明；static=源码/类型/图构造检查；schema=实际节点接口检查；runtime=实际运行产物；quality=同条件质量评估。类别不是线性升级证书，必须保留环境、参数和范围。日志及媒体不进 Git，保留必要脱敏摘要与定位。
