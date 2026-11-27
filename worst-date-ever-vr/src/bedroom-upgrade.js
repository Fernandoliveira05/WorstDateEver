import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applySurfaceTexture } from './bedroom-style.js';
import { addBedroomProps } from './bedroom-props.js';
import { createFrameArt } from './bedroom-frame-art.js';
import { buildCandyShop } from './corridor-candy-shop.js';
import { buildCorridorCreature } from './corridor-creature-model.js';
import { buildNightstandAccessories } from './bedroom-nightstand.js';
import { creatureMotion } from './corridor-creature.mjs';
import { crossesButtonFace } from './scene-objects.js';

const corridorX = -1.55;
const corridorEnd = -11.68;
const hallZ = 5.04;
const phonePosition = [.20, .944, -1.70];
const oldLamp = /^room_(Paint-(AB824A|F0E3CC|9C544A|24262B)|Surface-Weave-F7F2E7|clay|sage)/;
const oldStand = /^room_Paint-(3B404A|80A694|24262B)/;

function trimExport(THREE, root) {
  const patches = [
    [[-.181, .927, -1.92], [.18, 1.5, -1.55], oldLamp],
    [[.363, .929, -1.658], [.516, 1.016, -1.516], oldStand],
    [[.116, .927, -1.916], [.304, 1.104, -1.790], /^room_Paint-(3B404A|AB824A|F0E3CC|80A694|9C544A|24262B)/],
    [[-2.105, -.002, 4.28], [-.995, 2.74, 4.45], /^room_Paint-3B404A/],
    [[-2.007, -.163, 3.367], [-1.093, .002, 4.373], /^room_Paint-825942/]
  ].map(([min, max, names]) => [new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)), names]);
  const point = new THREE.Vector3();
  root.traverse(mesh => {
    if (!mesh.isMesh || !mesh.geometry.index) return;
    const selections = patches.filter(([, names]) => names.test(mesh.name));
    if (!selections.length) return;
    const { index, attributes } = mesh.geometry;
    const kept = [];
    for (let i = 0; i < index.count; i += 3) {
      const triangle = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
      if (selections.some(([bounds]) => triangle.every(vertex =>
        bounds.containsPoint(point.fromBufferAttribute(attributes.position, vertex).applyMatrix4(mesh.matrixWorld))))) continue;
      kept.push(...triangle);
    }
    if (kept.length !== index.count) mesh.geometry.setIndex(kept);
  });
}

