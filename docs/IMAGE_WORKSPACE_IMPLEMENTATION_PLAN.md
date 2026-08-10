# 图片工作台实施计划

> 状态：交互原型已完成；正式代码已完成图片数据契约、创建页骨架和图片批次执行骨架，真实 Qwen 闭环、图片历史/详情和图片放大尚未完成
> 制定日期：2026-08-10  
> 版本基线：当前应用为 `0.3.12`；图片稳定交付版本待完整验收后确定
> 交互基线：`prototypes/` 当前图片创建、图片历史和图片详情原型

当前边界：正式 renderer 已支持图片创建模式和图片批次队列骨架，但图片模型仍处于工作流待验证状态。正式历史页仍以视频数据为中心，图片/视频 Tab、图片项目详情、图片放大和真实 Qwen 运行验收仍需按本文实施。

## 1. 目标与产品边界

本模块不是独立的图片生成器，而是 H3 视频创作前的本地素材工作台。用户应当能够：

1. 导入一张基础图片和若干参考图片。
2. 用自然语言完成去水印、添加/移除内容、人物姿态调整、风格转换、合成痕迹修复和整体质量改善。
3. 使用提示词助手把模糊需求改写成当前图片模型更容易理解的 Prompt。
4. 一次提交 1–10 张候选图，以较低成本抽卡。
5. 将一个项目的所有编辑、抽卡和放大结果保存在同一个图片详情页中。
6. 从满意版本继续编辑，或直接开始创作视频。
7. 只在确认结果满意后，从详情页创建放大任务。

首个稳定版本以 `Qwen-Image-Edit-2511` 为主模型，保留模型适配层，但不要求同时接入所有调研模型。

### 1.1 明确不属于首发范围

- 画笔蒙版、套索、精确 ROI 编辑器。
- Photoshop 式图层系统。
- 像素级无损编辑承诺。
- 图片输出目录的大规模数据迁移。
- Qwen Image 2.0 本地模型（在可靠本地权重和 ComfyUI 支持明确前不接入）。
- FireRed、LongCat、FLUX.2 Klein 等全部候选模型同时首发。
- 云端模型作为必选依赖。

## 2. 已确认的交互需求

### 2.1 创建页新增“图片处理”模式

创建页保留三个模式：

- 图生视频 / R2V。
- 视频续写。
- 图片处理。

图片处理模式复用现有 R2V 的紧凑多参考交互，不再创建另一套复杂构建器。

#### Picture 输入

- 用户可添加、拖入、粘贴、替换和删除图片。
- UI 使用 `Picture 1`、`Picture 2` 等名称，与 Qwen 多图语义保持一致。
- `Picture 1` 是基础画面，决定默认构图和输出比例。
- 后续 Picture 是人物、物体、姿态、服装、风格或背景参考。
- 首版界面上限为 6 张；实际可用上限由模型适配器和工作流能力返回，不能散落硬编码。
- Picture 顺序必须稳定。删除中间 Picture 后不得静默把其他引用改指向不同素材。
- 提交前由 Prompt 编译器把 UI 引用映射到 ComfyUI 实际连续输入顺序。
- Prompt 引用了已删除 Picture 时禁止入队，并明确指出失效引用。

#### Prompt

- 只有一个最终 Prompt 输入框，不设置“用户 Prompt”和“模型 Prompt”两个并列输入框。
- 用户可以直接输入 `Picture 1`、`Picture 2` 等引用。
- 提示词助手接收缩略图、用户文字、当前预设和模型能力，优化结果直接写回主输入框。
- 每次优化产生新版本；上一版、下一版可以切换，旧版本不能丢失。
- 快速指令直接插入主输入框，不在下方额外堆叠 Tag。
- 常用预设至少包含：
  - 综合编辑 / 保守保持。
  - 去除水印并自然补全。
  - 修复合成痕迹（Compositing Artifacts）。
  - 人物姿态与身份。
  - 添加 / 移除元素。
  - 风格与材质转换。
  - 细节修复。
- “人物身份保持”“构图保持”等不是通用生成参数，应通过 Prompt 和模型适配模板表达。

#### 生成设置

- 模型：默认 `Qwen Image Edit 2511`。
- 质量档位：只显示当前模型真实支持的档位，例如原生质量或 Lightning。
- 输出格式：首发固定 PNG；创建页和图片设置不提供 JPEG/WebP 选择。历史版本仍保留已有格式元数据以兼容旧状态。
- 生成数量：滑杆 1–10。
- Seed：
  - 留空表示每张候选图使用独立随机 Seed。
  - 填入数值表示所有候选图使用相同 Seed。
  - 提供生成随机数按钮和清空按钮。
  - 不提供“连续递增 Seed”。
- 多张输出是一个逻辑队列任务；模型只加载一次，候选图按顺序生成，不使用 `batch_size=10` 同时挤占显存。
- 创建阶段不提供放大倍率，不自动放大所有抽卡结果。
- 入队时保存完整不可变快照，后续全局设置修改不得影响该任务。

### 2.2 队列

- 一个图片批次在队列中只显示一张卡片。
- 展开卡片显示：第几张 / 共几张、当前 Seed、节点阶段、进度、耗时、预览和性能统计。
- 每张候选图有独立子运行状态，但用户不需要看到重复的顶层任务。
- 成功一张立即形成可恢复的版本记录，不能等整个批次完成后才一次性写入。
- 取消批次时：
  - 中止当前 ComfyUI Prompt。
  - 保留已经成功完成的图片版本。
  - 未执行子项标记为取消。
  - 释放图片模型、VAE 和文本编码器占用后再执行下一重型任务。
