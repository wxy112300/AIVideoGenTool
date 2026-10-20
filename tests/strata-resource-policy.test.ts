import { describe, expect, it } from "vitest";
import { applyStrataResourcePlan, planStrataResources, strataResourcePressure } from "../src/core/strata-resource-policy.js";
import { STRATA_Q4_MODEL_ID } from "../src/core/catalog/models/strata.js";
import { AgentResourcePressure } from "../src/core/strata-agent-resources.js";
import { FileReadResourcePressure } from "../src/core/strata-residency-pressure.js";
const GiB = 1024 ** 3;
const sample = (ram: number, commit = ram, free = 21.5) => ({ memoryAvailableBytes: ram * GiB,
  commitAvailableBytes: commit * GiB, vramAvailableBytes: free * GiB, vramTotalBytes: 24 * GiB });
describe("Strata available-resource admission", () => {
  it.each([33.7, 27.5])("allows %sGiB RAM below full native residency when official file readback is authorized", ram => {
    const resources = sample(ram, 60, 21.7);
    const plan = planStrataResources(resources, 5120, { allowFileReadFallback: true });
    expect(plan).toMatchObject({ hostMode: "resident", requiredMemoryBytes: 6 * GiB, requiredCommitBytes: 6 * GiB, headroomGiB: 6 });
    expect(plan.estimatedResidentMemoryBytes).toBeGreaterThan(ram * GiB);
    expect(applyStrataResourcePlan(["--resident-experts", "--expert-cache", "auto"], plan, "strata/qwen3.8-flash-next-iq3_xxs"))
      .toEqual(["--resident-experts", "--expert-cache", "auto"]);
    expect(() => planStrataResources(resources, 5120)).toThrow("完整专家驻留");
  });
  it("keeps file-tier start reserves, commit, GPU and telemetry guards instead of bypassing admission", () => {
    const options = { allowFileReadFallback: true };
    expect(() => planStrataResources(sample(5.9, 60), 5120, options)).toThrow("文件回读启动预留");
    expect(() => planStrataResources(sample(33.7, 5.9), 5120, options)).toThrow("提交余量");
    expect(planStrataResources(sample(40, 23), 5120, options).requiredCommitBytes).toBe(6 * GiB);
    expect(() => planStrataResources(sample(33.7, 60, 19), 5120, options)).toThrow("空闲显存");
    expect(() => planStrataResources({ ...sample(33.7, 60), commitAvailableBytes: null }, 5120, options)).toThrow("无法确认");
    expect(() => planStrataResources(sample(33.7, 60), 5120, { ...options, commitTrial: true })).toThrow("完整专家驻留");
  });
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
  it.each([FileReadResourcePressure, AgentResourcePressure])("warns without stopping on host pressure in every phase (%s)", Policy => {
    let now = 0; const events: { event: string }[] = [], p = new Policy(() => now, e => events.push(e));
    for (const phase of ["loading", "file", "resident"]) {
      p.setLoading(phase === "loading"); p.setFileRead(phase === "file");
      for (let t = 0; t < 40000; t += 1000) { now += 1000; expect(p.check(sample(.1, 2, 4))).toBeNull(); }
    }
    expect(events.filter(e => e.event === "warning").length).toBe(4);
    expect(p.check(sample(10, 10, 4))).toBeNull(); expect(events.at(-1)?.event).toBe("recovered");
    expect(p.check(sample(2, 5, 1.9))).toContain("2GiB");
    expect(p.check({ ...sample(2, 10, 4), commitAvailableBytes: null })).toContain("监测不可用");
  });
  it("requires fresh sustained severe commit shortage, never RAM alone, and resets on recovery or missing samples", () => {
    let now = 0; const events: { event: string }[] = [], p = new FileReadResourcePressure(() => now, e => events.push(e));
    const critical = sample(.1, .4, 4);
    for (; now < 10000; now += 1000) expect(p.check(critical)).toBeNull();
    expect(p.check(critical)).toContain("持续 10秒低于512MiB"); expect(events.at(-1)?.event).toBe("critical");
    expect(p.check(sample(.1, 2, 4))).toBeNull();
    expect(p.check(critical)).toBeNull(); now += 6000; expect(p.check(critical)).toBeNull();
    now += 4000; expect(p.check(critical)).toBeNull();
    expect(p.check({ ...critical, commitAvailableBytes: null })).toContain("监测不可用");
    now += 4000; expect(p.check(critical)).toBeNull();
    expect(p.knownPressure({ ...critical, vramAvailableBytes: null })).toBeNull();
    now += 1000; expect(p.check(critical)).toBeNull();
    now += 5000; expect(p.check(critical)).toBeNull();
  });
  it("allows an explicit commit measurement trial without changing H3 defaults or RAM/VRAM/floor protections", () => {
    expect(() => planStrataResources(sample(40,45),5120)).toThrow("CUDA 加载预留");
    const trial = planStrataResources(sample(40,45),5120,{commitTrial:true});
    expect(trial.commitTrial).toBe(true); expect(trial.estimatedCommitBytes).toBeGreaterThan(45*GiB);
    expect(trial.requiredCommitBytes).toBe(trial.requiredMemoryBytes);
    expect(() => planStrataResources(sample(31,100),5120,{commitTrial:true})).toThrow("完整专家驻留");
    expect(() => planStrataResources(sample(40,2),5120,{commitTrial:true})).toThrow("提交余量");
    expect(() => planStrataResources(sample(40,45,19),5120,{commitTrial:true})).toThrow("空闲显存");
    expect(strataResourcePressure(sample(40,2))).toBeNull();
  });
  it("uses the whole arena on a sufficiently free 128GB PC, not a fixed 16GB cap", () => {
    expect(planStrataResources(sample(100), 2048)).toMatchObject({hostMode:"arena", vramReserveMiB:5120});
  });
  it("uses the official GPU-complement residency when the full arena does not fit", () => {
    expect(planStrataResources(sample(40,70), 2048).hostMode).toBe("resident");
    expect(planStrataResources(sample(40,45),5120,{allowFileReadFallback:true}).requiredCommitBytes).toBe(6*GiB);
    expect(planStrataResources(sample(40,23),5120,{allowFileReadFallback:true}).hostMode).toBe("resident");
    expect(planStrataResources(sample(100,50),5120,{allowFileReadFallback:true}).hostMode).toBe("resident");
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
    expect(strataResourcePressure(sample(10,2,3))).toBeNull();
  });
  it("never hides a known dangerous value behind an unrelated missing sensor", () => {
    expect(strataResourcePressure({ ...sample(10, 10, 1.9), commitAvailableBytes: null })).toContain("2GiB");
    expect(strataResourcePressure({ ...sample(2, 10), vramAvailableBytes: null })).toContain("监测不可用");
    expect(strataResourcePressure({ ...sample(10, 2), vramAvailableBytes: null })).toContain("监测不可用");
    expect(strataResourcePressure({ ...sample(10), commitAvailableBytes: null })).toContain("监测不可用");
  });
});
