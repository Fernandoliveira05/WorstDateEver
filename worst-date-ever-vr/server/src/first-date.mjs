import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocketServer } from 'ws';
import { contract } from './contracts.mjs';
import { orderFromSpeech, spokenMenuItem } from './menu-order.mjs';
import { createDateSpeech } from './date-speech.mjs';
import { createDeepSeekProviders, createGeminiProviders, createGemmaProviders, createOpenAIProviders } from './providers.mjs';
import { resolveEvent } from '../../src/date/event-core.mjs';
import { applyApprovedDelta, createDateSession, speechRelationshipDelta } from '../../src/date/session-core.mjs';
import { actionById, physicalSocialResult, physicalSummary } from '../../src/date/physical-interactions.mjs';

const read = name => JSON.parse(readFileSync(new URL('../../content/shared/' + name + '.json', import.meta.url)));
const { personas } = read('personas');
const { venues } = read('venues');
const { events } = read('events');
const dialogue = read('dialogue');
const { choices } = dialogue;
const physicalActions = read('date-reactions');
const menus = read('menu-items');
const keys = ['interest','awkwardness','patience','safety'];
const idle = 20 * 60 * 1000;
const maxDuration = 16;
// A date routinely lasts longer than twelve utterances. Keep a generous cap
// for a single authenticated session while idle expiry and per-IP limits
// bound its lifetime.
const maxTurns = 96;
const maxConnections = 128;
const voicePacket = contract('voice-turn');
const contextPacket = contract('date-context');
const replyPacket = contract('npc-reply');

function voiceRecovery(personaId) {
  const lines = {
    caio: 'Desculpa, eu estava montando uma resposta bonita e perdi a última parte. Repete pra mim? Quero entender, não improvisar uma tese.',
    rafa: 'Foi mal, viajei aqui tentando pensar numa resposta boa. Repete a última parte? Prometo não fingir que ouvi.',
    bia: 'Pera, me distraí por um segundo. Repete essa última parte? Não vou fingir que ouvi só pra parecer plena.',
    luiza: 'Desculpa, me distraí no meio. Repete pra mim? Quero ouvir direito, uai.'
  };
  return { text: lines[personaId] ?? 'Desculpa, perdi a última parte. Repete pra mim?',
    emotion: 'neutral', gesture: 'shrug', intent: 'smalltalk',
    relationshipDelta: { interest: 0, awkwardness: 0, patience: 0, safety: 0 },
    memory: { facts: [], contradictions: [], topics: [] },
    suggestedEventId: null, eventActionId: null };
}

function usableReply(fields, persona) {
  return Boolean(fields && typeof fields.text === 'string' && fields.text.trim() &&
    ['neutral','curious','warm','awkward','surprised','annoyed','embarrassed'].includes(fields.emotion) &&
    persona.allowedGestures.includes(fields.gesture) &&
    ['smalltalk','ask_question','comment_event','order_food','boundary','end_date'].includes(fields.intent) &&
    fields.memory && Array.isArray(fields.memory.facts) && Array.isArray(fields.memory.contradictions) &&
    Array.isArray(fields.memory.topics));
}

async function replyWithRetry(providers, input, signal) {
  for (let attempt = 0; ; attempt++) {
    try { return await providers.reply(input); }
    catch (error) {
      if (signal.aborted || attempt >= 1 || error.status && error.status !== 429 && error.status < 500) throw error;
      await delay(220 * (attempt + 1), undefined, { signal });
    }
  }
}

