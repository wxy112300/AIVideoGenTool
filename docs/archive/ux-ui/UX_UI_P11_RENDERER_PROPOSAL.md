# P11 当前 renderer 的 History toolbar 与 gallery 构图提案

状态：`verified/integrated`。本文只基于当前 `src/renderer/`、`src/styles/`、当前 renderer manifest 和真实 Vite/Electron fixture；不使用 `prototypes/` 的旧设计。P11 已按本文边界修改生产 renderer，P12–P15 仍保持独立。

更新日期：2026-08-21；当前 package version：`0.33.0`。

## 1. Source map 与 preserve list

History 当前由以下生产 surface 组成：

- 页面与卡片 markup：`src/renderer/pages/history/page.ts`、`fragments.ts`；
- filter/layout/navigation/media：`filter-controller.ts`、`layout-controller.ts`、`navigation-controller.ts`、`media-controller.ts`、`actions-controller.ts`；
- 当前 cascade：`src/styles/01-foundation.css`、`src/styles/02-visual-refresh.css`、`src/styles/04-history-stage.css`、`src/styles/05-density-refinement.css`、`src/styles/11-history-curation.css`；列轨计算位于 `src/renderer/pages/history/helpers.ts` 与 `layout-controller.ts`。

必须保持：

1. 视频与图片仍是 History 顶层 tabs；History detail 路由继续保持 History nav selected；
2. 用户选择的 masonry/album layout、sort/filter、favorite/rating/tag 查询和返回详情语义不变；
3. 卡片继续是 quiet entry：不在 gallery card 上展开 tags，不把详情字段塞进缩略图；
4. video preview、image cover、loading/error/unavailable、hover/keyboard focus 和路径解析规则不变；
5. 删除、打开详情、复制文件/路径、打开所在目录、继续创作和恢复动作保持现有 controller/IPC/persisted metadata；
6. P12 的 tabs/card/context-menu 键盘语义、P13/P14 的媒体状态/lightbox 和 P15 的详情构图不在本 proposal 偷渡修改。

## 2. Current renderer evidence

manifest 当前登记 `history-video-masonry`、`history-video-album`、`history-image-masonry`、`history-image-album`，覆盖 `1440×900`、`1280×800`、`900×800`、`760×800` 及 `1121/1120/901/900/761/760` 断点。默认 synthetic fixture 仍保留单项基线；P11 capture harness 的 `--history-count 8` 使用混合 `16:9/9:16/1:1/4:3/3:4` 宽高比，另以 `--history-count 1` 对照，证明多卡片过滤/布局后的列轨稳定。

变更前画面观察（用于确定 P11 取舍）：

- 1440px 视频 masonry：title/count 在左，视频/图片 tabs 居中，filter/count/layout 在右；卡片以媒体为主，标题、文件名、时间/渲染摘要保持安静；
- 900px 图片 album：kind tabs 与 filter/layout 仍可见，但 heading 被压到固定约 68px；更长本地化文案、活动 filter panel 或多个操作会缺少安全换行空间；
- 当前 CSS 在 >1120px 使用三列，<=1120px 的 album 仍声明三列，<=900px 两列，<=760px album 两列而 masonry 一列；这是一组 viewport breakpoint，而不是 container width 规则，也容易在 `901→900` 和嵌入式/窄内容容器中产生跳变；
- 当前 `.history-heading` 在 `max-width: 900px` 被设置为固定 `height/max-height: 68px`，与“toolbar 内容可换行、filter 可展开、焦点控件始终可达”的目标冲突；
- 现有 cards 的 video masonry 保留原始比例，album 使用方形媒体；这些媒体主导比例与 loading/error/cover 层级应作为 preserve surface。

P11 outcome：1121px 以上以及 760–561px 都保留 title/count、kind tabs、filter/count/layout 的单行关系，只解除中窄宽度的 inherited fixed toolbar height；<=560px 才安全降为标题行与控制行。album track 使用容器宽度计算，并在可行范围内保持约 `180–240px` 的紧凑卡片宽度；混合宽高比的 `--history-count 8` 与 `--history-count 1` 在 900×800 的视频/图片对照中保持约 `196px × 4` 列轨，1440×900 约 `218px × 6`，760×800 约 `229px × 3`。masonry 保留媒体原始比例，在 1440/900/760 等关键窗口仍无页面横向溢出。P11 capture harness 还覆盖现有本地化 copy 下的 filter panel、no-result/clear、masonry/album、detail return、History parent nav selected 和 delete confirmation/cancel smoke；仅预期的模型 chip 文本省略会出现在诊断列表中，document/body 没有横向溢出。

