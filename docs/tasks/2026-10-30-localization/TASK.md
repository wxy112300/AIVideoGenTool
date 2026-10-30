# 全应用本地化优化

状态：进行中（2026-10-30）。第二十四批处理共享运行等待、节点阶段/分块进度、停滞错误与历史失败摘要，focused 协议分支及全量验收通过。以完整调用链集中推进，不用批次数代表覆盖率。未完成全应用覆盖，也未进入全量英文措辞、长度和功能动作大小写审校。影响等级：patch；未改版本、提交或打包。

用户要求、覆盖范围、执行顺序和验收方式见 [PLAN.md](PLAN.md)。

## 已处理与证据范围

- 保留此前的语言自称与原生编辑菜单翻译；统一主进程翻译入口。文件格式过滤器、剪贴板图片校验、迁移中退出提示及启动恢复对话框接入三语言。启动前无法恢复语言时回退简体，保留原始错误详情。
- History 单文件/批量复制、系统播放器结果及元数据校验和冲突消息接入当前语言；Settings 保存校验、部分迁移进度接入三语言。IPC 结果形状、错误类别、revision、路径与复制计数不变。
- 图片裁剪/标注、收藏/评分兜底、队列未知错误与节点安装取消/未注册原因接入词典。
- Settings 繁体资源原有 `...zhCN` 掩盖了运行依赖等遗漏；已补全显式条目并去掉继承。核对三包各 375 条独立文案的插值，修复英文组件信息按钮遗漏 `{info}`。
- 全局三语言键及插值自动检查通过；修复英文模型帧数提示遗漏 `{max}`。新增 11 组模型/提示词独立资源的字段及插值回归；这些检查不等于逐条译文质量审校。
- 真实英文 Create 检查发现默认“原始”和中文内置工作流摘要；已改为显示层本地化。回归验证自定义标签、保存草稿及自定义工作流路径不被改写。

## 第一批验证

- focused 覆盖 i18n、Settings copy、IPC adapters、媒体服务、notifications、节点安装队列、renderer bootstrap、独立语言资源和 Create 用户旅程；`npm.cmd run typecheck` 通过。
- 最终 `npm.cmd run verify` 通过：304 个单元测试文件 / 2853 项测试，7 个集成测试文件 / 104 项测试，生产构建与 440 对文字对比度检查。日志保存在 gitignored `temp/localization-final-verify.log`。
- 较早一次全量检查有一个 LAN 测试随机端口触发 `fetch: bad port`；该文件重跑通过，最终全量也通过；未修改该测试或放宽断言。
- 真实 Electron 采用空 queue/History 与独立资料库、专用端口的 fixture；三语言通过生产 select 的 change 路径切换，并以真实鼠标点击保存。选择器始终显示三种语言自称。
- 检查 Create / Queue / History / Settings：三语言 1440×900，英文另查 1280×800 与 1000×900，共 20 个组合。稳定页面的英文可见文本未残留中文；未检测到页面横向溢出或按钮内部裁切。截图人工复核英文 Settings 与窄 Create；Settings 侧栏长标签仍存在省略，留给后续长度审校，不能据此声称排版审校完成。
- 通过实际 AppApi 核对英文媒体缺失返回；保存英文后关闭并重启同一 fixture，确认语言恢复、Create 显示 Original，磁盘版本标签仍为“原始”。这是 IPC / 显示证据，不是实际打开播放器、复制成功或生成证据。
- 本轮 UI 报告位于 gitignored `temp/create-smoke-e1HHfi/localization-ui.json`、`localization-restart.json` 及同目录截图。后台窗口使用 focus emulation。启动扫描期间曾观察到切换前通知短暂保留原语言；扫描完成后的稳定页面已另行复核，不据此宣称通知回溯翻译。
- fixture 经既有 cleanup helper 关闭；自有 Electron PID 和 CDP / ComfyUI 测试端口均已退出。未启动 ComfyUI 或 GPU 任务，未操作用户媒体。此清理不证明原生窗口关闭生命周期。

## 第二批：运行服务与删除保护（已验证）

- PromptApplicationService 的固定启动/取消/卸载消息和动态缺文件、缺节点、运行配置错误接入三语言；保留模型名、节点、目录及原始诊断。自动起稿校验的所有 backend 调用传入语言。
- PromptRuntimeManager 通过惰性 getter 读取保存语言；取消 operationId、signal、驻留与清理状态不变。Renderer 同时识别繁体及英文启动/任务取消消息，真实 Create DOM 回归确认取消不新增版本、不显示失败通知。
- QueueRuntimeService、ComfyUI 启动/重启/停止服务、RuntimeAdminService 的固定错误和保护原因接入语言；PyAV 下层预检与修复文案也传递语言。未改变远程连接限制、外部进程保护、启动参数和修复条件。
- InstallationCancellation 与软件清理锁使用当前语言；日志保留、恢复完成后释放安装槽，以及已提交成功不被重新标记为取消的回归通过。
- HistoryDestructiveService 的删除错误接入三语言；参与引用保护判断的内部媒体标签不变，确认 marker/token 和部分删除错误类别不变。已知旧 JointAV 删除原因仅在详情显示层翻译，任意外部诊断和路径原样保留。
- 工作流三语言包改为完整类型检查，发现并补齐繁体 `continuumDurationFrozen`；补充全包插值回归，并纠正繁体把采样预算写成官方范围的文案。
- Settings 旧视频迁移完成/清理不完整两条提示已翻译；底层迁移预检/进度仍待处理。
- 最终 `npm.cmd run verify` 通过：304 个单元测试文件 / 2864 项，7 个集成测试文件 / 104 项，生产构建与 440 对对比度检查。证据：gitignored `temp/localization-service-verify.log`；仅对应上述第二批代码状态。
- 真实 Electron 英文/繁体各验证空增强、自动起稿缺媒体、取消空闲 Prompt、取消不存在安装、删除不存在版本的 IPC 返回；真实鼠标点击空输入增强按钮显示本地化恢复提示。草稿/队列/历史无变化，Prompt idle、模型 unloaded；未启动 ComfyUI/GPU，也未执行真实文件删除。证据：`temp/create-smoke-e1HHfi/localization-service-ui.json` 及 `service-errors-*.png`。
- 自有 fixture 已经 cleanup helper 关闭；清理报告 `localization-service-cleanup.json`。这不证明活动任务取消或 GPU 成片行为，也不证明原生窗口关闭生命周期。

## 第三、四批：续写检查与迁移

