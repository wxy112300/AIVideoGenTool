# Strata 提示词增强：更新调查与接入计划

- 类型：Task；Status: product-integration-complete / pending-model-download-and-real-validation（产品接线已完成；完整模型与真实运行验收未执行）
- Updated / Owner: 2026-10-12 / 当前 agent；Execution: direct，新增子 agent 0
- Scope / Authority: 用户要求按 llama-cpp-python 的方式一键安装和管理、取消重复模型根目录设置、卡片客观描述模型；最新要求共用 ComfyUI 模型根目录下 LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF，软件目录独立。授权实现用户点击的软件安装/重装；权重仍用户下载；禁止 8080，不启动 GPU，不切默认模型、不执行上游全量 setup。
- Baseline: Local Video Studio 0.65.0，`836a8aa150c981578a4dc9b73e240d8614ba023a`；开始时 worktree clean。
- 权威：现行 [Workflow](../../WORKFLOW_CONTRACT.md)、[Dependencies](../../DEPENDENCIES_AND_SETUP.md)、[Prompt Pack](../../PROMPT_PACK_DESIGN.md)。本任务不改写当前产品契约。

## Resume

- 发布收尾：用户授权增加 patch 号并推送，并明确 Qwen Image 2.1 Turbo 一起发布；版本对齐到 0.65.1，README/CHANGELOG 统一记录本次能力与真实模型测试边界。授权提交本批代码和文档，不创建 GitHub Release、不下载模型或追加真实 GPU 测试。

- 最新阶段（P2，minor 增量、不 bump）：用户明确要求“把功能都接完，除了下载模型和实际测试”。已开放可选 Strata 模型并接上原 AppApi 的启动/增强/取消/释放与 operation/progress；首次自动 SHA-256 + CPU pack/tokenizer + 认证加载，完成缓存按模型/共享根/策略/源文件与派生事实复用。旧默认模型/持久化 runtime 字段不变，重启不再回退 Strata ID。图片编辑、H3 自定义 Pack、批注、精确对白/可见文字、FL2VA 双图、R2V 静音视频关键帧、Extend boundary/Continuum 语义和原 origin/version 写回已接线。32K/k8v4/1024视觉token/2GiB reserve，无MTP/CPU隐式回退；输出视频8K/图片4K，官方 tokenizer 文本计数加视觉与输出预留，截断/失败/取消无新版本。ComfyUI 事件不误取消 Strata，自有进程清理失败保留 unknown 占用及释放重试。新授权覆盖旧“须实测后才解锁选择”的阶段计划：产品 adapter 现在可选，`runtimeVerified` 仍 false，不宣称跑通。按 local-video-studio 技能完成代码与模拟 DOM 旅程；本轮不执行真实 Electron、权重 hash/pack、GPU、质量或性能测试，不触碰用户下载。最终门禁结果在下方 Evidence 更新。

- 剩余仅真实验收：用户完成模型下载后，验证完整权重、首次准备磁盘/内存/驱动资源、真实 UI 三页增强、视觉/批注/Extend 输出质量、取消/释放/队列交接与速度。MTP仍为可选未来加速，不属于当前基础接入，也不会自动下载。

- 最新阶段（P1c，minor 增量、不 bump）：用户要求完成下一阶段。新增 `StrataRuntimeOwner` 并接入生产应用服务图、退出、RuntimeAdmin 安装/卸载及原 Prompt/队列互斥；准备/请求/软件变更同步抢占同一进程内 lease，退出取消安装子树并等待恢复。可复用完成记录启动 lazy 服务，模型身份绑定到请求，不重新 pack。后台 OpenAI SSE 文本适配支持分块 UTF-8、正文 delta、正常 stop + DONE；思考/工具/拒绝/截断/异常不写成成功结果。取消/超时清理自有进程，失败保留 PID/占用、退出清理可重试；原 Prompt 释放按钮不误取消软件操作，也不把停止失败报成成功。开始 Strata 请求前释放 ComfyUI，失败不发请求；反向交接确认 Strata 退出后才加载原模型。完整 verify（1860 unit +86 integration、类型/干净构建/20对比度）通过；固定上游 mock 真实流式/取消/超时及生产 Electron 原生关闭自有 lazy Strata 通过。见 [owner 与流式验证](evidence/owner-stream-validation.md)。不新增 UI/AppApi/持久化字段，不下载或触碰大模型，未启动 GPU；catalog 仍 locked，实际 Prompt 路由/视觉/真实 Qwen 性能待下一阶段。

