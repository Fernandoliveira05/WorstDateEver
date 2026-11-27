// Shared gameplay rules. Scene meshes and input live in venue.js; the server uses
// these same definitions to verify actions before sending them to the LLM.
import physicalLines from '../../content/shared/physical-lines.json' with { type: 'json' };

export const PHYSICAL_ACTIONS = Object.freeze([
  { id: 'toast', label: 'Fazer um brinde', category: 'À mesa', type: 'instant', duration: 3.4, cooldown: 32, requires: ['cup'] },
  { id: 'balance', label: 'Equilibrar o copo', category: 'Impressionar', type: 'balance', duration: 6.2, cooldown: 46, requires: ['cup'] },
  { id: 'juggle', label: 'Fazer malabares', category: 'Impressionar', type: 'timing', duration: 6.4,
    inputWindow: .38, cooldown: 48, requires: ['table'] },
  { id: 'offer_food', label: 'Oferecer comida', category: 'À mesa', type: 'instant', duration: 3.7, cooldown: 35, requires: ['food'] },
  { id: 'eat', label: 'Comer', category: 'À mesa', type: 'instant', duration: 3.2, cooldown: 10, requires: ['food'] },
  { id: 'dance', label: 'Dançar sentado', category: 'Brincar', type: 'rhythm', duration: 7.0,
    inputWindow: .20, cooldown: 43, requires: [] }
]);
export const actionById = id => PHYSICAL_ACTIONS.find(action => action.id === id);
export const actionCategories = Object.freeze([...new Set(PHYSICAL_ACTIONS.map(action => action.category))]);
export const SKILL_UI = Object.freeze({ distance: 1.55, eyeDrop: .49, guideLift: .37 });
export function fixedSkillAnchor(viewer, forward) {
  const horizontal = [forward[0], forward[2]];
  const length = Math.hypot(...horizontal) || 1;
  return [viewer[0] + horizontal[0] / length * SKILL_UI.distance,
    viewer[1] - SKILL_UI.eyeDrop,
    viewer[2] + horizontal[1] / length * SKILL_UI.distance];
}
export const SKILL_BEATS = Object.freeze({
  juggle: Object.freeze([
    { at: 1.30, side: 'left', fruit: 0 }, { at: 2.12, side: 'right', fruit: 1 },
    { at: 2.94, side: 'left', fruit: 2 }, { at: 3.76, side: 'left', fruit: 0 },
    { at: 4.58, side: 'right', fruit: 1 }, { at: 5.40, side: 'right', fruit: 2 }
  ]),
  dance: Object.freeze([
    { at: 1.18, side: 'left', cut: 'up' }, { at: 1.78, side: 'right', cut: 'down' },
    { at: 2.38, side: 'left', cut: 'right' }, { at: 2.98, side: 'right', cut: 'left' },
    { at: 3.58, side: 'left', cut: 'up' }, { at: 4.18, side: 'right', cut: 'down' },
    { at: 4.78, side: 'left', cut: 'left' }, { at: 5.38, side: 'right', cut: 'right' },
    { at: 5.98, side: 'left', cut: 'down' }
  ])
});
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const directions = ['left', 'right'];
const personaIds = ['caio', 'rafa', 'bia', 'luiza'];
export const PHYSICAL_DELTAS = Object.freeze({
  toast: { success: { interest: 8, awkwardness: -5, patience: 3, safety: 4 },
    failure: { interest: -6, awkwardness: 7, patience: -6, safety: -5 } },
  balance: { success: { interest: 7, awkwardness: -4, patience: 2, safety: 2 },
    partial: { interest: 3, awkwardness: 2, patience: -1, safety: 0 },
    failure: { interest: -6, awkwardness: 8, patience: -5, safety: -3 } },
  juggle: { success: { interest: 9, awkwardness: -6, patience: 3, safety: 2 },
    partial: { interest: 3, awkwardness: 2, patience: -1, safety: 0 },
    failure: { interest: -8, awkwardness: 8, patience: -6, safety: -3 } },
  offer_food: { success: { interest: 7, awkwardness: -4, patience: 3, safety: 5 },
    failure: { interest: -6, awkwardness: 6, patience: -5, safety: -5 } },
  eat: { success: { interest: 1, awkwardness: -1, patience: 1, safety: 1 },
    failure: { interest: -1, awkwardness: 1, patience: -2, safety: 0 } },
  dance: { success: { interest: 8, awkwardness: -6, patience: 3, safety: 4 },
    partial: { interest: 3, awkwardness: 2, patience: -1, safety: 0 },
    failure: { interest: -6, awkwardness: 8, patience: -5, safety: -3 } }
});

