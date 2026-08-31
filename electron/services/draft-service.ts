import type {
  AppState,
  CreationDraftSnapshots,
  Draft,
  ImageEditDraft
} from "../../src/types.js";
import { activateCreationDraft } from "../../src/core/creation-drafts.js";
import { normalizeImageEditDraft } from "../../src/core/image-project.js";
import type { StateRepository } from "../ports/state-repository.js";

export interface DraftServiceDependencies {
  store: StateRepository;
  sendState(state: AppState): void;
}

/**
 * Owns persisted creation drafts while keeping the active projection and the
 * mode-specific snapshots in sync.  The service deliberately knows nothing
 * about Electron transport or renderer timers.
 */
export class DraftService {
  constructor(private readonly deps: DraftServiceDependencies) {}

  async saveDraft(
    draft: Draft,
    snapshots?: CreationDraftSnapshots
  ): Promise<AppState> {
    const next = await this.deps.store.update((state) => {
      activateCreationDraft(state, draft);
      if (snapshots?.imageToVideoDraft?.inputMode === "image") {
        state.imageToVideoDraft = structuredClone(snapshots.imageToVideoDraft);
      }
      if (snapshots?.videoExtensionDraft?.inputMode === "video") {
        state.videoExtensionDraft = structuredClone(snapshots.videoExtensionDraft);
      }
    });
    this.deps.sendState(next);
    return next;
  }

  async saveImageDraft(draft: ImageEditDraft): Promise<AppState> {
    const normalized = normalizeImageEditDraft(draft);
    const next = await this.deps.store.update((state) => {
      state.imageDraft = normalized;
    });
    this.deps.sendState(next);
    return next;
  }
}
