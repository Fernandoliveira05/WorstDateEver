import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HAND_JOINTS,
  HandPosePipeline,
  WRIST_INDEX,
  pinchThresholds
} from '../src/hand-pose.mjs';

const REFERENCE_SPACE = { name: 'renderer-xr-reference-space' };

function createJointSpaces() {
  return new Map(HAND_JOINTS.map((name, index) => [name, {
    jointName: name,
    position: {
      x: name === 'wrist' || name === 'thumb-tip' ? 0.1 : 0.1 + index * 0.001,
      y: 0.2,
      z: 0.3
    }
  }]));
}

function makeFakeScene(rigPosition, { rigRotation = null, pinch = true } = {}) {
  const rig = new THREE.Object3D();
  rig.position.set(rigPosition.x, rigPosition.y, rigPosition.z);
  if (rigRotation) { rig.quaternion.setFromEuler(rigRotation); }
  const camera = new THREE.Object3D();
  rig.add(camera);
  rig.updateMatrixWorld(true);

  const jointSpaces = createJointSpaces();
  const hand = {
    size: HAND_JOINTS.length,
    get(name) { return jointSpaces.get(name); },
    // Deliberately not canonical order: the pipeline must resolve names via get().
    values() { return Array.from(jointSpaces.values()).reverse(); }
  };

  function placeTips(currentPinch) {
    const wrist = jointSpaces.get('wrist');
    const thumb = jointSpaces.get('thumb-tip');
    const index = jointSpaces.get('index-finger-tip');
    thumb.position.x = wrist.position.x;
    thumb.position.y = wrist.position.y;
    thumb.position.z = wrist.position.z;
    index.position.x = wrist.position.x + (currentPinch ? 0.004 : 0.08);
    index.position.y = wrist.position.y;
    index.position.z = wrist.position.z;
  }
  placeTips(pinch);

  function makeFrame() {
    return {
      fillPoses(joints, space, target) {
        assert.equal(space, REFERENCE_SPACE);
        assert.equal(joints.length, HAND_JOINTS.length);
        target.fill(0);
        for (let i = 0; i < joints.length; i++) {
          const { position } = joints[i];
          target[i * 16] = 1;
          target[i * 16 + 5] = 1;
          target[i * 16 + 10] = 1;
          target[i * 16 + 12] = position.x;
          target[i * 16 + 13] = position.y;
          target[i * 16 + 14] = position.z;
          target[i * 16 + 15] = 1;
        }
        return true;
      },
      fillJointRadii(joints, target) {
        assert.equal(joints.length, HAND_JOINTS.length);
        target.fill(0.008);
        return true;
      }
    };
  }

  const sceneEl = {
    camera: { el: { object3D: camera } },
    frame: makeFrame(),
    renderer: { xr: { getReferenceSpace() { return REFERENCE_SPACE; } } },
    xrSession: { inputSources: [{ handedness: 'right', hand }] }
  };

  return {
    rig,
    sceneEl,
    jointSpaces,
    nextFrame({ wristX = 0.1, pinched = pinch } = {}) {
      jointSpaces.get('wrist').position.x = wristX;
      placeTips(pinched);
      sceneEl.frame = makeFrame();
      return sceneEl.frame;
    }
  };
}

test('pinch thresholds scale with real XR joint radii', () => {
  const small = pinchThresholds(0.006, 0.006);
  const large = pinchThresholds(0.012, 0.012);
  assert.ok(small.start < large.start);
  assert.ok(large.end > large.start);
  assert.ok(small.start >= 0.010);
  assert.ok(large.end <= 0.026 * 1.3);
});

test('hand pose pipeline resolves joints by name instead of values() order', () => {
  const { sceneEl } = makeFakeScene({ x: 1, y: 0.5, z: -2 });
  const pipeline = new HandPosePipeline(sceneEl);
  const right = pipeline.update().right;

  assert.equal(right.active, true);
  assert.equal(right.jointCount, HAND_JOINTS.length);
  // values() is reversed in the fake, so a positional implementation would
  // put a pinky joint here instead of the named wrist.
  assert.ok(Math.abs(right.wristPosition.x - 1.10) < 1e-6);
  assert.ok(Math.abs(right.wristPosition.y - 0.70) < 1e-6);
  assert.ok(Math.abs(right.wristPosition.z - -1.70) < 1e-6);
  assert.equal(right.justPinched, true);
  assert.equal(right.pinched, true);
});

