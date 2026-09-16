# 响应性止血与 SQLite 无损迁移计划

- Type: implementation plan
- Status: accepted direction; Phase 1 implemented, pending isolated Electron smoke test
- Date: 2026-09-17
- Scope: 大历史库下的 renderer 响应性、状态写入边界，以及后续从 `studio-state.json` 到 SQLite 的无感迁移。
- Authority: 当前执行摘要以 [TASK](TASK.md) 为准；产品身份、IPC、队列和历史约束以 [Architecture Contract](../../ARCHITECTURE_CONTRACT.md) 为准。

## Outcome and invariants

第一阶段先解除约 920 条历史环境中的输入假死，不改变历史存储格式。后续再把完整逻辑状态安全迁移到 SQLite，使 Draft、三个 Create 工作区快照、Image Draft、Settings、Queue、History 和版本/文件身份都能窄更新和按需查询。

所有阶段共同遵守：

- 不删除、截断或就地改写迁移源 `studio-state.json`；用户明确删除作品是独立操作。
- Draft 保存不覆盖更新的本地输入；Create 的 image-to-video、video-extension 和 image-edit 状态保持独立。
- 已排队任务是不可变执行快照；迁移和实时更新不能用当前 Draft 重建 Queue。
- `status`、`comfyPromptId`、错误/取消、完成、SeedVR2 checkpoint、H3 first-pass checkpoint 和历史提交是耐久边界，不按普通进度节流。
- Queue 任务完成并成功持久化 History 后必须通知 renderer 的 History 状态失效；History 页面可见时刷新列表/详情，不可见时保证下次进入读取到新作品。通知不得早于持久化成功，也不得被普通进度合并吞掉。
- 媒体文件和用户路径在元数据迁移阶段不移动；文件缺失不等于历史记录可丢弃。
- 首次 SQLite 搬迁只复制和校验，不同时去重 `comfyOutputs`、重排版本或修复路径。
- 任何迁移失败都保持旧存储可读且仍为权威，不允许回落到空默认状态。

## Phase 1 — 响应性止血，不迁移数据

目标是让 Draft 自动保存和 Queue 实时进度的成本不再随 History 大小直接落到 renderer 主交互路径。

### Draft path

1. 将 `draft:save` / `image-draft:save` 从返回完整 `AppState` 改为 `void` 或带 revision 的小型确认。
2. DraftService 保存成功时不再发送完整 `state:changed`；renderer 保留自己已编辑的权威 Draft，只用确认清除对应 revision 的 dirty 状态。
3. StateRepository 增加不创建完整 snapshot 的耐久 mutation 路径，避免 Draft 保存完成后 `structuredClone` 全部 History。
4. 保留旧 `studio-state.json` 格式和原子临时文件替换；本阶段不引入用户数据迁移。
5. 并发的 Queue、History、Settings 变化仍由各自事件同步；测试覆盖保存期间继续输入、切换 Create 模式和旧保存晚到。

### Queue live path

1. 增加按 task ID 的窄进度事件，只携带 `progress`、`stage`、`workProgress`、允许的实时 SeedVR2 展示字段和单调 revision。
2. ComfyUI 高频回调先更新主进程内存，去重相同值，并以有界频率合并发送 renderer；renderer shallow-patch 对应任务并复用现有 Queue DOM live patch。
3. 普通进度采用有界 checkpoint 持久化；结构性 mutation、恢复 checkpoint、完成/失败/取消和应用退出前立即 flush。
4. 结构性全状态事件到达时取消旧 task 的待发进度；renderer 忽略已完成、已删除或 revision 过期的窄事件。
5. 任务完成入史保持独立的结构性通知：Phase 1 可在 History 持久化成功后发送一次完整 `state:changed`，或发送等价的窄 `history:changed` invalidation；不能只发送 Queue progress/completion。History 页面据此刷新，新通知同时更新非 History 页持有的 History stale/count 状态。
6. 不把单纯延长 350 ms debounce、删除历史或只优化 DOM 当作完成。

### Phase 1 verification gate

- 使用约 920 条的合成 fixture；当前阶段不要求直接建立 10,000 条压力门槛。
- 断言 Draft save 的 IPC 响应和事件均不含 History/Image History。
- 进度风暴测试断言不会每个回调都触发完整 snapshot、完整持久化或 `state:changed`。
- 覆盖输入焦点/选区、连续输入、模式切换、保存乱序、排队时 Draft 保护、进度显示、取消、完成、重启恢复和 checkpoint。
- 覆盖“完成入史持久化成功后才通知”：History 页面可见时出现新作品；完成时位于其他页面，之后进入 History 仍能看到新作品；失败/取消或入史失败不发送虚假的新增通知。
- 运行 focused Vitest、`npm.cmd run verify`，再用隔离 userData 做 Electron 输入与 Queue 手测；不读取或覆盖用户真实状态文件。

