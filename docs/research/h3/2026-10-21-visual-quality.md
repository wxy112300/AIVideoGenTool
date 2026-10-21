# H3 写实画质提示词：来源、解释与采用边界

- 类型：Research / Prompt Pack 知识依据
- 日期：2026-10-21
- 状态：已选用写作规则；未做本机视频画质 A/B，不承诺提升幅度
- 范围：本应用 H3 完整增强；[产品边界](../../PROMPT_PACK_DESIGN.md#h3-visual-quality-knowledge)、[任务与验收](../../tasks/2026-10-21-h3-visual-quality/TASK.md)

## 核对过的资料

| 来源 | 可支持的结论 | 不能推出的结论 |
| --- | --- | --- |
| MiniMax [Base 官方指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)，§4.1 | 视觉风格属于主描述，开场需明确；关键帧任务从参考图取得风格，文生视频从用户要求取得 | 某个画质词组合具有固定增益；所有视频都应写实 |
| MiniMax [Full-Reference 官方指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)，§1–2 | 风格可以是参考角色；R2V 六段结构及资产角色必须保留 | 可用画质后缀覆盖参考角色或重绘精确关键帧 |
| ComfyUI [H3 节点源码](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py)、[采样节点源码](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_custom_sampler.py)及[官方 R2V 模板](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/video_minimax_h3_r2v.json) | 节点提供正向条件；BasicGuider 接收单条件。本库 `workflows/*h3*.json` 亦使用 BasicGuider，无独立 negative 通路 | “所有 H3 实现绝对不支持负向”；自定义 CFG 与本库图相同 |
| 社区实现作者 [MiniMax-H3-Swift / PROMPTING §6](https://github.com/loading-awesome/MiniMax-H3-Swift/blob/main/docs/PROMPTING.md) | 作者自有 CLI 支持额外 CFG/负条件，并指出额外计算成本；这是另一条实现路径 | 能直接把分享的反向列表填入本应用；本轮应调整 CFG |
| 社区实现作者 [comfy-agent / Negative direction](https://github.com/shinshin86/comfy-agent/blob/main/docs/minimax-h3-prompting.md) | 作者建议在单文本中使用少量具体自然语言限制，而非泛化负词墙 | 其“否定很有效”的经验已在本机复现；整篇格式可替代官方六段 R2V |
| 社区实现作者 [minimax-h3-mlx-studio / Prompt shape](https://github.com/SawadaShusaku/minimax-h3-mlx-studio#prompt-shape) | 作者强调先定义风格，避免质量口号带偏视觉域；这是自有实现的经验 | Mac/MLX 参数或样例效果能迁移为 Windows/ComfyUI 保证 |

以上为当日读取的公开 main/master 文档，不是固定模型版本或受控实验。社区对否定的建议相互冲突：Swift 倾向额外 CFG，comfy-agent 倾向少量正文限制。采用依据是**本应用实际图的条件通路**；优先正向描述期望效果，必要时保留短的具体限制，不改采样器。

## 用户提供的候选原文

来源：本次用户分享；未提供原作者链接、模型/LoRA/参考图/采样参数或对照视频，不标为官方推荐或已验证配方。

正向：

```text
photorealistic cinematic shot, natural soft diffused lighting, realistic skin subsurface scattering, natural skin texture, no oily skin, subtle skin pores, natural eye catchlight, soft shadow transition, physically based rendering, PBR, real fabric texture, natural material reflection, fine film grain, shallow depth of field, smooth motion, stable facial features, consistent face across frames, no painted texture, no thick brush strokes, no oil painting effect, live action, real world scene, natural color grading, moderate contrast
```

反向：

```text
oil painting, thick paint, brush strokes, painted skin, plastic skin, shiny oily face, wax figure, mannequin, cartoon, anime, illustration, 3d render, CGI, harsh sharp shadow, over saturated color, flickering face, distorted facial features, blurry details, ugly, deformed, disfigured
```

## 本次采用的解释（写作判断，非模型实测）

Prompt 可以改变目标画面的风格、表面观感和视觉一致性要求；它不能凭词语提高实际分辨率或修复所有结构错误。将“画质”拆成下面的可见目标，增强器结合原稿与参考素材选择，而非逐词复制。

| 候选概念 | 采用方式 | 适用限制 |
| --- | --- | --- |
| photorealistic / live action | 在主视觉段开头建立实拍风格 | 仅用户要求或风格参考支持；不能覆盖动画/绘画意图 |
| skin texture / pores / subsurface scattering / eye catchlight | 看得见的皮肤微纹理、柔和透光及与光源对应的眼部反光 | 人物且景别可读；不为远景、风景或产品硬加毛孔、脸部 |
| no oily / plastic / wax / painted skin | 改写为自然肤质、合适粗糙度和克制高光 | 保留汗水、湿润皮肤、妆容及用户要求的光泽 |
| fabric / material reflection / PBR | 明确真实织物和随运动变化的反射、接触阴影等表现 | PBR 不是实拍同义词；真人场景不自动添加 CG 渲染词 |
| diffused light / soft shadow / natural color / moderate contrast | 保留原光源、时段和色调下选择曝光、过渡与色彩描述 | 不把夜景、硬光、霓虹或高饱和要求统一改成柔光日景 |
| grain / shallow depth of field | 有明确需求或风格依据时选用 | 属于审美选择，可能遮蔽动作/细节，不默认加入 |
| smooth motion / stable features | 身份、表面纹理、光色在运动中连贯 | 不冻结表情、口型，不把快速运动统一改慢动作；保留有意闪光 |
| ugly / deformed 等泛化负词 | 不自动注入；需要时针对具体身体、接触或身份连续性描述 | 词表不是独立负向条件，不能承诺修复 |

## 落地位置与后续质量验证

- 机器可读知识为 `src/core/prompts/h3/visual-quality.ts`，由 Strata 分层 system、通用完整 H3 编译器和 Prompt Writer 引用同一份正文，保留 legacy LM Studio 编译器兼容；知识与紧凑 execution control header 分开，避免扩大其既有长度边界。条件由增强模型理解，不用简单关键词正则把否定/场景道具误判成全片风格。
- 快捷项 `visual-photorealistic-quality` 插入可编辑英文意图；zh-CN/zh-TW/en-US 只翻译 UI 索引。原快捷项与保存预设不变。已有“真人实拍”“避免塑料感”等入口也得到同一知识解释。
- 批注修订继续走局部替换协议，不为本轮画质扩写扩大编辑范围；图片编辑保持独立 Pack。
- 正向画质文本整合进 Base 的 `integrated_multimodal_description` 或 R2V 的 `detailed_description`，不增加官方格式以外的 `negative_prompt` 字段，不在版本落盘时强拼后缀。
- 如做视频 A/B：固定模型/LoRA、参考素材、种子、分辨率、帧数和全部采样设置，对比原提示词、精简正向表达和用户完整词表；观察完整运动段的肤质/反射/身份稳定、动作/参考遵循及风格副作用。单次主观偏好或 LLM 文本检查不能证明所有 H3 模式普遍提升。