export function physicalOutcome(actionId, mechanical, response) {
  if (!actionById(actionId) || !['complete', 'success', 'partial', 'failure'].includes(mechanical))
    throw new Error('Invalid interaction result');
  if (mechanical === 'complete') return response === 'refuse' ? 'failure' : 'success';
  return mechanical;
}

export function physicalLine(personaId, actionId, outcome, repeats = 0) {
  if (!personaIds.includes(personaId) || !PHYSICAL_DELTAS[actionId]?.[outcome])
    throw new Error('Invalid interaction line');
  const shared = physicalLines[actionId][outcome] ?? [];
  const specific = physicalLines.personaExtras[personaId][actionId][outcome] ?? [];
  const pool = [...shared, ...specific];
  if (!pool.length) throw new Error('Missing interaction lines');
  const personaIndex = personaIds.indexOf(personaId);
  const actionIndex = PHYSICAL_ACTIONS.findIndex(action => action.id === actionId);
  const offset = specific.length ? shared.length + (personaIndex + actionIndex) % specific.length :
    personaIndex * 3 + actionIndex * 5;
  return pool[(offset + repeats * 5) % pool.length];
}

export function availablePhysicalActions({ phase, event, busy, time, lastUsed = {}, objects = [] }) {
  if (phase !== 'dialogue' || event || busy) return [];
  return PHYSICAL_ACTIONS.filter(action => action.requires.every(item => objects.includes(item)) &&
    time >= (lastUsed[action.id] ?? -Infinity) + action.cooldown);
}

export function createPhysicalChallenge(actionId, overrides = {}) {
  const definition = actionById(actionId);
  if (!definition) throw new Error('Unknown physical interaction');
  const action = Object.keys(overrides).length ? { ...definition, ...overrides } : definition;
  const state = { actionId, elapsed: 0, phase: 'prepare', tilt: 0, tiltY: 0,
    velocity: .06, velocityY: -.035, stableTime: 0, combo: 0, bestCombo: 0,
    taps: [], failures: [], hits: 0, misses: 0, beat: 0, recovered: false, result: null };
  const beats = SKILL_BEATS[actionId] ?? [];
  function miss(index) {
    const beat = beats[index];
    state.misses++;
    state.beat++;
    state.combo = 0;
    state.failures.push({ index, at: state.elapsed, side: beat.side, fruit: beat.fruit ?? null });
  }
  function input(direction, cut = null) {
    if (state.result || state.phase !== 'active' || ![...directions, 'up', 'down'].includes(direction)) return false;
    if (action.type === 'balance') {
      if (direction === 'left' || direction === 'right') state.velocity += direction === 'left' ? -.24 : .24;
      else state.velocityY += direction === 'up' ? -.24 : .24;
      state.recovered ||= Math.hypot(state.tilt, state.tiltY) > .30;
      return true;
    }
    if (!directions.includes(direction) && !['up','down','left','right'].includes(direction)) return false;
    if (!beats.length) return false;
    const index = state.beat;
    if (index >= beats.length) return false;
    const distance = Math.abs(state.elapsed - beats[index].at);
    if (distance > action.inputWindow) return false;
    const isDance = action.type === 'rhythm';
    const valid = isDance ? direction === beats[index].side && cut === beats[index].cut :
      direction === beats[index].side;
    if (!valid) { miss(index); return false; }
    state.hits++;
    state.beat++;
    state.combo++;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.taps.push({ index, side: isDance ? beats[index].side : direction, cut: beats[index].cut ?? null,
      fruit: beats[index].fruit ?? null,
      accuracy: 1 - distance / action.inputWindow,
      grade: distance <= action.inputWindow * .34 ? 'perfect' : 'good', at: state.elapsed });
    return true;
  }
  function steer(x, y, dt) {
    if (action.type !== 'balance' || state.result || state.phase !== 'active') return;
    const step = Math.max(0, Math.min(.05, dt));
    state.velocity += clamp(x, -1, 1) * step * 1.9;
    state.velocityY += clamp(y, -1, 1) * step * 1.9;
    state.recovered ||= Math.hypot(state.tilt, state.tiltY) > .30;
  }
  function tick(dt) {
    if (state.result) return state;
    state.elapsed = Math.min(action.duration, state.elapsed + Math.max(0, dt));
    state.phase = state.elapsed < .85 ? 'prepare' : 'active';
    if (action.type === 'balance' && state.phase === 'active') {
      const disturbance = Math.sin(state.elapsed * 2.15 + .6) * .34 + Math.sin(state.elapsed * 4.9) * .1;
      const disturbanceY = Math.sin(state.elapsed * 2.5 + 2.2) * .25 + Math.sin(state.elapsed * 4.2 + .4) * .08;
      state.velocity += (state.tilt * 1.05 + disturbance) * dt;
      state.velocityY += (state.tiltY * 1.05 + disturbanceY) * dt;
      state.velocity *= Math.exp(-.72 * dt);
      state.velocityY *= Math.exp(-.72 * dt);
      state.tilt += state.velocity * dt;
      state.tiltY += state.velocityY * dt;
      if (Math.hypot(state.tilt, state.tiltY) < .32) state.stableTime += dt;
      if (Math.hypot(state.tilt, state.tiltY) > .68) state.result = 'failure';
    }
    while (beats[state.beat] && state.elapsed > beats[state.beat].at + action.inputWindow) miss(state.beat);
    if (state.elapsed >= action.duration && !state.result) {
      if (action.type === 'instant') state.result = 'complete';
      else if (action.type === 'balance') state.result = state.stableTime >= 3.8 &&
        Math.hypot(state.tilt, state.tiltY) < .30 && !state.recovered ? 'success' : 'partial';
      else state.result = state.hits >= beats.length - (action.type === 'rhythm' ? 1 : 0) ? 'success' :
        state.hits >= Math.ceil(beats.length * .55) ? 'partial' : 'failure';
    }
    return state;
  }
  function cancel() { state.result = 'cancelled'; return state; }
  return { action, state, beats, input, steer, tick, cancel };
}

