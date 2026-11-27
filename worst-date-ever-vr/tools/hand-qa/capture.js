import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { heldGripPose, phoneGrip } from '../../src/grip-pose.mjs';

const frame = () => new Promise(resolve => setTimeout(resolve, 0));

function copyModel(source) {
  const saved = new Map();
  source.traverse(item => { saved.set(item, item.userData); item.userData = {}; });
  try { return source.clone(true); }
  finally { for (const [item, metadata] of saved) item.userData = metadata; }
}

function snapshotHand(THREE, source) {
  source.updateMatrixWorld(true);
  const index = source.geometry.index;
  const positions = new Float32Array(index.count * 3);
  const uv = source.geometry.getAttribute('uv');
  const texcoords = uv ? new Float32Array(index.count * 2) : null;
  const point = new THREE.Vector3();
  for (let i = 0; i < index.count; i++) {
    const vertex = index.getX(i);
    source.getVertexPosition(vertex, point).applyMatrix4(source.matrixWorld).toArray(positions, i * 3);
    if (uv) {
      texcoords[i * 2] = uv.getX(vertex);
      texcoords[i * 2 + 1] = uv.getY(vertex);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  if (texcoords) geometry.setAttribute('uv', new THREE.BufferAttribute(texcoords, 2));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return new THREE.Mesh(geometry, source.material);
}

async function ready(scene) {
  for (let i = 0; i < 120; i++) {
    const game = scene?.components?.['wde-bedroom']?.bedroom;
    if (game?.benchmark && game.avatar.object.children.length) return game;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('The benchmark and avatar did not load');
}

export async function captureBenchmark(onProgress = () => {}, { statesOnly = false } = {}) {
  const scene = document.querySelector('a-scene');
  const game = await ready(scene);
  const T = AFRAME.THREE;
  const { assetId, id, captureState } = game.benchmark;
  const physics = game.scenePhysics;
  const prop = physics.props.get(id);
  if (prop.cloth) prop.body.userData = { ...prop.body.userData, cloth: true };
  const isPhone = id === 'wde_51';
  game.menu.close();
  game.avatar.setImmersive(true);
  scene.pause();
  scene.renderer.setAnimationLoop(null);

  if (isPhone && !statesOnly) {
    const model = copyModel(prop.object);
    model.position.set(0, 0, 0);
    model.quaternion.identity();
    const file = await new GLTFExporter().parseAsync(model, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    const response = await fetch('/__asset_qa/phone', { method: 'POST', body: file });
    if (!response.ok) throw new Error(await response.text());
  }

  const orthogonal = new T.Quaternion();
  const camera = new T.PerspectiveCamera(39, 1.35, .015, 40);
  const eye = new T.PerspectiveCamera();
  // Wide props can bring a synthetic wrist within the normal headset comfort
  // cutoff. Put the virtual player farther back without changing viewer height.
  const assetSize = new T.Box3().setFromObject(prop.object, true).getSize(new T.Vector3());
  const widePropOffset = isPhone ? 0 : T.MathUtils.clamp(Math.max(assetSize.x, assetSize.z) - .35, 0, .26);
  eye.position.set(0, 1.62, .91 - widePropOffset);
  eye.updateMatrixWorld();
  const pivot = new T.Vector3(-.05, 1.17, 1.31);
  const stagePosition = prop.object.position.clone();
  const stageRotation = prop.object.quaternion.clone();
  const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(496, 368);
  renderer.toneMapping = T.ACESFilmicToneMapping;
  const studio = new T.Scene();
  studio.background = new T.Color(0x35273a);
  studio.add(new T.HemisphereLight(0xffead5, 0x746682, 2));
  const lamp = new T.DirectionalLight(0xffe4c7, 2.6);
  lamp.position.set(1, 3, .1);
  studio.add(lamp);
  const ray = new T.Raycaster();
  const outcomes = { assetId, screenshots: [], untestable: [] };
  const rayHits = new Map();

  function place(position, rotation = orthogonal) {
    prop.body.position.copy(position);
    prop.body.quaternion.copy(rotation);
    prop.body.velocity.setZero();
    prop.body.aabbNeedsUpdate = true;
    prop.object.position.copy(prop.object.parent.worldToLocal(position.clone()));
    prop.object.quaternion.copy(prop.object.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(rotation));
    prop.object.updateWorldMatrix(true, true);
  }

  const getArtBounds = () => new T.Box3().setFromObject(prop.object, true);
  async function save(name, state, side, contact, angle, useRoom = false, secondHand) {
    const meshes = [];
    const joints = {};
    const model = copyModel(prop.object);
    model.matrixAutoUpdate = false;
    model.matrix.copy(prop.object.matrixWorld);
    studio.add(model);
    meshes.push(model);
    if (side && !useRoom) {
      const suffixes = [side, secondHand].filter(Boolean).map(hand => hand === 'left' ? 'L' : 'R');
      game.avatar.object.traverse(node => {
        const jointName = node.name.replace(/_end$/i, '');
        if ((node.isBone || /_end$/i.test(node.name)) && suffixes.some(suffix => jointName.endsWith(suffix)) &&
            /^(Wrist|Thumb|Index|Middle|Ring|Pinky)/.test(node.name)) {
          let shown = true;
          for (let parent = node.parent; parent && parent !== game.avatar.object; parent = parent.parent)
            shown &&= parent.visible;
          if (shown) joints[node.name] = {
            position: node.getWorldPosition(new T.Vector3()).toArray(),
            rotation: node.getWorldQuaternion(new T.Quaternion()).toArray()
          };
        }
        if (!suffixes.some(suffix => node.name === 'First-person hand ' + suffix) || !node.visible) return;
        const mesh = snapshotHand(T, node);
        studio.add(mesh);
        meshes.push(mesh);
      });
    }
    const bounds = getArtBounds();
    const target = bounds.getCenter(new T.Vector3());
    const direction = new T.Vector3(...angle).normalize();
    const handBounds = new T.Box3();
    for (const mesh of meshes.slice(1)) handBounds.union(mesh.geometry.boundingBox);
    const hand = handBounds.isEmpty() ? null : handBounds;
    if (hand && contact && assetId === 'picnic_blanket') {
      target.copy(contact).lerp(hand.getCenter(new T.Vector3()), .52);
    } else if (hand) bounds.clone().union(hand).getCenter(target);
    const size = (hand && assetId !== 'picnic_blanket' ? bounds.union(hand) : bounds).getSize(new T.Vector3()).length();
    const requestedDistance = useRoom ? Number.parseInt(name.split('_')[1], 10) / 100 : 0;
    const distance = useRoom ? requestedDistance :
      assetId === 'picnic_blanket' && side ? .55 : Math.max(size * 1.42, .35);
    camera.fov = useRoom ? 62 : 39;
    camera.updateProjectionMatrix();
    camera.position.copy(target).addScaledVector(direction, distance);
    camera.lookAt(target);
    renderer.render(useRoom ? scene.object3D : studio, camera);
    const image = renderer.domElement.toDataURL('image/png').split(',')[1];
    for (const mesh of meshes) studio.remove(mesh);
    for (const mesh of meshes.slice(1)) mesh.geometry.dispose();
    const grip = side && physics.hand.get(side)?.grip;
    const authoredAnchor = grip?.zone ? grip.anchor.clone().applyQuaternion(prop.body.quaternion).add(prop.body.position) : null;
    const response = await fetch('/__asset_qa/capture?asset=' + assetId + '&name=' + name, {
      method: 'POST', body: JSON.stringify({ image, metadata: {
        engine: 'A-Frame / Three.js r' + T.REVISION, renderer: 'WebGL', scene: useRoom ? 'bedroom' : 'bedroom bench close-up',
        state, units: 'meters', camera_position: camera.position.toArray(), camera_orientation: camera.quaternion.toArray(),
        camera_fov: camera.fov, camera_distance_m: distance, requested_camera_distance_m: requestedDistance || null, lighting: useRoom ? 'bedroom active light' : 'neutral bench',
        object_pose: { position: prop.body.position.toArray(), rotation: prop.body.quaternion.toArray() },
        hand: secondHand ? 'both' : side ?? 'none', grip: grip?.zone || (isPhone && side ? 'phone rails' : null),
        ray_hit_world: grip ? rayHits.get(side)?.toArray() ?? null : null,
        authored_anchor_world: authoredAnchor?.toArray() ?? null,
        reference_point_world: contact?.toArray() ?? null, view_direction: angle, hand_joints_world: joints
      }})
    });
    if (!response.ok) throw new Error(await response.text());
    outcomes.screenshots.push(name + '.png');
    onProgress({ assetId, captures: outcomes.screenshots.length });
    await frame();
  }

  function acquire(side, direction, reset = true, seamOffset = 0) {
    if (reset) place(pivot);
    const center = getArtBounds().getCenter(new T.Vector3());
    const zones = prop.def.gripZones ?? [];
    let target = center;
    if (assetId === 'picnic_blanket') {
      const edge = zones.reduce((best, item) =>
        direction.dot(new T.Vector3(...item.local_normal)) > direction.dot(new T.Vector3(...best.local_normal)) ? item : best);
      target = new T.Vector3(...edge.local_position_m).addScaledVector(new T.Vector3(...edge.local_normal), -.028)
        .addScaledVector(new T.Vector3(...edge.local_tangent), seamOffset)
        .applyQuaternion(prop.body.quaternion).add(prop.body.position);
    } else if (assetId === 'picnic_basket') {
      const zone = direction.y >= -.20 ? zones[0] : zones[direction.x < 0 ? 1 : 2];
      target = new T.Vector3(...zone.local_position_m).applyQuaternion(prop.body.quaternion).add(prop.body.position);
    } else if (game.benchmark.captureAimZone) {
      const zone = zones.find(item => item.zone_id === game.benchmark.captureAimZone);
      const outward = new T.Vector3(...zone.local_normal).applyQuaternion(prop.body.quaternion).normalize();
      if (direction.dot(outward) >= .60)
        target = new T.Vector3(...zone.local_position_m).applyQuaternion(prop.body.quaternion).add(prop.body.position);
    }
    if (game.benchmark.captureAimType) {
      let best = -Infinity;
      for (const zone of zones) {
        if (zone.type !== game.benchmark.captureAimType) continue;
        const normal = new T.Vector3(...zone.local_normal).applyQuaternion(prop.body.quaternion).normalize();
        const alignment = direction.dot(normal);
        if (alignment <= best) continue;
        best = alignment;
        target = new T.Vector3(...zone.local_position_m).applyQuaternion(prop.body.quaternion).add(prop.body.position);
      }
    }
    let first;
    const exactZone = Boolean(game.benchmark.captureAimType);
    const cross = new T.Vector3(0, 1, 0).cross(direction).normalize();
    for (const lateral of exactZone ? [0, -.004, .004, -.012, .012] : [0]) {
      for (const height of [0, .004, -.004, .009, -.009, .018, -.018]) {
        const origin = target.clone().addScaledVector(direction, 2.5).addScaledVector(cross, lateral);
        origin.y += height;
        ray.set(origin, direction.clone().negate());
        const hit = ray.intersectObject(prop.object, true).find(result => result.object.visible);
        if (hit && (!exactZone || hit.point.distanceToSquared(target) < .035 ** 2)) {
          first = hit;
          break;
        }
      }
      if (first) break;
    }
    if (!first) return null;
    const contact = first.point;
    const z = direction.clone().add(new T.Vector3(0, .10, 0)).normalize();
    const x = new T.Vector3(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    const orientation = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    const palm = contact.clone().addScaledVector(direction, .075);
    if (!physics.grab(side, contact, orientation, prop, { contact, from: palm })) return null;
    rayHits.set(side, contact.clone());
    let pose = { position: palm, orientation };
    const hold = physics.hand.get(side);
    if (isPhone) {
      const wrist = new T.Vector3(side === 'left' ? -.19 : .15, 1.24, 1.27);
      const fixed = phoneGrip(T, wrist, orientation, side, eye.position);
      place(fixed.position, fixed.orientation);
      physics.fixGrip(side, fixed.position, fixed.orientation, fixed.basis);
      pose = { position: wrist, orientation };
    }
    const posed = isPhone ? physics.handOnObject(side, pose) :
      heldGripPose(T, prop.body, hold.grip, pose, Infinity);
    game.avatar.tick(eye, { [side]: posed }, .016);
    return contact;
  }

  try {
    place(pivot);
    for (const dist of [30, 60, 100])
      await save('vr_' + dist + 'cm', 'rest', null, null, [0, .38, -.92], true);

    if (!statesOnly) {
      const pitches = [['minus30', -30], ['0', 0], ['plus30', 30]];
      for (const side of ['left', 'right']) {
        for (let az = 0; az < 360; az += 45) {
          for (const [name, pitch] of pitches) {
            const azimuth = T.MathUtils.degToRad(az), elevation = T.MathUtils.degToRad(pitch);
            const direction = new T.Vector3(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation),
              -Math.cos(azimuth) * Math.cos(elevation));
            const shot = side + '__az' + az + '__pitch' + name + '__grip';
            const contact = acquire(side, direction);
            if (contact) {
              const usedDirection = isPhone ?
                direction.clone().applyQuaternion(prop.object.getWorldQuaternion(new T.Quaternion())).toArray() :
                direction.clone().applyAxisAngle(new T.Vector3(0, 1, 0), .55).toArray();
              await save(shot, 'held', side, contact, usedDirection);
              physics.release(side, false);
            } else {
              outcomes.untestable.push({ shot, reason: 'The sampled line did not intersect a reachable grab surface.' });
            }
          }
        }
      }
    }

    for (const side of ['left', 'right']) {
      const mirrored = side === 'left' ? -1 : 1;
      for (const [state, angle] of [['held_front', [0, .25, -1]], ['held_back', [0, .2, 1]], ['held_side', [mirrored, .15, 0]]]) {
        const sideOfApproach = game.benchmark.captureAimZone ? 1 : mirrored;
        const contact = acquire(side, new T.Vector3(sideOfApproach * .71, .05, -.70).normalize());
        if (!contact) continue;
        await save(side === 'right' ? state : state + '_left', state, side, contact, angle);
        physics.release(side, false);
      }
    }
    for (const state of game.benchmark.states.filter(value => /^(open|pull)_/.test(value))) {
      place(pivot);
      captureState(state);
      await save(state, state, null, null, [.55, .85, -.9]);
    }
    captureState?.('rest');
    if (game.benchmark.previewPull && assetId === 'picnic_blanket') {
      for (const side of ['left', 'right']) {
        const sign = side === 'right' ? 1 : -1;
        const contact = acquire(side, new T.Vector3(.85, .4, .32).normalize(), true, sign * .50);
        const grip = physics.hand.get(side)?.grip;
        if (!contact || !grip?.zone) throw new Error('Could not grip the blanket edge');
        for (const amount of [.5, 1]) {
          const bent = game.benchmark.previewPull(grip, amount);
          const pose = heldGripPose(T, prop.body, bent, { position: contact, orientation: orthogonal }, Infinity);
          game.avatar.tick(eye, { [side]: pose }, .016);
          const gripPoint = bent.anchor.clone().applyQuaternion(prop.body.quaternion).add(prop.body.position);
          await save('pull_held_' + side + '_' + amount * 100, 'pull_held', side, gripPoint, [sign * .6, .2, .8]);
        }
        physics.release(side, false);
        captureState('rest');
      }
    }
    if (isPhone) {
      for (const holding of ['left', 'right']) {
        const other = holding === 'left' ? 'right' : 'left';
        const mirror = holding === 'left' ? 1 : -1;
        const suffix = holding === 'left' ? '' : '_right_hold';
        const contact = acquire(holding, new T.Vector3(mirror * .71, .1, -.70).normalize());
        if (!contact) continue;
        const at = (x, y) => ({ x, y, inside: true });
        const handId = 'qa-' + other;
        game.phone.reset();
        const target = game.phone.guide(handId, at(210, 477));
        const holdingWrist = new T.Vector3(holding === 'left' ? -.19 : .15, 1.24, 1.27);
        const holdingPose = physics.handOnObject(holding, { position: holdingWrist, orientation: orthogonal });
        const normal = new T.Vector3(0, 0, 1).applyQuaternion(game.phone.screen.getWorldQuaternion(new T.Quaternion()));
        const guidePosition = target.clone().addScaledVector(normal, .018);
        const wrist = guidePosition.clone().add(new T.Vector3(mirror * .15, -.07, -.09));
        const orient = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 0, -1), target.clone().sub(wrist).normalize());
        function pointPhone(point) {
          return game.avatar.tick(eye, { [holding]: holdingPose, [other]: {
            position: wrist, orientation: orient, phonePoint: true, phoneTip: point,
            pointDirection: point.clone().sub(wrist).normalize()
          } }, .016)[other];
        }
        const eyeSide = [mirror * .58, .28, -1];
        pointPhone(guidePosition);
        await save('guided_hover' + suffix, 'guided_hover', holding, guidePosition, eyeSide, false, other);
        const fingertip = pointPhone(target);
        const hit = game.phone.position(fingertip);
        if (!hit.inside || Math.abs(hit.z) > .006) throw new Error('The ' + other + ' index missed the screen');
        game.phone.touch(handId, game.phone.pokeTarget(handId, hit));
        await save('guided_tap' + suffix, 'scripted_ui_tap', holding, fingertip, eyeSide, false, other);
        if (holding === 'left') {
          game.phone.touch(handId, at(291, 627));
          game.phone.touch(handId, at(210, 392));
          game.phone.touch(handId, at(210, 367));
          if (game.phone.getState().phase === 'browse' && game.phone.touch(handId, at(220, 320))) {
            game.phone.drag(handId, at(105, 330));
            await save('swipe_in_progress', 'scripted_ui_swipe', holding, contact, [0, .18, -1]);
            game.phone.release(handId, at(105, 330));
            await save('swipe_result', 'scripted_ui_swipe_result', holding, contact, [0, .18, -1]);
          }
        }
        game.phone.clearGuide(handId);
        physics.release(holding, false);
      }
    }

    const contact = acquire('left', new T.Vector3(.71, .1, -.70).normalize());
    if (contact) {
      const orientation = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), .92);
      if (!isPhone && assetId !== 'picnic_blanket') {
        const mate = physics.hand.get('left').grip;
        const heldContact = mate.anchor.clone().applyQuaternion(orientation).add(pivot);
        place(pivot, orientation);
        const pose = heldGripPose(T, prop.body, mate, { position: pivot, orientation }, Infinity);
        game.avatar.tick(eye, { left: pose }, .016);
        await save('tilted', 'tilted', 'left', heldContact, [.65, .4, -.9]);
      }
      physics.release('left', false);
      for (let i = 0; i < 12; i++) physics.tick(1 / 120);
      game.avatar.tick(eye, {}, .016);
      await save('released', 'released', null, null, [.7, .4, -.85]);
    }
    const pickedAgain = acquire('right', new T.Vector3(.71, .05, -.70).normalize(), false);
    if (pickedAgain) {
      await save('regrip', 'regrip', 'right', pickedAgain, [.65,.25,-1]);
      physics.release('right', false);
    }
    return outcomes;
  } finally {
    for (const side of ['left', 'right']) physics.release(side, false);
    prop.object.position.copy(stagePosition);
    prop.object.quaternion.copy(stageRotation);
    game.avatar.setImmersive(false);
    renderer.dispose();
  }
}
