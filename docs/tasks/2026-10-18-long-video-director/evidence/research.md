# 长视频模式研究：当前能力、上限与可借鉴方案

- 类型：Research / source-and-code assessment；状态：research-complete，未执行本轮 runtime / quality 验证。
- 查询日期：2026-10-18（Asia/Singapore）；本地基线：`475722c2c231da2aa8782d66e6c03d22a5913809` / 0.66.0，已有非本任务 dirty changes。
- 适用范围：H3 Continuum 长片编排与当前 Strata/Qwen 接缝；采用建议见 [PLAN](../PLAN.md)，当前状态见 [TASK](../TASK.md)。本文件不替代 catalog 或安装清单。

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

**本节为首轮粗查，已由[原生30s独立深入调查](../../2026-10-18-h3-native-30s/ASSESSMENT.md)补充。**用户最新明确两项功能分开；新调查已取得本节3090作者的完整JSON并审计root覆盖值、子图与单Sampler路径，也取得42s原始图，故下文“未取得完整API graph”的旧证据缺口已有更具体的graph证据。原生30s不再归本长片P0，当前实施建议由独立报告维护。

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