- 应用重启后可以恢复未完成批次，不重复生成已经成功的子项。

### 2.3 历史页

历史一级页面必须明确分成两个 Tab：

- 视频。
- 图片。

不能把图片和视频混在一个瀑布流中，也不能仅通过卡片图标区分。

#### 视频 Tab

- 保持现有视频历史行为和数据兼容。
- 图片模块改造不得破坏视频封面缓存、悬停播放、瀑布流、相册模式、详情播放和视频放大版本。

#### 图片 Tab

- 一张最初导入的素材和后续所有编辑结果组成一个“图片项目”。
- 历史卡片代表项目，不代表单张版本。
- 同一项目无论编辑多少轮，只显示一张历史卡片。
- 卡片显示项目标题、封面、最新更新时间、模型、尺寸和版本数量。
- 默认按项目最新版本时间倒序。
- 图片 Tab 同样支持瀑布流和紧凑相册模式，但不包含视频悬停播放逻辑。
- 删除项目必须二次确认，并删除项目记录以及用户确认范围内的版本文件。

#### 封面规则

- `coverMode = auto` 时，最新成功版本自动作为项目封面。
- 用户执行“设为项目封面”后切换为 `coverMode = pinned`，固定选择的版本。
- 后续应提供“恢复自动封面”，恢复后继续使用最新成功版本。
- 首版图片直接作为封面，不需要像视频一样抽帧生成封面缓存；只生成适合列表加载的缩略图缓存。

### 2.4 图片详情页

采用常见的图片查看器结构：

- 左侧：单列版本缩略图，最新编号在最上面，区域内部向下滚动。
- 中间：当前大图，支持适合窗口、原始尺寸、拖动和平滑缩放。
- 右侧：当前版本的核心信息和常用操作。
- 大图下方：Prompt、版本来源、工作流和完整生成快照。

不按批次对版本缩略图分组。批次 ID 可以保留在内部记录中，但不作为主要视觉信息。

#### 右侧核心信息

- 当前版本编号和是否为封面。
- 模型。
- Seed。
- 尺寸。
- 输出格式。
- 生成完成时间。
- 本次生成耗时。

#### 继续工作

两个按钮在同一行：

- 开始创作视频：把当前图片带到视频创建页；界面不出现 Slot 1 文案。
- 继续编辑图片：把当前版本作为新一轮 Picture 1，结果继续写入同一图片项目。

如果进入 R2V，当前图片在内部可作为第一个 Picture；普通 I2V 时作为首帧。这个差异由目标创建模式决定，不需要用户在详情页理解。

#### 常用操作

- 复制图片：把解码后的像素写入系统剪贴板，可以直接粘贴进聊天、画图或其他应用。
- 复制文件：执行 Windows 文件复制操作，剪贴板内容是文件，不是路径文字。
- 打开所在位置：在 Explorer 中选中真实文件。
- 提升分辨率。
- 设为项目封面。
- 删除当前版本。

不提供“另存为”主操作。

#### 版本关系

- 所有版本按项目内单调递增编号显示。
- 最新成功版本默认排第一。
- 每个编辑版本保存 `parentVersionId`。
- 抽卡产生的多张候选图可以拥有相同父版本，但 UI 不按批次分组。
- 删除父版本后，后代仍保留，并显示父版本已删除，不级联删除。

### 2.5 图片放大

- 只能从图片详情页针对当前选中版本创建。
- 创建页不显示放大参数。
- 选择 2×、3×、4×和可用放大模型。
- 默认使用 SeedVR2 保守保持；RealESRGAN 作为快速方案。
- 放大是独立队列任务，执行前卸载图片编辑模型。
- 原图不能被覆盖。
- 成功结果作为同一图片项目的新版本，`kind = upscale`，父版本为被放大的版本。
- 失败或取消的放大结果不进入成功版本列表。

### 2.6 设置

图片设置至少包含：

- 默认图片编辑模型。
- 默认生成数量。
- 默认输出格式 PNG / JPEG / WebP。
- 独立图片输出目录；默认跟随所选 ComfyUI 的 `output\\Images`，不改写视频输出目录。
- 图片 Prompt 运行时和预设管理。
- 图片模型、文本编码器、VAE、GGUF 节点和工作流完整性检查。
- 图片放大模型和节点状态。

未启动 ComfyUI 时必须先做离线文件检查；只有 API 运行时能力无法离线确认时才显示“启动后验证”，不能让整个设置页在服务关闭时失效。

## 3. 建议数据契约

### 3.1 不要继续扩张视频对象

当前 `Draft`、`QueueTaskBase`、`HistoryAsset` 和 `AssetVersion` 包含大量视频必填字段，例如 `duration`、`fps` 和视频分辨率档位。图片功能不应通过不断增加可选字段硬塞进去。

建议使用判别联合：

```ts
type QueueTask =
  | VideoGenerationQueueTask
  | VideoExtensionQueueTask
  | VideoUpscaleQueueTask
  | ImageGenerationQueueTask
  | ImageUpscaleQueueTask;

type HistoryItem = VideoHistoryAsset | ImageHistoryProject;
```

旧类型可以先重命名或通过别名保持兼容，避免一次修改所有调用点。

### 3.2 ImageEditDraft

```ts
interface ImageEditDraft {
  mode: "image-edit";
  projectId?: string;
  parentVersionId?: string;
  pictures: ImageReference[];
  promptVersions: PromptVersion[];
  activePromptVersion: number;
  modelId: string;
  qualityProfile: string;
  outputCount: number;       // 1..10
  outputFormat: "png" | "jpeg" | "webp";
  seed: number | null;       // null = 每张随机；number = 全部相同
}
```

