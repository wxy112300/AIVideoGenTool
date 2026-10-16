import { afterEach, describe, expect, it, vi } from "vitest";
import { watchStrataResources } from "../electron/services/strata-resources.js";
afterEach(()=>vi.useRealTimers());
describe("Strata resource watcher",()=>{
  it("does not overlap slow probes and does not abort a later operation after disposal",async()=>{
    vi.useFakeTimers(); let resolve!: (value: any)=>void;
    const read=vi.fn(()=>new Promise<any>(done=>{resolve=done})), abort=vi.fn();
    const dispose=watchStrataResources(abort,read,10);
    await vi.advanceTimersByTimeAsync(50);expect(read).toHaveBeenCalledOnce();
    const closing=dispose();resolve({memoryAvailableBytes:0,commitAvailableBytes:0,vramAvailableBytes:0,vramTotalBytes:24*1024**3});
    await closing;expect(abort).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);expect(read).toHaveBeenCalledOnce();
  });
  it("signals pressure or missing monitoring, not a best-effort zero value",async()=>{
    vi.useFakeTimers();const abort=vi.fn();
    const dispose=watchStrataResources(abort,async()=>({memoryAvailableBytes:10*1024**3,commitAvailableBytes:10*1024**3,
      vramAvailableBytes:1.9*1024**3,vramTotalBytes:24*1024**3}),10);
    await vi.advanceTimersByTimeAsync(10);expect(abort.mock.calls[0][0].message).toContain("2GiB");await dispose();
  });
});
