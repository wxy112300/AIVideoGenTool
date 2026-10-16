# Strata 性能配置复核与上游资料（2026-10-15）

类型：Evidence；范围：只读研究，source / files / 既有运行日志。用户要求继续调查速度异常；本轮没有下载MTP、更新软件、启动GPU、修改参数、入队或改变默认模型。使用 comfy-upgrade-assessment 固定身份与证据层，再按 local-video-studio 的 Prompt 路线定位应用。不是一次新性能验收。

## 当前结论

先前20–25tok/s只能代表当前应用定制策略，不能代表Strata在这台机器上的合理上限。已经找到“未加载MTP”和“固定专家RAM预算且被Windows commit进一步压缩”两项明确偏离官方常规安装的事实；后者伴随大量file-tier读取，是很强的瓶颈线索。尚未以隔离A/B量化各项贡献，不承诺修后100tok/s或所有在线模型级吞吐。

此前“无MTP也能运行”在功能上成立；把MTP只作为遥远可选优化，却用无MTP结果评价Strata主打性能，不足以支撑性能判断。这是接入策略需要补齐的地方，不应仅归咎模型尺寸或用户其他程序。

## 1. 身份与机器

- catalog与安装目录固定Strata0.1.41，源码revision fb58e0dbc8399662c0e47c76578c6e878b14f6cf。
- engine/BUILD.json：source=release、CUDA13.0、含sm_89、vision=gpu。本机setup.py与该固定revision在线源码逐文本核对一致（仅归一化CRLF；337587字符）。没有将版本号当作全部文件无修改的证明。
- RTX4090 24GiB，i9-13900K（24核/32逻辑），64GiB RAM，当前两条内存配置速率4800。模型所在卷对应NVMe，不是机械硬盘；PCIe日志18.8–18.9GB/s，不足以单凭此认定实际链路代际/宽度故障。
- 本轮只读快照：系统管理分页文件=true，当前分配9866MiB、使用5451MiB、峰8430MiB；约31.7GiB可用物理RAM、24.2GiB可用提交容量。这是现在的值，不能替代昨晚加载瞬间。
- 之前真实加载日志明确available commit=11.22GiB，不能用现在RAM空闲量否认它。自动管理分页文件不等于每一时刻commit一定足够；当前分配量也不是已证实的固定上限。
- 原始机器路径、完整日志、用户提示词仍仅保留忽略temp。

## 2. 应用配置与官方路线差异

| 项目 | 应用当前实际 | 固定0.1.41官方setup及资料 | 判断 |
| --- | --- | --- | --- |
| MTP | 无--mtp；只有--spec2和suffix/prompt lookup | fetch/pack/rt准备MTP，--mtp配--spec4、--spec-min-p0.5 | 关键加速链未启用，不是仅少一个spec数字 |
| 专家内存 | --mmap-experts + --resident-budget-gib16硬编码 | 普通Qwen按内存选择arena或低内存resident/mmap；setup对Qwen传budget还会提示该选项主要用于大Unsloth文件 | 我们人为走了部分专家文件分层，不是官方64GB典型性能配置 |
| RAM实际驻留 | 16又被commit裁到6.97–7.27GiB | 非GPU专家全驻留的resident路径目标是稳态不再读专家文件 | 已有大量file-tier读取，应先解决而非叠加微优化 |
| PCIe/CPU | 探针自动pcie_frac0.52、24参与线程，无整机校准 | --calibrate按机器/模型测worker和传输等参数 | 估算带宽不等于最佳分配，需有界A/B；不直接套社区的0 |
| Prefill | auto，日志实际8192chunk | 官方也是auto；部分大RAM机器才适合auto:32768 | 没有证据说我们漏开batched prefill；别盲目扩大chunk |
| 上下文/KV | 32K/k8v4 | 8-bit、streaming从更长上下文按资源启用 | 32K无需靠KV streaming才能提速；扩大context不会天然更快 |
| 请求并发 | 单个增强 | batch面向总吞吐，有单流代价 | 保持单流，不引入任务队列/parallel来凑吞吐 |
| 采样 | 非思考官方组合；限定详细单图medium2048 | 高速矩阵多为greedy256输出，MTP接受率随文本/采样变 | 不用greedy短输出数字冒充真实影视扩写体验 |

