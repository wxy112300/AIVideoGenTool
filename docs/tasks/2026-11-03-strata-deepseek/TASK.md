# Strata DeepSeek 接入

- Status: complete
- Updated: 2026-11-11
- Authority: 用户授权参考现有 Qwen Flash 方式接入 AtomicChat DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF；权重用户管理，保留 Qwen 与现有设置，不自动下载权重。
- Execution: direct，子 agent 0。
- Latest request: 用户授权强制开启DSpark、降低显存预留后真实复测速度；保持六专家，不改权重/路由，不按短暂停顿判断崩溃。只验相关项，不跑全量测试。
- Scope: IQ2_XXS 首选；模型 catalog/离线扫描、独立 DeepSeek 引擎安装、原生 pack/tokenizer、共用服务与 Prompt/Agent 路由、模型专属采样和资源策略。用户追加授权升级到 Strata 0.2.10，2026-11-06 继续授权升到 0.2.11；保持现有 MTP，不自动下载 DFlash2 辅助权重。
- Baseline: 工作区已有本地化、NAS、History 等无关改动；只增量修改接入所需内容，不重置、暂存或提交。

## Resume

性能复测完成：主应用DeepSeek基础视觉显存预留从5GiB降至900MiB，另计其他程序GPU占用；只在完整pack/receipt验证后的临时session覆盖，不重哈希或pack。强开DSpark已真实试过：首轮误用早期纯文本用例文案（图相同，仅作探测）1.89t/s、草稿65/74接受；恢复原始图文后operation 48465cae-ee48-4edb-93d8-8abad2a2bf2b，3261输入tokens预填充173.650秒，371输出tokens/235.126秒=1.58t/s，草稿67/72接受，正文1693字符，HTTP200并写回版本。因此撤销强开，最终保留Auto，缺可选权重仍off，不改Qwen或独立Agent。

最终低预留/Auto对照operation c4fc796a-12a8-466b-a634-123c75cb0be4完成：同一参考图与原始指令、关闭思考、3261输入tokens，缓存复用token为0；预填充64.064秒/50.9t/s，361输出tokens/87.814秒=4.11t/s，正文1639字符，HTTP200并写回新版本，预览Output/计数正常。对应旧5GiB预留/Auto基线为预填充120.349秒、生成302tokens/155.038秒=1.95t/s。样本输出长度随机且未重复跑分，不能当稳定吞吐保证。主模型专家缓存5.48GB/600个→9.49GB/1063个；DSpark开启时8.72GB包含草稿专家，不能全算成主模型缓存。D盘实际为CT4000P3PSSD8 NVMe，仍需文件回读；不以一次采样推断完整磁盘性能。

本次77项相关定向回归、类型检查和Electron编译通过，不跑全量。最终源代码/构建是900MiB加占用、DSpark Auto；输出保留参考图外观、固定构图、微风与无音乐要求，预览截图已人工检查。证据temp/strata-deepseek-live/tuning-{probe,exact-on,exact-auto}-report.json及对应输出/截图，tuning-tests.log、tuning-typecheck.log。正式state SHA-256与测试前相同，Qwen/medium偏好及6个waiting任务未动。分别经AppApi释放自有模型后清理Electron63656/CDP1114和55008/CDP4819，自有native58588/16528及43129/18465监听均退出；GPU回到约5GiB其他程序原有占用。无权重下载、软件安装、ComfyUI启动或队列执行。

当前：本机0.2.13/双引擎0.1.59，八个权重完整SHA-256通过，隔离真实文本增强完成并写回新版本（1192字符，加载约47秒，3072输入tokens预填充67秒，267输出tokens/约1.6token/s，请求236秒）。首次完整校验/pack约8分多；64KiB读取实测约25MB/s，4MiB顺序块改后实际约400–660MB/s，逐文件百分比可见，完整校验不跳过。低思考首轮实际未启用，由真实模板发现上游遗漏enable_thinking=True，且模板不接受medium；已补DeepSeek启动adapter，界面低/中/高映射low/high/max即50/75/100，真实OpenAI与Anthropic转换器+实际GGUF模板八分支通过，未设置思考token上限。

