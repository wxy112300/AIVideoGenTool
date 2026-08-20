# UX / UI Luna 原子任务执行指南

> 状态：与 `docs/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md` 配套使用  
> 目的：把 P00–P20 集成 Phase 拆成较弱模型也能可靠执行的单一 work package  
> 原则：Luna 负责确定性实现；强模型/人工负责审美、架构、冲突、运行结论和最终集成

> Source of truth：当前 `src/renderer/`、`src/styles/`、`docs/UX_UI_RENDERER_BASELINE.md` 与真实 renderer capture。`prototypes/` 是早期历史材料，不是任务输入、批准证据或同步目标，除非用户单独要求维护。

## 1. 复查结论

P00–P20 的依赖、preserve list 和集成 gate 已经清楚，但部分 Phase 对较弱模型仍然过宽。不能直接把“完成 P03”“现代化 Queue”或“优化 Settings UI”交给 Luna，因为这些提示仍要求模型自行决定：

- 哪些颜色属于品牌、交互、状态或装饰；
- 哪一套当前 renderer fixture/CSS 是目标；
- 是否允许改变 DOM、schema、IPC 或 persisted state；
- 哪个 selector 是 canonical owner；
- 视觉差异是预期变化还是回归；
- 测试失败是基线问题、实现问题还是环境问题。

因此：

- **Phase 是集成和验收单位，不是 Luna 的直接任务单位**；
- **Work Package 是 Luna 的唯一执行单位**；
- 一个 Luna turn 只完成一个 `Lxx` package；
- `Gxx` 是强模型/人工 gate，不交给 Luna 做最终判断；
- Luna 不得完成一个 package 后自动开始下一个。

### 1.1 当前执行账本

派发前必须以 `docs/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md` 顶部状态和各 Phase 的“当前状态”为准，不能仅凭本指南编号判断任务未做：

- P00 current renderer baseline 已 `verified`，已有 `UX_UI_RENDERER_BASELINE.md`、manifest、capture harness 和136张截图；L00/L01只在 reviewer 明确要求重新基线时派发；
- G01“当前 renderer 是设计来源”已完成；G02 已先冻结 surface mapping，具体 action/focus/progress/status、type 和 radius 变化仍需 current-renderer visual gate；
- P02 语义 token 骨架已实现；在 reviewer 对现有 diff 完成 package mapping 前，不得重新派发 L06–L09；
- P03/L10 shared surface、P03/L11 text/separator、P03/L12 action/focus、P03/L13 status/badge、P03/L14 brand/nav 与 P03/L15 panel/elevation 迁移已实现，并通过 G04 current-renderer 五页视觉/状态复核：current-renderer capture、全矩阵 diagnose、900×800 输入焦点 smoke、四状态 selector matrix、disabled submit canary、L14 shell 与 L15 panel canary、20 组对比度检查和 `npm.cmd run verify`；L14 移除顶栏、品牌标记和活动导航的装饰性 glow，保留活动导航的边界与下划线反馈；L15 移除普通 panel 的装饰性阴影并保留 overlay elevation，版本为 `0.30.2`；P03 已 `verified/integrated`，不得重复派发 L10–L15，下一 Phase 为 P04；
- P04/L16–L21 已完成：L16 声明 Page/Section/Object/Body/Label/Meta/Technical 七级 type roles；L17 按当前 renderer 最终 cascade 校正 page 基线并迁移共享 `h1/h2/h3` 与 History gallery object heading；L18 迁移根 body、form label、shared meta copy 与 global code technical selectors，并为 current-renderer capture harness 增加 100%/125%/150% page zoom 证据；L19 为 Queue/History/运行态的 progress/time/metric/count/position 动态数值补齐 `font-variant-numeric: tabular-nums`；L20 将当前 renderer 的 control/object/panel/modal 圆角值接入 `--ux-radius-*` roles，面板保留有效的 13px；L21 将 performance-grid 的 12px gap 与 16px bottom spacing 接入 `--ux-space-3/4`，保持 DOM、布局与 responsive 规则不变；保留详情/弹窗/任务卡/log/badge/album 紧凑特例。focused token tests `13/13`、`npm.cmd run verify`（80 files / 615 tests、production build、20 组对比度检查）通过；现有 Queue/History/Settings current-renderer canary 作为等值迁移的视觉基线，L20/L21 阶段版本仍为 `0.30.2`；随后 P05/L22–L24 形成可见的 sticky 几何差异，当前版本升为 `0.31.0`，下一集成为 G05；
- P05/L22–L24 与 G05 已完成：L22 将 72px topbar 接入 `--ux-topbar-height`，将 page sticky offset 对齐为 72px，并在 760px 以下 topbar normal-flow 断点将 offset 归零；L23 将 Create/Queue heading 接入共享 sticky offset，Create 的层级降到 topbar 之下，Queue 在窄屏显式归零；L24 将 History heading、History detail 返回条和 Settings heading 接入同一 token，并保留窄屏 top:0 规则。P05 相关 focused token tests `16/16`、`npm.cmd run verify`（80 files / 618 tests、production build、20 组对比度检查）通过；同一 Vite renderer 与隔离 preload 的 runtime probe 已覆盖 1440×900、900×800、760×800、761×800 的主页面/Details sticky 几何、无横溢出和 History detail close-dialog；标准 capture harness 的 route 后单次 `executeJavaScript` DOM wait 竞态单独记录，不作为产品失败。P05/G05 标为 `verified/integrated`，下一 Phase 为 P06；
- P06/L26–L28 已完成通知反馈首个 package：error 持久、消息可关闭、同源去重、error 优先级保护和瞬时 action callback，Prompt 优化失败已接入“打开设置”，focused tests `12/12` 通过；P06/G07 仍待 L29、并发恢复和 runtime smoke，同时已开始 P07 当前 renderer proposal；
- P07 proposal 已写入 `docs/UX_UI_P07_RENDERER_PROPOSAL.md`：基于当前三种 Create fixture 选择 901–1120/900 紧凑双列、1280+ 保留双主区、760 以下单列 fallback 与 submit safe-area 检查；G08 仍待人工/强模型批准，P08 不得越过该 gate 直接修改生产 renderer；
- P05 的 top-level nav `aria-current` 已实现，不能重复执行相同修改；
- P08 的 Image Edit 首个 overflow 修复已实现，不能直接重跑 L30；其余 Create gate仍待完成；
- Settings/runtime 工作仍在变化，G14 未满足前不得派发 L50–L60。

