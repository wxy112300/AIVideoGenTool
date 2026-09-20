# H3 Canonical AV Latent 与 Continuum 官方逐段 Extend 计划

- 类型：实施计划
- 状态：accepted direction / implementation pending
- 日期：2026-09-18
- 适用范围：MiniMax H3 AV latent 生产与消费、Continuum V3.8.2 Run Storage、History/Queue/Extend 血缘、Motion Context 与 Native JointAV 适配
- 当前任务：[TASK.md](TASK.md)
- 上游权威：本机 `ComfyUI-H3-Continuum` 3.8.2 README/源码、`ComfyUI-H3-Motion-Context` v0.6.2 README/源码；产品行为以当前仓库契约和真实 GPU 证据为准

## 1. 目标与不可变决策

### 1.0 Source-first 硬门（禁止猜测）

本任务曾因把隐藏 `initial_state` 兼容入口当成官方主要 Extend 方法而长期偏离正确路径。后续实现必须采用以下证据顺序，不能根据节点名、相似 Tensor、旧 workflow 或经验自行推断：

1. **当前版本官方 README/迁移文档**：确认用户应该如何连接、设置、Review、Retry、Resume 和 Extend。
2. **当前安装版本实际源码**：确认输入如何解析、状态如何选择、何时 fallback、文件如何保存/校验、输出如何组装。
3. **当前安装实例 `/object_info`**：确认实际注册 Node ID、required/optional inputs、类型、默认值和返回值；不得用仓库里未注册的历史类替代公开节点。
4. **上游测试和示例 workflow**：确认边界行为、widget/API 字段顺序、Run Storage/Take/terminal group 语义。
5. **应用生成后的 API graph 与 ComfyUI `/history` receipt**：证明请求实际进入预期节点、实际选择预期来源并产生预期 reused/generated 结果。
6. **真实 GPU 输出和人工接缝检查**：只用于证明运行与质量，不能由静态测试代替。

如果 README、源码、`/object_info`、示例或运行报告不一致：

- 立即停止该路径的实现或启用；
- 记录插件版本、commit、冲突文件/符号、object-info 与最小复现；
- 优先按当前安装源码解释事实，但不得擅自宣称该行为受官方支持；
- 不通过隐藏 socket、C3 facade、伪造 manifest、猜测 widget 顺序或恢复历史 Node ID 来“修通”；
- 在获得明确证据或用户决定前保留现有兼容路径。

以下内容不能作为 runtime 权威：

- Continuum Skill/LLM System Prompt（只负责提示词写法）；
- 社区 prompt 案例；
- 旧版本 workflow 截图；
- 类名仍存在于源码但未被当前公开 registry 导出的节点；
- “两个 safetensors 都有 video/audio，所以一定能互换”的推断；
- 节点执行成功、生成了 MP4，或 Spectrum 日志出现但没有 Run Storage/transport receipt。

在修改任何 workflow 前，执行者必须先提交一份可审查的 source-to-contract matrix，至少包含：

| 路径 | 官方入口/版本 | Producer 实际输出 | Consumer 实际输入 | 文件/schema/metadata | 状态/索引语义 | fallback 行为 | 应用映射 |
|---|---|---|---|---|---|---|---|
| Continuum managed first | V3.8.2 public sampler | 源码确认 | 源码确认 | Run Storage 源码确认 | Review/Run/Chunk | 源码确认 | 新 managed workflow |
| Continuum managed continue | 同一 Run Storage | 源码确认 | 源码确认 | manifest/revision/chunks | reuse/Take/branch | 源码确认 | N -> N+1 |
| Legacy JointAV bootstrap | app node + V3 internal state | 完整 AV | bounded state | app manifest/state schema | clip index | fail-closed | legacy only |
| Motion Context | v0.6.2 public nodes | 完整 AV | file/plain list + pixels/audio | upstream saver/loader | Load N-1/Save N | README/源码确认 | canonical adapter |
| Native upscale | app-owned nodes | 完整 AV | NestedTensor | app manifest | artifact lineage | fail-closed | canonical adapter |

