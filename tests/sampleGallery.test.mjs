/**
 * Tests for analysis/sampleGallery.mjs.
 *
 * Keeps the gallery registry, sample JSON files, and import payload mapping from
 * drifting apart. The gallery renders cards from SAMPLE_REGISTRY at runtime, so
 * an empty or broken registry produces a blank page for users.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  SCHEMA_VERSION,
  SAMPLE_REGISTRY,
  getSamplesByTag,
  getSampleById,
  validateSampleProject,
  migrateSampleProject,
  sampleProjectToImportPayload,
} from '../analysis/sampleGallery.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function describe(name, fn) { console.log(name); fn(); }
function it(name, fn) {
  try { fn(); console.log('  OK', name); }
  catch (err) { console.error('  FAIL', name, err.message || err); process.exitCode = 1; }
}

describe('SAMPLE_REGISTRY', () => {
  it('has enough samples to make the gallery useful', () => {
    assert.ok(SAMPLE_REGISTRY.length >= 10, `Expected at least 10 samples, got ${SAMPLE_REGISTRY.length}`);
  });

  it('includes the core workflow samples', () => {
    [
      'project-workflow-core',
      'commercial-office-fitout',
      'water-treatment-pump-station',
      'ev-charging-depot',
    ].forEach(id => {
      assert.ok(getSampleById(id), `Expected workflow sample "${id}"`);
    });
  });

  it('each entry has required fields and a unique id', () => {
    const required = ['id', 'title', 'industry', 'description', 'tags', 'image', 'imageAlt', 'projectFile', 'pagesUsed', 'guidedChecklist'];
    const ids = new Set();
    SAMPLE_REGISTRY.forEach(sample => {
      required.forEach(field => {
        assert.ok(field in sample, `Sample "${sample.id}" missing field "${field}"`);
      });
      assert.ok(!ids.has(sample.id), `Duplicate sample id "${sample.id}"`);
      ids.add(sample.id);
      assert.ok(Array.isArray(sample.tags), `Sample "${sample.id}" tags must be array`);
      assert.ok(sample.tags.length > 0, `Sample "${sample.id}" tags must be non-empty`);
      assert.ok(Array.isArray(sample.pagesUsed), `Sample "${sample.id}" pagesUsed must be array`);
      assert.ok(sample.pagesUsed.length > 0, `Sample "${sample.id}" pagesUsed must be non-empty`);
      assert.ok(Array.isArray(sample.guidedChecklist), `Sample "${sample.id}" guidedChecklist must be array`);
      assert.ok(sample.guidedChecklist.length > 0, `Sample "${sample.id}" guidedChecklist must be non-empty`);
      assert.ok(sample.projectFile.startsWith('samples/'), `Sample "${sample.id}" projectFile should start with samples/`);
      assert.ok(sample.projectFile.endsWith('.json'), `Sample "${sample.id}" projectFile should end with .json`);
      assert.ok(sample.image.startsWith('assets/sample-projects/'), `Sample "${sample.id}" image should start with assets/sample-projects/`);
      assert.ok(/\.(jpg|jpeg|png|webp)$/i.test(sample.image), `Sample "${sample.id}" image should be a web image`);
      assert.ok(sample.imageAlt.length > 20, `Sample "${sample.id}" imageAlt should describe the thumbnail`);
    });
  });
});

describe('getSamplesByTag()', () => {
  it('returns non-empty array for "routing"', () => {
    const results = getSamplesByTag('routing');
    assert.ok(results.length > 0, 'Expected at least one sample with tag "routing"');
  });

  it('returns empty array for unknown tag', () => {
    const results = getSamplesByTag('nonexistent-tag-xyz');
    assert.deepStrictEqual(results, []);
  });
});

describe('getSampleById()', () => {
  it('returns the correct sample for "industrial-plant"', () => {
    const sample = getSampleById('industrial-plant');
    assert.ok(sample, 'Expected to find industrial-plant');
    assert.strictEqual(sample.id, 'industrial-plant');
    assert.strictEqual(sample.title, 'Industrial Plant');
  });

  it('returns undefined for a missing id', () => {
    assert.strictEqual(getSampleById('does-not-exist'), undefined);
  });
});

describe('validateSampleProject()', () => {
  const valid = {
    schemaVersion: 1,
    id: 'test',
    title: 'Test',
    cables: [],
    raceways: { trays: [], conduits: [], ductbanks: [] },
  };

  it('passes a valid minimal project', () => {
    const { valid: ok, errors } = validateSampleProject(valid);
    assert.strictEqual(ok, true, `Unexpected errors: ${errors.join(', ')}`);
    assert.deepStrictEqual(errors, []);
  });

  it('fails when cables is missing', () => {
    const { valid: ok, errors } = validateSampleProject({ ...valid, cables: undefined });
    assert.strictEqual(ok, false);
    assert.ok(errors.some(error => /cables/i.test(error)), `Expected cables error, got: ${errors.join(', ')}`);
  });

  it('fails when raceways are missing', () => {
    const { valid: ok, errors } = validateSampleProject({ ...valid, raceways: undefined });
    assert.strictEqual(ok, false);
    assert.ok(errors.some(error => /raceway/i.test(error)));
  });

  it('fails when schemaVersion is missing', () => {
    const { ...noVersion } = valid;
    delete noVersion.schemaVersion;
    const { valid: ok, errors } = validateSampleProject(noVersion);
    assert.strictEqual(ok, false);
    assert.ok(errors.some(error => /schemaVersion/i.test(error)));
  });

  it('fails for null input', () => {
    const { valid: ok } = validateSampleProject(null);
    assert.strictEqual(ok, false);
  });

  it('fails for empty object', () => {
    const { valid: ok, errors } = validateSampleProject({});
    assert.strictEqual(ok, false);
    assert.ok(errors.length > 0);
  });
});

describe('migrateSampleProject()', () => {
  it('returns unchanged object when already at current version', () => {
    const input = { schemaVersion: SCHEMA_VERSION, id: 'x', cables: [] };
    const result = migrateSampleProject(input);
    assert.strictEqual(result.schemaVersion, SCHEMA_VERSION);
    assert.strictEqual(result.id, 'x');
  });

  it('adds schemaVersion when absent', () => {
    const input = { id: 'x', cables: [] };
    const result = migrateSampleProject(input);
    assert.strictEqual(typeof result.schemaVersion, 'number');
    assert.strictEqual(result.schemaVersion, SCHEMA_VERSION);
  });

  it('does not mutate the input object', () => {
    const input = { id: 'x', cables: [] };
    migrateSampleProject(input);
    assert.strictEqual(input.schemaVersion, undefined);
  });
});

describe('sampleProjectToImportPayload()', () => {
  it('hydrates flat one-line connections onto source components', () => {
    const payload = sampleProjectToImportPayload({
      schemaVersion: 1,
      id: 'flat-links',
      title: 'Flat Links',
      cables: [],
      raceways: { trays: [], conduits: [], ductbanks: [] },
      oneline: {
        components: [
          { id: 'SRC', type: 'Source', label: 'Source' },
          { id: 'LOAD', type: 'Load', label: 'Load' },
        ],
        connections: [
          { from: 'SRC', to: 'LOAD', tag: 'FDR-1' },
        ],
      },
    });
    const [sheet] = payload.oneLine.sheets;
    assert.strictEqual(sheet.components[0].connections.length, 1);
    assert.deepStrictEqual(sheet.components[0].connections[0], { tag: 'FDR-1', target: 'LOAD' });
    assert.strictEqual(sheet.connections.length, 1);
  });

  it('does not duplicate component-owned connections', () => {
    const payload = sampleProjectToImportPayload({
      schemaVersion: 1,
      id: 'component-links',
      title: 'Component Links',
      cables: [],
      raceways: { trays: [], conduits: [], ductbanks: [] },
      oneLine: {
        activeSheet: 0,
        sheets: [
          {
            name: 'Main',
            components: [
              { id: 'SRC', type: 'Source', connections: [{ target: 'LOAD' }] },
              { id: 'LOAD', type: 'Load' },
            ],
            connections: [
              { from: 'SRC', to: 'LOAD' },
            ],
          },
        ],
      },
    });
    const [source] = payload.oneLine.sheets[0].components;
    assert.deepStrictEqual(source.connections, [{ target: 'LOAD' }]);
  });
});

describe('Sample JSON files', () => {
  SAMPLE_REGISTRY.forEach(sample => {
    const filePath = path.join(ROOT, sample.projectFile);

    it(`${sample.projectFile} exists and is valid JSON`, () => {
      assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
      const raw = fs.readFileSync(filePath, 'utf8');
      let parsed;
      try { parsed = JSON.parse(raw); } catch (err) { assert.fail(`Invalid JSON: ${err.message}`); }
      assert.ok(parsed, 'Parsed object must be truthy');
    });

    it(`${sample.projectFile} passes validateSampleProject`, () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = migrateSampleProject(JSON.parse(raw));
      const { valid, errors } = validateSampleProject(parsed);
      assert.ok(valid, `Validation failed for ${sample.id}: ${errors.join('; ')}`);
    });

    it(`${sample.projectFile} maps to a complete import payload`, () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = migrateSampleProject(JSON.parse(raw));
      const payload = sampleProjectToImportPayload(parsed);
      [
        'ductbanks',
        'conduits',
        'trays',
        'cables',
        'cableTypicals',
        'panels',
        'equipment',
        'loads',
        'mccLineups',
      ].forEach(key => {
        assert.ok(Array.isArray(payload[key]), `${sample.id} payload ${key} must be an array`);
      });
      assert.ok(payload.oneLine && Array.isArray(payload.oneLine.sheets), `${sample.id} payload oneLine must include sheets`);
      assert.ok(payload.settings && typeof payload.settings === 'object', `${sample.id} payload settings must be an object`);
    });
  });
});

describe('Workflow sample design basis', () => {
  [
    'project-workflow-core',
    'commercial-office-fitout',
    'water-treatment-pump-station',
    'ev-charging-depot',
  ].forEach(id => {
    it(`${id} includes design basis and gate approvals`, () => {
      const sample = getSampleById(id);
      const filePath = path.join(ROOT, sample.projectFile);
      const parsed = migrateSampleProject(JSON.parse(fs.readFileSync(filePath, 'utf8')));
      const payload = sampleProjectToImportPayload(parsed);
      assert.ok(payload.settings.designBasis && typeof payload.settings.designBasis === 'object', `${id} should include settings.designBasis`);
      assert.strictEqual(payload.settings.designBasis.codeBasis.primaryCode, 'NEC');
      assert.ok(payload.settings.designGateApprovals && typeof payload.settings.designGateApprovals === 'object', `${id} should include settings.designGateApprovals`);
    });
  });
});

describe('Coordination sample one-line', () => {
  it('maps flat sample links to rendered one-line connections', () => {
    const filePath = path.join(ROOT, 'samples/coordination-study.json');
    const parsed = migrateSampleProject(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    const payload = sampleProjectToImportPayload(parsed);
    const [sheet] = payload.oneLine.sheets;
    const componentLinks = sheet.components.flatMap(component =>
      (component.connections || []).map(connection => ({ from: component.id, to: connection.target })),
    );
    assert.strictEqual(sheet.connections.length, 9);
    assert.strictEqual(componentLinks.length, 9);
    assert.ok(componentLinks.some(connection => connection.from === 'UTIL-4KV' && connection.to === 'RELAY-51-1'));
  });

  it('links sample TCC devices to one-line components', () => {
    const filePath = path.join(ROOT, 'samples/coordination-study.json');
    const parsed = migrateSampleProject(JSON.parse(fs.readFileSync(filePath, 'utf8')));
    const payload = sampleProjectToImportPayload(parsed);
    const [sheet] = payload.oneLine.sheets;
    const relay = sheet.components.find(component => component.id === 'RELAY-51-1');
    const mainBreaker = sheet.components.find(component => component.id === 'BKR-4KV-F1');
    const fuse = sheet.components.find(component => component.id === 'FUSE-4KV-F2');
    assert.strictEqual(relay.tccId, 'iec_ei_relay');
    assert.strictEqual(mainBreaker.tccId, 'sample_mv_breaker_1200');
    assert.strictEqual(fuse.tccId, 'mv_fuse_65e');
    assert.ok(payload.settings.tccSettings.devices.includes('component:BKR-4KV-F1'));
    assert.strictEqual(payload.settings.tccSettings.componentOverrides['RELAY-51-1'].pickup, 400);
  });
});

describe('Sample thumbnail files', () => {
  SAMPLE_REGISTRY.forEach(sample => {
    it(`${sample.image} exists`, () => {
      const imagePath = path.join(ROOT, sample.image);
      assert.ok(fs.existsSync(imagePath), `Thumbnail not found: ${imagePath}`);
      const stat = fs.statSync(imagePath);
      assert.ok(stat.size > 20000, `${sample.image} should not be an empty placeholder`);
    });
  });
});

describe('samplegallery.html', () => {
  const htmlPath = path.join(ROOT, 'samplegallery.html');
  let html = '';
  try { html = fs.readFileSync(htmlPath, 'utf8'); } catch { /* assertions below report missing file */ }

  it('file exists', () => {
    assert.ok(fs.existsSync(htmlPath), 'samplegallery.html not found');
  });

  it('references dist/samplegallery.js', () => {
    assert.ok(html.includes('samplegallery.js'), 'Expected reference to samplegallery.js');
  });

  it('contains nav-links placeholder', () => {
    assert.ok(html.includes('id="nav-links"'), 'Expected nav-links element');
  });
});

describe('guidedChecklist step pages are within pagesUsed', () => {
  SAMPLE_REGISTRY.forEach(sample => {
    it(`${sample.id} checklist pages are in pagesUsed`, () => {
      sample.guidedChecklist.forEach(step => {
        const basePage = step.page.split(/[?#]/)[0];
        assert.ok(
          sample.pagesUsed.includes(basePage),
          `Step "${step.label}" page "${step.page}" not listed in pagesUsed for "${sample.id}"`,
        );
      });
    });
  });
});
