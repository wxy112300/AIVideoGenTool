# RTX 4090 / ComfyUI 0.35 H3 组合策略实测报告

- Type: Evidence / benchmark analysis
- Status: current evidence snapshot
- Date: 2026-09-11
- Scope: 单张 RTX 4090（24 GiB）、约 64 GiB 系统内存、ComfyUI 0.35、MiniMax H3 FL2VA；不覆盖其他 GPU、驱动、模型或 LoRA 路线
- Authority: 本报告记录 History 可核对数据、用户现场观察及由这些数据支持的当前建议；长期产品约束仍以 [WORKFLOW_CONTRACT](../../../WORKFLOW_CONTRACT.md) 为准
- Replaces: 本任务中早期仅基于低分辨率 smoke 的性能/稳定性猜测

## 1. 结论摘要

这轮调查证明 H3 的 Attention 后端、稀疏策略、运行时、VAE、分辨率和时长不是完全正交的。单独可用的选项组合后可能出现显存临界、随机 OOM 或显著的系统内存迁移。

当前可操作结论：

1. **固定驻留是本机明确推荐的运行时。** Dynamic VRAM + async offload 只减少约 1 GiB 专用显存，却把 RAM 峰值推到约 62–63 GiB、Shared GPU 推到约 24–25 GiB，并使严格对照慢 12.77%–20.36%。
2. **SOL-Attn 是速度策略，不是峰值显存策略。** 480p/10s 下，Sage CUDA + SOL 比对应稠密快 21.87%；Sage Triton + SOL 比对应稠密快 17.27%，但峰值显存没有同步下降。
3. **Sage Triton + SOL 是短负载性能首选。** 480p/10s 为 147.101 秒，是同 seed 核心矩阵最快组合；768p/10s 也成功。
4. **768p/15s 的 Triton + SOL 位于显存临界区。** 同参数第一次在 Wallpaper Engine 运行时 OOM，关闭该额外 GPU 负载后重试成功；成功样本峰值已达 22.8/24.0 GiB。该组合是“可成功但对后台显存敏感”，不是稳定保证。
5. **Sage CUDA + SOL 是 768p/15s 更保守的候选。** 它一次成功，用时 719.188 秒；Triton 成功样本快 4.78%，但已有一次 OOM。CUDA 运行中也观测到约 22.9 GiB 峰值，仍然压线。
6. **Comfy Kitchen 只建议走稠密。** Kitchen 稠密在核心矩阵比 Sage CUDA 稠密快 14.77%，但 Kitchen + SOL 既有成功记录也有 OOM 观察，不能作为稳定组合。
7. **INT8 ConvRot VAE 是当前性能默认。** 与 FP16 的严格对照中快 5.41%，RAM 峰值低约 1.1 GiB；FP16 的专用显存峰值反而低约 0.5 GiB，因此不能宣称 INT8 一定降低峰值显存。
8. **Comfy compiler 不进入推荐矩阵。** 它有一条耗时 975.082 秒的成功 History，但现场多次 OOM/卡住；“偶发成功”不能覆盖其高显存和极差时延风险。

## 2. 数据来源与证据等级

### 2.1 History 可核对数据

成功任务取自应用 `studio-state.json` 中的 History / `performanceStats`。报告不保存用户机器路径、媒体路径、完整提示词、任务 UUID 或输入素材。

核心 480p 对照满足：

- 相同输入与提示词；
- seed `846754648943975`；
- 864×480、10 秒、24 fps、20 steps；
- Spectrum 开启、preview 关闭；
- Comfy compiler 禁用；
- 默认使用 INT8 ConvRot VAE，只有 VAE 对照改为 FP16；
- 每个任务由应用重新启动其管理的 ComfyUI 执行环境，因此不是同一 CUDA allocator 会话内的热运行对照。

### 2.2 用户现场观察

失败任务不会进入 History，因此以下结论来自用户在应用运行时看到的实际错误或行为：

- Kitchen + SOL 曾 OOM；
- Sage + SOL + Dynamic VRAM 曾随机失败，重试成功；
- Sage + Turbo-SLA + Dynamic VRAM OOM；
- Kitchen +任务配方解析的 Native SLA OOM；
- Triton + SOL + 768p/15s 第一次 OOM，第二次成功；第一次运行时 Wallpaper Engine 正在使用 GPU；
- Comfy compiler 多次造成 OOM 或长时间无进展。