### 3.3 ImageReference

```ts
interface ImageReference {
  id: string;                // 稳定内部 ID
  pictureNumber: number;     // 用户可见 Picture N
  absolutePath: string;
  width: number;
  height: number;
  role?: "base" | "person" | "object" | "pose" | "style" | "background" | "auto";
}
```

`pictureNumber` 不是 ComfyUI 节点编号。模型适配器负责把有效引用编译成当前工作流所需的连续输入，并同步改写 Prompt。

### 3.4 ImageGenerationQueueTask

```ts
interface ImageGenerationQueueTask extends QueueTaskCommon {
  taskType: "image-generation";
  projectId: string;
  parentVersionId?: string;
  imageOutputDirectory: string;  // 入队时解析后的图片最终目录，不受后续设置修改影响
  pictures: ImageReferenceSnapshot[];
  prompt: string;
  promptVersion: number;
  modelId: string;
  qualityProfile: string;
  outputFormat: "png" | "jpeg" | "webp";
  runs: ImageGenerationRun[];
}

interface ImageGenerationRun {
  id: string;
  index: number;
  seed: number;
  status: "waiting" | "running" | "completed" | "failed" | "cancelled";
  comfyPromptId?: string;
  progress?: number;
  stage?: string;
  startedAt?: string;
  completedAt?: string;
  outputVersionId?: string;
  error?: string;
  performanceStats?: TaskPerformanceStats;
}
```

入队时必须把随机 Seed 展开为 `runs[].seed` 并持久保存。任务恢复、复制和历史复现不得重新随机。

### 3.5 ImageHistoryProject

```ts
interface ImageHistoryProject {
  mediaKind: "image";
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  coverMode: "auto" | "pinned";
  coverVersionId?: string;
  nextVersionNumber: number;
  versions: ImageAssetVersion[];
}

interface ImageAssetVersion {
  id: string;
  versionNumber: number;
  kind: "source" | "edit" | "upscale";
  parentVersionId?: string;
  taskId?: string;
  runId?: string;
  createdAt: string;
  startedAt?: string;
  modelId: string;
  workflowPath: string;
  prompt: string;
  promptVersion: number;
  references: ImageReferenceSnapshot[];
  seed?: number;
  width: number;
  height: number;
  format: "png" | "jpeg" | "webp";
  file: HistoryFile;
  sourceFile?: HistoryFile;  // ComfyUI staging 文件；用于失败恢复和清理，不作为用户最终路径
  comfyPromptId?: string;
  comfyOutputs?: unknown;
  performanceStats?: TaskPerformanceStats;
}
```

### 3.6 状态迁移

- `AppState.schemaVersion` 从 2 升级到 3；图片输出目录设置再从 3 幂等升级到 4。
- 所有旧 `HistoryAsset` 迁移为 `mediaKind = "video"`，数据内容不变。
- 旧 QueueTask 同样保持原行为。
- 新增独立 `imageDraft`，不要改变现有视频 `draft` 的含义。
- 迁移必须幂等；同一状态重复加载不能继续改变数据。
- 写迁移 fixture，覆盖空状态、旧视频历史、视频多版本和失败队列。

## 4. 输出文件与安全规则

### 4.1 格式

- PNG：默认，无损，优先用于继续编辑和作为 H3 输入。
- JPEG/WebP：暂不作为首发生成输出；避免在只有 PNG 工作流时做隐式格式转换。

如果 ComfyUI 工作流只稳定输出 PNG：

1. 先把 ComfyUI PNG 作为临时/中间结果写完整。
2. 转换到新的目标文件，禁止原地覆盖。
3. 解码目标文件并核对宽高、格式和非零大小。
4. 原子写入历史记录。
5. 历史写入成功后才清理临时文件；清理失败只记录警告，不回滚成功作品。

任何转换、复制或迁移都不能先删除源文件。不得把复制实现为移动。

### 4.2 路径

- 数据库/JSON只保存文件元数据和真实路径，不保存图片 Blob。
- 不因设置加载或 ComfyUI 实例切换自动迁移既有媒体；只有用户明确确认迁移操作时才移动文件。
- 继续复用现有路径恢复策略，并扩展图片格式候选。
- 删除当前版本必须解析并验证精确绝对路径，不能递归删除项目目录。
- 项目最后一个版本被删除时，删除项目记录；是否删除原始用户导入图必须单独判断，默认不删除用户源文件。

### 4.3 ComfyUI 输出根、视频目录与图片目录

视频和图片都需要可迁移，但必须共享同一个受控的 ComfyUI output 根。不能继续让一个 `Settings.outputDirectory` 同时承担“ComfyUI 服务输出根”和“应用视频历史目录”两个含义。

#### 设置字段

```ts
interface Settings {
  comfyOutputDirectory: string;  // ComfyUI 实际 output 根；空字符串 = 自动检测
  videoOutputDirectory: string;  // 空字符串 = <comfyOutput>\\Videos
  imageOutputDirectory: string;  // 空字符串 = <comfyOutput>\\Images
}
```

