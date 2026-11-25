export function currentXrFrame(scene) {
  return scene.renderer?.xr?.getFrame?.() ?? scene.frame;
}

export function sampleSpace(THREE, scene, rig, space, frame = currentXrFrame(scene)) {
  const reference = scene.renderer.xr.getReferenceSpace();
  if (!space || !reference || !frame) return null;
  let pose;
  try { pose = frame.getPose(space, reference); }
  catch { return null; }
  if (!pose) return null;
  const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
  rig.updateWorldMatrix(true, false);
  matrix.premultiply(rig.matrixWorld);
  const position = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  matrix.decompose(position, orientation, new THREE.Vector3());
  return { position, orientation };
}

export function pointRay(THREE, ray, pose) {
  ray.set(pose.position, new THREE.Vector3(0, 0, -1).applyQuaternion(pose.orientation).normalize());
}

export function controllerSpaces(THREE, scene, rig, source, side, tracked = {}) {
  if (!source) return null;
  const grip = sampleSpace(THREE, scene, rig, source.gripSpace) ?? tracked.grip;
  const pointer = sampleSpace(THREE, scene, rig, source.targetRaySpace) ?? tracked.pointer;
  const anchor = grip ?? pointer;
  if (!anchor) return null;
  // WebXR grip -Z points toward the thumb and +Y toward the forearm.
  // The avatar basis uses +X toward the thumb and +Z toward the wrist.
  const offset = grip ? new THREE.Vector3(0, .045, 0) : new THREE.Vector3(0, -.018, .09);
  const wrist = anchor.position.clone().add(offset.applyQuaternion(anchor.orientation));
  const basis = grip ? new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(0,0,-1), new THREE.Vector3(-1,0,0), new THREE.Vector3(0,1,0))) :
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1), side === 'right' ? Math.PI : 0);
  const orientation = anchor.orientation.clone().multiply(basis);
  return { aim: pointer ?? grip, position: wrist, orientation };
}

export function trackedObjectPose(THREE, object) {
  if (!object?.visible) return null;
  return { position: object.getWorldPosition(new THREE.Vector3()),
    orientation: object.getWorldQuaternion(new THREE.Quaternion()) };
}

export function nativeControllerButtons(session) {
  const states = new WeakMap();
  const types = {'selectstart':[0,true], 'selectend':[0,false], 'squeezestart':[1,true], 'squeezeend':[1,false]};
  const listeners = Object.entries(types).map(([type, [index, held]]) => {
    const listener = ({ inputSource }) => {
      if (!inputSource) return;
      let state = states.get(inputSource);
      if (!state) states.set(inputSource, state = { held: [false,false], pending: [false,false] });
      state.held[index] = held;
      if (held) state.pending[index] = true;
    };
    session.addEventListener(type, listener);
    return [type, listener];
  });
  return {
    read(source) {
      const state = source && states.get(source);
      if (!state) return [false,false];
      const result = state.held.map((held, index) => held || state.pending[index]);
      state.pending.fill(false);
      return result;
    },
    dispose() {
      for (const [type, listener] of listeners) session.removeEventListener(type, listener);
    }
  };
}
