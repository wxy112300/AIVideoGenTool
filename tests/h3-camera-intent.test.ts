import { describe, expect, it } from "vitest";
import {
  auditH3CameraIntent,
  extractH3CameraIntent,
  h3CameraIntentInstruction,
  preserveH3CameraIntentInOutput
} from "../src/core/h3-camera-intent.js";

describe("H3 camera intent guard", () => {
  it("extracts viewpoint, arc movement, and interior-to-exterior direction", () => {
    const intent = extractH3CameraIntent(
      "The camera rotates around the girl, showing the view from inside the room looking outside."
    );

    expect(intent.hasViewpointCamera).toBe(true);
    expect(intent.motionKinds).toContain("arc");
    expect(intent.requiresViewpoint).toBe(true);
    expect(intent.requiresSpatial).toBe(true);
    expect(intent.sourceClauses[0]).toContain("inside the room");
  });

  it("does not mistake a physical camera prop for a viewpoint instruction", () => {
    const intent = extractH3CameraIntent(
      "A woman holds a handheld camera while a security camera is visible on the wall."
    );

    expect(intent.hasViewpointCamera).toBe(false);
    expect(intent.hasPhysicalCamera).toBe(true);
    expect(h3CameraIntentInstruction(
      "A woman holds a handheld camera while a security camera is visible on the wall."
    )).toContain("Physical camera-device wording");
  });

  it("does not treat the camera operator as the viewpoint camera", () => {
    const intent = extractH3CameraIntent("The camera operator moves a camera across the room.");

    expect(intent.hasViewpointCamera).toBe(false);
    expect(intent.hasPhysicalCamera).toBe(true);
  });

  it("keeps an on-screen camera prop separate from a camera viewpoint", () => {
    const intent = extractH3CameraIntent("There is a camera in the shot, and the woman looks at it.");

    expect(intent.hasViewpointCamera).toBe(false);
    expect(intent.hasPhysicalCamera).toBe(true);
  });

  it("keeps a look-at-camera instruction as a viewpoint camera constraint", () => {
    const intent = extractH3CameraIntent(
      "The girl looks at the camera while holding a small phone camera."
    );

    expect(intent.hasViewpointCamera).toBe(true);
    expect(intent.hasPhysicalCamera).toBe(true);
    expect(intent.sourceClauses[0]).toContain("looks at the camera");
  });

  it("treats movement toward the camera as a viewpoint relation", () => {
    const intent = extractH3CameraIntent("A woman walks toward the camera.");

    expect(intent.hasViewpointCamera).toBe(true);
    expect(intent.hasPhysicalCamera).toBe(false);
  });

  it("audits all explicit camera facets instead of accepting the word camera alone", () => {
    const source = "The camera rotates around the girl, showing the view from inside the room looking outside.";
    const missing = auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The girl turns slowly."
    );
    const complete = auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The viewpoint camera performs one continuous Arc Shot around the girl, beginning inside the room and looking outside."
    );

    expect(missing.passed).toBe(false);
    expect(missing.missing).toEqual(["camera-movement", "viewpoint", "spatial"]);
    expect(auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The viewpoint camera performs an Arc Shot, beginning inside the room and looking outside."
    ).missing).toContain("camera-target");
    expect(complete.passed).toBe(true);
  });

  it("audits a subject's explicit relation to the viewpoint camera", () => {
    const source = "A woman walks toward the camera.";
    expect(auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The woman walks forward."
    ).missing).toEqual(["viewpoint"]);
    expect(auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The woman walks toward the lens."
    ).passed).toBe(true);
  });

  it("conservatively restores the original camera wording inside the H3 shot", () => {
    const source = "The camera rotates around the girl, showing the view from inside the room looking outside.";
    const repaired = preserveH3CameraIntentInOutput(
      "integrated_multimodal_description: [Shot 1] The girl turns slowly.\n\noverall_soundscape: Quiet room tone.\n\nnon_diegetic_music: N/A",
      source,
      "T2VA"
    );

    expect(repaired).toContain("The viewpoint camera must preserve this explicit user direction in the shot");
    expect(repaired).toContain(source);
    expect(repaired).toContain("overall_soundscape:");
  });

  it("leaves output unchanged when the source only mentions a physical camera", () => {
    const output = "integrated_multimodal_description: [Shot 1] A woman holds a camera.";
    expect(preserveH3CameraIntentInOutput(
      output,
      "A woman holds a handheld camera.",
      "T2VA"
    )).toBe(output);
  });
});