这些观察记录为“已发生”，但缺少失败时的完整 allocator / stage 级日志，不能据此声称所有同组合必然失败。

### 2.3 推断

报告中的因果判断按以下强度表达：

- **确认**：严格单变量对照或多条一致 History 支持；
- **高度可能**：数据与运行现象一致，但缺少失败时底层 allocator 证据；
- **未知**：尚无足够样本，不扩展成产品保证。

## 3. 核心 480p/10s 同 seed 矩阵

所有数值均为任务整体监控，不是扩散和 VAE 的独立分段统计。GiB 使用二进制单位。

| Attention | 稀疏 | 运行时 | VAE | 结果 | 耗时 | 相对 Sage 稠密固定 | RAM 峰值 | VRAM 峰值 | Shared GPU 峰值 |
| --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Sage CUDA | 稠密 | 固定驻留 | INT8 | 成功，基线 | 193.921s | 0% | 36.6 | 22.4 | 0.7 |
| Sage CUDA | SOL | 固定驻留 | INT8 | 成功 | 151.514s | **快 21.87%** | 36.2 | 22.4 | 0.7 |
| Sage CUDA | 稠密 | Dynamic + async | INT8 | 成功但高风险 | 218.686s | **慢 12.77%** | 62.9 | 21.3 | 24.7 |
| Sage CUDA | SOL | Dynamic + async | INT8 | 成功样本；另有随机失败 | 182.364s | 快 5.96% | 63.0 | 21.7 | 25.0 |
| Sage Triton | 稠密 | 固定驻留 | INT8 | 成功 | 177.803s | 快 8.31% | 34.0 | 21.0 | 0.7 |
| Sage Triton | SOL | 固定驻留 | INT8 | 成功，核心矩阵最快 | **147.101s** | **快 24.14%** | 35.1 | 21.8 | 0.7 |
| Comfy Kitchen INT8 | 稠密 | 固定驻留 | INT8 | 成功 | 165.271s | 快 14.77% | 34.1 | 21.9 | 0.7 |

### 3.1 速度排序

核心受控矩阵从快到慢：

1. Triton + SOL +固定：147.101s；
2. Sage CUDA + SOL +固定：151.514s；Triton 快 2.91%；
3. Kitchen +稠密+固定：165.271s；
4. Triton +稠密+固定：177.803s；
5. Sage CUDA + SOL +动态：182.364s；
6. Sage CUDA +稠密+固定：193.921s；
7. Sage CUDA +稠密+动态：218.686s。

### 3.2 SOL 的影响

- Sage CUDA：193.921s → 151.514s，快 21.87%；VRAM 峰值均约 22.4 GiB。
- Sage Triton：177.803s → 147.101s，快 17.27%；VRAM 峰值从 21.0 增至 21.8 GiB。
- 结论：SOL 的主要收益是跳过部分 Attention 计算、缩短时延；它可降低部分运行的平均显存，但没有稳定降低峰值显存。
- 画质仍需以相同 seed 输出人工检查，尤其是细线、灯光、水面反射、快速运动边缘和时序闪烁。

### 3.3 Attention 后端的影响

- 稠密模式中，Kitchen 比 Sage CUDA 快 14.77%，RAM 峰值少约 2.5 GiB，VRAM 峰值少约 0.5 GiB。
- 稠密模式中，Triton 比 Sage CUDA 快 8.31%，并给出最低的 21.0 GiB History 峰值。
- SOL 模式中，Triton 比 Sage CUDA 快 2.91%，差距较小；单次样本不足以把该差值推广到所有内容和规格。
- Kitchen + SOL 有 154.648s 的成功 History（不同 seed），同时用户观察到 OOM。因此该组合被分类为“混合结果/不稳定”，而不是“必定失败”或“已验证稳定”。

## 4. 运行时策略：固定驻留与动态卸载

### 4.1 严格对照

| Attention / 稀疏 | 固定驻留 | 动态卸载 | 动态卸载时延惩罚 | RAM 峰值变化 | Shared GPU 变化 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sage CUDA /稠密 | 193.921s | 218.686s | **慢 12.77%** | 36.6 → 62.9 GiB | 0.7 → 24.7 GiB |
| Sage CUDA / SOL | 151.514s | 182.364s | **慢 20.36%** | 36.2 → 63.0 GiB | 0.7 → 25.0 GiB |

