import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

async function startServer(options) {
  const app = await createApp(options);
  return new Promise(resolve => {
    const server = app.listen(0, () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

async function closeServer(server) {
  await new Promise(resolve => server.close(resolve));
}

async function check(name, fn) {
  try {
    await fn();
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('static asset fingerprint fallback');

const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-static-assets-'));
const staticRoot = path.join(tmpRoot, 'static');
const dataDir = path.join(tmpRoot, 'data');
await fs.mkdir(path.join(staticRoot, 'dist', 'vendor'), { recursive: true });
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(path.join(staticRoot, 'dist', 'scenarios.js'), 'export const scenarioFallback = true;\n');
await fs.writeFile(path.join(staticRoot, 'dist', 'style.css'), 'body { color: rgb(1, 2, 3); }\n');
await fs.writeFile(path.join(staticRoot, 'dist', 'vendor', 'handlebars.min.js'), 'window.Handlebars = {};\n');
await fs.writeFile(path.join(staticRoot, 'dist', 'scenarios.aaaaaaaaaaaa.js'), 'export const exactFingerprint = true;\n');

const { server, port } = await startServer({
  staticRoot,
  dataDir,
  rateLimit: { windowMs: 60000, max: 100 },
  enforceHttps: false
});
const baseUrl = `http://127.0.0.1:${port}`;

try {
  await check('serves exact fingerprinted assets when present', async () => {
    const res = await fetch(`${baseUrl}/dist/scenarios.aaaaaaaaaaaa.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /exactFingerprint/);
  });

  await check('falls back from stale fingerprinted JS to the logical dist asset', async () => {
    const res = await fetch(`${baseUrl}/dist/scenarios.9163aaf6e26f.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /scenarioFallback/);
  });

  await check('falls back from stale fingerprinted CSS to the logical dist asset', async () => {
    const res = await fetch(`${baseUrl}/dist/style.a80a3d387a5b.css`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /rgb\(1, 2, 3\)/);
  });

  await check('falls back from stale vendor fingerprints while preserving subdirectories', async () => {
    const res = await fetch(`${baseUrl}/dist/vendor/handlebars.min.0e5416f145e7.js`);
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Handlebars/);
  });

  await check('leaves unknown missing fingerprinted assets as 404', async () => {
    const res = await fetch(`${baseUrl}/dist/missing.123456789abc.js`);
    assert.equal(res.status, 404);
  });
} finally {
  await closeServer(server);
  await fs.rm(tmpRoot, { recursive: true, force: true });
}
