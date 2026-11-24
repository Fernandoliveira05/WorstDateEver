import test from 'node:test';
import assert from 'node:assert/strict';
import { PHASES, initialState, transition, validateSave } from '../src/game-machine.mjs';
import { eligibleProfiles } from '../src/profiles.mjs';

const step = (state, type, value) => transition(state, { type, value });

test('new game begins before any personal data is chosen', () => {
  assert.equal(initialState().phase, PHASES.INTRO);
  assert.equal(initialState().avatarGender, null);
});

test('gender is separate from preference; a female player can match a woman', () => {
  let state = step(initialState(), 'START');
  state = step(state, 'CHOOSE_AVATAR', 'female');
  state = step(state, 'CHOOSE_PREFERENCE', 'women');
  assert.equal(state.phase, PHASES.BROWSE);
  assert.equal(eligibleProfiles(state.preference).length, 2);
  state = step(state, 'LIKE_PROFILE');
  assert.equal(state.matchId, 'bia');
  assert.equal(state.phase, PHASES.MATCH);
});

test('all preference provides exactly four distinct date archetypes', () => {
  const values = eligibleProfiles('all');
  assert.equal(values.length, 4);
  assert.equal(new Set(values.map(p => p.archetype)).size, 4);
});

test('profile skip wraps in a filtered deck', () => {
  let s = step(step(step(initialState(), 'START'), 'CHOOSE_AVATAR', 'male'), 'CHOOSE_PREFERENCE', 'men');
  s = step(s, 'SKIP_PROFILE');
  assert.equal(s.profileIndex, 1);
  s = step(s, 'SKIP_PROFILE');
  assert.equal(s.profileIndex, 0);
});

test('DMT routes to a bedroom-only ending rather than the date handoff', () => {
  let s = initialState();
  for (const [action, value] of [
    ['START'], ['CHOOSE_AVATAR', 'male'], ['CHOOSE_PREFERENCE', 'all'],
    ['LIKE_PROFILE'], ['ADVANCE_TIME'], ['FEEL_ANXIOUS'], ['CHOOSE_SUBSTANCE', 'dmt']
  ]) s = step(s, action, value);
  assert.equal(s.phase, PHASES.AFTERMATH);
  assert.equal(s.substance, 'dmt');
  assert.ok(validateSave(s));
});

test('none and alcohol route to next-scene handoff; invalid actions do not mutate', () => {
  let s = initialState();
  assert.equal(step(s, 'LIKE_PROFILE'), s);
  for (const [action, value] of [
    ['START'], ['CHOOSE_AVATAR', 'female'], ['CHOOSE_PREFERENCE', 'all'],
    ['LIKE_PROFILE'], ['ADVANCE_TIME'], ['FEEL_ANXIOUS'], ['CHOOSE_SUBSTANCE', 'alcohol']
  ]) s = step(s, action, value);
  assert.equal(s.phase, PHASES.EXIT);
  assert.ok(validateSave(s));
  assert.equal(step(s, 'CHOOSE_SUBSTANCE', 'none'), s);
  assert.deepEqual(step(s, 'RESET'), initialState());
});

test('malformed saves are not accepted', () => {
  assert.equal(validateSave(null), false);
  assert.equal(validateSave({ ...initialState(), phase: 'unknown' }), false);
  assert.equal(validateSave({ ...initialState(), phase: PHASES.MATCH, matchId: null }), false);
  assert.equal(validateSave({ ...initialState(), profileIndex: -1 }), false);
});
