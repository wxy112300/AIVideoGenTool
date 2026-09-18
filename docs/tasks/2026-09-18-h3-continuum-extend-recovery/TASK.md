# MiniMax H3 Continuum Extend recovery

类型：TASK
状态：active / phase-2-changes-requested
日期：2026-09-18
范围：legacy/managed Continuum workflow、AV artifact、queue/History、Create preflight 和 prompt Skill。
权威代码：当前工作树；上游运行时证据：本机 `ComfyUI-H3-Continuum` 3.8.2。

## 当前交接入口

按用户要求，后续采用手动串行交接：交接方写当前阶段工作包，用户另开 Luna session 实施并回填结果，交接方验收通过后才创建下一阶段。不自动派子 agent，不把旧“Phase 0–6”当作新四阶段的完成证明。

- 前置[latent可行性核查](HANDOFF_LATENT_FEASIBILITY.md)：accepted-with-scope。补交已验收，认可共享原始AV、分消费者合同；已校正证据编号和FL2VA Extend预检断言，不代表实际消费或所有变体已通过。
- 新[Phase 1](HANDOFF_PHASE_1.md)：accepted-with-scope，按2026-09-19用户明确决定结束返修交接并进入Phase 2。T1/T3已关闭，T2有界证据已接收；不是全部运行门禁通过，未验证项见下方结转表，不再反复派发已完成修复。
- **当前唯一可执行交接：[Phase 2第11节](HANDOFF_PHASE_2.md#phase-2-review-followup)，changes-requested**。原三例修复和普通删除/Continue重启证据已接收，但queue直接AV路径、引用索引扫描期间新增引用、部分unlink失败后假available仍可复现。只收口剩余安全与既定交互证据，不重复成功路径；GPU预算0，Phase 3未创建。

### 2026-09-19 用户授权旧队列执行前补齐

- 用户明确要求另一台电脑已有的全部保存队列自动用上新保存链，无需重新入队；本项替代此前“不自动升级、需另行授权”的结论，不改变 Phase 2 changes-requested 状态，不启动 Phase 3。
- [queue-execution-side-effects.ts](../../../electron/services/queue-execution-side-effects.ts)在原子`claimTask`中补齐：仅H3 generation/extension、无policy且无policy error、有效保存意图为all、无first-pass checkpoint/managed sequence的下一条waiting任务，写入`shared/all/true`后才进入执行。沿用旧缺省字段的all语义；prompt、seed、workflow、采样参数、来源与草稿不变。
- 跳过none、joint-av、motion-context、未知policy、已有shared、checkpoint、managed sequence、独立upscale和已运行任务。重试/复制不直接迁移，符合条件时在下一次认领补齐；不补造已完成视频的AV，不修复损坏的源AV，不宣称consumer routing或多轮音画质量已完成。
- 验证：执行器41项通过；队列/持久化/提交/收集/注册/工作流共8文件263项通过，覆盖逐项补齐、重复认领、暂停/取消、保存边界、实际图serializer helper及AV/History关联。最终`npm.cmd run verify`：179文件1542单测、6文件81集成、typecheck/build、contrast 20/20通过。编辑器原有两处测试fixture对QueueTask的VAE字段未收窄提示不属于本次新增，未改动。未修改真实用户state，未执行GPU、插件安装或服务启停；另一台电脑尚未实跑。

### 2026-09-19 Phase 2 二次复核与部署说明

- 通过：相关7文件105项测试；已有相对/绝对路径、Native upscale输入、目标解析期间新增引用三例已修。可见AV状态与范围已实现，普通隔离删除/Continue同userData重启结果已接收。
- 未通过：第11节三个R1反例仍会误删被引用AV或在部分删除后保留available；均以真实service/模拟unlink验证，实际媒体未删除。R2/R3仍需同版本异步竞争、文件区实际入镜和原定模式/fixture/交互证据，普通成功链不重做。
- **旧队列结论已由上方用户授权补齐取代。** [store.ts](../../../electron/store.ts)加载和[queue.ts](../../../src/core/queue.ts)复制/重试仍保留旧快照；符合条件的任务在认领时持久化shared，随后[application-runtime.ts](../../../electron/application-runtime.ts)执行共享asset注册。未认领或被排除的任务不变，未读取其他电脑state。
- **本地H3节点漏升版本已直接修复为0.3.5（patch）。** 源VERSION、TS/JS目录installRevision同步，新增源版本一致性、旧0.3.4离线提示更新、安装目标VERSION和collector当前版本断言。真实离线扫描已装0.3.4得到`installRevision=0.3.5/updateAvailable=true`；最终构建包VERSION=0.3.5且nodes.py哈希与源一致。本机已安装插件仍为0.3.4，未擅自安装或重启。
- 部署顺序：其他电脑先更新包含本次改动的应用，再在设置的节点与依赖中重新扫描并更新Local Video Studio H3 AV节点，完成后重启ComfyUI再开始生成。仅更新节点不会迁移旧queue保存策略；不改第三方Continuum/Motion版本。
- 最终`npm.cmd run verify`：179文件1521单测、6文件81集成、typecheck/build、contrast 20/20通过。首次全量检测发现collector旧版本硬编码，改为现有版本常量后窄测与最终全量均通过。没有新增GPU、服务启停或用户state写入。

### 2026-09-19 Luna首次返修报告（历史）

- R1：resolver-backed 最新 state 引用保护通过 22 项 History service tests；相对/绝对、queue Native upscale artifact、解析期间新增引用均 `unlink=0`。
- R2：AV 状态/原因/role/scope/context/storage 可见，inspection 局部刷新不重建播放器；bootstrap 文案改为 AV 兼容续写。
- R3：隔离 Electron 实际删除确认、missing 状态、Continue 来源、同 userData 重启恢复和 1280/1440/390 viewport 文件行 smoke 通过；证据见 `temp/phase2-r3-electron/result.json`。
- Phase 3/4 边界保持不变：无GPU生产、无consumer routing/正式入口、无质量/音画多轮验收。

### 2026-09-19 Phase 2 复核结果

- P1删除保护：相对引用与缓存绝对路径根不同、queue `h3NativeInput.artifact`遗漏、路径解析期间新增引用均已通过真实service/模拟unlink探针复现；三例均未阻止两次unlink，真实文件删除为0。不是只有测试缺失，必须修后端。
- P2展示与刷新：inspection结果仅写隐藏的`data-history-av-status`，缺失/损坏原因未显示；片段范围及“旧AV”文案仍未落实。检查完成调用整页render，需满足不重建播放元素/不抢焦点的原要求。
- Continue：保留现有 selected version -> source IDs/AV/sequence 传递，补充 JSON store reload 对 extension source 字段的断言；真实 renderer 点击/关闭重开仍待验证。
- 既有renderer证据：Luna回填的隔离C04普通History media cold/warm capture在`temp/phase2-c04-history-media/`，不包含AV fixture行、删除确认或Continue持久化交互，不能替代本阶段门禁。
- 交接方验证：相关7文件78项测试通过；修复后的最终`npm.cmd run verify`为178单测文件/1514项、6集成文件/81项、typecheck/build、contrast 20/20通过。通过的现有测试不能否定上述已复现反例。
- 新 Phase 3：消费者接通、正式入口与提交预检，未派发。
- 新 Phase 4：端到端验收收口，未派发。

### 2026-09-19 第二轮Extend少一帧修复

- 失败task `6c08e41b-db76-46dd-8c3b-680015e317db`，Comfy prompt `9fdf0823-063a-4d32-8c85-72a35d62f6bf`。source IDs正确指向首轮Extend版本；只读ffprobe确认源片698帧、新生成段336帧，失败位于应用最终拼接，不是新段缺帧。
- 源片video `start_time=0.031006`、duration=29.083333；旧`fps=24`滤镜在既定时长下输出697帧，先`setpts=PTS-STARTPTS`再fps则完整输出698帧。交接方按简单修复授权在[extension-media.ts](../../../electron/services/extension-media.ts)仅修Continuum最终拼接的时间戳归零，保留严格帧数校验，不改其他模型或采样预算。
- [prompt-extension-media.test.ts](../../../tests/prompt-extension-media.test.ts)增加真实FFmpeg两轮连续拼接回归，覆盖362+336=698、29.083333秒源片再加336=1034；缺FFmpeg/ffprobe时显式skip，本机实际执行通过。测试文件独立Node类型检查通过，完整verify结果见上。
- 用真实失败新段的副本调用修复服务得到1034帧；视频流43.083008秒、容器43.115000秒，不能混用容器时长与帧预算。校验副本在`temp/continuum-frame-review/repro-ELMQvl/reassembled-1034.mp4`；源片和原新段SHA256前后相同，未修改真实queue/History/AV，未重跑GPU，未自动恢复失败任务。
- 此patch已完成代码/CPU验证并重建dist，不再交给Luna重做；不代表音画接缝、指令遵循或所有多轮路径质量已验收。

### 当前接收范围与结转

| 事项 | 当前事实 | 后续归属 |
| --- | --- | --- |
| Phase 1保存/关联及局部预检 | 已有代码与回归证据；普通I2V真实文件/hash/History校验通过；bootstrap 14秒与managed 15秒预检修复通过81项测试及typecheck | 保留；Phase 2集成检查不得破坏，不重新开启Phase 1返修循环 |
| 用户首轮Extend | 见下节：执行记录成功，新段AV关联正确；用户反馈没有跳转或接缝 | 作为现有真实产物复用，不扩大成多轮/所有变体质量通过 |
| 保存select/icon真实交互 | 尚无完整多尺寸和交互验收证据 | 并入Phase 2触及Create/History的真实UI检查，保持保存/不保存下拉形态 |
| R2V/Motion及其他生产路径、1080二采 | 部分自动化/CPU证据存在，剩余真实生产证据未齐 | Phase 3相关消费者集成时补兼容检查；剩余生产/1080矩阵在Phase 4收口，不据此要求Phase 2先实现消费 |
| 保存关闭/失败/取消/重试/重启/旧版本隔离 | 尚无完整真实矩阵 | Phase 2先验证文件管理、所选版本和草稿持久化；生成侧多轮运行矩阵留Phase 4 |
| 连续Extend与官方同Run | 首轮兼容导入成功；第二轮336帧新段存在，应用少一帧拼接已在副本修复，不等于官方Run或多轮质量验收 | Phase 2准确交接最新段/版本，Phase 3消费与预检，Phase 4多轮音画/指令验收 |

上述结转是本次用户授权的阶段推进，不是补造通过记录。若后续发现丢AV、串版本或破坏原有路径，仍按实际缺陷就地修复，不借阶段划分推迟回归。

### 2026-09-19 用户首轮Extend及再次交接

- 用户报告首轮Extend已完成，没有出现跳转或接缝；这是用户对本轮成片的观察，不是交接方独立视觉验收。
- 只读状态证据：task `85ff4274-f580-4d56-ac71-5ce895f86a03`，History `2188a14d-c316-42b3-9258-31901529492a`，version `64eef449-7842-466c-bd6f-e09e018b2d41`，执行结果 `success`。来源为下方I2V版本，兼容导入workflow `minimax_h3_continuum_v38_extend_api.json`，累计视频记录29.083333秒。
- 本次新artifact `85ff4274-f580-4d56-ac71-5ce895f86a03_83845081-4d84-400a-8b27-4d10b1c273a5`：`available`、`shared`、`app-canonical`、`extend-segment-clean-av`、`extension-segment`、362帧、contextFrames=22。再次续写草稿正确指向本次History/version与新artifact，duration=14、mode=bootstrap；没有sequence/managed receipt。此项核对的是持久化记录，未重跑该新AV的完整磁盘hash或第二次生成。
- “旧AV兼容导入”目前按非managed路径统一显示，并非文件年龄判断；新Extend段也会出现，文案有歧义。Phase 2显示为准确的AV兼容来源和段范围，不伪造同Run状态，也不把新增段AV说成整条29秒成片AV。

## 历史复核记录

以下记录保留各轮当时结论。其“Phase 2未派发”“仅T2待完成”等状态已由本页当前交接入口取代，不再作为执行指令。

### 2026-09-19 阶段边界与379帧入队阻塞

- 当前只到Phase 1生产保存侧实测，不是完整“History继续创作 -> Continuum消费 -> 成片/指令效果”验收。交接方上一条“下一步可复用它验证续写”的指引过早；Phase 2/3未交付，不把未知消费者能力转嫁给用户盲试。Phase 1仍需守住原有可用路径的writer兼容，不以此提前承诺新的统一消费流程。
- 用户本次草稿为普通AV的 `bootstrap` 来源，保留managed工作流文件名及15秒。入队正确改用兼容导入图，计入上下文与H3时间网格后需要379帧，超过当前362帧预算；该路径最大新增时长14秒。AV检查位于帧预算检查之前，本次预算拒绝不推翻已通过的I2V保存证据，也没有产生新的GPU任务。
- 根因是页面 `extensionSafetyForDraft` 只按原workflow文件名计算安全上限，与入队来源路由不一致。交接方按简单修复授权直接复用 `h3ContinuumModeForSource` 和现有workflow转换函数，TS/JS同步；不改后端预算、普通AV/official Run边界、用户草稿或既有queue/history。
- 验证：`npx.cmd vitest run --config vite.config.ts tests/create-video-extension.test.ts tests/workflow.test.ts --reporter=dot`，2文件81项通过；`npm.cmd run typecheck`通过，编辑器无错误。新增3例覆盖bootstrap/AV路径配managed文件名、15秒拒绝/14秒预算通过、managed仍允许15秒及不修改草稿。
- 边界：14秒仅通过本次帧预算检查，不表示真实续写、接缝和指令遵循已通过。本轮未构建/重启正在使用的应用、未运行真实renderer或GPU，因此当前已打开的生产窗口不视为已加载此源码修复；Phase 2仍未派发。

### 2026-09-19 用户新I2V任务实物复核

- 结论：普通FL2VA I2V的真实生成、共享AV保存、manifest校验及History版本归属通过。用户于本地05:21完成；交接方只读复核，无新增GPU提交、服务启停或用户数据修改。
- 定位：task `c727d84c-bd03-4fad-93c9-500263fa9449`，History `4b697b78-ddaf-4869-b5e2-80dcc433b715`，version `4a7f8128-5b3a-4ee4-8d05-4c20c3ee70c8`，Comfy prompt `dab24c63-b3d9-4069-97b8-3a81bdd99249`。持久化执行结果 `success/completed=true`，workflow `minimax_h3_i2v_api.json`，保存意图 `all/true`，policy `shared`。
- 视频：`H3-480p-15s-20260919-051708-v01_00001_.mp4`，3,352,820 bytes；ffprobe实测864x480、24fps、362帧、15.083333秒，AAC 32kHz双声道。ffmpeg完整解码视频和音频退出0、无错误；不据此声明画面质量或指令遵循通过。
- AV：artifact `c727d84c-bd03-4fad-93c9-500263fa9449_58d5742f-4b3d-4e0c-9c85-75a5f1752809`，16,795,376 bytes，SHA-256 `e046d1c519d79d5d1a5f55705cabfb313443375c7d1f4c03c4b3039b82d4c9a1`。用应用现有 `NativeAvArtifactService.inspect` 和禁止写入的文件端口检查磁盘manifest、payload布局/几何/shape/dtype/完整hash，返回 `available`；role `final-clean-av`，contextFrames=0。History的两处asset引用相同，canonical owner/hash/bytes与artifact一致，producer sourceTaskId及lineageId均属于本次task。
- 实际图：History保留的Comfy执行图中，writer节点22为 `LocalVideoStudioH3SaveJointAV`，读取VRAM_Debug节点12的输出，来源为SamplerCustomAdvanced节点11的output 0；视频解码也读取节点12，音频解码经节点14读取同一来源。`outputs.22.h3_native_av` 唯一匹配本次canonical payload。在线history请求未连接成功，离线持久化图可用，无需重启服务。
- 验收边界：此证据覆盖一个真实普通I2V producer-to-History实例，不覆盖History继续创作到下一任务、Motion/Continuum实际消费、R2V/Extend、1080二采、保存关闭、失败/取消/重试/重启/旧版本隔离或renderer交互。T2由“全部未执行”更新为“部分通过”，Phase 1未整体accepted，Phase 2仍未派发。

### 2026-09-19 Phase 1二轮复核

- 状态：changes-requested。上轮两个保存反例已消除：managed task为all/true且普通draft保留none，旧部分保存草稿与1080预检一致。保存UI源码已恢复两项select；真实界面尚未验收。
- 本次8文件127项窄测试通过；复用最新verify日志的1500项单测、81项集成测试、typecheck/build及20组contrast。未重复全量build或启动GPU。
- store把未知policy删除后按旧协议继续加载，测试还断言这种降级；需要显式不可执行而非静默转换。Motion原有非法fixture尚未修正，CPU探针只覆盖F32读回及部分apply值，手填next_task_path不证明应用到下一任务的冻结链。
- 编辑器和独立磁盘读取均未看到Luna实际回填，与用户上下文的成功命令不一致。请核对同一工作区并回填实际证据；所需UI/真实产物验证缺记录仍为unknown。具体补测与已有证据位置已写入handoff末尾，Phase 2保持关闭。

### 2026-09-19 Phase 1二轮返修执行结果

- 当前 handoff 已回填为 `ready-for-review`，不是 accepted；Phase 2 仍未派发。
- 当前状态验证：focused 10 files/235 tests；`npm.cmd run verify` 为 177 unit files/1504 tests、6 integration files/81 tests、typecheck/build/contrast 20/20 通过。
- unknown `h3AvOutputPolicy` 会保留 `h3AvOutputPolicyError` 并阻止 queue/upscale 执行；History version 不再静默删除；旧无 policy task 仍保留原四档/reset/duplicate 语义。
- R5 CPU 证据：[result.json](../../../temp/h3-phase1-r5-motion-probe/result.json)；F32/BF16 app writer 与 Motion writer 均经真实 loader/apply，值、indices、trim 和 audio tail 一致；GPU submissions=0。
- 真实 renderer 截图/交互、真实生产 GPU、1080 second-pass、重试/取消/重启及旧版本串文件仍是 unknown/blocked，不由本轮自动化结果推导通过。

### 2026-09-19 T1-T3 最新复核结果

- T1已通过交接方复核并关闭：reset、duplicate和running恢复均保留失败状态/可见原因，源码与断言已核对；本次 `npx.cmd vitest run --config vite.config.ts tests/queue.test.ts tests/store.test.ts --reporter=dot`，2文件66项通过。
- T2部分通过：用户新跑的普通I2V生产保存至History已完成实物复核，见上方新任务证据；真实UI、下一任务/消费者、其他生产路径、1080二采及既定兼容检查仍未覆盖。queue.js与临时JSON store测试仍仅属于T1，不得将它们或单条I2V证据扩写成T2整体完成。
- T3已通过交接方复核：handoff第11节已落盘回填，当前handoff与TASK均为changes-requested；不再因空模板退回。T2需实际执行或具体阻塞证据，未派发Phase 2。
- 用户最新授权：简单、局部且可直接验证的缺陷，交接方可以顺手修复，不为小改动重复交接。本轮未发现新的生产代码缺陷，只修正文档对T2的错误归类；Phase 1未整体accepted。

### 2026-09-19 复制与 running 恢复补修结果

- duplicate：未知 policy 副本保持 `failed`，保留 `error`，运行时 queue.js 实测不可执行且不再是 waiting。
- running recovery：临时 JSON store 实测未知 policy 的 running generation task 恢复为 failed，policy error 保留。
- 验证：queue/store 66 项、running 定向 1 项、typecheck 通过；真实 UI/GPU/生产 retry-restart 继续保持 unknown/blocked。

### 2026-09-19 保存控件要求纠正

- 保留原有下拉选框设计，仅“保存 / 不保存”两项；不使用checkbox/toggle，不重排Create/Extend页面。整体保存说明放进可悬停、聚焦和点击的提示 icon；两个选项各自保留 tooltip/data-description。
- managed显示“保存”且禁用下拉，但提示icon仍可读取必需保存理由；切回普通模式恢复之前的选择。
- 交接方此前把二元选择写成“开关”，首轮验收也遗漏设计恢复要求。现已同步修订handoff正文、步骤、验证矩阵和R6；UI恢复属于当前Phase 1返修，不延后到Phase 2。本次仅改交接文档，生产UI尚未恢复。

### 2026-09-19 Phase 1首轮验收

- 复用了本地Phase 1 verify日志：1491项单测、81项集成测试、typecheck/build及20组contrast通过；交接方另跑3个窄测试文件47项通过。通过结果没有覆盖本次确认的生产分支，不据此accepted。
- 内存复现：managed草稿none仍生成none执行快照且控件未选；旧motion-context草稿会在factory生成all/1080p，但旧预检拒绝同一保存意图。无用户数据修改。
- 1080p内部upscale丢shared标记并被统一注册入口排除；普通可选registry错误未转换成latent失败状态；shared未禁止非规范descriptor走copy。具体位置、修复边界和最小测试写入handoff。
- 当前磁盘handoff执行回填仍为空，缺逐图/真实产物/UI/Motion替换证据。请补实际记录，未知项保留blocked；已有证据可复用，不重做无关调查。交接方本次仅更新验收文档，没有运行GPU或操作服务。

### 2026-09-19 latent feasibility review 回填

- 原始 AV 的 `video/audio` tensor 在 app Save/Load、Motion Save/Load 和 Core Separate/Concat 的限定范围内可无损保留或重建；Motion Context、legacy Continuum state、Native 二采和 managed Run 需要不同的外部输入/状态合同。
- 当前 unified adapter 仍是声明/路径选择层，不是真实 consumer 调用；真实 managed hardlink alias 可被 Motion loader 读取，但因缺少相邻 Native manifest 被 `LocalVideoStudioH3LoadJointAV` 拒绝，不能把 capability 字段当作接通证明。
- 普通 AV 不能凭空恢复 official managed Run；managed chunk 的 manifest、sampling contract、prompt/media hash、head/provenance 和 review state 必须保留。跨 revision 的 upstream plan import 物理复制限制仍存在。
- Luna报告环境/源码版本及CPU结果位于 `temp/h3-latent-feasibility-probe/REPORT.md`，可复核脚本为 `probe.py`，原始 JSON 为 `probe-result.json`，GPU提交数为0，`/object_info`因无运行服务保持unknown。脚本明确记录 Save/Load、Motion、Core wrapper、Continuum state、managed `_load_entry` 及真实 alias consumer 调用和断言范围。
- 交接方已接受有限结论并保留首轮历史意见：源码与探针产物hash核对一致；CPU round-trip的manifest是手工测试数据，不覆盖生产提交链。Native learned推理、本轮完整managed恢复、各变体clean语义和assembly尾端对应未验证，不据此新增capability。
- FL2VA Extend一概拒绝结论已校正：collector可写context=0，Native预检没有按segment role拒绝；这也不证明新段AV能代表累计成片。Phase 1保留现有Native边界，并在移除Motion writer之前证明旧路径可读取替代owner，不留消费者回归到下一阶段。

## 2026-09-19 用户确认的后续范围

以下是期望的统一使用流程，不是已有能力或共享latent可行性的证明。最新前置要求是先核查三类消费的真实合同：统一UI、资产关联与单份payload分开判断；若底层共享被反驳，重新设计数据保存方案，不强行适配。

- “保存 latent 数据”保留原下拉选框设计，仅保存/不保存两项，说明收进提示icon；覆盖所有 H3 视频创作：T2V、I2V/FL2VA、R2V，以及 I2V 和 R2V 的 Extend，不能只改 I2V 和 Continuum 页面。
- 使用应用自己的节点保存通用 AV payload 与必要 manifest，按消费者协议适配；修复 Motion Context Extend 的工作流未选择问题。latent upscale 优先级较低，后续接入，不作为本轮闭环前置条件。
- History 按所选输出版本关联视频、latent、manifest；底部保留大小/定位/删除，顶部辅助输出展示改为统一表达。共享文件删除必须检查引用。
- “继续创作”自动带齐该版本依赖并显示路径，草稿持久化；切换 Continuum、Motion Context 自动选择依赖，保留原 FL2VA 边界接续能力，不因切换清空来源。
- 旧数据不强制迁移；不能通用复用的旧 AV 保留 Continuum 兼容导入。新通用 AV 不能凭空冒充官方 Run，官方 managed 仍必须引用真实的 Run Storage/采样契约。
- Take 分支、全局跨 revision 去重和 latent upscale 不再绑进这一轮用户流程闭环。统一 adapter 当前尚未接入 Motion/Native 生产消费路径，不能写成仅缺测试。

### History 布局跟进

按用户截图建议，Continuum 的 Run、Chunk、Take、分支信息和“重抽本段 / 从此 Take 继续”移至播放器与标签下方、生成记录上方的独立区域。右侧保留视频概览、版本与主要操作，使用无嵌套卡片的字段布局，长标识换行，续写状态仅显示一次；不改变操作语义、运行就绪判断或持久化数据。变更级别为 patch。

- 验证：相关3个 Vitest 文件33项通过；`npm.cmd run verify` 通过1487项单元测试、81项集成测试、类型检查、生产构建和20组对比度检查。
- 真实生产 renderer 在1440×900、1280×800、900×900、390×844下确认区域位于主详情下方且不在侧栏，字段与按钮无溢出，主要操作保留；窄屏字段自动两列。Create、Queue、History、Settings 在两种桌面尺寸下正常加载且无横向溢出。截图保留于忽略目录。
- 隔离 fixture 初始化未通过，因此不将其作为验收证据；最终使用真实应用只读导航及布局检查，未生成新任务。验收结束仍为119条视频历史、3条队列且未启动；测试窗口正常关闭，临时网页服务及调试端口已清理。

### 测试历史恢复

按用户授权正常关闭应用、备份状态后，已追加10条 `Continuum Test` 历史：15/30/45秒完整链、两次45秒 Retry、旧 AV 的5秒新增段、早期5/10/15秒链和修复前的15秒首段。

- 前五条保留原 History/version 身份、sequence、receipt 和 AV asset 引用；视频时长以实际 ffprobe 为准。
- 旧 AV 测试只输出新增段，标题标注 `New segment only`，不是源视频与新增段的完整拼接。
- 早期四条原应用快照已被后续测试覆盖，从 MP4 内嵌工作流恢复真实参数并标记 `Preview only`，不伪造可续写的 sequence/receipt。原 Run Storage 仍留在磁盘。
- 视频历史109→119；原109条视频历史、8条图片历史、3条队列、设置和全部草稿经备份结构化比较保持不变。只引用原媒体，不重新采样、不复制/删除 latent；恢复脚本重复预演新增数为0。
- 备份保留在用户状态目录，恢复清单在本地忽略目录，不将用户状态或提示词加入仓库。
- 真实应用重读119条历史及10条测试记录，队列未启动；Retry 2 详情实测45秒、864×480、readyState=4且播放时间推进。验证后正常关闭临时调试实例，普通应用窗口已重新打开，调试端口已关闭；不据此宣称画面质量或指令遵循已验收。

## 当前结论

- 2026-09-19 续查已通过旧 AV 兼容导入、managed `1→2→3` 和重启后的两次 Retry；仍不能宣称整个 [PLAN.md](PLAN.md) 完成。以下最新证据覆盖后面的早期记录。
- 旧 AV 被 managed workflow 文件名误路由成 fresh Run 的错误已修复；文件引用中的缓存 `absolutePath/sizeBytes` 不再导致未变化的 payload 校验失败。原 payload 不迁移、不覆写，SHA/尺寸/模型仍必须匹配。
- Create 现在用只读 IPC 实查文件与所选版本，显示兼容导入或 managed 路径；紧凑文件行替代大块说明。没有 AV 时明确阻止 Continuum，不静默回退到普通接续。已有 managed 前缀只标为“文件存在、运行契约待验”，不伪装成质量/复用保证。
- managed 冻结最初首帧提取来源、base seed、旧 Chunk body 和 preamble；History 保存单段 body 而不是整份 Timeline，输出版本和 head 使用同一个 ID。首帧目前只保存路径/参数，并非文件内容冻结。
- 官方 Skill 规则进入各增强后端：只写当前 body、正确 `Continuation of Chunk N.`、保持用户动作/对白/镜头要求，允许明确请求的多镜头；移除机械追加的长连续性锁。未进行真实 LLM 输出验收。
- `Regenerate Current` 必须复用原 body，且 `Regenerate From=Auto(0)`。改正文或同时传手动边界均被真实上游拒绝；现已恢复原 body，并在 Create/入队前校验。
- 冷启动15秒第二段曾因 Sage 的多余 `torch.compiler.disable` 包装代码指纹改变而不复用。仅 public managed 且 Comfy Compiler disabled 时让 KJ 省略该包装；不启用 Compiler，不移除 Sage/Sparse/Spectrum。新冷启动三段及进程重启后两次 Retry 均通过。
- managed 内置上限与旧 AV 的14秒预算分离，允许已实测的15秒；最终组装 `exact_total_duration=true`，raw 网格净帧数不等于成片帧数，History 按最终目标时长记录。

### 最新真实证据

正常配置的 ComfyUI 3.8.2，commit `c38c616d54feb0310a3ca7540f2f4addc499fd1f`；由应用启动/重启，无临时根目录或 `NUMBA_DISABLE_JIT`。以下生成使用864×480、20 steps、Spectrum balanced；生成时诊断队列和 History 使用内存副本，未写入用户队列/历史。之后按用户请求恢复成功成片，见上方恢复记录。

| Gate | Run / prompt / revision | 结果与边界 |
| --- | --- | --- |
| 旧 AV 5秒导入 | prompt `4fb23101-610d-411e-94cd-bee54af08a83` | `initial_state_nonempty=true`、`masked_av_prefix_22_v1`、sampling transport verified、`fresh_fallback=false`，total/trim/net=141/22/119；输入16,795,376 bytes不变。只跑新段服务链，未重跑完整 legacy executor 拼接。 |
| managed 5秒×3 | `lvs-bce20baa-ce6`，revisions `bdbc598ed1a175c7` / `e71a84210a1dc0ac` / `0aa989c4238ccaac` | reused/generated=0/1、1/1、2/1；registry 与真实 History 函数接受。 |
| 修复前冷15秒 | `lvs-30181461-494`，第二次 prompt `bcc86596-3a5b-4da9-8e57-4e01ab069a11` | transformer attention wrapper code hash 不同，0 reused；receipt 正确拒绝把重新生成首段当追加。 |
| 修复后冷15秒×3 | `lvs-09c819cd-f55`，revisions `b37a60229bfe9024` / `24e2ec0f69c818db` / `b184474a345e625c` | reused/generated=0/1、1/1、2/1。raw net=[362,357,357]；最终 ffprobe=1080帧/24fps/45秒，音频45秒。 |
| 重启后 Retry 两次 | prompts `67487e6f-2497-4772-99a5-a883aceb74aa` / `cd95138a-3cff-459c-b2e4-6109b45cad92`；revisions `1147cd8065dacbe5` / `d1c25201ebfb04e2` | 均2 reused/1 generated，旧原文保留、nonce 由上游递增。 |
| 旧 Take 分支 | prompt `afa29e6b-dd92-4321-8292-7e908cacd90c` | 采样前拒绝：`group revision parent is missing: 1147cd8065dacbe5`。应用错误传 storage revision，当前明确在预检阻止，不伪造 group identity。 |
| 物理存储 | 三个15秒 revision 的首 Chunk | 同为16,795,272 bytes、各自 nlink=2，但文件实体 ID 不同。应用 alias 是 hardlink，上游 plan import 仍复制前缀；全局单份物理 payload 目标未达成。 |

UI 在1440×900、1280×800、900×900实查：紧凑 latent 行、状态、提交按钮无溢出；连接刷新后 prompt focus/selection 保留。播放保持检查未完成。45秒成片第15/30秒附近抽帧未见明显场景切换；音轨静音检测在接缝没有断口，仅编码末尾45.000–45.024秒有padding。未完成光流、听感或用户完整指令服从性验收。

### 当前阻塞与下一步

- **旧 Take/branch**：需要持久化并校验官方 group revision/branch provenance，而非以 app `take-<storage revision>` 代替。当前按钮进入明确阻止状态，旧 Take 与文件保留。普通 Continue/Retry 还会在入队时重新校验磁盘 canonical head，不能静默转到另一个 Take。
- **单份 AV**：必须解决上游 plan import 的物理复制，不能仅凭 app hardlink 宣称达标；本轮未改上游或删除/重写任何 payload。
- **预提交契约**：当前只覆盖文件、模型/尺寸、版本/head、Timeline/Retry。完整采样契约、引用内容变化、steps/LoRA/attention 等仍需冻结或可靠比对；不要把文件就绪当运行就绪。
- **生产入口**：首次 managed Run 的 UI 路径、缺失最初首帧证据的旧 sequence 兼容方案、FL2VA terminal physical grouping 仍需完成。诊断创建 fresh Run 不证明正式 UI 可以创建。
- **验收缺口**：Native/Motion 同 payload 真实消费、完整 legacy executor 拼接、真实增强后端、reference 失配的 GPU 前阻止、最终全流程 UX/播放及音画质量验收。

本轮属于 patch 修复，不做应用版本发布。任务保持 active；下一轮从上述契约缺口继续，不重复已经记录的成功采样。正常关闭前确认应用队列空闲，停止本次拥有的 ComfyUI，再关闭 Electron；保留诊断成片、旧 AV、官方 manifests 和用户历史。未 commit/push。

### 最终验证

- `npm.cmd run verify`（2026-09-19 01:07 本地时间）通过：175 unit files / 1487 tests、6 integration files / 81 tests、TypeScript、clean production build、bundled copy、20组 contrast。测试日志有既有 jsdom `window.scrollTo` 未实现提示，无失败测试。
- managed 测试文件单独 TypeScript 检查通过。早一次完整验证发现 `QueueService` 漏转发预检依赖，修正后重新执行上述完整门禁。
- 最终编译的 `HistoryArtifactService` 离线读取真实 Run Storage：当前 `d1c25201ebfb04e2` 可用；旧 Take 分支 invalid；旧 `1147cd8065dacbe5` head invalid。没有启动新采样或改写 manifest。
- 端口8188、9335已无 listener，本次 Electron 终端已退出。原 AV、旧历史与诊断输出均保留。

## 早期实施记录

以下为本轮续查之前的历史证据，过时的限制和结论以上文为准。

- 上游 `v3/runtime_coordinator.py` 在 `initial_state` 被拒绝或分辨率不匹配时会记录 note 后静默生成 fresh run。
- 旧任务的完成日志只证明 graph 完成，不能证明 external JointAV state 被采用；Spectrum 的 `state_conditioned_residual=False` 也不能作此证明。Luna 初版诊断也只是从 assembly plan 反推来源，仍可能把计划误当执行事实。
- 已确认 app facade 的 C3 MRO 会把 `initial_state` 注入上游 V3 runtime；当前不是 facade 输入完全悬空。新诊断进一步要求上游 Basic sampling report 出现与 resolved transport 对应的 Masked AV、Masked Video 或 Reference Context 执行标记，缺失时在保存与拼接前 fail closed。
- ComfyUI `/history` 会把 output node 返回的 `ui` 字段直接铺平到 `outputs[nodeId]`。Electron 原解析器只查嵌套 `ui`，因此会漏读真实诊断；现已优先解析铺平结构，并保留旧 fixture/client 的兼容 fallback。
- App-owned H3 AV 节点版本从 `0.3.2` 提升到 `0.3.3`，catalog revision 同步更新，避免运行中的旧 `0.3.2` 被误判为已经包含本轮诊断与 fail-closed 修复。
- 对现存五个 2026-09-16 Continuum 成片做了逐帧灰度差审计。已知旧双裁案例为 243 源帧 + 314 新帧 = 557 帧，恰少一个 22 帧上下文；较晚的 V3.8 输出不再双裁。另一个 579 源帧 + 336 新帧的递归续写成片只有 914 帧，证明最终 FFmpeg `-shortest` 会因 AAC 时间基少保留一帧。现在 Continuum 源段与新增段按显式帧预算编码、音频补齐，并在覆盖成片前校验总帧数。
- 同 artifact 的新 Standard/Compatibility GPU A/B 尚未完成，因此不修改 Standard 默认值，也不把静态或历史帧差冒充新版本主观连续性结论。
- 2026-09-18 的真实 managed 任务已实际跑完 GPU 采样并写入官方 Run Storage 的 revision/chunk payload；但 managed workflow 仍传入旧诊断值 `Full`，3.8.2 因此只返回 Basic Run Storage 行，receipt adapter 正确 fail-closed 为缺少 `Run Storage path`。现已将 managed workflow 改为上游 3.8.2 的 `Detailed Report`，并加入回归断言；该修复尚未重新通过真实 GPU gate。
- 随后的真实首 Chunk 已在 GPU 上生成并写入 Run Storage：官方 assembly plan 为 `14s → 345` 帧，物理 payload 的 H3 AV 网格也是 `345` 帧。应用此前却按统一的续写预算 `362` 帧验收，因而在 receipt 注册阶段误报“帧网格与本次 chunkSeconds 不一致”。registry 现按 receipt 的逐 Chunk `actual_assembly_total_frames` 校验，首 Chunk `345` 与后续 Chunk `362` 可分别验收；真实 345 帧 payload 的临时 hardlink/managed receipt 回放已通过。该回放验证了修复点，但不替代新的 GPU receipt 与接缝人工 Gate。
- 随后的同一 sequence 重试没有重新生成首个物理 group：官方 manifest 明确记录 `1 reused, 0 generated`，因此 receipt adapter 按“Review Each Chunk 本次必须且只能生成一个 physical group”正确拒绝。队列现会在首个 managed Chunk 尚未被 History 接受、但同 sequence 已有 failed/cancelled 任务时创建新的 Run identity；旧 Run Storage 保留，不会被冒充为 accepted chunk 或删除。
- 创建页现只显示当前路径和可操作状态：Managed 主路径、Legacy fallback、可继续、需新建 Run、已在队列、不可入队或待确认；已知模型/节点/ComfyUI 兼容性错误会在 GPU 前阻止入队。Continuum runtime profile 也显式检查 managed receipt/diagnostics 节点。
- 2026-09-18 通过一次 fresh Run 的真实 managed API/GPU 首 Chunk gate：project/run `lvs-f0a26a996083`、revision `4b02d0014f52252f`，官方 receipt 为 `requested_chunks=1`、`generated_count=1`、`reused_count=0`，`actual_assembly_total_frames=[345]`、`actual_assembly_trims=[0]`；physical chunk record 只有一个，payload `16,010,504` bytes，H3 AV 网格为 `(1,24,102,30,54)`。应用自己的 managed registry 重放接受该 receipt，生成 `continuum-run-chunk` manifest 和 hardlink alias，未再触发帧网格误报。该证据只关闭首 Chunk + receipt 注册门，不等同于跨 Chunk 接缝已验收。

## 受控诊断事实

诊断包含 input artifact 的 reference/path/hash/bytes/shape、Continuum state 的 source/capacity/tail shape/fingerprint、initial-state presence、selected source、requested/resolved transport、上游 sampling transport 执行证据、total/trim/net/context、state/output clip index、fresh fallback、实际 assembly trims，以及 Spectrum mode/model-aware mode。不会写入完整 prompt 或 latent。

## Phase 0–6 实施摘要

- Phase 0：完成 [SOURCE_CONTRACT_MATRIX.md](SOURCE_CONTRACT_MATRIX.md)，锁定本机 Continuum 3.8.2、Motion Context 0.6.2 README/源码事实，并保留 `/object_info` 未可用和上游文档版本冲突证据；managed workflow 与 legacy bridge 使用独立静态契约。
- Phase 1：新增版本化 `H3AvLatentAsset`、shape/dtype/finite/hash 校验、安全相对路径、canonical owner/alias、反向引用索引和非破坏性 GC dry-run。Run Storage owner 不会被 GC 删除。
- Phase 2：新增独立 `minimax_h3_continuum_v38_managed_extend_api.json`。它使用官方 public V3.8 sampler、`Save + Auto Resume`、`Review Each Chunk`、官方 Finalize/assembly、receipt adapter，且不连接 `initial_state`；managed executor 不进入 FFmpeg concat。
- Phase 3：队列、History、draft/task snapshot 保存 sequence/run/chunk/take/branch/head；但早期 Take ID 映射未满足官方 group revision，见当前阻塞。
- Phase 4：已有各消费 adapter 与 app hardlink alias；跨上游 revisions 的唯一物理 owner 未实现，见真实文件实体证据。
- Phase 5：inventory 读取 safetensors header，并流式计算整文件、video tensor、audio tensor digest，再与 manifest/引用核对；分类 `valid`、`duplicate-tensor`、`legacy-unverified`、`missing`、`corrupt`。不会把旧 JointAV/Motion Context 导入 official Run prefix，也不会移动原文件。
- Phase 6：清理策略当前只生成决策，不执行删除；被 History、queue、canonical head 或官方 Run Storage 引用的 owner/alias 一律保留，未选 Take 也需要显式授权后才能进入可删除候选。

## 静态、单元与集成验证

- `npm.cmd run verify`（2026-09-18）通过：unit `175` files / `1481` tests，integration `6` files / `81` tests，production Vite build、Electron typecheck、bundled node copy 和 UI contrast 全通过。
- 独立 `npm.cmd run typecheck` 通过；`python -m py_compile comfy_nodes/LocalVideoStudio-H3/nodes.py` 通过。
- Continuum/domain/workflow focused tests：`4` files / `90` tests；History/domain focused tests：`5` files / `19` tests；model-switch regression：`3` tests 通过。
- 已运行 `git diff --check`；未执行 commit、push、reset、clean 或删除历史/latent。

## 保留的约束

早期首 Chunk gate 使用临时目录和 `NUMBA_DISABLE_JIT=1`；最新续查已在普通配置冷启动通过，不再以该临时条件作为当前限制。完整验收仍按上文缺口及 [PLAN.md](PLAN.md) 执行。

用户已决定把 Continuum 官方 `Run Storage + Review Each Chunk` 提升为主要 Extend 路径，并要求生产时每个 H3 AV latent 只保留一份物理 payload，JointAV、Motion Context 与 Continuum 按各自官方消费协议读取该资产。外部 JointAV `initial_state` Bridge 保留为旧历史/非 Continuum 结果的兼容导入，不再作为默认 Continuum Extend。

本任务禁止凭节点名称、旧版本经验或“latent 看起来相同”推断用法。每一项生产/消费映射必须同时引用当前安装版本的上游 README、实际 Python/前端源码、运行中 `/object_info` schema 和真实 receipt/GPU 结果；任一层冲突即停止并记录证据，不得自行补全或静默 fallback。官方 Skill/LLM prompt 只约束提示词写法，不能替代 Continuum/Motion Context runtime 文档与源码。
