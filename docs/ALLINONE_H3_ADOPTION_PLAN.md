# ComfyUI-ALLinONE-MinimaxH3 源码评估与选择性吸纳计划

## 1. 评估范围

本计划基于本机源码进行对照，而不是仅依据 README 或界面截图：

- 参考项目：`E:\Projects\ComfyUI-ALLinOne-MinimaxH3`
- 参考提交：`9edcb7f`（完整提交为 `9edcb7f...`）
- 参考版本：`0.6.2`
- 对照项目：Local Video Studio `0.25.5`
- 评估日期：2026-08-18

### 1.1 当前进度（2026-08-18）

对照项目现已发布到 `0.25.5`；参考项目已更新到 `0.6.2` / `9edcb7f`。本轮重新检查了其最新的 Live Preview、Image、Chain、R2V、LoRA 和兼容性改动。因此本计划的状态如下：

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| Phase 0：证据基线 | ✅ 已完成 | 已有最终 API 工作流快照、输入可见性测试、预览/缓存风险边界和兼容证据模型。 |
| Phase 1：低风险可靠性与兼容性 | ✅ 已完成 | 已吸收兼容元数据、Git revision、预览来源/步数诊断、Prompt Writer 安全更新和重启后运行时复检；未替换已验证工作流。 |
| Phase 2：创建页操作体验 | 🟡 原型 A 已完成，待评审 | 已完成创建页三模式的紧凑任务操作条、渐进披露和 sticky 入队操作原型；尚未进入 renderer。 |
| Phase 3：结果检查与继续创作 | ⏳ 待开始 | 复用现有 History/血缘，不建立第二套 Library。 |
| Phase 4：Prompt 确定性底座 | ⏳ 待开始 | 现有 H3 Prompt/Writer 保持稳定，后续再统一编译管线。 |
| Phase 5：H3 Studio Image / Keyframe / Audio Drive / Chain | 🟡 已确认范围，待分阶段实施 | H3 Studio Image 与 Chain/latent Extend 已提升为高价值能力；仍按独立 Catalog/Adapter/Queue/History 接入，不复制参考项目。 Native Masked AV 长视频的专项接入边界见 [H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md](H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md)。 |
| Phase 6：社区 LoRA 发现与导入 | ⏸ 按需立项 | 现有 Catalog LoRA 机制优先保持不变。 |

Phase 1 的完成只代表低风险诊断和兼容性吸收完成，不代表 ALLINONE 的缓存、完整片段 TAE 预览、H3 Studio Image、Keyframe 或长视频 Chain 已迁移，也不代表新增了真实 GPU 能力。Phase 5 的“已确认范围”表示用户价值和吸纳方向已经确定，不表示运行时已完成。

已检查参考项目的 `nodes.py`、`web/one_node_minimax_h3.js`、全部 API 工作流、配置与 Prompt 模板、兼容矩阵、历史和媒体接口。对照范围包括本项目的工作流适配器、H3 Prompt、模型与 LoRA 目录、创建页、队列、历史、依赖扫描和 ComfyUI 运行时监控。

本项目使用 MIT 许可证，参考项目使用 GPL-3.0。ALLinONE 不会加入本项目的 npm 依赖、ComfyUI 节点 Catalog 或主仓库源码；下述内容只吸收可验证的产品行为、参数约束和工作流思路，并在 Local Video Studio 现有边界内独立实现。不得直接复制其 `nodes.py`、`web/` JavaScript 或受 GPL 约束的实现片段；若将来确实需要复用代码或工作流片段，必须先单独完成许可证评估。

## 2. 总结结论

参考项目最强的地方不是模型或单个节点，而是把 ComfyUI 的复杂图压缩成一条连贯的操作路径：在同一个界面里选择模式、输入素材和 Prompt、调整少量参数、运行、查看结果，再把结果直接送往下一个模式。

本轮更新后，最值得吸收的不是“再装一个 ALLinONE”，而是四个明确的产品能力：

1. **H3 Studio 图片模式**：把 H3 的单帧生成、图片编辑和多参考图混合纳入我们现有的图片项目循环，作为独立图片模型实现。
2. **Chain / latent Extend**：把单段 Motion Context 续写扩展成可恢复的多段连续任务，为长视频和 Continuum 做准备。
3. **按模式的 Prompt 预设**：补齐 Image、Keyframe、Audio Drive、Chain 等模式的确定性提示词骨架，继续复用现有 Prompt Writer 和检查器。
4. **可控的 R2V 与预览体验**：吸收保持比例裁剪、预览档位和明确的性能提示，但不牺牲当前的单 GPU 阶段和预览失败降级策略。

