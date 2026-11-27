import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { contract } from '../server/src/contracts.mjs';
import { createFirstDateServer } from '../server/src/first-date.mjs';
import { createDateDirector, dateOutcome } from '../src/date/director.mjs';
import { eligibleEvents } from '../src/date/event-core.mjs';
import { qteConfig } from '../src/date/qte.mjs';

const content = name => JSON.parse(readFileSync(new URL('../content/shared/' + name + '.json', import.meta.url)));
const { personas } = content('personas');
const { events: catalog } = content('events');
const dialogue = content('dialogue');
const entry = { schemaVersion: 1, phase: 'exit', avatarGender: 'female', preference: 'all',
  matchId: 'rafa', substance: 'none', profileIndex: 0 };
const fastEvents = { firstEventMinSeconds: 0, firstEventMaxSeconds: 0, checkMinSeconds: 1,
  checkMaxSeconds: 1, opportunityChance: 1, minimumGapSeconds: 0, maximumEvents: 6 };

function play(persona, seed, choice) {
  const director = createDateDirector({ ...entry, matchId: persona.id }, {
    sessionId: 'fixture', seed, persona, catalog, dialogue, eventConfig: fastEvents });
  director.tick(5.5);
  assert.equal(director.view().session.phase, 'greeting');
  assert.equal(director.choose('honest'), false);
  director.tick(2);
  assert.equal(director.view().session.arrivalState, 'seated');
  for (let i = 0; i < 3; i++) {
    assert.ok(director.choose(choice));
    assert.equal(director.view().choices.length, 0);
    director.tick(5.6);
  }
  director.tick(50);
  if (qteConfig(director.view().beat.definition.id)) assert.equal(director.view().beat.phase, 'qte');
  else {
    assert.equal(director.view().beat.phase, 'announce');
    director.tick(3.3);
    assert.equal(director.view().beat.phase, 'choice_window');
  }
  const event = director.view().beat;
  assert.equal(director.choose('finish'), false);
  assert.ok(director.choose(event.definition.choices[0].id));
  assert.ok(director.view().summary.length);
  director.tick(6.2);
  assert.ok(director.choose('finish'));
  director.tick(10);
  assert.equal(director.view().session.phase, 'completed');
  assert.ok(contract('date-session')(director.view().session));
  return director.view();
}

test('both clients share catalogs and venue geometry data', () => {
  for (const event of catalog) assert.ok(contract('world-event')(event), JSON.stringify(contract('world-event').errors));
  for (const file of ['personas', 'venues', 'events', 'dialogue']) {
    const native = JSON.parse(readFileSync(new URL('../unity/Assets/WorstDateEver/Resources/FirstDate/' + file + '.json', import.meta.url)));
    assert.deepEqual(native, content(file));
  }
  const js = content('venue-layout');
  const native = JSON.parse(readFileSync(new URL('../unity/Assets/WorstDateEver/Resources/FirstDate/venue-layout.json', import.meta.url)));
  for (const key of ['tables','dateRoute','restroomRoute','waiterRoute','entranceRoute'])
    assert.deepEqual(js[key], native[key].map(point => point.position));
  assert.deepEqual(js.props, native.props);
});

test('four routes can end offline and the contextual event catalog remains reachable', () => {
  const expected = ['cafe', 'sushi', 'bistro', 'bar'];
  const hands = personas.map((persona, i) => play(persona, 19234 * i, 'honest'));
  assert.deepEqual(hands.map(view => view.session.venueId), expected);
  assert.ok(hands.every(view => view.result === 'good'));
  for (const event of catalog) assert.ok(personas.some(persona => eligibleEvents({ catalog,
    venueId: { caio:'cafe', rafa:'sushi', bia:'bistro', luiza:'bar' }[persona.id], personaId: persona.id,
    time: 200, talkTurns: 4, relationship: { interest:50, awkwardness:20, patience:70, safety:100 }
  }).some(candidate => candidate.id === event.id)), event.id + ' must be reachable');
  assert.equal(play(personas[1], 12, 'brag').result, 'disaster');
  assert.equal(dateOutcome({ interest: 55, awkwardness: 25, patience: 60, safety: 65 }), 'awkward');
});

