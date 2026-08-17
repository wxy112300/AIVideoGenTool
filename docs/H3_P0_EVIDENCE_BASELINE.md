# H3 Phase 0 证据基线

## 状态

- 日期：2026-08-17
- Local Video Studio：`0.22.1`
- 参考项目：ComfyUI-ALLinONE-MinimaxH3 `0.5.0`，提交 `decde8cc4299b89339441c42c0fc8c88dca7b548`
- 本轮范围：输入缓存可见性、最终工作流节点图、实时预览、任务完成检测、兼容元数据设计
- 当前 ComfyUI：`http://127.0.0.1:8188` 无响应，因此本轮没有新增真实 GPU smoke 结果

本文件记录 Phase 0 的证据和后续按需决策门槛。它不把静态检查描述为运行成功，也不要求为了对齐参考项目而重复验证本项目已经稳定运行的主流程。

## 已建立的自动化证据

新增 `tests/h3-workflow-baseline.test.ts` 和对应 Vitest snapshot，固定以下最终 API 图：

1. 标准 H3 I2V；
2. LightX2V Turbo；
3. Spectrum 与 `model_aware_mode`；
4. KJNodes TAE 实时预览；
5. Motion Context 像素上下文；
6. Motion Context latent 复用。

快照保存的是经过 `renderWorkflow` 完成 LoRA、Attention、Spectrum、Preview、占位符替换和卸载节点处理之后的图，而不是原始模板。后续修改这些策略时，评审者可以直接看到节点、输入和连接顺序的变化。

输入可见性测试证明：

| 模式 | 外部输入进入最终图的位置 | 路径变化是否改变 API 图 |
| --- | --- | --- |
| H3 I2V | `LoadImage.image` | 是 |
| H3 R2V 图片 | `LoadImage.image` | 是 |
| H3 R2V 视频 | `VHS_LoadVideoFFmpeg.video` | 是 |
| Motion Context 视频 | `VHS_LoadVideoFFmpeg.video` | 是 |
| Motion Context latent | `MiniMaxH3MotionContextLoadLatent.latent_path` | 是 |

这些测试只证明“路径变化可见”。如果文件内容被原地覆盖但路径不变，当前 API 图没有文件内容哈希字段，是否重算取决于 ComfyUI 对相应加载节点及动态输入的缓存规则。

## 缓存风险边界

### 已有保护

- 图片素材提交后由应用素材库按内容归档，常规路径不会继续指向用户随后可能覆盖的原始文件。
- 每次向 ComfyUI 上传媒体都使用新的 `studio-input-<UUID>` 文件名并设置 `overwrite=false`。
- 队列项是不可变执行快照；修改 Draft 不会改变已经入队的路径和参数。
- Prompt、Seed、尺寸、Steps、参考路径和 Motion Context latent 路径都进入最终工作流；其中任意普通输入变化都会改变节点输入。
- 应用自己启动的 ComfyUI 当前带有 `--cache-none`，因此 execution cache 复用主要不是 app-managed 实例的风险。

### 尚未证明安全

- 同一个 ComfyUI input 相对路径上的图片或视频被原地覆盖；
- R2V 的动态 `ref_images.*`、`ref_videos.*` 结构在不同 ComfyUI 版本中的递归缓存追踪；
- Motion Context 自定义节点内部是否保存跨 Queue 状态；
- latent 文件保持相同路径但内容被更新时，加载节点是否重新执行。

风险主要集中在用户提前启动的 ComfyUI Desktop：应用不会改变外部进程的启动参数，也不能假定它使用 `--cache-none`。真实缓存矩阵必须分别覆盖 app-managed 与 externally managed 两种服务，不能用前者的结果代替后者。

### Phase 1 决策门槛

只有以下任一用例在真实 ComfyUI 上稳定复现旧内容，才引入 Fingerprint helper：

1. 同路径覆盖 I2V 图片后仍使用旧图；
2. 同路径覆盖 R2V 图片或视频后仍使用旧引用；
3. 同路径覆盖 Motion Context latent 后仍复用旧 latent；
4. ComfyUI 的执行缓存报告相应加载/条件节点未重新运行，并且结果可重复观察。

若不能复现，保留哈希归档路径并补运行日志，不增加新的自定义节点依赖。若能复现，helper 只负责 pass-through 和 `IS_CHANGED` 内容指纹；模型加载等安全缓存仍应保留。

## 实时预览链路基线

当前产品路径为：

```text
Settings.h3LivePreview
  -> enqueue writes the preference into the immutable task snapshot
  -> runtime /object_info discovers ModelPreviewOverrideKJ and taeh3.safetensors
  -> renderWorkflow inserts ModelPreviewOverrideKJ after LoRA/Attention/Spectrum
  -> KJNodes sampler callback emits preview event
  -> waitForTask accepts KJ custom JSON or ordinary ComfyUI binary preview
  -> Electron emits TaskPreview
  -> renderer updates only the running card image
  -> queue state transition prunes the in-memory data URL
```

