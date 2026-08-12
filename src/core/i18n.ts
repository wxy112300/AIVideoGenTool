import type { UiLocale } from "../types.js";

export const defaultUiLocale: UiLocale = "zh-CN";
export const supportedUiLocales = ["zh-CN", "en-US"] as const satisfies readonly UiLocale[];

export type TranslationParams = Record<string, string | number>;
export type TranslationCatalog = Record<string, string>;
export type TranslationCatalogs = Partial<Record<UiLocale, TranslationCatalog>>;

export interface Translator {
  readonly locale: UiLocale;
  t(key: string, params?: TranslationParams, fallback?: string): string;
}

export const uiTranslationCatalogs: TranslationCatalogs = {
  "zh-CN": {
    "nav.create": "创建",
    "nav.queue": "队列",
    "nav.history": "历史",
    "nav.settings": "设置",
    "settings.uiLanguage.title": "界面语言",
    "settings.uiLanguage.label": "界面语言",
    "settings.uiLanguage.description": "选择 Local Video Studio 的界面显示语言。",
    "settings.uiLanguage.help": "选择后会立即预览界面语言；保存设置后会记住你的偏好。未翻译的内容暂时显示为默认语言。",
    "task.status.waiting": "等待",
    "task.status.running": "运行中",
    "task.status.completed": "完成",
    "task.status.failed": "失败",
    "task.status.cancelled": "已取消"
  },
  "en-US": {
    "nav.create": "Create",
    "nav.queue": "Queue",
    "nav.history": "History",
    "nav.settings": "Settings",
    "settings.uiLanguage.title": "Interface language",
    "settings.uiLanguage.label": "Interface language",
    "settings.uiLanguage.description": "Choose the display language for Local Video Studio.",
    "settings.uiLanguage.help": "Your selection previews immediately and is remembered when you save settings. Untranslated content remains in the default language for now.",
    "task.status.waiting": "Waiting",
    "task.status.running": "Generating",
    "task.status.completed": "Completed",
    "task.status.failed": "Failed",
    "task.status.cancelled": "Cancelled"
  }
};

