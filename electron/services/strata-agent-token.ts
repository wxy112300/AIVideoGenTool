import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { privateLocalDirectory } from "./private-local-state.js";
const exec = promisify(execFile);

/** CurrentUser DPAPI + private ACL. No token in argv, URLs, logs or plaintext preferences. */
export async function agentToken(directory: string): Promise<string> {
  if (process.platform !== "win32") throw new Error("Agent token 当前仅支持 Windows CurrentUser DPAPI。");
  await privateLocalDirectory(directory);
  const filename = path.join(directory, "token.dpapi");
  const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
  const script = `$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Security; $f=${literal(filename)}; ` +
    "if(!(Test-Path -LiteralPath $f)){ $b=New-Object byte[] 32; $r=[Security.Cryptography.RandomNumberGenerator]::Create(); $r.GetBytes($b); $r.Dispose(); " +
    "$c=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); " +
    "$s=[IO.File]::Open($f,[IO.FileMode]::CreateNew); try{$s.Write($c,0,$c.Length)}finally{$s.Dispose()} }; " +
    "$v=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($f),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); " +
    "[BitConverter]::ToString($v).Replace('-','').ToLowerInvariant()";
  const { stdout } = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(script, "utf16le").toString("base64")], { windowsHide: true, timeout: 10_000 });
  const token = stdout.trim();
  if (!/^[a-f0-9]{64}$/u.test(token)) throw new Error("本机 token 读取失败。");
  return token;
}
