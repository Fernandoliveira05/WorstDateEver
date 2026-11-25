import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../unity/Assets/WorstDateEver/Resources/FirstDate/', import.meta.url);
mkdirSync(root, { recursive: true });
for (const name of ['dialogue', 'events', 'personas', 'venues'])
  copyFileSync(new URL('../content/shared/' + name + '.json', import.meta.url), new URL(name + '.json', root));

const layout = JSON.parse(readFileSync(new URL('../content/shared/venue-layout.json', import.meta.url)));
for (const key of ['tables', 'dateRoute', 'restroomRoute', 'waiterRoute', 'entranceRoute'])
  layout[key] = layout[key].map(position => ({ position }));
writeFileSync(new URL('venue-layout.json', root), JSON.stringify(layout, null, 2) + '\n');
