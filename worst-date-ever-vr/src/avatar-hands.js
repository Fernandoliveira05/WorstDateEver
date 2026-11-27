import { conformJoint, flexionAngle, gripSurface, palmSign, gripCurls, phoneFingerTarget, phoneFingerDirection, phoneRailPose } from './grip-pose.mjs';

const pointingCurls = [.31, 0, .77, .83, .89];

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
    // A vertex bound to the forearm stretches across the wrist when isolated.
    if (strong[a] && strong[b] && strong[c]) triangles.push(a, b, c);
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
    for (const vertex of new Set(triangles)) {
      let total = 0;
      for (let slot = 0; slot < 4; slot++) {
        if (!handBones[indices.getComponent(vertex, slot)]) weights.setComponent(vertex, slot, 0);
        total += weights.getComponent(vertex, slot);
      }
      for (let slot = 0; slot < 4; slot++)
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
    // glTF end markers are ordinary Object3Ds when they carry no skin weights.
    const next = named(name + (i + 2), side) ??
      bone?.children.find(child => child.isBone || /_end$/i.test(child.name));
    return bone && next ? [{ bone, next, joint, end: joints[i + 1], finger, i,
      restRotation: bone.quaternion.clone() }] : [];
  }));
  const railSegments = digits.slice(1).map((_, index) =>
    fingers.filter(segment => segment.finger === index + 1 && segment.i > 0));
  const tip = fingers.findLast(segment => segment.finger === 1)?.next;
  const pointAxis = tip ? getPosition(tip).sub(getPosition(index)).normalize().applyQuaternion(rest.clone().invert())
    : new THREE.Vector3(0, 0, -1);
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
    if (native && !trackedBasis && !pose.preset) {
      for (const mesh of meshes) mesh.visible = false;
      return;
    }
    const basis = (native && !pose.preset ? trackedBasis : pose.orientation).clone();
    const aiming = !pose.anchored && (pose.rayHold || pose.phonePoint) && pose.pointDirection?.lengthSq() > .5 &&
      !pose.preset && !pose.heldBody && !pose.gesture;
    const rayTilt = new THREE.Quaternion();
    if (aiming) {
      const forward = pointAxis.clone().applyQuaternion(basis);
      rayTilt.setFromUnitVectors(forward, pose.pointDirection);
      basis.premultiply(rayTilt);
    }
    wrist.position.copy(wrist.parent.worldToLocal(pose.position.clone()));
    rotateTo(wrist, basis.clone().multiply(offset));
    const flexionAxis = new THREE.Vector3(palmSign(side), 0, 0).applyQuaternion(basis);
    // A cloth sheet folds up to the grip instead of acting like the flat collider;
    // conforming finger segments to the collider drags them down through the fold.
    const surface = pose.heldBody?.userData?.cloth ? null : gripSurface(THREE, pose.heldBody);
    let railDirections;
    for (const segment of fingers) {
      const { bone, next, restRotation, finger, i } = segment;
      bone.quaternion.copy(restRotation);
      bone.updateWorldMatrix(true, true);
      const origin = getPosition(bone);
      const segmentVector = getPosition(next).sub(origin);
      const length = segmentVector.length();
      const along = segmentVector.normalize();
      if (along.lengthSq() < .5) continue;
      const metacarpal = finger !== 0 && i === 0;
      const rotation = bone.getWorldQuaternion(new THREE.Quaternion());
      if (pose.preset === 'phone' && pose.heldBody) {
        if (!metacarpal) {
          if (finger !== 0 && i === 1) {
            const chain = railSegments[finger - 1];
            railDirections = chain.length === 3 ? phoneRailPose(THREE, pose.heldBody, side, origin,
              chain.map(({ bone, next }) => getPosition(next).distanceTo(getPosition(bone)))) : null;
          }
          const target = phoneFingerTarget(THREE, pose.heldBody, side, finger, i);
          const desired = finger !== 0 && railDirections?.[i - 1] ||
            phoneFingerDirection(THREE, pose.heldBody, origin, target, length);
          rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(along, desired));
        }
      } else if (native && !pose.preset && !pose.phonePoint && (!pose.gesture || surface)) {
        const desired = joint(segment.end).sub(joint(segment.joint)).normalize().applyQuaternion(rayTilt);
        if (desired.lengthSq() > .5)
          rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(along, desired));
      } else if (!metacarpal) {
        const trigger = pose.trigger ?? 0;
        const grip = Math.max(pose.squeeze ?? 0, pose.anchored ? .52 : 0);
        const curl = pose.gesture === 'middle_finger' && !surface ? (finger === 2 ? 0 : .94) :
          (pose.phonePoint || aiming && grip < .16) ? pointingCurls[finger] :
          finger === 1 ? Math.max(trigger, grip * .96) * .94 : grip * 1.04;
        const angle = gripCurls[pose.preset]?.[finger] ?? (finger === 0 ? curl * .36 : curl);
        rotation.premultiply(new THREE.Quaternion().setFromAxisAngle(flexionAxis, angle));
      }
      rotateTo(bone, rotation);
      if (surface && !metacarpal && pose.preset !== 'phone') {
        const origin = getPosition(bone), end = getPosition(next);
        const flexion = flexionAngle(along, end.clone().sub(origin), flexionAxis);
        // Open to fit a larger prop while keeping the adjusted joint in its flexion range.
        const shapedGrip = ['fabric', 'precision', 'hook'].includes(pose.preset);
        const extension = -.14 - Math.max(0, flexion);
        conformJoint(THREE, origin, end, flexionAxis, rotation, surface,
          Math.min(.009, native?.jointRadii?.[segment.end] || .007), extension,
          shapedGrip || pose.preset === 'rim' || pose.preset === 'support');
        rotateTo(bone, rotation);
      }
    }
    if (tip && pose.phoneTip) {
      const fingerPoint = getPosition(tip);
      const correction = pose.phoneTip.clone().sub(fingerPoint);
      if (correction.lengthSq() < .105 ** 2) {
        const target = getPosition(wrist).add(correction);
        wrist.position.copy(wrist.parent.worldToLocal(target));
        wrist.updateWorldMatrix(true, true);
      }
    }
    return tip?.getWorldPosition(new THREE.Vector3());
  }

  return { update, reset };
}
