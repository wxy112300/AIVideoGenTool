# ComfyUI 0.35.0 与 H3 升级

- Status: implementation complete；用户已通过应用队列完成 RTX 4090 上从480p/10s到768p/15s的20步组合实测。固定驻留、Attention、SOL、VAE和长时负载已有可核对History证据；Triton 768p/15s出现一次OOM、一次成功，证明该组合处于后台显存敏感的临界区。
- Updated: 2026-09-11
- Owner: 当前线程；runtime smoke 已结束，不持有 ComfyUI、Electron 或 GPU 运行资源。
- Scope / Authority: 用户要求阅读并开始执行本任务的五步升级计划；早期 agent 运行仅授权低分辨率短测，后续480p/768p与10s/15s长测由用户在应用内执行并要求写入分析报告。本次不下载权重、不删除用户数据。
- Baseline: 执行前 HEAD `fa75dfb`、应用 `0.60.0`；起始未提交产品改动仅为本任务文档，另有 History/media 任务改动需保留。当前工作区状态与验证边界见 [upgrade-validation](evidence/upgrade-validation.md)。
- Execution: direct；新增子 agent 0；一个 Luna（Max）连续完成。

## Resume

- 执行入口：[五步升级计划](PLAN.md)。已完成基线核实 → 核心兼容与旧路线清理 → 性能选项 → PDD/资产与依赖 → 集中静态验证。
- 核心推荐统一为 ComfyUI `0.35.0`；等待中的任务跟随保存后的 H3 acceleration policy（dense attention、sparse、native runtime、compiler），开始执行后冻结本次 policy；Spectrum、preview 与旧设置/队列/历史字段保持各自兼容边界。
- H3-Optimizations 已从活动 catalog、扫描、安装、设置和工作流依赖移除；失败 H3 Memory 实现改为只移除旧节点的兼容适配，不删除 History 媒体、用户模型或外部 custom node 文件。
- PDD FL2VA/Ref2VA 已以 pinned revision、pruned 基座约束、普通 LoRA loader、8-step/Euler/Simple、video/audio shift 12/3 和 CFG 1.0 接入；未添加未经核实的新最终 VAE。
- 本轮所有新增 H3 图路径保留 Spectrum-on；Motion Context 的 Spectrum-off guard 保持不变，不调查、不修复、不做组合 GPU 实验。
- 前次所选核心为 `v0.35.0-6-ga7b1d39d`；未切换 tag、未重装环境。原生 compiler 与 async offload 已拆成独立设置。
- [调查证据](evidence/upgrade-research.md) 保留为历史事实；实现后的静态/构建证据见 [upgrade-validation](evidence/upgrade-validation.md)。
- [RTX 4090组合实测报告](evidence/rtx4090-combination-benchmark.md) 记录用户本轮应用队列History、OOM观察、秒数/百分比、内存影响、推荐组合和监控缺口；性能结论不得脱离其4090/64 GiB、ComfyUI 0.35与当前H3图范围。

## Evidence / handoff

- 已做：本机核心/包目录核实、代码接缝审计、PDD 来源与哈希核对、核心策略/工作流/队列/设置/依赖/历史兼容实现，以及文档收口。
- 修改范围：本任务相关源码、契约、测试、CHANGELOG、依赖说明和本目录证据；History/media 性能任务的既有改动未覆盖。
- 静态证据：H3/workflow/PDD/运行时/schema/依赖/环境等定向集合均通过（最新定向回归 9 个文件、149 个测试）；针对设置传播、重置重试与启动加载同步的定向回归 3 个文件、63 个测试通过；最新完整 `npm.cmd run verify` 通过 173 个测试文件、1455 个测试，另有 typecheck、build 和 20 组 UI 对比度检查通过。完整命令与时间记录见 [upgrade-validation](evidence/upgrade-validation.md)。
- 运行证据边界：隔离的 ComfyUI 0.35 minimal harness 已返回实时 `/system_stats` 与 `/object_info`；用户后续已通过应用队列取得普通无LoRA H3的20步成片和History性能数据。固定驻留核心矩阵、INT8/FP16 VAE、768p/10s及768p/15s均有成功样本；Dynamic VRAM、compiler、Kitchen + SOL及Triton 15s存在成功/失败混合结果。失败任务缺少结构化allocator统计，画质/音画质量尚未盲评；PDD因本机没有对应权重未运行。完整边界和数字见组合实测报告。
- 显存与清理：短测使用 4090 的 `cudaMallocAsync`；精确 native 2 步组合使用 `--cache-none --reserve-vram 0.5 --enable-dynamic-vram --async-offload 2 --disable-comfy-compiler`，VRAM_Debug 记录的峰值约 `21.4/23.98 GiB`，未发生 CUDA OOM。另有一轮 native + async + compiler auto 的 20 步有界探针在 H3 首次实际前向后长期无进展，约 `23.5/24.56 GiB`、进程私有内存约 `61.8 GiB`，已主动中止；不能把该组合写成已验证稳定。所有测试结束后已释放 8188、GPU 显存及本次隔离临时状态。
- 下一步：保持H3 compiler禁用和固定驻留；短负载优先Triton + SOL，768p/15s默认倾向CUDA + SOL并提示关闭Wallpaper Engine等后台GPU负载。优先修复History峰值可能低于运行中峰值、补充分阶段/allocator/失败任务统计，再决定是否追加Triton稠密或CUDA稠密的15秒单变量测试。
- 版本影响：未 bump package/lockfile 版本；新增可选 H3 后端与 PDD 属 minor 级候选，交由发布负责人统一决定。
- Token usage: unknown。
