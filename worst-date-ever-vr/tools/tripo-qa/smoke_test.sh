#!/usr/bin/env bash
# End-to-end smoke test on an existing candidate GLB. No Tripo/network calls.
#
#   bash tools/tripo-qa/smoke_test.sh [resolution]
#
# Expected: 8 distinct renders, a sheet containing the reference, an
# evidence-only report with decision MISSING_EVIDENCE (exit 3), and a fixture
# report with decision REJECT (exit 1). This does not approve the asset.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

RESOLUTION="${1:-640}"
BLENDER="${WDE_BLENDER:-/tmp/wde-blender-portable/blender}"
MODEL="assets/hand-qa/candidates/picnic_basket.glb"
REFERENCE="assets/tripo/references/wde-02-picnic-core/01-woven-basket.png"
ASSET_DIR="assets/tripo/qa/_smoke"

echo "== render =================================================="
python3 tools/tripo-qa/render_asset.py \
  --model "$MODEL" \
  --asset-id _smoke \
  --output "$ASSET_DIR" \
  --reference "$REFERENCE" \
  --resolution "$RESOLUTION" \
  --blender "$BLENDER"

echo "== contact sheet =========================================="
python3 tools/tripo-qa/contact_sheet.py \
  --asset-id _smoke \
  --asset-dir "$ASSET_DIR"

echo "== evaluate: evidence-only (expect exit 3) ================"
set +e
python3 tools/tripo-qa/evaluate.py \
  --asset-id _smoke \
  --asset-dir "$ASSET_DIR" \
  --out "$ASSET_DIR/report.evidence.json"
EVIDENCE_CODE=$?
set -e
if [ "$EVIDENCE_CODE" -ne 3 ]; then
  echo "FAIL: evidence-only report exited $EVIDENCE_CODE, expected 3 (MISSING_EVIDENCE)" >&2
  exit 1
fi

echo "== evaluate: reject fixture (expect exit 1) ==============="
set +e
python3 tools/tripo-qa/evaluate.py \
  --asset-id _smoke \
  --asset-dir "$ASSET_DIR" \
  --scores tools/tripo-qa/fixtures/reject_review.json \
  --out "$ASSET_DIR/report.fixture-reject.json"
FIXTURE_CODE=$?
set -e
if [ "$FIXTURE_CODE" -ne 1 ]; then
  echo "FAIL: fixture report exited $FIXTURE_CODE, expected 1 (REJECT)" >&2
  exit 1
fi

echo "== verify hashes, distinct angles, reference in sheet ======"
python3 - "$ASSET_DIR" <<'PY'
import hashlib
import json
import pathlib
import sys

asset_dir = pathlib.Path(sys.argv[1])
captures = json.loads((asset_dir / "captures.json").read_text())
images = captures["captures"]
assert len(images) == 8, f"expected 8 images, got {len(images)}"
hashes = [item["sha256"] for item in images]
assert len(set(hashes)) == 8, "rendered angles are not eight distinct images"
for item in images:
    path = pathlib.Path(item["path"])
    assert path.is_file(), f"missing {path}"
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == item["sha256"], f"hash mismatch {path}"

sheet_path = asset_dir / "sheet.webp"
sheet_record = json.loads((asset_dir / "sheet.json").read_text())
assert sheet_path.is_file(), "sheet.webp missing"
assert hashlib.sha256(sheet_path.read_bytes()).hexdigest() == sheet_record["sheet"]["sha256"]
assert sheet_record["reference"] is not None, "sheet has no reference"
assert sheet_record["tiles"][0]["label"].startswith("REFERENCE"), "first tile is not the reference"
assert sheet_record["model_sha256"] == captures["model"]["sha256"]
assert [tile["label"] for tile in sheet_record["tiles"][1:]] == [i["angle"] for i in images]

evidence_report = json.loads((asset_dir / "report.evidence.json").read_text())
fixture_report = json.loads((asset_dir / "report.fixture-reject.json").read_text())
assert evidence_report["decision"] == "MISSING_EVIDENCE", evidence_report["decision"]
assert fixture_report["decision"] == "REJECT", fixture_report["decision"]
assert evidence_report["model"]["sha256"] == captures["model"]["sha256"]
assert len(evidence_report["evidence"]) == 8
assert all(item["is_reviewable"] for item in evidence_report["evidence"])
assert {item["sha256"] for item in evidence_report["evidence"]} == set(hashes)

print("model sha256     :", captures["model"]["sha256"])
print("distinct images  :", len(set(hashes)), "/", len(hashes))
for item in images:
    print(f"  {item['angle']:<20} {item['sha256']}  {item['width']}x{item['height']}")
print("sheet sha256     :", sheet_record["sheet"]["sha256"])
print("reference sha256 :", sheet_record["reference"]["sha256"])
print("evidence report  :", evidence_report["decision"])
print("fixture report   :", fixture_report["decision"])
PY

echo
echo "SMOKE PASS: see $ASSET_DIR/"
