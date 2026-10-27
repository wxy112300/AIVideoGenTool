# 资料库迁移、恢复与 NAS 自动发布

类型：运行手册；日期：2026-10-27；适用范围：桌面分作品资料库与 NAS v2 发布。实施/验收状态以[任务](../tasks/2026-10-27-library-storage/TASK.md)为准；容器基础操作见[工具手册](../../Tools/NasBrowser/README.md)。

## 换到实际电脑前

1. 正常退出旧版 App，确认没有正在生成/保存的任务。
2. 将完整 AppData 配置目录另复制一份到独立备份位置，至少包含 `studio-state.json`、已有备份与 `history-covers/v3`；另保留媒体 Output 和 ComfyUI 的 Run/AV/Motion 数据。元数据备份不能替代媒体与续写数据备份。
3. 记录旧视频/图片作品和版本数量、几个重要作品的 ID、Prompt、父子引用及当前输出目录。保留旧应用版本供有计划的恢复，不直接用旧版打开迁移后的活动配置。
4. 保证系统“文档”可写且有足够空间。系统重定向的 Documents 会被遵守；不要手工拼接用户名路径。

首次启动会先校验旧 state，保留逐字节迁移前副本，建立分作品候选并独立读回，对 ID、记录内容、图片集合及文本引用校验后，最后切换 AppData 定位。媒体、AV、Run 和 v3 封面不会搬移或重新生成。已有不同库或非空目标会阻止切换；不会合并两台电脑的库。

耗时迁移会显示独立启动进度窗口：备份、写入作品、校验、保存兼容资料与切换。作品数量和百分比对应当前阶段实际完成的记录；没有可计数工作量的阶段显示处理中。窗口可最小化，迁移期间不提供中途关闭/取消按钮；完成后自动进入主界面，失败则关闭进度窗口并显示原有恢复提示。快速完成时不闪窗。已迁移库的正常启动不显示迁移窗口，仍照常读取和校验；读取失败继续显示恢复提示。迁移意外退出后会检查已有候选并安全重试，不删除原件。

主配置使用系统 Documents 下 `Local Video Studio/Library`。通过 `--user-data-dir` 启动的独立配置默认使用该配置自己的 `Documents/Local Video Studio/Library`，避免测试/其他配置写入主库。设置 → 应用与路径 → 文件路径中的“历史数据目录”可选另一空目录。不要让两份活动 App 写同一资料库，写入期间有本机临时进程锁。

## 更改保存位置

1. 保留当前 Library 和媒体的独立备份，停止队列并等待运行中的任务结束。在文件路径中修改历史数据、视频输出或图片输出目录，点击保存设置。
2. 确认窗口列出更改的类别及新旧位置；取消会恢复原路径，确认后自动开始迁移。视频和图片必须位于当前所选 ComfyUI 的 output 根内，路径选择与后端保存均检查；目录链接不能绕过限制。历史数据目录独立于媒体输出，默认仍为系统 Documents。
3. 窗口显示扫描、移动、校验、保存路径及完成阶段的实际文件计数；跨盘显示已传输的数据量。同盘直接重命名移动，不复制整套资料；跨盘无法重命名时，先传输并校验，路径持久提交后再移除旧文件。只有源文件移走后才报告完成。运行期间不能退出或再次修改路径。
4. 目标冲突、源文件缺失/变化、权限或校验失败均停止操作，不覆盖不同内容的文件。提交前失败会恢复已移动文件；中断后通过迁移日志和已提交的路径判断恢复到旧位置或完成新位置。提交后若源文件清理失败，窗口会明确显示尚未完成，可重试继续；不要删除迁移日志。

历史数据目录迁移完整分作品库及其 StudioLibrary 投影，保持资料库/作品/版本身份与 NAS 更新序号。媒体迁移覆盖选定旧目录中的对应视频/图片文件，并更新 History、图片版本、草稿和队列内的实际路径引用；不删除历史记录。Run/AV/Motion 等有独立归属的数据不因更改成片目录被搬走；若历史媒体本身由续写 Run 管理，拒绝单独拆出移动。输入素材库与封面缓存继续使用各自的位置。迁移前原始配置副本及独立备份不会被清理。

## 文件与恢复

