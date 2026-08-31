# History 大数据量性能优化实施计划

状态：已实施（Phase 0–5；Phase 6 未启用）
目标执行 Agent：Luna  
范围：当前生产 Renderer 的 History 列表页（视频与图片、瀑布流与相册模式）  
不在范围：History 持久化结构、IPC 数据分页、详情页信息架构、历史原型页面

## 0. 实施状态与本轮核验（2026-08-31）

本轮审计确认，Phase 0–5 的实现已经存在于当前生产 Renderer：确定性 500 条 fixture 与合成基准、图片视口调度（并发上限 3）、视频近视口封面调度（并发上限 1）、批量 masonry 分列、标题分批测量，以及统一的 History 滚动快照/锚点恢复均已落地。Phase 6 的 `content-visibility` 实验未启用，也没有引入虚拟列表；当前合成证据没有触发虚拟化升级门。

本次使用 jsdom、无真实媒体文件的 500 条基准得到以下结果。`renderMs`、`domParseMs` 和 `controllerMountMs` 是测试 harness 指标，不是 Electron 首屏时长，也不能单独证明 50 ms Long Task 预算或 70% 基线下降：

| 类型 | 布局 | 记录/卡片 | render ms | DOM parse ms | controller mount ms | 媒体调用（挂载 → 视口） | 峰值并发 |
| --- | --- | ---: | ---: | ---: | ---: | --- | ---: |
| video | masonry | 500 / 500 | 8.62 | 483.97 | 98.68 | cache 0 → 12；warmup 0 → 12 | 1 |
| video | album | 500 / 500 | 7.25 | 412.49 | 75.66 | cache 0 → 12；warmup 0 → 12 | 1 |
| image | masonry | 500 / 500 | 19.71 | 398.95 | 158.56 | thumbnail 0 → 6 | 3 |
| image | album | 500 / 500 | 7.45 | 393.32 | 134.84 | thumbnail 0 → 6 | 3 |

自动化核验：

- History focused suite：13 个文件、54 个测试通过。
- `npm.cmd run verify`：140 个文件、1115 个测试通过；TypeScript typecheck、Vite 生产构建（2278 modules）和对比度检查（20/20）通过。
- 500 条基准断言：四种类型/布局均保留 500 张语义卡片；挂载阶段没有全量图片 loader、视频 cache read 或 warmup；图片/视频峰值并发分别不超过 3/1。

仍未验证的项目：真实媒体文件上的 Electron DevTools before/after Long Task 对比、`1280×800`/`1440×900`/约 `760px` 的手工 History → Detail → History smoke，以及真实 GPU/解码压力。因此本计划只将 P02 标记为“实现与自动化验收完成”，不把合成数值写成运行时性能承诺。

## 1. 目标与成功标准

当视频或图片历史达到数百条时，进入 History、从详情返回 History、切换布局和滚动过程中不再出现明显主线程卡顿，同时完整保留当前功能与交互。

必须同时满足：

1. 进入包含 500 条视频或 500 个图片项目的 History 时，首个可交互帧不等待全量媒体读取、原图解码、视频解码或封面生成。
2. 从 History 打开详情再返回时，回到原卡片附近且视觉位置不发生可感知跳动；延迟加载媒体后也不能把用户推离原位置。
3. 不改变筛选、排序、视频/图片 Tab、瀑布流/相册切换、详情导航、上下文菜单、键盘访问、删除、评分、收藏、标签、封面缓存、悬停播放和错误恢复功能。
4. 不修改 `AppState.history`、`AppState.imageHistory`、持久化格式、preload 或 IPC payload。
5. 第一阶段不加入分页控件、不截断搜索结果、不减少可访问树中的历史卡片、不引入第三方虚拟列表依赖。
6. 500 条基准下，History mount 阶段不得发起与记录总数线性相等的图片 IPC 读取或视频解码；媒体工作只能随视口接近而发生，并有并发上限。
7. 以优化前后同一 fixture、同一窗口尺寸、同一布局的测量结果证明改进；不能仅以“感觉流畅”验收。

