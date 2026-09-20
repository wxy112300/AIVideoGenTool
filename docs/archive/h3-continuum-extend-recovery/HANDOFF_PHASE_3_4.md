# Phase 3+4 Handoff: 消费接通与端到端验收

- 类型：HANDOFF / 合并实施与验收工作包
- 日期：2026-09-19
- 状态：completed / technical gates passed（2026-09-20）；代码、自动化、managed UI 可入队与连续两轮 Motion 技术门禁已完成。音频主观听感保留人工确认，不作为代码返修阻断；本 handoff 随 `0.63.1` patch 归档。
- 权威入口：[TASK.md](TASK.md)。前阶段：[Phase 2 最新复审](HANDOFF_PHASE_2.md#phase-2-final-review)；[Phase 1](HANDOFF_PHASE_1.md)与[有限可行性结论](HANDOFF_LATENT_FEASIBILITY.md)保持 accepted-with-scope，不重开整套调查。
- 执行者：用户另开的 Luna session，独立完成实施、验证与本文件回填；不自动派子 agent，不另建 Phase 3/4 TASK，不自行 accepted。
- 范围：Phase 2 尚未关闭的安全/交互项 + H3 Extend 消费、正式入口、提交预检 + 旧数据/重启/多轮音画与指令验收。不是只写计划或跑静态测试的任务。

## 1. 完成目标与保留项

用户从 History 选择准确版本并继续创作后，源视频及可用 AV/Run 进入独立、持久化 Extend 草稿；切 FL2VA、Motion、Continuum 不丢来源，提交前知道实际使用 latent、视频上下文、普通边界还是有效官方 Run。选择可用方案后能直接入队、真实生成、入史，再从新版本继续，且能证明接缝和新指令确实生效。

必须保留：

- FL2VA 普通边界续写、旧 JointAV 导入、旧 Motion latent 路径及旧 queue/History。默认表示预选，不表示删除其他路径。
- 保存控件保持现有位置/尺寸/布局的 select，只有“保存 / 不保存”两项，解释放相邻可访问 icon tooltip；不改 checkbox/toggle，不新增常驻说明卡片，不要求 option 单独 tooltip。managed 强制保存时 select 显示保存并禁用，icon仍可用；回普通模式恢复原偏好。
- 用户已授权的旧队列 claim-time 补齐：只有原 all 的适用 H3 waiting 任务补 shared/all/true，其他语义及 checkpoint/sequence 例外不变。不得再改成全库迁移或要求全部重排。
- 已入队快照不随草稿变化；source asset/version、AV identity/hash、sampling/seed/模型策略保持明确归属。不得按“最新文件”或“最后一条History”猜依赖。
- 普通 AV、新增段 AV、官方 Run chunk/完整 Run 是不同范围。普通 AV 不能伪造 official Run；新增段不是累计视频的全量 latent。
- 不改采样器、调度器、precision、attention、VAE、Spectrum、cache/offload策略来绕过错误。不升级第三方 Continuum/Motion，不修改已安装上游源码，不下载权重。
- 不拓展低优先级独立 latent upscale，不重写 Take/branch 协议，不承诺跨 revision 物理去重；保住现有 Native/1080 内部二采功能与产物身份。
- 不改真实用户state/队列/History来制造证据，不删除真实媒体/AV/Run；不commit/push、reset/clean/stash或覆盖别人的工作。版本按仓库发布责任统一管理，不能每阶段自行 bump。

## 2. 最小代码入口

先看当前 git status、相关 diff、TASK 当前摘要；只读当前正在修的行与邻近测试，不重扫历史计划。根规则、[验证分级](../../CHANGE_VERIFICATION.md)、[工作流合同](../../WORKFLOW_CONTRACT.md)、[UX合同](../../UX_CONTRACT.md)继续适用。运行阶段再用[真实 Electron runbook](../../AGENT_ELECTRON_API_RUNBOOK.md)。

| 决策/行为 | 当前锚点 | 具体检查 |
| --- | --- | --- |
| 删除与引用保护 | [history-destructive-service.ts](../../../electron/services/history-destructive-service.ts)、[history-delete.ts](../../../src/core/history-delete.ts) | A节反例；单AV、整版、整条History共用安全解析和引用规则 |
| History检查/展示 | [history coordinator](../../../src/renderer/pages/history/coordinator.ts)、[page.ts](../../../src/renderer/pages/history/page.ts)、[history-artifact-service.ts](../../../electron/services/history-artifact-service.ts) | 过期检查、部分失败后重新检查、真实可见状态 |
| Continue与模式恢复 | [history actions](../../../src/renderer/pages/history/actions.ts)、[create page-controller](../../../src/renderer/pages/create/page-controller.ts)、[create coordinator](../../../src/renderer/pages/create/coordinator.ts) | storedDraft分支已有bundled获取，但不一定回填空/错workflow；模型/模式异步切换不串来源 |
| 手选素材与AV | [video-extension-controller.ts](../../../src/renderer/pages/create/video-extension-controller.ts) | 自动来源与手选旧AV并存，换源/清除范围正确 |
| 来源合同与适配 | [h3-av-adapters.ts](../../../src/core/h3-av-adapters.ts)、[h3-av-asset.ts](../../../src/core/h3-av-asset.ts) | 当前adapter只是路径/协议视图，不是消费者已经读到AV的证据 |
| 实际入队决策 | [queue-enqueue.ts](../../../electron/queue-enqueue.ts) `enqueueExtension`、[queue-task-factory.ts](../../../src/core/queue-task-factory.ts) | 当前早期空workflow拒绝；Motion缺路径/非末端trim会丢latent输入，须与可见预检统一 |
| 真实图与提交 | [workflow.ts](../../../src/core/workflow.ts)、[comfy-ui.ts](../../../electron/services/comfy-ui.ts) | loader实际输入、Motion context/prefix、Continuum state/receipt、提交前复核 |
| 结果与再次续写 | [h3-native-av-collector.ts](../../../electron/services/h3-native-av-collector.ts)、[queue-executor.ts](../../../electron/queue-executor.ts)、[queue-history.ts](../../../electron/queue-history.ts) | 唯一新产物、正确scope/context及selected version归属 |
| 多轮最终拼接 | [extension-media.ts](../../../electron/services/extension-media.ts) | 保留Continuum setpts归零和精确帧校验；不放宽1034/1033错误 |

纯共享决策放现有core helper，文件检查留Electron service，沿用typed preload。不扩张composition root，不新增通用AssetManager/消费者框架或第二套草稿/路径目录。已有TS/JS对应文件只同步本次触及的文件，不能全库生成。

## A. 先关闭安全尾项

依据Phase 2第13节，已经通过的直接路径、引用扫描期间新增History、普通删除/Continue重启不重做实现，只保留回归。

1. **身份引用必须独立于路径存在。** queue有sequence assetId但无files、非活动Extend draft仅sequence assetId均必须阻止删除。history/queue/三份draft的引用收集和稳定签名覆盖相同字段；generation携带sequence也不能遗漏。路径解析根/settings变化必须使异步检查失效或重新检查。不得通过清空引用来让删除成功。
2. **所有AV清理入口一致。** 单AV、整版、整条History使用实际resolver解析辅助文件，不继续假设`settings.outputDirectory`就是Comfy output根；identity与path均判引用，保留managed owner/manifest只读规则及外部/穿越路径限制。核对`version.files`直接带Run文件时也不能绕过保护。删除前后涉及异步调用的状态变化要有明确处理，不只挪一次store.get。
3. **部分失败保留可恢复身份。** manifest删成、payload EACCES；manifest ENOENT、payload EACCES都不能留available。降级状态并保留安全artifact/剩余文件定位供真实inspection和再次处理，不把残留文件变成无引用孤儿；保持视频和其他版本不变。无文件被删除且完整性未知时不能伪报成功，错误应可见。
4. **inspection不能靠只接收available解决竞态。** 请求代次、选中版本/来源变化、删除完成后的旧结果要丢弃；但missing/invalid记录保留artifact后仍可重新检查。回调只更新摘要，不fallback整页render或`video.load()`。添加DOM身份、currentTime、焦点/选区及同版返回的行为断言。
5. **修正实际renderer翻译与证据。** Phase 2的1440和390截图显示`history.page.nativeAvContextFrames`，尽管locale源码已有词条。核对运行bundle、key/locale TS/JS和当前构建，不只补字符串匹配测试。三语不显示原始key；missing/segment/managed的状态/范围/owner/manifest准确显示。

A的最低回归：sequence-only queue/draft及扫描中新增此引用均unlink=0；上述两种部分失败非available且后续inspection实际读文件；整版/整条入口无绕过；正常删除仍成功；并发检查不重建播放器。沿用现有History service/coordinator/accessibility测试。A修复及窄测通过后继续B-F；不要停在“Phase 2修好请验收”。

## B. 入口、默认工作流与持久化草稿

- 修复 Motion 被选中后的内置Extend workflow选择：首次进入、History Continue、已有Extend草稿恢复、图生/续写模式切换、FL2VA/Motion/Continuum切换及重启都能取得当前模型适用的bundled图，不要求用户手挑JSON。针对已有storedDraft workflow为空或遗留为生成图的分支补行为测试。
- renderer显示、入队验证与factory应使用一致的模型/输入模式/来源路由决策；后端不能只信页面已经填好。合法显式自定义图保留；不兼容自定义图给出可操作原因，不能悄悄换成别的图。不要硬编码某台电脑的workflow绝对路径。
- 尊重`defaultExtensionModel`与独立图生默认值。本项不是把Motion强制设成唯一/全局默认模型；FL2VA始终可选。
- History Continue精确携带selected version的视频、source IDs、适用AV/sequence与元数据，进入持久化videoExtensionDraft。切消费者保留同一来源与仍适用的依赖，避免清空后一切换就永久丢失；不把不兼容依赖接进当前图。替换源视频或明确清除才按现有语义失效原依赖。
- 快速往返切换/异步bundled读取/旧检查返回不能覆盖新的模型和草稿；Enter提交、typing、undo、焦点、选区、拖放、播放器不能因无关检查或队列刷新中断。
- 空workflow、模式切换和来源丢失必须由真实点击/IPC/持久化测试确认，不以“手工patch draft后能提交”代替正常用户入口。

## C. 消费合同与提交前预检

沿用已有source inspection/typed结果，按消费者判断实际可执行性；必要时以兼容扩展补齐结果，不另建平行状态源。不兼容的persisted/IPC变更必须先列明，不能隐式迁移。

| 来源/目标 | 要实现或保留的行为 | 不允许的捷径 |
| --- | --- | --- |
| 已验证canonical AV -> Motion | 从selected version owner解析到真实Motion loader输入，保持video/audio、dtype、context尾部/索引和源几何；新段继续使用该段正确末端 | 只填capability/路径、仍读旧slot，或为了wrapper双写等价payload |
| 旧JointAV / 旧Motion文件 | 走相应真实loader和必要元数据验证；缺信息可明确拒绝或让用户主动选现有视频路径 | 猜model/role/时间范围，冒充新shared或Run |
| 普通有效AV -> Continuum | 保留兼容bootstrap并读取真实state；无意外fresh/图像普通接续fallback | 普通AV注册成managed sequence；静默改选FL2VA |
| 有效官方Run -> managed Continue/Retry | 选中版本、head、receipt、manifest、contract和所有前缀文件一致，正式调用官方续接链 | 用最后一个chunk或缓存path假造整个Run；偷偷改用最新的其他Take |
| managed chunk -> Motion | 只有证明assembly末端与该chunk上下文映射、模型/几何合同适用后才启用 | 因safetensors可读就直接赋能力；不知道时显示具体不支持/待验证并保留来源 |
| 无AV或无效AV -> FL2VA/视频上下文路径 | 保留用户主动选择的普通边界或Motion视频上下文路径；提交前明确显示实际路线与原因 | 宣称正在使用latent，实际执行时偷偷清空路径再读MP4 |
| 裁剪不在原视频末端 | 不复用不对应裁剪末端的尾部AV；预检显示不能复用的原因和可选视频/边界方案 | 只用旧AV末端接到任意trim位置，或无提示丢弃输入 |

具体门禁：

1. 创建页紧凑来源行显示AV是否存在、当前检查状态及实际续写路线。文件已验证、节点/schema就绪、图已构造、真实生成通过是不同级别。离线显示待runtime检查，不把文件在磁盘上等同可生成。
2. 消费者选择、来源/版本、trim、尺寸、路径或相关设置变化时重新预检；最旧请求不得覆盖最新结果。缺失、不兼容或会走视频/边界路径必须在提交前已可见；阻断原因在现有sticky submit bar，长解释在icon里。
3. 选择latent路线后，如果文件在检查与提交之间丢失/变化，后端重新核验并拒绝，不能继续当前`enqueueExtension`的隐式latent fallback。用户明确选择的视频上下文/普通边界仍允许，不把本需求变成禁止fallback的产品删减。
4. Motion要证明canonical owner进入真实`MiniMaxH3MotionContextLoadLatent`/`apply`，clip_index/context video/audio语义正确，且未重新编码MP4伪造latent。复用已有F32/BF16 CPU证据；数据或接线变化才补最小探针。
5. Continuum兼容路径保留bootstrap最大14秒、managed当前15秒的已验证预算规则，按实际来源而非残留workflow文件名计算；不自动改用户时长来通过，不减小预算校验或删帧掩盖错误。
6. 模型/VAE/geometry/fps/frame-grid/dtype/hash/scope/context/conditioning按实际consumer合同检查。不把“无损wrapper适配”扩大为跨模型或所有来源已支持；也不凭猜测禁掉既有可用路径。
7. 普通shared任务唯一AV writer，保存none不写可选AV但不删除输入依赖；managed按官方owner/manifest保存，hardlink/copy-fallback如实记录，不用别名个数宣称物理去重。旧all任务经claim补齐后的执行同样走新保存链。

## D. Managed正式操作与完成链

- 让已有可用managed Continue与Regenerate Current在当前生产UI中可达，状态与来源准确，不只在测试脚本中调API；深层Run/Chunk/Take信息留在播放器与标签下方，不挤回右侧主操作。
- 首次官方Run如需提供入口，必须走现有真实managed首次生产流程，明确这是新Run而非复用普通AV的历史Run；不能让普通AV的“继续创作”自动变成fresh Run。来源、首帧和合同必须来自真实选择及实际图。
- Continue冻结已接受prefix的prompt/body、seed、首帧来源与采样合同；只允许合法的下一段变化。Retry保留完整提示词hash及官方Auto(0)语义，不误用storage revision作group revision。
- 旧Take branch选择未接通的既有限制保留并给出原因，本次不以重写branch协议扩展范围。当前head检查不能静默替换用户选中的版本。
- 完成后task/output/History/version/receipt/asset身份一致；新兼容段标extension-segment而非累计成片AV；再次Continue获取刚选中的新段或Run，不能残留第一段路径。
- 失败/取消不可发布available artifact或错误新head；重试/重启恢复不能取另一个版本文件，不覆盖原产物。正常独立AV和managed Run的文件生命周期继续隔离。

## E. 验证矩阵与运行预算

### E1. 自动化与构建

按正在改的slice立即跑窄测，复用现有测试文件。主要包括History services/coordinator/accessibility/actions、create-video-extension/create-enqueue/create-save-control、workflow、queue-executor/queue/store、H3 collector/phase1-registration/managed/domain。用行为或真实函数断言，不堆源码字符串测试。

必须覆盖：四类Extend路线、旧/新AV、空/遗留workflow恢复、同版异步竞争、trim末端变化、missing/corrupt/schema不匹配、用户主动视频路线、所选旧版与新版隔离、保存all/none、旧queue补齐例外、失败/取消/重试/重启与1080 checkpoint。凡改共享输入，都覆盖所有受影响bundled图。Python修改使用适用fact-grounded skill和选定Comfy解释器验证，不以VS Code另一环境作证。

同一集成文件状态最后跑一次`npm.cmd run verify`；失败就地修复并重跑失效检查。verify涵盖全部测试、typecheck、clean build及contrast。协调dist使用权，不停其他人的进程；没有代码变化无需为父agent复审重复全量跑。新修改使先前证据失效时必须补跑对应检查。

### E2. 真实renderer与持久化

使用隔离userData/fixture媒体和当前构建Electron，按runbook走renderer -> preload -> IPC。允许API辅助读取证据，但以下动作必须真实交互：选择History版本、Continue、切模型/模式、保存select/icon、提交/错误提示、删除确认及被引用时拒绝。

- 1280x800、1440x900、390x844或当前首个窄屏断点：普通AV、新增Extend段、managed、缺失/损坏四类fixture；长文件名/manifest/owner/alias实际入镜，所有操作可达，保存select与icon的hover/focus/click可用。窄屏分段截图，不能用“DOM存在/容器顶部可见”宣称整区通过。
- 查看当前运行版本和资源，三语无原始翻译key；不要只截旧构建或旧fixture页面。沿用当前renderer设计，不重建原型或大改共享CSS。
- 播放中完成inspection、队列状态刷新、快速切回同版后播放器DOM身份及播放连续性保留；输入焦点/选区/undo不丢。测试缺summary时也不能重建播放器。
- Continue后在FL2VA/Motion/Continuum之间往返、切去图生再回来、关闭并用同一隔离userData重开；source IDs/video/AV/Run与原selected version一致，图生与续写草稿互不污染。
- 主导航History保持选中，返回/版本切换/继续创作可达；共享CSS如被改动，增加Create/Queue/History/Settings回归。

### E3. 真实生成、再次消费与质量

优先复用TASK中的普通I2V、首轮兼容Extend、1034帧CPU拼接、managed Continue/Retry及Motion CPU证据；只对来源、图或消费合同变化及尚缺闭环补运行。复用时写清具体task/version与证明范围，不把旧成功扩写成新代码/UI已验证。

| 场景 | 最低实际证据 |
| --- | --- |
| 新shared生产 -> Motion -> 再Continue | 至少一个真实R2V或尚缺的适用producer输出，通过History正式入口消费该canonical owner；新Motion段入史后再次使用其正确末端，记录输入owner/hash与新输出身份 |
| 旧AV兼容Continuum连续两轮 | 明确旧AV来源且有效，从正式入口入队；第二轮使用第一轮新段AV，真实transport/state无fresh fallback，精确最终帧数，源文件不变 |
| 有效managed Continue + Retry | 真实Run/receipt/head，Continue复用旧prefix；Retry不重写旧chunk prompt/seed，Auto(0)生效，版本与文件归属一致；受影响时补首次新Run入口 |
| 保存关闭与失败恢复 | 正常关闭保存的代表任务视频成功且无新可选AV、不误用旧available；失败/取消/重试/重启用隔离注入覆盖完整状态链，至少真实应用进程重启；不得制造真实用户任务失败 |
| 旧all等待队列 | 从隔离持久化旧快照启动，认领后shared落盘，最终真实AV/History关联；可以与上面一个producer任务共用，running/partial/checkpoint例外用回归覆盖 |
| Native/1080邻接 | 现有二采/checkpoint与输入不变回归；若缺实际生产证据或本次改变内部AV接线/元数据，则做现有受支持FL2VA无LoRA最短1080两prompt任务，保留derived身份，不新增独立upscale能力 |

每条消费闭环至少记录：输入History/version/asset及payload hash、来源范围和trim，选定consumer/workflow，应用taskId与Comfy promptId、实际图loader/state/transport，输出视频与AV/manifest/receipt，最终History归属，再次Continue草稿。直接`/prompt`节点实验只能作为补充，不能代替应用入队/History闭环。

质量单独判断：

- 用简单、中性的可观察新动作和明确终态，固定种子及选定策略；每轮开始前写下预期变化。至少两轮指令不同，确认新动作来自本轮prompt而非重播上一段。无需重写prompt增强器或所有预设。
- ffprobe记录video/audio start_time、duration、fps、精确帧数；完整解码无错误。累计MP4与新段raw AV的帧范围分别核对，不混用容器时长与视频帧预算。
- 对每处接缝抽取前后实际帧并播放检查：主体/机位/动作位置是否连续，有无跳回首帧、重复段、黑帧、冻结或瞬间跳切；记录时间点和帧序号，不仅看首尾缩略图。
- 对音频实际回放检查断裂、突变、静音和同步。codec存在、波形或RMS不等于听感通过；无实际听检能力时写待人工听检及确切片段，不宣称音画质量全通过。
- 区分执行/媒体完整性通过与主观质量通过。没有回退日志不等于画面必然连续；无法观察或未跑的来源保持unknown/blocked，不给虚构评分。

### E4. 有界资源与停止条件

- 本合并阶段允许必要的本地真实验证，不沿用Phase 2的GPU=0作为本阶段禁令。开始前回填运行计划，首轮最多12次实际Comfy prompt提交；包括1080内部两次、Retry、失败、取消，不能按一个产品task少记。每个同问题最多一次局部修复重试，累计硬上限16次。优先共享上表样本，不做全排列或重复既有15秒x3。
- 以现有可用480p及最短能证明目标的合法时长为主，质量用足够显示动作/接缝的短片；不通过随意降低steps或改runtime策略赌成功。1080只做其支持的最短代表路径。
- 单一重GPU阶段；先检查真实队列、GPU、监听和其他任务所有权。资源被占用不终止他人工作；完成独立代码/CPU/UI部分并写具体blocked，不能靠另起第二Comfy实例绕过。
- 环境来自应用所选core/data/Python。启动前核对H3 AV节点0.3.5或本次依法更新后的版本、实际`/object_info` schema和bundled图；只在已确认空闲且归本次测试的环境通过应用现有安装/生命周期流程部署自有节点。不得覆盖安装目录未知改动或改第三方节点来制造成功。
- 使用独有临时输出前缀、隔离state/media、明确loopback端口。已有真实文件仅只读；需要可变Run时使用完整隔离副本或本轮新Run，不重写真实head。删除/取消等破坏性实验只用fixture。
- 达到预算、重复同类失败、需要不兼容schema/产品语义改变、权重缺失或运行资源无法取得时停止该运行分支，保留失败证据并完成其他独立项。不能扩大范围、无限调参或把blocked改成passed。
- 结束清理本次启动的Electron/CDP、应用管理的本地Comfy进程与端口；通过应用自身停止路径，记录PID/端口归属，不碰remote或他人的服务。保留本轮结果与必要输出，不批量删除既有temp/媒体。

## F. 执行次序与交付

1. 读取当前摘要/差异，在A内复现并修好残余安全项，立即跑对应窄测。
2. 在B/C接通最小端到端路径，验证默认workflow、所选版本来源、提交前路线和真实loader图；再补D正式managed操作及限制。
3. 完成E1/E2的行为、隔离持久化和真实交互检查；不能因静态通过而跳过UI。
4. 按E3/E4列计划并执行缺失的真实闭环与多轮质量检查。实际失败就回到控制该行为的本地代码修复，不在出口堆特判。
5. 最终集成verify、作用差异/意外删除/TS-JS一致性、资源清理。更新必要合同和Unreleased，保留已有版本协调规则。
6. 回填下节及TASK当前摘要。全部完成后置ready-for-review；有真实阻塞则blocked并列准确未完成项。不要只完成B就交回，也不要另生成Phase 4交接。

## 7. Luna执行回填（必须逐项填写）

- 状态：**completed / technical gates passed（2026-09-20）**。三项复审代码缺陷及真实运行新增暴露的 R2V History 路由、JointAV 时间网格登记问题已修；连续两轮 Motion、managed UI 可入队证据及创建页依赖状态收尾已补。音频听感因当前执行者没有实际听音能力保留人工确认，不宣称主观音画质量已通过；本 handoff 随 `0.63.1` patch 归档。
- 实际变更文件/行为与保留路径：
	- A：History/版本/JointAV/Motion Context 删除统一使用 resolver；invalid/partial 状态保留 artifact/asset 身份；managed Run owner 只读；缺失 logical/output-root 路径仍参与引用保护。
	- B：空或旧内置 generation workflow 恢复为当前 bundled Extend workflow；显式 custom workflow 保留；保留 FL2VA、旧 JointAV、旧 Motion、bootstrap、managed sequence 和已有 queue/History 合同。
	- C：Motion Context v1 safetensors preflight 检查 schema、video/audio tensor、dtype、shape、完整 offsets、H3 时间网格、当前续写几何和 22 帧 context；renderer sticky enqueue 和最终 Electron enqueue 复用同一 source inspection。canonical app AV 通过 adapter 保留 owner identity、进入 Motion Continue Draft/queue snapshot，并接到现有 Motion loader path；旧单次证据见 `temp/phase3-real-motion/evidence.json`，新的连续链见 `temp/phase3-motion-chain/evidence.json`。
	- 未修改正常用户的 Local Video Studio userData、队列或 History，未下载/改写权重，未 commit/push；版本保持 `0.63.0`。按应用安装流程把本机 LocalVideoStudio-H3 从 0.3.4 更新为 0.3.5，旧目录备份在节点备份目录；真实验收新增了两份 MP4 与两份 canonical AV 到所选 Comfy output。
- A前置安全门禁：`tests/history-services.test.ts`、`tests/history-workspace-coordinator.test.ts` 等 History 相关反例已覆盖并通过；本轮交接记录的 focused 集合为 6 个文件/91 项测试。覆盖 resolver 外部 output root、sequence-only queue/draft/generation、missing/invalid/partial artifact、managed owner 只读、invalid artifact inspection 和迟到结果丢弃。部分删除后保留定位，正常删除路径仍通过。
- B/C/D消费者矩阵：
	- B 已验证：Motion bundled Extend、空/旧 workflow 恢复、mode switch、Continue draft 持久化、显式 custom workflow 保留。
	- C 已验证：无 latent 时明确走源视频上下文；selected latent 的缺失、非末端 trim、size/mtime 变化、schema/audio-video/geometry/time-grid 不匹配均可见并阻断最终 enqueue。
	- C：真实 Motion consumer 已跑通一个隔离 R2V producer-to-History 闭环；证据 `temp/phase3-real-motion/evidence.json` 记录 2 个 task/prompt 输出、canonical owner SHA-256、真实 loader node 7 (`clip_index=1`) 和 Motion node 8 (`context_length=22`/audio context=24)，以及 output MP4/AAC ffprobe。
	- C 已完成：手选/清除 latent 不再保留 stale typed asset，入队边界不会让旧 owner 覆盖显式路径；History 编辑恢复记录的输入 `h3MotionContextSourceAsset`；分辨率/比例参与预检 key。`temp/phase3-motion-chain/evidence.json` 记录隔离应用的两次真实 GPU 提交，第二轮经 History 正式入口消费第一轮新发布的 canonical owner，并再发布新的 canonical AV。
	- D UI 已完成可入队 smoke：`temp/phase3-managed-ui/result.json` 在 H3 AV node 0.3.5 下无节点 revision 阻断；补 prompt 后 enqueue enabled 并创建 managed waiting task。该 smoke 有意不启动额外 GPU，执行层复用既有 managed receipt/Continue/Retry 证据。
- E2真实UI/重启：普通 AV/删除/保存控件/同 userData 重启证据在 [temp/phase2-r3-electron/result.json](../../../temp/phase2-r3-electron/result.json)；managed 成功预检和 waiting task 在 `temp/phase3-managed-ui/result.json`；Motion History Continue 与第二轮实际 enqueue 在 `temp/phase3-motion-chain/evidence.json`。artifact inspection 缺 summary 时不整页 render 的行为有回归锁定。
	- GPU计划与实际账目：新 chain 共 2 次实际 Comfy prompt/GPU 提交。第一轮读取既有 canonical owner并发布 `h3av_b87be434-...`；第二轮的 enqueue asset、History selection、result source asset 全部精确指向该第一轮输出，随后发布 `h3av_c4b4eac1-...`。应用最终通过自身停止路径清理 ComfyUI 与 CDP。
- 输出与质量：两轮 MP4 均通过 ffprobe（864×480、24fps、H.264、32kHz stereo AAC），两份 7,377,128-byte canonical payload 的整文件 SHA-256 与登记值一致，header 为 video `1x24x47x30x54`、audio `1x32x2x263`、158 帧 H3 网格。第二轮 9.8s/10.2s 接缝抽帧未见黑帧、回首帧或瞬时跳切，后段保持稳定机位并出现新横向运动；对象语义命中度一般。未进行实际音频听检，必须由人工播放两个确切成片确认听感、突变和同步，不能宣称主观音画全通过。
- 命令与结果：
	- focused：canonical Motion source wiring 当前 focused 为 5 个文件/71 项测试通过，另有本轮前 6 个文件/91 项安全与 preflight focused 记录；typecheck 通过。
	- 当前返修验证：focused 回归通过；最终 `npm.cmd run verify` 为 179 unit files / 1575 tests、6 integration files / 81 tests、typecheck、clean build、contrast 20/20 全通过。
	- static/CPU/真实运行：stale asset、History source identity、R2V route、geometry preflight key 与实际 payload timeline 均有行为回归；真实连续消费和 managed 可入队已经补证。
- 临时资源与清理：新链使用 `temp/phase3-runtime-user-data-chain` 隔离 userData，证据、接缝帧和 contact sheet 保留在 `temp/phase3-motion-chain`；本轮结束关闭 Electron/CDP 与 app-owned ComfyUI，8188/9335 均无 listener。ComfyUI 0.35 的内置 Trellis/Numba 初始化在本机常规启动会卡住，本次先以 `NUMBA_DISABLE_JIT=1` 启动同一所选 core/data/Python，再由应用按其数据库/监听身份接管；这不改变 H3 图或采样策略，但属于环境限定，不能写成无条件普通冷启动。
- 剩余人工确认：播放 `H3-R2V-480p-5s-20260919-232150-v01_00001_.mp4` 与 `H3-R2V-480p-5s-20260919-232528-v01_00001_.mp4`，重点听 5.17s、10.17s 附近是否断裂、突变、静音或失步，并判断第二轮对象语义。该项不要求继续改代码；若人工听检发现确定缺陷，再以确切时间点新开针对性返修。

大日志、截图、tensor和临时探针保留在本任务独有的ignored temp目录；此处仅记录可复核的相对证据索引与关键事实，不提交机器绝对路径、用户prompt/媒体或权重。不建立重复TASK或第二份阶段状态表。