| 文件 | 用途 |
| --- | --- |
| AppData/studio-state.json | 设置、草稿、Queue 与当前资料库 ID/目录/提交摘要；AppApi 仍返回合并后的 History |
| studio-state.json.pre-library-&lt;SHA256&gt;.json | 完整迁移前原件，自动保留，不由常规备份清理 |
| studio-state.json.backups/ | 带 SHA256 和基础结构校验的已知有效配置；八个近期唯一快照及十四个每日恢复点 |
| studio-state.json.relocation-*.json | library、video、image 的文件迁移日志；用于跨提交边界恢复，完成后才移除 |
| studio-state.json.library-migration.json | prepared/switched 阶段与定位；已切换后禁止静默回退旧历史 |
| studio-state.json.corrupt-* / .recovery.jsonl | 损坏原件与自动恢复来源，保留用于核对 |
| Library/library.json | 库格式与稳定 ID |
| Library/records、texts、commits | 不可变的完整作品、去重长文本与提交清单；删除通过新清单和删除标记生效 |

临时文件落盘、flush、读回校验后才替换主配置。Windows 文件被占用时重试 rename，仍失败就报告失败，不覆盖复制原件。权限、I/O、迁移、无有效备份等错误不会初始化空库；保存失败恢复内存状态。备份清理只管理本实现创建且校验通过的快照，不删除旧 `.bak`、损坏原件或迁移前副本。作品对象与旧提交首版保留，不做自动垃圾回收，因此应监控空间。

主配置 JSON/结构损坏时可从最近有效备份恢复，并保留损坏原件和恢复来源；恢复不是“保证找回最后一次操作”，请核对近期编辑。读取权限错误直接阻止启动，不把错误当作文件损坏。已迁移库缺失、身份不符、记录/文本校验失败时停止加载，不拿迁移前旧库冒充当前库。启动对话框允许打开资料目录、排除权限/磁盘问题后重试，以及选择原资料库所在的新位置；只有匹配库 ID 且包含当前完整提交的目录才能切换。

如果没有有效来源，保留全部目录与日志，先做恢复诊断；不要删除定位文件、迁移标记或把 `history` 改成空数组。不能用扫描旧对象目录代替提交清单，否则会复活已删除记录。迁移完成后直接降级旧版 App 不受支持；需要回退时应先备份新库与最新配置，明确核对迁移后新增/编辑，再决定恢复哪份状态。

## PC 自动发布与 Drive

1. App 自动在当前资料库内维护 `Library/StudioLibrary/<libraryId>/` 浏览资料，设置中无需 NAS 发布目录。上传目的地和同步任务由 Synology Drive Client 配置。
2. 浏览资料来自已提交状态，无需额外 CLI/watch；失败保留上次完整发布并重试，日志事件为 `nas-publish-failed`。
3. 在 Synology Drive Client 建立 **PC → NAS 单向上传**任务：当前 Library 目录上传到例如 `/volume1/documents/LocalVideoStudio/Library`；ComfyUI **完整 output 根**上传到例如 `/volume1/video/Output`。两条任务可独立同步，PC 与 NAS 根名无需相同。不要只上传 Videos 子目录而漏掉相对路径中的上层目录。
4. 初次发布后从 `StudioLibrary` 下的 UUID 子目录确认 library ID，填入 NAS 配置。不同 PC 使用各自子目录及各自 NAS `/data`；首版单服务选择一个库，不自动合并。
5. 完成迁移与实际电脑的作品/版本核对后，再启用该上传任务。Drive 会传播删除与错误，不替代独立备份。

发布只包含视频浏览字段、按需 Prompt 和已有有效封面；桌面完整生成图/参数/队列/设置不进入浏览协议。缺媒体作品保留在桌面；已发布作品暂时读不到媒体时保留其已有 NAS 元数据。真正从桌面提交删除后，NAS 新提交才移除对应记录。PC 关闭后 NAS 使用最后完整到达的提交；封面缺失仅占位，不启动解码或 GPU。浏览服务只读取 `StudioLibrary/<libraryId>` 投影，不直接读取完整桌面主库。

移动资料库会暂停后台发布并尝试完成待发布变更，再随主资料库移动并校验已有浏览提交，保持同一库的更新序号；已迁移文件不再留在原目录。媒体暂时离线不阻塞资料库搬迁，待发布状态在新位置恢复；发布不会与文件移动并发。随后需在 Drive 中更新 PC 来源目录，NAS 挂载对应的同步目的地。旧版配置中的外置 NAS 发布路径不再使用，旧外置发布目录和文件不会删除。

