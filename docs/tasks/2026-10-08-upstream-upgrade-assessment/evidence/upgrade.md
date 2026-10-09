# ComfyUI 0.39 / 开发分支 / H3 / Qwen Image 2.1 升级评估

类型：研究证据；状态：只读评估完成，候选升级未实施；查询日期：2026-10-08。适用 Local Video Studio 0.64.3 / Git `3c33056606815af2e9b1c079c3b507e8c0d5a7bb`。当前任务状态见 [TASK](../TASK.md)，后续流程见 [升级评估 Skill](../../../../.agents/skills/comfy-upgrade-assessment/SKILL.md)。

后续：2026-10-09已按新授权实施核心兼容/GGUF迁移与推荐线更新，见 [实施证据](compatibility-0392.md)；下文是10月8日的历史评估，不代表当前仍未实施。

## 结论与建议顺序

**值得升级，但先修应用兼容线，再试点核心与 GGUF，不能直接全量更新。** 优先价值是 H3 的 VAE/显存可靠性，以及 Qwen 2.1 的输入、缓存与 loader 正确性；ControlNet、专属 PE、新 VAE/量化属于需要新权重或应用接线的能力。

1. **P0：ComfyUI 0.39.0 + kitchen 兼容评估。** 本机核心为 0.37.0 / `c194dd00cd42aa18d9dbf27d977bf6b85d9ea565`，最新 stable 为 0.39.0 / `b0b743566f65daafc423b4fea8a2fbda94b3384a`（UTC 2026-10-05 发布）。实际安装 SHA 到目标有 94 个提交。必须先处理应用对 `comfy-kitchen==0.2.35` 的精确 readiness/安装器固定，而目标核心要求 0.2.37。
2. **P0：通用 GGUF 来源对齐。** catalog 已指向 leejet，但本机仍是 city96 / `6ea2651…`。同为 2.0.0 不代表已有 Qwen 2.1 支持；leejet 的目标 `373048b…` 相比本机多 7 个提交，包含 2.1 architecture 与 Qwen3-VL mmproj 修复。
3. **P1：Spectrum 0.2.28。** 窄 Windows CRLF source-audit 修复，值得试点；核对目标 core 的被审计源码是否仍被认可，观察实际 forecast/actual/fallback，不能只看生成成功。
4. **P1：Prompt Writer 0.4.7、Crop & Stitch 3.0.17。** 前者需要重新验应用补丁与 `/h3studio/*`，后者需要 Mask/alpha/原图保护回归。Inpaint 1.4.4 的改动主要在未直接使用的 ColorMatch，可稍后处理。
5. **P2：Continuum 3.9.1、PlagueKind 1.5.6、H3 Image Studio 24.1.0、Ultimate Upscale 0.0.7。** 有实质能力，但分别涉及 Run 采样契约、attention 参数/新缓存、全新图片节点路线、新增 required 参数；各自做独立兼容试点。
6. **P2：Qwen 2.1 PE/ControlNet、H3 Union 2.0 / w6a8 / LynnReal VAE。** 先固定文件 hash 与最小 A/B，再决定是否新增产品入口。不是核心升级后自动出现在本应用中的功能。

以上为候选优先级，未修改 catalog、Python 包、模型、节点安装或用户设置。没有 RTX 4090 的此次性能/质量实测，不承诺速度倍数或画质提升。

## 证据口径与本机基线

- **覆盖范围**：23 个 active catalog 节点包（含应用内置 AV 包），2 个 retired 条目，以及 data/custom_nodes 中另外 9 个安装目录；共 32 个实际目录。逐项结果在下表。catalog feature 节点与 builder 动态插入节点也纳入检查。
- Desktop 的配置安装目录、实际 core 子目录、用户 data/Python 分开解析；实际 core working tree clean。机器路径不提交。节点没有 `.git` 时，只能确认目录和版本文件，不能证明 upstream SHA 或 clean。
- 本机 KJNodes、SeedVR2、FlashVSR、Motion Context、QwenVL、MultiModal 等若 HEAD 已相同，则记录已有能力，不把 catalog 的旧推荐线误报成本机缺失。
- Prompt Writer、MultiModal、QwenVL、LTX、FlashVSR、DLSS、learned upscaler、Ultimate、PlagueKind 存在本地改动；这些可能包括应用兼容补丁，更新时须保留/重新应用，不能覆盖式 pull/reset。未逐项给 dirty 改动定性。
- `harness:comfy -- probe-prompt-writer --json` 返回服务离线、loaded=null；8188/CDP 未监听。用户 queue 4 条、History 129 条，因此本次不启动生产队列、不执行升级或生成。文件、source diff 是证据，schema/UI/runtime/收益均未运行。
- GitHub 用公开 releases、`git ls-remote` 与 compare API，固定 full SHA；没有 Release 时补查源码 pyproject。`models` 资产发布不是语义版本。HEAD 与 stable 分开记录；Prompt Writer 的 standalone 发布也不混入节点版本。
- 终端 HF API 批量请求失败；重点模型卡和 commit 页用浏览工具核对。没有完成本机大权重 SHA-256 与全部 LoRA 远端 LFS hash 比较，不能声称所有同名权重已经最新。完整节点身份见 [不可变快照](inventory.json)。

