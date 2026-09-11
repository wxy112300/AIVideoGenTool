# History 媒体加载优化执行证据

- 类型：实现证据与受控 Electron 媒体采样；不是真实性能保证。
- 日期：2026-09-11。
- 范围：History gallery 图片、视频封面、详情/rail 兼容、缓存失效与 typed IPC。
- 状态：S1–S6 已完成并归档；完整 verify/build 仍受并行 H3/ComfyUI 工作区改动阻塞。

用户已确认当前实现的体感改善，并接受本证据未提供同 fixture before/after 对照；本文封存为本次实现的历史证据，不作为固定性能保证。

## 真实媒体基准（2026-09-11）

已通过同一套生产 Electron/CDP 证据工具运行 `history-media` 场景，临时 fixture 不进入 Git：

- fixture：`history-media-v1`；12 个图片卡、12 个视频卡；每类 11 个可用资源、1 个缺失资源；包含大图、透明 PNG、竖图、长/竖视频、黑色开头和重复物理文件。
- 环境：Electron 43.2.0，隔离 userData，`C04_DISABLE_HARDWARE_ACCELERATION=1`，devicePixelRatio 1。性能计时使用生产窗口；1280×800 与 1440×900 只用于 UI smoke/screenshot。
- 采样：3 次 cold-disk（每次全新 userData/派生缓存）、3 次 warm-disk（预热后重建 renderer），并在每次会话内执行一次 History 往返 warm-memory round。
- 原始 manifest（临时、被 `.gitignore` 忽略）：`temp/history-media-benchmark-final-3/manifest.json`。

| 模式 / 资源 | 首张可见中位数（范围） | 全部可用中位数（范围） | 缺失项终态中位数（范围） |
| --- | ---: | ---: | ---: |
| cold-disk 视频 | 136.5 ms（135.8–152.7） | 797.1 ms（687.7–5155.4） | 613.0 ms（596.9–683.5） |
| cold-disk 图片 | 175.7 ms（146.3–178.3） | 630.9 ms（610.5–642.1） | 175.7 ms（175.7–178.3） |
| warm-disk 视频 | 138.0 ms（137.3–152.6） | 599.1 ms（596.6–608.4） | 599.1 ms（596.6–608.4） |
| warm-disk 图片 | 135.2 ms（132.7–135.8） | 596.2 ms（594.1–597.0） | 135.2 ms（132.7–135.8） |

附加观测：cold-disk hover 意图到播放约 123–156 ms，warm-disk 约 123–140 ms；详情视频首帧 cold-disk 约 178–213 ms、warm-disk 约 204–210 ms。6 次主采样均在 sweep 期间达到 11/12 ready 与 1/12 缺失终态。

两个 UI smoke 视口均实际捕获：1280×800、1440×900；各自 12 个视频卡、无横向溢出，图片 gallery 没有直接挂 `studio-media://history/` 原图 `src`。截图位于上述临时 manifest 对应的 run 目录。

复现命令：

```powershell
node --experimental-strip-types scripts/capture-c04-electron-evidence.mjs `
  --scenario history-media --samples 3 --skip-development --skip-trace `
  --output temp/history-media-benchmark-final-3
```

这组数字是当前实现的受控“after/current”测量，不是 before/after 提速比例。由于实际打包 renderer 在本轮 benchmark 前已经生成，新增的可选 renderer counter hook 没有进入该 packaged bundle；因此 manifest 中 `coverLookups`、source decode/seek、Object URL、IPC 字节等字段标为 `counterSource: protocol-dom-only`，数值 0 代表“未观测”，不能解释为真实的零次操作。完整 build 被 H3/ComfyUI 的 `SPECTRUM_PDD_MINIMUM_VERSION` 导出冲突阻塞后，可重建 renderer 再补采这些计数。

## 已减少的工作

原实现会在 gallery 模板阶段先设置原图 `src`，图片缩略图 miss 后再通过 `readImage` 跨 IPC 传整图、decode、保存并重新读取；视频封面则在独立路径中串行完成所有候选 seek。当前实现改为：

