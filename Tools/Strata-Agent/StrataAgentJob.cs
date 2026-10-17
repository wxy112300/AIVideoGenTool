using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
public sealed class StrataAgentJob : IDisposable {
 [StructLayout(LayoutKind.Sequential)] struct Basic { public long ProcessTime, JobTime; public uint Flags; public UIntPtr Min, Max; public uint Active; public UIntPtr Affinity; public uint Priority, Scheduling; }
 [StructLayout(LayoutKind.Sequential)] struct Io { public ulong ReadOp, WriteOp, OtherOp, ReadBytes, WriteBytes, OtherBytes; }
 [StructLayout(LayoutKind.Sequential)] struct Limits { public Basic Basic; public Io Io; public UIntPtr ProcessMemory, JobMemory, PeakProcess, PeakJob; }
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr security, string name);
 [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job, int kind, IntPtr info, uint length);
 [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
 [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr FindWindow(string cls, string title);
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window, int command);
 IntPtr handle;
 public StrataAgentJob() {
  handle=CreateJobObject(IntPtr.Zero,null); if(handle==IntPtr.Zero) throw new Exception("CreateJobObject failed");
  var value=new Limits(); value.Basic.Flags=0x2000; int n=Marshal.SizeOf(value); var buffer=Marshal.AllocHGlobal(n);
  try { Marshal.StructureToPtr(value,buffer,false); if(!SetInformationJobObject(handle,9,buffer,(uint)n)) throw new Exception("Job limits failed"); }
  finally { Marshal.FreeHGlobal(buffer); }
 }
 public void Add(Process process) { if(!AssignProcessToJobObject(handle,process.Handle)) throw new Exception("Cannot supervise child process; refusing startup"); }
 public static Process StartSilent(ProcessStartInfo info) {
  info.UseShellExecute=false; info.CreateNoWindow=true;
  info.RedirectStandardInput=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true;
  var process=new Process(); process.StartInfo=info;
  // Upstream may log prompts or credentials; never forward those streams to launcher logs.
  process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs data) {};
  process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs data) {};
  if(!process.Start()) throw new Exception("Child startup failed");
  process.BeginOutputReadLine(); process.BeginErrorReadLine(); return process;
 }
 public void Dispose() { if(handle!=IntPtr.Zero) { CloseHandle(handle); handle=IntPtr.Zero; } }
}
