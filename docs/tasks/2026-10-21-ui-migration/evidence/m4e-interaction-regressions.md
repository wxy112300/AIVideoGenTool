# M4e：控件刷新、浮层与续写回归

2026-10-22，patch，当前 agent 直接完成。处理用户本轮指出的已迁移区域回归；图片处理的 LoRA/分辨率/整体样式继续留给后续 M4 页面包。

## 原因与修正

| 问题 | 原因 | 修正 |
| --- | --- | --- |
| 自定义最大值不同步 | 自定义区只读静态单次生成范围，未合并当前可用输出档位 | 单次几何仍使用 catalog 范围；控件最大值同时跟随可用档位。1080p 是离散端点，保持专用两阶段流程；LoRA/JointAV 导致该档不可用时即时回落，不能开放无对应路线的中间几何 |
| 参数操作后闪烁/跳滚动 | 多个 controller 显式重建整页，保存状态广播又重复刷新；清理富文本/长视频演示会在记录滚动前改变高度 | 时长、Seed、比例、分辨率及 LoRA 改为局部更新；列表事件委派，排序容器与菜单保持挂载；保存回执不重建 Create，真实外部草稿变更仍刷新；结构性操作在清理前记录 viewport，恢复媒体栏滚动 |
| 引用只有文字 tooltip | 富文本只设置路径说明，未提供预览数据 | 图片缩略图/视频源传给现有唯一 tooltip；body portal、延迟/翻转/关闭沿用公共实现，不在编辑器内另建浮层 |
| Extend 显示 15.1 秒原生模式 | Create 的 native/unlocked 展示规则套到了所有 H3 | Extend 使用真实 extensionSafety 的预算，区分 Continuum/Motion Context；managed sequence 的 chunkSeconds 同步 min/max 并锁定，不提供假的多段预览提交入口 |
| Motion Context 左栏和裁剪不符 | 遗留的播放器/裁剪/大文件上传区未迁移；公共 range 材质覆盖双手柄轨道 | 44px 裁剪轨道、四列统计、紧凑可选 latent 文件行、12px 子面板、多参考添加区；隐藏重复的锁定源视频卡但保留 Slot 数据；显式透明轨道，双输入共享 pointer capture，拖动跨手柄仍持续并定位实际帧 |

视觉与行为依据：`prototypes/create.html`、`prototypes/app/create.{css,js}`、DESIGN 6.5 与创建页章节。真实参数、文件检测、缺失恢复和入队门槛继续来自当前 core/controller。

## 检查

完整 `npm.cmd run verify`：245 文件 / **2431 单元测试**、6 文件 / **91 集成测试**、类型检查、生产构建及 **740 对比度检查**通过。本机日志 `temp/ui-m4e/verify.log`。既有 History jsdom `window.scrollTo` 提示不构成失败。

新增/更新回归包括：原 DOM 不变的连续时长/Seed/分辨率/LoRA 操作；JointAV 与 LoRA 改变自定义上限；540p 预设不能被自定义对齐改成 544p；Continuum/Motion Context 预算与冻结段长；唯一 body 缩略图；保存回执与真正外部草稿变化的区别；双手柄跨区域拖动与预览定位。

隔离生产 Electron，focus emulation，设备缩放 1，高 1000px；真实 CDP 鼠标/键盘脚本及报告 `temp/ui-m4e/check.mjs/report.json`、`final.mjs/final-report.json`：

- 14 项操作等待保存后，提示词/时长节点不变、shell 替换计数为 0：拖时长，随机/清空 Seed，自定义模式/1080p，latent 选项，分辨率预设，比例，两次 LoRA 添加、权重、顺序、删除，以及 Motion Context 裁剪。
- 自定义最大值随 JointAV 在 1080/768 间切换；真实添加 LoRA、权重与键盘排序可用，菜单连续插入和已选状态保持。
- 素材 hover 出现唯一 body 浮层，图像 naturalWidth 为实际素材 1280；截图 `material-tooltip.png`。
- 实际点击加入队列得到任务 `52aa1f59-9f17-43cf-bd80-630a3c76c354`，冻结分辨率 640 与纯文本标签，后续草稿操作不启动任务。清空/撤销恢复完整视频草稿；viewport 185 → 185。
- 续写实际显示 Motion Context/Continuum，各自当前完整预算为 30 秒，Continuum 最小 4 秒；managed 冻结段长通过状态夹具单元检查，未伪造真实 Run 成功。
- 最终实际裁剪 8.0 → 5.6 秒，视频 currentTime 5.6，视频/富文本/时长节点均保留，锁定源卡隐藏，轨道背景透明。1440/1120/900/820 四宽度无横向溢出，裁剪轨道均 44px；截图 `motion-final-<width>.png`。

第一轮测试未等待启动扫描完成，把扫描结束的真实刷新计入了裁剪操作；等待扫描后分开检查。随后增加“裁剪值实际变化”的断言，暴露双 native range 拖动不连续，已通过共享 pointer capture 修复并在生产构建复测。没有以节点保留或静态样式成功代替实际裁剪结果。

## 范围与资源

模型切换、导入/移除素材、清空等结构改变仍可重建页面；不承诺所有操作零 DOM 变化，验收目标是参数操作不中断输入/播放/拖动，结构变化不产生额外视口跳动。启动/人工扫描产生能力变化时仍刷新，不能把这些更新当作草稿保存回执吞掉。

未启动队列、ComfyUI 或 GPU 生成；测试视频由 CPU FFmpeg 产生，仅作裁剪素材。没有验证所有 Windows 输入法或真实 managed Run 执行；沿用既有兼容门槛。两轮自有隔离窗口用 `close-fixture-smoke.mjs` 清理，复核 PID/CDP/18188；不操作用户 8188 服务及其他 GPU 任务。没有打包、发布、提交或改动原型。
