# Strata DeepSeek 接入

- Status: implemented-awaiting-model-inference
- Updated: 2026-11-07
- Authority: 用户授权参考现有 Qwen Flash 方式接入 AtomicChat DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF；权重用户管理，保留 Qwen 与现有设置，不自动下载权重。
- Execution: direct，子 agent 0。
- Latest request: 2026-11-07 仅将推荐升至0.2.12，由用户自行点击升级；用户要求只验Strata相关项，不再跑全量测试。
- Scope: IQ2_XXS 首选；模型 catalog/离线扫描、独立 DeepSeek 引擎安装、原生 pack/tokenizer、共用服务与 Prompt/Agent 路由、模型专属采样和资源策略。用户追加授权升级到 Strata 0.2.10，2026-11-06 继续授权升到 0.2.11；保持现有 MTP，不自动下载 DFlash2 辅助权重。
- Baseline: 工作区已有本地化、NAS、History 等无关改动；只增量修改接入所需内容，不重置、暂存或提交。

## Resume

当前推荐线已更新0.2.12（146df3c468739147f520ac3816de806f71232571），Windows Qwen/DeepSeek双引擎0.1.58；正式安装仍是下述0.2.11，未代用户点升级。保留0.2.11 receipt及Qwen pack迁移、旧DeepSeek清单仅用于发现升级。新DFlash2不接入/不下载，现有MTP与采样策略不变。

代码与软件接入完成，真实DeepSeek推理待用户准备权重。现场已通过生产安装事务从0.2.10升级到0.2.11（c3b3f50），Qwen/DeepSeek双引擎均0.1.57，Python3.12/Pillow13.0.0。现有完整Qwen IQ3/MTP pack迁移复用，未重新哈希/准备；一个历史无效receipt保留未修复，不影响完整pack发现。正式state字节不变，未下载主模型/DFlash2，不改路径、默认模型或偏好。4090 24GB / 64GB RAM；D为NVMe，E为HDD。新版短神经推理尝试被生产资源门槛拒绝：需要约20GiB空闲显存，现场仅14.8GiB；未加载模型、未干预其他GPU程序。

下一步：用户按原设置页的DeepSeek八项下载指南准备约257.8GB文件，使用共享模型根下`LLM/DeepSeek-V4.1-Flash-1017-Uncensored-GSQ-RCO-GGUF`（建议NVMe）。重新扫描→选择DeepSeek→实际增强按钮→首次完整hash/原生pack→真实operation ID/结果版本与图文质量、性能、取消/连续调用验收。当前真实UI缺件时禁用增强并显示设置恢复入口，不能把合成完整准备或mock输出当成这条神经链路成功。

## Acceptance

- 保持 Qwen catalog、pack、控制向量与持久化身份兼容。
- 固定 AtomicChat IQ2_XXS 四分片及共享 Engram 的 revision/bytes/hash，软件引擎与权重分别就绪。
- DeepSeek 独立引擎/pack/上下文/采样，不套用 Qwen MTP/PLE/资源几何。
- focused tests + verify；真实隔离 Settings/Prompt 缺件恢复与按钮路径；真实神经输出仅在权重可用后验证，明确未验边界。

## Evidence

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
