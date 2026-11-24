export const cushionTop = .46 + .095 / 2;

export function kneePoint(THREE, hip, ankle, upper, lower, forward) {
  const line = ankle.clone().sub(hip);
  const distance = THREE.MathUtils.clamp(line.length(), Math.abs(upper - lower) + .002, upper + lower - .002);
  line.normalize();
  const pole = forward.clone().addScaledVector(line, -forward.dot(line)).normalize();
  const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
  const bend = Math.sqrt(Math.max(0, upper * upper - along * along));
  return hip.clone().addScaledVector(line, along).addScaledVector(pole, bend);
}

export function createSeatPose(THREE, actor, bones) {
  const legs = ['L','R'].map(side => ({
    thigh: bones['UpperLeg' + side], shin: bones['LowerLeg' + side], foot: bones['Foot' + side]
  })).filter(leg => leg.thigh && leg.shin && leg.foot);
  for (const leg of legs) {
    leg.end = leg.shin.children.find(child => child === leg.foot || /end$/i.test(child.name));
    if (leg.end) continue;
    const ankle = leg.foot.getWorldPosition(new THREE.Vector3());
    leg.end = new THREE.Object3D();
    leg.end.position.copy(leg.shin.worldToLocal(ankle));
    leg.shin.add(leg.end);
  }
  const saved = legs.flatMap(leg => [leg.thigh, leg.shin, leg.foot].map(bone =>
    [bone, bone.quaternion.clone(), bone.position.clone()]));
  let posed = false;
  function reset() {
    if (!posed) return;
    for (const [bone, rotation, position] of saved) {
      bone.quaternion.copy(rotation);
      bone.position.copy(position);
    }
    posed = false;
  }
  const position = bone => bone.getWorldPosition(new THREE.Vector3());
  const rotation = bone => bone.getWorldQuaternion(new THREE.Quaternion());
  function setRotation(bone, world) {
    bone.quaternion.copy(rotation(bone.parent).invert().multiply(world));
    bone.updateWorldMatrix(true, true);
  }
  function aim(bone, endpoint, goal) {
    const origin = position(bone);
    const tilt = new THREE.Quaternion().setFromUnitVectors(position(endpoint).sub(origin).normalize(), goal.clone().sub(origin).normalize());
    setRotation(bone, rotation(bone).premultiply(tilt));
  }

  function apply(amount) {
    if (!legs.length || !amount) return;
    posed = true;
    for (const [bone, before, position] of saved) {
      before.copy(bone.quaternion);
      position.copy(bone.position);
    }
    actor.updateWorldMatrix(true, true);
    const forward = new THREE.Vector3(0,0,1).applyQuaternion(rotation(actor));
    const hipY = legs.reduce((sum, leg) => sum + position(leg.thigh).y, 0) / legs.length;
    const ankleHeights = legs.map(leg => THREE.MathUtils.clamp(position(leg.foot).y, .05, .115));
    const lowerBy = (hipY - (cushionTop + .075)) * amount;
    actor.position.y -= lowerBy;
    actor.updateWorldMatrix(true, true);
    for (const [index, { thigh, shin, foot, end }] of legs.entries()) {
      const hip = position(thigh), standingAnkle = position(foot), shinEnd = position(end);
      const upper = hip.distanceTo(position(shin)), lower = position(shin).distanceTo(shinEnd);
      if (upper < .04 || lower < .04) continue;
      const goal = hip.clone().addScaledVector(forward, .29);
      goal.y = ankleHeights[index];
      const offset = end === foot ? new THREE.Vector3() : shinEnd.clone().sub(standingAnkle).clampLength(0, .05);
      const ankle = standingAnkle.clone().add(new THREE.Vector3(0, lowerBy, 0)).lerp(goal, amount).add(offset);
      const knee = kneePoint(THREE, hip, ankle, upper, lower, forward);
      const footRotation = rotation(foot);
      aim(thigh, shin, knee);
      aim(shin, end, ankle);
      if (end !== foot) foot.position.copy(foot.parent.worldToLocal(position(end).sub(offset)));
      setRotation(foot, footRotation);
    }
  }
  return { apply, reset };
}
