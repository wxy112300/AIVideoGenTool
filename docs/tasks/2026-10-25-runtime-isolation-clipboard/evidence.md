# 运行时隔离与 Windows 文件复制证据

日期：2026-10-25。当前工作区，patch；旧 HEAD 中已存在整卡显存兜底重启，并非 UI 迁移新引入。未获取或修改已发布的云端构建。

## 原因与修正

旧队列隔离逻辑本身能区分无 LoRA 与 LoRA 边界；另有 H3 完成后的释放验证，每次将整张显卡限制到 `min(5 GiB, 总显存 × 20%)` 且要求全局 GPU 利用率低于 10%，未达就恢复重启。这并不能区分 ComfyUI、桌面和其他程序，也把 0 占用当作缺失样本。

新 helper 读取当前配置端点的 `/system_stats`：核对本机核心 `server.py` 和 `comfy/model_management.py`，`torch_vram_total - torch_vram_free` 对应此进程的活跃 Torch 分配。多 GPU 全部检查，畸形/缺字段返回 unknown，0 有效。进程数据优先；整卡低占用作为旧版正向兜底，高占用/未知不能单独证明进程泄漏。连续采样仍确认的高活跃分配或 `/free` 失败保留恢复，remote 不调用进程管理。这里测量的是 Torch 活跃内存，不能宣称覆盖所有驱动/第三方非 Torch 分配。

文件复制原有每次写入后清理其他 staging 目录，并发时可互相删除剪贴板所指文件。现在串行覆盖 stage→write→prune，失败不阻塞下一请求；UI 合并同路径在途复制并显示 aria-busy，结束后恢复。PowerShell 以原生 CF_HDROP 写入，立即比对文件列表，最多八次 120ms 间隔重试，总子进程超时保持 10 秒。原文件仅用于硬链接/复制，清理仍限应用暂存区。

## 自动检查

- `npm.cmd run typecheck`、相关服务/执行器/History 定向测试通过。
- `npm.cmd run verify`：2533 单元、91 集成、桌面/Web 构建和 440 对比度检查通过。
- 新增覆盖：其他 GPU 应用高占用但 Comfy Torch 已释放；未知遥测不冒充泄漏；零显存有效；真实 Torch 保留与失败 unload 恢复；remote 不管理进程。保留 LoRA/always/model-change 执行器断言。
- 原生剪贴板事务回归以真实临时文件、延迟原生命令回调复现交错；验证第二操作不会提前启动、最后暂存文件存在、原文件保持，以及第一操作失败后队列恢复。

## 真实运行

隔离 Electron 的 Create：缺 prompt 时按钮禁用→原生键入→三个实际加入队列按钮→三个 task ID；LoRA 数量均 0，隔离设置为 `lora`，随后点击实际 Queue 开始按钮。实际采样沿用了工作流的 20 步，未把准备脚本请求的 2 步当作执行事实。

三个输出均经 ffprobe 与实际详情播放验证为 448×256、1.625 秒，文件分别 125201/127101/126590 bytes。没有因为旧任务离队就把它们判为消失：按 task ID 在 History 对应版本核对。

本次正常运行 session 只有一次 `RuntimeProcessLaunched`，应用持有 PID 40204、实际监听 Python 子进程 PID 33520 为同一进程树；没有 queue-isolation restart、release recovery restart 或 profile-switch restart。两个任务间各有一次 `H3ReleaseVerified`，最后一段释放交给正常队列结束停服。

第一段释放后整卡占用为 **5230297088 bytes**，旧阈值 **5151444172.8 bytes**，GPU 3%；旧判定此时不能通过。新进程检查通过，第二段正常执行，第三段也完成。这里证明了相同高整卡占用路径能继续，不将其推广为所有模型/时长已验证。

## 真实文件按钮

同一生产窗口中打开生成的 History 视频详情，中心、图标位置、右边缘分别原生单击，均一次写入成功。五次约 10ms 间隔重复点击合并为一次原生复制。每次以 Windows `Get-Clipboard -Format FileDropList` 核对一个暂存文件，其路径在该隔离 userData 的 `clipboard-files` 内，文件可读取且大小与原始视频相等；原始视频始终存在。最终截图与报告位于本地 `temp/ui-runtime-copy/`，不纳入提交。

两处夹具问题已纠正并区分于产品失败：第一套旧设置缺有效 Python/运行路径，启动退出码 2，未执行任务；改用当前真实安装设置并保持隔离端口/输出后成功。原生 helper 的首次手工探针传了相对 staging 路径，与绝对 CF_HDROP 比对失败；生产路径由 StudioPaths 提供绝对路径，最终原生和 UI 探针均使用该真实契约。重复点击脚本最初逐次滚动等待，跨越第一次复制完成，允许第二个正常复制；最终固定坐标快速点击验证了在途合并。

## 收尾与限制

队列正常结束后自有 ComfyUI 进程树已停止；AppApi 清理 helper 核对队列停、Prompt idle、runtime stopped 后关闭窗口。PID 17328/3600、Python 20732/40204/33520 及 CDP 7700/8056、ComfyUI 18188 均无残留。该 helper 不作为原生关闭生命周期证明。用户应用和 8188 未被停止，原有库未迁移/删除；保留隔离输出与剪贴板暂存，避免让当前剪贴板指向被测试清理掉的文件。

持续被第三方独占的剪贴板仍可能有界失败并反馈；本次没有替换系统剪贴板机制、没有运行所有模型/LoRA 的 GPU 矩阵，也没有发布旧云端版本更新。
