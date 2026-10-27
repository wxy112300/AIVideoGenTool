import type { Draft } from "../../types.js";
import type { freezeLongVideoScript, LongVideoScript, ScriptPage } from "./script.js";
import type { LongVideoRunSource } from "./run-source.js";

/** Recreate the selected script as an editable new Run; never carry an execution lease. */
export function longVideoDraftFields(plan: ReturnType<typeof freezeLongVideoScript> | undefined, modelId: string, source?: LongVideoRunSource): Pick<Draft, "longVideoScript" | "longVideoEditor" | "longVideoRunSource"> {
  if (!plan) return { longVideoScript: undefined, longVideoEditor: undefined, longVideoRunSource: undefined };
  const pages: ScriptPage[] = plan.pages.map(page => ({ id: page.pageId, activeVersionId: page.versionId,
    versions: [{ id: page.versionId, text: page.text, source: "user" }], locked: false, stale: false, outline: "" }));
  const script: LongVideoScript = { schemaVersion: 1, revision: plan.revision, layout: structuredClone(plan.layout), sharedPreamble: plan.sharedPreamble,
    brief: pages[0]!, segments: pages.slice(1), archived: [], workingMode: "assisted", view: "segment", activePageId: pages[0]!.id };
  return { longVideoScript: script, longVideoRunSource: structuredClone(source), longVideoEditor: { key: `${modelId}:${source ? "video" : "image"}`, active: true, confirmed: true, seeded: true,
    seconds: plan.layout.requestedSeconds, count: plan.layout.chunks } };
}
