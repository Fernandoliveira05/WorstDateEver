#!/usr/bin/env python3
"""Build a labeled reference-vs-eight-angle contact sheet (WebP).

Example:
    python3 tools/tripo-qa/contact_sheet.py \
      --asset-id woven-basket \
      --asset-dir assets/tripo/qa/woven-basket

The reference is taken from the asset's ``captures.json`` (recorded by
``render_asset.py`` from the Tripo manifest) unless ``--reference`` is given.
Every source image hash is re-verified before the sheet is written.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from common import (
    ANGLES,
    QA_ROOT,
    ROOT,
    image_stats,
    is_reviewable,
    rel,
    sha256_file,
)

BACKGROUND = "#1b151d"
TEXT = "#f7efdf"
MUTED = "#b9acb9"
MISSING = "#c0392b"


def load_font(size: int):
    return ImageFont.load_default(size=size)


def verify_captures(asset_dir: Path) -> dict:
    path = asset_dir / "captures.json"
    if not path.is_file():
        raise SystemExit(f"Missing {path}; run render_asset.py first")
    data = json.loads(path.read_text())
    captures = data.get("captures", [])
    names = [capture["angle"] for capture in captures]
    if names != list(ANGLES):
        raise SystemExit(f"captures.json must contain the eight angles in order; found {names}")
    asset_root = asset_dir.resolve()
    for capture in captures:
        image = Path(capture["path"]).resolve()
        if image.parent != asset_root:
            raise SystemExit(
                f"Capture path escapes the asset directory: {image}. "
                f"Evidence directories are immutable; re-render into {asset_root}."
            )
        if capture.get("filename") != f"{capture['angle']}.png":
            raise SystemExit(f"Capture filename/angle mismatch: {capture}")
        if not image.is_file():
            raise SystemExit(f"Missing rendered image: {image}")
        actual = sha256_file(image)
        if actual != capture["sha256"]:
            raise SystemExit(f"Hash mismatch for {image}: expected {capture['sha256']}, got {actual}")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--asset-id", required=True)
    parser.add_argument("--asset-dir", type=Path, default=None)
    parser.add_argument("--reference", help="Override the reference recorded in captures.json")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--columns", type=int, default=3)
    parser.add_argument("--tile", type=int, default=440)
    args = parser.parse_args()

    if args.tile < 200:
        raise SystemExit("--tile must be >= 200")
    asset_dir = (args.asset_dir or (QA_ROOT / args.asset_id)).resolve()
    data = verify_captures(asset_dir)
    model_sha = data["model"]["sha256"]

    reference = None
    if args.reference:
        reference = Path(args.reference)
        if not reference.is_absolute():
            reference = (ROOT / reference).resolve()
    elif data.get("reference"):
        reference = Path(data["reference"]["path"])
    if reference and not reference.is_file():
        raise SystemExit(f"Reference not found: {reference}")
    if reference and data.get("reference"):
        if reference.resolve() == Path(data["reference"]["path"]).resolve():
            actual = sha256_file(reference)
            if actual != data["reference"]["sha256"]:
                raise SystemExit(f"Reference hash mismatch: {reference}")

    entries = []
    if reference:
        entries.append(("REFERENCE (art)", reference, sha256_file(reference)))
    else:
        entries.append(("REFERENCE MISSING", None, None))
    for capture in data["captures"]:
        entries.append((capture["angle"], Path(capture["path"]), capture["sha256"]))

    tile = args.tile
    label_h = 30
    cell_h = tile + label_h
    columns = max(1, args.columns)
    rows = (len(entries) + columns - 1) // columns
    header_h = 64
    footer_h = 50
    width = tile * columns
    height = header_h + cell_h * rows + footer_h
    sheet = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    draw.text((16, 15), f"{args.asset_id} / reference vs eight orthographic angles",
              fill=TEXT, font=load_font(22))
    draw.text((16, 43), "Blender neutral turntable / isolate-lit / hashes verified",
              fill=MUTED, font=load_font(14))

    for index, (label, source, digest) in enumerate(entries):
        x = (index % columns) * tile
        y = header_h + (index // columns) * cell_h
        if source is None:
            draw.rectangle([x + 8, y + 8, x + tile - 8, y + tile - 8],
                           outline=MISSING, width=3)
            draw.text((x + 24, y + tile // 2 - 12), label, fill=MISSING,
                      font=load_font(20))
        else:
            with Image.open(source) as image:
                thumb = image.convert("RGB")
                thumb.thumbnail((tile - 16, tile - 16))
                sheet.paste(thumb, (x + (tile - thumb.width) // 2,
                                    y + (tile - thumb.height) // 2))
            tint = TEXT if label.startswith("REFERENCE") else MUTED
            draw.text((x + 10, y + tile + 2), label, fill=tint, font=load_font(16))
            if digest:
                draw.text((x + tile - 78, y + tile + 4), digest[:8], fill=MUTED,
                          font=load_font(12))

    footer = (f"model sha256 {model_sha[:16]}...  |  {len(data['captures'])} angles  |  "
              f"sheet generated by tools/tripo-qa/contact_sheet.py")
    draw.text((16, height - footer_h + 16), footer, fill=MUTED, font=load_font(13))

    output = (args.out or (asset_dir / "sheet.webp")).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output, "WEBP", quality=90, method=6)

    unique_hashes = {digest for _, source, digest in entries if digest}
    duplicates = len(unique_hashes) < len(entries) - (0 if reference else 1)
    record = {
        "schema_version": "tripo-qa-sheet/1",
        "asset_id": args.asset_id,
        "sheet": {"path": str(output), "path_relative": rel(output),
                  "sha256": sha256_file(output), "bytes": output.stat().st_size,
                  "width": width, "height": height},
        "model_sha256": model_sha,
        "reference": ({"path": str(reference), "path_relative": rel(reference),
                       "sha256": sha256_file(reference)} if reference else None),
        "tiles": [
            {"label": label,
             "path": str(source) if source else None,
             "sha256": digest,
             "reviewable": bool(source and is_reviewable(image_stats(source)))}
            for label, source, digest in entries
        ],
        "duplicate_images": duplicates,
    }
    (asset_dir / "sheet.json").write_text(json.dumps(record, indent=2) + "\n")

    print(f"sheet      : {output} ({width}x{height}, {output.stat().st_size} bytes)")
    print(f"reference  : {reference if reference else 'MISSING'}")
    print(f"angles     : {len(data['captures'])}")
    print(f"sheet sha  : {record['sheet']['sha256']}")
    if duplicates:
        print("WARNING: duplicate angle images detected (fewer distinct hashes than tiles)",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
