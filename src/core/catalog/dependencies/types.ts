export interface CatalogCustomNodeDefinition {
  id: string;
  name: string;
  purpose: string;
  repositoryUrl: string;
  directoryName: string;
  aliases: readonly string[];
  nodeTypes?: readonly string[];
  runtimeEndpoint?: string;
  minimumVersion?: string;
  recommendedVersion?: string;
  /** Python-side runtime requirement when the node package's own version is not the constraint. */
  runtimeRequirement?: string;
  /** Optional nodes with external toolchains can opt out of the bulk installer. */
  bulkInstall?: boolean;
  /** Feature-scoped nodes used by optional workflow paths. */
  features?: readonly CatalogCustomNodeFeature[];
  required: boolean;
}

export type CatalogCustomNodeFeatureId =
  | "h3-sage-attention"
  | "h3-live-preview"
  | "vram-debug";

export interface CatalogCustomNodeFeature {
  id: CatalogCustomNodeFeatureId;
  name: string;
  nodeTypes: readonly string[];
  description: string;
}

export type CatalogWorkflowDependencyId = "minimax_h3_i2v" | "qwen36_h3_prompt_enhancer";

export interface CatalogWorkflowDependencyDefinition {
  id: CatalogWorkflowDependencyId;
  name: string;
  purpose: string;
  sourceUrl: string;
  targetSegments: readonly string[];
}
