# History 批量管理与标签编辑

- Status: implementation
- Updated / Owner: 2026-09-20 / 当前 agent
- Scope / Authority: 用户提出的 History 批量模式、批量文件复制、批量标签编辑与批量删除需求；以当前 renderer、`docs/UX_CONTRACT.md`、`docs/ARCHITECTURE_CONTRACT.md` 和 `docs/CHANGE_VERIFICATION.md` 为约束
- Baseline: `main` @ `ca817d0`；当前工作区包含本任务实现与计划文档，未提交
- Execution: direct
- Tree ledger: cap=0 created=0 depth=0 concurrency=0
- User override: none

> `TASK.md` 是本功能的唯一计划和 Resume 入口。功能代码已实现并通过自动化校验，仍缺少当前桌面环境下的 Electron 手动验收。

## Resume

- 已确认 / 决定：
  - 批量模式是 History 页的临时 UI 状态，不写入 `AppState`、历史记录或设置；退出时清空选择并恢复普通浏览。
  - 入口放在现有筛选菜单中，开启后卡片出现 checkbox；视频 hover 预览继续工作，卡片主体点击改为选择/取消选择，不再打开详情。
  - 浮动工具条保持极简，推荐固定在底部居中，显示全选/全不选、当前选择数、复制文件、添加标签、删除和退出；不增加常驻大面板。
  - 全选范围严格是当前 tab + 当前 filter 后的可见结果；筛选或 tab 改变时清空选择，布局切换不改变选择。
  - 复制视频时选择最高分辨率的可用版本；分辨率相同按较新版本优先。复制图片时选择最大版本号的最后一版。多个文件必须通过一次 Windows 多文件剪贴板操作完成，不能循环覆盖单文件剪贴板。
  - 批量标签使用详情页现有标签编辑器的同一套交互和样式，不另造逗号分隔或第二套 tag controller：一个输入值按 Enter 添加一个标签；逗号不触发提交。
  - 批量标签面板直接显示所有选中项目的共同标签，并保留现有标签胶囊的编辑与 `×` 删除交互。标签比较大小写不敏感，添加时对已有标签做合并，不产生重复。
  - 按最新验收反馈，批量标签面板不再显示“部分项目已有”区域，避免编辑面板过于拥挤。
  - 批量删除使用应用内确认弹窗，并由主进程提供批量预检查/删除服务，成功后一次性刷新历史状态，避免在 renderer 中循环单项删除。
  - 删除、批量标签更新和多文件复制都必须保留现有路径校验、共享文件保护、错误提示和历史 ID 兼容性。
- 已完成 / 下一步：
  - 已完成批量模式、选择集合、极简固定工具条、批量复制、共享标签编辑面板和批量删除确认流程。
  - 已完成 typed preload/IPC、主进程批量 metadata 更新、Windows 多文件剪贴板 staging、最高版本选择和批量删除文件引用保护。
  - 标签操作提交后保留当前批量选择，便于连续添加/删除多个标签；关闭批量模式或筛选/tab 改变时清空选择。
  - 标签面板在批量模式进入时以隐藏 DOM 预先挂载；点击“编辑标签”只局部展开并自动聚焦输入框，不触发整页重绘。
  - 已补齐 `check-square`、`minus`、`tag` 的 Lucide registry，确保全选状态和编辑标签按钮图标可见。
  - 自动化校验已完成；下一步仅需在可控的 Electron 窗口中做真实鼠标/键盘/系统剪贴板验收。
- 阻塞 / 解锁条件 / 不要重复：
  - 自动化校验无阻塞；手动验收受当前 `computer-use` 运行时未暴露原生 Electron app 控制接口影响。
  - 不要把选择集合持久化，不要让 batch click 改写详情导航协议，不要破坏 hover media controller、滚动恢复和时间轴固定布局。
  - 不要用多次单文件复制模拟多文件剪贴板，也不要用多个单项删除请求代替批量删除事务。

## 1. 目标行为

### 1.1 进入与退出

