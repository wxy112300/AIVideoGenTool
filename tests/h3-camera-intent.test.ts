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

  it("locks a persistent low-angle tracking shot to the viewpoint camera", () => {
    const source = "Low Angle tracking shot follows the girl continuously from below.";
    const intent = extractH3CameraIntent(source);

    expect(intent.motionKinds).toContain("track");
    expect(intent.angleKinds).toEqual(["low-angle"]);
    expect(intent.targetAnchors).toContain("girl");
    expect(h3CameraIntentInstruction(source)).toContain("Viewpoint-angle lock");
    expect(h3CameraIntentInstruction(source)).toContain("Tracking lock");
    expect(auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The viewpoint camera uses a low-angle tracking shot following the girl from below."
    ).passed).toBe(true);
    expect(auditH3CameraIntent(
      source,
      "integrated_multimodal_description: [Shot 1] The viewpoint camera uses an eye-level tracking shot following the girl."
    ).missing).toContain("camera-angle");
  });

  it("keeps Micro-FPV as an invisible viewpoint and preserves an exact orbit angle", () => {
    const source = "An ant-size tiny human walks from A to B while the Micro-FPV camera rotates around the tiny human180 degree.";
    const intent = extractH3CameraIntent(source);
    const instruction = h3CameraIntentInstruction(source);

    expect(intent.hasViewpointCamera).toBe(true);
    expect(intent.microFpvMetaphor).toBe(true);
    expect(intent.rotationDegrees).toEqual([180]);
    expect(intent.targetAnchors).toContain("tiny human");
    expect(instruction).toContain("Micro-FPV metaphor lock");
    expect(instruction).toContain("Exact rotation-angle lock");
    expect(instruction).toContain("half orbit/semicircle");

    const splitClauses = extractH3CameraIntent("ant-size tiny human starts on the table. rotate around the tiny human180 degree.");
    expect(splitClauses.rotationDegrees).toEqual([180]);
    expect(splitClauses.microFpvMetaphor).toBe(true);

    const shorthand = extractH3CameraIntent("A tiny human stands on the table. rotate around the tiny human180 degree.");
    expect(shorthand.rotationDegrees).toEqual([180]);

    expect(extractH3CameraIntent("镜头环绕这个微小真人180度后停在终点。").rotationDegrees).toEqual([180]);
  });

  it("audits a 360-degree expansion as a violation of a requested 180-degree orbit", () => {
    const source = "The camera rotates around the tiny human 180 degrees.";
    const halfOrbit = "integrated_multimodal_description: [Shot 1] The viewpoint camera completes an exact 180-degree orbit around the tiny human and stops.";
    const fullOrbit = "integrated_multimodal_description: [Shot 1] The viewpoint camera completes a 360-degree orbit around the tiny human.";

    expect(auditH3CameraIntent(source, halfOrbit).passed).toBe(true);
    expect(auditH3CameraIntent(source, fullOrbit).missing).toContain("rotation-angle");
    const repaired = preserveH3CameraIntentInOutput(fullOrbit, source, "T2VA");
    expect(repaired).toContain("180 degrees");
    expect(repaired).not.toContain("360-degree");
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
