# H3 原生单次 30 秒：独立能力调查（归档）

- 类型：Task；Status: archived（2026-10-19按用户决定关闭；Phase 1/2/4与Phase 3代码适配、Phase 5限定实跑已完成，未验质量边界保留）。
- Updated / Owner: 2026-10-19 / 本任务已关闭，释放文件归属；Execution: direct，新增子 agent 0。
- Scope / Authority: 原生30s与长视频编排保持独立。Phase 1/2已实施；用户授权Phase 3，并明确选择“不改原插件，Gemma保留20s上限”。已实现共享增强预算、schema拒绝与安装兼容，备份后应用本机MultiModal/LoRA补丁；Gemma插件不变，不伪报时长、不自动换后端/CPU，不下载权重或升级上游源码/软件。Phase 4已完成。用户现授权Phase 5，明确允许写入实际History以查看长视频；先备份正式状态，再按20s→30s有界实跑，保留新输出，不删除旧作品或改旧Run采样身份。
- Baseline: 初查为`475722c2c231da2aa8782d66e6c03d22a5913809` / 0.66.0；本次读取当前磁盘TS，harness显示0.66.1。未将历史SHA或catalog推荐线当作本机实际运行身份。
- 权威：[Workflow](../../WORKFLOW_CONTRACT.md)、[Architecture](../../ARCHITECTURE_CONTRACT.md)、当前TS；本轮已更新应用准入与时间契约，不将准入/schema/UI成功当作30s生成质量或资源保证。

## 归档结论

- 用户在确认Phase 5结果及长prompt时间规划边界后决定“可以归档这个plan了”。本任务关闭，以下为历史决策与验收证据，不再作为活跃计划或自动派发后续阶段的入口。
- 已交付30s准入与分支预算、共享时间轴与增强预算、短稿警告、非阻断时长提示、H3精确拼接修复；正式History保留8件实测视频，含Continuum约40/50/80s结果，原129件作品未改，草稿/设置已恢复，测试运行时已清理。
- 未验边界保留：跨后端复杂长prompt的逐事件时间服从与完整语义、managed长段/旧Run真实矩阵、高分辨率与其他量化/加速组合、完整听感/口型及补尾观感。时间规划指令和校验正确不等于模型逐秒执行保证；这些不是本归档计划的活跃待办，未来需要时另行授权立项。
- Gemma原插件及20s上限保持；原生30s、连续续写和Strata长视频编排仍是不同能力。归档保留既有代码、正式History、负结果和安全边界，不作全矩阵质量通过结论。

## Resume

