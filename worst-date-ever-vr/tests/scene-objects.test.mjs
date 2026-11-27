import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import { crossesButtonFace } from '../src/scene-objects.js';

test('wardrobe handles respond across their full height as the doors rotate', () => {
  const door = new Group();
  door.position.set(1.5, .08, -1.85);
  const handle = new Mesh(new BoxGeometry(.039, .187, .043));
  handle.position.set(.324, .917, .055);
  handle.rotation.y = Math.PI;
  door.add(handle);
  for (const angle of [0, -1.27]) {
    door.rotation.y = angle;
    const contact = (x, y, from, to) =>
      crossesButtonFace(handle, handle.localToWorld(new Vector3(x, y, from)),
        handle.localToWorld(new Vector3(x, y, to)), -1);
    for (const height of [-.085, 0, .085]) assert.ok(contact(0, height, -.09, -.019));
    assert.equal(contact(0, .12, -.09, -.019), false);
    assert.equal(contact(.06, 0, -.09, -.019), false);
    assert.equal(contact(0, 0, .09, -.03), false);
  }
});
