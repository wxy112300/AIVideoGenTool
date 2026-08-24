# 版本更新记录

本文件记录 Local Video Studio 的重要功能、修复、兼容性变化和已验证边界。

项目仍处于 `0.x` 开发阶段。正式版本记录以 Git 中实际出现的 `package.json` 版本为准；连续开发期间实际写入过但未形成独立 Git tag 的 patch 状态，会明确标注为“开发阶段补录”，不把它们伪装成独立发布。早期 `0.1.0` 曾持续滚动开发，因此在同一版本下按日期和功能阶段补录；`0.10.0` 至 `0.10.3` 的画布迭代虽然最终合并提交，但按实际开发阶段分别记录。

> 历史条目描述的是对应时间点已经落地的能力。后来被替换、隐藏或淘汰的模型与运行方案仍会保留在记录中，但不代表当前版本继续推荐使用。

## 未发布

## 0.43.1 — 2026-08-24

- 新增可选 MiniMax H3 Camera Motion v1 运镜 LoRA：仅开放给已验证的 FL2VA INT8 pruned ConvRot 图生视频，自动加入 `camera motion` 触发词，默认强度 0.8；不改变无 LoRA 默认路径或现有 Turbo/Ref2VA 策略。

## 0.43.0 — 2026-08-24

- 重新整理 MiniMax H3 LoRA：默认 FL2VA 4-step 切换至官方 LightX2V v1.1 768p 权重与 shift 6 / Euler 参数，旧版 v0.1、v1.0 768p 和 PinkFluffyBunny 仅保留为历史兼容记录，不再进入新任务或环境扫描。
- NSFW LoRA 改为 AfterMidnight Ref2VA v1.2，仅开放给 R2V；保留旧队列/历史记录的读取能力，但不会物理删除用户 ComfyUI 目录中的旧文件。

## 0.42.14 — 2026-08-24

- 将确认、目录迁移、图片资源库、窗口关闭、提升分辨率和设置安装引导等弹窗移到独立 overlay 层，避免普通弹窗状态变化触发背景页面整页重绘，并保留焦点与键盘操作语义。
- 修复队列和历史删除完成后页面跳回页首的问题：队列重渲染会恢复原滚动位置，历史列表及详情返回会保留删除前的位置，并在内容变短时安全限制到有效范围。

## 0.42.13 — 2026-08-24

- 队列拖拽排序期间实时显示被移动任务的预计队列编号；拖出有效区域时恢复原编号，并按运行中任务与不可跨越边界正确计算。

## 0.42.12 — 2026-08-24

- 队列等待任务的上下移动按钮改为专用拖拽柄；按住后可实时拖动排序，提供占位卡片、插入位置反馈、平滑移动动画和靠近窗口边缘自动滚动。
- 保留拖拽柄的键盘备用操作：聚焦后可使用 `↑` / `↓` / `Home` / `End` 调整队列顺序；运行中的任务仍是不可跨越的执行边界。

## 0.42.11 — 2026-08-24

- 修复图片处理、图生视频和视频续写的 Prompt 增强运行期间删除版本后，异步状态回传恢复已删除版本的问题；本地 Prompt 草稿修改现在会在状态同步和保存响应期间保持。

## 0.42.10 — 2026-08-24

- 修复从旧 Prompt 版本重新增强时覆盖后续版本的问题；增强结果现在始终追加到版本列表末尾并切换到新版本。

## 0.42.9 — 2026-08-23

- 修复设置页服务启动、重启和环境检查状态提示缺少前置图标的问题，并为状态文字补充稳定的图标与布局。
- 修复 ComfyUI 启动状态更新触发整页重绘时输入框焦点、光标选区和控件滚动位置丢失的问题。

## 0.42.8 — 2026-08-23

- Spectrum MiniMax H3 推荐版本从 `v0.2.16` 更新为 `v0.2.17`：补完原生 H3 Continuum 互操作，支持混合 VIDEO/AUDIO mask 的 forecast，并让 learned-latent sampler-2 refinement 独立使用 actual-prefix 策略；旧 ComfyUI 核心缺少 `mask_row_values` 时安全降级。最低版本线、Turbo 共存、`model_aware_mode` 门槛和现有工作流默认值保持不变。
- 核对 Motion Context 上游 `v0.3.1` 的 ComfyUI 0.33 兼容更新；Motion Context Extend 仍需关闭 Spectrum，普通 R2V 初始生成不受此限制。

## 0.42.7 — 2026-08-22

- 修复恢复已保存的视频续写草稿、从历史详情选择“在创建页调整”或选择自定义 H3 续写工作流后，Renderer 因能力缓存为空或沿用 Sulphur 旧工作流判据而错误提示“当前工作流未通过视频续写安全检查”的问题；FL2VA、Motion Context 与 Sulphur 现在按各自图结构检查，并防止异步模式恢复覆盖较新的页面选择。
- 修复 Qwen3.8 多模态 Prompt 增强把无标签的分析/规划前言写入 Prompt 的问题；结构化 H3 输出现在从首个合法字段开始提取。“跟随输入语言”改为根据用户原始输入确定中文或英文，不再让节点从以英文为主的系统指令中误判。

## 0.42.6 — 2026-08-22

- 修复新版 ComfyUI 视频输入 API 与旧版 PyAV 依赖不匹配导致的启动导入失败；环境扫描和启动前检查现在会验证实际枚举导入，仅将所选 ComfyUI Python 环境中的 `av` 更新到 `>=17.1.0`，并在更新后再次验证。
- 官方源码已修复或当前 PyAV 已兼容时不会触发补丁；应用关闭代理设置时也会清理继承的失效代理变量，避免自动修复下载卡住；外部运行的 ComfyUI 进程不会被自动终止。

## 0.42.5 — 2026-08-22

- History 大数据量场景改用按视口驱动的图片缩略图和视频封面调度，分别限制图片并发为 3、视频封面并发为 1；保留完整卡片 DOM、缓存 key、悬停预览、重试和错误恢复行为。
- 瀑布流改为批量读取卡片高度后通过纯函数分列，标题 marquee 改为分批测量；详情返回增加 kind、布局、筛选签名和 asset 锚点校验，抵抗异步媒体尺寸变化造成的滚动跳动。
- 增加确定性的 500 条视频/图片 History fixture、媒体 controller 生命周期测试和合成性能基准；该基准覆盖渲染、DOM 挂载、媒体调用计数和并发上限，不替代真实 Electron 媒体解码测量。

## 0.42.4 — 2026-08-22

- 修复 MultiModal Prompt Nodes 当前上游已使用带 `-> bool` 返回类型的 tuple/`any()` 方法原生识别 Qwen3.8 时，安装器无法提取方法体、仍按旧布尔表达式误判不兼容并中止安装的问题；安装补丁与离线扫描现在共用方法级结构检测。
- 环境扫描完成后会把 ComfyUI/Python/Torch/CUDA/GPU/llama 版本快照，以及缺失系统依赖、模型组件、Custom Nodes、工作流和运行时注册异常写入持久日志，方便在其他电脑上直接定位环境差异。

## 0.42.3 — 2026-08-22

- 移除 Create 页中已被 Prompt 增强替代的 H3 提示词助手、结构模板和手工构建器；保留 H3 提示词检查、参考 Slot、自动起稿与增强流程。
- 修复另一台电脑上 Custom Node 文件已安装但整个节点包启动导入失败时，“一键补齐/更新”只会重新扫描、不会执行修复的问题；基础节点类型全部未注册时，现在会安全更新节点、用所选 ComfyUI Python 安装 requirements，并统一重启复检。

## 0.42.2 — 2026-08-22

- 修复续写视频立即保存或模型工作流异步加载尚未结束时切换创作页，较晚返回的 R2V/FL2VA 结果会写入当前页面、导致图生视频与视频续写模型互相覆盖的问题；异步结果现在按发起页定向合并。
- 修复“加入队列”旁的清空按钮始终把草稿模式改成图生视频的问题；确认请求现在记录发起创作页，只清除当前图生视频或视频续写空间的素材、提示词和 Seed，并保留该页模型与另一页完整状态。

## 0.42.1 — 2026-08-22

- 修复图生视频与视频续写来回切换时，较旧的主进程状态回传可能覆盖本地创作快照、导致一个页面的参考 Slot 丢失的问题；保存期间会整体保留当前草稿及两份页面快照。
- 提示词增强成功后会在全局顶栏显示完成通知并标明发起的创作页；切换到其他创作页、Queue、History 或 Settings 后仍能看到结果已写回原页面。

## 0.42.0 — 2026-08-22

- 图生视频、视频续写和图片处理现在分别保存完整的创作参数；在三个创作页之间切换时，模型、提示词版本、参考素材、分辨率、时长、采样、LoRA 和 Seed 不再互相覆盖，旧状态会迁移为独立快照。
- 视频续写的多模态提示词增强会提取所选裁剪区间的最后一帧作为续写边界上下文，同时保留已有参考素材编号和角色映射。
- 提示词增强任务精确归属于发起页面；切换页面后结果仍写回并持久化到原页面，其他创作页会禁用增强入口，但继续同步并允许操作共享的提示词模型卸载按钮。

## 0.41.11 — 2026-08-22

- 修复 Qwen3.8 GGUF 的 vision 投影文件因上游采用 `*-vision-*.gguf` 命名、未被 MultiModal Prompt Nodes 原版 mmproj 扫描器登记而导致 `/prompt` HTTP 400 的问题；安装器会补齐投影发现规则，并按模型声明的 `qwen35` 架构选择视觉 handler。
- 提示词工作流在上传参考图和提交任务前核对 `VisionLLMNode` 实际注册的模型/mmproj 枚举；设置离线扫描会将未应用 Qwen3.8 兼容层的节点标记为可修复，避免把“文件存在”误报为运行时可用。
- 修复 Qwen3.6/Qwen3.8 即使在 4090 有充足空闲显存时仍被旧规则强制使用 CPU 的问题；现在释放已有模型后按实时显存选择设备，20 GiB 以上使用全部 GPU 层，遥测不可用或余量不足时才安全回退 CPU。
- 修复从已停止的 ComfyUI 启动提示词服务时，服务 ready 后到模型预热真正完成前 UI 短暂误报可用的问题；所有提示词后端会在服务就绪后重新发布 `warming`，设置按钮和创建页扩写入口持续锁定到预热工作流完成。

## 0.41.10 — 2026-08-22

- 修复原生 SeedVR2 分段提升在首次完成后可播放、但应用重启时路径恢复器又从保存的 ComfyUI 原始响应提取已清理切片，覆盖合并视频路径的问题。
- 启动时优先保留 SeedVR2 的合并成片；对已经被旧逻辑覆写的历史版本，会将 `.__lvs-segment-XXXX` 路径折叠回唯一的最终 MP4 并持久化修复，同时写入恢复数量日志。

## 0.41.9 — 2026-08-22

- 原生 SeedVR2 INT8 切片规划改为任务启动时读取可用物理内存与 NVIDIA 显存，并结合目标实际像素、显存保留设置及安全/自动/快速策略计算每段帧数；首次计划写入检查点，自动重试和重置状态沿用相同边界。
- Queue 运行卡片为 SeedVR2 分段任务新增独立的当前切片进度：同时显示“第 X / Y 个切片”、段内百分比、已完成数量与按帧数加权的任务总进度；合并和临时切片清理分别显示为独立收尾阶段。
- 最终视频合并完成后、历史记录提交前清理中间切片文件；日志记录计划采用的 RAM/VRAM、实际分辨率、每段帧数以及临时文件清理成功/失败数量。

## 0.41.8 — 2026-08-22

- 原生 SeedVR2 INT8 的 4K/长视频任务会在 `GetVideoComponents` 之前按输出像素与安全模式自动切成有界片段，逐段保存可恢复检查点，最终通过 FFmpeg 无重编码合并；恢复、应用重启或手动重置后会跳过仍有效的已完成片段。
- 原生 SeedVR2 节点活动期限从通用 10 分钟调整为 90 分钟；ComfyUI 服务仍响应且 GPU 持续计算时刷新活动期限，避免把实际运行中的 VAE/采样节点误判为卡死并反复重启。
- SeedVR2 分段日志记录实际目标宽高、总帧数、每段帧数、片段进度与恢复数量；“安全/自动/快速”现在会控制原生路径的前置帧批预算，而不再只影响旧自定义节点路径。
- UX/UI 源码断言在读取文件时统一 CRLF/LF，避免 Windows 工作区仅因换行格式导致内容存在却验证失败。

## 0.41.7 — 2026-08-22

- 修正应用刚启动并进行环境扫描时，队列页将 ComfyUI 尚未稳定的运行时状态过早显示为错误的问题；队列尚未运行时改显示“初始化中”，扫描完成后恢复真实状态。
- 保留真实的队列生命周期错误，并补充环境扫描期间的队列状态回归测试及中英文状态文案。

## 0.41.6 — 2026-08-21

- 固定 Settings 页头“重新扫描全部”在右侧动作区的位置，保存/放弃更改只在左侧提交区出现，不再因保存组出现而移动扫描入口。
- 窄屏下将扫描动作置于提交动作上方，并补充动作区位置回归测试；当前 renderer 在 1440、1280、900、760 宽度下完成截图检查，页面没有非预期的横向溢出。

## 0.41.5 — 2026-08-21

- 重排 Settings 页头动作区，将手动环境扫描与设置提交动作分组，并明确“放弃更改”为次要动作、“保存设置”为唯一主动作；干净状态不再常驻显示“已保存”。
- 补齐 900px 与 760px 下的标题/动作响应式布局，避免提交状态被压成竖排或造成页面横向溢出；补充动作层级与清洁状态回归测试。

## 0.41.4 — 2026-08-21

- 修复 Settings 重构后手动环境扫描入口只位于“系统与路径”内容区、在视频 LoRA/图片/节点等其他分类页不可达的问题；将同一个扫描动作恢复到 Settings 页头，保留原有 coordinator、扫描 scope、状态反馈和事件 selector。
- 补充 Settings accessibility 回归测试，确认非 system Tab 仍能触发手动扫描。

## 0.41.3 — 2026-08-21