建议性能预算（以 Electron DevTools Performance 面板和测试计数共同确认）：

- 500 条列表首次进入后，单个同步 Long Task 不超过 50 ms；若当前测试机无法达到，至少比基线降低 70%，并在交接中记录绝对值。
- 首屏稳定前只允许加载视口及预取边界内媒体；图片缩略图生成/读取并发最多 3，视频封面生成/解码并发最多 1。
- 空闲停留但不滚动时，不得继续遍历并处理全部几百条屏外视频。
- History -> Detail -> History 返回后，目标卡片中心相对视口中心误差不超过 8 px；若目标卡片已删除，则退化为保存的 `scrollY` 并 clamp 到文档范围。

## 2. 当前实现与根因

### 2.1 页面和状态所有权

- `src/main.ts`
  - `createHistoryPageViewModel` 构造页面状态。
  - `historyPage` / `imageHistoryPage` 调用列表渲染器。
  - `openHistoryDetail` 在视频列表进入详情前调用 `historyLayoutController.captureScrollPosition()`。
  - `openImageHistoryDetail` 当前依赖滚动监听已经保存的位置；实施时必须显式确认并统一捕获语义。
  - `returnToHistory` 设置 `scrollRestorePending`，重建列表后恢复。
- `src/renderer/pages/history/page.ts`
  - `renderHistoryPage` 和 `renderImageHistoryPage` 对筛选后的全部记录执行 `map(...).join("")`，一次生成全部卡片。
- `src/renderer/render-coordinator.ts`
  - 常规 render 会替换 `root.innerHTML`，History 控制器和媒体生命周期随后全部重新挂载。

### 2.2 已确认的主要压力源

1. `src/renderer/pages/history/layout-controller.ts`
   - `layoutMasonry` 每放入一张卡都会对多个列调用 `getBoundingClientRect()`。
   - 读布局、写 DOM、再读布局交错，卡片越多越容易产生强制同步回流，复杂度接近 `卡片数 × 列数`。
2. `src/renderer/pages/history/media-controller.ts`
   - mount 时枚举全部视频卡，为每张卡注册多组监听器并交给 IntersectionObserver。
   - 视频源已按视口延迟设置，这部分方向正确，但不能被后续优化破坏。
3. `src/renderer/pages/history/media-helpers.ts`
   - 图片 mount 时对全部 `[data-image-history-preview]` 立即调用 `loadImageHistoryThumbnail`。
   - 缓存未命中时会 IPC 读取原图、解码、Canvas 缩放、PNG 编码并写缓存；数百条时会形成无上限并发。
   - `scheduleHistoryCoverWarmup` 在 1.2 秒后顺序遍历全部视频卡。即使是顺序执行，也会长期占用视频解码、seek、Canvas 和磁盘，造成进入页面后的持续卡顿。
4. `src/renderer/pages/history/layout-controller.ts`
   - `bindTitleMarquees` 给全部标题注册 ResizeObserver，并在任一变化时重新测量全部标题。
5. `src/renderer/render-coordinator.ts`
   - 任意全页 render 都会重新触发上述 mount、查询、观察和媒体调度；优化必须具备取消、去重和缓存复用能力。

### 2.3 当前滚动语义（必须保留）

- 普通页面 -> History：恢复上次 History `scrollY`。
- History -> 详情 -> History：恢复离开列表时的位置。
- 视频/图片 Tab 切换：当前有意调用 `resetHistoryScroll()` 并回到顶部。
- 瀑布流/相册切换：当前通过 `captureLayoutAnchor` / `restoreLayoutAnchor` 保持视口附近 asset。
- 筛选/排序提交：当前触发 render，但不显式重置滚动；实施前先用 fixture 记录当前可见行为，优化后保持一致，不能顺便重新定义产品行为。
- 浏览器后退键、鼠标侧键和顶部返回按钮都通过 `returnToHistory`，必须共用同一恢复路径。
- `src/renderer/shell/controller.ts` 当前把 `setHistoryScrollPosition` 声明为接收像素参数，但 `src/main.ts` 实际注入的是忽略参数并调用 `captureScrollPosition()` 的函数。实施时应把接口改名并收敛为无参数 `captureHistoryScrollPosition(): void`；不要新增第二个由 Shell 直接写入像素值的状态入口。

