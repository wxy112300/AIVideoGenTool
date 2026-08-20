# P16 当前 Renderer Settings 结构提案

日期：2026-08-21

状态：`evidence complete / G15 approval pending`。本 phase 只盘点当前 renderer、补隔离 fixture 和记录结构提案；没有修改 Settings 生产 renderer、runtime、IPC 或持久化行为。当前应用版本为 `0.38.0`。

## 来源与边界

本提案只使用当前 `src/renderer/`、`src/styles/`、Settings controller/view-model、当前 renderer manifest 和真实 Vite/Electron capture。`prototypes/` 中的旧设计不参与结构判断或批准证据。

当前 Settings 的生产入口为 `src/renderer/pages/settings/page.ts`，状态选择由 `src/renderer/pages/settings/view-model.ts` 和 `src/renderer/pages/settings/selectors.ts` 负责，扫描/保存/安装分别由现有 coordinator 与 controllers 负责。

## 当前 DOM 骨架

```text
.settings-page
├─ .settings-heading
│  ├─ title + optional GPU summary
│  └─ saved/unsaved + rescan + discard + save
└─ .settings-layout
   ├─ nav.settings-sidebar
   │  └─ 9 × button.settings-tab[data-settings-tab]
   └─ .settings-content
      └─ one active settings panel
└─ install-guide-dialog (when a model component needs an install guide)
```

现有 9 个分类和真实职责如下：

| id | 当前分类 | 已实现内容 | 主要状态依赖 |
| --- | --- | --- | --- |
| `system` | 系统与路径 | 界面语言、本机环境、ComfyUI 版本兼容、安装实例选择、路径应用、环境问题修复 | offline scan、multi-install、service/runtime |
| `acceleration` | 性能与加速 | H3 策略、ComfyUI Python 选择、Python/Torch/CUDA/Sage/Triton evidence、安装/修复日志 | scan、GPU、dependency install |
| `video` | 视频模型 | 默认视频/续写模型、Sulphur 2 部署、模型组件扫描与安装指引 | model scan、workflow/runtime |
| `lora` | LoRA | 视频 LoRA 选择、Turbo 说明、扫描结果 | model scan |
| `image` | 图片模型 | 默认图片模型、质量、批量数量、组件扫描 | model scan、image workflow |
| `nodes` | 节点与工作流 | H3/Qwen core、workflow dependency、custom node catalog、批量安装、单项队列和日志 | compatibility、install queue、restart/rescan |
| `prompt` | 提示词扩写 | 本地模型、runtime dependency、模型启动/释放、H3/图片 preset | model scan、Python/runtime、service |
| `upscale` | 分辨率提升 | 默认超分模型、权重与组件 evidence | model scan |
| `logs` | 运行日志 | 日志刷新、日志/崩溃目录、留存和记录数、terminal | app log IPC |

“界面语言”是 `system` 内的已实现区域，不是第二套页面导航；安装指引是当前页面级 modal，不应被提案误读为新的分类。

## 状态盘点

| 状态 | 当前 renderer 表现 | 证据边界 | 后续归属 |
| --- | --- | --- | --- |
| 未扫描/首次进入 | environment empty + rescan instruction；分类内容显示 waiting | current renderer static/fixture | 保留现有状态源 |
| 扫描中 | spinner、扫描文案、rescan disabled，模型分类显示 scanning | synthetic pending scan | P17 只改善 action/busy 语义，不改 coordinator |
| offline scan complete | 能显示扫描时间、路径和文件证据；ComfyUI stopped 不等于文件全部 missing | synthetic empty scan + current selectors | P18 继续校正文案和 evidence hierarchy |
| partial | 多安装、版本、GPU、可选 warning、ready/missing model/node evidence 同时出现 | synthetic scan payload | P18 内容层级/evidence strip |
| installing | custom node 使用现有 `CustomNodeInstallQueue`，卡片显示 processing，按钮 disabled | synthetic missing node + held install promise | P17/P18 只改善可见 busy/log，不改队列 |
| confirmed error | ComfyUI/API、GPU 或 compatibility issue 使用 error tone，并保留 repair/update recovery | synthetic confirmed issue/compatibility error；不是实际 ComfyUI 运行声明 | P18 error/recovery/i18n |
| service/runtime dependent | start/restart/force-stop、`/object_info`、online compatibility、安装后重启复检 | 需要真实本机服务或安装动作 | 不在 P16/P17 改 runtime |
| saved/dirty | page heading 显示 saved/unsaved，discard/save 由现有 save coordinator 控制 | current renderer + save tests | P17 保持动作层级和 coordinator |

模型卡的 files、custom-node package 和 runtime validation 已由 selector 分开计算：文件完整但 runtime pending 仍可保持静态 ready；只有确认缺文件、缺节点或 online check 失败才降为 error。这个语义不能在视觉重排时合并成一个“可用”字段。

## Current renderer evidence

标准 Settings 分类已经在 `1440×900` 捕获了 `system`、`acceleration`、`video`、`image`、`nodes`、`prompt`、`upscale`、`logs`，并覆盖了原有 baseline 的 9 分类入口。

P16 新增独立状态矩阵，不改变原有 136 张 baseline 的计数：

```text
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --settings-states --diagnose
```

结果为 `5 states × 4 viewports = 20` 张隔离截图，视口为 `1440×900`、`1280×800`、`900×800`、`760×800`，输出位于被忽略的 `temp/ux-ui-baseline/renderer/settings-states/`。20/20 的 document/body diagnose 均满足 `scrollWidth === clientWidth`。

状态 fixture 与证据如下：

