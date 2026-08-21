# UI/UX 归档

本目录保存 Local Video Studio UI/UX 升级主线在 P20/G18 收口前后的历史计划、阶段 proposal、执行清单和旧基线。它们用于追溯设计决策与验收过程，不是当前 UI 的 source of truth。

当前应优先查看：

- [UX 契约](../../UX_CONTRACT.md)
- [当前 renderer 基线](../../UX_UI_RENDERER_BASELINE.md)
- [P20/G18 QA 报告](../../UX_UI_P20_QA_REPORT.md)
- [P20/G18 截图 manifest](../../UX_UI_P20_SCREENSHOT_MANIFEST.json)
- 当前实现：`src/renderer/`、`src/styles/` 及其测试/fixture

## 归档内容

| 文件 | 归档原因 |
| --- | --- |
| `APPLE_HIG_UX_IMPROVEMENT_PLAN.md` | 早期高层研究计划，已由增量实施计划取代 |
| `UX_UI_INCREMENTAL_IMPLEMENTATION_PLAN.md` | P00–P20 已完成，UI/UX 主线已在 v0.41.3 收口 |
| `UX_UI_LUNA_EXECUTION_GUIDE.md` | P00–P20 的原子 package 派发与验收台账已完成 |
| `UX_UI_P01_*`、`UX_UI_P07_*`、`UX_UI_P09_*`、`UX_UI_P11_*`、`UX_UI_P15_*`、`UX_UI_P16_*` | 已完成阶段的 proposal/视觉方向记录 |
| `UX_UI_P18_SETTINGS_COPY_INVENTORY.md` | 已完成的 Settings 文案与反馈 inventory |
| `UX_UI_P19_CSS_OWNER_MAP.md` | 已完成的 CSS ownership 与清理记录 |
| `UX_UI_BASELINE_MANIFEST.md`、`UX_UI_CSS_METRICS_BASELINE.md`、`ux-ui-baseline.manifest.json` | P00 旧 prototype 基线，已明确标记为 historical/superseded |

P20 QA 报告和截图 manifest deliberately 保留在 `docs/` 顶层，因为它们是当前 UI/UX 收尾的有效验收证据；当前 renderer 基线也同样不归档。
