import { Vector3 } from 'three';

const radius = .165;
const strides = .045;

// Compare a vertical player capsule against solid furniture and door/tray boxes in plan view.
export function walkBedroom(start, goal, obstacles, height) {
  const floor = Math.min(start.y, goal.y) - height;
  const low = floor + .12;
  const high = floor + Math.max(.35, height - .13);
  const path = new Vector3().subVectors(goal, start);
  const steps = Math.max(1, Math.ceil(Math.hypot(path.x, path.z) / strides));
  const at = start.clone();
  const distance = (box, x, z) => {
    const dx = x - box.x, dz = z - box.z;
    const u = Math.abs(dx * box.ux + dz * box.uz) - box.hw;
    const v = Math.abs(-dx * box.uz + dz * box.ux) - box.hd;
    return u < 0 && v < 0 ? -(Math.max(u, v) ** 2) : Math.max(0, u) ** 2 + Math.max(0, v) ** 2;
  };
  function clear(x, z) {
    return obstacles.every(box => {
      if (box.maxY <= low || box.minY >= high) return true;
      const next = distance(box, x, z);
      const current = distance(box, at.x, at.z);
      return next >= radius * radius || next > current + 1e-8;
    });
  }
  const dx = path.x / steps, dz = path.z / steps;
  for (let i = 0; i < steps; i++) {
    if (clear(at.x + dx, at.z)) at.x += dx;
    if (clear(at.x, at.z + dz)) at.z += dz;
  }
  at.y = goal.y;
  return at;
}