- HistoryArtifactService 的续写来源、Motion Context header/tensor/shape/几何错误和 Continuum Run 文件/版本/receipt 状态说明接入三语言。未改 schema、时间网格、前缀选择和文件检查条件；下层原生 AV 解析与 H3 结构验证诊断仍需继续处理。
- 旧视频迁移的缺文件/目标冲突预检、复制校验、目标复核、清理与警告文案通过可选 Translate 参数传递；默认仍为简体。计划/日志字段、文件引用、哈希和提交顺序不变。
- 通用 FileRelocation 的路径保护、目标占用、同盘/跨盘进度、校验与恢复错误接入语言；SettingsStorageMigration 和 LibraryStateStorage 传递选择的语言，保留 StateRecoveryError 类别、日志版本、资料库 ID 和 `LIBRARY_DESTINATION_OCCUPIED` 兼容代码。
- focused：续写/旧迁移/i18n/Settings 四文件 75 项通过；通用迁移/设置迁移/资料库租约/i18n 四文件 49 项通过；typecheck 通过。真实临时文件测试验证复制优先、哈希核对、提交后清理、同盘身份保持、跨盘回退、崩溃恢复及记录身份；只更新了默认关闭写入器错误的本地化文本断言。
- 第三批 `verify` 通过：304 个单元测试文件 / 2866 项，7 个集成文件 / 104 项，生产构建和 440 对对比度检查。证据：`temp/localization-extension-verify.log`；第四批通用迁移改动后的全量也通过：304 个单元文件 / 2867 项，7 个集成文件 / 104 项，构建和 440 对对比度检查，证据：`temp/localization-migration-verify.log`。
- 真实 Electron 英文/繁体各经 AppApi 验证源视频缺失、latent 缺失及 header 截断，返回 status/route/bytes/path 保持，草稿、队列和历史不变。夹具源视频由 CPU FFmpeg 生成，latent 故意截断；这是 IPC 诊断证据，不是正向续写/实际入队/生成或媒体质量验收。证据：`temp/create-smoke-e1HHfi/localization-extension-ipc.json`。
- 自有 Electron fixture 已关闭，报告 `localization-extension-cleanup.json`；没有启动 ComfyUI 或模型，没有迁移或删除用户文件。真实迁移 UI 和实际用户资料恢复不在本轮已验范围。

## 第五、六批：AV 校验与完成输出

- NativeAvArtifactService 的路径/文件保护、safetensors header/data/tensor、shape/时间网格、manifest 引用、SHA-256、复制和提交失败消息接入三语言；应用通过 getter 读取当前保存语言。共享核心 artifact validator 使用可选 Translate，旧调用默认简体，条件和状态保持。
- Continuum sequence 及其 sampling evidence 的诊断接入可选 Translate；History 来源检查和 Queue 当前 sequence 校验显式传入语言。H3 AV asset、receipt/parser/append 的其他说明尚未全部处理，不能把 sequence 覆盖推广到所有 H3 结构检查。
- ComfyOutputService 的视频、图片和 AV 输出目录未知、文件为空/丢失、没有返回文件及缺 serializer ID 错误接入三语言；H3NativeAvArtifactCollector 的模型映射、VAE、任务类型、缺文件和多个 payload 错误传入语言。未改查找根的优先级、VHS 音频文件名回退、非空文件判断和 History 写入门槛；用户文件名保留，英文列表使用逗号。
- focused：AV/collector/History/i18n/Continuum/domain 六文件 92 项通过；输出服务/collector/application runtime/i18n 四文件 38 项通过；typecheck 及 diff check 通过。真实临时文件验证切换语言后已提交 manifest/payload 不变，仍拒绝重复覆盖、无效引用和损坏文件；外部错误和中文路径原样保留。多个或缺失 payload 不调用 committer。
- AV 批次全量 `verify` 通过：304 个单元文件 / 2869 项，7 个集成文件 / 104 项，生产构建和 440 对对比度检查。证据：`temp/localization-av-verify.log`。完成输出服务新增改动后最终全量也通过：304 个单元文件 / 2871 项，7 个集成文件 / 104 项，生产构建及 440 对对比度检查，证据：`temp/localization-output-verify.log`。
- 真实 Electron 三语言经实际 Settings select/保存按钮切换，AppApi 分别返回 manifest 缺字段、payload 截断和 managed sampling hash 无效，共 9 个案例；draft/queue/history/imageHistory 及测试文件未被检查过程改写，Prompt idle/unloaded。首次脚本将文件放到 video 子目录而非视频/图片共享根，被原路径保护拒绝；仅修正自有测试文件位置后重跑通过，未改变生产路径保护。证据：`temp/create-smoke-e1HHfi/localization-av-ipc.json`。这是 IPC 错误层证据，没有伪造成功完成，也没有 GPU 生成或完成状态实跑。
- 自有 Electron PID 73180 和 CDP 10149 已退出，测试 ComfyUI 19818 无监听；cleanup 报告 `localization-av-cleanup.json`。未启动 ComfyUI、下载模型或触碰用户媒体；原生窗口关闭生命周期仍未验证。

## 第七批：H3 资产、receipt 与登记诊断

- H3 AV asset 的 producer、capability、路径及 manifest 结构错误，camel-case/raw managed receipt 的采样、计数、复用前缀和 assembly 诊断，以及 sequence append/更新错误接入可选 Translate。旧调用默认简体，字段名和默认简体诊断保留；未改变校验顺序、v5/v6 兼容、前缀和单 Chunk 条件。
- H3ContinuumAssetRegistry 的路径保护、header/tensor、文件与哈希、alias copy fallback、官方 assembly 帧数、manifest 冲突及只读 inventory 分类原因接入三语言。应用 getter 读取当前语言；Queue 资产适配、完成 receipt 提取和 History sequence 写入均传入语言。路径、状态、owner/alias、序列身份和实际提交字段保持。
- focused：H3 domain/managed/native artifact/collector/application runtime/History/i18n 七文件 104 项及 typecheck 通过。新增用例验证三语言 nested producer/receipt 诊断、无效 capability、inventory 状态与引用保持、中文文件名/外部 EACCES 原文，以及真实损坏 safetensors 的只读扫描和切换语言后字节不变。未新增 GPU 或实际完成输出验收，不将服务测试作为 UI/生成证据。
- 首次全量在 dependency-scanner 的 GGUF fork 测试触发原有 5000ms 超时，日志 `temp/localization-h3-domain-verify.log`；没有断言结果不符。该文件单独重跑 26 项通过，未改超时、断言或扫描实现。最终 `npm.cmd run verify` 通过：304 个单元文件 / 2876 项、7 个集成文件 / 104 项、生产构建和 440 对对比度检查；日志 `temp/localization-h3-domain-final-verify.log`。未将未复现的超时认定为已修复的产品缺陷。
- 检查期间工作区出现独立的历史列数相关实现和测试，已保留；本批未编辑列数实现/测试。全量结果对应当时磁盘集成状态，测试数量不可当作本地化覆盖率。未启动 Electron/ComfyUI/GPU，也未操作用户媒体；测试仅使用自行创建并在 finally 清理的临时文件。

