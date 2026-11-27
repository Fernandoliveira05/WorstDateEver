import test from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three';
import { Body, Box, Vec3, World } from 'cannon-es';
import { createSolidContact } from '../src/bedroom-solid-contact.js';

function box(world, x, y, z, half, type) {
  const body = new Body({ type, mass: type === Body.DYNAMIC ? 1 : 0,
    position: new Vec3(x, y, z), shape: new Box(new Vec3(...half)) });
  world.addBody(body);
  return body;
}

test('held shapes stop at solid surfaces and at other props over a fast move', () => {
  for (const kind of [Body.STATIC, Body.DYNAMIC]) {
    const world = new World();
    const tool = box(world, -.4, .8, 0, [.06, .055, .055], Body.KINEMATIC);
    box(world, 0, .8, 0, [.016, .23, .23], kind);
    const contact = createSolidContact(world);
    const hit = contact.motion(tool, new Vector3(.65, .8, 0), new Quaternion(), new Set([tool]));
    assert.ok(hit.next.x < -.076 && hit.next.x > -.09);
  }
});

test('a held object cannot rotate its long edge through a table', () => {
  const world = new World();
  const tool = box(world, 0, .61, 0, [.17, .035, .04], Body.KINEMATIC);
  box(world, 0, .45, 0, [.5, .048, .5], Body.STATIC);
  const contact = createSolidContact(world);
  const desired = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI / 2);
  const result = contact.motion(tool, new Vector3(0, .61, 0), desired, new Set([tool]));
  assert.ok(result.rotation.angleTo(desired) > .29);
  assert.ok(result.rotation.angleTo(new Quaternion()) > .2);
});