单图高档和取消验收：fixture temp/create-smoke-ba1GVF，operation e5479795-12f7-4d31-b495-361494a509fc。实际拖放合成256px参考图、保存高档并点击增强；GENI读取267ms，首token270秒。正常运行约24分半，收到12119个独立思考字符，未观察到20词段循环；随后为验收取消路径主动点取消，terminalStatus=cancelled，版本数保持3、显存回落约5GiB。未以崩溃处理，未声称完整高档输出质量通过。

单图关闭思考完成：同一隔离资料库通过设置保存off，再次实际点击增强；operation b0673eb8-8874-4252-bd11-f77d2ede66c6，约60秒加载，3261输入tokens预填充120秒，302输出tokens解码155秒/约1.9token/s，HTTP200请求275.4秒。raw输出1348字符，渲染后1350字符，新版本数3→4；正确描述参考图的红色椭圆气球、细绳、浅蓝天空和绿色地面，保留固定构图与无音乐要求。预览无需手动刷新，实际点击请求与Output可见正文/耗时；App图像chip和新版本显示正确，截图已人工检查。证据temp/strata-deepseek-live（只存思考计数，不存思考正文）。

用户强调推荐不能当最低：DeepSeek移除15GiB空闲显存/8GiB缓存硬准入和2GiB瞬时GPU中止线，缓存不足允许原生文件回读；Windows会话预算计入其他进程已占用显存，未停止其他程序。原生/应用静默及总时限不杀DeepSeek，用户取消、真实进程退出、后端错误与持续系统提交耗尽保护保留。已审核旧组件/旧软件可使用，不要求等于推荐revision；旧0.2.12准备与复用回归通过，安装更新仍严格校验最新归档/清单/签名。相关定向检查通过，最后一轮全局类型构建与正式缓存留存待单图完成。

当前推荐线已更新0.2.13（d2f096475817d4666c364c820b0ca830f751cfc5），Windows Qwen/DeepSeek双引擎0.1.59；未代用户点升级。安装/更新事务不依赖模型选择，始终安装双引擎并校验/失败恢复。DSpark Q8_0现为可选：缺失时不校验/不传pack参数，配置off；存在时校验并pack，配置auto，是否实际启用由引擎判断。完整0.2.12 DeepSeek pack在文件/配置/产物校验后直接复用；后补DSpark会触发新pack。新Qwen DFlash2不接入/不下载，现有MTP与采样策略不变。

交付完成：277项相关定向测试、最终类型检查/双端构建通过，不跑全量；真实转换器+实际模板八分支通过。使用本次完整SHA-256的未变文件证据，经生产prepare与官方CPU pack/pack-info生成正常目录缓存，生产validator/finder确认可复用，未重复哈希；正式state字节未改，其LastWriteTime在测试前，六个waiting任务与原Qwen/medium偏好保持。通过正式releasePromptModel清理后，自有Electron/Python/原生模型进程及4608/43129/18465等监听均退出，GPU约4.9GiB为其他程序原有占用。未安装软件、下载权重、启动ComfyUI、运行队列或生成视频。未覆盖复杂多图、完整max思考结果质量及所有旧版本的神经推理。

## Acceptance

- 保持 Qwen catalog、pack、控制向量与持久化身份兼容。
- 固定 AtomicChat IQ2_XXS 四分片及共享 Engram 的 revision/bytes/hash，软件引擎与权重分别就绪。
- DeepSeek 独立引擎/pack/上下文/采样，不套用 Qwen MTP/PLE/资源几何。
- focused tests + verify；真实隔离 Settings/Prompt 缺件恢复与按钮路径；真实神经输出仅在权重可用后验证，明确未验边界。

## Evidence