Matrix 中的“源码确认”必须替换成实际文件、类/函数和观察结果后，才能开始 Phase 2。只写概念说明不算通过。

### 1.1 用户目标

用户需要的主流程是可控的逐段长视频，而不是一次生成大量 Chunk：

1. 首段从头生成一批候选。
2. 选择满意视频进行一次 Extend。
3. 可以对多个候选分别 Extend，也可以对同一已接受前缀生成多个下一段 Take。
4. 选择满意 Take 后从该分支继续 Extend。
5. 典型交互仍是“一次增加一段”，而不是一次跑完整长片。

### 1.2 已接受方向

- Continuum 管理的序列从首段开始使用官方 `Run Storage = Save + Auto Resume`。
- 每次只把最终 `Chunks` 从 `N` 增加为 `N+1`，使用 `Review Each Chunk`；不得把 Review 理解为一次生成全部 Chunk。
- Continuum 管理的后续 Extend 复用同一 Run/Project/兼容前缀，不使用外部 `initial_state`，不再把新段作为独立视频用 FFmpeg 拼到旧成片。
- 外部 JointAV Bridge 只服务旧历史或非 Continuum 首段的兼容导入；第一处接缝不承诺等同官方同 Run 续写。
- H3 AV latent 的物理 payload 只生产一次。JointAV、Motion Context、Continuum 是消费协议或契约，不应因为名称不同重复保存相同 Tensor。
- 不修改上游 Continuum 的采样、Run Storage、Review、Take 或 manifest 语义；优先用公开 V3.8 节点和官方工作方式。
- 不自动删除或重写现有历史 latent。旧资产迁移先索引、验证和引用，再单独提供可恢复清理。

### 1.3 非目标

- 不把缺少生成契约的旧 JointAV/Motion Context 文件伪造成官方 Run Storage Chunk。
- 不承诺 Run Storage 让 H3 看见整条历史；下一段仍只消费 Continuum 支持的有限 context。
- 不承诺任意更换模型、LoRA、尺寸、prompt、参考媒体后仍复用旧 Chunk。
- 不通过重复写更多否定 prompt 掩盖底层 fresh run、错误分支或错误 context。
- 不删除现有 Bridge、Motion Context 或历史兼容路径。

## 2. 上游契约：执行前必须理解并保持

### 2.1 Continuum V3.8.2

- `Chunks` 是最终总数，不是本次新增数量。
- `Review Each Chunk` 每次最多生成下一个 physical group；`Use it and continue` 接受当前结果并生成下一组。
- `Try this chunk again` 保留此前接受前缀并产生当前 review unit 的新 Take。
- `Continue From Here` 从选中 Take 的前缀创建后续分支。
- 普通追加：保持 Run identity、Base Seed fixed、Seconds per Chunk、模型/LoRA、媒体、尺寸、sampler/sigmas、Continuity、Audio Continuity 等生成契约，增加最终 `Chunks`。
- Run Storage 保存每个逻辑 Chunk 的完整 Video/Audio latent，同时保存 prompt hash、seed、context、plan、revision、Take/branch provenance 和全局 sampling contract。
- Finalize 输出截至当前接受前缀的完整序列；继续生成仍会重新 decode/assemble/save 完整输出，旧 Chunk 不重新 Sampling。
- `Run Storage = Off` 的旧运行不能被官方机制追溯恢复。
- `Seconds per Chunk` 对同一 Run 固定，官方不支持每段不同秒数。
- First/Last Frame、References、Driving Audio、Video Guide 和 Prompt Plan 都参与兼容身份；Last Frame 在增加最终 Chunk 时尤其可能使旧末段失效。
- FL2VA 5 秒 Long Terminal Merge 的最后两个逻辑 Chunk 是一个原子 physical group；History/Review 不能把它们错误拆成两个可独立接受的生成。
- Spectrum 使用上游 H3 Continuum Interop API v1；Continuum 路径允许 Spectrum，但必须在整个 Run 保持相同有效契约。

