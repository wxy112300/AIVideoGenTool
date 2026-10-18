// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { mountLanBrowserSettings, renderLanBrowserSettings } from "../src/renderer/pages/settings/lan-browser";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";

afterEach(()=>document.body.replaceChildren());
describe("LAN Settings entry",()=>{
  it("keeps sharing disabled by default and retains the switch/port when saving another tab",()=>{
    const base=createDefaultSettings(); expect(base.lanBrowserEnabled).toBe(false);
    const saved=readSettingsFromForm({...base,lanBrowserEnabled:true,lanBrowserPort:18790},"official-storyboard","faithful");
    expect(saved.lanBrowserEnabled).toBe(true); expect(saved.lanBrowserPort).toBe(18790);
  });
  it("copies the selected LAN URL, opens the local browser through AppApi, and saves the real switch change",async()=>{
    const settings={...createDefaultSettings(),lanBrowserEnabled:true};
    const t=(key:string)=>key;
    document.body.innerHTML=renderLanBrowserSettings(settings,t,s=>s);
    const writeText=vi.fn(async()=>{}),open=vi.fn(async()=>{}),save=vi.fn(async()=>"saved" as const);
    const prior=Object.getOwnPropertyDescriptor(navigator,"clipboard");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    const context={root:document.body,t,notify:vi.fn(),application:{getLanBrowserStatus:async()=>({state:"running",port:8790,localUrl:"http://127.0.0.1:8790/",urls:["http://192.168.1.2:8790/","http://10.0.0.2:8790/"],error:""}),openLanBrowser:open,retryLanBrowser:vi.fn()}} as unknown as RendererContext;
    const dispose=mountLanBrowserSettings(context,{formSettings:()=>({...settings,lanBrowserEnabled:document.querySelector<HTMLInputElement>("#lan-browser-enabled")!.checked}),requestSaveSettings:save});
    try{
      const copy=document.querySelector<HTMLButtonElement>("[data-lan-copy]")!;
      await vi.waitFor(()=>expect(copy.disabled).toBe(false));
      document.querySelector<HTMLSelectElement>("[data-lan-address]")!.value="http://10.0.0.2:8790/";
      copy.click(); document.querySelector<HTMLButtonElement>("[data-lan-open]")!.click();
      expect(writeText).toHaveBeenCalledWith("http://10.0.0.2:8790/"); expect(open).toHaveBeenCalledOnce();
      const field=document.querySelector<HTMLInputElement>("#lan-browser-enabled")!; field.checked=false; field.dispatchEvent(new Event("change"));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({lanBrowserEnabled:false}));
    }finally{dispose(); if(prior)Object.defineProperty(navigator,"clipboard",prior);else Reflect.deleteProperty(navigator,"clipboard");}
  });
});
