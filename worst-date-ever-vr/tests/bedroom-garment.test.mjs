import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Object3D, Vector3 } from 'three';
import { createGarment } from '../src/bedroom-garment.js';

test('an anchored sheet drapes in depth and stays above its support plane', () => {
  const root = new Group();
  const nodes = Array.from({ length: 9 }, (_, index) => {
    const bone = new Object3D();
    bone.position.set((1 - index % 3) * .093, .12, (Math.floor(index / 3) - 1) * .111);
    root.add(bone);
    return bone;
  });
  const cloth = createGarment({ bend: .031, damp: .88 }, nodes,
    (_, to) => new Vector3(to.x, Math.max(to.y, .012), to.z));
  for (let i = 0; i < 115; i++) cloth.tick(.01);
  const hanging = nodes[1].getWorldPosition(new Vector3());
  assert.ok(hanging.y < .09 && hanging.y >= .012);
  assert.ok(Math.abs(hanging.distanceTo(nodes[4].getWorldPosition(new Vector3())) - .111) < .006);
  for (const pin of [3, 4, 5]) nodes[pin].position.y += .34;
  for (let i = 0; i < 90; i++) cloth.tick(.01);
  assert.ok(nodes[1].position.y > hanging.y + .27);
});
