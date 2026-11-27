import { createAvatarHand } from './avatar-hands.js';
import { fitCharacter } from './bedroom-scenery.js';

export function createAvatar(THREE, root, load) {
  const avatar = new THREE.Group();
  avatar.name = 'Avatar do jogador';
  root.add(avatar);
  const outfits = {
    male: ['PlayerMan', 'JacketMan', 'FormalMan'],
    female: ['PlayerWoman', 'JacketWoman', 'FormalWoman']
  };
  const models = new Map();
  const headPosition = new THREE.Vector3();
  const eyeVector = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const step = new THREE.Vector3();
  const floor = new THREE.Vector3();
  const heading = new THREE.Vector3();
  let activeKey;
  let current;
  let initialized = false;
  let walking = false;
  let immersive = false;

  function activate(identity, outfit = 0) {
    const key = (outfits[identity] ?? outfits.male)[outfit] ?? outfits.male[0];
    if (activeKey === key) return;
    activeKey = key;
    if (!models.has(key)) {
      const pending = load(`Characters/${key}.glb`).then(({ scene: model, animations }) => {
        const group = new THREE.Group();
        fitCharacter(THREE, group, model, 1.7);
        avatar.add(group);
        group.visible = false;
        const bones = {};
        model.traverse(object => {
          object.layers.set(26);
          if (object.isBone) bones[object.name.replace(/([LR])$/, '.$1').replace(/\.\./g, '.')] = object;
        });
        const mixer = new THREE.AnimationMixer(model);
        const walk = animations.find(clip => /\|Walk$/.test(clip.name));
        const idle = animations.find(clip => /\|Idle$/.test(clip.name));
        const clips = { walk: walk && mixer.clipAction(walk), idle: idle && mixer.clipAction(idle) };
        const named = (name, side) => bones[`${name}.${side}`] || bones[`${name}_${side}`] ||
          Object.values(bones).find(o => o.name.toLowerCase().replace(/[^a-z]/g, '') === (name + side).toLowerCase());
        const arms = ['L', 'R'].map(side => ({
          upper: named('UpperArm', side), lower: named('LowerArm', side), wrist: named('Wrist', side),
          pole: new THREE.Vector3(side === 'L' ? -.34 : .34, -.64, .12)
        }));
        const hands = arms.map((arm, index) => createAvatarHand(THREE, model, named, index ? 'R' : 'L', arm.wrist));
        const skull = bones.Head;
        return { group, mixer, clips, skull, arms, hands };
      });
      models.set(key, pending);
    }
    models.get(key).then(model => {
      if (activeKey !== key || current === model) return;
      if (current) {
        current.group.visible = false;
        for (const hand of current.hands) hand?.update(null, false);
      }
      current = model;
      model.group.visible = true;
      model.clips.idle?.reset().play();
      walking = false;
    }).catch(console.error);
  }

  function bendArm(arm, point) {
    if (!arm.upper || !arm.lower || !arm.wrist || !point) return;
    const a = arm.upper.getWorldPosition(new THREE.Vector3());
    const b = arm.lower.getWorldPosition(new THREE.Vector3());
    const c = arm.wrist.getWorldPosition(new THREE.Vector3());
    const l1 = a.distanceTo(b);
    const l2 = b.distanceTo(c);
    const line = point.clone().sub(a);
    const distance = THREE.MathUtils.clamp(line.length(), Math.abs(l1 - l2) + .004, l1 + l2 - .005);
    line.normalize();
    const pole = arm.pole.clone().applyQuaternion(avatar.quaternion);
    pole.addScaledVector(line, -pole.dot(line)).normalize();
    const along = (l1 * l1 + distance * distance - l2 * l2) / (2 * distance);
    const lift = Math.sqrt(Math.max(0, l1 * l1 - along * along));
    const elbow = a.clone().addScaledVector(line, along).addScaledVector(pole, lift);
    function aim(bone, from, old, target) {
      const tilt = new THREE.Quaternion().setFromUnitVectors(old.clone().sub(from).normalize(),
        target.clone().sub(from).normalize());
      const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
      const worldQ = bone.getWorldQuaternion(new THREE.Quaternion()).premultiply(tilt);
      bone.quaternion.copy(parentQ.invert().multiply(worldQ));
      bone.updateMatrixWorld(true);
    }
    aim(arm.upper, a, b, elbow);
    const actual = arm.lower.getWorldPosition(new THREE.Vector3());
    const grip = arm.wrist.getWorldPosition(new THREE.Vector3());
    aim(arm.lower, actual, grip, a.addScaledVector(line, distance));
  }

  function tick(camera, grips, delta, showHands = immersive) {
    camera.getWorldPosition(headPosition);
    camera.getWorldDirection(eyeVector);
    floor.set(headPosition.x, 0, headPosition.z);
    if (!initialized) { previous.copy(floor); initialized = true; }
    step.copy(floor).sub(previous);
    previous.copy(floor);
    if (!current) return;
    const threshold = step.length() / Math.max(delta, .001);
    const moving = threshold > .17 && threshold < 5;
    if (walking !== moving) {
      (walking ? current.clips.walk : current.clips.idle)?.fadeOut(.12);
      (moving ? current.clips.walk : current.clips.idle)?.reset().fadeIn(.12).play();
      walking = moving;
    }
    for (const hand of current.hands) hand?.reset();
    current.mixer.update(delta * (walking ? THREE.MathUtils.clamp(threshold, .55, 1.65) : 1));
    avatar.position.copy(floor);
    heading.copy(eyeVector).setY(0).normalize();
    const yaw = Math.atan2(heading.x, heading.z);
    avatar.rotation.y = yaw;
    avatar.scale.setScalar(THREE.MathUtils.clamp(headPosition.y / 1.59, .75, 1.28));
    avatar.updateWorldMatrix(true, true);
    if (current.skull) current.skull.rotateX(THREE.MathUtils.clamp(eyeVector.y, -.65, .65) * .65);
    for (const [index, side] of ['left','right'].entries()) {
      const pose = grips[side];
      bendArm(current.arms[index], pose?.position);
      current.hands[index]?.update(pose, showHands);
    }
  }

  function setImmersive(enabled) {
    immersive = enabled;
    if (!enabled) for (const hand of current?.hands ?? []) hand?.update(null, false);
  }

  return { activate, tick, setImmersive, object: avatar };
}
