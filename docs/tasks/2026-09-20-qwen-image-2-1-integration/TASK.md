# Qwen Image 2.1 图片编辑模型接入评估与实施计划

- Status: product integration implemented through static/runtime-contract gates; ComfyUI + RTX 4090 smoke still pending
- Updated / Owner: 2026-09-21 / Codex
- Scope / Authority: 评估 Qwen Image 2.1 作为新的图片编辑模型接入 Local Video Studio；保留现有 Qwen-Image-Edit-2511 的 ID、队列快照、历史记录和回退路径，不做替换式升级，不自动下载或覆盖用户权重。
- Execution: direct；本文件是跨阶段任务状态与实施计划，先完成依赖/运行时门槛，再实现产品接入。

## Resume

- 推荐方案：新增独立 adapter/capability，稳定 ID 为 `qwen-image-2-1`；保持一个模型入口，按是否有参考图在官方 ComfyUI T2I 与编辑图之间分支，默认 1024/约 1 MP、PNG、单输出、CFG 1、25 步预览档；2511 继续作为独立可用选项。
- 4090 结论：RTX 4090 24 GB 适合优先验证 INT8 DiT + INT8 Qwen3-VL 8B encoder + BF16 VAE 的 1 MP 编辑路线，但目前没有可直接套用的 4090 峰值显存基准。2K/4 MP、10 张参考图、同时保留多个模型和标注参考图，必须视为实验档，不能在计划阶段承诺稳定可用。
- Paint 结论：当前“paint”是 Fabric 标注画布。其文档、标注预览 PNG、标注说明、历史快照可以复用；但现有编译器把标注预览作为额外参考图且 UI/辅助函数仍有 2511 专用判断。2.1 可以复用为视觉引导，但不能把它误称为原生 Mask。2.1 官方图没有已验证的 Mask socket，二进制 Mask 和 Crop/Stitch 先不随首期开放。
- Prompt 结论：不能无条件复用当前 `qwen-image-edit` prompt pack。2.1 使用 `<image1>`…`<image10>` 的显式条件图引用，`image_1` 是编辑目标，默认 CFG 1 时负面提示没有作用；建议新增 `qwen-image-2-1` pack，复用基础规则但保留 2511 的旧 pack 和旧输出不变。
- 依赖结论：原生 ComfyUI 路线暂未发现需要新增 npm/Python 包；需要含 2.1 核心实现的 ComfyUI、2.1 的 DiT/encoder/VAE 权重和运行时节点 schema。不要因为 Diffusers 文档存在就把 `diffusers`、`transformers` 或 `accelerate` 加入应用运行时；本应用的架构仍是由 ComfyUI 执行图。
- 当前工作区基线：建档前已有多处依赖扫描、Settings、catalog、draft defaults 和测试的用户修改；本轮实现已逐文件合并，未回退这些已有改动。后续真实 smoke 仍需在现有运行时状态上进行，不得覆盖或回退用户数据。

## Implementation status (2026-09-21)

- [x] WP1 catalog、离线依赖扫描/Settings 组件说明、2.1 独立能力和官方权重入口。
- [x] WP2 独立 `qwen-image-2-1` adapter、官方 ComfyUI API workflow、节点/枚举/schema 校验和内置 workflow provenance。
- [x] WP3 Create 页按 capability 开放 2.1 的 10 个模型输入槽与 Paint guide 复用；无参考图进入官方 T2I，guide 计数改为 capability 驱动，2.1 明确不开放 Mask-conditioned inpaint；无参考图开放画面比例/目标分辨率选择，有参考图时保持“原始”默认并可切换官方 `custom_size` 画布。
- [x] WP4 独立 `qwen-image-2-1` prompt pack、`<imageN>` 编译和按 modelId 路由；2511 prompt pack/ID/旧队列语义保持不变。
- [~] WP5 已接入静态 runtime profile、单图 PNG、cache/schema/占位符校验；实际 ComfyUI queue、取消/重启/历史重跑仍待机器 smoke。
- [~] WP6 静态测试、类型检查和全量单测通过；尚未在本机加载 2.1 权重并采集 4090 显存/耗时/输出 alpha 证据。
- [x] 2026-09-21 ComfyUI 0.37 compatibility fix：`SaveImageAdvanced` 是核心节点，其 DynamicCombo 输出参数必须以 `format.bit_depth` / `format.input_color_space` 发送；应用 workflow、runtime schema validator 和回归测试已同步，未新增第三方节点依赖。

