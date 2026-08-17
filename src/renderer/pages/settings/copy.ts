import type { UiLocale } from "../../../types";

type SettingsCopyKey =
  | "video.title"
  | "video.description"
  | "video.defaultModel"
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
  | "lora.scan"
  | "lora.turbo"
  | "lora.empty"
  | "image.title"
  | "image.description"
  | "image.defaultModel"
  | "image.defaultQuality"
  | "image.defaultCount"
  | "image.countUnit"
  | "image.scanning"
  | "image.summary"
  | "image.waitingScan"
  | "image.note"
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
  | "prompt.videoPresetTitle"
  | "prompt.videoPresetDescription"
  | "prompt.restore"
  | "prompt.currentPreset"
  | "prompt.ruleHeader"
  | "prompt.h3Note"
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
  | "nodes.installNote"
  | "nodes.installAll"
  | "nodes.updateAll"
  | "nodes.h3Title"
  | "nodes.h3Badge"
  | "nodes.h3Description"
  | "nodes.waitingCore"
  | "nodes.minimumVersion"
  | "nodes.coreLog"
  | "nodes.loaded"
  | "nodes.coreMissing"
  | "nodes.notChecked"
  | "nodes.processing"
  | "nodes.waitingPosition"
  | "nodes.finalizing"
  | "nodes.repairUpdate"
  | "nodes.startCheck"
  | "nodes.qwenTitle"
  | "nodes.qwenBadge"
  | "nodes.qwenDescription"
  | "nodes.waitingQwen"
  | "nodes.officialWorkflow"
  | "nodes.installLog"
  | "nodes.installed"
  | "nodes.notInstalled"
  | "nodes.installing"
  | "nodes.reinstall"
  | "nodes.oneClickInstall"
  | "nodes.projectRequired"
  | "nodes.optional"
  | "nodes.manualInstall"
  | "nodes.prerequisite"
  | "nodes.localVersion"
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
  | "nodes.fileCheckPassed"
  | "nodes.installedRepair"
  | "nodes.updateRestart"
  | "nodes.updateRecheck"
  | "nodes.checkUpdate"
  | "nodes.installRestart"
  | "nodes.empty"
  | "nodes.placeholderTitle"
  | "nodes.placeholderDescription"
  | "accel.title"
  | "accel.description"
  | "accel.strategyTitle"
  | "accel.strategyDescription"
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
  | "accel.modeSageTriton"
  | "accel.modePytorch"
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
  | "shared.longer";

type Params = Record<string, string | number>;

type SettingsCopyCatalog = Record<SettingsCopyKey, string>;

