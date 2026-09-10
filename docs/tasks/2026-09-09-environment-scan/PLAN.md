# 环境扫描提速执行计划

- 类型：后续实现计划；任务状态仅维护在 [TASK.md](TASK.md)。
- 日期：2026-09-09；执行规格细化于 2026-09-10。旧规划参考 HEAD `79c1d6c`；执行时以当前磁盘和 scoped diff 为准。
- 执行方式：用户自行交给 Luna（Max），由它独立实现和验证；不创建子 agent、不增加高级模型复核环节。
- 授权范围：本轮只编写计划。本文的代码改动由后续执行任务完成。

## 目标与已知证据

第一阶段已解决探针空结果误报、重复扫描合并和重复节点 API 请求，不能重做或删掉这些保护。既有本机数据见 [verification.md](evidence/verification.md)：完整热扫描约 5.8 秒，其中 H3 Python 探针约 4.0–4.1 秒；H3 与 llama 探针都在新进程导入 Torch。单次热扫描未明显加速。

本阶段让同一环境的重复普通扫描跳过已验证、未失效的昂贵 Python 原生加载；首次、失效和用户强制复检仍做真实探针。不要以增大超时、隐藏失败、减少必要检查或沿用过期 ready 状态充当提速。

首选方案只增加进程内短期缓存。暂不引入常驻 Python 服务、跨启动持久缓存、文件 watcher、大规模异步 UI 状态机，也不重写两个 Python 探针或改变生成策略。

## 1. 开工范围与文件

先读当前 AGENTS、TASK Resume，检查 git status 和目标 diff；仓库正在进行其他改动，旧 evidence 中两个 DLSS5 测试失败是历史记录，不能直接当作当前基线失败。仅阅读需要修改的函数，不重新调查环境问题或重跑旧实验。

| 范围 | 入口与职责 |
| --- | --- |
| 扫描编排 | `electron/services/environment.ts`：full/dependencies/runtime、Python 选择、缓存集成、真实复检入口 |
| 小型新服务 | 建议 `electron/services/python-probe-cache.ts`：内存缓存、时钟、指纹、generation、并发失效；不要继续扩张 environment.ts |
| 现有探针 | `attention-python-probe.ts`、`llama-cpp-python.ts`：保留真实探针与安装器直接自检；必要时增加调用适配，不复制脚本 |
| 请求与失效 | `environment-scan-coordinator.ts`、实际 install/uninstall/repair/update 入口；必要时核对 `runtime-admin-service.ts` |
| 类型与 UI | `src/types.ts`、实际 preload/IPC、renderer refresh coordinator、settings page/selectors/copy；只做缓存来源和强制复检所需的小改动 |
| 验证与文档 | 对应 focused tests、现有 `scripts/local-runtime-harness.mjs`、本 TASK/evidence、Dependencies 契约及 Unreleased |

不修改模型/LoRA catalog、历史播放器、生成图、依赖版本、用户设置文件或其他任务的规则文档。兼容已有调用签名；新增参数仅使用可选的 typed options，不添加 persisted 设置。scope 继续描述检查范围，验证强度单独表达，详见第 8 节。JS mirrors 仅按项目实际使用方式同步，不批量生成整个 src。

## 2. 先落实缓存语义

缓存只保存昂贵 Python 探针的原始验证证据，不缓存整份 EnvironmentScanResult，也不把 KJNodes 源码、模型文件或实时 API 注册状态一起冻结。

| 请求 | Python 探针策略 |
| --- | --- |
| 首次完整扫描 / 没有有效证据 | 跑真实探针，成功后写缓存 |
| 普通完整扫描 / 相同身份、指纹且未过期 | 复用探针；模型、节点文件和 API 按原 scope 刷新 |
| dependencies 刷新 | 强制真实探针，不能复用安装前缓存 |
| runtime 刷新 | 有匹配完整快照时只刷新服务；没有快照仍按现有规则回退 full；复用证据要带原始时间，过期状态不得伪装成本次已验证 |
| 用户“重新验证运行环境” | 绕过缓存，重新探测两套 Python 运行依赖；失效/失败仍保留现有可诊断状态 |
| 执行前环境验证、安装器前后自检 | 走真实验证，不能仅凭用于设置页提速的缓存放行 |

具体规则：

1. 内存缓存默认 TTL **5 分钟**，最多保留 **4 个环境身份**，不写用户磁盘。H3、llama 分别记录原始结果与验证时间，不能因为一个成功掩盖另一个失败。
2. 只缓存完整且无探针错误的成功原生验证。失败、超时、JSON 损坏不形成有效缓存；一次强制复检失败后清除此前成功证据，普通扫描不得又恢复旧 ready。UI 可保留失败探针自己的部分字段。
3. 身份至少包含规范化的所选 Python、ComfyUI core/data 根；Windows 路径大小写和分隔符规范化。保持显式 Python 选择，不能因 --version 失败切换解释器。远程 endpoint 保持既有 connection-only 边界。
4. 每次尝试命中前计算轻量指纹：所选解释器/pyvenv 配置，以及相关包 metadata 和已知原生入口的存在、版本、size/mtime。复用已有 Python 布局发现逻辑；不能可靠定位时按 miss 处理，不猜系统 site-packages。
5. 指纹只查有限文件/目录项，不递归读所有 site-packages、不哈希模型或 DLL 大文件、不导入 Torch/CUDA。明确它不能捕获所有外部修改；TTL 与强制复检是补充保障，不能宣称“任何外部改动都能立即识别”。
6. 不复用过期证据作为当前有效结果；不可使用 stale-while-revalidate 在后台失败期间继续显示 ready。缓存来源与原始 checkedAt 独立于本次 scannedAt。

