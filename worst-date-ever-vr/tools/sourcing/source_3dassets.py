#!/usr/bin/env python3
"""Download the best CC0 3dassets.dev match for every WDE reference.

The mapping is deliberately explicit: automatic lexical matching is only used
to *suggest* candidates, never to silently choose an asset. Models are staged
under assets/hand-qa/sources/<id>/ and copied to candidates/<id>.glb so the
existing render/hand-QA harness can evaluate them.

    python3 tools/sourcing/source_3dassets.py --dry-run
    python3 tools/sourcing/source_3dassets.py --download
"""
from __future__ import annotations

import argparse
import json
import shutil
import urllib.request
from hashlib import sha256
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / 'assets' / 'sourcing' / 'packs'
SOURCES = ROOT / 'assets' / 'hand-qa' / 'sources'
CANDIDATES = ROOT / 'assets' / 'hand-qa' / 'candidates'
STAGED = ROOT / 'tools' / 'tripo-qa' / 'fixtures' / 'staged_candidates.json'
PLAN = ROOT / 'assets' / 'sourcing' / 'plan.json'

# id -> (pack slug, exact 3dassets title)
MAP: dict[str, tuple[str, str]] = {
    # bedroom
    'bed': ('bedroom-and-living-room-furniture', 'Double Bed Upholstered'),
    'desk': ('bedroom-and-living-room-furniture', 'Desk Writing'),
    'desk-chair': ('bedroom-and-living-room-furniture', 'Desk Task Chair'),
    'iclona': ('computers-and-desk-gadgets', '6.7 inch smartphone'),
    'curtains': ('bedroom-and-living-room-furniture', 'Curtains Linen Pair'),
    'rug': ('bedroom-and-living-room-furniture', 'Rug Round Jute'),
    # picnic
    'floor-cushion': ('bedroom-and-living-room-furniture', 'Pouffe Round'),
    'kombucha-bottle': ('fresh-produce-and-groceries', 'Vinegar Bottle'),
    'fruit-bowl': ('fresh-produce-and-groceries', 'Wooden Market Bowl'),
    'park-bench': ('city-park-and-playground', 'Slatted Park Bench'),
    'green-canopy-tree': ('stylized-trees-and-rocks-kit', 'Stylized Oak Tree Mature'),
    'pink-flowering-tree': ('stylized-trees-and-rocks-kit', 'Stylized Oak Tree Mature'),
    # sushi
    'shoyu-dish': ('bakery-and-cafe', 'Side plate'),
    'chopsticks': ('izakaya-alley-and-ramen-shop', 'Chopstick and Condiment Caddy'),
    'sake-flask': ('izakaya-alley-and-ramen-shop', 'Sake Bottle and Tokkuri Set'),
    'sake-cup': ('izakaya-alley-and-ramen-shop', 'Sake Bottle and Tokkuri Set'),
    'dining-table': ('bakery-and-cafe', 'Two person cafe table'),
    'dining-chair': ('restaurant-kitchen-and-dining', 'Upholstered dining chair'),
    'paper-lantern': ('izakaya-alley-and-ramen-shop', 'Round Paper Lantern'),
    # bistro
    'bistro-table': ('bakery-and-cafe', 'Outdoor bistro table'),
    'upholstered-chair': ('restaurant-kitchen-and-dining', 'Upholstered dining chair, accent'),
    'booth': ('restaurant-kitchen-and-dining', 'Booth pair, two cover'),
    'menu': ('restaurant-kitchen-and-dining', 'Table menu holder'),
    'candle': ('restaurant-kitchen-and-dining', 'Candle holder'),
    'wine-glass': ('restaurant-kitchen-and-dining', 'Wine glass'),
    'water-glass': ('restaurant-kitchen-and-dining', 'Water tumbler'),
    'coffee-cup': ('bakery-and-cafe', 'Ceramic cup and saucer'),
    'cake-slice': ('bakery-and-cafe', 'Layer cake slice'),
    'flower-vase': ('restaurant-kitchen-and-dining', 'Table vase'),
    # bar
    'beer-mug': ('bar-pub-and-brewery-taproom', 'Dimpled tankard'),
    'beer-bucket': ('bar-pub-and-brewery-taproom', 'Ice bucket and tongs'),
    'petiscos-bowl': ('restaurant-kitchen-and-dining', 'Pasta bowl'),
    'peanuts-bowl': ('restaurant-kitchen-and-dining', 'Pasta bowl'),
    'hot-sauce': ('fresh-produce-and-groceries', 'Squeezy Sauce Bottle'),
    'bar-stool': ('bar-pub-and-brewery-taproom', 'Bar stool with back, ebonised'),
    'round-table': ('bar-pub-and-brewery-taproom', 'Round pedestal pub table, ebonised'),
    'bar-counter': ('bar-pub-and-brewery-taproom', 'Bar counter module 1200'),
    'jukebox': ('bar-pub-and-brewery-taproom', 'Pub jukebox'),
    # park
    'bush': ('stylized-trees-and-rocks-kit', 'Stylized Round Bush'),
    'hedge': ('stylized-trees-and-rocks-kit', 'Stylized Hedge Block'),
    'grass-clump': ('stylized-trees-and-rocks-kit', 'Stylized Grass Tuft Tall'),
    'flower-patch': ('stylized-trees-and-rocks-kit', 'Stylized White Flower Patch'),
    'street-lamp': ('city-park-and-playground', 'Park Lamp Post'),
    'kiosk': ('city-park-and-playground', 'Park Refreshment Kiosk'),
    'trash-bin': ('city-park-and-playground', 'Timber Park Litter Bin'),
    'bike-rack': ('city-park-and-playground', 'Five Hoop Bike Rack'),
    # environment
    'curb': ('izakaya-alley-and-ramen-shop', 'Alley Kerb and Drain Section'),
    'tree-planter': ('street-food-market-and-food-trucks', 'Planter with Shrub'),
    'park-sign': ('city-park-and-playground', 'Park Notice Board'),
    'mushrooms': ('stylized-trees-and-rocks-kit', 'Stylized Mushroom Group'),
    # architecture
    'bedside-lamp': ('bedroom-and-living-room-furniture', 'Table Lamp Dome'),
    'string-lights': ('street-food-market-and-food-trucks', 'String Light Run on Poles'),
    'neon-sign': ('cyberpunk-apartment-and-neon-block', 'Neon Sign Frame with Blank Face'),
}