## NAS 配置与启动

仓库提供 [v2 配置](../../Tools/NasBrowser/config.v2.example.json)和 [v2 Compose](../../Tools/NasBrowser/compose.v2.example.yml)。复制为 NAS 项目目录中的 `config.json`、`docker-compose.yml`，替换：

| 项目 | 示例/要求 |
| --- | --- |
| mediaRoot | 容器内 `/media`，挂载实际 Drive 媒体目的根，只读 |
| libraryRoot | 容器内 `/library`，挂载实际 Drive 资料库目的根，只读 |
| libraryDirectory | `StudioLibrary/<实际 libraryId>`，只选一个 PC 来源 |
| dataDirectory | `/data`，NAS 本地独立目录，可写且不参与 Drive 同步 |
| allowedOrigins | 实际访问地址及端口，例如 `http://192.168.1.10:8790`；反向代理地址也要显式加入 |
| /data 权限 | 容器以 UID/GID 1000 运行；在 DSM 给这个独立目录所需写权限，不开放媒体写权限 |

在开发/Windows 电脑执行：

```powershell
node Tools/NasBrowser/build.mjs
docker build -t local-video-studio-nas:local Tools/NasBrowser
docker save -o local-video-studio-nas.tar local-video-studio-nas:local
```

把镜像 tar、配置及 Compose 文件带到 NAS，用 DSM Docker 导入，或执行：

```sh
docker load -i local-video-studio-nas.tar
docker-compose up -d
docker-compose logs --tail=100 browser
```

镜像为现有 `node:22-bookworm-slim`，新协议使用 Node 内置 SQLite。实际 DSM 6.x 的内核、Docker 和镜像是否能启动需要现场验证；本机没有 Docker CLI 时只能准备源码与配置，不能声称镜像已构建或适配 DS418play。不要为绕过兼容问题随意降到缺少 `node:sqlite` 的 Node。

NAS 先校验整个提交需要的新记录与文本，再在 `/data/library.sqlite` 中一次提交索引。乱序/截断/旧代次不替换最后有效库；进程重启可从本地 SQLite 继续浏览与读 Prompt。SQLite 丢失/物理损坏会从同步资料重建，损坏原件保留；`last-valid.json` 记录上次完整来源，供当前上传不完整时恢复。同步源从不被 NAS 写入。资料/媒体暂未到齐时查看 `/healthz` 和日志，等待同步后自动恢复。

旧 `catalog.json` 模式继续支持：省略 `dataDirectory` 并使用旧 [config.example.json](../../Tools/NasBrowser/config.example.json)。新增 `dataDirectory` 切换至 v2；不要让同一 `/data` 轮流导入不同 library ID。旧 CLI 仅用于仍有完整 history 数组的旧 state；迁移后使用 App 自动发布，CLI 不会将缺 history 当作空库导出。

## 实际电脑与群晖验收清单

- 核对迁移前后视频/图片作品、全部版本和重要 Prompt/参数/父子/Run/AV/Motion 引用；缺媒体记录也应保留。
- 真实进入 History，播放旧视频、切换版本、回父页；编辑收藏/评分/标签、重启后检查，再验证继续创作实际入队且不运行 GPU。
- 改一条元数据，确认 PC 自动发布、Drive 到达、NAS 更新；断开 PC 后刷新 NAS 并重启容器，仍能浏览/查看 Prompt/播放。
- 在手机/iPad 竖横屏检查筛选、相册/瀑布流、播放、Prompt 和返回。桌面仿真不代替真机 Safari 验收。
- 故障注入、删除和迁移中断仅使用隔离副本。保留真实库、迁移前副本和独立备份，完成核对前不要清理旧资料。

开发机可复现两项独立规模探针：构建 App 后运行 `node scripts/harness/probe-library-storage.mjs`；另构建 NAS 工具后运行 `node scripts/harness/probe-nas-storage.mjs`。它们只生成隔离合成资料，报告放 `temp` 并清理对象目录；首次逐对象耐久写入可能耗时数分钟，不应据此中断真实迁移。具体本机测量和限制见[本轮证据](../tasks/2026-10-27-library-storage/evidence/local-verification.md)。