1. 在 History 筛选菜单中增加“批量模式”小开关。
2. 开启后，当前 tab 的 History 卡片显示轻量 checkbox 和选中态。
3. hover 视频仍然可以播放/暂停预览；媒体加载、收藏、评分和更多菜单等内部控件继续保持各自行为。
4. 卡片主体、checkbox、键盘 Enter/Space 在批量模式下执行选择，不进入详情。
5. 关闭批量模式后移除选中态和 checkbox，恢复原有卡片点击进入详情的行为。

### 1.2 选择范围

- 选择使用稳定的 History asset/project ID，不使用卡片索引。
- “全选”取当前 `historyKind` 和 `HistoryFilterState` 过滤、排序后的可见项目；收藏、评分、标签等筛选会自然限制操作范围。
- 当前选择数只统计仍存在且属于当前结果集的项目。
- 筛选条件、视频/图片 tab 或数据刷新导致结果集变化时清空/修剪选择，避免隐藏项目被误操作；网格/瀑布流布局切换保留选择。
- 空结果、无选择时，复制、添加标签、删除按钮禁用。

### 1.3 极简工具条

推荐底部固定的紧凑工具条，避开 History 标题、筛选区和右侧时间轴：

```text
全选 / 全不选   已选 6 / 42   复制文件   添加标签   删除   退出
```

- 工具条只在批量模式出现；选择变化只局部更新工具条和卡片，不触发整页 render。
- 使用现有按钮、颜色、focus 和 modal token；不增加大型常驻信息面板。
- 工具条需要在窄窗口、时间轴存在、回到顶部按钮存在时保持不遮挡主要操作；必要时使用 safe-area 和现有响应式断点。

## 2. 批量标签编辑方案

### 2.1 共享编辑器

从详情页当前 `tags-controller.ts` 和对应 markup 中抽出可复用的 History 标签编辑器模型/渲染逻辑。编辑器只替换“目标提供者”：

- 详情页目标：单个 asset/project。
- 批量面板目标：当前选中的多个 asset/project。

共享行为必须保留：

- 标签胶囊、输入框、已有标签建议、点击标签文本编辑、`×` 删除。
- 输入一条标签后按 Enter 提交一条；不监听逗号提交，也不自动拆分逗号字符串。
- Escape 关闭当前输入/面板；异步更新期间保留焦点和媒体状态。
- 使用现有 `historyTagKey` / `normalizeHistoryTags` 规则判断大小写不敏感重复。

### 2.2 批量面板内容

点击工具条“添加标签”后打开一个轻量浮层面板，面板与工具条关联，不离开当前 History 页面：

```text
编辑 6 个项目的标签

共同标签
[精选 ×] [待发布 ×]

添加标签
[ 输入标签…… ]

取消                         完成
```

- 共同标签使用正常对比度并直接显示；没有共同标签时显示空状态，不制造占位噪声。
- 点击共同标签的 `×` 使用现有删除交互，从所有选中项目中移除。
- 点击标签文本进入现有的编辑态；批量重命名只替换实际拥有旧标签的选中项目，若新名称已存在则按 tag key 合并，不能形成重复。
- “完成”只关闭面板；已提交的每一条标签操作立即按批量事务生效。批量操作成功后保留批量模式和当前选择，立即更新共同/部分标签与计数，便于连续操作。

### 2.3 标签批量写入边界

- 新增 renderer/core 纯 helper：共同标签、全部已有标签、标签计数、大小写不敏感的 add/remove/rename 合并。
- 新增一次性批量 metadata API，主进程校验并一次性更新多个记录；不在 renderer 中循环调用单项 `updateHistoryMetadata`。
- 保留视频和图片两套历史记录的现有字段、ID、tags 存储格式和排序/筛选语义。

## 3. 复制与删除

### 3.1 多文件复制

- 增加 `file:copy-many` 或等价的 preload/API 边界，参数只接受已解析并校验的 History 文件路径/标识，不允许 renderer 直接访问 filesystem。
- 主进程解析所有选中项的目标文件，并使用 Windows `CF_HDROP`/等价多文件剪贴板流程一次性设置剪贴板。
- 视频候选按最短边/分辨率选择最高版本；同分辨率按创建时间和稳定 ID 确定性排序。
- 图片按版本号选择最后一版；候选文件缺失时跳过并记录失败项。
- 没有任何可复制文件时显示错误；部分成功时显示成功数和失败数，不静默吞掉错误。
- 复制完成后不改变 History 状态，也不清空选择，便于用户继续执行其他操作。

