# ComfyUI 0.35.0 / MiniMax H3 调查证据

- 类型：Research / source + static evidence。
- 状态：调查完成，供讨论；不是已批准实现计划或运行时验收。
- 日期：2026-09-10。
- 范围：Windows Local Video Studio 的 H3 FL2VA、Ref2VA、Turbo、续写、JointAV 二次采样及其节点/加速策略。
- 当前任务：[TASK](../TASK.md)。产品边界：[Workflow Contract](../../../WORKFLOW_CONTRACT.md)、[Dependencies](../../../DEPENDENCIES_AND_SETUP.md)。

## 1. 基线与已证实的本机状态

官方 [v0.35.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.35.0) 为非预发布版本，发布于 2026-09-09 19:55:08 UTC（北京时间/新加坡时间 9 月 10 日 03:55）。tag commit 为 `40c4fcdf513a4523e39d54a9d391908af8df8171`。

应用基线为 HEAD `79c1d6c` 加当前未提交改动。已有改动涉及 H3、Spectrum、Continuum v3.8、环境扫描及其他主题；本轮未覆盖这些文件。

| 项目 | 读到的状态 | 证据边界 |
| --- | --- | --- |
| 软件通用核心推荐 | `0.33.1`；H3 普通最低 `0.31.0` | `electron/services/comfy-compatibility.ts`、`src/core/workflow-metadata.ts` |
| Motion Context / Continuum 推荐 | 核心分别为 `0.34.0` / `0.34.2` | 当前 catalog / manifest，不是本轮新增保证 |
| 所选 Desktop 核心 | `v0.35.0-6-ga7b1d39d`，Git 工作区干净 | 安装记录与实际 `git describe` 一致；不是纯稳定 tag |
| 所选 Python | CPython `3.12.11` | `.venv/pyvenv.cfg` |
| 包目录 | Torch `2.10.0+cu130`、SageAttention `2.2.0+cu130torch2.10`、Triton Windows `3.6.0.post26`、Aimdo `0.5.3`、Kitchen `0.2.33`、PyAV `18.0.0` | dist-info 文件证据，未导入或执行 CUDA kernel |
| 当前应用设置 | FL2VA、Sage、INT8 ConvRot video VAE、0.5 GiB reserve | 只读设置快照，不代表已执行进程参数 |
| 在线服务 | 配置 endpoint 的 `/system_stats` 连接失败 | 未启动服务，schema 和输出均待验 |

已比较 `v0.35.0..HEAD`：H3 model、H3 nodes、sparse attention、model_prefetch、requirements 和 latent_preview 没有差异；所查 CLI 文件有一处改动，后续六次提交中包含 AMD Windows VA quota 调整。不能将这台机器的未来测试结果无条件标成纯 `v0.35.0` 测试；应保留精确 SHA。本轮没有切换 tag 或回滚安装。

## 2. 0.33.1 → 0.35.0 的相关变化

| 变化 | 对项目的意义 | 建议 |
| --- | --- | --- |
| Comfy Compiler / Aimdo 内存编译 | 复用显存分配、减少碎片与分配抖动；H3 扩散使用内存编译层 | 优先作为原生运行配置实验 |
| 原生稀疏注意力 | 长序列减少 attention 工作；H3 可用分块 QKV producer | 独立可选后端，先测再定默认 |
| 视频/音频 denoise mask 修正 | 修正部分 mask 下的速度到 x0 转换；与续写/refine 相关 | 升级必测项，不能只测普通 I2V |
| PDD LoRA | 原生加载加速 LoRA 与输出 head bank | 独立模型配置，勿套用现有 Turbo 参数 |
| Fun Union / ControlNet patch | 原生模型补丁接口、参考输入与预取竞争修复 | 后续控制能力，不随兼容升级开启 |
| Reference VAE 可选 | 可只给文本编码器传参考信息，省去参考 latent | 明确不同参考语义，不能静默降级 |
| AddGuide / per-token masks | 在任意帧放置图像、短片或音频约束 | 来自 0.34 阶段；适合另做关键帧/续写实验 |

发布中的 H3 Max / Max Turbo 是 Partner API 节点更新，不能当成本地 H3 权重自动升级。PDD/FastH3/Fun 等需要对应模型或 LoRA；本轮没有下载权重。

