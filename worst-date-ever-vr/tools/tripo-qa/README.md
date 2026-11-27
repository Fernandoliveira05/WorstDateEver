# Tripo QA harness

Independent render + evidence + evaluation loop for Tripo-generated GLBs.
It **never** calls Tripo, never spends credits, and never edits production
source or the existing hand-QA evidence.

Everything lives under `tools/tripo-qa/` and writes only to
`assets/tripo/qa/<asset-id>/` (or an explicit `--output`). `render_asset.py`
refuses outputs outside `assets/tripo/qa/` unless `--force` is given, so
existing hand-QA evidence cannot be overwritten by accident.

## Files

| File | Purpose |
| --- | --- |
| `render_asset.py` | Wraps `tools/hand-qa/render_glb_turntable.py`; renders 8 orthographic views; normalizes `captures.json`; records model/image sha256; runs a geometry probe. Accepts `--model`, `--asset-id`, `--output`. |
| `probe_glb.py` | Blender-side static facts: bbox in meters, triangles, materials, UVs, non-manifold/boundary edges, degenerate faces. Evidence for `scale` and `topology_artifacts`. |
| `contact_sheet.py` | Labeled 3x3 WebP contact sheet: reference art + the 8 angles. Re-verifies every hash before writing. |
| `evaluate.py` | Evaluation contract + schema-valid report. Evidence-only, manual, or pre-computed vision-model JSON. Never fabricates a pass. |
| `report.schema.json` | JSON Schema for reports (`tripo-qa-report/1`). |
| `common.py` | Shared paths, hashing, manifest/reference lookup, image reviewability. |
| `smoke_test.sh` | End-to-end smoke test on an existing candidate GLB. |
| `batch.py` | Runs render → sheet → evaluate over every 3D manifest reference. Reports `MISSING_MODEL` instead of inventing evidence; writes coverage index/CSV/Markdown. |
| `sourcing_audit.py` | Audits all 66 references against local generated files, staged benchmark candidates, and hand-QA catalog source rows. No network or downloads. |
| `source_grab3d.py` | Downloads CC0 Grab3D GLBs + license/manifest, verifies the CC0 text and GLB header, and stages them under `assets/hand-qa/candidates/`. |
| `capture_cdp.mjs` | Drives the existing WebXR benchmark capture through headless Chromium CDP (48 approaches + held/state views). |
| `sourced_qa.py` | Verifies sourced captures and writes schema-valid preliminary `qa_report.sourced.json` + `_sourced/index.json`. |
| `sourcing/grab3d_pilot.json` | Pilot manifest-id → Grab3D source map. |
| `sourcing/pilot_reviews.json` | Explicit preliminary scores/defects for the pilot; not an approval. |
| `../hand-qa/qa-assets.mjs` | QA-only registry for sourced candidates (`scene: 'qa'`, never loaded into a date). |
| `fixtures/staged_candidates.json` | Curated manifest-id → existing benchmark GLB map with provenance and expected sha256. Not Tripo outputs. |
| `fixtures/reject_review.json` | Deliberately failing fixture used to test the scored path. Not a real review. |

## Prerequisites

- Blender with glTF import: `/tmp/wde-blender-portable/blender` (override with
  `WDE_BLENDER` or `--blender`).
- Python 3 with Pillow (present in this environment).

## Exact commands for a generated GLB

Tripo writes into the manifest's `tripo.output` directory, for example
`assets/tripo/generated/picnic/01-woven-basket/`. `--model` accepts either the
`.glb` file or a directory containing exactly one `.glb`, so the exact exported
filename does not matter.

```bash
cd worst-date-ever-vr

python3 tools/tripo-qa/render_asset.py \
  --model assets/tripo/generated/picnic/01-woven-basket \
  --asset-id woven-basket

python3 tools/tripo-qa/contact_sheet.py \
  --asset-id woven-basket

# Evidence-only report: hashes + MISSING_EVIDENCE + exact to-do list.
python3 tools/tripo-qa/evaluate.py --asset-id woven-basket
```

The reference is resolved automatically from `assets/tripo/manifest.json` by
asset id, Tripo output basename, or reference stem. Override with
`--reference assets/tripo/references/...png` if needed.

### After a real visual review (manual or vision model)

Manual scores (a human opens `sheet.webp` and every PNG, then writes):

