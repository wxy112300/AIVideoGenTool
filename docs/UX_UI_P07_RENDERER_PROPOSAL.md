# P07 当前 renderer 的 Create 窄窗口构图提案

状态：`proposed`，等待 G08 人工/强模型批准。本文只基于当前 `src/renderer/`、`src/styles/` 和真实 renderer fixture；不使用 `prototypes/` 的旧设计，也不在本 package 修改生产 renderer。

更新日期：2026-08-20；当前 package version：`0.31.2`。

## 1. Source map 与 preserve list

当前三种创建模式都由同一套 shell 和 Create page 入口提供：

- 图生视频、视频续写：`src/renderer/pages/create/page.ts` 的 `renderCreatePage`；
- 图片处理：同文件的 `renderImageEditPage`；
- 两者都输出 `.create-page-heading` → `.create-workspace`，workspace 的 DOM 顺序是 `.media-panel` 后 `.composer`；
- Prompt 控件、素材控件、`data-*`、现有 `id`、队列提交 controller 和 workflow payload 都属于 preserve surface。

必须保持：

1. 三种模式切换后各自草稿、Prompt 版本、素材选择和 focus 不丢失；
2. 素材选择、click-to-select、drag/drop、Clipboard、清空恢复和错误就地反馈继续可用；
3. `#prompt-input`、`#image-edit-prompt-input`、`#enqueue-image-edit`、默认 `#enqueue` 路径和相关 `data-*` 不改名；
4. 提交生成的 immutable queue snapshot、模型参数、输入素材归档和 workflow payload 不改变；
5. 760px 以下 topbar normal flow、P05 sticky offset 和全局通知层级保持现状。

## 2. Current renderer evidence

当前 renderer manifest 已登记三种 Create fixture：`create-image-to-video`、`create-video-extension`、`create-image-edit`，覆盖 1440×900、1280×800、900×800、760×800 及 1121/1120、901/900、761/760 断点。现有本地 capture evidence 位于被忽略的 `temp/ux-ui-baseline/renderer/`，P05 后的 shell smoke 位于 `temp/ux-ui-baseline/p05-smoke/1440x900/`；这些目录只是本地证据，不是提交的产品资源。

| 当前 fixture | 宽窗口（1280+） | 900px 当前观察 | P07 判断 |
| --- | --- | --- | --- |
| 图生视频 | 素材与 Prompt 双主区，左侧素材、右侧 Prompt | 通用 `.create-workspace` 在 max-1120 规则下堆叠；大素材/空态先占据首屏，Prompt 起始区与提交语境下移 | 901–1120/900 需要批准的紧凑双列；素材列先显示状态摘要，不让大 drop zone 独占首屏 |
| 视频续写 | 输入视频与续写 Prompt 双主区 | 输入视频预览/空态先占据主体，续写 Prompt 和错误反馈靠后 | 与图生视频使用同一窄窗构图规则，保留“输入视频摘要 → 续写 Prompt”语义 |
| 图片处理 | 参考图片与 Image Edit Prompt 双主区 | 当前 `10-final-refinements.css` 已让 `.image-edit-workspace` 在 max-1120 维持 `minmax(250px, .72fr) minmax(0, 1.28fr)`，900px 仍能同时看到参考图和 Prompt | 作为当前 renderer 的可行 canary；只把已验证的紧凑列宽和 safe-area 规则扩展到其他 Create 模式 |

证据说明：标准 capture harness 在本轮尝试中仍会遇到 `loadURL` 后单次 `executeJavaScript` DOM wait 超时；这与之前记录的 route-after-click wait race 一致，不能当作产品失败。G08 前仍必须用同一 Vite renderer 和隔离 preload 重新跑三 fixture 的真实截图/DOM diagnose，不能只凭旧截图或静态 CSS 通过。

## 3. Proposed composition decision

### 1280px 及以上：保留当前双主区

- `.create-workspace` 保持素材列在左、Prompt/参数列在右；
- 不移动 DOM，不引入新的视觉主题或装饰层；
- sticky submit 继续属于 composer，但必须为其底部渐变和错误文本保留可计算的 safe area，不能覆盖 textarea、Prompt error 或最后一个表单控件。

