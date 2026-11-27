import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Body, Box, Sphere, Vec3 } from 'cannon-es';
import { authoredGrip, heldGripPose, phoneGrip, phoneFingerTarget, phoneFingerDirection, phoneRailPose, closestGripAnchor, objectGrip, gripSurface, conformJoint, twoHandPose, palmSign } from '../src/grip-pose.mjs';
import { assetMechanisms, blanketPull } from '../src/asset-registry.mjs';
import { benchmark } from '../tools/hand-qa/benchmark.mjs';
import { qaAssets } from '../tools/hand-qa/qa-assets.mjs';
import { createAvatarHand, handBasis } from '../src/avatar-hands.js';
import { createBedroomPhysics } from '../src/bedroom-physics.js';

test('phone stays in a portrait pose with a fixed transform for each wrist', () => {
  const wrist = new THREE.Vector3(.4, 1.4, .2);
  for (const side of ['left', 'right']) {
    const basis = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 1.1);
    const grip = phoneGrip(THREE, wrist, basis, side);
    const localTop = new THREE.Vector3(0, 1, 0).applyQuaternion(grip.orientation).applyQuaternion(basis.clone().invert());
    const palm = new THREE.Vector3(0, side === 'left' ? -1 : 1, 0).applyQuaternion(basis);
    const screen = new THREE.Vector3(0, 0, -1).applyQuaternion(grip.orientation);
    assert.ok(screen.dot(palm) > .999);
    assert.ok(grip.position.clone().sub(wrist).dot(palm) > .015);
    assert.ok(localTop.distanceTo(new THREE.Vector3(0, 0, -1)) < 1e-8);
    assert.ok(grip.position.distanceTo(wrist) < .14);
  }
});

test('reading grip mirrors the hand around the case and keeps the screen facing the player', () => {
  const eye = new THREE.Vector3(0, 1.60, 0);
  for (const [side, sign] of [['left', 1], ['right', -1]]) {
    const wrist = new THREE.Vector3(-sign * .24, 1.18, -.47);
    const grip = phoneGrip(THREE, wrist, new THREE.Quaternion(), side, eye);
    const back = new THREE.Vector3(0, 0, -1).applyQuaternion(grip.orientation);
    assert.ok(back.dot(eye.clone().sub(grip.position).normalize()) > .9999);
    assert.ok(grip.position.y > wrist.y + .05);
    const body = { position: grip.position, quaternion: grip.orientation };
    const local = value => value.sub(grip.position).applyQuaternion(grip.orientation.clone().invert());
    const wristLocal = local(wrist.clone());
    assert.ok(wristLocal.x * sign > .085 && wristLocal.z > .025);
    assert.ok(local(phoneFingerTarget(THREE, body, side, 0, 2)).x * sign > .05);
    for (let finger = 1; finger < 5; finger++) {
      const first = local(phoneFingerTarget(THREE, body, side, finger, 1));
      const edge = local(phoneFingerTarget(THREE, body, side, finger, 2));
      const last = local(phoneFingerTarget(THREE, body, side, finger, 3));
      assert.ok(first.z > .02);
      assert.ok(edge.x * sign < -.06 && edge.z > -.005);
      assert.ok(last.x * sign < -.05);
      assert.ok(last.z < 0);
    }
  }
});

test('a low and sideways phone faces the eye and follows the player’s vertical axis', () => {
  const eye = new THREE.Vector3(.2, 1.6, -.1);
  const up = new THREE.Vector3(.26, .92, -.17).normalize();
  for (const side of ['left', 'right']) {
    for (const offset of [[-.33, -.46, -.20], [.46, .10, -.34], [.11, -.48, -.37]]) {
      const grip = phoneGrip(THREE, eye.clone().add(new THREE.Vector3(...offset)), new THREE.Quaternion(), side, eye, up);
      const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(grip.orientation);
      const vertical = new THREE.Vector3(0, 1, 0).applyQuaternion(grip.orientation);
      assert.ok(normal.dot(eye.clone().sub(grip.position).normalize()) > .99995);
      assert.ok(vertical.dot(up.clone().projectOnPlane(normal).normalize()) > .99999);
    }
  }
});

