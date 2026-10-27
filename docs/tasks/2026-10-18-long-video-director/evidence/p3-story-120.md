# P3单图故事增强与120秒验收

2026-10-26；minor增量；状态以[TASK](../TASK.md)为准。

## 固定样本与授权

- 用户要求从视频History挑选真实复杂原图，以故事意图触发提示词增强，一次提交120秒任务包并渲染；同时授权关闭Unreal且不保存。已结束核对过的UnrealEditor PID79344，未关闭其他用户应用。
- 只读审阅History引用的36张原图，选择桥下涂鸦街区：蓝色轿车、摩托骑手、行人、黑狗、桥墩壁画和背景交通；source asset `207d1be6-2bef-4d2b-b615-8ab9c04b051e`，原图SHA `39ac8a9b10861ae891fb8077f3819fa7854f1faeb26c1b70ebb88fbd8cf9b5dc`。隔离复制原图，正式History/媒体不改。
- 故事依次为摩托落前轮/蓝车跟随→狗走近车道/让行→原座位旁人物带狗回路缘→骑手掉落黄色小包→捡起交还/致谢→蓝车和骑手离开；保持连续跟拍、身份/服装/物品位置，不切镜或循环前段动作。黄色小包明确是新增故事道具，非原图事实。
- 固定12×10秒、360p实际640×352、20步、PyTorch、INT8 ConvRot VAE、无LoRA/Spectrum/插帧。Strata沿用户当前IQ3_XXS选择。一次120秒新Run预算，尚未采样；不补跑旧P0/Create/Extend预算。

## 实现与静态验收

- 可选结构化longVideo请求沿现有string增强API/operation/resource owner；不把旧单段H3接口偷偷扩为120秒。planner先分配全片事件和边界，再每批最多3页详稿；使用全片计划及上一批最后边界，不把整篇故事重复送入每段采样。
- Create实际增强按钮支持全自动整包、半自动当前页；采纳前严格检查script/page ID、数量/顺序、布局、锁定、当前文本/缓冲和原图身份。整体失败/取消/过期不写新版本，成功一次原子增加model版本；旧原生提示词仍保留。其他provider/Extend增强仍阻塞。
- Queue增加当前物理组进度字段，经transient state/IPC/renderer增量更新，与父任务总进度分开；duplicate/reset清旧值。当前浏览页不按进度自动跳转。
- 7文件79项定向通过。完整`VITEST_MAX_WORKERS=2 npm.cmd run verify`：287文件2683单元、6文件91集成、干净typechecked build、440对比度通过；未放宽断言或超时。

## 真实按钮结果与当前阻塞

- 2026-10-27用户转为先观察实际应用UI，并要求保留VS Code。正式App原先未运行，完整备份正式状态并检查原文件SHA后，用现有脚本/Queue工厂导入一份**手写UI观察稿**；实际App打开后，原5条等待快照全部原有字段、设置和137条History保持，新增第6条`UI观察-手写分段稿-120秒.mp4`及对应12页草稿。全体版本source=user，未标为模型增强。任务单独冻结PyTorch，未修改正式sage-triton设置或已有waiting项；由于是离线导入，不计作真实按钮入队可达性证据。真实AppApi/DOM核对12页编辑器与14项Queue页切换按钮、素材预览和暂停态，截图已复核；主App PID28024/CDP9333保持可见、queueRunning=false、Comfy未启动。备份和观察报告留忽略temp；不得把这份观察快照算作120秒增强/采样完成。

- 隔离fixture `temp/create-smoke-6s4Pbb`：真实原图拖放、120秒/12段确认、复杂故事键盘输入、自动模式/影视细节预设、实际增强按钮已通过到应用调用。前两次探针均在增强点击前停止：已为off的禁用Spectrum控件、IPC保存时序；修复探针等待/无操作检查，保留attempt1/2，不移除disabled或降低门槛。
- 唯一实际增强operation `22442806-86ac-4f84-9aea-6a404b14bc37`完成两份大权重SHA验证和准备，随后被现有安全资源准入拒绝：需要20.0GiB空闲显存、实际18.9GiB。模型未加载，planner/detail推理0、模型稿0、queue0、120秒采样0/12；原故事和12页布局保留。`story-prepare.json`记录真实失败，不能当running或通过。
- Windows显示VS Code约2.8GiB专用显存分配，已询问是否可正常关闭；该应用超出只关闭Unreal的现有授权，未擅自关闭或降低显存保护，也未换更小模型。
- 实际资源错误留`temp/long-video-story-error-evidence.json`，UI/GPU脚本为`probe-long-video-story.mjs <fixture> prepare|enqueue|render --port <port>`。恢复须先复核无活动请求/新queue，保留失败报告再创建新attempt，不能直接盲重跑已有wx报告。准备通过后人工审阅真实脚本，再实际enqueue/Start；模型与视频GPU阶段互斥。
- 自有PID74028、CDP11592、Comfy18309、Strata43127均已复核无残留；AppApi已关闭，提示词和Comfy服务已停止。此为Harness清理，不证明原生窗口退出生命周期。
- 2026-10-27用户已授权正常关闭VS Code；核对窗口PID9116后发送正常关闭请求，但窗口仍在。未强杀或丢弃保存内容；桌面工具的沙箱初始化失败阻止检查退出提示，已另询问用户正常处理或明确授权不保存强制结束。当前显存比此前更紧（空闲约12.3GiB），本次未重开fixture或发出新请求。
- 尚未证明增强语义、120秒成片/资源峰值/段间连续性/结尾；不能以测试数量、JSON结构或按钮可达性代替视频结果。既有完成Run增段的raw副本导入失败另见TASK，不因本次新Run测试而宣称已修复。