### 901–1120px 以及 900px canary：批准紧凑双列

P07 选择“紧凑双列”方案，而不是在窄窗把 Prompt 视觉顺序移到素材完整管理之后。这样可以保持当前 DOM/Tab 顺序，同时让首屏并列出现素材状态、Prompt 起始区和提交上下文。

- workspace 使用与当前 Image Edit canary 相同的约束方向：左列 `minmax(250px, .72fr)`，右列 `minmax(0, 1.28fr)`；具体值在 P08 实现时仍需以三模式截图和最小可读宽度复核；
- 素材列的首屏对象是“当前素材摘要”：输入类型、已选数量、文件名/时长或 slot 角色和一个主要替换/选择入口；完整 drop zone、参考列表和高级编辑控件可在摘要下方继续展开；
- Prompt 列从 heading、版本/模式、编辑器第一行和就地错误开始，不改变 Prompt 控件 id；
- 提交条的错误文案、清空和加入队列仍在 composer 的原有语义位置，底部 sticky 只负责可达性，不覆盖 Prompt 或错误；
- 三种模式共用 breakpoint 语义，但保留各自的输入文案、slot 角色、Prompt 版本和模型参数，不把 Image Edit 的 payload 规则套到视频模式。

### 761–900px 的连续缩放与 760px 以下

- 761–900px 继续以紧凑双列作为批准候选，重点检查 761、800、900、926、960px 的列宽、长路径和中英文/繁中文案；
- 760px 以下沿用当前 topbar normal flow 和单列 fallback。此时完整素材管理可以纵向展开，但首段必须保留当前素材摘要，提交条需要额外 bottom safe area；
- 禁止用 `min-width`、负 margin 或 body overflow 把横向滚动隐藏起来；`scrollWidth` 必须等于 renderer viewport，控件文字允许换行或省略。

## 4. Keyboard and state order

紧凑双列保留当前 DOM 顺序：模式切换 → 素材摘要/素材控件 → Prompt heading/编辑器 → 参数 → submit。视觉排列必须与该顺序一致，避免用 CSS `order` 制造视觉顺序与 Tab 顺序分离。

需要在 G08/P08 smoke 中逐项检查：

- 连续输入和 selection 不因 state refresh 重建而丢失；
- Ctrl+Z、Ctrl+Y、Ctrl+Shift+Z 仍作用于当前 Prompt；
- clear 后能恢复到可编辑状态；
- drag/drop、click-to-select、Clipboard 和模式切换保持 focus/selection；
- disabled/error/available 的 submit 状态在 sticky rail 上仍可读；
- 双击提交只产生一个 queue action，切到 Queue 后任务 snapshot 不受后续草稿编辑影响。

## 5. G08 approval checklist

G08 只有在以下证据齐全后才可标记 `approved`：

1. 三种 fixture 在 1440×900、1280×800、1121×800、1120×800、901×800、900×800、761×800、760×800 均有当前 renderer 截图；
2. 900×800 首屏同时可见当前素材状态、Prompt 起始区和提交上下文；
3. sticky submit 不覆盖 Prompt textarea、`[data-enqueue-feedback]`、disabled reason 或最后一个可见表单控件；
4. `document.documentElement.scrollWidth === document.documentElement.clientWidth`，并记录最宽 DOM 元素；
5. 三模式的 Tab 顺序与视觉顺序一致，mode switch、输入、清空、drag/drop、submit 和 double-click guard smoke 通过；
6. focused Create tests、`npm.cmd run verify` 通过，且明确哪些结论是静态/fixture smoke，哪些尚未由真实 ComfyUI 生成证明。

## 6. Non-goals for P07

- 不在 proposal package 修改 `src/renderer/`、`src/styles/`、workflow JSON、queue state machine 或 IPC；
- 不把旧 prototype 的暖石墨配色、按钮、文案或布局顺序当作候选实现；
- 不借机重做 Create 的 Prompt 助手、素材库、模型选择或提交逻辑；
- 不因当前截图 harness 的等待竞态声称运行态生成成功或失败。
