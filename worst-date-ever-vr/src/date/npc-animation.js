export function createNpcAnimation(THREE, actor, bones) {
  const overlays = [bones.Head, bones.Jaw, bones.Spine, bones.Chest,
    bones.UpperArmL, bones.UpperArmR, bones.LowerArmL, bones.LowerArmR]
    .filter(Boolean).map(bone => [bone, bone.quaternion.clone()]);
  let saved = false;

  function reset() {
    if (!saved) return;
    for (const [bone, rotation] of overlays) bone.quaternion.copy(rotation);
    saved = false;
  }

  function capture() {
    if (saved) return;
    for (const [bone, rotation] of overlays) rotation.copy(bone.quaternion);
    saved = true;
  }

  function mood(relationship, intent, emotion) {
    const caution = THREE.MathUtils.clamp(Math.max(
      (45 - relationship.patience) / 30,
      (55 - relationship.safety) / 45,
      intent === 'boundary' ? .55 : 0,
      emotion === 'annoyed' ? .45 : 0
    ), 0, 1);
    if (!caution) return;
    capture();
    bones.Head?.rotateY(.19 * caution);
    bones.Head?.rotateZ(.035 * caution);
    bones.UpperArmL?.rotateX(-.045 * caution);
    bones.UpperArmR?.rotateX(-.045 * caution);
  }

  function aim(bone, child, direction, blend) {
    if (!bone || !child) return;
    const p = bone.getWorldPosition(new THREE.Vector3());
    const q = child.getWorldPosition(new THREE.Vector3());
    const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    const end = new THREE.Quaternion().setFromUnitVectors(q.sub(p).normalize(), direction.normalize())
      .multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
    bone.quaternion.slerp(parent.invert().multiply(end), blend);
    bone.updateWorldMatrix(true, true);
  }

  function poseArm(side, target, blend) {
    const shoulder = bones['UpperArm'+side], elbow = bones['LowerArm'+side], wrist = bones['Wrist'+side];
    if (!shoulder || !elbow || !wrist) return;
    const origin = shoulder.getWorldPosition(new THREE.Vector3());
    const joint = elbow.getWorldPosition(new THREE.Vector3());
    const hand = wrist.getWorldPosition(new THREE.Vector3());
    const upper = origin.distanceTo(joint), lower = joint.distanceTo(hand);
    const line = target.clone().sub(origin);
    if (upper < .04 || lower < .04 || line.lengthSq() < .0001) return;
    const distance = THREE.MathUtils.clamp(line.length(), Math.abs(upper - lower) + .002, upper + lower - .002);
    line.normalize();
    const outward = new THREE.Vector3(side === 'R' ? -.65 : .65, -.88, 0)
      .applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));
    const bend = outward.addScaledVector(line,-outward.dot(line)).normalize();
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance);
    const elbowTarget = origin.clone().addScaledVector(line, along)
      .addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)));
    aim(shoulder, elbow, elbowTarget.sub(origin), blend);
    aim(elbow, wrist, target.clone().sub(elbow.getWorldPosition(new THREE.Vector3())), blend);
  }

  function gesture(kind, age, amount = 1, direction = 0) {
    if (age < 0 || age >= 1.5) return;
    const fade = Math.min(1, age * 7, (1.5 - age) * 3) * amount;
    const wave = Math.sin(age * 8);
    capture();
    const head = bones.Head;
    if (head) {
      const tilt = { nod: [.17 * wave,0,0], laugh: [.13 + .06 * wave,0,.08], startle: [-.16,.13,-.08],
        look_away: [0,.44,.14], wave: [0,.07,.05], sip: [-.1,0,0], eat: [-.11 + .025 * wave,0,0],
        shrug: [.04,.12,.17], reach: [-.08,0,.02], clap: [.08 * wave,0,.06 * wave],
        impact: [-.23,.26 * direction,.31 * direction] }[kind];
      if (tilt) {
        head.rotateX(tilt[0] * fade);
        head.rotateY(tilt[1] * fade);
        head.rotateZ(tilt[2] * fade);
      }
    }
    const world = vector => vector.applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));
    if (kind === 'startle') {
      for (const side of ['L','R']) {
        const shoulder = bones['UpperArm'+side];
        if (!shoulder) continue;
        poseArm(side, shoulder.getWorldPosition(new THREE.Vector3())
          .add(world(new THREE.Vector3(side === 'L' ? .16 : -.16,.08,.27))), fade * .7);
      }
    } else if (kind === 'reach' && bones.UpperArmR) {
      const target = bones.UpperArmR.getWorldPosition(new THREE.Vector3())
        .add(world(new THREE.Vector3(-.12,.03,.43)));
      poseArm('R', target, fade);
    } else if (kind === 'eat' && head) {
      poseArm('R', head.getWorldPosition(new THREE.Vector3())
        .add(world(new THREE.Vector3(-.035,-.11,.17))), fade * .78);
      bones.Jaw?.rotateX(.045 * Math.max(0, Math.sin(age * 13)) * fade);
    } else if (kind === 'clap') {
      for (const side of ['L','R']) {
        const shoulder = bones['UpperArm'+side];
        if (!shoulder) continue;
        poseArm(side, shoulder.getWorldPosition(new THREE.Vector3())
          .add(world(new THREE.Vector3(side === 'L' ? .16 : -.16,.17,.34 + .035 * wave))), fade);
      }
    } else if (kind === 'wave' && bones.UpperArmR) {
      const target = bones.UpperArmR.getWorldPosition(new THREE.Vector3())
        .add(world(new THREE.Vector3(-.17 + wave * .085,.32,.17)));
      poseArm('R', target, fade);
    } else if (kind === 'sip' && head) {
      poseArm('R', head.getWorldPosition(new THREE.Vector3()).add(world(new THREE.Vector3(-.025,-.072,.17))), fade);
    } else if (kind === 'shrug') {
      for (const side of ['L','R']) {
        const shoulder = bones['UpperArm'+side];
        if (!shoulder) continue;
        poseArm(side, shoulder.getWorldPosition(new THREE.Vector3())
          .add(world(new THREE.Vector3(side === 'L' ? .29 : -.29,-.18,.29))), fade);
      }
    }
  }

  function dance(age, amount = .6, stumble = 0) {
    capture();
    const pulse = Math.sin(age * Math.PI * 2 / .69);
    const opposite = Math.sin(age * Math.PI * 2 / .69 + Math.PI);
    const energy = Math.max(.12, amount * (1 - stumble * .48));
    bones.Spine?.rotateZ(pulse * .055 * energy);
    bones.Spine?.rotateY(opposite * .07 * energy);
    bones.Chest?.rotateX(Math.abs(pulse) * .04 * energy - stumble * .055);
    bones.Head?.rotateZ(opposite * .065 * energy + stumble * .035);
    bones.Head?.rotateX(Math.abs(pulse) * .035 * energy);
    const world = vector => vector.applyQuaternion(actor.getWorldQuaternion(new THREE.Quaternion()));
    for (const side of ['L','R']) {
      const shoulder = bones['UpperArm'+side];
      if (!shoulder) continue;
      const phase = side === 'L' ? pulse : opposite;
      poseArm(side, shoulder.getWorldPosition(new THREE.Vector3())
        .add(world(new THREE.Vector3(side === 'L' ? .18 : -.18,
          .06 + Math.max(0, phase) * .19 * energy - stumble * .08,
          .31 + Math.max(0, phase) * .09))), .55 + energy * .30);
    }
  }

  return { reset, gesture, dance, mood };
}
