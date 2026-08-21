# UX / UI 渐进式升级实施计划

> 状态：执行中；P00 renderer-rebase 已 verified，P01 已按用户指令确认当前 renderer 为视觉来源，P02 语义 token 骨架已实现，P03/L10–L15 shared surface/text/separator/action/status/brand-nav/panel-elevation 迁移与 G04 五页视觉/状态批准、P04/L16–L19 type token 声明与 shared heading/body/label/meta/technical/tabular-number 迁移、P05 导航语义与 P06 全局反馈/恢复已完成，G08 已批准，P08 Create 已 verified/integrated，G10 已批准，P10 Queue 任务优先构图及顶部性能总览修正已实现，G11 Queue executor/control 隔离 gate 与用户真实 ComfyUI 运行复核已通过，P11 History toolbar/gallery 稳定性、P12 History 键盘语义、P13 图片媒体状态、P14 Lightbox modal/focus 与 P15 视频/图片详情构图已 verified/integrated，P16 Settings current-renderer evidence/proposal 与 G15 结构批准已完成，P17 Settings 分类/保存/扫描动作层级已 verified/integrated，P18 Settings 内容层级、本地化与恢复反馈已 verified/integrated，P19/L61 CSS owner map 已完成，G17 已批准 Create 与 Settings shell 首批 package，L63 Create breakpoint、Settings navigation、Settings shell geometry、Settings section shell/heading、L62 Settings content card、History detail 与 Queue composition 已 parity/verify 通过
> 制定日期：2026-08-20  
> 当前版本：0.40.0
> 面向对象：后续实现 agent、集成 agent、人工验收者  
> 依据：`docs/UX_CONTRACT.md`、`docs/APPLE_HIG_UX_IMPROVEMENT_PLAN.md`、当前 renderer；`prototypes/` 仅作历史参考

> **2026-08-20 source correction**：用户已明确 prototype 使用的是旧设计。后续所有视觉判断、proposal、截图验收和生产实现都必须以当前 `src/renderer/`、`src/styles/`、真实 Electron/Vite renderer fixture 为准；旧 prototype 不再是 source of truth，也不再提供 visual approval evidence。

> 使用 Luna 等较弱模型执行时，不要直接派发整个 Phase；使用 `docs/UX_UI_LUNA_EXECUTION_GUIDE.md` 中的 `Lxx` 原子 package，并由 `Gxx` 强 reviewer gate 验收。

## 1. 目标

在不改变生成能力、工作流、任务数据、路径策略和运行时行为的前提下，以小步、可验证、可回退的方式升级 Local Video Studio 的 UX 与 UI。

最终方向是：

- 以当前深色、蓝色 action/accent、媒体主导的 renderer 为基线，逐步收敛为清晰的媒体工作台；任何颜色、材质或品牌方向变化都必须从真实 renderer 的 canary 页面和状态出发并单独批准；
- 构图上让每页只有一个主要任务和一个主要视觉热点；
- 交互上补齐恢复路径、键盘、焦点、异步状态和窗口适应；
- 工程上把当前多层 CSS 补丁收敛为有所有权的 token、component 和 page composition；
- 每个 phase 都独立完成 renderer evidence、实现、自动检查、运行态 smoke 和交接；prototype 只有在明确同步后才可作为辅助草图，不能替代 renderer 验收。

本文件回答“由谁、按什么顺序、改哪些文件、保留什么、怎样验收”。问题依据和审美论证见 `docs/APPLE_HIG_UX_IMPROVEMENT_PLAN.md`。

## 2. 不可破坏的功能边界

所有 phase 默认继承以下 preserve list；除非用户另行批准，不得改变：

1. Create 三种创建路径及其当前模型、参数、默认值和提交语义；
2. 草稿输入、selection、原生 undo/redo、应用级清空恢复与模式切换；
3. 已排队任务是不可变执行快照，视觉重排不得修改 queue payload；
4. Queue 的启动、暂停、继续、取消、恢复、重排、预览和单 GPU 重任务策略；
5. History 的视频/图片分类、封面缓存、hover preview、版本关系、删除与路径恢复；
6. 图片 viewer、版本轨、Lightbox、继续编辑和转视频 handoff；
7. Settings 离线文件扫描、多 ComfyUI 安装、服务生命周期、模型/节点/运行时证据分层；
8. 当前 ComfyUI、模型、LoRA、节点、workflow、GPU、VAE、precision、offload 和性能策略；
9. 应用关闭时只停止自己启动的进程，不终止用户独立启动的 ComfyUI；
10. 现有 i18n key、持久数据、IPC payload、旧 queue/history record 的兼容性；
11. 破坏性动作继续使用应用内确认，安全动作保持默认焦点；
12. 用户当前未提交的 Settings、runtime、environment 和 dependency 改动不得被覆盖或回放旧快照。

默认禁止进入 `electron/`、工作流、catalog、persisted types 和 `src/main.ts`。只有 phase 明确列出并说明理由时才可进入；视觉 phase 不得借机修改功能代码。

## 3. 当前工作树前置条件

当前工作树存在大量未提交的 Settings、runtime、environment、locales、tests 和 prototype 改动。因此：

- P00 renderer-rebase 完成前，不允许直接开始 renderer/CSS 生产实现；
- 可以在独立 clean worktree 中做只读审计或 renderer-based proposal；
- Settings 相关 phase 必须基于当前改动完成、提交或明确 handoff 后的新基线；
- 不允许为了获得 clean tree 使用 `git reset --hard`、`git checkout --` 或删除用户文件；
- 每个实现 agent 开始时记录 base commit、`git status --short` 和它拥有的文件；发现目标文件在 phase 期间变化，立即停止并重新对比。

## 4. 执行模型

### 4.1 Phase 状态

每个 phase 只允许以下状态：

`planned → evidence-ready → approved → implemented → verified → integrated`

- evidence-only phase 可从 `approved` 直接到 `integrated`；
- 没有人工视觉批准，不得把新的艺术方向迁移进 renderer；
- 没有运行态 smoke，不得把 renderer phase 标为 `verified`；
- `npm.cmd run verify` 只证明测试和构建，不证明视觉与键盘行为。

Phase 是集成与验收单位。实现任务若交给较弱模型，必须继续拆成 Luna guide 中一个 `Lxx` package；Luna 不得自行把一个 Phase解释成多个连续任务，也不得标记 Phase 为 `verified/integrated`。

### 4.2 一次只集成一个视觉 phase

可以并行进行只读审计、测试清单和不相交的 renderer evidence 准备，但以下热点只能有一个 owner：

- `src/style.css`；
- `src/styles/01-foundation.css`、`02-visual-refresh.css`、`05-density-refinement.css`、`10-final-refinements.css`；
- 历史 `prototypes/studio-prototype.css` 只允许独立 reference maintenance，不进入生产视觉 gate；
- `src/main.ts`、`src/types.ts`、`electron/main.ts`；
- Settings 页面/controller 与当前环境刷新改动。

不同页面的 renderer phase 可以在独立分支准备，但必须按本计划顺序串行合并，并在每次合并后重新运行 gate。

### 4.3 每个 phase 的标准开始检查

