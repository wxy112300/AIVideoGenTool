"""Read-only, process-owned telemetry. No CUDA context, model, WMI or subprocess per sample."""
import ctypes
import json
import os
from pathlib import Path
import sys


class MemoryStatus(ctypes.Structure):
    _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
        (name, ctypes.c_ulonglong) for name in
        ("totalPhys", "availPhys", "totalPage", "availPage", "totalVirtual", "availVirtual", "extended")]


class GpuMemory(ctypes.Structure):
    _fields_ = [(name, ctypes.c_ulonglong) for name in ("total", "free", "used")]


class Resources:
    def __init__(self):
        self.nvml = None

    def gpu(self):
        if self.nvml is None:
            candidates = [Path(os.environ["SystemRoot"]) / "System32" / "nvml.dll"]
            for env in ("ProgramW6432", "ProgramFiles"):
                if os.environ.get(env):
                    candidates.append(Path(os.environ[env]) / "NVIDIA Corporation" / "NVSMI" / "nvml.dll")
            filename = next((p for p in candidates if p.is_file()), None)
            if filename is None:
                raise RuntimeError("nvml-unavailable")
            # NVML's public C ABI uses cdecl, including on Windows.
            dll = ctypes.CDLL(str(filename))
            self.check(dll.nvmlInit_v2())
            self.nvml = dll
        count = ctypes.c_uint()
        self.check(self.nvml.nvmlDeviceGetCount_v2(ctypes.byref(count)))
        if count.value != 1:
            raise RuntimeError("single-gpu-required")
        handle = ctypes.c_void_p()
        self.check(self.nvml.nvmlDeviceGetHandleByIndex_v2(ctypes.c_uint(0), ctypes.byref(handle)))
        memory = GpuMemory()
        self.check(self.nvml.nvmlDeviceGetMemoryInfo(handle, ctypes.byref(memory)))
        if not 0 <= memory.free <= memory.total or not memory.total:
            raise RuntimeError("invalid-gpu-memory")
        return memory

    @staticmethod
    def check(code):
        if code != 0:
            raise RuntimeError("nvml-unavailable")

    def read(self):
        result = {"memoryAvailableBytes": None, "commitAvailableBytes": None,
                  "vramAvailableBytes": None, "vramTotalBytes": None, "probeIssues": []}
        memory = MemoryStatus()
        memory.length = ctypes.sizeof(memory)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
            result.update(memoryAvailableBytes=memory.availPhys, commitAvailableBytes=memory.availPage)
        else:
            result["probeIssues"].append({"source": "windows-commit", "kind": "invalid", "durationMs": 0})
        try:
            gpu = self.gpu()
            result.update(vramAvailableBytes=gpu.free, vramTotalBytes=gpu.total)
        except Exception:
            result["probeIssues"].append({"source": "gpu-memory", "kind": "unavailable", "durationMs": 0})
        return result

    def close(self):
        if self.nvml is not None:
            self.nvml.nvmlShutdown()


if __name__ == "__main__":
    resources = Resources()
    try:
        for line in sys.stdin:
            try:
                request = json.loads(line)
                print(json.dumps({"id": request["id"], "resources": resources.read()}), flush=True)
            except Exception:
                print(json.dumps({"error": "resource-protocol-failed"}), flush=True)
    finally:
        resources.close()
