# History 时间轴导航（Plan）

- Status: third acceptance revision complete; runtime visual smoke pending
- Updated / Owner: 2026-09-20 / 当前 agent
- Scope / Authority: 用户提出的 History 日期时间轴需求；以当前 renderer、`docs/UX_CONTRACT.md`、`docs/ARCHITECTURE_CONTRACT.md` 和 `docs/CHANGE_VERIFICATION.md` 为约束
- Baseline: `main` @ `a1dae3c`；工作区存在其他任务的未提交修改，本任务未修改这些文件
- Execution: direct
- Tree ledger: cap=0 created=0 depth=0 concurrency=0
- User override: none

> 按仓库文档约定，`TASK.md` 是当前任务 Plan/Resume 的唯一状态入口，不另建一份会产生分叉状态的 `PLAN.md`。

## Resume

- 已确认 / 决定：
  - History 列表有视频、图片两个顶层 tab；列表模板位于 `src/renderer/pages/history/page.ts`，标题/工具栏片段位于 `fragments.ts`。
  - 当前时间排序是 `newest` 与 `oldest`；评分、时长排序不属于时间排序。排序和筛选由 `src/core/history-filter.ts` 完成，视频和图片列表都在渲染前得到已过滤、已排序数组。
  - 当前时间比较使用 `updatedAt || createdAt`，而不是简单使用卡片显示的版本时间。时间轴必须复用同一时间源，否则会出现列表顺序与日期轨道不一致。
  - 页面使用 `window` 滚动；`layout-controller.ts` 已负责滚动位置、详情返回锚点、masonry/album 切换和布局重排。时间轴不能替换或独立保存第二份滚动状态。
  - 当前列表是响应式 masonry/album gallery，卡片在 masonry 中会被重新分列。因此日期锚点不能只按数据数组下标等分，必须在布局完成后读取卡片实际几何位置。
  - 当前 History 标题是 sticky，宽度断点主要在 `900px`、`760px`，History gallery 的列数由容器宽度决定。时间轴需要在不会挤压现有可读列宽时才出现。
  - 当前没有时间轴 DOM、状态、IPC 或持久化字段；该功能应保持 renderer 内的瞬时 UI 能力，不改历史记录 ID、存储格式或 preload 边界。
- 已完成 / 下一步：
  - 已完成代码地图、相关契约、当前 History renderer、布局控制器、筛选逻辑、样式和测试入口调查。
  - 已完成纯时间轴数据/合并算法、renderer markup、实际卡片几何测量、滚动同步、拖动定位、点击定位、键盘操作、宽度 gating 与 reduced-motion 样式；代码与自动化验证已收口。
  - 当前实现坚持极简方向：右侧窄 rail、稀疏日期 marker；完整当前日期只在 hover/focus/拖动时以短暂 pill 出现，不引入第三方组件或常驻日期面板。
  - 根据验收截图完成修订：时间轴布局占位进一步收窄为 20px + 4px gap；非当前日期在交互时使用 muted 色，当前日期保留强调色；rail 固定在标题/工具栏以下的真实 gallery 可视区域，日期继续向右展开到空白区域，不压缩原有卡片列宽过多。
- 阻塞 / 解锁条件 / 不要重复：
  - 当前无阻塞。
  - 不要从 `prototypes/` 恢复旧布局；当前 renderer 与现有 History 性能证据才是实现基线。
  - 不要把时间轴进度写入 `AppState`、History 记录或设置，也不要新增 Electron IPC。

## 0. 设计调查与取舍

