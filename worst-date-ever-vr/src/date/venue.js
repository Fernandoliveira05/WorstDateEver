import { createNpcSpeech } from './npc-speech.js';
import { impactClass, sweptContact } from './impact.js';
import { createNpcClocks } from './npc-clock.js';
import { createNpcAnimation } from './npc-animation.js';
import { createSeatPose } from './seat-ik.js';
import * as CANNON from 'cannon-es';
import { fitCharacter } from '../bedroom-scenery.js';
import { createPhysicsWorld, makeKinematic, releaseDynamic } from '../physics-world.mjs';
import layout from '../../content/shared/venue-layout.json';
import dialogue from '../../content/shared/dialogue.json';
import { objectGroup } from '../scene-objects.js';
import { INTERACTION_STYLE, arcSlots, cardWidth, cardCorners, gazeShowsMenu } from './interaction-arc.mjs';

const dialogueChoiceLabels = new Map(dialogue.choices.map(choice => [choice.id, choice.label]));
const dialogueChoiceLabel = id => dialogueChoiceLabels.get(id);
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
  cafe: { wall: 0xc69b79, seat: 0x637f6c, title: 'CAFÉ · FILTRO & PROSA', sky: 0xf2bea2 },
  sushi: { wall: 0x966d76, seat: 0x963d46, title: 'SUSHI · KOI TORTO', sky: 0x5b638a },
  bistro: { wall: 0x998276, seat: 0x6e803f, title: 'BISTRÔ · A MESA É NOSSA', sky: 0x54526e },
  bar: { wall: 0x817492, seat: 0x64557c, title: 'BAR · ÚLTIMO PEDIDO', sky: 0x3d4270 }
};

