"""Build the Tripo generation manifest from the eight WDE reference packs.

Only physical props/furniture/architecture pieces are marked for 3D generation.
Flat skies, wall/floor surfaces, decals and ground textures stay as 2D source art
for the engine material pipeline. Empty input files are recorded as missing.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REF = ROOT / 'assets' / 'tripo' / 'references'

PACKS = {
    'wde-01-bedroom-core': ('bedroom', 'Bedroom'),
    'wde-02-picnic-core': ('picnic', 'Picnic'),
    'wde-03-sushi-candidates': ('sushi', 'Sushi'),
    'wde-04-bistro-candidates': ('bistro', 'Bistro'),
    'wde-05-barzinho-candidates': ('bar', 'Barzinho'),
    'wde-06-park-outdoor-candidates': ('park', 'Park'),
    'wde-07-sky-floors-lighting-candidates': ('environment', 'Sky / floors / lighting'),
    'wde-08-architecture-lighting-candidates': ('architecture', 'Architecture / lighting'),
}

# id -> (category, prompt hint). Anything not listed is a 3D prop.
SPECIAL = {
    'wde-01-bedroom-core/07-fan-pull-cord': ('3d', 'wall-mounted fan pull cord with a small wooden handle'),
    'wde-01-bedroom-core/08-window': ('3d', 'closed bedroom window with a simple wooden frame'),
    'wde-02-picnic-core/02-checked-blanket': ('3d', 'folded checked picnic blanket, soft woven cloth'),
    'wde-02-picnic-core/05-vegan-sandwich': ('3d', 'vegan picnic sandwich on a small plate'),
    'wde-02-picnic-core/09-green-canopy-tree': ('3d', 'rounded low-poly green canopy park tree'),
    'wde-02-picnic-core/10-pink-flowering-tree': ('3d', 'rounded low-poly pink flowering park tree'),
    'wde-05-barzinho-candidates/01-beer-mug': ('3d', 'oversized frothy beer mug with a handle'),
    'wde-06-park-outdoor-candidates/05-fallen-leaves': ('decal', 'scattered fallen leaves'),
    'wde-06-park-outdoor-candidates/07-park-path': ('texture', 'flat sandy park path surface'),
    'wde-07-sky-floors-lighting-candidates/01-day-sky': ('sky', 'clear blue day sky'),
    'wde-07-sky-floors-lighting-candidates/02-sunset-sky': ('sky', 'warm pink and orange sunset sky'),
    'wde-07-sky-floors-lighting-candidates/03-night-sky': ('missing', 'night sky reference is an empty file'),
    'wde-07-sky-floors-lighting-candidates/04-clouds': ('sky', 'soft low-poly cloud cluster'),
    'wde-07-sky-floors-lighting-candidates/05-dirt-path': ('texture', 'sandy dirt path surface'),
    'wde-07-sky-floors-lighting-candidates/06-cobblestone': ('texture', 'rounded cobblestone paving surface'),
    'wde-08-architecture-lighting-candidates/01-bedroom-wall': ('texture', 'pink bedroom wall panel'),
    'wde-08-architecture-lighting-candidates/02-sushi-wall': ('texture', 'sushi restaurant wall panel'),
    'wde-08-architecture-lighting-candidates/03-bistro-wall': ('texture', 'bistro wall panel'),
    'wde-08-architecture-lighting-candidates/04-brick-wall': ('texture', 'warm brick wall panel'),
    'wde-08-architecture-lighting-candidates/05-wood-floor': ('texture', 'light wood floor surface'),
    'wde-08-architecture-lighting-candidates/06-restaurant-wood-floor': ('texture', 'restaurant wood floor surface'),
    'wde-08-architecture-lighting-candidates/07-paper-lantern': ('3d', 'pink paper lantern with a sakura motif'),
    'wde-08-architecture-lighting-candidates/09-string-lights': ('3d', 'festoon string lights with warm bulbs'),
    'wde-08-architecture-lighting-candidates/10-neon-sign': ('3d', 'pink double-heart neon sign'),
}

STYLE = ('cozy Brazilian dating-comedy VR game prop, rounded toy-like silhouette, matte materials, '
         'muted teal cream lavender warm wood and rosy accents, clean game-ready topology, '
         'single object, no text, no background, no shadow')


def main() -> None:
    items = []
    for pack, (scene, label) in PACKS.items():
        for image in sorted((REF / pack).glob('*.png')):
            key = pack + '/' + image.stem
            category, hint = SPECIAL.get(key, ('3d', image.stem.replace('-', ' ')))
            if image.stat().st_size == 0:
                category = 'missing'
            items.append({
                'id': image.stem.split('-', 1)[-1],
                'scene': scene,
                'pack': pack,
                'reference': str(image.relative_to(ROOT)),
                'category': category,
                'prompt_hint': hint,
                'tripo': {
                    'for': 'game-mobile',
                    'model': 'v3.1-20260211',
                    'params': {
                        'auto_size': True,
                        'texture_alignment': 'original_image',
                        'smart_low_poly': True,
                        'face_limit': 8000,
                    },
                    'output': f'assets/tripo/generated/{scene}/{image.stem}',
                } if category == '3d' else None,
            })

    manifest = {
        'schemaVersion': 1,
        'style': STYLE,
        'items': items,
        'summary': {
            category: sum(1 for item in items if item['category'] == category)
            for category in ('3d', 'texture', 'sky', 'decal', 'missing')
        },
    }
    out = ROOT / 'assets' / 'tripo' / 'manifest.json'
    out.write_text(json.dumps(manifest, indent=2) + '\n')
    print(f'{out}: {len(items)} references, {manifest["summary"]}')


if __name__ == '__main__':
    main()
