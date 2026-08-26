# 长视频能力增强总计划

## 0. 计划定位

- 计划状态：Draft，当前仅完成方案和边界定义，尚未声称 Native 长视频 runtime-ready。
- 建立日期：2026-08-26。

### 0.1 目标

把 Local Video Studio 的视频续写从“单次生成一个短片段”提升为可恢复、可连续、可合并的长视频能力：

- 用户可以从现有 MP4 开始续写，也可以从本程序生成的 H3 原生 AV 数据继续续写；
- 用户在模型列表中直接选择长视频/原生续写能力，不暴露 A/B 实验概念；
- 一次加入队列可以自动完成多个 H3 片段，但内部仍按片段运行；
- 每个片段都能保存、校验和恢复，ComfyUI 重启、应用重启、取消或失败不会让已经完成的片段丢失；
- 最终媒体具有稳定的 A/V 同步、无重复上下文帧、无黑帧和可追溯的历史记录。

### 0.2 核心决策

1. 长视频是产品能力，不是单独的“无限长模型”。H3 仍按短窗口采样，长视频由多个受控 Extend 段组成。
2. 主线采用 MiniMax H3 Native Masked AV / latent continuation；当前 Motion Context 保留为已有能力，不被静默替换、不删除。
3. `MiniMaxH3AddGuide` 是 ComfyUI 的核心引导原语，不是完整产品 Extend。真正接入必须同时包含模型能力、API workflow、adapter、队列、媒体拼接、History 和运行时门禁。
4. “从 MP4 开始”与“从原生 H3 latent 开始”是两个明确的输入路径。普通 MP4 没有原始 H3 latent，允许重新编码；已有兼容 artifact 时优先避免 MP4 round trip。
5. 不把 Native Masked AV 的 mask、latent、checkpoint 等内部参数直接暴露给普通用户。用户看到的是模型列表中的能力项、目标时长和状态说明。

### 0.3 与现有计划的关系

本文件是产品和工程总计划，负责目标、优先级、父任务语义和发布门禁。具体的 H3 原生 AV 数据保存、单段 Native workflow 和 ComfyUI schema 接入，执行细节继续由：