- MiniMax H3 保留 480p/540p/720p/768p 并新增 360p 档位，Q3 GGUF 开放 360p/480p；分辨率选项仅显示档位和实际输出尺寸，不附加推荐或实验标签。创建页同时开放 3:4，并在首帧尺寸解析后按任意原图比例立即刷新 H3 的 32 像素网格输出尺寸；各档位直接表示短边，长边按目标比例计算，不再按固定总像素预算缩小非 16:9 画布。
- README 补充 H3 运行时兼容性基线：当前 Windows/NVIDIA 验证组合为 `torch 2.9.1+cu130`、配套 torchvision/torchaudio、`comfy-kitchen 0.2.31` CUDA backend，以及启用 SageAttention 时匹配的 Triton/SageAttention；记录 cu129 下 H3 INT8 ConvRot 使用 eager fallback 的已知边界。
- 检测到 ComfyUI Desktop 时，H3 修复入口优先建议在 Desktop 中切换 PyTorch 后重新扫描，并提示直接修复会修改同一个 `.venv`、可能被 Desktop 标记为外部安装。
- README 新增从官方安装 ComfyUI、选择实例、使用应用内一键安装/修复、下载并放置 H3 组件到完成首个 FL2VA 任务的端到端说明；同步将许可证声明修正为仓库实际采用的 MIT License。

## 0.41.2 — 2026-08-21

- 修复 Create 图生视频首帧/尾帧素材槽在跟随原图比例展示竖图时，槽与预览图高度约束不一致造成下方大块空白的问题；保留原图比例自适应并将有图槽的高度上限放宽到 640px，同时禁止误点有图槽打开文件选择窗口，拖入替换仍可用。

## 0.41.1 — 2026-08-21

- Queue 未开始任务的图片输入预览改为正方形容器并填满显示，兼顾横屏与竖屏素材且不再出现留边；视频预览和运行中实时预览保持原有比例与逻辑。
- 补齐当前 renderer capture fixture 对提示词运行时状态 API 的 mock，避免运行时接口扩展阻断 Queue/其他页面截图验收。

## 0.41.0 — 2026-08-21

- 将提示词增强运行时拆为主进程统一状态模块，正交维护 ComfyUI 服务、模型驻留和单次提示词操作；视频创建与图片编辑只投影属于本页的计时/取消状态，其他创建页在任务期间禁用增强但不冒用计时。
- 更正 0.40.2 的取消恢复策略：普通取消不再重启或重新预热 ComfyUI；提交前直接终止意图，提交后保存精确 Prompt ID，pending 仅删除对应队列项、running 才发出中断，左侧停止按钮会等任务确认结束后再卸载模型。
- 应用启动的 ComfyUI 进程退出以及连续健康检查失败会统一使提示词操作终止、模型状态失效并刷新两个按钮；Qwen-VL LoRA 节点安装/修复新增 token 级协作式中断适配及离线扫描提示。
- 调整视频/图片详情页的滚动层级：右侧信息区不再限高并嵌套滚动，内容随页面自然展开；移除移动断点重复渲染的快捷操作。
- 详情页快捷操作保持直接可见，不再折叠到“快捷操作” disclosure 中；视频多分辨率记录新增“删除当前版本”，并保留“删除视频和记录”的整条记录删除。
- 视频版本删除会保留至少一个版本，更新默认版本和记录文件指针，并在版本文件被其他版本共享时避免重复删除。
- 当前 renderer 详情 fixture 在 1280×800、900×800 下无页面横向溢出；`npm.cmd run verify` 通过（89 files / 661 tests、production build、20 组对比度检查）。

## 0.40.2 — 2026-08-21

- 保留 Create 现有两个提示词按钮和布局：左侧按钮在未启动时显示播放图标并预热模型，驻留/运行时切换为静止的停止图标，只有预热或卸载过渡态显示旋转加载图标；右侧按钮在空闲时优化提示词、运行中再次点击则取消对应提示词 Prompt，图片编辑页与视频创建页语义一致。
- 取消不再把 `/interrupt` 的 HTTP 接受误判为任务已经结束，而是按应用 Prompt ID 检查 ComfyUI running/pending queue；无响应超过 5 秒时仅重启应用管理的 ComfyUI，并在普通取消后自动重新预热模型。外部管理实例不会被强制终止。
- 停止模型时若提示词仍在计算，会先完成上述取消流程再清空 ComfyUI 执行缓存和模型；取消期间状态保留在现有按钮 tips/进度中，不再产生“取消即失败”的错误通知和错误日志。
- Qwen3-VL PEFT、Qwen MultiModal 和原生视觉提示词 Workflow 在进入视觉模型前把参考图规范到约 1MP；不改原始素材，也不改 H3 视频生成、Qwen 图片生成或局部修复 Workflow 的尺寸语义。
- `npm.cmd run verify` 通过（89 files / 659 tests、production build、20 组对比度检查）；当前 SSH 环境未执行真实 ComfyUI GPU 取消/重启运行验收。

## 0.40.1 — 2026-08-21（开发阶段补录）

- 完成 P19 CSS owner 收敛后的 P20 当前 renderer QA：18 个 fixture 覆盖 1440/1280/900/760 及断点边界，补齐 zh-CN 全量、en-US/zh-TW 关键视口、Settings 五状态和 125%/150% 缩放 screenshot manifest。
- 修复 125%/150% 缩放下 Create `.interpolation-summary` 仍沿用固定双列轨道造成的 document/body 横向滚动；窄屏恢复单列摘要，不改变 DOM、提交语义、工作流 payload 或队列逻辑。
- `npm.cmd run verify` 通过（88 files / 656 tests、production build、20 组对比度检查）；`verify:markup-visual` 退出码为 0。截图与状态 fixture 为当前 renderer 静态/合成证据，G18 的真实 ComfyUI、完整键盘和关闭生命周期仍需最终人工验收。

## 0.40.0 — 2026-08-21

- 完成 P18 Settings 内容层级：环境扫描结果从并列状态卡收敛为紧凑 evidence list，保留服务启动、依赖下载、路径和状态语义；模型 files/node/runtime 证据继续分开。
- 将 Settings 模型证据、硬件建议、组件说明和列表分隔符纳入 zh-CN、zh-TW、en-US 文案层；当前 renderer Settings 生产源码不再散落硬编码简体中文。
- 为扫描、连接测试、服务启停、环境修复、ComfyUI 更新、节点/工作流/运行时安装补齐局部 `status` / `aria-busy` / `alert` 反馈；强制停止改为隔离的 secondary destructive 操作，不改变原有 selector、队列、IPC、持久化或服务生命周期逻辑。
- 当前 renderer 状态矩阵、Settings 900×800/760×800 keyboard smoke、Settings focused tests 与 `npm.cmd run verify`（88 files / 654 tests、production build、20 组对比度检查）通过；未将 synthetic fixture 当作真实 ComfyUI 生成结论。

## 0.39.0 — 2026-08-21

- 完成 P17 Settings 分类与动作层级：宽屏保留 9 分类 sticky sidebar，`<=900px` 改为单行可横向滚动的 compact category strip，不再出现 3×3 或 9 行导航墙。
- 为 Settings 分类补齐 `tablist`/`tab`/`tabpanel`、`aria-selected`、`aria-controls`、roving `tabindex` 与 Arrow/Home/End 键盘切换；切换后保留当前 tab 焦点与页面滚动位置。
- 页头保留 saved/unsaved、discard、save；rescan 移入“本机环境” action group，扫描/保存显示局部 status 与 `aria-busy`。不改变 SettingsSaveCoordinator、EnvironmentRefreshCoordinator、CustomNodeInstallQueue、IPC、持久化、默认值或字段 selector。
- 当前 renderer 900×800/760×800 keyboard smoke、1440×900/1280×800/900×800/760×800 diagnose、Settings offline/scanning/installing/partial/confirmed-error 20 张状态截图，以及 `npm.cmd run verify`（87 files / 652 tests、production build、20 组对比度检查）通过。

## 0.38.0 — 2026-08-21

- 完成 P15 History 视频/图片详情页构图：保留 viewer 与版本区域，将 inspector 动作收敛为 dominant primary、常用 secondary 与原生 More disclosure；900px 及以下增加窄屏 compact action entry。
- 将 prompt、参数、输出、LoRA、输入、性能与文件快照放入 Generation record 分组，不删除既有字段；保留原有 action selector、媒体 URL、版本切换、队列/IPC/持久化与视频播放逻辑。
- 当前 renderer 的视频/图片详情 1440×900、900×800、760×800 diagnose/smoke，图片缺失媒体 error 状态，History 混合 8 项交互 smoke，队列 running smoke，focused markup tests 与 `npm.cmd run verify` 均通过。

## 0.37.0 — 2026-08-21

- 完成 P14 图片 History Lightbox 的 modal/focus 生命周期：打开时记录触发按钮并隔离背景，支持首末控件 Tab/Shift+Tab 循环、Escape 关闭和 return focus；版本切换保持 Lightbox dialog，不因边界按钮 disabled 丢失焦点；Reduced Motion 下关闭非必要过渡。
- 不改变图片媒体路径、缩放/拖动、方向键版本切换、视频历史逻辑或队列/IPC/持久化行为。当前 renderer 图片/视频混合 8 项 900×800 smoke、focused accessibility/layout tests、`npm.cmd run verify`（86 files / 649 tests、production build、20 组对比度检查）通过。

## 0.36.0 — 2026-08-21

- 增强设置页 ComfyUI 数据库自动修复：从启动日志定位真实数据库，区分锁占用、依赖缺失、目录不可写、迁移不兼容和 SQLite 损坏；修复前备份数据库及 WAL/SHM/锁文件，先执行无损 Alembic 迁移与完整性检查，仅对明确的迁移/损坏故障隔离旧库重建，失败时恢复备份。队列或提示词任务占用期间拒绝修复，外部进程占用数据库时不终止外部服务。

## 0.35.1 — 2026-08-21

- 修正 History 相册模式的列轨密度：混合宽高比内容在 900px 左右回到约 4 列、1440px 左右约 6 列的紧凑卡片尺寸；列数仍只由容器宽度决定，过滤或删除不会放大剩余卡片。视频/图片、媒体路径、队列和键盘交互逻辑不变。

## 0.35.0 — 2026-08-21

- 完成 P13 图片历史媒体状态：gallery、detail、version rail 和 Lightbox 复用同一套 loading、ready、unavailable、error 状态，提供重试与文件定位入口；图片源路径规则保持不变，视频既有 loading/error 行为不变。
- 图片失败时保留已成功显示的旧缩略图/封面，并同步处理 Lightbox 版本切换的源路径和状态；补齐简中、繁中、英文文案。当前 renderer 的混合宽高比 8 项 900×800 keyboard/media smoke、1440×900/900×800/760×800 diagnose 与截图、focused image-media/accessibility tests 及 `npm.cmd run verify`（86 files / 649 tests、production build、20 组对比度检查）通过。

## 0.34.0 — 2026-08-21

- 完成 P12 History 键盘语义：视频/图片卡片成为可聚焦主入口，支持 Enter/Space，More 按钮和 Shift+F10/Menu key 可打开快捷菜单，子控件不会误触发整卡打开。
- History kind tabs 改为单一 Tab stop，支持 Arrow/Home/End、受控 `tabpanel` 和重渲染后的焦点恢复；context menu 支持 Arrow/Home/End、Escape 与 return focus；layout/version 选择状态补齐 `aria-pressed`。当前 renderer 视频/图片混合 8 项 900×800 keyboard smoke、1440/900/760 viewport diagnose 与 focused accessibility/layout/state tests 通过；`npm.cmd run verify` 通过（85 files / 645 tests、production build、20 组对比度检查）。

## 0.33.0 — 2026-08-21

- 完成 P11 History toolbar/gallery 稳定性：标题、History tabs、筛选计数和 masonry/album 在 901–760px 保持同一 toolbar 行，同时解除固定高度，筛选面板在中窄屏保持在内容视口内；不改变 History tabs、卡片主入口、媒体状态或详情路由。
- 相册列轨改为只由当前 History 容器宽度计算，不再因过滤或删除记录而放大剩余卡片；视频/图片混合宽高比 8 项与 1 项 fixture 对照保持相同列轨，masonry 覆盖横向/纵向/方形媒体，筛选无结果/清除、masonry/album、详情返回和删除确认 smoke 通过。
- G11 Queue runtime gate 增加 executor/control 隔离回归覆盖；真实 ComfyUI 运行已由用户实际复核，未发现明显问题。隔离 gate 与用户 runtime 复核均未改变队列状态机、任务快照或 History 元数据语义。

## 0.32.2 — 2026-08-21

- 修正 Spectrum 默认策略：兼容 Spectrum 节点已安装但尚未被当前 ComfyUI runtime 加载时，只要用户没有历史选择，创建页仍默认开启；用户手动关闭/开启后保持记忆，Turbo 版本兼容性和 Motion Context 禁用规则不变。

## 0.32.1 — 2026-08-21

- 根据真实使用反馈，将 Queue 的 CPU/RAM/GPU/VRAM 性能总览恢复到页面顶部；active task 仍保留阶段、进度、预览、elapsed、暂停/取消和恢复主路径，实时性能 patch 改为只更新顶部唯一的一组指标。
- 不改变队列顺序、状态机、估时算法、pause/cancel IPC、preview 语义、任务快照或 History 元数据。

## 0.32.0 — 2026-08-20

- 完成 P09/G10 Queue 当前 renderer 复核与 P10 任务优先构图：running/paused 状态先显示任务阶段、总进度、局部进度、elapsed、预览和暂停/取消入口，CPU/RAM/GPU/VRAM telemetry 移到 active task 后的紧凑 evidence strip；无运行任务时改用单行紧凑环境 strip，空队列不再伪装运行卡。
- Queue 运行卡在窄窗口按状态与控制优先的 DOM 顺序渲染，760px 以下预览受控、pending/recovery actions 保持可达；失败/取消操作区修复宽屏内部文字截断和窄屏 action wrap。未改变队列顺序、状态机、估时算法、pause/cancel IPC、preview 语义、任务快照或 History 元数据。
- 当前 renderer 隔离 fixture 新增 running、paused、failed、recoverable、empty、multiple-pending 六态及 running progress/preview/telemetry smoke；真实 ComfyUI GPU 生成仍未在本次 UI gate 中执行。

## 0.31.5 — 2026-08-20

- 继续收敛当前 renderer 图片处理页的窄窗提交可达性：901–1120px 双栏和 760px 以下单栏为底部 sticky 提交条预留安全视觉区域，避免错误提示/加入队列操作覆盖输出分辨率等最后表单控件；不改变 DOM、控件 id、素材交互、队列 payload 或提交语义。
- `npm.cmd run verify` 通过：81 个测试文件、625 个测试、生产构建和 20 组文字对比度检查通过。

## 0.31.4 — 2026-08-20

- 修复当前 renderer 图片处理页素材区在 901–1120px 窄双栏下的文字排版：素材摘要不再把末字单独挤到下一行，添加 Slot 按钮保持单行，素材卡标题、标签与角色选择器增加收缩/省略边界，避免文字重叠或竖向排列；不改变 DOM、素材交互、队列 payload 或图片数据结构。
- `npm.cmd run verify` 通过：81 个测试文件、624 个测试、生产构建和 20 组文字对比度检查通过。

