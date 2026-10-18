# 日用布局与失联诊断修复

- 类型：Evidence；2026-10-18；状态：实现及无GPU验证，真实故障根因待对应日志。摘要唯一入口：[TASK](../TASK.md)。
- 用户报告：控件裁切、按钮无反馈、密钥入口隐蔽、Strata频繁offline但启动器仍显示启动中、缺少崩溃日志；长思考/长输出/uncensored更易触发。此前scratch容量通过不能覆盖这些日用负例。

## 已确认的实现缺口与修复

- WinForms原780×390，硬编码690px内容，设置强制升到820px；嵌套流式面板宽度不受约束。现在主操作固定、设置与日志滚动，按可用宽度布局路径行，折叠不强制调整窗口高度。错误文本高度有界、完整内容仍进日志。连接菜单显式提供复制key、原生页与本轮日志；说明CloudCLI本机账号与原生页API key用途。
- UI原没有轮询status；`running`仅靠start/stop结果，Controller退出也未复原操作状态。现在每两秒非重叠只读状态请求，3次HTTP失败才报持续失联；进程退出、模型卸载、GUI退出、加载与请求busy分别显示。资源值超12秒不更新标记为最近值。并行status返回不再错误解除安装/启动的busy状态。
- Python stdout/stderr原仅保留内存尾8KB；新增私有本轮`server.log`、退出code/signal，保留原native `engine.log`，提供目录入口。token跨输出块先合并整行再脱敏；状态只提取数值/布尔，不传递原生回答。资源保护与监测失败先记原因/最近资源再收尾，停止后仍可查原因；不自动重放工具或杀未知进程。
- 私有latest-run索引保存最近日志位置与异常，重开窗口也能找到；只恢复自有runs下的诊断路径，不恢复PID、租约或进程归属。测试覆盖重开和拒绝越界路径。
- Agent采样显式使用自己的分模式knownPressure，避免缺失某个传感器时先用完整驻留RAM线终止重测；没有降低任何既有阈值。Agent明确`STRATA_FILE_RELEASE=0`，防止继承shell opt-in；H3源策略和32K未改。

## 目前不能认定的原因

- 本机运行目录最新操作日志为10月17日旧验证，没有本次日用崩溃记录。用户随后明确故障发生在另一台电脑，但因找不到日志尚无法提供；不能混用机器条件或拿旧通过替代新故障分析。
- 固定安装上游server.py有`STRATA_ENGINE_STALL_S=90`：无输出且CPU/IO无活动、GPU探测不忙时结束引擎；另有默认300秒engine_silence_s。只是候选机制，尚无本次触发证据，未关掉/放宽这些保护。资源保护、Python退出、CUDA/OOM、客户端流错误也必须用日志区分。
- uncensored当前固定兼容控制向量1.0/project，载入验证与默认启用接线保留。未做本次效果A/B、未增加强度，亦未声称所有请求均无拒答。GUI/CLI权限继续确认。
- H3长资料曾发生Windows GDI内核蓝屏，根因未定，详见其原证据。本轮保持文件页释放关闭，未启动重模型来冒险覆盖该未解条件。

## 实际验证与边界

- `strata-agent.ps1 -Smoke`：实际WinForms控件、720×540/1000×720，含三行busy/uncensored与长故障文本，主按钮/菜单/状态可见，设置行不越界，折叠与日志切换通过，DrawToBitmap已检查。首次检查曾捕获设置行Margin越界，修复后通过。此为组件布局，不是鼠标交互或系统高DPI；原生Computer Use因sandbox helper初始化失败，重试后仍失败，未冒充鼠标通过。
- 相关服务/Agent focused通过；新增HTTP实际fixture覆盖busy142秒数值、三次503失联和恢复/模型卸载，仅GET，不重放请求，状态不含key/回答；进程mock覆盖退出检查、私有日志跨块key脱敏、资源原因清理后保留。
- `prepare.mjs`通过；`verify-http.mjs`实际固定Python/guard的CPU mock鉴权、管理写入拒绝及原生页通过；无GPU或真实Agent。
- `verify-monitor.mjs --long`：实际固定Python/guard、脚本CPU引擎首输出延迟125秒，**126058ms**、124次实际状态采样、busy确认、完整SSE结尾、退出code/signal记录、停后unreachable确认通过。说明这条HTTP链不存在必然两分钟整体中止，不能排除真实CUDA引擎停滞、OOM或Claude长流问题。没有CLI/真实模型/VRAM性能结论。
- `verify-monitor.mjs --crash`：自有实际Python fixture在2秒计时后主动`os._exit(17)`，首轮3489ms、最终重验2504ms，服务snapshot成为error、退出码17入诊断输出、HTTP确认unreachable。不是实际CUDA崩溃或WinForms鼠标证据。
- 最终完整`verify`通过：222文件2073单元、6文件88集成、双端类型检查/干净构建、20项文字对比度。Controller重新编译与WinForms长状态布局复验通过。已有jsdom scrollTo未实现及chunk体积告警，没有失败。

## 清理与下一步

CPU测试使用临时目录和随机loopback端口，finally停止自有Python、删除本轮fixture；不占43127/43128、不申请GPU租约、不修改用户偏好、token、原Claude/CC Switch/Codex配置。未安装软件、下载模型、bump、打包、tag、提交或推送。等待对应机器实际失败日志，之后按长思考/长输出/uncensored逐项重现；仍需原生鼠标/DPI、真实GPU耐久与LAN门禁验收。

只读收尾发现共享协调目录仍有旧Studio租约记录，其记录的三个PID已不存在；这是H3原记录，本轮未删除或接管。不能把“本轮没申请GPU”写成共享目录完全没有历史记录。

## 另一台电脑的取证入口

- 新增`Export-Diagnostics.ps1`和可双击`.cmd`，启动器菜单异步调用；没有Node、Controller或活跃服务也能导出，不改变任何服务归属。UI完成回调在100ms计时器中、位于Controller空值返回之前，导出完成显示文件路径并打开目录；独立入口同样有结果/失败提示。
- 仅扫描普通目录中的最近2份`.jsonl`与最近3个run的固定`engine.log/server.log`；每份最多末256KiB，跳过reparse路径，不跟随外部latest-run指针。原始preferences/runtime.json/token/routes/数据库/sessions/权重不复制；偏好仅经类型/范围校验的上下文、bool模式和端口。稳定token按64hex、凭证行、sk-/JWT特征脱敏，不读取或解密token。
- 使用当前用户/SYSTEM的私有新目录存储JSON，无上传动作。导出前后原日志保留；当前物理RAM/Windows提交余量通过GlobalMemoryStatusEx读取，NVIDIA只读查询限时3秒，未知明示。当前资源不冒充故障时资源，日志仍可能含对话信息，需要分享者检查。
- `verify-diagnostics.ps1`实际Windows临时旧版文件夹验证：操作/引擎错误保留、缺server.log明确报告、排除token/route/runtime/auth/路径、异常偏好对象拒绝、token文件hash不变、导出ACL关闭继承均通过。初次测试发现新中文脚本缺UTF-8 BOM导致PowerShell5.1解析失败，补BOM后复验通过。没有GPU或实际Agent推理；临时fixture清理。
- 本次只增加PowerShell工具/菜单和文档，没有修改上一轮已完整verify通过的TS源码；复用2073单元/88集成及构建证据，并补实际导出、AST和WinForms布局验证。另一台电脑的报告尚未取得，真实崩溃分析仍未完成。