应用定位：electron/services/strata-model-preparation.ts:70–74写入spec2和16GiB；:159–160严格比较生成配置。直接运行上游setup/calibrate或手工改runtime.json不是可靠产品修复：应用仍可能拒绝新形状或继续按旧策略生成，需要同步准备策略/记录的兼容升级。不得通过跳过完整性检查解决。

## 3. 日志里的主要瓶颈

第三次有结果的UI加载：

```text
--resident-budget-gib 16.00 exceeds available commit
(11.22 GiB minus 4 GiB headroom and a 0.25 GiB margin): 6.97 GiB
RAM budget 6.97 GiB: 4274 of the 26.27 GiB of experts the GPU cache does not hold
... the rest are read from the files
resident RAM: 6.97 GiB ... 71543 blob reads from the file
expert tiers: ... files 71543 blobs 114568.0 MB read
```

同次输出2503tokens、生成99.247秒（25.2tok/s），decode专家命中92.5%。这是“显存命中率看上去不低，未命中的专家却大量走文件”的情形。114568.0MB是引擎文件层逻辑读取累计，含重复，不是测得的物理NVMe读取，也不是新增模型大小；没有磁盘计数器不能把它说成实际SSD读了114GB。

B/C长资料同样被裁到7.14/7.27GiB，文件层36587/66801次读。即使16GiB能完整兑现，也小于此状态下约26GiB的非GPU专家集合。另一方面不能直接把预算设40GiB：还必须扣除物理RAM、commit、prefill/视觉/会话缓存和系统余量；MTP还会压缩GPU专家缓存，使其CPU补集变化。

配置不含MTP，日志里的suffix drafts accepted不是MTP已启用的证据。最后UI为43/72个suffix提案accepted，而非一个已工作的MTP高接受率路线。

## 4. 公开性能证据与可比性

### 最接近硬件：社区#307

