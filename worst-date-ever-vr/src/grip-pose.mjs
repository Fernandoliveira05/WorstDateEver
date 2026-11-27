import { Box, Sphere } from 'cannon-es';

// Hand basis: +X toward the thumb, +Z toward the wrist. +Y is palmar on
// the right hand and dorsal on the left.
export function palmSign(side) {
  return side === 'left' || side === 'L' ? -1 : 1;
}

export function flexionAngle(neutral, direction, axis) {
  const start = neutral.clone().projectOnPlane(axis).normalize();
  const end = direction.clone().projectOnPlane(axis).normalize();
  return Math.atan2(axis.dot(start.clone().cross(end)), start.dot(end));
}

// The phone's screen is on local -Z. Its lower edge sits in the palm.
export function phoneGrip(THREE, wrist, basis, side, eye, eyeUp = new THREE.Vector3(0, 1, 0), visibleCenter) {
  const sign = palmSign(side);
  const local = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-sign, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -sign, 0)));
  const orientation = basis.clone().multiply(local);

  const offset = new THREE.Vector3(.090 * sign, .074, -.032);
  const position = offset.clone().applyQuaternion(orientation).add(wrist);
  if (eye && eye.distanceToSquared(wrist) >= .04) {
    // Account for the wrist-to-case offset when aiming at the eyes. Using
    // the wrist as the target origin leaves a visible pitch and yaw error.
    const back = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
    const frame = new THREE.Matrix4();
    function face(center) {
      back.copy(center).sub(eye).normalize();
      right.crossVectors(eyeUp, back);
      if (right.lengthSq() < 1e-6) return false;
      right.normalize();
      up.crossVectors(back, right);
      orientation.setFromRotationMatrix(frame.makeBasis(right, up, back));
      return true;
    }
    for (let i = 0; i < 10 && face(position); i++) {
      position.copy(offset).applyQuaternion(orientation).add(wrist);
    }
    // A desk or another solid prop can stop the case before it reaches the wrist target.
    // Aim from its visible center while preserving the collision-constrained placement.
    if (visibleCenter && visibleCenter.distanceToSquared(eye) >= .04) face(visibleCenter);
  }
  // The palm crosses the lower back diagonally. Both hands use the same
  // silhouette mirrored around the long axis of the phone.
  const palmRoll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sign * .96);
  return { position, orientation, basis: orientation.clone().multiply(palmRoll).multiply(local.invert()) };
}

const phoneFingerTargets = [
  [[.080, .004, .031], [.068, .026, .013], [.060, .044, -.009]],
  [[-.046, .040, .034], [-.071, .039, .019], [-.060, .036, -.019]],
  [[-.049, .015, .033], [-.071, .017, .020], [-.060, .015, -.019]],
  [[-.050, -.011, .033], [-.071, -.011, .020], [-.060, -.010, -.019]],
  [[-.050, -.036, .033], [-.070, -.033, .020], [-.059, -.032, -.017]]
];

export function phoneFingerTarget(THREE, body, side, finger, segment) {
  const sign = -palmSign(side);
  const [x, y, z] = phoneFingerTargets[finger][finger === 0 ? segment : segment - 1];
  return new THREE.Vector3(sign * x, y, z).applyQuaternion(new THREE.Quaternion().copy(body.quaternion))
    .add(new THREE.Vector3().copy(body.position));
}

