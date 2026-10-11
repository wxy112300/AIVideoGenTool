# Strata 上游更新证据：2026-10-10

- 类型：Evidence；状态：source-reviewed / local-runtime-unverified
- 范围：v0.1.38→v0.1.41，Windows / 单4090提示词用途。
- 当前摘要：[TASK](../TASK.md)；候选设计：[PLAN](../PLAN.md)。本文不是安装结果或性能保证。

## 身份与方法

2026-10-10（Asia/Singapore）直接查询[GitHub latest release API](https://api.github.com/repos/Niko1221/Strata/releases/latest)、[main commit API](https://api.github.com/repos/Niko1221/Strata/commits/main)及tag commit API，不仅依赖搜索缓存。

| 项目 | 本次确认 |
| --- | --- |
| 上次讨论基线 | v0.1.38，会话调查基线，不是本机安装版本 |
| 最新正式发布 | [v0.1.41](https://github.com/Niko1221/Strata/releases/tag/v0.1.41)，非prerelease；2026-10-08T12:14:59Z |
| tag / main HEAD | 均为fb58e0dbc8399662c0e47c76578c6e878b14f6cf；main没有较此tag更晚的提交 |
| main commit time | 2026-10-08T10:25:39Z |
| Windows NVIDIA asset | strata-windows-x64.zip，137164559 bytes；sha256:3dd7715f4844c0f9d2f28eb5067af0198f386df060c93523cd17e1d65b757f13 |
| CUDA12 alternate | strata-windows-x64-cuda12.zip，198572838 bytes；sha256:646ded0105aa5213a75e16621d559670d09dac26b5c720c9fd651ca83bdf14ec；不是4090默认首选 |
| 本机Strata/模型 | 未盘点/未启动，没有已安装SHA、BUILD或文件hash证据 |

digest是API元信息，未下载、未本地计算校验。不能将source SHA等同本机binary身份；实施同时固定Python server source、engine BUILD/version与asset hash。

## 更新情况

日期按GitHub UTC；完整细节以发布链接为准。

| 发布 | 日期 | 与本任务有关的变化 / 限制 |
| --- | --- | --- |
| [v0.1.39](https://github.com/Niko1221/Strata/releases/tag/v0.1.39) | 10-04 | stateless Responses API、可选parallel、RAM budget修复、UD-IQ4_XS进入setup菜单；单卡并发可能降低单请求速度 |
| [v0.1.40](https://github.com/Niko1221/Strata/releases/tag/v0.1.40) | 10-06 | kernel/cache/长context改进、stop strings修复、Windows避免最小化后的power throttling、新增one-shot checkpoint/progress |
| [v0.1.40.1](https://github.com/Niko1221/Strata/releases/tag/v0.1.40.1) | 10-06 | reasoning/代码示例误识别tool call修复，restart等待请求挂死修复；曾清理历史，不执行其destructive Git更新示例 |
| [v0.1.40.2](https://github.com/Niko1221/Strata/releases/tag/v0.1.40.2) | 10-07 | 小验证窗口权重读取复用，engine/vision启动超时，下载checksum验证；多GPU/Linux/Intel收益不套用本机 |
| [v0.1.40.3](https://github.com/Niko1221/Strata/releases/tag/v0.1.40.3) | 10-07 | Intel/Windows AMD/Docker/Tokenizer hotfix；不对4090套用AMD reserve |
| [v0.1.40.4](https://github.com/Niko1221/Strata/releases/tag/v0.1.40.4) | 10-08 | Pascal decode回退修复；Volta及更新卡代码与.3相同，不是4090提速更新 |
| [v0.1.41](https://github.com/Niko1221/Strata/releases/tag/v0.1.41) | 10-08 | short prefill CPU share、Windows低RAM读盘优化、batch死锁/卡死恢复、vision配置修复、新opt-in GDN chunked |

v0.1.41：short CPU share默认会改变少量浮点结果，可用STRATA_PREFILL_CPU_SHARE=0对照；>=128SM的chunked recurrence社区报告1.8x，维护者无同级卡验证；STRATA_STAGE_PIN=1曾损坏IQ3_S长prompt后的输出，保持关闭；STRATA_ROUTE_RESIDENT改变路由/答案，不作为无损加速。来源：[v0.1.41发布说明](https://github.com/Niko1221/Strata/releases/tag/v0.1.41)。

## 模型与4090证据

正式名[Qwen3.8-Flash-Next](https://huggingface.co/Qwen/Qwen3.8-Flash-Next)：官方125B/6B activated，另51B n-gram与4B MTP；包括Gated DeltaNet、QSA、Gated Residual、n-gram。6B活跃不意味着只存6B权重；Strata是CPU/RAM/SSD/GPU分层推理，仍受RAM、CPU、PCIe、SSD和vision开销影响。

[v0.1.41 Models](https://github.com/Niko1221/Strata/blob/v0.1.41/docs/MODELS.md)：48GB档IQ2_XS，64GB可IQ3_XXS/IQ3_S（后者余量小），96GB+可IQ3_S/UD-IQ4_XS。UD-IQ4_XS约94GB下载，64GB会部分读SSD。Coder删减专家偏代码，不作为中文/视觉通用首选。确切模型/pack/PLE/MTP/vision revision/hash留给P0，尚未在本机落实。

新找到[2026-10-04 4090 IQ3_XXS/200K code benchmark](https://github.com/Niko1221/Strata/blob/v0.1.41/bench/results/2026-10-04-community-rtx4090-iq3xxs-200k-code/README.md)：engine0.1.39、Linux、7950X、约46GiB RAM，vision/INT8 KV/MTP，并开启experimental speed projection。合成code请求decode median约120–136tok/s。每格仅3次，随机标记/输出长度变化及一次其他客户端请求影响比较；不是Windows、本机、v0.1.41或PLAN默认设置，不证明质量，不以该速度定验收线。

README主表仍有engine0.1.26/0.1.36的5070数据，并非全部重测成0.1.41；128K/262K是总context，不是无限输出。来源：[固定Details](https://github.com/Niko1221/Strata/blob/v0.1.41/docs/DETAILS.md)。

## 接口与生命周期核对

- HTTP不是engine必需：[native generate源码](https://github.com/Niko1221/Strata/blob/v0.1.41/src/program/generate.cpp)可接token IDs/--tokens-file单次运行，或--serve接stdin；不是直接传自然语言的免配置SDK。
- 产品采用HTTP更直接；[Details](https://github.com/Niko1221/Strata/blob/v0.1.41/docs/DETAILS.md#using-it)有Chat Completions/Messages/Responses及status；Responses stateless，不等价于完整云端API语义。
- [Install](https://github.com/Niko1221/Strata/blob/v0.1.41/docs/INSTALL.md#options-without-questions)支持--port和--no-browser。8080只是默认，不是协议要求。
- lazy可同时延迟engine与vision；/v1/load、/v1/unload控制别名活动/排队时409；shutdown等待进程退出，不得虚报unloaded。见[Details lazy/control](https://github.com/Niko1221/Strata/blob/v0.1.41/docs/DETAILS.md#start-the-api-without-loading-the-model)。相对上次讨论中的lazy vision限制，当前固定文档已无此限制；本机未实测。

## 本仓库基线与分层结论

当前prompt runtime固定ComfyUI，旧LM Studio/runtime字段不路由，见[用户旅程](../../../runbooks/PRODUCT_JOURNEYS.md#prompt)、[Dependencies](../../../DEPENDENCIES_AND_SETUP.md)。src/core/prompt-models.ts backend无Strata，context union最高32K；src/core/h3-prompt.ts预算最大普通2048/detailed3072，新服务不会自动去掉cap。

PromptApplicationService已有queue busy gate、origin、operationId、驻留/取消；可扩展，但Comfy专用startup/free-memory/log/release分支要隔离，不能只把URL填进旧字段。

| 证据层 | 结果 |
| --- | --- |
| 上游source/release/API文档 | 已核对固定tag和online API |
| 本地源码/Harness guide | 已读；guide prompt/settings-runtime通过 |
| Strata/模型文件完整性 | 未验证、未下载 |
| 本机API/vision/真实UI/增强/视频 | 未验证、未启动 |
| 性能/质量/取消/卸载/回退 | 未验证；PLAN安排有限实验 |

使用local-video-studio与comfy-upgrade-assessment的分层证据边界，没有实施升级或使用GPU。上游release/配置/模型身份变化时重新固定候选，不把本文当作永远实时。