| fixture | 初始分类 | 验证内容 |
| --- | --- | --- |
| `settings-state-offline` | system | ComfyUI stopped、空扫描结果、保存与 rescan action |
| `settings-state-scanning` | system | pending scan spinner、局部 busy action |
| `settings-state-installing` | nodes | 实际 queue snapshot 的 installing phase、节点按钮 disabled、日志入口 |
| `settings-state-partial` | system | 多安装、路径、GPU、optional warning、部分 compatibility/model evidence |
| `settings-state-error` | system | confirmed environment/compatibility error、repair/update recovery |

这些 fixture 通过 URL 选择初始扫描状态，避免 renderer bootstrap 的 startup scan 把状态覆盖；installing fixture 通过真实 `data-install-node` controller 进入队列，而不是直接伪造 DOM 文案。

## 观察结论

1. 宽屏 `1440/1280` 的 sidebar + 单一内容列是稳定且可读的当前结构，9 个分类没有必要因为旧 prototype 而改名或合并。
2. `900px` 当前 sidebar 变成 3×3 分类墙；`760px` 变成 9 行纵向分类墙。它们都没有文档横溢出，但会把当前 panel 推到首屏下方，导航本身成为 Settings 的主要视觉主体。
3. 目前 page heading 的 saved/unsaved、rescan、discard、save 同组呈现。保存动作属于页面级 dirty lifecycle，rescan 属于 environment context；P17 应在不改 handler/payload 的前提下把两者分组。
4. 当前内容 panel、安装实例、模型、节点和日志的边界仍可作为 P17/P18 的 preserve list。P16 不提前做卡片去嵌套、环境 evidence strip、locale inventory 或颜色重构。
5. acceleration 和长路径场景仍有少量内部文字压缩/省略证据；这属于 P18 内容/i18n/局部 field layout，不应在 P16 通过扩大页面导航或改变全局字体解决。

## P17 推荐结构

### 宽屏（>900px）

- 保留当前 sticky `settings-sidebar`、9 个分类和 active highlight；只补完整 tab semantics。
- `settings-content` 继续只渲染一个 active panel，不改变 panel 内控件顺序和 data selector。
- heading 保留 saved/unsaved、discard、save；rescan 视觉上移入 system/environment action context，仍调用同一个 `runEnvironmentScan`。

### 中窄屏（<=900px）

- 用单行、可横向滚动的 compact category strip 替代 3×3/9 行导航墙；不换成第二个 page navigation，也不复制 active panel。
- 保留分类计数和 nodes update dot；不可见的横向 tab 仍可通过键盘和滚动到达。
- 760px 下仍保持单行 compact control，保存动作必须在首屏标题区可达；内容 panel 紧接其后。
- 如果人工 G15 更偏好 popover，可在同一 preserve list 下替换为 category popover；无论采用哪种呈现，都不得恢复多行导航墙。

### 交互语义

- `settings-sidebar`/compact strip 使用 `tablist`，每个分类按钮使用 `role=tab`、`aria-selected`、`aria-controls`，active panel 使用 `role=tabpanel` 和稳定 id。
- 使用 roving `tabindex` 与 Arrow/Home/End；切换分类后保留页面滚动位置，不重置输入焦点或 dirty draft。
- 扫描/保存期间只更新局部 busy/status 和 `aria-busy`，不把焦点抢到页面顶部。

## Preserve list

- 保留 9 个 `data-settings-tab` id、当前 `settingsTab` 状态和分类 copy。
- 保留 `#scan-environment`、`#discard-settings`、`#save-settings`、所有 field id、`data-install-*`、`data-repair-*`、`data-select-comfy-install` 和日志 selector。
- 保留 SettingsSaveCoordinator、EnvironmentRefreshCoordinator latest-wins、CustomNodeInstallQueue、service lifecycle、安装指引 modal 和 app-log IPC。
- 不改 settings schema、默认值、迁移、ComfyUI 路径、安装/更新 subprocess、队列快照、model catalog 或 workflow payload。
- 不把离线 scan、connected service、selected installation 和 discovered installations 合并为一个状态。
- 不把 prototype screenshot、暖色方案、旧 tab 布局或未运行的 ComfyUI fixture 当作生产实现依据。

## G15 acceptance gate

- `1440×900`、`1280×800`：sidebar 保持 sticky，内容列起点稳定，heading actions 可达。
- `900×800`：不再出现 3×3 导航墙；当前 panel 在首屏进入，scan/save/discard/save 仍可达。
- `760×800`：不再出现 9 行分类墙；compact category control 单行可滚动或 popover 可达，页面无横向溢出。
- 键盘可以完成分类切换并保留焦点；连续输入、dirty draft、save/discard 和 scan latest-wins 不回归。
- P17 只执行分类/保存/扫描动作层级；P18 再执行内容层级、本地化、evidence strip 和恢复反馈。

## Handoff

- Base：`53e98aa`（P15，`0.38.0`，`origin/main` clean）。
- P16 变更范围：`scripts/capture-ux-ui-renderer-baseline.cjs`、`docs/ux-ui-renderer-baseline.manifest.json` 与本 proposal；无 `src/` production renderer 变更。
- Static/current-renderer evidence：dry-run、20 张 Settings state captures、20/20 无页面横溢出 diagnose、代表性截图人工检查。
- 未验证：真实本机安装/更新、真实多 ComfyUI 选择持久化、真实节点安装 subprocess、transport failure 的 retry policy；这些属于 runtime/manual gate。
- 推荐下一步：G15 批准本 proposal 后进入 P17，先实现 tab roles，再实现 <=900 compact category strip，最后拆分 rescan 与 save action group。