- `comfyOutputDirectory` 是 ComfyUI 服务根目录，不是用户媒体迁移目标；它由所选 ComfyUI 实例离线/运行时解析，并用于计算相对 `filename_prefix`。
- `videoOutputDirectory = ""` 和 `imageOutputDirectory = ""` 分别表示自动目录 `<comfyOutput>\\Videos` 与 `<comfyOutput>\\Images`，不把某台机器的绝对路径写入默认状态。
- 用户选择的两个媒体目录必须是 `comfyOutputDirectory` 的子目录或其本身；解析后使用 `path.relative`/规范化大小写校验，选择 output 外部目录立即拒绝并说明“必须位于当前 ComfyUI output 目录内”。
- 设置页显示 ComfyUI output 根、视频目录和图片目录三个独立字段；两个媒体目录都提供“恢复自动目录”和“迁移历史文件”操作。
- 视频/图片输出目录的选择按钮可以创建尚不存在的目标子目录，并直接定位到该目录；模型目录、Prompt 目录等普通路径选择器不自动创建目录。
- 现有 schema v3 的 `outputDirectory` 作为旧视频目录/旧 Comfy output 信息迁移到 v4：先根据模型目录、安装实例和历史绝对路径推断 Comfy output 根，再把旧目录保留为迁移源，不能直接丢弃或覆盖。

#### ComfyUI output 子目录与最终文件

ComfyUI 的视频/图片保存节点只能稳定写入自身 output 根下的相对子目录，因此任务分成两个路径：

1. ComfyUI output 根：当前 ComfyUI 服务真实使用的 output 目录。
2. 应用管理目录：视频默认 `Videos`，图片默认 `Images`；任务入队时保存解析后的目标目录快照。

- workflow 的 `filename_prefix` 使用从 ComfyUI output 根到目标目录的安全相对路径；绝对路径和 `..` 越界路径一律拒绝。
- 任何试图把视频或图片目录设到 ComfyUI output 外的操作都不能进入保存状态，也不能启动迁移。
- 图片仍可使用专用 staging 子目录处理格式转换；staging 和最终目录都必须在 ComfyUI output 根内。
- 复制目标使用项目/版本稳定命名，避免不同项目的同名文件覆盖；临时文件写入目标目录后原子重命名。
- 复制完成后验证文件存在、大小非零、格式和宽高可读取，再把最终路径写入 `ImageAssetVersion.file`。
- `sourceFile` 保存 Comfy staging 元数据，便于目标目录写入失败时恢复或清理；历史详情和用户操作只使用 `file`。
- 只有最终文件验证成功且历史状态原子持久化成功后，才清理 staging；清理失败只记录警告。视频也遵守同样的“先写新目录、再更新历史、最后清理旧文件”顺序。

#### 修改目录时的统一迁移事务

用户修改 `videoOutputDirectory` 或 `imageOutputDirectory` 且历史中存在对应媒体时，保存设置前显示迁移确认和预检结果。两个迁移可以分别执行，也可以在一次确认中同时执行；视频和图片使用不同的文件清单。

#### 用户交互状态机

目录输入属于未保存设置草稿。用户点击“保存设置”时，不能先持久化新目录再询问迁移，否则迁移失败会让设置和历史路径先后失去一致性。

1. 规范化新目录，并验证它位于当前 ComfyUI output 根内；不合法时拒绝保存，保留用户草稿并明确提示“输出目录必须位于当前 ComfyUI output 目录内”。
2. 将新目录与当前生效目录按 Windows 规范化绝对路径比较；相同目录只保存其他设置，不显示迁移弹窗。
3. 新目录合法且不同目录时，先执行只读预检，再显示三选一确认弹窗。预检至少显示媒体类型、可找到文件数、缺失文件数、冲突数和总大小。弹窗必须明确列出旧目录和新目录。
4. 弹窗提供三个通用操作，不能把“关闭弹窗”误当成保存：
  - **应用更改**：保存新目录，只影响之后创建的新视频；历史对象的 `file.absolutePath`、旧文件和历史展示均不修改。正文必须明确提示“历史文件不会移动”。
  - **应用并迁移**：锁定设置页并进入迁移进度；所有目标文件复核通过后才更新历史路径。正文必须明确提示“历史文件将移动到新目录”。
  - **取消**：不调用保存 IPC，不改变当前生效目录或历史数据；只撤销本次目录输入。其他未保存设置草稿可以保留在页面上，等待用户之后再次保存或放弃。
5. 用户选择迁移操作时，进入不可绕过的迁移进度弹窗；设置页、目录输入和普通关闭流程锁定，直到迁移完成、失败或用户取消。迁移中的“取消”只取消迁移，不把新目录保存成生效设置。

迁移进度分为：扫描历史文件、准备目标文件、第 N / M 个文件、目标文件复核、更新历史记录、清理旧文件、完成。真正的历史路径提交发生在“目标文件复核”全部通过之后，不能在单个文件移动后零散修改历史状态。

迁移流程固定为：

1. 解析旧目录和新目录，验证新目录位于当前 ComfyUI output 根内，列出可找到、缺失、冲突和总字节数。
2. 视频只枚举 `HistoryAsset` 及其 `AssetVersion.files` 中明确记录的视频文件，并额外纳入等待队列中通过 `sourceAssetId/sourceVersionId` 或明确源路径引用的 `extension.sourceVideoPath`、`upscale.sourceFilePath`；图片只枚举 `ImageHistoryProject` 中 `edit` / `upscale` 版本的最终文件。不能递归搬运整个旧 output 目录。
3. 优先使用历史文件记录的 `absolutePath` 定位源文件；只有在旧记录缺少绝对路径时，才使用迁移前保存的旧目录和 `subfolder + filename` 候选。无法唯一定位的文件进入缺失/歧义报告，不得猜路径。
4. 按规范化源路径去重。同一个物理文件被多个历史版本引用时只移动一次，但提交阶段更新所有引用它的历史记录。
5. 目标路径保留历史文件的相对 `subfolder + filename` 结构；目标已存在且大小/哈希匹配时视为已完成，目标已存在但内容不同则是冲突，不能覆盖。
6. 对每个已找到且无冲突的媒体，在新目录写入临时副本并校验；禁止先删除旧文件。用户源图 `source` 版本只保留原路径，不移动原始用户文件。
7. 所有目标文件成功写入并通过存在性、非零大小、大小/哈希和可读取性复核后，在一次状态写入中更新对应目录设置、历史版本绝对路径和队列视频输入路径；视频历史、队列和图片历史分别更新，互不影响。应用启动时也按 `sourceAssetId/sourceVersionId` 修复等待队列中的旧路径。
8. 状态写入成功后，再删除旧的已迁移文件；删除失败保留新副本和新历史路径，迁移结果显示“完成但旧文件清理有警告”，不回滚可用历史。
9. 任意复制、校验或目标冲突失败时，不更新对应目录设置和历史引用；清理本次迁移创建的临时文件，旧目录和旧历史继续有效。另一种媒体的迁移可以独立成功。

