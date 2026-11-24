import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCurtain } from '../src/bedroom-curtain.js';

test('interleaved curtain geometry stays smooth and pinned through repeated contacts', () => {
  const geometry = new THREE.PlaneGeometry(.32, .53, 10, 12);
  const original = geometry.getAttribute('position');
  const values = new Float32Array(original.count * 6);
  for (let i = 0; i < original.count; i++) {
    const x = original.getX(i);
    const y = original.getY(i);
    values.set([x, y, Math.sin(x * 60) * .018, 0, 1, 0], i * 6);
  }
  const buffer = new THREE.InterleavedBuffer(values, 6);
  geometry.setAttribute('position', new THREE.InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute('normal', new THREE.InterleavedBufferAttribute(buffer, 3, 3));
  const mesh = new THREE.Mesh(geometry);
  const cloth = createCurtain(mesh);
  const positions = mesh.geometry.getAttribute('position');
  const offsets = () => Array.from({ length: positions.count }, (_, i) => positions.getZ(i) - values[i * 6 + 2]);
  let peak = 0;
  for (let frame = 0; frame < 100; frame++) {
    cloth.touch(new THREE.Vector3(.08 * Math.sin(frame / 10), .072, .012), .6);
    cloth.tick(frame % 4 === 0 ? 1 / 30 : 1 / 72);
    const shifts = offsets();
    peak = Math.max(peak, ...shifts.map(Math.abs));
    assert.ok(shifts.every(shift => Math.abs(shift) < .03501));
    assert.ok(shifts.slice(0, 11).every(shift => shift === 0));
    for (let i = 0; i < geometry.index.count; i += 3) {
      const a = geometry.index.getX(i);
      const b = geometry.index.getX(i + 1);
      const c = geometry.index.getX(i + 2);
      assert.ok(Math.max(Math.abs(shifts[a] - shifts[b]), Math.abs(shifts[b] - shifts[c])) < .024);
    }
  }
  assert.ok(peak > .009);
  for (let frame = 0; frame < 120; frame++) cloth.tick(1 / 60);
  assert.ok(offsets().every(shift => Math.abs(shift) < .0003));
});
