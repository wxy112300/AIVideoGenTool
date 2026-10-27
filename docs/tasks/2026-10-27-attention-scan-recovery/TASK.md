# Attention 扫描超时恢复

类型：bug fix · 日期：2026-10-27 · 影响：patch

## Resume

实现、全量检查与真实扫描验证完成。

- Torch/Sage/Kitchen 原先共用 30 秒预算，Kitchen 阶段超时不等于加速包缺失。对进程超时用新进程重试一次，第二次上限 60 秒；非零退出、包导入错误不自动重试，第二次失败仍显示未完成，不伪造 ready。总探针持续时间包含两次，最终错误保留最终阶段/时限。
- 服务启动/重启后的 renderer `service-change` 原先总是 runtime 扫描，后端该分支只投影先前 Python 结果，无法恢复失败。在最新已提交扫描的 Attention 失败时改走 dependencies；恢复后返回 runtime。过期请求不能修改恢复依据。
- 不改 H3 实际 Attention/VAE/采样/精度、队列快照，不把一次视频成功当成全部加速原生库已验证。正常参数编辑不新增探针。

## 验证

- focused：Attention probe、环境刷新调度、Python probe cache、Settings selectors/accessibility，59 passed；typecheck passed。
- 新测试覆盖超时后成功、不无限重试、第二次失败保持不确定、服务变化从失败恢复后回到轻量扫描。原有测试保留 native 导入失败、缺 Python、过期扫描不提交。
- 等价 verify：2699 unit + 91 integration passed；typecheck、桌面/Web build、Electron tsc、440 contrast passed。为保留运行中用户窗口资源，Vite 使用 `--emptyOutDir false`，未 clean dist。
- 隔离应用真实鼠标点击 Settings → 性能与加速 → 重新扫描全部，性能卡无“检测未完成”；另经真实 AppApi 强制原生探针，`source=live/state=valid/probeState=complete/ready=true`，3811 ms。本轮未在真实环境重现冷启动超时，恢复路径由模拟超时测试覆盖，不声称已复现截图时的机器负载。
- 本地证据：`temp/attention-scan-recovery/report.json`、`verify.log`、`cleanup.json`。隔离队列为空且停止，未启动 ComfyUI/生成；仅关闭本次测试应用，已复核其 PID 与 CDP/Comfy 测试端口释放。用户应用及共享运行环境保留。
