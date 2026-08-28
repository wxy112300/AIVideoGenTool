# MiniMax H3 Memory Optimization 接入计划

状态：**产品功能已隐藏并强制关闭；仅保留可选安装入口与实现历史**

> 2026-08-27 产品决定：在上游兼容性、长帧 host RAM 与 WDDM shared-memory 行为进一步改善前，不向用户提供 H3 Memory。所有新旧 draft、队列、历史重试和工作流请求均归一为 `off`；Create 与 Queue 不显示相关信息；`H3-Optimizations` 仅在 Settings 保留手动可选安装，不参与批量安装或运行就绪判断。下文是调查与实现历史，不代表当前可用合同。
调查基线：**2026-08-27**
目标执行者：**Luna Max**
产品版本建议：**0.51.0（minor）**
上游观察点：[`Zironic/H3-Optimizations`](https://github.com/Zironic/H3-Optimizations)；2026-08-27 重新复查时 `pyproject.toml` 为 `0.2.20`，远端 `main` 最新发布提交为 `e15f6534bb5841ff4e6a92ea5f9b42fca0e32746`。当前 `recommendedVersion` 暂时跟随 `0.2.20`，commit 只用于证据追踪，不作为安装/启用硬条件。

> 本文是实施合同，不是运行完成证明。文中引用的显存和速度数据来自上游作者，必须在本项目实际 ComfyUI、Torch、Comfy Kitchen、GPU 和工作流组合上复测后才能进入产品文案。

## 1. 结论先行

本次应接入的是第三方 ComfyUI 节点包 `H3 Optimizations` 中的 `H3MemoryOptimization`，不是本项目已经接入的 Spectrum。

第一版产品决策如下：

1. 将 **H3 Memory Optimization** 做成独立的 H3 工作流能力。
2. 目标默认是：节点在所选 ComfyUI 中已安装、运行时 schema/capability 受支持、当前 H3 模式通过兼容策略、且用户从未手动选择时，默认开启“保留原生精度”档。但首轮实现必须由 catalog/release gate 保持自动开启关闭；只有本文 Gate B 的真实 A/B 和连续运行测试通过后，才在同一发布分支把 gate 打开。
3. 默认参数必须由应用显式写入，不能继承上游目前允许 FP8 转换的 `Auto` 精度默认值：
   - `precision_mode = "Preserve native"`
   - `qkv_streaming_mode = "Auto"`
   - `mlp_memory = "auto"`
   - `chunk_rows = 4096`
4. UI 只能描述为“近无损/不主动改变 checkpoint 精度的显存优化”；不能承诺逐位无损。
5. `H3SparseAttention` 不随 Memory 开启。它默认只保留 30% target-video KV，会改变模型计算、提示词遵循、运动和细节。首个 Memory PR 不增加 Sparse UI，但必须同时落地本文定义的 Attention 单选层、冲突解析和测试边界，为后续默认关闭的实验能力留出唯一入口。
6. `H3AIMDOResidencyLimiter` 是 Memory 运行时边界的一部分。上游生产文档推荐以 `2 blocks` 起步；端到端 benchmark 的 `0 blocks` 只是为了固定各 attention arm 的权重驻留变量，不是生产默认。数值 limiter 依赖 DynamicVRAM、async weight offloading 和 pinned staging。应用的 `h3-memory` profile 显式启用 DynamicVRAM 与两条 async stream、保留 pinned staging，并固定 `2 blocks`；Windows SM89 实测禁止同时启用进程级官方 Sage。普通 H3 的同步 offload 安全 profile 保持独立。
7. 缺少可选节点时，现有普通 H3 必须继续可运行；不得把它提升为所有 H3 的硬依赖。
8. 上游仓库当前没有明确 LICENSE、没有 GitHub Release/tag，且更新非常快。许可未明确前不得把源码或预编译 DLL/`.so` 随应用再分发；安装必须作为外部 custom node 处理。产品快速跟随当前上游，但每次执行和验证都记录实际 version/commit，不把固定 commit 设为安装或启用条件。

## 2. 调查事实

### 2.1 上游对象

- Reddit 帖子：[How much VRAM does H3 need? Less than you might think.](https://www.reddit.com/r/StableDiffusion/comments/1vz2n7y/how_much_vram_does_h3_need_less_than_you_might/)
- 仓库：[Zironic/H3-Optimizations](https://github.com/Zironic/H3-Optimizations)
- Comfy Registry 包名：`h3-optimizations`
- 节点包显示名：`H3 Optimizations`
- Python：`>=3.10`
- ComfyUI：`>=0.33.0`，且必须支持原生 MiniMax H3 和 `comfy_api.latest`
- `pyproject.toml` 的 `dependencies = []`；Memory-only 不需要额外模型权重，也不应把 Sparse Sage、Triton 或 H3-Extended 误报成硬依赖。

调查期间上游从 `0.2.16` 连续更新到 `0.2.20`；2026-08-27 复查得到当前 `main` commit `e15f6534bb5841ff4e6a92ea5f9b42fca0e32746`。Reddit 原帖、网页缓存、Registry 和实时源码可能处于不同版本；执行者必须在**正式开工当日**重新读取远端 `main`、`pyproject.toml`、节点 schema、README 和关键 resolver 源码。实施以当日最新上游为目标，推荐值暂时随当前上游版本更新，不要求回退或 checkout 到旧观察点。

### 2.2 四个节点必须分开理解

| 节点 ID | 作用 | 是否改变模型计算 | 本计划处理 |
| --- | --- | --- | --- |
| `H3MemoryOptimization` | 分块 QKV、MLP、FinalLayer，流式 Q/输出并保留兼容 attention | 默认安全档不主动改变 checkpoint 精度，但可能有浮点级差异 | **第一版接入** |
| `H3AIMDOResidencyLimiter` | 限制 DynamicVRAM/AIMDO 常驻权重页 | 不改变模型数学；影响权重驻留和速度 | **第一版接入，固定 2 blocks** |
| `H3SparseAttention` | 固定密度稀疏 attention，默认 30% video KV | **会改变** | 第一版明确不接入 |
| `H3SparseAttentionAdvanced` | 自定义 early/middle/late KV 和 backend | **会改变** | 第一版明确不接入 |

### 2.3 Memory 节点的工作方式

`H3MemoryOptimization` 是 `MODEL -> MODEL` patch：

- 对兼容 QKV 权重按 token rows 分块；默认 `4096` rows。
- 对已知 dense attention consumer 保留全局 K/V，分块处理 Q 和 attention output。
- MLP、FinalLayer norm/modulation、FP32 output projection 使用同一 `chunk_rows` 分块。
- `qkv_streaming_mode = Auto` 会保留当前 Comfy/Kitchen/Sage attention；未知 override 保留原 full-Q 单次调用，不应擅自替换。
- 不兼容能力在安全模式下回退到上游 H3 路径；节点存在不等于优化实际生效，必须读取执行状态/日志。

当前公开输入 contract：

| 输入 | 上游值 | 产品策略 |
| --- | --- | --- |
| `model` | `MODEL` | 必填 |
| `fused_qkv` | hidden legacy `auto/off` | 显式写 `auto`，不暴露 UI |
| `mlp_memory` | `auto/off` | 默认 `auto` |
| `chunk_rows` | 256–65536，步长 256，默认 4096 | 默认 4096；高级设置后置 |
| `preserve_precision` | hidden legacy boolean | 显式写 `true`，不暴露 UI |
| `precision_mode` | `Auto/BF16/Preserve native/Force quant` | 默认 `Preserve native` |
| `qkv_streaming_mode` | `Off/Auto/Forced` | 默认 `Auto` |

### 2.4 上游性能证据的正确解读

上游 RTX 4070 12GB、1376×768 测试中，`SageAttention + H3 Memory Optimization` 相对 dense Sage 路径在 5 秒样例约减少 1.8 GiB 峰值显存，在 10 秒样例约减少 2.7 GiB，steady-step 时间接近；显著加速主要来自另一个 30% KV Sparse 节点，不是 Memory 本身。

这些数据只能形成接入假设，不能直接形成产品最低显存承诺，原因包括：

- 20-step 时间是由短测中位数投影，不是完整 20-step wall time；
- 作者关闭了 NVIDIA CUDA sysmem fallback；
- whole-GPU peak 来自 `nvidia-smi`，环境和桌面占用会变化；
- 未覆盖本项目全部 INT8、INT4、R2V、Turbo、Spectrum、SLA、Motion Context 和 Q3 组合。

### 2.4.1 2026-08-27 本机运行证据

当前验证环境为 Windows 11、RTX 4090（SM89、24 GB）、ComfyUI
`v0.33.4+55`（`ef0d752e`）、
Python 3.12.11、PyTorch 2.10.0+cu130、SageAttention
`2.2.0+cu130torch2.10`、H3 Optimizations 0.2.20（`e15f653`）和
comfy-aimdo 0.4.15。

已验证结果：

- `H3MemoryOptimization + DynamicVRAM + async-offload 2 + pinned memory +
  AIMDO 2 blocks + existing/PyTorch attention` 的 5 帧 smoke 完成并生成可播放
  MP4。
- 同一执行路径的 1376×768、124 帧 smoke 完成并生成可播放 MP4。
- 360 帧单段运行进入 shared GPU memory/WDDM 分页后未到达稳定 sampler step，
  不属于已支持边界。
- 在同一台机器启用进程级 `--use-sage-attention` 后，5 帧 smoke 最初在 H3
  `preprocess_text_embeds -> TokenRefiner -> attention_sage` 路径进入 SM89 FP8
  PV native kernel，并以 `Fatal Python error: Aborted` 终止进程。局部固定
  TokenRefiner 为 PyTorch 后，文本预处理能够完成，50 个主 DiT block 也明确解析为
  `attention=sage_mem_eff`；同步 CUDA 诊断随后把首个 native abort 定位到主 DiT
  的 `dense_streamed_sage.py:execute_projected`，而不是 AIMDO 文件预取。
- H3 Optimizations 支持的三个 SM89 CUDA FP8-V kernel（FP32+FP16 inst-buffer、
  FP32+FP32 inst-buffer、FP32 non-inst-buffer）均在首个主 DiT block 原生终止。
  改走 ComfyUI 公开 Sage 路径、关闭 QKV streaming 后，仍在
  `sageattention/core.py:sageattn` 原生终止；将 async offload 从 2 流减为 1 流也
  未改变结果。因此本机失败边界是 SageAttention 2.2.0 的 SM89 CUDA FP8-V 路径，
  不是仅由 TokenRefiner、H3 私有 wrapper 或双流卸载造成。
- 不启用全局 Sage，在模型链上使用 KJNodes
  `sageattn_qk_int8_pv_fp16_triton -> H3MemoryOptimization ->
  H3AIMDOResidencyLimiter(2 blocks)` 后，5 帧和 124 帧 smoke 都生成了可播放 MP4。
  但后续 UI 端到端运行的 provider 证据证明 KJ override 被 H3 Optimizations 识别为
  `existing_full_q`：`qkv_provider=standard_h3_qkv`、`memory=baseline`，原因为
  `unknown explicit attention override with full-Q single-call semantics`。因此这两次输出
  只能证明 KJ Triton 可运行，不能证明 bounded-Q Memory 与其同时生效；此前将其记为
  Memory 混合路径成功属于验证结论错误。

因此，Memory-on 的 `sage` 和 `sage-triton` 请求都必须移除 KJ override 并归一为
PyTorch/Comfy attention，以保证 H3 Optimizations 实际启用 bounded QKV。Memory-off
任务仍保留用户选择的 KJ Triton Sage。该结论不能外推成“H3 Memory 与 Sage 普遍
不兼容”；它表示当前 KJ override 尚未实现 H3 Optimizations 要求的
`supports_streamed_h3_qkv` consumer contract。上游作者
已经在 RTX 4070 12 GB 上公开完成 124 帧和 243 帧的
`SageAttention + H3 Memory Optimization` benchmark；ComfyUI issue
[#15566](https://github.com/Comfy-Org/ComfyUI/issues/15566) 也记录了 Windows、
DynamicVRAM、SageAttention 和长序列 H3 组合下的同类 native abort，包括 RTX
4090 的 `illegal memory access` 报告。社区证据说明该组合对具体 GPU、Torch、
Sage wheel、序列长度和异步内存时序敏感，而不是结构上互斥。

当前产品策略不再放行 KJ Triton + Memory。后续若 KJNodes 或一个受维护的适配器
实现 streamed-H3 consumer contract，必须先以 provider 日志证明 QKV 不再是
`standard_h3_qkv` 且 memory 不再是 `baseline`，再重新开放组合。后续性能 A/B
必须使用相同 seed、尺寸、帧数、step、模型热身状态，并分别记录 sampler 时间、
总 wall time、dedicated/shared GPU memory，才能判断相对 PyTorch 的实际加速幅度。

成功标准不是“同时显示两个开关”，而是 124 帧真实输出完成、主 DiT 确认执行
Sage、无 native abort，并与 PyTorch 基线比较 sampler step time、峰值 dedicated/
shared GPU memory 和总 wall time。若只解决 TokenRefiner 但主 DiT 回退 PyTorch，
该实验仍判定为未实现 Sage 加速。

### 2.5 加速能力分层与组合原则

不要把每个优化都实现成可以任意勾选的独立开关。H3 的执行能力必须按层解析：

| 层 | 负责什么 | 本项目选项 | 组合规则 |
| --- | --- | --- | --- |
| 权重/采样配置 | 改变模型权重、步数和采样约束 | 普通 LoRA、LightX2V Turbo、Turbo-SLA | 普通 LoRA 按 catalog 规则叠加；加速/Turbo LoRA 同一任务最多一个 |
| Attention 实现 | 每次真实 Transformer 调用具体如何计算 attention | PyTorch/Comfy dense、KJ Sage dense、H3 Sparse、`H3SLAAttention` | **互斥单选，只能有一个 effective attention owner** |
| 内存执行 | 分块 QKV、MLP、FinalLayer 和输出投影 | `H3MemoryOptimization` | 可包裹一个已选 Attention；不拥有第二套 attention 数学 |
| 调用预测 | 哪些 Transformer 调用实际执行、哪些由预测代替 | Spectrum | 与前面不同层；结构可组合不代表质量已验证 |
| 观察 | 中间预览和进度 | `ModelPreviewOverrideKJ` | 不参与加速选择，保持链尾 observer |

速度关系近似为：

```text
总耗时 ≈ 实际 Transformer 调用次数 × 每次调用成本 + VAE/音频/IO
```

- Turbo 改变权重/采样配置并通常减少步数；
- Spectrum 减少真正执行的 Transformer 调用；
- Sage 或 Sparse 二选一，降低每次真实调用中的 attention 成本；
- Memory 主要降低每次真实调用的峰值显存，不能宣传为固定倍数加速；
- 多项收益不会线性相加，越靠后通常收益递减，但质量和诊断复杂度仍会增加。

`Sparse Sage` 是 `H3SparseAttention` 内部可选择或自动回退到的稀疏 kernel backend，不是本项目现有 KJ dense Sage 上再叠一层 Sparse。当前上游 [`apply.py`](https://github.com/Zironic/H3-Optimizations/blob/main/h3_optimizations/apply.py) 会在发现没有 H3 sparse composition contract 的外部 attention override 时保留外部 override 并关闭 Sparse。因此 UI 和执行计划都不得把“KJ Sage + H3 Sparse”显示为两项同时生效。

Spectrum 当前通过 DIFFUSION_MODEL、OUTER_SAMPLE、PREDICT_NOISE、SAMPLER_SAMPLE 等 wrapper 工作，属于调用预测/采样层，而不是另一个 attention backend；实现证据见上游 [`minimax_h3.py`](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/blob/main/comfyui_spectrum_h3/minimax_h3.py) 和 [`sampling.py`](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/blob/main/comfyui_spectrum_h3/sampling.py)。这解释了为什么它结构上能和一个 Attention owner、Memory 共存，也解释了为什么仍需单独验证预测误差和连续任务清理。

### 2.6 组合真值表与产品分级

| 请求组合 | 实际关系 | 产品等级 | 必须执行的策略 |
| --- | --- | --- | --- |
| KJ Triton Sage + Memory Preserve Native | 外部 full-Q override 缺少 streamed-H3 contract | 当前不支持 | 移除 KJ override，归一为 PyTorch/Comfy attention 后插入 Memory |
| PyTorch/Comfy dense + Memory | 不同层，可共同生效 | 正式候选 | 插入 Memory，保留 dense backend |
| H3 Sparse + Memory | 不同层，可共同生效 | 实验 | Attention 选 Sparse；Memory 可开；首个 Memory PR 不暴露 Sparse UI |
| KJ Sage + H3 Sparse | 同一层冲突 | 禁止 | 不得静默显示两者开启；交互时切换为 Sparse 或保留 Sage，入队前必须归一成一个值 |
| `H3SLAAttention` + KJ Sage | 同一层冲突 | 禁止 | 选择 Turbo-SLA 时由 SLA 独占 Attention，强制取消 Sage |
| `H3SLAAttention` + H3 Sparse | 同一层冲突 | 禁止 | 选择 Turbo-SLA 时强制取消 Sparse |
| Spectrum + KJ Sage | 不同层 | 已有受支持路径 | 保留现有语义和版本能力检查 |
| Spectrum + Memory | 不同层，可共同生效 | **允许组合** | 同时保留两项请求，构建 `Memory -> Spectrum`；A/B 只更新验证证据，不得阻止入队或自动关闭任一项 |
| Spectrum + H3 Sparse | 不同层但双重近似 | 实验 | 首轮默认关 Spectrum；必须单独同 seed A/B 后才允许 |
| 普通 Turbo + KJ Sage + Memory | 不同层 | 正式候选 | 只允许一个 Turbo；使用该 Turbo 的固定 sampler/scheduler/shift contract |
| 普通 Turbo + Spectrum | 不同层但都改变实际采样轨迹 | 条件支持 | 保留 Spectrum >=0.2.6 等当前合同；每个 Turbo 变体单独验证 |
| 普通 Turbo + H3 Sparse | 不同层但质量变量叠加 | 实验 | 不作为普通 UI 组合；先分别验证，再验证组合 |
| Turbo-SLA + Memory | SLA 独占 Attention，Memory 为外层 | 实验 | 只有上游 contract 和真实 smoke 均通过才允许 Memory |
| Turbo-SLA + Spectrum | 两个模型行为 patch | 实验/首轮禁用 | 不沿用普通 Turbo 的允许结论 |
| Spectrum + Sparse + Turbo | 结构上未必冲突，但同时改变调用数、attention 和权重/步数 | 禁止普通使用 | 不提供自由组合；仅研究/fixture 可显式构造 |
| Motion Context + Spectrum | 现有产品合同冲突 | 禁止 | 延续强制关闭 Spectrum |
| Q3 GGUF + LoRA/Spectrum/新优化 | 现有低显存专用路径 | 禁止直到专项验证 | 保持当前 Q3 policy，不从普通 H3 结论外推 |

“允许组合”表示产品必须允许用户入队并构建相应工作流；“尚未真实验证”只能影响验证徽标、提示文案和是否作为默认推荐，不能被实现成 runtime conflict。只有表中明确标记“禁止”或由模型、节点 schema、唯一 Attention owner 等硬条件实际拒绝的组合，才可以阻止入队。

### 2.7 单一执行计划解析器

实施时新增一个领域层 `resolveMiniMaxH3ExecutionPlan()`（名称可按现有模块习惯调整），让 renderer、enqueue、workflow adapter 和 history 共用结果，不在四处复制组合判断。输入是不可变 task snapshot 和 dependency/runtime capability，输出至少包含：

```ts
interface ResolvedMiniMaxH3ExecutionPlan {
  attention: "pytorch" | "sage" | "h3-sparse" | "sla";
  memory: "off" | "preserve-native" | "auto" | "force-quant";
  spectrumEnabled: boolean;
  turboProfile?: string;
  previewEnabled: boolean;
  allowed: boolean;
  reasons: string[];
  normalizedFrom?: string[];
}
```

解析优先级必须固定：

1. 先应用 model/mode 硬限制，例如非 H3、Q3、Motion Context。
2. 解析 Turbo/LoRA；同一任务出现多个 Turbo 立即阻止入队。
3. Turbo-SLA 出现时 Attention 强制为 `sla`，Sage/Sparse 请求形成明确的 UI 归一化提示；对旧队列中的冲突快照 fail closed，不能猜测。
4. 非 SLA 时 Attention 从互斥状态选择 `pytorch`、`sage` 或未来的 `h3-sparse`；不得生成两个 Attention patch。
5. 在选定 Attention 之后独立解析 Memory。Memory 节点的 runtime fallback 不能改写用户请求，但必须进入证据/日志。
6. 最后解析 Spectrum 和 Preview；Spectrum 依据完整组合矩阵决定，而不是只检查 H3 family。标准 H3 的 Spectrum + Memory 必须同时解析为 enabled/allowed，不得产生 `spectrum-memory-conflict`，也不得为了通过 policy 自动关闭其中一项。
7. queue 保存 requested state 和 resolved plan；排队后 draft 或环境扫描变化不得改变该 task 的执行计划。执行前 `/object_info` 只验证计划能否运行，不重新选择另一种算法。

首个 Memory PR 可以不新增 `h3-sparse` 的用户字段和节点注入，但 resolver、类型边界和测试必须证明 Sage/SLA 互斥，并为未来 Sparse 保留单一 Attention slot。后续接入 Sparse 时扩展该 slot，不能再加独立 boolean。

### 2.8 许可与供应链 gate

调查基线的仓库根目录没有 `LICENSE`/`COPYING`，`pyproject.toml` 也没有 license 字段。公开 GitHub 仓库不等于获得复制、修改或再分发授权。

实施前必须完成下列二选一：

1. 上游补充明确许可证，并完成内部许可复核；或
2. 产品只登记外部来源和检测信息，不 vendor、不打包、不镜像源码/二进制；安装动作清楚告知用户来源，并按用户选定 ComfyUI 安装处理。

在许可不明确时，当前产品采用“用户显式触发的外部安装”分支：

- catalog 项设置 `required: false`、`bulkInstall: true`、`appInstallable: true`；
- Settings 提供一个统一的单卡安装 action，全部安装也可以包含该节点；两者都从上游仓库获取，并沿用现有安装日志、重启和复检流程；
- 安装动作必须明确显示上游来源，只处理用户选定的 ComfyUI，不在后台自动修改节点；
- 不得把上游源码、DLL 或 `.so` 放进本仓库、安装包或应用缓存。

## 3. 本项目当前边界

### 3.1 已有能力

- H3 模型、权重目录和 variants 在 `src/core/catalog/models/`。
- custom node catalog 在 `src/core/catalog/dependencies/nodes.ts`。
- H3 API 工作流在 `workflows/minimax_h3_*.json`。
- H3 动态 model patch 集中在 `src/core/workflow.ts`：LoRA、KJ Sage、SLA、Turbo sampler、Spectrum、live preview。
- Spectrum 已实现默认开启但尊重 `userSet` 的完整范式，可作为状态和 UI 模板。
- queue task 是不可变执行快照；history 保存复现参数。
- 运行前有 `/object_info` class type 检查，但视频路径目前缺少该新节点所需的精确 input contract 验证。

### 3.2 当前进程策略的关键限制

`electron/services/comfy-runtime-policy.ts` 的标准 profile 当前使用：

普通 H3 的标准 profile 使用 `--cache-none`、受限 reserve VRAM、`--disable-pinned-memory` 和 `--disable-async-offload`。Memory-on 使用独立 `h3-memory` profile：保留 `--cache-none` 和 reserve VRAM，显式加入 `--enable-dynamic-vram --async-offload 2`，保留 pinned staging，不加入 `--use-sage-attention`。

因此：

- `H3MemoryOptimization` 的 Comfy existing attention 路径是当前 Windows SM89 真实验证路径。Memory-on 的 Sage 请求由共享 resolver 记录并规范化为 `pytorch`，模型链移除 `PathchSageAttentionKJ`；不得用进程级官方 Sage 或 KJ override 覆盖该路径。
- Memory-on 工作流在 H3 patch 链末尾插入 `H3AIMDOResidencyLimiter(residency="2 blocks")`，采用上游生产推荐起点；提交前必须验证节点 schema 和该枚举值。`0 blocks` 仅用于控制驻留变量的 benchmark，不作为生产默认。
- 不得修改 `standard` profile 或把 async offload 全局打开；DynamicVRAM/async/pinned 仅由任务级 `h3-memory` profile 启用，并通过任务边界重启对齐。

## 4. 产品与状态设计

### 4.1 字段设计

建议新增：

```ts
export type H3MemoryOptimizationMode =
  | "off"
  | "preserve-native"
  | "auto"
  | "force-quant";

interface Draft {
  h3MemoryOptimizationMode: H3MemoryOptimizationMode;
  h3MemoryOptimizationUserSet?: boolean;
  h3MemoryChunkRows: number;
}
```

`h3MemoryChunkRows` 选择“可复现参数”方案，使用一个明确来源：Draft 必填且默认 4096，queue/history 必填；旧记录迁移补 4096。即使第一版 UI 不显示高级控件，也不能同时在 adapter 里维护另一份隐式常量。

字段必须进入：

- image-to-video draft；
- video-extension draft（即使当前模式策略强制关闭，也要保留该模式自己的用户选择）；
- generation/extension queue snapshot；
- video history asset/version；
- copy/retry/use-again 参数恢复；
- queue/history 展示。

不要只存 boolean。`preserve-native` 和上游 `Auto` 有真实执行差异；未来若开放性能档，旧 boolean 会迫使二次迁移。

`h3MemoryChunkRows` 第一版可以暂不显示 UI；若实现高级控件，必须验证 256–65536 且能被 256 整除。

### 4.2 默认与迁移语义

底层默认值和旧记录迁移必须保守：

- 旧 queue/history 缺字段：迁移为 `off` + `h3MemoryChunkRows = 4096`，保证已排队/历史重试不会突然改变执行图。
- 新 draft 的底层默认：`off` + `h3MemoryOptimizationUserSet = false` + `h3MemoryChunkRows = 4096`。
- 实现 `shouldEnableH3MemoryOptimizationByDefault()`，但再增加 catalog/release 常量 `H3_MEMORY_DEFAULT_ENABLED`。Gate A 阶段固定为 `false`；只有 Gate B 通过后改为 `true`。gate 开启后，环境扫描发现节点已安装、模型/模式允许且用户未手动选择时，才自动切为 `preserve-native`。
- 用户手动选过任意值后，扫描、刷新、模式往返不能覆盖选择。
- 节点后来卸载/未加载时保留用户选择，但 UI 显示不可用；不得偷偷把 `preserve-native` 写回 `off`。

这样能同时满足“可用时默认开启”和“缺可选节点时普通 H3 不被阻塞”。

### 4.3 UI 设计

位置：Create 页 H3 的 Steps、Spectrum 所在计算/增强区域，不新增独立大卡片。

首版 select 文案建议：

- `关闭 · 原生工作流`
- `保留原生精度 · 推荐`
- `自动精度 · 更激进`
- `强制量化 · 实验`

行为：

- `preserve-native`：节点可用时默认选中。
- `auto`：明确提示“上游可能使用 FP8 转换；结果和显存表现需逐任务验证”。
- `force-quant`：默认不展示，或放在 Advanced 且带实验警告；未完成实测前不得进入普通下拉。
- 节点未安装：只允许 `off`，旁边提供 Settings 安装/来源指引。
- 已安装但 runtime 未加载：保留选择，提交时给出“重启 ComfyUI 并复检”的阻塞原因。
- 当前 model/mode 未验证：禁用非 off 选项并解释原因。

Queue 卡片显示请求档位，例如 `H3 显存优化 · 保留原生精度`；History 同时保存请求值和实际 runtime 证据。若无法从节点 status 获取实际 provider，至少显示“已请求”，不能显示“已生效”。

Attention UI 必须遵循“一个 owner”的模型。首个 Memory PR 继续复用当前 PyTorch/KJ Sage 控件，并在 Turbo-SLA 生效时显示由 SLA 接管；未来开放 Sparse 时，将其加入同一个互斥 select/radio，而不是新增第二个开关：

```text
Attention
- PyTorch / Comfy Dense
- Sage Dense
- H3 Sparse（实验）
- SLA Attention（由 Turbo-SLA 自动选择，只读）
```

用户在可编辑 draft 中选择 Sparse 时，应原子地取消 Sage；选择 Turbo-SLA 时应原子地进入 SLA。不要保留“两个开关都亮但其中一个被上游静默忽略”的 UI 状态。旧 queue/history 若含未来无法归一的冲突字段，显示原始请求并禁止直接执行，要求复制为新 draft 后重新选择。

### 4.4 第一版支持矩阵

实现 policy 时必须 fail closed；不要把 `family === minimax-h3` 当成全部兼容。

| 组合 | 第一版默认策略 | 放开条件 |
| --- | --- | --- |
| FL2VA INT8 + PyTorch/Comfy attention | 候选支持 | object_info + real A/B smoke |
| FL2VA INT8 + KJ Sage | 候选支持 | real A/B smoke；确认实际 streamed provider |
| FL2VA INT4 | 候选支持但默认先关闭 | INT4 原生精度和 fallback 实测 |
| R2V 初始生成 | 候选支持 | 单图、多参考、视频/音频输出 smoke |
| 普通 LightX2V Turbo | 候选支持 | 同 seed、同参数 smoke |
| Spectrum + Memory | **允许；尚未验证时显示非阻塞提示** | 始终允许入队并构建 `Memory -> Spectrum`；实测只决定“已验证”状态和默认推荐，不决定运行许可 |
| Turbo-SLA / `H3SLAAttention` | 初始 fail closed | 上游只称部分支持；必须真实运行 |
| H3 Sparse + Memory | 实验、首个 Memory PR 不暴露 | 单独 Sparse 基线通过，再验证 Memory；不得同时保留 KJ Sage |
| Spectrum + H3 Sparse | 禁止普通使用 | 单独同 seed A/B；不得从 Spectrum+Sage 结论外推 |
| Motion Context extension | 初始 fail closed | 续写接缝、音频和 latent 保存/恢复 smoke |
| Q3 GGUF 3080 profile | 禁用 | 上游明确支持该 loader/权重 contract 且完成 3080 smoke |
| 非 H3 模型 | 不显示/不插入 | 永久保持 pass-through |

如果实施过程中完成真实测试，把证据写入 catalog `compatibilityEvidence`。没有实际运行证据时显示“尚未验证”，但不得把架构上允许的 Spectrum + Memory 改成 disabled 或 conflict。Q3、Motion Context、Attention 多 owner 等明确禁止项继续 fail closed。

## 5. 工作流接入设计

### 5.1 不复制 JSON

保留所有 H3 API JSON 作为基线。仿照 Spectrum，在 `src/core/workflow.ts` 增加纯函数动态插入/移除节点。

目标 model chain：

```text
H3 loader
  -> LoRA(s)
  -> exactly one selected attention patch（PyTorch/Comfy、KJ Sage、H3 Sparse 或 Turbo-SLA）
  -> H3MemoryOptimization
  -> Spectrum（仅兼容策略允许时）
  -> ModelPreviewOverrideKJ
  -> BasicScheduler + BasicGuider
  -> sampler
```

调用顺序固定为：

1. placeholder 和模型/LoRA 参数映射；
2. 调用 `resolveMiniMaxH3ExecutionPlan()`，先处理 Turbo/LoRA，再解析唯一 Attention owner；
3. 按 resolved plan 应用 PyTorch/KJ Sage/H3 Sparse/Turbo-SLA 中恰好一个 Attention 路径；
4. Turbo sampler/scheduler 参数；
5. **一次性执行 H3 model-patch chain planner**，共同计算 Memory、Spectrum、Preview 的 desired patch set 并最终重建整条链；
6. 空引用清理、输出和 unload 处理。

不得在 chain planner 完成后继续调用当前会直接改接 consumers 的 `applyMiniMaxH3Spectrum()` 或总是新增节点的 `applyMiniMaxH3LivePreview()`。实施时要么把两者吸收到统一 planner，要么把它们重构为共享的 chain-aware upsert；整个 render 过程只能有一个最终 model-chain owner。

### 5.2 `normalizeMiniMaxH3ModelPatchChain` 合同

实现一个可单测的 graph adapter。它不能只看 Scheduler/Guider 的直接 upstream；必须先解析并规范化完整的已知 model patch chain。

要求：

1. 找到 `BasicScheduler` 和 `BasicGuider` 的共同最终 model；若二者不同则 fail closed。
2. 从 consumers 向上解析已知节点，识别已有 `ModelPreviewOverrideKJ`、`SpectrumApplyMiniMaxH3`、`H3MemoryOptimization`、KJ attention、H3 Sparse 和 `H3SLAAttention`；遇到未知多分支、循环或无法确定单一 upstream 时 fail closed。
3. 验证 Attention owner 数量不超过一个。KJ Sage、H3 Sparse、`H3SLAAttention` 同时出现不是可接受的“组合”，必须报告冲突；不得依靠节点顺序碰巧覆盖。
4. 先摘下应用管理的 Memory/Spectrum/Preview 节点，保留它们的 ID 和最底层 upstream，再按唯一顺序重建：`one attention owner -> Memory -> Spectrum -> Preview -> consumers`。输入 workflow 已含 Spectrum 或 Preview 时也必须得到该顺序，不能产生断开的 Memory no-op。
5. 检测已有 `H3MemoryOptimization`：
   - 超过一个：报错，禁止依赖节点顺序；
   - 开启：复用节点 ID、覆盖为 queue snapshot 的明确输入，不叠加第二个；
   - 关闭：将所有 `[memoryNodeId, 0]` 引用恢复为该节点的 `model` upstream 后删除节点。
6. 开启时使用以下 TypeScript 结构；进入 adapter 前必须完成 `h3MemoryChunkRows` 的范围和 256 整除校验，4096 默认值只存在于 defaults/migration：

```ts
{
  "class_type": "H3MemoryOptimization",
  "inputs": {
    "model": ["<upstream>", 0],
    "fused_qkv": "auto",
    "mlp_memory": "auto",
    "chunk_rows": task.h3MemoryChunkRows,
    "preserve_precision": true,
    "precision_mode": "Preserve native",
    "qkv_streaming_mode": "Auto"
  }
}
```

7. `auto` 只把 `precision_mode` 改成 `Auto`；`force-quant` 只改成 `Force quant`。不要让 UI mode 改写 sampler、steps、scheduler、Spectrum 或 attention。
8. 重建完成后 Scheduler/Guider 必须共同消费 Preview（若有）或最终 model patch；逐个断言 Memory/Spectrum/Preview 都能从 consumers 反向到达，不允许孤立节点。
9. 自定义 workflow 若已含该节点，off 必须真的移除；不能让 UI 显示关闭但图中继续执行。
10. 若自定义 graph 的 model chain 无法无歧义解析，给出具体错误，不猜节点。

### 5.3 Workflow metadata

在 `src/core/workflow-metadata.ts` 中：

- 只给 policy 允许注入的 bundled H3 workflow 增加 `h3-optimizations` package ID；
- 不要把它加入 Q3 或 Motion Context metadata，除非对应 gate 已通过；
- 保留 JSON 为纯 `/prompt` payload，不写顶层 metadata。

## 6. 依赖检测、安装和运行时验证

### 6.1 Catalog 项

在 `src/core/catalog/dependencies/nodes.ts` 增加：

```ts
{
  id: "h3-optimizations",
  name: "H3 Optimizations",
  purpose: "为 MiniMax H3 分块 QKV、MLP 和 FinalLayer，降低长序列峰值显存",
  repositoryUrl: "https://github.com/Zironic/H3-Optimizations.git",
  directoryName: "H3-Optimizations",
  aliases: ["h3-optimizations", "H3-Optimizations"],
  nodeTypes: ["H3MemoryOptimization"],
  minimumVersion: "0.2.16",
  recommendedVersion: "0.2.20",
  latestVersion: "0.2.20",
  bulkInstall: true,
  appInstallable: true,
  required: false
}
```

`minimumVersion` 表示已知能够提供完整 Memory contract 的下限；当前 `recommendedVersion` 暂时跟随上游 `0.2.20`，`latestVersion` 同步当前上游发布元数据。后续更新时同步调整这两个值（当前实现由 `H3_MEMORY_RECOMMENDED_VERSION` 单点维护）、`compatibilityEvidence` 的 version/commit 和测试；commit 仍只用于证据，不作为安装或启用硬条件。同时写 `runtimeRequirement` 和 `compatibilityEvidence`：ComfyUI >=0.33.0、Python >=3.10、最近验证 version/commit、验证日期和验证级别。Memory-ready 必须同时验证 `H3MemoryOptimization` 与 `H3AIMDOResidencyLimiter` 的 runtime schema；sparse 节点仍只记录为可选 feature。

### 6.2 快速跟随上游与许可分支

当前 catalog/installer 主要面向 release 或 Git clone/pull。扫描端无论许可结果如何，都要增加通用、可测试的 version/revision 识别，但 commit 用于诊断和复现，不用于把用户挡在旧版：

- scanner 同时报告实际 version、commit、dirty state 和 source remote；
- 日志明确显示 repository、version、commit；
- Settings 提供“上游有更新”信息，但不把“不同于最后验证 commit”标为不兼容；
- 兼容判断优先使用 `/object_info` 的 node/input/enum capability 和必要的运行时 contract；未知较新版本只要 capability 满足即可进入 smoke，不因版本号本身 fail closed；
- 每次发布把实际验证的 version/commit 写入 `compatibilityEvidence` 和测试报告，保留可追溯性；
- 若上游删除/重命名输入或改变语义，adapter 必须显式适配新旧 schema 或报告 actionable error，不能用版本锁定掩盖 schema drift。

当前产品采用“许可未明确但用户显式触发的外部安装”分支：将该 catalog 项的 `appInstallable` 和 `bulkInstall` 设为 `true`，安装/更新跟随 Comfy Registry 当前版本或上游当前 main；仍在安全副本中完成获取、依赖检查和 schema 预检后再执行现有备份/替换。不得覆盖 dirty checkout；更新失败应恢复旧副本并保留完整日志。应用不 vendor、不打包上游源码或二进制，用户可手动保留旧版本，但产品不把旧 commit 设为默认目标。

### 6.3 `/object_info` 精确校验

启用时不能只检查 class type 存在。对 `H3MemoryOptimization` 验证：

- `model` input 存在且接受 `MODEL`；
- `mlp_memory` 包含 `auto`；
- `chunk_rows` 接受 4096；
- `precision_mode` 包含请求值；
- `qkv_streaming_mode` 包含 `Auto`；
- legacy inputs 只有在实际 `/object_info` 暴露时才写入；若新版移除，adapter 应使用能力分支构造新 schema，不能静默提交不存在的输入。

离线时只报告目录、version、commit；runtime 未连接是“待验证”，不是“缺失”。两阶段边界必须保持：

- **入队阶段**：使用离线目录、version/revision、policy 和静态 graph validation；ComfyUI 离线不应把基础 H3 判为不可入队。
- **执行阶段、提交 `/prompt` 前**：验证节点注册和精确 input/enum contract；不兼容时阻止该任务执行并指出实际缺少的 input/enum。
- Create 可以展示最近一次 runtime scan 的缓存状态，但不能把“服务离线”重写成“节点缺失”。

### 6.4 实际 provider 证据

节点的 Auto 路径可能回退。产品状态至少区分：

- requested；
- node registered / contract valid；
- execution reported optimized provider；
- execution reported fallback/no-op；
- execution failed。

`TaskPerformanceStats` 是数值资源遥测，不能承载 provider/fallback 字符串。若能稳定解析，新增独立可选类型 `h3MemoryRuntimeEvidence`，进入 task result/history version，包含 requested mode、provider/fallback、节点 version/commit 和日志关联；若第一版无法稳定解析，不伪造 active 状态，只保存 requested mode 和日志入口。

## 7. Runtime profile 与 AIMDO 后续阶段

### 7.0 2026-08-27 真实 GPU 复核

- 环境：RTX 4090 SM89、ComfyUI `0.33.0-55-gef0d752e`、Python `3.12.11`、Torch `2.10.0+cu130`、H3 Optimizations `0.2.20/e15f653`、comfy-aimdo `0.4.15`。
- `--use-sage-attention` 的 5 帧任务 `278e7597-a732-49f7-824d-29b108f81f80` 在 Memory 和 `2 blocks` limiter 生效后，于 `sageattention/core.py:149` 的 SM89 FP8 PV kernel 直接 `Fatal Python error: Aborted`。
- 2026-08-28 在 H3 Memory 完全关闭的正常工作流上独立复测 KJNodes `sageattn_qk_int8_pv_fp8_cuda++`：5 帧、256×256、3 steps、固定 seed `271828` 的 prompt `d087c4c6-7383-4324-ad82-acd1d89fc554` 在进入主采样节点后约 103.5 秒使 ComfyUI 进程级退出，WebSocket 中断且无输出；峰值显存仅 16,690 MiB、峰值 GPU 利用率约 75.75%。这排除了 H3 Memory 组合与 15 秒显存压力作为必要触发条件，当前 Windows RTX 4090/SM89 环境不得把 2++ 标记为 runtime validated。
- 移除全局 Sage 后，5 帧/256x256/3 steps 任务 `bfacbe43-54e4-4811-a06e-12cfd74efd01` 成功输出 `lvs_direct_h3_memory_5f_3s_00001_.mp4`，耗时 113.1 秒。
- 同一路径 124 帧/1376x768/3 steps 任务 `5773aca3-362b-471e-8f99-7e6465b2770d` 成功输出 `lvs_direct_h3_memory_124f_3s_00001_.mp4`，耗时 181.6 秒；首步约 104.5 秒，后续约 15-18 秒/步。
- 以上证明当前 H3 Optimizations 版本可用，但只验证到 124 帧。360 帧单段仍会进入 WDDM/shared-memory paging 且未产生 sampler step，不得标记为已支持或正常计算。

### 7.1 Memory-only 第一版

- `h3-memory` profile 使用已验证的进程条件：`--enable-dynamic-vram --async-offload 2`、pinned staging 保持启用，并禁止全局 `--use-sage-attention`。
- Memory patch 链末尾固定插入 `H3AIMDOResidencyLimiter(residency="2 blocks")`，采用上游生产推荐起点，在工作区与权重迁移开销之间保留平衡。
- 不新增全局环境变量。
- 不改变 `standard` profile、`--cache-none`、reserve VRAM、CPU VAE 或其他模型的阶段卸载。

### 7.2 AIMDO 可调策略（后续独立阶段）

只有在 Memory 第一版稳定后再评估：

1. 在现有任务级 `h3-memory` profile 上增加显式用户策略，不能改变 `standard` 全局含义。
2. queue snapshot 保存 AIMDO requested policy。
3. app-owned local ComfyUI 在任务边界事务式切换 profile；remote endpoint 只验证，不能重启。
4. 数值档要求 `NUM_STREAMS > 0`；否则 fail closed 或使用 `stock`，不得运行后才抛模糊错误。
5. 当前固定 `2 blocks` 与上游生产建议对齐；`0 blocks` 只用于 benchmark。只有真实显存/速度数据后才向用户开放其他档位或 Auto。
6. 验证从 AIMDO H3 切换到普通 H3、Qwen image、prompt-resident、Sulphur 后启动参数和显存状态恢复。

## 8. 文件级实施工作包

执行前重新读取每个目标文件、`git status` 和完整 `git diff`。若届时存在用户改动，尤其涉及 `src/types.ts`、`electron/store.ts`、`electron/main.ts`、Settings 或 dependency catalog，不得从本计划生成的旧快照覆盖当前内容。

### WP0：许可和开工时上游快照

- 核实上游 LICENSE。
- `git ls-remote` 记录开工时当前 `main`；读取同一快照的 `pyproject.toml`、node schema、README、attention resolver 和 patch composition 源码。
- 以当前上游为实现目标；将实际 commit、version、ComfyUI/Python 要求写入 catalog evidence，不能因为不同于本文观察点而停止。
- 对本文观察点到当前 `main` 做 source/schema diff，更新 adapter mapping 和兼容矩阵；若工作期间上游继续更新，在合并前再做一次同样复查。

完成标准：来源、许可策略、实际实现快照、schema 和能力分支全部明确；没有人为 commit 硬锁，推荐版本可由最新上游证据更新。

### WP1：领域类型、默认和迁移

目标文件：

- `src/types.ts`
- `src/core/defaults.ts`
- `src/core/draft-defaults.ts`（若创建模式默认在此维护）
- `electron/store.ts`
- `src/core/creation-drafts.ts`

任务：新增 mode/userSet/chunkRows；旧 queue/history 为 off；draft 保留模式隔离；同步 preload/IPC 类型需要的 additive fields。

测试：`tests/defaults.test.ts`、store migration、draft mode switch、旧 queue/history fixture。

### WP2：Catalog、扫描与快速更新证据

目标文件：

- `src/core/catalog/dependencies/types.ts`
- `src/core/catalog/dependencies/nodes.ts`
- `electron/services/dependency-scanner.ts`
- `electron/services/dependency-installer.ts`
- Settings 通用状态 selector/copy（仅必要时）

任务：注册 optional node；增加 version/revision/remote/dirty scan；保持 offline/runtime 两轴；较新版本以 capability 验收而不是 commit equality；为 `H3-Optimizations` 增加重复副本检测，按 canonical directory、aliases、仓库 remote 和注册 node type 找出改名副本，并返回冲突状态，避免两个包同时 monkey-patch H3。当前外部安装分支下，`appInstallable` 与 `bulkInstall` 必须贯穿 `CatalogCustomNodeDefinition`、`CustomNodeStatus`、scanner、Settings selector/page/controller 和 install/uninstall service。

测试：catalog、scanner 的 missing/installed/newer commit/older-than-minimum/loaded/input drift/duplicate renamed copy；“较新 commit + schema 满足”不得误报 incompatible。外部安装分支测试单卡和批量可选中、latest update、安全副本、dirty refusal、回滚、failure logs、selected ComfyUI Python 和 restart/recheck。

### WP3：Policy

目标文件：

- `src/core/catalog/types.ts` 和相关 H3 definitions（增加 capability 时）
- `src/core/video-policy.ts`，或新增聚焦的 `src/core/h3-memory-policy.ts`

任务：实现 `resolveMiniMaxH3ExecutionPlan()`，集中返回唯一 Attention owner、Memory、Spectrum、Turbo、supported/allowed/reasons/default；覆盖模型、input mode、Turbo、Spectrum、Sparse、SLA、Motion Context、Q3；实现 `shouldEnableH3MemoryOptimizationByDefault()`。

不要在 renderer 和 enqueue 各复制一套 if/else。

### WP4：Workflow adapter

目标文件：

- `src/core/workflow.ts`
- `src/core/runtime/workflow-messages*.ts`
- `src/core/workflow-metadata.ts`

任务：实现完整已知 patch-chain 解析、Attention 单 owner 校验、规范化和重建；实现 upsert/remove、固定 chain 顺序、参数映射、fail-closed 错误、多语言 runtime message、metadata。首个 Memory PR 不必生成 Sparse 节点，但测试必须拒绝 Sage/SLA/Sparse 多 owner 图。

测试：所有 bundled H3 workflow on/off snapshot；共同 upstream；已有节点复用；off 移除；重复节点；Sage+Sparse、Sage+SLA、Sparse+SLA 冲突；自定义 graph 歧义；输入 graph 已有 Spectrum/Preview；规范化后 `one attention owner -> Memory -> Spectrum -> Preview -> consumers`；所有应用管理节点可从 consumers 反向到达。

### WP5：Queue、执行验证和 history

目标文件：

- `src/core/queue-task-factory.ts`
- `electron/queue-enqueue.ts`
- `electron/services/comfy-ui.ts`
- `electron/queue-recovery.ts`
- `electron/queue-history.ts`
- history 参数恢复相关模块

任务：不可变 snapshot 同时保存 requested state 和 resolved execution plan；入队时做 offline dependency/minimum-version/policy/static-graph gate，不使用 commit equality gate；执行并提交 `/prompt` 前做 `/object_info` registration/schema gate；旧任务恢复 off；history 保存 requested mode 和 resolved plan；retry/copy/use-again 恢复到可编辑 draft 后重新归一；可解析时使用独立 `h3MemoryRuntimeEvidence`，不污染 `TaskPerformanceStats`。

### WP6：Create、Queue、History、Settings UI

目标文件：

- `src/renderer/pages/create/page.ts`
- `src/renderer/pages/create/view-model.ts`
- `src/renderer/pages/create/page-controller.ts`
- `src/renderer/pages/queue/card.ts`
- `src/renderer/pages/history/actions.ts`
- `src/renderer/pages/history/page.ts`
- `src/core/i18n-keys.ts`
- `src/core/locales/{zh-CN,zh-TW,en-US}.ts`
- Settings 文案/通用节点卡片，仅在现有通用渲染不足时改

任务：紧凑控件、状态/原因、userSet、三语 copy、queue/history requested 证据。

UI 变更必须保留连续输入焦点、mode 切换、Spectrum 和 submit bar 阻塞原因。

### WP7：文档、版本和发布记录

- `docs/WORKFLOW_CONTRACT.md`：记录 H3 Memory 默认安全档和与 Sparse/AIMDO 的分离。
- `docs/DEPENDENCIES_AND_SETUP.md`：记录来源、路径、版本/commit、许可和 runtime 证据。
- `README.md`：简短用户安装/启用说明。
- `CHANGELOG.md`：记录新增能力、默认策略和已验证/未验证组合。
- 实现完成时执行 `npm.cmd version minor --no-git-tag-version`，将 `0.50.0` 升为 `0.51.0`，同步 lockfile 和 README 当前版本。

仓库跟踪的 `.js` 镜像必须按项目当前构建约定同步；不要只改 TS 后留下行为不一致的 JS。

## 9. 验证矩阵

### 9.1 静态和单元测试

必须覆盖：

- catalog：目录 alias、最低版本、实际 version/commit evidence、required/bulkInstall、runtime requirement；
- scan：离线安装、服务未启动、node 未注册、schema 旧、较新兼容 commit、低于最低版本、duplicate copy；
- default：未 userSet + 已安装自动开；手动 off/on 后保持；节点缺失不阻塞基线；
- policy：INT8、INT4、R2V、Q3、Turbo、SLA、Sage、Sparse、Spectrum、Motion Context；每个允许/实验/禁止组合都有明确结果和 reason；
- graph：T2VA/I2V/R2V/Turbo/Spectrum/Sage/Sparse/SLA/Preview/Q3/Motion Context 的 on/off，以及 Attention 冲突输入；
- graph invariant：Scheduler/Guider 共享同一最终 model；恰好一个 effective Attention owner；Memory 在 Attention 后、Spectrum/Preview 前；
- Spectrum + Memory 回归：标准 H3、Sage、Spectrum `balanced`、Memory `preserve-native` 必须得到 `allowed = true`、`spectrumEnabled = true`，reasons 不得包含 `spectrum-memory-conflict`；
- Spectrum + Memory graph：断言 `Sage -> Memory -> Spectrum -> Preview -> Scheduler/Guider`，重复 normalize 不增加节点；分别关闭 Memory 或 Spectrum 后，另一节点仍保持可达；
- queue：排队后改 draft 不影响 task；
- queue 组合快照：Spectrum + Memory 可以成功入队，requested state 和 resolved plan 同时保留两项开启状态；
- migration：旧 draft/queue/history 无字段；
- history：写入、详情、复制参数、retry；
- object_info：缺 node、缺 input、enum 缺值、兼容；
- dependency installer（用户显式触发的外部安装）：跟随 latest、安全副本、dirty refusal、失败回滚、超时、日志、重启复检。

运行：

```powershell
npm.cmd run verify
```

若改动 runtime profile，额外运行 `tests/environment.test.ts` 的全套参数切换用例；Memory-only 第一版不应改变现有 runtime 参数断言。

### 9.2 手工 UI

在约 `1280×800`、`1440×900` 和首个响应式断点检查：

- Create：节点 missing/offline/loaded/incompatible/ready；
- 手动 off 后 scan、refresh、mode switch 不自动重开；
- image-to-video 和 extension draft 独立；
- prompt 连续输入、selection、undo/redo 不丢；
- submit bar 显示准确阻塞原因；
- Queue 和 History 不把 requested 写成 active；
- Settings 节点卡片显示文件、commit、runtime registration 三种证据。

### 9.3 真实 GPU A/B

每一组必须固定：模型文件、输入、prompt、seed、尺寸、frames、fps、steps、sampler、scheduler、shift、CFG、LoRA、Spectrum、attention、VAE、preview、启动参数。

记录：

- ComfyUI path/version/commit；
- H3 Optimizations version/commit；
- Torch/CUDA/driver/Comfy Kitchen/Sage/KJNodes 版本；
- GPU 型号和 compute capability；
- dedicated VRAM peak、shared GPU memory、system RAM/pagefile；
- load time、step 1、steady-step、sampler、VAE/audio decode、total wall time；
- 实际 provider/fallback 日志；
- 输出帧数、时长、音频、可播放性；
- off/on 输出 hash、latent/output RMSE（可获得时）和盲视觉检查结果。

最低 smoke：

1. FL2VA INT8，480p，短片，PyTorch/Comfy attention，off vs preserve-native。
2. FL2VA INT8，KJ Sage，off vs preserve-native。
3. FL2VA INT4，off vs preserve-native。
4. R2V 单图和多参考。
5. 普通 Turbo。
6. Spectrum off/on 组合；未完成或未通过 A/B 时保留“尚未验证”证据，不得因此阻止标准 H3 的 Spectrum + Memory 入队。只有发现真实结构冲突、崩溃或输出损坏时，才依据具体证据重新评估支持策略。
7. Turbo-SLA，只有通过才解除 gate。
8. Motion Context 初段与至少一次 continuation，只有通过才解除 gate。
9. 连续运行同一配置 3 次，再切换一个非 H3 任务，检查显存、patch、cache 和输出路径没有污染。

Sparse 后续阶段不能直接从上述 Memory 结果推断，按以下递增顺序测试并在每一步固定其余变量：

1. Dense PyTorch/Comfy 基线。
2. KJ Sage dense 基线，确认是 dense Sage 而不是 `spas_sage_attn`。
3. H3 Sparse 单独开启、Memory/Spectrum/Turbo 关闭，分别测 100% KV 和计划开放的默认 KV；确认 KJ Sage 节点已从图中移除。
4. H3 Sparse + Memory。
5. H3 Sparse + Spectrum，仅在第 3、4 步均通过后进行。
6. H3 Sparse + 普通 Turbo，仅在 Turbo 单独基线通过后进行。
7. 不把 Sparse + Spectrum + Turbo 的研究结果转成默认产品组合；若为研究运行，报告必须单独列出全部变量和质量差异。

可用硬件应至少覆盖 8GB、12GB、16GB、24GB 中能实际取得的档位；无法取得的档位标记“未测试”，不能用作者结果替代。

## 10. 发布 Gate

### Gate A：可合并但自动开启 gate 仍关闭

- catalog/detection/object_info/workflow/snapshot/history 完成；
- `H3_MEMORY_DEFAULT_ENABLED = false`；用户仍可在受支持组合中显式开启；
- `npm.cmd run verify` 通过；
- 至少一套目标机真实 smoke 成功；
- UI 明确 experimental；
- 许可策略允许当前安装方式。

### Gate B：已安装即默认 `preserve-native`

必须额外满足：

- INT8 baseline + KJ Sage 的同 seed A/B 通过；
- 连续三次运行无显存泄漏/patch 污染；
- 至少一个 8/12GB 边界样例证明显存下降；
- 无黑帧、音频丢失、时长/帧数错误；
- 默认档不使用 FP8 conversion 或 Force quant；
- fallback/no-op 能被识别或至少不会虚假显示 active。

全部满足后才把 `H3_MEMORY_DEFAULT_ENABLED` 切为 `true`；若本轮无法完成这些 real smoke，功能可以停在 Gate A，不能为了“计划目标默认开启”跳过证据。

### Gate C：记录其他组合的验证证据

Spectrum + Memory 已在架构和产品策略上允许，Gate C 不得把它恢复成互斥或入队阻塞。其 real smoke 结果只更新“已验证/尚未验证”证据、默认推荐和产品文案。

Sparse、SLA、Motion Context、Q3、AIMDO 等其余组合仍需单独过 real smoke 并单独记录证据，不因普通 H3 通过而自动放开。组合证据不能传递：`Spectrum + Sage` 通过不等于 `Spectrum + Sparse` 通过，普通 Turbo 通过不等于 Turbo-SLA 通过。

## 11. Preserve list

实施期间必须保留：

- 所有现有 H3 API JSON 的基线可运行路径；
- 缺可选节点时普通 H3 可提交；
- 已排队任务不受 draft/settings 后续变更影响；
- image-to-video 与 video-extension draft 独立；
- LoRA -> exactly one attention owner -> Spectrum -> preview 的既有语义，只在明确位置插入 Memory；
- Motion Context 当前强制关闭 Spectrum 的质量策略；
- Q3 的 3080 runtime profile、CPU VAE、低显存和无 async offload 策略；
- `--cache-none`、VRAM reserve、阶段卸载；
- offline detection 与 online object_info 分离；
- 旧 queue/history/model ID 可加载、复制和重试；
- 单重型 GPU stage；
- app-owned local ComfyUI 的进程管理和 remote endpoint connection-only；
- H3 32 像素空间规则、frames、audio、VAE 和 output metadata；
- 用户当前未提交的工作树改动。

## 12. 明确不做

第一版不要：

- vendor 或再分发无明确许可证的上游代码/二进制；
- 在用户未触发安装/更新时后台自动修改 custom node；快速跟随上游应通过显式更新动作完成；
- 默认开启 Sparse Attention；
- 把 30% KV 宣传成无损；
- 为 AIMDO 全局打开 async offload；
- 改写现有 H3 JSON 为八份带节点的副本；
- 把节点已安装等同于优化已生效；
- 把作者 4070 数据写成产品最低显存保证；
- 在没有真实运行的情况下报告“已验证可用”。

## 13. Luna Max 执行顺序与停止条件

严格按 `WP0 -> WP1 -> WP2 -> WP3 -> WP4 -> WP5 -> WP6 -> WP7` 执行。每个 WP 完成后先跑聚焦测试并检查 `git diff --name-status`，再进入下一个 WP。

遇到以下任一情况必须停止实施并回报，不得自行扩大范围：

- 上游 schema 已变化且无法通过能力分支安全适配；仅仅 commit/version 前进不是停止条件；
- 许可证要求不允许计划中的安装方式；
- graph adapter 无法为标准 H3 构建或静态证明 `one attention owner -> Memory -> Spectrum -> Preview -> consumers` 的唯一可达链；不得用将 Spectrum 与 Memory 声明互斥来掩盖 graph bug；
- 需要改变 persisted/public contract 的语义而不仅是 additive field；
- 需要删除或覆盖用户现有 dirty 修改；
- 需要改变全局 ComfyUI runtime flags 才能让 Memory-only 工作；
- real smoke 出现黑帧、音频异常、明显质量退化、illegal memory access 或任务后显存污染。

最终交付报告必须分别写明：静态验证、object_info runtime validation、真实 smoke、未测试组合、实际版本/commit、显存数据和许可状态。
