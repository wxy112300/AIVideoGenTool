import { isH3AvLatentAsset, safeH3OutputRelativePath } from "./h3-av-asset.js";
function requiredCapability(adapter) {
    switch (adapter) {
        case "native-joint-av": return "native-av";
        case "motion-context": return "motion-context";
        case "legacy-continuum": return "continuum-bootstrap";
        case "managed-continuum": return "continuum-managed-chunk";
    }
}
function transportFor(adapter) {
    switch (adapter) {
        case "native-joint-av": return "nested-video-audio-tensors";
        case "motion-context": return "plain-video-audio-wrapper";
        case "legacy-continuum": return "legacy-bootstrap-boundary";
        case "managed-continuum": return "run-storage-chunk";
    }
}
function validatePath(file, label) {
    if (!safeH3OutputRelativePath(file))
        throw new Error(`${label} 不是安全的 output-root 相对路径`);
}
export function adaptH3AvAsset(asset, adapter) {
    if (!isH3AvLatentAsset(asset))
        throw new Error("H3 AV asset 未通过 canonical 校验");
    const capability = requiredCapability(adapter);
    if (!asset.capabilities.includes(capability)) {
        throw new Error(`H3 AV asset ${asset.assetId} 不具备 ${adapter} adapter 所需的 ${capability} capability`);
    }
    if (adapter === "managed-continuum" && asset.storageKind !== "continuum-run-chunk") {
        throw new Error("只有 Continuum Run Storage owner 才能进入 managed-continuum adapter");
    }
    if (adapter === "legacy-continuum" && asset.storageKind === "continuum-run-chunk") {
        throw new Error("官方 Run Storage chunk 不得降级伪装为 legacy Continuum bootstrap");
    }
    if (adapter !== "managed-continuum" && asset.storageKind === "continuum-run-chunk" &&
        adapter !== "native-joint-av" && adapter !== "motion-context") {
        throw new Error("Continuum Run Storage chunk 只能由明确的 managed/native/motion adapter 消费");
    }
    validatePath(asset.ownerPath, "H3 AV ownerPath");
    const alias = asset.aliasPaths?.find((candidate) => safeH3OutputRelativePath(candidate));
    const payloadPath = adapter === "managed-continuum" ? asset.ownerPath : (alias ?? asset.ownerPath);
    validatePath(payloadPath, "H3 AV adapter payloadPath");
    const physicalPayloadCount = asset.aliasMode === "copy-fallback" ? 2 : 1;
    return {
        adapter,
        assetId: asset.assetId,
        storageKind: asset.storageKind,
        capability,
        payloadPath,
        ownerPath: asset.ownerPath,
        transport: transportFor(adapter),
        officialRunStorage: asset.storageKind === "continuum-run-chunk",
        physicalPayloadCount
    };
}