### 2.1 本轮价值分级

- **高价值，进入近期实施计划**：H3 Studio Image、Chain/latent Extend、按模式的 Prompt 结构与预设。它们分别补齐图片创作闭环、长视频连续性和“描述不完整时仍能得到可执行 Prompt”的核心问题。
- **中价值，作为独立小步吸收**：R2V 首图裁剪策略、Fast/Balanced/Detailed 预览档位、图片前后对比和结果就近继续创作、LoRA safetensors 元数据读取。它们能改善效率和可理解性，但不应阻塞主生成链。
- **先观察或单独立项**：完整片段 TAE 预览、最多 9 图参考的完整扩展、Keyframe、Audio Drive，以及参考项目的旧 Cache/Turbo/一体化安装方式。只有本项目有明确需求、兼容证据和最小真实运行后才推进。

Local Video Studio 已经在以下方面更成熟，不应回退：

- 不可变队列快照、历史血缘、素材归档和删除一致性；
- 模型、LoRA、节点、版本、离线扫描和运行时验证分层；
- LoRA 顺序、强度、冲突和专属工作流策略；
- H3 官方 Prompt 结构、检查器、Prompt Writer 和多种文本运行时；
- WebSocket 加历史轮询的任务完成检测、卡死检测、日志和通知；
- 可选实时预览失败时继续生成，而不是阻断任务；
- 本地化、可访问性、可测试的 TypeScript 模块和 Electron 进程边界。

因此不应把参考项目整体嵌入或重新做一个“大一统节点”。正确方向是把它作为社区经验样本，选择性吸收已经证明能解决本项目真实问题的做法，并落到现有 Catalog、Adapter、Queue、History 和 Prompt 模块中。

本计划不是迁移计划，也不是与参考项目对齐功能数量的路线图。Local Video Studio 已有大量真实生成验证，现有稳定工作流是默认保留项；参考项目的实现只有在满足以下条件时才进入产品：

1. 对应问题在本项目中真实存在，或改动能带来明确、可验证的用户价值；
2. 能以小范围、可回退的方式接入，不替换已经跑通的模型策略和执行链；
3. 不新增第二份状态、历史、模型目录或工作流事实源；
4. 静态借鉴不能升级为运行时改造，除非本项目自己的证据支持；
5. 社区项目与本项目策略冲突时，以本项目已验证行为为准。

## 3. 能力对照

