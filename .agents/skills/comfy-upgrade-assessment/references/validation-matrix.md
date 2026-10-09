# 按变更选择验证边

类型：Skill 参考；状态：current；日期：2026-10-10。适用 Local Video Studio 升级评估。入口：[SKILL](../SKILL.md)；实际命令以 Harness guide 与 [runbook](../../../../docs/AGENT_ELECTRON_API_RUNBOOK.md) 为准。

下表的旅程名以 `/` 分隔表示分别运行，例如 `guide image/upscale` 对应 `guide image` 与 `guide upscale`，不是组合 journey ID。

| 变化 | 源码/接口判断 | 有判别力的隔离 Harness 实验 |
| --- | --- | --- |
| ComfyUI 核心/依赖 | 当前实际 SHA 到候选；Python/Torch/kitchen/ABI、数据库、CLI、node registry、schema | `guide settings-runtime`；files→start-comfy→scan；原 H3/Qwen/Prompt/Upscale 受影响分支各一个真实输出，重启/正常退出。不要把核心前端的 UI 改动算成本应用 renderer 收益 |
| H3 VAE / offload / precision | encode 与 decode、tiles、dtype、设备、权重识别；是否最终 VAE 或仅 preview | `guide create-video/upscale`；先原 FP16 或 ConvRot 组合，分块接缝/帧数/音轨；新轻量 VAE 作为独立变量。测 host RAM 与 VRAM，禁止将 H3 策略扩到 Qwen |
| H3 attention / Spectrum / compiler | model patch 顺序、source audit、PackedLayout、audio/ref masks、实际 forecast/dense/fallback 计数 | `guide create-video/settings-runtime`；同 seed cache-off 与候选 A/B，核对音频/参考保护、waiting 更新与 running 冻结。必须证明新 provider/forecast 真正在运行，不能把 fallback 的成功当加速成功 |
| Continuum / Motion Context | sampler/state/Run manifest/receipt 的 contract version、实际 sampling contract/hash/resume_safe、注册命名空间、旧前缀兼容、冻结 head/accepted guard | `guide extend/history`；旧 Run 前置拒绝且 head 不变、新兼容 A→B→C、真实 History Continue、取消/恢复/重启。v5只读而新v6须实际manifest证据；新node名不能绕过应用guard，未知wrapper保持拒绝；若Sage闭包不可观察，核对实际raw委托而非放宽identity；默认物理隔离，不复写用户 Run |
| H3 Image Studio / tiled upscale | 旧注册名是否保留、required 参数、尺寸/单帧语义、offload 与权重格式 | `guide image/upscale`；旧图 schema 和实际最小生成先过，再测新 LoRA 链/新节点。新 required socket 即使有默认值也须核对 API 图实际校验 |
| Qwen Image 2.1 | 原生/GGUF fork、Qwen3-VL mapping、T2I 与 edit 的 cache 连接、alpha、dotted autogrow 与 SaveImageAdvanced 参数 | `guide image`；无图 T2I、单图 edit、两图排序、RGBA/透明输出、比例/custom-size 与 Paint guide；Q8 与 Q6 分开。10 图/2K 只在预算允许后扩展，不将 Paint 自动视为 Mask |
| Qwen ControlNet / 专属 PE | 新权重、condition input/Mask、range/strength、T2I/Edit 路由、JSON/ratio 输出契约 | `guide image/prompt`；ControlNet 无控制安全路径、明确控制/Mask 外保持；PE 无图/有图、格式解析、预算/取消/显存释放与回写；core 原生 TextGenerate 优化不自动加速走 llama-cpp 的 VisionLLMNode |
| Prompt Writer / MultiModal | `/h3studio/*` 或 VisionLLMNode schema、共享固定 llama wheel、projector、预算、取消、双重释放、本地补丁指纹 | `guide prompt/settings-runtime`；`probe-prompt-writer` 只是服务层；真实增强按钮、空输入→恢复、模型切换/驻留、下一请求日志、History 与重启；不能用另起服务证明原 ComfyUI 路线 |
| 模型 / LoRA | base family、FL2VA/REF2VA、quantization、tensor keys、LoRA/DoRA、strength/order、触发词、采样档、license/hash | `guide create-video/image`；先无 LoRA 基线，再单一候选；AnyAngle 参考顺序、Fix APG/FreSca/专属采样、Lighting trigger；Turbo/PDD/SLA 不互相借参数，旧无 LoRA 和历史路径保留 |
| 视频超分 / 补帧 | source version identity、节点 backend、precision/offload、output encoding、DLL/LFS 文件 hash | `guide upscale/history`；最短有效源→实际按钮→独立 operation/task→派生 version；解码帧数/FPS/音轨/播放/返回/重启；Core SeedVR2 优化是否影响第三方包须追实际 import |

## 使用证据时的边界

- 对照最终提交给 ComfyUI 的图，不只看 builder 中间态或 LoRA 名称。模型补丁规范化可能将第三方 H3SLAAttention 改为核心 BlockSparseAttention；核心 SLA 的产出不能证明第三方新内核已执行或加速。
- 节点兼容补丁同时检查 Windows Git CRLF 与重复执行；模型发现须验证未注册目录分类不会使整个列表接口失败。
- Continuum 读取旧 manifest、复用前缀及写入前 guard 分别验证。旧 v5 只读成功不能证明 v6 可续接；CPU 契约正向与真实 GPU managed 接续分别标注。
- 本次只读 source 评估完成即可交付“待验证候选”；不为了填表启动用户环境。
- 用户授权实际升级后，不因服务离线就结束必需 runtime 验收：在已协调的自有实例通过 AppApi 启动；缺权重/运行失败写清准确解锁条件。
- 每次运行先预定最短素材、配置、单样本时限与失败停止条件。后端发生变化时不能要求逐像素一致，但仍保留参考身份、Mask/音频/Run 安全等确定性约束。
- 只改文档/Skill 无须 verify；修改共享 workflow/queue/IPC 或 runtime 则按仓库要求 verify + 实际必要边。已通过且输入未变的检查不重复跑。
