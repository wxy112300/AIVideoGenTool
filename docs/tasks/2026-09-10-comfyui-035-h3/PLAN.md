# ComfyUI 0.35.0 / H3 升级执行计划

- 类型：实施 Plan；状态：代码/静态执行完成；已完成一次隔离 runtime smoke，应用自有启动链仍因 ComfyUI 节点初始化未在超时内完成而未闭环。
- 日期：2026-09-11；执行者：一个独立 Luna（Max），从调查到实现、验证、收尾连续完成，不再派生 agent。
- 当前摘要与续接入口：[TASK](TASK.md)。前期事实：[调查证据](evidence/upgrade-research.md)。
- 权威：本计划落实用户 2026-09-11 的更新要求；替代旧调查中的实施顺序和取舍，尤其是保留 H3-Optimizations、关闭 Spectrum 做基线的建议。
- 本轮 runtime 授权：用户允许启动 ComfyUI 做低分辨率短测；只使用隔离 Electron 状态与本机已有权重，不下载模型、不运行大分辨率/长时任务，并以 4090 显存安全为硬停止条件。
- 路线：[升级流程](../../development/WORKFLOW.md#upgrade)。约束只按受影响部分读取：[工作流](../../WORKFLOW_CONTRACT.md)、[环境与依赖](../../DEPENDENCIES_AND_SETUP.md)、[验证](../../CHANGE_VERIFICATION.md)、[文档生命周期](../../development/DOCUMENT_POLICY.md)。

## 一、已经确定的范围

目标是让应用正式推荐并兼容 ComfyUI 0.35.0，清除失败的 H3 Memory 产品路线，把可用的新加速能力作为可选设置和 LoRA 接入。正常用户沿用已有设置即可继续生成，不需要重新建草稿、清队列或迁移媒体。

| 项目 | 本次执行决定 |
| --- | --- |
| 核心与原生 API 图 | 更新应用推荐、能力检测与 API graph，直接适配新版；不增加升级向导或要求用户复制工作流。本机已有 0.35，不为测试重装或降级。这里指本地执行节点；发布中的付费 Partner API 不在本次接入范围。 |
| 新后端 | 放在设置 → 性能与加速，限定 H3；密集注意力、稀疏策略、原生内存/卸载策略分别表达。已有默认值及用户保存值保留。 |
| 新 VAE | 经核实确有兼容的最终视频 VAE，才加入同一设置区域及模型文件清单。参考输入免 VAE、TAE 预览解码器不能充当新最终 VAE。没有有效新资产就明确报告没有，不能造占位选项。 |
| 新 LoRA | PDD FL2VA / Ref2VA 作为 LoRA 面板中的独立条目，使用新稳定 ID；旧 Turbo、Turbo-SLA、v4、8-step 路线保留。 |
| 新节点与 Python 依赖 | 所接入能力实际需要的内容进入“节点与依赖”。核心自带节点标识为随核心提供；Python 内核与第三方节点分别识别、安装和验证。 |
| H3-Optimizations | 从活动 catalog、节点列表、安装入口和工作流依赖中直接移除；不再展示观察项。移除应用入口不等于静默删除用户外部 custom_nodes 目录。 |
| H3 Memory 历史 | 清除失败功能的实现、专属测试及长篇历史集成计划；先迁出仍在使用的公共 patch-chain / Spectrum / Turbo 逻辑。只留短撤回说明及必要旧数据读取兼容。这里不授权删除 History 记录、视频、用户模型或旧队列。 |
| Spectrum | 必须作为升级兼容条件；所有本轮新增的 H3 真实生成比较均保持开启，不安排 Spectrum-off 基线、排障生成或性能对照。既有默认/用户选择策略不全局改写。 |
| Motion Context | 用户已确认关闭 Spectrum 是已知问题，维持现有关闭行为及 guard；不调查原因、不尝试兼容修复、不安排该组合的 GPU 实验。 |
| 默认推广 | 新选项初始不自动启用；测试通过也不擅自改全局默认。交付时给出测得的推荐组合，供用户决定后续默认调整。 |
| 独立完成 | 五个步骤连续执行，每步可以先做定向调查，不设置例行阶段审批。普通兼容修复、可逆实现、必要测试按本范围完成。新增大功能、模型下载、破坏性数据操作另行处理。 |

本次不建设任意时间线/AddGuide 编辑器、完整 Fun ControlNet 控制界面，也不替换 Continuum/Motion Context 的业务状态机。可以采用它们依赖的新核心修复；只有现有图需要的接口才在本次改动。FastH3/VSA 是条件能力：查明资产与内核后接入有效组合，不能把普通 H3 接上 VSA 就宣称支持 FastH3。

## 二、起点与必须避免的误判

计划编写时应用 HEAD 为 `fa75dfb`，版本 `0.60.0`，工作区干净。执行时重新检查；之前调查中的 `79c1d6c` 加 dirty 文件只是一份历史快照。

- [官方 v0.35.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.35.0) 的 SHA 为 `40c4fcdf513a4523e39d54a9d391908af8df8171`。前次查到所选本机核心为 `v0.35.0-6-ga7b1d39d`，不可把该机器的结果写成纯 tag 测试。
- 前次包目录证据为 Python 3.12.11、Torch 2.10.0+cu130、Sage 2.2.0+cu130torch2.10、Triton Windows 3.6.0.post26、Aimdo 0.5.3、Kitchen 0.2.33；未作实际导入/内核验证。目标 [requirements](https://github.com/Comfy-Org/ComfyUI/blob/v0.35.0/requirements.txt) 不能被解释成必须一并升级 Torch/Python/CUDA。
- [Comfy Compiler](https://github.com/Comfy-Org/ComfyUI/pull/15861) 对 H3 的主要变化是内存分配编译。当前应用禁用 async offload 不代表已禁用 compiler；不得为了“保持默认”额外加入关闭 compiler 的参数。预取与 compiler 分开验。
- [BlockSparseAttention](https://github.com/Comfy-Org/ComfyUI/blob/v0.35.0/comfy_extras/nodes_sparse_attention.py) 为实验性原生节点；DynamicCombo 必须以目标 schema 和真实 API 图验证。Sol/SLA/VSA 不是可互换的显示名称，节点存在也不证明稀疏内核执行。
- [Spectrum 0.2.21](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.21) 有新版 H3 FinalLayer 接口适配，继续以已采用的 [0.2.24](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.24) 为推荐。新核心不能仅沿用普通旧核心的 0.2.1 下限。
- 默认设置文件当前为 `h3AttentionMode: sage`、`h3VideoVaeMode: fp16`；前次本机保存值是 INT8 ConvRot VAE。默认值、用户保存值、运行时实际值分别记录，不能互相覆盖。

执行时只维护本 TASK 的当前进度；建立一份 `evidence/upgrade-validation.md` 记录实现后的版本、schema、测试表和遗留项。原始日志、schema 全量 JSON、测试媒体、机器路径留在忽略的本地证据目录，不提交到仓库。每项结论标清 source / static / schema / runtime / quality，未知写 unknown。

## 三、步骤 1：核实本机与目标接口，固定实施清单

**先调查：**读取 TASK、当前相关 diff 和前期证据，复用已确认来源；仅重新核对发生变化的版本或尚未确定的接口。不要从所有历史 H3 计划重新开始。

1. 执行 `git status --short`、`git diff --stat`、`git rev-parse HEAD`、`npm.cmd pkg get version`。检查当前任务/资源归属，记录是否有人使用 dist、Electron、所选 ComfyUI 或 GPU；不停止其他任务。
2. 从现有设置、安装发现服务和 harness 解析实际 core/data/Python/endpoint，不硬编码调查机器路径。记录核心 tag/SHA/dirty、各节点 revision、相关 Python 包及 GPU/驱动。保持本机已安装的 0.35+6，除非发现明确阻塞且有单独处置依据。
3. 在已有构建可用且与代码相符时，可先用 `npm.cmd run harness:comfy -- scan --json` 做现状扫描；它导入 dist 服务，不能用过期构建证明新代码。离线扫描不得自行启动 ComfyUI。运行探针阶段再按当前 runtime service 启动所选实例。
4. 从运行中的目标服务取一份共享 `/object_info` 快照，查 `MiniMaxH3ReferenceToVideo`、`MiniMaxH3AddGuide`、`ModelAttentionBackend`、`BlockSparseAttention`、LoRA loader、Spectrum、KJ preview、SLA、Motion Context、Continuum 与当前 H3 图的必需节点。检查 required/optional、输入/输出类型、动态枚举、是否注册及来源，不能只 grep 节点名称。
5. 在所选 Python 做有超时的导入/能力探针，区分 package 存在、import 成功、CUDA kernel 可用、实际生成使用。稀疏内核若 import 会执行 CUDA/JIT，放到已占用测试资源的运行阶段；设置离线扫描保持原有离线边界。只检查新能力所需的包，不无差别 pip upgrade。
6. 核对 KJ 当前 revision 与新版预览/Compiler 接口。前次 KJ 为 `3f20054`，不得直接认定已经兼容；固定实际需要的已验证 revision。Spectrum/Continuum/Motion Context/PlagueKind 只更新确实需要的 pin，保留旧路线支持范围。
7. 整理一张有限清单：能力 → 核心/节点版本 → Python 内核 → 模型/LoRA 文件 → API 输入 → 支持模式 → Spectrum 接缝 → 本机可测性。PDD、Sol、原生 SLA、VSA、Kitchen dense、原生 offload、新 VAE 各一行即可。

**完成条件：**可以明确区分“本机可执行”“缺包/缺权重”“仅 source/schema 支持”。对缺失资产继续完成不依赖它的实现，不能把存在未知项当成整个升级的停工理由。模型权重保持用户管理；列明准确文件/目标位置/来源，已有下载 UI 才走其既有授权流程。

## 四、步骤 2：升级核心兼容声明，清理 H3 Memory

**先调查：**重点读 `electron/services/comfy-compatibility.ts`、`src/core/workflow-metadata.ts`、H3 catalog、`workflows/` API JSON，以及下面的公共逻辑边界。使用 `rg` 收集所有 H3 Memory / H3-Optimizations 引用并按用途分组。

### 2.1 核心与既有工作流无感兼容

- 把通用及 H3 相关推荐统一到 0.35.0，避免设置卡片、manifest 和入队检查各写一份版本事实。优先复用已有 shared catalog；确有重复时抽出一个纯兼容策略模块。
- 已有工作流保留合理的旧核心最低版本；用到新增原生节点的路径要求相应能力/0.35.0。版本不可解析时使用 schema/能力证据，不把 unknown 直接判成合格，也不把推荐版本误当所有任务的硬下限。
- Spectrum 在 PDD-capable 核心上要求至少具有 0.2.21 修复，推荐仍为 0.2.24。固定到本次实际验证 revision；本机满足就跳过更新。将要求应用到真实入队/运行检查，不能只改卡片文案。
- 以原生节点的新 schema 更新应用生成的 API graph；保留用户参数、model/LoRA ID、旧 queue/history 读取与重试。新增可选输入不意味着必须填满：现有 Ref2VA 保持参考 latent 语义，不因 VAE 变成 optional 就省略它。
- 新核心已经修复 video/audio denoise mask，应检查现有 adapter 是否重复补偿；有重复补偿才删除并补回归，不能再手动乘一遍 mask。保留 JointAV 音频 carry、上下文和帧网格。
- 无感升级不要求新做核心自动更新器或每次启动 pip。通过应用包携带新版 API 图与兼容代码；已有安装管理路径只更新所选实例确实缺少的节点/依赖，沿用其进度、失败日志和重启机制。
- 真正覆盖外部节点/配置前，复用既有小范围后台备份：记录原 revision、受影响配置和可恢复改动；不复制整套模型或媒体，不 reset 外部 dirty 工作区。新核心已安装且无改动时不制造备份步骤。未试过恢复的备份只能标“已保存”，不能写“回退已验证”。

### 2.2 清理清单与保留接缝

| 位置 | 应做处理 |
| --- | --- |
| `src/core/catalog/dependencies/nodes.ts`、catalog exports、`workflow-metadata.ts`、H3 model manifests | 移除 `h3-optimizations` 卡片、推荐、安装/批量安装、别名探测和依赖引用；无此节点时普通 H3 仍能通过检查。 |
| `src/core/h3-memory-workflow.ts` | 先把 `normalizeMiniMaxH3ModelPatchChain`、Spectrum/preview 输入与仍使用的链顺序逻辑迁至明确的公共模块，建议 `h3-model-patch-workflow.ts`；再删 H3MemoryOptimization、H3AIMDOResidencyLimiter 注入与撤回功能逻辑。 |
| `src/core/h3-memory-policy.ts` | 把 `H3AttentionOwner`、Turbo 判定和 `resolveMiniMaxH3ExecutionPlan` 的有效部分迁至 `h3-execution-policy.ts`；移除内存策略/块大小等失效决策。公共 resolver 仍负责 Spectrum、LoRA 与注意力组合。 |
| `src/core/h3-memory-contract.ts`、`electron/services/dependency-scanner.ts`、`comfy-ui.ts`、`comfy-log-bridge.ts`、`dependency-installer.ts` | 移除仅服务失败节点的 schema、目录搜索、运行证据、日志 parser 和安装分支；保留通用扫描、节点信息缓存、错误解析与执行证据。 |
| `src/infrastructure/comfy-runtime-policy.ts` | 移除旧 `h3-memory` 策略身份与旧动态参数识别分支，下一步以新的原生 H3 策略替代；不能因为 CLI 含 async/dynamic 就复活旧 Memory。 |
| `src/types.ts`、defaults/recovery/store、queue、history、settings/locales | 清除可操作入口和新记录中的无用值。旧字段可在最小 legacy reader/normalizer 内继续接受并归一为撤回状态，不能影响新策略或使旧任务加载失败。不要重写历史 ID 或删除含旧字段的记录。 |
| `tests/h3-memory-*.test.ts` | 公共链、Spectrum/Turbo 不变量的测试迁至对应新模块；撤回功能测试删去，留下少量“旧数据可读且不会注入失败节点”的兼容回归。不能整批删测试使断言消失。 |
| 同名受 Git 管理 `.js` | 先核对项目当前 TS/JS 消费与生成规则，再同步迁移/清理确实对应的文件；不要留下可被导入的旧副本，也不要用无目标的 tsc 在 src 内重新生成全库 JS。 |

文档处理：将旧 H3 Memory 长计划中唯一必要的失败结论/停止理由提炼到 `docs/archive/h3-memory/README.md`（最多一屏），然后删除该长计划。用户已明确授权清理该失败路线，不需重复询问。不要把整篇计划换路径后继续保留为可执行方案。

短说明须保留与其他有效路线有关的独立失败边界，例如旧证据中的 Sage 2++ / SM89 进程退出并不以 H3 Memory 开启为前提；按实际版本与 kernel 名限定结论，不能随旧计划删除而丢掉这条限制，也不能扩展为所有 Sage 后端都不可用。

定向更新 `docs/archive/README.md`、`docs/development/DOCUMENT_INVENTORY.md`、`DOCUMENT_POLICY.md` 及所有旧路径反链。H3 adoption、settings、research 和其他 TASK 是多主题资料，只修本次相关链接/过时启用说明，不整文件删除或重写其历史证据。当前契约中“暂时关闭，待 H3 Memory 完成”的表述改成撤回后的正式边界。

**验收：**活动 catalog/API 图/安装入口不再含失败节点；`rg` 的剩余命中只能逐项解释为最小旧数据兼容、短撤回记录或明确历史事实。共享 patch chain 仍把 LoRA、sigma/采样补丁、注意力、Spectrum 和 preview 接到正确 MODEL 消费端，重复规范化不新增重复节点。

**定向测试入口：**`tests/comfy-compatibility.test.ts`、`workflow-metadata.test.ts`、`h3-workflow-contract.test.ts`、迁移后的 H3 chain/policy 测试、`store.test.ts`、`recovery.test.ts`、`environment.test.ts`。只运行此次修改涉及的集合。

## 五、步骤 3：接入性能与加速选项，贯通队列和运行策略

**先调查：**比较目标 `cli_args.py`、`model_prefetch.py`、原生 attention 节点及本机内核能力；读 settings 表单的保存/恢复路径和 claim-time VAE 契约。字段名可按代码风格调整，以下语义不能丢。

### 3.1 设置模型与默认值

| 概念 / 建议字段 | 取值与初始行为 |
| --- | --- |
| 密集后端 `h3AttentionMode` | 保留 `sage`、`sage-triton`、`pytorch`，新增 `comfy-kitchen`；默认继续 `sage`。 |
| 稀疏策略 `h3SparseAttentionMode` | `auto`、`off`、`sol-attn`、`native-sla`、`vsa`；默认 `auto` 表示沿用所选模型/LoRA 的既有策略，普通 H3 不额外开启稀疏，旧 Turbo-SLA 继续现有 SLA。`off` 指稀疏关闭，与 Spectrum 无关。 |
| 原生运行策略 `h3RuntimeMode` | `compatibility`、`native`；默认 `compatibility` 保留当前 pinned/async 行为。`native` 使用步骤 1 确认的 H3 原生动态显存与 async/pinned 组合，并给出实际支持条件。 |
| 内存编译 `h3ComfyCompilerMode` | `auto`、`disabled`；默认 `auto` 遵循所选核心的原生行为，`disabled` 对应经核对的 `--disable-comfy-compiler`。显示名必须是“内存编译”，不要写成通用 torch.compile。 |
| 最终视频 VAE `h3VideoVaeMode` | 保留 `auto` / `fp16` / `int8-convrot` 和已有默认。只有查到真实且正确的新增 VAE 后添加明确枚举及文件映射；新候选不自动进入 Auto 优先级。 |

普通用户先看到简洁选项和缺失依赖说明；高级的 tau/token 阈值、stream 数等使用集中维护的保守参数，不为每个 kernel 参数堆 UI。测试可在证据/专用 fixture 中逐项比较，不在正式默认中反复调参。

明确兼容条件：原生 SLA 仅对匹配训练策略的模型/LoRA 可选；VSA 仅对验证的 FastH3 权重可选。对模型要求的稀疏策略，显式 `off` 或其他冲突选择要在统一 resolver 中解释或阻止入队，不能 silently 生成另一种策略。设置可显示条件选项及所缺项目，但不能显示“可用”却提交无效图。

### 3.2 全链路实现

1. **单一解析器。**扩展步骤 2 提取的 execution policy，输入模型/LoRA、所请求后端、可用节点/内核及 Spectrum，输出 requested/applied 配置、互斥原因和必需依赖。settings、enqueue、graph 与运行校验复用它，不能维护四套判定。
2. **保存与迁移。**同时改 `src/types.ts`、`src/core/defaults.ts`、`recovery.ts`、`electron/store.ts`、`electron/services/settings-service.ts`、设置 `form.ts`/controllers。枚举在 load/save 均校验；旧设置缺字段使用兼容默认，未知值安全归一，不覆盖已有 Sage/VAE/Spectrum 用户选择。
3. **快照。**在 `src/core/queue-task-factory.ts` 的 generation、extension、H3 native upscale 路径保存新运行/attention 策略；同步 enqueue、序列化、恢复、重试、history 详情与执行日志。设置保存后，所有仍处于 waiting 的 H3 任务（不论何时入队）刷新 dense/sparse、runtime、compiler 四项策略；不能等到 claim 时才临时吸收全局设置。任务开始运行后策略固定，运行中修改设置不改变该任务。
4. **VAE 的既有例外。**沿用 `src/core/h3-video-vae.ts` 和 `electron/queue-executor.ts` 的 claim-time 解析：开始前选定并写回实际 backend，运行后固定。FP16/INT8 原有互相回退与 Auto 优先级保留；新候选缺失/不兼容应明确说明，不偷偷扩大 Auto 或跨家族回退。
5. **真正控制进程。**`comfyUiSettingsForQueueTask` 目前主要选模型，必须让它消费任务快照中的新运行配置；沿 `queue-runtime-service`、`queue-service`、`queue-executor` 传到实际启动参数。native upscale 两段执行和恢复均要一致，不能只改首次 generation。
6. **重启与家族隔离。**在队列任务之间按实际有效启动参数核对/切换，不在采样中重启；修正 command-line profile 解析，防止 native 被识别成已撤回 h3-memory 而反复重启。Q3/3080、Qwen、prompt-resident 保留原策略；CPU-VAE 与 GPU-only 二采互斥仍严格检查。远程只连接，不能尝试重启或虚报已应用本地 CLI。
7. **UI。**入口为 `src/renderer/pages/settings/page.ts` 的 accelerationPanel，连同 `form.ts`、`selectors.ts`、`fields-controller.ts`、controllers、save coordinator、view-model、copy/locales 一起改。沿用现有控件与布局，全部当前语言补齐。模型切换/扫描不丢输入、焦点或选中值；不读取不存在控件并把保存值重置成默认。

### 3.3 节点图与能力探针

- Kitchen dense 用原生 `ModelAttentionBackend`；以实际 schema 中的 `pytorch attention` / `comfy kitchen attention` 等值适配，不把内部枚举直接塞入 API。保留已接受的 Sage → Triton → PyTorch 降级契约，但新显式选项不得被旧 normalizer 一律归一到 Sage。
- Sol/SLA/VSA 用 `BlockSparseAttention`；先保存一份目标 DynamicCombo 的有效 API 输入 fixture，再编写 builder。不要把 UI 的 `selection` 显示对象或嵌套形式凭空猜成执行输入。
- 一个模型链只有一个稀疏策略拥有者：原生 SLA 选中时替换该任务的旧 `H3SLAAttention` 注入，不能同时包两层。原有 PlagueKind SLA 仍供 auto/旧任务使用。
- 旧 `sparsity_ratio=0.85` 只在比例上对应 `keep_percent=15`。首/末 dense、sigma 区间、block、音频保护、最小 tokens、precision 都需独立核对；新默认 10% 不可直接等价替换。先用训练资产给出的参数，参数未知则该组合不启用。
- H3 分块 QKV 路径的 CUDA/BF16 activation、head dimension、token 门槛及 backend availability 要有检查或诊断；INT8/INT4 文件精度不是 activation dtype 的证据。kernel/dense fallback 必须在证据中可识别，成功输出不能自动标记为稀疏成功。
- 为 `BlockSparseAttention`、`ModelAttentionBackend` 扩展 graph chain allowlist、MODEL 输入/输出遍历、能力契约和 normalization；覆盖 BasicScheduler、BasicGuider、Continuum sampler 等实际消费者，避免出现插入了节点但最终采样绕过它。
- 扩展 `electron/services/attention-python-probe.ts` 与扫描数据，只探测所选 Python；沿用阶段超时/unknown 语义与同轮 schema 共享。尤其修正 enqueue 中“attention 不是 pytorch 就必须 Sage”的旧推断，按真实 backend 要求依赖。
- 新原生 runtime 保留 `--cache-none` 语义；Compiler、预取与 Spectrum 分层。不要恢复旧 H3 Memory 的 force-quant、residency limiter 或全局 monkeypatch，也不自行开启所有 torch.compile。
- preview 仍独立 opt-in，保留当前单帧/512px 等限制；对照 [Compiler/preview 修复](https://github.com/Comfy-Org/ComfyUI/pull/16180) 检查 KJ 的实际 decode 路径。合法 graph breaks 可以存在，失败不应破坏主生成或让下一任务继承坏 patch。

**验收：**保存/重启可恢复新选项；旧设置和旧队列稳定；任务快照与命令行、最终 API 图吻合；非 H3 流程无新增 H3 参数；无 H3-Optimizations 依赖。新增选项各有明确可用性/失败状态，默认图除必要兼容修正外保持原策略。

**测试入口：**`tests/settings-form.test.ts`、`settings-selectors.test.ts`、`settings-save-coordinator.test.ts`、`recovery.test.ts`、`store.test.ts`、`queue-runtime-service.test.ts`、`queue-executor.test.ts`、`comfy-runtime-service.test.ts`、`h3-video-vae.test.ts`、`h3-workflow-contract.test.ts`。新增核心 resolver/graph 断言可放对应小测试文件，测试行为，不只比新枚举字符串。

## 六、步骤 4：接入 PDD LoRA，补齐资产和依赖面板

**先调查：**由 [原作者模型卡](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs)、[ComfyUI PDD 接口](https://github.com/Comfy-Org/ComfyUI/pull/15908) 与 [Kijai 转换文件目录](https://huggingface.co/Kijai/MiniMax-H3-experimental/tree/main/loras) 核对实际文件。原始 diffusers LoRA 与可供 ComfyUI 加载的转换文件不能混用。

已找到下列候选文件；执行者固定完整 revision、大小/校验信息，并按应用基座的 pruned 布局选择，不因为名字像就全部接受：

| 路线 | 转换文件候选 |
| --- | --- |
| FL2VA PDD 8-step | `MiniMax-H3-FL2VA-Acc-8Step_comfy.safetensors` / `MiniMax-H3-FL2VA-Acc-8Step_pruned_comfy.safetensors` |
| Ref2VA PDD 8-step | `MiniMax-H3-Ref2VA-Acc-8Step_comfy.safetensors` / `MiniMax-H3-Ref2VA-Acc-8Step_pruned_comfy.safetensors` |

1. 在 `src/core/catalog/loras/definitions.ts`、`catalog/models/loras.ts` 与相关 exports 添加两条稳定 LoRA 身份，建议 `h3-pdd-fl2va-8step` / `h3-pdd-ref2va-8step`（先检查冲突）。以仓库现有 ID/组件映射方式落地，不能给同一文件再造一套维护源。
2. 补 `video-loras.ts`、`video-policy.ts`、H3 prompt/LoRA 文案、文件扫描和 LoRA 面板。显示适用基座、所需文件、核心/Spectrum 条件及未安装状态；选中时应用本路线参数，不修改其他 LoRA 的全局默认。
3. 固定 sampler/scheduler、steps、video/audio shift、strength 与输出 head bank 布局。上游 8-step/simple、12/3 是调查起点，sampler 和所用转换文件最终以目标官方示例/metadata 核实；初始按验证的 strength 使用，若转换格式要求 1.0 就锁定/约束，不能任意缩放或与另一加速 LoRA 自动叠加。记录 steps 与实际 NFE 分别是多少。
4. 普通 LoRA loader 已可承担 PDD 原生加载时，复用它，不为 PDD 再引入 H3-Optimizations。验证低显存部分加载、切换 PDD → Base → 原 Turbo 后输出 head bank 正确撤销，队列复用模型不串状态。
5. 对每个已有基座变体明确 supported / pending / incompatible：至少区分 FL2VA/Ref2VA、INT8、INT4、GGUF、pruned。不能从一个 INT8 成功自动开放全部。现有 native 1080p“Base、无 LoRA”的限制继续存在，本次不顺手扩大。
6. FastH3/VSA：核对官方权重类型、训练 pattern、Windows kernel 与 Spectrum 接缝。真实资产是完整 checkpoint 就进基础模型 catalog，是 adapter 才进 LoRA；没有匹配权重时 VSA 保持条件不可用，不注册虚假的“通用加速 LoRA”。可继续交付已有的 VSA schema/能力适配，明确 runtime 未验。
7. 新 VAE：定向查目标 release/tag 与所采用模型官方资产清单，核实 final video VAE 的文件、latent/layout、precision、loader 和 GPU/tiling 支持。存在才接入设置、catalog、claim-time resolver 和测试；只发现预览 TAE 或 optional reference VAE，则登记“未发现新增最终 VAE”，完成调查分支，不补假条目。
8. “节点与依赖”补齐 native attention 的核心能力说明、实际需要的 kernel/包及准确版本。核心自带节点不出现独立 Git 安装按钮；Python 包不伪装成 custom node；可用的安装动作复用所选 Python、ABI 检查、日志、重启和复检。Windows 无可用后端时显示具体缺项，不隐式换 Torch/CUDA 或发起长时间源码编译。

**验收：**LoRA 面板可选择/识别/入队，错误基座与缺文件能被准确拦截；从旧 History 重试不会变成新 PDD；新内核的文件/注册/运行状态区分清楚，界面没有 H3-Optimizations。新增模型资产与节点配置均来自单一 catalog。

**测试入口：**`tests/video-loras.test.ts`、`settings-lora-layout.test.ts`、`h3-capabilities.test.ts`、`create-enqueue.test.ts`、`workflow.test.ts`、`h3-workflow-baseline.test.ts`、`environment.test.ts` 及受影响的安装测试。缺权重也能完成 schema/图/迁移断言，但 runtime 必须如实留空。

## 七、步骤 5：集中验证，全部保留 Spectrum 兼容条件

### 5.1 代码与界面检查

迭代时用 `npm.cmd test -- tests/<实际测试文件>.test.ts` 运行受影响测试，用 `npm.cmd run typecheck` 定位类型断链；不要机械地每一步全量构建。整合完成并取得 dist 使用权后运行一次 `npm.cmd run verify`；之后只有相关输入变化、失败或未解风险才重跑。新增文件名先确认，不能把占位命令原样执行。

同时完成：所有受影响 bundled H3 图在默认/新配置下的结构和目标 schema 校验；旧 store fixture 的加载/保存/重启；queued task 不随设置漂移；取消、失败重试、history lineage、native upscale 两段恢复；本地进程参数切换和远程连接边界。静态 baseline 变化要解释节点/参数原因，不能只更新 snapshot 消除红灯。

按 [真实 Electron runbook](../../AGENT_ELECTRON_API_RUNBOOK.md) 使用应用 API 完成闭环，复用已有构建，隔离测试 userData/state/media。通过当前 `window.studio` 的 scan、enqueue、startQueue、cancelTask 等实际接口操作；具体签名以当前 typed AppApi 为准。直接向 ComfyUI 发图只计底层探针，不能代替应用队列/history 验收。

UI 至少检查 1280×800、1440×900 和当前窄窗口：性能选项可见可保存，LoRA 卡片/依赖缺项清楚，键盘与焦点稳定，扫描不重置值，运行中改设置不污染已排队快照；Create、Queue、History 导航/播放/返回仍可用。沿用 [UX 契约](../../UX_CONTRACT.md)，不重做历史原型。

### 5.2 真实运行顺序与测试矩阵

共同规则：每次只跑一个重 GPU 阶段；使用本机已经安装的模型及可重复测试素材。基准使用当前已保存/已支持组合，Spectrum 显式设为当前开启档（例如 balanced），保持当前参数与 model-aware 默认关闭。对照实验只改变表中指定项，不需要 Spectrum-off 输出。

先做少量短片排除接口错误，再复用同素材/seed 的代表性约 5 秒片段。帧数由现有 H3 对齐函数产生；以当前支持的 720p/768p 尺寸为主。稀疏样例必须达到 min_tokens，不能用低于阈值的小图“证明加速”。普通 Base 采用足够的采样步数观察 Spectrum forecast；few-step 路线可能合法地全 actual，应据日志解释，不强求预测次数大于零。

| 顺序 | 最小验证组 | 关键证据与通过条件 |
| --- | --- | --- |
| A | 0.35 当前策略：FL2VA Base、Ref2VA、已安装且支持 Spectrum 的旧 Turbo / SLA / v4 / 保留 8-step 路线，各一条最小图；共享同一图策略的变体可用静态映射说明减少重复 | 原模型参数保留，图提交成功、有可播放视频/音频，Spectrum 包装接缝无异常；至少一条代表性 Base 记录 forecast/actual，验证预测确实被使用。 |
| B | 同一 Base + Spectrum：现有运行策略对照 native；必要时 compiler auto/disabled、async/pinned 分别做有界诊断 | 实际 CLI 与配置一致；记录加载/采样/解码、显存及 RAM；不把两项一起变化的结果归因于某一个开关。Compiler disabled 也保持 Spectrum-on。 |
| C | 同一 Base + Spectrum：Sage 对照 Kitchen dense，再 Sol；已有 SLA 权重对照旧 SLA 与原生 SLA；VSA 仅限资产/内核俱全 | 最终 MODEL 链只有一个稀疏 owner；确认实际内核/producer 与 dense fallback；画面/动作/音频无明显回归。失败或 dense 回退不能标为稀疏加速通过。 |
| D | 同一 H3 + Spectrum：现有 FP16 / INT8 ConvRot；确有新最终 VAE才补一组；preview 当前关闭对照显式开启 | 最终 decode backend 确认，画面无新增黑帧/色偏/闪烁，GPU-only 路径仍用 GPU；preview 失败不损坏生成，graph breaks 按来源解释。无需新造 VAE 测试占位。 |
| E | 新 PDD FL2VA、Ref2VA + Spectrum，各一条最小输出；紧接着同进程 Base/旧 Turbo | LoRA/head bank 正确加载与解除，采样/音画正常，任务切换不污染模型；不能因 Spectrum 组合失败就改为关闭 Spectrum 完成验收。 |
| F | Continuum / JointAV 的已有 Spectrum 支持路线：续写或 refine，包含部分视频/音频 mask；native 1080p Base 无 LoRA的两阶段图与恢复检查，真实短样例仅在该路径能保持 Spectrum 条件时执行 | 接缝、参考条件、音频 carry/同步与首帧 latent 锚定保留；二采配置、GPU VAE、阶段恢复/History 父子关系正确。1080p 不变成单次直出。 |
| G | 一个运行中取消 → 下一任务；H3 → 非 H3 → H3；隔离状态下重启恢复已有排队/二阶段 fixture | 取消后 patch/显存/进程状态可继续工作；新 H3 参数不进入其他模型，旧任务字段缺失可恢复。尽量复用前述任务而非另开一套耗时样片。 |

Motion Context 的既有 r2v 路径强制 Spectrum-off 是用户确认的已知边界：保持现状，不调查、不修复、不安排 Spectrum 组合实验。共享代码变更只需静态/单元回归确认该 guard、原图与旧任务读取未被破坏，本批不把该路线标成 runtime 已验。

其他既有路径若声明 Spectrum 不支持或不适用（例如 Q3 / 某些独立 native upscale 阶段），沿用其产品边界；不能把缺少 Spectrum 字段当成已开启，也不为了本批覆盖去运行 Spectrum-off 采样。完成相应 schema/图/状态恢复检查并列明 GPU 未验。INT4、1440p 等支持组合按已安装资产、硬件与当前开放范围决定最小覆盖，不扩大功能范围。

不用全组合笛卡尔积。每个失败组合先读首个有效错误和实际 patch/参数，做一次有依据的修正后重试；同因再次失败就隔离该候选、记录问题并继续其他组，不能通过关闭 Spectrum 取得“通过”。可用性 bug 仍应修复，缺权重/无 Windows kernel 等外部条件明确列为未验。不得给尚未生成过的组合标“推荐”。

### 5.3 记录、质量比较与清理

- 每条运行记录：应用/core/node revision、包/GPU、模型与 LoRA 的可识别版本、测试输入 ID、尺寸/帧数/fps、seed、采样器/steps/实际 NFE、attention/VAE、CLI、Spectrum requested/applied 与 forecast/actual。媒体和机器绝对路径留本地，提交可读摘要。
- 性能分加载、采样、解码、总时长；首次加载/JIT 与热运行分开，记录专用/共享显存、RAM 和可取得的 pagefile 信息。候选更快时再对关键组合重复一次排除偶然值；有参数差异只报告观察，不写精确跨版本提升百分比。
- 质量看同输入片段的主体、动作、参考一致性、接缝、闪烁、音频内容/同步、黑帧/NaN。部分 mask 的新核心修复可能改变旧错误输出，不要求逐像素一致，但必须验证受保护区域和音频行为。
- 测试开始前记录占用资源和初始配置。运行有可观测进度和有限超时，长时间无进度按既有取消/诊断路径处理；不要靠无限重试或同时开多服务抢 GPU。结束只清理自己创建的进程/临时状态，不能关闭其他任务服务或删除用户输出。
- 测试临时选项通过隔离状态使用；若必须改用户配置，保存所改字段并在无并发用户修改的前提下恢复。应用的本地单实例接管/退出停止契约保持一致，远程服务不动。

## 八、完成判定与交接

Luna 完成五步后在 TASK 更新唯一当前摘要，`evidence/upgrade-validation.md` 提交精简测试表、实际命令、通过/失败/未运行范围及资源清理结果。

- **必需交付：**0.35 推荐与核心 API 兼容、Spectrum 条件校验、H3 Memory 退出、有效性能选项的保存/图/运行闭环、PDD 两类 LoRA 的 catalog/参数/兼容接入、必要依赖说明、旧数据回归与实际可用环境的生成证据。
- **条件交付：**确实没有新增最终 VAE时以核查结论结束该分支；VSA/新资产或 Windows kernel 缺失时可保留已完成的条件适配和明确禁用/未验说明。不能把这些条件扩大为“只改文案就完成新后端”。已有本机可测的核心和 Spectrum 路线仍需实测。
- **阻塞处理：**某候选无法与 Spectrum 兼容时，给出精确失败条件、已做修复和仍需资源/上游变化；保留当前默认稳定路线，该候选不得推荐。用户不需要重复批准已确定的正常实现步骤。
- **契约与发布记录：**完成后定向更新 WORKFLOW、DEPENDENCIES、UX 的实际行为及 CHANGELOG Unreleased。整体含新可选后端/LoRA，按 minor 影响评估；本计划不预先 bump 版本。只有本次还承担正式发布时，才按仓库流程统一 package/lockfile/README 版本，避免与其他任务各自 bump。
- **最终检查：**检查 scoped diff、意外删除、旧文档断链、活动 H3 Memory 引用、默认值变化和无关改动；通过的同状态 verify 不为交接再跑一次。代码未验证、runtime 未验证、质量未评估分别说清，不能用一个“已完成”遮盖。

给执行任务的启动指令可直接使用：

> 请以单个 Luna（Max）独立执行 `docs/tasks/2026-09-10-comfyui-035-h3/PLAN.md`，先读 TASK 并核对当前工作区。按五步连续完成，每步可先做定向调查，不派生 agent，不安排例行阶段审批。保持现有默认和 Spectrum 兼容条件；Motion Context 关闭 Spectrum 是已知边界，维持现状，不调查或修复。完成产品实现、必要验证、文档及证据更新；对缺失模型/内核或无法与 Spectrum 兼容的其他组合准确报告，继续完成独立可做部分。
