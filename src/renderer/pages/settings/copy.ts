import type { ModelScanProfile, UiLocale } from "../../../types";

type SettingsCopyKey =
  | "video.title"
  | "model.meta.llamaReady"
  | "model.meta.multimodalReady"
  | "model.meta.qwenReady"
  | "model.meta.gemmaReady"
  | "model.meta.nativeReady"
  | "model.meta.llamaDependency"
  | "model.meta.multimodalDependency"
  | "model.meta.qwenDependency"
  | "model.meta.gemmaDependency"
  | "model.meta.nativeDependency"
  | "model.meta.nodesMissing"
  | "model.meta.runtimeMissing"
  | "model.meta.runtimeMissingHint"
  | "model.meta.fileReady"
  | "model.meta.workflowPending"
  | "model.meta.llamaMissing"
  | "model.meta.multimodalMissing"
  | "model.meta.qwenMissing"
  | "model.meta.nativeMissing"
  | "model.meta.genericMissing"
  | "model.component.optional"
  | "model.component.alternativeAvailable"
  | "model.component.viewInfo"
  | "video.description"
  | "video.defaultModel"
  | "video.defaultExtensionModel"
  | "video.missingComponent"
  | "video.workflowPending"
  | "video.scanning"
  | "video.summary"
  | "video.waitingScan"
  | "video.empty"
  | "sulphur.title"
  | "sulphur.description"
  | "sulphur.badge"
  | "sulphur.transformer"
  | "sulphur.resolution"
  | "sulphur.frames"
  | "sulphur.framesUnit"
  | "sulphur.timeout"
  | "sulphur.recommended"
  | "sulphur.slower"
  | "sulphur.longer"
  | "sulphur.fastStop"
  | "sulphur.verySlow"
  | "sulphur.note"
  | "lora.title"
  | "lora.description"
  | "lora.available"
  | "lora.details"
  | "lora.empty"
  | "image.title"
  | "image.description"
  | "image.defaultModel"
  | "image.defaultQuality"
  | "image.defaultCount"
  | "image.countUnit"
  | "image.empty"
  | "prompt.title"
  | "prompt.description"
  | "prompt.badge"
  | "prompt.defaultModel"
  | "prompt.missingComponent"
  | "prompt.videoImage"
  | "prompt.language"
  | "prompt.followInput"
  | "prompt.chinese"
  | "prompt.english"
  | "prompt.creativity"
  | "prompt.restrained"
  | "prompt.balanced"
  | "prompt.rich"
  | "prompt.scanning"
  | "prompt.summary"
  | "prompt.waitingScan"
  | "prompt.note"
  | "prompt.runtimeTitle"
  | "prompt.runtimeDescription"
  | "prompt.runtimeReady"
  | "prompt.runtimeMissing"
  | "prompt.runtimeCpu"
  | "prompt.runtimeUnknown"
  | "prompt.runtimeWaiting"
  | "prompt.runtimePython"
  | "prompt.runtimeTorch"
  | "prompt.runtimeInstall"
  | "prompt.runtimeRepair"
  | "prompt.runtimeInstalling"
  | "prompt.runtimeLog"
  | "prompt.runtimeNodeMissing"
  | "prompt.runtimeQwenNodeReady"
  | "prompt.runtimeQwenNodeMissing"
  | "prompt.runtimeQwenHint"
  | "prompt.runtimeQwenTitle"
  | "prompt.runtimeQwenBase"
  | "prompt.runtimeQwenBaseReady"
  | "prompt.runtimeQwenBaseMissing"
  | "prompt.runtimeQwenNode"
  | "prompt.runtimeQwenNodeLoaded"
  | "prompt.runtimeQwenNodeInstalled"
  | "prompt.runtimeQwenNodeMissingAction"
  | "prompt.videoPresetTitle"
  | "prompt.videoPresetDescription"
  | "prompt.restore"
  | "prompt.currentPreset"
  | "prompt.ruleHeader"
  | "prompt.h3Note"
  | "prompt.autoVideoPresetTitle"
  | "prompt.autoVideoPresetDescription"
  | "prompt.autoVideoPresetSelection"
  | "prompt.autoVideoPresetRandom"
  | "prompt.autoVideoPresetRandomHint"
  | "prompt.autoVideoPresetRule"
  | "prompt.autoVideoPresetNote"
  | "prompt.imagePresetTitle"
  | "prompt.imagePresetDescription"
  | "prompt.imageNote"
  | "prompt.empty"
  | "upscale.title"
  | "upscale.description"
  | "upscale.defaultModel"
  | "upscale.seedWeight"
  | "upscale.realesrganWeight"
  | "upscale.missingComponent"
  | "upscale.scanning"
  | "upscale.summary"
  | "upscale.waitingScan"
  | "upscale.empty"
  | "nodes.title"
  | "nodes.description"
  | "nodes.h3AccelerationTitle"
  | "nodes.h3AccelerationBadge"
  | "nodes.h3AccelerationDescription"
  | "nodes.h3AccelerationTarget"
  | "nodes.installNote"
  | "nodes.installAll"
  | "nodes.installMissing"
  | "nodes.updateAvailable"
  | "nodes.updateAll"
  | "nodes.loaded"
  | "nodes.notChecked"
  | "nodes.processing"
  | "nodes.waitingPosition"
  | "nodes.finalizing"
  | "nodes.llamaTitle"
  | "nodes.llamaBadge"
  | "nodes.llamaDescription"
  | "nodes.pythonEnvironment"
  | "nodes.installLog"
  | "nodes.installed"
  | "nodes.notInstalled"
  | "nodes.installing"
  | "nodes.reinstall"
  | "nodes.oneClickInstall"
  | "nodes.projectRequired"
  | "nodes.optional"
  | "nodes.manualInstall"
  | "nodes.manualInstallHint"
  | "nodes.openSource"
  | "nodes.prerequisite"
  | "nodes.localVersion"
  | "nodes.versionSource"
  | "nodes.revision"
  | "nodes.versionUnread"
  | "nodes.latestRelease"
  | "nodes.recommendedVersion"
  | "nodes.rescanOnline"
  | "nodes.runtimeMemory"
  | "nodes.needsUpdate"
  | "nodes.compatibilityWarning"
  | "nodes.compatibilityError"
  | "nodes.runtimeVerified"
  | "nodes.runtimeMissing"
  | "nodes.fileCheckPassed"
  | "nodes.installedRepair"
  | "nodes.updateRestart"
  | "nodes.updateRecheck"
  | "nodes.installRestart"
  | "nodes.repair"
  | "nodes.update"
  | "nodes.uninstall"
  | "nodes.moreActions"
  | "nodes.duplicateCopies"
  | "nodes.empty"
  | "accel.title"
  | "accel.description"
  | "accel.eagerFallback"
  | "accel.strategyTitle"
  | "accel.strategyDescription"
  | "accel.videoVaeTitle"
  | "accel.videoVaeDescription"
  | "accel.videoVaeMode"
  | "accel.videoVaeModeTip"
  | "accel.videoVaeAuto"
  | "accel.videoVaeFp16"
  | "accel.videoVaeInt8"
  | "accel.videoVaeMissing"
  | "accel.videoVaeWaiting"
  | "accel.videoVaeFp16Only"
  | "accel.videoVaeInt8Only"
  | "accel.videoVaeBoth"
  | "accel.runtimeTitle"
  | "accel.runtimeDescription"
  | "accel.componentsTitle"
  | "accel.componentsDescription"
  | "accel.ready"
  | "accel.pending"
  | "accel.unsupported"
  | "accel.mode"
  | "accel.modeTip"
  | "accel.modeSage"
  | "accel.modeSageTip"
  | "accel.modeSageTriton"
  | "accel.modeSageTritonTip"
  | "accel.modePytorch"
  | "accel.modePytorchTip"
  | "accel.auto"
  | "accel.stable"
  | "accel.compatible"
  | "accel.waitingScan"
  | "accel.fallbackLabel"
  | "accel.fallback"
  | "accel.python"
  | "accel.pythonUseTip"
  | "accel.pythonUse"
  | "accel.currentPath"
  | "accel.scanFill"
  | "accel.chooseFile"
  | "accel.candidates"
  | "accel.scanning"
  | "accel.chooseInterpreter"
  | "accel.noPython"
  | "accel.current"
  | "accel.notFound"
  | "accel.unknown"
  | "accel.notInstalled"
  | "accel.noWheel"
  | "accel.runtimePython"
  | "accel.runtimePythonTip"
  | "accel.runtimeTorch"
  | "accel.runtimeTorchTip"
  | "accel.runtimeSage"
  | "accel.runtimeSageTip"
  | "accel.runtimeKj"
  | "accel.runtimeKjTip"
  | "accel.cuda"
  | "accel.sm"
  | "accel.kjAvailable"
  | "accel.kjUpdate"
  | "accel.kjMissing"
  | "accel.installing"
  | "accel.repair"
  | "accel.install"
  | "accel.stopComfy"
  | "accel.restartComfy"
  | "accel.desktopTorchTitle"
  | "accel.desktopTorchHint"
  | "accel.preparing"
  | "accel.progress"
  | "accel.log"
  | "accel.sourceSelected"
  | "accel.sourceComfyVenv"
  | "accel.sourceEmbedded"
  | "accel.sourcePath"
  | "accel.sourceLauncher"
  | "accel.sourceOther"
  | "accel.autoDetect"
  | "shared.recommended"
  | "shared.slower"
  | "shared.fast"
  | "shared.longer"
  | "shared.listSeparator"
  | "shared.labelSeparator";

type Params = Record<string, string | number>;

type SettingsCopyCatalog = Record<SettingsCopyKey, string>;

