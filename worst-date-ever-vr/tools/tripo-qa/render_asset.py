#!/usr/bin/env python3
"""Render eight orthographic QA views of a GLB and record traceable hashes.

Wraps the existing Blender turntable script:
``tools/hand-qa/render_glb_turntable.py``.

Output (under ``assets/tripo/qa/<asset-id>/`` by default):

    front.png ... three_quarter_right.png
    captures.json        normalized, deterministic (no wall-clock timestamps)
    captures.raw.json    exactly what Blender emitted, for audit
    geometry.json        bbox / triangle / material / UV facts from Blender

Example:
    python3 tools/tripo-qa/render_asset.py \
      --model assets/tripo/generated/picnic/01-woven-basket/model.glb \
      --asset-id woven-basket
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

from common import (
    ANGLES,
    CAPTURES_SCHEMA_VERSION,
    QA_ROOT,
    ROOT,
    image_stats,
    rel,
    resolve_model_path,
    resolve_reference,
    sha256_file,
    strip_png_volatile_metadata,
)

DEFAULT_BLENDER = "/tmp/wde-blender-portable/blender"
DEFAULT_RENDERER = ROOT / "tools" / "hand-qa" / "render_glb_turntable.py"
PROBE = Path(__file__).resolve().parent / "probe_glb.py"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--model", required=True,
                        help="GLB file, or a directory containing exactly one .glb")
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--output", type=Path,
                        help="Output directory (default: assets/tripo/qa/<asset-id>)")
    parser.add_argument("--reference", help="Reference image; defaults to manifest lookup")
    parser.add_argument("--resolution", type=int, default=768)
    parser.add_argument("--blender", default=os.environ.get("WDE_BLENDER", DEFAULT_BLENDER))
    parser.add_argument("--renderer-script", type=Path, default=DEFAULT_RENDERER)
    parser.add_argument("--view-transform", default="Standard",
                        help="Blender view transform for faithful material colours (default: Standard)")
    parser.add_argument("--light-scale", type=float, default=0.2,
                        help="Scale the neutral turntable light energies (default: 0.2)")
    parser.add_argument("--skip-probe", action="store_true",
                        help="Skip the second Blender run that records geometry facts")
    parser.add_argument("--force", action="store_true",
                        help="Allow writing outside assets/tripo/qa (e.g. a temp test dir)")
    return parser.parse_args()


def run(command: list[str], label: str) -> subprocess.CompletedProcess:
    print(f"[{label}] {' '.join(command)}", flush=True)
    result = subprocess.run(command, text=True, capture_output=True)
    if result.returncode != 0:
        raise SystemExit(
            f"{label} failed with exit code {result.returncode}\n"
            f"--- stdout ---\n{result.stdout[-4000:]}\n"
            f"--- stderr ---\n{result.stderr[-4000:]}"
        )
    return result


def main() -> int:
    args = parse_args()
    if not 256 <= args.resolution <= 2048:
        raise SystemExit("--resolution must be between 256 and 2048")

    model = resolve_model_path(args.model)
    if not model.is_file():
        raise SystemExit(f"Model not found: {model}")
    blender = Path(args.blender)
    if not blender.is_file():
        raise SystemExit(f"Blender not found: {blender} (set WDE_BLENDER or --blender)")
    renderer = args.renderer_script.resolve()
    if not renderer.is_file():
        raise SystemExit(f"Renderer script not found: {renderer}")

    output = args.output or (QA_ROOT / args.asset_id)
    output = output.resolve()
    if output in {Path("/"), ROOT, ROOT / "assets"}:
        raise SystemExit(f"Refusing unsafe output directory: {output}")
    try:
        output.relative_to(QA_ROOT.resolve())
    except ValueError:
        if not args.force:
            raise SystemExit(
                f"Output must stay under {QA_ROOT} so existing evidence cannot be "
                f"overwritten: {output}. Pass --force for a deliberate temp/test dir."
            ) from None
    output.mkdir(parents=True, exist_ok=True)

    # Only clear files this harness owns; reports/sheets are preserved.
    for name in (*[f"{angle}.png" for angle in ANGLES],
                 "captures.json", "captures.raw.json", "geometry.json"):
        (output / name).unlink(missing_ok=True)

    reference = resolve_reference(args.asset_id, args.reference)
    if reference and not reference.is_file():
        raise SystemExit(f"Reference image not found: {reference}")

    result = run([
        str(blender), "--background", "--python-exit-code", "1",
        "--python", str(renderer), "--",
        "--model", str(model), "--output", str(output),
        "--resolution", str(args.resolution), "--asset-id", args.asset_id,
        "--view-transform", args.view_transform, "--light-scale", str(args.light_scale),
    ], "blender-render")

    raw_path = output / "captures.json"
    if not raw_path.is_file():
        raise SystemExit("Renderer did not produce captures.json")
    raw = json.loads(raw_path.read_text())
    raw_path.replace(output / "captures.raw.json")

    by_name = {Path(item["filename"]).stem: item for item in raw}
    missing = [angle for angle in ANGLES if angle not in by_name]
    extra = sorted(set(by_name) - set(ANGLES))
    if missing or extra:
        raise SystemExit(f"Unexpected capture set. missing={missing} extra={extra}")

    model_sha = sha256_file(model)
    captures = []
    for angle in ANGLES:
        image = output / f"{angle}.png"
        if not image.is_file():
            raise SystemExit(f"Renderer did not write {image}")
        item = by_name[angle]
        if item.get("asset_sha256") != model_sha:
            raise SystemExit(f"Renderer hash mismatch for {angle}")
        strip_png_volatile_metadata(image)
        stats = image_stats(image)
        captures.append({
            "angle": angle,
            "filename": image.name,
            "path": str(image.resolve()),
            "path_relative": rel(image),
            "sha256": sha256_file(image),
            "width": stats["width"],
            "height": stats["height"],
            "mean_luma": stats["mean_luma"],
            "stddev_luma": stats["stddev_luma"],
            "camera_position": item.get("camera_position"),
            "camera_rotation_euler": item.get("camera_rotation_euler"),
            "orthographic_scale": item.get("orthographic_scale"),
            "objects": item.get("objects", []),
        })

    normalized = {
        "schema_version": CAPTURES_SCHEMA_VERSION,
        "asset_id": args.asset_id,
        "model": {
            "path": str(model),
            "path_relative": rel(model),
            "sha256": model_sha,
            "bytes": model.stat().st_size,
        },
        "reference": ({
            "path": str(reference),
            "path_relative": rel(reference),
            "sha256": sha256_file(reference),
            "bytes": reference.stat().st_size,
        } if reference else None),
        "renderer": {
            "script": rel(renderer),
            "engine": raw[0].get("renderer"),
            "blender_version": raw[0].get("engine"),
            "resolution": args.resolution,
            "projection": "orthographic",
            "angles": list(ANGLES),
            "lighting": "neutral turntable", "view_transform": args.view_transform, "light_scale": args.light_scale,
        },
        "png_normalization": {
            "volatile_chunks_stripped": True,
            "note": ("Date/RenderTime/EXIF/physical-size PNG chunks are removed; "
                     "IDAT pixel data is untouched. captures.raw.json image_sha256 "
                     "values describe the pre-normalization files."),
        },
        "captures": captures,
    }
    (output / "captures.json").write_text(json.dumps(normalized, indent=2) + "\n")

    geometry_ok = False
    if not args.skip_probe:
        geometry_path = output / "geometry.json"
        try:
            run([
                str(blender), "--background", "--python-exit-code", "1",
                "--python", str(PROBE), "--",
                "--model", str(model), "--output", str(geometry_path),
            ], "blender-probe")
            geometry = json.loads(geometry_path.read_text())
            if geometry.get("asset_sha256") != model_sha:
                raise SystemExit("Geometry probe hash mismatch")
            geometry_ok = True
        except SystemExit as error:
            geometry_path.unlink(missing_ok=True)
            print(f"WARNING: geometry probe failed (renders are still valid): {error}",
                  file=sys.stderr)

    print()
    print(f"asset_id     : {args.asset_id}")
    print(f"model        : {model}")
    print(f"model sha256 : {model_sha}")
    print(f"reference    : {reference if reference else 'MISSING (manifest lookup found none)'}")
    print(f"output       : {output}")
    print(f"images       : {len(captures)}")
    for capture in captures:
        print(f"  {capture['angle']:<20} {capture['sha256']}  {capture['width']}x{capture['height']}")
    print(f"geometry     : {'geometry.json' if geometry_ok else 'not recorded'}")
    print(f"captures     : {output / 'captures.json'}")
    if not reference:
        print("WARNING: no reference image recorded; evaluation will mark it missing.",
              file=sys.stderr)
    if result.stdout:
        tail = [line for line in result.stdout.splitlines() if line.strip()][-3:]
        for line in tail:
            print(f"[blender] {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