1. 阅读 `AGENTS.md`、`docs/UX_CONTRACT.md` 和本 phase；
2. 阅读本 phase 列出的 renderer、CSS、fixture 和 tests；prototype 仅在明确需要历史对照时阅读；
3. 记录 `git status --short` 与 base commit；
4. 写出 phase-specific preserve list；
5. 确认只存在一个文件 owner；
6. 若是 substantial UI，先从当前 renderer fixture、DOM、CSS 和截图建立 proposal；不得把旧 `prototypes/preview/` 当作设计依据；
7. 在编辑前重读目标文件，确认没有比计划更新的字段、controller 或 schema。

### 4.4 每个 phase 的标准完成检查

1. `git diff --name-status` 无意外文件、删除或格式化扩散；
2. renderer source、fixture、截图 evidence 与目标行为一致；prototype 仅在明确维护时同步，并不得被当作实现证据；
3. focused tests 通过；
4. production phase 运行 `npm.cmd run verify`；
5. 完成本 phase的视口、状态和交互 smoke；
6. 明确写出“实际运行”“静态验证”“未验证”三类证据；
7. 更新本计划 phase 状态，不自行开始下一 phase；
8. 每个 phase 一个可独立回退的 commit，不把相邻 phase 混在同一提交。

## 5. 总体依赖图

```text
P00 当前 renderer 基线
 └─ P01 当前 renderer 视觉定向 review
     └─ P02 语义 token 骨架（无视觉变化）
         ├─ P03 配色与材质迁移
         ├─ P04 排版、间距、圆角
         └─ P05 Shell / sticky / nav
              ├─ P06 全局反馈与恢复
              ├─ P07 → P08 Create
              ├─ P09 → P10 Queue
              ├─ P11 → P12 → P13 → P14 → P15 History / Details
              └─ P16 → P17 → P18 Settings
                   └─ P19 CSS 所有权收敛
                       └─ P20 全量验证与发布准备
```

P06、P07、P09、P11、P16 的 proposal 可并行准备；只要触碰 global tokens 或 renderer shared shell，就必须串行。旧 prototype 不参与 approval gate。

## 6. Phase 索引

| Phase | 目标 | 类型 | 前置 | 主要 gate |
| --- | --- | --- | --- | --- |
| P00 | 冻结当前 renderer 可复现基线 | 文档/截图 | 无 | renderer baseline manifest |
| P01 | 基于当前 renderer 批准视觉方向 | renderer review | P00 | current-renderer visual approval |
| P02 | 建立语义 token，保持像素不变 | shared CSS | P01 | screenshot parity + verify |
| P03 | 迁移配色与材质 | shared CSS | P02 | 五页视觉对照 + verify |
| P04 | 迁移字体、间距、圆角 | shared CSS | P03 | 125%/150% + verify |
| P05 | 修复 Shell、导航和 sticky | shared shell | P04 | scroll/breakpoint smoke |
| P06 | 可恢复的通知与反馈路由 | renderer behavior | P05 | notification tests + smoke |
| P07 | 基于当前 Create renderer 批准窄窗构图 | renderer review | P05 | 900×800 approval |
| P08 | 实现 Create 构图与溢出修复 | renderer/page CSS | P07 | typing/undo/submit + verify |
| P09 | 基于当前 Queue renderer 批准任务优先构图 | renderer review | P05 | running/empty/error approval |
| P10 | 实现 Queue 任务优先层级 | renderer/page CSS | P09 | queue controls + verify |
| P11 | History toolbar/album 构图 | renderer review + implementation | P05 | filter/delete/layout + verify |
| P12 | History 卡片与菜单键盘语义 | renderer interaction | P11 | keyboard smoke + verify |
| P13 | 图片媒体异步状态 | renderer interaction | P12 | media failure matrix + verify |
| P14 | Lightbox modal/focus | renderer interaction | P13 | focus trap/return focus + verify |
| P15 | 视频/图片详情构图 | renderer review + implementation | P14 | viewer/version/action + verify |
| P16 | 基于当前 Settings renderer 批准结构 | renderer review | P05 + clean Settings baseline | current-renderer review |
| P17 | Settings 分类与保存动作 | renderer/page CSS | P16 | save/scan/focus + verify |
| P18 | Settings 内容层级、本地化与状态 | renderer/page CSS | P17 | offline/install/i18n + verify |
| P19 | CSS 所有权与重复规则收敛 | refactor | P06–P18 | no-visual-diff + verify |
| P20 | 全量 UX/UI 验证与发布准备 | QA/docs | P19 | complete matrix |

### 6.1 文件所有权地图

下表是实现 agent 的默认写入边界。实际开始前仍须重读当前文件并根据最新基线收窄；不能因为文件出现在表中就顺手修改全部内容。

| Phase | 默认拥有文件 | 默认不可触碰 |
| --- | --- | --- |
| P00 | `docs/`、专用截图/fixture scripts | renderer UI、Electron、workflow |
| P01 | `docs/UX_UI_RENDERER_BASELINE.md`、renderer capture fixture/evidence | `prototypes/*`、production `src/` |
| P02 | `src/style.css`、canonical token source、token test | page controllers、DOM |
| P03 | token source、shared button/input/nav/status visual rules | controller、IPC、page order |
| P04 | type/space/radius rules及对应 token tests | grid/breakpoint、renderer logic |
| P05 | `src/renderer/shell/*`、topbar/page-heading shared styles | page business controller |
| P06 | `src/renderer/notifications.ts`、notification shell view/controller、focused tests；必要时单 owner 进入 `src/main.ts` | workflow、settings persistence |
| P07 | current Create renderer fixture/evidence、proposal docs | `prototypes/create.html`、workflow、queue payload |
| P08 | `src/renderer/pages/create/*`、`07-create-composer.css`、`09-create-header.css`、明确的 Create responsive rules | workflow adapter、queue payload types |
| P09 | current Queue renderer fixture/evidence、proposal docs | `prototypes/queue.html`、queue state machine、IPC |
| P10 | `src/renderer/pages/queue/*`、Queue-owned rules | queue state machine、IPC contract |
| P11 | History fragments/layout controller、History gallery/toolbar rules | media loader、Lightbox |
| P12 | History navigation/context menu/tabs controllers及 tests | gallery geometry、media path logic |
| P13 | History media controller/helpers、image media fragments及 tests | deletion/persistence schema |
| P14 | `lightbox-controller.ts`、Lightbox fragments/styles/tests | shared media path resolver |
| P15 | History detail page/fragments与 detail-owned styles、renderer evidence | history record schema、file IPC |
| P16 | current Settings renderer fixture/evidence、proposal docs | `prototypes/settings.html`、renderer/locale/runtime |
| P17 | Settings page/fields/page-controller、`06-settings-layout.css`、focused tests | store schema、environment services |
| P18 | Settings fragments/copy/view-model、locale files、Settings status styles/tests | Electron runtime policy、installer behavior |
| P19 | `src/styles/*`、`src/style.css`；只能一个 owner | DOM、controllers、功能 tests重写 |
| P20 | docs、QA scripts、release metadata（仅获准发布时） | 新功能实现 |

## 7. 详细 Phase 卡

### P00 — 冻结可复现基线

**目的**：建立后续所有视觉和交互判断的可重复基准，不改产品行为。

**允许修改**：`docs/`、截图/验证脚本、隔离的 renderer fixture 数据；不得修改 renderer UI。

**工作**：

