"""Fingerprint the public and Unity asset baseline without judging approval."""
import json
from hashlib import sha256
from pathlib import Path


root = Path(__file__).resolve().parents[2]
baseline = ('public/assets', 'unity/Assets/WorstDateEver', 'assets/evidence')
records = []
for folder in baseline:
    for file in sorted((root / folder).rglob('*')):
        if file.is_file() and file.suffix != '.meta':
            records.append({'file': str(file.relative_to(root)), 'size': file.stat().st_size,
                            'sha256': sha256(file.read_bytes()).hexdigest()})
room = json.loads((root / 'public/assets/bedroom/scene.json').read_text())
data = {
    'verification': 'Content and metadata inventory only',
    'files': records,
    'bedroom_export': {
        'file': 'public/assets/bedroom/scene.glb.gz', 'metadata': 'public/assets/bedroom/scene.json',
        'authored_props': [{'node': prop['id'], 'name': prop['name']} for prop in room['props']]
    },
    'venue_runtime': 'src/date/venue.js',
    'visual_baseline': 'assets/style-baseline.json'
}
(root / 'assets/hand-qa/current-inventory.json').write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')
print(f'{len(records)} fingerprinted files')
