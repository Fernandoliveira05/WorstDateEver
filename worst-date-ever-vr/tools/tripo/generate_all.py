"""Generate every 3D item in the Tripo manifest, resumably.

Use --dry-run to validate without spending, --limit N for a benchmark slice,
and --max-credits to cap a run. A missing/invalid balance is a hard stop.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MANIFEST = ROOT / 'assets' / 'tripo' / 'manifest.json'
LOG = ROOT / 'assets' / 'tripo' / 'generation_log.jsonl'


def balance() -> int:
    result = subprocess.run(['tripo', 'balance', '--json'], text=True, capture_output=True)
    try:
        return int(json.loads(result.stdout.strip().splitlines()[-1]).get('balance', 0))
    except (ValueError, IndexError, AttributeError):
        return 0


def already_done(item: dict) -> bool:
    output = ROOT / item['tripo']['output']
    if not output.is_dir():
        return False
    files = list(output.rglob('*'))
    return any(path.suffix.lower() in {'.glb', '.gltf', '.fbx'} and path.stat().st_size > 1024 for path in files)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--limit', type=int, default=0, help='stop after N new generations')
    parser.add_argument('--only', action='append', default=[], help='asset id or reference substring')
    parser.add_argument('--max-credits', type=int, default=3000)
    parser.add_argument('--force', action='store_true')
    options = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text())
    items = [item for item in manifest['items'] if item['category'] == '3d']
    if options.only:
        items = [item for item in items if any(needle in item['reference'] or needle == item['id']
                                               for needle in options.only)]
    if not options.force:
        items = [item for item in items if not already_done(item)]
    if options.limit:
        items = items[:options.limit]

    account = balance()
    print(f'{len(items)} item(s) pending; balance {account} credits', flush=True)
    if not options.dry_run and account <= 0:
        print('STOP: Tripo balance is 0. Top up at https://developers.tripo3d.ai/billing', file=sys.stderr)
        return 4

    env = {**os.environ, 'TRIPO_CLIENT_APP': 'deepseek'}
    spent = 0
    failures = 0
    for index, item in enumerate(items, 1):
        output = ROOT / item['tripo']['output']
        output.mkdir(parents=True, exist_ok=True)
        command = ['tripo', 'make', item['reference'], '--for', item['tripo']['for'],
                   '--model', item['tripo']['model'], '-o', str(output), '--json', '--yes',
                   '--no-open']
        for key, value in item['tripo']['params'].items():
            command += ['-p', f'{key}={str(value).lower()}']
        if options.dry_run:
            command += ['--dry-run']
        print(f'[{index}/{len(items)}] {item["reference"]}', flush=True)
        result = subprocess.run(command, cwd=ROOT, env=env, text=True, capture_output=True)
        record = {
            'at': dt.datetime.now(dt.timezone.utc).isoformat(),
            'reference': item['reference'],
            'command': command,
            'exit_code': result.returncode,
            'stdout': result.stdout.strip(),
            'stderr': result.stderr.strip()[-4000:],
        }
        LOG.parent.mkdir(parents=True, exist_ok=True)
        with LOG.open('a') as log:
            log.write(json.dumps(record) + '\n')
        if result.returncode == 4:
            print('STOP: insufficient credits', file=sys.stderr)
            return 4
        if result.returncode != 0:
            failures += 1
            print(f'  failed ({result.returncode}): {result.stderr.strip()[-300:]}', file=sys.stderr)
            continue
        try:
            payload = json.loads(result.stdout.strip().splitlines()[-1])
            spent += int(payload.get('credits_consumed') or 0)
            print(f'  ok {payload.get("model_file") or payload.get("output_dir")} ({spent} credits)', flush=True)
        except (ValueError, IndexError):
            print('  ok (unparseable summary)', flush=True)
        if spent >= options.max_credits:
            print(f'Budget reached: {spent} credits', file=sys.stderr)
            break
    print(f'Done: {len(items) - failures} ok, {failures} failed, {spent} credits used')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
