import type { RendererCleanup } from "../../contracts";
import {
  mountHistoryPageController,
  type HistoryPageControllerOptions
} from "./page-controller";

export function mountHistoryAssembly(
  options: HistoryPageControllerOptions
): RendererCleanup {
  return mountHistoryPageController(options);
}