### 内存编译与运行参数

[Compiler PR #15861](https://github.com/Comfy-Org/ComfyUI/pull/15861) 将内存分配编译与 CUDA graphs 分层。该 PR 明确扩散模型当前只走内存编译层，不能据此给 H3 开启所有 `torch.compile` 开关或承诺固定倍数提速。

[Aimdo/Compiler 修复 #16180](https://github.com/Comfy-Org/ComfyUI/pull/16180) 补充线程级图生命周期、预览与采样显存复用以及 Kitchen allocation-context 接口。其案例体现显存行为改善，单个示例总耗时几乎不变；预览和 dense/sparse 转换可以带来合法 graph breaks，零 breaks 不是通用验收条件。

目标 [requirements.txt](https://github.com/Comfy-Org/ComfyUI/blob/v0.35.0/requirements.txt) 固定 `comfy-aimdo==0.5.3`、`comfy-kitchen==0.2.33`，另含 PyAV `>=17.0.0`、frontend `1.51.10`、templates `0.11.57`。Torch 本身未在此文件固定版本，因此不能把升级 Python/Torch/CUDA 当成升级核心的必选步骤；当前 Sage wheel 与 Torch/CUDA 有明确绑定。

当前 `src/infrastructure/comfy-runtime-policy.ts` 的常规 profile 使用 `--cache-none --reserve-vram <值> --disable-pinned-memory --disable-async-offload`。0.35 原生 Compiler 的条件是 Aimdo 生效、CUDA device、未设置 `--disable-comfy-compiler`；并不要求 async streams 非零。禁用 async 会令 `NUM_STREAMS=0`、关闭对应预取路径，但不能说 Compiler 完全没有工作。

建议增加与旧 Memory 功能分离的 H3 原生 profile 实验：先在保持现有 offload 条件下对照 Compiler 开/关，再单独对照 pinned/async。保留 `--cache-none`：这是跨 prompt 节点结果缓存策略，与内存编译及 Spectrum 步间预测不是同一层。旧 `h3-memory` profile 与已撤回的 H3-Optimizations 不应因核心升级自动恢复。Q3/3080、Qwen、其他模型的运行参数保持各自范围。

### 注意力：有明确收益机会，也有接口差异

官方 [BlockSparseAttention 源码](https://github.com/Comfy-Org/ComfyUI/blob/v0.35.0/comfy_extras/nodes_sparse_attention.py) 标记为 experimental，支持 Sol-Attn、SLA、VSA。Sol-Attn 可不换训练权重；SLA 对应其训练模式，VSA 要匹配 FastH3 权重。H3 producer 要求 CUDA/BF16 等条件，按块产生 QKV；不满足条件会回到 dense，节点存在或任务成功均不能证明获得了稀疏加速。

当前 `H3SLAAttention` 固定 85% sparsity、64 block、首步/末步 dense、音频保护及额外稳定策略。新节点的 `keep_percent` 是保留率，15% 仅与 85% sparsity 在比例上对应；原生默认 10%、按 percent/sigma 控制和 token 门槛不等价。必须显式映射，不能机械改 node ID。建议 Sol-Attn 与 Turbo-SLA 各做独立实验，记录实际 producer/dense 日志与音频结果。

原生 [ModelAttentionBackend](https://github.com/Comfy-Org/ComfyUI/blob/v0.35.0/comfy_extras/nodes_model_advanced.py) 可选择 PyTorch / Comfy Kitchen dense attention，适合作为第三种 dense 后端候选。现有 Sage CUDA→Triton→PyTorch 降级应保留。新原生 attention 与旧 SLA 应只有一个稀疏策略拥有者；dense fallback 的选择另外明确。

应用当前 patch chain 只认识 `PathchSageAttentionKJ`、`H3SLAAttention`、`H3SparseAttention*` 等；`BlockSparseAttention` 和 `ModelAttentionBackend` 尚不在允许链中。未来要接入，须同时改能力、snapshot、adapter、链检查和真实 schema 验证。DynamicCombo 应按目标 `/object_info` 构造 API 输入，不能从 UI 展示字段猜格式。

### Spectrum、续写与预览

[Spectrum v0.2.21](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.21) 修复 PDD-capable 核心新增的 FinalLayer 参数；当前安装与推荐均为 [v0.2.24](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.24)。应用对普通旧核心仍允许 `0.2.1`，Turbo 条件为 `0.2.6`，不足以描述新核心的 FinalLayer 约束。建议按核心能力设置兼容下限，在 0.35 路径要求至少具有 0.2.21 修复的版本，继续推荐 0.2.24，而不是把“最新版本”变成所有旧核心的统一硬要求。

已检查安装的 Spectrum wrapper：它使用 DIFFUSION_MODEL 接缝，识别新旧 FinalLayer，并链接已有 block replacement。这些是可兼容的静态迹象；actual/forecast 分支的分配形态以及 sparse block patch 与新编译器组合仍需实测，不能把已支持 PDD 误写成已验证 0.35 Compiler。

[mask 修复 #15988](https://github.com/Comfy-Org/ComfyUI/pull/15988) 纠正局部 timestep 与外部全局 sigma 的转换不一致，同时保留 audio carry 顺序。这是正确性变化；部分 mask 的输出可能与旧核心不同。现有 Continuum refine 使用 noise mask，因此应测接缝、局部重采样和音画同步；不能要求旧核心错误输出逐像素相同。

本机 KJNodes 停在 `3f20054`（2026-08-14）。其 TinyVAE 预览调用自身 decode 路径，未发现新 Compiler 管理调用；核心新增 preview 编译不代表这条旧 custom preview 自动获得相同收益。建议核对并固定包含相应兼容改动的 KJ revision 后测预览；本轮未确定新 pin。维持默认关闭、单帧/512px、失败不阻塞生成。

### 新能力需与当前模式分开

[PDD #15908](https://github.com/Comfy-Org/ComfyUI/pull/15908) 支持 backbone LoRA 与多区间 output head bank，使用普通 LoRA loader；上游给出 8-step/simple、video/audio shift 12/3 配置线索。它不同于已接入的 LightX2V v1.2 4-step、Turbo-SLA、社区 v4 或保留的 8-step ER-SDE。首先独立固定来源权重和参数，关闭 Spectrum 建基线，再评估组合；步数与实际模型调用次数也应分开记录。

[Reference 可选 VAE #16065](https://github.com/Comfy-Org/ComfyUI/pull/16065) 省去的是参考 latent，保留文本编码器里的多模态参考；可能改变身份与细节保真，适合显式轻量参考模式，不能静默省略既有 Ref2VA 的 VAE。当前图已经用 `ref_image_size=match`，无需重复当成新优化。

[Fun patch #15975](https://github.com/Comfy-Org/ComfyUI/pull/15975) 与 [references/prefetch 修复 #16020](https://github.com/Comfy-Org/ComfyUI/pull/16020) 属于新增控制路线。当前生产 H3 图未使用 Fun ControlNet，接入会涉及模型补丁、控制视频/mask/source video 及其能力边界。

[AddGuide #15439](https://github.com/Comfy-Org/ComfyUI/pull/15439) 和 per-token noise mask 在 0.34 阶段已经进入核心。前者是帧锚点约束，不能直接替代现有 Motion Context、FL2VA 边界续接、Continuum JointAV state。即使以后复用其原生算子，旧 artifact、音频时间网格、queue/history lineage 和恢复语义仍由应用负责。

## 3. 现有节点处置建议

以下为本轮读到的有限快照，不取代 catalog 的长期版本事实来源。

| 现有项 | 本机/当前固定线 | 本轮建议 |
| --- | --- | --- |
| Spectrum | 0.2.24 / `a360f64` | 保留；补核心条件兼容校验，实测 Compiler 组合 |
| KJNodes | `3f20054` | 优先复核升级；保留 Sage、preview、VRAM_Debug 的既有契约 |
| PlagueKind SLA | 1.3.8 / `a05db58` | 保留作为已知路径；原生 SLA 独立适配与对照 |
| Motion Context | 0.6.2 / `5335715` | 保留 0.34+ 原生 layout 路线及旧核心回退线；Spectrum 仍关闭 |
| Continuum | 3.8.0 / `b10804f` | 沿新 sampler/finalize 路径测试，旧图按兼容策略处理 |
| H3-Optimizations | catalog 0.2.20，产品强制 off | 维持观察项，不恢复旧 Memory 开关 |
| H3 latent / learned upscale / MMH3 | 已有 catalog pins | 新核心没有证明替代这些业务链；保持 720→1080 两阶段、首帧 latent 锚定、GPU VAE 与恢复检查点 |
| GGUF-H3 / INT4 / INT8 ConvRot VAE | 现有独立变体 | 首轮保持权重、精度和参数，分别验证核心兼容；不泛化原生 INT8 测试结果 |

推荐版本改动还需统一 `comfy-compatibility.ts` 与 `workflow-metadata.ts`，并清理已撤回 H3 Memory 的陈旧 manifest package 标记。不要用 0.35 的新节点最低要求替换所有已有工作流的最低要求。

## 4. 供讨论的分阶段更新

1. **兼容批次（patch 候选）**：确定支持 tag/commit，更新推荐信息与按能力校验；复核配套 requirements、Spectrum 条件下限和 KJ；保持现有图参数及保存格式。确认后才实施。
2. **原生运行优化（独立实验）**：H3 专属 profile，对照 Compiler、async/pinned、dense backend；每次改一项。记录设置与实际 command line，避免与旧 Memory 功能复用开关。
3. **原生稀疏后端（minor 候选）**：先 Sol-Attn，再现有 Turbo-SLA 权重的原生 SLA 映射；独立 snapshot 与日志。前者无需新训练权重也仍需画质评估。不要一开始同时叠加 Spectrum。
4. **新增能力（单独选择）**：PDD、FastH3/VSA、Fun 控制、轻量参考、AddGuide 时间线按实际优先级选择，避免全部进入首批升级。

正式性能比较先固定当前可复现环境，不自动把本机 `0.35+6` 切回旧版本。若没有同环境旧核心基线，只报告新核心内部开关对照，不能声称跨版本提升百分比。

建议测试顺序：最小短片确认 → 720p/768p 约 5 秒代表性片段 → 一个更长片段测 RAM/shared GPU。固定 prompt、素材、seed、frames、尺寸、sampler、steps、VAE 和编码；分别看加载、采样、解码、总时长、实际 NFE/forecast、专用显存、共享 GPU 内存、RAM/pagefile、graph breaks/rogues。稀疏测试必须确认不是 dense fallback；高分辨率测试需单独记录二采与合成。

兼容验收覆盖普通 FL2VA/Ref2VA、各 Turbo 路线、INT4/Q3、Continuum/Motion Context、1080p 两阶段；1440p 仍按已有开放范围和证据处理。重点增加部分视频/音频 mask、生成中取消、下一任务、模型切换、重启恢复、预览开关和旧 queue/history。按 [验证分级](../../../CHANGE_VERIFICATION.md) 运行 focused checks、`npm.cmd run verify`、目标 `/object_info` 与真实最小产品任务；不执行全组合的无界测试。

## 5. 本轮执行与限制

- 已执行只读 `git status/diff/log/describe/rev-parse`、定向文件检索、14 份 H3 API JSON 的节点类型盘点、官方 releases/PR/tag 源码读取、包元数据检查和一次配置 endpoint 的 GET。
- Git 在沙箱账户下报告外部仓库 ownership，部分网络读取遇到 TLS 凭据错误；在获得工具批准后以用户账户只读重试成功，没有改全局 Git trust 或仓库配置。
- 尚未运行目标 Python imports、稀疏 backend availability、自定义节点注册、实际图提交、生成、速度/画质评测或恢复演练。安装目录存在不能作为这些检查的替代。
- 本机核心干净；Spectrum、KJ、Motion Context、Continuum 的 Git 检查无改动；PlagueKind 仅观察到未跟踪 Python cache 文件，未删除。
- 本轮没有升级、下载模型、改应用实现、改依赖、启动/停止服务或占用 GPU；没有生成媒体或待清理进程。研究结论在核心/节点 revision 或应用 graph 改变时需重新核对受影响部分。
