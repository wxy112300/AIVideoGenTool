# Strata 0.2.9 推荐目标

日期：2026-11-01。范围：用户授权提高推荐版本；不自动安装、不下载主权重、不启动引擎、不接入 DeepSeek。

## 固定身份

| 项目 | 值 |
| --- | --- |
| 官方发布 | [Strata 0.2.9](https://github.com/Niko1221/Strata/releases/tag/v0.2.9) |
| 源码 commit（剥离 annotated tag） | `c62d5e3a15b40ea51c96aae9e8d36928965f53ab` |
| Windows Qwen CUDA 13 引擎 | `0.1.55` |
| 官方归档 | `strata-engine-0.1.55-windows-x86_64-cuda-cuda13.tar.gz` |
| 下载字节 | `621585315` |
| 归档 SHA-256 | `34f399a0a22e4af8b434439de04dcce3734ccba7e884ef6003439ba148d667df` |
| 组件清单 SHA-256 | `84271f6e1ca94bf39ac9c22b64a9bde71aadc67fb3482e5d240d515e9158b98d` |
| build ID | `99866a47a2b8+cuda13.0` |
| CUDA 架构 | `sm_75, sm_86, sm_89, sm_120, compute_120` |
| feed 所列最低 NVIDIA 驱动 | `580.65` |

归档大小和摘要在官方 GitHub Release API 与 [发布 feed](https://github.com/Niko1221/Strata/releases/download/v0.2.9/strata-feed.json) 一致，组件摘要来自该固定 feed。没有下载完整归档或校验其实际文件字节；用户点击更新后仍由原安装器完整校验归档、组件及官方 Python 自检。

只读取过归档前64 KiB用于检查结构，无法从该前缀得到排在大型 DLL 后的组件清单；因此安装事务测试改为明确的合成清单和测试专用摘要，新增篡改清单必须拒绝且保留旧安装的回归。生产校验值不使用测试摘要，不降低检查。主引擎包没有落盘。

## 旧安装与派生缓存

- 推荐目录仍由同一个 catalog 供主应用及独立工具使用，固定受管理 runtime 路径、端口、权重目录和现有设置不变。
- 保留0.2.7.1及0.1.45/0.1.44.1/0.1.41的准确安装身份；提高推荐不改变当前实际安装版本。
- [0.2.9专家加载器](https://github.com/Niko1221/Strata/blob/c62d5e3a15b40ea51c96aae9e8d36928965f53ab/src/core/expert_source.cpp)仍明确处理native表v3（逐层）及v4（逐角色/分片）来源。兼容迁移保留源模型/MTP状态、派生文件事实及精确应用生成配置核对，仅允许已列出的0.1.45/0.2.7.1来源和v3/v4格式；不泛化到任意revision或v5。
- [官方setup源码](https://github.com/Niko1221/Strata/blob/c62d5e3a15b40ea51c96aae9e8d36928965f53ab/setup.py)固定llama.cpp解析器仍为`3cf03257f219afbe7334045ff7c6a06ac68c627d`，没有引入额外模型下载。
- 自带ESP仍按既有小向量大小及hash校验；社区向量来源、大小、hash和三档选择不变。实际加载效果不由元数据核对证明。

真实0.2.9安装、三种量化神经推理、图片/长上下文、反复启停及Agent工具会话均未在本次执行；旧0.2.7.1实测记录不能推广为0.2.9实测。

## 本次检查

- 6个相关文件160项测试、双端typecheck通过，覆盖安装失败恢复、清单篡改拒绝、旧版识别和三种量化的两条来源迁移；合成事务不是新引擎真实安装。
- 最终全量单元3038项通过，1项NAS真实文件用例超时及清理ENOTEMPTY；原参数单独复测整文件11项通过，未改代码/断言/超时。其后127项集成、干净生产构建和440项对比度通过；不将组合结果写成首次verify命令通过。私有日志位于忽略目录`temp/strata-029-assessment`。
- 独立工具重新prepare后读取编译产物：推荐0.2.9／引擎0.1.55，安装收据仍是0.2.7.1。没有修改独立工具偏好或启动服务。
- 实际读取新版源码中的483520bytes自带ESP，SHA-256仍为`ef0724c5b79297e481017be85769832bc26eb220c984ecba2b0e1b0c8426312b`；该临时小向量与64KiB归档前缀均已清理。
