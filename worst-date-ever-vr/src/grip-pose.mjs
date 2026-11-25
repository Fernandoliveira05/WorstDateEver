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
export function phoneGrip(THREE, wrist, basis, side, eye) {
  const sign = palmSign(side);
  const local = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-sign, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -sign, 0)));
  const orientation = basis.clone().multiply(local);
  const position = new THREE.Vector3(-.016, .027 * sign, -.089).applyQuaternion(basis).add(wrist);
  if (!eye || eye.distanceToSquared(wrist) < .04) return { position, orientation, basis };

  // Center the case just above the wrist with the reading face tilted toward the player.
  // Derive the holding hand from the same frame so the fingers stay on the case.
  const back = wrist.clone().sub(eye).normalize();
  back.y = THREE.MathUtils.clamp(back.y, -.63, .63);
  back.normalize();
  const right = new THREE.Vector3(0, 1, 0).cross(back).normalize();
  const up = back.clone().cross(right);
  orientation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, back));
  position.copy(wrist).addScaledVector(up, .088).addScaledVector(right, .034 * sign)
    .addScaledVector(back, -.022);
  return { position, orientation, basis: orientation.clone().multiply(local.invert()) };
}

export function phoneFingerTarget(THREE, body, side, finger, segment) {
  const thumb = side === 'left' || side === 'L' ? 1 : -1;
  const first = finger === 0;
  const y = first ? [-.047, -.023, .007, .033][segment] :
    [.047, .018, -.011, -.041][finger - 1] - (segment === 0 ? .029 : 0);
  const x = first ? [.045, .057, .059, .055][segment] :
    [-.004, -.032, -.055, -.054][segment];
  const z = first ? [.031, .023, -.002, -.016][segment] : [.031, .026, .012, -.012][segment];
  return new THREE.Vector3(thumb * x, y, z).applyQuaternion(new THREE.Quaternion().copy(body.quaternion))
    .add(new THREE.Vector3().copy(body.position));
}

// Stable local grips on each collider face (including handles or limbs with
// their own collider). Choose the nearest preset once, when the grab starts.
export function closestGripAnchor(THREE, body, contact) {
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const position = new THREE.Vector3().copy(body.position);
  const local = contact.clone().sub(position).applyQuaternion(rotation.clone().invert());
  let best, distance = Infinity;

  function consider(point, orientation, center) {
    point.applyQuaternion(orientation).add(center);
    const gap = point.distanceToSquared(local);
    if (gap >= distance) return;
    best = point;
    distance = gap;
  }

  for (const [index, shape] of body.shapes.entries()) {
    const center = body.shapeOffsets[index];
    const orientation = new THREE.Quaternion().copy(body.shapeOrientations[index]);
    const sample = local.clone().sub(center).applyQuaternion(orientation.clone().invert());
    if (shape instanceof Sphere) {
      const direction = sample.clone().divideScalar(sample.length() || 1).multiplyScalar(1.5).round();
      if (!direction.lengthSq()) direction.y = 1;
      consider(direction.normalize().multiplyScalar(shape.radius), orientation, center);
    } else if (shape instanceof Box) {
      const half = shape.halfExtents.toArray();
      const anchor = new THREE.Vector3(...half.map((extent, axis) =>
        extent * Math.round(THREE.MathUtils.clamp(sample.getComponent(axis) / extent, -1, 1) * 2) / 2));
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [-1, 1])
          consider(anchor.clone().setComponent(axis, sign * half[axis]), orientation, center);
      }
    }
  }
  return best?.applyQuaternion(rotation).add(position) ?? contact.clone();
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
export function conformJoint(THREE, origin, next, axis, rotation, surface, radius, minAngle = -Infinity) {
  const direction = next.clone().sub(origin);
  if (direction.lengthSq() < 1e-6 || surface(origin) > direction.length() + .036) return rotation;
  const angleRotation = new THREE.Quaternion();
  const end = new THREE.Vector3(), middle = new THREE.Vector3();
  let bestScore = Infinity, bestAngle = 0;
  for (const angle of [0, .18, -.18, .36, -.36, .55, -.55, .78, -.78, 1, -1]) {
    if (angle < minAngle) continue;
    angleRotation.setFromAxisAngle(axis, angle);
    end.copy(direction).applyQuaternion(angleRotation).add(origin);
    middle.copy(origin).lerp(end, .55);
    const tip = surface(end) - radius;
    const penetration = Math.min(0, tip, surface(middle) - radius);
    const score = Math.abs(tip) + Math.abs(penetration) * 3 + Math.abs(angle) * .003;
    if (score < bestScore) { bestScore = score; bestAngle = angle; }
  }
  return rotation.premultiply(angleRotation.setFromAxisAngle(axis, bestAngle));
}

export const gripCurls = {
  phone: [.29, .64, .84, .86, .88],
  rim: [.25, .36, .62, .68, .72],
  support: [.22, .14, .19, .22, .28],
  handle: [.42, .98, 1.12, 1.12, .92],
  wrap: [.35, .51, .68, .78, .84],
  pinch: [.48, .54, .86, .91, .91],
  power: [.51, .85, 1.02, 1.03, 1.06]
};

export function objectGrip(THREE, body, kind, contact, basis, side) {
  const position = new THREE.Vector3().copy(body.position);
  const rotation = new THREE.Quaternion().copy(body.quaternion);
  const inverse = rotation.clone().invert();
  let anchor = closestGripAnchor(THREE, body, contact).sub(position).applyQuaternion(inverse);
  let profile = kind;
  let wrist = basis.clone().premultiply(inverse);
  if (kind === 'plate') {
    const at = contact.clone().sub(position).applyQuaternion(inverse);
    const angle = Math.round(Math.atan2(at.z, at.x) / (Math.PI / 4)) * Math.PI / 4;
    const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    profile = at.y < -.014 && Math.hypot(at.x, at.z) < .075 ? 'support' : 'rim';
    anchor = outward.clone().multiplyScalar(profile === 'rim' ? .097 : .047);
    anchor.y = profile === 'rim' ? 0 : -.014;
    const backward = outward.clone().add(new THREE.Vector3(0, -.25, 0)).normalize();
    const thumb = new THREE.Vector3(0, palmSign(side), 0).cross(backward).normalize();
    const normal = backward.clone().cross(thumb);
    wrist = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(thumb, normal, backward));
  } else if (kind === 'mug') {
    profile = body.shapeOffsets.length > 1 && Math.abs(anchor.x) > .054 ? 'handle' : 'wrap';
  }
  const back = profile === 'handle' ? .054 : profile === 'power' ? .078 : .064;
  const offset = new THREE.Vector3(0, -.012 * palmSign(side), back).applyQuaternion(wrist);
  return { anchor, position: anchor.clone().add(offset), orientation: wrist, profile };
}