### 3.2 批量删除

- 使用现有应用内确认弹窗体系，默认焦点放在取消按钮；标题和说明明确选中数量、不可撤销和关联文件影响。
- 主进程先统一预检查所有目标、共享引用和辅助文件关系；预检查失败时不开始物理删除。
- 成功后一次性移除记录、清理文件/缓存并返回新的 AppState；部分物理文件失败时沿用当前 invalidation/error 处理，不伪报完全成功。
- 删除完成后清空选择并保留批量模式，继续操作其他筛选结果；若当前结果为空，显示现有空状态。

## 4. 实施顺序

### P0：纯逻辑、状态和共享标签编辑器

1. 确认 `RendererUiState` 中的 batch mode、selected IDs、面板状态和 busy 状态均为瞬时字段。
2. 新增/扩展 `src/core/` 纯 helper，覆盖当前可见 ID、全选/反选/修剪、共同标签、标签计数、add/remove/rename 合并。
3. 从详情页标签 controller 提取共享编辑器能力，并保持现有详情页行为不变。
4. 添加 focused tests：筛选范围、大小写重复、共同/部分标签、批量添加、批量删除、批量重命名和空输入。

### P1：History 批量模式 UI

1. 在 `page.ts`/filter markup 中增加批量模式开关、卡片 checkbox、批量工具条和标签浮层面板。
2. 增加独立 batch controller，使用 capture/delegation 在导航之前处理卡片选择；保留媒体 hover controller 和内部控件事件。
3. 选择变化采用局部 DOM patch 或等价轻量更新，验证滚动、视频播放、焦点和时间轴位置不因选择而重置。
4. 添加极简响应式样式，工具条不遮挡卡片和时间轴；复用现有 modal/panel 和 tag chip 样式。

### P2：批量标签、复制和删除 IPC/service

1. 扩展 `src/types.ts`、preload 和 `studio-client.ts` 的批量能力，保持 typed preload boundary。
2. 在 `history-metadata-service.ts` 增加批量标签事务；复用当前规范化和错误处理。
3. 在 `windows-clipboard.ts` 和 `media-ipc.ts` 增加多文件剪贴板路径，覆盖缺失文件和部分成功结果。
4. 在 `history-destructive-service.ts` 增加批量预检查/删除；扩展 confirmation 类型和删除结果提示。

### P3：集成验证和视觉验收

1. 运行 History focused tests、typecheck 和相关 IPC/service tests。
2. 运行一次完整 `npm.cmd run verify`，确认 TS/JS 双源、构建和对比度检查。
3. 手测视频和图片 tab、收藏/评分/标签筛选、newest/oldest、masonry/album、时间轴存在和隐藏、空结果、窄窗口、键盘操作、hover 预览、详情返回和删除确认。
4. 检查至少 `1280 x 800`、`1440 x 900` 和响应式临界宽度；确认 checkbox、工具条、标签面板不会造成卡片内容遮挡或时间轴错位。

## 5. 预期修改范围

| 区域 | 预期文件 | 作用 |
| --- | --- | --- |
| 纯逻辑/状态 | `src/core/history-batch.ts`（或等价模块）、`src/renderer/ui-state.ts` | 选择集合、筛选范围、标签合并与临时状态 |
| History UI | `src/renderer/pages/history/page.ts`、`filter-controller.ts`、`navigation-controller.ts`、新增 batch controller/标签面板模块 | 开关、checkbox、工具条、面板和点击拦截 |
| 标签共享 | `src/renderer/pages/history/tags-controller.ts` 及详情/批量共用 markup helper | 保持详情页和批量编辑一致 |
| 样式 | `src/styles/11-history-curation.css` 及当前 History 样式入口 | 工具条、批量态、面板、checkbox、responsive/focus |
| 类型/API | `src/types.ts`、`src/renderer/studio-client.ts`、`electron/preload.cts`、相关 IPC 注册 | 批量 metadata、多文件复制、批量删除边界 |
| 主进程服务 | `electron/services/history-metadata-service.ts`、`history-destructive-service.ts`、`windows-clipboard.ts`、相关 IPC | 一次性更新、文件选择、复制和删除事务 |
| 测试 | `tests/` 下 History batch/tag/clipboard/destructive focused tests | 纯逻辑、DOM 交互、IPC/service 与回归 |