test('pipeline falls back to jointName values when XRHand.get is unavailable', () => {
  const { sceneEl } = makeFakeScene({ x: 1, y: 0.5, z: -2 });
  delete sceneEl.xrSession.inputSources[0].hand.get;
  const pipeline = new HandPosePipeline(sceneEl);
  const right = pipeline.update().right;

  assert.equal(right.active, true);
  assert.equal(right.jointCount, HAND_JOINTS.length);
  assert.ok(Math.abs(right.wristPosition.x - 1.10) < 1e-6);
  assert.ok(Math.abs(right.wristPosition.y - 0.70) < 1e-6);
  assert.ok(Math.abs(right.wristPosition.z - -1.70) < 1e-6);
});

test('visual matrices stay rig-local while interaction matrices are rig-world', () => {
  const rotation = new THREE.Euler(0, Math.PI / 2, 0);
  const { sceneEl, rig } = makeFakeScene({ x: 1, y: 0.5, z: -2 }, { rigRotation: rotation });
  const pipeline = new HandPosePipeline(sceneEl);
  const right = pipeline.update().right;

  const local = right.jointMatrices[WRIST_INDEX];
  const expectedWorld = new THREE.Matrix4().multiplyMatrices(rig.matrixWorld, local);
  const actualWorld = new THREE.Matrix4().fromArray(right.worldMatrices[WRIST_INDEX].elements);
  for (let i = 0; i < 16; i++) {
    assert.ok(Math.abs(actualWorld.elements[i] - expectedWorld.elements[i]) < 1e-6,
      `world element ${i} matches rigWorld * joint`);
  }

  // The instanced dots live under #rig; applying rigWorld again would be a
  // double transform and would move them away from the real hand.
  const visual = right.visualMatrices[WRIST_INDEX].elements;
  assert.ok(Math.abs(visual[12] - 0.1) < 1e-6);
  assert.ok(Math.abs(visual[13] - 0.2) < 1e-6);
  assert.ok(Math.abs(visual[14] - 0.3) < 1e-6);
});

test('sampleHand publishes a new scene.frame instead of reusing the last dots', () => {
  const { sceneEl, nextFrame } = makeFakeScene({ x: 0, y: 0, z: 0 });
  const pipeline = new HandPosePipeline(sceneEl);
  const first = pipeline.update().right;
  assert.ok(Math.abs(first.visualMatrices[WRIST_INDEX].elements[12] - 0.1) < 1e-6);

  const oldFrame = sceneEl.frame;
  const next = nextFrame({ wristX: 0.4 });
  assert.notEqual(next, oldFrame);
  assert.ok(Math.abs(pipeline.getHand('right').visualMatrices[WRIST_INDEX].elements[12] - 0.1) < 1e-6);

  const fresh = pipeline.sampleHand('right');
  assert.equal(pipeline.frame, next);
  assert.ok(Math.abs(fresh.visualMatrices[WRIST_INDEX].elements[12] - 0.4) < 1e-6);
  assert.ok(Math.abs(fresh.wristPosition.x - 0.4) < 1e-6);
});

test('pipeline caches the same scene.frame instead of composing twice', () => {
  const { sceneEl } = makeFakeScene({ x: 0.5, y: 0, z: 0 });
  const pipeline = new HandPosePipeline(sceneEl);
  const first = pipeline.update();
  const wrist = first.right.wristPosition.x;
  const second = pipeline.update();
  assert.equal(second.right.wristPosition.x, wrist);
  assert.equal(second.right.justPinched, true);
  assert.equal(pipeline.frame, sceneEl.frame);
});

test('hands remain usable when the browser only provides per-joint poses', () => {
  const { sceneEl } = makeFakeScene({ x: 1, y: .5, z: -2 });
  sceneEl.frame = {
    getJointPose(joint, referenceSpace) {
      assert.equal(referenceSpace, REFERENCE_SPACE);
      const { x, y, z } = joint.position;
      return { transform: { matrix: new THREE.Matrix4().makeTranslation(x, y, z).elements }, radius: .009 };
    }
  };
  const hand = new HandPosePipeline(sceneEl).sampleHand('right');
  assert.ok(hand.active);
  assert.ok(hand.justPinched);
  assert.ok(Math.abs(hand.wristPosition.x - 1.1) < 1e-6);
  assert.ok(Math.abs(hand.jointRadii[WRIST_INDEX] - .009) < 1e-6);
});
