import { createFirstDateServer } from './src/first-date.mjs';

const allowedOrigins = (process.env.DATE_ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean);
const port = Number(process.env.DATE_PORT ?? 8787);
createFirstDateServer({ allowedOrigins }).listen(port, process.env.DATE_HOST || '127.0.0.1', () => {
  console.log('First-date voice service listening on port', port);
});