## 3. 失效必须覆盖实际操作与竞态

先用 rg 列出所有可能改 Python/节点依赖的 app 操作和实际底层实现调用者，再在最小共享边界接入失效；仅在一个 UI 按钮或 admin service 失效不够，harness/安装器可能直接调用底层函数。

- 节点安装/更新/卸载（requirements 可能变更）、H3 加速安装/修复、llama 安装/卸载、ComfyUI 更新/修复：操作开始即 invalidate，在 finally 再 invalidate；失败/取消也可能留下部分修改。
- 为环境身份维护 generation。探针启动时捕获 generation，结束后仅在 generation 和指纹均未变时可写缓存。旧探针晚完成不能覆盖操作后的状态。
- 强制复检不能加入已运行的普通缓存扫描；扩展现有 coordinator 的 fresh 语义排队。若多个强制请求已排在同一轮操作之后，可合并一次真实复检；scope 与验证强度必须一并合并并传入实际 executor，详见第 8 节。
- dependencies/runtime/full 的覆盖关系不能凌驾于 freshness：普通 full 的缓存结果不等于“更强的真实 Python 验证”。必要时扩展 coordinator 的验证强度标识并添加回归，不只比较 scopeRank。
- 校验失败时返回未知/未完成并保持当前禁止安装/加速的保护；文件存在、包已安装、原生加载成功、节点在线注册继续分别判断。

## 4. 最小 UI 与诊断

- 普通“重新扫描”可复用有效证据；在 H3/共享 Python 运行环境区域提供独立、始终可发现的“重新验证运行环境”入口，失败与缓存命中时均可使用。不依赖隐藏快捷键。
- 缓存命中显示“运行环境已验证 · 验证于 … · 使用缓存”，失效/未完成显示现有警告；不要用新的扫描时间冒充验证时间。补齐简中、繁中、英文文案。
- 日志记录 `source=live/cache`、原始验证时间、缓存 age、miss/invalidation 原因、探针/指纹/整轮耗时和实际探针启动次数；不记录秘密、完整用户路径或原始脚本。
- 不新增 UI 重渲染通道；保留已有请求顺序保护、焦点/输入和安装队列反馈。强制复检按钮使用现有扫描进行中状态。

## 5. 回归验收（用 mock 时钟/runner，不等待真实 TTL）

1. 首次两个探针各执行一次；同身份普通复扫在有效期内执行零次重探针，原始 checkedAt 不变。
2. Python/root 切换、指纹改变、TTL 到期、dependencies 或 force 均重新探测；不同环境证据不串用。
3. timeout/噪声输出/部分结果仍符合第一阶段测试；失败不缓存，强制失败不能复活旧成功结果。
4. probe 开始后发生安装失效，旧 probe 结束不能写缓存；失败/取消的安装同样失效。
5. 普通扫描与强制/依赖扫描重叠时真实验证不被合并掉；同轮 force 去重；捕获调用时 settings snapshot。
6. 文件/KJ/API 变化在 Python cache hit 时仍可见；runtime 的来源时间明确；队列执行前与安装后验证不被绕过。
7. renderer fixture 验证缓存来源、未知状态、强制入口、安装禁止、本地化和连续操作状态。测试调用实际 cache/scan 集成边界，不能只测试一个孤立 Map。

先运行相关 focused tests，稳定后运行一次 `npm.cmd run verify`。只有代码变化或明确失败使证据失效才重跑相关检查；不要每个步骤完整 build。若有其他任务引起的失败，核对当前 diff 后报告，不擅自修其他功能。

## 6. 性能验收与停止条件

复用现有项目 harness，增加第 13 节规定的 `scan-benchmark` 动作及计时输出；普通 `scan` 仍默认 dependencies。禁止另起 Electron 或常驻 Python 服务来测缓存。基准必须在**同一 Node 进程**内连续调用，分别开 CLI 进程无法测内存缓存。

- 改动前最多补测 1 次预热 + 1 次热扫描；可复用旧 evidence 作为参考，但环境已变化时不当作严格同条件基线。
- 改动后测 1 次 miss、3 次连续命中、1 次 force。记录总耗时、Python 启动次数、H3/llama 时间、指纹时间、cache source/age；与相同设置、相同 scope 比较。真实机器不做 30 秒故障注入、安装重装或生成任务。
- 硬性验收：每个命中 family **0 次 Torch/CUDA 重探针**；两套原生验证均成功且未失效时，整轮命中为 0 次。强制及失效后确实运行，结果身份/时效和原始字段正确。缺包或验证失败的 family 不满足缓存条件，必须单列，不能计入“两套命中”样本。
- 性能目标：在已知约 5.8 秒热扫描环境，命中扫描中位数目标 **≤2 秒或至少降低 50%**。首次和 force 不承诺同等提速，不能把它们混入命中平均数。
- 若命中仍慢，依据阶段计时只优化一个已证实的剩余瓶颈（如网络版本查询阻塞），不要扩展成全扫描重构。一次有依据的修正后仍未达目标，如实交付实际数字和未解决瓶颈，不循环测跑耗费额度。
- 在线 ComfyUI 可用时做一次只读 schema 检查；服务离线就记录真实在线检查未运行，不启动/接管用户服务。此次不涉及生成策略，不要求 GPU 生成。

