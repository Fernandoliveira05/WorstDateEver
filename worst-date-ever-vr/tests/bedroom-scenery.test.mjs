import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitCharacter } from '../src/bedroom-scenery.js';

test('a late-loading pedestrian is grounded on the current route position', () => {
  const walker = new THREE.Group();
  walker.position.set(12, -.159, 8);
  walker.rotation.y = Math.PI / 2;
  const model = new THREE.Group();
  const visual = new THREE.Mesh(new THREE.BoxGeometry(.42, 2, .28));
  visual.position.set(.3, 1.1, .12);
  model.add(visual);
  fitCharacter(THREE, walker, model, 1.46);
  const bounds = new THREE.Box3().setFromObject(model);
  assert.ok(Math.abs(bounds.min.y - walker.position.y) < 1e-6);
  assert.ok(Math.abs(bounds.getSize(new THREE.Vector3()).y - 1.46) < 1e-6);
  const center = bounds.getCenter(new THREE.Vector3());
  assert.ok(Math.abs(center.x - walker.position.x) < 1e-6);
  assert.ok(Math.abs(center.z - walker.position.z) < 1e-6);
  assert.equal(model.rotation.y, 0);
});
