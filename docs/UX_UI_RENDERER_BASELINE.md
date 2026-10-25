# 当前 renderer 视觉基线

> 类型：可重复截图基线；状态：M9 verified；更新：2026-10-24。任务状态以 [迁移 TASK](tasks/2026-10-21-ui-migration/TASK.md) 为准，执行结果见 [M9 证据](tasks/2026-10-21-ui-migration/evidence/m9-closeout.md)。

## 来源与边界

截图来自当前生产 renderer 入口 `src/main.ts`、`src/renderer/` 和 `src/style.css`，由 Vite 提供同一源码。manifest 见 [ux-ui-renderer-baseline.manifest.json](ux-ui-renderer-baseline.manifest.json)。

- 版本：`0.66.6`；checkout commit：`ae25c113b107f1ea10b4c1f39824305767387784`。
- 源状态：包含 M0–M9 的未提交工作树；commit 标识 checkout，不代表干净发布。
- 桌面样式：tokens → base.structure / base.defaults → components → patterns → pages。结构层保留仍被页面使用的几何规则，旧编号样式和变量桥接已移除。
- LAN 使用独立 `src/web/theme.css`，保留原有配色，不继承桌面外观设置。
- 原型用于理解已批准的设计；当前 DOM、真实模型能力与产品契约决定可执行行为。

capture 使用临时 userData、mock preload 和合成状态，不读取或改变用户历史、设置与模型。截图证明固定状态下的布局，不能证明安装、GPU 生成或真实媒体播放。

## 重新生成

启动 Vite（端口须由本任务拥有）：

```powershell
npx.cmd vite --host 127.0.0.1 --port 5173 --strictPort
```

另一终端执行：

```powershell
$env:UX_UI_RENDERER_URL = 'http://127.0.0.1:5173/'
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --diagnose
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --dry-run
npm.cmd run verify:ux-ui-contrast
```

默认输出 `temp/ui-m9/baseline/`。可追加 `--fixture create-image-edit --viewport 900x800 --smoke` 检查局部交互；`--style-metrics` 保存几何和计算样式。显式 `--viewport` 对所有选中 fixture 生效，包括未列入默认分组的窄视口。

三语/缩放补充示例（用不同输出目录保留证据）：

```powershell
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --locale en-US --viewport 547x800 --output temp/ui-m9/en-narrow
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --locale zh-TW --viewport 547x800 --output temp/ui-m9/tw-narrow
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --zoom 1.5 --viewport 820x800 --output temp/ui-m9/zoom
```

## 矩阵

| 组 | 视口 |
| --- | --- |
| 标准 | 1440×900、1120×800、900×800、820×800 |
| 断点补充 | 1121×800、901×800、761×800、760×800 |
| 可选 | 1280×800、547×800，或自定义 WIDTHxHEIGHT |

21 个 fixture：Create 三模式；Queue；History 视频/图片各两种布局；视频与图片详情；Settings 全部 11 分区。详情各拍四个标准视口，其余各拍八个视口，默认共 **160 张**。历史 id `settings-system` 继续表示 ComfyUI 环境；`settings-application` 表示应用与路径。

M9 已完成默认 160 张，以及英文窄屏、繁中窄屏、中文 150% 缩放各 21 张，共 **223 张**。PNG 物理尺寸按请求的内容视口保存；缩放改变 CSS 可用宽度。滚动条会占用 document.clientWidth，不应把它误认成 PNG 宽度偏差。

2026-10-24 追加动态/文案复核后，三语 image/prompt/nodes 各补一张 1440×900 定向截图，位于 `temp/ui-m9a/copy-<locale>/`。后续变化与动态中间态见 [追加证据](tasks/2026-10-21-ui-migration/evidence/m9a-dynamic-copy.md)，原 223 张记录 M9 收尾时的状态。静态 capture 现在等待有限动画结束；它仍不能证明动态流畅度。

`--settings-states` 另拍 offline/scanning/installing/partial/error，属于合成呈现证据，不计入默认 160 张，也不能代替安装 subprocess 验收。

## 保持项与证据限度

保留模型专属能力、草稿/富文本编辑、文件与 Slot、拖放/撤销、队列快照与单 GPU 策略、历史筛选/版本/父导航、播放/Lightbox、设置离线扫描与保存/放弃，以及持久化身份和 IPC 边界。基线可随已授权功能增量更新，不冻结模型或参数目录。

M9 的真实 Electron 检查另外验证创建和放大缺输入恢复、实际按钮入队、快照冻结、真实媒体播放、三语窄屏与减少动态效果。它们不由合成截图推导；详情及重启、资源清理结果见 M9 证据。未运行真实安装、GPU 生成或 Windows 系统级 DPI/高对比度验收。150% 为 Electron 页面缩放。
