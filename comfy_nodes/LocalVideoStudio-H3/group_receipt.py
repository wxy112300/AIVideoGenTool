"""App checkpoint evidence for one official Review physical group.

Separate from the legacy complete-prefix receipt. Sampling and group layout
remain official; this module reads their committed manifest without modifying it.
"""

import hashlib
import json
from pathlib import Path
import re


def _integer(value, name, minimum=0, maximum=16):
    if type(value) is not int or not minimum <= value <= maximum:
        raise ValueError(f"group receipt {name} invalid")
    return value


def _identifier(value, name):
    if not isinstance(value, str) or value in (".", "..") or not re.fullmatch(r"[A-Za-z0-9._-]{1,200}", value):
        raise ValueError(f"group receipt {name} invalid")
    return value


def read_group_receipt(*, status, assembly_plan, run_name, project_id,
                       planned_chunks, expected_prefix_chunks, expected_parent_revision_id,
                       execution_id, step_id, attempt_id, output_root, upstream):
    """Read one sealed official revision, verifying every registered payload."""
    planned = _integer(planned_chunks, "planned_chunks", 1)
    before = _integer(expected_prefix_chunks, "expected_prefix_chunks")
    if before >= planned:
        raise ValueError("group receipt expected prefix already complete")
    for value, name in ((run_name, "run_name"), (project_id, "project_id"),
                        (execution_id, "execution_id"), (step_id, "step_id"), (attempt_id, "attempt_id")):
        _identifier(value, name)
    if before:
        _identifier(expected_parent_revision_id, "expected_parent_revision_id")
    elif expected_parent_revision_id != "":
        raise ValueError("group receipt new Run cannot have a parent")

    summaries = re.findall(r"^Run Storage:\s*([^/]+?)\s*/\s*revision\s+([A-Za-z0-9._-]+);\s*(\d+) reused,\s*(\d+) generated,\s*(\d+) total;", str(status), re.M)
    paths = re.findall(r"^Run Storage path:\s*(.+)$", str(status), re.M)
    if len(summaries) != 1 or len(paths) != 1:
        raise ValueError("group receipt needs one detailed official status")
    name, revision, reused, generated, total = summaries[0]
    if name.strip() != run_name or int(total) != planned or int(reused) != before:
        raise ValueError("group receipt official status differs from frozen request")
    root = Path(paths[0].strip()).resolve()
    allowed = [Path(output_root).resolve() / sub / "runs" / run_name / "revisions" / revision
               for sub in ("h3_continuum", "h3-continuum")]
    if root not in [path.resolve() for path in allowed]:
        raise ValueError("group receipt revision outside the selected Run output")
    manifest_path = root / "manifest.json"
    original = manifest_path.read_bytes()
    manifest = json.loads(original)
    project_path = root.parent.parent / "project.json"
    project_original = project_path.read_bytes()
    if json.loads(project_original).get("canonical_storage_revision_id") != revision:
        raise ValueError("group receipt canonical head changed after sampling")
    from .managed_prefix_guard import read_sampling_evidence
    evidence = read_sampling_evidence(root, revision)
    if evidence["sampling_contract_version"] != 6 or not evidence["resume_safe"]:
        raise ValueError("group receipt requires reusable v6 sampling evidence")
    if manifest.get("run_storage_schema_version") != 3 or manifest.get("revision_id") != revision:
        raise ValueError("group receipt manifest schema/revision mismatch")
    if manifest.get("run_name") != run_name:
        raise ValueError("group receipt manifest Run identity mismatch")
    contract = manifest.get("contract") or {}
    if contract.get("chunk_count") != planned:
        raise ValueError("group receipt manifest layout changed")
    records = manifest.get("chunks")
    if not isinstance(records, list) or not before < len(records) <= planned:
        raise ValueError("group receipt accepted prefix invalid")
    accepted = len(records)
    if int(generated) != accepted - before:
        raise ValueError("group receipt generated count differs from manifest")
    expected_status = "complete" if accepted == planned else "review_ready"
    if manifest.get("status") != expected_status:
        raise ValueError("group receipt manifest is not sealed at a Review boundary")

    semantics = (contract.get("global") or {}).get("execution_semantics") or {}
    groups = upstream("branch_provenance").physical_groups(
        chunks=planned,
        terminal_merge_enabled=semantics.get("flf_execution") == "terminal_merged_10s_seed_v2",
    )
    active = [group for group in groups if group.start == before + 1 and group.end == accepted]
    if len(active) != 1:
        raise ValueError("group receipt must commit exactly one complete physical group")
    unit = manifest.get("review_unit") or {}
    group = active[0]
    if (unit.get("start"), unit.get("end"), unit.get("physical_group")) != (group.start, group.end, group.physical_group):
        raise ValueError("group receipt Review unit disagrees with physical group")

    chunk_records = []
    for index, record in enumerate(records):
        owner = _identifier(record.get("storage_revision_id"), "storage_revision_id")
        filename = _identifier(record.get("filename"), "filename")
        if index >= before and owner != revision:
            raise ValueError("group receipt generated payload belongs to another revision")
        if not filename.endswith(".safetensors") or record.get("sequence_index") != index:
            raise ValueError("group receipt records must be a continuous prefix")
        path = (root.parent / owner / "chunks" / filename).resolve()
        if not path.is_relative_to(root.parent.resolve()):
            raise ValueError("group receipt payload escapes revisions")
        size = record.get("file_size")
        digest = record.get("file_sha256")
        if type(size) is not int or size <= 0 or not isinstance(digest, str) or not re.fullmatch(r"[a-f0-9]{64}", digest):
            raise ValueError("group receipt payload evidence invalid")
        hashed = hashlib.sha256()
        with path.open("rb") as handle:
            for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
                hashed.update(block)
        if path.stat().st_size != size or hashed.hexdigest() != digest:
            raise ValueError("group receipt payload bytes/SHA-256 mismatch")
        chunk_records.append({"logical_chunk_index": index + 1, "storage_revision_id": owner,
                              "record_filename": filename, "payload_path": str(path),
                              "payload_bytes": size, "payload_sha256": digest,
                              "reused": index < before, "generated": index >= before})

    # Chunk identities come from the actual projection, not requested page count.
    upstream("v3.plan").validate_assembly_plan(assembly_plan)
    indices = [chunk["chunk_index"] for chunk in assembly_plan["chunks"]]
    prefix_indices = list(range(1, accepted + 1))
    current_indices = list(range(group.start, group.end + 1))
    if indices == prefix_indices:
        scope = "full_accepted_prefix"
    elif indices == current_indices:
        scope = "current_physical_group"
    else:
        raise ValueError("group receipt projection is neither current group nor full prefix")
    output_groups = []
    for decoded in assembly_plan.get("decode_groups") or assembly_plan["chunks"]:
        logical = decoded.get("logical_chunk_indices") or [decoded["chunk_index"]]
        matches = [g for g in groups if list(range(g.start, g.end + 1)) == logical]
        if len(matches) != 1:
            raise ValueError("group receipt projection splits an official physical group")
        output_groups.append({"physical_group": matches[0].physical_group, "logical_chunks": logical,
                              **{key: decoded[key] for key in ("total_frames", "trim_frames", "net_frames", "context_frames")}})
    if [i for item in output_groups for i in item["logical_chunks"]] != indices:
        raise ValueError("group receipt decode groups do not cover projected chunks")
    if manifest_path.read_bytes() != original or project_path.read_bytes() != project_original:
        raise ValueError("group receipt manifest changed while reading")
    return {"schema_version": 1, "kind": "continuum_group", "execution_id": execution_id,
            "step_id": step_id, "attempt_id": attempt_id, "project_id": project_id,
            "run_name": run_name, "revision_id": revision, "run_storage_path": str(root),
            "package_version": upstream("version").PACKAGE_VERSION,
            "run_storage_schema_version": 3, **evidence,
            "expected_parent_revision_id": expected_parent_revision_id,
            "planned_chunks": planned, "accepted_chunks": accepted,
            "reused_count": before, "generated_count": accepted - before,
            "physical_group": {"index": group.physical_group, "start": group.start, "end": group.end},
            "chunk_records": chunk_records, "output_scope": scope, "output_groups": output_groups,
            "sequence_complete": accepted == planned,
            "final_output": accepted == planned and scope == "full_accepted_prefix"}


class LocalVideoStudioH3ContinuumGroupReceipt:
    @classmethod
    def INPUT_TYPES(cls):
        from .nodes import LocalVideoStudioH3ContinuumManagedReceipt
        schema = LocalVideoStudioH3ContinuumManagedReceipt.INPUT_TYPES()
        required = {key: schema["required"][key] for key in ("status", "assembly_plan", "run_name", "project_id")}
        required.update({"planned_chunks": ("INT", {"default": 2, "min": 1, "max": 16}),
                         **{key: ("STRING", {"default": ""}) for key in ("execution_id", "step_id", "attempt_id")}})
        return {"required": required, "optional": schema["optional"]}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("group_receipt",)
    FUNCTION = "report"
    OUTPUT_NODE = True
    CATEGORY = "Local Video Studio/H3"

    def report(self, sampling_evidence_version=2, **inputs):
        import folder_paths
        from .nodes import _continuum_module
        if sampling_evidence_version != 2:
            raise ValueError("group receipt requires sampling evidence v2")
        receipt = read_group_receipt(**inputs, output_root=folder_paths.get_output_directory(), upstream=_continuum_module)
        return {"ui": {"h3_continuum_group_receipt": [receipt]}, "result": (json.dumps(receipt),)}
