# Strata 0.2.15 推荐与更新兼容

- Status: complete (recommendation/update integration; neural validation deferred by user)
- Updated: 2026-11-17
- Authority: 用户要求推荐升至最新，其他电脑经现有更新按钮完成修复；本机Strata由用户手动更新，不安装运行环境、不下载权重。
- Execution: direct；子agent 0。patch影响，不递增应用版本、不提交/推送/发Release。
- Baseline: catalog 0.2.13/d2f096475817d4666c364c820b0ca830f751cfc5，Qwen/DeepSeek引擎0.1.59。保留工作区History/NAS及H3 GGUF任务的未提交改动。

## Resume

2026-11-17安装现场补修：用户更新报engine/strata_kq.dll ENOENT。只读核对已下载577971407bytes归档，SHA-256及组件manifest与固定feed完全一致；0.1.60官方包只有strata.exe、strata-vision.exe、BUILD.json、两项cuBLAS DLL及manifest，不再附strata_kq.dll。此前模拟夹具错误沿用了旧清单，已修正安装/扫描/准备的版本化文件表；旧0.2.13等仍要求旧DLL。安装缺件改为现有本地化错误，保留原事务/缓存，可原按钮重试。新增1295bytes实际官方manifest夹具（跨平台按官方CRLF校验摘要），覆盖版本清单、旧/新离线扫描、三个Qwen模型无旧DLL准备与旧版缺件预检。5文件149项定向中148通过、一项新增测试预期错误文案不符；修正测试预期后重跑受影响2文件64项全通过，其余3文件证据复用。含typecheck的干净build及独立启动器prepare通过；未再跑无关全量/GPU，也未替用户安装。本轮日志temp/strata-0215-layout-{tests,build}.log。

推荐固定0.2.15/c77572806996349b49995e4f98d41b5294d36a21；Qwen引擎0.1.60从v0.2.14下载（577971407bytes，SHA-256 a54cc75a84aa7b93839c330197bdc35395f6fcc5ee31e25008f380558da5b18c，manifest 3c6cf75bd471e0b6251f8db0080cb6c4dd1afb2cbd86e41a214bc4c4662f169c）。DeepSeek引擎仍0.1.59/v0.2.13，原摘要不变。

源码审计发现0.2.15已完全移除DeepSeek（serve/ds_pictures.py、tools/dsv41及数据），因此不能仅根据feed仍列出旧引擎推断兼容。安装事务额外获取固定0.2.13 sparse源码到runtime/deepseek-compat，保留官方许可/来源；不复制引擎/权重，不再保留完整旧软件备份。H3与Agent的DeepSeek服务/pack工具使用此源码，共用根venv和engine-dsv41；Qwen使用新版。旧安装仍用自身源码，旧DeepSeek完整pack配置不变。

旧0.2.13安装身份与Qwen pack兼容表补齐；三种Qwen配置均覆盖0.2.13→0.2.15完整pack迁移、不哈希/pack的回归。DeepSeek打包记录标明实际0.2.13源码。主应用/独立启动器更新入口共用安装事务，更新失败恢复、成功清理；嵌套兼容仓库仅固定origin/revision且未修改的tracked文件视作可再下载软件，未知/修改文件不授权清理。保留当前MTP/三档uncensored/逐请求思考/32K H3/取消保留模型与队列释放策略。

## Sources

- [0.2.15 release](https://github.com/Niko1221/Strata/releases/tag/v0.2.15)、[固定feed](https://github.com/Niko1221/Strata/releases/download/v0.2.15/strata-feed.json)：软件0.2.15、Control0.1.61、Qwen引擎0.1.60。
- [0.2.14 release](https://github.com/Niko1221/Strata/releases/tag/v0.2.14)：原生prefill内核与分块；4090 IQ3_S长输入预处理有改善，不能当本机IQ3_XXS输出吞吐证明，回答可能变化。
- [0.2.15 DeepSeek说明](https://github.com/Niko1221/Strata/blob/c77572806996349b49995e4f98d41b5294d36a21/docs/DEEPSEEK41.md)：0.2.13是最后支持版本。

## Validation / remaining

- 定向4文件101项通过；之后完整unit覆盖最终代码，3298项中3295通过、3项文件/NAS测试在并发下触发5秒超时（含一项退出清理ENOTEMPTY），低并发单独复核3文件28项全通过，未修改这些测试或放宽时限。首次`verify`因此退出1；后续补齐7文件132项integration、含typecheck的干净build与440项对比度检查，全部通过。不将组合结果写成首次verify退出0。日志：忽略的temp/strata-0215-{verify,recheck,integration,build}.log。
- `node tools/Strata-Agent/prepare.mjs`通过，独立controller重新编译纳入新catalog/源码路由；未打开GUI或启动Agent。
- `node scripts/harness/strata-protocol-smoke.mjs --tokenizer-only --source-directory temp/strata-0215-audit`通过。使用官方c775728源码、原安装Python及真实Qwen tokenizer，脚本mock引擎，无权重/GPU计算：off/low/medium/high/medium/medium六次请求、思考分流、自动输出约28.8K预算、认证、监视页/控制字段、超窗恢复、取消保留同PID、主动停止/重启均通过。报告temp/strata-protocol-smoke-FO50pR/report.json；自有549188/547612进程和7075监听已清理。此结果不是神经推理/视觉/质量/速度证明。
- 实际固定0.2.13兼容源码使用共享Python导入server/DsPictures/ChatTemplate通过；真实嵌套Git的固定来源校验通过：官方profile可视作可再下载软件，临时修改后从可清理集合排除，试验后还原。审计源码只在忽略的temp，不写入运行安装；收尾删除该临时源码。
- `git diff --check`通过。保留已有History/NAS与H3 GGUF差异；没有模型/媒体/日志或本机路径进入提交内容。
- 不执行真实安装、模型/辅助权重下载、神经推理或速度/质量测试；用户手动更新后再验。已安装环境保持原版本。
