# Phase 2 Handoff: History 文件管理与 Extend 草稿交接

- 类型：HANDOFF / 有界实施工作包
- 日期：2026-09-19
- 状态：changes-requested；2026-09-19二次复核见第11节。已接收原三例修复、可见摘要和普通Continue重启证据；R1仍有可复现删除漏洞，不进入Phase 3。第8/10节保留当时执行报告。
- 权威状态：[TASK.md](TASK.md)；前阶段：[Phase 1历史](HANDOFF_PHASE_1.md)。Phase 1按用户决定accepted-with-scope，未验证项已结转，不重新开启整套返修循环。
- 执行者：用户手动交给Luna；禁止再派子agent。本阶段只实施本工作包，完成后回填并交接方验收，不自行创建Phase 3。
- 资源预算：新增GPU生成为0；真实用户媒体/AV/Run不得用于破坏性测试。UI与持久化测试使用隔离状态和临时文件，真实已有产物可只读复核。

## 1. 目标与完成边界

用户在History选择一个输出版本时，能看清它的视频、AV、manifest或官方Run依赖，定位文件并安全管理可删除的普通AV；点击“继续创作”后，所选版本的来源与依赖完整进入Extend草稿，切页、切模式和重启后不丢失、不串版本。

**本阶段终点是准确的文件管理与持久化草稿，不是新的消费者已经采样成功。** 连续Extend必须作为数据交接场景覆盖：第一次Extend的版本再次继续时，带入该次新增段AV，而不是最初I2V的AV。普通AV始终不是凭空生成的官方Run。

已批准的UI方向：保留现有播放器、右侧主要操作、详情下方Continuum信息及底部输出文件区；原位完善，不重做页面、不新增大的说明卡片或原型评审阶段。文件管理和来源说明放在现有辅助区域。

## 2. 先读与现有锚点

