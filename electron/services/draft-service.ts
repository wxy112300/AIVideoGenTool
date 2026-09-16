import type {
  CreationDraftSnapshots,
  Draft,
  ImageEditDraft
} from "../../src/types.js";
import { activateCreationDraft } from "../../src/core/creation-drafts.js";
import { normalizeImageEditDraft } from "../../src/core/image-project.js";
import type { StateRepository } from "../ports/state-repository.js";

export interface DraftServiceDependencies {
  store: StateRepository;
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
  ): Promise<void> {
    await this.updateWithoutSnapshot((state) => {
      activateCreationDraft(state, draft);
      if (snapshots?.imageToVideoDraft?.inputMode === "image") {
        state.imageToVideoDraft = structuredClone(snapshots.imageToVideoDraft);
      }
      if (snapshots?.videoExtensionDraft?.inputMode === "video") {
        state.videoExtensionDraft = structuredClone(snapshots.videoExtensionDraft);
      }
    });
  }

  async saveImageDraft(draft: ImageEditDraft): Promise<void> {
    const normalized = normalizeImageEditDraft(draft);
    await this.updateWithoutSnapshot((state) => {
      state.imageDraft = normalized;
    });
  }

  private async updateWithoutSnapshot(
    mutator: Parameters<StateRepository["update"]>[0]
  ): Promise<void> {
    if (this.deps.store.updateWithoutSnapshot) {
      await this.deps.store.updateWithoutSnapshot(mutator);
      return;
    }
    await this.deps.store.update(mutator);
  }
}
