import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAP_DEBOUNCE_MS,
  TAP_REARM_MS,
  createTapGate,
  guidedPhoneButton,
  hitTestTapTargets,
  isPointInsideBox,
  isTapContact,
  nearestPinchTarget,
  phonePokeCrossing,
  resetTapGate,
  updateTapGate
} from '../src/phone-interaction.mjs';

test('a guided button holds its focus through jitter and releases between rows', () => {
  const buttons = [{ x: 24, y: 100, w: 170, h: 50 }, { x: 220, y: 100, w: 170, h: 50 }];
  assert.equal(guidedPhoneButton({ x: 202, y: 124 }, buttons), 0);
  assert.equal(guidedPhoneButton({ x: 212, y: 124 }, buttons, 0), 0);
  assert.equal(guidedPhoneButton({ x: 225, y: 124 }, buttons, 0), 1);
  assert.equal(guidedPhoneButton({ x: 225, y: 180 }, buttons, 1), -1);
});

test('a forward fingertip poke crosses the touch plane while sideways motion does not', () => {
  const before = { x: 211, y: 479, z: .024 };
  const after = { x: 213, y: 481, z: .004 };
  assert.deepEqual(phonePokeCrossing(before, after, .02), { x: 212, y: 480 });
  assert.equal(phonePokeCrossing(before, after, 0), null);
  assert.equal(phonePokeCrossing(after, before, .02), null);
  assert.equal(phonePokeCrossing(before, { ...after, z: .017 }, .01), null);
});

test('a single index contact emits one tap', () => {
  const gate = createTapGate();
  assert.equal(updateTapGate(gate, 1000, true), true);
  assert.equal(updateTapGate(gate, 1050, true), false);
  assert.equal(updateTapGate(gate, 1100, true), false);
});

test('jitter does not retrigger before the clear/rearm window', () => {
  const gate = createTapGate();
  assert.equal(updateTapGate(gate, 1000, true), true);
  assert.equal(updateTapGate(gate, 1010, false), false);
  assert.equal(updateTapGate(gate, 1020, true), false);
  assert.equal(updateTapGate(gate, 1100, false), false);
  assert.equal(updateTapGate(gate, 1120, true), false);
});

test('a fresh contact after debounce and rearm emits a second tap', () => {
  const gate = createTapGate();
  assert.equal(updateTapGate(gate, 1000, true), true);
  assert.equal(updateTapGate(gate, 1300, false), false);
  assert.equal(updateTapGate(gate, 1450, false), false);
  assert.equal(updateTapGate(gate, 1500, true), true);
  assert.equal(gate.latchedUntil, 1500 + TAP_DEBOUNCE_MS);
  assert.ok(TAP_REARM_MS < TAP_DEBOUNCE_MS);
});

test('reset opens the gate for the next grab session', () => {
  const gate = createTapGate();
  updateTapGate(gate, 1000, true);
  resetTapGate(gate);
  assert.equal(updateTapGate(gate, 1001, true), true);
});

test('screen contact is front-facing and bounded', () => {
  assert.equal(isTapContact({ x: 0, y: 0, z: 0.01 }), true);
  assert.equal(isTapContact({ x: 0.070, y: 0.120, z: 0 }), true);
  assert.equal(isTapContact({ x: 0.080, y: 0, z: 0.01 }), false);
  assert.equal(isTapContact({ x: 0, y: 0, z: -0.02 }), false);
  assert.equal(isTapContact({ x: 0, y: 0, z: 0.08 }), false);
});

test('tap targets are hit-tested topmost-first', () => {
  const lower = { x: 0, y: 0, width: 0.2, height: 0.1, id: 'lower' };
  const upper = { x: 0, y: 0, width: 0.1, height: 0.05, id: 'upper' };
  assert.equal(hitTestTapTargets(0, 0, [lower, upper]).id, 'upper');
  assert.equal(hitTestTapTargets(0.08, 0.04, [lower, upper]).id, 'lower');
  assert.equal(hitTestTapTargets(0.4, 0.4, [lower, upper]), null);
});