## 3. 推荐策略与不采用的方案

### 3.1 第一阶段采用：完整语义 DOM + 视口媒体调度 + 批量布局

第一阶段保留全部筛选结果的卡片 DOM。优化重点是：

- 不让屏外媒体产生 I/O、解码和 Canvas 工作；
- 限制图片和视频媒体并发；
- 消除瀑布流布局中的读写交错；
- 减少全量 ResizeObserver 回调；
- 强化滚动锚点恢复，抵抗异步媒体尺寸变化。

这是当前代码架构下风险最低的做法。卡片仍存在，因此现有 selector、Tab 顺序、辅助技术、上下文菜单和详情定位不需要重写。

### 3.2 `content-visibility: auto` 只作为测量后的补充

Chromium/Electron 支持 `content-visibility: auto` 和 `contain-intrinsic-size`，可跳过屏外布局/绘制且保留可访问树。但不能直接把它当主修复：

- 当前自定义瀑布流需要卡片高度做分列；错误的 intrinsic size 会改变列分配或产生滚动跳动。
- 必须先完成无强制回流的稳定分列，并证明相册和瀑布流的高度占位准确。
- 只能在独立提交中试验；若出现返回位置漂移、布局跳动、Find in page/Tab 异常，立即移除，不阻塞主方案。

### 3.3 第一阶段不采用渐进追加或完整虚拟化

不要先做“首屏 40 条 + 无限追加”，也不要立即引入 TanStack Virtual：

- 渐进追加会改变浏览器查找、Tab 顺序、总结果可达性以及返回到尚未追加卡片时的行为。
- 可变高度、多列瀑布流虚拟化需要稳定 key、动态测量、lane 分配、overscan、窗口滚动 offset、sticky heading scroll margin 和 measurement cache。
- 当前 Renderer 不是 React；引入框架适配层或自行实现虚拟瀑布会扩大风险。
- 虚拟化会让卸载卡片上的焦点、上下文菜单目标和媒体播放生命周期变成新的状态问题。

只有第 8 节性能门未达标时，才进入虚拟化设计阶段。

## 4. Preserve List（任何一项回归都不得合并）

### 4.1 列表与导航

- 视频和图片使用独立 Tab；切 Tab 回顶部。
- 两种布局列数继续只由容器宽度决定，不由记录数决定。
- 点击、Enter、Space 打开正确详情。
- History -> 详情 -> History 返回原位置。
- 浏览器后退、Alt+Left、Backspace、鼠标后退键行为不变。
- 浏览器前进、Alt+Right、Shift+Backspace、鼠标前进键仍返回最近详情。
- Page Up/Page Down 和方括号在详情间导航仍使用完整筛选/排序结果，不得受列表媒体调度影响。

### 4.2 筛选、排序和维护操作

- 收藏、评分、模型、时长、标签组合筛选结果完全一致。
- 排序结果完全一致；稳定 asset/project id 不变。
- 删除单条、删除版本、删除项目后列表、详情和滚动位置保持合理。
- 收藏、评分、标签更新不误触发媒体重新下载或丢失封面。
- 上下文菜单的详情、复制、定位、继续创作和删除动作保持可用。

### 4.3 媒体

- 视频静态封面优先；没有缓存时，接近视口后仍能生成封面。
- 悬停视频立即加载并从头预览；离开后暂停并回到封面位置。
- 离开视口的视频继续释放 `src`，避免常驻解码资源。
- 有效静态封面不能被视频加载错误覆盖。
- 图片继续区分 loading / ready / unavailable / error，并保留重试和定位文件。
- 透明 PNG 缩略图继续保留 alpha。
- 缓存 key 和持久封面文件格式不改变。

