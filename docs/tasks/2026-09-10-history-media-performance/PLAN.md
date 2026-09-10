# History 媒体加载优化计划
- 类型：实现计划；状态唯一入口为 [TASK.md](TASK.md)。
- 日期：2026-09-10；执行者为用户指定的 Luna，独立完成，不派子 agent、不额外安排高级模型复核。
- 当前只授权制定计划；后续用户交接后执行代码优化。
- 2026-09-10 细化：第 1–5 节是目标与范围，第 6–11 节固定模块接口、状态/失效规则、文件顺序和测试场景；执行者按第 11 节逐步实施，不再自行设计另一套架构。函数命名可顺应现有代码，行为与验收不可省略。

## 1. 判断与源码入口

**已做过缓存，但缓存未命中、图片重复加载和播放启动的成本仍然存在。** 不以“再加一个缓存”作为默认答案，先区分首屏呈现、磁盘命中、生成封面、首帧播放和主线程卡顿。

| 证据位置（当前参考行号） | 已确认行为 | 改进方向 / 不可外推结论 |
| --- | --- | --- |
| `src/renderer/pages/history/page.ts:321` | 图片列表 img 初始 src 为原图 URL，带 lazy 属性 | 浏览器可能先取原图，再被后续缩略图替换；lazy 不等于“只加载缩略图” |
| `media-helpers.ts:28–77` | miss 后 readImage → 整图 decode → canvas PNG → save → read → 设置 src | 避免整图重复 IPC/解码；显示不应等待缓存落盘完成 |
| `electron/services/media-read-service.ts:57` | readImage 整文件读取并转 base64 | 历史列表可使用已有受控媒体协议，不能改坏其他调用者的 readImage API |
| `media-helpers.ts:22–26,334–409` 与 `helpers.ts:historyCoverCandidates` | 视频封面并发 1，检查 4 个候选帧并 seek 回最佳帧 | 单条慢解码可拖住队列；10s 数据等待、每次 seek 1.2s 是上限，不是实测耗时 |
| `history-query-service.ts:349–370` | 每次磁盘封面命中仍解析源路径、stat 源/封面、读 metadata | 可去重/有界缓存校验证据；不能直接移除源变化校验 |
| `media-helpers.ts:128–168,445` | 视频读取有 in-flight 去重；URL/miss 容器缺少显式容量/TTL，图片仅有 clear 方法 | 核对生命周期、清理缓存/文件变更通知；避免永久 miss 或旧 URL、无界增长 |
| `media-controller.ts:startPreview` | mouseenter 即设置视频 src 并 play；mouseleave 暂停 | 快速扫过多张卡片可能创建无效加载；现有离屏释放保护要保留 |
| `media-read-service.ts:181–201` | 已支持 HEAD/Range 流式读取，无显式 HTTP 缓存校验头 | 不能声称当前每次都下载整段视频；须测 Range/取消/缓存实际行为 |

已有 [C04 性能证据](../../research/history/2026.9.1-wp-c04-electron-performance-evidence.md)针对大列表、布局和返回等场景；其媒体 IPC/decode 并发未测试，部分使用软件渲染，不能当本次加载性能基线。用户此次明确要求新优化，但不借此重启所有旧架构计划。

## 2. 范围与实施次序

先读当前 AGENTS、UX 的 History/Details、小节式 CHANGE_VERIFICATION；检查目标 diff。主要写入范围是 history 的 page/media-helpers/media-controller/image-media-controller/media-scheduler、必要的 history-query/media-read 服务、typed IPC 和相邻测试。若函数继续变大，将缩略图或缓存职责提取到小模块，不堆入 main.ts。

### P0：移除图片重复加载，缩短显示关键路径（必做）

1. 列表图片使用稳定占位与已知宽高比，原图 URL 保留在 data 属性中；优先已知缩略图 URL，不在模板阶段自动给所有卡片设置原图 src。详情、灯箱仍加载原图。
2. 命中缓存时只加载缩略图。miss 时优先通过现有 `studio-media://history/...` 解码原图一次，避免 `readImage` 整图 base64 跨 IPC。不把任意用户路径直接塞进无鉴权 URL，不取消路径恢复逻辑。
3. 已生成的可用缩略图先展示，缓存写入异步完成；写失败仍保持可见，并记录可重试错误，不能重新变成空卡。Object URL 如采用必须在替换、淘汰、路由释放时正确 revoke，避免正在显示时提前释放。
4. 保留 PNG alpha、颜色/方向、纵横比和原图操作；GIF/其他动态格式按当前行为处理，不未经确认改成静态。先保持 640px 现有规格，不同时引入格式/尺寸体系迁移。
5. 同 key 的生成应 single-flight，但每个 img 元素都要收到结果。检查 scheduler 的 completed Set：不能因为同 key 已完成就跳过新 DOM 的赋图，尤其详情返回、重复版本和相册视图。

