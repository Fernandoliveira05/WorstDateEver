import * as CANNON from 'cannon-es';
import { createPhysicsWorld, makeKinematic, releaseDynamic } from './physics-world.mjs';
import { softMaterial } from './bedroom-soft-materials.js';
import { createSolidContact } from './bedroom-solid-contact.js';
import { objectGrip, gripSurface } from './grip-pose.mjs';
import { createPullCord } from './bedroom-cord.js';
import { buildKeyboard } from './bedroom-keyboard.js';
import { extractFurniture } from './bedroom-furniture.js';
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

  const movable = extractFurniture(THREE, worldRoot, node(data.monitor));
  const monitorMoves = movable.some(({ def }) => def.id === 'desk-monitor');
  const staticColliders = data.colliders.filter(({ position }) =>
    !monitorMoves || Math.abs(position[0] - .87) > .002 ||
    Math.abs(position[1] - 1.205) > .002 || Math.abs(position[2] - 3.002) > .002);
  staticColliders.push({
    position: [1.58, 1, -2.01], rotation: [0, 0, 0, 1],
    shape: { position: [0, 0, 0], rotation: [0, 0, 0, 1], size: [.82, 2, .33], friction: .52, bounce: .03 }
  });
  const furnishings = staticColliders
    .map(collider => bodyAt({ shapes: [collider.shape] }, collider, types.STATIC)).filter(Boolean);

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
  const fixedObstacles = obstacleBoxes(furnishings);
  const playerObstacles = () => [
    ...fixedObstacles,
    ...obstacleBoxes([doorBody, ...[...trays.values()].map(tray => tray.body),
      ...movable.map(({ def }) => props.get(def.id)).filter(prop => !prop.held).map(prop => prop.body)])
  ];
  for (const { def, object } of [...data.props.map(def => ({ def, object: node(def.id) })), ...movable]) {
    if (!object || !def.shapes.length) continue;
    const pose = poseOf(object);
    const prop = { def, object, pose,
      body: bodyAt(def, pose, def.isKinematic ? types.STATIC : types.DYNAMIC),
      lastHeld: new THREE.Vector3(), throw: new CANNON.Vec3(), active: !def.startsHidden
    };
    // The ceramic export has a collider for the mug body, plus a separate
    // rendered handle. Include the handle so side grabs and fingers can find it.
    const handle = def.fractures && object.children.find(child => /^Alça[ _]curva/.test(child.name));
    if (handle?.isMesh) {
      handle.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3();
      const point = new THREE.Vector3();
      const vertices = handle.geometry.attributes.position;
      const inverse = new THREE.Quaternion(...pose.rotation).invert();
      const origin = new THREE.Vector3(...pose.position);
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(handle.matrixWorld);
        bounds.expandByPoint(point.sub(origin).applyQuaternion(inverse));
      }
      const center = bounds.getCenter(new THREE.Vector3());
      const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
      if (!bounds.isEmpty()) {
        const shape = new CANNON.Box(v(half.toArray()));
        shape.material = prop.body.material;
        prop.body.addShape(shape, v(center.toArray()));
        prop.body.updateMassProperties();
      }
    }
    if (!prop.active) {
      world.removeBody(prop.body);
      object.visible = false;
    }
    prop.body.sleepSpeedLimit = .14;
    prop.body.sleepTimeLimit = .45;
    props.set(def.id, prop);
    if (def.id === data.phone.id) prop.body.addEventListener('collide', ({ contact }) => {
      const speed = Math.abs(contact.getImpactVelocityAlongNormal());
      if (speed > .85) event('phone-impact', speed);
    });
    object.traverse(child => { if (child.isMesh) child.userData.prop = prop; });
    if (def.name === 'Teclado') {
      prop.keyboard = buildKeyboard(THREE, object);
      for (const key of prop.keyboard) {
        key.mesh.userData.key = key;
        key.mesh.userData.prop = prop;
      }
      prop.body.addEventListener('collide', ({ contact }) => {
        if (prop.body.type !== types.DYNAMIC) return;
        const speed = Math.abs(contact.getImpactVelocityAlongNormal());
        if (speed < 3.9 || speed <= (prop.keyboardImpact?.speed ?? 0)) return;
        prop.keyboardImpact = { speed, point: (contact.bi === prop.body ? contact.ri : contact.rj).clone() };
      });
    }
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
  let doorOpened = false;
  let doorVelocity = 0;
  let unlatched = false;
  let doorAvailable = true;

  const lever = props.get(data.door.handle);
  const leverRest = lever?.object.position.clone();
  const leverPivot = leverRest?.clone().add(new THREE.Vector3(.05, 0, 0));
  if (lever && lever.object.parent === doorObject) {
    const rearOffset = .18;
    const front = lever.object.children.find(mesh => mesh.isMesh);
    if (front) {
      const rear = new THREE.Mesh(front.geometry, front.material);
      rear.position.copy(front.position).add(new THREE.Vector3(0, 0, rearOffset));
      rear.quaternion.copy(front.quaternion);
      rear.scale.copy(front.scale);
      rear.castShadow = rear.receiveShadow = true;
      rear.userData.prop = lever;
      lever.object.add(rear);
      const box = lever.body.shapes[0];
      lever.body.addShape(new CANNON.Box(box.halfExtents.clone()), new CANNON.Vec3(0, 0, rearOffset));
    }
    const originalPlate = doorObject.children.find(mesh => mesh.isMesh && /^Espelho[ _]de[ _]metal/.test(mesh.name));
    if (originalPlate) {
      const rearPlate = new THREE.Mesh(originalPlate.geometry, originalPlate.material);
      rearPlate.position.copy(originalPlate.position);
      rearPlate.position.z += .09;
      rearPlate.quaternion.copy(originalPlate.quaternion);
      rearPlate.scale.copy(originalPlate.scale);
      rearPlate.castShadow = rearPlate.receiveShadow = true;
      doorObject.add(rearPlate);
    }
  }

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
      const cord = createPullCord(THREE, new THREE.Vector3(...def.cord), new THREE.Vector3(...prop.pose.position));
      worldRoot.add(cord.line);
      prop.pull.cord = cord;
    }
  }

  const cords = [...props.values()].filter(prop => prop.pull?.cord);
  function hitCord(from, to, seconds) {
    return cords.some(prop => !prop.held && prop.pull.cord.hit(from, to, seconds));
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
      pull.motion = Math.max(pull.motion, pull.def.Travel * .78);
      event('latch', new THREE.Vector3().copy(prop.body.position));
      if (!doorAvailable) { event('door-locked'); return; }
      unlatched = true;
      doorVelocity = doorOpened ? -2.56 : 2.56;
    } else if (pull.def.cord) event('fan');
  }

  function outsideDrawer(prop, point) {
    if (!prop.pull?.tray) return true;
    const center = new THREE.Vector3().copy(prop.body.position);
    return point.clone().sub(center).dot(prop.pull.axis) >= -.001;
  }

  function canReach(prop, from, point) {
    if (!outsideDrawer(prop, from)) return false;
    const ignored = new Set(prop.soft?.parts.map(part => part.body) ?? [prop.body]);
    return contacts.particle(from, point, ignored).distanceToSquared(point) <= .028 ** 2;
  }

  function click(prop, from) {
    if (!prop?.pull || (from && !outsideDrawer(prop, from))) return false;
    const { pull } = prop;
    if (pull.tray) pull.tray.target = pull.tray.target > 0 ? 0 : pull.def.Travel;
    else triggerPull(prop);
    return true;
  }

  function gripKind(prop) {
    if (prop.def.fractures) return prop.def.shapes[0].size[1] < .045 ? 'plate' : 'mug';
    if (prop.def.heavy) return 'power';
    if (prop.pull || Math.min(...prop.def.shapes[0].size) < .038) return 'pinch';
    return 'wrap';
  }

  function grab(id, location, orientation, prop, { contact = location, from = location, remote = false } = {}) {
    if (!prop?.active || hand.has(id) || prop.soft?.held || !outsideDrawer(prop, from)) return false;
    const kind = gripKind(prop);
    if (prop.held && (kind !== 'plate' || remote || hand.get(prop.held)?.remote)) return false;
    const orient = orientation.clone().invert();
    const pos = new THREE.Vector3().copy(prop.body.position);
    const rot = new THREE.Quaternion().copy(prop.body.quaternion);
    const side = id.endsWith('left') ? 'left' : 'right';
    const facing = prop.pull?.tray ? prop.pull.axis : null;
    const anchorProbe = facing ? pos.clone().addScaledVector(facing, .15) : contact;
    const basis = orientation.clone();
    if (facing) {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(basis);
      basis.premultiply(new THREE.Quaternion().setFromUnitVectors(forward, facing.clone().negate()));
    }
    const grip = objectGrip(THREE, prop.body, kind, anchorProbe, basis, side);
    const held = { prop, start: location.clone(), point: location.clone(), orientation: orientation.clone(),
      offset: pos.clone().sub(location).applyQuaternion(orient), rotation: orient.clone().multiply(rot), grip, remote };
    if (prop.held) {
      const other = hand.get(prop.held);
      if (!other || other.grip.anchor.distanceTo(grip.anchor) < .09 ||
        [...hand.values()].filter(item => item.prop === prop).length > 1) return false;
      held.support = true;
      hand.set(id, held);
      return true;
    }
    if (!prop.pull && prop.def.id !== data.phone.id) {
      const anchor = grip.anchor.clone().applyQuaternion(rot).add(pos);
      const correction = contact.clone().sub(anchor).clampLength(0, .055);
      held.gripOffset = held.offset.clone().add(correction.applyQuaternion(orient));
    }
    prop.lastHeld.copy(pos);
    prop.throw.setZero();
    prop.held = id;
    if (outfits.has(prop.def.id)) event('outfit', outfits.get(prop.def.id));
    if (prop.pull?.cord) held.cordStart = pos.clone();
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

  function handOnObject(id, pose) {
    const held = hand.get(id);
    if (!held || held.remote) return pose;
    const { prop, grip } = held;
    const rotation = new THREE.Quaternion().copy(prop.body.quaternion);
    const position = new THREE.Vector3().copy(prop.body.position);
    if (prop.def.id === data.phone.id && held.fixedOrientation) {
      const correction = rotation.multiply(held.fixedOrientation.clone().invert());
      const wrist = pose.position.clone().sub(held.fixedPosition).applyQuaternion(correction).add(position);
      const reached = wrist.distanceToSquared(pose.position) <= .27 ** 2;
      return reached ? { ...pose, heldBody: prop.body, preset: 'phone',
        position: wrist, orientation: correction.multiply(held.phoneBasis) } : pose;
    }
    const wrist = grip.position.clone().applyQuaternion(rotation).add(position);
    return wrist.distanceToSquared(pose.position) <= .19 ** 2 ? { ...pose, heldBody: prop.body, preset: grip.profile,
      position: wrist, orientation: rotation.multiply(grip.orientation) } : pose;
  }

  function rayTarget(id) {
    const held = hand.get(id);
    if (!held?.remote) return null;
    const body = held.prop.body;
    return held.grip.anchor.clone().applyQuaternion(new THREE.Quaternion().copy(body.quaternion)).add(body.position);
  }

  function updateGrab(id, point, orientation) {
    const held = hand.get(id);
    if (!held) return;
    held.point.copy(point);
    held.orientation.copy(orientation);
  }

  function fixGrip(id, position, orientation, basis) {
    const held = hand.get(id);
    if (!held || held.remote || held.prop.def.id !== data.phone.id) return;
    held.fixedPosition = position.clone();
    held.fixedOrientation = orientation.clone();
    held.phoneBasis = basis?.clone() ?? orientation.clone();
  }

  function release(id, throwObject = true) {
    const held = hand.get(id);
    if (!held) return false;
    hand.delete(id);
    const { prop } = held;
    if (held.support) return true;
    const next = [...hand.entries()].find(([, item]) => item.prop === prop);
    if (next) {
      const [owner, replacement] = next;
      const inverse = replacement.orientation.clone().invert();
      replacement.support = false;
      replacement.offset.copy(prop.body.position).sub(replacement.point).applyQuaternion(inverse);
      replacement.rotation.copy(inverse.multiply(new THREE.Quaternion().copy(prop.body.quaternion)));
      prop.held = owner;
      return true;
    }
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

  function setPropActive(prop, active) {
    if (!prop || prop.active === active) return;
    if (active) {
      world.addBody(prop.body);
      resetPropPose(prop);
    } else {
      if (prop.held) release(prop.held, false);
      world.removeBody(prop.body);
    }
    prop.active = prop.object.visible = active;
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

  function bumpProp(from, to, seconds, radius, now) {
    const motion = to.clone().sub(from);
    const travel = motion.length();
    if (travel < .003 || travel > .12) return null;
    const samples = Math.max(1, Math.ceil(travel / (.65 * radius)));
    let firstHit;
    for (const prop of props.values()) {
      const { body } = prop;
      if (!prop.active || prop.held || prop.soft?.held || body.type !== types.DYNAMIC || !prop.object.visible) continue;
      if (body.position.distanceTo(from) > body.boundingRadius + radius + travel) continue;
      const surface = gripSurface(THREE, body);
      const initial = surface(from);
      for (let i = 1; i <= samples; i++) {
        const time = i / samples;
        if (firstHit && time >= firstHit.time) break;
        const point = from.clone().lerp(to, time);
        const depth = surface(point);
        if (depth > radius || depth >= initial - .001) continue;
        const normal = new THREE.Vector3();
        for (let axis = 0; axis < 3; axis++) {
          const offset = new THREE.Vector3().setComponent(axis, .002);
          normal.setComponent(axis, surface(point.clone().add(offset)) - surface(point.clone().sub(offset)));
        }
        if (normal.lengthSq() <= 1e-10) continue;
        normal.normalize();
        if (motion.dot(normal) >= -.001) continue;
        firstHit = { prop, point, normal, depth, time, surface };
        break;
      }
    }
    if (!firstHit) return null;
    const { prop, point, normal, depth, surface } = firstHit;
    const { body } = prop;
    if (now - (prop.lastHandImpact ?? -Infinity) >= .085) {
      const normalSpeed = -motion.dot(normal) / Math.max(.012, seconds);
      const strength = Math.min(.63, normalSpeed * Math.min(.62, body.mass) * .54);
      const contact = point.clone().addScaledVector(normal, -depth).sub(body.position);
      body.applyImpulse(v(normal.clone().multiplyScalar(-strength).toArray()), v(contact.toArray()));
      prop.lastHandImpact = now;
    }
    return to.clone().addScaledVector(normal, THREE.MathUtils.clamp(radius - surface(to), 0, .05));
  }

  const doorSightRay = new THREE.Ray();
  const doorSightHit = new THREE.Vector3();
  const sightBounds = new THREE.Box3().setFromCenterAndSize(
    new THREE.Vector3(...data.door.shapes[0].position),
    new THREE.Vector3(...data.door.shapes[0].size).addScalar(.018));
  function setDoorAvailable(enabled) {
    doorAvailable = enabled;
    if (!enabled) { unlatched = false; doorVelocity = 0; }
  }

  function doorBlocks(from, to) {
    if (!doorAvailable) return true;
    const plane = doorBody.position.z;
    if (from.z < plane && to.z > plane) {
      doorSightHit.copy(from).lerp(to, (plane - from.z) / (to.z - from.z));
      const [x, y] = data.door.shapes[0].position;
      const [w, h] = data.door.shapes[0].size;
      if (Math.abs(doorSightHit.x - doorBody.position.x - x) > w / 2 ||
          Math.abs(doorSightHit.y - doorBody.position.y - y) > h / 2) return true;
    }
    doorObject.updateWorldMatrix(true, false);
    doorObject.worldToLocal(doorSightRay.origin.copy(from));
    doorObject.worldToLocal(doorSightRay.direction.copy(to)).sub(doorSightRay.origin);
    const range = doorSightRay.direction.length();
    doorSightRay.direction.normalize();
    const hit = doorSightRay.intersectBox(sightBounds, doorSightHit);
    return Boolean(hit && hit.distanceToSquared(doorSightRay.origin) < range * range);
  }

  function pushDoor(point, previous, radius = .028, sustained = false) {
    if (!sustained && previous.distanceToSquared(point) > .15 ** 2) return null;
    doorObject.updateWorldMatrix(true, false);
    const here = doorObject.worldToLocal(point.clone());
    const before = doorObject.worldToLocal(previous.clone());
    const [centerX, centerY, mid] = data.door.shapes[0].position;
    const [width, height, thickness] = data.door.shapes[0].size;
    const side = before.z < mid ? -1 : 1;
    const face = mid + side * (thickness / 2 + radius);
    const toward = here.z - before.z;
    if ((here.z - face) * side >= 0 || toward * side > .001 ||
        (!sustained && Math.abs(here.z - mid) > .17)) return null;
    const t = Math.abs(toward) > 1e-5 ? THREE.MathUtils.clamp((face - before.z) / toward, 0, 1) : 1;
    const contact = before.clone().lerp(here, t);
    if (Math.abs(contact.x - centerX) > width / 2 + radius * .3 ||
        Math.abs(contact.y - centerY) > height / 2 + radius * .3) return null;
    if (unlatched && toward * side < -.002) {
      const leverage = THREE.MathUtils.clamp(contact.x / width, .05, 1);
      doorVelocity = THREE.MathUtils.clamp(doorVelocity + toward * leverage * 28, -2.85, 2.85);
    }
    return doorObject.localToWorld(here.setZ(face));
  }

  const contacts = createSolidContact(world);
  const garments = (data.garments ?? []).map(spec => {
    const group = props.get(spec.core).soft;
    const missing = group.parts.map(part => part.body);
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
    event('break', { impact, position: new THREE.Vector3().copy(prop.body.position) });
  }

  function loose(object, size, mass, velocity, onImpact, offset = [0, 0, 0], sphere = false) {
    worldRoot.attach(object);
    const config = { mass, shapes: [{ size, position: offset,
      rotation: [0, 0, 0, 1], friction: .45, bounce: .18, sphere }] };
    const body = bodyAt(config, poseOf(object));
    body.velocity.copy(velocity);
    const part = { object, body };
    if (onImpact) body.addEventListener('collide', ({ contact }) => {
      const speed = Math.abs(contact.getImpactVelocityAlongNormal());
      if (speed > 1.05) part.impact = Math.max(part.impact ?? 0, speed);
    });
    part.onImpact = onImpact;
    fragments.push(part);
    return body;
  }

  function dropFrame(item, velocity) {
    const { frame, w, h } = item;
    const normal = frame.getWorldDirection(new THREE.Vector3());
    const rebound = Math.max(.33, Math.abs(velocity.dot(normal)) * .32);
    const tangent = velocity.clone().addScaledVector(normal, -velocity.dot(normal)).multiplyScalar(.24);
    const fall = v(normal.multiplyScalar(rebound).add(tangent).setY(-.44).toArray());
    const body = loose(frame, [w + .035, h + .055, .045], .31, fall, impact => {
      setPose(frame, body.position, body.quaternion);
      const position = frame.getWorldPosition(new THREE.Vector3());
      for (const [index, { mesh, size }] of item.parts.entries()) {
        const shard = loose(mesh, size, .045, new CANNON.Vec3((index - 1.5) * .39, .46, .27));
        shard.angularVelocity.set(2 + index, 1, 3 - index);
      }
      item.pane.visible = false;
      for (let i = 0; i < 9; i++) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(-.018, -.011, 0), new THREE.Vector3(.026, -.008, 0),
          new THREE.Vector3(-.009, .032, 0)
        ]);
        geometry.computeVertexNormals();
        const material = item.pane.material.clone();
        material.side = THREE.DoubleSide;
        material.opacity = .65;
        const glass = new THREE.Mesh(geometry, material);
        const theta = i * 2.4;
        glass.position.set(Math.sin(theta) * w * .32, -.025 - h / 2 + Math.cos(theta) * h * .34, .016);
        glass.rotation.z = theta;
        frame.add(glass);
        const shard = loose(glass, [.047, .046, .008], .007,
          new CANNON.Vec3(Math.cos(theta) * impact * .34, .45 + i * .055, Math.sin(theta) * impact * .34));
        shard.angularVelocity.set(4, i - 4, 6);
      }
      frame.removeFromParent();
      event('break', { impact, position });
    }, [0, -.025 - h / 2, 0]);
    body.angularVelocity.set(-2.1, .65, item.swing + 1.2);
  }

  function splitKeyboard(prop) {
    const { object, body, keyboard, keyboardImpact: { speed, point } } = prop;
    setPose(object, body.position, body.quaternion);
    const contact = new THREE.Vector3().copy(body.vectorToLocalFrame(point));
    const halves = [-1, 1].map(sign => {
      const half = new THREE.Group();
      object.add(half);
      half.position.set(sign * .091, -.002, 0);
      const model = object.children.find(child => child.isMesh && /^Modelo/.test(child.name));
      const material = model?.material ?? keyboard[0]?.mesh.material;
      const shell = new THREE.Mesh(new THREE.BoxGeometry(.174, .022, .122), material);
      shell.castShadow = shell.receiveShadow = true;
      half.add(shell);
      return half;
    });
    object.updateWorldMatrix(true, true);
    // The chassis decelerates most sharply at the contact; the impulse
    // attenuates across the deck, leaving the quieter keys attached.
    const keys = keyboard.map(key => ({
      ...key, load: speed / (1 + key.mesh.position.distanceTo(contact) * 22)
    }));
    const cutoff = Math.max(1.30, speed * .27);
    for (const { mesh, load, size } of keys) {
      const side = mesh.position.x < 0 ? 0 : 1;
      if (load < cutoff) { halves[side].attach(mesh); continue; }
      const away = mesh.position.clone().sub(contact).normalize();
      const key = loose(mesh, size, .004, new CANNON.Vec3(away.x * load * .5, .4 + load * .22, away.z * load * .5));
      key.angularVelocity.set(6, side ? 7 : -7, load * 2);
    }
    for (const [index, half] of halves.entries()) {
      const velocity = body.velocity.clone();
      velocity.x += index ? .62 : -.62;
      velocity.y = Math.max(.24, velocity.y);
      loose(half, [.174, .027, .122], prop.def.mass / 2, velocity).angularVelocity.set(2.1, 0, index ? 4 : -4);
    }
    prop.active = false;
    object.visible = false;
    world.removeBody(body);
    event('keyboard-break', speed);
  }

  function pressKey(mesh) {
    const key = mesh?.userData.key;
    if (!key || !mesh.userData.prop.active) return false;
    key.pressed = .115;
    mesh.position.y = key.height - .005;
    event('key');
    return true;
  }

  const keyPoint = new THREE.Vector3();
  function tapKeyboard(from, to) {
    const keyboard = keyboardProp;
    if (!keyboard?.active || keyboard.held) return false;
    const start = keyboard.object.worldToLocal(from.clone());
    const end = keyboard.object.worldToLocal(to.clone());
    if (start.y < .023 || end.y > .023 || end.y < -.055) return false;
    keyPoint.copy(start).lerp(end, (start.y - .023) / (start.y - end.y));
    const selected = keyboard.keyboard.find(({ mesh, size }) =>
      Math.abs(mesh.position.x - keyPoint.x) <= size[0] / 2 &&
      Math.abs(mesh.position.z - keyPoint.z) <= size[2] / 2);
    return pressKey(selected?.mesh);
  }

  const keyboardProp = [...props.values()].find(prop => prop.keyboard);
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
      if (held.support) continue;
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
        }
        continue;
      }
      if (held.gripOffset) held.offset.lerp(held.gripOffset, .19);
      const target = held.fixedPosition ?? held.offset.clone().applyQuaternion(held.orientation).add(held.point);
      const ideal = held.fixedOrientation ?? held.orientation.clone().multiply(held.rotation);
      if (held.grip.profile === 'rim' || held.grip.profile === 'support') {
        const extra = [...hand.values()].find(item => item.prop === prop && item.support);
        if (extra) {
          const span = extra.grip.anchor.clone().sub(held.grip.anchor).applyQuaternion(ideal);
          const desired = extra.point.clone().sub(held.point);
          if (desired.lengthSq() > .007) {
            ideal.premultiply(new THREE.Quaternion().setFromUnitVectors(span.normalize(), desired.normalize()));
            const middle = held.grip.anchor.clone().lerp(extra.grip.anchor, .5).applyQuaternion(ideal);
            target.copy(held.point).lerp(extra.point, .5).sub(middle);
          }
        }
      }
      if (prop.def.heavy) {
        const current = new THREE.Quaternion().copy(prop.body.quaternion);
        ideal.copy(current.rotateTowards(ideal, fixedStep * 12 / Math.sqrt(prop.def.mass)));
      }
      const excluded = new Set([prop.body, ...(prop.soft?.parts.map(part => part.body) ?? [])]);
      const { next, rotation: desired } = contacts.motion(prop.body, target, ideal, excluded);
      const to = (current, next) => (next - current) / fixedStep;
      prop.body.velocity.set(to(prop.body.position.x, next.x), to(prop.body.position.y, next.y), to(prop.body.position.z, next.z));
      const maxSpeed = prop.def.heavy ? 9 / prop.def.mass : 5.5;
      if (prop.body.velocity.length() > maxSpeed)
        prop.body.velocity.scale(maxSpeed / prop.body.velocity.length(), prop.body.velocity);
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
        let target = base.addScaledVector(pull.axis, pull.motion);
        if (pull.cord) {
          const grip = hand.get(prop.held);
          const anchor = pull.cord.anchor;
          const goal = grip && grip.cordStart.clone().add(grip.point).sub(grip.start).sub(anchor)
            .clampLength(0, pull.cord.length + pull.def.Travel).add(anchor);
          target = pull.cord.step(fixedStep, goal);
        }
        prop.body.position.copy(v(target.toArray()));
        prop.body.aabbNeedsUpdate = true;
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

    if (doorAvailable) doorAngle = THREE.MathUtils.clamp(doorAngle + doorVelocity * fixedStep, 0, 1.64);
    else doorAngle = Math.max(0, doorAngle - fixedStep * 3.2);
    doorVelocity *= .987;
    if (doorAngle < .14) doorOpened = false;
    if (doorAngle < .012 && doorVelocity <= 0) unlatched = false;
    if (doorAvailable && !doorOpened && doorAngle >= .67) {
      doorOpened = true;
      event('door');
    }
    const facing = doorBase.clone().multiply(new THREE.Quaternion().setFromAxisAngle(doorAxis, -doorAngle));
    doorBody.quaternion.set(facing.x, facing.y, facing.z, facing.w);
    doorBody.aabbNeedsUpdate = true;

    bendSoftItems();
    world.step(fixedStep);
    for (const prop of props.values()) {
      if (!prop.active) continue;
      if (prop.keyboardImpact) {
        splitKeyboard(prop);
        continue;
      }
      if (prop.willBreak) {
        setPose(prop.object, prop.body.position, prop.body.quaternion);
        fracture(prop);
        continue;
      }
      const { position } = prop.body;
      if (position.y < -.68 || position.x < -12.3 || position.x > 5 || position.z < -5 || position.z > 6.5) recover(prop);
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
    for (let i = fragments.length - 1; i >= 0; i--) {
      const part = fragments[i];
      if (part.impact) {
        part.onImpact(part.impact);
        world.removeBody(part.body);
        fragments.splice(i, 1);
      } else if (part.body.position.y < -1.2) {
        world.removeBody(part.body);
        part.object.removeFromParent();
        fragments.splice(i, 1);
      }
    }
    if (keyboardProp?.active) for (const key of keyboardProp.keyboard) {
      key.pressed = Math.max(0, key.pressed - delta);
      key.mesh.position.y = key.height - key.pressed / .115 * .005;
    }
    for (const prop of [...props.values(), ...fragments]) {
      if (prop.active === false || prop.pull?.tray || prop.def?.id === data.door.handle) continue;
      setPose(prop.object, prop.body.position, prop.body.quaternion);
    }
    if (lever && lever.object.parent === doorObject) {
      const angle = .33 * lever.pull.motion / lever.pull.def.Travel;
      const axis = new THREE.Vector3(0, 0, 1);
      lever.object.rotation.z = angle;
      lever.object.position.copy(leverRest.clone().sub(leverPivot).applyAxisAngle(axis, angle).add(leverPivot));
      lever.body.position.copy(v(lever.object.getWorldPosition(tmpPos).toArray()));
      lever.body.quaternion.copy(q(lever.object.getWorldQuaternion(tmpRot).toArray()));
      lever.body.aabbNeedsUpdate = true;
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

  function nearest(point, radius = .12, palm = point) {
    let best, distance = radius;
    for (const prop of props.values()) {
      if (!prop.active || (prop.held && gripKind(prop) !== 'plate') || prop.soft?.held || !prop.object.visible) continue;
      const surface = gripSurface(THREE, prop.body);
      const gap = Math.min(surface(point), surface(palm) + .015);
      if (gap >= distance || !outsideDrawer(prop, point)) continue;
      const anchor = new THREE.Vector3().copy(prop.body.position);
      if (!canReach(prop, palm, point.clone().lerp(anchor, .28))) continue;
      best = prop;
      distance = gap;
    }
    return best;
  }

  return { world, props, trays, fragments, hand, tick, grab, updateGrab, fixGrip, handOnObject, rayTarget, release, click, gripAt, nearest, recover, setPropActive, bumpProp, pushDoor, doorBlocks, setDoorAvailable, doorObject, playerObstacles, canReach, hitCord, dropFrame, pressKey, tapKeyboard };
}
