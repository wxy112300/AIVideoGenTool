/**
 * Immutable acquisition facts for the AetherScale carrier path.
 *
 * The carrier is intentionally kept as a separate bundle from HECer's
 * VapourKit runtime.  Do not resolve a floating release or copy files from
 * the HECer runtime directory into this bundle.
 */
export const AETHERSCALE_NODE_ID = "comfyui-aetherscale" as const;
export const AETHERSCALE_NODE_REPOSITORY =
  "https://github.com/vizart-vj/ComfyUI-AetherScale.git" as const;
export const AETHERSCALE_NODE_DIRECTORY = "ComfyUI-AetherScale" as const;
export const AETHERSCALE_NODE_VERSION = "0.5.5" as const;
export const AETHERSCALE_NODE_RELEASE = "v0.5.5" as const;
export const AETHERSCALE_NODE_REVISION =
  "b825f783f31b7cce45e0be02ba87c8ed5b20f9d5" as const;
export const AETHERSCALE_NODE_ARCHIVE = "ComfyUI-AetherScale-v0.5.5.zip" as const;
export const AETHERSCALE_NODE_ARCHIVE_BYTES = 433107 as const;
export const AETHERSCALE_NODE_ARCHIVE_SHA256 =
  "c73971d99e806d80bc4eccf879837272d863d7a7f66277baaa3ab6791501008c" as const;
export const AETHERSCALE_NODE_RELEASE_URL =
  "https://github.com/vizart-vj/ComfyUI-AetherScale/releases/download/v0.5.5/ComfyUI-AetherScale-v0.5.5.zip" as const;
export const AETHERSCALE_NODE_REQUIRED_NODE_TYPES = [
  "AetherScaleMotionAnalysis",
  "AetherScaleNeuralRendering"
] as const;

export const AETHERSCALE_RUNTIME_BUNDLE_ID =
  "aetherscale-carrier-v1-node-0.5.5" as const;
export const AETHERSCALE_CARRIER_SOURCE =
  "Merserk/dlss5-visual-enhancer" as const;
export const AETHERSCALE_CARRIER_RELEASE = "v1.0" as const;
export const AETHERSCALE_CARRIER_ARCHIVE =
  "DLSS.5.Visual.Enhancer.v1.0.zip" as const;
export const AETHERSCALE_CARRIER_ARCHIVE_BYTES = 467949256 as const;
export const AETHERSCALE_CARRIER_ARCHIVE_SHA256 =
  "5d57c2f2d2a1c247c0249e7a1024eabb5384ee9111820a4a478be6ce893b767d" as const;
export const AETHERSCALE_CARRIER_DOWNLOAD_URL =
  "https://github.com/Merserk/dlss5-visual-enhancer/releases/download/v1.0/DLSS.5.Visual.Enhancer.v1.0.zip" as const;

export const AETHERSCALE_CARRIER_RUNTIME_FILES = [
  "nvngx.dll",
  "dxgi.dll",
  "renodx-dlss5.addon64",
  "nvngx_dlss.dll",
  "nvngx_dlssnr.dll",
  "ReShade.ini"
] as const;

export interface AetherScaleCarrierRuntimeFile {
  filename: typeof AETHERSCALE_CARRIER_RUNTIME_FILES[number];
  archiveMember: string;
  bytes: number;
  sha256: string;
  peMachine?: "x64" | "not-pe";
  /** ReShade normalizes this config after the first carrier worker run. */
  mutableAfterRuntime?: boolean;
}

