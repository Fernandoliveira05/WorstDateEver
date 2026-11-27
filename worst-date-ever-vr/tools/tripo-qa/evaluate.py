#!/usr/bin/env python3
"""Evaluate rendered GLB evidence and emit a schema-valid QA report.

Three modes:

1. Evidence-only (default). Emits ``MISSING_EVIDENCE`` with hashes/paths and a
   precise to-do list. It never invents scores.
2. Manual scoring: ``--scores review.json`` (human reviewer).
3. Vision model output: ``--vision-review review.json`` (pre-computed JSON from
   a multimodal model; this script does not call any model or network).

Both review modes must contain ``reviewed_images`` covering all eight rendered
images (angle names, filenames, project paths, or sha256 values). This is the
guard against claiming a pass without looking at the actual renders.

Example:
    python3 tools/tripo-qa/evaluate.py --asset-id woven-basket
    python3 tools/tripo-qa/evaluate.py --asset-id woven-basket --scores manual.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from common import (
    ANGLES,
    QA_ROOT,
    REPORT_SCHEMA_VERSION,
    ROOT,
    SCORE_AXES,
    image_stats,
    is_reviewable,
    rel,
    sha256_file,
)

class InvalidInput(Exception):
    """Bad/stale/tampered evidence or review input (exit code 2)."""


SCHEMA = Path(__file__).resolve().parent / "report.schema.json"
DECISION_MAX = "VISION_PASS_PENDING_HUMAN"
SEVERITIES = {"minor", "major", "blocking"}
MISSING_AXIS_ADVICE = {
    "silhouette": "compare the front/back/side silhouettes against the reference and re-model proportions",
    "materials": "re-export with the intended albedo/roughness; avoid washed-out or untextured surfaces",
    "detail": "add or sharpen hero details that read at Quest viewing distance; remove baked-in noise",
    "scale": "rescale in meters and re-export; verify the bbox against the intended real-world size",
    "topology_artifacts": "repair non-manifold geometry, z-fighting, seams, holes and degenerate faces",
    "completeness": "add missing parts/undersides/interiors visible in the reference",
    "style_match": "re-generate or hand-edit toward the matte, rounded, muted Worst Date Ever palette",
}


# ---------------------------------------------------------------------------
# Minimal JSON Schema validator (draft 2020-12 subset used by report.schema.json)
# ---------------------------------------------------------------------------

def _type_ok(value, name: str) -> bool:
    if name == "null":
        return value is None
    if name == "boolean":
        return isinstance(value, bool)
    if name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if name == "string":
        return isinstance(value, str)
    if name == "array":
        return isinstance(value, list)
    if name == "object":
        return isinstance(value, dict)
    return False


def validate(instance, schema, root, path="$") -> list[str]:
    errors: list[str] = []
    if "$ref" in schema:
        ref = schema["$ref"]
        if not ref.startswith("#/"):
            return [f"{path}: unsupported $ref {ref}"]
        target = root
        for part in ref[2:].split("/"):
            target = target[part]
        return validate(instance, target, root, path)

    if "oneOf" in schema:
        matches = [candidate for candidate in schema["oneOf"]
                   if not validate(instance, candidate, root, path)]
        if len(matches) != 1:
            errors.append(f"{path}: expected exactly one oneOf match, got {len(matches)}")
        return errors

    if "const" in schema and instance != schema["const"]:
        errors.append(f"{path}: expected const {schema['const']!r}")

    if "enum" in schema and instance not in schema["enum"]:
        errors.append(f"{path}: {instance!r} not in enum")

    expected = schema.get("type")
    if expected is not None:
        names = expected if isinstance(expected, list) else [expected]
        if not any(_type_ok(instance, name) for name in names):
            errors.append(f"{path}: expected type {names}, got {type(instance).__name__}")
            return errors

    if isinstance(instance, dict):
        for key in schema.get("required", []):
            if key not in instance:
                errors.append(f"{path}: missing required property {key!r}")
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for key, value in instance.items():
            if key in properties:
                errors.extend(validate(value, properties[key], root, f"{path}.{key}"))
            elif additional is False:
                errors.append(f"{path}: unexpected property {key!r}")
            elif isinstance(additional, dict):
                errors.extend(validate(value, additional, root, f"{path}.{key}"))

    if isinstance(instance, list):
        if "minItems" in schema and len(instance) < schema["minItems"]:
            errors.append(f"{path}: expected >= {schema['minItems']} items")
        if "maxItems" in schema and len(instance) > schema["maxItems"]:
            errors.append(f"{path}: expected <= {schema['maxItems']} items")
        item_schema = schema.get("items")
        if item_schema:
            for index, value in enumerate(instance):
                errors.extend(validate(value, item_schema, root, f"{path}[{index}]"))

    if isinstance(instance, str):
        if "minLength" in schema and len(instance) < schema["minLength"]:
            errors.append(f"{path}: shorter than {schema['minLength']}")
        if "pattern" in schema and not re.search(schema["pattern"], instance):
            errors.append(f"{path}: does not match {schema['pattern']}")

    if isinstance(instance, (int, float)) and not isinstance(instance, bool):
        if "minimum" in schema and instance < schema["minimum"]:
            errors.append(f"{path}: below minimum {schema['minimum']}")
        if "maximum" in schema and instance > schema["maximum"]:
            errors.append(f"{path}: above maximum {schema['maximum']}")

    return errors


# ---------------------------------------------------------------------------
# Evidence loading
# ---------------------------------------------------------------------------

def file_record(path: Path, include_bytes: bool = True) -> dict:
    record = {
        "path": str(path.resolve()),
        "path_relative": rel(path),
        "sha256": sha256_file(path),
    }
    if include_bytes:
        record["bytes"] = path.stat().st_size
    return record


def load_captures(asset_dir: Path) -> dict:
    path = asset_dir / "captures.json"
    if not path.is_file():
        raise InvalidInput(f"Missing {path}; run render_asset.py first")
    data = json.loads(path.read_text())
    if data.get("schema_version") != "tripo-qa-captures/1":
        raise InvalidInput(f"Unsupported captures schema: {data.get('schema_version')}")
    captures = data.get("captures", [])
    if [capture.get("angle") for capture in captures] != list(ANGLES):
        raise InvalidInput("captures.json must contain the eight angles in order")

    model = Path(data["model"]["path"])
    if not model.is_file():
        raise InvalidInput(f"Model no longer exists: {model}")
    actual_model_sha = sha256_file(model)
    if actual_model_sha != data["model"]["sha256"]:
        raise InvalidInput(f"Model hash changed since render: {model}")

    evidence = []
    asset_root = asset_dir.resolve()
    for capture in captures:
        image = Path(capture["path"]).resolve()
        if image.parent != asset_root:
            raise InvalidInput(
                f"Capture path escapes the asset directory: {image}. "
                f"Evidence directories are immutable; re-render into {asset_root}."
            )
        if capture.get("filename") != f"{capture['angle']}.png":
            raise InvalidInput(f"Capture filename/angle mismatch: {capture}")
        if not image.is_file():
            raise InvalidInput(f"Missing rendered image: {image}")
        if sha256_file(image) != capture["sha256"]:
            raise InvalidInput(f"Rendered image hash mismatch: {image}")
        stats = image_stats(image)
        if (stats["width"], stats["height"]) != (capture["width"], capture["height"]):
            raise InvalidInput(f"Rendered image dimensions changed: {image}")
        evidence.append({
            "angle": capture["angle"],
            "filename": capture["filename"],
            "path": str(image.resolve()),
            "path_relative": rel(image),
            "sha256": capture["sha256"],
            "width": stats["width"],
            "height": stats["height"],
            "mean_luma": stats["mean_luma"],
            "stddev_luma": stats["stddev_luma"],
            "is_reviewable": is_reviewable(stats, min_side=512),
        })

    reference = None
    if data.get("reference"):
        ref_path = Path(data["reference"]["path"])
        if not ref_path.is_file():
            raise InvalidInput(f"Reference disappeared: {ref_path}")
        if sha256_file(ref_path) != data["reference"]["sha256"]:
            raise InvalidInput(f"Reference hash mismatch: {ref_path}")
        reference = file_record(ref_path)
    return {
        "captures_path": path,
        "data": data,
        "evidence": evidence,
        "reference": reference,
    }


def load_sheet(asset_dir: Path, model_sha: str, reference: dict | None) -> tuple[dict | None, list[str]]:
    problems: list[str] = []
    sheet_path = asset_dir / "sheet.webp"
    record_path = asset_dir / "sheet.json"
    if not sheet_path.is_file():
        return None, ["Contact sheet missing; run contact_sheet.py."]
    if not record_path.is_file():
        return None, ["sheet.json missing; rerun contact_sheet.py to prove the sheet contents."]
    record = json.loads(record_path.read_text())
    if sha256_file(sheet_path) != record.get("sheet", {}).get("sha256"):
        raise InvalidInput(f"Contact sheet hash mismatch: {sheet_path}")
    if record.get("model_sha256") != model_sha:
        problems.append("Contact sheet was built against a different model hash.")
    if reference is None:
        problems.append("Contact sheet has no reference image.")
    else:
        sheet_ref = record.get("reference")
        if not sheet_ref or sheet_ref.get("sha256") != reference["sha256"]:
            problems.append("Contact sheet does not include the current reference image.")
        tiles = record.get("tiles") or []
        if not tiles or not tiles[0].get("label", "").startswith("REFERENCE"):
            problems.append("Contact sheet's first tile is not the reference.")
    return {
        "path": str(sheet_path.resolve()),
        "path_relative": rel(sheet_path),
        "sha256": sha256_file(sheet_path),
        "bytes": sheet_path.stat().st_size,
    }, problems


def load_geometry(asset_dir: Path, model_sha: str) -> tuple[dict | None, list[str]]:
    path = asset_dir / "geometry.json"
    if not path.is_file():
        return None, ["geometry.json missing; scale/topology static facts are unavailable."]
    data = json.loads(path.read_text())
    if data.get("asset_sha256") != model_sha:
        raise InvalidInput(f"Geometry probe hash mismatch: {path}")
    totals = data.get("totals", {})
    bounds = data.get("bounds_m", {})
    record = {
        "path": str(path.resolve()),
        "path_relative": rel(path),
        "sha256": sha256_file(path),
        "summary": {
            "dimensions_m": bounds.get("dimensions", []),
            "max_dimension": bounds.get("max_dimension", 0.0),
            "triangles": totals.get("triangles", 0),
            "vertices": totals.get("vertices", 0),
            "mesh_objects": totals.get("mesh_objects", 0),
            "unique_materials": totals.get("unique_materials", 0),
            "images": totals.get("images", 0),
            "non_manifold_edges": totals.get("non_manifold_edges", 0),
            "boundary_edges": totals.get("boundary_edges", 0),
            "degenerate_faces": totals.get("degenerate_faces", 0),
        },
    }
    problems = []
    if record["summary"]["triangles"] <= 0:
        problems.append("Geometry probe reports zero triangles.")
    return record, problems


# ---------------------------------------------------------------------------
# Review input
# ---------------------------------------------------------------------------

def load_review(path: Path, source: str) -> dict:
    try:
        payload = json.loads(path.read_text())
    except ValueError as error:
        raise InvalidInput(f"Review JSON is invalid: {path}: {error}") from error
    if not isinstance(payload, dict):
        raise InvalidInput("Review JSON must be an object")

    scores = payload.get("scores")
    if not isinstance(scores, dict):
        raise InvalidInput("Review JSON must contain a 'scores' object")
    unknown = sorted(set(scores) - set(SCORE_AXES))
    missing = sorted(set(SCORE_AXES) - set(scores))
    if unknown or missing:
        raise InvalidInput(f"Score axes must be exactly {list(SCORE_AXES)}; "
                         f"unknown={unknown} missing={missing}")
    cleaned = {}
    for axis in SCORE_AXES:
        value = scores[axis]
        if value is not None and (isinstance(value, bool) or not isinstance(value, int)
                                  or not 1 <= value <= 5):
            raise InvalidInput(f"Score {axis} must be an integer 1-5 or null, got {value!r}")
        cleaned[axis] = value

    reviewer = payload.get("reviewer")
    if source == "vision_model":
        reviewer = payload.get("vision_model") or reviewer
        if not isinstance(reviewer, str) or not reviewer.strip():
            raise InvalidInput("Vision review must name the model in 'vision_model'")
    elif not isinstance(reviewer, str) or not reviewer.strip():
        raise InvalidInput("Manual review must name the reviewer in 'reviewer'")

    reviewed = payload.get("reviewed_images", [])
    if not isinstance(reviewed, list) or not all(isinstance(item, str) for item in reviewed):
        raise InvalidInput("'reviewed_images' must be an array of image tokens")

    defects_raw = payload.get("defects", [])
    if not isinstance(defects_raw, list):
        raise InvalidInput("'defects' must be an array")
    defects = []
    for index, defect in enumerate(defects_raw):
        if not isinstance(defect, dict):
            raise InvalidInput(f"Defect #{index} must be an object")
        for key in ("image", "region", "severity", "defect", "fix"):
            if not isinstance(defect.get(key), str) or not defect[key].strip():
                raise InvalidInput(f"Defect #{index} requires non-empty '{key}'")
        if defect["severity"] not in SEVERITIES:
            raise InvalidInput(f"Defect #{index} severity must be one of {sorted(SEVERITIES)}")
        defects.append({key: defect[key].strip() for key in
                        ("image", "region", "severity", "defect", "fix")})
    notes = payload.get("notes")
    if notes is not None and not isinstance(notes, str):
        raise InvalidInput("'notes' must be a string or null")
    return {"scores": cleaned, "reviewer": reviewer, "reviewed_images": reviewed,
            "defects": defects, "notes": notes}


def match_tokens(tokens: list[str], evidence: list[dict], sheet: dict | None) -> list[int]:
    """Return indices of evidence covered by reviewer-supplied tokens."""
    covered: set[int] = set()
    for token in tokens:
        for index, item in enumerate(evidence):
            candidates = {item["sha256"], item["angle"], item["filename"],
                          item["path"], item["path_relative"], Path(item["path"]).name}
            if token in candidates:
                covered.add(index)
        if sheet and token in {sheet["sha256"], sheet["path"], sheet["path_relative"]}:
            # A contact sheet alone is not individual-image evidence.
            continue
    return sorted(covered)


def resolve_defect_image(raw: str, evidence: list[dict], sheet: dict | None) -> str:
    for item in evidence:
        if raw in {item["sha256"], item["angle"], item["filename"],
                   item["path"], item["path_relative"], Path(item["path"]).name}:
            return item["path"]
    if sheet and raw in {sheet["sha256"], sheet["path"], sheet["path_relative"],
                         Path(sheet["path"]).name}:
        return sheet["path"]
    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = (ROOT / raw).resolve()
    if candidate.is_file():
        return str(candidate)
    raise InvalidInput(f"Defect references an unknown image: {raw!r} "
                     "(use an angle name, filename, path, or sha256)")


# ---------------------------------------------------------------------------
# Report assembly
# ---------------------------------------------------------------------------

def decide(scores: dict, supplied: bool, coverage_complete: bool,
           reference_ok: bool, evidence_ok: bool,
           defects: list[dict]) -> str:
    if not supplied or any(value is None for value in scores.values()):
        return "MISSING_EVIDENCE"
    if not coverage_complete or not reference_ok or not evidence_ok:
        return "MISSING_EVIDENCE"
    blocking = any(defect["severity"] == "blocking" for defect in defects)
    major = any(defect["severity"] == "major" for defect in defects)
    if blocking or any(value <= 2 for value in scores.values()):
        return "REJECT"
    if major or any(value < 4 for value in scores.values()):
        return "REWORK"
    return DECISION_MAX


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--asset-dir", type=Path, default=None)
    parser.add_argument("--out", type=Path, default=None)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--scores", type=Path, help="Manual human scoring JSON")
    group.add_argument("--vision-review", type=Path,
                       help="Pre-computed multimodal model review JSON")
    args = parser.parse_args()

    asset_dir = (args.asset_dir or (QA_ROOT / args.asset_id)).resolve()
    loaded = load_captures(asset_dir)
    data = loaded["data"]
    evidence = loaded["evidence"]
    reference = loaded["reference"]
    model_sha = data["model"]["sha256"]

    sheet, sheet_problems = load_sheet(asset_dir, model_sha, reference)
    geometry, geometry_problems = load_geometry(asset_dir, model_sha)

    missing = list(sheet_problems) + list(geometry_problems)
    if reference is None:
        missing.append("Reference art missing; style_match/completeness cannot be judged.")

    duplicate_hashes = len({item["sha256"] for item in evidence}) != len(evidence)
    if duplicate_hashes:
        missing.append("Rendered angles contain duplicate images; eight distinct views are required.")
    unreviewable = [item["path_relative"] for item in evidence if not item["is_reviewable"]]
    if unreviewable:
        missing.append(f"Unreviewable (blank/too small) images: {', '.join(unreviewable)}")

    review = None
    if args.scores:
        review = load_review(args.scores, "manual")
        score_source = "manual"
    elif args.vision_review:
        review = load_review(args.vision_review, "vision_model")
        score_source = "vision_model"
    else:
        score_source = "none"

    if review:
        scores = review["scores"]
        supplied = True
        attested_indices = match_tokens(review["reviewed_images"], evidence, sheet)
        coverage_complete = len(attested_indices) == len(evidence)
        attested = [evidence[index]["angle"] for index in attested_indices]
        reviewer = review["reviewer"]
        notes = review["notes"]
        raw_defects = review["defects"]
    else:
        scores = {axis: None for axis in SCORE_AXES}
        supplied = False
        coverage_complete = False
        attested = []
        reviewer = None
        notes = None
        raw_defects = []

    defects = []
    for defect in raw_defects:
        resolved = dict(defect)
        resolved["image"] = resolve_defect_image(defect["image"], evidence, sheet)
        defects.append(resolved)

    if not supplied:
        missing.append("No visual scores supplied; run with --scores or --vision-review after reviewing images.")
    elif any(value is None for value in scores.values()):
        missing.append("One or more score axes are null; all seven axes need an integer 1-5.")
    elif not coverage_complete:
        not_attested = [item["angle"] for item in evidence
                        if item["angle"] not in attested]
        missing.append("Reviewer did not attest all eight images; unattested: "
                       + ", ".join(not_attested))

    evidence_ok = (len(evidence) == 8 and not duplicate_hashes and not unreviewable
                   and sheet is not None and geometry is not None)
    decision = decide(scores, supplied, coverage_complete, reference is not None,
                      evidence_ok, defects)

    next_actions = []
    if reference is None:
        next_actions.append("Restore the reference art from the manifest, then re-render and re-sheet.")
    for problem in sheet_problems:
        next_actions.append(problem)
    for problem in geometry_problems:
        next_actions.append(problem)
    if duplicate_hashes:
        next_actions.append("Regenerate the eight renders; duplicate camera output is not reviewable.")
    if unreviewable:
        next_actions.append("Re-render unreviewable images at >= 512 px with the object in frame.")
    if not supplied:
        next_actions.append("Review sheet.webp and all eight PNGs, then supply scores and "
                            "reviewed_images covering every angle (or sha256).")
    elif not coverage_complete:
        next_actions.append("Attest every rendered image in reviewed_images by angle, filename, "
                            "path, or sha256.")
    if supplied:
        for axis, value in scores.items():
            if value is not None and value < 4:
                next_actions.append(f"Raise {axis} from {value} to >=4: {MISSING_AXIS_ADVICE[axis]}.")
    for defect in defects:
        next_actions.append(
            f"Fix [{defect['severity']}] {Path(defect['image']).name} "
            f"({defect['region']}): {defect['defect']} -> {defect['fix']}"
        )
    next_actions.append("After any fix, re-run render_asset.py -> contact_sheet.py -> evaluate.py "
                        "and keep the old failing report for audit.")
    if decision == DECISION_MAX:
        next_actions.append("Route sheet.webp and this report to the human art lead; vision review "
                            "cannot issue APPROVED_BY_HUMAN.")
    elif decision == "APPROVED_BY_HUMAN":
        next_actions.append("Human sign-off recorded; retain evidence paths and reviewer identity.")

    report = {
        "schema_version": REPORT_SCHEMA_VERSION,
        "asset_id": args.asset_id,
        "model": file_record(Path(data["model"]["path"])),
        "reference": reference,
        "captures_json": file_record(loaded["captures_path"]),
        "renderer": {
            "engine": data.get("renderer", {}).get("engine"),
            "blender_version": data.get("renderer", {}).get("blender_version"),
            "resolution": int(data.get("renderer", {}).get("resolution", 0)),
            "projection": data.get("renderer", {}).get("projection", "orthographic"),
            "angles": data.get("renderer", {}).get("angles", list(ANGLES)),
        },
        "contact_sheet": sheet,
        "geometry": geometry,
        "evidence": evidence,
        "scores": scores,
        "score_source": score_source,
        "reviewer": reviewer,
        "review_coverage": {
            "required_images": [item["angle"] for item in evidence],
            "attested_images": attested,
            "complete": coverage_complete,
            "note": ("All eight rendered images attested by reviewer."
                     if coverage_complete else
                     "A contact sheet alone does not count; list each rendered image."),
        },
        "defects": defects,
        "missing_evidence": missing,
        "decision": decision,
        "next_actions": next_actions,
        "acceptance": {
            "axes": list(SCORE_AXES),
            "minimum_score_per_axis": 4,
            "reference_required": True,
            "all_eight_views_required": True,
            "distinct_views_required": True,
            "blocking_defect_rejects": True,
            "maximum_decision": DECISION_MAX,
        },
        "notes": notes,
    }

    schema = json.loads(SCHEMA.read_text())
    errors = validate(report, schema, schema)
    if errors:
        print("Report failed schema validation:", file=sys.stderr)
        for error in errors:
            print(f"  {error}", file=sys.stderr)
        return 2

    output = (args.out or (asset_dir / "report.json")).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2) + "\n")

    print(f"asset_id   : {args.asset_id}")
    print(f"decision   : {decision}")
    print(f"score src  : {score_source}")
    if supplied:
        print("scores     : " + " ".join(f"{axis}={value}" for axis, value in scores.items()))
    print(f"coverage   : {len(attested)}/8 images attested")
    print(f"defects    : {len(defects)}")
    print(f"missing    : {len(missing)}")
    for entry in missing:
        print(f"  - {entry}")
    print(f"report     : {output}")
    print(f"report sha : {sha256_file(output)}")
    if decision in {"REJECT", "REWORK"}:
        return 1
    if decision == "MISSING_EVIDENCE":
        return 3
    return 0


def entry() -> int:
    try:
        return main()
    except InvalidInput as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(entry())
