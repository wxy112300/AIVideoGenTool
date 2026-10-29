# Strata 0.2.7.1 / Windows Qwen 0.1.52 升级

日期：2026-10-29。范围：现有 Qwen IQ3_XXS、IQ2_XS、UD-Q4_K_XL 的共用运行时；不接 DeepSeek，不下载模型，不改用户设置，不发布 Release。用户明确要求先完成升级，GPU 实测稍后进行；本轮不作神经输出质量、速度或高负载稳定性结论。

## 固定身份与兼容边界

- 起点：catalog 与本机均为 0.1.45 / `477ac13cbe8e582c20484871ce459d20d82df09d`，旧引擎 ZIP 165243142 bytes。开工 worktree clean；随后另一任务开始 H3 Refiner，双方已协调文件与构建归属，Strata 不覆盖其改动。
- 查询 [latest Release](https://github.com/Niko1221/Strata/releases/latest) 仍为 0.2.7.1：应用 0.2.7、Control 0.1.53，Windows Qwen 引擎仍为 0.1.52。`v0.2.7.1^{}` 的固定源码是 `46c152a1310f77cd2f0ce2c7cd213962df14fe83`；不能把 annotated tag 对象 SHA 当源码提交。
- [引擎组件清单](https://github.com/Niko1221/Strata/releases/download/v0.2.7/strata-feed.json)：`strata-engine-0.1.52-windows-x86_64-cuda-cuda13.tar.gz`，620430878 bytes，SHA-256 `bfa68c6b2e92f9c273caaf937d9ae164918e6de4cca2dc1f1d79d32470f0915a`；归档内 manifest 原始 CRLF 字节 SHA-256 `1e0e8828f64522bda7a866625c1a47822c53a93abaf8a1b7eb80e9887d69749b`。
- 实际包包含 strata.exe、strata-vision.exe、strata_kq.dll、cublas64_13.dll、cublasLt64_13.dll、BUILD.json 和 engine-component.json。新版引擎使用这些自带库；老版继续使用原 venv 中的 cu13 路径。安装后调用上游 `engine_component.verify(..., full=True)` 校验组件内所有文件。
- serve.server 的原启动参数、认证 /health、/v1/models、/v1/load、聊天 SSE、/api-monitor 仍可用。未改应用监听端口 43127 或接口所有权；未引入上游自动更新/模型下载路径。MTP 的固定 gguf-py 解析提交未变。
- 对比固定 iq_pack.py：现有原生 v3/v4 格式继续支持；新增 Hadamard v5 不强加给已有模型。仅 0.1.45→本次固定源码允许在源模型/MTP/派生文件状态和精确旧配置全部验证后迁移，保存 packSourceRevision，更新源码身份及 DLL 路径。其他版本、未知格式、改动或缺件不被放行。主应用与独立启动器启动路径均调用共用发现/迁移函数；纯检测保持只读。

## 实际安装与修复

生产 `installStrata` 首轮失败：旧保护器将官方 Git 未修改的 `.github/ISSUE_TEMPLATE/config.yml` 当本地配置，和新版同名文件冲突；旧软件未被替换。修复为共用 Git 未修改文件识别，并校验官方 origin 与 receipt 的精确 HEAD。官方文件随软件更新；用户改动/新增配置继续保留，冲突仍明确报告。

重试生产事务成功，约 81.6 秒（含源码、解包、独立 venv、pip、全部组件文件校验及旧软件清理）。未再下载 NVIDIA Python 运行库；未执行全量 setup、模型转换或 GPU 加载。真实 receipt 已为 0.2.7.1，BUILD 为 0.1.52。原用户 state 字节不变；旧软件 backup/failed/.install 暂存和成功下载缓存无残留。

真实 IQ3_XXS+MTP 已验证缓存迁移与三种 uncensored 启动计划合计约 1.9 秒；没有重哈希大权重、重建 pack 或修改源模型。两种小向量的大小/固定 hash 均通过。IQ2/Q4 本机未下载，本轮仅覆盖对应文件扫描、配置和缓存迁移的隔离回归。

## 验证

- 首轮 Strata 邻接回归：26 文件 395 项通过，覆盖安装、思考/预算、图文/Extend/R2V、启动器、遥测、取消和队列交接的各自合成层。
- 新增 Git 来源识别/保护与相邻清理回归：4 文件 52 项通过；真实隔离 Git 夹具证明官方 config 能替换、用户配置保留、错误 origin/HEAD 和修改配置不冒充软件。
- 安装后的官方 `--engine mock` 服务配合生产适配器和已准备模型的真实 tokenizer/template：`node scripts/harness/strata-protocol-smoke.mjs` 通过。六次请求同 PID；关闭/低/中/高请求参数正确，非关闭档思考与正文分离、budget=0；基础 8192 输出自动扩展到约 28800。认证、监控资源、原始控制字段可见、超上下文 400 后仍保留进程、取消后树清理及重启均通过。PID 30992/46848 与端口 3482 已退出。**脚本化输出不是神经模型推理，也不提供速度指标。**
- 真实 Electron 生产监控窗口连接新版官方 mock：鼠标点选请求和 Reasoning 页签成功，自动认证、只读隐藏、无密钥存储、无横向溢出、无 console error；已查看截图。服务 PID 44436、端口 3909 和探针 Electron 已退出。私有图片/日志位于忽略的 temp/，未进仓库。
- 整合验证：首轮 `npm run verify` 单元阶段 300 文件 / 2821 项通过，唯一失败是并行 H3 Refiner 新模型未加入 `model-catalog.test.ts` 的精确 ID 清单；由该任务修正后单文件 focused 通过，产品代码未因此改变。复用其余已通过单元证据，继续 `test:integration → build → verify:ux-ui-contrast`，退出 0：7 文件 / 104 项集成、双端类型检查、干净 renderer/web/Electron 构建、440 项对比度均通过；未重跑无变化的单元。后续 Strata 没有产品代码改动。
- 独立工具 `node Tools/Strata-Agent/prepare.mjs` 编译通过；再次执行识别最终源码指纹并复用运行文件。未启动 Claude/CloudCLI 或改 CC Switch/Codex 配置。
- 主应用真实隔离 UI：独立 userData、独立资料库、空队列/History，启动前后核对 PID、CDP、路径和正式 state 哈希。实际点击设置/节点/重新扫描/提示词分区，版本三栏均为 0.2.7.1，主按钮为重新安装，三种 uncensored 与四档思考控件保持原布局；两张截图已查看。未切换或保存任何设置。之后空输入导航检查期间窗口关闭，因此该附加步骤没有完成，不宣称已验；不影响此前已完成的设置显示证据。副本 CDP/Comfy 专用端口均已关闭，正式用户 state 字节未变。
- 升级阶段当时未验证 GPU；用户同日释放资源后的真实基本图文/连续调用与独立服务复核见[后续基本实测](0271-basic-real.md)，不把此前协议回归冒充神经证据。完整长上下文、其他量化、神经卸载重载和长压仍待验。旧副本 q5TBeT 因 PID 存活检查与系统观察不一致没有被强制接管/终止，改用全新 C1NLnU；收尾两个副本的 CDP/Comfy 端口均无监听。

私有原始记录：`temp/strata-upgrade-assessment-20261029/`、`temp/strata-protocol-smoke-SoQ2pC/`。它们不属于发布文件。升级只分类 patch，未 bump 应用版本、提交或推送。