test('phone pickup volume supports a pinch margin', () => {
  const size = { width: 0.18, height: 0.30, depth: 0.023 };
  assert.equal(isPointInsideBox({ x: 0.09, y: 0.15, z: 0.005 }, size), true);
  assert.equal(isPointInsideBox({ x: 0.12, y: 0, z: 0 }, size, 0.04), true);
  assert.equal(isPointInsideBox({ x: 0.30, y: 0, z: 0 }, size, 0.04), false);
});

test('nearest pinch target respects radius and returns the closest one', () => {
  const point = { distanceTo(other) { return Math.hypot(other.x, other.y, other.z); } };
  const candidates = [
    { id: 'far', position: { x: 0.08, y: 0, z: 0 }, radius: 0.1 },
    { id: 'near', position: { x: 0.03, y: 0, z: 0 }, radius: 0.1 },
    { id: 'outside', position: { x: 0.3, y: 0, z: 0 }, radius: 0.1 }
  ];
  assert.equal(nearestPinchTarget(point, candidates).id, 'near');
});

test('the phone starts a date only after prep and accepts either candy choice', async t => {
  const { Group, Vector3, CanvasTexture, Mesh, PlaneGeometry, MeshBasicMaterial, SRGBColorSpace } = await import('three');
  const { createPhone } = await import('../src/bedroom-phone.js');
  const { PHASES, initialState } = await import('../src/game-machine.mjs');
  const noop = () => {};
  const context = new Proxy({
    createLinearGradient: () => ({ addColorStop: noop }),
    measureText: text => ({ width: text.length * 10 })
  }, { get: (target, key) => target[key] ?? noop });
  const globals = ['document', 'localStorage', 'Image'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  t.after(() => {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const ready = { ...initialState(), phase: PHASES.PREP, avatarGender: 'male', preference: 'all', matchId: 'caio' };
  Object.defineProperties(globalThis, {
    document: { configurable: true, value: { createElement: () => ({ getContext: () => context }) } },
    localStorage: { configurable: true, value: { getItem: () => JSON.stringify(ready), setItem: noop } },
    Image: { configurable: true, value: class {} }
  });
  const THREE = { Group, Vector3, CanvasTexture, Mesh, PlaneGeometry, MeshBasicMaterial, SRGBColorSpace };
  for (const candy of [null, 'pacoca']) {
    const departures = [];
    const phone = createPhone(THREE, new Group(), { size: [.1, .2], screen: [0, 0, 0] }, path => path,
      noop, Promise.resolve({}), state => departures.push(state));
    const tap = y => phone.touch('test', { x: 210, y, inside: true });
    tap(477);
    tap(563);
    assert.deepEqual(departures, []);
    tap(648);
    assert.equal(phone.getState().phase, PHASES.EXIT);
    if (candy) assert.equal(phone.eatCandy(candy), true);
    assert.deepEqual(departures, []);
    tap(563);
    assert.equal(departures.length, 1);
    assert.equal(departures[0].matchId, 'caio');
    assert.equal(departures[0].candy, candy);
  }
});

test('the corridor vending machine exposes only candy selection buttons', async () => {
  const THREE = await import('three');
  const { candies } = await import('../src/candies.mjs');
  const { buildCandyShop } = await import('../src/corridor-candy-shop.js');
  const room = new THREE.Group();
  const corridor = new THREE.Group();
  room.add(corridor);
  const data = { colliders: [], props: [] };
  function shape(parent, geometry, material, at) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(at);
    parent.add(mesh);
    return mesh;
  }
  const machine = buildCandyShop(THREE, corridor, data, [0, 0, 0], {
    shape,
    box: (parent, size, at, material) => shape(parent, new THREE.BoxGeometry(...size), material, at),
    interior: color => new THREE.MeshBasicMaterial({ color })
  });
  assert.deepEqual(machine.buttons.map(button => button.userData.shopAction), Object.keys(candies));
  assert.deepEqual(data.props.map(prop => prop.candy), Object.keys(candies));
});