// Mechanical and social outcomes are deliberately independent. Context can make a
// perfect trick embarrassing or a failed dance endearing.
export function physicalSocialResult(personaId, actionId, mechanical, relationship, repeats = 0) {
  const action = actionById(actionId);
  if (!action || !['complete', 'success', 'partial', 'failure'].includes(mechanical)) throw new Error('Invalid interaction result');
  const preferences = {
    caio: { toast: 1, balance: 0, juggle: 1, offer_food: 1, eat: 1, dance: 0 },
    rafa: { toast: 1, balance: -1, juggle: 0, offer_food: 1, eat: 1, dance: 0 },
    bia: { toast: 0, balance: -1, juggle: -2, offer_food: -1, eat: 0, dance: -1 },
    luiza: { toast: 1, balance: 1, juggle: 1, offer_food: 1, eat: 1, dance: 2 }
  };
  if (!preferences[personaId]) throw new Error('Invalid persona');
  const safe = relationship.safety >= 44 && relationship.patience >= 34;
  const mood = relationship.interest >= 62 ? 1 : relationship.interest <= 33 ? -1 : 0;
  const performance = mechanical === 'success' ? 1 : mechanical === 'failure' ? -1 : 0;
  const social = preferences[personaId][actionId] + mood +
    (actionId === 'dance' && personaId === 'luiza' ? 0 : performance) - Math.min(3, repeats);
  const refusal = !safe || social <= -2;
  const response = refusal ? 'refuse' : social >= 2 ? 'enthusiastic' : social >= 0 ? 'accept' : 'awkward';
  const outcome = physicalOutcome(actionId, mechanical, response);
  const delta = { ...PHYSICAL_DELTAS[actionId][outcome] };
  if (repeats >= 2) delta.patience -= Math.min(3, repeats);
  return { response, outcome,
    delta: Object.fromEntries(Object.entries(delta).map(([key, value]) => [key, clamp(value, -10, 10)])) };
}

export function physicalSummary(actionId, mechanical, social, repeats, personaId) {
  const action = actionById(actionId);
  const result = { complete: 'concluiu', success: 'executou bem', partial: 'quase perdeu o controle, mas terminou',
    failure: 'falhou' }[mechanical];
  const reaction = { enthusiastic: 'entusiasmado', accept: 'receptivo', awkward: 'constrangido', refuse: 'recusou' }[social];
  const said = personaId ? ` O date disse: "${physicalLine(personaId, actionId, physicalOutcome(actionId, mechanical, social), repeats)}".` : '';
  return `O jogador ${result} a ação física "${action.label}". O date reagiu de modo ${reaction}.${said} Tentativa número ${repeats + 1}. Use como contexto; só retome se couber.`;
}
