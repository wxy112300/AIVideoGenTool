import { queueTaskInput } from "./card";
export function revealQueueInputVideo(video) {
    try {
        video.currentTime = 0;
    }
    catch {
        // Some containers expose the first frame only after metadata settles.
    }
    video.closest("[data-queue-input-preview], .live-preview")
        ?.querySelector("[data-queue-input-empty], [data-live-preview-empty]")
        ?.setAttribute("hidden", "");
}
export async function loadQueueInputPreviews(context) {
    const state = context.getState();
    if (!state)
        return;
    const root = context.root;
    const tasks = state.queue.filter((task) => queueTaskInput(task) !== null);
    await Promise.all(tasks.map(async (task) => {
        const input = queueTaskInput(task);
        if (!input)
            return;
        if (input.kind === "placeholder")
            return;
        if (input.kind === "video") {
            root.querySelectorAll(`[data-queue-input-video="${task.id}"]`).forEach((video) => {
                if (video.readyState >= 2)
                    revealQueueInputVideo(video);
                else
                    video.addEventListener("loadeddata", () => revealQueueInputVideo(video), { once: true });
            });
            return;
        }
        const image = root.querySelector(`[data-queue-input-image="${task.id}"]`);
        if (!image)
            return;
        // A running H3 card reuses the same image element for its input and live
        // preview. Never let this asynchronous input read overwrite a preview
        // that arrived after the card was rendered.
        if (image.dataset.livePreviewActive === "true")
            return;
        try {
            const dataUrl = await context.assets.readImage(input.path);
            if (!dataUrl)
                return;
            if (image.dataset.livePreviewActive === "true")
                return;
            image.src = dataUrl;
            image.style.display = "";
            image.closest("[data-queue-input-preview]")
                ?.querySelector("[data-queue-input-empty]")
                ?.setAttribute("hidden", "");
        }
        catch {
            // The task can remain visible even when its source image was moved.
        }
    }));
}
