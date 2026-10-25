import type { ModelScanProfile, UiLocale } from "../../../types";
import { H3_COMFY_KITCHEN_VERSION, modelCatalog } from "../../../core/catalog";
import { COMFYUI_RECOMMENDED_VERSION } from "../../../core/catalog/dependencies/comfy-core";

type SettingsCopyKey =
  | "model.files"
  | "model.shared"
  | "model.recommended"
  | "model.component.location"
  | "model.collapse"
  | "model.download"
  | "lora.other"
  | "prompt.localModel"
  | "prompt.uncensored"
  | "prompt.uncensored.off"
  | "prompt.uncensored.builtin"
  | "prompt.uncensored.community"
  | "prompt.uncensoredHint"
  | "prompt.uncensoredUnsupported"
  | "prompt.reasoning"
  | "prompt.reasoning.off"
  | "prompt.reasoning.low"
  | "prompt.reasoning.medium"
  | "prompt.reasoning.high"
  | "prompt.reasoningHint"
  | "strata.title"
  | "strata.install.prepare"
  | "strata.install.source"
  | "strata.install.download"
  | "strata.install.verify"
  | "strata.install.extract"
  | "strata.install.assets"
  | "strata.install.python"
  | "strata.install.packages"
  | "strata.install.check"
  | "strata.install.complete"
  | "strata.install.recovery"
  | "strata.details"
  | "strata.installed"
  | "strata.stage"
  | "strata.note"
  | "strata.root"
  | "strata.port"
  | "strata.portNote"
  | "strata.source"
  | "strata.engine"
  | "strata.choose"
  | "strata.chooseRoot"
  | "strata.notScanned"
  | "strata.present"
  | "strata.missing"
  | "strata.evidence"
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
  | "model.component.downloadInstall"
  | "model.component.viewSource"
  | "model.component.sourceRevision"
  | "model.component.sha256"
  | "model.component.fileSize"
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
  | "sulphur.minutesUnit"
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
  | "nodes.groupRuntime"
  | "nodes.details"
  | "nodes.groupVideo"
  | "nodes.groupUpscale"
  | "nodes.groupPrompt"
  | "nodes.groupGeneral"
  | "nodes.queuedCount"
  | "nodes.cancelWaiting"
  | "nodes.processingName"
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
  | "nodes.cancelInstall"
  | "nodes.removeQueued"
  | "nodes.cancelling"
  | "nodes.reinstall"
  | "nodes.oneClickInstall"
  | "nodes.projectRequired"
  | "nodes.optional"
  | "nodes.manualInstall"
  | "nodes.manualInstallHint"
  | "nodes.openSource"
  | "nodes.prerequisite"
  | "nodes.versionSummary"
  | "nodes.versionLabel"
  | "nodes.commitDate"
  | "nodes.localVersion"
  | "nodes.versionUnread"
  | "nodes.recommendedVersion"
  | "nodes.latestVersion"
  | "nodes.versionUnavailable"
  | "nodes.rollingVersion"
  | "nodes.rollingRecommendation"
  | "nodes.pinnedVersion"
  | "nodes.rescanOnline"
  | "nodes.runtimeMemory"
  | "nodes.needsUpdate"
  | "nodes.compatibilityWarning"
  | "nodes.compatibilityError"
  | "nodes.runtimeVerified"
  | "nodes.runtimeMissing"
  | "nodes.dlss5RuntimeLabel"
  | "nodes.dlss5RuntimeReady"
  | "nodes.dlss5RuntimeMissing"
  | "nodes.aetherscaleRuntimeLabel"
  | "nodes.aetherscaleRuntimeReady"
  | "nodes.aetherscaleRuntimeMissing"
  | "nodes.fileCheckPassed"
  | "nodes.versionUnknown"
  | "nodes.installedRepair"
  | "nodes.updateRestart"
  | "nodes.updateRecheck"
  | "nodes.installRestart"
  | "nodes.repair"
  | "nodes.update"
  | "nodes.uninstall"
  | "nodes.moreActions"
  | "nodes.openLocation"
  | "nodes.openLocationFailed"
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
  | "accel.probeFailed"
  | "accel.verifyRuntime"
  | "accel.verificationLive"
  | "accel.verificationCached"
  | "accel.verificationPrevious"
  | "accel.verificationPending"
  | "accel.mode"
  | "accel.modeTip"
  | "accel.modeSage"
  | "accel.modeSageTip"
  | "accel.modeSageTriton"
  | "accel.modeSageTritonTip"
  | "accel.modePytorch"
  | "accel.modePytorchTip"
  | "accel.modeComfyKitchen"
  | "accel.modeComfyKitchenTip"
  | "accel.sparseMode"
  | "accel.sparseModeTip"
  | "accel.sparseOff"
  | "accel.sparseOffTip"
  | "accel.sparseSolAttn"
  | "accel.sparseSolAttnTip"
  | "accel.runtimeMode"
  | "accel.runtimeModeTip"
  | "accel.runtimeCompatibility"
  | "accel.runtimeCompatibilityTip"
  | "accel.runtimeNative"
  | "accel.runtimeNativeTip"
  | "accel.compilerMode"
  | "accel.compilerModeTip"
  | "accel.compilerAuto"
  | "accel.compilerDisabled"
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
  "strata.title": "Strata · 独立提示词运行组件",
  "prompt.uncensored": "uncensored 模式",
  "prompt.uncensored.off": "关闭",
  "prompt.uncensored.builtin": "自带 · ESP",
  "prompt.uncensored.community": "社区 · sergqwer",
  "prompt.uncensoredHint": "原始权重不变；保存后下次增强生效。首次启用或更换向量会重载模型，去拒答效果因任务而异。",
  "prompt.uncensoredUnsupported": "当前模型不支持；偏好保留，兼容模型可继续使用。",
  "prompt.reasoning": "思考强度",
  "prompt.reasoning.off": "关闭",
  "prompt.reasoning.low": "低",
  "prompt.reasoning.medium": "中",
  "prompt.reasoning.high": "高",
  "prompt.reasoningHint": "保存后下次增强生效，无需重载模型。高对应官方 xhigh；high 与 xhigh 是同一档。",
  "strata.install.prepare": "检查安装环境",
  "strata.install.source": "获取源码",
  "strata.install.download": "下载引擎",
  "strata.install.verify": "校验引擎",
  "strata.install.extract": "解压引擎",
  "strata.install.assets": "准备控制向量",
  "strata.install.python": "创建 Python 环境",
  "strata.install.packages": "安装 Python 依赖",
  "strata.install.check": "检查运行组件",
  "strata.install.complete": "安装完成",
  "strata.install.recovery": "恢复安装状态",
  "strata.details": "高级设置",
  "strata.installed": "运行组件已安装",
  "strata.stage": "独立提示词运行组件",
  "strata.note": "提示词模型的独立运行环境，不改动 ComfyUI 的 Python 包",
  "strata.root": "自定义运行目录（留空由应用管理）",
  "strata.port": "预留本机端口",
  "strata.portNote": "默认 43127；不支持 8080。",
  "strata.source": "下载源码 ZIP",
  "strata.engine": "下载 NVIDIA 引擎 ZIP",
  "strata.choose": "选择目录",
  "strata.chooseRoot": "模型路径暂不可用，请重新扫描环境",
  "strata.notScanned": "尚未扫描此目录",
  "strata.present": "文件存在（未验证可运行）",
  "strata.missing": "缺少文件",
  "strata.evidence": "安装校验固定源码、引擎 SHA-256 和独立 Python 包。模型采用 GSQ-RCO GGUF 与视觉投影；首次加载会校验并生成 pack/tokenizer，随后复用缓存。CUDA 13，NVIDIA 驱动 580+。",
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
  "model.component.optional": "可选：",
  "model.component.alternativeAvailable": "备选未安装（当前使用其他组件）：",
  "model.component.viewInfo": "查看 {label} 的{info}",
  "model.component.downloadInstall": "下载与安装",
  "model.files": "模型文件 {found}/{total}",
  "model.shared": "共用",
  "model.recommended": "推荐",
  "model.component.location": "已找到文件",
  "model.collapse": "收起",
  "model.download": "下载",
  "lora.other": "其他 LoRA",
  "prompt.localModel": "本地提示词模型",
  "model.component.viewSource": "查看来源",
  "model.component.sourceRevision": "来源 revision",
  "model.component.sha256": "SHA-256",
  "model.component.fileSize": "文件大小",
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
  "sulphur.minutesUnit": "分钟",
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
  "prompt.description": "按所选模型运行：现有模型使用 ComfyUI，Qwen3.8-Flash-Next 使用独立 Strata。",
  "prompt.badge": "本地运行",
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
  "prompt.h3Note": "H3 参考标签、首尾帧关系、连续性及音视频格式始终保留。",
  "prompt.autoVideoPresetTitle": "无提示词视频预设",
  "prompt.autoVideoPresetDescription": "当 H3 Prompt 为空时，从参考画面设计动作、镜头和互动；与普通视频提示词预设分开。",
  "prompt.autoVideoPresetSelection": "默认起稿方向",
  "prompt.autoVideoPresetRandom": "自动随机轮换",
  "prompt.autoVideoPresetRandomHint": "每次清空 Prompt 后优先选择尚未使用的起稿方向，并生成新的变化。",
  "prompt.autoVideoPresetRule": "起稿指令",
  "prompt.imagePresetTitle": "图片提示词预设",
  "prompt.imagePresetDescription": "只影响图片“优化提示词”时的整理策略，不改变 Qwen Image 的生成参数。",
  "prompt.imageNote": "优化规则不加入最终提示词。",
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
  "nodes.groupRuntime": "运行时依赖",
  "nodes.details": "安装详情",
  "nodes.groupVideo": "H3 视频与续写",
  "nodes.groupUpscale": "放大与补帧",
  "nodes.groupPrompt": "提示词与视觉理解",
  "nodes.groupGeneral": "图片与通用",
  "nodes.queuedCount": "等待 {count} 个",
  "nodes.cancelWaiting": "取消等待中的",
  "nodes.processingName": "正在处理 {name}",
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
  "nodes.llamaDescription": "ComfyUI 本地 GGUF 提示词模型运行组件",
  "nodes.pythonEnvironment": "目标环境：",
  "nodes.installLog": "安装日志",
  "nodes.installed": "已安装",
  "nodes.notInstalled": "未安装",
  "nodes.installing": "安装中…",
  "nodes.cancelInstall": "取消安装",
  "nodes.removeQueued": "移出队列",
  "nodes.cancelling": "正在取消…",
  "nodes.reinstall": "重新安装",
  "nodes.oneClickInstall": "一键安装",
  "nodes.projectRequired": "项目必需",
  "nodes.optional": "可选",
  "nodes.manualInstall": "需单独安装",
  "nodes.manualInstallHint": "此节点由用户手动安装；应用不会自动下载、更新或卸载它。",
  "nodes.openSource": "打开上游仓库",
  "nodes.prerequisite": "运行/安装说明：",
  "nodes.versionSummary": "节点版本信息",
  "nodes.versionLabel": "版本",
  "nodes.commitDate": "提交日期",
  "nodes.localVersion": "本机",
  "nodes.versionUnread": "未读取",
  "nodes.recommendedVersion": "推荐",
  "nodes.latestVersion": "最新",
  "nodes.versionUnavailable": "未标注",
  "nodes.rollingVersion": "滚动版",
  "nodes.rollingRecommendation": "跟随上游",
  "nodes.pinnedVersion": "固定版",
  "nodes.rescanOnline": "联网后重新扫描",
  "nodes.runtimeMemory": "运行时固定使用系统内存，不额外下载模型。",
  "nodes.needsUpdate": "需要更新",
  "nodes.compatibilityWarning": "兼容性待确认",
  "nodes.compatibilityError": "兼容性错误",
  "nodes.runtimeVerified": "运行时已验证",
  "nodes.runtimeMissing": "已安装 · 运行时未注册",
  "nodes.dlss5RuntimeLabel": "DLSS5 runtime：",
  "nodes.dlss5RuntimeReady": "文件已就绪",
  "nodes.dlss5RuntimeMissing": "已安装 · DLSS5 runtime 不可用",
  "nodes.aetherscaleRuntimeLabel": "AetherScale carrier：",
  "nodes.aetherscaleRuntimeReady": "六文件已就绪",
  "nodes.aetherscaleRuntimeMissing": "已安装 · carrier runtime 不可用",
  "nodes.fileCheckPassed": "已就绪",
  "nodes.versionUnknown": "未获取",
  "nodes.installedRepair": "已安装，需修复",
  "nodes.updateRestart": "更新并重启",
  "nodes.updateRecheck": "更新/重启复检",
  "nodes.installRestart": "安装并重启",
  "nodes.repair": "修复",
  "nodes.update": "更新",
  "nodes.uninstall": "卸载",
  "nodes.moreActions": "更多节点操作",
  "nodes.openLocation": "打开位置",
  "nodes.openLocationFailed": "无法打开所在位置，文件或目录可能已移动或删除，请重新扫描。",
  "nodes.duplicateCopies": "发现多个 H3 Motion Context 副本：{paths}。请只保留一个目录，再重启 ComfyUI。",
  "nodes.empty": "等待环境扫描结果",
  "accel.title": "性能与加速",
  "accel.description": "配置 H3 Attention 与最终视频 VAE；依赖安装与修复在“节点与依赖”中完成。",
  "accel.eagerFallback": "未发现已安装后端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "选择 H3 的 Attention 后端；仅影响 MiniMax H3 工作流。",
  "accel.videoVaeTitle": "H3 视频 VAE",
  "accel.videoVaeDescription": "影响 MiniMax H3 视频 VAE 的编码与解码；保存后对下一个尚未开始的 H3 任务生效，正在计算的任务不变。音频 VAE 和其他模型不受影响。",
  "accel.videoVaeMode": "视频 VAE 后端",
  "accel.videoVaeModeTip": `FP16 是兼容基线；INT8 ConvRot 是 ComfyUI 官方视频 VAE 加速路径，建议配套 ComfyUI ${COMFYUI_RECOMMENDED_VERSION} 与 comfy-kitchen ${H3_COMFY_KITCHEN_VERSION} CUDA 内核。`,
  "accel.videoVaeAuto": "自动 · 优先 INT8 ConvRot",
  "accel.videoVaeFp16": "兼容模式 · FP16 基线",
  "accel.videoVaeInt8": "官方加速模式 · INT8 ConvRot",
  "accel.videoVaeMissing": "未检测到 FP16 或 INT8 ConvRot 视频 VAE；设置已禁用，请先安装至少一个并重新扫描。",
  "accel.videoVaeWaiting": "等待环境扫描后读取已安装的视频 VAE。",
  "accel.videoVaeFp16Only": "当前只找到 FP16，INT8 ConvRot 选项已禁用。",
  "accel.videoVaeInt8Only": "当前只找到 INT8 ConvRot；自动模式会优先使用它。",
  "accel.videoVaeBoth": "已找到两种视频 VAE；自动模式优先 INT8 ConvRot，缺失时回退 FP16。",
  "accel.runtimeTitle": "运行时解释器",
  "accel.runtimeDescription": "选择用于启动 ComfyUI、安装依赖和读取加速状态的 Python 环境。",
  "accel.componentsTitle": "运行时组件",
  "accel.componentsDescription": "检查 PyTorch/CUDA、H3 ConvRot 内核、SageAttention、Triton 与 KJNodes。",
  "accel.ready": "已就绪",
  "accel.pending": "待安装/修复",
  "accel.unsupported": "环境不支持",
  "accel.probeFailed": "检测未完成，请重新扫描",
  "accel.verifyRuntime": "重新验证运行环境",
  "accel.verificationLive": "已实时验证",
  "accel.verificationCached": "已使用缓存验证",
  "accel.verificationPrevious": "沿用上一轮验证结果",
  "accel.verificationPending": "等待运行环境验证",
  "accel.mode": "H3 Attention 后端",
  "accel.modeTip": "只影响 MiniMax H3 工作流；其他模型的采样和节点策略在各自的模型或工作流设置中管理。",
  "accel.modeSage": "SageAttention CUDA · 备选",
  "accel.modeSageTip": "备选。CUDA FP16 SageAttention 是已验证基线，但当前 4090 同任务实测慢于 Triton + SOL；仍要求 CUDA、PyTorch 与 wheel 精确匹配。",
  "accel.modeSageTriton": "SageAttention Triton · 推荐",
  "accel.modeSageTritonTip": "推荐。当前 4090 同任务中，搭配 SOL 速度最快；稠密模式的峰值显存也最低。需要 SageAttention 与 Triton 环境。",
  "accel.modePytorch": "PyTorch Attention · 兼容回退",
  "accel.modePytorchTip": "仅作兼容回退。不依赖 SageAttention 或 Triton，兼容性最高，但通常最慢，不作为当前 4090 的性能推荐。",
  "accel.modeComfyKitchen": "Comfy Kitchen INT8 · 稠密次选",
  "accel.modeComfyKitchenTip": "稠密模式次选。当前 4090 同任务比 Sage CUDA 稠密更快且内存更低；与 SOL 组合已出现爆显存，只建议搭配稠密 Attention。",
  "accel.sparseMode": "H3 稀疏 Attention",
  "accel.sparseModeTip": "全局只保留已可测试的稠密与 SOL。Turbo-SLA 的专用 SLA 由任务配方内部绑定；未验证的 VSA 不在这里显示。",
  "accel.sparseOff": "稠密 Attention · 稳定推荐",
  "accel.sparseOffTip": "稳定推荐。使用所选后端的完整稠密路径，是排查质量、显存和兼容性的基线；Comfy Kitchen 只建议使用此项。",
  "accel.sparseSolAttn": "SOL-Attn 稀疏 · 速度优先（会影响质量）",
  "accel.sparseSolAttnTip": "实验性速度优先。实际 H3 对照已观察到明显的视频质量下降，并会改变同 seed 输出；影响程度因素材而异。当前 4090 搭配 Sage Triton 最快，但不降低峰值显存，且不要与 Comfy Kitchen 组合。",
  "accel.runtimeMode": "H3 运行时策略",
  "accel.runtimeModeTip": "选择 H3 的模型驻留与卸载方式。当前 4090/64 GB 实测应优先固定驻留。",
  "accel.runtimeCompatibility": "固定驻留 · 强烈推荐",
  "accel.runtimeCompatibilityTip": "强烈推荐。不启用 Dynamic VRAM 或 async offload；当前测试更快，RAM 峰值约 34–37 GiB，Shared GPU 低于 1 GiB。",
  "accel.runtimeNative": "动态显存 + 异步卸载 · 不推荐",
  "accel.runtimeNativeTip": "不推荐。当前测试慢约 13–20%，RAM 峰值接近 63 GiB、Shared GPU 约 25 GiB，只节省约 1 GiB 专用显存，容易受系统负载影响而 OOM。",
  "accel.compilerMode": "Comfy 编译器",
  "accel.compilerModeTip": "这不是智能择优；启用后 ComfyUI 会记录显存分配、预取并尝试 CUDA Graph，可能增加峰值显存。当前 RTX 4090/H3 默认关闭；关闭时仅对 H3 启用 --disable-comfy-compiler。",
  "accel.compilerAuto": "启用 Comfy 编译器 · 高显存实验",
  "accel.compilerDisabled": "禁用 Comfy 编译器 · H3/4090 推荐",
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
  "strata.title": "Strata · 獨立提示詞執行元件",
  "prompt.uncensored": "uncensored 模式",
  "prompt.uncensored.off": "關閉",
  "prompt.uncensored.builtin": "自帶 · ESP",
  "prompt.uncensored.community": "社群 · sergqwer",
  "prompt.uncensoredHint": "原始權重不變；儲存後下次增強生效。首次啟用或更換向量會重載模型，去拒答效果因任務而異。",
  "prompt.uncensoredUnsupported": "目前模型不支援；保留偏好供相容模型使用。",
  "prompt.reasoning": "思考強度",
  "prompt.reasoning.off": "關閉",
  "prompt.reasoning.low": "低",
  "prompt.reasoning.medium": "中",
  "prompt.reasoning.high": "高",
  "prompt.reasoningHint": "儲存後下次增強生效，無需重載模型。高對應官方 xhigh；high 與 xhigh 是同一檔。",
  "strata.install.prepare": "檢查安裝環境",
  "strata.install.source": "取得原始碼",
  "strata.install.download": "下載引擎",
  "strata.install.verify": "驗證引擎",
  "strata.install.extract": "解壓引擎",
  "strata.install.assets": "準備控制向量",
  "strata.install.python": "建立 Python 環境",
  "strata.install.packages": "安裝 Python 相依套件",
  "strata.install.check": "檢查執行元件",
  "strata.install.complete": "安裝完成",
  "strata.install.recovery": "恢復安裝狀態",
  "strata.details": "進階設定",
  "strata.installed": "執行元件已安裝",
  "strata.stage": "獨立提示詞執行元件",
  "strata.note": "提示詞模型的獨立執行環境，不改動 ComfyUI 的 Python 套件",
  "strata.root": "自訂執行目錄（留空由應用管理）",
  "strata.port": "預留本機連接埠",
  "strata.portNote": "預設 43127；不支援 8080。",
  "strata.source": "下載原始碼 ZIP",
  "strata.engine": "下載 NVIDIA 引擎 ZIP",
  "strata.choose": "選擇目錄",
  "strata.chooseRoot": "模型路徑暫不可用，請重新掃描環境",
  "strata.notScanned": "尚未掃描此目錄",
  "strata.present": "檔案存在（未驗證可執行）",
  "strata.missing": "缺少檔案",
  "strata.evidence": "安裝校驗固定原始碼、引擎 SHA-256 與獨立 Python 套件。模型使用 GSQ-RCO GGUF 與視覺投影；首次載入會校驗並產生 pack/tokenizer，之後重用快取。CUDA 13，NVIDIA 驅動 580+。",
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
  "model.component.optional": "可選：",
  "model.component.alternativeAvailable": "替代元件未安裝（目前使用其他元件）：",
  "model.component.viewInfo": "檢視 {label} 的{info}",
  "model.component.downloadInstall": "下載與安裝",
  "model.files": "模型檔案 {found}/{total}",
  "model.shared": "共用",
  "model.recommended": "建議",
  "model.component.location": "已找到檔案",
  "model.collapse": "收起",
  "model.download": "下載",
  "lora.other": "其他 LoRA",
  "prompt.localModel": "本機提示詞模型",
  "model.component.viewSource": "檢視來源",
  "model.component.sourceRevision": "來源 revision",
  "model.component.sha256": "SHA-256",
  "model.component.fileSize": "檔案大小",
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
  "sulphur.minutesUnit": "分鐘",
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
  "prompt.description": "依所選模型執行：現有模型使用 ComfyUI，Qwen3.8-Flash-Next 使用獨立 Strata。",
  "prompt.badge": "本機執行",
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
  "prompt.h3Note": "H3 參考標籤、首尾影格關係、連續性及音視訊格式始終保留。",
  "prompt.autoVideoPresetTitle": "無提示詞影片預設",
  "prompt.autoVideoPresetDescription": "當 H3 Prompt 為空時，根據參考畫面設計動作、鏡頭和互動；與一般影片提示詞預設分開。",
  "prompt.autoVideoPresetSelection": "預設起稿方向",
  "prompt.autoVideoPresetRandom": "自動隨機輪換",
  "prompt.autoVideoPresetRandomHint": "每次清空 Prompt 後優先選擇尚未使用的起稿方向，並產生新的變化。",
  "prompt.autoVideoPresetRule": "起稿指令",
  "prompt.imagePresetTitle": "圖片提示詞預設",
  "prompt.imagePresetDescription": "只影響圖片「最佳化提示詞」時的整理策略，不改變 Qwen Image 的生成參數。",
  "prompt.imageNote": "最佳化規則不加入最終提示詞。",
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
  "nodes.groupRuntime": "執行時依賴",
  "nodes.details": "安裝詳情",
  "nodes.groupVideo": "H3 影片與續寫",
  "nodes.groupUpscale": "放大與補幀",
  "nodes.groupPrompt": "提示詞與視覺理解",
  "nodes.groupGeneral": "圖片與通用",
  "nodes.queuedCount": "等待 {count} 個",
  "nodes.cancelWaiting": "取消等待中的",
  "nodes.processingName": "正在處理 {name}",
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
  "nodes.llamaDescription": "ComfyUI 本機 GGUF 提示詞模型執行元件",
  "nodes.pythonEnvironment": "目標環境：",
  "nodes.installLog": "安裝記錄",
  "nodes.installed": "已安裝",
  "nodes.notInstalled": "未安裝",
  "nodes.installing": "安裝中…",
  "nodes.cancelInstall": "取消安裝",
  "nodes.removeQueued": "移出佇列",
  "nodes.cancelling": "正在取消…",
  "nodes.reinstall": "重新安裝",
  "nodes.oneClickInstall": "一鍵安裝",
  "nodes.projectRequired": "專案必要",
  "nodes.optional": "選用",
  "nodes.manualInstall": "需單獨安裝",
  "nodes.manualInstallHint": "此節點由使用者手動安裝；應用程式不會自動下載、更新或解除安裝。",
  "nodes.openSource": "開啟上游儲存庫",
  "nodes.prerequisite": "執行/安裝說明：",
  "nodes.versionSummary": "節點版本資訊",
  "nodes.versionLabel": "版本",
  "nodes.commitDate": "提交日期",
  "nodes.localVersion": "本機",
  "nodes.versionUnread": "未讀取",
  "nodes.recommendedVersion": "建議",
  "nodes.latestVersion": "最新",
  "nodes.versionUnavailable": "未標註",
  "nodes.rollingVersion": "滾動版",
  "nodes.rollingRecommendation": "跟隨上游",
  "nodes.pinnedVersion": "固定版",
  "nodes.rescanOnline": "連線後重新掃描",
  "nodes.runtimeMemory": "執行時固定使用系統記憶體，不額外下載模型。",
  "nodes.needsUpdate": "需要更新",
  "nodes.compatibilityWarning": "相容性待確認",
  "nodes.compatibilityError": "相容性錯誤",
  "nodes.runtimeVerified": "執行時已驗證",
  "nodes.runtimeMissing": "已安裝 · 執行階段未註冊",
  "nodes.dlss5RuntimeLabel": "DLSS5 runtime：",
  "nodes.dlss5RuntimeReady": "檔案已就緒",
  "nodes.dlss5RuntimeMissing": "已安裝 · DLSS5 runtime 不可用",
  "nodes.aetherscaleRuntimeLabel": "AetherScale carrier：",
  "nodes.aetherscaleRuntimeReady": "六檔案已就緒",
  "nodes.aetherscaleRuntimeMissing": "已安裝 · carrier runtime 不可用",
  "nodes.fileCheckPassed": "已就緒",
  "nodes.versionUnknown": "未取得",
  "nodes.installedRepair": "已安裝，需要修復",
  "nodes.updateRestart": "更新並重新啟動",
  "nodes.updateRecheck": "更新/重新啟動複檢",
  "nodes.installRestart": "安裝並重新啟動",
  "nodes.repair": "修復",
  "nodes.update": "更新",
  "nodes.uninstall": "解除安裝",
  "nodes.moreActions": "更多節點操作",
  "nodes.openLocation": "開啟位置",
  "nodes.openLocationFailed": "無法開啟所在位置，檔案或目錄可能已移動或刪除，請重新掃描。",
  "nodes.duplicateCopies": "發現多個 H3 Motion Context 副本：{paths}。請只保留一個資料夾，再重新啟動 ComfyUI。",
  "nodes.empty": "等待環境掃描結果",
  "accel.title": "效能與加速",
  "accel.description": "設定 H3 Attention 與最終影片 VAE；依賴安裝與修復在「節點與依賴」中完成。",
  "accel.eagerFallback": "未發現已安裝後端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "選擇 H3 的 Attention 後端；只影響 MiniMax H3 工作流程。",
  "accel.videoVaeTitle": "H3 影片 VAE",
  "accel.videoVaeDescription": "影響 MiniMax H3 影片 VAE 的編碼與解碼；儲存後對下一個尚未開始的 H3 工作生效，正在計算的工作不變。音訊 VAE 與其他模型不受影響。",
  "accel.videoVaeMode": "影片 VAE 後端",
  "accel.videoVaeModeTip": `FP16 是相容基線；INT8 ConvRot 是 ComfyUI 官方影片 VAE 加速路徑，建議搭配 ComfyUI ${COMFYUI_RECOMMENDED_VERSION} 與 comfy-kitchen ${H3_COMFY_KITCHEN_VERSION} CUDA 核心。`,
  "accel.videoVaeAuto": "自動 · 優先 INT8 ConvRot",
  "accel.videoVaeFp16": "相容模式 · FP16 基線",
  "accel.videoVaeInt8": "官方加速模式 · INT8 ConvRot",
  "accel.videoVaeMissing": "未偵測到 FP16 或 INT8 ConvRot 影片 VAE；設定已停用，請先安裝至少一個並重新掃描。",
  "accel.videoVaeWaiting": "等待環境掃描後讀取已安裝的影片 VAE。",
  "accel.videoVaeFp16Only": "目前只找到 FP16，INT8 ConvRot 選項已停用。",
  "accel.videoVaeInt8Only": "目前只找到 INT8 ConvRot；自動模式會優先使用它。",
  "accel.videoVaeBoth": "已找到兩種影片 VAE；自動模式優先 INT8 ConvRot，缺少時回退 FP16。",
  "accel.runtimeTitle": "執行時解譯器",
  "accel.runtimeDescription": "選擇用於啟動 ComfyUI、安裝依賴與讀取加速狀態的 Python 環境。",
  "accel.componentsTitle": "執行時元件",
  "accel.componentsDescription": "檢查 PyTorch/CUDA、H3 ConvRot 核心、SageAttention、Triton 與 KJNodes。",
  "accel.ready": "已就緒",
  "accel.pending": "待安裝/修復",
  "accel.unsupported": "環境不支援",
  "accel.probeFailed": "偵測未完成，請重新掃描",
  "accel.verifyRuntime": "重新驗證執行環境",
  "accel.verificationLive": "已即時驗證",
  "accel.verificationCached": "已使用快取驗證",
  "accel.verificationPrevious": "沿用上一輪驗證結果",
  "accel.verificationPending": "等待執行環境驗證",
  "accel.mode": "H3 Attention 後端",
  "accel.modeTip": "只影響 MiniMax H3 工作流程；其他模型的採樣與節點策略在各自的模型或工作流程設定中管理。",
  "accel.modeSage": "SageAttention CUDA · 備選",
  "accel.modeSageTip": "備選。CUDA FP16 SageAttention 是已驗證基線，但目前 4090 同任務實測慢於 Triton + SOL；仍要求 CUDA、PyTorch 與 wheel 精確相符。",
  "accel.modeSageTriton": "SageAttention Triton · 推薦",
  "accel.modeSageTritonTip": "推薦。目前 4090 同任務中，搭配 SOL 速度最快；稠密模式的峰值顯存也最低。需要 SageAttention 與 Triton 環境。",
  "accel.modePytorch": "PyTorch Attention · 相容回退",
  "accel.modePytorchTip": "僅作相容回退。不依賴 SageAttention 或 Triton，相容性最高，但通常最慢，不作為目前 4090 的效能推薦。",
  "accel.modeComfyKitchen": "Comfy Kitchen INT8 · 稠密次選",
  "accel.modeComfyKitchenTip": "稠密模式次選。目前 4090 同任務比 Sage CUDA 稠密更快且記憶體更低；與 SOL 組合已出現顯存不足，只建議搭配稠密 Attention。",
  "accel.sparseMode": "H3 稀疏 Attention",
  "accel.sparseModeTip": "全域只保留已可測試的稠密與 SOL。Turbo-SLA 的專用 SLA 由任務配方內部綁定；未驗證的 VSA 不在這裡顯示。",
  "accel.sparseOff": "稠密 Attention · 穩定推薦",
  "accel.sparseOffTip": "穩定推薦。使用所選後端的完整稠密路徑，是排查品質、顯存與相容性的基線；Comfy Kitchen 只建議使用此項。",
  "accel.sparseSolAttn": "SOL-Attn 稀疏 · 速度優先（會影響品質）",
  "accel.sparseSolAttnTip": "實驗性速度優先。實際 H3 對照已觀察到明顯的影片品質下降，並會改變相同 seed 輸出；影響程度因素材而異。目前 4090 搭配 Sage Triton 最快，但不降低峰值顯存，且不要與 Comfy Kitchen 組合。",
  "accel.runtimeMode": "H3 執行時策略",
  "accel.runtimeModeTip": "選擇 H3 的模型駐留與卸載方式。目前 4090/64 GB 實測應優先固定駐留。",
  "accel.runtimeCompatibility": "固定駐留 · 強烈推薦",
  "accel.runtimeCompatibilityTip": "強烈推薦。不啟用 Dynamic VRAM 或 async offload；目前測試更快，RAM 峰值約 34–37 GiB，Shared GPU 低於 1 GiB。",
  "accel.runtimeNative": "動態顯存 + 非同步卸載 · 不推薦",
  "accel.runtimeNativeTip": "不推薦。目前測試慢約 13–20%，RAM 峰值接近 63 GiB、Shared GPU 約 25 GiB，只節省約 1 GiB 專用顯存，容易受系統負載影響而 OOM。",
  "accel.compilerMode": "Comfy 編譯器",
  "accel.compilerModeTip": "這不是智慧擇優；啟用後 ComfyUI 會記錄顯存配置、預取並嘗試 CUDA Graph，可能增加峰值顯存。目前 RTX 4090/H3 預設關閉；關閉時僅對 H3 啟用 --disable-comfy-compiler。",
  "accel.compilerAuto": "啟用 Comfy 編譯器 · 高顯存實驗",
  "accel.compilerDisabled": "停用 Comfy 編譯器 · H3/4090 建議",
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
  "strata.title": "Strata · Independent prompt runtime",
  "prompt.uncensored": "Uncensored mode",
  "prompt.reasoning": "Reasoning effort",
  "prompt.reasoning.off": "Off",
  "prompt.reasoning.low": "Low",
  "prompt.reasoning.medium": "Medium",
  "prompt.reasoning.high": "High",
  "prompt.reasoningHint": "Applies to the next enhancement after saving, without reloading. High is the official xhigh level; high and xhigh are aliases.",
  "prompt.uncensored.off": "Off",
  "prompt.uncensored.builtin": "Bundled · ESP",
  "prompt.uncensored.community": "Community · sergqwer",
  "prompt.uncensoredHint": "Weights stay unchanged. Applies to the next enhancement after saving; first activation or changing vectors reloads the model. Results vary by task.",
  "prompt.uncensoredUnsupported": "Not supported by this model; the preference is retained for compatible models.",
  "strata.install.prepare": "Checking environment",
  "strata.install.source": "Fetching source",
  "strata.install.download": "Downloading engine",
  "strata.install.verify": "Verifying engine",
  "strata.install.extract": "Extracting engine",
  "strata.install.assets": "Preparing control vectors",
  "strata.install.python": "Creating Python environment",
  "strata.install.packages": "Installing Python packages",
  "strata.install.check": "Checking runtime files",
  "strata.install.complete": "Installation complete",
  "strata.install.recovery": "Recovering installation",
  "strata.details": "Advanced settings",
  "strata.installed": "Runtime components installed",
  "strata.stage": "Independent prompt runtime",
  "strata.note": "Independent prompt model runtime; keeps ComfyUI Python packages unchanged",
  "strata.root": "Custom runtime directory (leave empty for app management)",
  "strata.port": "Reserved local port",
  "strata.portNote": "Default: 43127. Port 8080 is not supported.",
  "strata.source": "Download source ZIP",
  "strata.engine": "Download NVIDIA engine ZIP",
  "strata.choose": "Choose directory",
  "strata.chooseRoot": "Model path unavailable; rescan the environment",
  "strata.notScanned": "This directory has not been scanned",
  "strata.present": "File present (execution not verified)",
  "strata.missing": "File missing",
  "strata.evidence": "Installation checks the pinned source, engine SHA-256 and isolated Python packages. GSQ-RCO GGUF shards and a vision projector are verified and packed on first load; later loads reuse the cache. CUDA 13 and NVIDIA driver 580+.",
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
  "model.component.optional": "Optional: ",
  "model.component.alternativeAvailable": "Alternative not installed (another component is currently used):",
  "model.component.viewInfo": "View download and installation instructions for {label}",
  "model.component.downloadInstall": "Download & install",
  "model.files": "Model files {found}/{total}",
  "model.shared": "Shared",
  "model.recommended": "Recommended",
  "model.component.location": "Located files",
  "model.collapse": "Collapse",
  "model.download": "Download",
  "lora.other": "Other LoRAs",
  "prompt.localModel": "Local prompt model",
  "model.component.viewSource": "View source",
  "model.component.sourceRevision": "Source revision",
  "model.component.sha256": "SHA-256",
  "model.component.fileSize": "File size",
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
  "sulphur.minutesUnit": "min",
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
  "prompt.description": "Runs with the selected model: existing models use ComfyUI; Qwen3.8-Flash-Next uses independent Strata.",
  "prompt.badge": "Local runtime",
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
  "prompt.h3Note": "The H3 baseline preserves references, start/end frames, continuity and audiovisual format.",
  "prompt.autoVideoPresetTitle": "No-prompt video presets",
  "prompt.autoVideoPresetDescription": "When the H3 Prompt is blank, design motion, camera, and interaction from the reference media. This is separate from normal video prompt presets.",
  "prompt.autoVideoPresetSelection": "Default drafting direction",
  "prompt.autoVideoPresetRandom": "Automatic random rotation",
  "prompt.autoVideoPresetRandomHint": "After the Prompt is cleared, prefer an unused direction and create a new variation.",
  "prompt.autoVideoPresetRule": "Drafting instruction",
  "prompt.imagePresetTitle": "Image prompt presets",
  "prompt.imagePresetDescription": "Only affects how the image Optimize Prompt action organizes instructions; it does not change Qwen Image generation parameters.",
  "prompt.imageNote": "Optimization rules stay out of the final prompt.",
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
  "nodes.groupRuntime": "Runtime dependencies",
  "nodes.details": "Installation details",
  "nodes.groupVideo": "H3 video & continuation",
  "nodes.groupUpscale": "Upscaling & interpolation",
  "nodes.groupPrompt": "Prompt & vision",
  "nodes.groupGeneral": "Image & general",
  "nodes.queuedCount": "{count} waiting",
  "nodes.cancelWaiting": "Cancel waiting",
  "nodes.processingName": "Processing {name}",
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
  "nodes.llamaDescription": "Runtime for local GGUF prompt models in ComfyUI",
  "nodes.pythonEnvironment": "Target environment: ",
  "nodes.installLog": "Installation log",
  "nodes.installed": "Installed",
  "nodes.notInstalled": "Not installed",
  "nodes.installing": "Installing…",
  "nodes.cancelInstall": "Cancel install",
  "nodes.removeQueued": "Remove queued",
  "nodes.cancelling": "Cancelling…",
  "nodes.reinstall": "Reinstall",
  "nodes.oneClickInstall": "Install with one click",
  "nodes.projectRequired": "Project required",
  "nodes.optional": "Optional",
  "nodes.manualInstall": "Install separately",
  "nodes.manualInstallHint": "Install this node manually; the app does not download, update, or uninstall it.",
  "nodes.openSource": "Open upstream repository",
  "nodes.prerequisite": "Runtime/install note: ",
  "nodes.versionSummary": "Node versions",
  "nodes.versionLabel": "Version",
  "nodes.commitDate": "Commit date",
  "nodes.localVersion": "Local",
  "nodes.versionUnread": "Not detected",
  "nodes.recommendedVersion": "Recommended",
  "nodes.latestVersion": "Latest",
  "nodes.versionUnavailable": "Not published",
  "nodes.rollingVersion": "Rolling",
  "nodes.rollingRecommendation": "Track upstream",
  "nodes.pinnedVersion": "Pinned",
  "nodes.rescanOnline": "Rescan after connecting",
  "nodes.runtimeMemory": "Uses system memory at runtime and does not download extra models.",
  "nodes.needsUpdate": "Needs update",
  "nodes.compatibilityWarning": "Compatibility pending",
  "nodes.compatibilityError": "Compatibility error",
  "nodes.runtimeVerified": "Runtime verified",
  "nodes.runtimeMissing": "Installed · not registered at runtime",
  "nodes.dlss5RuntimeLabel": "DLSS5 runtime: ",
  "nodes.dlss5RuntimeReady": "Files ready",
  "nodes.dlss5RuntimeMissing": "Installed · DLSS5 runtime unavailable",
  "nodes.aetherscaleRuntimeLabel": "AetherScale carrier: ",
  "nodes.aetherscaleRuntimeReady": "Six files ready",
  "nodes.aetherscaleRuntimeMissing": "Installed · carrier runtime unavailable",
  "nodes.fileCheckPassed": "Ready",
  "nodes.versionUnknown": "Unavailable",
  "nodes.installedRepair": "Installed; repair needed",
  "nodes.updateRestart": "Update and restart",
  "nodes.updateRecheck": "Update/restart and recheck",
  "nodes.installRestart": "Install and restart",
  "nodes.repair": "Repair",
  "nodes.update": "Update",
  "nodes.uninstall": "Uninstall",
  "nodes.moreActions": "More node actions",
  "nodes.openLocation": "Open location",
  "nodes.openLocationFailed": "Could not open the location. The file or folder may have moved or been deleted; scan again.",
  "nodes.duplicateCopies": "Multiple H3 Motion Context copies detected: {paths}. Keep only one directory, then restart ComfyUI.",
  "nodes.empty": "Waiting for environment scan",
  "accel.title": "Performance & acceleration",
  "accel.description": "Configure H3 Attention and the final video VAE; install and repair dependencies in Nodes & dependencies.",
  "accel.eagerFallback": "No installed backend found",
  "accel.strategyTitle": "H3 acceleration strategy",
  "accel.strategyDescription": "Choose the H3 Attention backend; this only affects MiniMax H3 workflows.",
  "accel.videoVaeTitle": "H3 video VAE",
  "accel.videoVaeDescription": "Affects MiniMax H3 video VAE encoding and decoding; after saving, it applies to the next H3 task that has not started. A task already computing is unchanged. The audio VAE and other models are unaffected.",
  "accel.videoVaeMode": "Video VAE backend",
  "accel.videoVaeModeTip": `FP16 is the compatibility baseline. INT8 ConvRot is ComfyUI's official video VAE acceleration path; pair it with the recommended ComfyUI ${COMFYUI_RECOMMENDED_VERSION} and comfy-kitchen ${H3_COMFY_KITCHEN_VERSION} CUDA kernel.`,
  "accel.videoVaeAuto": "Automatic · prefer INT8 ConvRot",
  "accel.videoVaeFp16": "Compatibility mode · FP16 baseline",
  "accel.videoVaeInt8": "Official acceleration · INT8 ConvRot",
  "accel.videoVaeMissing": "No FP16 or INT8 ConvRot video VAE was detected; this setting is disabled. Install at least one and scan again.",
  "accel.videoVaeWaiting": "Waiting for an environment scan to read installed video VAEs.",
  "accel.videoVaeFp16Only": "Only FP16 was found; INT8 ConvRot is disabled.",
  "accel.videoVaeInt8Only": "Only INT8 ConvRot was found; automatic mode will prefer it.",
  "accel.videoVaeBoth": "Both video VAEs were found; automatic mode prefers INT8 ConvRot and falls back to FP16 when it is unavailable.",
  "accel.runtimeTitle": "Runtime interpreter",
  "accel.runtimeDescription": "Choose the Python environment used to start ComfyUI, install dependencies, and inspect acceleration status.",
  "accel.componentsTitle": "Runtime components",
  "accel.componentsDescription": "Check PyTorch/CUDA, H3 ConvRot kernels, SageAttention, Triton, and KJNodes.",
  "accel.ready": "Ready",
  "accel.pending": "Needs install/repair",
  "accel.unsupported": "Environment unsupported",
  "accel.probeFailed": "Detection incomplete; scan again",
  "accel.verifyRuntime": "Re-verify runtime",
  "accel.verificationLive": "Live verification",
  "accel.verificationCached": "Cached verification",
  "accel.verificationPrevious": "Using the previous verification",
  "accel.verificationPending": "Runtime verification pending",
  "accel.mode": "H3 Attention backend",
  "accel.modeTip": "This only affects MiniMax H3 workflows. Other models keep their own sampling and node policies.",
  "accel.modeSage": "SageAttention CUDA · alternative",
  "accel.modeSageTip": "Alternative. CUDA FP16 SageAttention is a validated baseline, but the current 4090 comparison was slower than Triton + SOL. It still requires an exact CUDA, PyTorch, and wheel match.",
  "accel.modeSageTriton": "SageAttention Triton · recommended",
  "accel.modeSageTritonTip": "Recommended. In the current matched 4090 runs it was fastest with SOL, while its dense path also had the lowest peak VRAM. Requires SageAttention and Triton.",
  "accel.modePytorch": "PyTorch Attention · compatibility fallback",
  "accel.modePytorchTip": "Compatibility fallback only. It does not require SageAttention or Triton, but is usually slowest and is not the current performance recommendation for RTX 4090.",
  "accel.modeComfyKitchen": "Comfy Kitchen INT8 · dense runner-up",
  "accel.modeComfyKitchenTip": "Runner-up for dense mode. It beat dense Sage CUDA with lower memory in the current matched 4090 run. Kitchen + SOL has run out of memory, so use Kitchen only with dense Attention.",
  "accel.sparseMode": "H3 sparse Attention",
  "accel.sparseModeTip": "Only the testable dense and SOL paths are exposed globally. Turbo-SLA binds its dedicated SLA inside the task recipe; unvalidated VSA is hidden.",
  "accel.sparseOff": "Dense Attention · stable recommendation",
  "accel.sparseOffTip": "Stable recommendation. Uses the full dense path of the selected backend and provides the quality, memory, and compatibility baseline. Comfy Kitchen should use this option only.",
  "accel.sparseSolAttn": "SOL-Attn sparse · speed-first (quality impact)",
  "accel.sparseSolAttnTip": "Experimental and speed-first. Matched H3 testing showed a clear loss of video quality and changed same-seed output; severity varies by source. It was fastest with Sage Triton on the current RTX 4090, but does not lower peak VRAM and must not be combined with Comfy Kitchen.",
  "accel.runtimeMode": "H3 runtime policy",
  "accel.runtimeModeTip": "Choose how H3 models remain resident or offload. Current RTX 4090/64 GB measurements strongly favor fixed residency.",
  "accel.runtimeCompatibility": "Fixed residency · strongly recommended",
  "accel.runtimeCompatibilityTip": "Strongly recommended. Does not enable dynamic VRAM or async offload. Current runs were faster, with roughly 34–37 GiB peak RAM and under 1 GiB shared GPU memory.",
  "accel.runtimeNative": "Dynamic VRAM + async offload · not recommended",
  "accel.runtimeNativeTip": "Not recommended. Current runs were about 13–20% slower, reached roughly 63 GiB RAM and 25 GiB shared GPU memory, and saved only about 1 GiB dedicated VRAM, leaving the run sensitive to OOM.",
  "accel.compilerMode": "Comfy compiler",
  "accel.compilerModeTip": "This is not an optimizer selector. Enabling it records allocations, prefetches modules, and may try CUDA Graphs; peak VRAM can increase. It is off by default for H3 on RTX 4090. Off adds --disable-comfy-compiler only for H3.",
  "accel.compilerAuto": "Enable Comfy compiler · high-VRAM experiment",
  "accel.compilerDisabled": "Disable Comfy compiler · recommended for H3/4090",
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
    "visible-affordance": "围绕已有物体设计动作。",
    "gaze-and-intent": "用视线与姿态表达意图。",
    "camera-discovery": "用运镜逐步揭示画面细节。",
    "environmental-cascade": "让环境变化带动连锁运动。",
    "cause-and-effect": "组织准备、动作、反应与收尾。",
    "playful-surprise": "加入符合画面的轻巧意外。",
    "documentary-moment": "用自然微动作呈现纪实感。",
    "material-response": "突出材质随运动产生的变化。",
    "spatial-journey": "让主体在原有空间中短距离移动。",
    "rhythmic-beats": "以动作、反应与停顿组织节奏。",
    "contrast-and-settle": "用动静等对比推进并稳定收尾。",
    "subject-pair": "设计主体之间或与环境的互动。",
    "character-interaction": "安排可见角色的动作与回应。",
    "mini-narrative": "在原场景内组织简短起承转合。",
    "contextual-action-dialogue": "按角色与场景组织动作，适时加入对白。",
    "mild-adult-atmosphere": "仅对明确成年角色营造含蓄暧昧氛围。",
    "hollywood-cinematic": "用布光、运镜与调度营造电影感。",
    "stillness-break": "从静止起步，以细微动作打破停顿。"
  },
  "zh-TW": {
    "visible-affordance": "圍繞既有物體設計動作。",
    "gaze-and-intent": "用視線與姿態表達意圖。",
    "camera-discovery": "用運鏡逐步揭示畫面細節。",
    "environmental-cascade": "讓環境變化帶動連鎖運動。",
    "cause-and-effect": "組織準備、動作、反應與收尾。",
    "playful-surprise": "加入符合畫面的輕巧意外。",
    "documentary-moment": "用自然微動作呈現紀實感。",
    "material-response": "突出材質隨運動產生的變化。",
    "spatial-journey": "讓主體在原有空間中短距離移動。",
    "rhythmic-beats": "以動作、反應與停頓組織節奏。",
    "contrast-and-settle": "用動靜等對比推進並穩定收尾。",
    "subject-pair": "設計主體之間或與環境的互動。",
    "character-interaction": "安排可見角色的動作與回應。",
    "mini-narrative": "在原場景內組織簡短起承轉合。",
    "contextual-action-dialogue": "按角色與場景組織動作，適時加入對白。",
    "mild-adult-atmosphere": "僅對明確成年角色營造含蓄曖昧氛圍。",
    "hollywood-cinematic": "用布光、運鏡與調度營造電影感。",
    "stillness-break": "從靜止起步，以細微動作打破停頓。"
  },
  "en-US": {
    "visible-affordance": "Build action around visible objects.",
    "gaze-and-intent": "Express intent through gaze and posture.",
    "camera-discovery": "Reveal existing details through camera movement.",
    "environmental-cascade": "Link environmental changes into secondary motion.",
    "cause-and-effect": "Connect preparation, action, reaction and resolution.",
    "playful-surprise": "Add a small, plausible surprise.",
    "documentary-moment": "Capture natural, observational micro-actions.",
    "material-response": "Focus on materials responding to motion.",
    "spatial-journey": "Move the subject through the existing space.",
    "rhythmic-beats": "Shape rhythm through action, reaction and pauses.",
    "contrast-and-settle": "Build contrast and finish in a settled state.",
    "subject-pair": "Connect subjects with each other or the environment.",
    "character-interaction": "Give visible characters distinct actions and responses.",
    "mini-narrative": "Tell a tiny story within the existing setting.",
    "contextual-action-dialogue": "Choose actions and brief dialogue suited to the scene.",
    "mild-adult-atmosphere": "Add restrained sensuality for clearly adult subjects only.",
    "hollywood-cinematic": "Develop cinematic lighting, camera work and staging.",
    "stillness-break": "Break a still opening with one precise motion."
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
    "qwen-image-2-1": "RTX 4090 24GB 推荐 · INT8 ConvRot + BF16 VAE · 首期 1 MP，2K 待验证",
    "qwen-image-2-1-turbo": "RTX 4090 24GB 推荐 · Turbo INT8 ConvRot + BF16 VAE · 官方 8 步",
    "qwen-image-2-1-uncensored-gguf": "RTX 4090 24GB 推荐 · Q8_0 GGUF + Qwen3-VL INT8 · 需要 ComfyUI-GGUF",
    "qwen-image-2-1-uncensored-gguf-q6": "RTX 4090 24GB 推荐 · Q6_K GGUF + Qwen3-VL INT8 · 需要 ComfyUI-GGUF",
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
    minimax_h3_omni: "22.2GB INT8 权重 · 需 RAM/offload · 显存峰值与速度待实测",
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
    "qwen-image-2-1": "RTX 4090 24GB 推薦 · INT8 ConvRot + BF16 VAE · 首期 1 MP，2K 待驗證",
    "qwen-image-2-1-turbo": "RTX 4090 24GB 推薦 · Turbo INT8 ConvRot + BF16 VAE · 官方 8 步",
    "qwen-image-2-1-uncensored-gguf": "RTX 4090 24GB 推薦 · Q8_0 GGUF + Qwen3-VL INT8 · 需要 ComfyUI-GGUF",
    "qwen-image-2-1-uncensored-gguf-q6": "RTX 4090 24GB 推薦 · Q6_K GGUF + Qwen3-VL INT8 · 需要 ComfyUI-GGUF",
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
    minimax_h3_omni: "22.2GB INT8 權重 · 需 RAM/offload · 顯存峰值與速度待實測",
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
    "qwen-image-2-1": "RTX 4090 24GB recommended · INT8 ConvRot + BF16 VAE · 1 MP first; 2K pending validation",
    "qwen-image-2-1-turbo": "RTX 4090 24GB recommended · Turbo INT8 ConvRot + BF16 VAE · official 8 steps",
    "qwen-image-2-1-uncensored-gguf": "RTX 4090 24GB recommended · Q8_0 GGUF + INT8 Qwen3-VL · requires ComfyUI-GGUF",
    "qwen-image-2-1-uncensored-gguf-q6": "RTX 4090 24GB recommended · Q6_K GGUF + INT8 Qwen3-VL · requires ComfyUI-GGUF",
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
    minimax_h3_omni: "22.2GB INT8 weights · RAM/offload required · peak VRAM and speed unmeasured",
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
  const scan = modelCatalog.get(profile.id)?.definition.scan;
  if (scan?.managedBy === "strata") return scan.vram;
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

const nodePurposeCopy: Record<string, readonly [string, string, string]> = {
  "video-helper-suite": [
    "视频读取、编码与音频封装",
    "影片讀取、編碼與音訊封裝",
    "Video loading, encoding and audio muxing"
  ],
  "comfyui-gguf": [
    "GGUF 扩散模型加载",
    "GGUF 擴散模型載入",
    "GGUF diffusion model loading"
  ],
  "kjnodes": [
    "模型补丁与 H3 实时预览",
    "模型補丁與 H3 即時預覽",
    "Model patches and live H3 previews"
  ],
  "ltx-video": [
    "Sulphur 2 续写与低显存运行",
    "Sulphur 2 續寫與低顯存執行",
    "Sulphur 2 continuation and low-VRAM execution"
  ],
  "minimax-h3-prompt-writer": [
    "Gemma 4 素材理解与 H3 提示词",
    "Gemma 4 素材理解與 H3 提示詞",
    "Gemma 4 media understanding and H3 prompts"
  ],
  "comfyui-multimodal-prompt-nodes": [
    "Qwen 图片理解与提示词生成",
    "Qwen 圖片理解與提示詞產生",
    "Qwen image understanding and prompt generation"
  ],
  "comfyui-qwenvl-lora": [
    "H3 提示词重写 LoRA",
    "H3 提示詞重寫 LoRA",
    "H3 prompt rewriting LoRA"
  ],
  "inpaint-nodes": [
    "LaMa 蒙版修补与目标移除",
    "LaMa 遮罩修補與目標移除",
    "LaMa masked inpainting and object removal"
  ],
  "seedvr2": [
    "视频超分辨率",
    "影片超解析度",
    "Video super-resolution"
  ],
  "flashvsr": [
    "视频超分辨率",
    "影片超解析度",
    "Video super-resolution"
  ],
  "frame-interpolation": [
    "RIFE / FILM 视频补帧",
    "RIFE / FILM 影片補幀",
    "RIFE / FILM frame interpolation"
  ],
  "comfyui-dlss-frame-interpolation": [
    "DLSS 视频放大、时序增强与补帧",
    "DLSS 影片放大、時序增強與補幀",
    "DLSS upscaling, temporal enhancement and interpolation"
  ],
  "h3-motion-context": [
    "继承源视频的运动与音频",
    "繼承來源影片的運動與音訊",
    "Continue motion and audio from the source video"
  ],
  "h3-continuum": [
    "长视频分段生成、续写与拼接",
    "長影片分段產生、續寫與拼接",
    "Segmented long-video generation, continuation and joining"
  ],
  "h3-latent-upscaler": [
    "H3 音画数据拆分与二次采样",
    "H3 音畫資料拆分與二次採樣",
    "H3 audio/video latent splitting and second sampling"
  ],
  "minimax-h3-learned-upscaler": [
    "H3 视频 latent 三维放大",
    "H3 影片 latent 三維放大",
    "Learned 3D upscaling of H3 video latents"
  ],
  "local-video-studio-h3-av": [
    "H3 音画数据保存与接续",
    "H3 音畫資料儲存與接續",
    "H3 audio/video data storage and continuation"
  ],
  "mmh3-ultimate-upscale": [
    "H3 高分辨率分块放大",
    "H3 高解析度分塊放大",
    "Tiled high-resolution H3 upscaling"
  ],
  "spectrum-minimax-h3": [
    "H3 采样加速",
    "H3 採樣加速",
    "H3 sampling acceleration"
  ],
  "plaguekind-h3-sla": [
    "旧版 H3 稀疏注意力工作流兼容",
    "舊版 H3 稀疏注意力工作流程相容",
    "Compatibility for older sparse-attention H3 workflows"
  ],
  "comfyui-gguf-h3": [
    "H3 Q3 实验模型加载",
    "H3 Q3 實驗模型載入",
    "Experimental H3 Q3 model loading"
  ]
};

export function settingsNodePurpose(locale: UiLocale | undefined, id: string, fallback: string): string {
  return nodePurposeCopy[id]?.[locale === "en-US" ? 2 : locale === "zh-TW" ? 1 : 0] ?? fallback;
}

export function settingsText(
  locale: UiLocale | undefined,
  key: SettingsCopyKey,
  params: Params = {}
): string {
  const catalog = locale === "en-US" ? enUS : locale === "zh-TW" ? zhTW : zhCN;
  return interpolate(catalog[key] ?? zhCN[key], params);
}
