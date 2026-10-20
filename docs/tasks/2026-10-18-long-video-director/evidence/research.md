# 长视频模式研究：当前能力、上限与可借鉴方案

- 类型：Research / source-and-code assessment；状态：research-complete，未执行本轮 runtime / quality 验证。
- 查询日期：2026-10-18（Asia/Singapore）；本地基线：`475722c2c231da2aa8782d66e6c03d22a5913809` / 0.66.0，已有非本任务 dirty changes。
- 适用范围：H3 Continuum 长片编排与当前 Strata/Qwen 接缝；采用建议见 [PLAN](../PLAN.md)，当前状态见 [TASK](../TASK.md)。本文件不替代 catalog 或安装清单。
- 2026-10-20补充见第6节；第1–5节保留原始研究快照，其中旧14/15秒应用上限、候选latest和独立长视频入口建议不再作为当前事实或交互决定。

## 1. 当前工具的真实接缝

| 领域 | 当前代码/证据 | 已确认与缺口 |
| --- | --- | --- |
| Create 入口 | [生产 page](../../../../src/renderer/pages/create/page.ts)、[CreationMode](../../../../src/renderer/contracts.ts) | image-to-video / video-extension / image-edit 三模式；Continuum 是 Extend model，catalog `inputModes:["video"]`。没有从图新建长片作品模式。 |
| 模型/上限 | [Continuum catalog](../../../../src/core/catalog/models/minimax_h3_continuum/definition.ts)、[workflow policy](../../../../src/core/workflow.ts) | catalog `maxDurationSeconds=14/maxGeneratedFrames=362`；managed graph policy 单独为15s。V3.8 bootstrap frame helper把上下文计入 H3 原始网格，不能简单把全片时长写进这个字段。 |
| 依赖基线 | [nodes catalog](../../../../src/core/catalog/dependencies/nodes.ts) | 当前推荐3.9.1，固定 `94eaf70d674a58244e1cb139f021290d63fb2e6c`；app AV节点0.3.6。采用V3.8兼容 Sampler/Finalize，并非已经接通V3.9 reference输入。此为仓库基线，本轮未读取实时安装或 `/object_info`，本机实际版本 unknown。 |
| managed 入队 | [queue enqueue](../../../../electron/queue-enqueue.ts)、[来源资格](../../../../electron/services/history-artifact-service.ts)、[Extend旅程](../../../runbooks/PRODUCT_JOURNEYS.md#extend) | UI继续必须真实accepted前缀；入队冻结sequence/head，target通常accepted+1，重抽为accepted。底层可构造空sequence不是正式新建入口证明。不能删除旧门禁来提供长片首段。 |
| 序列与receipt | [types](../../../../src/types.ts)、[receipt parser](../../../../src/core/h3-continuum-managed-receipt.ts) | 已有sequence/chunk/prompt/take/branch/head、sampling v6/hash/resume_safe与实际assembly数组，可复用；当前不是通用作品级DAG，receipt固定Review语义。 |
| 续接守卫 | [guard](../../../../comfy_nodes/LocalVideoStudio-H3/managed_prefix_guard.py)、[Comfy adapter](../../../../electron/services/comfy-ui.ts) | 官方Run锁下核对前缀/head，旧v5不能冒充v6；失败不能推断官方磁盘一定未变。长片恢复要延续该边界。 |
| Strata增强 | [prompt service](../../../../electron/services/strata-prompt.ts)、[Strata模型](../../../../src/core/catalog/models/strata.ts) | 当前是Qwen3.8-Flash-Next本地推理；32K上下文、每图1024视觉token、最多12图、自动输出预算；单图I2VA明确原稿+detailed路径才默认有界medium/2048思考，排除Extend/自动种子/修订。其他路径不是同样已验的复杂规划器。 |
| Strata证据范围 | [有界思考](../../2026-10-10-strata-prompt-integration/evidence/bounded-thinking-eval.md)、[最近资源结果](../../2026-10-10-strata-prompt-integration/evidence/h3-residency-real-retest.md)、[该任务摘要](../../2026-10-10-strata-prompt-integration/TASK.md) | 有真实15s复杂单/多镜头正文和时间点遗漏负例；最近仍有长资料、资源与稳定性未验项。不能宣称120s结构化规划或无人值守长批次已通过。旧停止范围不自动扩成永久禁令，但本轮研究无需GPU。 |
| Qwen Image 2.1 | [当前adapter](../../../../src/core/image-workflow/qwen-image-2-1.ts)、[capabilities](../../../../src/core/image-workflow/capabilities.ts) | 已有文生图/多图编辑编译，Picture到image token映射与独立图片任务；可被作品内部步骤复用。旧接入计划混有历史方案，以当前TS为实现基线。 |
| Queue/History | [task factory](../../../../src/core/queue-task-factory.ts)、[types](../../../../src/types.ts)、[架构](../../../ARCHITECTURE_CONTRACT.md) | immutable snapshot、视频History asset/version、owner/alias/registry已存在；当前QueueTask union无long-video类型，没有多模型子任务聚合成一个视频作品的完整协议。 |
| 拼接/后期 | [extension media](../../../../electron/services/extension-media.ts)、[工作流契约](../../../WORKFLOW_CONTRACT.md) | FFmpeg抽边界/源+续段拼接可复用；Continuum输出已处理其上下文，不再二次裁22帧。现有SeedVR2分段/checkpoint是后期资源设计参考，不等于长片生成orchestrator已经存在。 |

当前已有真实短链证据：用户旅程记载2026-10-08 managed 1→2、2→3与8s/12s成片，以及不兼容旧前缀写入前拒绝。首段为API fixture，不能宣称从首图UI新建Run已经可达。较早[归档任务](../../../archive/h3-long-video/2026-09-07-h3-long-video/TASK.md)的缺口/失败需按较晚证据限定，不能重复把早期失败写成当前全部未实现。

## 2. Continuum 上限核查

研究固定候选为 **v3.9.8 / `58fbd855feb13fa67a0613614df04e2b6fe808e2`**，GitHub latest Release返回2026-10-16发布。查询时main为 `7e14fde33f8e8fa5804fa409777d33afee2427f4`，文档main与release源码不是同一身份。本轮未更新catalog或安装实例。

| 判断 | 原始来源 | 范围/限制 |
| --- | --- | --- |
| H3官方单次4–15s | [MiniMax官方CLI Skill](https://github.com/MiniMax-AI/cli/blob/main/skill/h3-video/SKILL.md) 的 Core Limits | 官方API文档，不把其7000字符/API媒体限制强加给本地Comfy图。 |
| 当前基线也有16段schema | [3.9.1 nodes.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.1/v3/nodes.py) 的Sampler INPUT_TYPES | 通过固定tag原始源码读取核对，`chunks min1/max16`。不是只看最新版后猜旧版。 |
| 候选公开Sampler1–16段 | [3.9.8 nodes.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/v3/nodes.py) | production与base schema均为16，值是总目标而非本次新增数。 |
| V3.9引用路由也限制16 | [reference_images_v39.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/v3/reference_images_v39.py) | `MAX_CHUNKS=16`，引用路由校验1..16；改UI数字不是无限扩展。 |
| 共同段长4–30s，推荐5–15s | [3.9.8 constants.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/constants.py) | `min4/max30/step0.1/default5`；较长段显存/耗时可能大幅增长。共享时长，不支持同Run随意变长。 |
| Easy层总时长schema可到480s | [easy_nodes.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/v3/easy_nodes.py) | 上限480、最多16段、目标10s，较长总长会提高共同段长；这是resolver，不是8分钟质量/4090资源证据。 |
| 建议先2×5s再扩展 | [当前用户指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/docs/USER_GUIDE.md) | 指南强调配置一致和前缀复用；更长输出还含解码/组装成本，不能按新采样一段估全部成本。 |

推导：默认10s×16≈160s；生产建议范围的最大名义值15s×16≈240s；接口实验最大30s×16≈480s。**这些是算术推导，不是实际可见时长保证、硬件承诺或已测稳定长片。**2min在名义12×10s范围；如果用5s会需24段，不能直接用一Run完成，也不能声称段越短总能解决资源问题。

### 候选可用性与失效条件

v3.9.8 README的目标GPU复测是512×512、24fps、2×5s、8step Turbo的指定wrapper组合；不能推广为当前应用整图、120s或其他Spectrum/KJ构建。新九槽参考、旧V3.8图、v5/v6 Take读取/复用是不同边界。[发布说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/docs/RELEASE_NOTES_V398.md)、[引用迁移说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/docs/V39_REFERENCE_INLINE.md)。

若selected core/Python/node/weight/wrapper/geometry/seed/sampling/reference变化，之前真实前缀证据不能直接复用。新Run执行与旧Run继续应分别验收。不能因为候选release更高就强制现有Run迁移，也不修改官方sampling identity/hash强求复用。

用户指南的Review说明同时涉及“当前review unit输出”和“继续后整序列解码/保存”的不同上下文；当前应用图还要求完整receipt。仅靠README无法确认本应用能拿到纯增量组或省去重复解码。P0必须核对实际输出、索引、frame/trim及所选图的执行成本，再决定adapter；不宣传常量内存或线性耗时。

### 原生30秒补查（用户追问，2026-10-18）

**本节为首轮粗查，已由[原生30s独立深入调查（已归档）](../../../archive/h3-native-30s/ASSESSMENT.md)补充。**用户最新明确两项功能分开；新调查已取得本节3090作者的完整JSON并审计root覆盖值、子图与单Sampler路径，也取得42s原始图，故下文“未取得完整API graph”的旧证据缺口已有更具体的graph证据。原生30s不再归本长片P0，当前实施建议由独立报告维护。

初轮漏列了原生长采样路线，15s只能作为官方公布规格与已验证产品范围，不能当作本地H3不可逾越的硬上限。本次补查仍只读，不改catalog，不运行GPU。

- [MiniMax官方模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)的输出规格是4–15s，24fps；该公布规格与下面的本地节点参数范围分开记录。
- [ComfyUI固定源码](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy_extras/nodes_minimax_h3.py)：`EmptyMiniMaxH3LatentAV`、`MiniMaxH3ImageToVideo`及Ref2VA的`length`允许最大3600，输入是帧数。I2V/empty节点tooltip说明训练范围约124–362帧，超出未验证；`_empty_av_latent()`按给定完整长度创建一份jointAV latent，不在此处自动切成15s。原生图可以尝试一次更长序列，源码本身不证明成功/质量。
- 原生按`17k+5`向上对齐；30×24=720帧会对齐为736帧，约30.67s。这是该固定helper的静态推导，实际workflow可能先做别的长度解析，必须查最终API图与解码文件，不把请求30s当作恰好720帧。
- [作者报告：Minimax H3, 30 seconds in one go](https://www.reddit.com/r/StableDiffusion/comments/1vvd0ac/minimax_h3_30_seconds_in_one_go/)：作者称使用原生ComfyUI模板，单prompt、30s、0.4MP、3090，并加入attention/Spectrum/Turbo；报告570s并说明尝试4次才得到该结果。属于第一手社区报告，未取得其完整API graph和输出元数据，不当作本机可复现结论或稳定成功率。
- [另一作者的30s工作流](https://www.reddit.com/r/comfyui/comments/1vw036i/30second_minimax_h3_seamless_imagetovideo/)采用`H3MultishotMemorySampler`；作者在后续说明中明确是3个10s片段拼接。“single runtime pass/一次运行”在这里不等于一次扩散采样。社区同名30s案例必须逐图区分。
- [Comfy官方原生指南](https://github.com/Comfy-Org/docs/blob/main/tutorials/video/minimax/minimax-h3-native.mdx)还说明`MiniMaxH3AddGuide`能在指定frame_idx加图/音频guide；这为可选Qwen中间姿态锚点提供了真实原生节点候选，但它是条件锚定，不保证准确到姿态/替代运动latent连续性。本应用是否接线及其长序列效果另验。

采用建议：原生30s纳入独立实验profile，先schema/graph/资源预算，再和原生15s、等总长Continuum进行有限对照；保留当前应用15s/362帧生产门槛。若通过，30s以内镜头可减少分段；两分钟仍须评估连续性、恢复成本和分段方案，不能由单个社区30s样本外推单次120s。采样长度/decoder/wrapper不同会使以上源码与社区证据失效或不足。

## 3. 社区与研究工作流对比

只采用作者仓库/源码、研究作者项目与官方模型卡的技术事实；搜索到的宣传/转载不作为本机验收。以下仓库只查资料，不安装或复制实现。

| 来源（本次main revision） | 可以借鉴什么 | 对当前项目的决定 |
| --- | --- | --- |
| [H3 Continuum](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum)（候选固定v3.9.8） | official AV续接、Run/Take恢复、段级prompt、引用分配、最终assembly。 | 继续作为连续镜头主引擎；应用负责作品计划和执行编排，保持薄adapter。 |
| [H3 Long Video](https://github.com/ooizj/ComfyUI-H3-Long-Video/blob/961bcaf5eb2ed1830813c94612b025f362e1c51b/README.md)（`961bcaf…`） | 一份prompt＋总时长，LLM分析事件/对白后转段内时间，保存每段，LLM/H3交接资源。 | 借鉴“先规划再采样”和对白边界；不替换当前continuation。该包与原Motion Context有相同节点ID，README要求先卸原包，直接安装会冲突；本轮不安装。它自己的模型测试不能证明本地Strata同样正确。 |
| [H3 LongTake](https://github.com/mark9009/ComfyUI-H3-LongTake/blob/fe0ee65c30a557d2d8c8c72bf0c32e7289ff1298/README.md)（`fe0ee65…`） | 单图多prompt段、逐片保存、恢复/重做、最后组装；其作者报告keyframe与inpaint接缝不同。 | 借鉴检查点和局部重做；其接缝测量只对应作者样本，不导入新LoRA/FaceRefine或沿用其不同latent契约。 |
| [MovieAgent](https://github.com/showlab/MovieAgent/blob/d84041bed8bc8be460664528d9e9924cdde384ba/README.md)（`d84041b…`） | synopsis/角色资料→层级场景与镜头规划→图像/视频/声音→成片，拆分创作状态。 | 借鉴分层资料与镜头结构，用同一Strata服务顺序实现，不引入多agent框架/云模型/训练栈。论文不证明当前H3两分钟稳定。 |
| [Qwen官方2.1模型卡](https://huggingface.co/Qwen/Qwen-Image-2.1) | 官方声明统一图片生成/编辑、多参考图与身份保留能力。 | 适合分镜开场图/角色资产候选；不承担运动latent延续，不把身份保持当保证，不下载新权重。 |

共同设计规律是“持久创作资料→分镜/动作规划→局部prompt/图→短段计算→自动组装→局部修复”。这与用户只给一张图和复杂长动作的目标匹配；**本计划采用这一产品层结构，并不采用这些项目的全部依赖或多agent实现**。

## 4. 跨模块与资源判断

Qwen为后续镜头生成新图是合理候选，但“每段中间帧”不是现成能力：Reference Images是条件参考，First/Last是边界约束，实际中间姿态锚定须目标graph显式支持。当前V3.8接线与3.9新九槽布局不同，[固定引用说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/docs/V39_REFERENCE_INLINE.md)还指出terminal physical pair需相同有效参考集，图像输入本身可能占用RAM。应用需要冻结模型/图/引用映射，不能只在UI增加一格图片。

长序列采样逐段并不保证解码峰值低。官方[开放集成契约](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/v3.9.8/docs/V38_OPEN_INTEGRATION_CONTRACT.md)要求physical group、video/audio对应关系与Assembly Plan保持一致；像素超分是另一边界。[临时存储说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/docs/TEMPORARY_STORAGE_JA.md)区分Finalize、Decode Cache、Run/Take，disk-backed只解决其对应阶段，不保证所有上游内存分配。

因此建议分别验证采样、decode、preview编码、final mux和可选upscale，不一次打开Strata/Qwen/H3，也不把整片RGB tensor保留到Electron内存。先缓存分镜图再跑视频、只合成一次，都是待测工程目标，不是本轮测出的性能收益。

## 5. 本轮方法与未验证项

- 读初始git状态/统计、当前TS而非同目录生成JS、affected contracts/旧任务摘要；执行`npm.cmd run harness:app -- list`与`guide extend`，未启动Electron。
- 在线检索后直接读作者README/固定源码，GitHub API核对tag/main commit与latest Release；3.9.1源码用原始文件再次核查16段。查询失败的个别raw路径未被当作“不支持”，改读实际存在文件。
- 未读取用户state、未导出私人prompt/机器路径，未启动模型/队列/ComfyUI，未安装软件/下载权重，未执行模型速度/资源/质量A/B。
- selected实例、实际schema、全部适配差异、合法净帧算法在真实图上的结果、structured planner质量、120s续接/漂移/恢复与最终合成峰值仍待P0及后续阶段。
- 研究结果在上游revision改变、所选模型/图/依赖改变后须复核相应部分；不重做仍适用的静态与短链证据，不把source层结论升级为runtime层。

## 6. 2026-10-20交互补查与证据边界

范围：用户要求先调查待确认项，再将Create/Extend一体化交互及实施分期写入文档。本节记录前轮只读源码调查与本轮文档采用，不重复安装/生成。本地package为0.66.3；并发Strata代码/测试改动保留，本节不宣称已验其最新行为。

### 来源身份

- 上游[最新Release v3.9.9](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.9.9)发布于2026-10-19；GitHub tag API确认commit为 `427fba1add24b7939eba8028451a90465b13faba`，不是以main标签代替固定来源。
- 前轮深读v3.9.8固定commit `58fbd855feb13fa67a0613614df04e2b6fe808e2`；本次补读3.9.9的公开Sampler、Review、条件分支与序列代码。仓库catalog仍3.9.1；实际selected安装、运行schema和兼容结果本次未复核，不能把候选当本机已接通。
- 3.9.9针对特定KJ Preview Override配置补充v6复用资格与失败原因，旧不安全/v5 Take不自动升级。其目标GPU/浏览器复测不是120秒质量、全部wrapper或本应用整图验收；本轮不据此自动升级。

### 段长、脚本与恢复

| 问题 | 固定来源 | 结论与限制 |
| --- | --- | --- |
| Run是否只有一段prompt | [3.9.9 Sampler](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/v3/nodes.py) | 一个sequence prompt可解析成每段prompt；Run包含1–16段，共用段长。整片编辑器和分页是应用投影，不是后端必须分页；也不是一次H3采样读完整片并生成全部时间。 |
| 推荐如何拆段 | [3.9.8 Easy resolver](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/58fbd855feb13fa67a0613614df04e2b6fe808e2/v3/easy_nodes.py)、[constants](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/58fbd855feb13fa67a0613614df04e2b6fe808e2/constants.py) | Easy取 `min(16, ceil(T/10))` 再等分；段长schema4–30秒、推荐5–15秒。PLAN的段数范围是据此设计的名义初始化，不是质量/速度最优曲线。 |
| 不等长与重叠 | [temporal helpers](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/58fbd855feb13fa67a0613614df04e2b6fe808e2/temporal.py)、[3.9.9 sequence](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/v2/sequence.py) | `17k+5`网格、累计净帧补偿、上下文裁切和最终定长是不同步骤。共同名义段长下实际净贡献可不同；不能用 `N*(d-22/24)` 计算成片，不能为末段随意改Run段长。 |
| 当前段预览是否要解码所有前缀 | [Sampler投影](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/v3/nodes.py) 的 `_apply_review_decode_scope` | Review支持当前物理组AV/assembly输出投影；完整prefix仍在session/Run存储。Full Run/finish remaining不等同该投影，本应用receipt/最终输出如何消费仍须P0验证。 |
| 取消后从哪里继续 | [Review resolver](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/v3/review_control.py)、sequence的 `commit_group` | 复用完整、验证通过的已提交组；当前组重新采样，不是diffusion-step恢复。采样组可先于最终解码持久化；需区分采样、解码、合成、发布失败和app落盘间隙。 |
| 每页是否都可单独重做 | sequence的 `_terminal_flf_merge_enabled` / `commit_group` | 部分首尾帧且5秒段长配置会将最终两逻辑段合为物理组；重做/恢复/参考分配按整组处理，不承诺每页独立采样。 |
| 反复Extend是否无限 | Sampler的 `chunks` 及Review的prefix边界 | 16是单Run累计上限。整包新增计数与Run累计计数要分开；到顶需另验新Run尾状态移交，不能每次在原Run再加16段。 |

### 持续参考与低输入创作

- [3.9.9参考说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/docs/V39_REFERENCE_INLINE.md)公开固定R1–R9、All chunks/Per chunk与First/Last混合路径。参考持续输入、首帧约束、Strata看图是不同用途；参考赋值也不是人物可见性时间表。
- [条件选择](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/conditioning.py)按输入存在性求Reference/Hybrid模式；[默认模板说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/README.md)加载FL2VA并提供参考接法。因此“有持续Reference就必须换Ref2VA”推断过强；接口存在不等于对应FL2VA/Ref2VA/checkpoint/LoRA的身份效果已通过。
- [有效参考存储契约](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/58fbd855feb13fa67a0613614df04e2b6fe808e2/v3/reference_storage_contract.py)记录每物理组的有效参考、Picture映射和prompt hash；未来组变化能否保留前缀取决于实际组契约。修改共享全局文字、原始锚点或有效编号可能影响旧组，不可仅看“编辑的是第几页”。
- sequence路由运行时还明确拒绝与 `initial_state` 组合；不能直接假定V3.9路由加上现有bootstrap就已提供跨Run接续。P0/P5必须解决真实adapter边界。
- [参考prompt指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/58fbd855feb13fa67a0613614df04e2b6fe808e2/write-h3-v39-reference-prompts/SKILL.md)要求稳定主体身份、局部有效引用、逐段动作/交接且不把计划当观察。它是独立社区适配，不是MiniMax官方质量保证，也不会自动被Strata加载。
- 从实际生成图识别新人物、提取身份锚点、选择未来段并改写未执行prompt，是本应用待新增的编排，不是Continuum已有角色跟踪。用户只给单图是合法目标；未规定部分允许创作，用户原图保持优先，滚动尾帧不能持续覆盖稳定身份。

### 当前应用复用边界

- [生产Create布局](../../../../src/renderer/pages/create/page.ts)当前LoRA在时间与运动之前，H3 FPS固定24；新提案调整两个现有视频路线而非新增第四模式，其他模型FPS行为保留。
- [prompt controller](../../../../src/renderer/pages/create/prompt-controller.ts)按Create/Extend origin回写单维版本；分段稳定身份/逐页版本与异步修订归属是新增要求，不能只切textarea内容。
- [managed graph](../../../../workflows/minimax_h3_continuum_v38_managed_extend_api.json)使用V3.8兼容Sampler、First Image、Review与receipt，尚无Reference接入；当前R2V Extend是Motion Context，不是同一图的参考开关。
- [Queue remove/reset](../../../../electron/queue-mutation-service.ts)的remove主要修改队列记录；reset会调用[waiting加速策略](../../../../src/core/h3-execution-policy.ts)，不能直接当作保持同Run条件的恢复。新整包恢复应冻结兼容profile，保留旧普通任务行为。
- [History删除](../../../../electron/services/history-destructive-service.ts)保护官方Run owner并检查共享引用；任务中间数据需单独建立所有权/引用清理，不递归删Run目录。[History回流](../../../../src/renderer/pages/history/actions.ts)已有完整视频来源、sequence与tail身份可复用，整个脚本/布局/版本组合还需扩展。

### 用户反馈与未验证项

- 用户报告三次原生30秒样本出现15秒内动作完成、后续循环/倒退/重复或切镜，另有640p约半小时及人物异常；本轮不重测，也不将三个样本外推为普遍成功率。采用“原生常规/实验解锁”交互，保留旧工程输出事实与显式回退。
- 长稿可在创作层保存，实际Prompt编码预算分阶段检查；不能承诺上万字直送单次H3。全自动先分动作再局部扩写，整片/分段共享结构而非复制文本，是应用设计决定，不是上游现成编辑器。
- 1280×720、120秒、24fps、RGB float32完整像素张量约29.7GiB，仅为shape算术，不是VRAM峰值或实测RAM。Disk-backed Finalize不覆盖所有decoder/下游分配；[存储说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/427fba1add24b7939eba8028451a90465b13faba/docs/TEMPORARY_STORAGE_JA.md)将scratch/cache与持久Run/Take分开。
- 本轮无安装、应用启动、GPU、真实用户数据修改/删除、质量/性能A/B；P0-P6划分是待实施建议，120秒、持续身份参考与跨Run效果均待各阶段验收。

## 7. 2026-10-20 P0离线判定与停止记录

用户新增授权为执行P0，本节替代第6节中“实际安装未复核”的当前状态，不改写历史来源。原始路径、文件stat、探针输出和编译产物只保存在忽略目录 `temp/long-video-p0-2026-10-20/`，本节不提交机器路径、用户prompt或媒体。应用0.66.4；没有安装、下载、运行GPU或写入正式state。

### 实际身份与证据等级

| 对象 | 2026-10-20实际读取 | 证据边界 |
| --- | --- | --- |
| Core | 0.39.0开发提交 `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`，Git干净，origin为gitcode的ComfyUI镜像 | 读取所选安装下真正含main.py的内部core；不是Desktop安装目录版本或运行健康证明。 |
| Data / Python | 用当前TS隔离编译的findComfyRoot解析实际data；所选Python 3.12.11，独立于core目录 | 只读取必要设置；完整路径在installation.json，不向文档固化单机布局。 |
| Continuum | 3.9.1 / `94eaf70d674a58244e1cb139f021290d63fb2e6c`，官方GitHub origin，干净 | 实际安装与catalog一致，不是已升级3.9.9。 |
| 邻接节点 | KJNodes1.5.2 / `d3cfe21625e5170126ce06fbfcfe1d88108688c3`，Spectrum0.2.29 / `806fe498d574a726fecb8818917f00a4b993fd77`，Motion0.6.2 / `5335715abe54c1a9bfbe3494da29aae3e8635ce3`，均干净 | 本轮不升级、修补或重启节点。 |
| 应用H3节点 | VERSION为0.3.6，无独立.git来源 | 不能用空Git status宣称独立来源/commit已验证。 |
| 权重 | FL2VA与Ref2VA INT8、32B NVFP4文本编码器、音频VAE、FP16/INT8视频VAE、预览与若干LoRA文件存在，保存bytes/mtime | 仅文件stat，未全文件hash、未加载；不声称与发布者LFS hash一致或模型效果相同。 |
| 资源 | 初次只读探测：RAM可用27.79GiB、commit余量23.73GiB、显存空闲19243MiB；未检测到Electron/Python服务或8188/9333/9222监听 | 瞬时资源观察，不是H3加载准入/峰值保证；Strata历史准入也不能直接当当前运行结果。 |

### 决定性CPU检查

- 安装3.9.1的 `v3/nodes.py::_apply_review_decode_scope` 已存在；`v3/execution_planner.py::resolve_projection_decision` 是纯投影决策。直接执行真实函数的6个场景：未完成Review返回当前组；complete、Finish Remaining、缺物理组事实返回完整前缀；终端pair只选一半不投影、完整选择才投影。没有加载ComfyUI或权重。
- 导入安装版temporal/constants而不执行包入口：官方时间自检通过，4/5/7.5/10/15/30秒×5/22/39帧上下文的18个网格检查通过。只证明17k+5/净帧算术；不证明实际视频帧数、末尾补齐质量或A/V同步。
- 用AST抽取[实际应用receipt类](../../../../comfy_nodes/LocalVideoStudio-H3/nodes.py)并执行 `_storage_facts`，输入4份明确标记为合成的status：1/1、2/2通过；计划3段而只完成1/2段均拒绝“没有为每个最终Chunk提供存储记录”。报告 `boundaries.json` 保留UTF-8错误文本；首轮receipt-boundary.json中终端编码损坏的错误文本不作字符串证据，断言结果由后轮复核。
- [旧managed收据校验](../../../../src/core/h3-continuum-managed-receipt.ts)同样要求reused+generated=requested。现有[回归测试](../../../../tests/h3-continuum-managed.test.ts)补充预设3/12段首组结果必须拒收，定向通过。保留严格拒绝，不把新增planned总数塞进旧requested字段。
- 所选Python执行应用Run锁守卫11项通过，包含新Run的expected-prefix=0、旧Run过期head/部分前缀写入前拒绝。现行managed/comfy-ui基线70项通过；当前Electron TS隔离编译与双端typecheck通过。均非UI入口/实际生成证据。
- 尝试运行安装版上游temporal/Review pytest时，所选Python报告 `No module named pytest`，未安装依赖；上游pytest套件未通过也未执行。上述直接函数检查是有界替代，不声称覆盖其存储重启、完整Run复用或decoder测试。

### Adapter决定与未解除门槛

1. **保留3.9.1基线，独立new-run。**实际安装已具备单组投影，不能为此先要求升级3.9.9。新入口预设完整布局，保留原始First Image、冻结profile与独立Run identity；既有managed续接保留accepted>0/Run锁/head保护。源码识别的V38/V39/Finalize注册位于 `v3/driving_nodes.py`，没有在线object_info证据。
2. **新分组契约是runtime前置缺口。**区分计划总数、已提交逻辑前缀、物理组范围、实际生成/复用和输出scope；从真实manifest/组事实记账，不能补造全部N份receipt记录。现有registry把数组按逻辑索引读取，不能把当前组的局部索引直接喂给完整前缀流程。该协议尚未实施；旧receipt不放宽。
3. **组预览和最终输出分开。**未完成Review可消费当前物理组；最后一次Review会切完整前缀，优先以其做一次最终解码/组装候选。官方Finalize是decoded images/audio＋assembly_plan节点，不能直接接Run目录；独立Full Run重载是否零新增采样、内存是否满足、最后一组预览如何回填，仍要实跑。尚不宣称120秒可有界内存完成，也不拿MP4直接concat代替官方net-frame/seam。
4. **持续参考与跨Run仍是候选。**V38基础Reference与V39路由源码存在，但应用图未接入、实际checkpoint/LoRA效果未测。第6节的3.9.9路由/initial_state限制是候选源码事实，本轮未在3.9.1运行中复现，不能外推为已支持或已拒绝；旧bootstrap桥也不等于新的Run Storage移交。16段触顶后的原生AV尾状态＋身份锚点仍须独立验证，不强行换成尾帧。

按PLAN停止条件，发现未适配的部分序列receipt后不继续GPU实验：H3新增采样0/4，Strata规划0/4，没有new-run首段、2×5秒/append/10秒、音画/恢复、Strata分配质量或实际资源收益通过证据。不得把历史bootstrap80秒或旧managed2→3作为本次预设N段执行通过。先完成最小分组receipt/checkpoint适配和CPU检查，再在隔离资源内恢复原预算；P1纯逻辑不依赖该GPU结果，但本轮未开始P1。