export function createFirstDateServer({ providers = createGeminiProviders() ?? createDeepSeekProviders() ?? createGemmaProviders() ?? createOpenAIProviders(), allowedOrigins = [], speech = createDateSpeech({ base: process.env.DATE_TTS_URL, personas, dialogue, reactions: physicalActions }) } = {}) {
  const sessions = new Map();
  const rate = new Map();
  const ws = new WebSocketServer({ noServer: true, maxPayload: 16_384 });
  const validOrigin = origin => !origin || allowedOrigins.includes(origin);
  function respond(res, code, value) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  }
  const server = createServer({ requestTimeout: 10000 }, async (req, res) => {
    const origin = req.headers.origin;
    if (!validOrigin(origin)) { respond(res, 403, { error: 'origin' }); return; }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
    }
    if (speech && req.method === 'GET' && req.url.startsWith('/v1/date/speech/')) {
      await speech.serve(req, res, new URL(req.url, 'http://localhost'));
      return;
    }
    if (req.method === 'GET' && req.url === '/health') {
      respond(res, providers ? 200 : 503, { ok: Boolean(providers), voiceProvider: Boolean(providers), tts: Boolean(speech) });
      return;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' }).end();
      return;
    }
    if (req.method !== 'POST' || req.url !== '/v1/date/session') { respond(res, 404, { error: 'route' }); return; }
    if (!providers) { respond(res, 503, { error: 'voice_disabled' }); return; }
    const now = Date.now();
    for (const [key, entry] of rate) if (now >= entry.until) rate.delete(key);
    for (const [key, session] of sessions) if (!session.socket && now >= session.until) sessions.delete(key);
    const address = req.socket.remoteAddress;
    const attempt = rate.get(address) ?? { count: 0, until: now + 60000 };
    rate.set(address, attempt);
    if (++attempt.count > 18 || sessions.size >= maxConnections) { respond(res, 429, { error: 'limit' }); return; }
    let body = '';
    try {
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 2048) { respond(res, 413, { error: 'limit' }); return; }
      }
      const handoff = JSON.parse(body);
      if (!contract('scene-handoff')(handoff)) { respond(res, 400, { error: 'handoff' }); return; }
      const id = randomUUID();
      const token = randomBytes(24).toString('base64url');
      const session = createDateSession(handoff, id);
      const openingLine = personas.find(person => person.id === session.matchId)?.openingLine;
      sessions.set(id, { token, session: { ...session, phase: 'dialogue', arrivalState: 'seated' }, actions: [],
        history: openingLine ? [{ player: '', npc: openingLine }] : [], eventDecisions: [],
        memory: { facts: [], contradictions: [], topics: [] }, until: now + idle, next: 1 });
      respond(res, 201, { sessionId: id, token, socketPath: '/v1/voice/session/' + id });
    } catch { respond(res, 400, { error: 'bad_request' }); }
  });

  server.on('upgrade', (req, socket, head) => {
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }
    const id = /^\/v1\/voice\/session\/([a-f0-9-]+)$/.exec(url.pathname)?.[1];
    const owner = sessions.get(id);
    const token = Buffer.from(url.searchParams.get('token') ?? '');
    const reference = Buffer.from(owner?.token ?? '');
    if (!owner || owner.socket || owner.until <= Date.now() || owner.next > maxTurns || !validOrigin(req.headers.origin) ||
      reference.length !== token.length || !timingSafeEqual(token, reference)) {
      socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      return;
    }
    ws.handleUpgrade(req, socket, head, client => {
      owner.socket = client;
      client.on('error', () => client.terminate());
      bindTurn(client, owner, providers, speech);
    });
  });
  server.on('close', () => { for (const client of ws.clients) client.terminate(); });
  return server;
}


