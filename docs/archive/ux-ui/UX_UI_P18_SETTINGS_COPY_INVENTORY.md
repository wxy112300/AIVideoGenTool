# P18 Settings copy and feedback inventory

> 2026-08-21 · Source of truth: current `src/renderer/` and `src/styles/`; historical prototypes are not part of this inventory.

## Localized renderer copy

The following Settings copy families are now resolved through the existing Settings copy catalog in `src/renderer/pages/settings/copy.ts`:

- model evidence descriptions for prompt, image, video, and runtime states;
- model-specific hardware recommendations and category fallbacks;
- optional component and installation-information accessible names;
- locale-aware list and label separators used by GPU, path, and node summaries.

The environment service live state remains semantic in `settings/selectors.ts` (`running` / `unavailable`) and is translated only at render time. The scan snapshot is not rewritten.

## Local feedback regions

| Surface | Feedback semantics | Preserved action/data boundary |
| --- | --- | --- |
| Environment scan | local `status` / `aria-busy`; scan failures use `alert` | `EnvironmentRefreshCoordinator` and scan payload unchanged |
| Service start/restart | local `status` and button `aria-busy` | `data-start-service` / `data-restart-service` selectors unchanged |
| Connection test | `#connection-result` local `status` live region | `data-test` and `testConnection` flow unchanged |
| Environment repair / ComfyUI update | button `aria-busy`; existing logs remain local details | repair/update controllers and logs unchanged |
| Node, workflow, Python, and acceleration install | local status/busy affordances | `CustomNodeInstallQueue`, dependency controllers, IPC and queue guards unchanged |
| App log read failure | `alert` | log open/read actions unchanged |

The force-stop control is isolated in a danger zone and uses secondary destructive styling. Its `#force-stop-comfy` selector and lifecycle behavior are unchanged.

## Static check

The renderer Settings source has no remaining hard-coded Simplified Chinese strings outside the locale-backed `copy.ts` catalog (`rg -n "[一-龥]" src/renderer/pages/settings --glob '!copy.ts'`). Runtime-provided error/detail strings remain data, not UI copy, and are escaped at render time.
