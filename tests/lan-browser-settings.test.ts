// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultSettings } from "../src/core/defaults";
import type { RendererContext } from "../src/renderer/contracts";
import { mountLanBrowserSettings, renderLanBrowserSettings } from "../src/renderer/pages/settings/lan-browser";
import { readSettingsFromForm } from "../src/renderer/pages/settings/form";
import { uiKeys } from "../src/core/i18n-keys";

afterEach(()=>document.body.replaceChildren());
describe("LAN Settings entry",()=>{
  it("omits redundant status/retry UI and rolls a failed start back to the same switch",async()=>{
    const settings=createDefaultSettings(),t=(key:string)=>key;
    document.body.innerHTML=renderLanBrowserSettings(settings,t,s=>s);
    expect(document.body.textContent).not.toContain(uiKeys.lanBrowser.saveHint);
    expect(document.querySelector<HTMLInputElement>("#lan-browser-port")!.value).toBe(String(settings.lanBrowserPort));
    const row=document.querySelector<HTMLElement>("[data-lan-status-row]")!;
    expect(row.hidden).toBe(true);
    const getStatus=vi.fn(async()=>({state:"off",port:8790,localUrl:"",urls:[] as string[],error:""}));
    const context={root:document.body,t,notify:vi.fn(),application:{getLanBrowserStatus:getStatus}} as unknown as RendererContext;
    const save=vi.fn(async()=>"saved" as const);
    const dispose=mountLanBrowserSettings(context,{formSettings:()=>settings,requestSaveSettings:save});
    try{
      await vi.waitFor(()=>expect(document.querySelector("[data-lan-status]")!.textContent).toBe(""));
      expect(row.hidden).toBe(true);
      expect(document.body.textContent).not.toContain(uiKeys.lanBrowser.off);
      getStatus.mockResolvedValue({state:"error",port:8790,localUrl:"",urls:[],error:"Port in use"});
      const field=document.querySelector<HTMLInputElement>("#lan-browser-enabled")!;field.checked=true;field.dispatchEvent(new Event("change"));
      await vi.waitFor(()=>expect(context.notify).toHaveBeenCalledWith("Port in use",expect.objectContaining({kind:"error"})));
      expect(row.hidden).toBe(true);expect(field.checked).toBe(false);
      expect(save).toHaveBeenLastCalledWith(expect.objectContaining({lanBrowserEnabled:false}));
      expect(document.querySelector("[data-lan-retry]")).toBeNull();
    }finally{dispose();}
  });
  it("keeps sharing disabled by default and retains the switch/port when saving another tab",()=>{
    const base=createDefaultSettings(); expect(base.lanBrowserEnabled).toBe(false);
    const saved=readSettingsFromForm({...base,lanBrowserEnabled:true,lanBrowserPort:18790},"official-storyboard","faithful");
    expect(saved.lanBrowserEnabled).toBe(true); expect(saved.lanBrowserPort).toBe(18790);
  });
  it("shows each LAN URL in a readonly textbox with inline copy/open actions, and saves the real switch change",async()=>{
    const settings={...createDefaultSettings(),lanBrowserEnabled:true};
    const t=(key:string)=>key;
    document.body.innerHTML=renderLanBrowserSettings(settings,t,s=>s);
    const writeText=vi.fn(async()=>{}),open=vi.fn(async()=>{}),save=vi.fn(async()=>"saved" as const);
    const prior=Object.getOwnPropertyDescriptor(navigator,"clipboard");
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    const context={root:document.body,t,notify:vi.fn(),application:{getLanBrowserStatus:async()=>({state:"running",port:8790,localUrl:"http://127.0.0.1:8790/",urls:["http://192.168.1.2:8790/","http://10.0.0.2:8790/"],error:""}),openLanBrowser:open,retryLanBrowser:vi.fn()}} as unknown as RendererContext;
    const dispose=mountLanBrowserSettings(context,{formSettings:()=>({...settings,lanBrowserEnabled:document.querySelector<HTMLInputElement>("#lan-browser-enabled")!.checked}),requestSaveSettings:save});
    try{
      await vi.waitFor(()=>expect(document.querySelector<HTMLButtonElement>("[data-lan-copy]")!.disabled).toBe(false));
      const fields=[...document.querySelectorAll<HTMLInputElement>("input[data-lan-address]")];
      expect(document.querySelector<HTMLElement>("[data-lan-status-row]")!.hidden).toBe(true);
      expect(document.querySelector("[data-lan-retry]")).toBeNull();
      expect(document.querySelector<HTMLElement>("[data-lan-addresses]")!.hidden).toBe(false);
      expect(fields.map(field=>field.value)).toEqual(["http://192.168.1.2:8790/","http://10.0.0.2:8790/"]);
      expect(fields.every(field=>field.readOnly)).toBe(true);
      const row=fields[1]!.closest("[data-lan-address-row]")!;
      row.querySelector<HTMLButtonElement>("[data-lan-copy]")!.click(); row.querySelector<HTMLButtonElement>("[data-lan-open]")!.click();
      expect(writeText).toHaveBeenCalledWith("http://10.0.0.2:8790/"); expect(open).toHaveBeenCalledOnce();
      const field=document.querySelector<HTMLInputElement>("#lan-browser-enabled")!; field.checked=false; field.dispatchEvent(new Event("change"));
      expect(save).toHaveBeenCalledWith(expect.objectContaining({lanBrowserEnabled:false}));
    }finally{dispose(); if(prior)Object.defineProperty(navigator,"clipboard",prior);else Reflect.deleteProperty(navigator,"clipboard");}
  });
  it("reports status-query failure without stopping a healthy listener, then hides stale addresses on stop",async()=>{
    const settings={...createDefaultSettings(),lanBrowserEnabled:true},t=(key:string)=>key;
    document.body.innerHTML=renderLanBrowserSettings(settings,t,s=>s);
    const current={state:"running",port:8790,localUrl:"http://127.0.0.1:8790/",urls:["http://192.168.1.2:8790/"],error:""};
    const status=vi.fn(async()=>({...current}));
    const context={root:document.body,t,notify:vi.fn(),application:{getLanBrowserStatus:status}} as unknown as RendererContext;
    const dispose=mountLanBrowserSettings(context,{formSettings:()=>settings,requestSaveSettings:vi.fn(async()=>"saved" as const)});
    const row=document.querySelector<HTMLElement>("[data-lan-status-row]")!,addresses=document.querySelector<HTMLElement>("[data-lan-addresses]")!;
    const refresh=()=>document.querySelector<HTMLInputElement>("#lan-browser-enabled")!.dispatchEvent(new Event("change"));
    try{
      await vi.waitFor(()=>expect(addresses.hidden).toBe(false));
      status.mockRejectedValueOnce(new Error("status unavailable"));refresh();
      await vi.waitFor(()=>expect(context.notify).toHaveBeenCalledWith(uiKeys.lanBrowser.error,expect.objectContaining({kind:"error"})));expect(addresses.hidden).toBe(true);expect(row.hidden).toBe(true);
      expect(document.querySelector<HTMLInputElement>("#lan-browser-enabled")!.checked).toBe(true);
      refresh();await vi.waitFor(()=>expect(addresses.hidden).toBe(false));expect(row.hidden).toBe(true);
      current.urls=[];refresh();await vi.waitFor(()=>expect(addresses.hidden).toBe(true));expect(row.textContent).toContain(uiKeys.lanBrowser.noAddress);
      current.state="off";refresh();await vi.waitFor(()=>expect(row.hidden).toBe(true));expect(addresses.hidden).toBe(true);
    }finally{dispose();}
  });
});
