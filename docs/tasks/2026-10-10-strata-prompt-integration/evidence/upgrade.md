# Strata 推荐版本与版本栏修复（2026-10-15）

## 授权与身份

用户授权提高推荐安装目标并修复版本显示，由用户操作下载安装；不替用户下载/安装引擎或权重，不启动GPU/队列，不发布。现有本机0.1.41固定源码`fb58e0dbc8399662c0e47c76578c6e878b14f6cf`。

官方[最新稳定版0.1.44.1](https://github.com/Niko1221/Strata/releases/tag/v0.1.44.1)，2026-10-14发布。GitHub tag对象`9791ea335ba2001c87b5f783146d6eb08fdd9e5e`解引用到commit `296b59d2f73c8f04a805df29c2fa97655adace78`，非prerelease。官方release API资产`strata-windows-x64.zip`为155480443 bytes，digest `a29bda047f440e6d2ce1649306c3a7047ba35df5a032097c7509d4494fa2b448`。只取元数据/源码和小型中文词表做身份核验，不下载引擎压缩包。

## 变化、接线与保留

- [0.1.44说明](https://github.com/Niko1221/Strata/releases/tag/v0.1.44)包含长会话图片缓存修复、新量化/硬件路径和可选异步专家实验；0.1.44.1修复旧CPU启动、CUDA12构建、M2及Responses reasoning参数。并非所有收益适用于本机4090/IQ3_XXS；不启用NVFP4/新默认IQ3_S/实验开关，不改主模型、采样或资源预算。
- 两固定SHA的compare报告ahead622，但返回文件列表为空，不能称为完整审计。精读候选requirements、serve/server、mtp_rt：现有models/load/unload/认证与离线转换入口保留。候选`data/draft_vocab.bin`425196 bytes、SHA256 `b1e1d3a7a9e4bf862dcd5923ce661fb59bbd07907e594df5cf86a62ac235cb91`与现有中文词表一致。实际引擎/DLL/完整推理兼容仍待安装验证。
- catalog同步版本、源码commit、引擎URL/bytes/hash。旧0.1.41受信记录继续识别；新版未完成时保留旧默认，完成后优先新版；不自动删除旧软件或数据，手动选择仍显式保留。缓存来源revision与实际安装绑定，不能把旧pack仅改推荐label后当新版已验证。
- Strata复用节点版本行和分体按钮；本机/推荐/最新分别来自安装记录/catalog/官方release查询。未知/未安装/未扫描不造版本。最新查询沿用既有代理、并发、缓存、超时，不新增串行扫描。旧版已装显示更新，推荐版已装显示重装，未装显示安装。位置/卸载保持三角菜单。

## 验收边界

source/配置与合成安装/版本选择/缓存隔离/renderer回归可检查；本轮不执行真实安装、GPU或性能测试，不宣称速度/质量/OOM改善。最终检查与资源清理以[TASK](../TASK.md#resume)最新摘要为准，原负结果保留。子agent0，费用/token unknown。

## 用户更新失败后的下载恢复补丁

用户实际在引擎下载119220864/155480443 bytes时遇curl56，未开始解压/发布；详见TASK诊断。后续授权修复已实现固定资产缓存、3次/600秒有限续传、运行/退避取消、错误详情脱敏和旧半包复制兼容，完成仍按固定hash验证。采用官方[curl continue-at](https://curl.se/docs/manpage.html#-C)语义，重试由应用按错误类型控制，不用retry-all-errors覆盖证书/Range/404，也不关闭TLS校验。原版`--retry 2`不覆盖所有接收失败，见[官方retry边界](https://curl.se/docs/manpage.html#--retry)。

本地HTTP+真实系统curl验证中断、Range、完成hash和活动取消；全量verify通过。网络恢复机制通过不代表GitHub线路已恢复或新版真实安装完成；原119MB半包和旧软件本轮均只读保留，下一次真实更新由用户点击。
