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
  required: boolean;
}

export type CatalogWorkflowDependencyId = "minimax_h3_i2v";

export interface CatalogWorkflowDependencyDefinition {
  id: CatalogWorkflowDependencyId;
  name: string;
  purpose: string;
  sourceUrl: string;
  targetSegments: readonly string[];
}