- 结论：原生单次30s有实质证据，不能一概当拼接。已取得3090作者原始JSON，展开子图、解析外部覆盖值，确认30s→736帧→单个原生SamplerCustomAdvanced→视频/音频解码→24fps封装；无时间分段/续接/视频concat。另有对应单轮8/8日志。属于公开graph与作者运行证据，不是本机运行成功。
- 已取得42s作者JSON：1008帧Ref2VA→单个H3采样器；额外KSampler属于默认bypass的SeedVR2后期，不是多段H3续接。两份JSON均已记录bytes/SHA256，原始文件只留gitignored temp。
- 实施前的15s与362帧双限制来自catalog/共用校验，UI、主进程入队、claim后执行前均检查；上游最初v0.30.0就允许更长length。Phase 1已同步标准catalog、新快照与共用准入，不依赖长片DAG，也不是只改slider。
- 最新产品方向：现有H3 Create与可用Extend路线统一提供至30s，Extend指新增段而非成片总长，不再默认排除13/14/15s的原受限路线。按请求时长严格>15.1s显示小警告图标/hover提示，不单凭警告禁止提交，不强制另建实验模式；上下文/真实采样窗口另如实展示，不改变触发阈值。Q3当前不支持Extend的能力限制、非H3预算与资源保护不自动解除。
- Extend帧数结论：边界帧30s复用Create的736；Motion Context当前图传736+22=758，固定Core再次向上对齐为770，原始trim后748帧，后处理再按请求30s裁切。建议先保留算法，以实际770做完整采样准入，不把736/758误作预算。若改成先合并上下文再对齐可为753，但改变采样语义，未纳入本次最小方案。
- Continuum固定推荐3.9.1源码本来支持4–30s，不必为此先升级；22帧上下文+30s按最近网格736，原始新增714帧/29.75s，exact_total_duration组装到720帧时会重复约0.25s尾帧，音频也校准，必须验证末段质量。managed物理组可能合并，资源预算按真实plan，不能把单段736当所有Run峰值。
- 兼容边界：新managed sequence可选30s；旧Run的chunkSeconds与采样身份/accepted prefix冻结，仍按原时长继续，不能静默改为30或接受30后入队15。旧队列快照、History父版本、AV真实帧数、官方Run锁/receipt/hash保护保留；已有commitProducedFile从真实tensor重建帧数，不能把collector的预估偏差误判为最终manifest必坏。
- Extend Prompt：边界帧是I2VA/Picture 1，Motion Context是R2V/锁定Video 1，Continuum原生状态承接用T2VA/局部Chunk body。增强按新增段时长而非来源总长，旧managed在增强前就用冻结值；完整采样轴、去前缀后的新增轴、最终拼接轴不能混用。五类后端和11预设的长文/细节预算改造同样覆盖适用Extend路线。
- Phase 3已移除共享普通/影视细节2048/3072封顶，按时长与原稿估算输出余量，并同步MultiModal/LoRA安装补丁与在线schema。Writer原generate/refine服务端20s与内部R2V repair限制按用户决定保留，应用在准备运行时前明确拒绝>20s；不宣称Gemma支持30s。
- Phase 4已接入严格>15.1s警告：Create看请求时长，Extend看新增段；三语言、悬停/键盘与增量显隐保留输入焦点，不进入提交阻塞条件。真实Create 15.2s、Motion 30s按钮入队与1600×1000/1280×800截图已验；该阶段未执行GPU，后续Phase 5结果见下方。
- Phase 5按最新指示聚焦Continuum：已真实生成20/30s原生、20/30s bootstrap及50s作品再次新增30s的80.04s成片；Motion仅收完已运行30s，不再扩展边界样本。正式History新增8件，原129件严格不变；草稿/设置已恢复，正常退出和端口清理通过。全参数、managed长段及增强长文质量仍不作通过结论。
- 时间点实证：30s→736帧/约30.67s；旧终点容差误判15.1、15.2、30的合法网格终点。Phase 2已采用限定最终端点的网格等价，共用秒/时间码解析；中间动作不整体移时，不扩大通用容差，Extend不接受Create的30.67s终点。
- 全部五类增强后端、11个独立预设、资源保护和三关提交链见[ASSESSMENT](ASSESSMENT.md)第6–10节；第11/12节为研究基线，第13/14节为实施结果。Phase 3代码和安装适配已完成，但30s详细正文跨后端验收未全通过，不能笼统宣布所有后端稳定可用。
- [长视频编排计划](../../tasks/2026-10-18-long-video-director/PLAN.md)可消费未来可用的原生能力；两项任务没有相互前置依赖。

## Phase 1/2实施与验收