// Contact uses the rendered case rather than the narrower rigid-body proxy.
export function phoneFingerDirection(THREE, body, origin, target, length) {
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const inverse = rotation.clone().invert();
  const start = origin.clone().sub(body.position).applyQuaternion(inverse);
  const finish = target.clone().sub(body.position).applyQuaternion(inverse);
  const aim = finish.clone().sub(start).normalize();
  const vertical = new THREE.Vector3(0, 1, 0);
  const trial = new THREE.Vector3(), sample = new THREE.Vector3();
  let best = aim, error = Infinity;
  for (const yaw of [0, -.2, .2, -.4, .4, -.65, .65, -.9, .9]) {
    trial.copy(aim).applyAxisAngle(vertical, yaw);
    let penetration = 0;
    for (const distance of [.22, .45, .68, .90, 1]) {
      sample.copy(start).addScaledVector(trial, length * distance);
      const gap = Math.max(Math.abs(sample.x) - .056, Math.abs(sample.y) - .103, Math.abs(sample.z - .001) - .015);
      penetration += Math.max(0, .009 - gap);
    }
    const score = penetration * 3 + sample.distanceTo(finish) * .25 + Math.abs(yaw) * .003;
    if (score < error) { best = trial.clone(); error = score; }
    if (yaw === 0 && penetration === 0) break;
  }
  return best.applyQuaternion(rotation);
}

const railStarts = [0, -.25, .25, -.50, .50, -.75, .75];
const railBends = [0, -.24, -.47, -.71, -.94, -1.18];

// Fit the three phalanges together. A segment aimed at the rail in isolation
// can consume the length the tip needs to bend around the corner.
export function phoneRailPose(THREE, body, side, knuckle, lengths) {
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const local = knuckle.clone().sub(body.position).applyQuaternion(rotation.clone().invert());
  const sign = palmSign(side);
  const x = local.x * sign, z = local.z;
  const tipX = .062, tipZ = -.015;
  let best;
  let bestScore = Infinity;

  function penetration(x, z, dx, dz) {
    let total = 0;
    for (const t of [.25, .5, .75, 1]) {
      const px = x + t * dx, pz = z + t * dz;
      total += Math.max(0, .006 - Math.max(Math.abs(px) - .055, Math.abs(pz - .001) - .015));
    }
    return total;
  }

  for (const a of railStarts) {
    const dx = Math.cos(a) * lengths[0], dz = Math.sin(a) * lengths[0];
    const firstCost = penetration(x, z, dx, dz);
    for (const bend of railBends) {
      const b = a + bend;
      const bx = Math.cos(b) * lengths[1], bz = Math.sin(b) * lengths[1];
      const px = x + dx + bx, pz = z + dz + bz;
      const middleCost = penetration(x + dx, z + dz, bx, bz);
      const aimed = THREE.MathUtils.clamp(Math.atan2(tipZ - pz, tipX - px), b - 1.48, b + .10);
      for (const c of [aimed, b - .58, b - 1.10, b - 1.45]) {
        const cx = Math.cos(c) * lengths[2], cz = Math.sin(c) * lengths[2];
        const distance = Math.hypot(tipX - px - cx, tipZ - pz - cz);
        const collision = firstCost + middleCost + penetration(px, pz, cx, cz);
        const score = distance + collision * 5 + Math.abs(a) * .0015;
        if (score < bestScore) {
          best = [a, b, c];
          bestScore = score;
        }
      }
    }
  }

  return best.map(angle => new THREE.Vector3(Math.cos(angle) * sign, 0, Math.sin(angle)).applyQuaternion(rotation));
}

// Stable local grips on each collider face (including handles or limbs with
// their own collider). Choose the nearest preset once, when the grab starts.
export function closestGripAnchor(THREE, body, contact) {
  const { anchor } = localGripFace(THREE, body, contact);
  return anchor.applyQuaternion(new THREE.Quaternion().copy(body.quaternion)).add(body.position);
}

