# Strata：一键安装组件，单独下载模型

- 类型：任务阶段指南；日期：2026-10-11；适用：Windows / NVIDIA，Strata v0.1.41。
- 状态唯一入口：[TASK](TASK.md)；固定文件元数据以 [运行组件 catalog](../../../src/core/catalog/dependencies/strata.ts) 和 [模型 catalog](../../../src/core/catalog/models/strata.ts) 为准。
- 产品接线已完成，可选模型沿用原提示词按钮按需运行；原默认模型不变。完整权重与真实推理/质量/性能仍待验收。

## 下载与目录

1. 设置 → 节点与依赖 → **Strata → 一键安装**。应用取得固定源码/引擎并创建独立 Python 环境；不用手动下载或解压 ZIP。前提是 Git、网络和已有支持 venv 的标准 Python 3.10+；应用自动在已发现 Python 中选择，不向 ComfyUI 环境安装包。未找到时安装日志提示如何恢复；Portable embedded Python 不支持本安装路径。NVIDIA 驱动须 580+，软件安装不加载 GPU。
2. 设置 → 提示词扩写 → Strata 模型卡下载文件。模型统一放在已配置或发现的 ComfyUI 模型根下 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`；组件信息按钮显示准确目标，无需再配置模型根目录。软件安装目录独立，更换 ComfyUI 模型目录后下载/扫描目标随之更新。旧下载记录仅在共享根未知时兼容回退，文件不自动搬移。
3. [IQ3_XXS 固定版本文件列表](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09/IQ3_XXS) 两份分片都下载，保持文件名，放默认或自定义根下的 `IQ3_XXS` 子目录。约 64GB 系统 RAM 可先评估此档；两份分片约 75.84GB，不意味着全部驻留 RAM/VRAM，性能待实测。
4. [相同 revision 的视觉投影](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/resolve/ed59f92082b1e93c0e96d60a8b11aab089b52f09/mmproj-Qwen3.8-Flash-Next-BF16.gguf) 约 0.91GB，放在 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF` 下，与量化子目录同级。

如果希望优先评估较低 RAM 占用，改下载 [IQ2_XS 两份分片](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09/IQ2_XS)，约 68.03GB，放 `IQ2_XS` 子目录。两种量化任选其一，不必全下；视觉投影共用。不要下载同名 Unsloth 量化来代替，不要手动下载完整原版 Qwen checkpoint；MTP 是后续通过上游工具提取/准备的独立步骤。预留 GGUF 之外的 setup、pack、MTP、Python/CUDA 空间，不能把上述下载大小当完整磁盘预算。

```text
ComfyUI 模型根目录/LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/
  IQ3_XXS/
    Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00001-of-00002.gguf
    Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00002-of-00002.gguf
  mmproj-Qwen3.8-Flash-Next-BF16.gguf
```

## 在应用中配置

- 应用管理安装的三角菜单提供“卸载”，确认后仅永久删除当前软件目录及独立 Python 环境；共享模型、独立数据和旧备份保留。手动目录不提供卸载。软件目录内的本地修改不保留，可重新一键安装。

该目录按模型与 GGUF 版本组织，不是 Strata 专属目录，也不是上游规定的 ComfyUI 路径。结构沿用 [量化发布页](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF) 的量化子目录与公共视觉投影；Strata 支持通过 `--gguf-dir` 指向已有文件。旧共享根下 `LLM/strata` 中的文件仍原地兼容扫描，新目录优先；下载指引始终使用新目录，不自动搬移文件。模型可共享，但其他运行软件是否支持该架构及如何指定路径仍由对应加载器决定。

- 安装目录由应用管理，无需配置。已有手动源码目录保留且只读；要使用一键管理，清空折叠高级设置里的自定义运行目录。安装器不覆盖手动文件。重装保留旧目录，失败恢复，日志说明备份或未完成下载的位置。
- 默认 `43127`，禁止 `8080`；端口在折叠详情。选用模型后点击原启动/增强按钮，应用按需管理隐藏的本机服务；端口占用时拒绝接管其他服务，提示更换端口，不自动修改保存值。
- 模型组件信息提供固定 revision、文件名、大小、SHA-256 和实际目标；下载沿用 Hugging Face 镜像偏好，不更换 revision。
- 保存设置，再点击“扫描环境”。也可以先对未保存目录扫描；保存后才能保证重启保留。新字段不会改原提示词模型、LM Studio 遗留字段、队列或 History。
- 软件安装校验源码 SHA、引擎大小/hash、Python 包和 CUDA DLL 文件；离线复扫仅复检文件与安装记录，不启动程序。模型扫描核对大小/GGUF 头，不能代替 hash。软件安装成功不代表模型 pack、MTP、驱动加载或增强输出成功。

不用双击 `START-HERE.bat` 或手工运行 setup。软件和模型文件完整后重新扫描，在原提示词模型下拉选择所下载的量化版本并保存。点击原模型启动或增强按钮，首次自动校验权重并准备 CPU pack/tokenizer，然后加载；进度沿用原提示词进度，方形停止按钮可取消。后续复查并复用完成缓存，源权重不复制或搬移。派生文件在软件版本目录同级 `data`，卸载软件仍保留。基础路径不需要 MTP，后续加速不自动下载；不购买云 API、不占用8080、不改原默认模型。

启动、增强、取消、释放和退出均已接上应用 owner。上下文采用32K，视频输出预算8K、图片编辑4K；超限或截断不保存半截版本。R2V视频以静音关键帧供视觉检查，不表示音频理解。服务/代码/mock验证不代表完整 Qwen 推理已验；权重下载和真实资源、视觉、输出质量与性能测试仍待完成。
