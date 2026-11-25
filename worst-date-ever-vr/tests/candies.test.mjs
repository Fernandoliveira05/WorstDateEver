import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { candies, candyAtmosphere, candyChoiceId, candyMoment, localSpokenReply } from '../src/candies.mjs';
import { initialState, transition, validateSave } from '../src/game-machine.mjs';
import { createDateDirector } from '../src/date/director.mjs';
import { creatureMotion } from '../src/corridor-creature.mjs';
import { contract } from '../server/src/contracts.mjs';

const load = name => JSON.parse(readFileSync(new URL('../content/shared/' + name + '.json', import.meta.url)));
const entry = { ...initialState(), phase: 'exit', avatarGender: 'male', preference: 'all', matchId: 'rafa', substance: 'none' };
const options = { sessionId: 'candy-test', seed: 2, catalog: load('events').events, dialogue: load('dialogue'),
  persona: load('personas').personas.find(p => p.id === 'rafa'),
  eventConfig: { firstEventMinSeconds: 0, firstEventMaxSeconds: 0, checkMinSeconds: 1, checkMaxSeconds: 1,
    opportunityChance: 1, minimumGapSeconds: 0 } };

test('each eaten candy locks without starting the date and resets with a new game', () => {
  for (const id of Object.keys(candies)) {
    const eaten = transition(entry, { type: 'EAT_CANDY', value: id });
    assert.equal(eaten.phase, 'exit');
    assert.equal(eaten.candy, id);
    assert.ok(validateSave(eaten));
    assert.ok(contract('scene-handoff')(eaten));
    assert.equal(transition(eaten, { type: 'EAT_CANDY', value: 'morango' }), eaten);
    assert.equal(transition(eaten, { type: 'RESET' }).candy, null);
  }
  const { candy, ...legacy } = entry;
  assert.ok(validateSave(legacy));
  assert.ok(contract('scene-handoff')(legacy));
});

test('each candy opens a conversational choice, survives the ending and supports reduced effects', () => {
  for (const id of [null, ...Object.keys(candies)]) {
    const d = createDateDirector({ ...entry, candy: id }, options);
    d.tick(7.5);
    assert.equal(d.view().fallbackChoices.some(c => c.id === candyChoiceId), Boolean(id));
    if (id) assert.ok(d.choose(candyChoiceId));
    else assert.ok(d.choose('honest'));
    for (let i = 0; i < 2; i++) { d.tick(5.6); assert.ok(d.choose('honest')); }
    d.tick(50); d.tick(3.3);
    assert.ok(d.choose(d.view().beat.definition.choices[0].id));
    d.tick(5.1); assert.ok(d.choose('finish'));
    const ending = d.view();
    assert.equal(ending.session.candy ?? null, id);
    if (id) assert.match(ending.caption, /lembrar/);
    d.tick(4.6);
    assert.equal(d.view().session.phase, 'completed');
    const restored = createDateDirector({ ...entry, candy: id }, { ...options, checkpoint: d.snapshot() });
    assert.equal(restored.view().caption, ending.caption);
    const full = candyAtmosphere(id), reduced = candyAtmosphere(id, true);
    assert.ok(Object.keys(full).every(key => reduced[key] <= full[key]));
    if (id) assert.equal(Object.values(full).filter(Number).length, 1);
  }
});

test('the same candy respects cautious speech and only remembers an actual moment', () => {
  const d = createDateDirector({ ...entry, candy: 'pacoca' }, options);
  d.tick(7.5);
  const reply = text => localSpokenReply('pacoca', 'rafa', d.view().session.relationship, text, d.view().memorable);
  const cautious = 'Eu prefiro ir com calma, ainda não te conheço.';
  assert.ok(d.remote(0, reply(cautious), cautious));
  assert.equal(d.view().memorable, null);
  d.tick(5.6);
  const compliment = 'Gostei de você. Tinha que dizer.';
  assert.ok(d.remote(1, reply(compliment), compliment));
  assert.equal(d.view().memorable, 'aquele elogio direto');
  assert.equal(candyMoment('tamarindo', 'E se a mesa falasse?', 'Que piada!'), 'aquela piada que a gente inventou');
  assert.equal(candyMoment('tamarindo', 'E se a mesa falasse?', 'Prefiro mudar de assunto.'), null);
});

test('creature piano cue begins during the reveal and expires in under one second', () => {
  assert.equal(creatureMotion(0).striking, false);
  assert.ok(creatureMotion(.10).presence > .8 && creatureMotion(.10).striking);
  assert.ok(creatureMotion(.55).finished);
});
