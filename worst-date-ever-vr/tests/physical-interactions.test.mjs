import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PHYSICAL_ACTIONS, SKILL_UI, availablePhysicalActions, createPhysicalChallenge,
  fixedSkillAnchor, physicalLine, physicalSocialResult, PHYSICAL_DELTAS } from '../src/date/physical-interactions.mjs';
import { createDateDirector } from '../src/date/director.mjs';
import { createPhysicalScene } from '../src/date/physical-scene.js';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { SKILL_TUTORIALS_KEY, markTutorialSeen, tutorialSeen } from '../src/date/skill-tutorial.mjs';

const read = name => JSON.parse(readFileSync(new URL('../content/shared/' + name + '.json', import.meta.url)));
const relationship = { interest: 42, awkwardness: 24, patience: 58, safety: 65 };

test('only complete physical interactions appear when objects and cooldown permit them', () => {
  assert.deepEqual(PHYSICAL_ACTIONS.map(action => action.id),
    ['toast', 'balance', 'juggle', 'offer_food', 'dance']);
  const context = { phase: 'dialogue', event: null, busy: false, time: 80, objects: ['cup','food','table'] };
  assert.equal(availablePhysicalActions(context).length, 5);
  assert.deepEqual(availablePhysicalActions({ ...context, objects: ['table'] }).map(action => action.id),
    ['juggle','dance']);
  assert.deepEqual(availablePhysicalActions({ ...context, lastUsed: { toast: 70 } }).map(action => action.id),
    ['balance','juggle','offer_food','dance']);
  assert.deepEqual(availablePhysicalActions({ ...context, event: { id: 'water_spill' } }), []);
  assert.deepEqual(availablePhysicalActions({ ...context, busy: true }), []);
});

function runChallenge(id, respond) {
  const game = createPhysicalChallenge(id);
  for (let i = 0; i < 500 && !game.state.result; i++) {
    game.tick(.016);
    respond?.(game);
  }
  return game.state;
}

test('balance responds to corrections and fails without them', () => {
  assert.equal(runChallenge('balance').result, 'failure');
  const corrected = runChallenge('balance', game => {
    game.steer(-game.state.tilt * 2 - game.state.velocity * .5,
      -game.state.tiltY * 2 - game.state.velocityY * .5, .016);
  });
  assert.equal(corrected.result, 'success');
});

test('skill controls stay in a fixed reachable place independent of moving objects', () => {
  const viewer = [0, 1.62, .7];
  const anchor = fixedSkillAnchor(viewer, [0, -.15, -1]);
  assert.equal(anchor[1], viewer[1] - SKILL_UI.eyeDrop);
  assert.ok(Math.abs(Math.hypot(anchor[0] - viewer[0], anchor[2] - viewer[2]) - SKILL_UI.distance) < 1e-9);
  assert.deepEqual(fixedSkillAnchor(viewer, [0, -.15, -1]), anchor);
});

test('tutorial completion persists separately for each skill', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value) };
  assert.equal(tutorialSeen(storage, 'balance'), false);
  assert.equal(tutorialSeen(storage, 'dance'), false);
  markTutorialSeen(storage, 'balance');
  assert.equal(tutorialSeen(storage, 'balance'), true);
  assert.equal(tutorialSeen(storage, 'dance'), false);
  assert.deepEqual(JSON.parse(values.get(SKILL_TUTORIALS_KEY)), { balance: true });
});

