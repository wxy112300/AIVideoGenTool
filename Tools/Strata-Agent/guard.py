"""Pinned Strata adapter. Never edits the shared installation or implements an Agent harness."""
import ctypes
import json
import os
from pathlib import Path
import subprocess
import sys
import time


def check_admission(filename):
    admission = json.loads(Path(filename).read_text(encoding="utf-8"))
    if not admission.get("enabled") or time.time() * 1000 - admission["sampledAt"] > 8000:
        raise RuntimeError("Launcher admission is absent or stale; use the launcher to restart")
    import psutil
    owner = json.loads(Path(admission["leaseFile"]).read_text(encoding="utf-8"))
    pid = owner["process"]["pid"]
    if owner["epoch"] != admission["epoch"] or pid != admission["controllerPid"]:
        raise RuntimeError("GPU lease no longer belongs to this launcher")
    identity = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command",
        f"$p=Get-CimInstance Win32_Process -Filter 'ProcessId={int(pid)}'; if($p){{$p.CreationDate.ToUniversalTime().Ticks}}"],
        capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW, check=True).stdout.strip()
    if identity != owner["process"]["started"]:
        raise RuntimeError("Controller process identity changed")

    class MemoryStatus(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong) for name in ("totalPhys", "availPhys", "totalPage", "availPage", "totalVirtual", "availVirtual", "availExtended")]

    memory = MemoryStatus()
    memory.length = ctypes.sizeof(memory)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(memory)):
        raise RuntimeError("Windows commit telemetry unavailable")
    gpu = subprocess.run(["nvidia-smi.exe", "--query-gpu=memory.free", "--format=csv,noheader,nounits"],
        capture_output=True, text=True, timeout=5, check=True, creationflags=subprocess.CREATE_NO_WINDOW)
    # First version deliberately supports the measured single-adapter policy only.
    lines = gpu.stdout.strip().splitlines()
    if len(lines) != 1:
        raise RuntimeError("Single GPU admission required; multi-adapter policy unverified")
    limits = admission["limits"]
    if min(psutil.virtual_memory().available, memory.availPhys) < limits["requiredMemoryBytes"] or memory.availPage < limits["requiredCommitBytes"] or int(lines[0]) * 1024**2 < limits["minimumFreeVramBytes"]:
        raise RuntimeError("Fresh RAM / Windows commit / VRAM headroom is below the admitted loading budget")


def serve(install, args):
    sys.path.insert(0, install)
    from serve import server
    original = server.make_handler

    def make_handler(svc):
        parent = original(svc)

        class Guarded(parent):
            def _post(self):
                route = self.path.split("?", 1)[0].rstrip("/")
                if route in ("/config", "/v1/vram") or route.startswith("/mcp"):
                    if self._authorized():
                        self.close_connection = True
                        self._json(409, {"error": {"message": "Resource/config changes belong to the launcher; native load/unload and sampling remain available. Native MCP is disabled; Claude owns tools."}})
                    return
                return super()._post()

        return Guarded

    server.make_handler = make_handler
    sys.argv = [str(Path(install) / "serve" / "server.py"), *args]
    return server.main()


if __name__ == "__main__":
    if sys.argv[1] == "--check":
        try:
            check_admission(sys.argv[2])
        except Exception:
            print("Agent cold-load admission refused; inspect launcher resource status", file=sys.stderr)
            sys.exit(1)
    elif sys.argv[1] == "--serve":
        sys.exit(serve(sys.argv[2], sys.argv[3:]))
    else:
        sys.exit(2)
