import { candyAtmosphere } from '../candies.mjs';
import { createNpcSpeech } from './npc-speech.js';
import { impactClass, sweptContact } from './impact.js';
import { createNpcClocks } from './npc-clock.js';
import { createNpcAnimation } from './npc-animation.js';
import { createSeatPose } from './seat-ik.js';
import * as CANNON from 'cannon-es';
import { fitCharacter } from '../bedroom-scenery.js';
import { createPhysicsWorld, makeKinematic, releaseDynamic } from '../physics-world.mjs';
import layout from '../../content/shared/venue-layout.json';
import { objectGroup } from '../scene-objects.js';
import { INTERACTION_STYLE, arcSlots, cardWidth, cardCorners, gazeShowsMenu } from './interaction-arc.mjs';
import { authoredGrip, heldGripPose, gripSurface } from '../grip-pose.mjs';
import { blanketPull } from '../asset-registry.mjs';
import { buildPicnicPark, loadPicnicSpread } from './picnic.js';
import { EVENT_VISUAL_STYLE, eventArcPlacement, eventCueState } from './event-presentation.mjs';
import { qteConfig, qteMenuAnchor, qteMenuSlots } from './qte.mjs';
import { FRIEND_VISIT, friendVisitMotion } from './event-visitor.mjs';
import { SKILL_UI, actionCategories, availablePhysicalActions, fixedSkillAnchor } from './physical-interactions.mjs';
import { createPhysicalScene } from './physical-scene.js';
import { SKILL_TUTORIALS } from './skill-tutorial.mjs';
import menuCatalog from '../../content/shared/menu-items.json' with { type: 'json' };
import { seededRandom } from './event-core.mjs';

const hudFont = '"WDE DM Sans", "Avenir Next", Arial, sans-serif';
let hudFontReady;
function loadHudFont() {
  hudFontReady ??= (async () => {
    if (typeof FontFace === 'undefined') return;
    try {
      const face = new FontFace('WDE DM Sans', 'url(/assets/fonts/DMSans-Variable.ttf)', { weight: '100 1000' });
      document.fonts.add(await face.load());
    } catch { /* The fallback font keeps the date usable offline. */ }
  })();
  return hudFontReady;
}

const themes = {
  picnic: { wall: 0xd0ac83, seat: 0xb26b83, title: 'PIQUENIQUE NO PARQUE', sky: 0xb8d8e3 },
  sushi: { wall: 0x966d76, seat: 0x963d46, title: 'SUSHI · KOI TORTO', sky: 0x5b638a },
  bistro: { wall: 0x998276, seat: 0x6e803f, title: 'BISTRÔ · A MESA É NOSSA', sky: 0x54526e },
  bar: { wall: 0x817492, seat: 0x64557c, title: 'BAR · ÚLTIMO PEDIDO', sky: 0x3d4270 }
};