const zhCN: SettingsCopyCatalog = {
  "video.title": "视频模型",
  "video.description": "根据真实文件组件判断是否可用，不仅检查单个 checkpoint 名称。",
  "video.defaultModel": "默认模型",
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
  "lora.title": "视频 LoRA",
  "lora.description": "LoRA 是叠加在基础模型上的可选适配层，不再作为独立视频模型显示。",
  "lora.available": "{available}/{total} 可用",
  "lora.scan": "标准 .safetensors LoRA 由 ComfyUI 核心 LoraLoaderModelOnly 加载，不需要单独安装节点。只有带自定义加载器、采样器、缓存或模型补丁的特殊 LoRA 才会额外依赖节点。",
  "lora.turbo": "LightX2V Turbo 4-Step 仅兼容 MiniMax H3 FL2VA。启用后默认使用 strength 0.75、ER-SDE、Beta 和 8 步；它减少采样步数，但不会把 H3 变成低显存模型。",
  "lora.empty": "尚无 LoRA 扫描结果",
  "image.title": "图片编辑模型",
  "image.description": "选择适合当前显存的本地图像模型；只有组件和工作流完成验证后，创建页才会允许提交。",
  "image.defaultModel": "默认图片模型",
  "image.defaultQuality": "默认质量档",
  "image.defaultCount": "默认生成数量",
  "image.countUnit": "张",
  "image.scanning": "正在扫描图片模型组件和 ComfyUI 节点…",
  "image.summary": "找到 {components} 个组件完整档位，{workflows} 个工作流可用；Qwen 2511 当前最多支持 3 张 Picture",
  "image.waitingScan": "等待首次扫描",
  "image.note": "图片工作流固定输出 PNG，便于继续编辑和交给 H3 使用。Qwen 2511 会在下次启动 ComfyUI 时自动使用 CPU VAE、文本编码器卸载和更激进的显存回收；FLUX.2 Klein 4B 是 4090 的优先轻量候选。",
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
  "prompt.summary": "找到 {count} 个提示词模型档位",
  "prompt.waitingScan": "等待首次扫描",
  "prompt.note": "Qwen Safetensors 使用 ComfyUI 官方 models/text_encoders 分类；Gemma GGUF 使用 H3 Prompt Writer 扩展注册的大写 models/LLM/独立子目录，主模型与匹配的 mmproj 必须放在一起。扩写完成会自动卸载，不需要安装或启动 llama-server、LM Studio。",
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
  "prompt.videoPresetTitle": "视频提示词预设",
  "prompt.videoPresetDescription": "预设会把原始文字和参考图整理成完整的 H3 视频提示词，覆盖主体、场景、动作、镜头、声音、对白和连续性。",
  "prompt.restore": "恢复默认",
  "prompt.currentPreset": "当前编辑预设",
  "prompt.ruleHeader": "预设规则头",
  "prompt.h3Note": "规则头可自由修改；内置的 H3 官方基线会继续强制参考标签、首尾帧关系、连续性、音频和输出格式。修改后点击设置页顶部“保存设置”，创建页下次扩写立即使用。",
  "prompt.imagePresetTitle": "图片提示词预设",
  "prompt.imagePresetDescription": "只影响图片“优化提示词”时的整理策略，不改变 Qwen Image 的生成参数。",
  "prompt.imageNote": "规则头会作为图片 Prompt 优化器的策略说明；最终发送给 Qwen Image 的 Prompt 不会包含这段设置文本。",
  "prompt.empty": "尚无提示词模型扫描结果",
  "upscale.title": "分辨率提升模型",
  "upscale.description": "只有组件完整的模型才能进入后续提升工作流。",
  "upscale.defaultModel": "默认模型",
  "upscale.seedWeight": "SeedVR2 权重",
  "upscale.realesrganWeight": "Real-ESRGAN 权重",
  "upscale.missingComponent": " · 缺组件",
  "upscale.scanning": "正在扫描模型目录…",
  "upscale.summary": "找到 {available} 个可运行模型，{pending} 个待补齐",
  "upscale.waitingScan": "等待首次扫描",
  "upscale.empty": "尚无模型扫描结果",
  "nodes.title": "节点与工作流依赖",
  "nodes.description": "换电脑后按项目清单复现 ComfyUI 节点环境",
  "nodes.installNote": "安装只使用项目内置仓库清单；一键安装会跳过带系统级编译前置的可选节点，这类节点请按卡片说明单独安装。完成后重启 ComfyUI，再重新扫描。",
  "nodes.installAll": "安装 / 更新缺失节点",
  "nodes.updateAll": "更新全部节点",
  "nodes.h3Title": "MiniMax H3 原生音视频核心",
  "nodes.h3Badge": "ComfyUI v0.31.0+ · 推荐 v0.33.1",
  "nodes.h3Description": "LightX2V Turbo 直接使用 ComfyUI 原生 LoRA 与音视频采样，不需要额外的 Turbo custom node；版本过低时请更新所选 ComfyUI 并重启复检。",
  "nodes.waitingCore": "等待扫描核心节点",
  "nodes.minimumVersion": "最低版本",
  "nodes.coreLog": "核心处理日志",
  "nodes.loaded": "已加载",
  "nodes.coreMissing": "核心缺失",
  "nodes.notChecked": "尚未启动检测",
  "nodes.processing": "处理中…",
  "nodes.waitingPosition": "排队中 · 第 {position} 个",
  "nodes.finalizing": "正在重启并复检…",
  "nodes.repairUpdate": "一键补齐/更新",
  "nodes.startCheck": "启动并检测",
  "nodes.qwenTitle": "Qwen 提示词核心节点",
  "nodes.qwenBadge": "ComfyUI 核心",
  "nodes.qwenDescription": "Qwen3.5 2B/4B 使用 ComfyUI 自带的文本生成链路，不需要安装第三方节点；更新 ComfyUI 核心后重新扫描即可。",
  "nodes.waitingQwen": "等待扫描 Qwen 核心节点",
  "nodes.officialWorkflow": "官方工作流",
  "nodes.installLog": "安装日志",
  "nodes.installed": "已安装",
  "nodes.notInstalled": "未安装",
  "nodes.installing": "安装中…",
  "nodes.reinstall": "重新安装",
  "nodes.oneClickInstall": "一键安装",
  "nodes.projectRequired": "项目必需",
  "nodes.optional": "可选",
  "nodes.manualInstall": "需单独安装",
  "nodes.prerequisite": "运行/安装说明：",
  "nodes.localVersion": "本机版本：",
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
  "nodes.fileCheckPassed": "文件检查通过",
  "nodes.installedRepair": "已安装，需修复",
  "nodes.updateRestart": "更新并重启",
  "nodes.updateRecheck": "更新/重启复检",
  "nodes.checkUpdate": "检查更新",
  "nodes.installRestart": "安装并重启",
  "nodes.empty": "等待环境扫描结果",
  "nodes.placeholderTitle": "工作流占位符",
  "nodes.placeholderDescription": "提交自定义视频 ComfyUI API JSON 前会递归替换；图片工作流不使用这些占位符。",
  "accel.title": "性能与加速",
  "accel.description": "查看 GPU 运行时状态并配置 H3 加速后端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "选择 H3 的 Attention 后端；仅影响 MiniMax H3 工作流。",
  "accel.runtimeTitle": "运行时解释器",
  "accel.runtimeDescription": "选择用于启动 ComfyUI、安装依赖和读取加速状态的 Python 环境。",
  "accel.componentsTitle": "运行时组件",
  "accel.componentsDescription": "检查当前环境中的 PyTorch、CUDA、SageAttention、Triton 与 KJNodes。",
  "accel.ready": "已就绪",
  "accel.pending": "待安装/修复",
  "accel.unsupported": "环境不支持",
  "accel.mode": "H3 Attention 后端",
  "accel.modeTip": "只影响 MiniMax H3 工作流；其他模型的采样和节点策略在各自的模型或工作流设置中管理。",
  "accel.modeSage": "自动加速 · SageAttention CUDA FP16",
  "accel.modeSageTriton": "稳定加速 · SageAttention Triton FP16",
  "accel.modePytorch": "兼容模式 · PyTorch Attention",
  "accel.auto": "自动加速",
  "accel.stable": "稳定加速",
  "accel.compatible": "兼容模式",
  "accel.waitingScan": "等待环境扫描",
  "accel.fallbackLabel": "降级策略",
  "accel.fallback": "CUDA 内核异常时会依次降级到 SageAttention Triton 和 PyTorch Attention，避免队列反复崩溃。",
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
  "accel.installing": "正在补全环境…",
  "accel.repair": "重新安装/修复",
  "accel.install": "一键安装并自检",
  "accel.stopComfy": "安装过程会临时停止 ComfyUI",
  "accel.restartComfy": "环境补全后，若服务此前正在运行，程序会自动将它重启。",
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
  "shared.longer": "较长"
};