- 共用[h3-temporal](../../../src/core/h3-temporal.ts)计算图输入、实际完整采样、上下文前缀、原始新增与可见目标；Motion 30s图输入仍758、实际预算770，不改成753。Continuum最近网格和legacy输出保留，零上下文旧调用仍按最近网格719；它不代表managed原生首段。collector按实际网格预估，真实tensor仍是最终metadata权威。
- 新建标准catalog到30s；边界/bootstrap预算736，Motion预算770，旧362快照仍按原分支上限。managed草稿/增强使用冻结chunkSeconds，冲突执行拒绝；未改协议ID、Run采样身份或receipt/hash保护。Q3 5s/124与非H3不变。
- renderer帧数、Prompt检查、共同增强指令、Writer和Strata时间计划使用对应轴；Continuum为T2VA。覆盖最终端点15.1/15.2/30、内部事件、中文范围、官方时间码、镜头递增/越界，保持已有对白/文字/角色/单镜头控制。Phase 3 token/context/安装补丁预算未改。
- `npm.cmd run typecheck`通过；focused逐片通过。最终代码状态的`npm.cmd run verify`通过2,234项（2,146 unit + 88 integration）、干净类型化renderer/web/Electron构建与20组对比度检查，包含最后零上下文兼容收口；该收口另通过96项focused。已有jsdom `window.scrollTo`和Vite chunk体积警告不影响通过；编辑器另有未改动测试夹具与Node类型环境诊断，不等同CLI门禁失败，未作范围外修复。
- 真实UI，focus emulation开启、独立userData/媒体、queue停止：Create缺prompt→键盘恢复→30s真实点击，task `50eeb2ad-be62-4a59-b591-d50db703a9bd`，736帧；编辑草稿后快照不变。Motion缺视频→History继续→30s真实点击，task `eef1b535-be1b-4706-a63d-1422084ca7bb`，770帧、来源asset/version保留、Spectrum关闭。边界帧缺prompt→恢复→30s真实点击，task `af0ad7ff-20ea-4270-a0bf-5cc463518d08`，736预算。bootstrap缺AV→复制真实隔离AV→检查恢复→30s真实点击，task `093d46c9-324f-4d61-b1a8-6467549d228f`，736预算和正确V3.8 workflow。
- 证据只留gitignored `temp/create-smoke-KddzpS/`与`temp/create-smoke-k2NqtY/`；素材来自既有单作品隔离fixture，原素材/用户库未改。复用smoke脚本并以`LVS_SMOKE_DURATION=30`设置本次时长，默认Create/Motion仍1s、bootstrap为5s。bootstrap前两次探针等待失败保留，修复脚本模型切换时序及managed默认分支后通过；未绕过disabled或用API-only enqueue自证UI。
- 实际实例：Core `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`（0.39.0开发提交，干净）；Continuum `94eaf70d674a58244e1cb139f021290d63fb2e6c`（干净）；Motion Context `5335715abe54c1a9bfbe3494da29aae3e8635ce3`（v0.6.2，干净）。其他已用节点存在本地修改，保持不动；未hash权重。通过隔离AppApi启动ComfyUI至ready/app-owned，在线object_info确认H3 length最大3600，Continuum chunk_seconds为4–30/0.1，Motion图像22/音频24。未提交采样工作流。
- 清理：两次自有Electron PID/CDP端口及8188监听均已退出；ComfyUI通过AppApi停止。使用既有fixture清理而非原生窗口生命周期验收。未生成长视频、未升级安装/下载权重、未改用户state或停止他人进程。
- 该阶段尚未验证：真实managed accepted Run继续/重抽/冻结控件、旧队列重启实跑、所有增强后端/11预设的30s正文、20→30s GPU输出/音轨/接缝/尾补齐/资源峰值/质量与恢复。>15.1s图标/tooltip当时未添加，现已完成，见下方Phase 4。影响为minor，CHANGELOG已写Unreleased；版本仍0.66.1，未提交/打包/发布。

## Phase 3实施与分层验收

