# 全应用本地化优化

状态：本轮自动源码工作已收尾（2026-11-03）。固定工作包 1/2/3 已完成；用户要求停止真实页面检查，工作包 4 剩余路径和工作包 6 的实屏验收转交人工，不再阻塞本轮。既有三语言 84 个组合及两处修复证据保留。本轮完成英文动作大小写/术语与长度源码审校、Settings 侧栏及入口引用、退出标题和 History 无障碍名称，相关自动检查及构建已完成，仓库全量仍有既有独立 NAS 测试失败，详见证据。独立 NAS Browser 不需要翻译，长视频专属继续延期，独立 Strata Agent 不在主 App 收尾范围。影响等级：patch；版本保持 0.67.6，未提交或发布。

用户要求、覆盖范围、执行顺序和验收方式见 [PLAN.md](PLAN.md)。

范围澄清（2026-11-03）：用户明确 NAS Browser 是独立工具，不需要翻译；从本任务验收清单移除，不改其实现或部署包。此前日志中 NAS 测试失败仅是全量仓库检查的既有结果，不是本地化待办；主 App 自带的局域网浏览入口另按其实际功能检查。

验收调整（2026-11-03，用户最新指示）：停止继续真实页面检查，后续漏查由人工负责。自动工作转为源码/资源审校和自动回归；未覆盖的真实路径留在人工清单，不虚报通过，也不因缺少这部分证据反复延长本轮。

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

## 第二十五批：Qwen 配置准备与 Strata 提示链路

- Qwen-VL 的元数据目录/来源路径、下载空文件、准备进度和失败恢复包装，Strata 参考图格式/32 MiB/数量/请求大小保护、视频参考时长与采样总量，以及准备参考图、思考/输出预算、流式字符数、明确时间点纠正和长视频规划/分批/整包核对状态接入三语言，共 32 个语义键。共享 downloadFileWithCurl 的 curl 缺失和子进程错误包装使用调用设置语言。
- StrataImageContent 与 withStrataReferenceMedia 接受可选 Translate，正常增强入口传入设置语言；validatedOutput 的初次和一次纠正调用传入 uiLocale，保留 StrataPromptValidationError 类型。详细影视预设缺主时间线的真实校验分支分别返回英文/繁体；没有新增其他预设的输出限制。
- 没有改元数据 URL/清单、下载/替换范围、按模型目录复用的 in-flight key、取消类别、缓存失效、图片 MIME/字节/数量限制、边界图顺序、三点抽帧与清理、参考标签和模型正文。进度使用请求发起时的语言，同目录并发继续共享首个事务，不因切换语言重复下载。保留模型 safetensors、原始外部诊断、中文文件名和用户输出。
- 新增 14 项检查：三语言元数据准备/复用、空下载和原始外部错误后清理及重试、同目录单事务与 AbortError；Strata 模型请求和中文用户输出跨语言相同，流式预算/思考字符数提示本地化；参考格式及采样超量后清理；长视频规划一次、每批最多三页、总调用数和页面身份/模型请求/输出完全一致。仅使用临时文件与下载、模型、帧工具替身，不连接上游或加载模型。
- focused 八文件 90 项及 typecheck 通过，日志 temp/localization-strata-prompt-focused.log；npm.cmd run verify 通过：309 个单元文件 / 2979 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查，日志 temp/localization-strata-prompt-verify.log。使用进程级 VITEST_MAX_WORKERS=8，未改既有断言、测试配置或超时。LAN 入口 613.22 kB，已有 500 kB 体积提醒保留；数字包含同期独立改动，不作为本地化覆盖率。
- 本轮从已经提交的 0.67.4 干净基线继续；未执行版本修改、提交或打包。期间出现独立 context menu/style 任务，相关 History/Settings 菜单、CSS 和测试不属于本轮，均保留。未启动 Electron、ComfyUI 或 GPU，未新增真实增强按钮/模型生成/质量证据；临时文件在测试 finally/afterEach 清理。

## 长视频范围交接（2026-10-31）

