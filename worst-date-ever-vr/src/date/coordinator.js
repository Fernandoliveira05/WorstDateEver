import reactions from '../../content/shared/date-reactions.json';
import venues from '../../content/shared/venues.json';
import personas from '../../content/shared/personas.json';
import events from '../../content/shared/events.json';
import dialogue from '../../content/shared/dialogue.json';
import { createDateDirector } from './director.mjs';
import { validateSceneHandoff } from './session-core.mjs';
import { createVenue } from './venue.js';
import { createDateVoice } from './voice.js';

const draftKey = 'worst-date-ever-first-date-progress-v1';

export function createDateCoordinator(THREE, io) {
  const fade = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({
    color: 0x160f1a, depthTest: false, depthWrite: false, transparent: true, opacity: 0, toneMapped: false
  }));
  fade.position.z = -.19;
  fade.renderOrder = 10000;
  fade.visible = false;
  fade.frustumCulled = false;
  io.camera.add(fade);
  let stage;
  let director;
  let voice;
  let pending;
  let cut;
  let saved = false;
  let attempt;
  let previousCheckpoint;

  function handoff(state) {
    const { schemaVersion, phase, avatarGender, preference, matchId, substance, profileIndex } = state;
    return { schemaVersion, phase, avatarGender, preference, matchId, substance, profileIndex,
      ...(state.candy ? { candy: state.candy } : {}) };
  }

  async function start(state) {
    if (stage || pending || cut) return;
    const payload = handoff(state);
    if (!validateSceneHandoff(payload)) {
      io.show('Não foi possível abrir o encontro. Você pode recomeçar pelo celular.');
      return;
    }
    const operation = Symbol();
    pending = operation;
    try {
      const persona = personas.personas.find(person => person.id === payload.matchId);
      const venue = venues.venues.find(item => item.matchId === payload.matchId);
      const key = [payload.matchId, payload.avatarGender, payload.preference, payload.substance];
      attempt = (payload.candy ? [...key, payload.candy] : key).join(':');
      let checkpoint;
      try {
        const draft = JSON.parse(localStorage.getItem(draftKey));
        if (draft?.attempt === attempt && Number.isInteger(draft.snapshot?.session?.eventSeed)) checkpoint = draft.snapshot;
      } catch { /* Private browsing can disable local storage. */ }
      director = createDateDirector(payload, { sessionId: crypto.randomUUID?.() ?? String(Date.now()),
        seed: checkpoint?.session.eventSeed ?? Math.floor(Math.random() * 0x7fffffff),
        catalog: events.events, persona, dialogue, reactions, checkpoint });
      voice = createDateVoice({ handoff: payload, director, observe: () => stage?.observe() });
      const ready = await createVenue(THREE, { ...io, venue, persona, voice, candy: payload.candy, restart, recenter, react: (...args) => director.react(...args) });
      if (pending !== operation) { ready.dispose(); return; }
      saved = false;
      previousCheckpoint = null;
      cut = { time: 0, preview: ready, swap: () => {
        stage = ready;
        io.change(stage.group);
        recenter();
        // Place actors and presence-dependent props before the first visible frame.
        stage.tick(0, director.view());
      } };
    } catch (error) {
      if (pending === operation) {
        console.error('Primeiro encontro', error);
        io.show('O salão não abriu. Tente partir outra vez pelo celular.');
      }
    } finally { if (pending === operation) pending = null; }
  }

  function cancelStart() {
    pending = null;
    if (!stage) {
      try { localStorage.removeItem(draftKey); } catch { /* The offer still works without storage. */ }
    }
    if (!stage && cut?.preview) {
      cut.preview.dispose();
      cut = null;
      fade.visible = false;
    }
  }

  function recenter() {
    if (stage) io.seat(stage.player, stage.seatHeight);
  }

  function restart() {
    if (!stage || cut) return;
    voice.cancel();
    cut = { time: 0, swap: () => {
      stage.dispose();
      stage = null;
      io.change(null);
      io.reset();
    } };
  }

  function tick(dt) {
    if (cut) {
      const old = cut.time;
      cut.time += dt;
      if (old < .30 && cut.time >= .30) cut.swap();
      fade.visible = cut.time < .61;
      fade.material.opacity = Math.max(0, Math.min(1, 1 - Math.abs(cut.time - .30) / .30));
      if (!fade.visible) cut = null;
    }
    if (stage && !cut) {
      director.tick(dt, !voice.state().busy);
      const view = director.view();
      if (!view.canSpeak && voice.state().busy) voice.cancel();
      if (view.wantsInitiative && voice.state().ready && !voice.state().busy) {
        director.deferInitiative(10);
        voice.initiate();
      }
      stage.tick(dt, view);
      const key = [view.session.phase, view.session.turnSequence, view.beat?.phase, view.session.activeEventId,
        view.session.completedEventIds.length, view.revision].join(':');
      if (key !== previousCheckpoint) {
        previousCheckpoint = key;
        try { localStorage.setItem(draftKey, JSON.stringify({ attempt, snapshot: director.snapshot() })); }
        catch { /* Play continues if local storage is unavailable. */ }
      }
      if (view.session.phase === 'completed' && !saved) {
        saved = true;
        try {
          localStorage.setItem('worst-date-ever-first-date-result-v1', JSON.stringify({
            schemaVersion: 1, outcome: view.result, session: view.session
          }));
        } catch { /* Storage can be unavailable in a private session. */ }
      }
    }
  }

  return { start, cancelStart, tick, recenter, react: (...args) => director?.react(...args), active: () => stage, voice: () => voice, getView: () => stage && director.view() };
}
