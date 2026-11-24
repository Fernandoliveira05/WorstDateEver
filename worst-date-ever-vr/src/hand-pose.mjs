import * as THREE from 'three';

// WebXR hand joint order used by XRHand and A-Frame 1.8.
export const HAND_JOINTS = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip'
];

// Resolve the joints we consume by name. XRHand is a maplike interface and
// callers must not rely on values() iteration order matching this list.
export const WRIST_INDEX = HAND_JOINTS.indexOf('wrist');
export const THUMB_TIP_INDEX = HAND_JOINTS.indexOf('thumb-tip');
export const INDEX_TIP_INDEX = HAND_JOINTS.indexOf('index-finger-tip');

const MIN_PINCH_CONTACT_M = 0.010;
const MAX_PINCH_CONTACT_M = 0.026;

/**
 * A pinch starts at roughly 92% of the sum of both fingertip radii and ends
 * at 130%. Using the radii supplied by XRFrame.fillJointRadii avoids a
 * guessed hand-scale constant and adapts to the headset's hand mesh.
 */
export function pinchThresholds(thumbRadius, indexRadius) {
  const contact = THREE.MathUtils.clamp(
    (thumbRadius + indexRadius) * 0.92,
    MIN_PINCH_CONTACT_M,
    MAX_PINCH_CONTACT_M
  );
  return { start: contact, end: contact * 1.3 };
}

function createHandState(name) {
  return {
    name,
    active: false,
    hasPoses: false,
    source: null,
    hand: null,
    jointCount: 0,
    jointMatrices: Array.from({ length: HAND_JOINTS.length }, () => new THREE.Matrix4()),
    jointSpaces: new Array(HAND_JOINTS.length),
    worldMatrices: Array.from({ length: HAND_JOINTS.length }, () => new THREE.Matrix4()),
    visualMatrices: Array.from({ length: HAND_JOINTS.length }, () => new THREE.Matrix4()),
    jointPoses: new Float32Array(HAND_JOINTS.length * 16),
    jointRadii: new Float32Array(HAND_JOINTS.length),
    wristWorld: new THREE.Matrix4(),
    wristPosition: new THREE.Vector3(),
    indexTipWorld: new THREE.Vector3(),
    thumbTipWorld: new THREE.Vector3(),
    pinchPosition: new THREE.Vector3(),
    pinchRadius: 0.015,
    pinched: false,
    wasPinched: false,
    justPinched: false,
    justReleased: false
  };
}

/**
 * Resolve the 25 joints into HAND_JOINTS order. XRHand is maplike in current
 * WebXR implementations, but fall back to iterating jointName values so a
 * partial or non-maplike implementation still renders rather than dropping
 * the whole hand.
 */
function resolveJointSpaces(hand, target) {
  let complete = typeof hand.get === 'function';
  if (complete) {
    for (let i = 0; i < HAND_JOINTS.length; i++) {
      const space = hand.get(HAND_JOINTS[i]);
      target[i] = space || null;
      if (!space) { complete = false; }
    }
  }
  if (complete) { return true; }

  const byName = new Map();
  for (const joint of hand.values()) {
    if (joint?.jointName) { byName.set(joint.jointName, joint); }
  }
  complete = true;
  for (let i = 0; i < HAND_JOINTS.length; i++) {
    const space = byName.get(HAND_JOINTS[i]) || null;
    target[i] = space;
    if (!space) { complete = false; }
  }
  return complete;
}

/**
 * Same-frame WebXR pose source shared by hand visuals, grabs and fingertip
 * taps. XR joint poses are expressed in the Three.js XR reference space and
 * are mapped into A-Frame world space through the actual XR camera parent
 * (the tracking rig), exactly matching Three's WebXRManager camera update.
 */
export class HandPosePipeline {
  constructor(sceneEl) {
    this.sceneEl = sceneEl;
    this.frame = null;
    this.referenceSpace = null;
    this.rigWorld = new THREE.Matrix4();
    this.hands = {
      left: createHandState('left'),
      right: createHandState('right')
    };
    this._position = new THREE.Vector3();
    this._quaternion = new THREE.Quaternion();
    this._scale = new THREE.Vector3();
    this._radiusScale = new THREE.Vector3();
  }

  getHand(name) {
    return this.hands[name];
  }

  /**
   * Sample the current XR frame before reading a hand for rendering. This is
   * intentionally separate from getHand(), which only reads the last sample.
   * A-Frame components tick in one global order; making the render path ask
   * for a sample avoids drawing the previous frame's joints regardless of
   * where the interaction component happens to be ordered.
   */
  sampleHand(name) {
    this.update();
    return this.hands[name];
  }