```json
{
  "reviewer": "Name or reviewer id",
  "reviewed_images": ["front", "back", "left", "right", "top", "bottom",
                      "three_quarter_left", "three_quarter_right"],
  "scores": {
    "silhouette": 4,
    "materials": 4,
    "detail": 4,
    "scale": 4,
    "topology_artifacts": 4,
    "completeness": 4,
    "style_match": 4
  },
  "defects": [
    {
      "image": "three_quarter_left",
      "region": "handle/rim junction",
      "severity": "minor",
      "defect": "handle intersects the rim by ~2 mm",
      "fix": "move handle anchor outward and re-export"
    }
  ],
  "notes": "Reviewed all eight renders at full size."
}
```

```bash
python3 tools/tripo-qa/evaluate.py \
  --asset-id woven-basket --scores path/to/review.json
```

For a multimodal model's output, use the same document with `vision_model`
instead of `reviewer` and:

```bash
python3 tools/tripo-qa/evaluate.py \
  --asset-id woven-basket --vision-review path/to/model_output.json
```

`reviewer` (manual) or `vision_model` (model) is mandatory, as is
`reviewed_images`, which must cover **all eight rendered images** by angle
name, filename, path, or sha256. A contact-sheet hash alone is not accepted.
This is what prevents a model or reviewer from claiming a pass without looking
at the renders.

### Outputs per asset

```
assets/tripo/qa/<asset-id>/
  front.png ... three_quarter_right.png   # 8 orthographic renders
  captures.raw.json                       # exact Blender output (with timestamp)
  captures.json                           # normalized, deterministic, hashes
  geometry.json                           # bbox / topology / material facts
  sheet.webp                              # reference + 8 angles, labeled
  sheet.json                              # tile + sheet hashes
  report.json                             # schema-valid evaluation
```

## Batch coverage for all 66 3D references

```bash
cd worst-date-ever-vr

# Plan only: no render, no writes to asset dirs.
python3 tools/tripo-qa/batch.py --dry-run

# Render + sheet + evidence report for every reference that has a model.
python3 tools/tripo-qa/batch.py --resolution 640

# Optional per-asset scored reviews: assets/tripo/qa/_reviews/<asset-id>.json
# Files containing "vision_model" go through --vision-review; others --scores.
python3 tools/tripo-qa/batch.py --reviews assets/tripo/qa/_reviews

# Sourcing/source coverage audit (local files only; no network).
python3 tools/tripo-qa/sourcing_audit.py
```

`batch.py` resolves a model from the manifest's `tripo.output` directory first.
If none exists, it uses `fixtures/staged_candidates.json` unless
`--no-candidates` is passed. Everything else is recorded as `MISSING_MODEL`;
there is no placeholder render and no invented score. Found assets go to:

- generated: `assets/tripo/qa/<asset-id>/`
- staged benchmark: `assets/tripo/qa/_candidates/<asset-id>/`

Batch outputs:

```
assets/tripo/qa/_batch/
  index.json      # per-reference status, model sha256, report/sheet hashes
  index.csv       # same coverage table for spreadsheets
  summary.md      # totals, per-scene coverage, missing-reference list

assets/tripo/qa/_sourcing/
  audit.json      # per-reference status + catalog suggestions + license record
  audit.csv       # one row per reference
  audit.md        # summary, source candidates, runtime-only, generation list
```

Current snapshot (before any Tripo generation): **66** 3D references, **5**
models available (all staged hand-QA benchmarks, 0 generated), **61** missing.
The audit classifies the 61 without a local model as **5** catalog source
candidates, **29** runtime substitutes only, **21** catalog name matches only,
and **6** with nothing found. These are snapshots, not permanent labels.

Important limits:

- Catalog suggestions are lexical (manifest id/name vs catalog id/name), not
  verified matches. They point to source pages to inspect; they are not a claim
  that the model matches the reference.
- The audit downloads nothing. License status comes from the local catalog and
  is mostly `PENDING_DOWNLOADED_LICENSE` (60 records warned); treat it as a
  blocker until reviewed.
- The five staged picnic/iClona candidates are benchmarks, not Tripo outputs.
  Their batch reports are evidence-only `MISSING_EVIDENCE` until a human or
  vision review supplies scores for all eight images.

## Internet-sourced hand-QA pilot

Tripo is not required for every reference. Grab3D exposes 2,565 English model
pages with **CC0-1.0 direct GLB downloads**, a license file, and a publisher
manifest — the same source as the picnic benchmark assets. The pilot proves the
full source → stage → synthetic grab/hold capture loop.

Pilot assets (pilot only; not production-approved):

