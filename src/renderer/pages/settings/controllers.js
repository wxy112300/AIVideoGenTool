import { mountSettingsFieldsController } from "./fields-controller";
import { mountSettingsEnvironmentController } from "./environment-controller";
import { mountSettingsLogsController } from "./logs-controller";
import { mountSettingsNodeDependencyController } from "./node-dependency-controller";
import { mountSettingsPageController } from "./page-controller";
import { mountSettingsServiceController } from "./service-controller";
export function mountSettingsControllers(context, options) {
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
