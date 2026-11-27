import { candyAtmosphere, candyById } from './candies.mjs';
import { currentXrFrame, controllerSpaces, nativeControllerButtons, pointRay, sampleSpace, trackedObjectPose } from './xr-input.js';
import { wireVrEntry } from './vr-entry.js';
import AFRAME from 'aframe';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHandVisibility, getHandPosePipeline, HAND_TRACKING_GRACE } from './hand-pose.mjs';
import { styleBedroom } from './bedroom-style.js';
import { upgradeBedroom } from './bedroom-upgrade.js';
import { createBedroomPhysics } from './bedroom-physics.js';
import { createPhone, stylePhoneCase } from './bedroom-phone.js';
import { loadBrandArt } from './brand-art.js';
import { createGameMenu } from './game-menu.js';
import { createScenery } from './bedroom-scenery.js';
import { createAvatar } from './bedroom-avatar.js';
import { trackedHandBasis } from './avatar-hands.js';
import { phoneGrip } from './grip-pose.mjs';
import { phonePokeCrossing } from './phone-interaction.mjs';
import { organizeBedroomObjects } from './scene-objects.js';
import { createCurtain } from './bedroom-curtain.js';
import { createVenueMetrics } from './date/metrics.js';
import { createDateCoordinator } from './date/coordinator.js';
import { walkBedroom } from './bedroom-locomotion.js';

const THREE = AFRAME.THREE;
wireVrEntry(document.getElementById('scene'), {
  button: document.getElementById('enter-vr'),
  status: document.getElementById('vr-status')
});
const assets = name => `${import.meta.env.BASE_URL}assets/bedroom/${name}`;
const brandArt = loadBrandArt(assets('BrandBoard.png'));
async function loadScene() {
  const response = await fetch(assets('scene.glb.gz'));
  if (!response.ok) throw new Error('Bedroom geometry ' + response.status);
  const stream = response.headers.get('Content-Encoding')?.includes('gzip')
    ? response.body
    : response.body.pipeThrough(new DecompressionStream('gzip'));
  return loader.parseAsync(await new Response(stream).arrayBuffer(),
    new URL(assets(''), window.location.href).href);
}
const loader = new GLTFLoader();
const clone = vector => vector.clone();
const up = new THREE.Vector3(0, 1, 0);
AFRAME.registerComponent('wde-bedroom', {
  init() {
    if (this.el.hasLoaded) this.load();
    else this.el.addEventListener('loaded', () => this.load(), { once: true });
  },
  async load() {
    const scene = this.el;
    const loading = document.getElementById('loading');
    const status = loading.querySelector('span');
    try {
      const [metadata, model] = await Promise.all([
        fetch(assets('scene.json')).then(response => {
          if (!response.ok) throw new Error('Bedroom scene metadata ' + response.status);
          return response.json();
        }),
        loadScene()
      ]);
      let benchmark;
      if (import.meta.env.DEV) {
        const asset = new URLSearchParams(location.search).get('assetQA');
        if (asset) {
          const { prepareBenchmark } = await import('../tools/hand-qa/stage.js');
          benchmark = await prepareBenchmark(loader, model.scene, metadata, asset);
        }
      }
      this.bedroom = setup(scene, model.scene, metadata, benchmark);
      loading.hidden = true;
      scene.emit('bedroom-ready');
    } catch (error) {
      console.error('Não foi possível carregar o quarto.', error);
      status.textContent = 'Não foi possível carregar o quarto. Atualize a página para tentar novamente.';
      const vrStatus = document.getElementById('vr-status');
      vrStatus.textContent = 'O quarto precisa carregar antes de entrar em VR. Atualize a página.';
      vrStatus.hidden = false;
    }
  },
  tick(_, milliseconds) {
    if (milliseconds > 0) this.bedroom?.tick(Math.min(milliseconds / 1000, .05));
  }
});

