# 视频续写（Extend）设计

## 1. 产品边界

视频续写是创建页的一种输入模式，不是历史详情中的版本编辑器。

创建页提供两种模式：

1. **图片生成**：输入单张首帧，或首帧与尾帧。
2. **视频续写**：输入一段视频，裁出保留范围，描述接下来发生的内容。

历史详情只提供“继续创作”入口，把当前正在查看的具体视频版本带入创建页。续写完成后生成一个新的独立历史作品；该作品可以像普通作品一样拥有自己的 480p、720p、1080p 或 4K 版本。

这样历史仍保持简单的一维结构：同一作品内的版本只表示相同内容的不同清晰度或处理结果，不混合不同时长。

## 2. 裁剪与续写语义

视频模式提供与 iOS、Twitter 等视频编辑器一致的双手柄 Trim 控件。默认选择完整输入视频，用户直接拖动左右手柄选择要保留的 `[trimStart, trimEnd]` 范围，不通过文本框手动输入时间。

拖动手柄时播放器保持暂停，并立即定位到对应起点帧或终点帧，以便精确判断画面。`trimEnd` 对应的画面是续写上下文的最后一帧。界面实时展示：

- 保留片段；
- 裁掉内容；
- 新增内容；
- 预计成片总时长。

“新增时长”只表示模型生成的新片段长度。预计成片时长为：

```text
(trimEnd - trimStart) + 新增片段 - 原生视频上下文的重叠帧
```

创建页在 workflow 尚未确定重叠帧数时显示“约”；任务提交后由具体 extension workflow 给出准确预计值。

## 3. 模型能力门禁

视频模式只允许选择 workflow capability 明确声明支持 Extend 的模型。

当前设计基线：

| 模型路径 | 当前仓库能力 | 视频续写模式 |
| --- | --- | --- |
| Sulphur 2 / LTX 2.3 | 已接入官方 Extend sampler 与 Q2/Q3/Q4 分离式 GGUF 图 | capability 与所选档位的组件验证通过后启用 |
| Wan 2.2 5B | 当前内置图为 I2V | 禁用 |
| Wan 2.2 14B / GGUF | 当前内置图为 I2V；社区扩展不属于当前受控依赖 | 禁用 |
| HunyuanVideo 1.5 | 当前内置图为 I2V | 禁用 |

不能因为模型支持 I2V，就把“提取续写点单帧后重新生成”包装成原生 Extend。需要这种能力时，应另行设计“从画面创建”操作，而不是降低视频续写模式的语义。

29.2 GB FP8 mixed checkpoint 已在本机真实进入 `LTXVExtendSampler`，但占用约 23.4/24.6 GB 显存并造成桌面严重卡顿，因此不再作为内置部署路径。当前使用 `UnetLoaderGGUFAdvanced` 加载 transformer，Gemma 3 与 LTX connector 由 `DualCLIPLoader` 独立加载，视频和音频 VAE 也独立加载。官方 `Lightricks/ComfyUI-LTXVideo` custom node 已通过项目安装器安装并成功加载。

设置中的模型档位同时控制 I2V、Extend、环境扫描和新任务快照：

| 档位 | Transformer | 用途 | Distill LoRA |
| --- | --- | --- | --- |
| `q2_distilled` | `sulphur-2-distilled-Q2_K.gguf`，约 7.93 GB | 8GB 兼容，质量最低 | 不加载 |
| `q3_k_m` | `sulphur_dev-Q3_K_M.gguf`，约 11.13 GB | 默认均衡档 | 加载 |
| `q4_k_m` | `sulphur_dev-Q4_K_M.gguf`，约 14.30 GB | 质量档 | 加载 |

“8GB 兼容”依赖 CPU offload、mmap、足够的系统内存和页面文件，不表示所有权重同时驻留在 8GB 显存。360p/49 帧仍是首个实测配置；未经用户明确许可不启动重型 inference benchmark。

正式实现中，模型是否可选必须同时满足：

- FFmpeg worker 按原始 `trimStart/trimEnd` 精确抽取保留段，只把裁剪终点前的 overlap 上下文交给 ComfyUI；
- API 节点输入包含 `{{SOURCE_VIDEO}}`、`{{EXTENSION_FRAMES}}`、`{{OVERLAP_FRAMES}}`；
- 使用官方 `LTXVExtendSampler` 或 `LTXVLoopingSampler`；
- transformer 通过返回标准 `MODEL` 的 `UnetLoaderGGUFAdvanced` 加载，且 `patch_on_device=false`；
- Gemma 3 与 LTX text connector 通过 `DualCLIPLoader(type=ltxv)` 加载；
- 视频 VAE 使用独立 `VAELoader`；I2V 音频 VAE 使用 `LowVRAMAudioVAELoader`，文件放在 `models/checkpoints`；
- Q2 distilled 图不得叠加 distill LoRA，Q3/Q4 dev 图必须叠加；
- 采样后存在显式 `VRAM_Debug` 卸载节点；
- 解码使用 tiled VAE；
- 任务保存量化档位、360p/480p、49/65 模型帧、16 帧 overlap 和阶段卸载的不可变设置快照；
- 模型组件和 `ComfyUI-LTXVideo` 扫描完整；
- 当前机器通过该配置的显存与输出验证。