const zhTW: SettingsCopyCatalog = {
  ...zhCN,
  "video.title": "影片模型",
  "video.description": "依據實際檔案元件判斷是否可用，不只檢查單一 checkpoint 名稱。",
  "video.defaultModel": "預設模型",
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
  "lora.title": "影片 LoRA",
  "lora.description": "LoRA 是疊加在基礎模型上的選用適配層，不再作為獨立影片模型顯示。",
  "lora.available": "{available}/{total} 可用",
  "lora.scan": "標準 .safetensors LoRA 由 ComfyUI 核心 LoraLoaderModelOnly 載入，不需要另外安裝節點。只有帶有自訂載入器、採樣器、快取或模型補丁的特殊 LoRA 才會額外依賴節點。",
  "lora.turbo": "LightX2V Turbo 4-Step 僅相容 MiniMax H3 FL2VA。啟用後預設使用 strength 0.75、ER-SDE、Beta 與 8 步；它會減少採樣步數，但不會把 H3 變成低顯存模型。",
  "lora.empty": "尚無 LoRA 掃描結果",
  "image.title": "圖片編輯模型",
  "image.description": "選擇適合目前顯存的本機圖片模型；只有元件與工作流程完成驗證後，建立頁才會允許提交。",
  "image.defaultModel": "預設圖片模型",
  "image.defaultQuality": "預設品質檔位",
  "image.defaultCount": "預設生成數量",
  "image.countUnit": "張",
  "image.scanning": "正在掃描圖片模型元件與 ComfyUI 節點…",
  "image.summary": "找到 {components} 個元件完整檔位，{workflows} 個工作流程可用；Qwen 2511 目前最多支援 3 張 Picture",
  "image.waitingScan": "等待首次掃描",
  "image.note": "圖片工作流程固定輸出 PNG，方便繼續編輯並交給 H3 使用。Qwen 2511 下次啟動 ComfyUI 時會自動使用 CPU VAE、卸載文字編碼器並更積極回收顯存；FLUX.2 Klein 4B 是 4090 的優先輕量候選。",
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
  "prompt.summary": "找到 {count} 個提示詞模型檔位",
  "prompt.waitingScan": "等待首次掃描",
  "prompt.note": "Qwen Safetensors 使用 ComfyUI 官方 models/text_encoders 分類；Gemma GGUF 使用 H3 Prompt Writer 擴充註冊的大寫 models/LLM/獨立子目錄，主模型與相符的 mmproj 必須放在一起。擴寫完成會自動卸載，不需要安裝或啟動 llama-server、LM Studio。",
  "prompt.videoPresetTitle": "影片提示詞預設",
  "prompt.videoPresetDescription": "預設會將原始文字與參考圖整理成完整的 H3 影片提示詞，涵蓋主體、場景、動作、鏡頭、聲音、對白與連續性。",
  "prompt.restore": "還原預設",
  "prompt.currentPreset": "目前編輯預設",
  "prompt.ruleHeader": "預設規則標頭",
  "prompt.h3Note": "規則標頭可自由修改；內建 H3 官方基線仍會強制參考標籤、首尾影格關係、連續性、音訊與輸出格式。修改後點擊設定頁頂端的「儲存設定」，建立頁下次擴寫立即使用。",
  "prompt.imagePresetTitle": "圖片提示詞預設",
  "prompt.imagePresetDescription": "只影響圖片「最佳化提示詞」時的整理策略，不改變 Qwen Image 的生成參數。",
  "prompt.imageNote": "規則標頭會作為圖片 Prompt 最佳化器的策略說明；最後傳給 Qwen Image 的 Prompt 不會包含這段設定文字。",
  "prompt.empty": "尚無提示詞模型掃描結果",
  "upscale.title": "解析度提升模型",
  "upscale.description": "只有元件完整的模型才能進入後續提升工作流程。",
  "upscale.defaultModel": "預設模型",
  "upscale.seedWeight": "SeedVR2 權重",
  "upscale.realesrganWeight": "Real-ESRGAN 權重",
  "upscale.missingComponent": " · 缺少元件",
  "upscale.scanning": "正在掃描模型目錄…",
  "upscale.summary": "找到 {available} 個可執行模型，{pending} 個待補齊",
  "upscale.waitingScan": "等待首次掃描",
  "upscale.empty": "尚無模型掃描結果",
  "nodes.title": "節點與工作流程依賴",
  "nodes.description": "換電腦後依照專案清單重現 ComfyUI 節點環境",
  "nodes.installNote": "安裝只使用專案內建儲存庫清單；一鍵安裝會跳過帶系統級編譯前置的選用節點，請依卡片說明單獨安裝。完成後重新啟動 ComfyUI，再重新掃描。",
  "nodes.installAll": "安裝 / 更新缺少節點",
  "nodes.updateAll": "更新全部節點",
  "nodes.h3Title": "MiniMax H3 原生影音核心",
  "nodes.h3Badge": "ComfyUI v0.31.0+ · 推薦 v0.33.1",
  "nodes.h3Description": "LightX2V Turbo 直接使用 ComfyUI 原生 LoRA 與影音採樣，不需要額外的 Turbo custom node；版本過低時請更新所選 ComfyUI 並重新啟動複檢。",
  "nodes.waitingCore": "等待掃描核心節點",
  "nodes.minimumVersion": "最低版本",
  "nodes.coreLog": "核心處理記錄",
  "nodes.loaded": "已載入",
  "nodes.coreMissing": "核心缺失",
  "nodes.notChecked": "尚未啟動檢測",
  "nodes.processing": "處理中…",
  "nodes.waitingPosition": "排隊中 · 第 {position} 個",
  "nodes.finalizing": "正在重新啟動並複檢…",
  "nodes.repairUpdate": "一鍵補齊/更新",
  "nodes.startCheck": "啟動並檢測",
  "nodes.qwenTitle": "Qwen 提示詞核心節點",
  "nodes.qwenBadge": "ComfyUI 核心",
  "nodes.qwenDescription": "Qwen3.5 2B/4B 使用 ComfyUI 內建的文字生成流程，不需要安裝第三方節點；更新 ComfyUI 核心後重新掃描即可。",
  "nodes.waitingQwen": "等待掃描 Qwen 核心節點",
  "nodes.officialWorkflow": "官方工作流程",
  "nodes.installLog": "安裝記錄",
  "nodes.installed": "已安裝",
  "nodes.notInstalled": "未安裝",
  "nodes.installing": "安裝中…",
  "nodes.reinstall": "重新安裝",
  "nodes.oneClickInstall": "一鍵安裝",
  "nodes.projectRequired": "專案必要",
  "nodes.optional": "選用",
  "nodes.manualInstall": "需單獨安裝",
  "nodes.prerequisite": "執行/安裝說明：",
  "nodes.localVersion": "本機版本：",
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
  "nodes.fileCheckPassed": "檔案檢查通過",
  "nodes.installedRepair": "已安裝，需要修復",
  "nodes.updateRestart": "更新並重新啟動",
  "nodes.updateRecheck": "更新/重新啟動複檢",
  "nodes.checkUpdate": "檢查更新",
  "nodes.installRestart": "安裝並重新啟動",
  "nodes.empty": "等待環境掃描結果",
  "nodes.placeholderTitle": "工作流程佔位符",
  "nodes.placeholderDescription": "提交自訂影片 ComfyUI API JSON 前會遞迴替換；圖片工作流程不使用這些佔位符。",
  "accel.title": "效能與加速",
  "accel.description": "查看 GPU 執行時狀態並設定 H3 加速後端",
  "accel.strategyTitle": "H3 加速策略",
  "accel.strategyDescription": "選擇 H3 的 Attention 後端；只影響 MiniMax H3 工作流程。",
  "accel.runtimeTitle": "執行時解譯器",
  "accel.runtimeDescription": "選擇用於啟動 ComfyUI、安裝依賴與讀取加速狀態的 Python 環境。",
  "accel.componentsTitle": "執行時元件",
  "accel.componentsDescription": "檢查目前環境中的 PyTorch、CUDA、SageAttention、Triton 與 KJNodes。",
  "accel.ready": "已就緒",
  "accel.pending": "待安裝/修復",
  "accel.unsupported": "環境不支援",
  "accel.mode": "H3 Attention 後端",
  "accel.modeTip": "只影響 MiniMax H3 工作流程；其他模型的採樣與節點策略在各自的模型或工作流程設定中管理。",
  "accel.modeSage": "自動加速 · SageAttention CUDA FP16",
  "accel.modeSageTriton": "穩定加速 · SageAttention Triton FP16",
  "accel.modePytorch": "相容模式 · PyTorch Attention",
  "accel.auto": "自動加速",
  "accel.stable": "穩定加速",
  "accel.compatible": "相容模式",
  "accel.waitingScan": "等待環境掃描",
  "accel.fallbackLabel": "降級策略",
  "accel.fallback": "CUDA 核心異常時會依序降級到 SageAttention Triton 與 PyTorch Attention，避免佇列反覆崩潰。",
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
  "accel.installing": "正在補全環境…",
  "accel.repair": "重新安裝/修復",
  "accel.install": "一鍵安裝並自我檢查",
  "accel.stopComfy": "安裝過程會暫時停止 ComfyUI",
  "accel.restartComfy": "環境補全後，若服務先前正在執行，程式會自動重新啟動它。",
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
  "shared.longer": "較長"
};

