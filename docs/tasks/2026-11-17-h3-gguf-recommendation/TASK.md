# H3 GGUF 推荐更新

- Status: done
- Impact: patch；只改项目推荐，不安装生产节点、不下载模型、不启动ComfyUI/GPU生成。
- 用户授权：更新ComfyUI-GGUF H3推荐版本；保留既有历史元数据修复的未提交修改。

## 基线与候选

- 当前推荐与实际安装26.10.30，`da5f435cd9a9e54ad27eed417ed72b1f2543ef41`；实际origin为molbal/ComfyUI-GGUF。唯一tracked改动是应用管理的__init__.py，已确认与h3GgufInitSource完全一致。
- 最新正式版26.11.16，标签v26-11-16指向HEAD `3ae2b682c5fdb77609171ceb66cc93f18b976ba1`。GitHub Release API确认非prerelease、发布时间2026-11-16T09:44:03Z；浏览器缓存仍停在旧发行列表，通过系统证书验证的Invoke-RestMethod查询纠正，没有关闭TLS验证。
- 选中核心 `c844cb672186f187bf9455e2808821417a10d296`，Python 3.12.11 / Torch 2.10.0+cu130。临时证据保留必要身份与源码，未提交原始状态/机器路径。

## 改动与兼容

- 新增minimax_h3_image架构与转换格式；识别已经使用Comfy键名的Qwen3.5，避免再次反转norm/A_log/V-head导致NaN，并处理量化embedding/lm_head。
- 混合Q4_CR中的Q8_CR层可保留原生INT8，失败仍可物化回退；ROCm HIP W4A8按内核实际支持的行宽判断，未知版本不强行选用。
- Python依赖声明不变，nodes.py/dequant.py/quant_ops.py逐字节不变，ModelMinimaxH3/ModelMinimaxH3VAE以及GGMLOps/GGMLTensor AST不变。H3专用__init__别名补丁保留，通用leejet GGUF目录/推荐线不动。
- 本次没有把新H3 Image GGUF、AMD路径接入应用，没有扩大Q3 3080实验档的时长、清晰度、Spectrum或预览能力。

## 验证

- 隔离CPU进程应用原H3别名补丁，两个loader注册成功，完整输入schema与实际旧安装一致。Kitchen CUDA能力探针仅在该进程替换为false，生产环境未改。
- 上游84项CPU回归通过，覆盖K量化、H3视频/图片/VAE、Qwen3.5原始与预转换、Q4混合量化和HIP能力判断；测试使用合成小张量/临时文件，不加载用户权重。
- 应用定向5文件193项通过，含catalog、scanner、安装器与H3静态工作流。安装器假运行时的固定HEAD同步到新推荐；原有通用GGUF与H3并存、受管理补丁检查继续通过。
- 独立快照完整门禁：单元340文件3285项、集成7文件132项、类型检查/干净构建、440组对比度检查全部通过。最终catalog与两份测试文件hash对齐验证快照，自有node_modules junction已移除。
- 临时源码、schema和日志：temp/gguf-h3-20261117，完整验证：temp/gguf-h3-verify-20261117；共享dist与生产安装不改，无自有服务/GPU任务待清理。GPU加载、速度/显存/画质与实际更新按钮安装后的验收未执行。

## 来源

- [正式发行](https://github.com/molbal/ComfyUI-GGUF/releases/tag/v26-11-16)
- [固定源码](https://github.com/molbal/ComfyUI-GGUF/tree/3ae2b682c5fdb77609171ceb66cc93f18b976ba1)
