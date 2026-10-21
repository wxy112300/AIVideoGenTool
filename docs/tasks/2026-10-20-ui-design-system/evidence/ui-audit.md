# UI/UX 审美与交互问题审计（2026-10-20）

范围：当前 renderer（`src/renderer/`、`src/styles/`，版本 0.66.5）。不评价功能是否正确，只评价视觉、排版、层级、文案、动效和交互手感。所有结论均可在下方证据中复现。

## 证据来源

| 来源 | 方法 | 位置（gitignored，可重新生成） |
| --- | --- | --- |
| 合成 fixture | `npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --viewport 1440x900 --output temp/ui-design-audit`（需先启动 Vite 5173） | `temp/ui-design-audit/1440x900/*.png`，18 张 |
| 真实数据副本 | 复制用户 `studio-state.json`（137 视频 / 8 图片 / 1 等待任务）与 `history-covers` 到隔离 userData，关闭 autoRetry，未启动 ComfyUI；以 dist 构建 + 回环 CDP 9334 只做导航与截图 | `temp/ui-audit-real/shots/*.png`；脚本 `temp/ui-audit-real/capture.mjs` |
| CSS 静态统计 | Node 只读脚本扫描 `src/styles/*.css` | 见“工程根因” |
| 外部参考 | getdesign.md / awesome-design-md 中 Linear、Raycast、Runway 的 DESIGN.md 分析（2026-10-20 访问） | 见 TASK“参考” |

截图 harness 本轮修复：mock preload 缺少 31 个新 AppApi 方法导致 renderer 启动失败；隐藏窗口导航后 `capturePage` 返回首帧，所有截图都是 Create。现以 studio-client 清单自动补桩，窗口以 `showInactive()` 绘制。

## 一、总体判断

1. **没有审美主权**。`UX_CONTRACT.md` 规定了行为与验收，`00-tokens.css` 是“别名当前值”的迁移层（注释写明 P02/L12–L20 “keeps the current renderer values”）。上一轮 P00–P20 UX 工作以“零视觉差异”为目标整理 selector 归属，从未确立视觉方向，所以代码更整齐了，但界面一点没变美。
2. **样式靠追加层叠修补**：`02-visual-refresh` → `05-density-refinement` → `10-final-refinements` → `11-history-curation`，名称本身就是补丁史。同一 selector 在多个文件重复定义（`.history-heading` ×13、`.page-heading` ×9、`.history-gallery.album` ×12），`@media (max-width:760px)` 出现 27 次、断点值 11 种。
3. **每个页面都是“信息全部摊开”**：缺少渐进披露，导致密度高但层级平；视线没有落点。
4. **几乎没有动效系统**：页面切换、刷新、列表增删、状态变化都是瞬间替换；只有零散的 12–18ms 级 hover transition，无统一时长和缓动。

## 二、问题清单

编号规则：V 视觉/配色，T 字体，L 布局对齐，H 层级主次，C 文案说明，M 动效，I 交互手感，S 设置页专项，E 工程根因。严重度：P1 明显损害体验/每天可见；P2 局部但反复出现；P3 细节。

### 视觉与配色

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| V-01 | P1 | 主色蓝 `#76a8fb` 被用于主按钮、活动 tab、选中 chip、徽标、链接、信息徽章、版本 pill、进度、焦点，失去“这是主要动作”的含义。History 标题旁“137 个视频”是亮蓝实心 pill，比主内容更抢眼 | history.png、video-detail-full.png |
| V-02 | P1 | 主按钮使用浅蓝渐变 + 投影 + 深色字（`--ux-action-primary-fill` 渐变），在深色界面上像网页 CTA，而非工具软件；禁用态只降饱和，和次级按钮难区分 | create、video-detail |
| V-03 | P2 | 表面层级混乱：canvas、panel、panel-2、bordered card、dashed card、带色描边 card 并存；卡片内再嵌套描边卡片（详情页信息 6 宫格、设置页组件行） | video-detail-full、settings-* |
| V-04 | P2 | 状态色饱和度过高且面积过大：设置页大量红色“缺少 2 项”胶囊 + 红色 ⓘ 图标，橙色描边 core 卡；所有组件行都有绿色勾，噪音大于信息 | settings-video.png |
| V-05 | P2 | 540 处十六进制颜色字面量（309 种不同值）+ 444 处 rgba()，token 只是别名；同语义颜色在不同页面数值不同 | CSS 统计 |
| V-06 | P3 | 品牌区蓝色方块图标 + 粗体名称 + 版本号，视觉重量高于导航本身 | 所有页面 |

