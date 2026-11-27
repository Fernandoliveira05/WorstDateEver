import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createDateDirector } from '../src/date/director.mjs';
import { evaluateReplyTone, speechRelationshipDelta } from '../src/date/session-core.mjs';
import { createNpcClocks } from '../src/date/npc-clock.js';
import { createNpcAnimation } from '../src/date/npc-animation.js';
import { impactClass, sweptContact } from '../src/date/impact.js';
import { eligibleEvents, evaluateEventOpportunity } from '../src/date/event-core.mjs';
import { eventFeedback } from '../src/date/event-feedback.mjs';
import { eventArcPlacement } from '../src/date/event-presentation.mjs';
import { QTE_CONFIG, QTE_MENU, qteConfig, qteMenuAnchor, qteMenuSlots, qteWorldDelta } from '../src/date/qte.mjs';
const content = file => JSON.parse(readFileSync(new URL('../content/shared/' + file + '.json', import.meta.url)));
const fastEvents = { firstEventMinSeconds: 0, firstEventMaxSeconds: 0, checkMinSeconds: 1,
  checkMaxSeconds: 1, opportunityChance: 1, minimumGapSeconds: 0, maximumEvents: 6 };
function setup(checkpoint, catalog = content('events').events) {
  return createDateDirector({ schemaVersion:1, phase:'exit', avatarGender:'female',
    preference:'all', matchId:'rafa', substance:'none' }, {
    sessionId:'test', seed:1, catalog,
    persona:content('personas').personas.find(person=>person.id==='rafa'),
    dialogue:content('dialogue'), reactions:content('date-reactions'), eventConfig: fastEvents, checkpoint
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

test('fallen menu offers an immediate choice, reacts to pickup, and changes the relationship', () => {
  const event = content('events').events.find(item => item.id === 'dropped_menu');
  const makeDate = () => createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: 'rafa', substance: 'none' }, {
    sessionId: 'fallen-menu', seed: 1, catalog: [event],
    persona: content('personas').personas.find(person => person.id === 'rafa'),
    dialogue: content('dialogue'), eventConfig: fastEvents
  });
  const date = makeDate();
  date.tick(7.5);
  assert.ok(date.choose('honest'));
  date.tick(65);
  assert.equal(date.view().beat.definition.id, 'dropped_menu');
  date.tick(1.3);
  assert.equal(date.view().beat.phase, 'qte');
  assert.deepEqual(date.view().choices.map(choice => choice.id), ['grab', 'ignore']);
  assert.deepEqual(eventArcPlacement(date.view().beat), { drop: 0, forward: 0 });
  const before = { ...date.view().session.relationship };
  assert.ok(date.choose('grab'));
  assert.equal(date.view().beat.phase, 'resolve');
  assert.equal(date.view().session.relationship.interest, before.interest + 5);
  assert.equal(date.view().session.relationship.awkwardness, before.awkwardness - 3);
  assert.match(date.view().caption, /chegou primeiro/);
  assert.match(date.view().summary, /pegou o cardápio/);

  const ignored = makeDate();
  ignored.tick(7.5); ignored.choose('honest'); ignored.tick(65); ignored.tick(3.3);
  const interest = ignored.view().session.relationship.interest;
  ignored.tick(5.1);
  assert.equal(ignored.view().session.relationship.interest, interest - 3);
  assert.match(ignored.view().caption, /deixar o cardápio/);
});

test('water spill QTE keeps a real five-second deadline while the world runs at 15 percent', () => {
  const water = content('events').events.find(item => item.id === 'water_spill');
  const makeDate = checkpoint => createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: 'bia', substance: 'none' }, {
    sessionId: 'water-qte', seed: 3, catalog: [water],
    persona: content('personas').personas.find(person => person.id === 'bia'),
    dialogue: content('dialogue'), eventConfig: fastEvents, checkpoint
  });
  const date = makeDate();
  date.tick(7.5); date.choose('honest'); date.tick(65);
  assert.equal(date.view().beat.phase, 'qte');
  assert.ok(qteConfig('dropped_menu'));
  assert.equal(qteConfig('wrong_order'), null);
  assert.equal(date.view().qte.remaining, 5);
  assert.equal(date.view().canSpeak, false);
  assert.deepEqual(date.view().choices.map(choice => choice.id), ['help', 'protect', 'ignore']);
  const worldBefore = date.view().time;
  date.tick(1);
  assert.ok(Math.abs(date.view().time - worldBefore - .15) < 1e-9);
  assert.equal(date.view().worldDelta, .15);
  assert.equal(date.view().qte.remaining, 4);
  const resumed = makeDate(date.snapshot());
  assert.equal(resumed.view().qte.remaining, 4);
  resumed.tick(2, false);
  assert.equal(resumed.view().qte.remaining, 2);
  const awkwardnessBefore = date.view().session.relationship.awkwardness;
  date.tick(4.1);
  assert.equal(date.view().beat.choiceId, 'ignore');
  assert.equal(date.view().beat.phase, 'resolve');
  assert.equal(date.view().qteReactionPending, true);
  assert.match(date.view().summary, /água respingou/);
  assert.equal(date.view().session.relationship.awkwardness, awkwardnessBefore + 5);
  assert.ok(qteWorldDelta(date.view().beat, qteConfig('water_spill').recovery, 1) > .15);
  assert.ok(qteWorldDelta(date.view().beat, qteConfig('water_spill').recovery, 6) > 5);
  const chosen = makeDate();
  chosen.tick(7.5); chosen.choose('honest'); chosen.tick(65);
  assert.ok(chosen.choose('protect'));
  assert.match(chosen.view().caption, /Você pensou em mim/);
  assert.match(chosen.view().summary, /protegeu o date/);
});

