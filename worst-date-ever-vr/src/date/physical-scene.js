import { createPhysicalChallenge, physicalSocialResult } from './physical-interactions.mjs';
import { createMinigameVisuals } from './minigame-visuals.js';
import { markTutorialSeen, tutorialSeen } from './skill-tutorial.mjs';
import { makeKinematic, releaseDynamic } from '../physics-world.mjs';
import menuCatalog from '../../content/shared/menu-items.json' with { type: 'json' };
import { createMenuFood } from './menu-food.js';

const smooth = (THREE, x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

export function createPhysicalScene(THREE, { parent, camera, date, props, venueId, audio, complete,
  isVr = () => false, storage = null }) {
  const root = new THREE.Group();
  root.name = 'Physical interaction props';
  parent.add(root);
  const ceramic = new THREE.MeshStandardMaterial({ color: 0xf9dce9, roughness: .3, metalness: .08 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xf4c3d8, transparent: true, opacity: .56,
    roughness: .2, metalness: .06, side: THREE.DoubleSide, depthWrite: false });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd6a45c, roughness: .53 });
  const fruitColors = [0xd75f65, 0xf2cb63, 0x8dc98a];
  const cupGeometry = new THREE.CylinderGeometry(.046, .033, .115, 12, 1, true);
  const rimGeometry = new THREE.TorusGeometry(.046, .003, 6, 12);
  const bottomGeometry = new THREE.CylinderGeometry(.033, .033, .004, 12);
  function makeCup() {
    const cup = new THREE.Group();
    const shell = new THREE.Mesh(cupGeometry, glass);
    const rim = new THREE.Mesh(rimGeometry, ceramic);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = .057;
    const base = new THREE.Mesh(bottomGeometry, ceramic);
    base.position.y = -.056;
    cup.add(shell, rim, base);
    root.add(cup);
    return cup;
  }
  const dateCup = makeCup(), trickCup = makeCup();
  dateCup.position.set(.17,.86,-.63);
  trickCup.position.set(.36,.86,.02);
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(.038,.038,.01,14),
    new THREE.MeshBasicMaterial({ color: 0xc8a3dd, transparent: true, opacity: .63,
      side: THREE.DoubleSide, depthWrite: false }));
  liquid.position.y = -.028;
  trickCup.add(liquid);
  const droplets = Array.from({ length: 9 }, (_, index) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(.008 + index % 3 * .002, 0),
      new THREE.MeshBasicMaterial({ color: 0xd9c0ea, transparent: true, opacity: .72 }));
    mesh.visible = false;
    root.add(mesh);
    return { mesh, velocity: new THREE.Vector3() };
  });
  const palettes = { cafe: [0x78a264,0xd88559], sushi: [0xe99478,0x304d3f],
    bistro: [0xc78754,0x718f55], bar: [0xe3a15d,0x914d62] };
  const foodPalette = palettes[venueId] ?? palettes.bistro;
  let foodPieces = [];
  let incoming, plated, servedDrink;
  const deliveryTarget = new THREE.Vector3();
  const drinkPlacement = new THREE.Vector3(-.13, .787, -.10);
  let foodRemaining = false;
  let dateEating = null;
  const fork = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.004,.006,.20,7), gold);
  handle.rotation.z = Math.PI / 2;
  const tines = [-.012,0,.012].map(offset => {
    const tine = new THREE.Mesh(new THREE.CylinderGeometry(.0015,.0015,.048,5), gold);
    tine.position.set(.105,0,offset);
    tine.rotation.z = Math.PI / 2;
    return tine;
  });
  const bite = new THREE.Mesh(new THREE.IcosahedronGeometry(.023, 1),
    new THREE.MeshStandardMaterial({ color: foodPalette[1], roughness: .8 }));
  bite.position.x = .125;
  fork.add(handle, ...tines, bite);
  root.add(fork);
  fork.visible = false;
  const fruits = fruitColors.map((color, index) => {
    const group = new THREE.Group();
    group.name = 'juggle-fruit-' + index;
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(index === 1 ? .050 : .045, 1),
      new THREE.MeshStandardMaterial({ color, roughness: .7 }));
    body.scale.set(index === 1 ? 1.22 : 1, index === 0 ? .92 : .85, index === 1 ? .82 : 1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.004,.006,.018,5), gold);
    stem.position.y = .044;
    group.add(body, stem);
    if (index !== 1) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.018, .032, 4),
        new THREE.MeshStandardMaterial({ color: index === 0 ? 0x5e9b62 : 0x4b9768, roughness: .8 }));
      leaf.position.set(.014,.053,0);
      leaf.rotation.z = -.65;
      group.add(leaf);
    } else {
      for (const direction of [-1, 1]) {
        const point = new THREE.Mesh(new THREE.ConeGeometry(.016,.028,6),
          new THREE.MeshStandardMaterial({ color: 0xe9bf61, roughness: .8 }));
        point.rotation.z = direction * Math.PI / 2;
        point.position.x = direction * .064;
        group.add(point);
      }
    }
    root.add(group);
    group.position.set((index - 1) * .14, .84, -.11);
    group.visible = true;
    return { mesh: group, fallen: false, velocity: new THREE.Vector3(), rest: group.position.clone(),
      start: group.position.clone() };
  });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe8b6a2, roughness: .74 });
  const sleeve = new THREE.MeshStandardMaterial({ color: 0x813b62, roughness: .84 });
  const danceHands = [-1,1].map(side => {
    const hand = new THREE.Group();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.034,.052,.29,7), sleeve);
    arm.position.y = -.15;
    const palm = new THREE.Mesh(new THREE.IcosahedronGeometry(.065, 1), skin);
    palm.scale.set(.85,1.18,.45);
    hand.add(arm, palm);
    root.add(hand);
    hand.visible = false;
    return { side, mesh: hand };
  });
  const playerHand = new THREE.Group();
  const playerPalm = new THREE.Mesh(new THREE.IcosahedronGeometry(.056, 1), skin);
  playerPalm.scale.set(.85,1.10,.72);
  const playerSleeve = new THREE.Mesh(new THREE.CylinderGeometry(.035,.055,.19,7), sleeve);
  playerSleeve.position.y = -.12;
  playerHand.add(playerPalm, playerSleeve);
  root.add(playerHand);
  playerHand.visible = false;
  const focus = new THREE.PointLight(0xf472b6, 0, 1.1, 2);
  root.add(focus);
  const visuals = createMinigameVisuals(THREE, { parent: root, camera, fruits, date, audio });
  const target = new THREE.Vector3();
  const cameraPoint = new THREE.Vector3();
  const cameraQuat = new THREE.Quaternion();
  const homeDateCup = new THREE.Vector3(.17,.86,-.63);
  const sharedPoint = new THREE.Vector3(-.04,1.08,-.52);
  let active = null, lastUsed = {}, axisHeld = false, lastFeedback = null;
  const headAngles = new THREE.Euler(0, 0, 0, 'YXZ');
  const getStorage = () => { try { return storage ?? (typeof window !== 'undefined' ? window.localStorage : null); }
    catch { return null; } };

  function bodyAt(prop, point) {
    prop.body.position.set(point.x, point.y, point.z);
    prop.body.previousPosition.copy(prop.body.position);
    prop.body.velocity.setZero();
    prop.body.angularVelocity.setZero();
    prop.body.aabbNeedsUpdate = true;
    prop.mesh.position.copy(point);
    prop.mesh.quaternion.identity();
  }
  function prepareOrder(itemId, trayMount) {
    const item = menuCatalog.venues[venueId]?.find(entry => entry.id === itemId);
    if (!item) return false;
    incoming?.dispose();
    incoming = { ...createMenuFood(THREE, item), isDrink: item.category === 'drinks' };
    trayMount.add(incoming.model);
    incoming.model.position.y = incoming.isDrink ? 0 : .026;
    return true;
  }

  function serveOrder(progress) {
    if (!incoming) return false;
    const { model, isDrink } = incoming;
    if (!incoming.origin) {
      root.attach(model);
      incoming.origin = model.position.clone();
    }
    if (isDrink) deliveryTarget.copy(drinkPlacement);
    else {
      props.plate.mesh.localToWorld(deliveryTarget.set(0, .026, 0));
      root.worldToLocal(deliveryTarget);
    }
    const blend = smooth(THREE, progress, 0, 1);
    model.position.copy(incoming.origin).lerp(deliveryTarget, blend);
    model.position.y += .10 * Math.sin(Math.PI * blend);
    if (progress < 1) return false;
    if (isDrink) {
      servedDrink?.dispose();
      servedDrink = incoming;
      model.quaternion.identity();
    } else {
      plated?.dispose();
      plated = incoming;
      props.plate.mesh.add(model);
      model.position.set(0, .026, 0);
      model.quaternion.identity();
      foodPieces = plated.portions;
      foodRemaining = true;
      dateEating = { elapsed: 0, nextBite: 2.1, eaten: 0 };
    }
    incoming = null;
    return true;
  }
  function begin(id, view) {
    if (active || view.session.phase !== 'dialogue' || view.beat || !view.canSpeak) return false;
    const challenge = createPhysicalChallenge(id, id === 'toast' ? { duration: 14 } : {});
    const prop = ['offer_food', 'eat'].includes(id) ? props.plate : id === 'toast' ? props.cup : null;
    if (prop?.owner || ['offer_food', 'eat'].includes(id) && !foodRemaining) return false;
    if (prop && id !== 'toast') makeKinematic(prop.body);
    const repeats = view.actions.filter(item => item.eventId === 'physical' && item.choiceId.startsWith(id + ':')).length;
    const preview = physicalSocialResult(view.session.matchId, id,
      challenge.action.type === 'instant' ? 'complete' : 'partial', view.session.relationship, repeats);
    const stage = challenge.action.type === 'instant' ? 'playing' :
      tutorialSeen(getStorage(), id) ? 'countdown' : 'tutorial';
    active = { challenge, prop, preview, stage, countdown: 3, outcomeAge: 0, reported: false, sound: new Set(),
      drop: null, toastDwell: 0, balanceOrigin: trickCup.position.clone(), startedAt: view.time,
      correction: null, headHome: null };
    if (id === 'juggle') for (const fruit of fruits) {
      fruit.fallen = false; fruit.velocity.set(0,0,0);
      fruit.start.copy(fruit.mesh.position);
    }
    if (id === 'balance') trickCup.rotation.set(0,0,0);
    if (id === 'balance') for (const drop of droplets) drop.mesh.visible = false;
    if (['dance','juggle','balance'].includes(id))
      danceHands.forEach(hand => { hand.mesh.visible = true; });
    if (challenge.action.type !== 'instant') visuals.start(id);
    playerHand.visible = id === 'toast' || id === 'offer_food' || id === 'eat';
    if (challenge.action.type === 'instant')
      audio('interaction_start', prop?.mesh.position ?? new THREE.Vector3(0,1,-.2));
    return true;
  }
  function confirm() {
    if (!active || active.stage !== 'tutorial') return false;
    markTutorialSeen(getStorage(), active.challenge.action.id);
    active.stage = 'countdown';
    active.countdown = 3;
    audio('interaction_countdown', focus.position);
    return true;
  }
  function showTutorial() {
    if (!active || active.challenge.action.type === 'instant' || active.stage === 'result') return false;
    const id = active.challenge.action.id;
    active.challenge = createPhysicalChallenge(id);
    active.stage = 'tutorial';
    active.countdown = 3;
    active.sound.clear();
    active.drop = null;
    for (const fruit of fruits) {
      fruit.fallen = false; fruit.velocity.set(0,0,0);
      fruit.mesh.position.copy(fruit.rest); fruit.start.copy(fruit.rest);
    }
    visuals.start(id);
    return true;
  }
  function cancel() {
    if (!active) return false;
    active.challenge.cancel();
    restore();
    return true;
  }
  function restore() {
    if (!active) return;
    const { prop } = active;
    if (prop && !prop.owner) {
      bodyAt(prop, new THREE.Vector3(...prop.position));
      releaseDynamic(prop.body);
    }
    if (active.challenge.action.id === 'balance' && active.challenge.state.result !== 'failure')
      trickCup.position.set(.36,.86,.02);
    dateCup.position.copy(homeDateCup);
    for (const fruit of fruits) if (fruit.mesh.position.y > .84 && active.challenge.state.result)
      fruit.mesh.position.y = .84;
    danceHands.forEach(hand => { hand.mesh.visible = false; });
    playerHand.visible = false;
    fork.visible = false;
    active = null;
    axisHeld = false;
    focus.intensity = 0;
    visuals.stop();
    for (const drop of droplets) drop.mesh.visible = false;
  }
  function input(direction, cut) {
    if (!active || active.stage !== 'playing') return false;
    const accepted = active.challenge.input(direction, cut);
    if (accepted && active.challenge.action.type === 'balance')
      active.correction = { direction, at: active.challenge.state.elapsed };
    if (accepted && active.challenge.action.type === 'balance')
      audio('interaction_hit', trickCup.position);
    else if (!accepted && active.challenge.action.type !== 'instant') audio('interaction_miss', trickCup.position);
    return accepted;
  }
  function slash(side, x, y, z) {
    if (!active || active.challenge.action.id !== 'dance' || active.stage !== 'playing') return false;
    const length = Math.hypot(x, y, z);
    if (length < .045) return false;
    const cut = Math.abs(y) >= Math.abs(x) ? (y > 0 ? 'up' : 'down') : (x > 0 ? 'right' : 'left');
    return input(side, cut);
  }
  function axis(value, vertical, dt, allowTap = true) {
    if (!active || active.stage !== 'playing') return;
    if (active.challenge.action.type === 'balance') {
      active.challenge.steer(Math.abs(value) > .12 ? value : 0,
        Math.abs(vertical) > .12 ? vertical : 0, dt);
      if (Math.abs(value) > .16) active.correction = {
        direction: value < 0 ? 'left' : 'right', at: active.challenge.state.elapsed };
    } else if (allowTap && Math.abs(value) > .68 && !axisHeld) {
      input(value < 0 ? 'left' : 'right');
      axisHeld = true;
    } else if (Math.abs(value) < .28) axisHeld = false;
  }
  function lookAt(point, intensity = 1) {
    const head = date.bones.Head;
    if (!head || !date.actor.visible) return;
    const from = head.getWorldPosition(new THREE.Vector3());
    const direction = point.clone().sub(from);
    head.rotateY(THREE.MathUtils.clamp(direction.x * .17, -.15, .15) * intensity);
    head.rotateX(THREE.MathUtils.clamp(-direction.y * .10, -.11, .11) * intensity);
  }
  function updateToast(state, age, social, dt) {
    const accept = social !== 'refuse';
    const up = smooth(THREE, age, .12, 1.25);
    const back = smooth(THREE, age, 2.05, 3.35);
    const amount = up * (1 - back);
    playerHand.position.copy(props.cup.mesh.position).add(new THREE.Vector3(-.015,-.055,.045));
    playerHand.rotation.z = -.17;
    playerHand.scale.setScalar(props.cup.owner ? 1 : 0);
    dateCup.visible = true;
    dateCup.position.copy(homeDateCup).lerp(sharedPoint.clone().add(new THREE.Vector3(.085,0,-.015)),
      accept ? smooth(THREE, age, .45, 1.20) : 0);
    dateCup.rotation.z = accept ? -.13 * amount : .03;
    const cupPoint = props.cup.mesh.position;
    const offered = accept && props.cup.owner && cupPoint.distanceTo(sharedPoint.clone().add(new THREE.Vector3(.04,0,0))) < .14;
    active.toastDwell = offered ? active.toastDwell + dt : 0;
    if (offered && active.toastDwell >= .36 && !active.sound.has('clink')) {
      active.sound.add('clink'); audio('interaction_clink', cupPoint);
      state.result = 'complete';
    }
    date.animation.gesture(accept ? (active.sound.has('clink') ? 'clap' : 'reach') : 'look_away', Math.min(1.1, Math.max(0, age - .42)),
      social === 'enthusiastic' ? 1.15 : .8);
    lookAt(accept ? cupPoint : props.cup.mesh.position);
    if ((!accept && age > 2.2) || age >= 13.8) state.result = 'failure';
  }
  function updateOffer(state, age, social) {
    const prop = props.plate;
    const accept = social !== 'refuse';
    const toward = smooth(THREE, age, .25, 1.15) * (1 - smooth(THREE, age, 2.5, 3.65));
    target.fromArray(prop.position).lerp(new THREE.Vector3(.07,.83,-.53), toward);
    bodyAt(prop, target);
    playerHand.position.copy(target).add(new THREE.Vector3(.11,-.045,.06));
    playerHand.scale.setScalar(Math.min(1, smooth(THREE, age, 0, .35)) *
      (1 - smooth(THREE, age, 3.20, 3.75)));
    if (accept) {
      const eating = smooth(THREE, age, 1.55, 2.65);
      const mouth = date.bones.Head?.getWorldPosition(new THREE.Vector3()) ??
        new THREE.Vector3(0,1.35,-.86);
      mouth.add(new THREE.Vector3(0,-.12,.12).applyQuaternion(date.actor.quaternion));
      fork.visible = age >= 1.35 && age < 3.2;
      fork.position.copy(target).add(new THREE.Vector3(0,.07,0)).lerp(mouth, eating);
      fork.position.y += Math.sin(Math.PI * eating) * .08;
      fork.rotation.z = -.23 * eating;
      bite.scale.setScalar(1 - smooth(THREE, age, 2.55, 2.95));
      if (age >= 2.25 && foodPieces[0]) foodPieces[0].visible = false;
      foodRemaining = foodPieces.some(piece => piece.visible);
      if (eating > .82 && !active.sound.has('bite')) {
        active.sound.add('bite'); audio('interaction_bite', prop.mesh.position);
      }
    }
    date.animation.gesture(accept ? (age >= 1.7 ? 'eat' : 'reach') : 'look_away',
      Math.min(1.1, Math.max(0, age - .55)), .9);
    lookAt(prop.mesh.position);
  }
  function updateEat(state, age) {
    const source = props.plate.mesh.position.clone().add(new THREE.Vector3(.07,.10,.02));
    camera.getWorldPosition(cameraPoint);
    camera.getWorldDirection(target);
    const mouthWorld = cameraPoint.clone().addScaledVector(target, .34).add(new THREE.Vector3(0,-.12,0));
    const mouth = root.worldToLocal(mouthWorld);
    const bitePhase = (age % .78) / .78;
    const travel = smooth(THREE, bitePhase, .12, .72);
    playerHand.visible = true;
    playerHand.position.copy(source).lerp(mouth, travel);
    playerHand.rotation.set(-.18 + .14 * Math.sin(bitePhase * Math.PI), 0, -.12);
    playerHand.scale.setScalar(.94);
    fork.visible = bitePhase > .10 && bitePhase < .82;
    fork.position.copy(source).lerp(mouth, travel);
    fork.rotation.z = -.25 + .20 * Math.sin(bitePhase * Math.PI);
    const eaten = Math.min(foodPieces.length, Math.floor(age / .58));
    foodPieces.forEach((piece, index) => { if (index < eaten) piece.visible = false; });
    foodRemaining = foodPieces.some(piece => piece.visible);
    for (let index = 0; index < foodPieces.length; index++) {
      const key = 'player_bite' + index;
      if (age >= index * .58 + .38 && !active.sound.has(key)) {
        active.sound.add(key); audio('interaction_bite', mouth);
      }
    }
  }
  function updateBalance(state, dt) {
    camera.getWorldPosition(cameraPoint);
    camera.getWorldQuaternion(cameraQuat);
    danceHands.forEach(({ side, mesh }) => {
      const correction = active.correction?.direction === (side < 0 ? 'left' : 'right') ?
        Math.max(0, 1 - (state.elapsed - active.correction.at) / .24) : 0;
      mesh.position.copy(cameraPoint).add(new THREE.Vector3(side * (.24 - correction * .15),
        -.45 + correction * .12, -.50 - correction * .10).applyQuaternion(cameraQuat));
      mesh.quaternion.copy(cameraQuat);
      mesh.scale.setScalar(Math.max(.1, smooth(THREE, state.elapsed, .20, .85)) *
        (1 - smooth(THREE, active.outcomeAge, .8, 1.8)));
    });
    if (active.drop) {
      const drop = active.drop;
      drop.velocity.y -= 4.8 * dt;
      trickCup.position.addScaledVector(drop.velocity, dt);
      trickCup.rotation.z += dt * 4;
      const overTable = Math.abs(trickCup.position.x) < .61 &&
        trickCup.position.z > -.77 && trickCup.position.z < .22;
      const surface = overTable ? .86 : .07;
      if (trickCup.position.y < surface) {
        trickCup.position.y = surface;
        drop.velocity.y = Math.abs(drop.velocity.y) * .28;
        drop.velocity.x *= .55;
        if (!active.sound.has('cup_drop')) {
          active.sound.add('cup_drop'); audio('interaction_drop', trickCup.position);
        }
      }
    } else {
      camera.getWorldPosition(cameraPoint);
      camera.getWorldQuaternion(cameraQuat);
      const nosePoint = cameraPoint.clone().add(new THREE.Vector3(.0,-.30,-.51).applyQuaternion(cameraQuat));
      trickCup.position.copy(active.balanceOrigin).lerp(nosePoint, smooth(THREE, state.elapsed, .05, .84) *
        (1 - smooth(THREE, active.outcomeAge, .15, 1.30)));
      trickCup.rotation.set(state.tiltY * .85,0,-state.tilt * 1.15);
      liquid.rotation.set(-state.tiltY * .24, 0, state.tilt * .24);
      liquid.position.y = -.028 + Math.sin(state.elapsed * 8) * .003 *
        Math.min(1, Math.hypot(state.tilt, state.tiltY) * 2);
      if (state.result === 'failure') {
        active.drop = { velocity: new THREE.Vector3(.18 + state.tilt * .25, .12, -.45) };
        droplets.forEach(({ mesh, velocity }, index) => {
          mesh.visible = true;
          mesh.position.copy(trickCup.position).add(new THREE.Vector3(0,.03,0));
          const angle = index * 2.39996;
          velocity.set(Math.cos(angle) * (.10 + index % 3 * .05), .17 + index % 4 * .05,
            Math.sin(angle) * .11);
        });
        audio('interaction_fail', trickCup.position);
      }
    }
    if (active.drop) for (const { mesh, velocity } of droplets) if (mesh.visible) {
      velocity.y -= 3.6 * dt;
      mesh.position.addScaledVector(velocity, dt);
      if (mesh.position.y < .86) { mesh.position.y = .86; velocity.set(0,0,0); }
    }
    lookAt(trickCup.position);
    const risk = Math.min(1, Math.hypot(state.tilt, state.tiltY) / .68);
    date.animation.gesture(state.result === 'failure' ? 'startle' : 'reach',
      Math.max(0, state.elapsed - 1.2) % 1.5, state.result === 'failure' ? 1 : .25 + risk * .35);
  }
  function updateJuggle(state, dt) {
    camera.getWorldPosition(cameraPoint);
    camera.getWorldQuaternion(cameraQuat);
    danceHands.forEach(({ side, mesh }) => {
      const lastCatch = state.taps.at(-1);
      const reach = lastCatch && side === (lastCatch.side === 'left' ? -1 : 1) ?
        Math.max(0, 1 - (state.elapsed - lastCatch.at) / .35) : 0;
      mesh.position.copy(cameraPoint).add(new THREE.Vector3(side * (.22 - reach * .05),
        -.57 + reach * .14, -.64 - reach * .20).applyQuaternion(cameraQuat));
      mesh.quaternion.copy(cameraQuat);
      mesh.rotation.z += side * reach * .24;
      mesh.scale.setScalar(Math.max(.1, smooth(THREE, state.elapsed, .10, .85)) *
        (1 - smooth(THREE, active.outcomeAge, .75, 1.6)));
    });
    fruits.forEach((fruit, index) => {
      if (state.phase === 'prepare') {
        fruit.mesh.position.copy(fruit.start).lerp(fruit.rest, smooth(THREE, state.elapsed, .05, .85));
        return;
      }
      if (!fruit.fallen && (state.result === 'failure' || state.failures.some(failure => failure.fruit === index))) {
        fruit.fallen = true;
        fruit.velocity.set(index % 2 ? -.26 : .2, -.1, .13);
      }
      if (fruit.fallen) {
        fruit.velocity.y -= 4.9 * dt;
        fruit.mesh.position.addScaledVector(fruit.velocity, dt);
        fruit.mesh.rotation.z += dt * 5;
        if (fruit.mesh.position.y <= .84) {
          fruit.mesh.position.y = .84;
          fruit.velocity.y = Math.abs(fruit.velocity.y) * .32;
          fruit.velocity.x *= .7;
          if (!active.sound.has('fruit' + index)) {
            active.sound.add('fruit' + index); audio('interaction_drop', fruit.mesh.position);
          }
        }
      } else {
        const sequence = active.challenge.beats.filter(beat => beat.fruit === index);
        const nextIndex = sequence.findIndex(beat => beat.at >= state.elapsed);
        const next = nextIndex < 0 ? null : sequence[nextIndex];
        const previous = nextIndex <= 0 ? null : sequence[nextIndex - 1];
        if (next) {
          const from = previous ? previous.side === 'left' ? -.22 : .22 : fruit.rest.x;
          const to = next.side === 'left' ? -.22 : .22;
          const start = previous?.at ?? (index === 2 ? 2.10 : .85);
          const phase = THREE.MathUtils.clamp((state.elapsed - start) / Math.max(.1, next.at - start), 0, 1);
          if (state.elapsed < start) fruit.mesh.position.copy(fruit.rest);
          else fruit.mesh.position.set(THREE.MathUtils.lerp(from, to, phase),
            .91 + Math.sin(Math.PI * phase) * (.30 + .06 * state.hits / 6),
            -.14 - Math.sin(Math.PI * phase) * .11);
          fruit.mesh.rotation.z = Math.sin(Math.PI * phase) * .34 + state.elapsed * .25;
        } else {
          const settle = smooth(THREE, active.outcomeAge + Math.max(0, state.elapsed - sequence.at(-1).at), 0, 1.3);
          fruit.mesh.position.lerp(fruit.rest, settle);
        }
      }
    });
    const focusFruit = fruits[active.challenge.beats[state.beat]?.fruit ?? 1];
    lookAt(focusFruit.mesh.position, .75);
    date.animation.gesture(state.result === 'failure' ? 'startle' : 'reach',
      Math.max(0, state.elapsed - 1) % 1.4, state.result === 'failure' ? .9 : .3);
  }
  function updateDance(state) {
    camera.getWorldPosition(cameraPoint);
    camera.getWorldQuaternion(cameraQuat);
    const beat = Math.sin(state.elapsed * Math.PI * 2 / .60);
    const lastMiss = state.failures.at(-1);
    const stumble = lastMiss ? Math.max(0, 1 - (state.elapsed - lastMiss.at) / .55) : 0;
    danceHands.forEach(({ side, mesh }) => {
      const score = state.hits / Math.max(1, state.beat);
      mesh.position.copy(cameraPoint).add(new THREE.Vector3(side * .27,
        -.39 + Math.max(0, beat * side) * (.13 + .10 * score) - stumble * .08,
        -.57 + stumble * .09).applyQuaternion(cameraQuat));
      mesh.quaternion.copy(cameraQuat);
      mesh.rotation.z += side * (.22 + .13 * Math.sin(state.elapsed * 8)) + stumble * .30;
      mesh.scale.setScalar(Math.max(.1, smooth(THREE, state.elapsed, .12, .86)) *
        (1 - smooth(THREE, active.outcomeAge, .75, 1.6)));
    });
    if (!state.result) date.animation.dance?.(state.elapsed, .45 + Math.min(.65, state.combo * .11), stumble);
    else date.animation.gesture(state.result === 'failure' ? 'laugh' : 'clap',
      Math.max(0, active.outcomeAge) % 1.4, state.result === 'failure' ? .55 : .85);
    lookAt(danceHands[0].mesh.position, .45);
  }
  function tick(dt, view) {
    if (dateEating) {
      dateEating.elapsed += dt;
      while (dateEating.eaten < foodPieces.length && dateEating.elapsed >= dateEating.nextBite) {
        foodPieces[dateEating.eaten++].visible = false;
        audio('interaction_bite', props.plate.mesh.position);
        dateEating.nextBite += 1.55;
      }
      foodRemaining = foodPieces.some(piece => piece.visible);
      if (dateEating.eaten >= foodPieces.length) dateEating = null;
    }
    if (!active) return;
    const { challenge } = active;
    if (active.stage === 'tutorial') {
      visuals.update({ ...challenge.state, beats: challenge.beats }, active.stage, dt);
      return;
    }
    if (active.stage === 'countdown') {
      const before = Math.ceil(active.countdown);
      active.countdown = Math.max(0, active.countdown - dt);
      if (Math.ceil(active.countdown) < before) audio('interaction_countdown', focus.position);
      visuals.update({ ...challenge.state, beats: challenge.beats }, active.stage, dt);
      if (active.countdown === 0) {
        active.stage = 'playing';
        camera.getWorldQuaternion(cameraQuat);
        headAngles.setFromQuaternion(cameraQuat, 'YXZ');
        active.headHome = { pitch: headAngles.x, roll: headAngles.z };
        audio('interaction_start', focus.position);
      }
      return;
    }
    if (challenge.action.id === 'balance' && isVr() && active.headHome) {
      camera.getWorldQuaternion(cameraQuat);
      headAngles.setFromQuaternion(cameraQuat, 'YXZ');
      const roll = THREE.MathUtils.clamp(headAngles.z - active.headHome.roll, -.24, .24);
      const pitch = THREE.MathUtils.clamp(headAngles.x - active.headHome.pitch, -.24, .24);
      challenge.steer(-roll * 3.3, pitch * 3.3, dt);
    }
    const state = challenge.tick(dt);
    const age = state.elapsed;
    if (challenge.action.id === 'dance') {
      const pulse = Math.floor(Math.max(0, age - .58) / .60);
      const key = 'pulse' + pulse;
      if (age > .58 && !active.sound.has(key)) {
        active.sound.add(key);
        audio(pulse % 4 === 0 ? 'interaction_downbeat' : 'interaction_pulse',
          danceHands[pulse % 2].mesh.position);
      }
    }
    for (let index = 0; index < challenge.beats.length; index++) {
      const beat = challenge.beats[index];
      if (age >= beat.at && !active.sound.has('beat' + index)) {
        active.sound.add('beat' + index);
        audio(challenge.action.type === 'rhythm' ? 'interaction_beat' : 'interaction_toss',
          challenge.action.type === 'rhythm' ? danceHands[beat.side === 'left' ? 0 : 1].mesh.position :
            fruits[beat.fruit].mesh.position);
      }
    }
    focus.intensity = state.result ? .45 : .8;
    focus.position.copy(active.prop?.mesh.position ?? (challenge.action.id === 'juggle' ? fruits[1].mesh.position :
      challenge.action.id === 'dance' ? danceHands[0].mesh.position : trickCup.position));
    if (challenge.action.id === 'toast') updateToast(state, age, active.preview.response, dt);
    else if (challenge.action.id === 'offer_food') updateOffer(state, age, active.preview.response);
    else if (challenge.action.id === 'eat') updateEat(state, age);
    else if (challenge.action.id === 'balance') updateBalance(state, dt);
    else if (challenge.action.id === 'juggle') updateJuggle(state, dt);
    else updateDance(state);
    if (challenge.action.type !== 'instant') visuals.update({ ...state, beats: challenge.beats }, active.stage, dt);
    if (state.result && !active.reported) {
      active.stage = 'result';
      active.reported = true;
      lastFeedback = complete(challenge.action.id, state.result);
      lastUsed[challenge.action.id] = view.time;
      if (challenge.action.id === 'offer_food' && lastFeedback?.response !== 'refuse')
        foodRemaining = foodPieces.some(piece => piece.visible);
      audio(state.result === 'failure' ? 'interaction_fail' : 'interaction_success', focus.position);
    }
    if (state.result) {
      active.outcomeAge += dt;
      if (active.outcomeAge >= (state.result === 'failure' ? 2.0 : 1.35)) restore();
    }
  }
  function state() { return active ? { ...active.challenge.state, action: active.challenge.action,
    beats: active.challenge.beats, stage: active.stage, countdown: active.countdown,
    feedback: visuals.feedback() } : null; }
  function diningState() { return dateEating ? { eating: true, elapsed: dateEating.elapsed } : { eating: false, elapsed: 0 }; }
  return { begin, tick, input, slash, axis, confirm, showTutorial, cancel, state, focus: () => focus.position,
    prepareOrder, serveOrder, diningState, dispose() {
      incoming?.dispose();
      plated?.dispose();
      servedDrink?.dispose();
      visuals.dispose();
    }, lastUsed: () => lastUsed,
    objects: () => ['table', ...(props.cup.owner ? [] : ['cup']), ...(foodRemaining && !props.plate.owner ? ['food'] : [])],
    feedback: () => lastFeedback };
}
