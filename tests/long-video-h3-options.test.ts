import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { compileContinuumGroupWorkflow, continuumRuntimeSettings, type ContinuumGroupProfile } from "../src/core/long-video/group-workflow";
import { longVideoProfileIdentity } from "../src/core/long-video/run-source";
import { longVideoContinuationDraft } from "../src/core/long-video/continuation-draft";
import { createDefaultState } from "../src/core/defaults";
import { extensionTaskFromDraft } from "../src/core/queue-task-factory";
import { editLongVideoScript } from "../src/core/long-video/script";
import { freezeLongVideoExtension } from "../src/core/long-video/execution";
import { completedGroupVersion } from "./harness/long-video-source";
import { videoLoraSelection, BUILTIN_VIDEO_LORAS, H3_TURBO_LORA_ID, H3_TURBO_V4_LORA_ID, H3_TURBO_8STEP_V1_LORA_ID, H3_SLA_TURBO_LORA_ID, H3_PDD_FL2VA_LORA_ID } from "../src/core/video-loras";
import type { VideoLoraSelection } from "../src/types";
import { comfyUiSettingsForQueueTask, comfyUiMemoryArgs } from "../src/infrastructure/comfy-runtime-policy";

const template = JSON.parse(fs.readFileSync(new URL("../workflows/minimax_h3_continuum_v38_managed_extend_api.json", import.meta.url), "utf8"));
const request = { execution_id: "test", step_id: "group", attempt_id: "attempt", project_id: "project", run_name: "run", planned_chunks: 2, expected_prefix_chunks: 0, expected_parent_revision_id: "" };
const style = (id: string): VideoLoraSelection => ({ id, name: id, filename: `${id}.safetensors`, strength: .7, modelFamily: "minimax-h3", purpose: "style", compatibleModelIds: ["minimax_h3_fl2va"], compatibleInputModes: ["image"], promptPrefixes: ["film look"] });
const profile = (): ContinuumGroupProfile => ({ diffusionModel: "model", textEncoder: "clip", videoVae: "vae", width: 512, height: 512, seed: 42, steps: 20, sampler: "res_multistep", scheduler: "simple", chunkSeconds: 5, prompts: ["film look, first", "second"], firstImage: "first.png", attention: "sage-triton", spectrumMode: "balanced", h3: { modelId: "minimax_h3_fl2va", videoLoras: [style("first"), style("second")], sparseAttentionMode: "sol-attn", runtimeMode: "native", comfyCompilerMode: "auto", spectrumModelAwareMode: "off" } });