本指南是任务目录，不是“全部尚未执行”的 todo list。任何已实现 package 的后续工作必须使用新的 base和明确的 delta task。

## 2. Luna 能做与不能做

### 2.1 适合交给 Luna

- 按已批准 token 表进行机械替换；
- 增加明确列出的 CSS variable、alias 和静态检查；
- 在指定 breakpoint 修改指定 selector；
- 按现有 controller pattern 补 Enter/Space、Arrow、Escape、return focus；
- 按明确 locale key 清单迁移硬编码文案；
- 增加指定 focused tests；
- 运行给定命令并如实记录结果；
- 更新一个当前 renderer fixture/evidence、一个指定页面 fragment 或一个页面拥有的 CSS；
- 生成 inventory、selector map、截图 manifest 和 handoff。

### 2.2 不交给 Luna 独立决定

- 选择最终配色、字体、视觉方向或判断“是否高级”；
- 在 approved current-renderer artifact 与当前代码冲突时自行选择 source of truth；
- 设计新的 persisted schema、IPC、notification public model 或 migration；
- 解决 shared hotspot 的并发冲突；
- 修改 workflow、model、node、runtime、GPU 或 ComfyUI 策略；
- 判断可访问性、视觉或真实 Electron 运行已经“通过”；
- 处理破坏性数据操作、文件迁移或删除；
- 为了修测试随意更新 snapshot、放宽断言或改测试数据；
- 自行创建下一 phase、扩大写入范围或重构相邻模块。

## 3. Luna 强制停止条件

出现任一情况，停止编辑，输出 blocker，不猜测：

1. `git status --short` 中目标文件存在未说明改动；
2. 目标文件内容与 package 的 base/handoff 不一致；
3. 需要修改 package 未授权的文件才能继续；
4. 需要改变 DOM id、`data-*`、IPC、persisted type、workflow payload 或 locale public key；
5. approved token、当前 renderer fixture 或截图 evidence 不存在或互相冲突；
6. focused test 在编辑前已经失败；
7. 实现后出现输入失焦、selection 丢失、横向滚动、功能路径变化或测试失败；
8. 需要“凭感觉”选择颜色、间距、动作优先级或隐藏内容；
9. 需要进入 `src/main.ts`、`src/types.ts`、`electron/` 或 shared CSS hotspot，但任务没有明确 owner 授权；
10. 发现用户在任务期间修改了目标文件。

