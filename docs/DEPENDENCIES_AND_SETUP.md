# 依赖、环境与初始化

本文说明 Local Video Studio 如何识别和使用 ComfyUI。模型名称、组件文件和下载目标的代码事实位于 `src/core/catalog/`；节点仓库和离线/运行时探针位于 `electron/services/environment.ts`。本文不复制完整文件清单。

## 1. 运行边界

Local Video Studio 是 Electron + TypeScript + Vite 桌面应用。它负责素材、参数、队列、历史、文件管理和 ComfyUI 通信；模型加载、CUDA、采样、VAE、音频和媒体输出由 ComfyUI 执行。

提示词辅助同样通过所选 ComfyUI 运行：

- Qwen3.5 使用 ComfyUI 核心 `TextGenerate` 路径。
- Gemma 4 使用 ComfyUI MiniMax H3 Prompt Writer 节点及其 ComfyUI Python 依赖。
- Gemma 4 26B-A4B UNSEEN NSFW 使用配套的 `UNSEEN_Gemma_4_26B_NSFW_Q4_K_M.gguf` 与 `mmproj-gemma4-vision-q4_0.gguf`；4090 24GB 档位保持标准 16K 上下文。
- Qwen3.6 / Qwen3.8 27B Q4（可选）使用 `ComfyUI-MultiModal-Prompt-Nodes` 的 `VisionLLMNode`；它只依赖所选 ComfyUI 的 Python 环境，不需要 LM Studio、llama-server 或第二个服务。Qwen3.8 当前登记的是 JonathanColetti 的非 MTP Uncensored Q4 与配套 vision 投影文件。
- 旧状态中可能仍有 LM Studio/llama-server 字段用于兼容迁移，但当前 UI 不要求、也不推荐安装独立服务。

Strata 是独立运行组件，不是 ComfyUI 节点。Qwen3.8-Flash-Next 可在原提示词模型选择器中选用，启动/增强会自动完成校验、CPU pack/tokenizer、受认证的本机服务和模型加载，取消/释放/开始队列/退出均清理自有进程。软件安装本身不启动模型；它使用独立 `.venv`，不向 ComfyUI Python 安装包，不执行上游整套 setup，也不下载权重。受管理安装统一使用 `strata/runtime`，主应用与独立启动器共用解析，不记住具体版本路径；旧受管理路径兼容迁移，手动目录保留。更新只在事务内暂存旧软件供失败恢复，成功验证后删除旧软件、受信历史副本、安装暂存和成功下载包，不永久保留版本备份。失败清理本次暂存，仅保留可续传的固定资产半包及日志。

提示词页在选择Strata时显示单一uncensored三选一：关闭／自带·ESP／社区·sergqwer。旧布尔true迁移为自带、false或缺省为关闭；新模式优先，不静默启用社区。保存只影响下一次增强，不兼容项禁用并保留偏好，其他后端不应用。自带向量483520bytes、4..44层；社区向量267552bytes、8..33层，固定来源revision/大小/SHA-256，随用户触发的Strata软件安装或更新事务准备，存软件目录的`data/lvs-control-vectors`，不是共享模型或ComfyUI节点，不下载新主权重。首次启用或更换向量重载模型；关闭再开启同一已确认向量可复用模型，逐请求显式发送投影true／false。基准pack／receipt不随模式改变，不重哈希大权重。缺件／坏hash／当次引擎未确认对应作用层时明确失败，不回退别的向量冒充成功。日志含mode、向量id/hash、requested／supported／engineConfirmed与vectorLoaded／applied（未完成为null）；加载和去拒答质量分别验收，不保证无拒答、质量或速度收益。

Strata 输出预算自动使用当前32K上下文的剩余空间：先以官方tokenizer计数完整输入，再扣除图片与安全余量；8K视频／4K图片编辑是基础输出预留，不是硬上限或要求模型必须生成的长度。输入挤占基础预留时仍明确拒绝，不自动缩短原稿。此策略不扩大引擎上下文、不改变2048思考预算、模型质量门禁、资源检查和10分钟请求上限；正常stop会提前结束。日志只记实际上限、结束原因、completion tokens及思考／正文字符数，不能从“0词”校验错误推断截断。

Strata 服务就绪后自动打开随安装提供的官方 API Monitor，只读显示加载状态、请求、原始输入/输出及耗时与速度。使用同一127.0.0.1端口，不用8080、不启动第二个服务；密钥只由主进程为白名单只读请求注入，不进URL、preload或网页存储。模型开关、取消和队列释放仍由本应用管理，监视页加载/卸载控制隐藏且请求层拒绝。关闭监视窗口不退出模型；主动退出模型或队列交接停止服务后监视窗口关闭，下次启动再打开。原生监视功能仅在内存保留最近100次请求（包含正文/思考与有界截获内容），服务重启清除，不写入作品历史。

