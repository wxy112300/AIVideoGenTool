# Strata 简化设置与软件安装验证

- 类型：Evidence；日期：2026-10-10；范围：本任务最终源码（0.65.0 dirty worktree）；当前状态以 [TASK](../TASK.md) 为准。
- 用户最新方向：像 llama-cpp-python 一样一键安装/管理，撤回手工源码/引擎 ZIP 与常驻技术清单。沿用现有依赖卡、typed IPC、安装日志和设置保存机制；模型仍用户管理。

## 已覆盖

- 安装事务单测：固定源码提交/引擎来源、独立 venv、只装软件不执行 setup/engine、引擎损坏拒绝、手动/非应用目录拒绝覆盖、重装备份与失败恢复、无效代理释放锁允许重试。文件扫描/默认模型子目录与旧自定义路径、控制器真实 button.click 成功/失败及刷新、IPC 独立所有权均覆盖。
- 最终 `npm.cmd run verify` exit 0：全部 unit/integration、clean 类型构建、20 组文本对比度。新增场景进入 harness settings-runtime guide。已有 jsdom scrollTo 非实现诊断不当 UI/GPU 证据。
- 真实隔离 Electron / 鼠标：单一卡片，技术参数默认折叠，没有手工 ZIP 按钮/hash 清单；手动目录安装拒绝有日志，按钮恢复；模型目录设置折叠、固定 revision 的下载详情仍可达，未开放 Strata 默认选择。原 prompt 路由、queue/History 未变。1280×800 / 1440×900 / 960×800 没有横向文档溢出；采用 focus emulation。
- 真实软件分层：Git fetch/checkout/rev-parse 固定 SHA 通过；137164559 B engine ZIP 实际 SHA-256 校验通过。第一次 Windows 命令把含空格路径拆开，已改 UTF-16 encoded command + literal path；复用同一已校验 archive 的服务层检查真实解压通过，创建独立 Python 3.12 venv，通过 requirements/CUDA wheels 元数据解析。

## 不完整与负结果

- 第二次 UI 联网下载是慢速传输，而非停止：通过磁盘显示长度误判，读到 curl 日志后修正。为结束重复测试，主动停止仅属于 fixture Electron 的 curl；UI 显示失败、保留临时路径并恢复按钮。不能将这个结果写成网络不可达或自动超时。
- 服务层复用已通过 UI 下载的 ZIP，只替换下载 transport 为本地复制；源码、hash、真实解压、venv/pip 均走实际实现，不是端到端 UI 安装成功。下载约 401.9 MB 的 CUDA cuBLAS wheel 时主动结束有界检查；已有实际 I/O，不能宣称下载卡死。失败安装被移动保留，没有完成标记。
- 完整 pip 终态、Python import/CUDA DLL 文件验证、软件安装成功 badge、真实旧软件重装恢复仍未实证。合成事务测试不能替代这些。未下载模型权重、未执行 native engine/setup/pack/MTP、未监听 Strata 服务，未启动 ComfyUI 或 GPU；不声称性能/质量收益。

## 资源与交付

- 本次使用原任务隔离 fixture，未修改用户库。源码/engine、部分依赖与诊断在 gitignored temp 保留；没有删除用户文件。停止的是已核对父进程/fixture 命令的自有下载/Python 子进程，没有按进程名清理外部服务。
- 两轮 Electron 经现有 close-fixture-smoke 关闭；清理报告与布局/操作 JSON、PNG 留在忽略目录。此路径不是原生窗口关闭生命周期证明。
- minor 类安装/设置能力；CHANGELOG Unreleased 已更新，不承担 release owner，不 bump 版本。完整安装和模型 hash 是下一阶段明确门槛。
