# H3 GGUF 更新检测修复

日期：2026-10-28。影响：patch；已记 Unreleased，不升级应用版本、不打包发布。

## 原因与改动

H3 专用 loader 适配原先写入独立注册名后删除 `.git`。推荐线新增固定提交检测后，版本文件仍能读出 26.10.21，但扫描器无法确认安装 revision，导致更新成功仍提示需要更新。

适配现在保留 Git 元数据；安装器将内容完全匹配的应用自身 `__init__.py` 补丁识别为可复用安装。来源、固定提交仍须匹配，未知修改沿用安全替换路径。通用 GGUF 并存逻辑保留。

## 本机修复证据

- 固定官方 tag `v26-10-21`，验证提交 `61843db580f8549a85b0a1ed850d550079fadfee`。
- 对比 54 个上游跟踪文件（文本允许 CRLF/LF 差异），单独确认已安装入口与应用 H3 适配内容一致，才恢复 `.git`。恢复前后全部原文件 hash 不变。
- 使用应用实际扫描服务对已安装目录复查：`installed=true`、`version=26.10.21`、`detectedRevision=61843db580f8549a85b0a1ed850d550079fadfee`、`updateAvailable=false`、`updateNotice=""`、`compatibilityState=supported`。
- 原始恢复报告及扫描结果留在忽略的 `temp/h3-gguf-revision-repair/`；不提交机器路径或安装日志。

## 验证与边界

- 安装器及扫描器 focused：2 文件 / 81 项通过。覆盖适配后 revision 可读、错误提交仍提示更新、重复安装不再克隆、通用 GGUF 保留。
- 全量 Vitest：`vitest run --config vite.config.ts --exclude 'dist/**' --maxWorkers=4 --reporter=dot --silent=passed-only`，306 文件 / 2895 项通过。
- `npm.cmd run typecheck`、桌面及网页 Vite 生产构建、Electron TypeScript 编译、440 项对比度和 `git diff --check` 通过。
- 另一个任务持有仓库 Electron 验证窗口，构建输出使用隔离临时目录，未清理其 `dist`；本轮没有运行标准 clean build 或 bundled-node 复制步骤。
- 本轮证据为实际文件与服务扫描层；未复验用户窗口刷新后的显示、节点运行时 schema、GGUF 生成、性能或质量。未启动/停止 ComfyUI、占用 GPU、下载权重或改动 Python 环境。