### 字体与排版

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| T-01 | P1 | 字体栈冲突：`01` 设 Inter，`02` 覆盖为 Segoe UI Variable，`11` 某处用 Arial；中文无显式字体，落到系统 fallback，中英混排基线和字重不一致 | `src/styles` font-family 9 处 |
| T-02 | P1 | 字号 27 种（8/9/10/11/12/13/…/32px 均有），存在 8–10px 正文级文字（资源监视器、路径、kbd 提示、卡片元数据），1440 下难读 | CSS 统计、header 监视器 |
| T-03 | P1 | 粗体泛滥：select 选中值、标签、卡片标题、按钮、数值全部 600–700，中文粗体在暗底上发糊，层级反而消失 | create、settings |
| T-04 | P2 | 等宽字体被大量用于文件名/路径/参数值，且未截断成中间省略，长路径换行打乱栅格（详情页“输出目录”“工作流”） | video-detail-full |
| T-05 | P2 | 标题截断以“词数”截断而非 CSS 省略号（“Continue the same continuous”），看起来像 bug | history.png |

### 布局与对齐

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| L-01 | P1 | 顶部资源监视器以 9–10px 文字塞在导航上方，紧贴导航胶囊顶边；与居中通知同时出现时拥挤 | 所有页面右上 |
| L-02 | P1 | Create 左列（参考画面）无卡片容器、右列有卡片容器；两列顶边、标题基线、高度都不对齐；左侧大面积虚线空框 | create.png |
| L-03 | P1 | Sticky 提交栏覆盖表单内容（Spectrum、清晰度标签被压住），且阻塞原因、token 计数、按钮在一行里挤压 | create-full.png |
| L-04 | P2 | 页面头部模式不统一：Create/Queue 有“标题 + 一句说明”，History 是“标题 + 蓝徽章 + 居中 tab + 右侧工具”，Settings 是“标题 + GPU 徽章 + 说明 + 4 个按钮”，Detail 是独立工具条 | 各页 |
| L-05 | P2 | 按钮高度/圆角不统一：圆角 28 种（2–17px 都有）；同一行中 select、icon button、文本按钮高度不同（Prompt 工具条、History 工具条） | CSS 统计、create |
| L-06 | P2 | 详情页右栏 5 个次级按钮为 2 列网格，“删除”与“定位文件”同权重；单列孤儿按钮留空 | video-detail-full |
| L-07 | P2 | History 网格在 1440 只有 3 列，16:9 素材下“瀑布流”与网格几乎无差异；右侧时间轴圆点浮在卡片栅格边缘 | history.png |
| L-08 | P3 | Queue 卡片中提示词使用内部滚动框 + 原生滚动条；“需要处理的任务”标签换成 3 行 | queue.png |

### 层级与主次

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| H-01 | P1 | 每个区域都有标题 + 描述 + 徽章 + 图标，主次靠颜色而非尺寸/留白，结果全部同等响亮 | 全局 |
| H-02 | P1 | 图片详情同时存在两个蓝色主按钮（“查看大图”“开始创作视频”）；视频详情“继续创作”主按钮之外还有 5 个带边框次按钮 | image-detail、video-detail |
| H-03 | P2 | History 卡片封面上叠 4 个徽章（模型、分辨率、版本数、时长）+ 下方标题 + 等宽文件名 + 日期/耗时，卡片信息密度过高，盖住作品本身 | history.png |
| H-04 | P2 | Queue 顶部 4 张大遥测卡与全局资源监视器重复同一数据，空闲时占据首屏 | queue.png |
| H-05 | P2 | 详情页技术参数（Attention 所有者、H3 运行时、编译器…）与创作信息同级展示，未折叠 | video-detail-full |

### 文案与说明

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| C-01 | P1 | 几乎每个标题下都有说明句（“导入参考画面，调整提示词，然后加入本地生成队列。”“用标签整理作品，也可以在筛选中组合使用。”“实际送入模型的完整提示词”），用户第二次看到就是噪音 | 全局 |
| C-02 | P1 | 实现细节暴露给用户：“若显示‘设置值 → 实际策略’，右侧是入队时最终策略；底层 kernel 的自动回退仍以运行日志为准…”“独立保存的 H3 video/audio latent 数据；它不等同于 Motion Context…” | video-detail-full |
| C-03 | P2 | `settings/copy.ts` 1652 行，设置页每张卡片都有描述 + 资源/策略 + 推荐硬件三行 | settings-* |
| C-04 | P2 | 同一状态在标题、徽章、段落、按钮里重复（违反 UX_CONTRACT “Do not repeat the same state”）；renderer 中 `title=` 430 处，tooltip 与可见文本重复 | 统计 |
| C-05 | P3 | 中英文混用无规则：“Attention 所有者”“Page Up”“在 Explorer 中显示”“GPU 采样” | 详情页 |