### 4.4 可访问性与响应式

- 每张卡保持 `role="button"`、`tabindex="0"`、Enter/Space 语义和 More 菜单。
- Tablist 仍只有一个 active tab stop。
- 屏外卡片不使用 `aria-hidden`，不从可访问树移除。
- `1280×800`、`1440×900`、`<=760px` 下布局和返回位置都需验证。

## 5. 实施阶段

每个阶段单独提交；每阶段完成聚焦验证后才能继续。不要在同一提交中同时引入虚拟化、改布局视觉和改媒体缓存格式。

### Phase 0：建立可复现性能基线和 fixture

目标：先证明瓶颈和可重复测量，不凭感觉调参。

修改建议：

- 新增纯测试 fixture helper，例如 `tests/fixtures/history-performance.ts`，确定性生成：
  - 500 条视频历史，包含横竖屏、多版本、有/无封面、有/无文件；
  - 500 个图片项目，包含透明 PNG、普通图片、多版本、有/无缓存；
  - 1000 条压力档，只用于决定是否需要虚拟化。
- 若现有 renderer fixture harness 可注入状态，则扩展它；不要把大 fixture 写入默认持久状态或提交真实媒体。
- 在开发模式增加仅测试可调用的计数器或 injectable scheduler，不能向生产 UI 添加调试文字：
  - History render/mount 时间；
  - `readHistoryCover`、`readImage`、`saveHistoryCover` 调用数；
  - 同时运行的图片缩略图任务峰值；
  - 同时运行的视频封面任务峰值；
  - mount 后 3 秒内处理过的 asset id 数。

测量步骤：

1. 清空内存缓存，保留一组“磁盘缓存全命中”和一组“缓存全未命中”。
2. 分别在视频/图片、masonry/album、`1280×800`/`1440×900` 运行。
3. 记录点击 History 到 heading 可操作、首屏媒体 ready、3 秒内 Long Tasks、IPC 次数、返回详情后的位移。
4. 保存数值到实现 PR/交接说明；不要把机器绝对性能写成产品承诺。

停止条件：若测量显示瓶颈并非媒体/布局，而是 store IPC 或序列化，先回到 owning boundary 重新设计，不要继续在 Renderer 叠补丁。

### Phase 1：把图片缩略图改为视口驱动的有界调度

拥有文件：

- `src/renderer/pages/history/media-controller.ts`
- `src/renderer/pages/history/media-helpers.ts`
- 必要时新增 `src/renderer/pages/history/media-scheduler.ts`
- 聚焦测试新增在 `tests/history-media-scheduler.test.ts` 或相邻 History 测试

设计：

1. 删除 mount 时对全部 `[data-image-history-preview]` 直接调用 `loadImageHistoryThumbnail` 的行为。
2. 用一个共享 IntersectionObserver 观察图片 gallery 卡片/图片：
   - `root: null`；
   - `rootMargin` 建议从 `600px 0px` 起测，让用户滚到卡片前完成加载；
   - `threshold: 0`；
   - 回调只入队，不做 IPC、decode 或 Canvas 重活。
3. 新增有界任务队列：
   - 图片并发上限 3；
   - key 使用 `imageHistoryThumbnailCacheKey`，同 key 请求去重；
   - 当前视口内任务优先于预取区任务；
   - 页面 cleanup 后禁止写回断开的 `<img>`；排队但未启动任务应取消；
   - 已开始的 IPC 若无法取消，允许结束但不得继续 decode/save/DOM 写回。
4. 保留 `loading="lazy"`，但不要只依赖它，因为当前自定义缓存读取和生成不受原生 lazy 属性控制。
5. Retry 按钮必须绕过 IntersectionObserver，立即以高优先级入队，但仍受并发上限控制。
6. 不改变 `loadImageHistoryThumbnail` 内部缓存优先级：内存 -> 持久封面 -> 原图 -> Canvas -> 保存封面 -> 回读。

