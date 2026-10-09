# 0.39.2 推荐线 / 当前核心兼容与 GGUF 实施

日期：2026-10-09；类型：实施与验收证据。用户授权修复两处兼容、迁移通用 GGUF、更新推荐线；[原评估](upgrade.md)保留2026-10-08的历史身份，不覆盖。当前状态见 [TASK](../TASK.md)。

## 核心身份与授权边界

用户确认 Desktop 标注 `v0.39.2 + 26 commits / d91ed5f`，本次保留此核心。所选源码实际 SHA 为 `d91ed5f5b7fa60fa18464c2ad7c80254da2f0f29`，源码版本文件报告 `0.39.0`，`git describe` 为 `v0.39.0-26-gd91ed5f5`。官方 [v0.39.2](https://github.com/Comfy-Org/ComfyUI/releases/tag/v0.39.2) tag 为 `3c1b7a17fdf239d35ce98cc777756f572d089795`；不是此次实跑的 SHA，不把版本标签混成同一源码。

选中 Python 3.12.11 / PyTorch 2.10.0+cu130 / torchvision0.25.0+cu130 / torchaudio2.10.0+cu130 / Sage2.2.0+cu130torch2.10 / Triton3.6.0.post26；RTX4090 SM8.9。已装 kitchen0.2.37，真实探针发现 CUDA backend，无 probe errors。当前核心与官方0.39.2 requirements均要求0.2.37；检查两者H3 VAE/Linear API，实际推理由当前核心完成。未安装/升级核心或重装Torch/Sage/kitchen，未下载权重、未更新其他节点。

## 已交付行为

- 核心推荐版集中为 `COMFYUI_RECOMMENDED_VERSION=0.39.2`，Settings H3兼容信息与全部bundled workflow推荐线复用；工作流最低支持版本和既有ID不变。Motion Context历史compatibilityEvidence保留0.34.0，不随新推荐改写过去证据。
- `H3_COMFY_KITCHEN_VERSION=0.2.37` 同步驱动ConvRot readiness和加速安装器，避免修复按钮装回0.2.35。继续要求CUDA13+和CUDA backend；未知/未审计版本不以`>=`放行。
- 通用GGUF固定 [leejet/373048b](https://github.com/leejet/ComfyUI-GGUF/tree/373048b8403a7820620065210a691263d4da0a61)。扫描器显示真实origin，并拒绝同版本city96、未知origin或错误revision；安装器沿用备份替换事务。节点语义版本仍2.0.0，不虚构新版本号。
- Vite/Vitest对相对`.js`源码导入优先使用存在的`.ts`兄弟文件。仓库tracked旧生成JS此前遮蔽新catalog，导致renderer/测试读旧pin；不手工复制第二份catalog，也不删除旧文件，Electron编译仍按NodeNext发出JS。

## 检查结果

| 验收边 | 真实结果 |
| --- | --- |
| focused回归 | kitchen0.2.37接受、0.2.35/0.2.38/CUDA12.9拒绝；GGUF相同2.0.0错误来源/未知origin/错误SHA拒绝，正确来源+pin恢复；city96/molbal迁移均固定checkout且不pull覆盖旧目录 |
| 全仓库 `npm.cmd run verify` | 190单元测试文件/1690测试 +6集成文件/83测试，全通过；typechecked clean build与20对比度组合通过。总1773测试 |
| 真实AppApi迁移 | 原city96 `6ea2651e7df66d7585f6ffee804b20e92fb38b8a` 先备份；当前origin为leejet、HEAD为完整373048b，安装返回ok。原副本留所选data的node-backups；requirements均已满足，未改Python包版本 |
| 离线/在线就绪 | AppApi扫描迁移前GGUF loaded=false且错误说明来源；kernel ready=true / ConvRot优化=true。应用启动后GGUF、H3专用GGUF、内置AV均loaded/runtimeVerified=true |
| H3 UI→运行→History | 缺prompt禁用→键盘恢复→真实按钮→`c815f822-93bf-47e1-a361-0215330471c8`，草稿编辑不改任务快照。20步、480p、实际MP4为864×480/24fps/1.625秒；History解码帧推进、播放与返回通过。请求1秒不作为实际时长证据 |
| Qwen原生UI→运行→History | 缺prompt禁用→键盘恢复→真实按钮→`477a0779-bd82-4bd1-b824-1df1a00ab6ba`；无LoRA、preview-25、seed42、1:1/480输出；实际480×480 PNG非空，History图像解码、尺寸、task/version lineage和返回通过 |
| Qwen GGUF范围 | Q8/Q6组件尚缺，files=false；节点schema runtimeReady=true。没有强行提交、下载或以原生Qwen成功冒充GGUF生成成功；tensor映射/权重加载与性能质量仍待实际权重 |

运行目录及原始日志、安装备份路径、CDP/PID、图片/视频和完整scan仅保留gitignored temp，不提交用户提示词/状态/机器路径。隔离fixture从用户设置创建，初始queue/History空；用户4条队列与129作品不用于试验。此次无性能/画质A/B结论，也未验证回退到旧节点，备份存在不等于回退验证通过。

同一隔离fixture重启后，kitchen0.2.37/ConvRot与GGUF来源、固定SHA、loaded/runtimeVerified再次通过；两个History版本及实际非空媒体保留，core SHA未变。用户queue仍4条、History仍129条、设置与基线一致，重启前后的用户state文件与H3专用GGUF入口SHA256一致。

最后通过AppApi停止应用拥有的ComfyUI，再关闭隔离窗口；本次Electron PID已退出，CDP与8188无监听。此清理证据不声称原生窗口退出生命周期已验证。详见[TASK](../TASK.md)。
