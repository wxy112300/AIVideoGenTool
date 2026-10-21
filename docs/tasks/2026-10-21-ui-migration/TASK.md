# UI 迁移：按 DESIGN.md 重建 renderer 视觉层与交互手感

- Status: 待开始（计划已写好，等待执行者认领）
- Updated / Owner: 2026-10-21 / 计划作者为设计阶段 agent；执行者由用户指派（预期 GPT），认领时改写本行
- Scope / Authority: 用户已授权按 [DESIGN.md](../../../DESIGN.md) 与已确认原型迁移 renderer 的视觉、布局与动效。下文 B 类条目会改变行为或持久化数据，开工前逐条按“决定”列处理；其余条目视为已批准。
- Baseline: 0.66.5；迁移前截图 [docs/research/ui-design/baseline-0.66.5](../../research/ui-design/README.md)
- Execution: direct。每个阶段是一个可单独验收的包，按顺序合入；不要一次性大改。
- Version impact: minor（视觉重做 + 少量已确认的行为变化）

## Resume

- 设计阶段已结束，设计不再变：视觉语言见 DESIGN.md，可交互参照见 `prototypes/`（以 http 打开，见 [prototypes/README](../../../prototypes/README.md)），设计决定与理由见 [设计 TASK](../2026-10-20-ui-design-system/TASK.md)“用户决定”第 1–41 条。
- 下一步：M0。先读本文件“交接说明”，再读 DESIGN.md 第 12–14 节。
- 不要重复：不要重新调研审美方向、重做原型或改设计决定；遇到设计没覆盖的情况，按 DESIGN.md 第 14 节套用已有模式，确实没有时再问用户。

## 交接说明（给执行者）

1. **原型是“长什么样、怎么动”的目标，不是功能实现。** 原型数据全是模拟的；按钮做什么、有哪些状态、数据从哪来，一律以当前 `src/renderer` 与 `src/core` 为准。原型里看到的功能如果当前程序没有，先查本文件 B 类表；表里没有的，当作原型示意，不要实现，记下来问用户。
2. **不要整段复制原型 JS。** `prototypes/design-system/ds.js` 的交互逻辑（下拉、滑块、菜单、提示浮层、FLIP、通知、进度按钮、边缘光）可以作为参考改写成 TypeScript 模块；页面原型的 JS 只用来看交互细节。
3. **所有现有入口保留。** 按钮、快捷键、右键菜单、拖放、撤销重做都不能少（设计 TASK 第 15 条）。原型把位置挪了的，以原型为准；原型里找不到的现有入口，保留在最接近的位置并记录。
4. **文案三语。** 新增或改写的界面文字走 `src/core/i18n-keys.ts` 与 `src/core/locales/{zh-CN,zh-TW,en-US}.ts`（见 [LOCALIZATION_CONTRACT](../../LOCALIZATION_CONTRACT.md)）；删除的说明文字同时删掉无用 key。原型只有中文，英文 / 繁中由执行者按同样的简洁度写。
5. **每个阶段收尾**：对照基线截图与原型拍新截图（同一组页面状态），跑该阶段的验证命令，在本文件“进度”里记一行。

## 输入与权威顺序

最新用户指令 → 设计 TASK“用户决定” → DESIGN.md → 页面原型（`prototypes/*.html`）→ 样板（`prototypes/style-tile.html`）→ [UX_CONTRACT](../../UX_CONTRACT.md)（行为与验收，和视觉冲突时行为优先）→ 当前代码。

问题审计（迁移时可逐项关闭并在记录里引用编号）：[ui-audit.md](../2026-10-20-ui-design-system/evidence/ui-audit.md)。

## 不变量

