# MiniMax H3 Memory Optimization 接入计划

状态：**待实施**
调查基线：**2026-08-27**
目标执行者：**Luna Max**
产品版本建议：**0.51.0（minor）**
上游研究基线：[`Zironic/H3-Optimizations`](https://github.com/Zironic/H3-Optimizations) `0.2.16`，commit `f80c90cbb942de022d84975eff503ccc5ce86cf8`

> 本文是实施合同，不是运行完成证明。文中引用的显存和速度数据来自上游作者，必须在本项目实际 ComfyUI、Torch、Comfy Kitchen、GPU 和工作流组合上复测后才能进入产品文案。

## 1. 结论先行

本次应接入的是第三方 ComfyUI 节点包 `H3 Optimizations` 中的 `H3MemoryOptimization`，不是本项目已经接入的 Spectrum。

第一版产品决策如下：

1. 将 **H3 Memory Optimization** 做成独立的 H3 工作流能力。
2. 目标默认是：节点在所选 ComfyUI 中已安装、版本/commit 受支持、当前 H3 模式通过兼容策略、且用户从未手动选择时，默认开启“保留原生精度”档。但首轮实现必须由 catalog/release gate 保持自动开启关闭；只有本文 Gate B 的真实 A/B 和连续运行测试通过后，才在同一发布分支把 gate 打开。
3. 默认参数必须由应用显式写入，不能继承上游目前允许 FP8 转换的 `Auto` 精度默认值：
   - `precision_mode = "Preserve native"`
   - `qkv_streaming_mode = "Auto"`
   - `mlp_memory = "auto"`
   - `chunk_rows = 4096`
4. UI 只能描述为“近无损/不主动改变 checkpoint 精度的显存优化”；不能承诺逐位无损。
5. `H3SparseAttention` 不随 Memory 开启。它默认只保留 30% target-video KV，会改变模型计算、提示词遵循、运动和细节，首版不接入或只作为后续默认关闭的实验能力。
6. `H3AIMDOResidencyLimiter` 不与 Memory 合并。它依赖 DynamicVRAM 和 async weight offloading，而本项目当前标准 profile 明确传入 `--disable-async-offload`。首版 Memory-only 不修改进程启动参数；AIMDO 作为独立后续阶段。
7. 缺少可选节点时，现有普通 H3 必须继续可运行；不得把它提升为所有 H3 的硬依赖。
8. 上游仓库当前没有明确 LICENSE、没有 GitHub Release/tag，且更新非常快。许可未明确前不得把源码或预编译 DLL/`.so` 随应用再分发；安装必须以外部 custom node 的方式处理，并固定已验证 commit。

## 2. 调查事实

### 2.1 上游对象

- Reddit 帖子：[How much VRAM does H3 need? Less than you might think.](https://www.reddit.com/r/StableDiffusion/comments/1vz2n7y/how_much_vram_does_h3_need_less_than_you_might/)
- 仓库：[Zironic/H3-Optimizations](https://github.com/Zironic/H3-Optimizations)
- Comfy Registry 包名：`h3-optimizations`
- 节点包显示名：`H3 Optimizations`
- Python：`>=3.10`
- ComfyUI：`>=0.33.0`，且必须支持原生 MiniMax H3 和 `comfy_api.latest`
- `pyproject.toml` 的 `dependencies = []`；Memory-only 不需要额外模型权重，也不应把 Sparse Sage、Triton 或 H3-Extended 误报成硬依赖。

调查日的远端 `main` 为 `0.2.16` / `f80c90cbb942de022d84975eff503ccc5ce86cf8`。Reddit 原帖写的是 `0.2.13`，网页索引曾显示 `0.2.14`，说明上游版本变化快；执行者必须以 Git commit 和当前源码为准，不能只相信搜索摘要或浮动 `main`。

### 2.2 四个节点必须分开理解

| 节点 ID | 作用 | 是否改变模型计算 | 本计划处理 |
| --- | --- | --- | --- |
| `H3MemoryOptimization` | 分块 QKV、MLP、FinalLayer，流式 Q/输出并保留兼容 attention | 默认安全档不主动改变 checkpoint 精度，但可能有浮点级差异 | **第一版接入** |
| `H3AIMDOResidencyLimiter` | 限制 DynamicVRAM/AIMDO 常驻权重页 | 不改变模型数学；影响权重驻留和速度 | 后续独立阶段 |
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

### 2.5 许可与供应链 gate

调查基线的仓库根目录没有 `LICENSE`/`COPYING`，`pyproject.toml` 也没有 license 字段。公开 GitHub 仓库不等于获得复制、修改或再分发授权。

实施前必须完成下列二选一：

1. 上游补充明确许可证，并完成内部许可复核；或
2. 产品只登记外部来源和检测信息，不 vendor、不打包、不镜像源码/二进制；安装动作清楚告知用户来源，并按用户选定 ComfyUI 安装处理。

在许可不明确时：

- catalog 项设置 `required: false`、`bulkInstall: false`；
- `bulkInstall: false` 目前只会排除“全部安装”，不会自动移除单卡片的一键安装。实施时还要增加通用 `appInstallable?: false` / `installationMode: "manual"` 一类字段，并让 Settings 不调用 installer；
- Settings 提供仓库/Comfy Registry 信息和“手动安装后复检”；
- 不得把上游 DLL/`.so` 放进本仓库、安装包或应用缓存。

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

```text
--cache-none
--reserve-vram <0.5..1>
--disable-pinned-memory
--disable-async-offload
```

因此：

- `H3MemoryOptimization` 第一版可作为纯工作流 patch 接入，不需要修改 runtime profile。
- `H3AIMDOResidencyLimiter` 的数值档需要 DynamicVRAM + async weight offloading；当前不能默认插入。
- 不得为了 AIMDO 顺手删除 `--disable-async-offload`。那是独立的进程级策略变更，需要任务级 profile、重启对齐和 Windows 稳定性测试。

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

### 4.4 第一版支持矩阵

实现 policy 时必须 fail closed；不要把 `family === minimax-h3` 当成全部兼容。

| 组合 | 第一版默认策略 | 放开条件 |
| --- | --- | --- |
| FL2VA INT8 + PyTorch/Comfy attention | 候选支持 | object_info + real A/B smoke |
| FL2VA INT8 + KJ Sage | 候选支持 | real A/B smoke；确认实际 streamed provider |
| FL2VA INT4 | 候选支持但默认先关闭 | INT4 原生精度和 fallback 实测 |
| R2V 初始生成 | 候选支持 | 单图、多参考、视频/音频输出 smoke |
| 普通 LightX2V Turbo | 候选支持 | 同 seed、同参数 smoke |
| Spectrum | 初始 fail closed | 验证 patch 顺序、输出、显存和连续任务清理后放开 |
| Turbo-SLA / `H3SLAAttention` | 初始 fail closed | 上游只称部分支持；必须真实运行 |
| Motion Context extension | 初始 fail closed | 续写接缝、音频和 latent 保存/恢复 smoke |
| Q3 GGUF 3080 profile | 禁用 | 上游明确支持该 loader/权重 contract 且完成 3080 smoke |
| 非 H3 模型 | 不显示/不插入 | 永久保持 pass-through |

如果实施过程中完成了表中真实测试，可把对应组合改为 allowed，并把证据写入 catalog `compatibilityEvidence`；没有实际运行证据时保持禁用。

## 5. 工作流接入设计

### 5.1 不复制 JSON

保留所有 H3 API JSON 作为基线。仿照 Spectrum，在 `src/core/workflow.ts` 增加纯函数动态插入/移除节点。

目标 model chain：

```text
H3 loader
  -> LoRA(s)
  -> selected attention patch / Turbo-SLA patch
  -> H3MemoryOptimization
  -> Spectrum（仅兼容策略允许时）
  -> ModelPreviewOverrideKJ
  -> BasicScheduler + BasicGuider
  -> sampler
```

调用顺序固定为：

1. placeholder 和模型/LoRA 参数映射；
2. KJ Sage/PyTorch attention 处理；
3. Turbo-SLA patch；
4. Turbo sampler/scheduler 参数；
5. **一次性执行 H3 model-patch chain planner**，共同计算 Memory、Spectrum、Preview 的 desired patch set 并最终重建整条链；
6. 空引用清理、输出和 unload 处理。

不得在 chain planner 完成后继续调用当前会直接改接 consumers 的 `applyMiniMaxH3Spectrum()` 或总是新增节点的 `applyMiniMaxH3LivePreview()`。实施时要么把两者吸收到统一 planner，要么把它们重构为共享的 chain-aware upsert；整个 render 过程只能有一个最终 model-chain owner。

### 5.2 `normalizeMiniMaxH3ModelPatchChain` 合同

实现一个可单测的 graph adapter。它不能只看 Scheduler/Guider 的直接 upstream；必须先解析并规范化完整的已知 model patch chain。

要求：

1. 找到 `BasicScheduler` 和 `BasicGuider` 的共同最终 model；若二者不同则 fail closed。
2. 从 consumers 向上解析已知节点，识别已有 `ModelPreviewOverrideKJ`、`SpectrumApplyMiniMaxH3`、`H3MemoryOptimization`、KJ attention 和 `H3SLAAttention`；遇到未知多分支、循环或无法确定单一 upstream 时 fail closed。
3. 先摘下应用管理的 Memory/Spectrum/Preview 节点，保留它们的 ID 和最底层 upstream，再按唯一顺序重建：`attention/SLA -> Memory -> Spectrum -> Preview -> consumers`。输入 workflow 已含 Spectrum 或 Preview 时也必须得到该顺序，不能产生断开的 Memory no-op。
4. 检测已有 `H3MemoryOptimization`：
   - 超过一个：报错，禁止依赖节点顺序；
   - 开启：复用节点 ID、覆盖为 queue snapshot 的明确输入，不叠加第二个；
   - 关闭：将所有 `[memoryNodeId, 0]` 引用恢复为该节点的 `model` upstream 后删除节点。
5. 开启时使用以下 TypeScript 结构；进入 adapter 前必须完成 `h3MemoryChunkRows` 的范围和 256 整除校验，4096 默认值只存在于 defaults/migration：

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

6. `auto` 只把 `precision_mode` 改成 `Auto`；`force-quant` 只改成 `Force quant`。不要让 UI mode 改写 sampler、steps、scheduler、Spectrum 或 attention。
7. 重建完成后 Scheduler/Guider 必须共同消费 Preview（若有）或最终 model patch；逐个断言 Memory/Spectrum/Preview 都能从 consumers 反向到达，不允许孤立节点。
8. 自定义 workflow 若已含该节点，off 必须真的移除；不能让 UI 显示关闭但图中继续执行。
9. 若自定义 graph 的 model chain 无法无歧义解析，给出具体错误，不猜节点。

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
  recommendedVersion: "0.2.16",
  recommendedRevision: "f80c90cbb942de022d84975eff503ccc5ce86cf8",
  bulkInstall: false,
  appInstallable: false,
  required: false
}
```

同时写 `runtimeRequirement` 和 `compatibilityEvidence`：ComfyUI >=0.33.0、Python >=3.10、研究 commit、验证级别。`H3AIMDOResidencyLimiter` 和 sparse 节点可以记录为 features/信息，但不能成为 Memory-ready 的 required node types。

### 6.2 固定 revision 与许可分支

当前 catalog/installer 主要面向 release 或浮动 Git clone/pull。扫描端无论许可结果如何，都要增加通用、可测试的 revision 识别和比较，避免只看版本字符串：

- `CatalogCustomNodeDefinition` 增加可选 `recommendedRevision` 或 `installRevision`；
- scanner 同时报告实际 commit 和推荐 commit；
- 日志明确显示 repository、version、commit；
- revision 更新必须修改 catalog 证据并重新跑兼容矩阵。

WP0 后按许可结果分支，不能两条都做：

- **许可未明确**：实现 revision 扫描/比较和手动安装说明；不为该节点实现 checkout/update。`bulkInstall: false` 并不足以阻止单卡片安装，必须让新的 `appInstallable: false`（或等价通用字段）贯穿 catalog、`CustomNodeStatus`、scanner、Settings selector/page/controller，以及 main-process install/uninstall service 的防御性拒绝。manual-only 节点既不能由应用安装，也不能被应用移动到卸载备份目录。
- **许可允许应用安装**：把该 catalog 项的 `appInstallable` 改为 `true`，才实现通用 pinned-revision installer。clone 后 checkout 精确 commit；update 也安装到安全副本、checkout 后再执行现有备份/替换；不得覆盖 dirty checkout，并保留现有 copy/backup/replace 行为和完整测试。

### 6.3 `/object_info` 精确校验

启用时不能只检查 class type 存在。对 `H3MemoryOptimization` 验证：

- `model` input 存在且接受 `MODEL`；
- `mlp_memory` 包含 `auto`；
- `chunk_rows` 接受 4096；
- `precision_mode` 包含请求值；
- `qkv_streaming_mode` 包含 `Auto`；
- legacy inputs 若当前 pinned contract 仍要求，则验证存在；若上游新版移除，必须先更新 adapter 和兼容证据，不能静默提交旧 schema。

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

### 7.1 Memory-only 第一版

- 不修改 `comfyUiMemoryArgs()`。
- 不删除 `--disable-pinned-memory` / `--disable-async-offload`。
- 不新增全局环境变量。
- 不改变 `--cache-none`、reserve VRAM、CPU VAE 或阶段卸载。

### 7.2 AIMDO Phase 2（单独 PR/版本）

只有在 Memory 第一版稳定后再评估：

1. 新增任务级 H3 DynamicVRAM profile，不能改变 `standard` 全局含义。
2. queue snapshot 保存 AIMDO requested policy。
3. app-owned local ComfyUI 在任务边界事务式切换 profile；remote endpoint 只验证，不能重启。
4. 数值档要求 `NUM_STREAMS > 0`；否则 fail closed 或使用 `stock`，不得运行后才抛模糊错误。
5. 初始建议 `2 blocks`，但只有真实显存/速度数据后才考虑 Auto。
6. 验证从 AIMDO H3 切换到普通 H3、Qwen image、prompt-resident、Sulphur 后启动参数和显存状态恢复。

## 8. 文件级实施工作包

执行前重新读取每个目标文件和 `git diff`。当前工作树已经有用户改动，尤其是 `src/types.ts`、`electron/store.ts`、`electron/main.ts`、Settings 和 dependency catalog；不得从本计划生成的旧快照覆盖当前内容。

### WP0：许可和上游基线

- 核实上游 LICENSE。
- `git ls-remote` 记录目标 commit；读取该 commit 的 `pyproject.toml`、node schema、README。
- 将 commit、version、ComfyUI/Python要求写入 catalog evidence。
- 若目标 commit 与本文不同，先做 source diff 和 schema diff，再更新计划/证据。

完成标准：来源、许可策略、固定 revision、schema 全部明确。

### WP1：领域类型、默认和迁移

目标文件：

- `src/types.ts`
- `src/core/defaults.ts`
- `src/core/draft-defaults.ts`（若创建模式默认在此维护）
- `electron/store.ts`
- `src/core/creation-drafts.ts`

任务：新增 mode/userSet/chunkRows；旧 queue/history 为 off；draft 保留模式隔离；同步 preload/IPC 类型需要的 additive fields。

测试：`tests/defaults.test.ts`、store migration、draft mode switch、旧 queue/history fixture。

### WP2：Catalog、扫描与固定 revision

目标文件：

- `src/core/catalog/dependencies/types.ts`
- `src/core/catalog/dependencies/nodes.ts`
- `electron/services/dependency-scanner.ts`
- `electron/services/dependency-installer.ts`
- Settings 通用状态 selector/copy（仅必要时）

任务：注册 optional node；增加 revision scan/compare；保持 offline/runtime 两轴；为 `H3-Optimizations` 增加重复副本检测，按 canonical directory、aliases、仓库 remote 和注册 node type 找出改名副本，并返回冲突状态，避免两个包同时 monkey-patch H3。许可未解决时，`appInstallable` 必须贯穿 `CatalogCustomNodeDefinition`、`CustomNodeStatus`、scanner、Settings selector/page/controller 和 install/uninstall service 的主进程防线。

测试：catalog、scanner 的 missing/installed/wrong commit/loaded/input drift/duplicate renamed copy。许可未明确分支测试 manual-only 无 install/uninstall IPC 行为；只有许可允许分支才测试 installer 的 exact checkout、dirty backup、failure logs、selected ComfyUI Python 和 restart/recheck。

### WP3：Policy

目标文件：

- `src/core/catalog/types.ts` 和相关 H3 definitions（增加 capability 时）
- `src/core/video-policy.ts`，或新增聚焦的 `src/core/h3-memory-policy.ts`

任务：集中返回 supported/allowed/reason/default；覆盖模型、input mode、Turbo、Spectrum、SLA、Motion Context、Q3；实现 `shouldEnableH3MemoryOptimizationByDefault()`。

不要在 renderer 和 enqueue 各复制一套 if/else。

### WP4：Workflow adapter

目标文件：

- `src/core/workflow.ts`
- `src/core/runtime/workflow-messages*.ts`
- `src/core/workflow-metadata.ts`

任务：实现完整已知 patch-chain 解析、规范化和重建；实现 upsert/remove、固定 chain 顺序、参数映射、fail-closed 错误、多语言 runtime message、metadata。

测试：所有 bundled H3 workflow on/off snapshot；共同 upstream；已有节点复用；off 移除；重复节点；自定义 graph 歧义；输入 graph 已有 Spectrum/Preview；规范化后 `attention/SLA -> Memory -> Spectrum -> Preview -> consumers`；所有应用管理节点可从 consumers 反向到达。

### WP5：Queue、执行验证和 history

目标文件：

- `src/core/queue-task-factory.ts`
- `electron/queue-enqueue.ts`
- `electron/services/comfy-ui.ts`
- `electron/queue-recovery.ts`
- `electron/queue-history.ts`
- history 参数恢复相关模块

任务：不可变 snapshot；入队时做 offline dependency/version/revision/policy/static-graph gate；执行并提交 `/prompt` 前做 `/object_info` registration/schema gate；旧任务恢复 off；history 保存 requested mode；retry/copy/use-again 恢复字段；可解析时使用独立 `h3MemoryRuntimeEvidence`，不污染 `TaskPerformanceStats`。

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

- catalog：目录 alias、版本、commit、required/bulkInstall、runtime requirement；
- scan：离线安装、服务未启动、node 未注册、schema 旧、wrong commit、duplicate copy；
- default：未 userSet + 已安装自动开；手动 off/on 后保持；节点缺失不阻塞基线；
- policy：INT8、INT4、R2V、Q3、Turbo、SLA、Spectrum、Motion Context；
- graph：T2VA/I2V/R2V/Turbo/Spectrum/SLA/Preview/Q3/Motion Context 的 on/off；
- graph invariant：Scheduler/Guider 共享同一最终 model；Memory 在 attention/SLA 后、Spectrum/Preview 前；
- queue：排队后改 draft 不影响 task；
- migration：旧 draft/queue/history 无字段；
- history：写入、详情、复制参数、retry；
- object_info：缺 node、缺 input、enum 缺值、兼容；
- dependency installer：pin commit、安全更新、dirty backup、超时、日志、重启复检。

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
6. Spectrum off/on 组合，只有通过才解除 policy gate。
7. Turbo-SLA，只有通过才解除 gate。
8. Motion Context 初段与至少一次 continuation，只有通过才解除 gate。
9. 连续运行同一配置 3 次，再切换一个非 H3 任务，检查显存、patch、cache 和输出路径没有污染。

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

### Gate C：开放其他组合

每个 Spectrum、SLA、Motion Context、Q3、AIMDO 组合单独过 real smoke，单独记录证据，不因普通 H3 通过而自动放开。

## 11. Preserve list

实施期间必须保留：

- 所有现有 H3 API JSON 的基线可运行路径；
- 缺可选节点时普通 H3 可提交；
- 已排队任务不受 draft/settings 后续变更影响；
- image-to-video 与 video-extension draft 独立；
- LoRA -> attention/SLA -> Spectrum -> preview 的既有语义，只在明确位置插入 Memory；
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
- 自动追踪或 `git pull` 浮动 `main`；
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

- 上游 commit/schema 已变化且不能向后兼容；
- 许可证要求不允许计划中的安装方式；
- Memory 与现有 Spectrum/SLA/Motion Context 共同 patch 的顺序无法从源码或 real smoke 证明；
- 需要改变 persisted/public contract 的语义而不仅是 additive field；
- 需要删除或覆盖用户现有 dirty 修改；
- 需要改变全局 ComfyUI runtime flags 才能让 Memory-only 工作；
- real smoke 出现黑帧、音频异常、明显质量退化、illegal memory access 或任务后显存污染。

最终交付报告必须分别写明：静态验证、object_info runtime validation、真实 smoke、未测试组合、实际版本/commit、显存数据和许可状态。