### P1：降低视频封面首屏等待（必做，保留封面语义）

1. 保持热命中不打开视频解码器。冷 miss 先显示当前已解出的合格预览帧，再在预算内完成现有 4 候选最佳帧评估并落盘；不可覆盖用户明确选择的封面，也不把临时预览永久写成新的最佳帧策略。
2. 分离缓存查询队列与重解码队列。可视卡片优先，近视口预取其次，离屏任务可取消；已运行预取占满槽位时，用户悬停应抢占/取消低优先级工作，而不是只调整 pending 顺序。
3. 优先用单个重解码槽位 + 可中断、有限总预算解决队首阻塞，不能简单提高全局并发。确有测量收益且内存可控才试并发 2；不要与真实播放竞争多个隐形 video。
4. 被取消不算缺文件/损坏，不留下永久 completed/miss；超时后让后续可视卡继续，有限重试且只在再次可见/用户操作时触发，禁止轮询风暴。
5. 本轮不默认在每次生成后批量预生成所有历史封面，不添加 FFmpeg 批处理或新后台常驻服务。只有 P0/P1 测量仍证明必要，才将离线预生成作为后续方案另记，不扩张本轮。

### P2：有界缓存与悬停治理；协议优化仅按证据进入

- 热缓存：逐 key 的 in-flight 校验、有界 URL/miss 容器和失效是必做；批量 IPC、额外 metadata 索引不是默认范围，只有实测磁盘命中校验占热首屏 ≥20% 才增加其中一个。具体一致性规则见第 8 节。
- 容量：renderer URL/negative/完成状态使用有界策略；起始可设最多 256 条 URL 元数据，实际 Blob/解码资源另设小预算并测量。淘汰不得中断当前可见图或正在播放视频。不要另建与现有 cache-service 冲突的清理体系。
- 悬停：增加可取消的短意图延迟（建议起点 120ms）；点击、键盘播放和 seek 不受该延迟约束。只保持一个活动 hover preview，切换/离屏/路由退出及时撤销旧加载；预热保留期必须小且有界。
- 详情首帧：先测真实协议的 TTFB、Range、loadedmetadata、loadeddata/首个 presented frame。不要默认把所有视频 preload 改为 auto，也不转码用户视频或修改 MP4 容器。
- 协议：若测量证明缓存或重复路径解析占比高，再加限定到封面资源的验证缓存/ETag 等。封面 digest 目前并非媒体内容 hash，不能无条件设置永久 immutable；同路径覆写、删除和 query 版本变化必须正确。保留 HEAD/206/416、suffix range、流取消释放和错误恢复。

## 3. 先测什么，怎样控制成本

复用 `tests/fixtures/history-performance.ts`、现有 History 测试和 C04/Electron runbook，仅扩展一次小型 media 场景，不重跑全部 18 次启动矩阵。首次只做一轮有限基线；不扫描、复制或重建用户全部历史库。

- 隔离 userData/cache 和 fixture：首屏约 12–20 张卡片，混合短/长视频、大图、透明 PNG、缓存命中/未命中、缺文件；素材优先复用现有样例。数百条可复用小文件作为调度/DOM压力场景，不能伪装成数百个独立文件的磁盘性能。
- 基线/修改后各测冷缓存与热缓存一次序列；每序列重复 3 次轻量操作，报告中位数与最大值，不用 3 个样本宣称可靠 P95。
- 记录：首张封面可见时间、首屏全部可用封面完成时间、thumbnail cache hit/miss、原图加载次数/IPC字节、源 decode/seek 次数、活跃 decoder 峰值、悬停意图到首帧、详情到首帧、取消后的残留请求、Long Task、进出页面后的资源趋势。
- 缓存/IPC返回成功与图片实际 decode/显示分开；视频 play Promise 与真正首帧分开。不要只测方法耗时就声称用户看到更快。
- 只对最大一个剩余瓶颈允许一次有依据的额外调整；不因结果不理想循环全量构建、媒体预热、参数扫描。

## 4. 验收

**正确性门槛：** 热列表缩略图显示不得再次加载原图或创建视频解码器；单资源冷缩略图无重复整图 base64 IPC；同 key 多消费者全部显示；失败/取消可恢复；透明度、当前用户封面、版本身份、路径恢复、缓存清理、详情返回滚动/筛选、播放器暂停/seek/音量保持；内存与解码器不随多轮浏览单调增长。

**目标（须相同素材/视口/硬件路径对照，未达成如实记录）：**

