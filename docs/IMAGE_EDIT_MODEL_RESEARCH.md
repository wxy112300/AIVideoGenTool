# 本地图像编辑模型调研

> 调研日期：2026-08-07
>
> 目标硬件：Windows + NVIDIA RTX 4090 24GB，优先使用 ComfyUI 本地运行。
>
> 当前状态：FLUX.2 Klein 4B 已接入设置、模型扫描和图片任务 adapter；Qwen-Image-Edit-2511 保留为质量主线，并已增加低显存运行策略。真实 Klein 权重下载和两模型 GPU smoke test 仍待完成。

## 1. 需求定义

这里需要的不是传统锐化或普通超分，而是**指令驱动的图像重绘 / 图像编辑模型**：

- 输入一张质量差、模糊、低清或材质不理想的图片。
- 通过文字指令保留主体、构图、姿态、比例和用户明确要求。
- 重新生成更完整的材质、光线、边缘、面部和空间细节。
- 支持整体重绘和局部修改。
- 支持后续把处理后的图片交给 MiniMax H3 做图生视频。
- 允许未来分别提供普通官方版和实验性 Unconcerned 版。

这类任务不是严格意义上的无损恢复。模型会根据视觉先验**重新生成**输入中不存在的细节，因此需要同时评估：

1. 画质和材质是否提升。
2. 主体身份和结构是否保持。
3. 用户原始意图是否被改变。
4. 局部编辑外的区域是否稳定。
5. 输出作为 H3 首帧时是否更容易保持连续性。

## 2. 初步结论

### 综合推荐

如果后续只选一个模型先做项目集成，优先考虑：

**Qwen-Image-Edit-2511 Q4_K_M**

原因：编辑质量、中文指令、多图一致性、局部/整体编辑能力和 ComfyUI/GGUF 生态之间的平衡最好。它不是最轻的模型，但在 4090 上可以通过量化、CPU offload 和较大系统内存运行。

### 质量对照

**FireRed-Image-Edit-1.1 Q4_K_M** 值得作为画质和人物一致性的质量上限对照。FireRed 官方在自有 ImgEdit、GEdit 和 REDEdit-Bench 中报告了高于 Qwen-Image-Edit-2511、LongCat-Image-Edit 和 FLUX.2 Dev 的结果，但其官方优化路径仍以约 30GB VRAM 为目标，4090 需要第三方 GGUF/offload，速度和稳定性需要实测。

### 轻量版本

**LongCat-Image-Edit-Turbo** 和 **FLUX.2 Klein 4B** 适合作为快速模式：

- LongCat 更偏完整图像编辑、中文理解和非编辑区域一致性。
- FLUX.2 Klein 4B 更偏低延迟、快速试错和多参考编辑。

它们适合先做预览或快速增强，但不应在没有 A/B 测试前宣称能达到 Seedance、Gemini 或 GPT Image 的重绘质量。

## 3. 候选模型

| 模型 | 主要能力 | 4090 可行性 | 适合定位 | 许可证/来源状态 |
| --- | --- | --- | --- | --- |
| Qwen-Image-Edit-2511 | 整体编辑、局部/外观编辑、多图、人物一致性、材质和视角变化 | 官方 BF16 20B 不适合直接塞入 24GB；Q4_K_M GGUF 约 13.2GB，配合 offload 可尝试 | **首选综合主线** | 官方 Apache 2.0；GGUF 为社区量化 |
| FireRed-Image-Edit-1.1 | 人物身份保持、多元素融合、人像美化、老照片修复、文本和多图编辑 | 官方模型约 57.7GB；官方优化约 30GB VRAM；Q4_K_M GGUF 约 13.1GB，可尝试但需大量系统内存 | **质量对照/高级模式** | Apache 2.0；官方和社区权重需分开核验 |
| LongCat-Image-Edit | 全局编辑、局部编辑、文字修改、参考图编辑、非编辑区一致性 | 官方文档称 CPU offload 约需 18GB 显存；标准版 50 步 | **质量与显存平衡** | Apache 2.0，官方权重 |
| LongCat-Image-Edit-Turbo | LongCat 编辑能力的蒸馏版本，8 NFE | 官方文档给出约 18GB offload 路径；更适合 4090 实测 | **快速增强/预览** | Apache 2.0，官方权重 |
| FLUX.2 Klein 4B | 统一文生图、单图编辑、多图编辑，4 步 | 官方约 13GB VRAM，4090 友好 | **极速交互模式** | Apache 2.0，官方权重 |
| FLUX.2 Klein 9B | Klein 高质量版本，单图/多图编辑，4 步 | 官方约 29GB VRAM；Q4 GGUF 可尝试，但不等于稳定 24GB 运行 | 4090 实验性高质量模式 | FLUX Non-Commercial License |
| FLUX.2 Dev 32B | 当前开源 FLUX 高质量编辑和多参考能力 | 官方提供 RTX 4090 的 4-bit + 远程文本编码器路径；纯本地不适合作为第一候选 | 质量研究对照 | FLUX Non-Commercial License |
| Step1X-Edit-v1p2 | 推理式图像编辑，复杂编辑指令和反思模式 | 官方 FP8 + offload 测试约 18GB，但测试平台和速度条件不同；4090 可实验 | 复杂编辑/推理对照 | Apache 2.0 |
| HiDream-E1.1 / HiDream-O1 | 指令编辑、参考图、较高分辨率；O1 支持多参考和编辑 | 生态和显存数据不如前三者明确；O1 约 4MP 训练分布，工程复杂度较高 | 研究/高分辨率实验 | Transformer MIT；VAE/文本编码器另有许可证 |

