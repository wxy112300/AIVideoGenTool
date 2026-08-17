import type { RendererContext } from "../../contracts";
import { queueTaskInput } from "./card";

export async function loadQueueInputPreviews(context: RendererContext): Promise<void> {
  const state = context.getState();
  if (!state) return;
  const root = context.root;
  const tasks = state.queue.filter((task) => queueTaskInput(task) !== null);
  await Promise.all(tasks.map(async (task) => {
    const input = queueTaskInput(task);
    if (!input) return;
    if (input.kind === "placeholder") return;
    if (input.kind === "video") {
      root.querySelectorAll<HTMLVideoElement>(
        `[data-queue-input-video="${task.id}"]`
      ).forEach((video) => {
        const revealVideo = () => {
          try {
            video.currentTime = 0;
          } catch {
            // Some containers expose the first frame only after metadata settles.
          }
          video.closest<HTMLElement>("[data-queue-input-preview], .live-preview")
            ?.querySelector<HTMLElement>("[data-queue-input-empty]")
            ?.setAttribute("hidden", "");
        };
        if (video.readyState >= 2) revealVideo();
        else video.addEventListener("loadeddata", revealVideo, { once: true });
      });
      return;
    }
    const image = root.querySelector<HTMLImageElement>(
      `[data-queue-input-image="${task.id}"]`
    );
    if (!image) return;
    // A running H3 card reuses the same image element for its input and live
    // preview. Never let this asynchronous input read overwrite a preview
    // that arrived after the card was rendered.
    if (image.dataset.livePreviewActive === "true") return;
    try {
      const dataUrl = await context.studio.readImage(input.path);
      if (!dataUrl) return;
      if (image.dataset.livePreviewActive === "true") return;
      image.src = dataUrl;
      image.style.display = "";
      image.closest<HTMLElement>("[data-queue-input-preview]")
        ?.querySelector<HTMLElement>("[data-queue-input-empty]")
        ?.setAttribute("hidden", "");
    } catch {
      // The task can remain visible even when its source image was moved.
    }
  }));
}