Blocker handoff 必须列出：已检查证据、冲突文件、不能安全假设的决定、建议由哪个 `Gxx` gate 处理。

## 4. 每个 Luna Package 的输入必须完整

任务派发者必须提供：

```text
Package ID:
Parent Phase:
Base commit:
Approved artifact / decision gate:
Writable files:
Read-only context files:
Forbidden files:
Exact requested change:
Preserve list:
Focused test command:
Required verification:
Expected handoff format:
```

缺少 `Base commit`、`Writable files`、`Exact requested change` 或 `Approved artifact` 时，不得执行视觉 package。

## 5. 原子 Work Package 清单

### Batch A — 当前 renderer 基线与视觉批准

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L00 | P00 | 当前 renderer 页面/状态/locale/viewport manifest | `docs/UX_UI_RENDERER_BASELINE.md` 或对应 manifest | 路径存在、条目齐全 | 普通复核 |
| L01 | P00 | 当前 renderer 固定 viewport capture 脚本，不改产品 | 专用 renderer capture `scripts/` 文件 | `--dry-run`；不安装依赖 | 强复核 |
| L02 | P00 | 当前 CSS 指标 inventory | 新增一个 `docs/` 报告或 fixture | 数字可由命令重算 | 普通复核 |
| G01 | P01 | 确认当前 renderer 是设计来源并冻结 preserve list | 用户/强模型 | `UX_UI_RENDERER_BASELINE.md` 与 proposal；当前已完成 | **不可交 Luna** |
| L03 | P01 | 根据当前 renderer 基线整理 canary preserve/change proposal，不写生产 CSS | `docs/UX_UI_P01_RENDERER_PROPOSAL.md`、renderer capture evidence | 每项引用当前截图/selector | 强复核 |
| L04 | P01 | 对当前 Create/Queue/History/Details/Settings 做状态与断点审计，不改结构 | `docs/`、隔离 current-renderer fixture/截图 | 关键视口与状态齐全 | 强复核 |
| L05 | P01 | 生成当前 renderer 基线与隔离候选分支的原色/灰度/媒体状态对照 | renderer evidence/manifest | 数量和命名匹配 | 普通复核 |
| G02 | P01 | 基于当前 renderer 批准 palette、type scale、radius、surface 变更 | 人工/强模型决定 | 形成冻结 current-renderer token mapping；旧 prototype 不参与 | **不可交 Luna** |

### Batch B1 — 零差异 token 骨架

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L06 | P02 | 新增冻结的 semantic token declarations，值先等于旧主题 | canonical token file + import | typecheck/build | 强复核 |
| L07 | P02 | 将旧变量改为 semantic token aliases，不改 selector | canonical token file | baseline screenshot parity | 强复核 |
| L08 | P02 | 增加“禁止新增裸主题色”的静态测试/白名单 | 一个 test + fixture/config | focused test | 普通复核 |
| L09 | P02 | 生成迁移 inventory：旧 token/hex → 新角色，不修改 CSS | `docs/` inventory | 每项有文件/行/目标角色 | 强复核 |
| G03 | P02 | 确认零视觉差异、批准进入迁移 | 集成 agent | `npm.cmd run verify` + canary smoke | **不可交 Luna** |

### Batch B2 — 配色与材质迁移

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L10 | P03 | 只迁移 canvas/base/object/raised surfaces | token +批准的 shared surface selectors | canary screenshots | 强复核 |
| L11 | P03 | 只迁移 primary/secondary/tertiary text 与 separators | token + text/separator selectors | contrast script + screenshots | 强复核 |
| L12 | P03 | 只迁移 primary action、hover、pressed、focus | shared controls selectors | focus/disabled screenshots | 强复核 |
| L13 | P03 | 只迁移 success/warning/danger/info | status/badge selectors | 四状态矩阵 | 强复核 |
| L14 | P03 | 只迁移 brand/nav decorative colors，移除 glow | brand/nav visual selectors | shell screenshots | 强复核 |
| L15 | P03 | 只移除普通 panel 阴影；保留 overlay elevation | panel/overlay selectors | dialog/popover/panel 对照 | 强复核 |
| G04 | P03 | 五页视觉与状态批准 | 人工/强模型 | full verify +视觉证据 | **不可交 Luna** |