- 2026-11-10 推荐0.2.13：固定官方tag源码、双引擎归档bytes/SHA-256与manifest SHA-256；feed SHA-256 2511b792da4fc4ee45404d763096051890e49fc2d85a4212fc3052f6e327eb20与GitHub发布asset digest一致。官方requirements.txt、tools/iq_pack.py及tools/dsv41/pack_gguf.py相对0.2.12未变，setup仍固定原llama.cpp parser。129项Strata安装/准备/模型/controller/目录测试通过，覆盖非Strata当前选择仍下载DeepSeek、双引擎进度、损坏包恢复旧软件、可选DSpark缺失和后补、旧pack复用；类型/双端构建通过。证据temp/strata-0213；未下载引擎归档/权重、未升级正式runtime或跑GPU推理。
- 0.2.13隔离UI：真实离线扫描、进入提示词模型、展开DeepSeek后可见“DSpark · Q8_0／可选”，实际点击下载按钮打开来源/固定revision/大小/hash/完整目标目录弹窗，截图temp/create-smoke-4evC8u/optional-dspark.png已人工检查；一次成功但长列表平滑滚动复跑存在定位超时，未改产品逻辑或放宽按钮门槛，不声称重复稳定。未点击软件安装/下载页面，也未启动GPU；fixture自有PID10584/CDP3802/Comfy配置端口18464，清理见temp/strata-0213/cleanup.log。
- 收尾：缺DeepSeek引擎时即使选中其他模型、软件已是推荐版本，Strata卡片仍显示更新按钮；37项准备/controller回归与最终类型/双端构建通过（button-final.log、build-final.log）。AppApi隔离清理完成，PID10584和3802/18464监听均已退出；未运行全量测试。

- 2026-11-10 用户追加同组分片下载目录锁定：缺失分片从同profile内已找到且组前缀/总片数相同的分片解析真实目录，卡片目标路径和下载弹窗共用；已有分片时移除库菜单，只保留直达实际目录按钮及完整路径title。没有同组分片时仍保留多库菜单；不锁不同量化或配套文件。40项目录/布局/控制器/多库回归和类型/双端构建通过。真实隔离UI以空默认库和D盘第二库扫描，实际点DeepSeek第2分片下载卡片：按钮无下拉、title/应放目录均为D盘已有分片目录，并实际点击打开成功；人工查看截图。`temp/create-smoke-Hdq3Dd/shard-lock-report.json` ok；AppApi清理后PID72700/CDP7131/18463退出，未启动模型或ComfyUI。证据 `temp/strata-0212-inference-error/shard-*`；不做推理或下载。

- 2026-11-10 部分下载扫描：只读检查用户指定DeepSeek目录，主分片1/3及四个配套文件大小均符合固定配置，缺主分片2/4。旧多库扫描要求整组完整才标任一分片found，真实复现旧结果4/8；修复选完整库优先、无完整库时展示首个有下载分片的库，整组仍不跨库。31项相关扫描/DeepSeek测试和类型/双端构建通过；正式目录真实复扫6/8，available=false。无下载/哈希/搬移/模型加载，证据 `temp/strata-0212-inference-error/partial-scan-*`。

- 2026-11-10 用户提供engine.log：原生启动成功，62GB热点专家预读40秒，DSpark因19GB GPU相对132GB专家关闭；日志只有stderr启动，无法把90分钟都归因原生加载。核对0.2.12官方ds_pictures.py及ds4_main.cpp：DSI写在cfg.log父目录（默认Local Video Studio含空格），GENI不引用路径且原生parse_gen按空格分隔，必然截断图片路径。DeepSeek用内置视觉塔，不能套Qwen独立vision块。新增应用启动bootstrap只把含空白的图片临时目录选到无空白可写临时目录，不改安装源码/权重/pack/receipt，无需重新hash或pack。
- 图片路径验收：120项DeepSeek/service/model-preparation/owner定向测试及干净类型/双端构建通过；用固定0.2.12实际ds_pictures.py与Pillow生成PNG→DSI文件、按原生同样空格分隔解析GENI字段，修复前native_file_matches=false，修复后true，DSI头与计数均正确。`temp/strata-0212-inference-error/pictures-report.json`、`vision-focused.log`、`vision-build.log`。仅应用服务入口适配，独立Agent guard未改；未加载GPU或下载权重，未代用户安装/打包，另一台完整神经图文输出仍待实际复试。启动回归确认准备config/receipt字节和准备调用数不变。

- 2026-11-08 远端首次启动约90分钟后DeepSeek已加载，随后单图H3 I2VA增强在6472ms失败（operation badb5c02-2bdd-42ba-bb92-2d8b0f3d3b1e）；原SSE解析丢弃payload.error.message，故现有日志无法确定引擎/图像/内存/上下文原因。已请求远端准备目录engine.log末尾和存储类型，不要求重新加载或重哈希。新增StrataInferenceError仅携带后端错误到服务边界，那里限定type/code/message、脱敏输入/图片/API key并限制长度，附实际engine.log；部分输出仍不可保存，失败仍停自有服务。80项stream/service/owner focused及类型检查通过，未跑全量；远端实际推理根因待日志，未声称已修复其引擎错误。证据 `temp/strata-0212-inference-error/`。

