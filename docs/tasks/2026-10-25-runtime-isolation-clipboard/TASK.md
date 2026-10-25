# 无 LoRA 重启与历史文件复制回归

- Status: completed
- Updated / Owner: 2026-10-25 / 当前 Codex（direct）
- Scope: 修复用户报告的无 LoRA 任务间自动重启，以及历史复制文件重复点击/偶发失效；patch，不修改持久化格式或发布云端版本。

## Resume

- 旧 HEAD 已存在 H3 完成后按整卡占用与 GPU 活跃度校验释放的兜底路径，它独立于 queueIsolationMode；其他程序占用或遥测缺失可触发恢复重启。已改读取当前 ComfyUI `/system_stats` 的 Torch 活跃分配；未知不冒充泄漏，明确释放失败和持续进程保留仍走本地恢复，remote 不管理进程。
- 文件剪贴板 staging→系统写入→旧 staging 清理已串行化，同路径 UI 请求合并，按钮 aria-busy 并在 finally 恢复；Windows CF_HDROP 写入后核对文件列表并做有界重试。原来两个并发事务可删掉对方已发布的文件。
- 定向与完整 verify 已通过：2533 单元/91 集成/构建/440 对比度。实际 Create 缺输入→键入→三次按钮入队、Queue 真按钮→三个 448×256 / 1.625 秒成片及播放通过。LoRA 隔离设置、三个空 LoRA 快照、同一 ComfyUI 进程树、两次释放验证与零任务间重启均已核对。第一段释放后的整卡占用实际高于旧阈值，成功验证修复路径。
- History 复制中心/图标/右边缘单击，以及五次快速重复点击通过；重复点击合并为一次原生复制，CF_HDROP 暂存文件存在且原始视频大小保持。自有窗口、Python 进程树和独立端口全部退出，用户库/应用未被停止或修改。工作区补丁未提交、未打包或发布云端版本。[验证证据](evidence.md)。

## 接入边界

- 不移除用户所选 LoRA 边界、always/model-change 策略；没有修改模型切换、错误重试、取消和退出时的必要进程动作。
- 本次复制及 GPU 验收只操作自有 `temp/create-smoke-*` 物理副本/输出，不删除用户资产，不停止用户应用。测试窗口和独立 ComfyUI 必须收尾。
- 已核对实际安装核心的 `server.py` 与 `comfy/model_management.py`：`torch_vram_total` 为 reserved，`torch_vram_free` 为 reserved-active；差值用于当前进程活跃 Torch 内存，不把设备总占用等同进程泄漏。

## 验证边界

- 无 LoRA 的连续真实生成已验证；LoRA 边界、always/model-change、遥测缺失/零值、其他程序高占用、真实保留、释放拒绝和 remote 分支由定向服务/执行器测试覆盖，未为每种模式重复 GPU 生成。
- 复制覆盖真实 Windows 文件剪贴板与单视频详情按钮；并发事务与失败后恢复另有真实临时文件+模拟原生命令的回归。没有保证任意第三方剪贴板持续独占时一定成功，失败仍会反馈。