## 4. 重点模型分析

### 4.1 Qwen-Image-Edit-2511

这是当前最符合项目需求的第一候选。

官方能力包括：

- 减少 image drift。
- 改善人物和角色一致性。
- 支持多人物融合。
- 支持单图和多图编辑。
- 支持新的视角、材质替换和工业设计编辑。
- 集成部分社区 LoRA 能力，例如光照增强。

官方模型是 20B BF16，完整权重约 40.9GB。4090 方案应记录为：

```text
Qwen-Image-Edit-2511
  推荐量化：Q4_K_M
  GGUF 文件约：13.2GB
  运行方式：ComfyUI-GGUF + CPU/model offload
  建议系统内存：至少 32GB，优先 64GB
  预期：质量优先，速度较慢
```

Q4_K_M 的 13.2GB 是权重文件大小，不是最终显存峰值。实际峰值取决于分辨率、VAE、文本编码器、offload 策略和 ComfyUI 版本，必须通过真实工作流测量。

### 4.3 当前优先运行模型：FLUX.2 Klein 4B

FLUX.2 Klein 4B 是当前 RTX 4090 的优先接入模型：官方定位为消费级 GPU，约 13GB VRAM，支持单图编辑和多参考编辑；本项目首版按 ComfyUI 0.31 官方 blueprint 接入单图编辑，使用 20 步、CFG 5、约 1MP 内部工作尺寸和 ReferenceLatent 条件。

当前设置会扫描以下组件：

- `diffusion_models/flux-2-klein-base-4b-fp8.safetensors`
- `text_encoders/qwen_3_4b.safetensors`
- `vae/flux2-vae.safetensors`

它与 Qwen 2511 共用图片项目、PNG 输出和严格 Picture 1 尺寸契约，但使用独立 adapter，不把 Qwen 节点图硬套到 Klein。

### 4.4 Qwen 2511 的 24GB 运行策略

Qwen 官方 INT8 ConvRot diffusion 文件约 19.5 GiB，Qwen VL FP8 文本编码器约 8.95 GiB；两者不能在 24GB 显存中同时完整驻留。当前实现采取：

1. `CLIPLoader.device = cpu`，把 Qwen VL 文本编码器放到 CPU。
2. ComfyUI 冷启动 Qwen 任务时追加 `--cpu-vae`。
3. 追加 `--disable-smart-memory`，允许更激进地把模型权重卸载到系统内存。
4. 追加 `--vram-headroom 0.5`，给 DynamicVRAM 留额外余量。
5. 保留 `--cache-none --disable-pinned-memory --disable-async-offload`，避免 Windows 提交内存和换页失控。

这条路径优先保证不爆显存，代价是速度会明显下降；Qwen Q4_K_M/Q3_K_M GGUF 仍是后续更合理的质量/速度方案，但需要 ComfyUI-GGUF 专用 loader。

### 4.2 FireRed-Image-Edit-1.1

FireRed 是目前最值得做质量对照的模型。官方 1.1 版本重点改进：

- 人物身份一致性。
- 多图条件注入。
- 多元素融合。
- 人像妆容与皮肤编辑。
- 风格化文字参考。
- 老照片修复和细节恢复。

官方仓库还提供：

- Agent 驱动的多图 ROI 检测、裁剪和拼接。
- 多图超过 3 张时的预处理流程。
- GGUF 轻量格式生态。
- ComfyUI 工作流和节点支持。
- Lightning 8-step 蒸馏方向。

但它的工程风险高于 Qwen：

- 官方 1.1 权重仓库约 57.7GB。
- 官方优化说明仍以约 30GB VRAM 为目标。
- 目前找到的 Q4_K_M GGUF 约 13.1GB，是第三方量化。
- 4090 运行是否稳定取决于系统内存和 offload，不能只看文件大小。

如果 FireRed Q4 在 4090 上能稳定运行，它可能更适合“画质增强 + 人物保持”模式；但在实际接入前必须与 Qwen 2511 用同一批输入图做盲测。

