import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { benchmark } from './benchmark.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const evidence = resolve(root, 'assets/hand-qa/evidence');
const digest = contents => createHash('sha256').update(contents).digest('hex');
const revision = process.env.WDE_QA_CAPTURE_REVISION ?? 'webxr-scripted';
if (!/^webxr-[a-z0-9-]+$/.test(revision)) throw new Error('Invalid capture revision');
const phoneCandidate = revision === 'webxr-scripted'
  ? resolve(root, 'assets/hand-qa/candidates/PROP-013.glb')
  : resolve(evidence, 'PROP-013', revision, 'phone.glb');
const names = new Set(Object.keys(benchmark));

const capture = {
  name: 'wde-hand-qa-capture',
  configureServer(server) {
    server.middlewares.use('/__asset_qa/phone', async (request, response) => {
      if (request.method !== 'POST') {
        response.statusCode = 405;
        return response.end();
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 4_000_000) {
          response.statusCode = 413;
          return response.end();
        }
        chunks.push(chunk);
      }
      const model = Buffer.concat(chunks);
      if (model.toString('ascii', 0, 4) !== 'glTF' || model.length < 20 || model.readUInt32LE(8) !== model.length) {
        response.statusCode = 400;
        return response.end('Invalid iClona GLB');
      }
      if (revision !== 'webxr-scripted') await mkdir(resolve(evidence, 'PROP-013', revision), { recursive: true });
      await writeFile(phoneCandidate, model);
      response.end(digest(model));
    });
    server.middlewares.use('/__asset_qa/capture', async (request, response) => {
      try {
        const uri = new URL(request.url, 'http://localhost');
        const id = uri.searchParams.get('asset');
        const name = uri.searchParams.get('name');
        if (request.method !== 'POST' || !names.has(id) || !/^[a-z0-9_-]{1,55}$/.test(name ?? '')) {
          response.statusCode = 400;
          return response.end('Invalid benchmark capture');
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4_000_000) throw new Error('Capture exceeds 4 MB');
          chunks.push(chunk);
        }
        const { image, metadata } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        const png = Buffer.from(image, 'base64');
        if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
          throw new Error('Expected PNG evidence');
        const directory = resolve(evidence, id, revision);
        await mkdir(directory, { recursive: true });
        const input = id === 'PROP-013' ? phoneCandidate :
          resolve(root, 'assets/hand-qa/candidates', id + '.glb');
        const asset_sha256 = digest(await readFile(input));
        await writeFile(resolve(directory, name + '.png'), png);
        await writeFile(resolve(directory, name + '.json'), JSON.stringify({
          ...metadata, asset_id: id, asset_sha256, image_sha256: digest(png), filename: name + '.png',
          timestamp: new Date().toISOString(), input_mode: 'synthetic'
        }, null, 2) + '\n');
        response.end('ok');
      } catch (error) {
        response.statusCode = 500;
        response.end(error.message);
      }
    });
  }
};
const server = await createServer({
  root, plugins: [capture],
  optimizeDeps: { include: ['three/addons/exporters/GLTFExporter.js'] },
  server: { port: 4190, strictPort: true, host: '127.0.0.1' }
});
await server.listen();
server.printUrls();