| 领域 | 参考项目的优点 | 本项目现状 | 决策 |
| --- | --- | --- | --- |
| 主操作路径 | 左侧输入和参数，右侧大预览、结果条和后续操作；底部主按钮始终可见 | 创建、队列、历史职责清晰，但一次生成要跨页面，结果与继续创作距离较远 | 吸收同屏反馈和快速继续，不合并页面职责 |
| 模式切换 | T2V、I2V、R2V、Audio Drive、Keyframes、Extend、Chain、Image、Upscale 集中展示 | 已支持图生视频、R2V、两种 Extend、图像处理、超分；尚无 H3 Studio 单帧模型 | H3 Studio Image 作为独立图片模型接入；保留能力驱动过滤，不做一个万能选择器 |
| Prompt | 简单描述会被确定性包装为 H3 格式；按模式提供模板和自定义预设 | 官方格式、模式识别、检查器、模板、Writer 已明显更强，但 Image/Keyframe/Audio/Chain 的社区模板仍有补充价值 | **高优先级吸收**模式化骨架和约束，继续只保留一个 Prompt 编辑区，不增加第二个 Prompt 框 |
| 模式状态 | 每个模式单独保存 Prompt、素材、质量、分辨率、LoRA | 视频生成与续写已有独立 Prompt 版本，但高级设置仍共享同一 Draft 的较多字段 | 审计并补足按模式保存，避免切换时参数串扰 |
| 输入缓存 | 通过内容指纹和 `H3CacheBust` 防止同路径文件或嵌套引用误用 ComfyUI 缓存 | 图片素材按内容哈希归档；尚无明确的 H3 工作流缓存失效节点 | 优先做复现审计，再决定哈希路径是否已足够，必要时独立实现最小指纹节点 |
| 实时预览 | KJNodes `ModelPreviewOverrideKJ` 播放完整片段，并提供 Fast / Balanced / Detailed 三档 | KJNodes `ModelPreviewOverrideKJ`，可选、限尺寸、只保留最新帧、任务结束释放；曾有晚到或不显示问题 | 吸收三档“性能—预览质量”表达和日志诊断；完整片段播放必须先做基准测试，不能替换当前安全默认 |
| 任务完成 | API 事件快路径加 `/history` 轮询恢复 | 已有 WebSocket、历史轮询、服务存活和停滞检测 | 已吸收，无需重做；仅补测试和日志可见性 |
| LoRA | 可叠加、调强度、读取 safetensors 触发词 | 已有顺序、冲突、模型/模式兼容和专属采样策略 | 增加元数据扫描能力，但不能允许未验证 LoRA 绕过 Catalog 规则 |
| 参数密度 | Quality 预设与高级选项折叠，顶部摘要芯片快速确认 | 创建页信息完整，但参数区纵向较长，关键决定被大量解释文字稀释 | 原型先行，加入任务摘要和渐进披露 |
| 结果复用 | 结果条中直接收藏、打开、放入 R2V 或 Extend | 历史详情已有继续编辑、开始视频、续写、复制和定位 | 不新增第二套 Library；把已有操作缩短到结果附近 |
| H3 Studio Image | 依赖 H3 Studio 节点和 Qwen3.5 2B/4B，支持文生图、图片编辑和最多 9 张参考图 | 当前图片模型以 Qwen Image Edit、LaMa、BiRefNet、FLUX.2 Klein 为主，没有 H3 Studio 图片适配器 | **高优先级吸收**：独立 Catalog/Adapter/Workflow/图片项目版本，不把外部节点包放进主仓库 |
| R2V 输入约束 | 首张身份参考图保持比例 cover-crop，不拉伸；多图语义在界面明确提示 | R2V 已有多参考 Slot 与数量约束，但需确认首图比例策略和提示文案 | **中优先级吸收**：先做静态 workflow 对照和预览，再补确定性的裁剪策略 |
| 图像结果 | 0.5.0 增加原图/结果拖动对比 | 图片详情有版本列和大图，尚缺明确前后对比 | 值得接入图片详情，作为独立可复用组件 |
| Keyframe / Chain | 明确的关键帧、多段 latent 保存/加载和裁切拼接 | 已有首尾帧、Motion Context Extend 和 Continuum 研究路径 | **Chain/latent Extend 提升为高优先级**；Keyframe 与 Audio Drive 随后独立接入，不能混入普通 I2V 开关 |
| Audio Drive | 输入音频裁剪并驱动 H3 音频 latent | 尚未形成完整产品模式 | 可列入后续能力，必须有时长预检和音频历史元数据 |
| 兼容处理 | 记录精确 ComfyUI/节点提交和已知断点 | Catalog 已有最低/推荐版本，但已知坏版本表达较弱 | 增加兼容证据和 `knownBadRanges` 设计 |
| 文件安全 | 配置原子写入、路径穿越保护、续作用 copy-first；但历史只保留 50 条且会直接删除文件 | 已有素材归档、历史血缘、确认弹窗和删除一致性，不使用 50 条上限 | 吸收原子写和 copy-first；拒绝参考项目的直接删除和独立历史库 |

## 4. 应吸收的具体设计

### 4.1 H3 输入内容指纹与缓存失效

参考项目的 `H3CacheBust` 不只是随机数。它把 Prompt、Seed、Steps、画面尺寸、关键帧位置、素材名称和素材内容哈希组合成执行指纹，并解决 ComfyUI V3 autogrow 嵌套字典不会完整参与缓存依赖遍历的问题。

本项目不能直接假定也有同一问题。图片素材库已经使用内容哈希和稳定归档路径，很多同名覆盖风险可能已被消除；视频引用和 R2V 嵌套输入仍需单独验证。

计划：

1. 建立“同一任务参数、同一文件名、替换文件内容”的 I2V、R2V、Motion Context 回归用例。
2. 检查最终 API Workflow 中素材是否直接出现在 ComfyUI 可追踪的普通节点输入，还是藏在动态引用状态中。
3. 如果哈希归档路径已能保证变化可见，只补测试和日志，不增加节点。
4. 如果能稳定复现旧内容被复用，独立实现一个最小的 Local Video Studio ComfyUI helper 节点，只做 pass-through 和 `IS_CHANGED` 内容指纹；不要依赖整个 ALLinONE 包。
5. 指纹进入队列快照和运行日志，但不改变 Seed、Prompt 或历史分组语义。

