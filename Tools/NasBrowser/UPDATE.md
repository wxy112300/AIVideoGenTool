# 更新已部署的 NAS 浏览服务

类型：更新手册；日期：2026-10-29。适用：按 DSM6-QUICKSTART.md 部署的服务，容器名 local-video-studio、端口 8790、配置与本地索引分别挂载项目目录下 config/data。

## 1. 先更新 PC 发布端

在创作电脑运行含本次修正的 App。启动后会自动发布收藏、半星评分和标签，等待 Drive 上传 Library/StudioLibrary 下的新提交；无需手动导出。旧 App 导出的资料没有收藏/评分，单独更新 NAS 不能恢复被省略的值。NAS 继续只读取浏览投影，不直接读取桌面主库。

从源码运行时，更新源码后在仓库根安装已有锁定依赖、构建并启动 App；已有依赖不必重复安装。安装版需使用包含此修正的后续 App 版本，本更新包不包含 Windows 安装程序。

## 2. 上传程序更新包

使用本目录的 NAS-Browser-Update-2026-10-29.zip。在 File Station 上传到 docker 共享文件夹并解压到当前位置，合并已有 local-video-studio 文件夹，覆盖程序文件。包内只有 Dockerfile、.dockerignore、dist 和本文，不包含 config、data、视频、资料库或基础镜像。原配置与本地索引保持原位。

## 3. 构建并验证新镜像

以下命令在 NAS SSH 执行，每步成功再继续。目录不是 /volume1/docker/local-video-studio 时替换 cd 路径。基础镜像已导入，无需代理或重新下载。

```sh
cd /volume1/docker/local-video-studio
sudo docker build --pull=false -t local-video-studio-nas:update-20261029 .
sudo docker run --rm --network none --entrypoint node local-video-studio-nas:update-20261029 -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ready (id INTEGER)');db.close();console.log('SQLite OK')"
```

出现 SQLite OK 后继续。下列命令从现有容器读取媒体/资料目录和运行身份，不必重填路径；引号会保留路径中的空格。确认 ls 成功，并且 SERVICE_USER 非空。

```sh
MEDIA_ROOT=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/media"}}{{.Source}}{{end}}{{end}}' local-video-studio)
LIBRARY_ROOT=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/library"}}{{.Source}}{{end}}{{end}}' local-video-studio)
SERVICE_USER=$(sudo docker inspect --format '{{.Config.User}}' local-video-studio)
printf '运行身份：%s\n' "$SERVICE_USER"
ls -ld "$MEDIA_ROOT" "$LIBRARY_ROOT" "$PWD/data" "$PWD/config/config.json"
```

## 4. 切换容器

旧容器停止后保留，便于回退；镜像使用新标签。若备份名已存在或任一步报错，先停止本次更新，不删除旧容器、data 或 config。

```sh
sudo docker stop local-video-studio
sudo docker rename local-video-studio local-video-studio-backup-20261029
sudo docker run -d \
  --name local-video-studio \
  --restart unless-stopped \
  --read-only \
  --user "$SERVICE_USER" \
  -p 8790:8790 \
  -v "$MEDIA_ROOT:/media:ro" \
  -v "$LIBRARY_ROOT:/library:ro" \
  -v "$PWD/data:/data:rw" \
  -v "$PWD/config:/config:ro" \
  local-video-studio-nas:update-20261029
sudo docker logs --tail=80 local-video-studio
```

浏览器打开原地址并强制刷新（Windows Chrome：Ctrl+F5）。Filter 应包含收藏、评分范围和评分排序；列表和播放器显示同步值，播放器不能修改收藏/评分/标签。布局、视频播放和 Prompt 仍可用。Drive 完成前可能继续显示旧数据，等待轮询并刷新；无需删除 data 重建。

## 5. 必要时回退

新容器已创建但启动失败时，保留它的日志，再执行：

```sh
sudo docker stop local-video-studio
sudo docker rename local-video-studio local-video-studio-failed-20261029
sudo docker rename local-video-studio-backup-20261029 local-video-studio
sudo docker start local-video-studio
```

如果新容器根本没有创建，只需执行最后两行。旧镜像能继续读取新增收藏/评分字段，SQLite 结构未改变；本步骤不删除容器、镜像或持久数据。
