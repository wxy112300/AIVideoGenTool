# M0 接入核对

- 类型：Evidence / 迁移准备；日期：2026-10-22。
- 范围：0.66.6 当前工作区的 renderer 与原型接缝；当前状态只由 [TASK](../TASK.md) 维护。
- 基线策略：用户明确允许动态更新。下面是本次检查快照，模型、节点数量和版本不成为第二份 catalog；后续同框架增量只更新受影响条目。原型是视觉目标，实际能力以契约与当前实现核验。

## 页面承接与保留清单

这是页面包的入口分组，不冒充逐按钮全量验收。开工时从对应 controller 的绑定和当前 DOM 补核新增入口，保留原有语义与 selector 接缝；不要求每次小改重审全部页面。

| 页面 / 接缝 | 当前入口与必须保留的行为 | 新原型承接 / 验收重点 |
| --- | --- | --- |
| Shell：`src/renderer/shell/`、`render-coordinator.ts` | 导航、详情父页选中、资源监视、全局通知与动作、对话框、返回顶部 | 顶栏与持久浮层；导航才触发页面过渡，遥测不重播入场；无关刷新不重建编辑器/播放器。助手统一注册与清理，避免 document 监听和 timer 累积 |
| Create 视频：`pages/create/page.ts`、`references-controller.ts`、`page-controller.ts` | FL2VA 首尾帧与空输入分支；R2V 空槽/清空/移除/标签/作用/备注；拖放、粘贴；模型选择、尺寸、步数、Spectrum、latent、LoRA、Seed、工作流、重复数、提交与清空 | 左侧参考卡与末尾添加块；右侧参数与提交栏。原生 select 仍是值源；保留模型能力锁定与缺输入原因，实际点击取得 task ID |
| FastH3：catalog `minimax_h3_omni`、create view-model、History actions | 独立模型身份、8 步与版本门槛、R2V 参考输入；不开放未支持的 Extend/Spectrum/旧加速组合；继续创作回受支持的 H3 R2V | 沿用 R2V 组件和 catalog 选项，不因原型没有名称而遗漏；切回 Base 的参数恢复与原队列身份单独检查 |
| Extend：create coordinator 与 source controllers | 源视频/裁剪/播放、结尾帧路线、Motion Context latent、Continuum bootstrap/managed 文件与 checking→missing→available、History 回流 | 新参考/文件卡与时间运动区；保留 accepted/head 保护，播放器不随进度重挂载；长视频整包编排不混入旧续写门槛 |
| 图片：`image-edit-controller.ts`、`view-model.ts` | 按能力显示 T2I、参考编辑、无提示词工具、Paint/Mask/裁剪、LoRA、尺寸与批量；提示词编辑、版本；项目 lineage | 复用参考卡/参数/提示词模式，按 capability 渲染，不能把三种原型图片状态当作完整模型枚举 |
| MOSS：`image-workflow/moss-image.ts`、History actions | 纯 T2I/JSON；无参考上传、Paint、Mask、编辑快捷项；已有参考可显式移除；16 对齐；History 编辑回参考图模型且保留父版本身份 | 无素材时用现有纯文生图空态/能力摘要，不强塞参考卡；保留 Prompt Pack 和模型卡顺序来源。不是新增一套 MOSS 专用 UI |
| Prompt：`prompt-controller.ts`、prompt packs、coordinator | 文本撤销/重做与版本撤销分开；参考插入、增强/预热/取消；异步结果写回来源草稿；缺输入不发请求 | 提示词卡与插入菜单；先保留 textarea，统一进度按钮不能绕过现有并发/取消控制 |
| Queue：`pages/queue/card.ts`、`drag-sort.ts`、`live-status.ts` | 启停/本条后暂停、取消、编辑/复制/重试/删除、等待排序/分割线、预览与真实阶段数据 | 新任务卡/菜单与排序；运行刷新不打断拖动/菜单；整包卡和段级暂停依赖真实长视频功能 |
| History 列表：filter/batch/tags/timeline controllers | 图片/视频、瀑布流/相册、收藏/评分/时长/模型/包含排除标签/排序、批量操作、时间轴、悬停播放、滚动恢复 | 原型列表与筛选条；保持媒体调度和卡片身份；多选模型需迁移旧 `modelId` 并同步 LAN，不能只换控件 |
| 详情：history page、lightbox、shell upscale | 视频/图片版本、父导航/返回位置、键盘切换、播放器/全屏、标签/评分/收藏、文件动作、删除确认、继续创作/重生成/续接、Upscale 选项 | 新查看区/右栏/提示词/生成记录；实际删除 API 沿用现有授权与资源 owner 保护，不把单独 AV 删除等同任意 Run 文件删除 |
| Settings：page/fragments 与各 controller | 所有当前分区、离线扫描/在线验证、路径与安装选择、服务管理、模型/LoRA/节点/依赖/安装队列/取消/日志、缓存/素材库、保存/放弃/Ctrl+S | 新设置行与条目卡；所有清单来自 catalog/scan，不照抄原型数量；版本与百分比缺数据不编造。未保存误报先修，外观即时生效与需保存设置分开 |
| LAN：`src/web/main.ts`、`filters.ts` | 独立 palette、History 筛选兼容、浏览与播放 | 不重做布局；token 改动验证显示，多模型筛选迁移验证共享语义 |

