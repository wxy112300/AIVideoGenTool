# 文档归档

这里保存已经完成、被后续方案取代，或明确只用于历史追溯的文档。归档不等于删除：这些文件保留在版本库中，便于审计当时的决策和执行过程，但不再作为当前实现的默认入口。

## 当前有效入口

- [架构契约](../ARCHITECTURE_CONTRACT.md)：状态、IPC、路径、队列和进程生命周期。
- [UX 契约](../UX_CONTRACT.md)：当前 renderer 的布局、交互、文案和响应式约束。
- [当前 renderer 基线](../UX_UI_RENDERER_BASELINE.md)：当前实现的截图和状态证据。
- [P20/G18 QA 报告](../UX_UI_P20_QA_REPORT.md)：UI/UX 收尾验收记录。
- [P20/G18 截图 manifest](../UX_UI_P20_SCREENSHOT_MANIFEST.json)：当前 renderer 的机器可读证据索引。

新的 UI/UX 工作应从当前 renderer、UX 契约和最新验收证据重新提出；不会因为归档中的旧编号自动派发新的 Phase。

## 分类归档

- [UI/UX 计划与阶段记录](./ux-ui/README.md)

其他仍可能继续执行的模型、图片工作区、架构和依赖计划暂不归档，继续保留在 `docs/` 顶层。
