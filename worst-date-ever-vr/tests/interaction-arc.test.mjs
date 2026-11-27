import test from 'node:test';
import assert from 'node:assert/strict';
import { arcSlots, cardCorners, cardWidth, gazeShowsMenu } from '../src/date/interaction-arc.mjs';

test('interaction cards form a clear arc for one through ten options', () => {
  for (let count = 1; count <= 10; count++) {
    const slots = arcSlots(count);
    assert.equal(slots.length, count);
    if (count === 1) {
      assert.ok(Math.abs(slots[0].x) > cardWidth(count) / 2);
      continue;
    }
    for (let index = 1; index < count; index++)
      assert.ok(slots[index].x - slots[index - 1].x > cardWidth(count) + .035);
    assert.ok(Math.abs(slots[0].x + slots.at(-1).x) < 1e-9);
    if (count > 2) assert.ok(slots[Math.floor(count / 2)].y > slots[0].y);
    for (const slot of slots)
      if (Math.abs(slot.x) < cardWidth(count) / 2) assert.ok(slot.y > .58);
  }
});

test('the arc stays compact and gaze transitions have hysteresis', () => {
  assert.ok(Math.abs(arcSlots(6)[0].x) < 1.2);
  assert.ok(arcSlots(6)[3].y < 0.7);
  assert.equal(gazeShowsMenu(0.4, true), false);
  assert.equal(gazeShowsMenu(0.6, false), false);
  assert.equal(gazeShowsMenu(0.75, false), true);
  assert.equal(gazeShowsMenu(0.6, true), true);
});

test('card corners are stable asymmetric quadrilaterals', () => {
  const first = cardCorners('speak', .59);
  assert.deepEqual(first, cardCorners('speak', .59));
  assert.notDeepEqual(first, cardCorners('recenter', .59));
  assert.notEqual(first[0][1], first[1][1]);
  assert.notEqual(first[1][0], first[2][0]);
});
