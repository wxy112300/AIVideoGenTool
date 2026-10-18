// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountWatchGestures } from "../src/web/gestures";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function fixture() {
  const root = document.createElement("section"); document.body.append(root);
  root.getBoundingClientRect = () => ({ left:0, right:400, top:0, bottom:800, width:400, height:800, x:0, y:0, toJSON(){} });
  const actions = { tap:vi.fn(), move:vi.fn(), speed:vi.fn() };
  const dispose=mountWatchGestures(root,actions);
  const pointer=(name:string,x:number,y:number,target:Element=root)=>{
    const event=new MouseEvent(name,{bubbles:true,clientX:x,clientY:y,button:0});
    Object.defineProperties(event,{isPrimary:{value:true},pointerId:{value:1}}); target.dispatchEvent(event);
  };
  return { root,actions,dispose,pointer };
}
describe("watch touch arbitration",()=>{
  it("distinguishes center/outer taps and vertical swipes without also toggling playback",()=>{
    const f=fixture();
    f.pointer("pointerdown",200,400); f.pointer("pointerup",200,400);
    f.pointer("pointerdown",80,200); f.pointer("pointerup",80,200);
    expect(f.actions.tap.mock.calls).toEqual([[true],[false]]);
    f.pointer("pointerdown",200,650); f.pointer("pointermove",200,350); f.pointer("pointerup",200,350);
    expect(f.actions.move).toHaveBeenCalledWith(1); expect(f.actions.tap).toHaveBeenCalledTimes(2);
    f.dispose();
  });
  it("always releases temporary speed on pointer cancellation, blur and disposal",()=>{
    vi.useFakeTimers(); const f=fixture();
    f.pointer("pointerdown",200,400); vi.advanceTimersByTime(350);
    expect(f.actions.speed).toHaveBeenLastCalledWith(true);
    f.pointer("pointercancel",200,400); expect(f.actions.speed).toHaveBeenLastCalledWith(false);
    f.pointer("pointerdown",200,400); vi.advanceTimersByTime(350); window.dispatchEvent(new Event("blur"));
    expect(f.actions.speed).toHaveBeenLastCalledWith(false);
    f.pointer("pointerdown",200,400); vi.advanceTimersByTime(350); f.dispose();
    expect(f.actions.speed).toHaveBeenLastCalledWith(false); expect(f.actions.tap).not.toHaveBeenCalled();
  });
  it("leaves controls and the native browser edge outside playback gestures",()=>{
    vi.useFakeTimers(); const f=fixture(); const button=document.createElement("button"); f.root.append(button);
    f.pointer("pointerdown",200,400,button); f.pointer("pointerup",200,400,button);
    f.pointer("pointerdown",5,400); f.pointer("pointerup",5,400);
    vi.advanceTimersByTime(1000);
    expect(f.actions.tap).not.toHaveBeenCalled(); expect(f.actions.speed).not.toHaveBeenCalled(); f.dispose();
  });
  it("ignores a delayed capture loss belonging to another pointer",()=>{
    vi.useFakeTimers(); const f=fixture();
    f.pointer("pointerdown",200,400); vi.advanceTimersByTime(350);
    const event=new Event("lostpointercapture"); Object.defineProperty(event,"pointerId",{value:999}); f.root.dispatchEvent(event);
    expect(f.actions.speed.mock.calls).toEqual([[true]]); f.dispose();
    expect(f.actions.speed).toHaveBeenLastCalledWith(false);
  });
  it("leaves the iOS Home indicator region outside taps, holds and feed swipes",()=>{
    vi.useFakeTimers(); const f=fixture(); f.root.style.setProperty("--watch-safe-bottom","34px");
    f.pointer("pointerdown",200,780); vi.advanceTimersByTime(500); f.pointer("pointerup",200,780);
    f.pointer("pointerdown",200,780); f.pointer("pointermove",200,400); f.pointer("pointerup",200,400);
    expect(f.actions.tap).not.toHaveBeenCalled(); expect(f.actions.speed).not.toHaveBeenCalled(); expect(f.actions.move).not.toHaveBeenCalled();
    f.pointer("pointerdown",200,740); f.pointer("pointerup",200,740);
    expect(f.actions.tap).toHaveBeenCalledOnce(); f.dispose();
  });
});
