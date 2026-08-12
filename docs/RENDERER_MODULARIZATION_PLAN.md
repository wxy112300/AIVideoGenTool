# Renderer 模块化迁移计划

## 目标

逐步把 Renderer 从单一的 `src/main.ts` 拆成按页面和职责组织的模块，同时保持现有 Electron 应用在每个合并点都可以启动和使用。

本计划只处理 Renderer 结构，不改变：

- IPC channel 和 preload API；
- `AppState`、队列、历史和设置的持久化结构；
- 工作流构建、模型路由和 ComfyUI 执行逻辑；
- 当前页面的交互、文案和视觉样式。

本地化暂不迁移文案。模块上下文会提前暴露 Translator，后续可以逐页接入翻译，而不需要再次调整模块边界。

## Phase 0 基线

基线日期：2026-08-12。

当前工作树在建立计划时没有未提交改动。当前 Renderer 的主要事实如下：

- `src/main.ts` 约 9,032 行、约 478 KB。
- `Page` 包含创建、队列、历史列表、视频历史详情、图片历史详情和设置六类路由。
- `render()` 同时负责保存历史视图状态、停止媒体、销毁 observer、生成页面 HTML、重新绑定事件和恢复播放状态。
- `bindCreate()`、`bindQueue()`、`bindHistory()`、`bindSettings()` 既处理 DOM 事件，也直接修改全局 Renderer 状态并调用 IPC。
- `onStateChanged`、任务预览、窗口关闭、历史迁移、素材库进度和加速安装日志都在入口文件中订阅。
- 创建草稿保存、图片草稿保存、设置草稿、弹窗焦点、历史滚动、媒体播放和性能轮询都依赖入口文件中的共享变量。
- UI 文案目前直接散落在页面模板、动态状态、错误提示、`aria-label`、`title` 和 placeholder 中。
- `src/core/i18n.ts` 已存在，但目前只被任务状态标签实际使用。

### 主要风险

1. 页面模块之间通过全局变量隐式通信。
2. 全页 `innerHTML` 重绘会影响焦点、输入选区、滚动位置和媒体播放。
3. 异步 IPC 回调可能在页面已经切换后继续更新旧 DOM。
4. 多个 agent 如果同时编辑 `src/main.ts`，会产生高概率冲突。
5. 把共享逻辑直接搬到一个新的“大 Context”会复制当前的耦合问题。

## 不可破坏的行为

以下行为在每个阶段都必须保持：

- 草稿输入期间，IPC 状态刷新不能覆盖本地正在编辑的草稿。
- 草稿保存仍然使用 revision 和 debounce 保护，队列快照不随草稿修改。
- 已入队任务保持完整、不可变的执行参数。
- Queue 的任务移动、取消、重试、删除和预览继续工作。
- History 的封面加载、视频 hover 预览、播放器、版本切换、滚动位置和返回导航继续工作。
- 图片项目的版本链、继续编辑、继续生成视频、设置封面和删除确认继续工作。
- Settings 的草稿、放弃更改、环境扫描、服务控制、安装日志和窗口关闭确认继续工作。
- Modal 的焦点进入、焦点恢复、键盘关闭和确认操作继续工作。
- 全局粘贴、拖放、窗口关闭和 Renderer 错误上报继续工作。
- Renderer 不直接访问任意本地文件或启动进程，特权操作仍通过 preload IPC。

## 目标结构

```text
src/
  main.ts                         # 启动入口
  renderer/
    app.ts                        # 状态订阅、渲染协调和生命周期
    context.ts                    # 页面可使用的最小依赖接口
    router.ts                     # 路由和导航命令
    renderer-state.ts             # Renderer 临时状态
    shell.ts                      # 应用壳、导航和全局弹窗
    shared/
      dom.ts                      # escapeHtml 等 DOM 工具
      icons.ts                    # Lucide 图标注册和渲染
      formatters.ts               # UI 格式化函数
      focus.ts                    # 焦点和键盘辅助逻辑
      modals.ts                   # 通用弹窗生命周期
      notifications.ts             # flash message 和错误展示
    pages/
      create/
      queue/
      history/
      settings/
```

页面模块采用显式的 render/mount 边界：

```ts
interface PageModule {
  render(context: PageRenderContext): string;
  mount(root: HTMLElement, context: PageContext): () => void;
}
```

`mount()` 必须返回清理函数。页面模块可以使用当前页面所需的服务，但不能 import `src/main.ts`，也不能直接修改其他页面的状态。

Context 只提供稳定的应用能力，例如当前状态、`window.studio`、导航、通知、请求重绘和 Translator。页面专属的临时状态由对应页面控制器持有。

## 精简后的五个阶段

### Phase 0：基线和迁移契约