- 共享预算沿用每约5.17s普通640/详细960的标定，30s普通3840、详细5760；保留原短片预算。长原稿另按词数与扩写覆盖预留估算空间，明确不是增强模型的真实token计数。详细主时间线30s的非R2V 750词、R2V 950词参考值保留；按下方最新授权，长度仅作警告，不填充。11预设、用户自定义内容、对白/文字/时间点和局部批注修订策略保留。
- Native读取实际TextGenerate.max_length；MultiModal读取实际VisionLLMNode.max_tokens；LoRA读取实际QwenVLCaption.max_new_tokens。请求超过能力时明确拒绝，不静默取小值。未知旧schema保守沿用2048并拒绝更大请求；普通Writer保留原2048下限，20s内可随时长/原稿增加预算。image-edit不套H3时长门槛。
- MultiModal通过现有安装适配器把schema扩至16384，按请求输出<=2048、<=3072、>3072分别使用8K、16K、32K context。LoRA schema扩至16384，并在generate前以processor实际输入长度+输出与模型text_config.max_position_embeddings检查，未知/超出明确失败。离线扫描、修复提示和补丁幂等/未知布局失败关闭同步。Strata保持官方tokenizer、32K剩余空间自动预算、8192视频基础预留、单图详细稿的2048有界思考及资源保护。
- 诊断分离H3 conditioning估算与增强器usage；MultiModal只按真实finish_reason/计数判断截断，缺失为unknown。Native/LoRA明确记录requestedMaxTokens、正文字符数及未知finishReason/completionTokens，不记录正文、不把词数当token数。实读所选Core的qwen35.generate转发和llama.generate的range(max_length)循环，确认Native上限指新增输出，不是含输入的总长度。
- 真实安装：先保留三文件备份于gitignored `temp/h3-prompt-node-backup-SzWcPr/`，再调用现有适配器，仅改MultiModal vision_llm_node.py与LoRA nodes.py，保留其他本地适配；未拉源码/下载权重。两实际源码内存预演、幂等、Pylance语法及所选Comfy Python AST通过。应用启动ComfyUI后的在线schema：Native32768、MultiModal16384、LoRA16384。Gemma仍只有原四个本地改动，assembly.py未改。
- 最终`npm.cmd run verify`通过2,275项（2,186 unit + 89 integration）、干净类型化renderer/web/Electron构建及20组对比度；邻接focused全部通过。既有jsdom scrollTo与Vite chunk警告不阻断；编辑器的旧Node ambient环境诊断未作范围外修改，CLI双端类型检查通过。
- 真实隔离Electron：Native2B普通30s缺输入→恢复→真实下拉/按钮，operation `aac1c0f9-93a1-4ecb-8c0b-1514cc2b0c31`写入新版本，374字符；这不是长片细节质量证明。详细30s operation `b36aae6e-4646-4002-ad8e-d5b8194f3423`主时间线仅136词，低于750，正确拒绝且原稿/queue/History不变。实际停止原因未提供，不能认定token封顶。Gemma30s真实按钮明确拒绝，未创建操作或修改原稿。Qwen27B预检约17.5GiB空闲、要求20GiB，未确认CPU降级；Qwen3.8所选权重未齐。LoRA30s正文未实跑。
- Strata先因隔离LOCALAPPDATA未包含受管理引擎而按钮不可用；仅在隔离设置显式引用现有0.1.45安装后恢复。真实30s默认预设 operation `8c3d8aa5-5b43-4655-b18e-52ffe37fce21`进入权重SHA-256准备；约180s时第一分片58%，尚无模型PID。按有限检查取消至terminal/cancelled，服务stopped，未取得正文；不是推理失败或卡死证据，不绕过hash/资源门禁。完整记录在gitignored `temp/create-smoke-Saq7Ph/`，失败/超时报告保留。
- 清理经AppApi停止ComfyUI、取消Strata并关闭本次Electron；清理脚本是API/JS关闭证据，不冒充原生生命周期验收。没有执行视频队列、没有修改正式草稿/素材；本机兼容补丁与备份保留。Phase 3长文质量仍需在可用资源下完成27B/LoRA/Strata及适用Extend/媒体起稿/批注矩阵，不能用预算/schema/词数成功代替语义验收。影响minor，未bump/提交/打包/发布；该阶段未实施Phase 4/5，后续UI结果见下方Phase 4。

## 字数警告策略（2026-10-19）

