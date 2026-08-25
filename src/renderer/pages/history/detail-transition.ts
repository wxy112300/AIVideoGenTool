export interface HistoryDetailTransitionOptions {
  currentRoot: ParentNode;
  nextRoot: ParentNode;
  currentPlayer: HTMLElement;
  nextPlayer: HTMLElement;
}

/**
 * Replace every detail fragment that belongs to the selected video while
 * keeping the current media-controller/video element alive for fullscreen
 * navigation. Keeping the media element is what preserves the fullscreen
 * surface and avoids a visible player teardown.
 */
export function swapHistoryDetailFragments(
  options: HistoryDetailTransitionOptions
): boolean {
  const { currentRoot, nextRoot, currentPlayer, nextPlayer } = options;
  const currentVideo = currentPlayer.querySelector<HTMLVideoElement>("video");
  const nextVideo = nextPlayer.querySelector<HTMLVideoElement>("video");
  const currentInfo = currentPlayer.querySelector<HTMLElement>("[data-history-player-info]");
  const nextInfo = nextPlayer.querySelector<HTMLElement>("[data-history-player-info]");
  const currentActions = currentPlayer.querySelector<HTMLElement>("[data-history-player-actions]");
  const nextActions = nextPlayer.querySelector<HTMLElement>("[data-history-player-actions]");
  const currentUtility = currentPlayer.querySelector<HTMLElement>("[data-history-player-utility]");
  const nextUtility = nextPlayer.querySelector<HTMLElement>("[data-history-player-utility]");
  const currentBack = currentRoot.querySelector<HTMLElement>(".history-detail-back");
  const nextBack = nextRoot.querySelector<HTMLElement>(".history-detail-back");
  const currentSidebar = currentRoot.querySelector<HTMLElement>(".history-detail-sidebar");
  const nextSidebar = nextRoot.querySelector<HTMLElement>(".history-detail-sidebar");
  const currentRecord = currentRoot.querySelector<HTMLElement>(".history-record-section");
  const nextRecord = nextRoot.querySelector<HTMLElement>(".history-record-section");
  if (!currentVideo || !nextVideo || !currentInfo || !nextInfo ||
    !currentActions || !nextActions || !currentUtility || !nextUtility ||
    !currentBack || !nextBack || !currentSidebar || !nextSidebar ||
    !currentRecord || !nextRecord) {
    return false;
  }

  currentPlayer.setAttribute("style", nextPlayer.getAttribute("style") ?? "");
  currentPlayer.setAttribute("aria-label", nextPlayer.getAttribute("aria-label") ?? "");
  const volume = currentVideo.volume;
  const muted = currentVideo.muted;
  const playbackRate = currentVideo.playbackRate;
  currentVideo.pause();
  const nextSource = nextVideo.getAttribute("src");
  if (nextSource) currentVideo.setAttribute("src", nextSource);
  else currentVideo.removeAttribute("src");
  currentVideo.dataset.historyAsset = nextVideo.dataset.historyAsset ?? "";
  currentVideo.dataset.historyVersion = nextVideo.dataset.historyVersion ?? "";
  currentVideo.loop = nextVideo.loop;
  currentVideo.playsInline = nextVideo.playsInline;
  currentVideo.load();
  currentVideo.volume = volume;
  currentVideo.muted = muted;
  currentVideo.playbackRate = playbackRate;
  currentInfo.replaceWith(nextInfo);
  currentActions.replaceWith(nextActions);
  currentUtility.replaceWith(nextUtility);
  currentBack.replaceWith(nextBack);
  currentSidebar.replaceWith(nextSidebar);
  currentRecord.replaceWith(nextRecord);

  const currentTags = currentRoot.querySelector<HTMLElement>("[data-history-tags-root]");
  const nextTags = nextRoot.querySelector<HTMLElement>("[data-history-tags-root]");
  if (currentTags && nextTags) currentTags.replaceWith(nextTags);
  return true;
}
