# 环境扫描可靠性与耗时
- Status: ready
- Updated: 2026-09-10
- Owner: unassigned（由用户交给 Luna Max 独立执行后续提速）
- Route: bug
- Scope: 第一阶段可靠性修复已完成；后续通过可失效的进程内 Python 验证缓存加快重复扫描，不改变生成策略或依赖版本。
- Baseline: 1723e15；已有 H3 prompt、history controls 未提交改动不属于本任务。
- Authority: 用户要求将环境扫描提速 plan 细化到可直接执行，用户自行交给 Luna（Max）实现，不再派 subagent；当前 AGENTS 单 agent 规则及 Dependencies/Change Verification 边界。本轮只修改本任务 PLAN/TASK。

## Resume
- 已确认：H3 Python 探针 30s 超时/解析/进程异常返回空对象，UI 当成未安装；当天 40.8s 扫描为空但同次 llama Torch 检测正常，后续 10.6s/6.9s 正常。
- 决定：保留阶段性探针结果并显式报告未完成，合并并发扫描，减少重复 API 和网络等待；不以旧成功结果冒充本次就绪。
- 已完成：探针 checkpoints/错误语义、扫描合并与操作后 fresh 复检、节点 API 快照复用、独立发现阶段并行、显式 Python 保留、UI/日志未知状态。
- 验证：定向测试、构建、对比度、本机 scan harness 通过；完整 verify 的两个失败来自并发 DLSS5 归档改动，见 [验证证据](evidence/verification.md)。
- 后续计划：[PLAN.md](PLAN.md)。第 8–13 节已细化为接口与逐层调用链、scope/验证强度合并、两层身份与指纹、嵌套操作失效、UI 状态表、S0–S6 顺序及 T01–T30 回归；只缓存 Python 原生证据，不冻结文件/KJ/API 状态。
- 特别边界：application-runtime 注入不能丢 options；pending full/auto + dependencies/live 必须执行 full/live；Gemma 执行前不能凭 runtime 旧 llama ready 放行；现有 harness scan 默认 dependencies，新增同进程 scan-benchmark 才能测命中。
- 下一步：用户指定的 Luna Max 按 PLAN 的 S0–S6 单独执行；本轮仅细化文档，未实现缓存、未运行扫描/测试/构建。历史 gate 失败不代表当前仍失败，开工以当前 diff 为准。
- 旧规划参考 HEAD：79c1d6c，非当前文件状态证明。性能目标：每个有效命中 family 零次重探针，两套健康时整轮零次；命中扫描 ≤2 秒或降低至少 50%；首次/force/不可缓存单独计时，不承诺同样加速。

## Plan and ownership
| 包 | 执行者 | 允许写文件 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| W1 | Luna probe worker | 新 attention-python-probe.ts、对应新测试 | 噪声 stdout、超时保留阶段结果、真实缺包 | done |
| W2 | Luna coordinator worker | 新 environment-scan-coordinator.ts、对应新测试 | 同 key 合并、不同 scope/key 隔离、失败恢复 | done |
| W3 | Luna UI worker | settings page/copy/selectors 及 JS mirrors、对应测试 | 失败状态、本地化、已观测值、安装禁用 | done |
| Integration | root | environment.ts、types、scanner、诊断、契约、changelog、TASK | focused + build + harness；verify 有外部失败 | done |
| Follow-up | unassigned / 用户指定 Luna Max | PLAN 第 8–13 节缓存及集成文件，按 S0–S6 单人完成 | T01–T30 关键行为 + focused/verify + 五轮同进程计时 + UI 状态 | ready |

## Resources
- Workers 仅运行 focused tests，不构建、不启动 Electron/ComfyUI、不运行 GPU。
- root 完成 build/dist 与只读 harness，释放资源；未停止任何现有进程。
- 后续实现未启动，未持有 build/服务资源；用户指定执行者自行协调。2026-09-10 细化规划新增子 agent：0，仅文档 diff/链接/命令一致性检查，未运行构建、测试或环境探针。

## Acceptance / handoff
- 保留所选 Python/实例、离线文件与在线注册区别、队列/历史标识及生成配置。
- 版本影响：patch，写入 Unreleased，不执行发布版本递增。
- 验证详见 evidence/verification.md；3 个 Luna worker（实现包 high，复用调查 worker 沿用原 effort），无替代模型；token usage unknown。
