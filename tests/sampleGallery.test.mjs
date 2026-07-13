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
  getSampleProjectCopyName,
  getSamplesByTag,
  getSampleById,
  auditSampleDemonstration,
  validateSampleProject,
  migrateSampleProject,
  sampleProjectToImportPayload,
} from '../analysis/sampleGallery.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

describe('getSampleProjectCopyName()', () => {
  it('creates a named copy without colliding with saved projects', () => {
    assert.equal(getSampleProjectCopyName('Project Workflow Core', []), 'Project Workflow Core — Sample');
    assert.equal(
      getSampleProjectCopyName('Project Workflow Core', ['project workflow core — sample', 'Project Workflow Core — Sample (2)']),
      'Project Workflow Core — Sample (3)'
    );
  });
});

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
  it('normalizes legacy cable endpoints and raceway assignments for schedule pages', () => {
    const payload = sampleProjectToImportPayload({
      schemaVersion: 1,
      cables: [
        { id: 'CBL-1', from: 'SW-1', to: 'XFMR-1', route_preference: 'DB-1' },
      ],
      raceways: { trays: [], conduits: [], ductbanks: [] },
    });
    assert.deepStrictEqual(payload.cables[0], {
      id: 'CBL-1',
      tag: 'CBL-1',
      from: 'SW-1',
      from_tag: 'SW-1',
      to: 'XFMR-1',
      to_tag: 'XFMR-1',
      route_preference: 'DB-1',
      raceway_ids: ['DB-1'],
    });
  });

  it('renders multiline component descriptions with a readable separator', () => {
    const payload = sampleProjectToImportPayload({
      schemaVersion: 1,
      cables: [],
      raceways: { trays: [], conduits: [], ductbanks: [] },
      oneline: {
        components: [
          { id: 'SW-1', type: 'equipment', label: 'Substation\nSW-1 15 kV' },
        ],
        connections: [],
      },
    });
    assert.strictEqual(payload.equipment[0].description, 'Substation — SW-1 15 kV');
    assert.ok(!payload.equipment[0].description.includes('â'));
  });

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

    it(`${sample.projectFile} contains adequate demonstration data`, () => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = migrateSampleProject(JSON.parse(raw));
      const audit = auditSampleDemonstration(sample, parsed);
      assert.ok(audit.adequate, `${sample.id} demonstration gaps: ${audit.errors.join('; ')}`);
    });
  });
});

describe('Legacy specialist sample enrichment', () => {
  ['industrial-plant', 'data-center', 'substation-grounding', 'heat-trace-pipe', 'ductbank-network', 'coordination-study'].forEach(id => {
    it(`${id} imports equipment, loads, study seeds, and routed results`, () => {
      const sample = getSampleById(id);
      const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, sample.projectFile), 'utf8'));
      const payload = sampleProjectToImportPayload(parsed);
      assert.ok(payload.equipment.length >= 2, `${id} should expose derived equipment records`);
      if (sample.pagesUsed.includes('loadlist.html')) {
        assert.ok(payload.loads.length >= 1, `${id} should expose derived load records`);
      }
      assert.ok(Object.keys(payload.settings.studyResults).length >= 1, `${id} should expose study data`);
      assert.ok(payload.settings.latestRouteResults.batchResults.length >= 1, `${id} should expose route results`);
    });
  });

  it('keeps the Underground Ductbank schedules and one-line tied to the same records', () => {
    const sample = getSampleById('ductbank-network');
    const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, sample.projectFile), 'utf8'));
    const payload = sampleProjectToImportPayload(parsed);
    const equipmentTags = new Set(payload.equipment.map(row => row.tag));
    const loadTags = new Set(payload.loads.map(row => row.tag));
    const components = payload.oneLine.sheets.flatMap(sheet => sheet.components || []);

    assert.strictEqual(payload.equipment.length, 5);
    assert.strictEqual(payload.loads.length, 3);
    assert.ok(payload.cables.every(cable => equipmentTags.has(cable.from_tag) && equipmentTags.has(cable.to_tag)));
    assert.ok(payload.cables.every(cable => cable.est_load > 0 && cable.raceway_ids.length === 1));
    assert.ok(payload.loads.every(load => equipmentTags.has(load.source)));
    const loadsBySource = new Map(payload.loads.map(load => [load.source, load]));
    payload.cables.forEach(cable => {
      const load = loadsBySource.get(cable.to_tag);
      const expectedCurrent = (Number(load.kw) * 1000)
        / (Math.sqrt(3) * Number(load.voltage) * Number(load.powerFactor));
      assert.ok(Math.abs(cable.est_load - expectedCurrent) < 1, `${cable.tag} current should match its Load List demand`);
    });
    assert.ok([...loadTags].every(tag => components.some(component => component.loadRef === tag)));
    assert.ok(payload.ductbanks.every(row => row.tag && row.from && row.to && row.concrete_encasement));
    assert.strictEqual(components.flatMap(component => component.connections || []).length, 3);
    const sources = components.filter(component => component.type === 'source');
    sources.forEach(source => {
      source.connections.forEach(connection => {
        const target = components.find(component => component.id === connection.target);
        assert.ok(target, `${source.id} connection target should exist`);
        assert.strictEqual(connection.sourcePort, 0);
        assert.strictEqual(connection.targetPort, 0);
        assert.strictEqual(connection.dir, 'v');
        assert.ok(source.y < target.y, `${source.id} should be above ${target.id} for vertical one-line orientation`);
        assert.strictEqual(target.rotation, 0);
      });
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
