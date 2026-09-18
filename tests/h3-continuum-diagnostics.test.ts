import { describe, expect, it } from "vitest";
import {
  extractH3ContinuumExtendDiagnostics,
  parseH3ContinuumExtendDiagnostics,
  validateH3ContinuumExtendDiagnostics
} from "../src/core/h3-continuum-diagnostics.js";

function validDiagnostics() {
  return {
    schema_version: 1,
    input_artifact: {
      reference: "h3-native-av/source.safetensors",
      payload_path: "C:/ComfyUI/output/h3-native-av/source.safetensors",
      manifest_path: "C:/ComfyUI/output/h3-native-av/source.json",
      payload_sha256: "a".repeat(64),
      payload_bytes: 16_795_376,
      video_shape: [1, 24, 107, 30, 54],
      video_dtype: "F32",
      audio_shape: [1, 32, 2, 603],
      audio_dtype: "F32"
    },
    source_frame_count: 362,
    capacity_frames: 22,
    video_tail_shape: [1, 24, 7, 30, 54],
    audio_tail_shape: [1, 32, 2, 55],
    video_tail_fingerprint: {
      shape: [1, 24, 7, 30, 54], dtype: "torch.float32", finite: true,
      mean: 0, std: 1, weighted_sample: 2
    },
    audio_tail_fingerprint: {
      shape: [1, 32, 2, 55], dtype: "torch.float32", finite: true,
      mean: 0, std: 1, weighted_sample: 2
    },
    initial_state_nonempty: true,
    selected_source: "initial_state",
    requested_backend: "Standard",
    resolved_transport: "masked_av_prefix_22_v1",
    transport_verified: true,
    transport_evidence: "masked_av_prefix_22_v1:context=22;trim=22;sampling_report=verified",
    context_frames: 22,
    total_frames: 362,
    trim_frames: 22,
    net_frames: 340,
    state_clip_index: 1,
    output_clip_index: 2,
    continuation: true,
    fresh_fallback: false,
    actual_assembly_total_frames: [362],
    actual_assembly_trims: [22],
    actual_assembly_net_frames: [340],
    actual_assembly_context_frames: [22],
    assembly_report_present: true,
    spectrum_mode: "balanced",
    spectrum_model_aware_mode: "off",
    continuum_package_version: "3.8.2"
  };
}

describe("H3 Continuum Extend runtime diagnostics", () => {
  it("accepts a state-backed continuation report and extracts it from history", () => {
    const diagnostics = validDiagnostics();
    expect(validateH3ContinuumExtendDiagnostics(diagnostics)).toBeNull();
    expect(extractH3ContinuumExtendDiagnostics({
      outputs: {
        "24": {
          h3_continuum_diagnostics: [diagnostics]
        }
      }
    }, "24")).toMatchObject({
      selected_source: "initial_state",
      trim_frames: 22,
      resolved_transport: "masked_av_prefix_22_v1"
    });
  });

  it("keeps nested UI and result payloads as compatibility fallbacks", () => {
    const diagnostics = validDiagnostics();
    expect(extractH3ContinuumExtendDiagnostics({
      outputs: {
        "24": {
          ui: { h3_continuum_diagnostics: [diagnostics] }
        }
      }
    }, "24")).toMatchObject({ selected_source: "initial_state" });
    expect(extractH3ContinuumExtendDiagnostics({
      outputs: {
        "24": {
          result: [JSON.stringify(diagnostics)]
        }
      }
    }, "24")).toMatchObject({ selected_source: "initial_state" });
  });

  it("rejects a report that says the upstream silently fell back to fresh", () => {
    const diagnostics = validDiagnostics();
    diagnostics.selected_source = "fresh_run";
    diagnostics.continuation = false;
    diagnostics.fresh_fallback = true;
    expect(validateH3ContinuumExtendDiagnostics(diagnostics)).toContain("实际续写来源不是 initial_state");
    expect(() => parseH3ContinuumExtendDiagnostics(diagnostics)).toThrow("H3 Continuum Extend 诊断校验失败");
  });

  it("rejects a continuation plan without sampling transport evidence", () => {
    const diagnostics = validDiagnostics();
    diagnostics.transport_verified = false;
    diagnostics.transport_evidence = "";
    expect(validateH3ContinuumExtendDiagnostics(diagnostics)).toContain("sampling report");
  });

  it("fails when the output node is missing", () => {
    expect(() => extractH3ContinuumExtendDiagnostics({ outputs: {} }, "24")).toThrow(
      "缺少诊断节点输出"
    );
  });
});
