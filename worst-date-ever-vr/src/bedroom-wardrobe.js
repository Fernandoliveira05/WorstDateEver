import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { bedroomPalette } from './bedroom-style.js';

const PALETTE = bedroomPalette;
const MODEL_BASE = .20;
const WIDTH = 1.22;
const DEPTH = .617;
const HEIGHT = 2.025;
const DRAWER_TRAVEL = .24;

/**
 * Replace the room's anonymous wardrobe shell with the authored 2-door model
 * and give it a clean, separately sliding bottom drawer. The old shell and its
 * custom doors are hidden here; they are not part of the returned interaction
 * surface.
 */
export function createWardrobe(THREE, root, data, gltf) {
  for (const name of ['room_carcass', 'room_clay_2', 'room_mustard_1', 'room_sage_1']) {
    const old = root.getObjectByName(name);
    if (old) old.visible = false;
  }
  const oldDoors = root.getObjectByName('Portas do armário');
  if (oldDoors) oldDoors.visible = false;
  // The source room's wardrobe interior is made of several unnamed meshes
  // (shelves, books and side panels). Hide every old mesh inside the cabinet
  // volume before adding the authored replacement; otherwise the books show
  // through the new open doors.
  root.updateMatrixWorld(true);
  const oldVolume = new THREE.Box3(new THREE.Vector3(.90, .15, -2.25),
    new THREE.Vector3(2.25, 2.22, -1.55));
  const bound = new THREE.Box3();
  root.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    bound.setFromObject(object);
    if (oldVolume.containsPoint(bound.getCenter(new THREE.Vector3()))) object.visible = false;
  });

  const model = gltf.scene;
  model.name = 'Armário de dois batentes';
  model.position.set(1.58, MODEL_BASE, -1.85);
  root.add(model);

  const materialColors = {
    carcass: PALETTE.deepTeal,
    walnut: PALETTE.honey,
    oak: PALETTE.honey,
    metal: PALETTE.brass,
    black: PALETTE.brass
  };
  const recolored = new Map();
  const material = source => {
    if (recolored.has(source)) return recolored.get(source);
    const finish = source.clone();
    finish.color.setHex(materialColors[source.name] ?? PALETTE.teal);
    finish.map = null;
    finish.roughness = source.name === 'metal' ? .44 : .78;
    finish.metalness = source.name === 'metal' ? .34 : 0;
    recolored.set(source, finish);
    return finish;
  };
  model.traverse(object => {
    if (!object.isMesh) return;
    object.material = Array.isArray(object.material)
      ? object.material.map(material)
      : material(object.material);
    object.castShadow = object.receiveShadow = true;
    object.layers.enable(27);
  });

  // The source room's interior is part of a combined wood mesh, so hiding it
  // by node name is not possible. Place a clean inner back panel in front of
  // the old shelves/books and hang a few outfits on the new rail.
  const inner = new THREE.Group();
  inner.name = 'Interior do armário';
  model.add(inner);
  const innerBack = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 1.86),
    new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: .9, side: THREE.DoubleSide }));
  innerBack.position.set(0, 1.0, -.02);
  innerBack.receiveShadow = true;
  inner.add(innerBack);
  // Cover the thin closed-door seam with a clean centre stile instead of
  // letting the wall/interior show through the gap.
  const stile = new THREE.Mesh(new THREE.BoxGeometry(.042, 1.9, .02),
    new THREE.MeshStandardMaterial({ color: PALETTE.deepTeal, roughness: .84 }));
  stile.position.set(0, 1.0, .285);
  stile.receiveShadow = true;
  inner.add(stile);
  const outfitMaterials = [PALETTE.plum, PALETTE.cream, PALETTE.teal, PALETTE.rose].map(color =>
    new THREE.MeshStandardMaterial({ color, roughness: .88 }));
  [-.38, -.12, .14, .40].forEach((x, index) => {
    const cloth = new THREE.Mesh(new RoundedBoxGeometry(.22, .60 + (index % 2) * .08, .035, 2, .01),
      outfitMaterials[index]);
    cloth.position.set(x, 1.34, .035);
    cloth.castShadow = cloth.receiveShadow = true;
    inner.add(cloth);
    const hanger = new THREE.Mesh(new THREE.TorusGeometry(.035, .004, 5, 12, Math.PI),
      new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: .44, metalness: .34 }));
    hanger.position.set(x, 1.68 + (index % 2) * .04, .035);
    inner.add(hanger);
  });

  const doors = new Map();
  const doorLimit = THREE.MathUtils.degToRad(95);
  const pickables = [];
  for (const [side, nudge, direction] of [['door-left', -.0025, -1],
    ['door-right', .0025, 1]]) {
    const door = model.getObjectByName(side);
    if (!door) continue;
    // A hair of clearance keeps the two shaker fronts from z-fighting at the
    // centre seam when the doors are closed.
    door.position.x += nudge;
    const state = { side, progress: 0, target: 0, dragging: false, startProgress: 0,
      startX: 0, velocity: 0, lastX: 0, lastAt: 0 };
    const apply = () => {
      door.rotation.y = doorLimit * state.progress * direction;
      state.target = state.progress;
    };
    const doorHandle = {
      side,
      get progress() { return state.progress; },
      get dragging() { return state.dragging; },
      begin(point) {
        state.dragging = true;
        state.startProgress = state.progress;
        state.startX = state.lastX = point.x;
        state.lastAt = performance.now();
        state.velocity = 0;
      },
      drag(point) {
        if (!state.dragging) return;
        const dx = point.x - state.startX;
        const progress = THREE.MathUtils.clamp(state.startProgress + dx * direction * 1.35, 0, 1);
        const now = performance.now();
        const dt = Math.max(.008, (now - state.lastAt) / 1000);
        state.velocity = (progress - state.progress) / dt;
        state.progress = progress;
        state.lastAt = now;
        apply();
      },
      end() {
        if (!state.dragging) return;
        state.dragging = false;
        if (Math.abs(state.velocity) > .75) state.target = state.velocity > 0 ? 1 : 0;
        else if (state.progress < .10) state.target = 0;
        else if (state.progress > .90) state.target = 1;
        else state.target = state.progress;
      }
    };
    doors.set(side, { door, state, doorHandle });
    door.traverse(object => {
      if (!object.isMesh) return;
      object.userData.wardrobeDoor = doorHandle;
      pickables.push(object);
    });
  }
  function settleDoors(delta) {
    for (const { state, door } of doors.values()) {
      if (state.dragging) continue;
      const speed = state.target > state.progress ? 1.7 : -1.7;
      const next = THREE.MathUtils.clamp(state.progress + speed * delta, 0, 1);
      state.progress = state.target > state.progress ? Math.min(state.target, next) :
        Math.max(state.target, next);
      door.rotation.y = doorLimit * state.progress * (state.side === 'door-left' ? -1 : 1);
    }
  }

  // The authored wardrobe has no bottom drawer. Build one clean base under the
  // doors so the old shell's overlapping slide geometry is no longer used.
  const base = new THREE.Group();
  base.name = 'Gaveta inferior do armário';
  base.position.set(1.58, 0, -1.85);
  root.add(base);
  const teal = new THREE.MeshStandardMaterial({ color: PALETTE.deepTeal, roughness: .8 });
  const panel = new THREE.MeshStandardMaterial({ color: PALETTE.teal, roughness: .82 });
  const brass = new THREE.MeshStandardMaterial({ color: PALETTE.brass, roughness: .44, metalness: .34 });
  const add = (parent, geometry, finish, position) => {
    const mesh = new THREE.Mesh(geometry, finish);
    mesh.position.fromArray(position);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.layers.enable(27);
    parent.add(mesh);
    return mesh;
  };
  add(base, new RoundedBoxGeometry(WIDTH, MODEL_BASE, DEPTH, 2, .012), teal, [0, MODEL_BASE / 2, 0]);
  const drawer = new THREE.Group();
  drawer.name = 'Gaveta de base';
  drawer.position.set(0, MODEL_BASE / 2, DEPTH / 2);
  base.add(drawer);
  const front = add(drawer, new RoundedBoxGeometry(WIDTH - .06, .17, .03, 2, .008), panel, [0, 0, 0]);
  const handle = add(drawer, new RoundedBoxGeometry(.34, .024, .026, 2, .006), brass, [0, 0, .026]);
  const tray = add(drawer, new RoundedBoxGeometry(WIDTH - .12, .13, .46, 2, .008), teal, [0, -.015, -.25]);
  let drawerOpen = false;
  let drawerSlide = 0;
  function toggleDrawer() {
    drawerOpen = !drawerOpen;
  }
  for (const mesh of [front, handle, tray]) {
    mesh.userData.roomAction = toggleDrawer;
    pickables.push(mesh);
  }

  data.colliders.push({
    position: [1.58, MODEL_BASE / 2, -1.85], rotation: [0, 0, 0, 1],
    shape: { size: [WIDTH, MODEL_BASE, DEPTH], position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .62, bounce: .03 }
  });
  data.colliders.push({
    position: [1.58, MODEL_BASE + HEIGHT / 2, -1.85], rotation: [0, 0, 0, 1],
    shape: { size: [WIDTH, HEIGHT, DEPTH], position: [0, 0, 0], rotation: [0, 0, 0, 1], friction: .62, bounce: .03 }
  });

  return {
    model,
    pickables,
    toggleDrawer,
    doors,
    get open() { return [...doors.values()].every(({ state }) => state.progress > .9); },
    get drawerOpen() { return drawerOpen; },
    tick(delta) {
      settleDoors(delta);
      drawerSlide = THREE.MathUtils.damp(drawerSlide, drawerOpen ? DRAWER_TRAVEL : 0, 12, delta);
      drawer.position.z = DEPTH / 2 + drawerSlide;
    }
  };
}
