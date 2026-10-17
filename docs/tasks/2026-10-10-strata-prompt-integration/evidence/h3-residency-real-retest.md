# H3驻留、连续增强与蓝屏核查

2026-10-17实测；2026-10-18重启后核查。Patch级，未提交/推送/发布。

用户明确授权将Agent经验直接优化H3。按local-video-studio技能走真实Electron增强按钮，长资料另用AppApi并单独标注。仅提示词增强、空队列；不下载权重、不修改系统分页文件/驱动/其他客户端配置。硬件为本机63.8GiB RAM + RTX4090，不是另一台128GB电脑。

## 实施及当前状态

- 维持32K/k8v4/1024视觉tokens/MTP spec4/auto缓存与至少5120MiB显存预留、自动输出预算和质量门禁。
- resident允许官方部分锁页/文件回读，采用既有分模式commit估计（本机42GiB）；完整arena预算不变。许可与实际hostMemoryMode分别记录。
- H3冷加载低RAM回收窗口最多30秒；确认回读后仅在RAM>=2GiB、commit>=6GiB、VRAM>=2GiB时不按完整驻留3GiB RAM线误停。Agent仍保留独立512MiB策略。部分指标未知按同一模式判断已知硬危险，其余最多3次/12秒新鲜复测，不重放推理。
- 完整正常推理的格式/长度/时间点错误不保存结果，但保留ready/loaded健康模型并记StrataValidationRetained。取消、流式、资源、未知归属或清理失败仍停止保护。
- 官方STRATA_FILE_RELEASE=1候选减小自有文件映射工作集，前三轮有收益，但长稿期间蓝屏；**已回退默认0**，不认定候选是原因，也不保证回退便能治好蓝屏。

依据：[固定上游说明](https://github.com/Niko1221/Strata/blob/296b59d2/docs/DETAILS.md)、[官方试验及限制](https://github.com/Niko1221/Strata/blob/296b59d2/bench/results/2026-10-04-windows-mapped-release/README.md)。本机固定安装源码亦已核对。

## 真实结果

| 用例 | 结果 | 墙钟耗时 |
| --- | --- | ---: |
| 原严格预算：缺输入→恢复→真实按钮 | commit46.5GiB低于旧58.7GiB，GPU加载前拒绝 | 3.7s |
| 无文件页释放，2GiB RAM底线 | RAM约1.99GiB触发保护，commit/VRAM仍健康 | 61.1s |
| 无文件页释放，临时1GiB底线 | 一次完成，随后RAM约0.87GiB再次保护；未继续降低，已恢复2GiB | 232.2s / 59.0s |
| 文件页释放候选：简单文本按钮 | 完成，1→2版本，含冷启动 | 99.668s |
| 候选：历史机场图+879字15s复杂单镜头 | 完成，2119字符；输入文本3103tokens、输出3296tokens、stop | 62.326s |
| 候选：立即同稿再增强 | 完成，2085字符 | 60.429s |
| 候选：同图15s三镜头 | 完成，2824字符 | 70.492s |
| 候选：长资料AppApi | **蓝屏中断，无完整输出/最终耗时** | 未完成 |
| 随后的取消→立即重试、神经推理遥测注入 | **尚未执行** | — |

三轮图文复用服务PID63208，最低采样余量RAM7.85/commit8.66/VRAM4.07GiB；不覆盖蓝屏瞬间，不能据此前三轮保证无OOM。单图首段可见正文约45.6秒，原生正文阶段约74tok/s；thinking/视觉/预填充/纠正与冷启动不能算成纯decode。

格式/长度通过不等于语义全通过：单镜头输出仍把图中空中背景飞机描述成滑行，并给右侧建筑增添航站楼/控制塔身份。未修改质量门禁掩盖这一负例。

## 蓝屏与清理

Windows事件1001确认0x3B，参数1=0xC0000005，故障地址ffff8e67c156eae3；23:52:37记录、23:52:12重启，标准内核dump约6.57GiB。10月13日已有同停止码/异常码记录但地址不同，不能认定同根因。

最后应用日志为23:49:06.694、长资料operation93d7459c-5d36-431c-a116-0fd8fbc044b7、generating阶段；无完整推理指标/末段持久化资源样本。不能推断没有资源问题，亦不能把系统蓝屏说成应用主动停止。

已安装WinDbg；普通用户读dump被拒，用户随后授权管理员只读分析。不上传dump、不启用Driver Verifier或改安全/驱动设置。分析已完成：PROCESS_NAME为Taskmgr.exe，故障模块win32kfull.sys，符号DEVLOCKOBJ::vDestructor+0x1c3，调用链为NtGdiFlushUserBatchInternal→NtGdiFlushUserBatch→W32CalloutDispatch。失败桶AV_win32kfull!DEVLOCKOBJ::vDestructor。这是任务管理器线程的Windows GDI内核分支，不是已定位到Strata/VirtualUnlock/CUDA的直接调用栈；故障点不能替代根因，仍不能排除负载触发、驱动或数据损坏。

同一dump的!vm显示Available Pages约10.76GiB、commit limit减committed约9.24GiB；不能说故障当时物理RAM或全局commit已耗尽。亦记录5次commit requests failed，但没有对应时点，不能忽略该历史计数或由此断定本次OOM；未取得故障时刻VRAM用量。原始分析仅在忽略temp/h3-cdb-admin-analysis.log与h3-cdb-memory.log中，管理员调试器已执行q退出。

重启后自有Electron/Strata与测试端口已退出，这是重启清理，不算正常退出验收。正式用户state指纹仍与测试前一致，未改原队列/历史/模型选择。输入、输出与逐秒读数在忽略的temp/create-smoke-b0sTE7中。

候选代码6文件100focused、verify221单元文件2069项/6集成文件88项、双端类型构建/20对比度通过；回退开关后的完整verify同样2069unit/88integration及类型/构建/20对比度通过，日志为temp/h3-recovery-off-verify.log。取消/重试、真实神经遥测注入、128GB及队列交接仍未验。根因不明时不继续大模型压测；下一步是图形/GDI内核故障的独立排查与最小对照，不自动升级驱动或重启系统。完整输入/输出已导出忽略temp/h3-recovery-results.md。
