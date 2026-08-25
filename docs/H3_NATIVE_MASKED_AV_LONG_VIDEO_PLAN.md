# MiniMax H3 Native Masked AV Extend 与长视频接入计划

## 0. 计划状态、目标和首发边界

- 修订日期：2026-08-24。
- 当前状态：已按当前仓库实现重新规划；Native Masked AV 尚未实现，也没有本机 `/object_info` 或真实生成证据。
- 当前应用：`0.43.3`，`AppState.schemaVersion = 13`。
- 当前开发机：RTX 4090 24 GB、NVIDIA Driver 610.88、Node 24.16.0、npm 10.2.4；本次检查 `127.0.0.1:8188` 时 ComfyUI 未响应。
- 目标读者：可以执行明确、小范围任务的 Luna 级实现代理。每个工作包必须重新读取目标文件，不得用旧补丁覆盖当前 dirty worktree。

### 0.1 用户目标

在 Create → Extend 模式的模型下拉框中，新增与现有方式并列的正式选项：

```text
MiniMax H3 · Native Masked AV
```

Extend 中继续保留并可选择：

1. MiniMax H3 FL2VA 边界帧接续；
2. MiniMax H3 R2V Motion Context；
3. MiniMax H3 Native Masked AV；
4. 已有 Sulphur/LTX Extend 路径。

实施顺序先于 Native Extend 本身建立 H3 AV continuation artifact：现有 H3 生成完成时就保存 joint video/audio latent，并让 History 能展示、迁移、删除和校验它。这样 Native Masked AV 执行接入即使延期，新生成的 H3 历史仍保留未来直接续写所需的最佳原始数据。

随后交付“一次 Native Extend、一个续写片段、一个合并输出、保存下一次续写数据”。自动循环到 30/60/120 秒的父任务是最后阶段，不能阻塞单段 Extend。

### 0.2 Preserve list

- Motion Context 继续使用 R2V、22 video context frames、24 audio context length、参考 Slot 和现有 latent 优化。
- FL2VA 边界帧、Sulphur/LTX、Q3 GGUF“不支持续写”的现有行为不被暗改。
- 老 Queue、老 History、只有 MP4 的记录继续可读、播放、删除和再次 Extend。
- 选 Native Masked AV 后，从 MP4 重编码仍属于 Native Masked AV；不得静默改成 Motion Context。
- 草稿与已入队任务隔离；复制、重试、恢复不得复用另一 task id 的输出路径。
- 保持单一重 GPU 阶段、模型级 runtime policy 隔离、ComfyUI 离线时仍可扫描文件。

### 0.3 首版不做

- 不嵌入 Continuum、Extender、MultiRef 的项目数据库或 UI。
- 不做 bridge/inpaint、中间片段补洞、master-song timeline 或任意整片重绘。
- 不把 Native Masked AV 宣传成一次扩散的无限长视频。
- 不默认承诺 Turbo、Spectrum、SageAttention、INT4 或 Q3 GGUF 组合；逐项通过独立 gate 后再开放。

## 1. 已核实的技术事实

### 1.1 Native Masked AV 是执行能力，不是新权重

它使用 H3 Base/FL2VA 的 joint AV latent，给 video/audio token 分别应用 noise mask：`0` 保护已知内容，`1` 生成未来内容。