export async function createVenue(THREE, { venue, persona, candy, reducedEffects = () => false, load, camera, bedroomNode, bedroomMaterial, announce, recenter, restart, voice, react, onGesture, viewerPosition, viewerDirection, isVr = () => false }) {
  await loadHudFont();
  const picnic = venue.sceneVariant === 'picnic';
  const theme = themes[venue.sceneVariant] ?? themes[venue.id];
  const spread = picnic ? await loadPicnicSpread() : [];
  const speech = createNpcSpeech(persona.id);
  const group = new THREE.Group();
  group.name = 'date-' + venue.id;
  const architecture = objectGroup(THREE, group, 'Venue architecture');
  const lights = objectGroup(THREE, group, 'Venue lighting');
  const furnishings = objectGroup(THREE, group, 'Venue furniture');
  const tableProps = objectGroup(THREE, group, 'Table props');
  const people = objectGroup(THREE, group, 'Venue characters');
  const interfaces = objectGroup(THREE, group, 'Conversation and feedback');
  const mat = (color, roughness = .8) => new THREE.MeshStandardMaterial({ color, roughness });
  const borrowedMaterials = new Set();
  const borrowedGeometry = new Set();
  const wood = mat(0x8e5b42);
  wood.map = bedroomMaterial('Surface-Walnut-')?.map ?? null;
  const brass = mat(0xc09059, .45);
  const metal = mat(0x39303a, .6);
  const ceramic = mat(0xf3e2c5, .37);
  const floor = mat(picnic ? 0x7b9c55 : 0x92695b);
  const boards = !picnic && bedroomMaterial('Surface-Floorboards-')?.map;
  if (boards) { floor.map = boards.clone(); floor.map.repeat.set(4, 5); floor.map.needsUpdate = true; }
  const upholstery = mat(theme.seat);
  upholstery.map = bedroomMaterial('Surface-Weave-')?.map ?? null;
  const wall = mat(theme.wall);
  
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const orb = new THREE.SphereGeometry(1, 14, 10);
  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 20);
  const world = createPhysicsWorld();
  const solids = [];
  const g = (geometry, sizes, position, material, parent = architecture) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = material.isMeshStandardMaterial;
    mesh.castShadow = material.isMeshStandardMaterial && position[1] < 2;
    mesh.scale.fromArray(sizes);
    mesh.position.fromArray(position);
    parent.add(mesh);
    return mesh;
  };
  const box = (size, position, material, parent) => g(boxGeo, size, position, material, parent);
  const cylinder = (size, position, material, parent) => g(cylinderGeo, size, position, material, parent);
  const sphere = (size, position, material, parent) => g(orb, size, position, material, parent);
  const physicsBox = (size, position, mass = 0) => {
    const body = new CANNON.Body({ mass, position: new CANNON.Vec3(...position),
      shape: new CANNON.Box(new CANNON.Vec3(...size.map(value => value / 2))),
      linearDamping: .35, angularDamping: .4 });
    world.addBody(body);
    if (!mass) solids.push({ size, position });
    return body;
  };
  const solidBox = (size, position, material) => {
    physicsBox(size, position);
    return box(size, position, material);
  };

  lights.add(new THREE.HemisphereLight(0xffe9d5, 0x7c728f, 2.15));
  const light = new THREE.DirectionalLight(0xffdcc0, 2.1);
  light.position.set(-4, 5, 2);
  light.target.position.set(0, 0, -3);
  lights.add(light.target);
  light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -5.8, right: 5.8, top: 6, bottom: -5, far: 18 });
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.normalBias = .026;
  light.shadow.bias = -.00014;
  lights.add(light);
  const lampFill = [];
  if (picnic) {
    solidBox([22, .1, 22], [0, -.05, -3.15], floor);
    buildPicnicPark(THREE, { box, cylinder, sphere, mat, architecture, upholstery, wood });
  } else {
    solidBox([11.5, .1, 10], [0, -.05, -3.15], floor);
    box([11.5, .12, 10], [0, 3.3, -3.15], mat(0x6f555c));
    box([11.5, 3.3, .18], [0, 1.65, 1.84], wall);
    for (let i = 0; i <= 20; i++)
      box([11.4, .002, .012], [0, .006, 1.77 - i * .48], wood);
    for (const x of [-5.55, 5.55]) {
      solidBox([.18, 3.3, 10], [x, 1.65, -3.15], wall);
      box([.24, .18, 10], [x, .1, -3.15], wood);
      for (const z of [-.8, -3.4, -6.1]) {
        box([.26, 3.1, .14], [x, 1.57, z], wood);
        box([.045, .85, 1.16], [x - Math.sign(x) * .1, .59, z + .71], upholstery);
        box([.05, .058, 1.28], [x - Math.sign(x) * .12, 1.02, z + .71], wood);
      }
    }
    solidBox([11.2, 1.01, .17], [0, .505, -7.9], wood);
    box([11.2, .53, .17], [0, 3.05, -7.9], wall);
    const windowLight = new THREE.MeshBasicMaterial({ color: theme.sky });
    box([11.2, 1.82, .07], [0, 1.93, -7.96], windowLight);
    for (let x = -5.5; x <= 5.5; x += 1.1)
      box([.065, 1.91, .18], [x, 1.94, -7.84], wood);
    for (let i = 0; i < 25; i++) {
      const x = (i * 2.73) % 10.7 - 5.35;
      const height = .16 + (i * .567) % .84;
      box([.16 + (i * .17) % .42, height, .04], [x, 1.02 + height / 2, -7.88],
        i % 2 ? mat(0x54485d) : mat(0x63536c));
    }
    for (let x = -3.8; x <= 3.8; x += 3.8) {
      box([.035, .7, .035], [x, 2.93, -2.6], metal);
      cylinder([.39, .14, .39], [x, 2.55, -2.6], brass);
      const bulb = new THREE.MeshBasicMaterial({ color: 0xffd38e });
      cylinder([.33, .015, .33], [x, 2.477, -2.6], bulb);
      if (candy === 'morango') {
        const spill = new THREE.PointLight(0xf48aa9, .64, 3.6, 2);
        spill.position.set(x, 2.28, -2.6);
        lights.add(spill);
        lampFill.push({ bulb, spill });
      }
    }
  }

  const door = (x, z, color, rotation = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, 0, z);
    pivot.rotation.y = rotation;
    group.add(pivot);
    box([.94, 2.15, .08], [.46, 1.075, 0], mat(color), pivot);
    box([.78, .49, .093], [.46, 1.7, 0], wood, pivot);
    sphere([.038, .038, .038], [.83, 1.04, .062], brass, pivot);
    return pivot;
  };
  const restroomYaw = picnic ? 0 : Math.PI / 2;
  const restroom = picnic ? door(-5.71, -5.55, 0x695263) : door(-5.35, -6.03, 0x695263, restroomYaw);
  if (picnic) restroom.scale.setScalar(.82);
  const entrance = picnic ? new THREE.Group() : door(3.72, -7.72, 0x70434b);
  const switchSign = textPlane(THREE, .40, .15, 'WC', 208, 72);
  switchSign.position.set(...(picnic ? [-5.35, 1.80, -5.48] : [-5.18, 2.34, -6.51]));
  switchSign.rotation.y = restroomYaw;
  group.add(switchSign);
  const sign = textPlane(THREE, picnic ? 1 : 2.15, .28, picnic ? 'QUIOSQUE' : theme.title, 1024, 125);
  sign.position.set(...(picnic ? [4.75, 1.23, -6.10] : [-.15, 2.96, -7.76]));
  group.add(sign);

  if (!picnic) {
    solidBox([1.32, 1.1, 1.72], [4.76, .55, -3.57], wood);
    box([1.37, .055, 1.79], [4.76, 1.12, -3.57], ceramic);
    for (let i = 0; i < 5; i++) {
      cylinder([.066, .16 + i % 2 * .08, .066], [4.84 + i * .1, 1.23, -3.72], mat(i % 2 ? 0x799075 : 0xae5e45));
      cylinder([.034, .06, .034], [4.84 + i * .1, 1.35, -3.72], brass);
    }
  }

  function chair(x, z, yaw, name) {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(x, 0, z);
    root.rotation.y = yaw;
    furnishings.add(root);
    box([.49, .095, .47], [0, .46, 0], upholstery, root);
    box([.49, .37, .075], [0, .76, .20], upholstery, root);
    for (const px of [-.19, .19]) {
      for (const pz of [-.17, .17]) box([.045, .42, .045], [px, .22, pz], wood, root);
      box([.05, .53, .047], [px, .65, .20], wood, root);
    }
  }
  for (const [x, , z] of picnic ? [] : layout.tables) {
    solidBox([1.28, .07, 1.02], [x, .75, z], wood);
    cylinder([.11, .72, .11], [x, .36, z], metal);
    cylinder([.31, .035, .31], [x, .024, z], brass);
    for (const shift of [-.38, .38]) {
      box([.29, .002, .35], [x + shift, .787, z], upholstery);
      if (x) cylinder([.13, .025, .13], [x + shift, .806, z], ceramic);
    }
  }

  const seats = Object.fromEntries(layout.seats.map(seat => [seat.id, seat]));
  if (!picnic) for (const { position: [x, , z], yaw, id } of layout.seats) chair(x, z, yaw + Math.PI, id);

  if (venue.id === 'sushi') {
    for (let i = 0; i < 11; i++) {
      const x = -4.65 + i * .92;
      box([.87, .38, .03], [x, 2.58, -7.71], i % 3 === 0 ? upholstery : ceramic);
      box([.012, .42, .06], [x + .44, 2.57, -7.7], wood);
    }
    const nori = mat(0x273b33);
    for (const [x, z] of [[-.12, -.36], [.02, -.43], [.14, -.47]]) {
      cylinder([.042, .04, .042], [x, .806, z], nori);
      cylinder([.033, .002, .033], [x, .827, z], ceramic);
      cylinder([.016, .003, .016], [x, .829, z], mat(0xdf8b64));
    }
    for (const offset of [.03, .054]) {
      const stick = box([.012, .015, .25], [offset + .42, .798, .11], brass);
      stick.rotation.y = -.35;
    }
  }

  const original = { cup: 'wde_78', plate: 'wde_106' };
  const picnicStations = { cup: [-.40,.11,.40], plate: [.13,.045,-.27], menu: [.59,.043,.16] };
  const props = layout.props.map(({ id, position: tablePosition, size }) => {
    const position = picnic ? picnicStations[id] ?? tablePosition : tablePosition;
    const mesh = new THREE.Group();
    if (id === 'menu') {
      tableProps.add(mesh);
      return { id, mesh, position, size, body: physicsBox(size, position, .24) };
    }
    const source = bedroomNode(original[id]);
    if (!source) throw new Error('Missing bedroom prop ' + original[id]);
    const reproduce = item => {
      const placed = item.isMesh ? new THREE.Mesh(item.geometry, item.material) : new THREE.Group();
      placed.position.copy(item.position);
      placed.quaternion.copy(item.quaternion);
      placed.scale.copy(item.scale);
      for (const child of item.children) {
        if (/cerâmica[ _]inteira|alça[ _]curva/i.test(child.name)) placed.add(reproduce(child));
      }
      return placed;
    };
    const copy = reproduce(source);
    copy.traverse(item => {
      if (!item.isMesh) return;
      item.castShadow = true;
      borrowedGeometry.add(item.geometry);
      for (const material of Array.isArray(item.material) ? item.material : [item.material])
        borrowedMaterials.add(material);
    });
    copy.position.set(0, 0, 0);
    copy.rotation.set(0, 0, 0);
    copy.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(copy, true);
    const extents = bounds.getSize(new THREE.Vector3());
    if (!bounds.isEmpty()) {
      const center = bounds.getCenter(new THREE.Vector3());
      const fitted = new THREE.Group();
      fitted.scale.fromArray(size.map((value, i) => value / Math.max(.001, extents.getComponent(i))));
      copy.position.sub(center);
      fitted.add(copy);
      mesh.add(fitted);
    } else throw new Error('Missing intact geometry for ' + id);
    tableProps.add(mesh);
    return { id, mesh, position, size, body: physicsBox(size, position, id === 'plate' ? .34 : .24) };
  });

  for (const model of spread) {
    const cloth = model.cloth;
    const body = new CANNON.Body({ mass: cloth ? 0 : model.mass, position: new CANNON.Vec3(...model.position),
      linearDamping: .35, angularDamping: .4 });
    for (const { size, position } of model.shapes)
      body.addShape(new CANNON.Box(new CANNON.Vec3(...size.map(value => value / 2))), new CANNON.Vec3(...position));
    body.userData = { ...body.userData, cloth: Boolean(cloth) };
    world.addBody(body);
    tableProps.add(model.model);
    props.push({ ...model, mesh: model.model, body, cloth, pull: 0,
      bottom: Math.min(...model.shapes.map(shape => shape.position[1] - shape.size[1] / 2)),
      size: new THREE.Box3().setFromObject(model.model).getSize(new THREE.Vector3()).toArray() });
  }
  const propsById = Object.fromEntries(props.map(prop => [prop.id, prop]));
  const menuState = { page: 0, held: false };
  const menuProp = propsById.menu;
  const menuBook = menuProp.mesh;
  const menuHome = new THREE.Vector3(...menuProp.position);
  const menuReadPosition = new THREE.Vector3();
  const menuReadRotation = new THREE.Quaternion();
  const menuFlat = new THREE.Quaternion();
  const menuFacing = new THREE.Matrix4();
  const menuPageRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const menuOrigin = new THREE.Vector3();
  const menuOriginRotation = new THREE.Quaternion();
  let menuProgress = 0;
  let menuReturning = false;
  const menuHinge = new THREE.Group();
  menuBook.add(menuHinge);
  menuHinge.position.y = .004;
  menuHinge.rotation.z = -Math.PI;
  const binding = mat(0x582840);
  const paper = mat(0xe2cdbb);
  box([.012,.015,.30], [0,0,0], binding, menuBook);
  box([.108,.006,.30], [.054,-.006,0], binding, menuBook);
  box([.100,.009,.279], [.053,-.001,0], paper, menuBook);
  box([.108,.006,.30], [-.054,-.003,0], binding, menuHinge);
  const cover = textPlane(THREE, .096, .270, 'Cardápio', 384, 1080);
  cover.rotation.x = Math.PI / 2;
  cover.position.set(-.054,-.0064,0);
  const coverCanvas = cover.material.map.image;
  const coverInk = coverCanvas.getContext('2d');
  coverInk.fillStyle = '#582840'; coverInk.fillRect(0, 0, 384, 1080);
  coverInk.strokeStyle = '#c994a7'; coverInk.lineWidth = 4; coverInk.strokeRect(16, 16, 352, 1048);
  coverInk.textAlign = 'center';
  coverInk.fillStyle = '#fff1dc'; coverInk.font = '42px Georgia'; coverInk.fillText('Cardápio', 192, 495);
  coverInk.font = '23px Georgia'; coverInk.fillText('Segure para abrir', 192, 560);
  coverInk.fillText('e ativar a voz', 192, 598);
  cover.material.map.needsUpdate = true;
  menuHinge.add(cover);
  const menuPages = [];
  for (const side of [-1, 1]) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 1024;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const page = new THREE.Mesh(new THREE.PlaneGeometry(.097, .265), new THREE.MeshBasicMaterial({
      map: texture, side: THREE.DoubleSide, toneMapped: false, depthWrite: false
    }));
    page.rotation.x = -Math.PI / 2;
    page.position.set(side * .052, .005, 0);
    page.renderOrder = 20;
    (side < 0 ? menuHinge : menuBook).add(page);
    menuPages.push({ canvas, texture, page, side });
  }
  function renderMenuPages() {
    const spread = menuCatalog.spreads[menuState.page];
    menuPages.forEach(({ canvas, texture, side }) => {
      const category = spread.categories[side < 0 ? 0 : 1];
      const items = menuCatalog.venues[venue.id].filter(item => item.category === category);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#f4eadc'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#b77d91'; ctx.lineWidth = 8; ctx.strokeRect(18, 18, 476, 988);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#79445d'; ctx.font = '600 26px Georgia';
      ctx.fillText('WORST DATE · ' + venue.id.toUpperCase(), 256, 86);
      ctx.fillStyle = '#38162d'; ctx.font = 'bold 52px Georgia';
      ctx.fillText(menuCatalog.categoryLabels[category].toUpperCase(), 256, 184);
      ctx.strokeStyle = '#c89bad'; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(76, 218); ctx.lineTo(436, 218); ctx.stroke();
      let y = 315;
      function wrap(text, baseline, lineHeight) {
        let line = '';
        for (const word of text.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (line && ctx.measureText(next).width > 422) {
            ctx.fillText(line, 256, baseline, 422);
            baseline += lineHeight;
            line = word;
          } else line = next;
        }
        ctx.fillText(line, 256, baseline, 422);
        return baseline + lineHeight;
      }
      for (const item of items) {
        ctx.fillStyle = '#38162d'; ctx.font = 'bold 49px Georgia';
        const descriptionY = wrap(item.name, y, 62);
        ctx.fillStyle = '#634b53'; ctx.font = '34px Georgia';
        wrap(item.description, descriptionY + 10, 44);
        y += 272;
      }
      ctx.fillStyle = '#8b6b78'; ctx.font = 'italic 23px Georgia';
      const pageControl = isVr() ? 'deslize para folhear' : 'PgUp / PgDn';
      ctx.fillText(`${menuState.page + 1} / ${menuCatalog.spreads.length} · ${pageControl}`, 256, 930);
      ctx.fillStyle = '#79445d'; ctx.font = 'bold 22px Georgia';
      ctx.fillText('DIGA O NOME DO ITEM', 256, 974);
      texture.needsUpdate = true;
    });
  }
  renderMenuPages();
  function turnMenuPage(direction) {
    if (!menuState.held || menuProgress < .80) return false;
    menuState.page = (menuState.page + direction + menuCatalog.spreads.length) % menuCatalog.spreads.length;
    renderMenuPages();
    audioCue('menu_page', menuBook.position);
    return true;
  }

  function presentMenu() {
    const eye = viewerPosition?.() ?? camera.getWorldPosition(new THREE.Vector3());
    const forward = viewerDirection?.() ?? camera.getWorldDirection(new THREE.Vector3());
    forward.y = THREE.MathUtils.clamp(forward.y, -.28, .18);
    forward.normalize();
    menuOrigin.copy(menuProp.body.position);
    menuOriginRotation.copy(menuProp.body.quaternion);
    menuReadPosition.copy(eye).addScaledVector(forward, .52);
    menuReadPosition.y -= .25;
    menuFacing.lookAt(eye, menuReadPosition, new THREE.Vector3(0, 1, 0));
    menuReadRotation.setFromRotationMatrix(menuFacing).multiply(menuPageRotation);
    menuReturning = false;
  }

  function animateMenu(dt) {
    if (!menuState.held && !menuReturning) return;
    const direction = menuState.held ? 1 : -1;
    menuProgress = THREE.MathUtils.clamp(menuProgress + direction * dt / .72, 0, 1);
    const lift = THREE.MathUtils.smoothstep(menuProgress, 0, 1);
    const opening = THREE.MathUtils.smoothstep(menuProgress, .30, .91);
    const start = menuReturning ? menuHome : menuOrigin;
    menuBook.position.copy(start).lerp(menuReadPosition, lift);
    menuBook.position.y += .10 * Math.sin(Math.PI * lift);
    menuBook.quaternion.copy(menuReturning ? menuFlat : menuOriginRotation).slerp(menuReadRotation, lift);
    menuHinge.rotation.z = -Math.PI * (1 - opening);
    menuBook.scale.setScalar(1 + .40 * opening);
    menuProp.body.position.copy(menuBook.position);
    menuProp.body.quaternion.copy(menuBook.quaternion);
    menuProp.body.aabbNeedsUpdate = true;
    if (menuReturning && menuProgress === 0) {
      menuReturning = false;
      releaseDynamic(menuProp.body);
      resetProp(menuProp);
    }
  }
  const characterNames = [persona.id, 'playerwoman', 'playerman', 'jacketwoman', 'jacketman', 'formalman'];
  const visitorModel = persona.id === 'bia' ? 'jacketwoman' : 'jacketman';
  const names = Object.fromEntries(['Caio', 'Rafa', 'Bia', 'Luiza', 'PlayerWoman', 'PlayerMan',
    'JacketWoman', 'JacketMan', 'FormalMan'].map(name => [name.toLowerCase(), name]));
  const loaded = await Promise.all([...characterNames, visitorModel].map(key => load('Characters/' + names[key] + '.glb')));
  const makeActor = ({ scene, animations }, index) => {
    const actor = new THREE.Group();
    actor.name = 'Venue actor ' + index;
    fitCharacter(THREE, actor, scene, 1.68);
    scene.traverse(item => { if (item.isMesh || item.isSkinnedMesh) item.castShadow = true; });
    people.add(actor);
    const mixer = new THREE.AnimationMixer(scene);
    const clips = {};
    for (const [key, suffix] of [['walk','Walk'], ['idle','Idle']]) {
      const clip = animations.find(clip => clip.name.split('|').at(-1) === suffix);
      if (clip) clips[key] = mixer.clipAction(clip);
    }
    const bones = Object.fromEntries(collectBones(scene).map(bone => [bone.name.replaceAll(/[^a-zA-Z]/g, ''), bone]));
    return { actor, mixer, clips, bones, isWaiter: index === 5, seatPose: createSeatPose(THREE, actor, bones, picnic && index === 0 ? .12 : undefined),
      animation: createNpcAnimation(THREE, actor, bones) };
  };
  const actors = loaded.slice(0, characterNames.length).map(makeActor);
  actors[5].actor.position.fromArray(layout.stations.find(item => item.id === 'service_counter').position);
  const eventVisitor = makeActor(loaded.at(-1), characterNames.length);
  eventVisitor.actor.name = 'Event visitor for ' + persona.id;
  eventVisitor.actor.visible = false;
  const date = actors[0];
  const physicalScene = createPhysicalScene(THREE, { parent: tableProps, camera, date, props: propsById,
    venueId: venue.id, audio: audioCue, isVr,
    complete: (id, mechanical) => voice.physical(id, mechanical) });
  let interactionMenu = 'root';
  let interactionCategory = null;
  const dateDrink = cylinder([.035,.072,.035], [0,-4,0], ceramic);
  dateDrink.visible = false;
  const glass = new THREE.MeshBasicMaterial({ color: 0x9cc4d0, transparent: true, opacity: .68 });
  const splash = Array.from({ length: 7 }, () => sphere([.03,.009,.021], [0,0,0], glass));
  const tray = cylinder([.22, .022, .22], [.22, 1.0, .28], brass, actors[5].actor);
  const trayDish = cylinder([.103, .025, .103], [.20, 1.023, .29], ceramic, actors[5].actor);
  const trayMount = objectGroup(THREE, actors[5].actor, 'Pedido na bandeja');
  trayMount.position.set(.20, 1.012, .29);
  tray.visible = trayDish.visible = trayMount.visible = false;
  const menuItems = menuCatalog.venues[venue.id];
  const wrongDish = g(new THREE.TorusGeometry(.053, .022, 9, 20), [1,1,1],
    [.20,1.048,.29], mat(0xda6d9b), actors[5].actor);
  wrongDish.rotation.x = -Math.PI / 2;
  wrongDish.visible = false;

  const panel = new THREE.Group();
  panel.name = 'venue-event-choices';
  interfaces.add(panel);
  const captionRig = new THREE.Group();
  captionRig.name = 'venue-cinematic-caption';
  camera?.add(captionRig);
  captionRig.position.set(0, -.74, -1.48);
  const panelSurface = textPlane(THREE, 1.30, .27, '', 1300, 270, { kind: 'surface', hud: true });
  panelSurface.position.z = -.01;
  captionRig.add(panelSurface);
  const heading = textPlane(THREE, 1.23, .235, '', 1476, 282, { kind: 'caption', hud: true });
  heading.position.z = .012;
  heading.userData.action = () => replaySpeech();
  captionRig.add(heading);
  const speakerTab = textPlane(THREE, .36, .073, persona.id.toUpperCase(), 720, 146,
    { kind: 'speaker-tab', hud: true });
  speakerTab.position.set(-.43, .148, .025);
  captionRig.add(speakerTab);
  const cards = new Map();
  function makeCard(key) {
    const card = new THREE.Group();
    card.name = 'venue-interaction-' + key;
    const background = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
      side: THREE.DoubleSide, toneMapped: false
    }));
    background.renderOrder = 10010;
    const label = textPlane(THREE, .82, INTERACTION_STYLE.cardHeight, '', 1000, 260, { kind: 'arc-label' });
    label.material.depthTest = false;
    label.renderOrder = 10011;
    label.position.z = .002;
    card.add(background, label);
    card.userData = { key, background, label, action: null, target: new THREE.Vector3(),
      opacity: 0, entering: true, width: 0, focused: false, flashUntil: 0 };
    background.userData.card = card;
    label.userData.card = card;
    panel.add(card);
    cards.set(key, card);
    return card;
  }
  function drawCard(card, width) {
    const { background, label } = card.userData;
    const corners = cardCorners(card.userData.key, width);
    const textureWidth = width + .10;
    const textureHeight = INTERACTION_STYLE.cardHeight + .08;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [x, y, 0]), 3));
    geometry.setIndex([0, 2, 1, 0, 3, 2]);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(corners.flatMap(([x, y]) => [
      x / textureWidth + .5, y / textureHeight + .5
    ]), 2));
    geometry.computeVertexNormals();
    background.geometry.dispose();
    background.geometry = geometry;
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    const sx = x => (x / textureWidth + .5) * canvas.width;
    const sy = y => (.5 - y / textureHeight) * canvas.height;
    ctx.beginPath();
    corners.forEach(([x, y], i) => i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y)));
    ctx.closePath();
    ctx.fillStyle = card.userData.focused || card.userData.selected ? '#51203F' :
      card.userData.event ? '#5A2146' : INTERACTION_STYLE.fill;
    ctx.fill();
    ctx.lineWidth = card.userData.focused || card.userData.selected ? 8 : card.userData.event ? 7 : 5;
    ctx.strokeStyle = card.userData.focused || card.userData.selected ? INTERACTION_STYLE.text :
      card.userData.event ? INTERACTION_STYLE.highlight : INTERACTION_STYLE.outline;
    ctx.stroke();
    const marker = card.userData.focused || card.userData.selected ? 14 : 11;
    ctx.fillStyle = card.userData.focused || card.userData.selected ? INTERACTION_STYLE.text : INTERACTION_STYLE.outline;
    corners.forEach(([x, y]) => ctx.fillRect(sx(x) - marker / 2, sy(y) - marker / 2, marker, marker));
    if (card.userData.event) {
      ctx.fillStyle = INTERACTION_STYLE.highlight;
      ctx.fillRect(sx(corners[0][0]) + 18, sy(corners[0][1]) + 10, 47, 5);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    background.material.map?.dispose();
    background.material.map = texture;
    background.material.needsUpdate = true;
    label.geometry.dispose();
    label.geometry = new THREE.PlaneGeometry(width - .04, INTERACTION_STYLE.cardHeight);
    label.userData.resizeTexture(Math.round((width - .04) / INTERACTION_STYLE.cardHeight * 260), 260);
    label.userData.draw(card.userData.text ?? '');
    card.userData.width = width;
  }
  const status = textPlane(THREE, .76, .046, '', 1140, 69, { kind: 'status', hud: true });
  status.position.set(0, -.186, .02);
  captionRig.add(status);
  const orderHud = textPlane(THREE, .66, .056, '', 990, 84, { kind: 'order-status', hud: true });
  orderHud.position.set(0, .37, .035);
  orderHud.visible = false;
  captionRig.add(orderHud);
  let lastOrderHint;
  const optionCenter = new THREE.Vector3();
  const qteFocusPoint = new THREE.Vector3();
  const qteSourcePoint = new THREE.Vector3();
  const qteMenuCenter = new THREE.Vector3();
  const qteMenuRight = new THREE.Vector3();
  const qteMenuFacing = new THREE.Vector3();
  const skillMenuCenter = new THREE.Vector3();
  const skillMenuRight = new THREE.Vector3();
  const skillMenuFacing = new THREE.Vector3();
  const playerPosition = new THREE.Vector3();
  const dateRight = new THREE.Vector3();
  const dateForward = new THREE.Vector3();
  const gazeVector = new THREE.Vector3();
  const worldUp = new THREE.Vector3(0, 1, 0);
  let gazeVisible = true;
  let gazeAwayFor = 0;
  let menuPresence = 1;
  const feelingBars = createFeelingBars(THREE);
  camera?.add(feelingBars);
  feelingBars.position.set(.78, -.18, -1.48);
  const eventCue = textPlane(THREE, EVENT_VISUAL_STYLE.cueWidth, EVENT_VISUAL_STYLE.cueHeight,
    '', 1152, 368, { kind: 'event-cue', hud: true });
  eventCue.renderOrder = 10016;
  eventCue.visible = false;
  interfaces.add(eventCue);
  const eventFlash = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5), new THREE.MeshBasicMaterial({
    color: 0xec4899, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false
  }));
  eventFlash.position.set(0, 0, -1.35);
  eventFlash.renderOrder = 10004;
  camera?.add(eventFlash);
  const eventNotice = textPlane(THREE, .8, .12, '', 1024, 154, { kind: 'event-notice', hud: true });
  eventNotice.position.set(0, -.455, -1.46);
  eventNotice.renderOrder = 10017;
  eventNotice.visible = false;
  camera?.add(eventNotice);
  const qteShade = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.7), new THREE.MeshBasicMaterial({
    color: 0x42404b, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false
  }));
  qteShade.position.set(0, 0, -1.39);
  qteShade.renderOrder = 10003;
  camera?.add(qteShade);
  const qteTimer = textPlane(THREE, .36, .20, '', 640, 380, { kind: 'qte-timer', hud: true });
  qteTimer.position.set(0, -.13, -1.44);
  qteTimer.renderOrder = 10018;
  qteTimer.visible = false;
  camera?.add(qteTimer);
  const skillGuide = textPlane(THREE, .72, .18, '', 1024, 250, { kind: 'skill-feedback', hud: true });
  skillGuide.renderOrder = 10018;
  skillGuide.visible = false;
  interfaces.add(skillGuide);
  const tutorialPanel = new THREE.Group();
  tutorialPanel.name = 'Skill tutorial';
  const tutorialSurface = textPlane(THREE, .82, .50, '', 1100, 670, { kind: 'skill-tutorial', hud: true });
  tutorialPanel.add(tutorialSurface);
  const tutorialButton = textPlane(THREE, .29, .077, 'Vamos lá!', 580, 155,
    { kind: 'tutorial-button', hud: true });
  tutorialButton.position.set(.20, -.19, .018);
  tutorialButton.userData.action = () => physicalScene.confirm();
  tutorialPanel.add(tutorialButton);
  tutorialPanel.visible = false;
  interfaces.add(tutorialPanel);
  const skillHelp = textPlane(THREE, .105, .061, '?', 256, 148,
    { kind: 'skill-help', hud: true });
  skillHelp.userData.action = () => physicalScene.showTutorial();
  skillHelp.visible = false;
  interfaces.add(skillHelp);
  const skillCancel = textPlane(THREE, .105, .061, '×', 256, 148,
    { kind: 'skill-help', hud: true });
  skillCancel.userData.action = () => physicalScene.cancel();
  skillCancel.visible = false;
  interfaces.add(skillCancel);
  const qteCup = new THREE.Group();
  qteCup.name = 'water-spill-qte-cup';
  qteCup.position.set(-.32, 1.11, -.20);
  qteCup.visible = false;
  const qteGlass = new THREE.MeshBasicMaterial({ color: 0xb9e4f5, transparent: true,
    opacity: .56, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const qteWater = new THREE.MeshBasicMaterial({ color: 0x89bcdb, transparent: true,
    opacity: .72, depthWrite: false, toneMapped: false });
  qteCup.add(new THREE.Mesh(new THREE.CylinderGeometry(.064, .052, .16, 20, 1, true), qteGlass));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(.064, .006, 8, 24), qteGlass);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = .08;
  qteCup.add(rim);
  const waterLevel = new THREE.Mesh(new THREE.CylinderGeometry(.054, .048, .068, 20), qteWater);
  waterLevel.position.y = -.042;
  qteCup.add(waterLevel);
  for (const child of qteCup.children) child.renderOrder = 10006;
  interfaces.add(qteCup);
  const qteHalo = new THREE.Group();
  qteHalo.name = 'qte-event-focus';
  const haloInner = new THREE.Mesh(new THREE.RingGeometry(.145, .166, 48),
    new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: .85,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  const haloOuter = new THREE.Mesh(new THREE.RingGeometry(.22, .232, 48),
    new THREE.MeshBasicMaterial({ color: 0xf472b6, transparent: true, opacity: .45,
      depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  haloInner.renderOrder = haloOuter.renderOrder = 10007;
  qteHalo.add(haloInner, haloOuter);
  qteHalo.visible = false;
  interfaces.add(qteHalo);
  const qteFocusLight = new THREE.PointLight(0xf472b6, 0, 2.2, 2);
  interfaces.add(qteFocusLight);
  const failureScreen = createFailureScreen(THREE, camera);
  const facePoint = new THREE.Vector3(0,-2,0);
  const face = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(.125), position: new CANNON.Vec3(0,-4,0) });
  world.addBody(face);
  const torso = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(.24), position: new CANNON.Vec3(0,-4,0) });
  world.addBody(torso);
  const ambientTargets = [...actors.slice(1), eventVisitor].map(character => {
    const body = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
      shape: new CANNON.Sphere(.19), position: new CANNON.Vec3(0,-4,0) });
    world.addBody(body);
    return { character, body };
  });
  const byBody = new Map(ambientTargets.map(({character,body}) => [body,character]));
  const handSteps = new Map();
  const swipes = new Map();
  let tickSeconds = 1 / 60;
  let npcClock;
  for (const prop of props) prop.body.addEventListener('collide', ({ body, contact }) => {
    const character = byBody.get(body);
    if ((!character && body !== face && body !== torso) || !current || prop.owner ||
      current.time - (prop.releasedAt ?? -20) > 2) return;
    const speed = Math.abs(contact.getImpactVelocityAlongNormal());
    const action = impactClass(speed, prop.body.mass);
    if (!action) return;
    const side = Math.sign(prop.body.velocity.x) || 1;
    if (character) {
      character.hit = { at: current.time, speed, side };
      audioCue('impact', new THREE.Vector3().copy(body.position));
    } else if (react(action, speed, side)) audioCue('impact', facePoint);
    prop.releasedAt = null;
  });
  const holds = new Map();
  let current;
  let lastView = '';
  let lastBeat;
  let lastResolvedMenu;
  let lastEventCue = '';
  let lastEventNotice = '';
  let lastEventVisual;
  let waiterEventStart;
  let tableService = null;
  let serviceRandom;
  let handledOrderTurns = new Set();
  const queuedOrders = [];
  let lastQteActive = false;
  let qteMenuLocked = false;
  let skillMenuLocked = false;
  let skillGuideClock = 0;
  let lastTutorialFrame = -1;
  let tutorialPresence = 0;
  let qteShadeAmount = 0;
  let lastQteTimerDrawn = -1;
  let lastQteSecond = 5;
  let qteMaterials;
  let lastWorldTint = -1;
  const grayTint = new THREE.Color();
  let lastCaption, lastGesture, lastSpoken;
  let gestureStart = 0;
  let renderedTime = 0;
  const hitTarget = new THREE.Vector3();

  function audioCue(kind, source) { announce(kind, source, candyAtmosphere(candy, reducedEffects())); }

  let previousEffects;
  function updateCandyLighting() {
    if (!candy) return;
    const reduced = reducedEffects();
    if (reduced === previousEffects) return;
    previousEffects = reduced;
    const effect = candyAtmosphere(candy, reduced);
    light.color.setHex(0xffdcc0).lerp(new THREE.Color(0xffb765), .57 * effect.amber)
      .lerp(new THREE.Color(0xfff4e7), .66 * effect.clarity);
    light.intensity = 2.1 + .28 * effect.amber + .09 * effect.clarity;
    for (const { bulb, spill } of lampFill) {
      bulb.color.setHex(0xffd38e).lerp(new THREE.Color(0xff9bbd), .80 * effect.rose);
      spill.intensity = .78 * effect.rose;
    }
  }
  updateCandyLighting();
  function tintWorld(amount, settings) {
    if (Math.abs(amount - lastWorldTint) < .005) return;
    lastWorldTint = amount;
    if (!qteMaterials) {
      qteMaterials = new Map();
      for (const root of [architecture, furnishings, tableProps, people]) root.traverse(item => {
        if (!item.isMesh) return;
        for (const material of Array.isArray(item.material) ? item.material : [item.material])
          if (material?.color && !qteMaterials.has(material)) qteMaterials.set(material, material.color.clone());
      });
    }
    for (const [material, original] of qteMaterials) {
      const luminance = original.r * .2126 + original.g * .7152 + original.b * .0722;
      material.color.copy(original).lerp(grayTint.setRGB(luminance, luminance, luminance),
        amount * (settings?.desaturate ?? .48));
    }
  }
  function resetProp(prop) {
    if (prop.owner) return;
    prop.releasedAt = null;
    prop.body.position.set(...prop.position);
    prop.body.previousPosition.copy(prop.body.position);
    prop.body.velocity.setZero();
    prop.body.angularVelocity.setZero();
    prop.body.quaternion.set(0, 0, 0, 1);
    prop.body.aabbNeedsUpdate = true;
    prop.body.wakeUp();
  }

  function replaySpeech() {
    if (!voice.state().busy) speech.say(current, true);
  }

  function tick(dt, view) {
    updateCandyLighting();
    current = view;
    tickSeconds = dt;
    const worldDt = view.worldDelta ?? dt;
    npcClock ??= createNpcClocks(view.session.eventSeed);
    const t = view.time;
    const beat = view.beat;
    const eventVisual = beat?.definition.visual ?? beat?.definition.id;
    if (eventVisual !== lastEventVisual) {
      waiterEventStart = actors[5].actor.position.clone();
      lastEventVisual = eventVisual;
    }
    const eventState = eventCueState(beat, t);
    const eventAge = beat ? Math.max(0, t - beat.at) : 0;
    const qte = view.qte;
    const qteSettings = qteConfig(beat?.definition.id);
    const qteActive = Boolean(qte);
    if (qteActive !== lastQteActive) {
      audioCue(qteActive ? 'qte_start' : 'qte_end', new THREE.Vector3(...(qteSettings?.focus ?? [-.32, 1.18, -.24])));
      lastQteActive = qteActive;
      qteMenuLocked = false;
    }
    qteShadeAmount = THREE.MathUtils.damp(qteShadeAmount, qteActive ? 1 : 0, qteActive ? 9 : 5, dt);
    qteShade.material.opacity = qteShadeAmount * (qteSettings?.dim ?? .38);
    qteShade.visible = qteShadeAmount > .01;
    if (qteActive || qteShadeAmount > .001) tintWorld(qteShadeAmount, qteSettings);
    else if (qteMaterials) tintWorld(0);
    qteTimer.visible = qteActive;
    if (qteActive) {
      const rounded = Math.ceil(qte.remaining * 20) / 20;
      const second = Math.ceil(qte.remaining);
      if (second < lastQteSecond && second > 0)
        audioCue('qte_tick', qteFocusPoint.fromArray(qteSettings.focus));
      lastQteSecond = second;
      if (rounded !== lastQteTimerDrawn) {
        lastQteTimerDrawn = rounded;
        qteTimer.userData.color = '#' + qteSettings.color.toString(16).padStart(6, '0');
        qteTimer.userData.draw(rounded, qte.duration, eventState?.title);
      }
      qteFocusPoint.fromArray(qteSettings.focus);
      qteSourcePoint.copy(qteFocusPoint);
      if (beat.definition.id === 'dropped_menu')
        qteSourcePoint.copy(propsById.menu.mesh.position).addScaledVector(worldUp, .12);
    } else {
      lastQteTimerDrawn = -1;
      lastQteSecond = 5;
    }
    qteHalo.visible = qteActive;
    qteFocusLight.intensity = qteShadeAmount * 2.2;
    if (qteActive) {
      qteHalo.position.copy(qteSourcePoint);
      qteFocusLight.position.copy(qteSourcePoint);
      if (viewerPosition) playerPosition.copy(viewerPosition());
      qteHalo.lookAt(playerPosition);
      qteHalo.scale.setScalar(THREE.MathUtils.clamp(playerPosition.distanceTo(qteSourcePoint) / 2.2, .8, 3.5));
      haloInner.material.color.setHex(qteSettings.color);
      haloOuter.material.color.setHex(qteSettings.color);
      qteFocusLight.color.setHex(qteSettings.color);
      haloInner.material.opacity = .7 + .12 * Math.sin((qte.duration - qte.remaining) * 5);
    }
    qteCup.visible = beat?.definition.id === 'water_spill' &&
      (qteActive || beat.phase === 'resolve');
    if (qteCup.visible) {
      const progress = qteActive ? 1 - qte.remaining / qte.duration : 1;
      const targetTip = beat?.choiceId === 'help' ? -.08 : -.7;
      qteCup.rotation.z = qteActive ? -.58 * THREE.MathUtils.smoothstep(progress, 0, 1) :
        THREE.MathUtils.lerp(qteCup.rotation.z, targetTip, Math.min(1, dt * 8));
    }
    eventNotice.visible = Boolean(eventState && eventState.opacity > .01 && beat.phase !== 'resolve' && !qteActive);
    if (eventNotice.visible) {
      eventNotice.material.opacity = eventState.opacity;
      eventNotice.position.y = -.455 - eventState.lift * .28;
      if (lastEventNotice !== eventState.title) {
        lastEventNotice = eventState.title;
        eventNotice.userData.draw(eventState.title);
      }
    } else lastEventNotice = '';
    eventCue.visible = Boolean(eventState && eventState.opacity > .01 && !qteActive);
    if (eventState) {
      eventCue.position.fromArray(eventState.anchor);
      eventCue.position.y += eventState.lift;
      if (viewerPosition) playerPosition.copy(viewerPosition());
      const distance = playerPosition.distanceTo(eventCue.position);
      eventCue.scale.setScalar(THREE.MathUtils.clamp(distance / 2.3, .8, 1.8));
      eventCue.lookAt(playerPosition);
      eventCue.material.opacity = eventState.opacity;
      const cueLabel = eventState.title + '|' + (eventState.remaining ?? '');
      if (cueLabel !== lastEventCue) {
        lastEventCue = cueLabel;
        eventCue.userData.draw(eventState.title, eventState.remaining);
      }
    } else lastEventCue = '';
    const flashProgress = beat?.phase === 'announce' ? (t - beat.at) / EVENT_VISUAL_STYLE.flashSeconds :
      qteActive ? (qte.duration - qte.remaining) / EVENT_VISUAL_STYLE.flashSeconds : 1;
    if (qteActive) eventFlash.material.color.setHex(qteSettings.color);
    else eventFlash.material.color.setHex(0xec4899);
    eventFlash.material.opacity = flashProgress >= 0 && flashProgress < 1 ?
      Math.sin(Math.PI * flashProgress) ** 2 * EVENT_VISUAL_STYLE.flashOpacity : 0;
    if (view.caption !== lastCaption || view.gesture !== lastGesture) {
      lastCaption = view.caption; lastGesture = view.gesture; gestureStart = t;
    }
    const duties = npcClock(t);
    for (let i = 0; i < duties.length; i++) actors[i+1].actor.userData.need = duties[i];
    actors[0].actor.userData.activity = view.departureAt != null ? 'leaving' :
      view.session.phase === 'dialogue' ? 'seated' : 'walking';
    actors[1].actor.userData.activity = duties[0].active ? 'restroom' : 'seated';
    actors[2].actor.userData.activity = duties[1].active ? 'eating' : 'seated';
    actors[3].actor.userData.activity = duties[2].active ? 'talking' : 'seated';
    actors[4].actor.userData.activity = !duties[3].active ? 'away' : duties[3].age < 5 || duties[3].age > 12 ? 'walking' : 'seated';
    const visitorState = friendVisitMotion(beat, t);
    eventVisitor.actor.userData.activity = visitorState.visible ?
      visitorState.arriving || visitorState.leaving && visitorState.progress > 0 ? 'walking' : 'waiting' : 'away';
    eventVisitor.actor.userData.need = { need: 'espera', level: visitorState.visible ? .8 : 0,
      remaining: Math.max(0, (beat?.closesAt ?? t) - t) };
    date.actor.userData.need = { need: 'conforto', level: view.session.relationship.safety / 100,
      remaining: Math.max(0, (beat?.closesAt ?? t) - t) };
    const dateRoute = layout.dateRoute;
    const moving = view.session.phase === 'arriving';
    const leave = view.departureAt == null ? -1 : t - view.departureAt;
    const exitProgress = THREE.MathUtils.clamp((leave - .7) / 4.1, 0, 1);
    date.actor.visible = view.session.phase !== 'waiting' && exitProgress < 1;
    const seated = ['seating', 'dialogue', 'ending', 'completed'].includes(view.session.phase);
    if (leave >= 0) updateActor(date, dateRoute, 1 - exitProgress, leave > .7 && exitProgress < 1,
      THREE.MathUtils.clamp(1 - leave / .7, 0, 1), worldDt, seats.date_seat.yaw, true);
    else updateActor(date, dateRoute, (t - 1) / 4, moving, seated ? Math.min(1, (t - 6.5) / .9) : 0, worldDt, seats.date_seat.yaw);
    const flinch = view.reaction && view.reaction.id.startsWith('impact_') && t - view.reaction.at < 1.2;
    if (flinch) date.actor.userData.activity = 'recoiling';
    if (flinch) date.animation.gesture('impact', t - view.reaction.at,
      Math.min(1.45, .5 + view.reaction.speed * .23), view.reaction.direction || 1);
    else if (qteActive && qte.duration - qte.remaining > 1.6)
      date.animation.gesture('startle', qte.duration - qte.remaining - 1.6);
    else if (visitorState.visible && !visitorState.leaving &&
      eventAge >= FRIEND_VISIT.arrivalSeconds - .25 && eventAge < FRIEND_VISIT.arrivalSeconds + 1.15)
      date.animation.gesture('look_away', eventAge - FRIEND_VISIT.arrivalSeconds + .25);
    else if (eventState && ['animate', 'choice_window'].includes(beat.phase) && t - beat.at < 2.65)
      date.animation.gesture(eventState.gesture, (t - beat.at - 1.1) % 1.7);
    else if (physicalScene.diningState().eating)
      date.animation.gesture('eat', physicalScene.diningState().elapsed % 1.5, .9);
    else if (view.gesture !== 'none') date.animation.gesture(view.gesture, t - gestureStart);
    if (seated && leave < 0) date.animation.mood(view.session.relationship, view.intent, view.emotion);
    const head = date.bones.Head;
    const barsEligible = Boolean(head && date.actor.visible && seated && leave < 0 &&
      view.session.phase !== 'completed');
    const activeSkill = physicalScene.state();
    const barsTarget = barsEligible && (!activeSkill || activeSkill.action.type === 'instant') ? 1 : 0;
    feelingBars.material.opacity = THREE.MathUtils.lerp(feelingBars.material.opacity, barsTarget,
      Math.min(1, dt * 9));
    feelingBars.visible = barsEligible && feelingBars.material.opacity > .025;
    if (head && date.actor.visible) {
      head.getWorldPosition(facePoint);
      const forward = new THREE.Vector3(0, -.05, .085).applyQuaternion(date.actor.quaternion);
      facePoint.add(forward);
      optionCenter.copy(facePoint);
      if (viewerPosition) playerPosition.copy(viewerPosition());
      dateForward.copy(playerPosition).sub(optionCenter).setY(0).normalize();
      dateRight.crossVectors(worldUp, dateForward).normalize();
      if (viewerDirection) {
        const alignment = gazeVector.copy(optionCenter).sub(playerPosition).normalize().dot(viewerDirection());
        if (gazeShowsMenu(alignment, gazeVisible)) {
          gazeVisible = true;
          gazeAwayFor = 0;
        } else if (gazeVisible) {
          gazeAwayFor += dt;
          if (gazeAwayFor >= INTERACTION_STYLE.gazeAwaySeconds) gazeVisible = false;
        }
      }
      face.position.copy(facePoint);
      face.aabbNeedsUpdate = true;
      torso.position.copy(facePoint.clone().add(new THREE.Vector3(0,-.36,-.08)));
      torso.aabbNeedsUpdate = true;
      if (feelingBars.visible) {
        feelingBars.userData.draw(view.session.relationship, t);
      }
    } else {
      facePoint.set(0,-4,0);
      face.position.copy(facePoint);
      torso.position.copy(facePoint);
      face.aabbNeedsUpdate = torso.aabbNeedsUpdate = true;
    }

    const wrist = date.bones.WristR;
    dateDrink.visible = Boolean(wrist && !flinch && view.gesture === 'sip' && t - gestureStart > .18 &&
      t - gestureStart < 1.28 && date.actor.visible);
    if (dateDrink.visible) wrist.getWorldPosition(dateDrink.position).add(new THREE.Vector3(0,.06,0));

    const visitorEntrance = visitorState.visible && eventAge < 1.8 ?
      -.72 * Math.sin(Math.PI * eventAge / 1.8) : 0;
    entrance.rotation.y = visitorEntrance ||
      (moving && t < 2.3 ? -.9 * Math.sin(Math.PI * Math.min(1, (t - 1) / 1.3)) : 0);

    const bathroomTime = duties[0].active ? duties[0].age : 0;
    const bathroomBeat = eventVisual === 'bathroom_mishap' &&
      ['qte','animate','choice_window','resolve','cooldown'].includes(beat.phase);
    const qteProgress = qteActive ? 1 - qte.remaining / qte.duration : 0;
    const doorJolt = bathroomBeat ? Math.max(0, 1 - Math.abs(eventAge - 2.1) / 1.8) : 0;
    const bathroomAngle = qteActive && eventVisual === 'bathroom_mishap' ?
      Math.sin(qteProgress * Math.PI * 12) * (.07 + .06 * Math.sin(Math.PI * qteProgress)) :
      bathroomBeat && beat.choiceId === 'help' ?
        -.72 * THREE.MathUtils.smoothstep(t - beat.resolvedAt, 0, .9) *
          (1 - THREE.MathUtils.smoothstep(t - beat.resolvedAt, 3.2, 4.5)) :
        bathroomBeat ? Math.sin(eventAge * 19) * .12 * doorJolt :
          bathroomTime >= 9 && bathroomTime < 11 || bathroomTime >= 14 && bathroomTime < 16 ? -.75 : 0;
    restroom.rotation.y = restroomYaw + bathroomAngle;
    const bath = bathroomTime < 6 ? 0 : bathroomTime < 11 ? (bathroomTime - 6) / 5 :
      bathroomTime < 14 ? 1 : Math.max(0, 1 - (bathroomTime - 14) / 5);
    const bathSit = bathroomTime < 6 ? THREE.MathUtils.clamp(6 - bathroomTime, 0, 1) :
      THREE.MathUtils.clamp(bathroomTime - 19, 0, 1);
    updateActor(actors[1], layout.restroomRoute, bath, (bath > 0 && bath < 1), picnic ? 0 : bathSit,
      worldDt, seats.restroom_guest.yaw, bathroomTime >= 14);
    actors[1].actor.visible = bath !== 1;
    for (const [index, name] of [[2, 'chat_near'], [3, 'chat_far']]) {
      const seat = seats[name];
      if (picnic) {
        const direction = index === 2 ? 1 : -1;
        const progress = (t + index * 6) % 21 / 21;
        updateActor(actors[index], [[-6 * direction, 0, -3.18], [6 * direction, 0, -3.54]],
          progress, true, 0, worldDt, seat.yaw);
        actors[index].actor.userData.activity = 'walking';
      } else updateActor(actors[index], [seat.position], 0, false, 1, worldDt, seat.yaw);
      if (duties[index - 1].active && beat?.phase !== 'animate' && beat?.phase !== 'choice_window')
        actors[index].animation.gesture(index === 2 ? 'sip' : 'nod', duties[index-1].age);
    }
    const entryDuty = duties[3];
    const entry = entryDuty.age;
    const guest = entry < 5 ? entry / 5 : entry > 12 ? Math.max(0, 1 - (entry - 12) / 6) : 1;
    const guestSit = THREE.MathUtils.clamp(Math.min(entry - 5, 12 - entry), 0, 1);
    actors[4].actor.visible = entryDuty.active;
    if (entryDuty.active) updateActor(actors[4], layout.entranceRoute, guest, guest > 0 && guest < 1, picnic ? 0 : guestSit, worldDt,
      seats.entry_guest.yaw, entry > 12);
    eventVisitor.actor.visible = visitorState.visible;
    if (visitorState.visible) {
      const route = visitorState.leaving ? [...FRIEND_VISIT.route].reverse() : FRIEND_VISIT.route;
      updateActor(eventVisitor, route, visitorState.progress,
        visitorState.leaving ? visitorState.progress > 0 && visitorState.progress < 1 : visitorState.arriving,
        0, worldDt, -Math.PI / 2);
      if (!visitorState.leaving && eventAge >= FRIEND_VISIT.arrivalSeconds - .45)
        eventVisitor.animation.gesture('wave', eventAge - FRIEND_VISIT.arrivalSeconds + .45);
      if (visitorState.leaving && beat.choiceId === 'introduce')
        eventVisitor.animation.gesture('nod', t - beat.resolvedAt);
      if (eventCue.visible && eventVisual === 'awkward_friend') {
        eventCue.position.copy(eventVisitor.actor.position).addScaledVector(worldUp, 1.84);
        eventCue.lookAt(playerPosition);
      }
      if (renderedTime < beat.at + FRIEND_VISIT.arrivalSeconds &&
        t >= beat.at + FRIEND_VISIT.arrivalSeconds)
        audioCue('friend_arrival', eventVisitor.actor.position);
    }
    const shift = duties[4].active ? duties[4].age + 3 : 0;
    const waiterAtDate = ['water_spill','wrong_order'].includes(eventVisual) && beat.phase !== 'cooldown';
    const server = actors[5];
    const previousServer = server.actor.position.clone();
    const servingProgress = THREE.MathUtils.smoothstep(eventAge, .1, 2.7);
    const servingRoute = waiterAtDate ? [waiterEventStart.toArray(), [-1.15,0,-.64]] : layout.waiterRoute;
    const tableMotion = updateTableService(t, worldDt, view.orders);
    server.actor.visible = !picnic || Boolean(tableMotion) || waiterAtDate;
    server.actor.userData.activity = tableMotion || waiterAtDate ? 'serving' : server.actor.visible ? 'waiting' : 'away';
    const carryingOrder = tableMotion?.phase === 'returning' || tableMotion?.phase === 'presenting' && !tableMotion.delivered;
    const eventTray = waiterAtDate && eventVisual === 'water_spill';
    tray.visible = carryingOrder || eventTray;
    trayMount.visible = carryingOrder;
    trayDish.visible = carryingOrder && menuItems.find(item => item.id === tableMotion.order.id)?.category !== 'drinks';
    if (!tableMotion && waiterAtDate) {
      updateActor(server, servingRoute, servingProgress, servingProgress < 1, 0, worldDt,
        -Math.PI / 2, false);
    } else if (!tableMotion) {
      const counter = layout.stations.find(item => item.id === 'service_counter').position;
      server.actor.position.set(counter[0], counter[1], counter[2]);
      server.actor.rotation.y += Math.atan2(Math.sin(-Math.PI / 2 - server.actor.rotation.y),
        Math.cos(-Math.PI / 2 - server.actor.rotation.y)) * Math.min(1, worldDt * 2.5);
      const idle = server.clips.idle;
      if (idle && idle !== server.active) { server.active?.fadeOut(.24); idle.reset().fadeIn(.24).play(); server.active = idle; }
      server.mixer.update(worldDt);
      server.seatPose.apply(0);
    } else if (tableMotion.phase === 'presenting') {
      server.animation.gesture('reach', Math.min(1.49, t - tableMotion.deliveryAt), .85);
    }
    server.actor.userData.activity = tableMotion ?
      (['approaching','departing','returning','leaving'].includes(tableMotion.phase) ? 'walking' :
        tableMotion.phase === 'presenting' ? 'serving' : 'waiting') : waiterAtDate ? 'serving' : 'waiting';
    if (renderedTime > 0) {
      const intended = server.actor.position.clone().sub(previousServer);
      const maxSpeed = tableMotion ? 1.08 : waiterAtDate ? 1.35 : 0;
      if (intended.length() > worldDt * maxSpeed)
        server.actor.position.copy(previousServer.add(intended.clampLength(0, worldDt * maxSpeed)));
    }
    wrongDish.visible = eventVisual === 'wrong_order' && ['animate','choice_window','resolve'].includes(beat.phase);
    wrongDish.rotation.z = wrongDish.visible ? Math.sin(Math.min(3, eventAge) * 8) * .14 *
      Math.max(0, 1 - eventAge / 3) : 0;
    if (beat && ['qte', 'animate', 'choice_window'].includes(beat.phase)) {
      if (eventVisual === 'water_spill') server.animation.gesture('startle',
        qteActive ? qte.duration - qte.remaining - 1.4 : eventAge - 2.05);
      if (eventVisual === 'wrong_order') server.animation.gesture('shrug', eventAge - 2.0);
      if (eventVisual === 'loud_guest' && actors[2].bones.Head) {
        actors[2].animation.gesture('laugh', Math.min(1.42, Math.max(0, t - beat.at - .55)));
      }
    }
    tray.rotation.z = qteActive ? .44 * THREE.MathUtils.smoothstep(1 - qte.remaining / qte.duration, .1, .92) :
      eventVisual === 'water_spill' && beat.phase === 'animate' ?
        .43 * Math.sin(Math.PI * THREE.MathUtils.smoothstep(eventAge, 1.45, 2.7)) : 0;
    if (beat && (beat.phase === 'animate' || qteActive && eventVisual !== 'water_spill') &&
      lastBeat !== beat.definition.id) {
      lastBeat = beat.definition.id;
      const emitter = picnic && eventVisual === 'water_spill' ? propsById.picnic_kombucha.mesh.position :
        eventVisual === 'loud_guest' ? actors[2].actor.position :
        eventVisual === 'bathroom_mishap' ? restroom.position :
          eventVisual === 'awkward_friend' ? eventVisitor.actor.position : actors[5].actor.position;
      audioCue(eventVisual, emitter);
      if (beat.presentation.prop) {
        const prop = propsById[beat.presentation.prop];
        if (prop) {
          resetProp(prop);
          if (!prop.owner && eventVisual === 'dropped_menu') prop.body.velocity.set(0, .17, 1.27);
          if (picnic && !prop.owner && eventVisual === 'water_spill')
            prop.body.angularVelocity.set(0, 0, 7);
        }
      }
    }
    if (eventVisual === 'dropped_menu' && beat.phase === 'resolve' && beat.choiceId === 'grab' &&
      lastResolvedMenu !== beat.resolvedAt) {
      lastResolvedMenu = beat.resolvedAt;
      resetProp(propsById.menu);
    }
    const water = eventVisual === 'water_spill' && beat.choiceId !== 'help' &&
      ['animate','choice_window','resolve'].includes(beat.phase);
    for (let i = 0; i < splash.length; i++) {
      const flying = water && eventAge >= 2 && eventAge < 3.45;
      splash[i].visible = water && (flying || eventAge >= 3.45);
      const flight = THREE.MathUtils.clamp((eventAge - 2 - i * .055) / .75, 0, 1);
      const angle = i * 2.4;
      splash[i].position.set((picnic ? .25 : -.32) + Math.cos(angle) * (.035 + flight * .14),
        (picnic ? .031 : .793) + (flying ? .027 + Math.sin(Math.PI * flight) * (.09 + i * .008) : 0),
        (picnic ? .27 : beat?.choiceId === 'protect' ? .08 : -.25) + Math.sin(angle) * (.035 + flight * .15));
    }
    if (renderedTime < 1 && t >= 1) {
      audioCue('entrance', date.actor.position);
      if (candy === 'hortela') audioCue('mint', date.actor.position);
    }
    if (moving && Math.floor(t * 2) !== Math.floor(renderedTime * 2)) audioCue('step', date.actor.position);
    if (Math.floor(t / 6) > Math.floor(renderedTime / 6))
      audioCue('ambience', actors[picnic ? 2 : 5].actor.position);
    renderedTime = t;

    for (const { character, body } of ambientTargets) {
      if (character.actor.visible && character.bones.Head) {
        if (character.hit && t - character.hit.at < 1.35) {
          character.animation.reset();
          character.animation.gesture('impact', t - character.hit.at,
            Math.min(1.3, character.hit.speed * .25), character.hit.side);
        }
        const at = character.bones.Head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,-.25,0));
        body.position.copy(at);
      } else body.position.set(0,-4,0);
      body.aabbNeedsUpdate = true;
    }
    world.step(1 / 90, worldDt, 5);
    for (const prop of props) {
      if (prop.cloth) {
        const target = prop.owner ? prop.pull : 0;
        prop.setPull(prop.edge, target, Math.min(1, dt * 12), prop.clothAnchor);
      }
      if (prop.body.position.y < -.22 || Math.abs(prop.body.position.x) > 6 || prop.body.position.z > 2.2) resetProp(prop);
      prop.mesh.position.copy(prop.body.position);
      prop.mesh.quaternion.copy(prop.body.quaternion);
    }
    physicalScene.tick(dt, view);
    animateMenu(dt);
    if (menuState.held && view.canSpeak && !physicalScene.state() && !speech.playing()) voice.resumeMenu();
    const voiceState = voice.state();
    const orderHint = menuState.held ? (voiceState.menuRecording ? '● Microfone aberto · diga o nome do item' :
      voiceState.message || (!voiceState.ready ? 'Microfone indisponível neste navegador' :
        voiceState.menuPaused ? 'Solte e pegue o cardápio para reabrir o microfone' :
          'O microfone abre quando a personagem terminar de falar')) : '';
    if (orderHint !== lastOrderHint) {
      lastOrderHint = orderHint;
      orderHud.visible = Boolean(orderHint);
      if (orderHint) orderHud.userData.draw(orderHint, null, voiceState.menuRecording ? 'recording' : 'default');
    }
    const spoken = view.caption + '|' + (view.speechRef ?? '');
    if (voiceState.busy) speech.stop();
    else if (spoken !== lastSpoken) {
      lastSpoken = spoken;
      speech.say(view);
    }
    const skill = physicalScene.state();
    if (!skill) {
      skillMenuLocked = false;
      skillGuide.visible = skillHelp.visible = skillCancel.visible = false;
      tutorialPresence = Math.max(0, tutorialPresence - dt * 5);
      tutorialPanel.visible = tutorialPresence > .02;
    }
    else {
      if (!skillMenuLocked) {
        skillMenuCenter.fromArray(fixedSkillAnchor(playerPosition.toArray(),
          viewerDirection?.().toArray() ?? [0,0,-1]));
        skillMenuFacing.copy(playerPosition).sub(skillMenuCenter).setY(0).normalize();
        skillMenuRight.crossVectors(worldUp, skillMenuFacing).normalize();
        skillMenuLocked = true;
        skillGuideClock = 1;
      }
      const tutorial = skill.stage === 'tutorial';
      tutorialPresence = THREE.MathUtils.clamp(tutorialPresence + dt * (tutorial ? 4 : -5), 0, 1);
      tutorialPanel.visible = tutorialPresence > .02;
      if (tutorialPanel.visible) {
        tutorialPanel.position.copy(skillMenuCenter).addScaledVector(skillMenuRight, .57)
          .addScaledVector(worldUp, .065 - (1 - tutorialPresence) * .045);
        tutorialPanel.lookAt(playerPosition);
        tutorialPanel.scale.setScalar(.94 + tutorialPresence * .06);
        tutorialSurface.material.opacity = tutorialButton.material.opacity = tutorialPresence;
      }
      if (tutorial) {
        const frame = Math.floor(t * 20);
        if (frame !== lastTutorialFrame) {
          tutorialSurface.userData.draw({ info: SKILL_TUTORIALS[skill.action.id],
            vr: isVr(), age: t });
          lastTutorialFrame = frame;
        }
      }
      skillHelp.visible = skill.action.type !== 'instant' && skill.stage !== 'tutorial' && skill.stage !== 'result';
      skillCancel.visible = skill.action.type !== 'instant' && skill.stage !== 'result';
      for (const [item, side] of [[skillHelp, 1], [skillCancel, -1]]) if (item.visible) {
        item.position.copy(skillMenuCenter).addScaledVector(skillMenuRight, side * .63)
          .addScaledVector(worldUp, .37);
        item.lookAt(playerPosition);
        item.userData.draw(item === skillHelp ? '?' : '×', null, item.userData.focused ? 'focus' : 'default');
      }
      skillGuide.visible = skill.action.type !== 'instant' && !tutorial &&
        (skill.stage === 'countdown' || skill.stage === 'result' || skill.feedback?.age < 1.05);
      if (skillGuide.visible) {
        skillGuide.position.copy(skillMenuCenter).addScaledVector(skillMenuRight, -.46)
          .addScaledVector(worldUp, SKILL_UI.guideLift);
        skillGuide.lookAt(playerPosition);
        skillGuideClock += dt;
        if (skillGuideClock >= .033) { skillGuide.userData.draw(skill); skillGuideClock = 0; }
      }
    }
    if (beat || view.session.phase !== 'dialogue') interactionMenu = 'root';
    const eventChoice = beat && ['qte', 'animate', 'choice_window'].includes(beat.phase);
    const contextualChoices = eventChoice ? view.choices : view.choices.filter(choice => choice.id === 'finish');
    const actions = contextualChoices.map(choice => ({
      key: 'choice:' + choice.id,
      label: choice.label,
      event: beat && ['qte', 'animate', 'choice_window'].includes(beat.phase),
      tone: choice.id === 'middle_finger' ? 'danger' : 'default',
      action: () => {
      if (choice.id === 'middle_finger') onGesture?.();
      voice.choose(choice.id);
      }
    }));
    const utilities = [];
    if (skill) {
      // Skill scenes use their own spatial controls and tutorial, not the conversation arc.
    } else if (view.session.phase === 'completed') utilities.push({ key: 'exit', label: 'Sair', action: restart });
    else if (view.session.phase === 'dialogue' && !eventChoice && (!voiceState.busy || voiceState.recording)) {
      const availablePhysical = availablePhysicalActions({ phase: view.session.phase, event: beat,
        busy: voiceState.busy || !view.canSpeak || holds.size > 0, time: t,
        lastUsed: physicalScene.lastUsed(), objects: physicalScene.objects() });
      if (interactionMenu === 'root') {
        if (availablePhysical.length) utilities.push({ key: 'interact', label: 'Interagir',
          action: () => { interactionMenu = 'categories'; } });
        if (!menuState.held && voiceState.ready && view.canSpeak) utilities.push({ key: 'speak',
          label: voiceState.recording ? 'Enviar' : 'Falar livremente', action: voice.toggle,
          tone: voiceState.recording ? 'recording' : 'voice' });
        if (voiceState.consented || voiceState.menuRecording) utilities.push({ key: 'cancel-voice', label: 'Desligar voz', action: voice.cancel });
        utilities.push({ key: 'recenter', label: 'Centralizar', action: recenter });
      } else if (interactionMenu === 'categories') {
        for (const category of actionCategories.filter(item => availablePhysical.some(action => action.category === item)))
          utilities.push({ key: 'category:' + category, label: category,
            action: () => { interactionCategory = category; interactionMenu = 'actions'; } });
        utilities.push({ key: 'back', label: 'Voltar', action: () => { interactionMenu = 'root'; } });
      } else {
        for (const action of availablePhysical.filter(item => item.category === interactionCategory))
          utilities.push({ key: 'physical:' + action.id, label: action.label,
            action: () => { if (physicalScene.begin(action.id, view)) {
              speech.stop();
              interactionMenu = 'root';
            } } });
        utilities.push({ key: 'back', label: 'Voltar', action: () => { interactionMenu = 'categories'; } });
      }
    }
    const remaining = beat?.phase === 'choice_window' && Number.isFinite(beat.closesAt) ?
      Math.max(0, Math.ceil(beat.closesAt - t)) : null;
    const mic = voiceState.recording ? '  ' + '▰'.repeat(voiceState.level) + '▱'.repeat(5 - voiceState.level) : '';
    const statusLine = [view.reflecting ? 'Ouça a resposta antes de continuar' : '',
      !menuState.held && voiceState.message ? voiceState.message + mic : '',
      remaining == null ? '' : remaining + ' s para decidir'
    ].filter(Boolean).join('  ·  ');
    const label = [view.caption, view.result, statusLine, ...actions.map(action => action.label),
      ...utilities.map(action => action.label)].join('|');
    if (label !== lastView) {
      lastView = label;
      heading.userData.draw(view.caption);
      status.visible = Boolean(statusLine);
      if (status.visible) status.userData.draw(statusLine);
      panelSurface.userData.draw();
    }
    const available = [...actions, ...utilities];
    const eventNeedsChoice = eventChoice;
    menuPresence = THREE.MathUtils.clamp(menuPresence + dt /
      (gazeVisible || eventNeedsChoice ? INTERACTION_STYLE.gazeEnterSeconds : -INTERACTION_STYLE.gazeExitSeconds), 0, 1);
    const slots = qteActive || skill ? qteMenuSlots(available.length) : arcSlots(available.length);
    const eventPlacement = eventArcPlacement(beat);
    if (qteActive && !qteMenuLocked) {
      qteMenuCenter.fromArray(qteMenuAnchor(qteFocusPoint.toArray(), playerPosition.toArray(),
        viewerDirection?.().toArray() ?? [0,0,-1]));
      qteMenuFacing.copy(playerPosition).sub(qteMenuCenter).setY(0).normalize();
      qteMenuRight.crossVectors(worldUp, qteMenuFacing).normalize();
      qteMenuLocked = true;
    }
    const width = cardWidth(available.length);
    const activeKeys = new Set();
    available.forEach((option, index) => {
      activeKeys.add(option.key);
      const card = cards.get(option.key) ?? makeCard(option.key);
      const data = card.userData;
      data.action = option.action;
      if (data.event !== Boolean(option.event)) {
        data.event = Boolean(option.event);
        data.width = 0;
      }
      if (data.text !== option.label || data.width !== width) {
        data.text = option.label;
        drawCard(card, width);
      }
      const slot = slots[index];
      data.target.copy(qteActive ? qteMenuCenter : skill ? skillMenuCenter : optionCenter)
        .addScaledVector(qteActive ? qteMenuRight : skill ? skillMenuRight : dateRight, slot.x)
        .addScaledVector(worldUp, slot.y - (qteActive || skill ? 0 : eventPlacement.drop))
        .addScaledVector(qteActive ? qteMenuFacing : skill ? skillMenuFacing : dateForward,
          qteActive || skill ? 0 : slot.depth + eventPlacement.forward)
        .addScaledVector(worldUp, -INTERACTION_STYLE.gazeRise * (1 - menuPresence));
      panel.worldToLocal(data.target);
      if (data.entering) {
        card.position.copy(data.target).addScaledVector(worldUp, -.075);
        data.entering = false;
      }
      card.visible = menuPresence > .04;
      card.position.lerp(data.target, Math.min(1, dt * INTERACTION_STYLE.moveSpeed));
      card.lookAt(playerPosition);
      card.rotateZ(slot.tilt);
      data.opacity = Math.min(1, data.opacity + dt / INTERACTION_STYLE.enterSeconds);
      const selected = data.focused || t < data.flashUntil;
      if (data.selected !== (t < data.flashUntil)) {
        data.selected = t < data.flashUntil;
        drawCard(card, width);
      }
      data.background.material.opacity = data.opacity * menuPresence * (selected ? 1 : INTERACTION_STYLE.opacity);
      data.label.material.opacity = data.opacity * menuPresence;
      const cueAge = beat?.phase === 'choice_window' ? Math.max(0, t - beat.at - 3.2) : Infinity;
      const cuePulse = data.event && cueAge < EVENT_VISUAL_STYLE.focusPulseSeconds ?
        Math.sin(Math.PI * cueAge / EVENT_VISUAL_STYLE.focusPulseSeconds) * (EVENT_VISUAL_STYLE.pulseScale - 1) : 0;
      const scale = data.focused ? INTERACTION_STYLE.focusScale : 1 + cuePulse;
      card.scale.setScalar(THREE.MathUtils.lerp(card.scale.x, scale, Math.min(1, dt * 14)));
    });
    for (const [key, card] of cards) {
      if (activeKeys.has(key)) continue;
      const data = card.userData;
      data.action = null;
      data.opacity = Math.max(0, data.opacity - dt / INTERACTION_STYLE.enterSeconds);
      data.background.material.opacity = data.opacity * menuPresence * INTERACTION_STYLE.opacity;
      data.label.material.opacity = data.opacity * menuPresence;
      if (data.opacity === 0) card.visible = false;
    }
    failureScreen.update(view);
  }

  function updateActor(character, route, amount, walk, sitting, dt, yaw, reverse = false) {
    const { actor, mixer, clips, seatPose, animation } = character;
    animation.reset();
    seatPose.reset();
    const clamped = Math.min(1, Math.max(0, amount));
    const lengths = route.slice(0, -1).map((point, i) => Math.hypot(point[0] - route[i + 1][0], point[2] - route[i + 1][2]));
    let distance = clamped * lengths.reduce((sum, length) => sum + length, 0);
    let part = 0;
    while (part < lengths.length - 1 && distance > lengths[part]) distance -= lengths[part++];
    const from = route[part], to = route[part + 1] ?? from;
    const blend = lengths[part] ? distance / lengths[part] : 0;
    actor.position.set(THREE.MathUtils.lerp(from[0], to[0], blend), 0,
      THREE.MathUtils.lerp(from[2], to[2], blend));
    const targetYaw = walk ? Math.atan2(to[0] - from[0], to[2] - from[2]) + (reverse ? Math.PI : 0) : yaw;
    if (character.isWaiter) {
      const difference = Math.atan2(Math.sin(targetYaw - actor.rotation.y), Math.cos(targetYaw - actor.rotation.y));
      actor.rotation.y += difference * Math.min(1, dt * 3.2);
    } else actor.rotation.y = targetYaw;
    const clip = walk ? clips.walk : clips.idle;
    if (clip && clip !== character.active) {
      character.active?.fadeOut(.16);
      clip.reset().fadeIn(.16).play();
      character.active = clip;
    }
    mixer.update(dt);
    seatPose.apply(sitting);
  }

  const tableServicePoint = [1.15, 0, -.78];
  function beginTableService() {
    if (tableService) return;
    const origin = actors[5].actor.position.toArray();
    const route = [origin, [3.9, 0, -3.7], [2.5, 0, -3.7],
      [1.15, 0, -2.25], tableServicePoint];
    tableService = { phase: 'approaching', route, startedAt: current?.time ?? 0, order: null,
      wait: 0, deliveryAt: 0 };
  }
  const pathLength = route => route.slice(1).reduce((total, point, index) => {
    const from = route[index]; return total + Math.hypot(point[0] - from[0], point[2] - from[2]);
  }, 0);
  function serviceProgress(route, startedAt, time) {
    const length = Math.max(.1, pathLength(route));
    const duration = length / .95 * 1.32;
    return { progress: THREE.MathUtils.smoothstep(time - startedAt, 0, duration), duration };
  }
  function updateTableService(time, worldDt, orders) {
    if (!tableService && (menuState.held || queuedOrders.length)) beginTableService();
    for (const order of orders ?? []) {
      const reference = order.reference ?? order.turn;
      if (handledOrderTurns.has(reference)) continue;
      handledOrderTurns.add(reference);
      if (!tableService) beginTableService();
      queuedOrders.push(order);
    }
    if (!tableService) return false;
    const state = tableService;
    const server = actors[5];
    if (state.phase === 'ready' && queuedOrders.length) {
      state.order = queuedOrders.shift();
      state.phase = 'departing';
      state.startedAt = time;
      state.route = [...state.route].reverse();
    } else if (state.phase === 'waiting_food' && time >= state.readyAt) {
      state.phase = 'returning'; state.startedAt = time;
      state.route = [...state.route].reverse();
      physicalScene.prepareOrder(state.order.id, trayMount);
    }
    if (state.phase === 'approaching' || state.phase === 'departing' || state.phase === 'returning' || state.phase === 'leaving') {
      const travel = serviceProgress(state.route, state.startedAt, time);
      updateActor(server, state.route, travel.progress, travel.progress < .999, 0, worldDt,
        -Math.PI / 2, false);
      if (travel.progress >= .999) {
        if (state.phase === 'approaching') { state.phase = 'ready'; state.route = [...state.route]; }
        else if (state.phase === 'departing') {
          state.phase = 'waiting_food';
          serviceRandom ??= seededRandom((current?.session.eventSeed ?? 1) ^ 0x2f59a15d);
          state.readyAt = time + 4.5 + serviceRandom() * 5.5;
        } else if (state.phase === 'returning') {
          state.phase = 'presenting'; state.deliveryAt = time;
        } else if (state.phase === 'leaving') tableService = null;
      }
    } else if (state.phase === 'ready' || state.phase === 'waiting_food' || state.phase === 'presenting') {
      server.actor.position.set(...(state.phase === 'waiting_food' ? state.route.at(-1) : tableServicePoint));
      server.actor.rotation.y = -Math.PI / 2;
      const clip = server.clips.idle;
      if (clip && clip !== server.active) { server.active?.fadeOut(.2); clip.reset().fadeIn(.2).play(); server.active = clip; }
      server.mixer.update(worldDt);
      server.seatPose.apply(0);
      if (state.phase === 'presenting' && !state.delivered && time - state.deliveryAt >= .30) {
        state.delivered = physicalScene.serveOrder(Math.min(1, (time - state.deliveryAt - .30) / .65));
        if (state.delivered) audioCue('interaction_clink', server.actor.position);
      }
      if (state.phase === 'presenting' && time - state.deliveryAt > 2.1) {
        state.phase = 'leaving'; state.startedAt = time; state.route = [...state.route].reverse();
      }
      if (state.phase === 'waiting_food' && state.order) {
        state.phase = 'waiting_food';
      }
    }
    return state;
  }

  function pickup(id, prop, point, rotation, distance, from = point) {
    if (!prop || prop.owner || holds.has(id) || prop === menuProp && menuReturning) return false;
    prop.owner = id;
    prop.releasedAt = null;
    const offset = new THREE.Vector3().copy(prop.body.position).sub(point).applyQuaternion(rotation.clone().invert());
    const q = rotation.clone().invert().multiply(new THREE.Quaternion().copy(prop.body.quaternion));
    const side = id.endsWith('left') ? 'left' : 'right';
    const grip = prop.grip_zones && authoredGrip(THREE, prop.body, prop.grip_zones, point, from, rotation, side);
    holds.set(id, { prop, offset, q, distance, grip, start: point.clone() });
    if (prop.cloth) {
      prop.pull = 0;
      prop.edge = grip?.zone;
      prop.clothAnchor = grip?.anchor;
    } else makeKinematic(prop.body);
    if (prop.id === 'menu') {
      menuState.held = true;
      prop.body.velocity.setZero();
      prop.body.angularVelocity.setZero();
      renderMenuPages();
      presentMenu();
      beginTableService();
    }
    if (current?.beat && ['qte', 'animate', 'choice_window'].includes(current.beat.phase) &&
      current.beat.presentation.prop === prop.id)
      voice.choose(current.beat.presentation.action);
    if (prop.id === 'menu') {
      interactionMenu = 'root';
      voice.setMenuHeld(true, !speech.playing());
    }
    return true;
  }

  function press(id, ray, rotation, directPoint, grab, wrist = ray.ray.origin) {
    if (failureScreen.visible) {
      if (failureScreen.ready && !grab) restart();
      return true;
    }
    const interactiveButtons = [...cards.values()].filter(card => card.visible && card.userData.action);
    const minigameButtons = [tutorialButton, skillHelp, skillCancel].filter(item => item.visible && item.parent?.visible);
    const buttonHits = ray.intersectObjects([heading, ...minigameButtons,
      ...interactiveButtons.flatMap(card => card.children)]);
    const button = buttonHits[0];
    if (!grab && button) {
      const card = button.object.userData.card;
      if (card) {
        card.userData.flashUntil = current.time + .18;
        card.userData.selected = true;
        drawCard(card, card.userData.width);
        card.userData.action?.();
      } else button.object.userData.action?.();
      return true;
    }
    const skillState = physicalScene.state();
    if (skillState) {
      if (skillState.action.id === 'toast' && grab) {
        const prop = propsById.cup;
        if (directPoint && directPoint.distanceTo(prop.mesh.position) < .18)
          return pickup(id, prop, directPoint, rotation, 0);
        const cupHit = ray.intersectObjects([prop.mesh], true)[0];
        if (cupHit && cupHit.distance < 3.8) return pickup(id, prop, cupHit.point, rotation, cupHit.distance);
      }
      return true;
    }
    if (current?.qte && (ray.intersectObjects(qteCup.children, true)[0]?.distance < 3.8 ||
      directPoint?.distanceTo(qteCup.position) < .17)) {
      voice.choose('help');
      return true;
    }
    const eligible = props.filter(prop => !prop.owner);
    const hit = ray.intersectObjects(eligible.map(prop => prop.mesh), true)[0];
    if (!grab && hit && hit.distance <= 3.8) {
      const basket = propsById.picnic_basket;
      if (basket?.lids.some(lid => lid === hit.object || lid.children.includes(hit.object))) {
        basket.open = !basket.open;
        basket.setOpen(Number(basket.open));
        return true;
      }
    }
    if (directPoint) {
      let nearest, best = Infinity;
      for (const prop of eligible) {
        const distance = prop.grip_zones ? gripSurface(THREE, prop.body)(directPoint) :
          directPoint.distanceTo(prop.mesh.position) - Math.max(...prop.size) / 2;
        if (distance >= best || distance >= .07) continue;
        best = distance;
        nearest = prop;
      }
      if (pickup(id, nearest, directPoint, rotation, 0, wrist)) return true;
    }
    if (!hit || hit.distance > 3.8) return false;
    let object = hit.object;
    while (object.parent !== tableProps) object = object.parent;
    return pickup(id, eligible.find(prop => prop.mesh === object), hit.point, rotation, hit.distance, ray.ray.origin);
  }

  function focus(ray) {
    if (failureScreen.visible) return;
    const minigameButtons = [tutorialButton, skillHelp, skillCancel].filter(item => item.visible && item.parent?.visible);
    const hit = ray?.intersectObjects([...minigameButtons,
      ...[...cards.values()].filter(card => card.visible && card.userData.action)
        .flatMap(card => card.children)])[0];
    const next = hit?.object.userData.card ?? null;
    for (const item of minigameButtons) {
      const focused = hit?.object === item;
      if (item.userData.focused === focused) continue;
      item.userData.focused = focused;
      item.userData.draw(item === tutorialButton ? 'Vamos lá!' : item === skillHelp ? '?' : '×',
        null, focused ? 'focus' : 'default');
    }
    for (const card of cards.values()) {
      const focused = card === next;
      if (focused === card.userData.focused) continue;
      card.userData.focused = focused;
      drawCard(card, card.userData.width);
    }
  }

  function pokeNear(point, activate = false) {
    if (failureScreen.visible) {
      if (activate && failureScreen.ready) restart();
      return true;
    }
    if (current?.qte && point.distanceTo(qteCup.position) < .17) {
      if (activate) voice.choose('help');
      return true;
    }
    for (const item of [tutorialButton, skillHelp, skillCancel]) {
      if (!item.visible || !item.parent?.visible) continue;
      item.worldToLocal(hitTarget.copy(point));
      if (Math.abs(hitTarget.x) < item.userData.hitHalf[0] &&
        Math.abs(hitTarget.y) < item.userData.hitHalf[1] && Math.abs(hitTarget.z) < .085) {
        if (activate) item.userData.action?.();
        return true;
      }
    }
    for (const item of cards.values()) {
      if (!item.visible || !item.userData.action) continue;
      item.worldToLocal(hitTarget.copy(point));
      const halfWidth = item.userData.width / 2, halfHeight = INTERACTION_STYLE.cardHeight / 2;
      if (Math.abs(hitTarget.x) < halfWidth && Math.abs(hitTarget.y) < halfHeight && Math.abs(hitTarget.z) < .023) {
        if (activate) {
          item.userData.flashUntil = current.time + .18;
          item.userData.selected = true;
          drawCard(item, item.userData.width);
          item.userData.action();
        }
        return true;
      }
    }
    if (physicalScene.state()) return true;
    return false;
  }

  function move(id, ray, rotation, directPoint) {
    const held = holds.get(id);
    if (!held) {
      const swipe = swipes.get(id);
      if (swipe) handContact(id, ray.ray.at(swipe, new THREE.Vector3()));
      return;
    }
    const { prop, offset, q, distance } = held;
    if (prop === menuProp) {
      const point = directPoint ?? ray.ray.at(.65, new THREE.Vector3());
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(menuReadRotation);
      const horizontal = point.dot(right);
      const dx = horizontal - (held.menuLastX ?? horizontal);
      held.menuTravel = Math.abs(dx) < .002 ? 0 : (held.menuTravel ?? 0) + dx;
      if (Math.abs(held.menuTravel) >= .14 && current.time >= (held.nextFlipAt ?? 0) &&
        turnMenuPage(-Math.sign(held.menuTravel))) {
        held.nextFlipAt = current.time + .65;
        held.menuTravel = 0;
      }
      held.menuLastX = horizontal;
      return;
    }
    const point = distance ? ray.ray.at(distance, new THREE.Vector3()) : directPoint.clone();
    if (prop.cloth) {
      prop.pull = blanketPull(THREE, prop.body, held.grip, point.sub(held.start));
      return;
    }
    const target = point.add(offset.clone().applyQuaternion(rotation));
    const old = new THREE.Vector3().copy(prop.body.position);
    // Keep the plate and mug above the solid table while they are held.
    for (const { position: [x, y, z], size: [w, h, depth] } of solids) {
      if (Math.abs(target.x - x) < w / 2 + prop.size[0] / 2 &&
        Math.abs(target.z - z) < depth / 2 + prop.size[2] / 2 &&
        old.y >= y + h / 2 && target.y < y + h / 2 - (prop.bottom ?? -prop.size[1] / 2))
        target.y = y + h / 2 - (prop.bottom ?? -prop.size[1] / 2) + .001;
    }
    prop.body.position.copy(target);
    const velocity = target.clone().sub(old).multiplyScalar(1 / Math.max(.008, tickSeconds)).clampLength(0, 7);
    held.speed = held.speed ? held.speed.lerp(velocity, .65) : velocity;
    prop.body.quaternion.copy(rotation.clone().multiply(q));
    prop.body.aabbNeedsUpdate = true;
  }

  function release(id, throwIt = true) {
    swipes.delete(id);
    handSteps.delete(id);
    const held = holds.get(id);
    if (!held) return;
    holds.delete(id);
    if (held.prop.id === 'menu') {
      voice.setMenuHeld(false);
      menuState.held = false;
      menuReturning = true;
      held.prop.owner = null;
      return;
    }
    held.prop.owner = null;
    if (held.prop.cloth) return;
    held.prop.releasedAt = throwIt ? current?.time : null;
    releaseDynamic(held.prop.body);
    if (throwIt && held.speed) held.prop.body.velocity.set(held.speed.x, held.speed.y, held.speed.z);
  }

  function beginSwipe(id, ray) {
    if (physicalScene.state() || current?.session.phase !== 'dialogue' ||
      ray.ray.distanceSqToPoint(facePoint) > .32 ** 2) return false;
    const depth = facePoint.clone().sub(ray.ray.origin).dot(ray.ray.direction);
    if (depth <= 0 || depth > 3.25) return false;
    swipes.set(id, depth);
    handSteps.set(id, ray.ray.at(depth, new THREE.Vector3()));
    return true;
  }

  function handContact(id, point) {
    if (physicalScene.state()) { handSteps.delete(id); return; }
    const previous = handSteps.get(id);
    if (!point || holds.has(id)) { handSteps.delete(id); return; }
    handSteps.set(id, point.clone());
    if (!previous || !current || current.session.phase !== 'dialogue' ||
      !sweptContact(THREE, previous, point, facePoint, .16) ||
      previous.distanceTo(facePoint) < .14 || point.distanceTo(facePoint) > previous.distanceTo(facePoint) + .16) return;
    const movement = point.clone().sub(previous);
    const speed = movement.length() / Math.max(.008, tickSeconds);
    if (speed > 10 && id !== 'mouse') return;
    const action = impactClass(Math.min(speed, 9));
    if (action && react(action, speed, Math.sign(movement.x) || 1)) audioCue('impact', facePoint);
  }

  function observe() {
    if (!current) return null;
    const names = ['date','bathroom_guest','diner','table_companion','arriving_guest','waiter'];
    const beat = current.beat;
    return {
      event: beat ? { id: beat.definition.id, phase: beat.phase,
        remaining: Math.max(0, Math.min(90, Math.ceil((beat.closesAt ?? current.time) - current.time))) } : null,
      actors: actors.map(({ actor }, index) => {
        const observed = index === 4 && eventVisitor.actor.visible ? eventVisitor.actor : actor;
        return { id: names[index], activity: observed.userData.activity,
          need: observed.userData.need.need, level: Math.round(observed.userData.need.level * 100),
          remaining: Math.max(0, Math.min(90, Math.ceil(observed.userData.need.remaining))) };
      }),
      held: props.filter(prop => prop.owner).map(prop => prop.id),
      menu: { page: menuState.page, held: menuState.held,
        waiterNearby: Boolean(tableService && ['ready','presenting'].includes(tableService.phase)) }
    };
  }

  function menuHands() {
    if (!menuState.held && !menuReturning) return null;
    const opening = THREE.MathUtils.smoothstep(menuProgress, .30, .91);
    return Object.fromEntries(['left', 'right'].map(side => {
      const x = side === 'left' ? .025 - .12 * opening : .098;
      const position = menuBook.localToWorld(new THREE.Vector3(x, -.030, .113));
      const orientation = menuBook.getWorldQuaternion(new THREE.Quaternion())
        .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2));
      return [side, { position, orientation, squeeze: .74, trigger: .30 }];
    }));
  }

  return { group, tick, press, focus, poke: point => pokeNear(point, true), pokeNear, move, release, handContact, beginSwipe, observe, replaySpeech,
    turnMenuPage, menuHands,
    skillInput: (direction, cut) => physicalScene.input(direction, cut),
    skillSlash: (side, x, y, z) => physicalScene.slash(side, x, y, z),
    dancePlaying: () => { const state = physicalScene.state(); return state?.action.id === 'dance' && state.stage === 'playing'; },
    skillAxis: (value, vertical, dt, allowTap) => physicalScene.axis(value, vertical, dt, allowTap),
    skillConfirm: () => physicalScene.confirm(), skillHelp: () => physicalScene.showTutorial(),
    skillPlaying: () => physicalScene.state()?.stage === 'playing',
    cancelInteraction: () => physicalScene.cancel(), isInteracting: () => Boolean(physicalScene.state()),
    heldPose(id, pose) {
      const hold = holds.get(id);
      if (!hold || hold.distance) return pose;
      const { prop, grip } = hold;
      return heldGripPose(THREE, prop.body, prop.cloth ? prop.displaceGrip(grip) : grip, pose);
    },
    seatHeight: picnic ? .96 : 1.43,
    player: new THREE.Vector3(...seats.player_seat.position),
    dispose() {
      speech.stop();
      physicalScene.dispose();
      failureScreen.dispose();
      camera?.remove(captionRig);
      orderHud.geometry.dispose();
      orderHud.material.map.dispose();
      orderHud.material.dispose();
      camera?.remove(feelingBars);
      camera?.remove(eventFlash);
      camera?.remove(eventNotice);
      eventNotice.geometry.dispose();
      eventNotice.material.map?.dispose();
      eventNotice.material.dispose();
      camera?.remove(qteTimer);
      qteTimer.geometry.dispose();
      qteTimer.material.map?.dispose();
      qteTimer.material.dispose();
      skillGuide.removeFromParent();
      skillGuide.geometry.dispose();
      skillGuide.material.map?.dispose();
      skillGuide.material.dispose();
      camera?.remove(qteShade);
      qteShade.geometry.dispose();
      qteShade.material.dispose();
      eventFlash.geometry.dispose();
      eventFlash.material.dispose();
      feelingBars.geometry.dispose();
      feelingBars.material.map?.dispose();
      feelingBars.material.dispose();
      group.removeFromParent();
      const geometry = new Set();
      const materials = new Set();
      const maps = new Set(floor.map ? [floor.map] : []);
      group.traverse(item => {
        if (!item.isMesh) return;
        if (!borrowedGeometry.has(item.geometry)) geometry.add(item.geometry);
        for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
          if (borrowedMaterials.has(material)) continue;
          materials.add(material);
          if (material.map?.isCanvasTexture) maps.add(material.map);
        }
      });
      for (const [material, original] of qteMaterials ?? []) material.color.copy(original);
      for (const { actor, mixer } of [...actors, eventVisitor]) {
        mixer.stopAllAction();
        mixer.uncacheRoot(actor.children[0]);
        actor.traverse(item => {
          if (item.skeleton) item.skeleton.dispose();
          for (const material of Array.isArray(item.material) ? item.material : [item.material]) {
            if (!material) continue;
            for (const property of Object.values(material)) if (property?.isTexture) maps.add(property);
          }
        });
      }
      for (const value of [...geometry, ...materials, ...maps]) value.dispose();
    } };
}

