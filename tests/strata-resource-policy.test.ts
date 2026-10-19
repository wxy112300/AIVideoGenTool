import { describe, expect, it } from "vitest";
import { applyStrataResourcePlan, planStrataResources, strataResourcePressure } from "../src/core/strata-resource-policy.js";
import { STRATA_Q4_MODEL_ID } from "../src/core/catalog/models/strata.js";
import { AgentResourcePressure } from "../src/core/strata-agent-resources.js";
import { FileReadResourcePressure } from "../src/core/strata-residency-pressure.js";
const GiB = 1024 ** 3;
const sample = (ram: number, commit = ram, free = 21.5) => ({ memoryAvailableBytes: ram * GiB,
  commitAvailableBytes: commit * GiB, vramAvailableBytes: free * GiB, vramTotalBytes: 24 * GiB });
describe("Strata available-resource admission", () => {
  it("budgets Q4 independently while retaining physical/commit/VRAM protections", () => {
    const options = { modelId: STRATA_Q4_MODEL_ID, allowFileReadFallback: true };
    const full = planStrataResources(sample(100,130),5120,options);
    expect(full.hostMode).toBe("arena");
    expect(full.requiredMemoryBytes).toBeGreaterThan(80 * GiB);
    expect(full.requiredCommitBytes).toBeGreaterThan(100 * GiB);
    const bounded = planStrataResources(sample(48,80),5120,options);
    expect(bounded).toMatchObject({ hostMode: "resident", residentBudgetGiB: 32 });
    expect(bounded.requiredCommitBytes).toBeGreaterThan(42 * GiB);
    expect(applyStrataResourcePlan(["--mmap-experts", "--max-context", "32768"],bounded,STRATA_Q4_MODEL_ID))
      .toEqual(["--max-context","32768","--resident-budget-gib","32"]);
    expect(applyStrataResourcePlan(["--mmap-experts"],full,STRATA_Q4_MODEL_ID)).toEqual([]);
    const long = planStrataResources(sample(48,80),5120,{...options,contextTokens:262144});
    expect(long.residentBudgetGiB).toBeLessThan(bounded.residentBudgetGiB!);
    expect(()=>planStrataResources(sample(48,30),5120,{...options,commitTrial:true})).toThrow("提交余量");
    expect(()=>planStrataResources(sample(20,130),5120,options)).toThrow("内存");
    expect(()=>planStrataResources(sample(100,130,19),5120,options)).toThrow("空闲显存");
    expect(()=>planStrataResources({...sample(100,130),commitAvailableBytes:null},5120,options)).toThrow("无法确认");
  });
  it("allows H3 file cache only in the right phase with a larger physical safety floor", () => {
    let now = 0; const p = new FileReadResourcePressure(() => now);
    expect(p.check(sample(2.5,10,4))).toContain("3GiB");
    p.setLoading(true); expect(p.check(sample(2.5,10,4))).toBeNull();
    now = 30000; expect(p.check(sample(2.5,10,4))).toContain("3GiB");
    p.setLoading(false); expect(p.check(sample(2.5,10,4))).toContain("3GiB");
    p.setFileRead(true); expect(p.check(sample(2.5,10,4))).toBeNull();
    expect(p.check(sample(1.9,10,4))).toContain("3GiB");
    expect(p.check(sample(0.9,10,4))).toContain("3GiB");
    expect(p.check(sample(2.5,5.9,4))).toContain("3GiB");
    expect(p.check(sample(2.5,10,1.9))).toContain("2GiB");
    expect(p.check({...sample(2.5,10,4),commitAvailableBytes:null})).toBeTruthy();
    p.setFileRead(false); expect(p.check(sample(2.5,10,4))).toContain("3GiB");
  });
  it("bounds an Agent cold-load RAM transition without masking hard pressure or changing inference", () => {
    let now = 0; const pressure = new AgentResourcePressure(() => now);
    expect(pressure.check(sample(2,10,4))).toContain("3GiB");
    pressure.setLoading(true); expect(pressure.check(sample(2,10,4))).toBeNull();
    now = 29999; expect(pressure.check(sample(2,10,4))).toBeNull();
    now = 30000; expect(pressure.check(sample(2,10,4))).toContain("3GiB");
    expect(pressure.check(sample(4,10,4))).toBeNull();
    expect(pressure.check(sample(2,10,4))).toBeNull();
    expect(pressure.check(sample(0.4,10,4))).toContain("3GiB");
    expect(pressure.check(sample(2,5,4))).toContain("3GiB");
    expect(pressure.check(sample(2,10,1.9))).toContain("2GiB");
    expect(pressure.check({ ...sample(2,10,4), commitAvailableBytes: null })).toContain("3GiB");
    expect(pressure.check({ ...sample(4,10,4), commitAvailableBytes: null })).toContain("监测不可用");
    pressure.setLoading(false); expect(pressure.check(sample(2,10,4))).toContain("3GiB");
    pressure.setFileRead(true); now += 60000; expect(pressure.check(sample(2,10,4))).toBeNull();
    expect(pressure.check(sample(0.4,10,4))).toContain("3GiB");
    expect(pressure.check(sample(2,5,4))).toContain("3GiB");
    pressure.setFileRead(false); expect(pressure.check(sample(2,10,4))).toContain("3GiB");
  });
  it("allows an explicit commit measurement trial without changing H3 defaults or RAM/VRAM/floor protections", () => {
    expect(() => planStrataResources(sample(40,45),5120)).toThrow("CUDA 加载预留");
    const trial = planStrataResources(sample(40,45),5120,{commitTrial:true});
    expect(trial.commitTrial).toBe(true); expect(trial.estimatedCommitBytes).toBeGreaterThan(45*GiB);
    expect(trial.requiredCommitBytes).toBe(trial.requiredMemoryBytes);
    expect(() => planStrataResources(sample(31,100),5120,{commitTrial:true})).toThrow("完整专家驻留");
    expect(() => planStrataResources(sample(40,2),5120,{commitTrial:true})).toThrow("提交余量");
    expect(() => planStrataResources(sample(40,45,19),5120,{commitTrial:true})).toThrow("空闲显存");
    expect(strataResourcePressure(sample(40,2))).toContain("3GiB");
  });
  it("uses the whole arena on a sufficiently free 128GB PC, not a fixed 16GB cap", () => {
    expect(planStrataResources(sample(100), 2048)).toMatchObject({hostMode:"arena", vramReserveMiB:5120});
  });
  it("uses the official GPU-complement residency when the full arena does not fit", () => {
    expect(planStrataResources(sample(40,70), 2048).hostMode).toBe("resident");
    expect(planStrataResources(sample(40,45),5120,{allowFileReadFallback:true}).requiredCommitBytes).toBe(42*GiB);
    expect(()=>planStrataResources(sample(40,41),5120,{allowFileReadFallback:true})).toThrow("提交余量");
    expect(()=>planStrataResources(sample(100,50),5120,{allowFileReadFallback:true})).toThrow("提交余量");
  });
  it("does not treat total RAM or a large pagefile as available physical memory", () => {
    expect(()=>planStrataResources(sample(31,100),2048)).toThrow("完整专家驻留");
    expect(()=>planStrataResources(sample(100,31),2048)).toThrow("提交余量");
    expect(()=>planStrataResources(sample(40,40),2048)).toThrow("CUDA 加载预留");
  });
  it("refuses occupied VRAM and unknown memory instead of optimistic auto-loading", () => {
    expect(()=>planStrataResources(sample(100,100,19),2048)).toThrow("空闲显存");
    expect(()=>planStrataResources({...sample(100),commitAvailableBytes:null},2048)).toThrow("无法确认");
    expect(()=>planStrataResources({...sample(100),memoryAvailableBytes:NaN},2048)).toThrow("无法确认");
  });
  it("honors a larger reserve and aborts before the last VRAM/RAM is consumed", () => {
    expect(planStrataResources(sample(100,100,23),6144).vramReserveMiB).toBe(6144);
    expect(strataResourcePressure(sample(6,6,2.5))).toBeNull();
    expect(strataResourcePressure(sample(6,6,1.9))).toContain("显存");
    expect(strataResourcePressure(sample(10,2,3))).toContain("提交余量");
  });
  it("never hides a known dangerous value behind an unrelated missing sensor", () => {
    expect(strataResourcePressure({ ...sample(10, 10, 1.9), commitAvailableBytes: null })).toContain("2GiB");
    expect(strataResourcePressure({ ...sample(2, 10), vramAvailableBytes: null })).toContain("3GiB");
    expect(strataResourcePressure({ ...sample(10, 2), vramAvailableBytes: null })).toContain("3GiB");
    expect(strataResourcePressure({ ...sample(10), commitAvailableBytes: null })).toContain("监测不可用");
  });
});