### Batch B3 — 排版、空间与 Shell

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L16 | P04 | 新增七级 type tokens，不迁移组件 | token file | build + token test | 普通复核 |
| L17 | P04 | 迁移 page/section/object headings | heading selectors | 3 locale截图 | 强复核 |
| L18 | P04 | 迁移 body/label/meta/technical | text/form/meta selectors | 100/125/150%截图 | 强复核 |
| L19 | P04 | 迁移 tabular numbers，不动布局 | progress/time/metric selectors | Queue/History动态值截图 | 普通复核 |
| L20 | P04 | 迁移 radius tokens | controls/object/modal selectors | canary截图 | 普通复核 |
| L21 | P04 | 迁移一组批准的 spacing selectors | 任务指定的一个组件族 | screenshot parity/approved diff | 强复核 |
| L22 | P05 | 建立 `--topbar-height` 与 sticky offset token | shell/shared geometry | breakpoint截图 | 强复核 |
| L23 | P05 | Create/Queue heading 改用 sticky token | 两页拥有的 heading selectors | 上下滚动 smoke | 普通复核 |
| L24 | P05 | History/Settings heading 改用 sticky token | 两页拥有的 heading selectors | 上下滚动 smoke | 普通复核 |
| L25 | P05 | Shell nav 增加 `aria-current` 和批准的中性 active style | `shell/page.ts` + nav style | focused renderer test | 强复核 |
| G05 | P04–P05 | 批准 shared visual foundation | 集成 agent | `npm.cmd run verify` +全页面 shell smoke | **不可交 Luna** |

