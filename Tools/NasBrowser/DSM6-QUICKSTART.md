# DSM 6 首次部署：电脑无需安装 Docker

类型：首次部署手册；日期：2026-10-28。适用：DS418play、DSM 6.2.4-25556 Update 8、已安装 Docker。服务已构建为 Node 文件，仍需在 NAS 上构建和检查容器；本文不代表该 DSM 已通过实机验收。

电脑没有 Docker 只会阻止 Build-Tar.bat 在电脑构建镜像。可以把准备好的部署包传给 NAS，直接使用 NAS 的 Docker；NAS 构建完即可启动服务，不需要先导出/重新导入 tar。NAS 不需要另外安装 Node.js、ComfyUI 或模型。

## 1. 先找齐两个数据目录

在 NAS 的 File Station 中，分别找到 Drive 已同步到 NAS 的：

- 视频目录：和电脑设置的完整 ComfyUI output 根对应，不是它里面的 Videos 子目录。
- 历史目录：文档资料库对应的 Library，里面应有 StudioLibrary/<库ID>/current.json。

右键文件夹 → 属性，查看完整位置。后面的示例假定两个目录为 `/volume1/video/Output` 和 `/volume1/documents/LocalVideoStudio/Library`；你的文件夹可在其他共享文件夹或 volume2，以属性中实际位置为准。库 ID 是 StudioLibrary 下的一串文件夹名，不是电脑名字，也不是提交文件的哈希。

如果 Library 下尚没有 StudioLibrary，先让完成迁移的新版电脑 App 正常打开一次，并等待 Drive 上传；旧 studio-state.json 不能代替浏览资料。

## 2. 上传部署包

在 File Station 打开 docker 共享文件夹，将部署 zip 上传，然后右键解压到当前位置，得到 local-video-studio 文件夹。首次部署应使用新的空目录，不覆盖已有同名服务的数据/配置。

解压后内容应是：

```text
local-video-studio/
├─ Dockerfile
├─ .dockerignore
├─ dist/
│  ├─ runtime/server.mjs
│  └─ web/index.html
├─ config.example.json
└─ DSM6-QUICKSTART.md
```

以下假定它位于 `/volume1/docker/local-video-studio`。检查文件夹属性；如果实际位置不同，后面 cd 使用你的实际位置。

## 3. 开启 SSH，并从电脑连接

DSM → 控制面板 → 终端机和 SNMP → 终端机，启用 SSH，端口保持 22，应用。用属于 administrators 组的普通 DSM 账号登录，不使用 root 登录。

在 Windows 开始菜单打开 PowerShell，执行（替换用户名和 IP）：

```powershell
ssh NAS用户名@192.168.1.20
```

首次连接需要确认主机指纹，核对连接的是自己的 NAS 后接受。随后输入 DSM 登录密码；密码输入时不会显示字符，输入后回车。成功后提示符会变成 NAS 上的用户名/主机名。

从现在到退出 SSH，后面的 sh 命令都在这个已连接 NAS 的窗口里执行。sudo 要求输入的也是该 DSM 管理员账号密码。

## 4. 在 NAS 构建镜像

逐条执行：

```sh
cd /volume1/docker/local-video-studio
pwd
ls Dockerfile dist/runtime/server.mjs
sudo docker version
sudo docker build -t local-video-studio-nas:local .
```

`pwd` 应当是解压目录，ls 应能列出两个文件。docker version 应列出客户端/服务端信息。最后一条末尾的点不能漏掉；首次构建需要联网下载 node:22-bookworm-slim 基础镜像，等待命令结束。任何一步失败先处理该步，不继续创建服务。

成功后，DSM Docker → 映像列表会出现 local-video-studio-nas，标签 local。

## 5. 检查 DSM 能否运行 Node/SQLite

仍在 NAS 的 SSH 窗口执行：

```sh
sudo docker run --rm --network none --entrypoint node local-video-studio-nas:local -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ready (id INTEGER)');db.close();console.log('SQLite OK')"
```

看到 SQLite OK 再继续；可能伴随实验性功能提示，它本身不是失败。这次检查不挂载任何历史/视频，只创建临时内存数据库，完成即删除临时容器。若出现镜像格式、内核、权限或 Node 启动错误，保留完整错误用于排查，不随意降 Node 或启用特权容器。

## 6. 填写实际路径和资料库信息

下面四项要先替换成自己的值，再逐行粘贴到同一个 NAS SSH 窗口。路径取自第 1 步；NAS_IP 填访问 DSM 使用的局域网 IP（不含 :5000）。

```sh
MEDIA_ROOT='/volume1/video/Output'
LIBRARY_ROOT='/volume1/documents/LocalVideoStudio/Library'
LIBRARY_ID='替换成StudioLibrary下面的库ID文件夹名'
NAS_IP='192.168.1.20'
```