- 2026-11-08 另一台升级后报 runtime/engine-dsv41/engine-component.json ENOENT；这只确认当前检查目录缺manifest，远端安装日志仍未取得。新增本地复现：Strata不属于isManagedPromptModel，模型选择change只给Comfy类模型保存草稿，Strata立即requestRender可退回旧选择，切依赖页仍拿到旧模型并跳过DeepSeek。DeepSeek/Qwen两个回归修复前均失败；现改为所有提示词模型重绘前保存草稿，原Comfy提示不变。安装日志补目标路径与软件分支。仅验证Strata相关项，不跑全量，不代用户安装。
- 2026-11-08 修复验收：70项选择/Strata定向回归、类型检查与构建通过（`temp/strata-0212-repair/`）。新测试只验证模型草稿与切页，隔离无关的RAF焦点恢复，未作真实远端UI或DeepSeek推理验收。源代码/构建已修，未打包部署或代装另一台；无法仅凭ENOENT断言该机器唯一根因。无软件/权重下载、无运行实例/GPU操作。

- 0.2.12推荐更新：核对[官方release](https://github.com/Niko1221/Strata/releases/tag/v0.2.12)、tag指向146df3c46与固定feed sequence122（本地feed SHA-256和GitHub发布digest一致），双引擎归档bytes/SHA-256/manifest摘要同步。0.2.11→0.2.12 compare中requirements、pack工具、签名验证与组件验证源码未变；服务差异主要请求统计/工具调用，未改本应用请求接口。170项Strata focused及类型检查通过；按用户要求不跑全量verify，不做安装或神经推理。证据 `temp/strata-0212/{feed.json,focused.log,typecheck.log}`。
- 0.2.12构建通过 `temp/strata-0212/build.log`，读取实际产物确认推荐0.2.12/双引擎0.1.58及0.2.11兼容记录。未启动Electron/ComfyUI、未修改正式runtime或GPU资源，用户自行安装。

- 2026-11-07 跨机器启动报 strata-dsv41 缺失，用户已点击升级；另一台安装日志待提供，不能直接断言现场原因。代码已复现独立缺陷：未选 DeepSeek 时由旧版本目录迁移共用 runtime，仅检查新目标目录，未识别旧目录已有专用引擎，可升级成功并删除旧支持。补齐迁移检测、成功后保留新引擎及失败保留旧目录回归；引擎缺件错误补实际路径及缺文件/旧清单诊断。67项focused通过，最终完整verify退出0（3203单元、127集成、干净类型/双端构建、440对比度）。新helper只读检查本机实际runtime，ready=true；未改正式安装/配置、未下载软件/权重或占用GPU。证据 `temp/model-libraries/deepseek-migration-*`、`deepseek-local-inspection.json`；仅当前源码修复，未打包/部署到另一台。原先无日志重装建议不足以证明现场原因；安装卡片日志会话内保留，重启后可查运行日志中的strata-install-progress。

- 2026-11-06 用户授权跟进 0.2.11：固定源码 c3b3f5035506f3e966f1b4b7b188aeaabae92f1d，双引擎 0.1.57，官方固定 feed 的归档 bytes/SHA-256/manifest SHA-256；gguf-py 提交未变，原生读取仍接受 v3/v4。补齐 0.2.10 三种 Qwen 量化迁移回归；旧 DeepSeek 清单仅用于更新时发现，当前就绪仍要求新清单。生产安装事务成功，双引擎实际 --version 通过，Python3.12/Pillow13.0.0，正式state严格未变，旧软件/暂存/成功下载清理完毕；无主模型或DFlash2下载。报告 temp/strata-0211/upgrade-report.json。
- 0.2.11 门禁：148项初始focused及26项引擎更新/回滚回归通过。默认并发verify的单元阶段两项5秒超时（NAS/software-git-files）及worker异常退出；保持原断言/超时、限制4 worker后3183项单元全部通过。127项集成、干净类型检查/双端生产构建、440对比度通过；独立Agent prepare通过。不称原始verify退出0。
- 0.2.11 真实界面：隔离夹具 temp/create-smoke-TDKPrB，本机/推荐/最新均0.2.11；DeepSeek缺件禁用及下载指南、实际设置恢复按钮路径通过，未产生请求/版本。cleanup通过，PID101900/CDP13325/18961退出。协议服务使用真实官方服务与Qwen tokenizer、mock引擎，六次调用/思考预算/认证/monitor/超限恢复/取消重启通过。两次收尾立即端口断言失败；诊断确认父进程均退出、Windows TCP约100ms后关闭，脚本加入2秒有界等待（仍断言PID退出与端口关闭），最终完整通过，PID78612/82456及13927退出。无神经质量/性能结论。
- 0.2.11 短神经检查：生产prepareStrataLaunch及禁止交接GPU租约，32-token请求在加载前因需约20GiB空闲显存、现场仅14.8GiB而被拒绝；未绕过门槛，未停止其他程序。已归还租约，无新GPU进程，temp/strata-0211/neural-report.json。DeepSeek仍缺8项权重，真实推理待验。

- 2026-11-04 用户要求删除上述失败用例：仅移除NAS“提交不变、封面晚到后自动发现”的单条测试及其专用导入，保留生产路径保护和其他NAS回归。删除不代表原路径异常已定位或修复；之前verify失败记录仍属历史事实。

- 0.2.9阶段：生产 helper 在隔离目录用真实0.1.55归档校验摘要/签名/全部组件，版本探针通过；清单篡改拒绝。下载/解压临时资产已清理，未修改正式安装或加载模型。
- 真实隔离Electron：缺文件的DeepSeek选项与加载按钮禁用、Qwen控制向量禁用；实际展开组件并点击Engram下载按钮，固定来源/大小/hash/目标目录正确。可见富文本输入后仍阻塞，不提交请求、不新增版本；缺件恢复/完整准备/服务请求通过合成回归，真实增强operation ID及神经输出因缺权重未验。首轮脚本遇到设置离页确认和隐藏兼容textarea，修正为实际确认/可见富文本控件，未解除disabled。夹具`temp/create-smoke-YUygAE`，cleanup通过，自有PID57148/CDP9400/18961已退出。
- 0.2.9最终全量单元3155通过/2失败：NAS `File outside library root`单独仍失败；llama包位置探针并发5秒超时，原参数单独1项通过。127集成、干净生产构建、440对比度通过，不称verify退出0。无关NAS代码保留未改。
- 0.2.10固定源码ffa80d73133ea5c548aefe57889a16e8085a938f（annotated tag对象db0500a不作为源码）；两引擎0.1.56，官方固定feed记录归档与清单摘要。上游读取native v3/v4、gguf-py固定提交不变，三种Qwen量化从0.2.9及两条旧来源迁移的回归通过。114项定向与35项Create/DeepSeek界面邻接通过。生产软件事务成功，走禁止交接资源租约、完整校验归档/清单/Qwen组件及DeepSeek签名/组件；正式state严格未变，旧软件/暂存/成功缓存已清理，未加载GPU或下载模型。报告`temp/strata-0210/upgrade-report.json`。
- 0.2.10最终门禁：3161项单元通过，仅NAS `File outside library root`仍失败；未改NAS代码/断言。后续127项集成、干净双端类型/生产构建、440对比度通过；不称verify退出0。独立Agent prepare通过，共用推荐与软件身份。
- 0.2.10真实CPU协议：官方服务+现有Qwen真实tokenizer/template+mock引擎；六次连续调用、关闭/低/中/高思考、动态输出预算、超限恢复、认证、monitor、取消清理和重启通过。不是DeepSeek tokenizer或神经图文证据。`temp/strata-0210/protocol.log`、`temp/strata-protocol-smoke-S47Vb2`；PID49404/41312及7302退出。
- 最终真实UI：`temp/create-smoke-EeJQRH`。本机/推荐/最新均显示0.2.10，缺文件选项/加载/增强禁用；下载指南固定Engram身份与目录，可见富文本输入不产生错误版本/请求；实际点击可见“设置”恢复按钮返回设置页。人工查看设置/指南/缺件截图，正常ready画面不新增说明。cleanup通过，PID68708/CDP7372/18961退出。无真实增强operation ID、神经质量或吞吐结论。