1. gallery 只输出受控 `data-image-media-url`，详情、rail、复制和原图查看仍使用原图 URL。
2. `media-resource-store.ts` 按 key 共享 lookup/producer，并把同一结果交付给每个 DOM subscriber；查询、图片、视频、保存并发上限分别为 8、3、1、1。
3. 图片和视频生产都直接使用 `studio-media` 协议；图片先发布 640px PNG，再异步执行有 revision 条件的保存；视频先发布合格 preview，再完成既有四候选最佳帧 final。
4. 主进程保存重新解析源路径并校验 source revision，按 key 串行写入；删除、版本删除、路径变化和缓存 URL 失败都能定向失效，URL 失败最多重查一次。
5. renderer 正结果最多保留 256 个 key，未引用生成 Blob 预算为 32 MiB；对象 URL 在淘汰、失效、路由释放时回收。hover 使用 120ms 意图延迟和最多一个 500ms 保留窗口。

## 自动化验证

| 检查 | 结果 |
| --- | --- |
| S0 基线 | 8 个 History 媒体测试文件、42 个测试通过 |
| S1–S5 focused | 12 个测试文件、78 个测试通过 |
| TypeScript | `npx tsc --noEmit --pretty false` 通过；Electron `tsconfig` 通过 |
| 页面/播放器/协议边界 | 已包含在上述 focused 组合；`history-accessibility`、`history-performance`、`history-player-controls`、`media-document-services` 通过 |
| 文字对比度 | `npm.cmd run verify:ux-ui-contrast`：20/20 通过，最低 4.50:1 |
| 差异检查 | `git diff --check` 无 whitespace error；只有 LF/CRLF 工作区提示 |
| 真实媒体 Electron | `history-media`：6 次主采样实际启动；3 cold-disk + 3 warm-disk；每次 11/12 ready、1/12 缺失终态；两视口 smoke 均通过 |

Focused 复现命令：

```powershell
npm.cmd test -- --run tests/history-media-controllers.test.ts tests/history-media-scheduler.test.ts tests/history-image-media.test.ts tests/history-cover.test.ts tests/history-services.test.ts tests/media-document-services.test.ts tests/history-player-controls.test.ts tests/history-media-resource-store.test.ts tests/history-thumbnail-producers.test.ts tests/history-accessibility.test.ts tests/history-performance.test.ts tests/main-boundary.test.ts
```

## 验收覆盖与未覆盖项

- I01–I06、I09：自动化覆盖 gallery 无初始 `src`、磁盘命中不启动生产、先显示后保存、同 key 多消费者、最后订阅者取消/重入、协议源缺 `absolutePath`。
- I07、I08：代码保留 generation/source fingerprint、PNG alpha/比例和原图操作；没有独立 DOM A→B 迟到结果断言，也没有真实 canvas 视觉 smoke，标为待补。
- V01–V06：自动化覆盖磁盘命中、preview/final 分离、黑首帧过滤、preview 失败保留、视频抢占、80ms hover 取消和点击绕过延迟。
- V07：实现了单卡 500ms 保留及 timer 清理，但同卡回入/转卡的真实交互仍待 UI smoke。
- C01–C06：自动化覆盖源 revision stale、save/invalidate 竞态、外部保存重新命中、缓存 URL 单次重查、300 key LRU 回收、忽略 signal 的任务及时释放。
- P01、U02：沿用现有 media protocol 和 detail player 控制测试；未改 HTTP Range/播放器状态契约。
- U01：DOM/状态与可访问性自动化通过；瀑布流/相册、详情返回、删除和两个目标视口未在真实 Electron 中执行。

## 性能限制

本轮没有报告冷/热磁盘、热内存、首张封面、首帧、seek 次数、Range 请求、Long Task 或活跃 decoder 的数值。仓库现有 `tests/fixtures/history-performance.ts` 是 500 项列表元数据 fixture，不含本计划要求的受控图片/视频解码样本；当前工作区也没有可直接复用的目标媒体集。因此不能据此宣称 40%/30% 提速、P95 或播放首帧没有退化。

完整检查的外部阻塞如下，均未在本任务中修复：

- `npm.cmd test`：166 个 suite 通过、7 个 suite 失败、1442/1452 测试通过；失败集中在并行 H3/ComfyUI 的 LoRA、workflow metadata、启动参数、queue、dependency scanner 期望。
- `npm.cmd run build`：Vite 解析到并行 H3 改动时，因缺少 `SPECTRUM_PDD_MINIMUM_VERSION` 导出停止；History 模块未报错。

后续若提供隔离 Electron、授权媒体 fixture、目标硬件和独立 H3/ComfyUI 状态，应按 [PLAN.md](../PLAN.md) 第 10 节分别执行 cold-disk、warm-disk、warm-memory，并同时记录 1280×800 与 1440×900 正确性 smoke；测试耗时不能替代用户可见性能数据。