const zhCN: SettingsCopyCatalog = {
  "video.title": "视频模型",
  "model.meta.llamaReady": "GGUF + mmproj 文件完整；由应用自管理 llama-server",
  "model.meta.multimodalReady": "LLM GGUF + mmproj 文件完整；通过 ComfyUI MultiModal Prompt Nodes 处理 H3 提示词",
  "model.meta.qwenReady": "Qwen3-VL 8B + PEFT LoRA 文件完整；通过 ComfyUI Qwen-VL LoRA 处理 H3 提示词",
  "model.meta.gemmaReady": "LLM GGUF + mmproj 文件已就绪；通过 ComfyUI Prompt Writer 处理视频和图片提示词",
  "model.meta.nativeReady": "ComfyUI text_encoders 文件已就绪；可通过原生 TextGenerate 进行本地扩写",
  "model.meta.llamaDependency": "由应用自管理 llama-server",
  "model.meta.multimodalDependency": "通过 ComfyUI MultiModal Prompt Nodes 处理 H3 提示词",
  "model.meta.qwenDependency": "通过 ComfyUI Qwen-VL LoRA 处理 H3 提示词",
  "model.meta.gemmaDependency": "通过 ComfyUI Prompt Writer 处理视频和图片提示词",
  "model.meta.nativeDependency": "通过原生 TextGenerate 进行本地扩写",
  "model.meta.nodesMissing": "缺少节点：{nodes}",
  "model.meta.runtimeMissing": "缺少运行节点：{nodes}",
  "model.meta.runtimeMissingHint": "请启动 ComfyUI 后重新扫描",
  "model.meta.fileReady": "文件扫描通过，可用于配置",
  "model.meta.workflowPending": "依赖已完整；生成工作流将在下一阶段接入",
  "model.meta.llamaMissing": "补齐 GGUF + mmproj，并配置 llama-server.exe 后才能使用",
  "model.meta.multimodalMissing": "补齐 Qwen3.6 GGUF、mmproj 与 MultiModal Prompt Nodes 后才能接入本地扩写",
  "model.meta.qwenMissing": "补齐 Qwen3-VL 8B 基座、H3 Prompt Rewriter LoRA 与 Qwen-VL LoRA 节点后才能使用",
  "model.meta.nativeMissing": "补齐对应的 ComfyUI text_encoders 文件后才能接入本地扩写",
  "model.meta.genericMissing": "补齐所有必需组件后才能启用",
  "model.component.optional": "可选，4 步 Lightning 档需要：",
  "model.component.alternativeAvailable": "备选未安装（当前使用其他组件）：",
  "model.component.viewInfo": "查看 {label} 的{info}",
  "video.description": "根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。",
  "video.defaultModel": "默认模型",
  "video.defaultExtensionModel": "默认续写模型",
  "video.missingComponent": " · 缺组件",
  "video.workflowPending": " · 工作流待接入",
  "video.scanning": "正在扫描模型目录…",
  "video.summary": "找到 {available} 个已接入可运行模型，{pending} 个缺组件或等待工作流接入",
  "video.waitingScan": "等待首次扫描",
  "video.empty": "尚无模型扫描结果",
  "sulphur.title": "Sulphur 2 部署",
  "sulphur.description": "同一档位同时决定普通 I2V、原生 Extend、模型扫描和新任务快照。",
  "sulphur.badge": "分离式 GGUF",
  "sulphur.transformer": "Transformer 量化档",
  "sulphur.resolution": "基准分辨率",
  "sulphur.frames": "每段新增模型帧",
  "sulphur.framesUnit": "帧",
  "sulphur.timeout": "单节点等待上限",
  "sulphur.recommended": "推荐",
  "sulphur.slower": "较慢",
  "sulphur.longer": "较长",
  "sulphur.fastStop": "快速止损",
  "sulphur.verySlow": "极慢设备",
  "sulphur.note": "Q2 使用 distilled 模型且不加载 LoRA；Q3/Q4 使用 dev 模型和 distill LoRA。三档均要求 Gemma 3、LTX 文本连接器、独立视频/音频 VAE 与 latent upscaler，并强制单任务、patch_on_device=false、--cache-none、CPU offload 和分块解码。8GB 兼容仍要求充足的系统内存与页面文件。",
  "lora.title": "LoRA 目录",
  "lora.description": "为已接入的视频模型提供可选的性能、运镜、人物和内容适配层。每张卡只保留做决策所需的信息。",
  "lora.available": "{available}/{total} 可用",
  "lora.details": "查看使用说明",
  "lora.empty": "尚无 LoRA 扫描结果",
  "image.title": "图片编辑模型",
  "image.description": "选择适合当前显存的本地图像模型；文件完整即可配置和入队，需要运行节点的工作流会在 ComfyUI 可用时验证。",
  "image.defaultModel": "默认图片模型",
  "image.defaultQuality": "默认质量档",
  "image.defaultCount": "默认生成数量",
  "image.countUnit": "张",
  "image.empty": "尚无图片模型扫描结果；请先确认模型目录后重新扫描。",
  "prompt.title": "本地提示词模型",
  "prompt.description": "统一由当前 ComfyUI 运行：Qwen 使用原生 TextGenerate，Gemma 4 使用 H3 Prompt Writer 扩展。",
  "prompt.badge": "仅依赖 ComfyUI",
  "prompt.defaultModel": "默认提示词模型",
  "prompt.missingComponent": " · 缺组件",
  "prompt.videoImage": " · 视频/图片",
  "prompt.language": "扩写语言",
  "prompt.followInput": "跟随输入语言",
  "prompt.chinese": "中文",
  "prompt.english": "英文",
  "prompt.creativity": "创造性",
  "prompt.restrained": "克制",
  "prompt.balanced": "平衡",
  "prompt.rich": "丰富",
  "prompt.scanning": "正在扫描 ComfyUI/models…",
  "prompt.summary": "文件就绪 {count} 个提示词模型档位；节点与运行要求见各模型的验证依据",
  "prompt.waitingScan": "等待首次扫描",
  "prompt.note": "Qwen3.5 Safetensors 使用 ComfyUI 官方 models/text_encoders 分类；Qwen3-VL 8B + H3 Rewriter LoRA 使用 models/LLM/Qwen-VL 与 models/LLM/Qwen-VL-LoRA 两个专用子目录；Gemma GGUF 使用大写 models/LLM/独立子目录。显式启动后模型会驻留到手动退出、开始队列或关闭应用；不需要 llama-server 或 LM Studio。",
  "prompt.runtimeTitle": "Gemma GGUF 运行依赖",
  "prompt.runtimeDescription": "H3 Prompt Writer 与可选 MultiModal 节点共用当前 ComfyUI Python 中的 llama-cpp-python；这里独立检测并安装 CUDA 后端。节点更新不会覆盖已通过自检的后端，只有点击修复时才会替换不兼容版本，请不要让两个节点各自重复安装。",
  "prompt.runtimeReady": "CUDA 后端已就绪",
  "prompt.runtimeMissing": "未安装",
  "prompt.runtimeCpu": "已安装但不是 CUDA 后端",
  "prompt.runtimeUnknown": "已安装但无法确认",
  "prompt.runtimeWaiting": "等待环境扫描",
  "prompt.runtimePython": "ComfyUI Python",
  "prompt.runtimeTorch": "PyTorch / CUDA",
  "prompt.runtimeInstall": "一键安装并自检",
  "prompt.runtimeRepair": "修复运行依赖",
  "prompt.runtimeInstalling": "正在安装并自检…",
  "prompt.runtimeLog": "运行依赖安装日志",
  "prompt.runtimeNodeMissing": "Prompt Writer 节点尚未加载；安装依赖后请重启 ComfyUI 并重新扫描。",
  "prompt.runtimeQwenNodeReady": "Qwen-VL LoRA 节点已加载；显式启动后基座和适配器会在连续增强期间保持驻留。",
  "prompt.runtimeQwenNodeMissing": "Qwen-VL LoRA 节点尚未加载；请在“节点与依赖”中安装后重启 ComfyUI 并重新扫描。",
  "prompt.runtimeQwenHint": "该模型使用 Qwen3-VL 8B + PEFT LoRA，不需要 llama-cpp-python、llama-server 或 mmproj；节点安装和 Python 依赖由 ComfyUI 管理。",
  "prompt.runtimeQwenTitle": "H3 Prompt Rewriter 运行状态",
  "prompt.runtimeQwenBase": "Qwen3-VL 8B 基座 + H3 Rewriter LoRA",
  "prompt.runtimeQwenBaseReady": "文件已找到，启动时由 ComfyUI 加载",
  "prompt.runtimeQwenBaseMissing": "请先补齐设置卡片中的基座和 LoRA 文件",
  "prompt.runtimeQwenNode": "ComfyUI Qwen-VL LoRA 节点",
  "prompt.runtimeQwenNodeLoaded": "QwenVLModelLoader · QwenVLLoRALoader · QwenVLCaption",
  "prompt.runtimeQwenNodeInstalled": "节点已安装，等待 ComfyUI 启动并验证",
  "prompt.runtimeQwenNodeMissingAction": "请在“节点与依赖”中安装",
  "prompt.videoPresetTitle": "视频提示词预设",
  "prompt.videoPresetDescription": "预设会把原始文字和参考图整理成完整的 H3 视频提示词，覆盖主体、场景、动作、镜头、声音、对白和连续性。",
  "prompt.restore": "恢复默认",
  "prompt.currentPreset": "当前编辑预设",
  "prompt.ruleHeader": "预设规则头",
  "prompt.h3Note": "规则头可自由修改；内置的 H3 官方基线会继续强制参考标签、首尾帧关系、连续性、音频和输出格式。修改后点击设置页顶部“保存设置”，创建页下次扩写立即使用。",
  "prompt.autoVideoPresetTitle": "无提示词视频预设",
  "prompt.autoVideoPresetDescription": "当 H3 Prompt 为空时，从参考画面设计动作、镜头和互动；与普通视频提示词预设分开。",
  "prompt.autoVideoPresetSelection": "默认起稿方向",
  "prompt.autoVideoPresetRandom": "自动随机轮换",
  "prompt.autoVideoPresetRandomHint": "每次清空 Prompt 后优先选择尚未使用的起稿方向，并生成新的变化。",
  "prompt.autoVideoPresetRule": "起稿指令",
  "prompt.autoVideoPresetNote": "选择具体方向后会固定创意方向，但每次点击仍会使用新的变化标识；修改后保存设置即可生效。",
  "prompt.imagePresetTitle": "图片提示词预设",
  "prompt.imagePresetDescription": "只影响图片“优化提示词”时的整理策略，不改变 Qwen Image 的生成参数。",
  "prompt.imageNote": "规则头会作为图片 Prompt 优化器的策略说明；最终发送给 Qwen Image 的 Prompt 不会包含这段设置文本。",
  "prompt.empty": "尚无提示词模型扫描结果",
  "upscale.title": "分辨率提升模型",
  "upscale.description": "模型文件完整即可进入后续提升工作流；需要专用运行节点的模型会在 ComfyUI 可用时验证。",
  "upscale.defaultModel": "默认模型",
  "upscale.seedWeight": "SeedVR2 权重",
  "upscale.realesrganWeight": "Real-ESRGAN 权重",
  "upscale.missingComponent": " · 缺组件",
  "upscale.scanning": "正在扫描模型目录…",
  "upscale.summary": "文件就绪 {available} 个，待补齐 {pending} 个；运行验证要求见各模型的验证依据",
  "upscale.waitingScan": "等待首次扫描",
  "upscale.empty": "尚无模型扫描结果",
  "nodes.title": "节点与依赖",
  "nodes.description": "管理可安装的第三方 ComfyUI 节点及其运行依赖",
  "nodes.h3AccelerationTitle": "H3 加速运行时",
  "nodes.h3AccelerationBadge": "ComfyUI Python · 共享后端",
  "nodes.h3AccelerationDescription": "统一查看并修复 H3 所需的运行时组件；只影响 MiniMax H3 工作流。",
  "nodes.h3AccelerationTarget": "目标环境：",
  "nodes.installNote": "只安装缺失、低于项目推荐版本或需要兼容修复的节点；批次完成后自动重启 ComfyUI 一次并复检。运行时未注册不会触发重复安装。",
  "nodes.installAll": "一键安装与更新",
  "nodes.installMissing": "一键安装缺失节点",
  "nodes.updateAvailable": "一键更新节点",
  "nodes.updateAll": "已达到推荐状态",
  "nodes.loaded": "已加载",
  "nodes.notChecked": "尚未启动检测",
  "nodes.processing": "处理中…",
  "nodes.waitingPosition": "排队中 · 第 {position} 个",
  "nodes.finalizing": "正在重启并复检…",
  "nodes.llamaTitle": "llama-cpp-python",
  "nodes.llamaBadge": "提示词节点依赖",
  "nodes.llamaDescription": "提供在 ComfyUI 内运行本地 GGUF 提示词模型的 Python 接口，Gemma Prompt Writer 与 MultiModal 节点都依赖它。",
  "nodes.pythonEnvironment": "目标环境：",
  "nodes.installLog": "安装日志",
  "nodes.installed": "已安装",
  "nodes.notInstalled": "未安装",
  "nodes.installing": "安装中…",
  "nodes.reinstall": "重新安装",
  "nodes.oneClickInstall": "一键安装",
  "nodes.projectRequired": "项目必需",
  "nodes.optional": "可选",
  "nodes.manualInstall": "需单独安装",
  "nodes.manualInstallHint": "此节点由用户手动安装；应用不会自动下载、更新或卸载它。",
  "nodes.openSource": "打开上游仓库",
  "nodes.prerequisite": "运行/安装说明：",
  "nodes.localVersion": "本机版本：",
  "nodes.versionSource": "扫描来源：",
  "nodes.revision": "提交：",
  "nodes.versionUnread": "未读取到版本号",
  "nodes.latestRelease": "最新发布：",
  "nodes.recommendedVersion": "推荐版本：",
  "nodes.rescanOnline": "联网后重新扫描",
  "nodes.runtimeMemory": "运行时固定使用系统内存，不额外下载模型。",
  "nodes.needsUpdate": "需要更新",
  "nodes.compatibilityWarning": "兼容性待确认",
  "nodes.compatibilityError": "兼容性错误",
  "nodes.runtimeVerified": "运行时已验证",
  "nodes.runtimeMissing": "已安装 · 运行时未注册",
  "nodes.fileCheckPassed": "文件与版本检查通过",
  "nodes.installedRepair": "已安装，需修复",
  "nodes.updateRestart": "更新并重启",
  "nodes.updateRecheck": "更新/重启复检",
  "nodes.installRestart": "安装并重启",
  "nodes.repair": "修复",
  "nodes.update": "更新",
  "nodes.uninstall": "卸载",
  "nodes.moreActions": "更多节点操作",
  "nodes.duplicateCopies": "发现多个 H3 Motion Context 副本：{paths}。请只保留一个目录，再重启 ComfyUI。",
  "nodes.empty": "等待环境扫描结果",
  "accel.title": "性能与加速",
  "accel.description": "配置 H3 Attention 与最终视频 VAE；依赖安装与修复在“节点与依赖”中完成。",
  "accel.eagerFallback": "未发现已安装后端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "选择 H3 的 Attention 后端；仅影响 MiniMax H3 工作流。",
  "accel.videoVaeTitle": "H3 视频 VAE 解码",
  "accel.videoVaeDescription": "仅影响 MiniMax H3 的最终视频解码；保存后对下一个尚未开始的 H3 任务生效，正在计算的任务不变。音频 VAE、编码和其他模型不受影响。",
  "accel.videoVaeMode": "视频 VAE 后端",
  "accel.videoVaeModeTip": "FP16 是基线；INT8 ConvRot 是实验性加速解码后端，可能存在细微画质差异，需要 ComfyUI 0.31.0+。",
  "accel.videoVaeAuto": "自动 · 优先 INT8 ConvRot",
  "accel.videoVaeFp16": "兼容模式 · FP16 基线",
  "accel.videoVaeInt8": "加速模式 · INT8 ConvRot（实验性）",
  "accel.videoVaeMissing": "未检测到 FP16 或 INT8 ConvRot 视频 VAE；设置已禁用，请先安装至少一个并重新扫描。",
  "accel.videoVaeWaiting": "等待环境扫描后读取已安装的视频 VAE。",
  "accel.videoVaeFp16Only": "当前只找到 FP16，INT8 ConvRot 选项已禁用。",
  "accel.videoVaeInt8Only": "当前只找到 INT8 ConvRot，工作流将使用实验性解码后端。",
  "accel.videoVaeBoth": "已找到两种视频 VAE；可按需切换。",
  "accel.runtimeTitle": "运行时解释器",
  "accel.runtimeDescription": "选择用于启动 ComfyUI、安装依赖和读取加速状态的 Python 环境。",
  "accel.componentsTitle": "运行时组件",
  "accel.componentsDescription": "检查 PyTorch/CUDA、H3 ConvRot 内核、SageAttention、Triton 与 KJNodes。",
  "accel.ready": "已就绪",
  "accel.pending": "待安装/修复",
  "accel.unsupported": "环境不支持",
  "accel.mode": "H3 Attention 后端",
  "accel.modeTip": "只影响 MiniMax H3 工作流；其他模型的采样和节点策略在各自的模型或工作流设置中管理。",
  "accel.modeSage": "自动加速 · SageAttention CUDA FP16",
  "accel.modeSageTip": "使用 CUDA FP16 SageAttention 内核；环境匹配时通常速度最快，但需要精确匹配的 CUDA、PyTorch 与 wheel。",
  "accel.modeSageTriton": "稳定加速 · SageAttention Triton FP16",
  "accel.modeSageTritonTip": "使用 Triton FP16 SageAttention 内核；相比 CUDA FP16 更适合作为稳定回退，仍需要 SageAttention 与 Triton 环境。",
  "accel.modePytorch": "兼容模式 · PyTorch Attention",
  "accel.modePytorchTip": "使用 PyTorch 原生 Attention；不依赖 SageAttention 或 Triton，兼容性最高，但通常速度较慢。",
  "accel.auto": "自动加速",
  "accel.stable": "稳定加速",
  "accel.compatible": "兼容模式",
  "accel.waitingScan": "等待环境扫描",
  "accel.fallbackLabel": "降级策略",
  "accel.fallback": "CUDA FP16 异常时会依次降级到 SageAttention Triton 和 PyTorch Attention，避免队列反复失败。",
  "accel.python": "ComfyUI Python 解释器",
  "accel.pythonUseTip": "此解释器用于启动 ComfyUI、安装节点依赖，并读取 H3 加速环境状态。",
  "accel.pythonUse": "服务与安装使用",
  "accel.currentPath": "当前解释器路径",
  "accel.scanFill": "扫描后自动填入可用解释器",
  "accel.chooseFile": "选择文件",
  "accel.candidates": "扫描到的候选版本",
  "accel.scanning": "正在扫描…",
  "accel.chooseInterpreter": "选择一个解释器",
  "accel.noPython": "未发现可用 Python",
  "accel.current": "当前",
  "accel.notFound": "未找到",
  "accel.unknown": "未知",
  "accel.notInstalled": "未安装",
  "accel.noWheel": "当前环境没有匹配的 wheel",
  "accel.runtimePython": "ComfyUI Python",
  "accel.runtimePythonTip": "显示当前用于启动服务和执行环境检查的 Python 版本与路径。",
  "accel.runtimeTorch": "PyTorch / CUDA",
  "accel.runtimeTorchTip": "显示选定 Python 环境中的 PyTorch、CUDA 和 GPU 架构信息。",
  "accel.runtimeSage": "SageAttention",
  "accel.runtimeSageTip": "H3 的可选 Attention 加速库；缺失时可以回退到 Triton 或 PyTorch。",
  "accel.runtimeKj": "Triton / KJNodes",
  "accel.runtimeKjTip": "显示 Triton 与 KJNodes 状态；KJNodes 还提供 H3 实时预览所需的节点。",
  "accel.cuda": "CUDA",
  "accel.sm": "SM",
  "accel.kjAvailable": "KJNodes 模型级补丁可用",
  "accel.kjUpdate": "KJNodes 需要更新",
  "accel.kjMissing": "KJNodes 未安装",
  "accel.installing": "正在升级 H3 环境…",
  "accel.repair": "一键升级/修复 H3 环境",
  "accel.install": "一键升级/安装 H3 环境",
  "accel.stopComfy": "升级会临时停止 ComfyUI，并保留升级前包快照",
  "accel.restartComfy": "程序会把低于最低要求的运行时修复到稳定的 PyTorch 2.10/cu130；满足要求的更高版本会保留，并只补齐有精确 wheel 的组件。自检后恢复此前运行的服务。",
  "accel.desktopTorchTitle": "检测到 ComfyUI Desktop",
  "accel.desktopTorchHint": "最低支持 PyTorch 2.10/cu130，2.10.0 是稳定回退。更高版本不会被静默降级，但 SageAttention 仍要求 Comfy 官方发布精确匹配的 wheel；没有 wheel 时请使用 PyTorch Attention。",
  "accel.preparing": "正在准备 H3 环境升级…",
  "accel.progress": "H3 环境升级进度",
  "accel.log": "环境安装日志",
  "accel.sourceSelected": "手动指定",
  "accel.sourceComfyVenv": "ComfyUI 虚拟环境",
  "accel.sourceEmbedded": "嵌入式 Python",
  "accel.sourcePath": "系统 PATH",
  "accel.sourceLauncher": "py 启动器",
  "accel.sourceOther": "其他来源",
  "accel.autoDetect": "自动探测",
  "shared.recommended": "推荐",
  "shared.slower": "较慢",
  "shared.fast": "快速",
  "shared.longer": "较长",
  "shared.listSeparator": "、",
  "shared.labelSeparator": "："
};