### Batch C — 通知与恢复

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G06 | P06 | 冻结 notification model/actions/duration/route 设计 | 强模型/架构 owner | 兼容性说明 | **不可交 Luna** |
| L26 | P06 | 实现 error 持久、success/info 时长与 dismiss | `notifications.ts` + test | `tests/notifications.test.ts` | 强复核 |
| L27 | P06 | 渲染批准的 actions 与 close，不接业务回调 | shell notification view/style | keyboard DOM test | 强复核 |
| L28 | P06 | 接入一个指定 action callback，例如 View logs | 任务明确列出的单一路径 | focused test + smoke | 强复核 |
| L29 | P06 | 修正明确列出的 info→error 调用点 | 任务列出的 controller 文件 | focused test | 普通复核 |
| G07 | P06 | 并发、去重、恢复和播报批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch D — Create

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G08 | P07 | 基于当前 Create renderer 批准三模式 900px 构图与 DOM 顺序 | 人工/强模型 | current renderer fixture/capture | **不可交 Luna** |
| L30 | P08 | 只修 Image Edit 761–约926px overflow | `10-final-refinements.css` 中批准 selector或迁移后的 Create owner | 760/761/800/900/926/960截图 | 普通复核 |
| L31 | P08 | 只实现普通 Create 的批准 breakpoint/grid | Create page-owned CSS | 三模式截图 | 强复核 |
| L32 | P08 | 按批准 markup 增加素材摘要，不改变 payload | 指定 Create fragment/controller | focused controller test | 强复核 |
| L33 | P08 | 只修 sticky submit safe area/遮挡 | submit row selectors | error/disabled/long content截图 | 普通复核 |
| G09 | P08 | Create 输入、撤销、切换和提交批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch E — Queue

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G10 | P09 | 基于当前 Queue renderer 批准 running/empty/failed 构图 | 人工/强模型 | current renderer fixture/capture；live running 单列证据边界 | **不可交 Luna** |
| L34 | P10 | 将 telemetry markup 移入 active task，不改指标来源 | `queue/page.ts`、`card.ts` 中明确函数 | queue focused tests | 强复核 |
| L35 | P10 | 样式化 active telemetry/progressive disclosure | Queue-owned CSS | running/paused/failed截图 | 强复核 |
| L36 | P10 | 只修900px pending action wrap/overflow | Queue-owned responsive selectors | 800/900截图 | 普通复核 |
| L37 | P10 | 为 telemetry patch 增加“不重建/不失焦”测试 | Queue test file | focused test | 普通复核 |
| G11 | P10 | Queue 状态机和运行路径批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch F — History 与 Details

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L38 | P11 | 解除 History <=760固定68px并按批准分组 | History heading selectors | 901→560截图 | 普通复核 |
| L39 | P11 | album 列数改为 container width，不按 cards.length | `layout-controller.ts` + focused test | 8→1项测试 | 强复核 |
| L40 | P12 | 卡片补 Enter/Space且隔离子控件 | navigation controller + test | keyboard test | 普通复核 |
| L41 | P12 | History type tabs补 roving focus/Arrow/Home/End | tabs/navigation controller + test | keyboard test | 强复核 |
| L42 | P12 | 一个 context menu补键盘入口与return focus | context menu controller + test | keyboard test | 普通复核 |
| L43 | P13 | 定义 image media state view model/helper，不接页面 | media helper + test | focused test | 强复核 |
| L44 | P13 | 接入 gallery/detail 图片状态 | page/fragments + media controller | media failure tests | 强复核 |
| L45 | P13 | 接入 version rail/lightbox 图片状态 | rail/lightbox fragments/controller | media failure tests | 强复核 |
| L46 | P14 | Lightbox复用 focus helper：trap/inert/Escape/return | lightbox controller + test | keyboard test | 强复核 |
| G12 | P15 | 基于当前 renderer 批准视频/图片详情动作与记录构图 | 人工/强模型 | current renderer fixture/capture | **不可交 Luna** |
| L47 | P15 | 只实现视频详情主动作/More层级 | history detail renderer + style | action smoke | 强复核 |
| L48 | P15 | 只实现图片详情主动作/More层级 | image detail renderer + style | action smoke | 强复核 |
| L49 | P15 | 下方生成记录由等权 cards改分组，不删字段 | detail fragments/styles | snapshot/截图 | 强复核 |
| G13 | P11–P15 | History/Details 全路径批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch G — Settings

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G14 | P16 | 确认 Settings/runtime 当前工作已形成 clean base | 用户/集成 owner | commit + handoff | **不可交 Luna** |
| L50 | P16 | 记录当前 Settings renderer 的9分类与已实现能力 | Settings renderer baseline/proposal docs | current renderer capture/manifest | 强复核 |
| L51 | P16 | 为当前 Settings renderer 捕获 offline/scanning/installing/partial/error 五种状态 | renderer fixture/capture manifest | capture matrix | 普通复核 |
| G15 | P16 | 基于当前 Settings renderer 批准窄窗导航与保存结构 | 人工/强模型 | 800/900/1280 current renderer截图 | **不可交 Luna** |
| L52 | P17 | 实现 tab roles/aria-selected/controls，不改视觉 | Settings page/fields controller + test | keyboard test | 强复核 |
| L53 | P17 | 实现 <=900批准的 compact category layout | `06-settings-layout.css` | 800/900截图 | 强复核 |
| L54 | P17 | 将 scan移入 environment action group | 指定 Settings fragment/page | save/scan tests | 强复核 |
| L55 | P17 | 页面 save bar保持 dirty/discard/save | Settings page/style | save coordinator tests | 强复核 |
| L56 | P18 | 把四状态卡改为批准的 evidence strip，不改状态源 | Settings fragment/style | settings-status test | 强复核 |
| L57 | P18 | 一种 card family去嵌套边框；一次只处理一种 | 任务指定 fragment/style | screenshot | 普通复核 |
| L58 | P18 | 生成硬编码中文 inventory与禁止新增测试 | test + `docs/` inventory | focused test | 普通复核 |
| L59 | P18 | 一次迁移一个 locale key group | 指定 fragment + 3 locale files | i18n test | 普通复核 |
| L60 | P18 | 给一个指定异步区域补status/busy/error kind | 指定 controller/fragment + test | focused test | 强复核 |
| G16 | P17–P18 | Settings offline/install/save/service/i18n批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch H — CSS 收敛与最终 QA

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L61 | P19 | 输出 selector→canonical owner map，不改 CSS | `docs/` inventory | 覆盖热点 selectors | 强复核 |
| G17 | P19 | 批准 canonical map 和移动顺序 | 强模型/集成 owner | 无冲突 owner | **不可交 Luna** |
| L62 | P19 | 一次只合并一个 shared component family | G17指定 CSS files | screenshot parity | 强复核 |
| L63 | P19 | 一次只迁移一个 page breakpoint family | G17指定 CSS files | boundary截图 | 强复核 |
| L64 | P19 | 删除已确认无引用的旧规则/`!important` | G17列出的规则 | rg + screenshot parity | 强复核 |
| L65 | P20 | 运行自动化矩阵并整理结果，不修代码 | `docs/` QA report | 命令日志 | 普通复核 |
| L66 | P20 | 生成三语言/视口/状态 screenshot manifest | QA assets/manifest | 数量与命名 | 普通复核 |
| G18 | P20 | 完整运行态、视觉、键盘、发布结论 | 用户/强模型/集成 owner | 最终验收矩阵 | **不可交 Luna** |

