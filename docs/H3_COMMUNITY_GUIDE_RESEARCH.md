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

原文是社区实践资料，不是 MiniMax 官方文档。文章发表于 2026-08-06，实测环境写明为 RTX 4090 48GB 魔改卡、ComfyUI 0.30.0、Torch 2.11 + CUDA 12.8。文章中的耗时、显存和 Cache 加速比例不能直接当作普通 RTX 4090 24GB 的保证。

## 1. H3 的模块边界

官方资料把完整 H3 系统分成三个模块：

| 模块 | 是否开源 | 作用 |
| --- | --- | --- |
| H3-Context-IR | 否，主要通过 API 提供 | 理解文字、图片、视频、音频之间的关系，并把自然语言整理成 H3 Context-IR |
| H3-Base | 是 | 生成 768p 级别的同步视频和立体声音频 |
| H3-Regenerate-2K | 否，主要通过 API 提供 | 使用 768p 结果和原始上下文重新生成 2K |

本地 ComfyUI 主要运行 H3-Base。当前应用使用本地 Qwen3.5 作为提示词扩写器，是对闭源 Context-IR 的本地替代，不等同于官方 Context-IR。

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
