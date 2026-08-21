# P20 当前 renderer QA report

日期：2026-08-21 · 版本：`0.40.1` · source of truth：当前 `src/renderer/` 与 `src/styles/` · 历史 prototype 不参与验收

## 结论

P20 的 L65/L66 自动化交付已完成，G18 仍待用户/集成 owner 完成真实运行态、完整键盘与发布验收。QA 期间发现并修复了一个真实的缩放布局问题：150% zoom、900×800 canary 下 Create 的 `.interpolation-summary` 仍使用固定双列轨道，导致 document/body 出现横向滚动。修复已收回 `src/styles/07-create-composer.css` 的窄屏 owner 规则，没有修改 DOM、controller、队列状态机、工作流 payload、持久化或媒体路径。

## 当前 renderer screenshot matrix

完整数量和目录见 [UX_UI_P20_SCREENSHOT_MANIFEST.json](./UX_UI_P20_SCREENSHOT_MANIFEST.json)。最终版本 artifact 共 264 张：

| 覆盖 | 视口/状态 | 数量 | 目录 |
| --- | --- | ---: | --- |
| zh-CN 全量 | 18 fixture × 8 viewport | 136 | `temp/ux-ui-baseline/p20-final-zh-CN-full` |
| en-US | 18 fixture × 1440/760 | 36 | `temp/ux-ui-baseline/p20-final-en-US-*` |
| zh-TW | 18 fixture × 1440/760 | 36 | `temp/ux-ui-baseline/p20-final-zh-TW-*` |
| Settings 状态 | offline/scanning/installing/partial/error × 4 viewport | 20 | `temp/ux-ui-baseline/p20-final-settings-states` |
| 125% zoom | 18 fixture × 900×800 | 18 | `temp/ux-ui-baseline/p20-final-zoom-125` |
| 150% zoom | 18 fixture × 900×800 | 18 | `temp/ux-ui-baseline/p20-final-zoom-150` |

P19 的相邻证据继续保留：Queue 七状态 × 八视口 56 张，History 视频/图片、masonry/album、8 条混合比例记录 × 八视口 32 张，以及视频/图片详情 8 张。

## Verification

- `npm.cmd test`：88 个 test files、656 个 tests passed。
- `npm.cmd run typecheck`：passed，包含 renderer 与 Electron TypeScript 检查。
- `npm.cmd run build`：passed，production renderer/Electron build 完成。
- `npm.cmd run verify:ux-ui-contrast`：20/20 text/surface pairs passed，最低 4.50:1 门槛通过。
- `npm.cmd run verify`：passed。
- `npm.cmd run verify:markup-visual`：exit code 0；Electron 输出本机 os_crypt/GPU 初始化警告，但没有失败退出。
- `npm.cmd test -- tests/ux-ui-tokens.test.ts`：19/19 passed，包含窄屏摘要单列规则和 L64 History override 断言。

## Overflow 判定

150% 修复后的 Create 三模式，以及 Queue、History、视频/图片 Details、Settings canary 均重新检查了 `documentScrollWidth/bodyScrollWidth` 与对应 client width，页面级宽度一致。diagnose 中剩余的 `overflowing` 项属于组件内部边界：信息 tooltip、长模型 chip、详情长标签和 Settings 可横向滚动的 compact category strip；它们没有扩大 document/body 滚动层，不作为页面级失败。

## 证据边界与 G18

当前 capture harness 使用 synthetic preload/fixture，证明的是 renderer 构图、状态分支、键盘 smoke 和 DOM 诊断，不等同于真实 ComfyUI 生成。真实 ComfyUI 运行此前由用户完成并反馈未发现明显问题，但本轮 P20 不把它重新声明为 agent 侧 runtime pass。

仍需 G18 人工/集成验收：

- 真实 ComfyUI 的 start/pause/resume/cancel/reorder/recover/live preview 全路径；
- Create → Queue → History → Detail → Continue 的纯键盘连续路径；
- Windows 高对比度、Reduced Motion、长路径/长模型名和 100%/125%/150% 实机检查；
- 应用正常关闭、活动任务确认、强制关闭、外部 ComfyUI 保留；
- Settings 多安装、保存/丢弃、安装/更新、服务和日志真实操作；
- 最终是否发布 `0.40.1` 的集成结论。

在上述人工 gate 完成前，P20 自动化 QA 不写成“全部 runtime passed”，也不再继续扩展 UI 视觉范围。
