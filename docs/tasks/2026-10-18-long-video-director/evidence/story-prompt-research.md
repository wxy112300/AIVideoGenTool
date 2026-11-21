# 单图短剧：Continuum 提示词研究与实跑

## 六段稿与既有成片复核（2026-11-18）

| 时间 | 保存稿与抽帧对照 |
| --- | --- |
| 0–10 秒 | 稿中直接写站在车旁、摸车把，省略了过渡。抽帧能读出从车旁走向柱边，缺少足够清楚的寻包起因。 |
| 10–20 秒 | 蓝车司机在稿中开门并介入。15／19.5 秒有黑衣人物从蓝车旁接近，围观者保持背景即可。 |
| 20–30 秒 | 稿要求狗在排水沟找到包。25 秒出现低机位，29.5 秒切近后多出计划外的女性，黄色包的位置仍不明确。 |
| 30–40 秒 | 模型把同一辆摩托滑向车道改成第二辆绿黑摩托驶来，实际 35／39.5 秒也出现绿摩托与另一位骑手，偏离原事件。 |
| 40–50 秒 | 同一段并行写推开停放摩托、掀盖捞包及另一辆车通过。抽帧能读出探向路沿和拿到黄色包，预定的通道解除过程不连贯。 |
| 50–60 秒 | 55／59.5 秒分享、和解可辨。黄色包已在骑手手中，抽帧未覆盖完整交接，狗的毛量与体型也有漂移。 |

提示词库已明确开场姿态转换、用户指定事件中的人物和道具身份、可见的救险触发→反应→安全状态，以及同一镜头内可读的道具交接。本次复用已保存的模型读回、接触表及正式 History 播放报告。新写法尚无模型输出或成片证据，听觉与口型仍待验收。

## 最终实跑结果（2026-11-18）

用户选择按官方方式接线后，新生成使用Full Run，Spectrum0.2.30原样保留，未降级正式节点。真实鼠标入队任务`ef292588-fcfe-4b6b-b6f6-68aac2a41a38`，一次提交prompt `7ad9cedd-6c31-4ea7-ab6c-10c14ae1d7fb`；六段Qwen模型稿没有人工重写。Strata成功operation为`a9778a43-63cd-4695-889d-301ad043dce7`；规划一次、详稿分两批，第一批同一已完成响应中的声音字段经生产编译器恢复。隔离实例关闭思考，正式medium设置未改。

Full Run采样及音画封装20分33秒，六段均实际新生成；官方manifest complete、v6、resume_safe=false，应用接受完整新成片而不伪造后续可复用性。父journal完整保留prepared→submit→accepted→validated→published，单History/单版本ID与task一致。真实视频864×480、24fps、60秒、1440帧；音轨32kHz、1920000内容样本、padding0；全解码及SHA校验通过。实际History播放器解码12帧并推进时间，返回可达。数据保留在忽略的测试fixture；未注入正式资料库。后端日志有早先Proactor管道清理异常，但本prompt成功完成，不能笼统称整个会话零异常。

质量依据为18张实际抽帧（每段0.5/5/9.5秒），并非逐帧运动或听觉验收：

- 0–20秒：桥下空间、蓝车、骑手/狗基本延续，有人物走近和对峙，冲突意图依赖提示词才能明确读出。
- 20–40秒：近景推进到路边人物/狗，摩托进入，情势有变化；出现计划外女性，黑衣人物身份不稳定，摩托与人物动作存在跳变。
- 40–60秒：黄色包被拾起、人物互动并出现和解结尾，形成事件推进；黄色包的回收位置和动作因果不够清楚，狗末尾毛量/体型明显漂移。
- 音轨可解码且非静音，均值−33.7dB、峰值−8.5dB；这些指标不证明语义、对白清晰或口型同步。

结论：单图+方向→模型整片规划/六段详稿→真实入队→Continuum/Spectrum完整60秒→History播放的技术链路通过；叙事呈现部分达标，不能声称可稳定生成完成度高的短剧。后续质量方向是缩小活跃角色、明确首帧动作过渡、把救险拆成更少的可见动作，并检查道具交接与人物出入场；本次不通过人工改稿或额外重采来覆盖失败细节。

Full Run保留官方show_preview使采样回调可达；应用按各段步循环汇总进度，避免首段完成就显示整片采样完成。实际本次图是在该最后修复之前冻结，只有解码/封装进度被看到；进度修复以定向回归验证，不冒充第二次GPU实测。连接响应正常的Full Run取消固定无进度超时，实际后端错误、断连与用户取消仍保留。

