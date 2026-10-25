/** Gallery covers do not need a media element. Create one only for interaction. */
export function historyCardVideo(media: HTMLElement, create = false): HTMLVideoElement | null {
  const existing = media.querySelector<HTMLVideoElement>("video");
  if (existing || !create || !media.dataset.historySrc) return existing;
  const video = document.createElement("video");
  video.dataset.historySrc = media.dataset.historySrc;
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "none";
  media.prepend(video);
  return video;
}