静态检查结果：

- Preview 节点配置为一帧、最大边 512、JPEG 72，并连接到全部 Scheduler/Guider model consumer。
- 缺少 KJNodes 或 `taeh3.safetensors` 时，正式生成继续执行并写 warning。
- renderer 的 `taskPreviews` 只保留运行任务；任务不再是 running 后立即删除。
- 卡片在等待首帧时显示 spinner，收到帧后显示 live 指示点。
- WebSocket 同时接受 `kj_preview_override` 和 ComfyUI 二进制 preview；普通 `executed` 节点缩略图只是降级预览，不等同于逐步 TAE。

### 既有运行日志证据

2026-08-14 的既有日志包含一项启用预览的 H3 Spectrum 任务：

- `16:55:36.866`：记录 `H3LivePreviewEnabled`；
- `16:55:46.926`：Sampler 开始；
- `16:56:04.105`：第 1/24 步进度；
- `16:57:41.085`：第 15/24 步进度；
- `16:58:01.016`：任务完成；总计约 146 秒；
- `16:58:03.273`：H3 runtime release 验证结束。

该版本日志没有记录预览帧到达事件，因此不能从日志证明首帧发生在第几步。用户观察到约第 15 步才显示，可能是以下路径之一：

1. KJNodes 只发送了后期帧或前期回调队列一直忙；
2. 自定义事件格式与当前解析器不一致，UI 最后收到的是普通 ComfyUI preview；
3. H3 latent 在早期 Step 不能被当前 TAE 路径正确解包；
4. Spectrum replay、异步 JPEG 编码或 CPU 传输延迟了事件；
5. 当时运行的应用版本尚未包含当前的首帧日志。

目前不能把其中任一项当作已定位根因。

当前 Renderer 没有固定等待到第 15 步：收到事件后会直接更新现有 `<img>`，不会整页 render。更高概率的问题位于 KJNodes 异步编码、H3 前期 latent、事件格式兼容或上游消息积压。另一个诊断缺口是 `TaskPreview` 没有把 `source`、`step`、`totalSteps` 传给 Renderer，普通 ComfyUI preview 目前可能被 UI 误当成 TAE live frame。

## 任务完成与缓存释放

- `waitForTask` 以 WebSocket 作为进度快路径，同时轮询 `/history?max_items=200` 作为完成/错误恢复路径。
- History 记录按 `client_id` 关联，VHS `unfinished_batch` 不会被误判为完成。
- 服务无响应和节点长期无活动分别有超时边界。
- 预览 data URL 只存在于 renderer 内存，不进入持久化状态；队列状态变化会删除非 running task 的预览。
- 任务结束还有模型运行时释放与 VRAM 验证，但这和 preview data URL 释放是两个独立层次。

参考项目的 WebSocket 加 History 轮询策略在本项目中已经存在，不需要重新实现。

## 兼容性证据模型草案

参考项目记录的是一套外部已测试基线，而不是本项目应直接采用的推荐环境：ComfyUI `0.32.0`、Python `3.12.10`、PyTorch `2.9.1+cu130`，并将 Motion Context、VideoHelperSuite、KJNodes、SolAttention、H3 Cache、Larry Turbo、H3 Studio 和 SeedVR2 固定到具体 commit。当前项目的 ComfyUI 最低版本是 `0.31.0`、推荐版本是 `0.33.1`，Turbo 使用 LightX LoRA，实时预览使用 KJNodes；不能用外部基线覆盖这些策略。

需要保留的两条外部兼容证据是：

- ComfyUI commit `bdcb886` 移除 `time_shift_slope` 后，未修复的 H3 Cache 可在导入/patch 阶段破坏全部 H3 任务，即使工作流没有主动开启 Cache；
- 2026-08-06 至 2026-08-13 的一段 ComfyUI 核心存在 R2V shape mismatch，上游修复 commit 为 `e01fb4c`。

另外，参考项目使用的 Motion Context 仓库与本项目 Catalog 当前登记的 `NikoDemon80/ComfyUI-H3-Motion-Context` 不同，节点类名不能按显示名称直接互换。这进一步说明兼容信息必须绑定 repository、version/revision 和具体 workflow feature。

现有依赖定义只有 `minimumVersion`、`recommendedVersion` 和扫描得到的 `latestVersion`。它可以表达“太旧”和“有推荐更新”，但不能表达：

- 某一段版本已知损坏；
- 只在特定 ComfyUI/Python/PyTorch 组合验证；
- 节点源码存在但某个可选 feature 不可用；
- 某个提交可用但尚未发布 tag；
- 兼容结论的来源和验证日期。

Phase 1 建议先增加证据字段而不改变安装器：

