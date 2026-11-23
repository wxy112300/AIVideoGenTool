# 单图短剧：Continuum 提示词研究与实跑

## 原文要求与手动修订实测（2026-11-23）

「分配情节」每段可列用于该段的原文摘录，应用核对摘录确实存在于原始故事，合并重复摘录。独立的「AI 建议」继续承载模型补充的连接动作。「整片扩写」保留完整原文，每次请求携带本段大纲、邻段交接和上一段的声音。模型写的大纲与原文有冲突时按原文处理。用户亲手改写的本段动作或镜头要求优先于旧摘录，同时保留整片约束及其他事件。已有大纲仍可直接入队。

《沿岸的一次低掠》用真实历史水上飞机首帧，选择「连续运动」。拆解给四段分别定位了原文。通过实际编辑器把第 3 段唯一切镜从本地 2.0 秒改为 3.0 秒，保留完整故事原文。第一次扩写的第 2 段两次都留空了音乐栏，旧规则没有识别“没有撞击、降落、对白、旁白和配乐”。识别修复后，用同一条已完成模型响应补为 `N/A` 并通过结构检查。第 3 段实稿采用 3.0 秒，先回平机翼再切到右后侧。原稿缺少 Shot 2，格式修正响应把 Shot 2 放在句中时码后。两种写法均能从已给的动作和时码恢复 H3 标记。实测保留原始第 3 段的动作，通过更新的编译器补标记，并将前 3 段锁定，从第 4 段继续。第 2、3 段的采纳经过了同一生产编译器和结果采用逻辑，原始 Strata 响应仍留在本机忽略的测试证据中。

- **《沿岸的一次低掠》**，20 秒、4 段，真实 waiting `e0d9c0e5-8b4d-4dd1-b808-8697ac83f288`。段稿 1605／1555／1505／2247 字符。保留同一架飞机，动作顺序为平飞、右倾转向、回平后唯一一次 `[Shot 2] At 00:03.000`、离岸时镜头放慢。四段都延续螺旋桨声。通过 H3 段内时码和独立音画字段检查，叙事保真部分通过。第 1 段提前写入第 2 段的海水变深。第 3 段结束写左侧是开阔海面，第 4 段的同一机位先写左侧是沙岸、后又改成海面。末段镜头既写相对飞机静止，又写放慢跟拍速度，实际运镜仍有歧义。
- **《潮线露出的路》**，20 秒、4 段，真实 waiting `c7e8e09e-7e61-4f2a-a0f4-b431af5b02ce`。「通用影视时间线」，段稿 1403／3033／2409／1971 字符。四段均有原文摘录，实际扩写逐段自动采用。第 1 段原始响应留空音乐栏，修复后直接编译为 `N/A`。大纲把转动写成平移、把草顶写成红顶，详稿按原文和图像恢复为原地右转和草顶。全片保持一个镜头，两块石头按顺序露出，第三段末停住，最后一段保留窄缝里的细水。声景从碎浪连续变成涓流。核心原文要求通过文本审稿。第 3 段的“窄缝形成”容易被读成石头移动，固定转轴的同时又写入口变大，仍有轻微几何歧义。
- 真实队列通过鼠标切换「整片 → 创作意图 → 第 1 段 → 整片」，文案无括号，显示的完整原文和段稿与冻结快照一致。共享约束状态及采样文本的加入方式在定向测试覆盖。

两条均使用真实库首帧及原生 Strata `strata/qwen3.8-flash-next-iq3_xxs`。审稿对照的是 H3 的局部时钟、Shot 编号和独立音画字段，以及 Continuum 的跨段姿态和声景。本次验收止于任务等待，ComfyUI 为 stopped。真实队列 11→13，原 11 条逐项一致，历史仍为 138 条，二条新任务的原文和四段详稿逐项等于入队快照。临时关闭的 Strata 思考和原草稿已核对还原。6 组定向测试 109 项及双端 typecheck、桌面生产构建、7 组集成 132 项与 440 对比度通过。限并发全量单元 3401 项通过，安装器／下载的 3 项计时用例超时。相应 2 个文件以单 worker、20 秒测试限时复跑 115 项通过。[MiniMax Base 指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) · [Continuum 通用 Skill](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/H3-Continuum-Skill-v1.zip)

## Full Run 拆解与扩写实测（2026-11-22）