- 最新授权：“字数不足也不用明确拒绝，变成警告提示但是允许返回结果”。覆盖详细预设的词数不足与有效正文短于原稿；共享校验返回警告，Native/MultiModal/LoRA/Writer/Strata均可继续返回短稿，Writer不再仅因长度自动补写。
- Create/Extend从原增强按钮成功保存可查看的新版本，原有版本保留；对最终可见正文给出简体/繁体/英文警告，不污染prompt文本。模型指令把词数改为参考，简单画面不强迫凑数。
- 空、缺失或重复主时间线仍拒绝；精确对白/文字、明确时间点、截断、schema/context、资源和Gemma 20s限制均保留。上方136词拒绝为旧策略的历史实测，不代表现行规则；真实跨后端语义质量与后续UI/GPU验收不因此视为完成。
- 定向102项及Native/tooltip邻接61项通过，包含生产Create DOM真实按钮的短稿新版本/警告/可见正文与正常稿恢复、Writer无长度补写、Strata短稿完成及结构失败保留健康模型。最终完整verify通过2283项（2194 unit + 89 integration）、双端类型检查、干净renderer/web/Electron构建及20组对比度。文档UTF-8、本地95链接与Prompt guide一致性通过。未重新运行GPU推理或真实Electron增强；DOM端口为合成，不冒充新的模型输出验收。影响patch，不修改版本或原插件。

## Phase 4非阻断警告与验收

- 用户授权“开始吧”后实施。共享view-model按H3且`draft.duration > 15.1`计算，初次渲染与增量更新共用；Create按请求时长、Extend按新增段，不按来源/成片总长或完整采样窗口。隐藏时关闭展开状态，保留活动输入节点/焦点，不修改准入、快照、旧Run冻结值或Gemma限制。
- 原时长标题旁复用Lucide警告图标和既有tooltip交互，支持悬停、焦点、Enter/Space/点击；简体、繁体、英文提示显存/耗时及动作、音画同步、末段质量尚未完整验证，并明确仍可继续。没有新增确认门槛。
- 定向54项通过，覆盖15.1隐藏/15.2显示、输入焦点/DOM不变、键盘展开与回落关闭、真实DOM按钮及快照、长来源短新增不警告、Motion/bootstrap显示和重渲染。最终完整`npm.cmd run verify`通过2285项（2196 unit + 89 integration）、双端类型检查、干净renderer/web/Electron构建及20组对比度。
- 真实隔离Electron，focus emulation开启，queue始终停止：Create缺prompt→键盘恢复→15.2s真实按钮，task `92ebf2a7-689b-4f5c-acb6-272aeca8278b`、379帧，编辑草稿后快照不变；Motion缺视频→History继续→30s真实按钮，task `3619ed29-5f41-42f1-8153-359bd3f5870a`、770帧，source asset/version与Spectrum关闭保留。Create 15/15.1隐藏、15.2/30显示；Motion 15.1虽采样396帧仍隐藏、15.2/30显示，输入焦点与可提交状态保持。
- 实际hover/键盘tooltip、三语言启动文本及1600×1000/1280×800截图通过，图标渲染、边界矩形和人工截图复核无裁切。证据仅留gitignored `temp/create-smoke-3SppXn/`、`temp/create-smoke-BnPDMb/`；直接AppApi保存语言后重载以加载词典，不当作Settings语言切换旅程。一次终端表达式改写和一次缺词典加载的验收脚本失败已修正，非产品补丁。
- 清理通过现有API/JS夹具关闭；两个自有Electron PID、CDP端口与8188监听均已退出，ComfyUI本轮未启动。未启动队列、未生成长视频、未改正式state/素材或原插件；触屏手势、真实旧managed Run和Phase 5 GPU/质量/恢复不在本轮验收内。影响minor，版本仍0.66.1，未提交/打包/发布。

## Phase 5实跑准备（2026-10-19）