## 第八批：Prompt Writer 与共享输出校验

- H3 Prompt Writer 的节点未加载、GGUF CPU 非法指令/自检、模型映射和依赖缺失、20 秒限制、空输入/空生成/补写失败及未知版本说明接入三语言。修复繁体时长提示原先回退简体的问题；HTTP 原文、错误码、依赖 ID、模型路径及 setup 诊断保留，取消/清理/卸载条件不变。
- H3 预算、Continuum 当前 body/主时间线、影视细节主时间线，以及批注范围、重叠、缺失/无效局部修订等错误使用可选语言参数，旧调用默认简体。Writer、Native Qwen、LM Studio、llama-server、MultiModal、Qwen-VL LoRA 的共享调用传入设置语言；renderer 的批注前置检查也传入当前语言。
- 模型面向指令、用户正文、批注识别和 EDIT_TARGET 协议、归一化/修订规则、容量与修复次数均保持。Writer 中剩余“非法指令”用于匹配外部故障；参考素材角色文本属于模型请求，未作为 UI 文案翻译。
- focused：Writer/H3 prompt/annotations/LM Studio/MultiModal/Qwen-VL/workflow/i18n/user journeys 九文件 155 项通过，typecheck 及 diff check 通过。新增用例核对英文/繁体恢复错误和原始诊断、三语言请求正文相同（仅忽略随机 session ID）、生成的中文用户内容不翻译，以及批注失败不替换原文。
- 最终 `npm.cmd run verify` 通过：304 个单元文件 / 2882 项、7 个集成文件 / 104 项、生产构建与 440 对对比度检查，日志 `temp/localization-prompt-writer-verify.log`。使用已安装 Vitest 支持的进程级 `VITEST_MAX_WORKERS=8` 控制并发；没有修改配置、测试超时或断言。
- 真实 Electron 三语言通过实际语言 select/保存按钮和批注策略 select 的 change 路径切换，再以鼠标点击增强按钮，均显示本地化的缺批注恢复提示。draft/queue/history/imageHistory 未变，Prompt idle、模型 unloaded；1280×800 无页面横向溢出，英文截图人工复核提示可读。证据 `temp/create-smoke-e1HHfi/localization-writer-ui.json` 与 `writer-preflight-*.png`。这是前端预检错误证据，不是批注正向生成、模型质量或实际修复运行证据。
- 英文截图同时可见中文扫描进度；仅记录为后续 environment/通知语言来源检查，不推断它已修复或一定属于切换前通知。没有宣称本次全页英文覆盖。
- 自有 Electron fixture 已经 cleanup helper 关闭；复核 PID 37488 已退出，CDP 9820 与测试 ComfyUI 19818 无监听，清理报告 `localization-writer-cleanup.json`。未启动 ComfyUI/GPU、下载模型或触碰用户媒体；不把 JS 关闭当作原生退出生命周期证明。

## 第九批：扫描通知与 ComfyUI 更新/修复

- 扫描阶段原本已使用阶段 ID 和三语言词条；活动通知在没有新进度事件时保留旧文字。EnvironmentRefreshCoordinator 现保留当前阶段，保存语言包和状态后仅重发文字已改变的同一 key 通知，保留进度，renderPage=false；不重启扫描、不增加页面刷新，完成/失败后不回写历史通知，重复同语言不重发。
- ComfyUI core 快进更新、Desktop 官方更新器提示、Git/脏源码保护、失败说明，以及 PyAV/数据库/FantasyTalking 源码修复的固定消息和可见日志接入三语言。节点问题卡片标题、详情和修复动作一并处理；数据库底层分类摘要使用可选 Translate，默认仍为简体。
- 未改 Git 更新命令、Python/核心选择、外部进程保护、数据库允许目录、备份/隔离/恢复顺序、诊断类别或文件引用；保留原始进程输出、错误详情、路径和包名。仅对固定应用文案翻译，未执行真实安装、核心更新或数据库修复。
- focused：environment refresh/environment/database repair/core dependencies/settings save/prompt environment/i18n 七文件 131 项和 typecheck 通过。回归验证活动通知跨语言更新但 scan/requestRender 不增加，旧进度和完成后的通知不被覆盖，远端保护在网络前返回，六类数据库故障的 kind/path/explicit 标记保持。
- 最终 `npm.cmd run verify` 通过：304 个单元文件 / 2886 项、7 个集成文件 / 104 项、生产构建和 440 对对比度检查。日志 `temp/localization-environment-repair-verify.log`；进程级 VITEST_MAX_WORKERS=8，未改测试断言或超时。
- 真实 Electron 三语言通过实际语言 select/保存按钮切换。原扫描通知 ID 始终为 1，英文和繁体均显示对应 dependencies 阶段且进度为 2/4，随后简体继续到 attention；没有新建扫描通知。实际 AppApi 的远端 update/repair 六个返回均为对应语言的连接专用拒绝，draft/queue/history/imageHistory 未变，Prompt idle/unloaded。证据 `temp/create-smoke-e1HHfi/localization-environment-ui.json` 与 `environment-language-*.png`。英文截图人工复核进度文字可读；这解决第八批截图的活动扫描通知问题，不等于所有历史通知回溯翻译或所有扫描结果字段已审校。
- 自有 fixture 已经 cleanup helper 关闭；复核 PID 59884 已退出，CDP 2820 与测试 ComfyUI 19818 无监听，清理报告 `localization-environment-cleanup.json`。未启动 ComfyUI/GPU、下载模型或修改用户数据；没有本机真实修复/更新验收，也未验证原生窗口关闭生命周期。

## 第十批：节点安装事务与下载公共提示