### 4.2 模式化的创作工作台

参考项目“一屏看完输入、参数和结果”的优势很明显，但固定 1200×700 节点、全局 DOM 状态和大量弹窗不适合 Electron 应用。

适合本项目的形态是：

- 创建页仍负责编辑和入队，不直接绕过队列运行；
- 宽屏时保留当前素材区和编辑区，在编辑区顶部增加紧凑任务摘要；
- 主“加入队列”操作保持 sticky，不因长参数区滚出视口；
- 当前模式只展示会改变本次任务的字段，兼容说明移入 `i` 提示和阻断消息；
- 参数分成“输出”“运动/时长”“增强与 LoRA”“可复现性”“高级工作流”五层，默认只展开当前模式常用层；
- 切换模式时恢复该模式上次编辑状态，不能覆盖已经入队的不可变快照。

摘要建议只显示：模型、模式、输出尺寸、时长/帧数、Steps、加速策略、LoRA 数量、Seed 状态。摘要是参数的投影，不是第二份状态。

### 4.3 结果附近的下一步操作

参考项目把生成结果直接放入 R2V/Extend 的操作很顺。我们已经有正确的数据模型和历史动作，只需要降低操作距离：

- 当前任务完成后，在队列卡片结果区提供“查看详情”“继续创作”“打开位置”；
- 图片结果提供“继续编辑”“开始创作视频”；
- 视频结果根据能力提供“调整参数”或“视频续写”；
- 所有操作仍调用现有导航和素材归档服务，不在组件内复制文件；
- 继续创作必须复制 Draft，不能修改原任务；
- 使用 copy-first 素材 staging，源输出保持不动并保留项目血缘。

不新增独立 Library 页面。收藏功能若需要，作为历史筛选条件和详情动作实现，避免 History 与 Library 两套索引、缓存和删除语义。

### 4.4 图片编辑前后对比

参考项目 0.5.0 的 Compare slider 与我们的图片版本详情很匹配：

- 左侧固定为当前版本的直接父版本，右侧为当前结果；
- 拖动分隔线只影响查看，不生成新的媒体文件；
- 透明 PNG 继续使用棋盘格背景；
- 支持键盘方向键微调分隔位置，提供明确的“原图/结果”标签；
- 对尺寸不同的版本使用 contain 和统一视口，禁止通过拉伸制造错误对比；
- 组件只挂载当前两张图，切换版本时释放旧 URL，避免大图累积占用内存。

### 4.5 LoRA 元数据发现

参考项目会从 safetensors header 读取 `modelspec.trigger_phrase`、`trigger_phrase`、`trigger_word` 和 `ss_trigger_words`。这对社区 LoRA 很有价值。

本项目应将它作为“候选元数据”，而不是自动信任：

- Catalog 内置 LoRA 仍以已验证定义为权威；
- 未收录 LoRA 可展示检测到的触发词、rank、基础模型和文件哈希；
- 用户明确导入后才能进入自定义 LoRA 列表；
- 未知兼容性默认显示黄色警告，不自动关闭 Spectrum、Attention 或改变 Steps；
- 自定义说明、推荐强度、冲突和顺序由用户保存到应用设置，不回写模型文件；
- 扫描必须有大小上限，只读取 safetensors header，不加载 tensor。

### 4.6 Keyframe、Audio Drive 与 Chain

这些不是创建页里再加三个复选框，而是三种有不同输入约束、Prompt 规则和历史数据的能力：

- **Keyframe**：多张帧锚点加位置；需要时间轴、重复位置校验、首尾精确锚定和关键帧 Prompt 预设。
- **Audio Drive**：必需音频；需预检采样率、通道、有效时长和 H3 上限，允许非破坏性裁剪。
- **Chain / Continuum**：每段保存/加载 latent、裁剪上下文、拼接音视频；任务需要段落状态、失败恢复点和总时长估算。

每种能力都必须有独立 Catalog capability、Workflow Adapter、静态验证、运行时节点验证、队列快照字段、历史详情字段和最小真实运行。不能以“参考 JSON 可以加载”作为完成标准。