- 保存 Create 三模式、Queue running/empty/failed、History 视频/图片两布局、两种 Details、Settings 关键分类的 fixture 状态；
- 固定 1440×900、1280×800、900×800、760×800，以及1121/1120、901/900、761/760断点对照；
- 建立当前 renderer 页面 manifest：真实入口、数据状态、locale、预期主动作和证据边界；旧 prototype manifest 单独标为 historical；
- 记录当前颜色/排版债务基线：unique hex、primary usage、9/10/11px、跨文件重复 selectors；
- 对当前脏工作树建立只读 handoff，不把未完成 Settings 行为当作 baseline passed。

**Gate**：`npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --dry-run`；renderer baseline 可重新生成；manifest 明确静态 capture、运行态 smoke 和未验证边界。历史 prototype 不进入此 gate。

**当前状态（2026-08-20）**：旧 prototype 参考基线已降级；当前 renderer rebase 为 `verified`。已生成 `docs/UX_UI_RENDERER_BASELINE.md`、`docs/ux-ui-renderer-baseline.manifest.json`，并用真实 Vite renderer + 隔离 mock preload 捕获 136 张标准/断点截图；`queue-mixed` 明确标记为合成 waiting + failed fixture，未作为 live running 证据。用户指令已确认当前 renderer 是 P01 的视觉来源，proposal 记录于 `docs/UX_UI_P01_RENDERER_PROPOSAL.md`，因此进入 P02 零视觉变化 token 骨架。

**回退**：仅删除本 phase 新增的基线资产；不涉及产品代码。

### P01 — 当前 renderer 视觉定向 review

**目的**：只基于当前 renderer 判断颜色、材质、字体、密度和节奏，不同时改变页面结构或把旧 prototype 设计迁移进生产代码。

**允许修改**：renderer baseline evidence、proposal 文档和隔离 fixture；不得修改生产 `src/`，不得把旧 prototype 当作候选实现。

**工作**：

- 以真实 renderer 的 Create、Queue、History/Details、Settings canary 截图建立 preserve/change 清单；
- 记录当前蓝色 action/status、深色 surface、媒体比例、信息密度和断点构图，先判断哪些问题是真实 UI 问题；
- 设计候选调整时只写 renderer-informed tokens/rules，不先写 prototype-only 主题层；
- 覆盖原色、灰度、轻度模糊和三类媒体状态，确认每页的主任务、主视觉热点和恢复路径；
- 检查 loading、empty、unavailable、success、error、disabled、focused 以及 900×800/760×800 行为。

**不得做**：重排 DOM、删除功能、隐藏技术证据、把 prototype-only 行为伪装成 implemented，或把旧 prototype 的艺术方向直接迁移到 `src/`。

**Gate**：人工基于当前 renderer 截图批准视觉方向；主任务在灰度下仍清楚；模糊后每页只有一个 accent 热点；文本/状态完成静态对比度初筛；没有 prototype approval 替代 renderer approval。

**回退**：删除本 phase 的 proposal/evidence，不触碰生产 renderer；旧 prototype 保持历史参考状态。

**当前状态（2026-08-20）**：旧 `Cinematic Graphite` prototype 候选已 `superseded`；用户已确认当前 renderer 为视觉来源，P01 source direction 已批准。`docs/UX_UI_P01_RENDERER_PROPOSAL.md` 冻结 preserve list 和 P02 输入；不得将旧 graphite token、截图或 URL 作为 P02 输入。

### P02 — 语义 token 骨架，零视觉变化

**目的**：为迁移提供单一语义来源，先不改变任何像素。

**主要文件**：`src/style.css`、一个 canonical token source、renderer baseline mapping。

**工作**：

- 定义 canvas、surface、separator、text、action、semantic、focus、elevation、type、space、radius、sticky tokens；
- 旧 `--bg/--panel/--primary/...` 暂时 alias 到新角色，值保持当前基线；
- 为主题色添加 lint/静态检查策略，禁止新组件继续写裸 hex；
- 不移动 component selector，不改变 cascade order。

**Gate**：当前 renderer 的 136 张截图与 baseline 无感知差异；`npm.cmd run verify`；至少 Create typing、Queue running、History media、Settings save smoke 不变。

**停止条件**：任何布局尺寸、颜色或 focus ring 变化都说明 phase 超范围，先修复 parity 再继续。

**当前状态（2026-08-20）**：`implemented / static validation passed`。已新增 `src/styles/00-tokens.css`、入口 import 和 `tests/ux-ui-tokens.test.ts`；语义角色只 alias 当前 renderer 变量。focused token tests `3/3`、renderer capture `136/136`、完整 `npm.cmd run verify`（80 files / 605 tests）均通过。由于本 phase 未重复执行 Create typing、Queue running、History media、Settings save 的完整交互 smoke，暂不把 P02 标为 `verified/integrated`。

### P03 — 配色与材质迁移

**目的**：把 renderer 从当前基线迁移到 P01 已批准的 renderer-informed visual direction，不改 DOM 和功能。

**主要文件**：canonical tokens、shared buttons/inputs/panels/nav/status styles；不改 controller。

**工作**：

- 分角色迁移 canvas/surface/text/separator；
- 再迁移 action accent、focus、progress；
- 最后迁移 success/warning/danger/info；
- brand、nav、badge、drag/drop、viewer、checkerboard 分别检查，不做全局查找替换；
- 普通 panel 移除 glow/普遍阴影，overlay 保留 elevation；
- 保留可见 focus 和状态冗余信号。

**Gate**：五页 canary 与当前 P01 approval artifact 一致；所有状态可辨；Windows 高对比度不因自定义色消失；`npm.cmd run verify`。

**回退**：恢复 token values 即可回到旧外观；不得留下半套局部蓝色覆盖。

**当前状态（2026-08-20）**：G02 已先冻结当前 renderer 的 surface mapping：近黑 canvas、base/object/raised 分层保持现有冷色值，后续 progress 仍需单独审查。P03/L10–L15 已实现：L10 迁移 `body`、topbar/nav、active surface、panel、secondary/icon controls、Settings sidebar 与 ComfyUI evidence rows 到 `--ux-*` surface roles；L11 新增并迁移 heading/primary/secondary/tertiary/technical text roles 与 subtle/strong separators；L12 将 shared primary/secondary/ghost/icon actions、pressed transform、global focus ring 与 input focus glow 迁移到语义 roles；L13 将 shared badge、save state、task status、availability badge 与四类 flash notice 迁移到 success/warning/danger/info semantic roles；L14 将 brand mark、topbar 和 active nav 的装饰颜色迁移到 brand/nav roles，移除装饰性 glow，保留活动导航的背景、边界、下划线和状态反馈；L15 将普通 panel 的 elevation role 收敛为 `none`，移除普通 panel、task/performance/history/settings surface 的装饰性阴影，同时保留 tooltip、flash、context menu、dialog、lightbox、confirm、cropper 和 asset-library 等 overlay elevation。L14 是首个可见 shell 差异，L15 继续形成可辨识的 panel/overlay 材质差异，本轮版本升为 `0.30.2`；未改变 DOM、controller、payload、布局或交互语义。G04 强复核已通过：Create 三模式、Queue waiting/failed、History 视频/图片 masonry/album、视频/图片 Details、Settings offline/saved fixture 在当前 renderer 的层级、状态冗余和关键断点下均无回归；`136/136` screenshots、八组 viewport、全矩阵 diagnose、`create-image-edit 900×800` 输入焦点 smoke、L14 shell 与 L15 panel canary、focused token tests、`npm.cmd run verify`（80 files / 610 tests）和 20 组对比度检查通过。P03 现标为 `verified/integrated`，下一 Phase 为 P04。

