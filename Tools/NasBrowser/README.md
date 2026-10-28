# NAS 只读视频浏览服务

类型：部署手册；状态：基础实现；日期：2026-10-27。适用：已有 Docker 的群晖及本机 Node.js；当前验收与限制见 [TASK](../../docs/tasks/2026-10-27-nas-browser/TASK.md)。

电脑创作 → 自动发布浏览资料 → Drive 单向上传 → NAS 独立提供网页。复用现有手机优先界面、完整筛选/排序、收藏/评分/Tag 显示、瀑布流/相册、完整视频播放和按需 Prompt；NAS 只读，不能修改收藏、评分或 Tag，也不会写回 App 状态。排序在 Filter 菜单内。

已部署服务使用[2026-10-29 程序更新包](NAS-Browser-Update-2026-10-29.zip)，按[更新手册](UPDATE.md)替换程序、构建新镜像并重建容器，保留 config/data 和原路径。旧浏览资料没有收藏/评分字段：还需在 PC 运行更新后的 App，后台重新发布并经 Drive 同步；不需要手动导出或删除 NAS 索引。

新版 App 已提供分作品资料库和后台 v2 发布，自动维护 `Library/StudioLibrary/<libraryId>`，无需在 App 中配置 NAS 发布目录，上传路径由 Drive Client 设置。新配置请使用[资料库迁移与 NAS 自动发布手册](../../docs/runbooks/LIBRARY_STORAGE_AND_NAS.md)、`config.v2.example.json` 和 `compose.v2.example.yml`；NAS 的 `/data` 保存本地 SQLite，资料与媒体分别只读挂载。下面的 `catalog.json`/CLI 流程作为旧格式兼容路径保留，不能直接读取迁移后省略 history 数组的 AppData 主配置。

## 1. 构建（电脑，仓库根目录）

使用仓库配置的 Node.js，先安装根依赖；已有 node_modules 时不必重复安装。工具构建只写 `Tools/NasBrowser/dist`，不清理 App 的 dist。

```powershell
npm.cmd ci
node Tools/NasBrowser/build.mjs
```

## 2. 导出资料（电脑）

复制 `export.config.example.json` 为 `export.config.json`，填写真实 `stateFile`、`outputRoot` 和 `libraryRoot`。`outputRoot` 是 Drive 正在上传的 ComfyUI 媒体根目录；`libraryRoot` 是另一路由 Drive 上传的资料根目录，例如系统实际“文档”中的 `Local Video Studio/Library`。两个根目录都需已经存在，保留媒体根下面的子目录结构。默认封面来源是 stateFile 同级的 `history-covers/v3`，特殊位置可另加 `coversDirectory`。

```powershell
node Tools/NasBrowser/dist/runtime/export.mjs --config Tools/NasBrowser/export.config.json
# 持续更新：历史、Prompt、Tag 或已有封面变化会在下一轮导出。
node Tools/NasBrowser/dist/runtime/export.mjs --config Tools/NasBrowser/export.config.json --watch
```

导出写入 `<libraryRoot>/StudioLibrary/catalog.json` 和 `covers/`，只包含 outputRoot 内实际存在的视频；原 state 和视频保持只读。索引保留 asset/version 身份、相对路径、收藏、评分及 Tag，不包含设置、队列、工作流或 Windows 绝对路径。Prompt 是用户授权的导出内容。文件在媒体根目录以外会计入 skipped，不会搬移或复制原视频。省略 libraryRoot 的旧配置仍写到 outputRoot，无需重新生成已有索引；媒体路径相对 outputRoot，封面路径相对 libraryRoot。

封面只复用通过源大小/时间校验的 v3 缓存；不存在时显示占位，不启动 FFmpeg。封面按内容命名，未变的索引和图片不重写；先写封面，再原子替换索引。旧导出封面暂不自动删除。确认 Drive 未排除 StudioLibrary、JSON 或 JPG；NAS 每次轮询核对媒体大小，索引先到、视频后到会自动恢复。