const zhTW: SettingsCopyCatalog = {
  ...zhCN,
  "video.title": "影片模型",
  "model.meta.llamaReady": "GGUF + mmproj 檔案完整；由應用程式自主管理 llama-server",
  "model.meta.multimodalReady": "LLM GGUF + mmproj 檔案完整；透過 ComfyUI MultiModal Prompt Nodes 處理 H3 提示詞",
  "model.meta.qwenReady": "Qwen3-VL 8B + PEFT LoRA 檔案完整；透過 ComfyUI Qwen-VL LoRA 處理 H3 提示詞",
  "model.meta.gemmaReady": "LLM GGUF + mmproj 檔案已就緒；透過 ComfyUI Prompt Writer 處理影片和圖片提示詞",
  "model.meta.nativeReady": "ComfyUI text_encoders 檔案已就緒；可透過原生 TextGenerate 進行本機擴寫",
  "model.meta.llamaDependency": "由應用程式自主管理 llama-server",
  "model.meta.multimodalDependency": "透過 ComfyUI MultiModal Prompt Nodes 處理 H3 提示詞",
  "model.meta.qwenDependency": "透過 ComfyUI Qwen-VL LoRA 處理 H3 提示詞",
  "model.meta.gemmaDependency": "透過 ComfyUI Prompt Writer 處理影片和圖片提示詞",
  "model.meta.nativeDependency": "透過原生 TextGenerate 進行本機擴寫",
  "model.meta.nodesMissing": "缺少節點：{nodes}",
  "model.meta.runtimeMissing": "缺少執行節點：{nodes}",
  "model.meta.runtimeMissingHint": "請啟動 ComfyUI 後重新掃描",
  "model.meta.fileReady": "檔案掃描通過，可用於設定",
  "model.meta.workflowPending": "依賴已完整；生成工作流程將在下一階段接入",
  "model.meta.llamaMissing": "補齊 GGUF + mmproj，並設定 llama-server.exe 後才能使用",
  "model.meta.multimodalMissing": "補齊 Qwen3.6 GGUF、mmproj 與 MultiModal Prompt Nodes 後才能接入本機擴寫",
  "model.meta.qwenMissing": "補齊 Qwen3-VL 8B 基座、H3 Prompt Rewriter LoRA 與 Qwen-VL LoRA 節點後才能使用",
  "model.meta.nativeMissing": "補齊對應的 ComfyUI text_encoders 檔案後才能接入本機擴寫",
  "model.meta.genericMissing": "補齊所有必要元件後才能啟用",
  "model.component.optional": "可選，4 步 Lightning 檔需要：",
  "model.component.alternativeAvailable": "替代元件未安裝（目前使用其他元件）：",
  "model.component.viewInfo": "檢視 {label} 的{info}",
  "video.description": "依據實際檔案元件判斷是否可用，不只檢查單一 checkpoint 名稱。",
  "video.defaultModel": "預設模型",
  "video.defaultExtensionModel": "預設續寫模型",
  "video.missingComponent": " · 缺少元件",
  "video.workflowPending": " · 工作流程待接入",
  "video.scanning": "正在掃描模型目錄…",
  "video.summary": "找到 {available} 個已接入可執行模型，{pending} 個缺少元件或等待工作流程接入",
  "video.waitingScan": "等待首次掃描",
  "video.empty": "尚無模型掃描結果",
  "sulphur.title": "Sulphur 2 部署",
  "sulphur.description": "同一檔位同時決定一般 I2V、原生 Extend、模型掃描與新任務快照。",
  "sulphur.badge": "分離式 GGUF",
  "sulphur.transformer": "Transformer 量化檔位",
  "sulphur.resolution": "基準解析度",
  "sulphur.frames": "每段新增模型影格",
  "sulphur.framesUnit": "影格",
  "sulphur.timeout": "單節點等待上限",
  "sulphur.note": "Q2 使用 distilled 模型且不載入 LoRA；Q3/Q4 使用 dev 模型與 distill LoRA。三檔均要求 Gemma 3、LTX 文字連接器、獨立影音 VAE 與 latent upscaler，並強制單一任務、patch_on_device=false、--cache-none、CPU offload 與分塊解碼。8GB 相容仍需要足夠的系統記憶體與分頁檔。",
  "lora.title": "LoRA 目錄",
  "lora.description": "為已接入的影片模型提供可選的效能、運鏡、人物和內容適配層。每張卡只保留做決策所需的資訊。",
  "lora.available": "{available}/{total} 可用",
  "lora.details": "查看使用說明",
  "lora.empty": "尚無 LoRA 掃描結果",
  "image.title": "圖片編輯模型",
  "image.description": "選擇適合目前顯存的本機圖片模型；檔案完整即可設定和入列，需要執行節點的工作流程會在 ComfyUI 可用時驗證。",
  "image.defaultModel": "預設圖片模型",
  "image.defaultQuality": "預設品質檔位",
  "image.defaultCount": "預設生成數量",
  "image.countUnit": "張",
  "image.empty": "尚無圖片模型掃描結果；請先確認模型目錄後重新掃描。",
  "prompt.title": "本機提示詞模型",
  "prompt.description": "統一由目前的 ComfyUI 執行：Qwen 使用原生 TextGenerate，Gemma 4 使用 H3 Prompt Writer 擴充。",
  "prompt.badge": "僅依賴 ComfyUI",
  "prompt.defaultModel": "預設提示詞模型",
  "prompt.missingComponent": " · 缺少元件",
  "prompt.videoImage": " · 影片/圖片",
  "prompt.language": "擴寫語言",
  "prompt.followInput": "跟隨輸入語言",
  "prompt.chinese": "中文",
  "prompt.english": "英文",
  "prompt.creativity": "創造性",
  "prompt.restrained": "克制",
  "prompt.balanced": "平衡",
  "prompt.rich": "豐富",
  "prompt.scanning": "正在掃描 ComfyUI/models…",
  "prompt.summary": "檔案就緒 {count} 個提示詞模型檔位；節點與執行要求見各模型的驗證依據",
  "prompt.waitingScan": "等待首次掃描",
  "prompt.note": "Qwen3.5 Safetensors 使用 ComfyUI 官方 models/text_encoders 分類；Qwen3-VL 8B + H3 Rewriter LoRA 使用 models/LLM/Qwen-VL 與 models/LLM/Qwen-VL-LoRA 兩個專用子目錄；Gemma GGUF 使用大寫 models/LLM 獨立子目錄。明確啟動後模型會駐留到手動退出、開始佇列或關閉應用程式；不需要 llama-server 或 LM Studio。",
  "prompt.runtimeQwenTitle": "H3 Prompt Rewriter 執行狀態",
  "prompt.runtimeQwenBase": "Qwen3-VL 8B 基座 + H3 Rewriter LoRA",
  "prompt.runtimeQwenBaseReady": "檔案已找到，啟動時由 ComfyUI 載入",
  "prompt.runtimeQwenBaseMissing": "請先補齊設定卡片中的基座和 LoRA 檔案",
  "prompt.runtimeQwenNode": "ComfyUI Qwen-VL LoRA 節點",
  "prompt.runtimeQwenNodeLoaded": "QwenVLModelLoader · QwenVLLoRALoader · QwenVLCaption",
  "prompt.runtimeQwenNodeInstalled": "節點已安裝，等待 ComfyUI 啟動並驗證",
  "prompt.runtimeQwenNodeMissingAction": "請在「節點與工作流」中安裝",
  "prompt.videoPresetTitle": "影片提示詞預設",
  "prompt.videoPresetDescription": "預設會將原始文字與參考圖整理成完整的 H3 影片提示詞，涵蓋主體、場景、動作、鏡頭、聲音、對白與連續性。",
  "prompt.restore": "還原預設",
  "prompt.currentPreset": "目前編輯預設",
  "prompt.ruleHeader": "預設規則標頭",
  "prompt.h3Note": "規則標頭可自由修改；內建 H3 官方基線仍會強制參考標籤、首尾影格關係、連續性、音訊與輸出格式。修改後點擊設定頁頂端的「儲存設定」，建立頁下次擴寫立即使用。",
  "prompt.autoVideoPresetTitle": "無提示詞影片預設",
  "prompt.autoVideoPresetDescription": "當 H3 Prompt 為空時，根據參考畫面設計動作、鏡頭和互動；與一般影片提示詞預設分開。",
  "prompt.autoVideoPresetSelection": "預設起稿方向",
  "prompt.autoVideoPresetRandom": "自動隨機輪換",
  "prompt.autoVideoPresetRandomHint": "每次清空 Prompt 後優先選擇尚未使用的起稿方向，並產生新的變化。",
  "prompt.autoVideoPresetRule": "起稿指令",
  "prompt.autoVideoPresetNote": "選擇具體方向後會固定創意方向，但每次點擊仍會使用新的變化標識；修改後儲存設定即可生效。",
  "prompt.imagePresetTitle": "圖片提示詞預設",
  "prompt.imagePresetDescription": "只影響圖片「最佳化提示詞」時的整理策略，不改變 Qwen Image 的生成參數。",
  "prompt.imageNote": "規則標頭會作為圖片 Prompt 最佳化器的策略說明；最後傳給 Qwen Image 的 Prompt 不會包含這段設定文字。",
  "prompt.empty": "尚無提示詞模型掃描結果",
  "upscale.title": "解析度提升模型",
  "upscale.description": "模型檔案完整即可進入後續提升工作流程；需要專用執行節點的模型會在 ComfyUI 可用時驗證。",
  "upscale.defaultModel": "預設模型",
  "upscale.seedWeight": "SeedVR2 權重",
  "upscale.realesrganWeight": "Real-ESRGAN 權重",
  "upscale.missingComponent": " · 缺少元件",
  "upscale.scanning": "正在掃描模型目錄…",
  "upscale.summary": "檔案就緒 {available} 個，待補齊 {pending} 個；執行驗證要求見各模型的驗證依據",
  "upscale.waitingScan": "等待首次掃描",
  "upscale.empty": "尚無模型掃描結果",
  "nodes.title": "節點與依賴",
  "nodes.description": "管理可安裝的第三方 ComfyUI 節點及其執行依賴",
  "nodes.h3AccelerationTitle": "H3 加速執行時",
  "nodes.h3AccelerationBadge": "ComfyUI Python · 共用後端",
  "nodes.h3AccelerationDescription": "統一查看並修復 H3 所需的執行元件；只影響 MiniMax H3 工作流程。",
  "nodes.h3AccelerationTarget": "目標環境：",
  "nodes.installNote": "只安裝缺少、低於專案建議版本或需要相容性修復的節點；批次完成後自動重新啟動 ComfyUI 一次並複檢。執行階段未註冊不會觸發重複安裝。",
  "nodes.installAll": "一鍵安裝與更新",
  "nodes.installMissing": "一鍵安裝缺少節點",
  "nodes.updateAvailable": "一鍵更新節點",
  "nodes.updateAll": "已達到建議狀態",
  "nodes.loaded": "已載入",
  "nodes.notChecked": "尚未啟動檢測",
  "nodes.processing": "處理中…",
  "nodes.waitingPosition": "排隊中 · 第 {position} 個",
  "nodes.finalizing": "正在重新啟動並複檢…",
  "nodes.llamaTitle": "llama-cpp-python",
  "nodes.llamaBadge": "提示詞節點依賴",
  "nodes.llamaDescription": "提供在 ComfyUI 內執行本機 GGUF 提示詞模型的 Python 介面，Gemma Prompt Writer 與 MultiModal 節點都依賴它。",
  "nodes.pythonEnvironment": "目標環境：",
  "nodes.installLog": "安裝記錄",
  "nodes.installed": "已安裝",
  "nodes.notInstalled": "未安裝",
  "nodes.installing": "安裝中…",
  "nodes.reinstall": "重新安裝",
  "nodes.oneClickInstall": "一鍵安裝",
  "nodes.projectRequired": "專案必要",
  "nodes.optional": "選用",
  "nodes.manualInstall": "需單獨安裝",
  "nodes.manualInstallHint": "此節點由使用者手動安裝；應用程式不會自動下載、更新或解除安裝。",
  "nodes.openSource": "開啟上游儲存庫",
  "nodes.prerequisite": "執行/安裝說明：",
  "nodes.localVersion": "本機版本：",
  "nodes.versionSource": "掃描來源：",
  "nodes.revision": "提交：",
  "nodes.versionUnread": "未讀取到版本號",
  "nodes.latestRelease": "最新發布：",
  "nodes.recommendedVersion": "建議版本：",
  "nodes.rescanOnline": "連線後重新掃描",
  "nodes.runtimeMemory": "執行時固定使用系統記憶體，不額外下載模型。",
  "nodes.needsUpdate": "需要更新",
  "nodes.compatibilityWarning": "相容性待確認",
  "nodes.compatibilityError": "相容性錯誤",
  "nodes.runtimeVerified": "執行時已驗證",
  "nodes.runtimeMissing": "已安裝 · 執行階段未註冊",
  "nodes.fileCheckPassed": "檔案與版本檢查通過",
  "nodes.installedRepair": "已安裝，需要修復",
  "nodes.updateRestart": "更新並重新啟動",
  "nodes.updateRecheck": "更新/重新啟動複檢",
  "nodes.installRestart": "安裝並重新啟動",
  "nodes.repair": "修復",
  "nodes.update": "更新",
  "nodes.uninstall": "解除安裝",
  "nodes.moreActions": "更多節點操作",
  "nodes.duplicateCopies": "發現多個 H3 Motion Context 副本：{paths}。請只保留一個資料夾，再重新啟動 ComfyUI。",
  "nodes.empty": "等待環境掃描結果",
  "accel.title": "效能與加速",
  "accel.description": "設定 H3 Attention 與最終影片 VAE；依賴安裝與修復在「節點與依賴」中完成。",
  "accel.eagerFallback": "未發現已安裝後端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "選擇 H3 的 Attention 後端；只影響 MiniMax H3 工作流程。",
  "accel.videoVaeTitle": "H3 影片 VAE 解碼",
  "accel.videoVaeDescription": "只影響 MiniMax H3 的最終影片解碼；儲存後對下一個尚未開始的 H3 工作生效，正在計算的工作不變。音訊 VAE、編碼與其他模型不受影響。",
  "accel.videoVaeMode": "影片 VAE 後端",
  "accel.videoVaeModeTip": "FP16 是基線；INT8 ConvRot 是實驗性加速解碼後端，可能存在細微畫質差異，需要 ComfyUI 0.31.0+。",
  "accel.videoVaeAuto": "自動 · 優先 INT8 ConvRot",
  "accel.videoVaeFp16": "相容模式 · FP16 基線",
  "accel.videoVaeInt8": "加速模式 · INT8 ConvRot（實驗性）",
  "accel.videoVaeMissing": "未偵測到 FP16 或 INT8 ConvRot 影片 VAE；設定已停用，請先安裝至少一個並重新掃描。",
  "accel.videoVaeWaiting": "等待環境掃描後讀取已安裝的影片 VAE。",
  "accel.videoVaeFp16Only": "目前只找到 FP16，INT8 ConvRot 選項已停用。",
  "accel.videoVaeInt8Only": "目前只找到 INT8 ConvRot，工作流程將使用實驗性解碼後端。",
  "accel.videoVaeBoth": "已找到兩種影片 VAE；可依需求切換。",
  "accel.runtimeTitle": "執行時解譯器",
  "accel.runtimeDescription": "選擇用於啟動 ComfyUI、安裝依賴與讀取加速狀態的 Python 環境。",
  "accel.componentsTitle": "執行時元件",
  "accel.componentsDescription": "檢查 PyTorch/CUDA、H3 ConvRot 核心、SageAttention、Triton 與 KJNodes。",
  "accel.ready": "已就緒",
  "accel.pending": "待安裝/修復",
  "accel.unsupported": "環境不支援",
  "accel.mode": "H3 Attention 後端",
  "accel.modeTip": "只影響 MiniMax H3 工作流程；其他模型的採樣與節點策略在各自的模型或工作流程設定中管理。",
  "accel.modeSage": "自動加速 · SageAttention CUDA FP16",
  "accel.modeSageTip": "使用 CUDA FP16 SageAttention 核心；環境相符時通常速度最快，但需要精確相符的 CUDA、PyTorch 與 wheel。",
  "accel.modeSageTriton": "穩定加速 · SageAttention Triton FP16",
  "accel.modeSageTritonTip": "使用 Triton FP16 SageAttention 核心；相較 CUDA FP16 更適合作為穩定回退，仍需要 SageAttention 與 Triton 環境。",
  "accel.modePytorch": "相容模式 · PyTorch Attention",
  "accel.modePytorchTip": "使用 PyTorch 原生 Attention；不依賴 SageAttention 或 Triton，相容性最高，但通常速度較慢。",
  "accel.auto": "自動加速",
  "accel.stable": "穩定加速",
  "accel.compatible": "相容模式",
  "accel.waitingScan": "等待環境掃描",
  "accel.fallbackLabel": "降級策略",
  "accel.fallback": "CUDA FP16 異常時會依序降級到 SageAttention Triton 與 PyTorch Attention，避免佇列反覆失敗。",
  "accel.python": "ComfyUI Python 解譯器",
  "accel.pythonUseTip": "此解譯器用於啟動 ComfyUI、安裝節點依賴，並讀取 H3 加速環境狀態。",
  "accel.pythonUse": "服務與安裝使用",
  "accel.currentPath": "目前解譯器路徑",
  "accel.scanFill": "掃描後自動填入可用解譯器",
  "accel.chooseFile": "選擇檔案",
  "accel.candidates": "掃描到的候選版本",
  "accel.scanning": "正在掃描…",
  "accel.chooseInterpreter": "選擇一個解譯器",
  "accel.noPython": "未發現可用 Python",
  "accel.current": "目前",
  "accel.notFound": "未找到",
  "accel.unknown": "未知",
  "accel.notInstalled": "未安裝",
  "accel.noWheel": "目前環境沒有相符的 wheel",
  "accel.runtimePython": "ComfyUI Python",
  "accel.runtimePythonTip": "顯示目前用於啟動服務和執行環境檢查的 Python 版本與路徑。",
  "accel.runtimeTorch": "PyTorch / CUDA",
  "accel.runtimeTorchTip": "顯示選定 Python 環境中的 PyTorch、CUDA 與 GPU 架構資訊。",
  "accel.runtimeSage": "SageAttention",
  "accel.runtimeSageTip": "H3 的可選 Attention 加速庫；缺失時可以回退到 Triton 或 PyTorch。",
  "accel.runtimeKj": "Triton / KJNodes",
  "accel.runtimeKjTip": "顯示 Triton 與 KJNodes 狀態；KJNodes 也提供 H3 即時預覽所需的節點。",
  "accel.cuda": "CUDA",
  "accel.sm": "SM",
  "accel.kjAvailable": "KJNodes 模型級補丁可用",
  "accel.kjUpdate": "KJNodes 需要更新",
  "accel.kjMissing": "KJNodes 未安裝",
  "accel.installing": "正在升級 H3 環境…",
  "accel.repair": "一鍵升級/修復 H3 環境",
  "accel.install": "一鍵升級/安裝 H3 環境",
  "accel.stopComfy": "升級會暫時停止 ComfyUI，並保留升級前套件快照",
  "accel.restartComfy": "程式會將低於最低要求的執行環境修復到穩定的 PyTorch 2.10/cu130；符合要求的較新版本會保留，並只補齊有精確 wheel 的元件。自我檢查後恢復先前執行的服務。",
  "accel.desktopTorchTitle": "偵測到 ComfyUI Desktop",
  "accel.desktopTorchHint": "最低支援 PyTorch 2.10/cu130，2.10.0 是穩定回退。較新版本不會被靜默降級，但 SageAttention 仍要求 Comfy 官方發布精確相符的 wheel；沒有 wheel 時請使用 PyTorch Attention。",
  "accel.preparing": "正在準備 H3 環境升級…",
  "accel.progress": "H3 環境升級進度",
  "accel.log": "環境安裝記錄",
  "accel.sourceSelected": "手動指定",
  "accel.sourceComfyVenv": "ComfyUI 虛擬環境",
  "accel.sourceEmbedded": "嵌入式 Python",
  "accel.sourcePath": "系統 PATH",
  "accel.sourceLauncher": "py 啟動器",
  "accel.sourceOther": "其他來源",
  "accel.autoDetect": "自動偵測",
  "shared.recommended": "推薦",
  "shared.slower": "較慢",
  "shared.fast": "快速",
  "shared.longer": "較長",
  "shared.listSeparator": "、",
  "shared.labelSeparator": "："
};

