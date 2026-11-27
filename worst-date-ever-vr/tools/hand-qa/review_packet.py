"""Build complete contact sheets and a traceable screenshot index for vision review."""

import argparse
import json
import re
from hashlib import sha256
from math import dist
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


project = Path(__file__).resolve().parents[2]
evidence = project / 'assets' / 'hand-qa' / 'evidence'
angle = re.compile(r'(left|right)__az(\d+)__pitch(minus30|0|plus30)__grip\.png')
pitches = {'minus30': -30, '0': 0, 'plus30': 30}
required = {(hand, az, pitch) for hand in ('left', 'right') for az in range(0, 360, 45) for pitch in pitches.values()}


def digest(path):
    return sha256(path.read_bytes()).hexdigest()


def verified_shots(folder, metadata, model_hash):
    shots = []
    for shot in metadata:
        filename = shot['filename']
        path = folder / filename
        if path.parent != folder or path.suffix != '.png':
            raise ValueError(f'Invalid screenshot path: {filename}')
        if shot['asset_sha256'] != model_hash or digest(path) != shot['image_sha256']:
            raise ValueError(f'Model or screenshot mismatch: {path}')
        shots.append((path, shot))
    return shots


def make_sheet(entries, destination, title, columns):
    if not entries:
        return
    tile_width, tile_height = 390, 311
    rows = (len(entries) + columns - 1) // columns
    page = Image.new('RGB', (tile_width * columns, tile_height * rows + 50), '#1b151d')
    draw = ImageDraw.Draw(page)
    font = ImageFont.load_default(size=15)
    draw.text((12, 14), title, fill='#f7efdf', font=ImageFont.load_default(size=23))
    for i, (path, _) in enumerate(entries):
        x, y = (i % columns) * tile_width, (i // columns) * tile_height + 50
        with Image.open(path) as source:
            thumb = source.convert('RGB')
            thumb.thumbnail((tile_width - 12, tile_height - 28))
            page.paste(thumb, (x + (tile_width - thumb.width) // 2, y))
        draw.text((x + 7, y + tile_height - 21), path.stem, fill='#f7efdf', font=font)
    page.save(destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('asset_id')
    parser.add_argument('--capture-revision', required=True)
    parser.add_argument('--isolated-revision', default='candidates')
    parser.add_argument('--model', type=Path, required=True)
    args = parser.parse_args()
    base = evidence / args.asset_id
    played = base / args.capture_revision
    isolated = base / args.isolated_revision
    model_hash = digest(args.model)
    scripted = verified_shots(played, (json.loads(file.read_text()) for file in sorted(played.glob('*.json')) if file.name != 'qa_report.json'), model_hash)
    turntable = verified_shots(isolated, json.loads((isolated / 'captures.json').read_text()), model_hash)
    if len(turntable) != 8:
        raise ValueError('Expected eight neutral turntable captures')

    directions, states = {}, []
    for path, shot in scripted:
        match = angle.fullmatch(path.name)
        if not match:
            states.append((path, shot))
            continue
        hand, az, pitch = match.groups()
        key = (hand, int(az), pitches[pitch])
        if key in directions or shot['hand'] != hand or not shot['hand_joints_world']:
            raise ValueError(f'Duplicate approach or missing hand metadata: {path}')
        directions[key] = (path, shot)
    if set(directions) != required:
        raise ValueError(f'Missing approaches: {sorted(required - set(directions))}')
    output = base / ('review-' + args.capture_revision)
    output.mkdir(exist_ok=True)
    for hand in ('left', 'right'):
        for pitch in pitches.values():
            entries = [directions[(hand, az, pitch)] for az in range(0, 360, 45)]
            make_sheet(entries, output / f'{hand}-{pitch}.webp', f'{args.asset_id} / {hand} / {pitch:+d}° elevation', 4)
    make_sheet(turntable, output / 'isolated.webp', f'{args.asset_id} / Blender turntable', 4)
    make_sheet(states, output / 'states.webp', f'{args.asset_id} / scripted functional states', 4)
    indexed = [
        {
            'image': str(path.relative_to(project)),
            'sha256': shot['image_sha256'],
            'hand': shot.get('hand'),
            'state': shot.get('state') or 'isolated',
            'input_mode': shot.get('input_mode'),
        }
        for path, shot in turntable + scripted
    ]
    grip_probes = [
        {
            'image': str(path.relative_to(project)),
            'grip_zone': shot.get('grip'),
            'ray_to_authored_anchor_m': round(dist(shot['ray_hit_world'], shot['authored_anchor_world']), 6),
        }
        for path, shot in directions.values()
        if shot.get('ray_hit_world') and shot.get('authored_anchor_world')
    ]
    distance_views = []
    distance_hashes = set()
    for path, shot in states:
        distance = re.fullmatch(r'vr_(\d+)cm\.png', path.name)
        if not distance:
            continue
        expected = int(distance[1]) / 100
        measured = shot.get('camera_distance_m')
        image_hash = shot['image_sha256']
        distance_views.append({
            'image': str(path.relative_to(project)),
            'expected_m': expected,
            'measured_m': measured,
            'at_named_distance': isinstance(measured, (int, float)) and abs(measured - expected) < .001,
            'duplicate_image': image_hash in distance_hashes,
        })
        distance_hashes.add(image_hash)
    (output / 'index.json').write_text(json.dumps({
        'asset_id': args.asset_id,
        'asset_sha256': model_hash,
        'captures': indexed,
        'distance_views': distance_views,
        'grip_probes': grip_probes,
    }, indent=2) + '\n')
    print(f'{args.asset_id}: {len(turntable)} isolated, {len(directions)} approach, {len(states)} state views in {output}')


if __name__ == '__main__':
    main()
