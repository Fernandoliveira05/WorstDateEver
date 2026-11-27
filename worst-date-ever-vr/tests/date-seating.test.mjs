import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createSeatPose, cushionTop } from '../src/date/seat-ik.js';

function standingLegs() {
  const actor = new THREE.Group();
  const bones = {};
  for (const [side, x] of [['L',-.10],['R',.10]]) {
    const thigh = new THREE.Bone(), shin = new THREE.Bone(), foot = new THREE.Bone();
    thigh.position.set(x,.88,0);
    shin.position.set(0,-.4,0);
    foot.position.set(0,-.4,0);
    actor.add(thigh); thigh.add(shin); shin.add(foot);
    Object.assign(bones, { ['UpperLeg'+side]: thigh, ['LowerLeg'+side]: shin, ['Foot'+side]: foot });
  }
  return { actor, bones };
}

test('the seat solver moves the hips onto the cushion with feet down and knees forward', () => {
  const { actor, bones } = standingLegs();
  const pose = createSeatPose(THREE, actor, bones);
  for (const yaw of [0, Math.PI/2, Math.PI]) {
    pose.reset();
    actor.position.set(0,0,0);
    actor.rotation.y = yaw;
    pose.apply(1);
    const forward = new THREE.Vector3(Math.sin(yaw),0,Math.cos(yaw));
    for (const side of ['L','R']) {
      const hip = bones['UpperLeg'+side].getWorldPosition(new THREE.Vector3());
      const knee = bones['LowerLeg'+side].getWorldPosition(new THREE.Vector3());
      const foot = bones['Foot'+side].getWorldPosition(new THREE.Vector3());
      assert.ok(Math.abs(hip.y - (cushionTop + .075)) < 1e-7);
      assert.ok(Math.abs(foot.y - .08) < 1e-7);
      assert.ok(knee.clone().sub(hip).dot(forward) > .25);
      assert.ok(Math.abs(hip.distanceTo(knee) - .4) < 1e-7);
      assert.ok(Math.abs(foot.distanceTo(knee) - .4) < 1e-7);
    }
  }
});

test('a floor seat spreads the knees outside the cushion and rests the feet ahead of it', () => {
  const { actor, bones } = standingLegs();
  const pose = createSeatPose(THREE, actor, bones, { seatTop: .16, floorSeat: true });
  pose.apply(1);
  for (const side of ['L', 'R']) {
    const hip = bones['UpperLeg' + side].getWorldPosition(new THREE.Vector3());
    const knee = bones['LowerLeg' + side].getWorldPosition(new THREE.Vector3());
    const ankle = bones['Foot' + side].getWorldPosition(new THREE.Vector3());
    assert.ok(knee.y < hip.y + .05);
    assert.ok((side === 'L' ? -1 : 1) * knee.x > .34);
    assert.ok(Math.abs(ankle.y - .08) < 1e-7);
    assert.ok(ankle.z > .40);
  }
});

test('NPC approach routes end at their actual chair anchors in both clients', () => {
  const content = JSON.parse(readFileSync(new URL('../content/shared/venue-layout.json', import.meta.url)));
  const native = JSON.parse(readFileSync(new URL('../unity/Assets/WorstDateEver/Resources/FirstDate/venue-layout.json', import.meta.url)));
  assert.deepEqual(content.seats, native.seats);
  const lookup = id => content.seats.find(seat => seat.id === id).position;
  assert.deepEqual(content.dateRoute.at(-1), lookup('date_seat'));
  assert.deepEqual(content.entranceRoute.at(-1), lookup('entry_guest'));
  assert.deepEqual(content.restroomRoute[0], lookup('restroom_guest'));
});

test('the unweighted ankle endpoint drives a separately rooted shoe', () => {
  const actor = new THREE.Group();
  const thigh = new THREE.Bone(), shin = new THREE.Bone(), foot = new THREE.Bone();
  const endpoint = new THREE.Object3D();
  endpoint.name = 'LowerLeg.L_end';
  thigh.position.y = .88;
  shin.position.y = -.40;
  endpoint.position.y = -.40;
  foot.position.y = .08;
  actor.add(thigh, foot);
  thigh.add(shin);
  shin.add(endpoint);
  const pose = createSeatPose(THREE, actor, { UpperLegL: thigh, LowerLegL: shin, FootL: foot });
  pose.apply(1);
  const placed = foot.getWorldPosition(new THREE.Vector3());
  assert.ok(Math.abs(placed.y - .08) < 1e-7);
  assert.ok(Math.abs(placed.z - .29) < 1e-7);
  pose.reset();
  assert.ok(foot.position.distanceTo(new THREE.Vector3(0,.08,0)) < 1e-7);
});