### 4.2 补充样本

- Kitchen +稠密+动态：190.479s，RAM峰值62.36 GiB，VRAM峰值22.24 GiB，Shared GPU峰值23.96 GiB。
- Kitchen + SOL +动态：167.470s，RAM峰值62.08 GiB，VRAM峰值21.33 GiB，Shared GPU峰值24.86 GiB；不同 seed，仅用于确认动态卸载的内存迁移模式。
- Kitchen +旧 Auto +动态：184.946s，RAM峰值63.10 GiB，Shared GPU峰值25.18 GiB；旧 Auto 在普通无 LoRA 任务中等价于稠密。

### 4.3 判断

Dynamic VRAM + async offload 在本机不是“更安全的显存模式”：

- 专用显存峰值只减少约 0.7–1.1 GiB；
- 大量压力转移到系统 RAM 与 WDDM Shared GPU；
- 64 GiB RAM 基本被吃满；
- GPU 平均利用率下降；
- 两组严格对照均显著变慢；
- 现场已有随机失败和 OOM。

因此它从推荐矩阵中移除。若未来支持其他显存更小、系统内存更大的硬件，需要重新建立独立证据，不能沿用本机结论。

## 5. VAE 对照

固定为 Triton + SOL +固定驻留、480p/10s、相同 seed：

| VAE | 耗时 | 相对 INT8 | RAM 平均 / 峰值 | VRAM 平均 / 峰值 | Shared GPU |
| --- | ---: | ---: | ---: | ---: | ---: |
| INT8 ConvRot | **147.101s** | 基线 | 31.7 / 35.1 GiB | 15.9 / 21.8 GiB | 0.7 GiB |
| FP16 | 155.059s | **慢 5.41%** | 33.1 / 36.1 GiB | 15.4 / 21.3 GiB | 0.7 GiB |

判断：

- INT8 ConvRot 在该任务中更快且系统内存更低，适合作为性能默认。
- FP16 的 History 峰值显存反而低约 0.5 GiB，说明不能仅凭精度名称推断显存峰值。
- 监控覆盖整个任务，无法确认峰值来自扩散还是 VAE；最终选择还需要画质对照。

## 6. 分辨率与时长扩展

### 6.1 Triton + SOL +固定驻留+INT8

| 规格 | 结果 | 耗时 | RAM 平均 / 峰值 | VRAM 平均 / 峰值 | Shared GPU | GPU 平均 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 864×480 / 10s | 成功 | 147.101s | 31.7 / 35.1 | 15.9 / 21.8 | 0.7 | 72.1% |
| 1376×768 / 10s | 成功 | 431.237s | 33.8 / 38.1 | 14.6 / 18.7 | 0.7 | 86.2% |
| 1376×768 / 15s，首次 | **OOM**；Wallpaper Engine 开启 | 无 History | 无 History | 无 History | 无 History | 无 History |
| 1376×768 / 15s，重试 | 成功；Wallpaper Engine 不再占用该额外显存 | **684.844s** | 35.2 / 41.2 | 18.8 / **22.8** | 0.5 | 88.7% |

从 768p/10s 到 768p/15s：

- 时长增加50%；
- 成功样本耗时增加58.81%；
- RAM峰值增加约3.1 GiB（约8.1%）；
- VRAM峰值从18.7升到22.8 GiB（约21.9%）；
- 15秒任务进入显存临界区。

从480p/10s到768p/10s：

- 像素数增加到2.548倍；
- 耗时增加到2.931倍；
- 表现出高分辨率下的超线性计算增长。

### 6.2 CUDA + SOL +固定驻留+INT8

| 规格 | 结果 | 耗时 | RAM 平均 / 峰值 | History VRAM 平均 / 峰值 | Shared GPU | GPU 平均 |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 864×480 / 10s | 成功 | 151.514s | 32.3 / 36.2 | 15.9 / 22.4 | 0.7 | 72.2% |
| 1376×768 / 15s | 成功 | **719.188s** | 36.8 / 43.6 | 19.0 / 22.0* | 0.5 | 89.5% |

