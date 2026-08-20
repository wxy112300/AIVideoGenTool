# Apple HIG 与 Frontend Design 启发的界面、排版及 UX 改进计划

> 状态：规划草案  
> 审阅日期：2026-08-20  
> 产品：Local Video Studio 0.29.5（Windows Electron）  
> 范围：Create、Queue、History、视频/图片详情、Settings、全局壳层与反馈机制

> 渐进实施、agent 文件所有权和逐阶段验收见 `docs/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md`；Luna 等较弱模型使用 `docs/UX_UI_LUNA_EXECUTION_GUIDE.md` 的原子 package。

## 1. 结论

当前界面已经具备稳定的深色创作工具基调、清楚的四区主导航、较完整的异步状态，以及相对成熟的队列和历史详情结构。问题不是“视觉风格不够像 Apple”或“缺少装饰”，而是界面仍过度依赖小字号、边框卡片和技术状态来组织信息，且页面构图、断点和 sticky 层缺少统一所有权，导致创作任务、系统状态和辅助操作经常处于相近的视觉层级。

本轮建议把体验目标从“把所有能力都放在当前页面”调整为“让当前任务、当前决定和恢复路径始终最清楚”。优先改进：

1. 窄窗口下 Create 的 Prompt 与主要决定掉出首屏；
2. 错误通知会自动消失，缺少持久恢复入口；
3. Settings 分类、保存区和模型状态在窄窗口中拥挤，且页签语义不完整；
4. 全局导航、上下文菜单、局部状态更新的键盘和辅助技术语义不足；
5. 10–11px 辅助文字、重复边框和状态徽章过多，削弱阅读与扫描；
6. Queue 遥测、详情记录和 Settings 状态形成等权“卡片墙”，主工作区不够安静；
7. 高亮蓝同时承担品牌、主操作、选中、焦点、信息和装饰，形成通用 AI SaaS 观感；
8. 原型、当前实现和 UX 契约之间需要建立可持续的同步与验收机制。

本项目是 Windows Electron 应用，因此只能称为 **Apple-inspired**，不能称为 HIG-compliant。Apple HIG 用于指导层级、克制、反馈、可恢复性、键盘效率和窗口适应；具体 HTML 语义、Windows 输入习惯及 Electron 行为仍以宿主平台和 Web 可访问性为边界。

## 2. 审阅方法与证据边界

### 2.1 参考方法