ComfyUI [PR #15375](https://github.com/Comfy-Org/ComfyUI/pull/15375) 于 2026-08-18 合并，merge commit `ff6c8a8`。它增加 H3 video/audio per-token mask：video mask 对齐 2×2 latent patch grid，audio mask 对齐完整 audio-latent frame，并约以 0.5 二值化。官方 [MiniMax H3 教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3) 已把它列为 clip extension 的高级工作流。

ComfyUI [PR #15439](https://github.com/Comfy-Org/ComfyUI/pull/15439) 增加 `MiniMaxH3AddGuide`，可把 still/clip/audio/带声音 clip 放在任意 `frame_idx`。AddGuide 是 conditioning guide，noise mask 是 joint target latent 的 preserve/regenerate 规则；二者不同。首版先做官方 Basic Masked Extension 基线，不默认叠加 Motion Context、Spectrum 或 AddGuide。

### 1.2 H3 AV 几何

ComfyUI 核心中的 H3 joint latent 是 `NestedTensor((video, audio))`：

- video：`[B, 24, T, H/16, W/16]`，DiT 前再做 1×2×2 patchify；画布按 32 像素网格；
- audio：`[B, 32, 2, T40]`，32 kHz stereo，40 latent steps/s；
- 视频是 24 FPS，帧数使用 `17k + 5` 网格；
- video/audio 必须由整数 helper 换算，不能逐段用浮点秒数 round；
- 39 frames = 1.625 s = 65 audio latent steps；90/141/192 frames 也自然对齐；
- 39 帧只是首个待验证候选，不是已证明的官方默认 overlap。

官方模型卡仍以 4–15 秒为训练/产品窗口。长视频只能通过多次 Extend 与拼接实现，不能把单次 sampler 拉出训练范围后称“原生长视频”。

### 1.3 运行时最低线

- 仓库当前普通 H3 使用 ComfyUI minimum `0.31.0`、recommended `0.33.1`。
- `0.33.1` 发布早于 PR #15375，不能证明 Native Masked AV 可用。
- Native feature gate 必须满足：core revision 包含 `ff6c8a8` 或后续明确包含它的 release；源码/能力探针匹配；`/object_info` 精确 schema 匹配；本项目最小真实任务成功。
- 基础路径不要求第三方 custom node、KJNodes、SageAttention 或 Spectrum。若 API graph 缺少公开的 joint AV 组装/保存节点，再单独评估薄 helper node。
- 选定 ComfyUI Python 的 `torch`/`torchaudio` 必须是该实例实际使用且互相兼容的版本。

### 1.4 模型文件

第一条真实基线只支持现有 FL2VA INT8 catalog 资产：

- `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors`；
- `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`；
- `vae/minimax_h3_video_vae_fp16.safetensors`；
- `vae/minimax_h3_audio_vae_fp32.safetensors`。

单一事实源继续是 `src/core/catalog/models/minimax_h3_shared.ts`。新选项复用组件定义，不复制下载 URL、pattern 或扫描规则。Ref2VA 不是默认依赖；INT4、Turbo、Q3 GGUF 必须分别 smoke 后才加入支持矩阵。21 GB INT8 权重大小也不等于 VRAM 门槛。

## 2. 当前仓库实际边界

### 2.1 Extend 目前由 modelId 隐式决定方法

- `src/core/catalog/types.ts` 只有 `supportsVideoExtension?: boolean`。
- `src/renderer/pages/create/helpers.ts` 的 `modelSupportsCreateInputMode` / `createModelOptionViewModels` 生成选项。
- `src/renderer/pages/create/page-controller.ts` 管默认和切换；`defaultExtensionModel` 当前为 `minimax_h3_ref2va`。
- `electron/main.ts::bundledWorkflowFor` 按 modelId 选择 FL2VA boundary 或 R2V Motion Context。
- `src/core/workflow.ts`、`electron/queue-enqueue.ts`、`electron/services/comfy-ui.ts`、`electron/services/extension-media.ts` 用 FL2VA/R2V predicate 决定执行语义。

因此只加 catalog entry 会被误判成 boundary 或 R2V。必须先增加显式 Extend 策略。

### 2.2 Motion Context latent 不能冒充 Native AV artifact

`Draft`、`ExtensionQueueTask`、`AssetVersion`、`HistoryAsset` 已有：

```ts
h3ContextLatentPath?: string
h3ContextSavePrefix?: string
h3ContextSavedPath?: string
```

这些字段绑定 `MiniMaxH3MotionContextLoadLatent/SaveLatent`，只是 Motion Context 可选快速路径：文件兼容且使用源尾时复用，否则从像素重建。它没有 schema、模型/VAE 身份、AV shape、时间网格、hash 或完整性。不得改变其语义，也不得据此推断 Native AV ready。

### 2.3 当前文件生命周期没有 sidecar 概念

- `electron/services/video-history-migration.ts` 只迁移视频 `HistoryFile`。
- History 删除/版本删除不知道 latent/manifest。
- History path fallback、输出目录迁移、复制/重试没有 Native artifact 所有权。
- `duplicateQueueTask` 机械复制保存路径会导致 task-id 路径碰撞。
- persisted `running` Extension 缺少明确的 restart→waiting/resumable 测试。

所以 artifact 生命周期必须先于 UI 完成，不能只加裸 `latentPath`。

## 3. 产品和领域模型决策

### 3.1 显式 Extend 策略

```ts
export type ExtensionStrategy =
  | "boundary-frame"
  | "motion-context"
  | "native-masked-av"
  | "ltx-native-overlap";
```

- 新 `ExtensionQueueTask.extensionStrategy` 必填，是不可变 queue snapshot。
- `HistoryAsset` / `AssetVersion` 先可选，load migration 后归一化。
- `Draft.extensionStrategy?` 保存 Extend workspace；由选项映射，不靠 workflow filename 猜。
- execution/finalization/safety 优先分派 strategy；modelId 只选择底层 asset variant。

### 3.2 用户可见选项 ID

为兼容当前下拉框和 `defaultExtensionModel`，首版采用稳定 profile ID：

```text
minimax_h3_native_masked_av
```

它是 Extend execution profile，不是第二份权重：

- definition 复用 `minimax_h3_shared.ts` 的 FL2VA INT8 components；
- 声明 `extensionStrategy: "native-masked-av"` 与 `supportsVideoExtension: true`；
- execution asset resolver 映射到 FL2VA INT8，但 History 保留 profile ID；
- 不把 profile ID 传给只接受 checkpoint ID 的 LoRA/asset helper；
- 不自动把用户默认从 Motion Context 改成 Native AV。

若实现中确认复合 `extensionOptionId` 比 alias profile 更少侵入，可在 P1-A 调整，但必须在 P1 结束前冻结，后续不能继续混用两种身份方案。

### 3.3 Native AV 输入来源

```ts
export type NativeAvInputKind = "encoded-media" | "continuation-artifact";
```

- `encoded-media`：旧/新视频尾部经 Video/Audio VAE 编码。它是 Native Masked AV 兼容入口，不是 Motion Context fallback。
- `continuation-artifact`：读取上一条兼容 H3 结果保存的 joint AV 数据，避免 MP4 round trip。
- 入队时固定 `nativeAvInputKind`。执行中若 direct artifact 消失，应失败并要求重新入队；不得静默改道。

### 3.4 兼容矩阵

| 来源 | Motion Context | Native Masked AV |
| --- | --- | --- |
| 老 MP4，无 latent | 保持像素入口 | `encoded-media` |
| 老 MC，有 `h3ContextLatentPath` | 兼容时复用，否则像素入口 | 忽略 MC latent，`encoded-media` |
| 新 Native，artifact 完整且使用版本末尾 | 按 MC 自己规则 | `continuation-artifact` |
| 新 Native，artifact 缺失/损坏/不兼容 | 按 MC 自己规则 | 入队前明确选 `encoded-media` 并记录原因 |
| 源 trim 到非末尾 | 不复用 MC latent | 不复用 artifact，`encoded-media` |
| Q3 GGUF 输出 | 保持当前支持矩阵 | 首版可用 FL2VA INT8 对 MP4 重编码；不得称 Q3 latent direct |

## 4. Native AV continuation artifact

### 4.1 Stock SaveLatent 不可用

H3 输出是 video/audio `NestedTensor`。当前 ComfyUI stock `SaveLatent/LoadLatent` 只 round-trip 单个 `samples["samples"]` tensor，不能作为 H3 AV 契约。必须提供经过测试的 joint serializer；否则只开放 `encoded-media`，artifact fast path 保持 disabled。

### 4.2 State 只保存引用，二进制放 task-owned 目录

```ts
export type H3ContinuationDataStatus =
  | "available"
  | "not-supported"
  | "save-failed"
  | "missing"
  | "invalid";

export interface NativeAvContinuationData {
  status: H3ContinuationDataStatus;
  reason?: string;
  artifact?: NativeAvContinuationArtifact;
}

export interface NativeAvContinuationArtifact {
  schemaVersion: 1;
  manifest: HistoryFile;
  payload: HistoryFile;
  payloadSha256: string;
  payloadBytes: number;
  modelFamily: "minimax-h3";
  executionModelId: "minimax_h3_fl2va";
  diffusionModelFilename: string;
  textEncoderFilename: string;
  videoVaeFilename: string;
  audioVaeFilename: string;
  width: number;
  height: number;
  fps: 24;
  frameCount: number;
  videoShape: number[];
  videoDtype: string;
  audioSampleRate: 32000;
  audioChannels: 2;
  audioLatentRate: 40;
  audioShape: number[];
  audioDtype: string;
  contextFrames: number;
  workflowRevision: string;
  sourceTaskId: string;
  sourceVersionId?: string;
  createdAt: string;
}
```

- payload 建议为 safetensors，固定 keys `video` / `audio`，CPU contiguous，禁止 pickle。
- 放在 `<output>/continuation/minimax-h3/<task-id>/`；manifest 内使用相对 artifact 路径。
- v1 先保存完整 sampler output。只有“精确 tail 提取 + A→B→C”真实测试通过后，才改为较小的 tail capsule。
- noise mask 按 manifest 策略确定性重建，不保存为权威 tensor。
- 对能输出标准 H3 joint AV latent 的新 H3 generation，默认尝试保存 artifact；具体模型是否能被未来 Native Extend 直接消费，由 manifest compatibility gate 决定。
- artifact 是未来直接续写的原始素材，但文件存在不等于当前 runtime 已支持 Native Extend。History 必须分别显示“续写数据状态”和“当前直接续写能力”。
- MP4 仍是 durable media；artifact 保存失败或损坏不能让 generation 失败，也不能让 History 无法播放。

### 4.3 原子提交

1. helper 写 task-owned `.partial` payload。
2. Electron 校验 safetensors keys、size、shape、dtype、几何、时间网格。
3. 计算 SHA-256，写临时 manifest。
4. payload rename 到最终名；manifest 最后 rename，manifest 存在代表 committed。
5. `persistVideoHistoryResult` 在同一次 store update 中写引用。
6. 失败保留 MP4、删除 partial、记录 artifact unavailable，不伪造 committed。

恢复只接受 manifest + payload + hash 全匹配。孤立 partial 可清；孤立 committed payload 先记录日志，不自动删除。

### 4.4 生命周期规则

- Duplicate：可保留只读输入 artifact；清空输出 artifact、prompt/save target，分配新 task目录。
- Reset/retry：只复用 committed 输入；输出用新 temporary，不能覆盖上次成功数据。
- Cancel：不删上游输入；清当前 partial；artifact 失败不删除已完成媒体。
- Delete：媒体、manifest、payload 纳入一个删除计划；先解析受管目录，共享引用不误删，再更新 store。
- Output migration：扩展迁移 reference union，copy→size/hash verify→state commit→cleanup old source；同步 queue input refs。
- Path fallback：absolutePath 后尝试 current/old output root + subfolder；解析结果必须位于已知 root。
- History→Extend：以明确 `AssetVersion` 为真源；只有使用版本末尾且 artifact 校验通过才 direct。

## 5. 工作流和媒体策略

### 5.1 两个新 API graph

不修改 `minimax_h3_r2v_extend_api.json`，新增：

- `workflows/minimax_h3_native_masked_av_existing_video_api.json`；
- `workflows/minimax_h3_native_masked_av_continue_api.json`。

Existing Video：

```text
24 FPS / 32-grid normalization
 → 取末尾合法 context
 → Video VAE + Audio VAE encode
 → joint target latent
 → known prefix mask=0 / future mask=1
 → 标准 H3 20-step sampler
 → 保存 continuation artifact
 → decode 新片段
```

Continue：

```text
load + validate joint artifact
 → artifact tail 作为 known prefix
 → 重建 video/audio mask
 → H3 sampler
 → 保存新 artifact
 → decode 新片段
```

正确性基线用官方标准 20 steps、PyTorch 或当前普通 H3 已验证的安全 profile。Turbo/Spectrum/Sage 后置。

### 5.2 纯 timeline helper

新增如 `src/core/h3-native-av-timeline.ts`：

- `17k+5` frame snap；
- 24 FPS→40 Hz audio latent steps；
- context候选与源时长选择；
- mask prefix lengths；
- decoded suffix frame/sample trim；
- 最终 duration/PTS。

默认先验证 39 frames；失败时根据证据修改 Native profile，不能改 Motion Context 22/24。

### 5.3 最终媒体

- Electron `extension-media.ts` 管最终输出；不在 ComfyUI 内累计长 RGB tensor。
- 保留 source trim，generated clip 去隐藏 context 后 append。
- Native AV 输出固定 24 FPS、32 kHz stereo；有/无源音频策略写入 queue snapshot。
- FFmpeg 参数来自整数 frame/PCM sample边界；检查 A/V PTS、重复帧、黑帧、click/gap。
- 继续使用 replacement + backup + rollback 替换模式。

## 6. 环境与可用性状态

新增 feature-level 状态，不复用普通 `h3CoreSupported`：

```ts
type NativeAvCapabilityState =
  | "unknown-offline"
  | "core-too-old"
  | "schema-mismatch"
  | "assets-missing"
  | "runtime-unverified"
  | "runtime-ready";
```

探针分别记录 core version/revision、是否包含 `ff6c8a8`、精确 class/input schema、torch/torchaudio、四个模型组件、helper node（若需）、最后 smoke evidence。Settings 区分离线待验证、core过旧、schema不匹配、资产缺失、runtime未实跑、runtime ready。

不要全局抬高普通 H3 recommended core。普通 H3/Motion Context 保留现有线；Native profile 独立 gate。

## 7. 分阶段实施计划

每个包只允许一个 owner 修改所列 hotspot。包内 focused tests 后交回主代理；主代理复核完整 diff，阶段末运行 `npm.cmd run verify`。新的优先级是：先保存和管理未来可用的 H3 AV 数据，再接 Native Masked AV 执行。

### P0：H3 AV artifact 基础设施与 History 管理

P0 不依赖 Native mask core `ff6c8a8`。它只要求当前已能正常生成 H3，并能在 VAE decode 前取得 H3 joint AV sampler output。P0 完成后，即使 Native Extend 延期，新 H3 历史也会积累版本化 continuation data。

#### P0-A artifact contract 与 schema 14

- Owner：`src/types.ts`、新 `src/core/h3-continuation-artifact.ts`、`electron/store.ts`。
- 冻结 `NativeAvContinuationArtifact` v1、artifact status、per-version引用、兼容性 fingerprint 与安全相对路径。
- `AppState.schemaVersion` 13→14；老 History 没有 artifact 是正常状态，不生成假引用。
- `HistoryAsset` 顶层只保留必要兼容字段；新 artifact 以明确 `AssetVersion` 为真源。
- Tests：`store.test.ts`、新增 `h3-continuation-artifact.test.ts` 和 schema13 fixture。
- Done：旧状态无损 load→save；artifact metadata 可持久化；不触碰现有 Motion Context latent 语义。

#### P0-B joint AV serializer 与真实 round-trip

- 从现有 H3 generation graph 的 decode 前取得 `NestedTensor((video,audio))`。
- 优先实现应用维护的薄 serializer/helper：只接受两个 tensor，只写 task-owned目录，safetensors keys固定为 `video` / `audio`，禁止 pickle和任意路径。
- 新 `electron/services/native-av-artifact.ts` 完成 safe path、shape/dtype/header校验、SHA-256、atomic commit、partial cleanup。
- 用现有普通 H3 最小生成保存一次，再 load 后分别 decode video/audio；输出应和保存前 decode 在允许误差内一致。此 gate 不要求 mask extension。
- Tests：新增 `native-av-artifact.test.ts`，覆盖截断、错误key/shape/hash、路径越界、partial、重复commit。
- Done：至少一个当前已支持 H3 workflow 的 joint AV save→load→decode 真实 smoke 成功；否则 P0-C 不得默认开启保存。

#### P0-C 所有可识别 H3 generation 默认尝试保存

- Owner：H3 workflow adapter、`electron/services/comfy-ui.ts`、`electron/queue-executor.ts`、`electron/queue-history.ts`。
- 对输出标准 H3 joint AV latent 的 generation，在 decode 同一份 sampler output 时旁路保存 artifact，不为保存额外重跑 diffusion。
- 初始矩阵至少覆盖当前真实 smoke 通过的 FL2VA INT8；随后分别验证 R2V、INT4、Turbo、Q3。能识别但未验证的变体可以显示 `not-supported`，不得伪造 available。
- 保存失败采用 fail-soft：视频 generation 仍成功，History 写 `save-failed`/reason；日志保留具体阶段。
- artifact 记录精确 producer model、VAE、workflow和shape。保存了文件不等于当前 Native Extend 已支持该 producer。
- Tests：workflow、comfy UI、queue-executor、queue-history focused tests。
- Done：新 H3 History version 的 artifact 状态总是明确为 available、not-supported 或 save-failed；不存在“字段缺失但UI猜测”。

#### P0-D History 详情、删除、迁移、恢复

- Owner：History detail page/actions、History path/delete helpers、`electron/services/video-history-migration.ts`、`src/core/queue.ts`、recovery。
- 视频详情页新增“原生 AV 续写数据”区，显示：状态、格式版本、video/audio shape、大小、创建时间、producer model/workflow、完整性，以及“当前运行时能否直接续写”。
- artifact available 与 Native runtime ready 使用两枚独立状态；前者不能冒充后者。
- 删除/版本删除把 manifest+payload纳入计划；共享引用不误删。输出目录迁移采用 copy→size/hash verify→commit→cleanup，并同步queue/history引用。
- duplicate 清 task-owned输出引用；restart只认 committed manifest；老 MC latent不纳入新artifact清理。
- Tests：History page/action、`history-delete.test.ts`、`video-history-migration.test.ts`、`queue.test.ts`、recovery tests；按 UX contract 检查两个 viewport。
- Done：详情页可验证看到新数据；播放不依赖artifact；delete/migrate/restart后媒体和artifact状态一致。

### P1：Native Extend 身份、策略与运行能力 gate

#### P1-A Extend strategy 和 profile

- Owner：`src/core/catalog/types.ts`、H3 shared/new definition/index、`src/core/workflow.ts`、`src/core/queue.ts`。
- 加 strategy、Native profile ID、execution asset resolver；FL2VA predicate不得再等价于 boundary strategy。
- 旧记录集中推断：R2V→motion-context、FL2VA video→boundary-frame、Sulphur→ltx-native-overlap；绝不由 `h3ContextLatentPath` 推断 Native。
- running Extension明确恢复为 waiting/resumable；duplicate清新的task-owned输出。
- Tests：`model-catalog.test.ts`、`create-model-options.test.ts`、`workflow.test.ts`、`queue.test.ts`、`creation-drafts.test.ts`。
- Done：四种 Extend策略可表达，组件事实不重复，旧默认不改变。

#### P1-B 真实 Native mask schema（只读 gate）

- 读官方 BasicMaskedExtension workflow、选定 core 的 `nodes_minimax_h3.py` / `model_base.py`。
- 记录 `/system_stats`、`/object_info`、core revision、torch/torchaudio和精确class/input/enum/shape。
- 产物：`docs/H3_NATIVE_MASKED_AV_P1_EVIDENCE.md`。
- Stop：core不含 `ff6c8a8` 或graph无法表达。P0保存/History能力继续可交付，但P2及后续Native执行暂停。

#### P1-C feature-level environment state

- Owner：`comfy-compatibility.ts`、`environment.ts`、Settings selectors/types/scanner。
- revision + exact schema检查，不只看semantic version；与普通 `h3CoreSupported` 分离。
- Tests：`comfy-compatibility.test.ts`、`environment.test.ts`、`dependency-scanner.test.ts`、`settings-selectors.test.ts`。
- Done：offline、artifact available、core old、schema mismatch、runtime unverified/ready均能独立表达。

### P2：Native Masked AV workflow adapter

#### P2-A timeline + Existing Video graph

- 加 `h3-native-av-timeline.ts`、existing-video API JSON、workflow metadata。
- 从旧/新MP4建立24 FPS/32 kHz joint context；创建video/audio mask。
- Tests：新 timeline tests；扩 workflow/baseline/metadata tests。
- Done：5/22/39/90边界、24→40Hz、mask shape/value、缺节点错误有测试；JSON纯 `/prompt`。

#### P2-B continuation-artifact graph

- 新 continue API JSON 从P0 committed artifact load并严格校验producer/shape/geometry。
- artifact不兼容时在queue-time选择encoded-media；已入队direct任务运行时不能静默改道。
- 用标准20-step完成A→B与B→C真实smoke，验证新的输出artifact仍可被下一次读取。
- Gate：A→B→C未通过，History仍保存artifact，但Native profile不得标runtime-ready。

### P3：单段 Native Extend 执行

#### P3-A enqueue + submit

- Owner：`queue-task-factory.ts`、`queue-enqueue.ts`、`electron/main.ts::bundledWorkflowFor`、`comfy-ui.ts`。
- queue-time固定encoded/artifact input；submit按strategy adapter。
- 缺capability阻止入队并给exact reason；不切Motion Context。
- Tests：factory/enqueue/comfy UI，覆盖旧History、valid/corrupt artifact、trim非末尾。

#### P3-B media + History

- Owner：`extension-media.ts`、`queue-executor.ts`、`queue-history.ts`。
- 独立24 FPS/32kHz trim/mux；先验证最终视频，再提交新artifact和History。
- 记录requested strategy、actual input kind、artifact状态与fallback reason。
- Tests：extension-media、queue-executor、queue-history。
- Done：有声、无声、旧MP4、direct artifact；取消/失败保留源和最后committed成果。

### P4：Extend UI 与完整产品路径

#### P4-A Create/Extend

- Owner：Create helpers/page-controller/view-model/video-extension-controller、`src/main.ts`。
- 新模型与Motion Context并列；切策略只清私有草稿数据；尊重旧默认。
- 显示“从媒体重编码”或“使用已保存原生AV数据”，不暴露mask tensor参数。
- 回归：typing/focus、clear、undo/redo（存在处）、mode/model switch、queue submit。

#### P4-B History direct action

- Continue action绑定明确version。
- 详情页在P0状态区基础上增加“可直接Native续写”行动；不兼容时仍允许从视频重编码。
- Tests：Create controller/view-model、History action/page。
- Done：用户可明确选择Motion Context或Native；旧History标签和操作不变。

### P5：单段正式验证与发布门禁

在目标RTX 4090机完成：

1. 普通H3 generation保存→详情展示→迁移→删除；
2. 老有声MP4→encoded-media；
3. 老无声MP4→明确音频策略；
4. H3 A artifact→A→B；
5. B artifact→B→C；
6. artifact缺失/损坏→重新入队明确encoded；
7. trim非末尾不direct；
8. app/ComfyUI restart、cancel、retry、duplicate、delete、output migration；
9. Motion Context回归；只验证功能，不宣称质量优胜。

记录core commit、torch/torchaudio、资产、workflow revision、分辨率、frames、steps、seed、VRAM/RAM、阶段耗时、artifact大小、video frames、audio samples、PTS、fallback。运行 `npm.cmd run verify`。只有真实输出和恢复路径通过，Native profile才`runtime-ready`。

### P6：自动多段长视频（P5 后独立增量）

不改变单段 `ExtensionQueueTask` 语义。新增parent plan + immutable segments，可参考SeedVR2 segmented checkpoint，但不混用类型。

- parent：目标总时长、revision、lastCommittedSegment、最终输出；
- segment：输入前一committed artifact，输出新artifact + append clip；
- restart从最后成功段继续，不重采样已完成段；
- 一个父任务/一个最终History；segment只用于诊断和恢复；
- 逐段decode/append，禁止累计完整RGB tensor；
- 先验收≥30秒，再评估60/120秒，不写“无限长”。

拆为P6-A types/planner、P6-B executor/recovery、P6-C Queue/History UI、P6-D 30秒smoke。

## 8. Luna 执行规则

每次只领取一个 `P?-?` 包，开工前输出：

1. `git status --short`；
2. 本包允许修改文件；
3. preserve list；
4. 前置 gate 是否满足；
5. focused tests。

交付包含：

- `git diff --name-status` 和完整 diff 复核结论；
- 修改文件/符号；
- focused tests 与 `npm.cmd run typecheck`；阶段末由主代理跑 `npm.cmd run verify`；
- 静态、`/object_info`、真实 smoke 分别报告；
- 未验证组合和停止条件；
- 目标文件若在包开始后变化，立即停止并重新对齐；
- 主代理负责公共 hotspot、最终整合、完整验证和版本判断。

## 9. 风险、失败策略和版本

- Core：revision + exact schema + smoke；不能只写“0.33.1+”。
- Artifact：stock SaveLatent不支持 joint AV；round-trip失败时只开放 encoded-media。
- Tail：H3 temporal latent有首token/周期相位；未经A→B→C不得任意裁 tail。
- 磁盘：P0记录真实artifact大小，P6后再设计保留/手动清理；首版不自动删除可恢复数据。
- A/V：frame、audio latent、PCM三个整数时钟；click/gap/重复帧/PTS漂移即失败。
- 优化：Turbo/Spectrum/Sage/cache/INT4 fail-closed，普通H3和MC不受影响。
- 许可证：优先core；helper使用应用自有薄实现或许可证兼容且pin commit的依赖；不复制GPL实现。
- 兼容：老数据缺字段是正常状态，migration additive且不得破坏媒体。
- 版本：完整用户可见能力属于 minor，正式交付建议 `0.44.0`；中间工作记入 `CHANGELOG.md` Unreleased，不逐包 bump。

## 10. 官方来源

- [ComfyUI H3 per-token video/audio mask PR #15375](https://github.com/Comfy-Org/ComfyUI/pull/15375)
- [ComfyUI MiniMaxH3AddGuide PR #15439](https://github.com/Comfy-Org/ComfyUI/pull/15439)
- [ComfyUI 官方 MiniMax H3 教程](https://docs.comfy.org/tutorials/video/minimax/minimax-h3)
- [ComfyUI H3 core nodes](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy_extras/nodes_minimax_h3.py)
- [ComfyUI MiniMaxH3 mask implementation](https://github.com/Comfy-Org/ComfyUI/blob/master/comfy/model_base.py)
- [ComfyUI SaveLatent/LoadLatent](https://github.com/Comfy-Org/ComfyUI/blob/master/nodes.py)
- [MiniMax 官方 H3 模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3)
- [Comfy-Org 官方 H3 文件树](https://huggingface.co/Comfy-Org/MiniMax-H3/tree/main)