| Reference | Grab3D source | Grip type |
| --- | --- | --- |
| `hardcover-book` | `props/book` | flat edge |
| `floor-cushion` | `furniture/pouf` | soft pinch |
| `sushi-platter` | `food/sushi-set` | tray edge |
| `cake-slice` | `food/cake-slice` | plate rim |
| `coffee-cup` | `food/tea-cup` | handle / rim |
| `fruit-bowl` | `food/cherry-bowl` | bowl rim |
| `flower-vase` | `furniture/vase` | cylinder / neck |
| `menu` | `props/open-book` | flat page/edge |
| `petiscos-bowl` | `food/mixing-bowl` | bowl rim |
| `beer-mug` | `props/camping-mug` (split one mug) | handle / body |
| `hot-sauce` | `food/condiment-bottles` (split red bottle) | bottle / neck |
| `beer-bucket` | `props/bucket` | side / bail |
| `bedside-lamp` | `furniture/table-lamp` | stem / shade |

```bash
cd worst-date-ever-vr

# 1. Download + verify CC0 + stage candidates (no Tripo, no paid call).
python3 tools/tripo-qa/source_grab3d.py

# 2. Terminal A: existing QA fixture with a new evidence revision.
WDE_QA_CAPTURE_REVISION=webxr-sourced node tools/hand-qa/serve.mjs

# 3. Terminal B: headless Chromium with WebGL.
chromium --headless=new --no-sandbox --disable-dev-shm-usage \
  --use-angle=swiftshader --enable-unsafe-swiftshader \
  --remote-debugging-port=9222 --user-data-dir=/tmp/wde-chrome about:blank

# 4. Capture one asset at a time (repeat for each id).
node tools/tripo-qa/capture_cdp.mjs --asset-id hardcover-book

# 5. Isolated neutral renders + indexed review packets.
/tmp/wde-blender-portable/blender --background --python-exit-code 1 \
  --python tools/hand-qa/render_glb_turntable.py -- \
  --model assets/hand-qa/candidates/hardcover-book.glb \
  --asset-id hardcover-book \
  --output assets/hand-qa/evidence/hardcover-book/candidates --resolution 400
python3 tools/hand-qa/review_packet.py hardcover-book \
  --capture-revision webxr-sourced --isolated-revision candidates \
  --model assets/hand-qa/candidates/hardcover-book.glb

# 6. Verify hashes and write preliminary reports/index.
python3 tools/tripo-qa/sourced_qa.py
```

Results from the pilot:

- **780 captures** (13 assets × 60), **624 approach views** (48 per asset),
  zero `untestable` approaches.
- 13 schema-valid preliminary reports, all `MISSING_EVIDENCE`.
- Defects: 1 blocking, 20 major, 5 minor.
- The book v1 had 13-46 mm fingertip gaps and no contact; v2 now contacts the
  front cover, but it is a cover press rather than a true edge pinch. The pouf
  hand is mostly occluded/inside; the platter, cake, cup and fruit-bowl hands
  cover or hover off their objects; the cup handle was selected in only 2/48
  approaches. Sourced materials diverge from the concept (blue book, light
  cake, pink cup, blue vase, mint bowl, open book).
- Outputs: `assets/tripo/qa/_sourced/index.json` and `summary.md`; reports at
  `assets/hand-qa/evidence/<id>/qa_report.sourced.json`.
- Book, fruit-bowl and hot-sauce use `webxr-sourced-v2`; the other ten use
  `webxr-sourced`. The old failing book/mustard-bottle passes are retained for
  audit.

`tools/hand-qa/qa-assets.mjs` is merged only by the QA fixture
(`tools/hand-qa/stage.js` / `benchmark.mjs`) and uses `scene: 'qa'`, so these
models do not enter any date. Existing game source was not changed.

The pilot covers thirteen internet-sourced assets (plus the five pre-existing
benchmark candidates) across six grip archetypes. It does **not** mean all 66
references have a sourced model: 48 still need per-reference curation, staging,
grip authoring and capture. Static references (trees, windows, kiosks) need
collision/occlusion validation rather than grab views.

## Acceptance thresholds

Each of the seven axes is an integer **1–5**:

`5` excellent · `4` good enough for the current style · `3` provisional ·
`2` poor · `1` unusable.