完成门：用户可感知的输入假死链路被移出全量 IPC/clone 路径，且没有改变持久格式或恢复语义。只有通过本门后才进入存储迁移实现。

## Phase 2 — 建立窄仓储与查询边界

在仍能读取旧 JSON 的前提下，先让业务服务不再依赖“随处取得完整 AppState”：

1. 将 Draft/App documents、Queue 和 History 划分为明确 repository 接口；composition root 负责组合，不复制迁移逻辑到各服务。
2. History 增加 `list(cursor, limit, filters)`、`get(assetId)` 和窄 metadata mutation；列表 DTO 不携带原始 `comfyOutputs` 和完整版本诊断。
3. renderer 启动只接收小型 workspace/queue 状态和 History count；History 详情按 ID 获取。
4. History 列表采用分页或有界窗口，避免一次创建全部 DOM；媒体调度和详情返回行为保持现有契约。
5. 提供完整逻辑状态的测试/export 适配器，但禁止热路径借此重新构造全量 AppState。

完成门：业务和 renderer 已具备不依赖完整 History 数组的运行边界，旧 JSON adapter 仍通过现有兼容测试。

## Phase 3 — SQLite 影子导入与全量校验

SQLite 由独立 worker 持有，使用 Electron 内置 `node:sqlite`，避免同步数据库调用阻塞主进程。正式 schema 在实现前记录 ADR；预期至少包含 app documents、ordered queue tasks、history assets、可查询 tags/index 和 migration metadata。完整作品记录先以无损 JSON/BLOB 保存，列表字段单独索引。

迁移顺序：

1. 应用启动、renderer 开放写入前取得单实例/迁移锁，验证源 JSON 可读和磁盘空间。
2. 复制源文件到带时间戳的 `pre-sqlite` 备份，记录源字节数、SHA-256、schema 和各集合数量；不 rename 源文件。
3. 只创建 `studio.db.migrating`，在事务中导入 Draft/Create snapshots、Image Draft、Settings、Queue、History 和 migration metadata。
4. 不跳过坏记录；重复 asset/version/task ID、无法序列化记录或事务错误均使整次影子导入失败并回滚。
5. 校验所有 asset/task/version ID 集合、每件作品版本数、文件引用、Draft/Create 快照、Queue snapshot/checkpoint、收藏/评分/tags 和逐记录 canonical hash。
6. 运行 SQLite `foreign_key_check`、`integrity_check`，关闭后只读重开并重复关键校验。

完成门：影子 DB 与源 JSON 的逻辑内容全量一致；迁移失败路径仍从未修改的 JSON 正常启动。此阶段尚不切换权威存储。

## Phase 4 — 原子切换、持续备份与回退

1. 将校验完成并关闭的 `studio.db.migrating` 原子 rename 为正式 DB。
2. 重开并校验后，最后原子写入独立 storage manifest；只有 manifest 能把 SQLite 标为权威，不能仅凭 DB 文件存在猜测成功。
3. manifest 落盘前崩溃继续使用旧 JSON；落盘后使用 SQLite。旧 JSON 和 pre-SQLite backup 不自动删除。
4. SQLite 首次接受新写入前生成 initial backup；之后建立有限轮换的事务备份和显式完整导出。
5. Queue 完成采用同一 SQLite transaction 提交 History 并移除 Queue task；输出媒体先验证存在，派生缓存后处理。
6. SQLite 产生新写入后禁止静默回退到陈旧 JSON。需要降级时先从当前 DB 导出完整新 JSON；检测到旧应用修改过 legacy JSON 时走显式分叉/合并，不覆盖 DB。

崩溃矩阵至少覆盖：导入第 N 条、commit 前、DB rename 前后、manifest 前后、首次 DB 写入和备份期间退出。每种重启结果必须是“完整旧 JSON”或“完整已校验 SQLite”，不能出现部分/空资料库。

## Deferred optimization and scale work

首次安全切换后，另做可回退 schema migration：消除 asset/default-version 的 `comfyOutputs` 重复、按需压缩大诊断数据、增加更大规模分页/索引基线。10,000 条测试在 History 查询和有界 DOM 完成后再成为扩展性验收，不阻塞 Phase 1 止血。

## Release and rollback boundaries

- Phase 1 是独立 patch：不改变持久 schema，可单独发布和回退。
- SQLite 切换是后续 minor 级存储变更；必须有 ADR、迁移 fixture、真实状态副本的隔离演练、故障注入和 `CHANGELOG.md` 说明。
- 任何阶段发现 ID、snapshot、checkpoint 或 hash 不一致立即停止；不以“绝大多数记录成功”继续切换。
