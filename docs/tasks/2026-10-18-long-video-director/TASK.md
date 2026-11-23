# 长视频模式：Strata 编排与 Continuum 自动续接

## 新对话接手摘要（2026-11-18）

用户为切换对话要求记录进度；本节为当前接手入口，下方阶段记录保留历史。当前目标是「真实历史单图＋一句故事方向→Strata/QwenFlash整片规划与分段详稿→Continuum完整短剧」，最新验收范围为至少60秒。技术闭环已通过，画面叙事质量仍需改善；不把早期120秒及已有Run Extend标为完成。

- **创建页放宽入队与整份撤销（2026-11-23）**：撤下首帧门槛，H3 无图走纯文本、仅尾帧保留尾帧条件。关键帧缺图或缺时间、R2V 空槽可跳过，非法时间或实际引用无效仍阻塞。执行时保留输入内容和画面引用的对应关系。Continuum 确认布局后可用手写分段入队，复核提示仅供参考。清空草稿通过原有 6 秒撤销入口同时恢复提示词、分段、首尾帧和 Add Guide。真实隔离 Electron 验证两段纯文本入队、空关键帧警告、清空和点击撤销恢复 Add Guide 与原分段 ID。双端类型检查、工作流和撤销定向测试通过。对应旧清单的 3、5、6、13 已更新。[入队阻塞清单](evidence/create-video-enqueue-gates.md)

- **创建页共享提示词和纯文本入口（2026-11-23）**：原生和 Continuum 的「全局」同步，切换保留文字与独立段落。H3 FL2VA 多段支持纯文本拆解、扩写、入队和 Full Run 快照；提供尾帧时仍需首帧。真实隔离 Electron 验证空段阻塞、双向切换、键盘补齐和鼠标进入等待队列。130 项定向测试、双端类型检查和桌面生产编译通过。入队阻塞逐项清单见[图生视频入队阻塞清单](evidence/create-video-enqueue-gates.md)。