`*` CUDA 15秒任务运行中曾记录约22.9 GiB峰值，History 最终值为22.0 GiB。安全判断采用较高的实时观测值。

480p/10s 到768p/15s的像素帧工作量约3.822倍，耗时变为4.747倍，约有24%的额外超线性开销。

### 6.3 768p/15s 后端对照

| 后端 | 结果历史 | 成功耗时 | 相对 CUDA | RAM 峰值 | VRAM 峰值判断 |
| --- | --- | ---: | ---: | ---: | --- |
| Sage CUDA + SOL | 1次成功 | 719.188s | 基线 | 43.6 GiB | History 22.0 GiB；实时至少22.9 GiB |
| Sage Triton + SOL | 1次 OOM、1次成功 | **684.844s** | **快 4.78%** | 41.2 GiB | History 22.8 GiB，明显临界 |

Triton 成功样本更快、RAM更低，但一次成功不能抹掉同参数的一次 OOM。当前分类：

- CUDA：15秒高负载的保守候选，但显存也不宽裕；
- Triton：15秒高负载的性能候选，对后台 GPU 占用敏感，不具备稳定保证。

## 7. 为什么 Triton 768p/15s 一次 OOM、一次成功

成功样本已经达到22.8/24.0 GiB，只剩约1.2 GiB名义余量。失败时 Wallpaper Engine 正在运行；成功重试未重启主应用，但不再有该额外 GPU 负载。

最符合现有证据的解释是：

1. Wallpaper Engine、桌面合成或视频解码多占用数百 MiB 至约1 GiB，足以跨过临界线；
2. Triton 首次遇到15秒张量形状时可能进行编译或 autotune，产生短时 workspace；失败后缓存可能被后续重试复用；
3. PyTorch CUDA allocator 需要连续分配块，总空闲显存接近上限时，碎片和分配顺序可决定成功或 OOM；
4. 当前监控为定时采样，可能漏掉数百毫秒级瞬时峰值。

因此这不是 seed 造成的“随机画面差异”，而是显存安全余量不足时的小幅外部波动决定了结果。该解释属于高度可能；失败任务没有保存完整 allocator snapshot，尚不能精确分摊 Wallpaper Engine、Triton autotune和碎片各自占比。

## 8. 编译器、Kitchen + SOL 与其他混合结果

### 8.1 Comfy compiler

- History 有一条 Sage +旧 Auto/稠密+固定驻留+compiler auto 的成功记录：975.082s，VRAM峰值22.94 GiB、Shared GPU 1.21 GiB。
- 现场另有多次 OOM或长时间无进展。
- 与151–194秒的关闭编译器样本相比，即使成功也没有性能价值。
- 当前结论：默认和推荐均为禁用；不继续扩展矩阵。

### 8.2 Kitchen + SOL

- 固定驻留成功 History：154.648s、RAM峰值35.49 GiB、VRAM峰值22.11 GiB；该样本 seed 与核心矩阵不同。
- 用户另有 OOM观察。
- 当前结论：Kitchen 稠密是有效次选；Kitchen + SOL 是不稳定组合，应警告或做组合级 fail-closed，而不能依靠每个单项“可用”判断。

### 8.3 Native SLA / Turbo-SLA

- 全局 Native SLA 选项曾在非 Turbo-SLA 任务触发 `native-sla-requires-turbo-sla`，现已从全局设置移除。
- Native SLA 只保留为 Turbo-SLA任务配方内部解析值和旧队列/History兼容值。
- 已知 Sage + Turbo-SLA +固定驻留可运行；加入动态卸载后 OOM；Kitchen 与任务配方解析的 Native SLA 也曾 OOM。
- 用户本轮明确将 LoRA 设为低优先级，因此没有继续做受控 LoRA矩阵；这些观察不得与普通无 LoRA H3 的性能表混算。

### 8.4 VSA 与 PyTorch

- VSA 缺少已验证 FastH3 权重和 Windows kernel，不进入全局选项或测试矩阵。
- PyTorch Attention 本轮没有受控性能样本，只保留为兼容回退，不能写入速度排序。

## 9. 当前推荐组合

### 9.1 按负载推荐

