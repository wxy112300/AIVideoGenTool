# H3 原生单次 30 秒：证据、现有限制与接入评估

- 类型：Research / source-and-graph assessment；状态：research-complete / implementation-proposed。
- 日期：2026-10-18；范围：现有Create内H3原生T2V/I2V/FL2VA/R2V的长采样，重点30s；不评估Continuum/自动拼接作为替代实现。
- 当前摘要：[TASK](TASK.md)；相关但独立：[长视频编排计划](../2026-10-18-long-video-director/PLAN.md)。本轮无本机GPU生成或真实输出解码。

## 1. 结论与证据等级

**原生单次30s不是只有模糊宣传。已有可检查的公开workflow，确认把完整约30s序列交给一个原生H3采样器，并有作者运行日志。当前应用15s是产品验证预算，不能表述成模型/原生节点不可逾越的硬上限。**

公开graph审计能排除该graph本身分段拼接；作者日志/视频是外部运行报告，不等于本机可复现、稳定成功率或同一软件版本。这里按可获得证据标记：

| 级别 | 含义 |
| --- | --- |
| A | 取得原始workflow，追踪实际输入/子图/输出，排除时间拼接；同时有作者运行报告或日志。 |
| B | 作者明确报告原生/单次及参数，但没有取得完整graph，不能独立排除全部隐藏执行。 |
| N | 原生长时长负结果或质量限制，保留以避免只选成功样本。 |
| X | 已确认拼接、改变播放FPS、只有空间第二遍，或被原作者撤回；不计入原生30s成功证据。 |

“原生单次”指一次完整时间序列的采样过程。采样有多步/多次DiT求值、attention内部切块、VAE分块解码、空间超分、prompt里包含多个[Shot]，都不自动构成时间续接。反之，一次Queue、一个prompt、最终只有一个MP4，也不能证明只采样一次。

## 2. 排除拼接后的主要资料

