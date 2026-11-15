/** Upstream GENI splits its picture-file argument at whitespace. Keep DSI files
 * outside the spaced app-data path; do not change model packs or installed source. */
export const deepSeekServerBootstrap = String.raw`
import atexit, os, runpy, shutil, sys, tempfile
from pathlib import Path
from serve.ds_pictures import DsPictures
from serve import frontend as _frontend

# This GGUF template defaults thinking off. Upstream effort_kwargs names a
# level, but omits enable_thinking=True (Qwen's template defaults it on).
_original_effort_kwargs = _frontend.effort_kwargs

def _effort_kwargs(value):
    kwargs = _original_effort_kwargs(value)
    if "reasoning_effort" in kwargs:
        kwargs["enable_thinking"] = True
    return kwargs

_frontend.effort_kwargs = _effort_kwargs

_original_init = DsPictures.__init__

def _init_pictures(self, *args, **kwargs):
    _original_init(self, *args, **kwargs)
    if not any(c.isspace() for c in os.path.abspath(self.dir)):
        return
    parents = [tempfile.gettempdir(), os.getcwd()]
    if os.name == "nt":
        import ctypes
        short = ctypes.create_unicode_buffer(32768)
        if ctypes.windll.kernel32.GetShortPathNameW(tempfile.gettempdir(), short, len(short)):
            parents.insert(0, short.value)
        parents.append(os.environ.get("SystemDrive", "C:") + os.sep)
    for parent in parents:
        if any(c.isspace() for c in os.path.abspath(parent)):
            continue
        try:
            directory = tempfile.mkdtemp(prefix="lvs-ds-pictures-", dir=parent)
        except OSError:
            continue
        self.dir = Path(directory)
        atexit.register(shutil.rmtree, directory, ignore_errors=True)
        return
    raise ValueError("DeepSeek GENI needs a writable picture temporary directory without whitespace")

DsPictures.__init__ = _init_pictures
sys.argv[0] = "serve.server"
runpy.run_module("serve.server", run_name="__main__")
`;
