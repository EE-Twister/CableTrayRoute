import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SAMPLE_PROJECT_SCHEMA_VERSION,
  buildGuidedDemoChecklist,
  buildSampleProjectSummary,
  normalizeSampleProjectManifest,
  prepareSampleProjectForImport,
  validateSampleProjectPayload,
} from '../analysis/sampleGallery.mjs';

function describe(name, fn) {
  console.log(name);
  fn();
}

function it(name, fn) {
  try {
    fn();
    console.log('  \u2713', name);
  } catch (err) {
    console.error('  \u2717', name, err.message || err);
    process.exitCode = 1;
  }
}

const root = path.resolve('.');
const manifestPath = path.join(root, 'samples', 'project-gallery.json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

const manifest = normalizeSampleProjectManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));

describe('sample project gallery', () => {
  it('loads the v1 manifest with the six required sample categories', () => {
    assert.equal(manifest.version, SAMPLE_PROJECT_SCHEMA_VERSION);
    assert.equal(manifest.samples.length, 6);
    assert.deepEqual(
      manifest.samples.map(sample => sample.id).sort(),
      [
        'coordination-study',
        'data-center',
        'duct-bank',
        'heat-trace-package',
        'industrial-plant',
        'substation-ground-grid',
      ],
    );
  });

  it('uses unique sample IDs and existing project and preview paths', () => {
    const ids = new Set();
    manifest.samples.forEach(sample => {
      assert(!ids.has(sample.id), `Duplicate sample id ${sample.id}`);
      ids.add(sample.id);
      assert(fs.existsSync(path.join(root, sample.projectPath)), `${sample.projectPath} does not exist`);
      assert(fs.existsSync(path.join(root, sample.preview)), `${sample.preview} does not exist`);
    });
  });

  it('validates every sample payload against the import-project field set', () => {
    manifest.samples.forEach(sample => {
      const payload = readJson(sample.projectPath);
      const validation = validateSampleProjectPayload(payload);
      assert.equal(validation.valid, true, `${sample.id}: ${validation.errors.join('; ')}`);
      const summary = buildSampleProjectSummary(payload);
      assert(summary.cables + summary.trays + summary.conduits + summary.ductbanks + summary.studyCount > 0);
    });
  });

  it('builds non-empty guided checklists with valid local page links', () => {
    manifest.samples.forEach(sample => {
      const payload = readJson(sample.projectPath);
      const checklist = buildGuidedDemoChecklist(sample, payload);
      assert(checklist.length >= 3, `${sample.id} checklist is too short`);
      checklist.forEach((step, index) => {
        assert.equal(step.order, index + 1);
        const page = step.href.split('#')[0];
        assert(page.endsWith('.html'), `${sample.id} step ${step.id} is not an html link`);
        assert(fs.existsSync(path.join(root, page)), `${sample.id} step ${step.id} target ${page} missing`);
      });
    });
  });

  it('prepares import payloads without losing schedules or settings', () => {
    const sample = manifest.samples.find(row => row.id === 'heat-trace-package');
    const payload = readJson(sample.projectPath);
    const prepared = prepareSampleProjectForImport(sample, payload);

    assert.notEqual(prepared, payload);
    assert.equal(prepared.cables.length, payload.cables.length);
    assert.deepEqual(prepared.settings.studyResults, payload.settings.studyResults);
    assert.equal(prepared.settings.sampleProjectInfo.id, sample.id);
    assert.equal(prepared.settings.sampleProjectInfo.title, sample.title);
    assert.equal(prepared.settings.sampleProjectInfo.startPage, sample.startPage);
    assert.equal(payload.settings.sampleProjectInfo, undefined);
  });

  it('rejects invalid sample payloads with missing required fields', () => {
    const validation = validateSampleProjectPayload({ cables: [], settings: {} });
    assert.equal(validation.valid, false);
    assert(validation.errors.some(error => error.includes('ductbanks')));
    assert(validation.errors.some(error => error.includes('trays')));

    const invalidSettings = validateSampleProjectPayload({
      ductbanks: [],
      conduits: [],
      trays: [],
      cables: [],
      cableTypicals: [],
      panels: [],
      equipment: [],
      loads: [],
      settings: [],
    });
    assert.equal(invalidSettings.valid, false);
    assert(invalidSettings.errors.some(error => error.includes('settings')));
  });
});
