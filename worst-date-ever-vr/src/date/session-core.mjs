// Shared reference behavior for feature 002 (does NOT render the VR scene).
// Unity implements the same transitions using the JSON contracts and test fixtures.
import { eligibleProfiles } from '../profiles.mjs';

const VENUES = Object.freeze({caio:'cafe', rafa:'sushi', bia:'bistro', luiza:'bar'});
const SUPPORTED_SUBSTANCES = new Set(['none', 'weed', 'lsd', 'alcohol']);
export const INITIAL_RELATIONSHIP = Object.freeze({ interest: 42, awkwardness: 24, patience: 58, safety: 65 });
export const SPEECH_IMPACT = Object.freeze({ min: 5, multiplier: 3, bonus: 2, max: 10 });

export function validateSceneHandoff(state) {
  return Boolean(state && state.schemaVersion === 1 && state.phase === 'exit' &&
    ['male','female'].includes(state.avatarGender) &&
    ['men','women','all'].includes(state.preference) &&
    Object.hasOwn(VENUES, state.matchId) && SUPPORTED_SUBSTANCES.has(state.substance) &&
    (state.profileIndex === undefined || (Number.isInteger(state.profileIndex) && state.profileIndex >= 0)) &&
    eligibleProfiles(state.preference).some(p => p.id === state.matchId));
}

export function createDateSession(handoff, sessionId, eventSeed = 1) {
  if (!validateSceneHandoff(handoff)) throw new Error('Invalid bedroom-to-date handoff');
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('sessionId required');
  if (!Number.isInteger(eventSeed)) throw new Error('eventSeed must be integer');
  return {
    schemaVersion: 1, sessionId, matchId: handoff.matchId, venueId: VENUES[handoff.matchId],
    phase: 'waiting', arrivalState: 'not_started', eventSeed,
    turnSequence: 0, activeEventId: null, completedEventIds: [],
    relationship: { ...INITIAL_RELATIONSHIP }
  };
}

const TRANSITIONS = Object.freeze({
  waiting:{DATE_ENTERS:['arriving','approaching']},
  arriving:{DATE_REACHES_TABLE:['greeting','greeting']},
  greeting:{DATE_STARTS_SITTING:['seating','sitting']},
  seating:{DATE_SEATED:['dialogue','seated']},
  dialogue:{DATE_FINISHES:['ending','seated']},
  ending:{END_COMPLETE:['completed','seated']}
});

export function advanceDatePhase(session, action) {
  const step = TRANSITIONS[session.phase]?.[action];
  if (!step) return session;
  return {...session, phase:step[0], arrivalState:step[1]};
}

export function applyApprovedDelta(session, delta = {}) {
  const result = {...session.relationship};
  for (const key of Object.keys(result)) {
    const raw = delta[key] ?? 0;
    if (!Number.isInteger(raw) || raw < -10 || raw > 10) throw new Error(`Invalid relationship delta: ${key}`);
    result[key] = Math.max(0, Math.min(100, result[key] + raw));
  }
  return {...session,relationship:result};
}

export function evaluateReplyTone({ text = '', intent = 'smalltalk', emotion = 'neutral' } = {}) {
  const line = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (intent === 'end_date' || intent === 'boundary' ||
    /\b(?:nao gostei|pare com isso|chega|vou embora|nao quero continuar|me incomoda|me desrespeitou|foi rude|nao foi legal)\b/.test(line))
    return 'negative';
  if (/\b(?:gostei|adorei|que bom|me conta mais|quero saber mais|isso e legal|engracad[oa]|divertid[oa])\b/.test(line))
    return 'positive';
  if (/\b(?:constrangid[oa]|sem graca|estranh[oa]|desconfortavel)\b/.test(line)) return 'uneasy';
  if (emotion === 'annoyed') return 'negative';
  if (emotion === 'warm' || emotion === 'curious') return 'positive';
  if (emotion === 'awkward' || emotion === 'embarrassed') return 'uneasy';
  return 'neutral';
}

export function speechRelationshipDelta(relationship, proposed = {}, context = {}) {
  const { initiative = false } = context;
  const keys = ['interest', 'awkwardness', 'patience', 'safety'];
  if (initiative) return { interest: 0, awkwardness: 0, patience: 0, safety: 0 };
  const tone = evaluateReplyTone(context);
  const delta = Object.fromEntries(keys.map(key => [key,
    Math.max(-SPEECH_IMPACT.max, Math.min(SPEECH_IMPACT.max,
      Number.isInteger(proposed?.[key]) && proposed[key] !== 0 ?
        Math.sign(proposed[key]) * Math.max(SPEECH_IMPACT.min,
          Math.min(SPEECH_IMPACT.max, Math.abs(proposed[key]) * SPEECH_IMPACT.multiplier + SPEECH_IMPACT.bonus)) : 0))]));
  if (tone === 'positive') {
    delta.interest = Math.max(6, delta.interest);
    delta.awkwardness = Math.min(-4, delta.awkwardness);
    delta.patience = Math.max(4, delta.patience);
    delta.safety = Math.max(4, delta.safety);
  } else if (tone === 'negative') {
    delta.interest = Math.min(-7, delta.interest);
    delta.awkwardness = Math.max(6, delta.awkwardness);
    delta.patience = Math.min(-7, delta.patience);
    delta.safety = Math.min(context.intent === 'boundary' ? -9 : -5, delta.safety);
  } else if (tone === 'uneasy') {
    delta.interest = Math.min(-4, delta.interest);
    delta.awkwardness = Math.max(6, delta.awkwardness);
    delta.patience = Math.min(-4, delta.patience);
    delta.safety = Math.min(-4, delta.safety);
  }
  if (keys.some(key => Math.max(0, Math.min(100, relationship[key] + delta[key])) !== relationship[key]))
    return delta;

  const preferences = tone === 'negative' ?
    [['patience', -4], ['safety', -3], ['interest', -4], ['awkwardness', 3]] :
    tone === 'uneasy' ?
      [['awkwardness', 4], ['patience', -2], ['interest', -2]] :
      [['interest', 3], ['awkwardness', -2], ['patience', 2]];
  for (const [key, amount] of [...preferences,
    ['interest', 2], ['interest', -2], ['awkwardness', 2], ['awkwardness', -2],
    ['patience', 2], ['patience', -2], ['safety', 2], ['safety', -2]]) {
    if (relationship[key] + amount < 0 || relationship[key] + amount > 100) continue;
    return { interest: 0, awkwardness: 0, patience: 0, safety: 0, [key]: amount };
  }
  return delta;
}

export const venueForMatch = matchId => VENUES[matchId] ?? null;