### 4.7 H3 Studio 图片模式（高优先级）

ALLinONE `0.6.x` 的 Image 模式不是普通的 H3 视频首帧，而是基于 `ComfyUI-MiniMax-H3-Studio` 的单帧生成/编辑能力：

- 文生图；
- 以 `@Image1`、`@Image2` 等角色引用图片；
- 单图编辑；
- 多参考图混合，最多 9 张；
- 使用 Qwen3.5 2B/4B 作为图片 Prompt/语义辅助；
- Base 与 LightX 采样配置分开；
- 结果只保留最终静态图，不把内部帧批次暴露给用户。

这与我们的图片项目、版本相册和“满意后送到视频首帧/第一个参考位”的循环高度吻合，因此列为本计划第一个高优先级新能力。吸收方式是产品级重实现，而不是引入 ALLinONE：

1. 在 `src/core/catalog/models/` 增加独立的 H3 Studio Image 模型定义，明确输入数量、模型/编码器/VAE、节点包、分辨率、输出格式和暂不支持的能力。
2. 根据上游 `workflows/image.json` 和实际 `/object_info` 建立 API-format adapter；禁止直接把 ComfyUI 画布 JSON 当执行工作流。
3. 复用现有图片编辑页、标记 sidecar、图片队列和图片项目历史；不新建一套 ALLinONE History/Library。
4. Prompt 仍只有一个可编辑框。参考图角色、summary、detailed description 等内容由确定性编译器和可选 Writer 生成，用户可切换版本后入队。
5. 先实现文生图、单图编辑和两图参考混合三条最小路径，再评估 9 图上限；每条路径分别做离线扫描、运行时节点检查、队列快照、历史版本和最小真实输出。
6. Qwen3.5 2B/4B 只作为此模式的依赖，不改变现有 H3 视频 Prompt Writer 或 Qwen Image Edit 的默认策略。

不把 `ComfyUI-MiniMax-H3-Studio`、Qwen3.5 权重或 ALLinONE 源码加入本仓库；设置页只登记可安装/可检测的外部节点和模型来源。

### 4.8 Chain / latent Extend（高优先级）

参考项目的 Chain 模式把多个片段串成一个连续任务：每段保存 Motion Context latent，下一段从 latent 和音频上下文继续，不把上一段重新编码成普通视频输入。它比“单次 Extend”更适合长视频和 H3 Continuum。

吸收边界：

- 继续使用我们已有的 `ExtensionQueueTask`、Motion Context 版本字段和 copy-first 素材安全策略；
- 将“链”建模为一个父计划加多个不可变片段快照，而不是让一个任务在运行中修改自己；
- 每个片段完成后保存可恢复的 latent、输出文件和阶段统计，失败时可以从最后一个成功片段重试；
- 总 ETA 分离扩散、VAE/音频、拼接和清理阶段，不能用单段 5 秒估算套用；
- ComfyUI 重启、显存释放和模型切换仍由当前运行时策略统一管理；
- 先做 2 段、短时长的实验性路径，再开放 1 分钟级 UI；没有真实 smoke 证据前不称为“支持 Continuum”。

### 4.9 R2V 裁剪与实时预览档位（中优先级）

这两项值得吸收，但不能直接复制参考项目的运行路径：

- **R2V**：对第一张身份参考图增加明确的保持比例策略（cover-crop、contain 或用户选择），并在 Slot 下解释多图如何分工；先通过静态图尺寸矩阵验证不会改变身份锚点。
- **Live Preview**：借鉴 Fast / Balanced / Detailed 的用户语言和性能预期，映射到我们现有的 KJNodes `ModelPreviewOverrideKJ`。默认仍保持低开销、只保留最新帧、任务结束释放；完整片段播放只有在 4090 的同参数基准证明不会显著拖慢生成后才作为可选档位。
- 两项都必须遵守“预览不可阻断正式生成”和“缺依赖时明确降级”的契约。

## 5. 不应引入的实现

以下做法会破坏本项目当前架构或用户已经确认的行为：