export async function createVenue(THREE, { venue, persona, load, camera, bedroomNode, bedroomMaterial, announce, recenter, restart, voice, react, onGesture, viewerPosition, viewerDirection }) {
  await loadHudFont();
  const theme = themes[venue.id];
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
  const floor = mat(0x92695b);
  const boards = bedroomMaterial('Surface-Floorboards-')?.map;
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
    cylinder([.33, .015, .33], [x, 2.477, -2.6],
      new THREE.MeshBasicMaterial({ color: 0xffd38e }));
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
  const restroom = door(-5.35, -6.03, 0x695263, Math.PI / 2);
  const entrance = door(3.72, -7.72, 0x70434b);
  const switchSign = textPlane(THREE, .40, .15, 'WC', 208, 72);
  switchSign.position.set(-5.18, 2.34, -6.51);
  switchSign.rotation.y = Math.PI / 2;
  group.add(switchSign);
  const sign = textPlane(THREE, 2.15, .28, theme.title, 1024, 125);
  sign.position.set(-.15, 2.96, -7.76);
  group.add(sign);

  solidBox([1.32, 1.1, 1.72], [4.76, .55, -3.57], wood);
  box([1.37, .055, 1.79], [4.76, 1.12, -3.57], ceramic);
  for (let i = 0; i < 5; i++) {
    cylinder([.066, .16 + i % 2 * .08, .066], [4.84 + i * .1, 1.23, -3.72], mat(i % 2 ? 0x799075 : 0xae5e45));
    cylinder([.034, .06, .034], [4.84 + i * .1, 1.35, -3.72], brass);
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
  for (const [x, , z] of layout.tables) {
    solidBox([1.28, .07, 1.02], [x, .75, z], wood);
    cylinder([.11, .72, .11], [x, .36, z], metal);
    cylinder([.31, .035, .31], [x, .024, z], brass);
    for (const shift of [-.38, .38]) {
      box([.29, .002, .35], [x + shift, .787, z], upholstery);
      if (x) cylinder([.13, .025, .13], [x + shift, .806, z], ceramic);
    }
  }

  const seats = Object.fromEntries(layout.seats.map(seat => [seat.id, seat]));
  for (const { position: [x, , z], yaw, id } of layout.seats) chair(x, z, yaw + Math.PI, id);

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

  const original = { cup: 'wde_78', plate: 'wde_106', menu: 'wde_131' };
  const props = layout.props.map(({ id, position, size }) => {
    const mesh = new THREE.Group();
    const source = bedroomNode(original[id]);
    if (!source) throw new Error('Missing bedroom prop ' + original[id]);
    const reproduce = item => {
      const placed = item.isMesh ? new THREE.Mesh(item.geometry, item.material) : new THREE.Group();
      placed.position.copy(item.position);
      placed.quaternion.copy(item.quaternion);
      placed.scale.copy(item.scale);
      for (const child of item.children) {
        const intactCeramic = id !== 'menu' && /cerâmica[ _]inteira|alça[ _]curva/i.test(child.name);
        if (id === 'menu' ? child.visible : intactCeramic) placed.add(reproduce(child));
      }
      return placed;
    };
    const copy = reproduce(source);
    copy.traverse(item => {
      if (!item.isMesh) return;
      item.castShadow = true;
      item.receiveShadow = id === 'menu';
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

  const propsById = Object.fromEntries(props.map(prop => [prop.id, prop]));
  const characterNames = [persona.id, 'playerwoman', 'playerman', 'jacketwoman', 'jacketman', 'formalman'];
  const names = Object.fromEntries(['Caio', 'Rafa', 'Bia', 'Luiza', 'PlayerWoman', 'PlayerMan',
    'JacketWoman', 'JacketMan', 'FormalMan'].map(name => [name.toLowerCase(), name]));
  const loaded = await Promise.all(characterNames.map(key => load('Characters/' + names[key] + '.glb')));
  const actors = loaded.map(({ scene, animations }, index) => {
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
    return { actor, mixer, clips, bones, seatPose: createSeatPose(THREE, actor, bones),
      animation: createNpcAnimation(THREE, actor, bones) };
  });
  const date = actors[0];
  const dateDrink = cylinder([.035,.072,.035], [0,-4,0], ceramic);
  dateDrink.visible = false;
  const glass = new THREE.MeshBasicMaterial({ color: 0x9cc4d0, transparent: true, opacity: .68 });
  const splash = Array.from({ length: 7 }, () => sphere([.03,.009,.021], [0,0,0], glass));
  const tray = cylinder([.22, .022, .22], [.22, 1.0, .28], brass, actors[5].actor);
  cylinder([.075, .025, .075], [.20, 1.023, .29], ceramic, actors[5].actor);
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
    ctx.fillStyle = card.userData.focused || card.userData.selected ? '#51203F' : INTERACTION_STYLE.fill;
    ctx.fill();
    ctx.lineWidth = card.userData.focused || card.userData.selected ? 8 : 5;
    ctx.strokeStyle = card.userData.focused || card.userData.selected ? INTERACTION_STYLE.text : INTERACTION_STYLE.outline;
    ctx.stroke();
    const marker = card.userData.focused || card.userData.selected ? 14 : 11;
    ctx.fillStyle = card.userData.focused || card.userData.selected ? INTERACTION_STYLE.text : INTERACTION_STYLE.outline;
    corners.forEach(([x, y]) => ctx.fillRect(sx(x) - marker / 2, sy(y) - marker / 2, marker, marker));
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
  const optionCenter = new THREE.Vector3();
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
  const facePoint = new THREE.Vector3(0,-2,0);
  const face = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(.125), position: new CANNON.Vec3(0,-4,0) });
  world.addBody(face);
  const torso = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC,
    shape: new CANNON.Sphere(.24), position: new CANNON.Vec3(0,-4,0) });
  world.addBody(torso);
  const ambientTargets = actors.slice(1).map(character => {
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
  let lastCaption, lastGesture, lastSpoken;
  let gestureStart = 0;
  let renderedTime = 0;
  const hitTarget = new THREE.Vector3();

  function audioCue(kind, source) { announce(kind, source); }
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
    current = view;
    tickSeconds = dt;
    npcClock ??= createNpcClocks(view.session.eventSeed);
    const t = view.time;
    const beat = view.beat;
    const eventVisual = beat?.definition.visual ?? beat?.definition.id;
    if (view.caption !== lastCaption || view.gesture !== lastGesture) {
      lastCaption = view.caption; lastGesture = view.gesture; gestureStart = t;
    }
    const duties = npcClock(t);
    for (let i = 0; i < duties.length; i++) actors[i+1].actor.userData.need = duties[i];
    actors[0].actor.userData.activity = view.session.phase === 'dialogue' ? 'seated' : 'walking';
    actors[1].actor.userData.activity = duties[0].active ? 'restroom' : 'seated';
    actors[2].actor.userData.activity = duties[1].active ? 'eating' : 'seated';
    actors[3].actor.userData.activity = duties[2].active ? 'talking' : 'seated';
    actors[4].actor.userData.activity = !duties[3].active ? 'away' : duties[3].age < 5 || duties[3].age > 12 ? 'walking' : 'seated';
    actors[5].actor.userData.activity = duties[4].active ? 'serving' : 'waiting';
    date.actor.userData.need = { need: 'conforto', level: view.session.relationship.safety / 100,
      remaining: Math.max(0, (beat?.closesAt ?? t) - t) };
    const dateRoute = layout.dateRoute;
    const moving = view.session.phase === 'arriving';
    const leave = view.result === 'disaster' && view.reaction?.id === 'impact_hard' ? t - view.reaction.at : -1;
    const exitProgress = THREE.MathUtils.clamp((leave - 1.15) / 4.1, 0, 1);
    date.actor.visible = view.session.phase !== 'waiting' && exitProgress < 1;
    const seated = ['seating', 'dialogue', 'ending', 'completed'].includes(view.session.phase);
    if (leave >= 0) updateActor(date, dateRoute, 1 - exitProgress, exitProgress > 0,
      THREE.MathUtils.clamp(1.15 - leave, 0, 1), dt, seats.date_seat.yaw, true);
    else updateActor(date, dateRoute, (t - 1) / 4, moving, seated ? Math.min(1, (t - 6.5) / .9) : 0, dt, seats.date_seat.yaw);
    const flinch = view.reaction && view.reaction.id.startsWith('impact_') && t - view.reaction.at < 1.2;
    if (flinch) date.actor.userData.activity = 'recoiling';
    if (flinch) date.animation.gesture('impact', t - view.reaction.at,
      Math.min(1.45, .5 + view.reaction.speed * .23), view.reaction.direction || 1);
    else if (view.gesture !== 'none') date.animation.gesture(view.gesture, t - gestureStart);
    const head = date.bones.Head;
    feelingBars.visible = Boolean(head && date.actor.visible && seated && leave < 0 && view.session.phase !== 'completed');
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
        feelingBars.userData.draw(view.session.relationship);
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

    entrance.rotation.y = moving && t < 2.3 ? -.9 * Math.sin(Math.PI * Math.min(1, (t - 1) / 1.3)) : 0;

    const bathroomTime = duties[0].active ? duties[0].age : 0;
    const bathroomBeat = eventVisual === 'bathroom_mishap' && ['animate','choice_window'].includes(beat.phase);
    restroom.rotation.y = Math.PI / 2 + (bathroomBeat ? Math.sin(t * 16) * .085 :
      (bathroomTime >= 9 && bathroomTime < 11 || bathroomTime >= 14 && bathroomTime < 16 ? -.75 : 0));
    const bath = bathroomTime < 6 ? 0 : bathroomTime < 11 ? (bathroomTime - 6) / 5 :
      bathroomTime < 14 ? 1 : Math.max(0, 1 - (bathroomTime - 14) / 5);
    const bathSit = bathroomTime < 6 ? THREE.MathUtils.clamp(6 - bathroomTime, 0, 1) :
      THREE.MathUtils.clamp(bathroomTime - 19, 0, 1);
    updateActor(actors[1], layout.restroomRoute, bath, (bath > 0 && bath < 1), bathSit, dt, seats.restroom_guest.yaw, bathroomTime >= 14);
    actors[1].actor.visible = bath !== 1;
    for (const [index, name] of [[2, 'chat_near'], [3, 'chat_far']]) {
      const seat = seats[name];
      updateActor(actors[index], [seat.position], 0, false, 1, dt, seat.yaw);
      if (duties[index - 1].active && beat?.phase !== 'animate' && beat?.phase !== 'choice_window')
        actors[index].animation.gesture(index === 2 ? 'sip' : 'nod', duties[index-1].age);
    }
    const entryDuty = duties[3];
    const entry = entryDuty.age;
    const guest = entry < 5 ? entry / 5 : entry > 12 ? Math.max(0, 1 - (entry - 12) / 6) : 1;
    const guestSit = THREE.MathUtils.clamp(Math.min(entry - 5, 12 - entry), 0, 1);
    actors[4].actor.visible = entryDuty.active;
    if (entryDuty.active) updateActor(actors[4], layout.entranceRoute, guest, guest > 0 && guest < 1, guestSit, dt,
      seats.entry_guest.yaw, entry > 12);
    const shift = duties[4].active ? duties[4].age + 3 : 0;
    const service = shift < 3 ? 0 : shift < 9 ? (shift - 3) / 6 : shift < 12 ? 1 : Math.max(0, 1 - (shift - 12) / 6);
    const waiterAtDate = ['water_spill','wrong_order'].includes(eventVisual) && beat.phase !== 'cooldown';
    const server = actors[5];
    const previousServer = server.actor.position.clone();
    const servingRoute = waiterAtDate ? [[-1.15,0,-.64]] : layout.waiterRoute;
    updateActor(server, servingRoute, service, !waiterAtDate && service > 0 && service < 1, 0, dt,
      waiterAtDate || service === 1 ? -Math.PI / 2 : 0, shift >= 12);
    if (renderedTime > 0) {
      const intended = server.actor.position.clone().sub(previousServer);
      if (intended.length() > dt * 2.05) server.actor.position.copy(previousServer.add(intended.clampLength(0, dt * 2.05)));
    }
    wrongDish.visible = eventVisual === 'wrong_order' && ['animate','choice_window','resolve'].includes(beat.phase);
    if (beat?.phase === 'animate' || beat?.phase === 'choice_window') {
      if (eventVisual === 'loud_guest' && actors[2].bones.Head) {
        actors[2].animation.gesture('laugh', Math.min(1.42, Math.max(0, t - beat.at - .55)));
      }
      if (eventVisual === 'awkward_friend' && actors[4].bones.UpperArmR) {
        actors[4].animation.gesture('wave', Math.min(1.42, Math.max(0, t - beat.at - .55)));
      }
    }
    tray.rotation.z = eventVisual === 'water_spill' && beat.phase === 'animate' ? .43 : 0;
    if (beat?.phase === 'animate' && lastBeat !== beat.definition.id) {
      lastBeat = beat.definition.id;
      const emitter = eventVisual === 'loud_guest' ? actors[2].actor.position :
        eventVisual === 'bathroom_mishap' ? restroom.position : actors[5].actor.position;
      audioCue(eventVisual, emitter);
      if (beat.presentation.prop) {
        const prop = propsById[beat.presentation.prop];
        resetProp(prop);
        if (!prop.owner && eventVisual === 'dropped_menu') prop.body.velocity.set(0, .17, 1.27);
      }
    }
    const water = eventVisual === 'water_spill' && ['choice_window','resolve'].includes(beat.phase);
    for (let i = 0; i < splash.length; i++) {
      splash[i].visible = water;
      splash[i].position.set(-.32 + Math.cos(i * 2.4) * .12, .793, -.13 + Math.sin(i * 2.4) * .15);
    }
    if (renderedTime < 1 && t >= 1) audioCue('entrance', date.actor.position);
    if (moving && Math.floor(t * 2) !== Math.floor(renderedTime * 2)) audioCue('step', date.actor.position);
    if (Math.floor(t / 6) > Math.floor(renderedTime / 6)) audioCue('ambience', actors[5].actor.position);
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
    world.step(1 / 90, dt, 5);
    for (const prop of props) {
      if (prop.body.position.y < -.22 || Math.abs(prop.body.position.x) > 6 || prop.body.position.z > 2.2) resetProp(prop);
      prop.mesh.position.copy(prop.body.position);
      prop.mesh.quaternion.copy(prop.body.quaternion);
    }
    const voiceState = voice.state();
    const spoken = view.caption + '|' + (view.speechRef ?? '');
    if (voiceState.busy) speech.stop();
    else if (spoken !== lastSpoken) {
      lastSpoken = spoken;
      speech.say(view);
    }
    const contextualChoices = beat?.phase === 'choice_window' ? [...view.choices] : [
      ...view.choices,
      ...view.fallbackChoices.map(choice => ({ ...choice,
        label: dialogueChoiceLabel(choice.id) ?? choice.label }))
    ];
    const actions = contextualChoices.map(choice => ({
      key: 'choice:' + choice.id,
      label: choice.label,
      tone: choice.id === 'middle_finger' ? 'danger' : 'default',
      action: () => {
      if (choice.id === 'middle_finger') onGesture?.();
      voice.choose(choice.id);
      }
    }));
    const utilities = [];
    if (view.session.phase === 'completed') utilities.push({ key: 'exit', label: 'Sair', action: restart });
    else if (view.session.phase === 'dialogue') {
      if (voiceState.ready && view.canSpeak)
        utilities.push({ key: 'speak', label: voiceState.recording ? 'Enviar' : 'Falar livremente',
          action: voice.toggle, tone: voiceState.recording ? 'recording' : 'voice' });
      if (voiceState.consented) utilities.push({ key: 'cancel-voice', label: 'Desligar voz', action: voice.cancel });
    }
    utilities.push({ key: 'recenter', label: 'Centralizar', action: recenter });
    const remaining = beat?.phase === 'choice_window' && Number.isFinite(beat.closesAt) ?
      Math.max(0, Math.ceil(beat.closesAt - t)) : null;
    const mic = voiceState.recording ? '  ' + '▰'.repeat(voiceState.level) + '▱'.repeat(5 - voiceState.level) : '';
    const statusLine = [view.reflecting ? 'Ouça a resposta antes de continuar' : '',
      voiceState.message ? voiceState.message + mic : '',
      remaining == null ? '' : remaining + ' s para decidir'].filter(Boolean).join('  ·  ');
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
    menuPresence = THREE.MathUtils.clamp(menuPresence + dt /
      (gazeVisible ? INTERACTION_STYLE.gazeEnterSeconds : -INTERACTION_STYLE.gazeExitSeconds), 0, 1);
    const slots = arcSlots(available.length);
    const width = cardWidth(available.length);
    const activeKeys = new Set();
    available.forEach((option, index) => {
      activeKeys.add(option.key);
      const card = cards.get(option.key) ?? makeCard(option.key);
      const data = card.userData;
      data.action = option.action;
      if (data.text !== option.label || data.width !== width) {
        data.text = option.label;
        drawCard(card, width);
      }
      const slot = slots[index];
      data.target.copy(optionCenter)
        .addScaledVector(dateRight, slot.x)
        .addScaledVector(worldUp, slot.y)
        .addScaledVector(dateForward, slot.depth)
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
      const scale = data.focused ? INTERACTION_STYLE.focusScale : 1;
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
    actor.rotation.y = walk ? Math.atan2(to[0] - from[0], to[2] - from[2]) + (reverse ? Math.PI : 0) : yaw;
    const clip = walk ? clips.walk : clips.idle;
    if (clip && clip !== character.active) {
      character.active?.fadeOut(.16);
      clip.reset().fadeIn(.16).play();
      character.active = clip;
    }
    mixer.update(dt);
    seatPose.apply(sitting);
  }

  function pickup(id, prop, point, rotation, distance) {
    if (!prop || prop.owner || holds.has(id)) return false;
    prop.owner = id;
    prop.releasedAt = null;
    const offset = new THREE.Vector3().copy(prop.body.position).sub(point).applyQuaternion(rotation.clone().invert());
    const q = rotation.clone().invert().multiply(new THREE.Quaternion().copy(prop.body.quaternion));
    holds.set(id, { prop, offset, q, distance });
    makeKinematic(prop.body);
    if (current?.beat?.phase === 'choice_window' && current.beat.presentation.prop === prop.id)
      voice.choose(current.beat.presentation.action);
    return true;
  }

  function press(id, ray, rotation, directPoint, grab) {
    const interactiveButtons = [...cards.values()].filter(card => card.visible && card.userData.action);
    const buttonHits = ray.intersectObjects([heading, ...interactiveButtons.flatMap(card => card.children)]);
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
    const eligible = props.filter(prop => !prop.owner);
    if (directPoint) {
      let nearest, best = Infinity;
      for (const prop of eligible) {
        const distance = directPoint.distanceTo(prop.mesh.position);
        if (distance >= best || distance >= Math.max(...prop.size) / 2 + .07) continue;
        best = distance;
        nearest = prop;
      }
      if (pickup(id, nearest, directPoint, rotation, 0)) return true;
    }
    const hit = ray.intersectObjects(eligible.map(prop => prop.mesh), true)[0];
    if (!hit || hit.distance > 3.8) return false;
    let object = hit.object;
    while (object.parent !== tableProps) object = object.parent;
    return pickup(id, eligible.find(prop => prop.mesh === object), hit.point, rotation, hit.distance);
  }

  function focus(ray) {
    const hit = ray?.intersectObjects([...cards.values()].filter(card => card.visible && card.userData.action)
      .flatMap(card => card.children))[0];
    const next = hit?.object.userData.card ?? null;
    for (const card of cards.values()) {
      const focused = card === next;
      if (focused === card.userData.focused) continue;
      card.userData.focused = focused;
      drawCard(card, card.userData.width);
    }
  }

  function pokeNear(point, activate = false) {
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
    const target = (distance ? ray.ray.at(distance, new THREE.Vector3()) : directPoint.clone())
      .add(offset.clone().applyQuaternion(rotation));
    const old = new THREE.Vector3().copy(prop.body.position);
    // Keep the plate, mug and menu above the solid table while they are held.
    for (const { position: [x, y, z], size: [w, h, depth] } of solids) {
      if (Math.abs(target.x - x) < w / 2 + prop.size[0] / 2 &&
        Math.abs(target.z - z) < depth / 2 + prop.size[2] / 2 &&
        old.y >= y + h / 2 && target.y < y + h / 2 + prop.size[1] / 2)
        target.y = y + h / 2 + prop.size[1] / 2 + .001;
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
    held.prop.owner = null;
    held.prop.releasedAt = throwIt ? current?.time : null;
    releaseDynamic(held.prop.body);
    if (throwIt && held.speed) held.prop.body.velocity.set(held.speed.x, held.speed.y, held.speed.z);
  }

  function beginSwipe(id, ray) {
    if (current?.session.phase !== 'dialogue' || ray.ray.distanceSqToPoint(facePoint) > .32 ** 2) return false;
    const depth = facePoint.clone().sub(ray.ray.origin).dot(ray.ray.direction);
    if (depth <= 0 || depth > 3.25) return false;
    swipes.set(id, depth);
    handSteps.set(id, ray.ray.at(depth, new THREE.Vector3()));
    return true;
  }

  function handContact(id, point) {
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
      actors: actors.map(({ actor }, index) => ({ id: names[index], activity: actor.userData.activity,
        need: actor.userData.need.need, level: Math.round(actor.userData.need.level * 100),
        remaining: Math.max(0, Math.min(90, Math.ceil(actor.userData.need.remaining))) })),
      held: props.filter(prop => prop.owner).map(prop => prop.id)
    };
  }

  return { group, tick, press, focus, poke: point => pokeNear(point, true), pokeNear, move, release, handContact, beginSwipe, observe, replaySpeech, heldBody: id => holds.get(id)?.prop.body,
    player: new THREE.Vector3(...seats.player_seat.position),
    dispose() {
      speech.stop();
      camera?.remove(captionRig);
      camera?.remove(feelingBars);
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
      for (const { actor, mixer } of actors) {
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
  let previous;
  mesh.userData.draw = values => {
    const key = rows.map(([name]) => values[name]).join(',');
    if (previous === key) return;
    previous = key;
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
    });
    texture.needsUpdate = true;
  };
  return mesh;
}