本次采用社区 Codex skill [`design-with-apple-hig`](https://github.com/Sunwood-ai-labs/design-with-apple-hig) 的 evidence-first 方法：

- Apple 官方 HIG 决定 Apple 设计主张；
- 当前代码、原型和渲染结果只证明可观察事实；
- 社区 skill 和设计经验只作为发现问题的工具；
- 不把 Apple 移动端尺寸直接当作 Windows/Web 合规阈值；
- 每项正式结论区分官方指导、观察、静态审计和启发式判断。

补充参考了 [`apple-hig-skills`](https://github.com/yue1123/apple-hig-skills) 的跨主题检查框架，但未采用其 React Native 实现建议或将 iOS 数值直接移植到 Electron。

排版专项采用 Anthropic 官方 [`frontend-design`](https://github.com/anthropics/claude-code/tree/main/plugins/frontend-design/skills/frontend-design) skill 的方法：先为产品确定清楚的视觉方向，再检查 typography、structure、spacing、motion 与层级是否共同服务该方向；把结构用于编码信息，而非把所有内容包装成卡片；让一个界面只在一个地方“花费视觉大胆度”，其余区域保持安静。该 skill 是设计方法补充，不是本项目的实现契约；最终仍以当前产品任务、`UX_CONTRACT` 和运行证据为准。

色板分级补充参考 [Radix Colors custom palettes](https://www.radix-ui.com/colors/docs/overview/custom-palettes) 的 role/scale 思路，用于区分 background、surface、border、solid、text 与 alpha 变体；本计划不要求引入 Radix 依赖，也不把其预设色当作最终品牌方案。

### 2.2 Apple 官方来源

检索日期均为 2026-08-20：

- [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/)：层级、和谐、一致性；
- [Designing for macOS](https://developer.apple.com/design/human-interface-guidelines/designing-for-macos/)：可调整窗口、键盘与精确指针输入、长时间生产力任务；
- [Design principles](https://developer.apple.com/design/human-interface-guidelines/design-principles)：目的、控制感、熟悉性、简洁、反馈和错误恢复；
- [Layout](https://developer.apple.com/design/human-interface-guidelines/layout)：按阅读顺序表达重要性、对齐、窗口适应和稳定重排；
- [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility/)：可感知、直观、可适应，不依赖单一视觉信号；
- [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)：清楚命名、状态反馈、悬停提示和等待反馈；
- [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)：让用户理解发生了什么并能恢复；
- [Keyboards](https://developer.apple.com/design/human-interface-guidelines/keyboards)：支持高频操作和键盘工作流。
- [Color](https://developer.apple.com/design/human-interface-guidelines/color)：颜色保持一致语义，背景、前景、separator 与状态按角色分层；
- [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode)：暗色不是简单反相，使用较暗 base 与较亮 elevated surface 建立深度；
- [Typography](https://developer.apple.com/design/human-interface-guidelines/typography)：用字号、字重和颜色建立层级，避免过多字体与轻细字重。

### 2.3 仓库证据

- 已读取 `docs/AGENT_START_HERE.md`、`docs/UX_CONTRACT.md` 和 `prototypes/README.md`；
- 已审阅 `src/renderer/`、`src/styles/`、`prototypes/` 及相关测试；
- 已将 standalone prototypes 直接渲染为 1280×800、1440×900，并在 Create、History、Settings 上补充 800×800 检查；本轮排版复核又逐页检查 Create、Queue、History、视频详情、图片详情和 Settings 的 900×800 构图；
- 已静态核对真实 renderer 的 DOM 顺序、grid/min-width、sticky offset、responsive breakpoint 和运行时 inline layout；prototype 截图只证明原型构图，不代替真实 renderer 验收；
- Settings 与运行时相关文件当前存在其他未提交改动，本计划以 2026-08-20 当前磁盘快照为准，不把尚未完成的代码当作已验收行为；
- 本轮没有完成真实 Electron 的屏幕阅读器、Windows 高对比度、200% 缩放或完整键盘走查，因此这些均保留为后续验收项。

## 3. 设计契约

### 3.1 产品目的

让用户在不了解 ComfyUI 图结构的前提下，以本地素材和模型完成创建、排队、监控、回看、复用和环境修复。

### 3.2 层级

每个页面只突出一个当前任务：

- Create：素材 + Prompt + 加入队列；
- Queue：当前运行阶段、总体进度、预览和安全控制；
- History：快速视觉扫描、筛选和进入详情；
- Details：媒体检查、版本选择和后续创作；
- Settings：判断“是否可用”并执行明确的修复动作。

技术证据、日志、路径、性能和高级参数必须服务于以上任务，不与任务本身争夺第一层级。

### 3.3 输入与窗口

- 主要输入：鼠标、键盘、拖放；
- 目标窗口：1440×900、1280×800、900×800、当前最小宽度；
- 重要输入不能因为状态刷新而失焦、丢失 selection 或重置滚动；
- 频繁动作可通过快捷键加速，但所有命令仍需在界面中可发现；
- 窗口缩小时优先隐藏或折叠三级信息，不先隐藏当前任务。

### 3.4 状态与恢复

所有主要异步面都覆盖 loading、ready、empty、offline、partial、error、disabled、focused。错误必须说明原因并提供 Retry、View logs、Open Settings 或 Dismiss 中至少一个合理出口；破坏性动作提供取消优先的应用内确认，并在可行时支持撤销或恢复。

### 3.5 视觉与可访问性

- 深色主题保持，但颜色只表达稳定的语义角色；
- 10–11px 只用于极短、非关键的徽章或次要数值，不承担说明、错误、操作依据；
- 交互状态不能只靠颜色；
- 使用真实 HTML 语义、可见焦点、键盘顺序、状态 announcement；
- 不追求仿制 Liquid Glass，不用更多透明和模糊来替代信息层级。

### 3.6 Frontend Design 视觉方向

本产品适合的方向是 **安静、精密的本地媒体工作台**，而不是数据仪表盘或营销型 AI 工具：

- **主画面**：素材、Prompt、当前生成任务或媒体 viewer；这是每页唯一可以占据大面积和最高对比度的区域；
- **辅助上下文**：版本、参数、状态、日志和硬件证据，使用 inspector、紧凑行或渐进披露，不与主画面组成等权卡片矩阵；
- **字体**：优先 Windows 原生 UI 字体与 Cascadia Mono 技术层，不为“独特”引入展示字体；独特性来自媒体工作区、进度与版本操作的组织方式；
- **颜色**：石墨色 canvas、一个蓝色行动强调色，以及成功/警告/危险语义色；不增加装饰性渐变和多套强调色；
- **空间**：使用 4/8/12/16/24/32 的主刻度；例外值只用于真实几何约束并记录原因；
- **边界**：只有可独立选择、移动、删除或操作的对象保留 surface；section 主要用标题、留白和 divider 分组；
- **标志性体验**：让“本地媒体 + 当前运行进度 + 可恢复控制”成为产品辨识度，而不是额外玻璃、光晕或卡片装饰。

## 4. 需要保留的现有优点

后续改造必须保留：

- 队列任务是不可变执行快照，当前任务在原卡片内展开；
- Create 现有原生 textarea undo/redo 与应用级清空撤销；
- History 的视频/图片顶层分类、详情页保持 History 选中；
- 详情页媒体与版本缩略图保持为一个查看区域；
- 模型文件、节点安装、运行时验证继续作为不同证据呈现；
- ComfyUI 离线时仍能扫描文件，离线不等于安装失败；
- 破坏性动作继续使用应用内对话框，默认焦点保持在安全操作；
- 当前深色、低装饰、内容优先的总体产品性格；
- Settings 当前未提交的安装/更新/扫描工作不得被本计划覆盖或回退。

## 5. 发现与改进建议

严重度采用 `Major / Moderate / Minor`。`OBSERVATION` 表示代码或渲染可确认；`HEURISTIC` 表示适合本产品但不是 Apple 强制规则。

### 5.1 Major — Create 窄窗口把 Prompt 和核心决定推到首屏之外

- **证据**：`OBSERVATION`。800×800 渲染中，标题、模式切换、来源提示、多参考 Slots 和素材区占满视口，Prompt 完全不可见；`src/styles/04-history-stage.css` 在 1120px 以下把 `.create-workspace` 改为单列，但保持素材区在 Prompt 前；`src/styles/05-density-refinement.css` 又将提交条粘在底部。
- **影响**：用户进入 Create 后先面对素材管理，无法立即确认或编辑生成意图；固定提交条显示“可加入队列”，却看不到决定输出的 Prompt，增加误提交概率。
- **来源**：`APPLE-HIG` Layout 强调按阅读顺序表达重要性；本项目 `UX_CONTRACT` 要求当前媒体输入和 Prompt 同为主要决定。
- **修复**：在小于 1120px 时采用“Prompt 优先的任务流”，把 Prompt composer 放在素材摘要之后、完整素材列表之前；已选素材折叠为紧凑摘要，可展开编辑。模式切换保留顶部，但减少说明文字占高。
- **验证**：800×800 和 900×800 首屏同时可见当前模式、素材摘要、Prompt 第一行和主要动作；Tab 顺序与视觉顺序一致；切换模式后焦点和草稿保持。

### 5.2 Major — 错误通知短暂消失，缺少恢复动作

- **证据**：`OBSERVATION`。`src/renderer/notifications.ts` 将 error 默认时长设为 10 秒；`src/main.ts` 的 `showMessage` 到期后自动切换下一条；`src/renderer/shell/page.ts` 只渲染文本，没有关闭、重试或查看日志按钮。
- **影响**：模型、路径、安装和生成错误可能在用户读完前消失；用户必须自己猜测下一步，长任务失败尤其明显。
- **来源**：`APPLE-HIG` Design principles / Feedback 强调清楚反馈和错误恢复；`UX_CONTRACT` 要求错误提供 retry/log/details when useful。
- **修复**：成功/信息可自动消失；warning 可延长并允许关闭；error 默认持久。通知模型增加 `actions[]`、`dismissible`、`dedupeKey` 和来源上下文，支持 Retry、View logs、Open Settings、Show file。
- **验证**：错误在主动关闭或恢复后才消失；键盘可到达通知动作；重复错误合并计数；读屏只播报新增内容，不反复播报整个页面。

### 5.3 Major — Settings 分类在窄窗口占据过多首屏，且不具备页签语义

- **证据**：`OBSERVATION`。800×800 渲染中，保存动作换成孤立第二行，9 个分类变成 3×3 大区；`src/styles/06-settings-layout.css` 在 900px 以下使用三列；`src/renderer/pages/settings/page.ts` 使用普通 `nav > button`，没有 `tablist/tab/tabpanel`、`aria-selected`、`aria-controls`。
- **影响**：用户进入设置后先看到导航本身，而非当前恢复任务；键盘和辅助技术无法按页签模式理解或操作分类；整页重渲染时焦点归属不清楚。
- **来源**：`APPLE-HIG` Layout / Accessibility；`UX_CONTRACT` 要求 controls 使用符合行为的语义。
- **修复**：宽屏保持左侧分类；900px 以下改成单行可横向滚动的分类栏或带搜索的 category pop-up，不使用 3×3 仪表盘。实现完整 tab pattern：Arrow/Home/End、`aria-selected`、`aria-controls`、tabpanel 标题、切换后保留合理焦点与滚动。
- **验证**：800×800 当前分类标题和首个决策区在首屏；键盘可完成分类切换；屏幕阅读器宣布当前分类；长本地化不截断关键分类。

### 5.4 Major — 本地化仍有硬编码简体中文

- **证据**：`OBSERVATION`。`src/renderer/pages/settings/fragments.ts` 中硬件建议、可选组件说明和部分 `aria-label` 仍直接写简体中文，例如 `modelHardwareRecommendations`、Lightning 可选说明及“查看 …”标签。
- **影响**：en-US、zh-TW 模式出现混合语言；更严重的是可访问名称也可能与视觉语言不一致。
- **来源**：`APPLE-HIG` Layout / Accessibility 强调适应本地化和一致语义；本项目已有完整 locale 架构。
- **修复**：硬件建议改为结构化事实 + i18n 模板；所有 `aria-label/title/error/recovery` 进入 locale；增加静态测试禁止 renderer 模板出现未豁免中文文本。
- **验证**：en-US、zh-CN、zh-TW 对 Settings 全分类截图与可访问名称快照；路径、模型名、品牌名作为允许保留项单独白名单。

### 5.5 Major — History 卡片可聚焦但不能用键盘打开

- **证据**：`OBSERVATION`。`src/renderer/pages/history/page.ts` 的视频和图片卡片使用 `article tabindex="0"` 并在可访问名称中表达“打开详情”，但 `src/renderer/pages/history/navigation-controller.ts` 只绑定 click，没有处理 Enter/Space。
- **影响**：键盘用户能到达卡片，却不能执行卡片承诺的主操作；焦点能力形成误导。
- **来源**：`APPLE-HIG` Keyboards / Accessibility；Web 语义是 Electron 实现边界。
- **修复**：优先把卡片主入口改成真实标题链接或按钮，避免与卡内收藏、评分、预览滑杆形成嵌套交互；若保留 article，则补正确 role、Enter/Space 和事件隔离。提供可见 More 按钮及 Shift+F10/ContextMenu 键入口。
- **验证**：Tab 到视频/图片卡后 Enter/Space 打开；卡内滑杆和按钮不误触发卡片；返回 History 后焦点回到原卡片。

### 5.6 Major — 图片 Lightbox 的 modal 语义与焦点行为不一致

- **证据**：`OBSERVATION`。`src/renderer/pages/history/fragments.ts` 将 Lightbox 标为 `role="dialog" aria-modal="true"`；`lightbox-controller.ts` 会把焦点移入并支持 Escape/方向键，但没有 focus trap 或背景 inert。
- **影响**：Tab/Shift+Tab 可以进入被遮罩页面，用户同时面对“模态视觉”和“非模态键盘行为”。
- **来源**：`APPLE-HIG` Accessibility / Modality；本项目已有 shell modal focus 方案可复用。
- **修复**：复用统一 dialog controller：记录触发者、循环焦点、背景 inert、Escape 关闭、关闭后回焦；版本切换不得重建整个对话框或丢失当前焦点。
- **验证**：首末可交互项之间正确循环；背景不可访问；Escape 与关闭按钮都回到原“大图查看”入口；连续切版本后仍成立。

### 5.7 Major — 图片历史缺少完整的异步媒体状态

- **证据**：`OBSERVATION`。视频卡已经区分 loading/error；图片 gallery、detail、版本缩略图直接输出 `img`，部分加载 catch 为空，没有一致的 loading、missing、decode error 或 retry UI。
- **影响**：文件删除、权限变化、缓存损坏或慢加载时出现空白/破图，用户不知道是等待、缺失还是失败，也没有恢复路径。
- **来源**：本项目 `UX_CONTRACT` 的 Async and Media States；`APPLE-HIG` Feedback / Accessibility。
- **修复**：抽出共享 image media state component/controller，覆盖 loading skeleton、ready、missing、read/decode error、retry 和 locate；失败不能清除仍有效的旧缩略图或封面。
- **验证**：慢加载、源文件删除、权限失败、缓存损坏和重试成功；gallery、detail、version rail、lightbox 使用相同路径规则和状态语言。

### 5.8 Moderate — 全局导航只有视觉 active，没有当前页语义

- **证据**：`OBSERVATION`。`src/renderer/shell/page.ts` 用 `.active` 标记四区导航，但没有 `aria-current="page"`；History detail 虽视觉保持 History 选中，辅助技术无法获知。
- **影响**：视觉用户能定位，键盘/读屏用户得到的信息更弱；导航按钮与页面状态之间缺少机器可读关系。
- **修复**：当前页面按钮增加 `aria-current="page"`，保留现有视觉 active；为队列计数补充完整可访问文本，避免只读数字。
- **验证**：四个页面及两种 History detail 的辅助树快照；队列计数更新不抢占焦点。

### 5.9 Moderate — 菜单与分类键盘模型不完整

- **证据**：`OBSERVATION`。History/日志上下文菜单创建了 `role="menu/menuitem"` 并支持 Escape，但主要依赖鼠标 `contextmenu`；没有完整 Arrow/Home/End 导航和可靠的关闭后回焦。Settings 分类同样缺少页签键盘模型。
- **影响**：指针操作较完整，键盘用户却无法等价完成高频文件和日志操作；关闭浮层后可能丢失工作位置。
- **来源**：`APPLE-HIG` Designing for macOS / Keyboards；在 Electron 中作为 `HEURISTIC` 转换为桌面键盘效率要求。
- **修复**：抽出共享 menu controller，支持 Shift+F10/Menu 键、roving focus、Arrow/Home/End、Enter/Space、Escape 和 return focus；History 卡片保留可见的 More 按钮作为发现入口。
- **验证**：仅键盘完成查看详情、复制路径、定位文件、删除前取消；菜单打开与关闭后焦点可预测。

### 5.10 Moderate — 小字号被用于大量解释和判断信息

- **证据**：`OBSERVATION`。`src/styles/` 中有约 163 处 `font-size: 10px` 或 `11px`；它们不仅用于徽章，也承担模型说明、Prompt 辅助、运行时路径、队列阶段、错误提示和历史元数据。1280×800 渲染显示多个区域需要近距离逐字辨认。
- **影响**：降低长时间使用的舒适度；让次级信息全部变成“同样弱”，用户更难判断哪些说明与操作有关。
- **来源**：`APPLE-HIG` Accessibility / Typography；具体像素值为 `HEURISTIC`，不是 Apple 对 Electron 的强制阈值。
- **修复**：建立四级桌面类型令牌，例如标题、正文/控件、辅助、微型；说明与恢复文本至少使用辅助级，微型级只保留短徽章、非关键计数和紧凑表头。禁止组件内继续新增裸字号。
- **验证**：Windows 100%/125%/150% 缩放、1280×800、长简中/英文；对照检查行高、截断、卡片高度和控件对齐。

### 5.11 Moderate — 卡片和边框层级过多，内容与控件不够分离

- **证据**：`OBSERVATION`。Create 的来源提示、Slots、单个 Slot、Prompt、核心输出和底栏都使用边界；Settings 的页面、section、状态卡、模型卡、组件行继续嵌套；多个 CSS 文件反复覆盖相同 selector。
- **影响**：边框成为主要组织手段，媒体、Prompt 和当前状态失去明显优势；视觉复杂度随功能增长线性上升。
- **来源**：`APPLE-HIG` HIG 首页的层级/和谐/一致性；本项目 `UX_CONTRACT` 明确避免无真实对象含义的 nested bordered cards。
- **修复**：只为“独立对象”保留 card，例如队列任务、历史作品、模型 profile；页面段落用间距、标题、分隔线组织；状态卡改为 definition list 或紧凑 evidence row；形成一次 CSS 层级收敛，不再用末尾覆盖继续修补。
- **验证**：同一页面减少至少一层非语义边框；主操作与媒体在 3 秒扫描中可识别；Create、Queue、History、Settings 共用控件状态无漂移。

### 5.12 Moderate — History 窄窗口工具区与标题竞争

- **证据**：`OBSERVATION`。800×800 渲染中，视频/图片、筛选、结果数、瀑布流/相册拆成两行并占据标题右侧和下一行；工具的视觉权重接近页面标题。
- **影响**：首屏扫描方向不稳定，过滤器状态与布局切换混在一起；新增筛选条件后更容易继续换行。
- **修复**：标题行只保留媒体类型与结果数；筛选作为明确的 Filter 按钮，打开可持久的 popover；布局切换作为紧凑 segmented control 放在同一工具带末端。窄窗口时工具带独立成行，但保持单一阅读顺序。
- **验证**：800/900/1280 宽无三行工具碎片；过滤条件有清楚的 active count；Escape 关闭并回焦；删除项目不改变瀑布流列数。

### 5.13 Moderate — Settings 保存区在窄窗口失去动作组合

- **证据**：`OBSERVATION`。800×800 渲染中“重新扫描全部 / 放弃更改 / 保存设置”因换行而分散，“保存设置”单独落到下一行，看起来像不相关动作。
- **影响**：扫描与表单提交的边界不清楚；用户不易判断哪些设置是即时生效、哪些等待保存。
- **修复**：把环境扫描归入当前环境区，而非页面保存组；页面级只保留“未保存状态 / 放弃 / 保存”。窄窗口采用粘性但不遮挡内容的 save bar，保证安全操作在前、主提交在后。
- **验证**：更改、保存、放弃、扫描四条路径分别有清楚状态；窄窗口不换成孤立按钮；保存时焦点和当前分类不变。

### 5.14 Moderate — 全局通知与局部状态职责重叠

- **证据**：`OBSERVATION`。扫描、安装、生成、复制和文件动作均可进入顶部 flash；部分页面同时还有局部状态。非完成类通知会清空完成通知队列。
- **影响**：高频局部动作打断全局反馈，多个并发操作时最后一次消息覆盖之前信息；用户难以建立“该去哪里看进度”的稳定预期。
- **修复**：定义反馈路由：字段校验就地显示；页面操作显示局部状态；跨页生命周期才进入全局通知；任务完成进入可查看的通知中心或 Queue/History badge。对同源通知去重，不让低价值 info 覆盖 error。
- **验证**：并发环境扫描 + Prompt 优化 + 队列完成时三类反馈各归其位；不会丢失失败消息；导航后仍可追溯任务结果。

### 5.15 Moderate — 多个当前/选中状态只靠 class 和颜色

- **证据**：`OBSERVATION`。除 shell navigation 外，History 布局按钮、图片版本和视频版本主要通过 `.active`、`.primary` 或颜色表达当前状态；部分控件缺少 group label、`aria-pressed` 或 `aria-selected`。History 媒体类型虽然有 `aria-selected`，但没有完整 roving tab stop、方向键和受控 panel 关系。
- **影响**：视觉用户能识别，辅助技术无法稳定获知当前布局、当前版本和选择变化；相似控件采用不同语义。
- **修复**：为每组控件先确定唯一模型：页面分类用 tabs；布局切换用 labeled group + `aria-pressed`；版本切换用 tabs 或明确的 pressed buttons，不混用；当前封面进入版本按钮的可访问名称。
- **验证**：Accessibility Tree/NVDA 能读出名称、角色和状态；左右键或 Tab 模型与选定控件一致；切换不触发重复 announcement。

### 5.16 Moderate — Queue 窄窗口 sticky offset 与 topbar 规则冲突

- **证据**：`OBSERVATION`。`src/styles/10-final-refinements.css` 将 Queue heading 固定为 `top: 64px`；`src/styles/04-history-stage.css` 在 760px 以下把 topbar 改成 `position: relative`，但 Queue 没有像 Create/History 一样把 offset 归零。
- **影响**：窄窗口滚动后标题可能悬在距顶部 64px 的位置，产生无意义空带并继续压缩有限高度。
- **修复**：引入统一 sticky offset token，由当前 topbar 是否 sticky 决定；760px 以下 Queue 使用 `top: 0`，避免页面各自复制 magic number。
- **验证**：1440×900、1280×800、760px 和 759px 宽上下滚动；标题无跳变、空带或内容遮挡。

### 5.17 Minor — Electron 命令体系缺少统一入口

- **证据**：`OBSERVATION`。`electron/main.ts` 调用 `Menu.setApplicationMenu(null)`；部分快捷键散落在详情导航和控件中，没有统一命令注册、可发现菜单或快捷键帮助。
- **影响**：专家用户无法形成稳定的跨页面键盘模型，快捷键也更容易冲突或遗漏本地化说明。
- **来源**：`APPLE-HIG` Designing for macOS / Keyboards 仅作为 `HEURISTIC`；应用当前目标是 Windows，不能直接要求照搬 macOS menu bar。
- **修复**：先建立内部 command registry，统一名称、可用条件、快捷键和执行函数；再决定使用 Windows 应用菜单、Command Palette 或 Help → Keyboard Shortcuts，不要求第一阶段恢复传统菜单栏。
- **验证**：快捷键冲突测试；禁用状态与按钮一致；命令可通过界面发现；文本输入时不劫持系统编辑快捷键。

### 5.18 Minor — 视频详情页没有明确的唯一主动作

- **证据**：`OBSERVATION`。视频详情的调整参数、继续创作、复制、定位和提升分辨率均使用相近 secondary 样式，只有删除依赖危险色；图片详情则已经把“开始创作视频”设为 primary。
- **影响**：页面能做很多事，但不清楚查看完成后最推荐的下一步；首屏操作扫描成本偏高。
- **修复**：按产品目标选“继续创作”或“调整参数”为唯一 primary；复制/定位保留 secondary；低频动作可进入 More，但不要隐藏恢复或文件定位。
- **验证**：视频和图片详情的动作层级一致；键盘顺序与视觉优先级一致；危险动作保持隔离。

## 6. Frontend Design 排版专项审查

### 6.1 固定视口构图结论

| 页面 | 1280×800 | 900×800 | 排版判断 |
| --- | --- | --- | --- |
| Create | 双列关系清楚，但来源提示、Slots、Prompt、输出摘要和底栏形成多层边界 | 素材列表占满首屏，Prompt 不可见，sticky 提交条覆盖底部内容 | `Major`：窄窗阅读顺序与主任务相反，见 5.1 |
| Queue | 当前任务展开结构本身清楚 | prototype 首屏被 preview、进度和六项遥测占满；真实 renderer 又先渲染四张全局遥测卡，再渲染任务 | `Major`：运行任务与系统遥测形成两个视觉中心 |
| History | 媒体封面占主导，方向正确；顶部工具偏密 | 结果数、类型、筛选和布局切换碎成两行，第一排作品被工具区下推 | `Moderate`：工具带需按任务关系重组，见 5.12 |
| 视频详情 | 大 viewer + inspector 方向正确，但 inspector 内事实和动作同权 | viewer 独占首屏，标题、主动作和恢复动作落到折叠线后 | `Moderate`：保留媒体主导，同时常驻一个下一步动作 |
| 图片详情 | viewer 与版本轨形成一个统一查看对象，值得保留 | 垂直版本轨继续占用横向空间，操作 inspector 落到首屏之外 | `Moderate`：中窄窗需在版本可辨识度与动作可达性间重新分配 |
| Settings | 对齐稳定，但状态卡、安装实例与路径卡连续堆叠 | 分类网格 + 四张状态卡消耗大部分首屏，当前配置决定只露出开头 | `Major`：导航与概览都是辅助层，却共同压过当前设置 |

### 6.2 Major — Image Edit 在中窄窗口必然横向溢出

- **证据**：`OBSERVATION`。`src/styles/10-final-refinements.css` 为 `.image-edit-workspace` 强制 `minmax(320px, .82fr) minmax(520px, 1.18fr)`，再继承 18px gap；直到 760px 才改成单列。800px 窗口扣除 34px 双侧 gutter 后内容宽约 732px，小于两列最低所需 858px。
- **影响**：761–约926px 区间会横向溢出或裁切；这不是视觉偏好，而是可计算的几何冲突。Prompt、素材删除和提交动作可能被移出可见区。
- **修复**：在真实可容纳阈值切换为单列，或移除 520px 硬下限并采用 container query；单列时仍遵循 5.1 的 Prompt 优先顺序。
- **验证**：760、761、800、900、926、960px 连续缩放无横滚；长路径、三语言与三种 image edit 模式均检查。

### 6.3 Major — Queue 把系统遥测放在当前任务之前

- **证据**：`OBSERVATION`。真实 renderer 在 `src/renderer/pages/queue/page.ts` 先输出 `.queue-performance-grid` 四张 CPU/RAM/GPU/VRAM 卡，再输出 active task；approved prototype 则把 preview 和 metrics 放进 running task。两者已经分叉。
- **影响**：Header 之后的第一主体变成设备仪表盘，而不是当前阶段、总体进度、预览和恢复控制；用户需跨越第二个视觉中心才能找到任务。
- **修复**：把运行期遥测折回 active task 的 expanded region；默认只常驻影响判断的 GPU/VRAM、阶段和 ETA，其余通过展开查看。无任务时使用紧凑环境状态，不保留四卡矩阵。
- **验证**：有任务时 header 后第一个主体永远是 active task；空队列首先显示 empty/recovery；遥测更新不改变任务卡尺寸或抢焦点。

### 6.4 Major — Sticky 层缺少统一高度契约

- **证据**：`OBSERVATION`。顶栏实际 `min-height: 72px`，Create、Queue、Settings 的二级 sticky 标题却使用 `top: 64px`；Create 的 `z-index: 20` 还高于 topbar 的 `z-index: 10`。History 使用 72px，页面之间并不一致。
- **影响**：滚动时二级标题可能覆盖顶栏底部 8px，导航切页后内容基线跳动；继续增加 sticky save bar 或通知会放大冲突。
- **修复**：建立 `--topbar-height`、`--page-sticky-offset`、`--bottom-action-height` 三个壳层令牌；所有页面引用同一来源，topbar 始终高于页面 sticky，非 sticky 断点明确归零。
- **验证**：Create、Queue、History、Settings 在 1121/1120、901/900、761/760px 上下滚动，无覆盖、空带或跳变。

### 6.5 Major — History 窄屏工具条固定高度会产生覆盖

- **证据**：`OBSERVATION`。`src/styles/05-density-refinement.css` 将 `.history-heading` 的 min-height、height、max-height 都锁定为 68px；760px 以下又在 `src/styles/04-history-stage.css` 改成单列，却没有解除固定高度。
- **影响**：标题、类型 tabs 与 view tools 进入多行后只能溢出、压叠或覆盖 gallery；固定高度隐藏了真实内容尺寸。
- **修复**：760px 以下取消 height/max-height；更早在约900px 把结构稳定分为“标题 + 类型”和“筛选 + 布局”两行，或使用一行可横向滚动工具带。sticky 高度由内容决定。
- **验证**：901→560px 连续缩放；标题、tabs、筛选、布局切换始终在正常流中，第一张作品不被覆盖。

### 6.6 Moderate — History 相册列数仍受记录数量影响

- **证据**：`OBSERVATION`。`src/renderer/pages/history/layout-controller.ts` 把 `columnCount` 初始化为 `cards.length` 并写入 inline `gridTemplateColumns`，覆盖 CSS；删除记录会改变列数和卡宽。
- **影响**：同一窗口中删除或过滤作品会让剩余卡片突然放大，破坏空间记忆，违反 `UX_CONTRACT`“列数由可用宽度决定，而不是记录数”。
- **修复**：移除 item-count 驱动的 inline 布局，使用 container width + `auto-fill/minmax()` 或固定计算；保留卡片最大宽度时用空轨道而不是拉伸剩余项目。
- **验证**：同一 viewport 从 8 项筛到 1 项，轨道和卡宽保持；瀑布流/相册切换、删除和恢复封面不跳列。

### 6.7 Moderate — Detail inspector 与下方记录形成第二个“卡片页面”

- **证据**：`OBSERVATION + HEURISTIC`。视频详情把摘要、六个 facts 和最多六个 quick actions 放进与播放器同高且可内部滚动的 sidebar；视频/图片 viewer 下方又用二列等权 panel 展示参数、输出、LoRA、输入、性能和文件。900×800 prototype 中，viewer 占满首屏，动作完全落在其后。
- **影响**：媒体查看是清楚的，但下一步动作在短窗口不可达；离开 viewer 后页面从“媒体工作台”切换为无主次的记录卡片墙，并出现页面滚动 + inspector 内滚动双层结构。
- **修复**：inspector 常驻一个 dominant action 和 2–3 个高频动作，其余进入 More 或下方；下方合并为单一“生成记录”section，内部使用 description list、divider 和 disclosure，只有真实文件对象保留卡片。
- **验证**：1280×800 不滚 inspector 即可触达主操作；900×800 有紧凑动作入口；键盘不会陷入双层滚动，长记录仍可复制和定位。

### 6.8 Moderate — CSS 级联与间距体系已成为排版缺陷来源

- **证据**：`OBSERVATION`。`src/styles/` 约4991行中有286个重复 selector 名、172个 selector 跨文件重复；热点包括 `.history-heading` 12次、`.settings-sidebar` 8次、`.create-workspace` 6次。`.page-heading` 的高度先后被写成 88、112、68px。约36.8%的正像素 gap/padding/margin 落在契约主刻度上，10、14、7、5、6、9px 大量混用。
- **影响**：最终构图依赖加载顺序和末尾补丁，断点修复难以局部推理；同类 heading、card 和 form row 的基线持续漂移。
- **修复**：按 tokens → base → shared components → page composition → colocated responsive overrides 收敛；先做无视觉变化的所有权重构，再调整设计。Spacing 统一到 4/8/12/16/24/32，几何例外需注释。
- **验证**：共享组件只有一个 canonical geometry block；不再用新尾部文件修补；固定视口 screenshot diff 在重构阶段保持稳定。

### 6.9 Moderate — Prototype 已不能可靠代表真实排版

- **证据**：`OBSERVATION`。Create prototype 仍是两张同权大 panel，renderer 已把 media column 去卡片化；Queue prototype 把遥测放在 running card，renderer 将其放在任务列表之前；Image detail 的版本轨、stage 高度和 inspector 比例也分别使用不同尺寸体系；Settings prototype 只有8个分类，renderer 有9个。
- **影响**：依据 prototype 批准的排版不一定进入应用，依据 prototype 截图提出的问题也可能误判真实 renderer；当前无法形成可信视觉回归基线。
- **修复**：每个实施切片先明确选择 renderer 或 approved prototype 作为目标 thesis，再同步另一侧；preview 必须 rebuild。给 prototype 页面标记 implemented/prototype-only/planned 状态。
- **验证**：同一固定数据在 1280×800、1440×900 的主网格、顺序、sticky、动作层级和关键尺寸一致；差异必须有明确状态标签。

## 7. 视觉艺术方向：Cinematic Graphite

### 7.1 当前配色为什么显得普通

问题不只是“蓝色太亮”，而是 **色彩角色没有边界**：

- `src/styles/01-foundation.css` 的 `--primary` 从 `#7cb8ff` 开始，随后在 `02-visual-refresh.css` 改为更亮的 `#8ab4ff`；prototype 又使用 `#87b7ff / #4c8ff7`，没有单一视觉基线；
- 蓝色同时用于品牌图标、主按钮、导航 active、badge、focus ring、拖放、信息提示、代码、缩略图、scrollbar 和背景光晕；用户无法从颜色判断它是在表达“可操作”“当前”“信息”还是纯装饰；
- 当前 `src/styles/` 至少有301个不同的 hex literal；`--primary` 系列直接引用75次，并参与26次与 primary 有关的 `color-mix`。颜色系统实际由大量局部修补组成；
- 高亮蓝、紫色环境光、青绿环境光和暖橙状态同时出现，色温没有明确主轴；在暗背景上亮蓝面积较大，容易产生廉价的发光感；
- 主按钮、active surface、border 和文字都提高蓝色对比，导致“处处强调”等于没有重点。

Apple HIG 的核心启发不是使用 Apple Blue，而是让颜色保持一致语义，并用背景、前景、separator 等角色表达层级。Frontend Design 方法同样要求只在一个地方花费视觉大胆度。本产品应该让用户的图片和视频成为页面中最丰富的颜色，UI 本身退到安静、精密的工作台角色。

### 7.2 建议方向：暖石墨 + 香槟石色

推荐采用 **Cinematic Graphite / 暖石墨电影工作台**：近中性的深色 canvas 带极轻微暖度，文字是柔和骨白，唯一品牌/行动强调色是低饱和香槟石色。它不是“黑金奢华风”，也不使用金属渐变；高级感来自低饱和、少角色、大面积安静中性色和精准明度差。

这一方向适合本产品的原因：

- 媒体内容天然色彩丰富，低色度 UI 不会污染图片和视频判断；
- 暖石色比通用 SaaS 蓝更有编辑台、放映室和专业器材的气质；
- 主要动作仍有足够识别度，但不会像荧光按钮一样长期刺激；
- 成功、警告、危险仍能保留独立语义，不与品牌色冲突；
- Windows 原生 Segoe UI、Cascadia Mono 与哑光石墨表面相容，不需要引入展示字体制造个性。

### 7.3 建议色板与语义角色

以下是用于 prototype 的起始值，不是未经视觉验证即可直接全局替换的最终值：

| 角色 | 建议值 | 用途 |
| --- | --- | --- |
| Canvas / Ink | `#0D0E10` | 应用最底层、媒体外背景 |
| Base surface | `#111316` | 页面工作区、topbar |
| Object surface | `#17191C` | 独立任务、作品、模型对象 |
| Raised surface | `#1D2024` | 输入、选中中性面、popover 基底 |
| Strong surface | `#24282D` | hover、内嵌控制组，不作为普遍卡片 |
| Separator | `#2D3136` | 普通 divider / border |
| Strong separator | `#41464D` | focus 邻接、选中对象边界 |
| Primary text | `#F1EFEA` | 标题、主体内容，略暖而非纯白 |
| Secondary text | `#B8B4AC` | 说明、标签、普通 metadata |
| Tertiary text | `#858780` | 非关键短信息；在 object surface 上约4.84:1 |
| Action accent | `#C8C1B2` | 每个 surface 唯一 primary、progress active、focus；接近暖银而非金色 |
| Accent hover | `#D8D1C4` | primary hover；不使用 glow |
| On accent | `#171611` | accent 按钮文字，约10.12:1 |
| Accent surface | `rgba(200,193,178,.10)` | 轻量 selected/active 背景 |
| Information | `#8CA6B4` | 仅信息状态和链接，不作为品牌色 |
| Success | `#73B38F` | 可用、完成；约7.19:1 |
| Warning | `#D3A162` | 等待决定、部分可用；约7.59:1 |
| Danger | `#D87973` | 错误与破坏性动作；约5.79:1 |

上述对比度是相对 `#17191C` 的静态 sRGB 初筛；仍需按实际字号、alpha、状态和 Windows 高对比度完成验证。颜色不能单独表达状态。

### 7.4 色彩应用纪律

- **主导航**：active 使用中性 raised surface + 高对比文字，可辅以2px accent indicator；不把整个导航按钮染成强调色；
- **主按钮**：每个视觉 surface 最多一个实心 accent。Create“加入队列”、Queue“继续”、Details“继续创作”可以使用；普通保存、扫描、复制、定位保持中性；
- **品牌图标**：取消亮蓝渐变和蓝色 glow，改为暖石色单色面或中性图形；品牌不需要持续发光；
- **焦点**：使用清楚的 accent outline + offset，hover 只改变一档 surface/border，不使用阴影光圈替代 focus；
- **选中**：优先用中性面、边界、indicator 和文字重量；只有版本轨、当前 stage 等需要建立空间关系时使用低透明 accent surface；
- **状态**：success/warning/danger/info 只用于其语义；普通“已选择、当前页、可点击”不得借用状态色；
- **媒体区域**：viewer、缩略图和 checkerboard 使用中性灰，不叠加蓝色 vignette；媒体本身是最高彩度内容；
- **环境光**：移除蓝紫双 radial gradient。若保留，只允许几乎不可感知的暖灰/冷灰明度变化，不承担品牌表达；
- **阴影**：普通 panel 无阴影；popover、dialog、dragged object 才有 elevation。暗色层级主要依靠明度和遮挡关系，不靠蓝边与 glow。

### 7.5 排版艺术方向

高级感更依赖比例与节奏，而不是更细、更小的字。建议保留系统字体，但重新建立角色：

| 角色 | 字体建议 | 尺寸 / 行高 | 使用原则 |
| --- | --- | --- | --- |
| Page title | Segoe UI Variable Display | `24/30`, 650 | 每页一次，紧凑负字距；不与 badge 挤成一行时缩小 |
| Section title | Segoe UI Variable Text | `17/24`, 620 | 分隔真实任务阶段，不为每张小卡重复标题 |
| Object title | Segoe UI Variable Text | `14/20`, 600 | 任务、作品、模型等独立对象 |
| Body | Segoe UI Variable Text | `13/20`, 400–450 | Prompt 说明、错误、恢复路径和主要 metadata |
| Label | Segoe UI Variable Text | `12/16`, 600 | 控件名、短状态；不全大写 |
| Meta | Segoe UI Variable Text | `11/16`, 450 | 只用于非关键时间、格式和短技术信息 |
| Technical | Cascadia Mono | `11–12/18`, 400 | 路径、seed、节点名、日志；正文不滥用 monospace |

排版规则：

- 不在 `body` 全局增加字距；中文、英文和数字分别依赖字体自身 spacing；负字距只用于较大标题；
- 说明文本控制在约60–72个拉丁字符的阅读宽度；长路径例外并使用截断/展开；
- 表格、进度和时间统一 `font-variant-numeric: tabular-nums`，让实时更新不左右抖动；
- 图标与文字以 optical center 对齐，不简单依赖 flex 几何中心；16px 图标匹配36–40px 控件，状态 glyph 不因 badge 缩到难辨认；
- 用字号、字重、颜色、行宽和留白共同建立层级，不靠同时出现多个12/11/10/9px 裸字号；
- 中文正文行高可保持1.5–1.6，紧凑控件标签使用固定行高；不要为了“高级”使用 light/thin weight。

### 7.6 形状、材质与空间节奏

- 半径收敛为三个主级别：控件 `8px`、对象 `12px`、大型 modal/media container `16px`；pill 只用于真正的 badge、segmented indicator 或数量；
- 表面保持哑光。Blur 只帮助 sticky topbar 保持上下文，不把所有 panel 做成玻璃；
- 采用 8px 主节奏并允许 4px 微调：同一层优先 `8/12/16/24/32`，避免连续出现 9/10/11/13/14/15px 的近似间距；
- 大留白用于分离任务阶段，小留白用于表达字段归属；divider 连接同一组，card 分离独立对象；
- 普通按钮不需要浮起；按下可有1px 位移，hover/focus 动画控制在约120–180ms，并支持 Reduced Motion；
- 一个页面只保留一个“视觉英雄”：Create 是 Prompt + 素材关系，Queue 是 active task，History 是媒体封面，Details 是 viewer，Settings 是当前可用性与修复决定。

### 7.7 明确不采用的视觉路线

- 紫蓝 AI gradient、霓虹 cyan、发光描边和“科技感”网格背景；
- 大面积金色、黑金奢侈品风或仿金属渐变；
- 依靠 glassmorphism、过度 blur 和透明度制造层级；
- 极端纯黑纯白、过度细字、超小 metadata 的伪极简；
- 为独特性引入与 Windows 工具不协调的展示字体；
- 只替换 `--primary` 而保留全部硬编码蓝色、局部 `color-mix` 和旧 prototype 色板。

### 7.8 视觉方向验收方法

1. 先建立 token-only 的 Cinematic Graphite prototype，不同时重写页面结构；
2. 在 Create、Queue running、History gallery、Image detail、Settings 各选一个代表状态；
3. 对比 current / new 的原尺寸截图、灰度截图和轻度模糊截图：灰度下仍必须看出主任务，模糊后 accent 只能形成一个主要视觉热点；
4. 换入高饱和、低调、近白三类真实媒体，确认 UI 不向媒体投射蓝色或暖色偏差；
5. 检查 normal、hover、focus、pressed、selected、disabled、busy 和四种 semantic status；
6. 做 sRGB 对比度静态检查，再在 Windows 100%/125%/150%、高对比度和不同亮度显示器上实看；
7. prototype 批准后才迁移 renderer tokens；先移除旧硬编码颜色，再允许页面级例外，避免新旧主题叠加。

## 8. 分阶段实施计划

### Phase 0 — 建立可重复的 UX 基线

目标：先让“当前界面是什么”可稳定复现，避免原型、代码和计划继续分叉。

- 为 standalone prototypes 增加固定数据状态：default、empty、loading、error、offline；
- 增加 1440×900、1280×800、900×800、最小宽度及关键断点两侧截图脚本；
- 记录页面截图清单与焦点/键盘清单；
- 明确 phase 2A prototype-only 功能哪些已进入 renderer；
- 为 Queue、Create、Image detail、Settings 记录 prototype 与 renderer 的构图差异，先选定目标再实施；
- 制作 current / Cinematic Graphite token-only 对照，不同时改变结构，以便单独判断配色、字体和材质；
- 将本计划中当前快照发现转成可追踪 issue 或 checklist。

验收：`npm.cmd run prototype:build` 后页面可重现；截图不依赖人工拖窗；原型 README 明确每项是 implemented、prototype-only 还是 planned；视觉方向在代表性五页完成原尺寸、灰度和媒体换图对照。

### Phase 1 — P0/P1 任务流与恢复性

目标：先修正会导致误操作、找不到核心任务或无法恢复的问题。

- Create 窄窗口 Prompt 优先重排和素材摘要；
- 修正 Image Edit 761–约926px 的硬最小宽度冲突；
- 将 Queue 遥测归入 active task，不再抢在任务列表之前；
- 统一 72px topbar/sticky offset，并解除 History 窄屏 68px 固定高度；
- 持久 error + 可执行恢复动作；
- Settings 窄窗口分类与保存区重构；
- 移除 renderer 中硬编码本地化文本；
- 补齐图片历史 loading、missing、error、retry 状态；
- 同步更新受影响原型，再进入 renderer。

验收：Create、Settings 在 800/900 宽首屏满足任务目标；图片媒体损坏不再显示无解释空白；所有模拟错误都有恢复出口；三语言无混文；不改变已排队任务快照和 Settings 离线扫描语义。

### Phase 2 — 键盘、焦点和语义

目标：让鼠标路径与键盘/辅助技术路径等价。

- 全局导航 `aria-current`；
- Settings tab pattern；
- History 卡片 Enter/Space 激活；
- Lightbox focus trap、背景 inert 与 return focus；
- 共享 context menu keyboard controller；
- 局部状态 `role=status/alert`、`aria-busy` 和 announcement 规则；
- 对话框、popover、menu 的 return-focus 契约；
- command registry 与快捷键帮助入口。

验收：仅键盘完成 Create → Queue → History → Details → Continue；焦点不因遥测、扫描或媒体刷新丢失；可访问名称和可见文案一致。

### Phase 3 — 视觉艺术、层级、密度和设计令牌

目标：在不削弱专家信息的前提下减少视觉噪声。

- 合并散落字号为类型令牌；
- 将 canvas/surface/text/accent/semantic/elevation 建为角色令牌，prototype 批准后再迁移 renderer；
- 用暖石墨与香槟石色替换通用 primary blue；信息蓝、成功绿、警告橙和危险红不得承担品牌或选中语义；
- 移除品牌蓝色 gradient/glow、页面蓝紫环境光和非语义蓝边，普通 surface 回归哑光中性色；
- 收敛为 Page/Section/Object/Body/Label/Meta/Technical 七种排版角色，不继续新增裸字号和全局字距；
- 收敛 radius、separator 和 elevation；普通 panel 无阴影，只有 overlay/dragged object 使用 elevation；
- 收敛 panel、section、evidence row、status badge 的边界规则；
- 减少 10–11px 说明文本；
- 统一 hover、focus、selected、disabled、busy；
- History 工具带和 Settings 状态证据重新分层；
- Detail inspector 保留唯一主动作，下方记录从 panel mosaic 收敛为一个分组 section；
- History album 改为 viewport/container-width 驱动列数；
- 合并 `src/styles/` 中对同组件的尾部覆盖，按组件形成清楚所有权。

验收：共享 selector 不再跨 4 个以上样式层反复覆盖；组件不得出现未记录的硬编码主题色；关键说明在 125% 缩放下仍易读；卡片边界对应真实对象；四大页面主操作优先级一致；灰度和模糊截图仍只有一个主热点。

### Phase 4 — 完整状态与品质回归

目标：把“看起来完成”推进到可验证的桌面体验。

- Light/Dark 不在本轮强制新增，但要确保 token 结构不阻塞未来外观；
- 增加 Windows 高对比度、Reduced Motion、125%/150% 缩放检查；
- 覆盖 loading、empty、offline、partial success、error、disabled；
- 检查图片/视频、瀑布流/相册、详情版本轨、长路径和长本地化；
- 建立截图差异与键盘 smoke test，避免视觉修补回退焦点。

验收：按 `docs/UX_CONTRACT.md` 的 UI gate 完成手工检查；自动化与人工证据分别记录；未测试项不能写成“已通过”。

## 9. 文件与所有权建议

避免多人同时编辑热点文件。建议按以下顺序串行集成：

| 工作包 | 主要文件 | 邻接检查 |
| --- | --- | --- |
| UX 基线与原型 | `prototypes/*`, `scripts/build-prototypes.mjs` | preview rebuild、固定视口截图 |
| 通知模型 | `src/renderer/notifications.ts`, `src/main.ts`, `src/renderer/shell/page.ts` | 并发通知、错误恢复、ARIA live |
| Create 重排 | `src/renderer/pages/create/*`, `src/styles/07-create-composer.css`, responsive styles | typing、undo/redo、mode switch、queue submit |
| Queue 主体层级 | `src/renderer/pages/queue/page.ts`, Queue component/styles | active task、preview、progress、telemetry、empty state |
| History 构图 | `src/renderer/pages/history/layout-controller.ts`, History styles | 瀑布流/相册、删除、过滤、sticky toolbar、details |
| Settings 导航/保存 | `src/renderer/pages/settings/*`, `src/styles/06-settings-layout.css` | scan、install、save、offline、多安装实例 |
| 键盘与菜单 | `src/renderer/pages/history/context-menus.ts`, Settings log menu, shell controller | 打开、导航、Escape、return focus |
| 设计令牌收敛 | `src/styles/01-foundation.css` 与后续覆盖层 | Create、Queue、History、Settings、Details |

`src/main.ts`、`electron/main.ts`、`src/types.ts` 属于热点文件，每个阶段只指定一个 owner；通知 schema 或持久状态若需要变化，先按架构契约设计兼容性。

## 10. 验证矩阵

### 10.1 自动化

- `npm.cmd run prototype:build`；
- 受影响的 Vitest controller/state tests；
- `npm.cmd run typecheck`；
- 共享状态、renderer 或 IPC 变化完成后运行 `npm.cmd run verify`；
- 新增静态检查：renderer 模板硬编码中文、缺少可访问名称、导航缺少当前项语义；
- 截图脚本固定 viewport、locale、data state 和动画状态。

### 10.2 手工

每个受影响页面检查：

- 1440×900、1280×800、900×800、最小宽度；
- 鼠标、仅键盘、拖放与 click-to-select；
- 连续输入、selection、Ctrl+Z/Y/Shift+Z、模式切换、页面刷新；
- loading、empty、offline、error、partial success；
- 100%/125%/150% Windows 缩放；
- en-US、zh-CN、zh-TW 长文案；
- 系统高对比度和 Reduced Motion；
- 对话框默认焦点、Escape、Tab trap、关闭后回焦；
- 媒体加载失败不覆盖有效静态封面。

### 10.3 完成定义

一个阶段只有在以下条件同时满足时才完成：

1. 原型与 renderer 行为一致；
2. 原始问题和邻接回归均验证；
3. 自动检查通过；
4. 代表性视口和状态有渲染证据；
5. 键盘与焦点路径有实际执行证据；
6. 计划中的 `UNVERIFIED` 已转成已测结果或明确保留风险。

## 11. 不建议做的事情

- 不把界面直接改造成 macOS 仿制品；
- 不复制 Liquid Glass、SF Symbols 或 Apple 专属材质来制造“高级感”；
- 不把 iOS 的 44pt、字号或 safe area 数值当作 Electron 硬性标准；
- 不为了视觉干净隐藏错误原因、运行时证据或恢复动作；
- 不一次性重写全部 CSS；
- 不在没有运行证据时宣称 HIG 合规、可访问性通过或体验已经完成；
- 不让新 UX 工作覆盖当前 Settings、ComfyUI 安装和运行时策略的未提交改动。

## 12. 建议的首个实施切片

先做一个 **prototype-only 视觉定向切片**，批准视觉语言后再开始 renderer 结构改造：

1. 把 Cinematic Graphite 建为独立 prototype token layer，不覆盖当前 token；
2. 为 Create、Queue running、History gallery、Image detail、Settings environment 各准备一个固定状态；
3. 同时输出 current / new、原色 / 灰度、1280×800 / 900×800 对照；
4. 检查主热点、媒体色彩中立性、文字层级、border 密度、primary 唯一性和所有交互状态；
5. 记录需要保留或调整的具体 token，不以“更高级”作为唯一验收意见；
6. 视觉方向批准后，将 Create Prompt 优先、Image Edit 溢出、sticky offset 和持久 error 作为第一个 renderer 垂直切片；
7. 完成 Create typing/focus/undo/queue tests、notification tests 和关键断点截图，再进入 Queue/Settings 重构。

这种顺序可以把“颜色不对”和“结构不对”分开评审，避免在页面重排期间反复推翻配色，也避免一次性给当前脏工作树增加大范围 CSS 风险。

## 13. 版本影响

本文件本身属于文档/规划变更，按仓库规则归类为 patch 级影响，不单独要求版本升级。后续 Phase 1 若只修正现有行为仍可作为 patch；若引入通知中心、命令面板或新的跨页面能力，应按 minor 版本评估。
