# Renderer 响应性与可扩展状态存储
- Status: validating
- Updated / Owner: 2026-09-17 / current session
- Scope / Authority: 分阶段修复大历史库下 Prompt 输入、草稿保存和生成进度导致的短时界面卡顿，并为后续无感迁移到 SQLite 建立安全边界；保持 Draft/Create/Queue/History 身份、恢复语义和媒体路径，不丢弃任何历史或诊断数据。
- Baseline: `43a5245`，建档前工作区干净。
- Execution: direct

## Resume
- 已确认 / 决定：卡顿主因不是 Prompt 增强推理。约 920 条历史的用户环境已出现不定期输入假死；当前草稿在停止输入 350 ms 后保存，而一次保存会序列化并写入完整 AppState、完整克隆，再把同一状态同时作为 `state:changed` 广播和 IPC 返回值发送。生成期间未节流的任务进度也会重复走全量持久化和广播。现有单一 AppState/JSON 不作为万级历史的终态；长期方向是 Electron 内置 `node:sqlite` + 独立数据库 worker + History 查询/详情按需读取。
- 已完成 / 下一步：Phase 1 已实现：Draft 保存改为无完整 AppState 返回/广播的耐久确认路径；Queue 高频进度改为按 task 合并的窄事件（默认 100 ms）和定期耐久 checkpoint（默认 1 s），结构性状态仍立即落盘并广播；完成任务仍在 History 与 Queue 的同一次耐久 mutation 成功后发送结构性状态，确保 History 页面刷新。旧 `studio-state.json` 格式未变。自动化 `npm.cmd run verify` 已通过；下一步用隔离 userData 做 Electron 输入/Queue/History 手测，然后决定是否发布该 patch，Phase 2/SQLite 迁移不在本次改动内。
- 阻塞 / 解锁条件 / 不要重复：无阻塞。不要先归因于 Qwen、Prompt 规则或每键 `normalizeVideoDraft`；该规范化粗测约 0.0013 ms/次。不要用删除历史、删诊断字段或延长 debounce 掩盖问题；不要在首次 SQLite 搬迁时同时做 `comfyOutputs` 去重。

## Implementation and resources
- 修改范围 / 保留行为：Phase 1 已修改 `electron/store.ts`、`electron/ports/state-repository.ts`、`electron/services/draft-service.ts`、`electron/services/queue-task-state.ts`、`electron/queue-executor.ts`、事件 bus/bridge/preload、`src/renderer/pages/create/coordinator.ts`、`src/renderer/state-events.ts` 及相邻调用方/测试。保留草稿自动保存、独立 Create 模式快照、不可变队列快照、队列实时进度、checkpoint、历史诊断能力和旧状态文件可读性。后续存储迁移范围与安全门见 PLAN。
- 必要步骤（不自动拆成agent）：Phase 1 消除 Draft 保存的完整状态返回与广播，将高频 Queue 进度改为窄事件并合并/节流持久化，结构性状态和恢复 checkpoint 仍立即落盘；任务完成入史成功后必须发送独立结构性 History 刷新/失效通知，不能被进度节流吞掉；Phase 2 建立窄状态/History repository 与分页查询边界；Phase 3 只读源 JSON、影子导入 SQLite、逐记录 hash/ID/数量校验；Phase 4 原子切换、备份、回退与旧格式兼容。当前不要求直接运行 10,000 条压力测试，Phase 1 使用接近现有 920 条规模的合成 fixture 和结构性断言。
- 文件、build/GPU/服务归属和释放：默认仅代码与测试；性能复现可运行 Electron，但不需要启动 ComfyUI/GPU。不得覆盖用户真实 `studio-state.json`，测试使用临时副本/fixture。
- 验收：Phase 1 在接近 920 条历史的合成状态下持续输入不丢字、不失焦、不覆盖任一 Create 模式草稿；Draft 自动保存不返回或广播完整 AppState；进度风暴不逐事件 clone/写盘/广播完整状态；运行队列时进度仍可见，status、prompt ID、失败/取消、SeedVR2/H3 checkpoint 和完成入史保持立即持久，重启按现有规则安全恢复；完成入史持久化成功后 History 页面会刷新，完成时不在 History 页也能在下次进入时看到新作品，入史失败不得发出虚假新增通知。focused Vitest + `npm.cmd run verify`，并按 UX runbook 做 Electron 输入/队列/History 手测。后续迁移必须满足 PLAN 的全量校验、原 JSON 保留和崩溃点恢复矩阵。

## Evidence / handoff
- 关键结论及来源/版本/证据路径：真实状态文件约 3.87 MB（紧凑 JSON 约 2.18 MB），107 条视频历史约 2.05 MB；asset/version 两层 `comfyOutputs` 合计约 1.35 MB。代码入口见上述修改范围。
- 实际命令、结果、对应文件状态：诊断基线仍为 pretty `JSON.stringify` 约 9.22 ms、`structuredClone` 约 11.05 ms、JSON parse 约 4.21 ms；原双通道保存路径估算 CPU 约 39.7 ms/次，未包含磁盘替换和 Electron IPC。Phase 1 focused Vitest 共 12 files / 109 tests 通过，新增重点回归 28 tests 通过，`npm.cmd run typecheck` 通过；最终 `npm.cmd run verify` 通过（unit 172 files / 1448 tests，integration 6 files / 81 tests，clean typechecked build 与 20 组 contrast checks 通过）。`git diff --check` 无错误，仅有仓库既有的 LF/CRLF 转换提示。
- 可复用检查 / 必须补的验证：已有 920 条合成 History fixture 断言 Draft 保存不创建完整 snapshot、不走完整 state 广播且 History 原样保留；已有进度风暴合并、定期 checkpoint、renderer 窄 patch、完成入史后结构性 History 刷新测试。迁移阶段仍需补逐记录 canonical hash、ID/version 集合、queue/draft/create 快照和崩溃点故障注入测试。
- 未运行项、限制、清理：尚未完成隔离 userData 的 Electron 输入/Queue/History 手测，也未在出现卡顿的那台约 920 条真实历史电脑上做体验复核；自动化证明确认了热路径边界和数据语义，不等同于真实机器的最终体感结论。未启动 ComfyUI/GPU，未读取或覆盖用户真实状态文件。
- 实际模型/effort；可见usage与耗时：current model / unknown。
- 版本影响 / Unreleased：patch；已更新 `CHANGELOG.md` 的 Unreleased，未改 package 版本。