function setup(scene, root, data, benchmark) {
  const room = document.getElementById('room');
  const camera = document.getElementById('camera');
  const rig = document.getElementById('rig');
  const loaderModels = path => loader.loadAsync(assets(path));
  const named = new Map();
  const handPokes = new Map();
  const phoneRays = new Map();
  const phoneTips = new Map();
  const trackedHands = new Map();
  const handVisibility = createHandVisibility();
  const controls = {};
  const inputs = new Map();
  const previous = new Map();
  const pickable = [];
  const curtainMeshes = [];
  const narrator = document.getElementById('narrator');
  const sound = makeBedroomSound();
  document.addEventListener('pointerdown', sound.unlock, { once: true, capture: true });
  let lastImpact = -Infinity;
  let lastLampTouch = -Infinity;
  const look = camera.components['look-controls'];
  let narrationUntil = 0;
  let elapsed = 0;
  const skillKeys = { left: false, right: false, up: false, down: false };
  const danceHands = { left: false, right: false };
  const danceCuts = { up: false, down: false, left: false, right: false };
  let immersive = false;
  let desktopGesture;
  let desktopMenuPress;
  let menuHover;
  let lastMenuAction = -Infinity;
  let phase;
  let dispensed;
  let mouthTime = 0;
  let lastCandyOwner;
  let requestedTime = 0, requestedReduced = false;
  const forceHaunt = new URLSearchParams(location.search).get('haunt') === '1';
  let canvas;
  let monitorOn = true;
  const readButton = document.getElementById('readPhone');
  const actor = new THREE.PerspectiveCamera();
  const desktopLast = new THREE.Vector3(...data.start);
  let readFrom;
  let lastHead;
  let snapHeld = false;
  let lastMonitorTouch = -10;
  let date;
  const dateKeys = new Set();
  let dateAmbience;
  let pendingSeat = false;
  let venueMetrics;
  let middleFingerUntil = 0;
  const roomControls = document.getElementById('controls');

  function viewer() {
    const reference = scene.renderer?.xr.getReferenceSpace();
    let pose;
    const frame = currentXrFrame(scene);
    if (immersive && reference && frame) {
      try { pose = frame.getViewerPose(reference); } catch { /* A controller callback can run between XR frames. */ }
    }
    if (!pose) return scene.camera;
    const { position, orientation } = pose.transform;
    actor.position.set(position.x, position.y, position.z);
    rig.object3D.localToWorld(actor.position);
    actor.quaternion.set(orientation.x, orientation.y, orientation.z, orientation.w);
    actor.quaternion.premultiply(rig.object3D.getWorldQuaternion(new THREE.Quaternion()));
    actor.updateMatrixWorld(true);
    return actor;
  }

  organizeBedroomObjects(THREE, root, data);
  room.object3D.add(root);
  const prepared = new Set();
  root.traverse(object => {
    if (object.name.startsWith('wde_')) named.set(object.name, object);
    if (!object.isMesh) return;
    object.castShadow = !object.name.startsWith('street_') || !/Asphalt|Concrete/.test(object.name);
    object.receiveShadow = true;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (prepared.has(material)) continue;
      prepared.add(material);
      const [kind, , tint, , , strength] = material.name.split('-');
      if (kind !== 'Surface' || !material.map) continue;
      material.color.set('#' + tint);
      material.customProgramCacheKey = () => 'bedroomSurface:' + strength;
      material.onBeforeCompile = program => {
        program.fragmentShader = program.fragmentShader.replace('#include <map_fragment>', `
          vec4 sampleColor = texture2D(map, vMapUv);
          diffuseColor *= mix(vec4(1.), sampleColor, ${Number(strength).toFixed(4)});`);
      };
    }
  });
  function node(id) { return named.get(id); }
  root.updateMatrixWorld(true);
  const upgrade = upgradeBedroom(THREE, root, data, node);
  data = upgrade.data;
  for (const [id, object] of upgrade.objects) named.set(id, object);

  stylePhoneCase(THREE, node(data.phone.id), data.phone);
  const scenePhysics = createBedroomPhysics(THREE, root, data, node, propEvent,
    () => viewer().getWorldPosition(new THREE.Vector3()));
  styleBedroom(THREE, root, data, node);
  for (const prop of scenePhysics.props.values()) pickable.push(prop.object);
  pickable.push(scenePhysics.doorObject, upgrade.bedside.switchMesh, ...upgrade.frames, ...upgrade.additions.switches, ...upgrade.shop.buttons);

  const scenery = createScenery(THREE, root, data, node, loaderModels);
  // A-Frame also injects a daylight fill. Mute it at night so the authored
  // moonlight and bedside lamp determine the bedroom contrast.
  const defaultFill = scene.querySelectorAll('[data-aframe-default-light]');
  function setDefaultFill(visible) {
    for (const light of defaultFill) light.object3D.visible = visible;
  }
  const avatar = createAvatar(THREE, scene.object3D, loaderModels);
  const phone = createPhone(THREE, node(data.phone.id), data.phone, assets, updateStory, brandArt, state => { void date?.start(state); });
  const menu = createGameMenu(THREE, scene, brandArt, {
    cycleWindow: phone.cycleWindow, toggleEffects: phone.toggleEffects,
    quit: () => { void scene.xrSession?.end().catch(console.warn); }
  });
  const handPose = getHandPosePipeline(scene);
  pickable.push(phone.screen);
  phone.screen.layers.enable(27);

  const captions = makeCaption(THREE, camera.object3D);
  const monitor = node(data.monitor);
  const monitorTextures = new THREE.TextureLoader();
  const monitorTexture = monitorTextures.load(assets('Desktop.png'));
  monitorTexture.colorSpace = THREE.SRGBColorSpace;
  monitorTexture.flipY = false;
  const monitorMaterial = new THREE.MeshBasicMaterial({ map: monitorTexture, toneMapped: false, color: 0xfdf4e5 });
  const monitorOff = new THREE.MeshBasicMaterial({ color: 0x15171d, toneMapped: false });
  monitor?.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.material = monitorMaterial;
    mesh.userData.monitor = true;
  });
  if (monitor) pickable.push(monitor);
  const screenPoint = new THREE.Vector3();
  function monitorContact(point) {
    if (!monitor) return null;
    monitor.worldToLocal(screenPoint.copy(point));
    if (Math.abs(screenPoint.x) > .50 || Math.abs(screenPoint.y) > .50) return null;
    return screenPoint.z;
  }
  for (const id of data.curtains) {
    const owner = node(id);
    owner.traverse(mesh => {
      if (!mesh.isMesh || curtainMeshes.some(item => item.mesh === mesh)) return;
      const previous = mesh.material;
      mesh.material = previous.clone();
      mesh.material.onBeforeCompile = previous.onBeforeCompile;
      mesh.material.customProgramCacheKey = previous.customProgramCacheKey;
      mesh.material.side = THREE.DoubleSide;
      mesh.userData.curtain = true;
      mesh.castShadow = false;
      curtainMeshes.push({ mesh, ...createCurtain(mesh) });
      pickable.push(mesh);
    });
  }

  function show(line, duration = 4) {
    narrator.textContent = line;
    captions.draw(line, immersive);
    narrationUntil = elapsed + duration;
  }

  function toggleBedsideLamp() {
    if (elapsed - lastLampTouch < .27) return;
    lastLampTouch = elapsed;
    upgrade.bedside.toggleLamp();
    sound.play(false, .047);
  }

  function propEvent(kind, value) {
    if (kind === 'fan') {
      const running = upgrade.toggleFan();
      sound.play(false, .05);
      show(running ? 'Ventilador ligado.' : 'Ventilador desligado.');
    }
    if (kind === 'key') sound.play(false, .055);
    if (kind === 'keyboard-break') {
      sound.play(false, Math.min(.22, value * .027));
      show('Quebrou bem no meio.');
    }
    if (kind === 'phone-impact' && elapsed - lastImpact > .3) {
      lastImpact = elapsed;
      sound.play(false, Math.min(.22, value * .039));
    }
    if (kind === 'prep') phone.selectItem(value);
    if (kind === 'frog') {
      const eye = viewer();
      const position = value.getWorldPosition(new THREE.Vector3());
      const relative = position.sub(eye.getWorldPosition(new THREE.Vector3()));
      const right = new THREE.Vector3(1, 0, 0).applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion()));
      sound.croak(relative.normalize().dot(right));
      show('O sapo está pronto para o encontro. Eu ainda não.');
    }
    if (kind === 'drawer' && elapsed > narrationUntil) show('Pra que eu guardei tudo isso?');
    if (kind === 'latch') {
      const eye = viewer();
      const offset = value.sub(eye.getWorldPosition(new THREE.Vector3()));
      offset.applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion()).invert());
      sound.latch(offset);
    }
    if (kind === 'door-locked') show('A porta só abre à noite.');
    if (kind === 'door') {
      upgrade.scare(elapsed, forceHaunt);
      show(phase === 'exit' ? 'Posso buscar um doce ou iniciar o encontro pelo celular.' :
        'Tem alguma coisa estranha nesse corredor.');
    }
    if (kind === 'outfit') {
      phone.appearance(value);
      show(['Camiseta.','Jaqueta.','Traje social.'][value] + ' Parece que tenho a vida em ordem.');
    }
    if (kind === 'break') {
      const eye = viewer();
      const offset = value.position.clone().sub(eye.getWorldPosition(new THREE.Vector3()));
      offset.applyQuaternion(eye.getWorldQuaternion(new THREE.Quaternion()).invert());
      sound.shatter(offset, value.impact);
      show('Isso ficou bem pior do que eu esperava.');
    }
  }

  function applyRoomTime(position) {
    const next = requestedTime !== 2 && upgrade.corridorContains(position) ? 2 : requestedTime;
    if (scenery.time !== next || scenery.reduced !== requestedReduced) {
      scenery.setTime(next, requestedReduced);
      setDefaultFill(next !== 2 || Boolean(date?.active()));
    }
    upgrade.bedside.setClockTime(next);
    scenePhysics.setDoorAvailable(next === 2);
    upgrade.setCorridorAvailable(next === 2);
    upgrade.setReducedEffects(requestedReduced);
  }

  function updateStory(state, reply) {
    if (state.phase !== 'exit') date?.cancelStart();
    menu.settings({ windowTime: phone.windowTime(), reducedIntensity: state.reducedIntensity });
    const byStory = ['wait', 'prep', 'exit', 'aftermath'].includes(state.phase) ? 2 : 0;
    requestedTime = forceHaunt ? 2 : state.windowTime ?? byStory;
    requestedReduced = Boolean(state.reducedIntensity);
    applyRoomTime(viewer().getWorldPosition(new THREE.Vector3()));
    scenery.setCandy(state.candy);
    sound.setEcho(candyAtmosphere(state.candy, requestedReduced).echo);
    scenery.setAftermath(state.phase === 'aftermath');
    avatar.activate(state.avatarGender, state.appearance || 0);
    if (reply) show(reply);
    if (state.phase !== phase) {
      if (phase && state.phase === 'intro') clearCandy();
      if (state.phase === 'match') {
        show('Deu match! Agora começa a parte difícil.');
        sound.play(true, .19);
      }
      if (state.phase === 'wait') show('Já escureceu. Tá quase na hora.');
      if (state.phase === 'exit') show('Inicie o encontro pelo celular. Se quiser um doce, vá até a máquina no corredor.', 6);
      if (state.phase === 'aftermath') show('A noite saiu do plano.');
      phase = state.phase;
    }
  }

  function clearCandy() {
    if (!dispensed) return;
    if (dispensed.held) finish(dispensed.held, false, false);
    scenePhysics.setPropActive(dispensed, false);
    dispensed = lastCandyOwner = undefined;
    mouthTime = 0;
  }

  function shopAction(action) {
    const position = viewer().getWorldPosition(new THREE.Vector3());
    const state = phone.getState();
    if (!upgrade.atCandyMachine(position) || scenery.time !== 2) return false;
    const candy = candyById(action);
    if (!candy) return false;
    if (state.candy) {
      show(candyById(state.candy).name + ' já escolhida para este encontro.', 4);
      return true;
    }
    clearCandy();
    dispensed = scenePhysics.props.get('candy-' + action);
    scenePhysics.setPropActive(dispensed, true);
    sound.play(false, .09);
    show(candy.name + ' caiu na bandeja.', 3);
    return true;
  }

  function eatCandy() {
    if (!dispensed?.held || !phone.eatCandy(dispensed.def.candy)) return false;
    const id = dispensed.def.candy;
    const candy = candyById(id);
    clearCandy();
    sound.play(id === 'hortela', requestedReduced ? .038 : .075);
    show(candy.name + ' escolhida. O encontro ainda não começou.', 4);
    return true;
  }

  function tickCandy(delta, head) {
    const owner = dispensed?.held;
    if (owner !== lastCandyOwner) {
      mouthTime = 0;
      lastCandyOwner = owner;
      if (owner) show(immersive ? 'Leve o doce à boca para comer.' : 'Segure o doce e pressione E para comer.', 4);
    }
    if (!owner || !immersive) return;
    const q = head.getWorldQuaternion(new THREE.Quaternion());
    const mouth = new THREE.Vector3(0, -.094, -.083).applyQuaternion(q)
      .add(head.getWorldPosition(new THREE.Vector3()));
    if (mouth.distanceToSquared(new THREE.Vector3().copy(dispensed.body.position)) > .082 ** 2) mouthTime = 0;
    else if ((mouthTime += delta) >= .34) eatCandy();
  }

  function toggleMonitor() {
    monitorOn = !monitorOn;
    monitor?.traverse(mesh => { if (mesh.isMesh) mesh.material = monitorOn ? monitorMaterial : monitorOff; });
  }

  function disturb(point, force) {
    for (const cloth of curtainMeshes) cloth.touch(point, force);
  }

  function locateDesktop(position, direction) {
    camera.object3D.position.copy(position);
    const yaw = Math.atan2(-direction.x, -direction.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));
    camera.object3D.rotation.set(pitch, yaw, 0, 'YXZ');
    if (look) {
      look.yawObject.rotation.y = yaw;
      look.pitchObject.rotation.x = pitch;
    }
    scene.camera.updateWorldMatrix(true, false);
  }

  function leavePhone() {
    if (!readFrom) return;
    const { position, direction } = readFrom;
    readFrom = null;
    camera.setAttribute('look-controls', 'enabled', true);
    finish('mouse', false, false);
    scenePhysics.release('reader', false);
    locateDesktop(position, direction);
    desktopLast.copy(position);
    readButton.textContent = 'Ler celular';
    readButton.setAttribute('aria-pressed', 'false');
  }

  function readPhone() {
    sound.unlock();
    if (immersive) return;
    if (readFrom) { leavePhone(); return; }
    const prop = scenePhysics.props.get(data.phone.id);
    const position = new THREE.Vector3().copy(prop.body.position);
    const rotation = new THREE.Quaternion().copy(prop.body.quaternion);
    if (!scenePhysics.grab('reader', position, rotation, prop)) return;
    readFrom = {
      position: camera.object3D.position.clone(),
      direction: scene.camera.getWorldDirection(new THREE.Vector3())
    };
    camera.setAttribute('look-controls', 'enabled', false);
    readButton.textContent = 'Voltar ao quarto';
    readButton.setAttribute('aria-pressed', 'true');
    const face = new THREE.Vector3(0, 0, 1);
    const at = phone.screen.getWorldPosition(new THREE.Vector3());
    const normal = face.applyQuaternion(phone.screen.getWorldQuaternion(new THREE.Quaternion()));
    const near = at.clone().addScaledVector(normal, .40);
    if (Math.abs(normal.y) > .8) near.z += .10;
    locateDesktop(near, at.sub(near).normalize());
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  function canTouchPhone(id) {
    const owner = scenePhysics.props.get(data.phone.id)?.held;
    if (id === 'mouse') return owner === 'reader';
    return Boolean(owner && owner !== 'reader' && owner !== 'mouse' && !scenePhysics.hand.get(owner)?.remote &&
      owner.endsWith('left') !== id.endsWith('left') && !scenePhysics.hand.has(id));
  }

  function pointOnScreen() {
    const at = phone.screen.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(phone.screen.getWorldQuaternion(new THREE.Quaternion()));
    if (normal.dot(ray.ray.direction) >= -.0001) return null;
    plane.setFromNormalAndCoplanarPoint(normal, at);
    return ray.ray.intersectPlane(plane, new THREE.Vector3());
  }

  function phoneTarget(id, point) {
    if (!canTouchPhone(id)) return phone.guide(id, null);
    const at = phone.position(point);
    const close = at.z >= -.025 && at.z <= .21;
    const direct = close && !id.startsWith('controller-');
    const project = () => phone.screen.localToWorld(phone.screen.worldToLocal(point.clone()).setZ(0));
    if (direct && at.inside) return phone.guide(id, at) ?? project();
    const aimed = pointOnScreen();
    if (direct) {
      const guided = phone.guide(id, at);
      if (guided) return guided;
    }
    if (aimed && aimed.distanceTo(ray.ray.origin) < .88) {
      const aim = phone.position(aimed);
      const guided = phone.guide(id, aim);
      if (guided || aim.inside) return guided ?? aimed;
    }
    return close && at.inside ? phone.guide(id, at) ?? project() : phone.guide(id, null);
  }

  function samplePhoneTip(id, tip) {
    if (!tip || !canTouchPhone(id) || phoneRays.has(id)) {
      phoneTips.delete(id);
      if (handPokes.delete(id)) phone.release(id, { inside: false }, false);
      return;
    }
    const at = phone.position(tip);
    const prior = phoneTips.get(id);
    const armed = at.z > .034 || Boolean(prior?.armed);
    phoneTips.set(id, { point: tip.clone(), at, armed });
    if (handPokes.has(id)) {
      if (at.z > .027 || at.z < -.075) {
        phone.release(id, handPokes.get(id), at.z > .027);
        handPokes.delete(id);
      } else if (at.inside) {
        phone.drag(id, at);
        handPokes.set(id, at);
      }
      return;
    }
    if (!prior?.armed || at.z > .014 || prior.point.distanceToSquared(tip) > .18 ** 2) return;
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(phone.screen.getWorldQuaternion(new THREE.Quaternion()));
    const contact = phonePokeCrossing(prior.at, at, prior.point.clone().sub(tip).dot(normal));
    if (contact) {
      phoneTips.get(id).armed = false;
      const target = phone.pokeTarget(id, contact);
      if (phone.touch(id, target)) handPokes.set(id, target);
    }
  }

  function pressPhoneRay(id, point) {
    if (!point || !canTouchPhone(id)) return false;
    const at = phone.position(point);
    if (!phone.press(id, at)) return false;
    phoneRays.set(id, at);
    return true;
  }

  function movePhoneRay(id, point) {
    if (!phoneRays.has(id) || !point) return;
    const at = phone.position(point);
    phone.drag(id, at);
    phoneRays.set(id, at);
  }

  function targets(max) {
    ray.far = max;
    return ray.intersectObjects(pickable, true).filter(hit => {
      for (let item = hit.object; item; item = item.parent) if (!item.visible) return false;
      const frame = hit.object.userData.frame;
      return hit.object.userData.screen || hit.object.userData.curtain || hit.object.userData.monitor ||
        hit.object.userData.lampSwitch || hit.object.userData.roomAction || hit.object.userData.shopAction ||
        (frame && !frame.detached) ||
        hit.object.userData.prop?.active || hasParent(hit.object, scenePhysics.doorObject);
    });
  }

  function hasParent(object, parent) {
    for (; object; object = object.parent) if (object === parent) return true;
    return false;
  }

  function aimedAtPickup() {
    const object = targets(4.7)[0]?.object;
    const prop = object?.userData.screen ? scenePhysics.props.get(data.phone.id) : object?.userData.prop;
    return prop && !prop.held && (prop.def.id === data.phone.id || prop.def.candy);
  }

  function pressAt(id, isGrab, orientation) {
    sound.unlock();
    const venue = date?.active();
    if (venue) return venue.press(id, ray, orientation, null, isGrab);
    if (!isGrab && id === 'mouse' && canTouchPhone(id))
      return pressPhoneRay(id, pointOnScreen());
    const hit = targets(4.7)[0];
    if (!hit) return false;
    const { screen, curtain, monitor, frame, lampSwitch, roomAction, shopAction: action } = hit.object.userData;
    if (action) return shopAction(action);
    if (roomAction) { roomAction(); return true; }
    if (lampSwitch) { toggleBedsideLamp(); return true; }
    if (frame) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(hit.object.matrixWorld);
      const before = hit.point.clone().addScaledVector(normal, isGrab ? .12 : .044);
      const after = hit.point.clone().addScaledVector(normal, -.014);
      return upgrade.strike(before, after, .045, scenePhysics.dropFrame);
    }
    if (!isGrab && scenePhysics.pressKey(hit.object)) return true;
    const prop = screen ? scenePhysics.props.get(data.phone.id) : hit.object.userData.prop;
    if (screen && !isGrab) return false;
    if (curtain) { disturb(hit.point, Math.sign(ray.ray.direction.z) * .28); return true; }
    if (monitor && !isGrab) { toggleMonitor(); return true; }
    if (prop?.pull && !isGrab) return scenePhysics.canReach(prop, ray.ray.origin, hit.point) &&
      scenePhysics.click(prop, ray.ray.origin);
    if (prop && scenePhysics.canReach(prop, ray.ray.origin, hit.point)) {
      const distance = hit.distance;
      const selected = scenePhysics.gripAt(prop, hit.point);
      const pullToHand = (prop.def.id === data.phone.id || prop.def.candy) && id !== 'mouse' && immersive;
      if (scenePhysics.grab(id, hit.point, orientation, selected,
        { contact: hit.point, from: ray.ray.origin, remote: !pullToHand })) {
        inputs.set(id, { distance: pullToHand ? 0 : distance });
        return true;
      }
    }
    if (hasParent(hit.object, scenePhysics.doorObject)) {
      const before = hit.point.clone().addScaledVector(ray.ray.direction, -.065);
      scenePhysics.pushDoor(hit.point, before);
      return true;
    }
    return false;
  }

  function setDesktopRay(event) {
    const view = scene.camera;
    const box = canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2((event.clientX - box.left) / box.width * 2 - 1, 1 - (event.clientY - box.top) / box.height * 2);
    view.updateWorldMatrix(true, false);
    ray.setFromCamera(pointer, view);
    return view.getWorldQuaternion(new THREE.Quaternion());
  }

  function finish(id, useRay, commit = true) {
    if (date?.active()) { date.active().release(id, commit); return; }
    const touch = phoneRays.get(id);
    if (phoneRays.delete(id)) {
      const point = useRay && id === 'mouse' && pointOnScreen();
      phone.release(id, point ? phone.position(point) : touch, commit && canTouchPhone(id));
    }
    if (id === 'mouse' && inputs.has(id)) {
      inputs.delete(id);
      scenePhysics.release(id, commit);
    } else if (inputs.delete(id) || scenePhysics.hand.has(id)) scenePhysics.release(id, commit);
  }

  function wireDesktop() {
    canvas = scene.canvas;
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('pointerdown', event => {
      if (immersive || event.button === 1) return;
      if (event.button === 2 && dispensed?.held === 'mouse') {
        finish('mouse', false);
        return;
      }
      const id = 'mouse';
      const orientation = setDesktopRay(event);
      const hit = event.button === 0 && menu.hit(ray);
      if (hit) {
        desktopMenuPress = { object: hit.object, x: event.clientX, y: event.clientY };
        return;
      }
      const grabbed = pressAt(id, event.button === 2, orientation) ||
        (event.button === 2 && date?.active()?.beginSwipe(id, ray));
      if (!grabbed) return;
      desktopGesture = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      if (look) look.mouseDown = false;
    });
    canvas.addEventListener('pointermove', event => {
      if (immersive) return;
      const orientation = setDesktopRay(event);
      menu.hover(menu.hit(ray));
      date?.active()?.focus(ray);
      if (desktopGesture !== event.pointerId && dispensed?.held !== 'mouse') return;
      if (date?.active()) { date.active().move('mouse', ray, orientation); return; }
      const held = inputs.get('mouse');
      if (held) scenePhysics.updateGrab('mouse', ray.ray.at(held.distance, new THREE.Vector3()), orientation);
      if (phoneRays.has('mouse')) movePhoneRay('mouse', pointOnScreen());
    });
    canvas.addEventListener('pointerup', event => {
      if (desktopMenuPress && event.button === 0) {
        const start = desktopMenuPress;
        desktopMenuPress = undefined;
        setDesktopRay(event);
        const hit = menu.hit(ray);
        if (hit?.object === start.object && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 8) menu.activate(hit);
        return;
      }
      if (desktopGesture !== event.pointerId) return;
      setDesktopRay(event);
      if (dispensed?.held !== 'mouse') finish('mouse', true);
      desktopGesture = undefined;
    });
    canvas.addEventListener('pointercancel', event => {
      desktopMenuPress = undefined;
      if (desktopGesture !== event.pointerId) return;
      finish('mouse', false, false);
      desktopGesture = undefined;
    });
  }

  const floor = new THREE.Plane(up, 0);
  const xrVisuals = new THREE.Group();
  scene.object3D.add(xrVisuals);
  const pointerGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,0,0), new THREE.Vector3(0,0,-1)
  ]);
  for (const side of ['left', 'right']) {
    const line = new THREE.Line(pointerGeometry,
      new THREE.LineBasicMaterial({ color: 0xefbae7, transparent: true, opacity: .48, depthWrite: false }));
    const marker = new THREE.Mesh(new THREE.RingGeometry(.073, .082, 32),
      new THREE.MeshBasicMaterial({ color: 0xefbae7, side: THREE.DoubleSide }));
    marker.rotateX(-Math.PI / 2);
    xrVisuals.add(line, marker);
    line.visible = marker.visible = false;
    line.name = 'XR pointer ' + side;
    controls[side] = { line, marker, stick: new THREE.Vector2() };
  }

  let controllerButtons;
  const xrConnections = new Map();
  function trackControllerSpaces() {
    for (let i = 0; i < 2; i++) {
      const pointer = scene.renderer.xr.getController(i);
      const grip = scene.renderer.xr.getControllerGrip(i);
      rig.object3D.add(pointer, grip);
      pointer.addEventListener('connected', ({ data }) => {
        if (data?.handedness && !data.hand) xrConnections.set(data.handedness, { source: data, pointer, grip });
      });
      pointer.addEventListener('disconnected', ({ data }) => {
        if (xrConnections.get(data?.handedness)?.source === data) xrConnections.delete(data.handedness);
      });
    }
  }
  if (scene.renderer?.xr) trackControllerSpaces();
  else scene.addEventListener('renderstart', trackControllerSpaces, { once: true });

  function displayRay(control, pose, length) {
    control.line.visible = Boolean(pose);
    if (!pose) return;
    control.line.position.copy(pose.position);
    control.line.quaternion.copy(pose.orientation);
    control.line.scale.z = length;
    control.line.material.depthTest = !menu.visible;
    control.line.material.opacity = control.menuPoint ? .95 : menu.visible ? .65 : .48;
    control.line.renderOrder = menu.visible ? 105 : 0;
  }

  function activateXrMenu(hit) {
    if (!hit) return false;
    if (elapsed - lastMenuAction >= .25 && menu.activate(hit)) lastMenuAction = elapsed;
    return true;
  }

  function xrSources() {
    return currentXrFrame(scene)?.session?.inputSources ??
      scene.xrSession?.inputSources ?? scene.renderer.xr.getSession()?.inputSources ?? [];
  }

  function controllerInput(side, venue, useHandRay) {
    const control = controls[side];
    const id = 'controller-' + side;
    const connection = xrConnections.get(side);
    const sources = Array.from(xrSources());
    const source = sources.find(item => item.handedness === side && !item.hand &&
      item.targetRayMode !== 'gaze' && (item.gripSpace || item.targetRaySpace)) ??
      (useHandRay ? sources.find(item => item.hand && item.handedness === side) : undefined) ?? connection?.source;
    const tracked = connection?.source === source && connection ? {
      pointer: trackedObjectPose(THREE, connection.pointer), grip: trackedObjectPose(THREE, connection.grip)
    } : undefined;
    const sampled = controllerSpaces(THREE, scene, rig.object3D, source, side, tracked);
    if (source !== control.source) {
      control.lastPose = null;
      control.buttons = [false, false];
      if (control.action != null) finish(id, false, false);
      control.action = null;
    }
    control.source = source;
    if (sampled) {
      control.lastPose = sampled;
      control.lastPoseAt = elapsed;
    }
    const grip = sampled ?? (elapsed - control.lastPoseAt < .12 ? control.lastPose : null);
    const aim = grip?.aim;
    const gamepad = source?.gamepad;
    const trigger = gamepad?.buttons[0]?.pressed ? Math.max(.6, gamepad.buttons[0].value ?? 0) : gamepad?.buttons[0]?.value ?? 0;
    const squeeze = gamepad?.buttons[1]?.pressed ? Math.max(.6, gamepad.buttons[1].value ?? 0) : gamepad?.buttons[1]?.value ?? 0;
    control.avatarPose = grip ? { position: grip.position, orientation: grip.orientation, trigger, squeeze,
      anchored: grip.hasGrip && !source?.hand } : null;
    control.pointerTarget = control.menuPoint = null;
    if (!aim || !grip) {
      phone.clearGuide(id);
      displayRay(control, null);
      if (control.action != null) finish(id, false, false);
      venue?.handContact(id, null);
      control.action = null;
      control.contactPoint = null;
      control.doorPoint = null;
      if (!source) control.buttons = [false, false];
      control.stick.set(0,0);
      if (!source && control.voiceHeld) date?.voice()?.cancel();
      control.voiceHeld = false;
      return null;
    }

    control.stick.set(gamepad?.axes[2] ?? 0, gamepad?.axes[3] ?? 0);
    pointRay(THREE, ray, aim);
    ray.far = 4.7;
    venue?.focus(ray);
    const menuHit = menu.hit(ray);
    if (menuHit) {
      menuHover ??= menuHit;
      control.menuPoint = menuHit.point;
    }
    if (menuHit || venue) phone.clearGuide(id);
    const screenHit = !menuHit && !venue && phoneTarget(id, aim.position);
    displayRay(control, aim, menuHit?.distance ?? 2.2);
    if (screenHit) {
      const aimAt = screenHit.clone().sub(aim.position).normalize();
      ray.set(aim.position, aimAt);
      control.pointerTarget = phone.screen.worldToLocal(screenHit.clone());
      control.avatarPose.pointDirection = aimAt;
    } else control.avatarPose.pointDirection = ray.ray.direction.clone();
    const events = controllerButtons?.read(source) ?? [false,false];
    const pressed = [trigger > .55 || events[0], squeeze > .55 || events[1]];
    const previous = control.buttons ?? [false, false];
    if (phoneRays.has(id)) movePhoneRay(id, screenHit);
    if (control.action != null && !pressed[control.action]) {
      finish(id, false);
      control.action = null;
    }
    if (source?.hand && control.avatarPose) control.avatarPose.trigger = Number(pressed[0]);
    if (control.action == null) {
      let grabbed;
      if (pressed[1] && !previous[1]) {
        if (venue) grabbed = venue.press(id, ray, grip.orientation, grip.contact, true, grip.position);
        else if (scenePhysics.grab(id, grip.contact, grip.orientation, scenePhysics.nearest(grip.contact, .10, grip.position, id),
          { from: grip.position })) {
          inputs.set(id, { distance: 0 });
          grabbed = true;
        }
        if (!grabbed && !venue && !menuHit && !screenHit && aimedAtPickup())
          grabbed = pressAt(id, true, grip.orientation);
        if (grabbed) control.action = 1;
      } else if (pressed[0] && !previous[0]) {
        if (activateXrMenu(menuHit)) {
          control.action = 0;
        } else if (venue?.skillPlaying() && !venue.dancePlaying()) venue.skillInput(side);
        else {
          const handPickup = !venue && !screenHit && source?.hand && aimedAtPickup();
          if (screenHit ? pressPhoneRay(id, screenHit) : pressAt(id, Boolean(handPickup), grip.orientation))
            control.action = 0;
        }
      }
      if (venue?.dancePlaying() && grip) {
        const previousGrip = control.skillGripPosition;
        if (pressed[0] && previous[0] && previousGrip) {
          const delta = grip.position.clone().sub(previousGrip);
          venue.skillSlash(side, delta.x, delta.y, delta.z);
        }
        control.skillGripPosition = grip.position.clone();
      } else control.skillGripPosition = null;
    }
    control.buttons = pressed;
    if (venue) {
      venue.move(id, ray, grip.orientation, grip.contact);
      venue.handContact(id, grip.contact);
    }
    else {
      const current = grip.contact;
      let doorContact;
      if (control.contactPoint && !scenePhysics.hand.has(id)) {
        const touched = contactBedroom(control.contactPoint, current, control.contactTime, .035);
        doorContact = scenePhysics.pushDoor(current, control.doorPoint ?? control.contactPoint, .042, Boolean(control.doorPoint));
        if (touched && !doorContact && !control.avatarPose.anchored)
          control.avatarPose.position = grip.position.clone().add(touched.sub(current));
      }
      control.doorPoint = doorContact;
      if (doorContact && !control.avatarPose.anchored)
        control.avatarPose.position = grip.position.clone().add(doorContact.clone().sub(current));
      control.contactPoint = current;
      control.contactTime = elapsed;
      const hold = inputs.get(id);
      if (hold) scenePhysics.updateGrab(id, hold.distance ? ray.ray.at(hold.distance, new THREE.Vector3()) :
        grip.contact, grip.orientation);
    }
    if (side === 'right' && !venue) {
      const pressed = Boolean(gamepad?.buttons[5]?.pressed);
      if (pressed && !control.menuHeld) menu.visible ? menu.close() : menu.show();
      control.menuHeld = pressed;
    }
    if (side === 'right' && venue) {
      const held = Boolean(gamepad?.buttons[4]?.pressed);
      if (held && !control.voiceHeld && !venue.isInteracting()) date.voice().toggle();
      control.voiceHeld = held;
      const gestureHeld = Boolean(gamepad?.buttons[5]?.pressed);
      if (gestureHeld && !control.gestureHeld && !venue.isInteracting()) {
        middleFingerUntil = elapsed + 1.25;
        date.voice().choose('middle_finger');
      }
      control.gestureHeld = gestureHeld;
    }
    return grip.contact;
  }

  function handAim(tip, control, screenHit, ownDirection, menuHit) {
    const offset = screenHit?.clone().sub(tip);
    const direction = offset?.lengthSq() > 1e-8 ? offset.normalize() : ownDirection;
    if (direction.lengthSq() < .5) return null;
    const aim = { position: tip, orientation: new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, -1), direction) };
    ray.set(tip, direction);
    const hit = menuHit ?? targets(4.7)[0];
    const landing = !screenHit && !hit && direction.y < -.18 && ray.ray.intersectPlane(floor, new THREE.Vector3());
    const spot = landing && reachableFloor(landing);
    control.marker.visible = Boolean(spot);
    if (spot) control.marker.position.copy(spot).setY(.013);
    control.avatarPose.pointDirection = direction;
    control.pointerTarget = screenHit && phone.screen.worldToLocal(screenHit.clone());
    displayRay(control, aim, screenHit ? tip.distanceTo(screenHit) :
      hit?.distance ?? (spot ? tip.distanceTo(spot) : .72));
    return { aim, spot };
  }

  function reachableFloor(landing) {
    const head = viewer().getWorldPosition(new THREE.Vector3());
    const inRoom = Math.abs(landing.x) <= 2.2 && landing.z >= -1.71 && landing.z <= 3.40;
    if ((!inRoom && !upgrade.corridorContains(landing)) ||
      Math.hypot(head.x - landing.x, head.z - landing.z) > 2.8) return null;
    const goal = landing.clone().setY(head.y);
    const safe = walkBedroom(head, goal, scenePhysics.playerObstacles(), THREE.MathUtils.clamp(head.y, .55, 2.1));
    return safe.distanceTo(goal) < .06 ? safe : null;
  }

  function stepToFloor(landing) {
    const safe = reachableFloor(landing);
    if (!safe) return;
    const head = viewer().getWorldPosition(new THREE.Vector3());
    rig.object3D.position.x += safe.x - head.x;
    rig.object3D.position.z += safe.z - head.z;
    lastHead = safe;
  }

  function contactBedroom(from, to, previousTime, radius, fingertip = false) {
    if (from.distanceToSquared(to) > .12 * .12) return null;
    const seconds = elapsed - previousTime;
    scenePhysics.hitCord(from, to, seconds);
    upgrade.strike(from, to, seconds, scenePhysics.dropFrame, radius);
    if (fingertip) {
      scenePhysics.tapKeyboard(from, to);
      upgrade.additions.touch(from, to, elapsed);
      const action = upgrade.shop.touch(from, to, elapsed);
      if (action) shopAction(action);
    }
    if (upgrade.bedside.touchesSwitch(from, to)) toggleBedsideLamp();
    const curtainForce = THREE.MathUtils.clamp((to.z - from.z) * 3.2, -.11, .11);
    if (Math.abs(curtainForce) > .006) disturb(to, curtainForce);
    return scenePhysics.bumpProp(from, to, seconds, radius, elapsed);
  }

  function handInteractions() {
    handPose.update();
    for (const side of ['left', 'right']) {
      const webHand = handPose.getHand(side);
      const control = controls[side];
      control.marker.visible = false;
      controllerInput(side, null, !webHand.active);
      if (!webHand.active) {
        phone.clearGuide(side);
        const seen = trackedHands.get(side);
        if (seen !== undefined && elapsed - seen > HAND_TRACKING_GRACE) {
          if (inputs.has(side) || phoneRays.has(side)) finish(side, false, false);
          scenePhysics.release(side, false);
          control.landing = null;
          if (handPokes.has(side)) phone.release(side, handPokes.get(side), false);
          handPokes.delete(side);
          phoneTips.delete(side);
          trackedHands.delete(side);
          handPose.resetPinch(side);
          previous.delete(side);
        }
        continue;
      }
      trackedHands.set(side, elapsed);
      const { wristWorld, pinchPosition, indexTipWorld, wristPosition } = webHand;
      const basis = trackedHandBasis(THREE, webHand);
      const orientation = basis ?? new THREE.Quaternion().setFromRotationMatrix(wristWorld);
      control.avatarPose = { position: wristPosition, orientation, tracked: webHand };
      const at = phone.position(indexTipWorld);
      const distal = new THREE.Vector3().setFromMatrixPosition(webHand.worldMatrices[8]);
      let origin = indexTipWorld;
      let direction = indexTipWorld.clone().sub(distal).normalize();
      ray.set(origin, direction);
      ray.far = 4.7;
      const fingerHit = menu.hit(ray);
      const nativeAim = (menu.visible || canTouchPhone(side)) &&
        sampleSpace(THREE, scene, rig.object3D, webHand.source.targetRaySpace);
      if (nativeAim) pointRay(THREE, ray, nativeAim);
      const nativeHit = nativeAim && menu.hit(ray);
      const menuHit = nativeHit || fingerHit;
      if (nativeHit) {
        origin = nativeAim.position;
        direction = ray.ray.direction.clone();
      } else ray.set(origin, direction);
      const nativeSelect = controllerButtons?.read(webHand.source)[0] ?? false;
      const selectEdge = nativeSelect && !control.handSelect;
      control.handSelect = nativeSelect;
      if (menuHit) menuHover ??= menuHit;
      if (menuHit) phone.clearGuide(side);
      control.menuPoint = menuHit?.point;
      if (!menuHit && nativeAim) pointRay(THREE, ray, nativeAim);
      const nativeScreen = !menuHit && nativeAim && phoneTarget(side, indexTipWorld);
      if (!nativeScreen) ray.set(origin, direction);
      const screenHit = nativeScreen || (!menuHit && phoneTarget(side, indexTipWorld));
      const aiming = handAim(origin, control, screenHit, direction, menuHit);
      const menuSelected = (selectEdge || webHand.justPinched) && activateXrMenu(menuHit);
      if (handPokes.has(side) && !canTouchPhone(side)) {
        phone.release(side, at, false);
        handPokes.delete(side);
      }
      if (!menuSelected && (selectEdge || webHand.justPinched) && !handPokes.has(side) && !scenePhysics.hand.has(side) &&
        !phoneRays.has(side) && !inputs.has(side)) {
        const palm = wristPosition.clone().lerp(pinchPosition, .55);
        if (screenHit) pressPhoneRay(side, screenHit);
        else if (webHand.justPinched && !scenePhysics.grab(side, pinchPosition, orientation,
          scenePhysics.nearest(pinchPosition, .073, palm, side), { from: palm }) && aiming) {
          if (!pressAt(side, true, orientation) && aiming.spot) control.landing = aiming.spot;
        }
      }
      if (phoneRays.has(side)) {
        if (!canTouchPhone(side)) finish(side, false, false);
        else {
          movePhoneRay(side, screenHit);
          if (!nativeSelect && !webHand.pinched) finish(side, false);
        }
      }
      if (webHand.pinched) {
        if (handPokes.has(side) && at.inside) {
          phone.drag(side, at);
          handPokes.set(side, at);
        }
        const hold = inputs.get(side);
        const goal = hold?.distance && aiming ? ray.ray.at(hold.distance, new THREE.Vector3()) : pinchPosition;
        scenePhysics.updateGrab(side, goal, orientation);
      } else if (webHand.justReleased) {
        if (handPokes.has(side)) {
          phone.release(side, handPokes.get(side), true);
          handPokes.delete(side);
        }
        finish(side, false);
        if (control.landing) {
          stepToFloor(control.landing);
          control.landing = null;
        }
      }
      const was = previous.get(side);
      let fingertipContact;
      if (!webHand.pinched && !scenePhysics.hand.has(side)) {
        samplePhoneTip(side, indexTipWorld);
        if (was) {
          fingertipContact = contactBedroom(was.point, indexTipWorld, was.time, .014, true);
          const monitorDepth = monitorContact(indexTipWorld);
          if (monitorDepth !== null && monitorDepth < .018 && monitorDepth > -.025) {
            const previousDepth = monitorContact(was.point);
            if (previousDepth !== null && previousDepth <= -.027 && elapsed - lastMonitorTouch > .32) {
              toggleMonitor();
              lastMonitorTouch = elapsed;
            }
          }
        }
      }
      const middle = new THREE.Vector3().setFromMatrixPosition(webHand.worldMatrices[11]);
      const palm = wristPosition.clone().lerp(middle, .72);
      let doorPalm, doorTip;
      if (was && !scenePhysics.hand.has(side)) {
        const palmContact = contactBedroom(was.palm, palm, was.time, .039);
        doorPalm = scenePhysics.pushDoor(palm, was.doorPalm ?? was.palm, .046, Boolean(was.doorPalm));
        if (!doorPalm && !webHand.pinched)
          doorTip = scenePhysics.pushDoor(indexTipWorld, was.doorTip ?? was.point, .028, Boolean(was.doorTip));
        const correction = doorPalm?.clone().sub(palm) ?? doorTip?.clone().sub(indexTipWorld) ??
          palmContact?.sub(palm) ?? fingertipContact?.sub(indexTipWorld);
        if (correction) control.avatarPose.position = wristPosition.clone().add(correction);
      }
      previous.set(side, { point: clone(indexTipWorld), wrist: wristPosition.clone(), palm,
        doorPalm, doorTip, time: elapsed });
    }
  }

  function moveXR(delta) {
    const head = viewer();
    const point = head.getWorldPosition(new THREE.Vector3());
    const direction = head.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const right = direction.clone().cross(up);
    const { stick } = controls.left;
    const goal = point.clone();
    if (stick.lengthSq() > .045) {
      goal.addScaledVector(direction, -stick.y * delta * 1.1);
      goal.addScaledVector(right, stick.x * delta * 1.1);
    }
    const height = THREE.MathUtils.clamp(point.y, .55, 2.1);
    const end = walkBedroom(lastHead ?? point, goal, scenePhysics.playerObstacles(), height);
    rig.object3D.position.x += end.x - point.x;
    rig.object3D.position.z += end.z - point.z;
    lastHead = end;

    const turn = controls.right.stick.x;
    if (Math.abs(turn) > .66 && !snapHeld) {
      snapHeld = true;
      const pivot = new THREE.Vector3(end.x, 0, end.z);
      const offset = rig.object3D.position.clone().sub(pivot);
      const angle = -Math.sign(turn) * Math.PI / 6;
      offset.applyAxisAngle(up, angle);
      rig.object3D.position.copy(pivot.add(offset));
      rig.object3D.rotateY(angle);
    } else if (Math.abs(turn) < .26) snapHeld = false;
  }

  let seatedSkillTime;
  function seatedInput(stage) {
    handPose.update();
    stage.skillAxis(controls.left.stick.x, controls.left.stick.y,
      Math.min(.05, Math.max(.001, elapsed - (seatedSkillTime ?? elapsed))));
    seatedSkillTime = elapsed;
    for (const side of ['left', 'right']) {
      const hand = handPose.getHand(side);
      controllerInput(side, stage, !hand.active);
      const control = controls[side];
      control.marker.visible = false;
      if (!hand.active) {
        const seen = trackedHands.get(side);
        if (seen !== undefined && elapsed - seen > HAND_TRACKING_GRACE) {
          stage.release(side, false);
          trackedHands.delete(side);
          handPose.resetPinch(side);
          dateKeys.delete(side);
        }
        stage.handContact(side, null);
        continue;
      }
      trackedHands.set(side, elapsed);
      const rotation = new THREE.Quaternion().setFromRotationMatrix(hand.wristWorld);
      control.avatarPose = { position: hand.wristPosition, orientation: rotation, tracked: hand };
      const aim = sampleSpace(THREE, scene, rig.object3D, hand.source.targetRaySpace);
      if (aim) pointRay(THREE, ray, aim);
      else ray.set(hand.pinchPosition, new THREE.Vector3(0,0,-1).applyQuaternion(rotation));
      ray.far = 4.7;
      const menuHit = menu.hit(ray);
      if (menuHit) menuHover ??= menuHit;
      control.menuPoint = menuHit?.point;
      displayRay(control, aim, menuHit?.distance ?? 1.4);
      const nativeSelect = controllerButtons?.read(hand.source)[0] ?? false;
      const menuSelected = (hand.justPinched || (nativeSelect && !control.handSelect)) && activateXrMenu(menuHit);
      control.handSelect = nativeSelect;
      if (!menuSelected && hand.justPinched && !dateKeys.has(side))
        stage.press(side, ray, rotation, hand.pinchPosition, false, hand.wristPosition);
      if (hand.pinched) stage.move(side, ray, rotation, hand.pinchPosition);
      else {
        stage.release(side);
        if (!dateKeys.has(side) && stage.poke(hand.indexTipWorld)) dateKeys.add(side);
        else if (dateKeys.has(side) && !stage.pokeNear(hand.indexTipWorld)) dateKeys.delete(side);
      }
      stage.handContact(side, hand.pinched ? null : hand.wristPosition.clone().lerp(hand.indexTipWorld, .43));
    }
  }

  function venueSound(kind, from, effect = {}) {
    if (date?.voice()?.state().recording) return;
    try {
      dateAmbience ??= new AudioContext();
      if (dateAmbience.state === 'suspended') void dateAmbience.resume().catch(() => {});
      const context = dateAmbience;
      if (context.state !== 'running') return;
      const ear = viewer();
      const offset = from.clone().sub(ear.getWorldPosition(new THREE.Vector3()));
      offset.applyQuaternion(ear.getWorldQuaternion(new THREE.Quaternion()).invert());
      const pan = context.createStereoPanner();
      const gain = context.createGain();
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const now = context.currentTime;
      const chime = kind === 'entrance';
      const qteActive = Boolean(date?.getView()?.qte);
      const qteCue = kind.startsWith('qte_');
      const interactionCue = kind.startsWith('interaction_');
      const mint = kind === 'mint';
      const level = mint ? (requestedReduced ? .012 : .026) : qteCue ? kind === 'qte_start' ? .12 : .055 :
        kind === 'interaction_pulse' ? .065 : kind === 'interaction_downbeat' ? .12 : interactionCue ? .075 :
        (kind === 'ambience' || kind === 'step' ? .028 : .09) * (qteActive ? .36 : 1);
      const duration = kind === 'qte_start' ? .82 : kind === 'qte_end' ? .42 :
        kind === 'interaction_perfect' ? .34 : kind === 'interaction_combo' ? .40 :
          kind === 'interaction_warning' ? .19 : kind === 'interaction_countdown' ? .14 :
        kind === 'interaction_drop' ? .38 : kind === 'interaction_success' ? .4 : .25;
      pan.pan.value = THREE.MathUtils.clamp(offset.x / Math.max(offset.length(), .1), -1, 1);
      oscillator.type = kind === 'ambience' || kind === 'qte_start' || kind === 'interaction_drop' ||
        kind === 'interaction_warning' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(mint ? 580 : kind === 'qte_start' ? 230 : kind === 'qte_end' ? 360 :
        kind === 'qte_tick' ? 620 : kind === 'interaction_clink' ? 1100 :
        kind === 'interaction_drop' ? 320 : kind === 'interaction_hit' ? 700 :
        kind === 'interaction_perfect' ? 960 : kind === 'interaction_combo' ? 740 :
        kind === 'interaction_warning' ? 160 : kind === 'interaction_countdown' ? 520 :
        kind === 'interaction_pulse' ? 118 : kind === 'interaction_downbeat' ? 88 :
        kind === 'interaction_beat' ? 260 : kind === 'interaction_toss' ? 410 :
        kind === 'interaction_success' ? 760 : kind === 'interaction_fail' ? 180 :
        kind === 'interaction_bite' ? 420 : chime ? 780 : kind === 'ambience' ? 190 : kind === 'step' ? 96 : 490, now);
      oscillator.frequency.exponentialRampToValueAtTime(mint ? 463 : kind === 'qte_start' ? 76 :
        kind === 'qte_end' ? 690 : kind === 'qte_tick' ? 420 :
        kind === 'interaction_clink' ? 700 : kind === 'interaction_success' ? 1180 :
        kind === 'interaction_perfect' ? 1480 : kind === 'interaction_combo' ? 1120 :
        kind === 'interaction_warning' ? 100 : kind === 'interaction_countdown' ? 380 :
        kind === 'interaction_pulse' ? 72 : kind === 'interaction_downbeat' ? 48 :
        kind === 'interaction_drop' || kind === 'interaction_fail' ? 85 :
        kind === 'interaction_beat' ? 180 : kind === 'interaction_toss' ? 300 :
        chime ? 520 : 135, now + duration);
      filter.type = 'lowpass';
      filter.frequency.value = qteActive && !qteCue ? 650 : 12000;
      gain.gain.setValueAtTime(.001, now);
      gain.gain.exponentialRampToValueAtTime(level / (1 + .15 * offset.length()), now + .03);
      gain.gain.exponentialRampToValueAtTime(.001, now + duration);
      oscillator.connect(gain).connect(filter).connect(pan).connect(context.destination);
      echoRoomSound(context, pan, effect.echo);
      oscillator.start(now);
      oscillator.stop(now + duration + .02);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); filter.disconnect(); pan.disconnect(); };
    } catch { /* The room is still playable with audio disabled. */ }
  }

  function hasXRPointer() {
    return controls.left.line.visible || controls.right.line.visible;
  }

  function tick(delta) {
    elapsed += delta;
    menuHover = null;
    date.tick(delta);
    if (date.active()) {
      if (!immersive) date.active().skillAxis(Number(skillKeys.right) - Number(skillKeys.left),
        Number(skillKeys.down) - Number(skillKeys.up), delta, false);
      venueMetrics?.collect(performance.now());
      if (immersive) {
        if (pendingSeat && scene.frame) { pendingSeat = false; date.recenter(); }
        menu.follow(viewer(), true);
        seatedInput(date.active());
        const gaze = menu.gaze(viewer(), hasXRPointer(), delta);
        menu.hover(menuHover ?? gaze);
      } else menu.follow(viewer(), false);
      poseAvatar(delta);
      return;
    }
    if (immersive) moveXR(delta);
    else if (!readFrom) {
      const goal = camera.object3D.position;
      const end = walkBedroom(desktopLast, goal, scenePhysics.playerObstacles(), data.start[1]);
      camera.object3D.position.copy(end);
      const held = dispensed?.held === 'mouse' && scenePhysics.hand.get('mouse');
      if (held) scenePhysics.updateGrab('mouse', held.point.clone().add(end.clone().sub(desktopLast)), held.orientation);
      desktopLast.copy(end);
    }
    menu.follow(viewer(), immersive);
    if (immersive) {
      handInteractions();
      const gaze = menu.gaze(viewer(), hasXRPointer(), delta);
      menu.hover(menuHover ?? gaze);
    }
    applyPhoneGrip();
    scenePhysics.tick(delta);
    benchmark?.tick?.(scenePhysics, delta);
    scenery.tick(delta);
    const position = viewer().getWorldPosition(new THREE.Vector3());
    if (scenery.time !== requestedTime && !upgrade.corridorContains(position)) applyRoomTime(position);
    if (upgrade.tick(delta, elapsed, phase === 'intro' && !scenePhysics.props.get(data.phone.id)?.held, position, scenePhysics.doorBlocks))
      sound.creatureSting(scenery.reduced);
    const inCorridor = upgrade.corridorContains(position);
    scenery.setCorridor(inCorridor);
    sound.setCorridor(inCorridor);
    tickCandy(delta, viewer());
    for (const prop of scenePhysics.props.values()) {
      const { position, velocity } = prop.body;
      if (prop.active && position.z > 3.04 && velocity.lengthSquared() > .45) {
        const force = THREE.MathUtils.clamp(velocity.z * delta * 1.3, -.07, .07);
        disturb(new THREE.Vector3(position.x, position.y, position.z), force);
      }
    }
    for (const cloth of curtainMeshes) cloth.tick(delta);
    poseAvatar(delta);
    if (narrationUntil && elapsed > narrationUntil) {
      narrationUntil = 0;
      narrator.textContent = '';
      captions.draw('', false);
    }
  }

  function applyPhoneGrip() {
    const phone = scenePhysics.props.get(data.phone.id);
    if (!phone?.held) return;
    for (const [id, hold] of scenePhysics.hand) {
      if (hold.prop !== phone || hold.remote || id === 'reader') continue;
      const side = id.endsWith('left') ? 'left' : 'right';
      const pose = controls[side].avatarPose;
      if (!pose) continue;
      const basis = pose.tracked ? trackedHandBasis(THREE, pose.tracked) : pose.orientation;
      if (!basis) continue;
      const view = viewer();
      const eye = view.getWorldPosition(new THREE.Vector3());
      const eyeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(view.getWorldQuaternion(new THREE.Quaternion()));
      const fixed = phoneGrip(THREE, pose.position, basis, side, eye, eyeUp,
        new THREE.Vector3().copy(phone.body.position));
      scenePhysics.fixGrip(id, fixed.position, fixed.orientation, fixed.basis);
    }
  }

  function poseAvatar(delta) {
    const venue = date.active();
    const menuHands = venue?.menuHands();
    if (menuHands) {
      avatar.tick(viewer(), menuHands, delta, true);
      return;
    }
    const poses = {}, rayTargets = {};
    for (const side of ['left', 'right']) {
      const current = controls[side].avatarPose;
      const pose = handVisibility.pose(side, current, elapsed);
      if (!pose) continue;
      const id = pose.tracked ? side : 'controller-' + side;
      const gesture = side === 'right' && elapsed < middleFingerUntil ? 'middle_finger' : null;
      poses[side] = venue ? venue.heldPose(id, { ...pose, gesture }) :
        scenePhysics.handOnObject(id, pose);
      if (!venue && !poses[side].heldBody) {
        const phoneHit = controls[side].pointerTarget;
        const phonePoint = Boolean(canTouchPhone(id) && pose.pointDirection?.lengthSq() > .5);
        if (phonePoint) poses[side] = { ...poses[side], phonePoint };
        const rayGrip = scenePhysics.rayTarget(id);
        const endpoint = rayGrip ?? controls[side].menuPoint ??
          (phoneHit && phone.screen.localToWorld(phoneHit.clone()));
        if (endpoint) {
          rayTargets[side] = endpoint;
          const start = pose.position.clone().addScaledVector(pose.pointDirection ?? new THREE.Vector3(), .12);
          poses[side] = { ...poses[side], rayHold: Boolean(rayGrip), phonePoint,
            phoneTip: phoneHit && current?.tracked?.indexTipWorld,
            pointDirection: endpoint.clone().sub(start).normalize() };
        }
      }
    }
    const fingertips = avatar.tick(viewer(), immersive ? poses : {}, delta);
    if (venue || !immersive || !fingertips) return;
    for (const side of ['left', 'right']) {
      const control = controls[side];
      const origin = fingertips[side];
      if (!control.avatarPose?.tracked)
        samplePhoneTip('controller-' + side, control.avatarPose ? origin : null);
      if (!origin || !control.line.visible) continue;
      if (poses[side]?.heldBody) { displayRay(control, null); continue; }
      if (!poses[side]?.anchored) control.line.position.copy(origin);
      if (!rayTargets[side]) continue;
      const direction = rayTargets[side].sub(control.line.position);
      control.line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction.clone().normalize());
      control.line.scale.z = direction.length();
    }
  }

  let desktopPose;
  scene.addEventListener('enter-vr', () => {
    sound.unlock();
    immersive = Boolean(scene.xrSession || scene.renderer?.xr.getSession());
    if (!immersive) return;
    leavePhone();
    desktopPose = { pos: clone(camera.object3D.position), direction: scene.camera.getWorldDirection(new THREE.Vector3()) };
    lastHead = null;
    lastMenuAction = -Infinity;
    snapHeld = false;
    document.body.classList.add('immersive');
    menu.show();
    scenery.setImmersive(true);
    avatar.setImmersive(true);
    controllerButtons = nativeControllerButtons(scene.xrSession ?? scene.renderer.xr.getSession());
    if (phase === 'intro') show('Preciso arrumar uma namorada. Deixa eu ver o que tem no meu celular.', 9);
    else show('Perto: segure com a pinça ou o botão lateral. Longe: aponte e use a pinça ou o gatilho.', 8);
    scene.renderer.shadowMap.enabled = true;
    rig.object3D.position.set(0, 0, .15);
    if (date.active()) pendingSeat = true;
  });
  scene.addEventListener('exit-vr', () => {
    immersive = false;
    scenery.setImmersive(false);
    avatar.setImmersive(false);
    menu.resetGaze();
    controllerButtons?.dispose();
    controllerButtons = null;
    xrConnections.clear();
    trackedHands.clear();
    handVisibility.clear();
    for (const side of ['left','right']) {
      const control = controls[side];
      handPose.resetPinch(side);
      control.avatarPose = control.lastPose = null;
      control.line.visible = control.marker.visible = false;
      control.landing = control.action = null;
      control.buttons = [false, false];
      control.voiceHeld = control.gestureHeld = control.menuHeld = control.handSelect = false;
      control.stick.set(0,0);
    }
    date.voice()?.cancel();
    if (date.active()) for (const id of ['left', 'right', 'controller-left', 'controller-right']) date.active().release(id);
    document.body.classList.remove('immersive');
    captions.draw('', false);
    rig.object3D.position.set(0, 0, 0);
    rig.object3D.rotation.set(0, 0, 0);
    for (const id of [...scenePhysics.hand.keys()]) finish(id, false, false);
    for (const id of phoneRays.keys()) phone.release(id, { inside: false }, false);
    phoneRays.clear();
    phoneTips.clear();
    phone.clearGuide();
    for (const id of handPokes.keys()) phone.release(id, { inside: false }, false);
    handPokes.clear();
    phone.cancelSpeech();
    if (date.active()) date.recenter();
    else if (desktopPose) {
      locateDesktop(desktopPose.pos, desktopPose.direction);
      desktopLast.copy(desktopPose.pos);
    }
  });
  readButton.addEventListener('click', readPhone);
  document.getElementById('changeTime').addEventListener('click', phone.cycleWindow);
  window.addEventListener('keydown', event => {
    if (event.defaultPrevented) return;
    const handKey = { KeyA: 'left', KeyD: 'right' }[event.code];
    const cutKey = { KeyW: 'up', KeyS: 'down', ArrowUp: 'up', ArrowDown: 'down',
      ArrowLeft: 'left', ArrowRight: 'right' }[event.code];
    if (handKey) danceHands[handKey] = true;
    if (cutKey) danceCuts[cutKey] = true;
    if (date.active() && ['KeyA','ArrowLeft','KeyD','ArrowRight','KeyW','ArrowUp','KeyS','ArrowDown'].includes(event.code)) {
      if (['KeyA','ArrowLeft'].includes(event.code)) skillKeys.left = true;
      else if (['KeyD','ArrowRight'].includes(event.code)) skillKeys.right = true;
      else if (['KeyW','ArrowUp'].includes(event.code)) skillKeys.up = true;
      else skillKeys.down = true;
    }
    if (event.repeat) return;
    if (date.active()) {
      if (['PageUp', 'PageDown'].includes(event.code) &&
          date.active().turnMenuPage(event.code === 'PageDown' ? 1 : -1)) event.preventDefault();
      if (date.getView()?.qte && ['Digit1','Digit2','Digit3'].includes(event.code)) {
        const choice = date.getView().choices[Number(event.code.at(-1)) - 1];
        if (choice) date.voice().choose(choice.id);
      }
      if (event.code === 'Escape' && date.active().isInteracting()) date.active().cancelInteraction();
      if (event.code === 'Enter') date.active().skillConfirm();
      if (event.code === 'KeyH') date.active().skillHelp();
      if (date.active().dancePlaying?.() && (handKey || cutKey)) {
        const side = danceHands.left ? 'left' : danceHands.right ? 'right' : null;
        const cut = cutKey ?? (danceCuts.up ? 'up' : danceCuts.down ? 'down' :
          danceCuts.left ? 'left' : danceCuts.right ? 'right' : null);
        if (side && cut) date.active().skillInput(side, cut);
      }
      if (event.code === 'KeyR') date.recenter();
      if (event.code === 'KeyV' && !date.active().isInteracting()) date.voice().toggle();
      if (event.code === 'KeyG' && !date.active().isInteracting()) date.voice().choose('middle_finger');
      if (event.code === 'KeyT') date.active().replaySpeech();
      return;
    }
    if (readFrom && ['Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
      leavePhone();
    }
    if (event.code === 'KeyE' && !immersive && dispensed?.held === 'mouse') eatCandy();
    if (event.code === 'KeyN') phone.cycleWindow();
    if (event.code === 'KeyL') propEvent('fan');
    if (event.code === 'KeyM') toggleMonitor();
    if (event.code === 'KeyR') scenePhysics.recover(scenePhysics.props.get(data.phone.id));
    if (event.code === 'KeyQ') readPhone();
  });
  window.addEventListener('keyup', event => {
    const handKey = { KeyA: 'left', KeyD: 'right' }[event.code];
    const cutKey = { KeyW: 'up', KeyS: 'down', ArrowUp: 'up', ArrowDown: 'down',
      ArrowLeft: 'left', ArrowRight: 'right' }[event.code];
    if (handKey) danceHands[handKey] = false;
    if (cutKey) danceCuts[cutKey] = false;
    if (['KeyA','ArrowLeft'].includes(event.code)) skillKeys.left = false;
    if (['KeyD','ArrowRight'].includes(event.code)) skillKeys.right = false;
    if (['KeyW','ArrowUp'].includes(event.code)) skillKeys.up = false;
    if (['KeyS','ArrowDown'].includes(event.code)) skillKeys.down = false;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      date.active()?.cancelInteraction();
      date.voice()?.cancel();
      phone.cancelSpeech();
      leavePhone();
      for (const id of [...scenePhysics.hand.keys()]) finish(id, false, false);
    }
  });
  if (scene.canvas) wireDesktop();
  else scene.addEventListener('render-target-loaded', wireDesktop, { once: true });
  locateDesktop(new THREE.Vector3(...data.start), new THREE.Vector3(...data.forward));
  let lastPlace;
  date = createDateCoordinator(THREE, {
    camera: camera.object3D, load: loaderModels, bedroomNode: node,
    bedroomMaterial: prefix => [...prepared].find(material => material.name.startsWith(prefix) && material.map), show, announce: venueSound,
    reset: phone.reset, reducedEffects: () => requestedReduced,
    onGesture() { middleFingerUntil = elapsed + 1.25; },
    isVr() { return immersive; },
    viewerPosition() { return viewer().getWorldPosition(new THREE.Vector3()); },
    viewerDirection() { return new THREE.Vector3(0, 0, -1).applyQuaternion(viewer().getWorldQuaternion(new THREE.Quaternion())); },
    change(stage) {
      setDefaultFill(Boolean(stage) || scenery.time !== 2);
      if (stage) {
        leavePhone();
        for (const id of [...scenePhysics.hand.keys()]) scenePhysics.release(id, false);
        for (const id of phoneRays.keys()) phone.release(id, { inside: false }, false);
        for (const id of handPokes.keys()) phone.release(id, { inside: false }, false);
        phoneRays.clear();
        phoneTips.clear();
        phone.clearGuide();
        inputs.clear();
        handPokes.clear();
        previous.clear();
        dateKeys.clear();
        phone.cancelSpeech();
        lastPlace = { camera: clone(camera.object3D.position), rig: clone(rig.object3D.position),
          rotation: rig.object3D.rotation.clone(), shadow: scene.renderer.shadowMap.enabled, forward: scene.camera.getWorldDirection(new THREE.Vector3()) };
        root.visible = false;
        if (new URLSearchParams(location.search).has('venueMetrics')) {
          venueMetrics = createVenueMetrics(scene.renderer);
          window.firstDateMetrics = venueMetrics.report;
        }
        scene.renderer.shadowMap.enabled = true;
        roomControls.hidden = true;
        roomControls.style.display = 'none';
        show('', 0);
        camera.components['wasd-controls']?.pause();
        scene.object3D.add(stage);
      } else {
        root.visible = true;
        venueMetrics = null;
        if (!immersive) scene.renderer.shadowMap.enabled = lastPlace.shadow;
        roomControls.hidden = false;
        roomControls.style.display = '';
        camera.components['wasd-controls']?.play();
        rig.object3D.position.copy(lastPlace.rig);
        rig.object3D.rotation.copy(lastPlace.rotation);
        locateDesktop(lastPlace.camera, lastPlace.forward);
        desktopLast.copy(lastPlace.camera);
        lastHead = null;
      }
      sound.setRoomActive(!stage);
      document.body.classList.toggle('first-date', Boolean(stage));
    },
    seat(position, height) {
      if (!immersive) {
        locateDesktop(position.clone().setY(height), new THREE.Vector3(0, height < 1 ? -.21 : -.10, -1).normalize());
        return;
      }
      const head = viewer();
      const rigObject = rig.object3D;
      const headLocal = rigObject.worldToLocal(head.getWorldPosition(new THREE.Vector3()));
      const forward = head.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      if (forward.lengthSq() > .01) rigObject.rotateY(Math.atan2(forward.x, -forward.z));
      // Tracking remains native. Calibrate the parent rig around the viewer.
      const goal = position.clone().setY(height);
      rigObject.position.add(goal.sub(rigObject.localToWorld(headLocal)));
    }
  });
  updateStory(phone.getState());
  menu.show();
  menu.follow(viewer(), false);
  if (phone.getState().phase === 'intro') show('Preciso arrumar uma namorada. Deixa eu ver o que tem no meu celular.', 9);
  return { tick, phone, scenery, scenePhysics, root, node, date, avatar, menu, benchmark };
}

