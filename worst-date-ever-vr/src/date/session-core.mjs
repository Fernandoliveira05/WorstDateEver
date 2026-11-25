// Shared reference behavior for feature 002 (does NOT render the VR scene).
// Unity implements the same transitions using the JSON contracts and test fixtures.
import { candyById } from '../candies.mjs';
import { eligibleProfiles } from '../profiles.mjs';

const VENUES = Object.freeze({caio:'cafe', rafa:'sushi', bia:'bistro', luiza:'bar'});
const SUPPORTED_SUBSTANCES = new Set(['none', 'weed', 'lsd', 'alcohol']);

export function validateSceneHandoff(state) {
  return Boolean(state && state.schemaVersion === 1 && state.phase === 'exit' &&
    ['male','female'].includes(state.avatarGender) &&
    ['men','women','all'].includes(state.preference) &&
    Object.hasOwn(VENUES, state.matchId) && SUPPORTED_SUBSTANCES.has(state.substance) &&
    (state.profileIndex === undefined || (Number.isInteger(state.profileIndex) && state.profileIndex >= 0)) &&
    (state.candy == null || candyById(state.candy)) &&
    eligibleProfiles(state.preference).some(p => p.id === state.matchId));
}

export function createDateSession(handoff, sessionId, eventSeed = 1) {
  if (!validateSceneHandoff(handoff)) throw new Error('Invalid bedroom-to-date handoff');
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('sessionId required');
  if (!Number.isInteger(eventSeed)) throw new Error('eventSeed must be integer');
  return {
    schemaVersion: 1, sessionId, matchId: handoff.matchId, venueId: VENUES[handoff.matchId],
    ...(handoff.candy ? { candy: handoff.candy } : {}),
    phase: 'waiting', arrivalState: 'not_started', eventSeed,
    turnSequence: 0, activeEventId: null, completedEventIds: [],
    relationship: {interest:50,awkwardness:20,patience:70,safety:100}
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

export const venueForMatch = matchId => VENUES[matchId] ?? null;