- 热首屏封面可见完成时间较基线降低至少 40%，若原本低于 300ms 则保持且消除重复工作；冷图片首屏目标降低至少 30%。
- 冷视频首张合格封面可见时间降低至少 30%；首屏不再被一条超时视频拖住全部缓存命中卡。
- 快速划过卡片不触发大量无效视频加载；显式点击播放/详情首帧不比基线退化超过 10%（小样本噪声需说明）。hover 同时记录 mouseenter→首帧和 120ms 意图确认→首帧，允许增加这 120ms 意图延迟，但其余启动成本不得退化；不能只隐藏前 120ms 来宣称改善。
- 不通过降低图片质量、关掉 alpha、丢弃卡片、只显示占位或屏蔽错误达标。

建议 focused tests：`history-media`、`history-image-media`、`history-media-scheduler`、`history-media-controllers`、`history-cover`、`history-services`、媒体 protocol 对应测试；涉及播放器、页面或状态时补 `history-player-controls`/accessibility/performance。用可控 deferred/abort mock 捕获竞态，不编写仅复述实现的测试。

源代码稳定后一次 `npm.cmd run verify`，再进行受影响真实 UI smoke（图/视频、瀑布流/相册、详情返回；至少 1280×800 与 1440×900，按当前 UX 要求补必要视口）。dist/端口/userData 必须协调；不要启动带用户任务的默认应用而意外接管 ComfyUI。默认硬件路径不可用要记录，不用软件渲染结果冒充正常性能。

## 5. 收口

执行者独立复核 scoped diff，把实测结果和未测项写进本目录一份 `evidence/performance.md`，更新 TASK 与 Unreleased。不要改 persisted ID，不删除用户媒体/用户封面/整套缓存，不接管工作区其他任务。必要的新缓存版本只使旧派生缓存失效，不改历史实体。

最终报告：已有缓存为何仍慢、具体减少了什么工作、冷/热/首帧实测、测试结果及限制。无需高级模型再全面复查。首次未得到媒体实测不得宣称提速；本计划本身不代表已经实现或测得改善。

## 6. 目标结构、接口与改动文件

### 6.1 调用链

```text
page.ts 输出身份、source URL、宽高比，不启动原图请求
  ↓
image-media-controller / media-controller：每个 DOM 独立订阅和取消
  ↓
media-resource-store（新增）：按资源共享任务，向所有订阅者交付结果
  ├─ memory URL / 有限 miss 状态
  ├─ 轻查询池（上限 8）：主进程校验磁盘封面
  ├─ 图片生成池（沿用上限 3）：协议原图 → decode → 640px PNG
  └─ 视频生成池（上限 1）：临时合格帧 → 完整候选选帧
  ↓                                     ↓
DOM 加载生成结果并显示             持久化队列（上限 1）
                                       ↓
                      history-query：校验源版本 → 保存 → 返回封面 URL
```

把现有 media-helpers 拆出的职责放进最多两个新 renderer 模块：`media-resource-store.ts`（共享结果、订阅、队列、LRU）和 `thumbnail-producers.ts`（图片/video 生成）。已有 media-helpers 保持 facade，coordinator 不直接管理新队列；不要额外建立同功能第三套缓存。

`media-scheduler.ts` 只负责 pending/running、优先级与并发。把“永久记住已完成 key”的职责移到有界结果缓存，删除或替代目前不可失效的 completed Set。scheduler 不保存 DOM 元素；元素是否收到结果由订阅层决定。现有仅断言 completed 去重的测试要改成断言有效资源缓存去重，不能让旧测试约束一个已确认有缺陷的生命周期。

### 6.2 Renderer 内部接口示意（不进入 persisted state）

```ts
type MediaRef = {
  key: string;                 // 沿用现有封面 key，不能只取文件名
  kind: "image" | "video";
  sourcePath: string;          // 沿用实际路径恢复输入
  sourceUrl: string;           // 已有受控 studio-media://history URL
  width?: number;
  height?: number;
  coverTime?: number;
  duration?: number;
  seed?: number;
};
type Presentation = {
  url: string;
  phase: "preview" | "final"; // visual quality；与是否已写盘无关
  origin: "disk" | "generated";
  sourceRevision: string;
};
type Consumer = {
  priority: "interactive" | "viewport" | "prefetch";
  signal: AbortSignal;
  // 返回 true 表示该元素已成功加载此图；不因其他元素 ready 代为标记。
  onPresentation(value: Presentation): Promise<boolean>;
  onFailure(reason: "missing" | "decode" | "timeout" | "io"): void;
};
interface MediaResourceStore {
  subscribe(ref: MediaRef, consumer: Consumer): () => void;
  invalidate(keys?: readonly string[]): void;
  dispose(): void;
}
```