function localGripFace(THREE, body, contact) {
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const position = new THREE.Vector3().copy(body.position);
  const local = contact.clone().sub(position).applyQuaternion(rotation.clone().invert());
  const surface = gripSurface(THREE, body);
  let best = { anchor: local, normal: new THREE.Vector3(0, 1, 0), index: 0 };
  let distance = Infinity;

  function consider(point, normal, orientation, center, index) {
    point.applyQuaternion(orientation).add(center);
    normal.applyQuaternion(orientation);
    const outside = point.clone().addScaledVector(normal, .006).applyQuaternion(rotation).add(position);
    // Prefer exposed faces of a compound collider over seams inside the prop.
    const buried = Math.max(0, -surface(outside));
    const gap = point.distanceToSquared(local) + buried ** 2 * 16;
    if (gap >= distance) return;
    best = { anchor: point, normal, index };
    distance = gap;
  }

  for (const [index, shape] of body.shapes.entries()) {
    const center = body.shapeOffsets[index];
    const orientation = new THREE.Quaternion().copy(body.shapeOrientations[index]);
    const sample = local.clone().sub(center).applyQuaternion(orientation.clone().invert());
    if (shape instanceof Sphere) {
      const direction = sample.clone().divideScalar(sample.length() || 1).multiplyScalar(1.5).round();
      if (!direction.lengthSq()) direction.y = 1;
      direction.normalize();
      consider(direction.clone().multiplyScalar(shape.radius), direction, orientation, center, index);
    } else if (shape instanceof Box) {
      const half = shape.halfExtents.toArray();
      const anchor = new THREE.Vector3(...half.map((extent, axis) =>
        extent * Math.round(THREE.MathUtils.clamp(sample.getComponent(axis) / extent, -1, 1) * 2) / 2));
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [-1, 1])
          consider(anchor.clone().setComponent(axis, sign * half[axis]),
            new THREE.Vector3().setComponent(axis, sign), orientation, center, index);
      }
    }
  }
  return best;
}

export function gripSurface(THREE, body) {
  if (!body) return null;
  const position = new THREE.Vector3().copy(body.position);
  const orientation = new THREE.Quaternion().copy(body.quaternion);
  const shapes = body.shapes.flatMap((shape, i) => {
    const center = new THREE.Vector3().copy(body.shapeOffsets[i]).applyQuaternion(orientation).add(position);
    if (shape instanceof Sphere) return [{ center, radius: shape.radius }];
    if (!(shape instanceof Box)) return [];
    return [{ center, half: shape.halfExtents,
      inverse: orientation.clone().multiply(new THREE.Quaternion().copy(body.shapeOrientations[i])).invert() }];
  });
  const local = new THREE.Vector3();
  return point => {
    let distance = Infinity;
    for (const { center, half, inverse, radius } of shapes) {
      local.copy(point).sub(center);
      if (half) {
        local.applyQuaternion(inverse);
        const x = Math.abs(local.x) - half.x, y = Math.abs(local.y) - half.y, z = Math.abs(local.z) - half.z;
        distance = Math.min(distance, Math.hypot(Math.max(0,x), Math.max(0,y), Math.max(0,z)) +
          Math.min(0, Math.max(x,y,z)));
      } else distance = Math.min(distance, local.length() - radius);
    }
    return distance;
  };
}

// Search close to the tracked or controller-driven joint, changing rotations only.
export function conformJoint(THREE, origin, next, axis, rotation, surface, radius, minAngle = -Infinity, avoidOnly = false) {
  const direction = next.clone().sub(origin);
  if (direction.lengthSq() < 1e-6 || surface(origin) > direction.length() + .036) return rotation;
  const angleRotation = new THREE.Quaternion();
  const end = new THREE.Vector3(), sample = new THREE.Vector3();
  let bestScore = Infinity, bestAngle = 0;
  for (const angle of [0, .18, -.18, .36, -.36, .55, -.55, .78, -.78, 1, -1]) {
    if (angle < minAngle) continue;
    angleRotation.setFromAxisAngle(axis, angle);
    end.copy(direction).applyQuaternion(angleRotation).add(origin);
    const tip = surface(end) - radius;
    let penetration = Math.min(0, tip);
    for (const fraction of [.25, .5, .75])
      penetration = Math.min(penetration, surface(sample.copy(origin).lerp(end, fraction)) - radius);
    if (avoidOnly && angle === 0 && penetration >= 0) return rotation;
    const score = (avoidOnly ? 0 : Math.abs(tip)) - penetration * 4 + Math.abs(angle) * .003;
    if (score < bestScore) { bestScore = score; bestAngle = angle; }
  }
  return rotation.premultiply(angleRotation.setFromAxisAngle(axis, bestAngle));
}

