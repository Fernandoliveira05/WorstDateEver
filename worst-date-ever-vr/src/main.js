import { controllerSpaces, nativeControllerButtons, pointRay, sampleSpace, trackedObjectPose } from './xr-input.js';
import { wireVrEntry } from './vr-entry.js';
import AFRAME from 'aframe';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createHandVisibility, getHandPosePipeline, HAND_TRACKING_GRACE } from './hand-pose.mjs';
import { createBedroomPhysics } from './bedroom-physics.js';
import { createPhone } from './bedroom-phone.js';
import { createScenery } from './bedroom-scenery.js';
import { createAvatar } from './bedroom-avatar.js';
import { trackedHandBasis } from './avatar-hands.js';
import { phoneGrip } from './grip-pose.mjs';
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
      this.bedroom = setup(scene, model.scene, metadata);
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

function setup(scene, root, data) {
  const room = document.getElementById('room');
  const camera = document.getElementById('camera');
  const rig = document.getElementById('rig');
  const loaderModels = path => loader.loadAsync(assets(path));
  const named = new Map();
  const handPokes = new Map();
  const controllerTouches = new Map();
  const trackedHands = new Map();
  const handVisibility = createHandVisibility();
  const controls = {};
  const inputs = new Map();
  const previous = new Map();
  const pickable = [];
  const curtainMeshes = [];
  const narrator = document.getElementById('narrator');
  const sound = makePhoneSound();
  document.addEventListener('pointerdown', sound.unlock, { once: true, capture: true });
  let lastImpact = -Infinity;
  const look = camera.components['look-controls'];
  let narrationUntil = 0;
  let elapsed = 0;
  let immersive = false;
  let desktopGesture;
  let phase;
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
    if (immersive && reference && scene.frame) {
      try { pose = scene.frame.getViewerPose(reference); } catch { /* A controller callback can run between XR frames. */ }
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

  const scenePhysics = createBedroomPhysics(THREE, root, data, node, propEvent,
    () => viewer().getWorldPosition(new THREE.Vector3()));
  for (const prop of scenePhysics.props.values()) pickable.push(prop.object);
  pickable.push(scenePhysics.doorObject);

  const scenery = createScenery(THREE, root, data, node, loaderModels);
  const avatar = createAvatar(THREE, scene.object3D, loaderModels);
  const phone = createPhone(THREE, node(data.phone.id), data.phone, assets, updateStory);
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

  function propEvent(kind, value) {
    if (kind === 'lamp') scenery.toggleLamp();
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
    if (kind === 'door') {
      show('Parece que chegou a hora.');
      phone.depart();
    }
    if (kind === 'outfit') {
      phone.appearance(value);
      show(['Camiseta.','Jaqueta.','Traje social.'][value] + ' Parece que tenho a vida em ordem.');
    }
    if (kind === 'break') show('Isso ficou bem pior do que eu esperava.');
  }

  function updateStory(state, reply, retry = false) {
    if (state.phase === 'exit' && (phase !== state.phase || retry)) void date?.start(state);
    else if (state.phase !== 'exit') date?.cancelStart();
    const byStory = ['wait', 'prep', 'exit', 'aftermath'].includes(state.phase) ? 2 : 0;
    scenery.setTime(state.windowTime ?? byStory, Boolean(state.reducedIntensity));
    scenery.setAftermath(state.phase === 'aftermath');
    avatar.activate(state.avatarGender, state.appearance || 0);
    if (reply) show(reply);
    if (state.phase !== phase) {
      if (state.phase === 'match') {
        show('Deu match! Agora começa a parte difícil.');
        sound.play(true, .19);
      }
      if (state.phase === 'wait') show('Já escureceu. Tá quase na hora.');
      if (state.phase === 'exit') show('O encontro espera.');
      if (state.phase === 'aftermath') show('A noite saiu do plano.');
      phase = state.phase;
    }
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
  }

  function leavePhone() {
    if (!readFrom) return;
    const { position, direction } = readFrom;
    readFrom = null;
    locateDesktop(position, direction);
    desktopLast.copy(position);
    readButton.textContent = 'Ler celular';
    readButton.setAttribute('aria-pressed', 'false');
  }

  function readPhone() {
    sound.unlock();
    if (immersive) return;
    if (readFrom) { leavePhone(); return; }
    readFrom = {
      position: camera.object3D.position.clone(),
      direction: scene.camera.getWorldDirection(new THREE.Vector3())
    };
    readButton.textContent = 'Voltar ao quarto';
    readButton.setAttribute('aria-pressed', 'true');
    const face = new THREE.Vector3(0, 0, 1);
    const at = phone.screen.getWorldPosition(new THREE.Vector3());
    const normal = face.applyQuaternion(phone.screen.getWorldQuaternion(new THREE.Quaternion()));
    const near = at.clone().addScaledVector(normal, .40);
    locateDesktop(near, at.sub(near).normalize());
  }

  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane();
  function pointOnScreen() {
    const at = phone.screen.getWorldPosition(new THREE.Vector3());
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(phone.screen.getWorldQuaternion(new THREE.Quaternion()));
    plane.setFromNormalAndCoplanarPoint(normal, at);
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    return hit && phone.position(hit);
  }

  function targets(max) {
    ray.far = max;
    return ray.intersectObjects(pickable, true).filter(hit => {
      for (let item = hit.object; item; item = item.parent) if (!item.visible) return false;
      return hit.object.userData.screen || hit.object.userData.curtain || hit.object.userData.monitor ||
        hit.object.userData.prop?.active || hasParent(hit.object, scenePhysics.doorObject);
    });
  }

  function hasParent(object, parent) {
    for (; object; object = object.parent) if (object === parent) return true;
    return false;
  }

  function pressAt(id, isGrab, orientation) {
    sound.unlock();
    const venue = date?.active();
    if (venue) return venue.press(id, ray, orientation, null, isGrab);
    const hit = targets(4.7)[0];
    if (!hit) return false;
    const { prop, screen, curtain, monitor } = hit.object.userData;
    if (screen && !isGrab) {
      if (!phone.press(id, phone.position(hit.point))) return false;
      controllerTouches.set(id, true);
      return true;
    }
    if (curtain) { disturb(hit.point, Math.sign(ray.ray.direction.z) * .28); return true; }
    if (monitor && !isGrab) { toggleMonitor(); return true; }
    if (prop?.pull && !isGrab) { scenePhysics.click(prop); return true; }
    if (prop) {
      const distance = Math.max(.26, Math.min(1.65, hit.distance));
      const grabPoint = ray.ray.at(distance, new THREE.Vector3());
      if (scenePhysics.grab(id, grabPoint, orientation, scenePhysics.gripAt(prop, hit.point))) {
        inputs.set(id, { distance });
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
    ray.setFromCamera(pointer, view);
    return view.getWorldQuaternion(new THREE.Quaternion());
  }

  function finish(id, useRay, commit = true) {
    if (date?.active()) { date.active().release(id, commit); return; }
    if (controllerTouches.delete(id)) phone.release(id, useRay ? pointOnScreen() ?? { inside: false, x: -1000, y: 0 } : { inside: false, x: 0, y: 0 }, commit);
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
      const id = 'mouse';
      const orientation = setDesktopRay(event);
      const grabbed = pressAt(id, event.button === 2, orientation) ||
        (event.button === 2 && date?.active()?.beginSwipe(id, ray));
      if (!grabbed) return;
      desktopGesture = event.pointerId;
      canvas.setPointerCapture(event.pointerId);
      if (look) look.mouseDown = false;
    });
    canvas.addEventListener('pointermove', event => {
      const orientation = setDesktopRay(event);
      date?.active()?.focus(ray);
      if (desktopGesture !== event.pointerId) return;
      if (date?.active()) { date.active().move('mouse', ray, orientation); return; }
      const held = inputs.get('mouse');
      if (held) scenePhysics.updateGrab('mouse', ray.ray.at(held.distance, new THREE.Vector3()), orientation);
      const at = pointOnScreen();
      if (at) phone.drag('mouse', at);
    });
    canvas.addEventListener('pointerup', event => {
      if (desktopGesture !== event.pointerId) return;
      setDesktopRay(event);
      finish('mouse', true);
      desktopGesture = undefined;
    });
    canvas.addEventListener('pointercancel', event => {
      if (desktopGesture !== event.pointerId) return;
      finish('mouse', false, false);
      desktopGesture = undefined;
    });
  }

  const floor = new THREE.Plane(up, 0);
  const xrVisuals = new THREE.Group();
  scene.object3D.add(xrVisuals);
  const pointerGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0,0,-.035), new THREE.Vector3(0,0,-1)
  ]);
  for (const side of ['left', 'right']) {
    const line = new THREE.Line(pointerGeometry,
      new THREE.LineBasicMaterial({ color: 0xefbae7, transparent: true, opacity: .48, depthWrite: false }));
    const marker = new THREE.Mesh(new THREE.RingGeometry(.073, .082, 32),
      new THREE.MeshBasicMaterial({ color: 0xefbae7, side: THREE.DoubleSide }));
    marker.rotateX(-Math.PI / 2);
    xrVisuals.add(line, marker);
    line.visible = marker.visible = false;
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
  }

  function controllerInput(side, venue) {
    const control = controls[side];
    const id = 'controller-' + side;
    const connection = xrConnections.get(side);
    const source = Array.from(scene.frame?.session?.inputSources ?? scene.xrSession?.inputSources ?? []).find(item =>
      item.handedness === side && !item.hand && item.targetRayMode !== 'gaze' && (item.gripSpace || item.targetRaySpace)) ?? connection?.source;
    const tracked = connection?.source === source && connection ? {
      pointer: trackedObjectPose(THREE, connection.pointer), grip: trackedObjectPose(THREE, connection.grip)
    } : undefined;
    const sampled = controllerSpaces(THREE, scene, rig.object3D, source, side, tracked);
    if (source !== control.source) control.lastPose = null;
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
    control.avatarPose = grip ? { position: grip.position, orientation: grip.orientation, trigger, squeeze } : null;
    if (!aim || !grip) {
      displayRay(control, null);
      if (control.action != null) finish(id, false, false);
      venue?.handContact(id, null);
      control.action = null;
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
    displayRay(control, aim, 2.2);
    const events = controllerButtons?.read(source) ?? [false,false];
    const pressed = [trigger > .55 || events[0], squeeze > .55 || events[1]];
    const previous = control.buttons ?? [false, false];
    if (control.action !== null && control.action !== undefined && !pressed[control.action]) {
      finish(id, control.action === 0);
      control.action = null;
    }
    if (control.action == null) {
      let grabbed;
      if (pressed[1] && !previous[1]) {
        if (venue) grabbed = venue.press(id, ray, grip.orientation, grip.position, true);
        else if (scenePhysics.grab(id, grip.position, grip.orientation, scenePhysics.nearest(grip.position, .075))) {
          inputs.set(id, { distance: 0 });
          grabbed = true;
        } else grabbed = pressAt(id, true, grip.orientation);
        if (grabbed) control.action = 1;
      } else if (pressed[0] && !previous[0] && pressAt(id, false, grip.orientation)) control.action = 0;
    }
    control.buttons = pressed;
    if (venue) {
      venue.move(id, ray, grip.orientation, grip.position);
      venue.handContact(id, grip.position.clone().addScaledVector(ray.ray.direction, .065));
    }
    else {
      const hold = inputs.get(id);
      if (hold) scenePhysics.updateGrab(id, hold.distance ? ray.ray.at(hold.distance, new THREE.Vector3()) :
        grip.position, grip.orientation);
      if (controllerTouches.has(id)) {
        const at = pointOnScreen();
        if (at) phone.drag(id, at);
      }
    }
    if (side === 'right' && venue) {
      const held = Boolean(gamepad?.buttons[4]?.pressed);
      if (held && !control.voiceHeld) date.voice().toggle();
      control.voiceHeld = held;
      const gestureHeld = Boolean(gamepad?.buttons[5]?.pressed);
      if (gestureHeld && !control.gestureHeld) {
        middleFingerUntil = elapsed + 1.25;
        date.voice().choose('middle_finger');
      }
      control.gestureHeld = gestureHeld;
    }
    return grip.position;
  }

  function handAim(hand, control) {
    const aim = sampleSpace(THREE, scene, rig.object3D, hand.source?.targetRaySpace);
    if (!aim) return false;
    pointRay(THREE, ray, aim);
    ray.far = 4.7;
    const hit = targets(4.7)[0];
    const landing = !hit && ray.ray.direction.y < -.18 && ray.ray.intersectPlane(floor, new THREE.Vector3());
    const spot = landing && reachableFloor(landing);
    control.marker.visible = Boolean(spot);
    if (spot) control.marker.position.copy(spot).setY(.013);
    displayRay(control, aim, hit?.distance ?? (spot ? aim.position.distanceTo(spot) : .72));
    return { aim, spot };
  }

  function reachableFloor(landing) {
    const head = viewer().getWorldPosition(new THREE.Vector3());
    if (Math.abs(landing.x) > 2.2 || landing.z < -1.71 || landing.z > 3.1 ||
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

  function handInteractions() {
    handPose.update();
    const grips = {};
    for (const side of ['left', 'right']) {
      const webHand = handPose.getHand(side);
      const control = controls[side];
      control.marker.visible = false;
      grips[side] = controllerInput(side);
      if (!webHand.active) {
        const seen = trackedHands.get(side);
        if (seen !== undefined && elapsed - seen > HAND_TRACKING_GRACE) {
          if (inputs.has(side) || controllerTouches.has(side)) finish(side, false, false);
          scenePhysics.release(side, false);
          control.landing = null;
          if (handPokes.has(side)) phone.release(side, handPokes.get(side), false);
          handPokes.delete(side);
          trackedHands.delete(side);
          handPose.resetPinch(side);
          previous.delete(side);
        }
        continue;
      }
      trackedHands.set(side, elapsed);
      const { wristWorld, pinchPosition, indexTipWorld, wristPosition } = webHand;
      grips[side] = wristPosition;
      const orientation = new THREE.Quaternion().setFromRotationMatrix(wristWorld);
      control.avatarPose = { position: wristPosition, orientation, tracked: webHand };
      const at = phone.position(indexTipWorld);
      const aiming = handAim(webHand, control);
      if (webHand.justPinched && !handPokes.has(side) && !scenePhysics.hand.has(side) &&
        !controllerTouches.has(side) && !inputs.has(side)) {
        const nearScreen = at.inside && Math.abs(at.z) < .026;
        if (nearScreen && phone.press(side, at)) handPokes.set(side, at);
        else if (!scenePhysics.grab(side, pinchPosition, orientation, scenePhysics.nearest(pinchPosition, .051)) && aiming) {
          if (!pressAt(side, false, orientation) && aiming.spot) control.landing = aiming.spot;
        }
      }
      if (webHand.pinched) {
        if (handPokes.has(side)) {
          phone.drag(side, at);
          handPokes.set(side, at);
        }
        const hold = inputs.get(side);
        const goal = hold?.distance && aiming ? ray.ray.at(hold.distance, new THREE.Vector3()) : pinchPosition;
        scenePhysics.updateGrab(side, goal, orientation);
        if (controllerTouches.has(side) && aiming) {
          const hit = pointOnScreen();
          if (hit) phone.drag(side, hit);
        }
      } else if (webHand.justReleased) {
        if (handPokes.has(side)) {
          phone.release(side, handPokes.get(side), true);
          handPokes.delete(side);
        }
        finish(side, Boolean(aiming));
        if (control.landing) {
          stepToFloor(control.landing);
          control.landing = null;
        }
      }
      const was = previous.get(side);
      if (!webHand.pinched && !scenePhysics.hand.has(side)) {
        if (handPokes.has(side)) {
          if (at.z > .026 || at.z < -.06) {
            phone.release(side, at.z > .026 ? { ...at, ...handPokes.get(side) } : at, at.z > .026);
            handPokes.delete(side);
          } else {
            phone.drag(side, at);
            handPokes.set(side, at);
          }
        } else if (at.inside && was && at.z <= .012 && at.z > -.024 && was.screen.z > .012) {
          if (phone.press(side, at)) handPokes.set(side, at);
        }
        if (was) {
          const movement = indexTipWorld.distanceTo(was.point);
          const monitorDepth = monitorContact(indexTipWorld);
          if (monitorDepth !== null && monitorDepth < .018 && monitorDepth > -.025) {
            const previousDepth = monitorContact(was.point);
            if (previousDepth !== null && previousDepth <= -.027 && elapsed - lastMonitorTouch > .32) {
              toggleMonitor();
              lastMonitorTouch = elapsed;
            }
          }
          if (movement > .004) {
            const depthChange = indexTipWorld.z - was.point.z;
            disturb(indexTipWorld, THREE.MathUtils.clamp(depthChange * 3.2, -.11, .11));
            scenePhysics.pushDoor(indexTipWorld, was.point);
          }
        }
      }
      previous.set(side, { point: clone(indexTipWorld), screen: at });
    }
    return grips;
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
    scenePhysics.movePlayer(end, height, true);
  }

  function seatedInput(stage) {
    handPose.update();
    for (const side of ['left', 'right']) {
      controllerInput(side, stage);
      const hand = handPose.getHand(side);
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
      displayRay(control, aim, 1.4);
      if (hand.justPinched && !dateKeys.has(side))
        stage.press(side, ray, rotation, hand.pinchPosition, false);
      if (hand.pinched) stage.move(side, ray, rotation, hand.pinchPosition);
      else {
        stage.release(side);
        if (!dateKeys.has(side) && stage.poke(hand.indexTipWorld)) dateKeys.add(side);
        else if (dateKeys.has(side) && !stage.pokeNear(hand.indexTipWorld)) dateKeys.delete(side);
      }
      stage.handContact(side, hand.pinched ? null : hand.wristPosition.clone().lerp(hand.indexTipWorld, .43));
    }
  }

  function venueSound(kind, from) {
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
      const now = context.currentTime;
      const chime = kind === 'entrance';
      const level = kind === 'ambience' || kind === 'step' ? .028 : .09;
      pan.pan.value = THREE.MathUtils.clamp(offset.x / Math.max(offset.length(), .1), -1, 1);
      oscillator.type = kind === 'ambience' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(chime ? 780 : kind === 'ambience' ? 190 : kind === 'step' ? 96 : 490, now);
      oscillator.frequency.exponentialRampToValueAtTime(chime ? 520 : 135, now + .2);
      gain.gain.setValueAtTime(.001, now);
      gain.gain.exponentialRampToValueAtTime(level / (1 + .15 * offset.length()), now + .03);
      gain.gain.exponentialRampToValueAtTime(.001, now + .23);
      oscillator.connect(gain).connect(pan).connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + .25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); pan.disconnect(); };
    } catch { /* The room is still playable with audio disabled. */ }
  }

  function tick(delta) {
    elapsed += delta;
    date.tick(delta);
    if (date.active()) {
      venueMetrics?.collect(performance.now());
      if (immersive) {
        if (pendingSeat && scene.frame) { pendingSeat = false; date.recenter(); }
        seatedInput(date.active());
        poseAvatar(delta);
      }
      return;
    }
    if (immersive) moveXR(delta);
    else if (!readFrom) {
      const goal = camera.object3D.position;
      const end = walkBedroom(desktopLast, goal, scenePhysics.playerObstacles(), data.start[1]);
      camera.object3D.position.copy(end);
      desktopLast.copy(end);
      scenePhysics.movePlayer(end, data.start[1], true);
    }
    const grips = immersive ? handInteractions() : {};
    applyPhoneGrip();
    scenePhysics.moveHands(grips);
    scenePhysics.tick(delta);
    scenery.tick(delta);
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
      if (hold.prop !== phone) continue;
      if (id === 'mouse') {
        const orientation = viewer().getWorldQuaternion(new THREE.Quaternion());
        scenePhysics.fixGrip(id, hold.point, orientation);
        continue;
      }
      const side = id.endsWith('left') ? 'left' : 'right';
      const pose = controls[side].avatarPose;
      if (!pose) continue;
      const basis = pose.tracked ? trackedHandBasis(THREE, pose.tracked) : pose.orientation;
      if (!basis) continue;
      const fixed = phoneGrip(THREE, pose.position, basis, side);
      scenePhysics.fixGrip(id, fixed.position, fixed.orientation);
    }
  }

  function poseAvatar(delta) {
    const venue = date.active();
    const poses = {};
    for (const side of ['left', 'right']) {
      const pose = handVisibility.pose(side, controls[side].avatarPose, elapsed);
      if (!pose) continue;
      const id = pose.tracked ? side : 'controller-' + side;
      const heldBody = venue ? venue.heldBody(id) : scenePhysics.hand.get(id)?.prop.body;
      poses[side] = { ...pose, heldBody,
        gesture: side === 'right' && elapsed < middleFingerUntil ? 'middle_finger' : null };
    }
    avatar.tick(viewer(), immersive ? poses : {}, delta);
  }

  let desktopPose;
  scene.addEventListener('enter-vr', () => {
    sound.unlock();
    immersive = Boolean(scene.xrSession || scene.renderer?.xr.getSession());
    if (!immersive) return;
    leavePhone();
    desktopPose = { pos: clone(camera.object3D.position), direction: scene.camera.getWorldDirection(new THREE.Vector3()) };
    lastHead = null;
    snapHeld = false;
    document.body.classList.add('immersive');
    scenery.setImmersive(true);
    avatar.setImmersive(true);
    controllerButtons = nativeControllerButtons(scene.xrSession ?? scene.renderer.xr.getSession());
    show('Pinça para pegar ou selecionar. Aponte para o chão e faça uma pinça para se mover.', 7);
    scene.renderer.shadowMap.enabled = true;
    rig.object3D.position.set(0, 0, .15);
    if (date.active()) pendingSeat = true;
  });
  scene.addEventListener('exit-vr', () => {
    immersive = false;
    scenery.setImmersive(false);
    avatar.setImmersive(false);
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
      control.voiceHeld = control.gestureHeld = false;
      control.stick.set(0,0);
    }
    date.voice()?.cancel();
    if (date.active()) for (const id of ['left', 'right', 'controller-left', 'controller-right']) date.active().release(id);
    document.body.classList.remove('immersive');
    captions.draw('', false);
    rig.object3D.position.set(0, 0, 0);
    rig.object3D.rotation.set(0, 0, 0);
    for (const id of [...scenePhysics.hand.keys()]) finish(id, false, false);
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
    if (event.repeat) return;
    if (date.active()) {
      if (event.code === 'KeyR') date.recenter();
      if (event.code === 'KeyV') date.voice().toggle();
      if (event.code === 'KeyG') date.voice().choose('middle_finger');
      if (event.code === 'KeyT') date.active().replaySpeech();
      return;
    }
    if (readFrom && ['Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.code)) {
      leavePhone();
    }
    if (event.code === 'KeyN') phone.cycleWindow();
    if (event.code === 'KeyL') scenery.toggleLamp();
    if (event.code === 'KeyM') toggleMonitor();
    if (event.code === 'KeyR') scenePhysics.recover(scenePhysics.props.get(data.phone.id));
    if (event.code === 'KeyQ') readPhone();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      date.voice()?.cancel();
      phone.cancelSpeech();
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
    reset: phone.reset,
    onGesture() { middleFingerUntil = elapsed + 1.25; },
    viewerPosition() { return viewer().getWorldPosition(new THREE.Vector3()); },
    viewerDirection() { return new THREE.Vector3(0, 0, -1).applyQuaternion(viewer().getWorldQuaternion(new THREE.Quaternion())); },
    change(stage) {
      if (stage) {
        leavePhone();
        for (const id of [...scenePhysics.hand.keys()]) scenePhysics.release(id, false);
        for (const id of controllerTouches.keys()) phone.release(id, { inside: false }, false);
        for (const id of handPokes.keys()) phone.release(id, { inside: false }, false);
        controllerTouches.clear();
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
      document.body.classList.toggle('first-date', Boolean(stage));
    },
    seat(position) {
      if (!immersive) {
        locateDesktop(position.clone().setY(1.43), new THREE.Vector3(0, -.10, -1).normalize());
        return;
      }
      const head = viewer();
      const rigObject = rig.object3D;
      const headLocal = rigObject.worldToLocal(head.getWorldPosition(new THREE.Vector3()));
      const forward = head.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
      if (forward.lengthSq() > .01) rigObject.rotateY(Math.atan2(forward.x, -forward.z));
      // Tracking remains native. Calibrate the parent rig around the viewer.
      const goal = position.clone().setY(1.43);
      rigObject.position.add(goal.sub(rigObject.localToWorld(headLocal)));
    }
  });
  updateStory(phone.getState());
  if (phone.getState().phase !== 'exit') show('Ainda está claro. Já adiei esse encontro duas vezes.', 6);
  return { tick, phone, scenery, scenePhysics, root, node, date, avatar };
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

function makePhoneSound() {
  let context;
  return {
    unlock() {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context ??= new Audio();
      if (context.state === 'suspended') context.resume().catch(() => {});
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
      tone.start(now);
      tone.stop(now + length);
    }
  };
}