## 7. 收口

执行者自己完成 scoped diff 复核，更新 TASK、单份新的提速 evidence 和 Dependencies 缓存契约；写 Unreleased，按兼容的可选 UI/API 增量判定版本影响，不自动发版。记录实际模型/effort、子 agent 数 0、实际检查和耗时；usage 不可得填 unknown。

最终回复只需说明：改了什么、首次/命中/force 各多快、验证是否通过、尚存限制。不得声称消除了所有偶发失败，也不要以静态成功推断真实运行稳定性。

## 8. 请求接口与调用链：先按这份规格实现

以下是第 1–7 节的具体执行规格，不是额外并行任务。按第 12 节顺序完成；函数名可按当前代码命名习惯调整，但语义和测试不能省略。

### 8.1 对外参数和证据类型

在 `src/types.ts` 增加兼容的可选参数，沿已有 IPC 传递，不新增 channel 或持久化配置：

```ts
interface EnvironmentScanOptions {
  forcePythonProbe?: boolean;
}
// 原来一个/两个参数的调用保持有效。
scanEnvironment(settings, scope?: EnvironmentScanScope,
  options?: EnvironmentScanOptions): Promise<EnvironmentScanResult>;

interface PythonProbeEvidence {
  source: "live" | "cache" | "previous" | "none";
  state: "valid" | "expired" | "invalidated" | "mutating" | "failed" | "unknown";
  verifiedAt?: string; // ISO：真实成功验证结束时间，命中不刷新
  ageMs?: number;
  reason?: string;     // 有限枚举码，不携带本机完整路径
}
```

- 在 `AttentionAccelerationStatus` 和 `LlamaCppPythonStatus` 各加可选 `probeEvidence`。旧 fixture/旧调用无此字段时保持原解释，不把缺字段误判为已缓存或未安装；后端新增扫描路径必须填写。
- `source=live,state=valid` 只表示本次探针完成、观察可信，不等于所有依赖齐全，也不等于 H3 工作流可执行。真实缺包可以是 live/valid 且 ready=false，但不进入本轮成功缓存。
- `source=cache,state=valid` 必须同时满足身份、指纹、TTL、epoch 校验。`previous` 只能用于 runtime 刷新展示旧观察，不能提升为本次原生验证；无任何观察用 `none/unknown`。
- `verifiedAt` 与整个扫描的时间分开；耗时与 TTL 使用注入的单调时钟，展示时间使用墙上时钟。系统时间回拨不延长缓存生命。
- 参数归一化：只有字面量 `true` 才强制。`dependencies` 始终 live；普通 full 使用 auto。`runtime + forcePythonProbe:true` 明确升级成 dependencies，并在诊断记录 requested/effective scope；普通 runtime 不改变现有回退行为。

### 8.2 不可漏掉的传递与消费者

| 当前入口 / 定位符 | 要改成的行为 | 必须保留 |
| --- | --- | --- |
| `src/renderer/environment-refresh-coordinator.ts` 的 refresh reason → scope | 增加 `runtime-verification` reason，映射 dependencies + force；manual 仍 full/auto | latestRequestId、settings snapshot、旧请求不覆盖新页面 |
| settings coordinator/controllers/page/copy/selectors → `src/renderer/studio-client.ts` | 绑定强制入口；不另起裸 IPC 调用 | 扫描/安装进行中状态和现有错误反馈 |
| `electron/preload.cts` → `electron/environment-ipc.ts` → `environment-query-service.ts` | 三个边界都转发第三参数；query 统一归一化 | 原 channel、旧一/二参调用、typed preload |
| `electron/application-runtime.ts` 注入的 `(settings, scope) => scanEnvironment(...)` | 转发 options；否则 UI 虽然传了 force，实际会被 composition root 丢弃 | 注入关系与 service 可测试性 |
| `environment.ts` 的 scanFullEnvironment / scanEnvironmentDependencies | 通过扫描专用缓存适配器取得原生证据，再组装当前状态 | 所选 Python、KJ 源码/文件、节点/API 与模型检查 |
| `queue-runtime-service.ts` 的 dependencies 验证 | 明确保持 live，即使缓存有效也执行真实验证 | 执行前校验与串行 GPU 阶段 |
| `queue-enqueue.ts` 的 getCachedEnvironmentScan | 仍是机会性同步快照读取；不在入队时新增重探针 | 离线入队、文件复查和执行时验证 |
| `prompt-application-service.ts` 的 validateNativePromptRuntime | Gemma 原生 llama 放行前使用所选 Python 的直接真实 llama 自检，替换此次局部判断中的旧 llama 证据；可复用此调用内已取得的 live 结果 | Qwen 等其他路径的原有 schema/模型校验；不为全部 prompt 额外跑 H3 |
| `llama-cpp-python.ts` 安装器及 environment.ts 的安装前/后自检 | 继续直接调用 raw probe，不走扫描缓存 | 安装器可在自己的 mutation 区间中自检，不死锁 |