| 来源 | 已取得的事实 | 判断与限制 |
| --- | --- | --- |
| [3090：30 seconds in one go](https://www.reddit.com/r/StableDiffusion/comments/1vvd0ac/minimax_h3_30_seconds_in_one_go/)；[原始workflow](https://pastebin.com/WXwgXYbZ) | 作者报告0.4MP、30s、3090、Turbo/Sol/Spectrum，约570s，成片用了4次尝试。公开日志出现一次8/8采样与569.99s总执行；本轮取得并展开原始JSON。 | **A：本轮最直接的原生30s依据。**没有把“多分镜prompt”当成“多段采样”。未取得其本地精确revision/原输出元数据，不能算稳定成功率。 |
| [42s原生Ref2VA](https://www.reddit.com/r/StableDiffusion/comments/1vnafvc/minimaxh3_can_generate_42s_videos_natively_on_an/)；[原始workflow](https://pastebin.com/Vi21NQUH) | 作者报告1008帧、24fps、1376×768、RTX PRO6000、4947s、约90GB显存；公开图实际设置1008帧，一次H3 sampler，另有bypass的SeedVR2后期。 | **A：超过30s的独立graph证据。**图本身可排除时间拼接；90GB/42s不能当24GB/30s资源要求。作者旧文中“节点最大1008/训练324”与固定Core源码不同，以源码为准。 |
| [Caligine Films：30 seconds single generation no cuts](https://www.reddit.com/r/StableDiffusion/comments/1vjwy2z/minimax_h3_30_seconds_single_generation_no_cuts/) | 作者声称单次无剪辑，1024×576、6m46s、288GB显存，并在评论说明租用云机器。 | **B：第一手案例，未取得graph。**288GB不是原生30s的最低显存；也不将“no cuts”标题当图级证明。 |
| [30s I2V测试与复测](https://www.reddit.com/r/StableDiffusion/comments/1vsqf39/test_minimax_h3_img_2_vid_apologize_for_the_low/) | 作者明确说默认I2V模板可本地30s。另一用户报告12GB+64GB RAM，0.2/0.3/0.4MP分别14m11s、26m27s、2h11m14s。 | **B/N：I2V及容量临界的补充。**无完整graph/遥测，速度不可转用；其“显存换页”只是作者推测，不作为已定位根因。 |
| [Longer MiniMax H3 videos](https://www.reddit.com/r/StableDiffusion/comments/1w7ph1k/longer_minimax_h3_videos/) | 一位5090用户称纯单片做到30s/1MP，20–25s后更不稳定；原帖作者称30–45s会重复前几镜头。 | **B/N：可生成与语义正确分开。**该讨论中的90s Motion Context和低FPS输出不并入此条。 |
| [5090：27s单序列试验](https://www.linkedin.com/posts/thejab_tweedle-test-minimax-h3-27-seconds-in-just-activity-7500013093943508992-Ye90) | 作者报告27s/0.8MP约9.3m，使用0.4MP四步后0.8MP两步；到30s出现幻觉/不一致或无法完成。 | **N，空间两阶段。**不是时间拼接，但不计作严格“一轮采样30s成功”。证明不同优化权重/采样组合不能共享成功结论。 |

这些记录支持“本地原生可尝试30s，并有真实成功报告”。它们没有确立通用最优步数：3090案例用了8step Turbo，另一原生长片用户更偏好20step/无Turbo；两者都应保留，不能据某条评论禁止或强推Turbo。

### 2.1 已明确排除的资料

| 资料 | 排除原因 |
| --- | --- |
| [热门12GB 30s seamless workflow](https://www.reddit.com/r/comfyui/comments/1vw036i/30second_minimax_h3_seamless_imagetovideo/) | 作者后续说明3×10s，使用H3MultishotMemorySampler；一次运行不是一轮全长采样。 |
| 同讨论中的Motion Context / Continuum / Project Suite / Endless Sampler / 90s music video | 带上一片段状态、多时间窗口或多clip组装；属于另一个长视频功能。 |
| [长视频讨论中的24→16/12/8fps做法](https://www.reddit.com/r/StableDiffusion/comments/1w7ph1k/longer_minimax_h3_videos/) | 通过降低输出播放FPS延长秒数，不证明生成了24fps×30s的新动作。单纯RIFE补帧也不计入原生30s。 |
| [第三方16GB/30s性能表](https://h3video.net/minimax-h3-vram)引用的[Tomiigo当前仓库](https://github.com/Tomiigo/minimax-h3-16gb) | 当前作者README已改为约9.4s参考编辑，并明确旧版guide被撤回；本轮不沿用第三方的30s/736帧/显存数字。GitHub匿名API限流，当前main SHA未取得，记录为unknown；可核查当前README的撤回声明。 |
| “30 seconds”指总渲染耗时，或只有“single prompt/one click” | 缺少输出时长、帧数、完整采样路径，不能证明本题能力。 |

## 3. 3090原始workflow的逐路径审计

来源为作者在原帖评论主动提供的Pastebin，页面日期2026-08-23；本轮下载的是JSON文本，未下载或执行其媒体/代码。

- bytes：`51637`；原始UTF-8文本SHA256：`aa333ccd60e1c0431a4950bb776d07861e5806c495d175c675f1fda8e76c183f`。
- root有一个UUID型subgraph node #140和一个SaveVideo #92。已展开其definitions.subgraphs，未把UUID节点误认为没有可见内部实现。
- root #140实际`value_1=30`，映射子图输入slot5→link206→PrimitiveFloat #133→link205→ComfyMathExpression #132→link199→MiniMaxH3ImageToVideo #131的length。
- 运算按24fps向上对齐`17k+5`，30秒对应736帧。子节点保存的2秒/73帧widget是有连接时的旧默认，不能覆盖root传入30秒；本轮按连接追踪，未只扫widgets。
- #131的完整AV latent经link188直达唯一SamplerCustomAdvanced #125；没有temporal slicer、Continuation、Motion Context、loop或clip concat节点。音视频latent进入各自VAE decode，再走CreateVideo #130、24fps→root SaveVideo。
- 外部`turbo_steps=8`经switch接BasicScheduler；scheduler自身保存的4步默认不是执行值。采样器为res_multistep、simple调度，Turbo打开；FL2VA pruned INT8、Qwen32B NVFP4、FP16视频VAE与FP32音频VAE。
- root的ResolutionSelector实际为1:1、0.4MP、multiple32，约640×640生成；#131里未连接生效的1344×768不是实际画布。保存路径中有RTX空间超分×2，保持24fps，没有时间插帧；不能拿最终像素当基础采样分辨率。

静态路径：

```text
root duration=30
  → 合法帧数736
  → MiniMaxH3ImageToVideo：一次创建完整JointAV latent
  → SamplerCustomAdvanced：一份noise / guider / schedule
  → Video VAE + Audio VAE decode
  → 可选空间RTX超分（该保存图启用）
  → CreateVideo 24fps → SaveVideo
```

Spectrum的预测/离线replay可能增加模型求值，Sol改变attention策略；它们不在这个graph里建立前后clip的时间依赖。这里的“单次”不等于模型只forward一次。没有作者安装源码hash，不能把本图各第三方wrapper的精确数值/内存行为当成当前应用已审阅配置；后续复现优先使用本应用已有兼容组合。

结论：该公开graph可以排除3×10s/2×15s时间拼接，也排除靠降低FPS或插帧凑30s。其单轮8/8日志与之吻合，但没有逐node runtime trace及原文件解码元数据；本轮不将其升级为本机完整运行证明。

## 4. 42秒graph作为交叉核对

来源页面日期2026-08-13；bytes `39124`；SHA256 `36b7c8c5283c70a2154e78eb9f0303f955013d5e82233d45489ff88bc83f2364`。

实际主路径为Ref2VA #12的1008帧→SamplerCustomAdvanced #13→AV解码→CreateVideo #5（24fps）→SaveVideo #11。ResolutionSelector为1MP、16:9、multiple32；采样路径使用Sol patch、sigma shift和ClownSampler，不能把它当原生默认sampler的性能样本。

另一个KSampler #33、第二CreateVideo #38与SaveVideo #39在SeedVR2空间后期链，保存为mode4/bypass。按实际连接与bypass可以排除“看见两个sampler就是两段拼接”的误判。1008帧本身符合17k+5，正好42s；没有独立clip的时间concat或重新以末帧起片。

## 5. 上游为什么允许，而官方仍写15秒

固定源码：[Core `6607f36b53c7b695b160ac5b52d595e9e3752a2d`](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy_extras/nodes_minimax_h3.py)。原生Empty AV、I2V与Ref2VA均允许length到3600；I2V/Empty tooltip注明训练范围约124–362帧，超过部分未经验证。`_empty_av_latent`按完整length构建video/audio嵌套latent，没有在此处按15s切片。

这一宽输入范围在[最初H3支持的v0.30.0](https://github.com/Comfy-Org/ComfyUI/blob/v0.30.0/comfy_extras/nodes_minimax_h3.py)就存在，不是必须更新到某个新“30秒权重”才解锁。[原生Sampler实现](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy_extras/nodes_custom_sampler.py)接收完整latent；已查模型forward按layout/position构造RoPE，不能从15s文档推定硬编码的15s拒绝。

[官方模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)仍公布4–15s/24fps。三层应分开：**官方公布/常规训练与验收范围、原生接口可输入范围、实际可用质量和机器资源范围**。schema的3600不是150秒稳定能力承诺；30秒也不是必须安装的新checkpoint或新的商业API模式。

| 请求秒数 | 原生合法帧数 | 实际秒数@24 | video latent T | audio latent T@40 |
| --- | --- | --- | --- | --- |
| 15 | 362 | 15.0833 | 107 | 603 |
| 20 | 481 | 20.0417 | 142 | 802 |
| 25 | 600 | 25.0000 | 177 | 1000 |
| 30 | 736 | 30.6667 | 217 | 1227 |
| 42 | 1008 | 42.0000 | 297 | 1680 |

表为读取固定helper后做的纯算术检查，尚未运行VAE。申请30s的完整原生网格会多约0.67s；UI需要显示有效时长。若需要精确30s，可在最终导出裁切，但保留原始736帧AV与完整时间身份，不能把manifest伪写成720帧。

资源也不能直接乘二估算。30s时video latent T从107变217，原始输出帧从362变736；attention/激活、文本参考、wrapper历史、VAE与编码峰值共同决定显存/RAM。同736帧的一份RGB float32数组，640×640约3.37GiB，864×480约3.41GiB，1344×768约8.49GiB；仅是数组字节算术，尚未包含拷贝、模型、音频和编码缓冲，不是实测峰值。

## 6. 本应用15秒限制的真实位置

本地基线0.66.0 / `475722c…`，只读当前TS与内置API graph。

| 层 | 当前实现 | 放开影响 |
| --- | --- | --- |
| catalog | [FL2VA](../../../src/core/catalog/models/minimax_h3_fl2va/definition.ts)、[Ref2VA](../../../src/core/catalog/models/minimax_h3_ref2va/definition.ts)等设15s/362帧；Q3实验档另为5s/124帧 | 单独原生profile预算；不能给全部H3、Q3、Extend、Continuum一起加倍。 |
| UI | [page-controller](../../../src/renderer/pages/create/page-controller.ts)的updateDuration从safety取max并clamp；view-model投影同一安全值 | 现有Create时长输入即可扩展，无需先建“长视频作品”。 |
| shared safety | [workflow.ts](../../../src/core/workflow.ts)的generationSafetyForTask先检查秒数再检查帧数 | 只改15→30会仍被362帧拒绝；需要同步736帧预算且限定模式/profile。 |
| 主进程入队 | [queue-enqueue.ts](../../../electron/queue-enqueue.ts)重新执行generationSafetyForTask | 不是只改HTML max；API与UI要一致，保留主进程校验。 |
| 图与快照 | [I2V API图](../../../workflows/minimax_h3_i2v_api.json)的length为FRAMES占位，T2V图同一路；[task factory](../../../src/core/queue-task-factory.ts)保留duration/profile | 已有单轮graph，预计可复用；实际图和wrapper需验。等待/运行快照不追随新的draft或全局设置。 |
| 帧数 | frameCountForTask/generationFrameCountForTask使用24fps与17k+5，未在该helper截断362 | 已能算出30→736；不能改FPS/RIFE冒充更长原生动作。 |
| prompt | [h3-prompt.ts](../../../src/core/h3-prompt.ts)按有效时长生成timeline；普通backend扩写预算有2048/3072上限，Strata另有自动预算 | 时间不硬截15，但30s复杂动作/多镜头正文与门禁要真实验；不能认为单纯UI放开就有足够prompt质量。 |
| AV与History | [collector](../../../electron/services/h3-native-av-collector.ts)、[artifact committer](../../../electron/services/native-av-artifact.ts)按实际frame/shape计算，不是固定107 | 静态上支持217/1227时间shape，仍需真实序列化/hash、重启和History播放验收；完整30s latent不自动获得Extend/managed资格。 |
| 高分辨率/加速 | 原生1080/1440可能走两阶段AV refinement；Turbo/attention/cache按现有family限定 | 480p30通过不能推出768p、2K第二遍或所有量化都通过；空间第二遍也不属于Continuum长片编排。 |
| 文案 | workflow-messages的h3FrameRange写“官方帧范围” | 应改为公布范围/当前验证预算与实验范围准确表达，不能把应用362帧保护说成模型绝对上限。 |

这条路线仍是**一个generation task、一个prompt、一个原生输出与现有History身份**。不需要长片plan、子任务DAG、多个Run、自动合成或跨模型分镜服务。后续长片可以选择调用30s原生能力，但两项功能可独立交付。

## 7. 建议怎样放开

建议独立提供现有Create的“原生长时长”能力：普通已验15s保留，允许显式选择20/25/30s候选范围。可以是现有高级时长档/实验profile，不新增顶层Create模式；最终产品选择在实施时落入统一capability，避免第二份模型catalog。

优先FL2VA pruned INT8的T2V/I2V、360/480/540分辨率，保留当前sampler/VAE/attention和无Turbo路径。标准20步与已支持Turbo分别记录，先复现一个已有兼容组合，不照抄作者旧Sol/Spectrum节点参数或修改模型/驱动/分页文件。R2V、首尾帧、768p、高分辨率二次采样、低量化档在各自证据成立后再开放，不能从相同family推导。

真正阻塞“宣布可用”的是本机完整生成/质量/资源和保存闭环，已经不是“是否全是拼接”的资料缺口。首次实验按机器当前可用资源和已有进程归属做admission；不是硬设24GB必能跑30s/768p。

### 有限验收顺序（未来实施，本轮不执行）

1. **静态接线**：冻结原生profile身份与30/736预算；UI/主进程一致、旧profile/旧queue不变；编译API graph确认完整length736、一条原生采样路径、24fps、无时间拼接/RIFE。
2. **基础输出**：同一简单连续动作，已有15s证据可复用；新增20s→30s各一次，以480p为起点。逐段扩大，不换seed循环寻找成功；若20s资源/稳定性失败，停止30s。
3. **语义对照**：30s单镜头连续动作与30s多镜头/台词两个有限用例，重点20s后的遗漏、循环、人物/道具/声线、口型及动作速度；原生一轮可以有模型生成的cut，无需拆成多个任务。
4. **产品闭环**：缺prompt/首图→可见阻塞→补齐→真实按钮→taskId→Queue Start→实际736帧/24fps/音轨→AV保存/History播放→重启。纯API提交只能证明下层。
5. **恢复与邻接**：取消清理、任务失败/复制/重跑、设置改变不改已入队snapshot、长AV作为后续Extend来源的边界检查、旧15s与Q3限制回归；R2V/首尾帧/2K等独立组合另验。
6. 先设总采样次数/单次墙钟/VRAM/RAM/commit/磁盘预算，记录sampler与decode/encode分项及失败。共享queue/workflow/IPC修改跑focused+verify，真实GPU/UI证据另记；不因文档研究启动build或GPU。

若通过基础闭环，直接交付原生30s能力，不等待长视频模式。只某组合通过，则在该profile范围开放；超出范围保留可操作原因，不笼统宣布所有H3已支持30s。实现预计minor，不以本研究自动授权发布/打包。

## 8. 本轮执行记录与限制

原始两份公开JSON与审计脚本保存在gitignored `temp/h3-native-30s-research/`；下载后仅JSON.parse、遍历definitions、核对slot/link/widget覆盖、node mode与采样/输出路径，未执行作者workflow。报告记录来源/hash与决定性节点，未复制公共prompt或机器路径入库。

只读`harness:app -- guide create-video`通过；`guide create`不是有效ID，已纠正。读当前TS而非同目录生成JS；按固定Core源码与最初v0.30.0交叉核查。曾遇GitHub API限流，未重复请求刷取或推断不存在版本；固定Core身份来自前次已成功核查。

本轮没有：启动Electron/ComfyUI、schema探针、权重下载、软件升级、GPU任务、视频解码/观看听音判定或性能A/B。未取得作者精确安装源码/权重hash、第三方wrapper完整身份与原输出元数据；不能保证其时间/质量可在本机复现。社区来源仍足以否定“所有30s都是拼接”和“原生绝对最多15s”。