test('a phone stopped by room geometry faces the eye from its visible center', () => {
  const eye = new THREE.Vector3(0, 1.63, .30), up = new THREE.Vector3(0, 1, 0);
  const wrist = new THREE.Vector3(-.14, 1.46, -.12);
  const visible = new THREE.Vector3(-.19, 1.32, -.12);
  const grip = phoneGrip(THREE, wrist, new THREE.Quaternion(), 'left', eye, up, visible);
  const normal = new THREE.Vector3(0, 0, -1).applyQuaternion(grip.orientation);
  assert.ok(normal.angleTo(eye.clone().sub(visible)) < 1e-7);
  assert.ok(grip.position.distanceTo(visible) > .10);
});

test('two hands steer a rigid object by opposing anchors and by their shared midpoint', () => {
  const one = { anchor: new THREE.Vector3(-.2, 0, 0), point: new THREE.Vector3(1, 2, 3) };
  const two = { anchor: new THREE.Vector3(.2, 0, 0), point: new THREE.Vector3(1, 2.4, 3) };
  const result = twoHandPose(THREE, one, two, new THREE.Quaternion());
  assert.ok(result.position.distanceTo(new THREE.Vector3(1, 2.2, 3)) < 1e-9);
  assert.ok(one.anchor.clone().applyQuaternion(result.orientation).add(result.position).distanceTo(one.point) < 1e-9);
  assert.ok(two.anchor.clone().applyQuaternion(result.orientation).add(result.position).distanceTo(two.point) < 1e-9);
  two.point.copy(one.point);
  assert.ok(twoHandPose(THREE, one, two, new THREE.Quaternion()).orientation.w > .999);
});

test('the second hand can steer and take over a wide prop without dropping it', () => {
  const root = new THREE.Group();
  const keyboard = new THREE.Group(), phone = new THREE.Group(), door = new THREE.Group();
  keyboard.position.set(0, 1.25, 0);
  phone.position.set(2, 1.25, 0);
  door.position.set(-4, 0, 0);
  root.add(keyboard, phone, door);
  const shape = { size: [.35, .04, .15], position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .6, bounce: 0 };
  const physics = createBedroomPhysics(THREE, root, {
    props: [{ id: 'keys', mass: .4, shapes: [shape] }, { id: 'phone', mass: .2, shapes: [{ ...shape, size: [.10, .19, .02] }] }],
    phone: { id: 'phone' }, door: { id: 'door', shapes: [shape] }, soft: [], colliders: [], pulls: [], drawers: [],
    station: { position: [5, 5, 5], shape }
  }, id => ({ keys: keyboard, phone, door })[id], () => {});
  const prop = physics.props.get('keys');
  const left = new THREE.Vector3(-.175, 1.25, 0), right = new THREE.Vector3(.175, 1.25, 0);
  const orientation = new THREE.Quaternion();
  const advance = () => { for (let i = 0; i < 8; i++) physics.tick(1 / 120); };
  assert.ok(physics.grab('controller-left', left, orientation, prop));
  const wrist = { position: left.clone().add(new THREE.Vector3(-.11, 0, 0)), orientation, anchored: true };
  const controllerPose = physics.handOnObject('controller-left', wrist);
  assert.equal(controllerPose.position, wrist.position);
  assert.equal(controllerPose.orientation, wrist.orientation);
  assert.equal(physics.grab('left', right, orientation, prop), false);
  assert.equal(physics.grab('right', right, orientation, prop, { remote: true }), false);
  assert.equal(physics.nearest(right, .08, right, 'right'), prop);
  assert.ok(physics.grab('right', right, orientation, prop));
  const initial = new THREE.Vector3().copy(prop.body.position);
  advance();
  assert.ok(initial.distanceTo(prop.body.position) < .01, prop.body.position.toString());
  physics.updateGrab('right', right.clone().add(new THREE.Vector3(0, .12, .08)), orientation);
  advance();
  assert.ok(prop.body.position.y > 1.28);
  assert.ok(orientation.angleTo(new THREE.Quaternion().copy(prop.body.quaternion)) > .2);
  const position = new THREE.Vector3().copy(prop.body.position);
  assert.ok(physics.release('controller-left', false));
  assert.equal(prop.held, 'right');
  advance();
  assert.ok(position.distanceTo(prop.body.position) < .01);
  assert.ok(physics.release('right', false));
  assert.equal(prop.held, false);

  const handset = physics.props.get('phone');
  assert.ok(physics.grab('left', phone.position, orientation, handset));
  assert.equal(physics.grab('right', phone.position.clone().add(new THREE.Vector3(0, .14, 0)), orientation, handset), false);
});