### GGUF variant follow-up (2026-09-21)

- [x] 新增独立 `qwen-image-2-1-uncensored-gguf` capability/adapter/catalog entry；官方 2.1 仍按最高能力排在第一，GGUF 变体紧随其后，不修改 2511 或官方 2.1 的持久化 ID。
- [x] 内置 `qwen_image_2_1_uncensored_gguf_image_edit_api.json`，模型节点使用维护版 `UnetLoaderGGUF`；无参考图由同一 builder 生成 T2I，有参考图复用 2.1 的最多 10 个 `<imageN>` 输入、尺寸比例和 Paint guide 路径。
- [x] `comfyui-gguf` 改为维护中的 `leejet/ComfyUI-GGUF` fork；安装器沿用现有节点依赖事务，会按其 `requirements.txt` 安装 `gguf>=0.13.0`、`sentencepiece`、`protobuf`，不下载模型权重。
- [x] GGUF 目录登记 Q4_0/Q4_K_M/Q5_K_M/Q6_K，默认 Q4_K_M；Q8_0 按模型卡当前的 ComfyUI tensor-shape mismatch 说明不列入可选文件。官方 Qwen 2.1 节点仍由 ComfyUI 核心提供，GGUF loader 才需要上述 custom node。
- [~] 尚未在真实 ComfyUI + RTX 4090 上加载 GGUF 权重生成；当前证据仍为 catalog/依赖安装模拟、workflow/runtime schema、prompt 路由和类型检查。

本轮没有新增 npm/Python 运行时依赖，也没有下载、覆盖或提交模型权重。内置文件是纯 ComfyUI `/prompt` API 图：`workflows/qwen_image_2_1_image_edit_api.json`；实际运行仍要求用户的 ComfyUI 核心已包含 `TextEncodeQwenImage21` 与 `QwenImage21Cache`，并自行准备三类 2.1 权重。

## 1. 调查结论

### 1.1 2.1 不是 2511 的文件名升级

现有 2511 adapter 的关键契约是 `TextEncodeQwenImageEditPlus`、`FluxKontextMultiReferenceLatentMethod`、`ModelSamplingAuraFlow`、`CFGNorm`、自有 GPU-VAE wrapper，最多 3 张图。2.1 的官方 ComfyUI 实现改变了条件编码和采样图：

- 单流 DiT + block-causal attention；Qwen3-VL 8B 作为条件 encoder；新的 RGBA VAE。
- 新节点 `TextEncodeQwenImage21` 负责 prompt、negative prompt、参考图和 reference-grid latent；新节点 `QwenImage21Cache` 位于模型加载和采样之间，用于前缀 K/V cache 的设备/精度策略。
- 官方编辑模板预留 `image_1` 到 `image_10`，示例 prompt 使用 `<image1>`、`<image2>`；`image_1` 是编辑目标，后续图是参考图。模板还出现 `image_11`、`image_12` 空槽，产品首期仍以官方明确支持的 10 张为上限。
- 官方模板默认 INT8 ConvRot DiT、INT8 ConvRot Qwen3-VL encoder、BF16 VAE，25 步、CFG 1、Euler/Simple；官方 Diffusers 文档将约 40 步、无 guidance 作为推荐默认。首期应把 25 步作为预览档、40 步作为质量档，不加入未验证的 Lightning LoRA。
- 2.1 的普通路径不依赖 FlexAttention；ComfyUI PR 说明其实现也可使用 INT8 attention。应用不应把 FlexAttention/torch.compile 作为 4090 的硬前置条件。

