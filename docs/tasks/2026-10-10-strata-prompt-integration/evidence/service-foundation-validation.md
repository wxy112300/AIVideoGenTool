# Strata 服务底座：小 phase 验证

- 类型：Evidence；Status: foundation-only；日期：2026-10-10。
- 范围：后台服务生命周期，不是 AppApi、提示词接入或模型生成。状态/下一步由 [TASK](../TASK.md) 维护。
- 授权：用户要求根据剩余额度继续一小 phase；权重仍由用户下载，不加载 GPU、不更改默认增强模型。

## 实现与边界

新增 `electron/services/strata-service.ts`，不扩展 composition root 或新增界面。`prepareStrataLaunch` 核对完成安装记录、独立 Python/server/配置文件，生成 `serve.server --engine strata --host 127.0.0.1 --port <设置端口> --lazy` 与每次启动的临时认证。端口沿用设置的43127默认值，拒绝8080；占用时直接给出更换端口错误，不杀其他服务，不自动改持久化端口。

服务 owner 串行启停；健康端点之外还访问受认证的 `/v1/models`，禁止重定向、请求有界。状态分别记录服务 phase 与 modelLoaded，HTTP就绪不标记推理已验证。日志有界且隐藏认证值。启动失败停止自有进程树；停止失败保留 PID/占用，重试成功才解除。配置变化要求先停止旧进程。

配置由后续 pack/tokenizer 准备步骤提供，本轮不生成配置、不执行 setup、不下载权重。上游真实引擎即使lazy也要求tokenizer；本轮不伪造配置来打开产品模型选项。底座尚未由应用实例化：AppApi、退出清理、安装/卸载互斥、Prompt请求/取消与GPU协调仍是后续接线项。

## 验证

- 14项新增测试通过；包括缺安装/启动文件、无效端口、外部占用、认证与协议拒绝、ready不等于loaded、配置变化、串行启停、启动超时清理、停止失败重试、进程意外退出。
- 真实隔离 Node HTTP子进程使用生产进程适配器，额外启动自有子进程；停止后Windows进程树与端口均退出。不是 Strata 模型或UI证据。
- `npm.cmd run verify` 全部通过：unit/integration、干净类型构建、20项对比度。执行前没有Electron运行；没有关闭用户窗口。既有jsdom scrollTo诊断不影响测试通过。未修改既有UI，未重复旧管理功能的真实按钮验收。
- 固定版本源码本地Git复核为 `fb58e0dbc8399662c0e47c76578c6e878b14f6cf`。隔离上游 `--engine mock` 真实HTTP探针使用同一生产owner：健康/受认证模型列表通过，匿名模型列表401，退出后PID/端口关闭。mock 的loaded=true不是Qwen加载。无生成请求、真实engine或GPU。
- 首次mock探针系统Python缺jinja2，启动失败正确回收；已有bundled Python也缺该依赖，未安装包。只读检查用户已装Strata独立Python的jinja2后，借该解释器以`-B`运行本任务隔离固定源码，复测通过；用户安装/配置/模型未修改。
- 探针脚本在忽略的 `temp/strata-service-mock-smoke.mjs`。首轮临时端口8490已关闭；成功PID56448/端口8592退出核对。不是应用原生退出生命周期验收。

版本影响：minor级接入基础，不发布、不bump。全树成本unknown；无委派。下一phase可以先做配置准备与应用owner接线，完整权重到位后再验真实推理/性能/质量。
