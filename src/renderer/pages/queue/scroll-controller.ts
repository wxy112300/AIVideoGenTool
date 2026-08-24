import type { Page } from "../../contracts";

export function clampQueueScrollPosition(
  scrollY: number,
  documentHeight: number,
  viewportHeight: number
): number {
  const position = Number.isFinite(scrollY) ? Math.max(0, scrollY) : 0;
  const height = Number.isFinite(documentHeight) ? Math.max(0, documentHeight) : 0;
  const viewport = Number.isFinite(viewportHeight) ? Math.max(0, viewportHeight) : 0;
  return Math.min(position, Math.max(0, height - viewport));
}

export interface QueueScrollController {
  beforeRender(): void;
  restoreScrollPosition(): void;
}

export function createQueueScrollController(
  getPage: () => Page
): QueueScrollController {
  let scrollPosition = 0;
  let restorePending = false;
  let restoreFrame: number | null = null;

  const cancelPendingRestore = () => {
    if (restoreFrame !== null) {
      window.cancelAnimationFrame(restoreFrame);
      restoreFrame = null;
    }
  };

  const currentDocumentHeight = (): number => Math.max(
    document.documentElement?.scrollHeight ?? 0,
    document.body?.scrollHeight ?? 0
  );

  return {
    beforeRender: () => {
      if (getPage() !== "queue") {
        cancelPendingRestore();
        restorePending = false;
        scrollPosition = 0;
        return;
      }
      // A queue update can cause two renders before the first restoration frame
      // runs. Keep the original position instead of capturing the temporary
      // top-of-page position from the first DOM replacement.
      if (!restorePending) scrollPosition = window.scrollY;
    },
    restoreScrollPosition: () => {
      cancelPendingRestore();
      const desiredPosition = scrollPosition;
      restorePending = true;
      const apply = () => {
        if (getPage() !== "queue") return;
        const position = clampQueueScrollPosition(
          desiredPosition,
          currentDocumentHeight(),
          window.innerHeight
        );
        window.scrollTo({ top: position, behavior: "auto" });
      };
      restoreFrame = window.requestAnimationFrame(() => {
        restoreFrame = null;
        if (getPage() !== "queue") {
          restorePending = false;
          return;
        }
        apply();
        // Input previews and media placeholders can settle one frame after the
        // task cards are mounted. Re-apply once so a late height change cannot
        // leave the user at the top or beyond the new document range.
        restoreFrame = window.requestAnimationFrame(() => {
          restoreFrame = null;
          if (getPage() === "queue") apply();
          restorePending = false;
        });
      });
    }
  };
}