[原始报告](https://github.com/Niko1221/Strata/issues/307)：Windows、RTX4090 24GB、13900K、64GB DDR5-5600；原模型IQ3_XXS、MTP on、128K、8bit KV、streaming、vision on、speed projection off。作者报告总输出约98.1tok/s（含思考），短decode峰约120；专家命中91.9%、8185槽。与本机CPU/GPU/RAM容量接近，且不是48GB改卡或双GPU。

限制：用户自报，无同题A/B，具体安装参数/冷启动边界未全给；作者自己的prefill只有131tok/s，不能用这条证明长资料首token也快。DDR频率、driver、上下文、输出内容不同。原贴的标题速度非独立验收，“含思考”不等于最终正文吞吐。作者另报PCIe0→110tok/s、0.75→59，应作为校准候选，不做通用默认。

### 官方可重跑矩阵

[0.1.26矩阵](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/bench/results/2026-09-29-speed-0126/README.md)：RTX5070 12GB、Ryzen7600、64GB、Windows，MTP、greedy、256输出、images off。IQ3_XXS 4K prompt约1007tok/s、32K约1745，decode约62/58.5。硬件和样本不等同，却说明我们的235–373prefill不应未经排查就被视为正常充分发挥。

### 高数字要剔除混杂项

[4090 200K code报告](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/bench/results/2026-10-08-community-rtx4090-iq3xxs-200k-code/README.md)达到4K约128decode、32K约138，充分warm-up、零prefix复用、greedy、MTP、学习profile；但它是Linux7950X且开了experimental speed projection，不能作为我们的质量等价目标，也不应为追分自动开启该投影。

[单4090并发负结果](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/bench/results/2026-10-06-community-rtx4090-opt-ins/README.md)的单客户端在parallel2下93–95降至65–72tok/s；属于较旧版本/具体context结果，但已足以反对为了一个点击开多slot。更高并发的部分还被作者注明混入后台交互请求，不采用其倍数。

[对27B的代理实测](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/bench/results/2026-10-04-community-4090-agents-vs-dense-27b/README.md)提醒：单项decode/prefill更高不保证总体更快，前缀/会话复用会决定总等待。它不是本应用提示词增强或匹配27B质量对照，本轮不据此判胜负。

## 5. 更新情况与哪些修复适用

在线GitHubAPI：截至2026-10-15最新stable v0.1.44.1，发布2026-10-14T00:13:09Z（新加坡10月14日08:13）。解引用tag的commit为296b59d2f73c8f04a805df29c2fa97655adace78，查询时main也是该SHA。当前fixed→candidate为ahead622commits；API只回250commits/300files，属于截断，不声称逐项审计完全部差异。

- [0.1.43.1](https://github.com/Niko1221/Strata/releases/tag/v0.1.43.1)：Windows低显存请求警告、会话parking进度/停滞诊断等有关；Linux adaptive callback造成4090的19–37降速修复明确不等于我们的Windows0.1.41根因。
- [0.1.44](https://github.com/Niko1221/Strata/releases/tag/v0.1.44)：新增图像hash缓存匹配；arena async和Windows按需pin为小幅opt-in，不是当前部分RAM文件层的通用倍速开关；不少新NVFP4/Unsloth优化并不适用于现有IQ3_XXS。
- [0.1.44.1](https://github.com/Niko1221/Strata/releases/tag/v0.1.44.1)：主要旧CPU/旧CUDA/M2及setup保留模型、错误诊断修正；13900K不会因无AVX2热修复直接倍速。本应用走chat/completions，Responses reasoning_effort修复不是当前速度问题。
- 最新generate.cpp仍有缓存先写入后检查/回缩的代码，不能说升级自动消除峰值爆显存。需要独立安全验收。
- [#1842](https://github.com/Niko1221/Strata/issues/1842)报告sm89的MMVQ交错表在128K有约18%代价；不同quant/context且48token短样本，只列较低优先级候选。关闭issue是维护者清理旧报告，不是已证实修复。
- [#2074](https://github.com/Niko1221/Strata/issues/2074)的“0.1.43慢3.4%”已被原作者空闲GPU重测撤回，不当成已成立回归。
- [#535](https://github.com/Niko1221/Strata/issues/535)维护者把0.5tok/s案例指向VRAM/RAM分页；这是相似机制资料，不是替代本机测量的确诊。

## 6. 候选顺序与最小下一实验（尚未执行）

1. 先资源安全：采集实际可用RAM与commit、专用/共享显存、pagefile/磁盘计数器；给缓存触页/视觉/verify图留峰值余量。出现共享显存持续增长、余量失守、无进展到上限就取消自有操作，不撑到驱动失去响应。32K和图像1024上限保持，不通过降质/截输入掩盖问题。
2. 修专家存储策略：在当前输入峰值预算容得下时选择官方arena或非GPU专家全驻留；不足就明确报告降级层级与预计I/O，不继续静默硬编码16。增加分页文件容量只扩大commit，不等于增加物理RAM/吞吐；当前已经自动管理，不替用户更改系统设置。
3. 补MTP文件检测与可选准备链，缺文件时提示而非自动下载。官方从原始checkpoint按范围取约5GB MTP张量，安装文档要求约6GB磁盘，draft+head额外约0.7–1GiB VRAM；包含全CJK的106299词表，不能用旧英文子集削弱中文加速。具体额外空间/峰值须准备阶段复核。先不换主模型量化。
4. 资源正常后才A/B现有0.1.41与固定0.1.44.1；同权重、素材、prompt、seed/采样、profile、context，一次改一项。版本升级与启用MTP分开，避免把两者收益混成一个。
5. 然后校准PCIe份额和worker；官方calibrate约15–30分钟且会改配置、重复加载模型并启动服务，本轮未运行。先在自有隔离配置做有限候选0与当前0.52，测完才扩大；不直接把pcie=0/新env写为默认。
6. 先256输出的短文本、4K、约20K三档，模型只冷启一次并分开计冷启动与warm请求；缓存预热与prompt-prefix复用区分，记录实际reused tokens。每档预定至多两条、每请求180秒/加载120秒的初始预算，超时停止扩展，而非无限调参。然后再走同图真实按钮的完整影视扩写。
7. 最后检查原稿、时间事件、角色/灯光/广播与最终版本写回；不以greedy256通过替代完整8192预算的质量和体感。继续只测提示词增强，无生成队列。

验收记录必须有：load、图片编码、prefill/TTFT（首正文与首思考分开）、decode、总点击时延、思考/正文token、MTP接受率/每轮token、专家GPU/RAM/file计数、VRAM峰值及共享GPU/RAM/commit/物理磁盘。没有实测不写预计倍速。

## 7. MTP材料与下载边界补充（2026-10-15）

用户明确要求依据官方/可核实社区指南，工具不直接下载大文件。MTP应作为主模型的配套加速权重，由用户手动下载；应用仅提供来源/文件信息、复用共享模型根的放置指引、离线校验和官方转换，不把大权重下载藏在软件安装或首次增强里。当前只是确定方案，没有实施扫描/转换接线。

此前约5GB指原checkpoint的31个mtp.*原始张量，不是必须再下载一个完整大模型，也不是最终运行文件体积。官方工具流程为mtp_fetch（网络取范围）→mtp_pack（离线Q2_0 GGUF）→mtp_rt（离线运行布局），setup另生成CJK draft_vocab。mtp_rt及其_paths辅助源码未见下载逻辑；不应为了转换调用会下载和启动的整套setup。

找到[SC117发布者的配套说明](https://huggingface.co/SC117/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF/blob/main/strata/README.md)：声明约847MB的strata/mtp-q2_0.gguf、约786MB的rt布局，来源是原始Qwen固定revision de4b8e4d43b917e7706784d8bb445c9af86a3540，不属于该仓库改写后的主模型。它是第三方预转换候选，不是Qwen/Strata官方发布；不因此更换现有主模型，也不能与根目录的llama.cpp MTP GGUF混用。

本轮HF元数据API连接超时，未取得候选固定repo SHA、精确bytes和LFS SHA256；只核到发布者说明，不能把约数或provenance自述当独立字节核验。候选尚不进入默认catalog/下载指引；后续先补固定身份、hash和离线结构/兼容验证。官方原始材料路径仍保留供用户自主管理，未执行下载、转换或GPU。

## 8. 源码与指南

- [固定版本setup](https://github.com/Niko1221/Strata/blob/fb58e0dbc8399662c0e47c76578c6e878b14f6cf/setup.py)：MTP准备/默认spec4、Qwen与budget分支；本机对应源码已核对。
- [固定版本专家源](https://github.com/Niko1221/Strata/blob/fb58e0dbc8399662c0e47c76578c6e878b14f6cf/src/core/expert_source.cpp)：physical/commit取小、headroom裁预算及文件分层。
- [官方细节](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/DETAILS.md)：无MTP只有suffix；CJK词表；resident/budget差别。
- [安装/校准](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/INSTALL.md#tuning-for-your-pc)。
- [故障指南](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/docs/TROUBLESHOOTING.md)：显存溢出到shared memory的降速、文件层和不足RAM。
- [固定到候选compare](https://github.com/Niko1221/Strata/compare/fb58e0dbc8399662c0e47c76578c6e878b14f6cf...296b59d2f73c8f04a805df29c2fa97655adace78)。

本轮交付为研究文档，不是产品patch，不bump/CHANGELOG/build/verify；检查本次文档差异、路径/引用、无意外删除。研究结果不自动改变catalog推荐、系统设置、资源策略或已有质量失败结论；子agent0，费用/token未知。

## 9. 实施跟进（2026-10-15）

用户随后授权更新模型卡与配置。上面的第7节是当时的未核验快照，本节覆盖其候选状态：HF主站API/connector受连接/限流影响后，经镜像的仓库元数据API核到固定revision `eec4e10a2c29b440a2ae85591fa11569ce752963`，根目录`mtp-q2_0.gguf`为889017216 bytes，LFS SHA256 `a22206a4d74eafbf31063a84610292535fb3b49af9a339963817fd04aed81e4d`。发布者README的`strata/`路径与实际tree不一致，下载指引使用实际根文件。仅读取JSON/文本元数据，没有下载权重；文件独立hash/结构/推理兼容仍待用户补齐后验证。

产品现已接入该固定社区stock MTP，不能称为官方发布权重。手动下载、模型共享目录、可选扫描、官方CPU离线转换及106299项中文词表已实现；本机安装自带词表SHA256核对为`b1e1d3a7a9e4bf862dcd5923ce661fb59bbd07907e594df5cf86a62ac235cb91`。MTP有则spec4/min-p0.5，否则spec2；专家模式从固定mmap/16GiB改为resident-experts，已有完整主pack可迁移配置并只补MTP。引擎报告完整RAM驻留失败则推理前停止，不静默走文件回读；不改PCIe/worker实验参数、不升级Strata或扩大上下文。该检测在加载后，不能宣称已解决显存加载峰值。

94项聚焦测试、类型检查、完整verify及真实隔离Settings鼠标/三尺寸检查通过。无真实MTP转换/GPU/速度证据；原质量失败结论保持。当前下一步与资源清理详见[TASK](../TASK.md#resume)，下载身份/目录见[DOWNLOADS](../DOWNLOADS.md#mtp-配套加速权重)。
