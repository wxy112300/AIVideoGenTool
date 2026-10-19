# Strata：一键安装组件，单独下载模型

- 类型：任务阶段指南；日期：2026-10-19；适用：Windows / NVIDIA，推荐 Strata v0.1.45，保留 v0.1.44.1 / v0.1.41 安装识别。
- 状态唯一入口：[TASK](TASK.md)；固定文件元数据以 [运行组件 catalog](../../../src/core/catalog/dependencies/strata.ts) 和 [模型 catalog](../../../src/core/catalog/models/strata.ts) 为准。
- 产品接线已完成，可选模型沿用原提示词按钮按需运行；原默认模型不变。主模型已有部分真实推理证据，但影视增强尚未完整验收；新增MTP的真实转换/显存峰值/速度仍待测试。

## 下载与目录

1. 设置 → 节点与依赖 → **Strata → 一键安装**。应用取得固定源码/引擎并创建独立 Python 环境；不用手动下载或解压 ZIP。前提是 Git、网络和已有支持 venv 的标准 Python 3.10+；应用自动在已发现 Python 中选择，不向 ComfyUI 环境安装包。未找到时安装日志提示如何恢复；Portable embedded Python 不支持本安装路径。NVIDIA 驱动须 580+，软件安装不加载 GPU。
2. 设置 → 提示词扩写 → Strata 模型卡下载文件。模型统一放在已配置或发现的 ComfyUI 模型根下 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`；组件信息按钮显示准确目标，无需再配置模型根目录。软件安装目录独立，更换 ComfyUI 模型目录后下载/扫描目标随之更新。旧下载记录仅在共享根未知时兼容回退，文件不自动搬移。
3. [IQ3_XXS 固定版本文件列表](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09/IQ3_XXS) 两份分片都下载，保持文件名，放默认或自定义根下的 `IQ3_XXS` 子目录。约 64GB 系统 RAM 可先评估此档；两份分片约 75.84GB，不意味着全部驻留 RAM/VRAM，性能待实测。
4. [相同 revision 的视觉投影](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/resolve/ed59f92082b1e93c0e96d60a8b11aab089b52f09/mmproj-Qwen3.8-Flash-Next-BF16.gguf) 约 0.91GB，放在 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF` 下，与量化子目录同级。

较低 RAM 档位为 [IQ2_XS 两份分片](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/tree/ed59f92082b1e93c0e96d60a8b11aab089b52f09/IQ2_XS)，约68.03GB，使用`IQ2_XS`子目录。IQ2与IQ3共用视觉投影和MTP；各量化以对应卡片固定来源识别。GGUF之外还需预留pack、MTP、Python/CUDA空间。

```text
ComfyUI 模型根目录/LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/
  IQ3_XXS/
    Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00001-of-00002.gguf
    Qwen3.8-Flash-Next-GSQ-RCO-IQ3_XXS-00002-of-00002.gguf
  mmproj-Qwen3.8-Flash-Next-BF16.gguf
```

## UD-Q4_K_XL（128GB RAM 档）

