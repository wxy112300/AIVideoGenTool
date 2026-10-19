# 0.65.0 版本对齐与下一项升级

日期：2026-10-09；当前阶段见 [TASK](../TASK.md)。用户明确要求应用整体升至 0.65，并继续分析下一项升级。本阶段没有安装下一项候选，没有更改候选节点推荐线或下载权重。

## 已完成的应用版本

- package、lockfile 顶层/root package、README 统一 0.65.0；CHANGELOG 将本轮交付整理为 0.65.0 minor 条目。README 的核心推荐 0.39.2、kitchen 0.2.37 及 Qwen 2.1 图片主路线同时对齐。未创建 Git tag、提交或发布安装包。
- 重新执行 `npm.cmd run build` 通过（clean、typecheck、Vite、Electron 编译与内置节点复制）；真实隔离 Electron 的 AppApi、窗口标题及可见版本标签均为 0.65.0，空队列/History、queueRunning=false。
- 产品代码复用 [图片精简验收](../../2026-10-09-h3-image-retirement/TASK.md) 的最终 `verify`：1685 单元 + 85 集成 = 1770、typechecked clean build、20 contrast 通过。此后只改版本/文档，没有重跑 GPU 或把旧测试描述成本阶段新执行。
- 用户 state SHA-256 与图片精简保护基线相同，4 队列/129 视频 History 保留。本次隔离窗口 PID 已退出，CDP/8188 无监听；没有启动 ComfyUI 或占用 GPU。只作隔离 API 清理证据，不声称原生退出生命周期验证。

## 刷新范围与来源可靠性

从当前 TS catalog 与所选 core/data/Python 只读盘点 **21 个 active 节点包**；已移除 H3 Image Studio/Crop & Stitch 不回到推荐清单。9 个额外安装目录没有重装/卸载。原始安装路径、dirty patch、公开源码片段、用户保护 hash 与日志只存 gitignored temp。

公开 Git HEAD 及候选 tag 用 `git ls-remote` 刷新；pyproject 取固定 HEAD raw 源码。GitHub API 本次 HTTP 403/额度0，不能将脚本的 stable=null 解释为“没有 Release”；Prompt Writer/Continuum 的 Release 另用官方网页刷新，tag 固定 SHA 再交叉检查。与前次盘点相比节点 HEAD 均未再变，核心 HEAD 更新至 08ff3c11。旧源码 diff 仅在 base/target SHA 一致时复用。

当前核心仍为 d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29，source version=0.39.0，clean；用户确认其发行界面标记为 v0.39.2 + 26 commits。公开 v0.39.2 tag 固定 3c1b7a17fdf239d35ce98cc777756f572d089795；GitHub Release 列表与 tag 不同，不能混为同一发布状态。本阶段保留已验收实例，不因 HEAD 更新更换核心。

