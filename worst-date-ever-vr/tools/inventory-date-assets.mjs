import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const hash = path => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
const characters = {
  Caio: 'gKLBoRsyKe', Rafa: 'kZ3DmIoGip', Bia: 'nIItLV9nxS', Luiza: 'ZwF0K7WBmu',
  PlayerWoman: 'qJ2gsTUBHL', PlayerMan: 'DojKLcO34E', JacketWoman: 'djXoqejw6w',
  JacketMan: 'BTALZymknF', FormalMan: 'JFrLIKqvCH'
};
const art = 'unity/Assets/WorstDateEver/';
const assets = [
  ...Object.entries(characters).map(([name, slug]) => ({
    id: name.toLowerCase(), path: 'public/assets/bedroom/Characters/' + name + '.glb', category: 'character',
    materials: 'existing matte character material', rig: 'Quaternius armature and authored animation',
    source: 'https://poly.pizza/m/' + slug, creator: 'Quaternius', license: 'CC0-1.0',
    note: 'Existing bedroom character. Native reference in Models/Characters.'
  })),
  ...Object.entries({ cup: 'wde_78', plate: 'wde_106', menu: 'wde_131' }).map(([id, node]) => ({
    id, path: 'public/assets/bedroom/scene.glb.gz', category: 'prop',
    materials: id === 'menu' ? 'book and paper' : 'ceramic', rig: '',
    source: art + 'Editor/', creator: 'Worst Date Ever project', license: 'in-project',
    note: 'Reused bedroom node ' + node + '. Unity reads the corresponding source prop in the scene.'
  })),
  ...['Walnut','Floorboards','Weave'].map(name => ({
    id: name.toLowerCase(), path: art + 'Textures/' + name + '.jpg', category: 'texture',
    materials: name, rig: '', source: art + 'Textures/ATTRIBUTION.md',
    creator: 'See in-project attribution', license: 'See in-project attribution',
    note: 'Existing texture. Web references the copy embedded in the bedroom export.'
  }))
];
const csv = rows => rows.map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\n') + '\n';
const inventory = [['assetId','repoRelativePath','sha256','category','approved','materialFamily','rigFamily','sourceLicense','notes']];
const provenance = [['assetId','repoRelativePath','sourceUrl','creator','license','attribution','acquiredAt','sha256','transformHistory','approvedBy']];
for (const asset of assets) {
  const digest = hash(asset.path);
  inventory.push([asset.id, asset.path, digest, asset.category, 'existing-use; sign-off pending',
    asset.materials, asset.rig, asset.license, asset.note]);
  provenance.push([asset.id, asset.path, asset.source, asset.creator, asset.license,
    asset.creator, '', digest, asset.note, '']);
}
writeFileSync(new URL('assets/asset-inventory.csv', root), csv(inventory));
writeFileSync(new URL('assets/provenance.csv', root), csv(provenance));

const baseline = {
  schemaVersion: 1, version: 'bedroom-working-assets-v1', status: 'review_required',
  sourceRepository: 'Current working bedroom exported scene SHA-256 ' + hash('public/assets/bedroom/scene.glb.gz'),
  approvedAssetRefs: [],
  approvedSceneImageRefs: [],
  existingAssetRefs: assets.map(asset => asset.id),
  existingSceneImageRefs: ['entry','desk','textiles'].map(view => 'assets/evidence/bedroom-' + view + '.webp'),
  shaderConventions: ['Unity textured surfaces and matte ceramics', 'Three.js port reuses embedded bedroom maps'],
  geometryConventions: ['Ceramic lip and curved mug handle', 'Wooden furniture frames with visible edges and joints'],
  materialAndTextureConventions: ['Walnut timber', 'Floorboards', 'Woven cushions', 'Matte glazed ceramics'],
  characterRigConventions: ['Existing Quaternius armatures, bone names and walk/idle clips'],
  scaleUnit: 'meters',
  colliderAndGripConventions: ['Resting bodies use solid collision', 'Near grab and accessible controller ray'],
  note: 'Evidence from the current game. Art owner approval has not been recorded.'
};
const baselineURL = new URL('assets/style-baseline.json', root);
let previous;
try { previous = JSON.parse(readFileSync(baselineURL)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
if (previous?.status === 'approved') {
  console.log('Kept the signed baseline. If the exemplars changed, assign a new version and obtain review.');
} else {
  writeFileSync(baselineURL, JSON.stringify(baseline, null, 2) + '\n');
}