旧模式 `--watch` 是独立前台进程，关闭终端或 Ctrl+C 后停止；新版 App 的 v2 自动发布已接入提交/退出生命周期，无需这个额外进程。已有导出会保留，电脑关机后 NAS 仍可浏览最后完成同步的内容。

## 3. 本机浏览器测试

复制 `config.example.json` 为 `config.json`：`mediaRoot` 填本机 Output，`libraryRoot` 填导出配置中的资料根目录，`host` 改为 `127.0.0.1`，`allowedOrigins` 改成 `["http://127.0.0.1:8790"]`。`libraryDirectory` 默认是资料根下的 `StudioLibrary` 子目录。

```powershell
node Tools/NasBrowser/dist/runtime/server.mjs --config Tools/NasBrowser/config.json
```

浏览器打开 `http://127.0.0.1:8790`；`/healthz` 显示索引是否可用。资料未到时 API 返回 503，界面可重试；后续损坏/未传完的索引保留上次有效快照。刷新异常标记在 healthz，详细原因只写服务日志。关闭前台进程可用 Ctrl+C。

## 4. 构建并传送 Docker 镜像

电脑未安装 Docker、但群晖已有 Docker 时，按 [DSM 6 首次部署教程](DSM6-QUICKSTART.md)在 NAS 上构建并运行。教程涵盖上传构建文件、首次 SSH、SQLite 兼容检查、两个数据路径、权限与日常管理，不要求在电脑安装 Docker Desktop。

Docker 17.05 可先按教程更新 DSM 6 的 Docker 套件至 20.10.3-0554；已核对官方安装包的 x86_64 / DSM 6.1 最低要求，DS418play 实际安装仍需验证。报 `missing signature key` 时，也可下载本目录随仓库保存的 [legacy 基础镜像压缩包](node-22-bookworm-slim-amd64-legacy.tar.gz)，按教程解压并 `docker load`，随后先检查 SQLite，再离线构建服务；不关闭校验、不降低 Node 版本，NAS 实机运行仍需验证。

可直接上传的 [2026-10-28 部署包](NAS-Browser-Deploy-2026-10-28.zip)保存在本目录并随源码提交；它包含已编译服务和教程，不包含历史或视频。源码更新后需重新构建部署包，此快照不代表 DSM 实机已验收。

Windows 可以直接双击本目录的 [Build-Tar.bat](Build-Tar.bat)。需要 Node.js 22.13 或以上，以及已启动的 Linux Docker 引擎（例如 Docker Desktop 的 Linux 容器模式）。脚本不安装 Docker；缺少工具、引擎未启动或使用 Windows 容器时会提示并停止。

脚本自动定位仓库根目录，必要时安装根依赖，然后构建服务、构建 `linux/amd64` 镜像、运行容器内 SQLite 检查，最后导出本目录下的 `local-video-studio-nas.tar`。任何一步失败立即停止，导出先写 `.tar.partial`，完整成功后才替换旧 tar；不会启动服务或挂载历史资料。首次构建需要联网下载依赖/基础镜像；容器内检查不代表 DSM 6 实机兼容已验证。

从终端或自动化调用可关闭结束暂停：

```powershell
& .\Tools\NasBrowser\Build-Tar.bat --no-pause
```

在装有 Docker 的构建机，从仓库根运行；DS418play 使用 linux/amd64 镜像：

```powershell
docker build --platform linux/amd64 -t local-video-studio-nas:local Tools/NasBrowser
docker save -o Tools/NasBrowser/local-video-studio-nas.tar local-video-studio-nas:local
```

将 tar 复制到 NAS，在 DSM 6 Docker → 映像 → 新增 → 从文件新增中导入。不是 Docker 的容器配置导入。镜像只打包网页与 Node 服务，不包含媒体、state、模型、ComfyUI 或封面；本机 JSON 配置不进入运行镜像。

## 5. DSM 6 创建容器

复制示例配置，在 NAS 保存为普通文件，例如 `/volume1/docker/local-video-studio-nas/config.json`：

