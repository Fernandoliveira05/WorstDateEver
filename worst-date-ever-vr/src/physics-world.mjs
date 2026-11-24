import * as CANNON from '../vendor/cannon-es/dist/cannon-es.js';

export const PHYSICS_STEP = 1 / 90;
export const MAX_SUB_STEPS = 4;

function toVec3(value, fallback = new CANNON.Vec3()) {
  if (value instanceof CANNON.Vec3) { return value.clone(); }
  if (Array.isArray(value)) { return new CANNON.Vec3(value[0], value[1], value[2]); }
  return fallback;
}

function toQuaternion(value) {
  if (value instanceof CANNON.Quaternion) { return value.clone(); }
  if (Array.isArray(value)) { return new CANNON.Quaternion(value[0], value[1], value[2], value[3]); }
  return new CANNON.Quaternion();
}

export function createPhysicsWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 12;
  world.solver.tolerance = 0.001;
  world.defaultContactMaterial.friction = 0.42;
  world.defaultContactMaterial.restitution = 0.04;
  return world;
}

export function addStaticBox(world, size, position, quaternion = null) {
  const body = new CANNON.Body({
    mass: 0,
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
    position: toVec3(position),
    quaternion: toQuaternion(quaternion)
  });
  world.addBody(body);
  return body;
}

export function addDynamicBox(world, { size, mass, position, quaternion = null, linearDamping = 0.12, angularDamping = 0.2 }) {
  const body = new CANNON.Body({
    mass,
    type: CANNON.Body.DYNAMIC,
    shape: new CANNON.Box(new CANNON.Vec3(size[0] / 2, size[1] / 2, size[2] / 2)),
    position: toVec3(position),
    quaternion: toQuaternion(quaternion),
    linearDamping,
    angularDamping
  });
  body.allowSleep = true;
  body.sleepSpeedLimit = 0.12;
  body.sleepTimeLimit = 0.7;
  body.userData = { dynamicMass: mass, size: size.slice() };
  world.addBody(body);
  return body;
}

export function makeStatic(body) {
  body.type = CANNON.Body.STATIC;
  body.mass = 0;
  body.velocity.setZero();
  body.angularVelocity.setZero();
  body.updateMassProperties();
  body.aabbNeedsUpdate = true;
  body.sleep();
}

export function makeKinematic(body) {
  body.type = CANNON.Body.KINEMATIC;
  body.mass = 0;
  body.allowSleep = false;
  body.wakeUp();
  body.updateMassProperties();
  body.aabbNeedsUpdate = true;
}

export function releaseDynamic(body, { maxLinearSpeed = 6, maxAngularSpeed = 20 } = {}) {
  body.type = CANNON.Body.DYNAMIC;
  body.mass = body.userData?.dynamicMass ?? 0.25;
  body.allowSleep = true;
  body.updateMassProperties();
  body.wakeUp();
  body.aabbNeedsUpdate = true;

  const linearSpeed = body.velocity.length();
  if (linearSpeed > maxLinearSpeed) {
    body.velocity.scale(maxLinearSpeed / linearSpeed, body.velocity);
  }
  const angularSpeed = body.angularVelocity.length();
  if (angularSpeed > maxAngularSpeed) {
    body.angularVelocity.scale(maxAngularSpeed / angularSpeed, body.angularVelocity);
  }
}

const previousQuaternion = new CANNON.Quaternion();
const inversePrevious = new CANNON.Quaternion();
const targetQuaternion = new CANNON.Quaternion();
const deltaQuaternion = new CANNON.Quaternion();

/**
 * Move a kinematic body to a world pose and derive the linear/angular
 * velocity from the pose delta. On release those derived velocities become
 * the dynamic body's throw velocity, so a toss is continuous with the hand.
 */