## ComfyUI：真正与当前应用有关的变化

版本来源：[0.38.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.38.0)、[0.39.0](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.39.0)；精确新增范围是 [实际 c194dd00 → stable b0b74356](https://github.com/Comfy-Org/ComfyUI/compare/c194dd00cd42aa18d9dbf27d977bf6b85d9ea565...b0b743566f65daafc423b4fea8a2fbda94b3384a)。以下结论为源码判断。

### MiniMax H3

| 变化 / 来源 | 对当前产品的意义 | 获益与验证条件 |
| --- | --- | --- |
| VAE tiles 与已经合成的邻居融合，[#16436](https://github.com/Comfy-Org/ComfyUI/pull/16436) | 修正纵横重叠交叉处的接缝处理；分块 decode 的实际质量风险相关 | 保持相同 VAE、tile/overlap 与素材，检查边界和整帧；非 tiled decode 不能照搬收益 |
| offloaded qk_norm_scale 对齐 query 设备，[#16485](https://github.com/Comfy-Org/ComfyUI/pull/16485)；norm weight 用 offload-safe cast context，[#16698](https://github.com/Comfy-Org/ComfyUI/pull/16698) | 修复 VAE offload/fused 路线的设备/权重访问问题 | 原 FP16 与 INT8 ConvRot 分别测，仍遵守应用 GPU VAE 策略 |
| embedding/pack 临时 tensor 在 blocks 前释放，[#16677](https://github.com/Comfy-Org/ComfyUI/pull/16677) | 减少早期 embedding 与 transformer 叠加占用的机会，不改采样权重 | 测真实 VRAM/host RAM 峰值；不从代码推出固定节省量 |
| LynnReal light VAE 检测/加载，[#16657](https://github.com/Comfy-Org/ComfyUI/pull/16657) | 新最终 decode 候选；不是 taeh3 的实时 preview | 新权重、catalog/选择策略与画质 A/B，保留已有 VAE |
| Fun-ControlNet-Union 2.0，[#16471](https://github.com/Comfy-Org/ComfyUI/pull/16471) | 新控制模型分支 | 需新增对应 model patch 与 graph/输入契约，不是当前普通 FL2VA/REF2VA 自动获得 |
| w6a8 格式，[#16483](https://github.com/Comfy-Org/ComfyUI/pull/16483) | 新 H3 FL2VA/REF2VA 量化候选 | 当前 catalog 仍是已固定 INT8/INT4/GGUF 变体；不覆盖 ID 或借用其他量化的 kernel 判定 |

**关键应用兼容风险**：`src/core/catalog/dependencies/nodes.ts` 固定 `H3_COMFY_KITCHEN_VERSION=0.2.35`；`electron/services/environment.ts` 的 `h3ComfyKitchenCudaBackendReady()` 使用精确相等，安装/修复也会 pin 0.2.35。本机选中 Python 的包 metadata 确认 0.2.35。目标 core requirements 则固定 0.2.37；盲升后 readiness 会拒绝新包，修复按钮还可能降回旧包。应静态核对 0.2.37 backend/API 后，在一次独立兼容补丁中同步 catalog/probe/installer/测试，再实跑 ConvRot。不是简单把等号改成 `>=` 就完成验证。

### Qwen Image 2.1

| 变化 / 来源 | 当前已具备或尚缺 | 下一验证 |
| --- | --- | --- |
| KV 位置预算改善，[#16429](https://github.com/Comfy-Org/ComfyUI/pull/16429)；blocks compiler，[#16430](https://github.com/Comfy-Org/ComfyUI/pull/16430) | **本机实际 c194dd00 已包含这两项**，不是此次尚待获得的增量。应用 edit 分支已插入 `QwenImage21Cache(device=auto,dtype=default)`，T2I 分支不用该 cache | 多图 edit 记录实际 GPU/CPU/off cache；compiler 启用/首编译与暖执行分别测，不能用 release 标签重复计算加速 |
| int8/int4 KV cache 崩溃修复，[#16667](https://github.com/Comfy-Org/ComfyUI/pull/16667) | 0.39 的直接可靠性增量；应用当前不主动指定量化 dtype | 先原 auto/default，再单独试量化候选；不可默认认为当前图就会切到 int4 |
| Qwen-VL RGBA 输入崩溃修复，[#16548](https://github.com/Comfy-Org/ComfyUI/pull/16548) | 与 PNG、透明参考图/裁切输入相关 | RGB/RGBA、alpha输出与多参考顺序，保留图片版本关系 |
| fp16 activation 原位 clamp，[#16608](https://github.com/Comfy-Org/ComfyUI/pull/16608) | 降低该路径创建额外 tensor 的机会 | fp16 路径相关，不直接承诺默认 BF16/INT8 的同等增益 |
| tiny VAE，[#16552](https://github.com/Comfy-Org/ComfyUI/pull/16552) | 核心已有轻量 preview 支持；本应用尚无该 Qwen preview 选择路径 | 新 preview 权重/接线单测与实际预览；不换最终 BF16 VAE |
| Fun-ControlNet-Union，[#16519](https://github.com/Comfy-Org/ComfyUI/pull/16519) | 新控制与 inpaint patch；当前 2.1 只有 T2I/edit/视觉 Paint guide，没有该 Mask graph | 需要 core model-patch node、新权重与 Mask/strength/range 验证；不要仅解除 UI Mask 门槛 |
| 原生 Qwen3.5/3.8 长上下文生成优化，[#16638](https://github.com/Comfy-Org/ComfyUI/pull/16638)；TextGenerate 新 system_prompt + thinking output，[#16442](https://github.com/Comfy-Org/ComfyUI/pull/16442) | 对未来官方 2.1 PE 有价值；当前全局 VisionLLMNode/Prompt Writer 走 llama-cpp，这条 core 优化不会自动覆盖 | 先专属 PE T2I/Edit 路由与结构化结果契约，再测长文本、取消、显存释放 |

### stable 之后的开发分支：额外 26 个提交

另查到 master `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`，比 stable 0.39.0 多26提交，仍报告源码版本0.39.0。这些尚未进入该 stable release，不能按同版本号混合验收。来源：[固定 compare](https://github.com/Comfy-Org/ComfyUI/compare/b0b743566f65daafc423b4fea8a2fbda94b3384a...d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29)。

| 开发分支变化 | 应用影响与决定 |
| --- | --- |
| Linear prologue/epilogue融合API统一，[#16816](https://github.com/Comfy-Org/ComfyUI/pull/16816)；函数wrapper，[#16861](https://github.com/Comfy-Org/ComfyUI/pull/16861)；bypass LoRA融合路径修复，[#16862](https://github.com/Comfy-Org/ComfyUI/pull/16862) | H3 VAE的调用方式同步改变。当前LoRA/INT8/应用补丁须独立复验，不能假设新接口只带来速度收益；优先保持stable试点，HEAD作为后续候选 |
| checkpoint的comfy_attention配置新增kitchen SOL与有序偏好列表，[#16831](https://github.com/Comfy-Org/ComfyUI/pull/16831)；更多模型接入，[#16806](https://github.com/Comfy-Org/ComfyUI/pull/16806) | 可影响H3/Qwen attention选择；需匹配FP16/BF16 QKV、head_dim128，masked调用回PyTorch，显式override优先。元数据支持不等于当前权重启用，不与SLA/Spectrum擅自叠加 |
| Qwen3.5 LLM低显存优化，[#16820](https://github.com/Comfy-Org/ComfyUI/pull/16820) | dynamic VRAM优先保留频繁执行的head/MTP、embedding可在host gather；适用未来core原生PE，不能归到当前llama-cpp Prompt Writer |
| 动态输入校验与lazy调度，[#16377](https://github.com/Comfy-Org/ComfyUI/pull/16377)；DynamicGroup暂保持internal，[#16811](https://github.com/Comfy-Org/ComfyUI/pull/16811) | 现有Qwen多参考autogrow和新节点API图须重验；稳定版接口不应按开发分支例子直接改 |
| 自定义节点governance，[#16167](https://github.com/Comfy-Org/ComfyUI/pull/16167)，新增cryptography与`--disabled-nodes-config` | 普通源码`GOVERNANCE_REQUIRED=False`，不是默认禁用现用包；governed build可按签名策略/包digest限制导入，pack policy启用时会关闭Manager。升级评估需核对所选发行包的实际策略与本地补丁hash |
| 本地asset export、video metadata ingest、websocket/preview附加workflow metadata、CameraInfo/CameraAngle节点 | 可成为以后资产/镜头能力候选，当前AppApi/History与相机控制没有自动接入；frontend1.55.14/templates0.11.78只更新core对应组件 |

### 邻接变化

- SaveVideo 的 H.264 CRF 默认 23→18、AV1 30→24，[#16663](https://github.com/Comfy-Org/ComfyUI/pull/16663)：只有使用默认值的图会受影响；可能改善编码质量并增加大小/耗时，要看实际容器/codec，不把它当模型画质提升。
- assets 扫描/SQLite 写事务、启动锁等待、跨盘上传以及输出保存期间的后台调度修复：与 core 启动、文件库和 output 注册相关；应用自身 History/资产库并未自动改实现，仍验旧记录、上传和重启。
- requirements 从 torchaudio 改为不再核心强依赖，但自定义节点仍可能需要它；不能因此自动卸载共享包。frontend 1.53.10、templates 0.11.76、embedded docs 0.5.13 不会自动更新本应用 renderer 或应用维护的 API JSON。
- core SeedVR2 的优化在 `comfy/ldm/seedvr/*`；应用使用 numz 的独立 `src/` runtime 和 `SeedVR2VideoUpscaler`。没有证明共享实现前，不能把 core 的速度改善归到现有超分路径。

## 全部 active catalog 节点：逐项结果

`=HEAD` 指本机 Git 身份等于此次公开 HEAD，只证明源码身份；dirty 仍可能影响运行。没有 Git 的条目仅比较版本文件。下面“上游”若注明源码版本/HEAD，则不是新的 stable release。

| 节点包 | catalog 推荐 / 本机实际 | 查询到的上游与新增内容 | 评估 |
| --- | --- | --- | --- |
| [VideoHelperSuite](https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite) | 1.7.9 / 1.7.9，无 Git | HEAD pyproject 仍 1.7.9；没有语义 Release，HEAD `4d907bee` | 未发现更高版本号；无法证明无同版本源码变化。继续保留编码/音频图，必要时补文件指纹 |
| [通用 GGUF / leejet](https://github.com/leejet/ComfyUI-GGUF/compare/6ea2651e7df66d7585f6ffee804b20e92fb38b8a...373048b8403a7820620065210a691263d4da0a61) | 2.0.0 / city96 2.0.0 `6ea2651` | leejet HEAD `373048b`、仍 2.0.0；新增 MiniMax/Qwen2.1/Krea2/Ideogram4，修复1D量化 tensor 反量化和 Qwen3-VL mmproj 映射 | P0，来源漂移；用 Q8/Q6 实际加载与 tensor keys 验证。requirements `gguf>=0.13.0`、sentencepiece、protobuf |
| [KJNodes](https://github.com/kijai/ComfyUI-KJNodes/tree/d3cfe21625e5170126ce06fbfcfe1d88108688c3) | 1.5.2 / 1.5.2 =HEAD | HEAD `d3cfe216`，无新源码增量 | 保持；已有 H3 attention/preview 功能不重复计为新升级 |
| [LTXVideo](https://github.com/Lightricks/ComfyUI-LTXVideo/compare/ac4d99839020b983e956a8ab67ec38aec1b6e65a...3bf3ca62595f1764c47d01c35c8e5dfe47e1a88f) | rolling / `ac4d998`，dirty | HEAD `3bf3ca62` 多16提交；HDR colour/EXR、新 tiled fusion、conditioning/IC-LoRA/latents 变化；新增 colour-science>=0.4.4、openimageio requirements | 与 Sulphur/LTX 旅程另评；不为 H3/Qwen 顺带安装新依赖 |
| [H3 Prompt Writer](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.7) | 0.4.5 / 0.4.5，dirty | stable 0.4.7；0.4.6 修复流完整性、异步/provider状态、log callback，新增 Sequence workspace；0.4.7 修复 modal 关闭后的 ComfyUI 键盘占用，改善 drafts、projector/media引用与长文本 | P1；先验证应用的 Direct GGUF/预算/cleanup 补丁和 `/h3studio/*`。HEAD 的 Llama.abort/API provider 修复在 tag 之后，不能宣称 stable 已包含 |
| [MultiModal Prompt Nodes](https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes/releases/tag/v1.0.16) | 1.0.15 / 1.0.16 =HEAD，dirty | stable 1.0.16，本机已在目标；catalog 的“可更新”与实际不同 | 没有新增上游增量；保留共享 llama wheel、Qwen3.8 projector/预算应用补丁 |
| [QwenVL LoRA](https://github.com/Dangocan/comfyui_qwenvl_lora/tree/fcb018d3fa71afd1b8050914f1f9358106f95c77) | rolling / `fcb018d` =HEAD，dirty | HEAD 相同、无语义 Release | 保持，不把输出兼容层当作需要强制清除的 dirty |
| [Inpaint Nodes](https://github.com/Acly/comfyui-inpaint-nodes/compare/d4a318f00fffbd269418057f869e9bc912832229...5b7681746fe19e563113d27366ba85236bc1ba5b) | 1.4.3 / 1.4.3 | HEAD 源码1.4.4：ColorMatch 支持 RGBA，2提交 | 当前用 LaMa/ExpandMask/Inpaint，ColorMatch 非主链；较低优先级，不声称 LaMa 模型改进 |
| [Inpaint Crop & Stitch](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch/compare/bc4b1184b56c0ee25302ca755e43e264d0868998...8584b08d851762965df898b421a39075fc5357ae) | 3.0.16 / 3.0.16 | HEAD 源码3.0.17：图像/Mask rank、通道、dtype、NaN/Inf、空 mask 和 batch 对齐清洗，1提交 | P1 图片鲁棒性；对异常输入清洗也可能改变画面，必须核对 Mask 外和透明通道 |
| [SeedVR2](https://github.com/numz/ComfyUI-SeedVR2_VideoUpscaler/tree/4490bd1f482e026674543386bb2a4d176da245b9) | 2.5.24 / 2.5.24 =HEAD | 最新源码仍2.5.24，GitHub最新stable仅2.5.23；后者有 FFmpeg writer/GGUF VAE/slicing/色彩精度等修复，本机已包含后续源码 | 保持，不能因 Release 较低就回退；核心 SeedVR 优化不等于此包升级 |
| [FlashVSR](https://github.com/1038lab/ComfyUI-FlashVSR/tree/8877fdd593ea93b27353956dc69edf423c561fee) | 1.1.1 / 1.1.1 =HEAD，dirty | 无新 HEAD 增量 | 保持原精度/offload与应用补丁 |
| [Frame Interpolation](https://github.com/Fannovel16/ComfyUI-Frame-Interpolation/tree/26545cc2dd95bc3d27f056016300673bdeee78f5) | 1.0.11 / 1.0.11 =HEAD | 无新 HEAD；Releases 仅 `models` 资产标签 | 保持 RIFE/FILM，不能把 `models` 当新版本 |
| [Konohamaru DLSS](https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/compare/c755e274a405a7a47667bd567d489b6845066bcf...7765f01b85bdb9342c8048b321650174856a2328) | 固定c755e274 / 同 SHA，dirty | HEAD多1提交，仅 Linux setup 的 PRIME-offload `--vulkan-name` | 对当前 Windows 图无直接增益，保持 DLL/LFS/runtime pin |
| [H3 Image Studio](https://github.com/astropuzzo/ComfyUI-MiniMax-H3-Image-Studio/releases/tag/v24.1.0) | 23.0.0 / 23.0.0 | stable24.1.0，多5提交；24.0 单帧 Image Studio 与新 still decode，24.1 可绕过/可叠加 LoRA 链、adapter信息 | P2。旧6节点仍注册为 Compatibility/DEPRECATED，并非被删除；当前图继续走旧节点不会自动得到新单帧路线优势，需独立 adapter/节点接线 |
| [H3 Motion Context](https://github.com/NikoDemon80/ComfyUI-H3-Motion-Context/releases/tag/v0.6.2) | 0.6.2 / 0.6.2 =HEAD | 没有新 stable/HEAD 增量 | 保持原 latent/video context fallback |
| [H3 Continuum](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.9.1) | 3.8.2 / 固定c38c616d、3.8.2 | stable3.9.1；3.8.3之后有 per-chunk refs/实验 timeline video、PackedLayout校验、缓存复用、Second Pass音频/混合关键帧、Review修复；Sampling Contract v6 / Graph Contract v4 | 高兼容风险。保留 V3.8X2 图不等于旧 Run 自动兼容；重验本应用 managed_prefix_guard、official namespace、旧 Run拒绝/head不变及新A→B→C。main 在tag之后主要是验证文档订正，不混作runtime新功能 |
| [H3 Latent Upscaler](https://github.com/rockerBOO/h3-latent-upscaler/tree/a5ed6e9586f0b14250a0018f78568e0076e4bd9d) | 0.1.0 / 固定a5ed6e95 =HEAD | 无新 HEAD；未发现语义 Release | 保持 |
| [H3 Learned Upscaler](https://github.com/LBH-123-AI/Comfyui_Minimax_h3_latent_Upscaler/compare/d7c01b9011f2e8439493f6c02c29995a27df276f...40316cf008b2fd8663263270669eb4da23f89d2c) | 固定d7c01b90 / 同SHA，dirty | 多1提交，仅新增 MIT LICENSE | 权重/推理无新源码变化；许可证记录可补，不为此重跑质量 |
| LocalVideoStudio-H3 AV | 0.3.5 / VERSION 0.3.5 | 内置包；本机 VERSION、__init__.py、nodes.py、managed_prefix_guard.py 与仓库按规范化行尾 hash 全部一致 | 当前副本无需更新；升级 Continuum/core 时仍重验协议，不能把内置节点当远程 release |
| [MMH3 Ultimate Upscale](https://github.com/bbaudio-2025/Comfyui-MMH3-UltimateUpscale/compare/d91be5ac41797a3789b4765cdb6eb6d9129a4a4d...0a8d5ee3914e8fe8bd842885412ec397d7ca1629) | 固定d91be5ac / 源码0.0.5，dirty | HEAD源码0.0.7，多20提交；safetensors-only、extra_model_paths解析、新 offload_model、高显存分块驻留/tiled变化 | P2；`MMH3LatentUpscaleWithModelParams.execute` 新 required `offload_model`，现有 API图需明确核对/补值；4090不要自动启用高显存驻留 |
| [Spectrum](https://github.com/xmarre/ComfyUI-Spectrum-MiniMax-H3/releases/tag/v0.2.28) | 0.2.27 / 0.2.27 | stable0.2.28，多1提交；审核源 hash 将CRLF规范化到LF，避免同内容Windows checkout被判source_unreviewed而全actual | P1窄修复；未改sampler方程/调度。新core源码身份变化仍可能安全降级，需读actual forecast证据 |
| [PlagueKind / H3 SLA](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/compare/a05db58981fec697bd3644229b215ee04c126ea7...d58d006a4ea32c25c06499f2ff104f0852a045a6) | 1.3.8 / 1.3.8，dirty | HEAD源码1.5.6，多20提交；ref/audio保护、block32、kitchen sparse/INT8、新H3 cache、refmod loader、unified node、移除意外依赖 | P2；schema默认 sparsity 0.90→0.80、block64→32、min_seq4096→12228及保护选项变化，不可认为旧显式参数跟默认一起改善；现有Spectrum与新cache不可擅自叠加 |
| [H3专用 GGUF / molbal](https://github.com/molbal/ComfyUI-GGUF/compare/a553b8a2972f799d8ea37d548ca6ff4d926dd4eb...5a0a3ffa0e3eae5c6af8b0b981b660a24d5fbc04) | 26.09.04 / 同版本、无Git、专用重注册 | 最新stable仍v26-09-04；HEAD源码26.10.05、比stable多10提交：INT4 LoRA融合、Qwen2.1、INT4/INT8修复、optional kwargs过滤、K-quant Triton/CUDA、Qwen3-VL sidecar别名 | P2；应用只注册 H3UnetLoaderGGUFAdvanced/H3CLIPLoaderGGUF，升级不能覆盖为通用名称造成冲突。native fast path只支持Q4_K/Q5_K/Q6_K，明确不含当前H3 Q3_K实验档，不承诺3080当前路径获加速 |

## 已退休条目和额外安装目录

已退休条目只做库存核对：[HECer DLSS5](https://github.com/HECer/ComfyUI-DLSS5/releases/tag/v0.4.0) 从catalog旧0.2.2到stable0.4.0，增加固定runtime/DLSSG及安装校验；[AetherScale](https://github.com/vizart-vj/ComfyUI-AetherScale/releases/tag/v0.9.2) 从旧0.5.5到0.9.2，扩展多阶段视频/Neural/HDR/MFG链。均未安装、不建议此次复活；现用Konohamaru不是这两个retired包。H3-Optimizations/Memory已按产品契约停用，也不列为升级/重新安装候选。

下面9项未列入当前 active catalog 的必需包。它们可以影响 ComfyUI 导入/原生前端，但未发现本应用生产模板必须引用其节点；不要因此自动卸载。没有本机Git身份时，下面近期上游变化不能精确归因于“本机到目标的全部增量”。

| 额外目录 / 来源 | 本机 → HEAD源码版本 | 内容 / 结论 |
| --- | --- | --- |
| [CoCoTools IO](https://github.com/Conor-Collins/ComfyUI-CoCoTools_IO) | 0.4.2→0.4.2，无Git | 无更高版本号，commit/同版本源码差异未证实 |
| [Advanced-ControlNet](https://github.com/Kosinkadink/ComfyUI-Advanced-ControlNet/commits/main/) | 1.5.6→1.6.0，无Git | 上游含V3 API迁移、modern inpaint/standard Apply、zero-effect mask、control scheduling与Flux奇数latent修复；保留为未来ControlNet专项评估，不是H3/Qwen原生Union硬依赖 |
| [GGUF-FantasyTalking](https://github.com/kael558/ComfyUI-GGUF-FantasyTalking) | 2.0.0→2.0.0，HEAD相同、dirty | 没有新增HEAD；不要把其通用loader名称混到Qwen来源迁移 |
| [Impact Pack](https://github.com/ltdrdata/ComfyUI-Impact-Pack/commits/Main/) | 8.25.1→8.28.3，无Git | 近期DifferentialDiffusion跨版本兼容、MaskRectArea前端/输入/预览修复；生产图未新增detailer路径，不为版本差顺带接入 |
| [Manager](https://github.com/Comfy-Org/ComfyUI-Manager/compare/c792f9277cdab9f754ca02f35eabf9304af2b89b...69bd94e7414eff53ed905cd7befe85262a941a07) | 3.37→3.42，Git旧c792f927 | 大量节点数据库更新，也有config写入合并、安全安装规则与HTML/URL注入防护；1254 commits 的compare仅返回有界提交样本，未宣称全源码审计。运行在用户data/安全迁移范围，独立维护 |
| [ControlNet Aux](https://github.com/Fannovel16/comfyui_controlnet_aux/compare/95a13e2e5d8f8ae57583fbebb0be1f670889858b...0cd290477128d42cdc3e76a826a402d866e8c684) | 1.1.4→1.1.6，多21提交 | MediaPipe0.10.32+/1.0 FaceMesh、DWPose RGB→BGR、ONNX平台安装边界、MIGraphX与依赖精简；未来Union预处理可用，先核对Python/requirements |
| [Essentials](https://github.com/cubiq/ComfyUI_essentials) | 1.1.0→1.1.0，无Git | 未发现更高版本号；同版本源码差异未知 |
| [IPAdapter Plus V2](https://github.com/chflame163/ComfyUI_IPAdapter_plus_V2) | 1.0.12→1.0.12，HEAD相同 | 无新增源码；不是Qwen2.1/H3多参考输入的替代实现 |
| [rgthree](https://github.com/rgthree/rgthree-comfy) | 1.0.2510052058→1.0.2610050029，无Git | HEAD `d7297b42` 的源码版本高于安装；主要原生Comfy前端/loader工具，网页commits缓存早于HEAD，未用缓存内容冒充此次精确增量；暂不纳入应用加速优先项 |

## 模型与 LoRA：值得追踪的新能力和证据缺口

- **H3 权重**：catalog 已固定基础模型/encoder/FP16 VAE到 `014cd40f…`，INT8 VAE到 `7a2065e…`，learned upscaler到 `09592c62…`，并记录bytes/SHA-256。[官方repack commit](https://huggingface.co/Comfy-Org/MiniMax-H3/commits/main) 后续新增 `minimax_h3_{fl2va,ref2va}_pruned_w6a8` 和Union2.0 BF16/INT8；已有INT8 VAE已进入catalog，不重复报为新缺项。新格式/新控制权重需要独立模型组件与graph验证。
- **Qwen 官方权重**：[发布仓库](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) 现有Union BF16/INT8 patch、Qwen3-VL w4a8、两个Qwen3.5 9B PE；[commit记录](https://huggingface.co/Comfy-Org/Qwen-Image-2.1/commits/main) 曾将初期DiT重命名为old并同名重传。当前catalog仍以main文件URL为主，因此文件名存在不证明是修正后的版本，后续实际试点先锁revision/LFS hash。本次未下载或替换。
- **Qwen GGUF变体**：[原URL已重定向为Uncensored仓库](https://huggingface.co/abenzerps/Qwen-Image-2.1-Uncensored-GGUF/commits/main)，近期增INT8/FP8、修FP8 quantization metadata、新NVFP4/MLX和uncensored LoRA。当前应用仍保留Q8_0/Q6_K两条GGUF路径；新格式不能直接借用GGUF loader或4090量化kernel。旧Qwen接入TASK里的Q4默认/Q8排除是历史状态，以当前catalog为准。
- **Qwen AnyAngle**：[作者模型卡](https://huggingface.co/lilylilith/QI_2.1_AnyAngle) 要求image1为目标粗渲染、image2为原图，strength1，并建议CFG3/至少20步。应用已接两图门槛和引用顺序，但只有Fix专属采样档，AnyAngle仍沿用普通25/40步与CFG1；值得做CFG1 vs3质量对照，不能把“已列入LoRA下拉框”当作者推荐质量路径已验证。
- **Qwen Fix**：[作者卡](https://huggingface.co/e-n-v-y/Qwen-Image-2.1-Fix) 将质量修复与专属配置绑定；应用已固定Comfy权重SHA `e4a36915…`、APG/FreSca、20步/CFG3/seeds_2/sgm_uniform。下一验收应是无LoRA基线对照与真实生成，不能单看load成功。
- **Lighting Blend / Orbit**：[Lighting作者卡](https://huggingface.co/RunningHubAI/rh-qwen-image-2.1-lora-2104918997757157378) 的pengyu触发词与[Orbit作者卡](https://huggingface.co/pablodawson/MiniMax-H3-360-Orbit-LoRA) 的首尾同图路径已在0.64.3代码接入。当前新增LoRA仍未有此次真实质量证据；Lighting缺独立license说明保持未知。未发现足够证据要求此次换权重。
- 其余已登记Turbo/PDD/运镜/真实感LoRA没有完成远端LFS逐文件对照，本次不宣称全LoRA没有更新。后续Skill明确从catalog取名单、检查权重hash而非只看repo日期；网络不可用必须保留unknown。

## 后续 Harness 最小验证批次

完整执行规则见 Skill 的 [验证矩阵](../../../../.agents/skills/comfy-upgrade-assessment/references/validation-matrix.md)。不要把本报告当实际升级授权。

| 批次 | 一次改变的变量 | 最小通过条件 |
| --- | --- | --- |
| A：核心兼容 | core stable0.39 +已核对kernel/应用兼容补丁 | focused环境/compatibility/workflow测试 + verify；隔离app选中core/data/Python，start-comfy→scan，H3原INT8/FP16输出、Qwen原T2I/edit输出；重启与原队列/History身份保护 |
| B：Qwen GGUF来源 | city96→固定leejet SHA | 原Q8/Q6素材各1个，loader/encoder/mmproj正确、真实按钮→task→可解码PNG/History；官方无GGUF路线保留 |
| C：Spectrum | 0.2.27→0.2.28，其他固定 | 确认source audit与forecast实际生效，不是全actual成功；同seed音画/动作、暖采样秒与峰值对照 |
| D：窄节点 | Writer0.4.7或Crop3.0.17，各自单独 | Writer空输入恢复/真实增强/切换/取消与lease清理；Crop/Mask外和alpha保持，取消/重启不污染草稿 |
| E：高风险/新能力 | Continuum/SLA/新图片节点/新权重，每次一个 | 实际schema +应用graph +旧ID/Run保护 +新最小生成；有收益再扩到多图/长片/2K/叠加LoRA |

性能记录拆为加载、编译、采样、VAE、封装和总时长，另记录VRAM/host RAM/shared GPU。输出读取实际帧数/FPS/音轨，不以请求值自证。质量看指令/参考身份、透明通道/Mask外、时间连续性和音画同步。上游示例数字不能换算成本机收益。

## 本次检查与清理

- 成功执行 Harness `list` 与 `guide settings-runtime/image/create-video/extend`，服务层Prompt探针确认offline；Git/pyproject/registry及23 active包的来源/版本均完成只读核对。内置AV安装副本4文件与仓库匹配。
- 仓库只变更Skill、报告与导航；未运行build/verify/GPU，不创建Electron或Python服务；无本次服务/端口需要清理。用户安装、设置、4条队列与129条History没有写入。
- Skill frontmatter、链接、diff与命令一致性检查结果由TASK保存。原始网络数据和临时脚本留忽略temp，仅必要脱敏快照提交到evidence；后续源码/权重/实例变化时按影响范围重验。
