# NAS 独立只读浏览服务

- Status: done（前置与本机验收；未部署 NAS）
- Updated / Owner: 2026-10-27 / 当前 agent
- Scope / Authority: 用户要求在 Tools 建立服务并准备前置；DS418play、DSM 6.x、已有 Docker、Drive 单向上传；NAS 纯浏览，收藏/评分去掉，Tag 只读，PC/NAS 路径独立。
- Baseline: 0.67.0；大量其他任务 dirty，保留全部。执行 direct，children=0。

## Resume

- 2026-10-28：按用户要求新增 Build-Tar.bat，自动检查 Node/Linux Docker、构建服务与 amd64 镜像、验证镜像内 SQLite、先导出 partial 再替换 tar；缺依赖时提示，支持 --no-pause。Windows 调用与失败保护已验；本机缺少 Docker CLI，真实镜像构建不可据此宣称通过。
- 本轮补充已完成：服务 libraryRoot 与 mediaRoot 分开配置，导出器 libraryRoot 与 outputRoot 分开；两条 Drive 上传任务分别映射资料/媒体挂载，省略 libraryRoot 保持旧同根行为。独立目录导出、封面/媒体边界、真实浏览器恢复与播放均通过本机验证。
- 后续资料库迁移与自动发布的计划已独立建立：[资料库 TASK](../2026-10-27-library-storage/TASK.md) / [PLAN](../2026-10-27-library-storage/PLAN.md)。本任务已完成的单 catalog 前置与本机证据继续保留，不代表后续分作品存储或自动迁移已实现。

- Tools/NasBrowser 内实现独立 CLI 导出器、Node HTTP 服务、Dockerfile、DSM 6/Compose 配置与部署手册。
- 复用 src/web；readOnly 能力只影响独立服务，桌面默认仍可整理。共享纯筛选、版本选择与 Range 流规则；不复制模型名称/封面键来源。
- 输出 StudioLibrary：asset/version 稳定 ID、相对路径、仅浏览字段和按版本 Prompt；复用源校验通过的 v3 封面，不生产、不清理原缓存。先手动/独立 --watch 导出，不接 App 设置和生命周期。
- 本机前置已完成：导出/过滤/路径逃逸/只读 HTTP/同步乱序恢复、工具独立构建、手机/iPad 实际控件与视频解码通过。
- 后续实际部署需 PC Output、NAS 同步目的目录及浏览地址；未对用户库执行导出。当前机器找不到 Docker CLI，未构建或导入容器镜像；DSM 6 的内核/Docker/Node 兼容、NAS ACL 与真机 Safari 仍待实机验证。

## Implementation and resources

- 仅本任务拥有 Tools/NasBrowser、新测试、src/web、src/core/lan-browser.ts、history-filter.ts/history-video.ts 的最小类型扩展；共享索引/Changelog 追加前重读。
- 不触碰用户 state、媒体、NAS、ComfyUI、GPU；本机测试使用隔离 temp。工具构建单独 dist，不清理根 dist。
- minor 新可选工具；不升版本、不提交推送、不创建镜像发布/安装包。

## Evidence / handoff

- 2026-10-28 bat 入口验收：真实缺 Docker 时 exit=1 并显示恢复提示，没有构建/安装；隔离的中文、空格、`&`/`!` 路径下，以 mock Docker 验证成功及 web/build/run/save/empty/daemon/windows 共 8 个场景，失败均保留旧完整 tar，成功才替换。证据在 `temp/nas-build-bat-1793171328436/report.json`；它仅证明 Windows 控制流与文件保护，不是镜像或 DSM 验收。仅改脚本/说明，未重复 App build/verify/GPU，无常驻进程；tar/partial 保持忽略，未访问用户资料。
- 双目录增量验收：NAS focused 7 项、工具 typecheck、主项目 typecheck、工具 build 通过；`temp/nas-browser-smoke-1793095590213/report.json` 的浏览器旅程通过，PC/NAS 各自独立的文档/媒体根目录。自有服务端口 11382 已检查回收。首次 smoke 在进入动画尚未完成时测安全区过早，已改为等待边界稳定；生产 UI 未改动。此次未重复运行先前完整 verify，先前数字仅对应上一轮状态；本轮仍未实际构建 Docker 镜像或部署 NAS。
- local-video-studio Skill、guide lan-browser、架构 LAN/History、UX LAN、CHANGE_VERIFICATION 已读。
- `tests/nas-browser.test.ts` 6 项通过：不导出 App 私有字段、相对路径与有效缓存、重复导出不重写、同步大小/缺文件恢复、坏索引保留、根外文件/符号链接保护、HTTP Range/HEAD/Prompt、Host/Origin/写操作拒绝。原 LAN/手势/seek/covers 邻接 23 项通过；工具专用 typecheck 和主项目 typecheck 通过。
- `node Tools/NasBrowser/build.mjs` 通过，产物在工具自己的 dist；未安装新依赖。`npm.cmd run verify` 通过：2722 单元 + 91 集成、主项目 clean typechecked build、440 个对比度检查无失败；该结果对应当时包含其他任务 dirty 的工作树，不为其他任务提升 runtime 结论。
- `node Tools/NasBrowser/smoke.mjs` 通过；隔离证据在 `temp/nas-browser-smoke-1793068213560/report.json` 与同目录 6 张 PNG。实际点击缺索引重试、筛选无结果/恢复、四列相册、播放、Prompt 和返回；390×844、768×1024、1024×768；视频 contain、解码帧推进、进度区距底部≥52px、无 preload/写控件。已人工查看全部截图，未改变 approved 布局。
- smoke 使用 3 个 CPU H.264 视频/18 条合成历史及模拟不同根目录，无 ComfyUI/GPU/用户库访问；自有浏览器和 Node 服务已回收，5983 监听不存在。temp 证据保留，未操作其他任务进程。
- 版本影响 minor，已追加 Unreleased；package/lockfile 保持 0.67.0。实际模型/effort/usage unknown；children=0。