测试：

- 500 个图片节点 mount 后，未进入 rootMargin 的节点不调用 loader。
- 同时最多 3 个 loader Promise 运行。
- 滚入、滚出、再次滚入不会重复生成同 key。
- cleanup 后 Promise resolve 不写回旧 DOM。
- Retry 能触发屏外失败项，状态仍从 loading 到 ready/error。
- 无 IntersectionObserver 的 fallback 不能恢复“500 个同时加载”；fallback 应使用同一有界队列，按 DOM 顺序处理。

验收：进入图片 History 后，IPC 数量与首屏/预取区卡片数量相关，而不是与总记录数相关。

### Phase 2：停止全表视频封面预热，统一为近视口单并发

拥有文件：

- `src/renderer/pages/history/media-controller.ts`
- `src/renderer/pages/history/media-helpers.ts`
- 同一 `media-scheduler.ts`（若 Phase 1 已建立）

设计：

1. 保留现有视频 IntersectionObserver 和离屏 `releaseHistoryCardVideo`。
2. 移除或重定义 `scheduleHistoryCoverWarmup(historyMediaCards)`：不得在 1.2 秒后遍历全部卡片。
3. 所有封面缓存读取、无缓存视频加载、智能选帧和封面保存都由近视口事件触发：
   - 静态缓存读取可以较宽预取，例如 `rootMargin: 800px`；
   - 视频解码/智能选帧使用更窄边界，例如 `320px`；
   - 视频封面生成并发严格为 1。
4. 悬停任务优先：用户悬停时立即加载对应视频，不等待后台封面队列；必要时暂停/取消尚未开始的后台任务。
5. 同 asset/version 的“卡片视频加载”和“离屏临时 video 封面生成”不能同时运行。
6. cleanup、切页、筛选 render、删除记录时 abort 当前 warmup；finally 必须 pause、remove `src`、`load()` 释放资源。
7. 不改变智能封面候选和评分算法；本阶段只改变何时执行、并发和取消。

测试：

- 500 条视频 mount 后不会启动全量 warmup。
- 只对进入边界的卡片读取缓存/加载视频。
- 最多一个临时封面视频执行 seek/Canvas。
- hover 优先且仍可播放；mouseleave、离屏和 cleanup 释放资源。
- 缓存命中时不加载视频；视频错误不覆盖有效图片封面。
- 滚动到列表后部时，对应未处理卡片仍能正常生成封面，证明功能没有被删除，只是延迟执行。

### Phase 3：消除瀑布流布局强制回流

拥有文件：

- `src/renderer/pages/history/layout-controller.ts`
- 可提取纯函数到 `src/renderer/pages/history/helpers.ts`
- `tests/history-layout.test.ts`

局部假设：卡顿主要来自 `layoutMasonry` 在每张卡插入后对所有列执行 `getBoundingClientRect()`，造成 layout thrash。

设计：

1. 分离“决定列”和“写 DOM”：
   - 在 DOM 仍稳定时一次批量读取所有卡片高度，读阶段不得插入/移动卡片；
   - 用纯函数 `assignHistoryMasonryColumns(cardHeights, columnCount, gap)` 维护数字 `columnHeights[]`，每张卡放到当前最短列；
   - 最后一次 `replaceChildren(...columns)`，并用 DocumentFragment/离屏列一次性 append；写阶段不得再读取几何。
2. 稳定 tie-break：列高度相同时选择索引最小列，保证同输入同布局。
3. 卡片顺序继续由 `data-history-order` 决定；切回 album 时恢复全局历史顺序。
4. 图片/封面加载不应改变媒体区域高度：继续依赖 `--media-ratio` / `aspect-ratio` 预留空间。
5. ResizeObserver 只在 column count 真正变化时重新分列，保持现有逻辑。
6. 不用 JS 读取每张图片自然尺寸后再改卡片高度；尺寸来自历史元数据，避免异步布局漂移。