- 参考 [Pictkura 的 year scrubber](https://harusame64.github.io/pictkura/en/)：右侧窄轨道、拖动跨越时间、控件在鼠标停止后淡出；吸收为本实现的“rail + transient current label”，不照搬视觉装饰。
- 参考 [Sweet Album](https://github.com/leuvi/sweet-album)：响应式 ResizeObserver 重排、日期分组、预计算定位索引和 lazy media；本实现只复用设计思路，继续使用现有 History gallery/layout controller，不引入 MIT 项目代码或依赖。
- 参考 [Immich roadmap 的 virtual scrollbar](https://immich.app/roadmap) 与 [相关讨论](https://github.com/immich-app/immich/discussions/12022)：时间轴应服务于“快速跳到时间位置”，不能依赖大量离散日期按钮；因此第一版按真实卡片 Y 坐标映射、密集日期合并，并保留空白轨道拖动。
- 不采用第三方 timeline/scrollbar 包：当前需求只需要纯函数、少量 DOM 和 Pointer Events，外部组件会增加样式占用与状态同步面。

## 1. 目标行为

在 History 列表页增加一个类似 iPhone 相册的日期导航轨道：

1. 仅当当前排序为 `newest` 或 `oldest` 时生成并显示；评分、时长排序时不生成时间轴。
2. 时间轴使用当前 tab、当前筛选结果对应的可见记录，不把被筛掉的记录放进日期锚点。
3. 在宽度足够时显示在列表右侧，默认采用右侧 rail；若后续视觉验收更适合左侧，只调整布局方向，不改变数据和交互模型。
4. 每个日期组显示年月日。按实际轨道像素位置计算最小间距；相邻日期标签过近时合并为一个日期范围/日期组，合并不能让底层目标记录丢失。
5. 滚动 History 列表时，轨道 thumb、当前日期和活动 marker 同步更新，用户可以看出当前位于整个历史列表的什么位置。
6. 点击日期组后定位到该组代表记录；拖动轨道 thumb 或点击轨道空白区域可以快速翻页；交互不得触发完整页面 render。
7. 保留现有 masonry/album 切换、筛选、详情打开、详情返回滚动锚点、卡片媒体加载与键盘焦点行为。

### 明确采用的产品假设

- “按时间排序”包含最新在前和最早在前两种方向；时间轴方向自动跟随当前列表方向。
- 日期按 Electron 用户本地时区分组，与当前历史时间展示使用的 `Date` 本地字段一致；不按 UTC 日期硬切。
- 时间戳优先使用现有排序口径 `updatedAt || createdAt`。视频和图片都遵循该口径；无效时间不破坏列表，进入一个可定位的“日期未知”组并补充无障碍文案。
- 时间轴是列表导航，不替代浏览器滚动条，也不影响详情页；进入视频/图片详情时不显示列表时间轴。
- 合并日期组后，点击合并 marker 定位到该组中按当前排序方向最靠前、且实际位置最早的代表卡片；完整日期集合放在 `title`/`aria-label` 中，避免视觉合并导致信息不可发现。

## 2. 方案总览

```text
当前 tab + HistoryFilterState
          │
          ├─ sort 为 newest/oldest？否则不生成时间轴
          │
          ▼
可见且已排序的记录
          │  使用同一 history sort timestamp
          ▼
按本地年月日分组 → 生成日期 marker → 按 rail 最小像素间距合并
          │
          ▼
History 列表 DOM + 右侧 fixed timeline rail（锚定在标题/工具栏以下）
          │
          ├─ 布局完成后测量代表卡片的实际 document Y
          ├─ scroll + requestAnimationFrame 更新 thumb/active date
          ├─ click marker → 目标卡片 + sticky header offset
          └─ pointer/keyboard 操作 → window.scrollTo
```

核心原则是“数据顺序决定日期归属，真实 DOM 几何决定导航位置”。这同时覆盖 masonry 中卡片被分列、album 中卡片等高、媒体加载导致高度变化和布局切换等情况。

## 3. 具体设计

### 3.1 纯数据层

新增 History renderer 内的纯模块（建议 `src/renderer/pages/history/timeline.ts`，按仓库现有 TS/JS 双源规则同步对应 `.js`，避免手工全量 tsc 覆盖无关文件），至少提供以下职责：

- 判断 `HistorySort` 是否为时间排序。
- 将视频/图片列表的当前已排序记录转换为统一的轻量条目：`id`、原始时间戳、解析后的毫秒值、`dateKey`、显示 label 和列表 order。
- 使用本地年月日生成日期组；同一天的多条记录只生成一个逻辑日期组。
- 将无效日期稳定归入末端“日期未知”组，不因为 `Date.parse` 失败而抛错或改变原列表顺序。
- 根据可用轨道高度和最小 marker 间距合并相邻 marker。合并函数只处理展示/导航模型，不修改原记录数组。
- 提供进度与滚动位置的纯函数：比例 clamp、轨道位置到 document scrollY、scrollY 到活动 marker 的选择，便于 Vitest 覆盖边界值。

时间轴不应再次复制 `history-filter.ts` 的比较规则；建议从现有比较逻辑提取/复用一个共享的 `historySortTimestamp` helper，保证列表排序、卡片 `data-history-timestamp` 和时间轴使用同一事实来源。

### 3.2 Markup 与布局

在 `renderHistoryPage` 和 `renderImageHistoryPage` 中，将 gallery 与时间轴放入一个 History list stage：

```text
history-heading（现有 sticky 标题/筛选/布局工具）
history-list-stage
  ├─ history-gallery（现有 masonry 或 album）
  └─ history-timeline（新增，右侧 rail）
```

建议 markup 具备以下语义和数据属性，具体命名可顺应实现：

- `aside` + `nav`，明确 `aria-label`；轨道 thumb 使用 `role="slider"`，而不是无语义的可点击 div。
- 每个日期 marker 使用 button，带 `data-history-timeline-marker`、代表卡片 ID、日期组信息、可读 `aria-label`。
- rail 保存当前 list sort、history kind、filter signature 或等价的瞬时绑定信息；不把它写进持久化 state。
- gallery card 增加统一的日期/排序数据属性，供 controller 在布局切换和筛选更新后重新绑定；保留现有 `data-history`、`data-history-order`。

CSS 方案：

- 继续由 History 页面自己的样式文件负责，优先扩展 `src/styles/11-history-curation.css`，沿用现有间距、颜色、focus、sticky offset token。
- 宽屏下使用 `grid-template-columns: minmax(0, 1fr) var(--history-timeline-rail-width)`，rail 自身 `position: sticky`，不覆盖卡片和浏览器滚动条。
- rail 使用 viewport 高度范围内的 fixed track，顶部和左侧由 controller 根据 heading/gallery 几何写入 CSS custom property；不为每个 marker 触发独立页面 render。
- 通过现有响应式断点和实际 stage/container 宽度双重 gating：只有扣除 rail 宽度及间距后，gallery 仍满足当前布局的最小可读宽度时才显示。宽度不足时 `hidden`/`aria-hidden` 同步切换，不只依赖 `display:none`。
- 轨道、thumb、marker、活动态和 hover/focus 态使用现有 token/对比度规则；支持 `prefers-reduced-motion`，定位动画不应阻塞拖动。

### 3.3 位置计算与滚动同步

新增 `timeline-controller.ts` 或在 `page-controller.ts` 中挂载独立 controller；建议保持时间轴职责独立，避免继续膨胀页面总 controller。

初始化/刷新时：

1. 找到当前唯一的 `.history-gallery`、`.history-list-stage`、时间轴 rail 和所有 cards。
2. 按逻辑日期组找到代表卡片；读取代表卡片的实际 `getBoundingClientRect()`，换算成 document Y。
3. 结合 sticky heading 高度和页面可滚动范围，计算每个 marker 的目标 `scrollY` 与 rail 百分比。
4. 对计算结果做 clamp；目标卡片被删除、过滤或暂时不在 DOM 时跳过该 marker，并在下一次布局刷新时重建。
5. 只缓存本次布局的 marker 几何；滚动过程中不重新读取所有卡片的矩形。

触发刷新：

- 首次 mount、筛选/排序重新 render 后。
- masonry/album 切换完成、`ResizeObserver` 检测到 stage/gallery 尺寸变化后。
- 媒体尺寸或 `content-visibility` 使 gallery 高度发生变化后，使用一个 `requestAnimationFrame` 合并刷新。
- viewport 宽度跨过 timeline gating 阈值时，更新可见性并重新测量。

滚动处理：

- 使用现有 `layout-controller` 的 window scroll 语义；controller 只注册一个 passive scroll listener，并以 rAF 合并更新。
- 更新 thumb 位置、活动日期 marker、当前日期文本/`aria-valuetext`；不得在每个 scroll event 调用 `context.requestRender()`。
- 与 `history-back-top` 共存，不能重复保存或覆盖 `HistoryScrollSnapshot`。
- 详情打开前后的 scroll capture/restore 继续由 `layout-controller` 管理；时间轴只在 DOM 恢复后重新绑定并从实际 `window.scrollY` 更新进度。

### 3.4 点击、拖动与键盘

- 点击 marker：以当前 sticky heading offset 为边界，`window.scrollTo({ top, behavior: "smooth" })` 定位到代表 card；用户开始拖动时取消未完成的 smooth 目标，避免轨道和页面互相抢控制权。
- 点击轨道空白：按点击位置映射到可滚动范围，跳到对应位置；如果命中某个 marker 的容差范围，优先使用 marker 目标。
- 拖动 thumb：使用 pointer capture、`touch-action: none` 和 `pointercancel` 清理；将指针 Y 映射到 `[minScrollY, maxScrollY]`，期间使用 `behavior: "auto"`，保证快速翻页。
- 键盘：`Home`/`End` 到列表首尾，`ArrowUp`/`ArrowDown` 小步移动，`PageUp`/`PageDown` 以 viewport 为单位移动；保留 `role=slider` 的 `aria-valuemin/max/now/text`。
- marker button、slider thumb 均有明确 focus-visible；不会把卡片的 Enter/Space 事件冒泡成打开详情。

### 3.5 日期密度合并

合并以“实际 rail 像素位置”而非日期数量为依据：

1. 先生成每个逻辑日期组的目标 scrollY/track position。
2. 按轨道显示方向检查相邻 marker；间距小于最小 marker 高度 + 视觉间隔时合并。
3. 合并 marker 保存所有日期 key、代表 card ID 和完整 title/aria 文本。
4. 可见文本只保留合并组的一个代表日期；已知日期拆成“年份 / 月日”两行，完整合并日期集合只保留在 title/aria 中。
5. 合并只影响展示密度。后续如果发现用户需要在合并组内选择某一天，可以在不改变底层 model 的前提下扩展为 hover/focus 展开，不在第一版引入第二层浮层。

这样可以避免日期标签重叠，也不把时间轴变成不可用的长文本列。

### 3.6 本地化与可访问性

- 复用现有 History title 作为 rail/slider 的无障碍名称，日期文本使用当前 UI locale 的 `Intl.DateTimeFormat`，显示年月日级别；本次不改正在被其他任务修改的 locale/locale-key 文件。
- 无效日期使用紧凑的 `—` marker，并通过 marker 的 `title`/`aria-label` 保留可发现性；后续若需要更明确的“日期未知”文案，再单独协调 locale 文件所有权。
- 时间轴隐藏时从 accessibility tree 移除；非时间排序时不渲染或至少保持 `hidden`，避免读屏出现无效导航。
- 键盘用户可以从时间轴 marker 到达目标卡片；焦点移动不会丢失，页面滚动后的 active 状态有 `aria-current` 或等价语义。

## 4. 实施顺序

### P0：规则和纯函数

1. 从当前排序规则整理可复用的时间戳 helper，确认视频/图片的 `updatedAt || createdAt` 和无效日期行为。
2. 新建 timeline 纯模块，实现日期分组、显示合并、比例映射和 clamp。
3. 添加 focused Vitest，覆盖 newest/oldest、评分/时长关闭、同日聚合、跨年、反向排序、无效时间、marker 间距合并和滚动边界。

### P1：列表 markup 与静态样式

1. 修改 `fragments.ts`/`page.ts` 的 list stage 与 timeline markup；视频/图片使用同一 renderer 组件/结构。
2. 在宽屏增加右侧 fixed rail，并实现不足宽度隐藏、empty/no-results 隐藏、detail 不显示。
3. 接入现有 UI locale 的日期 formatter，确认中英文日期格式都不依赖额外持久化文案。

### P2：controller 与现有布局/滚动生命周期接合

1. 挂载 timeline controller，完成 marker 几何测量、scroll rAF 同步、click/drag/keyboard、cleanup。
2. 在 `layout-controller` 的 masonry/album 重排后调用 timeline refresh；与 `ResizeObserver` 合并，避免重复测量。
3. 核对 render coordinator 的 History 一帧延迟 mount、详情列表 preservation、scroll restore 和媒体 controller cleanup，不让时间轴造成额外整页 render。

### P3：回归和视觉验收

1. 添加/更新 markup、可访问性、滚动恢复和性能 focused tests。
2. 先运行 History 相关 Vitest 与 typecheck，再运行一次完整 `npm.cmd run verify`。
3. 使用当前 renderer/Electron fixture 进行手测：视频/图片、newest/oldest/评分/时长、筛选、masonry/album、空列表、窄窗口、详情返回、鼠标拖动、点击日期、键盘 Home/End/PageUp/PageDown。
4. 至少检查 `1280 x 800`、`1440 x 900` 和缩小到第一次响应式断点；确认 rail 不覆盖 sticky 标题、筛选面板、卡片操作、右下角回顶按钮。

## 5. 预期修改范围

| 区域 | 预期文件 | 作用 |
| --- | --- | --- |
| 纯逻辑 | `src/renderer/pages/history/timeline.ts`（及当前规则要求的 `.js`） | 日期分组、密度合并、scroll/track 纯函数 |
| 列表 markup | `src/renderer/pages/history/fragments.ts`、`page.ts`（及对应 `.js`） | list stage、timeline rail、card timestamp data |
| 交互 | `src/renderer/pages/history/timeline-controller.ts` 或等价小模块、`page-controller.ts` | mount、scroll、click、drag、keyboard、cleanup |
| 布局生命周期 | `src/renderer/pages/history/layout-controller.ts`、必要时 `coordinator.ts` | 重排/resize 后刷新时间轴，不复制滚动状态 |
| 样式 | `src/styles/11-history-curation.css` | rail、marker、thumb、宽度 gating、responsive/focus |
| 文案 | 复用 `uiKeys.history.title`；不改当前其他任务持有的 locale 文件 | rail/slider aria 名称、日期 formatter 与合并范围 |
| 测试 | 新增 `tests/history-timeline.test.ts`，按需要补 `history-layout`、`history-scroll-restore`、`history-accessibility`、`history-performance` | 纯逻辑、DOM 语义、生命周期和大列表回归 |

不应修改 `src/types.ts`、`electron/*`、History 持久化、IPC、ComfyUI graph 或媒体文件。若实现时发现当前 `.ts/.js` 生成同步规则需要额外文件，先核对该目录现行做法后再限定修改范围。

## 6. 验收标准

### 功能

- 时间排序时，日期 rail 在宽屏出现；评分/时长排序、空列表、无结果、详情页和不足宽度时不出现。
- newest/oldest 两个方向下，日期 label 顺序、卡片目标和滚动方向一致。
- 同一天只显示一个逻辑日期组；日期过密时不会重叠，合并 marker 只显示一个代表日期但仍能定位到该合并组的代表记录。
- 点击日期、点击轨道、拖动 thumb、Home/End/Arrow/PageUp/PageDown 都能定位；拖动过程中不会打开卡片详情。
- 页面滚动时 thumb 和 active date 同步，且不触发 History 全量重渲染；返回详情后原有滚动位置和时间轴进度一致。

### 兼容性

- 视频与图片 tab 都支持；现有筛选、卡片右键菜单、卡片键盘打开、媒体加载、masonry/album 和 title marquee 不回归。
- 不新增持久化字段、不改变旧历史记录、不引入 IPC、不直接访问 preload/global/fs。
- 时间轴隐藏/显示跨窗口缩放稳定，不能挤压到不可读的 History 卡片宽度。

### 性能和视觉

- scroll handler 只做 rAF 内的轻量 DOM 更新；几何读取只发生在初始/布局变化/resize refresh，不在每个 scroll event 扫描所有卡片。
- 至少 500 条 fixture 不产生逐条 marker DOM 更新风暴；媒体 controller 的 observer/scheduler 数量和现有列表基线相比不出现无界增长。
- rail 使用现有 token、focus/contrast 和 reduced-motion 规则；在 `1280 x 800`、`1440 x 900` 下层级、密度、可达性合理。

## 7. 验证命令与证据

### 已执行的调查命令

- `git status --short`：确认工作区有多个其他任务的未提交修改；本任务避开这些文件。
- `git rev-parse --short HEAD` / `git branch --show-current`：确认基线为 `a1dae3c` / `main`。
- 阅读 `docs/README.md`、`docs/AGENT_START_HERE.md`、`docs/tasks/README.md`、`docs/development/TASK_TEMPLATE.md`、`docs/UX_CONTRACT.md`、`docs/ARCHITECTURE_CONTRACT.md`、`docs/CHANGE_VERIFICATION.md`。
- `rg`/定向阅读 `src/renderer/pages/history/{page,fragments,assembly,layout-controller,page-controller,coordinator,filter-controller,helpers}.ts`、`src/core/history-filter.ts`、`src/styles/11-history-curation.css` 与现有 History tests。

### 实现完成后必须补的检查

- `npm.cmd test -- ...` 或仓库当前支持的 focused Vitest 命令：时间轴纯逻辑、History markup/controller、scroll restore/accessibility。
- `npm.cmd run typecheck`。
- 因为涉及共享 renderer/CSS/History：`npm.cmd run verify`。
- 按 `docs/UX_CONTRACT.md` 进行当前 renderer/Electron 手测和必要截图；不使用历史 prototype 作为通过证据。当前已尝试启动本地 Electron，但 Computer Use 没有发现可绑定的 Electron 窗口，因此保留为未完成的人工视觉项，不把它误报为通过。

## 8. 未决风险与非目标

- masonry 的真实卡片 Y 位置可能因媒体尺寸、content-visibility 或窗口改变而变化；必须保留 refresh hook/ResizeObserver，不能只在首次 mount 计算一次。
- `updatedAt` 与卡片当前显示的版本 `createdAt` 可能不同；实现时必须先统一排序/时间轴的事实来源，并通过测试防止标签与顺序矛盾。是否同时调整卡片展示时间，只能在实现时基于当前 UI 证据做小范围决定，不能偷偷改变排序语义。
- Electron 真实窗口的最终视觉检查仍受当前 Computer Use 无法绑定本地 Electron 窗口限制；静态构建、markup/accessibility/performance 测试已覆盖结构与生命周期，但不替代人工屏幕验收。
- 第一版不做时间轴缩放、日期搜索、持久化上次位置、按月份/年份二级折叠或新的 History 内部滚动容器。

## Evidence / handoff

- 关键结论及来源/版本/证据路径：当前 renderer/契约与测试路径见上文；基线为 `main` @ `a1dae3c`。
- 实际命令、结果、对应文件状态：实现已通过 `npm.cmd test`（181 files / 1600 tests）、History performance integration（6 files / 81 tests，500 条 synthetic fixture）和最新 `npm.cmd run verify`；本轮第三次验收修订后，完整 unit/integration/build/contrast 回归仍通过，构建产物已确认包含最新 timeline markup/controller/CSS。
- 可复用检查 / 必须补的验证：后续可直接复用 focused timeline test、History performance fixture、typecheck、build 与 contrast 命令；若有可绑定的 Electron 窗口，再补 1280×800 / 1440×900 的实际视觉和鼠标拖动检查。
- 未运行项、限制、清理：本地 Electron 曾启动但没有被 Computer Use 枚举到，已终止该进程；未修改已有 dirty `docs/tasks/README.md`、locale、Electron watchdog 等其他任务文件。
- 实际模型/effort；可见 usage 与耗时：unknown。
- 版本影响 / Unreleased：History renderer/CSS 功能改动未更新版本号；`CHANGELOG.md` 已有其他任务 dirty 修改，本任务未抢占写入。完成发布前由 release owner 统一记录 Unreleased 条目。
