# MOSS 接入选择与能力边界

查询日期：2026-10-21。下表是来源与工程适配评估；没有本机固定参数画质 A/B，不能证明社区绝对最佳。原始元数据仅留在忽略的 temp，不保存示例成人图片或用户内容。

## 采用

| 路径 | 选择与理由 | 未验证边界 |
| --- | --- | --- |
| RTX 4090 主力 | 官方 MOSS-Image-SFT INT8 ConvRot：5.414 GB DiT，7.344 GB W4A8 Qwen3.5 9B 编码器，0.250 GB small FLUX.2 VAE。相比 BF16 权重更适合 24GB 的起点，按官方 ComfyUI 模板接入 | 权重大小不等于峰值显存；速度、冷加载和最终质量未测 |
| 社区 NSFW | iamddtla / PornMaster Moss V1，model 3008033 / version 3413227，5.414 GB INT8；作者训练 LoRA 后合并到 SFT，提供独立 checkpoint。成人向目标、权重身份和原生 MOSS 架构明确 | 不是独立全量微调；作者工作流 ZIP 下载返回登录要求，未读取配方。先采用官方 MOSS 25/50 步，不声称作者配方或效果已复现 |

精确文件名、revision、bytes 与 SHA-256 只维护在 [catalog](../../../../src/core/catalog/models/moss-image.ts)。官方来源 Apache-2.0；社区文件按作者 Civitai 权限，不能沿用官方许可推断可再分发/派生。本应用只给下载指引，不分发权重。

## 已检查的替代候选

| 候选 | 证据与判断 |
| --- | --- |
| [Kromoss](https://huggingface.co/lodestones/Kromoss) | Base 全量微调，主打通用质量；有 INT8 与独立 DMD2 加速路径。不能把通用人像能力当成人专门训练证明；作为通用替代保留研究价值 |
| [Moss Serenity](https://huggingface.co/malcolmrey/moss-serenity) | Base 全量微调，强调具名人物学习；不适合作为本次成人向默认选择 |
| [Moody Moss Mix](https://civitai.com/models/3007871) | 成人向混合模型，采用情况较多；新版 25 步和旧版 12 步不是同一配方，作者也提到旧加速版皮肤问题。不只凭下载/点赞决定 |
| [FineView MOSS](https://civitai.com/models/3007993) | 多个 6 NFE / LCS 路径及 BF16 版本，工作流/许可条件不同；快速配方存在细节与组合边界，首轮不引入额外加速变量 |
| [NSFW uncensored LoRA](https://huggingface.co/axiomofmind/Moss-image-nsfw-uncensored-lora) | 成人向适配器，有独立触发词；不是第二套完整 checkpoint，本次不把 LoRA 冒充完整模型 |

## 已采用的采样

- 默认 `comfy-25`：25 步 / CFG 2.5 / er_sde / simple，SLG single layer 22、start 0、end 0.5；对应 [Comfy-Org 原生模板](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_moss_image_t2i.json)。使用原生 MOSS 默认 shift 5，不套用 ModelSamplingSD3。
- `quality-50`：50 步 / CFG 3 / Euler / simple、SLG layer 22 全程；参照 [官方 SFT 模型卡](https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT) 的 50 步、CFG 3、shift 5、SLG 22 建议，在同一原生 ComfyUI 路径提供质量候选，仍须本机比较。
- 两条路径使用空 negative，避免偷偷给成人版本加 NSFW 负词；没有默认成人提示词。
- 原生 `CLIPLoader(type=moss_image)`、`EmptyFlux2LatentImage`、16 像素对齐、FLUX.2 VAE。MOSS 最低线 0.42.0，仓库推荐线仍为 0.42.3；本次应用选中的 0.42.0 / `40dcb30a96fc345f54632c56af81a4a320c2fc1e` 已通过两张图的真实节点/schema 校验。该结论不证明权重可加载；不增加第三方节点或套用 Qwen attention/cache/fix LoRA。

## 与 Qwen 2.1 的工具复用

| 工具 | 本次行为 |
| --- | --- |
| 提示词原稿/版本、忠实/细节增强 | 复用 UI 与后端，新增 MOSS T2I 合约；过滤旧 Qwen 工厂编辑预设。JSON 原文/精确文字不经过 Qwen 文本折叠 |
| Seed、批量、比例/分辨率 | 复用；MOSS 独立 16 对齐，25/50 步快照固定，不改变 Qwen 的网格与采样 |
| PNG、队列、作品版本、放大与转视频 | 使用已有通用输出/History 链路；MOSS 结果“继续编辑”选择可接收参考图的模型（缺省 Qwen 2.1），保留原项目/父版本与原始 MOSS 身份；真实生成及回流验收依赖权重 |
| 多参考图、Paint、Mask、源图编辑、透明输出 | 普通 SFT / PornMaster checkpoint 不支持。本次不开放上传和编辑快捷指令；从其他模型带来的图片保留可移除，提交明确阻塞 |
| LoRA、APG/FreSca、Qwen Fix/缓存 | 不自动复用；架构与训练契约不同 |
| 原生 JSON 布局 | 可直接把官方 schema 的 JSON 粘入提示词；保持原文。没有新增可视化布局编辑器 |

[Ostris 编辑插件](https://github.com/ostris/ComfyUI-MOSS-Image-Ostris-Edit) 需要专门训练的 edit 权重/LoRA，不能仅安装节点就让普通 MOSS checkpoint 获得参考编辑。本次两条文生图路径没有隐式启用该实验分支。

2026-10-22 按[公开评测复核](benchmarks.md)修正排序：官方 Qwen 2.1 → 官方 MOSS → PornMaster 衍生版 → Qwen Turbo / GGUF 备用及其他模型。原先按编辑功能数量把 MOSS 放后面，不能代表文生图质量。Create/Settings 共用 catalog order；该顺序是使用/验证优先级，不是统一实测画质排行榜，社区衍生版不继承官方分数。

## 来源身份

- [官方 SFT](https://huggingface.co/OpenMOSS-Team/MOSS-Image-SFT)、[Comfy-Org 权重](https://huggingface.co/Comfy-Org/MOSS-Image)。模型、编码器与 VAE 的 LFS pointer 已交叉核对。
- [PornMaster 模型页](https://civitai.com/models/3008033)、[公开模型元数据](https://civitai.com/api/v1/models/3008033)、[作者工作流元数据](https://civitai.com/api/v1/model-versions/3415226)。工作流下载返回 Unauthorized，未绕过登录。
- ComfyUI v0.42.3 的 `nodes.py` / `comfy_extras/nodes_slg.py` 与所选安装源码已检查 MOSS 类型、W4A8 与 SLG sockets；这不是权重加载证明。