[Unsloth固定revision文件列表](https://huggingface.co/unsloth/Qwen3.8-Flash-Next-GGUF/tree/38bb39ee97821de2c9009abb7e93950eec396e66/UD-Q4_K_XL)共四分片，111,334,654,784bytes（111.33GB）。四个原文件位于所选ComfyUI模型根的`LLM/Qwen3.8-Flash-Next-GGUF/UD-Q4_K_XL/`，文件名从`Qwen3.8-Flash-Next-UD-Q4_K_XL-00001-of-00004.gguf`到`00004-of-00004.gguf`。来源许可证为Qwen Community License 1.0；组件弹窗显示各文件固定revision、字节数、SHA-256和目标。

视觉投影与下述MTP沿用原版资产；扫描会读取已有`LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF`中的同名文件。新下载可放Q4模型命名目录下同级projector与`mtp/`，无需第二个根设置。首次启动离线校验五个必需文件，运行官方`iq_pack.py --compat-bf16`，约1.4GB派生pack和转换报告保存独立data，源权重不搬移。四分片/视觉缺件时保持不可选；MTP缺失保留基础运行路径。

Q4由H3原按钮与独立Agent共用接线，包含三种uncensored模式及当次引擎确认；H3仍32K，Agent仍按独立偏好。约71.7GiB专家的资源预算与IQ3分开，内存较紧时显式预算驻留/文件回读可能明显变慢。此条为代码接入，Q4完整加载、图文效果、去拒答和速度待权重就绪后实测。[固定版官方运行说明](https://github.com/Niko1221/Strata/blob/477ac13cbe8e582c20484871ce459d20d82df09d/docs/UNSLOTH_Q4.md)。

## MTP 配套加速权重

IQ2/IQ3主模型使用ISTA-DASLab，UD-Q4_K_XL使用上文固定Unsloth量化；三档共用配套MTP。MTP Q2_0由SC117使用Strata工具从原版Qwen MTP转换，不是该仓库的改写主模型；[发布者来源说明](https://huggingface.co/SC117/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF/blob/eec4e10a2c29b440a2ae85591fa11569ce752963/strata/README.md)。

- [手动下载 mtp-q2_0.gguf](https://huggingface.co/SC117/Qwen3.8-Flash-Next-GSQ-RCO-abliterated-GGUF/resolve/eec4e10a2c29b440a2ae85591fa11569ce752963/mtp-q2_0.gguf)：889,017,216 bytes（约 0.89GB / 848MiB）。
- SHA-256：`a22206a4d74eafbf31063a84610292535fb3b49af9a339963817fd04aed81e4d`。
- 放在所选 ComfyUI 模型根下 `LLM/Qwen3.8-Flash-Next-GSQ-RCO-GGUF/mtp/mtp-q2_0.gguf`。两个量化档共享此文件，不新增根目录设置。

用户使用浏览器/下载器获取文件，应用不下载模型。扫描区分可选配套文件与主模型就绪；补齐后下一次启动/增强会校验 SHA-256，用官方 `mtp_rt.py` 离线转换并复制固定中文词表。派生运行文件仍在应用独立 data，不覆盖共享源权重；完整主 pack 仅补 MTP、不重哈希/转换主分片。配套文件缺失保留无 MTP 基础模式。推理速度、峰值显存与完整质量须实测，文件扫描/离线转换不等于已验收。

## 在应用中配置

- 应用管理安装的三角菜单提供“卸载”，确认后仅永久删除当前软件目录及独立 Python 环境；共享模型、独立数据和旧备份保留。手动目录不提供卸载。软件目录内的本地修改不保留，可重新一键安装。

该目录按模型与 GGUF 版本组织，不是 Strata 专属目录，也不是上游规定的 ComfyUI 路径。结构沿用 [量化发布页](https://huggingface.co/ISTA-DASLab/Qwen3.8-Flash-Next-GSQ-RCO-GGUF) 的量化子目录与公共视觉投影；Strata 支持通过 `--gguf-dir` 指向已有文件。旧共享根下 `LLM/strata` 中的文件仍原地兼容扫描，新目录优先；下载指引始终使用新目录，不自动搬移文件。模型可共享，但其他运行软件是否支持该架构及如何指定路径仍由对应加载器决定。

- 安装目录由应用管理，无需配置。已有手动源码目录保留且只读；要使用一键管理，清空折叠高级设置里的自定义运行目录。安装器不覆盖手动文件。重装保留旧目录，失败恢复，日志说明备份或未完成下载的位置。
- 默认 `43127`，禁止 `8080`；端口在折叠详情。选用模型后点击原启动/增强按钮，应用按需管理隐藏的本机服务；端口占用时拒绝接管其他服务，提示更换端口，不自动修改保存值。
- 模型组件信息提供固定 revision、文件名、大小、SHA-256 和实际目标；下载沿用 Hugging Face 镜像偏好，不更换 revision。
- 保存设置，再点击“扫描环境”。也可以先对未保存目录扫描；保存后才能保证重启保留。新字段不会改原提示词模型、LM Studio 遗留字段、队列或 History。
- 软件安装校验源码 SHA、引擎大小/hash、Python 包和 CUDA DLL 文件；离线复扫仅复检文件与安装记录，不启动程序。模型扫描核对大小/GGUF 头，不能代替 hash。软件安装成功不代表模型 pack、MTP、驱动加载或增强输出成功。

不用双击 `START-HERE.bat` 或手工运行 setup。软件和模型文件完整后重新扫描，在原提示词模型下拉选择所下载的量化版本并保存。点击原模型启动或增强按钮，首次自动校验权重并准备 CPU pack/tokenizer，然后加载；进度沿用原提示词进度，方形停止按钮可取消。后续复查并复用完成缓存，源权重不复制或搬移。派生文件在软件版本目录同级 `data`，卸载软件仍保留。基础路径不需要 MTP，后续加速不自动下载；不购买云 API、不占用8080、不改原默认模型。

启动、增强、取消、释放和退出均已接上应用 owner。上下文采用32K，视频输出预算8K、图片编辑4K；超限或截断不保存半截版本。R2V视频以静音关键帧供视觉检查，不表示音频理解。服务/代码/mock验证不代表完整 Qwen 推理已验；真实证据与剩余资源/质量/性能测试以TASK当前摘要为准。
