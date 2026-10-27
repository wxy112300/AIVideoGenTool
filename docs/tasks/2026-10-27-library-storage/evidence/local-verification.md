# 本地实现与隔离验收

日期：2026-10-27。当前状态与下一步仅见[任务](../TASK.md)；用户已要求只准备本地实现与配置，实际电脑与群晖不在本机。以下证据不代表实库迁移或 NAS 真机部署完成。

## 存储与恢复边界

- P0：读取/结构/权限/迁移失败不写默认空库；校验配置备份、损坏原件与恢复来源保留；候选 flush/read-back，Windows 锁定只重试 rename；失败回滚内存，拒绝陈旧写入者。当前活跃配置不会因回到较老内容而被备份保留策略删掉。
- P1/P2：Documents 分作品不可变记录、长文本去重、完整提交与删除标记，AppData 原子定位；完整迁移前副本与独立重开比对，视频/图片/多版本/扩展字段/缺媒体引用保留。换位置复制后切换、保留原目录和 library ID。缺库/冲突阻止启动；原生恢复允许重试、选择匹配原库，首次迁移可明确另选空目录。
- P3/P4：只投影已提交变更，按 library ID 隔离；资料/媒体根独立；记录/Prompt/封面先到齐再切换完整代次。NAS 在本地 SQLite 事务导入，按需读 Prompt，重启保留最后有效库；物理/逻辑索引损坏保留原件后重建，拒绝将 /data 配进同步源。旧 catalog 模式兼容。
- 桌面复用现有内存查询/分页，不引入 Electron SQLite 驱动或第二份权威历史。首版不自动回收作品对象与旧提交，空间需监控。多机合并/同时写同一主库不支持。
- 自动审阅拒绝过永久主机/路径绑定方案，该补丁未应用。替代为进程存活期的临时 OS 管道锁；测试关闭后另一 profile 可打开同一库，不妨碍迁移/恢复。

## 聚焦与完整 gate

- 0/137/1200 视频和同数量图片的隔离迁移、重启、ID/版本/长文本/扩展字段/缺媒体；目标非空、中断切换重试、缺库、换位置、临时锁、显式恢复通过。
- 故障覆盖截断、缺集合、权限、ENOSPC、无有效备份、迁移持久化失败、陈旧写入；源原件保留，不生成默认空库。
- NAS 覆盖发布失败重试、Drive 乱序/截断/旧代次、明确删除、进程重启、SQLite 物理/逻辑损坏重建以及同步源写保护。旧 catalog 测试保持通过。
- 最终四 worker `verify`：2746 unit + 102 integration、clean typechecked build、440 对比度通过；`temp/library-storage-verify-final.log` 是最后运行记录。前两次默认全并发触发既有 Git/目录清理测试 5s 超时；四 worker 未放宽断言或时限。NAS 独立 build/typecheck 通过，作用域 diff 空白检查与交付文档相对链接检查通过，无意外删除。

## 真实 Electron

复现：`node scripts/harness/library-storage-smoke.mjs`。最终 `temp/library-ui-lWAjI0/report.json` 通过：

- 真实迁移、旧视频解码、收藏/评分/标签/父页返回；元数据变更不替换播放器。
- 目标冲突 → 键盘恢复 → 实际 Save → 同一库 ID 换位置 → 自动发布；1280/1440/900 宽度无横溢出。
- 缺 Prompt → 键盘补齐 → 真实入队 ID `d8bb3698-b0ef-42c4-8909-8bddd948e8dc`；后续草稿不改 task，两次原生关闭与重启后原历史/任务仍可达。
- 重启保留既有 schema-16 对缺失 H3 inert memory 字段的默认补全，其余 task 字段严格一致。只入队、不执行队列；VAE 为明确的扫描占位文件，不能据此声称模型/生成可用。

首次误定位隐藏收藏按钮、入队后过早键入、隐藏窗口句柄已分别改为可见控件、等待 renderer ready、同 profile second-instance show/focus。关闭通知的自动化也改为定位持久错误，避免信息条自动消失的竞态。失败报告保留，未放宽用户提交门槛。最后一轮验证冲突错误本地化且无 IPC 实现前缀，并复核正常屏幕。

## NAS 浏览器

