import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';
import { calculateVoltageDrop, describeVoltageDropBasis } from '../src/voltageDrop.js';
import { normalizeSizeToken, table9Impedance } from '../src/necTable9.mjs';
import { evaluateCable } from '../analysis/voltageDropStudy.mjs';

async function startServer(options) {
  const app = await createApp(options);
  return new Promise(resolve => {
    const server = app.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

function jsonRequest(base, url, body, headers = {}) {
  return fetch(`${base}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function getSession(base) {
  await jsonRequest(base, '/signup', { username: 'review-regression', password: 'ReviewPass123!' });
  const response = await jsonRequest(base, '/login', { username: 'review-regression', password: 'ReviewPass123!' });
  return response.json();
}

const cable = {
  tag: 'VD-1',
  conductor_size: '500 kcmil',
  conductor_material: 'CU',
  operating_voltage: 480,
  est_load: 100,
  power_factor: 0.85,
  length: 500,
};

assert.equal(normalizeSizeToken('10 mm2'), '');
assert.equal(normalizeSizeToken('10mm²'), '');
assert.equal(normalizeSizeToken('10 AWG trailing garbage'), '');
assert.equal(normalizeSizeToken('2 x 10'), '');
assert.equal(normalizeSizeToken('10 AWG'), '10');
assert.equal(normalizeSizeToken('500 kcmil'), '500');
assert.equal(table9Impedance('10 mm2', 'CU', 'PVC'), null);
assert.ok(table9Impedance('10 AWG', 'CU', 'PVC'));
assert.equal(calculateVoltageDrop({ ...cable, conductor_size: '10 mm2' }, cable.length, 3), null);
assert.equal(calculateVoltageDrop({ ...cable, conductor_size: '10 AWG trailing garbage' }, cable.length, 3), null);

const oneRun = calculateVoltageDrop({ ...cable, parallel_count: 1 }, cable.length, 3);
const twoRuns = calculateVoltageDrop({ ...cable, parallel_count: 2 }, cable.length, 3);
assert.ok(oneRun > 0);
assert.ok(Math.abs(twoRuns - oneRun / 2) < 1e-12);
const pvc = table9Impedance('500 kcmil', 'CU', 'PVC');
const nonmagnetic = table9Impedance('500 kcmil', 'CU', 'nonmagnetic');
assert.deepEqual(nonmagnetic, pvc);
assert.deepEqual(table9Impedance('500 kcmil', 'CU', 'rigid aluminum'), pvc);

const singlePhaseCable = { ...cable, conductor_size: '10 AWG', est_load: 20, operating_voltage: 120, phases: ['A'], power_factor: 1, length: 100 };
assert.equal(evaluateCable(singlePhaseCable).dropPct, 4);
assert.equal(evaluateCable(singlePhaseCable).dropPct, evaluateCable({ ...singlePhaseCable, phases: 1 }).dropPct);
assert.match(describeVoltageDropBasis(singlePhaseCable), /Table 9/);
assert.match(describeVoltageDropBasis({ ...singlePhaseCable, impedance_per_1000ft: 0.6 }), /Resistance override/);
assert.match(describeVoltageDropBasis({ ...singlePhaseCable, conductor_size: '#22 AWG' }), /DC resistance fallback/);
assert.match(describeVoltageDropBasis({ ...singlePhaseCable, conductor_size: '99 AWG' }), /Unsupported/);
assert.equal(evaluateCable({ ...singlePhaseCable, conductor_size: '99 AWG' }).evaluated, false);

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-review-regressions-'));
const { server, base } = await startServer({
  dataDir,
  staticRoot: process.cwd(),
  enforceHttps: false,
  rateLimit: { windowMs: 60_000, max: 500 },
});

try {
  const session = await getSession(base);
  const authHeaders = {
    Authorization: `Bearer ${session.token}`,
    'X-CSRF-Token': session.csrfToken,
  };

  const initialResponse = await jsonRequest(base, '/projects/concurrent', { data: { seed: true } }, authHeaders);
  assert.equal(initialResponse.status, 200);
  const initial = await initialResponse.json();
  const unversionedUpdate = await jsonRequest(base, '/projects/concurrent', { data: { seed: false } }, authHeaders);
  assert.equal(unversionedUpdate.status, 409);
  const staleCreate = await jsonRequest(base, '/projects/deleted-before-update', {
    data: { resurrected: true },
    baseVersion: 'stale-revision'
  }, authHeaders);
  assert.equal(staleCreate.status, 409);
  const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => (
    jsonRequest(base, '/projects/concurrent', {
      patch: { [`field${index}`]: index },
      baseVersion: initial.version,
    }, authHeaders).then(async response => ({ status: response.status, body: await response.json() }))
  )));
  assert.equal(concurrent.filter(result => result.status === 200).length, 1);
  assert.equal(concurrent.filter(result => result.status === 409).length, 7);

  const projectResponse = await jsonRequest(base, '/projects/voltage-drop', {
    data: {
      cables: [{ ...cable, est_load: '', operating_voltage: '', to_tag: 'BUS-1' }],
      loads: [],
      settings: { studyResults: { loadFlow: { buses: [{ id: 'BUS-1', baseKV: 0.48, Pd: 83.138, Qd: 51.67 }] } } },
    }
  }, authHeaders);
  assert.equal(projectResponse.status, 200);
  const studyResponse = await jsonRequest(base, '/api/v1/projects/voltage-drop/studies/voltage-drop', {}, authHeaders);
  assert.equal(studyResponse.status, 200);
  const studyBody = await studyResponse.json();
  assert.equal(studyBody.voltageDrop.summary.total, 1);
  assert.equal(studyBody.voltageDrop.summary.evaluated, 1);

  const staticResponse = await fetch(`${base}/style.css`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(staticResponse.status, 200);
  assert.equal(staticResponse.headers.get('content-encoding'), 'gzip');
  assert.match(staticResponse.headers.get('vary') || '', /accept-encoding/i);
  const disabledCompression = await fetch(`${base}/style.css`, { headers: { 'Accept-Encoding': 'gzip;q=0' } });
  assert.equal(disabledCompression.headers.get('content-encoding'), null);
  assert.match(disabledCompression.headers.get('vary') || '', /accept-encoding/i);
  const rangeResponse = await fetch(`${base}/style.css`, {
    headers: { 'Accept-Encoding': 'gzip', Range: 'bytes=0-10' }
  });
  assert.equal(rangeResponse.status, 206);
  assert.equal(rangeResponse.headers.get('content-encoding'), null);
} finally {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}

console.log('application review regression tests passed');
