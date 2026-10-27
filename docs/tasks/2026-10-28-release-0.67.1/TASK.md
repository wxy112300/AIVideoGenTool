# 0.67.1 Windows Release

类型：发布 · 日期：2026-10-28 · 状态：in_progress

## Resume

- 用户明确授权 patch 升级、全部当前改动提交推送、打包并发布 GitHub Release。版本由 0.67.0 升为 0.67.1，当前 main 基线 7c8db8c。
- 范围包含历史/剪贴板/扫描反馈、长视频 H3 配置、资料库与路径迁移、NAS 只读工具及 README 整理。保留现有功能未验边界，不以打包声明 NAS/群晖实机或所有长视频配置已验。
- 当前 agent 单独负责版本、提交、标签及 Release；无子 agent。使用隔离发布 checkout 构建，保留用户正在运行的应用、ComfyUI 和原 dist。
- 发布顺序：检查待提交文件 → 版本/快照 → 隔离全量检查与打包 → packaged 启动/资源/版本检查 → push main/tag → Release 制品上传与 hash 核对。
- 本机 GitHub CLI 已有 keyring 登录，凭据不写入仓库/日志。制品仅写忽略目录，发布 Windows x64 Setup、ZIP 和 SHA256SUMS。

## 验证和资源

待填写最终提交、检查结果、制品信息、公开 URL 与自有资源清理。