本阶段只新增本计划文档，不修改运行时代码。

交付物：

- 当前职责和风险清单；
- 不可破坏行为清单；
- 目标目录和模块依赖方向；
- 多 agent 文件所有权规则；
- 后续阶段的验证门槛。

验证：`git diff --check`。文档阶段不运行 Electron，不改变应用行为。

### Phase 1：Renderer 基础设施

新增 `src/renderer/` 的 Context、Renderer 状态、路由、应用壳和共享工具。

这一阶段先让旧页面继续运行。`src/main.ts` 可以通过兼容适配器调用旧的 render/bind 函数，不能在基础设施未完成时删除旧实现。

交付标准：

- 新入口可以获取初始状态并订阅 IPC；
- 路由和全局事件只有一个所有者；
- Translator 已作为 Context 能力注入，但不迁移现有文案；
- TypeScript 检查和应用启动通过。

### Phase 2：低风险页面和通用能力迁移

把共享弹窗、通知、图标、格式化、Queue 和 Settings 迁移到独立页面模块。Queue 作为第一个完整迁移样板，Settings 作为异步表单和服务操作样板。

每个页面内部仍可使用现有字符串模板和整页渲染，不做视觉或交互重写。旧入口函数只保留兼容转发，待新模块验证后删除。

交付标准：

- Create、Queue、History、Settings 都仍可导航；
- Queue 的运行、暂停、取消、移动、重试和预览正常；
- Settings 的保存、放弃、扫描、日志和服务控制正常；
- 输入焦点和设置草稿不被无关刷新覆盖。

### Phase 3：复杂媒体和创建页面迁移

把 History 的列表、详情、播放器、封面、Lightbox，以及 Create 的视频、图片、Prompt、参考媒体和拖放逻辑迁移到各自模块。

这一阶段内部按可回滚的小批次合并，但不再单独增加顶层 Phase：

1. History 列表和详情；
2. History 媒体生命周期和 Lightbox；
3. 视频 Create；
4. 图片 Create 和图片详情。

交付标准：

- 历史视频和图片的播放、版本切换、继续创作、继续编辑和删除正常；
- 创建页的输入、拖放、粘贴、Prompt 版本、Seed、参数编辑和加入队列正常；
- 页面切换后旧 observer、timer 和事件监听器全部清理；
- 媒体播放状态、历史滚动位置和 Modal 焦点不丢失。

### Phase 4：收口、清理和回归

删除 `src/main.ts` 中已经没有调用者的页面函数和全局状态，保留入口启动、应用组装、全局错误上报和必要的生命周期协调。

最终目标：

- `src/main.ts` 只负责启动 Renderer 应用；
- 页面模块之间没有循环依赖；
- 新增功能不需要修改多个无关页面文件；
- 新 UI 文案可以通过 Context 的 Translator 接入；
- CSS 仍可暂时保持现状，待结构稳定后再单独拆分。

验证：完整 typecheck、测试、生产构建和 Electron 手动回归。

## 持续可运行规则

1. 新模块先创建，再接入入口；旧实现确认不再被调用后才删除。
2. 每次只切换一个页面或一个明确的生命周期边界。
3. 不允许留下缺失 import、未接线事件或半迁移的共享状态。
4. 每个阶段结束都必须能启动应用；不能用“下一阶段会补齐”作为合并理由。
5. 任何异步回调都必须检查当前页面或使用 AbortController，不能更新已经卸载的页面。
6. 全页重绘策略在迁移期间保持不变，局部 DOM 优化另行处理。
7. 不为迁移引入运行时 feature flag；兼容转发和小范围回滚足够覆盖本次风险。
8. 不修改 Electron IPC、持久化 schema、工作流 JSON 或模型行为。

## 多 agent 所有权

- 基础设施 agent 独占 `src/main.ts`、`src/renderer/app.ts`、`context.ts` 和 `router.ts`。
- Queue agent 只修改 `src/renderer/pages/queue/` 及对应测试。
- History agent 只修改 `src/renderer/pages/history/` 及对应测试。
- Settings agent 只修改 `src/renderer/pages/settings/` 及对应测试。
- Create agent 只修改 `src/renderer/pages/create/` 及对应测试。
- `src/style.css` 在 Phase 4 之前由单一 owner 管理，不与页面迁移并行拆分。
- 需要修改入口接线时，由基础设施 owner 统一完成，页面 agent 提供明确的 mount/render 接口，不直接改入口。

## 发布影响

Phase 0 是文档和内部架构规划，属于内部维护变更，不改变用户可见能力、IPC 或持久化契约，不需要版本升级。后续纯模块迁移同样按内部重构处理；只有行为、数据或公开能力发生变化时，才重新评估版本影响。
