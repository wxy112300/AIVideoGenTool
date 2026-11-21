# KJNodes 1.5.5 推荐更新

- 状态：推荐更新完成；保留以下全量验证限制，不宣称全量门禁通过。
- 影响：patch，仅更新推荐；用户最初提到 GGUF，随后明确更正为 KJNodes。
- 范围：不安装生产节点、不重启 ComfyUI、不下载权重；保留现有跟随 HEAD 的安装策略。

## 基线与候选

- 本机与原推荐：1.5.4，`70701d2a11d4797cf52733290ed0b6b5037148d9`，origin 为 kijai/ComfyUI-KJNodes，tracked 文件干净。
- 2026-11-21 官方 API 与独立 Git clone 确认最新 HEAD：1.5.5，`aa2b5ea5e7f61b51f5d26d726f23c1d74e951016`，最后提交为 2026-11-18 UTC。上游没有 GitHub Release；版本来自 pyproject。
- 当前所选核心 `c844cb672186f187bf9455e2808821417a10d296`；CPU 探针使用所选 Python，未修改其安装。

## 更新与兼容边界

- 相比推荐基线新增 5 次提交，仅修改五个文件：H3 提示词节点、通用工具节点、注册入口、前端嵌套连线恢复和版本文件。
- MiniMaxH3PromptWeight 新增视频编辑参考图/视频/音频、首尾帧，以及参考条件的 start/end 生效范围；不把上游默认尺寸/帧数套用到应用参数。
- GetWorkflowKJ 可输出工作流或 API prompt JSON。前端扩展恢复 DynamicCombo 内多种参考素材连线。
- 依赖声明不变；现用 PathchSageAttentionKJ、get_sage_func、VRAM_Debug、ModelPreviewOverrideKJ 的 AST 不变。新增节点未接入应用工作流，因此不改变旧队列、History 或现有视频采样路径。
- 实际升级后的 GPU 加载、生成、速度、显存与画质未验证，不将 CPU/schema 兼容表述为 GPU 收益。

## 验证与下一步

- 候选 Python 源码语法检查通过；CPU 注册 268 节点（原安装 267），无移除，仅新增 GetWorkflowKJ。三个现用节点完整输入 schema 与本机 1.5.4 一致。CPU 进程禁用 CUDA，仅在该进程替换 Kitchen CUDA 能力探针，未监听端口或加载用户权重。
- catalog、scanner、H3 工作流契约与执行策略 4 文件 55 项定向测试通过。
- 全量初次线程池因 canvas 原生模块崩溃；改为 forks 后 338 文件通过，4 文件超时且一个用户流程 worker 启动超时。将这些文件串行复核后，环境命令、缓存管理和用户流程通过；frontend-build 的桌面构建用例仍超过 20 秒，resumable-download 的原生取消用例仍超过 5 秒并在清理时报告 EBUSY。保留原日志，不调整源码或放宽断言掩盖失败，不宣称全量通过。
- 集成测试 6 文件 130 项通过，覆盖节点安装器；history-performance 的 worker 启动超时，单独补跑仍在执行测试前超时，没有性能结果。
- 类型检查及干净的桌面/Web/Electron 生产构建通过；对比度检查的 Electron 子进程启动超过 120 秒，报 ETIMEDOUT，没有获得对比度结果。
- 临时源码、身份、对比、schema 与日志位于忽略目录 `temp/kjnodes-20261121`；完整验证使用独立快照，不覆盖共享 dist。
- 验证快照为 `temp/kjnodes-verify-20261121`；catalog 和版本测试与验证副本一致。生产 KJNodes HEAD 与干净状态保持不变，未启动或重启 ComfyUI，无本任务 GPU 工作；检查结束后移除自有 node_modules junction。后续可在测试进程能正常启动时复核上述限制，以及用户主动安装后的在线 schema/GPU 输出。

## 来源

- [上游差异](https://github.com/kijai/ComfyUI-KJNodes/compare/70701d2a11d4797cf52733290ed0b6b5037148d9...aa2b5ea5e7f61b51f5d26d726f23c1d74e951016)
- [候选源码与版本](https://github.com/kijai/ComfyUI-KJNodes/tree/aa2b5ea5e7f61b51f5d26d726f23c1d74e951016)