const enUS: SettingsCopyCatalog = {
  "video.title": "Video models",
  "model.meta.llamaReady": "GGUF + mmproj files complete; llama-server is managed by the app",
  "model.meta.multimodalReady": "LLM GGUF + mmproj files complete; H3 prompts use ComfyUI MultiModal Prompt Nodes",
  "model.meta.qwenReady": "Qwen3-VL 8B + PEFT LoRA files complete; H3 prompts use ComfyUI Qwen-VL LoRA",
  "model.meta.gemmaReady": "LLM GGUF + mmproj files ready; video and image prompts use ComfyUI Prompt Writer",
  "model.meta.nativeReady": "ComfyUI text_encoders files are ready; native TextGenerate can expand prompts locally",
  "model.meta.llamaDependency": "llama-server is managed by the app",
  "model.meta.multimodalDependency": "H3 prompts use ComfyUI MultiModal Prompt Nodes",
  "model.meta.qwenDependency": "H3 prompts use ComfyUI Qwen-VL LoRA",
  "model.meta.gemmaDependency": "Video and image prompts use ComfyUI Prompt Writer",
  "model.meta.nativeDependency": "Native TextGenerate expands prompts locally",
  "model.meta.nodesMissing": "Missing nodes: {nodes}",
  "model.meta.runtimeMissing": "Runtime nodes missing: {nodes}",
  "model.meta.runtimeMissingHint": "Start ComfyUI and scan again",
  "model.meta.fileReady": "File scan passed; ready for configuration",
  "model.meta.workflowPending": "Dependencies are complete; the generation workflow is planned for the next phase",
  "model.meta.llamaMissing": "Add GGUF + mmproj and configure llama-server.exe before use",
  "model.meta.multimodalMissing": "Add Qwen3.6 GGUF, mmproj, and MultiModal Prompt Nodes before local expansion can be used",
  "model.meta.qwenMissing": "Add the Qwen3-VL 8B base, H3 Prompt Rewriter LoRA, and Qwen-VL LoRA node before use",
  "model.meta.nativeMissing": "Add the required ComfyUI text_encoders files before local expansion can be used",
  "model.meta.genericMissing": "Add all required components before enabling this model",
  "model.component.optional": "Optional; required for the 4-step Lightning preset:",
  "model.component.alternativeAvailable": "Alternative not installed (another component is currently used):",
  "model.component.viewInfo": "View download and installation instructions for {label}",
  "video.description": "Availability is based on real file components, not only a checkpoint name.",
  "video.defaultModel": "Default model",
  "video.defaultExtensionModel": "Default extension model",
  "video.missingComponent": " · missing components",
  "video.workflowPending": " · workflow pending",
  "video.scanning": "Scanning model directory…",
  "video.summary": "{available} connected runnable models found, {pending} missing components or pending workflow integration",
  "video.waitingScan": "Waiting for first scan",
  "video.empty": "No model scan results",
  "sulphur.title": "Sulphur 2 deployment",
  "sulphur.description": "The same profile controls ordinary I2V, native Extend, model scanning, and new task snapshots.",
  "sulphur.badge": "Separated GGUF",
  "sulphur.transformer": "Transformer quantization",
  "sulphur.resolution": "Base resolution",
  "sulphur.frames": "New model frames per segment",
  "sulphur.framesUnit": "frames",
  "sulphur.timeout": "Per-node timeout",
  "sulphur.recommended": "Recommended",
  "sulphur.slower": "Slower",
  "sulphur.longer": "Longer",
  "sulphur.fastStop": "Fast stop",
  "sulphur.verySlow": "Very slow hardware",
  "sulphur.note": "Q2 uses the distilled model without a LoRA; Q3/Q4 use the dev model and distill LoRA. All profiles require Gemma 3, the LTX text connector, independent video/audio VAEs, and a latent upscaler, with one task, patch_on_device=false, --cache-none, CPU offload, and tiled decoding enforced. The 8GB profile still needs sufficient system memory and a page file.",
  "lora.title": "LoRA Catalog",
  "lora.description": "Optional adapters for the supported video models. Each card shows only the details needed to decide whether to use it.",
  "lora.available": "{available}/{total} available",
  "lora.details": "View usage notes",
  "lora.empty": "No LoRA scan results",
  "image.title": "Image editing models",
  "image.description": "Choose a local image model for the current VRAM. Complete files are enough to configure and queue it; workflows with runtime nodes are validated when ComfyUI is available.",
  "image.defaultModel": "Default image model",
  "image.defaultQuality": "Default quality profile",
  "image.defaultCount": "Default output count",
  "image.countUnit": "images",
  "image.empty": "No image model scan results; confirm the model directory and rescan.",
  "prompt.title": "Local prompt models",
  "prompt.description": "Runs through the current ComfyUI: Qwen uses native TextGenerate, while Gemma 4 uses the H3 Prompt Writer extension.",
  "prompt.badge": "ComfyUI only",
  "prompt.defaultModel": "Default prompt model",
  "prompt.missingComponent": " · missing component",
  "prompt.videoImage": " · video/image",
  "prompt.language": "Expansion language",
  "prompt.followInput": "Follow input language",
  "prompt.chinese": "Chinese",
  "prompt.english": "English",
  "prompt.creativity": "Creativity",
  "prompt.restrained": "Restrained",
  "prompt.balanced": "Balanced",
  "prompt.rich": "Rich",
  "prompt.scanning": "Scanning ComfyUI/models…",
  "prompt.summary": "{count} prompt model profiles have complete files; see each model's validation evidence for node and runtime requirements",
  "prompt.waitingScan": "Waiting for first scan",
  "prompt.note": "Qwen3.5 Safetensors use ComfyUI's models/text_encoders category; Qwen3-VL 8B + H3 Rewriter LoRA use the dedicated models/LLM/Qwen-VL and models/LLM/Qwen-VL-LoRA subdirectories; Gemma GGUF uses an independent uppercase models/LLM subdirectory. After explicit startup, the model remains resident until manual release, queue start, or app exit; llama-server and LM Studio are not required.",
  "prompt.runtimeTitle": "Gemma GGUF runtime",
  "prompt.runtimeDescription": "H3 Prompt Writer and the optional MultiModal node share llama-cpp-python in the selected ComfyUI Python. This card detects and installs the CUDA backend independently; node updates keep a verified backend, while an explicit repair replaces only an incompatible package.",
  "prompt.runtimeReady": "CUDA backend ready",
  "prompt.runtimeMissing": "Not installed",
  "prompt.runtimeCpu": "Installed, but not a CUDA backend",
  "prompt.runtimeUnknown": "Installed, but backend is unverified",
  "prompt.runtimeWaiting": "Waiting for environment scan",
  "prompt.runtimePython": "ComfyUI Python",
  "prompt.runtimeTorch": "PyTorch / CUDA",
  "prompt.runtimeInstall": "Install and self-test",
  "prompt.runtimeRepair": "Repair runtime",
  "prompt.runtimeInstalling": "Installing and testing…",
  "prompt.runtimeLog": "Runtime installation log",
  "prompt.runtimeNodeMissing": "The Prompt Writer node is not loaded; restart ComfyUI and rescan after installing the runtime.",
  "prompt.runtimeQwenNodeReady": "The Qwen-VL LoRA nodes are loaded; after explicit startup, the base and adapter remain resident across enhancements.",
  "prompt.runtimeQwenNodeMissing": "The Qwen-VL LoRA nodes are not loaded; install them in Nodes & dependencies, restart ComfyUI, and rescan.",
  "prompt.runtimeQwenHint": "This model uses Qwen3-VL 8B + a PEFT LoRA. It does not need llama-cpp-python, llama-server, or an mmproj; ComfyUI manages the nodes and Python dependencies.",
  "prompt.runtimeQwenTitle": "H3 Prompt Rewriter runtime status",
  "prompt.runtimeQwenBase": "Qwen3-VL 8B base + H3 Rewriter LoRA",
  "prompt.runtimeQwenBaseReady": "Files found; ComfyUI loads them when the workflow starts",
  "prompt.runtimeQwenBaseMissing": "Complete the base and LoRA files shown in the model card",
  "prompt.runtimeQwenNode": "ComfyUI Qwen-VL LoRA nodes",
  "prompt.runtimeQwenNodeLoaded": "QwenVLModelLoader · QwenVLLoRALoader · QwenVLCaption",
  "prompt.runtimeQwenNodeInstalled": "Nodes installed; waiting for ComfyUI runtime validation",
  "prompt.runtimeQwenNodeMissingAction": "Install it in Nodes & dependencies",
  "prompt.videoPresetTitle": "Video prompt presets",
  "prompt.videoPresetDescription": "Presets organize original text and reference images into a complete H3 video prompt covering subject, scene, action, camera, sound, dialogue, and continuity.",
  "prompt.restore": "Restore defaults",
  "prompt.currentPreset": "Preset being edited",
  "prompt.ruleHeader": "Preset rule header",
  "prompt.h3Note": "The rule header is editable; the built-in H3 baseline still enforces reference tags, start/end-frame relationships, continuity, audio, and output format. Save Settings to use changes on the next expansion.",
  "prompt.autoVideoPresetTitle": "No-prompt video presets",
  "prompt.autoVideoPresetDescription": "When the H3 Prompt is blank, design motion, camera, and interaction from the reference media. This is separate from normal video prompt presets.",
  "prompt.autoVideoPresetSelection": "Default drafting direction",
  "prompt.autoVideoPresetRandom": "Automatic random rotation",
  "prompt.autoVideoPresetRandomHint": "After the Prompt is cleared, prefer an unused direction and create a new variation.",
  "prompt.autoVideoPresetRule": "Drafting instruction",
  "prompt.autoVideoPresetNote": "A fixed direction keeps the creative approach while each click still receives a new variation token. Save Settings to apply changes.",
  "prompt.imagePresetTitle": "Image prompt presets",
  "prompt.imagePresetDescription": "Only affects how the image Optimize Prompt action organizes instructions; it does not change Qwen Image generation parameters.",
  "prompt.imageNote": "The rule header guides the image Prompt optimizer; it is not included in the final Prompt sent to Qwen Image.",
  "prompt.empty": "No prompt model scan results",
  "upscale.title": "Upscale models",
  "upscale.description": "Models with complete files can enter the upscale workflow; models with dedicated runtime nodes are validated when ComfyUI is available.",
  "upscale.defaultModel": "Default model",
  "upscale.seedWeight": "SeedVR2 weights",
  "upscale.realesrganWeight": "Real-ESRGAN weights",
  "upscale.missingComponent": " · missing component",
  "upscale.scanning": "Scanning model directory…",
  "upscale.summary": "{available} models have complete files, {pending} need files; see each model's validation evidence for runtime requirements",
  "upscale.waitingScan": "Waiting for first scan",
  "upscale.empty": "No model scan results",
  "nodes.title": "Nodes & dependencies",
  "nodes.description": "Manage installable third-party ComfyUI nodes and their runtime dependencies",
  "nodes.h3AccelerationTitle": "H3 acceleration runtime",
  "nodes.h3AccelerationBadge": "ComfyUI Python · shared backend",
  "nodes.h3AccelerationDescription": "Inspect and repair the runtime components required by H3; this only affects MiniMax H3 workflows.",
  "nodes.h3AccelerationTarget": "Target environment: ",
  "nodes.installNote": "Only missing nodes, nodes below the project recommendation, and compatibility repairs are installed. The batch restarts ComfyUI once and rescans; missing runtime registration does not trigger reinstallation.",
  "nodes.installAll": "Install and update",
  "nodes.installMissing": "Install missing nodes",
  "nodes.updateAvailable": "Update nodes",
  "nodes.updateAll": "Recommended state reached",
  "nodes.loaded": "Loaded",
  "nodes.notChecked": "Detection not started",
  "nodes.processing": "Processing…",
  "nodes.waitingPosition": "Queued · #{position}",
  "nodes.finalizing": "Restarting and verifying…",
  "nodes.llamaTitle": "llama-cpp-python",
  "nodes.llamaBadge": "Prompt node dependency",
  "nodes.llamaDescription": "Python bindings for running local GGUF prompt models inside ComfyUI; required by the Gemma Prompt Writer and MultiModal nodes.",
  "nodes.pythonEnvironment": "Target environment: ",
  "nodes.installLog": "Installation log",
  "nodes.installed": "Installed",
  "nodes.notInstalled": "Not installed",
  "nodes.installing": "Installing…",
  "nodes.reinstall": "Reinstall",
  "nodes.oneClickInstall": "Install with one click",
  "nodes.projectRequired": "Project required",
  "nodes.optional": "Optional",
  "nodes.manualInstall": "Install separately",
  "nodes.manualInstallHint": "Install this node manually; the app does not download, update, or uninstall it.",
  "nodes.openSource": "Open upstream repository",
  "nodes.prerequisite": "Runtime/install note: ",
  "nodes.localVersion": "Local version: ",
  "nodes.versionSource": "Scan source: ",
  "nodes.revision": "Commit: ",
  "nodes.versionUnread": "Version not read",
  "nodes.latestRelease": "Latest release: ",
  "nodes.recommendedVersion": "Recommended: ",
  "nodes.rescanOnline": "Rescan after connecting",
  "nodes.runtimeMemory": "Uses system memory at runtime and does not download extra models.",
  "nodes.needsUpdate": "Needs update",
  "nodes.compatibilityWarning": "Compatibility pending",
  "nodes.compatibilityError": "Compatibility error",
  "nodes.runtimeVerified": "Runtime verified",
  "nodes.runtimeMissing": "Installed · not registered at runtime",
  "nodes.fileCheckPassed": "File and version checks passed",
  "nodes.installedRepair": "Installed; repair needed",
  "nodes.updateRestart": "Update and restart",
  "nodes.updateRecheck": "Update/restart and recheck",
  "nodes.installRestart": "Install and restart",
  "nodes.repair": "Repair",
  "nodes.update": "Update",
  "nodes.uninstall": "Uninstall",
  "nodes.moreActions": "More node actions",
  "nodes.duplicateCopies": "Multiple H3 Motion Context copies detected: {paths}. Keep only one directory, then restart ComfyUI.",
  "nodes.empty": "Waiting for environment scan",
  "accel.title": "Performance & acceleration",
  "accel.description": "Configure H3 Attention and the final video VAE; install and repair dependencies in Nodes & dependencies.",
  "accel.eagerFallback": "No installed backend found",
  "accel.strategyTitle": "H3 acceleration strategy",
  "accel.strategyDescription": "Choose the H3 Attention backend; this only affects MiniMax H3 workflows.",
  "accel.videoVaeTitle": "H3 video VAE decoding",
  "accel.videoVaeDescription": "Only affects final video decoding for MiniMax H3; after saving, it applies to the next H3 task that has not started. A task already computing is unchanged. The audio VAE, encoding, and other models are unaffected.",
  "accel.videoVaeMode": "Video VAE backend",
  "accel.videoVaeModeTip": "FP16 is the baseline. INT8 ConvRot is an experimental accelerated decode backend and may introduce subtle quality differences; it needs ComfyUI 0.31.0+.",
  "accel.videoVaeAuto": "Automatic · prefer INT8 ConvRot",
  "accel.videoVaeFp16": "Compatibility mode · FP16 baseline",
  "accel.videoVaeInt8": "Acceleration mode · INT8 ConvRot (experimental)",
  "accel.videoVaeMissing": "No FP16 or INT8 ConvRot video VAE was detected; this setting is disabled. Install at least one and scan again.",
  "accel.videoVaeWaiting": "Waiting for an environment scan to read installed video VAEs.",
  "accel.videoVaeFp16Only": "Only FP16 was found; INT8 ConvRot is disabled.",
  "accel.videoVaeInt8Only": "Only INT8 ConvRot was found; workflows will use the experimental decode backend.",
  "accel.videoVaeBoth": "Both video VAEs were found; choose the backend as needed.",
  "accel.runtimeTitle": "Runtime interpreter",
  "accel.runtimeDescription": "Choose the Python environment used to start ComfyUI, install dependencies, and inspect acceleration status.",
  "accel.componentsTitle": "Runtime components",
  "accel.componentsDescription": "Check PyTorch/CUDA, H3 ConvRot kernels, SageAttention, Triton, and KJNodes.",
  "accel.ready": "Ready",
  "accel.pending": "Needs install/repair",
  "accel.unsupported": "Environment unsupported",
  "accel.mode": "H3 Attention backend",
  "accel.modeTip": "This only affects MiniMax H3 workflows. Other models keep their own sampling and node policies.",
  "accel.modeSage": "Automatic acceleration · SageAttention CUDA FP16",
  "accel.modeSageTip": "Uses the CUDA FP16 SageAttention kernel; it is usually the fastest option on a matching environment, but requires an exact CUDA, PyTorch, and wheel match.",
  "accel.modeSageTriton": "Stable acceleration · SageAttention Triton FP16",
  "accel.modeSageTritonTip": "Uses the Triton FP16 SageAttention kernel; it is a steadier fallback than CUDA FP16, but still requires SageAttention and Triton.",
  "accel.modePytorch": "Compatibility mode · PyTorch Attention",
  "accel.modePytorchTip": "Uses native PyTorch Attention; it does not depend on SageAttention or Triton, so compatibility is highest but it is usually slower.",
  "accel.auto": "Automatic acceleration",
  "accel.stable": "Stable acceleration",
  "accel.compatible": "Compatibility mode",
  "accel.waitingScan": "Waiting for environment scan",
  "accel.fallbackLabel": "Fallback policy",
  "accel.fallback": "CUDA FP16 failures fall back through SageAttention Triton and PyTorch Attention to avoid repeated queue failures.",
  "accel.python": "ComfyUI Python interpreter",
  "accel.pythonUseTip": "This interpreter starts ComfyUI, installs node dependencies, and reports H3 acceleration runtime status.",
  "accel.pythonUse": "Service and install runtime",
  "accel.currentPath": "Current interpreter path",
  "accel.scanFill": "Filled with an available interpreter after scanning",
  "accel.chooseFile": "Choose file",
  "accel.candidates": "Scanned candidates",
  "accel.scanning": "Scanning…",
  "accel.chooseInterpreter": "Choose an interpreter",
  "accel.noPython": "No usable Python found",
  "accel.current": "Current",
  "accel.notFound": "Not found",
  "accel.unknown": "Unknown",
  "accel.notInstalled": "Not installed",
  "accel.noWheel": "No matching wheel for the current environment",
  "accel.runtimePython": "ComfyUI Python",
  "accel.runtimePythonTip": "The Python version and path used to start the service and inspect the environment.",
  "accel.runtimeTorch": "PyTorch / CUDA",
  "accel.runtimeTorchTip": "PyTorch, CUDA, and GPU architecture detected in the selected Python environment.",
  "accel.runtimeSage": "SageAttention",
  "accel.runtimeSageTip": "Optional H3 Attention acceleration; missing installs can fall back to Triton or PyTorch.",
  "accel.runtimeKj": "Triton / KJNodes",
  "accel.runtimeKjTip": "Triton and KJNodes status. KJNodes also provides the node used by H3 live preview.",
  "accel.cuda": "CUDA",
  "accel.sm": "SM",
  "accel.kjAvailable": "KJNodes model patch available",
  "accel.kjUpdate": "KJNodes needs an update",
  "accel.kjMissing": "KJNodes not installed",
  "accel.installing": "Upgrading H3 environment…",
  "accel.repair": "Upgrade / repair H3 environment",
  "accel.install": "Upgrade / install H3 environment",
  "accel.stopComfy": "The upgrade temporarily stops ComfyUI and keeps a pre-upgrade package snapshot",
  "accel.restartComfy": "The app repairs runtimes below the minimum to stable PyTorch 2.10/cu130. Newer valid runtimes are preserved, and only components with exact wheels are completed before self-checking and restoring the service.",
  "accel.desktopTorchTitle": "ComfyUI Desktop detected",
  "accel.desktopTorchHint": "PyTorch 2.10/cu130 is the minimum and 2.10.0 is the stable fallback. Newer versions are not silently downgraded, but SageAttention still requires an exact Comfy wheel; use PyTorch Attention when none is published.",
  "accel.preparing": "Preparing the H3 environment upgrade…",
  "accel.progress": "H3 environment upgrade progress",
  "accel.log": "Environment installation log",
  "accel.sourceSelected": "Manually specified",
  "accel.sourceComfyVenv": "ComfyUI virtual environment",
  "accel.sourceEmbedded": "Embedded Python",
  "accel.sourcePath": "System PATH",
  "accel.sourceLauncher": "py launcher",
  "accel.sourceOther": "Other source",
  "accel.autoDetect": "Automatic detection",
  "shared.recommended": "Recommended",
  "shared.slower": "Slower",
  "shared.fast": "Fast",
  "shared.longer": "Longer",
  "shared.listSeparator": ", ",
  "shared.labelSeparator": ": "
};

