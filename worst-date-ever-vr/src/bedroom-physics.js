import * as CANNON from 'cannon-es';
import { createPhysicsWorld, makeKinematic, releaseDynamic } from './physics-world.mjs';
import { softMaterial } from './bedroom-soft-materials.js';
import { createSolidContact } from './bedroom-solid-contact.js';
import { createGarment } from './bedroom-garment.js';

const fixedStep = 1 / 120;
const v = a => new CANNON.Vec3(...a);
const q = a => new CANNON.Quaternion(...a);
const types = CANNON.Body;

export function createBedroomPhysics(THREE, worldRoot, data, node, event, viewer = () => null) {
  const world = createPhysicsWorld();
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.solver.iterations = 14;
  const hand = new Map();
  const props = new Map();
  const fragments = [];
  const texture = new Map();
  const tmpPos = new THREE.Vector3();
  const tmpRot = new THREE.Quaternion();
  let accumulated = 0;

  function material({ friction, bounce }) {
    const key = `${friction}:${bounce}`;
    let entry = texture.get(key);
    if (!entry) {
      entry = new CANNON.Material({ friction, restitution: bounce });
      texture.set(key, entry);
    }
    return entry;
  }

  function bodyAt(config, pose, type = types.DYNAMIC) {
    if (!config.shapes.length) return null;
    const first = config.shapes[0];
    const body = new CANNON.Body({
      mass: type === types.DYNAMIC ? config.mass : 0, type, allowSleep: type === types.DYNAMIC,
      position: v(pose.position), quaternion: q(pose.rotation),
      linearDamping: .14, angularDamping: .25, material: material(first)
    });
    body.userData = { dynamicMass: config.mass };
    for (const shape of config.shapes) {
      const half = v(shape.size.map(size => Math.max(size * .5, .003)));
      const solid = shape.sphere ? new CANNON.Sphere(Math.max(half.x, half.y, half.z)) : new CANNON.Box(half);
      solid.material = material(shape);
      body.addShape(solid, v(shape.position), q(shape.rotation));
    }
    world.addBody(body);
    return body;
  }

  function poseOf(object) {
    return {
      position: object.getWorldPosition(tmpPos).toArray(),
      rotation: object.getWorldQuaternion(tmpRot).toArray()
    };
  }

  const furniture = [
    [[1.27, .44, 2.14], [.46, .09, .44]], // Chair seat
    [[1.27, .663, 1.925], [.425, .38, .06]], // Chair back
    [[1.27, .207, 2.14], [.105, .414, .11]], // Chair pedestal
    [[1.58, 1, -2.01], [.82, 2, .33]] // Bookcase
  ].map(([position, size]) => ({
    position, rotation: [0, 0, 0, 1],
    shape: { position: [0, 0, 0], rotation: [0, 0, 0, 1], size, sphere: false, friction: .52, bounce: .03 }
  }));
  const furnishings = [...data.colliders, ...furniture]
    .map(collider => bodyAt({ shapes: [collider.shape] }, collider, types.STATIC)).filter(Boolean);
  const avatarBody = new CANNON.Body({ mass: 0, type: types.KINEMATIC, allowSleep: false });
  for (const y of [.25, .49, .73, .97, 1.17])
    avatarBody.addShape(new CANNON.Sphere(.155), new CANNON.Vec3(0, y, 0));
  avatarBody.position.set(0, -12, 0);
  world.addBody(avatarBody);

  function obstacleBoxes(bodies) {
    return bodies.flatMap(body => body.shapes.flatMap((shape, index) => {
      if (!(shape instanceof CANNON.Box)) return [];
      const half = shape.halfExtents;
      const center = body.pointToWorldFrame(body.shapeOffsets[index]);
      const facing = body.quaternion.mult(body.shapeOrientations[index]);
      const axisX = facing.vmult(new CANNON.Vec3(1, 0, 0));
      const axisY = facing.vmult(new CANNON.Vec3(0, 1, 0));
      const axisZ = facing.vmult(new CANNON.Vec3(0, 0, 1));
      const h = Math.abs(axisX.y) * half.x + Math.abs(axisY.y) * half.y + Math.abs(axisZ.y) * half.z;
      const xz = Math.hypot(axisX.x, axisX.z);
      const ux = xz > 1e-4 ? axisX.x / xz : 1;
      const uz = xz > 1e-4 ? axisX.z / xz : 0;
      const span = (x, z) => Math.abs(axisX.x * x + axisX.z * z) * half.x +
        Math.abs(axisY.x * x + axisY.z * z) * half.y + Math.abs(axisZ.x * x + axisZ.z * z) * half.z;
      return [{ x: center.x, z: center.z, ux, uz, hw: span(ux, uz), hd: span(-uz, ux),
        minY: center.y - h, maxY: center.y + h }];
    }));
  }
  const handBodies = new Map(['left', 'right'].map(side => {
    const body = new CANNON.Body({ mass: 0, type: types.KINEMATIC, allowSleep: false, shape: new CANNON.Sphere(.045) });
    body.position.set(0, -12, 0);
    world.addBody(body);
    return [side, body];
  }));

  function moveHands(grips) {
    for (const [side, body] of handBodies) {
      const point = grips[side];
      if (point && !hand.has(side) && !hand.has('controller-' + side)) body.position.set(point.x, point.y, point.z);
      else body.position.set(0, -12, 0);
      body.aabbNeedsUpdate = true;
    }
    world.broadphase.dirty = true;
  }

  const fixedObstacles = obstacleBoxes(furnishings);
  const playerObstacles = () => [...fixedObstacles, ...obstacleBoxes([doorBody, ...[...trays.values()].map(tray => tray.body)])];
  function movePlayer(point, height, enabled) {
    const y = enabled ? point.y - height : -12;
    avatarBody.position.set(point.x, y, point.z);
    for (let i = 0; i < avatarBody.shapeOffsets.length; i++)
      avatarBody.shapeOffsets[i].y = [.25, .49, .73, .97, 1.17][i] * Math.min(1, height / 1.4);
    avatarBody.aabbNeedsUpdate = true;
    world.broadphase.dirty = true;
  }
  for (const def of data.props) {
    const object = node(def.id);
    if (!object || !def.shapes.length) continue;
    const pose = poseOf(object);
    const prop = { def, object, pose,
      body: bodyAt(def, pose, def.isKinematic ? types.STATIC : types.DYNAMIC),
      lastHeld: new THREE.Vector3(), throw: new CANNON.Vec3(), active: true
    };
    prop.body.sleepSpeedLimit = .14;
    prop.body.sleepTimeLimit = .45;
    props.set(def.id, prop);
    if (def.id === data.phone.id) prop.body.addEventListener('collide', ({ contact }) => {
      const speed = Math.abs(contact.getImpactVelocityAlongNormal());
      if (speed > .85) event('phone-impact', speed);
    });
    object.traverse(child => { if (child.isMesh) child.userData.prop = prop; });
    if (def.fractures) {
      for (const pattern of def.fractures) for (const fragment of pattern) {
        if (node(fragment.id)) node(fragment.id).visible = false;
      }
      prop.body.addEventListener('collide', ({ contact }) => {
        if (prop.willBreak || prop.body.type !== types.DYNAMIC) return;
        const impact = Math.abs(contact.getImpactVelocityAlongNormal());
        if (impact < def.breakSpeed) return;
        const point = contact.bi === prop.body ? contact.ri : contact.rj;
        const normal = contact.bi === prop.body ? contact.ni.negate() : contact.ni.clone();
        prop.willBreak = { point: point.clone(), normal, impact };
      });
    }
  }

  const outfits = new Map();
  const softGroups = [];
  for (const soft of data.soft) {
    const parts = [soft.core, ...soft.ends].map(id => props.get(id)).filter(Boolean);
    const core = parts[0]?.body;
    if (!core || parts.length < 2) continue;
    const profile = softMaterial(soft.material);
    const group = { parts, profile, links: [], held: false };
    softGroups.push(group);
    for (const part of parts) {
      part.soft = group;
      part.body.angularDamping = profile.drag;
      part.body.sleepTimeLimit = .85;
      if (soft.outfit >= 0) outfits.set(part.def.id, soft.outfit);
    }
    for (const part of parts.slice(1)) {
      const end = part.body;
      const delta = end.position.vsub(core.position);
      const joint = core.position.vadd(delta.scale(.61));
      const direction = delta.unit();
      const angle = THREE.MathUtils.degToRad(soft.limit);
      const constraint = new CANNON.PointToPointConstraint(core, core.pointToLocalFrame(joint),
        end, end.pointToLocalFrame(joint), 65);
      constraint.collideConnected = false;
      for (const equation of constraint.equations) equation.setSpookParams(4e7, 3, fixedStep);
      world.addConstraint(constraint);
      group.links.push({ core, end, axisCore: core.vectorToLocalFrame(direction),
        axisEnd: end.vectorToLocalFrame(direction), angle,
        rest: core.quaternion.inverse().mult(end.quaternion) });
    }
  }

  const bendAxis = new CANNON.Vec3();
  const bendVector = new CANNON.Vec3();
  const bendError = new CANNON.Quaternion();
  const neutralError = new CANNON.Quaternion();
  const widthAxis = new CANNON.Vec3();
  const inverseEnd = new CANNON.Quaternion();
  const drapeRotation = new CANNON.Quaternion();
  const gravityDirection = new CANNON.Vec3(0, -1, 0);

  function bendSoftItems() {
    for (const group of softGroups) {
      const { parts, links, profile } = group;
      if (!group.held && parts.every(part => part.body.sleepState === types.SLEEPING)) continue;
      // A moving edge wakes the whole garment before the solver resolves the attachment.
      if (group.held || parts.some(part => part.body.velocity.lengthSquared() > .03)) {
        for (const part of parts) if (part.body.sleepState === types.SLEEPING) part.body.wakeUp();
      }
      for (const { core, end, axisCore, axisEnd, angle: bendLimit, rest } of links) {
        end.quaternion.conjugate(inverseEnd);
        core.quaternion.mult(rest, bendError);
        bendError.mult(inverseEnd, neutralError);
        if (group.held) {
          const byEnd = group.held === end;
          const anchor = byEnd ? end : core;
          anchor.vectorToWorldFrame(byEnd ? axisEnd : axisCore, bendVector);
          bendVector.cross(gravityDirection, bendAxis);
          const horizontal = bendAxis.length();
          if (horizontal > .001) {
            bendAxis.scale(1 / horizontal, bendAxis);
            // Bias the free segment toward gravity without changing the joint's length.
            drapeRotation.setFromAxisAngle(bendAxis, profile.drape * horizontal);
            drapeRotation.mult(bendError, bendError);
          }
        }
        bendError.mult(inverseEnd, bendError);
        const rate = group.held ? Math.max(profile.rate, 15) : profile.rate;
        applyBendTorque(core, end, bendError, rate, profile.damping);
        core.vectorToWorldFrame(axisCore, widthAxis);
        applyBendTorque(core, end, neutralError, 48, .84, bendLimit, profile.twist);
      }
    }
  }

  function applyBendTorque(core, end, error, rate, damping, limit = 0, twistLimit = 1) {
    const sign = error.w < 0 ? -1 : 1;
    bendVector.set(error.x * sign, error.y * sign, error.z * sign);
    const length = bendVector.length();
    if (length < .0005) return;
    bendVector.scale(1 / length, bendAxis);
    const twist = Math.abs(bendAxis.dot(widthAxis));
    const permitted = limit * (1 - twist * (1 - twistLimit));
    const angle = 2 * Math.atan2(length, Math.abs(error.w)) - permitted;
    if (angle <= 0) return;
    let inverseInertia = 0;
    for (const body of [core, end]) {
      if (body.type !== types.DYNAMIC || body.sleepState === types.SLEEPING) continue;
      body.invInertiaWorld.vmult(bendAxis, bendVector);
      inverseInertia += bendAxis.dot(bendVector);
    }
    if (inverseInertia <= 0) return;
    end.angularVelocity.vsub(core.angularVelocity, bendVector);
    const speed = bendAxis.dot(bendVector);
    const acceleration = angle * rate ** 2 -
      (limit ? Math.min(0, speed) : speed) * 2 * damping * rate;
    bendAxis.scale(acceleration / inverseInertia, bendVector);
    end.torque.vadd(bendVector, end.torque);
    core.torque.vsub(bendVector, core.torque);
  }

  const doorObject = node(data.door.id);
  const doorBase = doorObject.getWorldQuaternion(new THREE.Quaternion());
  const doorAxis = new THREE.Vector3(0, 1, 0);
  const doorBody = bodyAt(data.door, poseOf(doorObject), types.KINEMATIC);
  let doorAngle = 0;
  let doorVelocity = 0;
  let unlatched = false;

  const trays = new Map(data.drawers.map(def => {
    const object = node(def.id);
    const pose = poseOf(object);
    return [def.id, { def, object, pose, body: bodyAt(def, pose, types.KINEMATIC), motion: 0, speed: 0, target: 0 }];
  }));

  for (const def of data.pulls) {
    const prop = props.get(def.id);
    if (!prop) continue;
    const tray = trays.get(def.drawer);
    prop.pull = { def, axis: new THREE.Vector3(...def.direction).normalize(), tray, motion: 0 };
    if (tray) {
      tray.object.attach(prop.object);
      tray.handle = prop;
      world.removeBody(prop.body);
    }
    if (def.cord) {
      const cable = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(...def.cord), new THREE.Vector3(...prop.pose.position)
      ]), new THREE.LineBasicMaterial({ color: 0xb99b62 }));
      worldRoot.add(cable);
      prop.pull.cable = cable;
    }
  }

  function setPose(object, position, rotation) {
    tmpPos.set(position.x, position.y, position.z);
    tmpRot.set(rotation.x, rotation.y, rotation.z, rotation.w);
    if (object.parent) {
      object.parent.worldToLocal(tmpPos);
      const parents = object.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      tmpRot.premultiply(parents);
    }
    object.position.copy(tmpPos);
    object.quaternion.copy(tmpRot);
    object.updateMatrixWorld(true);
  }

  function triggerPull(prop) {
    const { pull } = prop;
    if (pull.def.id === data.door.handle) {
      unlatched = true;
      doorVelocity = Math.max(doorVelocity, .9);
    } else if (pull.def.cord) event('lamp');
  }

  function click(prop) {
    if (!prop?.pull) return false;
    const { pull } = prop;
    if (pull.tray) pull.tray.target = pull.tray.target > 0 ? 0 : pull.def.Travel;
    else triggerPull(prop);
    return true;
  }

  function grab(id, location, orientation, prop) {
    if (!prop?.active || hand.has(id) || prop.held || prop.soft?.held) return false;
    const orient = orientation.clone().invert();
    const pos = new THREE.Vector3(prop.body.position.x, prop.body.position.y, prop.body.position.z);
    const rot = new THREE.Quaternion(prop.body.quaternion.x, prop.body.quaternion.y, prop.body.quaternion.z, prop.body.quaternion.w);
    prop.lastHeld.copy(pos);
    prop.throw.setZero();
    prop.held = true;
    if (outfits.has(prop.def.id)) event('outfit', outfits.get(prop.def.id));
    const held = { prop, start: location.clone(), point: location.clone(), orientation: orientation.clone(),
      offset: pos.sub(location).applyQuaternion(orient), rotation: orient.multiply(rot) };
    hand.set(id, held);
    if (prop.soft) {
      prop.soft.held = prop.body;
      for (const member of prop.soft.parts) {
        member.body.allowSleep = false;
        member.body.wakeUp();
      }
    }
    if (!prop.pull) makeKinematic(prop.body);
    return true;
  }

  function updateGrab(id, point, orientation) {
    const held = hand.get(id);
    if (!held) return;
    held.point.copy(point);
    held.orientation.copy(orientation);
  }

  function fixGrip(id, position, orientation) {
    const held = hand.get(id);
    if (!held || held.prop.def.id !== data.phone.id) return;
    held.fixedPosition = position.clone();
    held.fixedOrientation = orientation.clone();
  }

  function release(id, throwObject = true) {
    const held = hand.get(id);
    if (!held) return false;
    hand.delete(id);
    const { prop } = held;
    prop.held = false;
    if (prop.pull) return true;
    const velocity = throwObject ? prop.throw.clone() : new CANNON.Vec3();
    prop.body.velocity.copy(velocity);
    releaseDynamic(prop.body, { maxLinearSpeed: 5.5 });
    if (prop.soft) {
      prop.soft.held = false;
      for (const member of prop.soft.parts) member.body.allowSleep = true;
    }
    return true;
  }

  function recover(prop) {
    if (!prop?.active || prop.held || prop.soft?.held) return;
    for (const part of prop.soft?.parts ?? [prop]) resetPropPose(part);
  }

  function resetPropPose(prop) {
    const { body, pose } = prop;
    body.position.set(...pose.position);
    body.quaternion.set(...pose.rotation);
    body.velocity.setZero();
    body.angularVelocity.setZero();
    body.aabbNeedsUpdate = true;
    if (prop.def.isKinematic) {
      body.type = types.STATIC;
      body.mass = 0;
      body.updateMassProperties();
    }
    body.wakeUp();
    setPose(prop.object, body.position, body.quaternion);
  }

  function pushDoor(point, previous) {
    doorObject.updateWorldMatrix(true, false);
    const here = doorObject.worldToLocal(point.clone());
    const before = doorObject.worldToLocal(previous.clone());
    if (Math.abs(here.z) > .11 || Math.abs(before.z) > .19 || here.x < .03 ||
      here.x > .87 || here.y < 0 || here.y > 2.12) return;
    const toward = here.z - before.z;
    if (toward * before.z >= 0 || (!unlatched && toward <= 0)) return;
    unlatched = true;
    doorVelocity = THREE.MathUtils.clamp(doorVelocity + toward * here.x * 45, -2.6, 2.6);
  }

  const contacts = createSolidContact(world);
  const garments = (data.garments ?? []).map(spec => {
    const group = props.get(spec.core).soft;
    const missing = [avatarBody, ...handBodies.values(), ...group.parts.map(part => part.body)];
    const excluded = new Set(missing);
    return createGarment(spec, spec.bones.map(node), (from, to) => contacts.particle(from, to, excluded));
  });

  function fracture(prop) {
    const { point, normal, impact } = prop.willBreak;
    const local = prop.body.vectorToLocalFrame(point);
    const face = prop.body.vectorToLocalFrame(normal);
    const angle = Math.atan2(local.z - face.z * .028, local.x - face.x * .028);
    const band = Math.floor(((angle * 180 / Math.PI + 380) % 360) / 60);
    const pattern = prop.def.fractures[(band + Number(impact > prop.def.breakSpeed * 1.65)) % prop.def.fractures.length];
    for (const fragment of pattern) {
      const object = node(fragment.id);
      worldRoot.attach(object);
      const body = bodyAt(fragment, poseOf(object));
      if (!body) continue;
      object.visible = true;
      const outward = body.position.vsub(prop.body.position.vadd(point)).unit();
      body.velocity.copy(outward.scale(Math.min(impact * .46, 2.4)).vadd(normal.scale(.42)));
      body.angularVelocity.copy(outward.cross(normal).scale(10));
      fragments.push({ object, body });
    }
    prop.object.visible = false;
    prop.active = false;
    world.removeBody(prop.body);
    event('break');
  }

  const station = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(...data.station.position), new THREE.Vector3(...data.station.shape.size));
  let stationChoice = 0;
  let frogLaunch = null;

  function step() {
    if (frogLaunch && --frogLaunch.frames <= 0) {
      const { frog, x, z } = frogLaunch;
      if (!frog.held) { frog.body.velocity.x = x; frog.body.velocity.z = z; }
      frogLaunch = null;
    }
    for (const held of hand.values()) {
      const { prop } = held;
      if (prop.pull) {
        const { pull } = prop;
        const along = held.point.clone().sub(held.start).dot(pull.axis);
        if (pull.tray) {
          if (held.openAt === undefined) held.openAt = pull.tray.motion;
          pull.tray.target = THREE.MathUtils.clamp(held.openAt + along, 0, pull.def.Travel);
        } else {
          pull.motion = THREE.MathUtils.clamp(along, 0, pull.def.Travel);
          if (pull.motion > pull.def.Travel * .62 && !held.fired) {
            held.fired = true;
            triggerPull(prop);
          }
          if (pull.def.id === data.door.handle && unlatched) {
            doorVelocity = THREE.MathUtils.clamp(doorVelocity + (held.point.z - held.start.z) * .34, -2.3, 2.3);
          }
        }
        continue;
      }
      const target = held.fixedPosition ?? held.offset.clone().applyQuaternion(held.orientation).add(held.point);
      const ideal = held.fixedOrientation ?? held.orientation.clone().multiply(held.rotation);
      const excluded = new Set([avatarBody, ...handBodies.values(), prop.body, ...(prop.soft?.parts.map(part => part.body) ?? [])]);
      const { next, rotation: desired } = contacts.motion(prop.body, target, ideal, excluded);
      const to = (current, next) => (next - current) / fixedStep;
      prop.body.velocity.set(to(prop.body.position.x, next.x), to(prop.body.position.y, next.y), to(prop.body.position.z, next.z));
      if (prop.body.velocity.length() > 5.5) prop.body.velocity.scale(5.5 / prop.body.velocity.length(), prop.body.velocity);
      prop.body.angularVelocity.setZero();
      prop.body.quaternion.set(desired.x, desired.y, desired.z, desired.w);
      prop.throw.scale(.69, prop.throw);
      prop.throw.vadd(prop.body.velocity.scale(.31), prop.throw);
    }

    for (const prop of props.values()) {
      if (!prop.pull) continue;
      const { pull } = prop;
      const tray = pull.tray;
      const base = new THREE.Vector3(...prop.pose.position);
      if (!tray) {
        if (!prop.held) pull.motion = Math.max(0, pull.motion - fixedStep * .65);
        if (pull.def.id === data.door.handle) continue;
        const target = base.addScaledVector(pull.axis, pull.motion);
        prop.body.position.copy(v(target.toArray()));
        prop.body.aabbNeedsUpdate = true;
        if (pull.cable) {
          const positions = pull.cable.geometry.attributes.position;
          positions.setXYZ(1, target.x, target.y, target.z);
          positions.needsUpdate = true;
          pull.cable.geometry.computeBoundingSphere();
        }
        continue;
      }
      const left = tray.target - tray.motion;
      const acceleration = 2.15;
      const speed = Math.sign(left) * Math.min(.65, Math.sqrt(2 * acceleration * Math.abs(left)));
      tray.speed += THREE.MathUtils.clamp(speed - tray.speed, -acceleration * fixedStep, acceleration * fixedStep);
      let next = tray.motion + tray.speed * fixedStep;
      if ((tray.target - next) * left <= 0) { next = tray.target; tray.speed = 0; }
      const rate = (next - tray.motion) / fixedStep;
      tray.motion = next;
      const velocity = pull.axis.clone().multiplyScalar(rate);
      tray.body.velocity.set(velocity.x, velocity.y, velocity.z);
      if (next < .055) tray.fired = false;
      if (next > .18 && !tray.fired) {
        tray.fired = true;
        const frog = props.get(tray.def.frog);
        if (frog && !frog.held && frog.body.position.distanceTo(tray.body.position) < .37) {
          frog.body.wakeUp();
          const eye = viewer();
          const origin = frog.body.position;
          const vertical = eye ? THREE.MathUtils.clamp(Math.sqrt(2 * 9.81 * Math.max(.9, eye.y + .22 - origin.y)), 4.8, 6.2) : 5.1;
          const flight = vertical / 9.81 - .045;
          const aim = eye
            ? new THREE.Vector3(eye.x - origin.x, 0, eye.z - origin.z).multiplyScalar(1 / flight)
            : pull.axis.clone().multiplyScalar(1.25);
          aim.clampLength(0, 3.3);
          frog.body.velocity.set(0, vertical, 0);
          frog.body.angularVelocity.set(-3, 2, 1);
          frogLaunch = { frog, frames: 6, x: aim.x, z: aim.z };
          event('frog', frog.object);
        }
        event('drawer');
      }
    }

    const before = doorAngle;
    doorAngle = THREE.MathUtils.clamp(doorAngle + doorVelocity * fixedStep, 0, 1.64);
    doorVelocity *= .987;
    if (before < .56 && doorAngle >= .56) event('door');
    const facing = doorBase.clone().multiply(new THREE.Quaternion().setFromAxisAngle(doorAxis, -doorAngle));
    doorBody.quaternion.set(facing.x, facing.y, facing.z, facing.w);
    doorBody.aabbNeedsUpdate = true;

    bendSoftItems();
    world.step(fixedStep);
    for (const prop of props.values()) {
      if (!prop.active) continue;
      if (prop.willBreak) {
        setPose(prop.object, prop.body.position, prop.body.quaternion);
        fracture(prop);
        continue;
      }
      const { position } = prop.body;
      if (position.y < -.68 || Math.abs(position.x) > 5 || Math.abs(position.z) > 5) recover(prop);
      if (prop.def.PreparationItem > 0 && station.containsPoint(tmpPos.set(position.x, position.y, position.z)) &&
        prop.def.PreparationItem !== stationChoice) {
        stationChoice = prop.def.PreparationItem;
        event('prep', stationChoice);
      }
    }
    if (stationChoice && !Array.from(props.values()).some(prop => prop.def.PreparationItem === stationChoice &&
      station.containsPoint(tmpPos.set(prop.body.position.x, prop.body.position.y, prop.body.position.z)))) stationChoice = 0;
  }

  function tick(delta) {
    accumulated += Math.min(delta, .05);
    while (accumulated >= fixedStep) { step(); accumulated -= fixedStep; }
    setPose(doorObject, doorBody.position, doorBody.quaternion);
    for (const tray of trays.values()) {
      setPose(tray.object, tray.body.position, tray.body.quaternion);
      if (!tray.handle) continue;
      const { object, body } = tray.handle;
      const position = object.getWorldPosition(tmpPos);
      const rotation = object.getWorldQuaternion(tmpRot);
      body.position.set(position.x, position.y, position.z);
      body.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    }
    for (const prop of [...props.values(), ...fragments]) {
      if (prop.active === false || prop.pull?.tray || prop.def?.id === data.door.handle) continue;
      setPose(prop.object, prop.body.position, prop.body.quaternion);
    }
    const handle = props.get(data.door.handle);
    if (handle) {
      const pos = handle.object.getWorldPosition(tmpPos);
      handle.body.position.set(pos.x, pos.y, pos.z);
      handle.body.aabbNeedsUpdate = true;
    }
    for (const garment of garments) garment.tick(delta);
  }

  function gripAt(prop, point) {
    const parts = prop.soft?.parts;
    if (!parts) return prop;
    let nearest = prop;
    let distance = Infinity;
    for (const part of parts) {
      if (!part.active || part.held) continue;
      const center = part.object.getWorldPosition(tmpPos);
      const separation = center.distanceToSquared(point);
      if (separation >= distance) continue;
      distance = separation;
      nearest = part;
    }
    return nearest;
  }

  function nearest(point, radius = .12) {
    let best;
    let distance = radius;
    for (const prop of props.values()) {
      if (!prop.active || prop.held || prop.soft?.held || !prop.object.visible) continue;
      const at = prop.object.getWorldPosition(tmpPos);
      const range = Math.min(.16, Math.max(...prop.def.shapes[0].size) * .44);
      const gap = Math.max(0, point.distanceTo(at) - range);
      if (gap <= distance) { best = prop; distance = gap; }
    }
    return best;
  }

  return { world, props, trays, fragments, hand, tick, grab, updateGrab, fixGrip, release, click, gripAt, nearest, recover, pushDoor, doorObject, playerObstacles, movePlayer, moveHands };
}