- 不改 AppApi / preload / IPC、队列与历史语义、草稿与队列快照分离、任务 / 输出 / 历史身份（AGENTS“Product invariants”）。B 类条目除外，且只按表中范围改。
- 焦点、输入、选区、拖放与播放在无关刷新时不被打断（UX_CONTRACT）。定时刷新只改文本与 CSS 变量。
- LAN 浏览器（`src/web/`）保持独立设计，只共享 token；本次不重做它，但 token 改名时要保证它仍能编译和显示。
- 每个页面包删除它取代的旧规则，**不得新增 refinement / override 层**。
- 不启动 ComfyUI / GPU；视觉迁移不需要真实生成。截图用隔离 userData 与 mock preload。

## 现状地图（2026-10-21）

| 项 | 现状 |
| --- | --- |
| 样式入口 | `src/style.css` 依次 `@import` 11 个文件：`00-tokens`（157 行）、`01-foundation`（518）、`02-visual-refresh`（667）、`03-acceleration`（173）、`04-history-stage`（645）、`05-density-refinement`（889）、`06-settings-layout`（838）、`07-create-composer`（461）、`09-create-header`（87）、`10-final-refinements`（2,076）、`11-history-curation`（1,196），共约 7,700 行 |
| LAN | `src/web/main.ts` 引入 `00-tokens.css` + `palette.css` |
| 对比度检查 | `scripts/check-ux-ui-text-contrast.mjs` 读 `00-tokens.css` 与 `02-visual-refresh.css`，改结构时同步改脚本 |
| 截图 | `scripts/capture-ux-ui-renderer-baseline.cjs`（需 Vite 5173；mock preload 按 `studio-client.ts` 方法清单自动补桩） |
| 页面代码 | `src/renderer/shell/`（顶栏、对话框、通知、资源监视、Upscale 窗口）、`pages/create/`（`page.ts` 标记 + 各 controller + `view-model.ts`）、`pages/queue/`（`card.ts`、`drag-sort.ts`、`live-status.ts`）、`pages/history/`（`page.ts`、`layout-controller.ts`、`timeline*.ts`、`lightbox-controller.ts`、`filter-controller.ts`、`batch-controller.ts`、详情在 `page.ts` 内）、`pages/settings/`（`page.ts`、`fragments.ts`、`copy.ts`、各 controller）、`shared/`（`icons.ts`、`markup.ts`、`status.ts`） |
| 测试 | `tests/` 241 个文件，约 34 个检查 DOM / class；改标记会碰到这些测试，按“行为不变、选择器随结构更新”的原则修改，不删断言意图 |

## 目标结构

- `src/styles/` 改为 `@layer reset, tokens, base, components, patterns, pages, legacy;`：
  - `tokens.css`：DESIGN.md 第 2–4、8 节的全部 token，含 `data-accent / data-palette / data-depth / data-motion` 选择器（取值照抄 `prototypes/design-system/tokens.css`）。这是唯一主题源。
  - `base.css`：reset、字体、滚动条、焦点环。
  - `components/*.css`：按钮、表单、浮层、反馈、导航（对应 `controls.css` / `surfaces.css`）。
  - `patterns/*.css`：参考卡与添加块、提示词编辑器、参数网格与分辨率选择器、堆叠列表、任务卡、历史卡与筛选、详情分区、设置行与模型卡（DESIGN.md 6.7–6.11）。
  - `pages/*.css`：只放页面布局。
  - `legacy`：迁移期间把旧 11 个文件整体放进这一层（优先级最低），每完成一个页面包就删除其中对应规则；M9 时该层为空并删除。
- 交互助手改写为 `src/renderer/shared/ui/` 下的 TS 模块：`select`（原生 select 为数据源）、`slider`、`menu`、`tooltip`（唯一浮层）、`notify`（并入现有 `notifications.ts`）、`motion`（flip / enter / exit / tween / reduced-motion）、`pointer-light`、`sortable`（列表内相对定位拖动 + 键盘）、`progress-button`、`stable-label`、`view-transition`。

## 原型内容分类

### A 类：纯视觉 / 布局（已批准，直接做）