function makeCaption(THREE, camera) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const caption = new THREE.Mesh(new THREE.PlaneGeometry(1.02, .153), new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false
  }));
  caption.position.set(0, -.35, -1.25);
  caption.renderOrder = 33;
  caption.visible = false;
  camera.add(caption);
  return {
    draw(text, visible) {
      caption.visible = Boolean(visible && text);
      if (!caption.visible) return;
      ctx.clearRect(0, 0, 1200, 180);
      ctx.fillStyle = '#211628df';
      ctx.beginPath();
      ctx.roundRect(16, 18, 1168, 152, 25);
      ctx.fill();
      ctx.fillStyle = '#fff4ea';
      ctx.font = '600 35px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      let line = '', y = 60;
      for (const word of text.split(' ')) {
        const token = line + ' ' + word;
        if (ctx.measureText(token).width >= 1050) { ctx.fillText(line, 600, y); line = word; y += 49; }
        else line = token;
      }
      if (line) ctx.fillText(line, 600, y === 60 ? 92 : y);
      texture.needsUpdate = true;
    }
  };
}

function echoRoomSound(context, source, amount) {
  if (!amount) return;
  const delay = context.createDelay(.25);
  const echo = context.createGain();
  delay.delayTime.value = .125;
  echo.gain.value = amount;
  source.connect(delay).connect(echo).connect(context.destination);
  setTimeout(() => { delay.disconnect(); echo.disconnect(); }, 670);
}