官方 ComfyUI 支持在 2026-09-19 合并到 master，时间非常接近本任务日期；因此不能只按“ComfyUI 已支持”判断产品可用，必须在用户配置的实际 ComfyUI 上读取 `/object_info`、校验输入枚举并做真实生成。

### 1.2 依赖与权重

首期 catalog 应把 2.1 组件分开登记，避免 2511 的同名家族被误判为完整：

| 组件 | 目录 | 首期候选文件 | 说明 |
| --- | --- | --- | --- |
| Diffusion model | `models/diffusion_models` | `qwen_image_2.1_int8_convrot.safetensors` | 4090 首选；BF16 只作为实验/对照 |
| Text encoder | `models/text_encoders` | `qwen3vl_8b_int8_convrot.safetensors` | 与 2511 的 `qwen_2.5_vl_7b_fp8_scaled` 不可互换 |
| VAE | `models/vae` | `qwen_image_2.1_vae_bf16.safetensors` | RGBA/新 VAE；不能复用旧 `qwen_image_vae.safetensors` 作为默认假设 |

2.1 首期不依赖现有 2511 的 `LocalVideoStudioRequireGpuVAE`、`FluxKontext*` 或 `inpaint-cropandstitch` 节点。需要先确认官方 `VAELoader`/`VAEDecode` 在实际运行时能保持 CUDA；如果无法从 schema/遥测证明 GPU VAE，再设计通用 wrapper，不能直接把旧 wrapper 接到新 VAE 上。

依赖状态应分成四个独立事实：文件存在、文件被正确检测、核心节点在 `/object_info` 存在且 schema 匹配、真实生成成功。模型文件仍由用户管理，计划不授权静默下载/覆盖；正式实现前还要从模型卡确认权重许可证和再分发边界。

### 1.3 RTX 4090 评估

结论是“适合做首期目标硬件，但需要量化、单 heavy stage 和测量门槛”，不是“所有 2.1 模式都能稳定跑”。建议基线：

- DiT/encoder 使用官方 INT8 ConvRot 版本，VAE 使用 BF16；cache 先用 `auto`，必要时允许 RAM fallback/recompute，但要把 fallback 写入性能诊断。
- 先验证 1024 方图或约 1 MP、1 张目标图；通过后再测 2–3 张参考图、标注引导、2048/4 MP 和 10 张参考图。
- 继续禁止 `--cpu-vae`，不允许 CUDA VAE 失败后静默切 CPU。沿用“一次只运行一个 heavy GPU stage”的队列策略。
- 每个 smoke 记录：ComfyUI 路径/版本或 commit、节点 schema、三类权重文件名、输入尺寸和数量、标注图数量、steps/CFG/sampler/seed、总耗时/每步耗时、峰值专用显存、共享显存、系统 RAM/commit/page activity、cache 位置、输出文件和警告。

可接受的首期判定是：1024/1 MP + 1 张目标图在 4090 上稳定完成且没有 CPU-VAE fallback；2K、多参考和标注只在测量后决定默认是否开放。不能用静态文件大小或“模型能被加载”替代显存证据。

### 1.4 Paint/标注和 Mask 的复用边界

当前 `src/image-markup-editor.ts` 已经把“画笔/框/椭圆/箭头/文字/说明”保存为独立文档，并生成带标注的 PNG；干净源图不被修改。`src/core/image-workflow/shared.ts` 的现有编译逻辑会：

1. 保留干净源图作为一个输入；
2. 有标注时附加一张标注预览作为临时视觉参考；
3. 把标注说明和“不要把框线/箭头/文字带入输出”的规则追加到 prompt；
4. 把每个标注源图占用的额外输入计入上限。

这套数据流适合迁移到 2.1，但有两个必须修正的硬点：

- `imageReferenceInputs` 仍直接引用 `qwenImageEdit2511Capability.maxPictures`，不能让 2.1 复用这个 3 张上限；应改成由 adapter/编译结果提供连续运行时槽位。
- Create 页的 `markupGuideCount` 仍按 `draft.modelId === "qwen-image-edit-2511"` 判断；应改成 capability/adapter 的 `supportsMarkup` 或显式的“每个源图是否需要 guide slot”策略。2.1 的 10 个模型输入包含标注 guide，10 张源图不等于还能再放 10 张 guide；全部标注时理论上最多 5 个源图，实际还要为目标图和参考关系留安全空间。

