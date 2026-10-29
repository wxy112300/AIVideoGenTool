# NAS 独立只读浏览服务

- Status: done（Filter 固定操作区、统一部署包及本机验收）
- Updated / Owner: 2026-10-29 / 当前 agent
- Scope / Authority: 用户要求在 Tools 建立服务；DS418play、DSM 6.2.4、Docker 20.10.3、Drive 单向上传。最新要求：NAS 与普通浏览功能一致，显示收藏/评分/Tag，保留完整筛选排序，唯独禁止修改；排序收进 Filter，PC/NAS 路径独立。
- Baseline: 0.67.0；大量其他任务 dirty，保留全部。执行 direct，children=0。

## Resume

- 2026-10-29 固定操作区/清理已完成：两版 Filter 固定标题和重置/应用，仅字段独立滚动并保留 iOS 安全区。Tools 仅留 NAS-Browser-Deploy.zip 完整包，清理日期区分旧部署/更新包及 Node 离线归档，共 313443990 bytes；Node 运行时仍来自 Dockerfile 基础镜像。更新教程改为直接替换容器、保留 config/data，新增部署标识核对目录/镜像/容器。上次额度引起的审批失败已恢复并正常完成操作。其他任务的 llama/设置相关 dirty 保留；本轮未提交推送，未连接 NAS。
- 2026-10-29 提交上传：用户授权将本次完整只读修正、普通版排序入口同步、验证脚本和 NAS 程序更新包一起提交推送；版本保持 0.67.2，复用下方同一生产文件状态的验证证据，Git 提交及远端结果以实际命令为准。
- 2026-10-29 完整只读修正已完成：用户已成功打开旧版 NAS，healthz ready=true/count=1258，Windows Chrome 刷新后显示。本轮修正 PC 导出丢弃收藏/评分、NAS 固定 false/null 及前端隐藏筛选/状态的问题；旧投影兼容，PC 更新后自动补发。普通版与 NAS 共用网页，排序都移入 Filter，只在元数据编辑能力上区分。仅程序更新 ZIP 与保留 config/data、旧容器回退的步骤已准备，未提交推送或连接 NAS。
- 2026-10-29：用户要求推送兼容资料，同时询问升级 Docker。已核对官方 20.10.3-0554 SPK 的 INFO（x86_64、最低 DSM 6.1-15163），教程补充套件中心更新与手动安装路径，DS418play 不承诺官方支持；不升级 DSM、不操作 NAS。legacy 基础镜像压缩为 80461710 bytes，随仓库上传，解压 SHA256 与已验证 tar 一致；版本保持 0.67.2。
- 2026-10-28 NAS 现场遇到 Docker 17.05 拉取 Node 的 missing signature key：官方当前 tag 与 amd64 子镜像均为 OCI，已核对并转换官方 Linux amd64 Node 22.23.4 为 legacy load tar，存 Tools/NasBrowser 供离线导入。未改服务源码或 NAS 系统；后续由用户 load/SQLite probe，旧内核能否运行尚未验证。
- 2026-10-28 统一上传：用户授权仓库全部提交推送并保持版本号；本轮版本为 0.67.2，版本文件不改。纳入 NAS zip/首次安装教程与当前局域网设置修正；具体提交/远端同步结果以 Git 为准。
- 2026-10-28 首次安装指导：用户电脑无 Docker，采用电脑编译文件、NAS Docker 构建运行；新增 DSM6-QUICKSTART.md 并准备不含私有数据的上传 zip。按用户要求已移至 `Tools/NasBrowser/NAS-Browser-Deploy-2026-10-28.zip` 供稍后一起提交推送，SHA256 与原包一致；本轮未提交/推送。仅构建独立工具与文档/归档验收，NAS 执行仍由用户进行；未连接或操作 NAS，不声称 DSM 实机兼容。
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