function collectBones(scene) {
  const bones = [];
  scene.traverse(object => { if (object.isBone) bones.push(object); });
  return bones;
}

function textPlane(THREE, width, height, initial, w, h, options = {}) {
  if (typeof options === 'boolean') options = { kind: options ? 'choice' : 'display' };
  const kind = options.kind ?? 'display';
  const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
  const context = canvas.getContext('2d');
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
    map, transparent: true, depthWrite: false, depthTest: !options.hud, toneMapped: false
  }));
  if (options.hud) mesh.renderOrder = 10020;
  mesh.userData.hitHalf = [width / 2, height / 2];
  mesh.userData.resizeTexture = (nextWidth, nextHeight) => {
    w = nextWidth;
    h = nextHeight;
    canvas.width = w;
    canvas.height = h;
    map.needsUpdate = true;
  };
  mesh.userData.draw = (text = '', eyebrow, tone = 'default') => {
    context.clearRect(0, 0, w, h);
    const round = (x, y, width, height, radius, fill, stroke) => {
      context.beginPath();
      context.roundRect(x, y, width, height, radius);
      context.fillStyle = fill;
      context.fill();
      if (stroke) {
        context.strokeStyle = stroke;
        context.lineWidth = 2;
        context.stroke();
      }
    };
    if (kind === 'surface') {
      context.shadowColor = '#ec489944';
      context.shadowBlur = 20;
      round(12, 15, w - 24, h - 30, 42, '#38162ddf', '#f9a8d4');
      context.shadowColor = 'transparent';
      map.needsUpdate = true;
      return;
    }
    context.textBaseline = 'middle';
    const font = hudFont;
    if (kind === 'skill-tutorial') {
      const { info, vr, age } = text ?? {};
      if (!info) { map.needsUpdate = true; return; }
      const gradient = context.createLinearGradient(20, 20, w - 20, h);
      gradient.addColorStop(0, '#2C1331F2');
      gradient.addColorStop(.52, '#3D1939ED');
      gradient.addColorStop(1, '#21162BEF');
      context.shadowColor = '#EC489955'; context.shadowBlur = 27;
      round(23, 21, w - 46, h - 42, 54, gradient, '#F9A8D4');
      context.shadowBlur = 0;
      context.strokeStyle = '#B995FF99'; context.lineWidth = 3;
      context.beginPath(); context.moveTo(76, 142); context.lineTo(w - 76, 142); context.stroke();
      context.fillStyle = '#F472B6'; context.font = `700 26px ${font}`;
      context.textAlign = 'left'; context.fillText('WORST DATE EVER  /  MINI JOGO', 77, 76);
      context.fillStyle = '#FFF5FA'; context.font = `800 69px ${font}`;
      context.fillText(info.title, 75, 115, w - 145);
      context.fillStyle = '#E9C7E4'; context.font = `500 29px ${font}`;
      context.fillText(info.tagline, 77, 181, w - 150);
      const cx = w * .50, cy = 310;
      const pulse = .5 + .5 * Math.sin(age * 3.2);
      if (info.title === 'EQUILÍBRIO') {
        for (const radius of [58, 94, 118]) {
          context.beginPath(); context.arc(cx, cy, radius, 0, Math.PI * 2);
          context.strokeStyle = radius === 94 ? '#F9A8D4' : '#B995FF88';
          context.lineWidth = radius === 94 ? 6 : 3; context.stroke();
        }
        context.beginPath(); context.arc(cx + Math.sin(age * 1.7) * 47,
          cy + Math.cos(age * 1.3) * 31, 20, 0, Math.PI * 2);
        context.fillStyle = '#FFF5FA'; context.fill();
        context.strokeStyle = '#F472B6'; context.lineWidth = 7; context.stroke();
      } else if (info.title === 'MALABARES') {
        for (let i = 0; i < 3; i++) {
          const x = cx - 115 + i * 115;
          const y = cy + Math.sin(age * 3 + i * 2.1) * 62;
          context.beginPath(); context.arc(x, y, 33, 0, Math.PI * 2);
          context.fillStyle = ['#F5A66A','#F5D979','#A8D28A'][i]; context.fill();
          context.strokeStyle = '#FFF5FA'; context.lineWidth = 4; context.stroke();
        }
        for (const x of [cx - 130, cx + 130]) {
          context.beginPath(); context.arc(x, cy + 99, 40 - pulse * 9, 0, Math.PI * 2);
          context.strokeStyle = '#F472B6'; context.lineWidth = 6; context.stroke();
        }
      } else {
        for (const x of [cx - 120, cx + 120]) {
          context.beginPath(); context.arc(x, cy + 65, 48, 0, Math.PI * 2);
          context.strokeStyle = '#F472B6'; context.lineWidth = 7; context.stroke();
          context.fillStyle = '#B995FF';
          round(x - 31, cy - 83 + pulse * 110, 62, 61, 15, '#A774D8', '#FFF5FA');
        }
      }
      context.fillStyle = '#F472B6'; context.font = `700 25px ${font}`;
      context.fillText('OBJETIVO', 78, 467);
      context.fillText(vr ? 'EM VR' : 'NO COMPUTADOR', 78, 548);
      context.fillStyle = '#FFF5FA'; context.font = `500 29px ${font}`;
      context.fillText(info.objective, 78, 501, w - 145);
      context.fillText(vr ? info.vr : info.desktop, 78, 582, w - 145);
      context.fillStyle = '#D8AFCE'; context.font = `500 24px ${font}`;
      context.fillText(info.failure, 78, 628, w - 145);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'tutorial-button' || kind === 'skill-help') {
      const focused = tone === 'focus';
      const gradient = context.createLinearGradient(0, 0, w, h);
      gradient.addColorStop(0, focused ? '#F472B6' : '#B72D79');
      gradient.addColorStop(1, focused ? '#BD8AF7' : '#6E2C78');
      context.shadowColor = '#F472B6'; context.shadowBlur = focused ? 26 : 13;
      round(12, 12, w - 24, h - 24, kind === 'skill-help' ? h / 2 : 45, gradient, '#FFF5FA');
      context.shadowBlur = 0;
      context.textAlign = 'center'; context.fillStyle = '#FFF5FA';
      context.font = `800 ${kind === 'skill-help' ? 92 : 58}px ${font}`;
      context.fillText(text, w / 2, h / 2 + (kind === 'skill-help' ? 5 : 2));
      map.needsUpdate = true;
      return;
    }
    if (kind === 'skill-feedback') {
      const game = text;
      if (!game?.action) { map.needsUpdate = true; return; }
      const countdown = game.stage === 'countdown';
      const result = game.stage === 'result';
      const flash = game.feedback?.age < 1.05 ? game.feedback : null;
      const word = countdown ? String(Math.max(1, Math.ceil(game.countdown))) : result ?
        { success: 'BRILHANTE!', partial: 'QUASE!', failure: 'OPS!' }[game.result] ?? '' :
          flash?.text ?? '';
      if (!word) { map.needsUpdate = true; return; }
      const age = flash?.age ?? 0;
      const lift = Math.min(31, age * 32);
      const alpha = countdown || result ? 1 : Math.max(0, 1 - Math.max(0, age - .50) / .55);
      context.globalAlpha = alpha;
      context.textAlign = 'center'; context.fillStyle = '#FFF5FA';
      context.shadowColor = result && game.result === 'failure' ? '#FF8C9D' : '#EC4899';
      context.shadowBlur = 26;
      context.font = `900 ${countdown ? 134 : 91}px ${font}`;
      context.fillText(word, w / 2, 107 - lift, w - 100);
      context.shadowBlur = 0;
      if (flash?.combo > 1 && !result) {
        context.fillStyle = '#F9A8D4'; context.font = `800 38px ${font}`;
        context.fillText('COMBO ×' + flash.combo, w / 2, 183 - lift);
      } else if (countdown) {
        context.fillStyle = '#F9A8D4'; context.font = `700 34px ${font}`;
        context.fillText('PREPARE-SE', w / 2, 207);
      }
      context.globalAlpha = 1;
      map.needsUpdate = true;
      return;
    }
    if (kind === 'skill-guide') {
      const game = text;
      if (!game?.action) { map.needsUpdate = true; return; }
      const title = { balance: 'EQUILIBRE', juggle: 'PEGUE A FRUTA', dance: 'SIGA A BATIDA' }[game.action.id];
      const remaining = Math.max(0, game.action.duration - game.elapsed);
      context.textAlign = 'left';
      context.font = `700 38px ${font}`;
      context.fillStyle = '#FFF5FA';
      context.fillText(title, 56, 42);
      context.textAlign = 'right';
      context.fillStyle = '#F9A8D4';
      context.fillText(remaining.toFixed(1) + 's', w - 56, 42);
      if (game.action.id === 'balance') {
        context.lineCap = 'round';
        context.lineWidth = 19;
        context.strokeStyle = '#8B4669';
        context.beginPath(); context.moveTo(154, 164); context.lineTo(870, 164); context.stroke();
        context.lineWidth = 23;
        context.strokeStyle = '#F9A8D4';
        context.beginPath(); context.moveTo(392, 164); context.lineTo(632, 164); context.stroke();
        const needle = 512 + Math.max(-1, Math.min(1, game.tilt / .65)) * 350;
        context.strokeStyle = Math.abs(game.tilt) < .22 ? '#FFF5FA' : '#FFB389';
        context.lineWidth = 8;
        context.beginPath(); context.moveTo(needle, 113); context.lineTo(needle, 214); context.stroke();
        context.textAlign = 'center'; context.font = `600 25px ${font}`; context.fillStyle = '#F9A8D4';
        context.fillText('CORRIJA PARA MANTER O COPO NO CENTRO', 512, 258);
      } else if (game.action.id === 'juggle') {
        const next = game.beats[game.beat];
        for (const [index, cx] of [310,714].entries()) {
          context.beginPath(); context.arc(cx, 198, 47, 0, Math.PI * 2);
          context.strokeStyle = next?.side === (index ? 'right' : 'left') ? '#FFF5FA' : '#A87691';
          context.lineWidth = 8; context.stroke();
          context.textAlign = 'center'; context.font = `700 28px ${font}`;
          context.fillStyle = '#FFF5FA'; context.fillText(index ? 'D' : 'E', cx, 199);
        }
        if (next) {
          const cx = next.side === 'left' ? 310 : 714;
          const fall = Math.max(0, Math.min(1, 1 - (next.at - game.elapsed) / .82));
          context.beginPath(); context.arc(cx, 87 + fall * 83, 21, 0, Math.PI * 2);
          context.fillStyle = ['#C4764C','#E0AD5A','#9CA95D'][next.fruit]; context.fill();
        }
        context.textAlign = 'center'; context.font = `600 24px ${font}`; context.fillStyle = '#F9A8D4';
        context.fillText(`${game.hits} RECEPÇÕES  ·  ${game.misses} QUEDAS`, 512, 266);
      } else if (game.action.id === 'dance') {
        const next = game.beats[game.beat];
        const pulse = next ? Math.max(0, Math.min(1, 1 - Math.abs(next.at - game.elapsed) / .69)) : 0;
        for (const [index, cx] of [310,714].entries()) {
          const activeSide = next?.side === (index ? 'right' : 'left');
          context.beginPath(); context.arc(cx, 166, 49 + (activeSide ? 30 * (1 - pulse) : 0), 0, Math.PI * 2);
          context.strokeStyle = activeSide ? '#F472B6' : '#87546F';
          context.lineWidth = activeSide ? 12 : 7; context.stroke();
          context.textAlign = 'center'; context.font = `700 34px ${font}`;
          context.fillStyle = '#FFF5FA'; context.fillText(index ? 'D' : 'E', cx, 168);
        }
        for (let index = 0; index < game.beats.length; index++) {
          const x = 317 + index * 65;
          context.fillStyle = game.taps.some(tap => tap.index === index) ? '#F9A8D4' :
            game.failures.some(failure => failure.index === index) ? '#AE627F' : '#62465C';
          context.fillRect(x, 252, 43, 8);
        }
      }
      map.needsUpdate = true;
      return;
    }
    if (kind === 'qte-timer') {
      const cx = w / 2, cy = h * .57, radius = 102;
      context.textAlign = 'center';
      context.fillStyle = mesh.userData.color ?? '#F9A8D4';
      context.font = `700 45px ${font}`;
      context.fillText('MOMENTO CRÍTICO', cx, 51, w - 60);
      context.font = `600 31px ${font}`;
      context.fillText(tone || '', cx, 94, w - 80);
      context.lineCap = 'round';
      context.lineWidth = 17;
      context.strokeStyle = '#7F697D99';
      context.beginPath();
      context.arc(cx, cy, radius, -Math.PI / 2, Math.PI * 1.5);
      context.stroke();
      context.strokeStyle = mesh.userData.color ?? '#F472B6';
      context.beginPath();
      context.arc(cx, cy, radius, -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, Number(text) / Number(eyebrow))));
      context.stroke();
      context.fillStyle = '#FFF5FA';
      context.font = `700 91px ${font}`;
      context.fillText(Number(text).toFixed(1) + 's', cx, cy + 8);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'event-notice') {
      context.beginPath();
      context.moveTo(30, 17);
      context.lineTo(w - 45, 9);
      context.lineTo(w - 14, h - 25);
      context.lineTo(15, h - 11);
      context.closePath();
      context.fillStyle = '#38162DEB';
      context.fill();
      context.lineWidth = 5;
      context.strokeStyle = '#F9A8D4';
      context.stroke();
      context.fillStyle = '#F472B6';
      context.fillRect(39, 38, 11, h - 76);
      context.fillStyle = '#FFF5FA';
      context.textAlign = 'center';
      context.font = `700 50px ${font}`;
      context.fillText('EVENTO  ·  ' + text, w / 2 + 14, h / 2, w - 115);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'event-cue') {
      context.beginPath();
      context.moveTo(38, 24);
      context.lineTo(w - 58, 12);
      context.lineTo(w - 20, h - 92);
      context.lineTo(w / 2 + 38, h - 86);
      context.lineTo(w / 2, h - 24);
      context.lineTo(w / 2 - 38, h - 86);
      context.lineTo(18, h - 72);
      context.closePath();
      context.fillStyle = '#38162DEB';
      context.fill();
      context.lineWidth = 6;
      context.strokeStyle = '#F9A8D4';
      context.stroke();
      context.fillStyle = '#F472B6';
      context.fillRect(47, 44, 53, 8);
      context.fillStyle = '#FFF5FA';
      context.textAlign = 'center';
      context.font = `700 60px ${font}`;
      context.fillText(text, w / 2, 128, w - 100);
      context.font = `550 39px ${font}`;
      context.fillStyle = '#F9A8D4';
      context.fillText(Number.isFinite(eyebrow) ? `${eyebrow} s · escolha uma reação` : 'ALGO ACONTECEU',
        w / 2, 213, w - 110);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'arc-label') {
      context.textAlign = 'center';
      context.fillStyle = INTERACTION_STYLE.text;
      context.font = `620 58px ${font}`;
      const words = text.split(/\s+/);
      const lines = [''];
      for (const word of words) {
        const candidate = lines.at(-1) ? lines.at(-1) + ' ' + word : word;
        if (lines.at(-1) && context.measureText(candidate).width > w - 46 && lines.length < 2) lines.push(word);
        else lines[lines.length - 1] = candidate;
      }
      if (lines.length === 1) context.fillText(lines[0], w / 2, h / 2);
      else lines.forEach((line, index) => context.fillText(line, w / 2, h * (.37 + index * .28)));
      map.needsUpdate = true;
      return;
    }
    if (kind === 'speaker-tab') {
      context.beginPath();
      context.moveTo(35, 17);
      context.lineTo(w - 75, 12);
      context.quadraticCurveTo(w - 36, 12, w - 18, 42);
      context.lineTo(w - 5, h - 34);
      context.quadraticCurveTo(w - 1, h - 8, w - 45, h - 5);
      context.lineTo(33, h - 3);
      context.quadraticCurveTo(5, h - 4, 9, h - 42);
      context.lineTo(12, 53);
      context.quadraticCurveTo(15, 20, 35, 17);
      context.closePath();
      context.fillStyle = '#38162df2';
      context.fill();
      context.lineWidth = 5;
      context.strokeStyle = '#f9a8d4';
      context.stroke();
      context.fillStyle = '#f472b6';
      context.font = `700 56px ${font}`;
      context.textAlign = 'left';
      context.fillText('♡', 55, h / 2 + 4);
      context.font = `650 61px ${font}`;
      context.fillText(text, 137, h / 2 + 4);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'label') {
      context.textAlign = 'left';
      context.fillStyle = '#cdaf9d';
      context.font = `750 ${Math.round(h * .46)}px ${font}`;
      context.fillText(text, 8, h * .53, w - 16);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'choice') {
      const danger = tone === 'danger';
      const focused = tone === 'focused';
      context.shadowColor = '#ec489944';
      context.shadowBlur = focused ? 22 : 12;
      round(2, 2, w - 4, h - 4, 13, focused ? '#51203feF' : danger ? '#38162de8' : '#241326e8',
        focused ? '#fce7f3' : danger ? '#f9a8d4' : '#f9a8d488');
      context.shadowColor = 'transparent';
      context.textAlign = 'center';
      context.fillStyle = '#fff5fa';
      context.font = `650 31px ${font}`;
      const words = text.split(/\s+/);
      const lines = [''];
      for (const word of words) {
        const candidate = lines.at(-1) ? lines.at(-1) + ' ' + word : word;
        if (lines.at(-1) && context.measureText(candidate).width > w - 36 && lines.length < 2) lines.push(word);
        else lines[lines.length - 1] = candidate;
      }
      if (lines.length === 1) context.fillText(lines[0], w / 2, h * .52, w - 36);
      else {
        context.fillText(lines[0], w / 2, h * .36, w - 36);
        context.fillText(lines[1], w / 2, h * .69, w - 36);
      }
      map.needsUpdate = true;
      return;
    }
    if (kind === 'utility') {
      const fill = tone === 'recording' ? '#6b3240' : tone === 'voice' ? '#294a43' : '#342a34';
      const stroke = tone === 'recording' ? '#f29eaa' : tone === 'voice' ? '#7bc2ae' : '#ffffff35';
      round(2, 2, w - 4, h - 4, 17, fill, stroke);
      if (tone === 'recording') {
        context.fillStyle = '#ff9ca8';
        context.beginPath();
        context.arc(28, h / 2, 7, 0, Math.PI * 2);
        context.fill();
      }
      context.textAlign = 'center';
      context.fillStyle = '#fff2e8';
      context.font = `680 20px ${font}`;
      context.fillText(text, tone === 'recording' ? w / 2 + 8 : w / 2, h * .52, w - 34);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'order-status') {
      const live = tone === 'recording';
      round(3, 3, w - 6, h - 6, 22, live ? '#581938f5' : '#38162df0', live ? '#f9a8d4' : '#c78aa5');
      context.textAlign = 'center';
      context.font = `700 37px ${font}`;
      context.fillStyle = live ? '#fff5fa' : '#efd9e7';
      context.fillText(text, w / 2, h / 2, w - 60);
      map.needsUpdate = true;
      return;
    }
    if (kind === 'status') {
      round(2, 2, w - 4, h - 4, 16, '#38162dcc', '#f9a8d433');
      context.textAlign = 'center';
      context.fillStyle = '#dfcfc5';
      context.font = `560 18px ${font}`;
      if (context.measureText(text).width <= w - 38) context.fillText(text, w / 2, h * .52, w - 38);
      else {
        const words = text.split(/\s+/);
        const lines = [''];
        for (const word of words) {
          const candidate = lines.at(-1) ? lines.at(-1) + ' ' + word : word;
          if (lines.at(-1) && context.measureText(candidate).width > w - 54 && lines.length < 2) lines.push(word);
          else lines[lines.length - 1] = candidate;
        }
        context.font = `560 17px ${font}`;
        context.fillText(lines[0], w / 2, h * .34, w - 42);
        context.fillText(lines[1] ?? '', w / 2, h * .70, w - 42);
      }
      map.needsUpdate = true;
      return;
    }
    if (kind === 'caption') {
      context.textAlign = 'left';
      context.fillStyle = '#fff5fa';
      let size = 48;
      let lines;
      const maxWidth = w - 120;
      while (size >= 34) {
        context.font = `520 ${size}px ${font}`;
        lines = [''];
        for (const word of text.split(/\s+/)) {
          const candidate = lines.at(-1) ? lines.at(-1) + ' ' + word : word;
          if (lines.at(-1) && context.measureText(candidate).width > maxWidth) lines.push(word);
          else lines[lines.length - 1] = candidate;
        }
        if (lines.length <= 3) break;
        size -= 2;
      }
      if (lines.length > 3) {
        lines = lines.slice(0, 3);
        while (context.measureText(lines[2] + '…').width > maxWidth) lines[2] = lines[2].slice(0, -1);
        lines[2] += '…';
      }
      const spacing = size * 1.38;
      const start = h / 2 - (lines.length - 1) * spacing / 2;
      lines.forEach((line, i) => context.fillText(line, 60, start + i * spacing));
      map.needsUpdate = true;
      return;
    }
    round(2, 2, w - 4, h - 4, 22, kind === 'heading' ? '#33262ff5' : '#34252def', '#f2c4a52e');
    let y = eyebrow ? 43 : h * .52;
    context.textAlign = kind === 'heading' ? 'left' : 'center';
    if (eyebrow) {
      context.fillStyle = '#e3a77f';
      context.font = `750 26px ${font}`;
      context.fillText(eyebrow, kind === 'heading' ? 46 : w / 2, y, w - 92);
      y = 116;
    }
    const size = kind === 'heading' ? 43 : h > 160 ? 52 : h * .48;
    context.font = `650 ${size}px ${font}`;
    context.fillStyle = '#fff4e8';
    const lines = [''];
    for (const word of text.split(/\s+/)) {
      const line = lines.at(-1);
      const candidate = line ? line + ' ' + word : word;
      if (line && context.measureText(candidate).width > w - (kind === 'heading' ? 92 : 54)) lines.push(word);
      else lines[lines.length - 1] = candidate;
    }
    const spacing = size * 1.10;
    const top = eyebrow && lines.length > 1 ? 98 : y - (eyebrow ? 0 : (lines.length - 1) * spacing / 2);
    context.save();
    context.translate(0, top);
    context.scale(1, Math.min(1, (h - top - size * .52) / Math.max(spacing, (lines.length - 1) * spacing)));
    for (const [i, line] of lines.entries())
      context.fillText(line, kind === 'heading' ? 46 : w / 2, i * spacing, w - (kind === 'heading' ? 92 : 44));
    context.restore();
    map.needsUpdate = true;
  };
  mesh.userData.draw(initial);
  return mesh;
}

