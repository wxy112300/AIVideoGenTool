import type {
  NativeAvArtifactInspection
} from "../../src/types.js";
import type { StateRepository } from "../ports/state-repository.js";
import { NativeAvArtifactService } from "./native-av-artifact.js";

export interface HistoryArtifactServiceDependencies {
  store: StateRepository;
  artifactService: NativeAvArtifactService;
  resolveVideoOutputDirectory(): Promise<string>;
}

/** Reads only the artifact referenced by a known History AssetVersion. */
export class HistoryArtifactService {
  constructor(private readonly deps: HistoryArtifactServiceDependencies) {}

  async inspect(
    assetId: string,
    versionId: string
  ): Promise<NativeAvArtifactInspection> {
    const asset = this.deps.store.get().history.find((item) => item.id === assetId);
    const version = asset?.versions.find((item) => item.id === versionId);
    if (!asset || !version) {
      return { status: "missing", reason: "视频历史版本不存在。" };
    }
    const continuation = version.h3ContinuationData;
    if (!continuation?.artifact) {
      return {
        status: continuation?.status ?? "not-supported",
        ...(continuation?.reason ? { reason: continuation.reason } : {})
      };
    }
    const outputDirectory = await this.deps.resolveVideoOutputDirectory();
    if (!outputDirectory.trim()) {
      return { status: "missing", reason: "当前没有可解析的视频输出目录。" };
    }
    return this.deps.artifactService.inspect(continuation.artifact, outputDirectory);
  }
}