const h3AutoPromptSeedDescriptions: Record<UiLocale, Record<string, string>> = {
  "zh-CN": {
    "visible-affordance": "利用画面中已经出现且可操作的物体设计自然动作，例如打开、旋转、触碰、拿起或展开；不要凭空添加物体。",
    "gaze-and-intent": "围绕注意力变化设计动作：可见人物先注意到画面中的目标，再转移视线、调整姿态并做出小幅反应；没有人物时改用主体或环境特征表达。",
    "camera-discovery": "用有动机的推、拉、摇、移或跟拍，让镜头逐步发现画面中已有的关系或细节，最后停在更清晰的构图上。",
    "environmental-cascade": "从画面支持的小环境变化开始，引发衣物、头发、树叶、倒影、尘雾、蒸汽、水、光线或阴影等有依据的连锁运动；不要凭空添加天气或特效。",
    "cause-and-effect": "设计一个完整的因果动作：准备、发力或接触、可见反应，再自然收尾；保持主体形体、身份和运动方向连续。",
    "playful-surprise": "基于画面中已有元素加入一个意外但合理、无害的瞬间，例如好奇回望、小插曲、擦肩或由动作触发的揭示；不要编造完整故事。",
    "documentary-moment": "把画面当作真实片段的开头，用克制的呼吸、眨眼、重心、微动作和轻微手持或静止镜头，呈现被自然捕捉的瞬间。",
    "material-response": "突出可见材质对运动的反应，例如褶皱、涟漪、反光、金属震动、纸张、皮肤或头发变化；保持材质和光线方向符合参考图。",
    "spatial-journey": "让可见主体在现有空间中完成一段短移动，如靠近、经过、转身、倾斜或换位；尊重深度、障碍、尺度和原有几何，最后稳定收尾。",
    "rhythmic-beats": "用期待、动作、反应和停顿组织整段时长；重复动作时每次要有变化，结尾要自然解决而不是戛然而止。",
    "contrast-and-settle": "利用静到动、暗到亮、闭到开、远到近或紧张到释放等可见对比推动变化，只使用参考图能支持的内容，并让结尾稳定下来。",
    "subject-pair": "当画面有多个主体时，设计注意力、距离、手势或物体使用上的交流；只有一个主体时，让它与可见环境互动，不能新增参与者。",
    "character-interaction": "把可见角色当作彼此独立的行动者，设计清晰的注意、回应、距离、手势和轮流动作；根据画面中能确认的关系互动，不新增角色，并保持每个人的身份、位置和主动性。",
    "mini-narrative": "在不改变场景的前提下组织一个极短的起承转合：先呈现状态，再出现动机或触发，展示动作与反应，最后落在连贯的新状态。",
    "contextual-action-dialogue": "根据可见角色的身份线索和所处场景，自动组织一段合理动作；当情境支持说话时加入简短对白，并让台词使用角色自然的语言（可以不同于提示词的描述语言）。标明说话者、保持台词简短连贯，不改变用户已有台词，也不凭空添加角色或事实。",
    "mild-adult-atmosphere": "仅对画面中明确为成年人的角色加入轻度性感或暧昧氛围，例如暧昧眼神、亲密但自愿的距离、撩拨手势、自信姿态或符合参考图的服装与动作；保持含蓄、非露骨，不添加裸露、明确性行为、胁迫或未成年人。如果年龄或同意关系不明确，改为非性化表达。",
    "hollywood-cinematic": "把参考画面按好莱坞商业电影的高制作水准发展：先找出强视觉钩子，再用有意的布光、镜头语言、调度和场面设计组织一段连贯动作；运镜要有叙事动机，并最终落在构图明确的画面。保留可见主体和场景，不凭空添加昂贵场景、道具、奇观或剧情事实，也避免空泛的预告片套话。",
    "stillness-break": "先保持参考图般的静止，再用眨眼、呼吸、转头、轻颤、阴影变化、物体反应或镜头漂移打破静止，随后回到可控的停顿。"
  },
  "zh-TW": {
    "visible-affordance": "利用畫面中已經出現且可操作的物體設計自然動作，例如開啟、旋轉、觸碰、拿起或展開；不要憑空新增物體。",
    "gaze-and-intent": "圍繞注意力變化設計動作：可見人物先注意到畫面中的目標，再轉移視線、調整姿勢並做出小幅反應；沒有人物時改用主體或環境特徵表達。",
    "camera-discovery": "用有動機的推、拉、搖、移或跟拍，讓鏡頭逐步發現畫面中已有的關係或細節，最後停在更清晰的構圖上。",
    "environmental-cascade": "從畫面支持的小環境變化開始，引發衣物、頭髮、樹葉、倒影、塵霧、蒸氣、水、光線或陰影等有依據的連鎖運動；不要憑空新增天氣或特效。",
    "cause-and-effect": "設計一個完整的因果動作：準備、發力或接觸、可見反應，再自然收尾；保持主體形體、身分和運動方向連續。",
    "playful-surprise": "根據畫面中已有元素加入一個意外但合理、無害的瞬間，例如好奇回望、小插曲、擦身而過或由動作觸發的揭示；不要編造完整故事。",
    "documentary-moment": "把畫面當作真實片段的開頭，用克制的呼吸、眨眼、重心、微動作和輕微手持或固定鏡頭，呈現被自然捕捉的瞬間。",
    "material-response": "突出可見材質對運動的反應，例如褶皺、漣漪、反光、金屬震動、紙張、皮膚或頭髮變化；保持材質和光線方向符合參考圖。",
    "spatial-journey": "讓可見主體在現有空間中完成一段短移動，如靠近、經過、轉身、傾斜或換位；尊重深度、障礙、尺度和原有幾何，最後穩定收尾。",
    "rhythmic-beats": "用期待、動作、反應和停頓組織整段時長；重複動作時每次都要有變化，結尾要自然解決而不是戛然而止。",
    "contrast-and-settle": "利用靜到動、暗到亮、閉到開、遠到近或緊張到釋放等可見對比推動變化，只使用參考圖能支持的內容，並讓結尾穩定下來。",
    "subject-pair": "當畫面有多個主體時，設計注意力、距離、手勢或物體使用上的交流；只有一個主體時，讓它與可見環境互動，不能新增參與者。",
    "character-interaction": "把可見角色視為彼此獨立的行動者，設計清楚的注意、回應、距離、手勢和輪流動作；根據畫面中能確認的關係互動，不新增角色，並保持每個人的身分、位置和主動性。",
    "mini-narrative": "在不改變場景的前提下組織一個極短的起承轉合：先呈現狀態，再出現動機或觸發，展示動作與反應，最後落在連貫的新狀態。",
    "contextual-action-dialogue": "根據可見角色的身分線索和所在場景，自動組織一段合理動作；當情境支持說話時加入簡短對白，並讓台詞使用角色自然的語言（可以不同於提示詞的描述語言）。標明說話者、保持台詞簡短連貫，不改變使用者已有台詞，也不憑空新增角色或事實。",
    "mild-adult-atmosphere": "僅對畫面中明確為成年人的角色加入輕度性感或曖昧氛圍，例如曖昧眼神、親密但自願的距離、撩撥手勢、自信姿態或符合參考圖的服裝與動作；保持含蓄、非露骨，不加入裸露、明確性行為、脅迫或未成年人。如果年齡或同意關係不明確，改為非性化表達。",
    "hollywood-cinematic": "把參考畫面按好萊塢商業電影的高製作水準發展：先找出強烈的視覺鉤子，再用有意的布光、鏡頭語言、調度和場面設計組織一段連貫動作；運鏡要有敘事動機，並最終落在構圖明確的畫面。保留可見主體和場景，不憑空新增昂貴場景、道具、奇觀或劇情事實，也避免空泛的預告片套話。",
    "stillness-break": "先保持參考圖般的靜止，再用眨眼、呼吸、轉頭、輕顫、陰影變化、物體反應或鏡頭漂移打破靜止，接著回到可控制的停頓。"
  },
  "en-US": {
    "visible-affordance": "Use a visible, actionable object already in the frame to motivate a natural action—opening, turning, touching, lifting, catching, or unfolding—without inventing a prop.",
    "gaze-and-intent": "Build the motion around a readable shift of attention: a visible person notices something already in frame, adjusts gaze or posture, and responds; without a person, apply the idea to the dominant object or environmental feature.",
    "camera-discovery": "Use a motivated push, pull, pan, tilt, arc, or track to reveal a relationship or detail already latent in the composition, then settle in a clearer final frame.",
    "environmental-cascade": "Start with a small change supported by the image and carry it into grounded secondary motion—fabric, hair, leaves, reflections, dust, steam, water, light, or shadows—without adding unsupported weather or effects.",
    "cause-and-effect": "Design one complete causal action: preparation, effort or contact, visible reaction, and a natural settle, while preserving the subject’s identity, geometry, and screen direction.",
    "playful-surprise": "Add one plausible, harmless surprise grounded in what is visible—a curious glance, small interruption, near miss, or movement-triggered reveal—without turning it into an invented story.",
    "documentary-moment": "Treat the image as the start of an observed real moment, using restrained breathing, blinking, weight shifts, micro-actions, and a quiet handheld or static camera so the scene feels caught rather than staged.",
    "material-response": "Make a visible material’s response to motion the focus—folds, ripples, reflections, vibration, paper, skin, or hair—while keeping the material and lighting faithful to the reference.",
    "spatial-journey": "Give a visible subject a short journey through the existing space—approach, pass, turn, lean, or shift position—respecting depth, obstacles, scale, and geometry, then end in a stable readable pose.",
    "rhythmic-beats": "Shape the duration as anticipation, action, reaction, and hold; if motion repeats, each beat should change something, and the ending should resolve instead of stopping mid-action.",
    "contrast-and-settle": "Use a restrained visible contrast—stillness to motion, shadow to light, closed to open, distant to near, or tension to release—only where the reference supports it, with a physically settled ending.",
    "subject-pair": "If multiple subjects are visible, design a readable exchange of attention, spacing, gesture, or object use; with one subject, make it interact with the visible environment without adding a participant.",
    "character-interaction": "Treat visible characters as distinct agents and design a readable exchange of attention, response, spacing, gesture, and turn-taking. Base the relationship on what the image supports, add no character, and preserve each person’s identity, position, and agency.",
    "mini-narrative": "Create one tiny visual story without changing the setting: establish the state, introduce a grounded trigger or intention, show action and reaction, and finish on a coherent changed state.",
    "contextual-action-dialogue": "Use the visible characters, their apparent roles, and the setting to choose a plausible short action beat. When the situation supports speech, add brief dialogue in each character’s natural language, which may differ from the descriptive prompt language. Keep speaker identity and turn-taking clear, preserve user-supplied lines exactly, follow the required H3 dialogue conventions, and never invent unsupported people or facts.",
    "mild-adult-atmosphere": "For clearly adult subjects only, add a restrained sensual or suggestive tone grounded in the reference: flirtatious eye contact, intimate but consensual proximity, a teasing gesture, confident posing, or suggestive wardrobe or movement. Keep it tasteful and non-explicit; do not introduce nudity, explicit sexual acts, coercion, or minors. If age or consent is unclear, keep the direction non-sexual and follow visible evidence.",
    "hollywood-cinematic": "Develop the reference as a polished, Hollywood-grade feature-film beat: find a strong visual hook, then use intentional lighting, lensing, blocking, production design, and motivated camera language to build one coherent action. Escalate with purposeful push, pull, orbit, tracking, or reveal moves and land on a composed final frame. Preserve what is visible; do not invent expensive locations, props, spectacle, or plot facts, and avoid generic trailer prose.",
    "stillness-break": "Begin with a convincing hold on the reference, then break stillness with one precise cue—blink, breath, turn, tremor, shadow shift, object response, or camera drift—before returning to a controlled hold."
  }
};