所有页面的材质、层级、排版、图标、文案减量、动效；按钮位置调整；通知移到顶部居中；唯一提示浮层；自定义下拉；进度按钮；骨架屏；数字补间；边缘光；页面切换与首帧呈现。

### B 类：会改变行为或数据（逐条处理）

“现状”一列是计划作者的快速核对，执行者开工前需再确认。

| # | 内容（设计 TASK 条目） | 现状 | 决定 |
| --- | --- | --- | --- |
| B1 | 外观设置：主题色 / 灰阶 / 深度 / 动态效果，新增持久化字段（24） | 无 | 已批准。加 Settings 字段 + 默认值迁移 + 契约；立即生效，不计入未保存改动 |
| B2 | 草稿保存失败提示，去掉常驻“自动保存”（30） | `create/coordinator.ts` `scheduleDraftSave` 未处理错误 | 已批准。捕获错误，提交栏显示“草稿未能保存 · 重试” |
| B3 | 设置页底部未保存条 + 离开确认；修复“只浏览就出现未保存更改”（33、S-05） | 有保存 / 放弃按钮；误报 bug 已确认 | 已批准。先修误报（比较规范化后的值），再换 UI |
| B4 | LoRA 拖动排序 + 插入型添加菜单（39） | 上移 / 下移按钮 + 选择后添加 | 已批准。只换交互，store 操作仍是移动 / 添加；键盘 ↑/↓ 可用 |
| B5 | 参考位：清空素材与删除 Slot 分开、末尾添加块（39） | 需核对 `references-controller.ts`、`image-edit-controller.ts` 现有“清除媒体”是否保留空位 | 已批准。若现在只有“删除整位”，新增“清空素材保留空位”只改 renderer 状态，不改 IPC |
| B6 | 视频清晰度“自定义”档，短边 256–2160 步进 16（39） | 预设来自 catalog `H3_BASE_RESOLUTIONS` 等；工作流是否接受任意短边未验证 | **需用户确认 + 技术验证**：确认各模型可接受的对齐与上限，草稿 / 队列快照需新字段；不支持的模型隐藏“自定义” |
| B7 | 图片输出分辨率自由滑块（39） | `imageTargetResolutionValues` 固定档位 | **需用户确认**：`imageOutputDimensions` 支持任意短边（对齐 8）后才开放滑块；否则滑块按档位吸附 |
| B8 | 富文本提示词：参考标签、时间段 / 对白 / 字段高亮（21、39） | 原生 textarea | **先做技术验证**：textarea + 同步镜像层（保留原生撤销）或 contenteditable + 自管撤销栈；必须保留 Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z 与提示词版本撤销、底层纯文本、粘贴清洗。验证通过前保持 textarea，只做视觉 |
| B9 | 快速插入改为可搜索菜单、点击即插入、保持打开（20） | 下拉选择 + 插入按钮 | 已批准。插入内容与现有 snippet 相同 |
| B10 | 历史筛选：模型多选、标签窗口内逐个包含 / 排除、筛选栏就地编辑（35） | `HistoryFilterState.modelId` 为单值；`tags` / `excludedTags` 已分开 | 已批准。`modelId` → `modelIds: string[]` 需迁移已保存筛选（空数组 = 全部），并同步 LAN `src/web/filters.ts` 的兼容 |
| B11 | 历史时间轴改为右侧悬浮细轨道（37） | `timeline-controller.ts` 占 36px 栏 | 已批准。行为需求不变（见第 37 条） |
| B12 | 批量编辑标签窗口、批量删除确认窗口（35 第五版） | 需核对 `batch-controller.ts` / `tags-controller.ts` 现有语义 | 已批准，沿用现有语义，只换成窗口 |
| B13 | 队列创作包“本段完成后暂停 / 本作品完成后暂停”（34 第五版） | 只有“本条完成后暂停” | **依赖长视频 TASK** 提供段级暂停能力；没有能力前只显示现有按钮 |
| B14 | 队列提示词“约 N tokens”（34 第七版） | 需核对 | 已批准，用真实 tokenizer 或现有估算函数，悬停说明估算来源 |
| B15 | 视频详情：全部输出文件中单独删除音画 AV / Run 清单（35 第二版） | 需核对 `history-destructive-service.ts` | 有现成 API 才做；没有则只做视觉，记录待办 |
| B16 | 提升分辨率窗口按模型显示选项与预计输出（35 第二版） | `shell/upscale-controller.ts` | 字段以现有选项为准；预计输出没有数据源的项显示“待首次基准” |
| B17 | 设置页：整理图片素材库窗口、清理缓存窗口（33） | 缓存进度在卡片内联 | 已批准，只是移入窗口，字段与阶段不变 |
| B18 | 页面切换 View Transition、首帧整体呈现（41） | 无 | 已批准，纯 renderer |

