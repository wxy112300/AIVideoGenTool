# Strata 0.1.45推荐线与三模式

日期：2026-10-18；影响：minor；用户授权实现推荐升级、安装时准备小文件、H3与独立工具三选一。基线应用0.65.4/514def5，工作区已有另一个已完成Session的Agent监控/诊断改动，全部保留。未bump/暂存/提交/推送或发布，不安装新引擎、不下载主权重、不启动GPU。

## 固定身份与边界

- 官方stable [v0.1.45](https://github.com/Niko1221/Strata/releases/tag/v0.1.45)，GitHub API当日确认非预发布，main同SHA `477ac13cbe8e582c20484871ce459d20d82df09d`。NVIDIA `strata-windows-x64.zip` 165243142 bytes，官方asset digest `a1d4cafb8319c253f3010ff118dbd5ed07c232056b939ac7735819559f3b859e`。LLAMA parser revision与CUDA wheels和旧基线一致；保留0.1.44.1/0.1.41受信身份，未把最低运行线改为新版本。
- 自带ESP：483520bytes，SHA-256 `ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b`，4..44层。实际获取新固定源码中的小文件，生产校验通过。
- [社区向量/来源许可](https://github.com/sergqwer/strata-nvfp4/blob/257727d58ff85a9aef6f314f9a95f75e4fc330d2/data/uncensor/README.md)：267552bytes，SHA-256 `a2ec3e999724022a55d48d30822bd10b1b25916ccc221013a119a674d06a46b5`，8..33层。Git blob和raw内容独立核对，生产校验通过。由Qwen权重派生，适用Qwen Community License 1.0；安装目录保留NOTICE和固定来源，不下载/替换fork引擎。
- 发布者验证Q2_0/IQ2_XS/UD-Q4_K_XL，不将其报告扩展为本项目IQ3_XXS/中文图文长稿已验，更不保证比ESP优。Strata0.1.45发布说明未确认解决本项目连续增强中断/Windows蓝屏；FILE_RELEASE=0、安全资源保护和H3 32K保持。

## 已实现

- H3 `strataUncensoredMode`与Agent `uncensoredMode`：off/builtin/community；保留旧布尔镜像兼容，旧true只迁移builtin、false/缺省off，显式模式优先。保存/重启与当次请求冻结，其他后端不应用。
- 安装事务在暂存目录获取社区小文件，明确assets阶段、独立字节预算、大小/GGUF/SHA校验及NOTICE；失败/取消不发布新安装、旧安装保留。推理时缺件明确提示更新/修复，不临时联网或降级到另一向量。
- 首次启用或更换向量identity重载；off及同一确认向量复用。请求再次核对已加载id，旧向量不能满足新模式。日志含mode/id/hash/layers/requested/vectorLoaded/applied，未完成不声称应用成功。
- 独立工具沿用现有安装确认、取消和归属保护。更新自动发现的旧受管理路径不再将旧目录误当新目标；成功切自己的路径/清旧pack selector供重新发现，模型文件、旧安装、手选目录和H3偏好不改。WinForms下拉与H3设置控件保持简洁，无新目录设置。

## 验证

- Focused模式/迁移/安装事务/运行时/UI逻辑通过；完整verify：222单元文件2082项、6集成文件88项、双端类型、干净构建、20对比度通过。
- 实际两个小资产下载到忽略的temp夹具并通过生产校验，未写用户安装目录、未入Git。未下载165MB引擎，安装事务成功/失败回退由测试替身覆盖，不冒充本机真实0.1.45安装完成。
- 隔离Electron：三档真实键盘选择、实际保存按钮、切页、焦点稳定及1280×800/1440×900/960×800布局通过；缺输入点击增强明确阻塞、服务保持停止。初版自动化未等待切页焦点恢复，键盘误作用到tab，修正等待后通过；不是推理/质量证据。
- WinForms组件Smoke：三档可选、720×540和1000×720主操作可达；已有独立诊断导出实测保持通过。DrawToBitmap检查无裁切，不冒充原生鼠标/高DPI/完整Agent旅程。
- 实际关闭并重启隔离Electron后，community选择、草稿/空队列/History保持；正式用户state hash不变。两次自有Electron PID与CDP/测试Comfy端口均已退出，无Strata/Comfy/GPU模型启动；清理为Harness AppApi/JS窗口关闭，不冒充原生窗口退出生命周期。独立controller准备编译通过。真实0.1.45加载、IQ3_XXS两向量中文图文/长稿质量及速度留待用户更新后受资源约束实测。

原始报告/截图/小文件仅在忽略的temp，真实用户state内容hash保持，测试不操作视频队列、Claude工具、MCP或用户provider/凭证。