注意：若批量测量全部屏外卡片仍然是显著 Long Task，再比较“根据已知宽高比 + 固定 copy 高度计算估算高度”方案。只有估算与实测列顺序在 fixture 中稳定，才可替代 DOM 测量。

测试：

- 纯函数覆盖 0/1/2/3 列、等高、极端横竖比、500 条输入。
- 每个输入索引恰好分配一次，列内顺序稳定。
- album -> masonry -> album 后 DOM 顺序恢复。
- 列数仍仅取决于容器宽度。
- 用 spy/测试 seam 证明分列写阶段不调用几何读取；不要只断言最终列数。

### Phase 4：限制标题测量和 Observer 扇出

拥有文件：`src/renderer/pages/history/layout-controller.ts`

设计：

1. `bindTitleMarquees` 不再为每个标题创建“任一变化 -> 扫描全部标题”的效果。
2. 一个 ResizeObserver 可以观察多个标题，但 callback 只处理 `entries` 中变化的标题。
3. 首次测量按批次执行，避免同一帧读取几百个文本矩形；可优先首屏，剩余使用 IntersectionObserver 或空闲切片。
4. 卡片 hover 前若标题尚未测量，立即测量该卡片，保证 marquee 功能不消失。
5. cleanup disconnect，旧页面 callback 不得更新新 DOM。

测试：一个标题 resize 只重算该标题；500 标题 mount 不产生 500 次全表扫描。

### Phase 5：强化 History 返回滚动恢复

拥有文件：

- `src/renderer/pages/history/layout-controller.ts`
- `src/main.ts`
- `src/renderer/shell/controller.ts`（仅当接口需要扩展）
- 新增 `tests/history-scroll-restore.test.ts`

状态设计：扩展当前 controller 内存态，不进入 persisted state：

```ts
type HistoryScrollSnapshot = {
  scrollY: number;
  assetId: string | null;
  offsetFromViewportCenter: number;
  historyKind: "video" | "image";
  layout: "masonry" | "album";
  filterSignature: string;
};
```

规则：

1. capture 时同时保存：
   - `window.scrollY`；
   - 最接近视口中心的 `.history-gallery-item[data-history]`；
   - 该卡片中心相对视口中心偏移；
   - kind、layout、标准化 filter signature。
2. `openHistoryDetail` 和 `openImageHistoryDetail` 在从列表进入详情时都显式 capture，避免两条路径依赖不同的偶然事件顺序。
3. 将 Shell 的 `setHistoryScrollPosition(position)` 契约改为无参数 `captureHistoryScrollPosition()`，所有离开 History 的导航都调用 controller 的同一 capture 方法。`HistoryLayoutController` 是滚动 snapshot 的唯一写入 owner。
4. return restore：
   - 仅当 kind、layout、filter signature 未变化且 assetId 仍存在时，先按 `scrollY` 恢复，再在布局完成后按 asset anchor 校正一次；
   - 校正使用 `requestAnimationFrame`，不要 smooth scroll；
   - 媒体 ready 后通常不应改变卡片占位。若一次 ResizeObserver 发现目标卡片上方布局确实变化，只允许再校正一次，防止循环抖动；
   - asset 已删除或筛选后不可见时，退化为 clamp 后的 `scrollY`；
   - 文档高度不足时自然 clamp，不制造空白区。
5. 普通页面导航回 History 继续恢复上次位置。
6. 切换图片/视频 Tab 继续调用 `resetScroll()` 并回顶部；不得被旧 snapshot 拉回。
7. 切换 masonry/album 继续使用当前 layout anchor；布局切换 snapshot 与详情返回 snapshot 不混用。
8. 筛选/排序行为保持基线记录的当前语义。若 filter signature 变化，不用旧 asset anchor 强行定位。
9. focus：从详情返回后不强制聚焦卡片，保持当前焦点规则；若产品后续要求焦点恢复，另立 UX 变更，不混入性能提交。

