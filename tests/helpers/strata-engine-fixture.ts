/** Published 0.1.52 cuda13 manifest, serialized exactly as its feed-pinned bytes. */
export const strataEngineManifestFixture = () => JSON.stringify({
  schema_version: 2, id: "strata-engine", name: "strata-engine", version: "0.1.52",
  platform: "windows-x86_64", backend: "cuda", archs: ["sm_75", "sm_86", "sm_89", "sm_120", "compute_120"],
  min_driver: { nvidia: "580.65" }, build_id: "a42cc3d7df70+cuda13.0", entrypoint: "strata.exe",
  files: [
    { path: "strata.exe", sha256: "dbd0f9b692e9790cd8a25b383a265fab4ccf424a98e6ebc533c6e00dc58628bc", bytes: 272727040 },
    { path: "BUILD.json", sha256: "59b3cb3efb3a16fac521899f3507ca42ec9f4cda6059e2becad9dfcd9ed20cd2", bytes: 240 },
    { path: "strata-vision.exe", sha256: "dea6be483273737eac80eb3099938e1a9d5609ac3bff1db0876a48c37cd70a95", bytes: 108198912 },
    { path: "strata_kq.dll", sha256: "a2a419198965556857ce8e7b892ac5decb816a386df9cb2c9c3b4f73f2a3c7c9", bytes: 34449920 },
    { path: "cublas64_13.dll", sha256: "b5846446f2a151ca24b74b8113d4ca32c52105ad89d4c2f1bc56a4ccffa9ea61", bytes: 51776624 },
    { path: "cublasLt64_13.dll", sha256: "680561bdc5d8a8c921e9ae974e6b60a6608c9d9fca8c0fd125e9da08c5c33ff1", bytes: 478140016 }
  ],
  signature: { alg: "ed25519", key_id: "5d1bc23abbeffd0d", value: "GP9tgyHS1iS3+Nhv8/ZKpKKMwf6jsgIkzwj2AJdTvYzQphHiXlvGBZQztDdgXph9X5HX8kj9w25d/UPZKJ++AA==" },
  variant: "cuda13", notes: "0.2.7 NVIDIA cuda13 engine with the CUDA picture reader (strata-vision); cudart and cublas bundled"
}, null, 1).replaceAll("\n", "\r\n") + "\r\n";
