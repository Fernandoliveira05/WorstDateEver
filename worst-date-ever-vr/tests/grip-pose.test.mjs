import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Body, Box, Sphere, Vec3 } from '../vendor/cannon-es/dist/cannon-es.js';
import { phoneGrip, gripSurface, conformJoint } from '../src/grip-pose.mjs';
import { createAvatarHand, handBasis } from '../src/avatar-hands.js';

test('phone stays in a portrait pose with a fixed transform for each wrist', () => {
  const wrist = new THREE.Vector3(.4, 1.4, .2);
  for (const side of ['left', 'right']) {
    const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
    const grip = phoneGrip(THREE, wrist, basis, side);
    const localTop = new THREE.Vector3(0, 1, 0).applyQuaternion(grip.orientation).applyQuaternion(basis.clone().invert());
    const palm = new THREE.Vector3(0, side === 'left' ? -1 : 1, 0).applyQuaternion(basis);
    const screen = new THREE.Vector3(0, 0, -1).applyQuaternion(grip.orientation);
    assert.ok(screen.dot(palm) > .999);
    assert.ok(grip.position.clone().sub(wrist).dot(palm) > .015);
    assert.ok(localTop.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);
    assert.ok(grip.position.distanceTo(wrist) < .13);
  }
});

test('fingers stop at the surface of the held shape and keep their length', () => {
  const body = new Body();
  body.addShape(new Box(new Vec3(.04, .06, .03)), new Vec3(.04, 0, 0));
  body.addShape(new Sphere(.02), new Vec3(-.06, 0, 0));
  const surface = gripSurface(THREE, body);
  assert.ok(surface(new THREE.Vector3(.04, 0, 0)) < 0);
  assert.ok(surface(new THREE.Vector3(-.06, 0, 0)) < 0);
  const origin = new THREE.Vector3(.07, 0, .06);
  const segment = new THREE.Vector3(.0, 0, -.06);
  const joint = conformJoint(THREE, origin, origin.clone().add(segment), new THREE.Vector3(0, 1, 0),
    new THREE.Quaternion(), surface, .007);
  const next = segment.clone().applyQuaternion(joint);
  assert.ok(surface(next.clone().add(origin)) > 0);
  assert.ok(Math.abs(next.length() - segment.length()) < 1e-8);
});


function loadAvatarBones(avatar) {
  const bytes = readFileSync(new URL('../public/assets/bedroom/Characters/' + avatar + '.glb', import.meta.url));
  const { nodes, scenes, scene } = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const bones = new Map();
  const visit = (index, parent) => {
    const node = nodes[index];
    const bone = new THREE.Bone();
    if (node.translation) bone.position.fromArray(node.translation);
    if (node.rotation) bone.quaternion.fromArray(node.rotation);
    if (node.scale) bone.scale.fromArray(node.scale);
    parent.add(bone);
    bones.set(node.name, bone);
    for (const child of node.children ?? []) visit(child, bone);
  };
  const model = new THREE.Group();
  for (const index of scenes[scene].nodes) visit(index, model);
  model.updateMatrixWorld(true);
  return { model, bones };
}

const position = bone => bone.getWorldPosition(new THREE.Vector3());

