export function sweptContact(THREE, previous, position, target, radius) {
  if (!previous) return false;
  const step = position.clone().sub(previous);
  const length = step.lengthSq();
  if (length < .000001) return false;
  const unit = THREE.MathUtils.clamp(target.clone().sub(previous).dot(step) / length, 0, 1);
  return previous.clone().addScaledVector(step, unit).distanceToSquared(target) < radius * radius;
}

export function impactClass(speed, mass = .35) {
  const momentum = speed * mass;
  return momentum < .48 ? null : momentum < 1.1 ? 'impact_light' : 'impact_hard';
}
