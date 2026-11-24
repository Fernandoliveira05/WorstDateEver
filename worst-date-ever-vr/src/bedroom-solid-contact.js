import { Quaternion, Ray, Vector3, Box3 } from 'three';
import * as CANNON from '../vendor/cannon-es/dist/cannon-es.js';

const basis = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)];
const colliderMargin = .0012;
const point = a => new Vector3(a.x, a.y, a.z);
const rotate = a => new Quaternion(a.x, a.y, a.z, a.w);

function bounds(body, shape, index) {
  return {
    center: point(body.pointToWorldFrame(body.shapeOffsets[index])),
    rotation: rotate(body.quaternion.mult(body.shapeOrientations[index])),
    half: shape instanceof CANNON.Box ? point(shape.halfExtents) : new Vector3().setScalar(shape.radius),
    radius: shape.boundingSphereRadius
  };
}

function padded(obstacle, moving, angle) {
  if (moving.sphere) return obstacle.half.clone().addScalar(moving.radius);
  const space = obstacle.rotation.clone().invert().multiply(angle);
  const half = obstacle.half.clone();
  for (let i = 0; i < 3; i++) {
    const axis = basis[i].clone().applyQuaternion(space);
    const size = moving.half.getComponent(i);
    half.x += Math.abs(axis.x) * size;
    half.y += Math.abs(axis.y) * size;
    half.z += Math.abs(axis.z) * size;
  }
  return half;
}

function depth(local, extents) {
  return Math.min(extents.x - Math.abs(local.x), extents.y - Math.abs(local.y), extents.z - Math.abs(local.z));
}

export function createSolidContact(world) {
  function blockers(from, distance, radius, excluded) {
    return world.bodies.flatMap(body => {
      if (excluded.has(body) || !body.collisionResponse || body.position.distanceTo(from) > body.boundingRadius + distance + radius) return [];
      return body.shapes.flatMap((shape, index) => shape.collisionResponse && (shape instanceof CANNON.Box || shape instanceof CANNON.Sphere)
        ? [bounds(body, shape, index)] : []);
    });
  }

  function sweep(from, to, orientation, shapes, obstacles) {
    const delta = new Vector3().subVectors(to, from);
    const distance = delta.length();
    if (distance < 1e-6) return to;
    const direction = delta.divideScalar(distance);
    let travel = distance;
    for (const moving of shapes) {
      const center = moving.offset.clone().applyQuaternion(orientation).add(from);
      const axis = orientation.clone().multiply(moving.rotation);
      for (const obstacle of obstacles) {
        if (center.distanceTo(obstacle.center) > moving.radius + obstacle.radius + travel) continue;
        const inverse = obstacle.rotation.clone().invert();
        const origin = center.clone().sub(obstacle.center).applyQuaternion(inverse);
        const path = direction.clone().applyQuaternion(inverse);
        const extents = padded(obstacle, moving, axis);
        const before = depth(origin, extents);
        if (before >= 0) {
          if (depth(origin.clone().addScaledVector(path, Math.min(.002, travel)), extents) > before + .0001)
            travel = 0;
          continue;
        }
        const hit = new Ray(origin, path).intersectBox(new Box3(extents.clone().negate(), extents), new Vector3());
        if (hit) travel = Math.min(travel, Math.max(0, hit.distanceTo(origin) - colliderMargin));
      }
    }
    return from.clone().addScaledVector(direction, travel);
  }

  function motion(body, target, desired, excluded) {
    const from = point(body.position);
    const current = rotate(body.quaternion);
    const parts = body.shapes.map((shape, i) => ({
      half: shape instanceof CANNON.Box ? point(shape.halfExtents) : new Vector3(),
      sphere: shape instanceof CANNON.Sphere,
      radius: shape.boundingSphereRadius,
      offset: point(body.shapeOffsets[i]), rotation: rotate(body.shapeOrientations[i])
    }));
    const obstacles = blockers(from, from.distanceTo(target), body.boundingRadius, excluded);
    const next = sweep(from, target, current, parts, obstacles);
    let rotation = current;
    const steps = Math.ceil(current.angleTo(desired) / .13);
    for (let i = 1; i <= steps; i++) {
      const candidate = current.clone().slerp(desired, i / steps);
      const blocked = parts.some(moving => {
        const center = moving.offset.clone().applyQuaternion(candidate).add(next);
        const old = moving.offset.clone().applyQuaternion(current).add(next);
        return obstacles.some(obstacle => {
          if (center.distanceTo(obstacle.center) > obstructionRadius(moving, obstacle)) return false;
          const inverse = obstacle.rotation.clone().invert();
          const newDepth = depth(center.clone().sub(obstacle.center).applyQuaternion(inverse),
            padded(obstacle, moving, candidate.clone().multiply(moving.rotation)));
          if (newDepth <= .0006) return false;
          const oldDepth = depth(old.clone().sub(obstacle.center).applyQuaternion(inverse),
            padded(obstacle, moving, current.clone().multiply(moving.rotation)));
          return newDepth > Math.max(0, oldDepth) + .0006;
        });
      });
      if (blocked) break;
      rotation = candidate;
    }
    return { next: sweep(from, next, rotation, parts, obstacles), rotation };
  }

  function obstructionRadius(moving, obstacle) { return moving.radius + obstacle.radius; }

  function particle(from, to, excluded) {
    const radius = .009;
    return sweep(from, to, new Quaternion(), [{ sphere: true, radius, offset: new Vector3(), rotation: new Quaternion() }],
      blockers(from, from.distanceTo(to), radius, excluded));
  }

  return { motion, particle };
}