测试必须覆盖：

- 视频列表第 300 条 -> 详情 -> 顶部按钮返回。
- 图片列表第 300 条 -> 详情 -> 返回。
- BrowserBack、Alt+Left、Backspace、鼠标侧键共用恢复。
- 返回后图片/视频延迟变 ready，目标位置误差仍在 8 px 内。
- 目标被删除、被筛选掉、排序变化、窗口宽度跨列数变化时安全 fallback。
- 切 Tab 后保持顶部，不被旧 snapshot 恢复。
- masonry/album 切换仍保持当前可见 asset。

### Phase 6：可选的 `content-visibility` 实验

只有 Phase 1–5 完成且基准表明剩余主要成本是屏外 layout/paint 时执行。

建议独立修改 `src/styles/11-history-curation.css`：

```css
.history-gallery-item {
  content-visibility: auto;
  contain-intrinsic-size: auto <measured-fallback>px;
}
```

要求：

- fallback 不能拍脑袋；分别由 album 固定卡片比例和 masonry fixture 分布测量。
- 验证自定义 masonry 初次分列不会读取到 fallback 假高度。
- 验证 Tab 顺序、Find in page、上下文菜单、键盘打开和辅助技术树。
- 验证滚动条总高度和详情返回无跳动。
- 无明确增益或出现任何布局漂移就撤回此阶段；主优化不依赖它。

## 6. 测试矩阵

### 6.1 聚焦自动化

至少新增/扩展：

- `tests/history-layout.test.ts`：纯分列、顺序和大输入。
- `tests/history-media-scheduler.test.ts`：IntersectionObserver、并发、优先级、取消和去重。
- `tests/history-scroll-restore.test.ts`：snapshot 与 anchor/fallback 规则。
- `tests/history-accessibility.test.ts`：完整卡片语义仍存在。
- `tests/history-image-media.test.ts`：延迟加载后的 loading/ready/error/retry。
- `tests/history-cover.test.ts`：近视口延迟生成不改变 cache key 和评分行为。

需要可控 fake：

- IntersectionObserver；
- ResizeObserver；
- requestAnimationFrame；
- 延迟 Promise；
- `getBoundingClientRect`；
- studio media IPC 方法计数。

不要用真实计时等待来测试并发或恢复；用可推进的 Promise/RAF fake。

### 6.2 手工功能回归

数据档：0、1、40、500 条；视频和图片分别测试。  
窗口：`1280×800`、`1440×900`、约 `760px`。  
布局：masonry、album。

逐项执行：

1. 首次进入、连续快速滚到底、快速反向滚动。
2. 视频 hover、拖动预览进度、mouseleave、重新 hover。
3. 图片缓存命中、未命中、文件缺失、Retry、定位文件。
4. 打开第 300 条详情并通过所有返回方式返回。
5. 切换布局后打开/返回；切 Tab 确认回顶部。
6. 应用筛选和排序，打开详情并前后导航。
7. 卡片右键菜单所有动作。
8. 删除当前项、删除非当前项、更新收藏/评分/标签。
9. 用键盘 Tab、Enter、Space、菜单键访问远处卡片。
10. 页面加载中快速切到 Create/Queue/Settings，确认没有旧媒体任务继续写 DOM 或播放。

### 6.3 仓库门禁

该变更属于共享 History Renderer/CSS：

1. 先跑聚焦 History tests。
2. `npm.cmd run verify`。
3. 按 `docs/UX_CONTRACT.md` 完成两个桌面 viewport 和窄屏手工检查。
4. 用 DevTools Performance 对同一 500 条 fixture 做 before/after capture。
5. 报告实际测量、静态验证和未验证项；没有测量不能声称性能目标已达到。

## 7. 文件所有权和实施纪律

Luna 开始前必须重新读取当前文件并检查 `git status`。本仓库会有多 Agent 并行工作，旧 plan 中的行号不是 patch 上下文。