test('the palm faces each approached side while its wrist stays outside the prop', () => {
  const body = new Body({ position: new Vec3(.1, 1.2, .4) });
  body.addShape(new Box(new Vec3(.23, .12, .08)));
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(.24, .61, -.43));
  body.quaternion.copy(turn);
  const center = new THREE.Vector3().copy(body.position);
  const surface = gripSurface(THREE, body);
  for (const side of ['left', 'right']) {
    for (const axis of [0, 1, 2]) {
      for (const sign of [-1, 1]) {
        const normal = new THREE.Vector3().setComponent(axis, sign);
        const approach = normal.clone().multiplyScalar(.34).applyQuaternion(turn).add(center);
        const grip = objectGrip(THREE, body, 'power', approach, new THREE.Quaternion(), side);
        const palm = new THREE.Vector3(0, palmSign(side), 0).applyQuaternion(grip.orientation);
        assert.ok(palm.dot(normal) < -.96);
        assert.ok(surface(grip.position.clone().applyQuaternion(turn).add(center)) > .035);
        assert.ok(Math.abs(surface(grip.anchor.clone().applyQuaternion(turn).add(center))) < 1e-6);
      }
    }
  }
});

test('a fabric pinch selects the approached seam and follows it toward the corner', () => {
  const body = new Body();
  const zones = benchmark.picnic_blanket.grip_zones;
  for (const side of ['left', 'right']) {
    const contact = new THREE.Vector3(.37, .011, .74);
    const from = contact.clone().add(new THREE.Vector3(0,.06,.08));
    const grip = authoredGrip(THREE, body, zones, contact, from, new THREE.Quaternion(), side);
    assert.equal(grip.zone, 'Front');
    assert.ok(Math.abs(grip.anchor.x - contact.x) < 1e-8);
    assert.ok(grip.position.z > contact.z + .11);
    assert.equal(authoredGrip(THREE, body, zones, contact, from, new THREE.Quaternion(), side, true), undefined);
  }
});

test('an off-center blanket pull lifts both the cloth and trim near the selected pinch', () => {
  const model = new THREE.Group();
  const fabric = new THREE.Group();
  fabric.name = benchmark.picnic_blanket.clothMesh;
  model.add(fabric);
  for (let i = 0; i < 2; i++) {
    const mesh = new THREE.Mesh();
    mesh.morphTargetDictionary = { PullRightLow: 0, PullRight: 1, PullRightHigh: 2 };
    mesh.morphTargetInfluences = [0, 0, 0];
    fabric.add(mesh);
  }
  const mechanism = assetMechanisms(model, benchmark.picnic_blanket);
  const body = new Body();
  const grip = {
    zone: 'Right',
    anchor: new THREE.Vector3(.741, .011, -.56),
    position: new THREE.Vector3(.89, .05, -.56)
  };
  assert.equal(blanketPull(THREE, body, grip, new THREE.Vector3(0, 0, .24)), 0);
  assert.equal(blanketPull(THREE, body, grip, new THREE.Vector3(-.05, -.24, 0)), 0);
  const amount = blanketPull(THREE, body, grip, new THREE.Vector3(.05, .24, 0));
  mechanism.setPull(grip.zone, amount, 1, grip.anchor);
  for (const part of fabric.children) assert.deepEqual(part.morphTargetInfluences, [1, 0, 0]);

  const moved = mechanism.displaceGrip(grip);
  assert.ok(moved.anchor.distanceTo(new THREE.Vector3(.791, .251, -.56)) < 1e-8);
  assert.ok(moved.position.clone().sub(moved.anchor).distanceTo(grip.position.clone().sub(grip.anchor)) < 1e-8);

  mechanism.setPull(grip.zone, 0, .5, grip.anchor);
  assert.equal(fabric.children[0].morphTargetInfluences[0], .5);
  assert.ok(Math.abs(mechanism.displaceGrip(grip).anchor.y - .131) < 1e-8);
});

