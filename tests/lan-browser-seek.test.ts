// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSeek } from "../src/web/seek";

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });
function fixture() {
  vi.useFakeTimers();
  const range = document.createElement("input"); range.type = "range"; range.max = "1000";
  const video = document.createElement("video"); document.body.append(range, video);
  Object.defineProperties(video, { duration: { value: 20 }, paused: { value: false, configurable: true }, seeking: { value: false, configurable: true } });
  video.pause = vi.fn(); video.play = vi.fn(async () => {});
  range.getBoundingClientRect = () => ({ left: 50, right: 350, width: 300 } as DOMRect);
  const capture = vi.fn(); range.setPointerCapture = capture;
  const paint = vi.fn(), state = vi.fn(); const seek = mountSeek(range, video, paint, state);
  const pointer = (name: string, x: number, id = 1) => {
    const event = new MouseEvent(name, { bubbles: true, cancelable: true, clientX: x, button: 0 });
    Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: id } }); range.dispatchEvent(event);
  };
  return { range, video, pointer, seek, paint, state, capture };
}
describe("LAN progress scrub", () => {
  it("captures a tap anywhere on the rail, follows the finger before seek completes, and commits its exact release point", () => {
    const f = fixture(); f.pointer("pointerdown", 125); expect(f.capture).toHaveBeenCalledWith(1);
    expect(f.range.value).toBe("250"); expect(f.video.pause).toHaveBeenCalledOnce();
    f.pointer("pointermove", 275); expect(f.range.value).toBe("750");
    expect(f.paint).toHaveBeenLastCalledWith(15);
    f.pointer("pointerup", 290); expect(f.video.currentTime).toBe(16); expect(f.video.play).toHaveBeenCalledOnce();
    expect(f.state).toHaveBeenLastCalledWith(false);
  });
  it("coalesces move seeks, does not flood a busy decoder, and always commits the last value", () => {
    const f = fixture(); let seeks = 0, time = 0;
    Object.defineProperty(f.video, "currentTime", { get: () => time, set: (v) => { seeks++; time = v; } });
    f.pointer("pointerdown", 80);
    for (let x = 90; x < 250; x++) f.pointer("pointermove", x);
    vi.advanceTimersByTime(20); expect(seeks).toBe(1);
    Object.defineProperty(f.video, "seeking", { value: true, configurable: true });
    f.pointer("pointermove", 300); vi.advanceTimersByTime(20); expect(seeks).toBe(1);
    f.pointer("pointerup", 320); expect(seeks).toBe(2); expect(time).toBe(18);
  });
  it("keeps a paused clip paused and clamps drags beyond the control", () => {
    const f = fixture(); Object.defineProperty(f.video, "paused", { value: true });
    f.pointer("pointerdown", 100); f.pointer("pointermove", 500); f.pointer("pointerup", 500);
    expect(f.video.currentTime).toBe(20); expect(f.video.play).not.toHaveBeenCalled();
  });
  it("continues progress updates while keyboard focus remains on the slider", () => {
    const f = fixture(); f.range.focus(); f.video.currentTime = 7.5; f.seek.sync();
    expect(f.range.value).toBe("375"); expect(f.range.style.getPropertyValue("--progress")).toBe("37.5%");
    f.range.value = "625"; f.range.dispatchEvent(new Event("input")); expect(f.video.currentTime).toBe(12.5);
    f.video.currentTime = 14; f.seek.sync(); expect(f.range.value).toBe("700");
  });
  it("ignores another pointer and cancels an old drag before a different video is shown", () => {
    const f = fixture(); f.pointer("pointerdown", 100); f.pointer("pointermove", 300, 2); expect(Number(f.range.value)).toBeCloseTo(1000 / 6);
    f.seek.cancel(); f.video.currentTime = 0; f.pointer("pointerup", 300); vi.runAllTimers();
    expect(f.video.currentTime).toBe(0); expect(f.video.play).not.toHaveBeenCalled();
  });
});
