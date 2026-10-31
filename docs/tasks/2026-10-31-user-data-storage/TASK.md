# 用户数据统一存放 Documents

- Status: done（实际迁移完成并只读校验；按用户请求准备 0.67.5 patch 提交推送）
- Updated / Owner: 2026-10-31 / current agent
- Scope / Authority: 用户授权继续迁移 AppData 内用户数据；明确排除 Electron 缓存、会话、程序运行时缓存。
- Baseline: main，已有 NAS cover publication 修复及多项其他任务的未提交改动，保留原样。
- Execution: direct，未派生 agent。

## Resume

- 用户重试后实际迁移已完成：只读校验 complete 标记、472 个迁移原件逐一 SHA256/大小一致（294765552 bytes）、旧目录业务项为零、137 视频/8 图片的作品及版本 ID 与迁移前提交完全一致、队列身份一致，10 个辅助路径全部存在且无旧 AppData 引用。173 张原始缓存与 142 个发布封面文件已落盘，NAS 指针存在。只读报告 temp/user-data-migration-live-audit-20261031.json，未修改用户资料。
- 用户明确要求检查通过后增加 patch 并提交推送：版本按要求从 0.67.4 改为 0.67.5，仅包含本次迁移/进度/封面补发及相应验证文档；共享文档按段提交，其他任务保持未提交。不创建安装包、tag 或 GitHub Release。

- 用户现场截图证实旧版整目录 rename(.Data-migration-* → Data) EPERM，且复制阶段未接现有窗口。只读检查真实文档根目前仅有 Library，无 Data/临时迁移目录，未修改用户资料；现场锁定进程未知，不猜测为 Drive/杀毒。
- 当前改为 Data 内先落 copying 日志、逐文件候选校验/flush/重试替换、prepared 后才交仓库；复制失败保留原件、已校验副本与日志，重试复用，完全不依赖目录改名。兼容已有 prepared/complete 标记。接入同一 LibraryStartupWindow，上报扫描/备份/复制/校验/引用切换/旧文件清理，三语言与保存主题保持。
- 本轮修复验收完成：目录 rename EPERM/临时文件 rename EPERM/复制半途失败恢复聚焦通过，随后完整 verify 通过 3027 单元 + 127 集成、干净类型检查与构建、440 对比度。日志 temp/user-data-migration-eperm-verify-20261031.log；未降低断言或超时。
- 真实窗口/重启：node scripts/harness/library-storage-smoke.mjs --migrate-user-data --migration-window，通过，报告 temp/library-ui-hASseR/report.json。额外 512 个小辅助文件使真实复制可观测，截图 user-data-migration.png 显示正在迁移用户资料、复制阶段和 1/516 实际计数；窗口 visible=true，handoff 后关闭，无第二套迁移 UI。延续播放/收藏评分Tag/实际路径保存与冲突恢复/实际入队/原生重启等全部旧验收。曾经只测小夹具没有覆盖真实慢迁移窗口，是上一轮遗漏。
- 本轮清理：自有 Electron PID 92560、91888 与 CDP 3571、4259 均已退出且无监听，nativeClose=true。只读列出真实 AppData 中原配置/备份与素材目录仍在，真实文档根只有 Library；未执行用户原件移动/删除、未启动用户主 profile、未连接 NAS、未启动 Comfy/GPU。

- 正常 profile 的设置、草稿、队列、封面、蒙版/标注/裁剪、剪贴板素材迁至系统 Documents/Local Video Studio/Data；Library 保留已配置位置。
- 显式 --user-data-dir 的隔离 profile 保持自身根目录，禁止触碰主用户资料。
- 先复制并校验，Documents 内保留迁移备份；通过正常 StateRepository 事务更新路径，成功后仅移除核验未变化的旧业务文件。启动失败不得落空状态。
- Electron userData 不改；GPU 进程协调锁、托管程序、诊断缓存不迁移。
- 已完成集中路径解析、安全迁移、正常仓库事务引用重写及启动接线。迁移记录支持中断恢复，配置备份与不可变 Library 身份保留。
- 独立 Agent 偏好在首次使用时从 LocalAppData 自动迁至文档 Local Video Studio/AgentPreferences，保留校验原件；运行日志/进程协调不搬迁。路径发现优先读取新 Data/studio-state.json，兼容 Studio 首次升级前的只读发现。
- 后续：Drive 继续同步文档；NAS 挂载与容器无需为本次 PC 路径切换修改。实际 PC 迁移已只读验收；未连接或修改群晖。

## Evidence / handoff

- 已读 repository skill；harness:app guide library-storage 已运行。
- 初始范围评估 minor；本轮用户明确指定 patch，发布记录采用 0.67.5，未授权生成发布包。
- 上一项 NAS cover 修复保留且未提交，详见 NAS TASK；封面原始目录随 StudioPaths 切到 Data/history-covers/v3，发布副本仍在已有 Library/StudioLibrary 下。
- Focused：迁移/路径/main 边界/Agent/NAS/History 测试已执行；已有 Library ID 与不可变图片记录内辅助路径、复制失败重试、损坏 state、双库冲突、变动源/坏备份/缺目标文件、链接拒绝、重启均覆盖。最后统一 gate 包含全部新增测试。
- 完整 gate：VITEST_MAX_WORKERS=4 npm.cmd run verify，通过 3020 单元 + 127 集成、干净类型检查/桌面与 Web 构建、440 项对比度检查。日志 temp/user-data-migration-verify-bounded-20261031.log。默认全并发首轮 NAS 文件移动用例 5 秒超时且清理竞态，限制并发后整套通过，未放宽断言/超时。
- 真实 Electron：node scripts/harness/library-storage-smoke.mjs --migrate-user-data，通过。报告 temp/library-ui-pU5x3f/report.json；已验真实启动迁移、旧封面直接 hit、辅助输入引用、精确迁移原件、视频解码、收藏/评分/Tag、实际设置确认与冲突恢复、媒体移动后播放、实际按钮缺 prompt→恢复→task ID、编辑后队列快照隔离、原生退出/重启。首次 smoke 用旧 fixture 的非活动草稿路径作为 UI 编辑后的重启期望，修正为保存实际 UI 状态后最终通过；生产逻辑未为此改动。
- 资源清理：最终两次 Electron PID 92596/12672 及 CDP 13762/14068 均已退出/无监听；nativeClose=true。首次失败 smoke 的自有进程也由其 finally 关闭，最终机器无 Electron 残留。无 GPU 或 ComfyUI 启动；临时合成素材与日志保存在忽略的 temp。
- node --check 两个修改后的 harness 脚本、git diff --check 通过；原 Windows 文件保留 CRLF。其他任务 dirty 全部保留。
- 实际模型/effort 与费用未由工具提供，不推断；本任务 direct、children=0。版本 0.67.5，提交/推送以 Git 实际结果为准；不打包。
