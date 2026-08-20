# UX / UI Luna 原子任务执行指南

> 状态：与 `docs/UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md` 配套使用  
> 目的：把 P00–P20 集成 Phase 拆成较弱模型也能可靠执行的单一 work package  
> 原则：Luna 负责确定性实现；强模型/人工负责审美、架构、冲突、运行结论和最终集成

## 1. 复查结论

P00–P20 的依赖、preserve list 和集成 gate 已经清楚，但部分 Phase 对较弱模型仍然过宽。不能直接把“完成 P03”“现代化 Queue”或“优化 Settings UI”交给 Luna，因为这些提示仍要求模型自行决定：

- 哪些颜色属于品牌、交互、状态或装饰；
- 哪一套 prototype/renderer 是目标；
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

## 2. Luna 能做与不能做

### 2.1 适合交给 Luna

- 按已批准 token 表进行机械替换；
- 增加明确列出的 CSS variable、alias 和静态检查；
- 在指定 breakpoint 修改指定 selector；
- 按现有 controller pattern 补 Enter/Space、Arrow、Escape、return focus；
- 按明确 locale key 清单迁移硬编码文案；
- 增加指定 focused tests；
- 运行给定命令并如实记录结果；
- 更新一个 prototype fragment 或一个页面拥有的 CSS；
- 生成 inventory、selector map、截图 manifest 和 handoff。

### 2.2 不交给 Luna 独立决定

- 选择最终配色、字体、视觉方向或判断“是否高级”；
- 在 approved prototype 与 renderer 冲突时选择 source of truth；
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
5. approved token/prototype/截图不存在或互相冲突；
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

### Batch A — 基线与视觉批准

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| L00 | P00 | 页面/状态/locale/viewport manifest | 新增一个 `docs/` manifest | 路径存在、条目齐全 | 普通复核 |
| L01 | P00 | 固定 viewport 截图脚本，不改产品 | 新增专用 `scripts/` 文件 | 脚本帮助/干跑；不安装依赖 | 强复核 |
| L02 | P00 | 当前 CSS 指标 inventory | 新增一个 `docs/` 报告或 fixture | 数字可由命令重算 | 普通复核 |
| G01 | P01 | 批准 palette、type scale、radius、surface 规则 | 人工/强模型决定 | 形成冻结 token 表 | **不可交 Luna** |
| L03 | P01 | 根据 G01 新增 prototype theme token layer | `prototypes/studio-prototype.css` 或批准的新 token 文件 | `npm.cmd run prototype:build` | 强复核 |
| L04 | P01 | 将 theme layer 应用于五个指定 canary，不改结构 | 指定 prototype fragments/shared CSS | prototype build | 强复核 |
| L05 | P01 | 生成 current/new、原色/灰度、两视口对照 | 截图输出目录/manifest | 数量和命名匹配 | 普通复核 |
| G02 | P01 | 批准/驳回 Cinematic Graphite | 人工/强模型视觉判断 | 写明保留和修订 token | **不可交 Luna** |

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
| G08 | P07 | 批准三模式 900px 构图与 DOM 顺序 | 人工/强模型 | prototype截图 | **不可交 Luna** |
| L30 | P08 | 只修 Image Edit 761–约926px overflow | `10-final-refinements.css` 中批准 selector或迁移后的 Create owner | 760/761/800/900/926/960截图 | 普通复核 |
| L31 | P08 | 只实现普通 Create 的批准 breakpoint/grid | Create page-owned CSS | 三模式截图 | 强复核 |
| L32 | P08 | 按批准 markup 增加素材摘要，不改变 payload | 指定 Create fragment/controller | focused controller test | 强复核 |
| L33 | P08 | 只修 sticky submit safe area/遮挡 | submit row selectors | error/disabled/long content截图 | 普通复核 |
| G09 | P08 | Create 输入、撤销、切换和提交批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch E — Queue

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G10 | P09 | 批准 running/empty/failed Queue prototype | 人工/强模型 | 状态截图 | **不可交 Luna** |
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
| G12 | P15 | 批准视频/图片详情动作与记录构图 | 人工/强模型 | prototype截图 | **不可交 Luna** |
| L47 | P15 | 只实现视频详情主动作/More层级 | history detail renderer + style | action smoke | 强复核 |
| L48 | P15 | 只实现图片详情主动作/More层级 | image detail renderer + style | action smoke | 强复核 |
| L49 | P15 | 下方生成记录由等权 cards改分组，不删字段 | detail fragments/styles | snapshot/截图 | 强复核 |
| G13 | P11–P15 | History/Details 全路径批准 | 集成 agent | full verify + runtime smoke | **不可交 Luna** |

### Batch G — Settings

| ID | Parent | Luna 的唯一输出 | 写入范围 | 验证 | Review |
| --- | --- | --- | --- | --- | --- |
| G14 | P16 | 确认 Settings/runtime 当前工作已形成 clean base | 用户/集成 owner | commit + handoff | **不可交 Luna** |
| L50 | P16 | prototype同步为9分类与当前已实现能力 | `prototypes/settings.html` | prototype build | 强复核 |
| L51 | P16 | prototype增加五种固定 Settings 状态 | prototype fragment/data | prototype build | 普通复核 |
| G15 | P16 | 批准 Settings 窄窗导航与保存结构 | 人工/强模型 | 800/900/1280截图 | **不可交 Luna** |
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
- 不跨 renderer、Electron、prototype 三种所有权边界；
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
- {typecheck/prototype build/screenshot command}

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
3. G01 — 由强模型/人工冻结视觉 token；
4. L03 — prototype token layer；
5. L05 — 对照截图；
6. G02 — 视觉批准；
7. L06–L08 — 零视觉差异 token 骨架；
8. G03 — 集成验证。

如果 Luna 在以上任务中能稳定遵守文件边界、停止条件和 handoff，再逐步进入单页 renderer package。P19 CSS 收敛、P06 schema、P18 Settings 和 P20 最终验收始终需要强 reviewer。