`node Tools/NasBrowser/smoke.mjs --v2` → 最终 `temp/nas-browser-smoke-1793099305865/report.json` 通过。390×844、768×1024、1024×768 的实际筛选/无结果恢复/相册/播放帧推进/安全区/Prompt 纯文本/返回通过，无 preload/编辑控件。独立 Documents/media 根；使用 focus emulation 和 CPU H.264，不代表真机 Safari 或 Docker。

已人工查看最终设置 1280/1440/900、NAS Prompt 和 iPad 横屏截图，另查看过手机播放器；路径组件与现有样式保持，正常屏幕无错误通知。保存成功和扫描中的既有状态通知不属于新说明文案。

## 一万条存储规模

`node scripts/harness/probe-library-storage.mjs` → `temp/library-scale-shjZJ8/report.json`，10000 条合成记录/共享长 Prompt，原始数据为隔离内存构造：

| 项目 | 本机实测 |
| --- | --- |
| 首次耐久写入 | 340.94s |
| 冷读 | 15.05s |
| 平均 ID 查询 | 0.047ms |
| 单条修改 | 254.43ms |
| 无变化 prepare | 68.33ms |
| 冷读 / 结束 RSS | 294.8 / 371.9MiB |
| 单条修改新增作品对象 | 1 |
| 共享长文本对象 | 1 |

首次逐对象 flush 有明确成本，不能宣传为瞬时迁移。该探针不是完整 Electron 启动/DOM、GPU、媒体解码或画质基准；NAS 分页另测。合成对象已清理，仅报告保留。

## 一万条 NAS SQLite / HTTP 规模

`node scripts/harness/probe-nas-storage.mjs` → `temp/nas-scale-i7ZyYP/report.json` 通过。使用 10000 份合成 v2 记录、一个共享长 Prompt、真实服务进程/SQLite/HTTP；媒体仅占位字节，不作播放/解码依据。夹具并行写入不代表生产发布的耐久写入成本。

| 项目 | 本机实测 |
| --- | --- |
| 冷导入并检查媒体 | 21.80s |
| 建立完整筛选查询 | 13.68ms |
| 30 次分页 P50 / P95 | 1.65 / 2.44ms |
| 按需 Prompt | 1.60ms |
| 单记录更新后重启 | 8.33s |
| 同步指针截断后重启 | 5.76s，仍保留最后完整记录/Prompt |
| 服务 RSS | 108.3MiB |

索引保留 10000 条作品、一个文本对象；单条新版本可见，源指针截断时 `/healthz.refreshError=true` 但已验证库仍可读。服务进程已退出，合成目录/SQLite 已清理，报告/日志保留。本机数字不代表 DS418play 性能。

## 资源与现场边界

### 启动进度补充（用户追问后）

- 新增 `library-storage-progress` 瞬态 DTO/三语言呈现、record-store 写入/读取计数和无权限的启动小窗。复用已构建 renderer 主题；无 preload、AppApi 或永久状态字段。备份/切换不编造总进度，数值百分比只代表当前可计数阶段。快速完成/失败取消待显示窗口，正常完成等待主文件和 initial-state 就绪后关闭；启动期关闭辅助窗口不触发 App 自动退出。
- `temp/library-progress-verify.log`：2750 unit + 104 integration、clean typechecked build、440 对比度通过。后续快速完成不闪窗的小修用 `tests/library-startup-window.test.ts` 与进度呈现共 6 项通过，随后 Electron 编译和真实应用验证通过；没有重复声称旧 NAS/一万条数字是新版窗口的性能基准。
- `node scripts/harness/library-startup-progress-smoke.mjs` → `temp/library-progress-LnQETZ/report.json` 通过：可见的 600 条实际写入进度从 6→8，独立校验与兼容保存阶段可见；只读页面无 preload、460px 无横溢出。实际终止本次 Electron 子树后，旧 state 与迁移前副本逐字节一致；同 profile 重启显示重试进度，全部 600 作品/版本 ID 及扩展字段一致，无重复，转入主窗口后进度页消失，原生退出通过。已查看进度截图，主题/层级符合现有模式。
- 测试脚本曾遇到动态版本标题未就绪、OS 退出先于 Node exit 回调、首条记录合法显示 0% 的时序/断言问题；已修正等待和精确计数断言，失败夹具保留，不改生产进度或持久化门槛。
- 相邻全 UI 再验 `temp/library-ui-ixVEHw/report.json` 通过：播放/收藏/评分/标签/返回、目标冲突恢复/实际 Save/后台发布、缺 Prompt→键盘→实际入队、草稿不改任务、两次原生关闭重启。task ID `9396e6c6-b8c6-4ade-88f0-d59d5e90dd4e`；没有启动队列/GPU生成或读实库。
- 本补充为 patch，版本不升、不打包/推送。小窗可最小化，不提供迁移中途关闭/取消按钮；意外进程中断的安全重试已实测。
- 收尾窗口/呈现/主进程边界/guide 共 28 项通过，作用域 diff 空白检查通过。已查看最终进度截图；本次进度与相邻 UI 进程为 0，CDP 2534/2552/3192/3419 监听为 0。

