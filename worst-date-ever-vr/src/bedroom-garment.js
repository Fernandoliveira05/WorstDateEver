import { Matrix4, Quaternion, Vector3 } from 'three';

const fixed = .01;
const pinned = index => index >= 3 && index <= 5;
const gravity = new Vector3(0, -9.81 * fixed ** 2, 0);

export function createGarment(spec, nodes, sweep) {
  const positions = nodes.map(bone => bone.getWorldPosition(new Vector3()));
  const before = positions.map(value => value.clone());
  const previous = positions.map(value => value.clone());
  const edges = [];
  const depth = positions.map((point, i) => point.distanceTo(positions[3 + i % 3]));
  let time = 0;
  let settled = 0;

  function link(a, b, strength) {
    edges.push({ a, b, strength, length: positions[a].distanceTo(positions[b]) });
  }

  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const i = row * 3 + col;
      if (row < 2) link(i, i + 3, .98);
      if (col < 2) link(i, i + 1, .98);
      if (row < 2 && col < 2) link(i, i + 4, .52);
      if (row < 2 && col > 0) link(i, i + 2, .52);
      if (row === 0) link(i, i + 6, spec.bend * .32);
    }
  }

  const delta = new Vector3();
  const right = new Vector3();
  const forward = new Vector3();
  const up = new Vector3();
  const basis = new Matrix4();
  const orientation = new Quaternion();
  const parent = new Quaternion();

  function simulate() {
    for (let i = 0; i < 9; i++) {
      const point = positions[i];
      before[i].copy(point);
      if (pinned(i)) {
        previous[i].copy(point);
        nodes[i].getWorldPosition(point);
      } else {
        delta.subVectors(point, previous[i]).clampLength(0, .024).multiplyScalar(spec.damp);
        previous[i].copy(point);
        point.add(delta).add(gravity);
      }
    }
    for (let pass = 0; pass < 8; pass++) {
      for (const edge of edges) {
        const a = pinned(edge.a) ? 0 : 1;
        const b = pinned(edge.b) ? 0 : 1;
        if (!(a + b)) continue;
        delta.subVectors(positions[edge.b], positions[edge.a]);
        const length = delta.length();
        if (length < .0001) continue;
        delta.multiplyScalar((length - edge.length) * edge.strength / ((a + b) * length));
        positions[edge.a].addScaledVector(delta, a);
        positions[edge.b].addScaledVector(delta, -b);
      }
    }
    let moved = 0;
    for (let i = 0; i < 9; i++) {
      if (!pinned(i)) {
        positions[i].copy(sweep(before[i], positions[i]));
        const anchor = positions[3 + i % 3];
        delta.subVectors(positions[i], anchor);
        const limit = depth[i] * 1.045;
        if (delta.lengthSq() > limit * limit) {
          delta.setLength(limit).add(anchor);
          positions[i].copy(sweep(anchor, delta));
          previous[i].copy(positions[i]);
        }
      }
      moved = Math.max(moved, positions[i].distanceToSquared(before[i]));
    }
    settled = moved < 7e-8 ? settled + 1 : 0;
  }

  function tick(dt) {
    if (settled >= 12 && [3, 4, 5].every(i => nodes[i].getWorldPosition(delta).distanceToSquared(positions[i]) < 2.5e-8)) return;
    time += Math.min(.04, dt);
    while (time >= fixed) {
      simulate();
      time -= fixed;
    }
    nodes.forEach((bone, i) => {
      if (pinned(i)) return;
      const row = Math.floor(i / 3), col = i % 3;
      right.subVectors(positions[row * 3 + Math.max(0, col - 1)], positions[row * 3 + Math.min(2, col + 1)]).normalize();
      forward.subVectors(positions[Math.min(2, row + 1) * 3 + col], positions[Math.max(0, row - 1) * 3 + col]).normalize();
      up.crossVectors(forward, right).normalize();
      right.crossVectors(up, forward).normalize();
      bone.position.copy(positions[i]);
      bone.parent.worldToLocal(bone.position);
      if (up.lengthSq() > .1) {
        orientation.setFromRotationMatrix(basis.makeBasis(right, up, forward));
        bone.quaternion.copy(bone.parent.getWorldQuaternion(parent).invert().multiply(orientation));
      }
      bone.updateMatrixWorld(true);
    });
  }
  return { tick };
}
