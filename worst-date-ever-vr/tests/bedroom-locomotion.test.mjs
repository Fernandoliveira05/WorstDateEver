import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { walkBedroom } from '../src/bedroom-locomotion.js';

const wall = { x: 0, z: 0, hw: .08, hd: 1, ux: 1, uz: 0, minY: 0, maxY: 2.6 };
const floor = { ...wall, hw: 4, hd: 4, minY: -.2, maxY: 0 };
const player = (x, z) => new Vector3(x, 1.6, z);

test('desktop and headset locomotion sweep solid boxes without blocking the floor', () => {
  const through = walkBedroom(player(-1, .3), player(1, .3), [floor, wall], 1.6);
  assert.ok(through.x < -.24 && through.x > -.30);
  const corner = walkBedroom(player(-.7, .5), player(.8, 1.5), [floor, wall], 1.6);
  assert.ok(corner.z > 1.4 && corner.x > 0);
  assert.ok(Math.abs(walkBedroom(player(-1, 1.3), player(1, 1.3), [floor, wall], 1.6).x - 1) < 1e-8);
});

test('a closed door blocks the player and an open door clears the doorway', () => {
  const closed = { ...wall, hw: .45, hd: .035 };
  const open = { ...closed, x: .45, z: .44, ux: 0, uz: 1 };
  assert.ok(walkBedroom(player(0, -1), player(0, .4), [closed], 1.6).z < -.19);
  assert.ok(walkBedroom(player(0, -1), player(0, .4), [open], 1.6).z > .39);
});
