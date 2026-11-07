/** Synthetic component for the mocked installer; its digest is isolated in that test.
 * Production archive/manifest digests remain pinned to the official release feed. */
export const strataEngineManifestFixture = () => JSON.stringify({
  schema_version: 2, id: "strata-engine", name: "strata-engine", version: "0.1.58",
  platform: "windows-x86_64", backend: "cuda", archs: ["sm_75", "sm_86", "sm_89", "sm_120", "compute_120"],
  min_driver: { nvidia: "580.65" }, build_id: "synthetic-installer-fixture", entrypoint: "strata.exe",
  files: ["strata.exe", "BUILD.json", "strata-vision.exe", "strata_kq.dll", "cublas64_13.dll", "cublasLt64_13.dll"]
    .map(path => ({ path, sha256: "f".repeat(64), bytes: 7 })),
  variant: "cuda13", notes: "Synthetic installer manifest; engine extraction and Python verification are mocked."
}, null, 1).replaceAll("\n", "\r\n") + "\r\n";