### P04 — 排版、间距、圆角和数字节奏

**目的**：建立精确但可读的排版层级，减少小字和近似 magic values。

**工作**：

- 将现有字号映射到七种类型角色；9px只允许已记录的非关键装饰；
- 移除 body 全局 letter-spacing，标题保留受控负字距；
- 状态、进度、时间、VRAM 使用 tabular numbers；
- 同类 heading、form row、object card 迁移到 space tokens；
- radius 收敛为 control/object/large container；
- 不在此 phase 改 grid、DOM 顺序或 responsive breakpoint。

**Gate**：100%/125%/150% 缩放；简中、繁中、英文；长路径和长模型名；无新增截断；`npm.cmd run verify`。

**当前状态（2026-08-20）**：P04/L16–L21 已完成：L16 在 `src/styles/00-tokens.css` 明确冻结 Page/Section/Object/Body/Label/Meta/Technical 七级 type roles；L17 依据当前 renderer 最终 cascade 将 page 基线校正为 `clamp(20px, 1.65vw, 23px)`，并把共享 `h1/h2/h3` 与 History gallery object heading 迁移到对应 roles；L18 将真实最终值接入根 body、全局/form label、共享 meta copy 与 global code technical selectors，并把 `--zoom 1|1.25|1.5` 加入 current-renderer capture harness；L19 为 Queue/History/运行态的 progress、time、metric、count、position 动态数值补齐显式 `font-variant-numeric: tabular-nums`；L20 将当前 renderer 最终 cascade 中的 control/object/panel/modal 圆角值接入 `--ux-radius-*` roles，面板保持有效的 13px；L21 将 performance-grid 的 12px gap 与 16px bottom spacing 接入 `--ux-space-3/4`，不改变 DOM、布局数值或响应式规则。详情标题、弹窗标题、任务卡、日志、badge、album 紧凑标题等特例保持原有密度。focused token tests `13/13`、`npm.cmd run verify`（80 files / 615 tests、production build、20 组对比度检查）通过；L19 的 Queue 1440/900、History 视频/图片图廊与视频/图片 Details current-renderer 动态值截图和 diagnose 仍作为本轮相邻视觉基线，L20/L21 均为等值语义迁移。L20/L21 阶段版本仍为 `0.30.2`；随后 P05/L22–L24 的 sticky 几何修复形成可见的滚动层级差异，版本升为 `0.31.0`，下一集成 gate 为 G05。

### P05 — Shell、主导航与 sticky 几何

**目的**：先稳定所有页面共享的外框和滚动基线。

**主要文件**：shell markup/styles、topbar/page-heading shared geometry；此 phase 一个 owner。

**工作**：

- 统一 `--topbar-height` 与 page sticky offset；
- topbar z-index 永远高于 page heading；窄屏 topbar 非 sticky 时 offset 归零；
- nav active 使用中性 surface + indicator，并补 `aria-current="page"`；
- Queue/Create/History/Settings sticky 标题无8px错位、空带或覆盖；
- 检查 flash/notification 不覆盖 brand/nav。

**Gate**：所有主页面与 Details 在关键断点上下滚动；History detail 保持 History current；close dialog 不受影响；`npm.cmd run verify`。

**当前状态（2026-08-20）**：已在 `src/renderer/shell/page.ts` 为 active top-level nav 补上 `aria-current="page"`，并用 renderer shell focused tests 覆盖 Settings 与 History detail 的选中语义。P05/L22 已将当前 renderer 的 72px topbar 接入 `--ux-topbar-height`，将 page sticky offset 对齐为 72px，并在 topbar 变为 normal-flow 的 760px 以下断点将 offset 归零；P05/L23 已将 Create/Queue heading 接入共享 sticky offset，Create 的层级降到 topbar 之下，Queue 在窄屏显式归零；P05/L24 已将 History heading、History detail 返回条和 Settings heading 接入同一 token，并保留窄屏 top:0 规则。P05 相关 focused token tests `16/16`、`npm.cmd run verify`（80 files / 618 tests、production build、20 组对比度检查）通过；同一 Vite renderer 与隔离 preload 的 runtime probe 已在 1440×900、900×800、760×800、761×800 检查四个主页面和视频 Details：桌面 heading/topbar 对齐为 72/73px，窄屏 heading 回到 0，scrollWidth 与 clientWidth 一致；History detail 确认弹窗可打开/取消且返回条、History 选中语义保留。标准 capture harness 仍有 route 后单次 `executeJavaScript` DOM wait 竞态，因此该限制单独记录，不作为产品失败。P05 与 G05 现标为 `verified/integrated`，下一 Phase 为 P06。

### P06 — 全局通知、局部反馈与恢复动作

**目的**：让失败可追溯、可恢复，同时减少全局 flash 对页面构图的打断。

**主要文件**：`src/renderer/notifications.ts`、shell notification view/controller、必要时由单一 owner 修改 `src/main.ts`；schema 变化需兼容。

**工作**：

- success/info 可自动消失；warning 可关闭；error 默认持久；
- notification 支持 Dismiss、Retry、View logs、Open Settings 等可选 actions；
- 定义反馈路由：字段就地、页面操作局部、跨页生命周期全局；
- 同源消息去重，低价值 info 不覆盖 error；
- 错误使用 alert，进度/成功使用 status，避免重复播报。

**测试**：`tests/notifications.test.ts`，补并发、去重、持久 error、action callback 和 dismiss。

**Gate**：模拟扫描失败、文件打开失败、Prompt 优化失败、任务完成并发；键盘可执行恢复；`npm.cmd run verify`。

**当前状态（2026-08-20）**：P06/L26–L29 已完成：`src/renderer/notifications.ts` 为 error 建立持久策略，为 info/warning/完成态保留语义时长，增加同源去重、error 优先级保护和瞬时 action callback；shell flash 增加可聚焦的关闭按钮与事件委托，Prompt 优化失败已接入“打开设置”恢复路径，Settings 的下载/目录/日志打开失败已明确路由为 error，关闭/action 只更新局部 DOM。L29 controller focused tests `2/2`、通知聚焦 suite `11/11`、typecheck 和 `npm.cmd run verify`（81 files / 624 tests、production build、20 组对比度检查）已通过；G07 隔离 Electron + 当前 Vite renderer runtime smoke 已验证并发完成/失败保留 error alert、dismiss 恢复、Prompt action 导航 Settings 并清除通知。P06 现标为 `verified/integrated`，下一条受批准的工作是等待 G08 后进入 P08。

### P07 — Create 窄窗口构图 renderer review

**目的**：基于当前 Create renderer 的真实 DOM、截图和状态，批准中窄窗口的阅读顺序，不先改生产 renderer。

**工作**：

- 1280+ 保持素材与 Prompt 双主区；
- 901–1120选择紧凑双列，或单列时 Prompt 摘要/编辑先于完整素材管理；
- 已选素材在窄窗显示紧凑摘要，可展开编辑；
- sticky submit 不遮挡 Prompt/error；
- Image Edit 在761–约926px不横向溢出；
- 三种创建模式都要有当前 renderer fixture/evidence，不只验证 H3。

**Gate**：900×800 首屏同时看见当前素材状态、Prompt 起始区和提交上下文；Tab 顺序与视觉顺序一致；人工批准。