## 阶段

每个阶段：做完 → 截图对照（基线 vs 新 vs 原型）→ 验证 → 在“进度”记一行。M2 之后每个页面包可以单独合入。

| 阶段 | 内容 | 主要文件 | 验收 |
| --- | --- | --- | --- |
| M0 准备 | 认领；用 http 打开原型逐页过一遍；补拍基线（若 renderer 已比 0.66.5 新）；确认 B6 / B7 / B8 的方向；建立新旧截图脚本参数（同一组页面状态） | 本文件 | 用户对 B6–B8 有答复或明确暂缓 |
| M1 Token 与分层 | 新 `tokens.css` + `@layer` 结构，旧 11 个文件进 `legacy` 层；`data-*` 外观属性（默认值写死，B1 前不读设置）；对比度脚本改读新 token；LAN 继续可编译 | `src/styles/`、`src/style.css`、`src/web/main.ts`、对比度脚本 | `verify` 通过；全页面截图与基线仅有 token 引起的颜色 / 字号差异，无布局破坏 |
| M2 组件与交互助手 | 按钮层级、表单、自定义下拉、滑块、开关、分段、chip、评分、菜单、唯一提示浮层、对话框、通知（顶部居中栈）、进度按钮、骨架、边缘光、动效模块（含 reduced-motion） | `components/`、`shared/ui/`、`notifications.ts`、`shell/dialogs.ts` | 键盘：下拉方向键 / Home / End / 首字母 / Esc；提示不被裁切；减少动态模式；单元测试覆盖 select / sortable / notify 核心逻辑 |
| M3 外壳 | 顶栏、导航、资源监视（数字补间）、返回顶部、页面切换 View Transition、首帧整体呈现、外观设置读取（B1 持久化可在此完成） | `shell/`、`render-coordinator.ts`、`bootstrap.ts` | 切页无白闪；顶栏不动；焦点去向不变 |
| M4 Create | 左列参考卡 / 添加块 / 媒体操作条（B5）、首尾帧、续写（裁剪、Motion Context、Continuum 文件）、图片处理与标记编辑器；右列提示词卡（B9；B8 按 M0 决定）、输出设置（Spectrum / latent 下拉与锁定、分辨率选择器预设部分；B6 / B7 按决定）、时间与运动（移到 LoRA 上方）、LoRA 堆叠（B4）、Seed 与工作流、提交栏（B2）；长视频分页条与布局 | `pages/create/*`、`patterns/` | 用户旅程 `harness:app -- guide create`：缺素材 → 恢复 → 实际点击加入队列 → 得到任务 ID；草稿编辑不改已入队快照；提示词撤销 / 版本撤销仍可用 |
| M5 Queue | 页头状态行、性能条、当前任务卡（安全区预览、进度、提示词自适应行数）、等待卡（顶部对齐、文件名标题）、分割线、需处理、⋯ 菜单与移除确认、拖动排序（列表内相对定位）、创作包卡（全局 / 段落切换；B13 按能力） | `pages/queue/*` | 拖动与键盘排序、分割线、暂停 / 继续语义不变；运行中刷新不打断拖动与菜单 |
| M6 History 列表 | 卡片两行文字、徽章一行、悬停播放、骨架与错峰呈现、封面 `decode()` 后替换、筛选栏（B10）、批量条与窗口（B12）、时间轴（B11）、通知 | `pages/history/*` | 瀑布流 / 相册尺寸与间距按第 16 条；筛选结果与旧实现一致（旧筛选迁移后结果不变）；批量选择在重排后保留 |
| M7 详情页 | 视频详情（播放器、标签两行、右栏分区、提示词全宽、生成记录自由流、Continuum 行、删除确认、B15）；图片详情（版本轨、查看区、右栏、大图查看）；提升分辨率窗口（B16） | `pages/history/page.ts` 详情部分、`lightbox-controller.ts`、`shell/upscale-controller.ts` | 父导航与返回位置保留（AGENTS）；Page Up / Down、←/→ 切换；全屏控制 |
| M8 Settings | 侧导航顺序、设置行、模型 / LoRA / 节点 / 运行时卡、文件清单折叠、来源与位置窗口、外观分区（B1）、未保存条与离开确认（B3）、素材库与缓存窗口（B17）、日志 | `pages/settings/*` | 只浏览不出现未保存；保存 / 放弃 / Ctrl+S；扫描与安装进度按钮可取消 |
| M9 收尾 | 删除 `legacy` 层与旧文件；文案三语复查；重拍完整截图矩阵并更新 [UX_UI_RENDERER_BASELINE](../../UX_UI_RENDERER_BASELINE.md)；更新 UX_CONTRACT 中被 DESIGN.md 取代的视觉条款；CHANGELOG（minor） | 全局 | `npm.cmd run verify`；所有页面截图与原型对照；`rg` 确认无旧层引用 |