- 同一 key 的 3 张卡片必须是 3 个 subscriber、1 个 producer。任一取消只移除该 subscriber；最后一个取消才 abort 尚未结束的 producer。
- 不让 onPresentation 等待阻塞其他 subscriber 的交付；单个元素 throw/reject 不能使共享生产失败。每个 consumer 用自己的 requestId + signal + isConnected 检查迟到结果。
- 同 key 请求的 kind/sourceUrl/sourcePath 冲突时视为源代次变化，不能把旧生产结果交给新绑定。
- 命中已有结果仍必须为新 subscriber 执行 onPresentation；不能以 completed.has(key) 直接跳过。
- sourceUrl 有效但 sourcePath 空时，仍允许通过协议展示/生成会话内图片；不能仅因缺少 absolutePath 把原来可看的旧历史卡变空。无可靠源指纹时不保存派生缓存，详情/原图路径继续可用。

### 6.3 主进程最小兼容增量

保留现有 `readHistoryCover(key, sourcePath): Promise<string|null>` 与 `saveHistoryCover(...): Promise<boolean>` 供其他调用者使用。本流程新增两个 typed 方法，名称可调整但字段与分支必须保持：

```ts
type CoverLookup =
  | { state: "hit"; url: string; sourceRevision: string }
  | { state: "miss"; sourceRevision: string }
  | { state: "unavailable" }; // 确认源无法解析；I/O 异常用失败返回/抛错区分

lookupHistoryCover(key: string, sourcePath: string): Promise<CoverLookup>;
saveHistoryCoverIfCurrent(input: {
  key: string; sourcePath: string; sourceRevision: string; data: ArrayBuffer;
}): Promise<{ state: "saved"; url: string } | { state: "stale" | "failed" }>;
```

`sourceRevision` 是主进程按**实际恢复后的路径 + size + mtimeMs + 当前 key 失效代次**产生的非持久标识；不是鉴权 token，也不能相信 renderer 传来的文件版本。生成开始前 lookup 获得 revision，save 重新解析并比对。这样源文件在 decode 期间改变、被删除或重定位时，不会把旧图保存成新文件的缩略图。

相关改动顺序：`src/types.ts` → `history-query-service.ts` → `history-ipc.ts` → `preload.cts` → renderer typed client/asset capability 的实际定义（用 rg 查出现有 readHistoryCover 引用）→ 新 resource store。保持 AppApi 边界，不能在 renderer 直接 import fs 或访问 preload global。

主进程新增方法复用现有大小限制、metadata、路径恢复和 digest 算法，不复制 path/version 来源；保存成功直接返回最终 URL，消除原来的 save 后再次 read IPC。同 key 写入在主进程串行；失效/删除须在入口先增代次，并与最终提交协调，旧保存不得在删除完成后复活封面。不同 key 的读取不串行。

## 7. 精确状态与时序

### 7.1 图片 DOM：来源与呈现分离

| 状态 | 进入条件 | DOM 规则 | 下一步 |
| --- | --- | --- | --- |
| deferred | 源身份有效、尚不在预取区 | 无网络 src、宽高比和占位保留 | observer → queued |
| queued/loading | 已订阅或等待实际图片 load | 显示 loading；不能依据 `img.complete` 单独进入 error | 成功加载 → ready |
| ready | 当前绑定 URL 已 load/decode 且 naturalWidth > 0 | 显示图片；记录实际呈现 URL | 写盘不影响此状态 |
| missing/error | 已确认源不存在/当前真实请求失败且无可用图 | 现有恢复/重试 UI | 用户重试重新订阅 |
| canceled | 离屏、被替换或路由销毁 | 不显示 error；已有图可保留 | 再入视口可重订阅 |

`imageMediaSource()` 继续返回逻辑原图 URL，用于判断是否有源和 retry；新增“已分配呈现 URL/正在加载”标记判断 img 事件。移除初始 src 后 `img.complete === true && naturalWidth === 0` 很常见，setupSurface 必须保持 loading/deferred，不能立即调用 handleError。不要用 1px 图片的 load 冒充媒体 ready。

冷图片时序固定为：

1. subscribe → lookup miss；同资源只发一次 lookup。
2. 在图片池创建离屏 Image，先注册事件/abort，然后仅给它设置 sourceUrl。设置 `crossOrigin` 要沿用协议支持并以真实 canvas 可读 smoke 核验，不能直接禁用安全策略解决 tainted canvas。
3. decode 成功 → 保持当前 640px/PNG/alpha 行为 → 获得 Blob。
4. 创建临时 Object URL，发布 final presentation；每张当前卡片 load/decode 成功后各自 ready。**此处不 await 保存。**
5. 保存队列提交 IfCurrent；saved 时记录磁盘 URL，当前已显示 Blob 的卡片无需为了换 URL再加载一次，下次订阅可用磁盘 URL；failed 保留会话图并记录一次错误；stale 丢弃该代结果，至多发起一次新 lookup，不无限自重试。
6. 图片 decode 抛错、abort、超时用 try/finally 移除监听、清空临时 image.src、释放 canvas/对象引用。abort 必须使任务及时 settle；不能只发 abort 信号后永远占槽。