### 动效与刷新

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| M-01 | P1 | 页面切换是 `root.innerHTML = renderShell(...)` 整壳替换，无过渡；图片/视频封面重新解码时闪黑 | `render-coordinator.ts` |
| M-02 | P1 | 无统一 motion token：32 处 transition 时长 .12–.3s 随意、缓动全部 `ease`；12 个 keyframes 多为 spinner/进度条，各自实现 | CSS 统计 |
| M-03 | P2 | 列表增删（入队、完成、删除历史、标签增删）瞬间出现/消失，无 enter/exit；状态切换（等待→运行）无过渡 | queue、history |
| M-04 | P2 | 通知 toast 常驻页面中上方，与标题区重叠，无进入/退出动画和自动消退节奏 | 所有 fixture 截图 |
| M-05 | P2 | 加载态以 spinner 为主，缺少 skeleton；数字（进度、遥测）跳变无补间 | queue、history |
| M-06 | P3 | `prefers-reduced-motion` 只覆盖少数既有规则，没有作为动效 token 的统一开关 | CSS 统计 |

### 交互手感

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| I-01 | P1 | 表单大量使用 Windows 原生 `<select>`（Create 输出设置 10+ 个），下拉弹层是系统样式，与暗色界面割裂，不能显示说明/禁用原因 | create |
| I-02 | P2 | Hover 只改背景色/边框，没有光感、深度或指针跟随；卡片 hover 无抬升；按钮按下仅 `translateY(1px)` | CSS |
| I-03 | P2 | Queue 拖拽已有 FLIP（`drag-sort.ts`，cubic-bezier(.2,.8,.2,1)），但被拖卡片无抬起感（阴影/缩放/倾斜），放下无落位回弹；分隔条拖拽同理 | drag-sort.ts |
| I-04 | P2 | 焦点环、选中、按下、禁用状态在不同组件中表现不同（focus-visible 41 处各自定义） | CSS |
| I-05 | P3 | 星级评分、收藏、删除标签等微交互无反馈动效 | video-detail |

### 设置页专项（真实数据才可见）

| ID | 严重度 | 问题 | 证据 |
| --- | --- | --- | --- |
| S-01 | P1 | 视频模型页 8 张卡 × 每张 6 个组件全部展开，共享组件（视频 VAE、音频 VAE、TAE、文本编码器）在每张卡重复列出，页面超过 4000px；用户要找“缺什么”需滚动全页 | settings-video.png |
| S-02 | P1 | 每个组件行：状态图标 + 粗体名 + 等宽路径 + 来源/revision/大小 + 外链按钮，全部常驻；“已就绪”的行和“缺失”的行视觉权重相同 | 同上 |
| S-03 | P2 | 左侧导航计数徽章（23/23、4/8、8/21…）含义不一（就绪数/总数？）且无颜色语义 | settings-* |
| S-04 | P2 | 页头操作区 4 个按钮（未保存更改、放弃、保存、重新扫描）+ GPU 徽章 + 说明挤在一行 | settings-video.png |
| S-05 | P1（用户确认） | 仅浏览各 Settings 页就出现“未保存更改”，离开时弹出放弃确认；用户确认日常经常出现。属行为 bug，单独修复 | settings-discard-dialog.png |

### 工程根因

| ID | 问题 | 数据 |
| --- | --- | --- |
| E-01 | 补丁式样式层叠，后加载文件覆盖前文件 | 11 个 CSS 层，约 6,900 行；`!important` 30 处 |
| E-02 | Token 不是设计决策，只是现值别名 | 字号 27 种、圆角 28 种、box-shadow 57 种、padding 132 种、gap 44 种 |
| E-03 | 断点各页自定 | 11 种 `@media` 宽度值 |
| E-04 | 全量 innerHTML 渲染，无法做元素级过渡 | `render-coordinator.ts` 整壳替换；部分页面已有局部更新 |
| E-05 | 没有组件层：按钮、输入、select、chip、badge、card、segmented 在多个页面文件分别定义 | selector 重复统计 |
| E-06 | 无设计规范文档供后续 agent 参考，新增功能只能模仿邻近代码，复制问题 | 无 DESIGN.md |

## 三、值得保留的现有优点

- 深色画布 + 媒体主导的方向正确；History 封面、视频播放器已经是视觉中心。
- Queue 拖拽已有 FLIP 动画基础，分隔条交互模型清晰。
- 状态语义（success/warning/danger/info）已有 token 雏形。
- 已有 renderer 截图 harness、对比度检查和 136 张矩阵，可直接作为改造的回归手段。
- LAN 浏览器有独立的 mobile-first 设计（`docs/archive/2026-10-18-lan-history-browser/DESIGN.md`），说明“先定设计再实现”的流程在本项目可行。
