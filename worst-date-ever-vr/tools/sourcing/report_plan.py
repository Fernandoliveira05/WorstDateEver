#!/usr/bin/env python3
"""Render assets/sourcing/plan.json as a reviewable Markdown table."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
plan = json.loads((ROOT / 'assets/sourcing/plan.json').read_text())
rows = plan['items']
counts = {}
for row in rows:
    counts[row['status']] = counts.get(row['status'], 0) + 1
lines = ['# Internet sourcing plan', '', f'{len(rows)} 3D references · ' +
         ' · '.join(f'{k}: {v}' for k, v in sorted(counts.items())), '']
lines += ['| Scene | Reference | Status | Source / decision |', '| --- | --- | --- | --- |']
for row in rows:
    if row['status'] in ('DOWNLOADED', 'SOURCE_3DASSETS'):
        source = f"[{row['title']}]({row['page']}) ({row['triangles']} tri, {row['bytes']} B)"
    else:
        source = row.get('reason', '')
    lines.append(f"| {row['scene']} | {row['id']} | {row['status']} | {source} |")
(ROOT / 'assets/sourcing/plan.md').write_text('\n'.join(lines) + '\n')
print(ROOT / 'assets/sourcing/plan.md')