首选修改范围：

- `src/renderer/pages/history/media-controller.ts`
- `src/renderer/pages/history/media-helpers.ts`
- `src/renderer/pages/history/layout-controller.ts`
- `src/renderer/pages/history/helpers.ts`
- 可新增 `src/renderer/pages/history/media-scheduler.ts`
- 必要时小范围修改 `src/main.ts` 和 `src/renderer/shell/controller.ts`
- `src/styles/11-history-curation.css` 仅用于独立可选阶段
- 对应 `tests/history-*.test.ts`

不得修改：

- `electron/store.ts`、preload、History IPC 和 persisted types，除非新的测量证明 Renderer 优化仍不足并获得用户批准。
- `prototypes/`，除非用户明确要求维护历史原型。
- History 视觉设计、卡片文案和用户操作集合。
- 封面 cache key/version 和现有媒体路径恢复规则。

每个阶段的第一处实质编辑后立即运行最窄验证。若修复开始需要状态猜测、阈值补丁或多套滚动恢复路径，停止并回到 `HistoryLayoutController` 这个唯一 owner 合并逻辑。

## 8. 虚拟化升级门（仅在第一阶段未达标时）

完成 Phase 1–5 后重新测量。只有同时满足以下任一条件，才提议第二份虚拟化设计：

- 500 条在媒体 I/O 已视口化、布局已批处理后仍有超过 100 ms 的同步 mount Long Task；
- 1000 条 DOM 内存成为主要压力且 `content-visibility` 无法改善；
- 用户实际数据稳定达到上千条，而不是仅理论上可能。

若进入虚拟化，优先调研 TanStack Virtual core（非 React adapter），必须设计：

- `getItemKey = asset.id/project.id`，禁止 index key；
- window virtualizer + sticky heading `scrollMargin`；
- 动态 `measureElement`；
- masonry `lanes` 与稳定 lane assignment；
- 适当 overscan，快速滚动无空白；
- 保存 `scrollOffset + initialMeasurementsCache/takeSnapshot()`；
- 上下文菜单或焦点所在卡片强制保留在 range；
- 详情返回通过 id + measurement snapshot 精确恢复；
- 删除/筛选/排序后的测量 cache 失效规则；
- 可访问性和 Find in page 的产品取舍须先由用户批准。

不得自行手写另一套绝对定位虚拟瀑布，除非库方案无法满足且有独立架构评审。

## 9. Luna 交付格式

实施完成后交付必须包含：

1. 根因与最终架构位置：媒体调度归 `HistoryMediaRuntime/Controller`，滚动与分列归 `HistoryLayoutController`。
2. 修改文件和每个阶段的提交。
3. Preserve List 逐项结果，明确视频/图片、两布局和所有返回方式。
4. 500 条 before/after：Long Task、IPC 次数、并发峰值、返回误差。
5. 自动测试、`npm.cmd run verify` 和手工 viewport 检查结果。
6. 是否启用 `content-visibility`；若未启用说明测量结论。
7. 是否达到虚拟化升级门；没有达到就不要引入虚拟化。
8. 任何剩余风险或只做了静态验证的部分。

## 10. 参考依据

- `docs/UX_CONTRACT.md`：History、异步媒体、焦点、响应式和 UI 验收契约。
- `docs/ARCHITECTURE_CONTRACT.md`：History/media 所有权与路径、缓存、删除契约。
- MDN Intersection Observer API：使用浏览器异步可见性观察做 lazy loading；callback 保持轻量，重活放入调度器。
- MDN `content-visibility`：`auto` 可跳过屏外 layout/paint 且保留可访问树；配合 `contain-intrinsic-size` 避免布局跳动。
- TanStack Virtual API：动态测量、stable key、lanes、overscan、initial offset 和 measurement snapshot 是可变高度虚拟化及导航恢复的必要能力；本计划仅在升级门触发后采用。