describe("shared H3 options in Continuum", () => {
  it.each(["sage", "sage-triton", "comfy-kitchen", "sdpa"] as const)("wires the ordered LoRA/dense/SOL/Spectrum chain with %s", attention => {
    const frozen = { ...profile(), attention }, before = structuredClone(frozen);
    const graph = compileContinuumGroupWorkflow(template, request, frozen);
    expect(frozen).toEqual(before);
    expect(graph["12"].inputs.model).toEqual(graph["7"].inputs.model);
    const chain = []; let link = graph["12"].inputs.model as [string,number];
    while (link) { const node = graph[link[0]]!; chain.push(node); link = node.inputs.model as [string,number]; }
    expect(chain.map(n=>n.class_type)).toEqual(["SpectrumApplyMiniMaxH3", "BlockSparseAttention", ...(attention === "sdpa" ? [] : [attention === "comfy-kitchen" ? "ModelAttentionBackend" : "LocalVideoStudioH3ManagedSageAttention"]), "LoraLoaderModelOnly", "LoraLoaderModelOnly", "UNETLoader"]);
    expect(chain.filter(n=>n.class_type === "LoraLoaderModelOnly").map(n=>n.inputs.lora_name)).toEqual(["second.safetensors", "first.safetensors"]);
    expect(chain[1]!.inputs).toMatchObject({ selection: "sol-attn", "selection.tau": 1.3 });
    if (attention === "sage-triton") expect(chain[2]!.inputs).toMatchObject({ sage_attention: "sageattn_qk_int8_pv_fp16_triton", allow_compile: true });
    expect(continuumRuntimeSettings(frozen)).toMatchObject({ h3RuntimeMode: "native", h3ComfyCompilerMode: "auto" });
  });
  it.each([[H3_TURBO_LORA_ID, "euler", "beta", 6, 3], [H3_TURBO_V4_LORA_ID, "euler", "beta", 12, 6], [H3_TURBO_8STEP_V1_LORA_ID, "er_sde", "beta", 12, 3], [H3_SLA_TURBO_LORA_ID, "euler", "beta", 6, 3], [H3_PDD_FL2VA_LORA_ID, "euler", "simple", 12, 3]])("uses the shared %s sampling recipe", (id, sampler, scheduler, video, audio) => {
    const p=profile(); p.spectrumMode="off";p.h3!.videoLoras=[videoLoraSelection(BUILTIN_VIDEO_LORAS.find(l=>l.id===id)!)];p.h3!.sparseAttentionMode="off";
    const graph=compileContinuumGroupWorkflow(template,request,p);
    expect(graph["6"].inputs.sampler_name).toBe(sampler);expect(graph["7"].inputs.scheduler).toBe(scheduler);
    expect(Object.values(graph).find(n=>n.class_type==="MiniMaxH3SigmaShift")!.inputs).toMatchObject({shift_video:video,shift_audio:audio});
    if(id===H3_SLA_TURBO_LORA_ID) expect(Object.values(graph).find(n=>n.class_type==="BlockSparseAttention")!.inputs.selection).toBe("sla");
    if(id===H3_PDD_FL2VA_LORA_ID) expect(graph["7"].inputs.steps).toBe(8);
  });
  it("restores LoRAs and launch policy from History despite different current settings and adds triggers only to new prompts", () => {
    const state=createDefaultState(),version=completedGroupVersion();const p=profile();
    // Keep the accepted fixture's size/seed/duration; only its frozen options change.
    version.longVideoExecution!.profile={...version.longVideoExecution!.profile, attention:p.attention, spectrumMode:p.spectrumMode, h3:p.h3};
    let i=0;const id=()=>`id-${++i}`;
    const draft=longVideoContinuationDraft(state.draft,"asset",version,version.files[0]!.absolutePath!,id);
    draft.longVideoScript=editLongVideoScript(draft.longVideoScript!,draft.longVideoScript!.segments.map(s=>({pageId:s.id,text:"continue"})),draft.longVideoScript!.revision,"user",id);
    draft.longVideoEditor!.confirmed=true;
    const task=extensionTaskFromDraft(draft,state);
    expect(task.videoLoras!.map(l=>l.filename)).toEqual(["first.safetensors","second.safetensors"]);
    expect(task).toMatchObject({ attentionMode:"sage-triton",h3SparseAttentionMode:"sol-attn",h3RuntimeMode:"native",h3ComfyCompilerMode:"auto" });
    const runtime=comfyUiSettingsForQueueTask(task,{...state.settings,h3RuntimeMode:"compatibility",h3ComfyCompilerMode:"disabled"});
    expect(comfyUiMemoryArgs(runtime)).toContain("--enable-dynamic-vram");
    expect(comfyUiMemoryArgs(runtime)).not.toContain("--disable-comfy-compiler");
    const frozen=freezeLongVideoExtension("new-task","new-run",draft.longVideoScript!,draft.longVideoRunSource!);
    expect(frozen.profile.prompts.slice(0,version.longVideoReceipt!.accepted_chunks)).toEqual(version.longVideoExecution!.profile.prompts);
    expect(frozen.profile.prompts.at(-1)!.match(/film look/g)).toHaveLength(1);
    expect(longVideoProfileIdentity(frozen.profile)).toBe(longVideoProfileIdentity(version.longVideoExecution!.profile));
    expect(longVideoProfileIdentity({...frozen.profile,h3:{...frozen.profile.h3!,videoLoras:[...frozen.profile.h3!.videoLoras].reverse()}})).not.toBe(longVideoProfileIdentity(frozen.profile));
  });
});
