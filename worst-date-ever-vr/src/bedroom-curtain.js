import { Box3, BufferAttribute, Vector3 } from 'three';

const stepSeconds = 1 / 120;
const radius = .21;
const maxSpeed = .35;
const maxLift = .035;

export function createCurtain(mesh) {
  const geometry = mesh.geometry.clone();
  const source = geometry.getAttribute('position');
  const rest = new Float32Array(source.count * 3);
  for (let i = 0; i < source.count; i++) {
    rest[i * 3] = source.getX(i);
    rest[i * 3 + 1] = source.getY(i);
    rest[i * 3 + 2] = source.getZ(i);
  }
  const position = new BufferAttribute(rest.slice(), 3);
  geometry.setAttribute('position', position);
  const restBox = new Box3().setFromBufferAttribute(position);
  geometry.boundingBox = restBox.clone().expandByScalar(maxLift);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius += maxLift;
  mesh.geometry = geometry;

  const neighbors = Array.from({ length: source.count }, () => new Set());
  const index = geometry.getIndex();
  for (let i = 0; i < index.count; i += 3) {
    for (let j = 0; j < 3; j++) {
      const a = index.getX(i + j);
      const b = index.getX(i + (j + 1) % 3);
      neighbors[a].add(b);
      neighbors[b].add(a);
    }
  }
  const joints = neighbors.map(link => [...link]);
  const pinned = joints.map((_, i) => rest[i * 3 + 1] >= restBox.max.y - .014);
  const edges = joints.flatMap((list, a) => list.filter(b => a < b).map(b => {
    const span = Math.hypot(rest[a * 3] - rest[b * 3], rest[a * 3 + 1] - rest[b * 3 + 1]);
    return [a, b, Math.max(.0015, span * .40)];
  }));
  const bounds = restBox.clone().expandByVector(new Vector3(.035, .035, .065));
  const local = new Vector3();
  const velocity = new Float32Array(source.count);
  let offset = new Float32Array(source.count);
  let next = new Float32Array(source.count);
  let active = false;
  let time = 0;

  function touch(worldPoint, impulse) {
    if (Math.abs(impulse) < .001) return;
    mesh.worldToLocal(local.copy(worldPoint));
    if (!bounds.containsPoint(local)) return;
    for (let i = 0; i < source.count; i++) {
      if (pinned[i]) continue;
      const dx = rest[i * 3] - local.x;
      const dy = rest[i * 3 + 1] - local.y;
      const weight = 1 - (dx * dx + dy * dy) / (radius * radius);
      if (weight <= 0) continue;
      const limit = Math.max(-.3, Math.min(.3, impulse));
      velocity[i] = Math.max(-maxSpeed, Math.min(maxSpeed, velocity[i] + limit * weight * weight));
      active = true;
    }
  }

  function tick(delta) {
    if (!active) return;
    time += Math.min(delta, .05);
    let motion = false;
    let update = false;
    while (time >= stepSeconds) {
      time -= stepSeconds;
      update = true;
      motion = false;
      for (let i = 0; i < source.count; i++) {
        if (pinned[i]) continue;
        let mean = 0;
        for (const joint of joints[i]) mean += offset[joint];
        const stretch = mean / Math.max(joints[i].length, 1) - offset[i];
        const acceleration = stretch * 380 - offset[i] * 61 - velocity[i] * 7.5;
        velocity[i] = Math.max(-maxSpeed, Math.min(maxSpeed, velocity[i] + acceleration * stepSeconds));
        const raw = offset[i] + velocity[i] * stepSeconds;
        next[i] = Math.max(-maxLift, Math.min(maxLift, raw));
        if (Math.abs(raw) > maxLift) velocity[i] = 0;
        motion ||= Math.abs(next[i]) > .00022 || Math.abs(velocity[i]) > .0014;
      }
      for (let pass = 0; pass < 3; pass++) {
        for (const [a, b, limit] of edges) {
          const difference = next[a] - next[b];
          const excess = difference - Math.max(-limit, Math.min(limit, difference));
          if (excess === 0 || (pinned[a] && pinned[b])) continue;
          if (!pinned[a]) next[a] -= excess * (pinned[b] ? 1 : .5);
          if (!pinned[b]) next[b] += excess * (pinned[a] ? 1 : .5);
        }
      }
      [offset, next] = [next, offset];
    }
    if (!update) return;
    if (!motion) {
      offset.fill(0);
      velocity.fill(0);
      time = 0;
    }
    for (let i = 0; i < source.count; i++) position.setZ(i, rest[i * 3 + 2] + offset[i]);
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    active = motion;
  }

  return { touch, tick };
}