const enUS: SettingsCopyCatalog = {
  "video.title": "Video models",
  "video.description": "Availability is based on real file components, not only a checkpoint name.",
  "video.defaultModel": "Default model",
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
  "lora.title": "Video LoRA",
  "lora.description": "LoRAs are optional adapters layered onto the base model, not independent video models.",
  "lora.available": "{available}/{total} available",
  "lora.scan": "Standard .safetensors LoRAs are loaded by ComfyUI's LoraLoaderModelOnly core node and need no separate node install. Special LoRAs with custom loaders, samplers, caches, or model patches may need extra nodes.",
  "lora.turbo": "LightX2V Turbo 4-Step is compatible only with MiniMax H3 FL2VA. It uses strength 0.75, ER-SDE, Beta, and 8 steps by default; it reduces sampling steps but does not make H3 a low-VRAM model.",
  "lora.empty": "No LoRA scan results",
  "image.title": "Image editing models",
  "image.description": "Choose a local image model for the current VRAM; Create allows submission only after components and workflows are verified.",
  "image.defaultModel": "Default image model",
  "image.defaultQuality": "Default quality profile",
  "image.defaultCount": "Default output count",
  "image.countUnit": "images",
  "image.scanning": "Scanning image-model components and ComfyUI nodes…",
  "image.summary": "{components} complete component profiles, {workflows} workflows available; Qwen 2511 currently supports up to 3 Pictures",
  "image.waitingScan": "Waiting for first scan",
  "image.note": "Image workflows always output PNG for continued editing and H3 handoff. Qwen 2511 uses CPU VAE, text-encoder offload, and aggressive VRAM reclamation on the next ComfyUI start; FLUX.2 Klein 4B is the lightweight first choice for a 4090.",
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
  "prompt.summary": "{count} prompt model profiles found",
  "prompt.waitingScan": "Waiting for first scan",
  "prompt.note": "Qwen Safetensors use ComfyUI's models/text_encoders category; Gemma GGUF uses the H3 Prompt Writer extension's uppercase models/LLM/independent-subdirectory layout. The main model and matching mmproj must stay together. The model unloads after expansion; llama-server and LM Studio are not required.",
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
  "prompt.videoPresetTitle": "Video prompt presets",
  "prompt.videoPresetDescription": "Presets organize original text and reference images into a complete H3 video prompt covering subject, scene, action, camera, sound, dialogue, and continuity.",
  "prompt.restore": "Restore defaults",
  "prompt.currentPreset": "Preset being edited",
  "prompt.ruleHeader": "Preset rule header",
  "prompt.h3Note": "The rule header is editable; the built-in H3 baseline still enforces reference tags, start/end-frame relationships, continuity, audio, and output format. Save Settings to use changes on the next expansion.",
  "prompt.imagePresetTitle": "Image prompt presets",
  "prompt.imagePresetDescription": "Only affects how the image Optimize Prompt action organizes instructions; it does not change Qwen Image generation parameters.",
  "prompt.imageNote": "The rule header guides the image Prompt optimizer; it is not included in the final Prompt sent to Qwen Image.",
  "prompt.empty": "No prompt model scan results",
  "upscale.title": "Upscale models",
  "upscale.description": "Only models with complete components can enter the later upscale workflow.",
  "upscale.defaultModel": "Default model",
  "upscale.seedWeight": "SeedVR2 weights",
  "upscale.realesrganWeight": "Real-ESRGAN weights",
  "upscale.missingComponent": " · missing component",
  "upscale.scanning": "Scanning model directory…",
  "upscale.summary": "{available} runnable models found, {pending} pending completion",
  "upscale.waitingScan": "Waiting for first scan",
  "upscale.empty": "No model scan results",
  "nodes.title": "Nodes and workflow dependencies",
  "nodes.description": "Recreate the ComfyUI node environment from the project checklist on another computer",
  "nodes.installNote": "Installation uses only the project repository list; one-click install skips optional nodes with system build prerequisites. Install those from their cards, then restart ComfyUI and rescan.",
  "nodes.installAll": "Install / update missing nodes",
  "nodes.updateAll": "Update all nodes",
  "nodes.h3Title": "MiniMax H3 native audio/video core",
  "nodes.h3Badge": "ComfyUI v0.31.0+ · recommended v0.33.1",
  "nodes.h3Description": "LightX2V Turbo uses ComfyUI native LoRA and audio/video sampling without an extra Turbo custom node; update the selected ComfyUI and restart to recheck when the version is too old.",
  "nodes.waitingCore": "Waiting to scan core nodes",
  "nodes.minimumVersion": "Minimum version",
  "nodes.coreLog": "Core operation log",
  "nodes.loaded": "Loaded",
  "nodes.coreMissing": "Core missing",
  "nodes.notChecked": "Detection not started",
  "nodes.processing": "Processing…",
  "nodes.waitingPosition": "Queued · #{position}",
  "nodes.finalizing": "Restarting and verifying…",
  "nodes.repairUpdate": "Repair/update",
  "nodes.startCheck": "Start and check",
  "nodes.qwenTitle": "Qwen prompt core nodes",
  "nodes.qwenBadge": "ComfyUI core",
  "nodes.qwenDescription": "Qwen3.5 2B/4B uses ComfyUI's built-in text-generation path and needs no third-party node; update the ComfyUI core and rescan.",
  "nodes.waitingQwen": "Waiting to scan Qwen core nodes",
  "nodes.officialWorkflow": "Official workflow",
  "nodes.installLog": "Installation log",
  "nodes.installed": "Installed",
  "nodes.notInstalled": "Not installed",
  "nodes.installing": "Installing…",
  "nodes.reinstall": "Reinstall",
  "nodes.oneClickInstall": "Install with one click",
  "nodes.projectRequired": "Project required",
  "nodes.optional": "Optional",
  "nodes.manualInstall": "Install separately",
  "nodes.prerequisite": "Runtime/install note: ",
  "nodes.localVersion": "Local version: ",
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
  "nodes.fileCheckPassed": "File check passed",
  "nodes.installedRepair": "Installed; repair needed",
  "nodes.updateRestart": "Update and restart",
  "nodes.updateRecheck": "Update/restart and recheck",
  "nodes.checkUpdate": "Check for updates",
  "nodes.installRestart": "Install and restart",
  "nodes.empty": "Waiting for environment scan",
  "nodes.placeholderTitle": "Workflow placeholders",
  "nodes.placeholderDescription": "Custom video ComfyUI API JSON is recursively replaced before submission; image workflows do not use these placeholders.",
  "accel.title": "Performance & acceleration",
  "accel.description": "Inspect GPU runtime status and configure H3 acceleration backends",
  "accel.strategyTitle": "H3 acceleration strategy",
  "accel.strategyDescription": "Choose the H3 Attention backend; this only affects MiniMax H3 workflows.",
  "accel.runtimeTitle": "Runtime interpreter",
  "accel.runtimeDescription": "Choose the Python environment used to start ComfyUI, install dependencies, and inspect acceleration status.",
  "accel.componentsTitle": "Runtime components",
  "accel.componentsDescription": "Check PyTorch, CUDA, SageAttention, Triton, and KJNodes in the selected environment.",
  "accel.ready": "Ready",
  "accel.pending": "Needs install/repair",
  "accel.unsupported": "Environment unsupported",
  "accel.mode": "H3 Attention backend",
  "accel.modeTip": "This only affects MiniMax H3 workflows. Other models keep their own sampling and node policies.",
  "accel.modeSage": "Automatic acceleration · SageAttention CUDA FP16",
  "accel.modeSageTriton": "Stable acceleration · SageAttention Triton FP16",
  "accel.modePytorch": "Compatibility mode · PyTorch Attention",
  "accel.auto": "Automatic acceleration",
  "accel.stable": "Stable acceleration",
  "accel.compatible": "Compatibility mode",
  "accel.waitingScan": "Waiting for environment scan",
  "accel.fallbackLabel": "Fallback policy",
  "accel.fallback": "CUDA kernel failures fall back through SageAttention Triton and PyTorch Attention to avoid repeated queue crashes.",
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
  "accel.installing": "Completing environment…",
  "accel.repair": "Reinstall/repair",
  "accel.install": "Install and self-check",
  "accel.stopComfy": "Installation temporarily stops ComfyUI",
  "accel.restartComfy": "If the service was running, the app restarts it after completing the environment.",
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
  "shared.longer": "Longer"
};

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
