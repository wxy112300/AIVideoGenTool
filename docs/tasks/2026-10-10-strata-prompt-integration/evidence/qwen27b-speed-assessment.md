# Qwen3.8 27B 提示词增强提速评估

- 类型：Evidence / source + control-flow + real runtime assessment；更新：2026-10-16。下文10-15只读研究为历史阶段；当前升级、真实测试与限制以末尾“升级与真实测试”章节为准。
- 授权：用户要求研究27B提速；只读本机源码/包元数据及上游小型文本/JSON，不安装、不下载权重、不启动Electron/ComfyUI/GPU，不改设置/原稿/History。
- 应用基线：0.65.1，Git `0a0ac692bd660e8cb8f2db693af47a2b03eba8e6`，已有72个dirty/untracked项；保留全部既有改动。新增子agent0。

## 真实接入和安装身份

- 当前27B通过`buildMultimodalPromptWorkflow`→ComfyUI `VisionLLMNode`→JamePeng `llama-cpp-python`，不是Strata或独立llama-server。
- catalog主模型：`Qwen3.8-27B-Uncensored-noMTP-Q4_K_M.gguf`，revision `dee0a3164d9e11bbbebf5b63f52ba99443d14fc3`；另有配套vision。catalog contextSize=8192不代表节点始终按8K分配：本机节点在max_tokens>2048时使用16384，否则8192。
- 本机MultiModal节点origin与catalog相同；HEAD `b305642e711b84fefdf5d27db6860c086b1f3015`，2026-08-22；在线main仍相同。`local_gguf_utils.py`与`vision_llm_node.py`存在既有本地补丁，分别6/2与42/6行增删，禁止用覆盖更新丢失。
- 所选Python包METADATA为0.3.46，direct_url资产是cu130/cp312/win_amd64，与应用固定线一致。只读文件，不导入native或加载模型。
- ComfyUI core/data/Python来源沿用已有诊断设置；选中core无.git，完整SHA未证实。本轮没有取得实时AppApi/schema/日志，不把静态GPU意图当作实际全GPU驻留证明。

## 按价值排序

| 候选 | 当前事实与作用 | 决定/边界 |
| --- | --- | --- |
| Qwen视觉路径关闭不必要的全量logits | 节点固定`logits_all=True`，实际chat调用不索取logprobs；0.3.46创建`(n_ctx,n_vocab)`float32数组。248320词表在8K/16K分别为7.578/15.156GiB数组容量，普通单行约0.95MiB | 第一优先对照。容量是源码计算，不等于实际驻留/已测节省；部分旧视觉handler依赖全量logits，必须限定并验证Qwen35/3.8 MTMD，不能全局改Gemma/其他模型。现代官方图片MTP示例未开启logits_all，但其9B证据不证明本机27B可直接关闭 |
| 显式核对FA、prefill batch、实际GPU层和上下文预算 | 当前GPU选择传n_gpu_layers=-1；包FA默认auto，batch/ubatch默认2048/512，非“没开GPU/没开FA”。长输出触发16K；视觉至少1024token/图 | 不盲目强开FA、减图/缩上下文/压输出。先记录实际分配和prefill/decode，再单变量调batch；完整输入+视觉+输出必须可容纳 |
| 保留已有模型驻留租约并分离冷暖测速 | 原应用已有retainModel/keep_model_loaded及显式租约；非保留请求结束会释放，避免与视频抢GPU | 复用现有交互，不新增默认永久驻留。只改善重复请求冷加载，不把暖启动效果写成decode倍率；纯文本不必要的projector加载可另测 |
| MTP（先文本，后带图） | 本机0.3.46没有新的SpecConfig MTP接线，节点也未传speculative；现有主模型noMTP但发布者提供独立head | 值得第二阶段，不是加一个开关即可。正式0.4.2与最新main的视觉支持不同，见下文；必须保留普通路径 |
| 更低量化、DFlash/DSpark或另起服务 | 新权重/架构匹配、视觉支持及质量成本额外增加；没有本机收益证据 | 延期。不为了提速丢失图片/原稿或降成短输出；27B无需借Strata。优先留在现有ComfyUI路径，不新增端口/设置层 |

## MTP：正式发布与刚合入源码必须区分