MTP 的官方转换器还需要 `setup.py` 固定提交的 llama.cpp `gguf-py`。一键安装只稀疏获取这部分解析源码，不构建 llama、不下载模型；已有缺件安装可用原重装入口修复。增强准备离线检查依赖后才哈希大模型。推理按当前可用物理 RAM 和 Windows 提交余量分别预算；两者充足才选完整专家 arena，否则采用官方非GPU专家驻留/文件回读。允许回读的native IQ resident只沿用配置给引擎的6GiB host headroom作RAM/commit启动预留，不再将完整complement或整卡容量叠加估计（旧42GiB提交门槛）作为一票否决。完整驻留RAM/commit估计仅在日志说明，实际驻留量由引擎按新鲜余量裁定，不保证峰值/速度；参考官方修复[#403](https://github.com/Niko1221/Strata/issues/403)、[#467](https://github.com/Niko1221/Strata/issues/467)。40GiB RAM/23GiB提交可进入回读加载，RAM足够但commit不足完整arena时也选resident，不强行arena。Q4预算独立，不套IQ体量或例外。不将总内存或分页文件总大小当成可用量；启动预留不足/未知时给实际值和门槛，不修改系统设置。H3保持32K、auto缓存、MTP与至少5GiB显存预留，128GB机器同样按当时余量选型。

H3的Windows resident会话当前显式保持`STRATA_FILE_RELEASE=0`。固定上游的`=1`候选可释放自有专家文件页工作集，不改锁页缓冲/其他进程；不降低提交量或保证吞吐。本机三轮图文候选试验保留约8GiB RAM，但后续长资料期间发生内核0x3B蓝屏，因果未明，暂回退该开关，待转储分析。会话参数不修改共享pack/receipt或系统分页文件。依据：[固定上游说明](https://github.com/Niko1221/Strata/blob/296b59d2/docs/DETAILS.md)、[官方测试及限制](https://github.com/Niko1221/Strata/blob/296b59d2/bench/results/2026-10-04-windows-mapped-release/README.md)。

Strata资源遥测的暂时缺失与确认低资源分开处理：H3加载／增强前及运行中最多复测3次、总预算12秒，只用新读数，不沿用前次增强旧值或把未知当0／无限可用；恢复后继续当前请求和模型进程，不重连／重放生成。H3与独立Agent共用host策略：RAM<3GiB或commit<6GiB只预警，首次及每30秒最多一条，恢复另记；不因一次采样、30秒后仍低RAM或是否确认file-read杀模型。Windows读模型映射可造成RAM短时近零（社区[#1571](https://github.com/Niko1221/Strata/issues/1571)，报告不是当前版本稳定性保证）。仅commit<512MiB连续新鲜完整采样持续10秒才触发host紧急保护；恢复、缺指标或超过5秒采样空档重置计时。512MiB/10秒是应用最后兜底而非官方最低要求，不保证避免OOM；显存2GiB保护和持续遥测失效保护保留。主应用`strata-host-warning/recovered/critical`记录实际RAM/commit/VRAM、phase及持续时间；普通预警不中断、不重启或重放。独立工具同规则、独立生命周期；取消回收自有探针和进程，不影响下一请求。

正常完整推理后的格式、长度或时间点校验失败，不保存结果，但保留已确认ready/loaded的自有Strata模型供下一次增强；记录`StrataValidationRetained`。流式/资源/服务失败、用户取消及清理不确定仍走停止保护，手动释放、队列交接和退出语义不变。保留模型不等于放宽文本质量门禁。

运行组件与节点使用同一版本栏：本机从受信安装记录识别，推荐安装目标来自catalog，最新版本由官方release查询取得；网络失败不把推荐值当作最新。当前推荐0.1.45（固定477ac13），0.1.44.1和0.1.41未更新前继续可用并显示更新。安装事务包含社区小向量阶段，失败不替换旧安装，成功验证后清理旧软件；共享权重与用户数据保留。派生pack绑定实际安装revision，升级后可能需要重新离线准备，同revision仅迁移受管理路径时可完整校验后重定位原pack，不重复生成。手动指定目录保持显式选择；主应用与独立Agent始终解析同一个受管理runtime，自动pack过期时重新发现，不修改H3设置。

模型共用所选 ComfyUI 的模型根下 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`，同一根下旧 `LLM/strata` 只读兼容扫描。派生 pack/tokenizer 位于软件版本目录的同级 `data`，完成记录按源文件/模型/策略复检后复用；未完成资料不当缓存，软件卸载保留模型和数据。默认端口 43127，禁止 8080，冲突不接管、不自动修改设置。没有第二个模型根设置，不替换旧模型默认值。文件齐全不代表 GPU、视觉和输出质量已验；当前接入代码完成，完整模型验收由用户下载后另做。版本/来源见 catalog；操作见 [Strata 下载指南](tasks/2026-10-10-strata-prompt-integration/DOWNLOADS.md)。

Unsloth UD-Q4_K_XL 使用同一共享模型根下 `LLM/Qwen3.8-Flash-Next-GGUF/UD-Q4_K_XL`，固定四分片共111.33GB；视觉投影和可选MTP也识别已有GSQ-RCO目录，不复制或重新下载。独立准备使用官方`--compat-bf16`并保留兼容转换报告，缓存绑定Q4来源而非IQ revision。主应用与Agent共用Q4资源预算；内存充分完整驻留，较紧采用显式专家RAM预算/文件回读，长Agent上下文另计host KV，不复用IQ3的42GiB提交例外。Q4三种uncensored模式按用户授权开放，但仍须固定向量校验与当次引擎作用层确认；缺件/未确认明确失败，不静默关闭。实际Q4图文、质量、速度和资源峰值待用户下载后实测；不改变默认模型或H3的32K上下文。

Strata 安装进度直接显示在运行组件卡片内，独立于折叠日志。引擎下载的百分比及大小来自实际下载文件字节，只代表该次下载，不代表整个安装；源码获取、校验、解压、Python 环境和依赖安装以动态条与当前步骤表示。取消时保留取消反馈，收尾后隐藏；切换设置页签不会重置当前步骤。

Strata引擎包在软件目录同级`downloads`下按固定revision/hash缓存，用户点击更新才下载。可恢复网络错误最多尝试3次，共用10分钟预算，每次按实际缓存大小续传；取消立即停止自有curl/等待重试并保留同一资产半包。旧暂存区ZIP只在提交与官方origin匹配后导入，安装成功后清理来源已确认的旧暂存。服务器拒绝Range、证书/404等非瞬时错误不盲目重试；日志显示具体curl错误（有界、下载URL脱敏）。下载齐字节仍须固定SHA-256，坏包删除并拒绝发布，成功后清理软件资产缓存；不降低校验或自动启用代理。共享模型文件不参与此软件缓存。

可选[Strata本地Agent启动器](tasks/2026-10-17-strata-local-agent/TASK.md)独立复用上述Strata安装和共享权重。Claude/CloudCLI/SDK使用常规npm共享安装，优先检测和复用现有兼容版本；缺件/更新先展示旧→新、位置、规模和影响并明确确认。仅启动器配置、token、GUI数据、日志和不可再下载的用户配置备份隔离；不改普通Claude/CC Switch当前路由或Codex配置。服务/模型/Agent工具能力逐层验收，检测或安装成功不代表真实Agent通过。

Agent在64GB/4090上已逐档验证32K基础工具、64K GUI、128K/262144原生容量及同session互通；默认Strata262144、Claude客户端保守200000。原生220K容量探针不代替Claude长工具会话。Agent允许明确显示的官方文件回读；H3随后按用户授权采用上文独立的32K回读策略，不继承Agent的512MiB RAM底线或更大context。实时RAM、Windows提交和显存保护保留，不修改分页文件。LAN仍关闭，具体证据与未验边界由同一TASK维护。

## 2. 五种不同的“已安装”

FastH3 Omni 的 ComfyUI 原生工作流包含 `ModelAttentionBackend` 和 `BlockSparseAttention`：固定 VSA10 与 Comfy Kitchen dense fallback。无需为这条路径另装 FastVideo 服务；必须继续区分核心 schema、所选 Python 的 GPU 内核可用性和日志中实际 sparse producer。模型被扫描到或八步任务成功入队不代表加速已经生效。

设置 → 路径 → 缓存管理的原有“清理缓存”也处理历史软件残留，不要求重新下载安装。统计覆盖已确认归属的 Strata 非当前版本／备份／失败暂存／软件引擎缓存、所选 ComfyUI 的节点和 runtime 备份，以及独立 Agent 的旧 npm 包／下载／私有构建缓存；不扫描其他磁盘或修改当前软件。仍在安装时不进入软件清理；跨进程租约采用禁止交接模式，Strata／Agent 正在运行则跳过并说明，不为清理而卸载模型。不停止外部进程；清理前复检当前路径、来源记录、真实包含关系及本地数据。模型、配置、数据库、会话、有效pack与未知文件不能作为普通缓存删除，含此类数据的旧副本保留并显示原因；缓存清理不把旧副本的数据写入当前节点。目录／字节统计、进度与部分失败继续显示在原缓存面板及日志。软件清理前后不修改草稿、queue、History 或偏好设置。

Strata 的应用管理安装可在安装按钮右侧三角菜单选择“卸载”，确认后永久删除当前软件目录（含独立 `.venv`）；共享模型、独立用户数据与目标以外的未知目录不删除。未安装、手动目录或未知归属不提供卸载；安装中与生成/提示词忙碌时禁止操作，后台在删除前复检归属、真实路径及模型根重叠。软件目录中的本地修改不保留，卸载后可一键重装；只离线复扫，不修改 ComfyUI Python、不重启 ComfyUI。更新产生的旧软件由成功更新事务清理，不以卸载代替更新收尾。

当前应用推荐核心为 ComfyUI `0.42.3`，各工作流最低兼容线独立保留。通用 GGUF 使用 leejet 维护版固定提交 `373048b8403a7820620065210a691263d4da0a61`；同为 `2.0.0` 的其他 fork、未确认 origin 或不同提交不会被判为已满足该推荐线。安装/更新成功后清理旧软件，H3 专用 GGUF 的目录和注册名不变。

排错时必须区分以下状态：

1. **ComfyUI 安装存在**：能找到 Desktop、Portable 或源码安装。
2. **数据目录正确**：`models`、`custom_nodes`、`input`、`output` 属于实际使用的实例。
3. **组件文件存在**：catalog 能离线识别扩散模型、编码器、VAE、LoRA 等文件。
4. **节点文件存在**：自定义节点目录和必要入口文件存在，Python requirements 已安装。
5. **运行时可用**：当前连接服务的 `/object_info` 包含工作流要求的节点，最小任务真实成功。

设置页把离线识别和运行时验证分开。ComfyUI 未启动时仍可管理路径、模型和节点；“文件检查通过”不能写成“运行时已验证”。

应用启动、用户手动扫描和关键路径变更执行完整环境扫描。服务启停只刷新 API、ComfyUI 核心兼容性与节点注册状态；节点、Python 或加速依赖安装后执行依赖刷新，并复用最近完整扫描中的模型文件、GPU 和系统工具证据。若应用尚无相同设置与 ComfyUI 数据根的完整快照，局部刷新会自动回退完整扫描。

同一设置的并发完整扫描合并执行；依赖或服务刷新会等待已有扫描结束再复检，避免复用操作前的在途结果。单轮模型、节点和核心兼容性检查共用同一份节点 API 快照。H3 Python 探针分阶段保留已识别版本；超时、进程异常或输出损坏显示“检测未完成”，不把未知字段当成“未安装”，也不因此放行加速或安装操作。日志记录探针阶段、耗时和错误；重新完整扫描可再次验证。

## 3. 必需软件

### 应用开发/运行

- Windows 10/11。
- Node.js 22 LTS 或更高版本与 npm。
- Git；自定义节点安装和更新需要。
- FFmpeg；视频裁帧、续写、封装和部分后处理需要。

### 生成环境

- NVIDIA 驱动和可工作的 `nvidia-smi`。
- ComfyUI Desktop、Portable 或源码安装之一。
- 与所选 ComfyUI 绑定的 Python/PyTorch/CUDA runtime。

一般不需要为 ComfyUI 本体单独安装系统级完整 CUDA Toolkit。Portable 使用 `python_embeded`，Desktop/源码安装通常使用自己的 `.venv`。节点依赖必须安装进这套 Python，而不是随便一个系统 Python。Windows 的 Gemma Prompt Writer 与 Qwen3.6/Qwen3.8 MultiModal Prompt Nodes 共用固定的 JamePeng `llama-cpp-python` 预编译 GPU 后端；安装器不会静默改走 CPU，也不会在用户电脑上临时源码编译。

## 4. ComfyUI 核心目录与数据目录

ComfyUI Desktop 可能把启动器、核心源码和数据目录放在不同位置。Desktop 2 的真实实例应从安装记录解析，常见数据路径包括：

```text
D:\Comfy-Desktop\ComfyUI-Installs\ComfyUI
%USERPROFILE%\Documents\ComfyUI
<Portable>\ComfyUI
```

这些只是常见候选，不是硬编码真相。设置页会扫描常见磁盘目录和 Desktop 安装记录，并允许手动选择。

同机多实例时检查：

- 设置显示的核心目录；
- 设置显示的数据/节点目录；
- 选中的 Python；
- 当前 API URL；
- 服务报告的核心版本/提交。

节点安装、模型扫描和任务执行必须指向同一实例。默认服务地址是 `http://127.0.0.1:8188`；Desktop 自己启动在其他端口时可以连接该地址，但不要因此把节点安装到错误目录。

## 5. 首次启动

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd start
```

也可以双击 `start-ui.bat`。开发模式使用：

```powershell
npm.cmd run dev
```

根目录 `scripts/setup.ps1` 可用于命令行环境检查；日常用户优先使用应用设置页，因为它会保存所选实例和路径。

本地开发、自动诊断和代理协作优先使用运行时 harness，而不是通过桌面界面点击。先执行 `npm.cmd run build`，然后可直接复用应用保存的所选 ComfyUI 设置：

```powershell
npm.cmd run harness:comfy -- probe-prompt-writer
npm.cmd run harness:comfy -- scan --json
npm.cmd run harness:comfy -- restart-comfy
npm.cmd run harness:comfy -- repair-prompt-writer
```

`probe-prompt-writer` 是默认的只读操作，直接检查 `/h3studio/status`、模型接口和 GGUF diagnostics。`restart-comfy` 复用应用的本地进程所有权和启停服务；CLI harness 使用已有的隐藏 detached launcher，避免命令结束时关闭它启动的 ComfyUI，Electron 应用仍保留可见控制台。`repair-prompt-writer` 复用节点安装器、事务内暂存恢复、兼容补丁、Python 语法校验、重启和运行时复检。可用 `--state <studio-state.json>` 指向另一份明确的应用状态，或用 `--json` 取得机器可读结果。只有这些服务接口无法覆盖且任务确实依赖 GUI 状态时，才应使用桌面自动化。

如果需要验证“真实界面功能”而不是单独的 ComfyUI 服务接口，应使用 [`Agent Electron API smoke runbook`](AGENT_ELECTRON_API_RUNBOOK.md)：通过显式 loopback CDP 连接实际 Electron renderer，在 `window.studio` 上调用现有 `AppApi`，再按 task ID 验证队列、历史和输出。这个桥接只用于本机 Agent/测试操作，不是 public HTTP、Headless 或 LAN API；必须记录调试开关、隔离范围和 app-owned 进程清理。不要直接调用 `/prompt` 后把结果写成产品 UI/API smoke，也不要把 `--cpu`、禁用节点或测试 harness 参数的成功当作正常运行时证据。

## 6. 模型、节点和工作流的正确安装顺序

### 6.1 选择并扫描实例

在“设置 → ComfyUI 环境”选择 ComfyUI，确认核心/数据目录、Python 和模型根目录，然后执行离线扫描。此步骤不要求启动服务。ComfyUI 环境页还负责服务状态、核心版本/兼容性和安全修复；应用目录、代理和队列策略仍属于“设置 → 应用与路径”。

### 6.2 安装节点

`llama-cpp-python` 的三角菜单“打开位置”定位所选 Python 中扫描确认的 `llama_cpp` 包目录，不是 `python.exe` 或环境根目录。包位置来自元数据登记/实际模块文件，不能从解释器路径拼接；普通导入失败但包文件仍在时保留定位，目录未知或旧扫描缺少位置时隐藏该操作，卸载资格不变。移动/删除后定位失败提示重新扫描，不创建目录。

“设置 → 节点与依赖”中的可管理第三方节点和 Python 运行依赖可一键安装或更新。`llama-cpp-python`、SageAttention、Triton、KJNodes 等可安装依赖也属于此页；它们的修复不能被描述成 ComfyUI 核心修复。安装器会：

1. 定位所选 ComfyUI 的 `custom_nodes` 和 Python。
2. 使用 Git clone/pull；替换仅在事务期间暂存原目录，全部安装验证成功后删除旧软件，失败恢复原目录。本地模型、媒体及配置迁移到新副本，同名数据冲突则拒绝替换；源码与应用兼容层按固定来源重新安装，不永久保留整个旧目录。清理限定所选安装和可核对归属的历史副本，路径越界、链接或占用失败进入日志，不把清理失败当成模型可用性证明。
3. 应用本项目明确维护的兼容补丁。
4. 使用所选 ComfyUI Python 执行节点的 `requirements.txt`。
5. 在卡片中实时输出阶段、Git/pip 内容、超时和错误。
6. 当前批次安装完成后只重启一次 ComfyUI，并统一通过运行时节点重新检查。

可以连续点击多个节点加入等待队列。应用会锁定该批次开始时所选的 ComfyUI 实例和 Python，串行执行每个节点的 Git/pip 操作；单项失败会写入对应卡片日志并继续下一项，不会让后续节点永远等待。批次末尾统一重启和复扫，卡片会区分“排队中”“处理中”和“正在重启并复检”。重启/复检阶段不再接受新的节点，避免节点被安装到另一套环境。

排队项的主按钮显示“移出队列”，只移除该节点，不执行安装，也不取消其他项；运行中的节点及 Strata、llama-cpp-python、H3 加速软件显示“取消安装”。点击后显示“正在取消…”，后台仅中止当前安装启动的 Git/pip/下载子进程树，等待退出及既有恢复处理完成后解除占用，后续节点才继续。取消与失败分开记录，日志保留；只有已成功安装的节点参与批次重启。没有成功项时仅离线复扫，不启动 ComfyUI。取消不是卸载：恢复可恢复的原目录并清理本次暂存，仅保留日志和可续传半包；共享 Python 包替换不保证自动回滚，可按复扫结果重试安装/修复。安装收尾已完成时会说明未中止已完成的操作；重启/复检阶段不提供安装取消。

应用可管理的节点卸载时会永久删除匹配的 `custom_nodes` 目录，不创建或依赖本地备份；需要恢复时重新执行一键安装，由 catalog 声明的仓库、版本规则和兼容补丁重新下载构建。确认对话框会提示本地修改不会保留。手动安装的节点不由应用卸载；如果 ComfyUI 原本没有运行，卸载也不会为了刷新节点而启动它。

面板顶端的一键操作会加入未安装、低于 catalog 推荐版本、需要应用兼容修复，或已安装但 catalog 基础节点类型全部未在 `/object_info` 注册的 Custom Nodes。最后一种状态表示整个节点包很可能在启动时导入失败；修复会安全更新节点、使用所选 ComfyUI Python 重装 requirements，并在批次末尾重启复检。仅缺少部分或可选节点类型时仍只显示运行时告警，不会反复重装。所有实际安装项复用同一串行队列，并在批次末尾最多重启一次，不会把 ComfyUI 核心升级或内置工作流文件混入节点批次。

Git clone/update 有 5–10 分钟上限；普通 Python requirements 为 15 分钟，共用的 `llama-cpp-python` Windows wheel 下载与自检为 45 分钟。安装日志显示下载百分比；超时会终止对应子进程树并保留已收到的日志，避免无限显示“处理中”。

当前注册的节点族包括 GGUF、Video Helper Suite、LTXVideo、SeedVR2、FlashVSR、KJNodes、Frame Interpolation、ComfyUI MultiModal Prompt Nodes、ComfyUI Qwen-VL LoRA、MiniMax H3 Prompt Writer、H3 Motion Context、H3 Learned Latent Upscaler、MMH3 Ultimate Upscale 和 Spectrum。Learned Latent Upscaler 与 MMH3 Ultimate Upscale 只在用户点击对应卡片时把 catalog 固定的 commit 克隆到当前所选 ComfyUI，不随应用分发，也不进入批量补齐；模型权重仍由用户通过模型卡片来源链接自行下载。MMH3 当前只是 1440p 的实验性时空分块候选，catalog 静态登记不解除 UI/队列安全门；必须继续通过 `/object_info`、RTX 4090 真实 smoke、显存与接缝检查。准确仓库、目录名、用途和 required/optional 状态以 `customNodeCatalog` 为准；其中 `priority` 是设置页的稳定显示/批量安装顺序，数值越小越优先。新增节点必须根据通用程度、主链路影响和实际使用频率填写优先级：视频主链路与通用节点在前，提示词/图片/后处理功能居中，特定模式和实验性节点在后；未知旧条目自动排到末尾。

节点目录中的 `releaseSource: "github-release"` 启用上游版本查询：结合对应仓库的 GitHub 稳定发布与通过包名、仓库身份校验的 Comfy Registry；没有正式发布时读取该仓库声明的源码版本，数值悬停标明来源。成功观测按仓库及代理缓存 6 小时，手动重新扫描使缓存失效；失败不冒用 catalog 值，也不缓存失败结果。远端版本只作为“最新”信息，不参与 `updateAvailable`、兼容性颜色或批量安装选择。可执行更新仍由应用 catalog 推荐版本、最低兼容线和兼容修复规则决定。

工作流来源元数据集中在 `src/core/workflow-metadata.ts`。它覆盖 `workflows/` 下的全部 API JSON，记录 `/prompt` schema、推荐 ComfyUI 核心版本、使用的节点包和上游来源；API JSON 本身不放额外顶层字段，避免被 ComfyUI 当成节点解析。

Qwen3.6/Qwen3.8 本地多模态路径有明确的 Python ABI 边界：节点仓库的普通 requirements 只安装轻量依赖，安装器会跳过其中可能覆盖后端的普通 `llama-cpp-python`，改用项目统一的固定 JamePeng GPU wheel。Windows 当前支持 Python 3.10–3.14；CUDA wheel 提供 12.4/12.6/12.8/13.0/13.1，并明确映射 12.5→12.4、12.7→12.6、12.9→12.8、13.2→13.1。超出矩阵时会在下载前失败并写明 Python/CUDA 版本，不会尝试 CPU fallback 或本地源码编译。设置页会把“节点目录已安装”“VisionLLMNode 已加载”“共享运行库自检”和“模型/vision 投影文件完整”分开显示，实际运行仍在 ComfyUI 启动后验证。4090 默认使用 Q4_K_M，并在释放其他模型后按实时空闲显存选择设备：至少 20 GiB 时启用全部 GPU 层，余量不足或遥测不可用时才使用 CPU；不得用固定 CPU 清单覆盖这一判断。普通提示词增强保持 8K 上下文和不超过 2048 token 的输出；只有「影视细节扩写」按时长计算的预算超过 2048 时，节点才为该次请求切换到 16K 上下文并允许最多 3072 token。应用以运行中 `/object_info` 的实际上限为准，未修复的旧节点仍安全回落到 2048；设置离线扫描会提示执行一键修复并重启 ComfyUI。节点还提供不含 Prompt 正文的诊断端点，只返回停止原因、输入/输出 token 数和预算，应用结合官方字段与主时间线词数区分长度截断、模型提前结束和结构丢失。Qwen3.8 上游将视觉投影命名为 `Qwen3.8-...-vision-f16.gguf`，而节点原版只登记 `mmproj*` 文件且尚未识别 Qwen3.8 名称；一键安装/修复会把该文件登记为 mmproj、从主模型列表排除，并按其 `qwen35` 架构使用 Qwen3.5 vision handler。运行时还会在上传图片和提交工作流前核对 `/object_info` 的精确枚举值。扩写完成后请求 ComfyUI `/free` 释放显存，再交给 H3；Qwen3.8 当前不启用 MTP/speculative 路径。

### Gemma / H3 Prompt Writer 的 llama-cpp-python

共享运行库推荐固定为 JamePeng `0.4.2` / `20261003` Windows wheel；依赖兼容范围为 `>=0.3.34,<0.5`，已有旧版 CUDA 自检通过的安装不会被静默升级。Qwen MultiModal 的受管理补丁仅对 Qwen35 家族的 MTMD handler 关闭全量 logits，保留旧视觉 handler 的原行为，避免按完整上下文分配巨大的 Python scores 数组；不减少图片、上下文或输出预算，不启用 MTP。Prompt Writer 一键修复同时适配架构检查与诊断文件的 0.4.x 上限，保留最低版本/架构检查。两项旧适配均在离线扫描中提示一键修复，完成后须重启 ComfyUI。0.4.2/cu130/cp312 隔离实测覆盖 Qwen3.6 27B，不能代称本机没有权重的 Qwen3.8 27B 已验；性能与长稿失败边界见[评估证据](tasks/2026-10-10-strata-prompt-integration/evidence/qwen27b-speed-assessment.md#升级与真实测试2026-10-16)。

Gemma 4 的 H3 Prompt Writer 运行时与节点目录、GGUF/mmproj 模型文件是三个独立状态。当前推荐节点上游 0.4.7，保留应用依赖的 `/h3studio/*` 提示词接口；可选 `requirements-gguf.txt` 由共享运行时安装器接管。Windows 使用上述固定 JamePeng 动态后端，运行时选择兼容 CPU 实现并加载 `ggml-cuda.dll`；探针先注册后端再判断 GPU offload，安装器只替换此包，不重装 NumPy/Pillow。wheel 大小随 CUDA/Python 资产变化，日志显示下载百分比，等待上限45分钟。节点兼容层保留 `GGMLType` KV 常量、Gemma 4 原生 chat handler、非 Thinking 输出和幂等清理；Direct Gemma 默认16K Standard，不因普通输入自动扩展24K。UNSEEN NSFW 4090 档位仍用Q4_K_M与匹配q4_0 projector及低批处理。更新本地已修改节点时，先按固定推荐提交核对完整适配器指纹；确需替换则先校验新副本、事务内暂存旧目录并迁移本地模型/配置，依赖安装成功后删除旧软件，不保留永久源码备份。批次重启后检查 status、models、GGUF diagnostics和应用侧共享运行库CUDA自检；轻量节点探针的 gpu_offload:false只作提示，自检失败保留pip日志/原生退出码，未知或CPU包不标为GPU就绪。

H3 Prompt Writer 与可选 MultiModal Prompt Nodes 共用同一个 Python 包名，不能在同一 ComfyUI 环境中各自安装两个版本。两个节点的安装入口和“修复运行依赖”现在都调用同一个安装器、固定版本和 CUDA 自检；节点 `requirements.txt` 中的普通 `llama-cpp-python` 条目会被过滤，安装其中一个不会再用 PyPI 或 Git 源码构建覆盖另一个。相同 ComfyUI 的并发安装请求会合并为一个事务；已有 CUDA 自检通过的后端不会因更新 Prompt Writer 被重装。当前 Python/CUDA 不在预编译矩阵时，安装器会在下载前明确失败并保留日志，不会偷偷回退到 CPU 或启动第二个 llama 服务。模型权重不由此步骤下载，仍由提示词模型卡片中的模型目录检查负责。

### MiniMax H3 Prompt Rewriter LoRA 8B（Qwen3-VL）

这是与 Gemma/GGUF 路径并列的绑定 PEFT 组合：基座是 `Qwen/Qwen3-VL-8B-Instruct`，适配器是官方 [`lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B`](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B)。它通过 ComfyUI Qwen-VL LoRA 节点读取参考图片/视频并重写 H3 Prompt；不能把 adapter 套到 Qwen3.6、Qwen3.8 GGUF 或 H3 视频扩散模型上。

文件目录：

```text
<ComfyUI data>/models/LLM/Qwen-VL/qwen3-vl-8b-instruct/
  model-00001-of-00004.safetensors ... model-00004-of-00004.safetensors

<ComfyUI data>/models/LLM/Qwen-VL-LoRA/minimax-h3-prompt-rewriter-8b/
  adapter_model.safetensors
```

设置页只把这些大体积 safetensors 作为用户必需组件。Qwen 的 `config.json`、权重索引、tokenizer、图像/视频预处理文件以及 LoRA 的 `adapter_config.json` 由应用内置清单，在首次实际扩写前自动下载到上述目录；它们不会被要求用户逐个寻找或手动下载。自动准备失败会保留具体日志，并提示检查网络/代理。启动 ComfyUI 后还要通过 `/object_info` 确认 `QwenVLModelLoader`、`QwenVLLoRALoader` 和 `QwenVLCaption` 已加载。设置页会分别显示文件扫描与节点运行时验证，不把“文件存在”误当成“工作流已经跑通”。

ComfyUI Desktop 某些版本在嵌入式控制台关闭后会让节点的普通 `print()` 抛出 `[Errno 9] Bad file descriptor`，这发生在模型加载前，并不代表权重损坏。重新扫描时如果发现 Qwen-VL 节点仍使用该输出方式，设置页会把它标为“需修复”并提供“一键补齐/更新”；安装器会针对当前选择的 ComfyUI **数据目录**应用可重复的兼容层，保留节点更新策略，不写入机器固定路径。应用后必须重启 ComfyUI，再进行运行时复检。

Spectrum 版本分为三层：`v0.2.1` 是普通 H3 的最低可用线；当前推荐 `v0.2.29`。`v0.2.17` 补完 H3 Continuum 互操作：混合 VIDEO/AUDIO mask 可继续使用原生 H3 forecast，learned-latent sampler-2 refinement 不继承 sampler-1 的 Continuum actual-prefix，旧版 ComfyUI 核心缺少 `mask_row_values` 时安全降级为一次原生 H3 transformer 评估；`v0.2.18–v0.2.20` 增加并修复可选 MiniMax H3 RefDelta Solver v0.2.0+ API-v1 互操作、嵌套 custom-node 命名空间发现和首次 ER-SDE step provenance；`v0.2.21` 兼容 ComfyUI 0.34+ PDD H3 FinalLayer 新接口；`v0.2.22` 新增原生 SEEDS-2/SEEDS-3 与 SA-Solver 支持；`v0.2.23` 完成 active SA-Solver PECE 与 RefDelta 多后端互操作，并将 active-PECE 默认策略设为 `balanced`；`v0.2.24` 移除已验证 few-step/progressive 流程中的两个不必要 actual-evaluation barriers：active SA-Solver PECE 的终端 Untwist 只有在明确安全元数据和窄边界下才会延后预测，corrector 仍保持 actual；RES Multistep 不再隐式把 final tail 提升到 3，现有工作流传入的 `tail_actual_steps` 按原值生效；`v0.2.25` 修复当前 ComfyUI DynamicVRAM/Comfy Compiler 下 Spectrum H3 solver 与 Aimdo malloc-graph 的崩溃边界，不全局关闭 DynamicVRAM 或 Compiler；`v0.2.26` 增加 provider-generic numerical-attention history/receipt 合约，无法证明后端连续性时安全退回 actual-only；`v0.2.27` 增加预测头流式投影与 CUDA target lifetime 修复，并恢复审查过的 Core BlockSparseAttention Mixed-Grid forecast recovery，主要降低预测头 CUDA 显存压力，不承诺整体速度提升。`v0.2.28` 修复 Windows CRLF 造成的 source audit 误判；`v0.2.29` 改用实际 BSA/Flow/Untwist 运行结构、路由和 receipt 确认普通 forecast 兼容，强化历史身份及 cold-to-primed 校准安全，未知结构仍安全退回 actual。当前应用内置 H3 仍使用 RES/ER-SDE，不切换为 SA/PECE；因此现有模型、LoRA、工作流结构和既有互操作保持兼容，RefDelta、SEEDS 和 SA-Solver 仍不是本应用硬依赖。它保留原生 ER-SDE、KJNodes 预览回放、Untwisting RoPE 外部补丁契约和隔离的生成后研究进程。设置页会展示上游最新发布，但不会仅因它高于 catalog 推荐线就触发更新。LightX2V Turbo 与 Spectrum 同开至少需要 `v0.2.6`；`model_aware_mode` 至少需要 `v0.2.7`，默认关闭。Spectrum 不要求额外模型权重，也不把 Continuum、Diff-Aid 或 Untwisting RoPE 变成硬依赖。

已核对的其他窄升级推荐线为 Inpaint Nodes `1.4.4`（ColorMatch 支持 RGBA 并保留 alpha）、Crop & Stitch `3.0.17`（图像/Mask rank、通道、dtype、NaN/Inf 和 batch 清洗）及 MultiModal Prompt Nodes `1.0.16`（本机已安装，保留应用兼容补丁）。最低支持线保持不变；更大采样协议或本地补丁变更的节点不因上游版本号较高就自动提高推荐线。实际验收边界见[节点升级证据](archive/2026-10-08-upstream-upgrade-assessment/evidence/nodes-20261009.md)。

注意：MiniMax H3 基础生成节点属于 ComfyUI 核心，不应伪装成第三方节点。如果核心节点缺失，应更新/切换正确的 ComfyUI 核心并重新扫描。

### 6.3 下载权重

大型模型目前不由 Git 仓库携带，也通常不由应用自动下载。设置页每个组件的信息入口提供：

- 官方或社区来源；
- 推荐文件名；
- 相对于模型根目录的目标子目录；
- 可选/必需状态和注意事项。

将文件放入显示的目录后重新扫描。不要根据模型显示名猜目录；例如扩散模型、GGUF UNet、文本编码器、VAE、LoRA 和 latent upscaler 属于不同分类。

### 6.4 工作流

执行工作流必须是 ComfyUI **API 格式**：节点 ID 为 key，每个节点包含 `class_type` 和 `inputs`。普通 UI workflow 不能直接提交到 `/prompt`。

应用自带生产工作流位于 `workflows/`，并由 adapter 注入 Prompt、素材、Seed、尺寸、帧数、LoRA 和输出路径。这些 API JSON 由应用版本统一管理，不从外部源自动下载、更新或覆盖；如需在 ComfyUI 中查看，应使用应用提供的当前版本文件。

### 6.5 两阶段验证

- **加入队列**：使用保存路径离线复扫模型组件，并静态检查 workflow/adapter。ComfyUI 停止不应无故阻止入队。
- **启动任务**：连接或启动 ComfyUI，通过 `/object_info` 检查真实节点，再提交 `/prompt`。

模型、节点和服务状态必须给出不同错误。不要把“服务未启动”显示成“模型未安装”。

## 7. 当前模型族的依赖重点

### MiniMax H3 FL2VA / R2V

- FL2VA 与 R2V 使用不同扩散权重，不能互换。
- 共同依赖 H3 文本编码器、视频 VAE、音频 VAE 和足够新的 ComfyUI 核心节点。
- 当前 H3 推荐使用 ComfyUI `0.42.3`；应用的官方 `comfy-kitchen` ConvRot CUDA 内核目标对齐为 `0.2.39`，与该核心的固定依赖一致。2026-10-21 核对 [PyPI 正式版](https://pypi.org/project/comfy-kitchen/0.2.39/)为 `0.2.39`，提供 Windows x64 的 Python 3.10、3.11 和 3.12+ ABI3 wheel；这是推荐与安装目标，不代表本机包已升级或真实生成已验。原生 `ModelAttentionBackend`、`BlockSparseAttention`、H3 PDD head bank 和 `MiniMaxH3SigmaShift` 均由核心提供，不再依赖已撤回的 H3-Optimizations/AIMDO 产品节点。此前在 `0.35.0` 环境采集的验证基线包括 `comfy-kitchen==0.2.33`、`comfy-aimdo==0.5.3`、匹配的 SageAttention/Triton 与 PyTorch 2.10 cu130 trio；这些是历史运行时证据，不是当前推荐版本。
- 设置中的 H3 policy 在任务等待时跟随保存后的 dense attention（Sage、Sage-Triton、PyTorch、Comfy Kitchen）、sparse attention（Auto、关闭、Sol-Attention、原生 SLA、未验证即拒绝的 VSA）、`compatibility/native` runtime 和 `auto/disabled` Comfy compiler；任务开始后冻结本次执行。执行时按实时 `/object_info` 核对所选 ComfyUI 节点的精确输入 schema；显存、async offload、compiler 和最终视频 VAE 不会跨工作流或跨正在执行的任务泄漏。
- 应用生成的 Spectrum H3 图保留第一遍自适应预测，但默认关闭 `offline_smoothing_replay`。该回放会额外保留多 GiB H3 特征并重新装载模型，在 0.35 + RTX 4090 动态显存配置下可能造成共享 GPU/系统内存压力；手工图仍可显式开启，不能把第一遍进度误认为整项任务完成。
- PDD FL2VA/Ref2VA 是普通 `LoraLoaderModelOnly` LoRA，固定 8 steps、Euler/Simple、video shift `12`、audio shift `3`、CFG `1.0`。当前 catalog 只接受与 `minimax_h3_fl2va_pruned_int8_convrot.safetensors` 或 `minimax_h3_ref2va_pruned_int8_convrot.safetensors` 匹配的 `*_Acc-8Step_pruned_comfy.safetensors`；[固定来源提交](https://huggingface.co/Kijai/MiniMax-H3-experimental/commit/f94b1bcc9442e531b73e0ee819ddfc3656072648) 与[原生 loader/采样参考](https://github.com/Jalen-Brunson/ComfyUI-MiniMax-H3-PDD-Acc/blob/main/README.md)只用于核对文件和 recipe。权重仍由用户管理，本轮不会自动下载，也没有新增最终视频 VAE。
- R2V 支持多参考图片；Motion Context 是可选的 R2V 续写增强节点，不是基础 FL2VA 的必需项。当前推荐节点版本为 `v0.7.1`，要求 ComfyUI `0.34.0+`、Python `3.10+`，没有新增独立 pip 依赖；`v0.3.1` 继续作为旧核心的最低兼容回退线。v0.7 新增实验性的 Join Match、Refine Blend、Sigmas Tail；v0.7.1 校正自动匹配、精简 Blend 参数，并让 Save 通过 `ui.latents` 回报文件、Load 可选读取 input。应用仍只使用原有四个基础节点，新实验节点不随推荐版本变更自动启用。
- Motion Context 工作流保留 `context_length=22`、`audio_context_length=24`、latent Save/Load 和 Trim `match_tail`；上游 v0.7 的音频建议已改为 18，本次推荐升级不改变现有图的显式参数，后续需独立生成对比。Load 默认仍是 `stock_format=false`、`folder=output`；Load 0 是首个 clip 的无 latent context，正数 index 读取精确 slot。应用图固定使用四个基础节点和显式正数 Slot 1，不依赖 Chain，也不需要删除并重新添加节点。上游画布迁移说明只适用于旧 widget 位置。同一 `custom_nodes` 目录只能保留一个 Motion Context 副本，重命名 fork 也可能产生 patch 冲突。
- LightX2V Turbo、Cinema、Better Human Motion、Camera Motion、Realism People 和 AfterMidnight 是 LoRA，不是独立视频模型；兼容模式、顺序、强度和冲突由 LoRA catalog 管理。当前 FL2VA 默认使用官方 LightX2V v1.2 768p 4-step（strength 1.0、video shift 6、audio shift 3、Euler），Spectrum `v0.2.6+` 仍需按任务做同 Seed 对照。
- 普通 H3 原生音视频采样的最低 ComfyUI 版本为 `v0.31.0`，当前推荐 `v0.42.3`；推荐版本是更新提示，不是离线入队的硬性阻挡。FastH3 Omni 的完整 PDD checkpoint 独立要求 `v0.42.0+`；官方 v0.42.0 已支持 `pdd_steps` 的检测和完整输出 head bank 加载，不再误用 0.42.1 阻塞 0.42.0。当前支持的 Turbo 权重包括官方 v1.2 768p 4-step、v1.0 8-step 和 Ref2V 4-step，均放入所选 ComfyUI 的 `models/loras`，不要把它们当成独立基础模型。旧 ckpt850 EMA、v0.1 FL2VA、旧 v1.0 768p 和 PinkFluffyBunny 已从新任务目录移除；历史只保留名称快照，编辑历史时不会带入创作页；AfterMidnight v1.2 仅用于 Ref2VA，不可移植到 FL2VA。
- H3 视频 VAE 的编码与解码支持 `minimax_h3_video_vae_fp16.safetensors` 基线和官方 `minimax_h3_video_vae_int8_convrot.safetensors`。设置中的 `自动` 在下一条尚未开始的 H3 任务领取时优先选择已安装的 INT8 ConvRot；缺少该文件时回退到 FP16，明确选择的后端缺失时也回退到另一份已安装 VAE。两者都缺失时设置禁用，H3 不能入队；正在计算的任务不会因设置变化而改用另一后端。官方 ConvRot 加速还要求目标 ComfyUI Python 中的 `comfy-kitchen==0.2.39` CUDA backend 已通过运行时探针验证。
- KJNodes 按功能使用：H3 SageAttention 模式需要 `PathchSageAttentionKJ`，TAE 实时预览只额外尝试 `ModelPreviewOverrideKJ`，显存调试使用 `VRAM_Debug`；预览缺失时自动降级，不阻塞普通生成。
- H3 实时预览是可选能力：更新 KJNodes 以获得 `ModelPreviewOverrideKJ`，并把 Kijai 的 `taeh3.safetensors` 放入 `models/vae_approx`。设置页会离线检查 KJNodes 的预览源码，服务启动后再通过 `/object_info` 验证节点注册；它只负责采样期间的低分辨率 RGB 预览，不替代 `models/vae` 中的最终视频 VAE。队列开关默认关闭，缺少节点或权重时保持原工作流运行。
- SageAttention、Spectrum、Cache/Attention patch 是模型范围内的策略，不得泄漏到 Qwen、Sulphur 或其他工作流。

### Sulphur 2 / LTX 2.3

- 使用 GGUF/低显存模型变体、LTX 文本连接器、视频/音频 VAE 和 latent upscaler。
- 原生视频续写依赖 LTXVideo 节点；其 overlap 语义与 H3 边界帧接续不同。

### 图片模型与工具

- 图片模型有独立的扩散模型、编码器和 VAE 组件。
- MOSS SFT / PornMaster V1 使用原生 MOSS 文生图路径，两个扩散 checkpoint 共用 Qwen3.5 9B 编码器与 small FLUX.2 VAE；精确文件名、下载来源和哈希以 Settings / catalog 为准，不自动下载。支持自然语言与 JSON 布局，不要求第三方编辑节点；参考编辑需要另外的编辑权重。选型与未验证边界见 [MOSS 接入记录](tasks/2026-10-21-moss-integration/evidence/selection.md)。
- Qwen 多图/Canvas 标记会影响实际图片输入槽数量；workflow adapter 和 Create 限制必须一致。
- 图片任务同样先离线入队检查，执行时再验证节点。
- Qwen 2511 局部融合修复及其专属 Crop & Stitch 节点已退出活动目录；仅保留历史名称和显式卸载身份。软件卸载按节点卸载规则删除，不额外备份源码；共享2511权重和普通编辑路线保留，Qwen2.1 Lighting Blend/Fix仍在原有LoRA入口选择。
- H3 I2I / REF2VA 图片功能已退出活动目录，H3 Image Studio 不再参与扫描、推荐、安装或更新；只保留历史名称和显式卸载身份。软件卸载按节点卸载规则删除，不额外备份源码，不删除图片媒体、模型权重或 H3 视频节点。旧 H3 图片历史重新编辑默认使用 Qwen Image 2.1。

### 视频增强

- SeedVR2、FlashVSR、Real-ESRGAN 和 RIFE 各自有权重与节点要求。
- 这些是生成后的独立重型阶段，仍遵守单 GPU 重任务策略和阶段卸载规则。

## 8. 代理与网络问题

应用代理默认关闭。开启后，节点 Git/pip 等下载操作使用设置的 HTTP/HTTPS/SOCKS 代理；应用内置工作流不通过此代理下载或覆盖；默认示例为 `127.0.0.1:7890`。

排错时查看节点卡片实时日志和“设置 → 日志”。常见问题：

- Git 不在 PATH；
- 代理地址不可达或证书失败；
- GitHub/Hugging Face 限速；
- 选错 ComfyUI Python，依赖装进了系统 Python；
- ComfyUI 正占用节点文件，导致 Windows 替换失败；
- 节点上游 requirements 与当前 Torch/CUDA ABI 不兼容。

可以连续点击不同节点加入应用内安装队列；同一节点不会重复入队，Git/pip 始终串行。不要同时启动第二个 Local Video Studio 实例安装同一套 ComfyUI，也不要在批次运行时从外部修改对应节点目录。

### ComfyUI 数据库自动修复

环境扫描发现近期数据库初始化错误时，设置 → ComfyUI 环境会根据日志中的实际 SQLite 路径区分进程锁占用、Python 依赖缺失、目录不可写、Alembic 迁移不兼容和文件损坏。自动修复必须在队列和提示词任务停止后执行，并使用当前所选 ComfyUI 的核心目录、数据目录和 Python。数据库/PyAV 等核心问题修复与节点或加速依赖重装是两类独立操作。

修复先复制备份数据库及 `-wal`、`-shm`、`-journal`、`.lock` 辅助文件，再运行当前核心的 Alembic 迁移和 SQLite `quick_check`。只有明确的迁移不兼容或数据库损坏才会隔离旧文件并创建新库；任何新建失败都会恢复备份。锁占用不等于数据库损坏，应用不会删除原库或终止外部启动的 ComfyUI，而是验证应用自己的隔离数据库能否启动。目录或数据库不属于当前所选实例时，自动修复会拒绝修改并保留诊断日志。

## 9. 验证

代码级门禁：

```powershell
npm.cmd run verify
```

模型/节点变更还需要：

1. 服务关闭时离线扫描正确；
2. 多 ComfyUI 实例选择正确；
3. 安装成功、失败和超时都有实时日志；
4. 重启后 `/object_info` 验证需要的节点；
5. 以低风险参数完成真实最小生成。

只有第 5 项成功才能称为“模型跑通”。类型检查、JSON 构建或节点文件存在只能称为静态验证。

## 10. 官方参考


- [ComfyUI Desktop for Windows](https://docs.comfy.org/installation/desktop/windows)
- [ComfyUI Portable](https://docs.comfy.org/installation/comfyui_portable_windows)
- [ComfyUI workflow/API concepts](https://docs.comfy.org/development/core-concepts/workflow)
- [ComfyUI Manager](https://docs.comfy.org/manager/install)
- [FFmpeg](https://ffmpeg.org/download.html)
