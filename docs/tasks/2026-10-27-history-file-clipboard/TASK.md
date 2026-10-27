# 历史文件剪贴板复制回归

类型：bug fix · 日期：2026-10-27 · 影响：patch

## Resume

代码修正、全量检查与真实详情按钮验证完成；Explorer 右键粘贴端到端仍未验，不能声称已完全复现或排除用户报告的偶发失败。

- Windows PowerShell 5.1 的 `Set-Clipboard -LiteralPath` 实测仅提供 FileDrop/FileNameW/FileName，缺少 `Preferred DropEffect`。改为显式 DWORD COPY=1 的 WinForms DataObject，并使用 `SetDataObject(data, true)` 持久化；成功前读回文件列表与复制标志。
- 旧实现每次复制都删除其他暂存目录，可能使正在消费上一份剪贴板的目标失去源文件。改为保留近期目录，仅在后续复制时清理超过 24 小时的旧目录；当前目录始终保留。继续串行写入和隔离暂存，原始媒体不移动。
- 不改 renderer、IPC、持久化记录和用户媒体；保留其他任务的未提交工作。

## 验证

- focused：`tests/windows-clipboard-transactions.test.ts` + `electron/services/windows-clipboard.test.ts`，5 passed，覆盖串行、近期路径保留、过期清理、失败后恢复、原文件保护。
- 等价 verify：2696 unit + 91 integration passed；typecheck、桌面/Web build、Electron tsc、440 contrast 全通过。为保留用户运行窗口的旧资源，Vite 使用 `--emptyOutDir false`，未执行 clean。
- 隔离应用真实鼠标点击详情复制按钮 5 次；等待 `aria-busy` 结束后，另一 PowerShell 进程读取格式，均为 COPY `01-00-00-00`；路径内容 SHA-256 与原始 MP4 相同，前四份暂存和原文件在后续复制后仍有效。证据：本地 `temp/history-file-clipboard/report.json`、`verify.log`。
- 原生 computer-use 的 Node kernel 两次因 sandbox helper setup 失败退出，备用 CUA 同样无法初始化；未执行 Explorer 右键粘贴。额外 Shell IDropTarget 消费诊断停在 Drop，已停止本次探针；这不算粘贴成功证据。
- 隔离应用已通过 cleanup harness 关闭，CDP/Comfy 测试端口释放；无运行队列、未启动 ComfyUI，用户应用保持运行。剪贴板暂存保留供粘贴，未清空可能已被用户更改的剪贴板。

## 依据和后续

[Microsoft Shell Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/shell/clipboard) 规定 Preferred DropEffect 的复制/移动语义；[Clipboard.SetDataObject](https://learn.microsoft.com/en-us/dotnet/api/system.windows.forms.clipboard.setdataobject) 说明 copy=true 的进程退出持久性。缺少标志是已确认的问题，但不能据此断言它单独解释全部偶发失败。

下一次可用原生桌面工具时，验证详情复制 → Explorer 右键粘贴 → 文件哈希，以及同卷/跨卷、重复粘贴和复制后立即再复制。上次仅 CF_HDROP 读回的验证见 [旧任务](../2026-10-25-runtime-isolation-clipboard/TASK.md)。