迁移必须可重入：开始移动前持久化迁移 ID、媒体类型、旧目录、新目录和逐文件源/目标/大小/哈希/状态清单。目标文件已经存在且校验匹配时视为完成；目标存在但内容不同则生成冲突报告，不能覆盖。应用中途退出时，在历史路径提交前旧状态仍指向旧文件，下一次启动可以依据迁移清单清理临时文件或继续迁移；历史路径提交后则以新路径为准并继续清理旧文件。迁移 API、视频路径候选和图片路径候选必须分开，不能通过把新目录加入通用候选来掩盖迁移失败。

完成弹窗必须区分三种结果：

- **迁移成功**：所有历史文件目标存在且复核通过，历史路径已更新。
- **迁移完成但有清理警告**：历史路径已更新，新文件可用，但部分旧文件删除失败。
- **迁移未完成**：存在缺失、冲突、复制/校验失败或用户取消；旧历史路径保持有效，并提供报告，不显示“迁移成功”。

### 4.4 缩略图缓存

- 图片历史使用独立缓存命名空间，例如 `history-image-covers/v1`。
- 缓存 Key 至少包含版本 ID、源路径、文件大小和修改时间。
- 缓存缺失时显示 loading，不显示黑屏或误报文件损坏。
- 首次生成后异步写缓存；启动时不全量重建。
- 源文件变化或版本删除时只失效对应缓存。

## 5. 模型与工作流适配

### 5.1 首发模型

默认只要求跑通：

- `Qwen-Image-Edit-2511`。
- RTX 4090 可运行量化/FP8方案，以本机真实 benchmark 决定最终默认。
- 原生质量档。
- 一个经过验证的快速档（只有 Lightning 工作流通过质量测试后才展示）。

FLUX Kontext / FLUX.2 Klein 等适配器可以后续加入，不阻塞首个闭环。

### 5.2 ModelAdapter

每个图片模型适配器必须提供：

```ts
interface ImageModelAdapter {
  id: string;
  maxPictures: number;
  supportedFormats: ImageOutputFormat[];
  qualityProfiles: ImageQualityProfile[];
  validateEnvironment(scan: EnvironmentScan): CapabilityResult;
  compilePrompt(prompt: string, pictures: ImageReferenceSnapshot[]): CompiledImagePrompt;
  buildWorkflow(task: ImageGenerationQueueTask, run: ImageGenerationRun): ComfyPrompt;
  parseOutputs(history: unknown): ImageOutputCandidate[];
}
```

Prompt 编译必须有单元测试：

- Picture 顺序正常。
- 删除中间 Picture。
- Prompt 引用不存在的 Picture。
- 中文和英文引用。
- 相同图片被多次引用。

### 5.3 显存生命周期

- 一个逻辑批次内复用模型加载。
- 每个 Seed 完成后释放不再需要的中间 Tensor，不卸载主模型。
- 批次结束、取消、OOM或切换到 H3/SeedVR2 前调用 ComfyUI `/free` 并验证释放。
- 图片编辑模型和 SeedVR2 不同时驻留。
- 性能统计至少保存峰值显存、系统内存、GPU利用率、开始/结束时间。

## 6. 分阶段实施

> [!IMPORTANT]
> Phase 编号保留原有编号，便于对照已有任务和提交；下面的 P0–P6 是当前实际执行优先级。当前主线先解决“能否真实生成、能否恢复、产物是否正确”，再扩大正式 renderer 范围。

### 当前执行优先级

1. **P0：Phase 0 收尾，契约与恢复基线**
  - 补齐图片任务/子 run 的运行中恢复、图片历史规范化和迁移 fixture。
  - 固定 Picture 稳定引用、项目来源版本和输出文件安全规则。
  - 统一实际使用的图片 Prompt 契约，避免两套规则继续漂移。

2. **P1：Phase 1，真实 Qwen 2511 单图闭环**
  - 先在真实 ComfyUI 上验证单图、双图、原生质量和取消后的下一任务。
  - 只有运行时验证通过后，模型扫描结果才允许从“组件完整”变为“工作流可用”；不能用文件存在代替集成验证。
  - Phase 7 中与模型/节点扫描、工作流检查直接相关的部分前置到这里。

3. **P2：Phase 3，图片批次执行和产物安全**
  - 在 Qwen 单图闭环之后，完成多 run 顺序执行、重启恢复、取消保留、真实尺寸读取、PNG/JPEG/WebP 转换和失败保护。
  - 这是正式创建页可以提交任务的后端验收门槛。renderer 卡片可以提前用 fixture 并行，但不能先宣称图片功能可用。

