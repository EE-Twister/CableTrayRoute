import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server.mjs';
import {
  assessCanonicalStudy,
  getCanonicalStudyProjectIdentity,
  getCanonicalStudySourceSnapshot,
  validateAndNormalizeCanonicalProject,
} from '../src/canonicalProject.mjs';
import { buildStudyProvenance, captureStudyRunContext } from '../analysis/studyLifecycle.mjs';

const cable = {
  id: 'C-1', tag: 'VD-1', conductor_size: '500 kcmil', conductor_material: 'CU',
  operating_voltage: '', est_load: '', length: 500, phases: 3, to_tag: 'BUS-1',
};
const loadFlow = {
  converged: true,
  buses: [{ id: 'BUS-1', baseKV: 0.48, Pd: 83.138, Qd: 51.67 }],
};

function buildProject(id, { withProvenance = true, changedLength = null } = {}) {
  const project = {
    schemaVersion: 1,
    meta: { version: 1, scenario: 'base', scenarios: ['base'] },
    ductbanks: [], conduits: [], trays: [], cableTypicals: [], panels: [], equipment: [], loads: [],
    cables: [{ ...cable, ...(changedLength === null ? {} : { length: changedLength }) }],
    oneLine: { activeSheet: 0, sheets: [] },
    settings: {
      projectMeta: { id, name: id },
      studySettings: { balanced: true, baseMVA: 100 },
      studyResults: { loadFlow },
    },
  };
  if (withProvenance) {
    // Capture the run against the original 500 ft source, then optionally
    // mutate the persisted project to exercise a stale completion.
    const sourceProject = changedLength === null
      ? project
      : { ...project, cables: [cable] };
    const canonical = validateAndNormalizeCanonicalProject(sourceProject);
    const context = captureStudyRunContext('loadFlow', {
      projectSnapshot: getCanonicalStudySourceSnapshot(canonical, 'loadFlow'),
      projectIdentity: { projectId: id, projectName: id },
      scenario: 'base',
      inputs: { oneLine: canonical.oneLine },
      options: { balanced: true },
      settings: { studySettings: project.settings.studySettings },
      dependencies: {},
      capturedAt: '2026-09-17T00:00:00.000Z',
    });
    project.settings.studyProvenance = {
      loadFlow: buildStudyProvenance('loadFlow', loadFlow, context),
    };
  }
  return project;
}

test('canonical v2 assessment distinguishes current, stale, and missing projects', () => {
  const current = validateAndNormalizeCanonicalProject(buildProject('current'));
  const stale = validateAndNormalizeCanonicalProject(buildProject('stale', { changedLength: 600 }));
  const missing = validateAndNormalizeCanonicalProject(buildProject('missing', { withProvenance: false }));
  assert.equal(assessCanonicalStudy(current, 'loadFlow', { projectName: 'current' }).freshness, 'current');
  assert.equal(assessCanonicalStudy(current, 'loadFlow', { projectName: 'current' }).eligible, true);
  assert.equal(assessCanonicalStudy(stale, 'loadFlow', { projectName: 'stale' }).freshness, 'stale');
  assert.equal(assessCanonicalStudy(stale, 'loadFlow', { projectName: 'stale' }).eligible, false);
  assert.equal(assessCanonicalStudy(missing, 'loadFlow', { projectName: 'missing' }).freshness, 'unknown');
  assert.equal(assessCanonicalStudy(missing, 'loadFlow', { projectName: 'missing' }).eligible, false);
  assert.deepEqual(
    getCanonicalStudyProjectIdentity({ settings: { projectMeta: { id: 'metadata-id', name: 'Display name' } } }, 'saved-key'),
    { projectId: 'saved-key', projectName: 'Display name' },
  );
});

test('voltage-drop endpoint uses only an eligible v2 load-flow result per project', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ctr-canonical-lifecycle-'));
  const app = await createApp({ dataDir, staticRoot: process.cwd(), enforceHttps: false, rateLimit: { max: 500, windowMs: 60000 } });
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body, headers = {}) => fetch(base + url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
  try {
    await post('/signup', { username: 'canonical-lifecycle', password: 'CanonicalPass123!' });
    const login = await post('/login', { username: 'canonical-lifecycle', password: 'CanonicalPass123!' });
    const session = await login.json();
    const auth = { Authorization: `Bearer ${session.token}`, 'X-CSRF-Token': session.csrfToken };
    for (const [name, project] of [
      ['current', buildProject('current')],
      ['stale', buildProject('stale', { changedLength: 600 })],
      ['missing', buildProject('missing', { withProvenance: false })],
    ]) {
      const saved = await post(`/projects/${name}`, { data: project }, auth);
      assert.equal(saved.status, 200);
    }
    const readStudy = async name => {
      const response = await post(`/api/v1/projects/${name}/studies/voltage-drop`, {}, auth);
      assert.equal(response.status, 200);
      return (await response.json()).voltageDrop;
    };
    const current = await readStudy('current');
    const stale = await readStudy('stale');
    const missing = await readStudy('missing');
    assert.equal(current.summary.evaluated, 1);
    assert.equal(current.results[0].inputSource.current, 'Load Flow');
    assert.equal(stale.results[0].inputSource.current, 'missing');
    assert.equal(stale.summary.evaluated, 0);
    assert.equal(missing.results[0].inputSource.current, 'missing');
    assert.equal(missing.summary.evaluated, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