- 把全部模式和状态放进一个数千行 JavaScript 文件；
- 在 renderer 中拼装和修改任意 ComfyUI JSON；
- 节点导入时无版本边界地 monkey-patch `comfy.model_base.MiniMaxH3` 或第三方节点；
- 因可选 TAE 预览缺失而阻止正式生成；
- 自动选择“名称最像”的模型文件作为缺失模型的替代；
- 允许任意 LoRA 绕过模型、模式、顺序和冲突检查；
- 用浏览器原生 `confirm`、直接 `os.remove` 或仅按文件名保存收藏状态；
- 再建立一套 ComfyUI 侧 History/Library 作为应用历史源；
- 固定尺寸布局、悬停时按空格立即生成，或会抢输入焦点的全局快捷键；
- 复制参考项目的 Larry Turbo、旧 Cache 或旧节点版本策略；
- 将 H3 Studio 当前已知失效的图片超分路径接入产品。

## 6. 分阶段实施计划

### Phase 0：建立证据基线（已完成）

**目标**：先证明差距，避免因“参考项目做了”而重复实现或破坏稳定流程。

工作项：

1. 为 I2V、R2V、Motion Context 建立输入替换与缓存复用测试矩阵。
2. 保存本项目标准 H3、Turbo、Spectrum、实时预览、Motion Context 的渲染后节点图快照。
3. 静态审计预览首帧、任务完成检测和缓存释放链路；真实首帧时序仅在问题需要继续定位时采集。
4. 把 ComfyUI、Motion Context、KJNodes、Spectrum、H3 Studio 的已验证提交与已知坏范围整理成机器可读字段设计。
5. 保留真实 4090 对照任务的检查方法，只有后续运行路径发生变化或同类问题再次出现时才执行，不作为本轮出口条件。

主要代码边界：`src/core/workflow.ts`、`electron/services/comfy-ui.ts`、Catalog dependency definitions、相关 tests。

验收：建立当前工作流快照、输入身份测试、缓存/预览风险边界和兼容性证据模型。Phase 0 不改变用户界面和工作流；无法由现有证据确认的问题进入“按需诊断”，不为了完成参考项目对照而启动新的 GPU 验证。

### Phase 1：低风险可靠性与兼容性吸收（已完成）

**目标**：只补充不扰动已验证生成链的兼容信息和诊断能力。默认不改 H3 节点图、不替换缓存策略、不引入参考项目的 helper 节点。

工作项：

1. 保留现有哈希 staging 和 `--cache-none` 策略；只有真实生产问题能够稳定复现旧输入复用时，才重新评估最小 Fingerprint helper。
2. 需要继续调查预览问题时，优先补日志和消息来源标识；不以“参考项目逐步预览”为理由改写当前采样链。
3. H3 Studio NestedTensor 黑预览仅作为已知社区案例记录；本项目若未复现，不增加兼容 adapter，更不做全局永久 patch。
4. 给音频引用增加非破坏时长预检与裁剪计划，为 Audio Drive 铺路。
5. Catalog 增加已知坏版本/提交范围的表达，设置页用黄色“已安装但不推荐”状态和明确修复动作展示。
6. H3 Prompt Writer 更新前识别本程序兼容补丁，并比较上游 HEAD；上游未变化时复用当前目录，上游变化时才执行备份、干净替换和补丁重放。
7. 节点重启后复检 Prompt Writer `/status`、`/models`、GGUF diagnostics 和共享 llama-cpp-python；成功探针只作为中性运行证据，不能把成功提示误判为“兼容性待确认”。

验收：dependency scanner tests、相关 workflow tests、`npm.cmd run verify`。只有实际改动运行路径时，才要求最小 H3 真实生成；文档、元数据和纯诊断改动不重新验证整套生成流程。

当前完成范围：兼容证据字段、Git revision 扫描、核心已知风险提示、节点黄色待确认状态、H3 预览来源/Step 元数据、Prompt Writer 安全更新策略、共享 llama 后端复检和运行时错误详情已经接入。`npm.cmd run verify` 已通过（64 个测试文件、477 个测试）；本轮没有把静态/模拟复检写成真实 GPU smoke 结论。

明确延期：缓存 Fingerprint helper、NestedTensor adapter 和 Audio Drive 时长预检暂不接入。前两项没有本项目复现证据，后者目前没有对应的产品工作流；它们保留为按需诊断或后续能力，不属于 Phase 1 阻断项。

### Phase 2：创建页操作体验（原型 A 已完成，待评审；renderer 尚未开始）

**目标**：把“复杂但完整”改成“信息完整、当前决定清楚”。

#### Phase 2A：创建页原型（已完成）

