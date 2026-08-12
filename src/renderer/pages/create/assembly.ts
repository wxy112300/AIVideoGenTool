import type { RendererCleanup, RendererContext } from "../../contracts";
import type { CreatePageControllerOptions } from "./page-controller";
import { mountCreatePageController } from "./page-controller";
import { mountCreateClipboardController, type CreateClipboardControllerOptions } from "./clipboard-controller";

export interface CreateAssemblyOptions extends CreatePageControllerOptions {
  clipboard: CreateClipboardControllerOptions;
}

export function mountCreateAssembly(
  context: RendererContext,
  options: CreateAssemblyOptions
): RendererCleanup {
  const cleanups = [
    mountCreateClipboardController(context, options.clipboard),
    mountCreatePageController(options)
  ];
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