test('WebXR preserves the shared scenario routes with the current date balance', () => {
  const expected = {
    caio: ['good', { interest: 75, awkwardness: 3, patience: 73, safety: 71 }],
    rafa: ['disaster', { interest: 22, awkwardness: 54, patience: 33, safety: 53 }],
    bia: ['good', { interest: 66, awkwardness: 15, patience: 67, safety: 68 }],
    luiza: ['good', { interest: 74, awkwardness: 3, patience: 73, safety: 71 }]
  };
  for (const fixture of content('first-date-fixtures').fixtures) {
    const view = play(personas.find(person => person.id === fixture.matchId), fixture.seed, fixture.choice);
    assert.equal(view.session.venueId, fixture.expectedVenue);
    assert.equal(view.session.completedEventIds[0], fixture.expectedEvent);
    const [outcome, relationship] = expected[fixture.matchId];
    assert.equal(view.result, outcome);
    assert.deepEqual(view.session.relationship, relationship);
  }
});

test('Caio retains the saved venue ID and uses picnic presentation and props', () => {
  const caio = content('venues').venues.find(venue => venue.matchId === 'caio');
  assert.equal(caio.id, 'cafe');
  assert.equal(caio.sceneVariant, 'picnic');
  assert.equal(caio.ambientTheme, 'park');
  const picnicBeats = dialogue.beats.filter(beat => beat.personaId === 'caio' && beat.prop);
  assert.deepEqual(picnicBeats.map(beat => beat.prop), ['picnic_kombucha', 'picnic_sandwich']);
});

test('an active date restores its beat and deterministic event sequence', () => {
  const options = { sessionId: 'resume', seed: 1917, catalog, persona: personas[1], dialogue, eventConfig: fastEvents };
  const first = createDateDirector(entry, options);
  first.tick(7.5);
  assert.ok(first.choose(first.view().fallbackChoices[0].id));
  first.tick(5.6);
  assert.ok(first.choose(first.view().fallbackChoices[0].id));
  first.tick(55);
  first.tick(3.3);
  assert.ok(first.choose(first.view().beat.definition.choices[0].id));
  first.tick(5.1);
  const saved = JSON.parse(JSON.stringify(first.snapshot()));
  const resumed = createDateDirector(entry, { ...options, checkpoint: saved });
  assert.deepEqual(resumed.view().session, first.view().session);
  assert.equal(resumed.view().summary, first.view().summary);
  first.tick(160);
  resumed.tick(160);
  assert.equal(resumed.view().beat.definition.id, first.view().beat.definition.id);
  assert.notEqual(resumed.view().beat.definition.id, saved.session.completedEventIds[0]);
});

