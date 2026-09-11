# 环境扫描可靠性与耗时
- Status: in progress（S0–S6 实现、verify 与运行时 benchmark 已完成，手动 UI 验收待补）
- Updated: 2026-09-11
- Owner: Codex（单 agent 执行；未派生子任务）
- Route: bug
- Scope: 第一阶段可靠性修复已完成；后续通过可失效的进程内 Python 验证缓存加快重复扫描，不改变生成策略或依赖版本。
- Baseline: 1723e15；已有 H3 prompt、history controls 未提交改动不属于本任务。
- Authority: 用户要求阅读并执行环境扫描提速 plan；当前 AGENTS 单 agent 规则及 Dependencies/Change Verification 边界。本轮由 Codex 单 agent 执行，不派 subagent。

## Resume
- 已确认：H3 Python 探针 30s 超时/解析/进程异常返回空对象，UI 当成未安装；当天 40.8s 扫描为空但同次 llama Torch 检测正常，后续 10.6s/6.9s 正常。
- 决定：保留阶段性探针结果并显式报告未完成，合并并发扫描，减少重复 API 和网络等待；不以旧成功结果冒充本次就绪。
- 已完成：探针 checkpoints/错误语义、扫描合并与操作后 fresh 复检、节点 API 快照复用、独立发现阶段并行、显式 Python 保留、UI/日志未知状态。
- 验证：缓存/指纹/coordinator 定向测试、设置与 prompt 集成测试、全量 Vitest、typecheck、build、对比度和本机同进程 scan-benchmark 均通过；本次最终 `npm.cmd run verify` 全部通过，详见[验证证据](evidence/verification.md)。
- 后续计划：[PLAN.md](PLAN.md)。第 8–13 节已细化为接口与逐层调用链、scope/验证强度合并、两层身份与指纹、嵌套操作失效、UI 状态表、S0–S6 顺序及 T01–T30 回归；只缓存 Python 原生证据，不冻结文件/KJ/API 状态。
- 特别边界：application-runtime 注入不能丢 options；pending full/auto + dependencies/live 必须执行 full/live；Gemma 执行前不能凭 runtime 旧 llama ready 放行；现有 harness scan 默认 dependencies，新增同进程 scan-benchmark 才能测命中。
- 已开始执行：按 PLAN 的 S0–S5 完成进程内 Python 探针缓存、指纹、scope/validation coordinator、安装失效、队列执行前 live 复检、设置页强制复检入口、诊断字段与同进程 `scan-benchmark`。缓存只保存原生探针证据，不冻结模型/KJ/API/文件扫描；旧快照投影使用副本，Gemma 执行前仍做 live llama 自检。
- 当前验证：缓存/指纹/coordinator 定向测试、设置与 prompt 集成测试、全量 Vitest、typecheck、build、对比度、最终 `verify` 和真实本机同进程五轮 `scan-benchmark --json` 均通过；两套健康 family 的三次命中均为 `nativeProbeStarted=0`，详见证据。
- 下一步：若需要继续收尾，只剩按 UX 契约在受控 Electron 会话手动核对缓存→强制→失败/待复检状态、键盘焦点和安装禁用；无受控会话时保持“未手动验收”记录，不启动或接管用户服务。
- 旧规划参考 HEAD：79c1d6c，非当前文件状态证明。性能目标：每个有效命中 family 零次重探针，两套健康时整轮零次；命中扫描 ≤2 秒或降低至少 50%；首次/force/不可缓存单独计时，不承诺同样加速。

## Plan and ownership
| 包 | 执行者 | 允许写文件 | 验收 | 状态 |
| --- | --- | --- | --- | --- |
| W1 | Luna probe worker | 新 attention-python-probe.ts、对应新测试 | 噪声 stdout、超时保留阶段结果、真实缺包 | done |
| W2 | Luna coordinator worker | 新 environment-scan-coordinator.ts、对应新测试 | 同 key 合并、不同 scope/key 隔离、失败恢复 | done |
| W3 | Luna UI worker | settings page/copy/selectors 及 JS mirrors、对应测试 | 失败状态、本地化、已观测值、安装禁用 | done |
| Integration | root | environment.ts、types、scanner、诊断、契约、changelog、TASK | focused + build + harness；verify 有外部失败 | done |
| Follow-up | Codex | PLAN 第 8–13 节缓存及集成文件，按 S0–S6 单人完成 | T01–T30 关键行为 + focused/verify + 五轮同进程计时 + UI 状态 | in progress（实现、verify、benchmark done；手动 UI pending） |

## Resources
- Workers 仅运行 focused tests，不构建、不启动 Electron/ComfyUI、不运行 GPU。
- root 完成 build/dist 与只读 harness，释放资源；未停止任何现有进程。
- 本轮未启动常驻服务，也未停止或接管现有进程；只读 harness 已使用本机配置执行真实 ComfyUI/Python 环境扫描和原生探针 benchmark。未执行生成任务/质量评估，手动 Electron 视觉验收尚未执行。单 agent，子 agent：0。

## Acceptance / handoff
- 保留所选 Python/实例、离线文件与在线注册区别、队列/历史标识及生成配置。
- 版本影响：patch，写入 Unreleased，不执行发布版本递增。
- 验证详见 evidence/verification.md；本轮执行者 Codex，子 agent：0，token usage unknown。