## 6. Package 大小规则

一个 Luna package 应同时满足：

- 只有一个可描述的结果；
- 通常不超过1–4个生产文件；
- 不跨 renderer、Electron、evidence/fixture 三种所有权边界；
- 不同时做结构变化和视觉变化；
- 不同时做功能实现和 CSS 收敛；
- focused test 在一个命令中可运行；
- 失败时可以回退一个 commit；
- 预计 diff 过大时，派发者在执行前继续拆分，不让 Luna自行拆。

L57、L59、L60、L62、L63 是“模板 package”，每次派发必须写明具体 card family、locale key group、异步区域、component family 或 breakpoint family；不能只给 ID。

## 7. Luna 开始与结束协议

### 7.1 开始前

Luna 必须先输出一段不超过8行的 preflight：

```text
Package / Parent:
Base:
Writable files:
Forbidden hotspots:
Approved artifact:
Preserve checks:
Focused test before edit:
Blocking ambiguity: none / details
```

如果 `Blocking ambiguity` 不是 `none`，停止，不编辑。

### 7.2 编辑期间

- 使用 `apply_patch`；
- 不格式化整个文件；
- 不新增依赖、不运行 `npm install`；
- 不改版本、README release、CHANGELOG；
- 不创建新的“final/refinement/override”样式文件；
- 不修改 snapshot，除非 package 明确要求且 reviewer 已批准；
- 不修与 package 无关的 lint/test/类型问题。

### 7.3 完成后

必须输出：

```text
Package:
Result: completed / blocked
Files changed:
Exact behavior changed:
Preserved behavior checked:
Focused test before/after:
Other verification:
Diff scope reviewed:
Runtime checked / not checked:
Unverified:
Reviewer gate required:
```

不得使用“应该没问题”“大概通过”“看起来更现代”等不可验证描述。

## 8. 可复制的 Luna 任务模板

```text
只执行 Work Package {Lxx}，不要开始相邻 package。

Parent Phase: {Pxx}
Base commit: {sha}
Approved decision: {Gxx artifact/link}

Writable files:
- {exact file}

Read-only context:
- AGENTS.md
- docs/UX_CONTRACT.md
- docs/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md 中 {Pxx}
- docs/UX_UI_LUNA_EXECUTION_GUIDE.md 中 {Lxx}

Forbidden files:
- {exact hotspots}

Exact change:
- {one deterministic outcome}

Preserve:
- {3–6 adjacent behaviors}

Before editing:
- git status --short
- {focused test command}

After editing:
- review git diff --name-status and full diff
- {focused test command}
- {typecheck/renderer capture/screenshot command}

Stop without editing if the approved artifact is missing, target files have unexplained changes, or completing the task requires files outside Writable files.

Return the handoff exactly in the guide format. Do not claim runtime or visual approval; identify the required Gxx reviewer gate.
```

## 9. Reviewer 职责

Luna 输出是候选 patch，不是完成证明。Reviewer 必须：

1. 重读实际 diff，不只读 handoff；
2. 确认 package 没有扩大文件范围；
3. 判断视觉/架构决定是否与批准 artifact 一致；
4. 运行 parent Phase 要求的 full gate；
5. 完成真实 Electron smoke 和视觉对照；
6. 失败时回退 package，不让下一个 Luna package继续覆盖；
7. 只有 reviewer 可以将 parent Phase 标为 `verified/integrated`。

## 10. 推荐派发顺序

第一次使用 Luna 时不要从 Settings、notification schema 或 CSS consolidation 开始。推荐以低风险校准：

1. L00 — baseline manifest；
2. L02 — CSS指标 inventory；
3. L03/L04 — 当前 renderer canary proposal 与状态/断点审计；
4. G01 — 由强模型/人工冻结 renderer-informed visual direction；
5. L05 — renderer 对照截图；
6. L06–L08 — 零视觉差异 token 骨架；
7. G03 — 集成验证。

如果 Luna 在以上任务中能稳定遵守文件边界、停止条件和 handoff，再逐步进入单页 renderer package。P19 CSS 收敛、P06 schema、P18 Settings 和 P20 最终验收始终需要强 reviewer。
