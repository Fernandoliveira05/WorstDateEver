import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBedroomPhysics } from '../src/bedroom-physics.js';

function liftByEdge(material) {
  const root = new THREE.Group();
  const nodes = {};
  for (const [id, position] of Object.entries({
    middle: [0, .62, 0], left: [-.13, 0, 0], right: [.13, 0, 0], door: [-2, 0, 0]
  })) {
    const object = new THREE.Group();
    object.position.fromArray(position);
    nodes[id] = object;
  }
  nodes.middle.add(nodes.left, nodes.right);
  root.add(nodes.middle, nodes.door);
  const rotation = [0, 0, 0, 1];
  const shape = { position: [0, 0, 0], rotation, size: [.09, .055, .22],
    friction: .56, bounce: 0, sphere: false };
  const data = {
    props: ['middle', 'left', 'right'].map(id => ({ id, mass: id === 'middle' ? .13 : .04, shapes: [shape] })),
    soft: [{ core: 'middle', ends: ['left', 'right'], limit: 46, material, outfit: -1 }],
    colliders: [{ position: [0, .5, 0], rotation, shape: { ...shape, size: [2, .12, 2] } }],
    door: { id: 'door', shapes: [shape] },
    station: { position: [9, 9, 9], shape },
    phone: { id: 'phone' }, pulls: [], drawers: []
  };
  const physics = createBedroomPhysics(THREE, root, data, id => nodes[id], () => {});
  const parts = [...physics.props.values()];
  for (let i = 0; i < 360; i++) physics.tick(1 / 120);
  for (const part of parts) part.body.sleep();
  const edge = parts[1];
  const original = parts.map(part => part.body.position.y);
  const origin = edge.object.getWorldPosition(new THREE.Vector3());
  const heldRotation = edge.object.getWorldQuaternion(new THREE.Quaternion());
  assert.ok(physics.grab('hand', origin, heldRotation, edge));
  assert.ok(parts.every(part => part.body.sleepState === 0));
  let maxGap = 0;
  for (let i = 0; i < 160; i++) {
    const destination = origin.clone().add(new THREE.Vector3(0, .5 * Math.min(1, i / 65), 0));
    physics.updateGrab('hand', destination, heldRotation);
    physics.tick(1 / 120);
    for (const joint of physics.world.constraints) {
      maxGap = Math.max(maxGap, joint.bodyA.pointToWorldFrame(joint.pivotA)
        .distanceTo(joint.bodyB.pointToWorldFrame(joint.pivotB)));
    }
  }
  assert.ok(parts.every((part, i) => part.body.position.y - original[i] > .20));
  assert.ok(maxGap < .006);
  const middle = new THREE.Quaternion().fromArray(parts[0].body.quaternion.toArray());
  const hang = middle.angleTo(new THREE.Quaternion().fromArray(edge.body.quaternion.toArray()));
  assert.ok(physics.release('hand', false));
  assert.ok(parts.every(part => part.body.allowSleep));
  return hang;
}

test('lifting a sleeping item by an edge keeps every segment attached and preserves material drape', () => {
  const pillow = liftByEdge('Filled Linen');
  const rubber = liftByEdge('Soft Rubber');
  const knit = liftByEdge('Heavy Knit');
  const jersey = liftByEdge('Cotton Jersey');
  assert.ok(knit > pillow && jersey > knit, 'cotton drapes more than knit, and knit more than a filled pillow');
  assert.ok(jersey > rubber, 'the rubber prop stays more structured than cotton');
});
