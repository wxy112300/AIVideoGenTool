# Phase 1 Handoff: H3 统一保存与产物关联

- 类型：HANDOFF / 有界实施工作包
- 日期：2026-09-19
- 权威状态与总任务：[TASK.md](TASK.md)
- 执行者：用户另开的 Luna session；本阶段禁止再派子 agent。
- 当前交接状态：accepted-with-scope，2026-09-19按用户明确决定结束Phase 1返修交接，转入Phase 2；不是全部真实运行门禁通过。
- 接收范围：T1/T3已关闭；普通I2V真实视频/AV/manifest/History已复核，用户首轮Extend完成且新段/再次草稿的记录对应正确。T2仍是部分证据，具体事实、未验证项及Phase 2/3/4归属以 [TASK当前接收范围](TASK.md#当前接收范围与结转) 为准。
- 后续执行入口：[Phase 2 Handoff](HANDOFF_PHASE_2.md)，ready-for-implementation；本文件不再承担新阶段派发。

> 本文件转为Phase 1实施与验收历史。下文“changes-requested”“Phase 2关闭”“当前唯一剩余工作”等是当时记录，均由上方接收状态和TASK当前入口取代；不要继续按旧门禁反复派发Phase 1。既有产品不变量与已验证行为仍必须保留。

> 2026-09-19 用户 UI 纠正：保留原有下拉选框设计，只提供“保存 / 不保存”两项，不使用 checkbox 或 toggle，说明收进可访问的提示 icon。此前交接把二元语义写成“开关”，表述有误。历史实施中的选项title/data-description不是用户额外要求，不作为新的两层提示验收门槛；Phase 2以其工作包D节为准。

> 前置 [latent可行性核查](HANDOFF_LATENT_FEASIBILITY.md) 已 accepted-with-scope。共享的是同一次实际采样的原始AV，不是所有消费者的完整运行状态。保留普通AV与官方Run两种owner合同；Native二采是派生产物；Motion writer替换必须通过第6.4节兼容门禁。研究探针未覆盖生产提交链，不能替代本阶段测试。

## 1. 先读这一页

用户要的是：所有 H3 视频创作只选择一次“保存 latent 数据”，产物有真实 AV 和必要元数据，并且准确关联到输出版本。后续从 History 继续创作时，应用自动选择消费者需要的数据，不让用户分别寻找 JointAV、Motion Context 缓存和 Continuum 文件。

**本阶段完成生产侧：保存设置、实际输出、校验、版本关联，并保住被替换writer的既有Motion读取入口。** 不承诺所有消费者已接通。不得把capability、路径存在或绿色提示当成实际消费成功；不得以“消费属于后续阶段”为理由破坏当前可用路径。

前置研究通过后的实现方向有四个阶段，本文件只授权 Phase 1：

1. 统一保存与产物关联。本文件。
2. History 文件管理与继续创作到持久化 Extend 草稿。
3. 接通 Motion Context / Continuum 消费、正式入口和提交预检，保留 FL2VA。
4. 端到端、旧数据、重启、音画与指令效果验收。

2026-09-19 阶段澄清：当前可实测的是Phase 1的生产保存与原有路径兼容，不代表Phase 2/3的新History自动交接和消费者流程已经就绪。不能把一条I2V产物通过当成让用户验收完整续写的指令，也不把后续阶段尚未实现的新能力设为Phase 1必须提前实现的门槛。用户遇到的379/362帧拒绝已定位为bootstrap草稿与managed文件名导致的页面预算误判；交接方已做局部预检修复，81项测试及typecheck通过，具体证据与未验证边界见 [TASK.md](TASK.md)。无需重做已通过的保存检查或为此再次提交GPU。

这里的新 Phase 1 不等于 [TASK.md](TASK.md) 后半部分早期“Phase 0–6”中的 Phase 1。早期阶段记录仅供了解已有实现，不是本次任务清单。

## 2. 范围与明确不做

### 必须覆盖

- 当前产品已支持的 H3 视频生成路径：T2V、I2V/FL2VA、R2V。
- 当前产品已支持的 H3 Extend 路径：普通 I2V/FL2VA 边界续写、R2V/Motion Context、Continuum 兼容导入、managed Continuum。
- 上述路径的保存开/关、持久化草稿、入队冻结、执行产物、完成入史。
- 不同工作流的真实 latent 范围：完整独立生成、新增续写段、managed physical chunk。不能统一写成“整条成片”。
- 已存在的旧四档保存模式、旧布尔值、旧队列及 History 的读取兼容。

### 本阶段禁止扩展

- 不修Motion工作流自动选择、不做跨模型统一消费路由；仍属Phase 3。第6.4节既有文件字段的兼容投影及其检查是writer替换前置条件，不是新增通用消费框架。
- 不改 History 布局、文件删除/GC、共享引用删除策略；属于 Phase 2。
- 不做 History 到 Extend 的素材自动带入、模型切换消费、首次 managed Run UI；分别属于 Phase 2/3。
- 不接 latent upscale，不重写 Take/branch identity，不做上游跨 revision 去重。
- 不升级 Continuum/Motion Context，不修改用户安装的上游 Python 源码，不换模型/采样器/attention/precision/VAE/cache 策略。
- 不重新编码 MP4 来伪造生成时 latent，不把普通 AV 注册成 official Run，不把单段 AV 标成累计成片 AV。
- 不清理旧数据，不改真实用户历史状态，不 commit/push、reset、stash、批量覆盖工作树或发布应用版本。

T2V 是覆盖已有图的保存路径，不是授权新增产品模式。如果某个名称在当前 catalog 中没有独立生产入口，指出它实际对应的现有图，不要顺带增加入口。

## 3. 已确认的基线，不要重新调查一遍

| 事实 | 入口 | 对本阶段的含义 |
| --- | --- | --- |
| 已有四档 `all / joint-av / motion-context / none` | [h3-latent-save.ts](../../../src/core/h3-latent-save.ts) | 不新增第二套保存偏好；收敛新 UI，保留旧值解释 |
| 保存偏好已冻结到生成和续写任务 | [queue-task-factory.ts](../../../src/core/queue-task-factory.ts) | 在现有 factory 补齐，不能在执行时读取最新草稿代替 task |
| 原 Create 使用四档 select，首轮实现误改为 checkbox | [page.ts](../../../src/renderer/pages/create/page.ts)、[page-controller.ts](../../../src/renderer/pages/create/page-controller.ts)、[view-model.ts](../../../src/renderer/pages/create/view-model.ts) | 恢复原有下拉设计，仅收敛为保存/不保存两项；不大改 Create 页 |
| graph 已按模式移除 serializer / Motion 保存节点 | [workflow.ts](../../../src/core/workflow.ts) | 先读 `renderWorkflow` 中输出节点处理，不要再在旁边堆第二套分支 |
| submit 已能查找/挂接唯一 JointAV serializer，managed 明确排除 | [comfy-ui.ts](../../../electron/services/comfy-ui.ts) | 不可仅改 bundled JSON 而漏掉动态挂接；保持 managed 排除 |
| 原 Native AV 收集器已有校验与 manifest | [native-av-artifact.ts](../../../electron/services/native-av-artifact.ts) | 复用真实校验和元数据，不能用假 hash 或图模板代替输出事实 |
| 已有 `H3AvLatentAsset`、producer、owner、alias、capability 和 validator | [types.ts](../../../src/types.ts)、[h3-av-asset.ts](../../../src/core/h3-av-asset.ts) | 复用现有统一模型，不另造 UniversalLatent/AssetManager |
| registry 当前面向 managed receipt | [h3-continuum-asset-registry.ts](../../../electron/services/h3-continuum-asset-registry.ts) | 普通 AV 不能伪造 receipt 来调用 managed 注册；可提取最小共同校验能力 |
| History 当前统一 AV 字段来自 managed 结果 | [queue-history.ts](../../../electron/queue-history.ts) | 必须补生成与续写两条入史分支，而不是只给 Extend 打标签 |
| collector 已从规范文件名提取 artifact ID | [h3-native-av-collector.ts](../../../electron/services/h3-native-av-collector.ts) 的 `commitCompletion` | 正常规范路径可原位提交；不要误判所有旧实现都在复制 |
| `commitProducedFile` 的非规范源路径存在 copy 分支 | [native-av-artifact.ts](../../../electron/services/native-av-artifact.ts) | 新 shared 路径必须验证不会落入该分支；不删除旧调用兼容行为 |
| adapter 声明不代表消费者已接通 | [h3-av-adapters.ts](../../../src/core/h3-av-adapters.ts) | 本阶段不把“生产侧完成”写成“三种消费均完成” |

上游协议的已核对事实见 [SOURCE_CONTRACT_MATRIX.md](SOURCE_CONTRACT_MATRIX.md)。managed Continue/Retry 的真实成功记录、失败 Take 和物理复制限制见 [TASK.md](TASK.md) 的当前结论。没有相关输入变化时，不重复这些 GPU 实验。

前置研究已证明格式层可共享，未证明所有变体的sampler出口均为相同clean语义。当前FL2VA Extend的collector可写context=0，Native预检也未按segment role一概拒绝；不能据此给它加upscale支持，也不能顺便收紧旧行为。Managed raw chunk末端与assembly后成片末端可能不同，不能按“取最后chunk”自动声称Motion续写可用。上述未知项按本阶段生产范围记录，不要求提前实现低优先级upscale。

## 4. 保存语义

### 新 UI

- 保留原有 `保存 latent 数据` 下拉选框（select）的设计、位置、尺寸、对齐和样式，只提供“保存 / 不保存”两项。二元是选项语义，不是改成 checkbox 或 toggle；恢复首轮误改的控件，不重排 Create/Extend 页面。
- 不显示格式列表，不分别提供 JointAV 和 Motion Context 保存控件。整体保存说明、影响及 managed 必需保存理由放在邻近提示 icon 的 tooltip 中；“保存/不保存”选项保留各自 tooltip/data-description，不在控件旁或下面常驻长提示、不新增说明卡片。
- 复用现有 icon/tooltip 样式；icon 有可访问名称，可通过悬停、键盘聚焦及点击/触摸查看说明。下拉禁用时提示 icon 仍可操作，不能仅把说明放在禁用 select 的 title 上。
- 默认保持当前“保存”的行为。切换模型不重置用户选择。
- UI 可以仍使用已有 `h3LatentSaveMode` 表达新选择：“保存”为 `all`，“不保存”为 `none`。不要直接从 TypeScript 联合类型和 normalize 中删除旧两档。
- 旧草稿经现有兼容规则归一后：`all / joint-av / motion-context` 均显示“保存”，`none` 显示“不保存”。UI 不因初次渲染就重写旧对象；新入队才按新生产策略生成快照。
- `h3SaveJointAv` 只作为兼容镜像，不成为第二个独立决策源。新写入时两字段一致；旧字段冲突继续由现有兼容规则解释。
- 仅在 H3 视频相关 composer 显示。图片工作台、非 H3、upscale 不加入本阶段保存控件。

### managed Continuum 例外

managed 的 `Save + Auto Resume` 是执行协议，不是可选 sidecar；关闭它会改变工作流性质。

- managed 模式下同一下拉框显示“保存”且禁用，不允许选“不保存”；“此模式必须保存 Run 数据”只放在提示 icon 中，icon 不随下拉框禁用。不要伪装成用户关闭成功。
- 不覆盖用户在普通 H3 模式下记住的选择，切回普通模式时恢复原选择。
- 后端即使收到保存为关的 managed task，也仍按 managed 协议保存必需 Run，不增加可选 serializer，不改成兼容路径。产物真实反映 Run 已保存，不报告 disabled。
- owner 仍是官方 Run Storage 的真实 chunk 文件；应用只保存资产描述及引用。不能为了外观统一再写一套 payload。

### 旧任务兼容

UI 的两态与旧执行语义必须分开。不能全局把旧 `joint-av` / `motion-context` 改成 `all`，否则重启、重试时旧任务会改行为。按第6节明确区分新旧生产策略，不允许执行者自行发起全库迁移。

特别注意：当前 `normalizeH3LatentSaveMode("all", false, ...)` 会按旧形状解释，R2V Extend 还可能归一为 `motion-context`。先用现有函数解释旧输入，再将新提交意图映射成 `all / none`，不要直接比较未经归一的旧字符串。

## 5. 产物不变量

1. 保存开启的新普通 H3 任务，每个实际 AV 产物只写一个自有 payload；同一组 video/audio tensor 不由两个保存节点各写一次。
2. 一份 AV 包含真实 video/audio tensors，配套必要元数据。保持 dtype 和内容，不为“通用”而转码、裁剪、降精度。
3. hash、bytes、shape、geometry 来自实际文件和已验证任务/节点证据；缺失或矛盾时不能宣称 available。
4. 记录 workflow、模型、producer 版本、task/version 身份和范围。用户端 MP4 时长不能直接当 latent 帧数，接续保护前缀也不能丢失语义。
5. 延伸任务的新增段 latent 与源视频+新增段的最终 MP4 不一定等长；managed 最后一个 chunk 也不是累计 MP4 的完整 latent。
6. manifest 和 payload 必须属于同一次输出；失败、取消、serializer 缺失不得沿用输入/父版本的资产冒充新输出。
7. 在校验和必要元数据提交完成之前，History 不得出现 available 的半成品引用；重试不得覆写已经 accepted 的旧产物。
8. `ownerPath` 是唯一内容 owner，alias 不是额外真实内容。允许新增小型 manifest/index，不允许用隐式 payload copy 达到“通用”。硬链接不可用时直接引用 owner；若某协议确实必须复制，停止并报告，不自动放宽。
9. output root 按现有解析服务求得，不能直接假设设置中的视频目录就是 Comfy 输出根；禁止硬编码本机路径。
10. 资产能力由经过核对的内容/来源决定，不能给所有 AV 无条件加上 `native-av` 或 `continuum-managed-chunk`。消费者是否完成生产接线属于另一个问题。

11. “单份”按每个实际采样产物计数，不按整条拼接MP4计数。1080p first-pass与second-pass、Native learned变换后的AV、Run内不同chunk可有各自owner，它们不是同一组tensor的重复副本；保留真实派生关系，不能覆盖输入来凑单文件。

## 6. 本阶段允许的兼容设计

以下设计已按前置研究收窄，可在本阶段实施。新的实际反例仍应触发停止条件，不强行适配；不得扩大存储迁移或消费者产品范围。

### 6.1 新旧任务区分

- 在 H3 generation/extension 任务快照及对应 AssetVersion 中增加可选 `h3AvOutputPolicy?: "shared"`。字段表示生产协议，不是第二个保存开关。不要增加第二个 boolean 偏好。
- 没有字段：旧任务，继续使用原四档行为。已持久化 waiting/failed/cancelled 任务的加载、reset、自动恢复、duplicate 不得自动加标记或改变模式。
- 新的用户入队：factory 写入 `shared`；普通 H3 将归一后的保存意图写成 `all / none` 并同步旧 boolean。managed 的执行快照写为必需保存，但不覆盖草稿中普通模式的选择。
- 不给非 H3、图片、独立 upscale 任务加该标记。1080p Create 的既有内部阶段要继承所属新任务的策略，不能因内部 taskType 改变而丢失标记；独立 latent upscale 不因此扩大范围。
- store 只保留/校验有标记的新记录，不给没有字段的旧记录补默认值。新旧任务都用冻结快照执行，不能读取当前 draft 决定是否保存。
- 同一个归一/新任务选择函数供 Create view-model、enqueue 验证和 factory 使用。否则旧 `motion-context` 草稿显示为开，但 enqueue 仍按“未保存 JointAV”拒绝1080p，前后会矛盾。

| 记录 | 保存值 | 预期执行 |
| --- | --- | --- |
| 无 policy 的旧任务 | 任意原四档 / 旧 boolean | 原有行为，不迁移 |
| shared 普通任务 | all | 一个 canonical AV 输出，收集并关联 |
| shared 普通任务 | none | 不保存可选 AV；不得从源版本继承输出资产 |
| 新入队时遇旧 joint-av / motion-context 草稿 | 经旧规则归一后不是 none | 新任务落成 shared + all，旧草稿不被无故重写 |
| managed，不论草稿意图 | Run 必需保存 | 真实官方 chunk + receipt + 资产引用，无第二个 serializer |
| 不合法/未知 policy 值 | 不受支持 | 显式校验失败，不静默选择 shared |

1080p Create 仍依赖内部 AV 阶段。本阶段不解除它当前“关闭保存就不能选择/提交1080p”的限制，不把该优化夹进统一保存。

### 6.2 统一资产的最小元数据补充

复用 `H3AvLatentAsset`，保留现有 schemaVersion 和旧记录的读取。允许以下可选增量字段，不另造资产类型：

- `sampleScope?: "generated-clip" | "extension-segment" | "continuum-chunk"`。
- `artifactRole?: NativeAvArtifactRole`，沿用 `first-pass-clean-av / final-clean-av / extend-segment-clean-av` 的已有含义。
- `contextFrames?: number`，来自真实生产协议/已验证 Native manifest，不从最终 MP4 时长推测。

新普通 AV 必须填写上述适用事实；新 managed 填 `continuum-chunk`，真实 role/context 没有独立证据时保留缺失并引用原 receipt，不能猜为 final-clean-av 或 0。validator 对已出现的字段做严格校验；旧记录缺字段仍可读，不能回填猜测。`sampleScope` 是采样产物范围，不是最终拼接成片范围。

- 普通新产物用 `app-canonical`，不是 `legacy-joint-av`，不带 `continuumChunk`。
- managed 仍用 `continuum-run-chunk` 和实际 pointer。继续使用原 sequence/receipt 契约，不重建官方 manifest。
- 真实 tensor hash、范围解析应复用/提取 registry 与 Native 服务的现有实现；最多新增一个有明确职责的共享文件，不在两个服务各复制一套 safetensors parser。
- 保留普通产物的 `h3ContinuationData` 作为当前兼容消费者入口；其 artifact 和统一 `h3AvAsset` 必须指向同一 payload、同一 hash 和几何，不再另存一份兼容 payload。
- `native-av`仅表示经验证的Native AV读取合同，不是upscale就绪。保留现有模型/context/几何/conditioning等预检，不新增“所有segment都不支持”的猜测规则。Motion capability需真实loader及上下文合同证据；legacy bootstrap需真实state/transport条件，managed capability只能来自有效Run。已有旧资产能力不批量重算；未证实的新来源不赋能力，格式可读不升级成生成/质量已验证。
- `producer.sourceTaskId` 指向本次产物任务；已有 `sourceVersionId` 的来源语义不得偷换成新输出版本 ID。输出归属由持有资产的真实 AssetVersion 建立，不能为 manifest/sequence 再造第二个输出版本 ID。

### 6.3 文件与结果合同

- 普通 AV 沿用现有 `h3-native-av/h3av_<artifactId>.safetensors` 与配套 manifest 约定，规范 filename 中的 ID 由 collector 读取。优先复用这个已工作的原位路径，不另外发明命名。
- 新 shared 路径必须先验证规范路径/descriptor，确保 `sourcePath === payloadPath` 后原位提交；不要把检查放在复制完毕之后。不规范输出可以明确报保存失败，不能悄悄 copy 再称单份。
- asset 描述可复用现有 registry 的小型 manifest/index 写法。兼容 manifest 和资产索引两份小型 JSON 不算两份 AV；禁止重构/迁移已有目录来追求名字统一。
- 新完成结果允许添加通用 `h3AvAsset?: H3AvLatentAsset`，贯穿 executor、side effects、History。已有内部 `h3ContinuumAsset` 可保留为 managed 兼容输入，统一归一时保证同一个对象/身份，不能两份互相矛盾。
- generation 与 extension 的最终 AssetVersion 都要接收经过校验的资产；不只写 HistoryAsset 顶层，不只写 task 临时字段。
- 本版本相关 payload 和必要 manifest/index 的 `HistoryFile` 引用应可从该版本取回，按路径去重，包含真实大小和可解析路径。复用已有 `files` 和 `h3ContinuationData.artifact`，不要让后续 UI 靠字符串拼接猜文件位置。
- 源输入 asset、旧 queue 快照和旧 History 版本只读。保存关的任务不继承上一条产物；保存失败不将输入 AV 包装成新 AV。
- 可选保存失败时保留可用 MP4 和明确的 `missing / invalid / save-failed` 状态及原因，不发布假的 `h3AvAsset`，不删除成片。1080p 内部必需 AV 或 managed receipt 失败仍按原硬依赖失败处理，不能退化成普通成功。

### 6.4 Motion writer替换门禁

先证明替代可用，再在新shared任务中移除旧writer。旧任务、旧slot文件、显式输入路径和已有History不改。前置研究只证明Motion loader能读video/audio，不能据此先删writer、丢掉原路径，再把回归留到Phase 3。

1. 保存同一个sampler AV到自有canonical owner，保留完整video/audio、dtype和时间范围。用实际Motion loader读取该输出，并对同源tensor执行真实 `MotionContext.apply`，确认取尾部的值/索引、音频范围与原writer一致；不得只检查两个key或文件存在。覆盖将要启用的dtype，不把F32探针推广成BF16已验证。
2. 将已提交owner投影到现有输出文件引用/`h3ContextLatentPath`所依赖的完成链字段，保留当前History到续写的字段传递，指向该版本的精确文件而非目录/最新slot。只补这条兼容投影，不建设跨模型自动选择。显式文件路径在clip_index>0时可被旧loader读取，clip_index=0仍表示无上下文，不复制成slot文件。
3. 测试一次新输出到下一任务的冻结路径；测试重复运行/重试、选旧版本、取消、保存关闭/失败，保证不覆写旧owner、不读到上一次失败或最新目录slot、不把输入asset冒充新输出。旧无policy任务仍按旧保存协议执行。
4. 完成以上检查后才移除shared图中的旧可选Motion writer，并让完成链从唯一canonical输出取得结果。最终同一AV只保留一个writer；不能以临时双写作为已完成交付。
5. 若最小兼容投影无法通过，而必须重构Phase 3的消费者才能继续，停止该替换、保留旧路径并标blocked；不得以双份payload或缺失旧功能声称Phase 1已完成。阶段内可以先完成其他独立部分，不自动解除验收门禁。

这是替换既有生产出口必须承担的兼容工作，不包括修复“请先选择视频续写API工作流”、managed到Motion切换、通用资产路由或Native新入口。

## 7. 逐步实施，不跳步

每一步是同一 Luna session 内的检查点，不是新的子 agent 或新 handoff。先做最小改动并跑相应测试，失败先修本步骤。

### A. 建立本轮基线与兼容测试

1. 读根 [AGENTS.md](../../../AGENTS.md)、本文件、[TASK.md](TASK.md) 当前摘要，以及 [CHANGE_VERIFICATION.md](../../CHANGE_VERIFICATION.md) 相关条目。不遍历旧计划、不重新调查已确认上游历史。
2. `git status --short`，检查将要编辑文件的现有 diff。当前工作树有大量既有修改和未跟踪文件，这是正常基线，不准清空、强制还原或要求用户先提交。
3. 在回填区记录本轮涉及的文件/symbol 与哪些原改动必须保留。不要用 Git SHA、ahead/behind 或无关 dirty 文件作停止条件。
4. 先补旧四档、旧 boolean、R2V 旧默认、新 policy、草稿与队列冻结的断言，再实现第6.1节。用 [store.test.ts](../../../tests/store.test.ts)、[queue-services.test.ts](../../../tests/queue-services.test.ts)、[create-enqueue.test.ts](../../../tests/create-enqueue.test.ts) 的现有 fixtures。

**本步完成条件：**新入队 shared + all/none；无 policy 的旧任务加载/重试保持原样；draft 后改不影响已入队 snapshot。没有完成不要继续改节点。

### B. 明确各工作流的唯一生产出口

先将下面表格复制到回填区，填写“实际启用图 / 生产节点与 socket / 保存范围 / 验证结果”。以 catalog 和渲染后的 API graph 为准；文件存在不代表当前产品正在使用。

| 工作流族 | 起点 | 本阶段要求 |
| --- | --- | --- |
| T2V | [minimax_h3_t2va_api.json](../../../workflows/minimax_h3_t2va_api.json)；同目录已启用 Turbo/GGUF 变体 | 开保存时唯一真实 joint AV 出口；关保存时无可选 writer |
| I2V / FL2VA | [minimax_h3_i2v_api.json](../../../workflows/minimax_h3_i2v_api.json)、[minimax_h3_fl2va_first_pass_av_api.json](../../../workflows/minimax_h3_fl2va_first_pass_av_api.json) | 正确标记 producer 与 role；覆盖实际启用变体 |
| R2V 生成 | [minimax_h3_r2v_api.json](../../../workflows/minimax_h3_r2v_api.json) | 不能只修 I2V；确认 video 与 audio 均来自本次输出 |
| I2V / FL2VA Extend | 现有 extension task 与 FL2VA 生成图 | 标记新增采样段，而不是最终源+段 MP4；不改拼接/裁切 |
| R2V / Motion Extend | [minimax_h3_r2v_extend_api.json](../../../workflows/minimax_h3_r2v_extend_api.json) | 第6.4节门禁通过后shared只留一个自有writer，旧task仍保留旧路径 |
| Continuum 兼容 | [minimax_h3_continuum_v38_extend_api.json](../../../workflows/minimax_h3_continuum_v38_extend_api.json)；仍启用的旧兼容图 | 保持 diagnostics 和 fresh-fallback 防护，保存真实新段 AV |
| managed Continuum | [minimax_h3_continuum_v38_managed_extend_api.json](../../../workflows/minimax_h3_continuum_v38_managed_extend_api.json) | 不新增 writer，沿用官方 owner 与 receipt |
| 1080p Create 内部阶段 | 现有 first-pass + learned second-sampling 路径 | 必需中间产物照常工作；最终引用实际对应阶段，不把 first-pass 标成最终1080p AV |

具体操作：

1. 从 [workflow.ts](../../../src/core/workflow.ts) 的输出节点筛选、`attachH3JointAvSerializer` 和 [comfy-ui.ts](../../../electron/services/comfy-ui.ts) 的 `shouldAttachH3JointAvSerializer` 入手，统一决定 writer 数量。不要只改一个 JSON。
2. 已有自有 `LocalVideoStudioH3SaveJointAV` 能表示该族 AV 时继续使用。需要修改 Python 时加载适用的 Python fact-grounded skill，读 [nodes.py](../../../comfy_nodes/LocalVideoStudio-H3/nodes.py) 对应类和实际选定环境的 schema，不凭类名猜 input/output。
3. Motion图目前 `MiniMaxH3MotionContextSaveLatent` 接sampler输出。先按第6.4节验证canonical输出和路径投影，再在shared新任务中替换；不改conditioning、trim、VAE算法或旧输入选择。需要C步骤完成链时作为同一个替换检查点处理，不把中途失去消费者的状态交付。
4. 逐图证明video/audio来自同次实际sampler的正确输出socket，说明是否clean、是否带prefix以及哪些mask/scaling信息是消费必需。不能仅按 `LATENT` 名字、同shape或可unbind认定相同。自有writer无法表示某个必需字段时报告反例，不丢字段再标通用；不重新采样/编码来适配。
5. shared + none 同时移除自有可选 writer 和 Motion 可选保存，不移除本次执行必需的中间缓存/官方 Run，也不清掉已有输入 `h3ContextLatentPath`。
6. 若删除一个节点，检查 graph 是否还有引用它的边；不能留下 dangling edge。保存操作不能改变最终解码路径的 tensor 值。
7. 如果修改自有节点的行为/schema，更新 bundled node VERSION 与 catalog 对应修订，走现有安装/重载路径，保留旧节点读入口。不要升级第三方包或改应用 package 版本。

**本步完成条件：**实际启用图开/关tests通过；ordinary shared开一个自有writer、关为0；managed只有官方存储；旧图行为不变。Motion替换须连同C步骤兼容投影通过，不能把它作为Phase 3缺口；其他尚未接通消费者如实记录。

### C. 校验、登记并贯穿完成链

按下面顺序逐跳确认，不要把所有逻辑塞进 composition root：

`serializer descriptor -> H3NativeAvArtifactCollector -> NativeAvArtifactService / 共享校验 -> queue executor -> QueueExecutionSideEffects -> persistVideoHistoryResult -> AssetVersion`

1. [h3-native-av-collector.ts](../../../electron/services/h3-native-av-collector.ts)：只接受本 prompt、预期节点的唯一 descriptor；复用规范 filename 的 artifact ID 提取。metadata 来自 frozen task 和实际产物。
2. [native-av-artifact.ts](../../../electron/services/native-av-artifact.ts)：保留有限 header 读取、流式 hash、几何/网格/文件变化检测和原子 manifest；shared 加上明确的原位提交约束。测试中断言 payload copy/write 调用为0，而不是仅断言 JSON 中写了“single”。
3. [h3-continuum-asset-registry.ts](../../../electron/services/h3-continuum-asset-registry.ts)：复用公共 tensor digest/安全路径能力，普通 AV 不走 `registerManagedReceipt`。如需要独立普通注册方法，参数用真实产物与 producer 元数据，不造上游 receipt。
4. [queue-executor.ts](../../../electron/queue-executor.ts)：shared 路径不再依赖被移除的旧 Motion 保存文件确认成功；旧路径保留原收集。不能把取消、missing、save-failed 转成 available。
5. [queue-execution-side-effects.ts](../../../electron/services/queue-execution-side-effects.ts) 和 [queue-service.ts](../../../electron/services/queue-service.ts)：新增结果/依赖逐层转发并加测试。此前已经发生过只在 runtime 接线、QueueService 漏转发的错误。
6. [application-runtime.ts](../../../electron/application-runtime.ts)：只负责注入新服务或方法，不承载文件解析、writer 选择、资产归一逻辑。
7. [queue-history.ts](../../../electron/queue-history.ts)：生成与续写两条分支都给本次真实 AssetVersion 关联新资产及文件。managed 原版本/head 的一致性必须保留。
8. 新shared Motion输出必须完成第6.4节的旧字段兼容投影，使现有路径能取回该版本canonical文件；不能只留 `h3AvAsset` 而让现有入口失去数据。旧任务/History字段保留，不新增并行路径管理框架。

**本步完成条件：**真实文件可通过现有校验；新普通版本包含 Native 兼容引用和统一资产，二者同 owner/hash；managed仍指官方owner；关/失败/取消无伪资产；完整链通过，不仅测试纯 helper。

### D. 恢复两项保存下拉框

1. 将首轮误改的checkbox恢复为既有样式的select，仅“保存 / 不保存”两项；只改既有保存控件及绑定/view-model，按第4节实现普通和 managed 两种显示状态。change绑定读取select.value，不保留checkbox.checked逻辑。
2. 用新任务归一函数处理保存意图，保持新/旧字段一致；不改 `normalizeH3LatentSaveMode` 的历史解释来迁就 UI。
3. managed 切换过程不把普通模式的关改成开。草稿自动保存、模式返回、重启恢复分别测。
4. 1080p 的已有约束与 `resolutionAfterJointAvPreference` 保留，不静默开放原先不支持的模式。
5. 新文案进入现有 zh-CN / zh-TW / en-US 资源和 keys。下拉及提示icon必须有可访问名称，说明统一放入tooltip，支持hover/focus/click；managed下拉禁用时icon仍可读取必需保存理由。
6. 不改 History Continuum 区域的位置，不新增大说明卡片，不动提示词增强或其他创建控件。

**本步完成条件：**所有 H3 视频 composer 保留同一既有设计的两项保存下拉框，没有checkbox/toggle或常驻说明；普通模式保留用户选择；managed显示“保存”且禁用、提示icon可用；焦点、连续输入、undo/redo、提交行为未回归。

## 8. 文件边界与实现约束

- 常规可写：上文列出的 core、相关 types/default/store、保存节点与实际受影响的 bundled workflow、完成链、Create 保存控件、对应 locale、邻近 tests。
- 仅在自有节点发生变化时改依赖 catalog/VERSION；仅在需要接线时改 runtime/queue-service。不要因为名单出现就全部修改。
- 可新增至多一个生产共享 helper/service，用于真正重复的 AV 文件校验/登记；优先扩展合适的已有文件。不增加第二个资产管理框架。
- 保持现在已有的 TS/JS 对应文件同步，仅同步本轮触及且本来存在的 `.js`。不要全目录重新生成并提交无关变化。必要时用 `npx.cmd tsc -p tsconfig.json --outDir temp/h3-shared-av-compiled` 生成后选择性比较/复制。
- 不从较旧 commit、旧计划或 prototype 还原当前工作树。当前源文件是编辑基线，历史记录不是覆盖授权。
- docs 只更新本文件回填区、[TASK.md](TASK.md) 当前交接状态和必要契约/Unreleased 说明。既有契约确有变化才改相应段落；不另建总计划，不重写整个任务历史。
- 功能覆盖扩展按 minor 影响记录，但本工作包不发布、不 bump 应用 package/lockfile、不创建 commit/tag。自有节点版本跟随实际节点修改，不能只改版本号。

## 9. 验证矩阵与命令

不能以“编译过了”替代以下行为测试。优先扩展现有测试文件，不为每个表格行建新文件。

### 9.1 自动化必须覆盖

| 检查 | 必须证明的结果 | 首选现有测试 |
| --- | --- | --- |
| 保存意图与旧值 | 普通二态、旧四档/boolean、冲突字段、R2V旧默认、新policy/缺policy | [store.test.ts](../../../tests/store.test.ts)、[create-enqueue.test.ts](../../../tests/create-enqueue.test.ts) |
| 冻结与恢复 | 入队后切换草稿无影响；旧任务加载/reset/duplicate不改变保存协议 | [queue-services.test.ts](../../../tests/queue-services.test.ts)、store tests |
| 所有启用工作流族 | 开关后的 writer数、正确 AV 输出边、无悬空引用、旧任务图保持 | [workflow.test.ts](../../../tests/workflow.test.ts)、[h3-workflow-contract.test.ts](../../../tests/h3-workflow-contract.test.ts)、[comfy-ui.test.ts](../../../tests/comfy-ui.test.ts) |
| collector绑定 | 错节点/空/多文件拒绝；当前prompt descriptor；规范ID复用 | [h3-native-av-collector.test.ts](../../../tests/h3-native-av-collector.test.ts) |
| 文件提交 | hash/shape/geometry/上下文/越界/变化检测；shared无copy；原子manifest失败 | [native-av-artifact.test.ts](../../../tests/native-av-artifact.test.ts)、[h3-av-domain.test.ts](../../../tests/h3-av-domain.test.ts) |
| History完成链 | generation与extension都关联正确版本；父资产不变；disabled/missing/失败/取消不继承 | [queue-services.test.ts](../../../tests/queue-services.test.ts)、[history-services.test.ts](../../../tests/history-services.test.ts) |
| Motion替换兼容 | 同owner真实loader/apply值和范围；现有路径传到下一任务；旧版本/重试/取消/off不读错文件；不双写 | 上述完成链tests、[history-actions.test.ts](../../../tests/history-actions.test.ts)、[create-enqueue.test.ts](../../../tests/create-enqueue.test.ts)及小型真实节点CPU检查 |
| managed保护 | 官方owner、receipt、Retry原文/Auto/head、无额外serializer | [h3-continuum-managed.test.ts](../../../tests/h3-continuum-managed.test.ts) |
| UI | select仅保存/不保存两项，无checkbox/toggle；说明仅在可交互icon中；managed显示保存且禁用、icon可用；切换不丢偏好、自动保存与1080限制 | 现有 create tests；必要时扩展邻近 renderer fixture |

按步骤选择最窄的一组跑，下面是最终 focused 集合，不要求每改一行就全跑：

```powershell
npx.cmd vitest run --config vite.config.ts tests/store.test.ts tests/create-enqueue.test.ts tests/workflow.test.ts tests/h3-workflow-contract.test.ts tests/comfy-ui.test.ts tests/h3-native-av-collector.test.ts tests/native-av-artifact.test.ts tests/h3-av-domain.test.ts tests/queue-services.test.ts tests/history-services.test.ts tests/history-actions.test.ts tests/h3-continuum-managed.test.ts --reporter=dot
npm.cmd run verify
git diff --check
```

`verify` 已含 typecheck、全量测试、clean build 和对比度；最终同一文件状态通过后不要为了换执行者再次重跑。Python 有修改时，用**所选 ComfyUI 环境的解释器**运行语法与相关小型 tensor 测试，不用 PATH 中未经确认的 python 冒充生产环境。严禁通过删断言、放宽 hash/维度校验或写假 receipt 让测试通过。

### 9.2 真实产物与成本边界

1. 复用前置研究已通过的格式证据，补本阶段变更所需的真实提交链和Motion第6.4节检查；不把手工manifest当成生产提交验证。需重跑探针时使用新的独有temp目录，不删除/覆写原证据；小tensor读取不是采样验收。
2. 真实短片原则上覆盖四类有区别的生产链：普通生成、R2V生成、Motion Extend、Continuum兼容 Extend。使用最低受支持的短时长和普通480p配置，保持用户已选 runtime 策略，不以关闭 Sage/Spectrum 或切换 Python/core 绕过错误。
3. T2V/I2V 变体全部要有 graph 覆盖。只有证明 serializer输入/输出结构相同的变体才可共用一份 GPU 样本；回填哪些共用、为什么成立。1080p内部 AV 若实际生产路径改变，需要专门运行证据，不能借480p证明。
4. managed 保存路径未变时复用已有真实 Run/receipt 做只读回归；如果改了其实际生产/注册语义，则必须补相应真实运行。不能因为已有15秒×3成功就覆盖本轮变化。
5. 每条真实运行必须回填 prompt/task ID、工作流族、节点版本、产物数量/相对路径、hash/bytes/shape、角色/范围、对应 History version、是否发生copy。日志摘要不含用户完整提示词。
6. 开始 GPU 前列出最多4次计划的新采样；失败允许一次同问题的局部修正重试，总新提交上限6次。既有成功样本先复用。需要额外运行（例如被改动的1080路径）超过预算时，报告未验证项请求验收方决定，不自行无限试跑。
7. 若Motion正式enqueue仍因Phase 3工作流选择bug阻止，可用已核对bundled graph验证生产链；让计划内的Motion样本读取计划内R2V样本的新canonical owner，不额外增加GPU预算。结果还需通过真实loader/apply及下一任务路径断言；不宣称正常UI已可用，不顺带修自动路由。
8. 环境/模型不可用时完成独立检查，标记 `blocked` 或 `ready-for-review，存在未验证项`，不能填“全部完成”。

运行前读 [WORKFLOW_CONTRACT.md](../../WORKFLOW_CONTRACT.md)、[DEPENDENCIES_AND_SETUP.md](../../DEPENDENCIES_AND_SETUP.md) 的受影响段落，遵循 [AGENT_ELECTRON_API_RUNBOOK.md](../../AGENT_ELECTRON_API_RUNBOOK.md)。使用隔离测试 state/内存队列和新的测试输出，不删除、不重写、不借用真实用户队列运行测试。启动、重启、停止 ComfyUI 和清理 dist 前确认资源归属；另一个任务占用时不抢占。

### 9.3 UI 与资源

- 1440×900、1280×800及首个窄屏断点检查保存下拉框：保留原设计与对齐，仅“保存 / 不保存”两项，无checkbox/toggle和常驻说明；提供普通及managed状态截图。
- 测试普通/managed切换、两项选择、1080限制、draft重启恢复；提示icon的hover/focus/click均能查看说明，managed禁用下拉时仍可操作，tooltip不被裁切或遮挡主要操作。
- 检查输入 focus/selection、持续打字、clear/undo/redo、无关连接刷新；不让保存控件变化触发不必要的整页重置。
- [UX_CONTRACT.md](../../UX_CONTRACT.md) 的受影响检查不能用历史 prototype 代替。现有隔离 fixture 曾在初始化卡住，不要连续修改全套 harness；一次定位不能解决时采用现有真实应用桥接并隔离测试数据。
- 验收后正常关闭本次拥有的应用/服务、清理临时端口，保留测试成片及证据。不要停止其他 session 的进程。

## 10. 停止条件与交付标准

### 遇到这些情况停止扩展并回填

- 自有 writer 与实际 tensor wrapper/schema 冲突，完成一次局部核对仍不能确定正确连接。
- 需要改第三方运行时、采样契约、模型策略或全局 schema 迁移才能继续。
- 需要删除旧数据、重写官方 manifest，或通过复制整份 payload 才能声称完成。
- 发现所需字段超出第6节的增量合同，或现有字段语义相互冲突，不能通过现有边界解决。
- 同一问题一次修正重试仍失败，或达到 GPU 提交上限；保留失败证据，不换参数反复赌成功。
- 同一文件有冲突写入或共享运行时正在被别人使用。继续可独立工作，只报告具体冲突，不把整个 dirty worktree 当阻塞。

回填必须包含：最小复现、实际与预期、已排除项、精确阻塞位置、下一次需要的决定。不要只写“Luna能力不足/请高级模型看看”。

### ready-for-review 前逐项自查

- [ ] 本阶段目标是生产侧闭环，未把 Phase 2/3/4 提前标为完成。
- [ ] 已恢复原有保存下拉设计，仅“保存 / 不保存”两项；没有checkbox/toggle，说明全部在提示icon；managed显示保存且禁用、icon仍可用，普通偏好未丢失。
- [ ] 开启时真实单份 AV + 必要元数据，关闭时不留可选新产物；managed必需Run不被关掉。
- [ ] 所有启用H3工作流族在覆盖表有结果，R2V和两类Extend没有遗漏。
- [ ] 新普通与managed产物身份、范围和History版本关联正确；旧队列/历史仍可读可按原语义执行。
- [ ] 新通用资产不是 capability 占位对象，Native兼容引用与它同owner/hash。
- [ ] Motion旧writer仅在第6.4节通过后替换；现有继续创作字段能传递正确owner，重试/旧版本/取消不串文件，没有以“后续接消费者”为由留下回归。
- [ ] serializer缺失、保存失败、取消等负面场景不发布假资产，既有成片/父资产不被破坏。
- [ ] scoped tests、verify、Python相关检查、UI与所需真实产物证据已回填；未验证项明确列出。
- [ ] 没有无关清理、上游改动、误改现有JS、用户数据迁移或自动提交。
- [ ] 所有新增服务依赖已贯穿QueueService/runtime/executor，非仅测试stub可用。
- [ ] 完成第11节结果回填，TASK只更新本阶段当前摘要；未创建Phase 2工作包。

交接方只按本轮 scoped diff、必需上下文与上述关键证据验收。同一整合状态的通过结果可复用，不要求另一位执行者把全部调查/GPU重复一遍。验收通过前不要继续下一阶段。

## 11. Luna 回填区

以下为本次二轮复核返修的实际执行回填；真实 renderer/GPU 未执行处保持未验证，不由自动化结果推导通过。

### 执行摘要

- 结果：changes-requested，T2 存在真实 renderer/GPU、生产链和重试/重启未验证项。
- 开始与结束时间：2026-09-19 04:41 至 04:49（本地，代码/测试/类型/verify）；R5 CPU probe 随后完成。
- 实际使用模型：当前 GitHub Copilot session；未派子 agent。
- 本阶段新增子 agent 数：必须为 0。
- 当前工作树是否存在影响本阶段的并发修改：未发现影响本阶段 scoped 文件的并发写入；保留其他既有 dirty/untracked 改动。
- 与约定有无偏离：未 commit/push/reset/stash/clean，未启动服务或提交 GPU；按要求没有开始 Phase 2。新增 temp probe 只写入 ignored 证据目录。

### 改动清单

| 文件 / symbol | 改动及原因 | 是否涉及存储兼容 |
| --- | --- | --- |
| `electron/store.ts`, `src/types.ts` | 未知 `h3AvOutputPolicy` 不再删除后降级为旧任务；queue/upscale 置为 `failed` 并保留 `h3AvOutputPolicyError`，History version 保留诊断；旧无 policy 仍按旧协议。 | 是，向后兼容新增诊断字段 |
| `src/core/queue.ts`, `src/core/queue.js` | queue 选择跳过 policy-error；reset/duplicate 后仍不可执行。 | 是，旧任务行为保持 |
| `electron/application-runtime.ts`, `electron/queue-executor.ts`, `electron/queue-history.ts` | shared optional 登记失败转 `save-failed`；1080 second-pass 继承 policy，checkpoint 恢复/最终 asset 关联由 executor 测试锁定。 | 是，保留旧任务/managed 合同 |
| `electron/services/native-av-artifact.ts`, `tests/native-av-artifact.test.ts` | shared 规范 owner 原位提交；缺 ID、非规范名、跨目录 descriptor 在 copy/write 前拒绝。 | 是，旧无 policy copy 路径保留 |
| `tests/h3-phase1-registration.test.ts` | 真实 serializer descriptor -> `commitProducedFile` -> registry -> QueueExecutionSideEffects -> History -> extension factory owner/hash 冻结；optional failure 完成链与旧任务隔离。 | 是，验证新 shared 链 |
| `tests/queue-executor.test.ts`, `tests/queue-modules.test.ts`, `tests/store.test.ts`, `tests/queue.test.ts` | 合法 H3 网格、1080 checkpoint 最终 asset、History policy 诊断、reset/duplicate 不执行。 | 是，兼容回归 |
| `temp/h3-phase1-r5-motion-probe/probe.py`, `result.json` | 选定 Comfy Python 下 app/旧 Motion writer 的 F32/BF16 loader/apply 对比；只保留证据，不是生产源码。 | 否 |

### 验证结果

| 检查 | 实际命令 / 用例 | 结果 | 本地证据位置 / 简短关键值 |
| --- | --- | --- | --- |
| focused Phase 1 suite | `npx.cmd vitest run --config vite.config.ts tests/h3-phase1-registration.test.ts tests/native-av-artifact.test.ts tests/h3-native-av-collector.test.ts tests/queue-executor.test.ts tests/queue-modules.test.ts tests/store.test.ts tests/create-enqueue.test.ts tests/create-save-control.test.ts tests/queue.test.ts tests/workflow.test.ts --reporter=dot` | 10 files / 235 tests passed | 覆盖 R1-R4、R6、unknown policy、R3 FS、合法 Motion fixture |
| 完整 verify | `npm.cmd run verify` | 177 unit files / 1504 tests；6 integration files / 81 tests；typecheck、clean build、contrast 20/20 passed | 当前工作树执行，不复用旧日志 |
| R5 Motion CPU gate | `C:\Users\Wuyouwofang\Documents\ComfyUI\.venv\Scripts\python.exe temp/h3-phase1-r5-motion-probe/probe.py` | F32/BF16 两 case passed；writersMatch=true；trim=22；indices `[0,1,5,9,13,17,18]`；audio shape `[1,32,2,40]`；GPU submissions=0 | [result.json](../../../temp/h3-phase1-r5-motion-probe/result.json) |
| typecheck / diff | `npm.cmd run typecheck`；`git diff --check` | passed | 当前 TS/JS scoped diff |
| UI / real producer | Electron renderer screenshots、真实 H3 producer/GPU、1080 GPU second-pass、retry/cancel/restart | 未执行 | 保持 unknown/blocked，不以 verify 或 CPU probe 替代 |

### 工作流覆盖与真实产物

复制第7.B节表格，逐项填实际图、保存节点/socket、policy、保存值、产物范围、graph检查、真实运行或复用证据。不得只写“全支持”。

| 实际样本 | task / prompt / version ID | owner / manifest 相对路径 | bytes / hash / shape | 范围 / context | 原位提交与未额外复制证据 |
| --- | --- | --- | --- | --- | --- |
| R5 CPU writer comparison | 无生产 task/version；独立 CPU fixture | `runs/<独立随机目录>/h3-native-av/h3av_phase1_r5_{f32,bf16}.safetensors` 与 Motion legacy fixture；相对路径写入 probe result | video `[1,24,37,2,3]`；audio `[1,32,2,207]`；dtype F32/BF16；无 GPU hash 作为生产样本 | generated AV fixture；Motion context tail 22/24-frame contract | app/legacy writer 都经真实 save/load/apply；每次 probe 使用随机 run root，未覆盖旧文件 |
| shared completion chain | 无用户 prompt；Vitest temp task `shared-chain-task` | `h3-native-av/h3av_shared-chain-artifact.safetensors` + manifest（临时目录，测试结束清理） | 864x480；frameCount=5；video `[1,24,2,30,54]`；audio `[1,32,2,8]`；registry asset hash/owner 与 artifact 一致 | extension-segment / context=0 | `commitProducedFile(sharedOutput)` 原位；History 与下一 factory task 均引用同一 owner/hash |
| 1080 checkpoint | Vitest `queue-runtime-task`；无真实生产 version | mock first-pass checkpoint 与 final canonical owner | final asset width 1920 / height 1088；role `final-clean-av`；policy shared | first-pass checkpoint 不作为最终 History asset | executor 完成与 checkpoint resume 均断言最终 asset；无 GPU |

### 消费能力边界

- 已验证的保存/读取协议：规范 app `LocalVideoStudioH3SaveJointAV` descriptor 经 shared `commitProducedFile`、registry、History、extension factory；普通 asset 为单一 `app-canonical` owner，`h3ContextLatentPath`、History asset 和下一 task 指向同一 payload/hash。R5 CPU probe 证明 app 与旧 Motion writer 在 F32/BF16 下 loader/apply 值和索引一致。
- 仅有元数据、尚未接生产消费者的协议：`native-av` capability 不等于所有 Motion/Native learned/Continuum consumer 已接通；跨模型自动路由、Native learned 真实推理、真实 GPU producer 尚未在本轮关闭。
- Motion替换门禁证据、兼容输出字段、传到下一任务的准确文件以及重试/旧版本结果：CPU probe 覆盖 app/legacy writer、loader、apply、trim/audio/video tail；集成测试覆盖 commit -> History -> factory owner/hash。现有 shared graph 保留 canonical writer、跳过旧 Motion writer。真实旧版本/重试/取消/off/失败串文件检查和 GPU producer smoke 未执行，仍为未验证。
- 逐图sampler socket、clean/prefix/mask语义以及未验证的变体：静态 workflow/render tests 覆盖 serializer 选择和 shared R2V 不挂 Motion writer；T2V/I2V/R2V/FL2VA/Continuum 各启用 graph 的真实 sampler socket、clean/prefix/mask 和 GPU 输出未逐一运行。
- 1080p内部阶段是否改变及证据：queue executor mock 覆盖 first-pass checkpoint、second-pass policy 继承、最终 1080 asset/History；真实 1080 producer/learned second sampling 未运行。
- managed 是否改变及既有证据可复用的理由：本轮未修改 managed Run Storage/receipt graph；既有 managed receipt/owner 证据继续适用，但不替代本轮 ordinary producer smoke。

### 剩余问题与资源清理

- 未完成项与精确阻塞：真实 renderer 尺寸/焦点/触摸截图、普通 producer -> History -> next task GPU smoke、1080 GPU second-pass、retry/cancel/restart/旧版本串文件未执行；因此不宣称 Phase 1 的真实运行门禁全部完成。
- 真实运行中覆盖和未覆盖的工作流：本轮没有新的 Comfy/GPU 任务；R5 为选定 Python CPU writer/consumer 对比。T2V/I2V/R2V/两类 Extend/managed 的真实生产覆盖沿用既有记录或标 unknown。
- 旧数据/队列兼容结果：旧无 policy 任务仍按四档/旧 boolean；新 unknown policy 变为 failed 并保留 error，不丢用户状态；reset/duplicate 不会重新执行；History unknown policy 保留诊断；没有迁移或删除旧 payload。
- 新增测试产物及保留位置，不填写用户 Prompt 正文：`temp/h3-phase1-r5-motion-probe/probe.py`、`result.json`、随机 `runs/` 证据；既有 `temp/h3-phase1-motion-probe/` 保留。无用户 prompt/media 写入仓库。
- 自有 Electron、端口、ComfyUI/GPU 的结束状态：本轮未启动 Electron/ComfyUI；未提交 GPU；没有本轮自有 listener 需要清理。临时 CPU probe 已结束，temp 证据保留。
- 后续阶段需要知道的事实，不自行开始后续阶段：Phase 2 仍需显式放行；Phase 3 才处理通用 consumer routing。不要把 `native-av` 或 CPU Motion gate 写成真实 GPU/产品入口 ready。

### 交接方验收

- 状态：changes-requested，2026-09-19 T1-T3 复核；不改动前置研究的accepted-with-scope结论。
- 是否允许进入 Phase 2：否。
- 验收基线：当前磁盘及 scoped diff；已保留早期 Continuum 修复，恢复 select + overall icon + option tooltip，补齐 unknown policy 拒绝、R1/R2/R3 完成链和合法 Motion fixture；不把自动化通过等同于真实 renderer/GPU 全门禁完成。
- 当前证据：focused 10 files/235 tests；`npm.cmd run verify` 当前状态为 177 unit files/1504 tests、6 integration files/81 tests、typecheck/build/contrast 20/20；R5 双 dtype CPU 结果见 [result.json](../../../temp/h3-phase1-r5-motion-probe/result.json)。
- 当前未验证：真实 renderer 多 viewport/hover-focus-touch/草稿恢复，真实 T2V/I2V/R2V/Extend producer、1080 GPU second-pass、retry/cancel/restart/旧版本串文件；按要求保留 unknown/blocked。

#### R1 / P1：1080p内部二采丢失shared资产关联

- 位置：[queue-executor.ts](../../../electron/queue-executor.ts#L86) 的 `h3CreateSecondPassTask`；[application-runtime.ts](../../../electron/application-runtime.ts#L303) 的 `commitH3NativeAvOutput`；[queue-history.ts](../../../electron/queue-history.ts#L291)。
- 当前second-pass经 `upscaleTaskFromRequest` 新建task，没有继承所属Create的 `h3AvOutputPolicy`。runtime又只允许generation/extension调用 `registerNativeArtifact`，因此内部upscale返回的continuation没有asset，最终1080p History的 `h3AvAsset` 为undefined。首遍asset不能冒充最终1080p产物。
- 修复：按原第6.1节显式保留内部阶段所属Create的策略及产物身份，注册真实second-pass结果；不把独立latent upscale扩大到本阶段。
- 最小验收：覆盖1080p首遍到二采的完整完成链、checkpoint恢复，断言最终version关联最终尺寸/role/hash/owner，策略未丢；没有把首遍临时路径当最终引用。实际生产路径改变须按第9节提供相应运行证据或标明blocked。

#### R2 / P1：可选统一登记失败会使成片整单失败，并影响旧任务

- 位置：[application-runtime.ts](../../../electron/application-runtime.ts#L293) 的提交闭包；[queue-executor.ts](../../../electron/queue-executor.ts#L945) 的完成流程。
- Native payload/manifest成功后直接await `registerNativeArtifact`，没有optional-failure转换。该服务遇到读文件/流hash/几何或资产校验错误会throw，异常进入executor整单 `recoverFailure`，不会正常入History；已有MP4也被算成失败，而不是成片可用、latent失败。此新增登记还未限定shared，旧无policy的generation/extension也会新增失败条件。
- 修复：旧任务保留原执行合同；新shared的可选登记失败保留成片并提供明确失败状态/原因，不发布 `h3AvAsset`。必需1080p内部AV和managed receipt继续保持原硬失败规则，不用全局catch掩盖它们。
- 最小验收：在真实注入闭包/完成链模拟registry抛错，分别断言普通shared成片入史且无假asset、无policy旧任务不因新registry失败、必需阶段仍失败。仅测registry本身throw不算完成。

#### R3 / P1：shared未建立原位提交门禁，仍可能复制第二份payload

- 位置：[h3-native-av-collector.ts](../../../electron/services/h3-native-av-collector.ts#L160)、[native-av-artifact.ts](../../../electron/services/native-av-artifact.ts#L449)。
- policy没有传入collector/commit请求。非规范serializer文件名会使collector不提供artifactId，commit生成新ID后继续走 `sourcePath !== payloadPath` 的copy分支；新shared也沿用此行为。正常规范命名可以零复制，但不能据此保证全部shared提交符合单owner要求。
- 修复：在复制或写入payload之前拒绝shared的不规范owner/descriptor；沿用现有规范ID，不删除旧任务兼容copy行为。
- 最小验收：合法shared原位提交的copy/payload-write次数为0；非法名称/不同目录shared明确保存失败且仍为0；旧无policy兼容分支保持原行为。断言实际FS调用与最终文件，不只检查asset中的字符串。

#### R4 / P2：保存意图未在UI、预检和factory统一

- 位置：[view-model.ts](../../../src/renderer/pages/create/view-model.ts#L646)、[queue-task-factory.ts](../../../src/core/queue-task-factory.ts#L340)、[queue-enqueue.ts](../../../electron/queue-enqueue.ts#L323)。
- managed只把checkbox禁用，checked仍来自普通草稿保存值，草稿none时显示未选；factory也冻结none。虽然官方Run仍保存，这会让UI/快照与执行事实冲突。
- 旧部分保存草稿在factory被收敛为all，但UI分辨率判断和1080p enqueue仍调用旧四档语义；会显示保存开启而不给1080选项或被预检拒绝。上述内存检查已复现。
- 修复：普通新提交使用同一新意图函数贯穿view-model/分辨率/预检/factory；按R6恢复下拉框，managed显示“保存”且禁用、执行快照强制保存，但不修改普通模式记住的none。旧任务加载/重试仍按旧四档。
- 最小验收：普通“不保存” -> managed显示“保存”且禁用、提示icon可用 -> 回普通仍为“不保存”；managed task冻结all/true；旧joint-av/motion-context草稿显示、1080校验和新入队一致；后改草稿不改变旧快照。

#### R5 / 必需验收门禁：Motion与完整交付证据未提交

- 本次直接读磁盘确认：第11节仍是空模板，TASK原本仍写“实现尚未开始”。用户上下文里的末条验证命令不能替代当前文件内容。请将实际回填落盘，不宣称只剩真实GPU验证。
- 新shared图已删除Motion writer，executor也跳过旧slot收集；现有新增 `projects a shared R2V canonical artifact...` 测试仅投影手造artifact路径，没有证明第6.4节真实loader/apply、同tensor值/索引、下一任务路径和重试/旧版本门禁。该fixture宽848不满足Native 32对齐，frameCount=146也不满足H3网格；断言路径非空会漏掉同一version的continuation已归一为invalid。应使用合法fixture，并断言状态、实际owner和关联一致。
- 必须补：第7.B逐图生产出口与语义表；Motion第6.4节证据；第9节所需真实Comfy/GPU运行验证项和UI状态/恢复检查。已完成的原始证据可直接引用，不无故重跑；没跑的写unknown/blocked及原因，不能用前置可行性探针替代新生产链。
- 同时补齐新policy的store/reset/duplicate兼容和未知policy拒绝测试；当前store没有新policy校验，不能只依赖TypeScript联合类型。仅给无policy对象做一次spread断言，不证明旧任务重启/重试兼容。

#### R6 / P2：恢复保存下拉框与提示icon

- 用户最新明确要求保留原有下拉设计，只能选“保存 / 不保存”，不能改成checkbox；提示全部收进icon。交接方此前将二元语义写成“开关”，且首轮验收未纠正控件形态，这是交接描述遗漏，不是授权改版。
- 位置：[page.ts](../../../src/renderer/pages/create/page.ts)、[page-controller.ts](../../../src/renderer/pages/create/page-controller.ts)、[view-model.ts](../../../src/renderer/pages/create/view-model.ts)及对应既有JS/locales。
- 修复：按第4节及第7.D节恢复现有select样式和布局，只减少选项、不改设计；绑定value而非checked。说明和managed必需保存理由只放在提示icon中，不加常驻长文/说明卡片；保留原有明确的错误状态与提交阻止，不把关键失败藏起来。
- 最小验收：DOM断言保存控件为select、恰好两项且无checkbox/toggle，选项与all/none一致；普通与managed切换满足R4。真实renderer按第9.3节检查并回填截图，icon支持鼠标、键盘及点击/触摸，禁用下拉时仍可用；对齐、窄屏、focus和草稿恢复无回归。
- 只恢复保存控件及说明呈现，不回退已有业务修复或整个文件，不借此重做其他UI，也不推迟到Phase 2。

#### 返修与回填规则

只处理上述Phase 1范围，按R1-R4及R6分别跑最窄回归，完成整合后再跑一次必要verify。R5证据与Motion兼容、R6的UI恢复均是验收条件，不自动延后到后续阶段；运行资源和GPU预算仍遵守第9节，需超预算先报告。暂不修既有Motion工作流自动选择，不触及低优先级独立upscale、用户历史迁移或Take分支。

完成后填第11节实际改动、命令/结果、真实样本、未验证项及资源状态，TASK同步为ready-for-review，保留本次验收记录并在末尾逐项回复R1-R6。不要自行标accepted，不创建Phase 2。交接方本次只改验收文档，未改生产实现、未启动/停止服务或提交GPU任务。

### 2026-09-19 二轮复核：部分修复确认，仍需补齐门禁

- 结论：changes-requested；是否允许进入 Phase 2：否。下列是当前结论，上面的首轮问题记录保留为历史，不要求把已经修好的部分重新实现。
- 交付基线：编辑器读取和独立 `fs.readFileSync` 均读到未回填的第11节；补充本次记录前HANDOFF共444行，TASK共160行。它们仍是交接方上轮版本，与用户上下文中“R1-R6返修已完成”的终端检查不一致。不能仅凭旧终端成功记录认定当前文件已交付；请核对Luna是否使用同一工作区/文件并将实际结果落盘，不覆盖本次验收记录。

#### 已确认的修复与证据

| 项目 | 本次确认 | 仍不代表什么 |
| --- | --- | --- |
| R1 | `h3CreateSecondPassTask`继承shared，注册入口不再排除内部upscale；二采完成入史的mock测试断言最终asset | 未提供真实二采输出登记证据，checkpoint恢复测试仍未断言最终asset |
| R2 | `registerSharedNativeAsset`跳过无policy任务；普通登记throw转save-failed，内部upscale仍throw；三个helper测试通过 | helper测试没有调用executor/History，不等于已证明MP4在该错误下正常入史 |
| R3 | collector metadata携带sharedOutput；提交服务在copy前拒绝非canonical owner，合法原位与非法路径测试通过 | 现有新测试只spy copy，未断言payload write；不覆盖所有缺ID/不同目录组合 |
| R4 | view-model、预检、factory使用shared意图；直接运行现有JS得到managed显示all、task all/true、原draft仍none；旧motion-context草稿得到允许1080及all快照 | 不代替真实控件切换、重启与焦点检查 |
| R6 | 源码已恢复select，仅all/none两项，读取value；managed禁用及icon点击/键盘绑定存在 | 当前测试读取源码字符串，不是DOM交互/截图验收；尚无当前renderer实测记录 |

- 本次执行：`npx.cmd vitest run --config vite.config.ts tests/h3-phase1-registration.test.ts tests/native-av-artifact.test.ts tests/h3-native-av-collector.test.ts tests/queue-executor.test.ts tests/queue-modules.test.ts tests/store.test.ts tests/create-enqueue.test.ts tests/create-save-control.test.ts --reporter=dot`，8文件127项通过。
- 已读并复用：[h3-phase1-r6-double-tip-verify.log](../../../temp/h3-phase1-r6-double-tip-verify.log)，177文件1500项单测、6文件81项集成测试、typecheck/build、20组contrast通过。本次不重复全量build；该日志只证明其对应文件状态的检查结果。
- 已读：[Motion探针](../../../temp/h3-phase1-motion-probe/probe.py)及[result.json](../../../temp/h3-phase1-motion-probe/result.json)。认可其限定证据：真实自有writer到Motion loader的F32 video/audio读回相等、apply后7个video尾部值相等、trim=22、audio shape=[1,32,2,40]、clip_index=0无上下文；GPU提交数为0。不重跑固定输出名探针覆盖原证据。

#### 剩余1 / P2：未知policy仍静默变成旧任务

- [store.ts](../../../electron/store.ts#L225) 的 `migrateH3AvOutputPolicy` 对所有非shared值返回undefined；队列迁移删除原字段后继续加载。未知生产协议因此进入“无policy旧任务”的执行分支，与第6.1节的显式拒绝要求相反。
- [store.test.ts](../../../tests/store.test.ts#L175) 当前把bogus字段消失当作成功，测试锁定了错误行为。应区分“原本缺字段的合法旧任务”和“存在但不支持的字段”；后者明确阻止执行并保留可诊断原因，不静默改协议，也不为了阻止一条任务而丢弃整个用户状态。
- 最小补测：真正缺policy的旧四档任务仍按原样加载/reset/duplicate；shared保留；未知值明确不可执行且没有被解释为旧协议。修正断言，不能仅改测试描述。

#### 剩余2 / R5：Motion替换门禁仍不完整

- [queue-modules.test.ts](../../../tests/queue-modules.test.ts#L646) 的shared Motion fixture仍为width=848、frameCount=146，仍只断言 `h3ContextLatentPath`。首轮已指出这不是有效Native artifact；路径断言不会发现同一version的continuation已被归一成invalid。先修成合法fixture并同时断言available、owner/hash/geometry一致；不得削弱validator。
- CPU探针使用F32/F32，`next_task_path = str(payload_path)`是脚本直接赋值，没有经过collector/manifest commit、History、继续创作或factory。audio apply只断言shape，resolved indices只写进结果未作断言；未与旧writer结果比较，也未覆盖生产启用的其他dtype。它不能关闭第6.4节，只补充了其中部分节点协议证据。
- 最小补交仍按原第6.4节：真实writer输出经提交/入史到下一任务冻结同一owner；同源新旧writer的loader/apply数值、dtype、视频索引及音频尾部值一致；旧版本/重试/取消/off/失败不串文件。小型节点CPU测试与应用完成链测试可分开，但必须用同一真实fixture及明确接口对接，不能把手填路径称为factory结果。
- 补齐R2的普通optional错误完成入史/无policy旧任务保护、R1的checkpoint最终asset断言及R3缺少的FS负面断言，优先扩展已有测试；不新增消费者架构。不满足Motion门禁时按第6.4.5节保留旧路径并标blocked，不能把writer已移除当成完成。

#### 剩余3 / 交付与UI、真实产物证据

- 第11节仍缺逐图表、实际任务/版本/产物、资源清理和未验证项。请回填实际结果；已存在的原始证据直接引用，不要求重做。没有对应记录的GPU/UI检查保持unknown，不能由verify或CPU结果推导通过。
- R6补真实renderer在第9.3节尺寸下的两项下拉和managed状态、icon交互、无常驻说明、焦点/恢复证据；现有 `create-save-control` 的源码包含断言不能代替这些检查。保存说明仍按用户“全部藏到icon”的要求，不将选项title/data-description的存在本身当作UI验收。
- 本次未启动或停止Electron/ComfyUI、未提交GPU、未修改生产代码或用户数据。后续运行继续遵守原预算与资源归属约束；新增证据不要求交接方重复整套实验。完成剩余项后回填ready-for-review，不自行accepted，不创建Phase 2。

### 2026-09-19 二轮返修执行结果（当前交接）

- R1：已补齐。`h3CreateSecondPassTask` 的 shared policy 继承、first-pass checkpoint 与 second-pass 最终 canonical asset 均由 executor 测试断言；checkpoint resume 也断言最终 1080 asset 的 owner、role 和 History 关联。真实 1080 GPU 仍未运行。
- R2：已补齐。`registerSharedNativeAsset` 的普通 shared registry 异常转为 `save-failed`；`QueueExecutionSideEffects.completeVideoTask` 测试确认 MP4 入史、无 `h3AvAsset`；无 policy 旧任务不调用新 registry；upscale/managed 必需路径仍硬失败。
- R3：已补齐。合法规范 serializer 通过 `commitProducedFile(sharedOutput)` 原位生成 manifest；非规范名、缺 artifact ID、跨目录 descriptor 均在 copy 和 write 前拒绝，FS spy 断言为零；旧兼容路径未删除。
- R4：已保留并复验。普通/managed 保存意图的 view-model、preflight、factory 一致；managed task 强制 `all/true` 但普通 draft 仍可回到 `none`；未知 policy 现在不会被当作 legacy，而是失败并保留诊断。
- R5：有界补齐。合法 H3 fixture 已改为 32 对齐/合法时间网格；真实 serializer descriptor -> commit -> registry -> History -> extension factory 链通过，owner/hash 一致。选定 Comfy Python 的独立 probe 对同一输入比较 app writer 与 Motion writer，F32/BF16 均通过真实 loader/apply、video/audio 值、indices、trim 和 tail；结果见 [result.json](../../../temp/h3-phase1-r5-motion-probe/result.json)。真实 GPU producer、retry/cancel/restart/旧版本路径仍未验证。
- R6：源码与 focused DOM contract 已通过。select 仅有“保存/不保存”，整体提示 icon 和每项 `title/data-description` 均保留；真实 renderer 的 1440x900、1280x800、窄屏、hover/focus/click/touch 和草稿恢复尚未执行。

本次修复没有创建 Phase 2、没有启动服务或提交 GPU、没有迁移/删除用户数据；交接状态保持 `changes-requested`，等待真实运行门禁完成后再复审。

### 2026-09-19 T1-T3 当时复核结果（历史）

- **T1 / P2：已通过交接方复核，关闭。** reset保留原失败状态与error，duplicate保持failed及可见原因，running恢复不再覆盖policy失败。交接方已核对代码及对应断言，执行 `npx.cmd vitest run --config vite.config.ts tests/queue.test.ts tests/store.test.ts --reporter=dot`，2文件66项通过；不是仅确认reset入口。
- **T2 / 真实运行门禁：部分通过，尚未关闭。** 用户已运行一个真实普通I2V任务，交接方核对视频/音频完整解码、应用AV校验器、实际持久化执行图及History任务归属均通过，详见TASK新任务证据。该producer-to-History实例不覆盖next-task、Motion/Continuum消费、其他生产路径、1080二采、renderer或既定兼容检查；不得将这些剩余项写成通过。交接方本轮未自行启动服务或提交GPU。
- **T3 / 交付一致性：已完成。** 第 11 节当前磁盘已有执行摘要、改动清单、验证结果、workflow/产物表、消费边界、剩余问题和资源状态；本段作为最新 T1-T3 记录追加，不覆盖 R1-R6 历史。TASK 当前入口同步为 `changes-requested`，与 handoff 一致；Phase 2 仍未派发。

### 2026-09-19 复制与 running 恢复补修结果

- **复制路径：已完成。** `duplicateQueueTask` 对带 `h3AvOutputPolicyError` 的任务生成 `failed` 副本，保留原 `error`/policy error；不会产生 `waiting + error=null` 的不可执行副本。运行时直接执行 `src/core/queue.js` 实测输出：`duplicateStatus=failed`、`errorPreserved=true`、`eligible=false`。
- **running 恢复路径：已完成。** store migration 对 `status=running` 且存在未知 policy 的 generation task 保持 `failed` 和 policy error，不再被通用 running 恢复覆盖为 waiting。临时 JSON 定向测试 `blocks unknown output policies` 通过。
- **当前验证：** `tests/queue.test.ts` + `tests/store.test.ts` 共 66 项通过；running 定向 store 测试 1 项通过；`npm.cmd run typecheck` 通过；既有 UI/GPU/生产重试重启未验证项保持原记录，不在本轮伪造完成。

### 当时剩余工作：T2真实验证（已结转）

- 上述queue/store内存与临时JSON测试属于T1证据，不属于真实renderer或Comfy/GPU生产验证。T1/T3已经关闭，不再重复派发或为它们重跑全量检查；前文首轮/二轮发现保留为历史，不是当前待修清单。
- 执行方按原第6.4/9节补T2：真实两项下拉与提示icon的界面/交互、计划内生产输出至History与下一任务、1080二采及retry/cancel/off/失败/旧版本/重启兼容证据。复用有效证据，遵守既定资源归属和GPU预算；未实际执行不能标通过，确实被阻塞则记录具体依赖、资源或失败命令。
- 已有可复用真实输入：TASK记录的用户I2V任务 `c727d84c-bd03-4fad-93c9-500263fa9449` 及对应AV已校验通过。不为重复证明普通I2V保存再提交GPU；后续消费者验证可从该History版本出发，但其尚无实际续写成功证据，不能把普通AV当作已有官方Run。
- 本轮交接方只纠正文档状态，没有新增生产代码改动、启动服务或提交GPU，未放行Phase 2。用户已授权后续简单、局部且可直接验证的小问题由交接方顺手修复，不为小改动重复交接；该授权不自动放宽T2验收门禁。