- 用户授权：“开始phase5吧，这次测试允许你写入实际历史数据”。正式状态初查129件History、空队列且停止；无Studio/ComfyUI监听或进程，RTX 4090约22GiB显存空闲。其他工具进程保留，不接管其资源。
- 当前假设：标准H3的20s/30s准入可按既有图实际执行，并由正常queue/history链保存输出；先以20s低原生分辨率、简单连续动作检查实际帧数/音轨/资源/播放，再决定30s。UI入队和静态网格不能代替此检查，失败不重复提交或直接扩大时长。
- 先备份正式state及草稿，正常AppApi启动运行时；只执行本轮任务，保留输出供用户查看。Extend、managed与取消/重启按实际可用来源分层推进，不静默改旧Run或升级模型/插件；Phase 3增强质量补验仍独立记录。
- 最新优先级：用户明确“motioncontext不用那么仔细，常用的是continuum”。Motion不再扩大测试矩阵，修复后20s已验；收到指示时30s task `3a8fa88c-3dbb-4db1-9822-faa7ab405cbc`已在采样，仅收完该条，不另增Motion或边界样本。后续重点为本轮新作品的Continuum连续续写、接缝/末段及History父版本关系；不改旧managed Run。

## Phase 5本轮实跑与收尾

- 正式状态与原始草稿先备份到gitignored `temp/h3-phase5-real-5h1LXz/`；以同一正式用户配置、AppApi管理的ComfyUI、单任务暂停边界运行。360p实际640×352、24fps、20步、无LoRA、Spectrum关闭，使用现有Sage Triton/Core与int8-convrot VAE策略；各次seed以冻结快照为准，不当固定seed性能对照。未升级节点/模型或下载权重。
- 各条均走缺prompt或来源阻塞→真实控件补齐→实际按钮→task ID，随后执行、落盘、History播放与返回。Continuum全部为bootstrap，不冒充managed accepted Run。

| 路线 | Task ID | 最终帧数 | 视频流秒数 | 结果 |
| --- | --- | --- | --- | --- |
| 原生20s | `62987ff5-986f-4447-93cc-ce62e03e4ecd` | 481 | 20.041667 | 通过 |
| 原生30s | `5c7af1c8-eecd-4304-ad73-cd7c0f874e9d` | 736 | 30.666667 | 通过，保留完整原生网格 |
| bootstrap新增20s | `45b25137-33ea-4728-a08f-9b83d14e6715` | 961 | 40.041992 | 通过 |
| bootstrap新增30s | `108f871f-0dcd-4fa5-a3a9-0ca7674e74fd` | 1201 | 50.041992 | 通过 |
| Motion20修复前 | `dcaf594d-9508-4c48-adce-13fb1cd396b3` | 960 | 约40 | 少1帧，问题样本保留 |
| Motion20修复后 | `f84a440e-a249-48d0-aea1-28fcb4a3fde2` | 961 | 40.041992 | 通过 |
| Motion30已运行收尾 | `3a8fa88c-3dbb-4db1-9822-faa7ab405cbc` | 1201 | 50.041992 | 通过，不再扩展 |
| 50s作品再新增30s | `4539064f-491f-4875-9e65-a7bc818830bc` | 1921 | 80.041667 | Continuum连续续写通过 |