截至查询，最新正式0.4.2（非prerelease，2026-10-03），cu130/cp312 Windows wheel存在，173738800 bytes。发布commit `528cf248460b49312597db98eb4f4e74a73214b8`；正式README仍为MTP text-only，MTMD代码对不支持predecoded media的引擎明确拒绝。

GitHub实时API得到main `67f2d2862cf17edb57b4bf23150afeb698bd3c39`（2026-10-15），比上述release ahead19，非web缓存中仍显示9月历史的“最新”：

- `10fa28913e4dfee09f8d3c583293829f0b18e838`（10-14）修正MTP媒体处理。
- `888e5740fe2e810a32d16330afac3c8671ff2131`（10-14）启用MTMD图片MTP，MTP引擎支持媒体回调。
- `67f2d28…`（10-15）增加图片MTP普通/加速对照示例和计时。文档明确公开验证的是Qwen3.5-9B-MTP；不是27B Uncensored验证。每次图片MTP请求重建target/draft状态，完整prompt和媒体必须放入上下文，不支持靠context shifting救场。

因此，初读旧README所得“MTP纯文本”仅适用于正式wheel，不能扩大成当前开发源码永远不支持图片。反过来，main的新能力也不能冒充正式0.4.2现成wheel可用。本轮没有找到包含上述合入的正式发布，未源码构建。

应用当前requirement `<0.4`、固定0.3.46；不能只提升推荐号。升级需连同wheel/ABI/导入/GPU探针、handler参数、取消释放、本地补丁，以及共用此包的Gemma Prompt Writer回归，恢复旧wheel路径也需验证。本轮未安装或实际验证回退。

## 权重成本与证据缺口

发布者明确支持noMTP target +外置draft，无需原理上重新下载整份主模型。但实际采用前要确认现有主模型hash/revision与head兼容，不能仅凭同名跨revision组合。

在线模型main `45d0fc0ad6cfcf9eeee6008ddaea925536409b18`（2026-08-29），API LFS元数据：

| 文件 | bytes | SHA-256 |
| --- | ---: | --- |
| draft-Q4_0 | 1680272096 | f3ac2acd205b2f9acc1b027b67867f4ba1cf84761d226024a3b153345a69e127 |
| draft-Q8_0 | 3164006592 | fddd6bf1ca2f2a3560490213610d5ca5d05bb8d498ac9fb9677732bc1460362b |
| noMTP-Q4_K_M | 16547400160 | dfd8fee6cd48899bb8dae0c2f59c36cac5e5ee718287d6fa1b5bcfc169c419eb |

发布者测量以Q8_0 head为默认，Q4_0接受率未测。文件1.68/3.16GB不是运行显存增量：还要计draft context、回滚checkpoint、工作区、projector与目标KV。4090不能只把文件大小相加后认定安全。发布者链接的spec-decode-bench本轮web和API均401，不能引用其倍率/速度；现有ppl/能力表也不等于MTP性能。catalog固定旧revision元数据请求超时，本机主权重本轮未重hash，身份差异保留unknown。

## 继续研究：当前0.3.46的logits依赖核对

用户继续要求研究后，直接检查本机实际安装源码，而不靠最新版示例反推旧版行为：

- `Qwen35ChatHandler.__call__`清理输入ledger后委托MTMD父实现；它和当前MTMD父类均没有强制检查或读取`_logits_all`/Python `scores`的依赖。当前模型由节点的Qwen3.8识别适配选用此handler。
- MTMD图片调用`mtmd_helper_eval_chunk_single(..., logits_last=True, ...)`；图片输入和是否保存全部Python分数是两件事。普通chat请求未索取logprobs，MTMD交给completion时传`None`。
- 当前`Llama.eval`在true模式请求每个文字token的词表logits，并将每个成功batch的完整矩阵复制到Python scores；false模式只请求最后token的logits。`Llama.generate`已有原生采样无需Python scores的分支，在没有logits_processor/stopping_criteria时传copy_logits=False，`sample`直接读native context。
- 因此这不只是减少一个大数组的容量，还可能减少文字prefill输出头计算与CPU分数复制。实际GPU内核和总耗时收益未测，不能把请求行数减少当作线性加速倍率，也不能保证释放15.156GiB真实驻留内存。
- 需要全token logprobs等特殊调用仍依赖true；Gemma、旧非MTMD视觉handler与其他应用调用不能全局切换。Qwen专属候选不改变权重、图片token、原稿、输出上限或采样设置。