4. **P3：Phase 2，正式图片创建页**
  - 收紧当前已有 UI 与真实能力返回、默认设置、稳定 Picture 引用和入队快照的连接。
  - 重点验证 UI 行为，不再继续扩展尚未有后端闭环支撑的装饰性功能。

5. **P4：Phase 4 → Phase 5，图片历史、详情和视频交接**
  - 先完成项目聚合、图片/视频 Tab、缩略图缓存和删除边界，再完成详情查看器、继续编辑、复制和视频交接。
  - 两个阶段共享同一套图片项目/版本文件边界，不拆成互相独立的临时记录。

6. **P5：Phase 6，选中版本的图片放大**
  - 详情页和项目版本关系稳定后，再接入 `image-upscale`，避免先做一个无法归档的独立放大队列。

7. **P6：Phase 7 剩余设置与 Phase 8 发布验收**
  - 完成安装/修复、放大模型诊断、日志和可移植性，再进行完整回归、性能、文档和版本发布。

## Phase 0：契约冻结、状态迁移与测试骨架

目标：在任何页面正式实现前，先让图片和视频拥有清晰、可迁移的数据边界。

任务：

1. 引入 `mediaKind` 判别联合。
2. 新增 `ImageEditDraft`、图片 QueueTask、图片项目和图片版本类型。
3. 将旧视频类型通过别名或小步重命名保持兼容。
4. `schemaVersion` 升至 3并实现幂等迁移；图片输出目录字段从 3 升至 4。
5. 添加 Seed 展开、版本编号、封面选择和父版本关系纯函数。
6. 建立图片 workflow adapter 接口和空实现。
7. 添加 fixture 和单元测试，不接真实 GPU。

当前收尾重点：将应用退出时处于 `running` 的图片任务和子 run 恢复为可继续的等待状态；规范化已保存的图片项目；补齐删除父版本、文件缺失和随机 Seed 展开 fixture。

验收：

- 所有旧视频 fixture 迁移后播放/路径/版本字段不变。
- 空 Seed 在入队时得到指定数量的固定随机 Seed。
- 固定 Seed 生成指定数量相同 Seed run。
- 图片项目版本编号单调递增。
- TypeScript exhaustive switch 对新增任务类型不漏分支。
- `npm.cmd run typecheck` 和现有测试通过。

依赖：无。后续所有 Phase 依赖本 Phase。

## Phase 1：Qwen 2511 环境、工作流与单张命令行闭环

目标：先证明后端能在本机稳定生成一张图，再接 GUI。

当前状态：P1 代码基础已接入。环境扫描现在区分组件完整、应用工作流集成和 ComfyUI 运行时节点就绪；原生 workflow 已按官方 Qwen 2511 模板使用双路 `TextEncodeQwenImageEditPlus`、`FluxKontextMultiReferenceLatentMethod`、`FluxKontextImageScale` 与 `VAEEncode`，提交前会校验最终上传后的 API graph。当前机器的 `http://127.0.0.1:8188` 尚未启动，单图/双图真实生成、4090 显存记录和取消后的下一任务仍待本机运行验收。

任务：

1. 固定 Qwen 2511 模型组件清单、目录规则和来源。
2. 增加离线模型/节点/工作流扫描。
3. 加入一键安装/修复与更新按钮所需后端能力。
4. 实现 Qwen 多 Picture workflow adapter。
5. 验证单图编辑和双图组合。
6. 验证原生质量档；快速档单独 A/B，不通过则不展示。
7. 记录 4090 显存、RAM、耗时和 ComfyUI 日志。
8. 增加无 GUI 的 workflow fixture 测试。

当前门槛：模型文件齐全只能标记为“组件完整”；必须有真实 ComfyUI 运行时验证后才能标记为“工作流可用”，并解除创建页的入队阻断。

验收：

- Picture 1 单图编辑成功并得到可读取 PNG。
- Picture 1 + Picture 2 能按 Prompt 完成组合。
- 相同 Prompt/Seed/输入在干净服务状态下可复现到合理范围。
- 连续运行至少 5 个短任务无持续显存/共享显存增长。
- 取消后可以继续执行下一任务。

依赖：Phase 0。

## Phase 2：图片创建页与草稿持久化

目标：把已批准原型实现成正式 Electron 页面，但暂时只要求成功入队。

任务：

1. 创建页加入 `image-edit` 模式和独立 `imageDraft`。
2. Picture 添加、替换、删除、粘贴、拖拽覆盖和缩略图。
3. Prompt 单输入框、版本前后切换和快速指令。
4. 多模态提示词优化；失败时保留用户原稿。
5. 预设：去水印、合成痕迹修复等。
6. 模型、质量、输出格式、数量、Seed 控件。
7. 入队校验和不可变快照。
8. 清空确认和草稿自动保存。

验收：

- 重启应用后 Picture、Prompt版本和设置仍在。
- 输入框连续打字不丢焦点。
- 删除 Picture 后失效引用阻止入队。
- 1–10 张滑杆正确生成 runs。
- 输出格式和 Seed 语义正确写入任务快照。
- 图片创建页不存在自动放大参数。

依赖：Phase 0；正式提交依赖 Phase 1 和 Phase 3，UI 可在 P1/P2 期间使用 fixture 并行开发。

## Phase 3：图片批次队列执行

目标：一个逻辑任务顺序生成多张图片，并能取消、恢复和持久保存子进度。

任务：

1. Electron worker 支持 `image-generation`。
2. 每个 run 单独提交 Comfy Prompt 并解析图片输出。
3. 卡片展示 run index、Seed、预览、节点阶段和总进度。
4. 每张成功后立即写入图片项目版本。
5. 取消、失败重试和应用重启恢复。
6. 批次结束后显存清理。
7. 格式转换与文件完整性验证。

