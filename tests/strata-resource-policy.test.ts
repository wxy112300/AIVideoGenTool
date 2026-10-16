import { describe, expect, it } from "vitest";
import { planStrataResources, strataResourcePressure } from "../src/core/strata-resource-policy.js";
const GiB = 1024 ** 3;
const sample = (ram: number, commit = ram, free = 21.5) => ({ memoryAvailableBytes: ram * GiB,
  commitAvailableBytes: commit * GiB, vramAvailableBytes: free * GiB, vramTotalBytes: 24 * GiB });
describe("Strata available-resource admission", () => {
  it("uses the whole arena on a sufficiently free 128GB PC, not a fixed 16GB cap", () => {
    expect(planStrataResources(sample(100), 2048)).toMatchObject({hostMode:"arena", vramReserveMiB:5120});
  });
  it("uses the official GPU-complement residency when the full arena does not fit", () => {
    expect(planStrataResources(sample(40,70), 2048).hostMode).toBe("resident");
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
});