**当前状态（2026-08-20）**：`docs/UX_UI_P07_RENDERER_PROPOSAL.md` 的 G08 已批准：基于当前 renderer 三种 Create fixture 的 24 张截图（1440×900、1280×800、1121×800、1120×800、901×800、900×800、761×800、760×800），确认 901–1120/900 紧凑双列、1280+ 双主区、760 以下单列 fallback 与 submit safe-area 方向；没有使用旧 prototype 作为证据。capture harness 已改为隐藏窗口的稳定定时 settle，避免仅由 `requestAnimationFrame` 造成的 DOM wait race；P07 进入 `approved`，P08 可执行。

### P08 — Create renderer 渐进实现

**主要文件**：Create page/fragments/controllers 与 Create-owned CSS；不得修改 workflow payload。

**工作顺序**：

1. 先只修 Image Edit breakpoint/min-width；
2. 再实现 responsive composition，不改控件 id/data attributes；
3. 再加入素材摘要/disclosure；
4. 最后修 sticky submit safe area；
5. 每一步单独截图和 smoke，避免一次改完整页。

**测试**：`create-enqueue`、`draft-prompts`、`prompt-edit-history`、`prompt-count`、`h3-reference`、`image-workflow` 及相关 controller tests。

**Gate**：连续输入、selection、Ctrl+Z/Y/Shift+Z、清空恢复、拖放、click-to-select、模式切换、提交、双击防重；三模式与关键视口；`npm.cmd run verify`。

**当前状态（2026-08-20）**：P08 已 `verified/integrated`。`breakpoint/min-width`、素材区窄屏文字边界和 Image Edit sticky submit safe-area 已实现：标题摘要使用可收缩省略，`添加 Slot` 保持单行，素材卡标题、标签与角色选择器不会再被压成单字纵排或互相覆盖；901–1120px 及 760px 以下为提交条保留当前 flow 内的安全视觉间距。`src/styles/10-final-refinements.css` 没有修改 DOM、控件 id、workflow payload 或提交语义；三种 Create 模式在 8 个关键视口均完成当前 renderer 截图，900/760×800 的 diagnose 确认 `documentScrollWidth === documentClientWidth`。隔离 renderer smoke 已覆盖连续输入与焦点、清空恢复、Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z、三模式切换、图片 click-to-select、图片/视频 drag/drop，以及三个提交入口的双击只调用一次；synthetic preload 统计为 image edit/image/video extension 各 `1` 次。safe-area 静态契约测试与 `npm.cmd run verify` 通过（81 files / 625 tests、production build、20 组对比度检查）。没有执行真实 ComfyUI 生成；Queue running 属于下一阶段 P09/P10，不作为 P08 未完成项。

### P09 — Queue 任务优先构图 renderer review

**目的**：让 active task 成为执行区第一个主体，同时保留顶部环境性能总览的快速可见性。

**工作**：

- 将 CPU/RAM/GPU/VRAM 作为 Queue 顶部统一环境总览，不在 active task 内重复渲染；
- 默认显示阶段、总进度、局部进度、preview、elapsed、ETA和关键 GPU/VRAM；
- active task 保持阶段、进度、preview、elapsed、ETA 和主要控制的连续阅读路径；四状态共享同一顶部性能位置；
- 保留 pause/resume/cancel/recovery 的安全层级；
- 900px pending actions 不挤压标题，低频动作进入 More 或第二行。

**Gate**：running、paused、failed、recoverable、empty、multiple pending 六种状态批准。

**当前状态（2026-08-21）**：G10 已批准 `docs/UX_UI_P09_RENDERER_PROPOSAL.md` 的任务优先构图。capture harness 已支持 running、paused、failed、recoverable、empty、multiple-pending 六种 Queue state；8 个唯一视口的 current-renderer diagnose 均无文档横溢出，900×800 隔离 running smoke 已验证 progress/stage/elapsed/preview/telemetry patch 与 pause/cancel 入口。P10 已实现：四张 CPU/RAM/GPU/VRAM 性能卡统一位于 Queue 顶部，active task 位于执行区第一主体，running card 以状态/控制优先的 DOM 顺序覆盖 900/760px；本次顶部位置修正不改队列顺序、状态机、IPC、任务快照或实时 patch 目标。P10 focused Queue tests 与 `npm.cmd run verify` 通过（82 files / 632 tests、production build、20 组对比度检查）。G11 已通过 executor/control 隔离 gate，覆盖成功 History 收敛、claim 前取消竞态、readiness abort 不提交、active worker abort/cleanup 生命周期和暂停期间不重叠恢复五条边界；用户随后已在真实 ComfyUI 环境完成实际运行复核，未发现明显问题，G11 的 runtime blocker 已解除。具体运行环境与 GPU 结果仍以用户本机实测为准。

### P10 — Queue renderer 任务优先实现与顶部性能总览

**主要文件**：`src/renderer/pages/queue/page.ts`、`card.ts`、live status/controller 和 Queue-owned CSS。

**不得改变**：队列顺序、运行状态机、估时算法、pause/cancel IPC、preview 开关语义。

**测试**：`queue-controls`、`queue`、`queue-modules`、`queue-estimator`、`performance`、`recovery`。

**Gate**：execution section 的第一主体是 active/empty，顶部性能总览保持稳定；遥测刷新不重建表单、不抖动卡片、不抢焦点；暂停/继续/取消/重排/恢复实际 smoke；`npm.cmd run verify`。

### P11 — History toolbar、瀑布流和相册稳定性

**目的**：修复工具条拥挤、固定高度和 item-count 驱动列数。

**工作**：

- 900px 左右保持历史作品标题、视频/图片 tabs、筛选计数和 masonry/album 在同一 toolbar 行；
- 760px 以下解除68px固定 height/max-height；
- album 列数只由 container width 决定，删除/过滤不放大剩余卡片；
- 保持 masonry stability、用户 layout choice 和当前 filter；
- 不在此 phase 修改卡片激活语义或媒体加载。

**测试**：`history-filter`、`history-state`、`history-delete`、renderer foundation。

**Gate**：从8项删至1项列轨稳定；瀑布流/相册切换、过滤、删除、返回详情无布局跳变；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P11 已 `verified/integrated`。`src/renderer/pages/history/helpers.ts` 新增按容器宽度计算 album 列数的纯 helper，按可用宽度将卡片稳定在约 `180–240px` 的紧凑范围内；`layout-controller.ts` 将 album track 改为 `repeat(n, minmax(0, 1fr))`，不再使用 `cards.length`；`src/styles/11-history-curation.css` 保持标题、kind tabs、filter/count、masonry/album 在同一 toolbar 行，解除 900px 左右 inherited fixed toolbar height，并将 filter panel 锚定在当前内容视口内；760px 也保持同一行，极窄宽度才安全降为标题行 + 控制行。视频/图片 album 在 `1440/1280/1121/1120/901/900/761/760 × 800/900` current-renderer capture 与 diagnose 通过；混合 `16:9/9:16/1:1/4:3/3:4` 的 8 项与 1 项对照在 900×800 现保持约 `196px × 4` 列轨，1440×900 约 `218px × 6`，760×800 约 `229px × 3`，大屏按范围增列；混合比例 masonry 也在同一视口矩阵中保持无页面横向溢出。760×800 不再出现 toolbar overlap，document/body 无横向溢出（仅保留预期的媒体模型 chip 文本省略）。capture harness 已加入混合宽高比 History fixture，以及 filter/no-result/clear、masonry/album、详情返回、History parent nav selected、删除确认/取消 smoke，视频和图片路径均通过；`npm.cmd test -- tests/history-layout.test.ts tests/history-state.test.ts`、`npm.cmd run typecheck`、`npm.cmd run verify` 通过（83 files / 638 tests、production build、20 组对比度检查）。P11 没有改变 History DOM/IPC/persisted state/media path 或 P12–P15 语义，下一 phase 为 P12。

