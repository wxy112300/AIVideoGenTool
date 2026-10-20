import { FileReadResourcePressure, type StrataHostPressureDiagnostic } from "./strata-residency-pressure.js";
/** Agent and H3 share host warning/critical semantics; lifecycle/context stay separate. */
export class AgentResourcePressure extends FileReadResourcePressure {
  constructor(now = Date.now, onDiagnostic?: (event: StrataHostPressureDiagnostic) => void) { super(now, onDiagnostic); }
}