export function moveKinematic(body, position, quaternion, deltaSeconds) {
  const dt = Math.max(deltaSeconds, 1 / 240);
  const px = body.position.x;
  const py = body.position.y;
  const pz = body.position.z;

  previousQuaternion.copy(body.quaternion);
  body.position.set(position.x, position.y, position.z);
  targetQuaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  body.quaternion.copy(targetQuaternion);
  body.aabbNeedsUpdate = true;

  body.velocity.set((body.position.x - px) / dt, (body.position.y - py) / dt, (body.position.z - pz) / dt);

  inversePrevious.copy(previousQuaternion);
  inversePrevious.conjugate();
  deltaQuaternion.copy(targetQuaternion);
  deltaQuaternion.mult(inversePrevious, deltaQuaternion);
  if (deltaQuaternion.w < 0) {
    deltaQuaternion.set(-deltaQuaternion.x, -deltaQuaternion.y, -deltaQuaternion.z, -deltaQuaternion.w);
  }
  const sinHalf = Math.sqrt(Math.max(0, 1 - deltaQuaternion.w * deltaQuaternion.w));
  if (sinHalf > 1e-6) {
    const angle = 2 * Math.acos(Math.min(1, Math.max(-1, deltaQuaternion.w)));
    const scale = angle / (sinHalf * dt);
    body.angularVelocity.set(deltaQuaternion.x * scale, deltaQuaternion.y * scale, deltaQuaternion.z * scale);
  } else {
    body.angularVelocity.setZero();
  }
}

export function stepPhysics(world, deltaSeconds) {
  if (!(deltaSeconds > 0)) { return; }
  world.step(PHYSICS_STEP, Math.min(deltaSeconds, 0.05), MAX_SUB_STEPS);
}

export function syncObjectFromBody(body, object3D) {
  object3D.position.set(body.position.x, body.position.y, body.position.z);
  object3D.quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
  object3D.updateMatrixWorld(true);
}

export function isOutsideBounds(body, bounds) {
  const p = body.position;
  return (
    !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z) ||
    p.x < bounds.minX || p.x > bounds.maxX ||
    p.y < bounds.minY || p.y > bounds.maxY ||
    p.z < bounds.minZ || p.z > bounds.maxZ
  );
}

export function isSleeping(body) {
  return body.sleepState === CANNON.Body.SLEEPING;
}

export function buildBedroomColliders(world) {
  const room = {
    minX: -2.4,
    maxX: 2.4,
    minY: -0.2,
    maxY: 2.85,
    minZ: -3.3,
    maxZ: 2.1
  };

  addStaticBox(world, [4.9, 0.12, 5.5], [0, -0.06, -0.6]);
  addStaticBox(world, [0.1, 2.72, 5.4], [-2.45, 1.36, -0.6]);
  addStaticBox(world, [0.1, 2.72, 5.4], [2.45, 1.36, -0.6]);
  addStaticBox(world, [4.8, 2.72, 0.1], [0, 1.36, -3.35]);
  addStaticBox(world, [4.8, 2.72, 0.1], [0, 1.36, 2.15]);
  addStaticBox(world, [4.8, 0.08, 5.4], [0, 2.76, -0.6]);

  // Bed, desk top/legs, nightstand and dresser cabinet.
  addStaticBox(world, [0.72, 1.0, 1.62], [-1.87, 0.5, -1.55]);
  addStaticBox(world, [2.0, 0.07, 0.92], [0.65, 0.7525, -2.76]);
  addStaticBox(world, [0.08, 0.74, 0.58], [-0.16, 0.37, -2.76]);
  addStaticBox(world, [0.08, 0.74, 0.58], [1.46, 0.37, -2.76]);
  addStaticBox(world, [0.54, 0.57, 0.48], [0.38, 0.285, -0.52]);
  addStaticBox(world, [0.36, 1.36, 0.84], [2.2, 0.68, 0.42]);
  addStaticBox(world, [0.6, 1.2, 0.6], [0.52, 0.6, -1.92]);

  return room;
}
