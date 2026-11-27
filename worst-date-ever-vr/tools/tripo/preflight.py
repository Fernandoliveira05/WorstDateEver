"""Dry-run every 3D item in the Tripo manifest. No upload, no credits."""
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'assets' / 'tripo' / 'manifest.json'
REPORT = ROOT / 'assets' / 'tripo' / 'preflight.json'


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    rows, total = [], 0
    env = {**os.environ, 'TRIPO_CLIENT_APP': 'deepseek'}
    for item in manifest['items']:
        if item['category'] != '3d':
            continue
        command = [
            'tripo', 'make', item['reference'], '--for', item['tripo']['for'],
            '--model', item['tripo']['model'],
        ]
        for key, value in item['tripo']['params'].items():
            command += ['-p', f'{key}={str(value).lower()}']
        command += ['--dry-run', '--json']
        result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
        try:
            payload = json.loads(result.stdout.strip().splitlines()[-1])
        except (ValueError, IndexError):
            payload = {'valid': False, 'errors': [result.stderr.strip() or 'no JSON output']}
        estimate = payload.get('generation_credits_estimate') or 0
        total += estimate
        rows.append({
            'reference': item['reference'],
            'valid': bool(payload.get('valid')),
            'model': payload.get('model'),
            'estimate': estimate,
            'errors': payload.get('errors') or [],
            'warnings': payload.get('warnings') or [],
        })
        print(f"{'ok ' if payload.get('valid') else 'ERR'} {item['reference']} {estimate}")
    REPORT.write_text(json.dumps({
        'generated_at': __import__('datetime').datetime.now(__import__('datetime').timezone.utc).isoformat(),
        'balance': json.loads(subprocess.run(['tripo', 'balance', '--json'], text=True, capture_output=True).stdout)['balance'],
        'estimated_generation_credits': total,
        'items': rows,
    }, indent=2) + '\n')
    print(f'{len(rows)} items, estimated {total} generation credits -> {REPORT}')


if __name__ == '__main__':
    main()
