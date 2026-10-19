# H3 原生单次 30 秒：证据、现有限制与接入评估（归档）

- 类型：Research / source-and-graph assessment；状态：archived（2026-10-19用户决定关闭计划）；Phase 1–2/4与Phase 3代码适配、Phase 5限定实跑已完成；质量未验矩阵保留。
- 日期：2026-10-18初查，2026-10-19扩展；范围：现有Create内H3原生长采样，以及H3 Extend边界帧、Motion Context、Continuum bootstrap/managed的统一30s入口、Prompt全后端预算与警告UX；Extend另行验证，不充当原生单次成功证据。
- 当前摘要：[TASK](TASK.md)；相关但独立：[长视频编排计划](../../tasks/2026-10-18-long-video-director/PLAN.md)。研究部分无GPU推理；后续Phase 5本机输出与正式History证据见第16节。
- 归档用途：仅供历史追溯。未验的复杂长prompt时间服从、managed长段与其他参数质量不因归档变成通过；后续工作从当前契约/代码重新确认，不自动续跑本报告中的实施计划。

## 1. 结论与证据等级

**原生单次30s不是只有模糊宣传。已有可检查的公开workflow，确认把完整约30s序列交给一个原生H3采样器，并有作者运行日志。研究时应用15s是产品验证预算，不能表述成模型/原生节点不可逾越的硬上限；现行30s准入见第13节。**

2026-10-19最新方向是现有H3 Create与可用Extend路线统一提供至30s，严格超过15.1s显示轻量警告，不强制另建实验profile。**统一的是请求时长入口，不是所有路线共享736帧预算。**Create/边界帧30s为736帧；Motion Context保留现有图算法时实际770帧；Continuum带22帧上下文的最近网格为736帧，原始新帧714，精确时长组装再校准到720帧。旧managed Run仍按其冻结分段时长续写，不能就地改为30s。详细Extend证据见第11节；实施顺序见第10节。研究尚不证明所有模型/分辨率/预设都能稳定完成。

公开graph审计能排除该graph本身分段拼接；作者日志/视频是外部运行报告，不等于本机可复现、稳定成功率或同一软件版本。这里按可获得证据标记：

| 级别 | 含义 |
| --- | --- |
| A | 取得原始workflow，追踪实际输入/子图/输出，排除时间拼接；同时有作者运行报告或日志。 |
| B | 作者明确报告原生/单次及参数，但没有取得完整graph，不能独立排除全部隐藏执行。 |
| N | 原生长时长负结果或质量限制，保留以避免只选成功样本。 |
| X | 已确认拼接、改变播放FPS、只有空间第二遍，或被原作者撤回；不计入原生30s成功证据。 |

“原生单次”指一次完整时间序列的采样过程。采样有多步/多次DiT求值、attention内部切块、VAE分块解码、空间超分、prompt里包含多个[Shot]，都不自动构成时间续接。反之，一次Queue、一个prompt、最终只有一个MP4，也不能证明只采样一次。

## 2. 排除拼接后的主要资料

