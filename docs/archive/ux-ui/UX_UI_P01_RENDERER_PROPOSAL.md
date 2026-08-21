# P01 当前 renderer 视觉方向

状态：`approved as source direction`。2026-08-20 用户明确 prototype 是旧设计，实际设计以当前 UI 为准；因此本 phase 不直接迁移旧 prototype 的 Cinematic Graphite 数值，也不把 prototype 截图作为批准证据。配色升级需求仍然有效，但必须基于当前 renderer canary 重新提案和批准。

## 冻结的方向

以当前真实 renderer 的深色媒体工作台为视觉基线：

- 深色近黑 canvas 和分层 panel 保留；
- 当前蓝色 primary action、focus、progress 和 active 状态作为可复现基线保留在 P00 evidence 中，但不是不可改变的品牌结论；用户已明确认为当前蓝色缺少高级感，P03 必须从当前 renderer 状态重新定义 action、focus、progress、active 与 information 的语义分工；
- success、warning、danger 等状态继续使用独立语义色，并保留文字/图标/边框等冗余信号；
- Create 的素材与 Prompt、Queue 的 active task、History/Details 的真实媒体、Settings 的证据与动作层级分别作为页面主热点；
- 视觉升级优先解决 hierarchy、density、focus、sticky、responsive 和 recovery；配色、材质与品牌调整必须在当前 UI 的真实结构和状态上逐项验证，不做脱离现有能力的整体换肤；
- 生产实现必须保持当前 DOM、queue payload、history/path、settings/runtime、IPC、workflow 和持久化行为。

## 当前 renderer evidence

依据 [`UX_UI_RENDERER_BASELINE.md`](../../UX_UI_RENDERER_BASELINE.md) 的 136 张真实 renderer 截图，后续 canary 固定为：

- Create：图生视频、视频续写、图片编辑；
- Queue：waiting + failed，另加 live running runtime smoke；
- History：视频/图片的 masonry 与 album；
- Details：视频详情、图片详情；
- Settings：system、acceleration、video、image、nodes、prompt、upscale、logs；
- 视口：1440×900、1280×800、900×800、760×800，以及 1121/1120、901/900、761/760 断点。

## P02 输入

P02 只建立语义 token 别名，值映射到当前 renderer 已使用的最终变量，目标是零视觉变化。只有完成截图 parity、focused tests 和 `npm.cmd run verify` 后，才允许在后续 phase 调整颜色、材质、字体或间距。

本 proposal 的批准只确认“当前 renderer 是设计来源”和 preserve list；不等于批准保留当前蓝色，也不等于已批准任意具体换色或页面重排。P03 的色板必须经过 current-renderer visual gate。