| 使用场景 | 推荐组合 | 推荐等级 | 依据 /限制 |
| --- | --- | --- | --- |
| 480p/10s性能 | Triton + SOL +固定驻留+INT8 VAE | 性能推荐 | 核心矩阵最快，147.101s |
| 480p/10s稳定基线 | Triton +稠密+固定驻留+INT8 VAE | 稳定推荐 | 177.803s，核心矩阵最低稠密VRAM峰值 |
| 480p/10s稠密次选 | Kitchen +稠密+固定驻留+INT8 VAE | 次选 | 165.271s；不要叠加SOL |
| 768p/10s性能 | Triton + SOL +固定驻留+INT8 VAE | 已验证可用 | 431.237s，内存未出现异常迁移 |
| 768p/15s保守 | CUDA + SOL +固定驻留+INT8 VAE | 当前稳定候选 | 1次成功；实时峰值约22.9 GiB，仍压线 |
| 768p/15s性能 | Triton + SOL +固定驻留+INT8 VAE | 实验/临界 | 成功样本比CUDA快4.78%，但已有同参数OOM |
| 兼容回退 | PyTorch +稠密+固定驻留 | 未做性能验证 | 只用于后端不可用或kernel不匹配 |

### 9.2 明确不推荐

- 任意 H3 + Dynamic VRAM + async offload（本机4090/64 GiB）；
- 任意 H3 + Comfy compiler auto；
- Kitchen + SOL 作为默认组合；
- 768p/15s Triton + SOL 在后台 GPU应用运行时无警告执行；
- 未验证的 VSA；
- 将全局 Native SLA 暴露给普通 H3。

## 10. 产品校验与自动策略建议

### 10.1 组合级校验

单项探测通过不代表组合安全。建议至少实现：

- Kitchen + SOL：标记不稳定，默认阻止或要求显式实验确认；
- Dynamic VRAM：在4090/64 GiB配置下明确不推荐，不作为自动回退；
- 768p/15s + Triton + SOL：启动前检查可用显存和后台 GPU 占用；
- Turbo-SLA：任务配方内部绑定 Native SLA，不允许普通全局设置强制选择；
- Comfy compiler：H3默认禁用。

### 10.2 显存预检

对本机精确组合，可将“启动前可用专用显存约22 GiB”作为经验警告线，而不是跨硬件硬编码保证。若后台占用使基线接近或超过约2–2.5 GiB，应提示：

- 暂停 Wallpaper Engine、浏览器 GPU 视频或其他 CUDA程序；
- 或将768p/15s从Triton切换到CUDA；
- 不要自动启用动态卸载。

### 10.3 不建议静默重试

768p/15s单次运行约11–12分钟。Triton OOM 后静默用CUDA重跑会消耗大量时间，应用应给出明确原因和用户选择，而不是自动吞掉失败。

## 11. 监控缺口与后续改进

1. **History峰值可能下降。** CUDA 15秒运行中曾看到22.9 GiB，最终History只有22.0 GiB；Shared GPU也出现类似变化。峰值在生命周期聚合时不应降低，应检查队列统计转存逻辑。
2. **缺少阶段峰值。** 当前只有任务整体数据，无法区分模型加载、扩散、SOL/Triton workspace、Spectrum和VAE阶段。
3. **`h3TokenCount`不含明显时间维度。** 768p/10s与15s均记录1731，不能用于预测长视频显存。
4. **缺少 allocator 指标。** 需要同时记录 allocated、reserved、free、largest pending allocation和OOM申请大小。
5. **缺少实际 owner / fallback运行证据。** History中的policy是请求/解析快照，不等于kernel实际执行日志；应记录最终owner、kernel和fallback。
6. **失败任务无结构化性能快照。** OOM任务未进入History，导致无法对失败前峰值做同等分析；应保留脱敏的失败运行统计。

## 12. 尚未完成的验证

- 相同输入下的人工画质盲评；
- 768p/15s Triton +稠密，用于区分“Triton本身”与“Triton × SOL”交互；
- 768p/15s CUDA +稠密，用于量化长负载下 SOL 的收益；
- PyTorch兼容回退 smoke；
- 其他 GPU/系统内存容量；
- LoRA/PDD/Turbo-SLA正式矩阵；
- OOM时 allocator 和Triton autotune日志。

这些缺口不阻止当前推荐收敛，但阻止将结论描述为跨机器、跨模型或绝对稳定保证。
