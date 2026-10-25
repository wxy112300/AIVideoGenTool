# UI 设计知识库

- 类型：Research / Evidence
- 状态：设计阶段已完成（2026-10-21）；结论已写入 [DESIGN.md](../../../DESIGN.md)，迁移由 [UI 迁移 TASK](../../tasks/2026-10-21-ui-migration/TASK.md) 负责
- 适用范围：renderer 视觉层与动效层；LAN 浏览器（`src/web/`）保持独立设计
- 权威顺序：用户决定（[设计 TASK](../../tasks/2026-10-20-ui-design-system/TASK.md) “用户决定”第 1–45 条）→ DESIGN.md → `prototypes/` → 本目录证据

## 内容

| 位置 | 内容 | 用途 |
| --- | --- | --- |
| [baseline-0.66.5/](baseline-0.66.5/) | 迁移前 renderer 截图，18 张，1440×900，合成 fixture 数据 | 迁移前后对照；每个页面包验收时与之并排比较 |
| [ui-audit.md](../../tasks/2026-10-20-ui-design-system/evidence/ui-audit.md) | 2026-10-20 审美与交互问题审计（V/T/L/H/C/M/I/S/E 编号） | 迁移时逐项关闭；问题编号可在提交说明中引用 |
| [palette-research.md](../../tasks/2026-10-20-ui-design-system/evidence/palette-research.md) | 灰阶 × 深度对比度实测 | token 取值依据 |
| [prototypes/](../../../prototypes/README.md) | 定稿的设计系统目录与 6 个页面原型 | 迁移的视觉与交互目标 |

## 基线截图清单（0.66.5）

由 `scripts/capture-ux-ui-renderer-baseline.cjs` 以 mock preload 和合成数据生成（不含用户作品、真实路径或模型输出）。

| 文件 | 页面 / 状态 |
| --- | --- |
| `create-image-to-video.png` | 创建 · 图生视频（首尾帧） |
| `create-video-extension.png` | 创建 · 视频续写（空输入） |
| `create-image-edit.png` | 创建 · 图片处理 |
| `queue-mixed.png` | 队列 · 混合任务 |
| `history-video-masonry.png` / `history-video-album.png` | 历史 · 视频 瀑布流 / 相册 |
| `history-image-masonry.png` / `history-image-album.png` | 历史 · 图片 瀑布流 / 相册 |
| `video-detail.png` / `image-detail.png` | 视频详情 / 图片详情 |
| `settings-system.png` `settings-nodes.png` `settings-acceleration.png` `settings-video.png` `settings-image.png` `settings-prompt.png` `settings-upscale.png` `settings-logs.png` | 设置各分区 |

重新生成：先启动 Vite 5173，再运行 `npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --viewport 1440x900 --output temp/ui-design-audit`。

## 未入库的证据

- 真实数据副本截图（`temp/ui-audit-real/shots/`，21 张，137 个视频 / 8 个图片项目）：含用户作品封面与本机路径，按仓库规则不提交。复现步骤见设计 TASK 的 “Evidence / handoff”。
- 原型迭代截图（`temp/ui-design-audit/*.png`）：过程产物，已被定稿原型取代。

## 失效条件

- 基线截图只代表 0.66.5 的 renderer；迁移完成后由新的截图矩阵取代，本目录保留作历史对照。
- 原型数据是模拟的（节点 12 个、提示词模型 8 个等数量与真实环境不同），不证明任何功能或运行结果。
