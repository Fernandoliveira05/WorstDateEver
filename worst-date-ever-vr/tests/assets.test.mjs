import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const ROOT = new URL('..', import.meta.url).pathname;
const ASSET_ROOT = join(ROOT, 'public/assets/models');
const MODELS = [
  'vintage_day_bed',
  'metal_office_desk',
  'painted_wooden_chair_02',
  'desk_lamp_arm_01',
  'binder_notebook',
  'drawer_cabinet'
];

test('all six local Poly Haven glTFs and dependencies exist', () => {
  for (const folder of MODELS) {
    const dir = join(ASSET_ROOT, folder);
    assert.ok(existsSync(dir), `${folder} directory`);
    const files = readdirSync(dir);
    const gltfName = files.find(name => name.endsWith('.gltf'));
    assert.ok(gltfName, `${folder} glTF`);
    const gltfPath = join(dir, gltfName);
    const gltf = JSON.parse(readFileSync(gltfPath, 'utf8'));

    assert.ok(gltf.extensionsUsed.includes('EXT_texture_webp'), `${folder} WebP extension`);
    for (const image of gltf.images ?? []) {
      assert.ok(image.uri, `${folder} image URI`);
      assert.ok(image.uri.endsWith('.webp'), `${folder} WebP texture`);
      assert.ok(existsSync(join(dir, image.uri)), `${folder}/${image.uri}`);
    }
    for (const buffer of gltf.buffers ?? []) {
      assert.ok(buffer.uri, `${folder} buffer URI`);
      assert.ok(existsSync(join(dir, buffer.uri)), `${folder}/${buffer.uri}`);
    }
    for (const texture of gltf.textures ?? []) {
      assert.ok(texture.extensions?.EXT_texture_webp, `${folder} texture extension`);
    }
  }
});

test('the exported scene contains its interactive nodes and local asset credits', () => {
  const exportDir = join(ROOT, 'public/assets/bedroom');
  const glb = gunzipSync(readFileSync(join(exportDir, 'scene.glb.gz')));
  assert.equal(glb.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(glb.toString('utf8', 20, 20 + glb.readUInt32LE(12)));
  const scene = JSON.parse(readFileSync(join(exportDir, 'scene.json'), 'utf8'));
  const ids = new Set(gltf.nodes.map(node => node.name));
  assert.equal(scene.drawers.length, 6);
  assert.ok(scene.drawers.every(drawer => drawer.shapes.length >= 5));
  assert.equal(scene.cars.length, 2);
  assert.ok([scene.phone.id, scene.mirror, scene.door.id, ...scene.curtains, ...scene.props.map(p => p.id)]
    .every(id => ids.has(id)));
  assert.ok(scene.walkers.every(walker => existsSync(join(exportDir, 'Characters', walker.model))));
  assert.ok(gltf.images.every(image => image.bufferView !== undefined));
  const nodeById = new Map(gltf.nodes.map(node => [node.name, node]));
  const pillows = scene.props.filter(prop => prop.name === 'Travesseiro de linho');
  assert.equal(pillows.length, 2);
  for (const pillow of pillows) {
    const skins = nodeById.get(pillow.id).children.map(index => gltf.nodes[index]).filter(node => node.skin !== undefined);
    assert.ok(skins.length >= 2, 'pillow shell and seam are skinned');
    assert.ok(skins.every(node => gltf.skins[node.skin].joints.length === 3));
  }
  const paint = gltf.materials.find(material => material.name === 'Blue').pbrMetallicRoughness.baseColorFactor;
  const glass = gltf.materials.find(material => material.name === 'Windows').pbrMetallicRoughness.baseColorFactor;
  assert.ok(paint[2] > paint[0] && glass[0] < .06);
  for (const folder of ['Horizon', 'Traffic', 'Characters']) {
    const credits = readFileSync(join(exportDir, folder, 'ATTRIBUTION.md'), 'utf8');
    assert.match(credits, /https:\/\//);
  }
});

test('production dist copies the local model tree when built', t => {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) { t.skip('dist/ has not been built'); return; }
  const distModels = join(dist, 'assets/models');
  assert.ok(existsSync(distModels), 'dist model tree');
  for (const folder of MODELS) {
    const dir = join(distModels, folder);
    assert.ok(existsSync(dir), `dist ${folder}`);
    const files = readdirSync(dir);
    assert.ok(files.some(name => name.endsWith('.gltf')), `dist ${folder} glTF`);
    assert.ok(files.some(name => name.endsWith('.bin')), `dist ${folder} buffer`);
    assert.ok(existsSync(join(dir, 'textures')), `dist ${folder} textures`);
    const gltf = JSON.parse(readFileSync(join(dir, files.find(name => name.endsWith('.gltf'))), 'utf8'));
    for (const image of gltf.images ?? []) {
      assert.ok(existsSync(join(dir, image.uri)), `dist ${folder}/${image.uri}`);
    }
  }
  assert.ok(existsSync(join(dist, 'assets/models/ATTRIBUTION.md')), 'dist attribution');
  const web = join(dist, 'assets/bedroom');
  for (const file of ['scene.glb.gz', 'scene.json', 'PhoneWallpaper.png', 'Characters/Caio-Portrait.png']) {
    assert.ok(existsSync(join(web, file)), 'dist ' + file);
  }
});