## 待验证能力与阶段范围

- B5：H3 controller 已分别有 `data-clear-h3-slot`（仅清空媒体）与 `data-remove-h3-slot`。图片 controller 当前有删除整位；图片清空需在 M4 设计局部状态更新，保持 slot ID/编号与备注，并明确 Paint/Mask/尺寸等派生状态的清理，不简单置空路径。
- B6：当前视频预设来自 `video-resolution.ts` 与模型 catalog。自由 256–2160 不是现有预设承诺，M0 暂缓；M4 先只显示各模型实际支持的预设，不照搬原型的 1080p/自定义。
- B7：`image-workflow/shared.ts` 的 normalizer 只接受列出的档位，任意数值会退回 source；MOSS 另有 16 对齐。暂用档位吸附，不能仅修改滑块 min/max 就开放自由值。将来按 adapter 验证与迁移后再开放。
- B8：原型为 contenteditable + 自行文本/光标映射。生产先保留 textarea；技术验证覆盖中文 composition、多行粘贴、跨标签选区、Ctrl+Z/Y/Shift+Z、版本撤销、异步增强与模式切换，未通过不替换生产输入。
- B10：`src/core/history-filter.ts` 仍为单值 `modelId`，LAN 使用同一 normalizer；多选是持久化/共享筛选变化，放在 M6 一个完整包内验证。
- B15：已找到 AppApi `deleteHistoryJointAv` / `deleteHistoryMotionContext` 及 confirmation service；不能因此推断已有单独 Run 清单删除能力。M7 只接现成 API，逐文件 owner/alias 范围届时再核。
- B14 token 估算来源、B16 预计输出数据、B19 最新版本扫描字段需在所属页面包核对；当前不把原型模拟值作为数据源。
- Continuum 整包：依据 [长视频 TASK](../../2026-10-18-long-video-director/TASK.md)，分组 receipt/checkpoint 尚阻塞，P1–P6 未实施。Create 分页、整包提交、Queue 创作包、段级暂停和恢复须随真实能力接通；现有 managed/bootstrap 续写继续保留。

## 可运行的阶段边界

- M1：`legacy` 首层；普通声明后层优先，重要声明反向。兼容旧变量，逐包删除已替换的旧 `!important`，不新建覆盖层；LAN 不被强制换色。
- M2 拆为 M2a 基础按钮/表单/select、M2b 菜单/提示/对话框/通知、M2c 动效/进度/排序/瀑布流。每包接实际控件后验收，不先让全应用同时换 DOM。通知保留错误和重试/撤销动作语义，最多四条的退场策略不能静默丢掉未处理错误。
- M3 首帧与过渡接 render coordinator 的请求取消/页面清理机制；不把原型全局 document 监听反复注册。View Transition 不包进度与遥测刷新。
- M4 依次输入素材、提示词周边、参数与提交；保留 textarea 和真实尺寸预设可独立完成页面，不让 B6–B8 阻塞其余布局。
- 各页面包结束：相关测试与规定 verify；截图同参数对照、缺输入→恢复→真实点击→task ID、相邻共享页面的焦点/撤销/播放/返回检查。mock 截图仅是视觉层；不替代真实 AppApi，也不把既有模型任务的 verify 当成迁移后的通过证据。