export function settingsH3AutoPromptSeedDescription(
  locale: UiLocale | undefined,
  seedId: string,
  fallback: string
): string {
  const activeLocale = locale ?? "zh-CN";
  return h3AutoPromptSeedDescriptions[activeLocale]?.[seedId] ?? fallback;
}

const modelHardwareRecommendations: Record<UiLocale, Record<string, string>> = {
  "zh-CN": {
    "qwen/qwen3.5-4b": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
    "qwen/qwen3.5-2b": "RTX 2060 6GB 以上 · 系统 RAM 16GB 以上",
    "qwen-image-edit-2511": "RTX 3090/4090 24GB 以上 · CPU/offload",
    "flux2-klein-4b": "RTX 4080/4090 16GB 以上",
    omnigen2: "RTX 4090 24GB 推荐 · FP16 · 20–50 步 · 最多 2 图",
    "hidream-o1-image": "RTX 4090 24GB 推荐 · FP8 scaled · Full 50 步",
    "z-image-turbo": "RTX 4090 24GB 推荐 · BF16 · 8 步",
    "z-image": "RTX 4090 24GB 推荐 · BF16 · 原生 30–40 步",
    minimax_h3_fl2va: "RTX 3090/4090 24GB 以上 · 系统 RAM 64GB 推荐",
    minimax_h3_fl2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
    minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB 实验 · 480p/5秒/32GB RAM 起步",
    minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB 以上 · Turbo 不降低基础显存",
    minimax_h3_ref2va: "RTX 3090/4090 24GB 以上 · 多参考需更多 RAM",
    minimax_h3_ref2va_int4: "RTX 4070/4080 16GB 推荐 · 12GB 仅实验",
    sulphur2: "RTX 3060 12GB 以上 · 系统 RAM 32GB 以上",
    wan22_5b: "RTX 3080 12GB/4070 12GB 以上 · 16GB 推荐",
    hunyuan15: "RTX 3090/4090 24GB 以上",
    wan22_14b_nsfw: "RTX 3090/4090 24GB 以上 · 保守卸载",
    wan22_remix: "RTX 3090/4090 24GB 以上",
    wan22_smoothmix: "RTX 3090/4090 24GB 以上",
    wan22_dasiwa: "RTX 3090/4090 24GB 以上",
    seedvr2: "RTX 3090/4090 24GB 以上",
    flashvsr: "RTX 4080/4090 16GB 以上",
    hunyuan15_sr: "RTX 4090 24GB 以上 · 两阶段模型卸载",
    realesrgan: "RTX 2060/3060 6GB 以上",
    rife: "RTX 2060/3060 6GB 以上",
    "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
    "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB 以上 · 系统 RAM 24GB 以上",
    "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB 以上",
    "community/gemma-4-26b-a4b-unseen-nsfw-q4": "RTX 4090 24GB 推荐 · Q4 projector · 标准 16K",
    "google/gemma-4-12b-q5": "RTX 4080/4090 16GB 以上 · 系统 RAM 24GB 以上",
    "qwen/qwen3.8-27b-uncensored-q4": "RTX 4090 24GB 以上 · 系统 RAM 32GB 以上",
    "lightx2v/minimax-h3-prompt-rewriter-8b": "RTX 4090 24GB 推荐 · 4-bit 约 8–10GB 显存 · 系统 RAM 32GB 以上"
  },
  "zh-TW": {
    "qwen/qwen3.5-4b": "RTX 3060 12GB 以上 · 系統 RAM 16GB 以上",
    "qwen/qwen3.5-2b": "RTX 2060 6GB 以上 · 系統 RAM 16GB 以上",
    "qwen-image-edit-2511": "RTX 3090/4090 24GB 以上 · CPU/offload",
    "flux2-klein-4b": "RTX 4080/4090 16GB 以上",
    omnigen2: "RTX 4090 24GB 推薦 · FP16 · 20–50 步 · 最多 2 圖",
    "hidream-o1-image": "RTX 4090 24GB 推薦 · FP8 scaled · Full 50 步",
    "z-image-turbo": "RTX 4090 24GB 推薦 · BF16 · 8 步",
    "z-image": "RTX 4090 24GB 推薦 · BF16 · 原生 30–40 步",
    minimax_h3_fl2va: "RTX 3090/4090 24GB 以上 · 系統 RAM 64GB 推薦",
    minimax_h3_fl2va_int4: "RTX 4070/4080 16GB 推薦 · 12GB 僅實驗",
    minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB 實驗 · 480p/5秒/32GB RAM 起步",
    minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB 以上 · Turbo 不降低基礎顯存",
    minimax_h3_ref2va: "RTX 3090/4090 24GB 以上 · 多參考需要更多 RAM",
    minimax_h3_ref2va_int4: "RTX 4070/4080 16GB 推薦 · 12GB 僅實驗",
    sulphur2: "RTX 3060 12GB 以上 · 系統 RAM 32GB 以上",
    wan22_5b: "RTX 3080 12GB/4070 12GB 以上 · 16GB 推薦",
    hunyuan15: "RTX 3090/4090 24GB 以上",
    wan22_14b_nsfw: "RTX 3090/4090 24GB 以上 · 保守卸載",
    wan22_remix: "RTX 3090/4090 24GB 以上",
    wan22_smoothmix: "RTX 3090/4090 24GB 以上",
    wan22_dasiwa: "RTX 3090/4090 24GB 以上",
    seedvr2: "RTX 3090/4090 24GB 以上",
    flashvsr: "RTX 4080/4090 16GB 以上",
    hunyuan15_sr: "RTX 4090 24GB 以上 · 兩階段模型卸載",
    realesrgan: "RTX 2060/3060 6GB 以上",
    rife: "RTX 2060/3060 6GB 以上",
    "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB 以上 · 系統 RAM 16GB 以上",
    "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB 以上 · 系統 RAM 24GB 以上",
    "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB 以上",
    "community/gemma-4-26b-a4b-unseen-nsfw-q4": "RTX 4090 24GB 推薦 · Q4 projector · 標準 16K",
    "google/gemma-4-12b-q5": "RTX 4080/4090 16GB 以上 · 系統 RAM 24GB 以上",
    "qwen/qwen3.8-27b-uncensored-q4": "RTX 4090 24GB 以上 · 系統 RAM 32GB 以上",
    "lightx2v/minimax-h3-prompt-rewriter-8b": "RTX 4090 24GB 推薦 · 4-bit 約 8–10GB 顯存 · 系統 RAM 32GB 以上"
  },
  "en-US": {
    "qwen/qwen3.5-4b": "RTX 3060 12GB or higher · System RAM 16GB or higher",
    "qwen/qwen3.5-2b": "RTX 2060 6GB or higher · System RAM 16GB or higher",
    "qwen-image-edit-2511": "RTX 3090/4090 24GB or higher · CPU/offload",
    "flux2-klein-4b": "RTX 4080/4090 16GB or higher",
    omnigen2: "RTX 4090 24GB recommended · FP16 · 20–50 steps · up to 2 images",
    "hidream-o1-image": "RTX 4090 24GB recommended · FP8 scaled · Full 50 steps",
    "z-image-turbo": "RTX 4090 24GB recommended · BF16 · 8 steps",
    "z-image": "RTX 4090 24GB recommended · BF16 · native 30–40 steps",
    minimax_h3_fl2va: "RTX 3090/4090 24GB or higher · 64GB system RAM recommended",
    minimax_h3_fl2va_int4: "RTX 4070/4080 16GB recommended · 12GB experimental only",
    minimax_h3_fl2va_q3_gguf: "RTX 3080 10GB experimental · 480p/5s/32GB RAM starting point",
    minimax_h3_fl2va_turbo: "RTX 3090/4090 24GB or higher · Turbo does not reduce base VRAM",
    minimax_h3_ref2va: "RTX 3090/4090 24GB or higher · multiple references need more RAM",
    minimax_h3_ref2va_int4: "RTX 4070/4080 16GB recommended · 12GB experimental only",
    sulphur2: "RTX 3060 12GB or higher · System RAM 32GB or higher",
    wan22_5b: "RTX 3080 12GB/4070 12GB or higher · 16GB recommended",
    hunyuan15: "RTX 3090/4090 24GB or higher",
    wan22_14b_nsfw: "RTX 3090/4090 24GB or higher · conservative offload",
    wan22_remix: "RTX 3090/4090 24GB or higher",
    wan22_smoothmix: "RTX 3090/4090 24GB or higher",
    wan22_dasiwa: "RTX 3090/4090 24GB or higher",
    seedvr2: "RTX 3090/4090 24GB or higher",
    flashvsr: "RTX 4080/4090 16GB or higher",
    hunyuan15_sr: "RTX 4090 24GB or higher · two-stage model offload",
    realesrgan: "RTX 2060/3060 6GB or higher",
    rife: "RTX 2060/3060 6GB or higher",
    "community/gemma-4-e4b-unconcerned-q5": "RTX 3060 12GB or higher · System RAM 16GB or higher",
    "community/gemma-4-12b-uncensored-q4": "RTX 3060/4070 12GB or higher · System RAM 24GB or higher",
    "community/gemma-4-26b-a4b-uncensored-q4": "RTX 3090/4090 24GB or higher",
    "community/gemma-4-26b-a4b-unseen-nsfw-q4": "RTX 4090 24GB recommended · Q4 projector · standard 16K",
    "google/gemma-4-12b-q5": "RTX 4080/4090 16GB or higher · System RAM 24GB or higher",
    "qwen/qwen3.8-27b-uncensored-q4": "RTX 4090 24GB or higher · System RAM 32GB or higher",
    "lightx2v/minimax-h3-prompt-rewriter-8b": "RTX 4090 24GB recommended · 4-bit uses about 8–10GB VRAM · System RAM 32GB or higher"
  }
};