test('each cushion shoulder keeps the same wrist orientation across approach elevations', () => {
  const body = new Body();
  const zones = qaAssets['floor-cushion'].grip_zones;
  for (const zone of zones) {
    const anchor = new THREE.Vector3(...zone.local_position_m);
    const radial = anchor.clone().setY(0).normalize();
    for (const side of ['left', 'right']) {
      let first;
      for (const pitch of [-30, 0, 30]) {
        const angle = THREE.MathUtils.degToRad(pitch);
        const approach = radial.clone().multiplyScalar(Math.cos(angle)).setY(Math.sin(angle));
        const basis = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), approach);
        const grip = authoredGrip(THREE, body, zones, anchor, anchor.clone().addScaledVector(approach, .1), basis, side);
        assert.equal(grip.zone, zone.zone_id);
        assert.ok(Math.hypot(grip.position.x, grip.position.z) > .2625);
        if (first) {
          assert.ok(grip.position.distanceTo(first.position) < 1e-8);
          assert.ok(1 - Math.abs(grip.orientation.dot(first.orientation)) < 1e-8);
        }
        first = grip;
      }
    }
  }
});

test('a mug handle approach places either wrist on the outer side and centers the fingers', () => {
  const body = new Body();
  const zones = qaAssets['beer-mug'].grip_zones;
  const point = new THREE.Vector3(.053, .043, .033);
  const gripFrom = point.clone().add(new THREE.Vector3(.16, 0, 0));

  for (const side of ['left', 'right']) {
    const grip = authoredGrip(THREE, body, zones, point, gripFrom, new THREE.Quaternion(), side);
    assert.equal(grip.zone, 'handle');
    assert.ok(grip.position.x > .09);
    const thumbAxis = new THREE.Vector3(1, 0, 0).applyQuaternion(grip.orientation);
    assert.ok(Math.abs(grip.position.clone().sub(grip.anchor).dot(thumbAxis) + .032) < 1e-8);
  }

  const bodySide = new THREE.Vector3(-.058, .043, .016);
  const bodyGrip = authoredGrip(THREE, body, zones, bodySide,
    bodySide.clone().add(new THREE.Vector3(-.14, 0, 0)), new THREE.Quaternion(), 'right');
  assert.match(bodyGrip.zone, /^body-/);
});

test('phone joint bends away from a ray that cuts into the rendered rail', () => {
  const body = new Body();
  const origin = new THREE.Vector3(.075, .02, .023);
  const desired = new THREE.Vector3(.038, .02, -.006);
  const direction = phoneFingerDirection(THREE, body, origin, desired, .034);
  const fingertip = origin.clone().addScaledVector(direction, .034);
  assert.ok(fingertip.x > .063 || fingertip.z > .023);
  assert.ok(Math.abs(direction.length() - 1) < 1e-8);
});

test('a rotated compound prop offers distinct, stable grips from either side', () => {
  const body = new Body({ position: new Vec3(1, 1, 1) });
  body.quaternion.setFromAxisAngle(new Vec3(0, 1, 0), Math.PI / 2);
  body.addShape(new Box(new Vec3(.05, .06, .05)));
  body.addShape(new Box(new Vec3(.016, .03, .008)), new Vec3(.072, 0, 0));
  const world = (x, y, z) => new THREE.Vector3().copy(body.pointToWorldFrame(new Vec3(x, y, z)));
  const handle = closestGripAnchor(THREE, body, world(.09, .004, .002));
  const opposite = closestGripAnchor(THREE, body, world(-.055, -.004, .002));
  assert.ok(handle.distanceTo(world(.088, 0, 0)) < 1e-9);
  assert.ok(opposite.distanceTo(world(-.05, 0, 0)) < 1e-9);
  assert.ok(closestGripAnchor(THREE, body, world(.092, .003, .001)).distanceTo(handle) < 1e-9);
});