test('juggling uses catch timing while dance uses a separate faster rhythm', () => {
  assert.equal(runChallenge('juggle').result, 'failure');
  assert.equal(runChallenge('dance').result, 'failure');
  for (const id of ['juggle','dance']) {
    const game = createPhysicalChallenge(id);
    assert.notDeepEqual(createPhysicalChallenge('juggle').beats, createPhysicalChallenge('dance').beats);
    for (let i = 0; i < 500 && !game.state.result; i++) {
      game.tick(.016);
      if (game.beats[game.state.beat] !== undefined &&
        Math.abs(game.state.elapsed - game.beats[game.state.beat].at) < .008) {
        const beat = game.beats[game.state.beat];
        game.input(beat.side, beat.cut);
      }
    }
    assert.equal(game.state.result, 'success');
    assert.equal(game.state.misses, 0);
  }
  const juggle = createPhysicalChallenge('juggle');
  while (juggle.state.elapsed < juggle.beats[0].at) juggle.tick(.01);
  assert.equal(juggle.input('right'), false);
  assert.equal(juggle.state.failures[0].fruit, 0);
  assert.equal(juggle.state.beat, 1);
  const dance = createPhysicalChallenge('dance');
  assert.notDeepEqual(juggle.beats.map(beat => beat.side), dance.beats.map(beat => beat.side));
});

test('social outcomes depend on persona and history rather than mechanical success alone', () => {
  const bia = physicalSocialResult('bia', 'juggle', 'success', relationship);
  const luiza = physicalSocialResult('luiza', 'dance', 'failure', relationship);
  assert.equal(bia.response, 'awkward');
  assert.equal(luiza.response, 'enthusiastic');
  const repeated = physicalSocialResult('luiza', 'dance', 'failure', relationship, 4);
  assert.ok(repeated.delta.patience < luiza.delta.patience);
  assert.equal(physicalSocialResult('rafa', 'toast', 'complete', { ...relationship, safety: 30 }).response, 'refuse');
  for (const personaId of ['caio','rafa','bia','luiza']) for (const action of PHYSICAL_ACTIONS) {
    for (const mechanical of action.type === 'instant' ? ['complete'] : ['success','partial','failure']) {
      const social = physicalSocialResult(personaId, action.id, mechanical, relationship);
      assert.ok(Object.values(social.delta).every(value => Number.isInteger(value) && Math.abs(value) <= 10));
    }
  }
});

test('every action has more than ten distinct local lines per successful or failed outcome', () => {
  const catalog = read('physical-lines');
  for (const action of PHYSICAL_ACTIONS) for (const outcome of ['success', 'failure']) {
    assert.ok(catalog[action.id][outcome].length > 10, `${action.id}:${outcome}`);
    assert.equal(new Set(catalog[action.id][outcome]).size, catalog[action.id][outcome].length);
    for (const personaId of ['caio', 'rafa', 'bia', 'luiza']) {
      const extras = catalog.personaExtras[personaId][action.id][outcome];
      const poolSize = catalog[action.id][outcome].length + extras.length;
      const lines = Array.from({ length: poolSize }, (_, repeat) => physicalLine(personaId, action.id, outcome, repeat));
      assert.equal(new Set(lines).size, poolSize, `${personaId}:${action.id}:${outcome}`);
      assert.ok(extras.includes(lines[0]), `${personaId}:${action.id}:${outcome} opens in character`);
    }
  }
});

test('physical status changes are fixed by action and outcome, with a bounded repeat penalty', () => {
  const positive = physicalSocialResult('caio', 'toast', 'complete', relationship);
  const refusal = physicalSocialResult('caio', 'toast', 'complete', { ...relationship, safety: 25 });
  assert.equal(positive.outcome, 'success');
  assert.deepEqual(positive.delta, PHYSICAL_DELTAS.toast.success);
  assert.equal(refusal.outcome, 'failure');
  assert.deepEqual(refusal.delta, PHYSICAL_DELTAS.toast.failure);
  for (const id of ['balance', 'juggle', 'dance']) {
    const result = physicalSocialResult('bia', id, 'partial', relationship);
    assert.deepEqual(result.delta, PHYSICAL_DELTAS[id].partial);
  }
  const repeated = physicalSocialResult('caio', 'toast', 'complete', relationship, 3);
  assert.equal(repeated.delta.patience, PHYSICAL_DELTAS.toast[repeated.outcome].patience - 3);
});

