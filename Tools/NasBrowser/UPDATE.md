# 更新已部署的 NAS 浏览服务

类型：更新手册；日期：2026-10-29。适用：按 DSM6-QUICKSTART.md 部署的服务，容器名 local-video-studio、端口 8790、配置与本地索引分别挂载项目目录下 config/data。

## 1. 先更新 PC 发布端

在创作电脑运行含本次修正的 App。启动后会自动发布收藏、半星评分和标签，等待 Drive 上传 Library/StudioLibrary 下的新提交；无需手动导出。旧 App 导出的资料没有收藏/评分，单独更新 NAS 不能恢复被省略的值。NAS 继续只读取浏览投影，不直接读取桌面主库。

从源码运行时，更新源码后在仓库根安装已有锁定依赖、构建并启动 App；已有依赖不必重复安装。安装版需使用包含此修正的后续 App 版本，本更新包不包含 Windows 安装程序。

## 2. 上传程序更新包

首次部署和更新统一使用 NAS-Browser-Deploy.zip。在 File Station 将包解压到临时文件夹，再把其中 local-video-studio 里的 dist、Dockerfile 等程序文件复制到现有项目目录，合并并覆盖同名文件。不多套一层 local-video-studio 或 dist。包内示例配置名为 config.example.json，不包含实际 config/data、视频、资料库或 Node 基础镜像；原配置与本地索引保持原位。

## 3. 构建并验证新镜像

以下命令在 NAS SSH 执行，每步成功再继续。目录不是 /volume1/docker/local-video-studio 时替换 cd 路径。先查看构建标识，确认复制的 dist 来自新包；基础镜像已在 NAS 时无需重新下载。

```sh
cd /volume1/docker/local-video-studio
cat dist/deployment.json
sudo docker build --no-cache --pull=false -t local-video-studio-nas:local .
sudo docker run --rm --network none --entrypoint cat local-video-studio-nas:local /app/dist/deployment.json
sudo docker run --rm --network none --entrypoint node local-video-studio-nas:local -e "const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE ready (id INTEGER)');db.close();console.log('SQLite OK')"
```

两个 deployment.json 的 builtAt/webEntry 应一致，出现 SQLite OK 后继续。下列命令从现有容器读取媒体/资料目录和运行身份，不必重填路径；引号会保留路径中的空格。确认 ls 成功，并且 SERVICE_USER 非空。保持同一个 SSH 窗口完成后续步骤。

```sh
MEDIA_ROOT=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/media"}}{{.Source}}{{end}}{{end}}' local-video-studio)
LIBRARY_ROOT=$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/library"}}{{.Source}}{{end}}{{end}}' local-video-studio)
SERVICE_USER=$(sudo docker inspect --format '{{.Config.User}}' local-video-studio)
printf '运行身份：%s\n' "$SERVICE_USER"
ls -ld "$MEDIA_ROOT" "$LIBRARY_ROOT" "$PWD/data" "$PWD/config/config.json"
```

## 4. 切换容器

直接移除本服务当前容器及上一次教程留下的备份容器，再创建新容器；不保留旧容器，不删除 config/data。先完成上方镜像验证及路径读取，任一步报错先停止。

```sh
for CONTAINER_NAME in local-video-studio local-video-studio-backup-20261029; do
  if sudo docker inspect --type container "$CONTAINER_NAME" >/dev/null 2>&1; then
    sudo docker rm -f "$CONTAINER_NAME"
  fi
done
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
  local-video-studio-nas:local
sudo docker logs --tail=80 local-video-studio
```

浏览器打开原地址并强制刷新（Windows Chrome：Ctrl+F5）。Filter 应包含收藏、评分范围和评分排序；列表和播放器显示同步值，播放器不能修改收藏/评分/标签。布局、视频播放和 Prompt 仍可用。Drive 完成前可能继续显示旧数据，等待轮询并刷新；无需删除 data 重建。

## 5. 确认网页已更新

用自己的 NAS 地址检查实际提供的网页；示例 IP 请替换。assets 中的 JS 文件名应与 deployment.json 的 webEntry 一致。

```sh
sudo docker exec local-video-studio cat /app/dist/deployment.json
curl -fsS http://你的NAS_IP:8790/ | grep 'assets/index-'
```

若部署目录中的标识还是旧值，重新覆盖 dist；镜像标识旧则重新构建；运行中容器标识旧则重新创建容器。标识都正确后用无痕窗口或 Ctrl+F5 打开页面。新版 Filter 的重置/应用固定在底部，筛选字段独立滚动。