test('voice transport enforces session and turn order, derives context, and returns an approved PT-BR reply', async t => {
  const contexts = [];
  let transcriptSignal;
  const server = createFirstDateServer({ providers: {
    transcribe: async ({ pcm, sampleRate, signal }) => {
      assert.ok(pcm.length >= 6400);
      assert.equal(sampleRate, 16000);
      transcriptSignal = signal;
      return contexts.length ? 'Eu prefiro ir com calma.' : 'Gostei de você. Tinha que dizer.';
    },
    reply: async ({ persona, venue, initiative, history, memory, relationship, eventSummary, candyContext, text, signal }) => {
      assert.equal(persona.id, 'rafa');
      assert.equal(venue.id, 'sushi');
      if (!initiative) assert.notEqual(signal, transcriptSignal);
      contexts.push({ count: history.length, facts: memory.facts.slice(), initiative, interest: relationship.interest, eventSummary, candyContext, text, signal });
      return { text: initiative ? 'Você ficou quieta. Em que está pensando?' : 'Eu também. E quase pedi hambúrguer.',
        gesture: 'nod', intent: initiative ? 'ask_question' : 'smalltalk', emotion: 'warm',
        memory: { facts: initiative ? [] : ['jogadora gosta de sushi'], contradictions: [], topics: ['comida'] } };
    }
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  assert.deepEqual(await (await fetch(base + '/health')).json(), { ok: true, voiceProvider: true, tts: false });
  const issue = state => fetch(base + '/v1/date/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state)
  });
  assert.equal((await issue({ ...entry, substance: 'dmt' })).status, 400);
  const response = await issue({ ...entry, candy: 'pacoca' });
  assert.equal(response.status, 201);
  const ticket = await response.json();
  const socket = token => new WebSocket(base.replace(/^http/, 'ws') + ticket.socketPath + '?token=' + token);
  const invalid = socket('invalid');
  const [error] = await once(invalid, 'error');
  assert.match(error.message, /403/);
  const actions = [{ eventId: '', choiceId: 'honest' }, { eventId: 'water_spill', choiceId: 'help' }];
  async function run(turnId, frames, context = actions) {
    const ws = socket(ticket.token);
    const packets = [];
    ws.on('message', payload => packets.push(JSON.parse(payload.toString())));
    const closed = once(ws, 'close');
    await once(ws, 'open');
    const send = body => ws.send(JSON.stringify({ sessionId: ticket.sessionId, turnId, ...body }));
    send({ type: 'date.context', actions: context });
    send({ type: 'audio.start', format: { encoding: 'pcm_s16le', sampleRateHz: 16000, channels: 1 } });
    for (const frame of frames) ws.send(frame);
    send({ type: 'audio.end' });
    await closed;
    return packets;
  }
  async function initiate(turnId, context = actions) {
    const ws = socket(ticket.token);
    const packets = [];
    ws.on('message', payload => packets.push(JSON.parse(payload.toString())));
    const closed = once(ws, 'close');
    await once(ws, 'open');
    const send = body => ws.send(JSON.stringify({ sessionId: ticket.sessionId, turnId, ...body }));
    send({ type: 'date.context', actions: context });
    send({ type: 'npc.initiate' });
    await closed;
    return packets;
  }
  for (const turn of [1, 2]) {
    const packets = await run(turn, [Buffer.alloc(6400, 0x13)]);
    assert.deepEqual(packets.map(packet => packet.type), ['transcript.final', 'npc.reply']);
    assert.equal(packets[0].language, 'pt-BR');
    assert.ok(contract('npc-reply')(packets[1].reply));
    assert.ok(Object.values(packets[1].reply.relationshipDelta).some(value => value !== 0));
  }
  assert.deepEqual(contexts.map(context => [context.count, context.interest]), [[1,57],[2,63]]);
  assert.match(contexts[1].eventSummary, /segurou o copo/);
  assert.equal(contexts[0].candyContext.name, 'Paçoca');
  assert.equal(contexts[0].candyContext.rememberedMoment, null);
  assert.equal(contexts[0].text, 'Gostei de você. Tinha que dizer.');
  assert.equal(contexts[1].text, 'Eu prefiro ir com calma.');
  assert.equal(contexts[1].candyContext.rememberedMoment, 'aquele elogio direto');
  assert.equal((await run(2, []))[0].reason, 'sequence');
  assert.equal((await run(3, [Buffer.alloc(6400)]))[0].reason, 'silence');
  assert.equal((await run(4, [], [{eventId:'water_spill',choiceId:'invented'}]))[0].reason, 'context');
  assert.equal((await run(4, [], [...actions,
    { eventId: 'physical', choiceId: 'toast:complete:refuse' }]))[0].reason, 'context');
  const proactive = await initiate(4, [...actions,
    { eventId: 'physical', choiceId: 'toast:complete:enthusiastic' }]);
  assert.equal(proactive[0].type, 'npc.reply');
  assert.equal(proactive[0].reply.intent, 'ask_question');
  assert.ok(Object.values(proactive[0].reply.relationshipDelta).every(value => value === 0));
  assert.deepEqual(contexts[1].facts, ['jogadora gosta de sushi']);
  assert.equal(contexts.at(-1).initiative, true);
  assert.match(contexts.at(-1).eventSummary, /Fazer um brinde/);
  assert.match(contexts.at(-1).eventSummary, /O date disse:/);
  assert.ok(contexts.at(-1).facts.some(fact => /Fazer um brinde/.test(fact)));
});

test('a resolved QTE prompts an immediate character response without a player transcript', async t => {
  const seen = [];
  const server = createFirstDateServer({ providers: {
    transcribe: async () => '',
    reply: async context => {
      seen.push(context);
      return { text: 'Nossa, essa passou perto!', gesture: 'nod', intent: 'smalltalk',
        emotion: 'awkward', relationshipDelta: {}, memory: { facts: [], contradictions: [], topics: [] },
        suggestedEventId: null, eventActionId: null };
    }
  } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const response = await fetch(base + '/v1/date/session', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) });
  assert.equal(response.status, 201);
  const ticket = await response.json();
  const socket = new WebSocket(base.replace(/^http/, 'ws') + ticket.socketPath + '?token=' + ticket.token);
  const packets = [];
  socket.on('message', data => packets.push(JSON.parse(data.toString())));
  const closed = once(socket, 'close');
  await once(socket, 'open');
  const send = data => socket.send(JSON.stringify({ sessionId: ticket.sessionId, turnId: 1, ...data }));
  send({ type: 'date.context', actions: [{ eventId: 'water_spill', choiceId: 'help' }] });
  send({ type: 'npc.initiate' });
  await closed;
  assert.deepEqual(packets.map(packet => packet.type), ['npc.reply']);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].initiative, true);
  assert.match(seen[0].eventSummary, /segurou o copo/);
  assert.equal(seen[0].eventDecisions[0].playerChoice, 'Segurar o copo');
  assert.ok(Object.values(packets[0].reply.relationshipDelta).every(value => value === 0));
});
