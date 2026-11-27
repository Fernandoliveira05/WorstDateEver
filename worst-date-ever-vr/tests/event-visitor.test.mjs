import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDateDirector } from '../src/date/director.mjs';
import { FRIEND_VISIT, friendVisitMotion } from '../src/date/event-visitor.mjs';

const content = name => JSON.parse(readFileSync(new URL('../content/shared/' + name + '.json', import.meta.url)));

test('the visitor reaches the table before choices open and walks away after a response', () => {
  const persona = content('personas').personas.find(item => item.id === 'caio');
  const event = content('events').events.find(item => item.id === 'awkward_friend');
  const director = createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: persona.id, substance: 'none' }, {
    sessionId: 'visitor', seed: 7, catalog: [event], persona, dialogue: content('dialogue'),
    eventConfig: { firstEventMinSeconds: 0, firstEventMaxSeconds: 0,
      checkMinSeconds: 1, checkMaxSeconds: 1, opportunityChance: 1, minimumGapSeconds: 0, maximumEvents: 1 }
  });
  director.tick(7.5);
  assert.ok(director.choose('honest'));
  director.tick(5.6);
  assert.ok(director.choose('honest'));
  director.tick(80);
  assert.equal(director.view().beat.phase, 'announce');
  assert.match(director.view().caption, /reconhece Caio/);
  director.tick(FRIEND_VISIT.arrivalSeconds - .1);
  assert.equal(director.view().beat.phase, 'animate');
  assert.equal(director.view().choices.length, 0);
  assert.equal(director.choose('introduce'), false);
  assert.ok(friendVisitMotion(director.view().beat, director.view().time).progress < 1);
  director.tick(.3);
  assert.equal(director.view().beat.phase, 'choice_window');
  assert.equal(friendVisitMotion(director.view().beat, director.view().time).progress, 1);
  assert.ok(director.choose('introduce'));
  director.tick(.5);
  assert.equal(friendVisitMotion(director.view().beat, director.view().time).visible, true);
  director.tick(FRIEND_VISIT.introductionHoldSeconds + FRIEND_VISIT.exitSeconds);
  assert.equal(friendVisitMotion(director.view().beat, director.view().time).visible, false);
  const route = FRIEND_VISIT.route;
  const length = route.slice(1).reduce((sum, point, index) =>
    sum + Math.hypot(point[0] - route[index][0], point[2] - route[index][2]), 0);
  assert.ok(length / FRIEND_VISIT.arrivalSeconds < 1.7);
});