| Axis | What the reviewer must judge |
| --- | --- |
| `silhouette` | Recognizable at Quest distance; matches the reference's proportions. |
| `materials` | Correct matte palette/roughness; no washed-out, missing, or stretched textures. |
| `detail` | Hero detail survives at in-game scale; no baked noise or mush. |
| `scale` | Bbox matches intended real-world size (see `geometry.json`); no giant/tiny props. |
| `topology_artifacts` | No z-fighting, seams, holes, reversed normals, floating parts, degenerate faces. |
| `completeness` | All reference parts present, including interior/underside where visible. |
| `style_match` | Cozy, rounded, toy-like, muted teal/cream/lavender/warm-wood palette. |

Decision rules:

| Decision | Condition |
| --- | --- |
| `MISSING_EVIDENCE` | No scores; any null axis; reference missing; fewer than 8 distinct views; any view < 512 px or blank; contact sheet or geometry probe missing; reviewer did not attest all 8 images. |
| `REJECT` | Any `blocking` defect, or any axis `<= 2`. |
| `REWORK` | Any axis `= 3`, or any `major` defect (even if all scores are 4+). |
| `VISION_PASS_PENDING_HUMAN` | All 7 axes `>= 4`, no major/blocking defects, 8/8 images attested, reference + sheet + geometry present. |
| `APPROVED_BY_HUMAN` | Never emitted by this harness. Human art lead sign-off is a separate step. |

The maximum machine decision is `VISION_PASS_PENDING_HUMAN`, matching
`SCREENSHOT_VISION_EVALUATOR.md`. A passing report still needs a human.

`evaluate.py` exit codes: `0` pass-pending-human, `1` rework/reject, `2`
invalid input/schema failure, `3` missing evidence. `render_asset.py` exits
non-zero on any Blender/import/hash failure.

## Determinism and traceability

- `render_asset.py` records the sha256 of the GLB, each PNG, the normalized
  `captures.json`, and the reference. `probe_glb.py` records the GLB hash again.
- `contact_sheet.py` re-verifies all 8 PNG hashes before building the sheet and
  records the sheet hash + per-tile hashes in `sheet.json`.
- `evaluate.py` re-verifies the model, reference, all PNGs, `sheet.webp`, and
  `geometry.json`; any drift fails hard instead of silently scoring stale
  evidence.
- Blender embeds render date/time in PNG `tEXt`/EXIF chunks even when pixels
  are identical. `render_asset.py` strips only those volatile chunks, keeping
  `IHDR`/`IDAT` pixel data byte-for-byte untouched. Repeated runs at the same
  settings now produce identical image hashes (verified in the smoke test).
- Normalized outputs omit wall-clock timestamps. `captures.raw.json` preserves
  the original Blender metadata for audit; its `image_sha256` values describe
  the pre-normalization PNG files. The normalized `captures.json` hashes are
  authoritative. The existing turntable script's camera/light preset and Cycles
  seed are unchanged.
- Reports include absolute paths and project-relative paths for every image.

## Smoke test

```bash
cd worst-date-ever-vr
bash tools/tripo-qa/smoke_test.sh            # 640 px, fast
bash tools/tripo-qa/smoke_test.sh 768        # optional full default
```

It uses `assets/hand-qa/candidates/picnic_basket.glb` as the fixture, the
manifest's `woven-basket` reference, and writes everything to
`assets/tripo/qa/_smoke/`. It:

1. renders 8 views;
2. builds the contact sheet;
3. produces `report.evidence.json` (expected exit 3, `MISSING_EVIDENCE`);
4. runs the deliberately failing fixture `fixtures/reject_review.json` to test
   score/schema/decision handling, producing `report.fixture-reject.json`
   (expected exit 1, decision `REJECT`);
5. verifies 8 distinct image hashes, every image hash, and that the sheet's
   first tile is the reference.

`_smoke/` is test output, **not** an approval of the picnic basket asset. The
fixture's all-2 scores are fabricated only to exercise the reject path.

## Known limitations

- Scores are only as good as the reviewer. The harness only proves that the
  reviewer attested the exact images by hash; it cannot prove they looked.
- Interaction/grip approval and Quest runtime performance are out of scope
  (see `SCREENSHOT_VISION_EVALUATOR.md`).
- `scale` requires the intended real-world size; the geometry probe reports
  meters, but the reviewer must compare against the design intent.
- The Blender preset can wash out saturated textures. If the reference is
  vivid and all renders are pale, that is a renderer/material finding, not a
  reason to inflate `materials`.
- Sourcing suggestions are name-based only. A matching name can still be the
  wrong asset, scale, style, or license; a human must verify the source page and
  the model before adding it to `fixtures/staged_candidates.json`.
