"""Shared helpers for the Tripo QA harness.

Everything in this folder is self-contained and writes only under
``assets/tripo/qa`` (or an explicit ``--output``). It never calls Tripo and
never modifies production source.
"""
from __future__ import annotations

import json
import struct
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / "assets" / "tripo" / "manifest.json"
QA_ROOT = ROOT / "assets" / "tripo" / "qa"

ANGLES = (
    "front",
    "back",
    "left",
    "right",
    "top",
    "bottom",
    "three_quarter_left",
    "three_quarter_right",
)

SCORE_AXES = (
    "silhouette",
    "materials",
    "detail",
    "scale",
    "topology_artifacts",
    "completeness",
    "style_match",
)

REPORT_SCHEMA_VERSION = "tripo-qa-report/1"
CAPTURES_SCHEMA_VERSION = "tripo-qa-captures/1"


def sha256_file(path: Path) -> str:
    h = sha256()
    with Path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


# PNG chunks kept when normalizing. IDAT/IHDR carry the pixels; the rest are
# color/alpha metadata. eXIf/oFFs/pHYs/tEXt/tIME carry render time or host
# details and are dropped so repeated renders hash identically.
_PNG_KEEP = {b"IHDR", b"PLTE", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP",
             b"bKGD", b"IDAT", b"IEND"}


def strip_png_volatile_metadata(path: Path) -> bool:
    """Drop timestamp/host PNG chunks without decoding pixel data.

    Returns True when the file was rewritten. Chunk CRCs stay valid because
    retained chunks are copied byte-for-byte.
    """
    data = Path(path).read_bytes()
    signature = b"\x89PNG\r\n\x1a\n"
    if not data.startswith(signature):
        return False
    kept = [signature]
    position = 8
    changed = False
    while position < len(data):
        if position + 12 > len(data):
            raise ValueError(f"Truncated PNG: {path}")
        length = struct.unpack(">I", data[position:position + 4])[0]
        chunk_type = data[position + 4:position + 8]
        end = position + 12 + length
        if end > len(data):
            raise ValueError(f"Truncated PNG chunk in {path}")
        chunk = data[position:end]
        if chunk_type in _PNG_KEEP:
            kept.append(chunk)
        else:
            changed = True
        position = end
    if changed:
        Path(path).write_bytes(b"".join(kept))
    return changed


def rel(path: Path | str) -> str:
    """Project-relative path when possible, absolute otherwise."""
    p = Path(path).resolve()
    try:
        return str(p.relative_to(ROOT))
    except ValueError:
        return str(p)


def manifest_items() -> list[dict]:
    payload = json.loads(MANIFEST.read_text())
    return payload.get("items", [])


def _candidate_keys(item: dict) -> set[str]:
    keys = {item.get("id", "")}
    output = (item.get("tripo") or {}).get("output", "")
    if output:
        keys.add(Path(output).name)
    reference = item.get("reference", "")
    if reference:
        keys.add(Path(reference).stem)
    return {k for k in keys if k}


def find_manifest_item(asset_id: str) -> dict | None:
    """Match a manifest row by id, Tripo output basename, or reference stem."""
    for item in manifest_items():
        if asset_id in _candidate_keys(item):
            return item
    return None


def resolve_reference(asset_id: str, explicit: str | None = None) -> Path | None:
    if explicit:
        path = Path(explicit)
        if not path.is_absolute():
            path = ROOT / path
        return path.resolve()
    item = find_manifest_item(asset_id)
    if not item or not item.get("reference"):
        return None
    path = ROOT / item["reference"]
    return path.resolve()


def find_generated_model(item: dict) -> tuple[Path | None, str | None]:
    """Locate the Tripo output GLB for a manifest item.

    Returns (path, None) or (None, reason). Multiple GLBs are ambiguous unless
    one is the conventional ``model.glb``/``mesh.glb``/``output.glb``.
    """
    output = (item.get("tripo") or {}).get("output")
    if not output:
        return None, "manifest item has no tripo.output"
    directory = (ROOT / output).resolve()
    if not directory.is_dir():
        return None, f"output directory missing: {rel(directory)}"
    glbs = sorted(directory.rglob("*.glb"))
    if not glbs:
        return None, f"no .glb under: {rel(directory)}"
    if len(glbs) == 1:
        return glbs[0], None
    preferred = [p for p in glbs if p.name.lower() in
                 {"model.glb", "mesh.glb", "output.glb"}]
    if len(preferred) == 1:
        return preferred[0], None
    return None, f"ambiguous: {len(glbs)} .glb files under {rel(directory)}"


def load_staged_candidates(path: Path) -> dict[str, dict]:
    """Load a curated manifest-id -> existing GLB mapping.

    Each entry carries provenance and an optional expected sha256. Missing
    files/hash mismatches are reported by the caller, never silently accepted.
    """
    if not path.is_file():
        return {}
    payload = json.loads(path.read_text())
    candidates = payload.get("candidates", payload)
    if not isinstance(candidates, dict):
        raise ValueError(f"Invalid candidate mapping: {path}")
    result = {}
    for asset_id, entry in candidates.items():
        if not isinstance(entry, dict) or not entry.get("path"):
            raise ValueError(f"Invalid candidate entry for {asset_id}")
        model = Path(entry["path"])
        if not model.is_absolute():
            model = (ROOT / model).resolve()
        record = dict(entry)
        record["path"] = str(model)
        record["exists"] = model.is_file()
        record["sha256"] = sha256_file(model) if record["exists"] else None
        expected = entry.get("expected_sha256")
        record["sha_match"] = (record["sha256"] == expected) if expected else None
        result[asset_id] = record
    return result


def resolve_model_path(raw: str) -> Path:
    """Accept a .glb file or a directory containing exactly one .glb."""
    path = Path(raw)
    if not path.is_absolute():
        path = (ROOT / path).resolve()
    if path.is_dir():
        glbs = sorted(path.glob("*.glb"))
        if len(glbs) != 1:
            raise SystemExit(
                f"Model directory must contain exactly one .glb: {path} "
                f"(found {len(glbs)})"
            )
        path = glbs[0]
    return path.resolve()


def image_stats(path: Path) -> dict:
    """Basic reviewability metrics. Never fabricates content assessment."""
    from PIL import Image, ImageStat

    with Image.open(path) as image:
        width, height = image.size
        rgb = image.convert("RGB")
        stat = ImageStat.Stat(rgb.convert("L"))
        mean = float(stat.mean[0])
        stddev = float(stat.stddev[0])
        extrema = rgb.convert("L").getextrema()
    return {
        "width": width,
        "height": height,
        "mean_luma": round(mean, 3),
        "stddev_luma": round(stddev, 3),
        "luma_range": [int(extrema[0]), int(extrema[1])],
        "pixels": width * height,
    }


def is_reviewable(stats: dict, min_side: int = 256, min_stddev: float = 2.0) -> bool:
    return (
        stats["width"] >= min_side
        and stats["height"] >= min_side
        and stats["stddev_luma"] >= min_stddev
    )