### 无模型诊断结果

私有脚本`temp/qwen27b-logits-probe.py`通过AST提取本机原始`Llama.eval`、`Llama.sample`、MTMD父类和Qwen35实际`__call__`执行；只模拟native计算边界，不导入llama_cpp/torch，不加载DLL、图片或权重。NumPy数组限定64×64，不分配上述大数组。命令为所选Python `-B temp/qwen27b-logits-probe.py --package <所选site-packages/llama_cpp>`，日志`temp/qwen27b-logits-probe.log`。

9项通过：true/false请求logits行与复制分支；原生采样不复制Python分数；图片+后续文字ledger与completion参数一致；图片在末尾；真实Qwen35转发；无效token前置拒绝；不允许shift时超上下文拒绝；媒体取消清理且不生成；文字取消不写入ledger。11个合成文字token按batch4时，true请求11行并复制3个batch矩阵，false请求1行并复制最后一行；普通native分支可完全不复制Python分数。模拟边界返回的token一致不代表真实神经模型token一致或图片质量不变。

固定输入SHA-256：`llama.py`为`0ab5b62347ce3e58068e8b58f6e2c773d6062450e0d0a3879db4872b48289131`，`llama_multimodal.py`为`e4b419e2859e3152ba577606a88a8084b9160ca5f39f353954fd4432ddf8a009`。这些原文件没有修改。

结论从“值得查”提升为“现有Python控制流没有发现必须全量logits的依赖，且无模型分支诊断通过”。仍未达到真实27B加载/图片理解/性能验收。建议下一步先做限定Qwen MTMD的隔离A/B，不为此升级wheel或下载MTP。若未来实施，应纳入现有`dependency-node-adapters.ts`的受管理补丁与scanner指纹、幂等/CRLF/未知源码拒绝及重装测试，不手工修改site-packages或新建服务/设置。

本次新增脚本/日志均在忽略temp，只更新此证据及TASK；生产代码与安装目录不变。没有UI、真实模型、GPU或速度证据，不需要以完整verify替代它们；文档/临时脚本diff检查通过，无新增常驻进程待清理。

## 下一步最小实验（真实模型尚未执行）

1. 保持原0.3.46/普通Q4和同图同原稿，先只改变Qwen专属logits_all；短文本→丰富单图→15s多镜头长原稿，记录冷加载、prefill、首正文、decode、总耗时、RAM/commit/VRAM及输出语义。合成检查/真实按钮回写分别验，不使用视频任务队列。
2. 若安全且兼容，再单变量评估FA实际状态、batch、8K/16K有效容量，不能裁切输入、降低原输出预算或牺牲精确对白/镜头来凑速度。
3. 之后在隔离环境验正式新版普通路径/Gemma兼容，再测试纯文本MTP。draft_n_max从官方建议2开始、与0/1/3小范围对照，保留普通无MTP。
4. 图片MTP仅对含10-14修复的固定候选源码/后续正式包评估；不把9B示例当27B支持。没有资源余量或匹配权重就不加载，不用OOM试探容量；旧输出/安全校验不放宽。只在真实收益明确后接回现有节点管理，不增加第二套界面或常见端口。

验证层：source/files（包与节点源码身份），无实时schema、UI、推理或benefit证据。仅新增本证据和TASK摘要；生产代码、catalog、推荐线/设置未变，不bump、不发布；文档diff与本地链接检查。没有启动服务/GPU或待清理进程，不重复跑与此文档评估无关的verify。

## 主要来源

