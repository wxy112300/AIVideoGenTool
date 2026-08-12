import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  mountSettingsControllers,
  type SettingsControllersOptions
} from "./controllers";

export function mountSettingsAssembly(
  context: RendererContext,
  options: SettingsControllersOptions
): RendererCleanup {
  return mountSettingsControllers(context, options);
}
