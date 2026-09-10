# 任务与可选委派模板

默认当前 agent 直接完成。小修无需建档；跨会话或多阶段任务才用 docs/tasks/YYYY-MM-DD-topic/TASK.md。删去不适用字段，不为填表制造工作。

## TASK.md

```markdown
# <任务>
- Status: triage | investigating | implementing | validating | blocked | done | superseded
- Updated / Owner:
- Scope / Authority:
- Baseline: <revision + 相关dirty状态/上游版本>
- Execution: direct（默认）
- Tree ledger（仅委派时）: cap=1 created=0 depth<=1 concurrency<=1 corrective-followups<=1
- User override: none（有明确扩容指令才记录）

## Resume
- 已确认 / 决定：
- 已完成 / 下一步：
- 阻塞 / 解锁条件 / 不要重复：

## Implementation and resources
- 修改范围 / 保留行为：
- 必要步骤（不自动拆成agent）：
- 文件、build/GPU/服务归属和释放：
- 验收：

## Evidence / handoff
- 关键结论及来源/版本/证据路径：
- 实际命令、结果、对应文件状态：
- 可复用检查 / 必须补的验证：
- 未运行项、限制、清理：
- 实际模型/effort；可见usage与耗时（unknown如不可得）：
- 版本影响 / Unreleased：
```

TASK 是唯一当前摘要。调用者历史预算延续到续接任务，不因修改状态或压缩上下文重置。这里的状态不是 Codex goal 或 automation。

## 例外委派（满足 WORKFLOW 条件后才使用）

```text
委派理由：替代父级哪一段尚未做的工作；为何直接执行/脚本不足
Tree：本请求累计创建数/上限；本子agent禁止派生；最多一次纠偏
交付：一个完整、可独立验收的结果，含适用验证
模型/effort：实际工具支持且明确选择；不可用则当前agent做
上下文：最小必要用户约束、契约章节与来源；不继承整个会话
输入/基线：精确路径/revision/hash与处理范围，开工重读
允许写 / 禁止写 / 资源归属：
停止条件：有限数据范围、命令尝试/运行时限、缺失依赖
验收：客观结果，记录命令/结果/文件状态，避免父级重做
反馈：正常过程自行完成；最终仅结论、文件/证据、验证、未决项
不要：阶段审批、常规进度回传、完整日志、递归派发、范围扩张
```

派发前记累计数；失败/替换同样计数，不创建替代 worker。正常只派单与验收两次父级介入；一次纠偏后仍不收敛，由当前 agent 接手或说明阻塞。不缺关键约束时 worker 自行选择常规实现方法。

## 可复用证据（需要时才建 evidence/<topic>.md）

记录问题、来源/日期/revision、asset size/SHA-256、实际方法/命令、结果/反证、环境、文件状态、失效条件和原始材料定位。
区分 source、static、schema、runtime、quality；文件存在/fixture通过不等于真实输出。
父级只复核关键证据与 diff；同一整合状态的可核对验证结果复用。日志和媒体留忽略目录，不贴进主上下文。

成本记录以全树为范围，同时区分昂贵父级的额外派单、阅读、验收、纠偏和重复检查；数据未知就写 unknown，不通过频繁采样或重复执行测“节省”。