- `mediaRoot` 保持 `/media`。
- `libraryRoot` 保持 `/library`，`libraryDirectory` 保持 `StudioLibrary`；服务将读取 `/library/StudioLibrary/catalog.json`，封面也来自资料挂载，视频来自媒体挂载。省略 libraryRoot 的旧配置仍按同根读取。
- `allowedOrigins` 改为真实 NAS 地址，例如 `["http://192.168.1.20:8790"]`；多个入口分别列出完整协议、主机和宿主机端口，无路径/通配符。容器内地址不需要出现在浏览器地址里。
- `pollSeconds` 默认 10 秒，不需要每次同步后重启。

DSM 6 高级设置：

| 设置 | 值 |
| --- | --- |
| 映像 | local-video-studio-nas:local |
| 自动重新启动 | 启用 |
| 文件夹挂载 | NAS 上 Drive 同步后的 Output → `/media`，只读 |
| 另一文件夹挂载 | NAS 上 Drive 同步后的文档资料根目录 → `/library`，只读 |
| 文件挂载 | NAS 上的 config.json → `/config/config.json`，只读 |
| 端口 | 本地 8790 → 容器 8790 / TCP |

容器使用非 root 用户，需要对挂载目录及父目录有读取/遍历权限。若改本地端口，同步修改 allowedOrigins；容器端口保持 8790 即可。无需特权、主机网络或挂载电脑盘符。支持 Compose 的环境可复制 `compose.example.yml`、修改绝对挂载路径，再 `docker-compose -f compose.example.yml up -d`；DSM 6 不要求具备图形化 Project 功能。

手机打开 `http://NAS_IP:8790`。服务及容器生命周期独立于桌面 App 的局域网开关。密码/配对仍按此前决定暂缓；本服务保留 LAN 及 Host/Origin 检查。代理部署需把浏览器实际使用的 origin 加入配置，不接受任意 Host。

## 路径示例与边界

`D:/Output/videos/a.mp4` → Drive → `/volume1/video/Output/videos/a.mp4` → 挂载 → `/media/videos/a.mp4`。索引仅保存 `videos/a.mp4`，不要求 PC 与 NAS 根路径相同。仅同步根内文件；嵌套符号链接指向根外会被拒绝。

资料独立映射：`文档/Local Video Studio/Library/StudioLibrary/catalog.json` → Drive → `/volume1/documents/LocalVideoStudio/Library/StudioLibrary/catalog.json` → 挂载 → `/library/StudioLibrary/catalog.json`。NAS 的文件夹名称可不同，Docker 挂载指定对应关系即可。若 PC 的 outputRoot 选 ComfyUI/output，NAS 也要挂载对应的整个 output，不能误选里面的 Videos 子目录。

本服务读取导出的浏览资料，不能把原始 studio-state.json 或主库记录直接当作 catalog；新版 App 自动维护主库中的 StudioLibrary 子目录，实施及现场范围见[资料库任务](../../docs/tasks/2026-10-27-library-storage/TASK.md)。资料目录和媒体目录可通过两条独立的 Drive 上传任务同步。

当前不做实时转码、NAS 抽帧、图片历史或双向整理。浏览器须支持原视频编码。现代 Node 运行镜像能否在具体 DSM 6 内核/Docker 组合上启动需要实机验证；不要为绕过兼容问题直接降级到已停止维护的 Node。镜像构建/导入、NAS 权限、物理 LAN 与 iOS Safari 分别验收，不能由本机测试代替。

## 开发验收

```powershell
npx.cmd vitest run --config vite.config.ts tests/nas-browser.test.ts
npx.cmd tsc -p Tools/NasBrowser/tsconfig.json --noEmit
node Tools/NasBrowser/build.mjs
node Tools/NasBrowser/smoke.mjs
```

smoke 需要仓库的 Electron 和 PATH 中的 FFmpeg，仅生成少量 CPU 合成视频，在 `temp/nas-browser-smoke-*` 内模拟 PC → NAS 同步；无 preload 的浏览器实际点击缺索引恢复、筛选、相册、播放、Prompt 和返回，并检查手机/iPad、只读控件和进度安全区。产物/截图留在该忽略目录，正常收尾关闭自有浏览器和服务。该检查不启动主 App 或 ComfyUI，不代表群晖容器或真机 Safari 通过。