确认两个目录可读，并能找到选中的发布资料：

```sh
ls -ld "$MEDIA_ROOT" "$LIBRARY_ROOT"
ls "$LIBRARY_ROOT/StudioLibrary/$LIBRARY_ID/current.json"
```

如果显示 No such file or directory 或 Permission denied，先修正路径/该登录账号的读取权限；服务将用同一账号的 UID/GID 读取挂载数据，不需要把所有用户资料开放给 everyone。

随后在解压目录中创建服务自己的数据/配置目录，并写配置：

```sh
mkdir -p data config
cat > config/config.json <<EOF
{
  "mediaRoot": "/media",
  "libraryRoot": "/library",
  "libraryDirectory": "StudioLibrary/$LIBRARY_ID",
  "dataDirectory": "/data",
  "host": "0.0.0.0",
  "port": 8790,
  "pollSeconds": 10,
  "allowedOrigins": ["http://$NAS_IP:8790"]
}
EOF
cat config/config.json
```

最后输出中应该是实际的库 ID 和 IP，而不是示例占位符。只需要选择视频/历史两个业务目录；data 是 NAS 本地索引，不放在 Drive 同步目录。

## 7. 创建并启动服务

以下命令一次复制执行；每行末尾的反斜杠后不要加空格。保持第 6 步的 SSH 窗口及变量：

```sh
sudo docker run -d \
  --name local-video-studio \
  --restart unless-stopped \
  --read-only \
  --user "$(id -u):$(id -g)" \
  -p 8790:8790 \
  -v "$MEDIA_ROOT:/media:ro" \
  -v "$LIBRARY_ROOT:/library:ro" \
  -v "$PWD/data:/data:rw" \
  -v "$PWD/config:/config:ro" \
  local-video-studio-nas:local
```

容器采用当前 NAS 登录账号的 UID/GID，与镜像默认 node 用户不同，可避免为了默认 UID 1000 改动历史目录权限；新建 data 也归该账号。视频/历史只读挂载，服务只写自己的 data。

成功会输出一串容器 ID。若提示名字已存在，不重复创建，也不删除旧 data；在 DSM Docker 的容器列表查看是否已有此服务。

检查日志：

```sh
sudo docker logs --tail=80 local-video-studio
```

正常应出现 NAS browser listening on port 8790。首次索引/上传未齐可能暂时无法显示全部作品，等 Drive 完成；持续报错时保留日志排查。

## 8. 用浏览器打开与日常管理

手机/平板和 NAS 在同一局域网，浏览器打开 `http://你的NAS_IP:8790`。可以先打开 `http://你的NAS_IP:8790/healthz`：ready 为 true、count 大于 0 表示有可浏览作品。

- 页面打不开：在 DSM Docker 确认容器运行、日志没有启动错误、8790 端口映射存在；若已启用 DSM 防火墙，允许家庭 LAN 访问 TCP 8790，不需要配置路由器公网端口。
- 能开页面但库为空：核对库 ID、Drive 是否已上传 current.json 及其 records/texts，媒体根层级是否对应；查看 healthz 和日志。
- Permission denied：检查当前 NAS 登录账号对两个根目录及子目录有读取/遍历权限，对服务 data 有写权限；不改成特权容器。
- 修改 config 后重启容器生效；更换挂载路径属于容器配置变更，应保留原 data 并按新路径重新配置，不能只改 PC 盘符。
- 日常在 DSM → Docker → 容器，选 local-video-studio 查看详情/日志、停止或重新启动。电脑关闭不影响 NAS 中已同步完成的资料。

SSH 中执行 exit 即可退出。结束后可关闭 SSH；Docker 服务继续运行。上述配置未对群晖实机做兼容承诺，需以第 5 步和真实播放为准。

如果需要镜像 tar 留存，可在镜像构建成功后另执行：

```sh
sudo docker save -o local-video-studio-nas.tar local-video-studio-nas:local
```

## 从源码重新准备部署目录

在仓库根运行 `node Tools/NasBrowser/build.mjs`，复制本工具 Dockerfile、.dockerignore、dist、本文以及 config.v2.example.json（命名为 config.example.json）到新的 local-video-studio 目录后打 zip；不打包历史、视频、config.json、node_modules 或 SQLite。上传后从第 2 步继续。

官方参考：[DSM 6 终端机设置](https://kb.synology.com/en-global/DSM/help/DSM/AdminCenter/system_terminal_snmp_desc?version=6)、[DSM 6 Docker 使用说明](https://kb.synology.com/th-th/DSM/help/Docker/Docker?version=6)。
