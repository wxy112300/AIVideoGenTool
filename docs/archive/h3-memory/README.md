# H3 Memory 路线撤回说明

H3 Memory Optimization（`H3MemoryOptimization` / `H3AIMDOResidencyLimiter`）已撤回，不再是 Local Video Studio 的产品执行路线。现有证据不足以把第三方节点的显存、host RAM、WDDM shared-memory 或长帧行为当作稳定的应用能力；因此应用不再展示、扫描、安装或注入 `H3-Optimizations`。

当前 H3 性能路径改用 ComfyUI 0.35.0 的公开原生接口：`ModelAttentionBackend`、`BlockSparseAttention`、原生动态显存/async offload 与独立的内存编译开关。每个任务冻结自己的执行策略；Spectrum、LoRA、采样和预览保持独立，不能由旧 Memory 字段隐式打开。

为保证兼容，旧 draft、queue、history/retry 中的 H3 Memory 字段仍可读取，但只归一为撤回状态，不会重新写入失败节点；不删除用户的历史记录、媒体、模型或外部 `custom_nodes` 文件。旧长计划已删除，当前实现与验证入口是 [ComfyUI 0.35.0 / H3 TASK](../../tasks/2026-09-10-comfyui-035-h3/TASK.md)。

独立边界仍然有效：历史调查中记录的 Sage 2++ 在 Windows SM89 上的进程退出属于特定 Sage/kernel 与运行环境组合的问题，并非 H3 Memory 开启的必要结果；不能扩大为所有 Sage 后端均不可用。具体判断以当前核心、kernel 和实际运行证据为准。