仅包含三个输入占位符只能证明数据契约完整，不能证明工作流符合原生续写低显存契约，因此不会在创建页标记为可用。

## 4. 创建页交互

### 4.1 图片生成

保持现有流程：

- 首帧图片；
- 可选尾帧；
- 提示词；
- 模型、比例、分辨率和时长；
- 加入队列。

### 4.2 视频续写

视频模式包含：

- 本地视频选择和拖入；
- 从历史详情带入当前视频版本；
- 视频播放器；
- 默认暂停、拖动时逐帧预览的双手柄 Trim 时间轨；
- 保留、舍弃、新增和总时长摘要；
- “接下来发生什么”提示词；
- 只显示可用 Extend 模型，其他模型禁用并说明原因；
- 跟随输入视频比例；
- 新增片段分辨率和时长；
- 加入队列。

从历史带入时，默认选择完整视频，即起点为 0、终点为视频末尾。输入 4K 历史版本不代表模型以 4K 运行；worker 应根据模型 profile 生成规范化输入，并在任务记录中保存实际输入尺寸。

## 5. 历史行为

续写结果是新的 `HistoryAsset`，不是源作品的 `AssetVersion`。

例如：

- 原始 5.2 秒视频：作品 A；
- 从 A 的 3.4 秒处新增 5 秒：作品 B，预计 8.4 秒；
- B 的 1080p 和 4K：仍属于作品 B 的 `AssetVersion[]`。

作品 B 可以保存可选来源字段：

- `sourceAssetId`
- `sourceVersionId`
- `trimStartSeconds`
- `trimEndSeconds`

这些字段只用于可复现记录和“由某作品继续创作”的提示，不形成用户必须管理的故事树。删除源作品不会破坏已经完成且自包含的续写作品。

## 6. 状态与任务

创建草稿建议增加：

```ts
interface Draft {
  inputMode: "image" | "video";
  sourceVideoPath: string;
  sourceVideoDuration: number;
  trimStartSeconds: number;
  trimEndSeconds: number;
}
```

前端复用同一创建页，但后端继续使用独立的 `extension` 队列任务，因为该任务拥有不同的执行生命周期：

- `sourceAssetId?`
- `sourceVersionId?`
- `sourceVideoPath`
- `trimStartSeconds`
- `trimEndSeconds`
- `extensionDurationSeconds`
- `modelId`
- extension workflow 快照
- 模型级显存 profile

普通 generation worker 不负责裁剪和拼接。

## 7. 执行管线

Extension worker 负责：

1. 使用 ffprobe 读取真实时长、帧率、分辨率、编码和音轨。
2. 将裁剪起点和终点对齐到合法视频帧。
3. 精确生成 `[trimStart, trimEnd]` 的保留片段。
4. 按模型要求提取尾部多帧或短视频上下文。
5. 将上下文规范化到 extension workflow 支持的分辨率和帧率。
6. 按任务快照中的 Q2/Q3/Q4 模型档位提交 ComfyUI。
7. 去除上下文重叠帧并拼接新片段。
8. 统一编码、像素格式和音频策略。
9. 校验输出可解码、时长和帧数后，写入新的历史作品。

不能只依赖 stream-copy 裁剪，因为关键帧边界可能使实际续写点偏移。第一版优先采用精确重编码和统一编码后拼接。

## 8. 验收

- 本地选择视频与从历史带入都能进入视频续写模式。
- 默认选择完整视频，可分别拖动裁剪起点和终点。
- 拖动任一手柄时播放器暂停并预览对应帧，不要求手动输入时间。
- 不支持 Extend 的模型不可选。
- 5 秒和 10 秒新增长度遵守模型 profile。
- 输出总时长与保留前缀、新增片段和 overlap 去重一致。
- 记录 VRAM、RAM、阶段卸载和失败恢复证据。
- 新结果作为独立历史作品出现，源作品及其分辨率版本不改变。

交互原型位于 `prototypes/create.html`，历史入口位于 `prototypes/history-detail.html`。