临时 Object URL 属于 store，不能由任意单张卡片随意 revoke。活跃绑定持有引用，切换图片要等新图片 load 成功或旧绑定释放后减少旧 URL 引用。未保存成功的 Blob 保留在有界 LRU；引用归零且被淘汰时 revoke。异步保存仅保留序列化 bytes，不保留 DOM。

### 7.2 视频封面：preview 不能等同最终缓存

引入 `presentationPhase=none|preview|final` 和 `persistence=pending|saved|failed` 两个独立状态，或等价内部字段。现有 `historyCoverCached`、`has-history-cover` 和 saveHistoryCover 的早退出条件必须逐一适配；**临时 preview 不能设置“最终封面已缓存”，否则完整选帧永远不会继续。**

- 缓存 hit → final，且不得设置任何 video.src。
- 冷 miss → 一个离屏 video；loadeddata 后以现有 score 门槛检查已解帧。如果合格，先编码/发布 preview；不合格就继续候选，不展示黑帧充数。
- 继续现有候选顺序、评分和最终回 seek。每次成功 seek 后检查 signal、源代次和用户是否已播放；获得首个合格候选也可发布一次 preview，但全流程最多一次 preview 编码 + 一次 final 编码，不逐帧创建 Blob。
- 四候选完成并回到 bestTime 才发布 final 并提交保存。用户选择的 image coverVersionId、auto/manual 模式及现有封面来源不做迁移；按既有 preferred version 决策操作，不另挑版本。
- 常规任务总预算沿用原上限组成（数据最多 10s、每次 seek 1.2s），不通过随意压缩它误杀长视频；另增加抢占边界：可视新任务被低优先级预取阻塞时，在当前 await 可取消处撤销预取。对于一条已经预览可见的慢任务，后续候选优化降到 prefetch，给尚无封面的可视任务优先机会。
- 需要让出视频槽位时，保存 `nextCandidateIndex/bestTime/bestScore` 作为轻量进度，销毁该离屏 video；以后恢复要重载元数据并 seek，不能保留挂起 decoder。只有处于同一 sourceRevision 才可复用评分。没有人消费时删除进度，避免全历史无限积累。
- 调度让出与最终取消分开：yield 只终止当前 decoder attempt，保留 subscriber 和该资源的 deferred 状态，不调用 onFailure；重新排队必须等旧 attempt 的 finally 释放完槽位。只有最后订阅者取消/资源失效才终止整个资源请求。
- seek 的等待结果须区分 `seeked`、timeout、abort。超时不能把仍停在上一帧的视频当作目标候选评分；没有成功候选时不生成伪 final。最终回到 bestTime 也要确认该帧可读后才能编码。
- 有 preview 但 final 超时：preview 留在当前会话，不写成最终缓存；记录 `refinement=deferred/failed`。首次重入视口可再尝试一次本 sourceRevision，连续失败不定时重试，用户重试可重置次数。

### 7.3 调度与悬停

固定起始值：查询并发 8、图片生产并发 3、视频封面并发 1、保存并发 1；不得通过提升并发达标。优先级 interactive > viewport > prefetch，同级 FIFO；预取范围沿用现值作为基线，计时后才缩小，不同时改多个参数。

悬停 manager 由 history media runtime 持有，在整个当前列表共享：

1. mouseenter：启动 120ms timer；mouseleave 前到期未发生则取消，video.src 不变。
2. timer 到期：停止上一个 hover，取消所有后台视频封面生产，待其卸载/settle 后启动当前 hover。缓存查询/图片渲染不需要停。
3. 显式播放/seek/键盘操作立即进入互动路径，不等待 120ms；保护正在拖动的 seek，不在 pointercancel/外部刷新时错误跳回封面。
4. mouseleave：暂停、保持封面可见；最多 500ms 可取消保留窗口用于快速回到同卡，随后卸载 src。任何时候最多一个保留 hover video；新的互动立即结束旧保留。
5. 路由退出、离屏、删除/版本切换：取消 timer 和保留期、停止 src/监听、清除 manager 引用。后台封面任务在没有活动互动时恢复，不 busy-loop。

操作暂停/取消产生的 play Promise rejection 不显示缺文件。卡片 video 的重加载和详情播放器完全分离；不要让新 hover manager 控制 detail 的 video、音量、播放进度或 loop 设置。