function createFailureScreen(THREE, camera) {
  const group = new THREE.Group();
  group.name = 'Date failure screen';
  group.position.set(0, 0, -.36);
  group.visible = false;
  camera?.add(group);
  const white = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthTest: false,
    depthWrite: false, toneMapped: false
  }));
  white.renderOrder = 10050;
  group.add(white);
  const canvas = Object.assign(document.createElement('canvas'), { width: 1600, height: 620 });
  const paint = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ink = new THREE.Mesh(new THREE.PlaneGeometry(.66, .256), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, opacity: 0, depthTest: false,
    depthWrite: false, toneMapped: false
  }));
  ink.position.z = .012;
  ink.renderOrder = 10051;
  group.add(ink);
  let lastLine = '';
  let ready = false;

  function draw(line, result) {
    paint.clearRect(0, 0, canvas.width, canvas.height);
    paint.textAlign = 'center';
    paint.textBaseline = 'middle';
    paint.fillStyle = '#a44970';
    paint.font = `700 34px ${hudFont}`;
    paint.fillText('WORST DATE EVER', 800, 69);
    paint.shadowColor = '#e9c2d0';
    paint.shadowBlur = 15;
    const success = result === 'good';
    paint.fillStyle = success ? '#9c2b78' : '#871b45';
    paint.font = `900 99px ${hudFont}`;
    paint.fillText(success ? 'VOCÊS DERAM CERTO!' : 'ENCONTRO FRACASSADO', 800, 183);
    paint.shadowBlur = 0;
    paint.fillStyle = '#d77ca3';
    paint.fillRect(310, 247, 980, 4);

    let size = 61;
    let lines;
    do {
      paint.font = `560 ${size}px ${hudFont}`;
      lines = [''];
      for (const word of line.split(/\s+/)) {
        const candidate = lines.at(-1) ? lines.at(-1) + ' ' + word : word;
        if (lines.at(-1) && paint.measureText(candidate).width > 1340) lines.push(word);
        else lines[lines.length - 1] = candidate;
      }
      if (lines.length <= 2) break;
      size -= 3;
    } while (size >= 43);
    if (lines.length > 2) {
      lines = lines.slice(0, 2);
      while (paint.measureText(lines[1] + '…').width > 1340) lines[1] = lines[1].slice(0, -1);
      lines[1] += '…';
    }
    paint.fillStyle = '#38162d';
    lines.forEach((part, index) => paint.fillText(part, 800, 343 + index * 75));
    paint.fillStyle = '#a44970';
    paint.font = `700 35px ${hudFont}`;
    paint.fillText('APERTE PARA SAIR', 800, 558);
    texture.needsUpdate = true;
  }

  return {
    get visible() { return group.visible; },
    get ready() { return ready; },
    update(view) {
      const elapsed = view.departureAt == null ? -1 : view.time - view.departureAt;
      const progress = THREE.MathUtils.clamp((elapsed - 4.1) / 1.1, 0, 1);
      const opacity = progress * progress * (3 - 2 * progress);
      group.visible = progress > 0;
      ready = progress >= .99;
      if (!group.visible) return;
      const line = view.finalFeedback || view.caption || 'O encontro terminou antes da hora.';
      const key = view.result + ':' + line;
      if (key !== lastLine) { lastLine = key; draw(line, view.result); }
      white.material.opacity = opacity;
      ink.material.opacity = THREE.MathUtils.clamp((progress - .62) / .35, 0, 1);
    },
    dispose() {
      camera?.remove(group);
      white.geometry.dispose();
      white.material.dispose();
      ink.geometry.dispose();
      ink.material.dispose();
      texture.dispose();
    }
  };
}

