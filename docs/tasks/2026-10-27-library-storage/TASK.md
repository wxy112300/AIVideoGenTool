# 文档目录资料库、可靠迁移与 NAS 自动同步

- Status: done-local（三类目录确认、真实移动、进度与恢复已验收；实库迁移/群晖部署仍留现场）
- Updated / Owner: 2026-10-27 / 当前 agent
- Scope / Authority: 用户授权完成计划并强调历史珍贵，随后明确实际电脑不在本机，先准备实现、配置和说明。可实施与隔离验收；实库/NAS 不在本机试跑，不删除历史/旧备份，不提交推送、不打包 Release。
- 最新授权：用户要求历史资料库、视频和图片输出路径修改均先确认，确认后真实移动并显示进度，成功时不能只留下复制副本；视频与图片严格限制在当前 ComfyUI output 根内。此项覆盖之前“用户更换资料库后保留原目录”的旧设计；首次迁移前副本与配置恢复点仍保留。
- Baseline: 0.67.0；工作树有大量其他任务与 NAS 前置 dirty，全部保留。执行 direct，children=0。

## Resume

- 交付入口：[资料库/NAS 操作、配置与恢复手册](../../runbooks/LIBRARY_STORAGE_AND_NAS.md)。[PLAN](PLAN.md)保留设计/阶段验收；[本轮证据](evidence/local-verification.md)记录实际通过范围和限制。
- 保留作品/版本 ID、全部生成元数据、父子与 Run/AV/Motion 引用、缺文件历史；设置/草稿/队列留 AppData，媒体留 Output，v3 封面缓存继续复用。
- P0–P4 已实现：损坏/权限/缺集合不落空库、校验备份与迁移前完整副本；Documents 不可变分作品/文本/提交与 AppData 原子定位；位置冲突/缺库恢复；App 已提交变更自动发布；NAS v2 本地 SQLite 事务/重启/重建与旧 catalog 兼容。资料与媒体根独立映射；按用户最新要求，浏览投影自动置于 Library/StudioLibrary，NAS 上传路径由 Drive 配置，App 无发布目录设置；旧前置仍见[原任务](../2026-10-27-nas-browser/TASK.md)。
- 桌面沿用现有内存查询/分页，不增加 Electron SQLite 驱动或第二份权威历史；NAS SQLite 为派生索引。首版作品对象/旧提交不自动回收；八个近期配置状态及十四个每日恢复点之外，始终保留当前活跃配置、迁移前副本和损坏原件。
- 启动进度补充完成：当前阶段/实际作品计数、读取与迁移区分、快速完成不闪窗，完成交接主窗口；失败仍走恢复提示。verify 为 2750 unit + 104 integration、clean build、440 对比度；后续窗口聚焦 6 项、Electron 编译和真实 UI 通过。600 条迁移中断保留原件、重启后全部 ID/版本一致，相邻整理/设置/实际入队/原生重启通过，见证据。下一步仅为实际电脑/群晖现场执行。
- 尚待核对：另一台 PC 的 1200 个作品仅为用户报告，未访问；精确 DSM/Docker/内核版本、实际同步根路径/ACL 和地址未取得。它们影响部署验收，不阻止本地保护与迁移夹具开发。
- NAS 设置简化验收完成：37 项聚焦 + typecheck，完整 verify 为 2753 unit + 104 integration、clean build、440 对比度；真实 App `temp/library-ui-aofhPY/report.json` 通过无 NAS 控件、目录冲突恢复/实际保存、自动发布、旧视频播放/整理、缺输入恢复实际入队及两次原生退出重启。更新序号连续性及旧外置目录不被改动由 NAS 集成测试覆盖。未读实库/连接 NAS/运行 GPU。
- 后续启动弹窗修复：旧实现会给超过 250ms 的普通读取也显示启动窗；现仅实际 migration 显示，opening 事件完全不创建窗口，读取/校验与恢复不变。20 项聚焦、typecheck、Electron 编译通过；`temp/library-restart-kgbEFo/report.json` 连续两次真实 App 启动均无迁移窗口，库提交/作品/队列 ID 与迁移前副本数量不变。此项覆盖早期“耗时读取显示进度”的行为。
- 三类保存位置完成：历史数据默认 Documents，Settings 三类路径修改先确认，取消不移动；确认后同盘重命名、跨盘校验传输并移除源文件。视频/图片双重限制当前 ComfyUI output，链接不能越界；日志在启动时按已提交路径回滚/完成，清理失败不报成功。独立输入归档和 Run 文件受保护，NAS 发布在移动期间暂停，媒体离线也能移动资料库。
- 最新验收：`temp/storage-directory-move-verify-serial.log` 为 2778 unit + 104 integration、clean build、440 对比度通过；发布暂停/离线补充后 89 项聚焦 + typecheck、Electron 编译及最终真实 UI 通过。`temp/library-ui-zL1ak0/report.json` 包含确认/取消、冲突恢复、双媒体移动/进度/校验、源文件消失、移动后解码和两次原生退出重启；`temp/library-cross-volume-FK8Elk/report.json` 是真实跨磁盘卷移动并移除源文件。版本不升、无新依赖、不打包推送、未读实库。

## Implementation and resources

- 聚焦服务：state-file-safety、library-record-store、library-state-storage、library-location-recovery、nas-publisher，以及 file-relocation/settings-storage-migration。共享 NAS 协议/导出器在 src/infrastructure，Tools re-export 旧入口并增加 commit-index。main 仅组合平台路径、进度事件、恢复对话框与生命周期。
- Settings 复用原路径组件增加历史数据目录和三语言确认/冲突反馈，typed preload/History 快照兼容。NAS 浏览目录自动维护；搬迁暂停发布并移动验证后的完整库及发布提交，保留序号；旧外置发布目录不再使用也不删除。临时 OS 管道锁随进程退出释放，无永久主机/路径绑定；同一库不支持多机同时写或自动合并。
- minor，已追加 Unreleased，package/lockfile 仍 0.67.0，无新依赖。测试仅用物理隔离 temp、CPU H.264 及扫描占位文件；未读实库、未启动 ComfyUI/GPU、未连 NAS。Docker CLI 不可用，镜像与 DSM 兼容性留现场。

## 计划建立时的基线（历史，只用于追溯）

- 已读 docs/README、DOCUMENT_POLICY、TASK_TEMPLATE、架构 LAN/History 段与 NAS 前置 TASK。
- 当前审计依据：electron/store.ts 使用临时写入/rename 重试，失败可回退 copyFile；load 的宽 catch 会尝试留存 .corrupt 后创建默认状态；无完整的多代有效备份自动恢复机制。此为待修复边界，不是损坏一定发生的证明。
- 本机上一轮只读统计：137 个视频作品/148 版本，state 约 5.35 MB，视频 history 约 2.81 MB，NAS 精简投影估算约 0.36 MB；不能代表另一台电脑、实库规模测试或性能保证。
- 文档验收：4 份相关文档共 45 个相对链接检查通过；本次 scoped diff 空白检查通过，现有导航追加与其他任务条目保留。仅文档，未运行 build/测试/GPU。
