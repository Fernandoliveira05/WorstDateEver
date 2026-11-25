import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applySurfaceTexture, bedroomPalette } from './bedroom-style.js';

export function addBedroomProps(THREE, room, data, finishes) {
  const p = bedroomPalette;
  const group = new THREE.Group();
  group.name = 'Objetos do guia do quarto';
  room.add(group);
  const objects = [], switches = [];

  const material = (color, roughness = .74, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const plum = material(p.plum), rose = material(p.rose), teal = material(p.teal);
  const dark = material(0x352531, .58);
  const brass = material(p.brass, .49, .38);
  const cream = material(p.cream);
  const weave = material(0xcc9f86, .92);
  applySurfaceTexture(weave, finishes.fabricTexture, .77);
  applySurfaceTexture(rose, finishes.fabricTexture, .41);

  function add(parent, geometry, finish, at) {
    const mesh = new THREE.Mesh(geometry, finish);
    mesh.position.fromArray(at);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.layers.enable(27);
    parent.add(mesh);
    return mesh;
  }

  function box(parent, size, at, finish, radius = .009) {
    return add(parent, new RoundedBoxGeometry(...size, 2, radius), finish, at);
  }

  function root(name, at) {
    const object = new THREE.Group();
    object.name = name;
    object.position.fromArray(at);
    group.add(object);
    return object;
  }

  const collider = (size, position) => ({ size, position, rotation: [0, 0, 0, 1], friction: .57, bounce: .07 });
  function loose(object, name, mass, shapes) {
    objects.push([object.name, object]);
    data.props.push({ id: object.name, name, mass, shapes });
  }

  function button(parent, size, pos, activate) {
    const mesh = box(parent, size, pos, brass, .005);
    mesh.userData.roomAction = activate;
    switches.push(mesh);
    return mesh;
  }

  const lamp = root('Luminária de lava', [1.557, 1.034, 3.19]);
  add(lamp, new THREE.LatheGeometry([
    [.045, 0], [.051, .01], [.035, .063], [.047, .083]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 24), plum, [0, 0, 0]);
  const glass = material(0xb4648e, .24);
  glass.transparent = true;
  glass.opacity = .60;
  glass.depthWrite = false;
  add(lamp, new THREE.CylinderGeometry(.026, .047, .205, 24), glass, [0, .181, 0]).renderOrder = 2;
  add(lamp, new THREE.CylinderGeometry(.022, .027, .045, 24), plum, [0, .302, 0]);
  const wax = material(0xec8840, .40);
  const blobs = [0, 1, 2].map((_, i) => add(lamp, new THREE.SphereGeometry(.020 - i * .004, 12, 9)
    .scale(1, 1.45, 1), wax, [.007, .093 + i * .058, .003 * i]));
  const glow = new THREE.PointLight(0xf89964, .17, .66, 2);
  glow.position.set(0, .18, -.045);
  glow.visible = false;
  lamp.add(glow);
  let glowing = false;
  button(lamp, [.033, .024, .018], [0, .026, -.043], () => {
    glowing = !glowing;
    glow.visible = glowing;
    wax.emissive.setHex(glowing ? 0xdf6028 : 0);
    wax.emissiveIntensity = glowing ? .85 : 0;
  });

  const laptop = root('Notebook dobrável', [-.43, .853, 2.795]);
  box(laptop, [.318, .026, .213], [0, .013, 0], plum, .010);
  box(laptop, [.258, .005, .091], [0, .028, .018], dark, .006);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 11; col++)
      box(laptop, [.019, .0035, .015], [-.112 + col * .0224, .032, -.012 + row * .020], cream, .0014);
  }
  box(laptop, [.089, .005, .056], [0, .029, -.065], teal, .006);
  const lid = new THREE.Group();
  lid.position.set(0, .039, .099);
  laptop.add(lid);
  box(lid, [.318, .017, .202], [0, 0, -.100], plum, .008);
  const screen = new THREE.MeshBasicMaterial({ color: 0x3e2747 });
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 360; canvas.height = 222;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#301d39'; ctx.fillRect(0, 0, 360, 222);
    ctx.fillStyle = '#c77c93'; ctx.fillRect(20, 20, 320, 8);
    ctx.fillStyle = '#f7efdf'; ctx.font = 'bold 25px system-ui';
    ctx.fillText('Notas para o encontro', 26, 66);
    ctx.font = '18px system-ui';
    ctx.fillText('Levar as chaves.', 26, 113);
    ctx.fillText('Conferir o endereço no celular.', 26, 146);
    screen.map = new THREE.CanvasTexture(canvas);
    screen.map.colorSpace = THREE.SRGBColorSpace;
    screen.color.setHex(0xffffff);
  }
  add(lid, new THREE.PlaneGeometry(.28, .166).rotateZ(Math.PI).rotateX(Math.PI / 2), screen, [0, -.010, -.10]);
  let lidTarget = 1.24;
  lid.rotation.x = lidTarget;
  button(laptop, [.042, .026, .023], [.108, .017, -.102], () => {
    lidTarget = lidTarget ? 0 : 1.24;
  });

  for (const [object, shape] of [[lamp, collider([.102, .31, .102], [0, .155, 0])],
    [laptop, collider([.318, .026, .213], [0, .013, 0])]]) {
    data.colliders.push({ position: object.position.toArray(), rotation: [0, 0, 0, 1], shape });
  }

  const wardrobe = root('Portas do armário', [1.58, .08, -1.832]);
  const doorPaint = material(p.deepTeal, .76);
  const panels = material(p.teal, .87);
  applySurfaceTexture(doorPaint, finishes.woodTexture, .55);
  applySurfaceTexture(panels, finishes.woodTexture, .51);
  const doors = [-1, 1].map(side => {
    const hinge = new THREE.Group();
    hinge.position.x = side * .394;
    wardrobe.add(hinge);
    box(hinge, [.389, 1.845, .042], [-side * .196, .928, 0], doorPaint, .015);
    box(hinge, [.310, 1.675, .025], [-side * .196, .928, .021], panels, .016);
    const door = { hinge, angle: 0 };
    const handle = button(hinge, [.039, .187, .043], [-side * .324, .917, .055], () => {
      door.angle = door.angle ? 0 : side * 1.27;
    });
    handle.rotation.y = Math.PI;
    return door;
  });
  const topBoxes = root('Caixas sobre o armário', [1.57, 2.004, -1.998]);
  for (const [x, height, finish] of [[-.18, .116, plum], [.16, .146, rose]]) {
    box(topBoxes, [.257, height, .270], [x, height / 2, 0], finish, .012);
    box(topBoxes, [.269, .028, .279], [x, height, 0], finish, .008);
    box(topBoxes, [.064, .027, .008], [x, .057, .138], brass, .004);
  }

  const basket = root('laundry-basket', [1.75, .016, -1.13]);
  box(basket, [.33, .026, .258], [0, .014, 0], rose);
  for (const side of [-1, 1]) {
    box(basket, [.378, .035, .031], [0, .276, side * .153], rose);
    box(basket, [.032, .035, .292], [side * .173, .276, 0], rose);
    for (let i = -4; i <= 4; i++) {
      const rib = box(basket, [.022, .249, .020], [i * .039, .142, side * .143], rose, .005);
      rib.rotation.x = side * .085;
    }
    for (let i = -3; i <= 3; i++) {
      const rib = box(basket, [.020, .249, .020], [side * .163, .142, i * .041], rose, .005);
      rib.rotation.z = -side * .085;
    }
  }
  for (const y of [.082, .164, .224]) {
    for (const side of [-1, 1]) {
      box(basket, [.345, .018, .018], [0, y, side * .144], rose, .006);
      box(basket, [.018, .018, .291], [side * .165, y, 0], rose, .006);
    }
  }
  box(basket, [.15, .045, .105], [-.068, .048, -.040], weave, .014);
  loose(basket, 'Cesto de roupa', .68, [
    collider([.33, .032, .258], [0, .016, 0]),
    ...[-1, 1].flatMap(side => [
      collider([.36, .279, .039], [0, .145, side * .144]),
      collider([.039, .279, .274], [side * .163, .145, 0])
    ])
  ]);

  const headphones = root('desk-headphones', [1.431, .905, 3.160]);
  const band = new THREE.TorusGeometry(.074, .009, 10, 32, Math.PI);
  add(headphones, band, plum, [0, .057, 0]);
  for (const side of [-1, 1]) {
    box(headphones, [.045, .077, .066], [side * .070, .048, 0], plum, .018);
    box(headphones, [.025, .065, .059], [side * .049, .048, 0], rose, .012);
    box(headphones, [.014, .046, .033], [side * .087, .049, 0], brass, .005);
  }
  loose(headphones, 'Fones de ouvido', .21, [
    collider([.171, .027, .029], [0, .120, 0]),
    ...[-1, 1].map(x => collider([.049, .081, .068], [x * .068, .048, 0]))
  ]);

  const bottle = root('desk-water-bottle', [.64, 1.035, 3.27]);
  add(bottle, new THREE.CylinderGeometry(.035, .039, .167, 20), teal, [0, .084, 0]);
  add(bottle, new THREE.CylinderGeometry(.023, .035, .027, 20), teal, [0, .179, 0]);
  add(bottle, new THREE.CylinderGeometry(.027, .027, .029, 20), brass, [0, .202, 0]);
  add(bottle, new THREE.CylinderGeometry(.036, .037, .033, 20), cream, [0, .111, 0]);
  loose(bottle, 'Garrafa térmica', .29, [collider([.079, .216, .079], [0, .108, 0])]);

  let previousTouch = -1;
  const axis = new THREE.Vector3();
  return {
    objects, switches,
    touch(from, to, time) {
      if (time - previousTouch < .29) return false;
      for (const mesh of switches) {
        const before = mesh.worldToLocal(from.clone()), after = mesh.worldToLocal(to.clone());
        if (before.z >= -.022 || after.z < -.022 || after.z > .053) continue;
        axis.copy(before).lerp(after, (-.022 - before.z) / (after.z - before.z));
        if (Math.abs(axis.x) > .037 || Math.abs(axis.y) > .028) continue;
        previousTouch = time;
        mesh.userData.roomAction();
        return true;
      }
      return false;
    },
    tick(delta, elapsed) {
      lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, lidTarget, 10, delta);
      for (const door of doors) door.hinge.rotation.y = THREE.MathUtils.damp(door.hinge.rotation.y, door.angle, 8, delta);
      if (glowing) blobs.forEach((blob, i) => {
        const phase = elapsed * (1 + i * .17) + i * 2.4;
        blob.position.y = .13 + i * .052 + Math.sin(phase) * .033;
        blob.position.x = Math.cos(phase * .86) * .013;
        blob.scale.y = 1 + .27 * Math.cos(phase);
      });
    }
  };
}