## 8. 缓存、失效与异常的固定规则

| 对象 | 保留/命中规则 | 失效/淘汰规则 |
| --- | --- | --- |
| 正结果元数据 | 上限 256 key；同一资源可供多个 DOM 使用 | 无订阅者的 LRU 先淘汰，代次变化立即失效 |
| 生成 Blob | 未引用 Blob 总预算 32 MiB；当前显示的引用不强行释放 | 超预算停止额外 prefetch，清理未引用项；释放必须 revoke |
| disk lookup in-flight | 同 key+源身份只有一个；结果通知所有消费者 | settle 后移出 pending；abort 不写 negative |
| disk miss | TTL 固定 1 秒，仅确认合法源、缓存不存在时写入 | save、retry、外部失效即清除；不代表原媒体缺失 |
| I/O/decode 错误 | 当前消费者可见、单代有限重试 | 不永久记忆 completed；不自动无限重试 |
| 候选评分进度 | 只保留当前/近视口有效订阅资源 | 源代次变、无人订阅或预算淘汰时删除 |

内存 URL 本身不能证明源未变。每个重新绑定/重新进入页面的资源复用 in-flight lookup 校验，**保留当前源文件 stat 校验**，不在本阶段用 TTL 完全跳过它；同一绑定的重复 observer 不再重复校验。优化命中磁盘元数据读取只在第 2 节阈值触发后做，使用 source/cover stat 校验后的 memo，不静默延长正确性窗口。

失效接线明确到动作：

- `history-destructive-service` 已调用 removeCoverCacheKeys 的路径：其主进程 key 代次递增；成功/部分删除后 renderer 根据现有 state change diff invalidate 对应 key。
- image/video preferred version 或 file 路径、size/mtime 元数据变化：coordinator 计算受影响 key，不因无关队列进度清空整个资源 store。不得为每次 render 遍历全部文件或请求 stat。
- output/imageOutput/comfyInstallDirectory 路径变更：清空路径解析相关内存证据并让新绑定重查；不要改历史 IDs。
- 设置中的现有 cache clear：先核对实际清理种类。当前 cache-service 主要清 session/temp，不应擅自扩大为删除 historyCoverDirectory。session 清理不代表磁盘封面已删；只使相关呈现/lookup证据重新验证，不能重建所有派生图。
- cover URL 加载 404/损坏：删除该 key 的正内存项与 completed/miss，重新 lookup/生成最多一次；禁止 onerror 直接对整页卡片调用 loadHistoryCardVideo。确认源不存在才用 missing UI。
- producer/save 迟到：每轮捕获 key generation；发图、保存提交和回填缓存前检查 generation。更换绑定/删除后旧结果不写 DOM、不覆盖新结果。

新增 revision 保存入口不迁移历史实体。原 history-cover-v3 的有效磁盘缓存必须仍能读取；只有输出尺寸/格式或算法确实改变才考虑 bump 派生缓存版本，本轮维持现有最终算法因此默认不 bump。

## 9. 文件级实施与测试交付

| 步骤 | 要编辑的主要文件 | 本步交付与禁止事项 |
| --- | --- | --- |
| S0 基线 | 只读当前文件；小型媒体采集脚本/fixture | 记录路径、缓存层和真实加载计数；不先改调度参数 |
| S1 安全保存 | src/types、history-query-service、history-ipc、preload、实际 typed client | 新 lookup/IfCurrent；保留旧 API；对应 history-services/媒体边界测试 |
| S2 共享资源 | 新 resource-store、media-scheduler、media-helpers facade | 共享生产/逐消费者交付、可取消、有限缓存；不处理整个页面布局 |
| S3 图片接线 | page、image-media-controller、thumbnail-producers | 去原图初始 src、先展示后保存、空 src 状态修正；复制/详情仍原图 |
| S4 视频接线 | thumbnail-producers、media-controller、media-helpers | preview/final 分离、优先级让出/释放、hover manager |
| S5 生命周期 | coordinator、必要的现有清理动作适配 | invalidate、路由和版本恢复；不为普通 render 销毁资源 store |
| S6 测量与关闭 | fixture/harness、TASK/evidence、Unreleased | focused → 一次 verify → 实际 media smoke；只修一个已证实的残余瓶颈 |

S1–S5 是一个实现包，由同一 Luna 依次完成，不是五个子任务派发。若公共文件正被其他任务修改，先完成新 helper 和对应测试，重读并协调后再接线，不能整文件替换其他任务成果。

新增集成测试放进 `tests/history-media-controllers.test.ts` 或相邻专用新文件，复用已有 FakeIntersectionObserver/deferred，不只测纯函数。以下每个 ID 必须有测试或明确标为真实 UI 测试：

