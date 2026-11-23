import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.mjs';

const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-study-isolation-'));
const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { max: 500, windowMs: 60000 } });
const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
const base = `http://127.0.0.1:${server.address().port}`;
let auth = {};
const post = async (url, data) => {
  const response = await fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify(data) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify({ url, status: response.status, body }));
  return body;
};

try {
  await fetch(base + '/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'isolation-fixture', password: 'LocalFixture123!' }) });
  const session = await post('/login', { username: 'isolation-fixture', password: 'LocalFixture123!' });
  auth = { Authorization: `Bearer ${session.token}`, 'X-CSRF-Token': session.csrfToken };
  const fixtures = ['A', 'B'].map((prefix, index) => ({
    prefix,
    sheets: [{ name: prefix, components: [
      { id: `${prefix}-BUS`, type: 'bus', kV: 0.48, z1: { r: 0, x: 0.05 * (index + 1) }, z2: { r: 0, x: 0.05 * (index + 1) }, z0: { r: 0, x: 0.05 * (index + 1) } },
      { id: `${prefix}-MOTOR`, type: 'motor', hp: 100 * (index + 1), voltage: 480, inertia: 5, thevenin_r: 0.01, thevenin_x: 0.03 },
    ] }],
  }));
  for (const fixture of fixtures) {
    for (const shape of ['object', 'array']) {
      await post(`/projects/${fixture.prefix}-${shape}`, { data: { oneLine: shape === 'array' ? fixture.sheets : { activeSheet: 0, sheets: fixture.sheets } } });
    }
  }
  const expected = new Map();
  for (const fixture of fixtures) {
    for (const study of ['short-circuit', 'motor-start']) {
      const object = await post(`/api/v1/projects/${fixture.prefix}-object/studies/${study}`, {});
      const array = await post(`/api/v1/projects/${fixture.prefix}-array/studies/${study}`, {});
      assert.deepEqual(array, object, `${fixture.prefix}/${study} array/object mismatch`);
      const value = object[study === 'short-circuit' ? 'shortCircuit' : 'motorStart'];
      const expectedIds = study === 'short-circuit'
        ? [`${fixture.prefix}-BUS`, `${fixture.prefix}-MOTOR`]
        : [`${fixture.prefix}-MOTOR`];
      assert.deepEqual(Object.keys(value).sort(), expectedIds.sort());
      const numericField = study === 'short-circuit' ? 'threePhaseKA' : 'inrushKA';
      for (const id of expectedIds) {
        if (study === 'short-circuit' && id.endsWith('-MOTOR')) {
          assert.equal(value[id][numericField], null, `${id} has no short-circuit network impedance`);
          assert.equal(value[id].validity, 'unevaluated');
          assert.equal(value[id].calculationStatus, 'incomplete');
        } else {
          assert.ok(Number.isFinite(value[id][numericField]) && value[id][numericField] > 0);
        }
      }
      expected.set(`${fixture.prefix}/${study}`, object);
    }
  }
  const calls = [];
  for (let repeat = 0; repeat < 3; repeat++) {
    for (const fixture of fixtures) {
      for (const study of ['short-circuit', 'motor-start']) {
        for (const shape of ['object', 'array']) calls.push({ prefix: fixture.prefix, study, shape });
      }
    }
  }
  const responses = await Promise.all(calls.map(async ({ prefix, study, shape }) => ({
    prefix,
    study,
    result: await post(`/api/v1/projects/${prefix}-${shape}/studies/${study}`, {})
  })));
  for (const { prefix, study, result } of responses) {
    assert.deepEqual(result, expected.get(`${prefix}/${study}`), `${prefix}/${study} changed under overlap`);
  }
  assert.notDeepEqual(expected.get('A/short-circuit'), expected.get('B/short-circuit'));
  console.log('✓ overlapping study requests preserve project identity and nonempty results');
} finally {
  await new Promise(resolve => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
}
