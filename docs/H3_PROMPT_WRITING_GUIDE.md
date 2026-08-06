# MiniMax H3 提示词写作指南

## 资料定位

本文是对社区文章 [MiniMax H3 本地部署保姆级教程：从零装机到写出专业提示词，附实测数据](https://x.com/servasyy_ai/status/2085251627880255525) 中“第 7 步：提示词完整指南”的独立总结。

它不是对文章的逐段转载，而是把其中适合日常创作和软件实现的规则重新组织成一份工作指南。固定格式以 MiniMax 官方资料为准：

- [官方基础视频提示词指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)
- [官方 R2V / Full-Reference 指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)

社区文章的价值在于把官方规则变成了可执行的写作顺序、检查清单和常见错误排查；官方指南仍然是格式冲突时的最高依据。

## 1. 先确定任务类型

先判断参考素材在目标视频中扮演什么角色，再选择提示词结构：

| 任务 | 输入 | 提示词特征 |
| --- | --- | --- |
| T2VA | 只有文字 | 直接从三个核心字段开始，不写图片对齐句 |
| I2VA | 一张首帧图 | 先写首帧对齐句，再从图中状态向前发展 |
| FL2VA | 首帧图 + 尾帧图 | 先写两张图的时间对齐，再描述连接两帧的运动路径 |
| L2VA | 只有尾帧图 | 先写尾帧对齐，推断合理的前置状态，最后落到尾帧 |
| R2V / Ref2VA | 图片、视频、音频混合参考 | 使用六段式 Full-Reference 结构，并为每个参考素材分配作用 |

不要因为“上传了一个图片文件”就自动使用 `<Picture N>`。图片只有在作为具体帧、关键帧或构图锚点时才是 Picture；如果它只是提供人物外貌、服装、场景或风格，应在 R2V 的 Subject 定义中引用它。

## 2. 三字段基础骨架

T2VA、I2VA、FL2VA、L2VA 的核心输出顺序固定为：

```text
[可选的首行参考图对齐语句]

integrated_multimodal_description: ...

overall_soundscape: ...

non_diegetic_music: ...
```

## 2.1 参考图不是逐像素说明书

H3 会直接接收参考图。提示词的作用不是把图片重新翻译成一份服装、材质、背景和灯光清单，而是告诉模型**接下来发生什么**。

对于普通 5 秒的 T2VA/I2VA/FL2VA/L2VA：

- 用一到两句锁定必要的主体身份、开场构图和关键场景锚点。
- 把主要篇幅放在动作起因、微小身体变化、视线、重心、物体反应、气氛、运镜、声音和最终状态。
- 只有会影响动作连续性或用户明确要求的衣服、材质、背景、光线才展开描述。
- 默认优先单镜头；短视频里堆 2-4 个镜头通常会稀释动作路径。
- 普通 5 秒非 R2V 提示词可先控制在约 140-280 个英文单词，再按真实复杂度增加。

R2V 仍需要较长的 `subject_definitions`、`summary`、`retention_analysis` 和 `detailed_description`，因为这些字段承担参考关系编排；不能把 R2V 的 350-500 词建议机械套到普通首帧/首尾帧扩写。

### 用户输入优先

用户明确写出的内容是创作指令，不是可被参考图覆盖的建议。扩写器应保留用户明确指定的主体属性、衣着或暴露程度、动作、姿态、行为、气氛、运镜、对白和画面文字；参考图只负责补充未指定部分的连续性，不能因为某个词在图片中看不清就删除、委婉化或替换用户原词。

可以把优先级记成：

```text
用户明确要求 > H3 模式格式 > 参考图连续性 > 扩写器自行补充
```

### integrated_multimodal_description

这是主时间轴，应该包含：

- 整体风格和开场构图
- 主体的外观、位置和状态
- 动作发生的原因和准备动作
- 身体、物体和环境的连续反应
- 每个镜头的景别、视角和运镜
- 说话人、对白、歌唱和画内音乐
- 与画面同步的脚步、碰撞、摩擦等声音
- 片尾状态和最后构图

### overall_soundscape

用 1-4 个英文句子写成一个连续段落，描述全片范围内的：

- 环境底噪
- 风、雨、交通、房间声
- 脚步、衣料、物体碰撞和摩擦
- 呼吸、笑声、喘息等非语言人声

对白、歌唱和角色能听见的画内音乐属于主时间轴，不要在这里重复。只有用户明确要求全片完全静音时，才使用 `N/A`。

### non_diegetic_music

用 1-3 个英文句子描述只有观众听到的背景配乐，重点写：

- 乐器
- 速度和节拍
- 节奏形态
- 音量或层次变化
- 开始、发展和结束方式

不要只写“悲伤的音乐”“史诗感配乐”这类抽象情绪词，也不要把收音机、电视、手机音乐写到这里。没有观众专属配乐时使用 `N/A`。

## 3. 参考图对齐

### I2VA：从首帧向前发展

第一行使用官方首帧对齐语句，后面空一行：

```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

正文顺序：

1. 先确认图片中的风格、主体、构图和场景锚点。
2. 描述动作如何从首帧状态开始。
3. 描述连续的中间变化。
4. 描述最终结果或反应。

人物身份、服装、颜色、关键物件和空间关系应保持稳定，除非用户明确要求变化。

### FL2VA：连接首帧和尾帧

第一行需要同时说明两张图片对应的时间：

```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
```

不要把首帧和尾帧各自重复描述一遍。正文的主要任务是写出两帧之间的路径：

```text
首帧状态 -> 可观察的中间变化 -> 差异逐渐收窄 -> 尾帧状态
```

FL2VA 通常优先使用单镜头，让模型连续插值。只有用户明确要求切镜时才使用多个镜头，并确保最后一个镜头落到尾帧构图。

### L2VA：从合理前置状态收束到尾帧

第一行把唯一的 Picture 放在视频结束时间：

```text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.
```

正文顺序：

1. 根据用户意图和尾帧图推断一个合理的前置状态。
2. 描述动作、物体状态和镜头如何向尾帧靠近。
3. 在最后一个镜头逐渐收敛。
4. 最终落在 Picture 1 的姿势、构图、光线和空间关系上。

### T2VA：不要伪造参考图

没有参考图时，提示词应直接从 `integrated_multimodal_description:` 开始，不要写 Picture 对齐句，也不要凭空生成 `<Picture 1>`。可以根据用户意图补充合理的场景、主体、动作和声音，但不能引入无关剧情。

### 按实际时长铺开动作

提示词助手必须使用实际的 H3 有效时长，而不是默认按 5 秒写一遍。应用会根据 `17k+5` 帧网格计算有效时长，并把长片拆成连续发展段：

- 约 5 秒：3 个发展段，覆盖动作起因、动作展开和结果。
- 约 6-9 秒：4 个发展段，增加中间变化和反应。
- 约 10-12 秒：5 个发展段，给动作、镜头和气氛留出发展空间。
- 约 13-15 秒：6 个发展段，最后一段必须落到片尾状态。

每个发展段都要有可见、可听或行为上的变化。不要在前 5 秒完成全部动作后用空泛文字拖到片尾，也不要仅仅把同一动作重复几遍。FL2VA 要把首帧到尾帧的路径分布到全片；I2VA 要从首帧逐步发展；L2VA 要把最终收束留到片尾；T2VA 要从文字建立完整的视听进程。

## 4. 时间轴和镜头切换

### Shot 1

`[Shot 1]` 必须从整体风格和初始构图开始，而且不带时间戳：

```text
integrated_multimodal_description: [Shot 1] Live-action, cinematic, a medium-wide shot frames...
```

可用的风格起点包括：

- `Cinematic`
- `live-action`
- `2D-animated`
- `3D CG`
- `claymation`
- `watercolor`
- `vintage film`

I2VA、FL2VA、L2VA 应从参考图推断风格；T2VA 从用户文字选择风格。

### 后续镜头

后续镜头必须使用严格递增、位于视频时长内的切换时间：

```text
[Shot 2] At 00:03.500, the camera cuts to...
```

不要给 `[Shot 1]` 加 `At` 时间戳。时间使用 `MM:SS.mmm`，并和实际有效视频时长一致。

### 什么时候应该切镜

切镜应该引入新的信息，例如：

- 新主体
- 新空间
- 新视角
- 新状态
- 新时间段
- 需要明确展示的新物件或动作结果

如果只是想改变距离、轻微调整角度或跟随主体，优先使用运镜，不要切镜。

普通切换使用：

- `the camera cuts to`
- `the shot cuts to`
- `the shot transitions to`
- `the shot changes to`
- `the shot switches to`

`cross-dissolve`、`fade`、`wipe` 等特殊转场只有在用户明确要求时使用。

## 5. 动作要写因果，不要写形容词

一个可执行的动作段落应回答：

1. 主体一开始是什么姿势和状态？
2. 为什么动作开始？
3. 动作开始前做了什么准备？
4. 身体的哪一部分先动？
5. 手、脚、头、肩、腰和视线如何配合？
6. 是否接触或操纵了物体？
7. 物体和环境如何响应？
8. 动量、重心和二次运动如何变化？
9. 动作最后停在哪里？
10. 摄像机为什么以及如何配合？
11. 哪些声音与这些动作同步？

“自然地转身”“电影感地移动”“动态镜头”信息量太低。应该改成可观察的动作链，例如：先转移重心，再抬起脚跟，肩膀带动躯干，视线先离开目标再回到目标，衣物和头发延迟跟随，脚步声在落地时出现。

## 6. 运镜写法

运镜要写成镜头中的自然英文动作，不要在句末堆一串标签。

### 类型

- Zoom In / Zoom Out：改变焦距，摄影机位置不变
- Push In / Pull Out：摄影机前进或后退
- Pan Left / Pan Right：摄影机位置不变，镜头水平转动
- Truck Left / Truck Right：摄影机水平平移
- Tilt Up / Tilt Down：摄影机位置不变，镜头垂直转动
- Pedestal Up / Pedestal Down：摄影机整体升降
- Arc Shot：围绕主体弧线运动
- Tracking Shot：跟随运动中的主体
- Static Shot：摄影机和镜头保持静止
- Shake Slightly / Shake Strongly：轻微或明显的手持晃动
- POV：主体视角
- Roll Clockwise / Roll Counterclockwise：绕镜头轴线旋转

### 幅度和速度

只有确实有意义时才写：

- `with small amplitude`
- `with large amplitude`
- `at slow speed`
- `at fast speed`

中等幅度和正常速度可以省略。推荐把它们嵌入完整句子：

```text
The camera pushes in with small amplitude at slow speed toward the folded letter in her hands.
The camera pans right with large amplitude at fast speed, revealing the open doorway.
The camera holds a static shot as the runner exits the frame.
```

不要同时堆叠互相冲突的 zoom、dolly、pan、orbit 和 shake，除非明确写出转场和原因。

## 7. 说话人、对白和歌唱

### 说话人 ID

- 会说话、唱歌或产生画外人声的主体分配稳定 ID，例如 `(S1)`、`(S2)`。
- 多个已经编号的主体同时说话或唱歌时使用 `(S1,S2)`。
- 同一个人跨镜头保持同一个 ID。
- 从不发声的主体不要分配说话人 ID。
- 首次发声时，在 `<d>` 外说明足够的身份和声音锚点，例如角色类型、年龄、是否在画面内、音高、音色、语速和口音。

### 对白标签

身份、ID、动作和语气写在 `<d>` 外，`<d>` 内只放语言标签和用户提供的原文：

```text
The young woman with a quiet, breathy voice (S1) says: <d>[English] I get off at the next station.</d>
```

原始对白必须：

- 一字不改
- 不翻译
- 保留原始语言
- 保留必要标点
- 不把说话人的动作或语气塞进 `<d>`

### 画外音

使用固定短语 `says in an off-screen voiceover`，并紧接着声明画面中人物嘴唇保持闭合：

```text
The man (S1) says in an off-screen voiceover: <d>[English] I still remember that road.</d> while his lips remain completely closed.
```

### 跨镜头对白

同一句台词跨过剪辑点时，在两段连接处使用 `<scenetrans>`，并明确音频连续，例如 `carries over from the previous shot` 或 `continues uninterrupted into the next shot`。

台词被视频结尾截断时使用 `<cutoff>`，不要擅自补完原文。

## 8. 画面内文字

招牌、字幕、标签、霓虹灯或界面文字都放在英文双引号中，原文和标点保持不变，不翻译：

```text
A red neon sign reading "营业中" glows above the doorway.
```

同时说明文字的位置、出现时间和是否需要清晰可读。不要为了增加“电影感”擅自添加字幕、标题或 Logo。

## 9. R2V 六段式补充规则

R2V 使用以下顺序：

```text
subject_definitions:
summary:
retention_analysis:
detailed_description:
overall_soundscape:
non_diegetic_music:
```

### subject_definitions

每个需要在后文持续追踪的内容单独定义一行：

- Subject：人物、动物、物体、场景、服装、风格、动作或姿态
- Picture：具体帧或构图锚点
- Video：源视频、剪辑结构、运动节奏或续写来源
- Audio：复制或参考的声音、音乐、对白、音色或节奏

同一个 Subject 可以来自多个素材：

```text
<Subject 1> is the woman whose appearance comes from <Picture 1> and whose walking motion comes from <Video 1>.
```

### summary

用一个短英文段落说明目标视频和参考关系，开头使用任务类型组合：

- `keyframe completion`
- `reference generation`
- `video editing`
- `video continuation`
- `audio reuse`
- `audio reference`

素材的存在本身不会自动决定任务类型。只有直接编辑源视频才使用 `video editing`，只有从源视频继续生成才使用 `video continuation`。

### retention_analysis

逐个标签说明它在目标视频中如何保留或转移。不要把目标视频新增的动作或背景误判成参考内容损失。

### detailed_description

这是 R2V 的主时间轴：

- 以一到两句英文建立整体风格，再进入 `[Shot 1]`
- `[Shot 1]` 不带时间戳
- 后续镜头严格递增计时
- 首次出现 Subject、Picture、Video、Audio 时说明其作用
- 后续镜头沿用同一标签，不重新定义含义
- 参考视频和音频实际生效的镜头要再次引用对应标签
- 生成类 R2V 通常写到约 350-500 个英文单词

### 音频关系

如果音频被原样复制，使用 `fully_copy` 或 `partially_copy`；如果只参考音色、节奏或风格，使用 `reference`；如果只保留宽泛氛围，使用 `weak_reference`。

当参考主体实际说话时，同时保留视觉标签和说话人 ID，例如：

```text
<Subject 2> (S1) turns toward the woman and says: <d>[English] Last summer, I went to my grandfather's house.</d>
```

`<Subject N>` 表示被引用的主体，`(Sx)` 表示实际发声的人，两者不是一回事。

## 10. 写作检查清单

提交或生成前检查：

- [ ] 任务类型正确，是否误把 T2VA 写成 I2VA？
- [ ] I2VA、FL2VA、L2VA 的对齐句是否是第一行？
- [ ] T2VA 是否错误出现了 Picture 标签？
- [ ] `[Shot 1]` 是否没有时间戳？
- [ ] 后续 Shot 时间是否严格递增并处于视频时长内？
- [ ] 每个切镜是否引入了新信息？
- [ ] 运镜是否包含必要的类型、幅度和速度？
- [ ] 动作是否写出了准备、因果、身体响应、物体响应和最终状态？
- [ ] 参考图中的身份、服装、物体数量和空间关系是否保持？
- [ ] 对白是否一字不改并放在 `<d>` 内？
- [ ] 每个说话人是否保持稳定 ID？
- [ ] 画外音后面是否声明嘴唇闭合？
- [ ] 跨镜头对白是否使用 `<scenetrans>`？
- [ ] 结尾截断对白是否使用 `<cutoff>`？
- [ ] 画面文字是否使用双引号并保留原文？
- [ ] `overall_soundscape` 是否为 1-4 句，并且没有对白和画内音乐？
- [ ] `non_diegetic_music` 是否为 1-3 句，并且只写观众听到的配乐？
- [ ] R2V 是否正确区分 Subject、Picture、Video、Audio？
- [ ] R2V 的 `summary` 是否有任务类型前缀？
- [ ] R2V 的 `retention_analysis` 是否使用固定关系词？

## 11. 在本项目中的对应关系

当前实现已经覆盖：

- 官方三字段和 R2V 六字段
- T2VA、I2VA、FL2VA、L2VA 模式推导
- Shot 时间戳检查
- 对白 ID、语言标签和可见文字提示
- 环境声与配乐字段检查
- 可编辑的完整提示词扩写预设
- native Qwen 和 LM Studio 两条扩写路径
- R2V 模板会根据参考作用区分可复用内容的 `<Subject N>` 和具体帧/构图锚点 `<Picture N>`
- R2V 检查器会提示任务类型前缀和 retention 关系词

仍建议后续完善：

1. 当前界面仍只有图片和视频 Slot，独立 Audio Slot 尚未接入。
2. R2V `detailed_description` 已给出 350-500 词目标，但检查器暂未强制词数。
3. 扩写结果应继续保留用户原始对白和画面文字，不能让本地扩写模型改写它们。

## 12. 一句短想法的懒人法

社区文章给出的懒人法是：不要先自己学习完整格式，而是把官方提示词指南和一句自然语言想法一起交给一个能够理解图片的 LLM，让它负责转换成 H3 的结构化提示词。手工使用时，应把 [官方基础视频提示词指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) 和 [官方 R2V 指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md) 作为规则来源，再提供自己的短想法和参考素材。

可以把请求概括为：

```text
按照 MiniMax H3 官方提示词指南，把我的短想法和参考素材改写成当前任务模式的完整 H3 提示词。
不要解释过程，只返回最终提示词。保留我的对白和画面文字原文，并正确处理首帧、首尾帧、尾帧或 R2V 参考标签。
我的想法：
...
```

本应用已经把这套方法变成离线流程，不需要把 URL 交给模型，也不依赖运行时联网：

1. 在创建页选择“完整电影提示词（推荐）”。
2. 用户只输入一句中文或英文短想法，不必先手写英文分镜。
3. 根据是否有首帧、尾帧或 R2V Slot，应用自动确定 T2VA、I2VA、FL2VA、L2VA 或 R2V。
4. native Qwen 或 LM Studio 读取短想法、参考媒体、可编辑预设、内置官方基线和对应输出骨架。
5. 模型只返回完整 H3 提示词，并保存为一个新的提示词版本。

与手工 URL 版相比，本地实现的优点是规则已经固化，不依赖网络，也不会因为模型无法访问网页而漏掉官方格式。它仍然不是官方闭源 Context-IR 的等价物，所以 R2V 的 Subject 作用、对白原文、镜头时间和最终动作连续性仍应在生成前快速检查。