| ID | 安排与操作 | 必须断言 |
| --- | --- | --- |
| I01 | gallery 有 sourceUrl、无 src、complete=true/width=0；mount | loading/deferred；没有 error/原图请求 |
| I02 | lookup 命中 jpg/png；触发可见 | 只加载封面；readImage=0、源 decode=0 |
| I03 | lookup miss；原图 decode 完成，save deferred | 卡片在 save resolve 之前 ready；sourceUrl 仅一次 decode；readImage=0 |
| I04 | I03 save reject/false | 已显示图片不消失；错误只记录一次，不无限重试 |
| I05 | 三个 DOM 同 key，依次订阅，取消一个 | lookup/生产各一次，其余两个各收到结果 |
| I06 | 最后订阅者离屏后重新进入 | 旧生产 abort/settle；新请求可启动，无永久 completed 阻止 |
| I07 | DOM 从 key A 改 B 后 A 才 resolve | 只显示 B，无 A URL 泄漏/错误提示 |
| I08 | PNG alpha + 竖图；详情/复制原图 | alpha、ratio、原图 URL/像素操作保持；实际 canvas 视觉 smoke |
| I09 | 有协议 URL、缺 absolutePath 的旧历史 | 可显示；不写无 revision 缓存；恢复/定位入口仍符合实际源信息 |
| V01 | 视频缓存 hit | 0 次 video.src / load / play |
| V02 | miss 首帧合格，候选流程 deferred | preview 可见且 persistence 未 saved；完整流程继续 |
| V03 | 第一帧黑、后候选合格 | 不以黑帧达标；最后持久化仍现有评分 bestTime |
| V04 | preview 后 refinement timeout | 保留 preview，不冒充最终磁盘 hit；后续 key 可运行 |
| V05 | 正在预取慢 video，用户 hover 到另一卡 | 后台先清 src/settle，再启动互动；无两个后台 decoder |
| V06 | 80ms 内移入移出 10 卡；最后一张停留 | 前 9 张不启动；最后一张仅一次；点击绕过 120ms |
| V07 | hover → 500ms 内回到同卡/转向另一卡 | 复用或释放按规则；最多一个 hover 保留；所有 timer 最终取消 |
| C01 | decode 完后源文件 size/mtime 变，再 save | stale；旧图不保存成新源指纹 |
| C02 | save 在途，delete/invalidate；保存晚完成 | 不复活缓存，不回写已删 DOM |
| C03 | miss → 外部/另一个流程保存成功 → 重新可见 | miss TTL/失效允许读取新图 |
| C04 | 缓存 URL 404，但原媒体存在 | 至多一次重新 lookup/生成，无整页视频回退风暴 |
| C05 | 300 个 key、多轮进出页面/切换布局 | 容量与未引用 Blob ≤预算；引用正确释放，无线性增长 |
| C06 | 查询/生产 task abort 时 await 不自行完成 | abort handler/timeout 使队列释放；新任务能够执行 |
| P01 | 原 protocol 的 GET/HEAD/206/416/suffix range | 旧行为保持；若改流取消，取消后文件流 close |
| U01 | 图/视频、相册/瀑布流、详情返回、删除一个卡片 | 列数、scroll/filter、focus、用户封面版本保持 |
| U02 | detail 中 play/pause/seek/音量，收到无关状态刷新 | 播放元素/进度不重建；hover manager 不介入 |

建议一次 focused 命令（以执行时真实文件名为准，新增测试需加入）：

```powershell
npm.cmd test -- --run tests/history-media-controllers.test.ts tests/history-media-scheduler.test.ts tests/history-image-media.test.ts tests/history-cover.test.ts tests/history-services.test.ts tests/media-document-services.test.ts tests/history-player-controls.test.ts
```

早期只跑本步新增的测试文件；S5 完成后跑上述组合。`history-performance.test.ts` 与 accessibility 在页面接线完成后补跑，不每改一个函数全量执行。

## 10. 可复现的媒体采集规格

不要直接运行 C04 默认 `--scenario all`。现有 C04 提供启动/IPC/隔离 fixture 帮助，但 `history-500` 不是本次真实媒体解码基准。为它增加一个明确的 `history-media` 场景，或一个引用其可复用 helper 的薄脚本；不能复制整套启动器，不引入新的“另一个 app”。

### 固定素材与模式