### 4.3 LongCat-Image-Edit / Turbo

LongCat 的定位很接近“已有图片的自然重绘”：

- 能修改目标区域，同时尽量保持非编辑区域的布局、纹理、色调和主体身份。
- 支持全局编辑、局部编辑、文字修改和参考图编辑。
- 支持中英文指令。
- 标准版使用 50 步，Turbo 使用 8 步。
- 官方已接入 ComfyUI。

官方文档的本地建议是 CPU offload，约需要 18GB 显存。模型仓库总大小约 29.3GB，仍然需要预留系统内存和临时空间。

它很适合做两个版本：

```text
LongCat-Image-Edit       质量优先
LongCat-Image-Edit-Turbo 速度优先
```

### 4.4 FLUX.2 Klein

FLUX.2 Klein 是 2026 年新增的重要候选，不应再只考虑旧的 FLUX.1 Kontext。

官方定位：

- 文生图和图像编辑统一。
- 单参考和多参考编辑统一。
- 4 步蒸馏模型。
- 4B 版本约 13GB VRAM。
- 4B 版本 Apache 2.0。
- 9B 版本质量更高，但官方约 29GB VRAM。

4090 建议：

```text
FLUX.2 Klein 4B       稳定快速候选
FLUX.2 Klein 9B Q4    实验性候选，不能承诺 24GB 稳定运行
FLUX.2 Dev 32B Q4     只做质量参考，不作为本地首发
```

Klein 4B 更适合交互式快速预览，不一定是低质量输入图重建的最终质量冠军。

### 4.5 Step1X-Edit-v1p2

Step1X-Edit 的优点是复杂编辑理解和推理式编辑。v1p2 支持 thinking/reflection 模式，官方报告中相对早期版本有提升。

官方测试显示：

- FP8 + offload 约 18GB 显存。
- 需要较慢的 CPU/offload 路径。
- 官方推荐更大显存设备获得更好速度和质量。
- 存在 ComfyUI 社区节点。

它更适合复杂的局部修改、关系编辑和需要推理的任务，不是当前“先把所有输入图重绘得更真实”的第一选择。

### 4.6 HiDream-E1.1 / O1

HiDream-E1.1 和 O1 有价值，但目前不放在第一批：

- E1.1 支持动态分辨率，约 1MP 训练分布。
- O1 支持多参考图，单图可作为 instruction edit。
- O1 的 ComfyUI 节点已经包含参考图和 patch seam smoothing。
- Full 版本依赖较大的文本编码器和多组件许可证。

它们更适合后续研究高分辨率编辑或 patch seam 问题，不适合先拿来搭建项目的最小稳定闭环。

## 5. 4090 版本建议

### 普通官方稳定版

第一阶段可预留以下模型 ID：

```text
qwen_image_edit_2511_q4
firered_image_edit_11_q4
longcat_image_edit
longcat_image_edit_turbo
flux2_klein_4b
```

推荐默认顺序：

1. `qwen_image_edit_2511_q4`
2. `longcat_image_edit`
3. `flux2_klein_4b`
4. `firered_image_edit_11_q4`（确认 4090 稳定后再显示）

这里的顺序是工程落地顺序，不是单纯画质排名。

### Unconcerned / 社区实验版

目前没有发现以下模型的官方可靠 Unconcerned 版本：

```text
Qwen-Image-Edit-2511 Unconcerned       未发现可靠官方版本
FireRed-Image-Edit-1.1 Unconcerned     未发现可靠官方版本
LongCat-Image-Edit Unconcerned         未发现可靠官方版本
```

搜索到的社区结果主要是少量以 `uncensored` 命名的第三方模型，缺少统一 benchmark、训练说明和质量保证，不能直接当成“普通版的更好版本”。目前只发现 FLUX.2 Klein Base 的少量社区 uncensored 命名权重，也不建议第一阶段纳入默认扫描。

后续如果确实需要 Unconcerned 版本，建议使用独立的实验模型记录：

```text
edition: standard | unconcerned
source: official | community
baseModel: exact upstream model ID
license: separately verified
qualityStatus: unverified until local A/B test
```

不要把“Unconcerned”当作画质等级。它首先是行为/过滤策略差异，未必提高编辑质量、身份一致性或 H3 首帧适配度。

## 6. 面向 H3 的前置增强流程

后续接入时建议把图像编辑模型放在 H3 之前：

```text
原始图片
  -> 输入规范化
  -> 图像编辑模型整体重绘或局部编辑
  -> 可选尺寸/色彩检查
  -> H3 I2VA / FL2VA
```

整体增强和局部修改应当是两个不同意图：

### 整体质量重建

目标是提升材质、光线、边缘和细节，同时保持语义和构图：