真正的 `Mask` 仍是 `ImageMaskData` 的二进制区域图，不能因为 2.1 有 RGBA VAE 就把它接入。首期 `supportsMarkup=true`、`supportsMask=false`；只有取得官方/实际节点的 mask 语义和局部编辑 smoke 后，才单独评估 2.1 的 Mask 或 Crop/Stitch adapter。

### 1.5 Prompt pack 是否需要更新

需要更新，但不建议直接改写 2511 的持久化默认行为。当前 pack/contract 明确面向 `Qwen-Image-Edit-2511`，并以 `Picture N`、最多 3 张图和 2511 的编辑习惯组织文本；`src/core/image-prompt.ts` 还会把许多未特化模型路由到这个 contract。

2.1 pack 应至少包含：

- 显式区分 `<image1>` 编辑目标与 `<image2>`…`<image10>` 参考素材；编译器仍可接受用户输入的 `Picture 1`、`image1`、中文“图片 1”，但送给 2.1 的 prompt 应统一为 `<imageN>`。
- 保留身份、数量、位置、可见文字、未标注区域和禁止引入标注图形等规则；不要把 2511 的“通用高质量”或负面提示自动塞入 2.1。
- CFG 1 默认不启用 negative prompt；如果以后开放负面提示，必须显式提高 CFG 并在质量档/性能说明中标出额外计算成本。
- 透明背景先作为有条件的 preset/snippet，不要对所有编辑 prompt 自动追加 RGBA 指令。只有输出通道 smoke 确认存在 alpha，并且 UI 有明确“透明背景”意图后，才将其做成正式能力。
- 新建 `src/core/prompts/qwen-image-2-1/` pack 和各 locale 索引，复用共享规则 helper；保留 `qwen-image-edit` 以保证旧草稿、prompt version 和历史重跑语义不变。

## 2. 推荐产品设计

### 2.1 Capability 与 adapter

建议新增：

- capability ID：`qwen-image-2-1`；名称显示 `Qwen Image 2.1`；`operation: "edit"`；`maxPictures: 10`、`supportedFormats: ["png"]`、`supportsMarkup: true`、`supportsMask: false`、`supportsTextOnly: true`、`textOnlyOutputWidth/Height: 1024`、`supportsSeed: true`。
- 质量档：`preview-25`（25 steps, CFG 1）和 `native-40`（40 steps, CFG 1）。是否新增 50 步档由真实质量/耗时对照决定；无官方 2.1 Lightning 证据前不复制 2511 的 `lightning-4step`。
- 新 adapter 只复用 `ImageModelAdapter` 接口、公共 prompt/reference compiler、queue/history/scan 框架；不复用 2511 的 workflow builder、required node list、AuraFlow shift、CFGNorm、FluxKontext latent method 或旧 VAE wrapper。

### 2.2 API graph 方向

以官方 ComfyUI 2.1 编辑模板为参考，但最终以实际 `/object_info` 和 API workflow 为准：

1. `UNETLoader` 加载 2.1 DiT；`CLIPLoader` 使用 `type: qwen_image` 加载 Qwen3-VL 8B；`VAELoader` 加载 2.1 VAE。
2. 为目标图和参考图创建 `LoadImage` 节点，目标是运行时 `image_1`；后续按连续槽位连接 `image_2`…`image_10`。Paint guide 如果启用，必须在编译时作为额外、可追踪的槽位，不改变用户可见 Picture 的主编号。
3. `TextEncodeQwenImage21` 接收 CLIP、VAE、prompt/negative prompt、resolution 和参考图，输出 positive、negative 以及 reference-grid latent；参考图 latent 的尺寸必须按官方节点约束处理，不能沿用 2511 的 VAEEncode/FluxKontext 连接。
4. `QwenImage21Cache` 连接在模型和 KSampler 之间，缓存 device/dtype 先用官方默认/auto；KSampler 使用 Euler/Simple、CFG 1、denoise 1，避免无依据地加入 `ModelSamplingAuraFlow` 或 `CFGNorm`。
5. 先用 `SaveImage` 或经 schema 验证的 `SaveImageAdvanced` 输出 PNG；如果要宣称透明背景，必须对实际输出逐文件检查 alpha channel，不能仅凭“RGBA VAE”命名推断。