- `dependency-installer.ts` 自身的安装/卸载保护、Git clone/更新、固定 revision 校验、内置包复制、兼容处理阶段、依赖安装、重装替换、用户文件保护、失败恢复及临时目录清理消息接入三语言。下层 adapter/runtime 自有消息仍需继续处理，不能据此称全部节点安装已覆盖。
- 代理地址校验、脱敏代理状态及 pip 下载百分比/流量/速率使用设置语言。保留代理归一化、凭据隐藏、进度解析和节流条件，未匹配的外部输出原样保留。
- 未改安装目标、固定 revision/hash、子进程命令、并发锁、取消或备份/恢复策略；保留用户文件、路径、包名和原始外部诊断。新增英文 mock Git 安装及重装失败用例，核对用户模型字节保留；远端保护用例确认不会查根目录或启动子进程。
- focused：dependency installer/environment/installation cancellation/i18n 四文件 165 项通过。最终 `npm.cmd run verify` 通过：304 个单元文件 / 2888 项、7 个集成文件 / 107 项、生产构建与 440 对对比度检查。日志 `temp/localization-node-installer-verify.log`；使用进程级 VITEST_MAX_WORKERS=8，未改配置、测试超时或既有断言。
- 真实 Electron 通过生产语言 select 与实际保存按钮切换简体/繁体/英文；实际 AppApi 的远端安装、远端卸载和未知节点九项返回均符合当前语言，draft/queue/history/imageHistory 未变，Prompt idle/unloaded。证据 `temp/create-smoke-e1HHfi/localization-node-installer-ui.json`。这是语言保存 UI 与安装保护 IPC 诊断，不是安装按钮正向可达或真实安装成功证据。
- 自有 fixture 经 cleanup helper 关闭，复核 PID 85592 已退出、CDP 4678 与测试 ComfyUI 19818 无监听；清理报告 `localization-node-installer-cleanup.json`。未启动 ComfyUI/GPU、下载软件或权重、实际安装/卸载节点或修改用户媒体；未验证原生窗口退出生命周期。

## 第十一批：H3 加速安装与 Attention 状态

- H3 加速安装的目录/Python/GPU 保护、官方 wheel 匹配、禁止自动降级说明、KJNodes 兼容阶段、Python 包快照、PyTorch/comfy-kitchen/Triton/SageAttention 安装进度、CUDA 自检、复检与重启/恢复消息接入三语言。Attention 扫描/安装复检中的固定缺失项、探针未完成和就绪摘要使用设置语言；GPU、版本、wheel 文件名、外部 probe/native 错误和 Python 自检代码保留。
- `tritonRequirementForTorch` 增加可选语言，保留默认简体与版本匹配。共享 `runLoggedProcess` 增加可选 uiLocale，翻译取消/超时/退出码的应用包装；本批仅加速安装的所有执行调用传入语言，其他安装调用尚待补齐。子进程命令、超时值、进程树终止方式、stdout 与取消信号语义不变。
- 新增隔离安装模拟：Python 探针/子进程替身与临时 KJNodes 文件走安装主流程，核对三语言的 pip 参数和 CUDA 自检代码完全相同、阶段与成功结果本地化、外部中文诊断保留；探针失败的英文恢复说明保留 stage 和错误原文。缺目录与旧 GPU 在子进程前拒绝；真实 Node 子进程退出 7 时核对英文/繁体包装、原始 EACCES 与文件名。没有实际执行 pip、CUDA 或节点安装。
- focused 五文件 123 项通过；最终 `npm.cmd run verify` 通过：305 个单元文件 / 2896 项、7 个集成文件 / 107 项、生产构建和 440 对对比度检查。日志 `temp/localization-attention-install-verify.log`；进程级 VITEST_MAX_WORKERS=8，未改测试配置或既有断言。LAN 入口为 504.49 kB，新增资源后触发 500 kB 提醒；desktop 入口 474.19 kB。未抬高阈值或改变加载架构，此提醒留待资源拆包检查。
- 真实 Electron 经语言 select/实际保存按钮切换三语言，再用 AppApi 调用加速安装的无效代理前置分支；三组错误 message/log 均使用设置语言，返回发生在本地路径探测和安装之前，settings（除语言）、draft/queue/history/imageHistory 未变，Prompt idle/unloaded。证据 `temp/create-smoke-e1HHfi/localization-attention-ui.json`。这是语言保存 UI 和安装前置 IPC 诊断，不是加速安装按钮正向可达、真实安装或 GPU 自检证据。首次打开设置的自动化 evaluate 超时，经只读 inspect 确认空闲且未进入安装后重试通过，没有改产品逻辑或放宽断言。
- 自有 fixture 经 cleanup helper 关闭，随后复核 PID 27644 已退出、CDP 6200 与测试 ComfyUI 19818 无监听；报告 `localization-attention-cleanup.json`。未启动 ComfyUI/GPU、下载软件/权重或修改用户媒体；未验证原生窗口退出生命周期。

## 第十二批：共享 llama-cpp-python 安装事务

- 共享包的定位、同实例事务等待、就绪跳过/显式修复、Python ABI/CUDA wheel 保护、动态后端修复、下载进度、安装/卸载自检和失败提示接入三语言。空状态与探针结果构造增加可选语言，默认保持简体；安装事务和 Gemma 使用前的直接自检传入当前设置语言。
- 外层安装/卸载的停止、Writer 兼容检查阶段、重启等待、失败恢复及恢复失败包装使用设置语言；子进程执行传入同一语言。下层 Writer 源码适配器自身消息还未处理，扫描缓存的 llama 状态仍由原默认路径构造，不能称扫描摘要已完成本地化。
- 未改固定 wheel 版本/ABI/CUDA 映射、Python 探针代码、pip 参数、下载节流、并发事务 key/复用、卸载范围、缓存失效、ComfyUI 重启和恢复顺序。原始错误、崩溃码、包路径和技术标识保留；现有中文“非法指令”用于匹配外部错误，保留原逻辑。
- focused 七文件 202 项通过，typecheck 通过。新增模拟核对三语言安装与卸载的 wheel/pip/探针命令一致，所有执行收到语言，外部中文诊断保留；缺目录在 Python/pip 前拒绝，探针本地化只改变 detail，不改变 ready/路径/包身份，原生崩溃码与原始错误保持。未执行实际 pip 安装/卸载或 GPU 运行。
- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2901 项、7 个集成文件 / 107 项、生产构建和 440 对对比度检查；日志 `temp/localization-llama-install-verify.log`。使用进程级 VITEST_MAX_WORKERS=8，未改配置或既有断言。LAN 入口 513.51 kB，继续触发上一批已记录的体积提醒；没有抬高阈值。
- 真实 Electron 经三语言 select/实际保存按钮切换后，AppApi 的 llama 卸载操作在无效代理校验处返回对应语言的 message/log；测试端点 19818 离线，没有停止或启动 ComfyUI，也未执行 pip。settings（除语言）、draft/queue/history/imageHistory 未变，Prompt idle/unloaded。证据 `temp/create-smoke-e1HHfi/localization-llama-ui.json`；仅证明保存 UI 与卸载前置 IPC，不是卸载按钮正向可达或实际卸载证据。
- 自有 fixture 经 cleanup helper 关闭，复核 PID 11744 已退出，CDP 8394 与 ComfyUI 测试端口 19818 无监听；报告 `localization-llama-cleanup.json`。未启动 GPU、下载软件/权重或修改用户媒体；未验证原生窗口退出生命周期。

