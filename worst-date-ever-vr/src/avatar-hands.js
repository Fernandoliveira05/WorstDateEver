import { conformJoint, flexionAngle, gripSurface, palmSign } from './grip-pose.mjs';

const digits = [
  ['Thumb', [1, 2, 3, 4]],
  ['Index', [5, 6, 7, 8, 9]],
  ['Middle', [10, 11, 12, 13, 14]],
  ['Ring', [15, 16, 17, 18, 19]],
  ['Pinky', [20, 21, 22, 23, 24]]
];

export function handBasis(THREE, wrist, index, little) {
  const x = index.clone().sub(little).normalize();
  const z = wrist.clone().sub(index.clone().lerp(little, .5));
  z.addScaledVector(x, -z.dot(x)).normalize();
  const y = z.clone().cross(x).normalize();
  if (y.lengthSq() < .5) return null;
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

export function trackedHandBasis(THREE, hand) {
  const index = new THREE.Vector3().setFromMatrixPosition(hand.worldMatrices[6]);
  const pinky = new THREE.Vector3().setFromMatrixPosition(hand.worldMatrices[21]);
  if (index.distanceToSquared(pinky) > .0004) {
    const basis = handBasis(THREE, hand.wristPosition, index, pinky);
    if (basis) return basis;
  }
  // The XR wrist pose still provides a palm frame when knuckle positions bunch up.
  if (!hand.wristWorld) return null;
  const basis = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().extractRotation(hand.wristWorld));
  if (hand.name === 'right') basis.multiply(new THREE.Quaternion(0, 0, 1, 0));
  return basis;
}

function belongsToHand(bone, wrist) {
  for (let current = bone; current; current = current.parent) if (current === wrist) return true;
  return false;
}

export function handTriangles(geometry, bones, wrist) {
  const skinIndex = geometry.getAttribute('skinIndex');
  const weight = geometry.getAttribute('skinWeight');
  if (!skinIndex || !weight) return [];
  const isHand = new Set(bones.flatMap((bone, index) => belongsToHand(bone, wrist) ? [index] : []));
  const strong = new Uint8Array(skinIndex.count);
  for (let vertex = 0; vertex < skinIndex.count; vertex++) {
    let influence = 0;
    for (let slot = 0; slot < 4; slot++)
      if (isHand.has(skinIndex.getComponent(vertex, slot))) influence += weight.getComponent(vertex, slot);
    strong[vertex] = influence >= .48;
  }
  const index = geometry.index;
  const triangles = [];
  const vertexAt = i => index ? index.getX(i) : i;
  for (let i = 0; i < (index?.count ?? skinIndex.count); i += 3) {
    const a = vertexAt(i), b = vertexAt(i + 1), c = vertexAt(i + 2);
    if (strong[a] + strong[b] + strong[c] >= 2) triangles.push(a, b, c);
  }
  return triangles;
}