- 80s成片asset `ef644f8b-48f3-48ce-9c75-9e592f6a98b1`、version `6d4bfd62-7642-443f-bf95-f2f72aac82dc`，父asset `585c7a6a-2995-4bb2-9922-4b84c35526f1`、version `7fcf5eb7-01c9-4698-a2f7-dba5839393a1`，正式磁盘关系严格核对。20→50→80s是两次Continuum续写，不是一次原生80s采样。
- 成功输出的精确帧数、名义24fps、逐帧时间戳、双声道AAC、全片解码及History播放通过。拼接容器曾给非24/1平均帧率，实际名义24fps、961帧完整且最大累计偏差约0.326ms；修正临时检查为同时检查名义帧率/帧数/逐帧时序，不放宽缺帧断言。80s最终视频流为24/1，音轨约80.073656s；MP4/AAC约32ms封装偏移独立记录。
- 全片时间采样图、20s/50s两处接缝和末段帧图未见明显人物/服装/场景跳变；编码帧hash不能证明没有Continuum原算法约0.25s补尾，未修改该算法，也未宣称听感、口型或逐动作语义全验。完整观感由保留的实际作品供用户审阅。资源为10秒间隔采样，最高约21.2GiB显存/41.7GiB系统已用内存；80s链约20.1GiB/41.1GiB，不是所有瞬时峰值或高分辨率承诺。
- 真实Motion任务在Comfy执行中14%取消；应用停止自有运行时，History不新增。同ID重置waiting→正常退出/重启→快照/来源/草稿持久化审计→继续生成完成。只允许生产内存默认字段归一化与逐文件stat验证的大小缓存刷新，其余严格比较，原129件不变；相关证据为`restart-audit.json`。
- 实跑暴露Motion源片末帧丢失；已有媒体回归扩至Motion后先失败，再让它及同样复现的边界fallback复用Continuum现有精确帧预算、音频补齐与`setpts=PTS-STARTPTS`。首帧裁剪、采样图、AV/旧Run身份保持，非H3不改。三族媒体回归10项通过；修复时完整`verify`通过2287项（2198 unit + 89 integration）、双类型检查、干净构建和20组对比度。修复后真实Motion20/30与Continuum连续续写帧数均通过；边界GPU按最新指示未新增。
- 保留8件新视频并仅给新作品增加“长视频实测”标签；Continuum40/50/80s分别有对应时长标签，80s另有“连续续写”。原129件逐字段严格不变，图片草稿/History保持，自动重试与视频草稿恢复。首次正常退出暴露API-only恢复会被renderer旧缓存写回；重新恢复后重载页面同步，再正常退出，磁盘审计通过，不改产品API。最终`phase5-final-audit.json`确认正式History137件、新媒体存在、队列空且停止、草稿/设置恢复。两个自有窗口66004/30860正常退出，自有ComfyUI/子进程及9333/8188监听清理，无强杀。
- 未验边界：managed长段accepted/继续/重抽/旧Run实跑、高分辨率和其他量化/加速组合、真实边界fallback GPU、全场景声音/口型/逐动作质量；Phase 3跨后端长文仍partial。记录中的准备失败、配置不符未执行任务、取消与首次媒体断言失败均保留，不删除坏样本或按成功率外推。影响为既有minor能力验收及拼接patch，版本仍0.66.1，未提交/打包/发布。

## 历史调查证据

- 使用仓库local-video-studio / comfy-upgrade-assessment技能；只读`harness:app -- guide create-video`与`guide extend`成功。一次误用`guide create`返回unknown，已按真实列表纠正，没有启动应用。
- 2026-10-18完成公开来源、两份JSON连接追踪、固定Core/TS核对及网格/数组算术；当时包含任务索引/长视频链接收口，原6文件检查记录仅对应当日，不冒充本轮改动。
- 2026-10-19研究阶段只修改本目录TASK与ASSESSMENT两文件；补官方指南/编码器及Writer固定源码、其他节点滚动源码；Extend再核对固定Core、Continuum 3.9.1、Motion Context v0.6.2与应用保存/冻结链。Node直接运行当前TS纯函数，确认时间网格、增强/质量预算、终点误判及13/14/15/15.1/15.2/20/25/30s分支算术；不是模型推理。当时未盘点实际节点HEAD/dirty、权重hash或运行schema。
- Reddit本次刷新403/网络拦截，保留昨日证据日期；新LongVideos项目明确逐镜头续接，已排除。历史GitHub限流和未知commit不据此推断无升级；没有绕过登录/限流。
- 研究阶段以文档本地链接、章节/表格一致性与scoped `git diff --check`为验收，当时未启动应用或改生产代码。当前实施证据以上方Phase 1/2记录为准。
- token usage / effort可靠统计不可得，unknown。
