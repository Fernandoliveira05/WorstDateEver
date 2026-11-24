import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDynamicBox,
  addStaticBox,
  createPhysicsWorld,
  isOutsideBounds,
  isSleeping,
  makeKinematic,
  moveKinematic,
  releaseDynamic,
  stepPhysics
} from '../src/physics-world.mjs';

test('gravity drops a prop onto a static room surface', () => {
  const world = createPhysicsWorld();
  addStaticBox(world, [2, 0.1, 2], [0, -0.05, 0]);
  const body = addDynamicBox(world, {
    size: [0.2, 0.2, 0.2],
    mass: 0.2,
    position: [0, 1, 0]
  });
  for (let i = 0; i < 360; i++) { stepPhysics(world, 1 / 90); }
  assert.ok(body.position.y > 0.09);
  assert.ok(body.position.y < 0.16);
  assert.ok(isSleeping(body));
});

test('static desk blocks a falling phone-sized body', () => {
  const world = createPhysicsWorld();
  addStaticBox(world, [2, 0.07, 0.92], [0, 0.7525, 0]);
  const body = addDynamicBox(world, {
    size: [0.18, 0.30, 0.023],
    mass: 0.17,
    position: [0, 1.4, 0]
  });
  for (let i = 0; i < 360; i++) { stepPhysics(world, 1 / 90); }
  // The thin phone tips over and rests flat on the desk instead of falling
  // through it; its center settles near half the phone thickness above the top.
  assert.ok(body.position.y > 0.78);
  assert.ok(body.position.y < 0.83);
});

test('two dynamic props collide and transfer motion', () => {
  const world = createPhysicsWorld();
  world.gravity.set(0, 0, 0);
  addStaticBox(world, [4, 0.1, 4], [0, -0.05, 0]);
  const first = addDynamicBox(world, { size: [0.2, 0.2, 0.2], mass: 0.2, position: [0, 0.2, 0] });
  const second = addDynamicBox(world, { size: [0.2, 0.2, 0.2], mass: 0.2, position: [0.55, 0.2, 0] });
  first.velocity.set(2, 0, 0);
  for (let i = 0; i < 180; i++) { stepPhysics(world, 1 / 90); }
  assert.ok(second.position.x > 0.55);
  assert.ok(second.velocity.length() > 0.05);
});

test('kinematic hand pose produces a release velocity', () => {
  const world = createPhysicsWorld();
  const body = addDynamicBox(world, {
    size: [0.18, 0.30, 0.023],
    mass: 0.17,
    position: [0, 1.2, 0]
  });
  makeKinematic(body);
  const position = { x: 0.12, y: 1.24, z: -0.4 };
  const quaternion = { x: 0, y: 0, z: 0, w: 1 };
  moveKinematic(body, position, quaternion, 0.05);
  assert.ok(body.velocity.x > 2);
  assert.ok(Math.abs(body.position.y - 1.24) < 1e-6);
  releaseDynamic(body);
  assert.equal(body.type, 1);
  assert.ok(body.velocity.length() > 5.9);
  assert.ok(body.velocity.length() <= 6.001);
});

test('bounds predicate catches a phone that fell out of the room', () => {
  const world = createPhysicsWorld();
  const body = addDynamicBox(world, { size: [0.1, 0.1, 0.1], mass: 0.1, position: [0, 3.5, 0] });
  const bounds = { minX: -2.4, maxX: 2.4, minY: -0.2, maxY: 2.85, minZ: -3.3, maxZ: 2.1 };
  assert.equal(isOutsideBounds(body, bounds), true);
  body.position.set(0, 1, 0);
  assert.equal(isOutsideBounds(body, bounds), false);
});