test('immediate events share the same colored QTE focus and reachable choices', () => {
  assert.deepEqual(Object.keys(QTE_CONFIG).sort(), ['bathroom_mishap','dropped_menu','water_spill']);
  assert.equal(new Set(Object.values(QTE_CONFIG).map(config => config.color)).size, 3);
  for (const config of Object.values(QTE_CONFIG)) {
    assert.equal(config.duration, 5);
    assert.equal(config.worldSpeed, .15);
    assert.ok(config.color > 0);
    assert.equal(config.focus.length, 3);
  }
  const player = [0, 1.6, .7];
  const bathroom = qteMenuAnchor(QTE_CONFIG.bathroom_mishap.focus, player);
  assert.ok(Math.abs(Math.hypot(bathroom[0] - player[0], bathroom[2] - player[2]) - QTE_MENU.distance) < 1e-9);
  assert.equal(bathroom[1], player[1] - QTE_MENU.eyeDrop);
  assert.ok(bathroom[2] < player[2] - 1.2);
  const menu = qteMenuAnchor(QTE_CONFIG.dropped_menu.focus, player);
  assert.ok(menu[1] < player[1] && menu[2] < player[2]);
  for (const count of [1,2,3]) {
    const slots = qteMenuSlots(count);
    assert.equal(slots.length, count);
    assert.ok(slots.every(slot => menu[1] + slot.y + .09 < player[1] - .2));
    assert.ok(slots.every((slot, index) => index === 0 || slot.x - slots[index-1].x >= .55));
  }
  const event = content('events').events.find(item => item.id === 'bathroom_mishap');
  const date = createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: 'bia', substance: 'none' }, {
    sessionId: 'bathroom-qte', seed: 2, catalog: [event],
    persona: content('personas').personas.find(person => person.id === 'bia'),
    dialogue: content('dialogue'), eventConfig: fastEvents
  });
  date.tick(7.5); date.choose('honest'); date.tick(5.6); date.choose('honest'); date.tick(80);
  assert.equal(date.view().beat.phase, 'qte');
  assert.deepEqual(date.view().choices.map(choice => choice.id), ['help', 'ignore']);
  assert.ok(date.choose('help'));
  assert.equal(date.view().qteReactionPending, true);
  assert.ok(date.markQteReacted());
  assert.equal(date.view().qteReactionPending, false);
  assert.equal(createDateDirector({ schemaVersion: 1, phase: 'exit', avatarGender: 'female',
    preference: 'all', matchId: 'bia', substance: 'none' }, {
    sessionId: 'bathroom-qte', seed: 2, catalog: [event],
    persona: content('personas').personas.find(person => person.id === 'bia'),
    dialogue: content('dialogue'), eventConfig: fastEvents, checkpoint: date.snapshot()
  }).view().qteReactionPending, false);
  assert.match(date.view().caption, /Ainda bem que você segurou/);
  assert.match(date.view().summary, /segurou a porta/);
});

