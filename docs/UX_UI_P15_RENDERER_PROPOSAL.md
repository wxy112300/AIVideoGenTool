# P15 当前 Renderer 详情层级提案

日期：2026-08-21

状态：已按当前 renderer 实现并通过 P15 gate；版本升至 `0.38.0`，下一 phase 为 P16。

## 来源与证据

本提案只针对当前 `src/renderer/` 与 `src/styles/`，不使用 `prototypes/` 作为设计来源。

- `video-detail` 与 `image-detail` 的 1440×900 当前 renderer capture 显示：viewer 与右侧 inspector 分栏清楚，但 inspector 内的 6–8 个动作使用相同按钮层级。
- 900×800 capture 显示：详情 viewer 先占据首屏，下一步动作全部位于其后的 inspector；因此需要一个不重复改变业务语义的紧凑 action entry。
- 1440×900、900×800 diagnose 的 `main` 内部均有约 12px 的既有横向 scroll width，来源是详情返回条的负外边距；本 phase 收敛为详情页自身的无横溢出。
- 图片详情保留 version rail、viewer 控件和 Lightbox；视频详情保留原有 video element、播放恢复与 version switcher。

## Preserve list

- 保留所有既有 `data-*` action selector、History 导航、确认删除、复制/定位文件、继续创作、超分和图片版本切换路径。
- 不改 `studio-media://history/{project}/{version}/0` 或视频历史媒体 URL，不改队列 payload、IPC、持久化结构和历史元数据。
- 不复制或替换视频播放元素；详情重渲染、版本切换和返回导航继续由现有 controller 负责。
- 单版本、多版本、缺失媒体、长 prompt/路径和 retired model 仍使用当前状态语义。

## P15 delta

1. 右侧 inspector 的动作改为一个 dominant primary action、2–3 个高频 secondary action，其余动作收进原生 `details` More 区域；隐藏的动作仍保留原有 selector，继续由现有 `HistoryActionsController` 绑定。
2. 在 viewer 后增加仅窄屏显示的 compact action entry，宽屏不产生重复视觉；900px 及以下先提供主动作，再进入 inspector 详情。
3. 视频与图片的参数、输出、LoRA、输入、性能和 prompt snapshot 统一放进一个 Generation record section，内部 article 仍保留为独立对象。
4. 详情返回条取消会造成内部横溢出的负外边距，保持 sticky、History parent navigation 和现有视觉层级。

## Acceptance evidence

- 1440×900：viewer/inspector 分栏、单一 dominant action、More 仍可键盘展开。
- 900×800 与 760×800：compact action entry 在 viewer 后可达；页面无横向溢出。
- 视频/图片：单版本、多版本、缺失媒体和长记录；继续创作、复制、定位、删除、超分及图片继续编辑/开始视频均保持可达。
- `npm.cmd run verify` 与 current-renderer interaction smoke 必须通过。