`getCachedEnvironmentScan` 不等于新原生缓存。保留模型/GPU/工具等完整快照；读取时只对失效的原生证据做副本投影，禁止原地改动已返回给调用方的对象。Gemma 调用点目前确实读取 runtime scan 的 `llamaCppPython.ready`，不能只处理 queue 而遗漏它。

同步 `getCachedEnvironmentScan` 只核对内存中的身份、TTL、epoch/mutation，标 source=previous，不新增 fs/Python I/O，也不承诺刚刚核验过磁盘。runtime 扫描的异步投影才做有限指纹复核。两条路径共用时效判定，但不能为了共用函数把同步入队 API 改成 Promise。

### 8.3 coordinator 合并规则

内部请求增加 `pythonValidation: "reuse" | "auto" | "live"`，分别对应正常 runtime、普通 full、dependencies/force。scope 和 validation 是两个独立维度。

1. queued spec 合并为 `max(scope)` + `max(validation)`，保留 fresh 边界；executor 必须接收**合并后的 spec**。当前 `joinQueued` 只有 scope 升级才替换闭包，直接给 options 加一个 bool 会漏执行 force，必须改这一点。
2. 普通请求只有在 active 的 scope、验证强度均覆盖，且没有跨过 mutation 边界时才能加入 active。fresh 请求继续排在 active 后，同一 pending 中的 force 可以合并；保留最多一个 pending 和错误后的恢复。
3. 例子：active runtime → queued 普通 full → 再来 dependencies/force，最终 pending 必须执行 **full + live**，不能执行 full + auto 或 dependencies + live。
4. 不把排队时的 TTL/fingerprint 命中结论缓存到闭包里；实际开跑时重新判断。每次操作仍使用请求捕获的 settings；不能读取稍后被用户编辑的全局 settings。
5. 真实强制验证开始时为目标 resource 建立新 epoch，并撤销旧成功缓存。旧 active 探针即使随后成功，也不得写回或发布 ready。跨 scan key 但共享 Python 的情况由第 9 节 resource 层保护。

一次 live 扫描在编排边界创建**一个共享 validation cycle/token**，再传给两个 family；不能在 attention/llama 的 `readOrRun(live)` 中各自递增 resource epoch，否则两个并行探针会互相失效。属于同一个 pending 的合并请求只创建一次 cycle；独立的下一轮 live 才建立新 cycle。T20/T21 同时断言两个成功结果均能保留，不能只检查 runner 次数。

## 9. 缓存服务：数据、指纹和失败路径

### 9.1 模块边界与操作

新增 `electron/services/python-probe-cache.ts` 管理条目、失效和在途调用；指纹代码单独放 `python-probe-fingerprint.ts`，避免把 fs/metadata 脚本与调度状态混在一个大文件。对时钟、fingerprint reader、raw runner 使用构造注入，生产使用一个进程内实例，测试各建实例。

建议的内部形状如下；不要把缓存实例传给 renderer，也不要把它写入 store：

```ts
type ProbeFamily = "attention" | "llama";
type ProbeMode = "auto" | "live";
interface ProbeIdentity {
  pythonPath: string;
  coreDirectory: string;
  dataDirectory: string;
}
// 具体 payload 按 family 保持类型关联，不能用 any。
// readOrRun(identity, family, mode, runRaw) -> { value, evidence }
// projectPrevious(identity, family, previous) -> 仅复核时效的展示副本
// beginMutation(target) -> finish()，finish 幂等，调用者必须 finally
// invalidate(target, reason) -> 撤销对应 resource 的全部身份条目
```

- Cache key = canonical Python + core + data；resource key = canonical Python。前者隔离实例证据，后者让共享 Python 的不同实例一起失效。相同路径仅大小写/斜杠变化不能造成 miss；root A/B 不能串用 H3 状态。
- 使用现有所选 Python/安装描述生成 identity，不另跑一轮 `discoverPythonRuntimes`。Windows `realpath` 能解析时用于别名归一；解析失败则不缓存。不要把空串 `path.resolve("")` 当成真实解释器。
- 条目保存原始 payload、manifest/fingerprint、resource epoch token、成功结束的 wall/monotonic 时间和原始 probe duration。最多 4 个 identity，H3/llama 分开；LRU 命中只改顺序，不续期。
- TTL 从成功结束时起算 300,000 ms；恰好到期就是 miss。失败不形成有效条目，不设负缓存或后台自动无限重试。
- epoch 使用不会因 LRU 删除再创建而重复的 token。删除条目、清空缓存、切回旧路径，均不能让旧 promise 的 token 再次合法；活动引用释放后清理控制记录，避免访问新路径导致永久 Map 增长。
- 普通同 identity/family/epoch 的并发 miss 共享一次 runner。共享 resource 的同 family 原生探针最多一个在跑、一个待跑的 live 请求；force 不加入更早的 auto runner，先撤销旧 epoch，再在其结束后真实复检。两个 family 维持当前并行方式，不新增常驻进程。
- 返回 payload 的副本；扫描组装 detail/KJ 状态不能污染下一次命中。Cache eviction 只影响复用，不取消用户请求，也不杀正在运行的进程。

