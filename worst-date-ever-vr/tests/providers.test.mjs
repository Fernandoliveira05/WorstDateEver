import test from 'node:test';
import assert from 'node:assert/strict';
import { createGeminiProviders } from '../server/src/providers.mjs';
import { personaVoiceInstruction } from '../server/src/persona-voice.mjs';
import { readFileSync } from 'node:fs';

const personas = JSON.parse(readFileSync(new URL('../content/shared/personas.json', import.meta.url))).personas;

test('each authored persona has a distinct spoken voice and emotional reaction', () => {
  const directions = personas.map(persona => personaVoiceInstruction(persona));
  assert.equal(new Set(directions).size, personas.length);
  for (const direction of directions) {
    assert.match(direction, /Jeito de conversar:/);
    assert.match(direction, /Paquera:/);
    assert.match(direction, /Atrito e limites:/);
    assert.match(direction, /Amostra de voz \(NÃO copie\):/);
    assert.match(direction, /fala atual/);
  }
  assert.match(directions[0], /Frases medidas/);
  assert.match(directions[1], /bravata falha/);
  assert.match(directions[2], /detalhes específicos/);
  assert.match(directions[3], /Direta, calorosa/);
});

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
  assert.equal(requests[1].body.generationConfig.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(requests[1].body.generationConfig.maxOutputTokens, 4096);
  assert.equal(requests[1].body.generationConfig.responseJsonSchema.properties.text.maxLength, undefined);
  assert.match(requests[1].body.systemInstruction.parts[0].text, /Responda à fala atual como esta pessoa/);
});

test('Gemini receives the selected persona voice as a system instruction', async t => {
  const originalFetch = globalThis.fetch;
  const instructions = [];
  const reply = { text: 'Tá bom.', emotion: 'neutral', gesture: 'nod', intent: 'smalltalk',
    relationshipDelta: { interest: 1, awkwardness: 0, patience: 0, safety: 0 },
    memory: { facts: [], contradictions: [], topics: [] }, suggestedEventId: null, eventActionId: null };
  globalThis.fetch = async (_url, options) => {
    instructions.push(JSON.parse(options.body).systemInstruction.parts[0].text);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(reply) }] } }] }) };
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const persona of [personas[0], personas[2]]) {
    await createGeminiProviders(env).reply({ persona, venue: { id: 'bistro' }, text: 'Gostei daqui.',
      initiative: false, history: [], memory: { facts: [], contradictions: [], topics: [] },
      relationship: { interest: 0, awkwardness: 0, patience: 0, safety: 0 }, eventSummary: '',
      event: null, validEventSuggestions: [], world: null });
  }
  assert.match(instructions[0], /Frases medidas/);
  assert.match(instructions[1], /detalhes específicos/);
  assert.doesNotMatch(instructions[0], /detalhes específicos/);
  assert.doesNotMatch(instructions[1], /Frases medidas/);
});

test('Gemini retries a transient failure and an incomplete dialogue response', async t => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const reply = { text: 'Vamos continuar conversando.', emotion: 'warm', gesture: 'nod', intent: 'smalltalk',
    relationshipDelta: { interest: 0, awkwardness: 0, patience: 0, safety: 0 },
    memory: { facts: [], contradictions: [], topics: [] }, suggestedEventId: null, eventActionId: null };
  const responses = [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS' }] }) },
    { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(reply) }] } }] }) }
  ];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return responses.shift();
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const result = await createGeminiProviders(env).reply({
    persona: { id: 'bia' }, venue: { id: 'bistro' }, text: 'Oi', initiative: false,
    history: [], memory: { facts: [], contradictions: [], topics: [] },
    relationship: { interest: 0, awkwardness: 0, patience: 0, safety: 0 }, eventSummary: '',
    event: null, validEventSuggestions: [], world: null
  });
  assert.deepEqual(result, reply);
  assert.equal(requests.length, 3);
  assert.equal(requests[0].generationConfig.maxOutputTokens, 4096);
  assert.equal(requests[2].generationConfig.maxOutputTokens, 8192);
});