- 最新小 phase（P1b，minor 增量、不 bump）：用户授权额度允许继续，新增 `strata-model-preparation.ts`。复用当前 catalog/共享目录，下载完整且 SHA-256 通过后才执行官方 CPU pack/tokenizer；PLE 分片从 GGUF 元数据确定，不猜位置，不执行setup、不复制权重/下载MTP/启动GPU。派生文件默认在软件父目录下独立data；与软件/共享根重叠或链接别名拒绝，失败/取消资料保留且无有效完成记录。显式运行策略生成基础无MTP配置，完成记录记录源文件/pack/tokenizer事实，`prepareStrataLaunch`复查后才允许lazy计划。20项新增测试、邻接66项及完整verify通过；真实微型GGUF→官方工具→配置→`--engine strata --lazy` HTTP（loaded=false）通过，未请求生成。见 [CPU准备验证](evidence/cpu-preparation-validation.md)。AppApi/UI/Prompt路由、应用owner退出及安装互斥仍未接线；大模型hash/加载/性能未验。

- 最新小 phase（P1a，minor 增量、不 bump）：用户报告软件装好、模型下载中，并授权按剩余额度继续一小阶段。新增 `strata-service.ts` 后台底座及14项测试；基于固定源码的 loopback/lazy 启动计划，端口冲突不接管、不使用8080，每次启动临时认证、HTTP健康/受保护模型状态检查、自有进程树停止、串行启停与失败占用保留。仅接受后续准备阶段提供的配置，尚无 AppApi/UI/Prompt 路由或应用退出接线；未改默认模型/持久化/下载/安装。真实固定版上游 mock HTTP 启停验证通过，不是 Qwen 推理。详见 [服务底座验证](evidence/service-foundation-validation.md)。

- 最新卸载补齐（patch）：用户要求 Strata 卸载入口，已放进共用三角菜单并复用确认弹窗（默认取消焦点）。扫描新增只读 `managedUninstallable`，手动/未知/与模型目录重叠的目标不授予卸载；后台复检当前管理路径与安装记录，安装/卸载共用锁，生成/提示词忙碌拒绝。只删除当前软件目录含独立 venv，共享模型、独立数据、旧备份/失败资料保留；不改设置/原 Prompt/queue/History，不重启 ComfyUI。未向用户安装执行卸载。

