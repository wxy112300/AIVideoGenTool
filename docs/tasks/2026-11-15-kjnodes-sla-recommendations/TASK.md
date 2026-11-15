# KJNodes / PlagueKind 推荐更新

## 范围与状态

2026-11-15，patch，已完成。更新项目推荐线，不安装生产节点、不重启运行时、不下载用户权重。源码、隔离 CPU 检查与应用全量验证通过。

## 基线与候选

- PlagueKind：本机/原推荐 1.6.2 `cfb88a01d8922ca634d4ac1e753c7ae2c3c4273e` → 1.6.4 `cc944b5064d1b15fc77664c7138d9752bba66302`，继续固定安装 commit，最低版本不变。
- KJNodes：本机/原推荐 1.5.3 `ab72eda7ffad6280422d71ab7d54d3fb87c0ba18` → 1.5.4 `70701d2a11d4797cf52733290ed0b6b5037148d9`，保留原有跟随 HEAD 的安装策略。
- 实际选中核心 `c844cb672186f187bf9455e2808821417a10d296`（v0.45.0-27），Python 3.12.11 / Torch 2.10.0+cu130。已装两包的 tracked 文件干净，origin 正确。
- 两仓库无 GitHub Release，版本取候选 pyproject 与 Git refs。网页 commits 缓存落后，Git API 证书校验失败；没有关闭证书验证，以官方 Git clone 的完整提交和源码为准。

## 更新与兼容边界

- PlagueKind：视频放大器增加 IC in-context 重绘、2D/分块放大、面部处理和标志修复，附带包内检测/任务资产。六个 SLA 文件、根加载入口和依赖声明不变。隔离 CPU 导入注册18节点，包含 H3SLAAttention。应用现用核心 BlockSparseAttention 与独立 MMH3 放大路径不切换到该放大器。
- KJNodes：新增 H3 Prompt Weight/混合（含 Moss/Krea2）、H3 图片多出口 Tiny VAE、图像元数据、比较器键盘拖动、图像保存和重采样改进。Python 依赖声明不变。
- KJ 的 PathchSageAttentionKJ、get_sage_func、VRAM_Debug、ModelPreviewOverrideKJ 与视频 TAEHVDecoder 实现保持一致；预览包装层仅把已有 max_resolution 传入 loader，视频 TAEHV 分支不使用该新参数。三个现用节点 schema 与基线相同。
- 候选 CPU 注册267节点，基线266，无移除，新增 MiniMaxH3PromptWeight。所有候选 Python 文件通过语法解析。
- ImageResizeKJv2 新增 GPU 重采样、默认 device 改为 GPU；应用工作流扫描只发现 VRAM_Debug / PathchSageAttentionKJ，动态预览使用 ModelPreviewOverrideKJ，没有接入该 resize 或 SaveImageKJ 节点。新增提示词/图片预览功能不因更新推荐自动启用。

## 验证与资源

- 定向 catalog/scanner/workflow/H3 baseline/execution-policy：5文件、142项通过。
- 独立源码快照完成 verify 等价门禁：全量单元334文件/3262项、集成7文件/132项通过，类型检查与干净构建通过，对比度440项零失败。只在快照内构建，未覆盖共享 dist；验证结束移除自有 node_modules junction，日志留忽略目录。
- 源码与 CPU 证据留在忽略目录 `temp/node-upgrades-20261115`，包括 schema、AST 对照、工作流交集和导入日志；不提交机器路径或完整状态文件。
- CPU 导入通过独立进程禁用 CUDA，Kitchen CUDA 能力探针仅在该进程返回 false，使用不监听端口的 PromptServer fixture；未修改生产环境。
- 没有实际安装、在线 object_info、GPU 生成或新 Tiny VAE 权重验证；不声称速度、显存、画质改善。

## 来源

- [PlagueKind 候选](https://github.com/PlagueKind/ComfyUI-PlagueKind-Nodes/tree/cc944b5064d1b15fc77664c7138d9752bba66302)
- [KJNodes 候选](https://github.com/kijai/ComfyUI-KJNodes/tree/70701d2a11d4797cf52733290ed0b6b5037148d9)
