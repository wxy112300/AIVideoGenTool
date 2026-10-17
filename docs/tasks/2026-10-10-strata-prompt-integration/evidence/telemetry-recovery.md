# Strata 遥测短暂失效恢复

- 类型：Evidence；日期：2026-10-17；状态：implemented / regression-validated / remote-heavy-load-unverified。
- 授权：用户报告另一台机器大token／紧接上次增强时频繁出现“资源监测不可用”，要求修复过敏停机策略。patch，不bump／提交／推送／发布，不下载权重或改系统资源设置。
- 基线：0.65.3／`9d5c308`，工作区已有独立Agent任务改动。经用户授权发协作消息，对方通过其`resource-watch-coordination.md`确认服务／测试／build归属和无在用dist／产品服务；保留对方onSpawn／GPU租约改动，不接管其Agent任务。

## 原因与修复边界

旧`strataResourcePressure`将任意单次未知读数直接归为中止原因；load／chat捕获后停止自有进程。PowerShell/WMI或nvidia-smi一次超时／解析失败即可触发，不能从该报错证明引擎自身崩溃、OOM或token越界。旧GPU查询还把利用率／温度和显存共同解析，其中一个N/A就丢失全部GPU数据。旧日志未保留具体传感器原因，不能断言远端是哪一个失败。

- `strata-resources.ts`新增统一新鲜复测，最多3次、总采样预算12秒；失败后分别等待500ms／1000ms再试。恢复立即继续原请求，不重连／重放生成，不重启模型，不用上次请求的资源读数兜底。预算用于采样，原生helper取消后的退出回收另需完成，不把它视为加载或生成超时。
- 规划自适应启动、load前、每次chat前和运行中watch均采用该复测。持续未知仍明确失败并清理自有模型，不无限失去监测运行。
- 显存改独立查询memory.free／memory.total，避免温度／利用率异常连带；Windows提交余量仍读既有locale-independent FreeVirtualMemory，未改变其语义／总内存预算或系统分页文件。
- 硬安全线不变：已知空闲显存<2GiB，或RAM／提交余量<3GiB立即失败；其他读数缺失也不能掩盖已知危险值。本轮不增加硬低资源防抖，不保证消除OOM。
- watch不重叠，终止仅发一次；取消打断等待与原生探针，等待本次原生helper确认退出，丢弃迟到读数，前一轮不会在后一轮补发abort。
- 日志为Prompt.StrataResourceRetry／Recovered／Unavailable／Pressure；包含缺失指标、来源分类、尝试次数、耗时和资源值，不包含原始helper输出／命令、prompt、思考或key。未知保持null／缺失，不转成0或无限可用。

## 验证

1. 最终focused5文件69项通过：遥测／纯策略／服务／runtime-owner／uncensored；包含一过性缺失恢复、例外恢复、3次持续缺失、12秒卡住、真实危险与另一传感器缺失同时出现、取消等待、原生双helper回收、迟到结果、连续请求无串扰与停止不重复。
2. 服务故障注入：长输入／32K自动输出预算，流式等待期间一次commit／VRAM未知后恢复，随后第二次增强再次注入缺失；两次完成且launch一次、无中间stop。另验持续缺失在发新推理前停止自己的进程。这些是生产服务＋模拟端口证据，不是模型质量／吞吐测试。
3. 最终`npm.cmd run verify`通过：221单元文件／2058项，6集成文件／88项，双端typecheck、干净生产build及20对比度。既有chunk大小警告保留，无门禁失败。临时目录隔离，未清理或覆盖用户旧日志。
4. 最终构建真实Windows／NVIDIA遥测连续3次读取正常：430／421／444ms；可用RAM约27.13GiB、commit约24.51GiB、显存约21.87GiB。只查询，不加载模型；当前RAM／commit不足既有IQ3安全加载预算，未降低门槛进行GPU实验。
5. 生产StrataService＋已安装官方serve.server `--engine mock`真实HTTP：两个请求，预算8975，各正常stop且非空；为覆盖watch等待有意延迟客户端消费（不是性能测量），共7次合成资源采样，短失效后PID始终75360。合成100GiB资源仅用于mock，不把其作为真实机器或神经推理证据。认证为测试临时随机值，仅子进程env传入，不打印或进入命令行。
6. 最终官方mock PID75360、loopback5525已退出／关闭；首次同类验证PID22504／5324也清理。没有启动GPU、ComfyUI、Electron产品窗口、视频队列或Agent；不改用户state／默认模型／Claude／CC Switch／Codex。此修复无UI变动，既有入口journey在回归中保留，不宣称本轮真实按钮／GPU图文已验。

临时脚本与日志留忽略temp：`strata-telemetry-http.mjs`、`strata-telemetry-http-final.log`、`strata-telemetry-verify-final.log`及隔离测试日志；不进Git。

## 未验与交接

另一台电脑原有长token／连续增强负载仍需实际复测；本机低负载正常不能解释远端传感器失败根因。若仍失败，新增source／次数／耗时可区分持续采样失效与真实低资源，不能继续只报“Strata崩溃”。模型参数、32K上下文、输出预算、时间上限、质量校验、队列释放保持原策略。

Agent任务目前有独立controller原始采样循环；本轮只修H3服务及共享watch／策略，未替换其controller生命周期或宣称Agent同路径已完成。`readReliableStrataResources`可用于后续Agent接入，须由该任务结合guard与取消语义验收，不自动重放工具调用。