实际修改前需重新读取当前文件和所有邻近检查；若发现 `.ts/.js` 镜像同步规则或其他任务已占用同一文件，先收敛文件归属，不覆盖并行修改。

## 6. 验收标准

### 功能

- 筛选菜单中的批量开关可以进入/退出批量模式；退出后卡片点击恢复详情导航。
- 批量模式下 hover 视频仍可播放，卡片选择不会触发详情打开；checkbox、鼠标和键盘选择状态一致。
- 全选只作用于当前筛选结果；选择计数、全选/全不选状态和筛选变化后的清理正确。
- 复制视频使用最高分辨率版本，复制图片使用最后版本；多文件在系统剪贴板中可一次粘贴，缺失文件有明确结果提示。
- 标签面板复用详情页标签交互：共同标签直接显示、Enter 一次添加一条、`×` 可批量删除、已有标签不会重复；批量重命名不会产生大小写重复。
- 删除需要应用内确认，并能一次性处理多个项目；取消不会改变数据，成功后历史列表和选择状态正确刷新。

### 兼容性与产品约束

- 不改变历史记录 ID、持久化 schema、单项详情页标签行为、筛选语义或已有文件引用保护。
- 不破坏时间轴的固定高度/位置、详情返回滚动锚点、masonry/album 切换、媒体加载和现有 History context menu。
- 批量状态不跨刷新持久化，不向 AppState 增加业务数据；只有需要的 IPC/API 扩展可以进入 typed boundary。
- 工具条和标签面板保持低装饰、低占用；窄窗口下不覆盖主要卡片内容。

### 验证

- focused Vitest 覆盖选择、标签、版本选择、批量 metadata 和 destructive service 的边界。
- `npm.cmd run typecheck` 通过。
- 因涉及共享 renderer/CSS、History 状态和 IPC，`npm.cmd run verify` 通过。
- 完成当前 renderer/Electron 手测，记录实际窗口尺寸、视频/图片 tab、筛选、hover、快捷键、复制、标签和删除结果；未实际验证的系统剪贴板或窗口行为不能标记为通过。

## 7. 非目标与风险

- 第一版不做跨 tab 同时选择、不做跨筛选条件保留隐藏选择、不做批量移动/导出目录、不做标签层级或颜色系统。
- 批量删除需要复用并扩展现有共享文件保护；任何预检查不确定时应中止操作，而不是冒险删除。
- 大量选中项目的标签更新和文件复制必须保持一次性/批量路径，避免逐条 render、剪贴板被覆盖或 UI 长时间失去响应。
- 当前 History 时间轴已经占用独立布局职责；批量工具条只能通过现有 stage/viewport 边界协调，不得重新引入滚动容器或改变时间轴固定定位。

## Evidence / handoff

- 关键结论及来源：用户当前批量模式与批量标签需求；现有 History 筛选、详情标签编辑、导航、文件复制、删除服务；`docs/UX_CONTRACT.md`、`docs/ARCHITECTURE_CONTRACT.md`、`docs/CHANGE_VERIFICATION.md`。
- 实际命令、结果：`npm.cmd run typecheck` 通过；聚焦测试通过（批量/筛选/History service 共 46 个，兼容回归 24 个）；`npm.cmd run verify` 通过（unit 182 个、integration 81 个、生产构建、UI 对比度检查）。
- 当前验证：自动化验证完成；测试期间仅输出既有 jsdom `window.scrollTo` not implemented 提示，没有失败测试。
- 手动验收：已尝试启动隔离 Electron 实例并检查桌面控制面，但当前 `computer-use` runtime 只暴露浏览器接口，没有原生 app 控制入口；启动的测试进程已清理，不能把系统剪贴板和真实窗口交互标记为已验证。
- 下一次接续：在可控 Electron 窗口可用后，按 P3 验收视频/图片 tab、筛选、hover、键盘、复制、标签和删除；完成后将 Status 更新为 done。
- 版本影响 / Unreleased：计划本身不改变版本；功能完成后再按仓库 release owner 规则记录 `CHANGELOG.md`。