test('ceramics choose a stable rim, underhand, handle or body pose', () => {
  const basis = new THREE.Quaternion();
  const plate = new Body();
  plate.addShape(new Box(new Vec3(.101, .014, .101)));
  const rim = side => objectGrip(THREE, plate, 'plate',
    new THREE.Vector3(side === 'left' ? -.1 : .1, .004, 0), basis, side);
  assert.equal(rim('left').profile, 'rim');
  assert.equal(rim('right').profile, 'rim');
  assert.ok(rim('left').anchor.distanceTo(rim('right').anchor) > .19);
  assert.equal(objectGrip(THREE, plate, 'plate', new THREE.Vector3(.02, -.018, 0),
    basis, 'right').profile, 'support');

  const mug = new Body();
  mug.addShape(new Box(new Vec3(.051, .055, .051)));
  mug.addShape(new Box(new Vec3(.016, .04, .008)), new Vec3(.069, 0, 0));
  assert.equal(objectGrip(THREE, mug, 'mug', new THREE.Vector3(.09, 0, 0),
    basis, 'left').profile, 'handle');
  assert.equal(objectGrip(THREE, mug, 'mug', new THREE.Vector3(-.06, 0, 0),
    basis, 'right').profile, 'wrap');
});

test('fingers stop at the surface of the held shape and keep their length', () => {
  const body = new Body();
  body.addShape(new Box(new Vec3(.04, .06, .03)), new Vec3(.04, 0, 0));
  body.addShape(new Sphere(.02), new Vec3(-.06, 0, 0));
  const surface = gripSurface(THREE, body);
  assert.ok(surface(new THREE.Vector3(.04, 0, 0)) < 0);
  assert.ok(surface(new THREE.Vector3(-.06, 0, 0)) < 0);
  const origin = new THREE.Vector3(.07, 0, .06);
  const segment = new THREE.Vector3(.0, 0, -.06);
  const joint = conformJoint(THREE, origin, origin.clone().add(segment), new THREE.Vector3(0, 1, 0),
    new THREE.Quaternion(), surface, .007);
  const next = segment.clone().applyQuaternion(joint);
  assert.ok(surface(next.clone().add(origin)) > 0);
  assert.ok(Math.abs(next.length() - segment.length()) < 1e-8);
});


function loadAvatarBones(avatar) {
  const bytes = readFileSync(new URL('../public/assets/bedroom/Characters/' + avatar + '.glb', import.meta.url));
  const { nodes, scenes, scene, skins } = JSON.parse(bytes.toString('utf8', 20, 20 + bytes.readUInt32LE(12)));
  const bones = new Map();
  const skinned = new Set(skins.flatMap(skin => skin.joints));
  const visit = (index, parent) => {
    const node = nodes[index];
    const bone = skinned.has(index) ? new THREE.Bone() : new THREE.Object3D();
    bone.name = node.name;
    if (node.translation) bone.position.fromArray(node.translation);
    if (node.rotation) bone.quaternion.fromArray(node.rotation);
    if (node.scale) bone.scale.fromArray(node.scale);
    parent.add(bone);
    bones.set(node.name, bone);
    for (const child of node.children ?? []) visit(child, bone);
  };
  const model = new THREE.Group();
  for (const index of scenes[scene].nodes) visit(index, model);
  model.updateMatrixWorld(true);
  return { model, bones };
}

const position = bone => bone.getWorldPosition(new THREE.Vector3());

test('both controller hands curl toward the thumb side of the shipped avatar palms', () => {
  for (const avatar of ['PlayerMan', 'PlayerWoman']) {
    const { model, bones } = loadAvatarBones(avatar);
    for (const side of ['L', 'R']) {
      const named = name => bones.get(name + '.' + side);
      const wrist = named('Wrist');
      const base = handBasis(THREE, position(wrist), position(named('Index2')), position(named('Pinky2')));
      const thumb = position(named('Thumb2')).sub(position(wrist)).applyQuaternion(base.clone().invert());
      const orientation = new THREE.Quaternion().setFromEuler(new THREE.Euler(.25, -.81, .77));
      const palm = new THREE.Vector3(0, Math.sign(thumb.y), 0).applyQuaternion(orientation);
      const hand = createAvatarHand(THREE, model, named, side, wrist);
      const pose = { position: new THREE.Vector3(.2, 1.35, -.4), orientation };
      const finger = named('Middle4').children[0];
      hand.update(pose, true);
      const open = position(finger);
      const knuckle = position(named('Middle2'));
      hand.reset();
      hand.update({ ...pose, squeeze: 1, trigger: 1, pointDirection: new THREE.Vector3(1, 0, 0) }, true);
      const closed = position(finger);
      assert.ok(position(named('Middle3')).sub(knuckle).dot(palm) > .02, avatar + ' ' + side);
      assert.ok(closed.distanceTo(knuckle) < open.distanceTo(knuckle) - .012);
      assert.ok(position(named('Middle2')).distanceTo(knuckle) < 1e-6);
      hand.reset();
    }
  }
});