真实库选三个历史首帧做不同故事，走现有创建页的「分配情节 → 整片扩写 → 加入队列」，停止在 waiting。档案按原文约束、段间因果与道具、镜头和声景、H3 采样文本字段、真实队列快照来审。每个段的首镜头、真正切镜的局部时间、发言人编号、带方括号的语言标签及独立声景参考 MiniMax 的 Base 指南。同一动作跨接缝以及固定的参考方位参考 Continuum Skill 及社区示例。出稿结果只验证写作，视频质量需另行采样。测试期间将真实库的 Strata 思考临时设为关闭，同一模型继续使用，结束后还原。 [MiniMax Base 指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) · [Continuum 通用 Skill](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/H3-Continuum-Skill-v1.zip) · [社区跨段动作示例](https://github.com/vizart-vj/ComfyUI-MiniMax-H3-LongMedia/blob/main/docs/MULTICLIP_PROMPTING_GUIDE.md)

首轮台球故事的拆解已复现近侧与远侧袋口混用、上一段提前拿起下一段才要抬起的物件、以及道具的两种备选状态。生产指令据此加上同一地标和方位、区分接触与持有、单一可见道具状态和原文语言。后续实测逐次检查。

| 故事与模型稿 | 文本验收 | 下一轮处理 |
| --- | --- | --- |
| 《台球桌旁的误会》，15 秒 3 段，`5db8a7ae-f73c-483b-8f54-6549e0014941` waiting。通用影视时间线，成稿 1,203／2,230／1,812 字符。 | 原句只出现一次，三段各一个 Shot 1，无配乐，最后蓝色巧克到花衬衣男子左手。两处连续接缝有相同机位和环境声。未过保真审稿：近远侧不一致，第 2 段提前拔出巧克，易拉罐从左手变成右手且无交代。对白未按 MiniMax 使用带方括号的语言标签和稳定说话人 ID。真实队列保留原模型稿供对照。 | 强化第一轮发现的物理落点差异和道具状态，增加上一段动作摘要和更早已发生的主要事件。下一轮要求同一地标、右手持物和一个明确切点。 |
| 《树林里的路标》，18 秒 3 段，`f0dbd3c8-bf9b-4e35-91c0-b04a69f4f349` waiting。通用影视时间线，成稿 1,909／2,408／1,370 字符。 | 大纲改成中文，路线纸持续在右手，第二段扶正后第三段直接沿用结果，风声贯穿。第 2 段描述局部 2 秒切近景，也保持左手连续和第三段的景别，但漏写了 Shot 1 和带时间码的 Shot 2，不能判为官方格式合格。大纲还把镜头停止和延续推镜放在同一交接，详稿选择了静止开场。 | 编译器统一补开场 Shot 1，明确写了切镜却没有 Shot 标记的详稿进入原有单次修正。下一轮换车库，保留 2.5 秒切点、跨段持续风扇声和仅发生一次的两个动作声。 |
| 《绿车修好之前》，20 秒 4 段，`24182690-0053-471e-896f-54188fb13c4c` waiting。连续运动，成稿 2,302／1,932／1,772／2,505 字符。 | 四段通过 H3 本地字段和切点校验。唯一显式切镜在第 2 段局部 `[Shot 2] At 00:02.500`。保留了右手接触已扣紧接头、半开引擎盖、落锁后松手并亮灯的顺序，风扇声跨段持续。对白只出现一次且在亮灯后，但模型把台词放在声景，语言写 `[zh]`，没完全按官方格式。第三段还在声景里添加了未建立的皮手套。 | 后续需检查发言人和原句是否落入动作正文，以及声音是否暗示新道具，按画面是否允许看见手和道具审相邻景别。现有三条队列保留各轮采用稿供对照。 |

车库回归复现了三种真实模型格式波动。明确无配乐时空的音乐标记编译成 `N/A`。编译器可以重排位置颠倒的镜头编号与时间，并把可识别的续接前导与开场正文归位。第 2 段由保留的真实 Strata 响应用该编译器恢复，只调整标记位置，保持同一动作和 2.5 秒切点。随后锁住已经采用的前两段，在真实 UI 只扩写第 3、4 段。两段成功逐段写回。最终用创建页按钮入队，逐条核对实际使用的首帧路径、时长和冻结稿。

2026-11-23 收尾。真实历史保持 138 条，原来 8 条任务逐项相同，新增 3 条均为 waiting。队列未启动，ComfyUI 保持 stopped，用户草稿和临时改过的 Strata 思考设置已比对还原。定向 Vitest 104 项及双端 typecheck 通过。

## 采样路由与语料补查（2026-11-22）

### 冻结稿到 Continuum Run 的只读对照

用旧 Full Run 队列快照的六条冻结正文，按当时 Continuum 的 List 去除外部空白规则逐条计算 UTF-8 SHA-256。六条哈希均不同，且逐条等于官方 manifest 的 `contract.prompt_hashes` 和对应段 `entry.prompt_hash`。官方 Run 的模式为 List，完成六段，首段记录上下文 0 帧，后五段各为 22 帧。储存合同记录 `i2va`、`masked_av_prefix_22_v1`、Audio Continuity 开启，以及 Actual Prefix 2。该任务没有共享前言。可以排除这条成片是解析时把同一条提示词路由到六段，或没有选择 AV 续接路径。哈希验证的是解析后的逻辑稿及 Run 记录，未读取编码器内部张量。六段不同也不能排除 H3 在正确接收文字时仍重复动作。

在旧实跑夹具保留的 Continuum 源码里，Masked AV 后续段不再把原首帧 latent 作为开场关键帧挂入采样，上一段末尾的 AV latent 用作续接。但是提示词编码仍可收到原首帧图像，两者是不同通道。因此，后续画面若像回到首帧，应该检查段稿是否写回了开场动作和构图，同时保留原图影响、续接机制等其他可能解释。未做同条件去图对照，不归因于原图。

模板文件的初始值是 Timeline，应用实际 API 图由组编译器覆盖成 List，并将各段作为 JSON 字符串数组输入。上游 [#21 重复段落案例](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/issues/21) 中，内联时间标题曾触发 Fixed 回退。评论里的倒茶案例则说标题独占一行后仍重复倒茶，后来同时改了开场、手部动作、道具状态和段落组织才改善。第二个报告没有只改一个变量，不能反推“每段必须切镜”。两类问题需要分别复核实际 List 与实际动作。

普通首帧、逐镜参考和首尾帧任务的接缝证据不能混用。应用实际图仍使用 V38 Sampler。旧资料确认，一个符合条件的 5 秒首尾帧任务可将最后两段合为一次物理采样，上游会把两个不同逻辑稿拼成一份两段时间文本。V3.9 的固定 `@R` 路由是另一套参考图接口。官方指南也说明，带 Audio Continuity 的 Balanced 22 使用 Masked AV；用 Fast、Strong 或 Auto 可能切换到 Reference Context 路径。所以这些设置的 A/B 会同时改变行为，记录时需要保留实际 transport，不能从一个设置名反推效果。 [Continuum 用户指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/docs/USER_GUIDE.md) · [3.10.3 发布记录](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.10.3)

### 可用的公开案例及语料

| 来源 | 复核所得与用途 |
| --- | --- |
| [OpenH3-IR 原句与改写的公开对照](https://github.com/ruashots/open-h3-ir#the-difference-a-clip-of-something-vs-a-performance) · [改写稿](https://github.com/ruashots/open-h3-ir/blob/main/docs/media/off-vs-on.compiled-brief.txt) | 作者声明保持 seed、参考图、模型和设置。两版约 10 秒的对照视频已下载抽帧。原句版先面对镜头走，后面背向镜头继续走；改写版开场从背后跟拍，约中点切到主角向下看城市的近景。原句只提到走出栈道、看到城市后停步，切镜和配乐是编译稿新增。这是“动作更明确但导演决定也更多”的可观察样例，属于单次短片，听感未复核。 |
| [OpenH3-IR 同一汽车简述的两种扩写](https://github.com/ruashots/open-h3-ir#a-dial-for-how-far-it-goes) | 已抽帧对照，强创造版中途切轮毂特写，克制版该时点保留整车。公开稿中克制版指示在 6 秒切换；强创造版设 3.5 和 7 秒两个切点。对照同时改变了导演内容和正文长度，可用于比较两种输出决策，不能单独衡量词数。 |
| [ostris 原始 H3 1K 语料](https://huggingface.co/datasets/ostris/minimax_h3_1k) · [可按风格查找的索引](https://github.com/yangzhou-chaofan/minimax-h3-1000-prompts) | 同一检查点 `FL2VA pruned INT8 convrot`、30 步、约 0.6 MP，公开素材含多种风格和三字段正文。Hugging Face 文本查看器显示 3,000 行，不应算成 3,000 个独立视频。适合抽查真实镜头动词、动作组织、声景和对白格式。没有按每条短片配原始用户意图，也没有 Continuum 的前后段尾配对。此轮只核对公开页面，未下载全库或统计总体分布。 |
| [Fantastic H3 Prompt Builder](https://github.com/Cyber05CC/ComfyUI-Fantastic-MiniMaxH3-PromptBuilder) · [Duckyshell Sequence Writer](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/blob/main/docs/USAGE.md) | 前者适合参考媒体绑定、格式和字段检查；后者在 Sequence 中区分全片分配与单段细写，分派实际媒体、局部时钟和邻段内容，并保留用户当前编辑。其文档明确只对结构、媒体和时间做校验，出稿不会自动修复整片剧情。两者可作为工作流和测试案例来源。 |
| [LightX2V 8B H3 Prompt Rewriter](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B) · [MiniMax 社区工具索引](https://github.com/MiniMax-AI/awesome-minimax-h3-integration#prompting-and-agent-skills) | 基于 Qwen3-VL-8B-Instruct，提供 T2VA、I2VA、L2VA、FL2VA 的单段改写，当前适配器不支持 Ref2VA。可以作为单段改写对照。未找到它和本机 Strata 在同一参考图、剧情、Continuum 参数下的长视频盲测，因此没有选型结论。 |

### 新发现的本地待证点

- 同一段在整片自动扩写和手动逐段扩写时，检查力度不同。手动路径检查字段、局部时间和篇幅后可定向修正；自动分批路径校验段归属并编译结果，仍允许兼容旧的无字段正文。因此两条入口应分别采集原始响应和采用正文，再判断格式随机或超出局部时钟发生在哪一条。对现有快照或直接提交无需增加门槛。
- Strata 的文本上下文与 H3 采样稿长度要独立记录。本地写作政策为 32,768 token 窗口，预算按实际文本 token 数另扣每张图片 1,028 的配置预留和 256 固定余量。长视频规划和每次细写目前都会携带全部本次附件。这说明测试 1 张首帧和测试多张关键帧时，Strata 所见文本即使相同，可用预算也会不同。预留值是预算配置，不能当作每张图片实测 token 数，也不能由此断定上次单首帧剧情偏差源于上下文。
- 证据可以串为原始指示 → 规划中的动作和镜头 → 采用的逐段详稿 → 实际 API List／解析后哈希及 transport → 成片边界。在旧任务，前三步和解析哈希已有证据。如果下一次文字稿已经丢掉指定动作，先在采样前复现它。如果稿和路由都正确，才用同 seed、同参考、同物理窗口的两段短片比较接缝。应分别记同一动作是否继续、景别和镜头方向、角色道具、对白和声景，不用文件完成状态代替这些评价。

## 案例补查与待证问题（2026-11-22）

本轮只做资料和代码复核。公开案例的运行路径和本应用不同，比较时记录模型输入、证据范围、是否只改一个变量。作者报告的结果尚未在本应用复现。

### 公开案例

| 案例与可看到的材料 | 观察与限制 |
| --- | --- |
| [MiniMax 模型仓库的 Context-IR 与三组复现材料](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/README.md#full-2k-workflow) | 官方同时给了转换后的稿、脚本及 768p／2K 产物。对公开稿按空白分词，10 秒 T2VA 约 249 词正文／380 词整稿，8 秒 I2VA 约 533／726，5 秒 Ref2VA 约 238／562。正文只统计动作字段，整稿包含音频和参考等字段。I2VA 例子是固定机位、拉焦与餐桌动作。三个案例各自任务不同，无法推出最佳词数。官方 Context-IR 是多阶段托管流程，也不能把 Strata 一次生成直接等同于官方增强。 |
| [SkillPE 等字数实验 §4.3.2](https://arxiv.org/html/2609.34335v1#S4.SS3.SSS2) · [公开对照短片](https://yhuang.top/spe_webpage/) | 在 100、200、400、800 词预算下跑 MiniMax H3 StoryEval，Skill 的整体和创意评分多数更高，直接改写四档的指令保真均最高。举例，400 词的直接改写／Top Overall 在 7 分制保真为 6.62／6.08，整体为 5.55／5.94。这里控制的是采样稿字数，研究没有操纵 Strata 收到的上下文，也没有评估 Continuum 接缝。 |
| [h3-storyboard 同 seed 对照与勘误](https://github.com/phileiny/h3-storyboard-skill#the-finding-that-started-it) | 一个 7 秒近景塞入九拍表情，作者报告画面近乎静止。分成三个短镜头后，不加对白就恢复大部分表情。另一次只改对白的对照主要改变了画面时间分配，后一个镜头被挤压。作者撤回最初把主要变化归给对白标签的解释。样本是特定镜头，不能据此给所有镜头设一个节拍上限。 |
| [Zenstory 实测记录](https://github.com/zenstory-ai/drama-skills/blob/main/evaluations/model-behavior-probes.md) | 杯子实验里，相对距离指令常被越过，要求“碰到杯沿时停住”4/4 命中。另一个 9 秒三镜案例中，逐镜关键帧组比只有首帧组更接近要求的构图，后者有一次多切。还记录了远处孩子发声、近处骑手错动嘴的案例。公开日志有组别与样本数，完整原始媒体不在库中。关键帧、文字及声音各有作用，无法从这组数据决定本应用是否要为每段接参考图。 |
| [H3 Seamless Chain 的失败记录和 65 秒样例](https://huggingface.co/joeygambino/MiniMax-H3-Multishot-Workflow) | 作者报告，重复角色外观和场地说明被误读为也要重复动作，导致前后段很像。其 65 秒七窗口的连续对白案例使用另一套 `context_pin` 续接，并在句子边界分配台词。报告同时记录长链纹理变锐。可借鉴“相同人物延续不同动作”，现成节点和参数没有直接移植依据。 |
| [H3 Director 技术记录 §8](https://github.com/seesee75-commits/ComfyUI-MiniMaxH3-Director/blob/main/docs/paper/h3-director-technical-paper.md) | 作者在固定头部 latent 的链路中观察到新动作晚约 2.4 秒。另一个贴着段界的预定切镜实际切了两次，将段界移开后变成一次。此例说明预定切点与续接窗口的相对位置值得记录。这里用原生循环和固定关键帧，2.4 秒和两侧避让窗口都不是 Continuum 的实测常数。 |
| [Continuum-EZ 实验记录](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum-EZ/blob/main/docs/RELEASE_v0.13.2_VALIDATION_JA.md) · [Continuum 亮度漂移 #13](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/issues/13) | 前者在一个 FastH3 两段案例中，仅做局部接缝处理，边界附近变化峰值下降 28.8%，作者同时报告有局部变软。后者讨论多段累积对比度／纹理变化，官方指南里一次实验有效、另一次没有复现目标漂移。像素接缝、长程外观漂移与故事因果是三个可分别度量的现象。 |
| [Continuum-EZ 的逐镜文本编译示例](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum-EZ/blob/main/docs/EASY_PROMPTS_EN.md) | 一个花园对话示例把共有角色和风格、当前段动作、是否续接或切镜分别交给编译器。能查看最终编码文本和参考顺序。编译器不借助 LLM 改写原句、也不从图片数量推断角色数量。可用于定位编辑器显示与模型收到的内容差异；文档单独列出了身份和对白效果仍需实际生成评估。 |
| [社区 60 秒工作流展示与评论](https://www.reddit.com/r/comfyui/comments/1wadn4c/minimax_h3_60second_seamless_video_workflow_for/) | 作者提供视频及工作流入口，讨论中有人指出转向北极熊眼睛处有切镜，并报告自己连续跟拍穿房间在约 15 秒出现断点。原作者确认展示重点是长输出，未提供同条件一分钟连续跟拍对照。样片可以用来区分预期硬切与本应连续的断点。 |
| [MiniMax 仓库收录的 3D 短片 Skill](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/3d-animation-short-generator/SKILL.md) · [T8 社区案例库](https://github.com/T8mars/minimax-h3-prompt-skill-T8/blob/main/README_EN.md#case-gallery) | 前者是仓库收录的社区制作流程，分开写分镜表里的交接、空间／身份参考和动作声音，再给 H3 已通过的镜头稿；桌面流程会用角色板和场景板。后者可沿案例卡回到源帖，但部分视频来自其他引擎，H3 版本是整理后重写。语料可按取景、接触、反应等机制检索，原视频和重写稿不可当成同一次 H3 人工对照。 |

### 本应用仍要验证的点

| 假设 | 代码或旧样片中已经看到什么 | 可区分的对照 |
| --- | --- | --- |
| 上下文过长，还是包含了冲突信息？ | 细写已缩短，但仍会送整份故事原文、参考说明、自定义预设和修正时的草稿。上一段只传尾部文字，该尾部是意图，尚无成片反馈。长文的负担和指令冲突可以独立出现。 | 同模型、采样参数与参考素材，分别改上下文长度、规则位置、冲突文字；在出稿阶段统计原始动作、禁止事项和镜头的保留情况，别只记输出字数。 |
| 段尾文字是否把接缝所需状态带齐？ | 边界摘录从动作正文取首尾，专门的环境声和音乐字段没有送入。旧稿若把机位、持有者或动作触发写在前面，尾段摘录也可能漏掉。 | 用同一已批准的两段动作，比对现有摘录和显式的持有者、姿势、方向、镜头、仍在持续的声音；先看片稿，再在条件允许时看真实接缝。 |
| 自动分批里的开场能继承哪一版？ | 已确认的大纲走逐段扩写。无大纲的自动入口仍每批最多三段，同批后段没有前段经应用解析的最终段尾，只能由 Strata 在一次回复内对齐。跨批可以读取已采用的相邻稿。 | 固定规划后，按一段与三段分别写。对照批内和跨批的漏动作、重复动作、出稿等待及跨段衔接。 |
| 画面和音响是被共享前言重复触发的吗？ | 开启共享前言后，编译器在每条实际采样文本前附加故事页原文。组工作流把这些文本序列化成 List，界面上的 `---` 属于另一个展示层。旧 60 秒快照确认此开关关闭，其他任务需各自核对。 | 导出有效 List，检查只应发生一次的事件、开场指令、对白、配乐起点是否出现在多段。用同一视频参数对照只含不变量的前言和原前言。 |
| 切镜位置、指令和上一段实际画面哪一个先出错？ | 现有检查偏向格式和局部时间范围，无法判断切入画面合理性。旧成片中换车在稿阶段已发生，实际人物和狗的外观也有额外漂移。 | 用无切镜跟拍、远离段界的明确切点、贴近段界的明确切点分别记录。对照段首尾动作方向、实际切点、同一物件、音轨及口型，保持模型、seed、参考、续接与采样条件一致。 |

最小案例可以先用同一参考画面的两段互相验证。无切版要求一个物件在指定手里跨过边界，镜头持续跟拍；有切版在同一动作完成后明确切到对方反应，保留声音。再加一个静止镜头包含短对白，检查镜头是否漂移、台词是否重复和谁在动嘴。每个用例记录原始指示、Strata 实际输入、输出的段稿、实际采样 List 和成片边界时间。这些是待比较的诊断样例，尚未运行。

### 旧 60 秒冻结快照回读

- 只读对照隔离夹具里的 `story-spec.json`、`answer-ab6f8a23b2fb.json` 和 `story-full-run-enqueued.json`。原始中文写的是“一辆即将滑入车道的摩托”，没有明确指定这辆摩托属于谁。AI 规划首次写成第二辆绿黑摩托接近，并把这份摘要保存为故事页。第 4 段又加上分心的骑手和从背景驶来。可确认的偏差是发现并阻止摩托滑入车道的事件，被改成另一骑手驾车接近的险情。不能把“原文明确指定必须是主人公自己的车”算作这条测试的要求。
- 冻结快照确认 `sharedPreamble=false`，AI 摘要没有作为共享前言进入那次采样。六段正文按空白粗计为 154、115、120、125、133、117 词，全部只有一个 `[Shot 1]` 标记，没有显式对白块。前 3 段有独立声景字段，后 3 段没有。这个基线包含多个变量，不能从它单独推断加长、加对白或加切镜的收益。

## 写作链路复核（2026-11-22）

上一轮 60 秒测试需要把两种失误分开看。同一辆摩托溜向车道被改成另一辆车开进来，偏差在 Strata 成稿里已经存在。额外人物、狗的外观变化和部分动作跳变出现在成片中，仅凭现有抽帧无法归因于写作、参考条件或续采。代码还允许自动规划用 AI 梗概覆盖故事页，后续写作会把梗概当故事原文。自动详情同时收到完整脚本、规划、上一批详稿、当前页和全片时间窗。逐段详情则收到完整大纲列表和上一段全文，而且大纲可能滞后于手改正文。这些是请求构造问题。现有证据无法证明上下文长短与旧成片质量之间的因果关系。

| 来源 | 可以落实到本应用的做法 |
| --- | --- |
| [MiniMax 官方 Base 写作指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md) | 首个镜头写构图。只有真正切镜才用新的 Shot 和递增切点。把机位、镜头移动和动作写在一起。有指定对白时保持发言人和原文。 |
| [Continuum 通用 Skill 的 continuity、prompt-quality 和 examples](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/H3-Continuum-Skill-v1.zip) · [作者的 LLM 写作包](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/H3-Continuum-LLM-System-Prompt-v1.zip) | 使用实际启用的输入和现有 List 路由。下一段开场描述同一动作正在继续，落实到接触点、方向、镜头和环境声。保持简洁，明确先后与同时。作者把续接句当作提示词层的候选手法，示例没有画质验收。 |
| [Continuum V3.9 参考图 Skill](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/write-h3-v39-reference-prompts/SKILL.md) · [三段示例](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/write-h3-v39-reference-prompts/references/simple-3x5.txt) | 按段给动作、镜头和起止状态。参考图编号依赖真实路由，角色应有可见的进出场。例子的 V3.9 Reference Images 接线和 `@R` 不适用于当前首帧 List 工作流。 |
| [LongMedia 社区作者的多段写作示例](https://github.com/vizart-vj/ComfyUI-MiniMax-H3-LongMedia/blob/main/docs/MULTICLIP_PROMPTING_GUIDE.md) · [社区同 seed 镜头测试](https://www.reddit.com/r/StableDiffusion/comments/1vl07cw/testing_camera_controls_from_official_minimax/) | 不变量与本段动作分开，接缝可以穿过一个尚未结束的动作。用明确的移动方向、幅度和速度描述镜头。社区测试中 POV 仍未达到作者意图，样例为普通 H3 T2V。 |
| [Continuum #19](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/issues/19) · [静止姿态 #33](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/issues/33) | 节点作者把边界突变与累积漂移分别记录。#33 有上一段或共享文字与当前姿态冲突的可能，报告仍未受控复现。诊断先读实际传给模型的逐段文本与参考图，再做同条件比较。 |

落地后，故事原文保持在故事页，规划摘要只供本次自动写作参考。细写按原文、当前页最新方向、上一页段尾、下一页段首组织。自动模式保留现有最多三段一批的请求，前一批最后采用的段尾只传给真正相邻的目标页。内置预设用 Continuum 专用的短写作指令，自定义预设仍可作为文风输入。写作前对演员、道具、动作先后、镜头和接缝做自查。影视细节继续使用原有篇幅目标，细节集中在已批准动作的走位、镜头和反应。

旧桥下案例的审稿标准：如果第 4 段尾是原摩托前轮刚越过路沿、车把向画面右侧滑，镜头在低机位向右跟拍，第 5 段首接着从同一低机位跟原车，直到骑手伸手扶住、脚落地再制停。蓝车司机等已在场人物只有完成明确动作时进入前景。黄包从谁手上、经过什么接触、落到谁手上，依次在画面里交代。如果用户指定切镜，检查切前动作、切入构图和音响是否接得上。先用已有素材只核稿，待有单独的采样窗口，再以两个相邻段控制参考、seed、每段时长和采样参数比较画面。此轮没有重导、入队或重采已有 60 秒作品。

## 六段稿与既有成片复核（2026-11-18）

| 时间 | 保存稿与抽帧对照 |
| --- | --- |
| 0–10 秒 | 稿中直接写站在车旁、摸车把，省略了过渡。抽帧能读出从车旁走向柱边，缺少足够清楚的寻包起因。 |
| 10–20 秒 | 蓝车司机在稿中开门并介入。15／19.5 秒有黑衣人物从蓝车旁接近，围观者保持背景即可。 |
| 20–30 秒 | 稿要求狗在排水沟找到包。25 秒出现低机位，29.5 秒切近后多出计划外的女性，黄色包的位置仍不明确。 |
| 30–40 秒 | 模型把摩托滑向车道改成第二辆绿黑摩托驶来，实际 35／39.5 秒也出现绿摩托与另一位骑手，偏离原事件。 |
| 40–50 秒 | 同一段并行写推开停放摩托、掀盖捞包及另一辆车通过。抽帧能读出探向路沿和拿到黄色包，预定的通道解除过程不连贯。 |
| 50–60 秒 | 55／59.5 秒分享、和解可辨。黄色包已在骑手手中，抽帧未覆盖完整交接，狗的毛量与体型也有漂移。 |

提示词库已明确开场姿态转换、用户指定事件中的人物和道具身份、可见的救险触发→反应→安全状态，以及同一镜头内可读的道具交接。本次复用已保存的模型读回、接触表及正式 History 播放报告。新写法尚无模型输出或成片证据，听觉与口型仍待验收。

## 最终实跑结果（2026-11-18）

用户选择按官方方式接线后，新生成使用Full Run，Spectrum0.2.30原样保留，未降级正式节点。真实鼠标入队任务`ef292588-fcfe-4b6b-b6f6-68aac2a41a38`，一次提交prompt `7ad9cedd-6c31-4ea7-ab6c-10c14ae1d7fb`；六段Qwen模型稿没有人工重写。Strata成功operation为`a9778a43-63cd-4695-889d-301ad043dce7`；规划一次、详稿分两批，第一批同一已完成响应中的声音字段经生产编译器恢复。隔离实例关闭思考，正式medium设置未改。

Full Run采样及音画封装20分33秒，六段均实际新生成；官方manifest complete、v6、resume_safe=false，应用接受完整新成片而不伪造后续可复用性。父journal完整保留prepared→submit→accepted→validated→published，单History/单版本ID与task一致。真实视频864×480、24fps、60秒、1440帧；音轨32kHz、1920000内容样本、padding0；全解码及SHA校验通过。实际History播放器解码12帧并推进时间，返回可达。数据保留在忽略的测试fixture；未注入正式资料库。后端日志有早先Proactor管道清理异常，但本prompt成功完成，不能笼统称整个会话零异常。

质量依据为18张实际抽帧（每段0.5/5/9.5秒），并非逐帧运动或听觉验收：

- 0–20秒：桥下空间、蓝车、骑手/狗基本延续，有人物走近和对峙，冲突意图依赖提示词才能明确读出。
- 20–40秒：近景推进到路边人物/狗，摩托进入，情势有变化；出现计划外女性，黑衣人物身份不稳定，摩托与人物动作存在跳变。
- 40–60秒：黄色包被拾起、人物互动并出现和解结尾，形成事件推进；黄色包的回收位置和动作因果不够清楚，狗末尾毛量/体型明显漂移。
- 音轨可解码且非静音，均值−33.7dB、峰值−8.5dB；这些指标不证明语义、对白清晰或口型同步。

结论：单图+方向→模型整片规划/六段详稿→真实入队→Continuum/Spectrum完整60秒→History播放的技术链路通过；叙事呈现部分达标，不能声称可稳定生成完成度高的短剧。后续质量方向是缩小活跃角色、明确首帧动作过渡、把救险拆成更少的可见动作，并检查道具交接与人物出入场；本次不通过人工改稿或额外重采来覆盖失败细节。

Full Run保留官方show_preview使采样回调可达；应用按各段步循环汇总进度，避免首段完成就显示整片采样完成。实际本次图是在该最后修复之前冻结，只有解码/封装进度被看到；进度修复以定向回归验证，不冒充第二次GPU实测。连接响应正常的Full Run取消固定无进度超时，实际后端错误、断连与用户取消仍保留。

最终verify退出0：343文件3324单元、7文件132集成、干净双端typechecked build与440对比度全部通过；Python9收据/15守卫通过后未再改Python。测试窗口关闭、原App拥有的runtime已停止，Electron44708及4327/18329/43137监听均复核不存在。报告为Harness隔离资源清理，不冒充原生窗口关闭生命周期验收。正式资料库与用户其他应用未修改，生成文件和旧失败Run均保留。

以下记录保留调查过程，早期“尚未实跑/下一步”以本节结果为准。

## Spectrum故障重新定性（2026-11-18）

真实首组20步采样已完成，Spectrum实际11次/预测9次、无fallback。失败manifest为v6但resume_safe=false，其Spectrum字段为`unsupported provider source change`。本机干净Spectrum0.2.30（7df883bb2361b7884ad789e97effd1dc37c8963a）与Continuum的PUBLIC_SOURCE_029逐文件比较，55个文件仅minimax_h3.py不匹配；0.2.30该文件新增PackedLayout和FinalLayer grids兼容。这个源码审计拒绝不由步数、显存阈值或Spectrum开关取值修复，也不证明Spectrum采样不兼容。

同时存在应用执行策略因素：`workflows/minimax_h3_continuum_v38_managed_extend_api.json`固定Review Each Chunk；`compileContinuumGroupWorkflow`沿用该模式；group_receipt.py要求每个已采样组均可跨Queue复用。官方[V3.9指南](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/docs/USER_GUIDE.md)的默认示例采用Full Run，[README兼容表](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum#compatibility-and-verification-scope)区分新生成可用和复用合同匹配，并明确有限审计含upstream0.2.29。[Spectrum0.2.30发布](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.30)说明新Core兼容变更；不能据此宣称所有第三方续跑已验证。下一步优先评估官方Full Run接线，不默认要求正式降级；现有失败Run不改写为可复用。Full Run在本应用/本机的60秒成片尚未验。

2026-11-18。目标：真实历史首帧 + 一句故事方向，经 Strata/QwenFlash 形成至少60秒、有起因/冲突/转折/结局的短剧，而非延长同一个动作。延续本 TASK，不新建第二份计划。

## 资料与取舍

- [Continuum当前README](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/README.md)、[官方节点作者的解析器](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/main/v2/prompts.py)：List模式按顺序接收每段独立文本/JSON字符串数组，Timeline使用整片时间窗；全局前言会重复。继续时应提前写好完整计划，不能把分页当成自动切镜。应用保留List模式，在稿内用局部时钟，整片坐标仅用于事件分配，不重复整个故事。
- [MiniMax官方Base指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)、[Comfy官方H3指南](https://github.com/Comfy-Org/docs/blob/main/tutorials/video/minimax/minimax-h3-prompt-guide.mdx)：画面、动作、镜头、台词与音效共同构成执行提示词；以可观察行为呈现人物选择，台词关联稳定说话者；连续运镜不必另起Shot。保留三个核心音画字段，仅在真实切镜时增加Shot与递增局部时间。后续页承接已有状态，不重复首帧对齐。
- [社区Continuity Studio作者的Story writer](https://github.com/KadoBOT/ComfyUI-H3-Continuity-Studio/blob/main/guide/story/writer.md)、[作者社区说明](https://www.reddit.com/r/StableDiffusion/comments/1xlp0kg/i_made_a_comfyui_tool_to_bring_back_earlier/)：规划和片段写作分开，角色/道具外观稳定，片段从前一段实际达到的姿态继续；结构合法不代表成片质量。借鉴规划→分段与边界状态方法，未引入该扩展节点、额外运行服务或新的Timeline UI。

新增作者编写的 `src/core/prompts/h3/continuum.ts`，服务复用该提示词库。规划涵盖观察到的人物/地理、创作假设、目标/利害、事件因果、道具归属和结局；逐页outline明确进入状态→新事件/选择→后果→离开状态→镜头/声音。详稿使用上批已采用末页及完整计划，6段形成6个独立采样字符串。没有添加词数/关键词/硬件推荐等新准入门槛，既有结构、页面身份、锁定与陈旧响应保护保留。

## 当前真实测试

- 从实际资料库只读加载137条视频历史、筛出36张可用原图。联系表人工检查后选资产 `207d1be6-2bef-4d2b-b615-8ab9c04b051e`：桥下涂鸦街区、蓝车、骑手、流浪汉与黑狗。
- 用户方向仅一句：骑手误认流浪汉偷黄色食物包，蓝车司机追问，黑狗引出真正的落包和滑向车道的摩托，众人救险后分享食物。新增黄色包明确属于故事发展，不宣称它原本就在图片中。
- 独立空队列/空历史fixture `temp/create-smoke-pm9q1h`；App CDP1222，自有Comfy18329、Strata43137。固定用户已安装Strata0.2.15/c775728、QwenFlash IQ3_XXS、medium思考；480p为本次试跑选择，不是产品上限，Spectrum开启，6×10秒。
- 实际拖图、输入方向、确认布局、真实增强按钮已触发，operation `b934659a-f43e-43f2-8388-ca573aa36732`。当前正在准备模型/推理，尚未采用分段、入队或H3采样。报告持续保存在忽略的 `temp/long-story-20261118-*`，不得据此宣称60秒短剧已完成。

## 实际资源恢复

首次调用在原生加载前被应用 `reserve+15GiB` 的固定20GiB估算挡住（实测空闲16.3GiB）。删除这项估算准入条件后，第二次已原生加载权重/预热，但又被应用2GiB GPU余量监测中止；原生日志CUDA余量约4.8GiB，并无后端OOM。这两个失败都保留，没有替换故事或提交H3任务。

当前原生Strata会话取消上述GPU估算拒绝与低余量误杀，保留告警、实际后端错误、取消、未知监测恢复及严重持续commit紧急处理。Windows会话reserve额外计入全局已占显存，只减少本次自动专家缓存，不终止其他应用或更改已验证基础pack。75项资源/服务回归通过。原生第三次调用已进入加载，专家cache缩至5.17GiB，此时全局空闲约6.6GiB；不是性能或故事质量证明。最新operation `dc14fdc0-231e-4cd8-a62f-a799cb7d1259`，使用同一保存草稿；恢复后CDP6054/PID533544，端口/PID以launch.json为准。

第三次在持续生成约27726个思考字符时被应用600秒请求总时限中止，非无响应；取消正常原生调用的固定时限，保留显式测试deadline、用户取消、实际连接/进程错误。原有仅DeepSeek超10分钟的虚拟时钟回归扩展至Qwen加载/推理。补充longVideo秒数/段数安全元数据及思考计数进度；真实日志已确认60秒多段请求。另修复真实runtime进度导致renderer重挂载后，旧控制器以signal.aborted丢弃完整模型包的问题；只对仍匹配的live脚本采用，文字/布局/锁定变化仍拒收；沿用原按钮计时及取消，无新开关。

第四次仅在隔离实例选择low思考、detailed-cinematic，正式设置不变；原生已产生5483个思考字符，但WMI/nvidia-smi采样暂时超时被旧监测器中断。引擎没有报告故障。现为原生会话使用明确的probe-unavailable类型，监测丢失告警重试，不中止后台计算；用户取消仍清理采样，确定的持续严重commit风险与后端错误保留。77项监测/服务回归及双typecheck通过。第五次operation `d76e4618-84c2-4e53-a40b-f8443e015a67` 已真实按钮触发，CDP14483/PID608984。尚未模型稿采用或H3采样。

已通过的综合检查：342文件3314单元、7文件132集成；干净含双端typecheck的生产build、440对比度；这轮全量在最后的监测恢复修复之前完成，受影响77项及双typecheck/后端编译已单独复核，后续整片执行后再收敛最终证据。所有失败日志与fixture保留，不自动重提任何不明H3任务。

第五次low思考真实持续超过十分钟仍有输出，最终累计46557个思考字符，未判为崩溃。为先检验较快的单图成剧，操作员主动取消该次规划；AppApi确认cancelled，原生模型保持resident，同一Strata parent486260/native625320没有重载，没有保存任何半稿。只在隔离实例选择off思考；正式medium设置不变。还修复多段按钮未接现有共享busy状态导致取消后停留在计时/取消态的问题：复用共享状态，完成后仅在Create刷新，不影响其他页播放。

第六次operation `b0d7317d-4fcf-40c2-b60d-f011c37f342a`，关闭思考、detailed-cinematic，实际按钮/同图同句方向，已完整生成规划（1923输出tokens，finish=stop，思考0）。当前按完整计划写1–3段，之后4–6段；只有整包通过原子采用后才审稿入队。当前仍零H3采样。第五次的长思考不作为模型质量失败，off与medium也不是同条件性能对比。
