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
export function phoneGrip(THREE, wrist, basis, side) {
  const sign = palmSign(side);
  const local = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(
    new THREE.Vector3(-sign, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, -sign, 0)));
  return {
    position: new THREE.Vector3(.025, .019 * sign, -.111).applyQuaternion(basis).add(wrist),
    orientation: basis.clone().multiply(local)
  };
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