/** Exact WP0 audit of the pinned Merserk v1.0 archive. */
export const AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST: readonly AetherScaleCarrierRuntimeFile[] = [
  {
    filename: "nvngx.dll",
    archiveMember: "bin/runtime/nvngx.dll",
    bytes: 78336,
    sha256: "4e4688760759c3433961ab93545f9749ec50e5b06bec2679db8eb47514e2ce13",
    peMachine: "x64"
  },
  {
    filename: "dxgi.dll",
    archiveMember: "bin/runtime/dxgi.dll",
    bytes: 5592064,
    sha256: "0cee63f9c9f13f3ac909c5b4903f4dbb4b719a7ab3b4f13b0deaf83c814b94f7",
    peMachine: "x64"
  },
  {
    filename: "renodx-dlss5.addon64",
    archiveMember: "bin/runtime/renodx-dlss5.addon64",
    bytes: 1694720,
    sha256: "9150097cdee2953cdc9894d2e5606ea5100e6c8f95fc7bb1b407328b4391a07a",
    peMachine: "x64"
  },
  {
    filename: "nvngx_dlss.dll",
    archiveMember: "bin/runtime/nvngx_dlss.dll",
    bytes: 58956400,
    sha256: "c85f971ce023c9f3492fc7455f0b01a24ba18ea39636407a846902c4360b0b7e",
    peMachine: "x64"
  },
  {
    filename: "nvngx_dlssnr.dll",
    archiveMember: "bin/runtime/nvngx_dlssnr.dll",
    bytes: 165830144,
    sha256: "6eb209e764f39872625debd6abaf45e2bb6322f6f270f781f70c059ae30b3927",
    peMachine: "x64"
  },
  {
    filename: "ReShade.ini",
    archiveMember: "bin/runtime/ReShade.ini",
    bytes: 187,
    sha256: "6cacb07a67c7e88ef9ea4c14f688d2e9d2ca89953e3c0f71b5afa96786c425a7",
    peMachine: "not-pe",
    mutableAfterRuntime: true
  }
];

export interface AetherScaleCarrierRuntimeBundle {
  id: typeof AETHERSCALE_RUNTIME_BUNDLE_ID;
  nodeRevision: typeof AETHERSCALE_NODE_REVISION;
  source: typeof AETHERSCALE_CARRIER_SOURCE;
  release: typeof AETHERSCALE_CARRIER_RELEASE;
  archive: string;
  archiveBytes: number;
  archiveSha256: string;
  downloadUrl: string;
  requiredFiles: readonly string[];
  files: readonly AetherScaleCarrierRuntimeFile[];
  optionalVfx: {
    package: "nvidia-vfx";
    version: "0.1.0.1";
    indexUrl: string;
    sourceArchive: string;
    sourceArchiveSha256: string;
    available: boolean;
  };
}

export const aetherScaleCarrierRuntimeBundle: AetherScaleCarrierRuntimeBundle = {
  id: AETHERSCALE_RUNTIME_BUNDLE_ID,
  nodeRevision: AETHERSCALE_NODE_REVISION,
  source: AETHERSCALE_CARRIER_SOURCE,
  release: AETHERSCALE_CARRIER_RELEASE,
  archive: AETHERSCALE_CARRIER_ARCHIVE,
  archiveBytes: AETHERSCALE_CARRIER_ARCHIVE_BYTES,
  archiveSha256: AETHERSCALE_CARRIER_ARCHIVE_SHA256,
  downloadUrl: AETHERSCALE_CARRIER_DOWNLOAD_URL,
  requiredFiles: AETHERSCALE_CARRIER_RUNTIME_FILES,
  files: AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST,
  optionalVfx: {
    package: "nvidia-vfx",
    version: "0.1.0.1",
    indexUrl: "https://pypi.org/project/nvidia-vfx/0.1.0.1/",
    sourceArchive: "nvidia_vfx-0.1.0.1.tar.gz",
    sourceArchiveSha256: "8a26bae3a967a2ce29040f17ba9d75e106f3d0c68016d440a77ed9c7eb05daae",
    available: false
  }
};

export const AETHERSCALE_CARRIER_RUNTIME_BUNDLE = aetherScaleCarrierRuntimeBundle;
export const AETHERSCALE_CARRIER_RUNTIME_ARTIFACTS = AETHERSCALE_CARRIER_RUNTIME_FILES_MANIFEST;