test('pointing rotates the wrist with the index on both avatar hands', () => {
  for (const side of ['L', 'R']) {
    const { model, bones } = loadAvatarBones('PlayerMan');
    const named = name => bones.get(name + '.' + side);
    const wrist = named('Wrist');
    const hand = createAvatarHand(THREE, model, named, side, wrist);
    const pose = { position: new THREE.Vector3(0, 1.2, 0), orientation: new THREE.Quaternion() };
    hand.update(pose, true);
    const initial = wrist.getWorldQuaternion(new THREE.Quaternion());
    const direction = new THREE.Vector3(.71, .23, .52).normalize();
    const tip = hand.update({ ...pose, pointDirection: direction, rayHold: true }, true);
    const index = tip.sub(position(named('Index2'))).normalize();
    assert.ok(index.dot(direction) > .98);
    assert.ok(wrist.getWorldQuaternion(new THREE.Quaternion()).angleTo(initial) > .3);
    assert.ok(position(wrist).distanceTo(pose.position) < 1e-7);
    hand.reset();
    hand.update({ ...pose, pointDirection: direction, rayHold: true, phonePoint: true, anchored: true }, true);
    const anchored = wrist.getWorldQuaternion(new THREE.Quaternion());
    assert.ok(anchored.angleTo(initial) < .001, anchored.angleTo(initial));
  }
});

test('a collider behind the knuckle cannot pull a closing finger backwards', () => {
  const origin = new THREE.Vector3();
  const next = new THREE.Vector3(0, 0, -.05);
  const obstacle = new THREE.Vector3(0, -.035, -.035);
  const distance = point => point.distanceTo(obstacle) - .012;
  const bend = conformJoint(THREE, origin, next, new THREE.Vector3(1,0,0), new THREE.Quaternion(),
    distance, .007, -.14);
  assert.ok(next.clone().applyQuaternion(bend).y >= -1e-8);
});