### 2.2 Motion Context v0.6.2

- Save Latent 保存 sampler 输出的完整 `video`/`audio` safetensors。
- Load 0 表示首段无 latent；正数 index 精确读取要继续的旧 clip slot。
- 生成 clip N 时应读取 N-1、保存 N；reroll 覆盖当前 N 的 slot，不能错误读取被拒绝的当前结果。
- `context_length=22`、`audio_context_length=24`，同时可消费 source tail pixels/audio 与 `context_latent`。
- Loader 接受 ComfyUI output 下的具体 safetensors 文件，只要求存在 `video` 和 `audio`；因此可以消费 Canonical AV payload，不需要再保存 Motion Context 专用副本。
- Motion Context 的返回 wrapper 与 JointAV/Continuum 不同；统一的是磁盘 Tensor，消费时仍必须构造各节点要求的内存对象。
- Motion Context 继续遵守当前 Spectrum 禁用边界，不因共享 latent 自动获得 Continuum 的 Spectrum 能力。

### 2.3 应用 JointAV

- Canonical Tensor schema 为 Video `[1,24,T,H,W]`、Audio `[1,32,2,T]`，保留 dtype/shape/finite/hash 校验。
- Native upscale 和应用 Bridge 需要可信模型、VAE、尺寸、帧数和来源 manifest；不能仅凭文件扩展名视为兼容。
- 当前 `commitProducedFile` 的复制行为是重复存储来源之一；新架构应注册或链接已存在 payload，而不是无条件复制。

## 3. 目标架构：生产一次，按协议消费

```text
H3 sampler output
        |
        v
Canonical H3 AV Latent Asset (唯一物理 video/audio payload)
        |-- Native JointAV adapter -> NestedTensor / native upscale
        |-- Motion Context adapter -> plain [video,audio] context_latent
        |-- Legacy Continuum adapter -> bounded tail initial_state
        `-- Continuum managed-run reference -> Run Storage Chunk + contract