test('both controller hands curl toward the thumb side of the shipped avatar palms', () => {
  for (const avatar of ['PlayerMan', 'PlayerWoman']) {
    const { model, bones } = loadAvatarBones(avatar);
    for (const side of ['L', 'R']) {
      const named = name => bones.get(name + '.' + side);
      const wrist = named('Wrist');
      const base = handBasis(THREE, position(wrist), position(named('Index2')), position(named('Pinky2')));
      const thumb = position(named('Thumb2')).sub(position(wrist)).applyQuaternion(base.clone().invert());
      const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.25, -.81, .77));
      const palm = new THREE.Vector3(0, Math.sign(thumb.y), 0).applyQuaternion(orientation);
      const hand = createAvatarHand(THREE, model, named, side, wrist);
      const pose = { position: new THREE.Vector3(.2, 1.35, -.4), orientation };
      const finger = named('Middle4').children[0];
      hand.update(pose, true);
      const open = position(finger);
      const knuckle = position(named('Middle2'));
      hand.reset();
      hand.update({ ...pose, squeeze: 1, trigger: 1 }, true);
      const closed = position(finger);
      assert.ok(position(named('Middle3')).sub(knuckle).dot(palm) > .02, avatar + ' ' + side);
      assert.ok(closed.distanceTo(knuckle) < open.distanceTo(knuckle) - .012);
      assert.ok(position(named('Middle2')).distanceTo(knuckle) < 1e-6);
      hand.reset();
    }
  }
});

test('a collider behind the knuckle cannot pull a closing finger backwards', () => {
  const origin = new THREE.Vector3();
  const next = new THREE.Vector3(0, 0, -.05);
  const obstacle = new THREE.Vector3(0, -.035, -.035);
  const distance = point => point.distanceTo(obstacle) - .012;
  const bend = conformJoint(THREE, origin, next, new THREE.Vector3(1,0,0), new THREE.Quaternion(),
    distance, .007, -.14);
  assert.ok(next.clone().applyQuaternion(bend).y >= -1e-8);
});


test('tracked fingertip closure stays on the palm side while fitting a prop', () => {
  const { model, bones } = loadAvatarBones('PlayerWoman');
  for (const side of ['L', 'R']) {
    const named = name => bones.get(name + '.' + side);
    const wrist = named('Wrist');
    const wristPosition = position(wrist);
    const basis = handBasis(THREE, wristPosition, position(named('Index2')), position(named('Pinky2')));
    const thumb = position(named('Thumb2')).sub(wristPosition).applyQuaternion(basis.clone().invert());
    const palm = new THREE.Vector3(0, Math.sign(thumb.y), 0).applyQuaternion(basis);
    const axis = new THREE.Vector3(Math.sign(thumb.y), 0, 0).applyQuaternion(basis);
    const worldMatrices = [new THREE.Matrix4().makeTranslation(...wristPosition)];
    for (const [digit, count] of [['Thumb', 3], ['Index', 4], ['Middle', 4], ['Ring', 4], ['Pinky', 4]]) {
      let point = position(named(digit + '1'));
      worldMatrices.push(new THREE.Matrix4().makeTranslation(...point));
      for (let i = 1; i <= count; i++) {
        const bone = named(digit + i);
        const toward = position(bone.children[0]).sub(position(bone));
        toward.applyAxisAngle(axis, (digit === 'Thumb' ? i : i - 1) * .50);
        point = point.clone().add(toward);
        worldMatrices.push(new THREE.Matrix4().makeTranslation(...point));
      }
    }
    const prop = new Body();
    const knuckle = position(named('Middle2'));
    const sphereCenter = knuckle.clone().addScaledVector(palm, .04)
      .add(new THREE.Vector3(0, 0, -.042).applyQuaternion(basis));
    prop.addShape(new Sphere(.023), new Vec3(...sphereCenter));
    const hand = createAvatarHand(THREE, model, named, side, wrist);
    const tracked = { position: wristPosition, tracked: { wristPosition, worldMatrices } };
    const direction = index => new THREE.Vector3().setFromMatrixPosition(worldMatrices[index]);
    const expected = direction(12).sub(direction(11)).normalize();
    hand.update(tracked, true);
    const unheld = position(named('Middle3')).sub(position(named('Middle2'))).normalize();
    assert.ok(unheld.dot(expected) > .999, side);
    hand.reset();
    hand.update({ ...tracked, heldBody: prop }, true);
    const resultant = position(named('Middle3')).sub(position(named('Middle2')));
    assert.ok(resultant.dot(palm) > .005, side);
    hand.reset();
  }
});
