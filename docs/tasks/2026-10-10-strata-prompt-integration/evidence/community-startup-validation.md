# 社区 uncensored 启动诊断

日期：2026-10-19（Asia/Singapore）。用户报告另一台电脑失败，要求先在本机启动测试，并允许资源紧张时尝试启动。任务为诊断和实际验证，未修改产品源码、默认设置或保护阈值，未安装软件/下载权重、未使用队列或调用Claude。沿用local-video-studio技能，区分服务级验证与真实UI增强旅程；此次没有宣称完整图文质量验收。

## 只读结果

- 本机保存的主应用后端不是Strata，模式off；旧独立Agent偏好指向0.1.44.1。其软件目录没有`data/lvs-control-vectors/sergqwer-8-33.gguf`，用真实`prepareStrataLaunch`可复现“控制向量缺失或大小不符”的启动前错误。新版已安装0.1.45有该文件。此事实仅针对本机，不能当作另一台已确诊。
- 新版小文件267552bytes、固定SHA-256一致；GGUF为controlvector/qwen4exp，direction.8至direction.33共26层，各2560 F32，均有限、非零且范数约1。与本机固定版引擎的加载源码条件相符，不启动GPU即可排除本机文件损坏、维度与零向量计数问题。
- 初始本机可用RAM约32.8GiB、提交25.5GiB，预检拒绝，未绕过。随后资源回升到RAM约41.5GiB、提交42.7GiB、显存约21.6GiB后，采用原有准入/实时监测，未执行先前考虑的缩小测试预算或强行取消保护。

## 真实服务验证

- 使用现有独立启动器`AgentController.engineValidation`与共享模型加载服务，隔离本轮偏好/token/日志，选择0.1.45、IQ3_XXS、32K、社区模式、不开原生页/GUI。取得共享GPU租约，经真实固定哈希、官方CPU pack与MTP离线转换后加载；没有伪造资产校验或使用mock引擎。
- 缓存绑定新版source revision，旧0.1.44.1完成记录不被冒充新版。新增派生pack/MTP留在正常data供后续复用，未覆盖旧缓存/源权重。
- 本次引擎日志明确确认`control vector mode = project, dir = per-layer, layers 8..33 (26 steered)`，服务状态vectorLoaded=true。引擎因提交容量选择官方部分驻留/文件回读（16.93GiB host complement），并非完整RAM驻留；没有把允许的回读警告误报为社区向量失败。
- 总143040ms含初次重新校验/准备；从HTTP身份/鉴权通过到独立模型已加载为69031ms。不能把总时间都当作向量加载开销。

| 请求 | experimental_speed_projection | HTTP / finish | 正文 | 端到端 |
| --- | --- | --- | --- | --- |
| 1 | true | 200 / stop | OK | 1269ms |
| 2 | false | 200 / stop | OK | 495ms |
| 3 | true | 200 / stop | OK | 451ms |

输入为“只输出英文 OK，不要解释。”，每次2个completion tokens。这是验证可运行/切换的极短请求，不构成长稿吞吐基准或去拒答效果评估。请求经受认证原生API发送，客户端`StrataService.chat`未被调用，因此其`applied`诊断仍为null，不把它伪装成增强器已完成应用事实。

最低周期采样值为RAM5.71GiB、提交8.09GiB、显存4.48GiB；不是连续峰值测量，但本次未发生OOM、异常掉线或资源保护中止。主动stop后产生进程退出码1属于自有停止流程，不能倒推成此前引擎崩溃。

## 清理与下一步

测试控制器停止自有服务/视觉助手/资源采样并释放租约，43127/43128监听均为0，无自有Python残留。测试偏好、DPAPI token、报告和引擎/服务日志保留在本机忽略目录`temp/strata-community-real-g6mqya`，不提交凭证、路径或原始运行日志。

另一台需其首条实际错误或启动器导出诊断才能区分：旧目录缺件、SHA错误、资源准入、加载超时、引擎退出和作用层确认失败。当前结果只能证明本机0.1.45/IQ3社区模式能实际启动和完成三条短请求，不证明另一台同因或已修复；未做Q4、完整H3按钮、图片/长上下文、Claude工具或去拒答质量测试。无产品变更，未重复完整verify或新增发布记录。