function createFeelingBars(THREE) {
  const canvas = Object.assign(document.createElement('canvas'), { width: 720, height: 236 });
  const paint = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(.56, .184), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, toneMapped: false, depthWrite: false, depthTest: false
  }));
  mesh.name = 'Date feelings';
  mesh.renderOrder = 10021;
  const rows = [['interest','Interesse','#f472b6'],['awkwardness','Tensão','#ec4899'],
    ['patience','Paciência','#f9a8d4'],['safety','Conforto','#fbcfe8']];
  let previous, previousValues, changes = {}, changedAt = 0, rendered;
  mesh.userData.draw = (values, now = 0) => {
    const key = rows.map(([name]) => values[name]).join(',');
    if (previous !== key) {
      changes = previousValues ? Object.fromEntries(rows.map(([name]) => [name,
        values[name] - previousValues[name]]).filter(([, delta]) => delta !== 0)) : {};
      previousValues = { ...values };
      previous = key;
      changedAt = now;
    }
    const age = now - changedAt;
    const pulse = Object.keys(changes).length && age < 1.3 ? Math.floor(age * 10) : -1;
    const frame = key + ':' + pulse;
    if (rendered === frame) return;
    rendered = frame;
    paint.clearRect(0,0,720,236);
    paint.fillStyle = '#38162de8';
    paint.beginPath();
    paint.roundRect(4,4,712,228,24);
    paint.fill();
    paint.lineWidth = 4;
    paint.strokeStyle = '#f9a8d4';
    paint.stroke();
    paint.font = `650 35px ${hudFont}`;
    rows.forEach(([name,label,color], index) => {
      const y = 25 + index * 53;
      paint.fillStyle = '#fff5fa';
      paint.fillText(label, 28, y + 27);
      paint.fillStyle = '#693653';
      paint.fillRect(215, y, 470, 28);
      paint.fillStyle = color;
      paint.fillRect(215, y, 470 * values[name] / 100, 28);
      if (pulse >= 0 && changes[name]) {
        paint.textAlign = 'right';
        paint.font = `750 31px ${hudFont}`;
        paint.shadowColor = '#38162d';
        paint.shadowBlur = 5;
        paint.fillStyle = '#fff5fa';
        paint.fillText((changes[name] > 0 ? '+' : '') + changes[name], 675, y + 26);
        paint.shadowBlur = 0;
        paint.textAlign = 'left';
        paint.font = `650 35px ${hudFont}`;
      }
    });
    texture.needsUpdate = true;
  };
  return mesh;
}
