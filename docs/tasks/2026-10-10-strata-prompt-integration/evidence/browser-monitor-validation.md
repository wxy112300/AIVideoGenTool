# Strata 官方网页监视窗口

- 类型：Evidence；状态：implemented / mock-runtime-validated；日期：2026-10-16。
- 授权：用户要求启动 Strata 后打开网页以观察状态。minor 增量、不 bump、不发布；新增子 agent 0。不更新 Strata、不下载权重、不启动真实 GPU 推理、不操作生成队列。
- 使用项目 local-video-studio / comfy-upgrade-assessment 技能，先核对当前安装源码与生命周期，再按层验证；不是借原有 Qwen/Gemma 实测声称 Strata 网页已验。

## 上游事实和接入

所选管理安装为0.1.44.1，固定推荐提交296b59d2开头；本机serve/server.py、serve/web/monitor.html、monitor.js已确认原生API Monitor（[官方源码](https://github.com/Niko1221/Strata/blob/main/serve/web/monitor.html)）。根页面是可聊天/改配置的前端，/api-monitor也带加载/卸载操作，并要求Bearer key。不能直接给系统浏览器完整密钥，令网页绕过应用GPU互斥。

- 生产启动检测server支持`--api-monitor`且三项必要网页文件存在才启用；不支持的旧安装保持原启动，不添加未知参数或自动下载。自适应CPU lazy重启沿用这一能力，不新建服务/端口/设置。
- 原StrataService/Owner提供main-only connection capability，永不加入snapshot、AppApi、URL或日志。主进程独立监视服务观察现有runtime与自有listener，在模型初次加载时即可打开官方网页。
- 独立Electron BrowserWindow：无preload/Node，context isolation/sandbox/web security开启，临时session不落持久partition。只准同一127.0.0.1实例的GET监视页/确切资源、状态和请求详情。权限、下载、外连、跳转和新窗口拒绝；CSP限制self、禁表单并关闭缓存。
- 仅主进程对白名单状态/记录请求注入临时Bearer，网页存储及DOM无密钥。原加载/卸载/认证按钮隐藏，网络层同时拒绝所有POST、推理/配置/聊天；隐藏按钮不是安全边界。
- 关闭监视页不停止模型，同一运行周期不反复弹出；停止/切换runtime关闭窗口，下次启动重开。自适应服务重启旋转密钥时同源窗口继续使用新凭证。页面创建/加载失败只记录脱敏告警，不改变模型状态或阻断增强。
- 最近100条请求的正文/思考等按上游实现有界保留在服务内存，停止/重启清空；不写入本应用History。关闭监视页本身不清除仍运行服务的记录。

## 验证

自动化覆盖：严格origin/GET/资源白名单，POST/配置/外连拒绝，主进程凭证注入与轮转，owner丢失撤权，无preload/持久session，窗口关闭/停止/重开，原生窗口失败隔离，以及启动参数缺能力安全兼容。既有Strata准备、owner、服务、应用组合与旧共享路径仍在全量检查范围。

真实窗口使用当前安装的官方serve.server **mock引擎**＋生产StrataService与新窗口服务：受认证HTTP、官方HTML/JS/CSS/字体和实际Electron渲染，不替换网页或响应；无真实权重/模型加载。通过鼠标事件选择一条真实mock请求，查看输入详情；真实页面发POST /load、POST /v1/chat/completions、GET /config和外连均被请求层拦截。DOM、localStorage、sessionStorage无密钥；加载/卸载控件不可见。关闭页面服务仍在，服务停止关闭页面、重启重开均通过。

1180×800与800×720已视觉核对，窄窗口无横向溢出。截图与JSON只在忽略temp；截图中的Loaded/0.00秒和模型名是mock状态，不是GPU加载或速度证据。首次临时脚本未接管window-all-closed默认退出，导致在手动关窗步骤提前结束；修复测试脚本保留进程后完整通过，未改生产退出策略。

最终`npm.cmd run verify`：215单元文件/1982项＋6集成文件/88项、双端类型、干净生产构建、20对比度通过。无新增IPC或持久化字段，不改变Strata模型按钮/取消/队列释放、其他后端或用户state。本轮没有真实AppApi大模型启动→监视窗口、真实GPU生成或视频队列交接验收，不扩大mock结论。

资源：自有mock Python/Electron退出，最后一轮端口14540无监听（前两轮14127/14328亦已退出）；未终止用户进程或删除模型。最后一次复查以忽略native-result/进程清单为准。此前版本0.65.1与其他dirty工作保持，本阶段不提交推送。