const staticUiTextCatalogs: Partial<Record<UiLocale, Record<string, string>>> = {
  "en-US": {
    "本机环境": "Local environment",
    "必需组件、可选工具和本地服务状态": "Required components, optional tools, and local service status.",
    "ComfyUI 安装实例": "ComfyUI installations",
    "选择一键启动、更新和离线版本检测使用的安装；不会自动改写你的选择": "Choose the installation used for one-click start, updates, and offline version checks. Your selection is never changed automatically.",
    "当前安装入口": "Current installation entry",
    "留空时自动选择扫描结果": "Leave blank to use the scanned result automatically",
    "选择目录": "Choose folder",
    "当前 ComfyUI 目录结构": "Current ComfyUI directory structure",
    "核心目录": "Core directory",
    "包含 main.py 和核心版本文件，用于启动与更新": "Contains main.py and core version files used for starting and updating.",
    "数据 / 节点目录": "Data / node directory",
    "包含 models、custom_nodes、input、output 和 user": "Contains models, custom_nodes, input, output, and user.",
    "便携版": "Portable",
    "源码版": "Source",
    "版本元数据未读取到": "Version metadata unavailable",
    "安装入口": "Installation entry",
    "当前使用": "Currently in use",
    "使用此版本": "Use this version",
    "没有在常见位置找到安装。可手动选择包含 ComfyUI.exe、Comfy Desktop.exe 或 main.py 的目录。": "No installation was found in common locations. You can choose a folder containing ComfyUI.exe, Comfy Desktop.exe, or main.py.",
    "ComfyUI 连接": "ComfyUI connection",
    "连接运行中的 ComfyUI API": "Connect to a running ComfyUI API.",
    "测试连接": "Test connection",
    "终止中…": "Stopping…",
    "强制终止所有进程": "Force stop all processes",
    "服务地址": "Service URL",
    "尚未单独测试连接": "Connection has not been tested separately.",
    "文件路径": "File paths",
    "先确认生成结果保存位置，再管理 ComfyUI 使用的素材与模型": "Confirm where generations are saved, then manage the media and models used by ComfyUI.",
    "输出位置": "Output locations",
    "视频和图片生成结果分别保存": "Video and image generations are saved separately.",
    "视频输出目录": "Video output folder",
    "图片输出目录": "Image output folder",
    "选择": "Choose",
    "ComfyUI 资源": "ComfyUI resources",
    "输入素材和本地模型所在位置": "Locations of input media and local models.",
    "输入素材库": "Input media library",
    "模型目录": "Model folder",
    "扫描或选择 models 目录": "Scan or choose the models folder",
    "素材库维护": "Media library maintenance",
    "归档旧历史引用，并检查未被使用的输入素材。": "Archive old history references and check unused input media.",
    "整理素材库": "Organize media library",
    "下载代理": "Download proxy",
    "已开启": "Enabled",
    "已关闭": "Disabled",
    "启用下载代理": "Enable download proxy",
    "代理地址": "Proxy URL",
    "GPU 运行策略": "GPU runtime policy",
    "已识别硬件": "Detected hardware",
    "来自 nvidia-smi 的实时检测结果": "Live detection result from nvidia-smi.",
    "显存安全余量": "VRAM safety reserve",
    "0.5 GB · 激进": "0.5 GB · Aggressive",
    "0.75 GB · 平衡": "0.75 GB · Balanced",
    "1 GB · 保守": "1 GB · Conservative",
    "安全取消": "Safe cancel",
    "任务失败自动重试": "Automatically retry failed tasks",
    "自动重试次数": "Automatic retry count",
    "推荐": "Recommended",
    "视频模型": "Video models",
    "默认模型": "Default model",
    "正在扫描模型目录…": "Scanning the model folder…",
    "等待首次扫描": "Waiting for the first scan",
    "尚无模型扫描结果": "No model scan results yet.",
    "视频 LoRA": "Video LoRA",
    "可用": "Available",
    "尚无 LoRA 扫描结果": "No LoRA scan results yet.",
    "图片编辑模型": "Image editing models",
    "默认图片模型": "Default image model",
    "默认质量档": "Default quality profile",
    "默认生成数量": "Default generation count",
    "张": "images",
    "正在扫描图片模型组件和 ComfyUI 节点…": "Scanning image-model components and ComfyUI nodes…",
    "本地提示词模型": "Local prompt models",
    "默认提示词模型": "Default prompt model",
    "扩写语言": "Expansion language",
    "跟随输入语言": "Follow input language",
    "中文": "Chinese",
    "英文": "English",
    "创造性": "Creativity",
    "克制 · 0.3": "Conservative · 0.3",
    "平衡 · 0.7": "Balanced · 0.7",
    "丰富 · 1.0": "Expressive · 1.0",
    "视频提示词预设": "Video prompt presets",
    "恢复默认": "Restore defaults",
    "当前编辑预设": "Current preset",
    "预设规则头": "Preset rule header",
    "图片提示词预设": "Image prompt presets",
    "分辨率提升模型": "Upscaling models",
    "SeedVR2 权重": "SeedVR2 weights",
    "Real-ESRGAN 权重": "Real-ESRGAN weights",
    "节点与工作流依赖": "Node and workflow dependencies",
    "运行日志": "Runtime logs",
    "读取中…": "Reading…",
    "刷新": "Refresh",
    "目录": "Folder",
    "日志目录": "Log folder",
    "崩溃转储": "Crash dumps",
    "保留": "Retention",
    "记录": "Records",
    "暂无运行日志": "No runtime logs yet.",
    "设置": "Settings"
  }
};

export function translateStaticUiText(locale: unknown, text: string): string {
  const resolvedLocale = normalizeUiLocale(locale);
  return staticUiTextCatalogs[resolvedLocale]?.[text] ?? text;
}

export function isUiLocale(value: unknown): value is UiLocale {
  return typeof value === "string" && supportedUiLocales.includes(value as UiLocale);
}

export function normalizeUiLocale(value: unknown): UiLocale {
  return isUiLocale(value) ? value : defaultUiLocale;
}

function interpolate(template: string, params: TranslationParams): string {
  return template.replace(/\{([A-Za-z0-9_.-]+)\}/gu, (match, key: string) => {
    const value = params[key];
    return value == null ? match : String(value);
  });
}

export function createTranslator(
  locale: unknown = defaultUiLocale,
  catalogs: TranslationCatalogs = uiTranslationCatalogs
): Translator {
  const resolvedLocale = normalizeUiLocale(locale);
  return {
    locale: resolvedLocale,
    t(key, params = {}, fallback = key) {
      const template = catalogs[resolvedLocale]?.[key] ??
        catalogs[defaultUiLocale]?.[key] ??
        fallback;
      return interpolate(template, params);
    }
  };
}
