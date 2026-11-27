export function createPullCord(THREE, anchor, knob) {
  const links = 9;
  const length = anchor.distanceTo(knob);
  const nodes = Array.from({ length: links + 1 }, (_, index) => anchor.clone().lerp(knob, index / links));
  const previous = nodes.map(point => point.clone());
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(nodes),
    new THREE.LineBasicMaterial({ color: 0xb99b62 }));
  line.frustumCulled = false;
  line.layers.enable(27);
  const ray = new THREE.Ray();
  const onHand = new THREE.Vector3(), onCord = new THREE.Vector3(), delta = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  let refractory = 0;

  function step(dt, heldPoint) {
    refractory = Math.max(0, refractory - dt);
    nodes[0].copy(anchor);
    for (let i = 1; i <= links; i++) {
      const point = nodes[i];
      velocity.subVectors(point, previous[i]).multiplyScalar(.988);
      previous[i].copy(point);
      point.add(velocity);
      point.y -= 9.81 * dt * dt;
    }
    const distance = heldPoint ? Math.max(length, heldPoint.distanceTo(anchor)) : length;
    const linkLength = distance / links;
    for (let iteration = 0; iteration < 10; iteration++) {
      if (heldPoint) nodes[links].copy(heldPoint);
      for (let i = 0; i < links; i++) {
        const a = nodes[i], b = nodes[i + 1];
        delta.subVectors(b, a);
        const span = delta.length();
        if (span < 1e-6) continue;
        delta.multiplyScalar((span - linkLength) / span);
        const freeA = i > 0, freeB = i + 1 < links || !heldPoint;
        if (freeA) a.addScaledVector(delta, freeB ? .5 : 1);
        if (freeB) b.addScaledVector(delta, freeA ? -.5 : -1);
      }
    }
    if (heldPoint) nodes[links].copy(heldPoint);
    const positions = line.geometry.attributes.position;
    for (const [i, point] of nodes.entries()) positions.setXYZ(i, point.x, point.y, point.z);
    positions.needsUpdate = true;
    return nodes[links];
  }

  function hit(from, to, seconds) {
    if (refractory > 0) return false;
    const handMotion = to.clone().sub(from);
    const travel = handMotion.length();
    if (travel < .004) return false;
    ray.set(from, handMotion.clone().normalize());
    let best = -.001, nearest = Infinity;
    for (let i = 0; i < links; i++) {
      const distance = ray.distanceSqToSegment(nodes[i], nodes[i + 1], onHand, onCord);
      if (distance > .047 ** 2 || distance >= nearest || from.distanceTo(onHand) > travel + .018) continue;
      nearest = distance;
      best = i + onCord.distanceTo(nodes[i]) / Math.max(.001, nodes[i].distanceTo(nodes[i + 1]));
    }
    if (best < 0) return false;
    const index = Math.max(1, Math.min(links, Math.round(best)));
    const impulse = handMotion.multiplyScalar(.59 / Math.max(.012, seconds)).clampLength(0, 2.9);
    previous[index].addScaledVector(impulse, -1 / 120);
    if (index < links) previous[index + 1].addScaledVector(impulse, -.45 / 120);
    refractory = .095;
    return true;
  }

  return { line, anchor, length, step, hit };
}
