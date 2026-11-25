import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDateDirector } from '../src/date/director.mjs';
import { createNpcClocks } from '../src/date/npc-clock.js';
import { impactClass, sweptContact } from '../src/date/impact.js';
import { eligibleEvents, evaluateEventOpportunity } from '../src/date/event-core.mjs';
const content = file => JSON.parse(readFileSync(new URL('../content/shared/' + file + '.json', import.meta.url)));
const fastEvents = { firstEventMinSeconds: 0, firstEventMaxSeconds: 0, checkMinSeconds: 1,
  checkMaxSeconds: 1, opportunityChance: 1, minimumGapSeconds: 0, maximumEvents: 6 };
function setup() {
  return createDateDirector({ schemaVersion:1, phase:'exit', avatarGender:'female',
    preference:'all', matchId:'rafa', substance:'none' }, {
    sessionId:'test', seed:1, catalog:content('events').events,
    persona:content('personas').personas.find(person=>person.id==='rafa'),
    dialogue:content('dialogue'), reactions:content('date-reactions'), eventConfig: fastEvents
  });
}

test('event clock pauses for speech and times out into a bounded response', () => {
  const date = setup();
  date.tick(7.5);
  assert.ok(date.choose('honest'));
  const response = date.view().caption;
  assert.equal(date.view().choices.length, 0);
  date.tick(5.4);
  assert.equal(date.view().caption, response);
  assert.equal(date.view().beat, undefined);
  date.tick(.2);
  assert.ok(date.choose('joke'));
  date.tick(55);
  assert.equal(date.view().beat.phase, 'announce');
  date.tick(3.3);
  const before = date.view();
  assert.equal(before.beat.phase,'choice_window');
  assert.equal(before.canSpeak, true);
  date.tick(20,false);
  assert.equal(date.view().beat.phase,'choice_window');
  date.tick(30);
  assert.ok(date.view().session.completedEventIds.length);
});
test('impact strength, cooldown and boundaries affect the date result', () => {
  assert.equal(impactClass(.3),null);
  assert.equal(impactClass(2.1),'impact_light');
  assert.equal(impactClass(5),'impact_hard');
  const from = new THREE.Vector3(-.4,0,.06);
  const to = new THREE.Vector3(.4,0,.06);
  assert.ok(sweptContact(THREE,from,to,new THREE.Vector3(),.1));
  const date = setup();
  date.tick(7.5);
  assert.ok(date.choose('middle_finger'));
  assert.equal(date.view().session.relationship.interest,45);
  assert.equal(date.react('impact_hard',5,1),false);
  for (let i=0;i<6;i++) {
    date.tick(.75,false);
    date.react('impact_hard',5,1);
  }
  assert.equal(date.view().result,'disaster');
  assert.equal(date.view().session.phase,'ending');
});
test('NPC needs and clocks vary by role and stay reproducible', () => {
  const one = createNpcClocks(919), two = createNpcClocks(919);
  for (let time=0;time<80;time++) {
    const a=one(time), b=two(time);
    assert.deepEqual(a,b);
    assert.equal(new Set(a.map(x=>x.need)).size,5);
    assert.ok(a.every(x=>x.level>=0&&x.level<=1&&x.remaining>=0));
  }
  assert.notDeepEqual(createNpcClocks(1)(8),createNpcClocks(2)(8));
});

test('free conversation is primary and can resolve a concrete event action', () => {
  const date = setup();
  date.tick(7.5);
  assert.equal(date.view().choices.length, 0);
  assert.equal(date.view().fallbackChoices.length, 3);
  assert.ok(date.remote(0, { text: 'Também fiquei nervoso. E você?', gesture: 'nod',
    relationshipDelta: { interest: 2, awkwardness: -1, patience: 0, safety: 0 } }));
  assert.equal(date.view().session.relationship.interest, 52);
  date.tick(65);
  date.tick(3.3);
  const event = date.view().beat;
  assert.equal(event.phase, 'choice_window');
  assert.ok(date.view().canSpeak);
  assert.ok(date.remote(1, { text: 'Boa, você ajudou sem fazer cena.', gesture: 'nod',
    eventActionId: event.definition.choices[0].id,
    relationshipDelta: { interest: 1, awkwardness: 0, patience: 0, safety: 0 } }));
  assert.deepEqual(date.view().session.completedEventIds, [event.definition.id]);
});

test('event opportunities respect context, rarity gates and repetition prevention', () => {
  const catalog = content('events').events;
  const rafa = eligibleEvents({ catalog, venueId: 'sushi', personaId: 'rafa', time: 90, talkTurns: 2,
    relationship: { interest: 50, awkwardness: 20, patience: 70, safety: 100 } });
  assert.ok(rafa.some(event => event.id === 'wrong_order'));
  assert.ok(!rafa.some(event => event.id === 'bathroom_mishap'));
  const config = { ...fastEvents, minimumGapSeconds: 90, opportunityChance: 1 };
  assert.equal(evaluateEventOpportunity({ catalog, venueId: 'sushi', personaId: 'rafa', time: 100,
    talkTurns: 3, relationship: {}, lastEventAt: 40, rand: () => 0, config }), null);
  const only = catalog.filter(event => event.id === 'dropped_menu');
  assert.equal(evaluateEventOpportunity({ catalog: only, venueId: 'sushi', personaId: 'rafa', time: 160,
    talkTurns: 3, relationship: {}, completed: [], lastEventAt: 40, rand: () => 0, config }).id, 'dropped_menu');
  assert.equal(evaluateEventOpportunity({ catalog: only, venueId: 'sushi', personaId: 'rafa', time: 300,
    talkTurns: 4, relationship: {}, completed: ['dropped_menu'], lastEventAt: 100, rand: () => 0, config }), null);
});
