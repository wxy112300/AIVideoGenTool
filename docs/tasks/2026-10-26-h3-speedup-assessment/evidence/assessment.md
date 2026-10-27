# H3 加速更新盘点

类型：Evidence；状态：source/files assessed；日期：2026-10-26。范围及当前决定见 [TASK](../TASK.md)。本报告是带日期的评估，不维护第二份生产 catalog。

## 基线与证据边界

应用 HEAD `7c8db8c5d501782b67c65a556bc0bf24c413e2d3`；工作区开始时已有大量未提交的 renderer、节点、依赖扫描和长视频修改。已读受影响契约/catalog 的当前文件及 scoped diff；本轮仅新增本任务文档，未覆盖它们。旧升级任务已于 10 月关闭，作为历史证据使用，不恢复其实施授权。

通过应用已知 userData 状态仅读取必要设置，并按 `electron/services/comfy-discovery.ts` 区分 Desktop 安装容器、嵌套核心与 Documents 数据根。报告不保存机器绝对路径、提示词、原始 state 或媒体。

| 所选实例组件 | 本轮离线读取 | 限制 |
| --- | --- | --- |
| ComfyUI | 自报 0.42.0；HEAD `40dcb30a96fc345f54632c56af81a4a320c2fc1e`；origin 为 GitCode 的 ComfyUI 镜像；Git status 无输出 | 不是官方 0.42.3 tag；未刷新核心上游，不建议仅为本次研究升级核心 |
| Python 包目录 | Torch 2.10.0+cu130；comfy-kitchen 0.2.39；SageAttention 2.2.0+cu130torch2.10 | dist-info 身份，不等于导入、内核执行或速度验证 |
| Spectrum | `806fe498d574a726fecb8818917f00a4b993fd77`；官方 xmarre origin；status 无输出 | catalog 推荐 0.2.29；没有本轮上游 HEAD 刷新或运行验收 |
| KJNodes | `d3cfe21625e5170126ce06fbfcfe1d88108688c3`；kijai origin；status 无输出 | 本轮不全面评估 KJ 更新 |
| PlagueKind | `d58d006a4ea32c25c06499f2ff104f0852a045a6`；官方 origin；有未跟踪 pycache | 当前应用 Turbo-SLA 用核心 BSA，不是该包实验后端 |
| 应用 H3 节点 | VERSION 0.3.6，无 .git | 不能用空 Git status 宣称源码 clean；仓库当前另有未交付修改 |
| 用户策略 | Sage Triton、sparse off、compiler disabled | 配置读取；不代表每个模型实际图都使用该后端，Omni 有专用策略 |

本机所选 LoRA 目录可见：Larry v4 pruned（620,285,592 bytes）、Larry 旧 ckpt850（779,849,816）、LightX2V FL2V v1.1 768p（1,956,192,992）、旧八步 v1.0（1,956,193,000）、Turbo-SLA（1,956,192,992）、FL2VA PDD（1,725,921,392），以及旧缩秩四步。未找到 catalog 四步 v1.2、Ref2V Turbo、新 LightX2V 候选、DMAD 或 HyperFlow 的对应文件名。未做大文件全量 hash，不判定同名权重内容相同，也不排除别名文件。

现有 diffusion_models 可见普通 FL2VA / Ref2VA pruned INT8（各 20,970,379,616 bytes）与 FastH3 Omni INT8（22,213,723,064 bytes）；不等于已安装 FastH3 V2。没有请求 `/object_info`，没有启动实例；schema/graph/UI/runtime/benefit 均不属于本轮新增证据。

## 候选与决定