## 截图参数与动态更新

历史 0.66.5 截图保持原样；本次输出 `temp/ui-migration-m0/current`，原型检查复用 `temp/ui-migration-review` 的六页与长视频截图（均 gitignored）。生产与原型内容不同，只按对应模式/状态对照，不做机械像素相等判断。

```powershell
# 自有端口；显式 TS 配置，避免仓库遗留 vite.config.js 被默认选择
npm.cmd exec vite -- --config vite.config.ts --host 127.0.0.1 --port 5175 --strictPort
$env:UX_UI_RENDERER_URL = 'http://127.0.0.1:5175/'
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --viewport 1440x900 --output temp/ui-migration-m0/current --diagnose
# 页面包前后用相同 fixture、locale、zoom、viewport，改 output 保留前后证据
npx.cmd electron scripts/capture-ux-ui-renderer-baseline.cjs --fixture create-image-edit --viewport 820x900 --output temp/ui-migration-m0/current --diagnose
```

截图工具原有 `--fixture / --locale / --zoom / --queue-state / --settings-states` 保持；本次补充任意 `WIDTHxHEIGHT`（320–7680）供 820 等新增宽度，默认矩阵不扩张。推荐宽度 1440 / 1120 / 900 / 820，另按长标签补三语、减少动态、16 页分页和放大缩放；M0 不声称已跑完整矩阵。

新增模型不必为每个型号补一套截图。相同布局能力复用现有场景；出现新可见布局分支（例如 MOSS 无参考）再补针对性的 fixture/实际 UI 证据。现有合成截图脚本含固定样例，18 张通用截图不证明新增模型选中状态；FastH3/MOSS 专项证据见各自 TASK，迁移对应页面时补当前实际能力分支。

## 本轮验证与资源

- 成功补拍 18 个通用页面状态（1440x900）和图片页（820x900），均使用当前 TS renderer、隔离 userData 与 mock preload。人工抽看 Create、Settings 图片区、History 视频列表/详情与 820 图片页；不是逐张完整视觉验收。复用前轮六页原型截图与 Continuum 六段确认/第六页切换检查，不重做原型。
- `--dry-run`：默认仍 136 张；820 自定义与既有 900x800 配合 fixture 均正确选择 1 张。820 参数实际输出成功；`node --check` 与 scoped `git diff --check` 通过。未改生产逻辑，不跑全量 verify/build/GPU。
- 截图限制：现有尺寸沿用 BrowserWindow 外框尺寸，1440 诊断 document clientWidth 1414，820 为 794；不能当成精确 CSS viewport 的断点验收。后续页面包记录实际 viewport、zoom 与窗口尺寸再做精确断点验证。820 图片页当前无整页横向溢出，但长模型选项、提交区阻塞文案与顶栏通知拥挤仍是旧 UI 待迁移问题，不在 M0 修复。
- 合成样例的媒体未实际加载，History 列表可见预览失败占位、详情播放器无可解码内容；Settings 图片扫描为空且保留旧样例文案。截图保留这些状态，不声称播放通过、模型卡完整或 FastH3/MOSS 已有当前截图覆盖。
- 初次截图失败：默认 Vite 选中遗留 JS 配置，读取旧 `.js` 导出；改为显式 `--config vite.config.ts` 后 18 张成功。未删除源码/旧产物。普通沙箱出现 helper setup 错误后，通过审批继续执行隔离检查，没有自动审批拒绝。
- 自有截图 Electron 均已退出；自有 Vite 5175 收尾停止，既有原型服务 5199 保留。不启动 ComfyUI/GPU，不运行用户队列，不改生产 UI、catalog、持久化或版本。文档/截图工具属开发准备影响；整体 UI 迁移仍为 minor。
