# 新权重与自适应资源：2026-10-15

## 结论

本轮只测试提示词增强，未入队、未生成视频。真实MTP准备通过，但冷加载因Windows提交容量不足停止，未进入chat；不能宣称新版吞吐、复杂动作/影视质量通过。后续输入与资源拒绝UI通过，不是生成通过。

实际安装0.1.44.1 / `296b59d2f73c8f04a805df29c2fa97655adace78`、CUDA13、RTX4090、约64GB物理内存。IQ3两分片、projector、889017216-byte MTP均完整SHA-256通过。首次发现软件安装漏掉官方转换器所需的gguf-py；补齐setup.py固定llama.cpp提交`3cf03257f219afbe7334045ff7c6a06ac68c627d`的稀疏解析源码后，官方mtp_rt实际产出707788800-byte experts、116099072-byte dense、29行dense索引与106299-token中文词表。只获取解析软件源码，不下载权重、不运行setup、不修改ComfyUI Python。后续安装器已包含解析器，准备先检查依赖，避免缺件仍先哈希75GB主文件。

## 真实加载负结果

- 32K/k8v4/1024视觉tokens，MTP spec4/min-p0.5，expert-cache auto，session reserve5120MiB，官方resident模式、6GiB host余量。
- 真实按钮operation `9e7c2edf-51ee-403f-93e5-950ad1e15f54`：68.003秒，最小文本，零chat/零新增版本。
- 引擎MTP draft加载839MiB VRAM；自动缓存触页报告3682MiB空闲后缩减，最终10.71GiB GPU专家缓存，加载就绪报告4749MiB空闲。未见OOM错误；初轮观察器误等idle而非terminal，操作结束后停止，连续采样未保留，不报告该轮最小实测VRAM/完整峰值保证。
- 非GPU专家需要29.26GiB。引擎分配前物理可用33.23GiB、提交可用18.72GiB；只保留12.47GiB专家并报告whole resident RAM mode does not fit。原驻留保护随后停止自有服务，未静默进入文件回读生成。
- 初始仅比较free RAM/commit漏算GPU加载阶段的额外提交需求。加载前后工具读数与引擎日志表明约20GiB级提交下降，CUDA/WDDM是合理推断，未用trace证明全部归因。不能把“64GB总RAM”或“系统管理分页文件”当作完整驻留保证。只读检查：分页文件确为系统自动管理，已分配约17.86GiB，系统盘空间充足；未更改系统设置。

## 实施

共享纯资源策略位于`src/core/strata-resource-policy.ts`，本机探针/采样位于`electron/services/strata-resources.ts`。官方tokenizer预检→原ComfyUI交接→鲜活资源准入→会话配置→加载前复检；原有固定24GiB初筛移除。资源足够采用完整arena，否则采用官方GPU外专家驻留；128GB不套固定16GiB上限，也不按总容量盲选。无静默CPU/file-tier回退。

物理RAM与Windows提交容量分别预算；IQ3专家42.9GB来自固定setup.py，host预留为官方native的4GiB加应用额外2GiB。GPU缓存auto不变，显存reserve至少5GiB。Windows提交保守额外预算一张GPU容量，覆盖本轮发现的加载消耗；这是应用准入估算，不是官方公布的精确WDDM比例，更不是硬分配上限。未知资源拒绝。加载/生成采样低于2GiB显存或3GiB可用RAM/commit会取消自有模型；采样不能保证毫秒级峰值。已加载暖请求不因剩余RAM下降重选模式。动态配置是临时会话文件，基础pack/完成记录保持，不随空闲RAM变化重新哈希/pack；正常停止删除自有会话配置。

## 素材、用例与耗时

从视频History的原始startImagePath选择两张真实素材：黑色桁架/网格棚中的绿衣女子、银色机器人和橙色假人；高架桥下含蓝车、摩托、行人、狗、涂鸦、电线、棕榈及积水的街景。原始素材复制到隔离夹具，原图hash保持；完整图、输入、operation与日志仅在忽略的temp报告，不提交用户历史素材/机器路径。

| 用例 | 原稿字符 / 图数 | 修正后按钮操作耗时 | 结果 |
| --- | --- | --- | --- |
| 最小静物文本 | 48 / 0 | 3.601s | 加载前拒绝 |
| 三角色视觉提示词 | 117 / 1 | 3.397s | 加载前拒绝 |
| 15s三角色依次跨步、蹲起、转身、收尾，连续镜头 | 480 / 1 | 3.555s | 加载前拒绝 |
| 15s蓝车/摩托/人物动作，5s与10s切点＋15项连续性资料 | 1835 / 1 | 3.491s | 加载前拒绝 |