- 创建页保留固定模式导航；底部操作条集中显示当前模式、关键模型/输出参数和队列状态，避免另加一张重复摘要卡。
- 将低频的 Steps、Spectrum、模型感知、动作与 Seed 收进“增强与复现”折叠区；提示词助手默认折叠。
- 三种创建模式都使用底部 sticky 操作栏，清空与加入队列保持在视口内；原型按钮会显示“已加入队列”反馈。
- 只在当前模式更新摘要，避免隐藏模式初始化时覆盖可见模式的摘要。
- 已执行 `npm.cmd run prototype:build`、`node --check prototypes/studio-prototype.js`、`git diff --check`，并在 1280×800 / 1440×900 视口检查结构与操作栏边界。

此阶段只改变 `prototypes/`，不改变 renderer、持久化 Draft 或真实入队逻辑；通过产品评审后再拆成 renderer 小步实现。

工作项：

1. 先更新创建页原型，设计紧凑任务操作条、sticky 入队操作和渐进披露。
2. 审计视频生成、视频续写、图片处理三个模式的 Draft 字段，补足按模式恢复，保持 Prompt 版本独立。
3. 将模型、模式、尺寸、时长、加速和 Seed 的关键值汇总到操作条；Steps、LoRA 等详细参数仍在对应模式中查看。
4. 将低频解释从表单正文移到 `i` 提示、阻断卡和设置详情；错误不能只依赖 tooltip。
5. 保留现有模型可用性和工作流能力过滤，不显示当前模式不支持的模型。
6. 验证连续输入、焦点、清空、撤销/重做、拖放、切换模式和入队不发生 renderer 重建。

验收：原型阶段先通过合同规定的两个视口与 Create 三模式手工回归；renderer 实现阶段再执行 `npm.cmd run verify`，并补连续输入、焦点、清空、拖放和真实入队回归。

### Phase 3：结果检查与继续创作

**目标**：减少任务完成后在队列、历史和创建之间的往返。

工作项：

1. 在已完成任务结果区复用现有 History actions，提供与媒体类型匹配的下一步。
2. 图片详情加入父版本/当前版本 Compare slider。
3. 若用户需要收藏，在现有 History 中增加收藏字段、筛选和排序，不建立新 Library。
4. 可在创建页加入最近结果的紧凑横向条，但只作为历史查询视图，不持有第二份媒体状态；此项需先通过原型确认。
5. 所有“继续创作”执行 copy-first staging、创建新 Draft、保留来源项目和版本 ID。

验收：图片和视频两个历史分区、详情、删除、定位、复制、继续创作和跨重启恢复全部回归；验证旧历史记录不受影响。

### Phase 4：Prompt 的确定性底座

**目标**：在本地文本模型不可用或描述很短时，仍能生成符合 H3 模式的 Prompt。

工作项：

1. 将现有 `h3-prompt.ts`、官方规范、检查器整合成模式化编译管线：用户描述 → 确定性结构 → 可选 Writer 改写 → 格式检查与修复。
2. 增加 Keyframe、Audio Drive、Chain/Continuum 的模式预设和约束，但不在相应工作流接入前对普通用户展示。
3. 自定义预设使用现有 Prompt Pack/本地化结构，不存入 ComfyUI 插件目录。
4. UI 继续只显示一个可编辑 Prompt；“优化提示词”原地生成新版本，用户可以前后切换和提交任一版本。
5. 加入长任务的分段时间线检查，避免 Continuum 仍按 5 秒事件编写。

验收：每种已启用模式有结构、标签、时长、音频和引用角色单测；离线、Writer 失败、Writer 成功三条路径结果均可提交。

### Phase 5：H3 Studio 图片与高级 H3 能力

**目标**：先把价值最高、能复用现有图片/视频闭环的能力接入，再逐个把 Keyframe、Audio Drive、Chain/Continuum 变成可维护的产品能力。参考项目只提供行为、参数和工作流语义；不把 ALLinONE 节点包、源码或权重加入本仓库。

建议顺序：

1. **H3 Studio Image**：先完成独立图片模型 Catalog、依赖扫描、API-format adapter、图片队列/历史版本和最小文生图、单图编辑、两图参考路径。确认基础路径稳定后，再扩展到最多 9 张参考图。
2. **Chain/latent Extend**：先做两段短任务、latent checkpoint、失败续跑和分段 ETA，再评估 Continuum/一分钟级 UI；不把普通 Extend 改成隐式链任务。
3. **Keyframe**：输入和验证清晰后，做时间轴原型与最小工作流，保持与普通 I2V 的能力过滤隔离。
4. **Audio Drive**：补齐音频检查、裁剪、Prompt 和历史元数据，再考虑音频驱动的完整工作流。

