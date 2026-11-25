import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TAP_DEBOUNCE_MS,
  TAP_REARM_MS,
  createTapGate,
  hitTestTapTargets,
  isPointInsideBox,
  isTapContact,
  nearestPinchTarget,
  resetTapGate,
  updateTapGate
} from '../src/phone-interaction.mjs';

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