# References that already have a better or deliberately retained model.
KEEP = {
    'wardrobe': 'Integrated 3dassets Wardrobe 2 Door (see bedroom-wardrobe.js)',
    'standing-fan': 'Existing stylized ceiling fan + cord; no matching CC0 standing fan found',
    'fan-pull-cord': 'Existing authored pull cord',
    'window': 'Existing room window with live exterior and curtains',
    'woven-basket': 'Existing hand-QA Grab3D picnic basket (better match than a display basket)',
    'checked-blanket': 'Existing hand-QA Grab3D picnic blanket (fold/pull rig already authored)',
    'vegan-sandwich': 'Existing hand-QA Grab3D sandwich',
    'hardcover-book': 'Existing hand-QA Grab3D book',
    'sushi-platter': 'Existing hand-QA Grab3D sushi set',
    'salmon-nigiri': 'Extract from hand-QA Grab3D sushi set',
    'maki-rolls': 'Extract from hand-QA Grab3D sushi set',
    'coaster': 'Existing small procedural coaster; no CC0 set found',
}


def load_pack(slug: str) -> dict:
    return json.loads((PACKS / f'{slug}.json').read_text())['data']


def find_asset(pack: dict, title: str) -> dict:
    def base(value: str) -> str:
        return value.split(' (', 1)[0].strip()
    exact = [asset for asset in pack['assets'] if base(asset['title']) == title]
    matches = exact or [asset for asset in pack['assets'] if asset['title'].startswith(title)]
    if len(matches) != 1:
        raise RuntimeError(f'{pack["slug"]}: expected one asset for {title!r}, got {len(matches)}')
    return matches[0]


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': 'wde-sourcing/1'})
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f'HTTP {response.status}: {url}')
        return response.read()