### 9.2 指纹的具体范围与预算

用一次**只用 Python 标准库的布局/metadata 发现**解决 venv、embedded、system Python 的实际 sys.path，不能根据目录名称猜包在哪里。新 helper 使用所选解释器，3 秒超时、1 MiB stdout 上限，输出带固定前缀的 JSON；只显式导入 sys/site/importlib.metadata/json 等标准库，不加载 torch、llama、Sage 原生模块。仅在冷缓存或 manifest 失效时执行，命中时不启动这个 helper。helper 失败不改变 Python 选择，也不覆盖真实探针结果，只让这一轮不缓存。

manifest 记录解释器真实路径、prefix/base_prefix、有效搜索目录、相关 distribution metadata 路径及其声明的原生文件位置。Node 根据 manifest 做前后两次轻量指纹；首次布局发现之后、原生 runner 之前拍 before，原生结果返回后拍 after。只有 before=after 且 epoch 相同才入缓存。

| 指纹分组 | 检查内容 | 边界 |
| --- | --- | --- |
| 解释器与布局 | python.exe、相邻 Python DLL、pyvenv.cfg、`python*._pth` 的存在/size/mtime；影响搜索路径的进程环境摘要 | 包括 PYTHONHOME/PYTHONPATH/PATH 的内部摘要；不输出其原文 |
| 搜索入口 | manifest 中有效目录的直接子项名称/mtime；`.pth` 文件内容摘要 | 不递归整个 site-packages；入口变化就重新发现布局 |
| H3 包 | torch/torchvision/torchaudio、SageAttention、实际 triton distribution、comfy-kitchen 的版本、METADATA/RECORD 与声明的原生入口 | 以 metadata 规范化包名识别 triton/triton-windows 等，不靠猜版本目录 |
| llama 包 | llama-cpp-python、torch 的 metadata；llama/ggml/ggml-cuda 等实际 DLL/原生入口 | 捕捉仅替换 backend DLL 而版本号不变的情况 |
| 外部搜索位置 | `.pth` 静态路径与 helper 实际 sys.path | editable/动态可执行 `.pth` 或无法覆盖的外部加载来源，标 uncacheable；不得宣称支持所有布局 |

- `.pth` 的通用、已知启动项若要允许，必须记录精确内容指纹，并以 fixture 证明它不会引入未跟踪的包来源；无法证明则保守 miss，不能为了命中忽略它。以实际本机 manifest 是否可缓存作为验收数据之一。
- 有限读取：每轮最多 2,048 个指纹条目、小文本总量最多 4 MiB；超限/权限错误/manifest 损坏 → uncacheable。大 DLL 只 stat，不读内容；RECORD 若超出文本预算不能悄悄截断后命中。fs 并发上限 16，搜索目录只列直接子项。
- 命中前仍重新枚举上述入口并 stat 相关文件。不能用缓存的 fingerprint 字符串和自己比较；也不能每次命中重跑 metadata helper、`pip list` 或 Python `--version` 来“验证缓存”。现有 full 的解释器发现成本另计，不在本次顺便重写。
- 两个 family 同轮共用解释器/layout 与 torch 指纹工作；各自保留独立包签名。期望 fingerprint 阶段 ≤300 ms，超过则在 evidence 单列路径数量与阶段耗时，不通过少查文件让数字变好。
- 这里只检测所列文件的变动信号，不读取所有原生二进制内容，不保证发现原地同 size/mtime 修改或未列出的动态系统变化。5 分钟 TTL、显式复检与执行前自检保留这一边界。

### 9.3 成功判定与状态组装

- Attention 缓存的是 `AttentionPythonProbe`，不能缓存完整 `AttentionAccelerationStatus`。原生成功至少要求 complete、无 probeError/errors、无 sageNativeError/comfyKitchenProbeError、Torch/CUDA 观察完整、Sage 原生加载成功及所需 kitchen backend 可用；具体版本/硬件策略继续使用现有 helper，不复制另一套版本矩阵。KJ 源码不参与缓存成功门槛，每轮重新算。
- llama 只缓存 `ready=true && !error && !nativeCrash && !nativeCrashCode` 的 raw status；明确处理“stdout 有成功 JSON、进程仍异常退出”，不能只看 ready。若目前 status helper 遗漏退出错误，做最小错误语义修正并保留回归。
- 真实失败返回**本次**部分字段和错误；不得从历史成功补齐当前缺失的版本/ready。指纹发现失败但 raw probe 成功时照常展示 live 结果，只是不写缓存。
- runner 期间 epoch/fingerprint 改变：丢弃写入资格，并把本次结果标 invalidated、ready=false，提示环境发生变化需复检；保留本次已观察到的字段，不伪造成缺包，也不自动重试第二遍重探针。
- runtime 或同步旧快照投影发现 expired/invalidated/mutating：保留观察值、原 verifiedAt，将原生 ready 降为 false，用新 evidence 驱动“待复检/正在变更”文案，不能复用 `missing` 逻辑列出一串未安装。runtime 可以执行有限 fs 指纹复核，不启动 metadata/native helper；无 manifest 则 unknown。
- H3 `supported` 不用于表达缓存失效；硬件不支持与证据过期分开显示。旧 `probeState=failed` 的不完整保护继续有效。真正 live 观察到缺包时，原有可修复/安装入口仍可用。

