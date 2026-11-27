#!/usr/bin/env python3
"""Audit every 3D reference against models already present in this repo.

No network, no downloads, no generation. It answers: which references have a
QA-able GLB now, which have a catalog source worth licensing, which only have
procedural runtime geometry, and which have nothing.

Outputs under ``assets/tripo/qa/_sourcing/``:

    audit.json   full per-reference record (deterministic)
    audit.csv    one row per reference
    audit.md     human summary + full table

Catalog "suggestions" are lexical (manifest id vs catalog id/name) and are NOT
verified matches. They are pointers for a human/licensing pass.

Example:
    python3 tools/tripo-qa/sourcing_audit.py
"""
from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
from pathlib import Path

from common import (
    MANIFEST,
    QA_ROOT,
    ROOT,
    find_generated_model,
    load_staged_candidates,
    rel,
    sha256_file,
)

HERE = Path(__file__).resolve().parent
DEFAULT_CATALOG = ROOT / "assets" / "hand-qa" / "catalog.csv"
DEFAULT_STATUS = ROOT / "assets" / "hand-qa" / "catalog-status.csv"
DEFAULT_CANDIDATES = HERE / "fixtures" / "staged_candidates.json"
DEFAULT_BATCH = QA_ROOT / "_batch" / "index.json"

SCENE_ALIASES = {
    "bedroom": {"bedroom"},
    "picnic": {"picnic", "park_landscape"},
    "sushi": {"sushi", "venue_exterior"},
    "bistro": {"bistro", "venue_exterior"},
    "bar": {"bar", "venue_exterior"},
    "park": {"park_landscape"},
    "environment": {"city_exterior", "park_landscape", "venue_exterior"},
    "architecture": {"sushi", "bedroom", "bar", "venue_exterior",
                     "atmosphere_transition"},
}
STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "with", "for", "to", "on", "in",
    "at", "from", "set", "prop", "object", "3d", "scene",
}
SCENE_WORDS = {"bedroom", "picnic", "sushi", "bistro", "bar", "park",
               "environment", "architecture", "city", "venue"}
SYNONYMS = {
    "signage": "sign", "lights": "light", "flowers": "flower",
    "mushrooms": "mushroom", "curtains": "curtain", "stools": "stool",
    "glasses": "glass", "bush": "shrub", "checkered": "checked",
    "platters": "platter", "cushions": "cushion", "books": "book",
    "candles": "candle", "bottles": "bottle", "bowls": "bowl",
    "tables": "table", "chairs": "chair", "cups": "cup", "mugs": "mug",
    "plants": "plant", "trees": "tree", "benches": "bench",
    "flowering": "blossom",
}
RUNTIME = {"EXISTING_RUNTIME", "PARTIAL_OR_SUBSTITUTE", "PLAYABLE_BENCHMARK"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG)
    parser.add_argument("--catalog-status", type=Path, default=DEFAULT_STATUS)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--batch-index", type=Path, default=DEFAULT_BATCH)
    parser.add_argument("--out-dir", type=Path, default=QA_ROOT / "_sourcing")
    return parser.parse_args()


def tokens(text: str) -> set[str]:
    raw = re.split(r"[^a-z0-9]+", text.lower())
    result = set()
    for token in raw:
        if len(token) < 2 or token in STOPWORDS or token in SCENE_WORDS:
            continue
        result.add(SYNONYMS.get(token, token))
    return result


