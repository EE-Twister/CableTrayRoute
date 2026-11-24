/**
 * Cable rows that record the system voltage only as `voltage` must get the
 * `operating_voltage` the Cable Schedule column, its summary strip, and the
 * sizing and voltage-drop checks read. The copy happens at the project
 * migration and import boundaries, never overwrites an existing operating
 * voltage, keeps the original field, and is idempotent.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeCableOperatingVoltage,
  normalizeCableOperatingVoltageEntry,
  parseCableSystemVoltage,
} from '../analysis/cableOperatingVoltage.mjs';

// A pre-snapshot saved project, read by loadProject's legacy branch.
const storage = {
  CTR_SAVED_PROJECTS_V1: JSON.stringify({
    'Legacy Cables': { cables: [{ tag: 'L-1', from: 'A', to: 'B', conductor_size: '#10 AWG', length: 20, voltage: '208' }] },
  }),
};
globalThis.localStorage = {
  getItem: key => (key in storage ? storage[key] : null),
  setItem: (key, value) => { storage[key] = String(value); },
  removeItem: key => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(key => delete storage[key]); },
  key: index => Object.keys(storage)[index] ?? null,
  get length() { return Object.keys(storage).length; },
};

// Numeric, string, and volt-suffixed forms parse to volts.
assert.equal(parseCableSystemVoltage(480), 480);
assert.equal(parseCableSystemVoltage('480'), 480);
assert.equal(parseCableSystemVoltage(' 480 V '), 480);
assert.equal(parseCableSystemVoltage('480V'), 480);
assert.equal(parseCableSystemVoltage('120 volts'), 120);
assert.equal(parseCableSystemVoltage('277.5 VAC'), 277.5);

// Anything that is not a plain positive voltage is left alone.
['480/277', '13.8 kV', '600 V rated', 'LV', '', '   ', '0', '-480', 0, -120, NaN, Infinity, null, undefined, true, {}, ['480']]
  .forEach(value => assert.equal(parseCableSystemVoltage(value), null, `${JSON.stringify(value)} is not parsed`));

// A blank operating voltage is filled; `voltage` and other fields are kept.
{
  const cable = { tag: 'C-1', voltage: '480', cable_rating: 600 };
  const normalized = normalizeCableOperatingVoltageEntry(cable);
  assert.deepEqual(normalized, { tag: 'C-1', voltage: '480', cable_rating: 600, operating_voltage: 480 });
  assert.equal(cable.operating_voltage, undefined, 'the input row is not mutated');
  assert.equal(normalizeCableOperatingVoltageEntry({ voltage: '208 V', operating_voltage: null }).operating_voltage, 208);
  assert.equal(normalizeCableOperatingVoltageEntry({ voltage: 120, operating_voltage: '  ' }).operating_voltage, 120);
}

// An existing operating voltage is never overwritten, and rows without a
// usable `voltage` are returned unchanged.
{
  const kept = [
    { voltage: '480', operating_voltage: 208 },
    { voltage: '480', operating_voltage: '4160' },
    { voltage: '480', operating_voltage: 0 },
    { voltage: '13.8 kV' },
    { voltage: '480/277' },
    { cable_rating: 600 },
    {},
  ];
  kept.forEach(cable => assert.equal(normalizeCableOperatingVoltageEntry(cable), cable, JSON.stringify(cable)));
  [null, undefined, 'C-1', ['480']].forEach(value => assert.equal(normalizeCableOperatingVoltageEntry(value), value));
}

// Arrays: only changed rows are copied; a second pass returns the same array.
{
  const untouched = { tag: 'C-2', operating_voltage: 208, voltage: '480' };
  const cables = [{ tag: 'C-1', voltage: '480' }, untouched];
  const once = normalizeCableOperatingVoltage(cables);
  assert.notEqual(once, cables);
  assert.equal(once[0].operating_voltage, 480);
  assert.equal(once[1], untouched);
  assert.equal(cables[0].operating_voltage, undefined, 'the input array is not mutated');
  assert.equal(normalizeCableOperatingVoltage(once), once, 'normalization is idempotent');
  const alreadyNormal = [untouched];
  assert.equal(normalizeCableOperatingVoltage(alreadyNormal), alreadyNormal);
  const notArray = { 0: { voltage: '480' } };
  assert.equal(normalizeCableOperatingVoltage(notArray), notArray, 'non-arrays are left for schema validation');
  assert.equal(normalizeCableOperatingVoltage(undefined), undefined);
}

// migrateProject fills operating_voltage for current and legacy (v0) shapes.
const { defaultProject, migrateProject } = await import('../projectStorage.js');
{
  const project = defaultProject();
  project.cables = [{ tag: 'C-1', voltage: '480', cable_rating: 600 }, { tag: 'C-2', voltage: '480', operating_voltage: 208 }];
  const migrated = migrateProject(project);
  assert.equal(migrated.cables[0].operating_voltage, 480);
  assert.equal(migrated.cables[0].voltage, '480');
  assert.equal(migrated.cables[0].cable_rating, 600);
  assert.equal(migrated.cables[1].operating_voltage, 208);
  assert.equal(project.cables[0].operating_voltage, undefined, 'migration does not mutate its input');
  const remigrated = migrateProject(JSON.parse(JSON.stringify(migrated)));
  assert.deepEqual(remigrated.cables, migrated.cables, 'migration is idempotent');

  const legacy = migrateProject({ cableSchedule: [{ tag: 'C-3', voltage: '120 V' }] });
  assert.equal(legacy.cables[0].operating_voltage, 120, 'the legacy cableSchedule alias is normalized');
  assert.throws(() => migrateProject({ ...defaultProject(), cables: {} }), 'a non-array cable list still fails validation');
}

// importProject (sample gallery, file import, saved projects, server sync)
// writes cables through setCables, not migrateProject, so it normalizes them.
const dataStore = await import('../dataStore.mjs');
{
  const exported = JSON.parse(JSON.stringify(dataStore.exportProject()));
  exported.cables = [
    { tag: 'C-1', from: 'SWBD-1', to: 'MCC-1', conductor_size: '500 kcmil', length: 145, voltage: '480', cable_rating: 600 },
    { tag: 'C-2', from: 'MCC-1', to: 'P-1', conductor_size: '#10 AWG', length: 95, voltage: '480', operating_voltage: 460 },
  ];
  assert.equal(dataStore.importProject(exported), true, dataStore.getLastProjectImportError());
  const [first, second] = dataStore.getCables();
  assert.equal(first.operating_voltage, 480);
  assert.equal(first.voltage, '480');
  assert.equal(first.cable_rating, 600);
  assert.equal(second.operating_voltage, 460, 'an imported operating voltage is kept');
}

// Legacy saved projects bypass importProject and are normalized on load too.
{
  assert.equal(dataStore.loadProject('Legacy Cables'), true);
  const [legacy] = dataStore.getCables();
  assert.equal(legacy.operating_voltage, 208);
  assert.equal(legacy.voltage, '208');
}

// The bundled workflow sample, imported the way the sample gallery does it,
// shows operating voltages and a summary strip that agrees with the step header.
{
  const { migrateSampleProject, sampleProjectToImportPayload } = await import('../analysis/sampleGallery.mjs');
  const { cableSummaryHtml } = await import('../src/components/scheduleSummary.mjs');
  const { getStepStatus } = await import('../src/workflowStatus.js');
  const sample = JSON.parse(await readFile(new URL('../samples/project-workflow-core.json', import.meta.url), 'utf8'));
  const payload = sampleProjectToImportPayload(migrateSampleProject(sample));
  assert.equal(dataStore.importProject(payload), true, dataStore.getLastProjectImportError());
  const cables = dataStore.getCables();
  assert.equal(cables.length, 14);
  cables.forEach(cable => {
    assert.equal(cable.operating_voltage, Number(cable.voltage), `${cable.tag} operating voltage`);
    assert.notEqual(cable.operating_voltage, cable.cable_rating, `${cable.tag} does not take the insulation rating`);
  });
  const strip = cableSummaryHtml(cables).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  assert.match(strip, /^14 Cables Low voltage 14 .+ ft Total length 14 of 14 Schedule-ready 0 Missing operating voltage$/);
  assert.equal(getStepStatus('cableSchedule').label, '14 schedule-ready');
  assert.equal(getStepStatus('fillRouting').complete, true, 'sample route results stay current after normalization');
}

console.log('cable operating voltage normalization tests passed');