- 视频列表：12 个资源，短横屏 4、竖屏 2、长视频 2、黑色开头 1、重复资源多消费者 2、缺文件 1；资源尺寸/时长/codec 写 manifest。共享同文件的项明确标记，不计为不同物理文件 I/O。
- 图片列表：12 个资源，常规 JPG/PNG 4、大分辨率图 3、透明 PNG 2、竖图 1、重复资源 1、缺文件 1。只读复用现有获授权素材或小型合成 fixture，不复制用户全部媒体。
- 冷磁盘：只清理本次隔离 fixture 的派生缓存，不清用户目录；每个采样重建 renderer runtime。热磁盘：预热后保留磁盘、重建 renderer runtime；热内存：保持同 runtime，详情往返/换布局再返回。三种模式分开汇报，不能混称 warm。
- 两个渲染视口 1280×800/1440×900只做正确性截图；性能计时固定主视口一种。记录真实 viewport、devicePixelRatio、硬件加速状态、GPU、Electron/构建摘要。

### 时间点定义

`t0` 为用户切到 History 后本次列表开始 mount；每项 `t_visible` 为 img load/decode 成功且 width>0 后的下一个 requestAnimationFrame。首屏集合在 t0 后布局稳定时按实际 bounding rect 固定，**缺文件不从计时中悄悄删掉**：分别记录可用项 all-ready 和缺失项进入可恢复终态的时间。

记录 video 的 requestVideoFrameCallback（存在时）作为 first-presented-frame；不支持则用 loadeddata+下一帧且明确 fallback，不能把 play resolved 当播放首帧。协议 Range 请求次数不同于原图 decode 次数，两者分别计数。

每种 cache 模式 baseline/after 各 3 次操作采样，在同一 fixture、硬件路径与主视口下执行；报告中位数/最大值。不要求为布局正确性再做所有性能组合，也不重复启动矩阵。既有同版本同 fixture 的可核验测量可以复用。

输出一份机器可读 JSON 到忽略的 temp 目录，最少包含：

```text
build/source digest, fixture id, cache mode, viewport, hardware mode
firstVisibleMs, allAvailableVisibleMs, missingTerminalMs
hoverFromEnterMs, hoverAfterIntentMs, detailFirstFrameMs
coverLookups, coverHits, sourceImageLoads, readImageIpcBytes
sourceDecodes, seeks, activeOwnedVideoPeak, canceledRequests
objectUrlsCreated/revoked/live, unreferencedBlobBytes, longTaskMaxMs
```

只在受控 fixture 开启计数，输出匿名 key/id，不记录用户路径/图像 base64。计数 `activeOwnedVideoPeak` 只证明 app 自建活跃 video 数，不冒称 Chromium 实际硬件 decoder 数；真实内存趋势需要独立记录并注明局限。

先确认每个模式是否真的 hit/miss，才比较性能。若 baseline 本来全部磁盘 miss 而 after 全部 hit，结果不可比较。若无法启动隔离 Electron/硬件路径，照实交付已完成静态/fixture测试与精确阻塞，不用空 src 或 jsdom 冒充媒体速度。

## 11. 执行检查单与决策边界

1. **开工记录**：git status/scoped diff；列出重叠文件；读本 TASK、计划第 6–10 节；只补必要真实函数上下文。不要重新生成一份 plan 或派调查 worker。
2. **基线结束条件**：明确 cold-disk/warm-disk/warm-memory 中主要耗时来自源 decode、选帧、缓存校验还是页面布局；有一份小样本数据即进入实现，不做全库画像。
3. **S1–S3 结束条件**：lookup/保存 revision 竞态正确；I01–I09/C01/C02 通过；图片命中不读原图，miss 不经 base64，保存等待不挡显示。
4. **S4–S5 结束条件**：V01–V07、C03–C06 通过；preview/final 分离、抢占和路由释放可复现；旧版本封面读取与已有播放行为保持。
5. **可选性能动作只允许一项**：如果 warm-disk 校验 ≥20% 热首屏，选 metadata memo 或批量 lookup 其一；如果证据显示视频容器/codec自身解码慢且无排队竞争，记录限制，不转码或扩张格式支持。没有证据不改 HTTP 缓存头或全局渲染架构。
6. **最终门禁**：focused 组合、一次 verify、受影响两视口真实 UI、媒体基准。后续仅因改动/失败/缺失证据重跑相关部分。其他任务失败保持原状并注明，不能借机修全仓库。
7. **交付文档**：TASK 标出每步完成/未完成与原因；单份 performance.md 放数字/限制/复现命令；Unreleased 描述实际结果，不写未经测量的倍数。保留这些具体约束作为将来维护依据，不把原始长日志纳入 Git。

本计划已决定使用受控协议解码、逐消费者共享结果、先呈现后持久化、有代次的保存、现有最终选帧算法及有界 hover。执行者无需为这些方案反复请示；如果实际代码或现有行为与计划证据不一致，先完成独立部分并报告具体冲突，不自行引入持久化迁移、第三方新解码依赖或后台批量处理。
