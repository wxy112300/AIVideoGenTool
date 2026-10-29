# ComfyUI 核心更新复核

复核日期：2026-10-30；范围：仓库推荐 0.42.3 → 最新 tag 0.43.1，以及主分支相关新增。只读研究，无安装、Python 依赖更新或 GPU 验证。

## 身份及来源

- 基线：`src/core/catalog/dependencies/comfy-core.ts` 推荐 0.42.3；上游 SHA `edb3db00fd88f059e748c8a400391b5eab76266b`。
- [发布首页](https://github.com/Comfy-Org/ComfyUI/releases) Latest 仍为 [0.43.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.43.0)，2026-10-27；SHA `426f5eea52a7ece1dd599fff4cb6cd1f352ddd24`。
- 最新远端 tag：[0.43.1](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.43.1)，2026-10-28；SHA `086099f5d8886163ef77dc354f8382cb7431582a`。使用 `git ls-remote --tags --refs` 复核，避免 tags 网页的旧缓存。
- 主分支副本 HEAD `fd7639f477050e5c25b68fc38a9c2a6b6d988211`（2026-10-29）；仅代表本次读取点。
- 隔离 bare 副本留在忽略的 `temp/comfy-core-review-20261029.git`。使用两端树 `git diff <tag> <tag>`，浅克隆的 ancestry 不完整，因此不使用 ahead/behind 或范围 log 总数评估差异。

## 稳定线真正变化

- 预取清理只处理已预取的队首，pinning 失败时仍可清理部分结果；复用 pinned memory 前同步 offload streams，避免异步复制源被覆盖。Aimdo 更新及动态 KV cache 管理涉及内存路径，应实际验证模型切换/取消/低显存，不能直接宣传 H3 加速。
- FLUX.2 VAE FP16 与 Comfy Kitchen 融合处理，见 [PR 17196](https://github.com/Comfy-Org/ComfyUI/pull/17196)。目标是解码性能与显存占用；不推广为 H3 VAE 收益。
- Qwen 3.x adaptive tree MTP；Gemma 4 31B global attention 修复。应用使用独立 llama.cpp/Strata 的请求不会因 ComfyUI 更新自动获得这些原生推理收益。
- MOSS-image 的 RoPE、color depth、edit LoRA/conditioning、峰值内存与专用 merge 支持；FIBO 2.0 支持。应用仍须有对应产品接线，新核心不自动开放编辑入口。
- Pad Image、Branch、ACEScg/EXR 与多家 Partner API 节点更新。ComfyUI 前端更新不等同于应用 Electron 自有界面更新。
- H3 PDD 单头 LoRA 映射修复虽在 0.43.0 release notes 中，但 0.42.3 的 `comfy/lora.py` 已含 `pdd_steps` bank 路由；两端 diff 此处没有新增。因此不是本次升级收益。
- 0.43.0→0.43.1 差异主要为 Linux anonymous-file 修复、Patina/VEED API 节点及模板版本；无 Sol VAE。

实际 [requirements](https://github.com/Comfy-Org/ComfyUI/blob/v0.43.1/requirements.txt) 两端差异：Kitchen 0.2.39→0.2.40、Aimdo 0.5.6→0.6.0、frontend 1.55.18→1.57.4、templates 0.11.93→0.11.98、embedded docs 0.5.14→0.5.15、Pillow 增加最低 10.1.0。仓库的独立 Kitchen 版本线仍为 0.2.39，实施升级时应检查是否冲突，而不是只提高 core 推荐数字。

## 主分支另有的 H3 变化

- [Sol VAE PR 17411](https://github.com/Comfy-Org/ComfyUI/pull/17411)：合并提交 `0df1646`；原生 whole-clip 解码支持。检查 v0.43.0 和 v0.43.1 的 `comfy/sd.py`，均无 noncausal 分支；升级这两个版本不能启用 Sol。
- [H3 latent upscaler PR 17412](https://github.com/Comfy-Org/ComfyUI/pull/17412)：合并提交 `35060f0`。仓库已有第三方/自有 latent upscaler 与 Refiner 路径，后续评估是否迁移原生实现；不在本次研究中替换配方。
- 另有 conditioning concat 与前端 pin/cache 修复。没有把移动主分支当稳定发行版。

建议：0.43.1 可进入升级兼容性验证，但若主要目标是 Sol VAE，应等待包含 PR 的稳定发行版，或另行固定主分支提交进行隔离试验。未取得本机实际 core/Python/schema/输出证据，不宣称已安装、兼容通过或速度提升。