test('director records a bounded physical result for server synchronization and later memory', () => {
  const persona = read('personas').personas.find(item => item.id === 'rafa');
  const director = createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: 'rafa', substance: 'none' }, {
    sessionId: 'physical', seed: 8, catalog: read('events').events, persona, dialogue: read('dialogue')
  });
  director.tick(7.5);
  const before = director.view().session.relationship;
  const result = director.physical('toast', 'complete');
  assert.equal(result.actionId, 'toast');
  assert.notDeepEqual(director.view().session.relationship, before);
  assert.deepEqual(director.view().actions.at(-1), {
    eventId: 'physical', choiceId: `toast:complete:${result.response}`
  });
  assert.match(director.view().summary, /Fazer um brinde/);
  assert.equal(director.view().caption, physicalLine('rafa', 'toast', result.outcome, 0));
  assert.match(director.view().summary, /Use como contexto; só retome se couber/);
  assert.equal(director.view().speechRef, null);
  assert.deepEqual(director.snapshot().actions, director.view().actions);
});

test('all five 3D action scenes complete and return their movable table props', () => {
  const parent = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 1.55, .7);
  parent.add(camera);
  const actor = new THREE.Group();
  actor.position.z = -1.27;
  const head = new THREE.Bone();
  head.position.y = 1.52;
  actor.add(head);
  parent.add(actor);
  const prop = position => {
    const mesh = new THREE.Group();
    mesh.position.fromArray(position);
    parent.add(mesh);
    const body = new CANNON.Body({ mass: .25, shape: new CANNON.Box(new CANNON.Vec3(.05,.05,.05)),
      position: new CANNON.Vec3(...position) });
    return { mesh, body, position, owner: null };
  };
  const props = { cup: prop([-.32,.88,-.17]), plate: prop([.24,.805,-.22]) };
  const results = [];
  const tutorialStore = new Map();
  const storage = { getItem: key => tutorialStore.get(key) ?? null,
    setItem: (key, value) => tutorialStore.set(key, value) };
  const scene = createPhysicalScene(THREE, { parent, camera, date: { actor, bones: { Head: head },
    animation: { gesture() {} } }, props, venueId: 'bistro', audio() {},
  storage,
  complete: (id, mechanical) => { results.push([id, mechanical]); return { response: 'accept' }; } });
  const view = { session: { phase: 'dialogue', matchId: 'bia', relationship }, beat: null,
    canSpeak: true, actions: [], time: 12 };
  for (const id of PHYSICAL_ACTIONS.map(action => action.id)) {
    assert.ok(scene.begin(id, view), id);
    if (scene.state()?.stage === 'tutorial') {
      scene.tick(.5, view);
      assert.equal(scene.state().elapsed, 0, `${id} waits for tutorial confirmation`);
      assert.ok(scene.confirm(), id);
      scene.tick(.5, view);
      assert.equal(scene.state().elapsed, 0, `${id} waits for countdown`);
    }
    let wrongCatch = false;
    let sawSpecificDrop = false;
    for (let i = 0; i < 1000 && scene.state(); i++) {
      parent.updateMatrixWorld(true);
      scene.tick(.016, view);
      const progress = scene.state()?.elapsed ?? Infinity;
      if (id === 'juggle' && !wrongCatch && progress >= 1.30 && progress < 1.33) {
        assert.equal(scene.input('right'), false);
        wrongCatch = true;
      }
      if (id === 'juggle' && wrongCatch && progress > 1.65 && progress < 1.69) {
        const dropped = parent.getObjectByName('juggle-fruit-0');
        const airborne = parent.getObjectByName('juggle-fruit-1');
        assert.ok(dropped.position.y < airborne.position.y, 'the missed fruit falls while the next stays aloft');
        sawSpecificDrop = true;
      }
    }
    if (id === 'juggle') assert.ok(wrongCatch && sawSpecificDrop);
    assert.equal(scene.state(), null, id);
  }
  assert.deepEqual(results.map(([id]) => id), PHYSICAL_ACTIONS.map(action => action.id));
  assert.deepEqual(props.cup.mesh.position.toArray(), props.cup.position);
  assert.deepEqual(props.plate.mesh.position.toArray(), props.plate.position);
  assert.ok(parent.getObjectByName('Physical interaction props'));
});