## 第十三批：节点源码兼容适配器

- `dependency-node-adapters.ts` 的缺源码位置标签、结构不匹配阻塞原因、补丁已应用/已就绪和可选诊断文件缺失提示接入三语言。覆盖 MMH3、Konohamaru、AetherScale、DLSS5 Depth Anything、VideoHelperSuite、LTX AudioVAE、H3 Prompt Writer/GGUF、MultiModal 与 Qwen-VL；纯函数使用可选 Translate，默认简体，不引入 Electron 或非默认语言静态依赖。
- 节点安装器的 replacement/target 准备调用，以及 llama 安装后的 Writer 准备调用传入当前主进程翻译。嵌套 patch/helper 继续传递同一翻译，避免外层英文而内层错误仍为简体。技术标识、文件名、路径和注入 Python 的原始诊断保留；没有按界面语言修改节点执行源码。
- focused 四文件 175 项通过；新增三语言源码比较覆盖 Depth Anything、AetherScale、Writer 和 MultiModal，验证输出字节一致及重复适配不变；MMH3/Konohamaru/Qwen 嵌套失败消息与标签使用英文/繁体。临时目录的 Writer 缺后端失败不写文件，正常准备保留用户原文并报告对应语言的就绪状态。首次新增 Writer 测试夹具没有命中原有导入模式，修正为实际 `llama_cpp._ggml` 导入后通过，没有放宽产品保护或既有断言。
- 本批未启动真实 Electron/ComfyUI、安装节点、下载软件或执行 GPU；验证层为纯适配器、临时文件和安装事务回归，没有新的 UI 正向安装或真实节点运行证据。临时目录由测试 afterEach 清理，没有新占用的端口或后台服务。
- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2901 项、7 个集成文件 / 112 项、生产构建与 440 对对比度检查；日志 `temp/localization-node-adapters-verify.log`，进程级 VITEST_MAX_WORKERS=8。desktop 入口仍为 474.19 kB，LAN 入口 527.50 kB，继续触发已记录的 500 kB 提醒；未抬高阈值或改变惰性加载方式。

## 第十四批：llama 探针缓存与扫描投影

- llama 内部采集返回原始 probe/error，单独转换为公开 LlamaCppPythonStatus；原生缓存保存事实，不再保存已翻译的状态摘要。完整扫描命中缓存后按设置语言格式化；runtime-only 与同步缓存投影有原始事实时仅重新生成 detail，保留先前状态字段，并继续按证据抑制无效 ready。公开 IPC/状态形状、Python 探针脚本、路径、包身份、错误、指纹/TTL/epoch 和失效策略不变，没有把语言加入原生缓存 key。
- 缓存投影增加可选纯格式化回调，参数为克隆的数据；无回调保持原行为，无缓存时继续保留旧快照与 unknown 证据，不凭旧文字推断语义，也不为翻译强制原生检测。因此缺少原始证据的历史快照可能保留原摘要，待下一次有效扫描更新。Attention/llama 的应用生成失败与变更中投影、Writer 运行库问题卡片补齐三语言；其他 Attention 旧快照字段仍需沿显示路径继续审查。
- focused 八文件 154 项与 typecheck 通过。新增回归验证同一原始 llama 缓存跨三语言读取/异步与同步投影，原生 runner 总计只运行一次，包目录与 backend 错误原文保持，原缓存没有 detail，过期后证据仍为 expired 且未启动原生探针。
- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2902 项、7 个集成文件 / 112 项、生产构建与 440 对对比度检查；日志 `temp/localization-probe-cache-verify.log`，进程级 VITEST_MAX_WORKERS=8。desktop 入口 474.19 kB，LAN 入口 528.83 kB，继续记录已有体积提醒，未抬高阈值。
- 真实 Electron 初始 full 扫描取得两项原生探针证据；通过语言 select/实际保存按钮切换英文、繁体、简体，三次 runtime 扫描均为 effectiveScope=runtime、nativeProbeStarted=0、llama source=previous/state=valid。三次 verifiedAt 相同，包版本/目录/ready/原始错误等事实保持；摘要分别为 CUDA backend ready、CUDA 後端已就緒、CUDA 后端已就绪。draft/queue/history/imageHistory 未变，Prompt idle/unloaded。报告 `temp/create-smoke-e1HHfi/localization-probe-cache-ui.json`。这是扫描结果/遥测与保存 UI 证据，不是所有设置卡片逐项视觉审校。
- 本批运行了所选 Python 的隔离原生探针，未启动 ComfyUI、队列或模型生成，未安装/卸载/下载软件或修改用户媒体。自有 Electron fixture 经 cleanup helper 关闭，复核 PID 52888 已退出，CDP 10962 与 ComfyUI 测试端口 19818 无监听；清理报告 `localization-probe-cache-cleanup.json`，不作为原生窗口退出生命周期证据。

## 第十五批：Konohamaru runtime 安装与预检