```ts
interface DependencyCompatibilityEvidence {
  verifiedAt: string;
  sourceUrl: string;
  note: string;
  comfyUi?: string;
  python?: string;
  pytorch?: string;
  cuda?: string;
  commit?: string;
  workflowIds?: readonly string[];
  checks?: readonly ("static" | "object-info" | "minimal-run")[];
}

interface DependencyBadRange {
  versionFrom?: string;
  versionTo?: string;
  revisionFrom?: string;
  revisionTo?: string;
  reason: string;
  severity: "warning" | "error";
  sourceUrl: string;
  affectedFeatures?: readonly CatalogCustomNodeFeatureId[];
  fixedByVersion?: string;
  fixedByRevision?: string;
}
```

Scanner 还应增加独立的 `detectedRevision`，优先读取 Git HEAD，缺失时再回退 pyproject/API。Git commit 和 semver 必须分别比较，不能把短 commit 当成版本号。

状态映射原则：

- **绿色**：磁盘存在且没有已知兼容错误；在线时必需 node type 也已注册。
- **黄色**：已安装待重启验证、低于推荐但高于最低、存在可选 feature 缺失、版本未知、或有未确认的新版本。
- **红色**：必需文件缺失、低于最低、命中已知坏范围、导入失败、或运行时必需 node type 不兼容。

“最新”不自动等于“推荐”；推荐版本必须来自本项目验证或明确上游兼容证据。

## 按需运行诊断清单

以下检查不再属于 Phase 0 出口条件。只有缓存旧输入或预览严重延迟再次影响实际使用，或相关运行路径将被修改时，才用最小合法 H3 任务执行。

### A. 缓存覆盖矩阵

分别在应用启动的 `--cache-none` 服务和用户提前启动、缓存策略未知的 ComfyUI Desktop 上执行。每组保持 Prompt、Seed、尺寸、时长、Steps 不变，只替换输入文件内容：

1. 新路径：A → B；
2. 同路径原地覆盖：A → B；
3. 应用素材库归档路径：A → B；
4. R2V 图片、R2V 视频和 Motion Context latent 各重复一次。

记录 ComfyUI 实际执行的 Load/Condition 节点、输出内容是否变化、缓存日志和最终 API 图。只有同路径覆盖失败才进入 helper node 实现。

### B. 预览时序

记录以下时间点和 Step：

- workflow 注入预览节点；
- prompt submitted；
- sampler started；
- first sampler progress；
- first KJ custom preview；
- first ordinary binary preview；
- final preview；
- task completed；
- renderer preview pruned。

分别运行标准 H3、Spectrum、Turbo，以及 Spectrum + Turbo（仅在受支持版本），比较关闭/开启预览的总耗时、每步耗时、CPU、VRAM 和系统内存。不要承诺每一步都有可见帧。

## Phase 0 出口条件

- [x] 六套 H3 最终 API 图建立可审查快照。
- [x] I2V、R2V、Motion Context 外部路径变化有回归测试。
- [x] 实时预览注入、消息、UI 和释放链路完成静态审计。
- [x] 既有真实任务日志形成历史基线。
- [x] 兼容证据和状态映射形成最小设计。
- [x] 同路径覆盖缓存矩阵转为按需诊断，不作为当前出口条件。
- [x] 当前版本首帧时序转为按需诊断，不作为当前出口条件。

Phase 0 已关闭，Phase 1 的低风险兼容吸收也已完成。Fingerprint helper 与预览兼容 patch 默认不实施；只有本项目自己的运行证据证明有必要时才重新立项。

## Phase 1 低风险吸纳进度

已完成的实现保持在现有运行边界内：

- 自定义节点扫描同时记录包版本和独立 Git revision；版本未知会显示为黄色“待确认”，不会把磁盘上已存在的节点直接判为缺失。
- Catalog 支持兼容性证据与已知坏版本/提交范围字段；当前 ComfyUI 核心已登记 `bdcb886` 的 H3 Cache 风险为非阻断警告。
- 设置页显示核心兼容状态、风险提示、节点 revision 和兼容性状态；版本低于最低要求才进入错误态。
- H3 预览事件把来源、Step、总 Step 和序列号传到任务预览边界；普通 ComfyUI 预览与 KJ TAE 预览不再共享不可区分的消息形状。
- Prompt Writer 更新会识别本程序兼容补丁并比较上游 HEAD；上游未变化时复用当前目录，上游变化时才安全备份、替换和重放补丁。
- 节点批次重启后会复检 Prompt Writer `/status`、`/models`、GGUF diagnostics 和共享 llama-cpp-python；成功探针作为中性运行证据，不再误显示为兼容性待确认。
- 未引入 Fingerprint helper、全局 patch、缓存替换或新的工作流事实源。

这些改动属于“学习后的小范围吸收”，不代表参考项目的缓存、预览或运行策略已经整体迁移。`npm.cmd run verify` 已通过（64 个测试文件、477 个测试）；本轮没有真实 GPU smoke 结果。Audio Drive 的时长预检仍属于未来能力，因为本项目当前没有对应的产品工作流和输入模型；不以参考项目的存在提前暴露该选项。
