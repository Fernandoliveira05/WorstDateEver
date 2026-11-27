import { applySurfaceTexture } from './bedroom-style.js';

export function buildNightstandAccessories(THREE, parent, { shape, box, cylinder, standard, brass, woodTexture, fabricTexture }) {
  const green = standard(0x496e69, .53, .08);
  const rose = standard(0xbb7789, .58, .04);
  const enamel = standard(0xf5e1b9, .53);
  const ink = standard(0x222025, .56);
  const vermilion = standard(0xa24c3b, .42);

  const clock = new THREE.Group();
  clock.name = 'bedside-clock';
  clock.position.set(.357, .9305, -1.858);
  clock.rotation.y = -.16;
  parent.add(clock);
  function disc(radius, depth, z, material) {
    const mesh = cylinder(clock, radius, depth, [0, .083, z], material);
    mesh.rotation.x = Math.PI / 2;
    return mesh;
  }
  disc(.077, .047, 0, rose);
  disc(.073, .011, .026, brass);
  disc(.065, .009, .031, ink);
  disc(.063, .007, .036, enamel);
  for (const x of [-.048, .048]) {
    box(clock, [.024, .012, .041], [x, .006, 0], brass);
    const bell = shape(clock, new THREE.SphereGeometry(1, 18, 12).scale(.025, .016, .021),
      brass, [x, .153, -.002]);
    bell.rotation.z = x > 0 ? -.38 : .38;
  }
  cylinder(clock, .008, .012, [0, .166, -.003], brass);
  for (let i = 0; i < 12; i++) {
    const angle = Math.PI * i / 6;
    box(clock, [i % 3 ? .0025 : .004, i % 3 ? .005 : .009, .0015],
      [Math.sin(angle) * .053, .083 + Math.cos(angle) * .053, .0403], ink).rotation.z = -angle;
  }
  function hand(length, width, z, material) {
    const pivot = new THREE.Group();
    pivot.position.set(0, .083, z);
    clock.add(pivot);
    box(pivot, [width, length, .0018], [0, length * .40, 0], material);
    return pivot;
  }
  const hour = hand(.039, .006, .0425, ink);
  const minute = hand(.052, .004, .045, green);
  const second = hand(.056, .0019, .047, vermilion);
  const pin = cylinder(clock, .0065, .004, [0, .083, .050], brass);
  pin.rotation.x = Math.PI / 2;
  const times = [[16, 41], [14, 4], [20, 41]];
  function setClockTime(preset) {
    const [h, m] = times[preset] ?? times[0];
    hour.rotation.z = -(h + m / 60) * Math.PI / 6;
    minute.rotation.z = -m * Math.PI / 30;
  }
  setClockTime(0);

  const lamp = new THREE.Group();
  lamp.position.set(.021, .931, -1.829);
  lamp.name = 'Abajur de cúpula canelada';
  parent.add(lamp);
  const base = standard(0xa06c44, .68);
  applySurfaceTexture(base, woodTexture, .85);
  cylinder(lamp, .069, .017, [0, .009, 0], base);
  cylinder(lamp, .055, .012, [0, .023, 0], brass);
  cylinder(lamp, .020, .128, [0, .087, 0], green);
  cylinder(lamp, .011, .025, [0, .153, 0], brass);

  const shade = standard(0xf1dabc, .65);
  applySurfaceTexture(shade, fabricTexture, .67);
  shade.side = THREE.DoubleSide;
  const profile = [[.088, .158], [.087, .167], [.082, .186], [.068, .209],
    [.052, .225], [.034, .234], [.016, .239], [.004, .240]];
  const shell = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 84);
  const vertices = shell.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i), z = vertices.getZ(i);
    const ribs = 1 + .046 * Math.cos(Math.atan2(z, x) * 14);
    vertices.setX(i, x * ribs);
    vertices.setZ(i, z * ribs);
  }
  shell.computeVertexNormals();
  shape(lamp, shell, shade, [0, 0, 0]);
  const bottom = standard(0xefbb7d, .44);
  cylinder(lamp, .082, .008, [0, .158, 0], bottom);
  cylinder(lamp, .011, .009, [0, .244, 0], brass);

  const switchMesh = shape(lamp, new THREE.SphereGeometry(1, 12, 8).scale(.015, .01, .008),
    brass, [0, .025, .069]);
  switchMesh.name = 'Interruptor do abajur';
  switchMesh.userData.lampSwitch = true;
  const lampLight = new THREE.PointLight(0xffbc84, .56, .93, 2);
  lampLight.position.set(0, .148, 0);
  lampLight.layers.enable(27);
  lampLight.visible = false;
  lamp.add(lampLight);

  function toggleLamp() {
    const enabled = !lampLight.visible;
    lampLight.visible = enabled;
    bottom.emissive.setHex(enabled ? 0xe38a4d : 0);
    bottom.emissiveIntensity = enabled ? .65 : 0;
    shade.emissive.setHex(enabled ? 0xeabf91 : 0);
    shade.emissiveIntensity = enabled ? .22 : 0;
    return enabled;
  }

  function touchesSwitch(from, to) {
    const begin = switchMesh.worldToLocal(from.clone());
    const end = switchMesh.worldToLocal(to.clone());
    const plane = .018;
    if (begin.z <= plane || end.z > plane || end.z < -.06) return false;
    const aim = begin.lerp(end, (plane - begin.z) / (end.z - begin.z));
    return Math.abs(aim.x) < .027 && Math.abs(aim.y) < .018;
  }

  const collider = (size, position) => ({ size, position, rotation: [0, 0, 0, 1],
    friction: .58, bounce: .07 });
  const lampShapes = [
    collider([.139, .031, .139], [0, .015, 0]),
    collider([.04, .132, .04], [0, .093, 0]),
    collider([.172, .085, .172], [0, .2005, 0])
  ];
  return {
    clock, switchMesh, touchesSwitch, toggleLamp, setClockTime, lampShapes, lampPosition: lamp.position.toArray(),
    clockShapes: [
      collider([.145, .147, .067], [0, .083, .009]),
      collider([.12, .017, .043], [0, .0085, 0])
    ],
    tick(elapsed) { second.rotation.z = -elapsed % 60 * Math.PI / 30; }
  };
}