def digest(data: bytes) -> str:
    return sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--force', action='store_true')
    args = parser.parse_args()

    manifest = json.loads((ROOT / 'assets' / 'tripo' / 'manifest.json').read_text())
    items = [item for item in manifest['items'] if item['category'] == '3d']
    plan = {'schema_version': 'wde-sourcing-plan/1', 'items': []}
    staged = json.loads(STAGED.read_text())
    staged.setdefault('candidates', {})

    for item in items:
        asset_id = item['id']
        row = {'id': asset_id, 'scene': item['scene'], 'reference': item['reference']}
        if asset_id in KEEP:
            row.update(status='KEEP', reason=KEEP[asset_id])
        elif asset_id in MAP:
            pack_slug, title = MAP[asset_id]
            pack = load_pack(pack_slug)
            asset = find_asset(pack, title)
            row.update(status='SOURCE_3DASSETS', pack=pack_slug, title=asset['title'],
                       page=asset['url'], download=asset['cdnUrl'],
                       license=asset['license']['name'],
                       triangles=asset['stats'].get('triangles'),
                       bytes=asset['stats'].get('fileSize'),
                       dimensions=asset['stats'].get('sizeMeters'))
        else:
            row.update(status='NEEDS_SEARCH', reason='No explicit mapping yet')
        plan['items'].append(row)

        if row['status'] != 'SOURCE_3DASSETS' or not args.download:
            continue
        source_dir = SOURCES / asset_id
        source_dir.mkdir(parents=True, exist_ok=True)
        glb_path = source_dir / (asset['slug'] + '.glb')
        candidate = CANDIDATES / (asset_id + '.glb')
        if glb_path.is_file() and not args.force:
            glb = glb_path.read_bytes()
        else:
            glb = fetch(asset['cdnUrl'])
            if glb[:4] != b'glTF' or len(glb) < 20:
                raise RuntimeError(f'{asset_id}: invalid GLB')
            glb_path.write_bytes(glb)
        if candidate.is_file() and not args.force and candidate.read_bytes() != glb:
            raise RuntimeError(f'{asset_id}: candidate exists with different bytes; use --force')
        candidate.write_bytes(glb)
        record = {
            'schema_version': 'wde-source/1',
            'asset_id': asset_id,
            'reference': item['reference'],
            'provider': '3dassets.dev',
            'title': asset['title'],
            'page': asset['url'],
            'download': asset['cdnUrl'],
            'pack': pack_slug,
            'license': asset['license'],
            'stats': asset['stats'],
            'source_glb': {'path': str(glb_path.relative_to(ROOT)), 'sha256': digest(glb), 'bytes': len(glb)},
            'candidate': {'path': str(candidate.relative_to(ROOT)), 'sha256': digest(glb), 'bytes': len(glb)},
        }
        (source_dir / 'source-record.json').write_text(json.dumps(record, indent=2) + '\n')
        staged['candidates'][asset_id] = {
            'path': record['candidate']['path'],
            'catalog_id': asset_id,
            'expected_sha256': digest(glb),
            'license': 'CC0-1.0',
            'license_source': '',
            'source_page': asset['url'],
        }
        row.update(status='DOWNLOADED', candidate=record['candidate']['path'], sha256=digest(glb))
        print(f"downloaded {asset_id:22s} <- {asset['title']} ({len(glb)} bytes)")

    PLAN.write_text(json.dumps(plan, indent=2) + '\n')
    STAGED.write_text(json.dumps(staged, indent=2) + '\n')
    counts = {}
    for row in plan['items']:
        counts[row['status']] = counts.get(row['status'], 0) + 1
    print('plan', counts)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