当前 P2 还必须接入独立视频/图片输出目录：入队快照保存最终目录，workflow 使用相对 output 子目录，JPEG/WebP 转换和目录迁移均遵守复制后校验、最后清理源文件的顺序。

验收：

- 6张任务只显示一张顶层卡片。
- 运行中可看到当前第 N / 6 张。
- 前3张成功后取消，第3张以前仍在历史，剩余不执行。
- 重启不会重复已完成 run。
- JPEG/WebP 文件能预览、复制并再次作为 Picture 输入。
- 转换失败不会删除 ComfyUI 原始输出。

依赖：Phase 0、1；renderer 卡片可与本 Phase 后半段并行，但真实图片提交必须先通过本 Phase 的产物验收。

## Phase 4：图片历史 Tab、项目聚合与删除

目标：正式分开图片和视频历史，并按项目管理图片版本。

任务：

1. 历史页面加入 video/image Tab 和各自滚动位置。
2. 图片项目卡片与瀑布流/相册布局。
3. 最新更新时间排序。
4. auto/pinned 封面规则。
5. 图片缩略图缓存。
6. 右键菜单：打开详情、继续编辑、开始创作视频、复制图片、复制文件、打开所在位置、设封面、删除。
7. 项目删除和单版本删除的不同确认文案及文件范围。

验收：

- 图片不会出现在视频 Tab，视频不会出现在图片 Tab。
- 一个项目12个版本只显示一张历史卡片。
- 新增版本后项目自动移动到最前。
- 手动封面在重启后保持；恢复自动后使用最新版本。
- 删除单版本不误删其他版本或用户源图。
- 现有视频封面和悬停播放回归通过。

依赖：Phase 0、3；Phase 2 的创建 UI 可并行，但历史正式入口要等图片版本写入和恢复闭环稳定后接入。

## Phase 5：图片详情、继续编辑与视频交接

目标：完成图片项目的主工作区闭环。

任务：

1. 单窗口“左侧缩略图 + 大图”查看器。
2. 最新版本在前，单列滚动，不按批次分组。
3. 右侧核心信息和同一行继续工作按钮。
4. 大图下方显示 Prompt、父版本和完整快照。
5. 图片像素复制、Windows文件复制、Explorer定位。
6. 设为封面、删除当前版本。
7. 继续编辑时保持 projectId 并设置 parentVersionId。
8. 开始创作视频时把所选版本传入视频草稿。

验收：

- 切换缩略图同步更新大图、右侧信息和下方快照。
- 继续编辑多轮后仍只有一个项目详情页。
- 开始创作视频进入创建页且图片正确显示。
- 复制图片能粘贴出像素；复制文件能在 Explorer 中粘贴文件。
- 文件缺失时给出恢复路径提示，不崩溃。

依赖：Phase 4；视频交接可与 Phase 4 后半并行，但必须复用同一图片项目和版本文件契约。

## Phase 6：图片放大后处理

目标：只放大用户选中的满意版本。

任务：

1. 详情页放大弹窗。
2. `image-upscale` QueueTask 和运行卡片。
3. SeedVR2图片工作流；RealESRGAN快速工作流。
4. 2×/3×/4×尺寸计算和模型限制校验。
5. 放大前后显存卸载。
6. 成功后写入同项目新版本。

验收：

- 原图不覆盖。
- 放大结果 parentVersionId 正确。
- 失败/取消不生成成功版本。
- 原始图和放大图均可继续编辑或送入视频。
- 不会对整个抽卡批次自动放大。

依赖：Phase 3、4、5。

## Phase 7：设置、诊断与可移植安装

目标：换电脑后可以知道缺什么，并完成图片模块环境准备。

任务：

1. 图片模型页使用真实扫描结果，不展示伪“4/4可用”。
2. Qwen模型组件和版本检测。
3. 节点与工作流放在“节点与工作流”，不混入视频模型。
4. 默认数量、格式、模型和图片输出路径。
5. 图片 Prompt 预设管理。
6. SeedVR2/RealESRGAN 状态。
7. 离线检查、一键安装/修复、代理和可见日志。

优先级调整：模型组件扫描、Qwen 节点/工作流完整性和运行时验证属于 P1；放大模型状态、安装辅助和可移植诊断属于 P6。
图片输出目录、视频输出目录、默认 `output\\Images` / `output\\Videos` 解析、目录越界提示、迁移预检和迁移日志属于 P3/P4 的前置契约；不能在两个媒体设置中复用同一个输入框，也不能把迁移实现成修改全局 ComfyUI output 根。

验收：

- ComfyUI关闭时仍能判断文件是否安装。
- ComfyUI启动后补充节点类和运行时验证。
- 多个 ComfyUI 安装时跟随用户选择的实例。
- 安装日志可见且失败可重试。
- 设置修改不改变已入队任务。

依赖：Phase 1；P1 必需的扫描和运行时验证前置，剩余设置 UI 可与 Phase 2、Phase 3 后半并行。

## Phase 8：回归、性能、文档与发布

目标：把图片工作台作为可公开使用的 `0.3.0` 功能交付。

任务：

1. 完整回归视频创建、H3 R2V、续写、队列、历史和设置。
2. 4090连续批次稳定性测试。
3. 大量图片项目和缩略图性能测试。
4. 文件缺失、磁盘满、格式转换失败、ComfyUI断线和强退恢复测试。
5. README、产品需求、依赖说明和换机交接更新。
6. 版本号升级并保持 package.json/package-lock一致。

验收：