| 节点 | 实际安装 / 身份 | 当前推荐 | 上游固定 HEAD 源码版本 / 身份 | 决定 |
| --- | --- | --- | --- | --- |
| video-helper-suite | 1.7.9 / 无 Git 身份 | 1.7.9 | 1.7.9 / [4d907bee](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite/tree/4d907bee61e92c2e65af3bd6383a4e4d356126d1) | 同版本无 Git，源码身份未知 |
| comfyui-gguf | 2.0.0 / 373048b8 | 2.0.0 | 2.0.0 / [373048b8](https://github.com/leejet/ComfyUI-GGUF/tree/373048b8403a7820620065210a691263d4da0a61) | 本机=HEAD，保留 |
| kjnodes | 1.5.2 / d3cfe216 | 1.5.2 | 1.5.2 / [d3cfe216](https://github.com/kijai/ComfyUI-KJNodes/tree/d3cfe21625e5170126ce06fbfcfe1d88108688c3) | 本机=HEAD，保留 |
| ltx-video | 版本未证实 / ac4d9983，有本地改动 | rolling | rolling / 版本未证实 / [3bf3ca62](https://github.com/Lightricks/ComfyUI-LTXVideo/tree/3bf3ca62595f1764c47d01c35c8e5dfe47e1a88f) | Sulphur 专项，依赖/conditioning 变化 |
| minimax-h3-prompt-writer | 0.4.5 / 862ae053，有本地改动 | 0.4.5 | 0.4.7 / [ca79015f](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/tree/ca79015f1df28f5c49d34871c26fecc7e47bf7e9) | 第一优先专项；采用 stable 0.4.7 前保留兼容层 |
| comfyui-multimodal-prompt-nodes | 1.0.16 / b305642e，有本地改动 | 1.0.16 | 1.0.16 / [b305642e](https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes/tree/b305642e711b84fefdf5d27db6860c086b1f3015) | 本机=HEAD，保留 |
| comfyui-qwenvl-lora | 版本未证实 / fcb018d3，有本地改动 | rolling | rolling / 版本未证实 / [fcb018d3](https://github.com/Dangocan/comfyui_qwenvl_lora/tree/fcb018d3fa71afd1b8050914f1f9358106f95c77) | 本机=HEAD，保留 |
| inpaint-nodes | 1.4.4 / 5b768174 | 1.4.4 | 1.4.4 / [5b768174](https://github.com/Acly/comfyui-inpaint-nodes/tree/5b7681746fe19e563113d27366ba85236bc1ba5b) | 本机=HEAD，保留 |
| seedvr2 | 2.5.24 / 4490bd1f | 2.5.24 | 2.5.24 / [4490bd1f](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler/tree/4490bd1f482e026674543386bb2a4d176da245b9) | 本机=HEAD，保留 |
| flashvsr | 1.1.1 / 8877fdd5，有本地改动 | 1.1.1 | 1.1.1 / [8877fdd5](https://github.com/1038lab/ComfyUI-FlashVSR/tree/8877fdd593ea93b27353956dc69edf423c561fee) | 本机=HEAD，保留 |
| frame-interpolation | 1.0.11 / 26545cc2 | 1.0.11 | 1.0.11 / [26545cc2](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/tree/26545cc2dd95bc3d27f056016300673bdeee78f5) | 本机=HEAD，保留 |
| comfyui-dlss-frame-interpolation | 版本未证实 / c755e274，有本地改动 | c755e274 | rolling / 版本未证实 / [7765f01b](https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/tree/7765f01b85bdb9342c8048b321650174856a2328) | 新提交为 Linux PRIME 配置；Windows 暂缓 |
| h3-motion-context | 0.6.2 / 5335715a | 0.6.2 | 0.6.2 / [5335715a](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/tree/5335715abe54c1a9bfbe3494da29aae3e8635ce3) | 本机=HEAD，保留 |
| h3-continuum | 3.8.2 / c38c616d | 3.8.2 | 3.9.1 / [120ca6c9](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/tree/120ca6c9ea8923e33e0bdb335205c2dc23de5d6a) | 第三优先；旧 Run 复用契约迁移 |
| h3-latent-upscaler | 0.1.0 / a5ed6e95 | 0.1.0 | 0.1.0 / [a5ed6e95](https://github.com/rockerBOO/h3-latent-upscaler/tree/a5ed6e9586f0b14250a0018f78568e0076e4bd9d) | 本机=HEAD，保留 |
| minimax-h3-learned-upscaler | 版本未证实 / d7c01b90，有本地改动 | d7c01b90 | rolling / 版本未证实 / [40316cf0](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/tree/40316cf008b2fd8663263270669eb4da23f89d2c) | 新提交仅 LICENSE；保留本地修改 |
| local-video-studio-h3-av | 0.3.5 内置 / 无 Git 身份 | 0.3.5 | rolling / 版本未证实 / 随应用维护 | 内置 0.3.5 随应用维护 |
| mmh3-ultimate-upscale | 0.0.5 / d91be5ac，有本地改动 | d91be5ac | 0.0.7 / [0a8d5ee3](https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale/tree/0a8d5ee3914e8fe8bd842885412ec397d7ca1629) | required offload_model/驻留/接缝需专项 |
| spectrum-minimax-h3 | 0.2.29 / 806fe498 | 0.2.29 | 0.2.29 / [806fe498](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/tree/806fe498d574a726fecb8818917f00a4b993fd77) | 本机=HEAD，保留 |
| plaguekind-h3-sla | 1.3.8 / a05db589，有本地改动 | 1.3.8 | 1.5.6 / [d58d006a](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/tree/d58d006a4ea32c25c06499f2ff104f0852a045a6) | 第二优先性能/音画 A/B |
| comfyui-gguf-h3 | 26.09.04 / 无 Git 身份 | 26.09.04 | 26.10.05 / [5a0a3ffa](https://github.com/molbal/ComfyUI-GGUF/tree/5a0a3ffa0e3eae5c6af8b0b981b660a24d5fbc04) | 专用量化/kernel/LoRA 专项；不混用通用GGUF |

“本机=HEAD”只指 Git 提交相同；有本地改动不等于内容相同，无 Git 也不能宣称 clean。滚动包没有源码版本时保留未知。

## 下一项建议与采用门槛

**先做 H3 Prompt Writer 0.4.5 → stable 0.4.7**，固定 [8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/tree/8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e)。这是维护稳定性建议，尚非新版已兼容/性能更高结论。

- [0.4.6 Release](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.6)新增 Sequence/Compact、GGUF runtime 兼容与生成可靠性修复；[0.4.7 Release](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.7)新增 projector 手动选择、Ollama预算、长文本/参考编号/媒体与键盘修复。Sequence、第三方 Writer UI、Ollama 不会因换节点自动进入本应用，不计作当前应用已获优势。
- 固定 base→stable 源码确认：去掉 creative_brief 的 8000 字符硬上限，Reference 当前提示词检查 Missing 媒体标签；GGUF runtime_signature 加入 projector，避免同模型更换 projector 后复用旧实例；h3_pipeline 支持调用方提供媒体快照并在取消时中断。单次 Sequence 完整性判定属于 single_call 路径，不能扩成所有普通增强都新增同一检查。
- **GGUF日志回调兼容已被本机补丁回移，不重复计收益**。实际 dirty 文件为 assembly.py、catalog.py、gguf_backend.py；须保留应用 aspect ratio、模型发现、Gemma4ChatHandler、n_batch=256/思考开关。stable 的日志 fallback 可替换等价重复补丁，但不能连带丢其他补丁。基础 requirements.txt 未增加包，不代表整个可选后端依赖未经改变；安装前核对 requirements-gguf 和所选 llama wheel，保留已通过 GPU 自检的共享后端。
- HEAD ca79015f 另外含 [8292bb40 Llama.abort 取消实现](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/commit/8292bb40b41c1e20271bbee9ed1a4d87b6281029)，规避每 token 的 Python logits processor；**此改动不在 stable 0.4.7**。若后续优先吞吐，可单独固定该提交评估，不把作者的速度描述推广到本机。
- 验收：focused Prompt Writer/installer/runtime manager → verify；离线文件、实际 /h3studio/status/models、选中 Gemma/通用 GGUF 加载；真实空输入阻止→补图/文本→增强按钮→operation ID→Prompt版本；再测生成中取消、驻留切换、卸载/租约、重启与用户状态保护。有限样本判断长 brief/参考图与projector，输出质量需人工检查。通过后再改推荐与实际安装。

**第二项 PlagueKind H3 SLA 1.3.8 → HEAD 源码 1.5.6**，固定 [d58d006a4ea32c25c06499f2ff104f0852a045a6](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/tree/d58d006a4ea32c25c06499f2ff104f0852a045a6)。它比 Prompt Writer 更有视频采样性能潜力，但风险也更高：sparsity、block_size、min_seq_len、缓存和kernel影响生成。README 明确低 sparsity 可能慢于 dense，128 block 对语音可能有代价，硬件/attention API不匹配会回退 dense。作者5090/特定LoRA样本不是本机4090的升级收益。下一实验先固定 LoRA/steps/seed/音画/attention，Spectrum关闭做dense/SLA A/B，确认日志实际稀疏而非fallback、MP4解码/音频与细节，再单独测试Spectrum组合；不能把此前Spectrum普通dense成功当作SLA新版通过。

**第三项 Continuum 3.8.2 → stable 3.9.1**，固定 [94eaf70d674a58244e1cb139f021290d63fb2e6c](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/tree/94eaf70d674a58244e1cb139f021290d63fb2e6c)。[官方发布说明](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.9.1)涉及 Second Pass 音频/混合关键帧、区间条件继承、Driving Audio 对齐，以及 Sampling Contract v6 / Graph v4 的 CFG/wrapper/closure 比较。旧 v5 Take可读但不能作为新v6生成prefix；这是真正的旧Run复用行为变化。需隔离复制旧Run，重新核对内置managed前置保护、manifest写入时机、bootstrap/managed/History续写、receipt/owner/重启与拒绝后head不变。官方浏览器完整验收仍有未完成项，不升为无条件兼容。

Ultimate Upscale、LTXVideo、H3专用GGUF暂后置；分别需要图/显存接缝、Sulphur依赖/conditioning、专用量化/LoRA专项。本轮不继续加入图片模型或下载权重，Qwen 2.1为现有主路线；普通2511/Z Turbo/抠图/LaMa的独立用途按图片精简任务的评估保留。