- Konohamaru neural-upstream 和 video2dlssnr 的下载、最终 URL/allowlist、平台限制、取消、SHA-256/大小校验、旧文件备份隔离、暂存/安装后复检与成功消息接入三语言。文件问题列表接受可选 Translate，旧调用默认简体；当前安装与扫描/执行预检传入当前语言，保留文件名、路径、哈希、字节数、bundle/release 和原始错误。
- 子进程选项增加可选 uiLocale，curl 与 Python 解压调用传入语言。未改下载来源/允许 host、固定资产清单/哈希、四文件选择、解压 Python 代码、manifest、备份/隔离/替换/恢复顺序或文件归属；逐段核对 allowlist、解压脚本和 manifest 生成保持一致。共享 software-update-cleanup 的自有消息仍待处理，不能据此称所有下层日志已完成。
- 扫描的 Konohamaru 完整性错误及修复动作、执行前的不可变 snapshot/冻结尺寸/目录/runtime 保护接入三语言。其他节点及扫描器共用 revision/版本/节点注册消息仍有遗漏，本批未扩展为整个扫描器文案审校。
- focused 四文件 63 项通过，typecheck 通过。新增三语言错误哈希测试核对原 addon/旧 RenoDX 字节保持、partial 删除、不执行子进程；英文/繁体截断归档在解压前拒绝，用户文件保持且 staging 清理；扫描嵌套缺文件原因与执行 snapshot 保护收到当前语言。最初新增测试猜测了 catalog 标识，修正为真实 NODE_ID/MODEL_ID 导出后通过，未放宽保护或断言。
- 本批测试仅用临时目录、假下载文件和子进程替身；没有下载真实 runtime、运行 DLL/EXE/Python 解压、安装/卸载节点、启动 Electron/ComfyUI 或 GPU 生成。没有新的实际安装按钮或正向安装/恢复实机证据；测试 afterEach 清理临时文件，未创建后台资源。
- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2902 项、7 个集成文件 / 119 项、生产构建与 440 对对比度检查；日志 `temp/localization-konohamaru-runtime-verify.log`，进程级 VITEST_MAX_WORKERS=8。desktop 入口 474.19 kB，LAN 入口 536.46 kB，继续触发已记录体积提醒；未改阈值。

## 第十六批：AetherScale runtime 与共享清理

- AetherScale 的归档路径/链接/清单校验、下载/大小/哈希/平台保护、安装/卸载/备份/复检与扫描错误接入三语言。worker 状态、所有权拒绝、受控终止及更新前等待提示使用可选 Translate；安装/卸载取得设置语言，扫描、执行预检和 Queue 取消 worker 调用传入当前翻译，保留 PID/路径与原始进程诊断。
- 共享 software-update-cleanup 的目录范围/链接/数据冲突保护、清理成功和失败恢复提示使用可选 Translate，默认简体。节点安装、Konohamaru/AetherScale runtime 以及 managed cache 的直接清理调用已传入翻译；DLSS5/Strata 和其他外层调用自有消息及语言传递仍待处理，不能称所有安装器的清理链路已覆盖。
- 未改归档白名单、固定字节数/哈希、解压脚本、worker 查询脚本、PID/父进程/命令行校验、注册表所有权、manifest、文件归属、配置识别、用户数据复制、失败恢复或终止方式。逐段核对解压脚本、worker 查询、allowlist 与 manifest 生成未变。
- focused 七文件 153 项通过，typecheck 通过。新增英文/繁体测试核对远端安装/卸载、worker 错目标、归档 traversal 在下载/进程前拒绝；截断归档保留用户文件并清理 staging，扫描只改变 error。共享清理拒绝目录外目标，配置同名冲突保留双方字节，模拟 EBUSY 保留原始中文诊断及文件。新测试最初使用未被既有规则识别的配置文件名，改用原有 settings.json 规则并保留中文目录后通过，没有改数据识别规则。
- 新增验证使用临时目录、假下载与进程替身；未执行实际 runtime 下载/安装/卸载、worker 终止或 GPU 生成，未启动本任务 Electron/ComfyUI。没有新的真实按钮或安装成功证据；临时目录由测试 afterEach 清理，未新增后台资源。
- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2904 项、7 个集成文件 / 123 项、生产构建和 440 对对比度检查；日志 `temp/localization-aether-cleanup-verify.log`，进程级 VITEST_MAX_WORKERS=8。desktop 入口仍为 474.19 kB，LAN 入口 551.75 kB，继续记录已有 500 kB 提醒，没有抬高阈值或改变惰性加载。

## 第十七批：DLSS5 runtime

- DLSS5 SR/NR 安装、卸载、扫描、归档内容/路径/符号链接、Python/7-Zip 回退、固定文件大小/哈希、自检、替换/回滚及文件归属消息接入三语言；子进程与共享清理调用传入语言，执行前 snapshot/revision/runtime/depth 保护一并接通。catalog 的 unavailableReason 和外部诊断仍按原值保留。
- 未改固定资产、SR/NR 分阶段能力、文件白名单、py7zr 解压脚本、NR manifest 生成、ASAR-safe 删除或备份恢复策略。新增英文/繁体远端安装/卸载与路径 traversal 拒绝；假截断归档在解压前拒绝且用户文件保持。阶段 focused 三文件 39 项通过，typecheck 通过。

## 第十八批：节点扫描固定消息

- 节点版本/revision 读取与推荐更新、GGUF origin、节点注册与修复、可选 TAE 预览、Writer HTTP/原生诊断包装、Qwen/MultiModal 兼容与 Motion Context 重复副本提示接入三语言。技术 ID、版本、目录、catalog known-bad 原因/purpose 等运行管理元数据、模型数据及原始诊断保留；HTTP 请求、诊断刷新与读取流程不变。
- 原来通过中文“重启”分类应用生成错误的地方，改为由完整未注册/部分注册分支传递状态；原生 Writer 诊断的既有中文匹配保持。回归验证完全未注册的 KJNodes 为 warning/可修复，部分注册为 error/不可修复，三语言一致，路径、缺失节点和 loaded 状态一致。扫描器/DLSS5/i18n 三文件 59 项通过，typecheck 通过。

## 第十九批：managed cache 外层保护

- 软件 provenance、链接、模型/媒体/数据库、本地配置、不可确认可重建数据、归属变化及清理失败包装接入三语言。服务创建后仍从 getSettings 动态读取语言；没有改归属确认、Git/receipt 校验、配置/权重识别、互斥/GPU 租约或删除范围。
- 新增同一缓存服务实例在英文/繁体/简体间切换的测试：含用户模型的旧副本始终拒绝清理，原始中文文件名保留，用户模型和当前软件字节均未变。三个批次最终 focused 六文件 105 项通过。

## 第十七至十九批统一验收

