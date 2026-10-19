# 三项节点实际升级验收

类型：升级实施证据；日期：2026-10-09；范围：用户“全部升级”承接上一轮列出的三项。应用保持 0.65.0；不更换核心、不下载模型或 LoRA、不执行用户队列。其余候选继续沿用上一轮逐项决定。

| 节点 | 原实际版本 / SHA | 本次固定安装与推荐 | 来源 |
| --- | --- | --- | --- |
| Prompt Writer | 0.4.5 / 862ae053 | 0.4.7 / 8c0d71fc37fb96f4012ecba5eae75b6f3d755a0e | [stable Release](https://github.com/duckyshell/ComfyUI-MiniMaxH3-Prompt-Writer/releases/tag/v0.4.7) |
| PlagueKind SLA | 1.3.8 / a05db589 | 1.5.6 / d58d006a4ea32c25c06499f2ff104f0852a045a6 | [固定 HEAD 源码](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/tree/d58d006a4ea32c25c06499f2ff104f0852a045a6) |
| Continuum | 3.8.2 / c38c616d | 3.9.1 / 94eaf70d674a58244e1cb139f021290d63fb2e6c | [stable Release](https://github.com/ukr8b3g-cmyk/ComfyUI-H3-Continuum/releases/tag/v3.9.1) |

## 已交付的行为

- 三项均通过真实 AppApi 备份替换并验证 HEAD。Writer 保留 Gemma handler、上下文、批处理与共享 llama 后端适配；运行发现新版未注册的小写 llm 分类触发 KeyError/模型接口 500，已永久修复安装补丁并覆盖 LF、Windows CRLF 和重复执行。
- Writer/SLA 固定安装目标采用 recommended revision policy；不同推荐提交显示更新，不将达到最低支持线的旧 runtime 判作无法加载。其他已有硬 pin 与 GGUF 来源/revision 检查保留。最低线仍为 Writer 0.3.1、SLA 1.3.8、Continuum 3.8.0。
- 现用 Turbo-SLA 的最终执行图是核心 BlockSparseAttention，selection=sla、keep_percent=10、sink_conditioning=exact_kv_and_rows；它不是 PlagueKind H3SLAAttention。本包新版 engine/INT8 QK/参考保护接口已核对，但没有切换生产内核，也不声称其 Triton/comfy_kitchen 新路径实际加速。
- Continuum 仍使用应用已有 V3.8 兼容 facade，获得 3.9.1 的共享修复。新 V3.9 九参考/路由/Second Pass UI 不会自动进入应用。新版 Sampling Contract v6 / Graph Contract v4 不接纳旧 v5 前缀，旧数据保持可读，不重写旧 manifest。

## 验证

- 最终 npm.cmd run verify：1685 单元 + 86 集成 = 1771，通过 clean typechecked build 与 20 对比度组合。安装、扫描、硬/软 pin、CRLF 模型目录兼容回归通过。
- 真实 Settings 选已安装 Gemma E4B → 空输入可见阻塞 → 键盘恢复 → 实际增强按钮 → 独立 operation ID → 推理完成、新增 842 字符 Prompt 版本；旧版本和排队快照保留。其他 Gemma/projector 组合未扩展本次 GPU 覆盖。
- 普通 H3 真实 UI 入队并输出 864×480、24fps、1.625 秒；Turbo-SLA 对应图输出 864×480、4 steps、2.333333 秒。实际提交图从 History comfyOutputs 核对，不能以 LoRA 名称代替最终节点。
- 真实 History Continue → Continuum bootstrap → 缺 Prompt 禁用 → 键盘恢复 → 实际按钮、task ID → Native AV 接续；产出 864×480、5.625 秒。诊断 package=3.9.1、selected_source=initial_state、transport_verified=true、context=22、fresh_fallback=false。
- 三份 MP4 的 ffprobe 均有 H.264 视频/AAC 音频；History 解码、帧播放及返回通过。最终构建重启后保留三份 History、草稿、设置、Prompt 版本与空队列；仅允许既有 H3 memory 缺失默认值及实际文件 stat 归一化，其余字段严格比较。
- 所选 Python 执行 9 项应用 guard 测试通过；以隔离 pytest 工具执行固定 Continuum 上游 24 项 stability_r2 CPU 测试通过，含真实 v5 夹具读取/字节 hash 不变、拒绝 v6 复用、v6 正向前缀及 sampler/CFG/wrapper 身份。测试工具只放忽略的 temp，未改共享 Python。
- 边界：新版 managed A→B→C 未做本轮 GPU 验证；CPU 通过不能冒充 GPU 通过。第三方 SLA 新内核、长视频、九参考与 Second Pass 未实跑；无同参数速度/画质 A/B 结论。此次三个输出的不同步数/时长不能比较性能。

## 保护与清理

- 旧三个节点的 HEAD 和 Writer 原兼容 diff 与备份一致；备份存在不表示已实测回退。
- 用户 state hash 不变，4 条 queue / 129 条 History 保留；其他节点 1419 个 .py/.toml hash、pip freeze 与 core d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29 不变。用户 Run 未参与试验，所有生成与临时状态在隔离 fixture。
- 通过自有应用生命周期运行；最后 owned runtime/AppApi 清理及 PID/端口检查见本 TASK 当前结论。JS 窗口关闭不计为原生退出生命周期证明。
- Upgrade Skill 的记录/验证矩阵补充硬/软安装 pin、最终图与中间态区别、CRLF/目录分类及 v5/v6/CPU/GPU 边界；quick_validate 通过。所有原始路径、日志、状态与媒体留忽略的 temp。
