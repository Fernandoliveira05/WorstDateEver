import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { candies } from './candies.mjs';

export function buildCandyShop(THREE, corridor, data, at, { box, shape, interior }) {
  const machine = new THREE.Group();
  machine.name = 'Doces da madrugada';
  machine.position.fromArray(at);
  machine.rotation.y = Math.PI / 2;
  corridor.add(machine);

  const plum = interior(0x633a4d, .38);
  const ink = interior(0x271925, .30);
  const metal = interior(0xad6f42, .32);
  const glow = interior(0xffb368, .06);
  function rounded(size, position, material, radius = .02) {
    return shape(machine, new RoundedBoxGeometry(...size, 2, radius), material, position);
  }
  rounded([.93, 1.95, .57], [0, .98, -.10], plum, .049);
  rounded([.82, 1.53, .038], [0, 1.02, .207], ink);
  rounded([.72, .12, .034], [0, 1.82, .213], metal);
  rounded([.62, .16, .05], [0, .795, .26], ink);
  rounded([.62, .024, .18], [0, .710, .32], metal, .009);
  rounded([.52, .012, .128], [0, .727, .335], glow, .005);
  rounded([.62, .041, .036], [0, .731, .413], plum, .009);
  for (const x of [-.34, .34]) rounded([.018, 1.06, .028], [x, 1.175, .231], glow, .008);

  function label(width, height, x, y, text, hint = '', color = '#582f42') {
    const material = interior(0xffffff, .02);
    const mesh = shape(machine, new THREE.PlaneGeometry(width, height), material, [x, y, .258]);
    if (typeof document === 'undefined') return mesh;
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 124;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 640, 124);
    ctx.strokeStyle = '#ffca88';
    ctx.lineWidth = 4;
    ctx.strokeRect(5, 5, 630, 114);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff0cc';
    ctx.font = '750 47px system-ui';
    ctx.fillText(text, 320, hint ? 55 : 80, 592);
    if (hint) {
      ctx.font = '500 30px system-ui';
      ctx.fillText(hint, 320, 99, 595);
    }
    material.map = new THREE.CanvasTexture(canvas);
    material.map.colorSpace = THREE.SRGBColorSpace;
    return mesh;
  }
  label(.69, .137, 0, 1.824, 'Doces da madrugada', '', '#8a4433');
  label(.36, .066, 0, .910, 'Retire o doce');

  const light = new THREE.PointLight(0xffae66, 3.4, 4.7, 2);
  light.position.set(0, 1.15, .56);
  machine.add(light);
  const trayLight = new THREE.PointLight(0xff9846, .61, 1.35, 2);
  trayLight.position.set(0, .58, .41);
  machine.add(trayLight);

  const objects = [], buttons = [];
  for (const [index, [id, candy]] of Object.entries(candies).entries()) {
    const y = 1.61 - index * .187;
    rounded([.64, .141, .05], [-.032, y, .222], plum);
    const target = label(.627, .122, -.032, y, candy.name, candy.hint);
    target.userData.shopAction = id;
    buttons.push(target);

    const prop = new THREE.Group();
    prop.name = 'candy-' + id;
    prop.position.set(0, .765, .335);
    machine.add(prop);
    const wrapper = interior(candy.color, .08);
    if (id === 'morango') {
      shape(prop, new THREE.SphereGeometry(.032, 18, 12).scale(1, .92, .53), wrapper, [-.028, .007, 0]);
      box(prop, [.069, .007, .007], [.023, .003, 0], glow);
      box(prop, [.011, .014, .024], [0, .004, 0], metal);
    } else {
      shape(prop, new RoundedBoxGeometry(.069, .041, .046, 2, .012), wrapper, [0, 0, 0]);
      for (const side of [-1, 1]) {
        const end = shape(prop, new THREE.ConeGeometry(.021, .029, 5), wrapper, [side * .043, 0, 0]);
        end.rotation.z = side * Math.PI / 2;
      }
      box(prop, [.024, .043, .049], [0, 0, 0], metal);
    }
    corridor.parent.attach(prop);
    objects.push([prop.name, prop]);
    data.props.push({ id: prop.name, name: candy.name, candy: id, mass: .055, startsHidden: true,
      shapes: [{ size: [.108, .044, .048], position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .67, bounce: .1 }] });
  }

  for (const [y, height, depth, x] of [[1.15, 1.62, .56, -.11], [.235, .46, .72, -.02], [.710, .026, .18, .32]]) {
    const point = machine.localToWorld(new THREE.Vector3(0, y, x));
    data.colliders.push({ position: point.toArray(), rotation: [0, 0, 0, 1],
      shape: { size: [depth, height, .91], position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .64, bounce: .02 } });
  }

  let lastTouch = -Infinity;
  return {
    objects, buttons,
    touch(from, to, time) {
      if (time - lastTouch < .29) return null;
      for (const button of buttons) {
        const before = button.worldToLocal(from.clone()), after = button.worldToLocal(to.clone());
        if (before.z <= .018 || after.z > .018 || after.z < -.075) continue;
        const at = before.lerp(after, (before.z - .018) / (before.z - after.z));
        const geometry = button.geometry.parameters;
        if (Math.abs(at.x) > geometry.width / 2 || Math.abs(at.y) > geometry.height / 2) continue;
        lastTouch = time;
        return button.userData.shopAction;
      }
      return null;
    },
    setReduced(reduced) {
      light.intensity = reduced ? 1.25 : 3.4;
      trayLight.intensity = reduced ? .27 : .61;
    }
  };
}