## 验证

- 每个包：相关 Vitest + `npm.cmd run typecheck`；涉及共享状态 / 队列 / 历史 / IPC 的包（M4–M8）跑 `npm.cmd run verify`。
- 视觉：`npm.cmd run verify:ux-ui-contrast`；截图对照（基线 0.66.5 / 新 / 原型同状态）；1440、1120、900、820 四个宽度；减少动态模式；键盘走查。
- 用户旅程：`npm.cmd run harness:app -- guide <journey>`，按 [PRODUCT_JOURNEYS](../../runbooks/PRODUCT_JOURNEYS.md) 验证“缺输入 → 恢复 → 实际点击 → 任务 ID”，不能只用 API 入队证明。
- 手感（人工）：拖动、菜单、通知栈、页面切换、骨架、悬停播放；在报告里写清哪些是人工看过、哪些未验证。

## 风险

| 风险 | 处理 |
| --- | --- |
| 自定义下拉破坏键盘与表单值 | 原生 `<select>` 始终是数据源，controller 不改；先写单元测试 |
| 富文本编辑器破坏撤销与输入法 | B8 先验证，失败就保留 textarea |
| 大量 DOM 测试因标记变化失败 | 按行为改选择器；同一包内修完，不跳过测试 |
| 新旧样式层叠冲突 | 新规则在更高 `@layer`；旧规则只删不改 |
| 外观字段迁移影响旧设置文件 | 默认值兜底；读不到时用默认，不报错 |
| 筛选状态形状变化影响 LAN 与已存筛选 | `modelId` 读入时转成 `modelIds`，写出新形状；LAN 兼容两种 |
| 与其他任务同时改 Create / Settings | 认领前检查 [tasks/README](../README.md) 中长视频、Prompt、Settings 相关任务的进行中文件，按 AGENTS 协调写入者 |

## 进度

| 日期 | 阶段 | 结果 / 证据 | 执行者 |
| --- | --- | --- | --- |
| 2026-10-21 | 计划 | 本文件；设计阶段关闭 | 设计阶段 agent |