```

### 3.1 Canonical asset 不是第四份文件

它是应用的统一索引/manifest。物理 owner 按来源决定：

- 普通 H3/Native/Motion Context 生成：应用 Canonical AV 文件是 owner。
- Continuum managed run：上游 Run Storage Chunk 文件是 owner；应用只登记安全引用，必要时在 `h3-native-av` 创建 NTFS hardlink 和应用 manifest，不复制 Tensor bytes。
- 旧文件：原文件先作为 owner，迁移阶段不移动、不删除。

### 3.2 建议的数据结构

新增版本化 `H3AvLatentAsset`，名称可按现有类型风格调整，但字段职责必须保留：

```ts
interface H3AvLatentAsset {
  schemaVersion: number;
  assetId: string;
  storageKind: "app-canonical" | "continuum-run-chunk" | "legacy-joint-av" | "legacy-motion-context";
  ownerPath: HistoryFile;              // output root 下的安全相对路径
  aliasPaths?: HistoryFile[];          // hardlink 或兼容入口，不代表额外物理 bytes
  payloadBytes: number;
  payloadSha256: string;               // 整文件完整性
  videoTensorSha256: string;           // 跨 safetensors metadata 去重
  audioTensorSha256: string;
  videoShape: number[];
  videoDtype: string;
  audioShape: number[];
  audioDtype: string;
  width: number;
  height: number;
  fps: 24;
  frameCount: number;
  producer: H3AvProducerSnapshot;
  capabilities: Array<"native-av" | "motion-context" | "continuum-bootstrap" | "continuum-managed-chunk">;
  continuumChunk?: ContinuumChunkPointer;
  createdAt: string;
}
```

`producer` 至少记录 workflow/revision、diffusion model、CLIP、Video/Audio VAE、LoRA、尺寸与来源 task/version；旧数据缺失时显式标 `legacy-unverified`，不得虚构。

### 3.3 物理去重

- 同一采样输出不得同时调用 JointAV Saver、Motion Context Saver 和另一个 Run Storage copy。
- 先比较 Tensor content hash，而不是整个 safetensors SHA；不同 saver 的 header metadata 会导致整文件 hash 不同。
- Continuum owner 文件暴露给应用时优先创建同卷 NTFS hardlink；hardlink 失败才允许明确记录的 copy fallback，UI/日志显示新增物理空间。
- hardlink alias 的删除不等于删除 owner。GC 以资产引用和 Run manifest 为准，不以单一路径是否存在或 link count 单独判定。

## 4. Continuum 主流程

### 4.1 首段生产

要获得官方同 Run Extend，首段必须由 Continuum V3.8 公共 sampler 生成：

- `Chunks = 1`
- `Seconds per Chunk = 用户选择，Run 内冻结`
- `Run = Review Each Chunk`
- `Progress/Run Storage = Save + Auto Resume`
- `Regenerate From = Auto`
- 稳定且应用生成的 `projectId/runName`
- Base Seed fixed
- Prompt Format 显式使用 Timeline；不要依赖 Auto 猜测
- Continuity 默认 Balanced 22、Backend Standard、Audio Continuity true，除非产品已有明确用户选项
- Spectrum 沿用任务设置并进入不可变 Run contract

首段仍是从图片/文本/FL2VA/Ref 输入开始的普通首段体验，不显示为“先生成多个 Chunk”。每个独立首段候选有独立的 managed run identity；不能让不同 seed 候选竞争同一个 mutable canonical head。

### 4.2 普通追加 Extend

从 History 选择一个 Continuum managed 输出：

1. 读取该版本的 canonical Run/Revision/Take head。
2. 校验磁盘 Run Storage、manifest、Chunk payload 和应用 History pointer。
3. 保持冻结生成契约。
4. 仅将最终 `Chunks` 从 `N` 增加到 `N+1`。
5. 追加一个新的 Timeline Chunk prompt，旧 preamble/Chunk body byte-for-byte 不变。
6. 使用 Review Each Chunk，只请求一个缺失 physical group。
7. 预期报告必须是兼容前缀 reused、新组 generated；不能接受 silent fresh run。
8. 使用 Continuum Finalize 的完整序列作为新 History 版本；不得进入现有 `finalizeExtension` FFmpeg concat。

### 4.3 Retry、Take 与分支

- 同一前缀的下一段重抽使用官方 `Try this chunk again`/variation nonce，旧 Take 不覆盖。
- History 每个可见候选绑定精确 Take/revision，而不是只绑定当前 run name。
- 用户从旧 Take 继续时使用官方 `Continue From Here`，生成新的 branch head；旧分支仍可浏览。
- 同一 Run 的 mutation 必须串行。队列任务冻结所选 parent revision/take；领取执行时若 canonical head 已改变，不得静默改接最新 head，应使用明确分支操作或失败提示。
- 只有当前选中的 Take 成为该 History 版本的 canonical continuation source。未选 Take 不得被下一次普通 Extend 自动读取。

### 4.4 Prompt 计划

首段起就编译为：

```text
<frozen global preamble>
[Chunk 1]
<exact enhanced prompt for chunk 1>
```

第 N 次追加只增加：

```text
[Chunk N]
<exact enhanced continuation prompt for chunk N>
```

要求：

- global preamble 只放长期不变量；创建后冻结。
- 每段 prompt 保存用户原始文本、增强结果、增强模型/预设/版本和最终提交文本。
- 默认 hard-single 属于稳定 Run 规则；`[Chunk N]` 不是切镜标记，未明确多镜头时整个序列仍是连续 `[Shot 1]`。
- 后续 Chunk 不写 `0.00 seconds <Picture 1> is fully referenced`。
- prompt enhancer 只能创建新 Chunk body；不得重写已接受 Chunk。
- append-only 后必须通过报告证明旧 prompt hashes 仍被复用。若上游将新计划判为不兼容，停止并报告，不能退回 fresh run 后继续保存。

### 4.5 参考媒体语义

需要区分两类参考：

1. **Run persistent references**：实际连接给 H3/Continuum 的 First/Last/Reference Images、Driving Audio、Video Guide。它们进入官方 sampling contract，默认冻结。
2. **Enhancer observation references**：仅供 Qwen/Prompt Writer 识别边界人物、动作、尺寸和身份，不连接生成图；记录在本次 Extend prompt provenance，不改变 Run Storage contract。

如果用户在后续 Extend 更换真正的 persistent reference：

- 预检必须显示它会创建新 revision或使前缀不可复用。
- 不允许把 fresh regeneration 伪装为普通 Extend。
- Last Frame 对开放式继续序列默认不应作为永久终点约束；使用时遵循上游旧末段/terminal pair 失效规则。

## 5. 每次 Extend 必须记录的数据

是的，新方案需要比当前 `sourceVersionId + JointAV path` 记录更多信息，否则无法可靠选择前缀、Take、prompt 和参考资产。

### 5.1 序列级 `ContinuumSequence`

- `sequenceId`：应用稳定长视频 ID。
- `continuumProjectId` / stable `runName`。
- Continuum package/version、Run Storage schema、应用 workflow revision。
- 固定 `chunkSeconds`、fps、width/height。
- Base seed 与 control-after-generate=fixed。
- 模型、CLIP、Video/Audio VAE、LoRA 完整身份/hash。
- sampler、scheduler/sigmas/steps、Continuation Backend、Continuity、Audio Continuity。
- Spectrum enabled/mode/version/interop contract。
- persistent reference asset IDs、content hashes、角色/顺序语义。
- frozen global prompt preamble 和 Prompt Format。
- 当前 canonical head revision/take、当前 accepted logical chunks。

### 5.2 每个逻辑 Chunk

- `logicalChunkIndex`；UI 可显示“第 N 次续写”，但身份以 Chunk index 为准。
- physical group start/end/index；支持 FL2VA terminal pair。
- parent logical chunk、parent History version、parent Run revision/Take。
- 用户原始 prompt、增强版本链、最终 Chunk body、prompt hash。
- enhancer 使用的边界图/视频、额外观察参考图和分析结果引用。
- 实际 H3 persistent reference snapshot。
- seed/variation nonce、review action、Take/revision ID。
- Canonical latent asset ID 和 Run Storage record pointer。
- 生成状态：pending/review-ready/accepted/rejected/pruned。
- 输出完整视频的 History version、帧数、时长和文件。
- receipt：reused/generated 数、first regenerated chunk、resolved transport、Run Storage source、assembly trims、Spectrum interop。

### 5.3 History/Queue 不变量

- queued task 保存 immutable parent head、prompt plan、references 和生成契约；运行中的任务不随 History 新选择变化。
- History version 指向当时的完整序列 head，不只保存“最后一次 Extend 次数”。
- “继续创作”恢复该版本自己的 Run/Take/Chunk prompt，不读取当前全局 draft 的旧残留。
- 删除输出视频、删除 latent、删除 Take、删除整个 Run 是不同操作；任何删除都要检查 queued/running task 和其他 History 引用。
- 应用升级/重启后仍能从 manifest + History pointer 恢复同一 head。

## 6. 消费适配器

### 6.1 Native JointAV / upscale

- 输入为 `H3AvLatentAsset`，解析安全 output-root 路径并重新验证 payload/hash/shape/dtype/producer compatibility。
- 构造 Core H3 需要的 `NestedTensor((video,audio))`。
- Continuum-owned Chunk 可通过 hardlink alias 或扩展后的安全 loader 直接消费；不得复制一份新 payload。

### 6.2 Motion Context

- 指定 Canonical payload 文件给上游 Load Latent；或提供 app adapter 返回其要求的 plain `[video,audio]` wrapper。
- 仍然保持 source tail pixels/audio、22/24 context、Trim match_tail 和显式 clip index 语义。
- 新 Motion Context 输出注册为一个 Canonical AV asset，不再同时调用两种 saver。
- reroll 创建新资产/新引用；不能覆盖已被 History 接受的 canonical owner。若为兼容上游 slot 行为，用临时 slot，任务完成后原子注册所选 payload。

### 6.3 Continuum managed run

- 读取同一官方 Run Storage，`initial_state` 必须为空/未连接。
- workflow 使用公共 `H3ContinuumSamplerV38 -> Core Video/Audio Decode -> H3ContinuumAssembleSeamV35 -> Create/Save Video`。
- 应用增加只读 receipt/diagnostics，把 manifest-backed run/revision/chunk/take 和实际 reused/generated 事实返回 Electron；不要靠猜文件名扫描。
- Continuum Chunk 文件注册为 Canonical AV owner；应用侧 Native AV manifest 可以引用/hardlink它。

### 6.4 Legacy/bootstrap Continuum

- 旧 JointAV、旧 Motion Context 或普通 H3 输出继续使用现有 bridge/facade。
- UI/History 标记 `compatibility-bootstrap`，第一处接缝不宣称 official managed continuity。
- bootstrap 成功后可为后续新段建立 managed Run，但旧源视频不属于官方 Run Storage prefix；第一次仍可能需要一次受控 concat。
- 该路径继续 fail closed 验证 `initial_state` transport，不能污染 managed-run实现。

## 7. 实施阶段

### Phase 0：冻结基线与契约测试

- 记录当前 dirty worktree 归属，禁止覆盖既有 prompt/diagnostics 改动。
- 固定 Continuum 3.8.2、Motion Context v0.6.2 和当前 app node revision。
- 完成 1.0 要求的 source-to-contract matrix；逐项引用上游 README、实际类/函数、公开 registry、`/object_info` 和官方示例 JSON。
- 保存当前安装插件 commit、package version、公开 Node ID 列表和 API schema 快照；后续升级后必须重新生成，不能沿用旧快照。
- 对照 Continuum `README.md`、`docs/V38_RELEASE_AND_MIGRATION.md`、`run_storage.py`、V3.8 public sampler/Review/runtime/assembly 源码；对照 Motion Context `README.md`、Save/Load/Context/Trim 源码。不得只读 README 摘要。
- 为官方 managed workflow 新增静态 contract fixture：Storage On、Review、public V3.8、no initial_state、Finalize 全序列、Spectrum 可选。
- 为 legacy bridge 保留独立 contract fixture；两条路径不能共用模糊检测。

### Phase 1：Canonical latent domain 与 registry

- 新增版本化资产类型、验证器、relative path resolver、tensor content digest。
- History 从单独 `h3ContinuationData`/`h3ContextLatentPath` 逐步迁移为 canonical asset reference，同时保留旧字段读取兼容。
- `native-av-artifact` 支持“登记已存在 payload”和“创建 hardlink alias”，默认不 copy。
- 建立引用计数/反向索引和安全 GC dry-run。

### Phase 2：官方 Continuum 首段与逐段 workflow

- 新增/替换 managed production API workflow，而不是修改 legacy bridge 图冒充官方路径。
- 首段 chunks=1、Review、Run Storage On；后续 N->N+1。
- 显式 Timeline prompt、稳定 project/run identity、固定 contract。
- receipt 输出提供真实 reuse/generate/branch事实。
- managed output 跳过 `finalizeExtension` concat，直接提交 Finalize 完整视频。

### Phase 3：Sequence/Chunk/Take 数据和 History UX

- 增加 sequence/run/chunk/take 数据结构与持久化迁移。
- History 显示当前总时长、Chunk 数、当前 Take/分支和 continuation readiness。
- “继续创作”从选中 head 恢复；“重抽本段”和“从此 Take 继续”映射官方动作。
- 同 Run mutation 串行；检测 stale parent head。
- 不改变普通历史返回、删除和主操作可达性。

### Phase 4：统一生产与消费

- 普通 H3、Motion Context 和 Continuum 输出各只登记一次物理 AV payload。
- Native、Motion、Legacy Bridge、Managed Run 分别使用自己的 adapter。
- 删除 workflow 中重复 saver，但保留旧 workflow/history 读取兼容。
- 用 tensor hash 和 NTFS file identity 证明没有重复物理分配。

### Phase 5：旧历史索引与可选去重

- 扫描已有 JointAV、Motion Context、Run Storage Chunk；只读取 safetensors header/stream 区域和 manifest，不解码视频。
- 生成 inventory：valid、duplicate-tensor、legacy-unverified、missing、corrupt。
- 先把 History 绑定到 canonical asset，原文件不动。
- 提供预览/估算后再执行 hardlink 去重；失败时保留原文件。
- 不把旧资产导入为 official Run prefix；继续走 legacy bootstrap。

### Phase 6：清理策略

- 默认保留当前 canonical branch 的全部 Run Storage Chunk。
- 未选 Take 可保留 MP4 但允许删除 latent，删除后明确标记“可观看、不可继续”。
- 删除 Run 前检查所有 History、Take、queue snapshot 和 native-upscale 引用。
- Run Storage 目录按 manifest/revision 整体管理，不私自删除单个仍被上游引用的 Chunk。

## 8. 预计代码范围

执行者先从代码地图确认精确归属，预计涉及：

- `src/types.ts`：canonical asset、sequence/chunk/take、兼容字段。
- `src/core/history-*`、extension/draft/task builders：History 血缘、迁移、删除/GC。
- `electron/services/native-av-artifact.ts`：register-existing、hardlink、tensor digest、inspect。
- `electron/queue-enqueue.ts`：managed vs bootstrap 路由、immutable head/contract。
- `electron/queue-executor.ts`：receipt、完整输出提交、跳过 managed concat。
- `electron/services/extension-media.ts`：仅 bootstrap/其他模式保留 concat。
- `src/core/workflow.*`、`src/core/h3-workflow-contract.*`：新占位符和静态契约。
- `workflows/`：独立 managed first/continue API workflow；保留 legacy bridge workflow。
- `comfy_nodes/LocalVideoStudio-H3/nodes.py`：canonical adapter/receipt；不要复制上游 sampler逻辑。
- Renderer History/Create：Review/Take/branch/ready 状态和清理提示。
- `docs/WORKFLOW_CONTRACT.md`、`docs/DEPENDENCIES_AND_SETUP.md`、`CHANGELOG.md`：通过真实验收后更新当前契约和 Unreleased。

## 9. 验收矩阵

### 9.1 单元/集成/静态

- Canonical payload shape/dtype/hash、不同 safetensors metadata 下 tensor digest 一致。
- register-existing 与 hardlink 原子性、跨卷/不支持时的显式 fallback。
- History migration 保留旧 JointAV/Motion paths，不制造空第一版或旧草稿污染。
- queued task parent head 不受之后 History 选择影响。
- managed workflow：Storage On、Review、chunks、run identity、no initial_state、Finalize、Spectrum wiring。
- bootstrap workflow：initial_state 必须存在、Storage/diagnostics 边界明确。
- N->N+1 prompt append 保持前 N 个 Chunk bytes/hash。
- Take retry/selection/branch/stale-head、FL2VA physical group 原子性。
- managed output 永不调用 FFmpeg concat；bootstrap 仍按原兼容策略。
- 删除/GC 不移除被其他 History、Run、Take 或 queue 引用的 payload。

### 9.2 真实 GPU Gate（不能用静态测试代替）

先做低成本 5 秒 Draft 功能 Gate，再做用户实际 15 秒 Production Gate：

1. 首段：chunks=1、Run Storage On、Review，Spectrum On；输出可播放且 receipt 显示 `0 reused / 1 generated`。
2. 普通 Extend：1->2；必须 `1 reused / 1 generated`，无 initial_state/fresh fallback，Finalize 输出完整序列。
3. 再次 Extend：2->3；必须 `2 reused / 1 generated`。
4. 重启 ComfyUI 后继续：同 Run 正确恢复。
5. Retry Chunk 2 两次：Chunk 1 复用，得到不同 Take；选旧 Take 后 Continue From Here 生成正确 Chunk 3 分支。
6. append-only 不同 prompt：旧 Chunk hash保持，实际 report 仍复用前缀。
7. reference 不变时复用；改变 persistent reference 时必须显式失配/新 revision，不能静默 fresh。
8. Standard + Spectrum interop report 有官方 accepted actual-prefix 证据。
9. 对同一 Continuum Chunk 执行 Native JointAV 消费和 Motion Context 消费，确认无第二份物理 Tensor payload。
10. 旧 JointAV 和旧 Motion latent 分别走 bootstrap，确认兼容但不标 official managed。
11. 接缝验收：保存边界前后约 2 秒、逐帧差、光流/音频连续性和人工观看；与当前 Bridge 同 seed/settings A/B。
12. 资源清理：所有测试进程/任务停止，临时媒体清理；Run Storage 与正式 evidence 保留位置明确。

Production 成功条件：

- 用户选中的 managed 视频可完成至少 `15s -> 30s -> 45s` 两次真实续写。
- 两次都证明旧 prefix reused、新 Chunk generated，且没有 FFmpeg 拼接独立段。
- 人工观看不存在当前普遍出现的硬切/完全换人换场；不能仅凭节点完成判定。
- 每个实际生成的 AV latent 只有一份物理 payload；History/消费别名不重复占用同等字节。

### 9.3 标准仓库验证

- focused Vitest/integration/Python syntax。
- `npm.cmd run typecheck`。
- 共享 queue/history/workflow 完成后执行 `npm.cmd run verify`。
- substantial renderer 变化按 UX contract 手工检查输入焦点、版本、History 返回/继续/删除。
- 真实 GPU 结果记录 workflow、seed、模型/LoRA、尺寸、steps、Spectrum、Run receipt、媒体 hashes；不以静态成功推断质量。

## 10. 停止条件与禁止的捷径

- 如果公共 V3.8 sampler 无法通过 API workflow稳定恢复同 Run，先保留证据并报告，不回退到隐藏 initial_state 后仍称官方路径。
- 如果 append-only Prompt Plan 未实际复用前缀，停止该设计，不能通过篡改 manifest hash 强行接受。
- 如果 reference 变化导致 contract invalidation，产品必须提示或创建明确新序列，不能静默重生旧 Chunk。
- 如果 hardlink 不可用，不删除源文件；使用登记已有文件或显式 copy fallback。
- 不修改已安装上游节点源码来绕过 Run Storage 路径/metadata验证，除非形成独立、可维护且用户批准的上游补丁范围。
- 不在没有真实 GPU Gate 的情况下删除 legacy Bridge 或把 managed Continuum 切为唯一不可回退路径。

## 11. Luna 交付要求

Luna 应在同一任务内端到端实现并验证，不另建重复计划。完成时提供：

- scoped diff 与新增/迁移的数据结构说明；
- source-to-contract matrix，列出每个重要结论的 README、实际源码符号、`/object_info` 和 runtime receipt；
- 官方 managed path、legacy bootstrap、Motion、Native 四条消费路径的 workflow/代码映射；
- 旧 History 兼容和清理行为；
- 单元、integration、typecheck、verify 的实际结果；
- 真实 GPU Gate 的每次 Run receipt、reused/generated、输出媒体与接缝结论；
- 未验证组合和保留风险；
- 未经用户明确要求不 commit/push，不删除旧 latent，不修改其他任务的 dirty changes。

若实现说明出现“应该”“大概”“看起来兼容”“可能是同一接口”等无法由上述证据闭环的表达，该部分视为未完成，必须继续查源码/schema或明确标为阻塞，不能进入生产默认路径。
