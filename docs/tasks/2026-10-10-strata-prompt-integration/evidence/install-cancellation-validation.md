# 安装取消验证

- 类型：Evidence；状态：passed（取消功能范围）；日期：2026-10-10。
- 权威与下一步：[TASK](../TASK.md)。不代表完整 Strata 实装/推理或所有第三方包的回滚验证。

## 实现边界

renderer 安装队列独立于生成队列。取消等待项立即移除，日志保留，可重新加入；当前安装使用 RuntimeAdmin 的每请求 AbortController，AsyncLocalStorage 将同一信号传到嵌套安装/进程入口，显式进程信号与之合并。重试前检查信号，下载 curl、Git、pip 共用已有有界进程入口；Windows 按当前 spawn PID 使用 taskkill /T /F，等待子进程及终止器退出才拒绝，不提前释放安装槽。不会按进程名称停止其他安装器或 ComfyUI。

Strata 发布前/最终记录前检查取消，原事务保留未完成资料、恢复旧管理目录；节点安全替换及嵌套运行库发布点继承取消检查。已有 Python 包替换可能部分完成，取消不承诺整套共享 Python 自动回滚。此前运行的 ComfyUI 仍按既有安装器恢复路径处理；本轮没有真实升级用户 Python 或验证此恢复启动分支。

复用主按钮位置显示“移出队列”/“取消安装”，取消处理中禁用重复操作；未安装仍无三角/位置菜单。取消结果与失败分开，取消-only 批次仅离线复扫，不启动 ComfyUI；已有成功项仍按原规则批次重启。

## 自动验证

最终 `npm.cmd run verify` 成功：全部 unit、86 项 integration、干净类型构建、20 项文本对比度。已有 jsdom window.scrollTo 提示未导致测试失败。

- installation-cancellation：真实 Node 子进程及其后代退出后才返回，日志保留；真实 curl 连接本机挂起 HTTP 响应后取消，未继续重试；取消后不再启动下一命令；等待恢复/重复安装保护/已提交成功竞态。
- node-install-queue：移除等待项不执行，允许重新加入；当前项真正结束前不执行下一项，后续成功项仍重启一次；取消-only 复扫且不启动服务、不发失败通知。
- strata-installation：模拟 pip 中止后旧完整管理目录恢复，安装槽释放前恢复结束。
- settings-install-cancellation：生产 markup 的三个状态、真实 DOM click 的四类目标、生成运行时仍允许取消安装、重复 click 抑制；main-boundary 与 RuntimeAdmin 到安装器信号接入验证。

## 真实 Electron

最终自有 fixture `create-smoke-wpHkWO`：PID 67464，CDP 6960，配置的离线 ComfyUI 端口 47829，本机挂起代理 6958；报告及截图留在忽略的 temp 夹具。使用生产构建、真实鼠标、focus emulation；仅测试目录，标准 Python 只做 venv 支持检查，未运行 GPU/下载权重。

实际点击 VideoHelperSuite 安装，Git 连接本机代理后处于执行中；再点击 GGUF 入队，其主按钮为“移出队列”。点击移除后没有该节点 started 记录；点击当前节点取消后两个自有 Git PID 消失，取消日志记录存在，按钮恢复。实际点击 Strata 安装，源码 fetch 挂起时四个自有 Git PID 由 Electron 父进程链确认；实际点击取消后全部退出，按钮及扫描恢复。安装前后（初始页面扫描/工作流路径加载完成后取 baseline）persisted state 严格一致。

1280/1440/960 宽度的 Strata 取消按钮可见，无横向溢出，未安装项无三角；960 截图人工核对通过。本轮 llama/H3 的 UI 目标与信号由 DOM/服务测试覆盖，没有实际修改共享 Python 包。

首次测试代理未处理取消连接的 ECONNRESET，夹具异常退出；补上 socket error 处理并清理该隔离窗口。后续调整 Git 所有权检查（fetch 命令行不带 cwd，改用父进程链）、把 state baseline 放在初始加载结束后；最终全链通过，不放宽安装/取消断言。

最终及失败夹具均用既有 close-fixture-smoke 清理，自有 Electron PID、Git PID 和 CDP/ComfyUI/代理监听复核无残留。此为 Harness 清理，不当原生窗口退出生命周期证据；没有停止其他程序，测试资料保留可恢复。