export const gripCurls = {
  phone: [.29, .64, .84, .86, .88],
  rim: [.40, .015, .025, .04, .055],
  support: [.22, .035, .055, .075, .09],
  handle: [.42, .98, 1.12, 1.12, .92],
  wrap: [.35, .51, .68, .78, .84],
  pinch: [.48, .54, .86, .91, .91],
  precision: [.37, .32, .48, .53, .58],
  fabric: [.20, .30, .42, .46, .44],
  hook: [.32, .62, .70, .71, .64],
  power: [.51, .85, 1.02, 1.03, 1.06]
};

export function objectGrip(THREE, body, kind, contact, basis, side) {
  const position = new THREE.Vector3().copy(body.position);
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const inverse = rotation.clone().invert();
  let { anchor, normal, index } = localGripFace(THREE, body, contact);
  let profile = kind;
  let wrist = basis.clone().premultiply(inverse);
  if (kind === 'plate') {
    const at = contact.clone().sub(position).applyQuaternion(inverse);
    const angle = Math.round(Math.atan2(at.z, at.x) / (Math.PI / 4)) * Math.PI / 4;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    profile = at.y < -.014 && Math.hypot(at.x, at.z) < .075 ? 'support' : 'rim';
    anchor = outward.clone().multiplyScalar(profile === 'rim' ? .097 : .047);
    anchor.y = profile === 'rim' ? 0 : -.014;
    const backward = outward.clone().add(new THREE.Vector3(0, profile === 'rim' ? .10 : 0, 0)).normalize();
    const thumb = new THREE.Vector3(0, palmSign(side), 0).cross(backward).normalize();
    const normal = backward.clone().cross(thumb);
    wrist = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb, normal, backward));
  } else if (kind === 'mug') {
    profile = index > 0 ? 'handle' : 'wrap';
  }
  if (kind !== 'plate' && kind !== 'drawer') {
    const backward = new THREE.Vector3(0, 0, 1).applyQuaternion(wrist).projectOnPlane(normal);
    if (backward.lengthSq() < .12)
      backward.crossVectors(new THREE.Vector3(palmSign(side), 0, 0).applyQuaternion(wrist), normal);
    if (backward.lengthSq() < .01)
      backward.set(0, 1, 0).projectOnPlane(normal);
    if (backward.lengthSq() < .01) backward.set(1, 0, 0).projectOnPlane(normal);
    backward.normalize().addScaledVector(normal, .23).normalize();
    const palm = normal.clone().multiplyScalar(-palmSign(side)).projectOnPlane(backward).normalize();
    const thumb = palm.clone().cross(backward);
    wrist.setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb, palm, backward));
  }
  if (kind === 'drawer') profile = 'pinch';
  const back = profile === 'rim' ? .129 : profile === 'handle' ? .092 : profile === 'pinch' ? .090 : .108;
  const clearance = profile === 'rim' ? .049 : profile === 'support' ? .038 : .022;
  const offset = new THREE.Vector3(0, -clearance * palmSign(side), back).applyQuaternion(wrist);
  return { anchor, position: anchor.clone().add(offset), orientation: wrist, profile };
}

export function heldGripPose(THREE, body, grip, pose, maxReach = .19) {
  if (!grip || !pose.position) return { ...pose, heldBody: body };
  if (pose.tracked || pose.anchored) return { ...pose, heldBody: body };
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const wrist = grip.position.clone().applyQuaternion(rotation).add(body.position);
  if (wrist.distanceToSquared(pose.position) > maxReach ** 2) return pose;
  return { ...pose, heldBody: body, preset: grip.profile,
    position: wrist, orientation: rotation.multiply(grip.orientation) };
}

