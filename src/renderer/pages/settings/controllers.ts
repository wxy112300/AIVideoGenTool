import type { RendererCleanup, RendererContext } from "../../contracts";
import {
  mountSettingsFieldsController,
  type SettingsFieldsControllerOptions
} from "./fields-controller";
import {
  mountSettingsEnvironmentController,
  type SettingsEnvironmentControllerOptions
} from "./environment-controller";
import {
  mountSettingsLogsController,
  type SettingsLogsControllerOptions
} from "./logs-controller";
import {
  mountSettingsNodeDependencyController,
  type SettingsNodeDependencyControllerOptions
} from "./node-dependency-controller";
import {
  mountSettingsPageController,
  type SettingsPageControllerOptions
} from "./page-controller";
import {
  mountSettingsServiceController,
  type SettingsServiceControllerOptions
} from "./service-controller";

export interface SettingsControllersOptions {
  fields: SettingsFieldsControllerOptions;
  environment: SettingsEnvironmentControllerOptions &
    SettingsNodeDependencyControllerOptions &
    SettingsServiceControllerOptions;
  logs: SettingsLogsControllerOptions;
  page: SettingsPageControllerOptions;
}

export function mountSettingsControllers(
  context: RendererContext,
  options: SettingsControllersOptions
): RendererCleanup {
  const cleanups = [
    mountSettingsFieldsController(context, options.fields),
    mountSettingsServiceController(context, options.environment),
    mountSettingsEnvironmentController(context, options.environment),
    mountSettingsNodeDependencyController(context, options.environment),
    mountSettingsLogsController(context, options.logs),
    mountSettingsPageController(options.page)
  ];
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
