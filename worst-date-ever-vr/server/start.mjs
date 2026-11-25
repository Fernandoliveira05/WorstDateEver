import { loadEnvFile } from 'node:process';
import { createFirstDateServer } from './src/first-date.mjs';

try { loadEnvFile('.env'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const allowedOrigins = (process.env.DATE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
const port = Number(process.env.DATE_PORT ?? 8787);
const provider = process.env.GEMINI_API_KEY && process.env.DATE_GEMINI_DIALOGUE_MODEL && process.env.DATE_GEMINI_STT_MODEL ? 'Google Gemini' :
  process.env.DEEPSEEK_API_KEY && process.env.DATE_WHISPER_URL ? 'DeepSeek + Whisper local' :
  process.env.DATE_GEMMA_URL && process.env.DATE_WHISPER_URL ? 'Gemma + Whisper local' :
  process.env.OPENAI_API_KEY && process.env.DATE_DIALOGUE_MODEL && process.env.DATE_STT_MODEL ? 'OpenAI' : null;
createFirstDateServer({ allowedOrigins }).listen(port, process.env.DATE_HOST || '127.0.0.1', () => {
  console.log('First-date voice service listening on port', port);
  console.log(provider ? 'Voice provider: ' + provider :
    'Voice provider: NOT CONFIGURED. Copy .env.example to .env and fill the selected provider variables.');
});
