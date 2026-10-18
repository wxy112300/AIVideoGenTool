// Close only CPU-only fixtures created by lan-browser-smoke; never kill a process.
import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { AppCdpClient, connectApp, pollUntil } from "../app-harness.mjs";
const root=path.resolve(import.meta.dirname,"../..");
const directory=path.resolve(process.argv[2]??"");
if(!/^lan-smoke-[^\\/]+$/.test(path.relative(path.join(root,"temp"),directory)))throw Error("Expected a local LAN smoke fixture");
const manifest=JSON.parse(await fs.readFile(path.join(directory,"launch.json"),"utf8"));
if(manifest.evidence!=="isolated-real-app-and-browser"||path.resolve(manifest.directory)!==directory)throw Error("Mismatched fixture");
if(!Number.isSafeInteger(manifest.appPid)||manifest.appPid<1||[manifest.port,manifest.webPort,manifest.browserPort].some(p=>!Number.isInteger(p)||p<1||p>65535))throw Error("Invalid fixture PID/ports");
const execute=promisify(execFile);
const cleanup={browser:false,app:false,native:false,listenerClosed:false};
try{
  const targets=await(await fetch(`http://127.0.0.1:${manifest.browserPort}/json/list`)).json();
  for(const t of targets.filter(t=>t.type==="page"&&t.url.startsWith(`http://127.0.0.1:${manifest.webPort}/`))){
    const c=new AppCdpClient(t.webSocketDebuggerUrl);await c.connect();
    await c.evaluate("setTimeout(()=>window.close(),50)");c.close();cleanup.browser=true;
  }
}catch{cleanup.browser=true;}
let client;
try{
  client=await connectApp({port:manifest.port,timeout:3000,target:""});
  const idle=await client.evaluate(`window.studio.getState().then(s=>s.queue.length===0&&!s.queueRunning&&s.settings.comfyUrl==='http://192.0.2.1:9')`);
  if(!idle)throw Error("Fixture is not the expected idle remote-only app");
  const userData=path.join(directory,"user-data");
  const env={...process.env}; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
  for(const key of ["APPDATA","LOCALAPPDATA","TEMP","TMP"])env[key]=path.join(directory,key.toLowerCase());
  // Existing second-instance behavior makes the same profile's hidden window visible.
  const child=spawn(createRequire(import.meta.url)("electron"),[`--user-data-dir=${userData}`,root],{cwd:root,env,windowsHide:true,stdio:"ignore"});child.unref();
  const identity=await execute("powershell.exe",["-NoProfile","-Command",`Get-CimInstance Win32_Process -Filter 'ProcessId = ${manifest.appPid}' | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`]);
  const processInfo=JSON.parse(identity.stdout);
  if(!processInfo.CommandLine.toLowerCase().includes(userData.toLowerCase()))throw Error("Owned PID does not match fixture profile");
  await pollUntil(async()=>{
    const result=await execute("powershell.exe",["-NoProfile","-Command",`$p=Get-Process -Id ${manifest.appPid}; [bool]($p.MainWindowHandle -ne 0 -and $p.MainWindowTitle -like 'Local Video Studio*')`]);return result.stdout.trim()==="True";
  },Boolean,15000,"Owned visible native window");
  const result=await execute("powershell.exe",["-NoProfile","-Command",`$p=Get-Process -Id ${manifest.appPid}; if($p.MainWindowHandle -eq 0 -or $p.MainWindowTitle -notlike 'Local Video Studio*'){throw 'Window identity changed'}; $p.CloseMainWindow()`]);
  if(result.stdout.trim()!=="True")throw Error("Native close request failed");
  cleanup.native=true;
  await pollUntil(async()=>{try{process.kill(manifest.appPid,0);return false;}catch(error){if(error.code==="ESRCH")return true;throw error;}},Boolean,20000,"Owned app exit");
  cleanup.app=true;
}catch(error){
  if(!client&&error.message.includes("fetch failed"))cleanup.app=true;
  else throw error;
}finally{client?.close();}
try{await fetch(`http://127.0.0.1:${manifest.webPort}/`);throw Error("LAN listener remains open");}catch(error){if(error.message==="LAN listener remains open")throw error;cleanup.listenerClosed=true;}
await fs.writeFile(path.join(directory,"cleanup.json"),JSON.stringify(cleanup,null,2));
console.log(JSON.stringify(cleanup));
