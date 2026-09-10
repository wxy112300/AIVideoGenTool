/**
 * Pinned metadata for Konohamaru04's DLSS 5 Visual Enhancer node pack.
 *
 * The repository keeps native runtime files in Git LFS.  Keep the manifest
 * here deliberately explicit so a checkout containing LFS pointer files is
 * never treated as an executable installation.
 */
export const KONOHAMARU_NODE_ID = "comfyui-dlss-frame-interpolation" as const;
export const KONOHAMARU_NODE_REPOSITORY =
  "https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation.git" as const;
export const KONOHAMARU_NODE_DIRECTORY = "ComfyUI-DLSS-Frame-Interpolation" as const;
export const KONOHAMARU_NODE_REVISION =
  "c755e274a405a7a47667bd567d489b6845066bcf" as const;

/**
 * The direct RenoDX feature-18 contract is kept only so persisted queue/history
 * snapshots can still be decoded. New video installs use the official
 * video2dlssnr temporal route; the neural-upstream add-on remains for the
 * existing image path and its compatibility diagnostics.
 */
export const KONOHAMARU_LEGACY_RUNTIME_BUNDLE_ID =
  `konohamaru-dlss5-${KONOHAMARU_NODE_REVISION.slice(0, 12)}` as const;
export const KONOHAMARU_NEURAL_UPSTREAM_RELEASE = "v0.3.0" as const;
export const KONOHAMARU_NEURAL_UPSTREAM_SOURCE_URL =
  "https://github.com/matiasLombo/neural-upstream" as const;
export const KONOHAMARU_NEURAL_UPSTREAM_DOWNLOAD_URL =
  `https://github.com/matiasLombo/neural-upstream/releases/download/${KONOHAMARU_NEURAL_UPSTREAM_RELEASE}/nvngx.dll.addon64` as const;
export const KONOHAMARU_NEURAL_UPSTREAM_ADDON = "nvngx.dll.addon64" as const;
export const KONOHAMARU_NEURAL_UPSTREAM_SHA256 =
  "43c00412eb07339fbbeecea62c5d0c96595f7a7b5e41c4cc4a948618c2a100ec" as const;
export const KONOHAMARU_NEURAL_UPSTREAM_RUNTIME_BUNDLE_ID =
  `konohamaru-neural-upstream-${KONOHAMARU_NEURAL_UPSTREAM_RELEASE}` as const;
export const KONOHAMARU_VIDEO2DLSSNR_RELEASE = "v1.3" as const;
export const KONOHAMARU_VIDEO2DLSSNR_ARCHIVE =
  "video2dlssnr-comfyui.zip" as const;
export const KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_BYTES = 247402704 as const;
export const KONOHAMARU_VIDEO2DLSSNR_ARCHIVE_SHA256 =
  "3e872cb09471451c3e8bac8182d6599eb73745eb0ac7eb98ae059855ff103419" as const;
export const KONOHAMARU_VIDEO2DLSSNR_DOWNLOAD_URL =
  `https://github.com/DaniilSokolyuk/video2dlssnr/releases/download/${KONOHAMARU_VIDEO2DLSSNR_RELEASE}/${KONOHAMARU_VIDEO2DLSSNR_ARCHIVE}` as const;
export const KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID =
  `konohamaru-video2dlssnr-${KONOHAMARU_VIDEO2DLSSNR_RELEASE}` as const;
export const KONOHAMARU_VIDEO2DLSSNR_RUNTIME_FILES = [
  "bin/runtime/video2dlssnr/video2dlssnr.exe",
  "bin/runtime/video2dlssnr/nvngx.dll_dlssnr.dll",
  "bin/runtime/video2dlssnr/nvngx_dlss.dll",
  "bin/runtime/video2dlssnr/nvngx_dlssnr.dll"
] as const;
export const KONOHAMARU_VIDEO2DLSSNR_RUNTIME_ARTIFACTS = [
  { archiveMember: "video2dlssnr/bin/video2dlssnr.exe", filename: "video2dlssnr.exe", bytes: 441856 },
  { archiveMember: "video2dlssnr/bin/nvngx.dll_dlssnr.dll", filename: "nvngx.dll_dlssnr.dll", bytes: 12800 },
  { archiveMember: "video2dlssnr/bin/nvngx_dlss.dll", filename: "nvngx_dlss.dll", bytes: 58956400 },
  { archiveMember: "video2dlssnr/bin/nvngx_dlssnr.dll", filename: "nvngx_dlssnr.dll", bytes: 165840496 }
] as const;
export const KONOHAMARU_RUNTIME_BUNDLE_ID =
  KONOHAMARU_VIDEO2DLSSNR_RUNTIME_BUNDLE_ID;

export const KONOHAMARU_NODE_REQUIRED_NODE_TYPES = [
  "NvidiaDLSSVideoUpscale",
  "NvidiaDLSSFrameInterpolation",
  "NvidiaDLSSImageUpscale"
] as const;

/** Files required by the Windows/native runtime at execution time. */
export const KONOHAMARU_RUNTIME_FILES = [
  "bin/runtime/host/dxgi.dll",
  "bin/runtime/host/nvngx.dll",
  "bin/runtime/host/nvngx_dlssnr.dll",
  `bin/runtime/host/${KONOHAMARU_NEURAL_UPSTREAM_ADDON}`,
  "bin/runtime/dlss/nvngx_dlss.dll",
  "bin/runtime/dlssg/dlssg-worker.exe",
  "bin/runtime/dlssg/nvngx_dlssg.dll"
] as const;

/** Runtime files used by already queued legacy RenoDX tasks. */
export const KONOHAMARU_LEGACY_RUNTIME_FILES = [
  "bin/runtime/host/dxgi.dll",
  "bin/runtime/host/nvngx.dll",
  "bin/runtime/host/nvngx_dlssnr.dll",
  "bin/runtime/host/renodx-dlss5.addon64",
  "bin/runtime/dlss/nvngx_dlss.dll",
  "bin/runtime/dlssg/dlssg-worker.exe",
  "bin/runtime/dlssg/nvngx_dlssg.dll"
] as const;

/** ReShade.ini is generated/healed by the upstream worker and is not a gate. */
export const KONOHAMARU_RUNTIME_OPTIONAL_FILES = [
  "bin/runtime/host/ReShade.ini",
  "bin/runtime/host/ReShade.log"
] as const;

export const KONOHAMARU_RUNTIME_SOURCE_URL =
  `https://github.com/Konohamaru04/ComfyUI-NVIDIA-DLSS-Frame-Interpolation/tree/${KONOHAMARU_NODE_REVISION}` as const;