export function upgradeBedroom(THREE, root, original, node) {
  const group = new THREE.Group();
  group.name = 'Ventilador, quadros e corredor';
  root.add(group);
  root.updateWorldMatrix(true, true);
  trimExport(THREE, root);

  const standard = (color, roughness = .7, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const basic = color => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  function shape(parent, geometry, material, position) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.fromArray(position);
    mesh.castShadow = !material.isMeshBasicMaterial;
    mesh.receiveShadow = true;
    mesh.layers.enable(27);
    parent.add(mesh);
    return mesh;
  }
  const box = (parent, size, position, material) => shape(parent, new THREE.BoxGeometry(...size), material, position);
  const cylinder = (parent, radius, height, position, material) =>
    shape(parent, new THREE.CylinderGeometry(radius, radius, height, 20), material, position);
  const brass = standard(0xa97f43, .39, .55);
  const walnut = standard(0x805333);
  const woodTexture = root.getObjectByName('room_Surface-Walnut-FADEBA-10-13-062-024-Projected')?.material.map;
  const fabricTexture = root.getObjectByName('room_Surface-Weave-95ADC5-60-60-039-012-Projected')?.material.map;
  applySurfaceTexture(walnut, woodTexture, .85);
  const black = standard(0x40313c);
  const plaster = standard(0x665752);

  const data = { ...original,
    colliders: original.colliders.filter(({ position: [x, y, z] }) =>
      !(Math.abs(x - .44) < .004 && z > -1.66 && z < -1.50 && y > .93 && y < 1.01) &&
      !(Math.abs(x - corridorX) < .01 && z > 4.3 && z < 4.4 && y > 1) &&
      !(Math.abs(x - corridorX) < .01 && Math.abs(z - 3.87) < .01 && y < 0)),
    props: original.props.map(prop => prop.id === original.phone.id ? { ...prop, isKinematic: false } : prop),
    lights: original.lights.filter(light => !['Abajur', 'Luz do corredor'].includes(light.name)),
    pulls: original.pulls.map(pull => pull.cord
      ? { ...pull, cord: [.43, 2.50, -.42], Travel: .15 }
      : pull)
  };

  const phone = node(data.phone.id);
  phone.position.copy(phone.parent.worldToLocal(new THREE.Vector3(...phonePosition)));
  phone.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI, 'YXZ'));
  phone.updateMatrixWorld(true);
  const glow = new THREE.PointLight(0xefbaf6, .09, .40, 2);
  glow.position.set(0, 0, -.036);
  phone.add(glow);

  const bedside = buildNightstandAccessories(THREE, group, { shape, box, cylinder, standard, brass, woodTexture, fabricTexture });
  data.props.push({ id: bedside.clock.name, name: 'Despertador', mass: .31, shapes: bedside.clockShapes });
  for (const lampShape of bedside.lampShapes) {
    data.colliders.push({
      position: bedside.lampPosition,
      rotation: [0, 0, 0, 1],
      shape: lampShape
    });
  }

  const additions = addBedroomProps(THREE, group, data, { fabricTexture, woodTexture });
  const fan = new THREE.Group();
  fan.position.set(.33, 2.70, -.42);
  group.add(fan);
  cylinder(fan, .11, .07, [0, .145, 0], black);
  cylinder(fan, .024, .15, [0, .045, 0], brass);
  const rotor = new THREE.Group();
  fan.add(rotor);
  cylinder(rotor, .135, .12, [0, -.075, 0], black);
  cylinder(fan, .095, .045, [0, -.151, 0], brass);
  cylinder(fan, .035, .032, [.082, -.163, 0], brass);
  cylinder(fan, .016, .036, [.10, -.184, 0], brass);
  for (let i = 0; i < 4; i++) {
    const arm = new THREE.Group();
    arm.rotation.y = i * Math.PI / 2;
    rotor.add(arm);
    box(arm, [.105, .022, .18], [0, -.064, .16], brass);
    const blade = shape(arm, new RoundedBoxGeometry(.155, .023, .41, 3, .011), walnut, [0, -.074, .37]);
    blade.rotation.z = .09;
  }
  const pull = data.pulls.find(item => item.cord);
  if (pull) {
    const knob = node(pull.id);
    knob.position.copy(knob.parent.worldToLocal(new THREE.Vector3(.43, 1.69, -.42)));
    knob.updateMatrixWorld(true);
  }
  let running = true, speed = 0;

  function roomBox(size, position, material) { return box(group, size, position, material); }
  roomBox([3.14, .06, .045], [.36, .46, -2.202], walnut);
  roomBox([3.14, .03, .045], [.36, .50, -2.202], brass);
  // Place the runner by the doorway, clear of the existing bedside rug.
  roomBox([.73, .008, .93], [-1.55, .012, 2.76], standard(0x3d3030));
  roomBox([.65, .009, .85], [-1.55, .015, 2.76], standard(0x5d484b));
  for (const x of [-1.86, -1.24]) roomBox([.008, .012, .83], [x, .018, 2.76], standard(0x9a775a));

  const corridor = new THREE.Group();
  corridor.name = 'Corredor';
  group.add(corridor);

  const shopLightStrength = { value: 1 };
  function interior(color, roughness = 1) {
    const material = basic(color);
    material.customProgramCacheKey = () => 'wde-corridor:' + roughness;
    material.onBeforeCompile = shader => {
      shader.uniforms.wdeShopLight = shopLightStrength;
      shader.vertexShader = 'varying vec3 wdeLocation;\n' + shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nwdeLocation = (modelMatrix * vec4(transformed, 1.)).xyz;');
      shader.fragmentShader = 'uniform float wdeShopLight; varying vec3 wdeLocation;\n' + shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        // Only fragments seen through the door aperture can be drawn from the bedroom.
        if (cameraPosition.z < 3.33 && wdeLocation.z > 3.335) {
          float across = (3.335 - cameraPosition.z) / (wdeLocation.z - cameraPosition.z);
          vec3 doorway = mix(cameraPosition, wdeLocation, across);
          if (doorway.x < -1.99 || doorway.x > -1.103 || doorway.y < 0. || doorway.y > 2.13) discard;
        }
        vec3 p = wdeLocation;
        float falloff = exp(-length((p - vec3(-10.85, 1.14, 5.04)) * vec3(.32, .82, 1.42)) * 1.15);
        float cold = exp(-length((p - vec3(-2.93, 1.93, 5.04)) * vec3(1.1, 1.05, 1.4)) * 1.42);
        float entrance = exp(-length((p - vec3(-1.55, .80, 3.52)) * vec3(1.1, .63, 1.8)) * 1.3);
        float grain = fract(sin(dot(floor(p * 128.), vec3(17.53, 95.17, 71.29))) * 43758.54);
        float stain = sin(p.x * 13. + sin(p.z * 28.)) * sin(p.y * 2.7 + p.z * 9.);
        vec3 shade = vec3(.037,.039,.051) + wdeShopLight * falloff * vec3(.98,.49,.19)
          + cold * vec3(.10,.17,.19) + entrance * vec3(.16,.13,.13);
        float wear = ${roughness.toFixed(2)};
        diffuseColor.rgb *= mix(vec3(1.), shade * (1. + wear * (grain * .19 + stain * .27)), wear);
      `);
    };
    return material;
  }

  const walls = interior(0x655c50), ceiling = interior(0x393631);
  const floor = interior(0x50443a), trim = interior(0x3c3027);
  const darkDoor = interior(0x3b332c), inset = interior(0x2d2826), iron = interior(0x78664e, .83);
  const coldGlass = interior(0x435452, .54);
  function solid(size, position, material) {
    box(corridor, size, position, material);
    data.colliders.push({
      position, rotation: [0, 0, 0, 1],
      shape: { size, position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .57, bounce: .035 }
    });
  }

  // The original room boards end at z=3.40. Join the corridor floor there
  // after removing the exported corridor slab above.
  solid([1.49, .15, 2.34], [corridorX, -.075, 4.57], floor);
  solid([1.49, .13, 2.40], [corridorX, 2.48, 4.54], ceiling);
  solid([.14, 2.47, 2.40], [-.81, 1.20, 4.54], walls);
  solid([.14, 2.47, .96], [-2.29, 1.20, 3.82], walls);
  solid([1.54, 2.47, .12], [corridorX, 1.20, 5.76], walls);
  // The short jamb in the old export still provides doorway collision.
  box(corridor, [.176, 2.725, 1.09], [-2.08, 1.36, 3.89], walls);

  // Light leaking around the bend gives the player a visual cue from the bedroom.
  const cornerLight = interior(0x8b6945, .17);
  box(corridor, [.29, .008, .018], [-2.07, .006, 5.62], cornerLight);
  box(corridor, [.021, .88, .011], [-2.23, .56, 5.67], interior(0x69533d, .29));

  const length = -2.29 - corridorEnd, center = (corridorEnd - 2.29) / 2;
  const lockedHandles = [];
  solid([length, .15, 1.47], [center, -.075, hallZ], floor);
  solid([length, .13, 1.47], [center, 2.48, hallZ], ceiling);
  for (const side of [-1, 1]) {
    const wallZ = hallZ + .735 * side;
    const doorZ = hallZ + .657 * side;
    solid([length, 2.47, .14], [center, 1.2, wallZ], walls);
    box(corridor, [length, .105, .10], [center, .055, doorZ], trim);
    const doors = [-3.82, -5.80, -7.85, -9.62];
    for (const [index, x] of doors.entries()) {
      const xOffset = x - (side < 0 ? .35 : 0);
      box(corridor, [.93, 2.18, .057], [xOffset, 1.091, doorZ - side * .014], trim);
      const door = box(corridor, [.81, 2.03, .063], [xOffset, 1.028, doorZ - side * .044], darkDoor);
      if (index === 2 && side === 1) door.rotation.y = -.14;
      for (const y of [.57, 1.46])
        box(door, [.60, .63, .025], [0, y - 1.028, -side * .035], inset);
      const handle = shape(door, new THREE.SphereGeometry(.025, 10, 8), iron, [.29, -.041, -side * .061]);
      handle.name = 'Maçaneta do corredor';
      handle.userData.lockedDoorSide = -side;
      lockedHandles.push(handle);
    }
  }
  for (const x of [-3.08, -5.54, -8.01, -10.09]) {
    box(corridor, [.24, .16, 1.38], [x, 2.30, hallZ], trim);
    box(corridor, [.045, .019, .33], [x, 2.211, hallZ], x === -3.08 ? coldGlass : inset);
  }
  for (let i = 0; i < 25; i++) {
    const x = -2.54 - i * .34;
    box(corridor, [.009, .003, 1.39], [x, .002, hallZ], trim);
  }
  const farWall = interior(0x70513b);
  solid([.15, 2.50, 1.50], [corridorEnd, 1.21, hallZ], farWall);
  const shop = buildCandyShop(THREE, corridor, data, [corridorEnd + .40, 0, hallZ], { box, shape, interior });

  const creature = new THREE.Group();
  creature.name = 'Figura na curva';
  creature.position.set(corridorX, .032, 4.67);
  creature.rotation.y = Math.PI + .045;
  creature.visible = false;
  corridor.add(creature);
  const reveal = { value: 0 }, lean = { value: 0 }, turn = { value: 0 }, breathing = { value: 0 };
  function creatureSkin(color, roughness) {
    const material = interior(color, roughness);
    material.transparent = true;
    material.depthWrite = false;
    const lightCreature = material.onBeforeCompile;
    material.customProgramCacheKey = () => 'wde-corridor-creature:' + roughness;
    material.onBeforeCompile = shader => {
      lightCreature(shader);
      Object.assign(shader.uniforms, { creatureReveal: reveal, creatureLean: lean, creatureTurn: turn,
        creatureBreath: breathing });
      shader.vertexShader = 'uniform float creatureLean, creatureTurn, creatureBreath;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', `
          #include <begin_vertex>
          float torso = smoothstep(.58, 1.62, position.y);
          float neck = smoothstep(1.54, 2.04, position.y);
          float yaw = creatureTurn * (.09 * torso + .08 * neck);
          float c = cos(yaw), s = sin(yaw);
          transformed.xz = mat2(c, -s, s, c) * transformed.xz;
          transformed.x -= torso * creatureLean * .21;
          transformed.z += torso * creatureLean * .042 + neck * creatureTurn * .029;
          transformed.y += torso * creatureBreath * .009 - neck * creatureLean * .038;
        `);
      shader.fragmentShader = 'uniform float creatureReveal;\n' +
        shader.fragmentShader.replace('#include <alphatest_fragment>', `
          diffuseColor.a *= creatureReveal * .89;
          #include <alphatest_fragment>
        `);
    };
    return material;
  }
  buildCorridorCreature(THREE, creature, creatureSkin);
  let scareAt = null;
  let queuedUntil = null;
  const creatureSight = new THREE.Vector3(creature.position.x, 1.63, creature.position.z);
  let cuePlayed = false;

  function scare(elapsed, always = false) {
    if (!always && Math.random() >= .25) return false;
    queuedUntil = elapsed + 4;
    return true;
  }

  const glass = standard(0xa4b3b3, .12);
  glass.transparent = true;
  glass.opacity = .24;
  glass.depthWrite = false;
  const pictures = [
    { position: [.48, 1.87, -2.212], subject: 'rio', size: [.44, .34], colors: [0x463349, 0xd29955, 0x7f5c66] },
    { position: [2.206, 1.86, -.48], subject: 'coast', yaw: -Math.PI / 2, size: [.34, .44], colors: [0x385453, 0xd1a15e, 0x768d75] },
    { position: [-.13, 1.81, -2.212], subject: 'cat', size: [.32, .40], colors: [0x574445, 0xb47756, 0x896969] }
  ].map(({ position, yaw = 0, size: [w, h], colors, subject }) => {
    const mount = new THREE.Group();
    mount.position.fromArray(position);
    mount.rotation.y = yaw;
    group.add(mount);
    shape(mount, new THREE.SphereGeometry(.010, 8, 6), brass, [0, 0, .037]);
    const frame = new THREE.Group();
    mount.add(frame);
    const parts = [];
    for (const x of [-w / 2, w / 2])
      parts.push({ mesh: box(frame, [.031, h, .038], [x, -.025 - h / 2, 0], walnut), size: [.031, h, .038] });
    for (const y of [-.025, -.025 - h])
      parts.push({ mesh: box(frame, [w + .028, .031, .038], [0, y, 0], walnut), size: [w, .031, .038] });
    const art = box(frame, [w, h, .008], [0, -.025 - h / 2, -.005], basic(colors[0]));
    const sun = shape(frame, new THREE.CircleGeometry(w * .15, 32), basic(colors[1]), [w * .12, -.10, .001]);
    const hill = shape(frame, new THREE.CircleGeometry(w * .38, 3), basic(colors[2]), [-w * .07, -.025 - h * .64, .002]);
    const print = createFrameArt(THREE, subject);
    let picture = [art, sun, hill];
    if (print) {
      sun.visible = hill.visible = false;
      const face = basic(0xffffff);
      face.map = print;
      const surface = shape(frame, new THREE.PlaneGeometry(w, h), face, [0, -.025 - h / 2, .003]);
      picture = [art, surface];
    }
    const pane = box(frame, [w, h, .003], [0, -.025 - h / 2, .014], glass);
    return { frame, parts, pane, art: picture, w, h, swing: 0, detached: false };
  });

  function strike(from, to, seconds, drop, radius = 0) {
    for (const item of pictures) {
      if (item.detached) continue;
      const { frame, w, h } = item;
      const inner = frame.worldToLocal(to.clone());
      const before = frame.worldToLocal(from.clone());
      const face = .031 + radius;
      if (inner.z > face || before.z <= face) continue;
      const contact = before.clone().lerp(inner, (face - before.z) / (inner.z - before.z));
      if (Math.abs(contact.x) > w / 2 + radius * .42 ||
          contact.y < -h - .025 - radius * .42 || contact.y > -.025 + radius * .42) continue;
      const velocity = to.clone().sub(from).multiplyScalar(1 / Math.max(.012, seconds));
      const force = (before.z - inner.z) / Math.max(.012, seconds);
      if (force > 2.55) {
        item.detached = true;
        drop(item, velocity.clampLength(0, 3));
      } else if (force > .14) item.swing += Math.sign(contact.x || .01) * Math.min(3.6, force * 1.6);
      return true;
    }
    return false;
  }

  for (const item of pictures) item.pane.userData.frame = item;
  return {
    setCorridorAvailable(enabled) {
      corridor.visible = enabled;
      if (!enabled) {
        queuedUntil = scareAt = null;
        creature.visible = false;
      }
    },
    setReducedEffects(reduced) {
      shop.setReduced(reduced);
      shopLightStrength.value = reduced ? .50 : 1;
    },
    data, strike, scare, bedside, additions, shop, lockedHandles,
    touchLockedDoor(from, to) {
      if (!corridor.visible) return null;
      return lockedHandles.find(handle => crossesButtonFace(handle, from, to, handle.userData.lockedDoorSide));
    },
    objects: [[bedside.clock.name, bedside.clock], ...additions.objects, ...shop.objects],
    frames: pictures.map(item => item.pane),
    toggleFan() { running = !running; return running; },
    corridorContains({ x, z }) {
      return (Math.abs(x - corridorX) < .74 && z > 3.34 && z < 5.76) ||
        (x > corridorEnd && x < -2.23 && Math.abs(z - hallZ) < .72);
    },
    atCandyMachine({ x, z }) { return Math.abs(z - hallZ) < .52 && x > corridorEnd && x < corridorEnd + 1.48; },
    tick(delta, elapsed, phoneIdle, player, doorBlocks) {
      bedside.tick(elapsed);
      additions.tick(delta, elapsed);
      let cue = false;
      if (queuedUntil !== null) {
        if (player) creatureSight.y = player.y;
        if (elapsed > queuedUntil) queuedUntil = null;
        else if (!doorBlocks || (player && !doorBlocks(player, creatureSight))) {
          scareAt = elapsed;
          cuePlayed = false;
          queuedUntil = null;
        }
      }
      if (scareAt !== null) {
        const age = elapsed - scareAt;
        const motion = creatureMotion(age);
        creature.visible = motion.presence > .007;
        if (player && !motion.finished) {
          const toward = player.clone().sub(creature.position);
          creature.scale.setScalar(THREE.MathUtils.clamp(toward.y / 1.92, .28, 1.28));
          if (Math.hypot(toward.x, toward.z) > .07)
            creature.rotation.y = Math.atan2(toward.x, toward.z);
        }
        reveal.value = motion.presence;
        lean.value = motion.lean;
        turn.value = motion.turn;
        breathing.value = motion.breathing;
        if (motion.striking && !cuePlayed) {
          cuePlayed = true;
          cue = true;
        }
        if (motion.finished) scareAt = null;
      }
      speed = THREE.MathUtils.damp(speed, running ? 11 : 0, 1.5, delta);
      rotor.rotation.y += speed * delta;
      glow.intensity = phoneIdle ? .055 + .034 * (1 + Math.sin(elapsed * 2.65)) : 0;
      for (const item of pictures) {
        if (item.detached) continue;
        const { frame } = item;
        item.swing += (-frame.rotation.z * 15 - item.swing * 1.8) * delta;
        frame.rotation.z = THREE.MathUtils.clamp(frame.rotation.z + item.swing * delta, -.60, .60);
      }
      return cue;
    }
  };
}
