export interface CatalogCustomNodeDefinition {
  id: string;
  name: string;
  purpose: string;
  repositoryUrl: string;
  directoryName: string;
  aliases: readonly string[];
  /** Optional remote source used for a cached, non-blocking update check. */
  releaseSource?: "github-release";
  nodeTypes?: readonly string[];
  runtimeEndpoint?: string;
  minimumVersion?: string;
  recommendedVersion?: string;
  /** Optional release-aware version used to surface an update without making it a hard requirement. */
  latestVersion?: string;
  /** Python-side runtime requirement when the node package's own version is not the constraint. */
  runtimeRequirement?: string;
  /** Optional nodes with external toolchains can opt out of the bulk installer. */
  bulkInstall?: boolean;
  /** Feature-scoped nodes used by optional workflow paths. */
  features?: readonly CatalogCustomNodeFeature[];
  /** Evidence collected for this definition; informational and never an install prerequisite by itself. */
  compatibilityEvidence?: readonly DependencyCompatibilityEvidence[];
  /** Explicitly known incompatible version/revision ranges. */
  knownBadRanges?: readonly DependencyBadRange[];
  required: boolean;
}

export type DependencyCompatibilityCheck =
  | "static"
  | "object-info"
  | "minimal-run";

export interface DependencyCompatibilityEvidence {
  verifiedAt: string;
  sourceUrl: string;
  note: string;
  comfyUi?: string;
  python?: string;
  pytorch?: string;
  cuda?: string;
  commit?: string;
  workflowIds?: readonly string[];
  checks?: readonly DependencyCompatibilityCheck[];
}

export interface DependencyBadRange {
  versionFrom?: string;
  versionTo?: string;
  revisionFrom?: string;
  revisionTo?: string;
  reason: string;
  severity: "warning" | "error";
  sourceUrl: string;
  fixedByVersion?: string;
  fixedByRevision?: string;
}

export type CatalogCustomNodeFeatureId =
  | "h3-sage-attention"
  | "h3-sla-attention"
  | "h3-live-preview"
  | "vram-debug";

export interface CatalogCustomNodeFeature {
  id: CatalogCustomNodeFeatureId;
  name: string;
  nodeTypes: readonly string[];
  description: string;
}
