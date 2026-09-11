# History 封面、缩略图与视频加载提速
- Status: done（S1–S6 已完成；用户确认体感改善，按接受的验证边界归档）
- Updated: 2026-09-11
- Owner: Luna（用户已交接，本轮独立执行）
- Route: bug / performance
- Authority: 用户已要求开始执行 [PLAN.md](PLAN.md)；本文件是本任务状态与收口结论唯一入口。
- Baseline: HEAD 79c1d6c + 当前工作区。History 与 H3/ComfyUI 任务存在重叠脏改动，已保留并分开验证。

## Resume

- S0 基线已完成：History 媒体相关 8 个文件、42 个测试通过；`tests/fixtures/history-performance.ts` 只有列表元数据，仓库没有可用于真实解码计时的 mp4/png 素材，因此没有伪造冷/热首帧数字。
- S1 已完成：新增 typed `lookupHistoryCover` 与 `saveHistoryCoverIfCurrent`；保存按主进程实际恢复路径、size、mtime 和 key 失效代次校验，按 key 串行写入；旧 `readHistoryCover`/`saveHistoryCover` 保留兼容。
- S2 已完成：新增 `media-resource-store.ts` 与 `thumbnail-producers.ts`；查询/图片/视频/保存分别限制为 8/3/1/1，按 key single-flight，逐 DOM subscriber 交付，支持 abort、抢占、一次性缓存 URL 失效重查、有界 LRU 和对象 URL 回收。
- S3 已完成：History gallery 不再在模板阶段设置原图 `src`，原图仅保留在受控 data 属性；图片通过 `studio-media` 协议只解码一次，先显示生成缩略图再异步保存，详情/rail/原图操作保持原路径。
- S4 已完成：视频冷 miss 先交付合格 preview，再完成既有四候选最佳帧 final；seek/data timeout 可区分，预取可被 interactive 抢占，hover 增加 120ms 意图延迟和最多 500ms 的单卡保留窗口，真实播放与封面解码分离。
- S5 已完成：删除、版本删除、路径/代次变化接入定向 invalidate；迟到的生产/保存结果不会回写新绑定或复活已删除封面；播放器状态不由新资源 store 重建。
- S6 已完成：新增 `history-media` Electron 证据场景，使用隔离临时目录生成 12 张图片/12 个视频（每类 11 个可用、1 个缺失），完成 3 次 cold-disk、3 次 warm-disk、同进程 warm-memory 往返，以及 1280×800/1440×900 UI smoke。具体中位数、最大值和采集限制见 [evidence/performance.md](evidence/performance.md)。

## Ownership / resources

- 本任务新增 renderer 资源层与生产器，并改动 History page、image/media controller、query service、destructive invalidation、typed IPC/preload、confirmation wiring 及相邻测试；具体范围以当前 scoped diff 为准。
- 不修改 persisted history/task ID，不迁移用户媒体或用户封面，不新增常驻后台服务，不使用 FFmpeg 批处理，不提升视频解码并发。
- 工作区中的 `2026-09-10-comfyui-035-h3` 及其 H3/ComfyUI 源码、测试和文档改动属于其他工作，未覆盖、未回滚、未借本任务修复。

## Acceptance / verification

- History focused 组合：12 个测试文件、78 个测试通过，覆盖共享生产、磁盘命中、先 preview 后 final、取消/重入、save/delete 竞态、有限 URL 重查、hover/seek、页面/播放器/可访问性边界。
- Renderer 与 Electron TypeScript：`npx tsc --noEmit --pretty false`、`npx tsc -p tsconfig.electron.json --noEmit --pretty false` 均通过。
- `npm.cmd run verify:ux-ui-contrast` 通过全部 20 个文字/背景组合，最低 4.50:1 门槛满足；`git diff --check` 无 whitespace error，仅报告现有工作区的 LF/CRLF 提示。
- 完整 `npm.cmd test` 当前为 166 个 suite 通过、7 个 suite 失败、1442/1452 测试通过；10 个失败均来自并行 H3/ComfyUI 改动（LoRA 顺序、workflow metadata、ComfyUI 启动参数、H3 queue/dependency/workflow 期望），History focused 组合不受影响。
- `npm.cmd run build` 已执行到 Vite，当前被并行 H3 改动的 `SPECTRUM_PDD_MINIMUM_VERSION` 缺失导出阻断；不是本任务 History 模块错误，未擅自修改 H3 目录。
- 基准已提供当前实现的用户可见时序，但本轮没有可核验的同 fixture 旧实现对照，因此仍未声明任何 40%/30% 提速或首帧退化结论。当前 packaged renderer 未包含新增的可选计数 hook，cover lookup、source decode/seek、Object URL 和 IPC 字节字段只保留为 `protocol-dom-only` 未观测值；完整 build 解除后可重建 renderer 补采这些计数。`npm test`/build 的 H3/ComfyUI 外部失败仍不在本任务范围内。

## Next

## Closeout

- 用户已确认当前实现的体感改善，并接受本轮没有同 fixture before/after 对照、可选 renderer 计数 hook 尚未随 packaged renderer 重建，以及完整 `verify`/renderer build 受并行 H3/ComfyUI 改动阻塞的边界。
- History 功能、真实媒体可见时序、两个目标视口 smoke、聚焦测试、TypeScript 与对比度检查均已完成；本任务于 2026-09-11 归档。