| 方案 | 当前应用 | 上游与实际缺口 | 决定 |
| --- | --- | --- | --- |
| LightX2V FL2V | 四步 v1.2；八步文件不含 768p 后缀的 v1.0 | 10 月 20 日出现四步 v1.3 768p 与八步 v1.1 768p；旧八步是独立的 544p 训练版本，不能把同为 v1.0 的 768p 文件当作同一权重 | 第一优先审计/试验；新文件与旧 ID 分开，不覆盖旧队列 |
| LightX2V Ref2V | 四步 v0.1 | 新增 768p 四步 v1.0、八步 v1.0/v1.1，应用缺少这些独立配方 | 第一优先，价值在参考路径；先单图再多参考，不能套用 FL2V shifts |
| DMAD | 没有 catalog/采样策略接线 | 新 T2VA student，官方 ComfyUI 转换可使用原生采样节点 | 第二优先新增小样；不默认叠 Spectrum/稀疏/其他 Turbo，不据“4.1x”改默认 |
| Larry | v4 step600 EMA 的 drbaph pruned 转换，6/8 步、Euler/Beta、shift 12/6 | 原作者仍推荐 v4；原作者当前 Simple/自有 sampler 路径与转换版配置不同 | 保留权重，复核转换版采样/音频；差异不是已确认 bug |
| FastH3 V2 + VSA | 未接入；已有的是独立 Omni R2V | V2 是八次 forward 的 T2VA checkpoint，video shift 10，训练为 80% sparse；未蒸馏 FL2VA/Ref2VA | 低于前两项；不作为 Omni 或所有 H3 的替换 |
| Spectrum / Sage / 核心 BSA | 已有且近期维护，不是“几个月都未更新” | 核心/内核更新与蒸馏权重是不同变量；没有本轮新版本收益证据 | 保持基线，避免同时升级所有层导致无法归因 |

### LightX2V：已固定文件身份，参数仍需补证