function makeBedroomSound() {
  let context, roomGain, hallGain, noise;
  let roomActive = true, inCorridor = false, echo = 0;

  function noiseSource() {
    if (!noise) {
      noise = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    const source = context.createBufferSource();
    source.buffer = noise;
    return source;
  }

  function setRoomActive(active) {
    roomActive = active;
    mixAmbience();
  }

  function setCorridor(active) {
    if (inCorridor === active) return;
    inCorridor = active;
    mixAmbience();
  }

  function mixAmbience() {
    if (!roomGain) return;
    roomGain.gain.setTargetAtTime(roomActive && !inCorridor ? .075 : 0, context.currentTime, .28);
    hallGain.gain.setTargetAtTime(roomActive && inCorridor ? .024 : 0, context.currentTime, .44);
  }

  function startRoom() {
    const air = noiseSource();
    air.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 310;
    roomGain = context.createGain();
    roomGain.gain.value = 0;
    hallGain = context.createGain();
    hallGain.gain.value = 0;
    const low = context.createBiquadFilter();
    low.type = 'bandpass';
    low.frequency.value = 86;
    low.Q.value = 2.6;
    const drone = context.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 57.5;
    const overtones = context.createOscillator();
    overtones.type = 'triangle';
    overtones.frequency.value = 63.4;
    const droneLevel = context.createGain();
    droneLevel.gain.value = .43;
    drone.connect(droneLevel);
    overtones.connect(droneLevel);
    droneLevel.connect(hallGain);
    air.connect(low).connect(hallGain).connect(context.destination);
    drone.start();
    overtones.start();
    mixAmbience();
    air.connect(filter).connect(roomGain).connect(context.destination);
    air.start();
  }
  return {
    unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!context) {
        context = new Audio();
        startRoom();
      }
      if (context.state === 'suspended') context.resume().catch(() => {});
    },
    setRoomActive, setCorridor, setEcho(value) { echo = value; },
    latch(offset) {
      if (context?.state !== 'running') return;
      const now = context.currentTime;
      const distance = offset.length();
      const pan = context.createStereoPanner();
      pan.pan.value = THREE.MathUtils.clamp(offset.x / Math.max(.1, distance), -.8, .8);
      const volume = .32 / (1 + distance * .68);
      pan.connect(context.destination);
      const noise = noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = .8;
      const snap = context.createGain();
      snap.gain.setValueAtTime(volume, now);
      snap.gain.exponentialRampToValueAtTime(.001, now + .065);
      noise.connect(filter).connect(snap).connect(pan);
      noise.start(now);
      noise.stop(now + .07);
      const lever = context.createOscillator();
      const tail = context.createGain();
      lever.type = 'triangle';
      lever.frequency.setValueAtTime(195, now + .018);
      lever.frequency.exponentialRampToValueAtTime(95, now + .10);
      tail.gain.setValueAtTime(volume * .28, now + .018);
      tail.gain.exponentialRampToValueAtTime(.001, now + .10);
      lever.connect(tail).connect(pan);
      lever.start(now + .018);
      lever.stop(now + .11);
      lever.onended = () => { noise.disconnect(); filter.disconnect(); snap.disconnect(); lever.disconnect(); tail.disconnect(); pan.disconnect(); };
    },
    creatureSting(reduced) {
      if (context?.state !== 'running') return;
      const now = context.currentTime;
      const bus = context.createGain();
      bus.gain.value = reduced ? .32 : .68;
      bus.connect(context.destination);
      for (const [index, note] of [65.41, 69.30, 138.59].entries()) {
        const start = now + index * .002;
        [1, 2.008, 3.028, 4.09, 6.18].forEach((partial, overtone) => {
          const string = context.createOscillator();
          const envelope = context.createGain();
          const length = .33 - overtone * .044;
          string.frequency.value = note * partial;
          envelope.gain.setValueAtTime(.0001, start);
          envelope.gain.exponentialRampToValueAtTime(.08 / (1 + overtone * 2.8), start + .006);
          envelope.gain.exponentialRampToValueAtTime(.0001, start + length);
          string.connect(envelope).connect(bus);
          string.start(start);
          string.stop(start + length);
          string.onended = () => { string.disconnect(); envelope.disconnect(); };
        });
      }
      setTimeout(() => bus.disconnect(), 450);
    },
    shatter(offset, impact) {
      if (context?.state !== 'running') return;
      const distance = offset.length();
      const speaker = context.createStereoPanner();
      speaker.pan.value = THREE.MathUtils.clamp(offset.x / Math.max(.1, distance), -1, 1);
      const volume = Math.min(.32, .09 + impact * .026) / (1 + distance * .45);
      speaker.connect(context.destination);

      const crack = noiseSource();
      const filter = context.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 1550;
      const attack = context.createGain();
      const now = context.currentTime;
      attack.gain.setValueAtTime(volume, now);
      attack.gain.exponentialRampToValueAtTime(.001, now + .12);
      crack.connect(filter).connect(attack).connect(speaker);
      crack.start(now);
      crack.stop(now + .13);

      for (const [delay, pitch, level] of [[.012, 1130, .58], [.048, 1810, .42], [.106, 1480, .31], [.172, 2550, .2]]) {
        const start = now + delay;
        const shard = context.createOscillator();
        const ring = context.createGain();
        shard.type = 'triangle';
        shard.frequency.value = pitch;
        ring.gain.setValueAtTime(volume * level, start);
        ring.gain.exponentialRampToValueAtTime(.001, start + .11);
        shard.connect(ring).connect(speaker);
        shard.start(start);
        shard.stop(start + .12);
        shard.onended = () => { shard.disconnect(); ring.disconnect(); };
      }
      setTimeout(() => { crack.disconnect(); filter.disconnect(); attack.disconnect(); speaker.disconnect(); }, 340);
    },
    croak(pan) {
      if (context?.state !== 'running') return;
      const now = context.currentTime;
      const speaker = context.createStereoPanner();
      speaker.pan.value = THREE.MathUtils.clamp(pan, -.85, .85);
      const throat = context.createBiquadFilter();
      throat.type = 'lowpass';
      throat.frequency.value = 690;
      throat.Q.value = .85;
      throat.connect(speaker).connect(context.destination);
      for (const [offset, duration, pitch, volume] of [[0, .15, 146, .19], [.13, .22, 113, .24]]) {
        const start = now + offset;
        const voice = context.createOscillator();
        voice.type = 'sawtooth';
        voice.frequency.setValueAtTime(pitch, start);
        voice.frequency.linearRampToValueAtTime(pitch * 1.22, start + .045);
        voice.frequency.exponentialRampToValueAtTime(68, start + duration);
        const pulse = context.createGain();
        pulse.gain.setValueAtTime(.001, start);
        pulse.gain.linearRampToValueAtTime(volume, start + .023);
        pulse.gain.linearRampToValueAtTime(volume * .24, start + duration * .62);
        pulse.gain.exponentialRampToValueAtTime(.001, start + duration);
        voice.connect(pulse).connect(throat);
        voice.start(start);
        voice.stop(start + duration + .005);
        voice.onended = () => { voice.disconnect(); pulse.disconnect(); };
      }
      setTimeout(() => { throat.disconnect(); speaker.disconnect(); }, 500);
    },
    play(match, volume) {
      if (context?.state !== 'running') return;
      const now = context.currentTime;
      const gain = context.createGain();
      const tone = context.createOscillator();
      const length = match ? .31 : .14;
      tone.frequency.setValueAtTime(match ? 523.25 : 114, now);
      if (match) tone.frequency.setValueAtTime(783.99, now + .12);
      else tone.frequency.exponentialRampToValueAtTime(42, now + length);
      gain.gain.setValueAtTime(.001, now);
      gain.gain.linearRampToValueAtTime(volume, now + .014);
      gain.gain.exponentialRampToValueAtTime(.001, now + length);
      tone.connect(gain).connect(context.destination);
      echoRoomSound(context, gain, echo);
      tone.start(now);
      tone.stop(now + length);
    }
  };
}
