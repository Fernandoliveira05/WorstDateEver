import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { controllerSpaces, pointRay } from '../src/xr-input.js';
import { handTriangles } from '../src/avatar-hands.js';

test('controller model uses grip independently from the pointing ray', () => {
  const rig = new THREE.Group();
  rig.position.set(1, 0, 2);
  rig.rotation.y = Math.PI / 2;
  const gripSpace = { matrix: new THREE.Matrix4().makeTranslation(.2, 1.2, -.3).elements };
  const targetRaySpace = { matrix: new THREE.Matrix4().makeTranslation(.1, 1.2, -.5).elements };
  const scene = {
    renderer: { xr: { getReferenceSpace: () => ({}) } },
    frame: { getPose: space => ({ transform: space }) }
  };
  const both = controllerSpaces(THREE, scene, rig, { gripSpace, targetRaySpace }, 'right');
  const left = controllerSpaces(THREE, scene, rig, { gripSpace, targetRaySpace }, 'left');
  assert.ok(both.contact.distanceTo(new THREE.Vector3(.7, 1.2, 1.8)) < 1e-7);
  assert.ok(both.position.distanceTo(new THREE.Vector3(.7, 1.308, 1.777)) < 1e-7);
  assert.ok(left.position.distanceTo(new THREE.Vector3(.7, 1.308, 1.823)) < 1e-7);
  assert.equal(both.hasGrip, true);
  const ray = new THREE.Raycaster();
  pointRay(THREE, ray, both.aim);
  assert.ok(ray.ray.origin.distanceTo(new THREE.Vector3(.5, 1.2, 1.9)) < 1e-7);
  const fallback = controllerSpaces(THREE, scene, rig, { targetRaySpace }, 'left');
  assert.ok(fallback.position.distanceTo(new THREE.Vector3(.59, 1.182, 1.9)) < 1e-7);
  assert.equal(fallback.hasGrip, false);
});

test('hand geometry selects wrist and finger influences and keeps other body faces out', () => {
  const torso = new THREE.Bone(), wrist = new THREE.Bone(), finger = new THREE.Bone();
  torso.add(wrist); wrist.add(finger);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
    1,0,0,0, 2,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0
  ], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(
    Array.from({length:6}, () => [1,0,0,0]).flat(), 4));
  geometry.setIndex([0,1,2, 3,4,5, 0,1,3]);
  assert.deepEqual(handTriangles(geometry, [torso,wrist,finger], wrist), [0,1,2]);
});

test('native select and squeeze events retain short taps between XR frames', async () => {
  const { nativeControllerButtons } = await import('../src/xr-input.js');
  const session = new EventTarget(), source = {};
  const buttons = nativeControllerButtons(session);
  const emit = type => session.dispatchEvent(Object.assign(new Event(type), { inputSource:source }));
  emit('selectstart'); emit('selectend');
  assert.deepEqual(buttons.read(source), [true,false]);
  assert.deepEqual(buttons.read(source), [false,false]);
  emit('squeezestart');
  assert.deepEqual(buttons.read(source), [false,true]);
  emit('squeezeend');
  assert.deepEqual(buttons.read(source), [false,false]);
  buttons.dispose();
});

test('XR pose sampling uses the active renderer frame when the scene frame has expired', () => {
  const rig = new THREE.Group();
  const transform = { matrix: new THREE.Matrix4().makeTranslation(.2, 1.2, -.3).elements };
  const scene = {
    renderer: { xr: { getReferenceSpace: () => ({}), getFrame: () => ({ getPose: () => ({ transform }) }) } },
    frame: { getPose() { throw new Error('Expired frame'); } }
  };
  const hand = { handedness: 'left', hand: new Map(), targetRaySpace: {} };
  assert.deepEqual(controllerSpaces(THREE, scene, rig, hand, 'left').aim.position.toArray(), [.2, 1.2, -.3]);
});

test('native hand select pulses survive missing or incomplete joint samples', async () => {
  const { nativeControllerButtons } = await import('../src/xr-input.js');
  const session = new EventTarget(), hand = { hand: new Map() };
  const buttons = nativeControllerButtons(session);
  for (const type of ['selectstart', 'selectend'])
    session.dispatchEvent(Object.assign(new Event(type), { inputSource: hand }));
  assert.deepEqual(buttons.read(hand), [true, false]);
  assert.deepEqual(buttons.read(hand), [false, false]);
  buttons.dispose();
});