test('every event choice has an authored reaction instead of silently changing meters', () => {
  for (const event of content('events').events) {
    for (const choice of event.choices) {
      for (const persona of content('personas').personas) {
        const response = eventFeedback(event.id, choice.id, persona.id);
        assert.ok(response?.line && persona.allowedGestures.includes(response.gesture),
          `${event.id}/${choice.id}/${persona.id}`);
      }
    }
  }
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
  assert.equal(date.view().session.relationship.interest,35);
  assert.equal(date.react('impact_hard',5,1),false);
  for (let i=0;i<6;i++) {
    date.tick(.75,false);
    date.react('impact_hard',5,1);
  }
  assert.equal(date.view().result,'disaster');
  assert.equal(date.view().session.phase,'ending');
  assert.equal(date.view().finalFeedback, 'Chega. Eu vou embora.');
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
  const date = setup(undefined, content('events').events.filter(event => event.id === 'wrong_order'));
  date.tick(7.5);
  assert.equal(date.view().choices.length, 0);
  assert.equal(date.view().fallbackChoices.length, 3);
  assert.ok(date.remote(0, { text: 'Também fiquei nervoso. E você?', gesture: 'nod',
    relationshipDelta: { interest: 2, awkwardness: -1, patience: 0, safety: 0 } }));
  assert.equal(date.view().session.relationship.interest, 44);
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

test('a spoken boundary changes demeanor and ending the date starts a real departure', () => {
  const date = setup();
  date.tick(7.5);
  assert.ok(date.remote(0, { text: 'Não gostei disso. Peço que pare.', gesture: 'look_away',
    intent: 'boundary', emotion: 'annoyed', relationshipDelta: { patience: -3, safety: -3 } }));
  assert.equal(date.view().intent, 'boundary');
  assert.equal(date.view().emotion, 'annoyed');
  assert.equal(date.view().session.relationship.patience, 55);
  date.tick(5.6);
  assert.ok(date.remote(1, { text: 'Chega. Este encontro termina aqui. Vou embora.', gesture: 'look_away',
    intent: 'end_date', emotion: 'annoyed', relationshipDelta: { patience: -3, safety: -3 },
    ttsRef: '/v1/date/speech/clip/test' }));
  const view = date.view();
  assert.equal(view.session.phase, 'ending');
  assert.equal(view.result, 'disaster');
  assert.ok(view.departureAt > view.time);
  assert.equal(view.finalFeedback, 'Chega. Este encontro termina aqui. Vou embora.');
  assert.equal(view.speechRef, '/v1/date/speech/clip/test');
  const resumed = setup(date.snapshot());
  assert.equal(resumed.view().departureAt, view.departureAt);
  assert.equal(resumed.view().finalFeedback, view.finalFeedback);
  resumed.tick(view.departureAt - view.time + 5.3);
  assert.equal(resumed.view().session.phase, 'completed');
  assert.equal(resumed.view().canSpeak, false);
});

test('repeated spoken boundary violations end the encounter even without another end intent', () => {
  const date = setup();
  date.tick(7.5);
  for (let turn = 0; turn < 3; turn++) {
    assert.ok(date.remote(turn, { text: 'Pare com isso.', gesture: 'look_away',
      intent: 'boundary', emotion: 'annoyed', relationshipDelta: { patience: -3, safety: -3 } }));
    if (turn < 2) date.tick(5.6);
  }
  assert.equal(date.view().session.phase, 'ending');
  assert.match(date.view().caption, /vou embora/i);
  assert.ok(date.view().departureAt > date.view().time);
});

test('guarded body language stays stable across animation frames', () => {
  const actor = new THREE.Group();
  const head = new THREE.Bone();
  actor.add(head);
  const animation = createNpcAnimation(THREE, actor, { Head: head });
  animation.mood({ patience: 67, safety: 97 }, 'boundary', 'annoyed');
  const guarded = head.quaternion.clone();
  assert.notDeepEqual(guarded.toArray(), [0, 0, 0, 1]);
  animation.reset();
  assert.deepEqual(head.quaternion.toArray(), [0, 0, 0, 1]);
  animation.mood({ patience: 67, safety: 97 }, 'boundary', 'annoyed');
  assert.deepEqual(head.quaternion.toArray(), guarded.toArray());
});

test('every player utterance changes a bounded metric, including zero or saturated model deltas', () => {
  const relationship = { interest: 42, awkwardness: 24, patience: 58, safety: 65 };
  assert.deepEqual(speechRelationshipDelta(relationship, {}, { emotion: 'warm' }),
    { interest: 6, awkwardness: -4, patience: 4, safety: 4 });
  assert.deepEqual(speechRelationshipDelta(relationship, {}, { intent: 'boundary' }),
    { interest: -7, awkwardness: 6, patience: -7, safety: -9 });
  const saturated = { interest: 100, awkwardness: 20, patience: 70, safety: 100 };
  const impact = speechRelationshipDelta(saturated, { interest: 3 }, { emotion: 'warm' });
  assert.ok(Object.keys(impact).some(key => saturated[key] + impact[key] !== saturated[key]));
  assert.ok(Object.values(speechRelationshipDelta(relationship, { interest: 3 },
    { initiative: true })).every(value => value === 0));
});

test('the reply tone corrects status changes that contradict what the character says', () => {
  const relationship = { interest: 50, awkwardness: 20, patience: 70, safety: 100 };
  assert.equal(evaluateReplyTone({ text: 'Não gostei do que você disse.', emotion: 'warm' }), 'negative');
  assert.deepEqual(speechRelationshipDelta(relationship, { interest: 3 },
    { text: 'Não gostei do que você disse.', emotion: 'warm' }),
    { interest: -7, awkwardness: 6, patience: -7, safety: -5 });
  assert.equal(evaluateReplyTone({ text: 'Que bom, quero saber mais.', emotion: 'neutral' }), 'positive');
  assert.deepEqual(speechRelationshipDelta(relationship, { patience: -2 },
    { text: 'Que bom, quero saber mais.', emotion: 'neutral' }),
    { interest: 6, awkwardness: -4, patience: 4, safety: 4 });
  assert.deepEqual(speechRelationshipDelta(relationship, { interest: 2 },
    { text: 'Isso foi estranho.', emotion: 'awkward' }),
    { interest: -4, awkwardness: 6, patience: -4, safety: -4 });
  assert.equal(evaluateReplyTone({ text: 'Isso foi estranho.', emotion: 'warm' }), 'uneasy');
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