每个能力单独走完整接入清单：Catalog → 依赖 → Workflow Adapter → 静态验证 → 队列快照 → 运行时验证 → 历史 → 最小真实生成。一个能力验收后再开始下一个，避免同时修改 `src/types.ts`、`electron/store.ts`、`src/core/workflow.ts` 和 Queue 热点。H3 Studio Image 与 Chain 的实现不得以“安装 ALLinONE 后可用”作为验收条件，必须在 Local Video Studio 自己的目录、适配器和队列边界内完成。

### Phase 6：社区 LoRA 发现与导入

**目标**：降低新 LoRA 接入成本，同时保留安全边界。

工作项：

1. 实现仅头部读取的 safetensors metadata scanner。
2. 设计“Catalog 已验证 / 用户导入 / 未识别文件”三种状态。
3. 为用户导入 LoRA 保存模型族、模式、触发词、推荐强度、顺序和冲突备注。
4. 加入同文件哈希去重和移动路径修复，不把机器绝对路径写入公共 Catalog。
5. 未知 LoRA 不参与自动 Prompt 前缀和自动参数改写，除非用户明确确认。

验收：离线扫描、大文件、损坏 header、重复文件、重命名、模型不兼容和多 LoRA 冲突均有测试。

## 7. 可并行分派的工作包

在不同时修改热点文件的前提下，可拆成以下工作包：

| 工作包 | 交付物 | 主要文件所有权 | 依赖 |
| --- | --- | --- | --- |
| A. 缓存与预览证据 | 复现用例、节点图快照、结论 | tests、研究 fixture；只读 `workflow.ts` | 无 |
| B. 创建页原型 | 新摘要、sticky action、渐进披露原型 | `prototypes/` | Phase 0 结论非必需 |
| C. Compare 组件原型 | 图片详情前后对比交互 | `prototypes/`、独立 renderer component | 无 |
| D. Prompt 模式规范 | Keyframe/Audio/Chain schema 和测试向量 | `docs/`、Prompt tests | 不修改运行时 |
| E. 兼容元数据设计 | known-bad range 类型、设置状态文案 | Catalog 类型设计文档 | 不修改 scanner 热点 |

真正实施时，`src/core/workflow.ts`、`src/types.ts`、`electron/store.ts`、`electron/services/comfy-ui.ts` 和 `src/main.ts` 必须分别指定单一所有者并串行合并。

## 8. 推荐优先级

如果只做三项，当前优先顺序应为：

1. **H3 Studio Image**：它与现有图片处理、版本相册和“满意后送到视频首帧/第一个参考位”的循环直接相连，优先实现独立模型与三条最小路径。
2. **Chain/latent Extend**：它能解决长视频的连续性和失败恢复问题，但先限定为两段短任务，避免一次性引入长任务状态复杂度。
3. **模式化 Prompt 预设 + R2V 裁剪/预览档位**：把 Image、Chain、R2V 的有效约束变成现有 Prompt 编译器和预览设置中的可选能力；不增加第二个 Prompt 编辑框，也不默认开启高开销完整片段预览。

创建页摘要、渐进披露、sticky 入队、图片 Compare 和结果就近继续创作仍是并行的 UX 基础工作。缓存 helper、预览 patch、Keyframe、Audio Drive 等只在本项目有复现证据或完成对应能力立项后处理；任何项目都不能因为参考项目存在就直接安装 ALLinONE 或复制其实现。

## 9. 完成定义

“已吸收参考项目”不等于界面上出现相同按钮。每项必须满足：

- 使用本项目现有状态、Catalog、Adapter、Queue 和 History 边界；
- 不创建第二份模型、Prompt、任务或媒体路径事实源；
- 离线扫描、静态可识别、运行时可用三个状态清楚区分；
- 可选增强失败时有明确降级，不破坏正式生成；
- 对输入焦点、播放、拖放、删除、退出和旧历史没有回归；
- 静态检查只称为静态通过，模型能力只有真实最小任务成功后才能标记为已验证。
- 若本项目已有稳定且等价的实现，结论可以是“学习后不改动”；不以代码改动数量衡量吸收成果。