- 类型检查和全部自动化测试通过。
- 至少完成单图、双图、6张抽卡、取消恢复、继续编辑、视频交接和放大 smoke test。
- 连续多批次无显存持续增长。
- 500个图片项目仍能快速进入历史，缩略图按需加载。
- 升级旧状态后视频历史无丢失。

依赖：所有前置 Phase。

## 7. 多 Agent 分工建议

不要让多个 Agent 同时大范围修改 `src/main.ts` 或 `electron/main.ts`。这两个文件目前职责过重，冲突概率很高。建议先拆模块，再并行。

### Agent A：数据契约与迁移

负责：

- `src/types.ts`
- `electron/store.ts`
- 新增 `src/core/image-project.ts`
- 迁移与纯函数测试

交付：Phase 0 完整提交。

### Agent B：模型、环境与工作流

负责：

- `workflows/`
- `src/core/image-workflow.ts`
- `electron/services/environment.ts` 中图片能力扫描
- Qwen适配器和 workflow fixture

交付：Phase 1，不修改正式 renderer。

### Agent C：Electron IPC、队列 Worker与文件操作

负责：

- `electron/main.ts` 中图片任务执行
- `electron/preload.cts`
- 格式转换、剪贴板、Explorer、删除和文件验证
- worker集成测试

依赖 Agent A 契约和 Agent B adapter。

### Agent D：Renderer

建议在 Agent A 合并后负责：

- 把 `src/main.ts` 的图片创建、图片历史、图片详情拆到独立 renderer 模块。
- `src/style.css`
- Phase 2、4、5、6 的页面和交互。

为了减少冲突，优先建立：

```text
src/renderer/image-create.ts
src/renderer/image-history.ts
src/renderer/image-detail.ts
src/renderer/image-upscale.ts
```

`src/main.ts` 只做页面路由和组合。

### 推荐并行顺序

```text
P0: Phase 0 收尾，Agent A 独占契约、迁移和恢复
       ↓
P1: Phase 1，Agent B 主导真实 Qwen 工作流与环境门槛
       ↓
P2: Phase 3，Agent C 主导图片批次、文件产物和恢复
       ↓
P3: Phase 2，Agent D 主导正式图片创建页；C 提供真实 IPC
       ↓
P4: Phase 4 → 5，Agent D 主导历史、详情和视频交接；A 提供项目纯函数
       ↓
P5: Phase 6，C 与 D 按 IPC/renderer 文件边界接入图片放大
       ↓
P6: Phase 7 剩余设置与 Phase 8 独立回归验收
```

每个 Agent 提交前必须：

1. 写清修改文件和未完成项。
2. 不顺手修改其他 Agent 所有权文件。
3. 提供自动化测试或可复现 fixture。
4. 更新本计划对应 Phase 状态。
5. 运行 `npm.cmd run typecheck` 和相关测试。

## 8. 测试矩阵

### 自动化

- AppState v2 → v3迁移。
- 随机/固定 Seed 展开。
- Picture 引用编译和失效检测。
- 多 run 状态恢复。
- 图片项目聚合、排序、封面规则和父版本。
- PNG/JPEG/WebP解析与扩展名。
- 文件复制与删除目标解析。
- 图片/视频历史过滤。
- 图片缩略图缓存 Key 和失效。
- 放大版本归组。

### 无 GPU 集成测试

- Mock Comfy history 返回一张、多张、缺失文件和错误输出。
- 任务执行3/6后取消。
- 应用在4/6时退出并恢复。
- 格式转换成功/失败。
- 单版本删除和项目删除。

### RTX 4090 手工验收

1. 单张图去水印。
2. 单张图修复合成痕迹。
3. Picture 1 场景 + Picture 2 人物组合。
4. 6张随机 Seed 抽卡。
5. 固定 Seed 复现。
6. 连续5个批次观察VRAM、Shared GPU Memory和系统内存。
7. 取消、重试、ComfyUI重启恢复。
8. 满意版本继续编辑两轮。
9. 满意版本开始H3视频创作。
10. 选中单版本执行2× SeedVR2。

## 9. 发布门槛与禁止事项

在以下条件满足前，图片工作台不得标记“完整可用”：

- Qwen 2511至少有一个本地工作流在4090实测通过。
- 图片批次取消和恢复不丢失已完成版本。
- 图片/视频历史真正分 Tab。
- 复制图片与复制文件语义均实测正确。
- 删除不会误删用户源图片或同项目其他版本。
- 格式转换不覆盖源文件。
- 视频历史和H3队列回归通过。

禁止：

- 用示例状态冒充真实模型可用状态。
- 只检查文件名就宣称模型完整。
- 把多个图片结果拆成多个顶层队列任务。
- 把每次编辑拆成新的历史项目。
- 在创建阶段自动放大全部候选图。
- 删除中间 Picture 后静默改变 Prompt 的引用对象。
- 用移动代替复制，或在验证新文件前删除旧文件。

## 10. 完成定义

用户可以在一台全新配置好的 Windows + RTX 4090 电脑上：

1. 在设置中确认 Qwen 2511及依赖完整。
2. 导入1–6张 Picture并优化 Prompt。
3. 创建1–10张候选图的单一队列任务。
4. 关闭并重开应用后继续任务。
5. 在独立图片历史 Tab 中看到一个项目，而不是多张重复卡片。
6. 在单列版本查看器中比较全部版本。
7. 复制图片、复制文件、定位文件、设封面和删除版本。
8. 从任意版本继续编辑且仍归入原项目。
9. 从任意版本开始创作视频。
10. 只对满意版本创建放大任务，并保留原图。

全部满足后，图片工作台才达到本计划的稳定交付标准。