官方 [HF 元数据](https://huggingface.co/api/models/lightx2v/Minimax-h3-Turbo) 返回 repo SHA `30f485ed874aa44c8183348ad361c5eabad318da`，lastModified 2026-10-20。不是仅模型卡更新：下面四个文件页面都显示该次权重发布，并公开了不同 SHA-256。

| 文件（均为 minimax_h3_ 前缀、.safetensors 后缀） | 官方 SHA-256 | 上游显示大小 |
| --- | --- | --- |
| [fl2v_turbo_4step_v1.3_768p_comfyui_bf16](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_fl2v_turbo_4step_v1.3_768p_comfyui_bf16.safetensors) | `70103fd0d80a947ed4e7fe6f88915863d54ef22c5cab03bd5d2fd649385ffe1e` | 1.96 GB |
| [fl2v_turbo_8step_v1.1_768p_comfyui_bf16](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_fl2v_turbo_8step_v1.1_768p_comfyui_bf16.safetensors) | `fb4c00361c94bad47f878d5e096c6cab2f45063b0968bd5756dcb7da6936f53e` | 1.96 GB |
| [ref2v_turbo_4step_v1.0_768p_comfyui_bf16](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_ref2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors) | `b4da466e43588004097dfbcde245ccc439c34a26bc997cb76a0b53a1d549ea0d` | 1.96 GB |
| [ref2v_turbo_8step_v1.1_768p_comfyui_bf16](https://huggingface.co/lightx2v/Minimax-h3-Turbo/blob/main/minimax_h3_ref2v_turbo_8step_v1.1_768p_comfyui_bf16.safetensors) | `e56863a7524e0300729cbb7b64cc8b548d90698c1abbf7d83898b0122fbe1e81` | 1.96 GB |

精确 bytes 尚未取得：终端 HF 元数据请求 SSL 失败，网页显示的是取整大小；没有关闭证书校验。上述页面为 main，实施前须在固定 repo SHA 再核对文件指针。未下载权重、未核对本地内容 hash。

[官方代码 README](https://github.com/ModelTC/Minimax-H3-Turbo) 的规格表仍展示较旧配方，与 HF 最新文件清单有时间差。它已区分旧八步 544p（12/3）和八步 v1.0 768p（6/3），但不能据此推定最新 v1.1/v1.3 的所有参数。Ref2V 的 reference resize 也需要匹配训练策略；先固定候选版本的完整工作流及音视频 schedule，再接 catalog。版本号本身没有证明画质、音频或速度更好。

### DMAD：四步不等于把 Euler 的 steps 改成 4

[官方源码](https://github.com/Yzmblog/DMAD) HEAD 查询为 `32ac967324eb0ebba654faeffda99f5def1e86cb`（2026-10-21）。[ComfyUI 说明](https://github.com/Yzmblog/DMAD/blob/main/comfyui/README.md) 与 [模型卡](https://huggingface.co/ZhengmingYu/DMAD) 提供 full_critic / lora_critic 两个 ComfyUI 布局文件，各约 2 GB；HF 固定 revision、精确 bytes/hash 本轮未取得，实施前补齐。

候选采用强度 1、CFG 1、LCM/Simple、video/audio shifts 12/2；首个实验限定 T2VA。作者将学生训练在文生音视频上，参考输入泛化不算已验证。无需先安装自定义 DMAD sampler；15 秒低显存官方图另依赖 H3-Optimizations，而该节点在应用已 retired，不能为研究直接恢复其生产状态。先做不依赖它的短样，再评估长样及显存策略。官方演示的受限显存 H200 时间不能当作 4090/5090 实测。

### Larry 与 FastH3 的适用边界

[Larry 原始模型卡](https://huggingface.co/larryvrh/MiniMax-H3-Turbo-Lora) 仍推荐 v4-600，尤其 6–8 步。应用使用的是 [drbaph 转换仓库](https://huggingface.co/drbaph/MiniMax-H3-Turbo-Lora-ComfyUI) 的 pruned 文件，不能把更新原作者节点等同于更新应用实际图。需比较转换版 Euler/Beta 12/6 与作者 Simple 路径的音频和运动表现。HyperFlow 等新分支可留第二轮，不扩大为全社区 LoRA 穷举。

[FastH3 V2 模型卡](https://huggingface.co/FastVideo/FastVideo-FastH3-8-Step-V2) 与 [API](https://huggingface.co/api/models/FastVideo/FastVideo-FastH3-8-Step-V2) 对应 SHA `3da2ddfe1954d9cda4c05b643dc0f26007a655c5`，T2VA-only、八次 forward、video shift 10、VSA-H3；困难运动/细节/音频仍有质量限制。本机应用策略只让 Omni 使用 VSA，接 V2 需要独立模型策略和实际 producer 验证，不开放全局 VSA。

现有 [Omni 任务证据](../../2026-10-21-fasth3-omni/TASK.md) 在 10 月 24 日已验证 480p/5 秒输出与 sparse producer，但 768p/15 秒性能 A/B 未做。本轮未重跑；不把历史 66 秒当作用户帖子的 44.7 秒对照。

## 最小后续验证

先补齐 LightX2V 新配方的固定来源与 DMAD 权重身份。新策略保留旧 ID、旧队列/History、普通无 LoRA 路径；不改用户当前草稿。依次进行 source → files → 实际 schema/graph → 缺输入恢复与真实按钮 task ID → 短样输出/History → 同参数 A/B。

首轮只选择 FL2V 一个新候选与旧配方、Ref2V 一个新候选与旧配方、T2VA DMAD 与无蒸馏基线；每个 case 固定输入 hash、prompt/seed、1344×768、124 帧/24 FPS、模型及 VAE。不同训练配方使用各自正确 sampler/shift，记录这是整套配方比较；额外的 attention/cache 实验每次只改一个变量。冷加载、编译、暖采样、VAE、总时长和实际输出时长分开，不能仅凭步数估算倍数。质量比较至少覆盖人脸/手部、运动、参考保真、语音/口型与环境声。

用户给出的 129.0/61.4/55.8/44.7/31.7 秒目前只有摘录，未定位其同一条原帖的完整设置与视频；没有把另一个社区 benchmark 冒充原帖。其倍数是候选线索，不是本机承诺。完整相同硬件/模型量化/帧数/计时范围未证实前，不能称为公平复现或把 5090 成绩外推到当前 4090。

本轮没有任何安装、下载权重、生成、默认值更改或资源接管；文档改动不需要产品 build/GPU 验证。
