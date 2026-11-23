import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCanonicalProject, previewCanonicalProject, validateAndNormalizeCanonicalProject } from '../src/canonicalProject.mjs';

test('normalizes legacy array one-line and schedule aliases without dropping records', () => {
  const project = validateAndNormalizeCanonicalProject({
    cableSchedule: [{ id: 'C-1' }],
    loadList: [{ id: 'L-1' }],
    oneLine: [{ id: 'sheet-1' }],
    raceways: { trays: [{ id: 'T-1' }] }
  });
  assert.equal(project.cables[0].id, 'C-1');
  assert.equal(project.loads[0].id, 'L-1');
  assert.equal(project.oneLine.sheets[0].id, 'sheet-1');
  assert.equal(project.trays[0].id, 'T-1');
});

test('rejects malformed present fields instead of converting them to empty arrays', () => {
  const preview = previewCanonicalProject({ schemaVersion: 1, cables: { bad: true } });
  assert.equal(preview.valid, false);
  assert.ok(preview.errors.length);
});

test('preserves scenario envelope metadata for boundary callers', () => {
  const project = normalizeCanonicalProject({ meta: { scenario: 'future', scenarios: ['base', 'future'] } });
  assert.equal(project.meta.scenario, 'future');
  assert.deepEqual(project.meta.scenarios, ['base', 'future']);
});

test('rejects recursive scenario envelopes before applying them', () => {
  const preview = previewCanonicalProject({ schemaVersion: 1, scenarioData: { base: { scenarioData: {} } } });
  assert.equal(preview.valid, false);
});

test('previews complete two-scenario envelopes without double-counting the active scenario', () => {
  const valid = {
    schemaVersion: 1,
    meta: { version: 1, scenario: 'base', scenarios: ['base', 'future'] },
    ductbanks: [], conduits: [], trays: [], cableTypicals: [], panels: [], equipment: [], loads: [], settings: {},
    cables: [{ id: 'BASE-1' }],
    scenarioData: {
      base: { schemaVersion: 1, ductbanks: [], conduits: [], trays: [], cables: [{ id: 'BASE-1' }], cableTypicals: [], panels: [], equipment: [], loads: [], settings: {} },
      future: { schemaVersion: 1, ductbanks: [], conduits: [], trays: [], cables: [{ id: 'FUTURE-1' }], cableTypicals: [], panels: [], equipment: [], loads: [], settings: {} },
    },
  };
  const preview = previewCanonicalProject(valid);
  assert.equal(preview.valid, true);
  assert.equal(preview.counts.scenarios, 2);
  assert.equal(preview.scenarioCounts.base.cables, 1);
  assert.equal(preview.scenarioCounts.future.cables, 1);
});

test('rejects invalid scenario identifiers consistently at the canonical boundary', () => {
  const valid = {
    schemaVersion: 1, meta: { version: 1, scenario: 'base', scenarios: ['base'] },
    ductbanks: [], conduits: [], trays: [], cables: [], cableTypicals: [], panels: [], equipment: [], loads: [], settings: {},
  };
  const preview = previewCanonicalProject({ ...valid, meta: { ...valid.meta, scenarios: ['base', 'future scenario'] } });
  assert.equal(preview.valid, false);
  assert.match(preview.errors[0].message, /scenario/i);
});
