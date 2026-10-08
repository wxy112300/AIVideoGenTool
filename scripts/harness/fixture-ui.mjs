import { pollUntil } from "../app-harness.mjs";

export function fixtureUi(client, timeout, report) {
  async function click(selector) {
    report.lastAction = selector;
    await pollUntil(() => client.evaluate(`(() => {
      const b=document.querySelector(${JSON.stringify(selector)});
      return !!b && !b.disabled && b.getClientRects().length>0;
    })()`), Boolean, timeout, `Clickable ${selector}`);
    await client.evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'})`);
    let previous;
    const point=await pollUntil(()=>client.evaluate(`(() => {
      const b=document.querySelector(${JSON.stringify(selector)}),r=b.getBoundingClientRect();
      const x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:r.width,height:r.height,ready:!b.disabled&&b.contains(document.elementFromPoint(x,y))};
    })()`),value=>{
      const current=JSON.stringify(value),stable=value.ready&&current===previous;
      previous=current;
      return stable;
    },timeout,`Stable unobstructed ${selector}`,100);
    const coordinates={x:point.x,y:point.y};
    await client.send("Input.dispatchMouseEvent", {type:"mouseMoved",...coordinates});
    await client.send("Input.dispatchMouseEvent", {type:"mousePressed",...coordinates,button:"left",clickCount:1});
    await client.send("Input.dispatchMouseEvent", {type:"mouseReleased",...coordinates,button:"left",clickCount:1});
  }
  async function openHistory(assetId) {
    await click("button[data-page=history]");
    await click(`[data-open-history="${assetId}"]`);
    await pollUntil(() => client.evaluate("(document.querySelector('.history-player video')?.readyState??0)>=2"),
      Boolean, timeout, "History detail loaded");
  }
  return {click,openHistory};
}