后四次均真实键盘/预设/增强按钮操作，operation ID留在报告；完整输入经过tokenizer，资源准入因约58.7GiB提交需求、实际约38.6GiB拒绝，零新版本、零native GPU加载。速度是安全拒绝延迟，不能当生成速度；TTFT/decode/MTP接受率均N/A。独立生产构建器＋官方CPU tokenizer诊断：文本382/428/2445/3752 tokens，含图/输出与安全预留4734/5808/11921/13228，均低于32768；不是精确UI请求抓包，也不是32K满上下文测试。

私有完整报告：`temp/create-smoke-BWmIE3/REPORT.md`；原始结果/plan/counts/日志在同目录。初轮监测器终态识别已修正，后四轮采样保存；冷加载68.003秒取AppApi startedAt/finishedAt，而非错误等待的监测器壁钟。

## 验证与下一步

- minor自适应能力＋patch接入缺件/安全预算修复；不bump、不提交推送。全量verify通过：213单元文件/1960项，6集成文件/86项、双端类型/干净构建/20项对比度。现有Strata非队列路线无ComfyUI计算图可额外生成；用户明确不测队列/视频。
- 隔离UI中的原稿、引用与失败不写回保持；原用户state及源图片hash保持、默认模型/原队列不变，隔离queue/history均0。自有Electron、Python/native及43127/自有CDP/假Comfy端口已退出。原生窗口关闭生命周期不是本轮证据。
- 需先释放足够程序提交占用，或用户处理/授权调整分页文件，或在128GB机器中继续。应用不自动修改系统设置、不终止用户程序。之后从现有缓存做短文本→单图→15s动作→三镜头长资料，记录冷加载/首token/生成tok/s/总耗时/MTP接受率和语义覆盖；不重复下载/哈希未变化主模型。

## 动态分页保持不变的真实推理补充

用户要求不先调整分页文件、直接实测。保持系统自动管理，起始可用RAM41.3GiB/commit43.3GiB，选用官方显式12GiB专家RAM预算，5GiB GPU reserve/auto cache、6GiB host余量与资源监测不变。依据当前可用RAM和扣除GPU容量级提交预留后的commit计算预算，另留1GiB准入漂移余量；不是伪造资源或移除显存保护。配置仅在忽略temp诊断使用，不写用户设置，不采用为生产UI默认，也不经过生成队列。原完整驻留59GiB准入是该策略的保守门槛，不是运行Strata的绝对硬条件，之前把它作为全部实测前置条件过严。

真实冷加载43.148秒，同实例四请求：

| 用例 | 已加载后总耗时 | 首正文 | decode tok/s | 输入/输出tokens | 应用门禁 |
| --- | ---: | ---: | ---: | --- | --- |
| 最小文本 | 11.262s | 6.695s | 16.3 | 382/75 | 通过 |
| 三角色图片 | 14.093s | 11.065s | 31.2 | 862/95 | 通过 |
| 15s复杂动作 | 102.713s | 64.969s | 41.5 | 2879/3565 | 通过，但人工发现问题 |
| 15s三镜头长稿 | 125.606s | 79.465s | 33.6 | 4634/3633 | 原稿要点覆盖拒绝 |

影视decode包含思考tokens；总耗时是真实生产构建器/后端/归一化的隔离直测，不是UI点击耗时或产品版本写回证明。MTP接受率56.5%/65.8%/67.2%/59.6%，没有无MTP同题对照，不能推出加速倍率。输入未缩减、输出预算未降低。现有32K策略未改，本次最长实际4634含图输入，不充当满32K边界证据。

295次采样最低显存4651MiB、可用RAM24.20GiB、commit7.58GiB；引擎加载触页另报告2680MiB后缩减缓存，最终GPU专家9.73GiB、可用显存5022MiB。未出现OOM，不能只用1秒级采样最低值声称加载峰值始终4.54GiB。仍有文件层逻辑读，动作77501.5MB/长稿103894.1MB，不直接等同实际磁盘字节；硬件采样也有高磁盘读。长请求总耗时103–126秒，尚不满足又强又快。