```text
Preserve the exact subject identity, geometry, proportions, pose, composition,
scale, colors, and all explicitly requested content. Treat the input as semantic
and structural reference, not as a pixel-quality lock. Reconstruct missing fine
details, natural material response, realistic lighting, surface texture, edge
definition, and coherent photographic depth. Do not add new objects, change the
subject, alter the composition, or invent unrelated details.
```

### 局部修改

目标是只改变指定区域，其他区域尽量保持：

```text
Change only the requested masked region. Preserve the subject identity, pose,
composition, lighting, color relationships, and every non-targeted region. Blend
new edges, shadows, reflections, and material response into the surrounding image.
Do not redesign the rest of the image.
```

### 送入 H3 前的额外约束

- 不要把图像编辑模型的长篇视觉描述直接复制进 H3 prompt。
- H3 仍然接收处理后的图片作为主要视觉条件。
- H3 prompt 只保留用户动作、行为、姿态、运镜、声音和必要连续性锚点。
- 如果图像编辑模型改变了主体身份、比例、服装或场景，应允许用户回退到原图。
- 需要保存原始图和处理图，不能覆盖用户原始素材。

## 7. 第一批本地 A/B 测试

在接入 UI 之前，建议用同一组输入做离线测试：

1. 低清人物图：整体质量重建，不改变人物身份和姿态。
2. 插画/玩具/3D 角色：只要求材质和光照更真实，保留角色设计。
3. 普通照片：局部修改衣物或背景，检查非目标区域漂移。
4. 多人物图：修改其中一个人，检查其他人的身份和位置。
5. 首帧增强后送入 H3，比较原图和增强图的最终视频稳定性。
6. 同一张图连续两次局部修改，检查是否出现累计漂移。

每个模型至少记录：

```text
输入文件
编辑指令
mask/全图模式
分辨率
量化版本
推理步数
seed
显存峰值
系统内存峰值
耗时
身份保持
构图保持
细节提升
局部区域泄漏
H3 首帧适配结果
```

## 8. 当前决策

暂不改 UI 和代码。后续第一阶段只实现一个模型入口时，建议顺序为：

1. **Qwen-Image-Edit-2511 Q4_K_M**：综合主线。
2. **FireRed-Image-Edit-1.1 Q4_K_M**：质量和人物一致性对照。
3. **LongCat-Image-Edit-Turbo**：快速模式。
4. **FLUX.2 Klein 4B**：极速交互模式。

如果实际 A/B 测试中 FireRed Q4 在 4090 上稳定，并且整体重绘质量明显领先，再把 FireRed 提升为质量优先默认。Unconcerned 版本等普通版流程稳定、有可核验权重和本地测试结果后再单独加入。

## 9. 资料来源

### 官方模型与代码

- [Qwen-Image GitHub](https://github.com/QwenLM/Qwen-Image)
- [Qwen-Image-Edit-2511](https://huggingface.co/Qwen/Qwen-Image-Edit-2511)
- [Qwen-Image-Edit-2511 Blog](https://qwenlm.github.io/blog/qwen-image-edit-2511/)
- [Qwen-Image-Edit-2511 GGUF](https://huggingface.co/unsloth/Qwen-Image-Edit-2511-GGUF)
- [FireRed-Image-Edit GitHub](https://github.com/FireRedTeam/FireRed-Image-Edit)
- [FireRed-Image-Edit-1.1](https://huggingface.co/FireRedTeam/FireRed-Image-Edit-1.1)
- [FireRed Benchmark](https://github.com/FireRedTeam/FireRed-Image-Edit/blob/main/docs/benchmark.md)
- [LongCat-Image GitHub](https://github.com/meituan-longcat/LongCat-Image)
- [LongCat-Image-Edit](https://huggingface.co/meituan-longcat/LongCat-Image-Edit)
- [LongCat-Image-Edit-Turbo](https://huggingface.co/meituan-longcat/LongCat-Image-Edit-Turbo)
- [FLUX.2 GitHub](https://github.com/black-forest-labs/flux2)
- [FLUX.2 Klein 4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
- [FLUX.2 Klein 9B](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B)
- [Step1X-Edit GitHub](https://github.com/stepfun-ai/Step1X-Edit)
- [HiDream-E1 GitHub](https://github.com/HiDream-ai/HiDream-E1)

### 参考评测和运行环境

- [Open-Source Image Editing Models Are Zero-Shot Vision Learners](https://arxiv.org/abs/2605.04566)
- [FireRed 官方 benchmark 表](https://raw.githubusercontent.com/FireRedTeam/FireRed-Image-Edit/main/docs/benchmark.md)
- [ComfyUI 图像编辑工作流](https://comfy.org/workflows/tag/image-edit/)
- [ComfyUI 官方仓库](https://github.com/Comfy-Org/ComfyUI)
- [ComfyUI Qwen image editing nodes](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_qwen.py)