用户明确要求先跳过尚未完工的长视频功能。剩余 core layout/enhancement/script 校验、renderer 调用语言、专属正常/错误/恢复状态以及最终三语言/大小写/长度验收，已交接到 [长视频 PLAN §10](../2026-10-18-long-video-director/PLAN.md#10-长视频功能闭环后的本地化验收)，其 TASK Resume 同步入口。本任务当前不再推进这些长视频专属项目，也不将其算作已完成；此前第二十五批成果保留。共享 Strata、普通单段 Prompt、非长视频 Extend 和其他页面仍属于本任务。

## 第二十六批：共享 Strata 服务与控制向量

- 启动/认证/端口/模型加载、上下文与 tokenizer 自有包装、请求/状态/停止失败、驻留日志、资源预警说明，以及控制向量大小/哈希/作用层确认接入三语言，共 59 个语义键。prepareStrataLaunch、进程退出和向量/驻留 helper 接受可选翻译，旧调用仍默认简体；主应用经 ApplicationRuntime → owner → service 的可选 getUiLocale 读取已保存语言，不向启动计划、HTTP 请求、snapshot 或持久化加入语言字段。独立 Agent 未传 getter 时保留简体。
- 保留 API key 认证/脱敏、端口拒绝接管、惰性加载与实际模型确认、load/chat HTTP 载荷、请求校验、tokenizer 与资源门槛、普通低余量预警/持续严重不足保护、取消和退出占用保护、单进程串行与临时配置清理。自定义 launch 继续收到原来两个参数，只有默认启动器传入可选翻译；控制向量仍读取同一文件/字节范围并校验同一 SHA/层数。原始引擎输出、外部错误与用户内容保持。
- 新增 6 项检查，覆盖三语言同实例 getter 从创建后的设置读取语言、健康/加载/停止、认证头与模型/中文用户请求和输出一致、无效请求在 HTTP 前拒绝、密钥脱敏/原始 EACCES 保留和仅停止自有子进程，以及真实临时向量/日志的大小/hash/层证据和字节不变。既有向量 overlay 测试仅显式补验新增翻译函数参数，原路径、模式和层数断言不变。
- focused 七文件 120 项及 typecheck 通过，日志 temp/localization-strata-runtime-focused.log。npm.cmd run verify 通过：310 个单元文件 / 2990 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查，日志 temp/localization-strata-runtime-verify.log；进程级 VITEST_MAX_WORKERS=8，未放宽既有超时/行为断言。LAN 入口 623.95 kB，已有 500 kB 体积提醒保留；计数包含同期独立任务。新测试以受控 HTTP/进程替身和临时文件验证协议；没有启动真实模型、GPU、软件/权重下载或真实用户目录清理。
- 新生成的消息按 getter 当前语言格式化，不批量改写已有日志或历史 snapshot 字符串。owner 的准备/互斥外层消息、模型准备、Agent 入口及 core 资源/token/stream 校验仍待后续，不能将本批称为全部 Strata 链路完成。同期 H3 Refiner、菜单与 CSS 变化均为独立任务，未编辑或回退。

## 第二十七批：Strata 准备调度、模型校验与 MTP

- owner 的准备/复用、上下文/资源阶段、内存策略说明、模型身份、互斥/停止/退出保护，模型文件大小/哈希、policy/config/receipt/pack/tokenizer 完整性、准备目录保护、兼容 pack 升级与 MTP 离线准备固定消息接入三语言，共 76 个语义键。owner 沿用保存设置 getter；纯 helper 增加可选 Translate，默认简体；服务启动和缓存验证向下传递翻译。prepare/run 选项仅在内存内传递 uiLocale，用于共享子进程错误包装，不写入模型配置、receipt、缓存 key 或协议载荷。
- 保留已选文件/模型身份、大小/hash/mtime/ctime、parser 与 PLE 检查、CPU 转换/pack 命令、MTP 工具/vocab/dense 索引与张量校验、准备互斥、路径保护、兼容升级条件、临时输出保留、取消恢复、资源准入与模型生命周期。自定义 verifyAsset 保持原调用参数；默认校验器通过闭包接收语言。原始外部诊断、路径、技术字段、组件元数据和用户内容保持。
- 新增 5 项检查：三语言准备命令完全一致、子进程包装收到语言；切换语言后三次发现命中同一 config，不重新哈希/转换，原模型字节和 config/receipt 字节不变且无 uiLocale 字段；修改 pack 后按原保护拒绝。真实小 GGUF 的大小/hash 错误与 MTP record/tool 缺失返回英文/繁体，源文件不变且不调用工具、不创建 pack。owner 创建后切换语言，繁忙拒绝→空闲恢复→同 PID 拒绝重启/软件修改/错模型→正常 shutdown 后拒绝新操作，原保护顺序与子进程归属保持。测试沿用现有小文件夹具，在 finally 恢复测试 catalog 大小，不改生产 catalog 或校验条件。
- focused 八文件 182 项及 typecheck 通过，日志 temp/localization-strata-preparation-focused.log。npm.cmd run verify 通过：310 个单元文件 / 2995 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查，日志 temp/localization-strata-preparation-verify.log；进程级 VITEST_MAX_WORKERS=8，没有放宽既有断言、超时或测试配置。LAN 入口 638.33 kB，原有 500 kB 提醒保留；计数包含其他任务的既有改动，不作为本地化覆盖率。
- 本轮未编辑长视频专属实现、PLAN 或测试。准备/进程/转换采用测试替身和临时文件，未下载模型、运行真实 pack 工具、启动 Electron/ComfyUI/GPU 或改动用户媒体；afterEach/finally 清理自有测试文件。既有菜单/CSS、H3 Refiner 与前批修改均保留。

## 第二十八批：Strata 核心保护

- token 预算、SSE 完整性/顺序/截断、资源准入与 GPU 底线、持续严重提交不足保护、资源探针重试失败接入三语言，共 29 个语义键。纯核心 helper 接受可选 Translate，默认简体；共享服务传入当前语言，保留自定义探针/保护 callback 原参数。没有改 tokenizer 计数、上下文/输出限制、stream stop/DONE 协议、资源门槛、探针次数/等待及持续压力计时。
- 英文/繁体新增回归比较准入计划和自动输出预算相同；超限原输入不截断，逐字符 SSE 保留中文用户输出，诊断仅存计数，终态后输出与 length 仍拒绝；10 秒严重 commit 保护、缺口重置、2GiB GPU 底线及三次探针失败/定时器清理均保持。

## 第二十九批：环境维护提示

- 通用命令/CUDA/NVIDIA/服务扫描状态、核心版本来源、Depth Anything 维护保护、节点卸载后手动重启提示，以及兼容保留的 llama-server 安装与 LM Studio 探测/启动 helper 接入三语言，共 35 个语义键。路径、版本、驱动输出及外部原文保持，不改安装命令、资产来源、选择安装或重启规则。兼容 LM Studio helper 没有重新开放产品入口。
- 环境扫描的内存缓存/合并身份纳入 uiLocale，避免语言切换复用旧提示；不新增持久化字段或改变软件/模型缓存身份。英文/繁体远程 Depth Anything 拒绝分支在网络/本地准备前返回当前语言，设置和日志不变；普通探针及安装成功分支没有新增真实软件验收。

## 第三十批：生成提交包装与上传语言

- 视频/续写/放大与图片提交的固定校验包装、缺节点恢复、Prompt ID、参考媒体上传标签、图片运行时节点/输入兼容错误接入三语言，共 44 个语义键；submitTask/submitImageTask 向 jsonRequest、uploadInput 和共享保护传入当前语言。保留旧默认简体 helper 调用；未改图构建、采样、上传表单、client/prompt 身份、前缀保护和提交顺序。
- 三语言受控提交比较 graph/请求正文完全一致，保留中文用户提示词、输入文件字节及 task 快照；缺工作流在 HTTP 前拒绝，图片缺必要节点/不兼容输入仍拦截，DynamicCombo 点分输入仍通过。仅使用临时文件和 fetch 替身，不作为真实 UI 按钮/入队或模型生成证据。
- focused 15 文件 331 项及 typecheck 通过，日志 temp/localization-28-30-focused.log；新增三文件 7 项检查。npm.cmd run verify 通过：313 个单元文件 / 3003 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查，日志 temp/localization-28-30-verify.log。进程级 VITEST_MAX_WORKERS=8，未改既有断言/超时/测试配置；desktop 入口 474.36 kB、LAN 入口 657.61 kB，已有 500 kB 提醒保留。计数包含同期独立改动，不作为本地化覆盖率。
- 本轮未启动 Electron、ComfyUI 或 GPU，未下载软件/模型或操作用户媒体，自有测试文件/定时器已清理。长视频专属实现/PLAN/测试没有新增修改；其他任务的菜单/CSS、NAS 和 H3 Refiner 改动保持。真实安装/扫描状态、提交按钮可达、实际输出及长文本布局仍未新增验收。

## 第三十一批：H3 运行时 schema 与图片可用性

- h3ComfyWorkflowRuntimeIssues、h3ExecutionNodeRuntimeIssues 及内部输入检查接入 15 个三语言语义键；submitTask 传入当前 Translate，默认简体旧调用保持。节点 class_type、输入/输出类型、枚举和数值原样插值；没有改 AV workflow 类别、所需节点/schema、DynamicCombo 点分输入、Attention 支持值、去重或错误返回形状。静态 validateH3ComfyWorkflow 仍待处理。
- 图片模型不可用原因接入 3 个语义键，接受可选 Translator 并用其 locale 获取已有模型名称；原生入队及 submitImageTask 使用保存设置语言。退役 H3/局部融合的旧记录继续可读，默认简体 factory 调用兼容；没有恢复退役适配器、改队列/历史或修改模型 catalog。各图片 adapter 的 compile/build/validate 固定诊断仍待处理。
- 新增 6 项检查：英文/繁体 schema 两类故障及恢复、workflow/schema 输入不变、无效 object_info 和精确 class_type 保留；submitTask 的嵌套执行错误确实使用当前语言并在 POST 前拒绝；退役图片在入队/执行前拒绝，不触发网络/状态写回，未知模型 ID 中的中文保持。focused 7 文件 62 项通过，日志 temp/localization-31-focused.log。最终 npm.cmd run verify 通过：316 个单元文件 / 3035 项、7 个集成文件 / 127 项、typechecked 生产构建和 440 对对比度检查，日志 temp/localization-31-final-verify.log；进程级 VITEST_MAX_WORKERS=8，LAN 入口 661.21 kB，既有 500 kB 提醒保留。数字包含同期其他任务，不作为本地化覆盖率。
- 初次 focused 的两份服务测试在 logger 初始化时遇到系统共享临时目录旧日志 EPERM，未进入测试。随后通过进程级 TEMP/TMP 指向本任务 temp/localization-31-tmp 隔离，focused 通过；但首次全量在该仓库盘临时目录中出现 NAS/资料迁移八项超时及超时后的 ENOTEMPTY 清理错误，日志 temp/localization-31-verify.log。改用系统临时盘下本任务独立目录后，失败两文件 26 项原断言通过，日志 temp/localization-31-storage-recheck.log，再执行全量。没有删除共享旧日志、修改生产日志规则、放宽超时/断言或跳过失败测试。
- 未启动 Electron、ComfyUI/GPU、安装软件或下载权重；测试只使用自有临时文件和 fetch 替身，不作为真实按钮/生成或视觉审校证据。两处自有临时根在全量结束后核对准确绝对路径并清理，保留 temp 下的验收日志；共享旧日志保持。既有其他任务改动保持；当前磁盘版本已由其他工作推进至 0.67.5，本任务没有执行版本更新。

## 集中收尾：工作包 1、2（H3 静态校验与图片适配器）

- H3 静态节点、引用/output、artifact 与提示词占位、普通 Continuum/managed Extend、bilinear/learned/ultimate 二采约束接入可选 Translate，调用链透传；1080p 入队预检和提交传入保存语言。未改任何节点/引用/枚举/时间网格条件，也未改长视频 director 专属代码或模型指令。
- Qwen 2511、Qwen 2.1 official/Turbo/GGUF/Q6、FLUX.2 Klein、HiDream、OmniGen2、Z-Image/Turbo、LaMa、BiRefNet、MOSS 两模型的编译/构图/校验、自有 runtime schema 和共享 Picture/Canvas/尺寸诊断接入三语言；ImageModelAdapter 在原参数后增加可选翻译，校验绑定保留原 recipe 位置。renderer 比例/分辨率选项、原生入队/提交和 Tessera 可选 Qwen anchor 传入当前翻译；旧简体调用兼容。LoRA 通用保护也传入翻译，模型/LoRA 名称和 pictureRoles 元数据按契约保持原文。
- 共 155 个语义键（含共享选项和调用包装），不作覆盖率。源码盘点后，本轮目标文件中只余必须保留的中文 Picture 引用识别正则；capability/运行管理元数据按契约不纳入普通 UI 翻译。模型正文、可见中文用户内容、Picture 编号映射、节点图/采样/尺寸/seed、固定文件路径、队列快照和校验决策均保持。
- 新增 24 项有行为断言的检查：14 个 adapter 三语言图/编译输出与 task 不变、缺节点及 schema 错误同样拦截；6 个共享 H3 工作流原图通过/破坏后相同拒绝，错误保留技术标识；选项值保持、空 Picture/未知 LoRA 原始名称、真实 submitImageTask 调用在 upload/POST 前返回当前语言。既有 focused 10 文件 150 项通过，日志 temp/localization-workflows-focused.log；新增原生提交两项随最终全量通过。
- npm.cmd run verify 完整通过：319 个单元文件 / 3078 项、7 个集成文件 / 127 项、typechecked 生产构建及 440 对比度检查，日志 temp/localization-workflows-verify.log。进程级 VITEST_MAX_WORKERS=8、独立系统临时根，未放宽断言/超时或配置。LAN 692.23 kB，既有 500 kB 提醒保留。后续只精简 5 条新增英文选项，另做相关 focused 3 文件 48 项及 typechecked build，见 temp/localization-workflows-label-check.log、localization-workflows-final-build.log；最终构建再次通过三语言真实 UI 检查，未据此重复全部 GPU/运行测试。
- 实际 Electron 隔离 fixture 经真实 Settings 语言 select/change 与保存按钮，切英文/繁体/简体，实际导航图片模式读取比例/尺寸选项，值相同且无页面横向溢出，queue/history/imageHistory 保持，Prompt unloaded/idle。报告 temp/create-smoke-8s67uk/localization-workflow-ui.json，英文截图已查看；发现新英文 source 选项过长后缩为 Source · After Upload。初次脚本未等待 Settings 完整保存就导航，触发保护确认；脚本等待 is-clean 后三语言通过，未改生产导航/保护。早先自有 Electron 已退出，复核后仅 resume 同一 fixture，未干预其他进程。
- 未运行真实模型或 GPU、未下载/安装资产、未操作用户媒体。现有 cleanup helper 请求关闭，报告同目录 localization-workflow-cleanup.json，最终自有 PID 96544，CDP 12105、测试 ComfyUI 19818 已复核无监听；该 helper 不证明原生关闭生命周期。此次不修改 NAS 服务/网页或部署包。

## 集中收尾：工作包 3（队列、放大、环境与恢复入口）

- 视频/图片/普通续写入队、参考媒体缺失、模型/节点/LoRA 保护、原生 1080p 与 Learned 3D 预检、DLSS provider 预检、队列编辑/排序/暂停边界/取消清理保护接入三语言。QueueEnqueueService、QueueMutationService 与素材库 service 在消息产生时读取保存语言；纯任务工厂增加末尾可选 Translate，原生入口显式传入完整词典。不改原有校验决策、入队快照或错误类别。
- H3 Refiner、Tessera 和 SeedVR2 自有构图诊断，以及 Refiner/Tessera 几何、源时长校验接入翻译；对话框、controller、队列编辑、工厂和 renderUpscaleWorkflow 向下透传。保留节点图、attention、采样/seed、音轨、尺寸/帧数和 optional Qwen anchor 冻结身份，不将普通续写与长视频专属代码混为一项。
- 环境完整/依赖扫描的安装类型、数据目录固定包装、三类 DLSS provider 的就绪证据及阻塞说明、Depth Anything 离线准备状态接入三语言。扫描判断、六文件校验证据与版本/hash 标识、远程连接限制、原始外部诊断、运行管理元数据和旧技术匹配保持；未新增下载/安装或更改 schema 门槛。
- 原生选择资料库恢复的四条直接保护接入保存语言，复用已有资料迁移词条；继续保留 StateRecoveryError、锁、备份、完整库校验及原子切换。底层 StateFileSafety/LibraryRecordStore 等自己的错误尚未全部处理，不能据此称资料恢复链路全部完成。旧“无需 Prompt”仅经 promptVersionDisplayLabel 翻译，持久化标签和其他自定义标签不变。
- 本轮共 206 个三语言语义键（含 1 个显示标签），不作为完成率。新增两文件 12 项行为检查：已有 service 切语言后报错、拒绝前无写回、素材操作互斥/运行中保护及恢复；Refiner/Tessera 图和冻结 task 跨语言相同、嵌套源/缺节点拒绝；真实临时输入字节保持；Depth Anything 缺输入→用户提供小文件→可用但未 runtimeVerified；资料库拒绝后原数据不变、空目录恢复保留完整状态；旧标签显示不改 snapshot。均为隔离文件/受控服务测试，不作为 GPU、真实原生对话框或按钮入队证据。
- focused 最终队列/放大/素材/对话框/生产 DOM 旅程 12 文件 208 项通过，日志 temp/localization-services-final-focused.log；环境/恢复/语言资源等 7 文件 138 项通过，日志 temp/localization-services-environment-focused.log，二者有重叠，不相加作总数。类型检查通过。初次新测试用了允许 T2V 的 H3 无图草稿、提前触发共同 Refiner 保护的 Tessera 夹具，已纠正夹具以触发预定保护；没有为测试修改生产门槛。
- 最终 npm.cmd run verify 的单元层为 320 文件通过、1 文件失败；3090 项通过、1 项失败。剩余是 tests/nas-commit.test.ts 的 late cover 用例，在 readNasObject → confinedFile 报 File outside library root，单独复查仍复现；该文件有独立任务未提交改动，本轮未编辑或覆盖其实现/断言，不跳过该项、不报告 verify 全绿。较早的 queue-controls 替身缺 getSettings 导致两项失败，已补齐替身接口，原清理保护断言保持并通过。最终日志 temp/localization-services-closure-verify.log；此前复查见 localization-services-recheck.log。
- verify 在单元失败后提前退出，其余集成 7 文件 127 项、typechecked build 和 440 对比度检查单独执行均通过，最终结果见 temp/localization-services-closure-integration.log、localization-services-closure-build.log、localization-services-closure-contrast.log；LAN 入口约 731 kB，已有 500 kB 提醒保留。未放宽超时、修改测试配置或使用跳过项凑通过；只用进程级 VITEST_MAX_WORKERS=8 与独立系统临时根隔离。所有检查结束后核对准确绝对路径并清理本任务系统临时根，保留仓库 temp 下的验收日志；最终 diff --check 通过。
- 已运行 guide upscale 和 guide assets。未启动 Electron、ComfyUI/GPU，未下载软件/权重，未操作用户媒体；本轮不新增实际按钮→task ID、真实扫描/原生恢复窗口或视觉布局验收，留在工作包 4/6。NAS 服务/网页/部署包未修改；独立 NAS TASK/测试改动均保留。

## 工作包 3 补充：底层素材库消息链路

- src/infrastructure/image-asset-library.ts 的扫描/归档/校验/保存/清理进度，缺图、哈希校验/复制/冲突及清理时队列启动保护共 10 条三语言语义键接入可选 Translate。ImageAssetLibraryFileSystemPort 保留原参数位置，在末尾接收可选翻译；service 使用当前保存语言，native adapter 原有函数绑定直接透传。视频/图片/普通续写的归档调用也传入当前翻译，不修改长视频专属代码。
- 不改源文件/内容哈希/归档文件命名、复制校验和 rename 顺序、引用去重/更新范围、进度 phase/current/total、实时已提交引用重检、同步删除保护及清理范围。原始文件名、路径和系统异常保持。旧 helper 调用继续默认简体，没有在 IPC 或持久化快照加入语言字段。
- 新增 7 项真实隔离文件检查：同一 service 连续切三语言，经默认 native port 扫描→归档→清理，原图/受引用归档保护、共享路径身份与哈希一致；三语言缺图/损坏归档继续拒绝，不改原图、坏档或输入引用；service 预检后队列启动，底层按当前语言停止清理并保留孤儿文件。另有既有新增引用竞争保护测试保持。两处旧端口 mock 断言只增加翻译函数参数，原状态/事件断言保持。
- focused 8 文件 109 项及类型检查通过，日志 temp/localization-asset-pipeline-focused.log、localization-asset-pipeline-typecheck.log。新增检查不依赖真实模型/GPU，不作为真实原生窗口或清理按钮可达证明。已运行 guide assets；无 Electron/ComfyUI 启动、软件/权重下载或用户媒体操作。NAS 服务/网页/部署包及独立 NAS 文件均未改。
- 最终 verify 的单元层 321 文件/3097 项通过，仍只有独立 NAS late cover 用例的 File outside library root 失败（共 322 文件/3098 项），没有跳过或覆盖该文件，不能称全量通过。因 verify 提前中止，另跑集成 7 文件/127 项、typechecked build 与 440 对比度检查，均通过；LAN 733.40 kB，已有 500 kB 提醒保留。证据 temp/localization-asset-pipeline-verify.log、localization-asset-pipeline-integration.log、localization-asset-pipeline-build.log、localization-asset-pipeline-contrast.log。进程级 VITEST_MAX_WORKERS=8，未改配置/超时；最终 diff --check 通过，准确路径复核后已清理自有系统临时根，仓库 temp 验收日志保留。

## 工作包 3 补充：资料文件、记录库和用户资料迁移

- state-file-safety.ts、library-record-store.ts、user-data-migration.ts 与 JsonStore 的 50 条固定诊断接入三语言，覆盖资料结构/身份、未来 schema、备份、候选读回、写入排他、内容地址/不可变对象/文本/提交校验、迁移目录冲突及原件/备份/辅助文件保护。保留 StateRecoveryError、ErrorOptions.cause、LVS_LIBRARY_DESTINATION_* 前缀、技术集合名/hash/文件路径、JSON/文件系统原始异常；未将内部 Transient state is unavailable 开发契约错误当普通 UI 文案。
- 启动安全层从同一次已解析的资料对象恢复语言后校验，选用已验证备份恢复时也读取其语言；无法恢复语言时保留默认简体。JsonStore 的打开/恢复前禁写包装沿用安全层语言，正常写入使用当前设置。记录库经可选内存 getter 跟随 LibraryStateStorage 当前事务语言，恢复入口、候选文件和迁移日志也透传翻译。UserDataMigration 在验证迁移日志前只读恢复语言，prepare 不重复读取上下文。
- 不改记录/manifest/backup/journal 格式与内容寻址、缓存/无变化提交、源/备份校验、未来版本不降级、写锁/lease 范围与释放、候选写入/读回/原子替换、备份保留、迁移提交和原件清理条件。校验函数复用已解析值，避免仅为语言新增一次完整 JSON 解析；新语言状态仅留内存，不进入持久化或哈希。业务端冲突判断仍按稳定标识/错误类型，未发现依赖这些英文正文的控制匹配。
- 新增 7 项真实隔离文件检查：三语言启动拒绝从保存设置获取语言，嵌套 cause/集合技术名保持、禁写且无空配置；有旧备份也不覆盖未来 schema；同一记录库切换语言，长中文文本/未知字段、对象文件字节、hash、无变化提交及冲突 marker 相同，坏记录按当前语言拒绝且不覆盖；三语言在验证坏迁移日志前取得语言，校验失败保留全部原件/备份，恢复源字节后按原流程完成。既有测试仅将英文固定消息断言换为对应默认简体说明，文件/类型/计数/异常码断言及超时保持。
- focused 10 文件 159 项通过，日志 temp/localization-storage-focused.log；随后去除重复解析/上下文读取，相关 4 文件 92 项和 typecheck 再通过，日志 localization-storage-read-check.log、localization-storage-typecheck.log。初次 focused 16 个失败均为默认提示从英文转为简体后的旧消息断言，未通过删断言、放宽保护或跳过测试处理。
- 已运行 guide library-storage；没有启动 Electron/ComfyUI/GPU、下载或操作用户资料，所有物理文件验证均位于自有系统临时根。没有新增真实原生错误窗口、选择资料库/迁移按钮或重启 UI 证据，不推广为工作包 4/6 已验；NAS 服务/网页/部署包和独立 NAS 修改保持。
- 最终代码状态完整 verify 的单元层为 322 文件/3104 项通过、1 文件/1 项失败（共 323 文件/3105 项）；仍是独立 tests/nas-commit.test.ts 的 late cover 路径校验 File outside library root，没有跳过或修改该项，不报告 verify 全绿。verify 提前退出后另跑集成 7 文件/127 项、typechecked build 与 440 对比度检查均通过。日志 temp/localization-storage-final-verify.log、localization-storage-final-integration.log、localization-storage-final-build.log、localization-storage-final-contrast.log；LAN 742.09 kB，既有 500 kB 提醒保持。进程级 VITEST_MAX_WORKERS=8，无超时/配置放宽；最终 diff --check 通过，所有检查结束后核对准确绝对路径并清理本轮系统临时根，保留仓库 temp 验收日志。

## 工作包 3 补充：放大 provider 与 SeedVR2

- DLSS5、AetherScale、Konohamaru 参数/目标规范化、数值范围、冻结尺寸、object_info schema、API 图/连接/输入/输出保护共 120 个语义键接入三语言；固定说明翻译，节点/输入/枚举/版本/hash/输出索引仍原样。纯函数末尾增加可选 Translate，内部链路透传，旧调用默认简体；结构化结果字段和技术标识数组保持，不改 schema/图校验条件。
- 补齐 SeedVR2 分段规划、提交/等待/进度包装、完成/合并及缺输出/检查点保护，并补齐文件名参数、队列图片复制兜底和 History 缺父作品错误，本轮合计 137 个三语言键。入队、编辑、任务工厂、执行预检/构图、分段计划、History/AV 收集、队列卡片/编辑回流和放大对话框传入当前语言。SeedVR2 是现有普通放大链路，不修改长视频 director 专属实现或交接计划。
- 保留 graph/client 提交载荷、模型/源作品版本身份、options 冻结、输出尺寸、采样/seed、帧率、分段计划/检查点、FFmpeg 命令与原音轨、文件名/重复编号、进度数值与旧历史兼容。新阶段消息使用操作语言，原始子阶段文字保持，不批量回写旧诊断或 stage；不新增持久化语言字段、节点/软件安装或 GPU 启动。
- 新增 15 项有行为断言的检查：三个 provider（含 Konohamaru 有/无补帧）的图/快照跨三语言一致；缺 schema 的技术节点身份、坏连接和冻结尺寸继续拒绝；真实原生执行预检在 HTTP/准备前返回当前语言，队列错误编辑不写回；命名与重复编号不变、History 缺父作品不创建派生记录。受控 SeedVR2 提交/等待替身验证三语言阶段、原始子阶段与数值进度、首段请求身份和缺输出时不接受检查点。不执行真实模型/FFmpeg，不作为真实分段成片或按钮可达证据。
- 将既有 DLSS5/Konohamaru schema 原样提取为 tests/fixtures/upscale-object-info.ts，原测试与新检查共用同一份夹具；AetherScale 继续用现有应用 v0.5.5 fixture。未删 schema/graph/边/输出断言，六项旧测试首次失败属于默认英文说明转简体，改为对应具体说明后通过；新测试的英文 do/does 语法匹配及 SeedVR2 合法目标夹具已核对，不改生产校验配合测试。
- focused 15 文件 215 项与 typecheck 通过，日志 temp/localization-upscale-checks-focused.log、localization-upscale-checks-typecheck.log。已运行 guide upscale；未启动 Electron、ComfyUI/GPU 或下载软件/权重，未操作用户媒体。renderer 仅传递翻译、不改 DOM/交互门槛；真实正常/错误窗口、按钮→task ID 和布局仍留在工作包 4/6。NAS 服务/网页/部署包及独立 NAS 改动保持。
- 最终 verify 单元层 323 文件/3119 项通过，仍只有独立 NAS late cover 用例在 readNasObject → confinedFile 的 File outside library root 失败（共 324 文件/3120 项）；未跳过、覆盖该文件或报告全量全绿。verify 提前退出后，另跑集成 7 文件/127 项、typechecked build 与 440 对比度检查均通过。证据 temp/localization-upscale-checks-verify.log、localization-upscale-checks-integration.log、localization-upscale-checks-build.log、localization-upscale-checks-contrast.log；LAN 765.27 kB，既有 500 kB 提醒保留。仅进程级 VITEST_MAX_WORKERS=8，无配置/超时放宽；最终 diff --check 通过，准确绝对路径检查后已清理本轮自有系统临时根，仓库 temp 验收日志保留。

## 工作包 3 终查：执行、恢复与旧标签

- 新增 71 个三语言资源：队列恢复 21 个、执行/隔离/图片批次/显存停滞/H3 双遍和普通续写阶段 39 个、共享工作流错误 8 个、旧出厂标签 3 个。主进程沿保存语言格式化新消息；纯工作流 helper 末尾增加可选 locale，保持默认简体。原始运行阶段/恢复诊断、技术节点和 reason ID、模型正文、重试次数/回退顺序/暂停与任务身份均保持，不回写旧 stage/error。
- 普通 Continuum 首帧/Timeline 保护、JointAV serializer 与 PDD 构图错误传递当前语言；H3 新策略拒绝补齐翻译，旧 Attention 读取器现有 locale seam 已回归。workflow-ipc 的无 locale 校验仅用于布尔能力判断、不展示错误；内置 workflow 的原始 label 是元数据，Create 已在显示层翻译摘要，保持磁盘值。长视频专属调用仍按用户要求延期。
- “新建”“手动编辑”“扩写 N”“图片优化 N”及对应已发布英文/繁体标签只在显示层识别；复用既有图片优化资源，自定义标签/近似拼写/零或前导零编号保持字面值，不改历史、草稿、编号或版本创建规则。
- 新增 15 项行为回归：三语言 CUDA 回退和重试耗尽、恢复失败原文、取消及过期清理拒绝；合法 Timeline/serializer 图跨语言一致，非法正文和旧 Attention 分叉仍拒绝；旧标签显示不改变数据。执行器另验真实生产队列函数的两张图片身份/进度包装、运行时隔离失败不提交/不产生 History、worker 释放。只用受控进程/提交/输出替身，不作为真实按钮、ComfyUI 或生成证据。
- focused 10 文件/217 项与 typecheck 通过，证据 temp/localization-terminal-focused.log、localization-terminal-typecheck.log；已运行 settings-runtime guide。终查发现 electron/services/extension-media.ts 的上下文/边界帧提取、Prompt 增强源/裁剪检查及 Continuum 拼接帧数仍有 10 处固定诊断未接语言，需连同调用者在本包补齐；不能因此报告工作包 3 完成。
- 最终 verify 单元层共 325 文件/3135 项，324 文件/3134 项通过；唯一失败仍是独立 NAS late cover 用例在 readNasObject → confinedFile 的 File outside library root，未跳过或编辑该文件。verify 提前退出后另跑集成 7 文件/127 项、typechecked build 和 440 对比度检查均通过，证据 temp/localization-terminal-verify.log、localization-terminal-integration.log、localization-terminal-build.log、localization-terminal-contrast.log。LAN 776.34 kB，已有 500 kB 体积提醒保留；仅进程级 VITEST_MAX_WORKERS=8，没有放宽断言/超时/配置。本轮未启动 Electron/ComfyUI/GPU、未安装或下载软件/权重、未操作用户媒体或改 NAS 包；长视频专属实现保持。全部检查完成后核对绝对路径并清理自有系统临时根，保留仓库 temp 验收日志；最终 diff --check 通过。

## 工作包 3 收尾：普通续写媒体底层

- extension-media 的上下文/边界帧/运动音频提取、Prompt 增强源文件与裁剪保护、边界帧回退失败及嵌套 cause、Continuum 拼接帧数错误共 11 个资源接入三语言。纯媒体 helper 末尾接受可选 Translate、旧调用保持默认简体；ComfyUI 提交、QueueExecutionSideEffects 合并、两类 PromptApplicationService 增强和 Strata 参考视频抽帧透传当前翻译。自定义 prepareFrame 仍收到原来三个参数，模型指令、Picture/Video 编号及用户正文不翻译。
- 不改 FFmpeg/ffprobe 命令、裁剪/回退时间和顺序、帧预算/校验门槛、外部错误 cause、临时目录或复制/替换/回滚规则。新增 8 项行为回归，覆盖三语言默认增强适配器的缺源拒绝→恢复、请求不变和清理；裁剪越界在解码前拒绝、七次边界帧尝试的准确时序及原始错误；空上下文输出跨语言同命令；帧数错误/不可读在替换前拒绝并保留源与生成文件，恢复后按相同命令完成替换。新文件使用受控子进程和隔离物理小文件，不把合成内容称为可播放成片。
- focused 7 文件/102 项和 typecheck 通过，证据 temp/localization-extension-focused.log、localization-extension-typecheck.log，已运行 guide extend。既有 prompt-extension-media 三种模型的真实 FFmpeg 合成视频回归也通过，继续保持两轮拼接的 698/1034 帧；这是媒体处理证据，不是模型生成或真实 UI 按钮证据。首次 focused 仅有一处数学等价表达的浮点尾差导致三语言失败，改用 12 位精度数值断言，未改生产回退时间或放宽保护。
- 已复核此模块全部生产消费者，主 App 调用均传递保存语言，本模块不再有固定中文诊断。此处关闭工作包 3 的已定位代码接线范围；真实页面漏翻仍由工作包 4 捕获，译文和布局由工作包 5/6 验收，不能将此状态推广为全应用验收完成。NAS 服务/网页/部署包、长视频专属实现及独立任务改动保持。
- 最终 verify 单元层共 326 文件/3143 项，325 文件/3142 项通过；唯一失败仍是独立 NAS late cover 用例的 File outside library root，未跳过或修改。另跑集成 7 文件/127 项、typechecked build、440 对比度检查均通过，日志 temp/localization-extension-verify.log、localization-extension-integration.log、localization-extension-build.log、localization-extension-contrast.log。LAN 778.45 kB，已有 500 kB 体积提醒保留；仅进程级 VITEST_MAX_WORKERS=8，无超时/配置放宽。未启动 Electron/ComfyUI/GPU、下载模型或操作用户媒体；全部检查完成后核对准确绝对路径并清理本轮系统临时根，仓库 temp 日志保留。最终 diff --check 通过，版本保持 0.67.6，未提交或发布。

## 工作包 4：主 App 有内容页面与状态（部分完成）

- 用户澄清独立 NAS Browser 不需要翻译，已修正 PLAN 与本 TASK 的范围；不改其实现/部署包，不将独立工具失败当作本地化待办。主 App 的局域网浏览是另一条实际产品路径，继续保留验收。
- 新建 temp/create-smoke-fIlcs7 隔离 Electron fixture：独立 userData/资料库/日志、空闲专用 ComfyUI/CDP 端口，以 FFmpeg 合成 2 秒测试图案视频和单色 PNG；经现有生产工厂/History 持久化 helper 构造两条视频（含缺文件与双版本）、一个图片项目和 waiting/failed/cancelled 三条停止任务。未复制用户媒体，不启动队列/模型。使用现有 launch/close/resume 桥接和真实鼠标事件；不替换 window.studio 或 renderer。
- 真实检查发现英文 Settings 显示中文“核心版本低于 H3 最低支持版本”，Queue 徽标 title 显示中文“当前未连接”。新增 9 个三语言资源，evaluateMiniMaxH3CompatibilityState 接受可选 Translate 并由扫描传入；ComfyRuntimeStateController 的探测消息接受翻译，performance IPC 传入操作语言。保留版本/已知风险判断、探测两次失败迟滞、app-owned 活跃任务保护、operationId/旧操作拒绝、ownership、外部 message 和已存日志，不新增持久化/公共 IPC 字段。运行管理元数据及技术描述按契约保留。
- 新增 6 项三语言行为回归，覆盖兼容性各状态/原版本号与已知风险规则不变，探测的 starting 权威、running→ready、degraded→stopped→ready、归属/操作号和原始外部错误保持。旧 IPC 测试仅补验翻译参数，保留活跃 Prompt 与 listener ownership 断言；focused 5 文件/43 项和 typecheck 通过，日志 temp/localization-populated-focused.log、localization-populated-typecheck.log。
- 新构建中按保存/切换语言→等待保存完成→实际扫描→稳定状态检查，三语言各 22 个组合（66）：Settings 的 11 个标签、停止 Queue 的 waiting/failed/cancelled、视频/图片 History、两个菜单、正常视频解码详情、缺文件播放错误、放大对话框、图片详情与大图、Create。另在三语言检查续写/图片编辑/图生视频三模式与 Prompt 方法菜单，18 个组合。语言名称始终是三种自称；扫描版本阻塞和 Queue 悬浮提示在三语言复验通过。两轮前后深比较 queue/history/imageHistory 完全一致，USER_TEXT_中文提示词/原始错误保留。后台 focus emulation；正常合成视频 readyState≥2、图片可见，截图人工复核英文视频/图片详情和繁体放大弹窗。
- 证据：fixture 内 populated-review.json（66）、populated-modes.json（18）及对应截图；temp/localization-populated-review.log、localization-populated-modes.log。所有组合检查页级横向溢出为 false，但不代替工作包 6 的长文案/支持视口验收。英文详情的 Copy file、Continue creation 等动作大小写及图片模型值省略仍留工作包 5/6；元数据和原始日志中的中文不机械替换。本轮仅查空输入/禁用/菜单和现有内容，未新增按钮→task ID 或 GPU 生成证据，不能将上述状态推广为所有功能路径通过。
- 自动化初次遇到正在扫描的 Queue 初始化提示、语言保存尚未结束的导航保护和鼠标悬浮遮挡；改为等待真实保存/扫描稳定、移开指针后再实际点击，最终两轮报告均通过。未移除 disabled、调内部 handler、绕过保存保护或放宽生产门槛。
- 最终 verify 单元层 326 文件/3149 项中 325 文件/3148 项通过；仍只有既有独立 NAS late cover 用例 File outside library root 失败，未跳过或修改。另跑集成 7 文件/127 项、typechecked build、440 对比度检查通过；日志 temp/localization-populated-verify.log、localization-populated-integration.log、localization-populated-build.log、localization-populated-contrast.log。LAN 780.03 kB，已有 500 kB 提醒保留。进程级 VITEST_MAX_WORKERS=8，无超时/配置放宽。版本保持 0.67.6。
- 资源收尾：每次 launch/resume 均经现有 close-fixture helper 关闭；最终 runtime 为 stopped/unknown、没有 app-owned ComfyUI。已复核本轮三个 Electron PID 和专用 CDP/ComfyUI 监听退出，准确绝对路径检查后清理自有系统测试临时根；fixture、报告和截图保留以便续验。JS 关闭只用于 Harness 清理，不算原生窗口退出验收。最终 diff --check 通过，无意外删除、版本更新、提交或发布。

## 用户停止真实检查后的源码收尾

- 用户指示前尝试原生窗口检查，node_repl/Computer Use 启动报 helper_unknown_error，另一原生入口也未能启动；没有实操系统菜单或文件对话框。App 局域网浏览仅在自有 fixture 从 Settings 启动监听，浏览器导航期间的文档初始化竞态使脚本提前退出，不能算三语言网页已验。用户要求停止后未重试；已通过保存自有 fixture 的 lanBrowserEnabled=false 关闭监听，再用既有 close-fixture helper 关闭 App。复核本轮 profile 的 Electron 进程及 CDP/网页/ComfyUI 端口均退出，未杀其他任务进程、改用户媒体或启动模型。
- 审校英文动作文字 164 条，覆盖 Create/Queue/History/Settings/共享弹窗/App 局域网浏览及 Settings 独立文案包。按具体用途统一 Copy File、Add to Queue、Save Settings、Move Up 等；保留说明句、禁用原因、状态、图片 alt 和元数据的句式，不机械把全部资源改为标题式。统一 Resume Queue，精简 Install、Create Video、Continue Editing、Enlarge、Manage Assets，修正 Stop Tasks and Exit，避免误导为等待生成完成。启动/重启明确为 ComfyUI，崩溃按钮明确打开目录；这四类标签同步简繁体。实际 handler、队列恢复与持久化字段均保持。
- 根据现有 220px Settings 侧栏及图标/计数占位，在资源层缩短 ComfyUI、Performance、Dependencies、Prompt Models、Logs 等英文导航；同步 59 条资源/引用（含这些标签），避免错误仍引导到旧名称。保持 Settings tab ID、布局和 CSS，不加解释或重设计。技术模型名、节点/文件标识、用户正文和运行管理说明按契约保留；没有改独立 NAS 工具。
- 源码复核发现 main.ts 退出过程标题仍硬编码中文，补齐一个三语言键并按保存语言格式化，logger-only 文本保留。History 两个版本导航 aria-label 原来直接拼接 PreviousVersions，改为两个独立三语言键；10 处导航/卡片 title/aria-label 的全角静态分隔统一为中性间隔点，用户标题仍经过原来的转义。既有节点提示避免兼容性与更新说明完全重复的 guard 已核对，不为无实证情形改校验或增加文字。
- focused 9 文件/86 项及 typecheck 通过：i18n、独立资源、Settings copy、main 边界、History 详情/图片/虚拟列表、视频/图片合成旅程。证据 temp/localization-quality-focused.log、localization-quality-typecheck.log；新增导航/长度资源随后进入最终 verify。旧英文 Uninstall node 的精确断言更新为 Uninstall Node，未删断言或放宽行为测试。不新增为字符串逐字镜像的测试。
- 源码审校的清单保留在 temp/localization-quality-changes.json、localization-length-changes.json；后者与最终 diff 为最终标签依据。临时扫描器剩余候选已区分说明/状态和短介词规则，不当作遗漏。本轮无真实 UI/原生退出/按钮→task ID 新证据；人工检查后续发现的问题另行修复。
- 最终 npm.cmd run verify 单元层 326 文件/3149 项中 325 文件/3148 项通过，唯一失败仍是独立 NAS late cover 的 File outside library root，未跳过或修改该文件，不能报告仓库 verify 全绿。初次全量另有 History 卡片分隔与 View source 的旧精确断言失败，已同步到间隔点和 View Source；保留其余可达动作/原选择器/路径/字段断言，最终重跑只剩前述独立失败。证据 temp/localization-quality-verify.log、localization-quality-final-verify.log。
- 最终集成 7 文件/127 项、typechecked build 与 440 对比度检查均通过，日志 temp/localization-quality-integration.log、localization-quality-build.log、localization-quality-contrast.log；LAN 780.47 kB，原有 500 kB 提醒保留。全程只设置进程级 VITEST_MAX_WORKERS=8，没有放宽超时/配置。所有进程/检查结束后核对准确绝对路径并清理本轮自有系统测试临时根，保留 gitignored 验收日志；最终 diff --check 通过，无意外删除、版本更新、提交或发布。用户停止真实检查后未再启动真实 App/浏览器。

## 收尾清单（固定 6 个工作包）

1. **已完成：H3 静态工作流校验与语言传递。** 本轮证据如上。
2. **已完成：图片适配器内部提示与语言传递。** 包含本轮共享选项/LoRA 包装；运行管理元数据按契约保留。
3. **已完成：主 App 剩余服务与保护提示。** 上述队列、放大 provider/SeedVR2、环境、素材库、资料安全/迁移、恢复与执行器、旧出厂标签及普通续写 FFmpeg 底层均已接入语言；Attention 旧快照、共享 workflow、uploadInput 和 extension-media 主 App 调用已核对。运行管理元数据/技术匹配按契约保留；此项完成指已定位代码范围，不代替工作包 4 的真实页面漏翻检查。独立 Strata Agent 另列工具待办，长视频专属已交接，不增加工作包。
4. **按用户要求转人工：真实页面和状态漏翻。** 保留既有三语言 84 个组合和两处修复证据；未覆盖的原生菜单/文件对话框、App 局域网浏览及恢复状态不报告通过，停止自动实操。独立 NAS Browser 不在范围内。
5. **源码审校已完成：译文、术语与英文动作大小写。** 已按用途审校全局/Settings 动作资源、入口引用、重复 notice guard、退出措辞、导航语义与标点；保持用户内容/技术标识。最终回归结果见本轮记录，后续漏查交人工。
6. **源码长度优化已完成，实屏按用户要求转人工。** 已缩短英文 Settings 侧栏和长动作、同步入口引用，按现有 CSS 结构控制文字长度，不改变布局或提交门槛。支持视口/原生窗口/最终三语言实屏由人工验收，源码判断不替代实测。

本轮自动源码工作已结束；余下真实页面/布局及后续漏查按用户指示交人工。此处不新增工作包、不继续启动实屏检查，也不宣称未覆盖路径已经通过。

## 执行环境

沙箱内多次进程启动返回 `helper_unknown_error: setup refresh had errors`；已获准的沙箱外命令用于源码检查。`harness:app -- list`、`guide settings-runtime`、`guide extend` 与 `guide lan-browser` 已运行。后续按用户最新要求停止自动真实页面检查；自动源码工作收尾与人工实际验收分别记录，不将未测路径标为通过。

## 2026-11-04 补充：启动前构建的 chunk 警告

- 用户要求定位并拆分两个大包，不提高上限。真实构建模块分析（write:false，不清理 dist）发现：桌面 locale-en-US 为 543.92 kB，语言分组递归带入 i18n-keys，使英文词典被首屏静态依赖；网页 index 为 780.47 kB，同一键表分别以 Windows 反斜杠与 Vite 正斜杠 ID 出现两份。Vite 警告比较未 gzip 的 minified JS，不能用日志中的 gzip 数字判断是否超限。
- 两份 Vite 配置的 .js→.ts 源码解析返回 normalizePath，统一模块身份；词典分组不递归吸入依赖，翻译键表和翻译运行时各设边界，避免词典读取键表时形成初始化循环。桌面 media-chrome 单独分包，页面、模型和图片适配器的现有边界保留。未提高 chunkSizeWarningLimit，也不改变默认语言、缓存/回退、用户内容、IPC 或运行逻辑。
- 分析结果：桌面入口 476.19→235.04 kB，英文词典 543.92→353.84 kB；网页入口 780.47→61.25 kB。两端最大单包均约 353.84 kB。静态依赖图确认首屏只包含默认简体，英文/繁体仍动态加载；键表只出现一次、无反向词典依赖。仅将大包拆开不能宣称真实启动耗时改善，此处只记录构建字节/依赖证据。
- 新增 tests/frontend-build.test.ts 的两项真实内存构建回归：两端源码 ID 唯一、键表/翻译运行时各一份、默认语言静态可达而英文/繁体不可达、键表无词典回边，以及单个 JS 包保持在原 500 kB 范围。build.write=false 避免测试清理/覆盖其他检查读取的 dist。focused 4 文件/38 项和 typecheck 通过，日志 temp/localization-chunks-focused.log、localization-chunks-typecheck.log；分析模块清单在 temp/localization-desktop-chunks.json、localization-web-chunks.json。
- 未启动真实 App、ComfyUI/GPU 或浏览器，延续用户将真实页面验收交给人工的要求；没有操作用户媒体、安装软件或改独立 NAS 工具/部署包。版本保持 0.67.6，不提交或发布。同期 Strata/NAS 及前批未提交改动均保留。
- 最终 npm.cmd run verify 单元层共 328 文件/3162 项，327 文件/3161 项通过；唯一失败仍是既有独立 NAS late cover 用例的 File outside library root，本轮未跳过或编辑该文件。verify 提前退出后，另跑集成 7 文件/127 项、typechecked build 和 440 对比度检查全部通过；日志 temp/localization-chunks-verify.log、localization-chunks-integration.log、localization-chunks-build.log、localization-chunks-contrast.log。计数包含同期独立代码，不能当作本地化覆盖率。
- 正式生产构建确认桌面入口 235.03 kB、网页入口 61.24 kB、两端最大 JS 353.83 kB，无大 chunk 警告；最终产物以正式构建日志为准。保持原阈值，未隐藏生产构建警告或修改脚本退出码；没有从字节数推断实际启动性能。所有测试结束后核对准确绝对路径并清理自有系统临时根，保留 temp 验收报告；最终 diff --check 通过，版本仍为 0.67.6。

## 2026-11-06 人工反馈：H3 悬停详情与视频模型名称

- H3 检查徽标原先只翻译了状态标签，summary/items 仍由 checkH3Prompt 硬编码中文生成；将 29 条摘要/检查说明接入全局三语言资源，并向首次渲染和 coordinator 编辑即时更新两条路径传递当前 translator。旧调用继续默认简体，校验规则、模式、警告等级和用户提示词正文不变，官方字段/时间戳/LoRA 名称与触发词保持原值。
- Settings 默认视频和续写模型选项原先直接使用扫描时的 profile.name；现在渲染时按当前 uiLocale 读取 catalog.name，未知自定义模型保留扫描名称，不修改环境扫描缓存。Create 选项和 Settings 模型卡片已有相同语言投影，核对后保持；模型产品名与技术 ID 不改。
- 新增生产 DOM 合成旅程回归覆盖英文/繁体警告与通过状态、整页渲染及编辑后的悬停数据，确认中文用户正文保留；Settings 回归复用同一次扫描切换三语言，检查视频/续写名称、未知模型与原扫描数据。初次 focused 4 文件/94 项及 typecheck 通过，日志 temp/localization-hover-focused.log、localization-hover-typecheck.log；随后扩充的通过状态断言纳入全量 verify。
- 本轮为 patch 修复，不更新版本、不提交、不打包，保留同期其他任务改动。继续遵守用户将真实页面检查交人工的决定；没有启动 Electron、浏览器、ComfyUI 或 GPU。
- 最终 npm.cmd run verify 全部通过：单元 328 文件/3174 项、集成 7 文件/127 项、typechecked 桌面与网页构建、440 对比度检查；日志 temp/localization-hover-verify.log。两端最大 JS 357.09 kB，无大包警告，500 kB 阈值保持。测试使用进程级 VITEST_MAX_WORKERS=8 和独立系统临时目录；检查结束后核对绝对路径并清理自有临时根，验收日志保留，最终 diff --check 通过。

## 2026-11-06 截图复核：模型卡片、基础选项与 ComfyUI 提示

- 用户截图证明上轮模型名称修复覆盖不足。旧契约将运行管理元数据整体排除，实际把普通界面说明也留成中文；已修正 LOCALIZATION_CONTRACT，仅保留技术标识、原始测量/诊断和用户内容，内置组件标签、资源/卸载说明与节点说明纳入翻译。
- 新增 118 条三语言模型资源文案，覆盖整个 catalog 及 Sulphur scanVariants 的中文组件名、资源说明及两处来源标签。共享 model-profile-labels 仅匹配完整内置标签，投影名称、组件标签和资源说明；扫描对象、组件索引、路径、文件名与安装证据不变，未知自定义 profile 保持原样。Settings 卡片、图片/提示词/放大默认选项、图片质量与安装详情接入；放大弹窗及 Tessera 锚点模型名称也按当前语言读取。
- 补齐 Tessera、H3 optimizations、归档 DLSS 等节点用途，以及 13 类运行要求的三语言资源；扫描器输出与设置页现存扫描详情共用显示规则。ComfyUI 启动/重启、安装进度及版本通知的现有 native translator 入口已核对；发现语言保存未触发环境重扫，修复为仅语言变化时也重扫，保持不变保存不重扫。清除旧语言的已完成服务提示，启动/重启中按当前界面语言渲染通用状态；原始异常与外部进程输出不做自动翻译。
- 新增整个模型目录的英文卡片检查，覆盖组件标签、资源说明、名称和路径不变；所有已登记节点用途/运行要求无中文残留。另有同一扫描下图片/放大默认名称与质量的双语言检查，以及仅改语言的保存→环境刷新回归。focused 8 文件/176 项及 typecheck 通过，日志 temp/localization-model-cards-focused.log、localization-model-cards-typecheck.log。
- 本轮为 patch 修复，版本保持 0.67.6；未提交、打包、操作 NAS 部署包或启动 Electron/浏览器/ComfyUI/GPU。真实页面仍按用户决定交人工；同期其他任务改动保留。
- 全量 verify 通过：单元 329 文件/3179 项、集成 7 文件/127 项、typechecked build、440 对比度检查，日志 temp/localization-model-cards-verify.log。随后整张卡片文字检查补出两处来源标签，修复后相关 6 文件/77 项回归（含真实内存构建和放大弹窗）及最终 typechecked build 通过，日志 temp/localization-model-cards-final-focused.log、localization-model-cards-final-build.log。技术 code 路径/模式文本逐字保留，不作为界面中文残留；英文卡片其余正文无中文。最终两端最大 JS 371.79 kB，无大包警告，500 kB 阈值保持。检查完成后核对绝对路径清理自有系统临时根，保留验收日志，diff --check 通过。