export function createAvatarHand(THREE, model, named, side, wrist) {
  if (!wrist) return null;
  const index = named('Index2', side), little = named('Pinky2', side);
  if (!index || !little) return null;
  const getPosition = bone => bone.getWorldPosition(new THREE.Vector3());
  const rest = handBasis(THREE, getPosition(wrist), getPosition(index), getPosition(little));
  if (!rest) return null;
  const offset = rest.clone().invert().multiply(wrist.getWorldQuaternion(new THREE.Quaternion()));
  const sourceMeshes = [];
  model.traverse(mesh => { if (mesh.isSkinnedMesh) sourceMeshes.push(mesh); });
  const meshes = [];
  for (const source of sourceMeshes) {
    const triangles = handTriangles(source.geometry, source.skeleton.bones, wrist);
    if (!triangles.length) continue;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.geometry.attributes)) geometry.setAttribute(name, attribute);
    geometry.setIndex(triangles);
    const indices = geometry.getAttribute('skinIndex').clone();
    const weights = geometry.getAttribute('skinWeight').clone();
    const handBones = source.skeleton.bones.map(bone => belongsToHand(bone, wrist));
    const wristIndex = source.skeleton.bones.indexOf(wrist);
    for (const vertex of new Set(triangles)) {
      let total = 0;
      for (let slot = 0; slot < 4; slot++) {
        if (!handBones[indices.getComponent(vertex, slot)]) weights.setComponent(vertex, slot, 0);
        total += weights.getComponent(vertex, slot);
      }
      if (total < 1e-5) {
        indices.setComponent(vertex, 0, wristIndex);
        weights.setComponent(vertex, 0, 1);
      } else for (let slot = 0; slot < 4; slot++)
        weights.setComponent(vertex, slot, weights.getComponent(vertex, slot) / total);
    }
    geometry.setAttribute('skinIndex', indices);
    geometry.setAttribute('skinWeight', weights);
    const mesh = new THREE.SkinnedMesh(geometry, source.material);
    mesh.name = 'First-person hand ' + side;
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.bindMode = source.bindMode;
    mesh.bind(source.skeleton, source.bindMatrix);
    mesh.frustumCulled = false;
    mesh.visible = false;
    source.parent.add(mesh);
    meshes.push(mesh);
  }
  const fingers = digits.flatMap(([name, joints], finger) => joints.slice(0, -1).flatMap((joint, i) => {
    const bone = named(name + (i + 1), side);
    const next = named(name + (i + 2), side) ?? bone?.children.find(child => child.isBone);
    return bone && next ? [{ bone, next, joint, end: joints[i + 1], finger, i,
      restRotation: bone.quaternion.clone() }] : [];
  }));
  const joints = [...new Set([wrist, ...fingers.flatMap(segment => [segment.bone, segment.next])])];
  const saved = joints.map(bone => ({ bone, position: new THREE.Vector3(), rotation: new THREE.Quaternion() }));
  let posed = false;
  let trackedBasis;

  function reset() {
    if (!posed) return;
    for (const { bone, position, rotation } of saved) {
      bone.position.copy(position);
      bone.quaternion.copy(rotation);
    }
    posed = false;
  }

  function rotateTo(bone, worldRotation) {
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    bone.quaternion.copy(parent.invert().multiply(worldRotation));
    bone.updateWorldMatrix(true, true);
  }
  function update(pose, visible) {
    for (const mesh of meshes) mesh.visible = Boolean(pose && visible);
    if (!pose) { reset(); trackedBasis = null; return; }
    for (const { bone, position, rotation } of saved) {
      position.copy(bone.position);
      rotation.copy(bone.quaternion);
    }
    posed = true;
    const native = pose.tracked;
    const targets = native?.worldMatrices;
    const joint = i => new THREE.Vector3().setFromMatrixPosition(targets[i]);
    if (native) {
      const candidate = pose.handBasis ?? trackedHandBasis(THREE, native);
      if (candidate) {
        if (!trackedBasis) trackedBasis = candidate.clone();
        else trackedBasis.slerp(candidate, .72);
      }
    } else trackedBasis = null;
    if (native && !trackedBasis) {
      for (const mesh of meshes) mesh.visible = false;
      return;
    }
    const basis = native ? trackedBasis : pose.orientation;
    wrist.position.copy(wrist.parent.worldToLocal(pose.position.clone()));
    rotateTo(wrist, basis.clone().multiply(offset));
    const flexionAxis = new THREE.Vector3(palmSign(side), 0, 0).applyQuaternion(basis);
    const surface = gripSurface(THREE, pose.heldBody);
    for (const segment of fingers) {
      const { bone, next, restRotation, finger, i } = segment;
      bone.quaternion.copy(restRotation);
      bone.updateWorldMatrix(true, true);
      const along = getPosition(next).sub(getPosition(bone)).normalize();
      if (along.lengthSq() < .5) continue;
      const metacarpal = finger !== 0 && i === 0;
      const rotation = bone.getWorldQuaternion(new THREE.Quaternion());
      if (native && (!pose.gesture || surface)) {
        const desired = joint(segment.end).sub(joint(segment.joint)).normalize();
        if (desired.lengthSq() > .5)
          rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(along, desired));
      } else if (!metacarpal) {
        const trigger = pose.trigger ?? 0, grip = pose.squeeze ?? 0;
        const curl = pose.gesture === 'middle_finger' && !surface ? (finger === 2 ? 0 : .94) :
          finger === 1 ? .13 + Math.max(trigger, surface ? grip * .74 : 0) * .68 : .35 + grip * .47;
        const angle = finger === 0 ? curl * .36 : curl;
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(flexionAxis, angle));
      }
      rotateTo(bone, rotation);
      if (surface && !metacarpal) {
        const origin = getPosition(bone), end = getPosition(next);
        const flexion = flexionAngle(along, end.clone().sub(origin), flexionAxis);
        // Open to fit a larger prop while keeping the adjusted joint in its flexion range.
        const extension = -.14 - Math.max(0, flexion);
        conformJoint(THREE, origin, end, flexionAxis, rotation, surface,
          Math.min(.009, native?.jointRadii?.[segment.end] || .007), extension);
        rotateTo(bone, rotation);
      }
    }
  }

  return { update, reset };
}
