#!/usr/bin/env python3
"""Build preliminary hand-contact reports and an index for sourced pilot assets.

It verifies every capture against the candidate hash, builds a
``qa_report.sourced.json`` in each evidence folder (validated against
``assets/hand-qa/contracts/vision_review.schema.json``), and writes a summary
under ``assets/tripo/qa/_sourced/``.

No Tripo calls, no network, no downloads. The source models were downloaded by
``source_grab3d.py`` and captured with the existing WebXR fixture.

    python3 tools/tripo-qa/sourced_qa.py
"""
from __future__ import annotations

import json
import re
import sys
from collections import Counter
from hashlib import sha256
from pathlib import Path

from common import MANIFEST, ROOT, find_manifest_item, rel, sha256_file
from evaluate import validate

HERE = Path(__file__).resolve().parent
PILOT = HERE / "sourcing" / "grab3d_pilot.json"
REVIEWS = HERE / "sourcing" / "pilot_reviews.json"
SCHEMA = ROOT / "assets" / "hand-qa" / "contracts" / "vision_review.schema.json"
OUT = ROOT / "assets" / "tripo" / "qa" / "_sourced"
DEFAULT_REVISION = "webxr-sourced"
REVISIONS = {"hardcover-book": "webxr-sourced-v2", "fruit-bowl": "webxr-sourced-v2", "hot-sauce": "webxr-sourced-v2",
             "floor-cushion": "webxr-sourced-v7", "beer-mug": "webxr-sourced-v5"}
SHEETS = ("left--30", "left-0", "left-30", "right--30", "right-0", "right-30")


def file_record(path: Path) -> dict:
    return {
        "path": str(path.resolve()),
        "path_relative": rel(path),
        "sha256": sha256_file(path),
        "bytes": path.stat().st_size,
    }


