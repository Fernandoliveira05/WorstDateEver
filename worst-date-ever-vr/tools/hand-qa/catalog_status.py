"""Generate the A-Frame runtime and QA status for every catalog requirement."""

import csv
import json
from collections import Counter
from pathlib import Path


project = Path(__file__).resolve().parents[2]
root = project / 'assets' / 'hand-qa'


def read_index(filename):
    with (root / filename).open(newline='') as stream:
        rows = list(csv.DictReader(stream))
    index = {row['id']: row for row in rows}
    if len(index) != len(rows):
        raise ValueError(f'Duplicate catalog ID in {filename}')
    return index


catalog = read_index('catalog.csv')
matrix = read_index('interaction-matrix.csv')
if len(catalog) != 265 or catalog.keys() != matrix.keys():
    raise ValueError('Catalog and matrix must contain the same 265 unique IDs')

assets = json.loads((root / 'manifest.json').read_text())['assets']
if assets.keys() - catalog.keys():
    raise ValueError('Benchmark contains unknown catalog IDs')

baseline = {}
for group in json.loads((root / 'runtime-baseline.json').read_text()):
    if not (project / group['file']).is_file():
        raise ValueError(f"Missing runtime evidence file: {group['file']}")
    if group['presence'] not in {'EXISTING_RUNTIME', 'PARTIAL_OR_SUBSTITUTE'}:
        raise ValueError(f"Unknown runtime presence: {group['presence']}")
    for asset_id in group['ids'].split():
        if asset_id not in catalog or asset_id in baseline or asset_id in assets:
            raise ValueError(f'Invalid or duplicate runtime mapping: {asset_id}')
        baseline[asset_id] = group

counts = Counter()
with (root / 'catalog-status.csv').open('w', newline='') as stream:
    writer = csv.writer(stream)
    writer.writerow([
        'id', 'scene', 'name', 'priority', 'milestone_status', 'vision', 'device',
        'production_approved', 'runtime_presence', 'runtime_evidence', 'runtime_locator',
        'runtime_notes', 'interaction_profile_required', 'required_actions',
        'source_candidate_page', 'candidate_binary', 'candidate_sha256',
        'isolated_views', 'scripted_views', 'independent_review', 'human_reviewer',
    ])
    for asset_id, row in catalog.items():
        item = assets.get(asset_id, {})
        capture = item.get('evidence', {})
        release = item.get('release', {})
        mapped = baseline.get(asset_id, {})
        presence = (
            'PLAYABLE_BENCHMARK' if item else mapped.get('presence', 'NO_MAPPED_RUNTIME_EVIDENCE')
        )
        counts[presence] += 1
        writer.writerow([
            asset_id, row['scene'], row['name'], row['priority'],
            'BENCHMARK_STAGED' if item else 'NOT_ASSESSED_IN_THIS_MILESTONE',
            release.get('vision', 'NO_REVIEW'), release.get('device', 'NOT_TESTED'),
            'yes' if release.get('production_approved') else 'no', presence,
            f"assets/hand-qa/{item['candidate']}" if item else mapped.get('file', ''),
            mapped.get('locator', ''), release.get('integration', mapped.get('notes', '')),
            matrix[asset_id]['interaction_profile'], matrix[asset_id]['required_actions'],
            row['exact_candidate_page'], item.get('candidate', ''), item.get('candidate_hash', ''),
            capture.get('isolated_views', 0), capture.get('scripted_views', 0),
            capture.get('independent_review') or '', release.get('human_reviewer') or '',
        ])

print(f'{len(catalog)} catalog entries: {dict(counts)}')