## 0.31.3 — 2026-08-20

- 完成 P06/L29：Settings 的模型下载、安装目录、环境下载、应用日志目录和崩溃目录打开失败统一路由为 error 通知，并补充 controller focused tests `2/2`；不改变目录、IPC、持久化或安装流程。
- G07 runtime smoke 已在隔离 Electron + 当前 Vite renderer 中通过：并发完成/失败保留 error alert，关闭按钮恢复页面操作，Prompt 优化失败可通过 Open Settings action 到达 Settings 且通知清除；P06 现标为 `verified/integrated`。P07 当前 renderer 窄窗 proposal 仍等待 G08 批准。

## 0.31.2 — 2026-08-20

- 完成 P06/L27–L28：全局通知支持瞬时的 Retry/View logs/Open Settings 类 action 结构和键盘事件委托，并接入一条明确的 Prompt 优化失败 → 打开设置恢复路径；action callback 不写入持久化状态、不改变 IPC 或 workflow payload。
- 通知 action 与关闭按钮保持局部 DOM 更新，错误仍可追溯且不会被普通页面刷新打断；P06/L29 的调用点分流、并发恢复和 G07 runtime smoke 仍待完成。

## 0.31.1 — 2026-08-20

- 完成 P06/L26 通知反馈第一包：info、warning、任务完成和队列完成消息按语义自动消失，error 默认持久显示并可通过键盘可达的关闭按钮恢复页面操作。
- 全局通知增加同源消息去重和 error 优先级保护；低价值 info 不再覆盖正在展示的错误。未改变 IPC、持久化状态、队列快照或工作流 payload；P06 的 Retry、View logs、Open Settings 等业务恢复 actions 仍待后续 package。

## 0.31.0 — 2026-08-20

- 完成当前 renderer 的 shared visual foundation：P04 的 type roles、tabular numbers、radius/spacing token 迁移与 P05 的 72px topbar/sticky geometry 统一；Create、Queue、History、Settings 及 History detail 的 sticky 标题和返回条共享 offset，760px 以下 topbar 进入 normal flow 时 offset 归零。
- 修正 Create sticky rail 的层级，使 topbar 始终位于 page heading 之上；Queue 窄窗口不再保留过时的 64px sticky 空带。未改变 DOM、controller、payload、持久化结构或模型工作流。

## 0.30.2 — 2026-08-20

- 收敛当前 renderer 的 panel/overlay 材质：普通 panel、任务卡、性能卡、History 卡片、History viewer、Settings 分区和侧栏移除装饰性阴影；tooltip、flash、context menu、dialog、lightbox、confirm、cropper 与 asset-library 等 overlay 保留 elevation，不改变 DOM、controller、payload、布局或交互语义。

## 0.30.1 — 2026-08-20

- 收敛当前 renderer 的品牌与导航 shell：品牌标记、顶栏和活动导航改用语义化 brand/nav 角色，移除装饰性 glow；活动导航保留清晰的背景、边界和下划线反馈，不改变 DOM、controller、payload 或布局。

## 0.30.0 — 2026-08-20

- 视频生成、视频续写和图片创建页面现在会把当前无法加入队列的原因直接显示在底部固定提交条中，并随提示词、素材和模型状态实时更新；用户无需滚动到表单末端查找禁用原因。
- 修复图生视频与视频续写切换时共用当前模型选择的问题：返回图生视频会恢复设置中的默认视频模型，不再沿用续写页的 R2V 模型或 LoRA；续写页仍独立恢复自己的草稿与默认模型。
- 统一设置页视频、图片、提示词、LoRA 与分辨率提升模型的状态定义：文件扫描、节点安装、运行节点验证和真实执行证据分层展示。ComfyUI 离线不再把完整的 safetensors/GGUF 权重标成黄色“未启动”；只有确认缺文件、缺节点或在线验证失败才显示错误，待运行验证改为独立的中性说明。
- Spectrum MiniMax H3 推荐版本从 `v0.2.15` 更新为 `v0.2.16`：新增 Untwisting RoPE H3 视觉参考补丁契约兼容，并将可选生成后研究分析隔离到有界子进程，避免诊断崩溃或超时影响已完成生成。普通 H3、Turbo 和 `model_aware_mode` 的最低版本线保持不变，现有工作流输入与默认参数无需迁移。
- 节点与工作流扫描发现本机节点低于项目推荐版本时，现在会显示当前/推荐版本更新提示；节点卡片提供“更新并重启”，顶部批量按钮会按实际待办显示“一键更新节点”“一键安装缺失节点”或“一键安装与更新”，并复用安全备份、统一重启和复检流程。
- 所有 catalog 节点的本机版本改为统一离线扫描：依次读取 `pyproject.toml`、`package.json`、`VERSION`/`version.txt` 和 Python 版本常量；上游未发布正式版本时显示扫描到的 Git commit。每张节点卡都会展示本机状态及扫描来源，不再依赖固定版本文案或节点特例。
- 提示词扩写模型统一使用文件、节点、运行验证和接入状态四层证据：已安装但旧扫描未给出节点兼容结论时按静态就绪处理，运行验证单独显示待定；Qwen3.5 2B/4B 原生 `CLIPLoader + TextGenerate` 路径改为已接入，不再错误显示黄色“无法确认”或“尚未接入”。
- 应用启动和后续环境重扫现在都会通过全局通知跨页面显示“正在扫描环境”，并在扫描自身完成时立即替换为“环境扫描完毕”或失败原因；启动时环境扫描与工作流模板加载改为独立异步任务，模板加载不再延迟扫描结果和创作页反馈。
- 环境扫描与设置保存改由独立协调器统一管理：启动、路径切换、服务启停、依赖安装和节点批次复检不再各自覆盖扫描状态，重叠扫描只提交最新请求；所有设置保存入口统一经过输出目录迁移确认，并共享语言、默认模型、工作流缓存与保存后复扫副作用，移除扫描路径和 LM Studio 路径的直接保存旁路。
- 设置页的提示词运行状态、核心/自定义节点优先级、加速环境、GPU 预算、自动目录和依赖动作阻塞规则移出 HTML 模板，统一由纯 selector 生成语义状态；提示词启动按钮现在与模型卡共享文件、节点、运行验证和接入 evidence，缺节点或明确运行失败时不再与卡片状态冲突，离线待验证仍保持可启动。
- 环境扫描拆分为完整、运行时和依赖三种 scope：服务启停跳过模型文件、GPU、系统工具、Python 与包环境重扫，仅刷新 API、核心兼容性和节点注册；依赖安装复用模型/GPU证据并重查节点、Python、llama、加速与工作流。局部扫描使用相同设置的有界完整快照缓存，缓存缺失或 ComfyUI 数据根变化时安全回退完整扫描。
- 设置页服务生命周期、环境修复、节点与工作流包管理拆分为三个独立 controller，由页面组合层统一挂载；现有选择器、运行任务阻塞、通知时机、扫描 scope 与焦点行为保持不变。
- ComfyUI 实时连接状态不再克隆并改写环境扫描结果；Settings view model 保留原始扫描快照和 `scannedAt`，环境概览由纯 selector 单独投影 API 运行状态，模型、GPU、依赖与非 API 项证据不会随服务启停变化。
- 修复应用启动的 Python ComfyUI 窗口再次空白的问题：恢复可见 Windows 控制台与 `CONOUT$` 输出绑定，并保留 `sys.__stdout__`/`sys.__stderr__` 底层流所有权保护；磁盘日志桥继续负责应用日志与失败诊断。
- 修复 H3 队列收尾重启后提示词模型每次扩写都重新加载的问题：显式启动提示词模型前会把 app-owned ComfyUI 从任务的 `--cache-none` 配置切换到非持久化的 `prompt-resident` profile，并使用有界 `--cache-lru 1` 保留 Qwen/Gemma loader 结果；下一队列任务仍按自身模型切回对应 profile。
- 修复提示词扩写期间强制关闭 ComfyUI 后按钮仍长时间计时的问题：任务等待会用“已连接的 WebSocket 断开 + 连续 API 不可达”确认服务退出，并在自动恢复 ComfyUI 之前先发布失败终态停止前端计时；恢复期间仍锁定提示词操作，避免重复启动竞态。
- 修复提示词按钮在 Qwen 输入加载后长期停在伪造的 `33%` 以及悬停提示闪烁的问题：输入节点现在排在模型 loader 之前，不上报真实 step 的阶段使用流动进度条，只有可测计算显示百分比；运行状态改用可实时刷新的应用内 tooltip，计时和阶段在持续悬停时也会更新。

## 0.29.5 — 2026-08-20

- 移除节点与工作流页面长期显示的 Motion Context `v0.3.1` 旧画布迁移警告。本应用构造 API 工作流，不使用 ComfyUI 画布按位置保存的旧 widget 值；上游删除并重加节点的说明只适用于用户手工保存的旧版画布。
- 统一修复所有本地提示词后端的模型生命周期：Gemma Prompt Writer、Qwen MultiModal、Qwen-VL Prompt Rewriter 与原生 TextGenerate 在显式启动或首次成功扩写后都会驻留，连续扩写复用同一模型，直到手动释放、开始队列或退出应用。MultiModal 节点适配新增可选驻留输入与显式卸载接口，避免节点内部 `finally` 在每次请求后强制卸载。

## 0.29.4 — 2026-08-19

- 应用启动的 ComfyUI 改用稳定的 `stdout`/`stderr` 管道，启动脚本错误、节点导入失败、运行期警告和完整 Python traceback 会实时脱敏并写入 Local Video Studio 日志，带有子进程 PID 与流来源。
- 移除依赖 `CONOUT$`/`NUL` 重绑定的 Python bootstrap，避免 ComfyUI `LogInterceptor` 包装共享 buffer 时出现生命周期问题；UTF-8 跨 chunk 内容和进程退出前未换行的尾部日志也会完整保留。
- ComfyUI 启动超时或抛错时主动抓取磁盘日志尾部，并记录日志是否可用、抓取行数、错误行数和截断状态；外部启动实例继续使用磁盘日志桥。

## 0.29.3 — 2026-08-19

- 修复 `0.29.2` Windows 标准流兼容层遗漏底层 buffer 所有权的问题：ComfyUI `LogInterceptor` 替换 `sys.stdout`/`sys.stderr` 后，原 wrapper 被回收并关闭共享句柄，最终在 `tqdm` 采样进度条刷新时触发 `I/O operation on closed file`。
- Python bootstrap 现在同时维护 `sys.__stdout__`/`sys.__stderr__` 原始流引用，使 ComfyUI 日志包装器接管公开流后底层控制台或 `NUL` 句柄继续有效。

## 0.29.2 — 2026-08-19

- 修复 Windows 分发版从无控制台的 Electron GUI 启动 ComfyUI 时，将无效的父进程 `stdout`/`stderr` 句柄继承给 Python，导致 H3、SeedVR2 等工作流进入采样节点后统一报 `I/O operation on closed file` 的回归。
- ComfyUI 子进程现在以稳定的空标准流启动，再由 Python bootstrap 将输出逐一绑定到新控制台；系统未提供可写控制台时回退到 `NUL`，日志输出不再中断模型执行。

## 0.29.1 — 2026-08-19

- 修复应用启动的 ComfyUI 在后续健康探测或重复启动请求中被误判为外部实例的问题；可通过应用专用数据库启动标记安全恢复旧会话遗留实例的所有权，正常退出时只清理应用明确拥有的进程。
- 节点文件安装成功但外部 ComfyUI 无法自动重启时，不再将节点安装统计为失败；改为保留安装成功结果并提示手动重启后复检。
- 完善 H3 Motion Context 续写的多 Slot 引用校验与文件上传，限制 Slot 1 为源视频并在提交前拒绝不完整的参考文件。
- 修复 Qwen-VL Prompt Rewriter 的模型枚举、节点运行时校验和跨 ComfyUI 数据目录识别；Qwen-VL 节点的 ComfyUI Desktop 日志兼容层现在由应用安装器按环境应用，离线扫描也会提示需要修复的节点。
- 增强节点安装/更新、ComfyUI 运行时、环境扫描和队列状态的日志与错误提示，并补充对应的工作流、历史和运行时回归测试。

## 0.29.0 — 2026-08-19

