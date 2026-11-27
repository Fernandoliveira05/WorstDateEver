#!/usr/bin/env node
// Drive the existing hand-QA capture fixture through Chromium DevTools Protocol.
//
// Preconditions:
//   1. WDE_QA_CAPTURE_REVISION=webxr-sourced node tools/hand-qa/serve.mjs
//   2. chromium --headless=new --no-sandbox --disable-dev-shm-usage \
//        --use-angle=swiftshader --enable-unsafe-swiftshader \
//        --remote-debugging-port=9222 --user-data-dir=/tmp/wde-chrome about:blank
//
// Usage:
//   node tools/tripo-qa/capture_cdp.mjs --asset-id hardcover-book
//   node tools/tripo-qa/capture_cdp.mjs --asset-id cake-slice --states-only
//
// It writes into assets/hand-qa/evidence/<asset-id>/<WDE_QA_CAPTURE_REVISION>/.
// No Tripo calls and no paid services.

import WebSocket from 'ws';

const args = process.argv.slice(2);
const option = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const assetId = option('--asset-id');
if (!assetId || !/^[a-z0-9_-]{1,55}$/.test(assetId)) {
  console.error('Usage: node tools/tripo-qa/capture_cdp.mjs --asset-id <id> [--states-only]');
  process.exit(2);
}
const host = option('--cdp-host') ?? '127.0.0.1';
const port = option('--cdp-port') ?? '9222';
const page = option('--page') ?? 'http://127.0.0.1:4190/';
const waitMs = Number(option('--wait') ?? 6000);
const statesOnly = args.includes('--states-only');
const cdp = `http://${host}:${port}`;
const pageUrl = `${page}?assetQA=${encodeURIComponent(assetId)}`;

const targetResponse = await fetch(`${cdp}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' });
if (!targetResponse.ok) throw new Error(`Could not create CDP target: ${targetResponse.status}`);
const target = await targetResponse.json();
console.log(`target ${target.id} ${pageUrl}`);

const socket = new WebSocket(target.webSocketDebuggerUrl);
let sequence = 0;
const pending = new Map();
socket.on('message', raw => {
  const message = JSON.parse(raw.toString());
  if (message.id && pending.has(message.id)) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(JSON.stringify(message.error)));
    else resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled') {
    const text = message.params.args.map(arg => arg.value ?? arg.description ?? '').join(' ');
    if (!text.startsWith('[vite]')) console.log('PAGE', text.slice(0, 700));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    console.error('PAGE EXCEPTION', JSON.stringify(message.params.exceptionDetails).slice(0, 1500));
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
await new Promise((resolve, reject) => {
  socket.once('open', resolve);
  socket.once('error', reject);
});
await send('Runtime.enable');
await send('Page.enable');
await new Promise(resolve => setTimeout(resolve, waitMs));

const expression = `(async () => {
  const module = await import('/tools/hand-qa/capture.js');
  const result = await module.captureBenchmark(
    (message) => console.log('CAPTURE ' + JSON.stringify(message)),
    { statesOnly: ${statesOnly} }
  );
  return {
    assetId: result.assetId,
    screenshots: result.screenshots.length,
    untestable: result.untestable,
  };
})()`;
const result = await send('Runtime.evaluate', {
  expression, awaitPromise: true, returnByValue: true, userGesture: true,
});
if (result.exceptionDetails) {
  console.error('CAPTURE FAILED', JSON.stringify(result.exceptionDetails).slice(0, 3000));
  process.exitCode = 1;
} else {
  console.log('RESULT', JSON.stringify(result.result.value));
}
await send('Page.close').catch(() => {});
socket.close();
