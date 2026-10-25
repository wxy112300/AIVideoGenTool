import type { Page } from "../contracts";
import { animateUi, reducedMotion } from "../shared/ui/motion";

/** Let staged content layout finish without creating a document snapshot layer. */
export function yieldPresentationTurn(): Promise<void> {
  return new Promise(resolve => window.requestAnimationFrame(() => resolve()));
}

function isHistoryDetail(page: Page | undefined): boolean {
  return page === "history-detail" || page === "image-history-detail";
}

function contentElements(root: HTMLElement, page: Page | undefined): HTMLElement[] {
  const selector = isHistoryDetail(page)
    ? ".history-media-detail > :not(.history-detail-back)"
    : ".app-shell > main > :not(.page-heading, .create-page-heading, .history-heading, .history-context)";
  return [...root.querySelectorAll<HTMLElement>(selector)].filter(element => !element.hidden);
}

/** Navigation animates real content, never the shell or sticky page controls. */
export function createPagePresentation(root: HTMLElement, loadingLabel: () => string = () => "") {
  let page: Page | undefined;
  let revision = 0;
  let sectionKey = "";
  let reveals: Animation[] = [];
  let entrances: Animation[] = [];
  let departures: Animation[] = [];
  let departureTarget: Page | undefined;
  let loading: HTMLElement | undefined;
  let loadingFor: Page | undefined;
  return {
    async update(nextPage: Page, commit: () => Promise<void>): Promise<void> {
      const request = ++revision;
      const first = page === undefined;
      const changed = page !== nextPage;
      const enteringDetail = page === "history" && isHistoryDetail(nextPage);
      const returningToList = isHistoryDetail(page) && nextPage === "history";
      if (loadingFor !== nextPage) { loading?.remove(); loading = undefined; loadingFor = undefined; }
      if (departureTarget !== nextPage) {
        departures.forEach(animation => animation.cancel());
        departures = [];
        departureTarget = undefined;
      }
      if (changed) {
        entrances.forEach(animation => animation.cancel());
        entrances = [];
      }
      const update = async () => {
        if (request !== revision) return;
        await commit();
        if (request === revision && changed && nextPage !== "history" && window.scrollY) {
          window.scrollTo({ top: 0, behavior: "auto" });
        }
        if (request === revision) page = nextPage;
      };
      if (first) root.dataset.presenting = "true";
      let outgoing: Animation[] = [];
      try {
        if ((enteringDetail || returningToList) && !reducedMotion() && !document.fullscreenElement) {
          outgoing = departures.length ? departures : contentElements(root, page).flatMap(element => {
            const animation = animateUi(element, [
              { opacity: 1, transform: "translateX(0)" },
              { opacity: 0, transform: `translateX(${enteringDetail ? -10 : 18}px)` }
            ], 90);
            animation?.effect?.updateTiming({ fill: "forwards", easing: "cubic-bezier(.4,0,1,1)" });
            return animation ? [animation] : [];
          });
          departures = outgoing;
          departureTarget = nextPage;
          await Promise.all(outgoing.map(animation => animation.finished.catch(() => undefined)));
          if (request !== revision) return;
        }
        if (changed) root.dataset.pagePresenting = "true";
        if (changed && !loading) {
          loading = document.createElement("div");
          loading.className = "history-navigation-loading";
          loading.setAttribute("role", "status");
          const spinner = document.createElement("span");
          spinner.className = "history-loading-spinner";
          spinner.setAttribute("aria-hidden", "true");
          const label = document.createElement("span");
          label.textContent = loadingLabel();
          loading.append(spinner, label);
          document.body.append(loading);
          loadingFor = nextPage;
          // Paint feedback before first-time custom element construction can
          // block. Its delayed fade avoids flashing a spinner on warm paths.
          if (isHistoryDetail(nextPage)) await yieldPresentationTurn();
          if (request !== revision) return;
        }
        await update();
        // The old list can live in a preserved fragment. Never retain a faded
        // animation on it, or the next return would restore an invisible list.
        if (request === revision) outgoing.forEach(animation => animation.cancel());
        if (changed && nextPage === "history" && request === revision) {
          // Anchor and content-visibility corrections must settle while only
          // the list is hidden. The shell and page controls stay visible.
          await yieldPresentationTurn();
          await yieldPresentationTurn();
        }
      } finally {
        if (request === revision) {
          loading?.remove(); loading = undefined; loadingFor = undefined;
          outgoing.forEach(animation => animation.cancel());
          if (departures === outgoing) { departures = []; departureTarget = undefined; }
        }
        if (first && request === revision) delete root.dataset.presenting;
        if (request === revision) delete root.dataset.pagePresenting;
      }
      if (request !== revision) return;
      if (changed) {
        const offset = enteringDetail ? 24 : returningToList ? -14 : 0;
        const duration = enteringDetail ? 220 : returningToList ? 180 : 160;
        entrances = contentElements(root, nextPage).flatMap(element => {
          const frames: Keyframe[] = offset ? [
            { opacity: 0, transform: `translateX(${offset}px)` },
            { opacity: 1, transform: "translateX(0)" }
          ] : [{ opacity: 0 }, { opacity: 1 }];
          const animation = animateUi(element, frames, duration);
          return animation ? [animation] : [];
        });
      }
      const section = nextPage === "create"
        ? root.querySelector<HTMLElement>('[data-input-mode][aria-pressed="true"]')?.id
        : nextPage === "settings" ? root.querySelector<HTMLElement>(".settings-content")?.id : undefined;
      const nextSectionKey = `${nextPage}:${section ?? ""}`;
      if (!first && !changed && sectionKey !== nextSectionKey) {
        reveals.forEach(animation => animation.cancel());
        const panels = root.querySelectorAll<HTMLElement>(nextPage === "settings" ? ".settings-content > *" : ".create-workspace > .media-panel, .create-prompt-card, .composer-output-group, .image-edit-output-group, .composer-motion-group, .create-lora-card, .composer-seed-group");
        reveals = [...panels].filter(panel => !panel.hidden).slice(0, 6).flatMap((panel, index) => {
          const animation = animateUi(panel, [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], 240, index * 30);
          return animation ? [animation] : [];
        });
      } else if (changed) { reveals.forEach(animation => animation.cancel()); reveals = []; }
      sectionKey = nextSectionKey;
    }
  };
}

export function mountShellGeometry(): () => void {
  const header = document.querySelector<HTMLElement>(".topbar");
  if (!header) return () => undefined;
  const historyHeading = document.querySelector<HTMLElement>(".history-heading");
  const measure = () => {
    const height = header.getBoundingClientRect().height;
    if (!height) return;
    for (const name of ["--topbar-h", "--page-sticky-offset"]) {
      document.documentElement.style.setProperty(name, `${height}px`);
    }
    if (historyHeading) {
      document.documentElement.style.setProperty("--history-heading-height", `${historyHeading.getBoundingClientRect().height}px`);
    }
  };
  measure();
  if (typeof ResizeObserver === "undefined") return () => undefined;
  const observer = new ResizeObserver(measure);
  observer.observe(header);
  if (historyHeading) observer.observe(historyHeading);
  return () => observer.disconnect();
}