test('tracked fingertip closure stays on the palm side while fitting a prop', () => {
  const { model, bones } = loadAvatarBones('PlayerWoman');
  for (const side of ['L', 'R']) {
    const named = name => bones.get(name + '.' + side);
    const wrist = named('Wrist');
    const wristPosition = position(wrist);
    const basis = handBasis(THREE, wristPosition, position(named('Index2')), position(named('Pinky2')));
    const thumb = position(named('Thumb2')).sub(wristPosition).applyQuaternion(basis.clone().invert());
    const palm = new THREE.Vector3(0, Math.sign(thumb.y), 0).applyQuaternion(basis);
    const axis = new THREE.Vector3(Math.sign(thumb.y), 0, 0).applyQuaternion(basis);
    const worldMatrices = [new THREE.Matrix4().makeTranslation(...wristPosition)];
    for (const [digit, count] of [['Thumb', 3], ['Index', 4], ['Middle', 4], ['Ring', 4], ['Pinky', 4]]) {
      let point = position(named(digit + '1'));
      worldMatrices.push(new THREE.Matrix4().makeTranslation(...point));
      for (let i = 1; i <= count; i++) {
        const bone = named(digit + i);
        const toward = position(bone.children[0]).sub(position(bone));
        toward.applyAxisAngle(axis, (digit === 'Thumb' ? i : i - 1) * .50);
        point = point.clone().add(toward);
        worldMatrices.push(new THREE.Matrix4().makeTranslation(...point));
      }
    }
    const prop = new Body();
    const knuckle = position(named('Middle2'));
    const sphereCenter = knuckle.clone().addScaledVector(palm, .04)
      .add(new THREE.Vector3(0, 0, -.042).applyQuaternion(basis));
    prop.addShape(new Sphere(.023), new Vec3(...sphereCenter));
    const hand = createAvatarHand(THREE, model, named, side, wrist);
    const tracked = { position: wristPosition, tracked: { wristPosition, worldMatrices } };
    const direction = index => new THREE.Vector3().setFromMatrixPosition(worldMatrices[index]);
    const expected = direction(12).sub(direction(11)).normalize();
    hand.update(tracked, true);
    const unheld = position(named('Middle3')).sub(position(named('Middle2'))).normalize();
    assert.ok(unheld.dot(expected) > .999, side);
    const beam = new THREE.Vector3(.2, .5, .7).normalize();
    const naturalWrist = wrist.getWorldQuaternion(new THREE.Quaternion());
    hand.reset();
    hand.update({ ...tracked, pointDirection: beam }, true);
    const naturalFinger = position(named('Middle3')).sub(position(named('Middle2'))).normalize();
    assert.ok(naturalFinger.dot(expected) > .999, side);
    assert.ok(wrist.getWorldQuaternion(new THREE.Quaternion()).angleTo(naturalWrist) < .0001, side);
    hand.reset();
    hand.update({ ...tracked, pointDirection: beam, rayHold: true }, true);
    assert.ok(wrist.getWorldQuaternion(new THREE.Quaternion()).angleTo(naturalWrist) > .08, side);
    hand.reset();
    hand.update({ ...tracked, heldBody: prop }, true);
    const resultant = position(named('Middle3')).sub(position(named('Middle2')));
    assert.ok(resultant.dot(palm) > .005, side);
    hand.reset();
  }
});

test('a nearby controller keeps the authored wrist anchored when a held prop tilts', () => {
  const body = new Body();
  const grip = { position: new THREE.Vector3(.08, .04, -.02), orientation: new THREE.Quaternion(), profile: 'hook' };
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 1);
  body.position.set(.25, 1.2, -.32);
  body.quaternion.copy(turn);
  const target = grip.position.clone().applyQuaternion(turn).add(body.position);
  const neutral = new THREE.Quaternion();
  const pose = { position: target.clone().addScalar(.02), orientation: neutral };
  const controller = heldGripPose(THREE, body, grip, pose);
  assert.ok(controller.position.distanceTo(target) < 1e-8);
  assert.ok(controller.orientation.angleTo(turn) < 1e-8);
  assert.equal(controller.preset, 'hook');

  const optical = heldGripPose(THREE, body, grip, { ...pose, tracked: {} });
  assert.equal(optical.position, pose.position);
  assert.equal(optical.orientation, neutral);
  const remote = { position: new THREE.Vector3(), orientation: neutral };
  assert.equal(heldGripPose(THREE, body, grip, remote), remote);
});

test('both phone grips bend the middle, ring and little fingers outside the opposite rail', () => {
  const body = new Body();
  const chains = [
    { knuckle: [.012, .026, .039], lengths: [.038, .038, .031] },
    { knuckle: [.027, .005, .033], lengths: [.030, .030, .022] },
    { knuckle: [.034, -.017, .032], lengths: [.025, .026, .021] }
  ];
  for (const side of ['left', 'right']) {
    const sign = palmSign(side);
    for (const { knuckle: [x, y, z], lengths } of chains) {
      const point = new THREE.Vector3(x * sign, y, z);
      const path = phoneRailPose(THREE, body, side, point, lengths);
      for (const [index, segment] of path.entries()) {
        const next = point.clone().addScaledVector(segment, lengths[index]);
        for (const fraction of [.25, .5, .75, 1]) {
          const sample = point.clone().lerp(next, fraction);
          assert.ok(Math.max(Math.abs(sample.x) - .055, Math.abs(sample.z - .001) - .015) > .005);
        }
        point.copy(next);
      }
      assert.ok(Math.abs(point.x * sign - .062) < .005);
      assert.ok(point.z < -.009);
    }
  }
});