- 最终 `npm.cmd run verify` 通过：305 个单元文件 / 2907 项、7 个集成文件 / 127 项、生产构建和 440 对对比度检查；日志 `temp/localization-batches-17-19-verify.log`，进程级 VITEST_MAX_WORKERS=8。三个批次采用最终集成状态的一次完整验收，未改测试配置、既有断言或超时。desktop 入口 474.19 kB，LAN 入口 573.90 kB，继续触发已有体积提醒，未抬高阈值。
- 真实 Electron 通过语言 select/实际保存按钮切换三语言，用 AppApi 只读扫描本任务创建的空 Spectrum 节点目录；三语言版本未知提示正确，兼容状态均为 warning。扫描设置仅为调用参数，保存 settings 除语言外不变，draft/queue/history/imageHistory 未变，Prompt idle/unloaded。报告 `temp/create-smoke-e1HHfi/localization-batches-17-19-ui.json`。这是保存 UI 与扫描返回证据，不是实际扫描按钮/安装/清理按钮正向验收。
- 真实检查发现旧版本未知 notice 重复拼接，以及英文仍使用全角分隔符；已记录到后续措辞/长度审校，不把该状态称为最终文案质量通过。保留节点目录为本任务的 ignored fixture；未向用户安装目录写入节点、安装/卸载 runtime、清理真实缓存或执行模型生成。
- 应用启动和只读扫描可运行原生探针；隔离扫描显式选择本任务不存在的 Python 路径，没有运行该隔离节点。自有 Electron 经 cleanup helper 关闭，复核 PID 88596 已退出、CDP 2386 与 ComfyUI 测试端口 19818 无监听；报告 `localization-batches-17-19-cleanup.json`。未启动 ComfyUI 或模型生成，不作为原生窗口退出生命周期证据。

## 第二十批：Strata 安装与卸载

- Strata 软件安装/卸载、手动目录和共享模型重叠保护、源码/引擎归档/组件清单校验、独立 venv、固定控制向量准备阶段、备份恢复和结果消息接入三语言。环境适配器的 curl 缺失及子进程包装传入设置语言；共享用户文件保留和软件清理调用传入同一翻译。卸载设置的可选 uiLocale 兼容旧的精简调用，不新增持久化字段。
- 没有改固定 revision/hash、安装命令、Python/CUDA 自检代码、下载资源、venv 发布顺序、归属判断、共享权重保护或回滚范围。模拟三语言完整安装核对命令一致；模拟 pip 失败后保留含中文文件名的用户模型字节、原 receipt 和原始 EACCES 诊断。真实小型损坏归档在解压/pip 前被拒绝并清理失败包；隔离卸载成功与模型目录重叠保护均覆盖英文/繁体。

## 第二十一批：Strata 下载缓存与 MTP 解析器准备

- 软件缓存的目录归属、来源记录、未知文件、下载身份和旧半包复用说明，以及 MTP GGUF 固定源码准备/校验提示使用可选 Translate，默认仍为简体；Strata 安装传入当前语言。没有改下载缓存 key/receipt、Git 来源校验、半包复制范围、sparse checkout 或 parser revision。
- 英文/繁体缓存来源冲突测试核对已有下载字节和未知 receipt 不被覆盖，未调用 Git。现有 junction/硬链接、固定来源和跨次续传保护用例继续通过。独立 Agent 启动器经 agentSettings 明确固定简体，不能只替换底层词条就视为随 Studio 切换；其语言来源、共享软件维护与控制器整体本地化留待后续处理。

## 第二十二批：共享断点续传诊断

- 下载进度、半包保留、重试/十分钟上限、完整性和归属、服务器不接受续传及 URL 脱敏占位接入三语言，Strata 下载传入当前翻译；原始外部故障文字保留，URL 继续隐藏。三次尝试、统一 deadline、实际 offset、取消和不强制重下规则不变。
- runLoggedProcess 的非零退出错误增加非持久化 numeric code；下载失败分类优先读取 curl 原文和 numeric code，保留旧中文包装解析兼容。避免英文/繁体子进程包装影响无 stdout 时的重试分类。实际 Node 子进程 exit 56 的两语言测试验证 retryable 一致；range 33 不重试、半包字节保持，含中文外部诊断保留且凭据 URL 不泄漏。
- 本机 curl 对隔离 loopback HTTP 实测三语言的中断 body → Range 恢复，最终 SHA-256/字节一致；测试关闭自身 HTTP listener。不连接上游、不下载软件或模型。

## 第二十至二十二批统一验收

- focused 六文件 81 项通过；最终 npm.cmd run verify 通过：305 个单元文件 / 2918 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查。日志 temp/localization-20-22-focused.log 与 temp/localization-batches-20-22-verify.log；进程级 VITEST_MAX_WORKERS=8，未改原有断言、超时或测试配置。desktop 入口 474.19 kB，LAN 入口 584.06 kB，已有 500 kB 体积提醒持续，未抬高阈值。
- 真实 Electron 经生产语言 select/change 和实际保存按钮切换英文/繁体/简体，以 AppApi 分别调用 Strata 安装/卸载的手动目录拒绝分支，六组返回 message/log 均使用当前语言。本任务手动目录标记文件、settings 除语言外、draft/queue/history/imageHistory 保持，Prompt idle/unloaded。报告 temp/create-smoke-e1HHfi/localization-batches-20-22-ui.json。此为保存 UI 与保护 IPC 的证据，不是安装/卸载按钮正向可达或真实软件安装成功验收。
- 未启动 ComfyUI、GPU、上游下载或真实用户软件维护；启动应用自身可能运行只读原生探针。自有 fixture 通过 cleanup helper 请求关闭，报告 localization-batches-20-22-cleanup.json；请求关闭后首次 PID 查询仍短暂存在，随后复核 PID 6012 已退出，CDP 6446 与 ComfyUI 测试端口 19818 无监听。不作为原生窗口退出生命周期证明。

## 第二十三批：Prompt 后端与共享请求诊断（集中处理）