- **原文要求与手动修订（2026-11-23）**：两条真实历史图配合 Strata 完成 20 秒四段稿并进入等待队列，队列 11→13。《沿岸的一次低掠》确认手改 3.0 秒切点优先于原文 2.0 秒，实测发现的无配乐及明确切镜格式问题由编译器修正，海岸左右方位仍有冲突。《潮线露出的路》按原文恢复正确的原地右转，两块石头、停镜和最后细流的顺序通过文本审稿。队列切换文案去掉括号并通过实际鼠标验证。草稿和 Strata 设置已还原，ComfyUI 保持停止。详见[原文要求与手动修订实测](evidence/story-prompt-research.md#原文要求与手动修订实测2026-11-23)。

- **Full Run 拆解与扩写实测（2026-11-23）**：结构化「开场／推进／交接」，逐段补入已成稿的上一段动作和音画、以及更早两段的交接。真实历史三张首帧测试三故事，15 秒台球、18 秒树林、20 秒车库各通过实际按钮冻结为 waiting。车库按第二轮发现修复镜头标记，保留实跑的第 1、2 段，再扩写第 3、4 段，正文切点通过校验。对白位置和新增道具仍有语义偏差，未渲染。原 8 条等待任务、138 条历史和用户设置及草稿已核对，104 项定向测试和双端类型检查通过。见[实测记录](evidence/story-prompt-research.md#full-run-拆解与扩写实测2026-11-22)。

- **采样路由与语料（2026-11-22）**：旧 Full Run 六条冻结正文 SHA-256 全部与官方 List 解析合同、逐段记录一致；后五段记录 22 帧 Masked AV 续接。区分首帧图像编码与首帧 latent 锚点，记录终段物理合并与续接后端切换的适用范围。补查 OpenH3-IR 两个公开对照并抽帧、ostris H3 1K 语料、社区写作工具与 #21 重复段落报告。发现自动分批和单页扩写的出稿校验不同，多图模式需独立核对 Strata token 预算。见[采样路由与语料补查](evidence/story-prompt-research.md#采样路由与语料补查2026-11-22)。未改运行代码、未提交或重采。

- **案例与待证问题（2026-11-22）**：新增十组官方、论文与社区案例及五组本应用对照问题。只读复核旧 60 秒的原文、规划答案及冻结快照，确认原文未指明摩托车归属，事件从“滑入车道”变成另一骑手驾车接近始于规划，且该任务未启用共享前言。重点待证为指令冲突与上下文长度、段尾摘录缺失的音画状态、自动分批内的交接、计划切点与实际续接的关系。详见[案例补查](evidence/story-prompt-research.md#案例补查与待证问题2026-11-22)。本次只读调查，未改运行代码或启动生成。

- **叙事与镜头接缝（2026-11-22）**：复核已完成的六段模型稿和成片证据，确认换成第二辆摩托的偏差出现在 Strata 稿里。查阅 MiniMax 指南、Continuum 通用与 V3.9 Skill、社区多段写法及接缝问题后，保留用户的故事原文，扩写只送当前段和相邻起止状态，内置预设使用精简的 Continuum 写作指令。证据、参考链接和接缝审稿标准见[写作链路复核](evidence/story-prompt-research.md#写作链路复核2026-11-22)。本轮沿用已有测试素材，未启动新推理或视频采样。

- **大纲可直接入队（2026-11-22）**：分段大纲和锁定段落可采用当前文本提交，空段和待复核段仍有校验。隔离 Electron 验证空段提示、键盘补齐第二段、鼠标提交第一段锁定的大纲，任务 `31175403-d3ff-4c66-bf9d-e39cf74b9cfa` 为 waiting，两段快照与当前文本一致。隔离窗口已回收，未启动 Queue、Strata 或 ComfyUI。

- **Continuum 3.10.3（2026-11-21）**：设置和一键安装推荐固定到官方 stable `12bf61efe8e30a7a021d31689e741c9a3bad9337`。自研 JointAV schema 1、官方尾状态、V38 接口和 Run 守卫通过 14 项 CPU 兼容检查。上游 Spectrum 签名源码相同，仍按清单的实际复用资格检查。正式 ComfyUI 保持 3.10.2，本次无正式数据重导、入队或 GPU 采样。[官方发布说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.10.3)

- **两步长视频写作**：「分配情节」一次返回各段简纲并注明新增情节，保留故事原文和编辑版本。各段有内容即可采用当前稿入队，包括锁定段落和大纲。「整片扩写」可按所选 H3 预设采用用户修改后的分配，影视细节使用共享的时长和稿长指导。没有分段稿时保留原「自动规划并扩写」入口。整片编辑和 History 采用 `---` 分隔，History 显示实际采样文本及快照保存的版本。
- **两步真实出稿验收**：新隔离 10 秒/2×5 秒不同故事，真实拖首帧、键盘输入、鼠标「分配情节」后大纲入队被拦，手改第 1 段左手提包，鼠标「整片扩写」后生成 1051／1732 字符，两段保留同一纸袋及交接，最后按钮入队 `fb964170-98cb-4d4e-a907-bdc52883839e`，状态 waiting 且快照含分配、手改和扩写稿。实际出稿暴露第 1 段缺音频字段、第 2 段延用整片时间，之后去除详情请求的绝对段坐标，补上字段/本地计时检查与单次定向修正。新纠正以复现两类失配的单元测试覆盖；以上实稿来自纠正启用前。隔离 Strata 与 Electron 已回收，正式库未写入，未运行视频采样。
- **两步写作最终验收**：最新完整 verify 通过（343 文件 3331 单元、7 文件 132 集成、双端构建和 440 对比度）。隔离 History 用真实鼠标打开原 60 秒作品，页面文本精确等于冻结的六段，中间五个 `---`，1280/480 宽度的提示词面板均无横向溢出。新快照版本回看有定向 DOM 回归。相关两个 Electron、Strata、CDP 与 Comfy 端口确认无残留。

- **60 秒作品的 AV 误报**：真实 AppApi 回读复现「artifact 状态记录格式无效」。正式 Run 的 `ec25eed2666d97e1` 为 complete，六份 safetensors 均有 audio/video 张量，文件大小和 SHA-256 全匹配。Continuum 3.10.2 按段写 Run Storage，Finalize 从解码结果组装媒体。应用过去将分组历史送入独立 JointAV 状态，归一化又漏收 `disabled`，于是报无效。现按官方收据校验清单/文件并在 History 展示，旧记录直接生效。该 Run 的 `resume_safe=false` 是真实 Spectrum 源码签名限制，继续按钮告知原因且不写入续写草稿；独立 JointAV 导出另有格式，已完成采样与历史文件无需重导。
- **AV 修复验收**：`npm.cmd run verify` 退出 0，343 文件 3328 单元、7 文件 132 集成、双端 typechecked build、440 对比度通过。新服务只读验证正式 History 原收据及六段，通过实际隔离 Electron 鼠标打开同一测试素材的 History 面板，显示已验证可用、七个文件定位入口、续接限制。点击继续保留原草稿及队列。隔离 Electron 664664/CDP13631 已回收，Comfy18329 未启动；原正式 Electron 661100/CDP9675 保持运行旧构建。本轮无重导、入队、GPU 采样或正式库写入。

- **接手后进展**：复用正式 History 播放报告、原六段模型读回及 18 张成片抽帧。模型把原车溜向车道改为第二辆车逼近，第 5 段并行处理扶车和捞包；在写作库补首帧动作过渡、同一车辆/道具身份、可见救险因果和交接。正式草稿、成片和旧模型稿均沿用原结果，新提示词的实际输出质量待单独验证。Strata 提示词会话现从 Settings 读取 0.5／0.75／1 GiB 作为低显存告警阈值，告警不终止会话，应用不据此调整缓存或无进度计时。7 文件 121 项定向回归及双端 typecheck 通过。真实 Electron 661100/9675 仍在，138 条视频、6 个 waiting、Queue 停止、Prompt idle/model unloaded、Comfy 离线；本轮无重导、重采样或窗口重启。
- **已交付并写进真实库**：作品「桥下误会与和解｜60秒短剧测试」，task/asset/version同ID `ef292588-fcfe-4b6b-b6f6-68aac2a41a38`；真实历史137→138条。真实草稿已替换同图同六段模型稿、60秒6×10秒、全自动，UI逐页读回精确一致。原137条历史、6个waiting任务、设置、图片草稿、续写草稿均保留；替换前配置及完整状态已备份。
- **官方路径与根因**：新生成采用Full Run，一次提交六段；Continuum3.10.2＋Spectrum0.2.30 balanced＋Sage Triton，保持Spectrum。此前失败是应用固定Review Each Chunk并要求每组resume_safe=true，把官方“不可跨Queue复用”扩大成新生成发布门槛。新完整成片允许真实resume_safe=false，绝不改写官方合同；旧冻结Review执行、已有Run续接仍守真实复用资格。
- **真实成片**：单次prompt `7ad9cedd-6c31-4ea7-ab6c-10c14ae1d7fb`，Run `lvs_ef292588-fcfe-4b6b-b6f6-68aac2a41a38`，revision `ec25eed2666d97e1`；6/6新采样、0复用，20分33秒，864×480/24fps/1440帧，60秒完整音轨/全解码/SHA校验通过。媒体、完整Run和原journal证据已复制到正式目录，历史不再引用临时媒体。正式History实播及返回通过，未再采样。
- **质量边界**：18张抽帧看得到冲突、摩托介入、黄色包及和解，有事件推进；出现额外女性、人物身份漂移、摩托动作跳变、狗末尾外观漂移，救险因果不够清楚。音轨非静音不等于对白/口型通过，尚未做听觉验收。模型稿未人工改写；第一批声音字段仅从同一已完成模型响应由编译器恢复。
- **已完成验证**：最后生产代码完整verify退出0：343文件3324单元＋7文件132集成、干净双端typechecked build、440对比度；Python9收据＋15守卫通过。随后只有正式数据导入与文档更新，无生产代码变化。Full Run最后的逐段进度回调/汇总与静默计算超时修复只做定向及全量回归，未重跑第二次GPU验证；本次真实图在最后进度修复前冻结。
- **当前窗口/资源**：真实默认profile Electron PID661100、CDP9675留在Create整片视图供用户观察；本次交接时进程仍存在，重接必须重新探测PID/端口、Queue/Prompt/runtime状态。6个waiting不是本次新任务，禁止startQueue一次跑全部。隔离Electron44708/CDP4327、Comfy18329、Strata43137此前已回收；没有获准关闭用户其他应用。当前无本任务继续运行的GPU工作。
- **工作区**：大量未提交改动混合长视频、本轮Strata升级、History/NAS等独立任务；先git status及目标diff，不reset/stash/覆盖。当前包0.69.0，未提交/推送/打包/发Release，新增子agent为0。导入已完成，**不要重跑**`temp/import-real-story.mjs`或重放任何旧入队脚本来“恢复进度”。

建议接下来的顺序（先与用户当前反馈衔接，不自动开始新采样）：

1. 下一次独立质量试验先审新模型稿，核对骑手落轮过渡、同一辆车、活跃角色数、救险前后状态及黄色包交接，再决定是否采样。听觉及口型尚待验收。
2. Settings → Strata 提示词会话已完成显存告警接线与定向验证。下一次正常运行可从告警/恢复日志核对实际余量；ComfyUI Queue 看门狗和独立 Agent 属于各自的监测路线。
3. 需要验证新进度时先复用静态/现有日志；确需GPU时单独说明新测试输入，不能为补证据重放已成功成片。未知提交先查原prompt/journal，不盲目重算。
4. 后续旧已有Run Extend仍有一次真实采样后因应用跨计划owner/file-SHA保护过严而拒收的问题，见`evidence/p2-existing-run.md`及阶段记录；官方跨计划导入会重封装前缀，需来源/逐tensor证据，不能直接放开同计划保护、伪造resume_safe或重采已完成组。原120秒案例亦未完成。

接手定位：

- 研究、官方/社区链接、模型过程及成片质量：[story-prompt-research](evidence/story-prompt-research.md)。官方新生成/复用范围和Full Run依据已列，不要再次推断“Continuum不支持Spectrum0.2.30”。
- 主要实现：`src/core/prompts/h3/continuum.ts`、`electron/services/long-video-prompt.ts`、`src/renderer/pages/create/generation-mode.ts`；Full Run在`src/core/long-video/{group-workflow,group-checkpoint,execution,run-source}.ts`、`electron/services/long-video-{queue,execution,continuum}.ts`及`comfy_nodes/LocalVideoStudio-H3/{group_receipt,managed_prefix_guard}.py`。资源修复位于Strata service/resources与core resource-policy，勿覆盖并行升级改动。
- 忽略的本机证据：`temp/real-history-story-import.json`（正式路径/备份/commit/逐文件hash）、`temp/real-story-history-playback.json`、`temp/real-story-draft-ui.json`及PNG、`temp/real-story-ui-launch.json`；最后全量`temp/full-run-final-verify.log`。正式备份在Data的`manual-backups/20261118-full-run-ef292588-fcfe-4b6b-b6f6-68aac2a41a38`，原执行证据在Data的`import-evidence/<taskId>`。
- 原始隔离fixture `temp/create-smoke-pm9q1h`保留：模型响应、`story-model-readback.json`、`story-audio-compiler-replay.json`、18帧/接触表及音轨指标在`story-full-run-review`。旧失败task `628e985a-a771-4427-b305-65d183623b44`保留，不改成成功；Spectrum0.2.29仅有调查源码副本，正式节点未降级。

## 阶段记录

- 类型：Task；Status: in_progress（P0/P1及P2 Create/Queue分页通过；Strata/QwenFlash单图一句方向→60秒Full Run→History播放已走通，短剧画面质量部分达标；旧120秒及已有Run Extend失败证据保留，不冒充完成）。
- Updated / Owner: 2026-11-18 / 当前 agent；Execution: direct，新增子 agent 0。
- 用户追加授权将本次结果写入真实历史并替换草稿，已完成：正式库137→138条，新增「桥下误会与和解｜60秒短剧测试」，仍用原task/version ID。媒体及完整Run复制到正式输出目录并逐文件SHA校验，manifest/latent原bytes及resume_safe=false保留；原journal另存导入证据，不伪造新执行。正式Data下保留原配置与完整hydrated-state备份；通过JsonStore/不可变库事务提交，新commit为f5b593b12c884f6a2d8006d5fcc99cc9e3cc0ea0f26f85bcd097c809f962e221。原137条历史、6个waiting任务、设置、图片及续写草稿均逐项核对不变。
- 真实默认profile已启动并留在Create整片视图供用户观察：全自动、60秒6×10秒、实际原图；全局与六段共7页逐页UI读回原模型文本精确一致。真实History卡片播放60秒/864×480/24fps，9帧解码推进及返回通过。最新真实Electron661100/CDP9675保持打开，未启动Queue/未新增GPU采样。忽略目录证据为real-history-story-import.json、real-story-history-playback.json、real-story-draft-ui.json；这是用户授权后的正式库写入，后文早期“正式库只读”仅描述当时测试边界。
- Full Run实测完成：真实鼠标入队任务 `ef292588-fcfe-4b6b-b6f6-68aac2a41a38`、官方prompt `7ad9cedd-6c31-4ea7-ab6c-10c14ae1d7fb`，同图同六段Qwen模型稿、60秒/20步/Sage Triton/Spectrum0.2.30 balanced。单次提交、6/6新采样、0复用，耗时20分33秒；manifest `ec25eed2666d97e1` complete、resume_safe=false照实保留。发布同ID单History/单版本；864×480/24fps/1440帧、32kHz音频1920000内容样本、完整解码/文件SHA校验通过，实际History播放12帧推进/返回通过。18帧抽查有事件发展及和解结局，但角色增加、摩托动作跳变、黑狗结尾外观漂移，不能宣称稳定短剧质量或台词清晰度通过。证据见[资料与实跑](evidence/story-prompt-research.md)。测试窗口和资源已回收，最终全量检查通过，未关闭用户应用、未改正式节点。
- 最终检查与清理：最新代码完整verify退出0，343文件3324单元+7文件132集成、干净双端typechecked build、440对比度通过；Python9收据+15守卫先前通过，之后Python未改。隔离Electron44708与CDP4327、Comfy18329、Strata43137均无进程/监听残留，视频及证据保留；正式Data/Library和节点未写入。没有重采样、没有打包发布或版本号变更。
- Full Run最后接线：保留官方show_preview回调，按重复采样步循环汇总整片进度；不把单段20/20当整片完成。静默但响应正常的Full Run不套20分钟活动时限，独立连接/后端错误和取消保留。此项不热改已运行图；本次真实视频来自原一次提交。新增进度2项及双端typecheck、最终全量通过；最后的进度修复未做第二次GPU采样验证。
- 以下为按时间倒序保留的阶段记录；其中“尚未完成/下一步”由上方最新结果取代，旧失败任务及不可复用身份不改写。
- 用户已明确授权“按官方的来”：新生成的冻结profile.executionMode=full_run，单次官方Full Run；旧snapshot无该字段仍Review，已有Run Extend保持可复用合同。整片收据允许真实resume_safe=false，但仅限匹配Full Run请求、0复用、所有计划段完成且完整音画投影；旧Review收据继续要求true，不改写manifest。6文件59项定向、双端typecheck、Python收据9项/前置守卫14项通过，新增Full Run守卫回归待执行；完整verify运行中。隔离3630/18329已通过AppApi停止并关闭；隔离数据目录已换回0.2.30物理副本及3个必需节点物理副本，0.2.29源码移到夹具外部子目录保留、正式节点未改。尚未新采样。
- 2026-11-18用户质疑后的复核：不能将当前故障概括为“Continuum不支持Spectrum0.2.30”。真实0.2.30采样已成功；官方README明确新生成可用，但跨Queue复用仅接受可观测匹配合同，审计范围含upstream0.2.29。逐文件复现：本机55源文件仅minimax_h3.py与PUBLIC_SOURCE_029不符（预期02e97ab…，实际8452e31…），干净HEAD7df883b与官方0.2.30发布一致。应用group编译器沿用managed模板，固定Review Each Chunk；自定义收据要求resume_safe=true，将官方的“不可复用”变成首组拒收。官方V3.9示例默认Full Run，官方review_control.py的Full Run分支不施加Review执行上限。因此执行策略接线也属于问题，不能归咎用户设置或把降级当默认修复。下一步应优先评估接入当前0.2.30的官方Full Run路径，保留Review/旧快照合同和真实恢复语义；尚未实现或实跑该路径，不声称60秒已完成。此前0.2.29隔离尝试保留证据、不推进正式降级。本轮只读诊断通道已恢复，未新增GPU采样。
- 最新阻塞与用户纠正：用户明确指出 GPU 告警阈值应复用 Settings，允许约0.5GiB才告警，且不得因此强制结束。此前2GiB强制中止是应用新增错误策略，已取消原生会话GPU余量强制中止；仍须核对现有Settings阈值到告警逻辑的接线，不能声称已验。隔离Spectrum0.2.29的55源文件已逐一匹配官方审计哈希，正式0.2.30未改；隔离Electron最新PID646024/CDP3630，Comfy18329最后核验ready/app、队列停止。新兼容Run尚未成功入队：节点目录junction未被扫描识别，实际按钮仍正常阻止缺依赖提交。拟停止隔离runtime后改为三个必需节点的物理副本，但该停止命令未执行：自动审批额度在07:15恢复前耗尽，工具明确要求不绕过审批；后续复制脚本亦未创建。最后一次核验无新采样，Strata已释放；隔离runtime尚未清理，不得声称退出。生产build已通过，Python前置失败诊断14项通过并同步bundle；首段latent及原失败Run保持。
- 最新实跑：第七次 Strata/QwenFlash（off 思考，仅隔离设置）已真实按钮完成规划及六段模型稿，整包采用并经六页鼠标读回。模型返回的前三段音景字段经生产编译器从同一已完成响应无损回放恢复，未重写故事、未声称新的模型调用。真实鼠标入队任务 `628e985a-a771-4427-b305-65d183623b44`，60秒/6×10秒/864×480/20步/Sage Triton/Spectrum balanced。首组20步实际完成，Spectrum 11次实际/9次预测、无fallback，661.477秒；但独立收据拒收，accepted仍0。官方manifest为v6、resume_safe=false，具体原因是Spectrum绑定 `unsupported provider source change`：本机干净Spectrum v0.2.30，Continuum 3.10.2仅审计旧provider集合。已保存首段latent及不可复用manifest，不修改旧Run身份、不盲重算；正在调查兼容方案。最终全量342文件3319单元+7文件132集成通过；完整构建收敛及60秒成片/质量验收仍未完成。后续下条早期运行进度以本条为准。
- 2026-11-18进行中：已查Continuum解析器、MiniMax/Comfy官方指南和社区Story writer，新增导演/规划/详稿库、跨批边界状态及跨renderer重挂载写回/取消恢复。真实历史137条/首帧36张，选桥下街区与一句误会→救险→和解方向，60秒6×10、480p/Spectrum开。自有fixture `temp/create-smoke-pm9q1h`，最新端口/PID以launch.json为准，Strata43137/Comfy18329；正式Data/Library只读。四次真实失败分别为应用固定20GiB预估门槛、2GiB GPU监测中止、600秒总时限、WMI/nvidia-smi短暂采样丢失；均没有后端OOM，已分别改为原生自适应缓存/会话WDDM预留、告警、可取消无固定总时限、监测恢复。第五次low思考实际存活超过10分钟，主动取消以改做直接写作，未保存半稿/重载模型。第六次off思考operation `b0d7317d-4fcf-40c2-b60d-f011c37f342a` 已由真实按钮触发，整片规划正常stop/1923输出tokens/思考0，当前写第1–3段；同一驻留Strata parent486260/native625320。尚未完整稿采用、入队或H3采样。完整3314单元+132集成及生产build/440对比度通过；其后监测恢复77项及UI读回4项/自动预算5项、双typecheck复核通过，最终全量待收敛。见[资料与实跑](evidence/story-prompt-research.md)。不关闭其他用户应用、不下载权重。
- 本轮交付（minor）：解除多段720p及禁止插帧的应用额外门槛；接入整片完成后的RIFE 2×/4×、实际FPS/帧数/音频时长校验和History发布，保留采样Run身份与旧profile。完整3167单元+127集成、双typecheck、独立干净生产构建/440对比度通过；末次摘要修正后36项旅程及双typecheck/前端构建再次通过。真实隔离Electron缺图恢复→鼠标入队得到1080p/RIFE任务，已安装节点四帧GPU 2×/4×通过，24节点整图在线schema通过。没有新H3采样，120秒仍0/12；不下载权重、不升版本、不打包。详见[分辨率及交付](evidence/delivery-options.md)。
- 2026-10-27完整 H3 配置接线（minor）：已复用共享LoRA栈/模型补丁/Turbo与PDD采样函数，新增可选profile.h3冻结LoRA及SOL/SLA、运行时、Compiler、Spectrum model-aware配置；四种attention均可构图，Compiler auto不再误禁managed Sage原始函数观测。修复History继续创作清空LoRA/覆盖运行时、普通草稿归一化丢失继承LoRA/步数，以及LoRA触发词与严格快照校验不一致。Queue逐页显示真实采样文本，已接受prefix不改；旧profile不写h3、保持旧图/身份。真实隔离120秒草稿采用已安装Realism People LoRA+Kitchen+SOL+Spectrum+native+Compiler auto，经缺图恢复/真实鼠标入队得到98e15ade-7345-406f-9f81-65a2d1733a47；未启动队列或采样。对现有8188只读GET object_info，18节点新图通过实际接口检查。正式state字节未变，29820/13955/18319隔离资源已清理；用户运行实例与8188未重启。最终验证与交付见[加速边界复核](evidence/acceleration-boundaries.md#完整接线完成记录)。
- 2026-10-27加速边界复核：用户指出入队过严，保存配置实际只因Sage Triton被白名单漏掉。已补UI/task/claim/graph/profile/恢复身份，保留Spectrum；定向23项、完整2696单元+91集成、双typecheck/独立生产构建/440对比度通过。新版完整隔离Electron经缺图→真实拖入→鼠标入队得到120秒Triton+Spectrum任务，未启动队列/GPU，正式state字节未变。官方指南/开放集成契约/Issue31及Core文档确认LoRA、稀疏和其他后端并非Continuum通用禁令；仍未接入的部分不能仅删除校验就假装应用设置已生效。见[加速边界复核](evidence/acceleration-boundaries.md)。后续优先复用H3共享LoRA/模型补丁/采样配方，取消一概限制；保留训练权重与真实复用契约。正式非CDP用户窗口未动，新执行代码需正常重启生效；隔离47100/1172/18319已清理。
- 2026-10-27导航最终方向（替代下条换行方案）：用户明确要求保持一行、左右窄箭头切段并滚动、无滚动条。已实现18px箭头，包含全局在内首尾禁用、整片视图/未确认布局禁用；绘制与ResizeObserver让选中页保持可见，键盘导航不滚动整页。真实隔离Electron在1440×900、1280×800、900×800以实际鼠标完整往返0→16→0，均单行、选中页完整可见、scrollbar none，箭头18px；未启动GPU。最终完整2688单元+91集成、双typecheck、独立renderer/web/electron生产构建与440对比度通过，证据`temp/long-arrows-*`。加载新renderer前确认Prompt/Queue空闲及编辑文字已保存，刷新后原草稿、6条队列、137条History、settings逐字段相同，正式9333窗口显示单行/双箭头/automatic并保留；隔离PID33316/CDP10969/18319清理，正式窗口不启动队列。
- 2026-10-27编辑器修复（patch，替代此前仅压缩全局用途下拉的方案）：用户明确要求撤掉后加控件、默认全自动，并修复末段被裁切。已移除全局用途选择及其专用样式/标签；新脚本默认automatic，现有assisted选择与sharedPreamble旧队列兼容不迁移。分段tablist改为自动换行，无新增按钮；真实隔离Electron在1440×900、1280×800、900×800均展示全局+16段，并以实际鼠标坐标点中16段。定向4文件19项、最终287文件2688单元+6文件91集成、双typecheck、独立目录干净renderer/web/electron生产构建及440对比度通过。日志/截图`temp/long-tabs-*`；未运行GPU。用户主窗口已关闭后，把完整验证构建复制到开发dist并正常重开主窗口（PID81468/CDP9333），实际显示automatic、12页及自动换行，无额外控件；草稿、6条队列、137条History和设置与重开前逐字段相同。隔离PID46332/CDP9645及18319已退出，正式窗口保留供用户观察，不启动队列。
- Scope / Authority: 用户授权继续PLAN并要求纠正偏离Continuum的设计，随后授权关闭Unreal且不保存，并重点验收一次真实历史单图→复杂故事增强→120秒整包渲染。保留旧managed/原生回退及正式用户Run/媒体；P0 H3 4/4、旧Create3/3不重开。已有Run Extend 1/1已采样但发布失败，不重采；新增120秒新Run一次授权，计划12×10秒，目前0/12采样。新增Strata规划/分批详稿调用属于本次120秒验收，不用历史Strata0/4冒充新结果。
- Baseline: 原始研究为2026-10-18 / `475722c2c231da2aa8782d66e6c03d22a5913809` / `0.66.0`；P0开始时package为0.66.4，已有Strata服务/提示词、测试及契约改动，全部保留，不归入本任务。
- 权威：当前 [Architecture](../../ARCHITECTURE_CONTRACT.md)、[UX](../../UX_CONTRACT.md)、[Workflow](../../WORKFLOW_CONTRACT.md)。下述方案是提案，尚未替代产品契约。

## Resume

- 2026-10-31 用户要求本轮全应用本地化先跳过尚未完工的长视频功能。长视频专属遗漏、英文校验语言传递及功能闭环后的三语言/长度验收移交本任务 [PLAN §10](PLAN.md#10-长视频功能闭环后的本地化验收)。此前已落地的外层规划/分批提示保留；未完成项不视为验收通过，也不触发本轮长视频实现、模型调用或采样。全应用本地化继续处理普通 Prompt、共享 Strata 和其他页面，记录见 [本地化 TASK](../2026-10-30-localization/TASK.md)。

- 2026-10-27用户纠正Spectrum：官方Continuum支持受审计Spectrum并有Review续接实证，先前将off验收条件做成产品硬限制属于适配错误。已修正新Run capability/claim/graph，复用现有Spectrum补丁，冻结可选spectrumMode；旧缺字段等价off，Continue继承，用户中途切换被profile mismatch拒绝。移除三语言“关闭Spectrum”门槛文字；不改用户当前草稿、6条队列、Settings或运行App。34项定向通过，首轮typecheck指出旧task可缺字段，按off兼容修正；全量287文件2686单元+6文件91集成、双端typecheck和440对比度通过。为了保留用户正在观察的dist，在全新temp目录做桌面/Web/Electron干净构建通过（未执行会清理dist的npm verify）。本轮不新增GPU、不重开采样预算；当前窗口仍是此前构建，未自动重载。后续120秒真实验收应尊重用户Spectrum选择，不再默认要求关闭；开启后的GPU/质量仍待验。

- 2026-10-27最新用户指令：先不结束VS Code，改为把测试放进实际草稿/队列以观察UI；停止继续关闭/强杀VS Code，也不启动GPU。已在正式用户库原5条waiting任务后追加唯一`UI观察-手写分段稿-120秒.mp4`，task `1c9b6197-e5b0-40ce-8ef9-63a5baca20c4`，12×10秒/360p/20步/PyTorch/INT8 ConvRot，脚本版本全部source=user，显式标注未经过Strata。因为正式全局配置为sage-triton（当前长视频门槛不支持），用现有纯工厂冻结观察任务的独立PyTorch profile后离线原子导入，**这不是正式UI增强/入队可达性证据**，没有改全局设置来刷新原5条快照。正式App原先未运行，先完整备份并以SHA并发检查后导入，再正常打开主用户库。真实AppApi核对原5条任务全部已有字段、设置、History137条不变，草稿12页/Queue14个浏览按钮通过，截图复核通过。主App PID28024/CDP9333故意保持打开，停在第6条观察卡，queueRunning=false，Comfy未启动。备份/观察报告在忽略temp的`long-video-formal-ui-before-20261027.json`与`long-video-formal-ui-preview.json`；不得清理用户正在看的实际App，后续只能在用户要求继续渲染时处理测试GPU阶段。

- 2026-10-27恢复：已收到用户“允许正常关闭VS Code”的明确授权，向当前核对窗口PID9116发送正常关闭请求（返回true），窗口仍存在，未强杀/丢弃未保存内容。当前VS Code GPU进程58544的Windows分配约8.7GiB，机器空闲显存约12.3GiB，仍不足Strata20GiB门槛；其他用户进程未动。桌面工具Cua与原生node_repl均因`helper_unknown_error: setup refresh had errors`无法启动，已询问用户在窗口正常退出或明确授权不保存强制结束，等待回答。测试fixture/模型均未重开，没有新增模型调用或采样。上轮自有PID74028及11592/18309/43127已复核无残留。补齐Prompt journey新P3路径/测试/验收登记，语法及app-harness 9项通过，其他逻辑保持上轮完整verify证据。

- 当前暂停于真实资源门槛：120秒fixture的唯一实际增强operation完成两份权重校验后，因需要20.0GiB空闲显存/实际18.9GiB拒绝加载，模型稿0/queue0/视频采样0/12。不是后台仍在生成；`story-prepare.json`为真实失败，attempt1/2为模型点击前的探针失败，全部保留。已向用户询问是否可正常关闭额外VS Code（Windows约2.8GiB显存分配）；关闭Unreal的授权不泛化到其他应用。没有换模型/降低门槛。故事/12页布局已保存，测试实例已请求AppApi关闭。见[P3/120秒证据](evidence/p3-story-120.md)。待用户资源选择后，复核无活动请求并保留失败报告后继续真实增强→审稿→enqueue→render，不重采旧Extend。下面“准备中”段为本次操作历史。

- 2026-10-26 120秒准备中：已从真实History引用的36张原图中选桥下涂鸦街区（蓝车/骑手/行人/狗，source asset 207d1be6-2bef-4d2b-b615-8ab9c04b051e），隔离复制原图，固定12×10秒、360p实际640×352、20步/PyTorch/INT8 ConvRot VAE，无LoRA/Spectrum/插帧。真实拖放/布局/故事输入→增强按钮已触发当前Strata IQ3_XXS；实例`temp/create-smoke-6s4Pbb`，PID74028，CDP11592，Comfy18309尚未启动，Strata43127当前准备/哈希模型，operation 22442806-86ac-4f84-9aea-6a404b14bc37。活动probe进程由本轮exec管理；`story-prepare.json`仍running（ok:false初始占位），不得重跑prepare。前两次探针在模型点击前停止，分别是已为off的禁用Spectrum控件与IPC保存时序，零模型调用；失败报告保留attempt1/2，未改门槛或放宽超时。
- P3窄路线已实现：可选结构化longVideo增强请求仍走现有string API/Strata owner，整片planner JSON→每批最多3页详稿→严格ID/数量/布局/锁定/旧响应检查→一次model版本采用；自动模式整包、半自动选中页，普通单段契约不改。按钮缺图/布局/Strata时禁用，输入/换图/锁定/布局变化拒绝过期采用。双进度沿现有Queue transient/IPC增量更新，复制/reset清本地组值，浏览不跟随采样跳页。79项定向通过；完整verify287文件2683单元、6文件91集成、干净typechecked build和440对比度通过。真实LLM内容/整包提交/120秒输出尚未完成，不能用静态成功代替。

- 2026-10-26用户新增重点验收：明确授权关闭Unreal且不保存；PID79344已按授权结束，显存降至约4.8GB，内存空闲约18GB。目标改为从真实视频History挑选元素丰富的单张原图，复杂故事意图→真实Strata增强→一次120秒新Run任务包→渲染/History播放与内容审查；这是新增一次120秒采样授权，不重开旧P0/Create预算。当前开始接P3规划/分批详稿，120秒尚未入队/采样。双进度字段/IPC接线在工作区，尚待测试，不可标完成。
- 2026-10-26已有Run Extend已采样1/1但被应用prefix owner保护拒收，未发布History。真实新head是5a9b5d1103606f99；原三份文件SHA不变，新封装逐tensor的dtype/shape/bytes SHA与原前缀完全一致。对照正式3.10.2 `run_storage.py::_compatible_plan_prefix`明确新计划导入会创建raw副本，故跨计划强制owner/文件SHA不变的假设过严；同计划保护不应放宽。保留失败任务、单次提交journal和20秒输出，不盲重采；后续需具备明确导入来源/逐tensor/契约证明的恢复。当前测试App已关闭，PID13640/CDP9570/18309均无残留。原有prepare/finish失败报告及`temp/long-video-extend-prefix-audit.json`保留；新120秒Run预先固定完整布局，不借此伪造旧Run成功。

- 2026-10-26 Queue分页：单卡只读浏览冻结整片、全局意图/共享约束和实际采用段prompt；Extend用Run偏移显示未来第4段，复制当前页，原生单prompt不改。真实隔离Electron逐页click/焦点/快照不变通过，1280/1440/960/480四尺寸截图及无溢出复核通过。全量284文件2675单元+91集成通过；构建发现首项可空类型错误，修复后36项定向、干净typechecked build、440对比度通过，未放宽断言。自有PID29828及8195/18309复核退出；没有启动Comfy，原waiting任务保留。GPU仍约98%/22GB，Extend仍0/1，双进度/活动取消修复未完成。详见[Queue证据](evidence/p2-queue.md)。

- 2026-10-26已有Run续接入口通过至真实入队：独立`LongVideoRunSource`绑定原profile/head，真实15秒源的manifest及3个prefix owner/bytes/SHA只读通过；首个续组POST前再检查。History Continue→Extend继承seed42/20步/PyTorch/INT8 ConvRot VAE→确认布局/补详稿→错误head拒收且queue0→恢复精确原bytes→实际按钮新task ID通过。新增5秒任务保留waiting，GPU 0/1；当前外部Unreal约98–99% GPU/22GB、空闲RAM约2.4GB，不启动Comfy。自有Electron/9574与18309、Python复核无残留。详见[已有Run证据](evidence/p2-existing-run.md)。完整verify284文件2673单元+91集成/build/440对比度；末次名称与Queue展示调整后2文件39项、typechecked build/440再次通过。没有声称20秒新增组已生成。

- 2026-10-26 P2真实Create闭环通过：隔离AppApi自有Comfy，480×480/20步/PyTorch无LoRA，3×5秒→15秒360帧；32kHz音轨480000内容样本、AAC padding256。首组接受后暂停、runtime停止；waiting组后cancel/reset保留同task/Run，恢复只采余下两组，请求prefix为0/1/2，最后reused2/generated1且full-prefix/final=true。Queue移出、单History单版本，实际播放解码帧推进和返回通过。P2已3/3，P0仍4/4；不得为补证据重跑。详见[Queue接线证据](evidence/p2-queue.md)。

- 2026-10-26本轮第一项继续：Create单首帧FL2VA INT8手写脚本已接实际enqueue→Queue lease→父执行→完整音画/hash校验→稳定ID History事务；静态依赖版本/在线schema分离，已开始Run冻结profile/seed，副本新Run，暂停停在组后。全局文字显式区分创作意图/每段共享约束，遵循本地3.10.2 `v2/prompts.py`，分页不等于切镜。真实Electron键盘/拖放/按钮task ID、草稿隔离和真实重启通过。初期GPU被外部Unreal占用，待其空闲后才运行上述三组。完整verify为282文件2662单元+91集成、build及440对比度通过。已有Run新增段入口、AV登记、Queue分页/双进度、活动采样取消后的安全修复仍待实现；第一项/P2保持未完成。

- 2026-10-26父执行增量：冻结new-Run脚本/采用prompt/profile与稳定task/execution身份；不可覆盖的带hash链事件日志记录prepared→POST意图→prompt ID→accepted→validated→published。复用既有传输，提交前await意图持久化；未知提交停止，同prompt恢复等待，逐组核对prefix owner/hash，current-group完成不能冒充全片。固定发布身份用于幂等端口重试。详见[父执行证据](evidence/p2-parent-engine.md)。此为内部服务/真实临时文件/合成端口验证，未接现有Queue lease/recovery、真实媒体/History、已有Run父执行或UI按钮；不宣称真实多段提交或成片发布通过。

- 2026-10-26 P2编辑器增量：现有布局/分页/整片/锁定/版本控件接P1结构；逐字保存缓冲，失焦/切页形成版本，确认后改布局，尾页归档恢复。首次带入意图，恢复只读独立Draft，取消共享DOM缓存；Create/Extend和清空隔离。真实Electron输入/IPC保存/原生click→taskId及关闭重启恢复通过，四尺寸截图复核；多段增强/入队仍禁用，原生duration/prompt不改。见[P2证据](evidence/p2-editor.md)。本增量不等于完整P2或长片提交可用。

- 2026-10-26继续：P1新增共享布局与脚本内核、可选`Draft.longVideoScript`，不改旧duration/prompt/Queue。稳定ID显式映射、归档页、逐页版本、整包revision、锁定/失效/用户复核、整片原文缓冲与冻结组合均有定向检查；真实JsonStore重启覆盖旧/新草稿。普通组帧投影复核官方累计算法及Python半帧取整，预计帧与实际输出严格分开。见[P1证据](evidence/p1-script-kernel.md)。生成方式的catalog/依赖/schema能力投影以及编辑器UI仍待P2接线，不宣称P1产品交互已经完成。

- 2026-10-26执行：用户升级后的正式Continuum已核实为干净3.10.2 / `308653cff108061a94381cef446fef985384b214`，Core0.42.0。独立GroupReceipt、冻结请求校验、不可覆盖检查点和new-run/next-group内部服务已实现；应用H3包新增能力版本0.4.0，旧AV schema/producer及managed收据不改。证据见[分组执行](evidence/p0-group-execution.md)。此前版本推荐评估保留在[历史记录](evidence/continuum-3.10.2.md)。
- UI现状：现有段数/整片/锁定UI已接结构化持久化；窄路线Create已实跑，已完成group Run可从History进入Extend并实际入队，但新增组GPU待验。Strata增强未接。共同段长、累计16段、物理组与逻辑页分离；独立AV导出控件在分组模式隐藏，不冒充保存AV，必需Run Storage仍保留。原生30秒与旧Extend回退保留。
- 已明确交互：沿用Create图生视频/Extend；时间与运动移至LoRA前，H3生成方式分原生15.1秒/原生解锁30秒/Continuum多段，整包上限120秒；确认段数布局、逐页版本、一次提交、Queue单卡及History普通成片。原生30秒用户负反馈影响默认推荐，不撤销[独立工程交付](../../archive/h3-native-30s/TASK.md)。
- 本次补充：一个Run可含多个段prompt；分页是编辑视图而非执行要求。建议“整片/分段”共用一份结构化脚本，长稿按段编译，不把上万字反复交给每次采样；全自动/半自动负责写作方式，不等于逐段人工审批。
- 时长/身份：同Run共用段长、累计最多16段；约10秒目标是初始化启发式而非实测最优。原图持续参考不简单等同必须Ref2VA；当前Continuum Reference尚未接入，新生成角色采纳与跨Run移交需新增验证，不要求用户预制角色资料。
- 状态：旧managed accepted>0/head保护保持；独立new-run服务不借旧续写入口创建首段。Create UI、整包revision、逐页稳定ID、组后恢复与单History已接；分层修复、已有Run新增段、独占文件回收及完整History回流仍待实施。P0服务层成功不代替P2单独的UI/GPU/History证据。
- P0历史决定（2026-10-20）：实际Continuum为干净3.9.1，已具备当前物理组投影；当时保留此基线。2026-10-26更新推荐至3.10.2，但不以升级代替应用适配。正式new-run独立入口、预设完整布局；旧managed逐次续接与accepted>0/head保护保持不变。见[P0证据](evidence/research.md)。
- 已解除：独立分组receipt明确planned/accepted、物理组及输出scope，并实证计划3段仅完成2段。旧完整前缀收据保持严格；部分输出不标全片。末次Review完整解码/Finalize可生成10秒成片；中间组仅输出当前5秒，Finalize仍不是Run目录读取器。
- 下一步：本轮“放开限制”已交付开发dist，用户正常重启后可使用；不关闭VS Code。原120秒真实增强/渲染仍未完成，后续需在当前实际状态与资源上继续原授权单次Run，不能把手写草稿、入队或四帧RIFE冒烟算作120秒H3成功。旧Extend已1/1采样，不盲重采；P0 4/4、Create3/3不重开。

## Implementation and resources

- 2026-10-20变更限本任务文档及[managed回归断言](../../../tests/h3-continuum-managed.test.ts)。2026-10-26新增catalog推荐、版本断言、CPU兼容探针及相关契约/Unreleased更新；保留其他History预览等未提交工作，不升应用版本、不打包。
- 后续实施要按实际改动更新类型/迁移、Queue/History、工作流契约、用户旅程和 Unreleased；预计 minor 功能，尚未发生版本变更。
- 运行资源：独立data/custom_nodes与state/输出均在忽略temp；模型仅junction读取，正式节点/Run未改。两轮自有Electron及8199均经AppApi停止/关闭，5527/6769/8199监听与主PID复核已退出；保留测试Run/视频/检查点作为证据。此cleanup不证明原生窗口退出生命周期。

## Evidence / handoff

- 2026-10-26父执行器：最终`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（279文件2656单元、6文件91集成、干净typechecked build、440对比度）；此前4文件30项定向与双端typecheck通过，新增取消/日志损坏断言由完整verify覆盖。无超时/断言放宽，无GPU/运行时或UI操作；原有历史预览及加速评估工作保留。没有新增Queue类型/IPC/state schema，应用仍0.67.0，未打包/发布。边界与恢复证据见[父执行证据](evidence/p2-parent-engine.md)。

- 2026-10-26 P2编辑器：最终固定状态`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（277文件2640单元、6文件91集成、干净typechecked build、440对比度）。真实隔离Electron `probe-long-video-editor.mjs`通过首次意图/实际输入/IPC保存、原生按钮新task ID、多段禁用与重启同ID/文字/锁定/当前页；1280×800、1440×900、960×800、480×800截图复核。一次启动扫描等待超时先确认零task，再清空合成prompt恢复夹具重验；无盲重提/超时放宽。自有夹具均经现有AppApi清理，未启动Comfy/GPU；资源复核与限制见[P2证据](evidence/p2-editor.md)。

- 2026-10-26 P1内核：最终4文件27项定向、双端typecheck通过；完整`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（275文件2634单元、6文件91集成、干净typechecked build、440对比度）。末次整片缓冲保护定向重验通过。旧/新草稿真实JsonStore文件重启、ID/版本/锁定、原文保留与冻结快照均覆盖；14个本地链接、既有文件CRLF与scoped diff检查通过。无GPU/服务启动，无正式state/Run/媒体写入，应用版本仍0.67.0，未打包/发布。详情见[P1证据](evidence/p1-script-kernel.md)。

- 2026-10-26 P0执行：最终整合`VITEST_MAX_WORKERS=2 npm.cmd run verify`通过（272文件2617单元、6文件91集成、干净typechecked build、440对比度），Python8分组+13守卫+2attention通过；无超时/断言放宽。四次GPU采样及两次真实AppApi生命周期、实际AV/hash/帧/音轨/检查点证据见[分组执行](evidence/p0-group-execution.md)。27个本地链接及scoped diff检查通过，原有其他改动保留；应用仍0.67.0，内部节点包0.4.0，无打包/发布。
- 2026-10-26手动刷新跟进：确认“重新扫描全部”穿过实际按钮→coordinator→preload/IPC携带full与refreshReleaseVersions；补强版本缓存失效，旧在途请求不可被复用/回填缓存，旧finally不可清除新pending。真实DOM按钮回归、响应两种先后顺序及扫描调度共5文件33项通过，双端typecheck通过。未改用户窗口、安装或GPU。
- 2026-10-26提示修正：按用户截图将Continuum固定提交设为推荐策略，避免红色revision硬错误和重复更新；最新查询增加GitHub API、保留重定向回退，不长期缓存仅Registry/源码结果，Registry来源直接显示。真实查询返回3.10.2/GitHub Release，5文件63项及双端typecheck通过；详见同一[评估](evidence/continuum-3.10.2.md)。
- 2026-10-26：3.10.2固定源码与正式3.9.1各14项真实文件/CPU协议探针通过，CUDA未初始化；现有Python守卫11项、attention2项通过。5文件44项定向Vitest、集成6文件91项、干净typechecked build及440对比度检查通过。完整verify未全绿：首轮2582通过/11超时；4 worker复跑2589通过/4超时，均余于managed-software-cache；该文件单跑29通过/2超时。未修改超时或断言，未修无关缓存代码。新证据见[评估](evidence/continuum-3.10.2.md)。
- 2026-10-26收尾：本次既有文件CRLF保持、相关文档本地链接与scoped diff --check通过，无本任务意外删除。正式节点未更新、用户state/Run/媒体未写；探针临时AV已清理，候选源码/日志留忽略temp。未启动Electron/ComfyUI/GPU，无监听清理；实际升级后的在线schema与GPU/History续接仍未验。patch影响已入Unreleased，应用仍0.67.0，无打包/发布。
- 实际检查：初始 `git status --short` / `git diff --stat`、受影响当前 TS 与文档、`npm.cmd run harness:app -- list` / `guide extend`、官方源码/模型卡/社区作者仓库与 GitHub 固定 revision。
- 文档验收：2026-10-18，本任务3份文档及任务索引的本地链接/空白检查通过，`git diff --check`通过；索引仅新增1行，保持CRLF，无本任务意外删除。检查源码路径及命令一致性；并发Strata/History改动保留，不归入本任务交付。
- 2026-10-20：已按最新交互重排现有PLAN并补充研究来源，替代旧第四模式/P0-P4描述。3份文档47个本地链接、10张表及P0-P6/交互覆盖检查通过，scoped `git diff --check`通过；保持CRLF并复核最终差异。仅文档变更，不运行build/verify/GPU。
- P0检查：现行managed/comfy-ui基线70项通过；新增预设3/12段首组拒收断言定向通过；Run锁守卫11项通过；安装源码时间自检＋18个网格、6个投影、4个合成receipt场景通过；隔离Electron TS编译及双端typecheck通过。
- P0记录终检：3份文档52个本地链接、11张表、P0-P6标题/阻塞标注及编辑器诊断通过；4个触及文件保持CRLF，scoped diff --check通过。变更限文档与3行测试断言，无新增运行行为或版本变化。
- P0限制：所选Python缺pytest，上游pytest套件未运行，未擅自装包；改为直接执行实际纯函数/receipt方法，不计作完整上游套件通过。在线object_info、new-run真实输出、音画/恢复/零新增采样、Strata规划质量和120秒峰值均未验；按已发现的协议阻塞停止GPU实验，无全量verify/build或模型加载。
- 执行环境的普通沙箱进程中途出现 `helper_unknown_error: setup refresh had errors`；随后通过已批准的只读命令继续调查，未发生自动审批拒绝。
- 实际模型/effort、token usage：工具未提供可靠统计，unknown。