- 最新目录纠正（patch）：用户认可模型命名的共享目录 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`，保留量化子目录和公共 projector。canonical 用于下载指引；同一模型根下旧 `LLM/strata` 只读兼容扫描、新目录有效文件优先，切换根不跨根复用旧文件。无自动搬移、下载、目录设置或模型 ID 迁移；软件目录与推理待办不变。下面旧证据中的 `LLM/strata` 是前一阶段路径，不再是默认目标。

- 已确认：最新正式版 v0.1.41（2026-10-08），main 与 tag 同为 `fb58e0dbc8399662c0e47c76578c6e878b14f6cf`。比上次讨论的 v0.1.38 有 API、加载/恢复与性能更新；本机收益未验证。
- 建议：新增可选 Strata + 原版 Qwen3.8-Flash-Next backend，保留现有模型。应用管理隐藏本机服务，loopback HTTP、lazy 加载；候选端口 43127，受限冲突回退，不使用 8080。
- 最新实现：独立运行组件改成单一卡片/一键安装，技术参数折叠；软件安装固定 Git SHA、校验 engine 大小/hash、独立 venv/固定 requirements/CUDA DLL 文件检查，不执行 setup/引擎。管理安装位于应用本机数据目录，非应用目录只读拒绝覆盖；重装备份旧目录，失败恢复，未完成资料保留供排障。模型共用配置/发现的 ComfyUI 模型根下 LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF，软件安装目录独立；没有第二个模型根字段。下载与完整/依赖/运行时扫描共用目标，更换 ComfyUI 模型根/所选安装后旧证据失效；旧下载记录仅在共享根未知时回退，不搬文件。卡片客观文案保留。下载指南见 [DOWNLOADS](DOWNLOADS.md)；旧手动布局证据 [Evidence](evidence/preparation-validation.md) 只代表前一阶段。
- P2 已按最新授权完成产品代码及模拟旅程；旧“实测后才解锁选择”的阶段限制已被本轮授权覆盖，不代表运行验收通过。下一步仅在用户完成权重并授权真实测试后，验证大模型 hash/pack、资源、真实 UI/视觉质量/队列交接和性能；MTP不是基础接入前置，不自动额外下载。安装旧边界见 [安装/简化 UI 验证](evidence/managed-install-validation.md)。
- 不要重复：不从上游 tok/s 推断本机性能，不复用旧 LM Studio 字段，不以 HTTP 断开代表 GPU 已释放，不直接替换默认模型。
- 菜单最新要求已实现：共用分体按钮；未安装项无三角/位置操作，已安装项在实色三角菜单中显示单行短标签“打开位置”，收起整体隐藏。软件安装与模型共享目录规则不变。
- 最新用户授权的安装取消已实现：排队项移除；运行中取消自有安装子进程并等待恢复。覆盖节点、Strata、llama-cpp-python、H3 加速依赖，不改变生成队列/模型目录或权重管理。minor 增量，不 bump；完整 verify 和隔离真实 UI 已通过，见 [取消验证](evidence/install-cancellation-validation.md)。现有 Strata 推理接入待办不变。

## Implementation and resources

- 最新安装进度修复（patch）：卡片直接显示进度条，折叠日志不隐藏；引擎实际字节百分比，其他阶段动态条与步骤。typed 既有事件转发，局部更新保留输入焦点，切页保留，取消优先且终态隐藏；不改持久化/安装来源/目录/权重规则。全量测试、类型、保留资源构建、对比度及自有真实 UI 通过，见 [进度验证](evidence/install-progress-validation.md)。推理接入待办不变。

- metadata 在 catalog；strata-installation 负责独立软件安装事务，Environment/RuntimeAdmin 注入现有下载/有界进程；typed AppApi/preload/IPC 回传既有依赖日志。strata-preparation 只读复检文件/安装记录；扫描不加载 GPU，也不以安装成功代表推理可用。
- 未执行 Strata setup/update/calibrate，未下载权重、未加载 GPU、未启动/接管 ComfyUI。实际源码、engine 与独立软件依赖下载仅在本任务隔离 fixture；未向用户环境安装。测试下载结束，失败资料与日志留在忽略的 temp 供复查；自有 Electron/下载/Python 清理后复核，用户库和现有下载不受影响。

## Evidence / handoff

- 0.65.1 发布检查（2026-10-12）：用户授权 Strata 与 Qwen Image 2.1 Turbo 一起提交推送；package/lockfile/README/CHANGELOG 版本对齐。发布门禁发现 Strata 目录重命名瞬时 EPERM，已提取并复用原有 Windows 有界重试，备份成功后才登记，恢复日志描述实际位置；新增瞬时占用与备份失败保护回归。最终 `npm.cmd run verify` 通过：208 个单元文件 / 1892 项测试，6 个集成文件 / 86 项测试，双端 typecheck、干净生产构建、20 项对比度通过。日志位于忽略的 `temp/release-0.65.1-verify.log`；不纳入提交。未下载模型、启动 GPU 或追加真实模型/应用验收。

- P2 收尾（2026-10-11，minor、不 bump）：`npm.cmd run verify` 通过，208 个单元文件 / 1890 项测试 + 6 个集成文件 / 86 项测试，双端 typecheck、干净生产构建与 20 项对比度通过。新增模拟 DOM 旅程覆盖缺模型文件阻塞 → 补齐恢复 → 实际按钮点击 → 失败不改草稿 → 完整成功新增版本 ID；服务测试覆盖认证 load、官方 tokenizer 超限预检、流式完整性、取消清理与失败重试，缓存/根切换/重启保留/ComfyUI 事件隔离亦有回归。Strata 默认 43127、拒绝8080和端口接管，原默认模型/共享目录/旧队列和 History 不变。日志仅在忽略的 `temp/strata-p2-verify.log`；首轮安装取消夹具初始化曾偶发失败，独立复现通过，补充失败日志断言后最终全量通过。构建只清理本仓库 `dist` 生成物；构建前后未运行 Electron/Python/真实 Strata，没有占用 GPU、修改下载或启动/停止用户服务。本轮真实 UI/权重/性能测试按用户要求不执行，静态与 mock 通过不能作为 Qwen 推理/质量证据。

- Strata 卸载（2026-10-10）：聚焦服务/菜单/确认/IPC测试通过；全量 test:all 为1796 unit +86 integration，typecheck、保留旧资源的 renderer/Electron 构建、20项对比度和16项 journey通过。非 clean verify，保留用户窗口 PID46192；初轮 IPC 通道计数94→95的断言已按新增通道更新，归属一对一检查保留。文件系统测试覆盖完整/中断安装、手动/不明/错误版本/链接根拒绝、共享根重叠及别名保护、子链接不跟随、安装互斥、备份/数据保留。推理与完整软件实装待办不变，未使用 GPU。
- 按 local-video-studio 技能真实 Electron 鼠标验收：未安装无三角→在自有管理目录写入合成软件/安装记录→真实扫描恢复菜单→三尺寸单行实色菜单→卸载确认默认取消→取消不调用服务/文件保留→确认前安装记录改动后台拒绝→恢复后真实确认删除软件→离线复扫回未安装无三角。共享合成模型及 junction目标、独立数据、备份严格保留，studio-state严格不变；服务日志含卸载成功且没有重启。报告 `temp/create-smoke-X8fmxt/strata-uninstall.json`；仅删除该 fixture 的当前合成软件目录，不涉及用户安装。自有 PID33824/CDP6188/fixture47829退出复核，用户窗口未干预；Harness清理不是原生退出生命周期证据。

- 模型命名共享目录（2026-10-10）：137项聚焦测试、全量 test:all（1771 unit +86 integration）、typecheck、保留旧资源的 renderer/Electron 构建、20项对比度通过；非 clean verify，保留用户主 PID46192。服务测试覆盖旧目录有效文件、双目录优先、坏新文件回退、公共 projector 去重、切换模型根隔离。缺安装测试先受到用户真实安装收据影响，改用隔离软件路径后通过，不改变产品行为。
- 按 local-video-studio 技能的自有真实 Electron/鼠标按钮验证：首次发现 ComfyUI 模型根→下载指引、实际键盘更换共享根→保存→分片/视觉投影目标→真实离线扫描→重启再点击；1280/1440/960无页面/弹窗横向溢出。旧合成截断 GGUF 保留且拒绝，不创建新模型目录；settings（除授权模型根）、默认 Prompt、queue/History 保留。有效大模型识别为合成 inspector 测试，未下载/移动真实权重、启动 ComfyUI 或 GPU。首轮 Harness 请求关闭后重启过早，等待实际 PID退出后复验通过；报告 `temp/create-smoke-hjU5S6/qwen-shared-model-directory.json`。自有 PID64100/3272/47032，CDP1249/1348/1446及 fixture47829均退出复核，用户窗口未干预；不把 Harness清理当原生退出生命周期证据。

- llama-cpp-python 位置纠正（2026-10-10，patch）：可选只读 `packageDirectory` 来自所选 Python 的 distribution 文件记录与实际模块文件，菜单不再回退解释器；无位置隐藏但保留卸载，未改变安装/原生就绪标准/持久化设置。真实 Python 两套含空格路径、坏 DLL、包文件移除与旧扫描回归通过；全量 test:all、typecheck、保留旧资源的 renderer/Electron 构建、20项对比度通过（非 clean verify，保留用户运行窗口）。按 local-video-studio 技能用自有 venv/合成包元数据、真实扫描/菜单鼠标点击到 native reveal 验证，缺包→文件恢复→定位→移动后错误→复扫隐藏，state严格不变；未实装新 wheel 或使用 GPU。报告在忽略目录 `temp/create-smoke-qS6wYi/llama-package-location.json`，自有 PID46864/CDP12601/Comfy fixture47829 已清理复核，不干预用户进程。

- 已运行：GitHub latest/main/tag API 只读身份检查；读取固定 tag 发布说明、文档、CLI 源码及社区 benchmark。
- 已运行：Harness list / guide settings-runtime，聚焦设置/扫描/存储/控制器测试，最终 npm.cmd run verify 通过（全部 unit/integration、干净类型构建、20项对比度）。首轮旧 catalog 数量断言已更新；两项并发文件系统超时独立复测及全量重跑通过。
- 真实 Electron：缺文件可见、8080 拒绝、合法配置真实按钮保存、独立 revision/目标目录弹窗、合成 runtime 非空文件存在恢复、截断 GGUF 拒绝、准备模型不可选、旧路由与队列/History 保留、重启字段保留；最终布局 1280/1440/960 检查通过。
- 文档验收：本轮 scoped diff、空白、本地链接和命令一致性检查；既有代码文件与索引保留 CRLF。
- 最新实测：真实鼠标点击安装及失败恢复、折叠详情、1280/1440/960 布局；源码真实 SHA 与完整 engine 大小/hash 校验通过。首轮含空格解压失败已修复，服务层真实解压和独立 Python 3.12 venv 创建通过。大型 CUDA 包下载时主动结束有界隔离检查；未完成 pip 与最终 DLL 验证，不当完整实装成功。
- 路径/文案修订：移除第二个模型根目录控件，统一运行组件管理路径与模型下载/扫描；目录派生、旧记录兼容、首次指引自动扫描、刷新后更新及关闭不重开均有聚焦测试。真实空配置 Electron 鼠标点击下载指引取得管理目录/models/IQ3_XXS，扫描结果一致；1280/1440/960 无横向溢出，原模型/queue/History 保留。来源与边界见 [路径与卡片验证](evidence/model-path-and-copy-validation.md)。
- 最新共享目录修订（覆盖上一条的路径选择，不改变文案）：按用户要求共用 ComfyUI 模型根下 LLM/strata；软件位置不再参与模型根解析。134项聚焦设置/环境测试通过，最终 verify 为1724项 unit +86项 integration、类型构建与20项对比度通过。真实键盘改已有模型根、按钮保存/下载指引、实际扫描及重启保持一致；原默认 Prompt、queue/History 不变，自有 fixture PID/端口清理复核。详见同一 [路径验证增量](evidence/model-path-and-copy-validation.md#共用-comfyui-模型目录增量)。本轮为 patch 级路径纠正，不另行发布或 bump 版本。
- 未验证：完整软件实装终态/旧安装真实重装恢复、GGUF SHA-256、驱动加载、pack/MTP、HTTP、视觉/提示词输出、GPU 交接、性能/质量；事务成功/回滚单测是合成证据。Harness JS 清理不当原生窗口退出生命周期证据。
- 版本影响：minor 类准备功能，已记录 CHANGELOG Unreleased；不承担 release owner，不 bump 0.65.0。
- 全树 token/费用：unknown；没有委派或额外模型调用。
- 菜单最终验收：全部 unit/integration、类型检查、保留旧资源的生产 renderer 构建和20项对比度通过；真实 Electron 的未安装隐藏、展开/收起、不透明背景、三尺寸单行及实际定位通过，state不变，自有fixture已清理。未关闭用户窗口，clean `verify` 与保留资源构建明确区分，详见 [菜单验证](evidence/dependency-menu-validation.md)。