- Native Qwen、MultiModal Prompt、Qwen-VL LoRA 及兼容保留的 LM Studio/llama-server 的模型类型、显存/CPU 确认、节点与枚举注册、加载/连接/卸载、HTTP、空输出及 token 停止原因说明接入三语言。共 74 个语义键，保留旧默认简体调用；releaseMultimodalPromptModel 的精简设置类型可选接受 uiLocale，不新增持久化字段。
- 共享 jsonRequest、uploadInput、extractStringNodeOutput/原生输出提取接受可选 Translate；三种 ComfyUI Prompt 后端传入当前语言。原生连接检查、interrupt、freeMemory 和队列退出等待的 HTTP 包装读取设置语言。未将同文件的生成提交、运行等待/progressForNode、其他上传消费者自动扩展到本批，相关遗漏仍在待办。
- Qwen 枚举错误保留 error class/name、nodeType/inputName/expected/choices 和 needsRuntimeRefresh；分类继续依据原始枚举，不匹配译文。日志句柄错误的新增修复包装以内部 Error 类型去重，保留旧中文已包装错误兼容；同一错误经不同语言解释不会重复追加。外部 Errno/EACCES、选项、文件路径、模型名称和生成文本保持。
- 没有改模型请求正文（包括现存兼容路径的模型面向中文指令、warmup 请求）、图节点/参数、GPU/CPU 决策、卸载条件、超时、采样/seed 规则或自动刷新次数。新增三语言比较 Native/MultiModal/Qwen-VL/LM Studio 请求完全一致，固定随机源只用于比较测试，中文对话与可见文字保留；另核对显存门槛/显式 CPU、枚举刷新标志/10 项选项、重复修复说明、原始诊断与文件字节保护。
- focused 七文件 139 项及 typecheck 通过；最终 npm.cmd run verify 通过：306 个单元文件 / 2929 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查。日志 temp/localization-prompt-backends-focused.log 与 temp/localization-prompt-backends-verify.log；进程级 VITEST_MAX_WORKERS=8，未改测试配置、既有断言或超时。desktop 入口 474.19 kB，LAN 入口 599.53 kB，既有 500 kB 体积提醒继续保留。
- 真实 Electron 经语言 select/change 与实际保存按钮切换三语言，使用实际 AppApi.testConnection 访问本任务隔离 loopback HTTP：健康/503 各一组三语言共六项返回正确，外部中文诊断保留。HTTP fixture 仅收到六次 GET /system_stats，已关闭；除语言外 settings、draft/queue/history/imageHistory 保持，Prompt idle/unloaded。报告 temp/create-smoke-e1HHfi/localization-prompt-backends-ui.json。这是保存 UI 与共享请求 IPC 证据，不是实际增强按钮正向或模型生成/质量证据。
- 未启动 ComfyUI/GPU、模型生成或上游下载；应用启动可能运行只读原生探针。自有 Electron 经 cleanup helper 关闭，复核 PID 52964 已退出，CDP 9089 与测试 ComfyUI 19818 均无监听；报告 localization-prompt-backends-cleanup.json。不作为原生窗口退出生命周期证据。

## 第二十四批：共享运行等待与进度

- nodeStage、续写 source 角色、progressForNode 的阶段标签和分块/当前块进度，以及 historyFailure、TaskStalledError、waitForTask 的固定失败/中断/完成提示接入三语言，共 53 个语义键。辅助函数增加可选 Translate，旧调用保留默认简体；waitForTask 使用调用设置的语言，并向历史/队列 HTTP 包装传入同一翻译。
- 保留阶段 start/end/tracksSteps、Spectrum replay 归一化、Continuum source 角色/预定步数、分块计数与 workProgress 单位。未改进度单调性、prompt/client 身份过滤、未完成 batch 判断、GPU keepalive、服务静默和活动超时、两次断线判断、轮询周期、取消及日志桥捕获范围。未知节点名、exception 类型/正文、原始状态和调用方取消原因保留；队列继续通过 TaskStalledError 的类型判断停滞，不匹配译文。没有回写旧持久化诊断或进度文字。
- 新增 20 项针对性检查：三语言阶段区间/数值、Continuation source 解码、分块 35% 和原始用户节点名；原始历史异常/日志句柄恢复说明；模拟 WebSocket 和 fetch 的正确任务/其他任务事件、成功终态、执行中断、原活动超时、连续两次连接失败、错误 History client 隔离及取消原始原因。成功仍返回同一 History 对象，失败不报告 100%，所有分支关闭自身模拟 socket。日志桥在这些协议测试中隔离为替身，未将模拟成功当作真实生成。
- focused 五文件 144 项和 typecheck 通过；npm.cmd run verify 通过：308 个单元文件 / 2962 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查。日志 temp/localization-execution-progress-focused.log 与 temp/localization-execution-progress-verify.log；进程级 VITEST_MAX_WORKERS=8，未改既有断言、超时或测试配置。LAN 入口 607.41 kB，已有 500 kB 提醒仍保留，不把对比度成功等同于长阶段文本的布局审校完成。
- 验收期间出现独立的 Strata source fetch / Git 软件文件检查改动和测试，未编辑这些文件；其变更晚于全量开始，补跑三个邻接文件 32 项通过，日志 temp/localization-adjacent-strata-check.log。全量数字对应集成磁盘状态，不全部归属于本地化，也不作为覆盖率。
- 本轮没有启动 Electron、ComfyUI 或 GPU，没有下载软件/权重或操作用户媒体；新增协议检查无真实 HTTP/WebSocket listener。未新增真实运行中 Queue/Prompt 页面与模型生成证据，相关正常/错误状态和布局仍在待办。

## 待完成

1. 继续遗漏修复：检查 Qwen-VL 元数据准备、Strata/长视频 Prompt 服务；此前五条后端及共享等待固定消息已覆盖记录范围，不能称整个 Prompt 运行链已完成。继续检查 `environment.ts` 其余安装/下载及运行配置、Strata 控制向量底层校验/准备/运行服务与 Agent 软件维护；Attention 旧快照、其他扫描固定字段、生成提交/其他上传消费者、资产库与队列/图片/upscale 校验及资料库更底层恢复说明仍有遗漏。保留运行管理元数据、模型面向提示词、外部诊断和路径。
2. 检查有内容的 Queue/History、详情页、Prompt/Extend/Upscale、Settings 其他标签，以及 LAN/NAS 浏览实际正常/加载/错误状态。当前空页面 smoke 不覆盖这些状态；未做原生菜单和对话框的桌面实操验收。
3. 核查运行时 workflow 消息的调用语言与旧提示词版本其他内建标签；原始用户内容、技术标识、文件路径及旧兼容匹配保留，不能机械替换全部中文。
4. 遗漏覆盖后，逐条审校全局、Settings、模型和提示词界面译文；英文功能按钮/可执行菜单按用户规则使用标题式大小写，说明句保持句子用途。当前 Copy file、版本未知 notice 重复和英文全角分隔等仍待处理。
5. 对英文侧栏、按钮、选项、标题和窄视口做长度审校，必要时拆分共用语义键；补齐相应真实状态与错误恢复验收。影响提交门槛时再走缺输入 → 恢复 → 实际按钮 → task ID；本轮未改门槛，也未宣称真实生成通过。

下一批从第 1 项继续；只更新本 TASK 的覆盖与验证，不另建计划或把阶段性检查标为全应用完成。

## 执行环境

沙箱内多次进程启动返回 `helper_unknown_error: setup refresh had errors`；本轮经已获准的沙箱外命令完成检查，没有因该错误停止工作。`harness:app -- list`、`guide settings-runtime` 与 `guide extend` 已运行。完成全部覆盖与验收前不要将任务标记完成。