## 10. 操作失效：具体写入边界与嵌套规则

在以下共享函数的**第一处可能修改文件/执行 pip 前** beginMutation，并用 try/finally 结束。可把 begin 提前到整个公开函数，但不得只包成功返回分支。失效目标覆盖 Python resource 的全部 core/data 身份；操作前尚不能确定 Python 时，保守使所有原生缓存失效，并阻止扫描缓存层新探针，不能猜另一个 Python。

| 入口 | 需要接入的位置 | 特别检查 |
| --- | --- | --- |
| `dependency-installer.ts` installCustomNodePackage / uninstallCustomNodePackage | 底层导出的操作函数 | 节点 requirements 可能改共享 Python；harness 可以绕过 admin |
| `llama-cpp-python.ts` installLlamaCppPythonPackage / uninstallLlamaCppPythonPackage | 已有安装事务的公共入口，沿用事务 | 节点安装会嵌套调用它；安装前后 raw 自检仍可执行 |
| `environment.ts` installAttentionAcceleration | 整次升级/安装的资源区间 | Torch/Sage/Triton/kitchen 任一步失败或取消仍 finally 失效 |
| `environment.ts` updateComfyUi / repairEnvironmentIssue | 会改 core、requirements、Python 的分支 | 纯只读诊断不增加 mutation；会写依赖的修复不能遗漏 |
| runtime-admin、environment 的 install/uninstall facade | 审核调用是否已被底层覆盖 | 不为同一个函数链层层增加独立互斥锁 |

- 一个 resource 用 mutation depth + epoch：每次 begin/finish 撤销此前证据，depth>0 就是 mutating。嵌套 finish 不得提前恢复可缓存；最外层 finally 完成后才解除状态。finish 幂等，异常/取消都释放引用。
- 目标未知的变更另用全局 depth/token；所有资源的写入资格同时检查全局和本资源 token。这样“未知目标操作中途才发现一个新 Python”也不能漏过失效屏障；全局与局部嵌套结束不得互相解锁。
- 这是缓存一致性标记，不是另建安装队列/互斥锁。沿用现有 transaction 与 UI 队列；raw installer probes 不经过这个 gate。
- 变更期间到达的普通/force 扫描不启动 native runner、不等待安装锁，返回 mutating + ready=false。既有安装完成后的 dependencies 刷新做一次 live 验证；用户强制按钮在安装中禁用并显示原因，不能悄悄把 mutating 当成功。
- begin 前已启动的探针允许自然结束，但其 epoch 不再合法。不要通过杀进程来实现缓存失效，也不要在安装 finally 中自动发起完整扫描造成递归/重复刷新。
- `installDepthAnything` 等仅下载权重的操作无需让原生缓存失效；模型、输出目录变化不应自动把 Python 判缺失。删除全部旧 scan 快照会丢失局部刷新收益，禁止以此代替有范围的原生证据失效。

## 11. UI 与可观测性验收细节

复用 Settings 现有按钮/提示样式，在共享 Python 运行环境区域增加一个“重新验证运行环境”。H3 与 llama 展示各自证据来源和时间；用同一个动作复检两套依赖，避免两个按钮同时启动重复扫描。补齐 `zh-CN` / `zh-TW` / `en-US` 及对应实际 mirrors。

| 状态 | 展示/操作 |
| --- | --- |
| live/valid 且 ready | 现有就绪状态 + 真实验证时间 |
| cache/valid | “使用最近验证结果” + 原时间；普通重新扫描可命中 |
| live/valid 但确实缺包 | 显示实际缺项；保留原安装/修复条件 |
| failed | “检测未完成”与阶段/可操作错误；不得变成“环境不支持/全部未安装” |
| expired/invalidated/unknown | 旧观察标“待重新验证”，ready=false；可点击强制复检；不推断缺包 |
| mutating / 正在扫描 | 保留阶段反馈；强制按钮禁用，既有安装/扫描完成后恢复 |

诊断在扫描边界汇总，避免每个 fs.stat 打日志：每轮包含 scope/validation、full fallback、totalMs、discoveryMs、runtimeApiMs、catalogReleaseMs、fileScanMs、fingerprintMs，以及两个 family 的 source/state/reason、ageMs、nativeStarted、nativeDurationMs。并行阶段不可直接相加当总耗时；命中不把旧 nativeDurationMs 记成本轮耗时。不同调用路径可以共享计时 helper，不能为 harness 再写另一份扫描器。

固定 reason 至少覆盖 empty/expired/identity-changed/fingerprint-changed/uncacheable/forced/mutation/inflight-invalidated/probe-failed。日志只输出匿名 identity 摘要和计数，不输出设置全文、代理凭据、完整用户路径、metadata 原文。现有失败日志与 checkpoint 错误细节继续保留。

## 12. 单 agent 的执行顺序与具体回归

阶段是依赖顺序，不是 agent 分工；无需逐阶段回用户请求批准。检查只在变更使已有证据失效时重跑。

