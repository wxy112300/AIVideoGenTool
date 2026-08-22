import { mountCreatePageController } from "./page-controller";
import { mountCreateClipboardController } from "./clipboard-controller";
export function mountCreateAssembly(context, options) {
    const cleanups = [
        mountCreateClipboardController(context, options.clipboard),
        mountCreatePageController(options)
    ];
    return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
