# ComfyUI / 模型 / 节点 / LoRA 升级评估与 Skill

- Status: completed
- Updated / Owner: 2026-10-10 / Codex
- Scope / Authority: 初始评估与 Skill 已完成。用户随后授权核心/GGUF兼容与推荐版本，再授权继续升级Spectrum及无需适配的其他节点。当前标注v0.39.2 +26 commits/d91ed5f按用户确认保留；隔离Harness不启动用户队列、不下载权重，仅升级已审计清单。
- Assessment baseline (2026-10-08): app 0.64.3；Git 3c33056606815af2e9b1c079c3b507e8c0d5a7bb；开始时工作区 clean；core 0.37.0 / c194dd00，上游 stable 0.39.0。
- Execution: direct；无子 agent；整合本轮 minor 0.65.0 与后续兼容修复，package/lock/README/CHANGELOG 对齐；按用户最新授权提交并推送 main，不创建 tag 或发布安装包。

## Resume

- 计划已关闭（2026-10-10）：用户明确只需升级，不继续速度/画质对照；本轮无后续升级待办，当前0.65.0收口推送。其他加速组合、九参考、Second Pass、缺权重的GGUF和其余图片模型精简保留为未验证/评估边界，不作为本计划待办。复用最终verify1772/Python13及真实生成证据，收口仅改发布文档，不重跑GPU。

- 最新阶段已完成：[managed 3.9.1兼容验收](evidence/managed-391-20261010.md)。应用 H3 节点已安装/推荐0.3.6；新receipt/History记录真实v6/hash/resume_safe，旧v5 Run只读、旧Native AV保留兼容路径。managed Sage委托KJ同一raw函数，解决未执行decorator自引用的观察边界，KJ/官方源码和identity校验不变。
- 新版 managed 真实 A→B→C 已完成 4→8→12秒，B/C History 鼠标 Continue、空 prompt 恢复与入队通过；receipt复用1/2段、各生成1段、无fresh fallback。原Run/registry/owner/alias与tensor hash、完整MP4音画解码通过。首段为API夹具，不声称新建Run UI入口。
- 旧0.3.5 Native AV真实UI→GPU→History兼容续写通过，新Native输出producer0.3.6；真实用户v5 Run只读检查且manifest不变。最终构建重启后8份fixture History/草稿/队列一致（仅既有内存规范化/实际stat），新旧AV/managed恢复与播放通过。复扫3.9.1/0.3.6 loaded/runtimeVerified=true，无升级提示。
- 最终verify1772、Python13、Skill/文档/diff检查通过。用户state/4queue/129History、其他1808源码、pipfreeze及core d91ed5f5保护一致；旧节点备份核对通过。owned runtime经AppApi停止，所有本轮Electron/CDP/8188均已退出，无本阶段代码/GPU/清理待办。边界：只验Sage Triton、Spectrum off、Compiler disabled；其他组合/九参考/Second Pass/性能质量A/B未验。

- 用户授权的三项已全部实际升级并同步推荐：[三项节点验收](evidence/three-nodes-20261009.md)。Writer stable0.4.7/8c0d71fc、SLA源码1.5.6/d58d006a、Continuum stable3.9.1/94eaf70d；三份旧目录/原diff备份核对通过，应用保持0.65.0。
- 最终verify1771、应用Python guard9项、上游CPU契约24项通过。真实Gemma增强、普通H3、核心Turbo-SLA及Continuum Native AV续写/History均通过；最终构建重启后版本=推荐、loaded/runtimeVerified=true、无升级提示。
- 边界：SLA实际执行核心BlockSparseAttention，未验证PlagueKind新实验内核；Continuum旧v5只读/拒绝复用与新v6前缀CPU通过，但本轮新版managed多段GPU、九参考/Second Pass及速度画质A/B未验证。未因新节点升级改变这些产品路径。
- 用户state hash、4条queue/129条History、core SHA、pip freeze与其他节点1419源码hash不变。owned runtime经AppApi停止，隔离Electron PID退出，CDP/8188无监听；资源已清理，无本轮安装或代码待办。Skill记录/矩阵与quick_validate、文档/diff检查通过。

- 上一阶段已完成：[0.65.0 与下一项升级](evidence/release-065-and-next.md)。package/lock/README/CHANGELOG 对齐 0.65.0，clean typechecked build 与真实 Electron AppApi/标题/版本标签通过；用户 state hash 不变，自有窗口 PID/端口已清理。复用图片精简最终1770测试证据，本阶段未重跑GPU。
- 当前21 active节点已刷新实际安装/公开HEAD；H3 Image/Crop & Stitch已在图片精简任务退休。下一项优先 Prompt Writer stable0.4.7（保留Gemma/projector/预算兼容），再做SLA1.5.6性能音画A/B、Continuum3.9.1旧Run复用契约专项；该轮仅评估；后续三项已授权实施见本节当前结论。API限额改用官方Release网页、Git tags与固定raw源码，未知来源保留未知。

