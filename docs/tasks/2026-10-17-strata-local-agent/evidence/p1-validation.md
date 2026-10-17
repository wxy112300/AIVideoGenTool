# P1 启动器与资源底座验证

> 此文件保留P1当时的实现快照。后续主启动/Claude/CloudCLI接线与最新未验项见[接线验证](wiring-validation.md)及[唯一TASK摘要](../TASK.md)；旧文中的“启动占位阻塞”不是当前代码状态。

- 类型：Evidence；日期：2026-10-17；范围：本次未提交代码；结果：P1部分实现，真实GPU/Agent未通过。
- 当前摘要见[同一TASK](../TASK.md)。P0调查保留在[assessment](assessment.md)，没有覆盖旧证据或另建任务。

## 已落地

- `Tools/Strata-Agent/Start.cmd` → PowerShell 5.1 / WinForms薄窗口；首次或源码变化时独立编译controller，之后复用产物。无Electron、ComfyUI、云登录或全局执行策略修改。普通用户权限门禁、单实例聚焦、折叠设置/日志、目录选择、端口/开页偏好、Strata安装计划确认/取消/重试、更新修复菜单。
- controller复用统一Strata扫描/安装/准备/资源策略和完成pack校验。显式pack还绑定catalog的字节/hash及所选源路径；不重复权重库。正常缺少LVS状态时可独立使用，显式路径可避开损坏的LVS发现文件。
- Agent run配置、engine日志、slot存储隔离；DPAPI稳定token仅进入子进程环境。H3运行配置/receipt/32K和临时token策略保留。
- 共享GPU/软件租约接入H3 Strata操作、Comfy Prompt和Queue提交前。命名管道认证与私有owner记录、PID+启动身份、epoch、子进程清理确认；忙碌和未知归属拒绝接管。Agent暂要求显式停止后交接，未声称harness活动检测已完成。Studio仍有Comfy监听时拒绝自动交接，须所属窗口先停止。
- Agent原生管理适配没有修改上游安装；禁止配置/VRAM变更和原生MCP，冷加载通过严格before-load脚本复核租约、当前RAM/Windows提交余量/显存。未GPU验收其完整原生load/unload/reload。

## 实际执行

| 检查 | 结果／证据层 |
| --- | --- |
| `harness:app -- guide prompt` | 已读产品路径；未伪称API提交就是UI可达 |
| 独立doctor | 无Electron/Comfy运行；检测Node24.16.0、npm Claude Code2.1.84 JS入口、受信Strata0.1.44.1、IQ3/mmproj/MTP文件。IQ2未齐全；默认派生根未找到完成pack，并未扫描整盘或重建 |
| `typecheck` | 通过 |
| focused：Agent、Strata owner/service、application-runtime、lifecycle、queue-services | 6文件93测试通过。覆盖目录独立、身份防替换、资源拒绝、DPAPI稳定、pack只读、GPU忙/交接/遗留子进程；夹具不代表推理 |
| `verify-lease.mjs` | 两个真实Node进程，独立临时协调目录。忙碌owner保留，显式释放后重试成功；耗时1039ms；没有GPU模型 |
| `verify-job.ps1` | 真实Windows Job关闭，测试root与后代均退出；无GPU、无用户配置修改 |
| `verify-http.mjs` | 固定已装Strata **CPU mock**：loopback原生页200、未鉴权模型查询401，受保护config/VRAM/MCP POST409；自有进程树和临时目录清理。不是Claude/Agent成功 |
| 原生窗口bootstrap | 真实PowerShell5.1窗口可启动、controller doctor响应已由窗口处理；重复启动第二进程退出且保留首窗口，正常CloseMainWindow经过停止流程后UI/controller退出。修正.NET Framework不支持StandardInputEncoding的问题，使用UTF-8 StreamWriter；隐藏进程的UTF-8日志复核可读 |
| 原生UI自动化 | `computer-use`的node_repl启动失败：sandbox helper setup refresh错误；reset后仍失败。没有实际鼠标点击、截图、DPI/窄窗口/焦点验收，不能将bootstrap当UI闭环 |
| `npm.cmd run verify` | 最终集成状态exit0：218文件2025单元测试、6文件88集成测试、干净typechecked构建、20组对比度通过。已有jsdom scrollTo未实现诊断与505.5kB chunk警告不冒充零告警 |

## 真实引擎准入负测（不是GPU加载成功）

本机是RTX4090 24GB、约63.8GiB RAM，**不是128GB机器**。

14:22（Asia/Singapore）通过独立controller执行32K `engineValidation`：离线依赖/文件通过 → 获得真实跨进程租约 → 当前资源预检拒绝。耗时1698ms；当时可用RAM约27.9GiB，当前保守完整驻留策略需约34.6GiB。doctor临近快照Windows提交余量约25.0GiB、空闲显存约22.3GiB；提交预算另外还需GPU容量级Windows加载预留，不能因为总RAM64GB便放行。

没有哈希/转换大权重、创建新pack、生成日用token或启动真实Strata/Claude/CloudCLI；停止结果stopped、PID空，GPU租约已释放。没有关闭用户程序或修改分页文件。下一次需重新采实时资源，不能沿用此快照作为放行依据。

## 未完成与清理

- 日用“启动全部”仍明确阻塞到CLI/GUI接入，不能作为最终日用交付。Node/Claude/CC Switch/CloudCLI缺件安装、外部配置一致性备份/恢复、CLI scratch读写/shell/Plan/deny/多轮/取消/resume、CC Switch支持导入、CloudCLI实际CLI/SDK身份及同session互通、LAN均未完成。CloudCLI尚未安装，因此候选版本仍是P0快照，安装前必须重查安全公告和稳定版本。
- 64K→128K→262K未加载、未性能/质量测试。真实H3按钮/开始队列与活跃Agent交接未验；当前只有服务层与独立进程协议证据。
- 自有mock HTTP、测试Node父子进程、WinForms/controller已退出；43127/43128收尾无监听。临时fixture和DPAPI测试token已删除；编译产物留在被忽略的`.runtime`。私有本机协调目录/操作日志保留，不进Git。
- 首次全量测试的应用编排夹具曾留下已退出worker的全局owner记录（启动身份不匹配、无存活子进程）；经同一租约API核验后重获并释放，没有按PID终止进程。已为应用编排测试显式注入门禁替身，最终复跑后日用owner记录不存在；测试不会为此触碰日用GPU命名空间。
- 未安装缺失软件、改Claude/CC Switch/Codex provider、写SQLite、登录云账号或改防火墙/证书/网络设施；未打包、bump、提交、推送、tag或Release。