function syncContext(owner, actions) {
  if (!Array.isArray(actions) || actions.length > 64 || owner.actions.length > actions.length) return false;
  let snapshot = owner.session;
  let summary = owner.summary;
  let decisions = owner.eventDecisions ?? [];
  let facts = owner.memory.facts;
  for (let i = 0; i < actions.length; i++) {
    const entry = actions[i];
    if (typeof entry?.choiceId !== 'string' || typeof entry.eventId !== 'string') return false;
    if (i < owner.actions.length) {
      if (entry.choiceId !== owner.actions[i].choiceId || entry.eventId !== owner.actions[i].eventId) return false;
      continue;
    }
    try {
      if (entry.eventId === 'physical') {
        const [actionId, mechanical, response, extra] = entry.choiceId.split(':');
        if (extra || !actionById(actionId) || !['enthusiastic', 'accept', 'awkward', 'refuse'].includes(response))
          return false;
        const repeats = actions.slice(0, i).filter(item => item.eventId === 'physical' &&
          item.choiceId.startsWith(actionId + ':')).length;
        const social = physicalSocialResult(owner.session.matchId, actionId, mechanical, snapshot.relationship, repeats);
        // When the browser reconnects, the new voice session has no earlier
        // dialogue deltas. Historical reactions may differ from a fresh replay.
        if (owner.next !== 1 && response !== social.response) return false;
        snapshot = applyApprovedDelta(snapshot, social.delta);
        summary = physicalSummary(actionId, mechanical, response, repeats, owner.session.matchId);
        decisions = [...decisions, { event: summary, playerChoice: actionById(actionId).label }].slice(-8);
        facts = [...new Set([...facts, summary])].slice(-10);
      } else if (entry.eventId) {
        const event = events.find(item => item.id === entry.eventId);
        if (!event) return false;
        const resolved = resolveEvent(snapshot, event, entry.choiceId);
        snapshot = resolved.session;
        summary = resolved.contextSummary;
        const selected = event.choices.find(choice => choice.id === entry.choiceId);
        decisions = [...decisions, { event: resolved.contextSummary, playerChoice: selected.label }].slice(-8);
      } else {
        const choice = [...choices, ...physicalActions].find(item => item.id === entry.choiceId);
        if (!choice) return false;
        snapshot = applyApprovedDelta(snapshot, Object.fromEntries(keys.map((key, i) => [key, choice.delta[i]])));
        if (choice.context) summary = choice.context;
      }
    } catch { return false; }
  }
  owner.actions = actions.map(({ eventId, choiceId }) => ({ eventId, choiceId }));
  owner.session = snapshot;
  owner.summary = summary;
  owner.eventDecisions = decisions;
  owner.memory.facts = facts;
  return true;
}