人工质量核对：最小文本/图片可用，正确识别女子、银色机器人、橙色假人和网格桁架。动作raw覆盖各阶段，但半转身后立即正面等细节不自洽，发型写成高马尾；归一化还额外插入“The viewpoint camera uses one continuous physical camera path through exactly 180 degrees…”，raw没有此句且明确禁止摄影机旋转。这是可复现后处理问题，不应归咎模型。三镜头raw2752字符正常生成，保留5/10秒切点、车辆/狗/人物归属、落轮、水纹、同侧观察轴和声音连续性，拒绝示例却是“依据、设计、明确、街景、允许”，存在控制词误当事实覆盖的证据；仍有未经核实的车牌文本、停车→再移动交代与15.08秒尾点需核对，不能标语义全部通过。未修改生产门禁或隐藏负结果。

完整私有素材/输入/raw/normalized/逐次metrics：`temp/create-smoke-BWmIE3/dynamic-eval-F5dQhP/REPORT.md`与`result.json`。用户state、两张源图hash保持，系统设置未改、自有Python/native/43127已退出。128GB硬件、27B同题、UI采用预算策略仍未验。本轮没有生产代码变化，未重复verify；测试脚本语法和文档diff检查通过，先前1960单元/86集成及构建证据保留。

## 通用关键词误拒移除与离线回放

2026-10-15，用户授权移除关键词检测。旧规则把分词后的通用原稿词当作必保要点，以缺失比例拒绝结果；“依据、设计、明确、允许”等控制词及同义改写因此误拒。共享`assertDetailedCinematicExpansion`移除这一层及不再使用的中文近邻匹配辅助，影响使用该校验器的所有后端，不只是Strata。主时间线结构/重复字段、补句前原稿与时长长度底线、同类正文有效字符长度、重复填充、截断、精确对白/可见文字及明确数字时间点原处理未变。没有增加新的自动语义裁判；结构长度通过不能证明动作完整或没有跑题。

回归使用上一轮实际`street-15s-long`保存的原稿1835字符与模型raw2752字符：先在旧dist重现“依据、设计、明确、街景、允许”覆盖率拒绝，完整verify重建后以相同`normalizeMultimodalPromptOutput(raw, request)`通过，normalized3062字符、Shot1/2/3保留。原`result.json`SHA-256始终为`ff7c70b6585b5af762ad68cd6b65f35e723f1163ab14ab0405417725ab482c03`，没有修改历史负结果。私有回放摘要`temp/keyword-gate-replay.json`；这是离线应用校验回放，不是新推理、UI版本写回或新速度/语义证据。原报告中运镜后处理和模型语义问题仍有效。

focused命令：`npm.cmd exec vitest run -- --config vite.config.ts tests/h3-expansion-quality.test.ts tests/h3-prompt.test.ts tests/h3-timing.test.ts tests/h3-dialogue.test.ts tests/h3-visible-text.test.ts tests/strata-prompt.test.ts tests/user-journeys.test.ts tests/app-harness.test.ts --reporter=dot --silent=passed-only`，实际7个存在的测试文件95项通过（仓库没有独立`h3-visible-text.test.ts`，文字处理由H3相邻测试覆盖）。包括中文控制词/动作拆词、英文同义改写，以及生产DOM真实Enhance按钮在短输出失败后用改写长输出恢复并新增version、queue保持0；外部端口为合成，不冒充Electron/GPU。

完整`npm.cmd run verify`通过：213单元文件1961项、6集成文件86项、双端typecheck、干净生产构建、20对比度；日志`temp/keyword-gate-verify.log`。本轮patch不bump、不提交推送，不启动Electron/Strata/GPU/队列，不下载或改用户资料/系统设置；无新增服务待清理。当前合同、旅程说明及Unreleased已同步。

## 来源链接

- [固定Strata setup.py](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/setup.py)：专家arena、低RAM策略、llama.cpp提交。
- [固定MTP转换器](https://github.com/Niko1221/Strata/blob/296b59d2f73c8f04a805df29c2fa97655adace78/tools/mtp_rt.py)：离线GGUF→运行布局，依赖_paths/gguf-py。
- [Microsoft WDDM驻留预算](https://learn.microsoft.com/en-us/windows-hardware/drivers/display/process-residency-budgets)：预算随压力变化；不证明本机每GiB VRAM的精确commit成本。
