import type { RendererCleanup, RendererContext } from "../../contracts";
import type { CreatePageControllerOptions } from "./page-controller";
import { mountCreatePageController } from "./page-controller";
import { mountCreateClipboardController, type CreateClipboardControllerOptions } from "./clipboard-controller";
import { mountCreateRichPrompts } from "./rich-prompt";
import { mountVideoLoading } from "../../shared/video-loading";
import { uiKeys } from "../../../core/i18n-keys";

export interface CreateAssemblyOptions extends CreatePageControllerOptions {
  clipboard: CreateClipboardControllerOptions;
}

export function mountCreateAssembly(
  context: RendererContext,
  options: CreateAssemblyOptions
): RendererCleanup {
  const cleanups = [
    mountCreateClipboardController(context, options.clipboard),
    mountCreatePageController(options),
    mountCreateRichPrompts(context),
    mountVideoLoading(context.root, context.t(uiKeys.create.videoMedia.loadingVideo), {
      label: context.t(uiKeys.history.page.videoUnavailable), retry: context.t(uiKeys.create.editor.retry)
    })
  ];
  return () => cleanups.reverse().forEach((cleanup) => cleanup());
}
