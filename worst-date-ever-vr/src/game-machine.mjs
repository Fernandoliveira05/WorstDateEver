import { candyById } from './candies.mjs';
import { eligibleProfiles } from './profiles.mjs';

export const STORAGE_KEY = 'worst-date-ever-vr-bedroom-v1';
export const PHASES = Object.freeze({
  INTRO: 'intro', IDENTITY: 'identity', PREFERENCE: 'preference',
  BROWSE: 'browse', MATCH: 'match', WAIT: 'wait', PREP: 'prep',
  EXIT: 'exit', AFTERMATH: 'aftermath'
});
const ALLOWED_SUBSTANCES = ['none', 'weed', 'lsd', 'alcohol', 'dmt'];

export function initialState() {
  return {
    schemaVersion: 1, phase: PHASES.INTRO, avatarGender: null,
    preference: null, profileIndex: 0, matchId: null, substance: null, candy: null
  };
}

export function transition(state, action) {
  const next = { ...state };
  switch (action.type) {
    case 'START':
      if (state.phase !== PHASES.INTRO) return state;
      next.phase = PHASES.IDENTITY;
      break;
    case 'CHOOSE_AVATAR':
      if (state.phase !== PHASES.IDENTITY || !['male', 'female'].includes(action.value)) return state;
      next.avatarGender = action.value;
      next.phase = PHASES.PREFERENCE;
      break;
    case 'CHOOSE_PREFERENCE':
      if (state.phase !== PHASES.PREFERENCE || !['men', 'women', 'all'].includes(action.value)) return state;
      next.preference = action.value;
      next.profileIndex = 0;
      next.phase = PHASES.BROWSE;
      break;
    case 'SKIP_PROFILE': {
      if (state.phase !== PHASES.BROWSE) return state;
      const count = eligibleProfiles(state.preference).length;
      next.profileIndex = (state.profileIndex + 1) % count;
      break;
    }
    case 'LIKE_PROFILE': {
      if (state.phase !== PHASES.BROWSE) return state;
      const candidates = eligibleProfiles(state.preference);
      const selected = candidates[state.profileIndex];
      if (!selected) return state;
      next.matchId = selected.id;
      next.phase = PHASES.MATCH;
      break;
    }
    case 'ADVANCE_TIME':
      if (state.phase !== PHASES.MATCH) return state;
      next.phase = PHASES.WAIT;
      break;
    case 'FEEL_ANXIOUS':
      if (state.phase !== PHASES.WAIT) return state;
      next.phase = PHASES.PREP;
      break;
    case 'CHOOSE_SUBSTANCE':
      if (state.phase !== PHASES.PREP || !ALLOWED_SUBSTANCES.includes(action.value)) return state;
      next.substance = action.value;
      next.phase = action.value === 'dmt' ? PHASES.AFTERMATH : PHASES.EXIT;
      break;
    case 'EAT_CANDY':
      if (state.candy || state.phase === PHASES.AFTERMATH || !candyById(action.value)) return state;
      next.candy = action.value;
      break;
    case 'RESET':
      return initialState();
    default:
      return state;
  }
  return next;
}

export function validateSave(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== 1) return false;
  if (!Object.values(PHASES).includes(value.phase)) return false;
  if (![null, 'male', 'female'].includes(value.avatarGender)) return false;
  if (![null, 'men', 'women', 'all'].includes(value.preference)) return false;
  if (!Number.isInteger(value.profileIndex) || value.profileIndex < 0) return false;
  if (value.candy != null && !candyById(value.candy)) return false;
  if (![null, ...ALLOWED_SUBSTANCES].includes(value.substance)) return false;
  if (value.matchId !== null && !eligibleProfiles('all').some(p => p.id === value.matchId)) return false;
  if (value.phase === PHASES.BROWSE && value.profileIndex >= eligibleProfiles(value.preference).length) return false;
  if (![PHASES.INTRO, PHASES.IDENTITY, PHASES.PREFERENCE, PHASES.BROWSE].includes(value.phase) && !value.matchId) return false;
  return true;
}
