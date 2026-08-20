# UX/UI P00 当前 renderer 基线

> 状态：`verified`（renderer capture baseline）。这是当前 UI 的唯一视觉基线；`prototypes/` 只作为历史参考，不作为设计批准或实现证据。

## 来源与边界

基线直接来自真实 renderer 入口和当前 CSS，而不是 `prototypes/preview/`：

- 入口：`src/main.ts` → `src/renderer/`；
- 样式：`src/style.css` → `src/styles/`；
- 页面：Create、Queue、History/Details、Settings；
- 源 commit：`f4653727004e6d4cc2be1ceb7d8b4d0e749bf560`；
- 源版本：`0.30.2`（以 `package.json` 为准）；
- manifest：[`ux-ui-renderer-baseline.manifest.json`](./ux-ui-renderer-baseline.manifest.json)。

manifest 的 source commit 是本轮 rebase 的基准 commit；最新 136 张截图来自同一工作树，包含 P02 语义 token 别名、P03/L10 shared surface 迁移、P03/L11 text/separator 迁移、P03/L12 action/focus 迁移、P03/L13 status/badge 语义迁移、P03/L14 brand/nav shell 迁移、P03/L15 panel/elevation 迁移、P05 `aria-current` 语义和 P08 Image Edit 窄窗规则。L14 移除了顶栏、品牌标记和活动导航的装饰性 glow，保留活动导航的背景、边界与下划线反馈；L15 移除了普通 panel 的装饰性阴影，同时保留 dialog、popover、tooltip、context menu、lightbox、confirm、cropper 和 asset-library 等 overlay elevation；因此这组截图记录了当前版本 `0.30.2` 的可见 shell 与 panel/overlay 材质差异，而不再是 L13 的 zero-visual-diff 证据。后续 renderer CSS 变更后应重新生成并更新基准记录。

截图 harness 使用临时 userData、mock preload 和合成 fixture，只读取当前 renderer，不读取或修改用户任务、历史记录、设置或模型文件。因此它证明的是当前 renderer 在固定状态下的视觉/DOM基线，不等同于 ComfyUI 运行态 smoke。

## 重新生成

先在一个终端启动 Vite，再在另一个终端运行真实 renderer capture：

```text
npx.cmd vite --host 127.0.0.1 --port 5173 --strictPort
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs
```

只检查矩阵，不启动 Electron：

```text
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --dry-run
```

检查当前语义文字在四类 renderer surface 上的对比度：

```text
npm.cmd run verify:ux-ui-contrast
```

局部检查可追加 `--fixture create-image-edit --viewport 900x800 --diagnose`；输入/焦点 smoke 使用 `--smoke --fixture create-image-edit --viewport 900x800`。

输出目录为 `temp/ux-ui-baseline/renderer/`，被 `.gitignore` 忽略。当前已捕获 `136` 张 PNG，视口尺寸严格匹配 manifest。

## 视口与状态矩阵

| 组 | 视口 |
| --- | --- |
| 标准 | `1440×900`、`1280×800`、`900×800`、`760×800` |
| 断点 | `1121×800` / `1120×800`、`901×800` / `900×800`、`761×800` / `760×800` |

已覆盖的当前 renderer fixture：

- Create：图生视频、视频续写、图片编辑；
- Queue：合成 waiting + failed；live running 仍需独立运行态 smoke；
- History：视频/图片 × masonry/album；
- Details：视频详情、图片详情；
- Settings：system、acceleration、video、image、nodes、prompt、upscale、logs。

P16 另有独立的 `settingsStateFixtures`，不计入上述 136 张 baseline：运行 `npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --settings-states --diagnose` 可捕获 offline、scanning、installing、partial、confirmed error 五种 Settings 状态在标准四视口下的 20 张隔离证据。它们用于 Settings review，不替代真实 ComfyUI、安装 subprocess 或 runtime smoke。

## 当前 UI 观察与 preserve list

当前基线呈现的是深色近黑画布、蓝色 action/accent、真实媒体主导的 Create/History/Details，以及蓝色反馈和状态层。后续升级可以改善层级、密度、键盘和恢复路径，但必须以这些真实页面的 DOM、断点和可见行为为起点，不得把旧 prototype 的暖石墨方案直接迁移进 renderer。

必须保持：

- Create 三种模式、草稿输入、选择/拖放、undo/redo、清空恢复和队列提交语义；
- Queue 的顺序、运行/暂停/继续/取消/恢复/重排、预览和单 GPU 重任务策略；
- History 的视频/图片分类、masonry/album、封面/hover preview、版本关系、删除和路径恢复；
- 视频/图片详情的 viewer、版本轨、Lightbox、文件动作、继续编辑和 handoff；
- Settings 的离线扫描、多安装、服务生命周期，以及 model/node/runtime 的证据分层；
- 当前 focus、selection、dirty state、IPC、persisted state、workflow 和用户数据。

## 证据边界

- 已验证：renderer capture 脚本、manifest、136 张固定尺寸截图、当前页面与断点的静态视觉基线、P03/L11 的 20 组文字/背景对比度检查、P03/L12 的 action/focus token selector 静态检查，以及 P03/L13 的四状态 status/badge selector matrix。
- 尚未由本基线证明：ComfyUI 真实生成、队列长生命周期、文件权限/路径恢复、全键盘路径、Windows 缩放/高对比度和 Reduced Motion。
- prototype 的旧 P00/P01 截图与暖石墨候选已降级为历史记录；它们不能作为后续 phase 的 approval gate。