### P12 — History 卡片、tabs、menus 的键盘语义

**目的**：让键盘路径与指针路径等价，不改变视觉构图。

**工作**：

- History 卡片使用真实主入口或正确 role + Enter/Space；
- tabs 使用单一 Tab stop、Arrow/Home/End和受控 panel；
- context menu 支持 More 按钮、Shift+F10/Menu key、Arrow/Home/End、Escape与return focus；
- layout/version selected 状态使用一致的 pressed/tab模型；
- 子控件事件不触发整卡打开。

**Gate**：仅键盘完成筛选、打开、菜单、取消删除、返回原卡；Accessibility Tree角色/名称/状态正确；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P12 已 `verified/integrated`。视频/图片 History 卡片补齐 `role="button"`、Enter/Space 和 More 入口，子控件不会触发整卡打开；kind tabs 使用单一 Tab stop、`aria-selected`/`aria-controls`/`tabpanel`，支持 Arrow/Home/End 并在重渲染后恢复焦点；More、Shift+F10/Menu key 的 context menu 支持 Arrow/Home/End、Escape 和 return focus；layout/version 状态补齐 `aria-pressed`。当前 renderer 的视频/图片混合 8 项 900×800 fixture、筛选/无结果/清除、masonry/album、菜单、卡片打开、版本选择、删除取消与详情返回 smoke 均通过；1440×900、900×800、760×800 的视频/图片 album diagnose 无横向溢出（仅保留预期模型 chip 文本省略），focused accessibility/layout/state tests `11/11`、`npm.cmd run verify`（85 files / 645 tests、production build、20 组对比度检查）通过。下一 phase 为 P13。

### P13 — 图片媒体 loading/error/retry 状态

**目的**：补齐图片 gallery、detail、version rail、lightbox 的共享媒体状态。

**工作**：

- 抽出不改变路径规则的共享 image media state；
- loading skeleton、ready、missing、read/decode error、retry、locate；
- 失败不得清除仍有效旧缩略图或封面；
- 视频既有 loading/error 行为保持不变。

**测试**：`history-media`、`history-cover`、`image-project`、路径恢复相关 tests。

**Gate**：慢加载、源文件删除、权限失败、缓存损坏、重试成功；四个图片 surface 一致；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P13 已 `verified/integrated`。新增共享 `image-media-state` 与 History image media controller，gallery、detail、version rail、Lightbox 均接入 loading/ready/unavailable/error 状态；重试使用 gallery 缓存加载或当前媒体探针，定位操作沿用既有 `showItemInFolder` 与文件缺失通知；成功 source 会保留，后续加载失败不会清空旧缩略图。未改变 `studio-media://history/{project}/{version}/0` 路径规则，也未改动视频媒体 controller。focused state/markup tests 与全量 `npm.cmd run verify`（86 files / 649 tests、production build、20 组对比度检查）通过；当前 renderer 8 项混合宽高比的 900×800 keyboard/media smoke、1440×900/900×800/760×800 diagnose 和 image detail failure screenshot 通过。下一 phase 为 P14。

### P14 — Lightbox modal 与焦点生命周期

**目的**：让 `aria-modal` 与真实行为一致。

**工作**：

- 复用 shell dialog focus helper；
- 记录触发者、背景 inert、Tab/Shift+Tab循环、Escape关闭、return focus；
- 版本切换不重建 dialog 或丢焦点；
- Reduced Motion 下关闭非必要过渡。

**Gate**：首末控件循环、背景不可达、连续切版本后回焦正确；鼠标缩放/拖动/方向键仍工作；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P14 已 `verified/integrated`。Lightbox 复用 shell `bindModalFocus`，打开时记录触发按钮并将外部背景设为 inert，关闭时通过 Escape/关闭控件恢复 return focus；首末控件支持 Tab/Shift+Tab 循环，版本切换不重建 dialog，并在边界按钮变为 disabled 时将焦点留在仍可用的版本控制上；`prefers-reduced-motion: reduce` 下关闭 Lightbox 非必要动画和过渡。未改变图片媒体路径、缩放/拖动、方向键版本切换或视频历史逻辑。当前 renderer 图片 8 项混合宽高比 900×800 smoke 已覆盖初始焦点、背景 inert、双向 Tab 循环、版本切换保焦、Escape 和 return focus；视频 8 项 900×800 History smoke、focused accessibility/layout tests `7/7`、`npm.cmd run typecheck` 与 `npm.cmd run verify`（86 files / 649 tests、production build、20 组对比度检查）通过。下一 phase 为 P15。

### P15 — 视频/图片详情的 viewer、inspector 与动作层级

**目的**：保留媒体主导，同时让主动作和记录更清楚。

**工作**：

- 每种详情选择一个 dominant next action；
- inspector 常驻主动作和2–3个高频动作，其余 More/下方；
- 900×800 提供紧凑 action entry，不让 viewer 完全隔断下一步；
- 下方参数、输出、LoRA、输入、性能合并为一个生成记录 section；
- 真实文件对象可保留独立 card；版本轨继续与 viewer 作为一个查看区域；
- 返回条保持 sticky，History nav 保持 current。

**Gate**：视频/图片、单/多版本、缺失媒体、长记录；继续创作、复制、定位、删除、超分；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P15 已 `verified/integrated`。当前 renderer 详情页保留 viewer/版本区域与既有媒体、队列、历史语义，视频和图片 inspector 采用 primary/secondary/More 层级；900px 及以下提供 compact action entry，返回条取消负外边距造成的内部横溢出；prompt、生成参数、输出、LoRA、输入、性能和文件快照统一归入 Generation record section，字段与 action selector 不变。视频/图片详情在 1440×900、900×800、760×800 完成 diagnose/smoke，图片缺失媒体 error、单/多版本、长记录、More 键盘可达均覆盖；History 混合 8 项 keyboard/media smoke、Queue running smoke、focused markup tests 与 `npm.cmd run verify` 通过（当前 0.38.0）。下一 phase 为 P16。

### P16 — Settings renderer 结构 review

**前置**：当前 Settings/runtime 未提交工作已经有明确基线和 owner。

**目的**：基于当前 Settings renderer 和已接受的 runtime 能力，先批准8/9分类、语言区和安装能力的真实结构。

**允许修改**：当前 Settings renderer fixture/evidence、proposal 文档；不改 renderer 生产代码，不修改 runtime 能力。

**工作**：

- 以真实页面精确记录当前9分类与已接受的新区域；
- 覆盖宽屏 sidebar、中窄 compact category、保存动作、环境扫描和安装队列状态；
- 标记真实 implemented、planned、offline 和 runtime-dependent 行为；
- 先批准 renderer 结构，再进入 Settings page implementation。

**Gate**：current renderer capture/review；800/900/1280/1440；offline、scanning、installing、partial、error 五类状态。