## 3. Proposed composition

### 1121px 以上

保留当前单行关系，但明确三组 ownership：

```text
History title + count  |  Video/Image tabs  |  filter + visible/total + masonry/album
→ gallery cards
```

filter panel 仍从 filter button 旁的 anchor 展开，不把完整筛选表单永久塞进标题行；layout choice 继续是用户状态，不由 cards.length 推断。

### 761–1120px 与 900px

保持现有单行 toolbar 关系，同时解除固定高度：

```text
History title + count | Video/Image tabs | filter + visible/total + masonry/album
→ gallery
```

- title、kind tabs、filter/count、layout choice 保持同一控制行，不改变 DOM/Tab 顺序；
- heading 使用内容高度和 tokenized vertical spacing，不设固定 `height/max-height`；active filter、no-result 和本地化 copy 不会被固定高度裁切；
- filter popover 的打开按钮、clear、sort、rating、model、tag controls 保持可达，展开时不把 gallery 横向推出 viewport；
- card grid 以 History content container 宽度计算列轨，masonry 与 album 使用各自的最小卡片宽度 token；过滤/删除一项时只移除对应 card，不因 `cards.length` 重新放大其余 card；
- 900px 首屏必须同时看到 title/type、filter/layout 状态和至少一张卡片的媒体/主入口。

### 760px 以下

- 保留当前 topbar normal flow 与 History heading `top:0` 语义，但 heading 变为自然高度；在 760–561px 保持 title、kind tabs、filter/count、layout choice 同一行，<=560px 才降为标题行与控制行；
- masonry 可以落为单列，album 保持至少两个可读的方形列轨，具体最小宽度在 761/760 证据中确认；
- 不用 `min-width`、负 margin 或隐藏 `overflow-x` 解决 toolbar 溢出；长标题/文件名使用现有省略或换行规则；
- gallery card 的主要打开入口和媒体状态在首屏可见，删除/过滤/返回详情不依赖回到页面顶端。

## 4. State and interaction boundaries

P11 只处理 toolbar/grouping、gallery geometry 和 filter/delete/layout 的可达性。以下路径必须保持并在实现阶段复核：

- empty：说明可添加/可执行的下一步，不显示空黑 media tile；
- loading/ready/unavailable/error：media area 不跳高，失败保留 locate/retry/recovery context；
- active filter/no results：标题显示 visible/total，clear 可达，清除后恢复原 layout；
- delete：使用应用确认 dialog，删除后不把剩余 card 按记录数任意放大；
- open detail/return：卡片主入口、History selected nav 和返回条保持连续；
- keyboard semantics 留给 P12，但 P11 不得改变现有 tabindex、data attributes、button/select 语义或 DOM 关系。

## 5. P11 approval checklist

P11 集成证据：

1. [x] video/image × masonry/album 在 `1440×900`、`1280×800`、`1121/1120/901/900/761/760` 的当前 renderer 截图或 DOM diagnose；
2. [x] 8→1 混合宽高比项目 fixture：视频与图片 album 在 900×800 保持相同列轨，过滤/清除和 layout toggle 后不由记录数量重新计算；masonry 同时覆盖横向、纵向和方形媒体；
3. [x] 900px 左右 toolbar 不依赖固定 68px，active filter/no-result/现有本地化 copy 不会遮挡或横向溢出；
4. [x] gallery card 的媒体比例、cover/preview、loading/error/unavailable 和空态未被 P11 改写；混合宽高比 fixture 只用于覆盖布局，album 的既有方形呈现保持不变；
5. [x] filter、layout、delete confirmation/cancel、open detail、return path smoke 通过，且 History parent navigation 始终 selected；
6. [x] `tests/history-layout.test.ts`、相关 History tests 与 `npm.cmd run verify` 通过，并明确 P12–P15 尚未由本 package 完成。

## 6. Non-goals for P11

- 不修改 History media path logic、IPC 或 persisted history schema；P11 只修改 History-owned layout helper/controller/CSS 与 capture harness evidence，不改变卡片语义或媒体状态；
- 不把旧 prototype 的 gallery 密度、按钮样式、tag card 或详情结构作为候选实现；
- 不提前实现 P12 tabs/context-menu keyboard、P13 image media state、P14 lightbox focus 或 P15 detail action hierarchy；
- 不把单项目 synthetic screenshot 当作多项目列轨、删除或运行态媒体加载的证明；P11 已补充混合宽高比 8→1 对照，但真实媒体加载仍遵守原有路径与状态边界。
