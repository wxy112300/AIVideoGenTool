# Windows 打包与 GitHub Release
- Status: archived（2026-10-19归档已完成的0.65.1发布）
- Updated / Owner: 2026-10-12 / 当前 agent
- Scope / Authority: 用户授权打包并发布 GitHub Release；发布当前已提交的 0.65.1。
- Baseline: d32610f，工作区干净；远端 main 相同，无版本标签或 Release。
- Execution: direct，无子 agent。

## 归档说明

- 2026-10-19用户同意归档，文件归属已释放。0.65.1打包、制品校验与公开发布已完成，以下latest及资产状态均为当时核验记录；本轮不重新发布、上传或修改Release，不将未验的系统安装/卸载或模型质量标为通过。

## Resume
- 新增可重复 Windows x64 安装包与便携 ZIP 打包入口，内置节点及工作流放在 resources。
- 已完成完整 verify、最终打包、隔离 packaged 启动与正常退出、提交/标签、上传及公开发布；无待执行项。
- [v0.65.1 Release](https://github.com/wxy112300/AIVideoGenTool/releases/tag/v0.65.1) 已设为 latest，非 draft / 非 prerelease；代码标签指向 e7b9af7。公开未认证 API 已确认三个下载资产可见。
- 发布草稿上传期间发现顶层 productName 会改变原用户数据目录；已移至 build，重新打包并验证默认数据目录兼容。发布前仅更新本任务创建的尚未正式发布标签，使用精确 lease 防止覆盖并发修改。

## Implementation and resources
- 本次拥有 dist/release 构建；未发现同仓库活动构建或 Electron。
- 不启动 ComfyUI、不下载模型、不提交或删除用户草稿/队列/作品。一次默认路径探针读取实际 profile（APPDATA 环境变量不能覆盖 Electron 的 Windows 已知目录）；确认原队列 idle、4 个 failed/cancelled 旧任务、129 作品后正常关闭。其余运行检查均显式隔离 userData。
- 0.65.1 已有对应 CHANGELOG/README，保持版本一致；打包属于 patch 发布收尾。

## Evidence / handoff
- 官方 GitHub CLI 便携工具已校验 SHA-256，用户设备登录完成，仓库发布权限已确认。
- `npm.cmd run verify`：208 个单元文件 / 1,892 测试及 6 个集成文件 / 86 测试通过，类型检查、生产构建和 20 对文字对比度通过。日志在忽略的 temp 中。
- `npm.cmd run package:win:built` 成功，使用 npm 锁定的 Electron 43.2.0；EXE ProductName/版本正确。安装包、便携 ZIP、SHA256SUMS 位于忽略的 release 中。
- 最终 EXE 从独立 cwd/userData/APPDATA/LOCALAPPDATA/TEMP 启动：真实 AppApi 版本、空状态、resources 工作流读取、鼠标点击 Queue/History/Settings/Create、重载通过；开启 focus emulation。现有 second-instance 显示后发送原生关闭，主 PID/CDP 均退出。
- ZIP 和 NSIS 内嵌归档 CRC 检查通过；7-Zip 对 NSIS 包报告嵌入归档后有尾部数据。未在用户系统执行安装/卸载；未运行 GPU 生成。
- GPU 模型质量/性能沿用 0.65.1 未验证边界，不以构建证明生成成功。
- ASAR 保留原 name=ai-video-gen-tool 且无顶层 productName，内置节点/工作流 36 文件逐一 hash 一致；默认路径探针实际读到了原 129 作品，确认兼容原 profile。没有入队或启动运行时。
- 三个远端资产的 state=uploaded、大小和 GitHub SHA-256 digest 与本地一致：安装包 118,698,019 bytes，便携 ZIP 165,486,115 bytes，校验文件 214 bytes。首次 CLI 大文件上传等待，最终通过现有本机代理与官方上传端点逐文件完成；凭据仅在内存/标准输入，不写入日志或仓库。
- 自有 Electron/CDP/构建与上传进程已结束，构建产物及临时证据留在忽略目录；未停止其他任务资源。
