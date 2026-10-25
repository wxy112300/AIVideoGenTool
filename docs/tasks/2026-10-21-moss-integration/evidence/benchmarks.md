# MOSS 公开评测与卡片顺序复核

2026-10-22 查询。原先以“参考编辑功能数量”排序，把 MOSS 放在第 10 张，不能表达其文生图质量与文字/布局价值，现已修正。

## 独立人类偏好榜：同榜内比较

| 已接入型号 | Artificial Analysis T2I v2.1 | Arena T2I |
| --- | --- | --- |
| Qwen Image 2.1 | #21，1042 ±12，5712 samples | #19，1223 ±7，11441 votes，Preliminary |
| Qwen Image 2.1 Turbo | #26，1029 ±12，4625 samples | 当前可见表未找到对应条目 |
| HiDream-O1-Image | #62，975 ±10，10662 samples；不拿 1.5 / Dev 替代 | #47，1116 ±4，66906 votes |
| Z-Image-Turbo | #71，936 ±11，8170 samples | #59，1083 ±5，24808 votes |
| Z-Image Base | #86，891 ±17，2500 samples | 当前可见表未找到对应条目 |
| FLUX.2 Klein 4B | #95，837 ±12，6418 samples；不拿 9B 替代 | #70，1030 ±3，152389 votes |
| OmniGen2（榜单名 OmniGen V2） | #104，717 ±26，2043 samples | 当前可见表未找到对应条目 |
| MOSS / PornMaster | 当前可见表未找到对应条目 | 当前可见表未找到对应条目 |

来源：[Artificial Analysis](https://artificialanalysis.ai/image/leaderboard/text-to-image)、[Arena](https://arena.ai/leaderboard/image/text-to-image)。两榜的 Elo 不同标尺，不能横向相减或混排。Arena 页头标注 Oct 7, 2026，以上是查询时公开页面的可见快照，不宣称为 10/22 实时票数。未收录不能解释成落后或最后一名；社区改模与量化也不能继承母模型分数。

## MOSS 论文结果：文字/布局强项，不能换算成通用总榜名次

来源：[MOSS-Image Technical Report v1](https://arxiv.org/html/2610.23374v1)，2026-10-16，§5 / Appendix G。以下均由作者评测，LLTB 与 RLA 也是作者构建。

| 项目 | 公开结果 | 适用边界 |
| --- | --- | --- |
| LLTB 长文本覆盖率 Mean-6 | MOSS 96.3；Qwen Image **2512** 64.9 | 不是 Qwen 2.1 对比；覆盖率不等于整段文字完全正确，不检查文字顺序，也不直接惩罚额外文字 |
| 7Bench 布局 | 全目标 mIoU 0.6788；检测目标 mIoU 0.8786；Layout AUC 0.7031 | 224 张图 / 576 目标；第三方基准由 MOSS 作者运行，两种 mIoU 不能混称 |
| RLA 完整系统 | MOSS 1698.70 Elo，报告展示系统中第二；GPT Image 2 为 1844.35 | 61 个海报/信息图/UI 任务；MOSS 包含 GPT-6 Layout PE，并非本应用当前普通增强器的成绩 |
| RLA 统一增强自然语言 prompt | MOSS 1807.34，报告展示生成器中第一 | 独立拟合的分组 Elo，不能与上一行或 AA/Arena 数值直接比较 |

报告结果不能直接视为当前 **SFT INT8 + W4A8 编码器 + 25 步** 的量化复现，也不适用于 PornMaster。没有找到 MOSS 与 Qwen 2.1 在同一独立总榜上的有效名次对照，不能据此宣布 MOSS 全面超过 2.1。普通摄影/审美与成人细分质量还需同输入 A/B；4090 速度另需同配方实测。

## 本次采用的导航优先级

1. Qwen Image 2.1 官方：独立榜有成绩，兼顾生成和编辑。
2. MOSS Image SFT INT8：公开文字/布局结果强，作为另一个主力候选，不能仅因没有编辑功能放在旧模型后面。
3. PornMaster：紧随母模型便于选择成人版本；是衍生版分组位置，不是第三名质量结论。
4. Qwen Turbo、Qwen GGUF 备用：保留同族变体入口，不把蒸馏或量化文件等同于官方完整权重的分数。
5. 其他通用文生图按同一个 AA 榜的可比条目依次为 HiDream O1 → Z-Image Turbo → Z-Image Base → Klein 4B → OmniGen2；旧 Qwen 2511 编辑与背景/移除工具随后。编辑与专用工具的用途没有因 T2I 分数被撤销，现有 ID、采样和可选入口保持。

Create 与 Settings 仍由同一 catalog order 驱动。卡片顺序用于工作室的使用与验证优先级；公开独立榜、作者专项评测和本机运行证据分别保留，不制造不存在的综合跑分。
