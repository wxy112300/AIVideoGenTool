# UX/UI P00 历史 prototype 参考基线

> 状态：`historical / superseded`。这份文档只记录旧 prototype 的可复现参考，不是当前产品 UI 的视觉或交互依据。
> 当前真实 renderer 基线见 [`UX_UI_RENDERER_BASELINE.md`](../../UX_UI_RENDERER_BASELINE.md) 和 [`ux-ui-renderer-baseline.manifest.json`](../../ux-ui-renderer-baseline.manifest.json)。

## 基线元数据

| 项目 | 值 |
| --- | --- |
| Phase | P00 — historical prototype reference |
| 源 commit | `f4653727004e6d4cc2be1ceb7d8b4d0e749bf560` |
| 源版本 | `0.30.0`（以当前 `package.json` 为准） |
| 基线语言 | `zh-CN` |
| 开始前工作树 | clean；未发现用户未提交改动 |
| 机器可读 manifest | [`ux-ui-baseline.manifest.json`](./ux-ui-baseline.manifest.json)（历史 prototype） |
| 当前 renderer manifest | [`ux-ui-renderer-baseline.manifest.json`](../../ux-ui-renderer-baseline.manifest.json) |
| 截图输出 | `temp/ux-ui-baseline/`（被 `.gitignore` 忽略；旧 prototype 与当前 renderer 分目录） |

计划文档记录的 `0.29.5` 已落后于当前仓库版本；本基线不回写版本号，也不把版本差异当作 UI 行为结论。

## 重新生成历史 prototype 参考

```text
npm.cmd run prototype:build
npx.cmd electron scripts/capture-ux-ui-baseline.cjs
```

只检查捕获矩阵而不启动 Electron：

```text
npx.cmd electron scripts/capture-ux-ui-baseline.cjs --dry-run
```

截图脚本只读取 `prototypes/preview/`，通过页面已有的 demo 控件切换状态。`queue-empty` 是脚本注入的最小合成 fixture，因为旧 prototype 没有静态空队列页面；它被 manifest 标为 `unverified`，不能当作 renderer 已实现的证据。

当前 renderer 的截图使用独立脚本和独立输出目录，详见 [`UX_UI_RENDERER_BASELINE.md`](../../UX_UI_RENDERER_BASELINE.md)。

## 视口矩阵

| 组 | 视口 |
| --- | --- |
| 标准 | `1440×900`、`1280×800`、`900×800`、`760×800` |
| 断点 | `1121×800` / `1120×800`、`901×800` / `900×800`、`761×800` / `760×800` |

Details 页面按标准视口捕获；Create、Queue、History、Settings 还捕获所有断点视口，避免把窄窗溢出或 sticky 覆盖误判为状态问题。

## 页面与状态清单

| Fixture | 页面 / 源 | Prototype 状态 | Renderer 状态 | 数据状态 | 语言 | 主要动作 | 证据边界 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `create-image-to-video` | Create / `create.html` | implemented | implemented | 图生视频 / H3 R2V | zh-CN | 加入队列 | 静态 prototype 基线 |
| `create-video-extension` | Create / `create.html` | implemented | implemented | 视频续写 / H3 FL2VA | zh-CN | 加入队列 | 静态 prototype 基线 |
| `create-image-edit` | Create / `create.html` | implemented | implemented | 图片处理 / Qwen Image Edit | zh-CN | 加入队列 | 静态 prototype 基线 |
| `queue-running` | Queue / `queue.html` | implemented | implemented | running + pending + failed | zh-CN | 暂停/取消当前任务 | 静态 prototype 基线 |
| `queue-failed` | Queue / `queue.html` | implemented | implemented | 可恢复失败任务 | zh-CN | 调整后重试 | 静态 prototype 基线 |
| `queue-empty` | Queue / `queue.html` | unverified | unverified | 空队列 | zh-CN | 创建任务 | 合成 capture fixture，非实现证明 |
| `history-video-masonry` | History / `history.html` | implemented | implemented | 视频 / 瀑布流 | zh-CN | 打开视频详情 | 静态 prototype 基线 |
| `history-video-album` | History / `history.html` | implemented | implemented | 视频 / 相册 | zh-CN | 打开视频详情 | 静态 prototype 基线 |
| `history-image-masonry` | History / `history.html` | implemented | implemented | 图片项目 / 瀑布流 | zh-CN | 打开图片详情 | 静态 prototype 基线 |
| `history-image-album` | History / `history.html` | implemented | implemented | 图片项目 / 相册 | zh-CN | 打开图片详情 | 静态 prototype 基线 |
| `video-detail` | Video Details / `history-detail.html` | implemented | implemented | 已完成视频、版本、生成记录 | zh-CN | 继续创作 | 静态 prototype 基线 |
| `image-detail` | Image Details / `image-detail.html` | implemented | implemented | 选中图片版本、谱系、handoff | zh-CN | 开始创作视频 | 静态 prototype 基线 |
| `settings-system` | Settings / `settings.html` | implemented | implemented | 系统与路径 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-acceleration` | Settings / `settings.html` | implemented | implemented | 性能与加速 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-video` | Settings / `settings.html` | implemented | implemented | 视频模型 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-image` | Settings / `settings.html` | implemented | implemented | 图像编辑模型 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-nodes` | Settings / `settings.html` | implemented | implemented | 节点与工作流 | zh-CN | 更新节点 | 静态 prototype 基线 |
| `settings-prompt` | Settings / `settings.html` | implemented | implemented | 提示词扩写 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-upscale` | Settings / `settings.html` | implemented | implemented | 分辨率提升 | zh-CN | 保存设置 | 静态 prototype 基线 |
| `settings-logs` | Settings / `settings.html` | implemented | implemented | 运行日志 | zh-CN | 刷新日志 | 静态 prototype 基线 |

表中的 Renderer 状态是旧计划在 prototype 参考阶段的记录，不是当前 renderer 的验收结果。P00 prototype 参考不建立实现完成结论。

## Preserve list

- Create 三种创建路径、模型/参数/默认值、提交语义，以及草稿输入和 undo/redo。
- Queue 任务顺序、运行/暂停/继续/取消/恢复、预览和单 GPU 重任务策略。
- History 视频/图片分类、布局选择、封面/hover preview、版本关系、删除和路径恢复。
- 两种 Details 的 viewer、版本轨、Lightbox、继续编辑和转视频 handoff。
- Settings 离线扫描、多 ComfyUI 安装、服务生命周期和模型/节点/运行时证据分层。
- 不改 renderer、Electron、workflow、IPC、persisted state 或用户数据。

## Dirty-worktree handoff

旧 prototype 参考捕获前 `git status --short` 为空，源 commit 为上表 commit。由于用户已明确 prototype 不是当前设计来源，后续 reviewer 不得将本文件或旧截图作为 renderer approval；renderer、Electron、workflow 或 persisted-state 的真实变更必须以当前 renderer 基线和对应 phase 证据为准。