`validateWorkflow` 必须检查节点类、占位符、参考槽位、模型文件名、CFG/quality profile 和输出节点；`validateRuntimeSchema` 必须检查新节点的真实输入名、枚举、可选图槽位以及 `CLIPLoader` 的 Qwen 类型。UI 工作流模板和 API payload 要分开，不能把 subgraph/editor 元数据直接当成 queue API 图。

### 2.3 Queue、历史与透明输出

- 每次入队继续冻结完整执行快照：模型 ID、权重文件名、参考图顺序/角色、展开后的 prompt、quality profile、steps/CFG、尺寸、seed、PNG 格式、cache/device 策略和标注 guide 映射。
- 首期强制单输出或显式限制 batch，避免 4090 上的隐式 batch 把“模型支持 10 张参考图”和“同时生成 6 张结果”叠加成不可控显存峰值。
- 当前 queue/history 已以 PNG 为实际图片格式；这正好适合透明候选，但目前没有独立 alpha 元数据。2.1 通过 smoke 后，如 alpha 确实成立，再增加 `hasAlpha`/透明背景意图等可重建字段；没有验证时只记录 PNG，不宣称透明输出。
- 历史详情要显示 2.1 版本、参考槽位映射、是否使用 Paint guide、cache/fallback 和实际输出通道，保证父项目导航和重跑仍可用。

## 3. 分阶段实施计划

### WP0 — 运行环境与证据锁定

- 读取用户当前 ComfyUI 实际路径、版本/commit、`/object_info`、model directories 和 2511 baseline；不自动更新 ComfyUI。
- 确认 `TextEncodeQwenImage21`、`QwenImage21Cache`、Qwen `CLIPLoader` 类型和保存节点真实 schema；若缺失，先给出“需要更新 ComfyUI 核心”的可操作状态。
- 记录 4090 空闲显存、当前启动参数、共享显存/RAM 采样方式和可用隔离测试目录。

### WP1 — Catalog、扫描和 Settings 依赖状态

- 新增 2.1 独立 catalog entry、promptPackId、10 张参考图能力、2.1 三类权重和运行时 node types。
- 把 2511、2.1 的 diffusion/encoder/VAE 文件严格分开；缺任一必需组件时显示缺失组件，不显示“可运行”。
- 对核心版本采用“节点/ schema feature gate”而非臆造固定版本号；如应用已有 Comfy revision 证据字段，再补最低 commit/版本提示。
- 明确 2.1 不需要现有 2511 custom node；文档说明模型由用户管理，安装器不能静默下载权重。与当前未提交的依赖扫描/Settings 修改发生重叠时，先协调并保留已有改动。

### WP2 — 新 adapter 与 API workflow

- 新建 `qwen-image-2-1.ts/js`、capability、required node list、registry 条目和解析/验证测试。
- 把公共 `compileImagePromptWithLimit`、`imageReferenceInputs` 改为参数化的 model slot strategy；不再硬编码 2511 的 3 张上限。
- 实现目标图/参考图/guide 的连续槽位映射、`<imageN>` 编译、尺寸/分辨率约束和新 latent 连接。
- 暂不实现 Mask/Crop-Stitch/Lightning；将这些能力保持为明确的未支持状态，而不是生成一张看似成功但语义错误的图。

### WP3 — Create 页与 Paint 接入