- 修正 `MiniMax H3 Prompt Rewriter LoRA 8B` 的来源和下载地址：官方仓库是 [`lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B`](https://huggingface.co/lightx2v/MiniMax-H3-Prompt-Rewriter-LoRA-8B)，基座是 `Qwen/Qwen3-VL-8B-Instruct`。
- 设置页只把 Qwen3-VL 8B 的 4 个权重分片和 8B LoRA 的 `adapter_model.safetensors` 作为用户必需组件；配置/tokenizer/预处理 JSON 与 LoRA `adapter_config.json` 改由应用内置清单，在首次实际扩写前按需自动下载并写入明确目标目录。
- 恢复 ComfyUI Qwen-VL LoRA 工作流绑定，并区分离线文件扫描与启动后的 `/object_info` 节点验证；不再把 27B 文本 PEFT 路径混入这个 8B 模型。

## 0.28.2 — 2026-08-19

- 修复队列执行器在模块拆分时错误转义视频扩展名正则，导致 Extend 工作流虽已成功生成并验证 MP4，仍在 FFmpeg 拼接前被误判为“没有返回视频文件”的问题。
- 将视频输出文件名判断集中到共享 ComfyUI 输出解析模块，并覆盖新版 `SaveVideo` 将 MP4 放在 `outputs[node].images` 集合中的返回结构。

## 0.28.1 — 2026-08-18

- 修复 Qwen3.6/Qwen3.8 MultiModal 扩写节点仍固定使用 4K 上下文的问题：安装/更新节点时应用 8K 上下文适配，避免长 H3 指令、参考图视觉 token 与输出预算共同耗尽 KV cache。
- 修复 `llama-cpp-python 0.3.46` 已由 `Llama.close()` 关闭 Gemma 4 chat handler 后，H3 Prompt Writer 再次关闭同一资源导致裸 500、吞掉生成结果并残留错误加载状态的问题；兼容层改为幂等清理并先清除运行状态。
- 节点更新器现在能识别上述 MultiModal 上下文适配为应用管理的补丁；上游未变化时不会反复备份和重新克隆节点目录。

## 0.28.0 — 2026-08-18

- 历史详情页新增视频/图片项目标签：支持大小写不敏感的自定义标签、回车添加、已有标签建议、内联修改和删除；旧历史记录自动按空标签迁移。
- 历史筛选浮层支持多标签组合筛选（全部匹配），筛选结果会影响详情页上一张/下一张导航顺序；缩略图页仍只显示评分和收藏，不增加标签噪音。
- 标签写入沿用历史元数据 IPC，局部更新详情页标签 DOM，不触发整页重绘、媒体重新挂载或视频播放中断；补充视频/图片无重绘回归测试与原型交互示例。

## 0.27.0 — 2026-08-18

- 新增主进程唯一的 ComfyUI 运行时状态源，区分未知、停止、启动、就绪、接口降级、重启、停止中和错误，并通过独立 IPC 同步到 Queue、Settings 与顶部通知；运行时状态不写入持久队列/历史。
- 修复“开始队列后立即取消”的两处竞态：取消后的 waiting task 不再被旧执行分支重新写成 running；取消发生在 ComfyUI 启动期间时会等待同一启动操作收敛，不再用瞬时空端口误报“ComfyUI 已退出”。
- ComfyUI 健康探测与队列生命周期解耦：一次 API 探测失败只标记接口暂时不可用，不把队列 running 推断成服务已连接，也不把端口未监听等同于进程退出。
- Desktop 启动完成后同时登记真实 listener PID，并将 Desktop 启动壳纳入进程盘点；自动恢复、退出和强停只处理应用明确拥有的进程，外部启动的 ComfyUI 保持不受影响。
- 增加运行时状态 token、防迟到异步覆盖、启动中取消、降级语义、listener PID 所有权和跨模块展示的聚焦回归测试。

## 0.26.0 — 2026-08-18

- 提示词模型新增 JonathanColetti Qwen3.8 27B Uncensored 非 MTP Q4 配置，使用配套 `vision-f16` 投影文件和 ComfyUI MultiModal Prompt Nodes；按 4090 的 8K 上下文路径登记为可选实验模型。
- 移除 Gemma 4 31B Q4 的新建/扫描/安装入口，避免在 24GB 显卡上暴露不必要的大显存档；已有历史记录仍保留原模型名称，旧设置会按现有未知模型迁移规则回退到可用默认模型。
- 将提示词模型环境安装说明从 Gemma 专用文案泛化为可覆盖 Qwen3.6/Qwen3.8 MultiModal 的共享目录与运行库说明。

## 0.25.5 — 2026-08-18

- 节点扫描增加按仓库缓存的 GitHub Releases 更新检查：成功结果缓存 6 小时，网络失败或无 Release 只短暂缓存，不阻塞离线扫描。
- 补齐 VideoHelperSuite 的 `VHS_LoadVideoFFmpeg`、`VHS_VideoInfoSource` 节点声明，并兼容 FlashVSR 上游长文件名与运行时短文件名。
- 为全部内置 API 工作流登记 ComfyUI schema、推荐核心版本、节点包、文件路径和上游来源元数据；JSON 仍保持纯 `/prompt` payload。

## 0.25.4 — 2026-08-18

- 设置页的“MiniMax H3 原生音视频核心”在核心节点已识别时不再隐藏操作按钮，仍可检查/更新所选 ComfyUI 核心。
- 对照 ComfyUI v0.33.1 的 H3 API 节点接口，确认主图生视频、R2V 与 Turbo 工作流无需替换节点字段；继续沿用已验证的工作流。

## 0.25.3 — 2026-08-18

- 将 H3 Motion Context 节点兼容线更新为 `v0.3.1`，设置页显示本地版本、推荐/最新版本和更新提示。
- 修正 Motion Context 工作流的 `audio_context_length` 为官方推荐的 24，并保留 22 帧视频上下文与 13 秒续写预算。
- 扫描重命名、复制或同仓库重复的 Motion Context 目录，并在设置页提示只保留一个副本。
- 提醒升级后删除并重新添加 ComfyUI 画布中的旧 Motion Context 节点，避免控件值错位。

## 0.25.2 — 2026-08-18

- 修复历史筛选浮层打开、关闭时触发整页重绘的问题；只有筛选条件或清除筛选时才刷新历史结果，避免打断播放和当前页面状态。
- 重排历史筛选浮层为单列表单，统一字段对齐、间距和移动端宽度；“只看收藏”改用 iOS 风格开关，并同步更新原型预览。

## 0.25.1 — 2026-08-18

- 历史缩略图改为只读展示评分与收藏标记，不再在卡片上放置操作控件，减少媒体内容上的视觉干扰。
- 收藏与评分操作收敛到视频/图片详情页；评分支持 0.5 分步进、鼠标半区点击、键盘方向键调整和清除评分。
- 历史筛选与排序收纳为右上角紧凑浮层，不再占用历史网格的固定高度；筛选支持半星区间。
- 旧数据的整数评分继续兼容，评分校验、迁移和 IPC 持久化统一支持 0.5–5 分。

## 0.25.0 — 2026-08-18

- 历史作品新增收藏和 1–5 分评分，视频与图片项目都支持在卡片和详情页直接维护。
- 历史页新增组合筛选：只看收藏、评分区间、视频最短时长、模型；支持按时间、评分和时长排序。
- 详情页上一张/下一张会严格沿用当前历史筛选结果，位置计数也改为筛选后的结果集。
- 旧历史记录自动补齐收藏/评分字段，不修改已有媒体文件；筛选状态在本次应用会话内保留。
- ComfyUI 运行日志同步进入 Local Video Studio 日志，任务失败时保留对应实例的日志尾部，便于定位跨任务和跨机器问题。

## 0.24.0 — 2026-08-17

- MiniMax H3 提示词增强支持空 Prompt + 参考媒体自动起稿；根据 H3 模式选择创意方向，避免重复使用同一方向，并保留每个提示词版本使用的起稿方向。
- 提示词增强增加准备、检查、上传、加载模型、生成、校验和卸载阶段进度；支持取消正在运行的提示词任务，并在取消或失败时清理对应运行状态。
- H3 Prompt Writer、ComfyUI 原生文本生成、多模态提示词和其他兼容后端统一接入自动起稿校验与进度回报；空 Prompt 仍需有参考媒体，普通增强仍要求输入提示词。
- 设置页增加 H3 自动起稿方向和指令配置，旧状态自动迁移到 schema v11；提示词默认模型切换为 Gemma 4 E4B Unconcerned Q5。
- H3 提示词增强按钮文案改为通用的“增强提示词”，不再暗示只有参考图才能使用；同步补齐中英文和繁中文案。

## 0.23.0 — 2026-08-17

- MiniMax H3 创建页接入 T2VA：没有首帧或尾帧时允许直接提交，标准 FL2VA、Turbo 和 Q3 GGUF 变体分别切换到对应的 text-only API 工作流。
- T2VA 队列任务跳过图片素材归档，并在队列卡显示“无参考图 · T2VA”占位；有参考图的 H3、R2V 和视频续写路径保持原有行为。
- 增加 T2VA 工作流资产与静态结构校验；尚未执行真实 ComfyUI/GPU smoke，不将本次版本标记为运行时验证通过。

## 0.22.1 — 2026-08-17

- H3 P1 低风险兼容吸纳：节点扫描同时记录版本与 Git revision，版本未知改为黄色待确认，Catalog 增加兼容证据/已知风险字段，设置页展示核心风险提示和节点兼容状态。
- H3 实时预览消息补充来源、Step、总 Step 与序列号元数据，普通 ComfyUI 预览和 KJ TAE 预览在任务边界可区分；不改变原有预览降级和生成流程。
- Prompt Writer 依赖升级准备：跟进上游 0.3.2 的目录/版本元数据，兼容新版诊断模块，不再要求每个文件都携带旧版 GGML KV 导入。
- H3 Prompt Writer 与 Qwen3.6 MultiModal 的 `llama-cpp-python` 统一为同一安装事务；节点 `requirements.txt` 中可能覆盖共享后端的条目会被过滤，已有 CUDA 自检通过时更新节点不会重复下载或替换运行库。
- 为共享 llama 运行库增加同一 ComfyUI Python 的并发安装锁，并补充节点更新、兼容补丁和运行库自检测试。
- Vite 构建按设置页边界拆分低频模块，避免主渲染 chunk 超过 500 kB；不提高告警阈值，也不改变运行时功能。
- 修复 MiniMax H3 Prompt Writer 一键更新被自身 `GGMLType` 兼容补丁阻塞的问题：更新前检查节点仓库是否有本地修改，发现修改时改用备份后干净副本替换，不再直接执行会失败的 `git pull`。
- 优化 H3 Prompt Writer 更新：识别仅由本程序生成的兼容补丁，且上游 HEAD 未变化时复用当前目录，不再重复克隆和创建备份；上游有新提交时仍执行备份、干净替换和补丁重放。
- 节点批次重启后增加 H3 Prompt Writer `/status`、`/models`、GGUF diagnostics 与共享 llama-cpp-python 运行时复检；失败原因会写入节点卡片日志和批次复检通知。
- 修复 H3 Prompt Writer 运行时复检成功后仍显示“兼容性待确认”：模型探针结果改为中性的运行时证据，不再把成功提示误判为兼容性警告。

## 0.22.0 — 2026-08-17

- 跟进 MiniMax H3 社区工作流：新增官方 LightX2V Turbo v1.0 8-step、768p 4-step 与 Ref2V 4-step LoRA 的目录、扫描、兼容提示和多语言说明。
- Ref2V Turbo 复用标准 H3 R2V 工作流，在提交时按 LoRA 动态注入 Sigma Shift、Euler/Beta 采样策略，不复制大型 R2V 工作流；旧版 FL2VA/R2V Turbo 模型 ID 继续可读。
- Spectrum 推荐版本更新为 `v0.2.15`，`v0.2.1`/`v0.2.6`/`v0.2.7` 的最低兼容线保持不变。同步记录原生 ER-SDE 状态清理、KJNodes 预览回放保护和可选 H3 Continuum 元数据互操作；不把推荐版本或 Continuum 误当硬性依赖。设置侧栏在环境扫描发现节点低于推荐/上游版本时显示琥珀色更新提示点。
- ComfyUI H3 核心节点兼容同时识别 `MiniMaxH3SigmaShift` 与官方显示名 `ModelSamplingMiniMaxH3`；KJNodes 改为按 SageAttention、TAE 实时预览和显存调试功能拆分，不再把可选预览节点当成所有任务的必需依赖。
- H3 入队继续遵循“离线检查文件/目录，运行时检查服务注册”：存在节点目录即可入队，SageAttention 模式只要求安装 KJNodes；真实服务启动后再报告节点未加载或接口不兼容。

### 0.21.0 候选 — 2026-08-15

- 创建页按当前模式筛选模型：视频续写只展示声明支持 Extend 的模型，避免把 I2V-only 或实验档位误显示为可用续写模型。
- 队列排序把正在运行的任务作为不可穿越边界；运行任务前后的待处理项不会再被拖到它前面，边界按钮会同步禁用。
- 剩余时间估算改为按任务类型、模型、分辨率、时长、步数、FPS、插帧、Spectrum、LoRA 和图片批次参数匹配历史记录，使用稳健中位数并结合当前进度斜率；图片历史也会参与估算。
- 新增独立的 `SeedVR2 3B INT8 ConvRot · 原生` 模型配置：识别 `diffusion_models/seedvr2_3b_int8_convrot.safetensors` 与 `vae/seedvr2_ema_vae_fp16.safetensors`，并在设置页与历史超分对话中单独显示。
- 接入 ComfyUI 原生 SeedVR2 API 工作流：预处理、512/128 空间 VAE 分块、64/8 时间 VAE 分块、Temporal Chunk/Conditioning/Merge、Euler/simple 单步采样和原生视频封装节点。
- 原有 `SeedVR2` 自定义节点 FP8 路径保持不变；新原生路径独立检查 `/object_info`，缺少核心节点时不会误报模型文件缺失。
- 新增原生 INT8 路径的静态模型扫描、运行时节点状态和工作流构造测试；性能估算标记为待本机 smoke 校准，未将社区 RTX 4090 数据宣称为本机实测。

### 0.20.0 候选 — 2026-08-14

- 队列顶部状态与操作收敛为一套清晰的批次级信息：区分待机、预热/重启、运行、结束和取消状态，批次计时从“开始队列”起算，不再误显示单个任务耗时。
- 实时预览改为可选的队列级能力，接入 H3 TAE/KJNodes 预览回调，保留最新帧并在任务结束时释放预览缓存；缺少可选节点时不会阻塞原有工作流。
- 提示词扩写统一复用所选 ComfyUI Python，补充 Qwen3.6 MultiModal Prompt Nodes 与 H3 Prompt Writer 的共享运行后端、GPU/CPU 探针、安装进度、失败日志和跨电脑修复路径，避免源码编译污染公共依赖。
- 队列、模型、节点和设置页的运行时校验继续保持“离线可管理、启动时再验证”：文件存在即可加入队列，任务执行到达时按 ComfyUI `/object_info` 和版本策略给出可操作错误，并跳过不可运行任务。
- 全局通知支持信息、警告、错误、任务完成和队列完成等语义，保持跨页面显示且不抢输入焦点；通知内容可选择复制并写入运行日志。
- 补齐设置页与创建页的本地化、依赖目录说明、批量节点安装/更新和模型/LoRA 状态展示；同步修复图片历史、拖拽输入、导航和预览相关的回归。
- 修复图片创建模式删除 Picture 槽位后编号持续递增的问题：已有 Picture 编号保持稳定，新槽位会回收最低空缺编号并按编号显示。

### 0.19.0 候选 — 2026-08-13

- 提示词扩写新增可选 Qwen3.6 27B Q4 Uncensored 配置：使用 ComfyUI MultiModal Prompt Nodes 的 `VisionLLMNode`，支持多参考图，完全复用所选 ComfyUI 的 Python，不再需要 LM Studio、llama-server 或第二个服务。
- 节点与工作流目录新增 MultiModal Prompt Nodes 与 Qwen3.6 H3 提示词扩写 API 工作流；安装器跳过会覆盖共享后端的普通 `llama-cpp-python` requirements，并将该节点纳入一键安装/更新。
- MultiModal Prompt Nodes 与 H3 Prompt Writer 统一使用固定的 JamePeng Windows 预编译 GPU 后端，不再要求用户安装 `nvcc`、Visual Studio 或 CMake，也不会由一个节点的源码编译覆盖另一个；安装前明确验证 Python 3.10–3.14 与已发布 CUDA wheel 矩阵，批量安装时已就绪的共享后端不会重复下载。
- 提示词扩展设置新增独立的 `llama-cpp-python` 运行依赖卡片：扫描所选 ComfyUI Python、按 PyTorch CUDA 版本选择 Windows 预编译 wheel、安装后执行 `import llama_cpp` 与 GPU offload 自检，并在安装期间安全停止/恢复 ComfyUI。
- 修复 H3 Prompt Writer 在 Windows `0xC000001D` 非法指令下只显示“GGUF 无法加载”的问题：Windows 安装统一使用固定的 JamePeng 动态 CUDA/CPU 后端 wheel；探针会先注册动态 DLL 再判断 GPU offload，安装日志每 2% 显示下载进度，45 分钟慢速下载上限，并通过 `--no-deps` 避免重装或污染 ComfyUI 的 NumPy/Pillow 等公共依赖。节点安装/修复同时兼容 `0.3.39+` 将 KV 类型迁移到 `GGMLType` 枚举的 API 变化。
- Qwen3.6 按 RTX 4090 设计为普通 Q4_K_M、同目录 `mmproj-BF16.gguf`、8K 上下文、GPU 层；扩写完成或退出时请求 ComfyUI `/free`，避免与 H3/图片任务交叉占用显存。
- 融合 Civitai MiniMaxH3 Auto Prompter 的结构化提示词逻辑：R2V 使用 `subject_definitions → summary → retention_analysis → detailed_description`，其他 H3 模式保持官方三字段、首尾帧对齐和明确的音频/配乐约束；所有提示词后端共享同一份 core contract。
- 设置扫描、启动校验、提示词状态和多语言文案新增 Qwen3.6 ComfyUI 多模态路径；节点目录、模型/mmproj 文件和运行时节点仍分开显示，未完成真实 GPU smoke 前不会宣称模型已跑通。
- 修复图片处理页的参考图片拖拽目标：每个上方 Picture 预览窗口现在都支持拖入、点击选择和覆盖替换；下方区域继续用于新增下一个 Picture，并在覆盖时显示明确反馈。
- 修复 LaMa「绘制 Mask」按钮缺少画笔图标，以及图片历史大图弹窗上一张/下一张按钮未初始化 Lucide 图标的问题。
- 队列页新增默认关闭的 H3 TAE 实时预览开关；接入 KJNodes `ModelPreviewOverrideKJ` 与 `vae_approx/taeh3.safetensors`，以单帧 512px 的保守配置复用现有运行卡片预览，并解析 `kj_preview_override` 自定义 WebSocket 事件。缺少可选预览依赖时不改变原 H3 工作流。
- 修复队列顶部“已运行”误显示当前任务耗时的问题：现在从点击“开始队列”起记录整批队列会话时间，并在暂停/清理过渡阶段保持显示，队列结束后释放。
- 补充 H3 TAE 预览的首帧、周期帧、无帧诊断日志；明确预览由节点回调和异步编码节奏决定，中间帧可能被丢弃，不再将“已挂载预览节点”误报为“已经收到画面”。
- 修复顶部全局通知无法选中文本的问题；通知显示时允许鼠标选中并复制，同时保留自动消失和页面操作隔离。
- KJNodes 依赖扫描新增 `ModelPreviewOverrideKJ` 运行时注册与离线源码能力检查；节点与工作流面板新增批量安装/更新按钮，只处理需要修复的 Custom Nodes，全部健康时允许显式更新全部，并复用串行队列、一次重启和统一复检。
- 创建页的提示词扩写预设改用统一 `i` 提示展示本地化说明；切换预设时只更新提示内容，不重绘页面或打断输入。
- 推理加速页收窄为“性能与加速”：Attention 后端、Python/PyTorch/CUDA/SageAttention/KJNodes 状态与安装说明统一接入三语文案，长解释改为 `i` 提示。
- 重排“性能与加速”设置页为 H3 加速策略、运行时解释器、运行时组件三个独立分区；保留原有选择、扫描、安装/修复控件与交互行为，并同步更新设置原型。
- 图片模型新增 `LaMa · 局部移除`，使用 `ComfyUI Inpaint Nodes` 与 `models/inpaint/big-lama.pt` 构建单图 Mask 修补工作流。
- LaMa 模式允许空 Prompt、固定原图分辨率并强制要求有效 Mask；模型能力驱动创建页隐藏无效的 Prompt、Seed 和多参考控制。
- 复用全屏 Canvas 的缩放、平移和撤销能力，使用半透明高亮显示涂抹范围，保存时输出独立黑白 Mask，绝不将覆盖色烧录到原图。
- Mask 工程与 PNG sidecar 存入应用数据目录；队列快照和图片历史保留 Mask 元数据，生成结果继续沿用既有图片项目版本关系。
- 图片工作流路径和输出命名不再硬编码为 Qwen；ComfyUI 提交阶段分别上传干净原图和 Mask，并校验实际 Inpaint 节点类型。
- 图片模型目录新增模型级必需节点声明：缺模型文件时创建页禁用选择，缺节点目录时明确提示并阻止入队，离线检查不依赖 ComfyUI 启动且不以版本号阻挡入队。
- 图片任务启动后基于 ComfyUI `/object_info` 复核节点注册与输入接口；缺少节点包、ComfyUI 核心过旧和节点接口版本不兼容分别给出可操作错误，任务标记失败后跳过并通过全局错误通知与日志报告。
- LaMa 作为无 Prompt 工作流，在入队准备和不可变任务快照两层强制清空隐藏的旧 Prompt，避免 Qwen 编辑内容泄漏到 LaMa 历史或执行数据。
- 修复切换界面语言并成功保存后，退出窗口仍错误提示 `Unsaved settings`：持久化成功后同步清理渲染端草稿与主进程退出保护标志，保存失败时仍保留未保存状态。
- 节点安装支持连续加入串行队列：每项保留独立实时日志和失败状态，单项失败继续后续项目，整批只重启并复扫一次 ComfyUI，减少逐个等待和重复重启。
- 收紧 MiniMax H3 Q3 GGUF 的 RTX 3080 实验档：新增独立 `ComfyUI-GGUF-H3` 节点包和 H3 专用 loader 名称，保留历史模型使用的通用 `ComfyUI-GGUF`；默认启用低显存/CPU VAE/同步卸载，并锁定 480p、124 帧、8 步以内，关闭 Spectrum、LoRA 和实时预览。该档仍需真实 RTX 3080 smoke 才能升级为“运行通过”。
- Spectrum 改为“最低可用 / 当前推荐 / 上游最新”三层版本状态：普通 H3 最低 `v0.2.1`、当前推荐 `v0.2.7`，支持旧版继续使用，同时保留更新提示和一键更新。
- 解除过时的 LightX2V Turbo + Spectrum 冲突；组合要求 Spectrum `v0.2.6+` 的原生 ER-SDE 支持，并在入队时再次离线复核版本。
- 创建页在启用 Spectrum 后显示 `model_aware_mode`，支持 `off / schedule / schedule_confidence / full`；该实验功能要求 `v0.2.7+`、默认关闭，并随不可变队列快照和历史版本保存。

### 0.18.12 候选 — 2026-08-13

- 将 ComfyUI 进程清单、监听端口识别、强制终止、孤儿进程复检和稳定端口释放迁入独立 shutdown service。
- 保留 Windows `taskkill /T /F` 与 Node `SIGKILL` 后备路径，以及完整进程 ID、父进程、命令行和失败上下文日志。
- 重启和环境修复仍通过原有薄包装调用停止服务；更新服务未做改动。
- 新增 TCP LISTENING 端口匹配、非监听连接排除和 ComfyUI worker/listener PID 去重测试。

### 0.18.11 候选 — 2026-08-12

- 将 ComfyUI 启动编排迁入独立 runtime service，环境总管改为注入目录发现、Python、Desktop 设置、进程启动和路径能力。
- 保留 Desktop 外壳由官方可执行文件启动的行为；源码、Portable 与 Desktop 管理实例继续使用所选 Python 和本机端口。
- 核心目录与数据目录分离时，继续完整传递 base/user/input/output/temp/database 参数，模型目录和 Qwen/标准显存策略保持不变。
- 新增源码/数据目录分离启动参数和 Desktop 外壳委派测试。

### 0.18.10 候选 — 2026-08-12

- 将 ComfyUI 标准/H3 与 Qwen Image 的 VRAM 参数、运行配置识别、保留显存计算和 Desktop 前端参数迁入独立运行策略模块。
- `comfy-ui` 执行服务直接依赖运行策略，不再为显存计算反向依赖大型环境服务。
- 将本机 HTTP 端点校验、detached 子进程启动与最长两分钟服务就绪等待迁入通用本地服务进程模块。
- 新增 loopback 默认端口、自定义端口及远程/HTTPS/非法端口拒绝测试；既有启动参数回归继续通过。

### 0.18.9 候选 — 2026-08-12

- 将 ComfyUI 根目录、Desktop 可执行文件、Desktop 2 `installations.json`、Portable 与手动源码安装发现迁入独立服务。
- 多实例去重、当前设置目录匹配、Desktop 产品版本、核心版本和 Git revision 读取统一收口，环境总管改为消费发现结果。
- 保留既有候选目录、Desktop 源码目录和注册表解析导出，现有设置页与测试调用方无需迁移。
- 新增显式离线目录优先、核心版本读取和 Windows Portable 布局识别测试。

### 0.18.8 候选 — 2026-08-12

- 将 MiniMax H3 与 Prompt Writer 的 ComfyUI 核心节点清单、最低版本和语义版本比较迁入独立兼容性模块。
- 环境服务继续组合在线 `/system_stats`、`/object_info` 与本地源码检测，但不再内嵌纯兼容性规则。
- 保持既有导出接口，现有调用方与环境测试无需迁移；新增最低版本、未知版本及 H3/Prompt 节点组独立判定测试。

### 0.18.7 候选 — 2026-08-12

- 将官方工作流目标路径解析、离线安装状态扫描和下载安装从环境总管迁入独立工作流依赖服务。
- 工作流安装继续支持代理与实时日志，并改为从 catalog 的依赖 ID 生成临时文件名，避免把 MiniMax H3 文件名硬编码进通用安装器。
- 下载内容先在临时文件中完成 JSON 对象校验，校验成功后才覆盖目标；失败时保留原工作流并清理下载残留。
- 新增便携目标路径、离线扫描、成功安装及无效下载不覆盖原文件的回归测试。

### 0.18.6 候选 — 2026-08-12

- 将节点的 Git 克隆/更新、非 Git 目录备份替换、Python requirements 和 Prompt Writer GGUF runtime 安装迁入独立依赖安装器。
- 将 VideoHelperSuite 分批队列兼容补丁与 LTX AudioVAE 兼容处理迁入专用节点适配器，特殊节点策略不再散落在环境扫描总管中。
- 保留现有 Electron IPC 与设置页安装入口，通过薄包装注入 ComfyUI 路径、Python、代理、进程日志和 Windows 安全重命名能力。
- 新增通用克隆路径、实时安装日志和未知节点拒绝回归测试；原有兼容补丁测试继续通过。

### 0.18.5 候选 — 2026-08-12

- 将自定义节点与官方工作流依赖声明从大型环境服务迁入独立 catalog，统一保存仓库、安装目录、别名、最低版本、运行时节点类型和工作流目标路径。
- 将自定义节点的磁盘发现、最近启动日志、ComfyUI `/object_info` 在线验证及 VideoHelper/LTX/SeedVR2 兼容性检查迁入独立扫描服务。
- 保持离线管理边界：ComfyUI 未启动时仍按文件系统识别节点安装状态，运行时 API 仅补充“已加载/待重启”等信息。
- 新增依赖 catalog 完整性与离线节点扫描回归测试，为后续拆分安装器、工作流依赖和 ComfyUI 实例管理建立稳定边界。

### 0.18.4 候选 — 2026-08-12

- 顶部通知区分信息、警告、错误、任务完成与队列完成，并按重要程度延长显示时间；连续完成事件按顺序展示，切换页面时不会消失。
- 所有顶部通知通过独立 IPC 写入应用日志，保留通知类别并映射到对应日志级别。
- 通知展示只原位更新顶部容器，不再触发页面重绘、表单重建或主动聚焦；队列状态刷新期间正在编辑的输入控件继续阻止页面重绘。
- ComfyUI 启动/重启/更新、节点和工作流安装、环境修复、连接测试、素材整理、历史删除及队列取消/移除等明确结果统一进入全局通知；自动扫描和高频进度不发送通知。
- 视频超分历史版本补充可选任务 ID，使任务完成提示也能覆盖超分任务并保持旧历史兼容。

### 0.18.3 候选 — 2026-08-12

- 完成 Electron 队列职责拆分：入队校验与输入素材归档迁入 `electron/queue-enqueue.ts`，四类任务继续保持原有校验顺序和不可变执行快照。
- 图片批次与视频任务执行循环迁入 `electron/queue-executor.ts`；worker 的单实例运行、暂停、取消与 AbortController 生命周期由 `electron/queue-worker.ts` 统一管理。
- ComfyUI 中断清理、CUDA/显存故障恢复、H3 Attention 降级和自动重试迁入 `electron/queue-recovery.ts`，保留原有安全取消、重启与重试上限策略。
- 图片项目版本、视频生成/续写历史和超分版本的原子落盘迁入 `electron/queue-history.ts`；任务只有在输出文件验证成功后才从队列移除并写入历史。
- `electron/main.ts` 减少约 1500 行队列实现，仅保留依赖装配和其他应用 IPC；新增历史原子落盘及 worker 单实例/取消生命周期测试。

### 0.18.2 候选 — 2026-08-12

- 开始拆分 Electron `main.ts` 的队列职责：视频生成、图片批次、视频续写和超分请求的执行快照工厂迁入 `src/core/queue-task-factory.ts`，并支持注入时间、ID 与随机源进行确定性测试。
- 队列复制、删除、排序、失败重置和待执行超分参数更新改为 `src/core/queue.ts` 的纯状态变换；对应非执行 IPC 注册迁入 `electron/queue-ipc.ts`。
- 保持运行 worker、ComfyUI 中断、故障恢复和历史落盘逻辑原位，作为下一阶段拆分边界，避免一次性搬动长任务生命周期。
- 新增队列快照不可变性、图片批次 runs、R2V 策略隔离及队列 mutation 回归测试。

### 0.18.1 候选 — 2026-08-12

- 重写 README 与依赖配置说明，以当前模型 catalog 为准移除过时的 Wan/Hunyuan 主力模型描述、独立 LM Studio/llama-server 安装路径和旧 H3 I2V-only 边界。
- 新增 Agent 起步指南，明确从契约、模型 catalog、节点注册表、workflow adapter、队列快照到真实 ComfyUI 最小运行的接入路线，并强调模型权重、节点文件、Python 依赖与运行时验证是不同状态。
- 自定义节点和官方工作流安装现在把阶段、Git/curl/pip 输出实时流回对应设置卡片，同时写入应用日志；进度更新只修改日志区域，不重绘整个设置页。
- 为节点 Git 更新/克隆、普通 Python requirements、Prompt Writer GGUF runtime 和工作流下载加入明确超时；超时会终止子进程树并保留已收到的错误上下文。
- 新增安装子进程实时输出与超时终止测试。

### 0.18.0 候选 — 2026-08-12

- 新增完整 English UI catalog 与台湾繁体中文（`zh-TW`）catalog，Settings 可选择简体中文、繁體中文（台灣）或 English，并在保存后立即切换当前界面。
- 补齐模型 catalog、Prompt Pack、LoRA guide/rule、workflow runtime safety message 与 Settings copy pack 的 English/台湾繁体文案；Prompt 与模型面对的内容仍保持英文边界。
- 修复 Settings 语言下拉框只显示选择、却没有把 `uiLocale` 写入表单状态的问题；新增语言 catalog key parity、Settings form、模型 English metadata 和 zh-TW Prompt Pack 测试。
- 将 Settings 的视频模型、Sulphur、LoRA、图片模型、Prompt、Upscale、Nodes/Workflow 与 H3 加速面板的固定文案接入三语 copy pack；动态硬件、组件和路径 metadata 继续按契约安全回退。
- 补齐分组式模型 catalog 的台湾繁体文案，覆盖图片模型、旧视频兼容记录、后处理、Prompt 模型和 LoRA；新增全 catalog 语言完整性测试。
- 统一视频 LoRA 技术定义：运行时、设置扫描、安装信息、兼容规则和自动触发词由同一注册表派生；新任务会把触发词冻结进队列快照，旧记录继续兼容归一化。
- 修复根目录 `models/` 忽略规则误伤 `src/core/catalog/models/` 源码的问题，确保模型 catalog 模块会随 Git 正常迁移到其他电脑。

### 0.17.0 候选 — 2026-08-12

- 新增 MiniMax H3 Realism People LoRA：设置页可离线扫描与下载，创建页支持 INT8 FL2VA/R2V 选择、强度和排序，执行时自动补齐 `r34l1sm` 触发词，并提示 Turbo/NSFW 叠加风险。
- 完成 Renderer 模块化收口：拆分 Create、History、Settings 页面 assembly、controller、view model 和 render coordinator，降低多 agent 编辑冲突。
- 建立模型 catalog、Prompt Pack、runtime workflow message catalog 和统一视频生成策略，模型元数据、Prompt UI 与 workflow 逻辑边界更加清晰。
- 完成本地化结构整理：全局 UI key、按语言 catalog、Prompt Pack 索引和 LoRA/workflow runtime 文案均可按 locale 扩展；模型 Prompt 内容保持英文。
- 图生视频、视频续写和图片处理 Prompt 版本彻底隔离；旧存档自动迁移，新增清屏当前版本、应用级 Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z 撤销重做。
- Prompt Pack 改为 Create/Settings 按需加载，model catalog 和 Prompt Pack 使用独立构建 chunk，恢复 500 KB bundle 告警阈值并消除无效动态导入警告。
- 删除 Qwen legacy 中文默认 Prompt，保留旧设置和历史数据的兼容迁移；新增 runtime、Prompt、catalog、LoRA、策略和 Draft 状态测试。

### 0.16.2 候选 — 2026-08-12

- Renderer 入口级 UI 临时状态集中到独立模块，降低多 agent 并行编辑 `main.ts` 时的冲突面。
- Create、History、Settings 页面增加明确的 assembly 入口，统一管理页面 controller 的挂载和清理。
- 将渲染分派、Shell 重建、历史视频播放状态恢复和页面生命周期协调移入独立 render coordinator。
- 保持现有队列、历史、工作流、IPC 和持久化数据契约不变，并通过 323 个测试及生产构建验证。

### 0.16.1 候选 — 2026-08-12

- 修复图片草稿替换 Picture 1 后仍沿用旧 `projectId`，导致相同 Prompt 下的无关底图被错误归入旧图片项目的问题。
- 图片项目归类改为基于 Picture 1 的 SHA-256 内容指纹与输出血缘；只有原始底图或项目中的任一历史生成版本才能续接原项目，普通人物、风格等辅助参考图不会建立血缘。
- 修复素材归档已计算 `contentHash`、但草稿标准化时丢失哈希和托管路径元数据的问题；新生成版本也会保存输出内容指纹，并为旧历史提供按需哈希兼容。

### 0.16.0 候选 — 2026-08-12

- 新增台灣繁體中文（`zh-TW`）介面：Settings 可切換語言，並同步支援全域 UI catalog、Prompt Pack、主要模型 catalog、LoRA 說明與 workflow runtime 訊息；缺少專屬文案時安全回退簡體中文。
- 视频历史详情扩展为完整提交快照：展示 Prompt 版本、模型、Steps、Attention、Spectrum、动作幅度、Seed、画面比例、帧率插值、工作流与 ComfyUI Prompt ID。
- 视频 LoRA 从单行摘要改为按真实加载顺序逐项展示，保留名称、模型族、用途、强度和权重文件名；没有使用 LoRA 时也会明确说明。
- 视频输入素材新增独立记录区，区分图生视频、R2V 多参考和视频续写，并显示首尾帧、各参考 Slot、源视频、裁切范围及来源历史版本。
- 图片历史开始持久化质量档、实际 Steps/CFG、目标尺寸、候选数量、扩散模型文件和 Lightning LoRA 状态；旧记录缺少的字段明确显示为未保存。
- 图片详情新增“输入图片与 Canvas 标记”快照，逐张展示 Picture 编号、用途、尺寸、路径以及每处 Canvas/Mask 修改说明，不再把标记内容藏在内部状态里。
- 队列参数摘要改为可换行的分组标签；多个 LoRA 分别显示加载顺序、名称和强度，长名称不会再挤出卡片，也不会为排版而删减参数。

### 0.15.1 候选 — 2026-08-11

- 修复输入素材库只扫描图片编辑记录的问题；视频草稿、视频生成队列和视频历史中的首帧、尾帧及 R2V 图片参考现在都会进入引用扫描。
- 新视频任务加入队列时先按内容哈希归档所有输入图片，去重后回写草稿和队列路径；归档或校验失败时不会创建任务，并保留完整日志。
- “整理素材库”现在可为旧视频历史补归档并原子更新草稿、等待队列及历史记录，因此仍被视频作品使用的图片不会被误判为孤立素材。
- R2V 的视频参考槽继续保留原路径；素材库只管理其中的图片输入，不复制输入视频文件。
- 修复图片创建页把缓存或尚未完成的环境扫描当成硬门禁，导致设置页已经显示 Qwen 组件完整却仍无法加入队列的问题。
- 明确恢复图片任务两阶段验证：入队 IPC 使用已保存路径重新扫描模型文件和工作流适配器；任务启动后再连接或自动启动 ComfyUI，并通过 `/object_info` 验证实际节点。
- 缓存扫描不完整、ComfyUI 尚未启动或运行节点暂未验证时只显示状态提示，不再提前禁用入队；真实缺失组件仍由入队扫描返回具体模型和文件名。
- 修复从图片历史的原始素材版本继续编辑时，把内部标记 `modelId: source` 错当成可执行图片模型的问题；现在只继承已接入的模型，否则回退到当前草稿或默认 Qwen，并同步选择兼容质量档。
- 修复 Canvas 标注图直接替代干净原图送入 Qwen，导致模型把红框、箭头、编号和说明文字重绘进结果的问题；Qwen 现在同时接收干净原图与独立的定位参考图，并使用明确的原图/标注图映射契约。
- Canvas 标注参考会真实占用一个 Qwen 图片输入槽；创建页显示实际模型输入数，超过原生 3 图上限时会要求减少普通参考图或标记，不再静默丢图。
- 修复图片详情“删除当前版本”确认后未调用删除 IPC 的问题；删除成功后同步移除磁盘文件与历史版本、清理缩略图缓存并切换到剩余版本，同时记录成功或失败日志。
- 修复历史页的继续创作操作只恢复草稿、没有可靠切换创建模式的问题：视频“调整参数”回到对应的视频创建模式，“继续创作”进入视频续写；图片“继续编辑图片”进入图片处理，“开始创作视频”进入图生视频，并统一回到创建页顶部。

### 0.15.0 候选 — 2026-08-11

- 为视频 LoRA 增加可扩展的声明式规则：兼容模型、输入模式、设置冲突、LoRA 组合风险、推荐加载顺序和特殊工作流要求由各 LoRA 自己描述。
- 创建页集中展示 LoRA 警告与阻断错误；加入 LoRA 时记录扫描到的真实 ComfyUI 相对路径，后端提交任务前再次按同一套规则及实际文件校验。
- 修复应用 LoRA 堆栈会删除或覆盖自定义工作流既有 `LoraLoaderModelOnly` 节点的问题；未选择应用 LoRA 时不再改写用户的 LoRA 链。
- 修复普通 LoRA 添加、删除和排序会静默切换自定义工作流的问题；Turbo 状态变化仅对已知内置工作流自动切换，自定义工作流改为语义校验采样节点。
- 在执行层禁止 Turbo 与 Spectrum 同时生效，避免仅靠界面禁用仍能构造冲突任务。
- 修复设置页刚打开或保存后仍显示“未保存更改”：补回表单遗漏的界面语言字段，并使用键顺序无关的结构比较判断真实改动。

### 0.14.3 候选 — 2026-08-11

### 信息图标视觉修正

- 移除信息提示控件自身额外绘制的圆形边框和底色，只保留 Lucide `info` 图标自带的单圈造型。
- LoRA 参数提示和设置页缺失组件说明按钮统一使用相同的单圈视觉；悬停仅改变颜色，不再出现双圈。
- 键盘聚焦仍保留轻量方形轮廓，兼顾可访问性且不与图标圆圈重叠。

### 0.14.2 候选 — 2026-08-11

### LoRA 顺序管理

- 每个 LoRA 条目新增上移和下移按钮，首尾边界按钮自动禁用；编号始终反映真实工作流加载顺序。
- 排序会立即保存到草稿，并原样进入队列、历史快照和 `LoraLoaderModelOnly` 加载链。
- LoRA 信息提示中的“叠加建议”明确给出推荐位置；当前建议性能 LoRA 在前、内容或风格 LoRA 在后。
- 新增不可变排序及边界行为测试。

### 0.14.1 候选 — 2026-08-11

### LoRA 使用说明

- 每个已添加的 LoRA 名称旁新增独立信息图标，悬停或键盘聚焦即可查看作用、推荐强度、可能影响、叠加建议、兼容范围和来源。
- Turbo 与 PinkFluffyBunny 使用各自的说明内容，并明确推荐的叠加次序及出现质量退化时的排查方法。
- 帮助提示继续使用纯 CSS 显示，不触发页面重新渲染，也不会抢走 Prompt 输入焦点。

### 0.14.0 候选 — 2026-08-11

### H3 NSFW LoRA

- 设置页 LoRA 分类新增 PinkFluffyBunny NSFW；当前 H3 使用 pruned INT8 底模，因此检测并下载相配的 `pruned-v1-rank128` 权重，不混用为 unpruned H3 训练的 v2 变体。
- 创建页可将它作为 H3 FL2VA 内容 LoRA 独立添加，默认 strength 为作者建议的 `0.5`，并可与 LightX2V Turbo 分别调节后叠加。
- LoRA 条目用途改为中文显示；兼容性限制会阻止该 LoRA 出现在 R2V 和视频续写模式。
- 新增目录识别、安装信息、双 LoRA 归一化与兼容范围测试。

### 0.13.0 候选 — 2026-08-11

### 多 LoRA 堆栈

- 创建页新增独立 LoRA 叠加区域，不再用单一开关或下拉框占用模型参数网格。
- 支持为当前基础模型添加多个兼容 LoRA、逐项调节 `0–2` 强度并随时移除；不添加任何项目即使用原始基础模型。
- LoRA 元数据新增兼容模型和输入模式约束，避免把 H3 FL2VA LoRA 错用到 R2V、其他基础模型或不支持的视频续写流程。
- 工作流按 UI 列表顺序动态串联多个核心 `LoraLoaderModelOnly` 节点，并保存每项独立强度；Turbo 仍会额外切换自己的采样器、调度器和步数预设。
- 任务提交前统一检查所有选中 LoRA 的兼容性与本地文件状态，为后续 NSFW、真人、风格、人物、动作和质量 LoRA 留出统一扩展入口。

### 0.12.1 候选 — 2026-08-11

### 参数提示布局

- 移除创建页 H3 LoRA 和 Spectrum 字段下方长期占位的说明文字。
- 字段标题右侧新增统一信息图标，鼠标悬停或键盘聚焦时显示说明；提示使用纯 CSS 控制，不触发页面重新渲染或抢走输入焦点。

### 0.12.0 候选 — 2026-08-11

### LoRA 分层管理

- 设置页新增独立 LoRA 分类，将可选适配权重与基础视频模型分开扫描和安装。
- LightX2V Turbo 4-Step 从独立视频模型改为 MiniMax H3 FL2VA 专属性能 LoRA；创建页只在兼容基础模型下显示开关，并自动切换标准 20 步与 Turbo 8 步工作流。
- 草稿、队列任务、历史作品和版本快照开始记录 LoRA 名称、文件、强度、模型家族和用途，为后续风格、人物、动作及内容 LoRA 扩展统一数据结构。
- 持久化 schema 升级到 9；旧 `minimax_h3_fl2va_turbo` 草稿、默认模型、队列和历史记录自动迁移为 H3 FL2VA + LightX2V Turbo LoRA，不丢失旧任务语义。
- Turbo 继续使用 ComfyUI 核心 `LoraLoaderModelOnly`，无需第三方 Turbo 节点；提交任务时会同时验证 LoRA 文件和专用工作流加载链。

### 0.11.6 候选 — 2026-08-11

### 素材库结果布局

- 修复未引用素材列表中的复选框继承全宽输入框样式，导致文件名和大小被挤出视图、界面只剩多行居中复选框的问题。
- 未引用素材改为默认收起的紧凑列表，展开后在有限高度内滚动选择，不再压缩整理结果和底部操作区。
- 素材文件和清理空间改用 B、KB、MB、GB 自适应单位，避免小型图片统一显示为 `0.0 GB`。

### 0.11.5 候选 — 2026-08-11

### 素材库完成反馈

- 素材库整理完成后，顶部提示会显示归档、旧目录迁移和引用更新数量，并明确说明原文件尚未删除。
- 顶部提示层提高到模态弹窗之上，整理面板保持打开时也能立即看到完成反馈。
- 运行日志和弹窗结果同步说明历史引用已保存、原文件与旧分片副本仍保留，可稍后再执行清理。

### 0.11.4 候选 — 2026-08-11

### 素材库目录简化

- 图片素材改为直接存放在 `input/LocalVideoStudio/sources/<SHA-256>.<扩展名>`，不再为哈希前缀创建大量两位字符子目录。
- “整理素材库”会识别旧的 `sources/<前两位>/<SHA-256>.<扩展名>` 结构，先复制并校验到单层目录，再统一更新草稿、队列和历史引用。
- 旧分片文件不会在整理时自动删除；它们会作为未引用素材等待用户显式确认清理，清理完成后才安全移除空的旧分片目录。
- 操作结果和日志新增旧结构整理数量与空目录清理数量，便于确认迁移是否实际完成。

### 0.11.3 候选 — 2026-08-11

### 素材库操作反馈与日志

- 归档修复和安全清理增加持久的弹窗内结果摘要，明确显示归档数量、已写入引用、缺失引用、清理数量和释放空间，不再依赖会被遮罩挡住的页面 toast。
- 进度条增加扫描、复制归档、校验文件、保存历史和清理素材等阶段标签及当前数量；完成后结果继续保留在弹窗中。
- 素材库扫描、归档、历史提交、清理和图片入队归档写入应用运行日志；每次修改操作带短操作编号，UI 可据此检索对应日志。
- 日志只记录操作编号和数量，不记录图片名称、路径或提示词；失败日志明确区分“历史未提交”和清理失败。

### 0.11.2 候选 — 2026-08-11

### 修复

- 修复“整理图片素材库”弹窗错误继承确认框双列网格，导致标题、说明和路径被压进图标窄列的问题。
- 素材库弹窗改为独立单列内容布局；正文区域可滚动，操作栏保持完整宽度，并使用中性资源管理视觉而非删除警示色。

### 0.11.1 候选 — 2026-08-11

### 设置页路径层级

- 文件路径区域改为“输出位置”和“ComfyUI 资源”两层：视频与图片输出目录固定排列在同一行，输入素材库与模型目录排列在下一行。
- “图片输入素材库”简化为“输入素材库”，并压缩素材库维护说明，突出路径本身和整理操作。

### 0.11.0 候选 — 2026-08-11

### 图片输入素材库

- 设置页新增图片输入素材库目录；首次启动或旧配置升级时，会把当前 ComfyUI 的 `input/LocalVideoStudio` 解析为实际默认值并写入设置，而不是保留空值表示“自动”。
- 图片编辑任务改为在加入队列时按 SHA-256 内容哈希归档输入图；相同内容复用同一文件，并保留原始来源路径。
- 新增“整理素材库”面板，扫描图片历史、图片草稿和待运行图片队列，区分待归档、已缺失和未被引用的素材。
- 旧历史修复采用复制、哈希校验、再提交引用的顺序，不移动或删除素材库外的原文件。
- 孤立素材清理必须二次确认，并在删除前重新扫描引用；清理边界严格限制在当前图片素材库目录内。
- 持久化状态升级到 schema 7；旧状态自动补齐素材库设置，已有图片引用保持兼容。

### 0.10.4 — 2026-08-11

### 文档

- 精简 README 的当前版本区域，移除连续堆叠的“上一版本”说明。
- 新增独立版本更新记录，后续版本变化统一维护在本文件。
- 根据历史对话、Git 提交和项目交接文档，补录早期桌面工作台、ComfyUI 环境、模型工作流、队列、历史、显存治理和图片工作区的演进。
- 在项目 Harness 中明确：每次版本变更必须同步维护本文件，README 只保留当前版本摘要。
- 增加共享工作区的多 Agent 防护规则：编辑前重新读取当前文件、禁止重放陈旧补丁、热点文件采用单一所有者或独立 worktree，并在交接前审阅意外删除。

### 提示词模型与 Qwen Image

- 统一 10 个可选提示词模型的运行路由：8 个 Gemma 4 通过 ComfyUI 内置 H3 Prompt Writer/llama 后端，Qwen3.5 2B/4B 通过 ComfyUI 原生 `TextGenerate`。
- Gemma 和 Qwen 均可扩写图片 Prompt；Gemma 图片请求使用 `Reference` 视觉输入并只提取编辑描述，不把 H3 音频、镜头和时间轴带入 Qwen Image。
- 图片“忠实整理 / 细节增强”改为基于 Qwen Image 官方编辑 Prompt 规范的英文单段契约，覆盖增删替换、文字原文、人物一致性、风格转换和多图 `Picture N` 指向。
- 统一清洗 ComfyUI、Gemma Writer 和其他本地 Prompt runtime 的图片输出，移除 Markdown、H3 字段包装和隐藏思考文本。
- 旧版中文图片预设会自动迁移为英文 Qwen Image 规则；用户自定义的非默认规则保持不变。

### 图片标记

- 图片创建页“快速插入”新增“按标记局部修改”：每条 Canvas 标记说明作为最高优先级的具体修改清单，快捷指令只约束未标记内容保持不变，不会覆盖或扩写标记本身的要求。
- 标记 Prompt 契约明确具体标记说明优先于通用保护语句；辅助框线、箭头、编号和文字仍由系统自动要求从最终结果中移除。

### 图片详情与历史页

- 图片详情预览按原图比例自然布局：宽图填满可用宽度，普通比例和竖图受视口高度约束，使用 `contain` 保证完整显示；版本缩略图栏独立滚动，避免宽图下方出现无意义空白。
- 历史页 shell、顶栏和其他一级页面统一水平基线；标题、视频/图片 Tab、瀑布流/相册控件使用稳定的固定轨道，切换内容类型或布局时不再改变导航栏高度。
- 分离相册与瀑布流的 CSS 和布局状态，修复相册内联列宽泄漏到瀑布流的问题；相册卡片按最大/最小宽度统一缩放和换行。
- 返回顶部按钮提升为所有长页面共用的页面级操作，创建、队列、历史、设置及详情页滚动后均可从右下角回到顶部。

### 模型设置与硬件信息

- 设置页模型卡统一显示“推荐硬件”，覆盖提示词、图片编辑、视频、超分和插帧模型；显卡/显存/RAM 建议与模型用途、文件大小和 offload 策略分开呈现，避免重复文案。
- 保留模型扫描的文件完整、工作流集成和运行节点验证边界；模型卡不会把文件存在误报为运行时可用。

### 验证边界

- 完整验证通过：29 个测试文件、285 个测试通过，类型检查和生产构建通过。
- Canvas 标注编辑器保存的是可编辑标注 JSON 和平面 PNG sidecar；它是非破坏性的视觉标注输入，不等同于真正的二值 inpaint mask 或 Photoshop 图层系统。
- H3 Q3 GGUF 档仍是面向 RTX 3080 10GB 的低分辨率/短片实验方案；在完成真实 3080 端到端 smoke 前，不宣称稳定支持，也不把 checkpoint 文件大小当作完整生成峰值显存。

## 0.10.3 — 2026-08-11

### 新增

- 增加 MiniMax H3 FL2VA Q3 GGUF 低显存实验档，配套 Q2 GGUF 文本编码器和独立 API 工作流。
- 设置页可扫描、说明并安装该档所需的 ComfyUI-GGUF、`CLIPLoaderGGUF` 和模型文件。
- 明确该档面向 10GB 显存设备的 480p/短片实验，依赖 CPU/RAM offload，且不开放视频续写；24GB 设备仍推荐原生 INT8 档。

### 修复

- 箭头工具在拖动过程中实时显示箭身和箭头，不再先显示矩形占位。
- 文字标记改为透明背景与细描边，避免大块黑色背景遮挡原图。
- 视觉回归测试增加拖动中箭头的像素检查。

### 工程

- 标准测试命令排除 `dist` 构建产物，避免重复运行验证时误扫描编译后的测试文件。

## 0.10.2 — 2026-08-11

### 新增

- 支持以鼠标所在位置为中心使用滚轮缩放标记画布。
- 选择工具下可直接拖动画面平移视口。
- 支持中键拖动和 `Space + 左键拖动`临时平移。

### 测试

- Electron 视觉回归覆盖滚轮缩放比例和拖拽平移距离。

## 0.10.1 — 2026-08-11

### 修复

- 修复 Fabric 7 默认中心原点导致背景图片只能显示右下四分之一的问题。
- 背景图片和区域标记明确使用左上原点。
- 关闭标记画布不需要的 Retina backing store，保持原图像素坐标与导出尺寸一致。

### 测试

- 新增 Electron 宽图视觉回归，检查图片四边是否完整覆盖画布及 Fabric 各层是否对齐。

## 0.10.0 — 2026-08-11

### 新增

- 图片处理工作区新增全屏视觉标记画布。
- 支持选择、画笔、高亮、矩形、椭圆、箭头、文字、删除、撤销、重做、颜色、线宽和缩放。
- 每处标记自动编号，可分别填写修改说明。
- 保存可继续编辑的 Fabric JSON 和供图片模型读取的平面 PNG，原图保持不变。
- 标注图替换对应 Picture 的模型输入，不额外占用 Qwen 的参考图数量。
- 提示词优化和最终生成自动收到标记说明，并要求移除成品中的临时框线、箭头、编号和文字。

### 工程

- Fabric 编辑器按需加载，不增加普通创建页面的首屏负担。
- Fabric 最低版本提升到修复已知安全问题的 `7.4.0`。
- 增加标记 sidecar 数据结构、Electron IPC、原子文件写入和入队前文件校验。

## 0.9.4 — 2026-08-11

### 改进

- 顶部悬浮提示与整页渲染解耦，不再中断视频、重置滚动位置或抢走 Prompt 输入焦点。
- 设置页明确区分 ComfyUI 安装入口、核心目录和数据 / 节点目录。
- ComfyUI 数据库修复提示只在服务不可连接且最近启动仍存在数据库初始化错误时出现。
- 收紧设置页信息密度，只在真实故障发生时显示修复项，避免常态页面被诊断信息占满。
- 稳定创建页、设置页、队列页和历史页布局，减少标题、空白区和卡片容器对有效内容空间的挤占。
- 完善根 `AGENTS.md`、架构契约、UX 契约和模型工作流契约。
- 增加统一验证入口与原型构建命令。

## 0.9.0 — 2026-08-11

### 新增

- FLUX.2 Klein 4B 增加 20 步快速质量与 50 步高质量档位。

### 改进

- 图片详情采用单列版本缩略图与大图同窗布局，主要生成信息常驻右侧，详细信息位于下方。
- 图片历史与视频历史保持独立入口；图片项目按同一素材聚合全部版本，最新版本默认作为封面。
- 完善历史媒体绝对路径、封面选择、复制图片像素、复制文件、定位文件和继续创作操作。
- 从图片详情可继续编辑、提升分辨率，或把选中图片送入图生视频工作流。

## 0.8.12 — 2026-08-11

### 修复

- 隔离 Qwen 图片工作流与 MiniMax H3 视频工作流的 ComfyUI 运行配置。
- 避免 Qwen 的 CPU VAE 和激进卸载参数污染 H3 FP16 VAE 执行路径。
- 队列在不兼容的模型运行配置之间切换时核对实际状态并安全重启服务。
- 改进非阻塞任务取消与失败恢复。
- 任务终止后释放 ComfyUI 执行状态，避免取消操作长时间卡住 UI 或污染下一条任务。

## 0.8.11 — 2026-08-11

### 新增

- 完成图片处理工作区的本地生成闭环。
- 支持 Qwen Image Edit 与 FLUX.2 Klein 4B 图片流程、多 Picture 输入和 `Picture 1/2/...` 引用语义。
- 支持去水印、融合修复、添加/移除对象、姿态与风格修改等快速指令，并可先由本地提示词模型整理为图片模型更易理解的 Prompt。
- 支持模型专用生成参数、1–10 张批量结果、随机 Seed、PNG 输出、队列执行和图片历史版本。
- 图片历史保存模型、Prompt、Seed、尺寸、格式、生成耗时和性能摘要。
- 支持继续编辑已有图片版本及把结果送入图生视频流程。
- 增加 H3 R2V Extend 工作流，可把已有视频与参考图片/视频一并作为续写条件；传统尾帧续写继续保留。

### 修复

- 入队按钮即时反馈提交状态并阻止重复提交。
- 无效或缺失的图片 Prompt 不再进入队列。

## 0.4.0 — 2026-08-10

### 新增

- 图片历史从视频历史中分离为独立工作区。
- 图片项目聚合同一素材的连续编辑结果，支持版本缩略图、封面、详情查看与继续创作。
- 图片和视频在历史页面中使用不同的内容模式，不再把静态图当作视频卡片处理。

## 0.3.12 — 2026-08-10

### 新增

- 完成 Qwen 图片编辑的 PNG 输出工作流。
- 建立图片输出文件、历史记录和绝对路径关联。
- 图片任务完成后按实际 ComfyUI 输出生成历史版本，不再只保留队列快照。

## 0.3.11 — 2026-08-10

### 新增

- 建立图片工作区基础数据结构、草稿、队列任务与历史项目模型。
- 增加图片模型能力、Picture 编号和 Prompt 引用编译规则。
- 创建页新增独立图片处理模式，并沿用视频创建页的单 Prompt、提示词优化、预设指令和 Seed 交互。
- 原型覆盖图片创建、图片历史、详情版本浏览、继续编辑和开始图生视频的完整链路。
- 增加视频历史目录安全迁移流程，并同步更新持久化路径。

### 提示词运行时

- 将提示词扩写统一收敛到当前 ComfyUI：Qwen3.5 使用核心 `TextGenerate`，Gemma 4 使用 ComfyUI MiniMax H3 Prompt Writer 扩展。
- 不再要求用户额外启动 LM Studio 或 llama-server；扩写完成、进入视频队列或退出应用时请求卸载提示词模型，避免占用生成显存。
- 设置页区分官方 `models/text_encoders` 与 Prompt Writer 的 `models/LLM/<模型>/` 目录，并校验 GGUF 与匹配的多模态 `mmproj`。
- 增加 Gemma 4 常规与 Uncensored 多模态档位，覆盖快速、平衡和 RTX 4090 质量档；Uncensored 只表示较低拒答倾向，不替代用户对结果和许可证的审核。
- 图片编辑和 H3 视频提示词共用单 Prompt、版本切换和参考媒体理解，但分别套用对应模型的输出契约。

## 开发阶段补录：0.3.0–0.3.10 — 2026-08-10 至 2026-08-11

> 这些 patch 版本是在图片工作区连续开发过程中实际写入 `package.json` 的中间状态，后来随相邻功能合并推进；这里保留它们的行为轨迹，不表示每个版本都有独立 Git tag。

### 0.3.10 — Qwen Image Prompt 契约

- 根据 Qwen Image-Edit 官方示例和官方 Prompt 改写工具的规则，图片 Prompt 改为英文、单段、直接、具体的编辑指令。
- 规则覆盖增删替换、文字原文、人物一致性、风格转换、多图 `Picture N` 指向和局部保持；不再套用 H3 的字段、镜头、时间轴或音频格式。
- 三条本地扩写路径统一清洗输出，去除 Markdown、H3 字段包装和隐藏思考文本，最终只写入一段可直接交给 Qwen Image 的 Prompt。
- 旧版中文图片预设会在加载状态时迁移为英文 Qwen Image 规则；用户自定义的非默认规则保持不变。

### 0.3.9 — Prompt 模型目录与硬件信息

- 明确区分 ComfyUI 官方 `models/text_encoders` 与 H3 Prompt Writer 扩展注册的 `models/LLM/<model>/` 目录。
- 设置页模型卡补充硬件、显存和运行方式说明，避免把 GGUF 文件大小误当作完整运行时显存需求。

### 0.3.8 — Gemma 图片 Prompt 扩写

- Gemma 4 不再被错误限制为只能扩写视频 Prompt。
- 图片 Prompt 使用 H3 Prompt Writer 的 Gemma/llama 多模态加载器，以 `Reference` 模式接收参考图片。
- Gemma 返回结果只提取 `detailed_description`，丢弃 H3 的音频、镜头和时间轴字段；图片生成仍由 Qwen Image 工作流负责。

### 0.3.7 — 十个提示词模型路由

- 八个 Gemma 4 档位按各自 GGUF 文件名精确匹配 H3 Prompt Writer。
- Qwen3.5 2B/4B 走 ComfyUI 原生 `TextGenerate`，支持视频和图片 Prompt 扩写。
- 启动提示词模型时提前校验当前选中档位的具体模型文件，避免“任意模型存在”导致的假就绪状态。
- 设置和创建页明确提示词模型能力，不再让模型下拉选项与实际适配器脱节。

### 0.3.6 — 清理无效提示词配置

- 删除从未参与当前 Prompt runtime 的“系统模板 / 提示词模板”设置。
- 旧状态中的 `promptSystemTemplate` 遗留字段加载时自动丢弃。
- 将仍服务视频自定义 API JSON 的工作流占位符说明移到“节点与工作流”设置页。

### 0.3.5 — 图片预设文案

- 图片 Prompt 优化方式改为“细节增强”和“忠实整理”，不再显示视频模型专用的 Sulphur 文案。

### 0.3.4 — 分离视频与图片 Prompt 预设

- 设置页分成“视频提示词预设”和“图片提示词预设”两组。
- 图片预设支持“忠实整理”和“细节增强”的规则头编辑、恢复默认、保存和旧状态回填。

### 0.3.3 — 图片 Prompt 优化语义

- 图片优化预设真正传入 ComfyUI 和 LM Studio 的 Prompt runtime。
- “忠实整理”只澄清用户意图；“细节增强”只补充区域、材质、光照、透视和边缘融合等执行细节，不改变图片生成参数。

### 0.3.2 — 共享 Prompt 模型生命周期

- 图片处理与图生视频、视频续写共用设置中的 Prompt 模型，以及启用/释放提示词模型逻辑。
- 三种创建模式统一 Prompt 头部、版本控制、编辑框和“优化提示词”按钮。

### 0.3.1 — 创建页 Prompt 视觉统一

- 图生视频、视频续写和图片处理的 Prompt 编辑器统一尺寸、标题层级、版本按钮和操作区。

### 0.3.0 — 图片工作区里程碑

- 在独立图片草稿、图片队列和图片历史数据契约基础上，接入 Qwen Image-Edit-2511 的设置模型卡、组件扫描、下载说明和初始图片处理创建页。
- 提示词运行时开始统一收敛到当前 ComfyUI，Gemma 4 多模态 Prompt Writer 与 Qwen 原生 TextGenerate 分开路由。

## 开发阶段补录：0.2.2–0.2.10 — 2026-08-10

> 这些版本是图片工作区正式里程碑前的连续修复和 UI 试验阶段，按会话中实际完成的功能补录。

### 0.2.10 — 图片创建页紧凑布局

- 压缩图片 Prompt、快速插入、生成设置和拖入区域的垂直间距，减少首屏滚动。
- 生成设置重新排列，去除空网格单元格；入队按钮简化为“加入队列”。

### 0.2.9 — 参考图片区层级修复

- 移除图片参考区多余的背景、边框、阴影和圆角外框，恢复通用媒体区域的无框设计。
- 移除参考区左上角无关的 Qwen 模型标识。

### 0.2.8 — Renderer 构建 warning 修复

- 将 Electron 专用 `node:path` 路径解析从浏览器安全的 ComfyUI 输出解析模块中拆出，消除 Vite `node:path externalized` warning。

### 0.2.7 — 图片 Prompt 编辑器污染修复

- 修复图片 Prompt textarea 属性缺少引号导致后续 HTML 被吞入输入框的问题。
- 加载旧草稿时清理被模板 HTML 污染的 Prompt 版本，并恢复干净的版本计数。

### 0.2.6 — 图片 Prompt 优化

- 图片处理 Prompt 增加一键优化、图片参考输入、实时词数统计和内容自适应高度。
- 图片优化使用独立的 `image-edit` 语义，不输出 H3 视频时间轴。

### 0.2.5 — Picture Slot 交互

- “添加图片”改为“添加 Slot”，Slot 1 使用最大预览作为基础输入。
- 所有 Slot 都支持删除；删除 Slot 1 后剩余图片自动提升为新的基础输入。
- 空 Slot 会保留在草稿中，但未填完时不能进入队列。

### 0.2.4 — Qwen 图片模型下载来源修复

- 将 Qwen2.5-VL 文本编码器下载入口从 HunyuanVideo 仓库修正为官方 `Comfy-Org/Qwen-Image_ComfyUI` 仓库。
- 保留 HunyuanVideo 工作流对同名共享文本编码器的使用。

### 0.2.3 — 图片模型设置与初始创建页

- 设置页增加图片模型配置、Qwen 组件扫描、下载说明、默认质量、批量数量和输出格式。
- 创建页增加第一版图片处理模式和 Qwen Image Edit 参考图输入。

### 0.2.2 — 图片数据契约与版本治理起点

- 建立图片草稿、Picture、图片队列运行、图片项目、版本和 `imageHistory` 的独立数据结构。
- 完成状态 schema v3 的图片字段基础迁移，避免图片任务污染成熟的视频队列和历史结构。
- 建立根 `package.json` 版本来源、patch/minor 规则和里程碑 `0.3.0` 计划。

## 0.2.1 — 2026-08-10

### 规划

- 确立图片工作区里程碑、语义化版本规则和跨模块实现计划。
- 将图片工作区拆分为创建、队列、历史项目、详情版本和转入视频创作等实施阶段。
- 更新图片创建、图片历史和详情页面原型，并明确多图输入使用 `Picture N` 而不是暴露底层 Slot 概念。

## 0.1.0 — 2026-07-24

`0.1.0` 是项目从原型到可用本地视频工作台的滚动开发版本。由于这一阶段没有为每批功能单独递增包版本，以下按实际提交日期补录。

### 桌面基础与首个生成闭环 — 2026-07-24

- 建立 Electron、Vite、TypeScript、preload IPC 和本地 JSON 持久化基础。
- 移除 Electron 默认的 File/Edit/View/Window 原生菜单，让应用直接呈现工作台界面。
- 增加 Windows `start-ui.bat`、代理启动脚本、依赖检查和本地构建流程。
- 接入 ComfyUI HTTP `/prompt`、文件上传、WebSocket 进度、history 轮询和 `/interrupt`。
- 首次接入 Wan 2.2 I2V 5B 工作流，修复编辑器刷新导致 Prompt 无法输入、清空按钮状态不同步和重复队列卡片等问题。
- 当前运行任务改为单张展开卡片，展示执行步骤、节点进度、已用时间、实时预览、取消操作及 CPU、内存、GPU、显存和温度。
- 增加目标 FPS、生成帧数和模型约束；任务快照保存 Prompt、Seed、分辨率、时长、FPS 和工作流信息。

### 历史、文件与桌面生命周期 — 2026-07-24

- 成功任务写入历史，历史卡片与详情页可播放真实视频，并保存 ComfyUI 输出文件的绝对路径。
- 增加第一帧/随机帧封面、悬停播放、响应式瀑布流、紧凑相册模式和固定的详情返回入口。
- 历史右键菜单支持查看详情、复用参数、复制路径、复制 Prompt、打开所在目录和删除。
- 删除操作使用统一确认弹窗，并同时删除历史记录和对应媒体文件。
- 参考图支持选择、拖拽导入、拖拽覆盖和一键移除。
- 窗口退出时清理应用自己的 Electron、Vite 和 TypeScript watcher；有任务运行时先确认，强制退出会中止 ComfyUI Prompt，但不会擅自关闭用户独立启动的 ComfyUI 服务。
- 修复重复启动残留 5173 端口、开发脚本退出不干净和单实例状态冲突。

### 环境扫描与 ComfyUI 管理 — 2026-07-24 至 2026-08-09

- 设置页按系统与路径、推理加速、视频模型、节点与工作流、提示词扩写和分辨率提升分类。
- 扫描 Node.js、Git、FFmpeg、NVIDIA GPU、ComfyUI、Python、模型文件、自定义节点和本地提示词服务。
- ComfyUI 路径不再写死用户名；覆盖当前 Windows 用户、C/D 盘常见目录、源码版、Portable 和 Comfy Desktop 结构。
- 支持发现多个 ComfyUI 安装实例，区分核心源码目录与用户数据/模型/节点目录，并允许手动选择实际使用的实例和 Python 环境。
- 默认 ComfyUI API 改为 `127.0.0.1:8188`，同时允许自定义端口；可检测并连接用户提前启动的 Desktop 服务。
- 支持启动、重启、强制停止和较长冷启动等待；更新后重新探测服务，避免端口或实例变化后失联。
- 缺失模型和节点提供信息说明、下载来源、建议文件名与安装目录；节点支持安装、修复、更新和实时日志。
- 代理默认关闭，预填 `127.0.0.1:7890`；启用后用于 Git、Pip、权重下载及由应用启动的 ComfyUI 子进程。
- 增加诊断日志、手动 Python 选择、检测目录展示和无人值守任务恢复。

### 视频模型与工作流扩展 — 2026-07-24 至 2026-07-28

- 接入 HunyuanVideo 1.5 I2V 和 1080p SR 分支。
- 接入 Wan 2.2 14B High/Low 双阶段、GGUF Remix、SmoothMix、DaSiWa 和当时使用的 NSFW 变体扫描/工作流。
- 接入 Sulphur 2 / LTX 2.3 I2V 与 Extend，并提供 Q2/Q3/Q4 GGUF 低显存档位。
- 设计并实现视频 Extend 模式：从已有视频尾帧继续生成，生成结果仍进入统一队列与历史。
- 增加模型级帧数、分辨率、权重精度和显存预算，不再用同一个时长上限限制所有模型。
- 修复 Windows 自定义节点替换、节点同名类型冲突、视频 VAE 时序接缝闪烁和 Sulphur 输出兼容性。

### 显存安全、插帧与分辨率提升 — 2026-07-24 至 2026-08-09

- Wan 5B 在 RTX 4090 24GB 上采用 tiled VAE 解码和阶段卸载，修复短视频采样完成后卡死在 VAE 的问题。
- 增加 RIFE 2×/4× Frame Interpolation；界面区分目标 FPS 与模型实际生成帧数，插帧后精确裁到目标时长和帧率。
- 在扩散模型、VAE、插帧和后处理之间主动卸载模型，避免上一阶段残留造成 OOM。
- 接入 SeedVR2、FlashVSR 和 Real-ESRGAN 队列任务；提升结果作为原作品的新版本保存。
- 修复 SeedVR2 尺寸、节点签名、批处理兼容、进度统计和 ComfyUI 恢复问题。
- 增加 VRAM watchdog、停滞检测、OOM 后暂停队列、缓存释放和服务恢复，避免重型任务长期无进展。

### MiniMax H3、R2V 与提示词工作流 — 2026-08-03 至 2026-08-09

- 增加 MiniMax H3 FL2VA Image-to-Video 工作流、模型组件扫描和 RTX 4090 推荐默认参数。
- 支持官方时长范围，不再把 4090 能力硬限制为固定 5 秒；显存边界按分辨率、帧数、精度和工作流阶段判断。
- 增加 H3 边界帧 Extend，同时保留传统尾帧续写。
- 增加 H3 R2V 多参考工作流、参考图槽位、角色/物体引用指导和 GPU 预算提示。
- 接入模型级 SageAttention、Triton/KJNodes 环境检测与一键安装；为 Windows 4090 建立可携带的 Attention 运行配置和稳定回退模式。
- 增加 H3 专用 Prompt 结构、镜头/声音指令预设、Prompt 校验、版本切换和本地模型扩写。
- 接入 ComfyUI 原生 H3 Prompt 工作流，并保留当时的 LM Studio、llama-server 等本地文本模型连接方式。
- 增加 H3 Turbo 工作流和 Spectrum 加速选项；运行策略按模型隔离，不全局修改 Wan、Hunyuan 等其他工作流的 Attention。
- 修复 H3 在 Windows 4090 上的 pinned memory、异步卸载、CPU VAE dtype、CUDA 错误恢复和后续队列污染问题。

### 队列、性能诊断与可靠性 — 2026-08-05 至 2026-08-09

- 队列支持等待、运行、完成、失败和取消状态，以及开始、完成后暂停、移动、复制、移除和重试。
- 只由真实节点执行、采样进度、预览或终态刷新任务活动时间，普通 WebSocket 状态广播不再掩盖卡死。
- 增加低频性能摘要与周期日志，记录 GPU 利用率、显存、系统内存、CPU、温度和采样次数。
- 增加 ComfyUI 强制停止、任务超时恢复、应用重启后的运行任务回收和跨模型队列重置。
- 修复 Windows 显示休眠/恢复导致的崩溃、日志本地日期、文件剪贴板、历史播放与文件定位。
- 队列提交增加输入与 Prompt 校验，避免缺文件、空 Prompt 或不完整模型进入长时间任务。

### UI、原型与公开项目整理 — 2026-07-24 至 2026-08-09

- 统一创建、队列、历史、详情和设置页面的字体、层级、间距、对齐、确认弹窗和导航选中状态。
- 创建页压缩无效标题空间与嵌套卡片，历史页列数随窗口宽度稳定变化，相册模式提高单位屏幕的信息密度。
- 更新产品原型，使后续页面改动能够先在静态预览中确认，再进入 Electron 实现。
- 重写面向公开仓库的 README，补充依赖、模型安装、验证边界、故障排查、MIT License 和换机交接文档。