- [27B发布者模型卡](https://huggingface.co/JonathanColetti/Qwen3.8-27B-Uncensored-GGUF)：noMTP+head、大小、用法与测量边界。
- [正式0.4.2/cu130发布](https://github.com/JamePeng/llama-cpp-python/releases/tag/v0.4.2-cu130-win-20261003)；[固定release README](https://github.com/JamePeng/llama-cpp-python/blob/528cf248460b49312597db98eb4f4e74a73214b8/README.md)。
- [图片MTP合入](https://github.com/JamePeng/llama-cpp-python/commit/888e5740fe2e810a32d16330afac3c8671ff2131)；[图片对照示例/文档更新](https://github.com/JamePeng/llama-cpp-python/commit/67f2d2862cf17edb57b4bf23150afeb698bd3c39)。
- [MultiModal节点源码](https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes/blob/b305642e711b84fefdf5d27db6860c086b1f3015/vision_llm_node.py)；本机有上述补丁差异。
- [llama.cpp参数](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)：batch、FA、KV、spec参数仅是能力，不等于当前Python节点已接入。
- [历史社区OOM报告](https://github.com/ggml-org/llama.cpp/issues/23371)：Qwen3.6/旧Linux构建/5090/262K/并发的checkpoint压力；与本机27B/Windows不同，仅提示风险，不用作当前版本必然缺陷或性能证据。

## 升级与真实测试（2026-10-16）

后续现场核对：用户完成节点更新后，所选Python以`-I`读取实际包元数据仍为0.3.46，origin指向真实venv而非隔离overlay。MultiModal的lean helper与调用点、Writer架构/诊断的0.5上限均已落盘。真实安装日志记录节点更新检测“CUDA后端已就绪·v0.3.46”后复用；与节点安装入口`forceReinstall:false`一致。尚需共享运行库卡片的显式重新安装，不将节点补丁完成等同wheel升级。此次无GPU请求或服务、没有替用户安装/下载；下述0.4.2结果仍仅代表上一阶段隔离环境。

用户授权提升推荐版本、优化适配并先测试；明确允许用已安装Qwen3.6 27B代替缺失的3.8 27B。本阶段为patch兼容修复，不bump、不提交推送、不下载模型/MTP、不执行视频任务队列。

### 实施与隔离身份

- 推荐固定JamePeng `0.4.2` / `20261003`；兼容范围`>=0.3.34,<0.5`，旧就绪安装保留。cu130/cp312 wheel 173738800 bytes，SHA-256 `693cef0b23b042e66e4f35c32ab2eb27bdbfa1c06371df7f95ab350f185a90c2`，经校验后以`--no-deps --target`装入忽略temp，原共享环境仍0.3.46。CUDA后端、Qwen35/MTMD/Gemma4 handler导入通过。
- 使用实际MultiModal节点b305642＋既有应用补丁的隔离副本；`multimodal-prompt-logits.ts`仅Qwen35且实际MTMD handler设置logits_all=false，其他handler保留true，文本loader不改。受管理安装器、离线扫描修复提示、幂等/LF/CRLF及未知/歧义源码拒绝均接入，不手改原site-packages或节点。
- Prompt Writer0.4.7实际按钮最初被其`parsed < (0,4,0)`架构检查拒绝，非native崩溃。现有兼容适配器将这项与独立诊断MAXIMUM_VERSION扩展至0.5，保留架构及最低版本；将gguf_adapters.py纳入应用补丁身份/安装事务及扫描修复提示。修复后真实Gemma E4B按钮成功回写。
- 权重为本机Qwen3.6-27B-Fable-Fus的Q4_K_M与BF16 projector，主文件18047255072 bytes、投影931146304 bytes；本轮未重新hash大权重，身份仅到本机路径/大小。Gemma为现有E4B Unconcerned Q5_K_M/BF16 projector。两者均不是3.8 27B实证。Comfy在线报告0.39.0/d91ed5f5，未核验完整core SHA。

### 真原生后端对照

固定同一Qwen3.6模型、同输入和采样，依次运行旧0.3.46/all、新0.4.2/all、新0.4.2/lean；每个自有进程单独退出。图片为历史素材的丰富三主体/网格地面/黑色上方结构；长稿为历史街景首帧＋1835字符15秒三镜头原稿，通过生产instruction编译为约23775字符完整输入，未裁切图文。MTP均未启用。

| 项目 | 0.3.46/all | 0.4.2/all | 0.4.2/lean |
| --- | ---: | ---: | ---: |
| 首次模型加载 | 14.699s | 6.328s | 6.368s |
| 简单文本请求 / 首token | 6.803 / 4.982s | 2.147 / 1.770s | 2.065 / 1.693s |
| 文本native decode | 35.02 tok/s | 34.52 tok/s | 33.76 tok/s |
| 图片请求 / 首token | 8.771 / 2.559s | 5.052 / 0.954s | 4.932 / 0.922s |
| 图片native decode | 38.01 tok/s | 37.54 tok/s | 38.26 tok/s |
| 8K Python scores数组容量 | 8136949760 bytes | 8136949760 bytes | 993280 bytes |

新版本all与lean的简单文本、图片raw逐字相同。数组容量从约7.58GiB降到0.95MiB是实读ndarray.nbytes，**不是已测RSS节省**；16K全量15.16GiB只是容量推算。本轮没有host RSS/commit采样，不宣称相应实际RAM收益。旧/新顺序有文件缓存、首次初始化等干扰，不从旧6.8s到新2.1s声称3倍提升；新all/lean的小延迟差也不证明稳定提速。稳态decode约38tok/s，未出现数量级增长。

长稿仅new-lean完整运行：16K context、3072 output，加载6.139s，请求43.408s，首token4.732s，decode37.35tok/s，1407 completion tokens，正常stop。usage文字prompt_tokens6212不能当作包含所有媒体位置的完整占用。生产归一化复验**未通过**：主时间线955词，小于1300词门槛；保留失败，不以完整返回宣称影视扩写合格，不放宽门禁。

GPU每秒采样的最低空闲：旧2682MiB、新all2668MiB、新lean2129MiB（含16K长稿）。保护阈值1536MiB，均未触发、无OOM；采样不是硬峰值保证。切换8K→16K前显式关闭旧manager避免诊断引用造成叠加。

### 真实应用链路与收尾

隔离Electron/userData、独立Comfy数据根与端口、共享模型只读引用；应用管理Comfy生命周期，通过PYTHONPATH继承隔离0.4.2，无第二套服务实现。后台窗口使用focus emulation。全空增强显示补输入且无请求；键盘输入后真实鼠标点击增强，Qwen产生新version ID、端到端39.681s；切换Gemma并修复上述版本限制后产生新version ID、端到端81.087s。两次包含服务profile切换/扫描/加载，不等于纯模型耗时。Queue/History一直为空。Qwen杯子样例额外写出原稿没有要求的蒸汽，不能把“成功回写”等同完全忠实。

最初fixture缺user目录导致Comfy启动code2，修复隔离准备脚本后恢复；保留失败报告，不归咎于模型。原始请求/输出、GPU采样、版本ID、运行日志只在忽略temp，不纳入提交；没有把用户原始历史素材或机器路径写入本证据。

带图UI在同一隔离应用中切回Qwen，准备历史三主体图＋自行编写的英文8秒同步侧步/回位指令，要求原身份/服装/地面/桁架、重心转移、固定广角、不加人/对白/音乐。实际增强按钮37.758s写回新version；识别左侧绿衣人物、中央银色机器人、右侧橙色机器人及网格/黑桁架，并扩成四个动作阶段。模型将机器人初始姿态概括为neutral而原图处于运动相位，且给出并未从图中确证的材质/声响；这是忠实性局限，不以结构通过宣称语义全通过。未发生OOM，1秒采样最低2420MiB空闲，保护未触发。长稿仍以上述失败为准，不重复调用凑合格。

最终focused4文件95项；`npm.cmd run verify`通过214单元文件1968项＋6集成文件88项、双端typecheck、干净生产构建和20项对比度。日志中的jsdom scrollTo未实现消息没有导致用例失败。scoped diff/本地链接核对通过。

通过既有fixture cleanup经AppApi停止自有Comfy，再关闭隔离窗口，复核主PID/自有Python及8713/8827监听消失，空闲显存恢复约21.3GiB；这只是Harness清理，不是原生退出生命周期新证据。真实用户state SHA-256不变、原MultiModal两文件与测试前副本hash一致，原Python包仍0.3.46；没有下载模型/MTP、删除共享资料或改变默认模型。wheel及可复查测试资料留忽略temp，不清理含共享models junction的树。生产推荐已更新，但用户实际安装还需点击原安装/重装修复入口；共享环境真实升级/回退未执行，不能称已验回滚。

## 正式环境自动升级与验收（2026-10-16）

用户明确授权“用技能自动更新然后继续”，覆盖前一阶段只等用户点击安装的边界。按升级评估与真实应用技能，经现有AppApi `installLlamaCppPython`执行显式修复：真实所选venv的0.3.46被替换为0.4.2+cu130，耗时96.566s，CUDA自检通过。pip direct_url登记的固定发行URL与SHA-256 `693cef0b23b042e66e4f35c32ab2eb27bdbfa1c06371df7f95ab350f185a90c2`均匹配此前候选；本次不使用PYTHONPATH overlay，不源码编译、不重装公共依赖。安装前备份实际llama_cpp与dist-info，保留在忽略temp；没有实际回滚，不能称回滚已验。

测试使用隔离Electron/userData和自有6438端口，但运行实际所选Comfy core/data、已更新MultiModal1.0.16与Writer0.4.7、真实venv和共享模型。不是上一轮节点副本。两节点在线loaded/runtimeVerified均通过，旧版本上限与lean适配提示已清除。全空增强可见阻塞→键盘补齐→鼠标点击增强→新version ID，Queue/History始终为空。Qwen仍为用户允许的3.6 27B，非未安装的3.8 27B；MTP保持关闭。

| 真实应用用例 | 时间 | 结果 |
| --- | ---: | --- |
| Qwen简单杯子文本，首次点击 | 53.780s | 新版本；含服务profile重启与冷加载，服务耗时53.240s |
| Qwen丰富三主体图，重载 | 27.868s | 新版本；8K，上限1280，实际422 completion tokens |
| Qwen同图不同动作指令，模型驻留 | 19.524s | 新版本；日志证明Using cached model，实际429 tokens，不是复用同一缓存输出 |
| Qwen街景首帧＋15秒三镜头长原稿 | 服务端61.326s | 1073词不足1300，正常stop、1536/2880 tokens，未新建版本 |
| Gemma E4B普通文本 | 47.115s | 新版本；服务耗时46.430s |

长稿UI走完整参考角色/实际时长契约15.08秒及16K，上限按生产预算实际为2880，不能与上轮3072后端诊断假称精确A/B。1536即主动停止，未接近上限；问题仍是过早收尾/扩写不足，而非OOM或输出预算耗尽。通用关键词门禁没有恢复，长度门槛没有降低。丰富图例仍将原图运动姿态泛化成standing/neutral，属于忠实性缺口，结构写回不证明全面语义正确。首次冷启动、两条不同指令的暖/冷带图不是严格性能倍率实验，也没有新native decode/首token遥测，不能宣称19.5秒等于纯推理或显著升级倍率。

两处临时Harness竞态保留负证据：首次在主进程terminal completed但renderer尚未保存时过早断言失败，随后按匹配operation ID、createdAt和真实新version复核成功，未重跑短文；该次finally释放模型，所以后一图明确记“重载”。长稿terminal failed后脚本过早调用release，碰到请求尚未完全settle，改为等实际按钮aria-busy=false后再继续；没有重跑长稿。长稿59.843s只是早期terminal采样，不作为完整UI失败耗时，表中采用应用服务日志61.326s。均是临时脚本时序，不把模型标成崩溃或虚构全部用例成功。

每秒资源采样最低空闲显存2217MiB（约2.17GiB）、物理RAM20.28GiB；没有OOM、没有触发1536MiB/3GiB取消保护，采样不是硬峰值保证。经现有cleanup通过AppApi停止自有Comfy、关闭隔离Electron；复核73652主PID、自有Python及6438/6440监听消失，空闲显存恢复约21.63GiB。用户真实state SHA-256保持，实际新运行库保留；原草稿/默认模型/Queue/History未改，没有下载模型/MTP、视频入队或关闭别人的程序。

输入、两张历史素材引用、各次原始输出/失败、诊断、版本ID、采样和可读TEST-RESULTS报告均在忽略temp。只维护本证据/TASK，不改生产策略、不bump、不提交推送；复用同一生产文件状态此前通过的verify，未把它写成新跑一遍。本轮安装/API/schema/UI/runtime已验；长稿质量与稳定性能收益仍未通过。