export function twoHandPose(THREE, first, second, orientation) {
  const span = second.anchor.clone().sub(first.anchor).applyQuaternion(orientation);
  const desired = second.point.clone().sub(first.point);
  const rotation = orientation.clone();
  if (desired.lengthSq() > .0025 && span.lengthSq() > .0025)
    rotation.premultiply(new THREE.Quaternion().setFromUnitVectors(span.normalize(), desired.normalize()));
  const midpoint = first.anchor.clone().lerp(second.anchor, .5).applyQuaternion(rotation);
  return { position: first.point.clone().lerp(second.point, .5).sub(midpoint), orientation: rotation };
}

const fingerProfiles = {
  power: 'wrap', pinch: 'pinch', precision: 'precision', handle_hook: 'hook',
  palm_support: 'support', soft_pinch: 'fabric', flat_edge: 'rim'
};

export function authoredGrip(THREE, body, zones, contact, from, basis, side, secondary = false) {
  const inverse = new THREE.Quaternion().copy(body.quaternion).invert();
  const local = contact.clone().sub(body.position).applyQuaternion(inverse);
  const approach = from.clone().sub(contact).applyQuaternion(inverse);
  if (approach.lengthSq() < 1e-6)
    approach.set(0, 0, 1).applyQuaternion(basis).applyQuaternion(inverse);
  approach.normalize();
  let best, score = Infinity;
  for (const entry of zones) {
    if (!entry[side + '_hand_allowed'] || (secondary && !['either', 'secondary'].includes(entry.two_hand_role))) continue;
    const normal = new THREE.Vector3(...entry.local_normal).normalize();
    const alignment = normal.dot(approach);
    if (alignment < Math.cos(THREE.MathUtils.degToRad(entry.approach_half_angle_deg))) continue;
    const anchor = new THREE.Vector3(...entry.local_position_m);
    const tangent = new THREE.Vector3(...entry.local_tangent).projectOnPlane(normal).normalize();
    const backward = tangent.clone();
    if (backward.lengthSq() < .5) continue;
    if (entry.finger_pose === 'soft_pinch') {
      // The blanket's front edge is cut away at the left corner.
      const low = entry.zone_id === 'Front' ? -.20 : -.56;
      anchor.addScaledVector(backward, THREE.MathUtils.clamp(local.clone().sub(anchor).dot(backward), low, .56));
    }
    const priority = Number(entry.priority) || 0;
    const rank = anchor.distanceToSquared(local) + (1 - alignment) * .008 - priority;
    if (rank >= score) continue;
    const wristBack = new THREE.Vector3(0, 0, 1).applyQuaternion(basis).applyQuaternion(inverse);
    const soft = entry.finger_pose === 'soft_pinch';
    const precision = entry.finger_pose === 'precision';
    if (entry.finger_pose === 'handle_hook') backward.crossVectors(normal, tangent).normalize();
    if (soft || precision) backward.copy(normal);
    else if (!entry.fixed_wrist_tangent && wristBack.dot(backward) < 0) backward.negate();
    const outward = soft || precision ? new THREE.Vector3(0, approach.y < -.20 ? -1 : 1, 0) : normal;
    const palm = outward.clone().multiplyScalar(-palmSign(side));
    const thumb = palm.clone().cross(backward);
    const orientation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb, palm, backward));
    const clearance = entry.clearance_m ?? (soft ? .042 : precision ? .043 : entry.finger_pose === 'handle_hook' ? .060 : .052);
    const reach = entry.reach_m ?? (soft ? .112 : precision ? .159 : entry.finger_pose === 'handle_hook' ? .120 : .112);
    best = { anchor, orientation, profile: fingerProfiles[entry.finger_pose] ?? 'wrap', zone: entry.zone_id,
      position: anchor.clone().addScaledVector(backward, reach)
        .addScaledVector(outward, clearance)
        .addScaledVector(thumb, entry.lateral_m ?? 0) };
    score = rank;
  }
  return best;
}
