# MiniMax H3 Image

## 2026-11-14：社区量化复查与 INT8 下架

用户提供[量化模型树](https://huggingface.co/models?other=base_model:quantized:MiniMaxAI/MiniMax-H3-Image)，要求定位当前档位、选择4090候选并移除大体积入口。当前实际接入Comfy-Org的pruned W4A8 DiT（12,549,794,530 bytes，权重4bit/激活8bit）+ CPU NVFP4编码器，属于省显存档；不能把量化位数或不同运行栈的LPIPS直接当画质排名。原活动INT8约20.98GB也是量化版，真正BF16原版未接入。

| 候选 | 文件/运行路径 | 结论与下一步 |
| --- | --- | --- |
| [Abiray GGUF Q5_K_M](https://huggingface.co/Abiray/MiniMax-H3-Image-GGUF) | 14.1GB DiT，ComfyUI-GGUF | 4090下一优先质量对照，尚未本机加载；作者称敏感输入/输出/调制层保留FP32，不把“无损”宣传当实测结论 |
| 同仓Q4_K_M | 11.6GB DiT | 4K/多图更大余量的备用候选，未证明比当前W4A8更快或更好 |
| [Unsloth UD-Q4_K_XL / Q5](https://huggingface.co/unsloth/MiniMax-H3-Image-GGUF) | 13.61GB / 14.60GB，主要证据来自stable-diffusion.cpp | 有量化误差对照，但不能照搬其A100/L4显存和速度为4090/ComfyUI指标 |
| [FP8 / NVFP4](https://huggingface.co/LSDJesus/MiniMax-H3-Image-fp8-nvfp4) | 21.0GB / 12.5GB DiT | FP8在40系原生但24GB余量更紧；NVFP4原生优势主要在Blackwell，不作为4090第一候选 |
| [OrbitQuant W4A8](https://huggingface.co/WaveCut/MiniMax-H3-Image-OrbitQuant-W4A8) | 单独量化栈/节点 | 作者在Linux/Blackwell测试，模拟24GB需23.4GiB空闲；当前Windows4090不直接据此替换 |

模型文件大小不含编码器、激活或桌面占用；只换DiT不会自动消除当前CPU编码器约61GiB整机RAM峰值。GGUF接入需独立核对loader架构、config/pdd_sigmas、实际API schema及单图编辑A/B，不能仅换文件扩展名。Abiray宣称stock loader兼容；本轮读取city96主分支loader的显式架构表未见minimax，仍须验证实际文件metadata/所选节点版本。未下载新权重或改本机节点、核心、Python。

候选文件身份：[Q5文件页](https://huggingface.co/Abiray/MiniMax-H3-Image-GGUF/blob/main/MiniMax-H3-Image-Pruned-Q5_K_M.gguf)与raw LFS pointer一致，14,077,892,224 bytes，SHA256 f4e139d7aa5cd67727b6645a5b1c17d1c931f7289d46a3b1ea183d7a9b8ce44b，文件页commit615cf02；Q4为11,573,106,304 bytes，SHA256 e545379320e533f9d60e2d831a9489d94889158e88cd681ea7940da47882015f，commit08b1227。完整revision在实际接入时再固定，本轮只作为候选记录。

已按用户意图退休INT8活动条目，W4A8显式保持active；共享替代映射只迁移未提交草稿/默认值和History继续编辑，不改旧queue/history身份。保留旧INT8 adapter供已排队任务执行。新回归覆盖两次store重启后W4A8/native-6与旧INT8队列不变；原退休视频取帧图像模型的Qwen回退不变。全仓单测3256项通过、1项无关NAS并发超时；NAS+相关7文件59项低并发复跑及7文件127项集成通过，构建含typecheck通过，440对contrast通过；未宣称完整verify命令一次通过。

真实Electron复用隔离夹具，源默认值/草稿设为旧INT8后恢复到W4A8/native-6；Create和Settings图片页均无INT8选项/卡片，缺prompt可见原因→CDP键盘补齐→实际按钮点击产生W4A8任务eaecbf51-31f3-40d0-80a0-ac7bc2088456。任务仅入队后取消，没有启动Queue/Comfy/GPU；未将本轮UI检查冒充再次生成。初次检查脚本因reload挂载竞态和未进入图片设置标签失败，修正后完整通过；此前仅入队的测试任务7a30ae2a-7acf-43e7-a738-a99721eefd44也已取消。close-fixture通过，PID249040/CDP14262清理，runtime全程stopped；原始UI和cleanup报告在gitignored夹具。未提交或打包。

## 2026-11-14：真实 W4A8 验收完成（编辑质量未通过）

用户已下载模型并授权实际测试。计划：2048文生图 → 用其输出单图改色编辑 → 4096文生图；均seed42、原生6步、同一W4A8/NVFP4/VAE组合，单任务串行。记录实际文件/History、人工图片检查、耗时和500ms采样的整卡显存峰值（包含桌面占用，不冒充进程显存）。不运行正式队列中原有6个waiting任务。

初始GPU为RTX4090 24564MiB，整卡基线约5089MiB、8%利用率；无ComfyUI监听。所选核心版本文件0.45.0。启动器复制设置时漏隔离新资料库路径，首个 `temp/create-smoke-cDyG8E` 在打开资料库阶段失败、没有AppApi，未提交任务/启动runtime；确认归属后终止其PID161364。修复 `launch-create-smoke.mjs` 将libraryDirectory置于夹具并关闭LAN浏览，新夹具 `temp/create-smoke-k88KGZ`、主PID160316、CDP9406，正式状态/队列不复制。

通过AppApi启动本地ComfyUI，runtime ready/app owned；真实scan显示W4A8文件available、节点runtimeReady/runtimeVerified均true，INT8文件未安装但不阻塞W4A8。真实UI空prompt禁用→CDP键盘输入→按钮恢复→实际点击，首个2048任务ID `b91c2354-321e-4858-a457-f35a387e3b00`，仅此任务启动队列。10分钟观察超时，没有产物；GPU约22GiB/100%但约110W，三次py-spy只读栈均停在第0步、第23层的量化参数copy_from。不能把此失败算成成功出图或显存容量通过。所选源码实际为v0.45.0-6-g74eb0c4b8、干净工作树。

经AppApi暂停/取消自己的任务后停止app-owned的2个Python进程树，停止显存采样PID116964，close-fixture通过。临时py-spy仅装入gitignored项目目录，不改Comfy Python环境。上游[相似Windows/4090 DynamicVRAM挂起报告](https://github.com/Comfy-Org/ComfyUI/issues/15628)仅作诊断线索。新增仅W4A8 image使用的h3-image-w4a8运行配置，关闭DynamicVRAM/smart-memory/pinned-memory/async-offload/compiler，保留其他模型策略；兼容路径和质量边界见下方实测结果。原始报告、栈和显存CSV留在gitignored夹具。

第二轮仅关闭DynamicVRAM仍未完成首步，观察约3分40秒后取消，采样整卡峰值23611MiB；栈从时间嵌入推进到FinalLayer同步点，此观察不证明永久死锁。经AppApi停止/close-fixture清理PID67372及自有Python，停止采样PID125904。随后仅W4A8 adapter将配套NVFP4编码器固定到CPU，DiT/VAE仍在GPU；原INT8 loader device保持default。三份本机权重SHA-256全部匹配catalog。CPU路径完整verify通过（335文件3256项单测、7文件127项集成、含typecheck的构建、440对contrast）。

第三轮重启同夹具，PID153872、CDP13971。2048文生图任务 `15952697-70cf-4c75-af20-4118ece682b5` 成功：真实UI环境扫描完成后空prompt提示“请先填写图片编辑 Prompt”→键盘恢复→按钮点击→taskID；backend execution约78.7秒、应用generation统计81.555秒（不含约41秒runtime切换）；PNG解码2048×2048、3,729,009 bytes，History项目/版本可达、继续编辑按钮存在且返回列表成功。人工查看为完整蓝色茶壶、左嘴右把、白背景、无黑图；单例不代表广泛质量评估。500ms整卡采样峰值16563MiB（约16.17GiB）；应用系统内存峰值64,981,397,504 bytes，约60.5GiB，是整机观测而非进程最低要求。采样PID17208已停。

随后单图编辑任务 `7adf6a7e-d229-42c2-b4f8-d87c5f7488f0` 在上传前失败：runtime schema将LoadImage.image占位符误按已有文件枚举拒绝，后端未执行。修复仅在socket存在时允许合法IMAGE_N占位符；保留缺socket、其他enum与上传后占位符检查。失败夹具已暂停/close-fixture清理，采样PID45152已停。修复后单图编辑、4K文生图均实际执行完成。

最终配方为W4A8 DiT、CPU NVFP4编码器、原FP16图像VAE、原生6步；三个实际输出均经History打开/解码/返回，继续编辑操作可达。时间为应用generation统计，排除runtime启动/切换，不是多轮性能基准；4K执行末尾曾与CPU单测短暂重叠。整卡峰值来自500ms nvidia-smi，包含桌面/其他应用占用，非最低显存要求。

| 实测 | task ID | 解码尺寸 | 生成时间 | 整卡采样峰值 | 结论 |
| --- | --- | --- | --- | --- | --- |
| 文生图 | 15952697-70cf-4c75-af20-4118ece682b5 | 2048×2048 | 81.555s | 16563MiB / 16.17GiB | 蓝壶、白背景，未见明显损坏 |
| 单图改色 | 47eddbc3-b5aa-4e1b-8629-21a2af6b4f36 | 2048×2048 | 148.687s | 17169MiB / 16.77GiB | 改红且形状/构图保留；明显黑点与背景纹理，质量未通过 |
| 文生图 | d70c89d6-eb8b-4631-b74a-77abe5da6aa2 | 4096×4096 | 93.551s | 18057MiB / 17.63GiB | 原生4K PNG 17,575,432 bytes，未见编辑图同类黑点 |

编辑版本在同一项目d5f00473-65db-48a1-859c-7b105c91bcda中，父版本3655b33e-cef2-4497-94fa-b313368b7bcd → 子版本34cf7a97-531b-41dd-ac7f-845863141571，参考图已按内容hash托管。4K项目0616463b-f118-4dd5-9bd6-18cb7cf6fbe1独立。单图与4K整机RAM峰值分别约60.59/59.72GiB；不能把这些整机值推广为每台机器的最低内存。

FP32 VAE对照任务3f030d3c-2620-4b77-868b-c6d16ac0c003，同原图/提示词/seed，日志确认VAE为torch.float32；144.132s完成，仍有几乎相同伪影。未保留无收益的FP32启动项，不据此断言根因必然是量化。只读比较所选HEAD与本地v0.45.2标签，H3 model/VAE/conditioning/supported_models无差异，0.45.2相关修复是nodes_video位深问题；未改动用户核心或Python环境。原INT8权重未安装、多图/4K参考编辑、取消后复用同一GPU进程及广泛画质仍未验证。

最终交付为patch：保留专用兼容profile、CPU编码器、LoadImage预检修复及Harness资料库隔离；三语W4A8卡片同步已测范围、约61GiB整机内存峰值和编辑伪影。完整verify两轮通过；上传修复后的完整单测曾有一次无关NAS临时文件rename EPERM，NAS及H3相关35项低并发复跑通过。最后335文件3256项单测通过，移除FP32后focused 3文件30项、集成7文件127项、含typecheck构建与440对contrast通过；卡片文案调整补跑catalog检查和构建。未发包/提交。

夹具最后PID133540、CDP4364，经pauseQueue与close-fixture清理，runtime已由应用空队列停止；所有记录的显存采样PID已停止。报告与PNG保留在gitignored的temp/create-smoke-k88KGZ；最终构建恢复到原FP16 VAE配方。清理是Harness资源回收，不冒充原生窗口退出生命周期验收。

收尾复核：正式Documents状态仍queueRunning=false、6个waiting；8188/4364监听及最后Electron/Python/采样PID均已释放，GPU回落约3460MiB/5%。卡片与model-catalog共15项检查通过，最终含typecheck的build通过，限定diff --check通过；恢复原CRLF行尾，未清理/暂存/提交其他脏文件。

## 2026-11-13：Desktop 0.45.2 推荐与 Kitchen 误报

用户已升级 Desktop，要求推荐线对齐0.45.2，并报告0.2.41带cuda后端仍提示缺少0.2.40。根因为检测只允许推荐版本精确相等或0.2.39；安装器也按精确相等判断修复。推荐核心改0.45.2、Kitchen安装目标改0.2.41，兼容检测保持0.2.39为下限并要求CUDA13+及cuda后端。安装器使用同一就绪判断，修复时保留更高已装版本；不重装用户环境，不改变工作流最低版本。

来源：[ComfyUI v0.45.2 requirements](https://github.com/Comfy-Org/ComfyUI/blob/v0.45.2/requirements.txt)明确固定comfy-kitchen==0.2.41；[Kitchen 0.2.41](https://github.com/Comfy-Org/comfy-kitchen/releases/tag/v0.2.41)。本机通过应用Documents设置解析选中Python并运行现有只读探针：Python3.12.11、Torch2.10.0+cu130、CUDA13.0、Kitchen0.2.41、backends包含cuda，probe complete。所选核心源码版本文件为0.45.0，配置端点连接拒绝；不能把Desktop升级声明等同于当前所选源码或运行中核心已经0.45.2。不切换用户安装路径、不启动或终止运行时。

验证完成：`environment.test.ts`、`workflow-metadata.test.ts`、`attention-install-localization.test.ts`、`settings-catalog-localization.test.ts` 共4文件102项通过，包含更高已装版本不触发Kitchen重装、修复时不降级、0.2.41带多后端列表就绪及缺CUDA拒绝。typecheck通过；用户应用正从项目dist运行，因此通过Vite API覆盖 `emptyOutDir:false` 构建renderer/web，再tsc编译Electron，未执行clean或清理旧hashed资源，未触动其队列/草稿或关闭用户进程。440对文字对比度检查、限定diff检查通过。最终编译产物读取本机真实probe，返回recommendedCore=0.45.2、recommendedKitchen=0.2.41、cudaReady=true；新代码需应用下次启动并重新扫描后进入其运行态。本轮为版本/探针逻辑修复，未重复此前全仓验证，也未声称GPU生成或CUDA算子性能已验。

## 2026-11-12：4090 优先 W4A8

用户要求采用社区省显存方案。新增独立 `minimax-h3-image-w4a8`，优先于原 INT8 选项展示，不迁移旧 ID 或替换旧队列。使用社区已测的 Comfy-Org W4A8 DiT + NVFP4 AWQ 编码器 + 原图像 VAE，仍由原生节点分阶段加载/按 ComfyUI 显存管理卸载；不改全局 launch/offload 策略，不增加第三方节点。新旧型号共用提示词、32px 尺寸、4K 和 16 图编辑/History 控件；W4A8 强制配套 NVFP4 编码器，缺失时明确拒绝，不悄悄加载 INT8 编码器。

权重：Comfy-Org/MiniMax-H3-Image `35a0b704c06446f5292e3f50e03a5f5620496c2d`，`diffusion_models/minimax_h3_image_pruned_w4a8.safetensors`，12,549,794,530 bytes，SHA-256 `517cc19b85348386f4df7c806dce80d839d0899e7cdaa3e1dbb09de964381dbb`。HF API 与本机 TLS 连接失败后，经 HF 文件页、固定 commit 和 raw LFS pointer 三处核对；不下载大权重。

证据：[W4A8 上传 commit](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/commit/35a0b704c06446f5292e3f50e03a5f5620496c2d)、[社区实测卡片](https://huggingface.co/Woovee/MiniMax-H3-Image-LowVRAM)。后者报告 4090 2048×2048 单参考编辑 sampled peak 22,975 MiB，是作者观测，不是本机测量或最低要求；4K/多图显存未证明。社区指定核心 commit `989d93d0d968e704c589ce0146bb18c77f6b50cc` 与 v0.45.0 经 GitHub compare 确认 identical（ahead/behind 均0），仍保留实际 schema 和文件检查。默认无源画布为2048，显式4K选择不降级、不设新显存硬门槛。

本轮验证：`test:unit -- --maxWorkers=2` 333文件3233项通过，`test:integration` 7文件127项通过，`build`（含typecheck）与440对文字对比度检查通过，限定diff检查通过。新增测试确认W4A8/NVFP4配套扫描、优先排序、原INT8任务不换权重、W4A8提交使用其真实文件及缺编码器拒绝，以及两个型号的真实DOM缺prompt恢复→按钮点击→队列尺寸快照；外部端口为合成，不算GPU证据。

隔离Electron夹具 `temp/create-smoke-l1Me5o`：实际AppApi准备W4A8草稿并点击图片模式，1280×800/1440×900确认W4A8排在INT8前、2048×2048画布、隐藏质量切换、16图容量及无横向溢出；环境扫描期间提交保持禁用，未提交任务或伪造就绪。截图 `temp/h3-image/w4a8-ui-*.png` 不提交。`close-fixture-smoke` 通过，本轮PID70972、CDP8907、端口41985已释放，runtime始终stopped。未升级核心、下载权重或加载GPU；GPU/实际History输出仍待升级后验收。

## 原始接入与证据

用户已授权完整准备图像模型界面、工作流、官方提示词 Skill 与 4K 尺寸；ComfyUI Desktop 尚未升级。当前完成 catalog / adapter / UI / static task 层，真实 runtime / output 待 0.45.0+ 验收。

- 新 ID `minimax-h3-image`；旧 H3 图片退休 ID 继续只读，不恢复旧视频取帧方案。
- Settings 通过现有 catalog 展示三语卡片、下载路径、文件校验身份及离线扫描。INT8 与 NVFP4 AWQ 编码器为替代组，已有 H3 同名文件可复用；图像 DiT/VAE 独立。
- 注册独立 adapter，原生 Euler / Simple / 6 steps / CFG 1；文生图及最多 16 图编辑，VAE 和 conditioning latent 独立，无视频采样/加速继承。按真实 /object_info 解析安装目录中的共享编码器与模型名，核心版本、loader enum、输入 socket 在上传前验证。
- 模型界面隐藏质量切换/LoRA/Paint/Mask；支持 Seed、批量、比例、32px 对齐和 4096 短边，原生约 16MP（21:9 可选）。草稿恢复、UI、队列尺寸一致，History 重新编辑保留最多 15 张辅助参考。旧 H3 图片退休 ID 保持不变。
- 官方 `h3-image-prompt-writing` T2I/Edit 指南固定于 MiniMax-AI/MiniMax-H3-Image `6ea7b9e55523a2177e4f759db372065ba6089510`，完整参考指南转为 Prompt Pack 文本；应用增强按是否有图选择指南，遵守英文视觉叙述、原语言文字和 Picture/Subject 保留关系。Strata / Comfy 多模态增强对该模型支持 16 图。许可在 `licenses/MiniMax-H3-Image.txt`，资源打包配置同步；未执行打包。
- 下一阶段：用户升级 Desktop 核心并补齐图像 DiT/VAE 后，用应用启动所选 runtime，复扫文件/schema；真实按钮入队，先最小出图再验证多图/4K/History、显存、取消和质量。没有下载权重、升级核心或占用 GPU。

验证完成（代码/静态/UI 层）：

- 首次 `npm.cmd run verify` 在单测阶段遇到 1 项新卡片英文标签遗漏（已修复）及 3 项进程竞争超时。使用 `npm.cmd run test:unit -- --maxWorkers=2` 复跑：333 文件、3228 项通过；`npm.cmd run test:integration`：7 文件、127 项通过。
- 后续尺寸/比例修正：图片 focused 4 文件、96 项通过；最终错误提示/输入门槛修正：4 文件、43 项通过。新增覆盖 16 图、稳定编号编译、上传占位符、INT8 子目录解析、loader enum、旧核心上传前拒绝、4096 草稿/队列、6272×2688 和 History 辅助参考保留。UI 正向按钮入队是生产 DOM + 合成外部端口证据，不冒充真实 Electron 文件预检或 GPU。
- 最终 `npm.cmd run build` 通过（包含 typecheck），`npm.cmd run verify:ux-ui-contrast` 440 对通过；限定差异 `git diff --check` 通过。完整 gate 分项完成，未声称首次 `verify` 命令成功。
- 隔离 Electron `temp/create-smoke-OzS3K8`，使用空核心目录/独立端口，真实 AppApi 准备 H3 草稿并点击图片模式；1440×900、1280×800 截图确认 16 图容量、4096 尺寸、21:9、质量控件隐藏及无横向溢出。缺核心/文件时按钮保持阻塞，未伪造就绪或提交。截图在 `temp/h3-image/ui-*.png`，不提交。
- `close-fixture-smoke.mjs` 通过；本次 PID 69524、CDP 4408 和端口 41985 已释放。运行时始终 stopped，未启动 ComfyUI / 下载权重 / 加载 GPU 模型。真实核心尚不支持本模型，出图、质量、显存、取消及实际 History 输出留待升级后验收。

工作流源码证据：ComfyUI `4d64a8bc072b81c9b47321789b4d83fb7348ae2a` 的 `comfy_extras/nodes_minimax_h3.py`（MiniMaxH3ImageConditioning），官方模板树 `a8bc07a76478dfada740fa8fa49ac87be1bff519` 的 `templates/image_minimax_h3_image_edit.json`。应用构建动态 API 图，不将 ComfyUI 前端模板误当 API payload。

来源（2026-11-11）：[官方模型卡](https://huggingface.co/MiniMaxAI/MiniMax-H3-Image)、[ComfyUI 教程](https://docs.comfy.org/tutorials/image/minimax/minimax-h3-image)、[固定文件清单](https://huggingface.co/Comfy-Org/MiniMax-H3-Image/tree/892de7cb61df49753bf15145a711154803a355cb)。文件 bytes / LFS SHA-256 由 HF API 查询后写入 catalog；许可采用图像版独立社区协议。提示词扩写是可选能力，尚未加入下载依赖。