function bindTurn(client, owner, providers, speech) {
  const id = owner.session.sessionId;
  const turnId = owner.next;
  let turn;
  let rejected = false;
  let contextReady = false;
  const deadline = setTimeout(() => client.close(1008, 'timeout'), 90000);
  const send = (type, payload = {}) => {
    if (client.readyState === 1) client.send(JSON.stringify({ type, sessionId: id, turnId, ...payload }));
  };
  const fail = reason => {
    if (rejected) return;
    rejected = true;
    turn?.abort.abort();
    send('voice.error', { reason, nextTurnId: owner.next });
    client.close(1008, reason);
  };
  const respond = async (text, signal, initiative = false) => {
    const persona = personas.find(person => person.id === owner.session.matchId);
    const venue = venues.find(item => item.id === owner.session.venueId);
    const activeEvent = events.find(item => item.id === owner.world?.event?.id);
    const validEventSuggestions = events.filter(item => item.venueIds.includes(venue.id) &&
      (!item.personaIds?.length || item.personaIds.includes(persona.id))).map(item => item.id);
    const menu = owner.world?.menu;
    const spread = menus.spreads[menu?.page];
    const heldMenu = spread && menu.held && owner.world.held.includes('menu');
    const venueItems = menus.venues[venue.id] ?? [];
    const hasCorrection = /\b(?:na verdade|quer dizer|mudei de ideia|em vez disso|melhor (?:um|uma|o|a))\b/i.test(text);
    let ordered = !initiative && !hasCorrection ?
      orderFromSpeech(text, venueItems, { allowBareName: Boolean(heldMenu || menu?.waiterNearby) }) : null;
    const confirmOrder = item => send('order.accepted', { itemId: item.id, name: item.name });
    if (ordered) confirmOrder(ordered);
    const world = { ...owner.world, menu: { ...menu,
      items: venueItems.map(({ id, name, aliases }) => ({ id, name, aliases })),
      confirmedOrder: ordered?.name ?? null } };
    const providerSignal = AbortSignal.any([signal, AbortSignal.timeout(30000)]);
    let fields;
    let recovered = false;
    try {
      fields = await replyWithRetry(providers, { persona, venue, text, initiative, history: owner.history,
        eventDecisions: owner.eventDecisions ?? [],
        memory: owner.memory, relationship: owner.session.relationship, eventSummary: owner.summary ?? '',
        event: activeEvent ? { id: activeEvent.id, choices: activeEvent.choices.map(({ id, label }) => ({ id, label })) } : null,
        validEventSuggestions, world, signal: providerSignal }, providerSignal);
    } catch (error) {
      if (signal.aborted) return;
      console.warn('Date dialogue provider failed; using persona recovery line:', error.message);
      fields = voiceRecovery(persona.id);
      recovered = true;
    }
    if (signal.aborted) return;
    if (!usableReply(fields, persona)) {
      console.warn('Date dialogue provider returned an invalid reply; using persona recovery line.');
      fields = voiceRecovery(persona.id);
      recovered = true;
    }
    if (!ordered && !initiative && fields.intent === 'order_food') {
      ordered = spokenMenuItem(text, venueItems, fields.requestedMenuItemId);
      if (ordered) confirmOrder(ordered);
    }
    const orderItemId = ordered?.id ?? null;
    if (recovered && ordered) fields.text = `Fechado, ${ordered.name}. Já anotei seu pedido.`;
    const suggestedEventId = validEventSuggestions.includes(fields.suggestedEventId) ? fields.suggestedEventId : null;
    let eventActionId = owner.world?.event?.phase === 'choice_window' && owner.actions.length < 64 &&
      activeEvent?.choices.some(choice => choice.id === fields.eventActionId) ? fields.eventActionId : null;
    let resolvedEvent;
    if (eventActionId) {
      try { resolvedEvent = resolveEvent(owner.session, activeEvent, eventActionId); }
      catch { eventActionId = null; }
    }
    const relationshipForImpact = (resolvedEvent?.session ?? owner.session).relationship;
    const relationshipDelta = speechRelationshipDelta(relationshipForImpact, fields.relationshipDelta,
      { text: fields.text, intent: fields.intent, emotion: fields.emotion, initiative: initiative || recovered });
    const intent = orderItemId ? 'order_food' : fields.intent;
    const reply = { sessionId: id, turnId, personaId: persona.id,
      text: fields.text.trim().slice(0, 500), emotion: fields.emotion, gesture: fields.gesture, intent,
      relationshipDelta, suggestedEventId, eventActionId, orderItemId };
    if (!replyPacket(reply) || !persona.allowedGestures.includes(reply.gesture)) { fail('reply'); return; }
    owner.session = applyApprovedDelta(resolvedEvent?.session ?? owner.session, relationshipDelta);
    if (resolvedEvent) {
      owner.actions.push({ eventId: activeEvent.id, choiceId: eventActionId });
      owner.summary = resolvedEvent.contextSummary;
      owner.eventDecisions = [...owner.eventDecisions, { event: owner.summary,
        playerChoice: activeEvent.choices.find(choice => choice.id === eventActionId).label }].slice(-8);
    }
    const memory = fields.memory ?? {};
    const merge = (current, incoming, max) => [...new Set([...current, ...(Array.isArray(incoming) ? incoming : [])]
      .map(value => String(value).trim().slice(0, 160)).filter(Boolean))].slice(-max);
    owner.memory = { facts: merge(owner.memory.facts, memory.facts, 10),
      contradictions: merge(owner.memory.contradictions, memory.contradictions, 6),
      topics: merge(owner.memory.topics, memory.topics, 8) };
    owner.history = [...owner.history, { player: initiative ? '' : text, npc: reply.text }].slice(-8);
    if (speech) {
      try { reply.ttsRef = speech.register(persona.id, reply.text); }
      catch { /* The browser can still read the validated caption. */ }
    }
    owner.until = Date.now() + idle;
    send('npc.reply', { reply });
    client.close(1000, 'complete');
  };

  client.on('close', () => {
    clearTimeout(deadline);
    turn?.abort.abort();
    if (turn) turn.frames.length = 0;
    owner.socket = null;
  });
  client.on('message', async (data, binary) => {
    if (rejected) return;
    if (binary) {
      if (!turn || turn.ended || data.length === 0 || data.length % 2) { fail('format'); return; }
      turn.bytes += data.length;
      if (turn.bytes > (maxDuration + .2) * turn.rate * 2) { fail('duration'); return; }
      turn.frames.push(data);
      return;
    }

    let packet;
    try { packet = JSON.parse(data.toString()); } catch { fail('format'); return; }
    if (packet?.type === 'date.context' && !turn && packet.sessionId === id && packet.turnId === turnId) {
      if (!contextPacket(packet)) {
        console.warn('Date voice context rejected:', contextPacket.errors?.map(({ instancePath, keyword }) => [instancePath, keyword]));
        fail('context'); return;
      }
      if (!syncContext(owner, packet.actions)) {
        console.warn('Date voice action history could not be reconciled.');
        fail('context'); return;
      }
      owner.world = packet.world ?? null;
      contextReady = true;
      return;
    }
    if (!voicePacket(packet) || packet.sessionId !== id || packet.turnId !== turnId) { fail('sequence'); return; }
    if (packet.type === 'npc.initiate' && !turn && contextReady) {
      owner.next++;
      owner.session.turnSequence = turnId;
      const controller = new AbortController();
      turn = { frames: [], abort: controller, ended: true };
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(40000)]);
      try { await respond('', signal, true); }
      catch (error) {
        if (!controller.signal.aborted) {
          console.warn('Date voice initiative reply failed:', error.message);
          fail(signal.aborted ? 'timeout' : 'dialogue');
        }
      }
      return;
    }
    if (packet.type === 'audio.start' && !turn && contextReady) {
      turn = { rate: packet.format.sampleRateHz, frames: [], bytes: 0, abort: new AbortController(), ended: false };
      return;
    }
    if (!turn) { fail('sequence'); return; }
    if (packet.type === 'audio.cancel') { rejected = true; turn.abort.abort(); client.close(1000, 'cancelled'); return; }
    if (packet.type !== 'audio.end' || turn.ended) { fail('sequence'); return; }
    turn.ended = true;
    owner.next++;
    owner.session.turnSequence = turnId;
    let phase = 'transcription';
    let phaseSignal;
    try {
      const pcm = Buffer.concat(turn.frames);
      turn.frames.length = 0;
      let power = 0;
      for (let i = 0; i < pcm.length; i += 2) power += (pcm.readInt16LE(i) / 32768) ** 2;
      if (pcm.length < turn.rate * .4 || power / (pcm.length / 2) < .000012) { fail('silence'); return; }
      phaseSignal = AbortSignal.any([turn.abort.signal, AbortSignal.timeout(25000)]);
      const text = (await providers.transcribe({ pcm, sampleRate: turn.rate, signal: phaseSignal }))?.trim().slice(0, 1000);
      if (turn.abort.signal.aborted) return;
      if (!text) { fail('silence'); return; }
      send('transcript.final', { text, language: 'pt-BR' });
      phase = 'reply';
      phaseSignal = AbortSignal.any([turn.abort.signal, AbortSignal.timeout(40000)]);
      await respond(text, phaseSignal);
    } catch (error) {
      if (!turn.abort.signal.aborted) {
        console.warn('Date voice ' + phase + ' failed:', error.message);
        fail(phaseSignal?.aborted ? 'timeout' : phase);
      }
    }
  });
}
