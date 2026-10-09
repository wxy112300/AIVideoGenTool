"""Read-only safety gate before the official controller creates a revision.

The sampler, graph identity, compatibility checks and tensor loading remain
official. Only app receipt-linked calls carry an expected accepted prefix.
The controller calls this hook under its own Run lock, before manifest writes.
"""

import importlib
import json
import logging
import re
import sys
from functools import wraps
from pathlib import Path


def install_registered_managed_prefix_guard(registry):
    # Run Storage is imported lazily by the official sampler. Import the exact
    # registered package first, rather than guarding only our bridge namespace.
    sampler = registry["H3ContinuumSamplerV38"]
    package, separator, _ = sampler.__module__.rpartition(".v3.")
    if not separator:
        raise RuntimeError("unsupported registered Continuum sampler namespace")
    storage = importlib.import_module(f"{package}.run_storage")
    modules = [storage] + [
        module for module in tuple(sys.modules.values())
        if isinstance(getattr(module, "__file__", None), str)
        and tuple(part.casefold() for part in Path(module.__file__).parts[-2:])
        == ("comfyui-h3-continuum", "run_storage.py")
    ]
    for module in modules:
        install_managed_prefix_guard(module)


def _expectation(controller):
    graph = controller.prompt_graph or {}
    matches = []
    for node in graph.values():
        if not isinstance(node, dict) or node.get("class_type") != "LocalVideoStudioH3ContinuumManagedReceipt":
            continue
        inputs = node.get("inputs") or {}
        if inputs.get("status") == [controller.sampler_node_id, 3]:
            matches.append(inputs)
    if not matches:
        return None
    if len(matches) != 1:
        raise ValueError("Continuum managed prefix guard: ambiguous receipt")
    inputs = matches[0]
    if "expected_prefix_chunks" not in inputs or "expected_parent_revision_id" not in inputs:
        raise ValueError("Continuum managed prefix guard: missing queued prefix expectation; update the application")
    count = inputs["expected_prefix_chunks"]
    head = inputs["expected_parent_revision_id"]
    if type(count) is not int or count < 0 or not isinstance(head, str) or (count > 0 and not head):
        raise ValueError("Continuum managed prefix guard: invalid queued prefix expectation")
    if str(inputs.get("run_name", "")) != controller.run_name:
        raise ValueError("Continuum managed prefix guard: Run identity changed")
    return count, head


def install_managed_prefix_guard(module):
    """Wrap each loaded official module once; never patch upstream files."""
    controller_type = module.RunStorageController
    original = controller_type._load_validated_review_prefix
    if getattr(original, "_local_video_studio_prefix_guard", False):
        return

    @wraps(original)
    def guarded(controller, contract, *, resume_safe):
        expected = _expectation(controller)
        if expected:
            logging.info("Local Video Studio prefix guard: sampler=%s accepted=%s", controller.sampler_node_id, expected[0])
        if expected and expected[0] > 0:
            count, head = expected
            project = json.loads((controller.run_root / "project.json").read_text(encoding="utf-8"))
            if project.get("canonical_storage_revision_id") != head:
                raise ValueError("Continuum managed prefix guard: selected History head is no longer current; reopen the latest accepted version")
        prefix = original(controller, contract, resume_safe=resume_safe)
        if expected and expected[0] > 0:
            count, head = expected
            candidate = controller.review_head or {}
            if not resume_safe or candidate.get("revision_id") != head or len(prefix.records) != count:
                details = "; ".join(controller.notes[-3:])
                raise ValueError(
                    "Continuum managed prefix guard: selected accepted prefix is incompatible with the current sampling contract; "
                    "Run head and accepted files were not changed. Restore the original runtime/settings or choose another compatible source. "
                    + details
                )
        return prefix

    guarded._local_video_studio_prefix_guard = True
    controller_type._load_validated_review_prefix = guarded


def read_sampling_evidence(revision_root, revision_id):
    """Read actual writer facts. Keep v5 readable, without making it reusable."""
    manifest = json.loads((Path(revision_root) / "manifest.json").read_text(encoding="utf-8"))
    version = manifest.get("sampling_contract_version")
    digest = manifest.get("contract_sha256")
    safe = manifest.get("resume_safe")
    if type(version) is not int or version not in (5, 6) or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest) or type(safe) is not bool:
        raise ValueError("managed receipt manifest sampling evidence invalid")
    if manifest.get("revision_id") != revision_id:
        raise ValueError("managed receipt manifest revision changed")
    return {"sampling_contract_version": version, "contract_sha256": digest, "resume_safe": safe}