- [`H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md`](H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md) 负责；
- [`VIDEO_EXTENSION_DESIGN.md`](VIDEO_EXTENSION_DESIGN.md) 负责既有 Extend 的裁剪、媒体和界面契约；
- [`WORKFLOW_CONTRACT.md`](WORKFLOW_CONTRACT.md) 与 [`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) 仍是实现时的上位约束。

本计划不重复定义现有 Motion Context 的 22 帧上下文规则，也不改变已有普通 H3、FL2VA、Sulphur/LTX 路径。

## 1. 当前状态和缺口

### 1.1 当前已经存在

- Create → Extend 已有单段 `ExtensionQueueTask`；
- H3 Motion Context 已能保留源视频、参考 Slot、上下文 latent 和生成后媒体；
- 现有队列、执行器、History、媒体迁移和失败恢复边界可以继续复用；
- ComfyUI 官方已经提供 H3 的 per-token video/audio mask 能力，并增加了可把图像、短视频和音频放在任意时间位置的 `MiniMaxH3AddGuide`；
- 当前项目已经区分普通 H3 core、Motion Context 节点和模型/节点依赖扫描。

### 1.2 目前不能宣称已经具备

- 当前 `h3ContextLatentPath` 不是 Native AV continuation artifact，不能直接用于 Native Masked AV；
- 当前单段 workflow 不会自动把已有 MP4 转成 H3 AV 输入，也不会自动创建 mask、保存下一段所需的原生数据；
- 当前 `ExtensionQueueTask` 没有父任务、片段索引、最后成功 checkpoint、总时长和合并阶段；
- ComfyUI 升级不会自动修改本项目已有 workflow、队列和 History；
- `MiniMaxH3AddGuide` 接受的是图像/帧/音频 guide，不是一个可以直接接收 MP4 路径并输出无限长视频的节点；
- 没有经过 A→B→C 真实链路、重启恢复和 A/V PTS 检查前，不能称为“长视频支持”。

### 1.3 要解决的用户问题

| 用户动作 | 目标结果 | 当前缺口 |
| --- | --- | --- |
| 选择一个已有视频并续写 | 从视频末尾自然继续 | 目前只支持既有单段路径，Native 输入/状态不完整 |
| 选择 30/60/120 秒 | 一次入队，自动分段完成 | 没有父任务和分段调度 |
| 中途显存不足或重启 | 从最后成功片段继续 | 没有统一的 artifact/checkpoint contract |
| 连续续写多次 | B 的原生数据可以继续生成 C | 没有可靠的 H3 joint AV 保存/读取/兼容门禁 |
| 查看结果 | 一个最终长视频，细节可追溯 | History 只有单段媒体语义 |

## 2. 能力定义

### 2.1 三层概念必须分开

| 层 | 含义 | 代表物 |
| --- | --- | --- |
| ComfyUI 核心能力 | H3 模型知道如何处理时间轴、mask 和 guide | PR #15375、PR #15439 及后续正式版本 |
| 单段 Extend workflow | 输入上下文并生成下一段 H3 AV | API-format JSON、节点 schema、workflow adapter |
| 产品级长视频能力 | 多段计划、checkpoint、拼接、History 和恢复 | Local Video Studio 的 model capability + queue/runtime |

只有三层全部通过对应门禁，模型列表才可标记为可运行。

### 2.2 用户可见能力

新增一个与现有能力并列的正式模型/能力项，建议显示为：

`MiniMax H3 · Native Masked AV Extend`

它表示一条独立 execution profile，不表示增加一份模型权重。用户可见信息只包括：

- 支持从现有视频续写；
- 支持从兼容的 H3 原生续写数据继续；
- 支持目标时长，由系统自动分段；
- 当前运行时是否满足 ComfyUI core、节点 schema、模型组件和 smoke 条件；
- 不满足条件时的明确原因。

Motion Context 继续作为已有独立能力显示。两者不是用户实验 A/B，而是输入契约和连续性策略不同的正式能力。

### 2.3 输入来源

```ts
type LongVideoInputKind =
  | "encoded-media"
  | "continuation-artifact";
```

- `encoded-media`：从 MP4/视频历史中抽取尾部帧和音频，按 H3 的 24 FPS、32 kHz 规则重新编码。这是普通现有视频的正式入口，不是偷偷退回 Motion Context。
- `continuation-artifact`：读取本程序前一段已提交且兼容的 joint video/audio latent，避免每段都经过 MP4 解码再编码。

输入决策必须在入队时冻结。执行过程中 artifact 不兼容时不能静默换成 Motion Context；可以明确失败，或在用户选择允许时重新创建一个 `encoded-media` 任务。

### 2.4 输出语义

每个片段同时产生：

1. 可播放的去重叠视频/音频片段；
2. 可供下一片段使用的 H3 continuation artifact；
3. 片段级资源和时间统计；
4. 完整性 manifest。

最终父任务产生一个合并后的 History 版本。片段文件和 artifact 属于父任务的恢复资产，不作为用户额外的最终结果版本，除非用户主动查看诊断信息。

## 3. 目标架构

### 3.1 运行时流水线

```text
选择 Native H3 能力和目标时长
  → 固定 ComfyUI/core/workflow/模型 fingerprint
  → 准备 source trim、24 FPS 帧边界和 32 kHz 音频边界
  → 片段 0：MP4 → encoded-media 或兼容 artifact
  → 构造 H3 target latent、guide/latent tail 和 per-token mask
  → 采样一个受控片段
  → 验证 latent、视频、音频、PTS 和资源
  → 原子提交 segment checkpoint
  → 片段 N+1 从最后成功 checkpoint 继续
  → 去除上下文重叠并按整数帧/PCM 边界合并
  → 提交一个最终 History 版本
```

ComfyUI 内不累计完整长视频 RGB tensor。应用负责父任务调度、片段提交和最终媒体合并；ComfyUI 负责单段扩散和其内部必要的编码/解码。

### 3.2 父任务和片段

不改变现有单段 `ExtensionQueueTask` 的执行语义，新增独立的长视频计划概念。建议的数据形状如下，最终字段名在实现前冻结：

```ts
interface LongVideoPlan {
  id: string;
  sourceVersionId: string;
  strategy: "native-masked-av";
  inputKind: "encoded-media" | "continuation-artifact";
  targetFps: 24;
  targetDurationFrames: number;
  targetAudioSampleRate: 32000;
  coreFingerprint: string;
  workflowFingerprint: string;
  lastCommittedSegment: number;
  status: "queued" | "running" | "paused" | "failed" | "completed" | "cancelled";
}

interface LongVideoSegment {
  planId: string;
  index: number;
  inputArtifactPath?: string;
  outputArtifactPath?: string;
  outputMediaPath?: string;
  generatedFrames: number;
  trimmedFrames: number;
  status: "pending" | "running" | "committed" | "failed";
}
```

关键原则：

- plan 和 segment 都是不可变执行快照；
- 只有成功校验并原子提交的 segment 才能成为下一个输入；
- 重启从 `lastCommittedSegment` 继续，不重新采样已提交片段；
- 一个父任务只产生一个最终 History 版本；
- 源视频、已提交片段和 artifact 使用 copy-first，不覆盖用户原始文件。

### 3.3 Artifact contract

沿用 [`H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md`](H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md) 中的 `NativeAvContinuationArtifact` 设计：

- joint video/audio tensor 使用明确的版本化格式；
- 只允许固定 keys、固定 shape/dtype 和安全的 task-owned 相对路径；
- 保存 manifest、producer model、VAE、workflow、core revision、geometry、hash 和生成时间；
- 写入采用临时文件 → fsync/校验 → 原子提交；
- artifact 缺失、损坏、hash 不一致或 producer 不兼容时不可直接使用；
- artifact 可用和 Native runtime ready 是两个独立状态。

普通 H3 历史没有 artifact 是正常状态；不能为老数据生成假引用，也不能把现有 Motion Context latent 当作新格式迁移。

## 4. ComfyUI 和依赖策略

### 4.1 最低核心能力

Native 长视频主线至少需要选定 ComfyUI core 同时具备：

- H3 per-token video/audio mask 支持（官方 PR #15375）；
- H3 任意时间位置 guide 支持（官方 PR #15439 的 `MiniMaxH3AddGuide`，如 workflow 采用该路径）；
- 与目标 workflow 匹配的 `/object_info` class、input、enum、shape schema；
- 可验证的 H3 video VAE、audio VAE、模型和必要的输出/媒体节点。

不能只判断语义版本，也不能对用户选择的 ComfyUI 实例盲目执行 `git pull`。应用应记录并校验实际 core revision，必要时提供备份、更新日志、重启和重新探测。

### 4.2 能力门禁

Native 长视频使用独立 capability state，不抬高普通 H3/Motion Context 的全局最低版本：

```ts
type LongVideoCapabilityState =
  | "unknown-offline"
  | "core-too-old"
  | "schema-mismatch"
  | "assets-missing"
  | "workflow-invalid"
  | "runtime-unverified"
  | "runtime-ready";
```

状态来源必须分开：

- 离线文件扫描：模型、VAE、audio VAE、workflow/custom node 文件；
- 在线 `/object_info`：节点 class 和精确 schema；
- 真实 smoke：单段、连续两段和恢复路径。

缺少新能力时，模型列表项可以展示但不可入队，并给出具体缺失原因；不能自动改用 Motion Context。

## 5. 分阶段实施路线

每个阶段先完成 focused tests 和静态检查，再交由主代理复核完整 diff。阶段性“可用”必须明确属于 catalogued、detected、runtime validated、workflow constructed、smoke passed 或 product integrated 哪一级。

### P0：冻结能力边界和证据基线

目标：在写入新状态前，确认当前代码和 ComfyUI 实际 schema。

当前调查记录见 [`H3_LONG_VIDEO_P0_EVIDENCE.md`](H3_LONG_VIDEO_P0_EVIDENCE.md)。本轮已完成当前 core、`/object_info`、现有 workflow 和时间规则审计；官方 Basic Masked Extension graph 的本地解析仍是 P0 的剩余动作。

工作项：

1. 记录当前 Extend 的 modelId、workflow、节点依赖、输入裁剪、H3 22 帧 Motion Context 和单段时长边界。
2. 对选定 ComfyUI 实例读取 core revision、`/object_info`、`/system_stats`、torch/torchaudio 和相关文件路径。
3. 导入官方 Basic Masked Extension workflow，确认 mask 的 video/audio 几何、有效 frame lengths 和节点输入。
4. 明确 AddGuide 是否用于首版 workflow；如果首版只采用 Basic Masked Extension，不为 AddGuide 额外建立伪造的“长视频节点”。
5. 固定 24 FPS、32 kHz、上下文帧裁剪、A/V PTS 和输出命名规则。

验收：形成 `docs/H3_LONG_VIDEO_P0_EVIDENCE.md`；未达到 schema/runtime 证据时，只能继续做 artifact 和静态设计，不能开放 Native 长视频模型项。

### P1：H3 continuation artifact 基础设施

目标：先让新生成的 H3 结果保存未来续写所需的原始 AV 数据，即使 Native Extend workflow 尚未完成，数据也不会丢失。

工作项：

- 实现 artifact v1 contract、shape/dtype/hash 校验和安全路径；
- 在 H3 sampler 输出到 VAE decode 之间旁路保存，不重复跑 diffusion；
- 添加保存失败的 fail-soft 状态，不影响普通 H3 视频生成；
- 将 artifact 纳入 History version、复制、迁移、删除、重启恢复；
- 完成 save → load → decode round-trip smoke；
- 不修改 `h3ContextLatentPath` 的 Motion Context 语义。

主要边界：`src/types.ts`、`src/core/` artifact helper、`electron/store.ts`、`electron/services/`、`electron/queue-executor.ts`、`electron/queue-history.ts`。

验收：普通 H3 新输出能明确显示 artifact available/not-supported/save-failed；老历史无损恢复；artifact 删除不会误删媒体。

### P2：单段 Native Masked AV Extend

目标：先做“已有视频 → 一个 Native Extend 片段”和“artifact → 一个 Native Extend 片段”，不立即做自动长视频。

工作项：

1. 建立独立的 Native H3 API-format workflow，不复用 Motion Context workflow filename 猜策略。
2. `encoded-media` 路径：读取 MP4 尾部帧和音频，转换为 H3 规定的 frame/audio 网格，生成 target latent 和 mask。
3. `continuation-artifact` 路径：严格读取前一段 artifact，校验 producer、geometry、shape 和 core compatibility。
4. 使用 `MiniMaxH3AddGuide` 时，将其当作任意时间轴 conditioning guide；不要把它误认为 latent mask 或长视频循环器。
5. 在 workflow adapter 中固定节点 ID、参数、sampler、scheduler、VAE/audio VAE、precision/offload 和输出节点。
6. 运行时缺 schema、输入不匹配或 artifact 不兼容时 fail closed。

主要边界：`workflows/`、`src/core/workflow.ts`、workflow metadata/adapter、`electron/services/comfy-ui.ts`、`electron/queue-enqueue.ts`。

验收：

- 现有有声 MP4 可以得到一段可播放的 Native Extend；
- 无声 MP4 的音频策略明确且写入快照；
- A artifact → B → B artifact round-trip 成功；
- 旧 Motion Context 回归通过；
- `/object_info` 和静态 API workflow 验证通过；
- 真实最小生成成功后，能力才可标记 runtime-ready。

### P3：父任务、自动分段和断点恢复

目标：一次入队完成多个片段，先支持 30 秒级，再扩展 60/120 秒。

工作项：

1. 新增 `LongVideoPlan` 和不可变 `LongVideoSegment`，不要让单个 `ExtensionQueueTask` 在运行中修改目标。
2. 根据目标总帧数、H3 单段窗口、上下文长度、音频边界生成确定性 segment plan。
3. 每段完成后依次执行：输出校验 → 去重叠计划 → artifact 原子提交 → segment commit → 更新父任务游标。
4. 应用退出、ComfyUI 重启、取消或显存错误后，从最后一个 committed segment 恢复。
5. 已提交片段不重复采样；重复提交要通过 idempotency key 和 manifest hash 防止产生两份事实源。
6. 只有所有 segment 完成后才进入 final merge；merge 失败可从已提交 segment 重新执行，不重新跑 diffusion。

主要边界：`src/types.ts`、`src/core/queue.ts`、`src/core/queue-task-factory.ts`、`electron/queue-enqueue.ts`、`electron/queue-executor.ts`、`electron/store.ts`。

验收：2 段短任务、30 秒任务、任务中止后重启续跑、最后一段失败重试、重复恢复和取消均通过；任何情况下源文件不被覆盖。

### P4：媒体合并、A/V 同步和资源控制

目标：把多个去重叠片段安全地合并为一个最终视频，并让长任务在真实硬件上可管理。

工作项：

- 以整数 video frame、audio latent frame、PCM sample 和 PTS 计算边界；
- 校验重复帧、缺帧、黑帧、音频 click/gap、音画漂移和 duration；
- 分离记录 diffusion、VAE/audio decode、merge、mux、cleanup 耗时；
- 不累计完整 RGB 长视频；片段和临时文件放在 task-owned 目录；
- 失败时保留最后有效 checkpoint 和日志；成功后按保留策略清理临时片段；
- 合并使用 replacement + backup + rollback，禁止破坏源媒体。

主要边界：`electron/services/extension-media.ts`、`electron/queue-executor.ts`、FFmpeg helpers、History path/migration。

验收：有声、无声、不同目标时长、首段来自 MP4、后续来自 artifact 的组合都能得到可播放结果；PTS、frame count、audio sample count 和目标时长在容差内一致。

### P5：模型列表、队列、History 和设置完整接入

目标：把能力作为正式产品路径交付，不让用户接触实验性 A/B 语义。

工作项：

1. Catalog 增加 Native H3 长视频 capability、输入模式、依赖、推荐 core revision、workflow provenance 和限制。
2. Create 的可用性由 capability state 驱动；缺依赖、core 过旧、schema 不匹配和未 smoke 分别展示。
3. Queue snapshot 保存 strategy、input kind、target duration、FPS、audio policy、segment plan、core/workflow fingerprint。
4. Queue UI 区分总体进度、当前片段、合并和清理阶段；不把“ComfyUI 长时间没有 node transition”直接当成失败。
5. History 只显示一个最终父任务结果，同时保留片段和 artifact 的诊断/恢复信息。
6. History → Continue 必须绑定明确的 `AssetVersion`；只有末尾 artifact 完整且兼容时才允许 direct continuation，否则提供明确的 encoded-media 路径。
7. 设置页显示 ComfyUI core、节点 schema、模型组件、artifact 状态和最后 smoke evidence。

主要边界：`src/core/catalog/`、`src/core/workflow.ts`、`src/types.ts`、`src/renderer/pages/create/`、`src/renderer/pages/history/`、`src/renderer/pages/settings/`、preload/IPC。

验收：新模型项可以被选择、入队、观察进度、取消、重启恢复、查看 History 和继续创作；旧任务、旧历史和 Motion Context 行为不变。

### P6：正式长视频发布门禁

目标：只有证据足够时才把能力从 runtime-unverified 提升为 product integrated。

最小真实矩阵：

1. 普通 H3 生成 → artifact 保存 → History 展示 → 删除/迁移/重启；
2. 旧有声 MP4 → 单段 Native Extend；
3. 旧无声 MP4 → 明确音频策略 → 单段 Native Extend；
4. A artifact → B → B artifact → C；
5. 2 段自动计划；
6. 30 秒级自动长视频；
7. 60 秒级任务的资源、磁盘和恢复检查；
8. 中途取消、ComfyUI 重启、应用重启、OOM、重复恢复和最终 merge 失败；
9. Motion Context、普通 H3、FL2VA 和现有历史回归。

必须记录：core commit、Python/torch/torchaudio、模型/VAE、workflow revision、尺寸、FPS、音频采样率、frames、steps、seed、VRAM/RAM、每段耗时、merge/mux 耗时、artifact/hash、PTS 和失败阶段。

## 6. 资源和用户体验策略

### 6.1 目标时长不是一次 sampler 的 frame count

用户选择的目标时长先转换为固定 FPS 下的总帧数，再由 segment planner 生成片段。禁止把 60/120 秒直接写进一个单段 H3 sampler 的 frame 输入。

### 6.2 进度显示

UI 至少区分：

- 总体计划进度：已提交片段帧数 / 目标帧数；
- 当前片段：准备、采样、解码、校验、提交；
- 最终阶段：合并、封装、清理。

ETA 必须分离扩散采样、VAE/audio、合并和清理，不能把单段时间线性套到全部任务而不标注不确定性。

### 6.3 取消和失败

- 取消只停止当前未提交片段，不删除已提交 checkpoint；
- OOM、节点 schema 错误和 artifact 校验错误要有不同提示；
- 用户可以从最后成功片段继续或重新选择 encoded-media；
- 源视频和已完成结果始终保留；
- 自动清理只删除已确认不再需要且有 manifest 的临时文件。

## 7. 风险和停止条件

### 7.1 必须 fail closed 的情况

- core 没有 mask 能力或 schema 不匹配；
- workflow 只是 UI 画布 JSON，无法构造合法 `/prompt`；
- artifact shape、hash、producer 或时间网格不匹配；
- A→B→C 的 latent/媒体连续性尚未验证；
- 输出的 A/V PTS、重复帧或音频 gap 不满足验收；
- 资源占用让桌面或 ComfyUI 不可用；
- 只能通过隐式切换 Motion Context 才能完成任务。

### 7.2 暂不纳入首版

- 一次扩散直接生成任意时长；
- 自动引入社区 Extender/Continuum 数据库或替换现有任务系统；
- 在没有真实质量/资源对照的情况下默认叠加 Spectrum、Turbo、缓存 patch 或其他加速；
- 为兼容旧记录而批量重编码或批量生成 artifact；
- 把片段内部参数做成复杂的用户 A/B 面板。

## 8. 实施约束和文件所有权

每个阶段开始前必须重新检查 `git status --short`，并声明 preserve list。以下热点文件不允许多个工作包并行修改：

- `src/types.ts`、`electron/store.ts`、`src/core/workflow.ts`；
- `electron/main.ts`、`electron/services/comfy-ui.ts`；
- `src/renderer/pages/create/` 的共享 controller/view-model；
- `electron/queue-executor.ts`、`electron/queue-enqueue.ts`。

实现顺序应优先完成纯领域类型、artifact helper、timeline/mask 纯函数和静态 workflow，再进入队列/IPC，最后进入 renderer。每完成一个能力包都要保留旧 Motion Context 和普通 H3 的回归证据。

## 9. 完成定义

“模型列表里出现 Native H3”只能说明 catalogued，不能说明已完成。长视频能力只有同时满足以下条件才算 product integrated：

- 依赖可以离线识别，在线 schema 可以验证；
- workflow 是合法 API-format graph，adapter 使用精确节点 schema；
- 已有 MP4 和兼容 artifact 两种输入路径都可执行；
- 单段、连续两段和 30 秒级父任务真实 smoke 通过；
- 片段 checkpoint、重启恢复、取消、失败重试和 merge 语义稳定；
- A/V PTS、重复帧、音频 gap、输出路径和 History 状态一致；
- 旧任务、旧历史、普通 H3 和 Motion Context 无回归；
- 设置、Create、Queue、History 都展示真实能力状态；
- 报告明确区分静态通过、`/object_info` 通过和真实运行通过。

## 10. 参考资料

### 项目内部

- [`H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md`](H3_NATIVE_MASKED_AV_LONG_VIDEO_PLAN.md)
- [`VIDEO_EXTENSION_DESIGN.md`](VIDEO_EXTENSION_DESIGN.md)
- [`WORKFLOW_CONTRACT.md`](WORKFLOW_CONTRACT.md)
- [`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md)
- [`AGENT_START_HERE.md`](AGENT_START_HERE.md)

### 官方和社区

- [ComfyUI H3 per-token video/audio mask PR #15375](https://github.com/Comfy-Org/ComfyUI/pull/15375)
- [ComfyUI MiniMaxH3AddGuide PR #15439](https://github.com/Comfy-Org/ComfyUI/pull/15439)
- [MiniMaxH3AddGuide 官方嵌入文档](https://github.com/Comfy-Org/embedded-docs/blob/main/comfyui_embedded_docs/docs/MiniMaxH3AddGuide/zh.md)
- [ComfyUI 官方 MiniMax H3 教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)
- [MiniMax 官方 H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)
