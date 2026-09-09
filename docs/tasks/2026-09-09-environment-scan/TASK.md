# 环境扫描可靠性与耗时
- Status: done
- Updated: 2026-09-09
- Owner: current root task
- Route: bug
- Scope: Python 探针错误语义、重复扫描合并、扫描重复工作；不改变生成策略或安装依赖。
- Baseline: 1723e15；已有 H3 prompt、history controls 未提交改动不属于本任务。
- Authority: 用户要求按项目 harness 派 subagent 修复；Dependencies §2、Change Verification 环境扫描边界。

## Resume
- 已确认：H3 Python 探针 30s 超时/解析/进程异常返回空对象，UI 当成未安装；当天 40.8s 扫描为空但同次 llama Torch 检测正常，后续 10.6s/6.9s 正常。
- 决定：保留阶段性探针结果并显式报告未完成，合并并发扫描，减少重复 API 和网络等待；不以旧成功结果冒充本次就绪。
- 已完成：探针 checkpoints/错误语义、扫描合并与操作后 fresh 复检、节点 API 快照复用、独立发现阶段并行、显式 Python 保留、UI/日志未知状态。
- 验证：定向测试、构建、对比度、本机 scan harness 通过；完整 verify 的两个失败来自并发 DLSS5 归档改动，见 [验证证据](evidence/verification.md)。
- 后续：并发归档任务同步自己的测试后可再跑完整 gate；本任务不接管该改动。不得把首次扫描对照宣称稳定加速倍数。

## Plan and ownership
| 包 | 执行者 | 允许写文件 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| W1 | Luna probe worker | 新 attention-python-probe.ts、对应新测试 | 噪声 stdout、超时保留阶段结果、真实缺包 | done |
| W2 | Luna coordinator worker | 新 environment-scan-coordinator.ts、对应新测试 | 同 key 合并、不同 scope/key 隔离、失败恢复 | done |
| W3 | Luna UI worker | settings page/copy/selectors 及 JS mirrors、对应测试 | 失败状态、本地化、已观测值、安装禁用 | done |
| Integration | root | environment.ts、types、scanner、诊断、契约、changelog、TASK | focused + build + harness；verify 有外部失败 | done |

## Resources
- Workers 仅运行 focused tests，不构建、不启动 Electron/ComfyUI、不运行 GPU。
- root 完成 build/dist 与只读 harness，释放资源；未停止任何现有进程。

## Acceptance / handoff
- 保留所选 Python/实例、离线文件与在线注册区别、队列/历史标识及生成配置。
- 版本影响：patch，写入 Unreleased，不执行发布版本递增。
- 验证详见 evidence/verification.md；3 个 Luna worker（实现包 high，复用调查 worker 沿用原 effort），无替代模型；token usage unknown。
