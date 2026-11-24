/**
 * Saved arc-flash boundaries and working distances are millimetres. Legacy or
 * hand-authored results that record inches or feet must be converted at the
 * project migration and import boundaries, and a boundary that contradicts the
 * incident energy must be withheld as invalid instead of displayed as mm.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ARC_FLASH_BOUNDARY_INSIDE_WORKING_DISTANCE_REASON,
  assessArcFlashResultPlausibility,
  normalizeArcFlashResultEntry,
  normalizeArcFlashResultUnits,
  normalizeStudyResultsArcFlashUnits,
} from '../analysis/arcFlashResultUnits.mjs';

const storage = {};
globalThis.localStorage = {
  getItem: key => (key in storage ? storage[key] : null),
  setItem: (key, value) => { storage[key] = String(value); },
  removeItem: key => { delete storage[key]; },
  clear: () => { Object.keys(storage).forEach(key => delete storage[key]); },
  key: index => Object.keys(storage)[index] ?? null,
  get length() { return Object.keys(storage).length; },
};

const legacyInches = () => ({
  _meta: { status: 'Sample' },
  'comp-swbd-101': {
    equipmentTag: 'SWBD-101',
    incidentEnergy: 3.8,
    boundary: 42,
    boundaryUnit: 'in',
    workingDistanceIn: 18,
  },
});

// Inches -> mm, rounded to 0.1 mm; the unit marker is removed.
{
  const entry = normalizeArcFlashResultEntry(legacyInches()['comp-swbd-101']);
  assert.equal(entry.boundary, 1066.8);
  assert.equal('boundaryUnit' in entry, false);
  assert.equal(entry.workingDistance, 457.2);
  assert.equal(entry.workingDistanceIn, 18, 'the original inch field is preserved');
  assert.equal(normalizeArcFlashResultEntry({ boundary: 23, boundaryUnit: ' Inches ' }).boundary, 584.2);
  assert.equal(normalizeArcFlashResultEntry({ boundary: 30, boundaryUnit: 'inch' }).boundary, 762);
}

// Feet and metres -> mm.
assert.equal(normalizeArcFlashResultEntry({ boundary: 3.5, boundaryUnit: 'ft' }).boundary, 1066.8);
assert.equal(normalizeArcFlashResultEntry({ boundary: 1.2, boundaryUnit: 'm' }).boundary, 1200);
assert.equal('boundaryUnit' in normalizeArcFlashResultEntry({ boundary: 900, boundaryUnit: 'mm' }), false);

// workingDistanceIn only fills a missing mm working distance.
assert.equal(normalizeArcFlashResultEntry({ workingDistanceIn: 24 }).workingDistance, 609.6);
assert.equal(normalizeArcFlashResultEntry({ workingDistance: 455, workingDistanceIn: 18 }).workingDistance, 455);

// Unknown units are left for the plausibility check rather than guessed.
{
  const unknown = { boundary: 42, boundaryUnit: 'cubits' };
  assert.equal(normalizeArcFlashResultEntry(unknown), unknown);
  assert.equal(assessArcFlashResultPlausibility(unknown).plausible, false);
}

// Idempotent: a second pass returns the same objects and never re-converts.
{
  const once = normalizeArcFlashResultUnits(legacyInches());
  const twice = normalizeArcFlashResultUnits(once);
  assert.equal(twice, once);
  assert.equal(twice['comp-swbd-101'].boundary, 1066.8);
  assert.deepEqual(twice._meta, { status: 'Sample' });
  const engineShaped = { BUS1: { incidentEnergy: 4.2, boundary: 900, workingDistance: 455 } };
  assert.equal(normalizeArcFlashResultUnits(engineShaped), engineShaped);
  const studies = { shortCircuit: { BUS1: { threePhaseKA: 10 } }, arcFlash: legacyInches() };
  const normalizedStudies = normalizeStudyResultsArcFlashUnits(studies);
  assert.equal(normalizedStudies.shortCircuit, studies.shortCircuit);
  assert.equal(normalizedStudies.arcFlash['comp-swbd-101'].boundary, 1066.8);
  assert.equal(normalizeStudyResultsArcFlashUnits(normalizedStudies), normalizedStudies);
}

// Plausibility: above 1.2 cal/cm² the boundary must lie beyond the working distance.
{
  const invalid = assessArcFlashResultPlausibility({ incidentEnergy: 3.8, boundary: 42, workingDistance: 457 });
  assert.equal(invalid.plausible, false);
  assert.equal(invalid.code, 'boundary-inside-working-distance');
  assert.equal(invalid.reason, ARC_FLASH_BOUNDARY_INSIDE_WORKING_DISTANCE_REASON);
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 3.8, boundary: 1067, workingDistance: 457 }).plausible, true);
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 0.9, boundary: 356, workingDistance: 457 }).plausible, true);
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 1.2, boundary: 400, workingDistance: 455 }).plausible, true);
  // The 455 mm engine default applies when no working distance was recorded.
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 2, boundary: 400 }).plausible, false);
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 2, boundary: 460 }).plausible, true);
  // IEEE 1584-2018 0.6-15 kV interpolation can leave a correct boundary a few
  // percent inside the working distance just above 1.2 cal/cm².
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: 1.21, boundary: 1915.2, workingDistance: 2000 }).plausible, true);
  // An un-normalized inch value is never read as mm, even below 1.2 cal/cm².
  const unconverted = assessArcFlashResultPlausibility({ incidentEnergy: 0.7, boundary: 12, boundaryUnit: 'in' });
  assert.equal(unconverted.plausible, false);
  assert.equal(unconverted.code, 'boundary-unit-not-mm');
  assert.equal(assessArcFlashResultPlausibility({ incidentEnergy: null, boundary: 0 }).plausible, true);
}

// The guard never rejects a result the IEEE 1584-2018 engine can produce:
// sweep LV and MV cases whose energy lands just above 1.2 cal/cm², rounded
// exactly as analysis/arcFlash.mjs stores them.
{
  const { ELECTRODE_CONFIGS, arcingCurrents, incidentEnergy } = await import('../analysis/ieee1584.mjs');
  let checked = 0;
  for (const EC of ELECTRODE_CONFIGS) {
    for (const Voc_kV of [0.208, 0.48, 0.6, 0.8, 0.858, 0.958, 1, 2.4, 4.16, 6.9, 13.8]) {
      for (const Ibf_kA of [0.2, 1, 10, 40, 106]) {
        for (const D_mm of [305, 455, 910, 2000]) {
          for (const G_mm of Voc_kV <= 0.6 ? [25, 76.2] : [19.05, 152]) {
            const params = { EC, Voc_kV, Ibf_kA, G_mm, D_mm };
            const currents = arcingCurrents({ ...params, height_mm: 508, width_mm: 508, depth_mm: 508 });
            for (const scenario of ['full', 'reduced']) {
              const energyAtOneSecond = incidentEnergy(params, currents, scenario, 1).E_cal;
              if (!(energyAtOneSecond > 0)) continue;
              for (const target of [1.2051, 1.21, 1.3, 4, 40]) {
                const result = incidentEnergy(params, currents, scenario, target / energyAtOneSecond);
                const entry = {
                  incidentEnergy: Number(result.E_cal.toFixed(2)),
                  boundary: Number(result.AFB_mm.toFixed(1)),
                  workingDistance: Number(D_mm.toFixed(1)),
                };
                assert.equal(assessArcFlashResultPlausibility(entry).plausible, true,
                  `engine result flagged: ${JSON.stringify({ EC, Voc_kV, Ibf_kA, G_mm, scenario, ...entry })}`);
                checked += 1;
              }
            }
          }
        }
      }
    }
  }
  assert.ok(checked > 1000);
}

// migrateProject normalizes saved results, including the legacy `studies` key.
const { defaultProject, migrateProject } = await import('../projectStorage.js');
{
  const project = defaultProject();
  project.settings.studyResults = { arcFlash: legacyInches() };
  project.settings.studies = { arcFlash: legacyInches() };
  const migrated = migrateProject(project);
  assert.equal(migrated.settings.studyResults.arcFlash['comp-swbd-101'].boundary, 1066.8);
  assert.equal(migrated.settings.studyResults.arcFlash['comp-swbd-101'].workingDistance, 457.2);
  assert.equal(migrated.settings.studies.arcFlash['comp-swbd-101'].boundary, 1066.8);
  assert.equal(project.settings.studyResults.arcFlash['comp-swbd-101'].boundary, 42, 'migration does not mutate its input');
  const remigrated = migrateProject(JSON.parse(JSON.stringify(migrated)));
  assert.equal(remigrated.settings.studyResults.arcFlash['comp-swbd-101'].boundary, 1066.8, 'migration is idempotent');
}

// importProject (sample gallery, file import, saved projects, server sync)
// writes study results through setStudies, not migrateProject, so it must
// normalize them itself before they reach scenario storage.
const dataStore = await import('../dataStore.mjs');
{
  const exported = JSON.parse(JSON.stringify(dataStore.exportProject()));
  exported.settings = { ...(exported.settings || {}), studyResults: { arcFlash: legacyInches() } };
  assert.equal(dataStore.importProject(exported), true, dataStore.getLastProjectImportError());
  const imported = dataStore.getStudies().arcFlash['comp-swbd-101'];
  assert.equal(imported.boundary, 1066.8);
  assert.equal('boundaryUnit' in imported, false);
  assert.equal(imported.workingDistance, 457.2);

  // Gallery samples keep results under the legacy settings.studies key.
  const legacyKeyed = JSON.parse(JSON.stringify(dataStore.exportProject()));
  delete legacyKeyed.settings.studyResults;
  legacyKeyed.settings.studies = { arcFlash: legacyInches() };
  assert.equal(dataStore.importProject(legacyKeyed), true, dataStore.getLastProjectImportError());
  assert.equal(dataStore.getStudies().arcFlash['comp-swbd-101'].boundary, 1066.8);
}

// The bundled workflow sample stores engine-shaped mm values.
{
  const sample = JSON.parse(await readFile(new URL('../samples/project-workflow-core.json', import.meta.url), 'utf8'));
  const arcFlash = sample.settings.studies.arcFlash;
  assert.equal(arcFlash._meta.status, 'Sample');
  const rows = Object.entries(arcFlash).filter(([key]) => !key.startsWith('_'));
  assert.equal(rows.length, 9);
  rows.forEach(([id, row]) => {
    assert.equal('boundaryUnit' in row, false, `${id} must not carry a boundaryUnit`);
    assert.equal('workingDistanceIn' in row, false, `${id} must store workingDistance in mm`);
    assert.equal(row.workingDistance, 457.2, `${id} working distance`);
    assert.equal(assessArcFlashResultPlausibility(row).plausible, true, `${id} boundary must be consistent with its incident energy`);
    const expectedRating = row.incidentEnergy > 1.2 ? Math.ceil(Math.round(row.incidentEnergy * 1e6) / 1e4) / 100 : 0;
    assert.equal(row.minimumArcRatingCalCm2, expectedRating, `${id} minimum arc rating follows the engine rule`);
  });
  assert.equal(arcFlash['comp-swbd-101'].boundary, 1066.8);
}

console.log('arc-flash result unit normalization and plausibility tests passed');
