import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPullCord } from '../src/bedroom-cord.js';

test('a passing hand can swing the fan cord while the ceiling end stays pinned', () => {
  const anchor = new THREE.Vector3(0, 2.47, 0);
  const cord = createPullCord(THREE, anchor, new THREE.Vector3(0, 1.69, 0));
  const advance = (count, heldPoint) => {
    let tip;
    for (let i = 0; i < count; i++) tip = cord.step(1 / 120, heldPoint);
    return tip.clone();
  };
  advance(30);
  assert.equal(cord.hit(new THREE.Vector3(-.08, 2.08, .20), new THREE.Vector3(.06, 2.08, .20), .035), false);
  assert.ok(cord.hit(new THREE.Vector3(-.07, 1.76, 0), new THREE.Vector3(.06, 1.76, 0), .044));
  const swung = advance(25);
  assert.ok(swung.x > .03);
  assert.ok(swung.distanceTo(anchor) < cord.length + .035);
  assert.equal(cord.line.geometry.attributes.position.getX(0), anchor.x);
  assert.ok(Math.abs(advance(600).x) < .035);

  const pulled = new THREE.Vector3(.11, 1.58, 0);
  assert.ok(advance(20, pulled).distanceTo(pulled) < 1e-7);
  assert.ok(advance(600).distanceTo(new THREE.Vector3(0, 1.69, 0)) < .035);
});
