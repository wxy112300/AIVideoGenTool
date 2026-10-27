# 历史单独删除 AV 后保持界面干净

- 状态：完成；影响：patch。
- 要求：AV 单独删除后，顶部标记、AV 信息块、删除说明与已删文件条目均不再出现。
- 边界：保留内部 missing/no-artifact 删除边界，不改变文件删除事务、持久化格式、共享 owner 保护和真实异常诊断。

## Resume

详情渲染此前把内部缺失标记当成可展示 AV 信息，顶部标记还可读取删除前的检查缓存。现在仅在版本仍有实际 AV 引用或非删除异常状态时读取／展示 AV 检查。旧版成功删除留下的 missing/no-artifact 标记同样不展示。工作区其他长视频等改动保留，本次不处理。

## 验收

- `temp/history-av-removal/focused.log`：42 项定向测试；typecheck 通过。覆盖删除前检查缓存、缺失标记／无标记、保留独立 Motion Context，以及路径恢复后不重新出现 AV。原损坏／删除失败检查保持通过。
- `verify.log`：2688 单元 / 91 集成、类型检查、桌面／Web 构建、Electron 编译、440 对比度通过。当前用户应用在运行，因此构建使用 `emptyOutDir false` 保留旧哈希资产、不执行 dist 清理、不停止用户窗口。
- `ui-report.json`：最终生产 Electron，真实鼠标点详情 AV 删除和确认。删除前顶部标记／信息块／删除按钮各 1，文件 3 行；删除后均 0、文件只剩 MP4 一行，视频 SHA-256 不变、AV payload/manifest 物理文件不存在，视频与放大入口保留。返回历史再进入结果不变。AV 是明确的微型文件操作夹具，不用于证明 AV 解码／续写准备度。
- `restart-report.json`：应用正常关闭后重新启动、进入同一详情，AV 标记／摘要／删除按钮仍为 0，输出仅 MP4，内部删除边界持久化但不显示。已人工检查 `after-delete-top.png` / `after-delete-files.png`。
- `cleanup.json`：最终自有 PID 51648 / CDP 12871 正常退出，12871 / 18188 无监听；首轮 65500 也已关闭。专属临时目录、空队列、ComfyUI 停止、Prompt 空闲；没有删除用户文件、修改源媒体夹具或启动 GPU。
