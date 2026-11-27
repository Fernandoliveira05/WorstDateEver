#!/usr/bin/env python3
"""Download CC0 models from Grab3D and stage them as hand-QA candidates.

This never calls Tripo. It downloads the GLB plus its license and publisher
manifest, verifies the CC0 text and GLB header, then copies the GLB to
``assets/hand-qa/candidates/<asset-id>.glb`` for the existing capture fixture.

    python3 tools/tripo-qa/source_grab3d.py --dry-run
    python3 tools/tripo-qa/source_grab3d.py --only hardcover-book,cake-slice

Source files:  assets/hand-qa/sources/<asset-id>/
Candidate GLB: assets/hand-qa/candidates/<asset-id>.glb
Record:        assets/hand-qa/sources/<asset-id>/source-record.json
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import urllib.request
from hashlib import sha256
from pathlib import Path

from common import ROOT, find_manifest_item, rel

HERE = Path(__file__).resolve().parent
DEFAULT_MAP = HERE / "sourcing" / "grab3d_pilot.json"
SOURCES = ROOT / "assets" / "hand-qa" / "sources"
CANDIDATES = ROOT / "assets" / "hand-qa" / "candidates"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP)
    parser.add_argument("--only", help="Comma-separated manifest ids")
    parser.add_argument("--force", action="store_true",
                        help="Re-download and overwrite existing source/candidate files")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def digest_bytes(data: bytes) -> str:
    return sha256(data).hexdigest()


def digest_file(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "wde-tripo-qa-source/1"})
    with urllib.request.urlopen(request, timeout=90) as response:
        if response.status != 200:
            raise RuntimeError(f"HTTP {response.status}: {url}")
        return response.read()


def download_or_reuse(url: str, destination: Path, force: bool) -> tuple[bytes, bool]:
    if destination.is_file() and not force:
        return destination.read_bytes(), False
    data = fetch(url)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(data)
    return data, True


def main() -> int:
    args = parse_args()
    mapping = json.loads(args.map.resolve().read_text())
    entries = mapping.get("assets", {})
    if args.only:
        wanted = {part.strip() for part in args.only.split(",") if part.strip()}
        unknown = wanted - set(entries)
        if unknown:
            raise SystemExit(f"Unknown asset ids: {sorted(unknown)}")
        entries = {key: value for key, value in entries.items() if key in wanted}
    if not entries:
        raise SystemExit("No assets selected")

    failures = []
    for asset_id, entry in entries.items():
        print(f"== {asset_id} <- {entry['slug']} ({entry['category']})")
        source_dir = SOURCES / asset_id
        source_dir.mkdir(parents=True, exist_ok=True)
        slug_glb = source_dir / f"{entry['slug']}.glb"
        license_path = source_dir / "LICENSE.txt"
        manifest_path = source_dir / "publisher-manifest.json"

        if args.dry_run:
            print(f"   would download {entry['download']}")
            print(f"   -> {rel(source_dir)}/ and candidates/{asset_id}.glb")
            continue

        try:
            glb, downloaded = download_or_reuse(entry["download"], slug_glb, args.force)
            license_data, _ = download_or_reuse(entry["license_url"], license_path, args.force)
            manifest_data, _ = download_or_reuse(entry["manifest_url"], manifest_path, args.force)
        except Exception as error:  # noqa: BLE001 - report per-asset failures
            failures.append(f"{asset_id}: download failed: {error}")
            print(f"   FAILED: {error}", file=sys.stderr)
            continue

        if glb[:4] != b"glTF" or len(glb) < 20:
            failures.append(f"{asset_id}: not a valid GLB")
            print("   FAILED: invalid GLB header", file=sys.stderr)
            continue
        license_text = license_data.decode("utf-8", "replace")
        if "CC0" not in license_text or "Public Domain" not in license_text:
            failures.append(f"{asset_id}: license is not the expected CC0 text")
            print("   FAILED: unexpected license", file=sys.stderr)
            continue

        manifest = json.loads(manifest_data)
        expected_bytes = manifest.get("files", {}).get("glb", {}).get("bytes")
        if expected_bytes and expected_bytes != len(glb):
            failures.append(
                f"{asset_id}: size {len(glb)} != publisher manifest {expected_bytes}")
            print("   FAILED: size mismatch", file=sys.stderr)
            continue

        candidate = CANDIDATES / f"{asset_id}.glb"
        candidate.parent.mkdir(parents=True, exist_ok=True)
        copy_candidate = entry.get("adapt", "copy") == "copy"
        if copy_candidate and candidate.exists() and not args.force and \
                digest_file(candidate) != digest_bytes(glb):
            failures.append(
                f"{asset_id}: candidate exists with different hash; use --force")
            print("   FAILED: candidate exists with different bytes", file=sys.stderr)
            continue
        if copy_candidate:
            candidate.write_bytes(glb)

        manifest_item = find_manifest_item(asset_id)
        record = {
            "schema_version": "hand-qa-source/1",
            "asset_id": asset_id,
            "manifest_reference": manifest_item.get("reference") if manifest_item else None,
            "source": {
                "provider": "Grab3D",
                "page": entry["page"],
                "slug": entry["slug"],
                "category": entry["category"],
                "license": manifest.get("extras", {}).get("license", "CC0-1.0"),
                "download_url": entry["download"],
                "license_url": entry["license_url"],
                "manifest_url": entry["manifest_url"],
            },
            "files": {
                "source_glb": {
                    "path": rel(slug_glb),
                    "sha256": digest_bytes(glb),
                    "bytes": len(glb),
                },
                "license": {
                    "path": rel(license_path),
                    "sha256": digest_file(license_path),
                    "bytes": license_path.stat().st_size,
                },
                "publisher_manifest": {
                    "path": rel(manifest_path),
                    "sha256": digest_file(manifest_path),
                    "bytes": manifest_path.stat().st_size,
                },
            },
            "candidate": ({
                "path": rel(candidate),
                "sha256": digest_file(candidate),
                "bytes": candidate.stat().st_size,
                "adapted": False,
            } if copy_candidate and candidate.is_file() else None),
            "publisher": {
                "triangles": manifest.get("triangles"),
                "texture_px": manifest.get("texture_px"),
                "dimensions_m": manifest.get("extras", {}).get("dimensions_m"),
                "real_size": manifest.get("extras", {}).get("real_size"),
                "notes": manifest.get("extras", {}).get("notes"),
            },
            "note": ("Downloaded CC0 source; staged as a hand-QA benchmark candidate. "
                     "Not a Tripo output and not production-approved."),
        }
        (source_dir / "source-record.json").write_text(json.dumps(record, indent=2) + "\n")
        candidate_note = (record['candidate']['sha256'][:16]
                          if record['candidate'] else 'adaptation pending')
        print(f"   {'downloaded' if downloaded else 'reused'}  "
              f"glb {digest_bytes(glb)[:16]}  candidate {candidate_note}")

    if failures:
        print()
        for failure in failures:
            print(f"FAIL: {failure}", file=sys.stderr)
        return 1
    print(f"\n{len(entries)} source(s) staged under {rel(CANDIDATES)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