先读TASK当前摘要与结转表，以及 [架构状态/媒体契约](../../ARCHITECTURE_CONTRACT.md#state-contracts)、[UX交互及详情契约](../../UX_CONTRACT.md#interaction-rules)、[验证分级](../../CHANGE_VERIFICATION.md)。按正在改的部分打开下表，不重读整套旧计划或可行性源码。

下列是编写交接时已核对的基线，不意味着所有所需行为已有实现；开工先看目标diff和当前文件。

| 控制行为 | 当前入口 | 已知边界/要补的地方 |
| --- | --- | --- |
| History文件展示 | [page.ts](../../../src/renderer/pages/history/page.ts) `renderHistoryDetailPage` | 已把available Native payload/manifest和Motion文件并入列表；主要围绕旧字段，需涵盖统一asset、managed owner/alias及缺失状态，避免双重计数 |
| 所选版本继续创作 | [actions.ts](../../../src/renderer/pages/history/actions.ts) `continueVideoHistory`；[actions-controller.ts](../../../src/renderer/pages/history/actions-controller.ts) | 已从version读取artifact/sequence并传来源IDs；保留已有行为，补缺失数据、连续Extend和跨版本隔离，不重写已正确部分 |
| 草稿落盘和来源选择 | [coordinator.ts](../../../src/renderer/pages/create/coordinator.ts) `selectDraftVideo` / `saveDraftImmediately`；[draft-ipc.ts](../../../electron/draft-ipc.ts)、[store.ts](../../../electron/store.ts) | 已有独立Create模式快照；统一AV若需补字段，优先复用IDs/现有artifact/sequence，保证非活动Extend快照也能恢复 |
| 文件/来源检查 | [history-artifact-service.ts](../../../electron/services/history-artifact-service.ts)、[native-av-artifact.ts](../../../electron/services/native-av-artifact.ts)、[h3-continuum-asset-registry.ts](../../../electron/services/h3-continuum-asset-registry.ts) | 复用实际路径/manifest检查；文件有效不等于某消费者已就绪，不在页面渲染时遍历并hash整个output |
| 删除实际文件 | [history-destructive-service.ts](../../../electron/services/history-destructive-service.ts) `deleteJointAv` / `deleteMotionContext` / version及History删除 | 当前JointAV入口直接删除成对文件并标missing，未在此入口看到全引用门禁；需要统一asset状态清理及共享引用保护，不能仅补按钮禁用 |
| 引用索引与删除策略 | [h3-av-inventory.ts](../../../src/core/h3-av-inventory.ts) | 现有state索引主要覆盖History的h3AvAsset及sequence chunk，不完整覆盖普通输入/草稿；`planH3AvGc`是保守Run/Take GC规则，不能伪造unselectedTake来删除普通AV |
| 类型与IPC | [types.ts](../../../src/types.ts)、[history-ipc.ts](../../../electron/history-ipc.ts)、[preload.cts](../../../electron/preload.cts)、[studio-client.ts](../../../src/renderer/studio-client.ts) | 保持现有AppApi方法兼容；只增补本阶段必需的typed能力，业务逻辑留在service/core，不扩张main或组合根 |
| 来源与预算文案 | [view-model.ts](../../../src/renderer/pages/create/view-model.ts)、[helpers.ts](../../../src/renderer/pages/create/helpers.ts)、[workflow.ts](../../../src/core/workflow.ts) | 已修bootstrap按来源用14秒、managed保留15秒；本阶段保留该修复，只纠正“新AV被称旧AV”等展示歧义 |

共享纯逻辑放在现有core helper或最贴近的服务；不要创建平行的AssetManager、全库扫描器或第二套草稿状态。已有TS/JS双文件只同步本次触及的对应文件，不全库重新生成。

## 3. 必做行为

### A. 以所选版本生成文件清单

- 明确区分History asset ID、所选version ID与latent asset/artifact ID。展示和操作从所选version计算，不偷用顶层默认版、最新版本或当前草稿中的旧引用。
- 普通生成展示该版视频、AV payload及相邻manifest；旧Motion单独文件仍可显示。新共享payload同时承担多个用途时只出现一次，不能重复统计成多份文件。
- managed展示真实Run/chunk owner、关联manifest及实际存在的app alias；标明引用关系，不伪造相邻Native manifest，不复制Run owner来凑统一格式，不将hardlink与独立副本混为一谈。
- 区分“生成片段”“新增续写段”“官方Run chunk”的范围。累计29秒视频所关联的新增段AV不能标成整条29秒视频的AV；不把采样context帧数当成成片时长。
- 底部保留文件名、类型/用途、真实或明确未知的大小、定位和允许的删除操作。顶部辅助标记采用统一“AV latent”等表达，不让JointAV/Motion/Run多个徽标造成有多套独立保存的错觉。
- 未保存、保存失败、缺文件、校验失败、旧格式未验证应有不同状态；没有payload时不能因 `h3AvAsset` 缓存仍在就显示已验证。只读检查失败保留History记录，不改成其他版本的文件。
- 路径走现有主进程resolver；Comfy output根与视频的 `output/Videos` 设置不是同一个根。Windows路径大小写/分隔符、缓存绝对路径和相对引用须合理归一，但相同hash不自动等于相同物理owner。
- 异步检查切换版本后不得回写旧结果，不得重建正在播放的media或抢焦点。普通打开详情只做所选版本所需检查，不进行全局tensor读取/目录扫描。

### B. 受引用保护的定向删除

- 保留现有用户确认流程。只在用户明确点击并确认后删除；renderer传asset/version/目标身份，后端重新解析目标、归属和最新引用，不接受任意路径删除或信任UI传来的“可删”。
- 普通app-owned AV以payload及其manifest为一个删除单元，不能留下“只有manifest仍显示可用”。允许删除只有当前选定版本拥有且没有其他依赖的普通AV；保留MP4及History/version身份。
- 反向引用至少覆盖：所有History版本的统一asset/旧Native/Motion字段和managed chunk；所有仍保留的queue输入、sequence及checkpoint（包括可重试的failed/cancelled）；活动draft及非活动creation draft snapshots。相同资产ID或经resolver确认的相同路径都要识别。删除前复查，防止确认对话框打开期间新增引用。
- 仅当前目标版本自身的关联可随本次确认一起清理；发现其他版本、草稿或任务引用时拒绝物理删除并给出原因，不自动清空其他对象、不替换来源、不绕过门禁。不支持的旧来源无法证明独占时保守拒绝。
- 同一payload还通过Motion或Native旧入口可删时，也必须经过同一保护。检查History/version删除的AV清理路径，避免绕过；不改无关图片删除行为。
- 官方Run owner/manifest及canonical head依赖不在本阶段开放单文件删除。app alias也不能通过误标成普通AV删除owner；如支持删除alias，必须证明是独立目录项且没有引用，不能把它说成释放了owner全部磁盘空间。没有安全现有机制时保持只读定位并说明原因，不实现Run GC。
- 成功删除后同步相关旧字段和 `h3AvAsset` 可用性，不能出现 `h3ContinuationData=missing` 而统一UI仍显示available；已入队快照不得被“修正”成别的输入。
- 文件本来不存在与部分删除失败要分别处理。中途失败不报告全部成功、不删除视频、不让剩余metadata冒充可用；返回可见错误并可重新检查。实际删除失败/竞态用临时文件与mock故障测试，不操作用户真实文件。

### C. History到独立Extend草稿

- “继续创作”一次携带所选版视频、source asset/version IDs、尺寸/时长和该版真实可用依赖，不能让用户重新拼凑已关联的文件。复用现有actions/coordinator/saveDraft路径；来源选择结束前完成持久化确认。
- 数据可来自统一asset、旧Native continuation、旧Motion路径或官方sequence/receipt。优先保持身份引用和现有兼容字段；必要时补充可选typed字段和明确旧数据默认语义，不改历史IDs或强制全量迁移。
- 只传该版拥有或正式关联的依赖。输入有latent不表示输出也有；保存关闭/失败/文件被删的版本不得继承上次草稿、父版本或另一个输出的AV。
- 连续Extend重点：选择第一次Extend版本时，视频使用累计成片，AV使用该版新增段产物，保留segment范围和context元数据。选择原始I2V版本时恢复原AV；来回选择必须互不污染。
- 真正managed版本保留sequence/head/revision/chunk身份与已有Continue/Retry语义；普通AV或新增段AV走兼容来源，不能制造acceptedChunks、receipt或“同Run恢复”。
- 草稿在History/Create往返、I2V/Extend模式切换、完整落盘再加载后保留来源和依赖；不修改独立I2V/图片草稿，不改已入队的执行快照。仅内存structuredClone断言不算重启证据。
- 在Extend切换FL2VA/Continuum/Motion时保留共同来源及已验证的候选依赖；保持已有有效路径。跨消费者的自动工作流选择、adapter启用及新入队预检仍属Phase 3，不为让按钮可用而把统一AV强行塞进不兼容socket。
- 继续创作时新正文与Retry原文保持现有产品行为：普通新段不混入之前草稿的prompt版本；managed Retry继续使用被冻结正文。不要借此重做prompt/seed系统。
- 文件后来丢失或所选版本后来被删除时，显示精确来源与缺失原因，不静默找父版本替代；允许用户保留视频去选择明确支持的其他路径，但不得自动回退生成。

### D. 紧凑、准确的来源提示

- 新产物不要称“旧AV”。普通及新增段使用“AV兼容续写”一类路径名；仅有明确legacy证据时才描述旧格式。保留“非官方同Run恢复”的边界，不能换个绿色标签就声称同Run就绪。
- 区分“文件已验证”和“当前消费者可执行”。沿用已有紧凑文件行、状态与提示icon，复杂解释放tooltip；缺依赖/预算的阻断原因仍在提交区可见。
- 保存控件保持原位置与样式的select，仅“保存/不保存”，内部all/none；不改checkbox/toggle，不强加逐项tooltip为新验收门槛。说明通过可悬停、聚焦、点击的icon读取；managed禁用select时icon仍可用，切回普通来源恢复用户偏好。
- Continuum深层信息仍在播放器/标签下方，不能搬回右侧重要区域；保留返回History、版本选择、继续创作等主要动作。文案同步现有zh-CN/zh-TW/en-US词条，不添加第二套硬编码状态字典。

## 4. 明确不做

- 不增加通用consumer框架，不修Motion默认workflow选择，不实现AV导入后自动升级为official Run；这些归Phase 3，不能用Phase 2状态显示冒充实现。
- 不修改sampler/context/precision/VAE/attention/cache/offload策略，不放宽362帧预算，不升级节点或模型，不发起任何新GPU生成。
- 不做latent upscale、Take/branch创建、跨revision去重、Run GC或全库latent搬迁。不从MP4反推latent，不复制payload只为方便展示。
- 不重画History/Create，不要求重建prototypes，不改已批准的保存控件，不接管prompt增强等其他任务。
- 不删除或改写真实用户历史、AV、Run、队列、设置；不commit/push、发布版本、清理其他会话产物或停止它们的服务。

## 5. 有界实施顺序

1. 核对目标diff与上述入口，列出当前已满足部分和最小缺口；不要把本工作包重写成研究计划。使用现有测试fixture，先实现可验证的小块。
2. 补所选版本文件/来源的纯投影与引用判断，接入文件查询/删除服务，跑窄测试；保留旧IPC可用。
3. 接History底部文件操作及准确状态，复用现有确认对话框；再补Continue传递和独立Extend快照恢复，每块修改后立即跑相关测试。
4. 跑下方集成门禁和真实renderer验证；把遇到的简单局部回归修掉，不为它们另开handoff。发现需改变本阶段边界或删除真实数据时停止该部分并报告具体原因，不自行扩展Phase 3。
5. 回填本文件第8节及TASK当前摘要，状态改 `ready-for-review` 或 `blocked`；只有交接方验收后才进入下一阶段。

## 6. 验证与验收标准

### 自动化

复用现有 [history-services.test.ts](../../../tests/history-services.test.ts)、[history-actions.test.ts](../../../tests/history-actions.test.ts)、[history-accessibility.test.ts](../../../tests/history-accessibility.test.ts)、[h3-av-domain.test.ts](../../../tests/h3-av-domain.test.ts)、[creation-drafts.test.ts](../../../tests/creation-drafts.test.ts)、[draft-settings-services.test.ts](../../../tests/draft-settings-services.test.ts)、[store.test.ts](../../../tests/store.test.ts)、[create-video-extension.test.ts](../../../tests/create-video-extension.test.ts)。不为每个小断言创建新测试文件。

| 场景 | 必须观察的结果 |
| --- | --- |
| 普通I2V、Extend段、managed版本 | 文件用途/范围/owner正确，无重复payload行；managed Run不误标普通AV |
| 同一History切换原版/派生版，跨History快速切换 | 文件清单和异步检查绑定当前version；没有旧结果覆盖、播放重启或焦点丢失 |
| 当前单独拥有的普通AV删除 | 一次确认，payload+manifest一致处理，MP4保留，旧/新可用性字段一致 |
| 其他History、queue/checkpoint、活动/非活动draft引用 | 主进程拒绝物理删除；直接调用IPC和旧删除入口也不能绕过；所有引用和文件保持不变 |
| Run owner/alias、外部路径、目录穿越、缺失或部分删除失败 | 拒绝或明确失败，无越界删除，无错误成功状态 |
| 继续I2V版、再继续Extend版、返回原版 | source IDs、视频、AV、范围逐项正确；Extend版不拿原始I2V latent |
| 保存关闭/失败、legacy无统一asset、缺manifest、来源删除 | 兼容解释准确，不继承上一草稿或父版AV，不伪造消费者ready |
| 模式切换、草稿保存后全新Store加载 | 独立Extend来源完整，非活动快照不丢；旧草稿无新字段仍可读取 |
| History删除/文件操作与已入队快照 | 引用门禁正确，不重写既有任务，不影响其他版本或视频 |

按修改范围分组运行相关Vitest，最终在同一集成文件状态执行 `npm.cmd run verify`，它包含全部测试、clean typechecked build和contrast。只复用与当前输入一致的验证；不要每改文案就重复全量build。源码字符串匹配不能替代实际点击/IPC/持久化行为断言。

### 真实renderer与资源安全

- 遵循 [Electron应用验证手册](../../AGENT_ELECTRON_API_RUNBOOK.md)；先确认应用/端口/dist使用者。不要为跑测试关闭用户现有窗口、清其队列或接管ComfyUI。无法安全取得资源时说明具体占用和缺少的检查，不把“本轮未运行”称环境阻塞。
- 使用当前renderer+真实preload/IPC/store的隔离fixture，不仅是原型或纯mock DOM。删除只用临时目录中的合法fixture；只读查看TASK已有真实版本可补来源证据，但禁止测试删除它们。
- 1280x800、1440x900及首个窄屏断点截图：History详情文件行、长文件名、缺失状态、删除确认、Extend来源行；无溢出，右侧主要操作与返回入口可达。共享CSS改动还检查Create/Queue/History/Settings。
- 实际点击Continue并落盘，离开到其他Create模式，再恢复Extend；关闭并重开隔离实例确认相同version/AV/segment或Run身份。核对输入焦点、选区、连续打字、播放、保存下拉与icon键盘/点击行为；异步文件检查不得干扰。
- 本阶段不需再次采样即可完成上述数据/交互验收。没有GPU结果不能写成消费通过，但也不因未跑GPU阻止Phase 2的数据交接验收。
- 结束只清理本次创建的fixture、进程和端口，记录原用户数据未改、没有GPU提交；截图/日志放忽略目录，文档只保存相对位置与脱敏结论。

## 7. 可复用证据与遗留项

- TASK已保存用户I2V及首轮Extend的task/history/version定位。I2V有真实文件/hash/解码复核；首轮Extend有成功记录、新段关联和用户无接缝反馈，尚非独立完整质量验收。引用这些记录，不把现场机器路径、prompt或媒体复制进仓库。
- 首轮Extend再次进入草稿已观测到正确最新artifact及bootstrap模式；把此行为作为保留基线并补持久化/切换覆盖，不将其当作当前缺陷重新实现。
- Phase 1保存UI未完成的真实交互证据并入本阶段；剩余生产变体、1080二采与真实生成侧失败/重试矩阵仍按TASK结转，不能伪称通过或塞回Phase 2前置门禁。
- Phase 2发现的生产侧回归必须记录并修复最小相关缺陷；如果需要消费协议/采样策略变更，报告给交接方安排Phase 3，不私自放宽协议。

## 8. 执行回填（首批报告，保留历史）

以下记录本轮已经实施的 Phase 2 首批切片；未完成项继续保持未验证，不代表本阶段 accepted。

- 状态：active / implementation-in-progress；完成后再改 `ready-for-review` 或 `blocked`，不自行 accepted。
- 改动文件与行为：
	- `electron/services/history-destructive-service.ts`：删除 History/version/JointAV/Motion 前统一检查 History version、queue input/checkpoint、活动与非活动 creation draft 的反向引用；managed `continuum-run-chunk` owner 拒绝普通 JointAV 删除；成功删除同步清理 `h3ContinuationData`/`h3AvAsset`。
	- `src/renderer/pages/history/page.ts/.js`：所选 version 文件列表合并去重 `h3AvAsset.ownerPath/aliasPaths`；标记 app-canonical/continuum owner 与 inspection status；managed owner 不显示普通删除按钮。
	- `src/renderer/pages/history/assembly.ts/.js`、`coordinator.ts`、`ui-state.ts/.js`：复用已有 artifact inspection IPC，按当前 asset/version 异步检查并丢弃过期结果，不回写持久化 History。
	- 测试：`history-services.test.ts` 覆盖跨 version/draft/managed owner/版本删除引用门禁；`history-accessibility.test.ts` 覆盖 owner/alias/status/managed 只读投影；`store.test.ts` 覆盖 Continue 来源字段 JSON reload。
- 文件与引用策略：普通 artifact payload/manifest、统一 app-canonical owner/alias、旧 Motion 路径均按 normalized absolute path 建反向引用；managed Run owner 保持只读；queue source/checkpoint 与三类 draft source/AV 引用均阻止物理删除；没有实现 Run GC 或 payload copy。
- Continue与持久化：现有 `continueVideoHistory` 仍从所选 version 传 `assetId/versionId`、新段 artifact/Motion/managed sequence；本轮补充 JSON store reload 对 source IDs、Motion path、AV path、bootstrap mode 的保留断言。尚未完成真实点击 Continue 后切模式、关闭重开隔离实例的手工验证；未改已入队快照。
- 验证命令/结果：Phase 2 focused 8 files / 84 tests passed；`npm.cmd run typecheck` passed；`npm.cmd run build` passed；History accessibility/services/actions/store focused 63 tests passed；`git diff --check` passed；最终 `npm.cmd run verify` 通过 177 unit files / 1510 tests、6 integration files / 81 tests、typecheck/build、contrast 20/20。
- 真实UI证据：`node --experimental-strip-types scripts/capture-c04-electron-evidence.mjs --scenario history-media --samples 1 --skip-trace --output temp/phase2-c04-history-media`。隔离 packaged Electron cold/warm 各一次实际启动；History detail 首帧/播放、hover、1280×800、1440×900 无横向溢出通过，截图在 `temp/phase2-c04-history-media/runs/history-media/{cold,warm}/sample-1/`。该 capture 未覆盖删除确认、Continue 落盘/重启和 AV fixture 文件行，保持未验证。
- 资源与用户数据：新增 GPU=0；capture 使用隔离 `temp/phase2-c04-history-media` userData/media；未删除真实媒体/AV、未修改真实队列/History。9333/8188/5173/5187 无本轮残留监听；现存默认 userData Electron 进程未触碰。
- 残留问题及阶段归属：删除确认对话框到 IPC 的隔离点击、Continue 实际落盘/关闭重开、managed/普通真实文件 fixture renderer、1280/1440 窄屏文件行仍需完成；Phase 3 consumer routing、Phase 4 真实生产/质量验收不提前实现。
- TASK同步：TASK 当前入口已改为 `active / phase-2-in-progress`，与本文件 `active / implementation-in-progress` 对齐；Phase 1 accepted-with-scope 证据和未验证结转保留，Phase 3 未创建。

<a id="phase-2-review"></a>
## 9. 2026-09-19 交接方复核与有界返修

结论：`changes-requested`，不是仅缺报告。沿用第3/6节既定验收范围，不重开Phase 1，不创建Phase 3，不新增GPU生成。交接方已直接修复第二轮Extend的CPU拼接丢帧，见TASK对应记录；保留该修复和真实FFmpeg回归，不重做采样。

### R1 / P1：共享AV仍可被删除

控制路径：[history-destructive-service.ts](../../../electron/services/history-destructive-service.ts)的`deleteJointAv`、`assertAuxiliaryFilesExclusive`、`historyReferencePath`、`collectHistoryAuxiliaryReferences`。目前引用检查使用早期store快照和手工路径拼接，且漏掉Native upscale输入。

交接方用当前编译后的真实service、内存store、模拟`fileSystem.unlink`复现如下反例。每例设置一个可用普通artifact的目标History/version，调用`deleteJointAv`；无真实文件删除，也未改用户state。

| 反例 | 最小fixture与触发 | 当前实测 | 必须结果 |
| --- | --- | --- | --- |
| 相对/绝对引用指向同一AV | settings outputDirectory=`<root>/Videos`；目标manifest/payload缓存绝对路径在`<root>/h3-native-av`；另一个History版有相同相对引用但无absolutePath；resolver将两者解析到同一文件 | 未阻止，模拟unlink=2 | 拒绝，unlink=0，两版/文件不变 |
| 排队Native upscale引用 | queue中waiting upscale的`h3NativeInput.artifact`指向目标pair，sourceFilePath另指视频 | 未阻止，模拟unlink=2 | 拒绝，unlink=0，queue快照不变 |
| 检查后新增引用 | `resolveHistoryFile`异步解析期间向store加入另一个History版的相同pair；目标服务仍使用先前`current` | 未阻止，模拟unlink=2 | 删除前按最新状态拒绝，unlink=0 |

返修要求：

- 复用主进程实际resolver区分Comfy output根和视频目录，目标与引用使用一致身份规则；不能只对字符串`path.resolve/toLowerCase`就声称已经解析到同一owner。覆盖相同asset ID、缺绝对缓存、大小写/分隔符及旧数据。
- 补齐既定的queue输入/sequence/checkpoint、History managed chunk及活动/非活动draft引用；明确覆盖`h3NativeInput.artifact`和直接`h3ContinuumArtifactPath`。独立upscale功能仍不实施，只保护其已有输入。
- 删除前复查最新引用，并处理解析到unlink之间的状态变化；不修改/清空其他对象来消除blocker。所有普通AV删除入口及History/version清理均用同一保护，Run owner/manifest保持只读。
- 在现有history service测试中固定上述三例；补安全独占成功、旧入口/整版清理不能绕过、部分unlink失败不能保留available假象的相邻用例。只使用临时文件或mock故障。

### R2 / P2：状态、范围与无干扰刷新尚未交付

- [History page](../../../src/renderer/pages/history/page.ts)只把检查结果放进`data-history-av-status`；没有任何渲染或样式消费者显示该状态/原因。缺文件或损坏后仍是原文件行和JointAV徽标，不满足可见状态要求。
- 按第3A/D节补紧凑的可见状态、可访问原因和用途/范围：普通生成、新增续写段、官方Run chunk；补managed实际manifest/owner/alias fixture，不以通用owner字样或隐藏属性代替。保持现有页面层级和保存select，不堆说明卡片。
- Create的[zh-CN词条](../../../src/core/locales/zh-CN.ts)仍把bootstrap统一叫“旧 AV 兼容导入”；按第3D节改准确的AV兼容续写表达，同步既有三语词条，不把新产物称旧格式，不伪称同Run恢复。
- [History coordinator](../../../src/renderer/pages/history/coordinator.ts)的检查完成回调调用`deps.render()`；[render-coordinator](../../../src/renderer/render-coordinator.ts)会停止/重建History媒体再恢复播放。异步检查应仅更新相关状态，不重建播放器；按同版本连续请求/快速切版/删除后的请求竞争补断言，不让旧结果重新显示available。

### R3 / P2：完成原定真实交互验收

- 第8节确有Luna完整verify通过报告；TASK旧入口写“verify待完成”已纠正。交接方本轮相关7文件78项通过，最终verify为178文件1514单测、6文件81集成、typecheck/build、contrast 20/20。不得把这些通过结果当作R1反例已修复。
- C04普通History media capture没有验证AV fixture行、删除确认到IPC、Continue落盘/关闭重开；JSON reload断言不能替代这条真实链路。按第6节使用隔离renderer+preload/IPC/store和合法AV fixture完成，不接触真实用户数据。
- 实际覆盖普通I2V/Extend新增段/managed/缺失状态，确认删除与阻止删除，Continue选择版本后切模式、关闭重开；检查1280x800、1440x900和窄屏文件行、播放元素身份/连续播放、焦点选区、保存select及icon键盘/点击行为。
- 完成返修后在同一集成状态跑所需focused测试和verify，报告真实命令、结果、截图/隔离state相对路径、资源清理和剩余阻塞。回填第10节并同步TASK，状态只能改`ready-for-review`或具体`blocked`，由交接方验收后再创建Phase 3。

## 10. 首次返修执行回填（保留报告）

逐项记录R1/R2/R3对应改动、反例由失败到通过的证据、真实交互/重启结果及未验证边界。不要仅重复“所有测试通过”，不要覆盖第8/9节的历史证据。

### 2026-09-19 R1/R2/R3 当前执行结果

- **R1 / 删除保护：已修复并验证。** 引用收集改为复用 `resolveHistoryFile` 的真实 owner 解析；删除前在解析完成后重新读取 state。History version、queue source/checkpoint、`h3NativeInput.artifact`、sequence asset ID、活动/非活动 draft 均纳入引用索引；managed Run owner 继续只读。新增三类原复现回归：相对/绝对引用归一、Native upscale queue artifact、解析期间新增 History 引用，均拒绝删除且 `unlink=0`。`tests/history-services.test.ts` 当前 22 项通过。
- **R2 / 状态、范围与刷新：已修复并验证。** AV inspection 状态/原因现在在当前 version 的可访问摘要中可见；显示 artifact role、`extension-segment`/sample scope、context frames、storage kind；bootstrap 文案改为“AV 兼容续写”，不再称“旧 AV”。inspection 完成只替换 `data-history-av-summary`，不调用整页 render 或 `video.load()`；过期 version 结果丢弃。`history-accessibility`、`history-workspace-coordinator`、`history-services` focused 通过，三语 locale TS/JS 同步。
- **R3 / 真实交互与重启：已完成。** 隔离 packaged Electron + preload/IPC/store smoke 脚本：[result.json](../../../temp/phase2-r3-electron/result.json)。实际点击删除确认后：`deletePayloadExists=false`、version `h3ContinuationData.status=missing`；AV 文件行和 visible status 在 1280×800、1440×900、390×844 均存在，`overflow=false`，截图位于 `temp/phase2-r3-electron/history-detail-{1280x800,1440x900,390x844}.png`。实际点击 Continue 后 active 与 `videoExtensionDraft` 均保留 `sourceAssetId=history-video-1`、`sourceVersionId=history-video-1-version-1`、AV path 和 source video path；关闭并用同一隔离 userData 重开后字段完全一致。新增 GPU=0，未触碰真实用户 state/媒体/队列。
- **最终验证：** `npx.cmd vitest run --config vite.config.ts` Phase 2 focused 9 files/90 tests passed；`npm.cmd run verify` 当前状态为 178 unit files/1517 tests、6 integration files/81 tests、typecheck/build、contrast 20/20；typecheck 与 `get_errors` 无新增错误；文档链接/空白检查通过。
- **仍保留的阶段边界：** 没有启动 ComfyUI、没有 GPU 采样；Motion/Continuum consumer 接通、正式入口和提交预检仍属 Phase 3；真实生成质量、音画接缝和多轮生产矩阵仍属 Phase 4。Phase 3 未创建。

<a id="phase-2-review-followup"></a>
## 11. 2026-09-19 二次复核：仅收口剩余边界

结论：`changes-requested`。第9节原三例已加入测试且通过，可见状态/role/scope/context及AV兼容续写文案已落地；普通合法AV删除确认和普通Continue后重启来源一致的隔离证据已接收，不重新实施这些成功路径。以下均属第9节已有R1要求，不新增消费者/GPU范围。

### 仍阻止验收的R1反例

交接方将当前源码以`tsc -p tsconfig.electron.json --outDir temp/phase2-review-current`编译后，调用真实`HistoryDestructiveService.deleteJointAv`，使用内存store、确定性resolver和模拟unlink。目标版本有available artifact及manifest/payload，各实验独立；真实文件删除为0。

| 优先级/反例 | 最小触发 | 当前实测 | 期望 |
| --- | --- | --- | --- |
| P1：queue仅保留AV路径 | waiting extension有`h3ContinuumArtifactPath`指向目标payload，无嵌套artifact，sourceVideoPath是另一文件 | 未拒绝，unlink=2 | unlink=0，保留任务和文件 |
| P1：引用索引扫描期间新增引用 | 目标pair完成前两次resolver调用后，在第三次调用（`collectHistoryAuxiliaryReferences`处理目标版本时）向live store加入另一History的相同pair；store.get返回独立快照 | 未拒绝，unlink=2 | 删除前拒绝，unlink=0；不只覆盖目标路径解析期间的竞态 |
| P1：部分删除后假available | 第一份manifest unlink成功，第二份payload unlink抛EACCES | 操作报错，但原version仍`available` | 不报告全成功，旧/新可用性字段不得冒充完整可用；剩余文件仍可检查/安全处理，视频保留 |

控制位置：[history-destructive-service.ts](../../../electron/services/history-destructive-service.ts)的queue引用收集遗漏直接路径；`assertPathsExclusive`在引用扫描的await之后没有再验证其快照有效；`deleteJointAv`的catch只记录日志，不处理部分破坏后的状态。请在同一个删除服务边界收口，不在renderer加特判，不修改queue输入来规避引用。

保留第9节原要求：所有现有AV删除/整版清理入口不能绕过保护，managed owner只读；相同身份的sequence/draft引用不应因没有files而被跳过。补上述三例及部分失败恢复到现有service测试，保持已通过例不退化。不要通过只再挪一次`store.get()`声称解决异步扫描窗口。

### R2/R3证据的接收边界

- 可见摘要和常规局部替换已实现，保留；不能扩写为所有请求竞态/播放连续性已通过。当前回调仍在找不到summary时fallback整页render，且只比较asset/version，没有同版本请求代次检查；按第9节原要求验证同版多请求、快速返回同版、删除后迟到结果，不用重做布局。
- 已读`temp/phase2-r3-electron/result.json`：普通删除payload不存在、状态missing、普通Continue与同userData重启后IDs/path一致，有实际结果。其viewport字段只说明DOM中有文件行/状态，不能独立证明它们已进入截图。
- 已查看390x844截图，画面仅到播放器及视频概要，文件区未入镜。补滚动到文件区的截图，以及原第6节要求的Extend新增段/managed/缺失fixture、切模式保持来源、保存select/icon和播放/焦点证据；无需重复采样或重跑已接收的普通成功链。

### 本轮验证与下次回填

- 交接方相关7文件105项通过；节点版本检测26项、安装版本1项、collector9项通过。最终`npm.cmd run verify`为179单测文件1521项、6集成文件81项、typecheck/build、contrast 20/20通过。全量通过不否定上述额外探针反例。
- 交接方已直接将应用自带H3节点发布标识修到0.3.5，详见TASK；保留该修复，不再回改0.3.4。未修改真实用户queue/History/媒体或已安装插件，未启动ComfyUI/Electron或提交GPU。
- 下一轮只回填本节剩余项的实际结果，状态改`ready-for-review`或有具体原因的`blocked`，不要覆盖第10节或直接宣布Phase 2 accepted。Phase 1不重开，Phase 3仍未创建。

## 12. 剩余返修回填（待Luna）

记录三项反例及相邻删除入口检查、R2/R3缺失证据的补充、命令/结果和资源清理；逐项区分已修、未验证、具体阻塞。