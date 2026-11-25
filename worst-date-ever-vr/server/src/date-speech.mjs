import { randomUUID } from 'node:crypto';

export function createDateSpeech({ base, personas, dialogue, reactions }) {
  if (!base) return null;
  const shared = [...dialogue.beats.map(beat => beat.cue), ...dialogue.outcomes.map(item => item.line),
    ...reactions.map(item => item.line), 'Chega. Eu vou embora.'];
  const authored = new Map(personas.map(person => {
    const conversation = dialogue.conversations.find(item => item.id === person.id);
    const replies = conversation?.turns.flatMap(turn => turn.options.map(option => option.reply)) ?? [];
    return [person.id, new Set([person.openingLine, ...replies, ...shared])];
  }));
  const replies = new Map();
  const cache = new Map();

  function register(persona, text) {
    const now = Date.now();
    for (const [id, value] of replies) if (value.expires < now) replies.delete(id);
    if (replies.size >= 64) replies.delete(replies.keys().next().value);
    const id = randomUUID();
    replies.set(id, { persona, text, expires: now + 90000 });
    return '/v1/date/speech/clip/' + id;
  }

  async function render({ persona, text }) {
    const response = await fetch(new URL('/synthesize', base), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persona, text }), signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error('Voice unavailable');
    return Buffer.from(await response.arrayBuffer());
  }

  async function serve(req, res, url) {
    const id = /^\/v1\/date\/speech\/clip\/([a-z0-9-]+)$/.exec(url.pathname)?.[1];
    const persona = /^\/v1\/date\/speech\/(caio|rafa|bia|luiza)$/.exec(url.pathname)?.[1];
    const text = url.searchParams.get('line');
    const line = id ? replies.get(id) : authored.get(persona)?.has(text) ? { persona, text } : null;
    if (!line || line.expires && line.expires < Date.now()) { res.writeHead(404).end(); return; }

    const key = id ?? persona + ':' + text;
    if (!cache.has(key)) {
      if (cache.size >= 48) cache.delete(cache.keys().next().value);
      cache.set(key, render(line));
    }
    try {
      const audio = await cache.get(key);
      res.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length,
        'Cache-Control': id ? 'private, max-age=30' : 'public, max-age=3600' });
      res.end(audio);
    } catch {
      cache.delete(key);
      res.writeHead(502).end();
    }
  }

  return { register, serve };
}