def file_record(path: Path) -> dict:
    return {
        "path": str(path.resolve()),
        "path_relative": rel(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
    }


def merge_catalog(catalog_path: Path, status_path: Path) -> list[dict]:
    with catalog_path.open(newline="") as handle:
        catalog = {row["id"]: row for row in csv.DictReader(handle)}
    with status_path.open(newline="") as handle:
        status_rows = list(csv.DictReader(handle))
    rows = []
    for status in status_rows:
        row = dict(status)
        row.update({key: value for key, value in catalog.get(status["id"], {}).items()
                    if value})
        rows.append(row)
    return rows


def catalog_suggestions(item: dict, rows: list[dict], limit: int = 3) -> list[dict]:
    item_tokens = tokens(item["id"])
    if not item_tokens:
        return []
    aliases = SCENE_ALIASES.get(item.get("scene"), set())
    scored = []
    for row in rows:
        if row.get("scene") not in aliases:
            continue
        row_tokens = tokens(row["id"] + " " + row["name"])
        overlap = item_tokens & row_tokens
        if not overlap:
            continue
        candidate_page = row.get("exact_candidate_page") or ""
        candidate_binary = row.get("candidate_binary") or ""
        if candidate_binary:
            candidate_kind = "binary"
        elif "/models/" in candidate_page:
            candidate_kind = "model_page"
        elif "/kits/" in candidate_page:
            candidate_kind = "kit_page"
        elif candidate_page:
            candidate_kind = "other_page"
        else:
            candidate_kind = ""
        runtime = row.get("runtime_presence") or ""
        score = len(overlap) * 3 + 2
        if runtime in RUNTIME:
            score += 1
        if candidate_page or candidate_binary:
            score += 2
        if row.get("milestone_status") == "BENCHMARK_STAGED":
            score += 1
        if score < 5:
            continue
        binary_path = (ROOT / "assets" / "hand-qa" / candidate_binary).resolve() \
            if candidate_binary else None
        confidence = "high" if len(overlap) >= 2 else (
            "medium" if candidate_page or candidate_binary else "low")
        scored.append({
            "catalog_id": row["id"],
            "name": row["name"],
            "scene": row.get("scene"),
            "score": score,
            "matched_tokens": sorted(overlap),
            "confidence": confidence,
            "runtime_presence": runtime,
            "milestone_status": row.get("milestone_status"),
            "candidate_page": candidate_page,
            "candidate_kind": candidate_kind,
            "candidate_binary": candidate_binary,
            "candidate_binary_exists": bool(binary_path and binary_path.is_file()),
            "candidate_binary_sha256": (sha256_file(binary_path)
                                        if binary_path and binary_path.is_file() else None),
            "licensing_grade": row.get("licensing_grade") or "",
            "final_approval": row.get("final_approval") or "",
            "verified": False,
        })
    scored.sort(key=lambda entry: (
        -entry["score"], -len(entry["matched_tokens"]),
        -int(bool(entry["candidate_page"] or entry["candidate_binary"])),
        entry["catalog_id"]))
    return scored[:limit]


def reference_record(item: dict) -> dict | None:
    path = (ROOT / item["reference"]).resolve()
    return file_record(path) if path.is_file() else None


def main() -> int:
    args = parse_args()
    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text())
    items = [item for item in manifest.get("items", [])
             if item.get("category") == "3d"]
    rows = merge_catalog(args.catalog.resolve(), args.catalog_status.resolve())
    row_by_id = {row["id"]: row for row in rows}
    candidates = load_staged_candidates(args.candidates.resolve())
    batch_index = None
    batch_by_id = {}
    if args.batch_index.is_file():
        batch_index = json.loads(args.batch_index.read_text())
        batch_by_id = {entry["id"]: entry for entry in batch_index.get("assets", [])}

    output_dir = args.out_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    entries = []
    for item in items:
        item_id = item["id"]
        generated, generated_reason = find_generated_model(item)
        staged = candidates.get(item_id)
        staged_issue = None
        if staged:
            if not staged["exists"]:
                staged_issue = f"staged candidate missing: {staged.get('path')}"
            elif staged.get("sha_match") is False:
                staged_issue = "staged candidate hash mismatch"
        suggestions = catalog_suggestions(item, rows)
        top = suggestions[0] if suggestions else None
        source_suggestions = []

        if generated:
            status = "LOCAL_GENERATED_MODEL"
            local_model = {
                "status": "GENERATED_MODEL",
                "path": str(generated),
                "path_relative": rel(generated),
                "sha256": sha256_file(generated),
                "bytes": generated.stat().st_size,
            }
        elif staged and staged["exists"] and staged.get("sha_match") is not False:
            status = "LOCAL_STAGED_CANDIDATE"
            local_model = {
                "status": "STAGED_CANDIDATE",
                "path": staged["path"],
                "path_relative": rel(staged["path"]),
                "sha256": staged["sha256"],
                "bytes": Path(staged["path"]).stat().st_size,
                "catalog_id": staged.get("catalog_id"),
                "source_page": staged.get("source_page"),
            }
        else:
            local_model = None
            source_suggestions = [
                entry for entry in suggestions[:2]
                if entry["candidate_kind"] in {"binary", "model_page"}]
            if source_suggestions:
                status = "CATALOG_SOURCE_CANDIDATE"
            elif any(entry["runtime_presence"] in RUNTIME for entry in suggestions):
                status = "RUNTIME_SUBSTITUTE"
            elif suggestions:
                status = "CATALOG_NAME_MATCH"
            else:
                status = "GENERATION_REQUIRED"

        license_suggestion = source_suggestions[0] if source_suggestions else top
        catalog_row = row_by_id.get(staged.get("catalog_id")) if staged else None
        if not catalog_row and license_suggestion:
            catalog_row = row_by_id.get(license_suggestion["catalog_id"])
        if status == "LOCAL_GENERATED_MODEL":
            license_info = {
                "status": "GENERATED_ASSET",
                "recorded": None,
                "source": None,
                "catalog_grade": None,
                "warning": "Tripo-generated asset; source/reference provenance applies.",
            }
        elif status == "LOCAL_STAGED_CANDIDATE":
            recorded = staged.get("license") or "UNKNOWN"
            grade = (catalog_row or {}).get("licensing_grade") or ""
            warning = None
            if grade.startswith("PENDING") or (catalog_row or {}).get(
                    "final_approval", "").startswith("REJECT"):
                warning = ("Catalog still marks licensing/approval as pending; "
                           "local license metadata is not a legal review.")
            license_info = {
                "status": recorded,
                "recorded": recorded,
                "source": staged.get("license_source") or staged.get("source_page"),
                "catalog_grade": grade,
                "warning": warning,
            }
        elif license_suggestion:
            grade = license_suggestion["licensing_grade"] or "UNKNOWN"
            warning = None
            if grade.startswith("PENDING") or \
                    license_suggestion["final_approval"].startswith("REJECT"):
                warning = "License/approval is explicitly pending; do not ship."
            license_info = {
                "status": grade,
                "recorded": None,
                "source": license_suggestion["candidate_page"] or None,
                "catalog_grade": grade,
                "warning": warning,
            }
        else:
            license_info = {
                "status": "NOT_APPLICABLE",
                "recorded": None,
                "source": None,
                "catalog_grade": None,
                "warning": None,
            }

        qa = None
        batch_entry = batch_by_id.get(item_id)
        if batch_entry and batch_entry.get("qa"):
            qa = {
                "batch_status": batch_entry.get("status"),
                "decision": batch_entry["qa"]["decision"],
                "report": batch_entry["qa"]["report"],
                "sheet": batch_entry["qa"].get("sheet"),
            }
        elif batch_entry:
            qa = {"batch_status": batch_entry.get("status")}

        action = {
            "LOCAL_GENERATED_MODEL": "Run batch QA / review the report against the reference.",
            "LOCAL_STAGED_CANDIDATE": "QA is available now; staged candidate is not a Tripo output and still needs production review.",
            "CATALOG_SOURCE_CANDIDATE": "Review the catalog source page and license before downloading; then add to staged candidates and run batch QA.",
            "RUNTIME_SUBSTITUTE": "Existing procedural runtime geometry only; compare to the reference or generate a dedicated model.",
            "CATALOG_NAME_MATCH": "Catalog name match only; inspect whether a usable model exists, otherwise generate/source externally.",
            "GENERATION_REQUIRED": "No local/source candidate found; generate with Tripo (preflight) or source externally.",
        }[status]

        entries.append({
            "id": item_id,
            "scene": item.get("scene"),
            "reference": reference_record(item),
            "expected_output": (item.get("tripo") or {}).get("output"),
            "status": status,
            "local_model": local_model,
            "staged_candidate": ({
                "path": staged["path"],
                "exists": staged["exists"],
                "sha_match": staged.get("sha_match"),
                "issue": staged_issue,
            } if staged else None),
            "catalog_suggestions": suggestions,
            "license": license_info,
            "qa": qa,
            "action": action,
            "generated_output_reason": generated_reason,
        })

    status_counts = Counter(entry["status"] for entry in entries)
    license_pending = sum(
        1 for entry in entries
        if entry["license"]["status"] in {"PENDING_DOWNLOADED_LICENSE", "UNKNOWN"}
        or (entry["license"]["warning"]
            and entry["status"] != "LOCAL_GENERATED_MODEL"))
    qa_complete = sum(1 for entry in entries if entry["qa"] and entry["qa"].get("decision"))
    by_scene = {}
    for entry in entries:
        bucket = by_scene.setdefault(entry["scene"], Counter())
        bucket[entry["status"]] += 1

    audit = {
        "schema_version": "tripo-qa-sourcing/1",
        "no_network": True,
        "inputs": {
            "manifest": file_record(manifest_path),
            "catalog": file_record(args.catalog.resolve()),
            "catalog_status": file_record(args.catalog_status.resolve()),
            "staged_candidates": (file_record(args.candidates.resolve())
                                  if args.candidates.is_file() else None),
            "batch_index": (file_record(args.batch_index.resolve())
                            if args.batch_index.is_file() else None),
        },
        "summary": {
            "total_3d": len(entries),
            "with_local_model": sum(1 for entry in entries if entry["local_model"]),
            "local_generated_model": status_counts.get("LOCAL_GENERATED_MODEL", 0),
            "local_staged_candidate": status_counts.get("LOCAL_STAGED_CANDIDATE", 0),
            "catalog_source_candidate": status_counts.get("CATALOG_SOURCE_CANDIDATE", 0),
            "runtime_substitute": status_counts.get("RUNTIME_SUBSTITUTE", 0),
            "catalog_name_match": status_counts.get("CATALOG_NAME_MATCH", 0),
            "generation_required": status_counts.get("GENERATION_REQUIRED", 0),
            "qa_reports_available": qa_complete,
            "staged_candidate_issues": sum(1 for entry in entries
                                           if entry["staged_candidate"]
                                           and entry["staged_candidate"]["issue"]),
            "license_records_pending_or_warned": license_pending,
            "by_status": dict(sorted(status_counts.items())),
            "by_scene": {scene: dict(sorted(bucket.items()))
                         for scene, bucket in sorted(by_scene.items())},
        },
        "items": entries,
    }
    (output_dir / "audit.json").write_text(json.dumps(audit, indent=2) + "\n")

    fields = ["id", "scene", "status", "local_model", "suggestion",
              "candidate_page", "license_status", "license_warning", "qa_decision",
              "action"]
    with (output_dir / "audit.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for entry in entries:
            top = entry["catalog_suggestions"][0] if entry["catalog_suggestions"] else None
            writer.writerow({
                "id": entry["id"],
                "scene": entry["scene"],
                "status": entry["status"],
                "local_model": entry["local_model"]["path_relative"] if entry["local_model"] else "",
                "suggestion": top["name"] if top else "",
                "candidate_page": top["candidate_page"] if top else "",
                "license_status": entry["license"]["status"],
                "license_warning": entry["license"]["warning"] or "",
                "qa_decision": entry["qa"].get("decision", "") if entry["qa"] else "",
                "action": entry["action"],
            })

    lines = [
        "# Sourcing audit — 66 Tripo references",
        "",
        "Local repository data only. **No network, downloads, or generation.**",
        "Catalog suggestions are lexical name matches, not verified model matches.",
        "",
        "## Summary",
        "",
        "| Status | Count |",
        "| --- | ---: |",
        f"| Total 3D references | {audit['summary']['total_3d']} |",
        f"| Local model available (generated + staged) | {audit['summary']['with_local_model']} |",
        f"| Generated Tripo model | {audit['summary']['local_generated_model']} |",
        f"| Staged benchmark candidate | {audit['summary']['local_staged_candidate']} |",
        f"| Catalog source candidate | {audit['summary']['catalog_source_candidate']} |",
        f"| Runtime substitute only | {audit['summary']['runtime_substitute']} |",
        f"| Catalog name match only | {audit['summary']['catalog_name_match']} |",
        f"| Generation required | {audit['summary']['generation_required']} |",
        f"| QA reports available | {audit['summary']['qa_reports_available']} |",
        f"| Staged candidate issues | {audit['summary']['staged_candidate_issues']} |",
        f"| License pending/warned | {audit['summary']['license_records_pending_or_warned']} |",
        "",
        "## By scene",
        "",
        "| Scene | Total | Local model | Catalog source | Runtime only | Name only | Generation |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for scene, bucket in audit["summary"]["by_scene"].items():
        total = sum(bucket.values())
        lines.append(
            f"| {scene} | {total} | "
            f"{bucket.get('LOCAL_GENERATED_MODEL', 0) + bucket.get('LOCAL_STAGED_CANDIDATE', 0)} | "
            f"{bucket.get('CATALOG_SOURCE_CANDIDATE', 0)} | "
            f"{bucket.get('RUNTIME_SUBSTITUTE', 0)} | "
            f"{bucket.get('CATALOG_NAME_MATCH', 0)} | "
            f"{bucket.get('GENERATION_REQUIRED', 0)} |")

    with_qa = [entry for entry in entries if entry["qa"] and entry["qa"].get("decision")]
    lines += ["", "## QA available now", ""]
    if with_qa:
        lines += ["| Asset | Decision | Report |", "| --- | --- | --- |"]
        for entry in with_qa:
            lines.append(f"| {entry['id']} | {entry['qa']['decision']} | "
                         f"`{entry['qa']['report']['path_relative']}` |")
    else:
        lines.append("No batch QA reports found; run `batch.py` first.")

    for status, title in [
        ("CATALOG_SOURCE_CANDIDATE", "Catalog source candidates (license review before download)"),
        ("RUNTIME_SUBSTITUTE", "Runtime substitutes only"),
        ("CATALOG_NAME_MATCH", "Catalog name matches only"),
        ("GENERATION_REQUIRED", "No local/source candidate — generate or source externally"),
    ]:
        subset = [entry for entry in entries if entry["status"] == status]
        lines += ["", f"## {title}", ""]
        if not subset:
            lines.append("None.")
            continue
        lines += ["| Reference | Scene | Top suggestion | Source | License | Action |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for entry in subset:
            top = entry["catalog_suggestions"][0] if entry["catalog_suggestions"] else None
            suggestion = top["name"] if top else "-"
            source = (top["candidate_page"] or top["candidate_kind"] or "-") if top else "-"
            lines.append(
                f"| {entry['id']} | {entry['scene']} | {suggestion} | {source} | "
                f"{entry['license']['status']} | {entry['action']} |")

    lines += [
        "",
        "## Next steps",
        "",
        "1. QA the five local staged candidates with `batch.py` (done separately).",
        "2. For catalog-source candidates, verify the source page and license before",
        "   downloading; do not treat a lexical suggestion as a match.",
        "3. Generate or externally source the remaining references, then rerun",
        "   `batch.py` (and this audit) over all 66.",
        "",
    ]
    (output_dir / "audit.md").write_text("\n".join(lines))

    print(f"references          : {audit['summary']['total_3d']}")
    print(f"local model         : {audit['summary']['with_local_model']}")
    print(f"catalog source      : {audit['summary']['catalog_source_candidate']}")
    print(f"runtime substitute  : {audit['summary']['runtime_substitute']}")
    print(f"name match only     : {audit['summary']['catalog_name_match']}")
    print(f"generation required : {audit['summary']['generation_required']}")
    print(f"license pending     : {audit['summary']['license_records_pending_or_warned']}")
    print(f"audit               : {output_dir / 'audit.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