  update() {
    const sceneEl = this.sceneEl;
    const frame = sceneEl.frame;
    const renderer = sceneEl.renderer;
    const referenceSpace = renderer?.xr?.getReferenceSpace?.() ?? null;

    if (!frame || !referenceSpace) {
      this.frame = null;
      this.referenceSpace = null;
      for (const state of Object.values(this.hands)) {
        state.wasPinched = state.pinched;
        state.pinched = false;
        state.justPinched = false;
        state.justReleased = false;
        state.active = false;
        state.hasPoses = false;
        state.jointCount = 0;
      }
      return this.hands;
    }

    if (frame === this.frame && referenceSpace === this.referenceSpace) {
      return this.hands;
    }

    this.frame = frame;
    this.referenceSpace = referenceSpace;

    const cameraObject = sceneEl.camera?.el?.object3D;
    const rig = cameraObject?.parent;
    if (rig) {
      rig.updateWorldMatrix(true, false);
      this.rigWorld.copy(rig.matrixWorld);
    } else {
      this.rigWorld.identity();
    }

    const session = sceneEl.xrSession;
    const inputSources = session?.inputSources ?? [];

    for (const state of Object.values(this.hands)) {
      state.justPinched = false;
      state.justReleased = false;
      state.wasPinched = state.pinched;
      state.active = false;
      state.hasPoses = false;
      state.jointCount = 0;

      let source = null;
      for (const candidate of inputSources) {
        if (candidate.handedness === state.name && candidate.hand?.values) {
          source = candidate;
          break;
        }
      }

      if (!source) {
        state.source = null;
        state.hand = null;
        state.pinched = false;
        continue;
      }

      const hand = source.hand;
      const hasNamedJoints = resolveJointSpaces(hand, state.jointSpaces);
      if (!hasNamedJoints) {
        state.source = null;
        state.hand = null;
        state.pinched = false;
        continue;
      }

      // fillPoses/fillJointRadii preserve the order of the supplied joint
      // spaces, so both the pose and radius buffers map to HAND_JOINTS.
      const hasPoses = frame.fillPoses?.(state.jointSpaces, referenceSpace, state.jointPoses) ??
        state.jointSpaces.every((joint, i) => {
          const pose = frame.getJointPose?.(joint, referenceSpace);
          if (!pose) return false;
          state.jointPoses.set(pose.transform.matrix, i * 16);
          state.jointRadii[i] = pose.radius ?? .008;
          return true;
        });
      if (frame.fillJointRadii) {
        if (!frame.fillJointRadii(state.jointSpaces, state.jointRadii)) state.jointRadii.fill(.008);
      } else if (frame.fillPoses) {
        state.jointRadii.fill(.008);
      }
      if (!hasPoses) {
        state.pinched = false;
        continue;
      }

      state.source = source;
      state.hand = hand;
      state.active = true;
      state.hasPoses = true;
      state.jointCount = HAND_JOINTS.length;

      for (let i = 0; i < state.jointCount; i++) {
        const local = state.jointMatrices[i];
        local.fromArray(state.jointPoses, i * 16);
        state.worldMatrices[i].multiplyMatrices(this.rigWorld, local);

        // Joint visuals are children of the XR rig, so they stay in the
        // reference space that Three's WebXRManager uses for the XR camera.
        // World matrices above are only for scene-space interactions.
        local.decompose(this._position, this._quaternion, this._scale);
        const radius = Math.max(.001, state.jointRadii[i] || .008);
        this._radiusScale.setScalar(radius);
        state.visualMatrices[i].compose(this._position, this._quaternion, this._radiusScale);
      }

      state.wristWorld.copy(state.worldMatrices[WRIST_INDEX]);
      state.wristWorld.decompose(state.wristPosition, this._quaternion, this._scale);
      state.indexTipWorld.setFromMatrixPosition(state.worldMatrices[INDEX_TIP_INDEX]);
      state.thumbTipWorld.setFromMatrixPosition(state.worldMatrices[THUMB_TIP_INDEX]);

      const thresholds = pinchThresholds(
        state.jointRadii[THUMB_TIP_INDEX] || 0.008,
        state.jointRadii[INDEX_TIP_INDEX] || 0.008
      );
      state.pinchRadius = thresholds.start;
      const distance = state.indexTipWorld.distanceTo(state.thumbTipWorld);
      state.pinchPosition.copy(state.indexTipWorld).add(state.thumbTipWorld).multiplyScalar(0.5);

      const nextPinched = state.pinched ? distance <= thresholds.end : distance <= thresholds.start;
      if (nextPinched && !state.pinched) {
        state.justPinched = true;
      } else if (!nextPinched && state.pinched) {
        state.justReleased = true;
      }
      state.pinched = nextPinched;
    }

    return this.hands;
  }
}

let sharedPipeline = null;

export function getHandPosePipeline(sceneEl) {
  if (!sharedPipeline || sharedPipeline.sceneEl !== sceneEl) {
    sharedPipeline = new HandPosePipeline(sceneEl);
  }
  return sharedPipeline;
}