本节和第3–4节的原始graph/作者记录取得于2026-10-18；2026-10-19刷新Reddit遇403/网络安全拦截，未登录或绕过，不能将旧记录写成当天重新核验的运行事实。补查新增的官方与节点源码在第8–9节。

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
| [MiniMax-H3-LongVideos](https://github.com/Smite79/MiniMax-H3-LongVideos)（2026-10-19补查） | README明确逐镜头生成、末帧传递与拼接，不计原生30s证据。其每token内存估算只是第三方待测线索，不复制为应用资源阈值。 |
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

表为读取固定helper后做的纯算术检查，尚未运行VAE。申请30s的完整原生网格会多约0.67s；建议在帧数/tooltip或详情中明确有效时长。本次规划默认保留完整736帧输出，不自动裁切；精确30s导出是另需确认的产品选择，裁切会涉及末帧、音轨和派生版本身份，不能把原始manifest伪写成720帧。

资源也不能直接乘二估算。30s时video latent T从107变217，原始输出帧从362变736；attention/激活、文本参考、wrapper历史、VAE与编码峰值共同决定显存/RAM。同736帧的一份RGB float32数组，640×640约3.37GiB，864×480约3.41GiB，1344×768约8.49GiB；仅是数组字节算术，尚未包含拷贝、模型、音频和编码缓冲，不是实测峰值。

## 6. 本应用15秒限制的真实位置

原始调查基线为0.66.0 / `475722c…`；本次只读当前磁盘TS与内置API graph，harness显示应用0.66.1，不把昨日SHA冒充当前安装或运行身份。

| 层 | 当前实现 | 放开影响 |
| --- | --- | --- |
| catalog | [FL2VA](../../../src/core/catalog/models/minimax_h3_fl2va/definition.ts)、[Ref2VA](../../../src/core/catalog/models/minimax_h3_ref2va/definition.ts)及对应INT4/旧Turbo定义设15s/362帧；Q3另为5s/124帧 | 原生Create同步30s/736帧；Extend按第11节分支预算统一30s，不能简单给共享catalog帧数加倍；核对模型ID/旧别名，Q3另核定且不自动获得Extend能力。 |
| UI | [page-controller](../../../src/renderer/pages/create/page-controller.ts)的updateDuration从safety取max并clamp；[view-model](../../../src/renderer/pages/create/view-model.ts)投影同一安全值 | slider、数字输入、恢复草稿、切模型后clamp一起验；警告独立于入队阻塞。 |
| shared safety | [workflow.ts](../../../src/core/workflow.ts)的generationSafetyForTask先检查秒数再检查帧数 | 只改15→30仍被362帧拒绝；generationSafetyProfileForModel的fallback和extension helper不能整体改成30。 |
| 主进程入队 | [queue-enqueue.ts](../../../electron/queue-enqueue.ts)重新执行generationSafetyForTask | 不是只改HTML max；API与UI要一致，保留主进程校验。 |
| 执行前复检 | [queue-executor.ts](../../../electron/queue-executor.ts)在claim后再次执行generationSafetyForTask | 第三关也要获得同一有效预算；不能UI与enqueue通过后，在执行时按旧362帧拒绝。 |
| 图与快照 | [I2V API图](../../../workflows/minimax_h3_i2v_api.json)的length为FRAMES占位，T2V图同一路；[task factory](../../../src/core/queue-task-factory.ts)保留duration/profile | 已有单轮graph，预计可复用；实际图和wrapper需验。等待/运行快照不追随新的draft或全局设置。 |
| 帧数 | frameCountForTask/generationFrameCountForTask使用24fps与17k+5，未在该helper截断362 | 已能算出30→736；不能改FPS/RIFE冒充更长原生动作。 |
| prompt | [h3-prompt.ts](../../../src/core/h3-prompt.ts)按有效时长生成timeline；通用增强预算上限普通2048/影视细节3072，Strata另有自动预算 | 第9节逐后端检查；生成准入、增强输出、质量下限、真实上下文是不同预算。 |
| AV与History | [collector](../../../electron/services/h3-native-av-collector.ts)有分支预估；[artifact committer](../../../electron/services/native-av-artifact.ts)的commitProducedFile从真实tensor时间维度重建frameCount | Create静态上支持217/1227时间shape；Extend预估需与实际网格一致，保存仍以真实tensor为准。需真实序列化/hash、重启、播放和来源资格验收，不能只放大manifest数字。 |
| 高分辨率/加速 | 原生1080/1440可能走两阶段AV refinement；Turbo/attention/cache按现有family限定 | 480p30通过不能推出768p、2K第二遍或所有量化都通过；空间第二遍也不属于Continuum长片编排。 |
| 文案 | workflow-messages的h3FrameRange写“官方帧范围” | 应改为公布范围/当前验证预算与实验范围准确表达，不能把应用362帧保护说成模型绝对上限。 |

这条路线仍是**一个generation task、一个prompt、一个原生输出与现有History身份**。不需要长片plan、子任务DAG、多个Run、自动合成或跨模型分镜服务。后续长片可以选择调用30s原生能力，但两项功能可独立交付。

## 7. 当前产品方向与轻量警告

本节替代2026-10-18“独立实验profile”的早期建议，并纳入最新Extend统一放宽方向。**现有H3 Create及可新建的H3 Extend任务直接提供至30s的时长输入，不新增必选实验开关或顶层模式。**Extend的30s指新增段，不是来源加新增的总时长；旧managed Run显示实际冻结值。公布范围、应用请求上限和机器实际可执行性分开表达；不把“超官方推荐长度”本身写成不可提交条件。

| 项目 | 拟实施行为 |
| --- | --- |
| 触发 | 适用本次扩展的H3 Create和Extend；Create按请求秒数、Extend按新增段请求秒数严格`>15.1`，不按保留来源总长。15/15.1不显示，15.2起显示。15.1是UI提示容差，不是官方另行公布的上限。 |
| 位置 | [page.ts](../../../src/renderer/pages/create/page.ts)的settings-duration-heading右侧，在现有帧数旁加小警告图标；不改变输入宽度或造成布局跳动。 |
| 提示 | 拟文案：“超出官方推荐时长，较长生成可能增加资源占用并降低稳定性。”tooltip按路线展示请求时长、完整采样帧数/上下文及输出语义，不把Extend全部写成736帧/30.67s。带上下文的完整采样可能更早超过公布范围，信息展示如实说明，但不暗改用户指定的请求时长触发阈值。 |
| 可访问性 | 复用现有图标/tooltip体系；鼠标hover、键盘focus及触屏可读，带可访问名称；中英文同步，不只用颜色传意。 |
| 状态更新 | [coordinator.ts](../../../src/renderer/pages/create/coordinator.ts)的syncVideoEnqueueUi同步更新图标/提示，与page初次渲染一致；拖动、打字、切页恢复不丢焦点/选择。 |
| 与阻塞分离 | warning不进入enqueueBlockReason或safety.safe；30.1s、非法值、缺输入、缺节点/资源等仍按各自真实原因阻塞。Q3能力缺口、旧managed Run冻结值仍明确显示，不伪装成能直接新增30s。 |

## 8. 15–30秒的关键帧与时间语义

### 8.1 必须共用有效网格，不把30秒写死成末帧

2026-10-19直接调用当前[h3-prompt.ts](../../../src/core/h3-prompt.ts)纯函数，得到：

| 请求秒数 | 实际帧数 | 有效总时长 | 警告应显示 | 当前终点保留检查结果 |
| --- | --- | --- | --- | --- |
| 15 | 362 | 15.0833s | 否 | 接受15→15.08 |
| 15.1 | 362 | 15.0833s | 否 | 错判缺少15.1 |
| 15.2 | 379 | 15.7917s | 是 | 错判缺少15.2 |
| 20 | 481 | 20.0417s | 是 | 接受20→20.04 |
| 25 | 600 | 25s | 是 | 接受25→25.00 |
| 30 | 736 | 30.6667s | 是 | 错判缺少30 |

“终点保留检查”指[missingH3SourceTimepoints](../../../src/core/h3-timing.ts)：原稿写“at X seconds settle”，模型正文改写成有效总时长。当前特殊规则仅接受向后偏差小于0.12s，无法覆盖网格跳跃或15.1的轻微向前取整。这是已复现的局部风险，不是模型生成失败；目前调用该检查的有界Strata影视细节纠正路径可能误纠正/拒绝。

拟修正：**只对已确定为最终端点的时间使用同一帧网格的等价关系**，不是把所有事件容差增大到1s；若30s是原稿中的独立中间动作，不能擅自移动到30.67s。无法确定端点语义时保留原时间，不能靠“恰好等于请求时长”猜测并覆盖。另补数字秒、中文秒、区间、`MM:SS.mmm`的统一解析；当前numeric-seconds检查不覆盖官方时间码，且数值存在本身不能验证事件、顺序、角色或否定语义。

### 8.2 首尾帧、文字卡点与中间Guide是三件事

| 类型 | 资料与本应用要求 |
| --- | --- |
| 首帧/末帧 | [官方Base指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md)：I2VA首帧0；FL2VA首帧0、尾帧按有效总时长；L2VA仅尾帧。长片仍使用正确Picture角色，审计多镜头时最终Shot编号，不能默认尾图在15s或永远归Shot 1。 |
| 实际端点索引 | [固定Core](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy_extras/nodes_minimax_h3.py)尾帧为frame_count-1；736帧的最后一帧索引735，帧起始PTS为30.625s，总容器时长约30.6667s。文本的有效终点、frame index和媒体总时长不能混用。 |
| 文字卡点/切镜 | [Comfy Prompt指南](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-prompt-guide)：后续Shot用单一递增`At MM:SS.mmm`，在有效时长内；时间区间不是cut标记。连续长镜头可以有动作阶段，不因超过15s强制切镜、均分六段或新增剧情。 |
| 中间硬Guide | [官方多帧模板](https://docs.comfy.org/tutorials/video/minimax/minimax-h3-multiframe)：MiniMaxH3AddGuide的索引按round(seconds×24)，可负索引从末尾计；索引加Guide长度必须在完整序列内。仅写“20s到达Picture 3”不等于建立节点条件。 |
| Guide与引用 | 只接AddGuide的图片不自动进入文本编码器；若正文需引用Picture标签，还要正确连接ref_images。Guide的positive串联到同一个Guider仍可是一轮完整采样，不等于分段拼接。任意中间关键帧编辑器是另一个功能，本次不默默扩大scope。 |
| R2V输入长度 | [官方模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)与[Ref指南](https://huggingface.co/MiniMaxAI/MiniMax-H3/blob/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md)的参考视频/音频2–15s、各类合计时长/数量约束仍独立；输出改30s不授权参考媒体也变30s。保留Video/Audio配对及原role/标签。 |

上述文档为滚动上游资料，证明格式/节点机制，不证明15–30s的动作服从、Guide精度、口型或末帧质量。实际序列仍要人工观看/听音。

## 9. Prompt长度、质量门槛与所有增强后端

### 9.1 四种长度预算必须分开

1. **编辑器参考范围**：[prompt-count.ts](../../../src/core/prompt-count.ts)随请求秒数增长，是软提示；[字数计数UI](../../../src/renderer/pages/create/helpers.ts)不据此禁止入队。[h3-token-count.ts](../../../src/core/h3-token-count.ts)也是估算展示，不是精确tokenizer/提交门禁，参考视频token尚不能完整计入。
2. **增强模型输出**：h3PromptExpansionTokenBudget按有效时长的5.17s切片分配，但普通封顶2048、影视细节封顶3072；Writer普通请求目前甚至不传动态预算，而沿用服务默认2048。
3. **原始正文质量**：影视细节要求模型自己写出足量有效主时间线，先于应用补标签/恢复对白；重复填充、格式、引用说明不抵扩写。它的最低词数和约双倍目标已随时长/原稿增长，不能为“支持30s”降门槛或拿程序补句凑数。
4. **真实输入上下文与H3编码**：增强请求包含系统规则、原稿、媒体、候选及修订；输入+视觉+输出+安全余量必须装入实际加载上下文。最终视频模型用独立H3 Qwen3VL32B编码器，不是选择的增强模型，不能共用一个“2048token限制”。

当前短原稿的纯函数结果如下；非R2V列可用FL2VA代表，R2V的六段结构另需开销。表中词数不是token，也不是已经校准的30s推荐值。

| 请求时长 | 普通/影视细节输出token | 非R2V细节最低/目标词数 | R2V细节最低/目标词数 | 编辑器普通/细节参考词数 |
| --- | --- | --- | --- | --- |
| 15s | 1920 / 2880 | 450 / 900 | 590 / 1180 | 550–900 / 550–1580 |
| 15.2s | 2048 / 3072 | 550 / 1100 | 710 / 1420 | 556–908 / 556–1594 |
| 20s | 2048 / 3072 | 550 / 1100 | 710 / 1420 | 700–1100 / 700–1920 |
| 25s | 2048 / 3072 | 650 / 1300 | 830 / 1660 | 850–1300 / 850–2260 |
| 30s | 2048 / 3072 | 750 / 1500 | 950 / 1900 | 1000–1500 / 1000–2600 |

结论是**输出预算先封顶，正文要求还在增长，且UI与门槛使用请求/有效时长不同口径**。尤其长原稿、R2V多引用或影视细节，可能达到length停止或质量拒绝；这不等于每次2048/3072都失败，也不能把英文words按固定比例当作中文token来证明足够。

最终H3编码器源码：[minimax.py](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy/text_encoders/minimax.py)、[qwen3vl.py](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy/text_encoders/qwen3vl.py)。它使用H3原始结构/视觉块，不套普通chat模板；继承的tokenizer设置不是CLIP的77/512或增强器的2048截断。极大max_length也不是可实用输入上限承诺；需验证实际编码、视觉引用和内存，不能以编辑器估算代替。

### 9.2 后端同步改造清单

模型名单仍以[prompt-models.ts](../../../src/core/prompt-models.ts)及[Strata catalog](../../../src/core/catalog/models/strata.ts)为唯一来源；以下是调用族影响，不创建另一份生产能力catalog。各活动量化/社区变体均需进入覆盖记录，不能仅验证默认模型就声称全体已适配。

| 后端/当前模型族 | 已定位的限制 | 同步改造与证据要求 |
| --- | --- | --- |
| Native TextGenerate：Qwen3.5 2B/4B | [comfy-ui.ts](../../../electron/services/comfy-ui.ts)max_length使用共享增强预算；节点实际schema/终止诊断未在本轮探测 | 调整场景预算并检查实际TextGenerate接口、精确输入/输出容量及长文停止原因；小模型结构/忠实度需单独验，不能只增token。 |
| MultiModal：Qwen3.6/3.8 27B GGUF | [multimodal-prompt.ts](../../../electron/services/multimodal-prompt.ts)desired上限3072，再与schema和共享预算取min；缺schema回退2048。安装补丁固定max3072，输出>2048时ctx16K，否则8K | 共享预算、服务desired、schema探针、节点补丁及能力判定同步；8K/16K必须按完整输入+输出重算，不能新预算被旧min静默截回。保留GPU确认/用户明确的单次CPU回退。 |
| Prompt Writer：Gemma E4B/12B/26BA4B各当前变体 | [h3-prompt-writer.ts](../../../electron/services/h3-prompt-writer.ts)普通不传动态预算，细节传共享值；固定上游两处拒绝>20s，内部R2V repair还限标准2048；正文/brief/修订各有字符限制 | 必须同时处理generate/refine时长、普通与细节预算、内部repair、上下文阶梯/预检及安装兼容探针。修订需装入完整原稿+候选+指令，不能悄悄截断。详见下文。 |
| Qwen-VL LoRA：LightX2V Prompt Rewriter 8B PEFT | [qwenvl-prompt.ts](../../../electron/services/qwenvl-prompt.ts)传共享max_new_tokens，但[上游QwenVLCaption](https://github.com/Dangocan/comfyui_qwenvl_lora/blob/master/nodes.py)schema最大2048；本地兼容补丁只见日志/取消，未放宽该schema | 先修复schema与请求预算不一致及安装能力检查，否则细节请求可在Comfy校验阶段失败。补精确上下文/停止原因；[模型卡](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B)明确不支持Ref2VA，不因30s伪造R2V支持或自动换模型。 |
| Strata：Qwen3.8 Flash-Next两个当前量化 | [strata-prompt.ts](../../../electron/services/strata-prompt.ts)32K上下文、视频至少预留8192输出，auto使用剩余空间；[strata-token-budget.ts](../../../src/core/strata-token-budget.ts)已扣图片与安全余量。限定单图I2VA细节路径的2048 thinking计入总输出 | 优先复用实际tokenizer/自动预算，不统一套3072或无理由扩大32K。核验30s完整资料、修正候选和思考均能容纳；资源不足明确失败，不截资料、不自动CPU回退、不降低质量。纠正仍有界。 |

Writer的确定性阻断证据来自应用[固定提交常量](../../../src/core/catalog/dependencies/nodes.ts)的`8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e`，不是只读最新README：

- [assembly.py](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/blob/8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e/backend/assembly.py)：assemble_request与_validated_generation_context均有`duration > 20`；refine复用后者。还限制current_prompt 20,000字符、instruction 2,000字符，不能仅调generate。
- [context.py](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/blob/8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e/backend/context.py)：支持正整数generation_budget，按真实输入/视觉/安全量预留，可用tier受模型native context限制，不是所有Gemma都可升48K。
- [h3_pipeline.py](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/blob/8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e/backend/h3_pipeline.py)：初轮用runtime max，但内部R2V格式纠正取min(standard_output_tokens, runtime max)，现状仍可能回到2048。应用外层最多两次refine不是这条内部纠正；两层都要验。
- [dependency-node-adapters.ts](../../../src/infrastructure/dependency-node-adapters.ts)已有brief 20,000字符、标准输出2048、自动context阶梯与MultiModal 3072/8K/16K等补丁/字面探针。新预算需要让安装、新装/已装修补、兼容判定及测试同批更新，保持幂等和失败可解释；不在增强按钮中临时联网升级。

本轮没有读取所选本机core/data/Python中每个节点的HEAD/dirty或实际object_info。因此上述是**catalog固定源码/应用补丁和滚动上游源码的风险证据**；不能宣称当前机器已经触发这些错误或所有安装都恰好相同。实施前先离线盘点所选实例，再按应用生命周期探测schema；不自动升级大模型/权重。

### 9.3 预算策略与写作预设

拟将“请求时长+实际网格、T2VA/I2VA/L2VA/FL2VA/R2V、写作预设、原稿长度、引用/对白复杂度”作为同一预算决策输入，共享到指令、UI参考、原始正文质量检查和各后端请求，避免再复制常量。具体token上限需用各家实际tokenizer、节点schema和有限长文样例校准，本轮不凭空定4096/8192为全模型标准。

- 普通模式随长片提供充足输出空间；影视细节得到更高覆盖目标和可兑现的输出预算，先保证不压缩用户原稿及逐项动作。预算是最大允许空间，不强迫模型写满或把所有预设都变同一种长文。
- [现有11个独立预设](../../../src/core/prompts/h3/content.ts)逐个检查：官方分镜、影视细节、参考忠实、连续动作、对白音效、节拍分镜、产品品牌、音乐视频、叙事动画、批注修订、多参考；其中多参考仍仅R2V。保持风格差异和用户保存的自定义正文，不重置既有设置。
- 普通h3DurationPlan超过12s仍给6个beat；应验证是否覆盖完整30s，不直接改为固定12段。影视细节原本就要求灵活因果阶段；长片不应堆动作、重复外观、增加无关BGM或强制多镜头。
- 批注修订只改标记片段，不套全文扩写最低词数；多媒体空稿自动增强、明确原稿、Extend边界和异步回写仍按现有请求契约。源长/高预算无法装下时明确原因，保存原稿、无新版本；不靠降低质量门槛“恢复成功”。
- 每后端区分schema拒绝、context不足、触顶截断、提前eos、格式失败、质量不足和资源不足。记录实际输入/输出tokens、finish reason、模型原始有效主时间线词数、耗时/修复次数；无诊断能力写unknown，不能以“拿到字符串”当完整输出。

## 10. 分批实施与有限验收计划

以下为分阶段实施包。Phase 1/2已完成，Phase 3代码/安装适配完成而长文质量仍partial，Phase 4已完成；Phase 5本轮限定实跑完成，managed长段等矩阵仍partial，结果见第13–16节。优先顺序由依赖决定，不把所有代码一次堆在UI控制器，也不先改slider发布。

| 次序 | 最小实现包 | 必须满足的判别检查 |
| --- | --- | --- |
| 1 | 当前实例身份/模型别名；Create与可用Extend统一30s，并按路线冻结完整采样预算 | UI→enqueue→executor三关一致；Create/边界736、Motion Context实际770、Continuum实际plan分别检查；15/15.1/15.2/20/25/30/30.1、负数/NaN；旧队列/History和managed冻结契约不改，Q3能力不偷换。 |
| 2 | 请求/完整采样/可见新增时长共用分支计算与终点检查；长时间轴Prompt契约 | 首尾角色、上下文前缀/成片时间轴、15.1向前取整、30.67终点、内部30s事件不被改、秒/时间码/区间、cut递增/范围；保持对白/文字/角色/动作顺序及Continuum Chunk body。 |
| 3 | 共享场景预算与逐后端adapter/schema/安装补丁/能力探针 | 普通与细节不再被旧min/20s/2048 repair卡回；全活动模型ID的请求/上限/兼容错误测试，11预设适用性覆盖；Strata32K与原有资源策略独立保留。 |
| 4 | Create/Extend原时长控件的30s上限与>15.1图标/tooltip、本地化、增量DOM更新 | 桌面/窄屏、hover/focus/触屏、拖动/数字输入/切模型/切页恢复；旧Run冻结值清晰。警告本身不禁用提交，缺输入→恢复→真实点击→新taskId；不绕开disabled。 |
| 5 | 各路线真实生成/解码/保存/History与恢复闭环 | 有界20s→30s，检查输出帧数/FPS/音轨/AV shape/hash、接缝/末段、重启和取消；managed接受/继续/重抽及旧Run兼容另验；高分辨率/量化与加速不能外推。 |

### 10.1 源码与自动化验证

复用现有测试，不额外创建一套长片框架：

- 时长/图/快照：[workflow.test.ts](../../../tests/workflow.test.ts)、[h3-workflow-contract.test.ts](../../../tests/h3-workflow-contract.test.ts)、[queue-services.test.ts](../../../tests/queue-services.test.ts)、[video-policy.test.ts](../../../tests/video-policy.test.ts)。实际API graph需确认length736、24fps、完整AV latent、一条全时间采样路径，无隐含concat/降FPS；空间第二遍单独标记。
- Prompt/质量：[h3-prompt.test.ts](../../../tests/h3-prompt.test.ts)、[h3-timing.test.ts](../../../tests/h3-timing.test.ts)、[h3-expansion-quality.test.ts](../../../tests/h3-expansion-quality.test.ts)、[prompt-count.test.ts](../../../tests/prompt-count.test.ts)。针对性修订、中文/英文、长原稿、精确对白/可见字、R2V角色与单镜头约束均保留，不用普通词重合率替代语义。
- 后端：[h3-prompt-writer.test.ts](../../../tests/h3-prompt-writer.test.ts)、[multimodal-prompt.test.ts](../../../tests/multimodal-prompt.test.ts)、[qwenvl-prompt.test.ts](../../../tests/qwenvl-prompt.test.ts)、[strata-prompt.test.ts](../../../tests/strata-prompt.test.ts)、[strata-token-budget.test.ts](../../../tests/strata-token-budget.test.ts)。补30s generate/refine/内部repair、schema边界、完整长上下文和截断/拒绝后原稿不变。
- 旅程/保存：[user-journeys.test.ts](../../../tests/user-journeys.test.ts)、[h3-native-av-collector.test.ts](../../../tests/h3-native-av-collector.test.ts)，以及[产品旅程](../../runbooks/PRODUCT_JOURNEYS.md)的create-video、prompt、history邻接检查。
- 生产共享逻辑/queue/workflow修改需focused后`npm.cmd run verify`，UI还需手动UX检查；依赖节点补丁需其已有定向测试。verify不包含真实GPU。Phase 1/2实际门禁及UI入队结果见第13节，其余验收仍按本计划分层执行。

### 10.2 真实资源与Prompt接受矩阵

先按所选实例清单建立每个活动Prompt模型ID的记录，状态分source/schema/UI/runtime/quality；未跑不填pass。所有模型/11预设做参数化静态检查，真实增强按后端族先选代表模型，固定30s普通/细节长原稿与各自适用模式；再覆盖该族其余变体，未覆盖者不能共享“全部通过”。R2V只测支持者，特别验多引用占用；Strata另验限定单图thinking路径，其余模式不被顺带开启。不要为覆盖率做所有模型×预设×输入类型的无界GPU全排列。

真实文本验收看模型原始正文能否覆盖完整30s，尤其15s后/20–30s的动作顺序、反应、镜头路径、末态、台词/声线与引用角色。保存完整原稿/候选供隔离审阅，禁止用程序补词或多换seed掩盖失败。一次增加输出预算是否有效，要由finish reason/完整正文和语义共同证明；“词数达标”不等于事件达标。

生成部分先使用已有兼容FL2VA/T2VA或I2VA、较低原生分辨率及当前sampler/VAE/attention；无LoRA路径保留。预先固定20s→30s各一次的简单连续动作；20s资源/稳定性失败则停止30s，不继续扩大。再授权的首尾帧/R2V、多镜头台词、高分辨率/量化/Turbo/Spectrum组合分别记录，不照抄外部旧wrapper参数或改驱动/分页文件。

准入与运行风险必须分类：秒数/帧数策略、实际schema/文件、Prompt上下文、GPU显存、RAM/Windows commit、磁盘与编码峰值。不能用“解除362帧保护”当作“解除所有资源保护”，也不从社区24GB成功推导本机24GB必能跑。分别记录编码器、采样、VAE decode、音频/视频encode、AV序列化、可选空间refine的峰值和耗时；现有H3 activity timeout为90分钟，不凭长度翻倍，长阶段无progress是否误超时需实测。

应用离线时，只有后续获授权且资源归属确定的真实验收，才从AppApi启动ComfyUI。隔离Electron/userData/队列与媒体，真实缺输入→补齐→按钮→taskId→Start→输出；按task/version找History，Create检查736帧/24fps/音轨、217/1227 latent实际值；Extend按第11节核对真实采样和可见新增，均检查完整末段和重启。取消/失败/复制重跑、旧15s、Q3能力限制与各Extend路径保留；不改等待/运行任务的已冻结输入身份。资源总次数/墙钟/显存/RAM/commit/磁盘限额在跑前登记，不终止其他任务进程。

若仅部分组合完成，报告对应能力/限制与未验矩阵，不擅自改成用户未要求的强制实验模式，也不笼统宣布所有H330s稳定可用。需要新增产品限制或持久化协议变化时另行确认。实施预期minor，研究本身无用户行为交付，不自动授权版本、发布或打包。

## 11. Extend补查：统一30s入口，分支预算与旧Run兼容

本节记录补查时的原限制与统一放宽依据，修正上一轮“Extend另议、默认保留13/14/15s”的范围排除。用户希望统一放宽，技术上作为同一实施目标；不是把多段续接案例改记为原生单次成功。原限制是实施前基线，当前Phase 1/2结果见第13节。

### 11.1 当前限制究竟在哪里

| 路线 | 当前准入与图行为 | 统一放宽所需变化 |
| --- | --- | --- |
| FL2VA边界帧 | extensionSafetyForTask复用generationSafety；新增段上限15s/362帧。边界图只将来源末帧作为新段首帧，原片总长不进入这一轮latent | 与Create同步30s/736；保留来源/trim、首帧、音轨、拼接校验。Q3的q3NoExtension仍有效，不因加长自动增加输入能力。 |
| Ref2VA Motion Context | 22帧图像上下文、24个audio latent tick；应用用generationFrames+22检查362，max helper给整秒上限13。实际Core还会再次对齐 | 使用实际完整窗口预算，不能只将362改为736或758；先保留现有图算法并按30s实际770帧验收。原Slot 1、Spectrum关闭与参考输入约束保留。 |
| Continuum bootstrap | 旧362帧任务预算下，最近网格含22帧上下文，max helper给整秒14；V3.8最短4s。要求验证过的JointAV，并从完整来源尾部续写 | 新任务请求4–30s，按真实plan计采样和trim；上游已允许30，不需要为此先升级。AV来源/时间相位/分辨率校验不放宽。 |
| Continuum managed | generationSafetyProfileForModel有managed专用15s；入队将draft.duration重置为sequence.chunkSeconds。其现有准入未像bootstrap检查完整前缀窗口 | 新sequence可选4–30s；准入读取实际冻结契约/物理采样组。旧sequence的chunkSeconds保持不变，不能让UI假称改30而入队默默恢复15。 |
| Legacy Continuum图 | 仍有continuumMaxDurationSeconds和旧输出净帧逻辑，不走新V3.8精确时长语义 | 若仍可新建任务，沿分支预算开放30；保留其原始净帧/拼接语义，不能强换workflow冒充兼容。旧任务不改写预算、图或身份。 |

控制点集中在[workflow.ts](../../../src/core/workflow.ts)的extensionSafetyForTask、motionContextMaxDurationSeconds、continuumV38MaxDurationSeconds、continuumMaxDurationSeconds、renderWorkflow；但[queue-task-factory.ts](../../../src/core/queue-task-factory.ts)和[renderer helpers](../../../src/renderer/pages/create/helpers.ts)还分别硬编码所有H3 Extend的maxGeneratedFrames=362。Motion Context目前实际读catalog generationSafety预算，不读task.maxGeneratedFrames，必须消除这种准入/快照口径分离，不能只改task factory。

[page-controller](../../../src/renderer/pages/create/page-controller.ts)切模型时还调用无参数的旧max helper，会将草稿夹回13/14；[coordinator](../../../src/renderer/pages/create/coordinator.ts)、[view-model](../../../src/renderer/pages/create/view-model.ts)、恢复来源与入队/执行前复检也应取同一策略。不要在UI、catalog、工厂各复制一个30。受影响的现行契约见[Workflow Contract](../../WORKFLOW_CONTRACT.md)，实施时同步更新，本次不将研究结论伪装成已交付契约。

### 11.2 Motion Context的二次向上对齐

固定[Core temporal_shape / _empty_av_latent](https://github.com/Comfy-Org/ComfyUI/blob/6607f36b53c7b695b160ac5b52d595e9e3752a2d/comfy_extras/nodes_minimax_h3.py)会将length向上对齐到17k+5。当前[Motion Context图](../../../workflows/minimax_h3_r2v_extend_api.json)的length由应用先算合法generation帧数，再加22。因此：

```text
新增30s → generationFrames=736 → graph length=758
  → Core真实fullFrames=770 → Trim上下文22 → raw新帧748（31.1667s）
  → 应用最终新增段按请求30s裁切/编码；真实帧数与音轨仍需ffprobe验收
```

当前TS纯函数与上述固定Core公式的只读算术结果：

| 新增请求 | 边界帧完整采样 | Motion图传入 / Core实际 | Motion trim后原始新帧 | Continuum完整 / 原始新帧 | V3.8单段精确输出目标 |
| --- | --- | --- | --- | --- | --- |
| 13s | 328 | 350 / 362 | 340 | 328 / 306 | 312 |
| 14s | 345 | 367 / 379 | 357 | 362 / 340 | 336 |
| 15s | 362 | 384 / 396 | 374 | 379 / 357 | 360 |
| 20s | 481 | 503 / 515 | 493 | 498 / 476 | 480 |
| 25s | 600 | 622 / 634 | 612 | 617 / 595 | 600 |
| 30s | 736 | 758 / 770 | 748 | 736 / 714 | 720 |

Motion30s的video/audio latent时间维度应为227/1283，而非Create的217/1227。当前helper以758预算已经返回可选30s，但Core实际还多12帧；这是预算检查口径缺口，不是实际运行证据。实施优先保留图算法，按770帧完整窗口做新任务准入/资源预估；可见新增仍为请求30s。

另一种新任务算法是先合并720新帧+22上下文，再一次向上对齐为753，trim后731帧。它改变现有采样长度及随机轨迹，本轮不把它混入“解除上限”的最小实现，也不承诺性能改善。758不是合法完整网格；736又不足以沿当前Motion算法容纳30s，不应选这两个数字作为其真实采样预算。

[collector](../../../electron/services/h3-native-av-collector.ts)的预估仍为generationFrames+22；但[committer](../../../electron/services/native-av-artifact.ts)的commitProducedFile已有真实tensor header重建frameCount保护。因此不能断言现在会把758写入最终manifest或必然保存失败。应让准入/显示/采集预估一致，同时保留实际header、shape/hash校验为最终权威；原始AV不能伪写成去前缀后的720帧。

### 11.3 固定节点已具备的能力与证据边界

- 应用固定的[Continuum 3.9.1 constants.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/94eaf70d674a58244e1cb139f021290d63fb2e6c/constants.py)本就定义chunk_seconds为4–30、step0.1；tooltip注明5–15推荐且经过验证，超过15支持但增加VRAM/runtime。不是只有新HEAD才允许30；catalog推荐提交不等于本机已安装提交。
- 同提交[temporal.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/94eaf70d674a58244e1cb139f021290d63fb2e6c/temporal.py)的make_extension_shape用context_frames+round(seconds×24)选择最近合法网格。22+720→736，net714，即29.75s。与Motion的“先向上再加前缀再向上”算法不同，不能共用一个盲目的加22常量。
- [bootstrap图](../../../workflows/minimax_h3_continuum_v38_extend_api.json)和[managed图](../../../workflows/minimax_h3_continuum_v38_managed_extend_api.json)都开启exact_total_duration。[assembly_v35.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/94eaf70d674a58244e1cb139f021290d63fb2e6c/v3/assembly_v35.py)按plan.target_frames组装：不足时重复尾帧、音频尾部值补齐；过长时裁切并按preserve_final_frame保留末锚点。故单个带22前缀的30s窗口可由714新帧补至720，约0.25s重复尾帧，不是RIFE、也不是额外生成6帧动作。是否可接受必须观看/听音，不能只验容器30s。
- [plan.py](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/blob/94eaf70d674a58244e1cb139f021290d63fb2e6c/v3/plan.py)记录actual total/trim/net与物理decode group，也支持terminal merged pair。managed Review Each Chunk是最多一个新物理组，不等于所有情况只有一个30s latent；准入/资源校验必须尊重实际物理组，不将targetChunks×30或736当所有Run的峰值承诺。合并组不能任意拆开以通过预算。
- [Motion Context v0.6.2 nodes.py](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/blob/v0.6.2/nodes.py)按输入latent实际T计算完整帧数，无独立15s拒绝；从旧latent取合法相位的尾部前缀，Trim对图像和音轨同时去前缀并匹配尾长。应用当前固定22图像帧与24音频tick，不能从新HEAD的其他默认值推定需要升级或改audio_context_length。
- 应用[bundled bridge](../../../comfy_nodes/LocalVideoStudio-H3/nodes.py)继承上游schema，仅恢复initial_state；诊断从真实assembly_plan读取帧事实，没有另一个15s常量。继续拒绝fresh fallback、无效来源/相位与伪造原生状态；[managed_prefix_guard](../../../comfy_nodes/LocalVideoStudio-H3/managed_prefix_guard.py)的官方锁内采样身份/accepted prefix保护不因加长而弱化。

以上是固定源码/图机制，不是所选安装schema、30s推理成功或质量证明。bootstrap30s示例也不能替代managed多组实际形状检查。

### 11.4 managed冻结值、Prompt时间轴与输出身份

**旧Run的15s不是可以全局替换的UI默认值。**[queue-enqueue](../../../electron/queue-enqueue.ts)创建新ContinuumSequence时将duration冻结为chunkSeconds；复用sequence时重新用chunkSeconds覆盖draft.duration。采样身份、模型、seed、几何、已接受prefix及canonical head互相绑定。新sequence可支持30；既有4–15s sequence继续原分段长度，UI应展示冻结值并解释需要另建序列，而非接受30后静默入队15。另起Run/转换来源必须走明确已有或经批准的用户流程，不在入队时自动丢弃旧sequence或改其manifest。分段时长改变不能复用旧contract hash冒充兼容，也不需为了支持新任务就授权旧数据迁移。

| 路线 | 增强器实际语义 | 15–30s与关键帧要求 |
| --- | --- | --- |
| 边界帧 | [prompt-extension-media](../../../electron/services/prompt-extension-media.ts)把边界图作为Picture 1，I2VA首帧对齐 | 只描述未来新增段；内部时间从新增段起点计，不叙述整段旧片。新段首帧后应用去1/24s再按请求时长拼接，模型时间/输出时间映射及末端事件需验，不能机械加来源总长。 |
| Motion Context | 来源锁为Video 1，增强器边界观察图不占Picture标签；其余图/视频保持真实角色 | R2V六段结构/引用与细节预算仍适用；模型窗口包含前置22/24s，剪裁后可见新段从0开始。明确区分采样轴和可见新增轴，不对所有自然语言时间点无条件加0.9167s；有Guide时映射到实际完整窗口，并验最后30s裁切不会丢失最终动作。 |
| Continuum | [h3-auto-prompter](../../../src/core/h3-auto-prompter.ts)将native-state continuation视为T2VA；边界图只供观察，不伪造Picture 1；上一段原生AV承接运动/音频 | 写下一物理进展，不重放/静止/重建场景。单段正文使用局部时间，managed的Chunk序号由应用唯一装配，正文不能嵌套Timeline标题；accepted正文与官方重抽契约保留。 |

[prompt-controller](../../../src/renderer/pages/create/prompt-controller.ts)传递draft.duration作为h3DurationSeconds，不是来源总长；Continuum另传上一段摘要。第9节五个后端的20s/2048/3072及内部repair问题同样阻断长Extend，所有适用写作预设都要覆盖，不另设一套缩水Extend预算。PEFT本身不支持Ref2VA的限制仍适用于Motion Context，不能自动换增强器；Strata限定单图I2VA的thinking规则不能错误扩到全部Extend。旧managed Run应在增强前就使用冻结时长，避免按30s增强后实际只运行15s。

[extension-media](../../../electron/services/extension-media.ts)已有不同后处理：边界帧去1帧；Motion/Continuum由节点去前缀，后处理不再重复去22帧；新V3.8 Continuum按请求新增帧数严格ffprobe，legacy另按原始净帧语义。Motion来源只抽尾部22帧作上下文，不将全部30s来源重新装入这一轮采样。可见最终成片是保留来源+新增段，JointAV保存的是实际原始采样窗口，两种frameCount不可合并；来源/父版本/Run receipt/AV capability沿现有身份流转。

### 11.5 Extend的有界判别验收

1. 静态与纯函数：30/30.1、15.1/15.2及4s最短边界；Create/边界736、Motion传758实际770、Continuum带前缀736/net714/目标720分别断言。准入最大值按0.1s输入网格反推，不沿用当前整秒循环而无说明；复核不支持的Q3、非H3 LTX预算不变。
2. 队列/来源：新任务冻结各自预算，UI/入队/执行前一致；普通视频、Motion latent、verified JointAV与managed accepted prefix各走真实路径；旧queued快照不变、旧Run冻结值不变，不能以改source/切模型绕过锁或恢复已撤销prefix。
3. Prompt：各支持后端的30s普通/影视细节及局部批注修订，逐一验证边界I2VA、Motion R2V、Continuum T2VA/Chunk body。重点查新增段20–30s事件、原稿端点、前缀映射、尾裁切/补帧、对白与声音连续，不用词数成功代替完整语义。
4. 真实UI：读取`npm.cmd run harness:app -- guide extend`后，缺输入→恢复→真实按钮→taskId，检查source/version、duration和实际workflow。managed旧Run显示冻结时长；新的30s序列与接受/继续/重抽分开验证，不在disabled后直接API入队充当UI证据。
5. 后续获授权的运行：每路线先20s再30s，资源/状态失败即停；managed先新序列，再接受→继续→重启恢复，必要物理组另立预算，不默认给每种Review操作跑一遍。核对原始AV帧/T/hash与最终保留来源+新增帧数、24fps、音轨/接缝/末段；专门看Continuum补齐尾部和Motion末动作。保持Continuum已有PTS归零、精确帧数检查及取消/失败清理。

复用[create-video-extension.test.ts](../../../tests/create-video-extension.test.ts)、[h3-continuum-managed.test.ts](../../../tests/h3-continuum-managed.test.ts)、[h3-continuum-diagnostics.test.ts](../../../tests/h3-continuum-diagnostics.test.ts)、[h3-av-domain.test.ts](../../../tests/h3-av-domain.test.ts)、[comfy-ui.test.ts](../../../tests/comfy-ui.test.ts)及第10节queue/workflow/Prompt/collector测试；按实际改动补现有extension-media/committer邻接测试，不新建长片框架。生产实现需focused测试、verify及UI检查；真实GPU/质量验收独立登记。研究阶段只运行导航和纯函数；Phase 1/2当前验证见第13节。

## 12. 调查记录与未验证项

2026-10-18：两份公开JSON与审计脚本保存在gitignored `temp/h3-native-30s-research/`；只JSON.parse与追踪连接/覆盖/bypass，没有执行外部图或复制公共prompt。固定Core与最初v0.30.0交叉核查；GitHub匿名API曾限流，未知身份未猜测。`harness:app -- guide create-video`成功，一次误用guide create已纠正。

2026-10-19：只读当前TS、官方/HF/Comfy指南、H3编码源码、Writer固定提交及其他节点公开源码；用Node内置TS支持直接执行时长/预算/时间点纯函数，表格记录实际返回值，无模型推理。Reddit刷新受403限制；新LongVideos仓库明确为逐片续接，已排除。未获得新的本机或独立作者成功率数据。

同日Extend补查：`harness:app -- guide extend`成功；核对边界帧、Motion Context、Continuum bootstrap/managed及legacy预算、队列冻结、Prompt路由、ffmpeg和AV保存链。固定Core确认758会对齐770；固定Continuum 3.9.1确认4–30s/schema、最近网格与exact-duration尾部补齐；Motion Context v0.6.2确认按latent长度工作。调用当前TS纯函数并用固定Core公式交叉计算13/14/15/15.1/15.2/20/25/30s，未执行外部节点或生成模型；实际plan/物理组、安装schema及输出仍未测。

以上为研究阶段记录，当时没有启动Electron/ComfyUI、读取实际object_info或修改生产限制。当前阶段已完成的源码、实例schema与UI入队证据如下；30s容量、质量、全后端预算适配、取消/重启/资源恢复仍待后续验收。

## 13. Phase 1/2实施结果

2026-10-19按用户“完成phase1和2”实施；完整证据与资源清理见[TASK](TASK.md)。

- Phase 1：标准catalog、新任务快照及共用UI/入队/执行准入到30s；分支完整预算为Create/边界736、Motion770、bootstrap736。Motion图仍传758，Core再次对齐770；未改成753。旧362快照、旧managed chunkSeconds及官方Run锁/receipt/hash保护保留。Q3 5s/124与非H3预算不变。
- Phase 2：共用[h3-temporal](../../../src/core/h3-temporal.ts)区分请求、图输入、实际采样、前缀、原始新增和可见目标，并接入图、collector、renderer与增强时间契约。Continuum前缀22、原始714、精确目标720的末端风险明确；managed按实际官方物理组计划，不用单bootstrap窗口自称峰值。最终AV仍按真实tensor重建。
- Prompt：Create按完整网格，Extend按可见新增轴；旧managed在增强前使用冻结时长。边界I2VA、Motion R2V、Continuum T2VA；限定最终端点等价，内部时间点不漂移；秒/中文范围/官方时间码与shot范围/递增已覆盖。token/context/schema补丁预算保持Phase 3待办。
- 实际实例：干净Core `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`（0.39.0开发提交）、干净Continuum `94eaf70d674a58244e1cb139f021290d63fb2e6c`、干净Motion v0.6.2 `5335715abe54c1a9bfbe3494da29aae3e8635ce3`。隔离应用通过AppApi启动ComfyUI并读取注册schema，确认H3 length最大3600、Continuum 4–30/0.1、Motion图像22/音频24；其他节点本地修改未动，权重hash未测。
- 验证：focused与typecheck通过；完整verify为2,234项测试、干净renderer/web/Electron构建、20组对比度。真实隔离Electron完成Create、边界、Motion、bootstrap的30s缺输入→恢复→按钮→新task ID，来源身份及快照检查通过。queue保持停止，没有采样/长视频输出；原生文件选择器、managed accepted Run正向与长时质量不在这些UI结果内。
- 本节为Phase 1/2验收时点；后续Phase 3/4/5结果见下方各节，不将历史未验状态当作当前结论。

## 14. Phase 3结果与Gemma决定

2026-10-19用户授权Phase 3，并在确认Writer原generate/refine服务端20s限制后明确选择不改原插件、保留20s。应用在运行时准备前拒绝不支持的时长，不伪报20、不自动切后端/CPU。

- 共享输出预算在30s继续增长至普通3840/详细5760，并考虑长原稿的估算覆盖余量；原短片值、11预设及详细750/950词参考保留。后续按用户明确要求把词数不足/正文短于原稿改为警告，允许返回与保存新版本，原136词拒绝仅为旧规则证据；空/缺失/重复主时间线、截断和资源/时长保护不变。估算不是增强器实际token计数；H3 conditioning估算不再用于判定增强器截断。
- Native实际schema支持32768，无需修改Core。MultiModal安装补丁与扫描同步到16384输出、按需8K/16K/32K上下文；LoRA同步到16384与实际输入+输出的模型context预检。未知/不足schema明确拒绝，不静默缩预算。Strata原官方tokenizer/32K自动剩余预算和资源门禁不变；Writer原内部R2V repair等限制未修改。
- 先备份再应用本机MultiModal/LoRA兼容补丁，真实源码幂等/Python语法与应用启动后的在线schema已验；不升级上游、不下载权重，Gemma原文件保持。最终verify为2275项、类型化构建及20组对比度通过。
- 真实Native2B普通30s按钮/operation/新版本写回成功，但仅374字符，不当细节质量证明；详细30s原始136词不足750被拒，原稿保留。Gemma30s真实按钮在创建操作前拒绝。Qwen27B仅17.5GiB空闲，低于20GiB门槛，未降级；LoRA30s正文未实跑。Strata隔离fixture显式复用原安装后进入真实30s默认预设的SHA-256准备，在有限时间窗取消，尚无模型PID/正文；不是卡死或GPU推理失败结论。
- 因而Phase 3代码/安装适配已完成，跨后端长文质量验收仍partial，不能称所有后端已稳定30s。实际operation IDs、补丁备份、超时/取消与清理证据见[TASK](TASK.md)；本节不包含后续Phase 4/5结果。

## 15. Phase 4警告与真实界面结果

2026-10-19按用户授权完成。Create请求时长、Extend新增段严格>15.1s显示原时长控件旁的图标/tooltip；来源总长、成片总长、上下文与实际采样窗口不参与触发。三语言及增量显隐不重建活动输入，隐藏时关闭展开状态；不进入提交阻塞条件，缺输入/依赖/资源和旧Run冻结仍保持。

完整verify为2285项、双端类型化构建和20组对比度通过。真实隔离Create 15.2s、Motion 30s缺输入→恢复→按钮→task ID均通过；实际15.1/15.2/30阈值、焦点/键盘/悬停、三语言启动文本及1600×1000/1280×800截图通过，队列始终停止，自有Electron与端口已清理。具体task IDs与证据目录见[TASK](TASK.md)。本轮无视频采样；触屏手势与真实旧managed Run未验，Phase 3长文质量仍partial，Phase 5质量/资源/恢复不由UI成功代替。

## 16. Phase 5限定实跑与Continuum重点

2026-10-19用户授权写入正式History，并明确Motion不必详测、以Continuum为主。以现有360p/20步执行策略完成原生20/30s、Continuum bootstrap新增20/30s，以及50s新作品再次新增30s得到80.041667s/1921帧；这条20→50→80s链是连续续写，不是一次原生80s采样，也不是managed accepted Run证明。

真实按钮、来源/父版本、精确帧数、名义24fps/逐帧时间戳、双声道音轨、完整解码、History播放/返回及连续Continue通过。时间采样、两处接缝和末段图未见明显跳变，听感/口型/逐动作语义与Continuum原补尾算法的完整观感仍需用户审阅；资源采样不是瞬时峰值保证。

Motion执行中取消→同ID重置→正常退出/重启→继续通过，已运行30s仅收尾；实跑发现的少1帧由Motion/边界复用Continuum现有精确拼接路径修复。三族媒体回归和修复时2287项完整verify通过，修复后Motion20/30及Continuum链实跑帧数通过。正式History新增8件、原129件严格不变，草稿/设置最终磁盘恢复、正常退出和运行时清理通过；具体任务、问题样本及证据见[TASK](TASK.md)。managed长段、边界GPU、高分辨率/其他组合及Phase 3长文质量仍未全验，不能笼统称全矩阵完成。