最终verify退出0：343文件3324单元、7文件132集成、干净双端typechecked build与440对比度全部通过；Python9收据/15守卫通过后未再改Python。测试窗口关闭、原App拥有的runtime已停止，Electron44708及4327/18329/43137监听均复核不存在。报告为Harness隔离资源清理，不冒充原生窗口关闭生命周期验收。正式资料库与用户其他应用未修改，生成文件和旧失败Run均保留。

以下记录保留调查过程，早期“尚未实跑/下一步”以本节结果为准。

## Spectrum故障重新定性（2026-11-18）

真实首组20步采样已完成，Spectrum实际11次/预测9次、无fallback。失败manifest为v6但resume_safe=false，其Spectrum字段为`unsupported provider source change`。本机干净Spectrum0.2.30（7df883bb2361b7884ad789e97effd1dc37c8963a）与Continuum的PUBLIC_SOURCE_029逐文件比较，55个文件仅minimax_h3.py不匹配；0.2.30该文件新增PackedLayout和FinalLayer grids兼容。这个源码审计拒绝不由步数、显存阈值或Spectrum开关取值修复，也不证明Spectrum采样不兼容。

同时存在应用执行策略因素：`workflows/minimax_h3_continuum_v38_managed_extend_api.json`固定Review Each Chunk；`compileContinuumGroupWorkflow`沿用该模式；group_receipt.py要求每个已采样组均可跨Queue复用。官方[V3.9指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/docs/USER_GUIDE.md)的默认示例采用Full Run，[README兼容表](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum#compatibility-and-verification-scope)区分新生成可用和复用合同匹配，并明确有限审计含upstream0.2.29。[Spectrum0.2.30发布](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.30)说明新Core兼容变更；不能据此宣称所有第三方续跑已验证。下一步优先评估官方Full Run接线，不默认要求正式降级；现有失败Run不改写为可复用。Full Run在本应用/本机的60秒成片尚未验。

2026-11-18。目标：真实历史首帧 + 一句故事方向，经 Strata/QwenFlash 形成至少60秒、有起因/冲突/转折/结局的短剧，而非延长同一个动作。延续本 TASK，不新建第二份计划。

## 资料与取舍

- [Continuum当前README](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/README.md)、[官方节点作者的解析器](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/v2/prompts.py)：List模式按顺序接收每段独立文本/JSON字符串数组，Timeline使用整片时间窗；全局前言会重复。继续时应提前写好完整计划，不能把分页当成自动切镜。应用保留List模式，在稿内用局部时钟，整片坐标仅用于事件分配，不重复整个故事。
- [MiniMax官方Base指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)、[Comfy官方H3指南](https://github.com/Comfy-Org/docs/blob/main/tutorials/video/minimax/minimax-h3-prompt-guide.mdx)：画面、动作、镜头、台词与音效共同构成执行提示词；以可观察行为呈现人物选择，台词关联稳定说话者；连续运镜不必另起Shot。保留三个核心音画字段，仅在真实切镜时增加Shot与递增局部时间。后续页承接已有状态，不重复首帧对齐。
- [社区Continuity Studio作者的Story writer](https://github.com/KadoBOT/ComfyUI-H3-Continuity-Studio/blob/main/guide/story/writer.md)、[作者社区说明](https://www.reddit.com/r/StableDiffusion/comments/1xlp0kg/i_made_a_comfyui_tool_to_bring_back_earlier/)：规划和片段写作分开，角色/道具外观稳定，片段从前一段实际达到的姿态继续；结构合法不代表成片质量。借鉴规划→分段与边界状态方法，未引入该扩展节点、额外运行服务或新的Timeline UI。

新增作者编写的 `src/core/prompts/h3/continuum.ts`，服务复用该提示词库。规划涵盖观察到的人物/地理、创作假设、目标/利害、事件因果、道具归属和结局；逐页outline明确进入状态→新事件/选择→后果→离开状态→镜头/声音。详稿使用上批已采用末页及完整计划，6段形成6个独立采样字符串。没有添加词数/关键词/硬件推荐等新准入门槛，既有结构、页面身份、锁定与陈旧响应保护保留。

## 当前真实测试

- 从实际资料库只读加载137条视频历史、筛出36张可用原图。联系表人工检查后选资产 `207d1be6-2bef-4d2b-b615-8ab9c04b051e`：桥下涂鸦街区、蓝车、骑手、流浪汉与黑狗。
- 用户方向仅一句：骑手误认流浪汉偷黄色食物包，蓝车司机追问，黑狗引出真正的落包和滑向车道的摩托，众人救险后分享食物。新增黄色包明确属于故事发展，不宣称它原本就在图片中。
- 独立空队列/空历史fixture `temp/create-smoke-pm9q1h`；App CDP1222，自有Comfy18329、Strata43137。固定用户已安装Strata0.2.15/c775728、QwenFlash IQ3_XXS、medium思考；480p为本次试跑选择，不是产品上限，Spectrum开启，6×10秒。
- 实际拖图、输入方向、确认布局、真实增强按钮已触发，operation `b934659a-f43e-43f2-8388-ca573aa36732`。当前正在准备模型/推理，尚未采用分段、入队或H3采样。报告持续保存在忽略的 `temp/long-story-20261118-*`，不得据此宣称60秒短剧已完成。

## 实际资源恢复

首次调用在原生加载前被应用 `reserve+15GiB` 的固定20GiB估算挡住（实测空闲16.3GiB）。删除这项估算准入条件后，第二次已原生加载权重/预热，但又被应用2GiB GPU余量监测中止；原生日志CUDA余量约4.8GiB，并无后端OOM。这两个失败都保留，没有替换故事或提交H3任务。

当前原生Strata会话取消上述GPU估算拒绝与低余量误杀，保留告警、实际后端错误、取消、未知监测恢复及严重持续commit紧急处理。Windows会话reserve额外计入全局已占显存，只减少本次自动专家缓存，不终止其他应用或更改已验证基础pack。75项资源/服务回归通过。原生第三次调用已进入加载，专家cache缩至5.17GiB，此时全局空闲约6.6GiB；不是性能或故事质量证明。最新operation `dc14fdc0-231e-4cd8-a62f-a799cb7d1259`，使用同一保存草稿；恢复后CDP6054/PID533544，端口/PID以launch.json为准。

第三次在持续生成约27726个思考字符时被应用600秒请求总时限中止，非无响应；取消正常原生调用的固定时限，保留显式测试deadline、用户取消、实际连接/进程错误。原有仅DeepSeek超10分钟的虚拟时钟回归扩展至Qwen加载/推理。补充longVideo秒数/段数安全元数据及思考计数进度；真实日志已确认60秒多段请求。另修复真实runtime进度导致renderer重挂载后，旧控制器以signal.aborted丢弃完整模型包的问题；只对仍匹配的live脚本采用，文字/布局/锁定变化仍拒收；沿用原按钮计时及取消，无新开关。

第四次仅在隔离实例选择low思考、detailed-cinematic，正式设置不变；原生已产生5483个思考字符，但WMI/nvidia-smi采样暂时超时被旧监测器中断。引擎没有报告故障。现为原生会话使用明确的probe-unavailable类型，监测丢失告警重试，不中止后台计算；用户取消仍清理采样，确定的持续严重commit风险与后端错误保留。77项监测/服务回归及双typecheck通过。第五次operation `d76e4618-84c2-4e53-a40b-f8443e015a67` 已真实按钮触发，CDP14483/PID608984。尚未模型稿采用或H3采样。

已通过的综合检查：342文件3314单元、7文件132集成；干净含双端typecheck的生产build、440对比度；这轮全量在最后的监测恢复修复之前完成，受影响77项及双typecheck/后端编译已单独复核，后续整片执行后再收敛最终证据。所有失败日志与fixture保留，不自动重提任何不明H3任务。

第五次low思考真实持续超过十分钟仍有输出，最终累计46557个思考字符，未判为崩溃。为先检验较快的单图成剧，操作员主动取消该次规划；AppApi确认cancelled，原生模型保持resident，同一Strata parent486260/native625320没有重载，没有保存任何半稿。只在隔离实例选择off思考；正式medium设置不变。还修复多段按钮未接现有共享busy状态导致取消后停留在计时/取消态的问题：复用共享状态，完成后仅在Create刷新，不影响其他页播放。

第六次operation `b0d7317d-4fcf-40c2-b60d-f011c37f342a`，关闭思考、detailed-cinematic，实际按钮/同图同句方向，已完整生成规划（1923输出tokens，finish=stop，思考0）。当前按完整计划写1–3段，之后4–6段；只有整包通过原子采用后才审稿入队。当前仍零H3采样。第五次的长思考不作为模型质量失败，off与medium也不是同条件性能对比。
