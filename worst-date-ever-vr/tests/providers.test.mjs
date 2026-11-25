import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProviders } from '../server/src/providers.mjs';

const env = {
  GEMINI_API_KEY: 'test-key',
  DATE_GEMINI_STT_MODEL: 'gemini-stt-test',
  DATE_GEMINI_DIALOGUE_MODEL: 'gemini-dialogue-test'
};

test('Gemini provider requires a server key and both model names', () => {
  assert.equal(createGeminiProviders({}), null);
  assert.equal(createGeminiProviders({ GEMINI_API_KEY: 'key' }), null);
});

test('Gemini provider sends WAV audio and requests structured dialogue', async t => {
  const requests = [];
  const reply = {
    text: 'Tá, essa eu não esperava.', emotion: 'surprised', gesture: 'laugh', intent: 'smalltalk',
    relationshipDelta: { interest: 1, awkwardness: 0, patience: 0, safety: 0 },
    memory: { facts: [], contradictions: [], topics: ['música'] },
    suggestedEventId: null, eventActionId: null
  };
  const responses = ['Oi, tudo bem?', JSON.stringify(reply)];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: responses.shift() }] } }] }) };
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const provider = createGeminiProviders(env);
  const transcript = await provider.transcribe({ pcm: Buffer.alloc(3200), sampleRate: 16000 });
  assert.equal(transcript, 'Oi, tudo bem?');
  assert.match(requests[0].url, /gemini-stt-test:generateContent$/);
  assert.equal(requests[0].options.headers['x-goog-api-key'], 'test-key');
  const audio = requests[0].body.contents[0].parts[1].inlineData;
  assert.equal(audio.mimeType, 'audio/wav');
  assert.equal(Buffer.from(audio.data, 'base64').subarray(0, 4).toString(), 'RIFF');

  const result = await provider.reply({
    persona: { id: 'ameinda' }, venue: { id: 'paris-6' }, text: transcript, initiative: false,
    history: [], memory: { facts: [], contradictions: [], topics: [] },
    relationship: { interest: 0, awkwardness: 0, patience: 0, safety: 0 }, eventSummary: '',
    event: null, validEventSuggestions: [], world: null
  });
  assert.deepEqual(result, reply);
  assert.match(requests[1].url, /gemini-dialogue-test:generateContent$/);
  assert.equal(requests[1].body.generationConfig.responseMimeType, 'application/json');
  assert.equal(requests[1].body.generationConfig.responseJsonSchema.properties.text.maxLength, undefined);
});