- 将 slot 上限从 3 扩展到 capability 提供的 10，并确认添加/删除/拖拽/排序/草稿持久化不会破坏已有 Picture 编号和队列快照。
- 以 `supportsMarkup`/slot strategy 驱动标注 guide 计数，显示“模型输入数”与“用户 Picture 数”的区别；guide 超限时在入队前阻断并说明原因。
- 复用现有 Paint 编辑器、sidecar、预览和说明；2.1 初期隐藏或禁用 Mask 按钮，避免用户以为能做精确局部重绘。
- UI 分辨率先暴露 source/1024/1536/2048 等实际有证据的范围；2K/4 MP 只有在 4090 smoke 后再从 experimental 提升。

### WP4 — 2.1 Prompt pack 与增强路由

- 新增 `qwen-image-2-1` 的中英文/繁中 pack、稳定 preset ID 和版本化 contract。
- 让 prompt enhance 根据 `draft.modelId` 选择 2511 或 2.1 contract；不要让 2.1 落入当前“所有未知图片模型都用 2511”分支。
- 加入 `<imageN>`、target/reference 角色、Paint guide 和可选透明背景说明的测试；保留已有 2511 prompt fixture 和历史 prompt version。

### WP5 — Queue/history/运行时策略

- 新增 2.1 runtime profile：INT8 权重、GPU VAE、cache auto/RAM fallback 诊断、单 heavy stage 和 4090 safety reserve。
- 在 enqueue 前验证 10 槽位、guide 映射、PNG、单输出策略和新组件；在 executor 里保留不可变 task snapshot。
- 记录实际输出格式、alpha 检测结果、cache/fallback、性能和 warnings；取消、重启、ComfyUI 重启、失败重试不改变任务/历史 ID。

### WP6 — 验证与质量对照

- 静态/逻辑：adapter、prompt compiler、slot/guide limit、catalog detection、runtime schema、queue/history serialization、2511 regression。
- 真实 4090 smoke 最少覆盖：
  - 1024/约 1 MP + 1 张目标图；
  - 2–3 张参考图且 prompt 明确引用 `<image1>`/`<image2>`；
  - Paint guide；
  - 2K/低参考数；
  - 10 张参考图作为压力样本；
  - 透明背景意图并检查实际 alpha；
  - cancel/restart/failure/history rerun。
- 用固定输入、seed、尺寸和任务描述做 2511/2.1 A/B，记录编辑遵循度、文字/身份保留、未编辑区域保持、标注去除、边缘/透明质量、耗时和显存；“更强”必须有样本证据，不由模型名称推断。

## 4. 验收门槛

按 `docs/WORKFLOW_CONTRACT.md` 分级关闭，不把“文件存在”写成“已接入”：

1. Catalogued：模型、组件、节点、prompt pack、能力和版本说明完整。
2. Detected：离线扫描能区分 2.1 三类权重和缺失项；在线 `/object_info` 能确认节点/枚举。
3. Runtime validated：实际 ComfyUI 可加载模型且 GPU VAE/cache 策略有证据。
4. Workflow constructed：API 图含正确 target/reference/guide 槽位，无 2511 专用节点误接，无 unresolved placeholders。
5. Smoke passed：4090 基线、PNG、取消/重启、历史和至少一项 Paint guide 真实通过；显存/RAM/耗时证据入档。
6. Product integrated：Create/Settings/Queue/History/Prompt enhance 一致，2511 regression 通过，2.1 未验证的 Mask/透明/2K/10-ref 能力不会被 UI 误标为稳定支持。

代码验证要求：相关 Vitest、`npm.cmd run typecheck`，共享 workflow/renderer/依赖路径变更后执行 `npm.cmd run verify`；真实 ComfyUI/GPU smoke 不能用静态测试替代。实现结束时检查 scoped diff 和意外删除，不生成权重、媒体、机器路径或临时日志进仓库。

## 5. 风险与待决策

