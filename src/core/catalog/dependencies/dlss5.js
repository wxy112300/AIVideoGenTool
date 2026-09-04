/**
 * Static DLSS5 acquisition facts for the first implementation phase.
 *
 * Runtime download, extraction and probing belong to the later installer
 * phase and must consume this manifest instead of resolving a floating release.
 */
export const DLSS5_NODE_ID = "comfyui-dlss5";
export const DLSS5_NODE_REPOSITORY = "https://github.com/HECer/ComfyUI-DLSS5.git";
export const DLSS5_NODE_DIRECTORY = "ComfyUI-DLSS5";
export const DLSS5_NODE_VERSION = "0.2.2";
export const DLSS5_NODE_REVISION = "310524aa283602832cbdd827ce4e35565c859a7e";
export const DLSS5_NODE_REQUIRED_NODE_TYPES = [
    "DLSSSuperResolution",
    "DLSS5DepthAnythingV2",
    "DLSS5OpticalFlow"
];
export const DLSS5_VAPOURKIT_RELEASE = "9898804f76c792ba865aa930bd07badf4e1d7d24";
export const DLSS5_VAPOURKIT_ARCHIVE = "vsdlssnr.7z";
export const DLSS5_VAPOURKIT_REPOSITORY = "https://github.com/Kim2091/vapourkit";
export const DLSS5_VAPOURKIT_URL = `https://raw.githubusercontent.com/Kim2091/vapourkit/${DLSS5_VAPOURKIT_RELEASE}/include/plugins/${DLSS5_VAPOURKIT_ARCHIVE}`;
export const DLSS5_VAPOURKIT_SHA256 = "0a4894464badc6588d707bb5ee41506a38e1f749884864ed3846a961ffd4d0cb";
export const DLSS5_RUNTIME_BUNDLE_ID = "hecer-nr-310.8-r79-py313";
export const dlss5RuntimeBundle = {
    id: DLSS5_RUNTIME_BUNDLE_ID,
    nodeRevision: DLSS5_NODE_REVISION,
    artifacts: [
        {
            id: "python", capability: "shared-required", repository: "https://www.python.org/downloads/release/python-3137/", releaseTag: "3.13.7",
            assetName: "python-3.13.7-embeddable-amd64.zip", url: "https://www.python.org/ftp/python/3.13.7/python-3.13.7-embeddable-amd64.zip",
            sha256: "e201b2da753a88c1af29d87f9f48af4d64a0fc8522a204ae672bd2c382496701", bytes: 10923196, archive: "zip", expectedFiles: ["python.exe", "python313._pth"]
        },
        {
            id: "vapoursynth", capability: "shared-required", repository: "https://github.com/vapoursynth/vapoursynth", releaseTag: "R79",
            assetName: "VapourSynth64-Portable-R79.zip", url: "https://github.com/vapoursynth/vapoursynth/releases/download/R79/VapourSynth64-Portable-R79.zip",
            sha256: "625b3410d903943107291592e90d6f521f829ebb8291d952ee91b8d674bbb153", bytes: 23160674, archive: "zip", expectedFiles: ["vapoursynth-79-cp312-abi3-win_amd64.whl"]
        },
        {
            id: "numpy", capability: "shared-required", repository: "https://pypi.org/project/numpy/2.3.3/", releaseTag: "2.3.3",
            assetName: "numpy-2.3.3-cp313-cp313-win_amd64.whl", url: "https://files.pythonhosted.org/packages/1b/b5/263ebbbbcede85028f30047eab3d58028d7ebe389d6493fc95ae66c636ab/numpy-2.3.3-cp313-cp313-win_amd64.whl",
            sha256: "f0dadeb302887f07431910f67a14d57209ed91130be0adea2f9793f1a4f817cf", bytes: 12783269, archive: "zip", expectedFiles: ["_multiarray_umath.cp313-win_amd64.pyd"]
        },
        {
            id: "vapourkit",
            capability: "nr-required",
            repository: DLSS5_VAPOURKIT_REPOSITORY,
            releaseTag: DLSS5_VAPOURKIT_RELEASE,
            assetName: DLSS5_VAPOURKIT_ARCHIVE,
            url: DLSS5_VAPOURKIT_URL,
            sha256: DLSS5_VAPOURKIT_SHA256,
            bytes: 70076,
            archive: "7z",
            expectedFiles: ["vsdlssnr.dll"]
        },
        {
            id: "dlss-nr", capability: "nr-required", repository: "https://github.com/RankFTW/rhi-repo", releaseTag: "dlssnr-310.8.SF-v2",
            assetName: "nvngx_dlssnr_310.8.SF-v2.zip", url: "https://github.com/RankFTW/rhi-repo/releases/download/dlssnr-310.8.SF-v2/nvngx_dlssnr_310.8.SF-v2.zip",
            sha256: "1da35941894994eb087e017577829e492454e9bae3a6a9397027069ceb74955c", bytes: 116693212, archive: "zip", expectedFiles: ["nvngx_dlssnr.dll"]
        }
    ],
    unavailableCapabilities: {
        sr: "HECer v0.2.2 声明的 vsdlsssr.dll 不在固定 VapourKit 资产中；上游未公开该 wrapper。",
        guidedNr: "固定 vsdlssnr.dll 的 Enhance schema 与 HECer bridge 需要运行时复检；基础 NR 已实测。"
    }
};
export const DLSS5_RUNTIME_BUNDLE = dlss5RuntimeBundle;
export const DLSS5_RUNTIME_ARTIFACTS = dlss5RuntimeBundle.artifacts;
