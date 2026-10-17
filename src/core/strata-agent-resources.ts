import { FileReadResourcePressure } from "./strata-residency-pressure.js";
/** Preserve the independently verified Agent floor; H3 keeps a larger 2GiB RAM floor. */
export class AgentResourcePressure extends FileReadResourcePressure {
  constructor(now = Date.now) { super(now, 0.5); }
}