- 前一阶段已完成：[Spectrum及节点升级](evidence/nodes-20261009.md)。实际安装Spectrum0.2.29/806fe498、Inpaint1.4.4/5b768174、CropAndStitch3.0.17/8584b08d；MultiModal本机1.0.16只同步推荐。23 active逐项采用/保留有记录，较大协议/应用补丁变化的包不盲目覆盖。
- 本阶段verify1773测试/构建通过；Spectrum off/on同seed真实UI→GPU→History均通过，开启20步中11 actual/9 forecast/0 fallback；30项图片输入清洗及Mask外/alpha保持CPU实算通过。重启后四项版本=推荐、loaded/runtimeVerified=true、无更新提示；两份History媒体保留。仅现用dense Sage路径真跑，未推广BSA/Flow/Untwist/长视频质量结论。
- 三份旧节点提交备份已确认；用户4条queue/129条History、完整state hash、核心SHA、Python pip freeze、其他节点1628个源码文件hash不变。本次owned ComfyUI经AppApi停止，隔离Electron退出，CDP/8188无监听。没有待实施的直接升级或待清理资源。
- 推荐线统一为 0.39.2；实际验收 core 为 d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29。其源码 version=0.39.0，官方 v0.39.2 tag=3c1b7a17；用户确认保留当前实例，未改变 core SHA，不冒充官方 tag 实跑。
- kitchen readiness 与 installer 精确 pin 同步到 0.2.37，CUDA13 backend 和 ConvRot 优化实测就绪；最低支持版本不变。
- 通用 GGUF 已从 city96 / 6ea2651 备份迁移到 leejet / 373048b8403a7820620065210a691263d4da0a61。扫描器检查 origin 与 revision；H3 专用 GGUF 保持不变。安装 requirements 已满足，未改 Python 包。
- Vite/Vitest 优先解析显式 .js 导入的 TS 源码，修复 tracked 旧生成 JS 遮蔽新 catalog 的问题。
- [comfy-upgrade-assessment Skill](../../../.agents/skills/comfy-upgrade-assessment/SKILL.md) 已交付并加入产品 Skill/文档入口，覆盖模型、节点、核心和 LoRA 的后续评估。
- 详细实施证据见 [0.39.2 兼容验收](evidence/compatibility-0392.md)。[原升级报告](evidence/upgrade.md)与[固定快照](evidence/inventory.json)保留 10 月 8 日历史：23 active、2 retired、9 extra；不覆盖原始身份。

## Verification and boundaries

- npm.cmd run verify 通过：1690 单元测试 + 83 集成测试，共 1773；typechecked clean build 与 20 对比度组合通过。
- kitchen 精确版本、GGUF 同版本异来源/未知来源/错误 SHA，以及 city96/molbal 备份迁移固定 checkout 的回归通过。
- 隔离 Electron 通过缺 prompt 禁用 → 键盘恢复 → 实际按钮 → task ID 验证 H3 与原生 Qwen 2.1。H3 实际输出 864×480 / 24fps / 1.625秒 MP4，Qwen 实际输出 480×480 PNG；History 解码、播放/显示、返回和任务/版本关联通过，草稿编辑未改变 H3 排队快照。
- 同一 fixture 重启后 kitchen 加速和 GGUF loaded/runtimeVerified 仍通过，两份 History 版本和非空媒体保留；core SHA 未变。
- Qwen GGUF Q8/Q6 权重缺失，仅节点来源/固定提交/schema 通过；未验证真实权重加载和生成，未下载权重。无性能或画质 A/B 结论；备份存在不等于回退已测试。
- 两个 Skill 的 quick_validate、YAML/调用入口校验通过。文档本地链接、快照覆盖与 diff 校验随最终收口检查；原始机器路径/状态/日志仅在 gitignored temp。

## Resources and cleanup

- 使用空队列/History 的独立 Harness userData 与输出目录；未执行用户 4 条队列。用户仍有 129 条 History，设置与基线一致；重启前后用户 state 文件和 H3 专用 GGUF 入口 SHA256 未变。
- 应用启动并拥有本次本地 ComfyUI；最后通过 AppApi 显式停止 owned runtime，再关闭隔离窗口。最后 Electron PID 已退出，CDP/8188 无监听。本证据不声称原生窗口退出生命周期已验证。
- GGUF 旧目录备份及隔离输出保留便于检查；未删除用户数据。临时文件/媒体/日志不提交。
- 默认工具 helper 故障时使用已获自动审批的终端和 apply_patch CLI；没有自动审批拒绝或待用户授权事项。
