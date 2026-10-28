# 0.67.1 Windows Release

类型：发布 · 日期：2026-10-28 · 状态：completed

## Resume

- 用户明确授权 patch 升级、全部当前改动提交推送、打包并发布 GitHub Release。版本由 0.67.0 升为 0.67.1，当前 main 基线 7c8db8c。
- 范围包含历史/剪贴板/扫描反馈、长视频 H3 配置、资料库与路径迁移、NAS 只读工具及 README 整理。保留现有功能未验边界，不以打包声明 NAS/群晖实机或所有长视频配置已验。
- 当前 agent 单独负责版本、提交、标签及 Release；无子 agent。使用隔离发布 checkout 构建，保留用户正在运行的应用、ComfyUI 和原 dist。
- 发布顺序：检查待提交文件 → 版本/快照 → 隔离全量检查与打包 → packaged 启动/资源/版本检查 → push main/tag → Release 制品上传与 hash 核对。
- 本机 GitHub CLI 已有 keyring 登录，凭据不写入仓库/日志。制品仅写忽略目录，发布 Windows x64 Setup、ZIP 和 SHA256SUMS。

## 验证和资源

- 发布源码提交：`17624cafb1b498283a718f3ffe6d1099b1201f63`。main 和注解标签 `v0.67.1` 已推送；版本、lockfile、README 与 CHANGELOG 对齐为 0.67.1。
- 正式 Release：[Local Video Studio v0.67.1](https://github.com/wxy112300/AIVideoGenTool/releases/tag/v0.67.1)。已核对非 draft、非 prerelease，GitHub latest 为 v0.67.1。
- 隔离 checkout 全量检查：296 个文件的 2777 个单元测试、7 个文件的 104 个集成测试通过；干净 typechecked build、440 项对比度检查通过。H3 Python guard 13 项、attention 2 项、group receipt 8 项通过；receipt 使用 CPU tensor，未初始化 CUDA。测试产生的 baseline snapshot 工作区标记仅为行尾变化，`git diff --ignore-space-at-eol` 无内容差异。
- `package:win:built` 成功。ASAR 共 8016 项，版本与包身份正确；38 个 bundled 节点/工作流文件与源码 hash 一致，未混入用户数据或临时文件。ZIP 和 NSIS 内嵌 7z 校验通过；NSIS 的 archive tail 提示来自封装尾部。未执行系统安装，未签名。
- 独立 userData/资料库/端口下启动 packaged exe，经真实导航按钮检查 Create、Queue、History、Settings 和 reload。最终关闭验收先断开 CDP，再发送系统关闭请求，`WaitForExit(30000)` 成功；进程不存在、测试端口释放。Windows 返回 ExitCode 不可用，未将其记为 0。
- 负向探针保留：首次扫描期间关闭的 child exit 等待超时；隐藏测试窗口无法取得 native handle；保持 CDP 连接时退出等待超时。最终无 CDP 的系统关闭路径通过，不推广为所有活动任务/未保存设置关闭分支均已验证。
- 制品保留在忽略目录 `release/0.67.1/`，远端三个 asset 均为 uploaded，大小和 GitHub SHA256 digest 与本地一致：

| 文件 | 字节数 | SHA256 |
| --- | ---: | --- |
| Local-Video-Studio-0.67.1-win-x64-Setup.exe | 119023924 | `81982591b2b376a43f77c493492df8c1acc2145242cc784f9a0624b2f6220b45` |
| Local-Video-Studio-0.67.1-win-x64.zip | 165938146 | `36f6549654566806704274cac19e44e5e7aacb310099eec769de2922c1807fee` |
| SHA256SUMS.txt | 214 | `cb9882c2ce850f437d8ce88ad8d5572555a1197b77ccd23ac57131530031edea` |

- 用户现有 Electron、ComfyUI、GPU 任务与主 checkout 的 dist 未被停止或清理。自有 packaged 测试进程与端口已释放；临时 node_modules junction 已按目标校验后移除，主依赖目录保留。托管 checkout 的 attachment 查询持续超时，暂保留 checkout，不手动删除。
- 验收日志及脚本位于忽略目录 `temp/release-0.67.1/`。未重跑所有 GPU 模型/量化/LoRA/Attention 组合；FastH3 Omni、MOSS、长视频新配置和现有 Run 接续、NAS/DSM 实机以及 Windows Explorer 间歇粘贴仍保留原任务验证边界，已写入 Release notes。
