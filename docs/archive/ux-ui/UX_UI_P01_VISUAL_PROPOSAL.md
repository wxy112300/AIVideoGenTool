# P01 视觉方向说明（已降级为历史 prototype 候选）

状态：`superseded / historical`。旧 prototype 中的 Cinematic Graphite 候选不代表当前 renderer，也没有获得视觉批准；不应通过 `?theme=graphite`、旧截图或旧 token 进入 `src/`。

## 变更依据

用户已明确：prototype 是旧设计，实际设计必须以当前 UI 为准。因此本文件只保留历史记录，不再作为 P02 或生产 CSS 的输入。当前设计来源改为：

- [`UX_UI_RENDERER_BASELINE.md`](../../UX_UI_RENDERER_BASELINE.md)；
- [`ux-ui-renderer-baseline.manifest.json`](../../ux-ui-renderer-baseline.manifest.json)；
- `src/renderer/` 的真实页面结构与行为；
- `src/styles/` 的当前 cascade、tokens 和断点规则；
- `../../UX_CONTRACT.md` 及其规定的 preserve list。

## 已撤回的 prototype 改动

- `prototypes/studio-prototype.js` 不再支持通过 URL 切换 graphite 主题；
- `prototypes/studio-prototype.css` 不再包含 graphite token layer；
- prototype preview 将恢复为仓库原有的旧参考页面；
- 旧 prototype 截图仍可作为历史对照，但不再是 approval evidence。

## 下一步 gate

下一次视觉 proposal 必须直接从当前 renderer 截图和真实页面问题出发，至少覆盖 Create、Queue、History、Details、Settings，并说明：

1. 哪些现有层级、蓝色 action/status、媒体比例和信息密度必须保留；
2. 哪些调整只改变 shared CSS，哪些需要页面-owned CSS；
3. 900×800、760×800 断点下的实际阅读顺序、焦点和 sticky 行为；
4. loading、empty、unavailable、success、error、disabled 和 focused 状态；
5. 如何证明没有改变 queue payload、history/path、settings/runtime 或 workflow 行为。

在上述 renderer-based proposal 完成并通过人工视觉确认前，不进入 P02 shared token/CSS 生产迁移。
