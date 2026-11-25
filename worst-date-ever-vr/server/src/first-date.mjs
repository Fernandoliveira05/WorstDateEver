import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { contract } from './contracts.mjs';
import { createDateSpeech } from './date-speech.mjs';
import { createDeepSeekProviders, createGemmaProviders, createOpenAIProviders } from './providers.mjs';
import { resolveEvent } from '../../src/date/event-core.mjs';
import { applyApprovedDelta, createDateSession } from '../../src/date/session-core.mjs';

const read = name => JSON.parse(readFileSync(new URL('../../content/shared/' + name + '.json', import.meta.url)));
const { personas } = read('personas');
const { venues } = read('venues');
const { events } = read('events');
const dialogue = read('dialogue');
const { choices } = dialogue;
const physicalActions = read('date-reactions');
const keys = ['interest','awkwardness','patience','safety'];
const idle = 20 * 60 * 1000;
const maxDuration = 10;
const maxTurns = 12;
const maxConnections = 128;
const voicePacket = contract('voice-turn');
const contextPacket = contract('date-context');
const replyPacket = contract('npc-reply');

export function createFirstDateServer({ providers = createDeepSeekProviders() ?? createGemmaProviders() ?? createOpenAIProviders(), allowedOrigins = [], speech = createDateSpeech({ base: process.env.DATE_TTS_URL, personas, dialogue, reactions: physicalActions }) } = {}) {
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
      sessions.set(id, { token, session: { ...session, phase: 'dialogue', arrivalState: 'seated' }, actions: [], history: [], until: now + idle, next: 1 });
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
  for (let i = 0; i < actions.length; i++) {
    const entry = actions[i];
    if (typeof entry?.choiceId !== 'string' || typeof entry.eventId !== 'string') return false;
    if (i < owner.actions.length) {
      if (entry.choiceId !== owner.actions[i].choiceId || entry.eventId !== owner.actions[i].eventId) return false;
      continue;
    }
    try {
      if (entry.eventId) {
        const event = events.find(item => item.id === entry.eventId);
        if (!event) return false;
        const resolved = resolveEvent(snapshot, event, entry.choiceId);
        snapshot = resolved.session;
        summary = resolved.contextSummary;
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
  return true;
}

function bindTurn(client, owner, providers, speech) {
  const id = owner.session.sessionId;
  const turnId = owner.next;
  let turn;
  let rejected = false;
  const deadline = setTimeout(() => client.close(1008, 'timeout'), 26000);
  const send = (type, payload = {}) => {
    if (client.readyState === 1) client.send(JSON.stringify({ type, sessionId: id, turnId, ...payload }));
  };
  const fail = reason => {
    if (rejected) return;
    rejected = true;
    turn?.abort.abort();
    send('voice.error', { reason });
    client.close(1008, reason);
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
      if (!contextPacket(packet) || !syncContext(owner, packet.actions)) { fail('context'); return; }
      owner.world = packet.world ?? null;
      return;
    }
    if (!voicePacket(packet) || packet.sessionId !== id || packet.turnId !== turnId) { fail('sequence'); return; }
    if (packet.type === 'audio.start' && !turn) {
      turn = { rate: packet.format.sampleRateHz, frames: [], bytes: 0, abort: new AbortController(), ended: false };
      return;
    }
    if (!turn) { fail('sequence'); return; }
    if (packet.type === 'audio.cancel') { rejected = true; turn.abort.abort(); client.close(1000, 'cancelled'); return; }
    if (packet.type !== 'audio.end' || turn.ended) { fail('sequence'); return; }
    turn.ended = true;
    owner.next++;
    owner.session.turnSequence = turnId;
    const signal = AbortSignal.any([turn.abort.signal, AbortSignal.timeout(14500)]);
    try {
      const pcm = Buffer.concat(turn.frames);
      turn.frames.length = 0;
      let power = 0;
      for (let i = 0; i < pcm.length; i += 2) power += (pcm.readInt16LE(i) / 32768) ** 2;
      if (pcm.length < turn.rate * .4 || power / (pcm.length / 2) < .000012) { fail('silence'); return; }
      const text = (await providers.transcribe({ pcm, sampleRate: turn.rate, signal }))?.trim().slice(0, 1000);
      if (turn.abort.signal.aborted) return;
      if (!text) { fail('silence'); return; }
      send('transcript.final', { text, language: 'pt-BR' });
      const persona = personas.find(person => person.id === owner.session.matchId);
      const venue = venues.find(item => item.id === owner.session.venueId);
      const fields = await providers.reply({ persona, venue, text, history: owner.history,
        relationship: owner.session.relationship, eventSummary: owner.summary ?? '', world: owner.world, signal });
      if (turn.abort.signal.aborted) return;
      const reply = { sessionId: id, turnId, personaId: persona.id,
        text: fields.text, emotion: fields.emotion, gesture: fields.gesture, intent: fields.intent,
        relationshipDelta: { interest: 0, awkwardness: 0, patience: 0, safety: 0 } };
      if (!replyPacket(reply) || !persona.allowedGestures.includes(reply.gesture)) { fail('reply'); return; }
      owner.history = [...owner.history, { player: text, npc: reply.text }].slice(-4);
      if (speech) reply.ttsRef = speech.register(persona.id, reply.text);
      send('npc.reply', { reply });
      client.close(1000, 'complete');
    } catch {
      if (!turn.abort.signal.aborted) fail('provider');
    }
  });
}