- Filter 固定操作区验收：复用 `temp/nas-browser-smoke-1793209262929/report.json` 的 v2 UI 证据，手机滚动 0/50%/100% 时 footer 坐标固定，两个按钮均能通过 elementFromPoint 命中，底部 padding 包含 34px safe area；iPad 横竖屏与桌面也检查按钮可见可点。截图 phone-filter-actions 已查看。当前构建入口同为 index-KyKnL8wc.js，CSS index-C8QiNJH6.css，与该 UI 验证一致。
- 普通版真实 App + 浏览器 `temp/lan-smoke-FHEh9x/report.json` 通过固定操作区、实际筛选/应用、收藏/评分/Tag 写回、播放和多宽度回归；首次 harness 因 Settings 保存重挂载期间空节点而退出，等待条件增加节点存在检查后通过，生产 Settings 未改。两个自有 LAN fixture 均 native close，cleanup.json 确认 App/浏览器/监听回收。无 ComfyUI/GPU/用户资料操作。
- 恢复后的完整检查日志 `temp/nas-filter-footer-resume-verify.log`：2804 单元、104 集成、typechecked clean build、440 对比度检查通过（4 workers，独立系统临时目录）；工具 build/typecheck 与脚本语法、文档链接检查通过。数字对应包含其他任务 dirty 的同一工作树，不提升那些任务的 runtime 结论。
- 唯一完整包 `Tools/NasBrowser/NAS-Browser-Deploy.zip`：269803 bytes，15 条目，含 dist/deployment.json、完整程序、Dockerfile、v2 示例配置/Compose、首次部署及直接更新教程；逐条 SHA256 与当前构建/源教程一致，无实际 config/data、历史、媒体、SQLite 或基础镜像归档。包 SHA256 `fa25bf864248e73abc58539cbd5a9cbcaf56b174d3136927b29e7d47ec16b942`，版本 0.67.2 不变。仅删除明确列出的 Tools 文件，未改写 Git 历史，未操作 NAS 上的文件或镜像。children=0。
- 2026-10-29 只读修正：聚焦 NAS/commit/LAN 27 项通过；全部单元 2797、集成 104 项通过，typechecked clean build 与 440 对比度检查通过。首次默认 verify 遇共享临时日志 EPERM 和并行 NAS 迁移超时，随后独立临时目录/4 workers 重跑；E 盘临时目录下 1200 条迁移超时，系统临时盘单独重跑 library-storage 全 13 项通过。未修改应用日志清理或测试超时阈值。
- 真实浏览器证据：`temp/nas-browser-smoke-1793207488299/report.json` 为 v2 同步链，实际收藏/评分筛选、评分排序、列表标记、只读播放器、四列相册/双列原比例、解码帧推进、安全区、Prompt 与返回/iPad 均通过；手机播放器/Filter/相册截图已查看。早期 smoke 有按钮在滚动区域外导致未应用筛选、一次播放等待超时；已让真实点击先滚到按钮并保留失败诊断，随后同一生产代码通过，未放宽生产行为。
- 普通版 `node scripts/harness/lan-browser-smoke.mjs --browser-only` / `temp/lan-smoke-nZ0UVb/report.json` 通过：实际收藏、半星评分、标签写回并独立读取持久库；排序仅在 Filter、完整播放/返回、手机/iPad/桌面无溢出。原默认 harness 在未改动 Settings 的 1280 双列断言处失败（当前该宽度实际单列）；保留默认断言，以 browser-only 跳过无关设置布局检查，未改设置生产样式。harness 资料库明确放隔离目录，并兼容当前分作品持久格式。两个 LAN fixture 均经 native close 正常退出，cleanup.json 确认监听关闭；NAS fixture 自有服务/浏览器也已回收。
- 程序更新包 `Tools/NasBrowser/NAS-Browser-Update-2026-10-29.zip`：262473 bytes，11 条程序/教程文件，无 config/data/用户资料或基础镜像，SHA256 `9b10a9f9b9ace7fa91be6c5a5bca8351cc7124bfb8da1d3cf80015040235faad`。工具独立 build/typecheck 通过；SQLite 结构不变，旧元数据字段缺省兼容，原容器可保留回退。版本 0.67.2 不变，未制作 Windows 安装包；真机 NAS/Safari 本轮待用户更新后验证。children=0。
- 2026-10-29 上传前检查：压缩镜像 SHA256 `2d44d6d6878823ea34240adb3be4f0f806f49d765083266e19461ad58d1ece7f`，完整流式解压后的 SHA256 与下方原 tar 一致；文档相对链接、diff check、版本 0.67.2 核对通过。本轮仅文档/离线基础镜像，不重复 App verify，未运行 Docker 或连接 NAS。
- legacy 基础镜像：官方 amd64 manifest `sha256:9f0dde62d10e7ff7a310ecaebd66225f6b46c17e6cb778449a77b05d3541bea2`，config `sha256:c469fbffcbb0086ddfb92598192d3e09eab25f2d81b9750a00f77f0910fed744`；crane v0.22.1 Windows 官方归档 SHA256 `0e073ea8192c3b8442ec8aaf44d53c1050a09084669fae3a6ceb0f2026cf8b21`。生成的 `Tools/NasBrowser/node-22-bookworm-slim-amd64-legacy.tar` 为 232454144 bytes，SHA256 `e2fb38c744615537b53f58972c6763cd280b48cd22f7dcef7ef7c6a636f56bc2`；RepoTag、linux/amd64、官方 config digest 与全部 5 层 DiffID 独立复核通过。报告 `temp/nas-image-compat-20261028/archive-verification.json`；tar 保持 Git 忽略，不上传到远端仓库。来源/格式验证不等于 Docker17 导入或旧 DSM 的运行时验证，未连接 NAS。
- 2026-10-28 统一上传前检查：完整 verify 通过（2795 unit + 104 integration、clean typechecked build、440 对比度检查）；另有设置聚焦 15 项/typecheck 通过。复用 `temp/lan-settings-ui-T4XNnV/report.json` 的真实 UI 证据：1440/1280/600 无溢出、开启失败回退保存与再次开启成功；该夹具中 LAN 设置 TS/CSS 与当前文件逐项内容 hash 一致，截图已复核。未改动或停止其他任务的 Vite/Node 进程。ZIP SHA256 与首次包一致，已确认无版本文件差异。
- 2026-10-28 首次 NAS 部署包（历史证据，旧包已清理，由统一完整包替代）：当时 `node Tools/NasBrowser/build.mjs` 通过；旧包为 265350 bytes，12 个条目，含 Dockerfile/.dockerignore/dist/v2 示例及教程；核对无 state、视频、SQLite、凭据或 node_modules。SHA256 为 90A9E04A85B319AB2D6C143AFE1D93BB92A3092D5C30B4E7BE9374014B36EA04。构建入口语法、文档链接及 scoped diff 检查通过。用户不在数据电脑，教程使用可替换路径；未连接 NAS，真实构建/SQLite 运行/播放仍需现场执行。上传目录教程使用 NAS 登录账号 UID/GID 运行，避免为默认 UID 1000 改动用户资料 ACL。
- 2026-10-28 bat 入口验收：真实缺 Docker 时 exit=1 并显示恢复提示，没有构建/安装；隔离的中文、空格、`&`/`!` 路径下，以 mock Docker 验证成功及 web/build/run/save/empty/daemon/windows 共 8 个场景，失败均保留旧完整 tar，成功才替换。证据在 `temp/nas-build-bat-1793171328436/report.json`；它仅证明 Windows 控制流与文件保护，不是镜像或 DSM 验收。仅改脚本/说明，未重复 App build/verify/GPU，无常驻进程；tar/partial 保持忽略，未访问用户资料。
- 双目录增量验收：NAS focused 7 项、工具 typecheck、主项目 typecheck、工具 build 通过；`temp/nas-browser-smoke-1793095590213/report.json` 的浏览器旅程通过，PC/NAS 各自独立的文档/媒体根目录。自有服务端口 11382 已检查回收。首次 smoke 在进入动画尚未完成时测安全区过早，已改为等待边界稳定；生产 UI 未改动。此次未重复运行先前完整 verify，先前数字仅对应上一轮状态；本轮仍未实际构建 Docker 镜像或部署 NAS。
- local-video-studio Skill、guide lan-browser、架构 LAN/History、UX LAN、CHANGE_VERIFICATION 已读。
- `tests/nas-browser.test.ts` 6 项通过：不导出 App 私有字段、相对路径与有效缓存、重复导出不重写、同步大小/缺文件恢复、坏索引保留、根外文件/符号链接保护、HTTP Range/HEAD/Prompt、Host/Origin/写操作拒绝。原 LAN/手势/seek/covers 邻接 23 项通过；工具专用 typecheck 和主项目 typecheck 通过。
- `node Tools/NasBrowser/build.mjs` 通过，产物在工具自己的 dist；未安装新依赖。`npm.cmd run verify` 通过：2722 单元 + 91 集成、主项目 clean typechecked build、440 个对比度检查无失败；该结果对应当时包含其他任务 dirty 的工作树，不为其他任务提升 runtime 结论。
- `node Tools/NasBrowser/smoke.mjs` 通过；隔离证据在 `temp/nas-browser-smoke-1793068213560/report.json` 与同目录 6 张 PNG。实际点击缺索引重试、筛选无结果/恢复、四列相册、播放、Prompt 和返回；390×844、768×1024、1024×768；视频 contain、解码帧推进、进度区距底部≥52px、无 preload/写控件。已人工查看全部截图，未改变 approved 布局。
- smoke 使用 3 个 CPU H.264 视频/18 条合成历史及模拟不同根目录，无 ComfyUI/GPU/用户库访问；自有浏览器和 Node 服务已回收，5983 监听不存在。temp 证据保留，未操作其他任务进程。
- 版本影响 minor，已追加 Unreleased；package/lockfile 保持 0.67.0。实际模型/effort/usage unknown；children=0。
