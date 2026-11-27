#!/usr/bin/env python3
"""Run render + contact sheet + evaluation for every 3D manifest reference.

It never generates or downloads anything. For each of the 66 3D items:

* find a Tripo output GLB under the manifest's ``tripo.output`` directory, or
  a curated existing benchmark candidate (``fixtures/staged_candidates.json``);
* if found, run ``render_asset.py`` -> ``contact_sheet.py`` -> ``evaluate.py``;
* if not found, record ``MISSING_MODEL`` (no fake score, no fabricated render);
* write a deterministic coverage index under ``assets/tripo/qa/_batch/``.

Examples:
    python3 tools/tripo-qa/batch.py --dry-run
    python3 tools/tripo-qa/batch.py --resolution 640
    python3 tools/tripo-qa/batch.py --only woven-basket,checked-blanket
    python3 tools/tripo-qa/batch.py --reviews assets/tripo/qa/_reviews
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import sys
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
RENDER = HERE / "render_asset.py"
SHEET = HERE / "contact_sheet.py"
EVALUATE = HERE / "evaluate.py"
DEFAULT_CANDIDATES = HERE / "fixtures" / "staged_candidates.json"
SAFE_ID = re.compile(r"^[A-Za-z0-9._-]+$")
FAILURE_STATUSES = {
    "RENDER_FAILED", "SHEET_FAILED", "EVALUATE_FAILED", "EVALUATE_INVALID",
    "CANDIDATE_HASH_MISMATCH", "AMBIGUOUS_MODEL", "INVALID_ASSET_ID",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--out-root", type=Path, default=QA_ROOT)
    parser.add_argument("--batch-dir", type=Path, default=None)
    parser.add_argument("--candidates", type=Path, default=DEFAULT_CANDIDATES)
    parser.add_argument("--no-candidates", action="store_true",
                        help="Only use generated Tripo outputs, not staged candidates")
    parser.add_argument("--only", help="Comma-separated manifest ids")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--resolution", type=int, default=768)
    parser.add_argument("--reviews", type=Path,
                        help="Directory of <asset-id>.json manual/vision reviews")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def run(command: list[str]) -> tuple[int, str]:
    result = subprocess.run(command, cwd=ROOT, text=True, capture_output=True)
    detail = (result.stderr or result.stdout or "").strip()
    return result.returncode, detail[-2500:]


def file_record(path: Path) -> dict:
    return {
        "path": str(path.resolve()),
        "path_relative": rel(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
    }


def reference_record(item: dict) -> dict | None:
    path = (ROOT / item["reference"]).resolve()
    if not path.is_file():
        return None
    return file_record(path)


def choose_model(item: dict, candidates: dict, use_candidates: bool):
    """Return (model record | None, status, reason)."""
    item_id = item["id"]
    generated, reason = find_generated_model(item)
    if generated:
        return {
            "status": "GENERATED_MODEL",
            "source": "manifest tripo.output",
            "path": str(generated),
            "path_relative": rel(generated),
            "sha256": sha256_file(generated),
            "bytes": generated.stat().st_size,
        }, "GENERATED_MODEL", None

    if use_candidates and item_id in candidates:
        candidate = candidates[item_id]
        if not candidate["exists"]:
            return None, "MISSING_MODEL", (
                f"candidate missing: {candidate.get('path')}")
        if candidate.get("sha_match") is False:
            return None, "CANDIDATE_HASH_MISMATCH", (
                f"candidate hash {candidate['sha256'][:16]}... does not match "
                f"expected {candidate.get('expected_sha256', '')[:16]}...")
        return {
            "status": "STAGED_CANDIDATE",
            "source": "hand-QA benchmark candidate (not a Tripo output)",
            "catalog_id": candidate.get("catalog_id"),
            "path": candidate["path"],
            "path_relative": rel(candidate["path"]),
            "sha256": candidate["sha256"],
            "bytes": Path(candidate["path"]).stat().st_size,
            "license": candidate.get("license"),
            "license_source": candidate.get("license_source"),
            "source_page": candidate.get("source_page"),
        }, "STAGED_CANDIDATE", None

    return None, "MISSING_MODEL", reason or "no model found"


def main() -> int:
    args = parse_args()
    if not 256 <= args.resolution <= 2048:
        raise SystemExit("--resolution must be between 256 and 2048")

    manifest_path = args.manifest.resolve()
    manifest = json.loads(manifest_path.read_text())
    items = [item for item in manifest.get("items", [])
             if item.get("category") == "3d"]
    if args.only:
        wanted = {part.strip() for part in args.only.split(",") if part.strip()}
        unknown = wanted - {item["id"] for item in items}
        if unknown:
            raise SystemExit(f"Unknown asset ids: {sorted(unknown)}")
        items = [item for item in items if item["id"] in wanted]
    if args.limit is not None:
        if args.limit < 1:
            raise SystemExit("--limit must be >= 1")
        items = items[:args.limit]
    if not items:
        raise SystemExit("No 3D manifest items selected")

    out_root = args.out_root.resolve()
    qa_root = QA_ROOT.resolve()
    try:
        out_root.relative_to(qa_root)
    except ValueError:
        raise SystemExit(f"--out-root must be under {qa_root}") from None
    batch_dir = (args.batch_dir or (out_root / "_batch")).resolve()
    batch_dir.mkdir(parents=True, exist_ok=True)

    candidates = {} if args.no_candidates else load_staged_candidates(args.candidates)
    review_dir = args.reviews.resolve() if args.reviews else None

    entries = []
    for index, item in enumerate(items, 1):
        item_id = item["id"]
        print(f"[{index}/{len(items)}] {item_id}", flush=True)
        entry = {
            "id": item_id,
            "scene": item.get("scene"),
            "reference": reference_record(item),
            "expected_output": (item.get("tripo") or {}).get("output"),
            "model": None,
            "qa": None,
            "status": "MISSING_MODEL",
            "reason": None,
        }
        if not SAFE_ID.fullmatch(item_id):
            entry["status"] = "INVALID_ASSET_ID"
            entry["reason"] = "asset id is not a safe directory name"
            entries.append(entry)
            continue

        model, status, reason = choose_model(item, candidates, not args.no_candidates)
        entry["status"] = status
        entry["reason"] = reason
        if not model:
            print(f"    missing: {reason}", flush=True)
            entries.append(entry)
            continue
        entry["model"] = model
        if args.dry_run:
            entry["status"] = "PLANNED"
            print(f"    planned: {model['status']} -> {model['path_relative']}",
                  flush=True)
            entries.append(entry)
            continue

        asset_dir = out_root / ("_candidates" if model["status"] == "STAGED_CANDIDATE"
                                else "") / item_id
        command = [
            sys.executable, str(RENDER),
            "--model", model["path"],
            "--asset-id", item_id,
            "--output", str(asset_dir),
            "--resolution", str(args.resolution),
        ]
        reference = entry["reference"]
        if reference:
            command += ["--reference", reference["path"]]
        code, detail = run(command)
        if code != 0:
            entry["status"] = "RENDER_FAILED"
            entry["reason"] = detail
            print(f"    RENDER FAILED ({code})", flush=True)
            entries.append(entry)
            continue

        code, detail = run([
            sys.executable, str(SHEET),
            "--asset-id", item_id,
            "--asset-dir", str(asset_dir),
        ])
        if code != 0:
            entry["status"] = "SHEET_FAILED"
            entry["reason"] = detail
            print(f"    SHEET FAILED ({code})", flush=True)
            entries.append(entry)
            continue

        report_path = asset_dir / "report.json"
        eval_command = [
            sys.executable, str(EVALUATE),
            "--asset-id", item_id,
            "--asset-dir", str(asset_dir),
            "--out", str(report_path),
        ]
        review_path = (review_dir / f"{item_id}.json") if review_dir else None
        if review_path and review_path.is_file():
            try:
                review_payload = json.loads(review_path.read_text())
            except ValueError:
                review_payload = {}
            flag = "--vision-review" if review_payload.get("vision_model") else "--scores"
            eval_command += [flag, str(review_path)]
        code, detail = run(eval_command)
        if code == 2 or not report_path.is_file():
            entry["status"] = "EVALUATE_FAILED" if not report_path.is_file() \
                else "EVALUATE_INVALID"
            entry["reason"] = detail
            print(f"    EVALUATE FAILED ({code})", flush=True)
            entries.append(entry)
            continue

        report = json.loads(report_path.read_text())
        sheet_path = asset_dir / "sheet.webp"
        entry["status"] = "QA_COMPLETE"
        entry["qa"] = {
            "asset_dir": str(asset_dir),
            "asset_dir_relative": rel(asset_dir),
            "decision": report["decision"],
            "score_source": report["score_source"],
            "defects": len(report["defects"]),
            "missing_evidence": len(report["missing_evidence"]),
            "evaluate_exit": code,
            "review_input": str(review_path) if review_path and review_path.is_file() else None,
            "report": file_record(report_path),
            "sheet": file_record(sheet_path) if sheet_path.is_file() else None,
        }
        print(f"    {report['decision']} -> {rel(report_path)}", flush=True)
        entries.append(entry)

    status_counts = Counter(entry["status"] for entry in entries)
    decisions = Counter(entry["qa"]["decision"] for entry in entries if entry["qa"])
    with_model = sum(1 for entry in entries if entry["model"])
    by_scene = {}
    for entry in entries:
        scene = entry["scene"] or "unknown"
        bucket = by_scene.setdefault(scene, {
            "total": 0, "with_model": 0, "missing": 0, "decisions": Counter()})
        bucket["total"] += 1
        if entry["model"]:
            bucket["with_model"] += 1
        else:
            bucket["missing"] += 1
        if entry["qa"]:
            bucket["decisions"][entry["qa"]["decision"]] += 1
    for bucket in by_scene.values():
        bucket["decisions"] = dict(sorted(bucket["decisions"].items()))

    index = {
        "schema_version": "tripo-qa-batch/1",
        "manifest": file_record(manifest_path),
        "parameters": {
            "resolution": args.resolution,
            "used_staged_candidates": not args.no_candidates,
            "candidates_file": (file_record(args.candidates.resolve())
                                if not args.no_candidates and args.candidates.is_file()
                                else None),
            "reviews_dir": str(review_dir) if review_dir else None,
            "only": sorted({item["id"] for item in items}) if args.only else None,
            "limit": args.limit,
            "dry_run": bool(args.dry_run),
        },
        "summary": {
            "total_3d": len(entries),
            "with_model": with_model,
            "missing_model": len(entries) - with_model,
            "qa_complete": status_counts.get("QA_COMPLETE", 0),
            "errors": sum(count for status, count in status_counts.items()
                          if status in FAILURE_STATUSES),
            "by_status": dict(sorted(status_counts.items())),
            "decisions": dict(sorted(decisions.items())),
            "by_scene": dict(sorted(by_scene.items())),
        },
        "assets": entries,
    }
    output_name = "plan.json" if args.dry_run else "index.json"
    (batch_dir / output_name).write_text(json.dumps(index, indent=2) + "\n")

    if not args.dry_run:
        fields = ["id", "scene", "status", "model_status", "model_path",
                  "decision", "report", "reason"]
        with (batch_dir / "index.csv").open("w", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=fields)
            writer.writeheader()
            for entry in entries:
                writer.writerow({
                    "id": entry["id"],
                    "scene": entry["scene"],
                    "status": entry["status"],
                    "model_status": entry["model"]["status"] if entry["model"] else "",
                    "model_path": entry["model"]["path_relative"] if entry["model"] else "",
                    "decision": entry["qa"]["decision"] if entry["qa"] else "",
                    "report": entry["qa"]["report"]["path_relative"] if entry["qa"] else "",
                    "reason": entry["reason"] or "",
                })

        lines = [
            "# Batch QA coverage",
            "",
            f"{len(entries)} 3D references from `{rel(manifest_path)}`.",
            "No generation, download, or paid call was made.",
            "",
            "## Summary",
            "",
            "| Metric | Count |",
            "| --- | ---: |",
            f"| References | {len(entries)} |",
            f"| With a local model | {with_model} |",
            f"| Missing a model | {len(entries) - with_model} |",
            f"| QA reports produced | {status_counts.get('QA_COMPLETE', 0)} |",
            f"| Tooling failures | {index['summary']['errors']} |",
            "",
            "## By scene",
            "",
            "| Scene | Total | With model | Missing | Decisions |",
            "| --- | ---: | ---: | ---: | --- |",
        ]
        for scene, bucket in by_scene.items():
            decisions_text = ", ".join(
                f"{name}={count}" for name, count in bucket["decisions"].items()) or "-"
            lines.append(f"| {scene} | {bucket['total']} | {bucket['with_model']} "
                         f"| {bucket['missing']} | {decisions_text} |")
        lines += ["", "## QA available now", ""]
        qa_entries = [entry for entry in entries if entry["qa"]]
        if qa_entries:
            lines += ["| Asset | Model source | Decision | Report |",
                      "| --- | --- | --- | --- |"]
            for entry in qa_entries:
                lines.append(
                    f"| {entry['id']} | {entry['model']['status']} | "
                    f"{entry['qa']['decision']} | `{entry['qa']['report']['path_relative']}` |")
        else:
            lines.append("No completed QA reports.")
        lines += ["", "## Missing models", ""]
        missing = [entry for entry in entries if not entry["model"]]
        if missing:
            for scene in sorted({entry["scene"] for entry in missing}):
                ids = ", ".join(entry["id"] for entry in missing
                                if entry["scene"] == scene)
                lines.append(f"- **{scene}**: {ids}")
        else:
            lines.append("None.")
        lines += [
            "",
            "## How to supply models",
            "",
            "1. Generate into each manifest `tripo.output` directory (expected filename",
            "   can be any single `.glb`; `model.glb` is preferred), then rerun this script.",
            "2. Or add an entry to `fixtures/staged_candidates.json` with provenance and",
            "   expected sha256, then rerun.",
            "3. Staged candidates are benchmark artifacts, not Tripo outputs; QA does not",
            "   make them production-approved.",
            "",
        ]
        (batch_dir / "summary.md").write_text("\n".join(lines))

    print()
    print(f"references : {len(entries)}")
    print(f"with model : {with_model}")
    print(f"missing    : {len(entries) - with_model}")
    print(f"QA reports : {status_counts.get('QA_COMPLETE', 0)}")
    print(f"errors     : {index['summary']['errors']}")
    for status, count in sorted(status_counts.items()):
        print(f"  {status:<24} {count}")
    print(f"index      : {batch_dir / output_name}")
    return 1 if index["summary"]["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())