**当前状态（2026-08-21）**：P16 的 G14 clean-base 前置已满足，G15 已依据当前 renderer proposal/evidence 批准并进入实现。L50/L51 已完成：当前 9 分类、语言区、安装能力和 preserve list 已记录于 `docs/UX_UI_P16_RENDERER_PROPOSAL.md`；capture harness 新增独立 `--settings-states` 矩阵，offline、scanning、installing、partial、confirmed error 五种状态在 `1440×900`、`1280×800`、`900×800`、`760×800` 共 20 张 current-renderer 截图通过，20/20 diagnose 无页面横溢出。installing 通过真实 `CustomNodeInstallQueue` controller 进入 processing；error fixture 明确为 confirmed environment/compatibility error 与 repair/update recovery，不宣称真实 ComfyUI 失败。P16 已 `verified/integrated`，下一 phase 为 P17。

### P17 — Settings 分类、保存与扫描动作层级

**目的**：解决窄窗导航墙、保存组换行和语义不完整。

**工作**：

- 宽屏 sidebar 保持；<=900改 compact horizontal tabs/category popover，不显示3×3导航墙；
- 实现 tablist/tab/tabpanel、Arrow/Home/End、焦点和滚动保持；
- 页面级仅保留 dirty/discard/save；重新扫描归入 environment context；
- 保存/扫描期间局部 status 和 `aria-busy`，不整页抢焦点；
- 不修改 settings persistence、scan/service/install 业务逻辑。

**测试**：`settings-form`、`settings-selectors`、`settings-save-coordinator`、`settings-status`、`environment-refresh-coordinator`。

**Gate**：scan/save/discard/切分类/长表单输入；800/900首屏看到当前设置；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P17 已 `verified/integrated`。宽屏继续使用 9 分类 sticky sidebar；`<=900px` 改为单行、可横向滚动的 compact category strip，不再出现 3×3 或 9 行导航墙。Settings 分类补齐 `tablist`/`tab`/`tabpanel`、`aria-selected`、`aria-controls`、roving `tabindex` 和 Arrow/Home/End，切换后恢复当前 tab 焦点与页面滚动位置。页头仅保留 saved/unsaved、discard、save；rescan 移入“本机环境” action group，扫描和保存显示局部 status/`aria-busy`，现有 SettingsSaveCoordinator、EnvironmentRefreshCoordinator、CustomNodeInstallQueue、IPC、持久化和字段 selector 未变。新增 Settings accessibility markup test；900×800/760×800 keyboard smoke、1440×900/1280×800/900×800/760×800 current-renderer diagnose、offline/scanning/installing/partial/confirmed-error 20 状态截图与 `npm.cmd run verify`（87 files / 652 tests、production build、20 组对比度检查）通过。下一 phase 为 P18。

### P18 — Settings 内容层级、本地化与恢复反馈

**目的**：从 card catalogue 收敛为一个设置页面 + 独立对象，同时完成混文和状态反馈修复。

**工作**：

- section 用标题/留白/divider，只有安装实例、模型、节点等独立对象保留 card；
- 四张环境状态卡改紧凑 evidence strip/list；
- 模型 files/node/runtime 证据继续分开，不合并为单一“可用”；
- 硬编码简中、aria-label、title、error、recovery 全部进入 locale；
- 打开日志/目录/下载失败使用 error；安装、测试连接、扫描状态使用局部 live region；
- “强制终止”从默认主操作降级并隔离，保持真实危险语义。

**测试**：`i18n`、`settings-status`、`environment`、`dependency-scanner`、`node-install-queue`、`dependency-installer`，以及现有 Settings focused tests。

**Gate**：en-US/zh-CN/zh-TW 全分类；offline、多安装、在线验证、安装/更新、失败日志、服务启停；`npm.cmd run verify`。

**当前状态（2026-08-21）**：P18 已 `verified/integrated`。本机环境的四类扫描证据由并列卡片改为单列 evidence list，保留服务启动/重启、依赖下载、路径和状态；模型 files/node/runtime 证据仍按独立语义呈现。Settings 模型证据、硬件建议、组件说明、列表/标签分隔符已进入 `copy.ts` 的 zh-CN/zh-TW/en-US 文案层；`src/renderer/pages/settings`（排除 locale-backed copy catalog）无散落简体中文。扫描、连接测试、服务启停、环境修复、核心更新、节点/工作流/Python/加速安装和日志错误补齐局部 `status`、`aria-busy` 或 `alert` 反馈；强制停止改为隔离的 secondary destructive 区域，原有 selector、SettingsSaveCoordinator、EnvironmentRefreshCoordinator、CustomNodeInstallQueue、IPC、持久化和服务生命周期未变。当前 renderer 的 1440×900/1280×800/900×800/760×800 Settings 状态矩阵 20/20 diagnose 无页面横溢出，900×800/760×800 keyboard smoke 通过；`npm.cmd run verify` 为 88 files / 654 tests、production build、20 组对比度检查。状态矩阵使用 synthetic fixture，未把它写成真实 ComfyUI 生成结论；下一 phase 为 P19。

### P19 — CSS 所有权与重复规则收敛

**目的**：在视觉与交互已经稳定后，做无视觉变化的级联整理。

**工作**：

- 明确 token/base/shared component/page composition/responsive 的层级；
- 每个 selector 选择一个 canonical owner；
- 将 Create breakpoint 从 History CSS 移回 Create-owned CSS；
- Settings geometry 归入 Settings-owned CSS；History/Queue同理；
- 删除已被替代的旧覆盖与 `!important`，不再增加 `12-final-final.css`；
- 每一批只移动一个组件族，截图 parity 后再继续。

**不得做**：顺手改颜色、间距、功能或 DOM；发现需要视觉变化时另开 phase。

**Gate**：P00 全套 screenshot diff 无感知变化；重复 selector 和裸主题色指标明显下降；`npm.cmd run verify`。

**当前状态（2026-08-21）**：L61 已完成 `docs/UX_UI_P19_CSS_OWNER_MAP.md`，覆盖 shared shell、Create、Settings、History、Queue 的重复 selector 与 responsive ownership。G17 已批准首批 package；Create 1120/760px 响应式声明已从 `01`/`04` 移入 `07-create-composer.css`，Settings navigation responsive 声明、桌面 `.settings-layout`/`.settings-sidebar` 最终生效值、`.settings-panel`/`.settings-section` section shell 与 heading refinements，以及模型/组件/节点/问题 content cards 已归入 `06-settings-layout.css`；History heading、toolbar、gallery、album/masonry breakpoint 规则已归入 `11-history-curation.css`，History video inspector/stage refinements 与 image detail stage/version rail/responsive rules 已从 `01`/`02` 收回 `04-history-stage.css`；本轮将 Queue 页面、任务卡、输入预览和 Queue-only responsive rules 从 `01`/`02`/`05` 收回 `10-final-refinements.css`，共享 task/card/performance primitives 和语义 type/status rules保持在基础层，值、DOM、功能和媒体路径未变。Create 24 张 before/after 截图 SHA-256 集合一致；History 使用 8 条混合比例记录覆盖 video/image × masonry/album，在 1440/1280/1121/1120/901/900/761/760 宽度共 32 张 current-renderer capture，列数自适应与相册较小 tile 保持，document/body 无横溢出；History detail 在 1440/1280/900/760 四个宽度共 8 张 current-renderer capture，视频/图片构图、图片版本 rail 和详情响应式保持，预期的内部长文本截断保留；Queue `mixed`/`running`/`paused`/`failed`/`recoverable`/`empty`/`multiple-pending` 七状态 × 八宽度共 56 张 current-renderer capture 无 document/body 横溢出，900×800 与 760×800 running smoke 保持 progress/stage/elapsed/preview/telemetry 更新及 pause/cancel 可达；L64 删除 `11-history-curation.css` 中一个已确认重复的 album media override，其余 `!important` 经过 owner 复核后保留；四个 History fixture × 八宽度 capture、album interaction smoke 与 `npm.cmd run verify`（88 files / 654 tests、production build、20 组对比度检查）通过。P19 package/cleanup 已完成，下一步进入 P20/L65–L66 自动化 QA 与 screenshot manifest。

