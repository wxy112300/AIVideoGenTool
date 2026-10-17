# 给H3会话的Strata优化经验交接

- 类型：Evidence / 交接建议；日期：2026-10-17；状态：Agent实测已完成，H3迁移未实施。
- 范围：H3的Strata提示词增强、资源监测与GPU交接；不推导H3视频生成器的精度、采样器、attention或加速配置。
- 实测数据与失败记录以[接线验证](wiring-validation.md)为准，当前任务状态以[TASK](../TASK.md)为准。本文提炼迁移判断，不另建H3任务或替代其TASK；本轮只写交接文档。

## 1. 最有价值的结论

**把完整驻留、官方文件回读、冷加载临时缓存和真实资源耗尽分开判断。** 这次64GB机器能够运行，不代表关掉资源保护；原门槛和运行模式不匹配时，过严也会误报不可用或中止正常任务。

实测条件是63.8GiB RAM、RTX4090约24GiB、固定Strata0.1.44.1、共享Flash-Next IQ3_XXS/MTP；不是另一台128GB机器。保持k8v4、MTP spec4、GPU vision、expert-cache auto及5120MiB reserve，未修改分页文件、重下模型或复制第二套权重。

- 32K真实官方Claude八轮、64K完整GUI/CLI互通、128K和262144原生长输入分别通过。最低可用RAM一度1.70GiB，而相应提交余量仍约8GiB、空闲VRAM约4GiB，未因此失去执行能力。
- 262144原生探针实际输入220090 tokens，处理约105.8秒并取回首部标记；输入为重复惰性文字，不是复杂工程或H3扩写质量测试，也不是Claude220K工具会话。
- 文件回读下的成功说明存在可用的容量路径；**没有证明H3增强更快、影视扩写更好或视频生成更快。** 详细逐档加载耗时、三项最低余量、失败及清理见原证据。

## 2. 可迁移的优化方向及限制

| 方向 | 已取得的经验 | H3采用时的要求 |
| --- | --- | --- |
| 准入预算 | RAM可用量不等于Windows提交余量，CUDA/WDDM加载有独立提交成本；完整专家驻留预算不能代表文件回读的所有可用路径 | 分模式估计并实测；保留RAM、commit、VRAM三项准入，原完整驻留默认不偷偷切换 |
| 回读模式 | 原生`--resident-experts`不保证整个CPU补集都驻留；官方会按可用commit选择部分锁页补集，其余文件回读 | 请求模式、允许fallback和实际生效模式分别记录；确认原生日志/状态后才采用相应保护 |
| 低RAM误停 | 冷加载源映射与补集复制会短时重叠，回读时文件缓存也会占用物理RAM | 结合阶段、持续时间、commit和VRAM判断；不得把低RAM都解释为可回收缓存 |
| 传感器失效 | 单次WMI/nvidia-smi失败不证明OOM；未知指标不能转0或无限余量 | 复用现有新鲜复测、来源诊断和取消回收，持续缺失仍停止自有资源 |
| 上下文/KV | 扩大context会改变KV与专家缓存竞争，auto专家槽数会变化 | H3先保留32K；需要更大窗口时逐档真实输入，并记录KV、MTP、缓存、host模式和峰值 |
| 连续增强/交接 | 上一任务退出后，瞬时资源尚未回升；紧接启动可能被正确拒绝 | 复核自有PID/监听/租约退出及新鲜资源，再允许重试；不靠固定短sleep或杀未知进程 |

### 预算数值不能硬抄

Agent当前仅在`hostMode=resident`且明确允许文件回读时，使用`max(requiredMemoryBytes, vramTotalBytes + 18GiB)`提交准入估计；本机约42GiB。完整驻留的另一估计曾约59.6GiB；arena/H3原路径没有改成42GiB。

这不是“所有4090/H3都只需42GiB”的公式证明，也没有取消物理RAM门槛。不同模型、context、KV、MTP、视觉编码器、其他进程和驱动都可能改变峰值，应保留估计值与实测峰值的区别。

### Agent低RAM例外的准确边界

参考实现是`AgentResourcePressure`，只对Agent注入，H3尚未采用：

- 默认已知VRAM低于2GiB、commit低于3GiB仍拒绝；持续缺指标仍停止。
- RAM低于3GiB的例外，仅在指标有效、RAM至少512MiB、commit至少6GiB、VRAM至少2GiB时成立。
- 冷加载例外最长30秒；只有确认官方文件回读后，才可在上述健康条件下按缓存模式继续运行。
- commit介于3–6GiB且RAM低于3GiB，不符合例外，仍停止；RAM正常时也不能把6GiB误说成现有代码的统一硬停止线。

**512MiB不是建议给H3使用的新安全线。** H3后续还要交还GPU给视频生成，应由其真实图文增强及交接负载验证更合适的余量；不能仅让单测放行。

## 3. 当前代码与迁移容易漏掉的地方