def main() -> int:
    mapping = json.loads(PILOT.read_text())["assets"]
    reviews = json.loads(REVIEWS.read_text())["assets"]
    manifest = json.loads(MANIFEST.read_text())
    schema = json.loads(SCHEMA.read_text())
    OUTPUT = OUT
    OUTPUT.mkdir(parents=True, exist_ok=True)

    assets = []
    errors = []
    for asset_id, source in mapping.items():
        print(f"== {asset_id}")
        review_data = reviews.get(asset_id)
        if not review_data:
            print("   skipped: review data not written yet")
            continue

        source_dir = ROOT / "assets" / "hand-qa" / "sources" / asset_id
        source_record_path = source_dir / "source-record.json"
        candidate = ROOT / "assets" / "hand-qa" / "candidates" / f"{asset_id}.glb"
        evidence_dir = ROOT / "assets" / "hand-qa" / "evidence" / asset_id
        revision = REVISIONS.get(asset_id, DEFAULT_REVISION)
        revision_dir = evidence_dir / revision
        packet_dir = evidence_dir / f"review-{revision}"
        packet_index_path = packet_dir / "index.json"

        for path in (source_record_path, candidate, packet_index_path):
            if not path.is_file():
                errors.append(f"{asset_id}: missing {rel(path)}")
        if errors and errors[-1].startswith(asset_id):
            continue

        source_record = json.loads(source_record_path.read_text())
        candidate_sha = sha256_file(candidate)
        if source_record["candidate"]["sha256"] != candidate_sha:
            errors.append(f"{asset_id}: candidate hash differs from source record")
            continue
        if not (source_record.get("source", {}).get("license") or "").startswith("CC0"):
            errors.append(f"{asset_id}: source record is not CC0")
            continue

        approach_jsons = sorted(revision_dir.glob("*__grip.json"))
        if len(approach_jsons) != 48:
            errors.append(f"{asset_id}: expected 48 approach captures, found {len(approach_jsons)}")
            continue
        pngs = sorted(revision_dir.glob("*.png"))
        for metadata_path in approach_jsons:
            metadata = json.loads(metadata_path.read_text())
            image_path = metadata_path.with_suffix(".png")
            if metadata.get("asset_sha256") != candidate_sha:
                errors.append(f"{asset_id}: {metadata_path.name} has wrong asset hash")
                break
            if not image_path.is_file() or sha256_file(image_path) != metadata.get("image_sha256"):
                errors.append(f"{asset_id}: {image_path.name} hash mismatch")
                break
        else:
            packet = json.loads(packet_index_path.read_text())
            if packet.get("asset_sha256") != candidate_sha:
                errors.append(f"{asset_id}: review packet asset hash mismatch")
                continue
            if len(packet.get("captures", [])) != 68:
                errors.append(
                    f"{asset_id}: review packet has {len(packet.get('captures', []))} captures, expected 68")
                continue

            isolated = packet_dir / "isolated.webp"
            sheet_paths = {sheet: packet_dir / f"{sheet}.webp" for sheet in SHEETS}
            missing_sheets = [name for name, path in sheet_paths.items() if not path.is_file()]
            if missing_sheets or not isolated.is_file():
                errors.append(f"{asset_id}: missing review sheets {missing_sheets}")
                continue

            evidence = [{
                "filename": rel(isolated),
                "capture_type": "model",
                "angle": "isolated",
                "hand": "none",
                "input_mode": "not_applicable",
                "is_reviewable": True,
            }]
            for sheet, path in sheet_paths.items():
                evidence.append({
                    "filename": rel(path),
                    "capture_type": "held",
                    "angle": sheet,
                    "hand": sheet.split("-")[0],
                    "input_mode": "synthetic",
                    "is_reviewable": True,
                })

            defects = []
            for defect in review_data["defects"]:
                token = defect["image"]
                if token == "isolated":
                    image_path = isolated
                elif token in sheet_paths:
                    image_path = sheet_paths[token]
                else:
                    errors.append(f"{asset_id}: unknown defect image token {token}")
                    image_path = None
                if image_path:
                    defects.append({
                        "image": rel(image_path),
                        "region": defect["region"],
                        "severity": defect["severity"],
                        "defect": defect["defect"],
                        "fix": defect["fix"],
                    })

            missing_evidence = [
                "Full-resolution inspection of all 60 WebXR captures is still required; the review used downscaled sheets.",
                "Physical Quest controller and tracked-hand validation were not performed.",
                "The Grab3D license text was parsed as CC0-1.0 but not legally reviewed.",
            ]
            report = {
                "asset_id": asset_id,
                "candidate_hash": candidate_sha,
                "source_url": source["page"],
                "license_check": "UNKNOWN",
                "engine": "WebXR synthetic fixture (headless Chromium) + Blender isolated sheets",
                "vision_model": "manual preliminary contact-sheet review",
                "evidence": evidence,
                "scores": review_data["scores"],
                "defects": defects,
                "missing_evidence": missing_evidence,
                "decision": "MISSING_EVIDENCE",
                "next_actions": review_data["next_actions"] + [
                    "Inspect every full-resolution capture, then test on physical Quest 3.",
                ],
                "human_reviewer": None,
                "quest_runtime_test": "NOT_TESTED",
            }
            validation_errors = validate(report, schema, schema)
            if validation_errors:
                errors.append(f"{asset_id}: report schema: {validation_errors[:3]}")
                continue

            report_path = evidence_dir / "qa_report.sourced.json"
            report_path.write_text(json.dumps(report, indent=2) + "\n")
            item = find_manifest_item(asset_id)
            reference = None
            if item:
                ref_path = (ROOT / item["reference"]).resolve()
                reference = file_record(ref_path) if ref_path.is_file() else None

            assets.append({
                "id": asset_id,
                "reference": reference,
                "source": {
                    "page": source["page"],
                    "license": source_record["source"]["license"],
                    "source_record": file_record(source_record_path),
                    "candidate": {
                        "path": rel(candidate),
                        "sha256": candidate_sha,
                        "bytes": candidate.stat().st_size,
                    },
                },
                "capture": {
                    "revision": revision,
                    "directory": rel(revision_dir),
                    "pngs": len(pngs),
                    "approaches": len(approach_jsons),
                    "review_packet": file_record(packet_index_path),
                },
                "report": file_record(report_path),
                "decision": report["decision"],
                "scores": report["scores"],
                "defects": report["defects"],
            })
            print(f"   {len(pngs)} captures, {len(approach_jsons)} approaches, "
                  f"{len(defects)} defects -> {rel(report_path)}")

    if errors:
        print()
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    severity = Counter(defect["severity"] for asset in assets
                       for defect in asset["defects"])
    index = {
        "schema_version": "tripo-qa-sourced/1",
        "revisions": REVISIONS,
        "default_revision": DEFAULT_REVISION,
        "source_map": file_record(PILOT),
        "review_input": file_record(REVIEWS),
        "summary": {
            "assets": len(assets),
            "captures": sum(asset["capture"]["pngs"] for asset in assets),
            "approaches": sum(asset["capture"]["approaches"] for asset in assets),
            "reports": sum(1 for asset in assets if asset["report"]),
            "decisions": dict(sorted(Counter(asset["decision"] for asset in assets).items())),
            "defect_severities": dict(sorted(severity.items())),
        },
        "assets": assets,
    }
    (OUTPUT / "index.json").write_text(json.dumps(index, indent=2) + "\n")

    lines = [
        "# Sourced hand-QA pilot",
        "",
        "Thirteen Grab3D CC0 props were downloaded, staged as QA-only candidates, and",
        "captured with the existing synthetic WebXR hand fixture. No Tripo calls,",
        "no game-date integration, no production approval.",
        "",
        "## Summary",
        "",
        "| Metric | Count |",
        "| --- | ---: |",
        f"| Assets | {index['summary']['assets']} |",
        f"| WebXR captures | {index['summary']['captures']} |",
        f"| Approach views | {index['summary']['approaches']} |",
        f"| Preliminary reports | {index['summary']['reports']} |",
        f"| Decisions | {', '.join(f'{k}={v}' for k, v in index['summary']['decisions'].items())} |",
        f"| Defects | {', '.join(f'{k}={v}' for k, v in index['summary']['defect_severities'].items())} |",
        "",
        "## Assets",
        "",
        "| Asset | Source | Captures | Decision | Defects | Report |",
        "| --- | --- | ---: | --- | ---: | --- |",
    ]
    for asset in assets:
        lines.append(
            f"| {asset['id']} | {asset['source']['page']} | {asset['capture']['pngs']} | "
            f"{asset['decision']} | {len(asset['defects'])} | "
            f"`{asset['report']['path_relative']}` |")
    lines += [
        "",
        "## Interpretation",
        "",
        "- `MISSING_EVIDENCE` is deliberate: every full-resolution view and physical",
        "  Quest validation are still outstanding, matching the prior benchmark",
        "  convention. The scores and defects are preliminary, not an approval.",
        "- The main mechanics failures are hand penetration/occlusion on the pouf,",
        "  platter, cake plate and cup, plus a low handle-selection rate on the cup.",
        "- Sourced materials also diverge from the concept art (blue book, light",
        "  cake, pink cup); those are visual findings for the next sourcing pass.",
        "",
        "## Reproduce",
        "",
        "```bash",
        "python3 tools/tripo-qa/source_grab3d.py",
        "# Use webxr-sourced-v2 for hardcover-book; webxr-sourced for the other four.",
        "WDE_QA_CAPTURE_REVISION=<revision> node tools/hand-qa/serve.mjs",
        "# browser automation calls captureBenchmark per asset",
        "python3 tools/hand-qa/review_packet.py <asset-id> --capture-revision <revision> --isolated-revision candidates --model assets/hand-qa/candidates/<asset-id>.glb",
        "python3 tools/tripo-qa/sourced_qa.py",
        "```",
        "",
    ]
    (OUTPUT / "summary.md").write_text("\n".join(lines))

    print()
    for key, value in index["summary"].items():
        print(f"{key}: {value}")
    print(f"index: {OUTPUT / 'index.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