| 阶段 | 修改与完成条件 |
| --- | --- |
| S0 基线 | 读 TASK/目标 diff；确认第一阶段 helper 仍在。只核对本计划列出的调用者、脚本与测试；记录相关 dirty 文件。不要从旧日志重新调查一遍故障 |
| S1 cache/fingerprint | 写两个小服务和独立 fixture 测试；成功/失败/TTL/身份/原生文件变化/容量/epoch 可验证；默认尚不接 UI |
| S2 scanner/coordinator | 接 raw evidence 复用、合并后的 spec、runtime/旧快照投影；证明 cache hit 时 KJ/API/文件仍刷新、dependencies 仍 live |
| S3 mutation/执行边界 | 完成底层嵌套失效、queue 保留、Gemma 真实 llama 自检；证明失败取消及旧结果迟到不会复活 ready |
| S4 IPC/UI | 全链转发 options、强制按钮、来源时间、本地化；验证用户最终点击确实使 raw runner 运行 |
| S5 harness/验证 | 实现第 13 节动作，跑针对性测试，整合状态跑一次 verify，然后用其产物执行一次基准序列和必要 UI 检查 |
| S6 收口 | 检查 scoped diff、意外删除、兼容边界；更新 TASK/evidence/受影响契约/Unreleased，报告实际效果与限制 |

新增服务测试建议 `tests/python-probe-cache.test.ts`、`tests/python-probe-fingerprint.test.ts`。集成优先扩展现有 `environment.test.ts`、`environment-scan-coordinator.test.ts`、`environment-refresh-coordinator.test.ts`、`prompt-environment-services.test.ts`；必要时新建窄的集成文件，不把整个 environment 模块复制进测试。

以下是必须覆盖的行为，不要求一行一个 test；使用 deferred promise、fake clock、临时目录和 mock runner，避免真实 GPU、安装或等待 5 分钟：

| 编号 | 场景 / 操作 | 客观断言 |
| --- | --- | --- |
| T01 | 首次 full 后再 full | attention/llama 各从 1 次维持 1 次；source 变 cache，verifiedAt 不变 |
| T02 | TTL 前 1 ms、等于 TTL；墙钟回拨 | 前者命中，边界 miss；墙钟不续期 |
| T03 | 连续命中后达到首次验证 TTL | 不因最近访问延长；probe 再执行 |
| T04 | Python 大小写/分隔符/realpath 别名；更换 core/data | 同一规范化 identity 命中；不同实例不串用 |
| T05 | 两实例共享 Python；其中一个安装 | 两实例原生证据都失效，其他 Python 不受影响 |
| T06 | 第 5 个 identity 淘汰第 1 个；第 1 个旧 promise 后返回 | LRU 有界；旧 token 不能在重新创建条目后写回 |
| T07 | 两个普通 full/miss 同时进入 | 同 identity/family 实际 runner 一次；失败后下一次可重新执行 |
| T08 | H3 成功、llama 失败 | H3 可命中、llama 重试；不把整轮标“两套命中” |
| T09 | 强制复检超时/原生 crash 后普通 full | 不恢复强制前成功；保留新失败部分字段 |
| T10 | 检测只有最终 JSON 无完成 checkpoint / 有噪声输出 | 继续满足 attention-python-probe 的既有错误与解析测试 |
| T11 | llama 成功 JSON + 非零退出码 | 不写成功缓存；报告原生/进程异常 |
| T12 | metadata 版本、RECORD 或原生 DLL mtime/size 改变 | 对应 family miss；版本号没变也不能命中旧 DLL |
| T13 | pyvenv/._pth/.pth/PYTHONPATH 或搜索目录变动 | 重新发现布局；未知动态来源为 uncacheable |
| T14 | 指纹权限错误、超预算、helper 超时/坏 JSON | 不命中；真实探针仍运行，其结果不被伪造成失败/缺包 |
| T15 | 命中路径 | metadata helper 调用数不增加；无递归全目录/无 DLL 内容读取；fs 并发有界 |
| T16 | 真实探针期间指纹改变或 beginMutation | 返回 invalidated、ready=false，不能写缓存 |
| T17 | 嵌套节点→llama install；内层 finish，外层尚未结束 | 仍 mutating；raw 安装自检不死锁；最外层 finally 后可复检 |
| T18 | 操作失败/取消；finish 重复调用 | 原成功失效、depth 不为负、资源状态可恢复 |
| T19 | mutation 期间普通/force scan | 零新增 native runner；mutating 明确可见，无成功假象 |
| T20 | active runtime + pending full/auto + dependencies/live | 最终 pending 为 full/live 且真实 runner 执行；一个 pending |
| T21 | ordinary active 后多个 force；active reject | force 不拿旧 active 结果；同 pending 合并；reject 后队列可继续 |
| T22 | Python 命中但 KJ 源码/模型文件/API schema 改变 | 新变化可见，H3 ready 按新 KJ 条件重算 |
| T23 | runtime 有快照/无快照；TTL 后 runtime | 有快照不加 native；无快照保留 full fallback；旧证据原时间且无过期 ready |
| T24 | getCachedEnvironmentScan 返回对象被消费者修改 | 不改变新原生缓存；原快照不被投影代码原地修改 |
| T25 | queue 入队、queue 执行、Gemma/Qwen prompt | 入队不加 native；执行 dependencies live；Gemma 不能凭 cache ready 放行；Qwen 不加 H3 自检 |
| T26 | renderer 强制按钮经过完整 preload/IPC/query/injection 链 | 最终 scan 收到 force；旧一/二参调用仍有效；runtime+force 归一化可测 |
| T27 | 等待扫描时改 settings；先后两个请求乱序完成 | runner 使用各自 snapshot，页面仅提交最新请求结果 |
| T28 | cache/failed/expired/mutating/确实缺包的三语 fixture | 文案、真实时间、安装限制和强制入口符合第 11 节；键盘可达 |
| T29 | harness benchmark mock | 一个进程/同设置/5 轮顺序正确；普通 scan 默认依然 dependencies；统计使用本轮计数 |
| T30 | 离线、远程端点、多安装候选 | 离线文件扫描与 API 失败分离；不启动远程服务或依据远程 URL 安装本地依赖；明确选中实例 |