| 位置 | 用途/核对点 |
| --- | --- |
| [strata-resource-policy.ts](../../../../src/core/strata-resource-policy.ts) | `planStrataResources`的模式/预算；`knownStrataResourcePressure`与缺指标判断；默认H3策略保持原样 |
| [strata-agent-resources.ts](../../../../src/core/strata-agent-resources.ts) | `AgentResourcePressure`的冷加载计时、确认回读及复位；可参考，不直接全局替换 |
| [strata-resources.ts](../../../../electron/services/strata-resources.ts) | 新鲜复测、独立显存查询、诊断、watch不重叠、取消等待与helper回收 |
| [strata-service.ts](../../../../electron/services/strata-service.ts) | load前压力判断、watch注入、`assertStrataResidentLog`和chat前检查 |
| [strata-agent-profile.ts](../../../../electron/services/strata-agent-profile.ts) | 只写私有context/log/slots配置，保留共享pack/receipt；显式允许官方fallback |
| [strata-agent-controller.ts](../../../../electron/services/strata-agent-controller.ts) | 准入、实际模式确认、资源心跳、退出复位、清理与日志；不是H3的现成生命周期替代品 |
| [gpu-resource-lease.ts](../../../../electron/services/gpu-resource-lease.ts)、[studio-gpu-guard.ts](../../../../electron/services/studio-gpu-guard.ts) | 跨进程租约、身份与交接，活跃/未知Agent需原窗口显式释放 |

具体注意：

1. **核对整条压力判断路径。** 当前`StrataService`的load前及watch支持可选`deps.resourcePressure`，但chat前仍有直接调用默认`strataResourcePressure`的检查。Agent的外部CLI直接请求Strata HTTP，成功不代表H3的`service.chat`已支持同样低RAM条件。H3若采用新模式，要同时覆盖准入→load→chat→watch→停止/下一请求复位。
2. `allowResidentFallback=true`表示允许，不表示已经回读；`assertStrataResidentLog`按本次日志偏移确认fallback，Agent再记录实际模式。H3默认仍拒绝未满足的完整驻留要求。避免把旧日志或上次请求状态带到新模型。
3. **新鲜度必须覆盖复测耗时。** 现有H3共享复测最多3次/12秒；Agent额外的before-load guard要求心跳8秒内新鲜，因此其controller另限6秒。6秒不是H3的通用新要求；有类似guard时再协调预算，不能采样未完成就制造“失效”。
4. H3的单次遥测失效修复已经完成，见[原会话证据](../../2026-10-10-strata-prompt-integration/evidence/telemetry-recovery.md)。优先复用，真实已知危险值仍优先；恢复继续同一次请求，不重启模型或重放推理。
5. 规划日志、实际引擎模式和停止原因分别记。原生配置类型错误、驻留断言、上下文400、输出length、传感器未知和真实低资源是不同问题；“崩溃/0词”不足以判因。

## 4. 建议H3会话的实施与验收顺序

1. 先恢复H3自己的TASK，查看当前未提交diff，确认共享文件和GPU归属；本Agent任务证据与资源监测任务均有既有改动，不能覆盖。
2. 先完善模式/阶段/资源诊断，再决定是否提供显式文件回读选项。保留H3原32K、默认完整驻留策略、输出预算、质量校验、uncensored语义及队列冻结行为。
3. 增加有意义的负测：瞬时未知后恢复、已知危险且另一项未知、持续未知、健康commit下冷加载短时低RAM、超时/真实不足、取消后迟到读数、模式复位及连续增强；验证没有自动重放或误停其他owner。
4. 用真实Electron隔离profile走缺输入→恢复→增强按钮→operation ID；覆盖纯文本、图片+指令、长稿、连续两次、取消/重试、模型复用和停止后重载。分别核对实际输出内容、结束原因、输入/输出/思考预算与质量，不能把网页可开或API/mock成功当按钮验收。
5. 验增强结束→队列/H3视频生成的真实交接：只保留一个重型GPU阶段，自有Strata释放完成后再加载生成器；活跃Agent拒绝交接，不静默中止。取消/退出各清自己的资源，保留历史与共享权重。
6. 用同一模型/同一输入/同一采样/context对照完整驻留与回读，分冷/热启动，记录加载、首token、生成和总墙钟时间、token量、实际模式和三项余量。此次不同档67–103秒的加载时间不构成“更大context更快”的对照证据。

开发检查沿用仓库Skill：`npm.cmd run harness:app -- guide prompt`；按改动运行focused（资源策略/探针/service/runtime-owner相关）和`npm.cmd run verify`，再执行真实按钮/图文/交接。另一台128GB机器须重新记录硬件和负载；本机数据不能代替其原故障复测。

## 5. 目前还不能下的结论

- 不能从Agent八轮/长输入推导H3影视扩写、图片理解、uncensored质量或视频生成质量提高。
- 不能据此把H3全局改成262144、取消分页/commit检查、关MTP、改KV或固定专家槽；本轮仍用官方auto策略，未证明这些替换更好。
- 不能保证长时间回读吞吐、所有OOM场景、实际compact或原生管理页冷重载已经通过；完整H3真实按钮/队列交接仍待其会话验收。

本次交接文档没有启动服务/GPU，没有修改H3源码、配置或另一个会话的TASK，也未发送跨会话消息。实现前以当前磁盘和归属协调为准。