- ComfyUI 2.1 支持刚合入 master，Desktop/Portable/stable 渠道可能滞后；首期应按 feature probe 锁定实际能力，必要时给用户明确“更新 ComfyUI 核心”提示。
- 官方模板的 10 个输入包含 reference image slots，不等于 10 张普通图再加任意数量 Paint guide；需要以真实 schema 和显存测试决定 UI 的默认安全上限。
- RGBA VAE 不自动等于最终 PNG 带 alpha；透明输出要通过像素通道检查后才能成为 capability。
- 2.1 官方路径没有已确认的 Mask 输入；“Paint 标注”与“Mask 局部重绘”必须在 UI、prompt 和 adapter 层继续分开。
- 需要在实现前确认 Qwen Image 2.1 权重 license、模型下载来源、是否允许随安装包分发；默认按用户自备权重处理。
- 当前任务不替换 2511、不迁移旧草稿的 model ID、不改已排队快照；任何“将 2.1 设为默认模型”的决定应另行确认并做默认值迁移评估。

## 6. 资料与仓库证据

外部资料以 2026-09-21 为准；官方页面/模板可能在模型发布初期继续变化。

- [ComfyUI PR #16400：Qwen-image 2.1 support](https://github.com/Comfy-Org/ComfyUI/pull/16400)：2026-09-19 合并；记录单流 DiT、RGBA VAE、Qwen3-VL 8B、`TextEncodeQwenImage21`、`QwenImage21Cache`、cache 与不依赖 FlexAttention 的实现方向。
- [官方 ComfyUI Qwen Image 2.1 image-edit template](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json)：记录 10 个参考槽位、`<image1>`…`<image10>`、INT8/BF16 文件名、25 步/CFG 1、PNG 保存和 2K/尺寸说明。
- [官方 ComfyUI Qwen Image 2.1 T2I template](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_t2i.json)：确认无 `LoadImage`、`QwenImage21Cache` 或 `ComfySwitchNode` 的原生文生图图结构；应用在同一 adapter 内按参考图是否存在选择该图。
- [Diffusers Qwen-Image 2.1 pipeline 文档](https://huggingface.co/docs/diffusers/main/api/pipelines/qwenimage21)：记录 Qwen3-VL 条件编码、single-stream block-causal transformer、多图顺序、约 40 步/无 guidance 默认、KV cache 和 FlexAttention 的可选性质；仅作为模型语义参考，不改变本项目的 ComfyUI 执行架构。
- [仓库工作流契约](../../WORKFLOW_CONTRACT.md)、[依赖与安装契约](../../DEPENDENCIES_AND_SETUP.md)、[Prompt Pack 设计](../../PROMPT_PACK_DESIGN.md)：规定 catalog/runtime/真实生成分级、Qwen GPU-VAE 约束、用户管理权重、prompt pack 版本化和真实 smoke 证据要求。
- 关键现状文件：`src/core/image-workflow/qwen.ts`、`src/core/image-workflow/shared.ts`、`src/core/image-workflow/capabilities.ts`、`src/core/image-workflow/registry.ts`、`src/core/catalog/models/image.ts`、`src/core/prompts/qwen-image-edit/`、`src/renderer/pages/create/view-model.ts`、`electron/queue-enqueue.ts`、`electron/queue-history.ts`、`src/image-markup-editor.ts`。

## Evidence / handoff

- 已实现的本地证据：独立 2.1 capability/adapter/registry；官方 T2I/编辑节点图和 `/object_info` dotted autogrow 输入兼容；无参考图 T2I、10 个 `<imageN>` 槽位及 Paint guide 映射；无参考图的比例/分辨率选择会落到 T2I `EmptyLatentImage`，有参考图改尺寸会启用官方 `custom_size` switch 并以 32 倍数构造编辑 canvas；独立 prompt pack；catalog/Settings/依赖扫描；内置 workflow 与 provenance；2511 路径保持独立。
- 已执行：`npm.cmd test:all`（182 个测试文件、unit/integration 共 1712 个测试通过）、`npm.cmd run verify`（含构建与 UI 对比度检查通过）、`npm.cmd run typecheck`、目标 workflow/prompt/catalog 测试和 `git diff --check`。
- 尚未完成：没有启动用户机器上的 ComfyUI、没有下载/加载 2.1 权重、没有做 4090 显存/质量 smoke，也没有确认模型 license。上述事项必须在 WP0/WP6 完成后，才能把状态从“静态产品接入”提升为“runtime validated/product integrated”。