const modelHardwareDefaults: Record<UiLocale, Record<string, string>> = {
  "zh-CN": {
    video: "RTX 3080 12GB 以上 · 系统 RAM 32GB 以上",
    image: "RTX 3060 12GB 以上",
    prompt: "RTX 3060 12GB 以上 · 系统 RAM 16GB 以上",
    default: "RTX 2060 6GB 以上"
  },
  "zh-TW": {
    video: "RTX 3080 12GB 以上 · 系統 RAM 32GB 以上",
    image: "RTX 3060 12GB 以上",
    prompt: "RTX 3060 12GB 以上 · 系統 RAM 16GB 以上",
    default: "RTX 2060 6GB 以上"
  },
  "en-US": {
    video: "RTX 3080 12GB or higher · System RAM 32GB or higher",
    image: "RTX 3060 12GB or higher",
    prompt: "RTX 3060 12GB or higher · System RAM 16GB or higher",
    default: "RTX 2060 6GB or higher"
  }
};

export function settingsModelHardwareRecommendation(
  locale: UiLocale | undefined,
  profile: Pick<ModelScanProfile, "id" | "category">
): string {
  const activeLocale = locale ?? "zh-CN";
  const recommendations = modelHardwareRecommendations[activeLocale];
  const defaults = modelHardwareDefaults[activeLocale];
  return recommendations[profile.id] ?? defaults[profile.category] ?? defaults.default ?? "";
}

function interpolate(text: string, params: Params): string {
  return text.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, key: string) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
}

export function settingsText(
  locale: UiLocale | undefined,
  key: SettingsCopyKey,
  params: Params = {}
): string {
  const catalog = locale === "en-US" ? enUS : locale === "zh-TW" ? zhTW : zhCN;
  return interpolate(catalog[key] ?? zhCN[key], params);
}