保留现有 attention/llama/coordinator 故障回归。定向命令从实际修改文件选择，例如先 `npm.cmd test -- tests/python-probe-cache.test.ts tests/python-probe-fingerprint.test.ts tests/environment-scan-coordinator.test.ts`，集成后补相关 environment、installer、queue、prompt、settings、IPC、harness 测试。不要每完成一个表格阶段就跑全套 verify。

## 13. Harness、性能证据与交付格式

### 13.1 现有 harness 的限制与新增动作

`scripts/local-runtime-harness.mjs` 当前 `scan` 硬编码 `scanEnvironment(settings, "dependencies")`；它读取构建产物并在单次动作后退出。直接反复运行该命令只会反复真实复检，不能证明进程内缓存有效。

在同一脚本新增 `scan-benchmark`，同步扩展 supportedActions、parse/help、runHarnessAction、JSON summary 和 `tests/local-runtime-harness.test.ts`；不改 repair/restart 行为。动作只读 settings，固定执行下列五轮，不接受无限次数或后台循环：

```text
同一个 Node 进程、同一个 structuredClone(settings)、同一个 scanEnvironment 模块实例：
1  full / auto                    // 新进程自然 miss，不清用户缓存/文件
2  full / auto                    // eligible family 应命中
3  full / auto                    // 同上
4  full / auto                    // 同上
5  full / forcePythonProbe=true   // 必须真实复检
```

每轮等待上一轮结束；保存 scope/effectiveValidation、totalMs、阶段耗时、各 family source/state/age/verifiedAt/nativeStarted；输出第 2–4 轮中位数、首轮与 force 单列。没有两个可缓存的健康 family 时，输出 `not-comparable` 原因和逐 family 成本，不能把失败重试样本当作命中样本，也不能安装依赖只为取得好看的基准。

下列命令是**实现新增动作之后**的验收命令，现在不能假设已有：

```powershell
npm.cmd run verify
npm.cmd run harness:comfy -- scan-benchmark --json
```

verify 产物必须对应最终扫描代码；若测试阶段提前失败未构建，协调 dist 资源后单独完成必需 build，并明确 verify 未通过，不能运行旧 dist 后声称已测新实现。禁止为了测本轮缓存重复启动 Electron/ComfyUI；已有服务可只读检查，不接管或重启它。

### 13.2 基线与结束标准

- 优先复用已保存基线，但明确不同日期/dirty state 的比较限制。需要严格同比时，在 S0 用同配置的临时只读调用完成最多 1 次预热 + 1 次旧实现 full 热扫描；不先大改旧 harness、不反复测故障。
- 对新实现只有一组 5 轮序列；因代码改变或明显测量故障才补受影响样本。先确认命中 source 和零重探针，再讨论总时间；首轮包含布局发现，force 不包含缓存提速承诺。
- 如果 3 次命中未达 ≤2 秒或相对可比旧 full 热扫描降低 50%，使用已有 phase 数据定位最长等待，最多做一次有证据的窄修正。已知 `discoverPythonRuntimes` 还会执行 py/where/--version，版本查询也可能等待网络；它们只是待测项，不能在未计时前直接认定为新的主因。
- 手动 UI 核对缓存→强制→失败/待复检状态、按钮键盘焦点、连续改路径后正确实例、扫描时正在编辑的设置不被覆盖；按现有 UX 契约视口验收。没有可用受控 app 会话时报告 manual 未做，不为了完成截图抢占用户服务。
- `evidence/performance.md` 保存一张表：代码基线/dirty 范围、环境类别与服务在线状态、是否可缓存、各轮总/阶段耗时、原生次数、来源/时间、定向测试与 verify 结果、手动未验证项。不要提交机器绝对路径、完整日志或 settings。
- 收口的硬条件是失效/force/执行前验证没有被绕过，eligible hit 零重探针，测试证据对应最终文件；性能目标未达到必须明确写明剩余耗时，不用静态测试通过宣称“扫描已经足够快”。

给 Luna 的执行指令可直接使用：**“按本 TASK 的 PLAN 第 8–13 节和 S0–S6 顺序，单 agent 完成实现、验证与 evidence；不再派子 agent，不重做第一阶段调查。常规实现选择自行完成，遇到本计划已说明的不可缓存或离线环境如实记录；只在缺少必要产品决定或不可解的资源冲突时停下来说明。”**