全程未读用户历史库，未启动 ComfyUI/GPU，未访问另一台 PC/NAS。最后只读进程复核：本次 library-ui / nas-browser-smoke / nas-scale / probe 相关进程为 0；最新两个 App CDP 11444/11704 监听为 0。自有 Electron/CDP/Node 服务已回收。Docker CLI 经实际检查不可用，未构建/导入镜像，DSM 6 内核与 Docker、ACL、实际 Drive 路径和真机设备均留现场。

操作、备份与现场清单见[资料库/NAS 手册](../../../runbooks/LIBRARY_STORAGE_AND_NAS.md)。版本影响 minor，package/lockfile 保持 0.67.0，未提交推送或创建 Release。

## NAS 设置简化补充（2026-10-27）

- 用户明确 NAS 同步路径由 Drive 管理。移除 App 的 NAS 发布目录字段及对应三语言文案；自动维护 `<Library>/StudioLibrary/<libraryId>`。旧配置字段不再使用，旧外置发布文件保留。NAS 配置的 libraryRoot/mediaRoot 仍用于映射容器只读挂载，示例和操作手册已更新。
- 库移动前完成待发布变更，复制并校验已发布对象、文本及提交后切换，保留更新序号；发布未恢复时不切换。自动发布解析配置的完整媒体根。NAS 集成测试验证旧外置路径不被写入，以及 NAS 从移动前到移动后的更新连续可读。
- 37 项聚焦及 typecheck 通过；最终 `temp/library-auto-publish-verify.log`：2753 unit + 104 integration、clean typechecked build、440 对比度全部通过（四 workers）。
- 真实 Electron `temp/library-ui-aofhPY/report.json` 通过：设置无 NAS 路径项，冲突目录保留/可见错误→修正→实际 Save，库内自动发布；历史视频实际解码、收藏/评分/标签不替换播放器，返回可达；缺 Prompt→恢复→实际入队，任务 ID `660c0885-764b-4a87-9fd1-d5933ab7e6f1`，后续草稿编辑与两次原生退出重启保留队列/历史身份。1280/1440/900 无横溢出，已查看 1280 与 900 设置截图。
- 两次先行 UI 尝试因启动/CDP 等待超时失败，报告分别保留在 `temp/library-ui-6QBcvG`、`temp/library-ui-ARzVeu`。夹具将发现阶段与普通 UI 命令的等待时间分开，并允许启动迁移最多 120 秒；未更改生产代码的保护门槛或降低断言。最终通过不代表启动性能承诺。
- 本补充为 patch，未升版本、打包或推送。仅隔离合成库；实际电脑、群晖、Docker 与真机验收范围不变，未启动 ComfyUI/GPU。

## 已迁移库重复启动弹窗修复（2026-10-27）

- 原因：窗口接收 migration 和 opening 两种进度，普通读取超过 250ms 就创建启动窗口。现窗口只接受 migration，普通读取不再创建窗口；存储层仍校验、读取并在错误时走恢复，没有改写或跳过迁移状态。
- 新增窗口行为测试：两次 opening，各模拟 120 秒读取与 complete 均零窗口；原有慢迁移创建只读窗口、快速迁移不闪窗和交接释放断言仍通过。窗口/呈现/主进程边界共 20 项通过，typecheck 与 Electron 编译通过。本次为局部窗口条件修复，未重复声称此前 full verify 针对此最终条件重跑。
- 真实已迁移隔离库连续启动两次：`temp/library-restart-kgbEFo/report.json` 通过，浏览器 Target 事件监测均无迁移窗口；主界面可达，资料库提交、作品 ID、已入队任务 ID 与迁移前副本数量保持一致，两次正常退出。PIDs 5240/14280，CDP 6615/6661。未访问实际用户库或启动 GPU。

