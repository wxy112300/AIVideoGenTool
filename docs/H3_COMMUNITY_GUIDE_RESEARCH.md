# MiniMax H3 社区部署资料研究

## 资料来源

本文主要整理以下社区文章，并与 MiniMax、Comfy-Org 的公开资料交叉核对：

- 原文：[MiniMax H3 本地部署保姆级教程：从零装机到写出专业提示词，附实测数据](https://x.com/servasyy_ai/status/2085251627880255525)
- 本项目整理的提示词指南：[H3_PROMPT_WRITING_GUIDE.md](H3_PROMPT_WRITING_GUIDE.md)
- 官方模型说明：[MiniMaxAI/MiniMax-H3](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- ComfyUI 重打包模型：[Comfy-Org/MiniMax-H3](https://huggingface.co/Comfy-Org/MiniMax-H3)
- 官方基础提示词指南：[VIDEO_PROMPT_WRITING_GUIDE_base_en.md](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- 官方 R2V 提示词指南：[VIDEO_PROMPT_WRITING_GUIDE_ref_en.md](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)
- 官方 ComfyUI 教程：[MiniMax H3](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)
- 社区 Prompt Writer：[duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer)

原文是社区实践资料，不是 MiniMax 官方文档。文章发表于 2026-08-06，实测环境写明为 RTX 4090 48GB 魔改卡、ComfyUI 0.30.0、Torch 2.11 + CUDA 12.8。文章中的耗时、显存和 Cache 加速比例不能直接当作普通 RTX 4090 24GB 的保证。

## 1. H3 的模块边界

官方资料把完整 H3 系统分成三个模块：

| 模块 | 是否开源 | 作用 |
| --- | --- | --- |
| H3-Context-IR | 否，主要通过 API 提供 | 理解文字、图片、视频、音频之间的关系，并把自然语言整理成 H3 Context-IR |
| H3-Base | 是 | 生成 768p 级别的同步视频和立体声音频 |
| H3-Regenerate-2K | 否，主要通过 API 提供 | 使用 768p 结果和原始上下文重新生成 2K |

本地 ComfyUI 主要运行 H3-Base。当前应用使用本地 Qwen3.5、Gemma Prompt Writer 或可选的 Qwen3.6 GGUF 作为提示词扩写器，是对闭源 Context-IR 的本地替代，不等同于官方 Context-IR。Qwen3.6 通过 ComfyUI MultiModal Prompt Nodes 运行，不再需要独立的 LM Studio 或 llama-server。

## 2. 消费级模型选择

原文根据 Hugging Face 文件大小整理了以下大致档位：

| 组件 | 版本 | 约文件大小 | 适合用途 |
| --- | --- | ---: | --- |
| H3 DiT | `fl2va_pruned_int8_convrot` | 19.5 GB | T2V/I2V，消费级推理首选 |
| H3 DiT | `fl2va_int8_convrot` | 31.7 GB | 完整 INT8，质量和兼容性实验 |
| H3 DiT | `fl2va_bf16` | 61.7 GB | 全精度、研究和微调，不适合作为 24GB 默认 |
| H3 文本编码器 | `qwen3vl_32b_minimax_h3_nvfp4_awq` | 14.6 GB | 消费级显存优先 |
| H3 文本编码器 | `qwen3vl_32b_minimax_h3_int8_convrot` | 25.3 GB | 更接近完整精度的实验 |
| H3 文本编码器 | `qwen3vl_32b_minimax_h3_bf16` | 48.0 GB | 全精度研究 |

当前项目使用：

- `minimax_h3_fl2va_pruned_int8_convrot.safetensors`
- `minimax_h3_ref2va_pruned_int8_convrot.safetensors`
- `qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`
- 官方视频 VAE 和音频 VAE

提示词扩写另有一个可选的 Uncensored 档位：Qwen3.6 27B Q4 GGUF + `mmproj`。它不兼容 ComfyUI 原生 `text_encoders`/`TextGenerate`，应用会通过所选 ComfyUI 的 `VisionLLMNode` 运行，不依赖 LM Studio 或 llama-server；设置、扫描、启动、队列前释放和退出清理均沿用 ComfyUI 单运行时策略。4090 使用普通 Q4_K_M（不选 MTP）和 8K 上下文，提示词完成后卸载，避免与 H3 共占显存。

这个组合的原因是 4090 24GB 需要分层加载和卸载。`pruned` 主要面向推理，去除了可以预计算/缓存的 AdaLN 分支；完整 BF16 或完整 INT8 不是不能通过 CPU/RAM offload 启动，但不适合当前默认路径。

原文还提醒：NVFP4 在 RTX 50 系列上有原生硬件支持，RTX 30/40 系列可能需要模拟或转换路径。因此 NVFP4 对 4090 的主要价值是减少模型存储和驻留压力，不应直接承诺等比例提速。

DiT 和文本编码器可以按显存更换，但两个官方 VAE 不应随意换成社区量化版本，以免同时损失画面重建和音频质量。

## 3. 硬件和 H3 硬规则

文章和官方节点资料共同强调：

- H3 输出为原生 24 FPS。
- 帧数遵循 `17k+5` 网格，ComfyUI 会把不合法帧数向上吸附。
- 官方本地 Base 训练/验证范围约为 124-362 帧，即约 5.17-15.08 秒；更短帧数可以运行，但不在主要训练分布内。
- 短边通常为 768，面积上限约为 `768 x 1344`，宽高对齐到 32 的倍数。
- 12GB 显存需要更多系统内存和 offload；文章把 32GB RAM 视为底线、64GB 更从容，并强调 NVMe 会显著影响首轮加载。
- 文章的 4090 数据来自 48GB 魔改卡，不能直接代表普通 24GB 4090。

当前应用已经实现 24 FPS、帧数网格、15 秒上限、32 像素对齐、阶段卸载和显存安全提示。应用允许低于官方主要训练范围的短片作为实验，但不应把它们当作质量保证。

## 4. 官方提示词规则

T2VA/I2VA/FL2VA/L2VA 使用三个核心字段：

```text
integrated_multimodal_description:

overall_soundscape:

non_diegetic_music:
```

- `integrated_multimodal_description`：按时间线描述风格、构图、动作、镜头、对白、歌唱和画内声音。
- `overall_soundscape`：用 1-4 句概括全片环境声、动作声和非语言人声；不重复对白、歌唱或画内音乐。
- `non_diegetic_music`：用 1-3 句描述角色听不到、只有观众听到的配乐；写乐器、速度、节奏和动态变化，不用抽象情绪词。

首尾帧任务还必须在第一行写官方对齐句，后面空一行再写三个字段。后续镜头从 `[Shot 2] At 00:03.500, ...` 开始，`[Shot 1]` 不带时间戳。

当前项目已把基础指南固化到 [src/core/h3-official-spec.ts](../src/core/h3-official-spec.ts)，并在 [src/core/h3-prompt.ts](../src/core/h3-prompt.ts) 提供 T2VA、I2VA、FL2VA、L2VA 模板。

## 5. R2V 的新发现

官方 R2V 指南比普通三字段格式更严格，包含六段：

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

四种标签的职责不同：

| 标签 | 官方语义 |
| --- | --- |
| `<Subject N>` | 真正要在目标视频中复用的人、物、场景、服装、风格、动作或姿态 |
| `<Picture N>` | 图片本身作为首帧、尾帧、关键帧或构图锚点 |
| `<Video N>` | 原视频的剪辑、节奏、镜头结构、编辑来源或续写来源 |
| `<Audio N>` | 复制音频、参考音色、对白、歌词、节奏或声音纹理 |

如果一张图片只是用来定义人物、场景或风格，不应该自动创建独立的 `<Picture N>`；应在 `<Subject N>` 中说明该 Subject 来自哪张图片。只有图片本身作为具体画面锚点时，才使用 `<Picture N>`。

`summary` 应以任务类型开头，例如：

```text
[reference generation] ...
[video editing + reference generation + audio reuse] ...
```

`retention_analysis` 应使用固定关系词：

- 视觉内容：`fully_preserved`、`partially_preserved`、`attribute_transfer`、`weak_reference`
- 音频内容：`fully_copy`、`partially_copy`、`reference`、`weak_reference`

R2V 的 `detailed_description` 通常需要 350-500 个英文单词，并且要在首次出现时使用 Subject、Picture、Video、Audio 标签。

当前应用已经有 R2V 六段结构、Slot 和标签编号；模板现在会根据参考作用区分可复用内容的 `<Subject N>` 和具体帧/构图锚点 `<Picture N>`，并在检查器中提示任务类型前缀和 retention 关系词。独立 Audio Slot 尚未接入界面，`detailed_description` 的 350-500 词目标也暂未强制。

## 6. 加速资料

原文给出的加速路线分两层：

### SageAttention

文章在 48GB 4090 环境报告约 22-24% 的实测节省。当前项目已经通过 KJNodes 的 `PathchSageAttentionKJ` 接入 SageAttention，并保留 PyTorch 兼容模式。

### Cache

文章报告的单次实验数据为：

- SageAttention：约 1183.6 秒
- Sage + EasyCache：约 899.5 秒
- Sage + TeaCache：约 500.5 秒

这些数字来自 48GB 4090、长视频和特定参数，不是普通 24GB 4090 的保证。

EasyCache 是 ComfyUI 内置节点，输出相对更保守；TeaCache 提速更大，但会改变生成结果，可能增加静止帧、降低细节和运动活性。因此当前决策是：

- 标准质量：继续使用 SageAttention。
- 草稿模式：可以研究 Sage + EasyCache 的可选档位。
- TeaCache：不作为默认正片加速。
- Sol-Attn、Turbo LoRA、Cache：分开 A/B，不同时引入多个近似变量。

## 7. 对本项目的决策

已经采纳：

- 使用 pruned INT8 DiT、NVFP4 Qwen3-VL 和官方双 VAE 的消费级组合。
- 以官方提示词指南为基础内置 H3 结构和检查器。
- 保留 SageAttention 和 PyTorch fallback。
- 使用 24 FPS、`17k+5` 帧网格和分阶段显存卸载。

建议后续按以下顺序推进：

1. 先修正 R2V 的 `<Subject N>`、`<Picture N>`、`<Video N>`、`<Audio N>` 语义和固定关系词。
2. 为草稿生成增加可选 EasyCache，并用固定 seed 做画面、动作和音频 A/B。
3. 再单独验证 Sol-Attn，确认 RTX 4090 的 SM89 Triton 路径是否真的命中，而不是自动回退 Sage。
4. Turbo LoRA 与 Cache/Sol-Attn 分开测试，确认音频和快速运动没有回归后再考虑组合。

本资料只记录研究结论，不改变当前默认工作流、默认模型或默认质量档位。

## 8. 社区多模态 Prompt Writer 融合

社区项目 `ComfyUI-MiniMaxH3-Prompt-Writer` 是独立的 ComfyUI UI 扩展，不是工作流节点。另一个可直接接入的节点包是 [`ComfyUI-MultiModal-Prompt-Nodes`](https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes)，提供 `VisionLLMNode`，可在同一个 ComfyUI Python 环境中加载 Qwen3.6 GGUF + `mmproj` 并接收图片。Civitai 的 [`MiniMaxH3 Auto Prompter`](https://civitai.com/models/2834106/minimaxh3-auto-prompter) 是工作流方案，不是模型；由于下载文件需要登录，项目没有直接复制其 JSON，而是吸收其提示词结构。当前项目统一通过独立的 core 提示词模块向不同后端发送同一份 H3 合同：

- 优先级固定为用户明确要求 → 用户分配的参考角色 → 预设和默认值；
- 参考素材是事实边界，不能凭空增加动作、表情、道具、地点、对白、文字、镜头或音乐；
- motion-only 视频只提供动作、时序、节奏，不携带人物身份、服装、环境、灯光或音轨；
- contact sheet、抽帧格子和内部采样时间只用于模型观察，不能出现在最终 Prompt 或被拆成目标镜头；
- 未明确要求配乐时 `non_diegetic_music` 保持 `N/A`；视觉模型不能听音频时，只能根据用户声明决定 Audio 的复制/参考关系；
- 生成结果继续由本地 H3 检查器验证字段顺序、超时长时间戳、说话人 ID 和内部分析信息泄露。
- R2V 额外要求 `subject_definitions` → `summary` → `retention_analysis` → `detailed_description` → 音频字段；用 retention/attribute-transfer 关系描述参考如何保留或迁移，避免把参考图说明重复成静态清单。
- I2VA/FL2VA/L2VA 保留官方对齐行，把运动和镜头变化写进 `integrated_multimodal_description`，不把参考图或 contact sheet 当成最终镜头。

模型支持采取扩展而非替换策略：ComfyUI 原生 Qwen3.5、Gemma Prompt Writer 和 Qwen3.6 MultiModal 继续保留。Qwen3.6 使用 `DavidAU/Qwen3.6-27B-Fable-Fusion-711-Uncensored-Heretic-NM-DAU-NEO-MAX-MTP-GGUF` 的普通 `Q4_K_M` 文件和同目录 `mmproj-BF16.gguf`；MTP 变体不纳入默认目录。节点依赖安装到当前 ComfyUI 的 Python，运行时选择 GPU，扩写后 `/free`，再开始 H3。

### 8.1 已下载的 `minimaxh3Auto_v5.json` 对照

用户提供的 `minimaxh3Auto_v5.json` 是 ComfyUI **画布格式**（63 个节点、`version: 0.4`），不是可以直接提交到 `/prompt` 的 API workflow。因此没有把它原样放进生产目录：其中包含本机输入文件名、示例内容、旧模型路径和多组 UI bypass/预览节点，直接复用会把机器状态和第三方节点耦合进 Local Video Studio。

从该文件吸收并落实到 `src/core/h3-auto-prompter.ts` 的规则包括：

- T2VA/I2VA/L2VA 的三字段输出和精确首尾帧对齐行；FL2VA 的开头/结尾帧连续桥接；
- 图片版 REF2V/R2V 的六段顺序：`subject_definitions` → `summary` → `retention_analysis` → `detailed_description` → 音频字段；
- `<Subject N>`、`<Picture N>`、`<Video N>`、`<Audio N>` 的职责边界，以及图片作为身份来源时不额外创建 Picture 标签的规则；
- summary 的任务关系前缀（`keyframe completion`、`reference generation`、`video editing`、`video continuation`、`audio reuse`、`audio reference`）；
- 视觉关系词 `fully_preserved` / `partially_preserved` / `attribute_transfer` / `weak_reference` 与音频关系词 `fully_copy` / `partially_copy` / `reference` / `weak_reference`；
- 稳定说话人 ID、`<d>[Language] ...</d>`、`<scenetrans>`、`<cutoff>` 和音频分层规则；
- R2V 典型生成任务约 350–500 个有依据的英文单词，但禁止为凑字数发明参考图中不存在的内容。

该 workflow 使用的 `LLMTextProcessor`、`AILab_ImageCompare`、`LoadVideoUI`、`VHS_LoadAudioUpload` 以及 rgthree bypass 组件，是它自己的 ComfyUI 方案。当前应用选择 `VisionLLMNode` + Qwen3.6 Q4 的解耦路径：图片直接交给多模态节点；视频/音频若当前后端无法读取，则只使用用户在参考角色中声明的描述，不伪造“已听到/已分析”的内容。这样保留了 Auto Prompter 的提示词质量逻辑，同时不把整套旧节点和旧模型锁死到 4090 默认运行路径。

## 9. 2026-08-13 低显存社区方案更新

本节专门区分“checkpoint 文件大小”和“完整生成峰值显存”。两者不能互换。

### 9.1 RTX 3080 10GB 实验档

当前最适合 3080 方向的是社区 `Unsloth/MiniMax-H3-GGUF` 的 Q3 GGUF 路线：

- `minimax_h3_fl2va_pruned-Q3_K.gguf` 约 8.16 GiB；
- 配套 `qwen3vl_32b_minimax_h3-Q2_K_M.gguf` 约 12.20 GiB；
- 文本编码器应放 CPU，扩散模型使用 CPU/RAM offload；
- 只先支持 FL2VA 普通图生视频，不把它扩展到 R2V 或视频续写；
- 3080 产品基线锁定 480p、124 帧（约 5 秒）和 4–8 steps，默认 8 steps；关闭 Spectrum、LoRA 和实时预览；
- ComfyUI 启动使用 `--lowvram --cpu-vae --disable-smart-memory --disable-pinned-memory --disable-async-offload`，并准备至少 32GB 系统内存，64GB 更稳妥。

该档已作为 `minimax_h3_fl2va_q3_gguf` 接入设置扫描和独立 GGUF workflow，但仍属于社区实验档。主力 H3 的 INT8/INT4/Turbo/R2V 原生路径不依赖这套 GGUF 节点。未完成 RTX 3080 实机端到端 smoke 前，不能把“可扫描/可构图”称为“稳定可用”。

### 9.2 不能当作 3080 方案的档位

- 社区 `DmitryDB/MiniMax-H3-ComfyUI-Quants` 的 `NVFP4` 约 10.862 GiB，是 checkpoint 大小；作者标注为 RTX 50/Blackwell 的 8–12GB 档，并明确没有完成完整 prompt-to-decoded-video 显存测试。
- `Abiray/MiniMax-H3-Pruned-GGUF` 的 Q3 约 8.9GB，但模型卡把它标为约 12GB GPU 起步；不能直接宣称 10GB 稳定。
- LightX2V Turbo 是 4 步 LoRA，减少采样时间而不是按比例减少基础模型和 VAE 的显存占用；当前 v0.1 仍是预览版，只适合 FL2VA 质量/速度实验。

### 9.3 ComfyUI 依赖和风险

Q3 GGUF workflow 使用独立的 `comfyui-gguf-h3` 节点包：它安装在 `ComfyUI-GGUF-H3`，从具备 `minimax_h3` 架构支持的 `molbal/ComfyUI-GGUF` fork 提取 loader，并注册 `H3UnetLoaderGGUFAdvanced` 与 `H3CLIPLoaderGGUF`。通用 `comfyui-gguf` 仍保留 `city96/ComfyUI-GGUF`，继续服务历史 Wan/Sulphur/Remix GGUF workflow；安装器不会替换它。原 `city96` 主线不能直接加载这份无 metadata 的 Unsloth H3 GGUF。

该 fork 的 README 仍把 `_K` 扩散量化标为实验/非推荐格式，因此“loader 能识别”仍不等于“3080 smoke 已通过”。如果 Q3_K 在目标 ComfyUI 版本上加载慢或失败，应优先准备 Q2_K fallback，而不是放宽分辨率和帧数。最近合并的 H3 修复也应纳入验证基线：

- [H3 音频 VAE 完整卸载修复](https://github.com/Comfy-Org/ComfyUI/pull/15377)；
- [H3 latent noise mask 采样修复](https://github.com/Comfy-Org/ComfyUI/pull/15322)；
- [EasyCache 音频损坏修复](https://github.com/Comfy-Org/ComfyUI/pull/15390)；
- [H3 sampler/audio 修复](https://github.com/Comfy-Org/ComfyUI/pull/15243)。

这里的 H3 mask 修复是视频 latent noise mask，不是图片 Canvas 的 inpaint mask。3080 档验收必须记录 GPU 峰值、共享显存、系统 RAM、页面文件、分辨率、帧数、steps、音频是否正常以及输出是否可播放。

## 10. 社区视觉真实感与快速插入

这次补充了社区作品中反复出现、且适合组合使用的视觉预设。主要参考：

- [Awesome MiniMax H3 Prompts](https://github.com/xianyu110/awesome-minimax-h3-prompts)：区分作者原文与 AI 反推文案；后者只能作为写作参考，不能证明原作者使用过其中的每个词。
- [MiniMax H3 Prompt Writer 使用指南](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/blob/main/docs/USAGE.md)：强调让参考素材承担身份/场景/动作/镜头等明确角色，并把 Creative Brief 当作可编辑起点。

### 社区反复出现的模式

- **UGC / 手机真实感**：`iPhone selfie-vlog`、`handheld`、`natural light`、`slight motion blur`、`not cinematic` 经常成组出现。它们共同表达的是普通手机主摄、自然曝光、轻微手持和不追求棚拍完成度，而不是单个模型魔法词。
- **纪录片 / 消费级设备**：`DV 16mm camcorder`、`imperfect framing`、`delayed focus`、`clumsy zooms`、`analog noise` 用来主动保留真实拍摄缺陷。
- **人像与产品**：`50mm prime lens`、`85mm prime lens`、`telephoto portrait lens`、`macro lens`、`shallow depth of field`、`rack focus` 反复用于控制主体分离、产品细节和焦点转移。
- **真实材质**：比 `8K`、`ultra detailed` 更稳定的写法是 skin pores、fine hair、fabric irregularity、contact shadows、natural reflections、highlight roll-off 等可观察的物理细节。
- **反向约束**：高质量样例常在结尾写 `AVOID`，明确禁止 face changes、wardrobe changes、camera shake、text、watermarks、plastic surfaces 或 CG-rendered look。项目把这些语义转成自然句子，不生成一个独立的负面提示词字段。

目前没有找到可核验的 H3 原始来源证明 `Old iPhone 1x standard lens` 这个完整短语有特殊权重。它可以作为可读的社区风格组合，但应用预设使用更明确的 `older smartphone main camera at 1x`，并同时补充曝光、手持、对焦和后期限制。

### 已接入的预设策略

快速插入新增两组：

- **真实感与材质**：真人实拍、避免 CG/玩偶/塑料感、自然皮肤与材质、自然光与真实曝光。
- **拍摄与设备**：旧手机 1x 真实感、纪录片手持质感。

预设文本保持英文，因为它们直接面向 H3 和 Prompt Writer。三种 UI 语言只翻译分组和标签。点击扩写时，插入文本会随当前 Prompt 原样进入 `User request`；H3 扩写契约会把真人、自然材质、反 CG、反塑料、手机或纪录片拍摄等要求视为硬约束，并要求把它们分配到 style、lighting、camera、materials 和 continuity，而不是丢弃或输出成孤立的预设列表。
