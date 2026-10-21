# History 关联删除二次确认

- Status: done
- Scope / Authority: 用户要求关联 Continuum 不再因引用被永久禁止删除；显示二次确认，确认后仅删除所选目标，不级联删除其他作品。
- Baseline: 0.66.5 / 150d07c；已有提示词设置精简与独立截图脚本修改，全部保留。Execution: direct，无子 agent。

## Resume

- 原因：共享路径以及 Continuum 序列 asset ID 在统一引用检查中直接抛错，即使 Run owner 不在删除集合内也会阻塞。
- 方案：保留第一次普通确认，后端在 unlink 前返回可识别的引用影响挑战；第二次显示关联对象并绑定目标/引用快照。确认后重查；新引用或目标变化重新确认。旧 IPC 调用不带授权仍不会直接删共享文件。
- 范围：视频作品、批量、版本及现有可管理辅助文件；保留图片原始输入保护、Run owner 不级联删除、部分失败报告、队列快照与现有 Extend 缺失检查/回退。
- 已验：focused 75 项、双端类型检查、首次完整 verify（2318 单元／91 集成、构建、20 项对比度）；真实 Electron 双确认/取消/删除/重启与关联记录保留通过。
- 补充：已知精确 absolutePath 的文件若此前已删除，整作品/版本删除按 ENOENT 成功处理，不因共享 AV 缺失困住剩余记录；权限/IO 错误仍报告部分失败。不猜测多个逻辑候选路径。
- 最终验证完成：补充后的全量测试通过；类型检查捕获可读标签的 key namespace 后已修复，受影响 48 项回归、clean build（含类型检查）与 20 项对比度全部通过。未重复已通过且不受此 key 修正影响的全量测试。不删除实库或调用 GPU。

## Evidence / handoff

- Focused：history-services / history-delete-confirmation / renderer-shell-coordinator / main-boundary / history-delete / app-harness 共 75 项通过；补充缺文件路径后 53 项定向与类型检查通过。涵盖三种目标的 Continuum ID 关联、取消、确认、确认期间新引用重审、其他作品和 Run owner 保留、共享 AV 后续整记录删除、真实 IO 失败保护、Electron 字符串错误封装及普通错误不误识别。
- 隔离真实 UI：`temp/create-smoke-qxtWL7`，合成 Continuum 关联拓扑使用真实复制的测试 MP4，非真实新 Run 生成。原始副本未修改；queue stopped、无 GPU。实际鼠标删除 → 第二次影响确认（列出关联作品/草稿/队列）→ 取消时所有文件 hash 不变 → 再次两次确认删除选中 MP4/记录，后续 MP4 可播放，其他 History、queue、draft 与 Run-owner sentinel 不变。1280×800、1440×900、960×800 无横向溢出，截图人工查看。
- 重启审计通过：记录未恢复，关联数据保持，已删源检查 missing；从保留的成片检查普通 Motion Context 像素路径 available。只证明既有来源检查/可用回退入口，不声称真实 managed Run 缺文件后还能原生续采或 GPU 生成。
- 测试窗口 PID 62944 / 61328 / 36136 及各 CDP、Comfy 测试端口经 cleanup helper 关闭，未启动 Comfy 服务；不是原生退出生命周期验收。报告、截图和原始 state 均留忽略目录，不提交媒体或机器路径。
- 版本影响 patch，已记 Unreleased；保留已有设置精简、UI 设计任务及截图脚本修改，本轮不自动提交/推送。
- 最终日志：`temp/history-linked-delete-verify.log`、`temp/history-linked-delete-verify-final.log`；后一轮的 238 单元文件／2318 tests、6 集成文件／91 tests 通过，build 阶段的 key 类型错误单独修复并完整重跑 build/contrast。新增 fallback 不放宽访问错误：EACCES/部分删除仍有保留记录和 invalid 状态断言。