## 用户确认后的三类目录真实移动（2026-10-27）

- 最新授权要求成功搬迁后源文件不再留在旧位置，覆盖此前更换资料库时保留源目录的设计。历史数据默认系统 Documents，三类路径保存均先展示类别和新旧位置；取消不移动，没有“只改路径”的按钮。视频与图片在选择器和后端限制当前 ComfyUI output，并做真实路径/链接检查。
- file-relocation 负责扫描、哈希、同盘重命名、跨盘流式校验传输、提交后源文件移除和日志恢复；settings-storage-migration 负责完整预检、队列空闲门槛及 History/图片版本/草稿/队列消费路径重映射。资料库移动整个不可变库与 StudioLibrary，保留库/作品/版本身份及发布序号。独立输入归档和 Run 数据受保护，缺失/冲突/变化会停止而不丢历史。新提交清理失败保留日志并显示未完成，重试/重启继续恢复，不伪报完成。
- NAS 发布暂停租约覆盖搬迁，提交后使用新位置，回滚后使用旧位置；媒体离线不再阻止资料库搬迁。原外置发布目录和迁移前原始配置/独立备份不清理。普通已迁移库启动继续不弹迁移窗。
- `temp/storage-directory-move-verify.log` 初轮全量 2773 unit + 104 integration、build、440 对比度通过。新增边界后两次全量分别出现未改动图片素材清理、长视频队列和旧 NAS 导出的原有 5 秒超时（附随临时目录 EBUSY/ENOTEMPTY）；未放宽断言。单进程相邻/迁移共 64 项通过；随后 `temp/storage-directory-move-verify-serial.log` 全量 2778 unit + 104 integration、clean typechecked build、440 对比度全部通过。后续发布离线/暂停修补由 89 项聚焦、typecheck、Electron 编译和最终真实 UI 复核覆盖。
- 文件测试直接验证同盘 inode 不变且未复制、EXDEV 回退在提交前保留源、提交后源消失；故障导致部分移动时恢复原文件；已提交恢复不复活旧源；已有不同内容目标不覆盖、已有相同目标回滚不删除；新副本损坏或源无法清理不报成功；目录联接不能越界。真实分作品库也模拟完整移动后未提交定位的中断，重开恢复原库与全部视频/图片记录。输入归档和独立 Run chunk 保持原位置。
- `temp/library-cross-volume-FK8Elk/report.json` 为实际两个磁盘卷（dev 2385822536 与 854996599）的合成资料迁移，并非只 mock EXDEV。提交前源/目标内容一致，提交后源文件及日志均消失，目标 SHA256 为 `6f96fd4ccec2739704831337e8548dff846f3d328f16d00cb9f9978896fd8227`；自有合成对象已清理，报告保留。
- 最终 `temp/library-ui-zL1ak0/report.json` 通过：库迁移先取消再确认、占用目标可恢复；图片输出越界被拒绝；双媒体确认框、可见进度、实际移动、SHA256 相同、旧 MP4/PNG 不存在、移动后视频实际解码；自动发布可读。缺 Prompt→真实输入→实际入队，task ID `fd32e3e1-f0ca-47b9-94be-65c587bb79ca`；后续草稿隔离、原生退出/重启、History 返回及二次退出通过。PID 42228/81504，CDP 12858/13192。已查看最终确认截图及 900px 路径布局；路径分组清晰，不重复成功通知。
- 先行夹具 `library-ui-HRUN94` 误在内存设置已变但移动仍在进行时检查源文件；改为等待已提交库定位及迁移窗口完成。`library-ui-j0HFIN` 已通过迁移，但 .NET MainWindowHandle 选到无标题窗口，原生退出定位改为枚举精确 PID、标题与可见窗口后发送 WM_CLOSE；之后 `library-ui-5A386P` 及最终夹具均完整通过。保留失败报告，未降低文件/界面断言。一次针对先行夹具的日志恢复诊断发现日志已完成移除，不能据此声称实测了进程强杀恢复。
- minor，版本保持 0.67.0，无新增依赖、无提交/推送/打包。仅隔离合成数据及 CPU 媒体；实际历史库、另一台 PC、NAS 与 GPU 均未操作，现场限制不变。
