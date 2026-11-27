import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBedroomPhysics } from '../src/bedroom-physics.js';

test('a drawer front, tray and handle stay together when opened after idling', () => {
  const worldRoot = new THREE.Group();
  const handle = new THREE.Group();
  const tray = new THREE.Group();
  const door = new THREE.Group();
  const front = new THREE.Object3D();
  front.position.z = .045;
  tray.add(front);
  worldRoot.add(handle, tray, door);
  tray.position.set(1, .6, 0);
  handle.position.set(1, .6, -.03);
  door.position.set(-1, 0, 0);
  const nodes = { handle, tray, door };
  const shape = {
    position: [0, 0, 0], rotation: [0, 0, 0, 1], size: [.2, .04, .05],
    sphere: false, friction: .56, bounce: .05
  };
  const data = {
    colliders: [], soft: [],
    props: [{ id: 'handle', mass: .1, isKinematic: true, shapes: [shape] }],
    pulls: [{ id: 'handle', drawer: 'tray', direction: [0, 0, -1], Travel: .32 }],
    drawers: [{ id: 'tray', shapes: [{ ...shape, size: [.38, .12, .30] }] }],
    phone: { id: 'phone' }, door: { id: 'door', shapes: [shape] },
    station: { position: [9, 9, 9], shape }
  };
  const physics = createBedroomPhysics(THREE, worldRoot, data, id => nodes[id], () => {});
  const prop = physics.props.get('handle');
  const box = physics.trays.get('tray');
  const advance = seconds => {
    for (let step = 0; step < seconds * 120; step++) physics.tick(1 / 120);
  };
  const worldZ = part => part.getWorldPosition(new THREE.Vector3()).z;

  advance(4);
  assert.ok(physics.click(prop));
  advance(1);
  assert.ok(Math.abs(box.body.position.z + .32) < 1e-6);
  assert.ok(Math.abs(worldZ(front) - (.045 - .32)) < 1e-6);
  assert.ok(Math.abs(worldZ(handle) - (-.03 - .32)) < 1e-6);

  advance(4);
  const grip = handle.getWorldPosition(new THREE.Vector3());
  const inside = grip.clone().add(new THREE.Vector3(0, 0, .06));
  const outside = grip.clone().add(new THREE.Vector3(0, 0, -.10));
  const orientation = new THREE.Quaternion();
  assert.equal(physics.nearest(inside), undefined);
  assert.equal(physics.click(prop, inside), false);
  assert.equal(physics.grab('hand', inside, orientation, prop), false);
  assert.equal(physics.grab('hand', grip, orientation, prop, { from: inside, remote: true }), false);
  assert.ok(physics.grab('hand', grip, orientation, prop, { from: outside, remote: true }));
  const trackedPose = { position: outside, orientation };
  assert.equal(physics.handOnObject('hand', trackedPose), trackedPose);
  assert.ok(physics.rayTarget('hand').z < grip.z);
  physics.release('hand', false);
  assert.equal(physics.rayTarget('hand'), null);
  assert.ok(physics.grab('hand', grip, new THREE.Quaternion(), prop));
  assert.ok(physics.handOnObject('hand', trackedPose).position.z < grip.z);
  physics.updateGrab('hand', grip.clone().add(new THREE.Vector3(0, 0, .36)), new THREE.Quaternion());
  advance(1);
  physics.release('hand', false);
  assert.ok(Math.abs(worldZ(front) - .045) < 1e-6);
  assert.ok(Math.abs(worldZ(handle) + .03) < 1e-6);
});