### P20 — 全量验证、契约同步与发布准备

**目的**：证明升级没有破坏功能，并形成下一版本的真实证据。

**自动化**：

- current renderer screenshot matrix；
- `npm.cmd run verify`；
- `npm.cmd run verify:markup-visual`（若受影响环境可用）；
- hardcoded locale、theme literal、current nav、accessible name 静态检查；
- 固定 viewport screenshot matrix。

**手工完整路径**：

1. Create 三模式连续输入、撤销、拖放、提交；
2. Queue start/pause/resume/cancel/reorder/recover/live preview；
3. History filter/layout/hover/open/delete/return；
4. 视频和图片详情 viewer/version/file actions/continue/upscale/lightbox；
5. Settings offline scan/multi-install/save/discard/install/update/service/logs；
6. 应用正常关闭、活动任务确认、强制关闭、外部 ComfyUI 保留；
7. 1440/1280/900/760、100/125/150%、三语言、高对比度、Reduced Motion；
8. loading/empty/offline/partial/error/disabled/focused/busy；
9. 仅键盘完成 Create → Queue → History → Detail → Continue。

**文档与版本**：

- 同步 `UX_CONTRACT`、renderer baseline 和 implementation status；只有单独维护历史 prototype 时才更新 prototype README，并继续标记 historical；
- 只有实际运行过的路径写“passed”，静态检查写“static validation passed”；
- 集成 agent 根据最终范围决定 patch/minor，不允许各 phase 独立 bump；
- 若发布，统一更新 `package.json`、lockfile、README 与 `CHANGELOG.md`。

**完成定义**：所有 phase 均为 `integrated`；没有未归属的视觉覆盖；没有用“稍后统一修”掩盖的阻塞问题；所有未验证项有 owner 和明确后续计划。

**当前状态（2026-08-21）**：P20/L65–L66 自动化交付已完成。当前 renderer 生成了 zh-CN 全量 18 fixture × 8 viewport（136 张）、en-US/zh-TW 各 18 fixture × 2 关键 viewport（各 36 张）、Settings offline/scanning/installing/partial/error × 4 viewport（20 张）以及 125%/150% × 18 fixture（36 张）manifest；P20 产物记录在 `docs/UX_UI_P20_QA_REPORT.md` 和 `docs/UX_UI_P20_SCREENSHOT_MANIFEST.json`。150% 复核发现的 Create 摘要页面级横溢出已在 `07-create-composer.css` 的窄屏 owner 规则中修复，并由 focused token test 锁定；修复后 Create、Queue、History、Details、Settings 的 document/body 宽度在 150% canary 中一致。版本按可见 UX bug fix 升为 `0.40.1`。`npm.cmd run verify`（88 files / 656 tests、production build、20 组对比度检查）和 `npm.cmd run verify:markup-visual` 通过；synthetic renderer evidence 不替代真实 ComfyUI 生成。当前只剩 G18：用户/集成 owner 的真实运行态、完整键盘路径、系统高对比度/Reduced Motion、关闭生命周期和最终发布结论。

## 8. 跨 Phase 回归矩阵

| 变更类型 | 必查相邻行为 |
| --- | --- |
| tokens / shared CSS | Create、Queue、History、Settings、两种 Details、dialogs、lightbox |
| renderer refresh | 连续输入、selection、scroll、active media、form dirty state |
| Create layout | 三模式、拖放、清空恢复、queue payload |
| Queue layout | running/paused/failed、reorder、preview、telemetry patch |
| History layout | video/image、masonry/album、filter/delete、return focus |
| Detail layout | single/multi version、missing media、file actions、continue handoff |
| Settings layout | offline、多安装、scan、save、install/update、service、logs |
| notifications | 并发、去重、error persistence、actions、screen reader announcement |
| focus/keyboard | Tab order、Enter/Space、Arrow/Home/End、Escape、return focus |
| i18n/type | en-US、zh-CN、zh-TW、长路径、125/150% 缩放 |

## 9. Agent 交接模板

每个 agent 的最终 handoff 必须包含：

```text
Phase:
Base commit / worktree:
Owned files:
Preserve list:
Renderer baseline / approved evidence:
Files changed:
Behavior intentionally changed:
Behavior explicitly preserved:
Focused tests run:
Full verify result:
Manual runtime checks:
Screenshots / viewport evidence:
Static-only evidence:
Unverified / blocked:
Unexpected dirty files:
Recommended next phase:
```

建议给实现 agent 的任务描述必须明确：

- 只完成一个 Phase；使用 Luna 时只完成一个 `Lxx` package；
- 不自行扩展到下一 Phase/package；
- current renderer、fixture 和 approval artifact 的 source of truth；prototype 仅作历史参考；
- 可编辑/不可编辑文件；
- focused tests 和完整 gate；
- 如果目标文件发生变化，停止并回报，不重放旧 patch。

## 10. 集成与回退规则

- 一个 phase 一个提交；提交信息包含 `Pxx`；
- 集成前先 rebase/merge 最新基线并重新运行本 phase gate；
- shared CSS phase 与 page phase 不交错合并；
- 失败时回退整个 phase，不用新的尾部 override 掩盖回归；
- 任何 persisted state、IPC、workflow 或 runtime 变化都视为越界，除非用户批准新的独立计划；
- renderer proposal 未批准、full verify 失败、运行态 smoke 缺失、焦点丢失、横向滚动或功能路径变化，任一项均阻止进入下一 phase；
- 文档、截图和测试属于 phase 交付物，不是可选收尾。

## 11. 建议的执行批次

为了控制集成压力，建议按以下批次交给其他 agent：

1. **Batch A — renderer 基线与视觉方向**：P00–P01；只改文档、fixture/evidence，不改生产 renderer。
2. **Batch B — 视觉基础设施**：P02–P05；单一 shared CSS/shell owner，严格串行。
3. **Batch C — 恢复与核心创作**：P06–P08；notification owner 与 Create owner 可分别准备，串行合并。
4. **Batch D — 运行监控**：P09–P10；Queue 单一 owner。
5. **Batch E — 历史与详情**：P11–P15；History hotspot 单一 owner，按顺序完成。
6. **Batch F — Settings**：P16–P18；等待当前 Settings/runtime 工作稳定，由单一 owner 实现。
7. **Batch G — 收敛与发布**：P19–P20；集成 agent 负责，不再分散给页面 agent。

任何 Batch 都不能因为“下一个 agent 已经空闲”而跳过前一 Batch 的 gate。真正的完成标准是每一步都保持应用可运行、可操作、可回退，而不是尽快让所有页面看起来不同。
